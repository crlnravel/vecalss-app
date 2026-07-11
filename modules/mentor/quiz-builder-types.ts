export type QuizChoice = {
  id: string;
  text: string;
};

export type QuizQuestionSnapshot = {
  choices: QuizChoice[];
  correctChoiceId: string;
  explanation: string;
  id: string;
  isReady?: boolean;
  origin: "bank" | "local";
  prompt: string;
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
