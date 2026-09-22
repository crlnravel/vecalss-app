import "server-only";

import { VeraContractError } from "./contracts";
import type { ResolvedContextBlock } from "./context-pack";

function unavailable(reason: string): never {
  throw new VeraContractError("context_release_unavailable", "Sumber konteks Vera tidak tersedia.", 410, { reason });
}

function rejectHiddenPayload(input: object): void {
  const candidate = input as Record<string, unknown>;
  if ("answerKey" in candidate
    || "correctAnswer" in candidate
    || "correctOption" in candidate
    || "explanation" in candidate
    || "ranking" in candidate
    || "unreleasedExplanation" in candidate) {
    unavailable("hidden_projection");
  }
}

export type KuisResultProjection = {
  sourceId: string;
  studentId: string;
  title: string;
  reviewAvailable: boolean;
  releaseState: "released" | "unreleased";
  scoringState: "scored" | "pending";
  correctAnswerVisibility?: "show" | "hide";
  resultSummary: string;
  wrongCorrectPattern: string;
  questionTopicIdentity: string[];
  releasedExplanations: string[];
} & Record<string, unknown>;

export function resolveCompletedKuis(input: KuisResultProjection, studentId: string): ResolvedContextBlock {
  rejectHiddenPayload(input);
  if (input.studentId !== studentId) unavailable("ownership");
  if (!input.reviewAvailable || input.releaseState !== "released" || input.scoringState !== "scored") {
    unavailable("review_release_or_scoring");
  }
  if (input.correctAnswerVisibility === "hide") unavailable("correct_answer_hidden");
  return {
    sourceType: "practice",
    sourceId: input.sourceId,
    title: input.title,
    citationLabel: `Kuis ${input.title}`,
    citationKey: `kuis_${input.sourceId}`,
    content: JSON.stringify({
      resultSummary: input.resultSummary,
      wrongCorrectPattern: input.wrongCorrectPattern,
      questionTopicIdentity: input.questionTopicIdentity,
      releasedExplanations: input.releasedExplanations,
    }),
  };
}

export type TryoutResultProjection = {
  sourceId: string;
  studentId: string;
  title: string;
  scoreVisible: boolean;
  releaseState: "released" | "unreleased";
  scoringState: "scored" | "pending";
  readiness: "ready" | "pending";
  subtestScores: string[];
  releasedBreakdown: string[];
  timingSummary: string;
  wrongAnswerReferences: string[];
  releaseBindingValid?: boolean;
} & Record<string, unknown>;

export function resolveCompletedTryout(input: TryoutResultProjection, studentId: string): ResolvedContextBlock {
  rejectHiddenPayload(input);
  if (input.studentId !== studentId) unavailable("ownership");
  if (!input.scoreVisible || input.releaseState !== "released" || input.scoringState !== "scored" || input.readiness !== "ready") {
    unavailable("score_release_or_readiness");
  }
  if (input.releaseBindingValid === false) unavailable("release_binding");
  return {
    sourceType: "practice",
    sourceId: input.sourceId,
    title: input.title,
    citationLabel: `Tryout ${input.title}`,
    citationKey: `tryout_${input.sourceId}`,
    content: JSON.stringify({
      subtestScores: input.subtestScores,
      releasedBreakdown: input.releasedBreakdown,
      timingSummary: input.timingSummary,
      wrongAnswerReferences: input.wrongAnswerReferences,
    }),
  };
}

export type PublishedMateriProjection = {
  sourceId: string;
  title: string;
  topic: string;
  bodyExcerpt: string;
  published: boolean;
  visibleToStudent: boolean;
} & Record<string, unknown>;

export function resolvePublishedMateri(input: PublishedMateriProjection): ResolvedContextBlock {
  rejectHiddenPayload(input);
  if (!input.published || !input.visibleToStudent) unavailable("publication_or_visibility");
  return {
    sourceType: "material",
    sourceId: input.sourceId,
    title: input.title,
    citationLabel: `Materi ${input.title}`,
    citationKey: `materi_${input.sourceId}`,
    content: JSON.stringify({ topic: input.topic, bodyExcerpt: input.bodyExcerpt }),
  };
}
