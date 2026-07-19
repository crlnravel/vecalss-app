"use server";

import { revalidatePath } from "next/cache";
import { requireTutorSession } from "@/lib/auth/access";
import { deleteQuestionBank, QuestionBankError, saveQuestionBank, updateQuestionBankLifecycle, type SaveBankInput } from "@/lib/question-bank/repository";

function refresh() {
  revalidatePath("/mentor/quiz/question-bank");
  revalidatePath("/mentor/quiz", "layout");
  revalidatePath("/mentor/tryout", "layout");
}

async function saveQuestionBankAction(input: SaveBankInput) {
  const session = await requireTutorSession();
  try { const result = await saveQuestionBank(input, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Bank Soal tidak dapat disimpan saat ini." }; }
}

async function updateQuestionBankLifecycleAction(id: string, operation: "publish" | "unpublish" | "archive" | "restore") {
  const session = await requireTutorSession();
  try { const result = await updateQuestionBankLifecycle(id, operation, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Status Bank Soal tidak dapat diubah saat ini." }; }
}

async function deleteQuestionBankAction(id: string) {
  await requireTutorSession();
  try { const result = await deleteQuestionBank(id); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Bank Soal tidak dapat dihapus saat ini." }; }
}

export { deleteQuestionBankAction, saveQuestionBankAction, updateQuestionBankLifecycleAction };
