import type { EditorQuestion } from "@/modules/mentor/components/question-content-editor";
import type {
  TryoutQuestionChange,
  TryoutQuestionSnapshotDraft,
} from "@/modules/mentor/components/tryout-section-question-manager";

export function asContentEditorQuestion(
  question: TryoutQuestionSnapshotDraft,
): EditorQuestion {
  const correctChoiceIds = question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.snapshotOptionId);
  return {
    choices: question.options.map((option) => ({
      id: option.snapshotOptionId,
      text: option.content,
      ...(option.assetId ? { mediaAssetId: option.assetId } : {}),
    })),
    correctChoiceId: correctChoiceIds[0] ?? "",
    correctChoiceIds,
    difficulty: question.difficulty,
    explanation: question.explanation ?? "",
    ...(question.explanationAssetId
      ? { explanationMediaAssetId: question.explanationAssetId }
      : {}),
    id: question.snapshotId,
    origin: "local",
    prompt: question.prompt,
    ...(question.promptAssetId
      ? { promptMediaAssetId: question.promptAssetId }
      : {}),
    questionType: question.questionType,
  };
}

export function toTryoutQuestionChange(
  question: EditorQuestion,
): TryoutQuestionChange {
  const correctChoiceIds = new Set(
    question.correctChoiceIds ??
      (question.correctChoiceId ? [question.correctChoiceId] : []),
  );
  return {
    difficulty: question.difficulty,
    explanation: question.explanation,
    explanationAssetId: question.explanationMediaAssetId ?? null,
    options: question.choices.map((choice, index) => ({
      assetId: choice.mediaAssetId ?? null,
      choiceKey: String.fromCharCode(65 + index),
      content: choice.text,
      isCorrect: correctChoiceIds.has(choice.id),
      snapshotOptionId: choice.id,
      sortOrder: index,
    })),
    prompt: question.prompt,
    promptAssetId: question.promptMediaAssetId ?? null,
    questionType: question.questionType ?? "single_choice",
  };
}
