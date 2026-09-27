import "server-only";

import {
  isTrustedCsvOrigin,
  readTutorCsvSession,
} from "@/lib/question-bank/csv-http";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import {
  QuestionBankXlsxImportError,
  type QuestionBankXlsxImportErrorCode,
} from "./xlsx-import-repository";
import { QUESTION_BANK_XLSX_LIMITS } from "./xlsx-limits";

const QUESTION_BANK_XLSX_HTTP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;
const QUESTION_BANK_XLSX_JSON_MAX_BYTES = 1_024;

type QuestionBankXlsxHttpCode =
  | QuestionBankXlsxImportErrorCode
  | "forbidden_origin"
  | "invalid_request"
  | "resource_inaccessible"
  | "unauthenticated"
  | "xlsx_rows_invalid"
  | "xlsx_structure_invalid";

class QuestionBankXlsxHttpError extends Error {
  constructor(
    readonly code: QuestionBankXlsxHttpCode,
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 503,
  ) {
    super(code);
    this.name = "QuestionBankXlsxHttpError";
  }
}

function isTrustedQuestionBankXlsxOrigin(request: Request) {
  return isTrustedCsvOrigin(request);
}

function isTrustedQuestionBankXlsxReadOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || isTrustedCsvOrigin(request);
}

async function readBoundedXlsxJson(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new QuestionBankXlsxHttpError("invalid_request", 415);
  }
  const advertisedLength = request.headers.get("content-length");
  if (advertisedLength !== null) {
    const parsed = Number(advertisedLength.trim());
    if (
      !/^\d+$/u.test(advertisedLength.trim())
      || !Number.isSafeInteger(parsed)
      || parsed > QUESTION_BANK_XLSX_JSON_MAX_BYTES
    ) {
      throw new QuestionBankXlsxHttpError("invalid_request", 413);
    }
  }
  if (!request.body) throw new QuestionBankXlsxHttpError("invalid_request", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cancelReader = () => {
    void reader.cancel(request.signal.reason).catch(() => undefined);
  };
  request.signal.addEventListener("abort", cancelReader, { once: true });
  try {
    while (true) {
      if (request.signal.aborted) throw request.signal.reason ?? new Error("Request aborted.");
      const next = await reader.read();
      if (request.signal.aborted) throw request.signal.reason ?? new Error("Request aborted.");
      if (next.done) break;
      total += next.value.byteLength;
      if (total > QUESTION_BANK_XLSX_JSON_MAX_BYTES) {
        await reader.cancel();
        throw new QuestionBankXlsxHttpError("invalid_request", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    request.signal.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
}

async function parseQuestionBankXlsxUploadRequest(request: Request) {
  const value = await readBoundedXlsxJson(request);
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || typeof (value as { fileName?: unknown }).fileName !== "string"
    || typeof (value as { expectedWorkbookSizeBytes?: unknown }).expectedWorkbookSizeBytes !== "number"
  ) {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
  const expectedWorkbookSizeBytes = (value as { expectedWorkbookSizeBytes: number }).expectedWorkbookSizeBytes;
  if (
    !Number.isSafeInteger(expectedWorkbookSizeBytes)
    || expectedWorkbookSizeBytes <= 0
    || expectedWorkbookSizeBytes > QUESTION_BANK_XLSX_LIMITS.workbookBytes
  ) {
    const tooLarge = expectedWorkbookSizeBytes > QUESTION_BANK_XLSX_LIMITS.workbookBytes;
    throw new QuestionBankXlsxHttpError(tooLarge ? "xlsx_too_large" : "invalid_request", tooLarge ? 413 : 400);
  }
  return {
    expectedWorkbookSizeBytes,
    fileName: (value as { fileName: string }).fileName,
  };
}

async function parseQuestionBankXlsxPreviewRequest(request: Request) {
  const value = await readBoundedXlsxJson(request);
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || typeof (value as { uploadId?: unknown }).uploadId !== "string"
    || !isUuid((value as { uploadId: string }).uploadId)
  ) {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
  return { uploadId: (value as { uploadId: string }).uploadId.toLowerCase() };
}

async function parseQuestionBankXlsxApplyRequest(request: Request) {
  const value = await readBoundedXlsxJson(request);
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).some((key) => key !== "previewId" && key !== "mediaFolderReservationId")
    || !Object.hasOwn(value, "previewId")
    || typeof (value as { previewId?: unknown }).previewId !== "string"
    || !isUuid((value as { previewId: string }).previewId)
    || (Object.hasOwn(value, "mediaFolderReservationId")
      && (typeof (value as { mediaFolderReservationId?: unknown }).mediaFolderReservationId !== "string"
        || !isUuid((value as { mediaFolderReservationId: string }).mediaFolderReservationId)))
  ) {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
  return { previewId: (value as { previewId: string }).previewId.toLowerCase() };
}

async function parseQuestionBankXlsxOverwriteImpactRequest(request: Request) {
  const value = await readBoundedXlsxJson(request);
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 2
    || typeof (value as { previewId?: unknown }).previewId !== "string"
    || !isUuid((value as { previewId: string }).previewId)
    || !Number.isSafeInteger((value as { expectedRevision?: unknown }).expectedRevision)
    || (value as { expectedRevision: number }).expectedRevision < 1
  ) {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
  const parsed = value as { expectedRevision: number; previewId: string };
  return {
    expectedRevision: parsed.expectedRevision,
    previewId: parsed.previewId.toLowerCase(),
  };
}

async function parseQuestionBankXlsxDraftApplyRequest(request: Request) {
  const value = await readBoundedXlsxJson(request);
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || typeof (value as { previewId?: unknown }).previewId !== "string"
    || !isUuid((value as { previewId: string }).previewId)
  ) {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
  const parsed = value as { previewId: string };
  return {
    previewId: parsed.previewId.toLowerCase(),
  };
}

function parseQuestionBankXlsxPreviewId(value: string) {
  if (!isUuid(value)) throw new QuestionBankXlsxHttpError("invalid_request", 400);
  return value.toLowerCase();
}

function parseQuestionBankXlsxThumbnailOffset(value: string | null) {
  if (value === null) return 0;
  const normalized = value.trim();
  const offset = Number(normalized);
  if (!/^\d+$/u.test(normalized) || !Number.isSafeInteger(offset) || offset < 0) {
    throw new QuestionBankXlsxHttpError("invalid_request", 400);
  }
  return offset;
}

function questionBankXlsxErrorResponse(code: QuestionBankXlsxHttpCode, status?: QuestionBankXlsxHttpError["status"]) {
  const resolvedStatus = status ?? (
    code === "unauthenticated" ? 401
      : code === "forbidden_origin" || code === "resource_inaccessible" ? 403
        : code === "attempt_not_found" ? 404
          : code === "attempt_busy" || code === "attempt_cancelled" || code === "attempt_expired" || code === "attempt_target_mismatch" || code === "multipart_incomplete" ? 409
            : code === "xlsx_too_large" ? 413
              : code === "invalid_request" ? 400
                : code === "attempt_unavailable" ? 503
                  : 422
  );
  return Response.json({ error: code }, {
    headers: QUESTION_BANK_XLSX_HTTP_HEADERS,
    status: resolvedStatus,
  });
}

function mapQuestionBankXlsxError(error: unknown): QuestionBankXlsxHttpError {
  if (error instanceof QuestionBankXlsxHttpError) return error;
  if (error instanceof QuestionBankXlsxImportError) {
    if (error.code === "attempt_not_found") return new QuestionBankXlsxHttpError(error.code, 404);
    if (
      error.code === "attempt_busy"
      || error.code === "attempt_cancelled"
      || error.code === "attempt_expired"
      || error.code === "attempt_target_mismatch"
      || error.code === "multipart_incomplete"
    ) {
      return new QuestionBankXlsxHttpError(error.code, 409);
    }
    if (error.code === "xlsx_too_large") return new QuestionBankXlsxHttpError(error.code, 413);
    if (error.code === "attempt_unavailable") return new QuestionBankXlsxHttpError(error.code, 503);
    return new QuestionBankXlsxHttpError(error.code, 422);
  }
  return new QuestionBankXlsxHttpError("attempt_unavailable", 503);
}

export {
  QUESTION_BANK_XLSX_HTTP_HEADERS,
  QuestionBankXlsxHttpError,
  isTrustedQuestionBankXlsxOrigin,
  isTrustedQuestionBankXlsxReadOrigin,
  mapQuestionBankXlsxError,
  parseQuestionBankXlsxApplyRequest,
  parseQuestionBankXlsxDraftApplyRequest,
  parseQuestionBankXlsxOverwriteImpactRequest,
  parseQuestionBankXlsxPreviewId,
  parseQuestionBankXlsxPreviewRequest,
  parseQuestionBankXlsxThumbnailOffset,
  parseQuestionBankXlsxUploadRequest,
  questionBankXlsxErrorResponse,
  readTutorCsvSession as readTutorQuestionBankXlsxSession,
};
