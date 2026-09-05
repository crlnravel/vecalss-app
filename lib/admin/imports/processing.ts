import { createHash, randomUUID } from "node:crypto";

import {
  EnrollmentHandoffMethod,
  EnrollmentHandoffStatus,
  EnrollmentImportDispatchStatus,
  EnrollmentImportOperation,
  EnrollmentImportRole,
  EnrollmentImportRowStatus,
  EnrollmentImportStatus,
  Prisma,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createEnrollmentHandoff,
  writeHandoffAudit,
} from "@/lib/admin/handoffs/service";
import {
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  createOpaqueToken,
} from "@/lib/auth/crypto";
import { parseUuid } from "@/lib/admin/operations/validation";

import { buildImportJobId } from "./job-id";
import { MAX_DATA_ROWS, STUDENT_DISPLAY_NAME_MAX } from "./contracts";

const ROW_CLAIM_LEASE_MS = 2 * 60 * 1_000;
const ROW_HEARTBEAT_INTERVAL_MS = 30_000;
const ROW_BATCH_SIZE = 10;
const MAX_ROW_ATTEMPTS = 5;
const IMPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const HANDOFF_RETENTION_MS = IMPORT_RETENTION_MS;
const CLEANUP_BATCH_SIZE = 100;
const DEFAULT_WORKER_ID = "admin-import-worker";
const PREVIEW_METADATA_KEY = "__preview";

type RowClaim = {
  id: string;
  importId: string;
  generation: number;
  rowNumber: number;
  normalizedEmail: string;
  operation: EnrollmentImportOperation;
  status: EnrollmentImportRowStatus;
  inputJson: Prisma.JsonValue;
  matchedUserId: string | null;
  matchedUserUpdatedAt: Date | null;
  attemptCount: number;
  claimToken: string;
  claimExpiresAt: Date;
  claimedBy: string;
  role: EnrollmentImportRole;
  handoffMethod: EnrollmentHandoffMethod | null;
  createdByUserId: string;
  confirmedByUserId: string | null;
};

type ImportRowCounts = {
  created: number;
  failed: number;
  invalid: number;
  pending: number;
  processing: number;
  skipped: number;
  total: number;
  updated: number;
};

type ProcessGenerationResult = {
  counts: ImportRowCounts;
  finalized: boolean;
  importId: string;
  status: EnrollmentImportStatus | null;
};

type ClaimImportRowsInput = {
  generation: number;
  importId: string;
  limit?: number;
  workerId: string;
};

type HeartbeatImportRowClaimInput = {
  claimToken: string;
  rowId: string;
  workerId: string;
};

type ReapExpiredImportRowClaimsInput = {
  generation?: number;
  importId?: string;
};

type RetryEnrollmentImportInput = {
  actorUserId: string;
  expectedGeneration?: number;
  idempotencyKey?: string;
  importId: string;
  rowIds?: string[];
  rowNumbers?: number[];
};

type RetrySelectionInput = {
  rowIds?: unknown;
  rowNumbers?: unknown;
};

type RetrySelection = {
  rowIds: string[];
  rowNumbers: number[];
};

const RETRY_BODY_KEYS = new Set([
  "expectedGeneration",
  "idempotencyKey",
  "rowIds",
  "rowNumbers",
]);

type CleanupEnrollmentImportsInput = {
  now?: Date;
  importRetentionMs?: number;
  handoffRetentionMs?: number;
};

type RetryEnrollmentImportResult = {
  counts: ImportRowCounts;
  generation: number;
  idempotent: boolean;
  importId: string;
  queueJobId: string;
  status: EnrollmentImportStatus;
  retriedCount: number;
};

type RetryGenerationResult = {
  counts: ImportRowCounts;
  status: EnrollmentImportStatus;
};

type RetryAuditRecord = {
  generation: number;
  payloadKey: string | null;
  previousGeneration: number;
  queueJobId: string | null;
  requestKey: string;
  result: RetryGenerationResult | null;
  retriedCount: number;
};

type CleanupEnrollmentImportsResult = {
  expiredHandoffs: number;
  purgedHandoffs: number;
  purgedImports: number;
  purgedRows: number;
  purgedDispatches: number;
};

type ImportProcessingErrorCode =
  | "changed_since_preview"
  | "inactive_account"
  | "invalid_input"
  | "invalid_operation"
  | "missing_profile"
  | "opposite_role"
  | "profile_field_too_long"
  | "role_conflict"
  | "duplicate_email"
  | "handoff_method_missing"
  | "worker_lease_expired"
  | "mutation_failed"
  | "job_exhausted";

const ROW_ERROR_MESSAGES: Readonly<Record<ImportProcessingErrorCode, string>> = {
  changed_since_preview: "The account changed after preview and needs a fresh import.",
  duplicate_email: "An account with this email already exists.",
  handoff_method_missing: "The import handoff method is unavailable.",
  inactive_account: "The matching account is not active.",
  invalid_input: "The stored import row is invalid.",
  invalid_operation: "The stored import operation is no longer valid.",
  missing_profile: "The role profile could not be found.",
  mutation_failed: "The account mutation could not be completed.",
  opposite_role: "The email belongs to an account with another role.",
  profile_field_too_long: "The imported profile field exceeds its storage limit.",
  role_conflict: "The account role is no longer compatible with this import.",
  worker_lease_expired: "The worker lease expired before this row completed.",
  job_exhausted: "The import worker exhausted its retry attempts.",
};

class ImportProcessingError extends Error {
  readonly code: ImportProcessingErrorCode;

  constructor(code: ImportProcessingErrorCode, message = ROW_ERROR_MESSAGES[code]) {
    super(message);
    this.name = "ImportProcessingError";
    this.code = code;
  }
}

class ImportRetryError extends Error {
  readonly code:
    | "import_not_found"
    | "invalid_import_state"
    | "no_failed_rows"
    | "row_selection_invalid"
    | "active_claims"
    | "retry_conflict";

  constructor(
    code: ImportRetryError["code"],
    message = code === "import_not_found"
      ? "The import could not be found."
      : code === "invalid_import_state"
        ? "This import is not eligible for retry."
        : code === "no_failed_rows"
          ? "The import has no failed rows to retry."
          : code === "active_claims"
            ? "The import still has an active worker claim."
            : code === "retry_conflict"
              ? "This retry request conflicts with the import's current generation."
              : "The selected rows are invalid.",
  ) {
    super(message);
    this.name = "ImportRetryError";
    this.code = code;
  }
}

class StaleImportRowClaimError extends Error {
  readonly code = "stale_import_row_claim";

  constructor() {
    super("The import row claim is no longer owned by this worker.");
    this.name = "StaleImportRowClaimError";
  }
}

function parseRetrySelection(input: RetrySelectionInput): RetrySelection | null {
  const rawRowIds = input.rowIds;
  const rawRowNumbers = input.rowNumbers;
  const rowIdsProvided = Object.prototype.hasOwnProperty.call(input, "rowIds");
  const rowNumbersProvided = Object.prototype.hasOwnProperty.call(input, "rowNumbers");
  if (
    (rawRowIds !== undefined && !Array.isArray(rawRowIds))
    || (rawRowNumbers !== undefined && !Array.isArray(rawRowNumbers))
  ) {
    return null;
  }

  const rowIdsInput = (rawRowIds ?? []) as unknown[];
  const rowNumbersInput = (rawRowNumbers ?? []) as unknown[];
  if (
    (rowIdsProvided && rowIdsInput.length === 0)
    || (rowNumbersProvided && rowNumbersInput.length === 0)
  ) {
    return null;
  }
  if (rowIdsInput.length + rowNumbersInput.length > MAX_DATA_ROWS) {
    return null;
  }

  const parsedRowIds = rowIdsInput.map((value) => parseUuid(value));
  if (parsedRowIds.some((value) => value === null)) {
    return null;
  }
  const normalizedRowIds = parsedRowIds.filter((value): value is string => value !== null);
  if (new Set(normalizedRowIds).size !== normalizedRowIds.length) {
    return null;
  }

  if (!rowNumbersInput.every((value) => (
    typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
    && value <= MAX_DATA_ROWS
  ))) {
    return null;
  }
  if (new Set(rowNumbersInput as number[]).size !== rowNumbersInput.length) {
    return null;
  }

  const rowIds = normalizedRowIds;
  const rowNumbers = rowNumbersInput as number[];
  if (rowIds.length + rowNumbers.length > MAX_DATA_ROWS) {
    return null;
  }

  return { rowIds, rowNumbers };
}

function isRetryBodyShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.keys(value).every((key) => RETRY_BODY_KEYS.has(key));
}

function boundedWorkerId(value: string | undefined) {
  return (value?.trim() || DEFAULT_WORKER_ID)
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._:-]/gu, "_")
    .slice(0, 120) || DEFAULT_WORKER_ID;
}

function boundedErrorMessage(code: ImportProcessingErrorCode) {
  return ROW_ERROR_MESSAGES[code].slice(0, 240);
}

function retryRequestKey(rowIds: string[], rowNumbers: number[]) {
  const canonical = JSON.stringify({
    rowIds: [...rowIds].sort(),
    rowNumbers: [...rowNumbers].sort((left, right) => left - right),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function retryPayloadKey({
  expectedGeneration,
  rowIds,
  rowNumbers,
}: {
  expectedGeneration?: number;
  rowIds: string[];
  rowNumbers: number[];
}) {
  const canonical = JSON.stringify({
    expectedGeneration: expectedGeneration ?? null,
    rowIds: [...rowIds].sort(),
    rowNumbers: [...rowNumbers].sort((left, right) => left - right),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function retryIdentityKey(idempotencyKey: string | undefined, rowIds: string[], rowNumbers: number[]) {
  if (idempotencyKey !== undefined) {
    return createHash("sha256").update(`idempotency:${idempotencyKey}`).digest("hex");
  }
  return retryRequestKey(rowIds, rowNumbers);
}

function validRetryStatus(value: unknown): value is EnrollmentImportStatus {
  return value === EnrollmentImportStatus.queued
    || value === EnrollmentImportStatus.processing
    || value === EnrollmentImportStatus.completed
    || value === EnrollmentImportStatus.partial
    || value === EnrollmentImportStatus.failed;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function retryGenerationResult(value: unknown): RetryGenerationResult | null {
  const result = asObject((value ?? null) as Prisma.JsonValue);
  const counts = asObject((result?.counts ?? null) as Prisma.JsonValue);
  if (!result || !counts || !validRetryStatus(result.status)) return null;
  const keys: Array<keyof ImportRowCounts> = [
    "created",
    "failed",
    "invalid",
    "pending",
    "processing",
    "skipped",
    "total",
    "updated",
  ];
  if (keys.some((key) => !validCount(counts[key]))) return null;
  return {
    counts: {
      created: counts.created as number,
      failed: counts.failed as number,
      invalid: counts.invalid as number,
      pending: counts.pending as number,
      processing: counts.processing as number,
      skipped: counts.skipped as number,
      total: counts.total as number,
      updated: counts.updated as number,
    },
    status: result.status,
  };
}

function retryAuditMetadata(value: Prisma.JsonValue): RetryAuditRecord | null {
  const metadata = asObject(value);
  if (
    !metadata
    || typeof metadata.generation !== "number"
    || !Number.isSafeInteger(metadata.generation)
    || metadata.generation < 1
    || typeof metadata.requestKey !== "string"
    || typeof metadata.previousGeneration !== "number"
    || !Number.isSafeInteger(metadata.previousGeneration)
    || metadata.previousGeneration < 0
  ) {
    return null;
  }
  return {
    generation: metadata.generation,
    payloadKey: typeof metadata.payloadKey === "string" ? metadata.payloadKey : null,
    previousGeneration: metadata.previousGeneration,
    queueJobId: typeof metadata.queueJobId === "string" ? metadata.queueJobId : null,
    requestKey: metadata.requestKey,
    result: retryGenerationResult(metadata.result),
    retriedCount: typeof metadata.retriedCount === "number" ? metadata.retriedCount : 0,
  };
}

function emptyImportRowCounts(): ImportRowCounts {
  return {
    created: 0,
    failed: 0,
    invalid: 0,
    pending: 0,
    processing: 0,
    skipped: 0,
    total: 0,
    updated: 0,
  };
}

function countRows(rows: Array<{ status: EnrollmentImportRowStatus; count: number }>) {
  const counts = emptyImportRowCounts();
  for (const row of rows) {
    counts.total += row.count;
    if (row.status === EnrollmentImportRowStatus.created) counts.created += row.count;
    if (row.status === EnrollmentImportRowStatus.failed) counts.failed += row.count;
    if (row.status === EnrollmentImportRowStatus.invalid) counts.invalid += row.count;
    if (row.status === EnrollmentImportRowStatus.pending) counts.pending += row.count;
    if (row.status === EnrollmentImportRowStatus.processing) counts.processing += row.count;
    if (row.status === EnrollmentImportRowStatus.skipped) counts.skipped += row.count;
    if (row.status === EnrollmentImportRowStatus.updated) counts.updated += row.count;
  }
  return counts;
}

async function deriveImportRowCounts(
  tx: Pick<typeof prisma, "$queryRaw"> | typeof prisma,
  importId: string,
) {
  const rows = await tx.$queryRaw<Array<{ status: EnrollmentImportRowStatus; count: number }>>`
    SELECT status, count(*)::int AS count
    FROM enrollment_import_rows
    WHERE import_id = ${importId}::uuid
    GROUP BY status
  `;
  return countRows(rows);
}

function finalImportStatus(counts: ImportRowCounts) {
  if (counts.pending > 0 || counts.processing > 0) return null;
  if (
    counts.total > 0
    && counts.created + counts.updated === counts.total
    && counts.failed === 0
    && counts.invalid === 0
    && counts.skipped === 0
  ) {
    return EnrollmentImportStatus.completed;
  }
  if (counts.skipped > 0 || counts.created + counts.updated > 0) {
    return EnrollmentImportStatus.partial;
  }
  return EnrollmentImportStatus.failed;
}

async function claimImportRows({
  generation,
  importId,
  limit = ROW_BATCH_SIZE,
  workerId,
}: ClaimImportRowsInput) {
  if (!Number.isSafeInteger(generation) || generation < 1) return [];
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const claimedBy = boundedWorkerId(workerId);

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<Array<{
      id: string;
      import_id: string;
      generation: number;
      row_number: number;
      normalized_email: string;
      operation: EnrollmentImportOperation;
      status: EnrollmentImportRowStatus;
      input_json: Prisma.JsonValue;
      matched_user_id: string | null;
      matched_user_updated_at: Date | null;
      attempt_count: number;
      role: EnrollmentImportRole;
      handoff_method: EnrollmentHandoffMethod | null;
      created_by_user_id: string;
      confirmed_by_user_id: string | null;
    }>>`
      SELECT
        r.id,
        r.import_id,
        i.dispatch_generation AS generation,
        r.row_number,
        r.normalized_email,
        r.operation,
        r.status,
        r.input_json,
        r.matched_user_id,
        r.matched_user_updated_at,
        r.attempt_count,
        i.role,
        i.handoff_method,
        i.created_by_user_id,
        i.confirmed_by_user_id
      FROM enrollment_import_rows r
      INNER JOIN enrollment_imports i ON i.id = r.import_id
      WHERE r.import_id = ${importId}::uuid
        AND i.dispatch_generation = ${generation}
        AND i.status IN (
          'queued'::enrollment_import_status,
          'processing'::enrollment_import_status
        )
        AND (
          r.status = 'pending'::enrollment_import_row_status
          OR (
            r.status = 'processing'::enrollment_import_row_status
            AND r.claim_expires_at IS NOT NULL
            AND r.claim_expires_at <= clock_timestamp()
          )
        )
        AND (
          r.claim_token IS NULL
          OR r.claim_expires_at IS NULL
          OR r.claim_expires_at <= clock_timestamp()
        )
      ORDER BY r.row_number ASC, r.id ASC
      LIMIT ${boundedLimit}
      FOR UPDATE OF r SKIP LOCKED
    `;

    const claimedAt = new Date();
    const claimed = await Promise.all(candidates.map(async (candidate): Promise<RowClaim> => {
      const claimToken = randomUUID();
      const claimExpiresAt = new Date(claimedAt.getTime() + ROW_CLAIM_LEASE_MS);
      await tx.enrollmentImportRow.update({
        data: {
          attemptCount: { increment: 1 },
          claimExpiresAt,
          claimToken,
          claimedBy,
          status: EnrollmentImportRowStatus.processing,
        },
        where: { id: candidate.id },
      });
      return {
        attemptCount: candidate.attempt_count + 1,
        claimExpiresAt,
        claimToken,
        claimedBy,
        createdByUserId: candidate.created_by_user_id,
        confirmedByUserId: candidate.confirmed_by_user_id,
        generation: candidate.generation,
        handoffMethod: candidate.handoff_method,
        id: candidate.id,
        importId: candidate.import_id,
        inputJson: candidate.input_json,
        matchedUserId: candidate.matched_user_id,
        matchedUserUpdatedAt: candidate.matched_user_updated_at,
        normalizedEmail: candidate.normalized_email,
        operation: candidate.operation,
        role: candidate.role,
        rowNumber: candidate.row_number,
        status: EnrollmentImportRowStatus.processing,
      };
    }));

    if (claimed.length > 0) {
      await tx.enrollmentImport.updateMany({
        data: { lastHeartbeatAt: claimedAt },
        where: {
          dispatchGeneration: generation,
          id: importId,
          status: { in: [EnrollmentImportStatus.queued, EnrollmentImportStatus.processing] },
        },
      });
    }

    return claimed;
  });
}

async function heartbeatImportRowClaim({
  claimToken,
  rowId,
  workerId,
}: HeartbeatImportRowClaimInput) {
  const claimedBy = boundedWorkerId(workerId);
  const result = await prisma.$transaction(async (tx) => {
    const claimExpiresAt = new Date(Date.now() + ROW_CLAIM_LEASE_MS);
    const updated = await tx.$executeRaw`
      UPDATE enrollment_import_rows
      SET claim_expires_at = ${claimExpiresAt}, updated_at = clock_timestamp()
      WHERE id = ${rowId}::uuid
        AND status = 'processing'::enrollment_import_row_status
        AND claim_token = ${claimToken}::uuid
        AND claimed_by = ${claimedBy}
        AND claim_expires_at > clock_timestamp()
    `;
    if (updated === 1) {
      await tx.$executeRaw`
        UPDATE enrollment_imports i
        SET last_heartbeat_at = clock_timestamp(), updated_at = clock_timestamp()
        FROM enrollment_import_rows r
        WHERE r.id = ${rowId}::uuid
          AND i.id = r.import_id
      `;
    }
    return updated === 1;
  });
  return result;
}

async function writeRowAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    actorUserId: string | null;
    handoffId?: string | null;
    importId: string;
    metadata?: Record<string, string | number | boolean | null>;
    rowId: string;
    userId?: string | null;
  },
) {
  return tx.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId,
      metadata: {
        importId: input.importId,
        rowId: input.rowId,
        userId: input.userId ?? null,
        ...(input.handoffId ? { handoffId: input.handoffId } : {}),
        ...(input.metadata ?? {}),
      } as Prisma.InputJsonValue,
      targetId: input.userId ?? input.rowId,
      targetType: input.userId ? "user" : "enrollment_import_row",
    },
  });
}

async function reapExpiredImportRowClaims(input: ReapExpiredImportRowClaimsInput = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<Array<{
      id: string;
      import_id: string;
      attempt_count: number;
      confirmed_by_user_id: string | null;
      generation: number;
    }>>`
      SELECT r.id, r.import_id, r.attempt_count, i.confirmed_by_user_id, i.dispatch_generation AS generation
      FROM enrollment_import_rows r
      INNER JOIN enrollment_imports i ON i.id = r.import_id
      WHERE r.status = 'processing'::enrollment_import_row_status
        AND r.claim_expires_at IS NOT NULL
        AND r.claim_expires_at <= clock_timestamp()
        AND i.status IN (
          'queued'::enrollment_import_status,
          'processing'::enrollment_import_status
        )
        AND (${input.importId ?? null}::uuid IS NULL OR r.import_id = ${input.importId ?? null}::uuid)
        AND (${input.generation ?? null}::int IS NULL OR i.dispatch_generation = ${input.generation ?? null})
      ORDER BY r.id
      LIMIT ${CLEANUP_BATCH_SIZE}
      FOR UPDATE OF r SKIP LOCKED
    `;
    let reset = 0;
    let failed = 0;
    const imports = new Map<string, number>();
    const requeueImports = new Map<string, number>();
    const reapedRows = await Promise.all(candidates.map(async (row) => {
      const exhausted = row.attempt_count >= MAX_ROW_ATTEMPTS;
      const nextStatus = exhausted
        ? EnrollmentImportRowStatus.failed
        : EnrollmentImportRowStatus.pending;
      const updated = await tx.enrollmentImportRow.updateMany({
        data: exhausted
          ? {
            claimExpiresAt: null,
            claimToken: null,
            claimedBy: null,
            errorCode: "worker_lease_expired",
            errorMessage: boundedErrorMessage("worker_lease_expired"),
            processedAt: new Date(),
            status: nextStatus,
          }
          : {
            claimExpiresAt: null,
            claimToken: null,
            claimedBy: null,
            status: nextStatus,
          },
        where: {
          id: row.id,
          status: EnrollmentImportRowStatus.processing,
          claimExpiresAt: { lte: new Date() },
        },
      });
      if (updated.count !== 1) return null;
      await writeRowAudit(tx, {
        action: exhausted
          ? "enrollment_import.row_failed"
          : "enrollment_import.row_claim_reaped",
        actorUserId: row.confirmed_by_user_id,
        importId: row.import_id,
        metadata: exhausted
          ? { errorCode: "worker_lease_expired" }
          : { reason: "worker_lease_expired" },
        rowId: row.id,
      });
      return { exhausted, generation: row.generation, importId: row.import_id };
    }));
    for (const row of reapedRows) {
      if (!row) continue;
      imports.set(row.importId, row.generation);
      if (row.exhausted) failed += 1;
      else {
        reset += 1;
        requeueImports.set(row.importId, row.generation);
      }
    }
    const requeuedDispatches = await Promise.all([...requeueImports].map(async ([importId, generation]) => {
      const updated = await tx.enrollmentImportDispatch.updateMany({
        data: {
          claimExpiresAt: null,
          claimToken: null,
          claimedBy: null,
          enqueuedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          nextAttemptAt: new Date(),
          status: EnrollmentImportDispatchStatus.pending,
        },
        where: {
          generation,
          importId,
          status: {
            in: [
              EnrollmentImportDispatchStatus.enqueued,
              EnrollmentImportDispatchStatus.failed,
              EnrollmentImportDispatchStatus.pending,
            ],
          },
        },
      });
      return updated.count;
    }));
    return {
      failed,
      imports: [...imports.entries()],
      requeuedDispatches: requeuedDispatches.reduce((total, count) => total + count, 0),
      reset,
      total: candidates.length,
    };
  });
  for (const [importId, generation] of result.imports) {
    await finalizeImportGeneration({ generation, importId });
  }
  return {
    failed: result.failed,
    requeuedDispatches: result.requeuedDispatches,
    reset: result.reset,
    total: result.total,
  };
}

function asObject(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textValue(value: unknown, nullable = false) {
  if (value === null || value === undefined) return nullable ? null : "";
  return typeof value === "string" ? value : "";
}

function parseImportInput(row: RowClaim) {
  const record: Record<string, unknown> = asObject(row.inputJson) ?? {};
  const email = (textValue(record.email) ?? "").trim().toLowerCase();
  const fullName = (textValue(record.full_name) ?? "").trim();
  if (!email || !fullName || email !== row.normalizedEmail) {
    throw new ImportProcessingError("invalid_input");
  }
  if (
    row.role === EnrollmentImportRole.student
    && Array.from(fullName).length > STUDENT_DISPLAY_NAME_MAX
  ) {
    throw new ImportProcessingError("profile_field_too_long");
  }
  if (row.role === EnrollmentImportRole.student) {
    const unknown = Object.keys(record).filter((key) => key !== "email" && key !== "full_name" && key !== "target_exam" && key !== PREVIEW_METADATA_KEY);
    if (unknown.length > 0) throw new ImportProcessingError("invalid_input");
    return {
      email,
      fullName,
      targetExamEventId: readTargetExamEventId(record),
    };
  }
  const unknown = Object.keys(record).filter((key) => !["email", "full_name", "phone", "headline", "bio", PREVIEW_METADATA_KEY].includes(key));
  if (unknown.length > 0) throw new ImportProcessingError("invalid_input");
  return {
    bio: textValue(record.bio, true),
    email,
    fullName,
    headline: textValue(record.headline, true),
    phone: textValue(record.phone, true),
  };
}

function readTargetExamEventId(object: Record<string, unknown>) {
  const metadata = asObject(object[PREVIEW_METADATA_KEY] as Prisma.JsonValue);
  const value = metadata?.targetExamEventId;
  return typeof value === "string" && value ? value : null;
}

function readPreviewMetadata(value: Prisma.JsonValue) {
  const object = asObject(value);
  const metadata = object?.[PREVIEW_METADATA_KEY];
  return asObject((metadata ?? null) as Prisma.JsonValue);
}

type LockedImportRow = RowClaim & {
  importStatus: EnrollmentImportStatus;
};

async function lockClaimedRow(tx: Prisma.TransactionClient, claim: RowClaim) {
  const rows = await tx.$queryRaw<Array<{
    id: string;
    import_id: string;
    row_number: number;
    normalized_email: string;
    operation: EnrollmentImportOperation;
    status: EnrollmentImportRowStatus;
    input_json: Prisma.JsonValue;
    matched_user_id: string | null;
    matched_user_updated_at: Date | null;
    attempt_count: number;
    claim_expires_at: Date;
    role: EnrollmentImportRole;
    handoff_method: EnrollmentHandoffMethod | null;
    created_by_user_id: string;
    confirmed_by_user_id: string | null;
    import_status: EnrollmentImportStatus;
  }>>`
    SELECT
      r.id,
      r.import_id,
      r.row_number,
      r.normalized_email,
      r.operation,
      r.status,
      r.input_json,
      r.matched_user_id,
      r.matched_user_updated_at,
      r.attempt_count,
      r.claim_expires_at,
      i.role,
      i.handoff_method,
      i.created_by_user_id,
      i.confirmed_by_user_id,
      i.status AS import_status
    FROM enrollment_import_rows r
    INNER JOIN enrollment_imports i ON i.id = r.import_id
    WHERE r.id = ${claim.id}::uuid
      AND r.status = 'processing'::enrollment_import_row_status
      AND r.claim_token = ${claim.claimToken}::uuid
      AND r.claimed_by = ${claim.claimedBy}
      AND r.claim_expires_at > clock_timestamp()
      AND i.dispatch_generation = ${claim.generation}
      AND i.status IN (
        'queued'::enrollment_import_status,
        'processing'::enrollment_import_status
      )
    FOR UPDATE OF r
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...claim,
    attemptCount: row.attempt_count,
    claimExpiresAt: row.claim_expires_at,
    createdByUserId: row.created_by_user_id,
    confirmedByUserId: row.confirmed_by_user_id,
    handoffMethod: row.handoff_method,
    importStatus: row.import_status,
    inputJson: row.input_json,
    matchedUserId: row.matched_user_id,
    matchedUserUpdatedAt: row.matched_user_updated_at,
    normalizedEmail: row.normalized_email,
    operation: row.operation,
    role: row.role,
    rowNumber: row.row_number,
    status: row.status,
  } satisfies LockedImportRow;
}

async function lockEmailAndFindUsers(tx: Prisma.TransactionClient, email: string) {
  // hashtextextended is stable inside PostgreSQL and gives a signed bigint for
  // pg_advisory_xact_lock without carrying user-controlled SQL into the query.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))`;
  return tx.$queryRaw<Array<{
    id: string;
    email: string;
    full_name: string;
    preview_purpose: string | null;
    status: UserStatus;
    soft_deleted_at: Date | null;
    updated_at: Date;
  }>>`
    SELECT id, email, full_name, status, preview_purpose, soft_deleted_at, updated_at
    FROM users
    WHERE lower(email) = ${email}
    ORDER BY id
    FOR UPDATE
  `;
}

async function activeRoleAssignment(
  tx: Prisma.TransactionClient,
  userId: string,
  role: EnrollmentImportRole,
) {
  const roleName = role === EnrollmentImportRole.student ? RoleName.student : RoleName.tutor;
  const rows = await tx.$queryRaw<Array<{
    assigned_at: Date;
    id: string;
    role: RoleName;
    revoked_at: Date | null;
  }>>`
    SELECT id, role, revoked_at, assigned_at
    FROM role_assignments
    WHERE user_id = ${userId}::uuid
    ORDER BY assigned_at DESC, id DESC
    FOR UPDATE
  `;
  return {
    active: rows.find((assignment) => assignment.revoked_at === null && assignment.role === roleName) ?? null,
    assignments: rows,
  };
}

function assertCurrentUserForUpdate({
  assignment,
  assignments,
  metadata,
  row,
  user,
}: {
  assignment: { id: string; role: RoleName; revoked_at: Date | null } | null;
  assignments: Array<{ assigned_at: Date; id: string; role: RoleName; revoked_at: Date | null }>;
  metadata: Record<string, unknown> | null;
  row: LockedImportRow;
  user: {
    id: string;
    preview_purpose: string | null;
    status: UserStatus;
    soft_deleted_at: Date | null;
    updated_at: Date;
  };
}) {
  if (
    !row.matchedUserId
    || row.matchedUserId !== user.id
    || !row.matchedUserUpdatedAt
    || user.updated_at.getTime() !== row.matchedUserUpdatedAt.getTime()
  ) {
    throw new ImportProcessingError("changed_since_preview");
  }
  if (
    user.status !== UserStatus.active
    || user.soft_deleted_at !== null
    || user.preview_purpose !== null
  ) {
    throw new ImportProcessingError("inactive_account");
  }
  if (!assignment || assignment.revoked_at !== null || assignment.role !== (
    row.role === EnrollmentImportRole.student ? RoleName.student : RoleName.tutor
  )) {
    throw new ImportProcessingError("role_conflict");
  }
  if (metadata?.matchedUserRoleAssignmentId !== assignment.id) {
    throw new ImportProcessingError("changed_since_preview");
  }
  const snapshot = metadata?.matchedUserRoleSnapshot;
  if (!Array.isArray(snapshot) || snapshot.length !== assignments.length) {
    throw new ImportProcessingError("changed_since_preview");
  }
  for (const current of assignments) {
    const previous = snapshot.find((candidate) =>
      typeof candidate === "object"
      && candidate !== null
      && (candidate as Record<string, unknown>).assignmentId === current.id,
    ) as Record<string, unknown> | undefined;
    if (
      !previous
      || previous.role !== current.role
      || (previous.revokedAt === null) !== (current.revoked_at === null)
      || typeof previous.assignedAt !== "string"
      || new Date(previous.assignedAt).getTime() !== current.assigned_at.getTime()
    ) {
      throw new ImportProcessingError("changed_since_preview");
    }
  }
}

async function assertTargetExamEventIsActive(
  tx: Prisma.TransactionClient,
  targetExamEventId: string | null,
) {
  if (!targetExamEventId) return;
  const event = await tx.examEvent.findFirst({
    select: { id: true },
    where: { id: targetExamEventId, isActive: true },
  });
  if (!event) throw new ImportProcessingError("changed_since_preview");
}

async function markTerminalRow(
  tx: Prisma.TransactionClient,
  input: {
    claim: LockedImportRow;
    error?: ImportProcessingErrorCode;
    resultUserId?: string | null;
    handoffId?: string | null;
    status: EnrollmentImportRowStatus;
  },
) {
  const now = new Date();
  const errorCode = input.error ?? null;
  const updated = await tx.$executeRaw`
    UPDATE enrollment_import_rows
    SET
      status = ${input.status}::enrollment_import_row_status,
      result_user_id = ${input.resultUserId ?? null}::uuid,
      handoff_id = ${input.handoffId ?? null}::uuid,
      error_code = ${errorCode},
      error_message = ${errorCode ? boundedErrorMessage(errorCode) : null},
      claim_token = NULL,
      claim_expires_at = NULL,
      claimed_by = NULL,
      processed_at = ${now},
      updated_at = clock_timestamp()
    WHERE id = ${input.claim.id}::uuid
      AND status = 'processing'::enrollment_import_row_status
      AND claim_token = ${input.claim.claimToken}::uuid
      AND claimed_by = ${input.claim.claimedBy}
      AND claim_expires_at > clock_timestamp()
  `;
  if (updated !== 1) throw new StaleImportRowClaimError();
}

async function createImportedAccount(
  tx: Prisma.TransactionClient,
  row: LockedImportRow,
  input: ReturnType<typeof parseImportInput>,
) {
  if (!row.handoffMethod) throw new ImportProcessingError("handoff_method_missing");
  const rawSecret = row.handoffMethod === EnrollmentHandoffMethod.invite_link
    ? createOpaqueToken()
    : generateTemporaryPassword();
  const passwordHash = await hashPassword(
    row.handoffMethod === EnrollmentHandoffMethod.temporary_password
      ? rawSecret
      : createOpaqueToken(24),
  );
  const role = row.role === EnrollmentImportRole.student ? RoleName.student : RoleName.tutor;
  const created = await tx.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      mustChangePassword: true,
      passwordHash,
      phone: row.role === EnrollmentImportRole.tutor && "phone" in input ? input.phone : null,
      status: UserStatus.active,
    },
  });
  await tx.roleAssignment.create({
    data: {
      assignedByUserId: row.confirmedByUserId ?? row.createdByUserId,
      role,
      userId: created.id,
    },
  });
  if (row.role === EnrollmentImportRole.student && "targetExamEventId" in input) {
    await assertTargetExamEventIsActive(tx, input.targetExamEventId ?? null);
    await tx.studentProfile.create({
      data: {
        displayName: input.fullName,
        targetExamEventId: input.targetExamEventId,
        userId: created.id,
      },
    });
    await tx.notificationPreference.create({ data: { userId: created.id } });
  } else if (row.role === EnrollmentImportRole.tutor && "headline" in input) {
    await tx.tutorProfile.create({
      data: {
        bio: input.bio,
        headline: input.headline,
        userId: created.id,
      },
    });
  } else {
    throw new ImportProcessingError("invalid_input");
  }
  const handoff = await createEnrollmentHandoff({
    createdByUserId: row.confirmedByUserId ?? row.createdByUserId,
    method: row.handoffMethod,
    rawSecret,
    sourceImportRowId: row.id,
    tokenHash: row.handoffMethod === EnrollmentHandoffMethod.invite_link
      ? hashToken(rawSecret)
      : null,
    tx,
    userId: created.id,
  });
  return { handoffId: handoff.handoffId, userId: created.id };
}

async function updateImportedAccount(
  tx: Prisma.TransactionClient,
  row: LockedImportRow,
  user: { id: string },
  input: ReturnType<typeof parseImportInput>,
) {
  if (row.role === EnrollmentImportRole.student && "targetExamEventId" in input) {
    await assertTargetExamEventIsActive(tx, input.targetExamEventId ?? null);
    const profile = await tx.studentProfile.findUnique({ select: { userId: true }, where: { userId: user.id } });
    if (!profile) throw new ImportProcessingError("missing_profile");
    await tx.user.update({ data: { fullName: input.fullName }, where: { id: user.id } });
    await tx.studentProfile.update({
      data: { displayName: input.fullName, targetExamEventId: input.targetExamEventId },
      where: { userId: user.id },
    });
    return;
  }
  if (row.role === EnrollmentImportRole.tutor && "headline" in input) {
    const profile = await tx.tutorProfile.findUnique({ select: { userId: true }, where: { userId: user.id } });
    if (!profile) throw new ImportProcessingError("missing_profile");
    await tx.user.update({
      data: { fullName: input.fullName, phone: input.phone },
      where: { id: user.id },
    });
    await tx.tutorProfile.update({
      data: { bio: input.bio, headline: input.headline },
      where: { userId: user.id },
    });
    return;
  }
  throw new ImportProcessingError("invalid_input");
}

async function processClaimedRow(claim: RowClaim) {
  let heartbeatTimer: NodeJS.Timeout | null = setInterval(() => {
    void heartbeatImportRowClaim({
      claimToken: claim.claimToken,
      rowId: claim.id,
      workerId: claim.claimedBy,
    }).catch(() => undefined);
  }, ROW_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  try {
    return await prisma.$transaction(async (tx) => {
      const row = await lockClaimedRow(tx, claim);
      if (!row) return { status: "stale" as const };
      const input = parseImportInput(row);
      const metadata = readPreviewMetadata(row.inputJson);
      const users = await lockEmailAndFindUsers(tx, input.email);
      const user = users[0] ?? null;
      let resultUserId: string;
      let handoffId: string | null = null;
      let terminalStatus: EnrollmentImportRowStatus;

      if (row.operation === EnrollmentImportOperation.create) {
        if (user) throw new ImportProcessingError("changed_since_preview");
        const created = await createImportedAccount(tx, row, input);
        resultUserId = created.userId;
        handoffId = created.handoffId;
        terminalStatus = EnrollmentImportRowStatus.created;
      } else if (row.operation === EnrollmentImportOperation.update) {
        if (!user) throw new ImportProcessingError("changed_since_preview");
        const roleState = await activeRoleAssignment(tx, user.id, row.role);
        assertCurrentUserForUpdate({
          assignment: roleState.active,
          assignments: roleState.assignments,
          metadata,
          row,
          user,
        });
        await updateImportedAccount(tx, row, user, input);
        resultUserId = user.id;
        terminalStatus = EnrollmentImportRowStatus.updated;
      } else {
        throw new ImportProcessingError("invalid_operation");
      }

      await markTerminalRow(tx, {
        claim: row,
        resultUserId,
        handoffId,
        status: terminalStatus,
      });
      await writeRowAudit(tx, {
        action: terminalStatus === EnrollmentImportRowStatus.created
          ? "enrollment_import.row_created"
          : "enrollment_import.row_updated",
        actorUserId: row.confirmedByUserId ?? row.createdByUserId,
        handoffId,
        importId: row.importId,
        metadata: {
          operation: row.operation,
          role: row.role,
        },
        rowId: row.id,
        userId: resultUserId,
      });
      return { status: terminalStatus };
    });
  } catch (error) {
    if (error instanceof StaleImportRowClaimError) {
      return { status: "stale" as const };
    }
    if (error instanceof ImportProcessingError) {
      try {
        return await prisma.$transaction(async (tx) => {
          const row = await lockClaimedRow(tx, claim);
          if (!row) return { status: "stale" as const };
          await markTerminalRow(tx, {
            claim: row,
            error: error.code,
            status: EnrollmentImportRowStatus.failed,
          });
          await writeRowAudit(tx, {
            action: "enrollment_import.row_failed",
            actorUserId: row.confirmedByUserId ?? row.createdByUserId,
            importId: row.importId,
            metadata: { errorCode: error.code },
            rowId: row.id,
          });
          return { status: EnrollmentImportRowStatus.failed, errorCode: error.code };
        });
      } catch (failure) {
        if (failure instanceof StaleImportRowClaimError) return { status: "stale" as const };
        throw failure;
      }
    }
    throw error;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function markImportProcessing(importId: string, generation: number) {
  return prisma.enrollmentImport.updateMany({
    data: {
      startedAt: new Date(),
      status: EnrollmentImportStatus.processing,
    },
    where: {
      dispatchGeneration: generation,
      id: importId,
      status: EnrollmentImportStatus.queued,
    },
  });
}

async function persistRetryGenerationResult(
  tx: Prisma.TransactionClient,
  {
    counts,
    generation,
    importId,
    status,
  }: {
    counts: ImportRowCounts;
    generation: number;
    importId: string;
    status: EnrollmentImportStatus;
  },
) {
  const audits = await tx.auditLog.findMany({
    select: { actorUserId: true, id: true, metadata: true, targetId: true, targetType: true },
    where: {
      action: "enrollment_import.retry_queued",
      targetId: importId,
      targetType: "enrollment_import",
    },
  });
  const matchingAudits = audits.filter((audit) => retryAuditMetadata(audit.metadata ?? null)?.generation === generation);
  await Promise.all(matchingAudits.map((audit) => tx.auditLog.create({
    data: {
      action: "enrollment_import.retry_completed",
      actorUserId: audit.actorUserId,
      metadata: {
        ...(asObject(audit.metadata ?? null) ?? {}),
        completedFromAuditId: audit.id,
        result: { counts, status },
      } as Prisma.InputJsonValue,
      targetId: audit.targetId,
      targetType: audit.targetType,
    },
  })));
}

async function finalizeImportGeneration({
  generation,
  importId,
  jobErrorCode,
}: {
  generation: number;
  importId: string;
  jobErrorCode?: ImportProcessingErrorCode;
}): Promise<ProcessGenerationResult> {
  return prisma.$transaction(async (tx) => {
    const imported = await tx.enrollmentImport.findFirst({
      select: { confirmedByUserId: true, status: true },
      where: { dispatchGeneration: generation, id: importId },
    });
    if (!imported) {
      return { counts: emptyImportRowCounts(), finalized: false, importId, status: null };
    }
    const counts = await deriveImportRowCounts(tx, importId);
    const nextStatus = finalImportStatus(counts);
    if (
      !nextStatus
      || (imported.status !== EnrollmentImportStatus.queued && imported.status !== EnrollmentImportStatus.processing)
    ) {
      return { counts, finalized: false, importId, status: imported.status };
    }
    const now = new Date();
    const updated = await tx.enrollmentImport.updateMany({
      data: {
        completedAt: now,
        lastErrorCode: jobErrorCode ?? null,
        lastErrorMessage: jobErrorCode ? boundedErrorMessage(jobErrorCode) : null,
        status: nextStatus,
      },
      where: {
        dispatchGeneration: generation,
        id: importId,
        status: { in: [EnrollmentImportStatus.queued, EnrollmentImportStatus.processing] },
      },
    });
    if (updated.count === 1) {
      await persistRetryGenerationResult(tx, {
        counts,
        generation,
        importId,
        status: nextStatus,
      });
      await tx.auditLog.create({
        data: {
          action: "enrollment_import.finalized",
          actorUserId: imported.confirmedByUserId,
          metadata: {
            createdCount: counts.created,
            failedCount: counts.failed,
            generation,
            importId,
            invalidCount: counts.invalid,
            skippedCount: counts.skipped,
            status: nextStatus,
            updatedCount: counts.updated,
          } as Prisma.InputJsonValue,
          targetId: importId,
          targetType: "enrollment_import",
        },
      });
    }
    return { counts, finalized: updated.count === 1, importId, status: nextStatus };
  });
}

async function processImportGeneration({
  generation,
  importId,
  workerId = DEFAULT_WORKER_ID,
}: {
  generation: number;
  importId: string;
  workerId?: string;
}) {
  if (!Number.isSafeInteger(generation) || generation < 1) {
    return { counts: emptyImportRowCounts(), finalized: false, importId, status: null } satisfies ProcessGenerationResult;
  }
  await markImportProcessing(importId, generation);
  const boundedWorker = boundedWorkerId(workerId);
  let processed = 0;
  while (processed < 1_000) {
    const claims = await claimImportRows({
      generation,
      importId,
      limit: ROW_BATCH_SIZE,
      workerId: boundedWorker,
    });
    if (claims.length === 0) break;
    for (const claim of claims) {
      await processClaimedRow(claim);
      processed += 1;
    }
  }
  return finalizeImportGeneration({ generation, importId });
}

async function failImportGeneration({
  generation,
  importId,
  errorCode = "job_exhausted",
}: {
  generation: number;
  importId: string;
  errorCode?: ImportProcessingErrorCode;
}) {
  await prisma.$transaction(async (tx) => {
    const imported = await tx.enrollmentImport.findFirst({
      select: { confirmedByUserId: true, dispatchGeneration: true, status: true },
      where: { dispatchGeneration: generation, id: importId },
    });
    if (
      !imported
      || imported.dispatchGeneration !== generation
      || (imported.status !== EnrollmentImportStatus.queued && imported.status !== EnrollmentImportStatus.processing)
    ) {
      return;
    }
    const rows = await tx.enrollmentImportRow.findMany({
      select: { id: true, importId: true },
      where: {
        importId,
        status: { in: [EnrollmentImportRowStatus.pending, EnrollmentImportRowStatus.processing] },
      },
    });
    await Promise.all(rows.map(async (row) => {
      const updated = await tx.enrollmentImportRow.updateMany({
        data: {
          claimExpiresAt: null,
          claimToken: null,
          claimedBy: null,
          errorCode,
          errorMessage: boundedErrorMessage(errorCode),
          processedAt: new Date(),
          status: EnrollmentImportRowStatus.failed,
        },
        where: {
          id: row.id,
          status: { in: [EnrollmentImportRowStatus.pending, EnrollmentImportRowStatus.processing] },
        },
      });
      if (updated.count !== 1) return;
      await writeRowAudit(tx, {
        action: "enrollment_import.row_failed",
        actorUserId: imported?.confirmedByUserId ?? null,
        importId,
        metadata: { errorCode, generation },
        rowId: row.id,
      });
    }));
  });
  return finalizeImportGeneration({ generation, importId, jobErrorCode: errorCode });
}

async function retryEnrollmentImport(input: RetryEnrollmentImportInput): Promise<RetryEnrollmentImportResult> {
  // Validate before opening a transaction or constructing any Prisma `in`
  // filters. Invalid row selections must stay a stable boundary error.
  const selection = parseRetrySelection(input);
  if (!selection) {
    throw new ImportRetryError("row_selection_invalid");
  }
  const { rowIds, rowNumbers } = selection;
  const idempotencyKey = input.idempotencyKey?.normalize("NFKC").trim();
  if (
    input.idempotencyKey !== undefined
    && (
      !idempotencyKey
      || Array.from(idempotencyKey).length > 160
      || /[\u0000-\u001f\u007f]/u.test(idempotencyKey)
    )
  ) {
    throw new ImportRetryError("retry_conflict");
  }
  if (
    input.expectedGeneration !== undefined
    && (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration < 1)
  ) {
    throw new ImportRetryError("retry_conflict");
  }
  const requestKey = retryIdentityKey(idempotencyKey, rowIds, rowNumbers);
  const payloadKey = retryPayloadKey({
    expectedGeneration: input.expectedGeneration,
    rowIds,
    rowNumbers,
  });
  return prisma.$transaction(async (tx) => {
    const imports = await tx.$queryRaw<Array<{
      id: string;
      status: EnrollmentImportStatus;
      dispatch_generation: number;
    }>>`
      SELECT id, status, dispatch_generation
      FROM enrollment_imports
      WHERE id = ${input.importId}::uuid
        AND created_by_user_id = ${input.actorUserId}::uuid
      FOR UPDATE
    `;
    const imported = imports[0];
    if (!imported) throw new ImportRetryError("import_not_found");

    // The request identity is durable in the retry audit metadata. Query the
    // JSON key directly rather than using a bounded recent-audit page: a
    // response may be replayed long after many other retries were recorded.
    const retryAudits = await tx.$queryRaw<Array<{
      id: string;
      metadata: Prisma.JsonValue | null;
    }>>`
      SELECT id, metadata
      FROM audit_logs
      WHERE action IN ('enrollment_import.retry_queued', 'enrollment_import.retry_completed')
        AND actor_user_id = ${input.actorUserId}::uuid
        AND target_id = ${input.importId}::uuid
        AND target_type = 'enrollment_import'
        AND metadata ->> 'requestKey' = ${requestKey}
      ORDER BY occurred_at DESC,
               CASE WHEN action = 'enrollment_import.retry_completed' THEN 1 ELSE 0 END DESC,
               id DESC
    `;
    const matchingRetry = retryAudits
      .map((audit) => retryAuditMetadata(audit.metadata ?? null))
      .find((metadata) => metadata?.requestKey === requestKey);
    if (
      matchingRetry
      && (
        matchingRetry.payloadKey !== null
          ? matchingRetry.payloadKey !== payloadKey
          : input.expectedGeneration !== undefined && input.expectedGeneration !== matchingRetry.previousGeneration
      )
    ) {
      throw new ImportRetryError("retry_conflict");
    }

    if (matchingRetry) {
      const currentCounts = await deriveImportRowCounts(tx, input.importId);
      const replayResult = matchingRetry.result
        ?? (matchingRetry.generation === imported.dispatch_generation && validRetryStatus(imported.status)
          ? { counts: currentCounts, status: imported.status }
          : null);
      if (!replayResult) throw new ImportRetryError("retry_conflict");
      return {
        counts: replayResult.counts,
        generation: matchingRetry.generation,
        idempotent: true,
        importId: input.importId,
        queueJobId: matchingRetry.queueJobId ?? buildImportJobId(input.importId, matchingRetry.generation),
        retriedCount: matchingRetry.retriedCount,
        status: replayResult.status,
      };
    }

    if (
      (imported.status === EnrollmentImportStatus.queued || imported.status === EnrollmentImportStatus.processing)
    ) {
      throw new ImportRetryError("retry_conflict");
    }

    if (
      input.expectedGeneration !== undefined
      && input.expectedGeneration !== imported.dispatch_generation
    ) {
      throw new ImportRetryError("retry_conflict");
    }
    if (imported.status !== EnrollmentImportStatus.failed && imported.status !== EnrollmentImportStatus.partial) {
      throw new ImportRetryError("invalid_import_state");
    }
    const activeClaims = await tx.enrollmentImportRow.count({
      where: {
        claimExpiresAt: { gt: new Date() },
        importId: input.importId,
        status: EnrollmentImportRowStatus.processing,
      },
    });
    if (activeClaims > 0) throw new ImportRetryError("active_claims");

    const selected = await tx.enrollmentImportRow.findMany({
      select: { id: true, rowNumber: true, status: true },
      where: {
        importId: input.importId,
        ...(rowIds.length || rowNumbers.length
          ? {
            OR: [
              ...(rowIds.length ? [{ id: { in: rowIds } }] : []),
              ...(rowNumbers.length ? [{ rowNumber: { in: rowNumbers } }] : []),
            ],
          }
          : { status: EnrollmentImportRowStatus.failed }),
      },
      orderBy: { rowNumber: "asc" },
    });
    if (selected.length === 0) throw new ImportRetryError("no_failed_rows");
    if ((rowIds.length || rowNumbers.length) && selected.length !== rowIds.length + rowNumbers.length) {
      throw new ImportRetryError("row_selection_invalid");
    }
    if (selected.some((row) => row.status !== EnrollmentImportRowStatus.failed)) {
      throw new ImportRetryError("row_selection_invalid");
    }
    const updated = await tx.enrollmentImportRow.updateMany({
      data: {
        attemptCount: 0,
        claimExpiresAt: null,
        claimToken: null,
        claimedBy: null,
        errorCode: null,
        errorMessage: null,
        processedAt: null,
        status: EnrollmentImportRowStatus.pending,
      },
      where: { id: { in: selected.map((row) => row.id) }, status: EnrollmentImportRowStatus.failed },
    });
    if (updated.count !== selected.length) throw new ImportRetryError("row_selection_invalid");

    const generation = imported.dispatch_generation + 1;
    const queueJobId = buildImportJobId(input.importId, generation);
    const counts = await deriveImportRowCounts(tx, input.importId);
    await tx.enrollmentImport.update({
      data: {
        completedAt: null,
        dispatchGeneration: generation,
        lastErrorCode: null,
        lastErrorMessage: null,
        status: EnrollmentImportStatus.queued,
      },
      where: { id: input.importId },
    });
    await tx.enrollmentImportDispatch.create({
      data: {
        generation,
        importId: input.importId,
        queueJobId,
        status: EnrollmentImportDispatchStatus.pending,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "enrollment_import.retry_queued",
        actorUserId: input.actorUserId,
        metadata: {
          generation,
          previousGeneration: imported.dispatch_generation,
          payloadKey,
          queueJobId,
          requestKey,
          retriedCount: updated.count,
          result: {
            counts,
            status: EnrollmentImportStatus.queued,
          },
        } as Prisma.InputJsonValue,
        targetId: input.importId,
        targetType: "enrollment_import",
      },
    });
    return {
      counts,
      generation,
      idempotent: false,
      importId: input.importId,
      queueJobId,
      status: EnrollmentImportStatus.queued,
      retriedCount: updated.count,
    };
  });
}

async function cleanupEnrollmentImports({
  handoffRetentionMs = HANDOFF_RETENTION_MS,
  importRetentionMs = IMPORT_RETENTION_MS,
  now = new Date(),
}: CleanupEnrollmentImportsInput = {}): Promise<CleanupEnrollmentImportsResult> {
  const importCutoff = new Date(now.getTime() - Math.max(importRetentionMs, 1));
  const handoffCutoff = new Date(now.getTime() - Math.max(handoffRetentionMs, 1));
  return prisma.$transaction(async (tx) => {
    const expired = await tx.enrollmentHandoff.findMany({
      select: { id: true, userId: true },
      where: {
        method: EnrollmentHandoffMethod.invite_link,
        OR: [{ expiresAt: { lte: now } }, { expiresAt: null }],
        status: { in: [EnrollmentHandoffStatus.pending, EnrollmentHandoffStatus.released] },
        user: { previewPurpose: null },
      },
      take: CLEANUP_BATCH_SIZE,
    });
    const expirationResults = await Promise.all(expired.map(async (handoff) => {
      const updated = await tx.enrollmentHandoff.updateMany({
        data: {
          secretEnvelope: Prisma.DbNull,
          status: EnrollmentHandoffStatus.expired,
        },
        where: {
          id: handoff.id,
          method: EnrollmentHandoffMethod.invite_link,
          OR: [{ expiresAt: { lte: now } }, { expiresAt: null }],
          status: { in: [EnrollmentHandoffStatus.pending, EnrollmentHandoffStatus.released] },
          user: { previewPurpose: null },
        },
      });
      if (updated.count !== 1) return 0;
      await writeHandoffAudit({
        action: "enrollment_handoff.expired",
        handoffId: handoff.id,
        metadata: { method: EnrollmentHandoffMethod.invite_link },
        tx,
        userId: handoff.userId,
      });
      return 1;
    }));
    const expiredHandoffs = expirationResults.reduce<number>((total, result) => total + result, 0);

    const terminalHandoffs = await tx.enrollmentHandoff.findMany({
      select: { id: true },
      where: {
        status: { in: [EnrollmentHandoffStatus.completed, EnrollmentHandoffStatus.expired, EnrollmentHandoffStatus.revoked] },
        updatedAt: { lt: handoffCutoff },
        user: { previewPurpose: null },
      },
      take: CLEANUP_BATCH_SIZE,
    });
    let purgedHandoffs = 0;
    if (terminalHandoffs.length > 0) {
      const result = await tx.enrollmentHandoff.deleteMany({
        where: {
          id: { in: terminalHandoffs.map((handoff) => handoff.id) },
          user: { previewPurpose: null },
        },
      });
      purgedHandoffs = result.count;
    }

    const terminalImports = await tx.enrollmentImport.findMany({
      select: { id: true },
      where: {
        status: {
          in: [
            EnrollmentImportStatus.cancelled,
            EnrollmentImportStatus.completed,
            EnrollmentImportStatus.partial,
            EnrollmentImportStatus.failed,
          ],
        },
        OR: [
          { completedAt: { lt: importCutoff } },
          // A malformed legacy terminal row may lack the shared terminal
          // timestamp. Its updatedAt is the bounded retention fallback.
          { completedAt: null, updatedAt: { lt: importCutoff } },
        ],
      },
      take: CLEANUP_BATCH_SIZE,
    });
    let purgedRows = 0;
    let purgedDispatches = 0;
    let purgedImports = 0;
    const cleanupResults = await Promise.all(terminalImports.map(async (imported) => {
      // The initial candidate page is only a hint. Lock and recheck the
      // terminal state/cutoff per import before reading its children so a
      // concurrent retry either wins the lock (and makes this row ineligible)
      // or waits behind a cleanup that removes the import first.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM enrollment_imports
        WHERE id = ${imported.id}::uuid
          AND status IN (
            'cancelled'::enrollment_import_status,
            'completed'::enrollment_import_status,
            'partial'::enrollment_import_status,
            'failed'::enrollment_import_status
          )
          AND (
            completed_at < ${importCutoff}
            OR (completed_at IS NULL AND updated_at < ${importCutoff})
          )
        FOR UPDATE
      `;
      if (locked.length !== 1) return { dispatches: 0, imports: 0, rows: 0 };
      const rowLinks = await tx.enrollmentImportRow.findMany({
        select: { id: true },
        where: { importId: imported.id },
      });
      if (rowLinks.length > 0) {
        await tx.enrollmentHandoff.updateMany({
          data: { sourceImportRowId: null },
          where: {
            sourceImportRowId: { in: rowLinks.map((row) => row.id) },
            user: { previewPurpose: null },
          },
        });
      }
      return Promise.all([
        tx.enrollmentImportDispatch.deleteMany({ where: { importId: imported.id } }),
        tx.enrollmentImportRow.deleteMany({ where: { importId: imported.id } }),
      ]).then(([dispatchResult, rowResult]) =>
        tx.enrollmentImport.deleteMany({ where: { id: imported.id } }).then((importResult) => ({
          dispatches: dispatchResult.count,
          imports: importResult.count,
          rows: rowResult.count,
        })),
      );
    }));
    for (const result of cleanupResults) {
      purgedDispatches += result.dispatches;
      purgedRows += result.rows;
      purgedImports += result.imports;
    }
    return {
      expiredHandoffs,
      purgedDispatches,
      purgedHandoffs,
      purgedImports,
      purgedRows,
    };
  });
}

export {
  CLEANUP_BATCH_SIZE,
  DEFAULT_WORKER_ID,
  HANDOFF_RETENTION_MS,
  IMPORT_RETENTION_MS,
  MAX_ROW_ATTEMPTS,
  ROW_BATCH_SIZE,
  ROW_CLAIM_LEASE_MS,
  ROW_HEARTBEAT_INTERVAL_MS,
  StaleImportRowClaimError,
  ImportProcessingError,
  ImportRetryError,
  isRetryBodyShape,
  claimImportRows,
  cleanupEnrollmentImports,
  deriveImportRowCounts,
  failImportGeneration,
  finalizeImportGeneration,
  finalImportStatus,
  heartbeatImportRowClaim,
  processImportGeneration,
  parseRetrySelection,
  reapExpiredImportRowClaims,
  retryEnrollmentImport,
};

export type {
  CleanupEnrollmentImportsInput,
  CleanupEnrollmentImportsResult,
  HeartbeatImportRowClaimInput,
  ImportRowCounts,
  ProcessGenerationResult,
  ReapExpiredImportRowClaimsInput,
  RetryEnrollmentImportInput,
  RetryEnrollmentImportResult,
  RetrySelection,
  RetrySelectionInput,
  RowClaim,
};
