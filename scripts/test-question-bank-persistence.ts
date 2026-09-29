import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import pg from "pg";

const { Client } = pg;
const LIFECYCLE_DATABASE_ENV = "QUESTION_BANK_LIFECYCLE_TEST_DATABASE_URL";

function databaseIdentity(raw: string) {
  const parsed = new URL(raw);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return {
    databaseName: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    host: ["localhost", "127.0.0.1", "::1"].includes(hostname) ? "local" : hostname,
    port: Number(parsed.port || "5432"),
    protocol: parsed.protocol,
    schema: parsed.searchParams.get("schema") ?? "public",
    userName: decodeURIComponent(parsed.username),
  };
}

function assertDisposableDatabase(
  raw: string,
  runtimeRaw: string | undefined,
  envName: string,
  allowRuntimeDatabase = false,
) {
  const identity = databaseIdentity(raw);
  const runtime = runtimeRaw ? databaseIdentity(runtimeRaw) : null;
  const sameDatabase = runtime
    && runtime.host === identity.host
    && runtime.port === identity.port
    && runtime.databaseName === identity.databaseName
    && runtime.schema === identity.schema
    && runtime.userName === identity.userName;
  const approvedRuntimeDatabase = allowRuntimeDatabase && sameDatabase;
  assert.ok(["postgres:", "postgresql:"].includes(identity.protocol), `${envName} must use a PostgreSQL URL.`);
  assert.equal(identity.host, "local", `${envName} must use localhost, 127.0.0.1, or ::1.`);
  if (!approvedRuntimeDatabase) {
    assert.match(identity.databaseName, /(?:folder|lifecycle|storage|persistence|test)/iu, `${envName} must name a disposable test database.`);
  }
  assert.ok(!sameDatabase || allowRuntimeDatabase, `${envName} must be distinct from DATABASE_URL unless the local runtime database is explicitly approved.`);
}

const [repository, organization, actions, catalogue, createRoute, builder, schema, autoPublishMigration, assemblyRepository, assessmentRelease] = await Promise.all([
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/organization.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/question-bank-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuestionBankCataloguePageModules.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/question-bank/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuestionBankBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260918100000_auto_publish_question_banks/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
]);

assert.match(schema, /model QuestionBank[\s\S]*?status\s+ContentStatus\s+@default\(published\)/u);
assert.match(autoPublishMigration, /BEGIN;[\s\S]*?LOCK TABLE question_banks IN ACCESS EXCLUSIVE MODE;[\s\S]*?UPDATE question_banks/u);
assert.match(autoPublishMigration, /UPDATE question_banks[\s\S]*?SET status = 'published'::content_status[\s\S]*?WHERE status <> 'archived'::content_status/u);
assert.match(autoPublishMigration, /ALTER TABLE question_banks[\s\S]*?ALTER COLUMN status SET DEFAULT 'published'::content_status/u);
assert.match(autoPublishMigration, /CREATE OR REPLACE FUNCTION normalize_question_bank_status\(\)/u);
assert.match(autoPublishMigration, /IF NEW\.status <> 'archived'::content_status/u);
assert.match(autoPublishMigration, /CREATE TRIGGER question_banks_auto_publish_non_archived/u);

assert.match(repository, /SELECT id FROM question_banks WHERE id = \$\{bankId\}::uuid FOR UPDATE/u);
assert.match(repository, /questionRevisionContentDigest/u);
assert.match(repository, /sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)/u);
assert.match(repository, /function isTemporaryQuestionId\(id: string \| undefined\)/u);
assert.match(repository, /const isTemporary = isTemporaryQuestionId\(question\.id\)/u);
assert.match(repository, /!isTemporary && !current/u);
assert.match(repository, /const subjectCodes = \[\.\.\.new Set\(input\.questions\.map\(\(question\) => question\.subjectCode\)\)\]/u);
assert.match(repository, /if \(subjectCodes\.some\(\(subject\) => !SUBJECT_CODES\.includes/u);
assert.doesNotMatch(repository, /if \(!subjectCodes\.length \|\| subjectCodes\.some/u, "empty Bank Soal drafts should pass persistence validation");
assert.match(repository, /getQuestionBankReadinessFromRevisions\(readinessInputs\)/u);
assert.match(repository, /getQuestionReadinessFromRevision\(/u);
assert.match(repository, /bank\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /question\.status !== ContentStatus\.archived/u);
assert.match(repository, /if \(!revision\.question\.questionBank\) \{[\s\S]*isValidRevision\(revision\)/u);
assert.match(repository, /if \(issues\.length\) \{[\s\S]*readiness:/u);
assert.match(repository, /code: "readiness_failed"/u);
assert.match(repository, /readiness:/u);
assert.match(repository, /operation: "archive" \| "restore"/u);
assert.match(repository, /const requestedOperation = String\(operation\);[\s\S]*?requestedOperation !== "archive" && requestedOperation !== "restore"/u);
assert.match(repository, /const status = isArchive \? ContentStatus\.archived : ContentStatus\.published/u);
assert.match(repository, /code: "invalid_lifecycle_transition"/u);
assert.match(repository, /b\.status <> \$\{ContentStatus\.archived\}/u);
assert.match(repository, /SELECT qb\.id[\s\S]*FOR UPDATE OF qb/u);
assert.match(repository, /question\.questionBank\?\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /if \(sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)\) \{/u);
assert.match(repository, /const requiresNewRevision = currentRevision\.status === QuestionRevisionStatus\.ready/u);
assert.match(repository, /folderId\?: string \| null/u);
assert.match(repository, /normalizeQuestionBankFolderId\(input\.folderId\)/u);
assert.match(repository, /tx\.questionBankFolder\.findUnique\([\s\S]*folder\.purpose !== input\.purpose/u);
assert.match(repository, /folderId,\n\s+name: input\.title\.trim\(\)/u);
assert.match(assemblyRepository, /purpose: expectedPurpose,[\s\S]*?status: \{ not: ContentStatus\.archived \}/u);
assert.match(assessmentRelease, /purpose: "tryout",[\s\S]*?status: \{ not: ContentStatus\.archived \}/u);

assert.match(catalogue, /function questionBankCreateHref\(/u);
const createLinkCalls = [...catalogue.matchAll(/href=\{questionBankCreateHref\(\{[\s\S]*?\}\)\}/gu)].map(([source]) => source);
assert.equal(createLinkCalls.length, 2, "legacy folder-aware create links stay documented in the catalogue empty-state contract");
assert.match(catalogue, /router\.push\(questionBankCreateHref\(\{[\s\S]*?folder: selectedFolder[\s\S]*?purpose: initialPurpose/u);
assert.match(catalogue, /presentation="modal"/u);
assert.doesNotMatch(catalogue, /QuestionBankCreateMethodDialog/u);
assert.match(createRoute, /readQueryValues\(query, "folder"\)/u);
assert.match(createRoute, /if \(requestedFolder\) params\.set\("folder", requestedFolder\)/u);
assert.match(createRoute, /params\.set\("create", "1"\)/u);
assert.match(builder, /folderId: mode === "create" \? builderState\.folderId : undefined/u);

assert.doesNotMatch(organization, /assertBankMutationSupported/u);
assert.doesNotMatch(organization, /scheduledBankCount/u);

assert.match(actions, /type QuestionBankActionFailure =/u);
assert.doesNotMatch(actions, /export type \{ QuestionBankActionFailure \}/u, "Next Server Actions must not expose the failure type as a runtime action");
assert.match(actions, /attemptedInput\?: unknown/u);
assert.match(actions, /readiness\?: QuestionBankReadiness/u);
assert.match(actions, /questionBankActionFailure\(error, "Bank Soal tidak dapat disimpan saat ini\."\)/u);
assert.match(actions, /questionBankActionFailure\(error, "Status Bank Soal tidak dapat diubah saat ini\."\)/u);

async function runFolderStorageDatabaseContract() {
  const rawDatabaseUrl = process.env.QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL?.trim();
  if (!rawDatabaseUrl) {
    console.log("Question-bank folder storage DB contract skipped: QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL is required; configured DATABASE_URL is never used.");
    return;
  }
  assertDisposableDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim(), "QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL");
  process.env.DATABASE_URL = rawDatabaseUrl;

  const [{ prisma }, { saveQuestionBank }] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/question-bank/repository"),
  ]);
  const actorId = randomUUID();
  const folderId = randomUUID();
  const title = `Folder storage ${actorId}`;
  const email = `question-bank-folder-storage-${actorId}@example.test`;
  let bankId: string | undefined;
  let folderCreated = false;
  let userCreated = false;
  try {
    await prisma.user.create({
      data: {
        email,
        fullName: "Question Bank Folder Storage Test",
        id: actorId,
        passwordHash: "fixture-hash",
      },
    });
    userCreated = true;
    await prisma.questionBankFolder.create({
      data: {
        createdByUserId: actorId,
        id: folderId,
        name: `Folder ${actorId}`,
        parentId: null,
        purpose: "quiz",
        updatedByUserId: actorId,
      },
    });
    folderCreated = true;

    const result = await saveQuestionBank({ description: "", folderId, purpose: "quiz", questions: [], title }, actorId);
    bankId = result.bank.id;
    assert.equal(result.bank.folderId, folderId, "the repository DTO must retain the folder used during creation");
    const persisted = await prisma.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { folderId: true, purpose: true } });
    assert.deepEqual(persisted, { folderId, purpose: "quiz" }, "the database row must retain the selected folder");
  } finally {
    if (bankId) await prisma.questionBank.delete({ where: { id: bankId } });
    if (folderCreated) await prisma.questionBankFolder.delete({ where: { id: folderId } });
    if (userCreated) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  }
  console.log("Question-bank folder storage DB contract passed.");
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

async function runQuestionBankLifecycleMigration(
  client: pg.Client,
  schemaName: string,
  migration: string,
) {
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}, public`);
  try {
    await client.query(migration);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function runQuestionBankLifecycleDatabaseContract() {
  const rawDatabaseUrl = process.env[LIFECYCLE_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Question-bank lifecycle migration DB contract skipped: ${LIFECYCLE_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return;
  }
  assertDisposableDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim(), LIFECYCLE_DATABASE_ENV, true);

  const client = new Client({ connectionString: rawDatabaseUrl });
  const schemaName = `question_bank_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const archivedId = randomUUID();
  const draftId = randomUUID();
  const scheduledId = randomUUID();
  const defaultId = randomUUID();
  const insertDraftId = randomUUID();
  const insertScheduledId = randomUUID();
  const insertArchivedId = randomUUID();
  let connected = false;
  try {
    await client.connect();
    connected = true;
    const schema = quoteIdentifier(schemaName);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(
      "CREATE TYPE content_status AS ENUM ('draft', 'published', 'archived', 'scheduled')",
    );
    await client.query(
      `CREATE TABLE question_banks (
         id uuid PRIMARY KEY,
         name text NOT NULL,
         status content_status NOT NULL DEFAULT 'draft'::content_status
       )`,
    );
    await client.query(
      `INSERT INTO question_banks (id, name, status)
       VALUES
         ($1::uuid, 'legacy archived', 'archived'::content_status),
         ($2::uuid, 'legacy draft', 'draft'::content_status),
         ($3::uuid, 'legacy scheduled', 'scheduled'::content_status)`,
      [archivedId, draftId, scheduledId],
    );

    await runQuestionBankLifecycleMigration(client, schemaName, autoPublishMigration);

    const backfilled = await client.query<{ name: string; status: string }>(
      "SELECT name, status::text AS status FROM question_banks ORDER BY name",
    );
    assert.deepEqual(
      backfilled.rows,
      [
        { name: "legacy archived", status: "archived" },
        { name: "legacy draft", status: "published" },
        { name: "legacy scheduled", status: "published" },
      ],
      "the migration must publish legacy active rows while preserving archived rows",
    );

    await client.query(
      "INSERT INTO question_banks (id, name) VALUES ($1::uuid, 'default published')",
      [defaultId],
    );
    await client.query(
      `INSERT INTO question_banks (id, name, status)
       VALUES
         ($1::uuid, 'trigger draft', 'draft'::content_status),
         ($2::uuid, 'trigger scheduled', 'scheduled'::content_status),
         ($3::uuid, 'trigger archived', 'archived'::content_status)`,
      [insertDraftId, insertScheduledId, insertArchivedId],
    );
    await client.query(
      "UPDATE question_banks SET status = 'scheduled'::content_status WHERE id = $1::uuid",
      [defaultId],
    );
    await client.query(
      "UPDATE question_banks SET name = 'archived preserved' WHERE id = $1::uuid",
      [archivedId],
    );

    const normalized = await client.query<{ id: string; status: string }>(
      "SELECT id, status::text AS status FROM question_banks ORDER BY id",
    );
    const statusById = new Map(normalized.rows.map((row) => [row.id, row.status]));
    assert.equal(statusById.get(archivedId), "archived", "an archived bank must remain archived after unrelated updates");
    assert.equal(statusById.get(draftId), "published", "a legacy draft bank must be backfilled to published");
    assert.equal(statusById.get(scheduledId), "published", "a legacy scheduled bank must be backfilled to published");
    assert.equal(statusById.get(defaultId), "published", "the bank default and update trigger must normalize active rows");
    assert.equal(statusById.get(insertDraftId), "published", "the insert trigger must normalize draft rows");
    assert.equal(statusById.get(insertScheduledId), "published", "the insert trigger must normalize scheduled rows");
    assert.equal(statusById.get(insertArchivedId), "archived", "the insert trigger must preserve archived rows");

    const defaultColumn = await client.query<{ column_default: string | null }>(
      `SELECT column_default
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'question_banks'
          AND column_name = 'status'`,
      [schemaName],
    );
    assert.match(defaultColumn.rows[0]?.column_default ?? "", /'published'::content_status/u, "the database default must be published");
  } finally {
    if (connected) {
      try {
        await client.query("SET search_path TO public");
        await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      } finally {
        await client.end();
      }
    }
  }
  console.log("Question-bank lifecycle migration DB contract passed.");
}

await runFolderStorageDatabaseContract();
await runQuestionBankLifecycleDatabaseContract();
console.log("Question-bank persistence and lifecycle contracts passed.");
