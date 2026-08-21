"use server";

import { requireStudentSession } from "@/lib/auth/access";
import {
  QuizAttemptValidationError,
  saveStandaloneQuizAnswer,
  startStandaloneQuiz,
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

async function startQuizAction(subjectCode: string, quizSlug: string, startRequestId: string) {
  const session = await requireStudentSession();
  try {
    const started = await startStandaloneQuiz(subjectCode, quizSlug, session.user.id, undefined, startRequestId);
    if (!started) return { ok: false as const, message: "Quiz tidak ditemukan." };
    return {
      ok: true as const,
      result: {
        attemptId: started.attempt.id,
        attemptNo: started.attempt.attemptNo,
        policy: started.policy,
        startRequestId: started.attempt.startRequestId,
        state: started.state,
      },
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

export { saveQuizAnswerAction, startQuizAction, submitQuizAction };
