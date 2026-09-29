import "server-only";

import { randomUUID } from "node:crypto";
import { MediaLibraryScope, type Prisma } from "@/generated/prisma/client";
import { acquireBannerMediaMutationLock } from "@/lib/banner/media-safety";
import { prisma } from "@/lib/prisma";
import { setTransactionLockTimeout } from "@/lib/serialization/locks";

import { renameQuestionBankMediaFolderIfUnchanged } from "@/lib/media/repository";
import { QuestionBankError } from "./organization";

const MEDIA_FOLDER_NAME_LIMIT = 160;
const QUESTION_BANK_MEDIA_FOLDER_PREFIX = "Bank Soal — ";
const QUESTION_BANK_DRAFT_MEDIA_FOLDER_PREFIX = "Bank Soal — Draf ";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MediaFolderIdentity = { id: string; name: string };
type NewKaptenRootFolderIdentity = MediaFolderIdentity & { updatedAt: Date };

type QuestionBankMediaFolderReservationDto = {
  id: string;
  mediaFolderId: string;
  provisionalName: string;
};

function safeFolderText(value: string) {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function truncateFolderText(value: string, maxLength: number) {
  let result = "";
  for (const character of value) {
    if (result.length + character.length > maxLength) break;
    result += character;
  }
  return result;
}

function normalizeFolderName(value: string) {
  const name = safeFolderText(value);
  if (!name) {
    throw new QuestionBankError("Nama folder Media tidak boleh kosong.", { code: "invalid_input" });
  }
  if (name.length > MEDIA_FOLDER_NAME_LIMIT) {
    throw new QuestionBankError("Nama folder Media terlalu panjang.", { code: "invalid_input" });
  }
  return name;
}

function withSuffix(baseName: string, suffix: string) {
  const safeSuffix = safeFolderText(suffix);
  const separator = " · ";
  const availableBaseLength = MEDIA_FOLDER_NAME_LIMIT - separator.length - safeSuffix.length;
  const prefix = truncateFolderText(baseName, availableBaseLength).trimEnd();
  return normalizeFolderName(`${prefix}${separator}${safeSuffix}`);
}

function titleFolderName(title: string) {
  const cleanTitle = safeFolderText(title) || "Bank Soal";
  return normalizeFolderName(
    `${QUESTION_BANK_MEDIA_FOLDER_PREFIX}${truncateFolderText(
      cleanTitle,
      MEDIA_FOLDER_NAME_LIMIT - QUESTION_BANK_MEDIA_FOLDER_PREFIX.length,
    )}`,
  );
}

function bankFolderNameCandidates(title: string, bankCode: string, bankId: string) {
  const baseName = titleFolderName(title);
  const shortCode = bankCode.replace(/[^a-z0-9]/gi, "").slice(-12) || bankId.slice(0, 8);
  return [
    baseName,
    withSuffix(baseName, shortCode),
    withSuffix(baseName, `${shortCode}-${bankId.replaceAll("-", "").slice(0, 8)}`),
    withSuffix(baseName, `${shortCode}-${bankId.replaceAll("-", "").slice(0, 16)}`),
  ];
}

function draftFolderNameCandidates(reservationId: string, preferredName?: string) {
  const compactId = reservationId.replaceAll("-", "");
  const baseName = normalizeFolderName(
    preferredName ?? `${QUESTION_BANK_DRAFT_MEDIA_FOLDER_PREFIX}${compactId.slice(0, 8)}`,
  );
  return [
    baseName,
    withSuffix(baseName, compactId.slice(8, 16)),
    withSuffix(baseName, compactId.slice(8, 24)),
    withSuffix(baseName, compactId),
  ];
}

function requireReservationId(value: string | undefined) {
  if (value === undefined) return randomUUID();
  if (!UUID_PATTERN.test(value)) {
    throw new QuestionBankError("Folder Media untuk draf tidak valid.", { code: "invalid_input" });
  }
  return value;
}

async function createKaptenRootFolder(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  candidates: readonly string[],
): Promise<NewKaptenRootFolderIdentity> {
  for (const candidate of [...new Set(candidates)]) {
    const name = normalizeFolderName(candidate);
    const duplicate = await tx.mediaFolder.findFirst({
      select: { id: true },
      where: {
        libraryScope: MediaLibraryScope.kapten,
        name: { equals: name, mode: "insensitive" },
        parentId: null,
        trashedAt: null,
      },
    });
    if (duplicate) continue;

    const folder = await tx.mediaFolder.create({
      data: {
        createdByUserId: actorUserId,
        libraryScope: MediaLibraryScope.kapten,
        name,
        parentId: null,
      },
      select: { id: true, name: true, updatedAt: true },
    });
    return folder;
  }

  throw new QuestionBankError("Folder Media Bank Soal belum dapat dibuat. Coba lagi.", {
    code: "invalid_input",
  });
}

async function beginMediaFolderMutation(tx: Prisma.TransactionClient) {
  await setTransactionLockTimeout(tx);
  await acquireBannerMediaMutationLock(tx);
}

async function activeKaptenFolder(tx: Prisma.TransactionClient, folderId: string) {
  return tx.mediaFolder.findFirst({
    select: { id: true, name: true },
    where: {
      id: folderId,
      libraryScope: MediaLibraryScope.kapten,
      trashedAt: null,
    },
  });
}

async function assertReservationFolderIsUnassociated(
  tx: Prisma.TransactionClient,
  folderId: string,
) {
  const bank = await tx.questionBank.findFirst({
    select: { id: true },
    where: { mediaFolderId: folderId },
  });
  if (bank) {
    throw new QuestionBankError("Folder Media ini sudah terhubung ke Bank Soal lain.", {
      code: "invalid_input",
    });
  }
}

/**
 * Creates an unreserved Bank Media folder for a manually created Bank. The
 * caller links the returned folder ID while saving the Bank aggregate.
 */
async function createQuestionBankMediaFolder(
  actorUserId: string,
  title: string,
  bankCode: string,
  bankId: string,
): Promise<NewKaptenRootFolderIdentity> {
  return prisma.$transaction(async (tx) => {
    await beginMediaFolderMutation(tx);
    return createKaptenRootFolder(
      tx,
      actorUserId,
      bankFolderNameCandidates(title, bankCode, bankId),
    );
  });
}

/**
 * Soft-deletes only the unchanged, empty root folder created for a failed
 * manual Bank save. Draft reservation folders use a separate lifecycle.
 */
async function cleanupFailedManualQuestionBankMediaFolder(
  folder: NewKaptenRootFolderIdentity,
) {
  return prisma.$transaction(async (tx) => {
    await beginMediaFolderMutation(tx);
    await tx.$queryRaw`
      SELECT id
      FROM media_folders
      WHERE id = ${folder.id}::uuid
      FOR UPDATE
    `;

    const unchangedEmptyRoot = await tx.mediaFolder.findFirst({
      select: { id: true },
      where: {
        id: folder.id,
        libraryScope: MediaLibraryScope.kapten,
        name: folder.name,
        parentId: null,
        trashedAt: null,
        updatedAt: folder.updatedAt,
        assets: { none: {} },
        children: { none: {} },
        questionBank: { is: null },
        questionBankMediaFolderReservation: { is: null },
      },
    });
    if (!unchangedEmptyRoot) return false;

    const trashed = await tx.mediaFolder.updateMany({
      data: { trashedAt: new Date() },
      where: {
        id: folder.id,
        libraryScope: MediaLibraryScope.kapten,
        name: folder.name,
        parentId: null,
        trashedAt: null,
        updatedAt: folder.updatedAt,
      },
    });
    return trashed.count === 1;
  });
}

/**
 * Creates or reuses the owner-bound provisional folder for a local new-Bank
 * draft. Pass a stable caller-generated ID to make the first request retryable;
 * use the returned ID for later confirmed draft imports.
 */
async function reserveDraftQuestionBankMediaFolder(
  ownerUserId: string,
  requestedReservationId?: string,
): Promise<QuestionBankMediaFolderReservationDto> {
  const reservationId = requireReservationId(requestedReservationId);

  return prisma.$transaction(async (tx) => {
    await beginMediaFolderMutation(tx);
    await tx.$queryRaw`
      SELECT id
      FROM question_bank_media_folder_reservations
      WHERE id = ${reservationId}::uuid
      FOR UPDATE
    `;

    const current = await tx.questionBankMediaFolderReservation.findUnique({
      where: { id: reservationId },
    });
    if (current) {
      if (current.ownerUserId !== ownerUserId) {
        throw new QuestionBankError("Folder Media untuk draf tidak ditemukan.", { code: "not_found" });
      }
      if (current.adoptedBankId) {
        throw new QuestionBankError("Folder Media ini sudah digunakan oleh Bank Soal.", { code: "invalid_input" });
      }

      const existingFolder = await tx.mediaFolder.findUnique({
        select: { id: true, libraryScope: true, name: true, trashedAt: true },
        where: { id: current.mediaFolderId },
      });
      if (!existingFolder) {
        throw new QuestionBankError("Folder Media untuk draf tidak tersedia. Mulai kembali impor gambar.", {
          code: "not_found",
        });
      }

      if (
        existingFolder.libraryScope === MediaLibraryScope.kapten
        && existingFolder.trashedAt === null
      ) {
        await assertReservationFolderIsUnassociated(tx, existingFolder.id);
        return {
          id: current.id,
          mediaFolderId: current.mediaFolderId,
          provisionalName: current.provisionalName,
        };
      }

      await assertReservationFolderIsUnassociated(tx, existingFolder.id);
      const preserveKaptenName = existingFolder.name !== current.provisionalName;
      const replacement = await createKaptenRootFolder(
        tx,
        ownerUserId,
        draftFolderNameCandidates(
          reservationId,
          preserveKaptenName ? existingFolder.name : current.provisionalName,
        ),
      );
      const updated = await tx.questionBankMediaFolderReservation.update({
        data: {
          mediaFolderId: replacement.id,
          provisionalName: preserveKaptenName ? current.provisionalName : replacement.name,
        },
        select: { id: true, mediaFolderId: true, provisionalName: true },
        where: { id: current.id },
      });
      return updated;
    }

    const folder = await createKaptenRootFolder(
      tx,
      ownerUserId,
      draftFolderNameCandidates(reservationId),
    );
    return tx.questionBankMediaFolderReservation.create({
      data: {
        id: reservationId,
        mediaFolderId: folder.id,
        ownerUserId,
        provisionalName: folder.name,
      },
      select: { id: true, mediaFolderId: true, provisionalName: true },
    });
  });
}

async function getAdoptedQuestionBankMediaFolderReservation(
  ownerUserId: string,
  reservationId: string,
) {
  const reservation = await prisma.questionBankMediaFolderReservation.findUnique({
    select: { adoptedBankId: true, ownerUserId: true },
    where: { id: reservationId },
  });
  if (!reservation || reservation.ownerUserId !== ownerUserId) {
    throw new QuestionBankError("Folder Media untuk draf tidak ditemukan.", { code: "not_found" });
  }
  return reservation.adoptedBankId;
}

async function lockQuestionBankMediaFolderForSave(
  tx: Prisma.TransactionClient,
  mediaFolderId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM media_folders
    WHERE id = ${mediaFolderId}::uuid
      AND library_scope = 'kapten'::media_library_scope
      AND trashed_at IS NULL
    FOR UPDATE
  `;
  if (rows.length !== 1) {
    throw new QuestionBankError("Folder Media Bank Soal sudah tidak tersedia. Coba simpan lagi.", {
      code: "invalid_input",
    });
  }
}

async function adoptQuestionBankMediaFolderReservation(
  tx: Prisma.TransactionClient,
  input: {
    bankId: string;
    mediaFolderId: string;
    ownerUserId: string;
    reservationId: string;
  },
) {
  await tx.$queryRaw`
    SELECT id
    FROM question_bank_media_folder_reservations
    WHERE id = ${input.reservationId}::uuid
    FOR UPDATE
  `;
  const reservation = await tx.questionBankMediaFolderReservation.findUnique({
    where: { id: input.reservationId },
  });
  if (!reservation || reservation.ownerUserId !== input.ownerUserId) {
    throw new QuestionBankError("Folder Media untuk draf tidak ditemukan.", { code: "not_found" });
  }
  if (reservation.mediaFolderId !== input.mediaFolderId) {
    throw new QuestionBankError("Folder Media draf berubah. Muat ulang draf lalu coba lagi.", {
      code: "stale_revision",
    });
  }
  if (reservation.adoptedBankId && reservation.adoptedBankId !== input.bankId) {
    throw new QuestionBankError("Folder Media ini sudah digunakan oleh Bank Soal lain.", {
      code: "invalid_input",
    });
  }

  const linkedBank = await tx.questionBank.findFirst({
    select: { id: true },
    where: { mediaFolderId: input.mediaFolderId },
  });
  if (linkedBank && linkedBank.id !== input.bankId) {
    throw new QuestionBankError("Folder Media ini sudah terhubung ke Bank Soal lain.", {
      code: "invalid_input",
    });
  }

  if (reservation.adoptedBankId !== input.bankId) {
    await tx.questionBankMediaFolderReservation.update({
      data: { adoptedBankId: input.bankId },
      where: { id: reservation.id },
    });
  }
}

async function assertQuestionBankMediaFolderReservationForBank(
  ownerUserId: string,
  reservationId: string,
  bankId: string,
) {
  const reservation = await prisma.questionBankMediaFolderReservation.findUnique({
    select: { adoptedBankId: true, ownerUserId: true },
    where: { id: reservationId },
  });
  if (!reservation || reservation.ownerUserId !== ownerUserId) {
    throw new QuestionBankError("Folder Media untuk draf tidak ditemukan.", { code: "not_found" });
  }
  if (reservation.adoptedBankId !== bankId) {
    throw new QuestionBankError("Folder Media ini tidak terhubung ke Bank Soal yang dipilih.", {
      code: "invalid_input",
    });
  }
}

/**
 * Lazily associates an existing Bank with an active Kapten root folder. A
 * trashed folder is replaced by a new identity; its existing assets stay put.
 */
async function ensureQuestionBankMediaFolder(
  bankId: string,
  actorUserId: string,
): Promise<MediaFolderIdentity> {
  return prisma.$transaction(async (tx) => {
    await beginMediaFolderMutation(tx);
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${bankId}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({
      select: { code: true, id: true, mediaFolderId: true, name: true },
      where: { id: bankId },
    });
    if (!bank) {
      throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
    }

    const reservation = await tx.questionBankMediaFolderReservation.findUnique({
      where: { adoptedBankId: bankId },
    });

    if (bank.mediaFolderId) {
      const associatedFolder = await tx.mediaFolder.findUnique({
        select: { id: true, libraryScope: true, name: true, trashedAt: true },
        where: { id: bank.mediaFolderId },
      });
      if (
        associatedFolder
        && associatedFolder.libraryScope === MediaLibraryScope.kapten
        && associatedFolder.trashedAt === null
      ) {
        if (reservation && reservation.mediaFolderId !== associatedFolder.id) {
          await tx.questionBankMediaFolderReservation.update({
            data: { mediaFolderId: associatedFolder.id },
            where: { id: reservation.id },
          });
        }
        return { id: associatedFolder.id, name: associatedFolder.name };
      }
    } else if (reservation) {
      const reservedFolder = await activeKaptenFolder(tx, reservation.mediaFolderId);
      if (reservedFolder) {
        await tx.questionBank.update({
          data: { mediaFolderId: reservedFolder.id },
          where: { id: bank.id },
        });
        return reservedFolder;
      }
    }

    const oldFolderId = bank.mediaFolderId ?? reservation?.mediaFolderId;
    const oldFolder = oldFolderId
      ? await tx.mediaFolder.findUnique({
        select: { libraryScope: true, name: true, trashedAt: true },
        where: { id: oldFolderId },
      })
      : null;
    const defaultNames = bankFolderNameCandidates(bank.name, bank.code, bank.id);
    const oldNameIsGenerated = oldFolder?.name
      ? defaultNames.some((name) => name.toLocaleLowerCase() === oldFolder.name.toLocaleLowerCase())
      : false;
    const candidates = oldFolder?.name && !oldNameIsGenerated
      ? [oldFolder.name, ...defaultNames]
      : defaultNames;
    const replacement = await createKaptenRootFolder(tx, actorUserId, candidates);

    await tx.questionBank.update({
      data: { mediaFolderId: replacement.id },
      where: { id: bank.id },
    });
    if (reservation) {
      await tx.questionBankMediaFolderReservation.update({
        data: { mediaFolderId: replacement.id },
        where: { id: reservation.id },
      });
    }
    return replacement;
  });
}

/** Renames an adopted draft folder only while it still has its generated name. */
async function finalizeQuestionBankMediaFolderReservation(
  bankId: string,
  actorUserId: string,
) {
  const reservation = await prisma.questionBankMediaFolderReservation.findFirst({
    include: {
      adoptedBank: { select: { code: true, id: true, mediaFolderId: true, name: true } },
    },
    where: { adoptedBankId: bankId, ownerUserId: actorUserId },
  });
  if (!reservation?.adoptedBank || reservation.adoptedBank.mediaFolderId !== reservation.mediaFolderId) {
    return;
  }

  await renameQuestionBankMediaFolderIfUnchanged({
    candidateNames: bankFolderNameCandidates(
      reservation.adoptedBank.name,
      reservation.adoptedBank.code,
      reservation.adoptedBank.id,
    ),
    bankCode: reservation.adoptedBank.code,
    bankId: reservation.adoptedBank.id,
    bankName: reservation.adoptedBank.name,
    expectedName: reservation.provisionalName,
    folderId: reservation.mediaFolderId,
  });
}

export {
  adoptQuestionBankMediaFolderReservation,
  assertQuestionBankMediaFolderReservationForBank,
  createQuestionBankMediaFolder,
  cleanupFailedManualQuestionBankMediaFolder,
  ensureQuestionBankMediaFolder,
  finalizeQuestionBankMediaFolderReservation,
  getAdoptedQuestionBankMediaFolderReservation,
  lockQuestionBankMediaFolderForSave,
  reserveDraftQuestionBankMediaFolder,
};
export type {
  MediaFolderIdentity,
  NewKaptenRootFolderIdentity,
  QuestionBankMediaFolderReservationDto,
};
