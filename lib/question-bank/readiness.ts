/**
 * The question-bank readiness contract is deliberately structural.  It can be
 * used by the browser's mutable draft and by server-loaded revisions without
 * importing Prisma, React, or any server-only module.
 */

export type QuestionReadinessIssueCode =
  | "missing_prompt"
  | "invalid_choice_count"
  | "missing_choice_text"
  | "invalid_correct_choice"
  | "asset_not_ready"
  | "missing_subtest";

export type QuestionReadinessField =
  | "prompt"
  | "choice"
  | "correctChoice"
  | "media"
  | "subtest";

export type QuestionReadinessFocusTarget = QuestionReadinessField;

export type QuestionReadinessIssue = {
  choiceId?: string;
  code: QuestionReadinessIssueCode;
  field: QuestionReadinessField;
  focusTarget: QuestionReadinessFocusTarget;
  questionId: string;
};

export type QuestionBankReadiness = {
  incompleteCount: number;
  issues: QuestionReadinessIssue[];
  readyCount: number;
  totalCount: number;
};

export type QuestionReadinessAsset = {
  state?: string | null;
} | null | undefined;

/**
 * This is the normalized shape consumed by the shared evaluator.  The
 * editor/revision adapters below intentionally map their source vocabulary to
 * this small shape before applying the rules.
 */
export type NormalizedQuestionReadinessInput = {
  choices: readonly {
    id: string;
    mediaAsset?: QuestionReadinessAsset;
    text: string | null | undefined;
  }[];
  correctChoiceId: string | null | undefined;
  correctChoiceIds?: readonly string[];
  explanationAsset?: QuestionReadinessAsset;
  id: string;
  prompt: string | null | undefined;
  promptAsset?: QuestionReadinessAsset;
  subtestCode: string | null | undefined;
};

export type QuestionDraftReadinessInput = {
  choices: readonly {
    id: string;
    mediaAsset?: QuestionReadinessAsset;
    mediaAssetId?: string | null;
    mediaAssetState?: string | null;
    text: string | null | undefined;
  }[];
  correctChoiceId: string | null | undefined;
  explanationMediaAsset?: QuestionReadinessAsset;
  explanationMediaAssetId?: string | null;
  explanationMediaAssetState?: string | null;
  id: string;
  prompt: string | null | undefined;
  promptMediaAsset?: QuestionReadinessAsset;
  promptMediaAssetId?: string | null;
  promptMediaAssetState?: string | null;
  subjectCode?: string | null;
};

export type QuestionRevisionReadinessInput = {
  questionId: string;
  revision: {
    explanation?: string | null;
    explanationAsset?: QuestionReadinessAsset;
    explanationAssetId?: string | null;
    options?: readonly {
      asset?: QuestionReadinessAsset;
      assetId?: string | null;
      content: string | null | undefined;
      id: string;
      isCorrect: boolean;
    }[];
    promptAsset?: QuestionReadinessAsset;
    promptAssetId?: string | null;
    stem: string | null | undefined;
  } | null;
  subtestCode?: string | null;
};

function asAsset(
  asset: QuestionReadinessAsset,
  assetState: string | null | undefined,
): QuestionReadinessAsset {
  if (asset !== undefined) return asset;
  return assetState === undefined ? undefined : { state: assetState };
}

function isReadyAsset(asset: QuestionReadinessAsset) {
  return !asset || asset.state === "ready";
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function issue(
  questionId: string,
  code: QuestionReadinessIssueCode,
  field: QuestionReadinessField,
  choiceId?: string,
): QuestionReadinessIssue {
  return {
    ...(choiceId === undefined ? {} : { choiceId }),
    code,
    field,
    focusTarget: field,
    questionId,
  };
}

/**
 * Evaluate one normalized question.  Rule and field order are intentional:
 * the resulting array is the stable order used by issue navigation.
 */
export function evaluateQuestionReadiness(
  question: NormalizedQuestionReadinessInput,
): QuestionReadinessIssue[] {
  const issues: QuestionReadinessIssue[] = [];

  if (!hasText(question.prompt)) {
    issues.push(issue(question.id, "missing_prompt", "prompt"));
  }

  if (question.choices.length < 2 || question.choices.length > 5) {
    issues.push(issue(question.id, "invalid_choice_count", "choice"));
  }

  for (const choice of question.choices) {
    if (!hasText(choice.text)) {
      issues.push(issue(question.id, "missing_choice_text", "choice", choice.id));
    }
  }

  const correctChoiceIds = question.correctChoiceIds ?? (
    question.correctChoiceId === undefined || question.correctChoiceId === null
      ? []
      : [question.correctChoiceId]
  );
  const selectedCorrectChoiceId = question.correctChoiceId ?? correctChoiceIds[0];
  if (correctChoiceIds.length !== 1 || !question.choices.some((choice) => choice.id === selectedCorrectChoiceId)) {
    issues.push(issue(question.id, "invalid_correct_choice", "correctChoice"));
  }

  if (!isReadyAsset(question.promptAsset)) {
    issues.push(issue(question.id, "asset_not_ready", "media"));
  }

  for (const choice of question.choices) {
    if (!isReadyAsset(choice.mediaAsset)) {
      issues.push(issue(question.id, "asset_not_ready", "media", choice.id));
    }
  }

  if (!isReadyAsset(question.explanationAsset)) {
    issues.push(issue(question.id, "asset_not_ready", "media"));
  }

  if (!hasText(question.subtestCode)) {
    issues.push(issue(question.id, "missing_subtest", "subtest"));
  }

  return issues;
}

export function normalizeQuestionDraftForReadiness(
  question: QuestionDraftReadinessInput,
): NormalizedQuestionReadinessInput {
  return {
    choices: question.choices.map((choice) => ({
      id: choice.id,
      mediaAsset: asAsset(choice.mediaAsset, choice.mediaAssetState),
      text: choice.text,
    })),
    correctChoiceId: question.correctChoiceId,
    correctChoiceIds: question.correctChoiceId ? [question.correctChoiceId] : [],
    explanationAsset: asAsset(question.explanationMediaAsset, question.explanationMediaAssetState),
    id: question.id,
    prompt: question.prompt,
    promptAsset: asAsset(question.promptMediaAsset, question.promptMediaAssetState),
    subtestCode: question.subjectCode,
  };
}

export function normalizeQuestionRevisionForReadiness(
  input: QuestionRevisionReadinessInput,
): NormalizedQuestionReadinessInput {
  const revision = input.revision;
  const options = revision?.options ?? [];
  return {
    choices: options.map((option) => ({
      id: option.id,
      mediaAsset: option.asset,
      text: option.content,
    })),
    correctChoiceId: options.find((option) => option.isCorrect)?.id,
    correctChoiceIds: options.filter((option) => option.isCorrect).map((option) => option.id),
    explanationAsset: revision?.explanationAsset,
    id: input.questionId,
    prompt: revision?.stem,
    promptAsset: revision?.promptAsset,
    subtestCode: input.subtestCode,
  };
}

export function getQuestionReadinessFromDraft(
  question: QuestionDraftReadinessInput,
) {
  return evaluateQuestionReadiness(normalizeQuestionDraftForReadiness(question));
}

export function getQuestionReadinessFromRevision(
  input: QuestionRevisionReadinessInput,
) {
  return evaluateQuestionReadiness(normalizeQuestionRevisionForReadiness(input));
}

export function evaluateQuestionBankReadiness(
  questions: readonly NormalizedQuestionReadinessInput[],
): QuestionBankReadiness {
  const issuesByQuestion = questions.map((question) => evaluateQuestionReadiness(question));
  const issues = issuesByQuestion.flat();
  const totalCount = questions.length;
  const incompleteCount = issuesByQuestion.filter((questionIssues) => questionIssues.length > 0).length;
  return {
    incompleteCount,
    issues,
    readyCount: totalCount - incompleteCount,
    totalCount,
  };
}

export function getQuestionBankReadinessFromDrafts(
  questions: readonly QuestionDraftReadinessInput[],
) {
  return evaluateQuestionBankReadiness(questions.map(normalizeQuestionDraftForReadiness));
}

export function getQuestionBankReadinessFromRevisions(
  questions: readonly QuestionRevisionReadinessInput[],
) {
  return evaluateQuestionBankReadiness(questions.map(normalizeQuestionRevisionForReadiness));
}
