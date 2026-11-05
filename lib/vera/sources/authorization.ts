import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { releasedTryoutResultWhere } from "@/lib/tryout/released-result-eligibility";

/**
 * Learner-visibility fences for everything Vera can read. They were carried over
 * from the retired Vera registry, so Vera keeps the same rules as the student's
 * own Materi, Kuis and Tryout pages.
 */

/** Published Materi with a PDF attachment, which is what the course catalogue requires. */
export function publishedMateriWhere(now: Date): Prisma.ModuleWhereInput {
  return {
    status: "published",
    publishedAt: { lte: now },
    assets: { some: { assetType: "attachment", mimeType: "application/pdf" } },
  };
}

/**
 * The student's own Kuis attempts that the result pages show: submitted or scored, and released. A scheduled release counts once its
 * time has passed. An immediate release has no time at all, so it is matched by its state alone.
 */
export function releasedKuisAttemptWhere(studentId: string, now: Date): Prisma.StandaloneQuizAttemptWhereInput {
  return {
    participation: { studentId, quiz: { status: "published" } },
    status: { in: ["submitted", "auto_submitted", "scored"] },
    scoringState: "scored",
    OR: [{ releaseState: "released" }, { releaseState: "scheduled", releaseAt: { lte: now } }],
  };
}

/** The student's own released Tryout results, using the same fence as their result page. */
export function releasedTryoutAttemptWhere(studentId: string, now: Date): Prisma.TryoutAttemptWhereInput {
  return {
    ...releasedTryoutResultWhere(studentId),
    tryout: { status: "published", publishedAt: { lte: now } },
    deliverySession: {
      status: { in: ["active", "closed", "archived"] },
      releaseState: "released",
      assessmentReleaseId: { not: null },
      assignments: { some: { status: "active", admission: { status: "active", studentId } } },
    },
    assessmentRelease: { is: { publishedAt: { lte: now } } },
  };
}

export type KuisReviewVisibility = {
  reviewAvailable: boolean;
  correctnessVisible: boolean;
};

type KuisReviewQuiz = {
  reviewTiming?: unknown;
  correctAnswerVisibility?: unknown;
  closesAt?: unknown;
};

/**
 * When a Kuis review opens and whether correct answers may be shown. The
 * attempt's policy snapshot wins over the live quiz settings. Missing settings
 * fall back to the most private values, `never` and `hide`.
 */
export function kuisReviewVisibility(snapshot: unknown, quiz: KuisReviewQuiz, now: Date): KuisReviewVisibility {
  const policy = recordValue(snapshot);
  const reviewTiming = stringValue(policy.reviewTiming) ?? stringValue(quiz.reviewTiming) ?? "never";
  const correctAnswerVisibility = stringValue(policy.correctAnswerVisibility) ?? stringValue(quiz.correctAnswerVisibility) ?? "hide";
  const closesAt = dateValue(policy.closesAt) ?? dateValue(quiz.closesAt);
  const reviewAvailable = reviewTiming === "immediate" || (reviewTiming === "after_close" && closesAt !== null && closesAt <= now);
  return { reviewAvailable, correctnessVisible: reviewAvailable && correctAnswerVisibility === "show" };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  return null;
}
