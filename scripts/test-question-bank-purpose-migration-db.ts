import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import pg from "pg";

const { Client } = pg;
const TEST_DATABASE_ENV = "QUESTION_BANK_PURPOSE_MIGRATION_TEST_DATABASE_URL";
const migrationSql = await readFile(new URL("../prisma/migrations/20260902090000_add_question_bank_purpose/migration.sql", import.meta.url), "utf8");

function connectionIdentity(raw: string) {
  const parsed = new URL(raw);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  return {
    databaseName,
    host: ["localhost", "127.0.0.1", "::1"].includes(hostname) ? "local" : hostname,
    port: Number(parsed.port || "5432"),
    protocol: parsed.protocol,
    userName: decodeURIComponent(parsed.username),
  };
}

function assertDisposableDatabase(raw: string, runtimeRaw?: string) {
  const identity = connectionIdentity(raw);
  const runtime = runtimeRaw ? connectionIdentity(runtimeRaw) : null;
  const sameDatabase = runtime
    && runtime.host === identity.host
    && runtime.port === identity.port
    && runtime.databaseName === identity.databaseName
    && runtime.userName === identity.userName;
  assert.ok(["postgres:", "postgresql:"].includes(identity.protocol), `${TEST_DATABASE_ENV} must use a PostgreSQL URL.`);
  assert.equal(identity.host, "local", `${TEST_DATABASE_ENV} must use localhost, 127.0.0.1, or ::1.`);
  assert.match(identity.databaseName, /(?:purpose|migration|test)/iu, `${TEST_DATABASE_ENV} must name a disposable test database.`);
  assert.ok(!sameDatabase, `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function createFixture(client: pg.Client, schemaName: string, withRow: boolean) {
  const schema = quoteIdentifier(schemaName);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}, public`);
  await client.query(
    `CREATE TABLE question_banks (
       id uuid PRIMARY KEY,
       status text NOT NULL DEFAULT 'draft'
     )`,
  );
  if (withRow) await client.query("INSERT INTO question_banks (id) VALUES ($1::uuid)", [randomUUID()]);
}

async function runMigration(client: pg.Client, schemaName: string) {
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
  try {
    await client.query(migrationSql);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function purposeObjects(client: pg.Client, schemaName: string) {
  const result = await client.query<{
    column_exists: boolean;
    enum_exists: boolean;
    function_exists: boolean;
    index_exists: boolean;
    trigger_exists: boolean;
  }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'question_banks' AND column_name = 'purpose'
       ) AS column_exists,
       EXISTS (
         SELECT 1 FROM pg_type type
         JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
          WHERE namespace.nspname = $1 AND type.typname = 'question_bank_purpose'
       ) AS enum_exists,
       EXISTS (
         SELECT 1 FROM pg_proc proc
         JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
          WHERE namespace.nspname = $1 AND proc.proname = 'assessment_reject_question_bank_purpose_update'
       ) AS function_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND tablename = 'question_banks' AND indexname = 'question_banks_purpose_status_idx'
       ) AS index_exists,
       EXISTS (
         SELECT 1 FROM pg_trigger tg
         JOIN pg_class relation ON relation.oid = tg.tgrelid
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = $1 AND relation.relname = 'question_banks' AND tg.tgname = 'question_bank_purpose_immutable'
       ) AS trigger_exists`,
    [schemaName],
  );
  return result.rows[0];
}

async function dropFixture(client: pg.Client, schemaName: string) {
  await client.query("SET search_path TO public");
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
}

async function main() {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Question-bank purpose migration DB contract skipped: ${TEST_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return;
  }
  assertDisposableDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim());

  const client = new Client({ connectionString: rawDatabaseUrl });
  const emptySchema = `purpose_migration_empty_${randomUUID().replaceAll("-", "")}`;
  const nonEmptySchema = `purpose_migration_nonempty_${randomUUID().replaceAll("-", "")}`;
  let connected = false;
  try {
    await client.connect();
    connected = true;

    await createFixture(client, emptySchema, false);
    await runMigration(client, emptySchema);
    assert.deepEqual(await purposeObjects(client, emptySchema), {
      column_exists: true,
      enum_exists: true,
      function_exists: true,
      index_exists: true,
      trigger_exists: true,
    }, "empty question-bank migration must apply every purpose object");
    await client.query(
      "INSERT INTO question_banks (id, purpose) VALUES ($1::uuid, 'quiz'::question_bank_purpose)",
      [randomUUID()],
    );
    await assert.rejects(
      client.query("UPDATE question_banks SET purpose = 'tryout'::question_bank_purpose"),
      /question bank purpose is immutable/u,
    );
    const immutableRow = await client.query<{ purpose: string }>("SELECT purpose::text FROM question_banks LIMIT 1");
    assert.equal(immutableRow.rows[0]?.purpose, "quiz", "purpose trigger must preserve the original purpose");

    await createFixture(client, nonEmptySchema, true);
    await assert.rejects(
      runMigration(client, nonEmptySchema),
      /question_banks is not empty/u,
    );
    assert.deepEqual(await purposeObjects(client, nonEmptySchema), {
      column_exists: false,
      enum_exists: false,
      function_exists: false,
      index_exists: false,
      trigger_exists: false,
    }, "a non-empty migration failure must leave no partial purpose DDL");
    await client.query("DELETE FROM question_banks");
    await runMigration(client, nonEmptySchema);
    assert.deepEqual(await purposeObjects(client, nonEmptySchema), {
      column_exists: true,
      enum_exists: true,
      function_exists: true,
      index_exists: true,
      trigger_exists: true,
    }, "the purpose migration must succeed when retried after the precondition is cleared");

    console.log("Question-bank purpose migration DB contract passed.");
  } finally {
    if (connected) {
      try {
        await dropFixture(client, emptySchema);
        await dropFixture(client, nonEmptySchema);
      } finally {
        await client.end();
      }
    }
  }
}

await main();
