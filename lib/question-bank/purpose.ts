export const QUESTION_BANK_PURPOSES = ["quiz", "tryout"] as const;

export type QuestionBankPurpose = (typeof QUESTION_BANK_PURPOSES)[number];

export function isQuestionBankPurpose(value: unknown): value is QuestionBankPurpose {
  return typeof value === "string" && QUESTION_BANK_PURPOSES.includes(value as QuestionBankPurpose);
}

export function assertQuestionBankPurpose(value: unknown): QuestionBankPurpose {
  if (!isQuestionBankPurpose(value)) throw new Error("Tujuan Bank Soal tidak valid.");
  return value;
}

export function questionBankPurposeLabel(purpose: QuestionBankPurpose) {
  return purpose === "quiz" ? "Kuis" : "Tryout";
}
