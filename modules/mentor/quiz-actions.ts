"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import { serverLogger } from "@/lib/server-logger";
import type { AuthoringEditLease } from "@/lib/serialization/authoring-lease";
import {
  acceptStandaloneQuizQuestionUpdate,
  getMentorStandaloneQuiz,
  importStandaloneQuizBankQuestionSnapshots,
  QuizValidationError,
  saveStandaloneQuiz,
  setStandaloneQuizHidden,
  transitionStandaloneQuizSourceMode,
  updateStandaloneQuizLifecycle,
  type AcceptStandaloneQuizQuestionUpdateInput,
  type ImportStandaloneQuizBankQuestionSnapshotsInput,
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
    serverLogger.error("mentor.quiz.mutation.failed", error, {
      area: "mentor.quiz",
      operation: "save_quiz",
    });
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
    serverLogger.error("mentor.quiz.question_update_acceptance.failed", error, {
      area: "mentor.quiz",
      operation: "accept_question_update",
    });
    return { message: "Revisi soal tidak dapat diterapkan saat ini. Coba lagi.", ok: false as const };
  }
}

async function importStandaloneQuizBankQuestionSnapshotsAction(
  input: ImportStandaloneQuizBankQuestionSnapshotsInput,
) {
  const session = await requireTutorSession();
  try {
    const result = await importStandaloneQuizBankQuestionSnapshots(
      input,
      session.user.id,
    );
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof QuizValidationError)
      return { message: error.message, ok: false as const };
    serverLogger.error("mentor.quiz.bank_snapshot_import.failed", error, {
      area: "mentor.quiz",
      operation: "import_bank_snapshots",
    });
    return {
      message: "Soal dari Bank Soal Kuis tidak dapat disiapkan saat ini. Coba lagi.",
      ok: false as const,
    };
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
    serverLogger.error("mentor.quiz.source_mode_transition.failed", error, {
      area: "mentor.quiz",
      operation: "transition_source_mode",
    });
    return { message: "Mode sumber Kuis tidak dapat diubah saat ini.", ok: false as const };
  }
}

async function updateStandaloneQuizLifecycleAction(
  id: string,
  editLease?: AuthoringEditLease,
) {
  const session = await requireTutorSession();
  try {
    const quiz = await updateStandaloneQuizLifecycle(id, session.user.id, editLease);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    serverLogger.error("mentor.quiz.lifecycle_mutation.failed", error, {
      area: "mentor.quiz",
      operation: "update_lifecycle",
    });
    return { message: "Kuis tidak dapat diarsipkan saat ini. Coba lagi.", ok: false as const };
  }
}

async function setStandaloneQuizHiddenAction(
  id: string,
  isHidden: boolean,
  editLease?: AuthoringEditLease,
) {
  const session = await requireTutorSession();
  try {
    const quiz = await setStandaloneQuizHidden(
      id,
      isHidden,
      session.user.id,
      editLease,
    );
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError)
      return { message: error.message, ok: false as const };
    serverLogger.error("mentor.quiz.visibility_mutation.failed", error, {
      area: "mentor.quiz",
      operation: "set_visibility",
    });
    return {
      message: "Kuis belum dapat disembunyikan atau ditampilkan lagi saat ini. Coba lagi.",
      ok: false as const,
    };
  }
}

export {
  acceptStandaloneQuizQuestionUpdateAction,
  importStandaloneQuizBankQuestionSnapshotsAction,
  saveStandaloneQuizAction,
  setStandaloneQuizHiddenAction,
  transitionStandaloneQuizSourceModeAction,
  updateStandaloneQuizLifecycleAction,
};
