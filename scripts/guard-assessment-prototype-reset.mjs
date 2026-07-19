import "dotenv/config";

import path from "node:path";
import pg from "pg";

import { MUST_BE_EMPTY_TABLES, PRESERVED_TABLES, PROTOTYPE_ITEMS, PROTOTYPE_QUIZ } from "./assessment-prototype-reset-manifest.mjs";

const { Client } = pg;
const EXIT_BLOCKED = 2;
const EXIT_ERROR = 3;
const FENCE_FUNCTION = "assessment_prototype_reset_block_write";
const PERFORMANCE_FENCE_FUNCTION = "assessment_prototype_reset_block_tryout_reference";
const FENCE_TABLES = ["standalone_quizzes", "standalone_quiz_items", ...MUST_BE_EMPTY_TABLES].sort();
const LOCK_TABLES = [...new Set([...FENCE_TABLES, "student_subtest_performance", ...PRESERVED_TABLES])].sort();

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required.");
  return value;
}

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("Schema must be a simple PostgreSQL identifier.");
  return `"${value}"`;
}

function table(schema, name) {
  return `${identifier(schema)}.${identifier(name)}`;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function inspect(client, schema) {
  const roots = await client.query(`SELECT id::text AS id, slug FROM ${table(schema, "standalone_quizzes")} ORDER BY id`);
  const items = await client.query(`SELECT id::text AS id, quiz_id::text AS quiz_id, sort_order, source_id FROM ${table(schema, "standalone_quiz_items")} ORDER BY sort_order, id`);
  const emptyResult = await client.query(`SELECT table_name, json_agg(id ORDER BY id) AS ids FROM (${MUST_BE_EMPTY_TABLES.map((name) => `SELECT '${name}'::text AS table_name, id::text AS id FROM ${table(schema, name)}`).join(" UNION ALL ")}) rows GROUP BY table_name`);
  const performanceRows = await client.query(`SELECT id::text AS id, last_tryout_session_id::text AS last_tryout_session_id FROM ${table(schema, "student_subtest_performance")} WHERE last_tryout_session_id IS NOT NULL ORDER BY id`);
  const preservedResult = await client.query(PRESERVED_TABLES.map((name) => `SELECT '${name}'::text AS table_name, COUNT(*)::int AS count, COALESCE(md5(string_agg(to_jsonb(row)::text, E'\\n' ORDER BY to_jsonb(row)::text)), 'empty') AS checksum FROM ${table(schema, name)} row`).join(" UNION ALL "));

  const mustBeEmpty = Object.fromEntries(MUST_BE_EMPTY_TABLES.map((name) => [name, []]));
  for (const row of emptyResult.rows) mustBeEmpty[row.table_name] = row.ids;
  const preserved = Object.fromEntries(preservedResult.rows.map((row) => [row.table_name, { checksum: row.checksum, count: row.count }]));
  const actualItems = items.rows.map((row) => ({ id: row.id, quizId: row.quiz_id, sortOrder: row.sort_order, sourceId: row.source_id }));
  const expectedItems = PROTOTYPE_ITEMS.map((item) => ({ ...item, quizId: PROTOTYPE_QUIZ.id }));
  const emptyState = roots.rows.length === 0 && actualItems.length === 0;
  const exactPrototype = stable(roots.rows) === stable([PROTOTYPE_QUIZ]) && stable(actualItems) === stable(expectedItems);
  const violations = [];
  if (!emptyState && !exactPrototype) violations.push({ code: "allowlist_mismatch", roots: roots.rows, items: actualItems });
  for (const [name, ids] of Object.entries(mustBeEmpty)) if (ids.length) violations.push({ code: "must_be_empty", ids, table: name });
  if (performanceRows.rows.length) violations.push({ code: "tryout_performance_reference", rows: performanceRows.rows });

  return {
    allowedState: violations.length === 0 ? (emptyState ? "already_empty" : "exact_prototype") : "blocked",
    counts: {
      mustBeEmpty: Object.fromEntries(Object.entries(mustBeEmpty).map(([name, ids]) => [name, ids.length])),
      standaloneQuizItems: actualItems.length,
      standaloneQuizzes: roots.rows.length,
    },
    manifest: { itemCount: PROTOTYPE_ITEMS.length, root: PROTOTYPE_QUIZ },
    mustBeEmpty,
    performanceReferences: performanceRows.rows,
    preserved,
    prototype: { items: actualItems, roots: roots.rows },
    violations,
  };
}

function fenceTriggerName(name) {
  return `assessment_prototype_reset_fence_${name}`;
}

async function lockManifestTables(client, schema) {
  // Trigger installation is part of the same critical section. ACCESS EXCLUSIVE is
  // deliberately held only for this maintenance transaction so queued legacy writes
  // cannot slip between postcondition proof and the persistent trigger fence.
  await client.query(`LOCK TABLE ${LOCK_TABLES.map((name) => table(schema, name)).join(", ")} IN ACCESS EXCLUSIVE MODE`);
  return LOCK_TABLES;
}

async function fenceStatus(client, schema) {
  const result = await client.query(
    `SELECT classes.relname AS trigger_table, triggers.tgname AS trigger_name, procedures.proname AS function_name
     FROM pg_trigger triggers
     JOIN pg_class classes ON classes.oid = triggers.tgrelid
     JOIN pg_namespace namespaces ON namespaces.oid = classes.relnamespace
     JOIN pg_proc procedures ON procedures.oid = triggers.tgfoid
     WHERE namespaces.nspname = $1
       AND ((classes.relname = ANY($2::text[]) AND triggers.tgname = ANY($3::text[]))
         OR (classes.relname = 'student_subtest_performance' AND triggers.tgname = 'assessment_prototype_reset_fence_tryout_reference'))
       AND NOT triggers.tgisinternal
     ORDER BY classes.relname, triggers.tgname`,
    [schema, FENCE_TABLES, FENCE_TABLES.map(fenceTriggerName)],
  );
  const expected = [
    ...FENCE_TABLES.map((name) => ({ functionName: FENCE_FUNCTION, triggerName: fenceTriggerName(name), triggerTable: name })),
    { functionName: PERFORMANCE_FENCE_FUNCTION, triggerName: "assessment_prototype_reset_fence_tryout_reference", triggerTable: "student_subtest_performance" },
  ].sort((left, right) => stable(left).localeCompare(stable(right)));
  const actual = result.rows.map((row) => ({ functionName: row.function_name, triggerName: row.trigger_name, triggerTable: row.trigger_table })).sort((left, right) => stable(left).localeCompare(stable(right)));
  return { installed: stable(actual) === stable(expected), triggers: actual };
}

async function installFence(client, schema) {
  await client.query(`CREATE OR REPLACE FUNCTION ${table(schema, FENCE_FUNCTION)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'assessment prototype reset fence blocks % on %', TG_OP, TG_TABLE_NAME USING ERRCODE = '55000'; END; $$`);
  await client.query(`CREATE OR REPLACE FUNCTION ${table(schema, PERFORMANCE_FENCE_FUNCTION)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.last_tryout_session_id IS NOT NULL THEN RAISE EXCEPTION 'assessment prototype reset fence blocks Tryout performance references' USING ERRCODE = '55000'; END IF; RETURN NEW; END; $$`);
  for (const name of FENCE_TABLES) {
    const triggerName = fenceTriggerName(name);
    const exists = await client.query(`SELECT 1 FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2 AND NOT tgisinternal`, [table(schema, name), triggerName]);
    if (!exists.rowCount) await client.query(`CREATE TRIGGER ${identifier(triggerName)} BEFORE INSERT OR UPDATE OR DELETE ON ${table(schema, name)} FOR EACH ROW EXECUTE FUNCTION ${table(schema, FENCE_FUNCTION)}()`);
  }
  const referenceTrigger = "assessment_prototype_reset_fence_tryout_reference";
  const referenceExists = await client.query(`SELECT 1 FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2 AND NOT tgisinternal`, [table(schema, "student_subtest_performance"), referenceTrigger]);
  if (!referenceExists.rowCount) await client.query(`CREATE TRIGGER ${identifier(referenceTrigger)} BEFORE INSERT OR UPDATE OF last_tryout_session_id ON ${table(schema, "student_subtest_performance")} FOR EACH ROW EXECUTE FUNCTION ${table(schema, PERFORMANCE_FENCE_FUNCTION)}()`);
  const status = await fenceStatus(client, schema);
  if (!status.installed) throw new Error("Assessment reset write fence could not be verified.");
  return status;
}

function assertAllowed(inspection) {
  if (inspection.allowedState === "blocked") {
    const error = new Error("Assessment prototype reset guard is blocked.");
    error.code = "BLOCKED";
    error.inspection = inspection;
    throw error;
  }
}

async function runGuard({ apply = false, connectionString = databaseUrl(), schema = "public" } = {}) {
  const client = new Client({ connectionString });
  await client.connect();
  let started = false;
  try {
    await client.query(apply ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    started = true;
    if (!apply) {
      const readOnly = await client.query("SHOW transaction_read_only");
      if (readOnly.rows[0]?.transaction_read_only !== "on") throw new Error("Read-only reset guard transaction could not be established.");
    }
    const locks = apply ? await lockManifestTables(client, schema) : [];
    const before = await inspect(client, schema);
    assertAllowed(before);
    if (!apply) {
      await client.query("ROLLBACK");
      started = false;
      return { ...before, applied: false, fence: { installed: false, triggers: [] }, lockedTables: locks, mode: "read_only", transaction: { isolation: "repeatable read", readOnly: true } };
    }
    if (before.allowedState === "exact_prototype") {
      await client.query(`DELETE FROM ${table(schema, "standalone_quizzes")} WHERE id = $1`, [PROTOTYPE_QUIZ.id]);
    }
    const after = await inspect(client, schema);
    if (after.allowedState !== "already_empty" || stable(before.preserved) !== stable(after.preserved)) {
      const error = new Error("Reset postcondition failed; transaction will roll back.");
      error.code = "POSTCONDITION";
      error.inspection = { after, before };
      throw error;
    }
    const fence = await installFence(client, schema);
    await client.query("COMMIT");
    started = false;
    return { after, applied: true, before, fence, lockedTables: locks, mode: "apply", transaction: { isolation: "read committed", readOnly: false } };
  } catch (error) {
    if (started) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

function parseArgs(args) {
  let apply = false;
  let schema = "public";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--apply") apply = true;
    else if (args[index] === "--schema" && args[index + 1]) schema = args[++index];
    else throw new Error(`Unknown or incomplete argument: ${args[index]}`);
  }
  return { apply, schema };
}

async function main() {
  const report = await runGuard(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    const blocked = error?.code === "BLOCKED";
    process.stdout.write(`${JSON.stringify({ error: error.message, inspection: error.inspection ?? null, status: blocked ? "blocked" : "error" }, null, 2)}\n`);
    process.exitCode = blocked ? EXIT_BLOCKED : EXIT_ERROR;
  });
}

export { EXIT_BLOCKED, EXIT_ERROR, FENCE_TABLES, LOCK_TABLES, fenceStatus, inspect, runGuard };
