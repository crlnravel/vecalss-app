import "server-only";

import { AssessmentAttemptState, AssessmentResultReleaseState, AssessmentScoringProvenance, AssessmentScoringState, AttemptStatus, Prisma, TryoutAttemptTestRunStatus, TryoutResultReleasePolicy } from "@/generated/prisma/client";
import {
  assertMatchingAssessmentRelease,
  findAssessmentReleaseSectionForRun,
  toParticipantAssessmentReleaseMetadata,
} from "@/lib/tryout/assessment-release";
import { prisma } from "@/lib/prisma";
import { aggregateTryoutScores, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";
import { assertFrozenRunRelease, calculateFrozenTryoutRun, FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE } from "@/lib/tryout/frozen-run-scoring";
import type { TryoutCalculationReceipt, TryoutResultRecoveryScope, TryoutResultRecoverySnapshot } from "@/lib/tryout/result-recovery";
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
} from "@/lib/tryout/locks";

class TryoutResultValidationError extends Error {}

type ReleasePolicy = "immediate" | "manual" | "automatic_at_end" | "scheduled";
const json = (value: unknown) => value as Prisma.InputJsonValue;
const TRYOUT_RELEASE_SYNC_TRANSACTION_TIMEOUT_MS = 15_000;

function assertResultReleaseBinding(
  expected: {
    assessmentReleaseDigest: string | null;
    assessmentReleaseId: string | null;
    assessmentReleaseNumber: number | null;
  },
  actual: {
    assessmentReleaseDigest: string | null;
    assessmentReleaseId: string | null;
    assessmentReleaseNumber: number | null;
  },
  message = "Identitas AssessmentRelease tidak cocok dengan sesi participant.",
) {
  try {
    assertMatchingAssessmentRelease(expected, actual, message);
  } catch {
    throw new TryoutResultValidationError(message);
  }
}

function effectivePolicy(session: { resultReleasePolicy: TryoutResultReleasePolicy; tryout: { defaultResultReleasePolicy: TryoutResultReleasePolicy } }): ReleasePolicy {
  const selected = session.resultReleasePolicy === TryoutResultReleasePolicy.inherit ? session.tryout.defaultResultReleasePolicy : session.resultReleasePolicy;
  if (selected === TryoutResultReleasePolicy.inherit) throw new TryoutResultValidationError("Kebijakan rilis Tryout belum lengkap.");
  return selected as ReleasePolicy;
}

function explanationsComplete(run: { contentSnapshot: Prisma.JsonValue }) {
  const content = run.contentSnapshot as { items?: Array<{ explanation?: string | null; explanationAssetId?: string | null; id: string }> };
  const items = content.items ?? [];
  return items.length > 0
    && items.every((item) => Boolean(item.explanation?.trim() || item.explanationAssetId));
}

function frozenRunFields(
  run: {
    assessmentReleaseDigest?: string | null;
    assessmentReleaseId?: string | null;
    assessmentReleaseNumber?: number | null;
    contentSnapshot: Prisma.JsonValue;
    section: unknown;
  },
  requireFrozen = false,
) {
  // A bound AS-09 run is authoritative from its snapshot. Mutable section
  // values are retained only to keep historical nullable rows readable.
  const form = run.contentSnapshot as unknown as {
    durationSeconds?: number;
    items?: unknown[];
    scoringConfig?: Prisma.JsonValue | null;
    sectionId?: string;
    sequenceNo?: number;
    subtestId?: string;
    testType?: string;
    title?: string;
  };
  const legacySection = run.section as { durationSeconds?: number; testType?: string; title?: string };
  const complete = typeof form.sectionId === "string"
    && Number.isInteger(form.sequenceNo)
    && typeof form.subtestId === "string"
    && typeof form.title === "string"
    && Number.isFinite(form.durationSeconds)
    && form.durationSeconds! >= 0
    && form.testType === "cbt"
    && Object.prototype.hasOwnProperty.call(form, "scoringConfig")
    && Array.isArray(form.items);
  if (requireFrozen && !complete) throw new TryoutResultValidationError("Test run terikat AssessmentRelease tetapi snapshot section/scoring belum lengkap.");
  if (requireFrozen) {
    return {
      durationSeconds: form.durationSeconds!,
      subtestId: form.subtestId!,
      testType: "cbt",
      title: form.title!,
    };
  }
  return {
    durationSeconds: Number.isFinite(form.durationSeconds) ? form.durationSeconds! : legacySection.durationSeconds ?? 0,
    subtestId: form.subtestId ?? null,
    testType: "cbt",
    title: form.title ?? legacySection.title ?? "",
  };
}

function isReleaseBoundRun(run: { assessmentReleaseDigest?: string | null; assessmentReleaseId?: string | null; assessmentReleaseNumber?: number | null }) {
  return Boolean(run.assessmentReleaseId || run.assessmentReleaseNumber !== null || run.assessmentReleaseDigest);
}

type CanonicalSection = { id: string; sequenceNo: number; subtestId: string };
type CanonicalRun = { sequenceNo: number; tryoutSectionId: string; section: { id: string; sequenceNo: number; subtestId: string; tryoutId: string } };
type ReleaseBreakdown = { normalizedScore: Prisma.Decimal | null; rawScore: Prisma.Decimal | null; scaledScore: Prisma.Decimal | null; scoringProvenance: AssessmentScoringProvenance; scoringVersion: string | null; subtestId: string };

function hasCanonicalSevenRunSet(input: { tryoutId: string; tryout: { sections: CanonicalSection[] }; runs: CanonicalRun[] }) {
  const sections = input.tryout.sections;
  if (sections.length !== 7 || input.runs.length !== 7) return false;
  const sectionIds = new Set(sections.map((section) => section.id));
  const sequenceNos = new Set(sections.map((section) => section.sequenceNo));
  const subtestIds = new Set(sections.map((section) => section.subtestId));
  if (sectionIds.size !== 7 || sequenceNos.size !== 7 || subtestIds.size !== 7) return false;
  const seenSections = new Set<string>();
  const seenSequences = new Set<number>();
  return input.runs.every((run) => {
    if (!sectionIds.has(run.tryoutSectionId) || seenSections.has(run.tryoutSectionId) || seenSequences.has(run.sequenceNo)) return false;
    if (run.section.id !== run.tryoutSectionId || run.section.tryoutId !== input.tryoutId || run.section.sequenceNo !== run.sequenceNo) return false;
    seenSections.add(run.tryoutSectionId);
    seenSequences.add(run.sequenceNo);
    return true;
  }) && seenSections.size === 7 && seenSequences.size === 7;
}

function hasCanonicalSevenBreakdownSet(input: { tryout: { sections: CanonicalSection[] }; breakdowns: ReleaseBreakdown[] }) {
  if (input.breakdowns.length !== 7) return false;
  const expectedSubtests = new Set(input.tryout.sections.map((section) => section.subtestId));
  const actualSubtests = new Set(input.breakdowns.map((breakdown) => breakdown.subtestId));
  return input.tryout.sections.length === 7
    && expectedSubtests.size === 7
    && actualSubtests.size === 7
    && [...actualSubtests].every((subtestId) => expectedSubtests.has(subtestId))
    && input.breakdowns.every((breakdown) => breakdown.normalizedScore !== null
      && breakdown.rawScore !== null
      && breakdown.scaledScore !== null
      && Boolean(breakdown.scoringVersion)
      && breakdown.scoringProvenance !== AssessmentScoringProvenance.legacy_unknown);
}

function terminalAttemptStateIsCalculable(attempt: { attemptState: AssessmentAttemptState; status: AttemptStatus }) {
  return attempt.attemptState !== AssessmentAttemptState.in_progress
    && attempt.attemptState !== AssessmentAttemptState.abandoned
    && attempt.attemptState !== AssessmentAttemptState.void
    && attempt.status !== AttemptStatus.in_progress
    && attempt.status !== AttemptStatus.abandoned;
}

const PUBLISHED_RESULT_REVIEW_MESSAGE = "Hasil yang sudah dirilis perlu diperiksa terlebih dahulu.";
type PublishedRun = CanonicalRun & {
  assessmentReleaseDigest: string | null; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null;
  calculationReleaseable: boolean; calculationResult: Prisma.JsonValue | null; contentSnapshot: Prisma.JsonValue;
  normalizedScore: Prisma.Decimal | null; rawScore: Prisma.Decimal | null; scaledScore: Prisma.Decimal | null;
  scoringState: AssessmentScoringState; scoringVersion: string | null; status: TryoutAttemptTestRunStatus;
};
type PublishedAttempt = {
  assessmentReleaseDigest: string | null; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null;
  attemptState: AssessmentAttemptState; status: AttemptStatus; releaseState: AssessmentResultReleaseState; releaseAt: Date | null;
  score: Prisma.Decimal | null; normalizedScore: Prisma.Decimal | null; scaledScore: Prisma.Decimal | null;
  scoringState: AssessmentScoringState; scoringVersion: string | null; tryoutId: string;
  runs: PublishedRun[]; scoreBreakdowns: ReleaseBreakdown[];
};

/** Inspect stored publication integrity; never estimate or rewrite its scores. */
function publishedAttemptIsConsistent(attempt: PublishedAttempt, tryout: { sections: CanonicalSection[] }, release: { id: string; releaseNumber: number; contentDigest: string; payload: Prisma.JsonValue } | null) {
  const finite = (value: Prisma.Decimal | null) => value !== null && Number.isFinite(Number(value));
  const normalized = (value: Prisma.Decimal | null) => finite(value) && Number(value) >= 0 && Number(value) <= 100;
  if (!release || attempt.releaseState !== AssessmentResultReleaseState.released || !attempt.releaseAt
    || attempt.scoringState !== AssessmentScoringState.scored || !attempt.scoringVersion || !normalized(attempt.score)
    || (attempt.normalizedScore !== null && (!normalized(attempt.normalizedScore) || Number(attempt.normalizedScore) !== Number(attempt.score)))
    || (attempt.scaledScore !== null && (!normalized(attempt.scaledScore) || Number(attempt.scaledScore) !== Number(attempt.score)))
    || !terminalAttemptStateIsCalculable(attempt) || !hasCanonicalSevenRunSet({ tryoutId: attempt.tryoutId, tryout, runs: attempt.runs })
    || !hasCanonicalSevenBreakdownSet({ tryout, breakdowns: attempt.scoreBreakdowns })
    || attempt.assessmentReleaseId !== release.id || attempt.assessmentReleaseNumber !== release.releaseNumber || attempt.assessmentReleaseDigest !== release.contentDigest) return false;
  try {
    return attempt.runs.every((run) => {
      if (run.scoringState !== AssessmentScoringState.scored || !run.scoringVersion || !run.calculationReleaseable
        || (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired)
        || !normalized(run.normalizedScore) || !normalized(run.scaledScore) || !finite(run.rawScore) || !explanationsComplete(run)
        || (run.calculationResult && typeof run.calculationResult === "object" && "validationFailure" in run.calculationResult)) return false;
      assertFrozenRunRelease(run, run.section, release);
      const breakdown = attempt.scoreBreakdowns.find((row) => row.subtestId === run.section.subtestId);
      return Boolean(breakdown && normalized(breakdown.normalizedScore) && normalized(breakdown.scaledScore) && finite(breakdown.rawScore)
        && Number(breakdown.normalizedScore) === Number(run.normalizedScore) && Number(breakdown.rawScore) === Number(run.rawScore) && Number(breakdown.scaledScore) === Number(run.scaledScore));
    });
  } catch { return false; }
}

/** Participant calculations expose only established numeric result fields. */
function participantRunCalculation(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = ["ability", "answeredCount", "correctCount", "maxScore", "normalizedScore", "score", "unansweredCount", "wrongCount"];
  return Object.fromEntries(Object.entries(value).filter(([key, value]) => fields.includes(key) && typeof value === "number" && Number.isFinite(value)));
}

async function upsertTryoutBreakdown(
  tx: Prisma.TransactionClient,
  attemptId: string,
  run: {
    correctCount: number | null;
    normalizedScore: Prisma.Decimal | null;
    rawScore: Prisma.Decimal | null;
    scaledScore: Prisma.Decimal | null;
    scoringVersion: string | null;
    section: { subtestId: string };
    unansweredCount: number | null;
    wrongCount: number | null;
  },
) {
  const data = {
    correctCount: run.correctCount ?? 0,
    normalizedScore: run.normalizedScore,
    rawScore: run.rawScore,
    scaledScore: run.scaledScore ?? run.normalizedScore,
    scoringProvenance: AssessmentScoringProvenance.runtime,
    scoringVersion: run.scoringVersion ?? TRYOUT_SCORE_AGGREGATION_VERSION,
    unansweredCount: run.unansweredCount ?? 0,
    wrongCount: run.wrongCount ?? 0,
  };
  const existing = await tx.tryoutScoreBreakdown.findFirst({ where: { attemptId, subtestId: run.section.subtestId, topicId: null }, select: { id: true } });
  if (existing) return tx.tryoutScoreBreakdown.update({ where: { id: existing.id }, data });
  return tx.tryoutScoreBreakdown.create({ data: { ...data, attemptId, subtestId: run.section.subtestId, topicId: null } });
}

type MaterializeTryoutAttemptResult = { aggregationVersion: string; attemptId: string; finalScore?: number; runScores?: number[]; state?: "existing" | "review_required"; reason?: string };

async function materializeTryoutAttemptInTransaction(tx: Prisma.TransactionClient, attemptId: string, actorId: string, reason: string, strict = true): Promise<MaterializeTryoutAttemptResult> {
  const attempt = await tx.tryoutAttempt.findUnique({
    where: { id: attemptId },
    include: {
      deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, payload: true, releaseNumber: true } }, availableUntil: true, rankingRule: true, releaseState: true, releasedAt: true, resultReleasePolicy: true, scheduledReleaseAt: true, tryout: { select: { defaultResultReleasePolicy: true } } } },
      runs: { include: { answers: { select: { selectedOptionId: true, selectedOptionIds: true, tryoutItemId: true } }, section: { select: { durationSeconds: true, id: true, sequenceNo: true, subtestId: true, testType: true, title: true, tryoutId: true } } }, orderBy: { sequenceNo: "asc" } },
      scoreBreakdowns: { select: { normalizedScore: true, rawScore: true, scaledScore: true, scoringProvenance: true, scoringVersion: true, subtestId: true } },
      tryout: { select: { createdByUserId: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } },
    },
  });
  // Publication is an immutable receipt, including older scoring versions.
  // Check it before validation/review paths can hide or rewrite stored results.
  if (attempt?.releaseState === AssessmentResultReleaseState.released) {
    if (!publishedAttemptIsConsistent(attempt, attempt.tryout, attempt.deliverySession.assessmentRelease)) {
      if (strict) throw new TryoutResultValidationError(PUBLISHED_RESULT_REVIEW_MESSAGE);
      return { aggregationVersion: attempt.scoringVersion ?? TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, state: "review_required", reason: PUBLISHED_RESULT_REVIEW_MESSAGE };
    }
    return { aggregationVersion: attempt.scoringVersion ?? TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, ...(attempt.score === null ? {} : { finalScore: Number(attempt.score) }), state: "existing" };
  }
  const review = async (message: string, cause?: unknown): Promise<MaterializeTryoutAttemptResult> => {
    if (strict) throw new TryoutResultValidationError(message, { cause });
    if (attempt) await tx.tryoutAttempt.update({ where: { id: attempt.id }, data: { releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: message, scoringState: AssessmentScoringState.review_required } });
    return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, state: "review_required" };
  };
  if (!attempt) return review("Attempt Tryout tidak ditemukan.");
  if (!attempt.assessmentReleaseId || !attempt.assessmentReleaseNumber || !attempt.assessmentReleaseDigest || !attempt.deliverySession.assessmentRelease) return review("Attempt Tryout belum memiliki AssessmentRelease yang valid.");
  assertResultReleaseBinding(
    { assessmentReleaseDigest: attempt.deliverySession.assessmentRelease.contentDigest, assessmentReleaseId: attempt.deliverySession.assessmentRelease.id, assessmentReleaseNumber: attempt.deliverySession.assessmentRelease.releaseNumber },
    { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
  );
  if (attempt.runs.some((run) => !run.assessmentReleaseId || !run.assessmentReleaseNumber || !run.assessmentReleaseDigest)) return review("Test run Tryout belum memiliki metadata AssessmentRelease yang lengkap.");
  if (attempt.runs.some((run) => run.assessmentReleaseId !== attempt.assessmentReleaseId || run.assessmentReleaseNumber !== attempt.assessmentReleaseNumber || run.assessmentReleaseDigest !== attempt.assessmentReleaseDigest)) return review("Test run Tryout tidak cocok dengan AssessmentRelease attempt.");
  if (!terminalAttemptStateIsCalculable(attempt)) return review("Attempt belum berada pada state terminal yang dapat dihitung, atau telah abandoned/void.");
  if (!hasCanonicalSevenRunSet({ tryoutId: attempt.tryoutId, tryout: attempt.tryout, runs: attempt.runs })) return review("Attempt tidak memiliki tepat tujuh Test kanonis untuk Tryout ini.");
  try {
    for (const run of attempt.runs) {
      assertFrozenRunRelease(run, run.section, attempt.deliverySession.assessmentRelease);
      calculateFrozenTryoutRun({ contentSnapshot: run.contentSnapshot, answers: run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId, selectedOptionIds: answer.selectedOptionIds })), expired: run.status === TryoutAttemptTestRunStatus.expired });
    }
  } catch (error) {
    return review(FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE, error);
  }
  if (attempt.runs.some((run) => (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired) || run.scoringState !== AssessmentScoringState.scored || !run.calculationReleaseable || run.normalizedScore === null)) return review("Semua tujuh Test harus tersegel dan termaterialisasi sebelum hasil dapat dihitung.");
  const scores = attempt.runs.map((run) => Number(run.normalizedScore));
  const finalScore = aggregateTryoutScores(scores);
  const hasTypedBreakdowns = hasCanonicalSevenBreakdownSet({ tryout: attempt.tryout, breakdowns: attempt.scoreBreakdowns });
  if (attempt.scoringState === AssessmentScoringState.scored && attempt.score !== null && attempt.scoringVersion === TRYOUT_SCORE_AGGREGATION_VERSION && hasTypedBreakdowns) {
    return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, finalScore: Number(attempt.score), runScores: scores, state: "existing" };
  }
  for (const run of attempt.runs) {
    const frozen = frozenRunFields(run, isReleaseBoundRun(run));
    // react-doctor-disable-next-line async-await-in-loop -- update the seven ordered run breakdowns inside the result transaction.
    await upsertTryoutBreakdown(tx, attemptId, { ...run, section: { subtestId: frozen.subtestId ?? run.section.subtestId } });
  }
  const correctCount = attempt.runs.reduce((sum, run) => sum + (run.correctCount ?? 0), 0);
  const wrongCount = attempt.runs.reduce((sum, run) => sum + (run.wrongCount ?? 0), 0);
  const unansweredCount = attempt.runs.reduce((sum, run) => sum + (run.unansweredCount ?? 0), 0);
  const rawScore = attempt.runs.reduce((sum, run) => sum + Number(run.rawScore ?? 0), 0);
  const attemptState = attempt.attemptState === AssessmentAttemptState.expired
    ? AssessmentAttemptState.expired
    : attempt.attemptState === AssessmentAttemptState.auto_submitted
      ? AssessmentAttemptState.auto_submitted
      : AssessmentAttemptState.submitted;
  const status = attempt.status === AttemptStatus.expired
    ? AttemptStatus.expired
    : attempt.status === AttemptStatus.auto_submitted
      ? AttemptStatus.auto_submitted
      : attempt.status === AttemptStatus.scored
        ? AttemptStatus.scored
        : AttemptStatus.submitted;
  await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { attemptState, correctCount, normalizedScore: finalScore, rawScore, releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scaledScore: finalScore, score: finalScore, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: null, scoringState: AssessmentScoringState.scored, scoringVersion: TRYOUT_SCORE_AGGREGATION_VERSION, status, unansweredCount, wrongCount } });
  await tx.tryoutDeliveryAudit.create({ data: { action: "result.calculated", actorUserId: actorId, admissionId: attempt.admissionId, after: json({ attemptId, aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, finalScore, runScores: scores }), reason: reason.trim(), tryoutId: attempt.tryoutId, deliverySessionId: attempt.deliverySessionId } });
  return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, finalScore, runScores: scores };
}

type TryoutResultScope = {
  admissionIds: string[];
  assignmentIds: string[];
  attemptIds: string[];
  runIds: string[];
  sessionId: string;
  tryoutId: string;
};

/**
 * Resolve the Tryout identity before claiming any row. The session/attempt
 * graph is only read during discovery; all claims then follow the shared
 * Tryout -> session -> admission/assignment/attempt/run order.
 */
async function lockTryoutResultScope(
  tx: Prisma.TransactionClient,
  identity: { id: string; kind: "attempt" | "session" },
): Promise<TryoutResultScope> {
  const resolved = await acquireTryoutIdentityMutex(tx, identity);
  if (!resolved?.sessionId) throw new TryoutResultValidationError("Hasil Tryout tidak ditemukan.");

  const attemptRows = identity.kind === "session"
    ? await tx.tryoutAttempt.findMany({
      where: { deliverySessionId: resolved.sessionId },
      select: { admissionId: true, id: true, studentId: true },
      orderBy: { id: "asc" },
    })
    : resolved.attemptId
      ? await tx.tryoutAttempt.findMany({
        where: { id: resolved.attemptId },
        select: { admissionId: true, id: true, studentId: true },
      })
      : [];

  await lockTryoutStudents(tx, attemptRows.map((row) => row.studentId));
  await lockTryoutAggregate(tx, resolved.tryoutId);
  await assertTryoutIdentityStable(tx, identity, resolved.tryoutId);
  await lockTryoutSessions(tx, [resolved.sessionId]);

  const admissionIds = [...new Set(attemptRows.map((row) => row.admissionId))].sort();
  const assignmentRows = admissionIds.length
    ? await tx.tryoutDeliveryAssignment.findMany({
      where: { admissionId: { in: admissionIds }, deliverySessionId: resolved.sessionId },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    : [];
  const runRows = attemptRows.length
    ? await tx.tryoutAttemptTestRun.findMany({
      where: { attemptId: { in: attemptRows.map((row) => row.id) } },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    : [];
  const assignmentIds = assignmentRows.map((row) => row.id);
  const attemptIds = attemptRows.map((row) => row.id);
  const runIds = runRows.map((row) => row.id);
  await lockTryoutAdmissions(tx, admissionIds);
  await lockTryoutAssignments(tx, assignmentIds);
  await lockTryoutAttempts(tx, attemptIds);
  await lockTryoutRuns(tx, runIds);
  return { admissionIds, assignmentIds, attemptIds, runIds, sessionId: resolved.sessionId, tryoutId: resolved.tryoutId };
}

const recoveryInclude = {
  deliverySession: { select: { assessmentRelease: { select: { contentDigest: true, id: true, payload: true, releaseNumber: true } }, releaseState: true } },
  runs: { include: { answers: true, section: { select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true } } }, orderBy: { sequenceNo: "asc" } },
  scoreBreakdowns: true,
  tryout: { select: { createdByUserId: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } },
} satisfies Prisma.TryoutAttemptInclude;
type RecoveryAttempt = Prisma.TryoutAttemptGetPayload<{ include: typeof recoveryInclude }>;
const recoveryUnavailable = "Pengerjaan Tryout tidak tersedia untuk perhitungan ini.";

function storedScoreMatches(value: Prisma.Decimal | null, expected: number, decimalPlaces: number) {
  return value !== null && Number.isFinite(Number(value)) && value.equals(new Prisma.Decimal(expected).toDecimalPlaces(decimalPlaces));
}

/** Reusing a scored run requires proof that its stored receipt agrees with frozen computation. */
function validatedRecoveryRun(run: RecoveryAttempt["runs"][number], release: NonNullable<RecoveryAttempt["deliverySession"]["assessmentRelease"]>) {
  if (run.status !== "expired" && run.status !== "sealed") throw new Error("Unfinished run");
  assertFrozenRunRelease(run, run.section, release);
  const calculation = calculateFrozenTryoutRun({ contentSnapshot: run.contentSnapshot, answers: run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId, selectedOptionIds: answer.selectedOptionIds })), expired: run.status === "expired" });
  if (run.scoringState === "scored") {
    const result = run.calculationResult;
    if (!run.calculationReleaseable || run.scoringReviewReason !== null || run.scoringVersion !== calculation.scoringVersion || run.calculationVersion !== calculation.scoringVersion
      || !storedScoreMatches(run.normalizedScore, calculation.normalizedScore, 2) || !storedScoreMatches(run.scaledScore, calculation.normalizedScore, 2)
      || !storedScoreMatches(run.rawScore, calculation.rawScore, 4) || !storedScoreMatches(run.maxScore, calculation.maxScore, 4)
      || run.correctCount !== calculation.correctCount || run.wrongCount !== calculation.wrongCount || run.unansweredCount !== calculation.unansweredCount
      || !result || typeof result !== "object" || Array.isArray(result) || Object.hasOwn(result, "validationFailure")
      || Object.entries(calculation.calculationResult).some(([key, value]) => result[key] !== value)) throw new Error("Stored run scoring is inconsistent with frozen computation");
  }
  return calculation;
}

function validateRecoveryRuns(attempt: RecoveryAttempt) {
  const release = attempt.deliverySession.assessmentRelease;
  if (!release || attempt.assessmentReleaseId !== release.id || attempt.assessmentReleaseNumber !== release.releaseNumber || attempt.assessmentReleaseDigest !== release.contentDigest
    || !hasCanonicalSevenRunSet({ tryoutId: attempt.tryoutId, tryout: attempt.tryout, runs: attempt.runs })) throw new TryoutResultValidationError("Tujuh tes dan konten tersimpan perlu diperiksa sebelum skor dapat dihitung.");
  const calculations = attempt.runs.map((run) => {
    try {
      return validatedRecoveryRun(run, release);
    } catch (cause) { throw new TryoutResultValidationError(FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE, { cause }); }
  });
  if (attempt.scoringState === "scored") {
    const expected = aggregateTryoutScores(calculations.map((calculation) => calculation.normalizedScore));
    // Materialization sums persisted four-place run raw scores, then writes
    // each same raw value into the breakdown's two-place storage column.
    const storedRawScores = calculations.map((calculation) => new Prisma.Decimal(calculation.rawScore).toDecimalPlaces(4));
    const expectedRawScore = storedRawScores.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)).toNumber();
    if (!storedScoreMatches(attempt.score, expected, 2) || !storedScoreMatches(attempt.normalizedScore, expected, 2) || !storedScoreMatches(attempt.scaledScore, expected, 2)
      || !storedScoreMatches(attempt.rawScore, expectedRawScore, 4)
      || attempt.correctCount !== calculations.reduce((sum, calculation) => sum + calculation.correctCount, 0)
      || attempt.wrongCount !== calculations.reduce((sum, calculation) => sum + calculation.wrongCount, 0)
      || attempt.unansweredCount !== calculations.reduce((sum, calculation) => sum + calculation.unansweredCount, 0)
      || !hasCanonicalSevenBreakdownSet({ tryout: attempt.tryout, breakdowns: attempt.scoreBreakdowns })
      || attempt.runs.some((run, index) => {
        const row = attempt.scoreBreakdowns.find((row) => row.subtestId === run.section.subtestId);
        const calculation = calculations[index];
        return !row || !storedScoreMatches(row.normalizedScore, calculation.normalizedScore, 2) || !storedScoreMatches(row.scaledScore, calculation.normalizedScore, 2)
          || !storedScoreMatches(row.rawScore, storedRawScores[index].toNumber(), 2) || row.correctCount !== calculation.correctCount || row.wrongCount !== calculation.wrongCount || row.unansweredCount !== calculation.unansweredCount;
      })) throw new TryoutResultValidationError("Skor tersimpan perlu diperiksa sebelum perhitungan dapat dilanjutkan.");
  }
  return calculations;
}

async function calculationReceipt(tx: Prisma.TransactionClient, attempt: RecoveryAttempt): Promise<TryoutCalculationReceipt | null> {
  const receipt = await tx.tryoutDeliveryAudit.findFirst({ where: { action: "result.calculated", deliverySessionId: attempt.deliverySessionId, admissionId: attempt.admissionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, reason: true } });
  return receipt ? { id: receipt.id, calculatedAt: receipt.createdAt.toISOString(), reason: receipt.reason } : null;
}

/** All seven proposals validate before scoring writes. Keep lifecycle/acknowledged history intact. */
async function recoverExpiredRuns(tx: Prisma.TransactionClient, attempt: RecoveryAttempt) {
  if (attempt.attemptState !== "expired" || attempt.status !== "expired") return;
  const calculations = validateRecoveryRuns(attempt);
  for (const [index, run] of attempt.runs.entries()) {
    if (run.scoringState === "scored" && run.calculationReleaseable && run.normalizedScore !== null && run.rawScore !== null && run.scaledScore !== null && run.scoringVersion) continue;
    if (run.status !== "expired") throw new TryoutResultValidationError("Skor tes yang sudah selesai perlu diperiksa terlebih dahulu.");
    const calculation = calculations[index];
    // react-doctor-disable-next-line async-await-in-loop -- persist seven prevalidated proposals atomically under canonical result locks.
    await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: {
      calculationInput: json(calculation.calculationInput), calculationResult: json(calculation.calculationResult), calculationVersion: calculation.scoringVersion, calculationReleaseable: true,
      correctCount: calculation.correctCount, wrongCount: calculation.wrongCount, unansweredCount: calculation.unansweredCount, maxScore: calculation.maxScore,
      normalizedScore: calculation.normalizedScore, rawScore: calculation.rawScore, scaledScore: calculation.normalizedScore,
      scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: null, scoringState: AssessmentScoringState.scored, scoringVersion: calculation.scoringVersion,
    } });
    const scoredAnswers = new Map(calculation.answers.map((answer) => [answer.itemId, answer]));
    for (const answer of run.answers) {
      const scored = scoredAnswers.get(answer.tryoutItemId)!;
      // react-doctor-disable-next-line async-await-in-loop -- only derived score metadata changes; acknowledged selections/times remain immutable.
      await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: scored.isCorrect, pointsAwarded: scored.pointsAwarded, scoringVersion: calculation.scoringVersion } });
    }
  }
}

async function calculateTryoutAttempt(attemptId: string, actorId: string, reason: string, allowCrossOwner = false, expectedScope?: TryoutResultRecoveryScope) {
  if (!reason.trim()) throw new TryoutResultValidationError("Alasan audit perhitungan wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutResultScope(tx, { id: attemptId, kind: "attempt" });
    const target = await tx.tryoutAttempt.findUnique({ where: { id: attemptId }, include: recoveryInclude });
    if (!target || (target.tryout.createdByUserId !== actorId && !allowCrossOwner)
      || (expectedScope && (expectedScope.attemptId !== attemptId || expectedScope.tryoutId !== target.tryoutId || expectedScope.sessionId !== target.deliverySessionId))) throw new TryoutResultValidationError(recoveryUnavailable);
    if (target.deliverySession.releaseState === "released" && target.releaseState !== "released") throw new TryoutResultValidationError(PUBLISHED_RESULT_REVIEW_MESSAGE);
    if (target.releaseState !== "released") await recoverExpiredRuns(tx, target);
    const result = await materializeTryoutAttemptInTransaction(tx, attemptId, actorId, reason, true);
    return { ...result, receipt: await calculationReceipt(tx, target) };
  }, { timeout: TRYOUT_RELEASE_SYNC_TRANSACTION_TIMEOUT_MS });
}

/** Read-only consistent snapshot: no synchronization, heartbeat, row/advisory locks or mutation. */
async function inspectTryoutCalculation(scope: TryoutResultRecoveryScope, actorId: string, allowCrossOwner = false): Promise<TryoutResultRecoverySnapshot | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const target = await tx.tryoutAttempt.findFirst({ where: { id: scope.attemptId, tryoutId: scope.tryoutId, deliverySessionId: scope.sessionId, ...(!allowCrossOwner ? { tryout: { createdByUserId: actorId } } : {}) }, include: recoveryInclude });
    if (!target) return null;
    const receipt = await calculationReceipt(tx, target);
    const base = { scope, receipt, finalScore: null, sections: [] };
    if (target.releaseState === "released" || target.deliverySession.releaseState === "released") {
      const valid = publishedAttemptIsConsistent(target, target.tryout, target.deliverySession.assessmentRelease);
      return { ...base, state: valid ? "released" : "blocked", message: valid ? "Hasil sudah dirilis dan tidak dapat dihitung ulang." : PUBLISHED_RESULT_REVIEW_MESSAGE };
    }
    const sections = target.runs.map((run) => {
      let ready = false;
      try {
        if (!target.deliverySession.assessmentRelease || !["sealed", "expired"].includes(run.status)) throw new Error("Run unavailable");
        validatedRecoveryRun(run, target.deliverySession.assessmentRelease);
        ready = true;
      } catch { /* Safe owner blocker; no frozen keys or raw diagnostics. */ }
      return { sequenceNo: run.sequenceNo, ready, message: ready ? null : "Konten atau jawaban tersimpan pada tes ini perlu diperiksa." };
    });
    try {
      if (!terminalAttemptStateIsCalculable(target)) throw new Error("Attempt unfinished");
      validateRecoveryRuns(target);
    } catch { return { ...base, sections, state: "blocked", message: "Perhitungan belum dapat dilakukan. Periksa tujuh tes dan konten tersimpan pada pengerjaan ini." }; }
    const calculated = target.scoringState === "scored" && target.score !== null && Number.isFinite(Number(target.score)) && hasCanonicalSevenBreakdownSet({ tryout: target.tryout, breakdowns: target.scoreBreakdowns })
      && target.runs.every((run) => run.scoringState === "scored" && run.calculationReleaseable && run.normalizedScore !== null && run.rawScore !== null && run.scaledScore !== null);
    return { ...base, sections, state: calculated ? "calculated" : "ready", finalScore: calculated ? Number(target.score) : null, message: calculated ? "Skor sudah tersimpan. Hasil peserta tetap mengikuti aturan rilis sesi." : "Skor dapat dihitung dari konten dan jawaban tersimpan. Alasan tindakan wajib diisi." };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: TRYOUT_RELEASE_SYNC_TRANSACTION_TIMEOUT_MS });
}

async function sessionReleaseReadiness(tx: Prisma.TransactionClient, deliverySessionId: string) {
  const session = await tx.tryoutDeliverySession.findUnique({ where: { id: deliverySessionId }, include: { assessmentRelease: { select: { contentDigest: true, id: true, releaseNumber: true } }, tryout: { select: { defaultResultReleasePolicy: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } }, attempts: { include: { runs: { include: { section: { select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true } } } }, scoreBreakdowns: { select: { normalizedScore: true, rawScore: true, scaledScore: true, scoringProvenance: true, scoringVersion: true, subtestId: true } } } } } });
  if (!session) throw new TryoutResultValidationError("Sesi delivery Tryout tidak ditemukan.");
  if (!session.assessmentRelease) throw new TryoutResultValidationError("Sesi delivery Tryout belum memiliki AssessmentRelease yang valid.");
  const policy = effectivePolicy(session);
  if (!session.attempts.length) throw new TryoutResultValidationError("Belum ada attempt pada sesi ini untuk dirilis.");
  for (const attempt of session.attempts) {
    for (const run of attempt.runs) {
      frozenRunFields(run, true);
    }
    assertResultReleaseBinding(
      { assessmentReleaseDigest: session.assessmentRelease.contentDigest, assessmentReleaseId: session.assessmentRelease.id, assessmentReleaseNumber: session.assessmentRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
      "Rilis diblokir: attempt tidak cocok dengan AssessmentRelease sesi.",
    );
    if (attempt.runs.some((run) => run.assessmentReleaseId !== session.assessmentRelease!.id || run.assessmentReleaseNumber !== session.assessmentRelease!.releaseNumber || run.assessmentReleaseDigest !== session.assessmentRelease!.contentDigest)) throw new TryoutResultValidationError("Rilis diblokir: Test run tidak cocok dengan AssessmentRelease sesi.");
    if (attempt.score === null || attempt.scoringState !== AssessmentScoringState.scored || !terminalAttemptStateIsCalculable(attempt) || !hasCanonicalSevenBreakdownSet({ tryout: session.tryout, breakdowns: attempt.scoreBreakdowns }) || !hasCanonicalSevenRunSet({ tryoutId: session.tryoutId, tryout: session.tryout, runs: attempt.runs }) || attempt.runs.some((run) => run.scoringState !== AssessmentScoringState.scored || run.normalizedScore === null || !run.calculationReleaseable || (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired) || !explanationsComplete(run))) {
      throw new TryoutResultValidationError("Rilis diblokir: seluruh attempt harus selesai, terhitung valid, dan memiliki penjelasan untuk semua item yang dikirim.");
    }
  }
  return { policy, session };
}

async function releaseTryoutSessionResults(deliverySessionId: string, actorId: string, reason: string, allowCrossOwner = false) {
  if (!reason.trim()) throw new TryoutResultValidationError("Alasan audit rilis wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const scope = await lockTryoutResultScope(tx, { id: deliverySessionId, kind: "session" });
    const target = await tx.tryoutDeliverySession.findUnique({ where: { id: deliverySessionId }, select: { releasedAt: true, releaseState: true, tryout: { select: { createdByUserId: true } } } });
    if (!target) throw new TryoutResultValidationError("Sesi delivery Tryout tidak ditemukan.");
    if (target.tryout.createdByUserId !== actorId && !allowCrossOwner) throw new TryoutResultValidationError("Anda tidak dapat merilis hasil Tryout milik Kapten lain.");
    const { policy } = await sessionReleaseReadiness(tx, deliverySessionId);
    if (policy !== "manual") throw new TryoutResultValidationError("Kontrol rilis master hanya digunakan untuk sesi dengan kebijakan manual.");
    if (target.releaseState === AssessmentResultReleaseState.released) return { deliverySessionId, releasedAt: target.releasedAt, state: "existing" as const };
    const releasedAt = new Date();
    await tx.tryoutDeliverySession.update({ where: { id: deliverySessionId }, data: { releaseReason: reason.trim(), releaseState: AssessmentResultReleaseState.released, releasedAt, releasedByUserId: actorId } });
    await tx.tryoutAttempt.updateMany({ where: { id: { in: scope.attemptIds } }, data: { releaseAt: releasedAt, releaseState: AssessmentResultReleaseState.released } });
    await tx.tryoutDeliveryAudit.create({ data: { action: "result.bundle_released", actorUserId: actorId, after: json({ bundle: ["score", "review", "explanations", "ranking", "report"], policy }), deliverySessionId, reason: reason.trim(), tryoutId: scope.tryoutId } });
    return { deliverySessionId, releasedAt, state: "released" as const };
  });
}

function rankAttempts(attempts: Array<{ id: string; releaseState?: AssessmentResultReleaseState; score: Prisma.Decimal | null; scoringState?: AssessmentScoringState }>, attemptId: string) {
  const scored = attempts.filter((attempt) => attempt.score !== null && (attempt.scoringState === undefined || attempt.scoringState === AssessmentScoringState.scored) && (attempt.releaseState === undefined || attempt.releaseState === AssessmentResultReleaseState.released)).sort((left, right) => Number(right.score) - Number(left.score) || left.id.localeCompare(right.id));
  if (scored.length < 2) return { rank: null, state: "unavailable" as const, total: scored.length };
  let rank = 0;
  let previous: number | null = null;
  for (let index = 0; index < scored.length; index += 1) {
    const score = Number(scored[index].score);
    if (previous === null || score !== previous) rank = index + 1;
    if (scored[index].id === attemptId) return { rank, state: "available" as const, total: scored.length };
    previous = score;
  }
  return { rank: null, state: "unavailable" as const, total: scored.length };
}

async function synchronizeTryoutSessionReleaseStateInTransaction(tx: Prisma.TransactionClient, deliverySessionId: string, now: Date) {
    const session = await tx.tryoutDeliverySession.findUnique({
      where: { id: deliverySessionId },
      select: {
        availableUntil: true,
        id: true,
        releaseReason: true,
        releaseState: true,
        releasedAt: true,
        resultReleasePolicy: true,
        scheduledReleaseAt: true,
        tryoutId: true,
        assessmentRelease: {
          select: { contentDigest: true, id: true, payload: true, releaseNumber: true },
        },
        tryout: {
          select: {
            id: true,
            defaultResultReleasePolicy: true,
            sections: {
              select: { id: true, sequenceNo: true, subtestId: true },
              orderBy: { sequenceNo: "asc" },
            },
          },
        },
        attempts: {
          select: {
            assessmentReleaseDigest: true,
            assessmentReleaseId: true,
            assessmentReleaseNumber: true,
            attemptState: true,
            id: true,
            releaseAt: true,
            releaseState: true,
            score: true,
            normalizedScore: true,
            scaledScore: true,
            scoringState: true,
            scoringVersion: true,
            status: true,
            tryoutId: true,
            runs: {
              select: {
                assessmentReleaseDigest: true,
                assessmentReleaseId: true,
                assessmentReleaseNumber: true,
                calculationReleaseable: true,
                calculationResult: true,
                contentSnapshot: true,
                normalizedScore: true,
                rawScore: true,
                scaledScore: true,
                scoringState: true,
                scoringVersion: true,
                sequenceNo: true,
                status: true,
                tryoutSectionId: true,
                section: {
                  select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true },
                },
              },
            },
            scoreBreakdowns: {
              select: {
                normalizedScore: true,
                rawScore: true,
                scaledScore: true,
                scoringProvenance: true,
                scoringVersion: true,
                subtestId: true,
              },
            },
          },
        },
      },
    });
    if (!session) throw new TryoutResultValidationError("Sesi delivery Tryout tidak ditemukan.");
    // A refresh must never expand or rewrite an already published bundle.
    if (session.releaseState === AssessmentResultReleaseState.released) {
      const ready = session.releasedAt !== null && session.attempts.length > 0
        && session.attempts.every((attempt) => publishedAttemptIsConsistent(attempt, session.tryout, session.assessmentRelease));
      return { deliverySessionId: session.id, releaseAt: session.releasedAt, releaseState: session.releaseState, ready, ...(ready ? {} : { reason: PUBLISHED_RESULT_REVIEW_MESSAGE }) };
    }
    if (!session.assessmentRelease) throw new TryoutResultValidationError("Sesi delivery Tryout belum memiliki AssessmentRelease yang valid.");
    const policy = effectivePolicy(session);
    const releaseableAttemptIds = session.attempts.flatMap((attempt) => {
      attempt.runs.forEach((run) => frozenRunFields(run, true));
      assertResultReleaseBinding(
        { assessmentReleaseDigest: session.assessmentRelease!.contentDigest, assessmentReleaseId: session.assessmentRelease!.id, assessmentReleaseNumber: session.assessmentRelease!.releaseNumber },
        { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
        "Rilis otomatis diblokir: attempt tidak cocok dengan AssessmentRelease sesi.",
      );
      const isReleaseable = attempt.score !== null
        && attempt.scoringState === AssessmentScoringState.scored
        && terminalAttemptStateIsCalculable(attempt)
        && hasCanonicalSevenBreakdownSet({ tryout: session.tryout, breakdowns: attempt.scoreBreakdowns })
        && hasCanonicalSevenRunSet({ tryoutId: session.tryoutId, tryout: session.tryout, runs: attempt.runs })
        && attempt.runs.every((run) => run.assessmentReleaseId === session.assessmentRelease!.id && run.assessmentReleaseNumber === session.assessmentRelease!.releaseNumber && run.assessmentReleaseDigest === session.assessmentRelease!.contentDigest && run.scoringState === AssessmentScoringState.scored && run.normalizedScore !== null && run.calculationReleaseable && (run.status === TryoutAttemptTestRunStatus.sealed || run.status === TryoutAttemptTestRunStatus.expired) && explanationsComplete(run));
      return isReleaseable ? [attempt.id] : [];
    });
    const ready = session.attempts.length > 0
      && releaseableAttemptIds.length === session.attempts.length;
    if (policy === "scheduled" && !session.scheduledReleaseAt) throw new TryoutResultValidationError("Jadwal rilis hasil sesi belum lengkap.");
    const thresholdReached = policy === "immediate"
      || (policy === "automatic_at_end" && session.availableUntil <= now)
      || (policy === "scheduled" && session.scheduledReleaseAt !== null && session.scheduledReleaseAt <= now);
    let releaseState: AssessmentResultReleaseState = session.releaseState;
    let releaseAt = session.releasedAt;
    if (ready) {
      if (thresholdReached) {
        releaseState = AssessmentResultReleaseState.released;
        releaseAt = session.releasedAt ?? (policy === "scheduled" ? session.scheduledReleaseAt : policy === "automatic_at_end" ? session.availableUntil : now);
      } else if (!thresholdReached && policy !== "manual") {
        releaseState = AssessmentResultReleaseState.scheduled;
        releaseAt = policy === "scheduled" ? session.scheduledReleaseAt : policy === "automatic_at_end" ? session.availableUntil : null;
      }
    }
    if (releaseState === AssessmentResultReleaseState.released && releaseAt === null) releaseAt = now;
    if (releaseState !== session.releaseState || releaseAt?.getTime() !== session.releasedAt?.getTime()) {
      await tx.tryoutDeliverySession.update({ where: { id: session.id }, data: { releaseState, releasedAt: releaseAt ?? undefined, releaseReason: session.releaseReason ?? (releaseState === AssessmentResultReleaseState.released ? "Rilis otomatis setelah seluruh bundle valid." : undefined) } });
    }
    if (releaseState === AssessmentResultReleaseState.released || releaseState === AssessmentResultReleaseState.scheduled) {
      const releaseableIds = new Set(releaseableAttemptIds);
      const attemptIdsNeedingUpdate = session.attempts
        .filter((attempt) => attempt.releaseState !== AssessmentResultReleaseState.released)
        .filter((attempt) => releaseableIds.has(attempt.id))
        .filter((attempt) => attempt.releaseState !== releaseState
          || (attempt.releaseAt?.getTime() ?? null) !== (releaseAt?.getTime() ?? null))
        .map((attempt) => attempt.id);
      if (attemptIdsNeedingUpdate.length > 0) {
        await tx.tryoutAttempt.updateMany({ where: { id: { in: attemptIdsNeedingUpdate } }, data: { releaseAt, releaseState } });
      }
    }
    return { deliverySessionId: session.id, releaseAt, releaseState, ready };
}

async function synchronizeTryoutSessionReleaseState(deliverySessionId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutResultScope(tx, { id: deliverySessionId, kind: "session" });
    return synchronizeTryoutSessionReleaseStateInTransaction(tx, deliverySessionId, now);
  }, { timeout: TRYOUT_RELEASE_SYNC_TRANSACTION_TIMEOUT_MS });
}

async function synchronizeAttemptReleaseState(attemptId: string, studentId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const scope = await lockTryoutResultScope(tx, { id: attemptId, kind: "attempt" });
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { deliverySessionId: true } });
    if (!attempt) return null;
    return synchronizeTryoutSessionReleaseStateInTransaction(tx, scope.sessionId, now);
  });
}

async function participantTryoutResult(attemptId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
  await prepareTryoutTransaction(tx);
  const scope = await lockTryoutResultScope(tx, { id: attemptId, kind: "attempt" });
  const releaseProbe = await tx.tryoutAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      assessmentReleaseDigest: true,
      assessmentReleaseId: true,
      assessmentReleaseNumber: true,
      deliverySession: { select: { assessmentReleaseId: true } },
    },
  });
  if (!releaseProbe) throw new TryoutResultValidationError("Hasil Tryout tidak ditemukan.");
  const legacyRead = !releaseProbe.assessmentReleaseId
    && releaseProbe.assessmentReleaseNumber === null
    && !releaseProbe.assessmentReleaseDigest
    && !releaseProbe.deliverySession.assessmentReleaseId;
  if (!legacyRead) {
    const preflightRuns = await tx.tryoutAttemptTestRun.findMany({
      where: { attemptId },
      include: { section: { select: { durationSeconds: true, testType: true, title: true } } },
    });
    preflightRuns.forEach((run) => frozenRunFields(run, true));
  }
  if (!legacyRead) await synchronizeTryoutSessionReleaseStateInTransaction(tx, scope.sessionId, new Date());
  const attempt = await tx.tryoutAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      assessmentRelease: { select: { contentDigest: true, id: true, payload: true, publishedAt: true, releaseNumber: true } },
      deliverySession: {
        include: {
          assessmentRelease: { select: { contentDigest: true, id: true, payload: true, publishedAt: true, releaseNumber: true } },
          tryout: { select: { defaultResultReleasePolicy: true } },
          attempts: { select: { id: true, releaseState: true, score: true, scoringState: true } },
        },
      },
      student: {
        select: {
          studentProfile: {
            select: {
              targetMajor: { select: { name: true } },
              targetUniversity: { select: { name: true, shortName: true } },
            },
          },
        },
      },
      tryout: { select: { title: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } },
      runs: {
        include: { answers: { select: { isCorrect: true, pointsAwarded: true, selectedOptionId: true, selectedOptionIds: true, tryoutItemId: true } }, section: { include: { subtest: true } } },
        orderBy: { sequenceNo: "asc" },
      },
      scoreBreakdowns: { orderBy: { subtestId: "asc" } },
    },
  });
  if (!attempt) throw new TryoutResultValidationError("Hasil Tryout tidak ditemukan.");
  const attemptRelease = attempt.assessmentRelease;
  const sessionRelease = attempt.deliverySession.assessmentRelease;
  if (!legacyRead) {
    if (!attemptRelease || !sessionRelease) throw new TryoutResultValidationError("Hasil Tryout belum memiliki AssessmentRelease yang valid.");
    assertResultReleaseBinding(
      { assessmentReleaseDigest: sessionRelease.contentDigest, assessmentReleaseId: sessionRelease.id, assessmentReleaseNumber: sessionRelease.releaseNumber },
      { assessmentReleaseDigest: attempt.assessmentReleaseDigest, assessmentReleaseId: attempt.assessmentReleaseId, assessmentReleaseNumber: attempt.assessmentReleaseNumber },
    );
    if (attempt.runs.some((run) => run.assessmentReleaseId !== attemptRelease.id || run.assessmentReleaseNumber !== attemptRelease.releaseNumber || run.assessmentReleaseDigest !== attemptRelease.contentDigest)) throw new TryoutResultValidationError("Hasil Tryout memiliki Test run yang tidak cocok dengan AssessmentRelease.");
  }
  const policySnapshot = (attempt.releasePolicySnapshot as unknown as {
    rankingRule?: string;
    resultReleasePolicy?: string;
  } | null) ?? {};
  const snapshotPolicy = policySnapshot.resultReleasePolicy;
  const policy = legacyRead && (snapshotPolicy === "immediate" || snapshotPolicy === "manual" || snapshotPolicy === "automatic_at_end" || snapshotPolicy === "scheduled")
    ? snapshotPolicy
    : effectivePolicy(attempt.deliverySession);
  const rankingRule = legacyRead && (policySnapshot.rankingRule === "national" || policySnapshot.rankingRule === "cohort" || policySnapshot.rankingRule === "none")
    ? policySnapshot.rankingRule
    : attempt.deliverySession.rankingRule;
  const afterClose = attempt.deliverySession.availableUntil <= new Date();
  const scheduledReleaseAt = attempt.deliverySession.scheduledReleaseAt;
  if (policy === "scheduled" && !scheduledReleaseAt) throw new TryoutResultValidationError("Jadwal rilis hasil sesi belum lengkap.");
  if (!legacyRead && attempt.releaseState === AssessmentResultReleaseState.released
    && !publishedAttemptIsConsistent(attempt, attempt.tryout, sessionRelease)) throw new TryoutResultValidationError(PUBLISHED_RESULT_REVIEW_MESSAGE);
  const released = attempt.releaseState === AssessmentResultReleaseState.released
    && attempt.scoringState === AssessmentScoringState.scored
    && attempt.score !== null
    && hasCanonicalSevenBreakdownSet({ tryout: attempt.tryout, breakdowns: attempt.scoreBreakdowns })
    && hasCanonicalSevenRunSet({ tryoutId: attempt.tryoutId, tryout: attempt.tryout, runs: attempt.runs });
  if (!released) return { assessmentRelease: attemptRelease ? toParticipantAssessmentReleaseMetadata(attemptRelease) : null, attemptId, policy, releaseAt: attempt.releaseAt?.toISOString() ?? null, releaseState: attempt.releaseState, released: false, scoringState: attempt.scoringState, status: policy === "manual" ? "Menunggu rilis operator." : policy === "automatic_at_end" ? "Hasil dibuka setelah sesi ditutup dan semua perhitungan valid." : policy === "scheduled" ? "Hasil menunggu jadwal rilis dan perhitungan lengkap." : "Hasil sedang menunggu perhitungan lengkap." };
  const ranking = rankAttempts(attempt.deliverySession.attempts, attempt.id);
  return {
    assessmentRelease: attemptRelease ? toParticipantAssessmentReleaseMetadata(attemptRelease) : null,
    attemptId,
    breakdowns: attempt.scoreBreakdowns.map((breakdown) => ({ correctCount: breakdown.correctCount, normalizedScore: breakdown.normalizedScore === null ? null : Number(breakdown.normalizedScore), rawScore: breakdown.rawScore === null ? null : Number(breakdown.rawScore), scaledScore: breakdown.scaledScore === null ? null : Number(breakdown.scaledScore), scoringVersion: breakdown.scoringVersion, subtestId: breakdown.subtestId, unansweredCount: breakdown.unansweredCount, wrongCount: breakdown.wrongCount })),
    finalScore: Number(attempt.score),
    policy,
    releaseAt: attempt.releaseAt?.toISOString() ?? null,
    releaseState: attempt.releaseState,
    ranking: {
      ...ranking,
      provisional: policy === "immediate" && !afterClose,
      rule: rankingRule,
    },
    released: true,
    target: {
      major: attempt.student.studentProfile?.targetMajor?.name ?? null,
      university: attempt.student.studentProfile?.targetUniversity?.shortName ?? attempt.student.studentProfile?.targetUniversity?.name ?? null,
    },
    tryoutTitle: attempt.tryout.title,
    runs: attempt.runs.map((run) => {
      const bound = !legacyRead || isReleaseBoundRun(run);
      const frozen = frozenRunFields(run, bound);
      const releaseSection = bound
        ? findAssessmentReleaseSectionForRun(attemptRelease?.payload, run)
        : null;
      if (bound && (!releaseSection
        || typeof releaseSection.subtestCode !== "string"
        || typeof releaseSection.subtestName !== "string"
        || typeof releaseSection.title !== "string")) {
        throw new TryoutResultValidationError("Hasil Tryout memiliki Test run tanpa label AssessmentRelease yang beku.");
      }
      const contentItems = (run.contentSnapshot as {
        items?: Array<{
          difficulty?: string;
          explanation?: string | null;
          explanationAssetId?: string | null;
          id: string;
          options?: Array<{ choiceKey: string; content: string; id: string; isCorrect?: boolean }>;
          prompt: string;
          questionType?: string | null;
        }>;
      }).items;
      const review = contentItems?.reduce<Array<{
        difficulty: string;
        explanation: string;
        explanationAssetId: string | null;
        options: Array<{ choiceKey: string; content: string; correct: boolean | undefined; id: string }>;
        prompt: string;
        selectedOptionId: string | null;
        selectedOptionIds: string[];
        questionType: "single_choice" | "multiple_choice";
      }>>((items, item) => {
        const answer = run.answers.find((candidate) => candidate.tryoutItemId === item.id);
        const selectedOptionIds = Array.isArray(answer?.selectedOptionIds)
          ? answer.selectedOptionIds.filter((value): value is string => typeof value === "string")
          : answer?.selectedOptionId
            ? [answer.selectedOptionId]
            : [];
        items.push({
          difficulty: item.difficulty ?? "medium",
          explanation: item.explanation ?? "",
          explanationAssetId: item.explanationAssetId ?? null,
          prompt: item.prompt,
          questionType: item.questionType === "multiple_choice" ? "multiple_choice" : "single_choice",
          selectedOptionId: selectedOptionIds[0] ?? null,
          selectedOptionIds,
          options: item.options?.map((option) => ({ choiceKey: option.choiceKey, content: option.content, correct: option.isCorrect, id: option.id })) ?? [],
        });
        return items;
      }, []) ?? [];

      return {
        calculation: participantRunCalculation(run.calculationResult),
        materializedScore: {
          correctCount: run.correctCount,
          maxScore: run.maxScore === null ? null : Number(run.maxScore),
          normalizedScore: run.normalizedScore === null ? null : Number(run.normalizedScore),
          rawScore: run.rawScore === null ? null : Number(run.rawScore),
          scaledScore: run.scaledScore === null ? null : Number(run.scaledScore),
          scoringState: run.scoringState,
          scoringVersion: run.scoringVersion,
          unansweredCount: run.unansweredCount,
          wrongCount: run.wrongCount,
        },
        durationSeconds: frozen.durationSeconds,
        sectionTitle: bound ? releaseSection!.title! : frozen.title,
        subtest: bound ? releaseSection!.subtestCode! : run.section.subtest.code,
        subtestName: bound ? releaseSection!.subtestName! : run.section.subtest.name,
        testType: frozen.testType,
        timeSpentSeconds: run.serverStartedAt && run.sealedAt
          ? Math.max(0, Math.round((run.sealedAt.getTime() - run.serverStartedAt.getTime()) / 1000))
          : null,
        review,
      };
    }),
  };
  });
}

export { calculateTryoutAttempt, inspectTryoutCalculation, hasCanonicalSevenBreakdownSet, hasCanonicalSevenRunSet, materializeTryoutAttemptInTransaction, participantTryoutResult, releaseTryoutSessionResults, synchronizeAttemptReleaseState, synchronizeTryoutSessionReleaseState, TryoutResultValidationError };
