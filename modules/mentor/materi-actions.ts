"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import {
  MateriValidationError,
  publishMateriLesson,
  reorderMateriSubject,
  returnMateriLessonToDraft,
  saveMateriLesson,
  unpublishMateriLesson,
  type SaveMateriLessonInput,
} from "@/lib/materi/repository";
import { toKaptenMateriEditorView } from "@/modules/mentor/materi-view-model";

type MateriActionResult =
  | { fieldErrors?: Partial<Record<"duration" | "position" | "subjectSlug" | "title" | "topicCode" | "videoUrl", string>>; message: string; ok: false }
  | { lesson: NonNullable<ReturnType<typeof toKaptenMateriEditorView>>; message: string; ok: true };

function revalidateMateriPaths(subjectSlug: string, code: string) {
  revalidatePath("/mentor/dashboard");
  revalidatePath("/mentor/materi");
  revalidatePath("/mentor/materi/subject/[subjectSlug]", "page");
  revalidatePath(`/mentor/materi/subject/${subjectSlug}`);
  revalidatePath("/mentor/materi/[materiId]", "page");
  revalidatePath(`/mentor/materi/${code}`);
  revalidatePath("/courses");
  revalidatePath("/courses/[slug]", "page");
  revalidatePath("/courses/[slug]/[lessonId]", "page");
  revalidatePath(`/courses/${subjectSlug}`);
  revalidatePath(`/courses/${subjectSlug}/${code}`);
}

function failedResult(error: unknown): Extract<MateriActionResult, { ok: false }> {
  if (error instanceof MateriValidationError) {
    return { fieldErrors: error.fieldErrors, message: error.message, ok: false };
  }

  console.error("Materi mutation failed", error);
  return { message: "Lesson tidak dapat disimpan saat ini. Coba lagi.", ok: false };
}

async function saveMateriLessonAction(input: SaveMateriLessonInput): Promise<MateriActionResult> {
  // Authorization is intentionally outside the catch: requireTutorSession
  // redirects by throwing a Next control-flow sentinel, which must reach the
  // framework instead of becoming a structured mutation failure.
  const session = await requireTutorSession();
  try {
    const lesson = await saveMateriLesson(input, session.user.id);
    const view = toKaptenMateriEditorView(lesson);
    if (!view) throw new Error("Lesson tersimpan tetapi tidak dapat dimuat ulang.");
    revalidateMateriPaths(view.subjectSlug, view.code);
    return { lesson: view, message: lesson.lifecycleStatus === "published" ? "Perubahan terbit telah disimpan." : "Draf tersimpan.", ok: true };
  } catch (error) {
    return failedResult(error);
  }
}

async function publishMateriLessonAction(code: string): Promise<MateriActionResult> {
  const session = await requireTutorSession();
  try {
    const lesson = await publishMateriLesson(code, session.user.id);
    const view = toKaptenMateriEditorView(lesson);
    if (!view) throw new Error("Lesson diterbitkan tetapi tidak dapat dimuat ulang.");
    revalidateMateriPaths(view.subjectSlug, view.code);
    return { lesson: view, message: "Lesson telah diterbitkan dan tersedia untuk siswa.", ok: true };
  } catch (error) {
    return failedResult(error);
  }
}

async function unpublishMateriLessonAction(code: string): Promise<MateriActionResult> {
  const session = await requireTutorSession();
  try {
    const lesson = await unpublishMateriLesson(code, session.user.id);
    const view = toKaptenMateriEditorView(lesson);
    if (!view) throw new Error("Status lesson tidak dapat dimuat ulang.");
    revalidateMateriPaths(view.subjectSlug, view.code);
    return { lesson: view, message: "Penerbitan lesson dibatalkan. Lesson kembali menjadi draf.", ok: true };
  } catch (error) {
    return failedResult(error);
  }
}

async function returnMateriLessonToDraftAction(code: string): Promise<MateriActionResult> {
  const session = await requireTutorSession();
  try {
    const lesson = await returnMateriLessonToDraft(code, session.user.id);
    const view = toKaptenMateriEditorView(lesson);
    if (!view) throw new Error("Status lesson tidak dapat dimuat ulang.");
    revalidateMateriPaths(view.subjectSlug, view.code);
    return { lesson: view, message: "Lesson dikembalikan ke draf. Konten dan urutannya tetap sama.", ok: true };
  } catch (error) {
    return failedResult(error);
  }
}

async function reorderMateriSubjectAction(subjectSlug: string, orderedCodes: string[]) {
  const session = await requireTutorSession();
  try {
    const order = await reorderMateriSubject(subjectSlug, orderedCodes, session.user.id);
    revalidateMateriPaths(subjectSlug, "");
    return { message: "Urutan Materi telah disimpan.", ok: true as const, order };
  } catch (error) {
    return failedResult(error);
  }
}

export {
  publishMateriLessonAction,
  reorderMateriSubjectAction,
  returnMateriLessonToDraftAction,
  saveMateriLessonAction,
  unpublishMateriLessonAction,
};
