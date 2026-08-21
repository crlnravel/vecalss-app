"use server";

import { revalidatePath } from "next/cache";
import { requireTutorSession } from "@/lib/auth/access";
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
  type SaveBankInput,
} from "@/lib/question-bank/repository";

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

type ExpectedUpdatedAtInput = { expectedUpdatedAt?: string };
type BankVersionInput = { expectedRevision?: number; expectedUpdatedAt?: string };
type BankMoveVersionInput = { expected: Record<string, BankVersionInput> };

async function createQuestionBankFolderAction(input: { name: string; parentId?: string | null }) {
  const session = await requireTutorSession();
  try { const result = await createQuestionBankFolder(input, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Folder tidak dapat dibuat saat ini." }; }
}

async function renameQuestionBankFolderAction(id: string, name: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await renameQuestionBankFolder(id, name, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Folder tidak dapat diubah saat ini." }; }
}

async function moveQuestionBankFolderAction(id: string, parentId: string | null, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await moveQuestionBankFolder(id, parentId, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Folder tidak dapat dipindahkan saat ini." }; }
}

async function removeQuestionBankFolderAction(id: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await removeQuestionBankFolder(id, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Folder tidak dapat dihapus saat ini." }; }
}

async function createQuestionBankCategoryAction(name: string) {
  const session = await requireTutorSession();
  try { const result = await createQuestionBankCategory(name, session.user.id); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Kategori tidak dapat dibuat saat ini." }; }
}

async function renameQuestionBankCategoryAction(id: string, name: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await renameQuestionBankCategory(id, name, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Kategori tidak dapat diubah saat ini." }; }
}

async function removeQuestionBankCategoryAction(id: string, options?: ExpectedUpdatedAtInput) {
  const session = await requireTutorSession();
  try { const result = await removeQuestionBankCategory(id, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Kategori tidak dapat dihapus saat ini." }; }
}

async function setQuestionBankCategoriesAction(bankId: string, categoryIds: string[], options: BankVersionInput) {
  const session = await requireTutorSession();
  try { const result = await setQuestionBankCategories(bankId, categoryIds, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Kategori Bank Soal tidak dapat diperbarui saat ini." }; }
}

async function assignQuestionBankCategoriesAction(bankId: string, categoryIds: string[], options: BankVersionInput) {
  const session = await requireTutorSession();
  try { const result = await assignQuestionBankCategories(bankId, categoryIds, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Kategori Bank Soal tidak dapat ditambahkan saat ini." }; }
}

async function removeQuestionBankCategoryAssignmentAction(bankId: string, categoryId: string, options: BankVersionInput) {
  const session = await requireTutorSession();
  try { const result = await removeQuestionBankCategoryAssignment(bankId, categoryId, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Kategori Bank Soal tidak dapat dilepas saat ini." }; }
}

async function moveQuestionBanksToFolderAction(bankIds: string[], folderId: string | null, options: BankMoveVersionInput) {
  const session = await requireTutorSession();
  try { const result = await moveQuestionBanksToFolder(bankIds, folderId, session.user.id, options); refresh(); return { ok: true as const, result }; }
  catch (error) { return { ok: false as const, message: error instanceof QuestionBankError ? error.message : "Bank Soal tidak dapat dipindahkan saat ini." }; }
}

async function listQuestionBankFoldersAction() {
  await requireTutorSession();
  return listQuestionBankFolders();
}

async function listQuestionBankFolderTreeAction() {
  await requireTutorSession();
  return listQuestionBankFolderTree();
}

async function getQuestionBankFolderPathAction(folderId: string | null) {
  await requireTutorSession();
  return getQuestionBankFolderPath(folderId);
}

async function listQuestionBankCategoriesAction() {
  await requireTutorSession();
  return listQuestionBankCategories();
}

async function listQuestionBankPageAction(options: ListQuestionBanksOptions & { page?: number; pageSize?: number } = {}) {
  await requireTutorSession();
  return listQuestionBankPage(options);
}

async function listQuestionBankSourcePageAction(options: ListQuestionBanksOptions & { page?: number; pageSize?: number } = {}) {
  await requireTutorSession();
  return listQuestionBankSourcePage(options);
}

async function listQuestionBankSourceQuestionsAction(bankId: string, options: { page?: number; pageSize?: number; search?: string; subjectCode?: string } = {}) {
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
};
