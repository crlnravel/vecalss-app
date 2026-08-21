import "server-only";

import { AssessmentAttemptState, AssessmentResultReleaseState, AssessmentScoringProvenance, AssessmentScoringState, AttemptStatus, Prisma, TryoutAttemptTestRunStatus, TryoutCatRunState, TryoutResultReleasePolicy } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { aggregateTryoutScores, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";

class TryoutResultValidationError extends Error {}

type ReleasePolicy = "immediate" | "manual" | "automatic_at_end" | "scheduled";
const json = (value: unknown) => value as Prisma.InputJsonValue;

function effectivePolicy(session: { resultReleasePolicy: TryoutResultReleasePolicy; tryout: { defaultResultReleasePolicy: TryoutResultReleasePolicy } }): ReleasePolicy {
  const selected = session.resultReleasePolicy === TryoutResultReleasePolicy.inherit ? session.tryout.defaultResultReleasePolicy : session.resultReleasePolicy;
  if (selected === TryoutResultReleasePolicy.inherit) throw new TryoutResultValidationError("Kebijakan rilis Tryout belum lengkap.");
  return selected as ReleasePolicy;
}

function explanationsComplete(run: { catSnapshot: Prisma.JsonValue | null; contentSnapshot: Prisma.JsonValue }) {
  const content = run.contentSnapshot as { items?: Array<{ explanation?: string | null; explanationAssetId?: string | null; id: string }> };
  const adaptive = run.catSnapshot as { selectedItemIds?: unknown } | null;
  if (run.catSnapshot !== null && (!adaptive || !Array.isArray(adaptive.selectedItemIds))) return false;
  const selectedItemIds = Array.isArray(adaptive?.selectedItemIds) && adaptive.selectedItemIds.every((itemId): itemId is string => typeof itemId === "string")
    ? new Set(adaptive.selectedItemIds)
    : null;
  if (Array.isArray(adaptive?.selectedItemIds) && (!selectedItemIds || selectedItemIds.size !== adaptive.selectedItemIds.length || selectedItemIds.size === 0)) return false;
  const items = selectedItemIds ? (content.items ?? []).filter((item) => selectedItemIds.has(item.id)) : content.items ?? [];
  return items.length > 0
    && (!selectedItemIds || items.length === selectedItemIds.size)
    && items.every((item) => Boolean(item.explanation?.trim() || item.explanationAssetId));
}

type CanonicalSection = { id: string; sequenceNo: number; subtestId: string };
type CanonicalRun = { sequenceNo: number; tryoutSectionId: string; section: { id: string; sequenceNo: number; subtestId: string; tryoutId: string } };

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

function terminalAttemptStateIsCalculable(attempt: { attemptState: AssessmentAttemptState; status: AttemptStatus }) {
  return attempt.attemptState !== AssessmentAttemptState.in_progress
    && attempt.attemptState !== AssessmentAttemptState.abandoned
    && attempt.attemptState !== AssessmentAttemptState.void
    && attempt.status !== AttemptStatus.in_progress
    && attempt.status !== AttemptStatus.abandoned;
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

type MaterializeTryoutAttemptResult = { aggregationVersion: string; attemptId: string; finalScore?: number; runScores?: number[]; state?: "existing" | "review_required" };

async function materializeTryoutAttemptInTransaction(tx: Prisma.TransactionClient, attemptId: string, actorId: string, reason: string, strict = true): Promise<MaterializeTryoutAttemptResult> {
  const attempt = await tx.tryoutAttempt.findUnique({
    where: { id: attemptId },
    include: {
      deliverySession: { select: { availableUntil: true, rankingRule: true, releaseState: true, releasedAt: true, resultReleasePolicy: true, scheduledReleaseAt: true, tryout: { select: { defaultResultReleasePolicy: true } } } },
      runs: { include: { section: { select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true } } }, orderBy: { sequenceNo: "asc" } },
      scoreBreakdowns: { select: { id: true } },
      tryout: { select: { createdByUserId: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } },
    },
  });
  const review = async (message: string): Promise<MaterializeTryoutAttemptResult> => {
    if (strict) throw new TryoutResultValidationError(message);
    if (attempt) await tx.tryoutAttempt.update({ where: { id: attempt.id }, data: { releaseAt: null, releaseState: AssessmentResultReleaseState.hidden, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: message, scoringState: AssessmentScoringState.review_required } });
    return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, state: "review_required" };
  };
  if (!attempt) return review("Attempt Tryout tidak ditemukan.");
  if (!terminalAttemptStateIsCalculable(attempt)) return review("Attempt belum berada pada state terminal yang dapat dihitung, atau telah abandoned/void.");
  if (!hasCanonicalSevenRunSet({ tryoutId: attempt.tryoutId, tryout: attempt.tryout, runs: attempt.runs })) return review("Attempt tidak memiliki tepat tujuh Test kanonis untuk Tryout ini.");
  if (attempt.runs.some((run) => (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired) || run.scoringState !== AssessmentScoringState.scored || !run.calculationReleaseable || run.catState === TryoutCatRunState.voided || run.normalizedScore === null)) return review("Semua tujuh Test harus tersegel, termaterialisasi, dan tidak void sebelum hasil dapat dihitung.");
  const scores = attempt.runs.map((run) => Number(run.normalizedScore));
  const finalScore = aggregateTryoutScores(scores);
  const existingBreakdowns = attempt.scoreBreakdowns.length;
  if (attempt.scoringState === AssessmentScoringState.scored && attempt.score !== null && attempt.scoringVersion === TRYOUT_SCORE_AGGREGATION_VERSION && existingBreakdowns === 7) {
    return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, finalScore: Number(attempt.score), runScores: scores, state: "existing" };
  }
  for (const run of attempt.runs) await upsertTryoutBreakdown(tx, attemptId, run);
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
  await tx.tryoutDeliveryAudit.create({ data: { action: "result.calculated", actorUserId: actorId, admissionId: attempt.admissionId, after: json({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, finalScore, runScores: scores }), reason: reason.trim(), tryoutId: attempt.tryoutId, deliverySessionId: attempt.deliverySessionId } });
  return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, finalScore, runScores: scores };
}

async function calculateTryoutAttempt(attemptId: string, actorId: string, reason: string, allowCrossOwner = false) {
  if (!reason.trim()) throw new TryoutResultValidationError("Alasan audit perhitungan wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tryout_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const target = await tx.tryoutAttempt.findUnique({ where: { id: attemptId }, select: { tryout: { select: { createdByUserId: true } } } });
    if (!target) throw new TryoutResultValidationError("Attempt Tryout tidak ditemukan.");
    if (target.tryout.createdByUserId !== actorId && !allowCrossOwner) throw new TryoutResultValidationError("Anda tidak dapat menghitung hasil Tryout milik Kapten lain.");
    return materializeTryoutAttemptInTransaction(tx, attemptId, actorId, reason, true);
  });
}

async function sessionReleaseReadiness(tx: Prisma.TransactionClient, deliverySessionId: string) {
  const session = await tx.tryoutDeliverySession.findUnique({ where: { id: deliverySessionId }, include: { tryout: { select: { defaultResultReleasePolicy: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } }, attempts: { include: { runs: { include: { section: { select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true } } } }, scoreBreakdowns: { select: { id: true } } } } } });
  if (!session) throw new TryoutResultValidationError("Sesi delivery Tryout tidak ditemukan.");
  const policy = effectivePolicy(session);
  if (session.rankingRule === "none") throw new TryoutResultValidationError("Aturan peringkat sesi harus dipilih sebelum paket hasil dapat dirilis.");
  if (!session.attempts.length) throw new TryoutResultValidationError("Belum ada attempt pada sesi ini untuk dirilis.");
  for (const attempt of session.attempts) {
    if (attempt.score === null || attempt.scoringState !== AssessmentScoringState.scored || !terminalAttemptStateIsCalculable(attempt) || attempt.scoreBreakdowns.length !== 7 || !hasCanonicalSevenRunSet({ tryoutId: session.tryoutId, tryout: session.tryout, runs: attempt.runs }) || attempt.runs.some((run) => run.scoringState !== AssessmentScoringState.scored || run.normalizedScore === null || !run.calculationReleaseable || run.catState === TryoutCatRunState.voided || (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired) || !explanationsComplete(run))) {
      throw new TryoutResultValidationError("Rilis diblokir: seluruh attempt harus selesai, terhitung valid, tidak void, dan memiliki penjelasan untuk semua item yang dikirim.");
    }
  }
  return { policy, session };
}

async function releaseTryoutSessionResults(deliverySessionId: string, actorId: string, reason: string, allowCrossOwner = false) {
  if (!reason.trim()) throw new TryoutResultValidationError("Alasan audit rilis wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tryout_delivery_sessions WHERE id = ${deliverySessionId}::uuid FOR UPDATE`;
    const target = await tx.tryoutDeliverySession.findUnique({ where: { id: deliverySessionId }, select: { releasedAt: true, releaseState: true, tryout: { select: { createdByUserId: true } } } });
    if (!target) throw new TryoutResultValidationError("Sesi delivery Tryout tidak ditemukan.");
    if (target.tryout.createdByUserId !== actorId && !allowCrossOwner) throw new TryoutResultValidationError("Anda tidak dapat merilis hasil Tryout milik Kapten lain.");
    const { policy, session } = await sessionReleaseReadiness(tx, deliverySessionId);
    if (policy !== "manual") throw new TryoutResultValidationError("Kontrol rilis master hanya digunakan untuk sesi dengan kebijakan manual.");
    if (target.releaseState === AssessmentResultReleaseState.released) return { deliverySessionId, releasedAt: target.releasedAt, state: "existing" as const };
    const releasedAt = new Date();
    await tx.tryoutDeliverySession.update({ where: { id: deliverySessionId }, data: { releaseReason: reason.trim(), releaseState: AssessmentResultReleaseState.released, releasedAt, releasedByUserId: actorId } });
    await tx.tryoutAttempt.updateMany({ where: { deliverySessionId }, data: { releaseAt: releasedAt, releaseState: AssessmentResultReleaseState.released } });
    await tx.tryoutDeliveryAudit.create({ data: { action: "result.bundle_released", actorUserId: actorId, after: json({ bundle: ["score", "review", "explanations", "ranking", "report"], policy }), deliverySessionId, reason: reason.trim(), tryoutId: session.tryoutId } });
    return { deliverySessionId, releasedAt, state: "released" as const };
  });
}

function rankAttempts(attempts: Array<{ id: string; releaseState?: AssessmentResultReleaseState; score: Prisma.Decimal | null; scoringState?: AssessmentScoringState }>, attemptId: string) {
  const scored = attempts.filter((attempt) => attempt.score !== null && (attempt.scoringState === undefined || attempt.scoringState === AssessmentScoringState.scored) && (attempt.releaseState === undefined || attempt.releaseState === AssessmentResultReleaseState.released)).sort((left, right) => Number(right.score) - Number(left.score));
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

async function synchronizeAttemptReleaseState(attemptId: string, studentId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tryout_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.tryoutAttempt.findUnique({
      where: { id: attemptId },
      include: {
        deliverySession: { include: { tryout: { select: { defaultResultReleasePolicy: true, sections: { select: { id: true, sequenceNo: true, subtestId: true }, orderBy: { sequenceNo: "asc" } } } } } },
        runs: { include: { section: { select: { id: true, sequenceNo: true, subtestId: true, tryoutId: true } } } },
        scoreBreakdowns: { select: { id: true } },
      },
    });
    if (!attempt || attempt.studentId !== studentId) return null;
    const policy = effectivePolicy(attempt.deliverySession);
    const ready = attempt.deliverySession.rankingRule !== "none"
      && terminalAttemptStateIsCalculable(attempt)
      && attempt.scoringState === AssessmentScoringState.scored
      && attempt.score !== null
      && attempt.scoreBreakdowns.length === 7
      && hasCanonicalSevenRunSet({ tryoutId: attempt.tryoutId, tryout: attempt.deliverySession.tryout, runs: attempt.runs })
      && attempt.runs.every((run) => run.scoringState === AssessmentScoringState.scored && run.normalizedScore !== null && run.calculationReleaseable && run.catState !== TryoutCatRunState.voided && (run.status === TryoutAttemptTestRunStatus.sealed || run.status === TryoutAttemptTestRunStatus.expired) && explanationsComplete(run));
    let releaseState: AssessmentResultReleaseState = AssessmentResultReleaseState.hidden;
    let releaseAt: Date | null = null;
    if (ready && policy === "manual" && attempt.deliverySession.releaseState === AssessmentResultReleaseState.released) {
      releaseState = AssessmentResultReleaseState.released;
      releaseAt = attempt.deliverySession.releasedAt;
    } else if (ready && policy === "immediate") {
      releaseState = AssessmentResultReleaseState.released;
      releaseAt = now;
    } else if (ready && policy === "scheduled") {
      if (!attempt.deliverySession.scheduledReleaseAt) throw new TryoutResultValidationError("Jadwal rilis hasil sesi belum lengkap.");
      releaseState = attempt.deliverySession.scheduledReleaseAt <= now ? AssessmentResultReleaseState.released : AssessmentResultReleaseState.scheduled;
      releaseAt = attempt.deliverySession.scheduledReleaseAt;
    } else if (ready && policy === "automatic_at_end") {
      releaseState = attempt.deliverySession.availableUntil <= now ? AssessmentResultReleaseState.released : AssessmentResultReleaseState.scheduled;
      releaseAt = attempt.deliverySession.availableUntil;
    }
    if (attempt.releaseState !== releaseState || attempt.releaseAt?.getTime() !== releaseAt?.getTime()) {
      return tx.tryoutAttempt.update({ where: { id: attempt.id }, data: { releaseAt, releaseState } });
    }
    return attempt;
  });
}

async function participantTryoutResult(attemptId: string, studentId: string) {
  await synchronizeAttemptReleaseState(attemptId, studentId, new Date());
  const attempt = await prisma.tryoutAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      deliverySession: {
        include: {
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
      tryout: { select: { title: true } },
      runs: {
        include: { answers: { select: { isCorrect: true, pointsAwarded: true, selectedOptionId: true, tryoutItemId: true } }, section: { include: { subtest: true } } },
        orderBy: { sequenceNo: "asc" },
      },
      scoreBreakdowns: { orderBy: { subtestId: "asc" } },
    },
  });
  if (!attempt) throw new TryoutResultValidationError("Hasil Tryout tidak ditemukan.");
  const policy = effectivePolicy(attempt.deliverySession);
  const afterClose = attempt.deliverySession.availableUntil <= new Date();
  const scheduledReleaseAt = attempt.deliverySession.scheduledReleaseAt;
  if (policy === "scheduled" && !scheduledReleaseAt) throw new TryoutResultValidationError("Jadwal rilis hasil sesi belum lengkap.");
  const released = attempt.releaseState === AssessmentResultReleaseState.released
    && attempt.scoringState === AssessmentScoringState.scored
    && attempt.score !== null;
  if (!released) return { attemptId, policy, releaseAt: attempt.releaseAt?.toISOString() ?? null, releaseState: attempt.releaseState, released: false, scoringState: attempt.scoringState, status: policy === "manual" ? "Menunggu rilis operator." : policy === "automatic_at_end" ? "Hasil dibuka setelah sesi ditutup dan semua perhitungan valid." : policy === "scheduled" ? "Hasil menunggu jadwal rilis dan perhitungan lengkap." : "Hasil sedang menunggu perhitungan lengkap." };
  const ranking = rankAttempts(attempt.deliverySession.attempts, attempt.id);
  return {
    attemptId,
    breakdowns: attempt.scoreBreakdowns.map((breakdown) => ({ correctCount: breakdown.correctCount, normalizedScore: breakdown.normalizedScore === null ? null : Number(breakdown.normalizedScore), rawScore: breakdown.rawScore === null ? null : Number(breakdown.rawScore), scaledScore: breakdown.scaledScore === null ? null : Number(breakdown.scaledScore), scoringVersion: breakdown.scoringVersion, subtestId: breakdown.subtestId, unansweredCount: breakdown.unansweredCount, wrongCount: breakdown.wrongCount })),
    finalScore: Number(attempt.score),
    policy,
    releaseAt: attempt.releaseAt?.toISOString() ?? null,
    releaseState: attempt.releaseState,
    ranking: {
      ...ranking,
      provisional: policy === "immediate" && !afterClose,
      rule: attempt.deliverySession.rankingRule,
    },
    released: true,
    target: {
      major: attempt.student.studentProfile?.targetMajor?.name ?? null,
      university: attempt.student.studentProfile?.targetUniversity?.shortName ?? attempt.student.studentProfile?.targetUniversity?.name ?? null,
    },
    tryoutTitle: attempt.tryout.title,
    runs: attempt.runs.map((run) => {
      const selectedItemIds = (run.catSnapshot as { selectedItemIds?: string[] } | null)?.selectedItemIds;
      const selectedItemIdSet = selectedItemIds ? new Set(selectedItemIds) : null;
      const contentItems = (run.contentSnapshot as {
        items?: Array<{
          difficulty?: string;
          explanation?: string | null;
          explanationAssetId?: string | null;
          id: string;
          options?: Array<{ choiceKey: string; content: string; id: string; isCorrect?: boolean }>;
          prompt: string;
        }>;
      }).items;
      const review = contentItems?.reduce<Array<{
        difficulty: string;
        explanation: string;
        explanationAssetId: string | null;
        options: Array<{ choiceKey: string; content: string; correct: boolean | undefined; id: string }>;
        prompt: string;
        selectedOptionId: string | null;
      }>>((items, item) => {
        if (selectedItemIdSet && !selectedItemIdSet.has(item.id)) return items;
        items.push({
          difficulty: item.difficulty ?? "medium",
          explanation: item.explanation ?? "",
          explanationAssetId: item.explanationAssetId ?? null,
          prompt: item.prompt,
          selectedOptionId: run.answers.find((answer) => answer.tryoutItemId === item.id)?.selectedOptionId ?? null,
          options: item.options?.map((option) => ({ choiceKey: option.choiceKey, content: option.content, correct: option.isCorrect, id: option.id })) ?? [],
        });
        return items;
      }, []) ?? [];

      return {
        calculation: run.calculationResult,
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
        durationSeconds: run.section.durationSeconds,
        sectionTitle: run.section.title,
        subtest: run.section.subtest.code,
        subtestName: run.section.subtest.name,
        testType: run.section.testType,
        timeSpentSeconds: run.serverStartedAt && run.sealedAt
          ? Math.max(0, Math.round((run.sealedAt.getTime() - run.serverStartedAt.getTime()) / 1000))
          : null,
        review,
      };
    }),
  };
}

export { calculateTryoutAttempt, hasCanonicalSevenRunSet, materializeTryoutAttemptInTransaction, participantTryoutResult, releaseTryoutSessionResults, TryoutResultValidationError };
