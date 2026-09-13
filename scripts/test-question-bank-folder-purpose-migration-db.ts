import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import pg from "pg";

const { Client } = pg;
const TEST_DATABASE_ENV = "QUESTION_BANK_FOLDER_PURPOSE_MIGRATION_TEST_DATABASE_URL";
const migrationSql = await readFile(new URL("../prisma/migrations/20260912170000_scope_question_bank_folders_by_purpose/migration.sql", import.meta.url), "utf8");

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
  assert.match(identity.databaseName, /(?:folder|purpose|migration|test)/iu, `${TEST_DATABASE_ENV} must name a disposable test database.`);
  assert.ok(!sameDatabase, `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function createFixture(client: pg.Client, schemaName: string, withData: boolean) {
  const schema = quoteIdentifier(schemaName);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}, public`);
  await client.query(`CREATE TYPE "question_bank_purpose" AS ENUM ('quiz', 'tryout')`);
  await client.query(
    `CREATE TABLE question_bank_folders (
       id uuid PRIMARY KEY,
       parent_id uuid,
       name text NOT NULL,
       created_by_user_id uuid NOT NULL,
       updated_by_user_id uuid NOT NULL,
       created_at timestamptz NOT NULL DEFAULT NOW(),
       updated_at timestamptz NOT NULL DEFAULT NOW()
     )`,
  );
  await client.query(
    `ALTER TABLE question_bank_folders
       ADD CONSTRAINT question_bank_folders_parent_id_fkey
       FOREIGN KEY (parent_id) REFERENCES question_bank_folders(id) ON DELETE RESTRICT`,
  );
  await client.query(
    `CREATE UNIQUE INDEX question_bank_folders_root_name_ci_key
       ON question_bank_folders (LOWER(BTRIM(name)))
       WHERE parent_id IS NULL`,
  );
  await client.query(
    `CREATE UNIQUE INDEX question_bank_folders_parent_name_ci_key
       ON question_bank_folders (parent_id, LOWER(BTRIM(name)))
       WHERE parent_id IS NOT NULL`,
  );
  await client.query(
    `CREATE TABLE question_banks (
       id uuid PRIMARY KEY,
       folder_id uuid,
       purpose question_bank_purpose NOT NULL,
       status text NOT NULL DEFAULT 'published'
     )`,
  );
  await client.query(
    `ALTER TABLE question_banks
       ADD CONSTRAINT question_banks_folder_id_fkey
       FOREIGN KEY (folder_id) REFERENCES question_bank_folders(id) ON DELETE RESTRICT`,
  );
  await client.query(
    `CREATE TABLE reusable_question_package_versions (
       id uuid PRIMARY KEY,
       source_bank_id uuid NOT NULL
     )`,
  );
  await client.query(
    `CREATE TABLE reusable_question_package_version_bank_scopes (
       package_version_id uuid NOT NULL,
       question_bank_id uuid NOT NULL,
       PRIMARY KEY (package_version_id, question_bank_id)
     )`,
  );
  await client.query(
    `CREATE TABLE reusable_question_package_version_folder_scopes (
       package_version_id uuid NOT NULL,
       folder_id uuid NOT NULL,
       PRIMARY KEY (package_version_id, folder_id),
       CONSTRAINT reusable_question_package_version_folder_scopes_folder_id_fkey
         FOREIGN KEY (folder_id) REFERENCES question_bank_folders(id) ON DELETE RESTRICT
     )`,
  );

  if (!withData) return;

  const actorId = randomUUID();
  const rootId = randomUUID();
  const childId = randomUUID();
  const quizBankId = randomUUID();
  const tryoutBankId = randomUUID();
  const unfiledBankId = randomUUID();
  const packageVersionId = randomUUID();
  await client.query(
    `INSERT INTO question_bank_folders (id, parent_id, name, created_by_user_id, updated_by_user_id)
     VALUES ($1, NULL, 'UTBK', $3, $3), ($2, $1, 'Penalaran Umum', $3, $3)`,
    [rootId, childId, actorId],
  );
  await client.query(
    `INSERT INTO question_banks (id, folder_id, purpose)
     VALUES ($1, $3, 'quiz'), ($2, $3, 'tryout'), ($4, NULL, 'quiz')`,
    [quizBankId, tryoutBankId, rootId, unfiledBankId],
  );
  await client.query(
    `INSERT INTO reusable_question_package_versions (id, source_bank_id)
     VALUES ($1, $2)`,
    [packageVersionId, tryoutBankId],
  );
  await client.query(
    `INSERT INTO reusable_question_package_version_bank_scopes (package_version_id, question_bank_id)
     VALUES ($1, $2)`,
    [packageVersionId, quizBankId],
  );
  await client.query(
    `INSERT INTO reusable_question_package_version_folder_scopes (package_version_id, folder_id)
     VALUES ($1, $2)`,
    [packageVersionId, rootId],
  );
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

async function folderObjects(client: pg.Client, schemaName: string) {
  const result = await client.query<{
    bank_fk_exists: boolean;
    bank_index_exists: boolean;
    column_exists: boolean;
    composite_id_index_exists: boolean;
    composite_parent_fk_exists: boolean;
    folder_index_exists: boolean;
    immutable_trigger_exists: boolean;
    old_parent_index_exists: boolean;
    old_root_index_exists: boolean;
    parent_index_exists: boolean;
    root_index_exists: boolean;
  }>(
    `SELECT
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'question_bank_folders' AND column_name = 'purpose'
       ) AS column_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_bank_folders_id_purpose_key'
       ) AS composite_id_index_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_bank_folders_purpose_root_name_ci_key'
       ) AS root_index_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_bank_folders_purpose_parent_name_ci_key'
       ) AS parent_index_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_bank_folders_purpose_parent_id_name_idx'
       ) AS folder_index_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_banks_folder_id_purpose_idx'
       ) AS bank_index_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_bank_folders_root_name_ci_key'
       ) AS old_root_index_exists,
       EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = $1 AND indexname = 'question_bank_folders_parent_name_ci_key'
       ) AS old_parent_index_exists,
       EXISTS (
         SELECT 1 FROM pg_constraint constraint_row
          JOIN pg_class relation ON relation.oid = constraint_row.conrelid
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1 AND relation.relname = 'question_bank_folders'
           AND constraint_row.conname = 'question_bank_folders_parent_id_purpose_fkey'
       ) AS composite_parent_fk_exists,
       EXISTS (
         SELECT 1 FROM pg_constraint constraint_row
          JOIN pg_class relation ON relation.oid = constraint_row.conrelid
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1 AND relation.relname = 'question_banks'
           AND constraint_row.conname = 'question_banks_folder_id_purpose_fkey'
       ) AS bank_fk_exists,
       EXISTS (
         SELECT 1 FROM pg_trigger trigger_row
          JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = $1 AND relation.relname = 'question_bank_folders'
           AND trigger_row.tgname = 'question_bank_folder_purpose_immutable'
       ) AS immutable_trigger_exists`,
    [schemaName],
  );
  return result.rows[0];
}

async function folderSnapshot(client: pg.Client, schemaName: string) {
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
  const folders = await client.query<{ id: string; name: string; parent_id: string | null; purpose: string | null }>(
    "SELECT id, name, parent_id, NULL::text AS purpose FROM question_bank_folders ORDER BY id",
  );
  const banks = await client.query<{ id: string; folder_id: string | null; purpose: string }>(
    "SELECT id, folder_id, purpose::text FROM question_banks ORDER BY id",
  );
  const scopes = await client.query<{ folder_id: string }>(
    "SELECT folder_id FROM reusable_question_package_version_folder_scopes ORDER BY folder_id",
  );
  return { banks: banks.rows, folders: folders.rows, scopes: scopes.rows };
}

async function appliedSnapshot(client: pg.Client, schemaName: string) {
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
  const folders = await client.query<{ id: string; name: string; parent_id: string | null; purpose: string }>(
    "SELECT id, name, parent_id, purpose::text FROM question_bank_folders ORDER BY purpose, name, id",
  );
  const banks = await client.query<{ id: string; folder_id: string | null; folder_purpose: string | null; purpose: string }>(
    `SELECT bank.id, bank.folder_id, folder.purpose::text AS folder_purpose, bank.purpose::text
       FROM question_banks bank
       LEFT JOIN question_bank_folders folder ON folder.id = bank.folder_id
      ORDER BY bank.id`,
  );
  const scopes = await client.query<{ folder_id: string }>(
    "SELECT folder_id FROM reusable_question_package_version_folder_scopes ORDER BY folder_id",
  );
  return { banks: banks.rows, folders: folders.rows, scopes: scopes.rows };
}

async function dropFixture(client: pg.Client, schemaName: string) {
  await client.query("SET search_path TO public");
  await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
}

async function main() {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Question-bank folder purpose migration DB contract skipped: ${TEST_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return;
  }
  assertDisposableDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim());

  const client = new Client({ connectionString: rawDatabaseUrl });
  const emptySchema = `folder_purpose_empty_${randomUUID().replaceAll("-", "")}`;
  const dataSchema = `folder_purpose_data_${randomUUID().replaceAll("-", "")}`;
  let connected = false;
  try {
    await client.connect();
    connected = true;

    await createFixture(client, emptySchema, false);
    await runMigration(client, emptySchema);
    assert.equal((await folderObjects(client, emptySchema)).column_exists, true, "an empty folder fixture must gain the purpose column");

    await createFixture(client, dataSchema, true);
    const beforeFailure = await folderSnapshot(client, dataSchema);
    await assert.rejects(
      runMigration(client, dataSchema),
      /mixes Quiz and Tryout banks/u,
      "mixed-purpose package scopes must abort the folder migration",
    );
    assert.deepEqual(await folderObjects(client, dataSchema), {
      bank_fk_exists: false,
      bank_index_exists: false,
      column_exists: false,
      composite_id_index_exists: false,
      composite_parent_fk_exists: false,
      folder_index_exists: false,
      immutable_trigger_exists: false,
      old_parent_index_exists: true,
      old_root_index_exists: true,
      parent_index_exists: false,
      root_index_exists: false,
    }, "a failed folder migration must leave no partial DDL");
    assert.deepEqual(await folderSnapshot(client, dataSchema), beforeFailure, "a failed folder migration must leave no partial data changes");

    await client.query(`SET search_path TO ${quoteIdentifier(dataSchema)}, public`);
    await client.query("DELETE FROM reusable_question_package_version_bank_scopes");
    await runMigration(client, dataSchema);
    const appliedObjects = await folderObjects(client, dataSchema);
    assert.equal(appliedObjects.column_exists, true, "a retried folder migration must add purpose");
    assert.equal(appliedObjects.composite_id_index_exists, true, "folder ids must support composite purpose foreign keys");
    assert.equal(appliedObjects.root_index_exists, true, "root names must be unique within a purpose");
    assert.equal(appliedObjects.parent_index_exists, true, "sibling names must be unique within a purpose");
    assert.equal(appliedObjects.composite_parent_fk_exists, true, "folder parents must stay in the same purpose tree");
    assert.equal(appliedObjects.bank_fk_exists, true, "bank folders must stay in the same purpose tree");
    assert.equal(appliedObjects.immutable_trigger_exists, true, "folder purpose must be immutable in SQL");
    assert.equal(appliedObjects.old_root_index_exists, false, "the old purpose-blind root index must be removed");
    assert.equal(appliedObjects.old_parent_index_exists, false, "the old purpose-blind sibling index must be removed");

    const applied = await appliedSnapshot(client, dataSchema);
    assert.equal(applied.folders.length, 4, "the existing hierarchy must be duplicated once for each purpose");
    assert.equal(applied.folders.filter((folder) => folder.purpose === "quiz").length, 2, "the original hierarchy must become Quiz");
    assert.equal(applied.folders.filter((folder) => folder.purpose === "tryout").length, 2, "the clone hierarchy must become Tryout");
    assert.ok(applied.folders.some((folder) => folder.name === "Penalaran Umum" && folder.purpose === "tryout" && folder.parent_id && applied.folders.some((parent) => parent.id === folder.parent_id && parent.purpose === "tryout")), "Tryout child folders must point to Tryout parents");
    assert.ok(applied.banks.filter((bank) => bank.folder_id && bank.purpose === bank.folder_purpose).length >= 2, "filed banks must point to matching-purpose folders");
    assert.equal(applied.banks.filter((bank) => bank.folder_id === null).length, 1, "unfiled banks must remain unfiled");
    assert.equal(applied.scopes.length, 1, "the package folder scope must survive the remap");
    assert.ok(applied.scopes[0]?.folder_id && applied.folders.some((folder) => folder.id === applied.scopes[0]?.folder_id && folder.purpose === "tryout"), "Tryout package folder scopes must point to Tryout clones");

    const tryoutFolder = applied.folders.find((folder) => folder.purpose === "tryout");
    assert.ok(tryoutFolder, "the fixture must contain a Tryout folder");
    await assert.rejects(
      client.query("UPDATE question_bank_folders SET purpose = 'quiz'::question_bank_purpose WHERE id = $1", [tryoutFolder.id]),
      /question bank folder purpose is immutable/u,
      "direct SQL purpose changes must be rejected",
    );

    console.log("Question-bank folder purpose migration DB contract passed.");
  } finally {
    if (connected) {
      try {
        await dropFixture(client, emptySchema);
        await dropFixture(client, dataSchema);
      } finally {
        await client.end();
      }
    }
  }
}

await main();
