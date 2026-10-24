import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/prisma/client";
import { calculateTryoutAttempt, inspectTryoutCalculation, participantTryoutResult, releaseTryoutSessionResults } from "../lib/tryout/result-repository";
import { saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, startTryoutAttempt, startTryoutDisconnect, attemptState } from "../lib/tryout/attempt-repository";
import { configureTryoutAdmission, configureTryoutDefaultResultRelease } from "../lib/tryout/delivery-repository";
import { archiveTryoutTransient } from "../lib/tryout/repository";
import { acquireTryoutIdentityMutex } from "../lib/tryout/locks";
import { serveTryoutCalculationInspection } from "../lib/tryout/result-recovery-http";
import { atSr01Time, createSr01Fixture, sr01History, type Sr01Snapshot } from "./tryout-sr01-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";
import type { SessionContext } from "../lib/auth/types";

const output = ".scratch/tryout-sr02/implementation-0d672faf";
type Fixture = Awaited<ReturnType<typeof createSr01Fixture>>;
const fixtures: Fixture[] = [];
const evidence: unknown[] = [];
let windowBase = 0;
await mkdir(output, { recursive: true });
const scope = (f: Fixture) => ({ attemptId: f.attemptId, sessionId: f.sessionId, tryoutId: f.tryoutId });
const count = (f: Fixture) => prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: f.sessionId, action: "result.calculated" } });
const snapshot = async (f: Fixture) => ({ history: (await sr01History(f.attemptId)).attempt, breakdowns: await prisma.tryoutScoreBreakdown.findMany({ where: { attemptId: f.attemptId }, orderBy: { id: "asc" } }), audits: await prisma.tryoutDeliveryAudit.findMany({ where: { deliverySessionId: f.sessionId }, orderBy: { id: "asc" } }) });
async function persist() { await writeFile(`${output}/db-evidence.json`, JSON.stringify({ fixtures, evidence }, null, 2)); }
async function fixture(name: string, answered = false, irt = false) {
  const f = await createSr01Fixture(`SR02 ${name}`, fixtures.length, irt, new Date(windowBase + fixtures.length * 2 * 86_400_000));
  fixtures.push(f);
  await prisma.tryoutPackage.update({ where: { id: f.tryoutId }, data: { title: `SR-02 ${name}` } });
  if (answered) {
    const run = (await sr01History(f.attemptId)).attempt.runs[0];
    const item = (run.contentSnapshot as unknown as Sr01Snapshot).items[0];
    await atSr01Time(f.start, async () => {
      await startActiveTestRun(f.attemptId, run.id, f.studentId);
      await saveTryoutAnswer(f.attemptId, run.id, item.id, item.options.find((option) => option.isCorrect)!.id, f.studentId);
      await sealTryoutTestRun(f.attemptId, run.id, f.studentId);
    });
  }
  // Only this fresh fixture simulates the pre-SR01 terminal expiry shape.
  await prisma.tryoutAttempt.update({ where: { id: f.attemptId }, data: { status: "expired", attemptState: "expired", scoringState: "review_required" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: f.attemptId, status: "pending" }, data: { status: "expired", scoringState: "review_required", calculationReleaseable: false } });
  await persist(); return f;
}
async function assertRefusal(f: Fixture, work: () => Promise<unknown>) {
  const before = await snapshot(f);
  await assert.rejects(work);
  assert.deepEqual(await snapshot(f), before, "A refusal must be atomic, including audit/run/answer/aggregate/breakdown fields");
}
try {
  requireTa02LocalDatabase();
  const last = await prisma.tryoutDeliverySession.aggregate({ _max: { availableUntil: true } });
  windowBase = Math.max(Date.UTC(2038, 0, 1), last._max.availableUntil?.getTime() ?? 0) + 2 * 86_400_000;
  const f = await fixture("ordinary historical recovery", true);
  const before = await sr01History(f.attemptId);
  await writeFile(`${output}/historical-fixture.json`, JSON.stringify({ ...f, beforeDigest: before.digest }, null, 2));
  assert.equal((await inspectTryoutCalculation(scope(f), f.ownerId))?.state, "ready");
  await assertRefusal(f, () => calculateTryoutAttempt(f.attemptId, f.ownerId, " "));
  await assertRefusal(f, () => calculateTryoutAttempt(f.attemptId, f.studentId, "Unauthorized"));
  await assertRefusal(f, () => calculateTryoutAttempt(f.attemptId, f.students[1].id, "Foreign owner"));
  await assertRefusal(f, () => calculateTryoutAttempt(f.attemptId, f.ownerId, "Forged scope", false, { ...scope(f), sessionId: randomUUID() }));
  await assertRefusal(f, () => calculateTryoutAttempt(f.attemptId, f.ownerId, "Forged target", false, { ...scope(f), attemptId: randomUUID() }));
  assert.equal(await inspectTryoutCalculation(scope(f), f.studentId), null);
  assert.equal(await inspectTryoutCalculation({ ...scope(f), tryoutId: randomUUID() }, f.ownerId), null);
  const result = await calculateTryoutAttempt(f.attemptId, f.ownerId, "Pulihkan skor pengerjaan lama yang kedaluwarsa.", false, scope(f));
  assert.notEqual(result.finalScore, null); assert.notEqual(result.finalScore, undefined);
  assert.equal(result.finalScore, 10, "Historical recovery averages70+six zero scores"); assert(result.receipt);
  const after = await sr01History(f.attemptId);
  assert.equal(after.digest, before.digest);
  assert.equal(after.attempt.attemptState, "expired"); assert.equal(after.attempt.releaseState, "hidden");
  assert.notEqual(after.attempt.score, null);
  for (const run of after.attempt.runs) for (const key of ["normalizedScore", "rawScore", "scaledScore"] as const) assert.notEqual(run[key], null, `${key} is persisted, not null-as-zero`);
  assert.deepEqual(after.attempt.runs.map((row) => Number(row.normalizedScore)), [70, 0, 0, 0, 0, 0, 0]);
  assert.equal(await count(f), 1);
  const stable = await snapshot(f);
  const repeated = await Promise.all([calculateTryoutAttempt(f.attemptId, f.ownerId, "Ulangi pemeriksaan."), calculateTryoutAttempt(f.attemptId, f.ownerId, "Ulangi pemeriksaan.")]);
  repeated.forEach((reply) => assert.deepEqual(reply.receipt, result.receipt)); assert.deepEqual(await snapshot(f), stable);
  const read = await inspectTryoutCalculation(scope(f), f.ownerId);
  assert.equal(read?.state, "calculated"); assert.deepEqual(read?.receipt, result.receipt);
  assert(!JSON.stringify(read).match(/contentSnapshot|selectedOption|isCorrect|assessmentReleaseDigest|calculationInput/));
  const student = await atSr01Time(f.end, () => participantTryoutResult(f.attemptId, f.studentId));
  assert.equal(student.released, false); assert(!("finalScore" in student) && !("runs" in student));
  evidence.push({ case: "A10/A11/A13", fixture: f.attemptId, beforeDigest: before.digest, afterDigest: after.digest, receipt: result.receipt, finalScore: result.finalScore, refusedAtomically: ["reason", "student", "foreign owner", "scope", "target"], studentWithheld: true }); await persist();
  console.log("PASS SR02 historical70+6zero=10; non-null scores, immutable history, stable concurrent receipt/audit, owner projection and student withholding");

  const inconsistentScore = await fixture("inconsistent previously scored section", true);
  const scoredRun = (await sr01History(inconsistentScore.attemptId)).attempt.runs[0];
  const restoreScoredRun = {
    normalizedScore: scoredRun.normalizedScore, rawScore: scoredRun.rawScore, scaledScore: scoredRun.scaledScore, maxScore: scoredRun.maxScore,
    correctCount: scoredRun.correctCount, wrongCount: scoredRun.wrongCount, unansweredCount: scoredRun.unansweredCount,
    calculationVersion: scoredRun.calculationVersion, scoringVersion: scoredRun.scoringVersion,
    calculationReleaseable: scoredRun.calculationReleaseable, scoringReviewReason: scoredRun.scoringReviewReason,
    calculationResult: scoredRun.calculationResult as Prisma.InputJsonValue,
  };
  const scoreCorruptions: Array<{ name: string; data: Prisma.TryoutAttemptTestRunUpdateInput }> = [
    { name: "normalized99 instead of frozen70", data: { normalizedScore: 99 } },
    { name: "raw score", data: { rawScore: 9 } },
    { name: "scaled score", data: { scaledScore: 99 } },
    { name: "maximum score", data: { maxScore: 20 } },
    { name: "answer counters", data: { wrongCount: 1 } },
    { name: "non-releaseable scored state", data: { calculationReleaseable: false } },
    { name: "diagnostic marker", data: { calculationResult: { ...(scoredRun.calculationResult as object), validationFailure: { diagnostic: "private diagnostic marker" } } } },
    { name: "calculation receipt mismatch", data: { calculationResult: { ...(scoredRun.calculationResult as object), normalizedScore: 99 } } },
    { name: "review reason", data: { scoringReviewReason: "private diagnostic marker" } },
    { name: "version mismatch", data: { calculationVersion: "invalid-calculation-version" } },
  ];
  for (const corruption of scoreCorruptions) {
    await prisma.tryoutAttemptTestRun.update({ where: { id: scoredRun.id }, data: corruption.data });
    const beforeRefusal = await snapshot(inconsistentScore);
    await assertRefusal(inconsistentScore, () => calculateTryoutAttempt(inconsistentScore.attemptId, inconsistentScore.ownerId, "Refuse damaged scored history"));
    const readSession: SessionContext = { sessionId: "read-only-score-check", expiresAt: new Date(Date.now() + 10000), user: { id: inconsistentScore.ownerId, email: "tutor@vecalss.local", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
    const response = await serveTryoutCalculationInspection(new Request(`http://localhost/api/mentor/tryout/result-recovery?${new URLSearchParams(scope(inconsistentScore))}`), { getSession: async () => readSession, read: inspectTryoutCalculation });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.snapshot.state, "blocked"); assert.equal(body.snapshot.sections[0].ready, false);
    assert.doesNotMatch(JSON.stringify(body), /private diagnostic|validationFailure|contentSnapshot|selectedOption|invalid-calculation-version/);
    assert.deepEqual(await snapshot(inconsistentScore), beforeRefusal, "GET and refused write leave every stored field unchanged");
    assert.equal(await count(inconsistentScore), 0);
    await prisma.tryoutAttemptTestRun.update({ where: { id: scoredRun.id }, data: restoreScoredRun });
  }
  const coherentHistory = await sr01History(inconsistentScore.attemptId);
  const coherent = await calculateTryoutAttempt(inconsistentScore.attemptId, inconsistentScore.ownerId, "Coherent stored score control");
  assert.equal(coherent.finalScore, 10); assert(coherent.receipt); assert.equal(await count(inconsistentScore), 1);
  assert.equal((await sr01History(inconsistentScore.attemptId)).digest, coherentHistory.digest);
  const coherentBeforeReplay = await snapshot(inconsistentScore);
  assert.deepEqual((await calculateTryoutAttempt(inconsistentScore.attemptId, inconsistentScore.ownerId, "Read coherent existing receipt")).receipt, coherent.receipt);
  assert.deepEqual(await snapshot(inconsistentScore), coherentBeforeReplay);
  evidence.push({ case: "A11 reused scored history refuses inconsistent scores/state/receipt atomically", fixture: inconsistentScore.attemptId, variants: scoreCorruptions.map((row) => row.name), coherentScore: coherent.finalScore, coherentReceipt: coherent.receipt }); await persist();
  console.log("PASS ten reused scored-section inconsistencies refuse atomically; independent GET blocked without diagnostics; coherent70 control recovers10 with stable receipt");

  const fractionalIrt = await fixture("fractional IRT storage precision and replay", true, true);
  const fractionalHistory = await sr01History(fractionalIrt.attemptId);
  // One correct response, a=1/b=0, unit normal prior: bounded MAP ability
  // 0.401058... gives normalized59.89; seven-section final is8.56.
  assert.notEqual(fractionalHistory.attempt.runs[0].rawScore, null);
  assert.equal(Number(fractionalHistory.attempt.runs[0].rawScore), 0.4011);
  assert.equal(Number(fractionalHistory.attempt.runs[0].normalizedScore), 59.89);
  const fractionalReceipt = await calculateTryoutAttempt(fractionalIrt.attemptId, fractionalIrt.ownerId, "Pulihkan hasil IRT pecahan");
  assert.equal(fractionalReceipt.finalScore, 8.56); assert(fractionalReceipt.receipt);
  const fractionalStored = await snapshot(fractionalIrt);
  const answeredBreakdown = fractionalStored.breakdowns.find((row) => row.correctCount === 1)!;
  assert(answeredBreakdown); assert.notEqual(answeredBreakdown.rawScore, null);
  assert.equal(Number(answeredBreakdown.rawScore), 0.4, "Breakdown raw score persists at two places");
  assert.notEqual(fractionalStored.history.rawScore, null);
  assert.equal(Number(fractionalStored.history.rawScore), 0.4011, "Aggregate sums persisted four-place run raw scores");
  assert.equal(fractionalStored.history.correctCount, 1); assert.equal(fractionalStored.history.wrongCount, 0); assert.equal(fractionalStored.history.unansweredCount, 13);
  assert.equal((await sr01History(fractionalIrt.attemptId)).digest, fractionalHistory.digest);
  const fractionalRead = await inspectTryoutCalculation(scope(fractionalIrt), fractionalIrt.ownerId);
  assert.equal(fractionalRead?.state, "calculated");
  assert.deepEqual((await calculateTryoutAttempt(fractionalIrt.attemptId, fractionalIrt.ownerId, "Periksa hasil IRT tersimpan")).receipt, fractionalReceipt.receipt);
  assert.deepEqual(await snapshot(fractionalIrt), fractionalStored, "Fractional IRT replay is byte-equivalent, without another audit");
  const aggregateCorruptions: Array<{ name: string; data: Prisma.TryoutAttemptUpdateInput }> = [
    { name: "aggregate raw score", data: { rawScore: 99 } },
    { name: "missing aggregate raw score", data: { rawScore: null } },
    { name: "aggregate correct count", data: { correctCount: 2 } },
    { name: "missing aggregate correct count", data: { correctCount: null } },
    { name: "aggregate wrong count", data: { wrongCount: 1 } },
    { name: "missing aggregate wrong count", data: { wrongCount: null } },
    { name: "aggregate unanswered count", data: { unansweredCount: 12 } },
    { name: "missing aggregate unanswered count", data: { unansweredCount: null } },
  ];
  for (const corruption of aggregateCorruptions) {
    await prisma.tryoutAttempt.update({ where: { id: fractionalIrt.attemptId }, data: corruption.data });
    const beforeRefusal = await snapshot(fractionalIrt);
    await assertRefusal(fractionalIrt, () => calculateTryoutAttempt(fractionalIrt.attemptId, fractionalIrt.ownerId, "Refuse corrupt aggregate"));
    const aggregateSession: SessionContext = { sessionId: "read-only-aggregate-check", expiresAt: new Date(Date.now() + 10000), user: { id: fractionalIrt.ownerId, email: "tutor@vecalss.local", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
    const response = await serveTryoutCalculationInspection(new Request(`http://localhost/api/mentor/tryout/result-recovery?${new URLSearchParams(scope(fractionalIrt))}`), { getSession: async () => aggregateSession, read: inspectTryoutCalculation });
    assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.snapshot.state, "blocked"); assert.equal(body.snapshot.finalScore, null);
    assert.doesNotMatch(JSON.stringify(body), /validationFailure|contentSnapshot|selectedOption|rawScore|correctCount|wrongCount|unansweredCount/);
    assert.deepEqual(await snapshot(fractionalIrt), beforeRefusal, "Aggregate refusal and safe GET leave entire history and original audit unchanged");
    assert.equal(await count(fractionalIrt), 1);
    await prisma.tryoutAttempt.update({ where: { id: fractionalIrt.attemptId }, data: { rawScore: fractionalStored.history.rawScore, correctCount: fractionalStored.history.correctCount, wrongCount: fractionalStored.history.wrongCount, unansweredCount: fractionalStored.history.unansweredCount } });
  }
  assert.equal((await inspectTryoutCalculation(scope(fractionalIrt), fractionalIrt.ownerId))?.state, "calculated");
  assert.deepEqual((await calculateTryoutAttempt(fractionalIrt.attemptId, fractionalIrt.ownerId, "Coherent aggregate control")).receipt, fractionalReceipt.receipt);
  evidence.push({ case: "fractional IRT raw precision and stable replay; aggregate raw/counter refusals", fixture: fractionalIrt.attemptId, runRaw: "0.4011", breakdownRaw: "0.40", finalScore: fractionalReceipt.finalScore, receipt: fractionalReceipt.receipt, variants: aggregateCorruptions.map((row) => row.name) }); await persist();
  console.log("PASS fractional IRT runraw0.4011/breakdown0.40→final8.56 stable replay; eight aggregate raw/counter corruptions refuse atomically and safe GET blocks");

  const damaged = await fixture("damaged frozen final section");
  const damagedRun = (await sr01History(damaged.attemptId)).attempt.runs[6];
  await prisma.tryoutAttemptTestRun.update({ where: { id: damagedRun.id }, data: { contentSnapshot: { ...(damagedRun.contentSnapshot as object), items: [] } } });
  await assertRefusal(damaged, () => calculateTryoutAttempt(damaged.attemptId, damaged.ownerId, "Check corruption"));
  const damagedRead = await inspectTryoutCalculation(scope(damaged), damaged.ownerId);
  assert.equal(damagedRead?.state, "blocked"); assert.equal(damagedRead?.sections.find((row) => row.sequenceNo === 7)?.ready, false);
  assert.equal(await count(damaged), 0);
  evidence.push({ case: "corrupt atomic refusal", fixture: damaged.attemptId, snapshot: damagedRead }); await persist();
  console.log("PASS corrupt final run refuses with no partial scoring writes; safe section blocker");

  const archived = await fixture("archived history recovery");
  const archiveBefore = await sr01History(archived.attemptId);
  await Promise.all([archiveTryoutTransient(archived.tryoutId, archived.ownerId), calculateTryoutAttempt(archived.attemptId, archived.ownerId, "Pemulihan hasil arsip")]);
  assert.equal((await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: archived.tryoutId } })).status, "archived");
  assert.equal((await sr01History(archived.attemptId)).digest, archiveBefore.digest);
  assert.equal((await inspectTryoutCalculation(scope(archived), archived.ownerId))?.state, "calculated");
  await assert.rejects(configureTryoutAdmission(archived.tryoutId, "open", archived.ownerId, "Forged archive edit"));
  await assert.rejects(configureTryoutDefaultResultRelease(archived.tryoutId, "immediate", archived.ownerId, "Forged policy"));
  await assert.rejects(startTryoutAttempt(archived.sessionId, archived.studentId));
  const archivedRun = (await sr01History(archived.attemptId)).attempt.runs[0];
  await assert.rejects(startTryoutDisconnect(archived.attemptId, archivedRun.id, archived.ownerId, "Forbidden disconnect"));
  evidence.push({ case: "archive/recovery race and fences", fixture: archived.attemptId, historyDigest: archiveBefore.digest }); await persist();
  console.log("PASS archive/recovery serialize coherently; archived admissions/Start/policy/disconnect refused");

  await atSr01Time(f.end, () => releaseTryoutSessionResults(f.sessionId, f.ownerId, "Publication fixture"));
  await prisma.tryoutAttempt.update({ where: { id: f.attemptId }, data: { scoringVersion: "historical-calculation" } });
  const published = await snapshot(f);
  await calculateTryoutAttempt(f.attemptId, f.ownerId, "Existing published receipt");
  assert.deepEqual(await snapshot(f), published);
  assert.equal((await inspectTryoutCalculation(scope(f), f.ownerId))?.state, "released");
  const inconsistent = await fixture("inconsistent published session");
  await prisma.tryoutDeliverySession.update({ where: { id: inconsistent.sessionId }, data: { releaseState: "released", releasedAt: new Date() } });
  await assertRefusal(inconsistent, () => calculateTryoutAttempt(inconsistent.attemptId, inconsistent.ownerId, "Do not expand bundle"));
  assert.equal((await inspectTryoutCalculation(scope(inconsistent), inconsistent.ownerId))?.state, "blocked");
  evidence.push({ case: "published old-version immutable; inconsistent session read-only", releasedFixture: f.attemptId, inconsistentFixture: inconsistent.attemptId }); await persist();
  console.log("PASS released old-version result immutable; inconsistent session never expanded");

  const held = await fixture("independent read while command lock held");
  let release!: () => void; let locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); const acquired = new Promise<void>((resolve) => { locked = resolve; });
  const holder = prisma.$transaction(async (tx) => { await acquireTryoutIdentityMutex(tx, { id: held.attemptId, kind: "attempt" }); locked(); await gate; }, { timeout: 10000 });
  await acquired;
  const pendingWrite = calculateTryoutAttempt(held.attemptId, held.ownerId, "Held command recovery");
  try {
    const session: SessionContext = { sessionId: "read-only-test", expiresAt: new Date(Date.now() + 10000), user: { id: held.ownerId, email: "tutor@vecalss.local", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
    const response = await Promise.race([serveTryoutCalculationInspection(new Request(`http://localhost/api/mentor/tryout/result-recovery?${new URLSearchParams(scope(held))}`), { getSession: async () => session, read: inspectTryoutCalculation }), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Independent read queued behind write")), 2500); timer.unref(); })]);
    assert.equal(response.status, 200); assert.equal((await response.json()).snapshot.state, "ready");
    evidence.push({ case: "real HTTP handler + DB read dispatched before held write lock released", fixture: held.attemptId });
  } finally { release(); await holder; await pendingWrite; }
  await atSr01Time(held.end, () => attemptState(held.attemptId, held.studentId));
  assert.equal(await count(held), 1);
  console.log("PASS ordinary HTTP/DB inspection completes while command lock is held; expiry replay adds no audit");

  const ordinaryQA = await fixture("QA ordinary unrecovered", true);
  const archivedQA = await fixture("QA archived unrecovered", true);
  await archiveTryoutTransient(archivedQA.tryoutId, archivedQA.ownerId);
  await writeFile(`${output}/qa-fixtures.json`, JSON.stringify({ ordinary: { ...ordinaryQA, immutableDigest: (await sr01History(ordinaryQA.attemptId)).digest }, archived: { ...archivedQA, immutableDigest: (await sr01History(archivedQA.attemptId)).digest }, damaged, inconsistent }, null, 2));
  await persist();
} finally { await prisma.$disconnect(); }
