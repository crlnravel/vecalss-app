"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import {
  acceptStandaloneQuizQuestionUpdate,
  bulkPublishStandaloneQuizzes,
  bulkUnpublishStandaloneQuizzes,
  getMentorStandaloneQuiz,
  importStandaloneQuizBankQuestions,
  QuizValidationError,
  saveStandaloneQuiz,
  transitionStandaloneQuizSourceMode,
  updateStandaloneQuizLifecycle,
  type AcceptStandaloneQuizQuestionUpdateInput,
  type TransitionStandaloneQuizSourceModeInput,
  type SaveStandaloneQuizInput,
} from "@/lib/quiz/repository";

function revalidateQuizPaths() {
  revalidatePath("/mentor/quiz");
  revalidatePath("/mentor/quiz/subject/[subjectSlug]", "page");
  revalidatePath("/quiz");
  revalidatePath("/quiz/[slug]", "page");
  revalidatePath("/quiz/[slug]/[quizSlug]", "page");
}

async function saveStandaloneQuizAction(input: SaveStandaloneQuizInput) {
  const session = await requireTutorSession();
  try {
    const quiz = await saveStandaloneQuiz(input, session.user.id);
    const refreshed = await getMentorStandaloneQuiz(quiz.id, session.user.id);
    if (!refreshed)
      throw new Error("Saved quiz could not be loaded.");
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return {
      ok: true as const,
      quiz: refreshed.quiz,
      questions: refreshed.questions,
    };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz mutation failed", error);
    return { message: "Quiz tidak dapat disimpan saat ini. Coba lagi.", ok: false as const };
  }
}

async function acceptStandaloneQuizQuestionUpdateAction(input: AcceptStandaloneQuizQuestionUpdateInput) {
  const session = await requireTutorSession();
  try {
    const result = await acceptStandaloneQuizQuestionUpdate(input, session.user.id);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${input.quizId}`);
    revalidatePath(`/mentor/quiz/${input.quizId}/editor`);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz question update acceptance failed", error);
    return { message: "Revisi soal tidak dapat diterapkan saat ini. Coba lagi.", ok: false as const };
  }
}

async function importStandaloneQuizBankQuestionsAction(input: Omit<TransitionStandaloneQuizSourceModeInput, "mode">) {
  const session = await requireTutorSession();
  try {
    const result = await importStandaloneQuizBankQuestions(input, session.user.id);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${input.quizId}`);
    revalidatePath(`/mentor/quiz/${input.quizId}/editor`);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz bank import failed", error);
    return { message: "Soal dari Bank Soal Kuis tidak dapat diimpor saat ini.", ok: false as const };
  }
}

async function transitionStandaloneQuizSourceModeAction(input: TransitionStandaloneQuizSourceModeInput) {
  const session = await requireTutorSession();
  try {
    const result = await transitionStandaloneQuizSourceMode(input, session.user.id);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${input.quizId}`);
    revalidatePath(`/mentor/quiz/${input.quizId}/editor`);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz source mode transition failed", error);
    return { message: "Mode sumber Kuis tidak dapat diubah saat ini.", ok: false as const };
  }
}

async function bulkPublishStandaloneQuizzesAction(ids: string[]) {
  const session = await requireTutorSession();
  try {
    const result = await bulkPublishStandaloneQuizzes(ids, session.user.id);
    revalidateQuizPaths();
    return { affectedIds: result.ids, message: `${result.ids.length} quiz telah diterbitkan.`, ok: true as const, status: result.status };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz bulk publish failed", error);
    return { message: "Quiz tidak dapat diterbitkan saat ini. Coba lagi.", ok: false as const };
  }
}

async function bulkUnpublishStandaloneQuizzesAction(ids: string[]) {
  const session = await requireTutorSession();
  try {
    const result = await bulkUnpublishStandaloneQuizzes(ids, session.user.id);
    revalidateQuizPaths();
    return { affectedIds: result.ids, message: `${result.ids.length} quiz kembali menjadi draf.`, ok: true as const, status: result.status };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz bulk unpublish failed", error);
    return { message: "Status quiz tidak dapat diubah saat ini. Coba lagi.", ok: false as const };
  }
}

async function updateStandaloneQuizLifecycleAction(id: string, operation: "archive" | "restore") {
  const session = await requireTutorSession();
  try {
    const quiz = await updateStandaloneQuizLifecycle(id, session.user.id, operation);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz lifecycle mutation failed", error);
    return { message: "Status Quiz tidak dapat diubah saat ini. Coba lagi.", ok: false as const };
  }
}

export {
  acceptStandaloneQuizQuestionUpdateAction,
  bulkPublishStandaloneQuizzesAction,
  bulkUnpublishStandaloneQuizzesAction,
  importStandaloneQuizBankQuestionsAction,
  saveStandaloneQuizAction,
  transitionStandaloneQuizSourceModeAction,
  updateStandaloneQuizLifecycleAction,
};
