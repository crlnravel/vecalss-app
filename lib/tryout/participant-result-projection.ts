/** "review": released, but the stored result failed its integrity check and cannot be opened yet. */
type ParticipantTryoutResultAvailability = "processing" | "unreleased" | "released" | "review" | null;

function projectParticipantTryoutResultAvailability(input: {
  attemptReleaseState?: string | null;
  attemptScoringState?: string | null;
  attemptStatus?: string | null;
  hasScore?: boolean;
  sessionReleaseState?: string | null;
}): ParticipantTryoutResultAvailability {
  if (!input.attemptStatus || input.attemptStatus === "in_progress") return null;

  const scoringIsReady = input.attemptScoringState === "scored" && input.hasScore === true;
  if (!scoringIsReady) return "processing";

  return input.sessionReleaseState === "released" && input.attemptReleaseState === "released"
    ? "released"
    : "unreleased";
}

export { projectParticipantTryoutResultAvailability };
export type { ParticipantTryoutResultAvailability };
