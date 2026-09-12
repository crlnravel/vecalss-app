import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

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

function assertDisposableDatabase(raw: string, runtimeRaw?: string) {
  const identity = databaseIdentity(raw);
  const runtime = runtimeRaw ? databaseIdentity(runtimeRaw) : null;
  const sameDatabase = runtime
    && runtime.host === identity.host
    && runtime.port === identity.port
    && runtime.databaseName === identity.databaseName
    && runtime.schema === identity.schema
    && runtime.userName === identity.userName;
  assert.ok(["postgres:", "postgresql:"].includes(identity.protocol), "QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL must use a PostgreSQL URL.");
  assert.equal(identity.host, "local", "QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL must use localhost, 127.0.0.1, or ::1.");
  assert.match(identity.databaseName, /(?:folder|storage|persistence|test)/iu, "QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL must name a disposable test database.");
  assert.ok(!sameDatabase, "QUESTION_BANK_FOLDER_STORAGE_TEST_DATABASE_URL must be distinct from DATABASE_URL.");
}

const [repository, organization, actions, catalogue, createRoute, builder] = await Promise.all([
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/organization.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/question-bank-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuestionBankCataloguePageModules.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/question-bank/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuestionBankBuilderPageModule.tsx", import.meta.url), "utf8"),
]);

assert.match(repository, /SELECT id FROM question_banks WHERE id = \$\{bankId\}::uuid FOR UPDATE/u);
assert.match(repository, /assertPublishedQuestionContentUnchanged\(input, existing, subtestByCode\)/u);
assert.match(repository, /questionRevisionContentDigest/u);
assert.match(repository, /published_content_locked/u);
assert.match(repository, /attemptedInput: input/u);
assert.match(repository, /sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)/u);
assert.match(repository, /function isTemporaryQuestionId\(id: string \| undefined\)/u);
assert.match(repository, /const isTemporary = isTemporaryQuestionId\(question\.id\)/u);
assert.match(repository, /!isTemporary && !current/u);
assert.match(repository, /const subjectCodes = \[\.\.\.new Set\(input\.questions\.map\(\(question\) => question\.subjectCode\)\)\]/u);
assert.match(repository, /if \(subjectCodes\.some\(\(subject\) => !SUBJECT_CODES\.includes/u);
assert.doesNotMatch(repository, /if \(!subjectCodes\.length \|\| subjectCodes\.some/u, "empty Bank Soal drafts should pass persistence validation");
assert.match(repository, /getQuestionBankReadinessFromRevisions\(activeQuestions\.map/u);
assert.match(repository, /getQuestionReadinessFromRevision\(/u);
assert.match(repository, /bank\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /question\.status !== ContentStatus\.archived/u);
assert.match(repository, /if \(!revision\.question\.questionBank\) \{[\s\S]*isValidRevision\(revision\)/u);
assert.match(repository, /if \(issues\.length\) \{[\s\S]*readiness:/u);
assert.match(repository, /code: "readiness_failed"/u);
assert.match(repository, /readiness,/u);
assert.match(repository, /const allowedOperations: Record<ContentStatus, readonly string\[\]>/u);
assert.match(repository, /\[ContentStatus\.draft\]: \["publish", "archive"\]/u);
assert.match(repository, /\[ContentStatus\.published\]: \["unpublish", "archive"\]/u);
assert.match(repository, /\[ContentStatus\.archived\]: \["restore"\]/u);
assert.match(repository, /code: "invalid_lifecycle_transition"/u);
assert.match(repository, /code: "scheduled_unsupported"/u);
assert.match(repository, /SELECT qb\.id[\s\S]*FOR UPDATE OF qb/u);
assert.match(repository, /question\.questionBank\?\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /if \(sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)\) \{/u);
assert.match(repository, /const requiresNewRevision = currentRevision\.status === QuestionRevisionStatus\.ready/u);
assert.match(repository, /folderId\?: string \| null/u);
assert.match(repository, /normalizeQuestionBankFolderId\(input\.folderId\)/u);
assert.match(repository, /tx\.questionBankFolder\.findUnique\([\s\S]*folder\.purpose !== input\.purpose/u);
assert.match(repository, /folderId,\n\s+name: input\.title\.trim\(\)/u);

assert.match(catalogue, /function questionBankCreateHref\(/u);
const createLinkCalls = [...catalogue.matchAll(/href=\{questionBankCreateHref\(\{[\s\S]*?\}\)\}/gu)].map(([source]) => source);
assert.equal(createLinkCalls.length, 2, "the catalogue must keep both folder-aware Bank Soal create links");
for (const createLinkCall of createLinkCalls) {
  assert.match(createLinkCall, /folder: selectedFolder/u);
  assert.match(createLinkCall, /purpose: initialPurpose/u);
}
assert.match(createRoute, /readQueryValues\(query, "folder"\)/u);
assert.match(createRoute, /initialFolderId/u);
assert.match(builder, /folderId: mode === "create" \? builderState\.folderId : undefined/u);

assert.match(organization, /function assertBankMutationSupported\(status: ContentStatus\)/u);
assert.match(organization, /code: "scheduled_unsupported"/u);
assert.match(organization, /assertBankMutationSupported\(bank\.status\)/u);
assert.match(organization, /scheduledBankCount = await tx\.questionBank\.count/u);
assert.match(organization, /operation: "remove_folder"/u);

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
  assertDisposableDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim());
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

await runFolderStorageDatabaseContract();
console.log("Question-bank persistence and lifecycle contracts passed.");
