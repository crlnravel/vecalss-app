export type QuestionAnswerMode = "single_choice" | "multiple_choice";

export function questionAnswerModeLabel(questionType: QuestionAnswerMode | null | undefined) {
  return questionType === "multiple_choice"
    ? "Pilihan ganda kompleks"
    : "Pilihan ganda";
}
