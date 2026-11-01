import "server-only";

import { prisma } from "@/lib/prisma";
import {
  participantTryoutResult,
  TryoutResultReviewRequiredError,
  TryoutResultValidationError,
} from "@/lib/tryout/result-repository";
import { releasedTryoutAttemptWhere } from "./authorization";
import { isUuid, reviewItem, subtestMatches, tryoutResultHref, type VeraSource, type VeraToolError } from "./types";

const REVIEW_ITEM_LIMIT = 20;

/** The student's own released result, from the same reader as their result page. Null when it cannot be shown yet. */
async function releasedResult(attemptId: string, studentId: string) {
  try {
    return await participantTryoutResult(attemptId, studentId);
  } catch (error) {
    if (error instanceof TryoutResultValidationError) return null;
    throw error;
  }
}

async function subtestScores(attemptId: string, studentId: string) {
  const result = await releasedResult(attemptId, studentId);
  const runs = result && "runs" in result ? result.runs : undefined;
  if (!runs) return null;
  return runs.map((run) => ({ subtest: run.subtestName, score: run.materializedScore.normalizedScore }));
}

export async function listTryoutResults({
  studentId,
  limit,
  now = new Date(),
}: {
  studentId: string;
  limit: number;
  now?: Date;
}) {
  const rows = await prisma.tryoutAttempt.findMany({
    where: releasedTryoutAttemptWhere(studentId, now),
    orderBy: [{ releaseAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true, score: true, releaseAt: true, tryout: { select: { title: true } } },
  });
  return Promise.all(
    rows.map(async (row) => ({
      attemptId: row.id,
      title: row.tryout.title,
      date: row.releaseAt?.toISOString() ?? null,
      finalScore: row.score === null ? null : Number(row.score),
      subtests: await subtestScores(row.id, studentId),
      source: { type: "tryout", id: row.id, label: row.tryout.title, href: tryoutResultHref(row.id) } satisfies VeraSource,
    })),
  );
}

/**
 * One released Tryout result, from the same reader as the student's result page. A result that is still under review
 * returns its own error rather than partial data. Items are numbered across the whole result, so a filter keeps the numbers.
 */
export async function getTryoutResultReview({
  studentId,
  attemptId,
  subtest,
  onlyWrong = true,
  now = new Date(),
}: {
  studentId: string;
  attemptId: string;
  subtest?: string;
  onlyWrong?: boolean;
  now?: Date;
}) {
  if (!isUuid(attemptId)) return { error: "not_found" } satisfies VeraToolError;
  const owned = await prisma.tryoutAttempt.findFirst({
    where: { id: attemptId, ...releasedTryoutAttemptWhere(studentId, now) },
    select: { id: true, tryout: { select: { title: true } } },
  });
  if (!owned) return { error: "not_found" } satisfies VeraToolError;

  let result: Awaited<ReturnType<typeof participantTryoutResult>>;
  try {
    result = await participantTryoutResult(attemptId, studentId);
  } catch (error) {
    if (error instanceof TryoutResultReviewRequiredError) return { error: "under_review" } satisfies VeraToolError;
    throw error;
  }
  const allRuns = "runs" in result ? result.runs : undefined;
  if (!allRuns) return { error: "not_available" } satisfies VeraToolError;

  const runs = allRuns.filter((run) => !subtest?.trim() || subtestMatches({ code: run.subtest, name: run.subtestName }, subtest));
  const items = runs
    .flatMap((run) => run.review.map((item) => ({ run, item })))
    .map(({ run, item }, index) =>
      reviewItem({
        number: index + 1,
        subtest: run.subtestName,
        prompt: item.prompt,
        explanation: item.explanation,
        options: item.options.map((option) => ({ id: option.id, text: option.content, correct: option.correct })),
        selectedOptionIds: item.selectedOptionIds,
      }),
    )
    .filter((item) => !onlyWrong || item.status === "wrong")
    .slice(0, REVIEW_ITEM_LIMIT);

  return {
    attemptId,
    title: owned.tryout.title,
    finalScore: result.finalScore,
    subtests: runs.map((run) => ({ subtest: run.subtestName, score: run.materializedScore.normalizedScore })),
    items,
    source: { type: "tryout", id: attemptId, label: owned.tryout.title, href: tryoutResultHref(attemptId) } satisfies VeraSource,
  };
}
