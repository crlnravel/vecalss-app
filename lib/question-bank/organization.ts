import "server-only";

import { ContentStatus, Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

import { questionBankFolderLabel } from "./labels";

const MAX_FOLDER_DEPTH = 512;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class QuestionBankError extends Error {}
const QuestionBankOrganizationError = QuestionBankError;

type OrganizationMutationOptions = {
  expectedUpdatedAt?: Date | string;
};

type BankMutationOptions = {
  expectedRevision?: number;
  expectedUpdatedAt?: Date | string;
};

type BankMoveMutationOptions = {
  expected: Record<string, BankMutationOptions>;
};

type QuestionBankFolderDto = {
  bankCount: number;
  children?: QuestionBankFolderDto[];
  createdAt: string;
  id: string | null;
  name: string;
  parentId: string | null;
  updatedAt: string;
};

type QuestionBankFolderBreadcrumb = {
  id: string | null;
  name: string;
};

type QuestionBankCategoryDto = {
  bankCount: number;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: Date;
};

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new QuestionBankOrganizationError(`${label} tidak valid.`);
  }
}

function normalizeName(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new QuestionBankOrganizationError(`${label} wajib diisi.`);
  if (normalized.length > maxLength) {
    throw new QuestionBankOrganizationError(`${label} terlalu panjang.`);
  }
  return normalized;
}

function normalizeExpectedUpdatedAt(options?: OrganizationMutationOptions | Date | string) {
  if (options === undefined) return undefined;
  const value = options instanceof Date || typeof options === "string"
    ? options
    : options.expectedUpdatedAt;
  if (value === undefined) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new QuestionBankOrganizationError("Versi metadata tidak valid.");
  }
  return parsed;
}

function assertExpectedUpdatedAt(actual: Date, expected: Date | undefined) {
  if (expected && actual.getTime() !== expected.getTime()) {
    throw new QuestionBankOrganizationError("Metadata telah diperbarui. Muat ulang lalu coba lagi.");
  }
}

function assertExpectedBankVersion(
  bank: { revision: number; updatedAt: Date },
  options: BankMutationOptions | undefined,
) {
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);
  const expectedRevision = options?.expectedRevision;
  if (expectedUpdatedAt === undefined && expectedRevision === undefined) {
    throw new QuestionBankOrganizationError("Versi Bank Soal wajib dikirim. Muat ulang lalu coba lagi.");
  }
  if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) {
    throw new QuestionBankOrganizationError("Versi Bank Soal tidak valid.");
  }
  assertExpectedUpdatedAt(bank.updatedAt, expectedUpdatedAt);
  if (expectedRevision !== undefined && bank.revision !== expectedRevision) {
    throw new QuestionBankOrganizationError("Bank Soal telah diperbarui. Muat ulang lalu coba lagi.");
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function rethrowOrganizationError(error: unknown): never {
  if (error instanceof QuestionBankOrganizationError) throw error;
  if (isUniqueViolation(error)) {
    throw new QuestionBankOrganizationError("Nama sudah digunakan pada tingkat yang sama.");
  }
  throw error;
}

async function lockAllFolders(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM question_bank_folders ORDER BY id FOR UPDATE`;
  return tx.questionBankFolder.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, parentId: true, updatedAt: true },
  });
}

async function lockAllCategories(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM question_bank_categories ORDER BY id FOR UPDATE`;
}

async function lockBanks(tx: Prisma.TransactionClient, ids: string[]) {
  const orderedIds = [...new Set(ids)].sort();
  if (!orderedIds.length) return;
  await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ANY(${orderedIds}::uuid[]) ORDER BY id FOR UPDATE`;
}

function folderPathFromRows(folderId: string | null, rows: readonly FolderRow[]): QuestionBankFolderBreadcrumb[] {
  if (folderId === null) return [{ id: null, name: questionBankFolderLabel(folderId) }];

  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: QuestionBankFolderBreadcrumb[] = [];
  const visited = new Set<string>();
  let currentId: string | null = folderId;

  while (currentId) {
    if (visited.has(currentId) || path.length >= MAX_FOLDER_DEPTH) {
      throw new QuestionBankOrganizationError("Struktur folder tidak valid.");
    }
    visited.add(currentId);
    const row = byId.get(currentId);
    if (!row) throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
    path.unshift({ id: row.id, name: row.name });
    currentId = row.parentId;
  }

  return path;
}

function folderDepth(folderId: string | null, rows: readonly FolderRow[]): number {
  if (!folderId) return 0;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visited = new Set<string>();
  let depth = 0;
  let currentId: string | null = folderId;
  while (currentId) {
    if (visited.has(currentId) || depth >= MAX_FOLDER_DEPTH) {
      throw new QuestionBankOrganizationError("Struktur folder terlalu dalam atau tidak valid.");
    }
    visited.add(currentId);
    const row = byId.get(currentId);
    if (!row) throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
    depth += 1;
    currentId = row.parentId;
  }
  return depth;
}

function folderSubtreeHeight(folderId: string, rows: readonly FolderRow[]): number {
  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const children = childrenByParent.get(row.parentId) ?? [];
    children.push(row.id);
    childrenByParent.set(row.parentId, children);
  }
  const visiting = new Set<string>();
  function visit(id: string): number {
    if (visiting.has(id)) throw new QuestionBankOrganizationError("Struktur folder tidak valid.");
    visiting.add(id);
    const height = Math.max(0, ...(childrenByParent.get(id) ?? []).map((childId) => visit(childId) + 1));
    visiting.delete(id);
    return height;
  }
  return visit(folderId) + 1;
}

function folderDto(row: {
  _count: { banks: number };
  createdAt: Date;
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: Date;
}): QuestionBankFolderDto {
  return {
    bankCount: row._count.banks,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function compareNames(a: { name: string; id: string | null }, b: { name: string; id: string | null }) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || (a.id ?? "").localeCompare(b.id ?? "");
}

function buildQuestionBankFolderTree(
  folders: readonly QuestionBankFolderDto[],
  options: { includeUnfiled?: boolean; unfiledBankCount?: number } = {},
) {
  const nodes = new Map<string, QuestionBankFolderDto>();
  for (const folder of folders) {
    if (folder.id) nodes.set(folder.id, { ...folder, children: [] });
  }

  const roots: QuestionBankFolderDto[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children?.push(node);
    else roots.push(node);
  }

  const sortTree = (node: QuestionBankFolderDto) => {
    node.children?.sort(compareNames);
    node.children?.forEach(sortTree);
    if (!node.children?.length) delete node.children;
  };
  roots.sort(compareNames).forEach(sortTree);

  if (options.includeUnfiled) {
    roots.unshift({
      bankCount: options.unfiledBankCount ?? 0,
      children: [],
      createdAt: "",
      id: null,
      name: questionBankFolderLabel(null),
      parentId: null,
      updatedAt: "",
    });
  }
  return roots;
}

async function listQuestionBankFolders() {
  const rows = await prisma.questionBankFolder.findMany({
    include: { _count: { select: { banks: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map(folderDto);
}

async function listQuestionBankFolderTree() {
  const [folders, unfiledBankCount] = await Promise.all([
    listQuestionBankFolders(),
    prisma.questionBank.count({ where: { folderId: null } }),
  ]);
  return buildQuestionBankFolderTree(folders, { includeUnfiled: true, unfiledBankCount });
}

async function getQuestionBankFolderPath(folderId: string | null) {
  if (folderId !== null) assertUuid(folderId, "Folder");
  const rows = await prisma.questionBankFolder.findMany({
    select: { id: true, name: true, parentId: true, updatedAt: true },
  });
  return folderPathFromRows(folderId, rows);
}

async function createQuestionBankFolder(
  input: { name: string; parentId?: string | null },
  actorId: string,
) {
  const name = normalizeName(input.name, "Nama folder", 160);
  const parentId = input.parentId ?? null;
  if (parentId) assertUuid(parentId, "Folder induk");

  try {
    return await prisma.$transaction(async (tx) => {
      const folders = await lockAllFolders(tx);
      if (parentId && !folders.some((folder) => folder.id === parentId)) {
        throw new QuestionBankOrganizationError("Folder induk tidak ditemukan.");
      }
      if (folderDepth(parentId, folders) + 1 > MAX_FOLDER_DEPTH) {
        throw new QuestionBankOrganizationError("Struktur folder terlalu dalam.");
      }
      const created = await tx.questionBankFolder.create({
        data: { createdByUserId: actorId, name, parentId, updatedByUserId: actorId },
        include: { _count: { select: { banks: true } } },
      });
      return folderDto(created);
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function renameQuestionBankFolder(
  id: string,
  nameInput: string,
  actorId: string,
  options?: OrganizationMutationOptions | Date | string,
) {
  assertUuid(id, "Folder");
  const name = normalizeName(nameInput, "Nama folder", 160);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllFolders(tx);
      const current = await tx.questionBankFolder.findUnique({ where: { id } });
      if (!current) throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);
      const updated = await tx.questionBankFolder.update({
        where: { id },
        data: { name, updatedByUserId: actorId },
        include: { _count: { select: { banks: true } } },
      });
      return folderDto(updated);
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function moveQuestionBankFolder(
  id: string,
  parentId: string | null,
  actorId: string,
  options?: OrganizationMutationOptions | Date | string,
) {
  assertUuid(id, "Folder");
  if (parentId) assertUuid(parentId, "Folder induk");
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      const folders = await lockAllFolders(tx);
      const current = folders.find((folder) => folder.id === id);
      if (!current) throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      if (parentId && !folders.some((folder) => folder.id === parentId)) {
        throw new QuestionBankOrganizationError("Folder induk tidak ditemukan.");
      }
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);
      if (parentId === id) throw new QuestionBankOrganizationError("Folder tidak dapat dipindahkan ke dirinya sendiri.");

      const byId = new Map(folders.map((folder) => [folder.id, folder]));
      const visited = new Set<string>();
      let ancestor = parentId;
      while (ancestor) {
        if (visited.has(ancestor) || visited.size >= MAX_FOLDER_DEPTH) {
          throw new QuestionBankOrganizationError("Struktur folder terlalu dalam atau tidak valid.");
        }
        visited.add(ancestor);
        if (ancestor === id) throw new QuestionBankOrganizationError("Folder tidak dapat dipindahkan ke turunannya sendiri.");
        ancestor = byId.get(ancestor)?.parentId ?? null;
      }
      if (folderDepth(parentId, folders) + folderSubtreeHeight(id, folders) > MAX_FOLDER_DEPTH) {
        throw new QuestionBankOrganizationError("Struktur folder terlalu dalam.");
      }

      const updated = await tx.questionBankFolder.update({
        where: { id },
        data: { parentId, updatedByUserId: actorId },
        include: { _count: { select: { banks: true } } },
      });
      return folderDto(updated);
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function removeQuestionBankFolder(
  id: string,
  actorId: string,
  options?: OrganizationMutationOptions | Date | string,
) {
  assertUuid(id, "Folder");
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      const folders = await lockAllFolders(tx);
      const current = folders.find((folder) => folder.id === id);
      if (!current) throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);

      await tx.$queryRaw`SELECT id FROM question_banks ORDER BY id FOR UPDATE`;
      await tx.questionBank.updateMany({
        data: { folderId: current.parentId, updatedByUserId: actorId },
        where: { folderId: id },
      });
      await tx.questionBankFolder.updateMany({
        data: { parentId: current.parentId, updatedByUserId: actorId },
        where: { parentId: id },
      });
      await tx.questionBankFolder.delete({ where: { id } });
      return { id, parentId: current.parentId };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function listQuestionBankCategories() {
  const rows = await prisma.questionBankCategory.findMany({
    include: { _count: { select: { banks: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    bankCount: row._count.banks,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    updatedAt: row.updatedAt.toISOString(),
  } satisfies QuestionBankCategoryDto));
}

async function createQuestionBankCategory(nameInput: string, actorId: string) {
  const name = normalizeName(nameInput, "Nama kategori", 120);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllCategories(tx);
      const created = await tx.questionBankCategory.create({
        data: { createdByUserId: actorId, name, updatedByUserId: actorId },
        include: { _count: { select: { banks: true } } },
      });
      return {
        bankCount: created._count.banks,
        createdAt: created.createdAt.toISOString(),
        id: created.id,
        name: created.name,
        updatedAt: created.updatedAt.toISOString(),
      } satisfies QuestionBankCategoryDto;
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function renameQuestionBankCategory(
  id: string,
  nameInput: string,
  actorId: string,
  options?: OrganizationMutationOptions | Date | string,
) {
  assertUuid(id, "Kategori");
  const name = normalizeName(nameInput, "Nama kategori", 120);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllCategories(tx);
      const current = await tx.questionBankCategory.findUnique({ where: { id } });
      if (!current) throw new QuestionBankOrganizationError("Kategori tidak ditemukan.");
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);
      const updated = await tx.questionBankCategory.update({
        where: { id },
        data: { name, updatedByUserId: actorId },
        include: { _count: { select: { banks: true } } },
      });
      return {
        bankCount: updated._count.banks,
        createdAt: updated.createdAt.toISOString(),
        id: updated.id,
        name: updated.name,
        updatedAt: updated.updatedAt.toISOString(),
      } satisfies QuestionBankCategoryDto;
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function removeQuestionBankCategory(
  id: string,
  actorId: string,
  options?: OrganizationMutationOptions | Date | string,
) {
  assertUuid(id, "Kategori");
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllCategories(tx);
      const current = await tx.questionBankCategory.findUnique({ where: { id } });
      if (!current) throw new QuestionBankOrganizationError("Kategori tidak ditemukan.");
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);
      await tx.questionBankCategoryAssignment.deleteMany({ where: { categoryId: id } });
      await tx.questionBankCategory.delete({ where: { id } });
      return { id };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function setQuestionBankCategories(bankId: string, categoryIds: string[], actorId: string, options?: BankMutationOptions) {
  assertUuid(bankId, "Bank Soal");
  const uniqueCategoryIds = [...new Set(categoryIds)];
  uniqueCategoryIds.forEach((id) => assertUuid(id, "Kategori"));

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllCategories(tx);
      await lockBanks(tx, [bankId]);
      const bank = await tx.questionBank.findUnique({ where: { id: bankId }, select: { id: true, revision: true, status: true, updatedAt: true } });
      if (!bank) throw new QuestionBankOrganizationError("Bank Soal tidak ditemukan.");
      assertExpectedBankVersion(bank, options);
      if (bank.status === ContentStatus.archived) throw new QuestionBankOrganizationError("Bank Soal yang diarsipkan tidak dapat dikategorikan.");

      const categories = await tx.questionBankCategory.findMany({ where: { id: { in: uniqueCategoryIds } }, select: { id: true } });
      if (categories.length !== uniqueCategoryIds.length) throw new QuestionBankOrganizationError("Sebagian kategori tidak ditemukan.");
      await tx.questionBankCategoryAssignment.deleteMany({ where: { questionBankId: bankId } });
      if (uniqueCategoryIds.length) {
        await tx.questionBankCategoryAssignment.createMany({
          data: uniqueCategoryIds.map((categoryId) => ({ assignedByUserId: actorId, categoryId, questionBankId: bankId })),
        });
      }
      const updated = await tx.questionBank.update({ where: { id: bankId }, data: { updatedByUserId: actorId }, select: { revision: true, updatedAt: true } });
      return { bankId, categoryIds: uniqueCategoryIds, revision: updated.revision, updatedAt: updated.updatedAt.toISOString() };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function assignQuestionBankCategories(bankId: string, categoryIds: string[], actorId: string, options?: BankMutationOptions) {
  assertUuid(bankId, "Bank Soal");
  const uniqueCategoryIds = [...new Set(categoryIds)];
  uniqueCategoryIds.forEach((id) => assertUuid(id, "Kategori"));

  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllCategories(tx);
      await lockBanks(tx, [bankId]);
      const bank = await tx.questionBank.findUnique({ where: { id: bankId }, select: { id: true, revision: true, status: true, updatedAt: true } });
      if (!bank) throw new QuestionBankOrganizationError("Bank Soal tidak ditemukan.");
      assertExpectedBankVersion(bank, options);
      if (bank.status === ContentStatus.archived) throw new QuestionBankOrganizationError("Bank Soal yang diarsipkan tidak dapat dikategorikan.");
      const categories = await tx.questionBankCategory.findMany({ where: { id: { in: uniqueCategoryIds } }, select: { id: true } });
      if (categories.length !== uniqueCategoryIds.length) throw new QuestionBankOrganizationError("Sebagian kategori tidak ditemukan.");
      if (uniqueCategoryIds.length) {
        await tx.questionBankCategoryAssignment.createMany({
          data: uniqueCategoryIds.map((categoryId) => ({ assignedByUserId: actorId, categoryId, questionBankId: bankId })),
          skipDuplicates: true,
        });
      }
      const updated = await tx.questionBank.update({ where: { id: bankId }, data: { updatedByUserId: actorId }, select: { revision: true, updatedAt: true } });
      return { bankId, categoryIds: uniqueCategoryIds, revision: updated.revision, updatedAt: updated.updatedAt.toISOString() };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function removeQuestionBankCategoryAssignment(bankId: string, categoryId: string, actorId: string, options?: BankMutationOptions) {
  assertUuid(bankId, "Bank Soal");
  assertUuid(categoryId, "Kategori");
  try {
    return await prisma.$transaction(async (tx) => {
      await lockAllCategories(tx);
      await lockBanks(tx, [bankId]);
      const bank = await tx.questionBank.findUnique({ where: { id: bankId }, select: { id: true, revision: true, status: true, updatedAt: true } });
      if (!bank) throw new QuestionBankOrganizationError("Bank Soal tidak ditemukan.");
      assertExpectedBankVersion(bank, options);
      if (bank.status === ContentStatus.archived) throw new QuestionBankOrganizationError("Bank Soal yang diarsipkan tidak dapat dikategorikan.");
      const category = await tx.questionBankCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
      if (!category) throw new QuestionBankOrganizationError("Kategori tidak ditemukan.");
      await tx.questionBankCategoryAssignment.deleteMany({ where: { categoryId, questionBankId: bankId } });
      const updated = await tx.questionBank.update({ where: { id: bankId }, data: { updatedByUserId: actorId }, select: { revision: true, updatedAt: true } });
      return { bankId, categoryId, revision: updated.revision, updatedAt: updated.updatedAt.toISOString() };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function moveQuestionBanksToFolder(bankIds: string[], folderId: string | null, actorId: string, options?: BankMoveMutationOptions) {
  const uniqueBankIds = [...new Set(bankIds)];
  if (!uniqueBankIds.length) throw new QuestionBankOrganizationError("Pilih minimal satu Bank Soal.");
  uniqueBankIds.forEach((id) => assertUuid(id, "Bank Soal"));
  if (folderId) assertUuid(folderId, "Folder");

  try {
    return await prisma.$transaction(async (tx) => {
      const folders = await lockAllFolders(tx);
      if (folderId && !folders.some((folder) => folder.id === folderId)) throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      await lockBanks(tx, uniqueBankIds);
      const banks = await tx.questionBank.findMany({ where: { id: { in: uniqueBankIds } }, select: { id: true, revision: true, status: true, updatedAt: true } });
      if (banks.length !== uniqueBankIds.length) throw new QuestionBankOrganizationError("Sebagian Bank Soal tidak ditemukan.");
      banks.forEach((bank) => assertExpectedBankVersion(bank, options?.expected?.[bank.id]));
      if (banks.some((bank) => bank.status === ContentStatus.archived)) throw new QuestionBankOrganizationError("Bank Soal yang diarsipkan tidak dapat dipindahkan.");
      await tx.questionBank.updateMany({ data: { folderId, updatedByUserId: actorId }, where: { id: { in: uniqueBankIds } } });
      const updatedBanks = await tx.questionBank.findMany({ where: { id: { in: uniqueBankIds } }, select: { id: true, revision: true, updatedAt: true } });
      return { bankIds: uniqueBankIds, folderId, versions: updatedBanks.map((bank) => ({ id: bank.id, revision: bank.revision, updatedAt: bank.updatedAt.toISOString() })) };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

export {
  assignQuestionBankCategories,
  buildQuestionBankFolderTree,
  createQuestionBankCategory,
  createQuestionBankFolder,
  folderPathFromRows,
  getQuestionBankFolderPath,
  listQuestionBankCategories,
  listQuestionBankFolderTree,
  listQuestionBankFolders,
  moveQuestionBankFolder,
  moveQuestionBanksToFolder,
  normalizeExpectedUpdatedAt,
  QuestionBankOrganizationError,
  QuestionBankError,
  removeQuestionBankCategory,
  removeQuestionBankCategoryAssignment,
  removeQuestionBankFolder,
  renameQuestionBankCategory,
  renameQuestionBankFolder,
  setQuestionBankCategories,
  questionBankFolderLabel,
};
export type {
  OrganizationMutationOptions,
  BankMutationOptions,
  BankMoveMutationOptions,
  QuestionBankCategoryDto,
  QuestionBankFolderBreadcrumb,
  QuestionBankFolderDto,
};
