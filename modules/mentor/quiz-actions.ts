"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import {
  attachStandaloneQuizAssembly,
  bulkPublishStandaloneQuizzes,
  bulkUnpublishStandaloneQuizzes,
  detachStandaloneQuizAssembly,
  QuizValidationError,
  saveStandaloneQuiz,
  updateStandaloneQuizLifecycle,
  type SaveStandaloneQuizInput,
} from "@/lib/quiz/repository";
import { listReadyAssemblyRevisions } from "@/lib/tryout/assembly-repository";
import { AssemblyValidationError } from "@/lib/tryout/assembly-validation";

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
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz mutation failed", error);
    return { message: "Quiz tidak dapat disimpan saat ini. Coba lagi.", ok: false as const };
  }
}

async function listReadyKuisAssembliesAction() {
  await requireTutorSession();
  try {
    const result = await listReadyAssemblyRevisions();
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof AssemblyValidationError) return { message: error.message, ok: false as const };
    console.error("Kuis assembly listing failed", error);
    return { message: "Assembly soal tidak dapat dimuat saat ini.", ok: false as const };
  }
}

async function attachStandaloneQuizAssemblyAction(quizId: string, versionId: string) {
  const session = await requireTutorSession();
  try {
    const quiz = await attachStandaloneQuizAssembly(quizId, versionId, session.user.id);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz assembly attachment failed", error);
    return { message: "Assembly tidak dapat dipasang pada Kuis saat ini.", ok: false as const };
  }
}

async function detachStandaloneQuizAssemblyAction(quizId: string) {
  const session = await requireTutorSession();
  try {
    const quiz = await detachStandaloneQuizAssembly(quizId, session.user.id);
    revalidateQuizPaths();
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz assembly detach failed", error);
    return { message: "Assembly tidak dapat dilepas dari Kuis saat ini.", ok: false as const };
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
  attachStandaloneQuizAssemblyAction,
  bulkPublishStandaloneQuizzesAction,
  bulkUnpublishStandaloneQuizzesAction,
  detachStandaloneQuizAssemblyAction,
  listReadyKuisAssembliesAction,
  saveStandaloneQuizAction,
  updateStandaloneQuizLifecycleAction,
};
