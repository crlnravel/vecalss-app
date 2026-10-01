import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

/** A quiz edits its own copy; bank revisions must never replace local work. */
export function asQuizOwnedQuestion(question: QuizQuestionSnapshot): QuizQuestionSnapshot {
  return {
    ...question,
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceIds: question.correctChoiceIds ? [...question.correctChoiceIds] : undefined,
    origin: "local",
    sourceQuestionId: undefined,
    sourceQuestionRevisionId: undefined,
    sourceContentDigest: undefined,
    sourceRevisionProvenance: undefined,
    sourceUpdate: undefined,
  };
}
