import "server-only";

import { AssessmentAttemptState, AssessmentResultReleaseState, AssessmentScoringProvenance, AssessmentScoringState, AttemptStatus, ContentStatus, Prisma, TryoutAttemptTestRunStatus, TryoutAssignmentStatus, TryoutDeliverySessionStatus, TryoutIntegrityEventType, TryoutTestType } from "@/generated/prisma/client";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import {
  assertMatchingAssessmentRelease,
  findAssessmentReleaseSectionForRun,
  releaseMetadataFields,
  toParticipantAssessmentReleaseMetadata,
} from "@/lib/tryout/assessment-release";
import { materializeFrozenAnswers, TRYOUT_CBT_SCORING_VERSION, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";
import { canonicalizeCbtScoringConfig, scoreFixedOrderIrt } from "@/lib/tryout/cbt-scoring-policy";
import { prisma } from "@/lib/prisma";
import { materializeTryoutAttemptInTransaction } from "@/lib/tryout/result-repository";
import { validateSelectedOptionIds, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import {
  acquireTryoutIdentityMutex,
  assertTryoutIdentityStable,
  lockTryoutAggregate,
  lockTryoutAdmissions,
  lockTryoutAssignments,
  lockTryoutAttempts,
  lockTryoutRuns,
  lockTryoutSessions,
  lockTryoutStudents,
  prepareTryoutTransaction,
  resolveTryoutIdentity,
} from "@/lib/tryout/locks";

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
  snapshotId?: string | null;
  promptAssetId?: string | null;
  releaseItemId?: string;
  options: Array<{ assetId?: string | null; choiceKey: string; content: string; id: string; isCorrect: boolean; releaseOptionId?: string; snapshotOptionId?: string | null; sortOrder: number }>;
  points: string;
  prompt: string;
  questionType?: QuestionAnswerMode | string | null;
  sortOrder: number;
  sourceContentDigest?: string | null;
  sourceQuestionId?: string | null;
  sourceQuestionRevisionId?: string | null;
  sourceRevisionProvenance?: string | null;
};
function remainingSeconds(deadline: Date | null, now: Date) {
  return deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000)) : 0;
}

function frozenRunFields(
  contentSnapshot: Prisma.JsonValue,
  fallback: { durationSeconds?: number; scoringConfig?: Prisma.JsonValue | null; testType: string },
  requireFrozen = false,
) {
  // Bound runs always carry these fields in contentSnapshot. The section
  // fallback exists solely for nullable legacy rows that predate AS-09.
  const form = contentSnapshot as unknown as {
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
    && form.testType === TryoutTestType.cbt
    && Object.prototype.hasOwnProperty.call(form, "scoringConfig")
    && Array.isArray(form.items);
  if (requireFrozen && !complete) throw new TryoutAttemptValidationError("Test run terikat AssessmentRelease tetapi snapshot section/scoring belum lengkap.");
  if (requireFrozen) {
    return {
      durationSeconds: form.durationSeconds!,
      scoringConfig: form.scoringConfig ?? null,
      testType: TryoutTestType.cbt,
    };
  }
  return {
    durationSeconds: Number.isFinite(form.durationSeconds) ? form.durationSeconds! : fallback.durationSeconds ?? 0,
    scoringConfig: form.scoringConfig ?? fallback.scoringConfig ?? null,
    testType: form.testType === TryoutTestType.cbt ? TryoutTestType.cbt : fallback.testType,
  };
}

function isReleaseBoundRun(run: { assessmentReleaseDigest: string | null; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null }) {
  return Boolean(run.assessmentReleaseId || run.assessmentReleaseNumber !== null || run.assessmentReleaseDigest);
}

function assertCompleteFrozenRun(
  run: { assessmentReleaseDigest: string | null; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null; contentSnapshot: Prisma.JsonValue },
  fallback: { durationSeconds?: number; scoringConfig?: Prisma.JsonValue | null; testType: string },
  boundOverride = false,
) {
  const bound = boundOverride || isReleaseBoundRun(run);
  const frozen = frozenRunFields(run.contentSnapshot, fallback, bound);
  if (frozen.testType !== TryoutTestType.cbt) throw new TryoutAttemptValidationError("Test run harus bertipe CBT.");
  return frozen;
}

async function lockAttemptScope(tx: Prisma.TransactionClient, attemptId: string): Promise<AttemptScope | null> {
  await prepareTryoutTransaction(tx);
  const initial = await resolveTryoutIdentity(tx, { id: attemptId, kind: "attempt" });
  if (!initial) return null;
  const scope = await acquireTryoutIdentityMutex(tx, { id: attemptId, kind: "attempt" });
  if (!scope) return null;

  // A participant/runtime command enters through the Tryout mutex, then
  // principal keys, then the shared row order. The first lookup only resolves
  // the aggregate identity; all mappings are re-read after the mutex.
  await lockTryoutStudents(tx, [scope.studentId ?? initial.studentId!]);
  await lockTryoutAggregate(tx, scope.tryoutId);
  const stable = await assertTryoutIdentityStable(tx, { id: attemptId, kind: "attempt" }, scope.tryoutId);
  await lockTryoutSessions(tx, [stable.sessionId!]);
  await lockTryoutAdmissions(tx, [stable.admissionId!]);
  if (stable.assignmentId) await lockTryoutAssignments(tx, [stable.assignmentId]);
  await lockTryoutAttempts(tx, [stable.attemptId!]);
  const runs = await tx.tryoutAttemptTestRun.findMany({ where: { attemptId: stable.attemptId! }, orderBy: { id: "asc" }, select: { id: true } });
  await lockTryoutRuns(tx, runs.map((run) => run.id));
  return {
    admissionId: stable.admissionId!,
    deliverySessionId: stable.sessionId!,
    id: stable.attemptId!,
    studentId: stable.studentId!,
    tryoutId: stable.tryoutId,
  };
}

async function lockOverlappingDeliverySessions(
  tx: Prisma.TransactionClient,
  deliverySessionId: string,
  availableFrom: Date,
  availableUntil: Date,
) {
  const rows = await tx.tryoutDeliverySession.findMany({
    where: {
      OR: [
        { id: deliverySessionId },
        { availableFrom: { lt: availableUntil }, availableUntil: { gt: availableFrom } },
      ],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  await lockTryoutSessions(tx, rows.map((row) => row.id));
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
    include: { answers: { select: { id: true, selectedOptionId: true, selectedOptionIds: true, tryoutItemId: true } }, attempt: { select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentReleaseId: true } } } }, section: { select: { scoringConfig: true, testType: true } } },
  });
  if (!run || run.status !== TryoutAttemptTestRunStatus.active) return run;
  const frozen = assertCompleteFrozenRun(run, run.section, Boolean(run.attempt.assessmentReleaseId || run.attempt.assessmentReleaseNumber !== null || run.attempt.assessmentReleaseDigest || run.attempt.deliverySession.assessmentReleaseId));
  const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
  const items = content.items ?? [];
  const scored = materializeFrozenAnswers(items, run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId, selectedOptionIds: Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds.filter((value): value is string => typeof value === "string") : null })));
  if (scored.invalid || scored.normalizedScore === null) {
    const failed = await tx.tryoutAttemptTestRun.update({
      where: { id: run.id },
      data: {
        calculationReleaseable: false,
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
  const scoringPolicy = canonicalizeCbtScoringConfig(frozen.scoringConfig);
  if (scoringPolicy.method === "irt_2pl") {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const responses = scored.materializedAnswers
      .filter((answer): answer is typeof answer & { isCorrect: boolean } => answer.isCorrect !== null)
      .map((answer) => {
        const item = itemById.get(answer.itemId);
        const itemId = item?.snapshotId ?? item?.sourceQuestionId;
        return itemId ? { isCorrect: answer.isCorrect, itemId } : null;
      })
      .filter((response): response is { isCorrect: boolean; itemId: string } => Boolean(response));
    if (scoringPolicy.itemParameters.length !== items.length || items.some((item) => {
      const itemId = item.snapshotId ?? item.sourceQuestionId;
      return !itemId || !scoringPolicy.itemParameters.some((parameter) => parameter.itemId === itemId);
    })) {
      const failed = await tx.tryoutAttemptTestRun.update({
        where: { id: run.id },
        data: {
          calculationReleaseable: false,
          scoringProvenance: AssessmentScoringProvenance.runtime,
          scoringReviewReason: "IRT CBT requires a frozen parameter for every item.",
          scoringState: AssessmentScoringState.review_required,
          sealedAt: now,
          status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
        },
      });
      await markAttemptSubmittedIfComplete(tx, failed.attemptId, now, !expired);
      return failed;
    }
    const estimated = scoreFixedOrderIrt({ itemParameters: scoringPolicy.itemParameters, responses });
    const materializedByItemId = new Map(scored.materializedAnswers.map((candidate) => [candidate.itemId, candidate]));
    for (const answer of run.answers) {
      const materialized = materializedByItemId.get(answer.tryoutItemId);
      if (!materialized) continue;
      // react-doctor-disable-next-line async-await-in-loop -- apply each persisted answer's score before sealing the run.
      await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.isCorrect ? 1 : 0, scoringVersion: estimated.scoringVersion } });
    }
    const result = { ability: estimated.ability, answeredCount: scored.answeredCount, correctCount: scored.correctCount, maxScore: items.length, normalizedScore: estimated.normalizedScore, score: estimated.ability, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount };
    const sealed = await tx.tryoutAttemptTestRun.update({
      where: { id: run.id },
      data: {
        calculationInput: json({ itemParameters: scoringPolicy.itemParameters, responses, scoringConfig: scoringPolicy }),
        calculationResult: json(result),
        calculationReleaseable: true,
        correctCount: scored.correctCount,
        maxScore: items.length,
        normalizedScore: estimated.normalizedScore,
        rawScore: estimated.ability,
        scaledScore: estimated.normalizedScore,
        scoringProvenance: AssessmentScoringProvenance.runtime,
        scoringReviewReason: null,
        scoringState: AssessmentScoringState.scored,
        scoringVersion: estimated.scoringVersion,
        sealedAt: now,
        status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
        unansweredCount: scored.unansweredCount,
        wrongCount: scored.wrongCount,
      },
    });
    await markAttemptSubmittedIfComplete(tx, sealed.attemptId, now, true);
    return sealed;
  }
  const materializedByItemId = new Map(scored.materializedAnswers.map((candidate) => [candidate.itemId, candidate]));
  for (const answer of run.answers) {
      const materialized = materializedByItemId.get(answer.tryoutItemId);
      if (!materialized) continue;
      // react-doctor-disable-next-line async-await-in-loop -- persist answer scoring before sealing the run transaction.
      await tx.tryoutAnswer.update({
        where: { id: answer.id },
        data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CBT_SCORING_VERSION },
      });
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
  lockedScope?: AttemptScope,
) {
  const scope = lockedScope ?? await lockAttemptScope(tx, attemptId);
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
  const candidates = await prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const identity = await acquireTryoutIdentityMutex(tx, { id: tryoutId, kind: "tryout" });
    if (!identity) return null;
    await lockTryoutAggregate(tx, identity.tryoutId);
    await assertTryoutIdentityStable(tx, { id: tryoutId, kind: "tryout" }, identity.tryoutId);
    const ownedTryout = await tx.tryoutPackage.findFirst({
      select: { id: true },
      where: { createdByUserId: actorId, id: tryoutId },
    });
    if (!ownedTryout) return null;
    return tx.tryoutAttempt.findMany({
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
  });
  if (!candidates) return false;
  for (const candidate of candidates) {
    // Keep each candidate scope in its own short transaction. A single
    // refresh transaction would retain student/session/Tryout locks from A
    // while waiting for B, which can deadlock against participant commands
    // that acquire B before an overlapping session row.
    const synchronized = await prisma.$transaction(async (tx) => {
      await synchronizeAttempt(tx, candidate.id, now, actorId);
      const currentOwner = await tx.tryoutPackage.findFirst({
        select: { id: true },
        where: { createdByUserId: actorId, id: tryoutId },
      });
      if (!currentOwner) return false;
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
      throw new TryoutAttemptValidationError("Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa. Buat sesi baru dari halaman admin.");
    }
    await synchronizeAttempt(tx, attemptId, now, actorId, scope);
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
      throw new TryoutAttemptValidationError("Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa. Buat sesi baru dari halaman admin.");
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
      throw new TryoutAttemptValidationError("Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa. Buat sesi baru dari halaman admin.");
    }
    await synchronizeAttempt(tx, attemptId, now, actorId, scope);
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
      throw new TryoutAttemptValidationError("Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa. Buat sesi baru dari halaman admin.");
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

function snapshotSection(section: { id: string; durationSeconds: number; instructions: string | null; scoringConfig: Prisma.JsonValue | null; sequenceNo: number; subtestId: string; testType: string; title: string; items: Array<{ difficulty: string; explanation: string | null; explanationAssetId: string | null; id: string; questionType?: QuestionAnswerMode | string | null; releaseItemId?: string; snapshotId?: string | null; prompt: string; promptAssetId?: string | null; points: Prisma.Decimal | number | string; sortOrder: number; sourceContentDigest?: string | null; sourceQuestionId?: string | null; sourceQuestionRevisionId?: string | null; sourceRevisionProvenance?: string | null; options: Array<{ assetId?: string | null; id: string; choiceKey: string; content: string; isCorrect: boolean; releaseOptionId?: string; snapshotOptionId?: string | null; sortOrder: number }> }> }) {
  return {
    durationSeconds: section.durationSeconds,
    instructions: section.instructions,
    items: section.items.map((item) => ({
      difficulty: item.difficulty,
      explanation: item.explanation,
      explanationAssetId: item.explanationAssetId,
      id: item.id,
      options: item.options.map((option) => ({ assetId: option.assetId, choiceKey: option.choiceKey, content: option.content, id: option.id, isCorrect: option.isCorrect, releaseOptionId: option.releaseOptionId, snapshotOptionId: option.snapshotOptionId, sortOrder: option.sortOrder })),
      points: item.points.toString(),
      prompt: item.prompt,
      promptAssetId: item.promptAssetId,
      questionType: item.questionType ?? "single_choice",
      releaseItemId: item.releaseItemId,
      ...(item.snapshotId ? { snapshotId: item.snapshotId } : {
        sourceContentDigest: item.sourceContentDigest ?? null,
        sourceQuestionId: item.sourceQuestionId ?? null,
        sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? null,
        sourceRevisionProvenance: item.sourceRevisionProvenance ?? null,
      }),
      sortOrder: item.sortOrder,
    })),
    scoringConfig: section.scoringConfig,
    sectionId: section.id,
    sequenceNo: section.sequenceNo,
    subtestId: section.subtestId,
    testType: section.testType,
    title: section.title,
  };
}

async function startTryoutAttempt(deliverySessionId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const student = await tx.user.findUnique({
      select: { previewPurpose: true },
      where: { id: studentId },
    });
    if (isManagedPreviewPurpose(student?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Sesi pratinjau tidak dapat dimulai lewat halaman siswa. Buat sesi baru dari halaman admin.");
    }
    const identity = await acquireTryoutIdentityMutex(tx, { id: deliverySessionId, kind: "session" });
    if (!identity) throw new TryoutAttemptValidationError("Sesi Tryout tidak ditemukan.");
    await lockTryoutStudents(tx, [studentId]);
    await lockTryoutAggregate(tx, identity.tryoutId);
    await assertTryoutIdentityStable(tx, { id: deliverySessionId, kind: "session" }, identity.tryoutId);
    const candidate = await tx.tryoutDeliveryAssignment.findFirst({
      where: { deliverySessionId, status: TryoutAssignmentStatus.active, admission: { status: "active", studentId } },
      select: { admissionId: true, id: true },
    });
    if (!candidate) throw new TryoutAttemptValidationError("Sesi Tryout tidak tersedia untuk peserta ini.");

    // Revocation takes the same participant and assignment locks. Re-read the
    // active row after those locks so a revoke cannot be bypassed between the
    // eligibility check and attempt creation.
    const assignment = await tx.tryoutDeliveryAssignment.findFirst({
      where: { id: candidate.id, deliverySessionId, status: TryoutAssignmentStatus.active, admission: { status: "active", studentId } },
      include: { admission: true, deliverySession: true },
    });
    if (!assignment || assignment.deliverySession.status !== TryoutDeliverySessionStatus.active) throw new TryoutAttemptValidationError("Sesi Tryout tidak tersedia untuk peserta ini.");
    const session = assignment.deliverySession;
    if (session.availableFrom > now || session.availableUntil <= now) throw new TryoutAttemptValidationError("Jendela sesi Tryout belum tersedia atau sudah berakhir.");
    if (!session.assessmentReleaseId) throw new TryoutAttemptValidationError("Sesi Tryout belum memiliki AssessmentRelease yang valid.");

    // Lock every overlapping session in a deterministic order after the
    // aggregate row. The candidate assignment is then revalidated while all
    // hierarchy predecessors are held.
    await lockOverlappingDeliverySessions(tx, deliverySessionId, session.availableFrom, session.availableUntil);
    await lockTryoutAdmissions(tx, [candidate.admissionId]);
    await lockTryoutAssignments(tx, [candidate.id]);
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

    // This is the single content-lock transition: same aggregate lock as
    // authoring writes. The row was already acquired before session locks.
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: session.tryoutId }, select: { isHidden: true, status: true } });
    if (!tryout || tryout.status !== ContentStatus.published || tryout.isHidden) throw new TryoutAttemptValidationError("Tryout ini sudah tidak tersedia untuk memulai pengerjaan baru.");
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
      schemaVersion?: string;
      sections?: Array<{
        assembly?: { packageVersionId: string | null };
        durationSeconds: number;
        id: string;
        instructions: string | null;
        physicalId?: string;
        items: Array<{
          difficulty: string;
          explanation: string | null;
          explanationAssetId: string | null;
          id: string;
          questionType?: QuestionAnswerMode | string | null;
          physicalId?: string;
          options: Array<{ choiceKey: string; content: string; id: string; isCorrect: boolean; snapshotOptionId?: string | null; sortOrder: number; sourceQuestionOptionId?: string | null; sourceQuestionRevisionOptionId?: string | null }>;
          packageCode: string;
          points: string;
          prompt: string;
          promptAssetId: string | null;
          snapshotId?: string | null;
          sortOrder: number;
          sourceContentDigest?: string | null;
          sourceQuestionId?: string | null;
          sourceQuestionRevisionId?: string | null;
          sourceRevisionProvenance?: string | null;
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
    })) throw new TryoutAttemptValidationError("Tryout belum siap dikerjakan. Hubungi Kapten untuk mendapatkan bantuan.");
    const usedCurrentItemIds = new Set<string>();
    const projectReleaseItem = (item: (typeof releaseSections)[number]["items"][number], currentSection: (typeof lockedTryout.sections)[number]) => {
      const hasSnapshotIdentity = typeof item.snapshotId === "string" && item.snapshotId.length > 0;
      const snapshotMatches = hasSnapshotIdentity
        ? currentSection.items.filter((candidate) => candidate.snapshotId === item.snapshotId)
        : [];
      const sourceMatches = item.sourceQuestionId
        ? currentSection.items.filter((candidate) => candidate.sourceQuestionId === item.sourceQuestionId
          && candidate.sourceQuestionRevisionId === item.sourceQuestionRevisionId
          && candidate.sourceContentDigest === item.sourceContentDigest)
        : [];
      const physicalMatch = item.physicalId
        ? currentSection.items.find((candidate) => candidate.id === item.physicalId)
        : undefined;
      // Detached v2 rows bridge only through their stable local identity;
      // frozen v1 source-less payloads retain their physical-ID bridge.
      const currentItem = hasSnapshotIdentity
        ? snapshotMatches.length === 1 ? snapshotMatches[0] : undefined
        : item.sourceQuestionId
          ? sourceMatches.length === 1 ? sourceMatches[0] : undefined
          : releasePayload.schemaVersion === "assessment-release-v2"
            ? undefined
            : physicalMatch;
      if (!currentItem) throw new TryoutAttemptValidationError("AssessmentRelease tidak lagi memiliki baris soal sumber yang dapat dijawab.");
      if (usedCurrentItemIds.has(currentItem.id)) throw new TryoutAttemptValidationError("Tryout saat ini tidak menyediakan bridge unik untuk seluruh item AssessmentRelease.");
      usedCurrentItemIds.add(currentItem.id);
      // The release payload supplies every answerable field below. Current
      // rows contribute only FK-safe IDs so answers can reference the legacy
      // schema while R1 content remains independent from mutable R2 text.
      const currentOptionById = new Map(currentItem.options.map((option) => [option.id, option]));
      const projectedOptions = item.options.map((option) => {
        if (hasSnapshotIdentity) {
          const snapshotOptionMatches = option.snapshotOptionId
            ? currentItem.options.filter((candidate) => candidate.snapshotOptionId === option.snapshotOptionId)
            : [];
          const currentOption = snapshotOptionMatches.length === 1 ? snapshotOptionMatches[0] : undefined;
          if (!currentOption) throw new TryoutAttemptValidationError("AssessmentRelease tidak lagi memiliki bridge pilihan jawaban salinan yang unik.");
          return { ...option, id: currentOption.id, releaseOptionId: option.id };
        }
        const sourceOptionMatches = option.sourceQuestionRevisionOptionId
          ? currentItem.options.filter((candidate) => candidate.sourceQuestionRevisionOptionId === option.sourceQuestionRevisionOptionId
            && (!option.sourceQuestionOptionId || candidate.sourceQuestionOptionId === option.sourceQuestionOptionId))
          : option.sourceQuestionOptionId
            ? currentItem.options.filter((candidate) => candidate.sourceQuestionOptionId === option.sourceQuestionOptionId)
            : [];
        const currentOption = option.sourceQuestionOptionId || option.sourceQuestionRevisionOptionId
          ? sourceOptionMatches.length === 1 ? sourceOptionMatches[0] : undefined
          : releasePayload.schemaVersion === "assessment-release-v2"
            ? undefined
            : currentOptionById.get((option as { physicalId?: string }).physicalId ?? option.id);
        if (!currentOption) throw new TryoutAttemptValidationError("AssessmentRelease tidak lagi memiliki pilihan jawaban sumber yang dapat dijawab.");
        return { ...option, id: currentOption.id, releaseOptionId: option.id };
      });
      return { ...item, id: currentItem.id, releaseItemId: item.id, options: projectedOptions, questionType: item.questionType ?? currentItem.questionType ?? "single_choice" };
    };
    const runtimeSections = releaseSections.map((section) => {
      const currentSection = currentSectionBySequence.get(section.sequenceNo)!;
      return {
        ...section,
        id: currentSection.id,
        items: section.items.map((item) => projectReleaseItem(item, currentSection)),
        packageVersionId: section.assembly?.packageVersionId ?? null,
        scoringConfig: section.scoring?.config ?? null,
        shuffleItems: section.randomization?.shuffleItems ?? false,
        testType: TryoutTestType.cbt,
      };
    });
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
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope || scope.studentId !== studentId) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
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
    if (!legacyRead) await synchronizeAttempt(tx, attemptId, now, studentId, scope);
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
        testType: frozen?.testType ?? TryoutTestType.cbt,
        title: bound ? releaseSection!.title! : run.section.title,
      };
    };
    const active = runs.find((run) => run.status === TryoutAttemptTestRunStatus.active);
    const activeSection = active ? projectRunSection(active) : null;
    const activeSnapshot = active ? redactRunSnapshot(active.contentSnapshot) : null;
    const exposed = active
      ? {
          answers: (await tx.tryoutAnswer.findMany({
            where: { attemptTestRunId: active.id },
            select: { selectedOptionId: true, selectedOptionIds: true, tryoutItemId: true },
          })).map((answer) => ({
            selectedOptionId: answer.selectedOptionId,
            selectedOptionIds: Array.isArray(answer.selectedOptionIds)
              ? answer.selectedOptionIds.filter((value): value is string => typeof value === "string")
              : null,
            tryoutItemId: answer.tryoutItemId,
          })),
          activeItemId: null,
          contentSnapshot: activeSnapshot,
          fullscreenPrompt: attempt.deliverySession.fullscreenPrompt,
          id: active.id,
          section: activeSection!,
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
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope || scope.studentId !== studentId) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, include: { assessmentRelease: { select: { id: true } }, deliverySession: { select: { assessmentReleaseId: true, fullscreenPrompt: true } } } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    if (!attempt.assessmentReleaseId || !attempt.assessmentReleaseNumber || !attempt.assessmentReleaseDigest || attempt.assessmentReleaseId !== attempt.deliverySession.assessmentReleaseId) throw new TryoutAttemptValidationError("Attempt Tryout tidak terikat pada AssessmentRelease sesi.");
    await synchronizeAttempt(tx, attemptId, now, studentId, scope);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, id: runId, status: TryoutAttemptTestRunStatus.active }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, contentSnapshot: true, id: true } });
    if (!run) throw new TryoutAttemptValidationError("Hanya Test aktif yang dapat mencatat peringatan Tryout.");
    assertCompleteFrozenRun(run, { testType: TryoutTestType.cbt }, true);
    if ((eventType === TryoutIntegrityEventType.fullscreen_entered || eventType === TryoutIntegrityEventType.fullscreen_exited) && !attempt.deliverySession.fullscreenPrompt) throw new TryoutAttemptValidationError("Pengingat layar penuh tidak diaktifkan untuk sesi ini.");
    if (eventType === TryoutIntegrityEventType.fullscreen_exited) {
      const entered = await tx.tryoutIntegrityEvent.findFirst({ where: { eventType: TryoutIntegrityEventType.fullscreen_entered, runId }, select: { id: true } });
      if (!entered) return { ignored: true, serverSequence: null };
    }
    const previous = await tx.tryoutIntegrityEvent.aggregate({ _max: { serverSequence: true }, where: { runId } });
    const event = await tx.tryoutIntegrityEvent.create({ data: { eventType, runId, serverSequence: (previous._max.serverSequence ?? 0) + 1 } });
    return { ignored: false, serverSequence: event.serverSequence };
  });
}

function redactRunSnapshot(snapshot: Prisma.JsonValue) {
  const value = structuredClone(snapshot) as { items?: Array<{ id: string; options?: Array<{ isCorrect?: boolean }> }> };
  value.items?.forEach((item) => item.options?.forEach((option) => delete option.isCorrect));
  return value;
}

async function startActiveTestRun(attemptId: string, runId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope || scope.studentId !== studentId) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, include: { assessmentRelease: { select: { id: true, contentDigest: true, releaseNumber: true } }, deliverySession: { include: { assessmentRelease: { select: { id: true, contentDigest: true, releaseNumber: true } } } } } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    if (!attempt.assessmentRelease || !attempt.deliverySession.assessmentRelease) throw new TryoutAttemptValidationError("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: attempt.deliverySession.assessmentRelease.contentDigest, assessmentReleaseId: attempt.deliverySession.assessmentRelease.id, assessmentReleaseNumber: attempt.deliverySession.assessmentRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    await synchronizeAttempt(tx, attemptId, now, studentId, scope);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, include: { section: true } });
    if (!run || run.status !== TryoutAttemptTestRunStatus.pending) throw new TryoutAttemptValidationError("Hanya Test berikutnya yang belum dimulai dapat dibuka.");
    const frozen = assertCompleteFrozenRun(run, run.section, true);
    const [predecessor, active] = await Promise.all([
      tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, sequenceNo: { lt: run.sequenceNo }, status: { notIn: [TryoutAttemptTestRunStatus.sealed, TryoutAttemptTestRunStatus.expired] } }, select: { id: true } }),
      tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } }),
    ]);
    if (predecessor || active) throw new TryoutAttemptValidationError("Test sebelumnya harus diselesaikan sebelum Test ini dimulai.");
    if (frozen.testType !== TryoutTestType.cbt) throw new TryoutAttemptValidationError("Hanya Test CBT yang dapat dibuka.");
    const durationSeconds = frozen.durationSeconds;
    const deadline = new Date(Math.min(now.getTime() + durationSeconds * 1000, attempt.deliverySession.availableUntil.getTime()));
    if (deadline <= now) { await expireForSessionCap(tx, attemptId, now); throw new TryoutAttemptValidationError("Waktu sesi Tryout sudah berakhir."); }
    const updated = await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { serverDeadlineAt: deadline, serverStartedAt: now, status: TryoutAttemptTestRunStatus.active } });
    const contentSnapshot = redactRunSnapshot(updated.contentSnapshot);
    return { deadlineAt: deadline, remainingSeconds: remainingSeconds(deadline, now), run: { ...updated, activeItemId: null, contentSnapshot } };
  });
}

type TryoutAnswerSelectionInput = readonly string[] | string | null;

function normalizeTryoutAnswerSelection(value: TryoutAnswerSelectionInput) {
  if (Array.isArray(value)) return [...value];
  return value ? [value] : [];
}

function answerModeForSnapshotItem(item: ItemSnapshot): QuestionAnswerMode {
  if (item.questionType === "multiple_choice") return "multiple_choice";
  return item.options.filter((option) => option.isCorrect).length > 1 ? "multiple_choice" : "single_choice";
}

async function saveTryoutAnswer(attemptId: string, runId: string, tryoutItemId: string, selectionInput: TryoutAnswerSelectionInput, studentId: string) {
  const selectedOptionIds = normalizeTryoutAnswerSelection(selectionInput);
  const selectedOptionId = selectedOptionIds[0] ?? null;
  let now = new Date();
  return prisma.$transaction(async (tx) => {
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope || scope.studentId !== studentId) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const loadAttempt = () => tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } }, availableUntil: true, status: true } }, id: true, status: true } });
    let attempt = await loadAttempt();
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const sessionRelease = attempt.deliverySession.assessmentRelease;
    if (!sessionRelease) throw new TryoutAttemptValidationError("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: sessionRelease.contentDigest, assessmentReleaseId: sessionRelease.id, assessmentReleaseNumber: sessionRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    await synchronizeAttempt(tx, attemptId, now, studentId, scope);
    attempt = await loadAttempt();
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    now = new Date();
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, include: { section: { select: { testType: true, tryoutId: true } } } });
    if (!run) throw new TryoutAttemptValidationError("Test Tryout tidak ditemukan dalam attempt ini.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: sessionRelease.contentDigest, assessmentReleaseId: sessionRelease.id, assessmentReleaseNumber: sessionRelease.releaseNumber },
      { assessmentReleaseDigest: run.assessmentReleaseDigest, assessmentReleaseId: run.assessmentReleaseId, assessmentReleaseNumber: run.assessmentReleaseNumber },
      "Run Tryout belum terikat pada AssessmentRelease sesi.",
    );
    assertCompleteFrozenRun(run, run.section, true);
    const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
    const item = content.items?.find((candidate) => candidate.id === tryoutItemId);
    if (!item) throw new TryoutAttemptValidationError("Soal tidak termasuk dalam Test aktif.");
    const answerMode = answerModeForSnapshotItem(item);
    const selection = validateSelectedOptionIds(answerMode, selectedOptionIds, item.options.map((option) => option.id));
    if (!selection.ok) throw new TryoutAttemptValidationError(selection.errors[0].message);
    if (run.status !== TryoutAttemptTestRunStatus.active) throw new TryoutAttemptValidationError("Hanya Test aktif yang dapat menyimpan jawaban.");
    const answer = await tx.tryoutAnswer.upsert({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } }, create: { answerText: null, answeredAt: now, attemptId, attemptTestRunId: runId, selectedOptionId, selectedOptionIds: json(selectedOptionIds), tryoutId: run.section.tryoutId, tryoutItemId }, update: { answeredAt: now, selectedOptionId, selectedOptionIds: json(selectedOptionIds) } });
    return { answerId: answer.id, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: answer.answeredAt };
  });
}

async function sealTryoutTestRun(attemptId: string, runId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const scope = await lockAttemptScope(tx, attemptId);
    if (!scope || scope.studentId !== studentId) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { assessmentReleaseDigest: true, assessmentReleaseId: true, assessmentReleaseNumber: true, deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } } } }, id: true } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    const sessionRelease = attempt.deliverySession.assessmentRelease;
    if (!sessionRelease) throw new TryoutAttemptValidationError("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
    assertAttemptReleaseBinding(
      { assessmentReleaseDigest: sessionRelease.contentDigest, assessmentReleaseId: sessionRelease.id, assessmentReleaseNumber: sessionRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    await synchronizeAttempt(tx, attemptId, new Date(), studentId, scope);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, select: { id: true, status: true } });
    if (!run) throw new TryoutAttemptValidationError("Test tidak ditemukan.");
    if (run.status === TryoutAttemptTestRunStatus.active) {
      const active = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: run.id }, include: { section: { select: { testType: true } } } });
      const frozen = assertCompleteFrozenRun(active, active.section, true);
      if (frozen.testType !== TryoutTestType.cbt) throw new TryoutAttemptValidationError("Hanya Test CBT yang dapat diselesaikan.");
      await calculateAndSealRun(tx, run.id, new Date());
    }
    const sealed = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: runId } });
    return { runId, status: sealed.status };
  });
}

export { attemptState, reconcileTryoutDisconnect, recordTryoutIntegrityEvent, saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, startTryoutAttempt, startTryoutDisconnect, synchronizeAttempt, synchronizeTryoutOperations, TryoutAttemptValidationError };
