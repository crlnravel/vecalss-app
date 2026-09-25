import "server-only";

import { randomUUID, createHash } from "node:crypto";

import {
  Prisma,
  QuestionBankXlsxImportAttemptState,
} from "@/generated/prisma/client";
import {
  createPrivateStagingUploadUrl,
  deletePrivateStagingObjects,
  headMediaObject,
  PrivateStagingObjectTooLargeError,
  putPrivateStagingObject,
  readPrivateStagingObject,
} from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";
import {
  QUESTION_BANK_XLSX_LIMITS,
  QUESTION_BANK_XLSX_MIME_TYPE,
} from "./xlsx-limits";
import type {
  QuestionBankXlsxPreviewImageIndex,
  QuestionBankXlsxPreviewImagePayload,
  QuestionBankXlsxPreviewManifest,
} from "./xlsx-contract";

const STAGING_ROOT = "question-bank-xlsx-staging";
const MANIFEST_MIME_TYPE = "application/json";
const MAX_MANIFEST_BYTES = QUESTION_BANK_XLSX_LIMITS.totalExpandedZipBytes;
const CLEANUP_RETRY_DELAY_MS = 60_000;
const CLEANUP_BATCH_SIZE = 20;
const PRIVATE_STAGING_KEY_PATTERN =
  /^question-bank-xlsx-staging\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:workbook\.xlsx|manifest\.json|images\/[0-9a-f]{64}\.bin)$/iu;

type QuestionBankXlsxImportErrorCode =
  | "attempt_busy"
  | "attempt_expired"
  | "attempt_invalid"
  | "attempt_not_found"
  | "attempt_unavailable"
  | "xlsx_too_large"
  | "xlsx_upload_missing";

class QuestionBankXlsxImportError extends Error {
  constructor(readonly code: QuestionBankXlsxImportErrorCode) {
    super(code);
    this.name = "QuestionBankXlsxImportError";
  }
}

type QuestionBankXlsxUploadGrant = {
  contentType: string;
  expiresAt: string;
  maxBytes: number;
  uploadId: string;
  uploadUrl: string;
};

type QuestionBankXlsxUploadPreviewInput = {
  attemptId: string;
  imagePayloads: readonly QuestionBankXlsxPreviewImagePayload[];
  manifest: QuestionBankXlsxPreviewManifest;
  ownerUserId: string;
  workbookBytes: Uint8Array;
};

type QuestionBankXlsxPreviewAttempt = {
  attemptId: string;
  manifest: QuestionBankXlsxPreviewManifest;
  ownerUserId: string;
  previewImageIndex: QuestionBankXlsxPreviewImageIndex[];
};

function createStagingPrefix(attemptId: string) {
  return `${STAGING_ROOT}/${attemptId}/`;
}

function createWorkbookObjectKey(attemptId: string) {
  return `${createStagingPrefix(attemptId)}workbook.xlsx`;
}

function createManifestObjectKey(attemptId: string) {
  return `${createStagingPrefix(attemptId)}manifest.json`;
}

function createImageObjectKey(attemptId: string, contentSha256: string) {
  return `${createStagingPrefix(attemptId)}images/${contentSha256}.bin`;
}

function normalizeWorkbookFileName(fileName: string) {
  const normalized = fileName.trim();
  if (
    !normalized
    || normalized.length > 255
    || /[\\/\u0000-\u001f\u007f]/u.test(normalized)
    || !/\.xlsx$/iu.test(normalized)
  ) {
    throw new QuestionBankXlsxImportError("attempt_invalid");
  }
  return normalized;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cleanupEligibleAt(uploadExpiresAt: Date, now = Date.now()) {
  return new Date(Math.max(uploadExpiresAt.getTime(), now) + CLEANUP_RETRY_DELAY_MS);
}

function parseStagedObjectKeys(value: Prisma.JsonValue, attemptId: string) {
  const prefix = createStagingPrefix(attemptId);
  const keys = new Set<string>([createWorkbookObjectKey(attemptId)]);
  if (!Array.isArray(value)) return [...keys];
  for (const item of value) {
    if (
      typeof item === "string"
      && item.startsWith(prefix)
      && PRIVATE_STAGING_KEY_PATTERN.test(item)
    ) keys.add(item);
  }
  return [...keys];
}

function parseImageIndex(value: Prisma.JsonValue, attemptId: string): QuestionBankXlsxPreviewImageIndex[] {
  if (!Array.isArray(value) || value.length > QUESTION_BANK_XLSX_LIMITS.zipImagePayloads) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  const prefix = createStagingPrefix(attemptId);
  const images: QuestionBankXlsxPreviewImageIndex[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    const record = item as Record<string, Prisma.JsonValue>;
    const placements = record.placements;
    if (
      typeof record.contentSha256 !== "string"
      || !/^[0-9a-f]{64}$/u.test(record.contentSha256)
      || typeof record.objectKey !== "string"
      || !record.objectKey.startsWith(prefix)
      || !PRIVATE_STAGING_KEY_PATTERN.test(record.objectKey)
      || record.objectKey !== createImageObjectKey(attemptId, record.contentSha256)
      || typeof record.mimeType !== "string"
      || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(record.mimeType)
      || typeof record.width !== "number"
      || !Number.isSafeInteger(record.width)
      || record.width <= 0
      || record.width > QUESTION_BANK_XLSX_LIMITS.imageMaxDimension
      || typeof record.height !== "number"
      || !Number.isSafeInteger(record.height)
      || record.height <= 0
      || record.height > QUESTION_BANK_XLSX_LIMITS.imageMaxDimension
      || record.width * record.height > QUESTION_BANK_XLSX_LIMITS.imagePixelCount
      || typeof record.sizeBytes !== "number"
      || !Number.isSafeInteger(record.sizeBytes)
      || record.sizeBytes <= 0
      || record.sizeBytes > QUESTION_BANK_XLSX_LIMITS.imageBytes
      || !Array.isArray(placements)
      || placements.length === 0
      || placements.length > QUESTION_BANK_XLSX_LIMITS.imagePlacements
    ) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    const normalizedPlacements = placements.map((placement) => {
      if (!placement || typeof placement !== "object" || Array.isArray(placement)) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
      const typed = placement as Record<string, Prisma.JsonValue>;
      if (
        typeof typed.row !== "number"
        || !Number.isSafeInteger(typed.row)
        || typed.row < 2
        || typed.row > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows
        || typeof typed.field !== "string"
        || !/^(prompt_image|option_[a-e]_image|explanation_image)$/u.test(typed.field)
      ) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
      return { field: typed.field, row: typed.row };
    });
    images.push({
      contentSha256: record.contentSha256,
      height: record.height,
      mimeType: record.mimeType,
      objectKey: record.objectKey,
      placements: normalizedPlacements,
      sizeBytes: record.sizeBytes,
      width: record.width,
    });
  }
  const totalPlacements = images.reduce((count, image) => count + image.placements.length, 0);
  const totalBytes = images.reduce((count, image) => count + image.sizeBytes, 0);
  if (
    totalPlacements > QUESTION_BANK_XLSX_LIMITS.imagePlacements
    || totalBytes > QUESTION_BANK_XLSX_LIMITS.totalUniqueImageBytes
  ) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  return images;
}

async function createQuestionBankXlsxUploadGrant(
  ownerUserId: string,
  fileName: string,
): Promise<QuestionBankXlsxUploadGrant> {
  const originalFileName = normalizeWorkbookFileName(fileName);
  const attemptId = randomUUID();
  const now = new Date();
  const uploadExpiresAt = new Date(
    now.getTime() + QUESTION_BANK_XLSX_LIMITS.uploadGrantExpiresSeconds * 1_000,
  );
  const uploadObjectKey = createWorkbookObjectKey(attemptId);
  await prisma.questionBankXlsxImportAttempt.create({
    data: {
      expiresAt: cleanupEligibleAt(uploadExpiresAt),
      originalFileName,
      ownerUserId,
      stagedObjectKeys: [uploadObjectKey],
      stagingPrefix: createStagingPrefix(attemptId),
      uploadExpiresAt,
      uploadObjectKey,
    },
  });

  try {
    const grant = await createPrivateStagingUploadUrl(
      uploadObjectKey,
      QUESTION_BANK_XLSX_MIME_TYPE,
      QUESTION_BANK_XLSX_LIMITS.uploadGrantExpiresSeconds,
    );
    return {
      contentType: QUESTION_BANK_XLSX_MIME_TYPE,
      expiresAt: uploadExpiresAt.toISOString(),
      maxBytes: QUESTION_BANK_XLSX_LIMITS.workbookBytes,
      uploadId: attemptId,
      uploadUrl: grant.uploadUrl,
    };
  } catch {
    await prisma.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: new Date(),
        lastErrorCode: "upload_grant_unavailable",
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
      where: { id: attemptId },
    });
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
}

async function beginQuestionBankXlsxPreview(ownerUserId: string, attemptId: string) {
  const now = new Date();
  const previewExpiresAt = new Date(now.getTime() + QUESTION_BANK_XLSX_LIMITS.previewExpiresMs);
  const previewState = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (!current || current.ownerUserId !== ownerUserId) {
      throw new QuestionBankXlsxImportError("attempt_not_found");
    }
    if (current.state === QuestionBankXlsxImportAttemptState.previewed) {
      if (!current.previewExpiresAt || current.previewExpiresAt <= now) {
        throw new QuestionBankXlsxImportError("attempt_expired");
      }
      return { attempt: current, expired: false as const, replay: true as const };
    }
    if (current.state !== QuestionBankXlsxImportAttemptState.upload_pending) {
      throw new QuestionBankXlsxImportError("attempt_busy");
    }
    if (current.uploadExpiresAt <= now) {
      const expired = await tx.questionBankXlsxImportAttempt.update({
        data: {
          expiresAt: cleanupEligibleAt(current.uploadExpiresAt, now.getTime()),
          lastErrorCode: "upload_expired",
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
        where: { id: attemptId },
      });
      return { attempt: expired, expired: true as const, replay: false as const };
    }
    const updated = await tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: previewExpiresAt,
        lastErrorCode: null,
        previewExpiresAt,
        state: QuestionBankXlsxImportAttemptState.previewing,
      },
      where: { id: attemptId },
    });
    return { attempt: updated, expired: false as const, replay: false as const };
  });

  if (previewState.expired) throw new QuestionBankXlsxImportError("attempt_expired");
  if (previewState.replay) {
    const preview = await readQuestionBankXlsxPreview(ownerUserId, attemptId);
    return { ...preview, replay: true as const };
  }

  try {
    const head = await headMediaObject(previewState.attempt.uploadObjectKey);
    if (head.ContentLength !== undefined && head.ContentLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("xlsx_too_large");
    }
    const workbookBytes = await readPrivateStagingObject(
      previewState.attempt.uploadObjectKey,
      QUESTION_BANK_XLSX_LIMITS.workbookBytes,
    );
    if (workbookBytes.byteLength === 0) {
      throw new QuestionBankXlsxImportError("attempt_invalid");
    }
    if (workbookBytes.byteLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("xlsx_too_large");
    }
    if (head.ContentLength !== undefined && head.ContentLength !== workbookBytes.byteLength) {
      throw new QuestionBankXlsxImportError("attempt_invalid");
    }
    return { attempt: previewState.attempt, replay: false as const, workbookBytes };
  } catch (error) {
    const code = error instanceof QuestionBankXlsxImportError
      ? error.code
      : error instanceof PrivateStagingObjectTooLargeError
        ? "xlsx_too_large"
        : "xlsx_upload_missing";
    await rejectQuestionBankXlsxPreview(ownerUserId, attemptId, code);
    throw new QuestionBankXlsxImportError(code);
  }
}

async function rejectQuestionBankXlsxPreview(
  ownerUserId: string,
  attemptId: string,
  errorCode: string,
) {
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (!current || current.ownerUserId !== ownerUserId) return null;
    if (current.state !== QuestionBankXlsxImportAttemptState.previewing) return null;
    const expiry = cleanupEligibleAt(current.uploadExpiresAt);
    return tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiry,
        lastErrorCode: errorCode,
        state: QuestionBankXlsxImportAttemptState.failed,
      },
      where: { id: attemptId },
    });
  });
  // Keep the workbook object until the upload grant has expired plus a short
  // grace. An in-flight PUT may still complete after the signer has issued it.
  if (!attempt) return;
}

async function persistQuestionBankXlsxPreview(input: QuestionBankXlsxUploadPreviewInput) {
  const manifestObjectKey = createManifestObjectKey(input.attemptId);
  const imagePayloads = input.imagePayloads.map((image) => ({
    ...image,
    objectKey: createImageObjectKey(input.attemptId, image.contentSha256),
  }));
  const previewImageIndex = imagePayloads.map((image) => ({
    contentSha256: image.contentSha256,
    height: image.height,
    mimeType: image.mimeType,
    objectKey: image.objectKey,
    placements: image.placements,
    sizeBytes: image.sizeBytes,
    width: image.width,
  }));
  const manifestImages = imagePayloads.map((image, index) => ({
    ...previewImageIndex[index]!,
    sourceUrlFingerprints: image.sourceUrlFingerprints,
  }));
  const manifest: QuestionBankXlsxPreviewManifest = {
    ...input.manifest,
    images: manifestImages,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  const stagedObjectKeys = [
    createWorkbookObjectKey(input.attemptId),
    manifestObjectKey,
    ...previewImageIndex.map((image) => image.objectKey),
  ];
  const now = new Date();
  const previewExpiresAt = new Date(now.getTime() + QUESTION_BANK_XLSX_LIMITS.previewExpiresMs);
  const manifestSha256 = sha256(manifestBytes);
  const workbookSha256 = sha256(input.workbookBytes);
  let attempt: Awaited<ReturnType<typeof prisma.questionBankXlsxImportAttempt.findUnique>> = null;

  try {
    attempt = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${input.attemptId}::uuid
        FOR UPDATE
      `;
      const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: input.attemptId } });
      if (
        !current
        || current.ownerUserId !== input.ownerUserId
        || current.state !== QuestionBankXlsxImportAttemptState.previewing
      ) {
        throw new QuestionBankXlsxImportError("attempt_busy");
      }
      return tx.questionBankXlsxImportAttempt.update({
        data: {
          expiresAt: previewExpiresAt,
          imageCount: previewImageIndex.length,
          manifestObjectKey,
          manifestSha256,
          previewExpiresAt,
          previewImageIndex: previewImageIndex as unknown as Prisma.InputJsonValue,
          questionCount: input.manifest.normalizedRows.length,
          stagedObjectKeys: stagedObjectKeys as Prisma.InputJsonValue,
          workbookSha256,
          workbookSizeBytes: input.workbookBytes.byteLength,
        },
        where: { id: input.attemptId },
      });
    });

    for (let offset = 0; offset < imagePayloads.length; offset += 8) {
      const batch = imagePayloads.slice(offset, offset + 8);
      const results = await Promise.allSettled(batch.map((image) =>
        putPrivateStagingObject(image.objectKey, image.bytes, image.mimeType),
      ));
      if (results.some((result) => result.status === "rejected")) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
    }
    await putPrivateStagingObject(manifestObjectKey, manifestBytes, MANIFEST_MIME_TYPE);

    const completed = await prisma.questionBankXlsxImportAttempt.updateMany({
      data: { state: QuestionBankXlsxImportAttemptState.previewed },
      where: {
        id: input.attemptId,
        ownerUserId: input.ownerUserId,
        state: QuestionBankXlsxImportAttemptState.previewing,
      },
    });
    if (completed.count !== 1) throw new QuestionBankXlsxImportError("attempt_busy");
    return { manifest, previewImageIndex };
  } catch (error) {
    const current = attempt ?? await prisma.questionBankXlsxImportAttempt.findUnique({
      where: { id: input.attemptId },
    });
    if (current && current.ownerUserId === input.ownerUserId) {
      await prisma.questionBankXlsxImportAttempt.update({
        data: {
          expiresAt: cleanupEligibleAt(current.uploadExpiresAt),
          lastErrorCode: "preview_storage_failed",
          manifestObjectKey: null,
          manifestSha256: null,
          previewImageIndex: [],
          state: QuestionBankXlsxImportAttemptState.failed,
        },
        where: { id: input.attemptId },
      });
    }
    if (error instanceof QuestionBankXlsxImportError) throw error;
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
}

async function readQuestionBankXlsxPreview(ownerUserId: string, attemptId: string) {
  const attempt = await prisma.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.ownerUserId !== ownerUserId) {
    throw new QuestionBankXlsxImportError("attempt_not_found");
  }
  if (
    attempt.state !== QuestionBankXlsxImportAttemptState.previewed
    || !attempt.previewExpiresAt
    || attempt.previewExpiresAt <= new Date()
    || !attempt.manifestObjectKey
  ) {
    throw new QuestionBankXlsxImportError("attempt_expired");
  }
  const manifestBytes = await readPrivateStagingObject(
    attempt.manifestObjectKey,
    MAX_MANIFEST_BYTES,
  );
  if (sha256(manifestBytes) !== attempt.manifestSha256) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  let manifest: QuestionBankXlsxPreviewManifest;
  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8")) as QuestionBankXlsxPreviewManifest;
  } catch {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || !Array.isArray(manifest.normalizedRows)
    || manifest.normalizedRows.length > QUESTION_BANK_XLSX_LIMITS.dataRows
    || !Array.isArray(manifest.imageSlots)
    || manifest.imageSlots.length > QUESTION_BANK_XLSX_LIMITS.imagePlacements
    || !Array.isArray(manifest.images)
    || manifest.images.length > QUESTION_BANK_XLSX_LIMITS.zipImagePayloads
    || !manifest.summary
    || typeof manifest.summary !== "object"
  ) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  const previewImageIndex = parseImageIndex(attempt.previewImageIndex, attemptId);
  if (manifest.images.length !== previewImageIndex.length) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  const indexedByHash = new Map(previewImageIndex.map((image) => [image.contentSha256, image]));
  const manifestPlacements = new Set<string>();
  const indexedPlacements = new Set(previewImageIndex.flatMap((image) =>
    image.placements.map((placement) => `${placement.row}:${placement.field}:${image.contentSha256}`),
  ));
  for (const slot of manifest.imageSlots) {
    if (
      !slot
      || !Number.isSafeInteger(slot.row)
      || slot.row < 2
      || slot.row > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows
      || typeof slot.field !== "string"
      || !/^(prompt_image|option_[a-e]_image|explanation_image)$/u.test(slot.field)
      || typeof slot.contentSha256 !== "string"
      || !indexedByHash.has(slot.contentSha256)
    ) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    const key = `${slot.row}:${slot.field}`;
    if (manifestPlacements.has(key)) throw new QuestionBankXlsxImportError("attempt_unavailable");
    manifestPlacements.add(key);
    indexedPlacements.delete(`${slot.row}:${slot.field}:${slot.contentSha256}`);
  }
  if (indexedPlacements.size > 0) throw new QuestionBankXlsxImportError("attempt_unavailable");
  for (const image of manifest.images) {
    if (
      !image
      || !Array.isArray(image.sourceUrlFingerprints)
      || image.sourceUrlFingerprints.length > QUESTION_BANK_XLSX_LIMITS.externalImageUrls
      || image.sourceUrlFingerprints.some((fingerprint) => typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/u.test(fingerprint))
    ) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    const indexed = indexedByHash.get(image.contentSha256);
    if (
      !indexed
      || indexed.objectKey !== image.objectKey
      || indexed.sizeBytes !== image.sizeBytes
      || indexed.width !== image.width
      || indexed.height !== image.height
      || indexed.mimeType !== image.mimeType
      || JSON.stringify(indexed.placements) !== JSON.stringify(image.placements)
    ) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
  }
  const imageUrlFingerprints = new Set(manifest.images.flatMap((image) => image.sourceUrlFingerprints));
  if (
    !Number.isSafeInteger(manifest.summary.acceptedRows)
    || !Number.isSafeInteger(manifest.summary.dataRowCount)
    || !Number.isSafeInteger(manifest.summary.rejectedRows)
    || !Number.isSafeInteger(manifest.summary.rowErrorCount)
    || !Number.isSafeInteger(manifest.summary.structuralErrorCount)
    || !Number.isSafeInteger(manifest.summary.externalImageUrlCount)
    || !Number.isSafeInteger(manifest.summary.imageCount)
    || !Number.isSafeInteger(manifest.summary.imagePlacementCount)
    || manifest.summary.acceptedRows !== manifest.normalizedRows.length
    || manifest.summary.dataRowCount !== manifest.normalizedRows.length
    || manifest.summary.rejectedRows !== 0
    || manifest.summary.rowErrorCount !== 0
    || manifest.summary.structuralErrorCount !== 0
    || manifest.summary.imageCount !== previewImageIndex.length
    || manifest.summary.imagePlacementCount !== manifest.imageSlots.length
    || manifest.summary.externalImageUrlCount < imageUrlFingerprints.size
    || manifest.summary.externalImageUrlCount > QUESTION_BANK_XLSX_LIMITS.externalImageUrls
  ) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  return {
    attempt,
    manifest,
    previewImageIndex,
  };
}

async function discardQuestionBankXlsxPreview(ownerUserId: string, attemptId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (!current || current.ownerUserId !== ownerUserId) {
      throw new QuestionBankXlsxImportError("attempt_not_found");
    }
    if (
      current.state !== QuestionBankXlsxImportAttemptState.upload_pending
      && current.state !== QuestionBankXlsxImportAttemptState.previewed
      && current.state !== QuestionBankXlsxImportAttemptState.failed
      && current.state !== QuestionBankXlsxImportAttemptState.cleanup_pending
    ) {
      throw new QuestionBankXlsxImportError("attempt_busy");
    }
    await tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: cleanupEligibleAt(current.uploadExpiresAt),
        state: QuestionBankXlsxImportAttemptState.discarded,
      },
      where: { id: attemptId },
    });
  });

  // Cleanup is deferred until the presigned workbook PUT can no longer write
  // this key, so cancellation cannot race a still-valid upload grant.
}

async function cleanupExpiredQuestionBankXlsxImportAttempts(now = new Date()) {
  const expiredAttempts = await prisma.questionBankXlsxImportAttempt.findMany({
    orderBy: { expiresAt: "asc" },
    select: { id: true },
    take: CLEANUP_BATCH_SIZE,
    where: {
      expiresAt: { lte: now },
      state: {
        in: [
          QuestionBankXlsxImportAttemptState.upload_pending,
          QuestionBankXlsxImportAttemptState.previewing,
          QuestionBankXlsxImportAttemptState.previewed,
          QuestionBankXlsxImportAttemptState.completed,
          QuestionBankXlsxImportAttemptState.failed,
          QuestionBankXlsxImportAttemptState.cleanup_pending,
          QuestionBankXlsxImportAttemptState.discarded,
        ],
      },
    },
  });
  let cleaned = 0;
  let deferred = 0;

  for (const candidate of expiredAttempts) {
    const attempt = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${candidate.id}::uuid
        FOR UPDATE
      `;
      const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: candidate.id } });
      if (!current || current.expiresAt > now || current.state === QuestionBankXlsxImportAttemptState.applying) return null;
      return tx.questionBankXlsxImportAttempt.update({
        data: { state: QuestionBankXlsxImportAttemptState.cleanup_pending },
        where: { id: current.id },
      });
    });
    if (!attempt) continue;

    try {
      await deletePrivateStagingObjects(parseStagedObjectKeys(attempt.stagedObjectKeys, attempt.id));
      const deleted = await prisma.questionBankXlsxImportAttempt.deleteMany({
        where: { id: attempt.id, state: QuestionBankXlsxImportAttemptState.cleanup_pending },
      });
      cleaned += deleted.count;
    } catch {
      await prisma.questionBankXlsxImportAttempt.update({
        data: { expiresAt: new Date(now.getTime() + CLEANUP_RETRY_DELAY_MS) },
        where: { id: attempt.id },
      });
      deferred += 1;
    }
  }

  return { cleaned, deferred };
}

export {
  CLEANUP_RETRY_DELAY_MS,
  QuestionBankXlsxImportError,
  beginQuestionBankXlsxPreview,
  cleanupExpiredQuestionBankXlsxImportAttempts,
  createImageObjectKey,
  createQuestionBankXlsxUploadGrant,
  discardQuestionBankXlsxPreview,
  parseImageIndex,
  parseStagedObjectKeys,
  persistQuestionBankXlsxPreview,
  readQuestionBankXlsxPreview,
  rejectQuestionBankXlsxPreview,
  sha256,
};

export type {
  QuestionBankXlsxImportErrorCode,
  QuestionBankXlsxPreviewAttempt,
  QuestionBankXlsxUploadGrant,
  QuestionBankXlsxUploadPreviewInput,
};
