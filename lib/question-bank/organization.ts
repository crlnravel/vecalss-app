import "server-only";

import {
  ContentStatus,
  Prisma,
  QuestionBankPurpose,
} from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import type { QuestionBankReadiness } from "@/lib/question-bank/readiness";
import {
  LOCK_LEVEL,
  acquireDomainMutex,
  acquireEditKeys,
  bankOrganizationCategoriesMutexKey,
  bankOrganizationFoldersMutexKey,
  lockOrderedRows,
  setTransactionLockTimeout,
} from "@/lib/serialization/locks";

import { questionBankFolderLabel } from "./labels";
import {
  assertQuestionBankPurpose,
  questionBankNavigationLabel,
  questionBankPurposeLabel,
} from "./purpose";

const MAX_FOLDER_DEPTH = 512;
const MAX_AFFECTED_BANKS = 500;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QuestionBankErrorCode =
  | "archived_locked"
  | "invalid_input"
  | "invalid_lifecycle_transition"
  | "not_found"
  | "organization_fanout_too_large"
  | "question_retired"
  | "readiness_failed"
  | "stale_revision";

type QuestionBankErrorOptions = {
  attemptedInput?: unknown;
  code?: QuestionBankErrorCode;
  details?: Record<string, unknown>;
  readiness?: QuestionBankReadiness;
};

class QuestionBankError extends Error {
  readonly attemptedInput?: unknown;
  readonly code?: QuestionBankErrorCode;
  readonly details: Record<string, unknown>;
  readonly readiness?: QuestionBankReadiness;

  constructor(message: string, options: QuestionBankErrorOptions = {}) {
    super(message);
    this.name = "QuestionBankError";
    this.attemptedInput = options.attemptedInput;
    this.code = options.code;
    this.details = options.details ?? {};
    this.readiness = options.readiness;
  }
}
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
  purpose: QuestionBankPurpose;
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
  purpose: QuestionBankPurpose;
  updatedAt: Date;
};

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new QuestionBankOrganizationError(`${label} tidak valid.`);
  }
}

function normalizeName(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized)
    throw new QuestionBankOrganizationError(`${label} wajib diisi.`);
  if (normalized.length > maxLength) {
    throw new QuestionBankOrganizationError(`${label} terlalu panjang.`);
  }
  return normalized;
}

function normalizeExpectedUpdatedAt(
  options?: OrganizationMutationOptions | Date | string,
) {
  if (options === undefined) return undefined;
  const value =
    options instanceof Date || typeof options === "string"
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
    throw new QuestionBankOrganizationError(
      "Metadata telah diperbarui. Muat ulang lalu coba lagi.",
    );
  }
}

function assertExpectedBankVersion(
  bank: { revision: number; updatedAt: Date },
  options: BankMutationOptions | undefined,
) {
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);
  const expectedRevision = options?.expectedRevision;
  if (expectedUpdatedAt === undefined && expectedRevision === undefined) {
    throw new QuestionBankOrganizationError(
      "Versi Bank Soal wajib dikirim. Muat ulang lalu coba lagi.",
    );
  }
  if (
    expectedRevision !== undefined &&
    (!Number.isInteger(expectedRevision) || expectedRevision < 1)
  ) {
    throw new QuestionBankOrganizationError("Versi Bank Soal tidak valid.");
  }
  assertExpectedUpdatedAt(bank.updatedAt, expectedUpdatedAt);
  if (expectedRevision !== undefined && bank.revision !== expectedRevision) {
    throw new QuestionBankOrganizationError(
      "Bank Soal telah diperbarui. Muat ulang lalu coba lagi.",
    );
  }
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function rethrowOrganizationError(error: unknown): never {
  if (error instanceof QuestionBankOrganizationError) throw error;
  if (isUniqueViolation(error)) {
    throw new QuestionBankOrganizationError("Nama sudah digunakan");
  }
  throw error;
}

async function lockAllFolders(tx: Prisma.TransactionClient) {
  const folders = await tx.questionBankFolder.findMany({
    orderBy: [{ purpose: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      purpose: true,
      updatedAt: true,
    },
  });
  await lockOrderedRows(tx, LOCK_LEVEL.organization, folders.map((folder) => `${folder.purpose}:${folder.id}`), async (client, key) => {
    const [, id] = key.split(":");
    await client.$queryRaw`SELECT id FROM question_bank_folders WHERE id = ${id}::uuid FOR UPDATE`;
  });
  return folders;
}

async function lockAllCategories(tx: Prisma.TransactionClient) {
  const categories = await tx.questionBankCategory.findMany({ orderBy: { id: "asc" }, select: { id: true } });
  await lockOrderedRows(tx, LOCK_LEVEL.organization, categories.map((category) => `category:${category.id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM question_bank_categories WHERE id = ${key.slice("category:".length)}::uuid FOR UPDATE`;
  });
}

async function lockBanks(tx: Prisma.TransactionClient, ids: string[]) {
  const orderedIds = [...new Set(ids)].sort();
  if (!orderedIds.length) return;
  await lockOrderedRows(tx, LOCK_LEVEL.aggregate, orderedIds.map((id) => `bank:${id}`), async (client, key) => {
    await client.$queryRaw`SELECT id FROM question_banks WHERE id = ${key.slice("bank:".length)}::uuid FOR UPDATE`;
  });
}

async function prepareOrganizationTransaction(tx: Prisma.TransactionClient) {
  await setTransactionLockTimeout(tx);
}

async function lockBankClaims(tx: Prisma.TransactionClient, ids: readonly string[]) {
  await acquireEditKeys(tx, ids.map((resourceId) => ({ resourceId, resourceType: "question-bank" })));
}

function assertAffectedBankCount(ids: readonly string[]) {
  if (new Set(ids).size > MAX_AFFECTED_BANKS) {
    throw new QuestionBankOrganizationError("Operasi organisasi Bank Soal melebihi batas 500 Bank terdampak.", {
      code: "organization_fanout_too_large",
      details: { maxAffectedBanks: MAX_AFFECTED_BANKS },
    });
  }
}

function assertStableAffectedBankIds(expected: readonly string[], actual: readonly string[], label: string) {
  const expectedIds = [...new Set(expected)].sort();
  const actualIds = [...new Set(actual)].sort();
  if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
    throw new QuestionBankOrganizationError(`${label} berubah saat operasi organisasi dimulai. Muat ulang lalu coba lagi.`, {
      code: "invalid_input",
      details: { expectedBankIds: expectedIds, actualBankIds: actualIds },
    });
  }
}

async function revalidateFolderBankMembership(
  tx: Prisma.TransactionClient,
  folderId: string,
  purpose: QuestionBankPurpose,
  expectedBankIds: readonly string[],
) {
  const current = await tx.questionBank.findMany({
    where: { folderId, purpose },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  assertStableAffectedBankIds(expectedBankIds, current.map((bank) => bank.id), "Keanggotaan folder Bank Soal");
}

async function revalidateCategoryBankMembership(
  tx: Prisma.TransactionClient,
  categoryId: string,
  expectedBankIds: readonly string[],
) {
  const current = await tx.questionBankCategoryAssignment.findMany({
    where: { categoryId },
    orderBy: { questionBankId: "asc" },
    select: { questionBankId: true },
  });
  assertStableAffectedBankIds(expectedBankIds, current.map((assignment) => assignment.questionBankId), "Keanggotaan kategori Bank Soal");
}

function folderPathFromRows(
  folderId: string | null,
  rows: readonly FolderRow[],
  purpose?: QuestionBankPurpose,
): QuestionBankFolderBreadcrumb[] {
  const normalizedPurpose =
    purpose === undefined ? undefined : assertQuestionBankPurpose(purpose);
  if (folderId === null) {
    return [
      {
        id: null,
        name: normalizedPurpose
          ? questionBankNavigationLabel(normalizedPurpose)
          : questionBankFolderLabel(folderId),
      },
    ];
  }

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
    if (!row)
      throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
    if (normalizedPurpose && row.purpose !== normalizedPurpose) {
      throw new QuestionBankOrganizationError(
        `Folder tidak termasuk pohon Bank Soal ${questionBankPurposeLabel(normalizedPurpose)}.`,
      );
    }
    path.unshift({ id: row.id, name: row.name });
    currentId = row.parentId;
  }

  return path;
}

function folderDepth(
  folderId: string | null,
  rows: readonly FolderRow[],
): number {
  if (!folderId) return 0;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visited = new Set<string>();
  let depth = 0;
  let currentId: string | null = folderId;
  while (currentId) {
    if (visited.has(currentId) || depth >= MAX_FOLDER_DEPTH) {
      throw new QuestionBankOrganizationError(
        "Struktur folder terlalu dalam atau tidak valid.",
      );
    }
    visited.add(currentId);
    const row = byId.get(currentId);
    if (!row)
      throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
    depth += 1;
    currentId = row.parentId;
  }
  return depth;
}

function folderSubtreeHeight(
  folderId: string,
  rows: readonly FolderRow[],
): number {
  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const children = childrenByParent.get(row.parentId) ?? [];
    children.push(row.id);
    childrenByParent.set(row.parentId, children);
  }
  const visiting = new Set<string>();
  function visit(id: string): number {
    if (visiting.has(id))
      throw new QuestionBankOrganizationError("Struktur folder tidak valid.");
    visiting.add(id);
    const height = Math.max(
      0,
      ...(childrenByParent.get(id) ?? []).map((childId) => visit(childId) + 1),
    );
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
  purpose: QuestionBankPurpose;
  updatedAt: Date;
}): QuestionBankFolderDto {
  return {
    bankCount: row._count.banks,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    purpose: row.purpose,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function compareNames(
  a: { name: string; id: string | null },
  b: { name: string; id: string | null },
) {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    (a.id ?? "").localeCompare(b.id ?? "")
  );
}

function buildQuestionBankFolderTree(
  folders: readonly QuestionBankFolderDto[],
  options: {
    includeUnfiled?: boolean;
    purpose?: QuestionBankPurpose;
    unfiledBankCount?: number;
  } = {},
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
      name: options.purpose
        ? questionBankNavigationLabel(options.purpose)
        : questionBankFolderLabel(null),
      parentId: null,
      purpose: options.purpose ?? "quiz",
      updatedAt: "",
    });
  }
  return roots;
}

async function listQuestionBankFolders(purpose: QuestionBankPurpose) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  const [rows, counts] = await Promise.all([
    prisma.questionBankFolder.findMany({
      select: {
        createdAt: true,
        id: true,
        name: true,
        parentId: true,
        purpose: true,
        updatedAt: true,
      },
      where: { purpose: normalizedPurpose },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.questionBank.groupBy({
      by: ["folderId"],
      where: { purpose: normalizedPurpose },
      _count: { _all: true },
    }),
  ]);
  const countByFolderId = new Map(
    counts.flatMap((row) =>
      row.folderId ? [[row.folderId, row._count._all] as const] : [],
    ),
  );
  return rows.map((row) =>
    folderDto({
      ...row,
      _count: { banks: countByFolderId.get(row.id) ?? 0 },
    }),
  );
}

async function listQuestionBankFolderTree(purpose: QuestionBankPurpose) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  const [folders, unfiledBankCount] = await Promise.all([
    listQuestionBankFolders(normalizedPurpose),
    prisma.questionBank.count({
      where: { folderId: null, purpose: normalizedPurpose },
    }),
  ]);
  return buildQuestionBankFolderTree(folders, {
    includeUnfiled: true,
    purpose: normalizedPurpose,
    unfiledBankCount,
  });
}

async function getQuestionBankFolderPath(
  folderId: string | null,
  purpose: QuestionBankPurpose,
) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  if (folderId !== null) assertUuid(folderId, "Folder");
  const rows = await prisma.questionBankFolder.findMany({
    select: {
      id: true,
      name: true,
      parentId: true,
      purpose: true,
      updatedAt: true,
    },
    where: { purpose: normalizedPurpose },
  });
  return folderPathFromRows(folderId, rows, normalizedPurpose);
}

async function createQuestionBankFolder(
  input: {
    name: string;
    parentId?: string | null;
    purpose: QuestionBankPurpose;
  },
  actorId: string,
) {
  const normalizedPurpose = assertQuestionBankPurpose(input.purpose);
  const name = normalizeName(input.name, "Nama folder", 160);
  const parentId = input.parentId ?? null;
  if (parentId) assertUuid(parentId, "Folder induk");

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationFoldersMutexKey(normalizedPurpose));
      const folders = (await lockAllFolders(tx)).filter(
        (folder) => folder.purpose === normalizedPurpose,
      );
      if (parentId && !folders.some((folder) => folder.id === parentId)) {
        throw new QuestionBankOrganizationError(
          "Folder induk tidak ditemukan.",
        );
      }
      if (folderDepth(parentId, folders) + 1 > MAX_FOLDER_DEPTH) {
        throw new QuestionBankOrganizationError(
          "Struktur folder terlalu dalam.",
        );
      }
      const created = await tx.questionBankFolder.create({
        data: {
          createdByUserId: actorId,
          name,
          parentId,
          purpose: normalizedPurpose,
          updatedByUserId: actorId,
        },
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
  purpose: QuestionBankPurpose,
  options?: OrganizationMutationOptions | Date | string,
) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  assertUuid(id, "Folder");
  const name = normalizeName(nameInput, "Nama folder", 160);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationFoldersMutexKey(normalizedPurpose));
      const folders = (await lockAllFolders(tx)).filter(
        (folder) => folder.purpose === normalizedPurpose,
      );
      const current = folders.find((folder) => folder.id === id);
      if (!current)
        throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
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
  purpose: QuestionBankPurpose,
  options?: OrganizationMutationOptions | Date | string,
) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  assertUuid(id, "Folder");
  if (parentId) assertUuid(parentId, "Folder induk");
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationFoldersMutexKey(normalizedPurpose));
      const folders = (await lockAllFolders(tx)).filter(
        (folder) => folder.purpose === normalizedPurpose,
      );
      const current = folders.find((folder) => folder.id === id);
      if (!current)
        throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      if (parentId && !folders.some((folder) => folder.id === parentId)) {
        throw new QuestionBankOrganizationError(
          "Folder induk tidak ditemukan.",
        );
      }
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);
      if (parentId === id)
        throw new QuestionBankOrganizationError(
          "Folder tidak dapat dipindahkan ke dirinya sendiri.",
        );

      const byId = new Map(folders.map((folder) => [folder.id, folder]));
      const visited = new Set<string>();
      let ancestor = parentId;
      while (ancestor) {
        if (visited.has(ancestor) || visited.size >= MAX_FOLDER_DEPTH) {
          throw new QuestionBankOrganizationError(
            "Struktur folder terlalu dalam atau tidak valid.",
          );
        }
        visited.add(ancestor);
        if (ancestor === id)
          throw new QuestionBankOrganizationError(
            "Folder tidak dapat dipindahkan ke turunannya sendiri.",
          );
        ancestor = byId.get(ancestor)?.parentId ?? null;
      }
      if (
        folderDepth(parentId, folders) + folderSubtreeHeight(id, folders) >
        MAX_FOLDER_DEPTH
      ) {
        throw new QuestionBankOrganizationError(
          "Struktur folder terlalu dalam.",
        );
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
  purpose: QuestionBankPurpose,
  options?: OrganizationMutationOptions | Date | string,
) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  assertUuid(id, "Folder");
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(options);

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationFoldersMutexKey(normalizedPurpose));
      const affectedBanks = await tx.questionBank.findMany({ where: { folderId: id, purpose: normalizedPurpose }, select: { id: true }, orderBy: { id: "asc" } });
      assertAffectedBankCount(affectedBanks.map((bank) => bank.id));
      await lockBankClaims(tx, affectedBanks.map((bank) => bank.id));
      await revalidateFolderBankMembership(tx, id, normalizedPurpose, affectedBanks.map((bank) => bank.id));
      const folders = (await lockAllFolders(tx)).filter(
        (folder) => folder.purpose === normalizedPurpose,
      );
      const current = folders.find((folder) => folder.id === id);
      if (!current)
        throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);

      await lockBanks(tx, affectedBanks.map((bank) => bank.id));
      await tx.questionBank.updateMany({
        data: { folderId: current.parentId, updatedByUserId: actorId },
        where: { folderId: id, purpose: normalizedPurpose },
      });
      await tx.questionBankFolder.updateMany({
        data: { parentId: current.parentId, updatedByUserId: actorId },
        where: { parentId: id, purpose: normalizedPurpose },
      });
      await tx.questionBankFolder.delete({ where: { id } });
      return { id, parentId: current.parentId };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function listQuestionBankCategories(purpose: QuestionBankPurpose) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  const [rows, counts] = await Promise.all([
    prisma.questionBankCategory.findMany({
      select: { createdAt: true, id: true, name: true, updatedAt: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.questionBankCategoryAssignment.groupBy({
      by: ["categoryId"],
      where: { questionBank: { purpose: normalizedPurpose } },
      _count: { _all: true },
    }),
  ]);
  const countByCategoryId = new Map(
    counts.map((row) => [row.categoryId, row._count._all]),
  );
  return rows.map(
    (row) =>
      ({
        bankCount: countByCategoryId.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        name: row.name,
        updatedAt: row.updatedAt.toISOString(),
      }) satisfies QuestionBankCategoryDto,
  );
}

async function createQuestionBankCategory(nameInput: string, actorId: string) {
  const name = normalizeName(nameInput, "Nama kategori", 120);
  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationCategoriesMutexKey());
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
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationCategoriesMutexKey());
      await lockAllCategories(tx);
      const current = await tx.questionBankCategory.findUnique({
        where: { id },
      });
      if (!current)
        throw new QuestionBankOrganizationError("Kategori tidak ditemukan.");
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
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationCategoriesMutexKey());
      const affectedBanks = await tx.questionBankCategoryAssignment.findMany({ where: { categoryId: id }, select: { questionBankId: true }, orderBy: { questionBankId: "asc" } });
      const affectedBankIds = affectedBanks.map((assignment) => assignment.questionBankId);
      assertAffectedBankCount(affectedBankIds);
      await lockBankClaims(tx, affectedBankIds);
      await revalidateCategoryBankMembership(tx, id, affectedBankIds);
      await lockAllCategories(tx);
      await lockBanks(tx, affectedBankIds);
      const current = await tx.questionBankCategory.findUnique({
        where: { id },
      });
      if (!current)
        throw new QuestionBankOrganizationError("Kategori tidak ditemukan.");
      assertExpectedUpdatedAt(current.updatedAt, expectedUpdatedAt);
      await tx.questionBankCategoryAssignment.deleteMany({
        where: { categoryId: id },
      });
      await tx.questionBankCategory.delete({ where: { id } });
      return { id };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function setQuestionBankCategories(
  bankId: string,
  categoryIds: string[],
  actorId: string,
  options?: BankMutationOptions,
) {
  assertUuid(bankId, "Bank Soal");
  const uniqueCategoryIds = [...new Set(categoryIds)];
  uniqueCategoryIds.forEach((id) => assertUuid(id, "Kategori"));

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationCategoriesMutexKey());
      assertAffectedBankCount([bankId]);
      await lockBankClaims(tx, [bankId]);
      await lockAllCategories(tx);
      await lockBanks(tx, [bankId]);
      const bank = await tx.questionBank.findUnique({
        where: { id: bankId },
        select: { id: true, revision: true, status: true, updatedAt: true },
      });
      if (!bank)
        throw new QuestionBankOrganizationError("Bank Soal tidak ditemukan.");
      assertExpectedBankVersion(bank, options);
      if (bank.status === ContentStatus.archived)
        throw new QuestionBankOrganizationError(
          "Bank Soal yang diarsipkan tidak dapat dikategorikan.",
        );

      const categories = await tx.questionBankCategory.findMany({
        where: { id: { in: uniqueCategoryIds } },
        select: { id: true },
      });
      if (categories.length !== uniqueCategoryIds.length)
        throw new QuestionBankOrganizationError(
          "Sebagian kategori tidak ditemukan.",
        );
      await tx.questionBankCategoryAssignment.deleteMany({
        where: { questionBankId: bankId },
      });
      if (uniqueCategoryIds.length) {
        await tx.questionBankCategoryAssignment.createMany({
          data: uniqueCategoryIds.map((categoryId) => ({
            assignedByUserId: actorId,
            categoryId,
            questionBankId: bankId,
          })),
        });
      }
      const updated = await tx.questionBank.update({
        where: { id: bankId },
        data: { updatedByUserId: actorId },
        select: { revision: true, updatedAt: true },
      });
      return {
        bankId,
        categoryIds: uniqueCategoryIds,
        revision: updated.revision,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function assignQuestionBankCategories(
  bankId: string,
  categoryIds: string[],
  actorId: string,
  options?: BankMutationOptions,
) {
  assertUuid(bankId, "Bank Soal");
  const uniqueCategoryIds = [...new Set(categoryIds)];
  uniqueCategoryIds.forEach((id) => assertUuid(id, "Kategori"));

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationCategoriesMutexKey());
      assertAffectedBankCount([bankId]);
      await lockBankClaims(tx, [bankId]);
      await lockAllCategories(tx);
      await lockBanks(tx, [bankId]);
      const bank = await tx.questionBank.findUnique({
        where: { id: bankId },
        select: { id: true, revision: true, status: true, updatedAt: true },
      });
      if (!bank)
        throw new QuestionBankOrganizationError("Bank Soal tidak ditemukan.");
      assertExpectedBankVersion(bank, options);
      if (bank.status === ContentStatus.archived)
        throw new QuestionBankOrganizationError(
          "Bank Soal yang diarsipkan tidak dapat dikategorikan.",
        );
      const categories = await tx.questionBankCategory.findMany({
        where: { id: { in: uniqueCategoryIds } },
        select: { id: true },
      });
      if (categories.length !== uniqueCategoryIds.length)
        throw new QuestionBankOrganizationError(
          "Sebagian kategori tidak ditemukan.",
        );
      if (uniqueCategoryIds.length) {
        await tx.questionBankCategoryAssignment.createMany({
          data: uniqueCategoryIds.map((categoryId) => ({
            assignedByUserId: actorId,
            categoryId,
            questionBankId: bankId,
          })),
          skipDuplicates: true,
        });
      }
      const updated = await tx.questionBank.update({
        where: { id: bankId },
        data: { updatedByUserId: actorId },
        select: { revision: true, updatedAt: true },
      });
      return {
        bankId,
        categoryIds: uniqueCategoryIds,
        revision: updated.revision,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function removeQuestionBankCategoryAssignment(
  bankId: string,
  categoryId: string,
  actorId: string,
  options?: BankMutationOptions,
) {
  assertUuid(bankId, "Bank Soal");
  assertUuid(categoryId, "Kategori");
  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationCategoriesMutexKey());
      assertAffectedBankCount([bankId]);
      await lockBankClaims(tx, [bankId]);
      await lockAllCategories(tx);
      await lockBanks(tx, [bankId]);
      const bank = await tx.questionBank.findUnique({
        where: { id: bankId },
        select: { id: true, revision: true, status: true, updatedAt: true },
      });
      if (!bank)
        throw new QuestionBankOrganizationError("Bank Soal tidak ditemukan.");
      assertExpectedBankVersion(bank, options);
      if (bank.status === ContentStatus.archived)
        throw new QuestionBankOrganizationError(
          "Bank Soal yang diarsipkan tidak dapat dikategorikan.",
        );
      const category = await tx.questionBankCategory.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category)
        throw new QuestionBankOrganizationError("Kategori tidak ditemukan.");
      await tx.questionBankCategoryAssignment.deleteMany({
        where: { categoryId, questionBankId: bankId },
      });
      const updated = await tx.questionBank.update({
        where: { id: bankId },
        data: { updatedByUserId: actorId },
        select: { revision: true, updatedAt: true },
      });
      return {
        bankId,
        categoryId,
        revision: updated.revision,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  } catch (error) {
    return rethrowOrganizationError(error);
  }
}

async function moveQuestionBanksToFolder(
  bankIds: string[],
  folderId: string | null,
  actorId: string,
  purpose: QuestionBankPurpose,
  options?: BankMoveMutationOptions,
) {
  const normalizedPurpose = assertQuestionBankPurpose(purpose);
  const uniqueBankIds = [...new Set(bankIds)];
  if (!uniqueBankIds.length)
    throw new QuestionBankOrganizationError("Pilih minimal satu Bank Soal.");
  uniqueBankIds.forEach((id) => assertUuid(id, "Bank Soal"));
  if (folderId) assertUuid(folderId, "Folder");

  try {
    return await prisma.$transaction(async (tx) => {
      await prepareOrganizationTransaction(tx);
      await acquireDomainMutex(tx, bankOrganizationFoldersMutexKey(normalizedPurpose));
      assertAffectedBankCount(uniqueBankIds);
      await lockBankClaims(tx, uniqueBankIds);
      const folders = (await lockAllFolders(tx)).filter(
        (folder) => folder.purpose === normalizedPurpose,
      );
      if (folderId && !folders.some((folder) => folder.id === folderId))
        throw new QuestionBankOrganizationError("Folder tidak ditemukan.");
      await lockBanks(tx, uniqueBankIds);
      const banks = await tx.questionBank.findMany({
        where: { id: { in: uniqueBankIds } },
        select: {
          id: true,
          purpose: true,
          revision: true,
          status: true,
          updatedAt: true,
        },
      });
      if (banks.length !== uniqueBankIds.length)
        throw new QuestionBankOrganizationError(
          "Sebagian Bank Soal tidak ditemukan.",
        );
      if (banks.some((bank) => bank.purpose !== normalizedPurpose)) {
        throw new QuestionBankOrganizationError(
          `Bank Soal hanya dapat dipindahkan di pohon Bank Soal ${questionBankPurposeLabel(normalizedPurpose)}.`,
        );
      }
      banks.forEach((bank) =>
        assertExpectedBankVersion(bank, options?.expected?.[bank.id]),
      );
      if (banks.some((bank) => bank.status === ContentStatus.archived))
        throw new QuestionBankOrganizationError(
          "Bank Soal yang diarsipkan tidak dapat dipindahkan.",
        );
      await tx.questionBank.updateMany({
        data: { folderId, updatedByUserId: actorId },
        where: { id: { in: uniqueBankIds }, purpose: normalizedPurpose },
      });
      const updatedBanks = await tx.questionBank.findMany({
        where: { id: { in: uniqueBankIds }, purpose: normalizedPurpose },
        select: { id: true, revision: true, updatedAt: true },
      });
      return {
        bankIds: uniqueBankIds,
        folderId,
        versions: updatedBanks.map((bank) => ({
          id: bank.id,
          revision: bank.revision,
          updatedAt: bank.updatedAt.toISOString(),
        })),
      };
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
  QuestionBankErrorCode,
};
