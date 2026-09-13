import { createHash } from "node:crypto";

const KUIS_ASSESSMENT_DEFINITION_DIGEST_VERSION = "kuis-assessment-definition-v1" as const;

type KuisScorePolicy = "highest" | "latest" | "first" | "average";
type KuisFormBehavior = "same" | "fresh_randomized";
type KuisReviewTiming = "immediate" | "after_close" | "never";
type KuisCorrectAnswerVisibility = "show" | "hide";
type KuisQuestionOrigin = "bank" | "local";
type KuisSourceRevisionProvenance = "authored" | "legacy_provable" | "legacy_synthetic" | "legacy_unknown";
type KuisAssemblyMode = "fixed_set" | "random_pool" | "blueprint";

type KuisDefinitionChoice = {
  assetId?: string | null;
  id: string;
  text: string;
  mediaAssetId?: string | null;
};

type KuisDefinitionQuestion = {
  id: string;
  choices: readonly KuisDefinitionChoice[];
  correctChoiceId: string;
  correctChoiceIds?: readonly string[];
  explanation: string;
  explanationAssetId?: string | null;
  explanationMediaAssetId?: string | null;
  origin: KuisQuestionOrigin;
  prompt: string;
  promptAssetId?: string | null;
  promptMediaAssetId?: string | null;
  questionType?: "single_choice" | "multiple_choice" | null;
  sourceContentDigest?: string | null;
  sourceQuestionId?: string | null;
  sourceQuestionRevisionId?: string | null;
  sourceRevisionProvenance?: KuisSourceRevisionProvenance | null;
};

type KuisAssemblyIdentity = {
  definitionDigest?: string | null;
  mode?: KuisAssemblyMode | null;
  packageVersionId?: string | null;
  seed?: string | null;
};

type KuisAssessmentDefinition = {
  assembly: {
    definitionDigest: string | null;
    mode: KuisAssemblyMode | null;
    packageVersionId: string | null;
    seed: string | null;
  };
  attemptsAllowed: number | null;
  correctAnswerVisibility: KuisCorrectAnswerVisibility;
  description: string;
  durationSeconds: number | null;
  formBehavior: KuisFormBehavior;
  questions: readonly KuisDefinitionQuestion[];
  retryDelaySeconds: number | null;
  reviewTiming: KuisReviewTiming;
  scorePolicy: KuisScorePolicy;
  sourceBankId: string | null;
  title: string;
};

/**
 * The canonicalizer accepts the current editor-shaped flat assembly fields as
 * well as the nested identity used by the version projections. The index
 * signature intentionally permits operational fields (schedule/visibility)
 * so callers can pass a full quiz record; those fields are never read.
 */
type KuisAssessmentDefinitionInput = {
  assembly?: KuisAssemblyIdentity | null;
  assemblyDefinitionDigest?: string | null;
  assemblyMode?: KuisAssemblyMode | null;
  assemblyPackageVersionId?: string | null;
  assemblySeed?: string | null;
  attemptsAllowed?: number | null;
  correctAnswerVisibility?: KuisCorrectAnswerVisibility;
  description: string;
  durationSeconds?: number | null;
  formBehavior?: KuisFormBehavior;
  questions: readonly KuisDefinitionQuestion[];
  retryDelaySeconds?: number | null;
  reviewTiming?: KuisReviewTiming;
  scorePolicy?: KuisScorePolicy;
  sourceBankId?: string | null;
  title: string;
  [key: string]: unknown;
};

type CanonicalJsonValue = null | boolean | number | string | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

function nullableText<T extends string>(value: T | null | undefined): T | null {
  return value ?? null;
}

function assemblyIdentityFrom(input: KuisAssessmentDefinitionInput) {
  const nested = input.assembly;
  if (nested === null) {
    return {
      definitionDigest: null,
      mode: null,
      packageVersionId: null,
      seed: null,
    } as const;
  }

  if (nested !== undefined) {
    return {
      definitionDigest: nullableText(nested.definitionDigest),
      mode: nested.mode ?? null,
      packageVersionId: nullableText(nested.packageVersionId),
      seed: nullableText(nested.seed),
    } as const;
  }

  return {
    definitionDigest: nullableText(input.assemblyDefinitionDigest),
    mode: input.assemblyMode ?? null,
    packageVersionId: nullableText(input.assemblyPackageVersionId),
    seed: nullableText(input.assemblySeed),
  } as const;
}

function normalizeKuisAssessmentDefinition(input: KuisAssessmentDefinitionInput): KuisAssessmentDefinition {
  return {
    assembly: assemblyIdentityFrom(input),
    attemptsAllowed: input.attemptsAllowed === undefined ? 1 : input.attemptsAllowed,
    correctAnswerVisibility: input.correctAnswerVisibility ?? "show",
    description: input.description,
    durationSeconds: input.durationSeconds ?? null,
    formBehavior: input.formBehavior ?? "same",
    questions: input.questions.map((question) => ({
      choices: question.choices.map((choice) => ({
        id: choice.id,
        mediaAssetId: nullableText(choice.mediaAssetId ?? choice.assetId),
        text: choice.text,
      })),
      correctChoiceId: question.correctChoiceId,
      correctChoiceIds: question.correctChoiceIds?.length ? [...question.correctChoiceIds] : undefined,
      explanation: question.explanation,
      explanationMediaAssetId: nullableText(question.explanationMediaAssetId ?? question.explanationAssetId),
      id: question.id,
      origin: question.origin,
      prompt: question.prompt,
      promptMediaAssetId: nullableText(question.promptMediaAssetId ?? question.promptAssetId),
      questionType: question.questionType ?? null,
      sourceContentDigest: nullableText(question.sourceContentDigest),
      sourceQuestionId: nullableText(question.sourceQuestionId),
      sourceQuestionRevisionId: nullableText(question.sourceQuestionRevisionId),
      sourceRevisionProvenance: nullableText(question.sourceRevisionProvenance),
    })),
    retryDelaySeconds: input.retryDelaySeconds ?? null,
    reviewTiming: input.reviewTiming ?? "immediate",
    scorePolicy: input.scorePolicy ?? "latest",
    sourceBankId: nullableText(input.sourceBankId),
    title: input.title,
  };
}

function canonicalizeKuisAssessmentValue(value: unknown): CanonicalJsonValue {
  if (Array.isArray(value)) return value.map(canonicalizeKuisAssessmentValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, canonicalizeKuisAssessmentValue(nested)]),
    );
  }
  if (value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Kuis definition values must be finite numbers.");
  if (typeof value === "function" || typeof value === "symbol") throw new TypeError("Kuis definition values must be JSON-compatible.");
  return value as CanonicalJsonValue;
}

/**
 * Version identity is semantic rather than a hash of generated row IDs. Draft
 * cloning may allocate fresh item/choice IDs, while source revision/media
 * identity, content, and array order remain the same. Correctness is encoded
 * by the ordered choice index for the same reason.
 */
function semanticKuisAssessmentDefinition(definition: KuisAssessmentDefinition) {
  return {
    assembly: definition.assembly,
    attemptsAllowed: definition.attemptsAllowed,
    correctAnswerVisibility: definition.correctAnswerVisibility,
    description: definition.description,
    // Keep the null/default case compatible with definitions written before
    // Kuis duration was introduced; a configured duration remains versioned.
    durationSeconds: definition.durationSeconds ?? undefined,
    formBehavior: definition.formBehavior,
    questions: definition.questions.map((question) => {
      const correctChoiceIds = question.correctChoiceIds?.length
        ? question.correctChoiceIds
        : [question.correctChoiceId];
      const isMultipleAnswer = question.questionType === "multiple_choice" || correctChoiceIds.length > 1;
      return {
        choices: question.choices.map((choice) => ({
          mediaAssetId: choice.mediaAssetId ?? null,
          text: choice.text,
        })),
        correctChoiceIndex: isMultipleAnswer ? undefined : question.choices.findIndex((choice) => choice.id === question.correctChoiceId),
        correctChoiceIndices: isMultipleAnswer
          ? question.choices
            .map((choice, index) => ({ choice, index }))
            .filter(({ choice }) => correctChoiceIds.includes(choice.id))
            .map(({ index }) => index)
          : undefined,
        explanation: question.explanation,
        explanationMediaAssetId: question.explanationMediaAssetId ?? null,
        origin: question.origin,
        prompt: question.prompt,
        promptMediaAssetId: question.promptMediaAssetId ?? null,
        questionType: isMultipleAnswer ? "multiple_choice" : undefined,
        sourceContentDigest: question.sourceContentDigest ?? null,
        sourceQuestionId: question.sourceQuestionId ?? null,
        sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? null,
        sourceRevisionProvenance: question.sourceRevisionProvenance ?? null,
      };
    }),
    retryDelaySeconds: definition.retryDelaySeconds,
    reviewTiming: definition.reviewTiming,
    scorePolicy: definition.scorePolicy,
    sourceBankId: definition.sourceBankId,
    title: definition.title,
  };
}

function canonicalKuisAssessmentDefinitionJson(input: KuisAssessmentDefinitionInput | KuisAssessmentDefinition) {
  const definition = normalizeKuisAssessmentDefinition(input as KuisAssessmentDefinitionInput);
  return JSON.stringify(canonicalizeKuisAssessmentValue({
    definitionVersion: KUIS_ASSESSMENT_DEFINITION_DIGEST_VERSION,
    definition: semanticKuisAssessmentDefinition(definition),
  }));
}

function digestKuisAssessmentDefinition(input: KuisAssessmentDefinitionInput | KuisAssessmentDefinition) {
  return createHash("sha256")
    .update(canonicalKuisAssessmentDefinitionJson(input), "utf8")
    .digest("hex");
}

export {
  KUIS_ASSESSMENT_DEFINITION_DIGEST_VERSION,
  canonicalKuisAssessmentDefinitionJson,
  canonicalizeKuisAssessmentValue,
  digestKuisAssessmentDefinition,
  normalizeKuisAssessmentDefinition,
};
export type {
  CanonicalJsonValue,
  KuisAssemblyIdentity,
  KuisAssemblyMode,
  KuisAssessmentDefinition,
  KuisAssessmentDefinitionInput,
  KuisCorrectAnswerVisibility,
  KuisDefinitionChoice,
  KuisDefinitionQuestion,
  KuisFormBehavior,
  KuisQuestionOrigin,
  KuisReviewTiming,
  KuisScorePolicy,
  KuisSourceRevisionProvenance,
};
