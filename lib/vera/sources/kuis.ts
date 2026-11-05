import "server-only";

import { prisma } from "@/lib/prisma";
import { getStandaloneQuizResult } from "@/lib/quiz/repository";
import { quizSubjects } from "@/modules/quiz/data";
import { kuisReviewVisibility, releasedKuisAttemptWhere } from "./authorization";
import { newestFirst, resultTime } from "./result-time";
import {
  isUuid,
  kuisResultHref,
  reviewItem,
  subtestWhere,
  type ReviewItem,
  type VeraSource,
  type VeraToolError,
} from "./types";

const REVIEW_ITEM_LIMIT = 20;
const ANSWER_KEY_HIDDEN = "Kunci jawaban belum dibuka, jadi kebenaran tiap soal tidak ditampilkan.";
const REVIEW_HIDDEN = "Pembahasan belum dibuka, jadi hanya skor yang bisa dilihat.";

/** Result pages are routed by subject slug. A Kuis subtest carries its subject's title as its code. */
export function kuisSource(attemptId: string, quiz: { slug: string; title: string; subtest: { code: string } }): VeraSource {
  const subject = quizSubjects.find((candidate) => candidate.title === quiz.subtest.code);
  return {
    type: "kuis",
    id: attemptId,
    label: quiz.title,
    href: kuisResultHref(subject?.slug, quiz.slug, attemptId),
  };
}

export async function listKuisAttempts({
  studentId,
  subtest,
  limit,
  now = new Date(),
}: {
  studentId: string;
  subtest?: string;
  limit: number;
  now?: Date;
}) {
  const base = releasedKuisAttemptWhere(studentId, now);
  // Prisma cannot order by the result time, so the rows are sorted here, before the limit.
  const rows = newestFirst(
    await prisma.standaloneQuizAttempt.findMany({
      where: subtest?.trim()
        ? { ...base, participation: { studentId, quiz: { status: "published", subtest: subtestWhere(subtest) } } }
        : base,
      select: {
        id: true,
        score: true,
        correctCount: true,
        wrongCount: true,
        unansweredCount: true,
        releaseAt: true,
        submittedAt: true,
        createdAt: true,
        participation: {
          select: { quiz: { select: { slug: true, title: true, subtest: { select: { code: true } } } } },
        },
      },
    }),
  ).slice(0, limit);
  return rows.map((row) => ({
    attemptId: row.id,
    title: row.participation.quiz.title,
    date: resultTime(row).toISOString(),
    score: row.score,
    correct: row.correctCount ?? 0,
    wrong: row.wrongCount ?? 0,
    unanswered: row.unansweredCount ?? 0,
    source: kuisSource(row.id, row.participation.quiz),
  }));
}

export type KuisAttemptReview = {
  attemptId: string;
  title: string;
  score: number | null;
  correct: number;
  wrong: number;
  unanswered: number;
  reviewAvailable: boolean;
  correctnessVisible: boolean;
  limitation: string | null;
  items: ReviewItem[];
  source: VeraSource;
};

/**
 * One Kuis attempt as the student's own result page shows it. Item correctness comes only from the result reader, and only
 * when the review is open and correctness is shown. Otherwise the answer carries score facts and the reason.
 */
export async function getKuisAttemptReview({
  studentId,
  attemptId,
  onlyWrong = true,
  now = new Date(),
}: {
  studentId: string;
  attemptId: string;
  onlyWrong?: boolean;
  now?: Date;
}): Promise<KuisAttemptReview | VeraToolError> {
  if (!isUuid(attemptId)) return { error: "not_found" };
  const row = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, ...releasedKuisAttemptWhere(studentId, now) },
    select: {
      id: true,
      score: true,
      correctCount: true,
      wrongCount: true,
      unansweredCount: true,
      policySnapshot: true,
      participation: {
        select: {
          quiz: {
            select: {
              slug: true,
              title: true,
              reviewTiming: true,
              correctAnswerVisibility: true,
              closesAt: true,
              subtest: { select: { code: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return { error: "not_found" };

  const quiz = row.participation.quiz;
  const visibility = kuisReviewVisibility(row.policySnapshot, quiz, now);
  const summary = {
    attemptId: row.id,
    title: quiz.title,
    score: row.score,
    correct: row.correctCount ?? 0,
    wrong: row.wrongCount ?? 0,
    unanswered: row.unansweredCount ?? 0,
    reviewAvailable: visibility.reviewAvailable,
    correctnessVisible: visibility.correctnessVisible,
    source: kuisSource(row.id, quiz),
  };
  if (!visibility.correctnessVisible) {
    return { ...summary, limitation: visibility.reviewAvailable ? ANSWER_KEY_HIDDEN : REVIEW_HIDDEN, items: [] };
  }

  const result = await getStandaloneQuizResult(row.id, studentId, quiz.subtest.code, quiz.slug, now);
  if (!result) return { error: "not_available" };
  // The reader has the final say: it marks options correct only when the student is allowed to see correctness.
  if (!result.correctnessAvailable) return { ...summary, limitation: ANSWER_KEY_HIDDEN, items: [] };

  const items = result.questions
    .map((question, index) =>
      reviewItem({
        number: index + 1,
        prompt: question.prompt,
        explanation: question.explanation,
        options: question.options.map((option) => ({ id: option.id, text: option.text, correct: option.correct })),
        selectedOptionIds: question.selectedOptionIds,
      }),
    )
    .filter((item) => !onlyWrong || item.status === "wrong")
    .slice(0, REVIEW_ITEM_LIMIT);
  return { ...summary, limitation: null, items };
}
