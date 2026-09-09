import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";

const TEST_DATABASE_ENV = "TRYOUT_CAT_RETRY_TEST_DATABASE_URL";
const ACK_ENV = "TRYOUT_CAT_RETRY_TEST_DATABASE_ACK";
const CREATED_ENV = "TRYOUT_CAT_RETRY_TEST_DATABASE_CREATED";
const TARGET_DATABASE = "vecalss_cat_retry_20260909";
const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 55432;
const TARGET_USER = "vecalss";
const LOCAL_HOST_ALIASES = new Set(["localhost", "127.0.0.1", "::1"]);

function databaseIdentity(raw: string) {
  const url = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), `${TEST_DATABASE_ENV} must use a PostgreSQL URL.`);
  return {
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
    host: url.hostname.toLowerCase().replace(/^\[|\]$/gu, ""),
    port: Number(url.port || "5432"),
    user: decodeURIComponent(url.username),
  };
}

function comparableHost(host: string) {
  return LOCAL_HOST_ALIASES.has(host) ? "loopback" : host;
}

function sameDatabase(left: ReturnType<typeof databaseIdentity>, right: ReturnType<typeof databaseIdentity>) {
  return left.database === right.database
    && comparableHost(left.host) === comparableHost(right.host)
    && left.port === right.port
    && left.user === right.user;
}

function assertExactDisposableDatabase(raw: string, runtimeRaw?: string) {
  const identity = databaseIdentity(raw);
  const runtime = runtimeRaw ? databaseIdentity(runtimeRaw) : null;
  assert.deepEqual(identity, { database: TARGET_DATABASE, host: TARGET_HOST, port: TARGET_PORT, user: TARGET_USER }, `${TEST_DATABASE_ENV} must target the exact disposable PostgreSQL endpoint.`);
  assert.equal(process.env[ACK_ENV], "1", `${ACK_ENV}=1 is required before mutating the disposable fixture database.`);
  assert.equal(process.env[CREATED_ENV], "1", `${CREATED_ENV}=1 is required; the outer procedure must prove this exact database was newly created for the run.`);
  assert.ok(!runtime || !sameDatabase(identity, runtime), `${TEST_DATABASE_ENV} must be distinct from DATABASE_URL, including loopback aliases.`);
}

async function assertConnectedToExactDisposableDatabase(prisma: { $queryRaw: (query: TemplateStringsArray, ...values: never[]) => Promise<unknown> }) {
  const rows = await prisma.$queryRaw`
    SELECT
      current_database() AS database_name,
      current_user AS user_name
  ` as Array<{ database_name: string; user_name: string }>;
  const identity = rows[0];
  assert.deepEqual(identity, { database_name: TARGET_DATABASE, user_name: TARGET_USER }, "the opened Prisma connection must prove the exact target database and role.");
}

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

async function main() {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawDatabaseUrl) {
    console.log(`Tryout CAT retry DB integration skipped: ${TEST_DATABASE_ENV}, ${ACK_ENV}=1, and ${CREATED_ENV}=1 are required; no database was touched.`);
    return;
  }
  assertExactDisposableDatabase(rawDatabaseUrl, process.env.DATABASE_URL?.trim());

  // The repository obtains its singleton Prisma client from DATABASE_URL at
  // module evaluation time. The opt-in guard above keeps this assignment
  // isolated to the disposable integration process.
  process.env.DATABASE_URL = rawDatabaseUrl;
  const { prisma } = await import("../lib/prisma");
  const { attemptState, saveTryoutAnswer } = await import("../lib/tryout/attempt-repository");
  await assertConnectedToExactDisposableDatabase(prisma);

  const ids = {
    admissionId: randomUUID(),
    assignmentId: randomUUID(),
    attemptId: randomUUID(),
    itemAId: randomUUID(),
    itemBId: randomUUID(),
    itemCId: randomUUID(),
    optionA1Id: randomUUID(),
    optionA2Id: randomUUID(),
    optionB1Id: randomUUID(),
    optionB2Id: randomUUID(),
    optionC1Id: randomUUID(),
    optionC2Id: randomUUID(),
    releaseId: randomUUID(),
    runId: randomUUID(),
    sectionId: randomUUID(),
    sessionId: randomUUID(),
    studentId: randomUUID(),
    subtestId: randomUUID(),
    tryoutId: randomUUID(),
    userEmail: `cat-retry-${randomUUID()}@example.test`,
  };
  const now = new Date();
  const availableUntil = new Date(now.getTime() + 60 * 60 * 1000);
  const runDeadline = new Date(now.getTime() + 30 * 60 * 1000);
  const modelVersion = "2pl-canonical-v1";
  const itemIds = [ids.itemAId, ids.itemBId, ids.itemCId];
  const catDeliveryOrder = [ids.itemAId, ids.itemCId, ids.itemBId];
  const contentItems = [
    { id: ids.itemCId, prompt: "C", options: [{ id: ids.optionC1Id, choiceKey: "A", content: "C correct", isCorrect: true, sortOrder: 1 }, { id: ids.optionC2Id, choiceKey: "B", content: "C wrong", isCorrect: false, sortOrder: 2 }], sortOrder: 1 },
    { id: ids.itemAId, prompt: "A", options: [{ id: ids.optionA1Id, choiceKey: "A", content: "A correct", isCorrect: true, sortOrder: 1 }, { id: ids.optionA2Id, choiceKey: "B", content: "A wrong", isCorrect: false, sortOrder: 2 }], sortOrder: 2 },
    { id: ids.itemBId, prompt: "B", options: [{ id: ids.optionB1Id, choiceKey: "A", content: "B correct", isCorrect: true, sortOrder: 1 }, { id: ids.optionB2Id, choiceKey: "B", content: "B wrong", isCorrect: false, sortOrder: 2 }], sortOrder: 3 },
  ];
  const snapshotItems = contentItems.map((item) => ({
    difficulty: "easy",
    explanation: null,
    explanationAssetId: null,
    id: item.id,
    options: item.options,
    points: "1",
    prompt: item.prompt,
    promptAssetId: null,
    releaseItemId: item.id,
    sortOrder: item.sortOrder,
    sourceContentDigest: "cat-retry-fixture",
    sourceQuestionId: randomUUID(),
    sourceQuestionRevisionId: randomUUID(),
    sourceRevisionProvenance: "authored",
  }));
  const parameters = [ids.itemCId, ids.itemAId, ids.itemBId].map((itemId, index) => ({
    calibrationDigest: "cat-retry-fixture",
    calibrationId: randomUUID(),
    discrimination: 1,
    difficulty: 0,
    itemId,
    sortOrder: index + 1,
    sourceContentDigest: "cat-retry-fixture",
    sourceQuestionId: randomUUID(),
    sourceQuestionRevisionId: randomUUID(),
    sourceRevisionProvenance: "authored",
  }));
  const snapshot = {
    catItemCount: 3,
    catModelVersion: modelVersion,
    durationSeconds: 1800,
    items: snapshotItems,
    scoringConfig: {},
    sectionId: ids.sectionId,
    sequenceNo: 1,
    subtestId: ids.subtestId,
    testType: "cat",
    title: "CAT retry fixture",
  };
  const releasePayload = {
    schemaVersion: "cat-retry-fixture",
    sections: [{ durationSeconds: 1800, id: ids.sectionId, items: snapshotItems, scoring: { testType: "cat" }, sequenceNo: 1, subtestCode: "CAT-RETRY", subtestId: ids.subtestId, subtestName: "CAT Retry", title: "CAT retry fixture" }],
  };
  const initialCatSnapshot = {
    currentAbility: 0,
    initialAbility: 0,
    modelVersion,
    parameters,
    selectedItemIds: [ids.itemAId],
    updates: [],
  };

  async function cleanup() {
    const failures: Error[] = [];
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["tryout answers", () => prisma.tryoutAnswer.deleteMany({ where: { attemptId: ids.attemptId } })],
      ["score breakdowns", () => prisma.tryoutScoreBreakdown.deleteMany({ where: { attemptId: ids.attemptId } })],
      ["CAT audits", () => prisma.tryoutCatResolutionAudit.deleteMany({ where: { runId: ids.runId } })],
      ["integrity events", () => prisma.tryoutIntegrityEvent.deleteMany({ where: { runId: ids.runId } })],
      ["attempt test run", () => prisma.tryoutAttemptTestRun.deleteMany({ where: { id: ids.runId } })],
      ["attempt", () => prisma.tryoutAttempt.deleteMany({ where: { id: ids.attemptId } })],
      ["delivery assignment", () => prisma.tryoutDeliveryAssignment.deleteMany({ where: { id: ids.assignmentId } })],
      ["admission", () => prisma.tryoutAdmission.deleteMany({ where: { id: ids.admissionId } })],
      ["delivery session", () => prisma.tryoutDeliverySession.deleteMany({ where: { id: ids.sessionId } })],
      ["item options", () => prisma.tryoutItemOption.deleteMany({ where: { tryoutItemId: { in: itemIds } } })],
      ["items", () => prisma.tryoutItem.deleteMany({ where: { id: { in: itemIds } } })],
      ["section", () => prisma.tryoutSection.deleteMany({ where: { id: ids.sectionId } })],
    ];
    for (const [label, step] of steps) {
      try {
        await step();
      } catch (error) {
        failures.push(new Error(`cleanup ${label} failed`, { cause: error }));
      }
    }
    // AssessmentRelease rows are append-only by a database trigger and are
    // intentionally retained along with their exact roots. The disposable
    // database is dropped after this script (see the handoff artifact); never
    // disable the trigger just to make fixture cleanup appear complete.
    console.warn(`CAT retry fixture cleanup retained append-only release ${ids.releaseId} and roots ${ids.tryoutId}/${ids.subtestId}/${ids.studentId}; drop the exact disposable database after the run.`);
    if (failures.length) throw new AggregateError(failures, "CAT retry fixture cleanup was incomplete.");
  }

  let testFailed = false;
  try {
    await prisma.user.create({ data: { id: ids.studentId, email: ids.userEmail, fullName: "CAT retry fixture", passwordHash: "fixture-hash" } });
    await prisma.subtest.create({ data: { id: ids.subtestId, code: `CAT-RETRY-${ids.subtestId.slice(0, 8)}`, name: "CAT Retry" } });
    await prisma.tryoutPackage.create({ data: { id: ids.tryoutId, code: `CAT-RETRY-${ids.tryoutId.slice(0, 8)}`, title: "CAT retry fixture", status: "published", publishedAt: now, createdByUserId: ids.studentId } });
    await prisma.assessmentRelease.create({ data: { id: ids.releaseId, tryoutId: ids.tryoutId, releaseNumber: 1, contentDigest: `cat-retry-${ids.releaseId.replaceAll("-", "")}`, payload: asJson(releasePayload), publishedAt: now, createdByUserId: ids.studentId } });
    await prisma.tryoutSection.create({ data: { id: ids.sectionId, tryoutId: ids.tryoutId, subtestId: ids.subtestId, title: "CAT retry fixture", sequenceNo: 1, durationSeconds: 1800, questionCount: 3, testType: "cat", catItemCount: 3, catModelVersion: modelVersion, scoringConfig: asJson({}) } });
    for (const item of contentItems) {
      await prisma.tryoutItem.create({ data: { id: item.id, tryoutId: ids.tryoutId, tryoutSectionId: ids.sectionId, sortOrder: item.sortOrder, prompt: item.prompt, difficulty: "easy", subtestId: ids.subtestId, packageCode: "CAT-RETRY" } });
      await prisma.tryoutItemOption.createMany({ data: item.options.map((option) => ({ ...option, tryoutItemId: item.id })) });
    }
    await prisma.tryoutDeliverySession.create({ data: { id: ids.sessionId, tryoutId: ids.tryoutId, name: "CAT retry session", availableFrom: new Date(now.getTime() - 60_000), availableUntil, status: "active", assessmentReleaseId: ids.releaseId, createdByUserId: ids.studentId, updatedByUserId: ids.studentId } });
    await prisma.tryoutAdmission.create({ data: { id: ids.admissionId, tryoutId: ids.tryoutId, studentId: ids.studentId, status: "active", decidedAt: now, decidedByUserId: ids.studentId } });
    await prisma.tryoutDeliveryAssignment.create({ data: { id: ids.assignmentId, admissionId: ids.admissionId, deliverySessionId: ids.sessionId, assignedByUserId: ids.studentId } });
    await prisma.tryoutAttempt.create({ data: { id: ids.attemptId, tryoutId: ids.tryoutId, deliverySessionId: ids.sessionId, admissionId: ids.admissionId, studentId: ids.studentId, status: "in_progress", assessmentReleaseId: ids.releaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: `cat-retry-${ids.releaseId.replaceAll("-", "")}`, serverStartedAt: now, serverDeadlineAt: runDeadline, releasePolicySnapshot: asJson({ policy: "manual" }), contentSnapshot: asJson({}) } });
    await prisma.tryoutAttemptTestRun.create({ data: { id: ids.runId, attemptId: ids.attemptId, tryoutSectionId: ids.sectionId, sequenceNo: 1, status: "active", assessmentReleaseId: ids.releaseId, assessmentReleaseNumber: 1, assessmentReleaseDigest: `cat-retry-${ids.releaseId.replaceAll("-", "")}`, serverStartedAt: now, serverDeadlineAt: runDeadline, contentSnapshot: asJson(snapshot), catState: "ready", catSnapshot: asJson(initialCatSnapshot) } });

    const firstState = await attemptState(ids.attemptId, ids.studentId);
    assert.equal(firstState.activeRun?.activeItemId, ids.itemAId, "the initial CAT active item must come from selectedItemIds");
    const firstItems = firstState.activeRun?.contentSnapshot?.items ?? [];
    assert.deepEqual(firstItems.map((item) => item.id), [ids.itemAId], "the participant projection must expose only the selected CAT item in delivery order");
    assert.ok(firstItems.every((item) => (item.options ?? []).every((option) => !("isCorrect" in option))), "answer keys must remain redacted");

    const save = (itemId: string, optionId: string | null, studentId = ids.studentId) => saveTryoutAnswer(ids.attemptId, ids.runId, itemId, optionId, studentId);
    const concurrentResults = await Promise.all([save(ids.itemAId, ids.optionA1Id), save(ids.itemAId, ids.optionA1Id)]);
    assert.equal(new Set(concurrentResults.map((result) => result.answerId)).size, 1, "concurrent identical CAT saves must converge on one answer row");
    const afterConcurrent = await prisma.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: ids.runId } });
    const afterConcurrentSnapshot = afterConcurrent.catSnapshot as typeof initialCatSnapshot;
    assert.equal(afterConcurrentSnapshot.updates.length, 1, "concurrent identical saves must apply one CAT ability update");
    assert.deepEqual(afterConcurrentSnapshot.selectedItemIds, [ids.itemAId, ids.itemCId], "the first save selects the next authoritative item once");
    const savedA = await prisma.tryoutAnswer.findUniqueOrThrow({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: ids.runId, tryoutItemId: ids.itemAId } } });
    assert.equal(savedA.selectedOptionId, ids.optionA1Id);

    const resumedState = await attemptState(ids.attemptId, ids.studentId);
    assert.equal(resumedState.activeRun?.activeItemId, ids.itemCId, "refresh/resume must return the authoritative CAT item, not contentSnapshot.items.at(-1)");
    const resumedItems = resumedState.activeRun?.contentSnapshot?.items ?? [];
    assert.deepEqual(resumedItems.map((item) => item.id), [ids.itemAId, ids.itemCId], "resume projection must preserve adaptive delivery order");
    assert.ok(resumedItems.every((item) => (item.options ?? []).every((option) => !("isCorrect" in option))), "resumed CAT content must remain answer-key redacted");

    await assert.rejects(save(ids.itemAId, ids.optionA2Id), /Jawaban CAT yang sudah tersimpan tidak dapat diubah/u, "a conflicting retry must not overwrite the persisted CAT answer");
    await assert.rejects(save(ids.itemCId, randomUUID()), /Pilihan jawaban tidak termasuk/u, "malformed option ids must be rejected before the answer transition");
    await assert.rejects(save(ids.itemAId, ids.optionA1Id, randomUUID()), /Attempt Tryout tidak ditemukan/u, "an unauthorized student cannot replay an answer");

    await prisma.tryoutAnswer.deleteMany({ where: { attemptId: ids.attemptId } });
    const finalSnapshot = {
      ...initialCatSnapshot,
      currentAbility: 0.1,
      selectedItemIds: catDeliveryOrder,
      updates: [
        { abilityAfter: 0.05, abilityBefore: 0, itemId: ids.itemAId, probability: 0.5, selectedOptionId: ids.optionA1Id },
        { abilityAfter: 0.1, abilityBefore: 0.05, itemId: ids.itemCId, probability: 0.5, selectedOptionId: ids.optionC1Id },
      ],
    };
    await prisma.tryoutAnswer.createMany({ data: [
      { attemptId: ids.attemptId, attemptTestRunId: ids.runId, tryoutId: ids.tryoutId, tryoutItemId: ids.itemAId, selectedOptionId: ids.optionA1Id, answeredAt: new Date(now.getTime() - 2_000) },
      { attemptId: ids.attemptId, attemptTestRunId: ids.runId, tryoutId: ids.tryoutId, tryoutItemId: ids.itemCId, selectedOptionId: ids.optionC1Id, answeredAt: new Date(now.getTime() - 1_000) },
    ] });
    await prisma.tryoutAttempt.update({ where: { id: ids.attemptId }, data: { status: "in_progress", attemptState: "in_progress", submittedAt: null, autoSubmittedAt: null } });
    await prisma.tryoutAttemptTestRun.update({ where: { id: ids.runId }, data: { status: "active", scoringState: "pending", catState: "ready", catSnapshot: asJson(finalSnapshot), sealedAt: null, calculationReleaseable: false, scoringReviewReason: null } });
    const finalSave = await save(ids.itemBId, ids.optionB1Id);
    assert.equal(finalSave.calculationFailed, undefined, "the final CAT save must seal successfully");
    const finalBeforeRetry = await prisma.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: ids.runId } });
    const answerBeforeRetry = await prisma.tryoutAnswer.findUniqueOrThrow({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: ids.runId, tryoutItemId: ids.itemBId } } });
    const attemptBeforeRetry = await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: ids.attemptId } });
    assert.equal(finalBeforeRetry.status, "sealed");
    assert.equal(attemptBeforeRetry.status, "submitted");
    const sealedRetry = await save(ids.itemBId, ids.optionB1Id);
    assert.equal(sealedRetry.answerId, answerBeforeRetry.id, "the final answer retry must return the persisted answer");
    await assert.rejects(save(ids.itemBId, ids.optionB2Id), /Jawaban CAT yang sudah tersimpan tidak dapat diubah/u, "a sealed conflicting retry must remain rejected");
    const finalAfterRetry = await prisma.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: ids.runId } });
    const answerAfterRetry = await prisma.tryoutAnswer.findUniqueOrThrow({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: ids.runId, tryoutItemId: ids.itemBId } } });
    const attemptAfterRetry = await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: ids.attemptId } });
    assert.deepEqual(finalAfterRetry.catSnapshot, finalBeforeRetry.catSnapshot, "a sealed final-answer retry must not recalculate ability or select another item");
    assert.equal(finalAfterRetry.serverDeadlineAt?.getTime(), finalBeforeRetry.serverDeadlineAt?.getTime(), "a sealed final-answer retry must not extend the deadline");
    assert.equal(finalAfterRetry.updatedAt.getTime(), finalBeforeRetry.updatedAt.getTime(), "a sealed final-answer retry must not rewrite the run timestamp");
    assert.equal(answerAfterRetry.answeredAt?.getTime(), answerBeforeRetry.answeredAt?.getTime(), "a sealed final-answer retry must not rewrite answeredAt");
    assert.equal(attemptAfterRetry.status, attemptBeforeRetry.status);
    assert.equal(attemptAfterRetry.updatedAt.getTime(), attemptBeforeRetry.updatedAt.getTime(), "a sealed final-answer retry must not rewrite the attempt timestamp");

    console.log("Tryout CAT active-item/retry DB integration passed (projection, redaction, concurrent duplicate, conflict, malformed/unauthorized, final seal retry).\n");
  } catch (error) {
    testFailed = true;
    throw error;
  } finally {
    let cleanupError: unknown;
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error;
      console.error(error);
    } finally {
      await prisma.$disconnect();
    }
    if (cleanupError && !testFailed) throw cleanupError;
  }
}

await main();
