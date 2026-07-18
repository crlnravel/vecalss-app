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

export type QuizBuilderState = {
  description: string;
  questions: QuizQuestionSnapshot[];
  sourceBankId: string;
  subjectCode: string;
  targetQuestionCount: string;
  title: string;
};
