import "server-only";

import { getKuisAttemptReview, listKuisAttempts } from "./sources/kuis";
import { newestResultOf } from "./sources/result-time";
import { getTryoutResultReview, listTryoutResults } from "./sources/tryout";
import type { VeraSource } from "./sources/types";
import type { ReviewTarget } from "./studio";

/** The Kuis attempt or Tryout result a review reads, with the link the document keeps to it. */
export type ResolvedTarget = ReviewTarget & { source: VeraSource };

/**
 * The review's target, checked with the readers the student's own pages use. "latest" means the newest result of either kind.
 */
export async function resolveReviewTarget(
  studentId: string,
  target: "latest" | ReviewTarget,
  now: Date,
): Promise<ResolvedTarget | null> {
  const chosen = target === "latest" ? await newestResult(studentId, now) : target;
  if (!chosen) return null;
  const review =
    chosen.type === "kuis"
      ? await getKuisAttemptReview({ studentId, attemptId: chosen.id, onlyWrong: true, now })
      : await getTryoutResultReview({ studentId, attemptId: chosen.id, onlyWrong: true, now });
  if ("error" in review) return null;
  return { type: chosen.type, id: chosen.id, source: review.source };
}

async function newestResult(studentId: string, now: Date): Promise<ReviewTarget | null> {
  const [kuis, tryout] = await Promise.all([
    listKuisAttempts({ studentId, limit: 1, now }),
    listTryoutResults({ studentId, limit: 1, now }),
  ]);
  const newest = newestResultOf([
    ...kuis.map((row) => ({ type: "kuis" as const, id: row.attemptId, date: row.date })),
    ...tryout.map((row) => ({ type: "tryout" as const, id: row.attemptId, date: row.date })),
  ]);
  return newest ? { type: newest.type, id: newest.id } : null;
}
