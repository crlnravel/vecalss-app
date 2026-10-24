import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { calculateTryoutAttempt, inspectTryoutSessionReadiness, participantTryoutResult, releaseTryoutSessionResults } from "../lib/tryout/result-repository";
import { atSr01Time, createSr01Fixture, sr01History } from "./tryout-sr01-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";
import { startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { participantTryoutDetail } from "../lib/tryout/participant-repository";
import { archiveTryoutTransient } from "../lib/tryout/repository";
import { configureTryoutDefaultResultRelease, updateTryoutDeliverySessionSchedule } from "../lib/tryout/delivery-repository";
import { createPrismaContextRegistry } from "../lib/vera-ai/context-query-registry";
import { createPrismaVeraContextResolver } from "../lib/vera-ai/prisma-context-resolver";
import { createPrismaLocalContextRegistry } from "../lib/vera-ai/local-context-registry";
import { prepareFrozenDrillAuthority } from "../lib/vera-ai/drill-candidates";
import { VeraLearnerService } from "../lib/vera-ai/learner-service";
import { EnvelopeService, InMemoryEnvelopeKeyRegistry } from "../lib/vera-ai/envelope";
import { questionRevisionContentDigest } from "../lib/question-bank/revision";
import { serveTryoutReadinessInspection } from "../lib/tryout/result-readiness-http";
import { requireTryoutCapability } from "../lib/tryout/capabilities";
import { hasRole } from "../lib/auth/session";
import type { SessionContext } from "../lib/auth/types";

type Fixture = Awaited<ReturnType<typeof createSr01Fixture>>;
async function score(f: Fixture, attemptId = f.attemptId) {
  await prisma.tryoutAttempt.update({ where: { id: attemptId }, data: { status: "expired", attemptState: "expired", scoringState: "review_required" } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId }, data: { status: "expired", scoringState: "review_required", calculationReleaseable: false } });
  await calculateTryoutAttempt(attemptId, f.ownerId, "Siapkan hasil untuk pemeriksaan rilis.");
}
async function addAttempt(f: Fixture, index: number) {
  const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: f.tryoutId, studentId: f.students.filter((student) => student.id !== f.studentId)[index].id, status: "active" } });
  await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: f.sessionId, assignedByUserId: f.ownerId } });
  const started = await atSr01Time(f.start, () => startTryoutAttempt(f.sessionId, admission.studentId));
  return { id: started.attemptId, studentId: admission.studentId };
}

/** Drill additionally requires bank revision provenance, absent from direct snapshots.
 * This focused consumer fixture follows the existing drill contract; the separate
 * seven-run fixture above exercises the real manual-publication command. */
async function proveExpiredDrillConsumer(f: Fixture) {
  const { subtestId } = await prisma.tryoutSection.findUniqueOrThrow({ where: { id: (await sr01History(f.attemptId)).attempt.runs[0].tryoutSectionId }, select: { subtestId: true } });
  const topic = await prisma.topic.create({ data: { subtestId, code: `sr04-${randomUUID()}`, name: "SR04 disposable drill provenance" } });
  const questionId = randomUUID(); const revisionId = randomUUID();
  const options = [{ label: "A", content: "4", isCorrect: true, sortOrder: 1 }, { label: "B", content: "5", isCorrect: false, sortOrder: 2 }];
  const digest = questionRevisionContentDigest({ difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", options, prompt: "Berapa 2 + 2?", questionType: "single_choice" });
  await prisma.$transaction(async (tx) => {
    await tx.question.create({ data: { id: questionId, code: `sr04-${questionId}`, subtestId, topicId: topic.id, stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", status: "published", currentRevisionId: revisionId, createdByUserId: f.ownerId, updatedByUserId: f.ownerId } });
    await tx.questionRevision.create({ data: { id: revisionId, questionId, revisionNo: 1, status: "draft", provenance: "authored", stem: "Berapa 2 + 2?", questionType: "single_choice", difficulty: "easy", explanation: "Dua ditambah dua adalah empat.", contentDigest: digest, createdByUserId: f.ownerId, updatedByUserId: f.ownerId, options: { createMany: { data: options } } } });
    await tx.questionRevision.update({ where: { id: revisionId }, data: { status: "ready", readyAt: new Date() } });
  });
  const tryout = await prisma.tryoutPackage.create({ data: { code: `SR04-${randomUUID()}`, title: "SR04 isolated drill consumer", status: "published", publishedAt: new Date(), createdByUserId: f.ownerId } });
  const release = await prisma.assessmentRelease.create({ data: { tryoutId: tryout.id, releaseNumber: 1, contentDigest: digest, payload: { version: 1 }, publishedAt: new Date(), createdByUserId: f.ownerId } });
  const session = await prisma.tryoutDeliverySession.create({ data: { tryoutId: tryout.id, name: "SR04 drill consumer fixture", availableFrom: new Date(Date.now() - 600000), availableUntil: new Date(Date.now() - 60000), status: "closed", assessmentReleaseId: release.id, createdByUserId: f.ownerId, updatedByUserId: f.ownerId } });
  const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: tryout.id, studentId: f.studentId, status: "active" } });
  const section = await prisma.tryoutSection.create({ data: { tryoutId: tryout.id, subtestId, title: "Drill", sequenceNo: 1, durationSeconds: 60, questionCount: 1 } });
  const item = await prisma.tryoutItem.create({ data: { tryoutId: tryout.id, tryoutSectionId: section.id, subtestId, packageCode: "SR04-DRILL", sortOrder: 1, prompt: "Mutable prompt", explanation: "Mutable explanation", difficulty: "easy", sourceQuestionId: questionId, sourceQuestionRevisionId: revisionId, sourceContentDigest: digest, sourceRevisionProvenance: "authored" } });
  const attempt = await prisma.tryoutAttempt.create({ data: { tryoutId: tryout.id, deliverySessionId: session.id, admissionId: admission.id, studentId: f.studentId, status: "expired", attemptState: "expired", scoringState: "scored", assessmentReleaseId: release.id, assessmentReleaseNumber: 1, assessmentReleaseDigest: digest, serverStartedAt: session.availableFrom, serverDeadlineAt: session.availableUntil, score: 70, releasePolicySnapshot: { policy: "manual" }, contentSnapshot: { version: 1 } } });
  await prisma.tryoutAttemptTestRun.create({ data: { attemptId: attempt.id, tryoutSectionId: section.id, sequenceNo: 1, status: "expired", scoringState: "scored", calculationReleaseable: true, assessmentReleaseId: release.id, assessmentReleaseNumber: 1, assessmentReleaseDigest: digest, contentSnapshot: { items: [{ id: item.id, prompt: "Frozen drill prompt", explanation: "Frozen drill explanation", sourceQuestionId: questionId, sourceQuestionRevisionId: revisionId, sourceContentDigest: digest, difficulty: "easy", options: options.map((option) => ({ choiceKey: option.label, content: option.content, isCorrect: option.isCorrect })) }] } } });
  await assert.rejects(prepareFrozenDrillAuthority(prisma, f.studentId, [attempt.id]));
  await prisma.tryoutAttempt.update({ where: { id: attempt.id }, data: { releaseState: "released", releaseAt: new Date() } });
  await assert.rejects(prepareFrozenDrillAuthority(prisma, f.studentId, [attempt.id]), "A stale attempt flag cannot bypass the session publication gate");
  await prisma.tryoutDeliverySession.update({ where: { id: session.id }, data: { releaseState: "released", releasedAt: new Date() } });
  const authority = await prepareFrozenDrillAuthority(prisma, f.studentId, [attempt.id]); assert.equal(authority.candidates.length, 1); assert.equal(authority.candidates[0].prompt, "Frozen drill prompt");
  await assert.rejects(prepareFrozenDrillAuthority(prisma, f.ownerId, [attempt.id]));
  for (const attemptState of ["void", "abandoned"] as const) { await prisma.tryoutAttempt.update({ where: { id: attempt.id }, data: { attemptState } }); await assert.rejects(prepareFrozenDrillAuthority(prisma, f.studentId, [attempt.id])); }
  return { attemptId: attempt.id, sessionId: session.id, provenance: "bank revision", originalLifecycle: "expired", candidates: authority.candidates.length };
}

requireTa02LocalDatabase();
try {
  await mkdir(".scratch/tryout-sr04", { recursive: true });
  const previous = await prisma.tryoutPackage.findMany({ where: { title: "SR-01 SR04 stable publication receipt" }, select: { id: true, title: true, deliverySessions: { select: { id: true, releaseState: true, releasedAt: true, attempts: { select: { id: true, status: true, attemptState: true, scoringState: true, releaseState: true } } } } } });
  await writeFile(".scratch/tryout-sr04/alternate-gap-baseline.json", JSON.stringify({ previousFixtureStates: previous, originalRedLog: ".scratch/tryout-sr04/group4.log", violatedExpectation: "released scored expired lifecycle must be consumable by owner; do not rewrite status to scored" }, null, 2));
  const last = await prisma.tryoutDeliverySession.aggregate({ _max: { availableUntil: true } });
  const start = new Date(Math.max(Date.now(), last._max.availableUntil?.getTime() ?? 0) + 2 * 86_400_000);
  const f = await createSr01Fixture("SR04 stable publication receipt", 0, false, start);
  await score(f);
  const second = await addAttempt(f, 0); await score(f, second.id);
  const excluded = await addAttempt(f, 1);
  await prisma.tryoutAttempt.update({ where: { id: excluded.id }, data: { attemptState: "void", status: "scored", scoringState: "scored", releaseState: "released", score: 99 } });
  await prisma.tryoutAttemptTestRun.updateMany({ where: { attemptId: excluded.id }, data: { contentSnapshot: {}, status: "pending" } });
  const before = await sr01History(f.attemptId);
  const immutableScores = JSON.stringify({ score: before.attempt.score, runs: before.attempt.runs.map(({ rawScore, scaledScore, normalizedScore, calculationResult }) => ({ rawScore, scaledScore, normalizedScore, calculationResult })) });
  const scope = { tryoutId: f.tryoutId, sessionId: f.sessionId };
  const reason = "Semua hasil sesi sudah diperiksa.";
  const auditCount = () => prisma.tryoutDeliveryAudit.count({ where: { deliverySessionId: f.sessionId, action: "result.bundle_released" } });
  const hidden = await atSr01Time(f.end, () => participantTryoutResult(f.attemptId, f.studentId));
  assert.equal(hidden.released, false); for (const key of ["finalScore", "runs", "breakdowns", "ranking", "report"]) assert(!(key in hidden));
  const detail = await atSr01Time(f.end, () => participantTryoutDetail(f.tryoutId, f.studentId));
  assert(detail); assert.doesNotMatch(JSON.stringify(detail), /"(?:isCorrect|explanation|rawScore|normalizedScore|finalScore)":/);
  const registry = createPrismaContextRegistry(prisma); const resolver = createPrismaVeraContextResolver(prisma);
  const localRegistry = createPrismaLocalContextRegistry(prisma);
  const learner = new VeraLearnerService(prisma, new EnvelopeService(new InMemoryEnvelopeKeyRegistry()), "SR04 disposable cursor", "SR04 disposable fingerprint");
  const conversation = await prisma.aiConversation.create({ data: { studentId: f.studentId, conversationType: "vera_chat", title: "SR04 disposable context verification" } });
  const sources = () => learner.listSources({ studentId: f.studentId, type: "practice", limit: 1000, cursor: null });
  const metadata = () => localRegistry.listMetadata({ studentId: f.studentId, conversationId: conversation.id, query: f.title, now: f.end });
  assert.deepEqual(await registry.listTryout({ studentId: f.studentId, now: f.end, sourceIds: [f.attemptId] }), []);
  await assert.rejects(resolver.resolve({ sourceType: "practice", sourceId: f.attemptId }, { studentId: f.studentId }));
  assert(!(await sources()).sources.some((source) => source.sourceId === f.attemptId));
  assert(!(await metadata()).some((source) => source.stableSourceId === f.attemptId));
  await assert.rejects(prepareFrozenDrillAuthority(prisma, f.studentId, [f.attemptId]));
  await assert.rejects(learner.replaceContext({ studentId: f.studentId, conversationId: conversation.id, expectedContextVersion: 0, sources: [{ sourceType: "practice", sourceId: f.attemptId }] }));
  await assert.rejects(atSr01Time(new Date(f.end.getTime() - 1), () => releaseTryoutSessionResults(f.sessionId, f.ownerId, reason)), /belum berakhir/);
  await assert.rejects(releaseTryoutSessionResults(f.sessionId, f.studentId, reason));
  await assert.rejects(releaseTryoutSessionResults(f.sessionId, f.ownerId, " "));
  await assert.rejects(releaseTryoutSessionResults(f.sessionId, f.ownerId, reason, false, "11111111-1111-4111-8111-111111111111"));
  assert.equal(await auditCount(), 0);
  const ready = await atSr01Time(f.end, () => inspectTryoutSessionReadiness(scope, f.ownerId)); assert(ready?.ready); assert.equal(ready.counts.candidates, 2); assert.equal(ready.counts.excluded, 1);
  const [result, concurrent] = await atSr01Time(f.end, () => Promise.all([releaseTryoutSessionResults(f.sessionId, f.ownerId, reason), releaseTryoutSessionResults(f.sessionId, f.ownerId, reason)]));
  assert(result.receipt, "The public publication command returns the persisted bundle receipt");
  assert.deepEqual(concurrent.receipt, result.receipt);
  assert.equal(result.receipt.participantCount, 2);
  assert.equal(result.receipt.tryoutId, f.tryoutId);
  assert.equal(result.receipt.sessionId, f.sessionId);
  assert.equal(result.receipt.reason, reason);
  assert.equal(result.receipt.actorId, f.ownerId);
  const [replay, replay2] = await Promise.all([releaseTryoutSessionResults(f.sessionId, f.ownerId, "Another click preserves the original reason."), releaseTryoutSessionResults(f.sessionId, f.ownerId, "Concurrent replay.")]);
  assert.deepEqual(replay.receipt, result.receipt);
  assert.deepEqual(replay2.receipt, result.receipt); assert.equal(await auditCount(), 1);
  const inspected = await inspectTryoutSessionReadiness(scope, f.ownerId);
  assert.deepEqual(inspected?.publication?.receipt, result.receipt);
  assert.equal((await sr01History(f.attemptId)).digest, before.digest);
  const student = await participantTryoutResult(f.attemptId, f.studentId);
  assert.equal(student.released, true);
  assert(student.runs && student.breakdowns && student.ranking); assert.equal(student.runs.length, 7); assert.equal(student.breakdowns.length, 7); assert.equal(student.ranking.total, 2); assert.equal(student.ranking.rank, 1);
  assert(student.runs.every((run) => run.review.length === 2 && run.review.every((item) => item.explanation.trim() || item.explanationAssetId)));
  await assert.rejects(participantTryoutResult(f.attemptId, second.studentId));
  const after = await sr01History(f.attemptId); assert.equal(JSON.stringify({ score: after.attempt.score, runs: after.attempt.runs.map(({ rawScore, scaledScore, normalizedScore, calculationResult }) => ({ rawScore, scaledScore, normalizedScore, calculationResult })) }), immutableScores);
  assert.equal(after.attempt.status, "expired"); assert.equal(after.attempt.attemptState, "expired");
  assert((await resolver.resolve({ sourceType: "practice", sourceId: f.attemptId }, { studentId: f.studentId })).content.includes("Skor Tryout"));
  await assert.rejects(resolver.resolve({ sourceType: "practice", sourceId: f.attemptId }, { studentId: second.studentId }));
  const releasedCandidates = await registry.listTryout({ studentId: f.studentId, now: f.end, sourceIds: [f.attemptId] }); assert(releasedCandidates.some((row) => row.stableSourceId === f.attemptId));
  assert((await sources()).sources.some((source) => source.sourceId === f.attemptId));
  const selectedMetadata = (await metadata()).find((source) => source.stableSourceId === f.attemptId); assert(selectedMetadata);
  assert((await localRegistry.loadSelected({ studentId: f.studentId, now: f.end, selected: [selectedMetadata] })).some((source) => source.stableSourceId === f.attemptId));
  const directItems = before.attempt.runs.flatMap((run) => (run.contentSnapshot as { items: Array<{ snapshotId?: string; sourceQuestionId?: string | null; sourceQuestionRevisionId?: string | null }> }).items);
  assert(directItems.every((item) => !item.sourceQuestionId && !item.sourceQuestionRevisionId), "Direct snapshots have no bank revision authority for drill");
  await assert.rejects(prepareFrozenDrillAuthority(prisma, f.studentId, [f.attemptId]));
  const drillEvidence = await proveExpiredDrillConsumer(f);
  const replaced = await learner.replaceContext({ studentId: f.studentId, conversationId: conversation.id, expectedContextVersion: 0, sources: [{ sourceType: "practice", sourceId: f.attemptId }] }); assert.equal(replaced.sources[0].sourceId, f.attemptId);
  await assert.rejects(prepareFrozenDrillAuthority(prisma, second.studentId, [f.attemptId]));
  assert.deepEqual(await registry.listTryout({ studentId: second.studentId, now: f.end, sourceIds: [f.attemptId] }), []);
  for (const lifecycle of ["void", "abandoned"] as const) {
    await prisma.tryoutAttempt.update({ where: { id: excluded.id }, data: { attemptState: lifecycle } });
    await assert.rejects(resolver.resolve({ sourceType: "practice", sourceId: excluded.id }, { studentId: excluded.studentId }));
    assert.deepEqual(await registry.listTryout({ studentId: excluded.studentId, now: f.end, sourceIds: [excluded.id] }), []);
    await assert.rejects(prepareFrozenDrillAuthority(prisma, excluded.studentId, [excluded.id]));
    const excludedSources = await learner.listSources({ studentId: excluded.studentId, type: "practice", limit: 1000, cursor: null }); assert(!excludedSources.sources.some((source) => source.sourceId === excluded.id));
    const excludedMetadata = await localRegistry.listMetadata({ studentId: excluded.studentId, conversationId: conversation.id, query: f.title, now: f.end }); assert(!excludedMetadata.some((source) => source.stableSourceId === excluded.id));
  }
  console.log("PASS actual alternate consumers: owner gets released scored expired result via resolver, full registry, metadata/freeze, source list/context replacement and drill; hidden/cross-owner/void/abandoned remain unavailable");
  const owner: SessionContext = { sessionId: "SR04 owner inspection", expiresAt: new Date(Date.now() + 60000), user: { id: f.ownerId, email: "tutor@vecalss.local", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
  const response = await serveTryoutReadinessInspection(new Request(`http://localhost/api/mentor/tryout/result-readiness?${new URLSearchParams(scope)}`), { getSession: async () => owner, authorize: (session) => { requireTryoutCapability(session, "tryout.results.manage"); return { allowCrossOwner: hasRole(session, "admin") }; }, read: inspectTryoutSessionReadiness });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /private, no-store/); const dto = await response.json(); assert.deepEqual(dto.snapshot.publication.receipt, result.receipt); assert.doesNotMatch(JSON.stringify(dto), /"(?:score|rawScore|normalizedScore|contentSnapshot|answers|isCorrect|attemptIds)":/);
  assert.equal(await inspectTryoutSessionReadiness(scope, second.studentId), null);
  const archived = await createSr01Fixture("SR04 archived publication", 1, false, new Date(start.getTime() + 3 * 86_400_000)); await score(archived);
  await archiveTryoutTransient(archived.tryoutId, archived.ownerId);
  const archiveResult = await atSr01Time(archived.end, () => releaseTryoutSessionResults(archived.sessionId, archived.ownerId, "Rilis hasil dari riwayat arsip.")); assert(archiveResult.receipt);
  await assert.rejects(configureTryoutDefaultResultRelease(archived.tryoutId, "immediate", archived.ownerId, "Arsip tidak mengubah aturan."));
  await assert.rejects(updateTryoutDeliverySessionSchedule({ deliverySessionId: archived.sessionId, availableFrom: archived.start, availableUntil: archived.end }, archived.ownerId, "Arsip tidak mengubah jadwal."));
  assert((await participantTryoutResult(archived.attemptId, archived.studentId)).released);
  await mkdir(".scratch/tryout-sr04", { recursive: true });
  await writeFile(".scratch/tryout-sr04/receipt.json", JSON.stringify({ tryoutId: f.tryoutId, sessionId: f.sessionId, attemptId: f.attemptId, receipt: result.receipt, drillEvidence, archived: { tryoutId: archived.tryoutId, sessionId: archived.sessionId, attemptId: archived.attemptId, receipt: archiveResult.receipt }, beforeDigest: before.digest, afterDigest: after.digest }, null, 2));
  console.log("PASS public end boundary/owner/scope/reason refusal; complete cohort and excluded ranking; one immutable command/replay/inspection receipt; complete owned student result and alternate Vera/catalogue withholding; archived publication with policy/schedule fences; frozen scores/pins/answers/deadlines unchanged");
} finally { await prisma.$disconnect(); }
