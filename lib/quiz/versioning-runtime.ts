import {
  digestKuisAssessmentDefinition,
  type KuisAssessmentDefinitionInput,
} from "@/lib/quiz/versioning-digest";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const KUIS_VERSIONING_CUTOVER_ENV = "KUIS_VERSIONING_CUTOVER" as const;

type KuisVersionedDefinitionInput = Pick<
  KuisAssessmentDefinitionInput,
  | "assemblyDefinitionDigest"
  | "assemblyMode"
  | "assemblyPackageVersionId"
  | "assemblySeed"
  | "attemptsAllowed"
  | "correctAnswerVisibility"
  | "description"
  | "formBehavior"
  | "questions"
  | "retryDelaySeconds"
  | "reviewTiming"
  | "scorePolicy"
  | "sourceBankId"
  | "title"
>;

function isStandaloneQuizVersioningCutoverEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return env[KUIS_VERSIONING_CUTOVER_ENV]?.trim().toLowerCase() === "enabled";
}

function versionedDefinitionInput(input: {
  assemblyDefinitionDigest?: string | null;
  assemblyMode?: KuisVersionedDefinitionInput["assemblyMode"];
  assemblyPackageVersionId?: string | null;
  assemblySeed?: string | null;
  attemptsAllowed?: number | null;
  correctAnswerVisibility?: KuisVersionedDefinitionInput["correctAnswerVisibility"];
  description: string;
  formBehavior?: KuisVersionedDefinitionInput["formBehavior"];
  questions: readonly QuizQuestionSnapshot[];
  retryDelaySeconds?: number | null;
  reviewTiming?: KuisVersionedDefinitionInput["reviewTiming"];
  scorePolicy?: KuisVersionedDefinitionInput["scorePolicy"];
  sourceBankId?: string | null;
  title: string;
}): KuisVersionedDefinitionInput {
  return {
    assemblyDefinitionDigest: input.assemblyDefinitionDigest,
    assemblyMode: input.assemblyMode,
    assemblyPackageVersionId: input.assemblyPackageVersionId,
    assemblySeed: input.assemblySeed,
    attemptsAllowed: input.attemptsAllowed,
    correctAnswerVisibility: input.correctAnswerVisibility,
    description: input.description,
    formBehavior: input.formBehavior,
    questions: input.questions.map((question) => ({
      choices: question.choices,
      correctChoiceId: question.correctChoiceId,
      correctChoiceIds: question.correctChoiceIds,
      explanation: question.explanation,
      explanationMediaAssetId: question.explanationMediaAssetId,
      id: question.id,
      origin: question.origin,
      prompt: question.prompt,
      promptMediaAssetId: question.promptMediaAssetId,
      questionType: question.questionType,
      sourceContentDigest: question.sourceContentDigest,
      sourceQuestionId: question.sourceQuestionId,
      sourceQuestionRevisionId: question.sourceQuestionRevisionId,
      sourceRevisionProvenance: question.sourceRevisionProvenance,
    })),
    retryDelaySeconds: input.retryDelaySeconds,
    reviewTiming: input.reviewTiming,
    scorePolicy: input.scorePolicy,
    sourceBankId: input.sourceBankId,
    title: input.title,
  };
}

function versionedDefinitionDigest(input: Parameters<typeof versionedDefinitionInput>[0]) {
  return digestKuisAssessmentDefinition(versionedDefinitionInput(input));
}

function nextStandaloneQuizVersionNo(versionNumbers: readonly (number | null | undefined)[]) {
  return Math.max(0, ...versionNumbers.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0)) + 1;
}

function draftRevisionMatches(expected: number | null | undefined, actual: number | null | undefined) {
  return expected === undefined || expected === null || expected === actual;
}

export {
  KUIS_VERSIONING_CUTOVER_ENV,
  draftRevisionMatches,
  isStandaloneQuizVersioningCutoverEnabled,
  nextStandaloneQuizVersionNo,
  versionedDefinitionDigest,
  versionedDefinitionInput,
};
export type { KuisVersionedDefinitionInput };
