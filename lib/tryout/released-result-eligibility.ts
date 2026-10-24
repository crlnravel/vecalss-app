import type { Prisma } from "@/generated/prisma/client";

/** Scoring and publication preserve the terminal lifecycle of a Tryout. */
export function isEligibleTryoutResultLifecycle(attempt: { status: unknown; attemptState: unknown }) {
  return ["submitted", "auto_submitted", "expired", "scored"].includes(String(attempt.status))
    && ["submitted", "auto_submitted", "expired"].includes(String(attempt.attemptState));
}

/** Shared owner/publication fence for alternate consumers of existing results. */
export function releasedTryoutResultWhere(studentId: string): Prisma.TryoutAttemptWhereInput {
  return {
    studentId,
    status: { in: ["submitted", "auto_submitted", "expired", "scored"] },
    attemptState: { in: ["submitted", "auto_submitted", "expired"] },
    scoringState: "scored",
    releaseState: "released",
    assessmentReleaseId: { not: null },
    assessmentReleaseNumber: { not: null },
    assessmentReleaseDigest: { not: null },
    deliverySession: { releaseState: "released", assessmentReleaseId: { not: null } },
  };
}
