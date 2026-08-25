import type { KuisReviewTiming } from "@/lib/quiz/versioning-digest";

type KuisReleaseState = "hidden" | "scheduled" | "released";
type KuisScoringState = "pending" | "scored" | "failed";

type KuisAfterCloseResult = {
  id: string;
  releaseAt: string | null;
  releaseState: KuisReleaseState;
  releasedAt?: string | null;
  reviewTiming: KuisReviewTiming;
  scoringState: KuisScoringState;
};

type KuisScheduleReleaseTransition = {
  after: KuisAfterCloseResult;
  before: KuisAfterCloseResult;
  changed: boolean;
  kind: "unchanged" | "rescheduled" | "released";
};

function asDate(value: string | Date | null, name: string) {
  if (value === null) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date.`);
  return date;
}

/**
 * Plan one schedule-only release transition. A released result is terminal:
 * no close-time edit can move it back to scheduled or change its release time.
 */
function transitionKuisAfterCloseResult(
  result: KuisAfterCloseResult,
  nextClosesAt: string | Date | null,
  now: string | Date,
): KuisScheduleReleaseTransition {
  const before = { ...result };
  const close = asDate(nextClosesAt, "nextClosesAt");
  const currentTime = asDate(now, "now");
  if (!currentTime) throw new TypeError("now must be a valid date.");

  if (result.reviewTiming !== "after_close"
    || result.scoringState !== "scored"
    || result.releaseState !== "scheduled"
    || !close) {
    return { after: { ...result }, before, changed: false, kind: "unchanged" };
  }

  const releaseAt = close.toISOString();
  const released = close.getTime() <= currentTime.getTime();
  const after: KuisAfterCloseResult = {
    ...result,
    releaseAt,
    releaseState: released ? "released" : "scheduled",
    releasedAt: released ? currentTime.toISOString() : result.releasedAt,
  };
  const changed = after.releaseAt !== result.releaseAt
    || after.releaseState !== result.releaseState
    || after.releasedAt !== result.releasedAt;
  return {
    after,
    before,
    changed,
    kind: released ? "released" : changed ? "rescheduled" : "unchanged",
  };
}

function rescheduleKuisAfterCloseResults(
  results: readonly KuisAfterCloseResult[],
  nextClosesAt: string | Date | null,
  now: string | Date,
) {
  const transitions = results.map((result) => transitionKuisAfterCloseResult(result, nextClosesAt, now));
  return {
    changed: transitions.some((transition) => transition.changed),
    results: transitions.map((transition) => transition.after),
    transitions,
  };
}

export { rescheduleKuisAfterCloseResults, transitionKuisAfterCloseResult };
export type { KuisAfterCloseResult, KuisReleaseState, KuisScheduleReleaseTransition, KuisScoringState };
