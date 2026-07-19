import "dotenv/config";

import path from "node:path";
import pg from "pg";

import { MUST_BE_EMPTY_TABLES, PRESERVED_TABLES, PROTOTYPE_ITEMS, PROTOTYPE_QUIZ } from "./assessment-prototype-reset-manifest.mjs";

const { Client } = pg;
const EXIT_BLOCKED = 2;
const EXIT_ERROR = 3;

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

async function rowInventory(client, schema, name) {
  return (await client.query(`SELECT id::text AS id FROM ${table(schema, name)} ORDER BY id`)).rows.map((row) => row.id);
}

async function checksum(client, schema, name) {
  const result = await client.query(`SELECT COUNT(*)::int AS count, COALESCE(md5(string_agg(to_jsonb(row)::text, E'\\n' ORDER BY to_jsonb(row)::text)), 'empty') AS checksum FROM ${table(schema, name)} row`);
  return result.rows[0];
}

async function inspect(client, schema) {
  const roots = await client.query(`SELECT id::text AS id, slug FROM ${table(schema, "standalone_quizzes")} ORDER BY id`);
  const items = await client.query(`SELECT id::text AS id, quiz_id::text AS quiz_id, sort_order, source_id FROM ${table(schema, "standalone_quiz_items")} ORDER BY sort_order, id`);
  const emptyRows = [];
  for (const name of MUST_BE_EMPTY_TABLES) emptyRows.push([name, await rowInventory(client, schema, name)]);
  const performanceRows = await client.query(`SELECT id::text AS id, last_tryout_session_id::text AS last_tryout_session_id FROM ${table(schema, "student_subtest_performance")} WHERE last_tryout_session_id IS NOT NULL ORDER BY id`);
  const preservedRows = [];
  for (const name of PRESERVED_TABLES) preservedRows.push([name, await checksum(client, schema, name)]);

  const mustBeEmpty = Object.fromEntries(emptyRows);
  const preserved = Object.fromEntries(preservedRows);
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
    await client.query(apply ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    started = true;
    if (!apply) {
      const readOnly = await client.query("SHOW transaction_read_only");
      if (readOnly.rows[0]?.transaction_read_only !== "on") throw new Error("Read-only reset guard transaction could not be established.");
    }
    const before = await inspect(client, schema);
    assertAllowed(before);
    if (!apply) {
      await client.query("ROLLBACK");
      started = false;
      return { ...before, applied: false, mode: "read_only", transaction: { isolation: "repeatable read", readOnly: true } };
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
    await client.query("COMMIT");
    started = false;
    return { after, applied: true, before, mode: "apply", transaction: { isolation: "repeatable read", readOnly: false } };
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

export { EXIT_BLOCKED, EXIT_ERROR, inspect, runGuard };
