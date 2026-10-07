import type { KaptenQuiz } from "@/modules/mentor/mock-data";

type QuizBankSource = Pick<KaptenQuiz, "assembly" | "sourceBank" | "sourceBankId" | "sourceMode">;

export function getQuizQuestionBankContext(savedQuiz: QuizBankSource | null | undefined) {
  const assemblyBank = savedQuiz?.sourceMode === "assembly" ? savedQuiz.assembly : undefined;
  const sourceBankId = savedQuiz?.sourceMode === "bank" || savedQuiz?.sourceMode === "assembly" ? savedQuiz.sourceBankId : undefined;
  return {
    showAddFromBank: savedQuiz?.sourceMode !== "assembly",
    sourceBankHref: sourceBankId ? `/mentor/quiz/question-bank/${sourceBankId}?purpose=quiz` : undefined,
    sourceBankTitle: savedQuiz?.sourceMode === "bank" && sourceBankId
      ? savedQuiz.sourceBank || undefined
      : assemblyBank && sourceBankId && assemblyBank.bankId === sourceBankId ? assemblyBank.bankName || undefined : undefined,
  };
}
