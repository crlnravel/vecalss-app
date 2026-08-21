export type QuizChoice = {
  id: string;
  mediaAssetId?: string;
  text: string;
};

export type QuizQuestionSnapshot = {
  choices: QuizChoice[];
  correctChoiceId: string;
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  isReady?: boolean;
  origin: "bank" | "local";
  prompt: string;
  promptMediaAssetId?: string;
  sourceQuestionId?: string;
};

export type QuizScorePolicy = "highest" | "latest" | "first" | "average";
export type QuizFormBehavior = "same" | "fresh_randomized";
export type QuizReviewTiming = "immediate" | "after_close" | "never";
export type QuizCorrectAnswerVisibility = "show" | "hide";

export type QuizBuilderState = {
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
  sourceBankId: string;
  subjectCode: string;
  title: string;
};
