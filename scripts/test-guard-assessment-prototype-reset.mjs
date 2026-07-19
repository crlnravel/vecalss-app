import "dotenv/config";

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

import { MUST_BE_EMPTY_TABLES, PRESERVED_TABLES, PROTOTYPE_ITEMS, PROTOTYPE_QUIZ } from "./assessment-prototype-reset-manifest.mjs";
import { inspect } from "./guard-assessment-prototype-reset.mjs";

const { Client } = pg;
const schema = `assessment_reset_${randomUUID().replaceAll("-", "")}`;
const q = (value) => `"${value}"`;
const table = (name) => `${q(schema)}.${q(name)}`;

function cli(...args) {
  const result = spawnSync(process.execPath, ["scripts/guard-assessment-prototype-reset.mjs", "--schema", schema, ...args], {
    cwd: process.cwd(), encoding: "utf8", env: process.env,
  });
  return { code: result.status, json: JSON.parse(result.stdout), stderr: result.stderr };
}

async function resetFixture(client, { prototype = true } = {}) {
  for (const name of ["standalone_quiz_items", "standalone_quizzes", ...MUST_BE_EMPTY_TABLES, "student_subtest_performance", ...PRESERVED_TABLES]) {
    await client.query(`DELETE FROM ${table(name)}`);
  }
  for (const name of PRESERVED_TABLES) await client.query(`INSERT INTO ${table(name)} (id, label) VALUES ($1, $2)`, [`${name}-preserved`, name]);
  await client.query(`INSERT INTO ${table("student_subtest_performance")} (id, last_tryout_session_id) VALUES ('performance-1', NULL)`);
  if (!prototype) return;
  await client.query(`INSERT INTO ${table("standalone_quizzes")} (id, slug) VALUES ($1, $2)`, [PROTOTYPE_QUIZ.id, PROTOTYPE_QUIZ.slug]);
  for (const item of PROTOTYPE_ITEMS) {
    await client.query(`INSERT INTO ${table("standalone_quiz_items")} (id, quiz_id, sort_order, source_id) VALUES ($1, $2, $3, $4)`, [item.id, PROTOTYPE_QUIZ.id, item.sortOrder, item.sourceId]);
  }
}

async function count(client, name) {
  return Number((await client.query(`SELECT COUNT(*)::int AS count FROM ${table(name)}`)).rows[0].count);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${q(schema)}`);
    await client.query(`CREATE TABLE ${table("standalone_quizzes")} (id text PRIMARY KEY, slug text NOT NULL)`);
    await client.query(`CREATE TABLE ${table("standalone_quiz_items")} (id text PRIMARY KEY, quiz_id text NOT NULL REFERENCES ${table("standalone_quizzes")}(id) ON DELETE CASCADE, sort_order integer NOT NULL, source_id text NOT NULL)`);
    for (const name of MUST_BE_EMPTY_TABLES) await client.query(`CREATE TABLE ${table(name)} (id text PRIMARY KEY)`);
    await client.query(`CREATE TABLE ${table("student_subtest_performance")} (id text PRIMARY KEY, last_tryout_session_id text)`);
    for (const name of PRESERVED_TABLES) await client.query(`CREATE TABLE ${table(name)} (id text PRIMARY KEY, label text NOT NULL)`);

    await resetFixture(client);
    const readOne = cli();
    const readTwo = cli();
    assert.equal(readOne.code, 0); assert.deepEqual(readOne.json, readTwo.json, "read-only CLI JSON must be deterministic");
    assert.equal(readOne.json.allowedState, "exact_prototype"); assert.equal(await count(client, "standalone_quizzes"), 1, "default command must not delete");

    await client.query(`DELETE FROM ${table("standalone_quiz_items")} WHERE id = $1`, [PROTOTYPE_ITEMS[0].id]);
    assert.equal(cli("--apply").code, 2, "partial child fixture must fail closed before apply");
    assert.equal(await count(client, "standalone_quizzes"), 1, "blocked apply must roll back before root deletion");

    await resetFixture(client);
    await client.query(`UPDATE ${table("standalone_quiz_items")} SET source_id = 'wrong' WHERE id = $1`, [PROTOTYPE_ITEMS[1].id]);
    assert.equal((await inspect(client, schema)).allowedState, "blocked", "wrong child identity must fail closed");

    await resetFixture(client, { prototype: false });
    await client.query(`INSERT INTO ${table("standalone_quizzes")} VALUES ('unknown-root', 'unknown')`);
    assert.equal(cli().code, 2, "unknown root must fail closed through the CLI");

    await resetFixture(client);
    for (const name of MUST_BE_EMPTY_TABLES) await client.query(`INSERT INTO ${table(name)} (id) VALUES ($1)`, [`${name}-row`]);
    const mustEmptyInspection = await inspect(client, schema);
    assert.equal(mustEmptyInspection.allowedState, "blocked");
    assert.deepEqual(mustEmptyInspection.violations.filter((entry) => entry.code === "must_be_empty").map((entry) => entry.table), MUST_BE_EMPTY_TABLES, "each must-empty class must be surfaced by real SQL");
    assert.equal(await count(client, "standalone_quizzes"), 1, "must-empty guard must preserve root");

    await resetFixture(client);
    await client.query(`UPDATE ${table("student_subtest_performance")} SET last_tryout_session_id = 'session-1' WHERE id = 'performance-1'`);
    assert.equal((await inspect(client, schema)).allowedState, "blocked", "non-null Tryout performance reference must block reset");

    await resetFixture(client);
    const before = cli();
    const applied = cli("--apply");
    assert.equal(applied.code, 0); assert.equal(applied.json.after.allowedState, "already_empty");
    assert.equal(await count(client, "standalone_quizzes"), 0); assert.equal(await count(client, "standalone_quiz_items"), 0, "children must disappear only through FK cascade");
    assert.deepEqual(applied.json.before.preserved, applied.json.after.preserved, "Module Quiz/shared checksums must not change");
    assert.equal(before.json.preserved.quiz_items.count, 1, "Module Quiz table must be preserved, not classified disposable");
    assert.equal(cli("--apply").code, 0, "already-empty apply rerun must be idempotent");

    const source = await readFile(path.join(process.cwd(), "scripts/guard-assessment-prototype-reset.mjs"), "utf8");
    assert.match(source, /DELETE FROM \$\{table\(schema, "standalone_quizzes"\)\} WHERE id = \$1/);
    assert.doesNotMatch(source, /DELETE FROM \$\{table\(schema, "standalone_quiz_items"\)/);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i, "guard source must never issue TRUNCATE");
    console.log("Assessment prototype reset guard database/CLI fixtures passed.");
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${q(schema)} CASCADE`);
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
