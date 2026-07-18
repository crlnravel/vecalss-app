"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import { QuizValidationError, saveStandaloneQuiz, type SaveStandaloneQuizInput } from "@/lib/quiz/repository";

async function saveStandaloneQuizAction(input: SaveStandaloneQuizInput) {
  const session = await requireTutorSession();
  try {
    const quiz = await saveStandaloneQuiz(input, session.user.id);
    revalidatePath("/mentor/quiz");
    revalidatePath(`/mentor/quiz/${quiz.id}`);
    revalidatePath("/quiz");
    revalidatePath("/quiz/[slug]", "page");
    revalidatePath("/quiz/[slug]/[quizSlug]", "page");
    return { ok: true as const, quiz };
  } catch (error) {
    if (error instanceof QuizValidationError) return { message: error.message, ok: false as const };
    console.error("Standalone quiz mutation failed", error);
    return { message: "Quiz tidak dapat disimpan saat ini. Coba lagi.", ok: false as const };
  }
}

export { saveStandaloneQuizAction };
