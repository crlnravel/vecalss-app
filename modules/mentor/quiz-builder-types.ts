export type QuizChoice = {
  id: string;
  mediaAssetId?: string;
  text: string;
};

export type QuizQuestionSourceUpdate = {
  choices: QuizChoice[];
  correctChoiceId: string;
  correctChoiceIds: string[];
  explanation: string;
  explanationMediaAssetId?: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionType?: "single_choice" | "multiple_choice";
  sourceContentDigest: string;
  sourceQuestionRevisionId: string;
  sourceRevisionProvenance?: "authored" | "legacy_provable" | "legacy_synthetic" | "legacy_unknown";
  revisionNo: number;
};

export type QuizQuestionSnapshot = {
  choices: QuizChoice[];
  correctChoiceId: string;
  /** Canonical answer-key set. Legacy readers continue using correctChoiceId. */
  correctChoiceIds?: string[];
  difficulty?: "easy" | "medium" | "hard" | "adaptive";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  isReady?: boolean;
  origin: "bank" | "local";
  prompt: string;
  promptMediaAssetId?: string;
  questionType?: "single_choice" | "multiple_choice";
  sourceQuestionId?: string;
  sourceQuestionRevisionId?: string;
  sourceContentDigest?: string;
  sourceRevisionProvenance?: "authored" | "legacy_provable" | "legacy_synthetic" | "legacy_unknown";
  sourceUpdate?: QuizQuestionSourceUpdate;
};

export type QuizScorePolicy = "highest" | "latest" | "first" | "average";
export type QuizFormBehavior = "same" | "fresh_randomized";
export type QuizReviewTiming = "immediate" | "after_close" | "never";
export type QuizCorrectAnswerVisibility = "show" | "hide";

export type QuizBuilderState = {
  assemblyVersionId: string | null;
  attemptsAllowed: number | null;
  closesAt: string;
  correctAnswerVisibility: QuizCorrectAnswerVisibility;
  description: string;
  formBehavior: QuizFormBehavior;
  opensAt: string;
  questions: QuizQuestionSnapshot[];
  retryDelaySeconds: number | null;
  reviewTiming: QuizReviewTiming;
  scorePolicy: QuizScorePolicy;
  sourceMode: "local" | "bank";
  sourceBankId: string;
  subjectCode: string;
  title: string;
};
