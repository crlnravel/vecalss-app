"use server";

import { revalidatePath } from "next/cache";
import { requireTutorSession } from "@/lib/auth/access";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import { EditLeaseServiceError } from "@/lib/resource-edit-lock/service";
import {
  manageMentorDashboardQuiz,
  type QuizDashboardMutation,
} from "@/lib/quiz/mentor-dashboard-repository";
import { QuizValidationError } from "@/lib/quiz/repository";

export async function manageQuizDashboardAction(
  ids: string[],
  action: QuizDashboardMutation,
) {
  const session = await requireTutorSession();
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 50 ||
    ids.some((id) => typeof id !== "string" || !isUuid(id)) ||
    !["hide", "show", "archive", "delete"].includes(action)
  ) {
    return {
      succeeded: [] as string[],
      failed: [{ id: "", message: "Pilih kuis yang ingin diubah." }],
    };
  }
  const succeeded: string[] = [],
    failed: { id: string; message: string }[] = [];
  for (const id of new Set(ids)) {
    try {
      await manageMentorDashboardQuiz(session.user.id, id, action);
      succeeded.push(id);
      revalidatePath(`/mentor/quiz/${id}`);
    } catch (error) {
      failed.push({
        id,
        message:
          error instanceof EditLeaseServiceError
            ? "Kuis sedang dibuka di editor. Tutup editor sebelum mencoba lagi."
            : error instanceof QuizValidationError
              ? error.message
              : "Kuis belum berhasil diubah. Coba lagi.",
      });
    }
  }
  if (succeeded.length) {
    revalidatePath("/mentor/quiz");
    revalidatePath("/quiz");
    revalidatePath("/quiz/[slug]", "page");
    revalidatePath("/quiz/[slug]/[quizSlug]", "page");
  }
  return { succeeded, failed };
}
