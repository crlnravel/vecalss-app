import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { MUST_BE_EMPTY_TABLES, PRESERVED_TABLES, PROTOTYPE_ITEMS, PROTOTYPE_QUIZ } from "./assessment-prototype-reset-manifest.mjs";
import { fenceStatus, runGuard } from "./guard-assessment-prototype-reset.mjs";

const { Client } = pg;
let schema = `assessment_reset_race_${randomUUID().replaceAll("-", "")}`;
const schemas = [];
const mode = process.argv[2] ?? "all";
const q = (value) => `"${value}"`;
const table = (name) => `${q(schema)}.${q(name)}`;

async function seed(client) {
  const cleared = ["standalone_quiz_items", "standalone_quizzes", ...MUST_BE_EMPTY_TABLES, "student_subtest_performance", ...PRESERVED_TABLES];
  await client.query(cleared.map((name) => `DELETE FROM ${table(name)}`).join(";"));
  await client.query([...PRESERVED_TABLES.map((name) => `INSERT INTO ${table(name)} (id, label) VALUES ('${name}-preserved', '${name}')`), `INSERT INTO ${table("student_subtest_performance")} VALUES ('performance-1', NULL)`].join(";"));
  await client.query(`INSERT INTO ${table("standalone_quizzes")} VALUES ($1, $2)`, [PROTOTYPE_QUIZ.id, PROTOTYPE_QUIZ.slug]);
  await client.query(`INSERT INTO ${table("standalone_quiz_items")} (id, quiz_id, sort_order, source_id) VALUES ${PROTOTYPE_ITEMS.map((_, index) => `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`).join(", ")}`, PROTOTYPE_ITEMS.flatMap((item) => [item.id, PROTOTYPE_QUIZ.id, item.sortOrder, item.sourceId]));
}

async function setup(client) {
  schemas.push(schema);
  await client.query([
    `CREATE SCHEMA ${q(schema)}`,
    `CREATE TABLE ${table("standalone_quizzes")} (id text PRIMARY KEY, slug text NOT NULL)`,
    `CREATE TABLE ${table("standalone_quiz_items")} (id text PRIMARY KEY, quiz_id text NOT NULL REFERENCES ${table("standalone_quizzes")}(id) ON DELETE CASCADE, sort_order integer NOT NULL, source_id text NOT NULL)`,
    ...MUST_BE_EMPTY_TABLES.map((name) => `CREATE TABLE ${table(name)} (id text PRIMARY KEY)`),
    `CREATE TABLE ${table("student_subtest_performance")} (id text PRIMARY KEY, last_tryout_session_id text)`,
    ...PRESERVED_TABLES.map((name) => `CREATE TABLE ${table(name)} (id text PRIMARY KEY, label text NOT NULL)`),
  ].join(";"));
}

async function main() {
  const fixture = new Client({ connectionString: process.env.DATABASE_URL });
  await fixture.connect();
  try {
    await setup(fixture);
    if (mode !== "post") {
      await seed(fixture);
      const beforeLockWriter = new Client({ connectionString: process.env.DATABASE_URL });
      await beforeLockWriter.connect();
      await beforeLockWriter.query("BEGIN");
      await beforeLockWriter.query(`INSERT INTO ${table("standalone_quizzes")} VALUES ('unknown-before-lock', 'unknown')`);
      const blockedApply = runGuard({ apply: true, schema });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await beforeLockWriter.query("COMMIT");
      await assert.rejects(blockedApply, (error) => error.code === "BLOCKED", "writer committed before locks must be visible to the apply inspection");
      await beforeLockWriter.end();
      assert.equal((await fenceStatus(fixture, schema)).installed, false, "blocked apply must roll back without a partial fence");
      console.log("pre-lock writer regression passed");
      if (mode === "pre") return;
      await fixture.query(`DROP SCHEMA ${q(schema)} CASCADE`);
      schema = `assessment_reset_race_${randomUUID().replaceAll("-", "")}`;
      await setup(fixture);
    }
    await seed(fixture);
    await fixture.query(`CREATE FUNCTION ${table("pause_reset_delete")}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN OLD; END; $$; CREATE TRIGGER pause_reset_delete BEFORE DELETE ON ${table("standalone_quizzes")} FOR EACH ROW EXECUTE FUNCTION ${table("pause_reset_delete")}()`);
    const apply = runGuard({ apply: true, schema });
    let locksObserved = false;
    for (let attempt = 0; attempt < 250 && !locksObserved; attempt += 1) {
      const locks = await fixture.query(`SELECT 1 FROM pg_locks locks JOIN pg_class classes ON classes.oid = locks.relation JOIN pg_namespace namespaces ON namespaces.oid = classes.relnamespace WHERE namespaces.nspname = $1 AND classes.relname = 'standalone_quizzes' AND locks.mode = 'AccessExclusiveLock' AND locks.granted`, [schema]);
      locksObserved = locks.rowCount > 0;
      if (!locksObserved) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(locksObserved, true, "apply must acquire database table locks before inspecting/deleting");
    const assessmentWriter = new Client({ connectionString: process.env.DATABASE_URL });
    const preservedWriter = new Client({ connectionString: process.env.DATABASE_URL });
    await assessmentWriter.connect(); await preservedWriter.connect();
    const blockedWrite = assessmentWriter.query(`INSERT INTO ${table("standalone_quizzes")} VALUES ('unknown-after-lock', 'unknown')`);
    const delayedPreservedWrite = preservedWriter.query(`UPDATE ${table("topics")} SET label = 'changed-after-commit' WHERE id = 'topics-preserved'`);
    let writeSettled = false;
    blockedWrite.finally(() => { writeSettled = true; }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(writeSettled, false, "writers begun after locks must wait until reset commits");
    const result = await apply;
    assert.equal(result.fence.installed, true, "apply must report a verified persistent fence");
    await assert.rejects(blockedWrite, (error) => error.code === "55000", "waiting assessment writer must fail against committed fence");
    await delayedPreservedWrite;
    assert.deepEqual(result.before.preserved, result.after.preserved, "preserved proof is taken while preserved writers are locked out");
    assert.equal((await fixture.query(`SELECT label FROM ${table("topics")} WHERE id = 'topics-preserved'`)).rows[0].label, "changed-after-commit", "preserved writer runs only after reset commit");
    await assessmentWriter.end(); await preservedWriter.end();
    console.log("Assessment prototype reset concurrency regressions passed with real PostgreSQL connections.");
  } finally {
    for (const name of schemas) await fixture.query(`DROP SCHEMA IF EXISTS ${q(name)} CASCADE`);
    await fixture.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
