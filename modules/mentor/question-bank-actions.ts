"use server";

import { revalidatePath } from "next/cache";
import { requireTutorSession } from "@/lib/auth/access";
import type { QuestionBankPurpose } from "@/generated/prisma/client";
import {
  assignQuestionBankCategories,
  createQuestionBankCategory,
  createQuestionBankFolder,
  deleteQuestionBank,
  getQuestionBankFolderPath,
  listQuestionBankCategories,
  listQuestionBankFolderTree,
  listQuestionBankFolders,
  listQuestionBankPage,
  listQuestionBankSourcePage,
  listQuestionBankSourceQuestions,
  moveQuestionBankFolder,
  moveQuestionBanksToFolder,
  QuestionBankError,
  removeQuestionBankCategory,
  removeQuestionBankCategoryAssignment,
  removeQuestionBankFolder,
  renameQuestionBankCategory,
  renameQuestionBankFolder,
  saveQuestionBank,
  setQuestionBankCategories,
  updateQuestionBankLifecycle,
  type ListQuestionBanksOptions,
  type ListQuestionBankSourceOptions,
  type ListQuestionBankSourceQuestionsOptions,
  updateQuestionRevisionLifecycle,
  type SaveBankInput,
  type QuestionRevisionLifecycleStatus,
  type QuestionRevisionLifecycleOptions,
  type QuestionBankLifecycleOptions,
  type QuestionBankErrorCode,
} from "@/lib/question-bank/repository";
import type { QuestionBankReadiness } from "@/lib/question-bank/readiness";

function refresh() {
  revalidatePath("/mentor/quiz/question-bank");
  revalidatePath("/mentor/quiz", "layout");
  revalidatePath("/mentor/tryout", "layout");
}

type QuestionBankActionFailure = {
  attemptedInput?: unknown;
  code: QuestionBankErrorCode | "unknown";
  details?: Record<string, unknown>;
  message: string;
  ok: false;
  readiness?: QuestionBankReadiness;
};

function questionBankActionFailure(error: unknown, fallback: string): QuestionBankActionFailure {
  if (!(error instanceof QuestionBankError)) {
    return { code: "unknown", message: fallback, ok: false };
  }
  return {
    ...(error.attemptedInput === undefined ? {} : { attemptedInput: error.attemptedInput }),
    code: error.code ?? "unknown",
    ...(Object.keys(error.details).length ? { details: error.details } : {}),
    message: error.message,
    ok: false,
    ...(error.readiness === undefined ? {} : { readiness: error.readiness }),
  };
}

async function saveQuestionBankAction(input: SaveBankInput) {
  const session = await requireTutorSession();
  try { const result = await saveQuestionBank(input, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Bank Soal tidak dapat disimpan saat ini."); }
}

async function updateQuestionBankLifecycleAction(id: string, operation: "publish" | "unpublish" | "archive" | "restore", options: QuestionBankLifecycleOptions) {
  const session = await requireTutorSession();
  try { const result = await updateQuestionBankLifecycle(id, operation, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Status Bank Soal tidak dapat diubah saat ini."); }
}

async function updateQuestionRevisionLifecycleAction(id: string, status: QuestionRevisionLifecycleStatus, options: QuestionRevisionLifecycleOptions) {
  const session = await requireTutorSession();
  try {
    const result = await updateQuestionRevisionLifecycle(id, status, session.user.id, options);
    refresh();
    return { ok: true as const, result };
  } catch (error) {
    return questionBankActionFailure(error, "Status revisi soal tidak dapat diubah saat ini.");
  }
}

async function deleteQuestionBankAction(id: string) {
  const session = await requireTutorSession();
  try { const result = await deleteQuestionBank(id, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Bank Soal tidak dapat dihapus saat ini."); }
}

type ExpectedUpdatedAtInput = { expectedUpdatedAt?: string };
type BankVersionInput = { expectedRevision?: number; expectedUpdatedAt?: string };
type BankMoveVersionInput = { expected: Record<string, BankVersionInput> };

async function createQuestionBankFolderAction(input: { name: string; parentId?: string | null }) {
  const session = await requireTutorSession();
  try { const result = await createQuestionBankFolder(input, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Folder tidak dapat dibuat saat ini."); }
}

async function renameQuestionBankFolderAction(id: string, name: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await renameQuestionBankFolder(id, name, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Folder tidak dapat diubah saat ini."); }
}

async function moveQuestionBankFolderAction(id: string, parentId: string | null, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await moveQuestionBankFolder(id, parentId, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Folder tidak dapat dipindahkan saat ini."); }
}

async function removeQuestionBankFolderAction(id: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await removeQuestionBankFolder(id, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Folder tidak dapat dihapus saat ini."); }
}

async function createQuestionBankCategoryAction(name: string) {
  const session = await requireTutorSession();
  try { const result = await createQuestionBankCategory(name, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Kategori tidak dapat dibuat saat ini."); }
}

async function renameQuestionBankCategoryAction(id: string, name: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await renameQuestionBankCategory(id, name, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Kategori tidak dapat diubah saat ini."); }
}

async function removeQuestionBankCategoryAction(id: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await removeQuestionBankCategory(id, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Kategori tidak dapat dihapus saat ini."); }
}

async function setQuestionBankCategoriesAction(bankId: string, categoryIds: string[], options: BankVersionInput) {
  const session = await requireTutorSession();
  try { const result = await setQuestionBankCategories(bankId, categoryIds, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Kategori Bank Soal tidak dapat diperbarui saat ini."); }
}

async function assignQuestionBankCategoriesAction(bankId: string, categoryIds: string[], options: BankVersionInput) {
  const session = await requireTutorSession();
  try { const result = await assignQuestionBankCategories(bankId, categoryIds, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Kategori Bank Soal tidak dapat ditambahkan saat ini."); }
}

async function removeQuestionBankCategoryAssignmentAction(bankId: string, categoryId: string, options: BankVersionInput) {
  const session = await requireTutorSession();
  try { const result = await removeQuestionBankCategoryAssignment(bankId, categoryId, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Kategori Bank Soal tidak dapat dilepas saat ini."); }
}

async function moveQuestionBanksToFolderAction(bankIds: string[], folderId: string | null, options: BankMoveVersionInput) {
  const session = await requireTutorSession();
  try { const result = await moveQuestionBanksToFolder(bankIds, folderId, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return questionBankActionFailure(error, "Bank Soal tidak dapat dipindahkan saat ini."); }
}

async function listQuestionBankFoldersAction(purpose: QuestionBankPurpose) {
  await requireTutorSession();
  return listQuestionBankFolders(purpose);
}

async function listQuestionBankFolderTreeAction(purpose: QuestionBankPurpose) {
  await requireTutorSession();
  return listQuestionBankFolderTree(purpose);
}

async function getQuestionBankFolderPathAction(folderId: string | null) {
  await requireTutorSession();
  return getQuestionBankFolderPath(folderId);
}

async function listQuestionBankCategoriesAction(purpose: QuestionBankPurpose) {
  await requireTutorSession();
  return listQuestionBankCategories(purpose);
}

async function listQuestionBankPageAction(options: ListQuestionBanksOptions & { page?: number; pageSize?: number } = {}) {
  await requireTutorSession();
  return listQuestionBankPage(options);
}

async function listQuestionBankSourcePageAction(options: ListQuestionBankSourceOptions & { page?: number; pageSize?: number }) {
  await requireTutorSession();
  return listQuestionBankSourcePage(options);
}

async function listQuestionBankSourceQuestionsAction(bankId: string, options: ListQuestionBankSourceQuestionsOptions) {
  await requireTutorSession();
  return listQuestionBankSourceQuestions(bankId, options);
}

export {
  assignQuestionBankCategoriesAction,
  createQuestionBankCategoryAction,
  createQuestionBankFolderAction,
  deleteQuestionBankAction,
  getQuestionBankFolderPathAction,
  listQuestionBankCategoriesAction,
  listQuestionBankFolderTreeAction,
  listQuestionBankFoldersAction,
  listQuestionBankPageAction,
  listQuestionBankSourcePageAction,
  listQuestionBankSourceQuestionsAction,
  moveQuestionBankFolderAction,
  moveQuestionBanksToFolderAction,
  removeQuestionBankCategoryAction,
  removeQuestionBankCategoryAssignmentAction,
  removeQuestionBankFolderAction,
  renameQuestionBankCategoryAction,
  renameQuestionBankFolderAction,
  saveQuestionBankAction,
  setQuestionBankCategoriesAction,
  updateQuestionBankLifecycleAction,
  updateQuestionRevisionLifecycleAction,
};
