import "server-only";

import { AttemptStatus, Prisma, TryoutAttemptTestRunStatus, TryoutCatRunState, TryoutResultReleasePolicy } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { aggregateTryoutScores, normalizeRunScore, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";

class TryoutResultValidationError extends Error {}

type ReleasePolicy = "immediate" | "manual" | "automatic_at_end" | "scheduled";
const json = (value: unknown) => value as Prisma.InputJsonValue;

function effectivePolicy(session: { resultReleasePolicy: TryoutResultReleasePolicy; tryout: { defaultResultReleasePolicy: TryoutResultReleasePolicy } }): ReleasePolicy {
  const selected = session.resultReleasePolicy === TryoutResultReleasePolicy.inherit ? session.tryout.defaultResultReleasePolicy : session.resultReleasePolicy;
  if (selected === TryoutResultReleasePolicy.inherit) throw new TryoutResultValidationError("Kebijakan rilis Tryout belum lengkap.");
  return selected as ReleasePolicy;
}

function explanationsComplete(run: { catSnapshot: Prisma.JsonValue | null; contentSnapshot: Prisma.JsonValue }) {
  const content = run.contentSnapshot as { items?: Array<{ explanation?: string | null; id: string }> };
  const adaptive = run.catSnapshot as { selectedItemIds?: string[] } | null;
  const selectedItemIds = adaptive?.selectedItemIds ? new Set(adaptive.selectedItemIds) : null;
  const items = selectedItemIds ? (content.items ?? []).filter((item) => selectedItemIds.has(item.id)) : content.items ?? [];
  return items.length > 0 && items.every((item) => Boolean(item.explanation?.trim()));
}

async function calculateTryoutAttempt(attemptId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new TryoutResultValidationError("Alasan audit perhitungan wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findUnique({ where: { id: attemptId }, include: { runs: { include: { section: { select: { subtestId: true, testType: true } } }, orderBy: { sequenceNo: "asc" } } } });
    if (!attempt) throw new TryoutResultValidationError("Attempt Tryout tidak ditemukan.");
    if (attempt.status === AttemptStatus.in_progress) throw new TryoutResultValidationError("Attempt masih berjalan dan belum dapat dihitung sebagai hasil akhir.");
    if (attempt.runs.length !== 7 || attempt.runs.some((run) => (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired) || !run.calculationReleaseable || run.catState === TryoutCatRunState.voided)) throw new TryoutResultValidationError("Semua tujuh Test harus tersegel, tervalidasi, dan tidak void sebelum hasil dapat dihitung.");
    const normalizedScores = attempt.runs.map((run) => normalizeRunScore(run.calculationResult, run.section.testType, run.catSnapshot));
    if (normalizedScores.some((score) => score === null)) throw new TryoutResultValidationError("Input perhitungan Test belum lengkap atau tidak dapat dinormalisasi.");
    const scores = normalizedScores.filter((score): score is number => score !== null);
    const finalScore = aggregateTryoutScores(scores);
    await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { score: finalScore } });
    await tx.tryoutDeliveryAudit.create({ data: { action: "result.calculated", actorUserId: actorId, admissionId: attempt.admissionId, after: json({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, finalScore, runScores: scores }), reason: reason.trim(), tryoutId: attempt.tryoutId, deliverySessionId: attempt.deliverySessionId } });
    return { aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, attemptId, finalScore, runScores: scores };
  });
}

async function sessionReleaseReadiness(tx: Prisma.TransactionClient, deliverySessionId: string) {
  const session = await tx.tryoutDeliverySession.findUnique({ where: { id: deliverySessionId }, include: { tryout: { select: { defaultResultReleasePolicy: true } }, attempts: { include: { runs: true } } } });
  if (!session) throw new TryoutResultValidationError("Sesi delivery Tryout tidak ditemukan.");
  const policy = effectivePolicy(session);
  if (session.rankingRule === "none") throw new TryoutResultValidationError("Aturan peringkat sesi harus dipilih sebelum paket hasil dapat dirilis.");
  if (!session.attempts.length) throw new TryoutResultValidationError("Belum ada attempt pada sesi ini untuk dirilis.");
  for (const attempt of session.attempts) {
    if (attempt.score === null || attempt.status === AttemptStatus.in_progress || attempt.runs.length !== 7 || attempt.runs.some((run) => !run.calculationReleaseable || run.catState === TryoutCatRunState.voided || (run.status !== TryoutAttemptTestRunStatus.sealed && run.status !== TryoutAttemptTestRunStatus.expired) || !explanationsComplete(run))) {
      throw new TryoutResultValidationError("Rilis diblokir: seluruh attempt harus selesai, terhitung valid, tidak void, dan memiliki penjelasan untuk semua item yang dikirim.");
    }
  }
  return { policy, session };
}

async function releaseTryoutSessionResults(deliverySessionId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new TryoutResultValidationError("Alasan audit rilis wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const { policy, session } = await sessionReleaseReadiness(tx, deliverySessionId);
    if (policy !== "manual") throw new TryoutResultValidationError("Kontrol rilis master hanya digunakan untuk sesi dengan kebijakan manual.");
    if (session.releasedAt) return { deliverySessionId, releasedAt: session.releasedAt, state: "existing" as const };
    const releasedAt = new Date();
    await tx.tryoutDeliverySession.update({ where: { id: deliverySessionId }, data: { releasedAt, releasedByUserId: actorId } });
    await tx.tryoutDeliveryAudit.create({ data: { action: "result.bundle_released", actorUserId: actorId, after: json({ bundle: ["score", "review", "explanations", "ranking", "report"], policy }), deliverySessionId, reason: reason.trim(), tryoutId: session.tryoutId } });
    return { deliverySessionId, releasedAt, state: "released" as const };
  });
}

function rankAttempts(attempts: Array<{ id: string; score: Prisma.Decimal | null }>, attemptId: string) {
  const scored = attempts.filter((attempt) => attempt.score !== null).sort((left, right) => Number(right.score) - Number(left.score));
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

async function participantTryoutResult(attemptId: string, studentId: string) {
  const attempt = await prisma.tryoutAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      deliverySession: {
        include: {
          tryout: { select: { defaultResultReleasePolicy: true } },
          attempts: { select: { id: true, score: true } },
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
        include: { answers: { include: { selectedOption: true } }, section: { include: { subtest: true } } },
        orderBy: { sequenceNo: "asc" },
      },
    },
  });
  if (!attempt) throw new TryoutResultValidationError("Hasil Tryout tidak ditemukan.");
  const policy = effectivePolicy(attempt.deliverySession);
  const ready = attempt.runs.length === 7 && attempt.score !== null && attempt.runs.every((run) => run.calculationReleaseable && run.catState !== TryoutCatRunState.voided && explanationsComplete(run));
  const afterClose = attempt.deliverySession.availableUntil <= new Date();
  const scheduledReleaseAt = attempt.deliverySession.scheduledReleaseAt;
  if (policy === "scheduled" && !scheduledReleaseAt) throw new TryoutResultValidationError("Jadwal rilis hasil sesi belum lengkap.");
  const scheduleReached = Boolean(scheduledReleaseAt && scheduledReleaseAt <= new Date());
  const released = policy === "manual" ? Boolean(attempt.deliverySession.releasedAt) : policy === "immediate" ? ready : policy === "scheduled" ? ready && scheduleReached : ready && afterClose;
  if (!released) return { attemptId, policy, released: false, status: policy === "manual" ? "Menunggu rilis operator." : policy === "automatic_at_end" ? "Hasil dibuka setelah sesi ditutup dan semua perhitungan valid." : policy === "scheduled" ? "Hasil menunggu jadwal rilis dan perhitungan lengkap." : "Hasil sedang menunggu perhitungan lengkap." };
  const ranking = rankAttempts(attempt.deliverySession.attempts, attempt.id);
  return {
    attemptId,
    finalScore: Number(attempt.score),
    policy,
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
          id: string;
          options?: Array<{ choiceKey: string; content: string; id: string; isCorrect?: boolean }>;
          prompt: string;
        }>;
      }).items;
      const review = contentItems?.reduce<Array<{
        difficulty: string;
        explanation: string;
        options: Array<{ choiceKey: string; content: string; correct: boolean | undefined; id: string }>;
        prompt: string;
        selectedOptionId: string | null;
      }>>((items, item) => {
        if (selectedItemIdSet && !selectedItemIdSet.has(item.id)) return items;
        items.push({
          difficulty: item.difficulty ?? "medium",
          explanation: item.explanation ?? "",
          prompt: item.prompt,
          selectedOptionId: run.answers.find((answer) => answer.tryoutItemId === item.id)?.selectedOptionId ?? null,
          options: item.options?.map((option) => ({ choiceKey: option.choiceKey, content: option.content, correct: option.isCorrect, id: option.id })) ?? [],
        });
        return items;
      }, []) ?? [];

      return {
        calculation: run.calculationResult,
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

export { calculateTryoutAttempt, participantTryoutResult, releaseTryoutSessionResults, TryoutResultValidationError };
