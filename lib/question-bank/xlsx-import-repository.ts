import "server-only";

import { randomUUID, createHash } from "node:crypto";

import {
  Prisma,
  QuestionBankXlsxImportAttemptState,
} from "@/generated/prisma/client";
import {
  abortPrivateStagingMultipartUpload,
  completePrivateStagingMultipartUpload,
  createPrivateStagingMultipartUpload,
  createPrivateStagingUploadPartUrl,
  deletePrivateStagingObjects,
  headMediaObject,
  listPrivateStagingMultipartParts,
  listPrivateStagingMultipartUploads,
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
const MULTIPART_CLEANUP_SWEEP_INTERVAL_MS = 60 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 20;
const PREVIEW_CANCEL_POLL_MS = 1_000;
const R2_INCOMPLETE_MULTIPART_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const MULTIPART_CLEANUP_GRACE_MS = 24 * 60 * 60 * 1_000;
const MULTIPART_CREATE_TIMEOUT_MS = 60_000;
const PRIVATE_STAGING_KEY_PATTERN =
  /^question-bank-xlsx-staging\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:workbook\.xlsx|manifest\.json|images\/[0-9a-f]{64}\.bin)$/iu;

type QuestionBankXlsxImportErrorCode =
  | "attempt_busy"
  | "attempt_cancelled"
  | "attempt_expired"
  | "attempt_invalid"
  | "attempt_not_found"
  | "attempt_unavailable"
  | "multipart_incomplete"
  | "multipart_invalid"
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
  expectedWorkbookSizeBytes: number;
  partSizeBytes: number;
  parts: Array<{
    contentLength: number;
    partNumber: number;
    uploadUrl: string;
  }>;
  uploadId: string;
};

type QuestionBankXlsxUploadPreviewInput = {
  attemptId: string;
  imagePayloads: readonly QuestionBankXlsxPreviewImagePayload[];
  manifest: QuestionBankXlsxPreviewManifest;
  ownerUserId: string;
  workbookBytes: Uint8Array;
  signal?: AbortSignal;
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

function multipartCleanupDeadline(initiatedAt: Date) {
  return new Date(
    initiatedAt.getTime() + R2_INCOMPLETE_MULTIPART_LIFETIME_MS + MULTIPART_CLEANUP_GRACE_MS,
  );
}

function laterDate(...dates: readonly Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function nextCleanupAttemptAt(now = Date.now()) {
  return new Date(now + CLEANUP_RETRY_DELAY_MS);
}

function nextMultipartCleanupSweepAt(now = Date.now()) {
  return new Date(now + MULTIPART_CLEANUP_SWEEP_INTERVAL_MS);
}

function operationLeaseUntil(now = Date.now()) {
  return new Date(now + QUESTION_BANK_XLSX_LIMITS.operationLeaseMs);
}

function expiresAfterOperation(leaseExpiresAt: Date) {
  return new Date(leaseExpiresAt.getTime() + CLEANUP_RETRY_DELAY_MS);
}

function expectedMultipartPartBytes(sizeBytes: number, partNumber: number) {
  const start = (partNumber - 1) * QUESTION_BANK_XLSX_LIMITS.multipartPartBytes;
  return Math.max(0, Math.min(QUESTION_BANK_XLSX_LIMITS.multipartPartBytes, sizeBytes - start));
}

function expectedMultipartPartCount(sizeBytes: number) {
  return Math.ceil(sizeBytes / QUESTION_BANK_XLSX_LIMITS.multipartPartBytes);
}

async function markMultipartCreationForCleanup(
  ownerUserId: string,
  attemptId: string,
  createLeaseExpiresAt: Date,
  multipartUploadId: string | null,
  errorCode: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (!current || current.ownerUserId !== ownerUserId) return null;

    const now = new Date();
    const stillOwnsCreateLease = current.state === QuestionBankXlsxImportAttemptState.multipart_creating
      && current.operationLeaseExpiresAt?.getTime() === createLeaseExpiresAt.getTime();
    const liveLease = Boolean(current.operationLeaseExpiresAt && current.operationLeaseExpiresAt > now);
    const anotherOperationOwnsLease = liveLease && !stillOwnsCreateLease;
    const attempt = await tx.questionBankXlsxImportAttempt.update({
      data: {
        cancelRequestedAt: current.cancelRequestedAt ?? now,
        expiresAt: anotherOperationOwnsLease
          ? expiresAfterOperation(current.operationLeaseExpiresAt!)
          : nextCleanupAttemptAt(now.getTime()),
        lastErrorCode: errorCode,
        multipartUploadId: multipartUploadId ?? current.multipartUploadId,
        operationLeaseExpiresAt: anotherOperationOwnsLease ? current.operationLeaseExpiresAt : null,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        uploadExpiresAt: laterDate(current.uploadExpiresAt, multipartCleanupDeadline(current.createdAt)),
      },
      where: { id: attemptId },
    });
    return { attempt, ready: !anotherOperationOwnsLease };
  });
}

const activePreviewControllers = new Map<string, Set<AbortController>>();

function registerQuestionBankXlsxPreviewController(attemptId: string, controller: AbortController) {
  const controllers = activePreviewControllers.get(attemptId) ?? new Set<AbortController>();
  controllers.add(controller);
  activePreviewControllers.set(attemptId, controllers);
  return () => {
    controllers.delete(controller);
    if (!controllers.size) activePreviewControllers.delete(attemptId);
  };
}

function abortActiveQuestionBankXlsxPreview(attemptId: string, reason: Error) {
  for (const controller of activePreviewControllers.get(attemptId) ?? []) controller.abort(reason);
}

function watchQuestionBankXlsxPreviewCancellation(
  ownerUserId: string,
  attemptId: string,
  controller: AbortController,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  const poll = async () => {
    if (stopped || polling || controller.signal.aborted) return;
    polling = true;
    try {
      const attempt = await prisma.questionBankXlsxImportAttempt.findUnique({
        select: { cancelRequestedAt: true, ownerUserId: true },
        where: { id: attemptId },
      });
      if (
        !attempt
        || attempt.ownerUserId !== ownerUserId
        || attempt.cancelRequestedAt
      ) {
        controller.abort(new QuestionBankXlsxImportError("attempt_cancelled"));
      }
    } catch {
      // A transient DB read failure does not cancel a valid preview. The final
      // transaction still requires cancel_requested_at IS NULL.
    } finally {
      polling = false;
      if (!stopped && !controller.signal.aborted) timer = setTimeout(() => void poll(), PREVIEW_CANCEL_POLL_MS);
    }
  };
  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
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
  expectedWorkbookSizeBytes: number,
  signal?: AbortSignal,
): Promise<QuestionBankXlsxUploadGrant> {
  if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
  const originalFileName = normalizeWorkbookFileName(fileName);
  if (
    !Number.isSafeInteger(expectedWorkbookSizeBytes)
    || expectedWorkbookSizeBytes <= 0
    || expectedWorkbookSizeBytes > QUESTION_BANK_XLSX_LIMITS.workbookBytes
  ) {
    throw new QuestionBankXlsxImportError("xlsx_too_large");
  }
  const attemptId = randomUUID();
  const now = new Date();
  // Persist a pre-initiation anchor and its conservative R2 lifecycle horizon
  // before dispatching CreateMultipartUpload. If the response is lost, cleanup
  // can still retain the exact-key tombstone and discover the UploadId later.
  const uploadExpiresAt = multipartCleanupDeadline(now);
  const leaseExpiresAt = operationLeaseUntil(now.getTime());
  const partCount = expectedMultipartPartCount(expectedWorkbookSizeBytes);
  const uploadObjectKey = createWorkbookObjectKey(attemptId);
  await prisma.questionBankXlsxImportAttempt.create({
    data: {
      createdAt: now,
      expectedMultipartPartCount: partCount,
      expectedWorkbookSizeBytes,
      expiresAt: expiresAfterOperation(leaseExpiresAt),
      operationLeaseExpiresAt: leaseExpiresAt,
      originalFileName,
      ownerUserId,
      stagedObjectKeys: [uploadObjectKey],
      stagingPrefix: createStagingPrefix(attemptId),
      state: QuestionBankXlsxImportAttemptState.multipart_creating,
      uploadExpiresAt,
      uploadObjectKey,
    },
  });

  // Do not cancel CreateMultipartUpload after dispatch. If the client disconnects
  // after R2 creates the upload but before returning its ID, cleanup can find it
  // by the attempt's exact object key and abort it.
  if (signal?.aborted) {
    await markQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
    await finishQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
    throw new QuestionBankXlsxImportError("attempt_cancelled");
  }
  let multipartUploadId: string | null = null;
  const createController = new AbortController();
  const createTimeout = setTimeout(
    () => createController.abort(new Error("R2 multipart initiation timed out.")),
    MULTIPART_CREATE_TIMEOUT_MS,
  );
  try {
    try {
      // Persist a deadline immediately before dispatch. The create timeout
      // starts first, so a suspended process cannot later dispatch a request
      // using an anchor that is older than its live operation. R2's Initiated
      // timestamp, when observed by cleanup listing, can only extend this
      // persisted lifecycle horizon.
      const initiationDeadlinePersisted = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM question_bank_xlsx_import_attempts
          WHERE id = ${attemptId}::uuid
          FOR UPDATE
        `;
        const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
        const initiatedAt = new Date();
        if (
          !current
          || current.ownerUserId !== ownerUserId
          || current.state !== QuestionBankXlsxImportAttemptState.multipart_creating
          || current.cancelRequestedAt
          || current.operationLeaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
          || !current.operationLeaseExpiresAt
          || current.operationLeaseExpiresAt <= initiatedAt
          || createController.signal.aborted
          || signal?.aborted
        ) return false;
        await tx.questionBankXlsxImportAttempt.update({
          data: {
            uploadExpiresAt: laterDate(current.uploadExpiresAt, multipartCleanupDeadline(initiatedAt)),
          },
          where: { id: attemptId },
        });
        return true;
      });
      if (!initiationDeadlinePersisted) {
        throw new QuestionBankXlsxImportError(signal?.aborted ? "attempt_cancelled" : "attempt_expired");
      }
      // This is deliberately independent of the browser signal: if the client
      // disconnects after R2 accepts the request, the returned UploadId must
      // still be persisted. An ambiguous timeout is recovered by exact-key
      // listing under the already-persisted tombstone.
      multipartUploadId = await createPrivateStagingMultipartUpload(
        uploadObjectKey,
        QUESTION_BANK_XLSX_MIME_TYPE,
        createController.signal,
      );
    } finally {
      clearTimeout(createTimeout);
    }

    const persisted = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${attemptId}::uuid
        FOR UPDATE
      `;
      const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
      if (!current || current.ownerUserId !== ownerUserId) return "missing" as const;
      const savedAt = new Date();
      const stillOwnsCreateLease = current.state === QuestionBankXlsxImportAttemptState.multipart_creating
        && current.operationLeaseExpiresAt?.getTime() === leaseExpiresAt.getTime();
      const liveLease = Boolean(current.operationLeaseExpiresAt && current.operationLeaseExpiresAt > savedAt);
      if (
        !stillOwnsCreateLease
        || current.cancelRequestedAt
        || current.operationLeaseExpiresAt! <= savedAt
        || current.uploadExpiresAt <= savedAt
        || createController.signal.aborted
        || signal?.aborted
      ) {
        const anotherCleanupOwnsLease = liveLease && !stillOwnsCreateLease;
        await tx.questionBankXlsxImportAttempt.update({
          data: {
            cancelRequestedAt: current.cancelRequestedAt ?? savedAt,
            expiresAt: anotherCleanupOwnsLease
              ? expiresAfterOperation(current.operationLeaseExpiresAt!)
              : nextCleanupAttemptAt(savedAt.getTime()),
            multipartUploadId,
            operationLeaseExpiresAt: anotherCleanupOwnsLease ? current.operationLeaseExpiresAt : null,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
            uploadExpiresAt: laterDate(current.uploadExpiresAt, multipartCleanupDeadline(current.createdAt)),
          },
          where: { id: attemptId },
        });
        return anotherCleanupOwnsLease ? "deferred" as const : "cleanup" as const;
      }
      await tx.questionBankXlsxImportAttempt.update({
        data: {
          multipartUploadId,
        },
        where: { id: attemptId },
      });
      return "continue" as const;
    });
    if (persisted === "missing") {
      // The retention window makes this path unreachable in normal operation.
      // Keep the received handle long enough to make one last direct cleanup
      // attempt rather than silently abandoning it.
      await abortPrivateStagingMultipartUpload(uploadObjectKey, multipartUploadId);
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    if (persisted !== "continue") {
      throw new QuestionBankXlsxImportError(signal?.aborted ? "attempt_cancelled" : "attempt_expired");
    }

    if (signal?.aborted || createController.signal.aborted) {
      throw new QuestionBankXlsxImportError(signal?.aborted ? "attempt_cancelled" : "attempt_unavailable");
    }

    const grantExpiresAt = new Date(Date.now() + QUESTION_BANK_XLSX_LIMITS.uploadGrantExpiresSeconds * 1_000);
    const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => {
      const partNumber = index + 1;
      const contentLength = expectedMultipartPartBytes(expectedWorkbookSizeBytes, partNumber);
      const remainingGrantSeconds = Math.floor((grantExpiresAt.getTime() - Date.now()) / 1_000);
      if (remainingGrantSeconds < 1) throw new QuestionBankXlsxImportError("attempt_expired");
      const grant = await createPrivateStagingUploadPartUrl(
        uploadObjectKey,
        multipartUploadId!,
        partNumber,
        contentLength,
        remainingGrantSeconds,
      );
      return { contentLength, partNumber, uploadUrl: grant.uploadUrl };
    }));
    if (signal?.aborted) {
      throw new QuestionBankXlsxImportError("attempt_cancelled");
    }
    const grantStatePersisted = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${attemptId}::uuid
        FOR UPDATE
      `;
      const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
      const savedAt = new Date();
      if (
        !current
        || current.ownerUserId !== ownerUserId
        || current.state !== QuestionBankXlsxImportAttemptState.multipart_creating
        || current.cancelRequestedAt
        || current.multipartUploadId !== multipartUploadId
        || current.operationLeaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
        || !current.operationLeaseExpiresAt
        || current.operationLeaseExpiresAt <= savedAt
        || savedAt >= grantExpiresAt
        || signal?.aborted
      ) return false;
      await tx.questionBankXlsxImportAttempt.update({
        data: {
          expiresAt: cleanupEligibleAt(grantExpiresAt),
          operationLeaseExpiresAt: null,
          state: QuestionBankXlsxImportAttemptState.multipart_uploading,
          uploadExpiresAt: grantExpiresAt,
        },
        where: { id: attemptId },
      });
      return true;
    });
    if (!grantStatePersisted) throw new QuestionBankXlsxImportError(signal?.aborted ? "attempt_cancelled" : "attempt_expired");
    return {
      contentType: QUESTION_BANK_XLSX_MIME_TYPE,
      expiresAt: grantExpiresAt.toISOString(),
      expectedWorkbookSizeBytes,
      partSizeBytes: QUESTION_BANK_XLSX_LIMITS.multipartPartBytes,
      parts,
      uploadId: attemptId,
    };
  } catch (error) {
    const cleanup = await markMultipartCreationForCleanup(
      ownerUserId,
      attemptId,
      leaseExpiresAt,
      multipartUploadId,
      signal?.aborted ? "attempt_cancelled" : error instanceof QuestionBankXlsxImportError ? error.code : "upload_grant_unavailable",
    ).catch(() => null);
    if (cleanup?.ready) {
      await cleanupCancelledQuestionBankXlsxAttempt(cleanup.attempt);
    } else if (!cleanup && multipartUploadId) {
      // A transient database failure must not suppress the best-effort storage
      // abort; the pre-initiation row still owns the exact-key retry handle.
      await abortPrivateStagingMultipartUpload(uploadObjectKey, multipartUploadId).catch(() => undefined);
    }
    if (error instanceof QuestionBankXlsxImportError) throw error;
    throw new QuestionBankXlsxImportError(signal?.aborted ? "attempt_cancelled" : "attempt_unavailable");
  }
}

async function validateListedMultipartParts(
  parts: Awaited<ReturnType<typeof listPrivateStagingMultipartParts>>,
  expectedSize: number,
  expectedPartCount: number,
) {
  if (parts.length !== expectedPartCount) return null;
  const byNumber = new Map<number, typeof parts[number]>();
  for (const part of parts) {
    if (
      !Number.isSafeInteger(part.partNumber)
      || !part.partNumber
      || part.partNumber < 1
      || part.partNumber > expectedPartCount
      || byNumber.has(part.partNumber)
      || !part.etag
      || typeof part.size !== "number"
      || !Number.isSafeInteger(part.size)
      || part.size !== expectedMultipartPartBytes(expectedSize, part.partNumber)
    ) return null;
    byNumber.set(part.partNumber, part);
  }
  const ordered: Array<{ ETag: string; PartNumber: number }> = [];
  let total = 0;
  for (let partNumber = 1; partNumber <= expectedPartCount; partNumber += 1) {
    const part = byNumber.get(partNumber);
    if (!part || !part.etag || typeof part.size !== "number" || !Number.isSafeInteger(part.size)) return null;
    total += part.size;
    if (total > QUESTION_BANK_XLSX_LIMITS.workbookBytes) return null;
    ordered.push({ ETag: part.etag, PartNumber: partNumber });
  }
  return total === expectedSize ? ordered : null;
}

async function completeQuestionBankXlsxUpload(ownerUserId: string, attemptId: string, signal?: AbortSignal) {
  const now = new Date();
  const claimed = await prisma.$transaction(async (tx) => {
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
    if (current.cancelRequestedAt) throw new QuestionBankXlsxImportError("attempt_cancelled");
    if (current.state === QuestionBankXlsxImportAttemptState.upload_complete) {
      if (current.expiresAt <= now) throw new QuestionBankXlsxImportError("attempt_expired");
      return { attempt: current, replay: true as const };
    }
    if (
      current.state === QuestionBankXlsxImportAttemptState.multipart_completing
      && current.operationLeaseExpiresAt
      && current.operationLeaseExpiresAt > now
    ) {
      throw new QuestionBankXlsxImportError("attempt_busy");
    }
    if (
      current.state !== QuestionBankXlsxImportAttemptState.multipart_uploading
      && current.state !== QuestionBankXlsxImportAttemptState.multipart_completing
    ) {
      throw new QuestionBankXlsxImportError("attempt_busy");
    }
    if (current.uploadExpiresAt <= now) {
      await tx.questionBankXlsxImportAttempt.update({
        data: {
          cancelRequestedAt: now,
          expiresAt: new Date(now.getTime() + CLEANUP_RETRY_DELAY_MS),
          operationLeaseExpiresAt: null,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
        where: { id: attemptId },
      });
      throw new QuestionBankXlsxImportError("attempt_expired");
    }
    if (
      !current.multipartUploadId
      || !current.expectedWorkbookSizeBytes
      || !current.expectedMultipartPartCount
      || current.expectedWorkbookSizeBytes > QUESTION_BANK_XLSX_LIMITS.workbookBytes
      || current.expectedMultipartPartCount !== expectedMultipartPartCount(current.expectedWorkbookSizeBytes)
    ) {
      throw new QuestionBankXlsxImportError("multipart_invalid");
    }
    const leaseExpiresAt = operationLeaseUntil(now.getTime());
    const attempt = await tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiresAfterOperation(leaseExpiresAt),
        operationLeaseExpiresAt: leaseExpiresAt,
        state: QuestionBankXlsxImportAttemptState.multipart_completing,
      },
      where: { id: attemptId },
    });
    return { attempt, replay: false as const };
  });

  const expectedSize = claimed.attempt.expectedWorkbookSizeBytes;
  const uploadObjectKey = claimed.attempt.uploadObjectKey;
  if (!expectedSize) throw new QuestionBankXlsxImportError("multipart_invalid");
  if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");

  if (claimed.replay) {
    const head = await headMediaObject(uploadObjectKey, signal);
    if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    if (head.ContentLength !== expectedSize || head.ContentLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    return { expectedWorkbookSizeBytes: expectedSize, replay: true as const };
  }

  try {
    let objectComplete = false;
    try {
      const head = await headMediaObject(uploadObjectKey, signal);
      objectComplete = head.ContentLength === expectedSize;
      if (
        head.ContentLength !== undefined
        && head.ContentLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes
      ) throw new QuestionBankXlsxImportError("xlsx_too_large");
      if (objectComplete === false && head.ContentLength !== undefined) throw new QuestionBankXlsxImportError("multipart_invalid");
    } catch (error) {
      if (error instanceof QuestionBankXlsxImportError) throw error;
      if (!isMissingStagingObjectError(error)) throw error;
    }

    if (!objectComplete) {
      const multipartUploadId = claimed.attempt.multipartUploadId;
      const partCount = claimed.attempt.expectedMultipartPartCount;
      if (!multipartUploadId || !partCount) throw new QuestionBankXlsxImportError("multipart_invalid");
      const listedParts = await listPrivateStagingMultipartParts(uploadObjectKey, multipartUploadId, signal);
      const completionParts = await validateListedMultipartParts(listedParts, expectedSize, partCount);
      if (!completionParts) {
        const incomplete = listedParts.length < partCount
          && listedParts.every((part) => Number.isSafeInteger(part.partNumber)
            && part.partNumber! >= 1
            && part.partNumber! <= partCount);
        if (incomplete) {
          await prisma.questionBankXlsxImportAttempt.updateMany({
            data: {
              expiresAt: cleanupEligibleAt(claimed.attempt.uploadExpiresAt),
              operationLeaseExpiresAt: null,
              state: QuestionBankXlsxImportAttemptState.multipart_uploading,
            },
            where: {
              cancelRequestedAt: null,
              id: attemptId,
              state: QuestionBankXlsxImportAttemptState.multipart_completing,
            },
          });
          throw new QuestionBankXlsxImportError("multipart_incomplete");
        }
        await prisma.questionBankXlsxImportAttempt.updateMany({
          data: {
            cancelRequestedAt: new Date(),
            expiresAt: new Date(Date.now() + CLEANUP_RETRY_DELAY_MS),
            operationLeaseExpiresAt: null,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
            lastErrorCode: "multipart_invalid",
          },
          where: { id: attemptId, state: QuestionBankXlsxImportAttemptState.multipart_completing },
        });
        await finishQuestionBankXlsxCancellation(ownerUserId, attemptId);
        throw new QuestionBankXlsxImportError("multipart_invalid");
      }
      if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
      await completePrivateStagingMultipartUpload(uploadObjectKey, multipartUploadId, completionParts, signal);
    }

    if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    const head = await headMediaObject(uploadObjectKey, signal);
    if (head.ContentLength !== undefined && head.ContentLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("xlsx_too_large");
    }
    if (head.ContentLength !== expectedSize) throw new QuestionBankXlsxImportError("multipart_invalid");
    if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    const completedAt = new Date();
    const committed = await prisma.$transaction(async (tx) => {
      if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${attemptId}::uuid
        FOR UPDATE
      `;
      const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
      if (
        !current
        || current.ownerUserId !== ownerUserId
        || current.cancelRequestedAt
        || current.state !== QuestionBankXlsxImportAttemptState.multipart_completing
      ) return false;
      await tx.questionBankXlsxImportAttempt.update({
        data: {
          expiresAt: new Date(completedAt.getTime() + QUESTION_BANK_XLSX_LIMITS.previewExpiresMs),
          operationLeaseExpiresAt: null,
          state: QuestionBankXlsxImportAttemptState.upload_complete,
        },
        where: { id: attemptId },
      });
      return true;
    });
    if (!committed) {
      await deletePrivateStagingObjects([uploadObjectKey]).catch(() => undefined);
      await abortPrivateStagingMultipartUpload(
        uploadObjectKey,
        claimed.attempt.multipartUploadId ?? "",
      ).catch(() => undefined);
      await finishQuestionBankXlsxCancellation(ownerUserId, attemptId);
      throw new QuestionBankXlsxImportError("attempt_cancelled");
    }
    if (signal?.aborted) {
      await markQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
      await finishQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
      throw new QuestionBankXlsxImportError("attempt_cancelled");
    }
    return { expectedWorkbookSizeBytes: expectedSize, replay: false as const };
  } catch (error) {
    if (signal?.aborted || error instanceof QuestionBankXlsxImportError && error.code === "attempt_cancelled") {
      await markQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
      await finishQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
      throw new QuestionBankXlsxImportError("attempt_cancelled");
    }
    if (error instanceof QuestionBankXlsxImportError && error.code === "multipart_incomplete") throw error;
    if (error instanceof QuestionBankXlsxImportError && error.code === "multipart_invalid") {
      await markQuestionBankXlsxCancellation(ownerUserId, attemptId, error.code).catch(() => undefined);
      await finishQuestionBankXlsxCancellation(ownerUserId, attemptId).catch(() => undefined);
      throw error;
    }
    if (error instanceof QuestionBankXlsxImportError && error.code === "xlsx_too_large") {
      await markQuestionBankXlsxCancellation(ownerUserId, attemptId, error.code);
      await finishQuestionBankXlsxCancellation(ownerUserId, attemptId);
      throw error;
    }
    // A Complete request can succeed remotely while its response is lost. Keep
    // the completing state and its lease; a retry or cleanup worker HEAD-checks
    // the object after that lease expires before taking another action.
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
}

function isMissingStagingObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return value.name === "NotFound" || value.name === "NoSuchKey" || value.$metadata?.httpStatusCode === 404;
}

async function beginQuestionBankXlsxPreview(ownerUserId: string, attemptId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
  const now = new Date();
  const previewExpiresAt = new Date(now.getTime() + QUESTION_BANK_XLSX_LIMITS.previewExpiresMs);
  const leaseExpiresAt = operationLeaseUntil(now.getTime());
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
    if (current.cancelRequestedAt) throw new QuestionBankXlsxImportError("attempt_cancelled");
    if (current.state === QuestionBankXlsxImportAttemptState.previewed) {
      if (!current.previewExpiresAt || current.previewExpiresAt <= now) {
        throw new QuestionBankXlsxImportError("attempt_expired");
      }
      return { attempt: current, expired: false as const, replay: true as const };
    }
    const retryingExpiredPreview = current.state === QuestionBankXlsxImportAttemptState.previewing
      && (!current.operationLeaseExpiresAt || current.operationLeaseExpiresAt <= now);
    if (
      current.state !== QuestionBankXlsxImportAttemptState.upload_complete
      && !retryingExpiredPreview
    ) {
      throw new QuestionBankXlsxImportError("attempt_busy");
    }
    if (!retryingExpiredPreview && current.uploadExpiresAt <= now) {
      const expired = await tx.questionBankXlsxImportAttempt.update({
        data: {
          cancelRequestedAt: now,
          expiresAt: new Date(now.getTime() + CLEANUP_RETRY_DELAY_MS),
          lastErrorCode: "upload_expired",
          operationLeaseExpiresAt: null,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
        where: { id: attemptId },
      });
      return { attempt: expired, expired: true as const, replay: false as const };
    }
    const updated = await tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiresAfterOperation(leaseExpiresAt),
        lastErrorCode: null,
        operationLeaseExpiresAt: leaseExpiresAt,
        previewExpiresAt,
        state: QuestionBankXlsxImportAttemptState.previewing,
      },
      where: { id: attemptId },
    });
    return { attempt: updated, expired: false as const, replay: false as const };
  });

  if (previewState.expired) throw new QuestionBankXlsxImportError("attempt_expired");
  if (previewState.replay) {
    const preview = await readQuestionBankXlsxPreview(ownerUserId, attemptId, signal);
    return { ...preview, replay: true as const };
  }

  try {
    if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    const expectedSize = previewState.attempt.expectedWorkbookSizeBytes;
    if (!expectedSize || expectedSize > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("multipart_invalid");
    }
    const head = await headMediaObject(previewState.attempt.uploadObjectKey, signal);
    if (head.ContentLength === undefined) throw new QuestionBankXlsxImportError("attempt_invalid");
    if (head.ContentLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("xlsx_too_large");
    }
    const workbookBytes = await readPrivateStagingObject(
      previewState.attempt.uploadObjectKey,
      QUESTION_BANK_XLSX_LIMITS.workbookBytes,
      signal,
    );
    if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    if (workbookBytes.byteLength === 0) {
      throw new QuestionBankXlsxImportError("attempt_invalid");
    }
    if (workbookBytes.byteLength > QUESTION_BANK_XLSX_LIMITS.workbookBytes) {
      throw new QuestionBankXlsxImportError("xlsx_too_large");
    }
    if (workbookBytes.byteLength !== expectedSize || head.ContentLength !== expectedSize || head.ContentLength !== workbookBytes.byteLength) {
      throw new QuestionBankXlsxImportError("attempt_invalid");
    }
    return { attempt: previewState.attempt, replay: false as const, workbookBytes };
  } catch (error) {
    if (signal?.aborted || error instanceof QuestionBankXlsxImportError && error.code === "attempt_cancelled") {
      throw new QuestionBankXlsxImportError("attempt_cancelled");
    }
    const code = error instanceof QuestionBankXlsxImportError
      ? error.code
      : error instanceof PrivateStagingObjectTooLargeError
        ? "xlsx_too_large"
        : "xlsx_upload_missing";
    const rejected = await rejectQuestionBankXlsxPreview(ownerUserId, attemptId, code);
    if (!rejected) throw new QuestionBankXlsxImportError("attempt_cancelled");
    throw new QuestionBankXlsxImportError(code);
  }
}

async function rejectQuestionBankXlsxPreview(
  ownerUserId: string,
  attemptId: string,
  errorCode: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (!current || current.ownerUserId !== ownerUserId || current.cancelRequestedAt) return false;
    if (current.state !== QuestionBankXlsxImportAttemptState.previewing) return true;
    const expiry = new Date(Date.now() + CLEANUP_RETRY_DELAY_MS);
    await tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiry,
        lastErrorCode: errorCode,
        operationLeaseExpiresAt: null,
        state: QuestionBankXlsxImportAttemptState.failed,
      },
      where: { id: attemptId },
    });
    return true;
  });
}

async function persistQuestionBankXlsxPreview(input: QuestionBankXlsxUploadPreviewInput) {
  if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
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
        || current.cancelRequestedAt
      ) {
        throw new QuestionBankXlsxImportError(current?.cancelRequestedAt ? "attempt_cancelled" : "attempt_busy");
      }
      if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
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
      if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
      const batch = imagePayloads.slice(offset, offset + 8);
      const results = await Promise.allSettled(batch.map((image) =>
        putPrivateStagingObject(image.objectKey, image.bytes, image.mimeType, input.signal),
      ));
      if (results.some((result) => result.status === "rejected")) {
        if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
    }
    if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    await putPrivateStagingObject(manifestObjectKey, manifestBytes, MANIFEST_MIME_TYPE, input.signal);
    if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");

    const completed = await prisma.questionBankXlsxImportAttempt.updateMany({
      data: {
        operationLeaseExpiresAt: null,
        state: QuestionBankXlsxImportAttemptState.previewed,
      },
      where: {
        cancelRequestedAt: null,
        id: input.attemptId,
        ownerUserId: input.ownerUserId,
        state: QuestionBankXlsxImportAttemptState.previewing,
      },
    });
    if (completed.count !== 1) {
      const current = await prisma.questionBankXlsxImportAttempt.findUnique({
        select: { cancelRequestedAt: true },
        where: { id: input.attemptId },
      });
      throw new QuestionBankXlsxImportError(current?.cancelRequestedAt ? "attempt_cancelled" : "attempt_busy");
    }
    return { manifest, previewImageIndex };
  } catch (error) {
    const current = attempt ?? await prisma.questionBankXlsxImportAttempt.findUnique({
      where: { id: input.attemptId },
    });
    if (current && current.ownerUserId === input.ownerUserId) {
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM question_bank_xlsx_import_attempts
          WHERE id = ${input.attemptId}::uuid
          FOR UPDATE
        `;
        const latest = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: input.attemptId } });
        if (
          !latest
          || latest.ownerUserId !== input.ownerUserId
          || latest.state !== QuestionBankXlsxImportAttemptState.previewing
        ) return;
        const cancelled = Boolean(latest.cancelRequestedAt || input.signal?.aborted);
        await tx.questionBankXlsxImportAttempt.update({
          data: {
            expiresAt: new Date(now.getTime() + CLEANUP_RETRY_DELAY_MS),
            lastErrorCode: cancelled ? "attempt_cancelled" : "preview_storage_failed",
            manifestObjectKey: null,
            manifestSha256: null,
            operationLeaseExpiresAt: null,
            previewImageIndex: [],
            state: cancelled
              ? QuestionBankXlsxImportAttemptState.cleanup_pending
              : QuestionBankXlsxImportAttemptState.failed,
            ...(cancelled ? { cancelRequestedAt: latest.cancelRequestedAt ?? now } : {}),
          },
          where: { id: input.attemptId },
        });
      });
    }
    if (error instanceof QuestionBankXlsxImportError) throw error;
    if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
}

async function readQuestionBankXlsxPreview(ownerUserId: string, attemptId: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
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
    signal,
  );
  if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
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

async function markQuestionBankXlsxCancellation(
  ownerUserId: string,
  attemptId: string,
  errorCode = "attempt_cancelled",
) {
  const result = await prisma.$transaction(async (tx) => {
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
      current.state === QuestionBankXlsxImportAttemptState.applying
      || current.state === QuestionBankXlsxImportAttemptState.completed
    ) {
      throw new QuestionBankXlsxImportError("attempt_busy");
    }
    const now = new Date();
    const inFlightStates = new Set<QuestionBankXlsxImportAttemptState>([
      QuestionBankXlsxImportAttemptState.multipart_creating,
      QuestionBankXlsxImportAttemptState.multipart_completing,
      QuestionBankXlsxImportAttemptState.previewing,
    ]);
    const inFlight = inFlightStates.has(current.state)
      && Boolean(current.operationLeaseExpiresAt && current.operationLeaseExpiresAt > now);
    const state = inFlight ? current.state : QuestionBankXlsxImportAttemptState.cleanup_pending;
    const operationLeaseExpiresAt = inFlight ? current.operationLeaseExpiresAt : null;
    const expiresAt = operationLeaseExpiresAt
      ? expiresAfterOperation(operationLeaseExpiresAt)
      : nextCleanupAttemptAt(now.getTime());
    const updated = await tx.questionBankXlsxImportAttempt.update({
      data: {
        cancelRequestedAt: current.cancelRequestedAt ?? now,
        expiresAt,
        lastErrorCode: errorCode,
        operationLeaseExpiresAt,
        state,
      },
      where: { id: attemptId },
    });
    return { attempt: updated, readyForCleanup: state === QuestionBankXlsxImportAttemptState.cleanup_pending };
  });
  abortActiveQuestionBankXlsxPreview(attemptId, new QuestionBankXlsxImportError("attempt_cancelled"));
  if (result.readyForCleanup) await cleanupCancelledQuestionBankXlsxAttempt(result.attempt);
}

async function finishQuestionBankXlsxCancellation(ownerUserId: string, attemptId: string) {
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (!current || current.ownerUserId !== ownerUserId || !current.cancelRequestedAt) return null;
    return tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: nextCleanupAttemptAt(),
        operationLeaseExpiresAt: null,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
      where: { id: attemptId },
    });
  });
  if (attempt) await cleanupCancelledQuestionBankXlsxAttempt(attempt);
}

function isMissingMultipartUploadError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return value.name === "NoSuchUpload" || value.name === "NoSuchUploadError"
    || value.$metadata?.httpStatusCode === 404;
}

async function removeAttemptStaging(attempt: {
  createdAt: Date;
  id: string;
  multipartUploadId: string | null;
  operationLeaseExpiresAt: Date | null;
  stagedObjectKeys: Prisma.JsonValue;
  uploadExpiresAt: Date;
  uploadObjectKey: string;
}, ownerUserId: string, leaseExpiresAt: Date) {
  const persistRetentionCutoff = async (candidate: Date) => prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attempt.id}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attempt.id } });
    if (
      !current
      || current.ownerUserId !== ownerUserId
      || current.state !== QuestionBankXlsxImportAttemptState.cleanup_pending
      || current.operationLeaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
    ) return null;
    const retentionCutoff = laterDate(current.uploadExpiresAt, candidate);
    if (retentionCutoff.getTime() === current.uploadExpiresAt.getTime()) return retentionCutoff;
    const updated = await tx.questionBankXlsxImportAttempt.updateMany({
      data: { uploadExpiresAt: retentionCutoff },
      where: {
        id: attempt.id,
        operationLeaseExpiresAt: leaseExpiresAt,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
    });
    return updated.count === 1 ? retentionCutoff : null;
  });

  const cutoffForDiscoveredUploads = (uploads: Awaited<ReturnType<typeof listPrivateStagingMultipartUploads>>) => {
    const now = new Date();
    return uploads.map((upload) => {
      const initiatedAt = upload.initiatedAt;
      return initiatedAt && Number.isFinite(initiatedAt.getTime())
        ? multipartCleanupDeadline(initiatedAt)
        : multipartCleanupDeadline(now);
    });
  };

  let retentionCutoff = laterDate(attempt.uploadExpiresAt, multipartCleanupDeadline(attempt.createdAt));
  const firstPersistedCutoff = await persistRetentionCutoff(retentionCutoff);
  if (!firstPersistedCutoff) return null;
  retentionCutoff = firstPersistedCutoff;

  let active = await listPrivateStagingMultipartUploads(attempt.uploadObjectKey);
  for (let sweep = 0; sweep < 2; sweep += 1) {
    const discoveredCutoffs = cutoffForDiscoveredUploads(active);
    if (discoveredCutoffs.length) {
      const persistedCutoff = await persistRetentionCutoff(laterDate(retentionCutoff, ...discoveredCutoffs));
      if (!persistedCutoff) return null;
      retentionCutoff = persistedCutoff;
    }

    const multipartIds = new Set<string>();
    if (attempt.multipartUploadId) multipartIds.add(attempt.multipartUploadId);
    for (const upload of active) if (upload.uploadId) multipartIds.add(upload.uploadId);
    for (const multipartUploadId of multipartIds) {
      try {
        await abortPrivateStagingMultipartUpload(attempt.uploadObjectKey, multipartUploadId);
      } catch (error) {
        if (!isMissingMultipartUploadError(error)) throw error;
      }
    }
    active = await listPrivateStagingMultipartUploads(attempt.uploadObjectKey);
  }

  const finalDiscoveredCutoffs = cutoffForDiscoveredUploads(active);
  if (finalDiscoveredCutoffs.length) {
    const persistedCutoff = await persistRetentionCutoff(laterDate(retentionCutoff, ...finalDiscoveredCutoffs));
    if (!persistedCutoff) return null;
    retentionCutoff = persistedCutoff;
  }
  await deletePrivateStagingObjects(parseStagedObjectKeys(attempt.stagedObjectKeys, attempt.id));
  return { activeMultipartUploads: active.length > 0, retentionCutoff };
}

async function cleanupCancelledQuestionBankXlsxAttempt(attempt: {
  createdAt: Date;
  id: string;
  multipartUploadId: string | null;
  operationLeaseExpiresAt: Date | null;
  stagedObjectKeys: Prisma.JsonValue;
  uploadExpiresAt: Date;
  uploadObjectKey: string;
}) {
  const now = new Date();
  const leaseExpiresAt = operationLeaseUntil(now.getTime());
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attempt.id}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attempt.id } });
    if (
      !current
      || current.state !== QuestionBankXlsxImportAttemptState.cleanup_pending
      || !current.cancelRequestedAt
      || (current.operationLeaseExpiresAt && current.operationLeaseExpiresAt > now)
    ) return null;
    return tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiresAfterOperation(leaseExpiresAt),
        operationLeaseExpiresAt: leaseExpiresAt,
      },
      where: { id: attempt.id },
    });
  });
  if (!claimed) return;

  try {
    const sweep = await removeAttemptStaging(claimed, claimed.ownerUserId, leaseExpiresAt);
    if (!sweep) return;
    const beforeRetentionCutoff = sweep.retentionCutoff > new Date();
    if (sweep.activeMultipartUploads || beforeRetentionCutoff) {
      // R2's documented seven-day incomplete-MPU lifecycle is the practical
      // retention bound, with a 24-hour grace. Keep the exact-key tombstone and
      // repeat list/abort sweeps hourly until that cutoff has passed and no
      // upload remains visible. Lifecycle execution/drain has no documented
      // hard maximum, so a still-visible upload keeps the tombstone indefinitely.
      await prisma.questionBankXlsxImportAttempt.updateMany({
        data: {
          expiresAt: nextMultipartCleanupSweepAt(),
          uploadExpiresAt: sweep.retentionCutoff,
          operationLeaseExpiresAt: null,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
        where: {
          id: claimed.id,
          operationLeaseExpiresAt: leaseExpiresAt,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
      });
      return;
    }
    await prisma.questionBankXlsxImportAttempt.deleteMany({
      where: {
        id: claimed.id,
        operationLeaseExpiresAt: leaseExpiresAt,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
    });
  } catch {
    await prisma.questionBankXlsxImportAttempt.updateMany({
      data: {
        expiresAt: nextCleanupAttemptAt(),
        operationLeaseExpiresAt: null,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
      where: {
        id: claimed.id,
        operationLeaseExpiresAt: leaseExpiresAt,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
    });
  }
}

async function recoverExpiredMultipartCompletion(attempt: {
  cancelRequestedAt: Date | null;
  expectedMultipartPartCount: number | null;
  expectedWorkbookSizeBytes: number | null;
  id: string;
  multipartUploadId: string | null;
  operationLeaseExpiresAt: Date | null;
  uploadObjectKey: string;
}, leaseExpiresAt: Date) {
  const expectedSize = attempt.expectedWorkbookSizeBytes;
  const multipartUploadId = attempt.multipartUploadId;
  const partCount = attempt.expectedMultipartPartCount;
  if (!expectedSize || !multipartUploadId || !partCount) return false;
  let exists = false;
  try {
    const head = await headMediaObject(attempt.uploadObjectKey);
    const actualSize = head.ContentLength;
    exists = actualSize === expectedSize;
    if (actualSize === undefined || !exists || actualSize > QUESTION_BANK_XLSX_LIMITS.workbookBytes) return false;
  } catch (error) {
    if (!isMissingStagingObjectError(error)) throw error;
  }
  if (!exists) {
    const parts = await listPrivateStagingMultipartParts(attempt.uploadObjectKey, multipartUploadId);
    const completionParts = await validateListedMultipartParts(parts, expectedSize, partCount);
    if (!completionParts) return false;
    await completePrivateStagingMultipartUpload(attempt.uploadObjectKey, multipartUploadId, completionParts);
    const head = await headMediaObject(attempt.uploadObjectKey);
    const actualSize = head.ContentLength;
    if (actualSize === undefined || actualSize !== expectedSize || actualSize > QUESTION_BANK_XLSX_LIMITS.workbookBytes) return false;
  }
  const now = new Date();
  const recovered = await prisma.questionBankXlsxImportAttempt.updateMany({
    data: {
      expiresAt: new Date(now.getTime() + QUESTION_BANK_XLSX_LIMITS.previewExpiresMs),
      operationLeaseExpiresAt: null,
      state: QuestionBankXlsxImportAttemptState.upload_complete,
    },
    where: {
      cancelRequestedAt: null,
      id: attempt.id,
      operationLeaseExpiresAt: leaseExpiresAt,
      state: QuestionBankXlsxImportAttemptState.multipart_completing,
    },
  });
  return recovered.count === 1;
}

async function cleanupExpiredQuestionBankXlsxImportAttempts(now = new Date()) {
  const expiredAttempts = await prisma.questionBankXlsxImportAttempt.findMany({
    orderBy: { expiresAt: "asc" },
    select: { id: true },
    take: CLEANUP_BATCH_SIZE,
    where: {
      expiresAt: { lte: now },
      OR: [
        { operationLeaseExpiresAt: null },
        { operationLeaseExpiresAt: { lte: now } },
      ],
      state: {
        in: [
          QuestionBankXlsxImportAttemptState.upload_pending,
          QuestionBankXlsxImportAttemptState.multipart_creating,
          QuestionBankXlsxImportAttemptState.multipart_uploading,
          QuestionBankXlsxImportAttemptState.multipart_completing,
          QuestionBankXlsxImportAttemptState.upload_complete,
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
    const prepared = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${candidate.id}::uuid
        FOR UPDATE
      `;
      const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: candidate.id } });
      if (
        !current
        || current.expiresAt > now
        || current.state === QuestionBankXlsxImportAttemptState.applying
        || (current.operationLeaseExpiresAt && current.operationLeaseExpiresAt > now)
      ) return null;
      const leaseExpiresAt = operationLeaseUntil(now.getTime());
      const recoverCompletion = current.state === QuestionBankXlsxImportAttemptState.multipart_completing
        && !current.cancelRequestedAt;
      const attempt = await tx.questionBankXlsxImportAttempt.update({
        data: recoverCompletion
          ? {
            expiresAt: expiresAfterOperation(leaseExpiresAt),
            operationLeaseExpiresAt: leaseExpiresAt,
          }
          : {
            cancelRequestedAt: current.cancelRequestedAt ?? now,
            expiresAt: expiresAfterOperation(leaseExpiresAt),
            operationLeaseExpiresAt: leaseExpiresAt,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
          },
        where: { id: current.id },
      });
      return { attempt, leaseExpiresAt, recoverCompletion };
    });
    if (!prepared) continue;

    if (prepared.recoverCompletion) {
      try {
        const recovered = await recoverExpiredMultipartCompletion(prepared.attempt, prepared.leaseExpiresAt);
        if (recovered) {
          cleaned += 0;
          continue;
        }
        await prisma.questionBankXlsxImportAttempt.updateMany({
          data: {
            cancelRequestedAt: new Date(),
            expiresAt: new Date(Date.now() + CLEANUP_RETRY_DELAY_MS),
            operationLeaseExpiresAt: null,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
          },
          where: {
            id: prepared.attempt.id,
            operationLeaseExpiresAt: prepared.leaseExpiresAt,
            state: QuestionBankXlsxImportAttemptState.multipart_completing,
          },
        });
        deferred += 1;
        continue;
      } catch {
        await prisma.questionBankXlsxImportAttempt.updateMany({
          data: {
            expiresAt: new Date(Date.now() + CLEANUP_RETRY_DELAY_MS),
            operationLeaseExpiresAt: null,
          },
          where: {
            id: prepared.attempt.id,
            operationLeaseExpiresAt: prepared.leaseExpiresAt,
            state: QuestionBankXlsxImportAttemptState.multipart_completing,
          },
        });
        deferred += 1;
        continue;
      }
    }

    try {
      const sweep = await removeAttemptStaging(
        prepared.attempt,
        prepared.attempt.ownerUserId,
        prepared.leaseExpiresAt,
      );
      if (!sweep) {
        deferred += 1;
        continue;
      }
      if (sweep.activeMultipartUploads || sweep.retentionCutoff > new Date()) {
        await prisma.questionBankXlsxImportAttempt.updateMany({
          data: {
            expiresAt: nextMultipartCleanupSweepAt(),
            operationLeaseExpiresAt: null,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
            uploadExpiresAt: sweep.retentionCutoff,
          },
          where: {
            id: prepared.attempt.id,
            operationLeaseExpiresAt: prepared.leaseExpiresAt,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
          },
        });
        deferred += 1;
        continue;
      }
      const deleted = await prisma.questionBankXlsxImportAttempt.deleteMany({
        where: {
          id: prepared.attempt.id,
          operationLeaseExpiresAt: prepared.leaseExpiresAt,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
      });
      cleaned += deleted.count;
    } catch {
      await prisma.questionBankXlsxImportAttempt.updateMany({
        data: {
          expiresAt: new Date(Date.now() + CLEANUP_RETRY_DELAY_MS),
          operationLeaseExpiresAt: null,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
        where: {
          id: prepared.attempt.id,
          operationLeaseExpiresAt: prepared.leaseExpiresAt,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
      });
      deferred += 1;
    }
  }

  return { cleaned, deferred };
}

async function discardQuestionBankXlsxPreview(ownerUserId: string, attemptId: string) {
  await markQuestionBankXlsxCancellation(ownerUserId, attemptId);
}

export {
  CLEANUP_RETRY_DELAY_MS,
  QuestionBankXlsxImportError,
  beginQuestionBankXlsxPreview,
  cleanupExpiredQuestionBankXlsxImportAttempts,
  createImageObjectKey,
  createQuestionBankXlsxUploadGrant,
  completeQuestionBankXlsxUpload,
  discardQuestionBankXlsxPreview,
  finishQuestionBankXlsxCancellation,
  markQuestionBankXlsxCancellation,
  parseImageIndex,
  parseStagedObjectKeys,
  persistQuestionBankXlsxPreview,
  readQuestionBankXlsxPreview,
  rejectQuestionBankXlsxPreview,
  registerQuestionBankXlsxPreviewController,
  watchQuestionBankXlsxPreviewCancellation,
  sha256,
};

export type {
  QuestionBankXlsxImportErrorCode,
  QuestionBankXlsxPreviewAttempt,
  QuestionBankXlsxUploadGrant,
  QuestionBankXlsxUploadPreviewInput,
};
