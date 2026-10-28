import { decodeLegacyAnswerSelection } from "@/lib/question-bank/answer-contract";

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? [...value]
    : null;
}

/**
 * Selected option ids of one stored Kuis answer, or null when the row is invalid.
 * A row with only the single option (an empty list column) is a valid legacy
 * answer, so the list key is left out instead of being sent as an empty list
 * that contradicts the single option.
 */
export function storedAnswerSelectionIds(answer: {
  selectedOptionId: string | null;
  selectedOptionIds: unknown;
}) {
  const decoded = decodeLegacyAnswerSelection(
    answer.selectedOptionIds === null || answer.selectedOptionIds === undefined
      ? { selectedOptionId: answer.selectedOptionId }
      : { selectedOptionId: answer.selectedOptionId, selectedOptionIds: stringArray(answer.selectedOptionIds) },
  );
  return decoded.ok ? decoded.selectedOptionIds : null;
}
