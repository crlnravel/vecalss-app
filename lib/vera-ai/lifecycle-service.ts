import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  canonicalExportJson,
  exportDownloadDeadline,
  exportSnapshotDigest,
  formatExportInstant,
  preReadyExportDeadlines,
  resultStagePurgeDeadline,
  splitExportParts,
  VERA_EXPORT_FORMAT,
  VERA_EXPORT_MAX_BYTES,
  VERA_EXPORT_MAX_PARTS,
  VERA_EXPORT_PART_BYTES,
  VERA_MATERIALIZATION_LEASE_MS,
  VERA_EXPORT_GRANT_LEASE_MS,
  VERA_RETENTION_POLICY_VERSION,
} from "./retention";
import { canonicalOperationPayload, sha256Hex, VERA_FINGERPRINT_KEY_VERSION } from "./contracts";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";

type LifecycleDb = PrismaClient;
type Tx = Prisma.TransactionClient;

const PUBLIC_LIFECYCLE_OPERATIONS = ["export_create", "conversation_delete", "artifact_delete"] as const;
type PublicLifecycleOperation = (typeof PUBLIC_LIFECYCLE_OPERATIONS)[number];

export type LifecycleErrorCode =
  | "idempotency_conflict"
  | "idempotency_key_expired"
  | "target_revision_conflict"
  | "deletion_pending"
  | "target_unavailable"
  | "artifact_unavailable"
  | "export_not_ready"
  | "export_download_in_progress"
  | "export_access_consumed"
  | "export_unavailable"
  | "export_expired"
  | "export_payload_unavailable"
  | "export_size_limit"
  | "export_state_mismatch"
  | "recovery_expired"
  | "account_deleted"
  | "hold_active"
  | "capability_denied"
  | "invalid_request";

export class VeraLifecycleError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    readonly code: LifecycleErrorCode,
    message: string = code,
    status = lifecycleStatus(code),
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VeraLifecycleError";
    this.status = status;
    this.details = details;
  }
}

function lifecycleStatus(code: LifecycleErrorCode): number {
  switch (code) {
    case "target_unavailable":
    case "artifact_unavailable":
      return 410;
    case "export_unavailable":
    case "export_expired":
    case "export_access_consumed":
    case "account_deleted":
      return 410;
    case "export_download_in_progress":
    case "export_not_ready":
    case "target_revision_conflict":
    case "deletion_pending":
    case "idempotency_conflict":
    case "idempotency_key_expired":
    case "hold_active":
      return 409;
    case "export_size_limit":
      return 422;
    case "invalid_request":
      return 400;
    default:
      return 409;
  }
}

export type LifecycleAcceptedDto = {
  operationId: string;
  resultKind: "export_job" | "conversation_delete" | "artifact_delete";
  state: "pending" | "processing" | "completed" | "conflict" | "failed_retryable" | "failed_terminal" | "expired";
  targetState?: "available" | "deletion_pending" | "deleted" | "purged" | "account_deleted" | "target_unavailable";
  targetId?: string;
  exportId?: string;
  exportAsOf?: string | null;
  downloadExpiresAt?: string | null;
  exportAccessGrantState?: "none" | "active" | "claiming" | "consumed" | "expired";
  exportAccessGrantVersion?: number;
  accountState?: "active" | "deletion_pending" | "account_deleted";
  accessMode?: "session" | "cleanup_grant";
  replayed: boolean;
};

export type VeraExportStatusDto = {
  exportId: string;
  operationId: string;
  state: "pending" | "materializing" | "ready" | "failed_retryable" | "failed_terminal" | "expired";
  accountState: "active" | "deletion_pending" | "account_deleted";
  accessMode: "session" | "cleanup_grant";
  format: "json_v1";
  exportAsOf: string | null;
  downloadExpiresAt: string | null;
  downloadAvailable: boolean;
  exportAccessGrantState: "none" | "active" | "claiming" | "consumed" | "expired";
  exportAccessGrantVersion: number;
  retryAfterAt: string | null;
  errorCode: string | null;
  replayed: boolean;
};

export type LifecycleStatusDto = {
  operationId: string;
  operation: PublicLifecycleOperation;
  resultKind: "export_job" | "conversation_delete" | "artifact_delete";
  state: string;
  targetState: string | null;
  targetId: string | null;
  statusCode: string | null;
  errorCode: string | null;
  errorDigest: string | null;
  expiresAt: string | null;
  replayed: boolean;
};

export type ExportDownload = {
  bytes: Buffer;
  snapshotDigest: string;
  packageBytes: number;
};

type EnvelopeLike = Record<string, unknown>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asEnvelope(value: unknown): AiEncryptedPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as EnvelopeLike;
  if (typeof candidate.keyRef !== "string" || typeof candidate.wrappedDek !== "string"
    || typeof candidate.ciphertext !== "string" || typeof candidate.nonceOrIv !== "string"
    || typeof candidate.authenticationTag !== "string" || candidate.cipherVersion !== "aes-256-gcm-v1"
    || typeof candidate.plaintextDigest !== "string" || typeof candidate.plaintextBytes !== "number") return null;
  return candidate as unknown as AiEncryptedPayload;
}

async function dbNow(tx: Tx): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return rows[0]?.now ?? new Date();
}

async function lockStudent(tx: Tx, studentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${studentId}::uuid FOR UPDATE`;
}

async function lockIdempotency(tx: Tx, studentId: string, operation: string, clientRequestId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM ai_idempotency_keys
    WHERE student_id = ${studentId}::uuid AND operation = ${operation}::ai_idempotency_operation
      AND client_request_id = ${clientRequestId}
    FOR UPDATE
  `;
}

function assertPublicOperation(value: string): asserts value is PublicLifecycleOperation {
  if (!PUBLIC_LIFECYCLE_OPERATIONS.includes(value as PublicLifecycleOperation)) {
    throw new VeraLifecycleError("invalid_request", "Unsupported Vera lifecycle operation.");
  }
}

function assertIdempotencyKey(value: string): void {
  if (!value || value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new VeraLifecycleError("invalid_request", "Idempotency-Key must contain 1..120 safe characters.");
  }
}

function keyedDigest(secret: string, purpose: string, value: string): string {
  if (!secret.trim()) throw new VeraLifecycleError("invalid_request", "Vera HMAC configuration is missing.", 503);
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

function opaqueReference(secret: string, type: string, id: string): string {
  return `${type}_${keyedDigest(secret, `export-reference:${type}`, id).slice(0, 32)}`;
}

function asIso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

function exportStateForOperation(state: string): string {
  switch (state) {
    case "pending": return "pending";
    case "processing": return "materializing";
    case "ready":
    case "completed": return "ready";
    case "failed_retryable": return "failed_retryable";
    case "failed_terminal": return "failed_terminal";
    case "expired": return "expired";
    default: return "failed_terminal";
  }
}

function exportDownloadAvailable(state: string, expiresAt: Date | null, now: Date, accessState: string): boolean {
  return state === "ready" && Boolean(expiresAt && now < expiresAt)
    && accessState !== "consumed" && accessState !== "expired";
}

function toLifecycleStatus(row: {
  id: string;
  operation: string;
  resultKind: string;
  state: string;
  targetState: string | null;
  targetEntityId: string | null;
  statusCode: string | null;
  errorCode: string | null;
  errorDigest: string | null;
  expiresAt: Date | null;
}, replayed: boolean): LifecycleStatusDto {
  assertPublicOperation(row.operation);
  return {
    operationId: row.id,
    operation: row.operation,
    resultKind: row.resultKind as LifecycleStatusDto["resultKind"],
    state: row.state,
    targetState: row.targetState,
    targetId: row.targetEntityId,
    statusCode: row.statusCode,
    errorCode: row.errorCode,
    errorDigest: row.errorDigest,
    expiresAt: asIso(row.expiresAt),
    replayed,
  };
}

export class VeraLifecycleService {
  constructor(
    private readonly db: LifecycleDb = prisma,
    private readonly envelope: EnvelopeService,
    private readonly fingerprintSecret: string,
  ) {}

  private fingerprint(operation: PublicLifecycleOperation, payload: Record<string, unknown>): string {
    return keyedDigest(this.fingerprintSecret, operation, canonicalOperationPayload(operation, payload));
  }

  async createExport(input: {
    studentId: string;
    idempotencyKey: string;
    format: "json_v1";
  }): Promise<LifecycleAcceptedDto | VeraExportStatusDto> {
    assertIdempotencyKey(input.idempotencyKey);
    if (input.format !== VERA_EXPORT_FORMAT) throw new VeraLifecycleError("invalid_request", "Only json_v1 exports are supported.");
    const fingerprint = this.fingerprint("export_create", { format: VERA_EXPORT_FORMAT });

    return this.db.$transaction(async (tx) => {
      await lockStudent(tx, input.studentId);
      await lockIdempotency(tx, input.studentId, "export_create", input.idempotencyKey);
      const now = await dbNow(tx);
      const existing = await tx.aiIdempotencyKey.findFirst({
        where: { studentId: input.studentId, operation: "export_create", clientRequestId: input.idempotencyKey },
      });
      if (existing) {
        if (existing.state === "expired" || now >= existing.expiresAt) {
          await tx.aiIdempotencyKey.updateMany({
            where: { id: existing.id, version: existing.version },
            data: { state: "expired", tombstoneCode: "idempotency_key_expired", terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
          });
          throw new VeraLifecycleError("idempotency_key_expired", "The idempotency key has expired.");
        }
        if (existing.requestFingerprint !== fingerprint) throw new VeraLifecycleError("idempotency_conflict", "The idempotency key payload differs from the stored request.");
        if (existing.state === "accepted" && existing.resultId) {
          const job = await tx.aiExportJob.findUnique({ where: { id: existing.resultId }, include: { operation: true } });
          if (!job) throw new VeraLifecycleError("export_state_mismatch", "The accepted export target is unavailable.");
          return this.exportStatusFromRows(job, job.operation, true, now, "session");
        }
        if (existing.rejectionClass === "terminal") throw new VeraLifecycleError("target_unavailable", existing.rejectionCode ?? "The stored export request is terminal.");
        throw new VeraLifecycleError("export_not_ready", "The stored export request is still pending.", 409, { replayed: true });
      }

      const idempotencyId = randomUUID();
      const operationId = randomUUID();
      const exportId = randomUUID();
      const recoveryDeadlineAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await tx.aiIdempotencyKey.create({
        data: {
          id: idempotencyId,
          studentId: input.studentId,
          operation: "export_create",
          clientRequestId: input.idempotencyKey,
          requestFingerprint: fingerprint,
          fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
          retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION,
          state: "rejected",
          resultKind: "none",
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await tx.aiLifecycleOperation.create({
        data: {
          id: operationId,
          studentId: input.studentId,
          idempotencyKeyId: idempotencyId,
          operation: "export_create",
          resultKind: "export_job",
          state: "pending",
          targetEntityType: "AiExportJob",
          targetEntityId: exportId,
          exportFormat: VERA_EXPORT_FORMAT,
          exportScope: "learner_visible",
          exportAsOf: now,
          requestedPolicyVersion: VERA_RETENTION_POLICY_VERSION,
          exportVersion: "1",
          resultState: "pending",
          recoveryDeadlineAt,
          ownerState: "active",
          version: 0,
        },
      });
      await tx.aiExportJob.create({
        data: {
          id: exportId,
          operationId,
          studentId: input.studentId,
          ownerState: "active",
          format: VERA_EXPORT_FORMAT,
          state: "pending",
          exportAsOf: now,
          recoveryDeadlineAt,
          retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION,
        },
      });
      await tx.aiIdempotencyKey.updateMany({
        where: { id: idempotencyId, version: 0, state: "rejected" },
        data: {
          state: "accepted",
          resultKind: "export_job",
          resultId: exportId,
          acceptedAt: now,
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
          version: { increment: 1 },
        },
      });
      return {
        operationId,
        resultKind: "export_job",
        state: "pending",
        exportId,
        exportAsOf: now.toISOString(),
        downloadExpiresAt: null,
        exportAccessGrantState: "none",
        exportAccessGrantVersion: 0,
        accountState: "active",
        accessMode: "session",
        replayed: false,
      };
    });
  }

  async requestConversationDelete(input: {
    studentId: string;
    conversationId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }): Promise<LifecycleAcceptedDto> {
    assertIdempotencyKey(input.idempotencyKey);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new VeraLifecycleError("invalid_request", "expectedVersion must be a non-negative integer.");
    const fingerprint = this.fingerprint("conversation_delete", { conversationId: input.conversationId, expectedVersion: input.expectedVersion });
    return this.db.$transaction(async (tx) => {
      await lockStudent(tx, input.studentId);
      await lockIdempotency(tx, input.studentId, "conversation_delete", input.idempotencyKey);
      const now = await dbNow(tx);
      const existing = await tx.aiIdempotencyKey.findFirst({ where: { studentId: input.studentId, operation: "conversation_delete", clientRequestId: input.idempotencyKey } });
      if (existing) {
        if (existing.state === "expired" || now >= existing.expiresAt) throw new VeraLifecycleError("idempotency_key_expired", "The idempotency key has expired.");
        if (existing.requestFingerprint !== fingerprint) throw new VeraLifecycleError("idempotency_conflict", "The idempotency key payload differs from the stored request.");
        if (existing.resultId) {
          const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: existing.resultId } });
          if (operation) {
            if (operation.state === "conflict") throw new VeraLifecycleError("target_revision_conflict", operation.errorCode ?? "The stored deletion conflict is replayed.", 409, { replayed: true, operation: toLifecycleStatus({ ...operation, targetState: operation.targetState, targetEntityId: operation.targetEntityId }, true) });
            return {
              operationId: operation.id,
              resultKind: "conversation_delete",
              state: operation.state as LifecycleAcceptedDto["state"],
              targetState: operation.targetState ?? "deletion_pending",
              targetId: operation.targetEntityId ?? input.conversationId,
              replayed: true,
            };
          }
        }
        throw new VeraLifecycleError("target_unavailable", "The stored deletion target is unavailable.");
      }
      const conversation = await tx.aiConversation.findFirst({ where: { id: input.conversationId, studentId: input.studentId } });
      if (!conversation) throw new VeraLifecycleError("target_unavailable", "Conversation not found.");
      if (conversation.deletionState === "deletion_pending") throw new VeraLifecycleError("deletion_pending", "Conversation deletion is already pending.");
      if (conversation.deletionState !== "active") throw new VeraLifecycleError("target_unavailable", "Conversation is no longer available.");
      const idempotencyId = randomUUID();
      const operationId = randomUUID();
      await tx.aiIdempotencyKey.create({ data: { id: idempotencyId, studentId: input.studentId, operation: "conversation_delete", clientRequestId: input.idempotencyKey, requestFingerprint: fingerprint, fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION, retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION, state: "rejected", resultKind: "none", expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
      await tx.aiLifecycleOperation.create({ data: { id: operationId, studentId: input.studentId, idempotencyKeyId: idempotencyId, operation: "conversation_delete", resultKind: "conversation_delete", state: "pending", targetEntityType: "AiConversation", targetEntityId: input.conversationId, expectedConversationVersion: input.expectedVersion, claimedConversationVersion: input.expectedVersion, targetState: "deletion_pending", deleteMode: "learner_request", resultState: "pending", recoveryDeadlineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), ownerState: "active", version: 0 } });
      const claimed = await tx.aiConversation.updateMany({ where: { id: input.conversationId, studentId: input.studentId, version: input.expectedVersion, deletionState: "active" }, data: { deletionState: "deletion_pending", deletionOperationId: operationId, claimedVersion: input.expectedVersion, version: { increment: 1 } } });
      if (claimed.count !== 1) {
        await tx.aiLifecycleOperation.update({ where: { id: operationId }, data: { state: "conflict", statusCode: "target_revision_conflict", errorCode: "target_revision_conflict", targetState: "target_unavailable", terminalAt: now, version: { increment: 1 } } });
        await tx.aiIdempotencyKey.update({ where: { id: idempotencyId }, data: { state: "rejected", rejectionClass: "terminal", rejectionCode: "target_revision_conflict", resultKind: "conversation_delete", resultId: operationId, terminalAt: now, expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), version: { increment: 1 } } });
        throw new VeraLifecycleError("target_revision_conflict", "Conversation version changed before deletion could be claimed.");
      }
      await tx.aiIdempotencyKey.update({ where: { id: idempotencyId }, data: { state: "accepted", resultKind: "conversation_delete", resultId: operationId, acceptedAt: now, expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), version: { increment: 1 } } });
      return { operationId, resultKind: "conversation_delete", state: "pending", targetState: "deletion_pending", targetId: input.conversationId, replayed: false };
    });
  }

  async requestArtifactDelete(input: {
    studentId: string;
    artifactRevisionId: string;
    expectedLifecycleRevision: number;
    idempotencyKey: string;
  }): Promise<LifecycleAcceptedDto> {
    assertIdempotencyKey(input.idempotencyKey);
    if (!Number.isInteger(input.expectedLifecycleRevision) || input.expectedLifecycleRevision < 0) throw new VeraLifecycleError("invalid_request", "expectedLifecycleRevision must be a non-negative integer.");
    const fingerprint = this.fingerprint("artifact_delete", { artifactRevisionId: input.artifactRevisionId, expectedLifecycleRevision: input.expectedLifecycleRevision });
    return this.db.$transaction(async (tx) => {
      await lockStudent(tx, input.studentId);
      await lockIdempotency(tx, input.studentId, "artifact_delete", input.idempotencyKey);
      const now = await dbNow(tx);
      const existing = await tx.aiIdempotencyKey.findFirst({ where: { studentId: input.studentId, operation: "artifact_delete", clientRequestId: input.idempotencyKey } });
      if (existing) {
        if (existing.state === "expired" || now >= existing.expiresAt) throw new VeraLifecycleError("idempotency_key_expired", "The idempotency key has expired.");
        if (existing.requestFingerprint !== fingerprint) throw new VeraLifecycleError("idempotency_conflict", "The idempotency key payload differs from the stored request.");
        if (existing.resultId) {
          const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: existing.resultId } });
          if (operation) return { operationId: operation.id, resultKind: "artifact_delete", state: operation.state === "conflict" ? "conflict" : "pending", targetState: operation.targetState ?? "deletion_pending", targetId: operation.targetEntityId ?? input.artifactRevisionId, replayed: true };
        }
        throw new VeraLifecycleError("target_unavailable", "The stored artifact deletion target is unavailable.");
      }
      const lifecycle = await tx.aiArtifactLifecycle.findUnique({ where: { artifactRevisionId: input.artifactRevisionId }, include: { artifact: { select: { id: true, studentId: true } } } });
      if (!lifecycle || lifecycle.artifact.studentId !== input.studentId) throw new VeraLifecycleError("artifact_unavailable", "Artifact not found.");
      if (lifecycle.deletionState === "deletion_pending") throw new VeraLifecycleError("deletion_pending", "Artifact deletion is already pending.");
      if (lifecycle.deletionState !== "active" || lifecycle.state === "purged") throw new VeraLifecycleError("artifact_unavailable", "Artifact is no longer available.");
      const idempotencyId = randomUUID();
      const operationId = randomUUID();
      await tx.aiIdempotencyKey.create({ data: { id: idempotencyId, studentId: input.studentId, operation: "artifact_delete", clientRequestId: input.idempotencyKey, requestFingerprint: fingerprint, fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION, retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION, state: "rejected", resultKind: "none", expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
      await tx.aiLifecycleOperation.create({ data: { id: operationId, studentId: input.studentId, idempotencyKeyId: idempotencyId, operation: "artifact_delete", resultKind: "artifact_delete", state: "pending", targetEntityType: "AiArtifact", targetEntityId: input.artifactRevisionId, expectedLifecycleRevision: input.expectedLifecycleRevision, claimedLifecycleRevision: input.expectedLifecycleRevision, targetState: "deletion_pending", deleteMode: "learner_request", resultState: "pending", recoveryDeadlineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), ownerState: "active", version: 0 } });
      const claimed = await tx.aiArtifactLifecycle.updateMany({ where: { artifactRevisionId: input.artifactRevisionId, lifecycleRevision: input.expectedLifecycleRevision, deletionState: "active" }, data: { deletionState: "deletion_pending", deletionOperationId: operationId, claimedExpectedRevision: input.expectedLifecycleRevision, changedAt: now, reason: "learner_request", lifecycleRevision: { increment: 1 } } });
      if (claimed.count !== 1) {
        await tx.aiLifecycleOperation.update({ where: { id: operationId }, data: { state: "conflict", statusCode: "target_revision_conflict", errorCode: "target_revision_conflict", targetState: "target_unavailable", terminalAt: now, version: { increment: 1 } } });
        await tx.aiIdempotencyKey.update({ where: { id: idempotencyId }, data: { state: "rejected", rejectionClass: "terminal", rejectionCode: "target_revision_conflict", resultKind: "artifact_delete", resultId: operationId, terminalAt: now, expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), version: { increment: 1 } } });
        throw new VeraLifecycleError("target_revision_conflict", "Artifact lifecycle revision changed before deletion could be claimed.");
      }
      await tx.aiIdempotencyKey.update({ where: { id: idempotencyId }, data: { state: "accepted", resultKind: "artifact_delete", resultId: operationId, acceptedAt: now, expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), version: { increment: 1 } } });
      return { operationId, resultKind: "artifact_delete", state: "pending", targetState: "deletion_pending", targetId: input.artifactRevisionId, replayed: false };
    });
  }

  async readLifecycleStatus(input: { studentId: string; operationId: string }): Promise<LifecycleStatusDto> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.aiLifecycleOperation.findFirst({ where: { id: input.operationId, studentId: input.studentId } });
      if (!row) throw new VeraLifecycleError("target_unavailable", "Lifecycle operation not found.", 404);
      if (row.operation === "account_cleanup") throw new VeraLifecycleError("target_unavailable", "Internal lifecycle operation.", 404);
      return toLifecycleStatus(row, true);
    });
  }

  async readExportStatus(input: { exportId: string; studentId?: string; grant?: string; replayed?: boolean }): Promise<VeraExportStatusDto> {
    return this.db.$transaction(async (tx) => {
      const job = await tx.aiExportJob.findUnique({ where: { id: input.exportId }, include: { operation: true } });
      if (!job) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      const accessMode = input.grant ? "cleanup_grant" : "session";
      if (input.studentId && job.studentId !== input.studentId) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      if (!input.studentId && !input.grant) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      if (input.grant && !this.verifyGrant(input.grant, job.id, job.exportAccessGrantDigest)) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      const now = await dbNow(tx);
      return this.exportStatusFromRows(job, job.operation, input.replayed === true, now, accessMode);
    });
  }

  private verifyGrant(grant: string, exportId: string, digest: string | null): boolean {
    return Boolean(digest && keyedDigest(this.fingerprintSecret, "export-grant", `${exportId}:${grant}`) === digest);
  }

  issueCleanupGrant(exportId: string, rawGrant: string): { digest: string } {
    if (!rawGrant || rawGrant.length > 240) throw new VeraLifecycleError("invalid_request", "Export grant is malformed.");
    return { digest: keyedDigest(this.fingerprintSecret, "export-grant", `${exportId}:${rawGrant}`) };
  }

  private exportStatusFromRows(
    job: { id: string; state: string; format: string; exportAsOf: Date; downloadExpiresAt: Date | null; exportAccessGrantState: string; exportAccessGrantVersion: number; ownerState: string; errorCode: string | null; operationId: string },
    operation: { state: string; errorCode: string | null },
    replayed: boolean,
    now: Date,
    accessMode: "session" | "cleanup_grant",
  ): VeraExportStatusDto {
    const state = job.state as VeraExportStatusDto["state"];
    const operationState = exportStateForOperation(operation.state);
    const stateMismatch = operationState !== state;
    const effectiveState = stateMismatch ? "failed_terminal" : state;
    const errorCode = stateMismatch ? "export_state_mismatch" : job.errorCode ?? operation.errorCode;
    return {
      exportId: job.id,
      operationId: job.operationId,
      state: effectiveState,
      accountState: job.ownerState === "account_deleted" ? "account_deleted" : "active",
      accessMode,
      format: VERA_EXPORT_FORMAT,
      exportAsOf: asIso(job.exportAsOf),
      downloadExpiresAt: asIso(job.downloadExpiresAt),
      downloadAvailable: !stateMismatch && exportDownloadAvailable(state, job.downloadExpiresAt, now, job.exportAccessGrantState),
      exportAccessGrantState: job.exportAccessGrantState as VeraExportStatusDto["exportAccessGrantState"],
      exportAccessGrantVersion: job.exportAccessGrantVersion,
      retryAfterAt: effectiveState === "failed_retryable" ? new Date(now.getTime() + 60_000).toISOString() : null,
      errorCode,
      replayed,
    };
  }

  async claimMaterialization(input: { exportId: string; ownerId: string }): Promise<{ claimId: string; fence: number; studentId: string; exportAsOf: Date; recoveryDeadlineAt: Date } | null> {
    return this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE id = ${input.exportId}::uuid FOR UPDATE`;
      const job = await tx.aiExportJob.findUnique({ where: { id: input.exportId }, include: { operation: true } });
      if (!job || !job.studentId) return null;
      if (job.state === "ready" || job.state === "expired" || job.state === "failed_terminal") return null;
      const leaseExpired = !job.materializationLeaseExpiresAt || job.materializationLeaseExpiresAt <= now;
      if (job.state === "materializing" && !leaseExpired) return null;
      if (now >= job.recoveryDeadlineAt) {
        const terminal = preReadyExportDeadlines(now);
        await tx.aiExportJob.update({ where: { id: job.id }, data: { state: "failed_terminal", errorCode: "recovery_expired", terminalAt: now, partialPackagePurgeAt: terminal.partialPackagePurgeAt, terminalRetentionExpiresAt: terminal.terminalRetentionExpiresAt, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
        await tx.aiLifecycleOperation.update({ where: { id: job.operationId }, data: { state: "failed_terminal", errorCode: "recovery_expired", terminalAt: now, expiresAt: terminal.terminalRetentionExpiresAt, resultState: "failed_terminal", version: { increment: 1 } } });
        return null;
      }
      const claimId = randomUUID();
      const fence = job.materializationFence + 1;
      await tx.aiExportJob.update({ where: { id: job.id }, data: { state: "materializing", materializationClaimId: claimId, materializationOwnerId: input.ownerId, materializationClaimedAt: now, materializationLeaseExpiresAt: new Date(now.getTime() + VERA_MATERIALIZATION_LEASE_MS), materializationFence: fence } });
      await tx.aiLifecycleOperation.update({ where: { id: job.operationId, state: { in: ["pending", "failed_retryable"] } }, data: { state: "processing", resultState: "materializing", version: { increment: 1 } } });
      return { claimId, fence, studentId: job.studentId, exportAsOf: job.exportAsOf, recoveryDeadlineAt: job.recoveryDeadlineAt };
    });
  }

  async materializeExport(input: { exportId: string; ownerId: string }): Promise<VeraExportStatusDto> {
    const claim = await this.claimMaterialization(input);
    if (!claim) {
      const current = await this.db.aiExportJob.findUnique({ where: { id: input.exportId }, select: { studentId: true } });
      if (!current?.studentId) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      return this.readExportStatus({ exportId: input.exportId, studentId: current.studentId, replayed: true });
    }
    try {
      const snapshot = await this.buildExportSnapshot(claim.studentId, claim.exportAsOf);
      const bytes = Buffer.from(canonicalExportJson(snapshot), "utf8");
      if (bytes.byteLength > VERA_EXPORT_MAX_BYTES) throw new VeraLifecycleError("export_size_limit", "Export exceeds the 10 MiB canonical package limit.");
      const parts = splitExportParts(bytes, VERA_EXPORT_PART_BYTES);
      if (parts.length > VERA_EXPORT_MAX_PARTS) throw new VeraLifecycleError("export_size_limit", "Export exceeds the 256-part limit.");
      const scoped = this.envelope.forClient(this.db);
      for (const [ordinal, part] of parts.entries()) {
        const encrypted = await scoped.encryptAsync(part, `vera-export:${input.exportId}:${ordinal}`);
        await this.db.$transaction(async (tx) => {
          const current = await tx.aiExportJob.findUnique({ where: { id: input.exportId }, select: { state: true, materializationClaimId: true, materializationFence: true } });
          if (!current || current.state !== "materializing" || current.materializationClaimId !== claim.claimId || current.materializationFence !== claim.fence) throw new VeraLifecycleError("export_payload_unavailable", "The materialization claim was fenced.");
          await tx.aiExportPart.create({ data: { exportJobId: input.exportId, ordinal, ciphertextEnvelope: asJson(encrypted), plaintextBytes: part.byteLength, partDigest: sha256Hex(part) } });
        });
      }
      const finalized = await this.finalizeExport({ exportId: input.exportId, operationId: (await this.db.aiExportJob.findUniqueOrThrow({ where: { id: input.exportId }, select: { operationId: true } })).operationId, claimId: claim.claimId, fence: claim.fence, snapshotDigest: exportSnapshotDigest(bytes), packageBytes: bytes.byteLength, partCount: parts.length });
      return this.exportStatusFromRows(finalized.job, finalized.operation, false, new Date(), "session");
    } catch (error) {
      const lifecycleError = error instanceof VeraLifecycleError ? error : new VeraLifecycleError("export_payload_unavailable", "Export payload could not be materialized.");
      await this.markExportFailure(input.exportId, lifecycleError.code, lifecycleError.code === "export_size_limit");
      throw lifecycleError;
    }
  }

  private async finalizeExport(input: { exportId: string; operationId: string; claimId: string; fence: number; snapshotDigest: string; packageBytes: number; partCount: number }) {
    return this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const job = await tx.aiExportJob.findUnique({ where: { id: input.exportId } });
      if (!job || job.state !== "materializing" || job.materializationClaimId !== input.claimId || job.materializationFence !== input.fence) throw new VeraLifecycleError("export_payload_unavailable", "The materialization claim was fenced.");
      const parts = await tx.aiExportPart.findMany({ where: { exportJobId: input.exportId }, orderBy: { ordinal: "asc" } });
      if (parts.length !== input.partCount || parts.some((part, index) => part.ordinal !== index)
        || parts.some((part) => part.plaintextBytes > VERA_EXPORT_PART_BYTES)
        || parts.reduce((sum, part) => sum + part.plaintextBytes, 0) !== input.packageBytes) {
        throw new VeraLifecycleError("export_payload_unavailable", "Export part set is incomplete.");
      }
      const downloadExpiresAt = exportDownloadDeadline(now);
      const updatedJob = await tx.aiExportJob.update({ where: { id: input.exportId }, data: { state: "ready", snapshotDigest: input.snapshotDigest, packageBytes: input.packageBytes, downloadReadyAt: now, downloadExpiresAt, completedAt: now, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
      const operation = await tx.aiLifecycleOperation.update({ where: { id: input.operationId, state: "processing" }, data: { state: "ready", resultState: "ready", exportExpiresAt: downloadExpiresAt, expiresAt: new Date(downloadExpiresAt.getTime() + 90 * 24 * 60 * 60 * 1000), version: { increment: 1 } } });
      return { job: updatedJob, operation };
    });
  }

  private async markExportFailure(exportId: string, errorCode: string, terminal: boolean): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const job = await tx.aiExportJob.findUnique({ where: { id: exportId } });
      if (!job || job.state === "ready" || job.state === "expired") return;
      if (!terminal && now < job.recoveryDeadlineAt) {
        await tx.aiExportJob.update({ where: { id: exportId }, data: { state: "failed_retryable", errorCode, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
        await tx.aiLifecycleOperation.update({ where: { id: job.operationId }, data: { state: "failed_retryable", resultState: "failed_retryable", errorCode, errorDigest: sha256Hex(errorCode), version: { increment: 1 } } });
        return;
      }
      const deadlines = preReadyExportDeadlines(now);
      await tx.aiExportJob.update({ where: { id: exportId }, data: { state: "failed_terminal", errorCode: terminal ? errorCode : "recovery_expired", terminalAt: now, partialPackagePurgeAt: deadlines.partialPackagePurgeAt, terminalRetentionExpiresAt: deadlines.terminalRetentionExpiresAt, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
      await tx.aiLifecycleOperation.update({ where: { id: job.operationId }, data: { state: "failed_terminal", resultState: "failed_terminal", errorCode: terminal ? errorCode : "recovery_expired", terminalAt: now, expiresAt: deadlines.terminalRetentionExpiresAt, version: { increment: 1 } } });
    });
  }

  async reapExports(now = new Date()): Promise<number> {
    const jobs = await this.db.aiExportJob.findMany({ where: { OR: [{ state: "materializing", materializationLeaseExpiresAt: { lte: now } }, { state: "failed_retryable", recoveryDeadlineAt: { lte: now } }, { state: "pending", recoveryDeadlineAt: { lte: now } }, { state: "ready", downloadExpiresAt: { lte: now } }] }, select: { id: true } });
    let changed = 0;
    for (const job of jobs) {
      try {
        await this.db.$transaction(async (tx) => {
          const current = await tx.aiExportJob.findUnique({ where: { id: job.id }, include: { operation: true } });
          if (!current) return;
          if (current.state === "ready" && current.downloadExpiresAt && current.downloadExpiresAt <= now) {
            const terminalRetention = preReadyExportDeadlines(now);
            await tx.aiExportJob.update({ where: { id: current.id }, data: { state: "expired", expiredAt: now, terminalAt: now, terminalRetentionExpiresAt: terminalRetention.terminalRetentionExpiresAt, exportAccessGrantState: "expired" } });
            await tx.aiLifecycleOperation.update({ where: { id: current.operationId }, data: { state: "expired", resultState: "expired", terminalAt: current.operation.terminalAt ?? now, version: { increment: 1 } } });
            changed += 1;
          } else if ((current.state === "pending" || current.state === "materializing" || current.state === "failed_retryable") && current.recoveryDeadlineAt <= now) {
            const deadlines = preReadyExportDeadlines(now);
            await tx.aiExportJob.update({ where: { id: current.id }, data: { state: "failed_terminal", errorCode: "recovery_expired", terminalAt: now, partialPackagePurgeAt: deadlines.partialPackagePurgeAt, terminalRetentionExpiresAt: deadlines.terminalRetentionExpiresAt, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
            await tx.aiLifecycleOperation.update({ where: { id: current.operationId }, data: { state: "failed_terminal", errorCode: "recovery_expired", terminalAt: now, expiresAt: deadlines.terminalRetentionExpiresAt, resultState: "failed_terminal", version: { increment: 1 } } });
            changed += 1;
          } else if (current.state === "materializing" && current.materializationLeaseExpiresAt && current.materializationLeaseExpiresAt <= now) {
            await tx.aiExportJob.update({ where: { id: current.id }, data: { state: "pending", materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null, materializationFence: { increment: 1 } } });
            await tx.aiLifecycleOperation.update({ where: { id: current.operationId, state: "processing" }, data: { state: "pending", resultState: "pending", version: { increment: 1 } } });
            changed += 1;
          }
          if (current.exportAccessGrantState === "claiming" && current.exportAccessGrantLeaseExpiresAt && current.exportAccessGrantLeaseExpiresAt <= now) {
            await tx.aiExportJob.updateMany({ where: { id: current.id, exportAccessGrantState: "claiming", exportAccessGrantVersion: current.exportAccessGrantVersion }, data: { exportAccessGrantState: "active", exportAccessGrantClaimId: null, exportAccessGrantClaimedAt: null, exportAccessGrantLeaseExpiresAt: null, exportAccessGrantVersion: { increment: 1 } } });
          }
        });
      } catch {
        // A later DB-clock pass retries the same fenced row; no optimistic
        // terminal marker is emitted on a failed reaper transaction.
      }
    }
    return changed;
  }

  async downloadExport(input: { exportId: string; studentId?: string; grant?: string }): Promise<ExportDownload> {
    const claim = await this.claimDownload(input);
    const parts = await this.db.aiExportPart.findMany({ where: { exportJobId: input.exportId }, orderBy: { ordinal: "asc" } });
    if (parts.length === 0 || parts.some((part, index) => part.ordinal !== index)) throw new VeraLifecycleError("export_unavailable", "Export parts are unavailable.");
    const plaintext: Buffer[] = [];
    try {
      for (const part of parts) plaintext.push(await this.envelope.decryptAsync(asEnvelope(part.ciphertextEnvelope) as AiEncryptedPayload));
    } catch {
      throw new VeraLifecycleError("export_unavailable", "Export parts are unavailable.");
    }
    const bytes = Buffer.concat(plaintext);
    if (bytes.byteLength !== claim.packageBytes || sha256Hex(bytes) !== claim.snapshotDigest) throw new VeraLifecycleError("export_unavailable", "Export package integrity check failed.");
    if (claim.grantClaimId) {
      await this.db.$transaction(async (tx) => {
        const now = await dbNow(tx);
        const updated = await tx.aiExportJob.updateMany({ where: { id: input.exportId, exportAccessGrantState: "claiming", exportAccessGrantClaimId: claim.grantClaimId, exportAccessGrantVersion: claim.grantVersion }, data: { exportAccessGrantState: "consumed", exportAccessGrantLeaseExpiresAt: null, exportAccessGrantVersion: { increment: 1 } } });
        if (updated.count !== 1) throw new VeraLifecycleError("export_access_consumed", "The export access grant was already consumed.");
        void now;
      });
    }
    return { bytes, snapshotDigest: claim.snapshotDigest, packageBytes: claim.packageBytes };
  }

  private async claimDownload(input: { exportId: string; studentId?: string; grant?: string }): Promise<{ snapshotDigest: string; packageBytes: number; grantClaimId: string | null; grantVersion: number }> {
    return this.db.$transaction(async (tx) => {
      const job = await tx.aiExportJob.findUnique({ where: { id: input.exportId } });
      if (!job) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      if (input.studentId && job.studentId !== input.studentId) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      if (!input.studentId && !input.grant) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      if (input.grant && !this.verifyGrant(input.grant, job.id, job.exportAccessGrantDigest)) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      const now = await dbNow(tx);
      if (job.state === "pending" || job.state === "materializing" || job.state === "failed_retryable") throw new VeraLifecycleError("export_not_ready", "Export is not ready.", 409, { retryAfterAt: new Date(now.getTime() + 60_000).toISOString() });
      if (job.state === "failed_terminal") throw new VeraLifecycleError("export_unavailable", "Export is unavailable.");
      if (job.state === "expired" || !job.downloadExpiresAt || now >= job.downloadExpiresAt) throw new VeraLifecycleError("export_expired", "Export download has expired.");
      if (!job.snapshotDigest || !job.packageBytes) throw new VeraLifecycleError("export_unavailable", "Export metadata is incomplete.");
      if (input.grant) {
        if (job.exportAccessGrantState === "claiming") throw new VeraLifecycleError("export_download_in_progress", "Another export download is in progress.", 409, { retryAfterAt: job.exportAccessGrantLeaseExpiresAt?.toISOString() ?? new Date(now.getTime() + 60_000).toISOString() });
        if (job.exportAccessGrantState === "consumed") throw new VeraLifecycleError("export_access_consumed", "The export access grant was consumed.");
        if (job.exportAccessGrantState === "expired" || job.exportAccessGrantState !== "active") throw new VeraLifecycleError("export_expired", "Export access has expired.");
        const claimId = randomUUID();
        const updated = await tx.aiExportJob.updateMany({ where: { id: job.id, exportAccessGrantState: "active", exportAccessGrantVersion: job.exportAccessGrantVersion }, data: { exportAccessGrantState: "claiming", exportAccessGrantClaimId: claimId, exportAccessGrantClaimedAt: now, exportAccessGrantLeaseExpiresAt: new Date(now.getTime() + VERA_EXPORT_GRANT_LEASE_MS), exportAccessGrantVersion: { increment: 1 } } });
        if (updated.count !== 1) throw new VeraLifecycleError("export_download_in_progress", "Another export download is in progress.");
        return { snapshotDigest: job.snapshotDigest, packageBytes: job.packageBytes, grantClaimId: claimId, grantVersion: job.exportAccessGrantVersion + 1 };
      }
      if (job.ownerState === "account_deleted") throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      return { snapshotDigest: job.snapshotDigest, packageBytes: job.packageBytes, grantClaimId: null, grantVersion: job.exportAccessGrantVersion };
    });
  }

  private async buildExportSnapshot(studentId: string, exportAsOf: Date): Promise<Record<string, unknown>> {
    const [conversations, artifacts] = await Promise.all([
      this.db.aiConversation.findMany({ where: { studentId, createdAt: { lte: exportAsOf } }, select: { id: true, title: true, createdAt: true, messages: { where: { createdAt: { lte: exportAsOf }, role: { in: ["user", "assistant"] } }, select: { id: true, role: true, contentEnvelope: true, contentState: true, metadataEnvelope: true, metadataState: true, createdAt: true } } } }),
      this.db.aiArtifact.findMany({ where: { studentId, createdAt: { lte: exportAsOf }, lifecycle: { state: "visible", deletionState: "active" } }, select: { id: true, artifactType: true, createdAt: true, contentMarkdownCiphertext: true, payloadCiphertext: true, lifecycle: { select: { state: true, deletionState: true } } } }),
    ]);
    if (conversations.length > 500 || conversations.reduce((sum, row) => sum + row.messages.length, 0) > 10_000 || artifacts.length > 1_000) throw new VeraLifecycleError("export_size_limit", "Export exceeds a bounded row cap.");
    const resultConversations = [] as Array<Record<string, unknown>>;
    for (const conversation of conversations) {
      const messages = [] as Array<Record<string, unknown>>;
      for (const message of conversation.messages) {
        const contentEnvelope = asEnvelope(message.contentEnvelope);
        if (!contentEnvelope || message.contentState !== "encrypted") throw new VeraLifecycleError("export_payload_unavailable", "A learner-visible message has no available envelope.");
        const content = await this.envelope.decryptTextAsync(contentEnvelope);
        if (Buffer.byteLength(content, "utf8") > 256 * 1024) throw new VeraLifecycleError("export_size_limit", "A message exceeds the learner-visible size cap.");
        const projection: Record<string, unknown> = { publicReference: opaqueReference(this.fingerprintSecret, "message", message.id), role: message.role, contentMarkdown: content, createdAt: formatExportInstant(message.createdAt) };
        const metadataEnvelope = asEnvelope(message.metadataEnvelope);
        if (metadataEnvelope && message.metadataState === "encrypted") {
          const metadata = JSON.parse(await this.envelope.decryptTextAsync(metadataEnvelope)) as unknown;
          projection.visibleMetadata = metadata;
        }
        messages.push(projection);
      }
      messages.sort((left, right) => `${String(left.createdAt)}:${String(left.publicReference)}`.localeCompare(`${String(right.createdAt)}:${String(right.publicReference)}`));
      const projection: Record<string, unknown> = { publicReference: opaqueReference(this.fingerprintSecret, "conversation", conversation.id), createdAt: formatExportInstant(conversation.createdAt), messages };
      if (conversation.title !== null) projection.title = conversation.title.normalize("NFC");
      resultConversations.push(projection);
    }
    resultConversations.sort((left, right) => String(left.publicReference).localeCompare(String(right.publicReference)));
    const resultArtifacts = [] as Array<Record<string, unknown>>;
    for (const artifact of artifacts) {
      const contentEnvelope = asEnvelope(artifact.contentMarkdownCiphertext);
      if (!contentEnvelope) throw new VeraLifecycleError("export_payload_unavailable", "A learner-visible artifact has no available envelope.");
      const content = await this.envelope.decryptTextAsync(contentEnvelope);
      if (Buffer.byteLength(content, "utf8") > 256 * 1024) throw new VeraLifecycleError("export_size_limit", "An artifact exceeds the learner-visible size cap.");
      const projection: Record<string, unknown> = { publicReference: opaqueReference(this.fingerprintSecret, "artifact", artifact.id), featureLabel: String(artifact.artifactType), createdAt: formatExportInstant(artifact.createdAt), contentMarkdown: content, contextState: "available" };
      const payloadEnvelope = asEnvelope(artifact.payloadCiphertext);
      if (payloadEnvelope) {
        const payload = JSON.parse(await this.envelope.decryptTextAsync(payloadEnvelope)) as unknown;
        const structuredBytes = Buffer.byteLength(canonicalExportJson(payload), "utf8");
        if (structuredBytes > 512 * 1024) throw new VeraLifecycleError("export_size_limit", "An artifact structured-data projection exceeds the learner-visible size cap.");
        projection.visibleStructuredData = payload;
      }
      resultArtifacts.push(projection);
    }
    resultArtifacts.sort((left, right) => String(left.publicReference).localeCompare(String(right.publicReference)));
    return { schemaVersion: "vera.export.v1", product: "Vera AI", exportAsOf: formatExportInstant(exportAsOf), conversations: resultConversations, artifacts: resultArtifacts };
  }

  /** Internal account-workflow carrier. It has no public idempotency row. */
  async createAccountCleanupCarrier(input: { accountGeneration: string; intent: string }): Promise<{ operationId: string; correlationDigest: string; replayed: boolean }> {
    const correlationDigest = keyedDigest(this.fingerprintSecret, "account-cleanup", `${input.accountGeneration}:${input.intent}`);
    return this.db.$transaction(async (tx) => {
      const existing = await tx.aiLifecycleOperation.findFirst({ where: { operation: "account_cleanup", accountCleanupCorrelationDigest: correlationDigest } });
      if (existing) return { operationId: existing.id, correlationDigest, replayed: true };
      const now = await dbNow(tx);
      const operation = await tx.aiLifecycleOperation.create({ data: { id: randomUUID(), studentId: null, idempotencyKeyId: null, operation: "account_cleanup", resultKind: "account_cleanup", state: "pending", ownerState: "account_deleted", ownerReferenceDigest: keyedDigest(this.fingerprintSecret, "account-owner", input.accountGeneration), accountCleanupCorrelationDigest: correlationDigest, handoffState: "pending", resultState: "pending", recoveryDeadlineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), version: 0 } });
      return { operationId: operation.id, correlationDigest, replayed: false };
    });
  }

  async markAccountCleanupReady(input: { operationId: string; handoffDigest: string; signal?: string }): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const result = await tx.aiLifecycleOperation.updateMany({ where: { id: input.operationId, operation: "account_cleanup", state: { in: ["pending", "processing", "awaiting_dependency"] }, handoffState: "pending" }, data: { state: "completed", resultState: "completed", handoffSignal: input.signal ?? "vera_cleanup_ready_v1", handoffAt: now, handoffState: "ready", handoffDigest: input.handoffDigest, version: { increment: 1 } } });
      return result.count === 1;
    });
  }

  async consumeAccountCleanupHandoff(input: { operationId: string; consumerId: string; acknowledgementDigest: string }): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const result = await tx.aiLifecycleOperation.updateMany({ where: { id: input.operationId, operation: "account_cleanup", state: "completed", handoffState: "ready" }, data: { handoffState: "consumed", handoffConsumedAt: now, handoffConsumerId: input.consumerId, handoffAckDigest: input.acknowledgementDigest, version: { increment: 1 } } });
      return result.count === 1;
    });
  }

  async processConversationDelete(operationId: string): Promise<void> {
    // T11 state-first: publish the unavailable/purging marker in its own
    // durable CAS before any ciphertext/key deletion work begins.
    const marker = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: operationId } });
      if (!operation || operation.operation !== "conversation_delete") throw new VeraLifecycleError("target_unavailable", "Conversation deletion operation not found.");
      if (["completed", "failed_terminal", "expired", "conflict"].includes(operation.state)) return null;
      const conversation = await tx.aiConversation.findUnique({ where: { id: operation.targetEntityId ?? "" }, select: { id: true, version: true, deletionState: true } });
      if (!conversation) {
        await tx.aiLifecycleOperation.update({ where: { id: operation.id }, data: { state: "completed", resultState: "completed", targetState: "purged", terminalAt: now, version: { increment: 1 } } });
        return null;
      }
      if (operation.claimedConversationVersion === null || conversation.version !== operation.claimedConversationVersion + 1) throw new VeraLifecycleError("target_revision_conflict", "A newer conversation version cannot be deleted by this claim.");
      await tx.aiLifecycleOperation.update({ where: { id: operation.id, state: { in: ["pending", "failed_retryable"] } }, data: { state: "processing", resultState: "processing", version: { increment: 1 } } });
      const messages = await tx.aiMessage.findMany({ where: { conversationId: conversation.id }, select: { contentEnvelope: true, metadataEnvelope: true } });
      const artifacts = await tx.aiArtifact.findMany({ where: { conversationId: conversation.id }, select: { id: true, titleCiphertext: true, contentMarkdownCiphertext: true, payloadCiphertext: true } });
      await tx.aiMessage.updateMany({ where: { conversationId: conversation.id }, data: { contentState: "purging", metadataState: "purging" } });
      const requests = await tx.aiRequest.findMany({ where: { conversationId: conversation.id }, select: { id: true } });
      for (const request of requests) {
        await tx.aiRequestResultStage.updateMany({ where: { requestId: request.id }, data: { purgeState: "purging", purgeStartedAt: now, purgeReason: "conversation_delete" } });
        await tx.aiContextPack.updateMany({ where: { requestId: request.id }, data: { provenanceState: "unavailable", purgeState: "purging", purgeStartedAt: now, purgeReason: "conversation_delete" } });
      }
      const artifactIds = artifacts.map(({ id }) => id);
      if (artifactIds.length > 0) {
        await tx.aiArtifactLifecycle.updateMany({
          where: { artifactRevisionId: { in: artifactIds }, deletionState: "active" },
          data: {
            state: "purging",
            deletionState: "deletion_pending",
            deletionOperationId: operationId,
            deletedAt: now,
            retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION,
            changedAt: now,
            reason: "conversation_delete",
          },
        });
        await tx.aiArtifactApply.updateMany({ where: { artifactRevisionId: { in: artifactIds } }, data: { applyState: "target_unavailable", purgedAt: now, purgeReason: "conversation_delete" } });
      }
      return {
        conversationId: conversation.id,
        requestIds: requests.map(({ id }) => id),
        artifactIds,
        envelopes: [
          ...messages.flatMap(({ contentEnvelope, metadataEnvelope }) => [contentEnvelope, metadataEnvelope]),
          ...artifacts.flatMap(({ titleCiphertext, contentMarkdownCiphertext, payloadCiphertext }) => [titleCiphertext, contentMarkdownCiphertext, payloadCiphertext]),
        ],
      };
    });
    if (!marker) return;
    try {
      // Key-registry work runs after the marker transaction has released its
      // locks; a retry can safely repeat an already-destroyed key.
      const registry = this.envelope.forClient(this.db);
      for (const candidate of marker.envelopes) {
        const envelope = asEnvelope(candidate);
        if (envelope) await registry.purgeAsync(envelope);
      }
    } catch (error) {
      await this.db.$transaction(async (tx) => {
        await tx.aiLifecycleOperation.updateMany({
          where: { id: operationId, state: "processing" },
          data: {
            state: "failed_retryable",
            resultState: "failed_retryable",
            errorCode: "purge_dependency_unavailable",
            errorDigest: sha256Hex(error instanceof Error ? error.message : "purge_dependency_unavailable"),
            version: { increment: 1 },
          },
        });
      });
      throw error;
    }
    await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      await tx.aiArtifactApply.updateMany({ where: { artifact: { conversationId: marker.conversationId } }, data: { applyState: "target_unavailable", purgedAt: now, purgeReason: "conversation_delete" } });
      await tx.aiMessage.deleteMany({ where: { conversationId: marker.conversationId } });
      await tx.aiConversationSource.deleteMany({ where: { conversationId: marker.conversationId } });
      if (marker.artifactIds.length > 0) {
        // Apply rows intentionally remain as target-unavailable tombstones
        // under their restrictive FK; the artifact remains as a non-readable
        // purged lifecycle tombstone after key destruction.
        await tx.aiArtifactLifecycle.updateMany({
          where: { artifactRevisionId: { in: marker.artifactIds }, state: "purging" },
          data: {
            state: "purged",
            deletionState: "deleted",
            deletedAt: now,
            changedAt: now,
            purgeDigest: sha256Hex(`${operationId}:artifact-purge`),
          },
        });
        // The artifact is retained as a non-readable tombstone because an
        // AiArtifactApply row has a restrictive FK. Detach it from the
        // conversation and clear its ciphertext before the parent delete.
        await tx.aiArtifact.updateMany({
          where: { id: { in: marker.artifactIds } },
          data: {
            conversationId: null,
            titleCiphertext: Prisma.DbNull,
            contentMarkdownCiphertext: Prisma.DbNull,
            payloadCiphertext: Prisma.DbNull,
          },
        });
      }
      const weaknessAnalyses = await tx.weaknessAnalysis.findMany({ where: { conversationId: marker.conversationId }, select: { id: true } });
      await tx.weaknessAnalysisTopic.deleteMany({ where: { weaknessAnalysisId: { in: weaknessAnalyses.map(({ id }) => id) } } });
      await tx.weaknessAnalysis.deleteMany({ where: { id: { in: weaknessAnalyses.map(({ id }) => id) } } });
      const adaptiveSessions = await tx.adaptivePracticeSession.findMany({ where: { sourceConversationId: marker.conversationId }, select: { id: true } });
      const adaptiveIds = adaptiveSessions.map(({ id }) => id);
      await tx.adaptivePracticeAnswer.deleteMany({ where: { adaptiveSessionId: { in: adaptiveIds } } });
      await tx.adaptivePracticeItem.deleteMany({ where: { adaptiveSessionId: { in: adaptiveIds } } });
      await tx.adaptivePracticeSession.deleteMany({ where: { sourceConversationId: marker.conversationId } });
      await tx.ptnStrategySession.deleteMany({ where: { conversationId: marker.conversationId } });
      if (marker.requestIds.length > 0) {
        await tx.aiRequestSource.deleteMany({ where: { requestId: { in: marker.requestIds } } });
        await tx.aiRequestAttempt.deleteMany({ where: { requestId: { in: marker.requestIds } } });
        await tx.aiRequestResultStage.deleteMany({ where: { requestId: { in: marker.requestIds } } });
        await tx.aiContextPack.deleteMany({ where: { requestId: { in: marker.requestIds } } });
        // Keep the accepted request/idempotency target as a bounded replay
        // tombstone rather than deleting the identity row under its FK.
        await tx.aiRequest.updateMany({ where: { id: { in: marker.requestIds } }, data: { conversationId: null, status: "failed", errorCode: "conversation_deleted", idempotencyEvidenceState: "tombstoned", finalizedAt: now } });
      }
      await tx.aiConversation.deleteMany({ where: { id: marker.conversationId, deletionState: "deletion_pending" } });
      await tx.aiLifecycleOperation.update({ where: { id: operationId }, data: { state: "completed", resultState: "completed", targetState: "purged", targetTombstoneCode: "target_unavailable", terminalAt: now, version: { increment: 1 } } });
    });
  }

  async processArtifactDelete(operationId: string): Promise<void> {
    const marker = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: operationId } });
      if (!operation || operation.operation !== "artifact_delete") throw new VeraLifecycleError("target_unavailable", "Artifact deletion operation not found.");
      if (["completed", "failed_terminal", "expired", "conflict"].includes(operation.state)) return null;
      const lifecycle = await tx.aiArtifactLifecycle.findUnique({ where: { artifactRevisionId: operation.targetEntityId ?? "" }, include: { artifact: { select: { id: true, contentMarkdownCiphertext: true, titleCiphertext: true, payloadCiphertext: true } } } });
      if (!lifecycle) {
        await tx.aiLifecycleOperation.update({ where: { id: operation.id }, data: { state: "completed", resultState: "completed", targetState: "purged", terminalAt: now, version: { increment: 1 } } });
        return null;
      }
      if (operation.claimedLifecycleRevision === null || lifecycle.lifecycleRevision !== operation.claimedLifecycleRevision + 1) throw new VeraLifecycleError("target_revision_conflict", "A newer artifact revision cannot be deleted by this claim.");
      await tx.aiLifecycleOperation.update({ where: { id: operation.id, state: { in: ["pending", "failed_retryable"] } }, data: { state: "processing", resultState: "processing", version: { increment: 1 } } });
      await tx.aiArtifactLifecycle.update({ where: { artifactRevisionId: lifecycle.artifactRevisionId }, data: { state: "purging", deletedAt: now, retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION, changedAt: now } });
      await tx.aiArtifactApply.updateMany({ where: { artifactRevisionId: lifecycle.artifactRevisionId }, data: { applyState: "purged", purgedAt: now, purgeReason: "artifact_delete" } });
      return { artifactId: lifecycle.artifact.id, envelopes: [lifecycle.artifact.titleCiphertext, lifecycle.artifact.contentMarkdownCiphertext, lifecycle.artifact.payloadCiphertext] };
    });
    if (!marker) return;
    try {
      // Key-registry work runs after the marker transaction has released its
      // locks; a retry can safely repeat an already-destroyed key.
      const registry = this.envelope.forClient(this.db);
      for (const candidate of marker.envelopes) {
        const envelope = asEnvelope(candidate);
        if (envelope) await registry.purgeAsync(envelope);
      }
    } catch (error) {
      await this.db.$transaction(async (tx) => {
        await tx.aiLifecycleOperation.updateMany({
          where: { id: operationId, state: "processing" },
          data: {
            state: "failed_retryable",
            resultState: "failed_retryable",
            errorCode: "purge_dependency_unavailable",
            errorDigest: sha256Hex(error instanceof Error ? error.message : "purge_dependency_unavailable"),
            version: { increment: 1 },
          },
        });
      });
      throw error;
    }
    await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      // Linked Apply rows retain a restrictive FK and remain as tombstones;
      // preserve the artifact row as a purged lifecycle tombstone.
      await tx.aiArtifactLifecycle.updateMany({
        where: { artifactRevisionId: marker.artifactId, state: "purging" },
        data: {
          state: "purged",
          deletionState: "deleted",
          deletedAt: now,
          changedAt: now,
          purgeDigest: sha256Hex(`${operationId}:artifact-purge`),
        },
      });
      await tx.aiArtifact.updateMany({
        where: { id: marker.artifactId },
        data: { titleCiphertext: Prisma.DbNull, contentMarkdownCiphertext: Prisma.DbNull, payloadCiphertext: Prisma.DbNull },
      });
      await tx.aiLifecycleOperation.update({ where: { id: operationId }, data: { state: "completed", resultState: "completed", targetState: "purged", targetTombstoneCode: "artifact_unavailable", terminalAt: now, version: { increment: 1 } } });
    });
  }

  async markLegalErasure(input: { exportId: string; holdId: string; authorityDigest: string; reasonDigest: string }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const job = await tx.aiExportJob.findUnique({ where: { id: input.exportId } });
      if (!job) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: job.operationId } });
      if (!operation) throw new VeraLifecycleError("export_state_mismatch", "Export lifecycle operation is unavailable.");
      await tx.aiExportJob.update({ where: { id: job.id }, data: { state: "failed_terminal", errorCode: "export_erased_legal", terminalAt: now, exportAccessGrantState: "expired" } });
      await tx.aiLifecycleOperation.update({ where: { id: operation.id }, data: { state: "failed_terminal", errorCode: "export_erased_legal", errorDigest: input.reasonDigest, terminalAt: now, resultState: "failed_terminal", version: { increment: 1 } } });
      await tx.aiKeyDestructionClaim.upsert({ where: { objectType_objectId_keyLineageDigest: { objectType: "AiExportJob", objectId: job.id, keyLineageDigest: job.contentEnvelopeKeyId ? sha256Hex(job.contentEnvelopeKeyId) : sha256Hex(job.id) } }, create: { operationId: operation.id, holdId: input.holdId, objectType: "AiExportJob", objectId: job.id, keyLineageDigest: job.contentEnvelopeKeyId ? sha256Hex(job.contentEnvelopeKeyId) : sha256Hex(job.id), state: "pending", requestedByOperatorId: "runbook", requestedCapability: "vera_key_destruction_approver", requestedCapabilityDigest: input.authorityDigest, operatorAId: "runbook", decisionSnapshot: asJson({ authorityDigest: input.authorityDigest, reasonDigest: input.reasonDigest }), decisionSnapshotDigest: input.authorityDigest, erasureOverride: true, erasureOverrideCode: "export_erased_legal", overrideHoldId: input.holdId, overrideAuthorityDigest: input.authorityDigest, overrideReasonDigest: input.reasonDigest }, update: { erasureOverride: true, erasureOverrideCode: "export_erased_legal", overrideHoldId: input.holdId, overrideAuthorityDigest: input.authorityDigest, overrideReasonDigest: input.reasonDigest, claimVersion: { increment: 1 } } });
    });
  }
}

export function createVeraLifecycleService(input?: { db?: LifecycleDb; envelope?: EnvelopeService; fingerprintSecret?: string }): VeraLifecycleService {
  const secret = input?.fingerprintSecret ?? process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  if (!secret?.trim()) throw new VeraLifecycleError("invalid_request", "Vera HMAC configuration is missing.", 503);
  if (!input?.envelope) throw new VeraLifecycleError("invalid_request", "Vera envelope service is missing.", 503);
  return new VeraLifecycleService(input.db ?? prisma, input.envelope, secret);
}

export const lifecycleRetentionHelpers = {
  resultStagePurgeDeadline,
  preReadyExportDeadlines,
  exportDownloadDeadline,
};
