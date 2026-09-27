type QuizStartAvailability =
  | { kind: "available" }
  | { attemptId: string; kind: "resume" }
  | { kind: "exhausted" }
  | { kind: "retry-wait"; retryAvailableAt: string };

function resolveQuizStartAvailability(input: {
  activeAttemptId: string | null;
  attemptsAllowed: number | null;
  now: Date;
  retryAvailableAt: Date | null;
  terminalAttemptCount: number;
}): QuizStartAvailability {
  if (input.activeAttemptId) {
    return { attemptId: input.activeAttemptId, kind: "resume" };
  }

  if (
    input.attemptsAllowed !== null &&
    input.terminalAttemptCount >= input.attemptsAllowed
  ) {
    return { kind: "exhausted" };
  }

  if (
    input.retryAvailableAt &&
    input.now.getTime() < input.retryAvailableAt.getTime()
  ) {
    return {
      kind: "retry-wait",
      retryAvailableAt: input.retryAvailableAt.toISOString(),
    };
  }

  return { kind: "available" };
}

function canStartQuiz(availability: QuizStartAvailability) {
  return availability.kind === "available" || availability.kind === "resume";
}

export { canStartQuiz, resolveQuizStartAvailability };
export type { QuizStartAvailability };
