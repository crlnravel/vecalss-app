import "server-only";

import { prisma } from "@/lib/prisma";
import { releasedKuisAttemptWhere, releasedTryoutAttemptWhere } from "./authorization";
import { listKuisAttempts } from "./kuis";
import { listTryoutResults } from "./tryout";
import { newestFirst } from "./result-time";

/** How many recent Kuis attempts feed the accuracy by subtest. */
const ACCURACY_SAMPLE = 200;

/** Recent results, totals and Kuis accuracy by subtest: enough to orient an answer before a detailed read. */
export async function getLearningOverview({ studentId, now = new Date() }: { studentId: string; now?: Date }) {
  const [kuis, tryouts, recentKuis, kuisAttempts, tryoutResults] = await Promise.all([
    listKuisAttempts({ studentId, limit: 5, now }),
    listTryoutResults({ studentId, limit: 3, now }),
    prisma.standaloneQuizAttempt.findMany({
      where: releasedKuisAttemptWhere(studentId, now),
      select: {
        id: true,
        releaseAt: true,
        submittedAt: true,
        createdAt: true,
        correctCount: true,
        wrongCount: true,
        unansweredCount: true,
        participation: { select: { quiz: { select: { subtest: { select: { code: true, name: true } } } } } },
      },
    }),
    prisma.standaloneQuizAttempt.count({ where: releasedKuisAttemptWhere(studentId, now) }),
    prisma.tryoutAttempt.count({ where: releasedTryoutAttemptWhere(studentId, now) }),
  ]);
  const sample = newestFirst(recentKuis).slice(0, ACCURACY_SAMPLE);

  const bySubtest = new Map<string, { subtest: string; questions: number; correct: number }>();
  for (const attempt of sample) {
    const { code, name } = attempt.participation.quiz.subtest;
    const entry = bySubtest.get(code) ?? { subtest: name, questions: 0, correct: 0 };
    entry.questions += (attempt.correctCount ?? 0) + (attempt.wrongCount ?? 0) + (attempt.unansweredCount ?? 0);
    entry.correct += attempt.correctCount ?? 0;
    bySubtest.set(code, entry);
  }

  return {
    counts: { kuisAttempts, tryoutResults },
    kuis,
    tryouts,
    subtestAccuracy: [...bySubtest.values()].map((entry) => ({
      ...entry,
      accuracyPct: entry.questions > 0 ? Math.round((entry.correct * 100) / entry.questions) : null,
    })),
  };
}
