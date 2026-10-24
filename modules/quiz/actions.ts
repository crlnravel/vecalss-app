"use server";

import { requireStudentSession } from "@/lib/auth/access";
import {
  QuizAttemptValidationError,
  saveStandaloneQuizAnswer,
  startStandaloneQuiz,
  submitStandaloneQuiz,
} from "@/lib/quiz/repository";
import { getAvailableQuizAttempt } from "./server-data";

function message(error: unknown) {
  return error instanceof QuizAttemptValidationError
    ? error.message
    : "Kuis belum dapat diproses saat ini. Coba lagi beberapa saat lagi.";
}

async function saveQuizAnswerAction(
  attemptId: string,
  quizItemId: string,
  selectedOptionIds: string[],
) {
  const session = await requireStudentSession();
  try {
    return {
      ok: true as const,
      result: await saveStandaloneQuizAnswer(
        attemptId,
        quizItemId,
        selectedOptionIds,
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
    if (!started) return { ok: false as const, message: "Kuis ini tidak tersedia. Kembali ke daftar kuis untuk memilih kuis lain." };
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

async function syncQuizAttemptClockAction(
  subjectSlug: string,
  quizSlug: string,
  attemptId: string,
) {
  const requestReceivedAt = Date.now();
  const session = await requireStudentSession();
  const current = await getAvailableQuizAttempt(
    subjectSlug,
    quizSlug,
    session.user.id,
    attemptId,
  );
  if (!current) {
    return { ok: false as const };
  }
  const deadlineAt = current.attempt.deadlineAt
    ? Date.parse(current.attempt.deadlineAt)
    : null;
  const serverNowAt = current.attempt.serverNowAt
    ? Date.parse(current.attempt.serverNowAt)
    : null;
  return {
    ok: true as const,
    result: {
      isSubmitted: current.attempt.isSubmitted,
      remainingMilliseconds:
        deadlineAt !== null && serverNowAt !== null
          ? Math.max(0, deadlineAt - serverNowAt)
          : null,
      serverProcessingMilliseconds: serverNowAt !== null
        ? Math.max(0, serverNowAt - requestReceivedAt)
        : 0,
    },
  };
}

export {
  saveQuizAnswerAction,
  startQuizAction,
  submitQuizAction,
  syncQuizAttemptClockAction,
};
