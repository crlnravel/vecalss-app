import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  parseQuestionBankCsv,
  serializeQuestionBankCsv,
  type QuestionBankCsvRow,
  type QuestionBankCsvSerializableRow,
} from "../lib/question-bank/csv";

const TEST_DATABASE_ENV = "QUESTION_BANK_CSV_TEST_DATABASE_URL";
const MATERI = "Deret Angka & Pola Bilangan";

function assertDisposableDatabase(raw: string) {
  const parsed = new URL(raw);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol), `${TEST_DATABASE_ENV} must use a PostgreSQL URL.`);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(host), `${TEST_DATABASE_ENV} must use a local PostgreSQL host.`);
  assert.match(databaseName, /(?:csv|test|fixture|bank)/iu, `${TEST_DATABASE_ENV} must name a disposable test database.`);
  assert.notEqual(raw, process.env.DATABASE_URL?.trim(), `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
}

function serializableRow(index: number, questionId = randomUUID()): QuestionBankCsvSerializableRow {
  return {
    correctOptions: ["A"],
    difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
    explanation: index % 7 === 0 ? "Explanation\nwith a second line" : null,
    materi: MATERI,
    options: [
      { assetId: null, content: `Option A ${index}`, isCorrect: true, label: "A", sortOrder: 0 },
      { assetId: null, content: `Option B ${index}`, isCorrect: false, label: "B", sortOrder: 1 },
    ],
    prompt: `CSV fixture prompt ${index}`,
    questionId,
    questionType: "single_choice",
    subjectCode: "PU",
  };
}

function parsedRows(count: number) {
  const parsed = parseQuestionBankCsv(serializeQuestionBankCsv(Array.from({ length: count }, (_, index) => serializableRow(index))));
  assert.equal(parsed.structuralErrors.length, 0);
  assert.equal(parsed.rowErrors.length, 0);
  assert.equal(parsed.normalizedRows.length, count);
  return parsed.normalizedRows;
}

function ownedLeaseStatus(status: { state: string; generation?: number }, label: string) {
  assert.equal(status.state, "owned", label);
  assert.ok(Number.isSafeInteger(status.generation), `${label} must include a generation.`);
  return status.generation!;
}

async function run() {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Question Bank CSV DB contract skipped: ${TEST_DATABASE_ENV} is required; configured DATABASE_URL is never used.`);
    return;
  }
  assertDisposableDatabase(rawDatabaseUrl);
  process.env.DATABASE_URL = rawDatabaseUrl;

  const [{ prisma }, { acquireEditLease, EditLeaseServiceError }, { appendQuestionBankCsv, exportQuestionBankCsv, overwriteQuestionBankCsv }] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/resource-edit-lock/service"),
    import("../lib/question-bank/csv-repository"),
  ]);

  const actorId = randomUUID();
  const bankId = randomUUID();
  const emptyBankId = randomUUID();
  const leaseToken = randomBytes(32).toString("base64url");
  let userCreated = false;
  let bankCreated = false;
  let emptyBankCreated = false;
  try {
    const cleanupFixtures = async () => {
      await prisma.$transaction(async (tx) => {
        // The production schema intentionally keeps Question and Revision
        // history restrictively linked. This disposable fixture owns every
        // row below, so temporarily removing only the two pointer FKs lets
        // cleanup remove the full graph without weakening production code.
        await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
        await tx.$executeRawUnsafe("ALTER TABLE question_revision_options DISABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE question_revisions DISABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE questions DISABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey");
        await tx.$executeRawUnsafe("ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey");
        await tx.$executeRaw`DELETE FROM "question_revision_options" WHERE "question_revision_id" IN (SELECT revision."id" FROM "question_revisions" revision JOIN "questions" question ON question."id" = revision."question_id" WHERE question."question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid))`;
        await tx.$executeRaw`DELETE FROM "question_options" WHERE "question_id" IN (SELECT "id" FROM "questions" WHERE "question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid))`;
        await tx.$executeRaw`DELETE FROM "question_revisions" WHERE "question_id" IN (SELECT "id" FROM "questions" WHERE "question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid))`;
        await tx.$executeRaw`DELETE FROM "questions" WHERE "question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid)`;
        await tx.$executeRawUnsafe("ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");
        await tx.$executeRawUnsafe("ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");
        await tx.$executeRawUnsafe("ALTER TABLE questions ENABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE question_revisions ENABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE question_revision_options ENABLE TRIGGER USER");
        await tx.editLease.deleteMany({ where: { resourceType: "question_bank", resourceId: bankId } });
        await tx.questionBank.deleteMany({ where: { id: { in: [bankId, emptyBankId] } } });
      });
      bankCreated = false;
      emptyBankCreated = false;
    };

    await prisma.user.create({
      data: {
        email: `question-bank-csv-${actorId}@example.test`,
        fullName: "Question Bank CSV Test",
        id: actorId,
        passwordHash: "fixture-hash",
      },
    });
    userCreated = true;
    await prisma.questionBank.create({
      data: {
        code: `csv-test-${actorId.slice(0, 8)}`,
        createdByUserId: actorId,
        id: bankId,
        name: "CSV Capacity / Formula Bank",
        purpose: "quiz",
        updatedByUserId: actorId,
      },
    });
    bankCreated = true;

    const lease = await acquireEditLease({
      holderUserId: actorId,
      newToken: leaseToken,
      resourceId: bankId,
      resourceType: "question_bank",
    });
    const generation = ownedLeaseStatus(lease, "CSV test lease");
    const leaseProof = { generation, token: leaseToken };
    const initialKuisCount = await prisma.standaloneQuiz.count({ where: { sourceBankId: bankId } });

    const appendFixture = parsedRows(500);
    const suppliedAppendIds = new Set(appendFixture.map((row) => row.questionId));
    const appendStartedAt = performance.now();
    const appended = await appendQuestionBankCsv({
      actorId,
      bankId,
      editLease: leaseProof,
      expectedRevision: 1,
      rows: appendFixture,
    });
    const appendElapsedMs = performance.now() - appendStartedAt;
    assert.equal(appended.createdQuestionIds.length, 500);
    assert.ok(appended.createdQuestionIds.every((id) => !suppliedAppendIds.has(id)), "append must ignore supplied identities");
    assert.ok(appendElapsedMs < 30_000, `500-row append exceeded the transaction ceiling (${Math.round(appendElapsedMs)}ms)`);
    assert.equal(await prisma.question.count({ where: { questionBankId: bankId } }), 500);
    assert.equal((await prisma.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { revision: true } })).revision, 2);

    const exported = await exportQuestionBankCsv(actorId, bankId);
    assert.ok(exported);
    assert.equal(exported.rowCount, 500);
    const exportedRows = parseQuestionBankCsv(exported.bytes);
    assert.equal(exportedRows.structuralErrors.length, 0);
    assert.equal(serializeQuestionBankCsv(exportedRows.normalizedRows), new TextDecoder().decode(exported.bytes), "export must be byte-stable after normalization");

    // Make the first current revision Ready so overwrite proves immutable
    // revision creation, then make the new draft current revisions changeable
    // so the second 500-row overwrite exercises the set-based draft path.
    await prisma.$executeRaw`
      UPDATE "question_revisions"
         SET "status" = 'ready'::question_revision_status,
             "ready_at" = CURRENT_TIMESTAMP
       WHERE "question_id" IN (
         SELECT "id" FROM "questions" WHERE "question_bank_id" = ${bankId}::uuid
       )
    `;
    const readyOverwriteRows = exportedRows.normalizedRows.map((row, index) => ({
      ...row,
      prompt: `${row.prompt} ready update ${index}`,
    } satisfies QuestionBankCsvRow));
    const readyOverwriteStartedAt = performance.now();
    const readyOverwrite = await overwriteQuestionBankCsv({
      actorId,
      bankId,
      editLease: leaseProof,
      expectedRevision: 2,
      rows: readyOverwriteRows,
    });
    const readyOverwriteElapsedMs = performance.now() - readyOverwriteStartedAt;
    assert.equal(readyOverwrite.preservedQuestionIds.length, 500);
    assert.equal(readyOverwrite.createdQuestionIds.length, 0);
    assert.ok(readyOverwriteElapsedMs < 30_000, `500-row ready overwrite exceeded the transaction ceiling (${Math.round(readyOverwriteElapsedMs)}ms)`);
    assert.equal((await prisma.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { revision: true } })).revision, 3);

    const draftOverwriteRows = readyOverwriteRows.map((row, index) => ({
      ...row,
      prompt: `${row.prompt} draft update ${index}`,
    } satisfies QuestionBankCsvRow));
    const draftOverwriteStartedAt = performance.now();
    const draftOverwrite = await overwriteQuestionBankCsv({
      actorId,
      bankId,
      editLease: leaseProof,
      expectedRevision: 3,
      rows: draftOverwriteRows,
    });
    const draftOverwriteElapsedMs = performance.now() - draftOverwriteStartedAt;
    assert.equal(draftOverwrite.preservedQuestionIds.length, 500);
    assert.ok(draftOverwriteElapsedMs < 30_000, `500-row draft overwrite exceeded the transaction ceiling (${Math.round(draftOverwriteElapsedMs)}ms)`);
    assert.equal((await prisma.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { revision: true } })).revision, 4);

    const omittedOverwrite = await overwriteQuestionBankCsv({
      actorId,
      bankId,
      editLease: leaseProof,
      expectedRevision: 4,
      rows: draftOverwriteRows.slice(0, 499),
    });
    assert.equal(omittedOverwrite.retiredCount, 1, "overwrite must retire an omitted active question");
    assert.equal((await prisma.question.findMany({ where: { questionBankId: bankId, status: "archived" }, select: { currentRevision: { select: { status: true } } } })).length, 1);

    const appendOne = parsedRows(1)[0]!;
    const appendOneResult = await appendQuestionBankCsv({
      actorId,
      bankId,
      editLease: leaseProof,
      expectedRevision: 5,
      rows: [appendOne],
    });
    assert.equal(appendOneResult.createdQuestionIds.length, 1);
    assert.notEqual(appendOneResult.createdQuestionIds[0], appendOne.questionId);

    await assert.rejects(
      overwriteQuestionBankCsv({ actorId, bankId, editLease: leaseProof, expectedRevision: 6, rows: [draftOverwriteRows[0]!, { ...draftOverwriteRows[0]! }] }),
      (error: unknown) => error instanceof Error && "code" in error && (error as { code?: unknown }).code === "duplicate_question_id",
    );
    await assert.rejects(
      overwriteQuestionBankCsv({ actorId, bankId, editLease: leaseProof, expectedRevision: 6, rows: [{ ...appendOne, questionId: randomUUID() }] }),
      (error: unknown) => error instanceof Error && "code" in error && (error as { code?: unknown }).code === "question_id_not_in_bank",
    );
    await assert.rejects(
      appendQuestionBankCsv({ actorId, bankId, editLease: leaseProof, expectedRevision: 5, rows: [appendOne] }),
      (error: unknown) => error instanceof Error && "code" in error && (error as { code?: unknown }).code === "stale_revision",
    );
    await assert.rejects(
      appendQuestionBankCsv({ actorId, bankId, editLease: { generation: generation + 1, token: randomBytes(32).toString("base64url") }, expectedRevision: 6, rows: [appendOne] }),
      (error: unknown) => error instanceof EditLeaseServiceError && error.code === "lease_superseded",
    );

    const beforeLateFailure = await prisma.$transaction(async (tx) => ({
      bankRevision: (await tx.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { revision: true } })).revision,
      questionCount: await tx.question.count({ where: { questionBankId: bankId } }),
      revisionCount: await tx.questionRevision.count({ where: { question: { questionBankId: bankId } } }),
      revisionOptionCount: await tx.questionRevisionOption.count({ where: { questionRevision: { question: { questionBankId: bankId } } } }),
      optionCount: await tx.questionOption.count({ where: { question: { questionBankId: bankId } } }),
    }));
    const appliedRows: number[] = [];
    await assert.rejects(
      appendQuestionBankCsv({
        actorId,
        bankId,
        editLease: leaseProof,
        expectedRevision: 6,
        failureAfterRow: 2,
        onRowApplied: (rowNumber) => { appliedRows.push(rowNumber); },
        rows: parsedRows(2),
      }),
      (error: unknown) => error instanceof Error && error.message === "Injected late CSV failure.",
    );
    assert.deepEqual(appliedRows, [1], "late failure must occur after an earlier row callback");
    const afterLateFailure = await prisma.$transaction(async (tx) => ({
      bankRevision: (await tx.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { revision: true } })).revision,
      questionCount: await tx.question.count({ where: { questionBankId: bankId } }),
      revisionCount: await tx.questionRevision.count({ where: { question: { questionBankId: bankId } } }),
      revisionOptionCount: await tx.questionRevisionOption.count({ where: { questionRevision: { question: { questionBankId: bankId } } } }),
      optionCount: await tx.questionOption.count({ where: { question: { questionBankId: bankId } } }),
    }));
    assert.deepEqual(afterLateFailure, beforeLateFailure);
    assert.equal(await prisma.standaloneQuiz.count({ where: { sourceBankId: bankId } }), initialKuisCount, "CSV Bank writes must not touch Kuis");

    await prisma.questionBank.create({
      data: {
        code: `csv-empty-${actorId.slice(0, 8)}`,
        createdByUserId: actorId,
        id: emptyBankId,
        name: "Empty / archived CSV bank",
        purpose: "quiz",
        status: "archived",
        updatedByUserId: actorId,
      },
    });
    emptyBankCreated = true;
    const emptyExport = await exportQuestionBankCsv(actorId, emptyBankId);
    assert.ok(emptyExport);
    assert.equal(emptyExport.rowCount, 0);
    assert.equal(new TextDecoder().decode(emptyExport.bytes), `${serializeQuestionBankCsv([])}`);

    await cleanupFixtures();
    console.log(`Question Bank CSV DB contract passed (append ${Math.round(appendElapsedMs)}ms; ready overwrite ${Math.round(readyOverwriteElapsedMs)}ms; draft overwrite ${Math.round(draftOverwriteElapsedMs)}ms).`);
  } finally {
    if (bankCreated || emptyBankCreated) {
      // cleanupFixtures is declared inside the try block so it can keep the
      // same disposable IDs and transaction client. Re-run the fixed SQL
      // cleanup inline if setup failed before the helper declaration ran.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
        await tx.$executeRawUnsafe("ALTER TABLE question_revision_options DISABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE question_revisions DISABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE questions DISABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE questions DROP CONSTRAINT questions_current_revision_id_fkey");
        await tx.$executeRawUnsafe("ALTER TABLE questions DROP CONSTRAINT questions_current_revision_identity_fkey");
        await tx.$executeRaw`DELETE FROM "question_revision_options" WHERE "question_revision_id" IN (SELECT revision."id" FROM "question_revisions" revision JOIN "questions" question ON question."id" = revision."question_id" WHERE question."question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid))`;
        await tx.$executeRaw`DELETE FROM "question_options" WHERE "question_id" IN (SELECT "id" FROM "questions" WHERE "question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid))`;
        await tx.$executeRaw`DELETE FROM "question_revisions" WHERE "question_id" IN (SELECT "id" FROM "questions" WHERE "question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid))`;
        await tx.$executeRaw`DELETE FROM "questions" WHERE "question_bank_id" IN (${bankId}::uuid, ${emptyBankId}::uuid)`;
        await tx.$executeRawUnsafe("ALTER TABLE questions ADD CONSTRAINT questions_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES question_revisions(id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");
        await tx.$executeRawUnsafe("ALTER TABLE questions ADD CONSTRAINT questions_current_revision_identity_fkey FOREIGN KEY (id, current_revision_id) REFERENCES question_revisions(question_id, id) ON UPDATE CASCADE ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED");
        await tx.$executeRawUnsafe("ALTER TABLE questions ENABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE question_revisions ENABLE TRIGGER USER");
        await tx.$executeRawUnsafe("ALTER TABLE question_revision_options ENABLE TRIGGER USER");
        await tx.editLease.deleteMany({ where: { resourceType: "question_bank", resourceId: bankId } });
        await tx.questionBank.deleteMany({ where: { id: { in: [bankId, emptyBankId] } } });
      });
    }
    if (userCreated) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  }
}

await run();
