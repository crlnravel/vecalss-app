import "server-only";

import { AssessmentAttemptState, AssessmentResultReleaseState, AssessmentScoringProvenance, AssessmentScoringState, AttemptStatus, Prisma, QuestionRevisionProvenance, TryoutAttemptTestRunStatus, TryoutAssignmentStatus, TryoutCatRunState, TryoutDeliverySessionStatus, TryoutIntegrityEventType, TryoutTestType } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import {
  assertMatchingAssessmentRelease,
  findAssessmentReleaseSectionForRun,
  releaseMetadataFields,
  toParticipantAssessmentReleaseMetadata,
} from "@/lib/tryout/assessment-release";
import { materializeFrozenAnswers, normalizeCatAbility, TRYOUT_CAT_SCORING_VERSION, TRYOUT_CBT_SCORING_VERSION, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";
import { prisma } from "@/lib/prisma";
import { materializeTryoutAttemptInTransaction } from "@/lib/tryout/result-repository";

class TryoutAttemptValidationError extends Error {}

function assertAttemptReleaseBinding(
  expected: Parameters<typeof assertMatchingAssessmentRelease>[0],
  actual: Parameters<typeof assertMatchingAssessmentRelease>[1],
  message = "Identitas AssessmentRelease tidak cocok dengan sesi participant.",
) {
  try {
    assertMatchingAssessmentRelease(expected, actual, message);
  } catch {
    throw new TryoutAttemptValidationError(message);
  }
}

const json = (value: unknown) => value as Prisma.InputJsonValue;
const activeAttemptStatuses = [AttemptStatus.in_progress] as const;

type AttemptScope = {
  admissionId: string;
  deliverySessionId: string;
  id: string;
  studentId: string;
  tryoutId: string;
};

type ItemSnapshot = {
  difficulty: string;
  explanation?: string | null;
  explanationAssetId?: string | null;
  id: string;
  promptAssetId?: string | null;
  releaseItemId?: string;
  options: Array<{ assetId?: string | null; choiceKey: string; content: string; id: string; isCorrect: boolean; releaseOptionId?: string; sortOrder: number }>;
  points: string;
  prompt: string;
  sortOrder: number;
  sourceContentDigest?: string | null;
  sourceQuestionId?: string | null;
  sourceQuestionRevisionId?: string | null;
  sourceRevisionProvenance?: string | null;
};
type CatParameter = { calibrationDigest: string; calibrationId: string; discrimination: number; difficulty: number; itemId: string; sortOrder: number; sourceContentDigest: string; sourceQuestionId: string; sourceQuestionRevisionId: string; sourceRevisionProvenance: string };
type CatSnapshot = { currentAbility: number; initialAbility: number; modelVersion: string; parameters: CatParameter[]; selectedItemIds: string[]; updates: Array<{ abilityAfter: number; abilityBefore: number; itemId: string; probability: number; selectedOptionId: string | null }> };

function remainingSeconds(deadline: Date | null, now: Date) {
  return deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000)) : 0;
}

function frozenRunFields(
  contentSnapshot: Prisma.JsonValue,
  fallback: { catItemCount?: number | null; durationSeconds?: number; scoringConfig?: Prisma.JsonValue | null; testType: string },
  requireFrozen = false,
) {
  // Bound runs always carry these fields in contentSnapshot. The section
  // fallback exists solely for nullable legacy rows that predate AS-09.
  const form = contentSnapshot as unknown as {
    catItemCount?: number | null;
    catModelVersion?: string | null;
    durationSeconds?: number;
    items?: unknown[];
    scoringConfig?: Prisma.JsonValue | null;
    sectionId?: string;
    sequenceNo?: number;
    subtestId?: string;
    testType?: string;
    title?: string;
  };
  const complete = typeof form.sectionId === "string"
    && Number.isInteger(form.sequenceNo)
    && typeof form.subtestId === "string"
    && typeof form.title === "string"
    && Number.isFinite(form.durationSeconds)
    && form.durationSeconds! >= 0
    && (form.testType === TryoutTestType.cat || form.testType === TryoutTestType.cbt)
    && Object.prototype.hasOwnProperty.call(form, "catItemCount")
    && Object.prototype.hasOwnProperty.call(form, "catModelVersion")
    && Object.prototype.hasOwnProperty.call(form, "scoringConfig")
    && Array.isArray(form.items);
  if (requireFrozen && !complete) throw new TryoutAttemptValidationError("Test run terikat AssessmentRelease tetapi snapshot section/scoring belum lengkap.");
  if (requireFrozen) {
    return {
      catItemCount: form.catItemCount ?? null,
      durationSeconds: form.durationSeconds!,
      scoringConfig: form.scoringConfig ?? null,
      testType: form.testType!,
    };
  }
  return {
    catItemCount: form.catItemCount ?? fallback.catItemCount ?? null,
    durationSeconds: Number.isFinite(form.durationSeconds) ? form.durationSeconds! : fallback.durationSeconds ?? 0,
    scoringConfig: form.scoringConfig ?? fallback.scoringConfig ?? null,
    testType: form.testType === TryoutTestType.cat || form.testType === TryoutTestType.cbt ? form.testType : fallback.testType,
  };
}

function isReleaseBoundRun(run: { assessmentReleaseDigest: string | null; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null }) {
  return Boolean(run.assessmentReleaseId || run.assessmentReleaseNumber !== null || run.assessmentReleaseDigest);
}

function assertCompleteFrozenRun(
  run: { assessmentReleaseDigest: string | null; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null; catSnapshot: Prisma.JsonValue | null; contentSnapshot: Prisma.JsonValue },
  fallback: { catItemCount?: number | null; durationSeconds?: number; scoringConfig?: Prisma.JsonValue | null; testType: string },
  boundOverride = false,
) {
  const bound = boundOverride || isReleaseBoundRun(run);
  const frozen = frozenRunFields(run.contentSnapshot, fallback, bound);
  if (frozen.testType === TryoutTestType.cat && bound) {
    const form = run.contentSnapshot as unknown as { catItemCount?: number | null; catModelVersion?: string | null };
    const snapshot = run.catSnapshot as unknown as { modelVersion?: string; parameters?: unknown[]; selectedItemIds?: unknown[]; updates?: unknown[] } | null;
    if (!form.catItemCount || form.catModelVersion !== CANONICAL_2PL_MODEL_VERSION || !snapshot || snapshot.modelVersion !== form.catModelVersion || !Array.isArray(snapshot.parameters) || snapshot.parameters.length < form.catItemCount || !Array.isArray(snapshot.selectedItemIds) || !Array.isArray(snapshot.updates)) {
      throw new TryoutAttemptValidationError("Test run CAT terikat AssessmentRelease tetapi snapshot CAT tidak lengkap.");
    }
  }
  return frozen;
}

async function lockStudent(tx: Prisma.TransactionClient, studentId: string) {
  // A stable participant lock serializes starts before overlapping-session rows exist.
  // pg_advisory_xact_lock returns PostgreSQL `void`; executeRaw consumes the
  // command result without asking Prisma to deserialize that value.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${studentId}, 0))`;
}

async function lockTryout(tx: Prisma.TransactionClient, tryoutId: string) {
  await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${tryoutId}::uuid FOR UPDATE`;
}

async function lockAttemptScope(tx: Prisma.TransactionClient, attemptId: string): Promise<AttemptScope | null> {
  const scope = await tx.tryoutAttempt.findUnique({
    where: { id: attemptId },
    select: {
      admissionId: true,
      deliverySessionId: true,
      id: true,
      studentId: true,
      tryoutId: true,
    },
  });
  if (!scope) return null;

  // Every authoritative attempt transition uses this order: student,
  // admission, assignment, session, Tryout, attempt, then run rows. Keeping
  // the scope exact avoids broad locks while making stale commands serialize
  // with participant starts, assignment changes, and revocations.
  await lockStudent(tx, scope.studentId);
  await tx.$queryRaw`SELECT id FROM tryout_admissions WHERE id = ${scope.admissionId}::uuid FOR UPDATE`;
  await tx.$queryRaw`
    SELECT id
      FROM tryout_delivery_assignments
     WHERE admission_id = ${scope.admissionId}::uuid
       AND delivery_session_id = ${scope.deliverySessionId}::uuid
     ORDER BY id
     FOR UPDATE
  `;
  await tx.$queryRaw`SELECT id FROM tryout_delivery_sessions WHERE id = ${scope.deliverySessionId}::uuid FOR UPDATE`;
  await lockTryout(tx, scope.tryoutId);
  await tx.$queryRaw`SELECT id FROM tryout_attempts WHERE id = ${scope.id}::uuid FOR UPDATE`;
  await tx.$queryRaw`
    SELECT id
      FROM tryout_attempt_test_runs
     WHERE attempt_id = ${scope.id}::uuid
     ORDER BY id
     FOR UPDATE
  `;
  return scope;
}

async function lockOverlappingDeliverySessions(
  tx: Prisma.TransactionClient,
  deliverySessionId: string,
  availableFrom: Date,
  availableUntil: Date,
) {
  await tx.$queryRaw`
    SELECT id
      FROM tryout_delivery_sessions
     WHERE id = ${deliverySessionId}::uuid
        OR (available_from < ${availableUntil} AND available_until > ${availableFrom})
     ORDER BY id
     FOR UPDATE
  `;
}

async function markAttemptSubmittedIfComplete(tx: Prisma.TransactionClient, attemptId: string, now: Date, autoCalculate = true) {
  const [remaining, reviewRequired] = await Promise.all([
    tx.tryoutAttemptTestRun.count({ where: { attemptId, status: { in: [TryoutAttemptTestRunStatus.pending, TryoutAttemptTestRunStatus.active] } } }),
    tx.tryoutAttemptTestRun.count({ where: { attemptId, scoringState: AssessmentScoringState.review_required } }),
  ]);
  if (remaining) return;
  const current = await tx.tryoutAttempt.findUnique({ where: { id: attemptId }, select: { attemptState: true, status: true, studentId: true } });
  if (!current || current.attemptState === AssessmentAttemptState.abandoned || current.attemptState === AssessmentAttemptState.void || current.status === AttemptStatus.abandoned) return;
  const nextAttemptState = current.attemptState === AssessmentAttemptState.expired
    ? AssessmentAttemptState.expired
    : current.attemptState === AssessmentAttemptState.auto_submitted
      ? AssessmentAttemptState.auto_submitted
      : AssessmentAttemptState.submitted;
  const nextStatus = current.status === AttemptStatus.expired
    ? AttemptStatus.expired
    : current.status === AttemptStatus.auto_submitted
      ? AttemptStatus.auto_submitted
      : AttemptStatus.submitted;
  await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { attemptState: nextAttemptState, releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scoringState: reviewRequired ? AssessmentScoringState.review_required : AssessmentScoringState.pending, status: nextStatus, submittedAt: now } });
  if (autoCalculate) await materializeTryoutAttemptInTransaction(tx, attemptId, current.studentId, "Perhitungan otomatis setelah tujuh Test tersegel.", false);
}

async function calculateAndSealRun(tx: Prisma.TransactionClient, runId: string, now: Date, expired = false) {
  const run = await tx.tryoutAttemptTestRun.findUnique({
    where: { id: runId },
    include: { answers: { select: { id: true, selectedOptionId: true, tryoutItemId: true } }, attempt: { select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentReleaseId: true } } } }, section: { select: { scoringConfig: true, testType: true } } },
  });
  if (!run || run.status !== TryoutAttemptTestRunStatus.active) return run;
  const frozen = assertCompleteFrozenRun(run, run.section, Boolean(run.attempt.assessmentReleaseId || run.attempt.assessmentReleaseNumber !== null || run.attempt.assessmentReleaseDigest || run.attempt.deliverySession.assessmentReleaseId));
  if (frozen.testType === TryoutTestType.cat) return calculateAndSealCatRun(tx, run, now, expired);
  const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
  const items = content.items ?? [];
  const scored = materializeFrozenAnswers(items, run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId })));
  if (scored.invalid || scored.normalizedScore === null) {
    const failed = await tx.tryoutAttemptTestRun.update({
      where: { id: run.id },
      data: {
        calculationReleaseable: false,
        catFailureReason: "Jawaban tidak dapat dicocokkan dengan snapshot Test yang dibekukan.",
        scoringProvenance: AssessmentScoringProvenance.runtime,
        scoringReviewReason: "One or more answers are absent from the frozen CBT snapshot.",
        scoringState: AssessmentScoringState.review_required,
        sealedAt: now,
        status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
      },
    });
    await markAttemptSubmittedIfComplete(tx, failed.attemptId, now, !expired);
    return failed;
  }
  for (const answer of run.answers) {
    const materialized = scored.materializedAnswers.find((candidate) => candidate.itemId === answer.tryoutItemId);
    if (!materialized) continue;
    await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CBT_SCORING_VERSION } });
  }
  const result = { answeredCount: scored.answeredCount, correctCount: scored.correctCount, maxScore: scored.maxScore, normalizedScore: scored.normalizedScore, score: scored.rawScore, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount };
  const sealed = await tx.tryoutAttemptTestRun.update({
    where: { id: run.id },
    data: {
      calculationInput: json({ answersAcknowledged: scored.answeredCount, scoringConfig: frozen.scoringConfig, totalItems: items.length }),
      calculationResult: json(result),
      calculationVersion: TRYOUT_CBT_SCORING_VERSION,
      calculationReleaseable: true,
      correctCount: scored.correctCount,
      maxScore: scored.maxScore,
      normalizedScore: scored.normalizedScore,
      rawScore: scored.rawScore,
      scaledScore: scored.normalizedScore,
      scoringProvenance: AssessmentScoringProvenance.runtime,
      scoringReviewReason: null,
      scoringState: AssessmentScoringState.scored,
      scoringVersion: TRYOUT_CBT_SCORING_VERSION,
      sealedAt: now,
      status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
      unansweredCount: scored.unansweredCount,
      wrongCount: scored.wrongCount,
    },
  });
  // A run that reaches its own deadline can still be a valid, fully
  // materialized run. Let the seventh valid run trigger attempt aggregation;
  // only the failed/ambiguous paths below intentionally suppress it.
  await markAttemptSubmittedIfComplete(tx, sealed.attemptId, now, true);
  return sealed;
}

function logistic(value: number) { return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value)); }
function catInformation(parameter: CatParameter, ability: number) { const p = logistic(parameter.discrimination * (ability - parameter.difficulty)); return parameter.discrimination * parameter.discrimination * p * (1 - p); }
function nextCatItem(snapshot: CatSnapshot) {
  const used = new Set(snapshot.selectedItemIds);
  return snapshot.parameters.filter((parameter) => !used.has(parameter.itemId)).sort((left, right) => {
    const delta = catInformation(right, snapshot.currentAbility) - catInformation(left, snapshot.currentAbility);
    return Math.abs(delta) > 1e-12 ? delta : left.sortOrder - right.sortOrder || left.itemId.localeCompare(right.itemId);
  })[0] ?? null;
}
function catSnapshot(value: Prisma.JsonValue | null) { return value as unknown as CatSnapshot | null; }
async function failCatRun(tx: Prisma.TransactionClient, runId: string, reason: string) {
  return tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationReleaseable: false, catFailureReason: reason, catState: TryoutCatRunState.failed, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: reason, scoringState: AssessmentScoringState.review_required } });
}
async function calculateAndSealCatRun(tx: Prisma.TransactionClient, run: { id: string; attemptId: string; answers: Array<{ id: string; selectedOptionId: string | null; tryoutItemId: string }>; catSnapshot: Prisma.JsonValue | null; contentSnapshot: Prisma.JsonValue; status: TryoutAttemptTestRunStatus }, now: Date, expired: boolean) {
  const snapshot = catSnapshot(run.catSnapshot);
  if (!snapshot || !Number.isFinite(snapshot.currentAbility)) {
    await failCatRun(tx, run.id, "Snapshot CAT tidak dapat dihitung ulang.");
    const failed = await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed } });
    await markAttemptSubmittedIfComplete(tx, failed.attemptId, now, !expired);
    return failed;
  }
  const current = catSnapshot(run.catSnapshot)!;
  const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
  const scored = materializeFrozenAnswers(content.items ?? [], run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId })), current.selectedItemIds);
  if (scored.invalid || scored.normalizedScore === null) {
    const failed = await failCatRun(tx, run.id, "Jawaban CAT tidak dapat dicocokkan dengan snapshot item yang dibekukan.");
    const sealedFailed = await tx.tryoutAttemptTestRun.update({ where: { id: failed.id }, data: { sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed } });
    await markAttemptSubmittedIfComplete(tx, sealedFailed.attemptId, now, !expired);
    return sealedFailed;
  }
  for (const answer of run.answers) {
    const materialized = scored.materializedAnswers.find((candidate) => candidate.itemId === answer.tryoutItemId);
    if (!materialized) continue;
    await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CAT_SCORING_VERSION } });
  }
  const normalizedScore = normalizeCatAbility(current.currentAbility);
  const result = { ability: current.currentAbility, answeredCount: scored.answeredCount, correctCount: scored.correctCount, deliveredCount: current.selectedItemIds.length, maxScore: scored.maxScore, normalizedScore, score: current.currentAbility, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount };
  const sealed = await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { calculationInput: json({ modelVersion: current.modelVersion, parameters: current.parameters, selectedItemIds: current.selectedItemIds, updates: current.updates }), calculationResult: json(result), calculationVersion: TRYOUT_CAT_SCORING_VERSION, calculationReleaseable: true, catFailureReason: null, catState: TryoutCatRunState.ready, correctCount: scored.correctCount, maxScore: scored.maxScore, normalizedScore, rawScore: current.currentAbility, scaledScore: normalizedScore, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: null, scoringState: AssessmentScoringState.scored, scoringVersion: TRYOUT_CAT_SCORING_VERSION, sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount } });
  // A run that reaches its own deadline can still be a valid, fully
  // materialized run. Let the seventh valid run trigger attempt aggregation;
  // only the failed/ambiguous paths above intentionally suppress it.
  await markAttemptSubmittedIfComplete(tx, sealed.attemptId, now, true);
  return sealed;
}

async function expireForSessionCap(tx: Prisma.TransactionClient, attemptId: string, now: Date) {
  const active = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } });
  if (active) await calculateAndSealRun(tx, active.id, now, true);
  await tx.tryoutAttemptTestRun.updateMany({ where: { attemptId, status: TryoutAttemptTestRunStatus.pending }, data: { scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: "Test tidak pernah dibuka sebelum batas waktu sesi.", scoringState: AssessmentScoringState.review_required, sealedAt: now, status: TryoutAttemptTestRunStatus.expired } });
  await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { attemptState: AssessmentAttemptState.expired, autoSubmittedAt: now, releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scoringReviewReason: null, scoringState: AssessmentScoringState.pending, status: AttemptStatus.expired } });
  await markAttemptSubmittedIfComplete(tx, attemptId, now, true);
}

async function appendDeadlineAudit(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    admissionId: string;
    after: unknown;
    before: unknown;
    deliverySessionId: string;
    reason: string;
    tryoutId: string;
  },
) {
  await tx.tryoutDeliveryAudit.create({
    data: {
      action: "attempt.deadline_expired",
      actorUserId: input.actorId,
      admissionId: input.admissionId,
      after: json(input.after),
      before: json(input.before),
      deliverySessionId: input.deliverySessionId,
      reason: input.reason,
      tryoutId: input.tryoutId,
    },
  });
}

type DisconnectStartAudit = {
  attemptId: string;
  disconnectStartedAt: string;
  runId: string;
};

async function findDisconnectStartAudit(
  tx: Prisma.TransactionClient,
  scope: AttemptScope,
  disconnectStartedAt: Date | null,
): Promise<DisconnectStartAudit | null> {
  if (!disconnectStartedAt) return null;
  const audit = await tx.tryoutDeliveryAudit.findFirst({
    where: {
      action: "attempt.disconnect_started",
      admissionId: scope.admissionId,
      deliverySessionId: scope.deliverySessionId,
      tryoutId: scope.tryoutId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { after: true },
  });
  if (!audit?.after || typeof audit.after !== "object" || Array.isArray(audit.after)) return null;
  const after = audit.after as unknown as Record<string, unknown>;
  if (
    after.attemptId !== scope.id
    || after.disconnectStartedAt !== disconnectStartedAt.toISOString()
    || typeof after.runId !== "string"
    || !after.runId
  ) return null;
  return {
    attemptId: scope.id,
    disconnectStartedAt: disconnectStartedAt.toISOString(),
    runId: after.runId,
  };
}

async function closeDisconnectAfterExpiry(
  tx: Prisma.TransactionClient,
  scope: AttemptScope,
  attempt: {
    deliverySession: { availableUntil: Date };
    serverDeadlineAt: Date;
    runs: Array<{ id: string; serverDeadlineAt: Date | null }>;
    studentId: string;
    tryoutId: string;
  },
  now: Date,
  reason: string,
  actorId?: string,
) {
  const current = await tx.tryoutAttempt.findUnique({
    where: { id: scope.id },
    select: { disconnectStartedAt: true, reconciledAt: true, totalDisconnectSeconds: true },
  });
  if (!current?.disconnectStartedAt || current.reconciledAt) return false;
  const origin = await findDisconnectStartAudit(tx, scope, current.disconnectStartedAt);
  // Rows written before the origin binding are intentionally fail-closed. A
  // terminal attempt must never be attributed to an unverified Test run.
  if (!origin) return false;
  const originRun = attempt.runs.find((run) => run.id === origin.runId);
  const terminalAt = [
    now,
    attempt.serverDeadlineAt,
    attempt.deliverySession.availableUntil,
    originRun?.serverDeadlineAt ?? null,
  ].filter((value): value is Date => value !== null).reduce((earliest, value) => value < earliest ? value : earliest, now);
  const elapsedSeconds = Math.max(0, Math.floor((terminalAt.getTime() - current.disconnectStartedAt.getTime()) / 1000));
  const updated = await tx.tryoutAttempt.update({
    where: { id: scope.id },
    data: { reconciledAt: now, totalDisconnectSeconds: current.totalDisconnectSeconds + elapsedSeconds },
    select: { disconnectStartedAt: true, reconciledAt: true, totalDisconnectSeconds: true },
  });
  await tx.tryoutDeliveryAudit.create({
    data: {
      action: "attempt.disconnect_terminal",
      actorUserId: actorId ?? attempt.studentId,
      admissionId: scope.admissionId,
      after: json({
        attemptId: scope.id,
        boundedUntil: terminalAt.toISOString(),
        reconciledAt: now.toISOString(),
        runId: origin.runId,
        terminal: true,
        totalDisconnectSeconds: updated.totalDisconnectSeconds,
      }),
      before: json({
        attemptId: scope.id,
        disconnectStartedAt: current.disconnectStartedAt.toISOString(),
        reconciledAt: null,
        runId: origin.runId,
        totalDisconnectSeconds: current.totalDisconnectSeconds,
      }),
      deliverySessionId: scope.deliverySessionId,
      reason: `${reason} Siklus disconnect ditutup otomatis oleh batas waktu server.`,
      tryoutId: scope.tryoutId,
    },
  });
  return true;
}

async function synchronizeAttempt(
  tx: Prisma.TransactionClient,
  attemptId: string,
  now: Date,
  actorId?: string,
) {
  const scope = await lockAttemptScope(tx, attemptId);
  if (!scope) return null;

  const attempt = await tx.tryoutAttempt.findUnique({
    where: { id: attemptId },
    select: {
      admissionId: true,
      assessmentReleaseDigest: true,
      assessmentReleaseId: true,
      assessmentReleaseNumber: true,
      attemptState: true,
      deliverySession: { select: { assessmentReleaseId: true, availableUntil: true } },
      disconnectStartedAt: true,
      reconciledAt: true,
      totalDisconnectSeconds: true,
      id: true,
      serverDeadlineAt: true,
      status: true,
      studentId: true,
      tryoutId: true,
      runs: {
        select: { id: true, sequenceNo: true, serverDeadlineAt: true, status: true },
        orderBy: { sequenceNo: "asc" },
      },
    },
  });
  if (!attempt || attempt.status !== AttemptStatus.in_progress) return attempt;

  // Legacy nullable trees predate the immutable release boundary. They remain
  // historical reads and must not be rewritten by an operations refresh.
  const legacyRead = !attempt.assessmentReleaseId
    && attempt.assessmentReleaseNumber === null
    && !attempt.assessmentReleaseDigest
    && !attempt.deliverySession.assessmentReleaseId;
  if (legacyRead) return attempt;

  const active = attempt.runs.find((run) => run.status === TryoutAttemptTestRunStatus.active) ?? null;
  const before = {
    attemptState: attempt.attemptState,
    serverDeadlineAt: attempt.serverDeadlineAt.toISOString(),
    status: attempt.status,
    runs: attempt.runs.map((run) => ({ id: run.id, sequenceNo: run.sequenceNo, serverDeadlineAt: run.serverDeadlineAt?.toISOString() ?? null, status: run.status })),
  };
  let reason: string | null = null;
  if (attempt.serverDeadlineAt <= now || attempt.deliverySession.availableUntil <= now) {
    await expireForSessionCap(tx, attemptId, now);
    reason = attempt.serverDeadlineAt <= now
      ? "Batas waktu server attempt terlewati; attempt dan Test aktif disinkronkan otomatis."
      : "Batas waktu sesi server terlewati; attempt dan Test aktif disinkronkan otomatis.";
  } else if (active?.serverDeadlineAt && active.serverDeadlineAt <= now) {
    await calculateAndSealRun(tx, active.id, now, true);
    reason = `Batas waktu server Test ${active.sequenceNo} terlewati; run disinkronkan otomatis.`;
  }
  if (!reason) return attempt;

  await closeDisconnectAfterExpiry(tx, scope, attempt, now, reason, actorId);

  const after = await tx.tryoutAttempt.findUnique({
    where: { id: attemptId },
    select: {
      attemptState: true,
      id: true,
      serverDeadlineAt: true,
      status: true,
      runs: {
        select: { id: true, sequenceNo: true, serverDeadlineAt: true, status: true },
        orderBy: { sequenceNo: "asc" },
      },
    },
  });
  if (after && (
    after.attemptState !== before.attemptState
    || after.status !== before.status
    || after.runs.some((run, index) => run.status !== before.runs[index]?.status)
  )) {
    const afterAudit = {
      attemptState: after.attemptState,
      id: after.id,
      serverDeadlineAt: after.serverDeadlineAt.toISOString(),
      status: after.status,
      runs: after.runs.map((run) => ({ id: run.id, sequenceNo: run.sequenceNo, serverDeadlineAt: run.serverDeadlineAt?.toISOString() ?? null, status: run.status })),
    };
    await appendDeadlineAudit(tx, {
      actorId: actorId ?? attempt.studentId,
      admissionId: attempt.admissionId,
      after: afterAudit,
      before,
      deliverySessionId: scope.deliverySessionId,
      reason,
      tryoutId: scope.tryoutId,
    });
  }
  return tx.tryoutAttempt.findUnique({ where: { id: attemptId } });
}

async function synchronizeTryoutOperations(tryoutId: string, actorId: string) {
  const now = new Date();
  const ownedTryout = await prisma.tryoutPackage.findFirst({
    select: { id: true },
    where: { createdByUserId: actorId, id: tryoutId },
  });
  if (!ownedTryout) return false;
  const candidates = await prisma.tryoutAttempt.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    where: {
      status: AttemptStatus.in_progress,
      tryoutId,
      OR: [
        { serverDeadlineAt: { lte: now } },
        { deliverySession: { availableUntil: { lte: now } } },
        { runs: { some: { serverDeadlineAt: { lte: now }, status: TryoutAttemptTestRunStatus.active } } },
      ],
    },
  });
  for (const candidate of candidates) {
    // Keep each candidate scope in its own short transaction. A single
    // refresh transaction would retain student/session/Tryout locks from A
    // while waiting for B, which can deadlock against participant commands
    // that acquire B before an overlapping session row.
    const synchronized = await prisma.$transaction(async (tx) => {
      const currentOwner = await tx.tryoutPackage.findFirst({
        select: { id: true },
        where: { createdByUserId: actorId, id: tryoutId },
      });
      if (!currentOwner) return false;
      await synchronizeAttempt(tx, candidate.id, now, actorId);
      return true;
    });
    if (!synchronized) return false;
  }
  return true;
}

type DisconnectCommandResult = {
  attemptId: string;
  disconnectStartedAt: string | null;
  reconciledAt: string | null;
  runId: string;
  state: "existing" | "reconciled" | "started";
  totalDisconnectSeconds: number;
};

function disconnectResult(
  attempt: { disconnectStartedAt: Date | null; reconciledAt: Date | null; totalDisconnectSeconds: number },
  attemptId: string,
  runId: string,
  state: DisconnectCommandResult["state"],
): DisconnectCommandResult {
  return {
    attemptId,
    disconnectStartedAt: attempt.disconnectStartedAt?.toISOString() ?? null,
    reconciledAt: attempt.reconciledAt?.toISOString() ?? null,
    runId,
    state,
    totalDisconnectSeconds: attempt.totalDisconnectSeconds,
  };
}

async function startTryoutDisconnect(
  attemptId: string,
  runId: string,
  actorId: string,
  reason: string,
  allowCrossOwner = false,
) {
  const auditReason = reason.trim();
  if (!auditReason) throw new TryoutAttemptValidationError("Alasan audit disconnect wajib diisi.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const initial = await tx.tryoutAttempt.findUnique({
      where: { id: attemptId },
      select: { disconnectStartedAt: true, reconciledAt: true, totalDisconnectSeconds: true },
    });
    if (!initial) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan setelah penguncian.");
    const preflight = await tx.tryoutAttempt.findUnique({
      where: { id: attemptId },
      include: {
        admission: { select: { status: true } },
        tryout: { select: { createdByUserId: true } },
      },
    });
    const preflightAssignment = preflight
      ? await tx.tryoutDeliveryAssignment.findUnique({
          where: { admissionId_deliverySessionId: { admissionId: preflight.admissionId, deliverySessionId: preflight.deliverySessionId } },
          select: { status: true },
        })
      : null;
    const preflightRun = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, id: runId }, select: { status: true } });
    if (!preflight || !preflightRun || !preflightAssignment || (preflight.studentId !== actorId && preflight.tryout.createdByUserId !== actorId && !allowCrossOwner)) {
      throw new TryoutAttemptValidationError("Anda tidak dapat mengubah disconnect Tryout dari scope yang diminta.");
    }
    if (preflight.admission.status !== "active" || preflightAssignment.status !== TryoutAssignmentStatus.active) {
      throw new TryoutAttemptValidationError("Disconnect hanya dapat dimulai dari admission dan penugasan sesi yang aktif.");
    }
    if (preflight.status !== AttemptStatus.in_progress || preflight.attemptState !== AssessmentAttemptState.in_progress || preflightRun.status !== TryoutAttemptTestRunStatus.active) {
      throw new TryoutAttemptValidationError("Disconnect hanya dapat dimulai saat Test masih aktif.");
    }
    const preflightStudent = await tx.user.findUnique({ select: { previewPurpose: true }, where: { id: preflight.studentId } });
    if (isManagedPreviewPurpose(preflightStudent?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Akun preview admin hanya dapat diakses melalui restart Tryout preview.");
    }
    await synchronizeAttempt(tx, attemptId, now, actorId);
    const attempt = await tx.tryoutAttempt.findUnique({
      where: { id: attemptId },
      include: {
        admission: { select: { status: true, tryoutId: true } },
        deliverySession: { select: { availableFrom: true, availableUntil: true, id: true, status: true } },
        tryout: { select: { createdByUserId: true, id: true } },
      },
    });
    const assignment = attempt
      ? await tx.tryoutDeliveryAssignment.findUnique({
          where: { admissionId_deliverySessionId: { admissionId: attempt.admissionId, deliverySessionId: attempt.deliverySessionId } },
          select: { id: true, status: true },
        })
      : null;
    const run = await tx.tryoutAttemptTestRun.findFirst({
      where: { attemptId, id: runId },
      select: { id: true, status: true },
    });
    if (!attempt || !run || !assignment || attempt.tryoutId !== scope.tryoutId || attempt.deliverySessionId !== scope.deliverySessionId || attempt.admissionId !== scope.admissionId) {
      throw new TryoutAttemptValidationError("Attempt, Test run, admission, dan sesi Tryout tidak cocok.");
    }
    if (attempt.studentId !== actorId && attempt.tryout.createdByUserId !== actorId && !allowCrossOwner) {
      throw new TryoutAttemptValidationError("Anda tidak dapat mengubah disconnect Tryout milik peserta lain.");
    }
    const student = await tx.user.findUnique({ select: { previewPurpose: true }, where: { id: attempt.studentId } });
    if (isManagedPreviewPurpose(student?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Akun preview admin hanya dapat diakses melalui restart Tryout preview.");
    }
    if (attempt.admission.status !== "active" || assignment.status !== TryoutAssignmentStatus.active) {
      throw new TryoutAttemptValidationError("Disconnect hanya dapat dimulai dari admission dan penugasan sesi yang aktif.");
    }
    if (attempt.status !== AttemptStatus.in_progress || attempt.attemptState !== AssessmentAttemptState.in_progress || run.status !== TryoutAttemptTestRunStatus.active) {
      throw new TryoutAttemptValidationError("Disconnect hanya dapat dimulai saat Test masih aktif.");
    }
    if (attempt.disconnectStartedAt && attempt.reconciledAt) {
      throw new TryoutAttemptValidationError("Siklus disconnect sudah direkonsiliasi dan tidak dapat dimulai ulang.");
    }
    if (attempt.disconnectStartedAt) {
      const origin = await findDisconnectStartAudit(tx, scope, attempt.disconnectStartedAt);
      if (!origin) throw new TryoutAttemptValidationError("Marker disconnect lama tidak memiliki origin Test yang dapat diverifikasi.");
      if (origin.runId !== runId) throw new TryoutAttemptValidationError("Siklus disconnect sudah terikat ke Test lain.");
      return disconnectResult(attempt, attemptId, runId, "existing");
    }
    const updated = await tx.tryoutAttempt.update({
      where: { id: attemptId },
      data: { disconnectStartedAt: now, reconciledAt: null },
      select: { disconnectStartedAt: true, reconciledAt: true, totalDisconnectSeconds: true },
    });
    await tx.tryoutDeliveryAudit.create({
      data: {
        action: "attempt.disconnect_started",
        actorUserId: actorId,
        admissionId: attempt.admissionId,
        after: json({ attemptId, disconnectStartedAt: now.toISOString(), runId }),
        before: json({ disconnectStartedAt: initial.disconnectStartedAt?.toISOString() ?? null, reconciledAt: initial.reconciledAt?.toISOString() ?? null }),
        deliverySessionId: attempt.deliverySessionId,
        reason: auditReason,
        tryoutId: attempt.tryoutId,
      },
    });
    return disconnectResult(updated, attemptId, runId, "started");
  });
}

async function reconcileTryoutDisconnect(
  attemptId: string,
  runId: string,
  actorId: string,
  reason: string,
  allowCrossOwner = false,
) {
  const auditReason = reason.trim();
  if (!auditReason) throw new TryoutAttemptValidationError("Alasan audit reconcile disconnect wajib diisi.");
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const preflight = await tx.tryoutAttempt.findUnique({
      where: { id: attemptId },
      include: {
        admission: { select: { status: true } },
        tryout: { select: { createdByUserId: true } },
      },
    });
    const preflightAssignment = preflight
      ? await tx.tryoutDeliveryAssignment.findUnique({
          where: { admissionId_deliverySessionId: { admissionId: preflight.admissionId, deliverySessionId: preflight.deliverySessionId } },
          select: { status: true },
        })
      : null;
    const preflightRun = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, id: runId }, select: { status: true } });
    if (!preflight || !preflightRun || !preflightAssignment || (preflight.studentId !== actorId && preflight.tryout.createdByUserId !== actorId && !allowCrossOwner)) {
      throw new TryoutAttemptValidationError("Anda tidak dapat merekonsiliasi disconnect Tryout dari scope yang diminta.");
    }
    if (preflight.admission.status !== "active" || preflightAssignment.status !== TryoutAssignmentStatus.active) {
      throw new TryoutAttemptValidationError("Reconcile disconnect memerlukan admission dan penugasan aktif.");
    }
    if (preflight.status !== AttemptStatus.in_progress || preflight.attemptState !== AssessmentAttemptState.in_progress || preflightRun.status !== TryoutAttemptTestRunStatus.active) {
      throw new TryoutAttemptValidationError("Reconcile disconnect hanya dapat dilakukan saat Test masih aktif.");
    }
    const preflightStudent = await tx.user.findUnique({ select: { previewPurpose: true }, where: { id: preflight.studentId } });
    if (isManagedPreviewPurpose(preflightStudent?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Akun preview admin hanya dapat diakses melalui restart Tryout preview.");
    }
    await synchronizeAttempt(tx, attemptId, now, actorId);
    const attempt = await tx.tryoutAttempt.findUnique({
      where: { id: attemptId },
      include: {
        admission: { select: { status: true, tryoutId: true } },
        deliverySession: { select: { id: true, status: true } },
        tryout: { select: { createdByUserId: true, id: true } },
      },
    });
    const assignment = attempt
      ? await tx.tryoutDeliveryAssignment.findUnique({
          where: { admissionId_deliverySessionId: { admissionId: attempt.admissionId, deliverySessionId: attempt.deliverySessionId } },
          select: { status: true },
        })
      : null;
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, id: runId }, select: { id: true, status: true } });
    if (!attempt || !run || attempt.tryoutId !== scope.tryoutId || attempt.deliverySessionId !== scope.deliverySessionId || attempt.admissionId !== scope.admissionId) {
      throw new TryoutAttemptValidationError("Attempt, Test run, admission, dan sesi Tryout tidak cocok.");
    }
    if (attempt.studentId !== actorId && attempt.tryout.createdByUserId !== actorId && !allowCrossOwner) {
      throw new TryoutAttemptValidationError("Anda tidak dapat merekonsiliasi disconnect Tryout milik peserta lain.");
    }
    const student = await tx.user.findUnique({ select: { previewPurpose: true }, where: { id: attempt.studentId } });
    if (isManagedPreviewPurpose(student?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Akun preview admin hanya dapat diakses melalui restart Tryout preview.");
    }
    if (attempt.admission.status !== "active" || assignment?.status !== TryoutAssignmentStatus.active) throw new TryoutAttemptValidationError("Reconcile disconnect memerlukan admission dan penugasan aktif.");
    if (attempt.status !== AttemptStatus.in_progress || attempt.attemptState !== AssessmentAttemptState.in_progress || run.status !== TryoutAttemptTestRunStatus.active) {
      throw new TryoutAttemptValidationError("Reconcile disconnect hanya dapat dilakukan saat Test masih aktif.");
    }
    if (!attempt.disconnectStartedAt) throw new TryoutAttemptValidationError("Belum ada marker disconnect yang dapat direkonsiliasi.");
    const origin = await findDisconnectStartAudit(tx, scope, attempt.disconnectStartedAt);
    if (!origin) throw new TryoutAttemptValidationError("Marker disconnect lama tidak memiliki origin Test yang dapat diverifikasi.");
    if (origin.runId !== runId) throw new TryoutAttemptValidationError("Siklus disconnect terikat ke Test lain; reconcile ditolak.");
    if (attempt.reconciledAt) return disconnectResult(attempt, attemptId, runId, "existing");
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - attempt.disconnectStartedAt.getTime()) / 1000));
    const updated = await tx.tryoutAttempt.update({
      where: { id: attemptId },
      data: { reconciledAt: now, totalDisconnectSeconds: attempt.totalDisconnectSeconds + elapsedSeconds },
      select: { disconnectStartedAt: true, reconciledAt: true, totalDisconnectSeconds: true },
    });
    await tx.tryoutDeliveryAudit.create({
      data: {
        action: "attempt.disconnect_reconciled",
        actorUserId: actorId,
        admissionId: attempt.admissionId,
        after: json({ reconciledAt: now.toISOString(), totalDisconnectSeconds: updated.totalDisconnectSeconds, runId }),
        before: json({ disconnectStartedAt: attempt.disconnectStartedAt.toISOString(), reconciledAt: null, totalDisconnectSeconds: attempt.totalDisconnectSeconds }),
        deliverySessionId: attempt.deliverySessionId,
        reason: auditReason,
        tryoutId: attempt.tryoutId,
      },
    });
    return disconnectResult(updated, attemptId, runId, "reconciled");
  });
}

function snapshotSection(section: { catItemCount: number | null; catModelVersion: string | null; id: string; durationSeconds: number; instructions: string | null; scoringConfig: Prisma.JsonValue | null; sequenceNo: number; subtestId: string; testType: string; title: string; items: Array<{ difficulty: string; explanation: string | null; explanationAssetId: string | null; id: string; releaseItemId?: string; prompt: string; promptAssetId?: string | null; points: Prisma.Decimal | number | string; sortOrder: number; sourceContentDigest: string | null; sourceQuestionId: string | null; sourceQuestionRevisionId: string | null; sourceRevisionProvenance: string | null; options: Array<{ assetId?: string | null; id: string; choiceKey: string; content: string; isCorrect: boolean; releaseOptionId?: string; sortOrder: number }> }> }) {
  return {
    catItemCount: section.catItemCount,
    catModelVersion: section.catModelVersion,
    durationSeconds: section.durationSeconds,
    instructions: section.instructions,
    items: section.items.map((item) => ({ difficulty: item.difficulty, explanation: item.explanation, explanationAssetId: item.explanationAssetId, id: item.id, options: item.options.map((option) => ({ assetId: option.assetId, choiceKey: option.choiceKey, content: option.content, id: option.id, isCorrect: option.isCorrect, releaseOptionId: option.releaseOptionId, sortOrder: option.sortOrder })), points: item.points.toString(), prompt: item.prompt, promptAssetId: item.promptAssetId, releaseItemId: item.releaseItemId, sortOrder: item.sortOrder, sourceContentDigest: item.sourceContentDigest, sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: item.sourceQuestionRevisionId, sourceRevisionProvenance: item.sourceRevisionProvenance })),
    scoringConfig: section.scoringConfig,
    sectionId: section.id,
    sequenceNo: section.sequenceNo,
    subtestId: section.subtestId,
    testType: section.testType,
    title: section.title,
  };
}

function catRunSnapshot(section: { catItemCount: number | null; catModelVersion: string | null; catParameters: CatParameter[]; id: string; items: Array<{ id: string; releaseItemId?: string; sourceContentDigest: string | null; sourceQuestionId: string | null; sourceQuestionRevisionId: string | null; sourceRevisionProvenance: string | null; sortOrder: number }>; subtestId: string }) {
  if (!section.catItemCount || section.catModelVersion !== CANONICAL_2PL_MODEL_VERSION || section.items.length < section.catItemCount || section.items.some((item) => !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown) || section.catParameters.length !== section.items.length) throw new TryoutAttemptValidationError("Pool CAT immutable tidak lengkap atau tidak memakai profil 2PL kanonis.");
  const parameterByReleaseItemId = new Map(section.catParameters.map((parameter) => [parameter.itemId, parameter]));
  const parameters = section.items.map((item) => {
    const parameter = parameterByReleaseItemId.get(item.releaseItemId ?? item.id);
    if (!parameter
      || parameter.sourceQuestionId !== item.sourceQuestionId
      || parameter.sourceQuestionRevisionId !== item.sourceQuestionRevisionId
      || parameter.sourceContentDigest !== item.sourceContentDigest
      || parameter.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown
      || !Number.isFinite(parameter.discrimination)
      || parameter.discrimination <= 0
      || !Number.isFinite(parameter.difficulty)) throw new TryoutAttemptValidationError("Parameter CAT beku tidak cocok dengan item AssessmentRelease.");
    return { ...parameter, itemId: item.id };
  });
  return { currentAbility: 0, initialAbility: 0, modelVersion: CANONICAL_2PL_MODEL_VERSION, parameters, selectedItemIds: [], updates: [] } satisfies CatSnapshot;
}

async function startTryoutAttempt(deliverySessionId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const student = await tx.user.findUnique({
      select: { previewPurpose: true },
      where: { id: studentId },
    });
    if (isManagedPreviewPurpose(student?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Akun preview admin tidak dapat memulai attempt learner.");
    }
    await lockStudent(tx, studentId);
    const candidate = await tx.tryoutDeliveryAssignment.findFirst({
      where: { deliverySessionId, status: TryoutAssignmentStatus.active, admission: { status: "active", studentId } },
      select: { id: true },
    });
    if (!candidate) throw new TryoutAttemptValidationError("Sesi Tryout tidak tersedia untuk peserta ini.");

    // Revocation takes the same participant and assignment locks. Re-read the
    // active row after those locks so a revoke cannot be bypassed between the
    // eligibility check and attempt creation.
    await tx.$queryRaw`SELECT id FROM tryout_delivery_assignments WHERE id = ${candidate.id}::uuid FOR UPDATE`;
    const assignment = await tx.tryoutDeliveryAssignment.findFirst({
      where: { id: candidate.id, deliverySessionId, status: TryoutAssignmentStatus.active, admission: { status: "active", studentId } },
      include: { admission: true, deliverySession: true },
    });
    if (!assignment || assignment.deliverySession.status !== TryoutDeliverySessionStatus.active) throw new TryoutAttemptValidationError("Sesi Tryout tidak tersedia untuk peserta ini.");
    const session = assignment.deliverySession;
    if (session.availableFrom > now || session.availableUntil <= now) throw new TryoutAttemptValidationError("Jendela sesi Tryout belum tersedia atau sudah berakhir.");
    if (!session.assessmentReleaseId) throw new TryoutAttemptValidationError("Sesi Tryout belum memiliki AssessmentRelease yang valid.");

    // Lock every overlapping session in a deterministic order, after the stable student lock.
    await lockOverlappingDeliverySessions(tx, deliverySessionId, session.availableFrom, session.availableUntil);
    const release = await tx.assessmentRelease.findFirst({ where: { id: session.assessmentReleaseId, tryoutId: session.tryoutId } });
    if (!release) throw new TryoutAttemptValidationError("AssessmentRelease sesi Tryout tidak ditemukan.");
    const existing = await tx.tryoutAttempt.findUnique({ where: { deliverySessionId_studentId: { deliverySessionId, studentId } }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, id: true } });
    if (existing) {
      assertAttemptReleaseBinding(
        { assessmentReleaseDigest: release.contentDigest, assessmentReleaseId: release.id, assessmentReleaseNumber: release.releaseNumber },
        { assessmentReleaseDigest: existing.assessmentReleaseDigest, assessmentReleaseId: existing.assessmentReleaseId, assessmentReleaseNumber: existing.assessmentReleaseNumber },
        "Attempt Tryout yang sudah ada tidak cocok dengan AssessmentRelease sesi.",
      );
      return { assessmentRelease: { digest: release.contentDigest, id: release.id, number: release.releaseNumber }, attemptId: existing.id, state: "existing" as const };
    }
    const competing = await tx.tryoutAttempt.findFirst({ where: { studentId, status: { in: [...activeAttemptStatuses] }, deliverySession: { availableFrom: { lt: session.availableUntil }, availableUntil: { gt: session.availableFrom } } }, select: { id: true } });
    if (competing) throw new TryoutAttemptValidationError("Peserta masih memiliki Tryout aktif pada sesi yang waktunya bertumpang tindih.");

    // This is the single content-lock transition: same aggregate lock as authoring writes.
    await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${session.tryoutId}::uuid FOR UPDATE`;
    const lockedTryout = await tx.tryoutPackage.findUniqueOrThrow({
      where: { id: session.tryoutId },
      include: {
        sections: {
          include: {
            items: {
              include: { options: { orderBy: { sortOrder: "asc" } } },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { sequenceNo: "asc" },
        },
      },
    });
    const releasePayload = release.payload as unknown as {
      sections?: Array<{
        assembly?: { packageVersionId: string | null };
        cat?: {
          itemCount: number | null;
          modelVersion: string | null;
          parameters?: CatParameter[];
        };
        durationSeconds: number;
        id: string;
        instructions: string | null;
        physicalId?: string;
        items: Array<{
          difficulty: string;
          explanation: string | null;
          explanationAssetId: string | null;
          id: string;
          physicalId?: string;
          options: Array<{ choiceKey: string; content: string; id: string; isCorrect: boolean; sortOrder: number; sourceQuestionOptionId: string | null; sourceQuestionRevisionOptionId: string | null }>;
          packageCode: string;
          points: string;
          prompt: string;
          promptAssetId: string | null;
          sortOrder: number;
          sourceContentDigest: string | null;
          sourceQuestionId: string | null;
          sourceQuestionRevisionId: string | null;
          sourceRevisionProvenance: string | null;
          subtestId: string;
        }>;
        randomization?: { shuffleItems: boolean };
        scoring?: { config: Prisma.JsonValue | null; testType: string; modelVersion: string | null };
        sequenceNo: number;
        subtestId: string;
        title: string;
      }>;
      tryout?: { revision?: number };
    };
    const releaseSections = releasePayload.sections ?? [];
    if (releaseSections.length !== 7 || releaseSections.some((section) => !section.items?.length)) throw new TryoutAttemptValidationError("AssessmentRelease tidak memiliki tujuh Test berisi yang dapat dimulai.");
    const currentSectionBySequence = new Map(lockedTryout.sections.map((section) => [section.sequenceNo, section]));
    if (lockedTryout.sections.length !== 7 || releaseSections.some((section) => {
      const currentSection = currentSectionBySequence.get(section.sequenceNo);
      return !currentSection || currentSection.subtestId !== section.subtestId;
    })) throw new TryoutAttemptValidationError("Tryout saat ini tidak memiliki tujuh Test bridge dengan subject/urutan yang sama seperti AssessmentRelease.");
    const usedCurrentItemIds = new Set<string>();
    const projectReleaseItem = (item: (typeof releaseSections)[number]["items"][number], currentSection: (typeof lockedTryout.sections)[number]) => {
      const sourceMatches = item.sourceQuestionId
        ? currentSection.items.filter((candidate) => candidate.sourceQuestionId === item.sourceQuestionId
          && candidate.sourceQuestionRevisionId === item.sourceQuestionRevisionId
          && candidate.sourceContentDigest === item.sourceContentDigest)
        : [];
      const physicalMatch = item.physicalId
        ? currentSection.items.find((candidate) => candidate.id === item.physicalId)
        : undefined;
      // A release may bridge to a recreated current row only through the
      // immutable source identity captured in the payload. Physical IDs are
      // accepted only for source-less legacy items, and positional guesses are
      // intentionally forbidden: R1 content must never point at an unrelated
      // R2 row merely because it occupies the same slot.
      const currentItem = item.sourceQuestionId
        ? sourceMatches.length === 1 ? sourceMatches[0] : undefined
        : physicalMatch;
      if (!currentItem) throw new TryoutAttemptValidationError("AssessmentRelease tidak lagi memiliki baris soal sumber yang dapat dijawab.");
      if (usedCurrentItemIds.has(currentItem.id)) throw new TryoutAttemptValidationError("Tryout saat ini tidak menyediakan bridge unik untuk seluruh item AssessmentRelease.");
      usedCurrentItemIds.add(currentItem.id);
      // The release payload supplies every answerable field below. Current
      // rows contribute only FK-safe IDs so answers can reference the legacy
      // schema while R1 content remains independent from mutable R2 text.
      const currentOptionById = new Map(currentItem.options.map((option) => [option.id, option]));
      const projectedOptions = item.options.map((option) => {
        const sourceOptionMatches = option.sourceQuestionRevisionOptionId
          ? currentItem.options.filter((candidate) => candidate.sourceQuestionRevisionOptionId === option.sourceQuestionRevisionOptionId
            && (!option.sourceQuestionOptionId || candidate.sourceQuestionOptionId === option.sourceQuestionOptionId))
          : option.sourceQuestionOptionId
            ? currentItem.options.filter((candidate) => candidate.sourceQuestionOptionId === option.sourceQuestionOptionId)
            : [];
        const currentOption = option.sourceQuestionOptionId || option.sourceQuestionRevisionOptionId
          ? sourceOptionMatches.length === 1 ? sourceOptionMatches[0] : undefined
          : currentOptionById.get((option as { physicalId?: string }).physicalId ?? option.id);
        if (!currentOption) throw new TryoutAttemptValidationError("AssessmentRelease tidak lagi memiliki pilihan jawaban sumber yang dapat dijawab.");
        return { ...option, id: currentOption.id, releaseOptionId: option.id };
      });
      return { ...item, id: currentItem.id, releaseItemId: item.id, options: projectedOptions };
    };
    const runtimeSections = releaseSections.map((section) => {
      const currentSection = currentSectionBySequence.get(section.sequenceNo)!;
      return {
        ...section,
        catItemCount: section.cat?.itemCount ?? null,
        catModelVersion: section.cat?.modelVersion ?? null,
        catParameters: section.cat?.parameters ?? [],
        id: currentSection.id,
        items: section.items.map((item) => projectReleaseItem(item, currentSection)),
        packageVersionId: section.assembly?.packageVersionId ?? null,
        scoringConfig: section.scoring?.config ?? null,
        shuffleItems: section.randomization?.shuffleItems ?? false,
        testType: section.scoring?.testType ?? currentSection.testType,
      };
    });
    const catSnapshotEntries = runtimeSections.reduce<Promise<readonly [string, CatSnapshot]>[]>((entries, section) => {
      if (section.testType === TryoutTestType.cat) {
        entries.push(Promise.resolve(catRunSnapshot(section)).then((snapshot) => [section.id, snapshot] as const));
      }
      return entries;
    }, []);
    const catSnapshots = new Map(await Promise.all(catSnapshotEntries));
    const attempt = await tx.tryoutAttempt.create({
      data: {
        admissionId: assignment.admissionId,
        attemptState: AssessmentAttemptState.in_progress,
        contentSnapshot: json({ assessmentRelease: { digest: release.contentDigest, id: release.id, number: release.releaseNumber }, tryoutId: session.tryoutId, tryoutRevision: releasePayload.tryout?.revision ?? null }),
        deliverySessionId,
        ...releaseMetadataFields(release),
        releasePolicySnapshot: json({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, rankingRule: session.rankingRule, resultReleasePolicy: session.resultReleasePolicy, scheduledReleaseAt: session.scheduledReleaseAt?.toISOString() ?? null }),
        scoringProvenance: AssessmentScoringProvenance.runtime,
        scoringState: AssessmentScoringState.pending,
        serverDeadlineAt: session.availableUntil,
        serverStartedAt: now,
        studentId,
        tryoutId: session.tryoutId,
      },
    });
    await tx.tryoutAttemptTestRun.createMany({ data: runtimeSections.map((section) => ({
        attemptId: attempt.id,
      ...releaseMetadataFields(release),
      calculationReleaseable: false,
      catSnapshot: section.testType === TryoutTestType.cat ? json(catSnapshots.get(section.id)!) : undefined,
      catState: section.testType === TryoutTestType.cat ? TryoutCatRunState.ready : TryoutCatRunState.not_applicable,
      contentSnapshot: json(snapshotSection(section)),
      scoringProvenance: AssessmentScoringProvenance.runtime,
      scoringState: AssessmentScoringState.pending,
      sequenceNo: section.sequenceNo,
      tryoutSectionId: section.id,
    })) });
    return { assessmentRelease: { digest: release.contentDigest, id: release.id, number: release.releaseNumber }, attemptId: attempt.id, state: "started" as const };
  });
}

async function attemptState(attemptId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        assessmentRelease: { select: { contentDigest: true, id: true, payload: true, publishedAt: true, releaseNumber: true } },
        deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } }, fullscreenPrompt: true } },
        tryout: {
          select: {
            createdBy: { select: { fullName: true } },
            description: true,
            examEvent: { select: { name: true } },
            title: true,
          },
        },
      },
    });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const legacyRead = !attempt.assessmentRelease
      && !attempt.deliverySession.assessmentRelease
      && !attempt.assessmentReleaseId
      && attempt.assessmentReleaseNumber === null
      && !attempt.assessmentReleaseDigest;
    if (!legacyRead) {
      assertAttemptReleaseBinding(
        { assessmentReleaseDigest: attempt.deliverySession.assessmentRelease?.contentDigest ?? null, assessmentReleaseId: attempt.deliverySession.assessmentRelease?.id ?? null, assessmentReleaseNumber: attempt.deliverySession.assessmentRelease?.releaseNumber ?? null },
        { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
      );
    }
    const preflightRuns = !legacyRead
      ? await tx.tryoutAttemptTestRun.findMany({
          where: { attemptId },
          include: { section: { select: { durationSeconds: true, testType: true, title: true } } },
        })
      : [];
    if (!legacyRead) preflightRuns.forEach((run) => assertCompleteFrozenRun(run, run.section, true));
    // Legacy nullable trees are historical reads. Do not expire, seal, score,
    // or rewrite them merely because a participant opens the status endpoint;
    // only release-bound runtime attempts may use the synchronizer here.
    if (!legacyRead) await synchronizeAttempt(tx, attemptId, now, studentId);
    const runs = await tx.tryoutAttemptTestRun.findMany({
      where: { attemptId },
      include: {
        section: {
          select: {
            durationSeconds: true,
            questionCount: true,
            subtest: { select: { code: true, name: true } },
            testType: true,
            title: true,
          },
        },
      },
      orderBy: { sequenceNo: "asc" },
    });
    const projectRunSection = (run: (typeof runs)[number]) => {
      const form = run.contentSnapshot as unknown as { durationSeconds?: number; items?: unknown[]; testType?: string };
      const bound = !legacyRead || isReleaseBoundRun(run);
      const frozen = bound
        ? assertCompleteFrozenRun(run, run.section, bound)
        : null;
      const releaseSection = bound
        ? findAssessmentReleaseSectionForRun(attempt.assessmentRelease?.payload, run)
        : null;
      if (bound && (!releaseSection
        || typeof releaseSection.subtestCode !== "string"
        || typeof releaseSection.subtestName !== "string"
        || typeof releaseSection.title !== "string")) {
        throw new TryoutAttemptValidationError("Test run terikat AssessmentRelease tetapi label Test beku tidak tersedia.");
      }
      return {
        ...run.section,
        durationSeconds: frozen?.durationSeconds ?? (Number.isFinite(form.durationSeconds) ? form.durationSeconds! : run.section.durationSeconds),
        questionCount: Array.isArray(form.items) ? form.items.length : run.section.questionCount,
        subtest: bound
          ? { code: releaseSection!.subtestCode!, name: releaseSection!.subtestName! }
          : run.section.subtest,
        testType: frozen?.testType ?? (form.testType === TryoutTestType.cat || form.testType === TryoutTestType.cbt ? form.testType : run.section.testType),
        title: bound ? releaseSection!.title! : run.section.title,
      };
    };
    const active = runs.find((run) => run.status === TryoutAttemptTestRunStatus.active);
    const exposed = active
      ? {
          answers: (await tx.tryoutAnswer.findMany({
            where: { attemptTestRunId: active.id },
            select: { selectedOptionId: true, tryoutItemId: true },
          })).map((answer) => ({ selectedOptionId: answer.selectedOptionId, tryoutItemId: answer.tryoutItemId })),
          contentSnapshot: redactRunSnapshot(active.contentSnapshot, active.catSnapshot),
          fullscreenPrompt: attempt.deliverySession.fullscreenPrompt,
          id: active.id,
          section: projectRunSection(active),
          serverDeadlineAt: active.serverDeadlineAt,
          sequenceNo: active.sequenceNo,
          status: active.status,
        }
      : null;
    return {
      activeRun: exposed,
      assessmentRelease: attempt.assessmentRelease ? toParticipantAssessmentReleaseMetadata(attempt.assessmentRelease) : null,
      attemptId,
      status: (await tx.tryoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true } })).status,
      tryoutDescription: attempt.tryout.description,
      tryoutEventName: attempt.tryout.examEvent?.name ?? null,
      tryoutOrganizer: attempt.tryout.createdBy.fullName,
      tryoutTitle: attempt.tryout.title,
      runs: runs.map((run) => ({
        id: run.id,
        section: projectRunSection(run),
        sequenceNo: run.sequenceNo,
        status: run.status,
      })),
    };
  });
}

async function recordTryoutIntegrityEvent(attemptId: string, runId: string, eventType: TryoutIntegrityEventType, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, include: { assessmentRelease: { select: { id: true } }, deliverySession: { select: { assessmentReleaseId: true, fullscreenPrompt: true } } } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    if (!attempt.assessmentReleaseId || !attempt.assessmentReleaseNumber || !attempt.assessmentReleaseDigest || attempt.assessmentReleaseId !== attempt.deliverySession.assessmentReleaseId) throw new TryoutAttemptValidationError("Attempt Tryout tidak terikat pada AssessmentRelease sesi.");
    await synchronizeAttempt(tx, attemptId, now, studentId);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, id: runId, status: TryoutAttemptTestRunStatus.active }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, catSnapshot: true, contentSnapshot: true, id: true } });
    if (!run) throw new TryoutAttemptValidationError("Hanya Test aktif yang dapat mencatat peringatan Tryout.");
    assertCompleteFrozenRun(run, { testType: TryoutTestType.cbt }, true);
    if ((eventType === TryoutIntegrityEventType.fullscreen_entered || eventType === TryoutIntegrityEventType.fullscreen_exited) && !attempt.deliverySession.fullscreenPrompt) throw new TryoutAttemptValidationError("Pengingat layar penuh tidak diaktifkan untuk sesi ini.");
    if (eventType === TryoutIntegrityEventType.fullscreen_exited) {
      const entered = await tx.tryoutIntegrityEvent.findFirst({ where: { eventType: TryoutIntegrityEventType.fullscreen_entered, runId }, select: { id: true } });
      if (!entered) return { ignored: true, serverSequence: null };
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${runId}, 0))`;
    const previous = await tx.tryoutIntegrityEvent.aggregate({ _max: { serverSequence: true }, where: { runId } });
    const event = await tx.tryoutIntegrityEvent.create({ data: { eventType, runId, serverSequence: (previous._max.serverSequence ?? 0) + 1 } });
    return { ignored: false, serverSequence: event.serverSequence };
  });
}

function redactRunSnapshot(snapshot: Prisma.JsonValue, cat: Prisma.JsonValue | null = null) {
  const value = structuredClone(snapshot) as { items?: Array<{ options?: Array<{ isCorrect?: boolean }> }> };
  const adaptive = catSnapshot(cat);
  if (adaptive) {
    const selectedItemIds = new Set(adaptive.selectedItemIds);
    value.items = value.items?.filter((item) => selectedItemIds.has((item as { id: string }).id));
  }
  value.items?.forEach((item) => item.options?.forEach((option) => delete option.isCorrect));
  return value;
}

async function startActiveTestRun(attemptId: string, runId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, include: { assessmentRelease: { select: { id: true, contentDigest: true, releaseNumber: true } }, deliverySession: { include: { assessmentRelease: { select: { id: true, contentDigest: true, releaseNumber: true } } } } } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    if (!attempt.assessmentRelease || !attempt.deliverySession.assessmentRelease) throw new TryoutAttemptValidationError("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: attempt.deliverySession.assessmentRelease.contentDigest, assessmentReleaseId: attempt.deliverySession.assessmentRelease.id, assessmentReleaseNumber: attempt.deliverySession.assessmentRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    await synchronizeAttempt(tx, attemptId, now, studentId);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, include: { section: true } });
    if (!run || run.status !== TryoutAttemptTestRunStatus.pending) throw new TryoutAttemptValidationError("Hanya Test berikutnya yang belum dimulai dapat dibuka.");
    const frozen = assertCompleteFrozenRun(run, run.section, true);
    const runTestType = frozen.testType;
    const runCatItemCount = frozen.catItemCount;
    const [predecessor, active] = await Promise.all([
      tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, sequenceNo: { lt: run.sequenceNo }, status: { notIn: [TryoutAttemptTestRunStatus.sealed, TryoutAttemptTestRunStatus.expired] } }, select: { id: true } }),
      tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } }),
    ]);
    if (predecessor || active) throw new TryoutAttemptValidationError("Test sebelumnya harus diselesaikan sebelum Test ini dimulai.");
    if (runTestType === TryoutTestType.cat) {
      const snapshot = catSnapshot(run.catSnapshot);
      if (!snapshot || run.catState !== TryoutCatRunState.ready) throw new TryoutAttemptValidationError("CAT gagal disiapkan dan tidak dapat dilanjutkan.");
      const first = nextCatItem(snapshot);
      if (!first) { await failCatRun(tx, run.id, "Pool CAT tidak memiliki item yang belum digunakan."); throw new TryoutAttemptValidationError("Pool CAT gagal dipilih."); }
      snapshot.selectedItemIds.push(first.itemId);
      await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { catSnapshot: json(snapshot) } });
    }
    if (runTestType === TryoutTestType.cat && (!runCatItemCount || runCatItemCount < 1)) throw new TryoutAttemptValidationError("Konfigurasi CAT pada AssessmentRelease tidak lengkap.");
    const durationSeconds = frozen.durationSeconds;
    const deadline = new Date(Math.min(now.getTime() + durationSeconds * 1000, attempt.deliverySession.availableUntil.getTime()));
    if (deadline <= now) { await expireForSessionCap(tx, attemptId, now); throw new TryoutAttemptValidationError("Waktu sesi Tryout sudah berakhir."); }
    const updated = await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { serverDeadlineAt: deadline, serverStartedAt: now, status: TryoutAttemptTestRunStatus.active } });
    return { deadlineAt: deadline, remainingSeconds: remainingSeconds(deadline, now), run: { ...updated, contentSnapshot: redactRunSnapshot(updated.contentSnapshot, updated.catSnapshot) } };
  });
}

async function saveTryoutAnswer(attemptId: string, runId: string, tryoutItemId: string, selectedOptionId: string | null, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } } } }, id: true } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const sessionRelease = attempt.deliverySession.assessmentRelease;
    if (!sessionRelease) throw new TryoutAttemptValidationError("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: sessionRelease.contentDigest, assessmentReleaseId: sessionRelease.id, assessmentReleaseNumber: sessionRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    await synchronizeAttempt(tx, attemptId, now, studentId);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId, status: TryoutAttemptTestRunStatus.active }, include: { section: { select: { catItemCount: true, testType: true, tryoutId: true } } } });
    if (!run) throw new TryoutAttemptValidationError("Hanya Test aktif yang dapat menyimpan jawaban.");
    const frozen = assertCompleteFrozenRun(run, run.section, true);
    const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
    const runTestType = frozen.testType;
    const runCatItemCount = frozen.catItemCount;
    const item = content.items?.find((candidate) => candidate.id === tryoutItemId);
    if (!item) throw new TryoutAttemptValidationError("Soal tidak termasuk dalam Test aktif.");
    const adaptive = catSnapshot(run.catSnapshot);
    if (runTestType === TryoutTestType.cat && (!runCatItemCount || !adaptive || run.catState !== TryoutCatRunState.ready || adaptive.selectedItemIds.at(-1) !== tryoutItemId || adaptive.selectedItemIds.slice(0, -1).includes(tryoutItemId))) throw new TryoutAttemptValidationError("CAT hanya menerima jawaban untuk soal aktif berikutnya tanpa kembali ke soal sebelumnya.");
    if (selectedOptionId) {
      const option = item.options.find((candidate) => candidate.id === selectedOptionId);
      if (!option) throw new TryoutAttemptValidationError("Pilihan jawaban tidak termasuk dalam soal ini.");
    }
    const existingAnswer = await tx.tryoutAnswer.findUnique({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } } });
    if (existingAnswer && runTestType === TryoutTestType.cat) return { answerId: existingAnswer.id, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: existingAnswer.answeredAt };
    const answer = await tx.tryoutAnswer.upsert({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } }, create: { answerText: null, answeredAt: now, attemptId, attemptTestRunId: runId, selectedOptionId, tryoutId: run.section.tryoutId, tryoutItemId }, update: { answeredAt: now, selectedOptionId } });
    if (runTestType === TryoutTestType.cat) {
      try {
        const parameter = adaptive!.parameters.find((candidate) => candidate.itemId === tryoutItemId);
        if (!parameter) throw new Error("Parameter item CAT hilang.");
        const correct = selectedOptionId ? item.options.find((option) => option.id === selectedOptionId)?.isCorrect === true : false;
        const abilityBefore = adaptive!.currentAbility;
        const probability = logistic(parameter.discrimination * (abilityBefore - parameter.difficulty));
        const abilityAfter = abilityBefore + (parameter.discrimination * ((correct ? 1 : 0) - probability)) / (1 + catInformation(parameter, abilityBefore));
        if (!Number.isFinite(abilityAfter)) throw new Error("Pembaruan kemampuan CAT tidak terbatas.");
        adaptive!.currentAbility = abilityAfter;
        adaptive!.updates.push({ abilityAfter, abilityBefore, itemId: tryoutItemId, probability, selectedOptionId });
        if (adaptive!.selectedItemIds.length < runCatItemCount!) {
          const next = nextCatItem(adaptive!);
          if (!next) throw new Error("Pool CAT habis sebelum jumlah item terpenuhi.");
          adaptive!.selectedItemIds.push(next.itemId);
        }
        await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { catSnapshot: json(adaptive!) } });
        if (adaptive!.updates.length >= runCatItemCount!) await calculateAndSealRun(tx, runId, now);
      } catch (error) {
        await failCatRun(tx, runId, error instanceof Error ? error.message : "Perhitungan CAT gagal.");
        return { answerId: answer.id, calculationFailed: true, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: answer.answeredAt };
      }
    }
    return { answerId: answer.id, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: answer.answeredAt };
  });
}

async function sealTryoutTestRun(attemptId: string, runId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } } } }, id: true } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const sessionRelease = attempt.deliverySession.assessmentRelease;
    if (!sessionRelease) throw new TryoutAttemptValidationError("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: sessionRelease.contentDigest, assessmentReleaseId: sessionRelease.id, assessmentReleaseNumber: sessionRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    await synchronizeAttempt(tx, attemptId, new Date(), studentId);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, select: { id: true, status: true } });
    if (!run) throw new TryoutAttemptValidationError("Test tidak ditemukan.");
    if (run.status === TryoutAttemptTestRunStatus.active) {
      const active = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: run.id }, include: { section: { select: { catItemCount: true, testType: true } } } });
      const frozen = assertCompleteFrozenRun(active, active.section, true);
      const runTestType = frozen.testType;
      const runCatItemCount = frozen.catItemCount;
      const snapshot = catSnapshot(active.catSnapshot);
      if (runTestType === TryoutTestType.cat && active.catState === TryoutCatRunState.ready && snapshot && snapshot.updates.length < (runCatItemCount ?? 0)) throw new TryoutAttemptValidationError("CAT hanya selesai setelah jumlah item tetap tercapai atau batas waktu server habis.");
      await calculateAndSealRun(tx, run.id, new Date());
    }
    const sealed = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: runId } });
    return { runId, status: sealed.status };
  });
}

function auditJson(value: unknown) { return value as Prisma.InputJsonValue; }
async function retryCatTestRun(runId: string, actorId: string, reason: string, allowCrossOwner = false) {
  if (!reason.trim()) throw new TryoutAttemptValidationError("Alasan audit retry CAT wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const run = await tx.tryoutAttemptTestRun.findUnique({ where: { id: runId }, include: { answers: { select: { id: true, selectedOptionId: true, tryoutItemId: true } }, assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } }, attempt: { select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } } } }, tryout: { select: { createdByUserId: true } } } }, section: { select: { catItemCount: true, scoringConfig: true, testType: true } } } });
    if (!run || assertCompleteFrozenRun(run, run.section, true).testType !== TryoutTestType.cat || run.catState === TryoutCatRunState.voided) throw new TryoutAttemptValidationError("Hanya run CAT gagal yang dapat dicoba ulang.");
    if (!run.assessmentRelease || !run.attempt.deliverySession.assessmentRelease) throw new TryoutAttemptValidationError("Run CAT belum memiliki AssessmentRelease yang valid.");
    if (!run.attempt.assessmentReleaseId || !run.attempt.assessmentReleaseNumber || !run.attempt.assessmentReleaseDigest) throw new TryoutAttemptValidationError("Attempt CAT belum memiliki metadata AssessmentRelease yang lengkap.");
    if (run.assessmentRelease.id !== run.attempt.assessmentReleaseId || run.assessmentRelease.releaseNumber !== run.attempt.assessmentReleaseNumber || run.assessmentRelease.contentDigest !== run.attempt.assessmentReleaseDigest || run.attempt.deliverySession.assessmentRelease.id !== run.attempt.assessmentReleaseId) throw new TryoutAttemptValidationError("Run CAT tidak cocok dengan AssessmentRelease attempt/sesi.");
    if (run.attempt.tryout.createdByUserId !== actorId && !allowCrossOwner) throw new TryoutAttemptValidationError("Anda tidak dapat mengulang CAT Tryout milik Kapten lain.");
    const before = { catFailureReason: run.catFailureReason, catState: run.catState };
    const snapshot = catSnapshot(run.catSnapshot);
    const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
    const scored = snapshot && Number.isFinite(snapshot.currentAbility)
      ? materializeFrozenAnswers(content.items ?? [], run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId })), snapshot.selectedItemIds)
      : null;
    if (!snapshot || !scored || scored.invalid || scored.normalizedScore === null) {
      await failCatRun(tx, runId, "Snapshot CAT tidak dapat dihitung ulang dari jawaban yang tersimpan.");
    } else {
      for (const answer of run.answers) {
        const materialized = scored.materializedAnswers.find((candidate) => candidate.itemId === answer.tryoutItemId);
        if (!materialized) continue;
        await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CAT_SCORING_VERSION } });
      }
      const normalizedScore = normalizeCatAbility(snapshot.currentAbility);
      await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationInput: json({ modelVersion: snapshot.modelVersion, parameters: snapshot.parameters, selectedItemIds: snapshot.selectedItemIds, updates: snapshot.updates }), calculationResult: json({ ability: snapshot.currentAbility, answeredCount: scored.answeredCount, correctCount: scored.correctCount, deliveredCount: snapshot.selectedItemIds.length, maxScore: scored.maxScore, normalizedScore, score: snapshot.currentAbility, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount }), calculationVersion: TRYOUT_CAT_SCORING_VERSION, calculationReleaseable: true, catFailureReason: null, catState: TryoutCatRunState.ready, correctCount: scored.correctCount, maxScore: scored.maxScore, normalizedScore, rawScore: snapshot.currentAbility, scaledScore: normalizedScore, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: null, scoringState: AssessmentScoringState.scored, scoringVersion: TRYOUT_CAT_SCORING_VERSION, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount } });
    }
    const updated = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: runId } });
    await tx.tryoutAttempt.update({ where: { id: updated.attemptId }, data: { releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scoringState: AssessmentScoringState.pending } });
    await markAttemptSubmittedIfComplete(tx, updated.attemptId, new Date());
    await tx.tryoutCatResolutionAudit.create({ data: { action: "retry", actorUserId: actorId, after: auditJson({ catFailureReason: updated.catFailureReason, catState: updated.catState }), before: auditJson(before), reason: reason.trim(), runId } });
    return { catState: updated.catState, releaseable: updated.calculationReleaseable, runId };
  });
}
async function voidCatTestRun(runId: string, actorId: string, reason: string, allowCrossOwner = false) {
  if (!reason.trim()) throw new TryoutAttemptValidationError("Alasan audit void CAT wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const run = await tx.tryoutAttemptTestRun.findUnique({ where: { id: runId }, include: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } }, attempt: { select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } } } }, tryout: { select: { createdByUserId: true } } } }, section: { select: { catItemCount: true, scoringConfig: true, testType: true } } } });
    if (!run || assertCompleteFrozenRun(run, run.section, true).testType !== TryoutTestType.cat) throw new TryoutAttemptValidationError("Hanya run CAT dapat divoid.");
    if (!run.assessmentRelease || !run.attempt.deliverySession.assessmentRelease) throw new TryoutAttemptValidationError("Run CAT belum memiliki AssessmentRelease yang valid.");
    if (!run.attempt.assessmentReleaseId || !run.attempt.assessmentReleaseNumber || !run.attempt.assessmentReleaseDigest) throw new TryoutAttemptValidationError("Attempt CAT belum memiliki metadata AssessmentRelease yang lengkap.");
    if (run.assessmentRelease.id !== run.attempt.assessmentReleaseId || run.assessmentRelease.releaseNumber !== run.attempt.assessmentReleaseNumber || run.assessmentRelease.contentDigest !== run.attempt.assessmentReleaseDigest || run.attempt.deliverySession.assessmentRelease.id !== run.attempt.assessmentReleaseId) throw new TryoutAttemptValidationError("Run CAT tidak cocok dengan AssessmentRelease attempt/sesi.");
    if (run.attempt.tryout.createdByUserId !== actorId && !allowCrossOwner) throw new TryoutAttemptValidationError("Anda tidak dapat me-void CAT Tryout milik Kapten lain.");
    const updated = await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationReleaseable: false, catFailureReason: "Run CAT divoid oleh operator berwenang.", catState: TryoutCatRunState.voided, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: reason.trim(), scoringState: AssessmentScoringState.review_required } });
    await tx.tryoutAttempt.update({ where: { id: updated.attemptId }, data: { releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: "Run CAT di-void oleh operator.", scoringState: AssessmentScoringState.review_required } });
    await tx.tryoutCatResolutionAudit.create({ data: { action: "void", actorUserId: actorId, after: auditJson({ catState: updated.catState }), before: auditJson({ catState: run.catState }), reason: reason.trim(), runId } });
    return { catState: updated.catState, releaseable: false, runId };
  });
}

export { attemptState, reconcileTryoutDisconnect, recordTryoutIntegrityEvent, retryCatTestRun, saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, startTryoutAttempt, startTryoutDisconnect, synchronizeAttempt, synchronizeTryoutOperations, TryoutAttemptValidationError, voidCatTestRun };
