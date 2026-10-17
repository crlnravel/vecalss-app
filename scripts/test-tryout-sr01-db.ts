import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { attemptState, saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, synchronizeAttempt } from "../lib/tryout/attempt-repository";
import { calculateTryoutAttempt, materializeTryoutAttemptInTransaction, participantTryoutResult, synchronizeTryoutSessionReleaseState } from "../lib/tryout/result-repository";
import { acquireTryoutIdentityMutex } from "../lib/tryout/locks";
import { scoreFixedOrderIrt } from "../lib/tryout/cbt-scoring-policy";
import { EMPTY_EXPIRED_SCORING_VERSION, FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE } from "../lib/tryout/frozen-run-scoring";
import { atSr01Time, createSr01Fixture, sr01History, type Sr01Snapshot } from "./tryout-sr01-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";
import { getOwnedTryoutOperationsView } from "../lib/tryout/operations-view";

type Fixture = Awaited<ReturnType<typeof createSr01Fixture>>;
const fixtures: Fixture[] = [];
const receipts: Array<Record<string, unknown>> = [];
let windowBase = Date.UTC(2036, 0, 1);
await mkdir(".scratch/tryout-sr01", { recursive: true });
async function persist() { await writeFile(".scratch/tryout-sr01/db-evidence.json", JSON.stringify({ fixtures, receipts }, null, 2)); }
async function fixture(name: string, irt = false) {
  const result = await createSr01Fixture(name, fixtures.length, irt, new Date(windowBase + fixtures.length * 2 * 86_400_000));
  fixtures.push(result); await persist(); return result;
}
async function history(f: Fixture) { return sr01History(f.attemptId); }
async function expire(f: Fixture) { return atSr01Time(f.end, () => attemptState(f.attemptId, f.studentId)); }
async function open(f: Fixture, at = f.start) {
  const run = (await history(f)).attempt.runs[0];
  await atSr01Time(at, () => startActiveTestRun(f.attemptId, run.id, f.studentId));
  return run;
}
async function answer(f: Fixture, run: Awaited<ReturnType<typeof open>>, itemIndex = 0, at = f.start) {
  const item = (run.contentSnapshot as unknown as Sr01Snapshot).items[itemIndex];
  return atSr01Time(at, () => saveTryoutAnswer(f.attemptId, run.id, item.id, item.options.find((option) => option.isCorrect)!.id, f.studentId));
}
async function valid(f: Fixture, expected: number) {
  const { attempt } = await history(f);
  assert.notEqual(attempt.score, null, "A legitimate zero needs a persisted aggregate");
  assert.equal(Number(attempt.score), expected);
  assert.equal(attempt.status, "expired");
  assert.equal(attempt.attemptState, "expired");
  assert.equal(attempt.scoringState, "scored");
  assert.equal(attempt.releaseState, "hidden");
  assert.equal(attempt.runs.length, 7);
  for (const run of attempt.runs) {
    assert.notEqual(run.normalizedScore, null); assert.notEqual(run.rawScore, null); assert.notEqual(run.scaledScore, null);
    assert.equal(run.scoringState, "scored"); assert.equal(run.calculationReleaseable, true);
  }
  const breakdowns = await prisma.tryoutScoreBreakdown.findMany({ where: { attemptId: f.attemptId }, orderBy: { subtestId: "asc" } });
  assert.equal(breakdowns.length, 7);
  const dto = await atSr01Time(f.end, () => participantTryoutResult(f.attemptId, f.studentId));
  assert.equal(dto.released, false);
  assert(!("finalScore" in dto) && !("runs" in dto) && !("breakdowns" in dto), "Manual projection must withhold the score/key/review bundle");
  receipts.push({ name: f.name, attemptId: f.attemptId, score: String(attempt.score), runScores: attempt.runs.map((run) => String(run.normalizedScore)), breakdownIds: breakdowns.map((row) => row.id), studentWithheld: true });
  await persist();
  return attempt;
}
async function invalid(f: Fixture, expectedStrictFailure: string | null = FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE) {
  let expiryRefusal: string | null = null;
  await expire(f).catch((error: unknown) => { assert(error instanceof Error); expiryRefusal = error.message; return null; });
  const { attempt } = await history(f);
  assert.equal(attempt.score, null);
  assert.notEqual(attempt.scoringState, "scored");
  assert.equal(await prisma.tryoutScoreBreakdown.count({ where: { attemptId: f.attemptId } }), 0);
  await assert.rejects(calculateTryoutAttempt(f.attemptId, f.ownerId, "SR01 strict refusal"), (error: unknown) => {
    assert(error instanceof Error);
    if (expectedStrictFailure !== null) assert.equal(error.message, expectedStrictFailure, "Strict refusal must match the boundary reached by this fixture");
    return true;
  });
  for (const run of attempt.runs.filter((run) => run.scoringState === "review_required")) {
    assert.equal(run.scoringReviewReason, FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE);
    assert(run.calculationResult && typeof run.calculationResult === "object" && "validationFailure" in run.calculationResult);
  }
  receipts.push({ name: f.name, refused: true, attemptId: f.attemptId, state: attempt.scoringState, expiryRefusal });
  await persist();
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }

try {
  requireTa02LocalDatabase();
  const latestWindow = await prisma.tryoutDeliverySession.aggregate({ _max: { availableUntil: true } });
  windowBase = Math.max(windowBase, latestWindow._max.availableUntil?.getTime() ?? 0) + 2 * 86_400_000;
  const f = await fixture("A01 70 plus six unopened");
  await writeFile(".scratch/tryout-sr01/latest-fixture.json", JSON.stringify(f, null, 2));
  const first = await open(f); await answer(f, first);
  await atSr01Time(f.start, () => sealTryoutTestRun(f.attemptId, first.id, f.studentId));
  const before = await history(f);
  const state = await expire(f);
  const after = await history(f);
  assert.equal(state.status, "expired");
  assert.notEqual(after.attempt.score, null);
  assert.equal(Number(after.attempt.score), 10, "A01 ordinary public expiry must average 70 plus six zero sections to 10");
  assert.equal(before.digest, after.digest, "A13 frozen history/acknowledgments/deadlines must be unchanged");
  await valid(f, 10);
  assert.deepEqual(after.attempt.runs.map((run) => Number(run.normalizedScore)), [70, 0, 0, 0, 0, 0, 0]);
  for (const run of after.attempt.runs.slice(1)) { assert.equal(run.serverStartedAt, null); assert.equal(run.serverDeadlineAt, null); assert.equal(run.answers.length, 0); }
  const registeredOnly = f.students.find((student) => student.id !== f.studentId)!;
  const registeredAdmission = await prisma.tryoutAdmission.create({ data: { tryoutId: f.tryoutId, studentId: registeredOnly.id, status: "active" } });
  await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: registeredAdmission.id, deliverySessionId: f.sessionId, assignedByUserId: f.ownerId } });
  assert.equal(await prisma.tryoutAttempt.count({ where: { deliverySessionId: f.sessionId, studentId: registeredOnly.id } }), 0, "A06 registration without Start has no attempt or aggregate");
  const receiptBefore = await prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: f.sessionId, action: "result.calculated" } });
  const stableBefore = await prisma.tryoutScoreBreakdown.findMany({ where: { attemptId: f.attemptId }, orderBy: { id: "asc" } });
  await atSr01Time(f.end, () => Promise.all([attemptState(f.attemptId, f.studentId), attemptState(f.attemptId, f.studentId)]));
  await calculateTryoutAttempt(f.attemptId, f.ownerId, "SR01 replay");
  assert.equal((await history(f)).digest, before.digest);
  assert.deepEqual(await prisma.tryoutScoreBreakdown.findMany({ where: { attemptId: f.attemptId }, orderBy: { id: "asc" } }), stableBefore);
  assert.equal(receiptBefore, 1);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: f.sessionId, action: "result.calculated" } }), 1);
  console.log("PASS A01/A09/A13 public expiry70+6zero=10; stable IDs/history/audit and manual withholding");

  for (const irt of [false, true]) for (const opened of [false, true]) {
    const empty = await fixture(`A02/A03/A06 ${irt ? "IRT" : "fixed"} ${opened ? "opened blank" : "unopened"}`, irt);
    if (opened) {
      const run = await open(empty);
      const item = (run.contentSnapshot as unknown as Sr01Snapshot).items[0];
      await atSr01Time(empty.start, () => saveTryoutAnswer(empty.attemptId, run.id, item.id, null, empty.studentId));
    }
    const saved = await history(empty);
    await atSr01Time(empty.end, () => Promise.all([attemptState(empty.attemptId, empty.studentId), attemptState(empty.attemptId, empty.studentId)]));
    const scored = await valid(empty, 0);
    assert.equal((await history(empty)).digest, saved.digest);
    for (const run of scored.runs) {
      assert.equal(run.scoringVersion, EMPTY_EXPIRED_SCORING_VERSION);
      assert.equal(run.correctCount, 0); assert.equal(run.wrongCount, 0); assert.equal(run.unansweredCount, 2);
      const result = run.calculationResult as Record<string, unknown>;
      assert.equal(result.rule, "empty_expired_zero"); assert(!("ability" in result));
    }
    assert.equal(await prisma.tryoutAnswer.count({ where: { attemptId: empty.attemptId } }), opened ? 1 : 0);
    assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: empty.sessionId, action: "result.calculated" } }), 1);
  }
  console.log("PASS A02/A03/A06 opened/unopened fixed/IRT true zero; blanks/missing, counters and no invented ability/answers");

  const partial = await fixture("A04 partial IRT", true);
  const partialRun = await open(partial); await answer(partial, partialRun);
  const snapshot = partialRun.contentSnapshot as unknown as Sr01Snapshot;
  const policy = snapshot.scoringConfig as { itemParameters: Array<{ itemId: string; a: number; b: number }> };
  const expected = scoreFixedOrderIrt({ itemParameters: policy.itemParameters, responses: [{ itemId: snapshot.items[0].snapshotId!, isCorrect: true }] });
  await expire(partial);
  const partialAfter = await history(partial);
  assert.equal(Number(partialAfter.attempt.runs[0].normalizedScore), expected.normalizedScore);
  assert(Math.abs(Number(partialAfter.attempt.runs[0].rawScore) - expected.ability) < 0.0001);
  await valid(partial, Math.round(expected.normalizedScore / 7 * 100) / 100);
  console.log("PASS A04 partial IRT established estimator preserved");
  const fullFixed = await fixture("A04 fully answered fixed");
  const fullRun = await open(fullFixed); await answer(fullFixed, fullRun); await answer(fullFixed, fullRun, 1);
  await atSr01Time(fullFixed.start, () => sealTryoutTestRun(fullFixed.attemptId, fullRun.id, fullFixed.studentId));
  await expire(fullFixed); await valid(fullFixed, 14.29);
  assert.equal(Number((await history(fullFixed)).attempt.runs[0].normalizedScore), 100);

  for (const kind of ["nonstring", "foreign-option", "multiple", "foreign-item"] as const) {
    const bad = await fixture(`A03 invalid ${kind}`);
    const [run, otherRun] = (await history(bad)).attempt.runs;
    const item = (run.contentSnapshot as unknown as Sr01Snapshot).items[0];
    const other = (otherRun.contentSnapshot as unknown as Sr01Snapshot).items[0];
    await prisma.tryoutAnswer.create({ data: { attemptId: bad.attemptId, attemptTestRunId: run.id, tryoutId: bad.tryoutId, tryoutItemId: kind === "foreign-item" ? other.id : item.id,
      selectedOptionIds: kind === "nonstring" ? [3] : kind === "foreign-option" ? [randomUUID()] : kind === "multiple" ? item.options.map((option) => option.id) : [] } });
    const frozen = await history(bad); await invalid(bad);
    assert.equal((await history(bad)).digest, frozen.digest);
  }
  for (const kind of ["empty-items", "section-identity", "calibration", "missing-run", "release-digest"] as const) {
    const bad = await fixture(`A05 ${kind}`, kind === "calibration");
    const run = (await history(bad)).attempt.runs[0];
    const form = structuredClone(run.contentSnapshot) as unknown as Sr01Snapshot;
    if (kind === "empty-items") form.items = [];
    if (kind === "section-identity") form.subtestId = randomUUID();
    if (kind === "calibration") form.scoringConfig = { method: "irt_2pl", itemParameters: [] };
    if (kind === "missing-run") await prisma.tryoutAttemptTestRun.delete({ where: { id: run.id } });
    else if (kind === "release-digest") {
      await assert.rejects(prisma.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { assessmentReleaseDigest: "corrupt" } }));
      assert.equal((await history(bad)).attempt.runs[0].assessmentReleaseDigest, bad.releaseDigest);
      await expire(bad); await valid(bad, 0);
      receipts.push({ name: bad.name, databaseRejectedInvalidPin: true }); await persist(); continue;
    } else await prisma.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { contentSnapshot: JSON.parse(JSON.stringify(form)) } });
    if (kind === "section-identity") {
      // The participant label projection refuses the damaged identity after
      // synchronization, rolling its entire transaction back. Strict scoring
      // therefore reaches the established nonterminal gate before validation.
      const beforeRefusal = (await history(bad)).attempt;
      await invalid(bad, "Attempt belum berada pada state terminal yang dapat dihitung, atau telah abandoned/void.");
      assert.deepEqual((await history(bad)).attempt, beforeRefusal, "Identity-projection refusal must roll back every attempted expiry/scoring write");
    } else await invalid(bad, kind === "missing-run" ? null : FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE);
  }
  console.log("PASS A03/A05 invalid selections/content/calibration/canonical set cannot become zero; DB rejects invalid release pin");

  const runOnly = await fixture("A07 run-only deadline");
  const runOnlyFirst = await open(runOnly);
  const runDeadline = new Date(runOnly.start.getTime() + 60_000);
  const runOnlyState = await atSr01Time(runDeadline, () => attemptState(runOnly.attemptId, runOnly.studentId));
  assert.equal(runOnlyState.status, "in_progress");
  assert.equal(runOnlyState.runs[0].status, "expired");
  assert.equal(runOnlyState.runs[1].status, "pending");
  await atSr01Time(runDeadline, () => startActiveTestRun(runOnly.attemptId, runOnlyState.runs[1].id, runOnly.studentId));
  assert.equal((await history(runOnly)).attempt.runs[0].id, runOnlyFirst.id);
  await expire(runOnly); await valid(runOnly, 0);
  console.log("PASS A07 run deadline permits next section before session end");

  const race = await fixture("A08 acknowledged answer vs expiry");
  const raceRun = await open(race, new Date(race.end.getTime() - 30_000));
  const accepted = await answer(race, raceRun, 0, new Date(race.end.getTime() - 1));
  assert.equal(accepted.savedAt?.getTime(), race.end.getTime() - 1);
  await atSr01Time(race.end, async () => {
    const item = (raceRun.contentSnapshot as unknown as Sr01Snapshot).items[1];
    const outcomes = await Promise.allSettled([saveTryoutAnswer(race.attemptId, raceRun.id, item.id, item.options[0].id, race.studentId), attemptState(race.attemptId, race.studentId)]);
    assert.equal(outcomes[0].status, "rejected"); assert.equal(outcomes[1].status, "fulfilled");
  });
  await valid(race, 10);
  assert.equal(await prisma.tryoutAnswer.count({ where: { attemptId: race.attemptId } }), 1);

  const queued = await fixture("A08 queued answer crosses cutoff");
  const queuedRun = await open(queued, new Date(queued.end.getTime() - 30_000));
  const held = deferred<number>(); const release = deferred<void>();
  const holder = prisma.$transaction(async (tx) => {
    await acquireTryoutIdentityMutex(tx, { id: queued.attemptId, kind: "attempt" });
    const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    held.resolve(rows[0].pid); await release.promise;
  }, { timeout: 15_000 });
  const holderPid = await held.promise;
  const clock = new Date(queued.end.getTime() - 1);
  await atSr01Time(clock, async () => {
    const item = (queuedRun.contentSnapshot as unknown as Sr01Snapshot).items[0];
    const saving = saveTryoutAnswer(queued.attemptId, queuedRun.id, item.id, item.options[0].id, queued.studentId);
    const outcome = saving.then(() => "accepted", () => "refused");
    try {
      let blocked = false;
      for (let probe = 0; probe < 100 && !blocked; probe++) {
        const rows = await prisma.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${holderPid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        blocked = rows[0].blocked;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert(blocked, "Probe must prove the public answer is queued under the real mutex");
      clock.setTime(queued.end.getTime()); release.resolve(); await holder;
      assert.equal(await outcome, "refused");
    } finally { release.resolve(); await holder; }
  });
  assert.equal(await prisma.tryoutAnswer.count({ where: { attemptId: queued.attemptId } }), 0);
  await expire(queued); await valid(queued, 0);
  console.log("PASS A08 legal acknowledgment before cutoff, late/concurrent refusal and forced queued-before/acquired-at-cutoff refusal");

  const released = f;
  await prisma.tryoutAttempt.update({ where: { id: released.attemptId }, data: { releaseState: "released", releaseAt: released.end, scoringVersion: "older-aggregation-version" } });
  await prisma.tryoutDeliverySession.update({ where: { id: released.sessionId }, data: { releaseState: "released", releasedAt: released.end, releasedByUserId: released.ownerId, releaseReason: "SR01 immutable published fixture" } });
  const stored = async () => ({ history: (await history(released)).attempt, breakdowns: await prisma.tryoutScoreBreakdown.findMany({ where: { attemptId: released.attemptId }, orderBy: { id: "asc" } }), session: await prisma.tryoutDeliverySession.findUnique({ where: { id: released.sessionId } }), audits: await prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: released.sessionId } }) });
  const publishedDigest = digest(await stored());
  await calculateTryoutAttempt(released.attemptId, released.ownerId, "Must not rewrite released old version");
  await prisma.$transaction((tx) => materializeTryoutAttemptInTransaction(tx, released.attemptId, released.studentId, "Automatic replay", false));
  await prisma.$transaction((tx) => synchronizeAttempt(tx, released.attemptId, released.end, released.studentId));
  await synchronizeTryoutSessionReleaseState(released.sessionId, released.end);
  const publishedProjection = await atSr01Time(released.end, () => participantTryoutResult(released.attemptId, released.studentId));
  assert.equal(publishedProjection.released, true);
  const validOperations = await atSr01Time(released.end, () => getOwnedTryoutOperationsView(released.tryoutId, released.ownerId));
  assert(validOperations);
  const validOwnedAttempt = validOperations.sessions.find((session) => session.id === released.sessionId)!.attempts.find((attempt) => attempt.id === released.attemptId)!;
  const validOwnedResult = validOperations.results.find((result) => result.attemptId === released.attemptId)!;
  assert.equal(validOwnedAttempt.releaseReady, true);
  assert.equal(validOwnedAttempt.releaseIntegrityReason, null);
  assert.equal(validOwnedResult.resultReadiness, "scored");
  assert.equal(validOwnedResult.scoreVisible, true);
  assert.equal(validOwnedResult.reviewReason, null);
  assert(!JSON.stringify(publishedProjection).includes("validationFailure"));
  assert(!JSON.stringify(publishedProjection).includes("diagnostic"));
  assert.equal(digest(await stored()), publishedDigest);
  receipts.push({ name: "A12 released old version", digest: publishedDigest, unchanged: true }); await persist();
  await writeFile(".scratch/tryout-sr01/manual-demo-fixture.json", JSON.stringify(race, null, 2));
  console.log("PASS A12 released old-version explicit/automatic materializers and synchronization preserve byte-equivalent bundle");
  for (const kind of ["score", "breakdown", "run-diagnostic"] as const) {
    const damaged = await fixture(`A12 synthetic published inconsistency ${kind}`);
    await expire(damaged); await valid(damaged, 0);
    await prisma.tryoutAttempt.update({ where: { id: damaged.attemptId }, data: { releaseState: "released", releaseAt: damaged.end, scoringVersion: "older-aggregation-version" } });
    await prisma.tryoutDeliverySession.update({ where: { id: damaged.sessionId }, data: { releaseState: "released", releasedAt: damaged.end, releasedByUserId: damaged.ownerId, releaseReason: "SR01 synthetic publication integrity test" } });
    const marker = "SR01_PRIVATE_DIAGNOSTIC_MUST_NEVER_REACH_PARTICIPANT";
    if (kind === "score") await prisma.tryoutAttempt.update({ where: { id: damaged.attemptId }, data: { score: 99 } });
    if (kind === "breakdown") {
      const breakdown = await prisma.tryoutScoreBreakdown.findFirstOrThrow({ where: { attemptId: damaged.attemptId } });
      await prisma.tryoutScoreBreakdown.update({ where: { id: breakdown.id }, data: { normalizedScore: null } });
    }
    if (kind === "run-diagnostic") {
      const run = (await history(damaged)).attempt.runs[0];
      await prisma.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { calculationResult: { validationFailure: { diagnostic: marker } } } });
    }
    const persisted = async () => ({ attempt: (await history(damaged)).attempt,
      breakdowns: await prisma.tryoutScoreBreakdown.findMany({ where: { attemptId: damaged.attemptId }, orderBy: { id: "asc" } }),
      session: await prisma.tryoutDeliverySession.findUnique({ where: { id: damaged.sessionId } }),
      audits: await prisma.tryoutDeliveryAudit.findMany({ where: { deliverySessionId: damaged.sessionId }, orderBy: { id: "asc" } }),
    });
    const beforeInspection = digest(await persisted());
    const outcome = await synchronizeTryoutSessionReleaseState(damaged.sessionId, damaged.end);
    assert.equal(outcome.ready, false);
    assert("reason" in outcome && outcome.reason === "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu.");
    const automatic = await prisma.$transaction((tx) => materializeTryoutAttemptInTransaction(tx, damaged.attemptId, damaged.studentId, "Published integrity read", false));
    assert.equal(automatic.state, "review_required");
    assert.equal(automatic.reason, "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu.");
    await assert.rejects(calculateTryoutAttempt(damaged.attemptId, damaged.ownerId, "Published integrity refusal"), { message: "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu." });
    const participant = await atSr01Time(damaged.end, () => participantTryoutResult(damaged.attemptId, damaged.studentId)).then((result) => ({ result }), (error: unknown) => ({ error: error instanceof Error ? error.message : "Unknown failure" }));
    assert.deepEqual(participant, { error: "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu." });
    const serialized = JSON.stringify(participant);
    assert(!serialized.includes(marker), "Participant serialization must never contain the exact internal diagnostic marker");
    assert(!serialized.includes("validationFailure") && !serialized.includes("diagnostic"));
    const operations = await atSr01Time(damaged.end, () => getOwnedTryoutOperationsView(damaged.tryoutId, damaged.ownerId));
    assert(operations);
    const ownedAttempt = operations.sessions.find((session) => session.id === damaged.sessionId)!.attempts.find((attempt) => attempt.id === damaged.attemptId)!;
    const ownedResult = operations.results.find((result) => result.attemptId === damaged.attemptId)!;
    assert.equal(ownedAttempt.releaseReady, false);
    assert.equal(ownedAttempt.releaseIntegrityReason, "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu.");
    assert.equal(ownedAttempt.releaseState, "released");
    assert.equal(ownedAttempt.scoringState, "scored", "Read projection must preserve the stored scoring state");
    assert.equal(ownedResult.resultReadiness, "review_required");
    assert.equal(ownedResult.scoreVisible, false);
    assert.equal(ownedResult.displayScore, null);
    assert.equal(ownedResult.reviewReason, "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu.");
    assert(!JSON.stringify(operations).includes(marker), "Owned operations DTO must not serialize the private diagnostic marker");
    assert.equal(digest(await persisted()), beforeInspection, "Published integrity inspection/refusal must not rewrite stored fields or audits");
    receipts.push({ name: damaged.name, integrityReported: true, participantDiagnosticWithheld: true, storedDigest: beforeInspection, unchanged: true }); await persist();
  }
  console.log("PASS A12 synthetic inconsistent publication reported read-only; exact private diagnostic marker withheld");
} finally { await persist(); await prisma.$disconnect(); }
