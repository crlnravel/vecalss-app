"use server";

import { requireStudentSession } from "@/lib/auth/access";
import {
  QuizAttemptValidationError,
  saveStandaloneQuizAnswer,
  submitStandaloneQuiz,
} from "@/lib/quiz/repository";

function message(error: unknown) {
  return error instanceof QuizAttemptValidationError
    ? error.message
    : "Quiz tidak dapat diproses saat ini. Silakan coba lagi.";
}

async function saveQuizAnswerAction(
  attemptId: string,
  quizItemId: string,
  selectedOptionId: string,
) {
  const session = await requireStudentSession();
  try {
    return {
      ok: true as const,
      result: await saveStandaloneQuizAnswer(
        attemptId,
        quizItemId,
        selectedOptionId,
        session.user.id,
      ),
    };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function submitQuizAction(attemptId: string) {
  const session = await requireStudentSession();
  try {
    return {
      ok: true as const,
      result: await submitStandaloneQuiz(attemptId, session.user.id),
    };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

export { saveQuizAnswerAction, submitQuizAction };
