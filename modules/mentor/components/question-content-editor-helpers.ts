import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

type QuestionDifficulty = NonNullable<QuizQuestionSnapshot["difficulty"]>;
export type EditorQuestion = QuizQuestionSnapshot & {
  difficulty: QuestionDifficulty;
};

export type QuestionMediaTarget =
  | { field: "prompt"; label: string; questionId: string }
  | { field: "explanation"; label: string; questionId: string }
  | {
      choiceId: string;
      field: "choice";
      label: string;
      questionId: string;
    };

export function questionTypeFor(question: Pick<QuizQuestionSnapshot, "questionType">) {
  return question.questionType ?? "single_choice";
}

export function correctChoiceIdsFor(
  question: Pick<QuizQuestionSnapshot, "correctChoiceId" | "correctChoiceIds">,
) {
  const ids =
    question.correctChoiceIds ??
    (question.correctChoiceId ? [question.correctChoiceId] : []);
  return [...new Set(ids)];
}

export function withCorrectChoiceIds(
  question: EditorQuestion,
  selectedIds: readonly string[],
): EditorQuestion {
  const selected = new Set(selectedIds);
  const correctChoiceIds = question.choices
    .filter((choice) => selected.has(choice.id))
    .map((choice) => choice.id);
  return {
    ...question,
    correctChoiceId: correctChoiceIds[0] ?? "",
    correctChoiceIds,
  };
}

export function setQuestionMediaAsset(
  question: EditorQuestion,
  target: QuestionMediaTarget,
  assetId: string | undefined,
): EditorQuestion {
  if (target.questionId !== question.id) return question;
  if (target.field === "prompt") {
    const next = { ...question };
    if (assetId) next.promptMediaAssetId = assetId;
    else delete next.promptMediaAssetId;
    return next;
  }
  if (target.field === "explanation") {
    const next = { ...question };
    if (assetId) next.explanationMediaAssetId = assetId;
    else delete next.explanationMediaAssetId;
    return next;
  }
  return {
    ...question,
    choices: question.choices.map((choice) => {
      if (choice.id !== target.choiceId) return choice;
      const next = { ...choice };
      if (assetId) next.mediaAssetId = assetId;
      else delete next.mediaAssetId;
      return next;
    }),
  };
}
