import "server-only";

import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { RoleName } from "@/generated/prisma/client";
import { isLeaseInstanceToken, isPositiveGeneration, isUuid } from "@/lib/resource-edit-lock/canonical";
import { EditLeaseServiceError } from "@/lib/resource-edit-lock/service";

import {
  QuestionBankCsvMutationError,
  type QuestionBankCsvMutationCode,
} from "./csv-repository";

const QUESTION_BANK_CSV_HTTP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

const QUESTION_BANK_CSV_MEDIA_TYPE = "text/csv";
const QUESTION_BANK_CSV_TOKEN_HEADER = "x-edit-lease-token";
const QUESTION_BANK_CSV_GENERATION_HEADER = "x-edit-lease-generation";
const QUESTION_BANK_CSV_REVISION_HEADER = "x-question-bank-revision";

type QuestionBankCsvHttpCode =
  | "csv_media_type_required"
  | "csv_rows_invalid"
  | "csv_structure_invalid"
  | "csv_too_large"
  | "forbidden_origin"
  | "invalid_media_asset"
  | "resource_busy_retry"
  | "resource_inaccessible"
  | "resource_locked"
  | "lease_expired"
  | "lease_superseded"
  | "stale_revision"
  | "unauthenticated";

class QuestionBankCsvHttpError extends Error {
  constructor(
    readonly code: QuestionBankCsvHttpCode,
    readonly status: 401 | 403 | 409 | 413 | 415 | 422,
  ) {
    super(code);
    this.name = "QuestionBankCsvHttpError";
  }
}

type QuestionBankCsvLeaseHeaders = {
  editLease: { generation: number; token: string };
  expectedRevision: number;
};

function isTrustedCsvOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

function isExactCsvMediaType(value: string | null) {
  if (!value) return false;
  const parts = value.split(";").map((part) => part.trim());
  if (parts[0]?.toLowerCase() !== QUESTION_BANK_CSV_MEDIA_TYPE) return false;
  const parameters = parts.slice(1).filter(Boolean);
  if (parameters.length > 1) return false;
  if (!parameters.length) return true;
  return /^charset\s*=\s*utf-8$/iu.test(parameters[0]!);
}

function parsePositiveHeader(value: string | null) {
  if (!value || !/^\d+$/u.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function oneHeader(request: Request, names: readonly string[]) {
  const values = names
    .map((name) => request.headers.get(name))
    .filter((value): value is string => value !== null);
  if (!values.length) return null;
  const normalized = values.map((value) => value.trim());
  return normalized.every((value) => value === normalized[0]) ? normalized[0]! : null;
}

function parseQuestionBankCsvLeaseHeaders(request: Request): QuestionBankCsvLeaseHeaders {
  const token = oneHeader(request, [
    QUESTION_BANK_CSV_TOKEN_HEADER,
    "x-lease-token",
    "x-resource-edit-token",
  ]);
  const generationText = oneHeader(request, [
    QUESTION_BANK_CSV_GENERATION_HEADER,
    "x-lease-generation",
    "x-resource-edit-generation",
  ]);
  const revisionText = oneHeader(request, [
    QUESTION_BANK_CSV_REVISION_HEADER,
    "x-expected-revision",
    "x-bank-revision",
  ]);
  const generation = parsePositiveHeader(generationText);
  const expectedRevision = parsePositiveHeader(revisionText);
  if (!token || !isLeaseInstanceToken(token) || !generation || !isPositiveGeneration(generation) || !expectedRevision) {
    throw new QuestionBankCsvHttpError("csv_structure_invalid", 422);
  }
  return { editLease: { generation, token }, expectedRevision };
}

async function readBoundedCsvBody(request: Request) {
  if (!isExactCsvMediaType(request.headers.get("content-type"))) {
    throw new QuestionBankCsvHttpError("csv_media_type_required", 415);
  }
  const advertisedLength = request.headers.get("content-length");
  if (advertisedLength !== null) {
    const value = advertisedLength.trim();
    const parsed = Number(value);
    if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed > 2 * 1024 * 1024) {
      throw new QuestionBankCsvHttpError("csv_too_large", 413);
    }
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new QuestionBankCsvHttpError("csv_too_large", 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseCsvBankId(value: string) {
  if (!isUuid(value)) throw new QuestionBankCsvHttpError("csv_structure_invalid", 422);
  return value.toLowerCase();
}

function parseCsvMode(value: string | null): "append" | "overwrite" {
  if (value !== "append" && value !== "overwrite") {
    throw new QuestionBankCsvHttpError("csv_structure_invalid", 422);
  }
  return value;
}

function csvErrorResponse(error: QuestionBankCsvHttpError) {
  return Response.json({ error: error.code }, { headers: QUESTION_BANK_CSV_HTTP_HEADERS, status: error.status });
}

function mapQuestionBankCsvError(error: unknown): QuestionBankCsvHttpError {
  if (error instanceof QuestionBankCsvHttpError) return error;
  if (error instanceof QuestionBankCsvMutationError) {
    if (error.code === "invalid_media_asset") return new QuestionBankCsvHttpError("invalid_media_asset", 422);
    if (error.code === "resource_inaccessible") return new QuestionBankCsvHttpError("resource_inaccessible", 403);
    if (error.code === "stale_revision") return new QuestionBankCsvHttpError("stale_revision", 409);
    if (error.code === "archived_locked" || error.code === "question_retired") return new QuestionBankCsvHttpError("resource_locked", 409);
    return new QuestionBankCsvHttpError("csv_rows_invalid", 422);
  }
  if (error instanceof EditLeaseServiceError) {
    if (error.code === "invalid_proof") return new QuestionBankCsvHttpError("csv_structure_invalid", 422);
    if (error.code === "resource_inaccessible") return new QuestionBankCsvHttpError("resource_inaccessible", 403);
    if (error.code === "resource_locked") return new QuestionBankCsvHttpError("resource_locked", 409);
    if (error.code === "lease_expired") return new QuestionBankCsvHttpError("lease_expired", 409);
    if (error.code === "lease_superseded") return new QuestionBankCsvHttpError("lease_superseded", 409);
  }
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "resource_busy_retry") {
    return new QuestionBankCsvHttpError("resource_busy_retry", 409);
  }
  return new QuestionBankCsvHttpError("resource_busy_retry", 409);
}

function responseForCsvCode(code: QuestionBankCsvHttpCode, status?: 401 | 403 | 409 | 413 | 415 | 422) {
  const resolvedStatus = status ?? (code === "unauthenticated"
    ? 401
    : code === "forbidden_origin" || code === "resource_inaccessible"
      ? 403
      : code === "csv_too_large"
        ? 413
        : code === "csv_media_type_required"
          ? 415
          : code === "resource_locked" || code === "lease_expired" || code === "lease_superseded" || code === "stale_revision" || code === "resource_busy_retry"
            ? 409
            : 422);
  return Response.json({ error: code }, { headers: QUESTION_BANK_CSV_HTTP_HEADERS, status: resolvedStatus });
}

async function readTutorCsvSession() {
  const session = await getReadOnlySessionContext();
  if (!session) return null;
  return hasRole(session, RoleName.tutor) ? session : false;
}

function publicCsvMutationCode(error: unknown): QuestionBankCsvMutationCode | null {
  return error instanceof QuestionBankCsvMutationError ? error.code : null;
}

export {
  QUESTION_BANK_CSV_GENERATION_HEADER,
  QUESTION_BANK_CSV_HTTP_HEADERS,
  QUESTION_BANK_CSV_MEDIA_TYPE,
  QUESTION_BANK_CSV_REVISION_HEADER,
  QUESTION_BANK_CSV_TOKEN_HEADER,
  QuestionBankCsvHttpError,
  csvErrorResponse,
  isExactCsvMediaType,
  isTrustedCsvOrigin,
  mapQuestionBankCsvError,
  parseCsvBankId,
  parseCsvMode,
  parseQuestionBankCsvLeaseHeaders,
  publicCsvMutationCode,
  readBoundedCsvBody,
  readTutorCsvSession,
  responseForCsvCode,
};

export type { QuestionBankCsvHttpCode, QuestionBankCsvLeaseHeaders };
