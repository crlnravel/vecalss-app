import "server-only";

import { randomUUID, createHash } from "node:crypto";

import {
  MediaAssetState,
  MediaLibraryScope,
  Prisma,
  QuestionBankXlsxImportAssetState,
  QuestionBankXlsxImportAttemptState,
} from "@/generated/prisma/client";
import { buildMediaObjectKey } from "@/lib/media/domain";
import {
  abortPrivateStagingMultipartUpload,
  completePrivateStagingMultipartUpload,
  createPrivateStagingMultipartUpload,
  createPrivateStagingUploadPartUrl,
  deletePrivateStagingObjects,
  deleteKaptenImageObject,
  headMediaObject,
  listPrivateStagingMultipartParts,
  listPrivateStagingMultipartUploads,
  PrivateStagingObjectTooLargeError,
  putPrivateStagingObject,
  putKaptenImageObject,
  readPrivateStagingObject,
} from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";
import { ensureQuestionBankMediaFolder, reserveDraftQuestionBankMediaFolder } from "@/lib/question-bank/media-folder";
import {
  findQuestionBankImageReferences,
  lockAndValidateKaptenBankImages,
  lockAndPrepareKaptenBankImageCleanup,
} from "@/lib/question-bank/media-validator";
import {
  applyQuestionBankRowsInTransaction,
  previewQuestionBankCsvOverwriteImpact,
  QuestionBankCsvMutationError,
  type QuestionBankCsvApplyResult,
  type QuestionBankCsvImportMode,
  type QuestionBankCsvOverwriteImpact,
  type QuestionBankCsvOverwriteImpactSnapshot,
} from "@/lib/question-bank/csv-repository";
import type { AuthoringEditLease } from "@/lib/serialization/authoring-lease";
import { setTransactionLockTimeout } from "@/lib/serialization/locks";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import type { QuestionBankCsvRow } from "./csv";
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
  | "attempt_target_mismatch"
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
  normalizedRowIndexByWorksheetRef: ReadonlyMap<string, number>;
  ownerUserId: string;
  previewImageIndex: QuestionBankXlsxPreviewImageIndex[];
};

function worksheetRefKey(sheetName: string, row: number) {
  return `${sheetName}\u0000${row}`;
}

function isValidWorksheetName(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 31
    && !/[\\/*?:\[\]\u0000-\u001f]/u.test(value)
    && !value.startsWith("'")
    && !value.endsWith("'");
}

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
        !isValidWorksheetName(typed.sheetName)
        || typeof typed.row !== "number"
        || !Number.isSafeInteger(typed.row)
        || typed.row < 2
        || typed.row > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows
        || typeof typed.field !== "string"
        || !/^(prompt_image|option_[a-e]_image|explanation_image)$/u.test(typed.field)
      ) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
      return { field: typed.field, row: typed.row, sheetName: typed.sheetName };
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

async function readQuestionBankXlsxPreviewInternal(
  ownerUserId: string,
  attemptId: string,
  signal: AbortSignal | undefined,
  applying: boolean,
) {
  if (signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
  const attempt = await prisma.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.ownerUserId !== ownerUserId) {
    throw new QuestionBankXlsxImportError("attempt_not_found");
  }
  if (
    attempt.state !== (applying
      ? QuestionBankXlsxImportAttemptState.applying
      : QuestionBankXlsxImportAttemptState.previewed)
    || attempt.cancelRequestedAt
    || (!applying && (!attempt.previewExpiresAt || attempt.previewExpiresAt <= new Date()))
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
    || manifest.schemaVersion !== 3
    || !Array.isArray(manifest.normalizedRows)
    || manifest.normalizedRows.length > QUESTION_BANK_XLSX_LIMITS.dataRows
    || !Array.isArray(manifest.normalizedRowWorksheetRefs)
    || manifest.normalizedRowWorksheetRefs.length !== manifest.normalizedRows.length
    || !Array.isArray(manifest.imageSlots)
    || manifest.imageSlots.length > QUESTION_BANK_XLSX_LIMITS.imagePlacements
    || !Array.isArray(manifest.images)
    || manifest.images.length > QUESTION_BANK_XLSX_LIMITS.zipImagePayloads
    || !manifest.summary
    || typeof manifest.summary !== "object"
  ) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  const normalizedRowIndexByWorksheetRef = new Map<string, number>();
  const previousWorksheetRowBySheet = new Map<string, number>();
  for (const [normalizedRowIndex, worksheetRef] of manifest.normalizedRowWorksheetRefs.entries()) {
    const worksheetRow = worksheetRef?.row;
    const sheetName = worksheetRef?.sheetName;
    const previousWorksheetRow = isValidWorksheetName(sheetName)
      ? previousWorksheetRowBySheet.get(sheetName) ?? 1
      : 1;
    if (
      !Number.isSafeInteger(worksheetRow)
      || !isValidWorksheetName(sheetName)
      || worksheetRow < 2
      || worksheetRow > QUESTION_BANK_XLSX_LIMITS.physicalWorksheetRows
      || worksheetRow <= previousWorksheetRow
    ) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    const key = worksheetRefKey(sheetName, worksheetRow);
    if (normalizedRowIndexByWorksheetRef.has(key)) throw new QuestionBankXlsxImportError("attempt_unavailable");
    normalizedRowIndexByWorksheetRef.set(key, normalizedRowIndex);
    previousWorksheetRowBySheet.set(sheetName, worksheetRow);
  }
  const previewImageIndex = parseImageIndex(attempt.previewImageIndex, attemptId);
  if (manifest.images.length !== previewImageIndex.length) {
    throw new QuestionBankXlsxImportError("attempt_unavailable");
  }
  const indexedByHash = new Map(previewImageIndex.map((image) => [image.contentSha256, image]));
  const manifestPlacements = new Set<string>();
  const indexedPlacements = new Set(previewImageIndex.flatMap((image) =>
    image.placements.map((placement) => `${placement.sheetName}\u0000${placement.row}:${placement.field}:${image.contentSha256}`),
  ));
  for (const slot of manifest.imageSlots) {
    if (
      !slot
      || !isValidWorksheetName(slot.sheetName)
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
    const key = `${slot.sheetName}\u0000${slot.row}:${slot.field}`;
    if (manifestPlacements.has(key)) throw new QuestionBankXlsxImportError("attempt_unavailable");
    const normalizedRowIndex = normalizedRowIndexByWorksheetRef.get(worksheetRefKey(slot.sheetName, slot.row));
    const normalizedRow = normalizedRowIndex === undefined
      ? undefined
      : manifest.normalizedRows[normalizedRowIndex];
    if (!normalizedRow) throw new QuestionBankXlsxImportError("attempt_unavailable");
    if (slot.field.startsWith("option_")) {
      if (!Array.isArray(normalizedRow.options)) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
      const optionLabel = slot.field.slice("option_".length, "option_".length + 1).toUpperCase();
      if (!normalizedRow.options.some((option) => option?.label === optionLabel)) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
    }
    manifestPlacements.add(key);
    indexedPlacements.delete(`${slot.sheetName}\u0000${slot.row}:${slot.field}:${slot.contentSha256}`);
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
    || !Number.isSafeInteger(manifest.summary.questionSheetCount)
    || manifest.summary.questionSheetCount < 1
    || manifest.summary.questionSheetCount > QUESTION_BANK_XLSX_LIMITS.worksheets
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
    normalizedRowIndexByWorksheetRef,
    previewImageIndex,
  };
}

async function readQuestionBankXlsxPreview(ownerUserId: string, attemptId: string, signal?: AbortSignal) {
  return readQuestionBankXlsxPreviewInternal(ownerUserId, attemptId, signal, false);
}

async function readQuestionBankXlsxPreviewForApply(ownerUserId: string, attemptId: string, signal?: AbortSignal) {
  return readQuestionBankXlsxPreviewInternal(ownerUserId, attemptId, signal, true);
}

type QuestionBankXlsxApplyTarget = {
  attemptId: string;
  ownerUserId: string;
  targetBankId: string | null;
  targetMode: QuestionBankCsvImportMode | "draft";
  requestedReservationId?: string;
};

type QuestionBankXlsxApplyClaim = {
  attempt: {
    createdAt: Date;
    id: string;
    multipartUploadId: string | null;
    operationLeaseExpiresAt: Date | null;
    stagedObjectKeys: Prisma.JsonValue;
    uploadExpiresAt: Date;
    uploadObjectKey: string;
  };
  leaseExpiresAt: Date;
  mediaFolderReservationId: string | null;
};

type QuestionBankXlsxApplyClaimOutcome =
  | { kind: "replay"; result: Prisma.JsonValue }
  | { claim: QuestionBankXlsxApplyClaim; kind: "claimed" };

type QuestionBankXlsxBankApplyResult = QuestionBankCsvApplyResult & {
  imageAssetIds: string[];
  overwriteImpact: QuestionBankCsvOverwriteImpact | null;
  previewId: string;
};

type QuestionBankXlsxDraftApplyResult = {
  imageAssetIds: string[];
  mediaFolderReservationId: string;
  normalizedRows: QuestionBankCsvRow[];
  previewId: string;
};

type QuestionBankXlsxAttemptAsset = {
  assetId: string;
  contentSha256: string;
  height: number;
  mimeType: string;
  objectKey: string;
  sizeBytes: number;
  width: number;
};

const questionBankXlsxApplyCompletedRetentionMs =
  QUESTION_BANK_XLSX_LIMITS.completedAttemptRetentionMs;

async function claimQuestionBankXlsxApplyAttempt(input: QuestionBankXlsxApplyTarget): Promise<QuestionBankXlsxApplyClaimOutcome> {
  if (
    !isUuid(input.attemptId)
    || !isUuid(input.ownerUserId)
    || (input.targetBankId !== null && !isUuid(input.targetBankId))
    || (input.targetMode === "draft" && input.targetBankId !== null)
    || (input.targetMode !== "draft" && input.targetBankId === null)
    || (input.requestedReservationId !== undefined && !isUuid(input.requestedReservationId))
  ) {
    throw new QuestionBankXlsxImportError("attempt_invalid");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${input.attemptId}::uuid
      FOR UPDATE
    `;
    const current = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: input.attemptId } });
    if (!current || current.ownerUserId !== input.ownerUserId) {
      throw new QuestionBankXlsxImportError("attempt_not_found");
    }

    const firstClaim = current.targetMode === null && current.targetBankId === null;
    const targetMatches = current.targetBankId === input.targetBankId
      && current.targetMode === input.targetMode;
    const reservationMatches = input.targetMode !== "draft"
      || input.requestedReservationId === undefined
      || current.mediaFolderReservationId === input.requestedReservationId;
    if ((!firstClaim && !targetMatches) || !reservationMatches) {
      throw new QuestionBankXlsxImportError("attempt_target_mismatch");
    }

    const now = new Date();
    if (current.state === QuestionBankXlsxImportAttemptState.completed) {
      if (current.expiresAt <= now) throw new QuestionBankXlsxImportError("attempt_expired");
      if (!current.result || !targetMatches || !reservationMatches) {
        throw new QuestionBankXlsxImportError("attempt_target_mismatch");
      }
      return { kind: "replay", result: current.result as Prisma.JsonValue };
    }
    if (current.state === QuestionBankXlsxImportAttemptState.applying) {
      if (current.operationLeaseExpiresAt && current.operationLeaseExpiresAt > now) {
        throw new QuestionBankXlsxImportError("attempt_busy");
      }
    } else if (
      current.state !== QuestionBankXlsxImportAttemptState.previewed
      || current.previewExpiresAt === null
      || current.previewExpiresAt <= now
      || !current.manifestObjectKey
    ) {
      throw new QuestionBankXlsxImportError("attempt_expired");
    }
    if (current.cancelRequestedAt) throw new QuestionBankXlsxImportError("attempt_cancelled");

    const leaseExpiresAt = operationLeaseUntil(now.getTime());
    const mediaFolderReservationId = input.targetMode === "draft"
      ? current.mediaFolderReservationId ?? input.requestedReservationId ?? randomUUID()
      : null;
    const attempt = await tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiresAfterOperation(leaseExpiresAt),
        lastErrorCode: null,
        mediaFolderReservationId,
        operationLeaseExpiresAt: leaseExpiresAt,
        state: QuestionBankXlsxImportAttemptState.applying,
        targetBankId: input.targetBankId,
        targetMode: input.targetMode,
      },
      where: { id: input.attemptId },
    });
    const claim: QuestionBankXlsxApplyClaim = {
      attempt: {
        createdAt: attempt.createdAt,
        id: attempt.id,
        multipartUploadId: attempt.multipartUploadId,
        operationLeaseExpiresAt: attempt.operationLeaseExpiresAt,
        stagedObjectKeys: attempt.stagedObjectKeys,
        uploadExpiresAt: attempt.uploadExpiresAt,
        uploadObjectKey: attempt.uploadObjectKey,
      },
      leaseExpiresAt,
      mediaFolderReservationId,
    };
    return { claim, kind: "claimed" };
  }, { maxWait: 5_000, timeout: 30_000 });
}

async function assertQuestionBankXlsxApplyClaim(
  tx: Prisma.TransactionClient,
  input: QuestionBankXlsxApplyTarget,
  leaseExpiresAt: Date,
  mediaFolderReservationId: string | null,
) {
  const attempt = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: input.attemptId } });
  if (
    !attempt
    || attempt.ownerUserId !== input.ownerUserId
    || attempt.state !== QuestionBankXlsxImportAttemptState.applying
    || attempt.operationLeaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
    || attempt.targetBankId !== input.targetBankId
    || attempt.targetMode !== input.targetMode
    || attempt.mediaFolderReservationId !== mediaFolderReservationId
    || attempt.cancelRequestedAt
  ) {
    throw new QuestionBankXlsxImportError("attempt_busy");
  }
  return attempt;
}

async function ensureQuestionBankXlsxAttemptAssets(
  input: QuestionBankXlsxApplyTarget,
  claim: QuestionBankXlsxApplyClaim,
  destinationFolderId: string,
  images: readonly Omit<QuestionBankXlsxAttemptAsset, "assetId" | "objectKey">[],
) {
  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${input.attemptId}::uuid
      FOR UPDATE
    `;
    await assertQuestionBankXlsxApplyClaim(
      tx,
      input,
      claim.leaseExpiresAt,
      claim.mediaFolderReservationId,
    );

    const owned = await tx.questionBankXlsxImportAttemptAsset.findMany({
      include: { asset: true },
      orderBy: { contentSha256: "asc" },
      where: { attemptId: input.attemptId },
    });
    const byHash = new Map(owned.map((asset) => [asset.contentSha256, asset]));
    if (owned.some((asset) => !images.some((image) => image.contentSha256 === asset.contentSha256))) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }

    const result: QuestionBankXlsxAttemptAsset[] = [];
    for (const image of [...images].sort((left, right) => left.contentSha256.localeCompare(right.contentSha256))) {
      const existing = byHash.get(image.contentSha256);
      if (existing) {
        const expectedObjectKey = buildMediaObjectKey(
          "kapten",
          existing.assetId,
          image.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        );
        if (
          existing.state !== QuestionBankXlsxImportAssetState.pending
          || existing.objectKey !== expectedObjectKey
          || existing.mimeType !== image.mimeType
          || existing.sizeBytes !== image.sizeBytes
          || existing.width !== image.width
          || existing.height !== image.height
          || existing.asset.state !== MediaAssetState.pending
          || existing.asset.libraryScope !== MediaLibraryScope.kapten
          || existing.asset.folderId !== destinationFolderId
          || existing.asset.objectKey !== existing.objectKey
          || existing.asset.mimeType !== image.mimeType
          || existing.asset.sizeBytes !== image.sizeBytes
          || existing.asset.width !== image.width
          || existing.asset.height !== image.height
          || existing.asset.checksum !== image.contentSha256
        ) {
          throw new QuestionBankXlsxImportError("attempt_unavailable");
        }
        result.push({
          assetId: existing.assetId,
          contentSha256: existing.contentSha256,
          height: existing.height,
          mimeType: existing.mimeType,
          objectKey: existing.objectKey,
          sizeBytes: existing.sizeBytes,
          width: existing.width,
        });
        continue;
      }

      const assetId = randomUUID();
      const objectKey = buildMediaObjectKey("kapten", assetId, image.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif");
      const createdAsset = await tx.asset.create({
        data: {
          checksum: image.contentSha256,
          folderId: destinationFolderId,
          height: image.height,
          libraryScope: MediaLibraryScope.kapten,
          mimeType: image.mimeType,
          objectKey,
          originalName: `xlsx-${image.contentSha256.slice(0, 16)}`,
          sizeBytes: image.sizeBytes,
          state: MediaAssetState.pending,
          uploadedByUserId: input.ownerUserId,
          width: image.width,
        },
      });
      await tx.questionBankXlsxImportAttemptAsset.create({
        data: {
          assetId,
          attemptId: input.attemptId,
          contentSha256: image.contentSha256,
          height: image.height,
          mimeType: image.mimeType,
          objectKey,
          sizeBytes: image.sizeBytes,
          state: QuestionBankXlsxImportAssetState.pending,
          width: image.width,
        },
      });
      result.push({
        assetId: createdAsset.id,
        contentSha256: image.contentSha256,
        height: image.height,
        mimeType: image.mimeType,
        objectKey,
        sizeBytes: image.sizeBytes,
        width: image.width,
      });
    }
    return result;
  }, { maxWait: 5_000, timeout: 30_000 });
}

async function readFrozenQuestionBankXlsxImages(
  preview: Awaited<ReturnType<typeof readQuestionBankXlsxPreviewForApply>>,
  signal?: AbortSignal,
) {
  const payloads = new Map<string, Uint8Array>();
  for (const image of preview.previewImageIndex) {
    if (signal?.aborted) throw signal.reason ?? new QuestionBankXlsxImportError("attempt_cancelled");
    const bytes = await readPrivateStagingObject(
      image.objectKey,
      QUESTION_BANK_XLSX_LIMITS.imageBytes,
      signal,
    );
    if (bytes.byteLength !== image.sizeBytes || sha256(bytes) !== image.contentSha256) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    payloads.set(image.contentSha256, bytes);
  }
  return payloads;
}

function applyImageAssetIdsToRows(
  rows: readonly QuestionBankCsvRow[],
  imageSlots: QuestionBankXlsxPreviewManifest["imageSlots"],
  normalizedRowIndexByWorksheetRef: ReadonlyMap<string, number>,
  assetIdByHash: ReadonlyMap<string, string>,
) {
  const mappedRows = rows.map((row) => ({ ...row, options: row.options.map((option) => ({ ...option })) }));
  for (const slot of imageSlots) {
    const normalizedRowIndex = normalizedRowIndexByWorksheetRef.get(worksheetRefKey(slot.sheetName, slot.row));
    const row = normalizedRowIndex === undefined ? undefined : mappedRows[normalizedRowIndex];
    const assetId = assetIdByHash.get(slot.contentSha256);
    if (!row || !assetId) throw new QuestionBankXlsxImportError("attempt_unavailable");
    switch (slot.field) {
      case "prompt_image":
        row.promptMediaAssetId = assetId;
        break;
      case "explanation_image":
        row.explanationMediaAssetId = assetId;
        break;
      case "option_a_image":
      case "option_b_image":
      case "option_c_image":
      case "option_d_image":
      case "option_e_image": {
        const label = slot.field.slice("option_".length, "option_".length + 1).toUpperCase();
        const option = row.options.find((item) => item.label === label);
        if (!option) throw new QuestionBankXlsxImportError("attempt_unavailable");
        option.assetId = assetId;
        if (label === "A") row.optionAMediaAssetId = assetId;
        if (label === "B") row.optionBMediaAssetId = assetId;
        if (label === "C") row.optionCMediaAssetId = assetId;
        if (label === "D") row.optionDMediaAssetId = assetId;
        if (label === "E") row.optionEMediaAssetId = assetId;
        break;
      }
      default:
        throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
  }
  return mappedRows;
}

async function previewQuestionBankXlsxBankOverwriteImpact(input: {
  actorId: string;
  attemptId: string;
  bankId: string;
  expectedRevision: number;
  signal?: AbortSignal;
}): Promise<QuestionBankCsvOverwriteImpactSnapshot> {
  const preview = await readQuestionBankXlsxPreview(input.actorId, input.attemptId, input.signal);
  if (input.signal?.aborted) throw new QuestionBankXlsxImportError("attempt_cancelled");
  const previewAssetIdByHash = new Map(
    preview.manifest.images.map((image) => [image.contentSha256, "preview-asset-" + image.contentSha256]),
  );
  const rows = applyImageAssetIdsToRows(
    preview.manifest.normalizedRows,
    preview.manifest.imageSlots,
    preview.normalizedRowIndexByWorksheetRef,
    previewAssetIdByHash,
  );
  return previewQuestionBankCsvOverwriteImpact({
    actorId: input.actorId,
    bankId: input.bankId,
    expectedRevision: input.expectedRevision,
    rows,
  });
}

async function uploadAndVerifyQuestionBankXlsxImages(
  attemptAssets: readonly QuestionBankXlsxAttemptAsset[],
  payloads: ReadonlyMap<string, Uint8Array>,
  signal?: AbortSignal,
) {
  for (const asset of attemptAssets) {
    if (signal?.aborted) throw signal.reason ?? new QuestionBankXlsxImportError("attempt_cancelled");
    const bytes = payloads.get(asset.contentSha256);
    if (!bytes || bytes.byteLength !== asset.sizeBytes || sha256(bytes) !== asset.contentSha256) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    await putKaptenImageObject(asset.objectKey, bytes, asset.mimeType, asset.contentSha256, signal);
    const head = await headMediaObject(asset.objectKey, signal);
    if (
      head.ContentLength !== asset.sizeBytes
      || head.ContentType?.toLowerCase() !== asset.mimeType
      || head.Metadata?.sha256 !== asset.contentSha256
    ) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
  }
}

async function completeQuestionBankXlsxAttemptAssets(
  tx: Prisma.TransactionClient,
  attemptId: string,
  assetIds: readonly string[],
) {
  if (!assetIds.length) return;
  const updated = await tx.questionBankXlsxImportAttemptAsset.updateMany({
    data: { state: QuestionBankXlsxImportAssetState.ready },
    where: {
      assetId: { in: [...assetIds] },
      attemptId,
      state: QuestionBankXlsxImportAssetState.pending,
    },
  });
  if (updated.count !== assetIds.length) throw new QuestionBankXlsxImportError("attempt_unavailable");
}

async function completeQuestionBankXlsxApplyAttempt<TResult extends QuestionBankXlsxBankApplyResult | QuestionBankXlsxDraftApplyResult>(
  tx: Prisma.TransactionClient,
  input: QuestionBankXlsxApplyTarget,
  claim: QuestionBankXlsxApplyClaim,
  result: TResult,
): Promise<TResult> {
  const now = new Date();
  const completedAt = now;
  const updated = await tx.questionBankXlsxImportAttempt.updateMany({
    data: {
      completedAt,
      expiresAt: new Date(now.getTime() + questionBankXlsxApplyCompletedRetentionMs),
      imageCount: result.imageAssetIds.length,
      lastErrorCode: null,
      operationLeaseExpiresAt: null,
      questionCount: "normalizedRows" in result ? result.normalizedRows.length : result.importedCount,
      result: result as unknown as Prisma.InputJsonValue,
      state: QuestionBankXlsxImportAttemptState.completed,
    },
    where: {
      id: input.attemptId,
      mediaFolderReservationId: claim.mediaFolderReservationId,
      operationLeaseExpiresAt: claim.leaseExpiresAt,
      ownerUserId: input.ownerUserId,
      state: QuestionBankXlsxImportAttemptState.applying,
      targetBankId: input.targetBankId,
      targetMode: input.targetMode,
    },
  });
  if (updated.count !== 1) throw new QuestionBankXlsxImportError("attempt_busy");
  return result;
}

async function completeQuestionBankXlsxAssetCleanup(
  attemptId: string,
  ownerUserId: string,
  leaseExpiresAt: Date,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM question_bank_xlsx_import_attempts
      WHERE id = ${attemptId}::uuid
      FOR UPDATE
    `;
    const attempt = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
    if (
      !attempt
      || attempt.ownerUserId !== ownerUserId
      || attempt.state !== QuestionBankXlsxImportAttemptState.cleanup_pending
      || attempt.operationLeaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
    ) return null;

    const owned = await tx.questionBankXlsxImportAttemptAsset.findMany({
      orderBy: { assetId: "asc" },
      where: { attemptId },
    });
    if (owned.some((entry) => entry.state !== QuestionBankXlsxImportAssetState.pending
      && entry.state !== QuestionBankXlsxImportAssetState.cleanup_pending)) {
      throw new QuestionBankXlsxImportError("attempt_unavailable");
    }
    await tx.questionBankXlsxImportAttemptAsset.updateMany({
      data: { state: QuestionBankXlsxImportAssetState.cleanup_pending },
      where: { attemptId, state: QuestionBankXlsxImportAssetState.pending },
    });
    const safeObjects = await lockAndPrepareKaptenBankImageCleanup(tx, owned.map((entry) => ({
      assetId: entry.assetId,
      objectKey: entry.objectKey,
    })));
    return { safeObjects };
  }, { maxWait: 5_000, timeout: 30_000 });
}

async function recordQuestionBankXlsxAssetCleanupFailure(
  attemptId: string,
  leaseExpiresAt: Date,
  errorCode: string,
) {
  await prisma.questionBankXlsxImportAttempt.updateMany({
    data: {
      expiresAt: nextCleanupAttemptAt(),
      lastErrorCode: errorCode,
      operationLeaseExpiresAt: null,
      state: QuestionBankXlsxImportAttemptState.cleanup_pending,
    },
    where: {
      id: attemptId,
      operationLeaseExpiresAt: leaseExpiresAt,
      state: QuestionBankXlsxImportAttemptState.cleanup_pending,
    },
  });
}

async function removeQuestionBankXlsxAttemptAssets(
  attemptId: string,
  ownerUserId: string,
  leaseExpiresAt: Date,
  errorCode: string,
) {
  try {
    const prepared = await completeQuestionBankXlsxAssetCleanup(attemptId, ownerUserId, leaseExpiresAt);
    if (!prepared) return false;

    const deletions = await Promise.allSettled(prepared.safeObjects.map((asset) => deleteKaptenImageObject(asset.objectKey)));
    if (deletions.some((deletion) => deletion.status === "rejected")) {
      await recordQuestionBankXlsxAssetCleanupFailure(attemptId, leaseExpiresAt, "asset_cleanup_pending");
      return false;
    }

    const removed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${attemptId}::uuid
        FOR UPDATE
      `;
      const attempt = await tx.questionBankXlsxImportAttempt.findUnique({ where: { id: attemptId } });
      if (
        !attempt
        || attempt.ownerUserId !== ownerUserId
        || attempt.state !== QuestionBankXlsxImportAttemptState.cleanup_pending
        || attempt.operationLeaseExpiresAt?.getTime() !== leaseExpiresAt.getTime()
      ) return false;
      const owned = await tx.questionBankXlsxImportAttemptAsset.findMany({
        orderBy: { assetId: "asc" },
        where: { attemptId },
      });
      if (owned.some((entry) => entry.state !== QuestionBankXlsxImportAssetState.cleanup_pending)) {
        throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
      const safeObjects = await lockAndPrepareKaptenBankImageCleanup(tx, owned.map((entry) => ({
        assetId: entry.assetId,
        objectKey: entry.objectKey,
      })));
      if (safeObjects.length) {
        const references = await findQuestionBankImageReferences(tx, safeObjects.map((asset) => asset.assetId));
        if (references.length) throw new QuestionBankXlsxImportError("attempt_unavailable");
        const assetIds = safeObjects.map((asset) => asset.assetId);
        await tx.questionBankXlsxImportAttemptAsset.deleteMany({ where: { attemptId, assetId: { in: assetIds } } });
        const deleted = await tx.asset.deleteMany({
          where: {
            id: { in: assetIds },
            libraryScope: MediaLibraryScope.kapten,
            objectKey: { in: safeObjects.map((asset) => asset.objectKey) },
            state: { in: [MediaAssetState.failed, MediaAssetState.trashed] },
          },
        });
        if (deleted.count !== assetIds.length) throw new QuestionBankXlsxImportError("attempt_unavailable");
      }
      await tx.questionBankXlsxImportAttempt.update({
        data: {
          lastErrorCode: errorCode,
          expiresAt: expiresAfterOperation(leaseExpiresAt),
          operationLeaseExpiresAt: leaseExpiresAt,
          state: QuestionBankXlsxImportAttemptState.cleanup_pending,
        },
        where: { id: attemptId },
      });
      return true;
    }, { maxWait: 5_000, timeout: 30_000 });
    return removed;
  } catch {
    await recordQuestionBankXlsxAssetCleanupFailure(attemptId, leaseExpiresAt, "asset_cleanup_pending").catch(() => undefined);
    return false;
  }
}

async function failAndCleanQuestionBankXlsxApply(
  input: QuestionBankXlsxApplyTarget,
  claim: QuestionBankXlsxApplyClaim,
  error: unknown,
) {
  const errorCode = error instanceof QuestionBankXlsxImportError
    ? error.code
    : error instanceof QuestionBankCsvMutationError
      ? error.code
      : "attempt_unavailable";
  const cleanupLeaseExpiresAt = operationLeaseUntil();
  const claimed = await prisma.$transaction(async (tx) => {
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
      || current.state !== QuestionBankXlsxImportAttemptState.applying
      || current.operationLeaseExpiresAt?.getTime() !== claim.leaseExpiresAt.getTime()
    ) return null;
    return tx.questionBankXlsxImportAttempt.update({
      data: {
        expiresAt: expiresAfterOperation(cleanupLeaseExpiresAt),
        lastErrorCode: errorCode,
        operationLeaseExpiresAt: cleanupLeaseExpiresAt,
        state: QuestionBankXlsxImportAttemptState.cleanup_pending,
      },
      where: { id: input.attemptId },
    });
  });
  if (!claimed) return;

  const assetsRemoved = await removeQuestionBankXlsxAttemptAssets(
    input.attemptId,
    input.ownerUserId,
    cleanupLeaseExpiresAt,
    errorCode,
  );
  if (assetsRemoved) {
    await recordQuestionBankXlsxAssetCleanupFailure(
      input.attemptId,
      cleanupLeaseExpiresAt,
      errorCode,
    );
  }
}

async function applyQuestionBankXlsxToBank(input: {
  actorId: string;
  attemptId: string;
  bankId: string;
  editLease: AuthoringEditLease;
  expectedRevision: number;
  mode: QuestionBankCsvImportMode;
  signal?: AbortSignal;
}): Promise<QuestionBankXlsxBankApplyResult> {
  const target: QuestionBankXlsxApplyTarget = {
    attemptId: input.attemptId,
    ownerUserId: input.actorId,
    targetBankId: input.bankId,
    targetMode: input.mode,
  };
  const outcome = await claimQuestionBankXlsxApplyAttempt(target);
  if (outcome.kind === "replay") {
    return outcome.result as unknown as QuestionBankXlsxBankApplyResult;
  }
  const claim = outcome.claim;

  try {
    const bank = await prisma.questionBank.findFirst({
      select: { id: true },
      where: { createdByUserId: input.actorId, id: input.bankId },
    });
    if (!bank) throw new QuestionBankCsvMutationError("resource_inaccessible");
    const folder = await ensureQuestionBankMediaFolder(input.bankId, input.actorId);
    const preview = await readQuestionBankXlsxPreviewForApply(input.actorId, input.attemptId, input.signal);
    const imageBytes = await readFrozenQuestionBankXlsxImages(preview, input.signal);
    const images = preview.previewImageIndex.map((image) => ({
      contentSha256: image.contentSha256,
      height: image.height,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      width: image.width,
    }));
    const attemptAssets = await ensureQuestionBankXlsxAttemptAssets(target, claim, folder.id, images);
    const assetIdByHash = new Map(attemptAssets.map((asset) => [asset.contentSha256, asset.assetId]));
    const rows = applyImageAssetIdsToRows(
      preview.manifest.normalizedRows,
      preview.manifest.imageSlots,
      preview.normalizedRowIndexByWorksheetRef,
      assetIdByHash,
    );
    await uploadAndVerifyQuestionBankXlsxImages(attemptAssets, imageBytes, input.signal);

    const result = await prisma.$transaction(async (tx) => {
      await setTransactionLockTimeout(tx);
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${input.attemptId}::uuid
        FOR UPDATE
      `;
      await assertQuestionBankXlsxApplyClaim(
        tx,
        target,
        claim.leaseExpiresAt,
        claim.mediaFolderReservationId,
      );
      const applied = await applyQuestionBankRowsInTransaction(tx, {
        actorId: input.actorId,
        bankId: input.bankId,
        editLease: input.editLease,
        expectedRevision: input.expectedRevision,
        mode: input.mode,
        rows,
      }, {
        attemptOwnedPendingAssetIds: attemptAssets.map((asset) => asset.assetId),
        destinationMediaFolderId: folder.id,
        includeOverwriteImpact: input.mode === "overwrite",
        maxRows: QUESTION_BANK_XLSX_LIMITS.dataRows,
      });
      await completeQuestionBankXlsxAttemptAssets(tx, input.attemptId, attemptAssets.map((asset) => asset.assetId));
      const saved: QuestionBankXlsxBankApplyResult = {
        ...applied,
        imageAssetIds: attemptAssets.map((asset) => asset.assetId),
        overwriteImpact: applied.overwriteImpact ?? null,
        previewId: input.attemptId,
      };
      return completeQuestionBankXlsxApplyAttempt(tx, target, claim, saved);
    }, { maxWait: 5_000, timeout: 30_000 });

    await deletePrivateStagingObjects(parseStagedObjectKeys(claim.attempt.stagedObjectKeys, input.attemptId)).catch(() => undefined);
    return result;
  } catch (error) {
    await failAndCleanQuestionBankXlsxApply(target, claim, error).catch(() => undefined);
    throw error;
  }
}

async function applyQuestionBankXlsxToDraft(input: {
  attemptId: string;
  mediaFolderReservationId?: string;
  ownerUserId: string;
  signal?: AbortSignal;
}): Promise<QuestionBankXlsxDraftApplyResult> {
  const target: QuestionBankXlsxApplyTarget = {
    attemptId: input.attemptId,
    ownerUserId: input.ownerUserId,
    requestedReservationId: input.mediaFolderReservationId,
    targetBankId: null,
    targetMode: "draft",
  };
  const outcome = await claimQuestionBankXlsxApplyAttempt(target);
  if (outcome.kind === "replay") {
    return outcome.result as unknown as QuestionBankXlsxDraftApplyResult;
  }
  const claim = outcome.claim;

  try {
    if (!claim.mediaFolderReservationId) throw new QuestionBankXlsxImportError("attempt_unavailable");
    const reservation = await reserveDraftQuestionBankMediaFolder(
      input.ownerUserId,
      claim.mediaFolderReservationId,
    );
    const preview = await readQuestionBankXlsxPreviewForApply(input.ownerUserId, input.attemptId, input.signal);
    const imageBytes = await readFrozenQuestionBankXlsxImages(preview, input.signal);
    const images = preview.previewImageIndex.map((image) => ({
      contentSha256: image.contentSha256,
      height: image.height,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      width: image.width,
    }));
    const attemptAssets = await ensureQuestionBankXlsxAttemptAssets(
      target,
      claim,
      reservation.mediaFolderId,
      images,
    );
    const assetIdByHash = new Map(attemptAssets.map((asset) => [asset.contentSha256, asset.assetId]));
    const rows = applyImageAssetIdsToRows(
      preview.manifest.normalizedRows,
      preview.manifest.imageSlots,
      preview.normalizedRowIndexByWorksheetRef,
      assetIdByHash,
    );
    await uploadAndVerifyQuestionBankXlsxImages(attemptAssets, imageBytes, input.signal);

    const result = await prisma.$transaction(async (tx) => {
      await setTransactionLockTimeout(tx);
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_xlsx_import_attempts
        WHERE id = ${input.attemptId}::uuid
        FOR UPDATE
      `;
      await assertQuestionBankXlsxApplyClaim(
        tx,
        target,
        claim.leaseExpiresAt,
        claim.mediaFolderReservationId,
      );
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM question_bank_media_folder_reservations
        WHERE id = ${reservation.id}::uuid
        FOR UPDATE
      `;
      const reservationStillValid = await tx.questionBankMediaFolderReservation.findFirst({
        select: { id: true },
        where: {
          id: reservation.id,
          mediaFolderId: reservation.mediaFolderId,
          ownerUserId: input.ownerUserId,
          adoptedBankId: null,
        },
      });
      if (!reservationStillValid) throw new QuestionBankXlsxImportError("attempt_unavailable");
      const assetIds = attemptAssets.map((asset) => asset.assetId);
      await lockAndValidateKaptenBankImages(tx, {
        assetIds,
        attemptOwnedPendingAssetIds: assetIds,
        destinationFolderId: reservation.mediaFolderId,
      });
      await completeQuestionBankXlsxAttemptAssets(tx, input.attemptId, assetIds);
      const saved: QuestionBankXlsxDraftApplyResult = {
        imageAssetIds: attemptAssets.map((asset) => asset.assetId),
        mediaFolderReservationId: reservation.id,
        normalizedRows: rows,
        previewId: input.attemptId,
      };
      return completeQuestionBankXlsxApplyAttempt(tx, target, claim, saved);
    }, { maxWait: 5_000, timeout: 30_000 });

    await deletePrivateStagingObjects(parseStagedObjectKeys(claim.attempt.stagedObjectKeys, input.attemptId)).catch(() => undefined);
    return result;
  } catch (error) {
    await failAndCleanQuestionBankXlsxApply(target, claim, error).catch(() => undefined);
    throw error;
  }
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
          QuestionBankXlsxImportAttemptState.applying,
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
            lastErrorCode: current.lastErrorCode ?? (
              current.state === QuestionBankXlsxImportAttemptState.applying
                ? "attempt_unavailable"
                : current.lastErrorCode
            ),
            operationLeaseExpiresAt: leaseExpiresAt,
            state: QuestionBankXlsxImportAttemptState.cleanup_pending,
          },
        where: { id: current.id },
      });
      return {
        attempt,
        cleanupApplyAssets: current.state === QuestionBankXlsxImportAttemptState.applying
          || (current.state === QuestionBankXlsxImportAttemptState.cleanup_pending
            && current.targetMode !== null
            && current.lastErrorCode !== null),
        leaseExpiresAt,
        recoverCompletion,
      };
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
      if (prepared.cleanupApplyAssets) {
        const assetsRemoved = await removeQuestionBankXlsxAttemptAssets(
          prepared.attempt.id,
          prepared.attempt.ownerUserId,
          prepared.leaseExpiresAt,
          prepared.attempt.lastErrorCode ?? "attempt_unavailable",
        );
        if (!assetsRemoved) {
          deferred += 1;
          continue;
        }
      }
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
  applyQuestionBankXlsxToBank,
  applyQuestionBankXlsxToDraft,
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
  previewQuestionBankXlsxBankOverwriteImpact,
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
