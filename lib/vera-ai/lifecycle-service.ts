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
  VERA_RETENTION,
  VERA_RETENTION_POLICY_VERSION,
  assertDualCapabilityApproval,
  withCapabilitySnapshotDigest,
  type CapabilityDecisionSnapshot,
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
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
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

/** Compare canonical UTF-8 bytes, never locale-dependent collation. */
function compareCanonical(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/** Stable UUID identity for durable work items whose external keyRef is not a UUID. */
function deterministicWorkItemId(operationId: string, keyRef: string): string {
  const digest = sha256Hex(`vera-account-cleanup-key:${operationId}:${keyRef}`);
  const variant = (8 | (Number.parseInt(digest.slice(16, 17), 16) & 3)).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

const LEGAL_ERASURE_CAPABILITIES = ["vera_lifecycle_erasure", "vera_key_destruction_approver"] as const;

type PersistedOperatorAuthorization = {
  operatorId: string;
  roleAssignmentIds: string[];
  capabilityIds: string[];
  capabilities: string[];
};

function persistedAuthorizationSnapshot(
  authorization: PersistedOperatorAuthorization,
  subjectId: string,
  evaluatedAt: Date,
): CapabilityDecisionSnapshot {
  const authorityDigest = sha256Hex(canonicalExportJson({
    operatorId: authorization.operatorId,
    roleAssignmentIds: [...authorization.roleAssignmentIds].sort(compareCanonical),
    capabilityIds: [...authorization.capabilityIds].sort(compareCanonical),
    capabilities: [...authorization.capabilities].sort(compareCanonical),
  }));
  return withCapabilitySnapshotDigest({
    operation: "key_destroy",
    subjectId,
    operatorId: authorization.operatorId,
    requiredCapabilityUnion: [...LEGAL_ERASURE_CAPABILITIES],
    grantedCapabilitySetDigest: authorityDigest,
    capabilityPolicyVersion: "vera-role-capability-db-v1",
    decision: "allow",
    evaluatedAt,
    capabilityDecisionId: `db-role-capability:${authorityDigest.slice(0, 40)}`,
  });
}

function capabilitySnapshotJson(snapshot: CapabilityDecisionSnapshot): Record<string, unknown> {
  return {
    operation: snapshot.operation,
    subjectId: snapshot.subjectId,
    operatorId: snapshot.operatorId,
    requiredCapabilityUnion: [...snapshot.requiredCapabilityUnion].sort(compareCanonical),
    grantedCapabilitySetDigest: snapshot.grantedCapabilitySetDigest,
    capabilityPolicyVersion: snapshot.capabilityPolicyVersion,
    decision: snapshot.decision,
    evaluatedAt: snapshot.evaluatedAt.toISOString(),
    capabilityDecisionId: snapshot.capabilityDecisionId,
    snapshotDigest: snapshot.snapshotDigest,
  };
}

/**
 * Lock every active Vera retention hold which can cover a target before a
 * worker publishes a purge marker.  The query intentionally uses one stable
 * subject ordering and is shared by conversation/artifact workers and the
 * account cleanup handoff.  A hold is an operational fence, not advisory
 * metadata: callers must treat a non-empty result as a hard stop.
 */
async function lockApplicableHolds(
  tx: Tx,
  input: { studentId: string; conversationId?: string | null; artifactIds?: readonly string[] },
  states: readonly ("active" | "released")[] = ["active"],
): Promise<string[]> {
  const artifactIds = [...(input.artifactIds ?? [])];
  const artifactPredicate = artifactIds.length > 0
    ? Prisma.sql`OR (h.subject_type = 'artifact'::ai_retention_hold_subject_type AND h.subject_id IN (${Prisma.join(artifactIds.map((id) => Prisma.sql`${id}::uuid`))}))`
    : Prisma.empty;
  const conversationPredicate = input.conversationId
    ? Prisma.sql`OR (h.subject_type = 'conversation'::ai_retention_hold_subject_type AND h.subject_id = ${input.conversationId}::uuid)`
    : Prisma.empty;
  const statePredicate = states.length === 1
    ? Prisma.sql`h.state = ${states[0]}::ai_retention_hold_state`
    : Prisma.sql`h.state IN (${Prisma.join(states.map((state) => Prisma.sql`${state}::ai_retention_hold_state`))})`;
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT h.id
    FROM ai_retention_holds h
    WHERE ${statePredicate}
      AND h.subject_state = 'attached'::ai_retention_hold_subject_state
      AND (
        h.student_id = ${input.studentId}::uuid
        ${conversationPredicate}
        ${artifactPredicate}
        OR (h.subject_type = 'evidence_object'::ai_retention_hold_subject_type AND EXISTS (
          SELECT 1
          FROM ai_context_packs cp
          JOIN ai_requests r ON r.id = cp.request_id
          WHERE cp.id = h.subject_id AND r.student_id = ${input.studentId}::uuid
        ))
      )
    ORDER BY h.subject_type::text ASC, h.id ASC
    FOR UPDATE
  `);
  return rows.map((row) => row.id);
}

/**
 * Complete the Vera-owned child-row phase of account cleanup while the user
 * row is locked.  Required student FKs are removed in dependency order only
 * after learner-visible export materialization; rows which are intentionally
 * retained as aggregate/audit evidence are anonymized with the account owner
 * marker instead of being rewritten.  This helper is transaction-bound so a
 * crash rolls the entire handoff back before the parent account workflow can
 * continue.
 */
async function settleAccountOwnedRows(tx: Tx, studentId: string, now: Date, ownerReferenceDigest: string): Promise<string[]> {
  // The account workflow already owns the user-row lock. Lock every request
  // and its settlement rows in deterministic UUID order before taking a
  // snapshot; concurrent admission/finalization must either finish first or
  // observe the same CAS boundary and retry, never overwrite a newer result.
  await tx.$queryRaw`SELECT id FROM ai_requests WHERE student_id = ${studentId}::uuid ORDER BY id FOR UPDATE`;
  const requests = await tx.aiRequest.findMany({
    where: { studentId },
    select: {
      id: true,
      conversationId: true,
      userMessageId: true,
      assistantMessageId: true,
      status: true,
      createdAt: true,
      quotaUnitsReserved: true,
      quotaUnitsConsumed: true,
      usageAccountingState: true,
      version: true,
    },
  });
  const requestIds = requests.map(({ id }) => id);
  const conversationIds = [...new Set(requests.flatMap(({ conversationId }) => conversationId ? [conversationId] : []))];
  const conversations = await tx.aiConversation.findMany({ where: { studentId }, select: { id: true } });
  const allConversationIds = [...new Set([...conversationIds, ...conversations.map(({ id }) => id)])];
  const artifacts = await tx.aiArtifact.findMany({
    where: { studentId },
    select: {
      id: true,
      conversationId: true,
      titleCiphertext: true,
      contentMarkdownCiphertext: true,
      payloadCiphertext: true,
      contentDigest: true,
    },
  });
  const artifactIds = artifacts.map(({ id }) => id);
  const analyses = await tx.weaknessAnalysis.findMany({ where: { studentId }, select: { id: true, resultEnvelope: true } });
  const analysisIds = analyses.map(({ id }) => id);
  const adaptiveSessions = await tx.adaptivePracticeSession.findMany({ where: { studentId }, select: { id: true, resultEnvelope: true, appliedPlanEnvelope: true } });
  const adaptiveIds = adaptiveSessions.map(({ id }) => id);
  const adaptiveItems = adaptiveIds.length > 0
    ? await tx.adaptivePracticeItem.findMany({ where: { adaptiveSessionId: { in: adaptiveIds } }, select: { id: true, promptSnapshotCiphertext: true, optionSnapshotCiphertext: true, scoringSnapshotCiphertext: true, contentKeyLineageDigest: true } })
    : [];

  const ptnSessions = await tx.ptnStrategySession.findMany({ where: { studentId }, select: { id: true, resultEnvelope: true, appliedStrategyEnvelope: true } });
  const ptnIds = ptnSessions.map(({ id }) => id);
  const recommendations = await tx.learningRecommendation.findMany({ where: { studentId }, select: { id: true, rationaleEnvelope: true } });
  const messages = allConversationIds.length > 0
    ? await tx.aiMessage.findMany({ where: { conversationId: { in: allConversationIds } }, select: { id: true, contentEnvelope: true, metadataEnvelope: true } })
    : [];
  const stages = requestIds.length > 0
    ? await tx.aiRequestResultStage.findMany({ where: { requestId: { in: requestIds } }, select: { requestId: true, quotaUnitsConsumed: true, tokenUsageState: true, normalizedResultCiphertext: true, contentKeyLineageDigest: true } })
    : [];
  const packs = requestIds.length > 0
    ? await tx.aiContextPack.findMany({ where: { requestId: { in: requestIds } }, select: { id: true, normalizedTaskCiphertext: true, canonicalBytesCiphertext: true, conversationMessageManifestCiphertext: true, contentKeyLineageDigest: true } })
    : [];
  const sources = requestIds.length > 0
    ? await tx.aiRequestSource.findMany({ where: { requestId: { in: requestIds } }, select: { id: true, boundedSnapshotCiphertext: true, contentKeyLineageDigest: true } })
    : [];
  const exportJobs = await tx.aiExportJob.findMany({ where: { studentId }, select: { id: true, state: true, operationId: true } });

  // Capture every envelope identity before lifecycle markers are written. The
  // exact keyRef is authoritative; object-id matching is a compatibility
  // fallback for older rows whose envelope was already retired from the
  // payload but whose key registry row still carries its object lineage.
  const envelopeCandidates: unknown[] = [
    ...artifacts.flatMap(({ titleCiphertext, contentMarkdownCiphertext, payloadCiphertext }) => [titleCiphertext, contentMarkdownCiphertext, payloadCiphertext]),
    ...analyses.map(({ resultEnvelope }) => resultEnvelope),
    ...adaptiveSessions.flatMap(({ resultEnvelope, appliedPlanEnvelope }) => [resultEnvelope, appliedPlanEnvelope]),
    ...adaptiveItems.flatMap(({ promptSnapshotCiphertext, optionSnapshotCiphertext, scoringSnapshotCiphertext }) => [promptSnapshotCiphertext, optionSnapshotCiphertext, scoringSnapshotCiphertext]),
    ...ptnSessions.flatMap(({ resultEnvelope, appliedStrategyEnvelope }) => [resultEnvelope, appliedStrategyEnvelope]),
    ...recommendations.map(({ rationaleEnvelope }) => rationaleEnvelope),
    ...messages.flatMap(({ contentEnvelope, metadataEnvelope }) => [contentEnvelope, metadataEnvelope]),
    ...stages.map(({ normalizedResultCiphertext }) => normalizedResultCiphertext),
    ...packs.flatMap(({ normalizedTaskCiphertext, canonicalBytesCiphertext, conversationMessageManifestCiphertext }) => [normalizedTaskCiphertext, canonicalBytesCiphertext, conversationMessageManifestCiphertext]),
    ...sources.map(({ boundedSnapshotCiphertext }) => boundedSnapshotCiphertext),
  ];
  const exactKeyRefs = envelopeCandidates.flatMap((candidate) => {
    const envelope = asEnvelope(candidate);
    return envelope ? [envelope.keyRef] : [];
  });
  const lineageDigests = [
    ...stages.map(({ contentKeyLineageDigest }) => contentKeyLineageDigest),
    ...adaptiveItems.map(({ contentKeyLineageDigest }) => contentKeyLineageDigest),
    ...packs.map(({ contentKeyLineageDigest }) => contentKeyLineageDigest),
    ...sources.map(({ contentKeyLineageDigest }) => contentKeyLineageDigest),
  ].filter((value): value is string => Boolean(value));
  const ownershipMarkers = [
    studentId,
    ...requestIds,
    ...allConversationIds,
    ...artifactIds,
    ...analysisIds,
    ...adaptiveIds,
    ...ptnIds,
    ...recommendations.map(({ id }) => id),
    ...messages.map(({ id }) => id),
    ...packs.map(({ id }) => id),
    ...sources.map(({ id }) => id),
  ];
  const activeKeyRows = await tx.aiEnvelopeKey.findMany({ where: { state: "active" }, select: { keyRef: true, objectId: true } });
  const keyRefs = [...new Set([
    ...exactKeyRefs,
    ...activeKeyRows
      .filter(({ objectId, keyRef }) => ownershipMarkers.some((marker) => objectId.includes(marker) || keyRef.includes(marker)))
      .map(({ keyRef }) => keyRef),
    // A lineage digest is intentionally content-free. It cannot decrypt a
    // row, but matching it to the durable key registry closes the gap for
    // legacy envelopes whose payload has already been retired.
    ...activeKeyRows
      .filter(({ objectId, keyRef }) => lineageDigests.some((digest) => digest === sha256Hex(keyRef) || objectId.includes(digest)))
      .map(({ keyRef }) => keyRef),
  ])].sort(compareCanonical);

  // Preserve every normalized request/stage/pack/source row. Their encrypted
  // values become unavailable through the key registry, but their immutable
  // digests, quota provenance and retention metadata remain auditable.
  if (requestIds.length > 0) {
    await tx.aiRequestResultStage.updateMany({ where: { requestId: { in: requestIds }, purgeState: "available" }, data: { purgeState: "purging", purgeStartedAt: now, purgeReason: "account_cleanup" } });
    await tx.aiContextPack.updateMany({ where: { requestId: { in: requestIds }, purgeState: "available" }, data: { provenanceState: "unavailable", purgeState: "purging", purgeStartedAt: now, purgeReason: "account_cleanup" } });
    await tx.aiRequestSource.updateMany({ where: { requestId: { in: requestIds }, snapshotState: "available" }, data: { snapshotState: "purging", purgeStartedAt: now, purgeReason: "account_cleanup" } });
    await tx.aiRequestAttempt.updateMany({ where: { requestId: { in: requestIds } }, data: { errorCode: "account_deleted" } });
  }
  if (artifactIds.length > 0) {
    await tx.aiArtifactLifecycle.updateMany({
      where: { artifactRevisionId: { in: artifactIds }, deletionState: "active" },
      data: { state: "purging", deletionState: "deletion_pending", reason: "account_cleanup", changedAt: now, retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION },
    });
    await tx.aiArtifactApply.updateMany({ where: { artifactRevisionId: { in: artifactIds }, applyState: "applied" }, data: { applyState: "purged", purgedAt: now, purgeReason: "account_cleanup" } });
  }
  if (analysisIds.length > 0) {
    await tx.weaknessAnalysis.updateMany({ where: { id: { in: analysisIds } }, data: { summaryMarkdown: null } });
    await tx.weaknessAnalysisTopic.updateMany({ where: { weaknessAnalysisId: { in: analysisIds } }, data: { recommendationText: null } });
  }
  if (adaptiveIds.length > 0) {
    await tx.adaptivePracticeAnswer.updateMany({ where: { adaptiveSessionId: { in: adaptiveIds } }, data: { answerText: null } });
    await tx.adaptivePracticeSession.updateMany({ where: { id: { in: adaptiveIds } }, data: { lifecycleState: "tombstoned", deletionState: "deleted", deletedAt: now } });
  }
  if (ptnIds.length > 0) {
    await tx.ptnStrategySession.updateMany({ where: { id: { in: ptnIds } }, data: { lifecycleState: "tombstoned", deletionState: "deleted", deletedAt: now } });
  }
  await tx.learningRecommendation.updateMany({ where: { studentId }, data: { reason: null, lifecycleState: "tombstoned", deletionState: "deleted", deletedAt: now } });

  // Settle pending/staged requests against the same reservation/debt model as
  // the normal finalizer. A conservative reserved amount is known usage for
  // account cleanup; this never rewrites an already-terminal result to
  // `unknown` and never removes the daily ledger row.
  await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE student_id = ${studentId}::uuid AND ledger_version = 'vera_quota_v1'::ai_usage_ledger_version ORDER BY usage_date, ledger_version FOR UPDATE`;
  const dailyRows = await tx.aiUsageDaily.findMany({ where: { studentId, ledgerVersion: "vera_quota_v1" }, orderBy: { usageDate: "asc" } });
  const dailyState = new Map(dailyRows.map((row) => [row.id, { ...row }]));
  const stageByRequest = new Map(stages.map((stage) => [stage.requestId, stage]));
  const settledRequestIds = new Set<string>();
  for (const request of requests) {
    const terminal = request.status === "succeeded" || request.status === "fallback" || request.status === "failed";
    if (terminal) continue;
    const stage = stageByRequest.get(request.id);
    const actual = stage?.quotaUnitsConsumed ?? request.quotaUnitsConsumed ?? request.quotaUnitsReserved;
    const daily = dailyRows.find((candidate) => {
      const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: candidate.quotaTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(request.createdAt);
      return candidate.usageDate.toISOString().slice(0, 10) === localDate;
    });
    if (daily) {
      const currentDaily = dailyState.get(daily.id) ?? daily;
      const released = Math.max(0, currentDaily.reservedQuotaUnits - request.quotaUnitsReserved);
      const used = currentDaily.usedQuotaUnits + actual;
      const debt = Math.max(0, used + released - currentDaily.quotaLimitUnitsSnapshot);
      const quotaOverrunLockUntil = debt > 0 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : currentDaily.quotaOverrunLockUntil;
      await tx.aiUsageDaily.update({ where: { id: daily.id }, data: { reservedQuotaUnits: released, usedQuotaUnits: used, quotaDebtUnits: debt, quotaOverrunLockUntil, finalizedRequestCount: { increment: 1 } } });
      dailyState.set(daily.id, { ...currentDaily, reservedQuotaUnits: released, usedQuotaUnits: used, quotaDebtUnits: debt, quotaOverrunLockUntil, finalizedRequestCount: currentDaily.finalizedRequestCount + 1 });
    }
    const requestUpdate = await tx.aiRequest.updateMany({
      where: { id: request.id, version: request.version, status: { notIn: ["succeeded", "fallback", "failed"] } },
      data: {
        studentId: null,
        conversationId: null,
        userMessageId: null,
        assistantMessageId: null,
        promptTemplate: null,
        providerRequestRef: null,
        providerTaskDigest: null,
        status: "failed",
        errorCode: "account_deleted",
        quotaUnitsConsumed: actual,
        quotaOverrunUnits: Math.max(0, actual - request.quotaUnitsReserved),
        tokenUsageState: stage?.tokenUsageState ?? "unknown",
        usageAccountingState: "known",
        idempotencyEvidenceState: "tombstoned",
        ownerState: "account_deleted",
        ownerReferenceDigest,
        accountDeletedAt: now,
        finalizedAt: now,
        version: { increment: 1 },
      },
    });
    if (requestUpdate.count !== 1) throw new VeraLifecycleError("target_revision_conflict", "A request changed while account cleanup was settling it.", 409);
    settledRequestIds.add(request.id);
  }

  if (allConversationIds.length > 0) {
    await tx.aiMessage.updateMany({ where: { conversationId: { in: allConversationIds } }, data: { contentMarkdown: null, metadata: Prisma.DbNull, contentState: "purging", metadataState: "purging" } });
    await tx.aiConversation.updateMany({ where: { id: { in: allConversationIds }, studentId }, data: { title: null, deletionState: "deleted", updatedAt: now } });
  }

  // Export packages are retention-managed objects and are not part of the
  // ordinary content-key purge set. Detach their owner FK only after the
  // export/grant decision was made by the account carrier; the content-free
  // owner marker keeps status/replay and the grant-bound download auditable.
  if (exportJobs.length > 0) {
    await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE student_id = ${studentId}::uuid ORDER BY id FOR UPDATE`;
    await tx.aiExportJob.updateMany({
      where: { studentId },
      data: {
        studentId: null,
        ownerState: "account_deleted",
        ownerReferenceDigest,
        accountDeletedAt: now,
      },
    });
  }

  // Nullable-owner telemetry/replay rows are detached but retain terminal
  // evidence. Daily rows remain intact so report cohorts and settlement audit
  // can distinguish accepted from finalized requests after account cleanup.
  await tx.aiAdmissionEvent.updateMany({ where: { studentId }, data: { studentId: null } });
  await tx.aiIdempotencyKey.updateMany({ where: { studentId }, data: { studentId: null, ownerState: "account_deleted", ownerReferenceDigest, accountDeletedAt: now } });
  await tx.aiLifecycleOperation.updateMany({ where: { studentId }, data: { studentId: null, ownerState: "account_deleted", ownerReferenceDigest, accountDeletedAt: now, exportConversationId: null } });
  await tx.studentProfile.updateMany({ where: { userId: studentId }, data: { displayName: null } });
  void settledRequestIds;
  return keyRefs;
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
      // Account-deletion state is an admission boundary, not merely a UI
      // concern.  Re-check it after the owner row is locked so a concurrent
      // cleanup cannot race a newly accepted export into the deleted account.
      const owner = await tx.user.findUnique({ where: { id: input.studentId }, select: { status: true, softDeletedAt: true } });
      if (!owner || owner.status !== "active" || owner.softDeletedAt !== null) {
        throw new VeraLifecycleError("account_deleted", "Exports are unavailable for a deleted account.");
      }
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
          // A takeover starts a fresh canonical part set. The unique ordinal
          // constraint prevents duplicate rows, while this first-ordinal CAS
          // removes stale parts left by the fenced worker before any new part
          // is committed.
          if (ordinal === 0) await tx.aiExportPart.deleteMany({ where: { exportJobId: input.exportId } });
          await tx.aiExportPart.create({ data: { exportJobId: input.exportId, ordinal, ciphertextEnvelope: asJson(encrypted), plaintextBytes: part.byteLength, partDigest: sha256Hex(part) } });
        });
      }
      const finalized = await this.finalizeExport({ exportId: input.exportId, operationId: (await this.db.aiExportJob.findUniqueOrThrow({ where: { id: input.exportId }, select: { operationId: true } })).operationId, claimId: claim.claimId, fence: claim.fence, snapshotDigest: exportSnapshotDigest(bytes), packageBytes: bytes.byteLength, partCount: parts.length });
      return this.exportStatusFromRows(finalized.job, finalized.operation, false, new Date(), "session");
    } catch (error) {
      const lifecycleError = error instanceof VeraLifecycleError ? error : new VeraLifecycleError("export_payload_unavailable", "Export payload could not be materialized.");
      await this.markExportFailure(input.exportId, lifecycleError.code, lifecycleError.code === "export_size_limit", claim.claimId, claim.fence);
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
      // The worker's input digest/size are only a hint. Decrypt and digest the
      // locked persisted parts inside the finalizer transaction so a stale or
      // replayed worker cannot finalize a different package.
      const scoped = this.envelope.forClient(tx);
      const plaintext = [] as Buffer[];
      for (const part of parts) {
        const envelope = asEnvelope(part.ciphertextEnvelope);
        if (!envelope) throw new VeraLifecycleError("export_payload_unavailable", "Export part envelope is malformed.");
        const bytes = await scoped.decryptAsync(envelope);
        if (bytes.byteLength !== part.plaintextBytes || sha256Hex(bytes) !== part.partDigest) {
          throw new VeraLifecycleError("export_payload_unavailable", "Export part digest does not match its envelope.");
        }
        plaintext.push(bytes);
      }
      const packageBytes = Buffer.concat(plaintext);
      const snapshotDigest = exportSnapshotDigest(packageBytes);
      if (snapshotDigest !== input.snapshotDigest || packageBytes.byteLength !== input.packageBytes) {
        throw new VeraLifecycleError("export_payload_unavailable", "Export package digest does not match the claimed snapshot.");
      }
      const downloadExpiresAt = exportDownloadDeadline(now);
      const updatedJob = await tx.aiExportJob.update({ where: { id: input.exportId }, data: { state: "ready", snapshotDigest, packageBytes: packageBytes.byteLength, downloadReadyAt: now, downloadExpiresAt, completedAt: now, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
      const operation = await tx.aiLifecycleOperation.update({ where: { id: input.operationId, state: "processing" }, data: { state: "ready", resultState: "ready", exportExpiresAt: downloadExpiresAt, expiresAt: new Date(downloadExpiresAt.getTime() + 90 * 24 * 60 * 60 * 1000), version: { increment: 1 } } });
      return { job: updatedJob, operation };
    });
  }

  private async markExportFailure(exportId: string, errorCode: string, terminal: boolean, claimId?: string, fence?: number): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const job = await tx.aiExportJob.findUnique({ where: { id: exportId } });
      if (!job || job.state === "ready" || job.state === "expired") return;
      if (claimId !== undefined && (job.materializationClaimId !== claimId || job.materializationFence !== fence)) return;
      if (!terminal && now < job.recoveryDeadlineAt) {
        const updated = await tx.aiExportJob.updateMany({ where: { id: exportId, state: "materializing", ...(claimId === undefined ? {} : { materializationClaimId: claimId, materializationFence: fence }) }, data: { state: "failed_retryable", errorCode, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
        if (updated.count !== 1) return;
        await tx.aiLifecycleOperation.updateMany({ where: { id: job.operationId, state: "processing" }, data: { state: "failed_retryable", resultState: "failed_retryable", errorCode, errorDigest: sha256Hex(errorCode), version: { increment: 1 } } });
        return;
      }
      const deadlines = preReadyExportDeadlines(now);
      const updated = await tx.aiExportJob.updateMany({ where: { id: exportId, state: "materializing", ...(claimId === undefined ? {} : { materializationClaimId: claimId, materializationFence: fence }) }, data: { state: "failed_terminal", errorCode: terminal ? errorCode : "recovery_expired", terminalAt: now, partialPackagePurgeAt: deadlines.partialPackagePurgeAt, terminalRetentionExpiresAt: deadlines.terminalRetentionExpiresAt, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null } });
      if (updated.count !== 1) return;
      await tx.aiLifecycleOperation.updateMany({ where: { id: job.operationId, state: "processing" }, data: { state: "failed_terminal", resultState: "failed_terminal", errorCode: terminal ? errorCode : "recovery_expired", terminalAt: now, expiresAt: deadlines.terminalRetentionExpiresAt, version: { increment: 1 } } });
    });
  }

  async reapExports(_callerNow?: Date): Promise<number> {
    // Candidate discovery is deliberately broad. The authoritative clock is
    // read inside each locked transaction so a caller cannot advance or delay
    // retention by supplying a stale/future JavaScript timestamp.
    void _callerNow;
    const jobs = await this.db.aiExportJob.findMany({
      where: { state: { in: ["materializing", "failed_retryable", "pending", "ready", "failed_terminal", "expired"] } },
      select: { id: true },
    });
    let changed = 0;
    for (const job of jobs) {
      const postCommitKeyRefs: string[] = [];
      let postCommitOperationId: string | null = null;
      try {
        await this.db.$transaction(async (tx) => {
          const initial = await tx.aiExportJob.findUnique({ where: { id: job.id }, select: { id: true, studentId: true } });
          if (!initial) return;
          // Lock order: owner -> every applicable active hold -> export object
          // -> lifecycle operation. A hold is checked after its row is locked,
          // so a conversation/artifact/evidence hold wins over every
          // expiry/takeover decision in this pass, not just a student hold.
          if (initial.studentId) {
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.studentId}::uuid FOR UPDATE`;
            await tx.$queryRaw`
              SELECT h.id
              FROM ai_retention_holds h
              WHERE h.state = 'active'::ai_retention_hold_state
                AND h.subject_state = 'attached'::ai_retention_hold_subject_state
                AND (
                  h.student_id = ${initial.studentId}::uuid
                  OR (h.subject_type = 'conversation'::ai_retention_hold_subject_type
                    AND EXISTS (
                      SELECT 1 FROM ai_conversations c
                      WHERE c.id = h.subject_id AND c.student_id = ${initial.studentId}::uuid
                    ))
                  OR (h.subject_type = 'artifact'::ai_retention_hold_subject_type
                    AND EXISTS (
                      SELECT 1 FROM ai_artifacts a
                      WHERE a.id = h.subject_id AND a.student_id = ${initial.studentId}::uuid
                    ))
                  OR (h.subject_type = 'evidence_object'::ai_retention_hold_subject_type
                    AND EXISTS (
                      SELECT 1
                      FROM ai_context_packs cp
                      JOIN ai_requests r ON r.id = cp.request_id
                      WHERE cp.id = h.subject_id AND r.student_id = ${initial.studentId}::uuid
                    ))
                )
              ORDER BY h.subject_type, h.id
              FOR UPDATE
            `;
          }
          await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE id = ${job.id}::uuid FOR UPDATE`;
          const current = await tx.aiExportJob.findUnique({ where: { id: job.id }, include: { operation: true } });
          if (!current) return;
          await tx.$queryRaw`SELECT id FROM ai_lifecycle_operations WHERE id = ${current.operationId}::uuid FOR UPDATE`;
          const locked = await tx.aiExportJob.findUnique({ where: { id: job.id }, include: { operation: true } });
          if (!locked) return;
          const clock = await dbNow(tx);
          const activeHold = locked.studentId
            ? await tx.aiRetentionHold.findFirst({
              where: {
                state: "active",
                subjectState: "attached",
                OR: [
                  { studentId: locked.studentId },
                  { subjectType: "conversation", subjectId: { in: (await tx.aiConversation.findMany({ where: { studentId: locked.studentId }, select: { id: true } })).map(({ id }) => id) } },
                  { subjectType: "artifact", subjectId: { in: (await tx.aiArtifact.findMany({ where: { studentId: locked.studentId }, select: { id: true } })).map(({ id }) => id) } },
                  { subjectType: "evidence_object", subjectId: { in: (await tx.aiContextPack.findMany({ where: { request: { studentId: locked.studentId } }, select: { id: true } })).map(({ id }) => id) } },
                ],
              },
              select: { id: true },
            })
            : null;
          if (activeHold) return;

          if (locked.state === "failed_terminal" || (locked.state === "expired" && locked.errorCode === "export_erased_legal")) {
            // Terminal retention is anchored to the persisted terminalAt, not
            // recoveryDeadlineAt or a caller-supplied clock. The first pass
            // removes package parts after +24h; the second pass expires the
            // content-free metadata tombstone after +90d. Both operations are
            // row/version CASes under the same owner/hold locks above.
            const terminalAt = locked.terminalAt ?? locked.operation.terminalAt;
            if (!terminalAt) return;
            const deadlines = preReadyExportDeadlines(terminalAt);
            const legalErasure = locked.errorCode === "export_erased_legal";
            if (clock >= deadlines.partialPackagePurgeAt && !legalErasure) {
              postCommitOperationId = locked.operationId;
              const parts = await tx.aiExportPart.findMany({ where: { exportJobId: locked.id }, select: { id: true, ciphertextEnvelope: true } });
              for (const part of parts) {
                const envelope = asEnvelope(part.ciphertextEnvelope);
                if (!envelope) continue;
                postCommitKeyRefs.push(envelope.keyRef);
                await tx.aiPurgeWorkItem.upsert({
                  where: { operationId_objectType_objectId: { operationId: locked.operationId, objectType: "envelope_key", objectId: deterministicWorkItemId(locked.operationId, envelope.keyRef) } },
                  create: { id: randomUUID(), operationId: locked.operationId, objectType: "envelope_key", objectId: deterministicWorkItemId(locked.operationId, envelope.keyRef), state: "pending", claimId: envelope.keyRef, keyLineageDigest: sha256Hex(envelope.keyRef), recoveryDeadlineAt: deadlines.terminalRetentionExpiresAt },
                  update: { claimId: envelope.keyRef },
                });
              }
              if (parts.length > 0) {
                await tx.aiExportPart.deleteMany({ where: { exportJobId: locked.id } });
                await tx.aiExportJob.updateMany({ where: { id: locked.id, state: locked.state, terminalAt }, data: { snapshotDigest: null, packageBytes: null, downloadReadyAt: null, downloadExpiresAt: null } });
                changed += 1;
              }
            }
            if (clock >= deadlines.terminalRetentionExpiresAt) {
              const hasReadyMetadata = Boolean(locked.snapshotDigest || locked.packageBytes !== null || locked.downloadReadyAt || locked.downloadExpiresAt);
              const expired = await tx.aiExportJob.updateMany({ where: { id: locked.id, state: locked.state, terminalAt }, data: { state: "expired", expiredAt: clock, exportAccessGrantState: "expired", ...(hasReadyMetadata ? { snapshotDigest: null, packageBytes: null, downloadReadyAt: null, downloadExpiresAt: null } : {}) } });
              const operation = expired.count === 1
                ? await tx.aiLifecycleOperation.updateMany({ where: { id: locked.operationId, state: locked.operation.state, version: locked.operation.version, terminalAt }, data: { state: "expired", resultState: "expired", expiresAt: clock, version: { increment: 1 } } })
                : { count: 0 };
              if (expired.count === 1 && operation.count === 1) changed += 1;
            }
          } else if (locked.state === "ready" && locked.downloadExpiresAt && locked.downloadExpiresAt <= clock) {
            const retentionBase = new Date(locked.downloadExpiresAt.getTime());
            const terminalRetentionExpiresAt = new Date(retentionBase.getTime() + VERA_RETENTION.exportTerminalMetadataDays * 24 * 60 * 60 * 1000);
            const expired = await tx.aiExportJob.updateMany({
              where: { id: locked.id, state: "ready", downloadExpiresAt: locked.downloadExpiresAt },
              data: { state: "expired", expiredAt: clock, terminalAt: clock, terminalRetentionExpiresAt, exportAccessGrantState: "expired" },
            });
            const operation = expired.count === 1
              ? await tx.aiLifecycleOperation.updateMany({ where: { id: locked.operationId, state: locked.operation.state, version: locked.operation.version }, data: { state: "expired", resultState: "expired", terminalAt: clock, expiresAt: terminalRetentionExpiresAt, version: { increment: 1 } } })
              : { count: 0 };
            if (expired.count === 1 && operation.count === 1) changed += 1;
          } else if ((locked.state === "pending" || locked.state === "materializing" || locked.state === "failed_retryable") && locked.recoveryDeadlineAt <= clock) {
            // recoveryDeadlineAt decides when this transition is eligible;
            // retention deadlines are anchored to the authoritative DB-clock
            // terminalAt, never to a caller/policy deadline from the past.
            const deadlines = preReadyExportDeadlines(clock);
            const terminal = await tx.aiExportJob.updateMany({
              where: { id: locked.id, state: locked.state, recoveryDeadlineAt: locked.recoveryDeadlineAt },
              data: { state: "failed_terminal", errorCode: "recovery_expired", terminalAt: clock, partialPackagePurgeAt: deadlines.partialPackagePurgeAt, terminalRetentionExpiresAt: deadlines.terminalRetentionExpiresAt, materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null },
            });
            const operation = terminal.count === 1
              ? await tx.aiLifecycleOperation.updateMany({ where: { id: locked.operationId, state: locked.operation.state, version: locked.operation.version }, data: { state: "failed_terminal", errorCode: "recovery_expired", terminalAt: clock, expiresAt: deadlines.terminalRetentionExpiresAt, resultState: "failed_terminal", version: { increment: 1 } } })
              : { count: 0 };
            if (terminal.count === 1 && operation.count === 1) changed += 1;
          } else if (locked.state === "materializing" && locked.materializationLeaseExpiresAt && locked.materializationLeaseExpiresAt <= clock) {
            const reset = await tx.aiExportJob.updateMany({ where: { id: locked.id, state: "materializing", materializationLeaseExpiresAt: locked.materializationLeaseExpiresAt, materializationFence: locked.materializationFence }, data: { state: "pending", materializationClaimId: null, materializationOwnerId: null, materializationLeaseExpiresAt: null, materializationFence: { increment: 1 } } });
            const operation = reset.count === 1
              ? await tx.aiLifecycleOperation.updateMany({ where: { id: locked.operationId, state: "processing", version: locked.operation.version }, data: { state: "pending", resultState: "pending", version: { increment: 1 } } })
              : { count: 0 };
            if (reset.count === 1 && operation.count === 1) changed += 1;
          }
          if (locked.exportAccessGrantState === "claiming" && locked.exportAccessGrantLeaseExpiresAt && locked.exportAccessGrantLeaseExpiresAt <= clock) {
            await tx.aiExportJob.updateMany({ where: { id: locked.id, exportAccessGrantState: "claiming", exportAccessGrantVersion: locked.exportAccessGrantVersion, exportAccessGrantLeaseExpiresAt: locked.exportAccessGrantLeaseExpiresAt }, data: { exportAccessGrantState: "active", exportAccessGrantClaimId: null, exportAccessGrantClaimedAt: null, exportAccessGrantLeaseExpiresAt: null, exportAccessGrantVersion: { increment: 1 } } });
          }
        });
        if (postCommitKeyRefs.length > 0) {
          if (!postCommitOperationId) throw new VeraLifecycleError("export_state_mismatch", "Terminal export purge lost its lifecycle operation.", 503);
          await this.processAccountCleanupKeyRegistry([...new Set(postCommitKeyRefs)].sort(compareCanonical), postCommitOperationId);
        }
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
      messages.sort((left, right) => compareCanonical(`${String(left.createdAt)}:${String(left.publicReference)}`, `${String(right.createdAt)}:${String(right.publicReference)}`));
      const projection: Record<string, unknown> = { publicReference: opaqueReference(this.fingerprintSecret, "conversation", conversation.id), createdAt: formatExportInstant(conversation.createdAt), messages };
      if (conversation.title !== null) projection.title = conversation.title.normalize("NFC");
      resultConversations.push(projection);
    }
    resultConversations.sort((left, right) => compareCanonical(String(left.publicReference), String(right.publicReference)));
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
    resultArtifacts.sort((left, right) => compareCanonical(String(left.publicReference), String(right.publicReference)));
    return { schemaVersion: "vera.export.v1", product: "Vera AI", exportAsOf: formatExportInstant(exportAsOf), conversations: resultConversations, artifacts: resultArtifacts };
  }

  /** Internal account-workflow carrier. It has no public idempotency row. */
  async createAccountCleanupCarrier(input: { accountGeneration: string; intent: string; studentId?: string }): Promise<{ operationId: string; correlationDigest: string; replayed: boolean }> {
    const correlationDigest = keyedDigest(this.fingerprintSecret, "account-cleanup", `${input.accountGeneration}:${input.intent}`);
    try {
      return await this.db.$transaction(async (tx) => {
        // The correlation digest is the sole carrier identity. An advisory
        // transaction lock makes the read/create path deterministic while the
        // unique index remains the last-line race guard for another process.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${correlationDigest}, 0))`;
        const existing = await tx.aiLifecycleOperation.findUnique({ where: { accountCleanupCorrelationDigest: correlationDigest } });
        if (existing) return { operationId: existing.id, correlationDigest, replayed: true };
        const now = await dbNow(tx);
        if (input.studentId) {
          await lockStudent(tx, input.studentId);
          const owner = await tx.user.findUnique({ where: { id: input.studentId }, select: { status: true, softDeletedAt: true } });
          if (!owner || owner.status !== "active" || owner.softDeletedAt !== null) {
            throw new VeraLifecycleError("account_deleted", "The account-cleanup owner is unavailable.", 410);
          }
        }
        const operation = await tx.aiLifecycleOperation.create({ data: {
          id: randomUUID(),
          studentId: null,
          idempotencyKeyId: null,
          operation: "account_cleanup",
          resultKind: "account_cleanup",
          state: "pending",
          ownerState: "account_deleted",
          ownerReferenceDigest: keyedDigest(this.fingerprintSecret, "account-owner", input.accountGeneration),
          targetEntityType: input.studentId ? "User" : null,
          targetEntityId: input.studentId ?? null,
          accountCleanupCorrelationDigest: correlationDigest,
          handoffState: "pending",
          resultState: "pending",
          recoveryDeadlineAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          version: 0,
        } });
        return { operationId: operation.id, correlationDigest, replayed: false };
      });
    } catch (error) {
      // Interactive Prisma transactions are aborted after P2002. Re-read in a
      // fresh transaction/client path so a unique loser returns the durable
      // carrier winner instead of a generic failure.
      if ((error as { code?: string }).code !== "P2002") throw error;
      const winner = await this.db.aiLifecycleOperation.findUnique({ where: { accountCleanupCorrelationDigest: correlationDigest } });
      if (winner) return { operationId: winner.id, correlationDigest, replayed: true };
      throw error;
    }
  }

  /**
   * Build the durable export-before-account-purge handoff.  This is the
   * internal path used by the account workflow; public export requests still
   * use their own idempotency namespace and are rejected once the owner is
   * soft-deleted.  The derived grant is deterministic for replay, while the
   * actual grant activation and cleanup carrier linkage are persisted under
   * row locks.
   */
  async prepareAccountCleanup(input: {
    studentId: string;
    accountGeneration: string;
    intent: string;
  }): Promise<{ operationId: string; exportId: string; rawGrant: string; grantDigest: string; handoffSignal: "vera_cleanup_ready_v1" }> {
    const carrier = await this.createAccountCleanupCarrier({ ...input });
    const internalExportKey = `vera-account-cleanup:${carrier.correlationDigest}`.slice(0, 120);
    // The carrier is a durable state machine.  A process may disappear after
    // export acceptance and before materialization, so every retry first
    // re-reads the carrier's locked target and then the operation-scoped
    // export idempotency row.  It must never create a second export job.
    const carrierState = await this.db.aiLifecycleOperation.findUnique({
      where: { id: carrier.operationId },
      select: { targetEntityType: true, targetEntityId: true, handoffState: true, state: true, resultState: true },
    });
    let exportId = carrierState?.targetEntityType === "AiExportJob" ? carrierState.targetEntityId : null;
    // A retry after the account workflow has already consumed its handoff is a
    // replay of the durable carrier, not a new export/materialization attempt.
    // The raw grant is deterministic from the persisted correlation digest, so
    // callers can resume the same grant without mutating the detached owner or
    // creating a second cleanup job.
    if (exportId && (carrierState?.handoffState === "ready" || carrierState?.handoffState === "consumed")) {
      const replayGrant = keyedDigest(this.fingerprintSecret, "account-cleanup-grant", carrier.correlationDigest).slice(0, 80);
      return {
        operationId: carrier.operationId,
        exportId,
        rawGrant: replayGrant,
        grantDigest: this.issueCleanupGrant(exportId, replayGrant).digest,
        handoffSignal: "vera_cleanup_ready_v1",
      };
    }
    if (!exportId) {
      const existingExportKey = await this.db.aiIdempotencyKey.findUnique({
        where: { studentId_operation_clientRequestId: { studentId: input.studentId, operation: "export_create", clientRequestId: internalExportKey } },
        select: { resultId: true, state: true, resultKind: true },
      });
      exportId = existingExportKey?.resultKind === "export_job" ? existingExportKey.resultId : null;
    }
    if (!exportId) {
      const accepted = await this.createExport({ studentId: input.studentId, idempotencyKey: internalExportKey, format: VERA_EXPORT_FORMAT });
      if (!("exportId" in accepted) || !accepted.exportId) throw new VeraLifecycleError("export_state_mismatch", "Account-cleanup export was not accepted.", 503);
      exportId = accepted.exportId;
    }
    // Persist the target before doing any envelope/provider/storage work.  A
    // second process can resume from this row even if the first process dies.
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_lifecycle_operations WHERE id = ${carrier.operationId}::uuid FOR UPDATE`;
      const current = await tx.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId }, select: { version: true, targetEntityType: true, targetEntityId: true, operation: true, handoffState: true } });
      if (!current || current.operation !== "account_cleanup") throw new VeraLifecycleError("target_unavailable", "Account-cleanup carrier is unavailable.", 409);
      if (current.targetEntityType === "AiExportJob" && current.targetEntityId !== exportId) throw new VeraLifecycleError("target_revision_conflict", "Account-cleanup carrier target changed.", 409);
      if (current.targetEntityType !== "AiExportJob") {
        const linked = await tx.aiLifecycleOperation.updateMany({
          where: { id: carrier.operationId, version: current.version, handoffState: "pending" },
          data: { targetEntityType: "AiExportJob", targetEntityId: exportId, exportConversationId: input.studentId, state: "awaiting_dependency", resultState: "pending", version: { increment: 1 } },
        });
        if (linked.count !== 1) throw new VeraLifecycleError("target_revision_conflict", "Account-cleanup carrier was claimed by another worker.", 409);
      }
    });
    const rawGrant = keyedDigest(this.fingerprintSecret, "account-cleanup-grant", carrier.correlationDigest).slice(0, 80);
    const grantDigest = this.issueCleanupGrant(exportId, rawGrant).digest;
    const exportBeforeWork = await this.db.aiExportJob.findUnique({ where: { id: exportId }, select: { state: true, studentId: true, operationId: true } });
    if (!exportBeforeWork || exportBeforeWork.studentId !== input.studentId) {
      throw new VeraLifecycleError("export_state_mismatch", "Account-cleanup export owner changed.", 409);
    }
    if (exportBeforeWork.state !== "ready") await this.materializeExport({ exportId, ownerId: `account-cleanup:${carrier.operationId}` });
    await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      await tx.$queryRaw`SELECT id FROM ai_lifecycle_operations WHERE id = ${carrier.operationId}::uuid FOR UPDATE`;
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
      if (!operation || operation.operation !== "account_cleanup") throw new VeraLifecycleError("target_unavailable", "Account-cleanup carrier is unavailable.", 409);
      await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE id = ${exportId}::uuid FOR UPDATE`;
      const exportJob = await tx.aiExportJob.findUnique({ where: { id: exportId }, select: { state: true, studentId: true, operationId: true, exportAsOf: true } });
      if (!exportJob || exportJob.state !== "ready" || exportJob.studentId !== input.studentId) {
        throw new VeraLifecycleError("export_not_ready", "Account-cleanup export is not ready.", 409);
      }
      await tx.aiExportJob.update({ where: { id: exportId }, data: { exportAccessGrantDigest: grantDigest, exportAccessGrantState: "active", exportAccessGrantVersion: { increment: 1 } } });
      // Keep the carrier in its resumable dependency state until the shared
      // ready-CAS below records completion. Marking the operation `ready`
      // here would make markAccountCleanupReady reject its own transaction
      // and strand a durable export/command pair.
      const linked = await tx.aiLifecycleOperation.updateMany({ where: { id: carrier.operationId, version: operation.version, handoffState: "pending", targetEntityType: "AiExportJob", targetEntityId: exportId }, data: { exportConversationId: input.studentId, exportAsOf: exportJob.exportAsOf, resultState: "ready", version: { increment: 1 } } });
      if (linked.count !== 1 && operation.handoffState !== "ready") throw new VeraLifecycleError("target_revision_conflict", "Account-cleanup carrier changed before grant activation.", 409);
    });
    const handoffDigest = sha256Hex(canonicalExportJson({ operationId: carrier.operationId, exportId, grantDigest }));
    const ready = await this.markAccountCleanupReady({ operationId: carrier.operationId, handoffDigest });
    if (!ready) {
      const replay = await this.db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId }, select: { handoffState: true, handoffDigest: true } });
      if (replay?.handoffState !== "ready" || replay.handoffDigest !== handoffDigest) throw new VeraLifecycleError("target_revision_conflict", "Account-cleanup handoff changed before it became ready.", 409);
    }
    return { operationId: carrier.operationId, exportId, rawGrant, grantDigest, handoffSignal: "vera_cleanup_ready_v1" };
  }

  async markAccountCleanupReady(input: { operationId: string; handoffDigest: string }): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      await tx.$queryRaw`SELECT id FROM ai_lifecycle_operations WHERE id = ${input.operationId}::uuid FOR UPDATE`;
      const current = await tx.aiLifecycleOperation.findUnique({ where: { id: input.operationId }, select: { version: true, state: true, handoffState: true, operation: true, targetEntityType: true, targetEntityId: true } });
      if (!current || current.operation !== "account_cleanup" || !["pending", "processing", "awaiting_dependency"].includes(current.state) || current.handoffState !== "pending") return false;
      if (current.targetEntityType !== "AiExportJob" || !current.targetEntityId) throw new VeraLifecycleError("export_not_ready", "Account-cleanup cannot become ready without a durable export target.", 409);
      await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE id = ${current.targetEntityId}::uuid FOR UPDATE`;
      const exportJob = await tx.aiExportJob.findUnique({ where: { id: current.targetEntityId }, select: { state: true, exportAccessGrantState: true } });
      if (!exportJob || exportJob.state !== "ready" || exportJob.exportAccessGrantState !== "active") throw new VeraLifecycleError("export_not_ready", "Account-cleanup export/grant is not ready.", 409);
      const result = await tx.aiLifecycleOperation.updateMany({ where: { id: input.operationId, operation: "account_cleanup", version: current.version, state: { in: ["pending", "processing", "awaiting_dependency"] }, handoffState: "pending" }, data: { state: "completed", resultState: "completed", handoffSignal: "vera_cleanup_ready_v1", handoffAt: now, handoffState: "ready", handoffDigest: input.handoffDigest, version: { increment: 1 } } });
      return result.count === 1;
    });
  }

  async consumeAccountCleanupHandoff(input: { operationId: string; consumerId: string; acknowledgementDigest: string }): Promise<boolean> {
    const outcome = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      await tx.$queryRaw`SELECT id FROM ai_lifecycle_operations WHERE id = ${input.operationId}::uuid FOR UPDATE`;
      const current = await tx.aiLifecycleOperation.findUnique({ where: { id: input.operationId }, select: { version: true, state: true, handoffState: true, operation: true, targetEntityType: true, targetEntityId: true, exportConversationId: true, ownerReferenceDigest: true, handoffAckDigest: true, handoffDigest: true } });
      if (!current || current.operation !== "account_cleanup") return { consumed: false, operationId: input.operationId, keyRefs: [] as string[] };
      // A duplicate account-workflow delivery is a replay of the committed
      // acknowledgement, never a second anonymization attempt.  A changed
      // acknowledgement is a conflict and cannot claim the carrier.
      if (current.handoffState === "consumed") {
        if (current.handoffAckDigest === input.acknowledgementDigest) {
          // Work items are the durable recovery handoff for a process loss
          // between the account transaction and the external key registry.
          // Replays must rediscover pending/claimed/completed key refs rather
          // than trusting an in-memory list from the first consumer.
          const workItems = await tx.aiPurgeWorkItem.findMany({
            where: { operationId: input.operationId, objectType: "envelope_key", claimId: { not: null } },
            select: { claimId: true },
          });
          return {
            consumed: true,
            operationId: input.operationId,
            keyRefs: workItems.flatMap(({ claimId }) => claimId ? [claimId] : []),
          };
        }
        throw new VeraLifecycleError("idempotency_conflict", "Account-cleanup acknowledgement differs from the stored outcome.", 409);
      }
      if (current.state !== "completed" || current.handoffState !== "ready") return { consumed: false, operationId: input.operationId, keyRefs: [] as string[] };
      const studentId = current.exportConversationId;
      let distinctKeyRefs: string[] = [];
      if (studentId) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${studentId}::uuid FOR UPDATE`;
        const holdIds = await lockApplicableHolds(tx, { studentId });
        if (holdIds.length > 0) throw new VeraLifecycleError("hold_active", "An active Vera retention hold blocks account cleanup.", 409, { holdIds });
        // Release metadata is part of the same FK ordering boundary. Lock all
        // attached released holds and their release rows before any Vera row
        // is anonymized; this prevents a concurrent release/cleanup replay
        // from detaching a different version of the same subject.
        const detachedHoldIds = await lockApplicableHolds(tx, { studentId }, ["released"]);
        if (detachedHoldIds.length > 0) {
          await tx.$queryRaw`
            SELECT id
            FROM ai_retention_hold_releases
            WHERE hold_id IN (${Prisma.join(detachedHoldIds.map((id) => Prisma.sql`${id}::uuid`))})
            ORDER BY hold_id, expected_hold_version, id
            FOR UPDATE
          `;
        }
        // Export is ready and the owner row is locked before this helper is
        // allowed to detach any Vera child. The helper preserves normalized
        // rows, settles pending reservations, and returns the complete
        // envelope lineage for the durable post-commit key worker.
        const ownerReferenceDigest = current.ownerReferenceDigest ?? keyedDigest(this.fingerprintSecret, "account-owner", studentId);
        distinctKeyRefs = await settleAccountOwnedRows(tx, studentId, now, ownerReferenceDigest);
        if (detachedHoldIds.length > 0) {
          await tx.aiRetentionHold.updateMany({
            where: { id: { in: detachedHoldIds }, state: "released", subjectState: "attached" },
            data: {
              subjectState: "detached",
              subjectId: null,
              studentId: null,
              subjectReferenceDigest: ownerReferenceDigest,
              updatedAt: now,
            },
          });
        }
        await tx.authSession.updateMany({ where: { userId: studentId, status: "active" }, data: { status: "revoked", revokedAt: now } });
        await tx.user.updateMany({ where: { id: studentId, status: { not: "soft_deleted" } }, data: { status: "soft_deleted", softDeletedAt: now } });
      }
      // Persist one recovery item per exact envelope key before committing the
      // consumed carrier. `claimId` carries keyRef; the synthetic UUID keeps
      // the normalized work-item identity compatible with its schema. A later
      // process can resume after a crash without repeating a successful call.
      for (const keyRef of distinctKeyRefs) {
        await tx.aiPurgeWorkItem.upsert({
          where: { operationId_objectType_objectId: { operationId: input.operationId, objectType: "envelope_key", objectId: deterministicWorkItemId(input.operationId, keyRef) } },
          create: { id: randomUUID(), operationId: input.operationId, objectType: "envelope_key", objectId: deterministicWorkItemId(input.operationId, keyRef), state: "pending", claimId: keyRef, keyLineageDigest: sha256Hex(keyRef), recoveryDeadlineAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
          update: { claimId: keyRef },
        });
      }
      if (current.targetEntityType === "AiExportJob" && current.targetEntityId) {
        await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE id = ${current.targetEntityId}::uuid FOR UPDATE`;
        await tx.aiExportJob.updateMany({ where: { id: current.targetEntityId, ownerState: "active" }, data: { ownerState: "account_deleted", accountDeletedAt: now, ownerReferenceDigest: keyedDigest(this.fingerprintSecret, "account-owner", current.exportConversationId ?? input.operationId), studentId: null } });
      }
      const result = await tx.aiLifecycleOperation.updateMany({ where: { id: input.operationId, operation: "account_cleanup", version: current.version, state: "completed", handoffState: "ready" }, data: { handoffState: "consumed", handoffConsumedAt: now, handoffConsumerId: input.consumerId, handoffAckDigest: input.acknowledgementDigest, version: { increment: 1 } } });
      return { consumed: result.count === 1, operationId: input.operationId, keyRefs: distinctKeyRefs };
    });
    if (outcome.consumed) {
      // The carrier state is committed before any irreversible registry call.
      // The durable export remains grant-readable; all other envelope keys
      // have already been scoped to the owner and are fenced independently by
      // the registry's keyRef state.  A registry failure is surfaced so the
      // account workflow cannot mistake a partial key purge for completion.
      await this.processAccountCleanupKeyRegistry(outcome.keyRefs, outcome.operationId);
    }
    return outcome.consumed;
  }

  private async processAccountCleanupKeyRegistry(keyRefs: readonly string[], operationId: string): Promise<void> {
    if (keyRefs.length === 0) return;
    const registry = this.envelope.forClient(this.db);
    for (const keyRef of [...new Set(keyRefs)].sort(compareCanonical)) {
      const claim = await this.db.$transaction(async (tx) => {
        const now = await dbNow(tx);
        const keyRow = await tx.aiEnvelopeKey.findUnique({ where: { keyRef }, select: { state: true } });
        const workItem = await tx.aiPurgeWorkItem.findFirst({ where: { operationId, objectType: "envelope_key", claimId: keyRef } });
        if (keyRow?.state !== "active") {
          if (workItem && workItem.state !== "completed") {
            await tx.aiPurgeWorkItem.updateMany({ where: { id: workItem.id, state: { not: "completed" } }, data: { state: "completed", leaseExpiresAt: null, updatedAt: now } });
          }
          return null;
        }
        if (!workItem) return { workItemId: null as string | null, fence: 0 };
        const leaseActive = workItem.state === "claimed" && workItem.leaseExpiresAt !== null && workItem.leaseExpiresAt > now;
        if (workItem.state === "completed" || leaseActive) return null;
        const claimed = await tx.aiPurgeWorkItem.updateMany({
          where: {
            id: workItem.id,
            fence: workItem.fence,
            OR: [
              { state: "pending" },
              { state: "claimed", leaseExpiresAt: { lte: now } },
            ],
          },
          data: {
            state: "claimed",
            claimId: keyRef,
            claimedAt: now,
            leaseExpiresAt: new Date(now.getTime() + VERA_MATERIALIZATION_LEASE_MS),
            fence: { increment: 1 },
            attemptCount: { increment: 1 },
          },
        });
        return claimed.count === 1 ? { workItemId: workItem.id, fence: workItem.fence + 1 } : null;
      });
      if (!claim) continue;
      try {
        await registry.purgeAsync({ keyRef } as AiEncryptedPayload);
        await this.db.$transaction(async (tx) => {
          const now = await dbNow(tx);
          if (!claim.workItemId) return;
          await tx.aiPurgeWorkItem.updateMany({ where: { id: claim.workItemId, state: "claimed", fence: claim.fence, claimId: keyRef }, data: { state: "completed", leaseExpiresAt: null, errorCode: null, errorDigest: null, updatedAt: now } });
        });
      } catch (error) {
        await this.db.$transaction(async (tx) => {
          if (!claim.workItemId) return;
          await tx.aiPurgeWorkItem.updateMany({ where: { id: claim.workItemId, state: "claimed", fence: claim.fence, claimId: keyRef }, data: { state: "failed_retryable", errorCode: "key_registry_unavailable", errorDigest: sha256Hex(error instanceof Error ? error.message : "key_registry_unavailable"), leaseExpiresAt: null } });
        });
        throw error;
      }
    }
  }

  async processConversationDelete(operationId: string): Promise<void> {
    // T11 state-first: publish the unavailable/purging marker in its own
    // durable CAS before any ciphertext/key deletion work begins.
    const marker = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: operationId } });
      if (!operation || operation.operation !== "conversation_delete") throw new VeraLifecycleError("target_unavailable", "Conversation deletion operation not found.");
      if (["completed", "failed_terminal", "expired", "conflict"].includes(operation.state)) return null;
      const conversation = await tx.aiConversation.findUnique({ where: { id: operation.targetEntityId ?? "" }, select: { id: true, studentId: true, version: true, deletionState: true } });
      if (!conversation) {
        await tx.aiLifecycleOperation.update({ where: { id: operation.id }, data: { state: "completed", resultState: "completed", targetState: "purged", terminalAt: now, version: { increment: 1 } } });
        return null;
      }
      if (operation.claimedConversationVersion === null || conversation.version !== operation.claimedConversationVersion + 1) throw new VeraLifecycleError("target_revision_conflict", "A newer conversation version cannot be deleted by this claim.");
      const holdIds = await lockApplicableHolds(tx, { studentId: conversation.studentId, conversationId: conversation.id });
      if (holdIds.length > 0) throw new VeraLifecycleError("hold_active", "An active Vera retention hold blocks conversation deletion.", 409, { holdIds });
      // Two workers may observe the pending operation before either marker
      // commits.  The state CAS is intentionally an updateMany so the loser
      // can return the already-owned result instead of surfacing Prisma
      // P2025 as a failed deletion.
      const processing = await tx.aiLifecycleOperation.updateMany({ where: { id: operation.id, state: { in: ["pending", "failed_retryable"] } }, data: { state: "processing", resultState: "processing", version: { increment: 1 } } });
      if (processing.count !== 1) return null;
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
        studentId: conversation.studentId,
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
      // locks. The durable key row is checked before every external call so a
      // process-loss retry does not invoke irreversible destruction twice.
      const registry = this.envelope.forClient(this.db);
      const seenKeys = new Set<string>();
      for (const candidate of marker.envelopes) {
        const envelope = asEnvelope(candidate);
        if (!envelope || seenKeys.has(envelope.keyRef)) continue;
        seenKeys.add(envelope.keyRef);
        const keyRow = await this.db.aiEnvelopeKey.findUnique({ where: { keyRef: envelope.keyRef }, select: { state: true } });
        if (keyRow?.state !== "active") continue;
        await registry.purgeAsync(envelope);
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
      // The marker transaction may have committed before a new hold was
      // attached. Re-lock every applicable hold immediately before deleting
      // any message/artifact/key-backed target so a late legal hold wins over
      // the finalization CAS as well as over marker publication.
      const holdIds = await lockApplicableHolds(tx, {
        studentId: marker.studentId,
        conversationId: marker.conversationId,
        artifactIds: marker.artifactIds,
      });
      if (holdIds.length > 0) {
        await tx.aiLifecycleOperation.updateMany({
          where: { id: operationId, state: "processing" },
          data: {
            state: "failed_retryable",
            resultState: "failed_retryable",
            errorCode: "hold_active",
            errorDigest: sha256Hex(holdIds.join(",")),
            version: { increment: 1 },
          },
        });
        throw new VeraLifecycleError("hold_active", "An active Vera retention hold blocks conversation finalization.", 409, { holdIds });
      }
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
        // AiArtifactApply row has a restrictive FK. Do not mutate its
        // append-only revision or ciphertext columns here; the lifecycle row
        // and post-commit key registry are the deletion authority.
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
      if (marker.artifactIds.length === 0) {
        await tx.aiConversation.deleteMany({ where: { id: marker.conversationId, deletionState: "deletion_pending" } });
      } else {
        // Artifact revisions retain their parent conversation for immutable
        // provenance. Keep a bounded conversation tombstone instead of
        // violating the artifact FK or attempting a ciphertext update.
        // The conversation row is retained only as a content-free tombstone;
        // do not rewrite any immutable/content-bearing field in the worker.
        // Artifact provenance remains owned by AiArtifactLifecycle and its
        // append-only revision rather than by a conversation UPDATE.
        await tx.aiConversation.updateMany({ where: { id: marker.conversationId, deletionState: "deletion_pending" }, data: { deletionState: "deleted", updatedAt: now } });
      }
      await tx.aiLifecycleOperation.update({ where: { id: operationId }, data: { state: "completed", resultState: "completed", targetState: "purged", targetTombstoneCode: "target_unavailable", terminalAt: now, version: { increment: 1 } } });
    });
  }

  async processArtifactDelete(operationId: string): Promise<void> {
    const marker = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: operationId } });
      if (!operation || operation.operation !== "artifact_delete") throw new VeraLifecycleError("target_unavailable", "Artifact deletion operation not found.");
      if (["completed", "failed_terminal", "expired", "conflict"].includes(operation.state)) return null;
      const lifecycle = await tx.aiArtifactLifecycle.findUnique({ where: { artifactRevisionId: operation.targetEntityId ?? "" }, include: { artifact: { select: { id: true, studentId: true, conversationId: true, contentMarkdownCiphertext: true, titleCiphertext: true, payloadCiphertext: true } } } });
      if (!lifecycle) {
        await tx.aiLifecycleOperation.update({ where: { id: operation.id }, data: { state: "completed", resultState: "completed", targetState: "purged", terminalAt: now, version: { increment: 1 } } });
        return null;
      }
      if (operation.claimedLifecycleRevision === null || lifecycle.lifecycleRevision !== operation.claimedLifecycleRevision + 1) throw new VeraLifecycleError("target_revision_conflict", "A newer artifact revision cannot be deleted by this claim.");
      const holdIds = await lockApplicableHolds(tx, { studentId: lifecycle.artifact.studentId, conversationId: lifecycle.artifact.conversationId, artifactIds: [lifecycle.artifact.id] });
      if (holdIds.length > 0) throw new VeraLifecycleError("hold_active", "An active Vera retention hold blocks artifact deletion.", 409, { holdIds });
      const processing = await tx.aiLifecycleOperation.updateMany({ where: { id: operation.id, state: { in: ["pending", "failed_retryable"] } }, data: { state: "processing", resultState: "processing", version: { increment: 1 } } });
      if (processing.count !== 1) return null;
      await tx.aiArtifactLifecycle.updateMany({ where: { artifactRevisionId: lifecycle.artifactRevisionId, lifecycleRevision: operation.claimedLifecycleRevision + 1, deletionState: "deletion_pending" }, data: { state: "purging", deletedAt: now, retentionPolicyVersion: VERA_RETENTION_POLICY_VERSION, changedAt: now } });
      await tx.aiArtifactApply.updateMany({ where: { artifactRevisionId: lifecycle.artifactRevisionId }, data: { applyState: "purged", purgedAt: now, purgeReason: "artifact_delete" } });
      return {
        artifactId: lifecycle.artifact.id,
        studentId: lifecycle.artifact.studentId,
        conversationId: lifecycle.artifact.conversationId,
        envelopes: [lifecycle.artifact.titleCiphertext, lifecycle.artifact.contentMarkdownCiphertext, lifecycle.artifact.payloadCiphertext],
      };
    });
    if (!marker) return;
    try {
      // Key-registry work runs after the marker transaction has released its
      // locks. The durable key row is checked before every external call so a
      // process-loss retry does not invoke irreversible destruction twice.
      const registry = this.envelope.forClient(this.db);
      const seenKeys = new Set<string>();
      for (const candidate of marker.envelopes) {
        const envelope = asEnvelope(candidate);
        if (!envelope || seenKeys.has(envelope.keyRef)) continue;
        seenKeys.add(envelope.keyRef);
        const keyRow = await this.db.aiEnvelopeKey.findUnique({ where: { keyRef: envelope.keyRef }, select: { state: true } });
        if (keyRow?.state !== "active") continue;
        await registry.purgeAsync(envelope);
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
      const holdIds = await lockApplicableHolds(tx, {
        studentId: marker.studentId,
        conversationId: marker.conversationId,
        artifactIds: [marker.artifactId],
      });
      if (holdIds.length > 0) {
        await tx.aiLifecycleOperation.updateMany({
          where: { id: operationId, state: "processing" },
          data: {
            state: "failed_retryable",
            resultState: "failed_retryable",
            errorCode: "hold_active",
            errorDigest: sha256Hex(holdIds.join(",")),
            version: { increment: 1 },
          },
        });
        throw new VeraLifecycleError("hold_active", "An active Vera retention hold blocks artifact finalization.", 409, { holdIds });
      }
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
      // AiArtifact revisions are append-only. The lifecycle tombstone and
      // post-commit key destruction make every encrypted value unavailable;
      // mutating the immutable ciphertext columns here would violate the
      // production append-only trigger and would erase provenance evidence.
      await tx.aiLifecycleOperation.update({ where: { id: operationId }, data: { state: "completed", resultState: "completed", targetState: "purged", targetTombstoneCode: "artifact_unavailable", terminalAt: now, version: { increment: 1 } } });
    });
  }

  /**
   * Execute an approved legal-erasure claim after its marker transaction has
   * committed.  The claim row is the durable fence: a worker crash leaves an
   * `approved`/`failed_retryable` claim for another process, while an
   * `executing` claim can only be taken over after its bounded lease.  The
   * registry is called once per distinct envelope key and completion is a
   * versioned CAS, so replay cannot destroy a sibling or repeat work.
   */
  async processKeyDestructionClaim(claimId: string): Promise<boolean> {
    const marker = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      await tx.$queryRaw`SELECT id FROM ai_key_destruction_claims WHERE id = ${claimId}::uuid FOR UPDATE`;
      const claim = await tx.aiKeyDestructionClaim.findUnique({ where: { id: claimId } });
      if (!claim) throw new VeraLifecycleError("target_unavailable", "Key-destruction claim not found.", 404);
      if (claim.state === "destroyed" || claim.state === "blocked") return null;
      const leaseExpired = claim.state === "executing"
        && (!claim.startedAt || claim.startedAt.getTime() + VERA_MATERIALIZATION_LEASE_MS <= now.getTime());
      if (claim.state !== "approved" && claim.state !== "failed_retryable" && !leaseExpired) return null;
      if (claim.holdId) {
        await tx.$queryRaw`SELECT id FROM ai_retention_holds WHERE id = ${claim.holdId}::uuid FOR UPDATE`;
        const hold = await tx.aiRetentionHold.findUnique({ where: { id: claim.holdId }, select: { state: true, subjectState: true } });
        if (!hold || hold.state !== "active" || hold.subjectState !== "attached") {
          await tx.aiKeyDestructionClaim.updateMany({
            where: { id: claim.id, claimVersion: claim.claimVersion, state: { in: ["approved", "failed_retryable", "executing"] } },
            data: { state: "blocked", errorCode: "hold_active", claimVersion: { increment: 1 } },
          });
          return null;
        }
      }
      const claimed = await tx.aiKeyDestructionClaim.updateMany({
        where: {
          id: claim.id,
          claimVersion: claim.claimVersion,
          OR: [
            { state: "approved" },
            { state: "failed_retryable" },
            ...(leaseExpired ? [{ state: "executing" as const }] : []),
          ],
        },
        data: { state: "executing", startedAt: now, claimVersion: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;
      if (claim.objectType !== "AiExportJob") throw new VeraLifecycleError("target_unavailable", "Unsupported key-destruction object.", 409);
      const exportJob = await tx.aiExportJob.findUnique({ where: { id: claim.objectId }, select: { id: true, studentId: true, parts: { select: { ciphertextEnvelope: true } } } });
      if (!exportJob) throw new VeraLifecycleError("target_unavailable", "Export key-destruction target is unavailable.", 409);
      if (exportJob.studentId) {
        // Legal-erasure is an explicit dual-control override, but every other
        // applicable hold remains an ordering fence. Locking the complete set
        // here prevents a worker from using a stale marker after a related
        // conversation/artifact/evidence hold was attached.
        const applicableHoldIds = await lockApplicableHolds(tx, { studentId: exportJob.studentId });
        const unexpectedHoldIds = applicableHoldIds.filter((holdId) => holdId !== claim.holdId);
        if (unexpectedHoldIds.length > 0) {
          await tx.aiKeyDestructionClaim.updateMany({
            where: { id: claim.id, state: "executing", claimVersion: claim.claimVersion + 1 },
            data: { state: "failed_retryable", errorCode: "hold_active", claimVersion: { increment: 1 } },
          });
          return null;
        }
      }
      return {
        claimId: claim.id,
        claimVersion: claim.claimVersion + 1,
        keyLineageDigest: claim.keyLineageDigest,
        envelopes: exportJob.parts.map((part) => part.ciphertextEnvelope),
      };
    });
    if (!marker) return false;

    try {
      const registry = this.envelope.forClient(this.db);
      const keyRefs = new Set<string>();
      for (const candidate of marker.envelopes) {
        const envelope = asEnvelope(candidate);
        if (!envelope || keyRefs.has(envelope.keyRef)) continue;
        keyRefs.add(envelope.keyRef);
        // The durable registry row is the per-key irreversible-call fence.
        // A takeover after a process loss observes `destroyed` and skips the
        // registry call, so a crash between the external call and the claim
        // final CAS cannot repeat key destruction.
        const keyState = await this.db.aiEnvelopeKey.findUnique({ where: { keyRef: envelope.keyRef }, select: { state: true } });
        if (keyState?.state === "destroyed") continue;
        await registry.purgeAsync(envelope);
        const checkpointDigest = sha256Hex(canonicalExportJson({
          claimId: marker.claimId,
          keyLineageDigest: marker.keyLineageDigest,
          keyRefs: [...keyRefs].sort(compareCanonical),
        }));
        const checkpoint = await this.db.$transaction(async (tx) => tx.aiKeyDestructionClaim.updateMany({
          where: { id: marker.claimId, state: "executing", claimVersion: marker.claimVersion },
          data: { keyRegistryResultDigest: checkpointDigest },
        }));
        if (checkpoint.count !== 1) throw new VeraLifecycleError("target_revision_conflict", "Key-destruction claim was fenced during registry processing.", 409);
      }
      const resultDigest = sha256Hex(canonicalExportJson({
        claimId: marker.claimId,
        keyLineageDigest: marker.keyLineageDigest,
        keyRefs: [...keyRefs].sort(compareCanonical),
      }));
      const completed = await this.db.$transaction(async (tx) => {
        const now = await dbNow(tx);
        const result = await tx.aiKeyDestructionClaim.updateMany({
          where: { id: marker.claimId, state: "executing", claimVersion: marker.claimVersion },
          data: { state: "destroyed", destroyedAt: now, keyRegistryResultDigest: resultDigest, claimVersion: { increment: 1 } },
        });
        return result.count === 1;
      });
      return completed;
    } catch (error) {
      await this.db.$transaction(async (tx) => {
        const now = await dbNow(tx);
        const current = await tx.aiKeyDestructionClaim.findUnique({ where: { id: marker.claimId }, select: { claimVersion: true, recoveryDeadlineAt: true, state: true } });
        if (!current || current.state !== "executing" || current.claimVersion !== marker.claimVersion) return;
        const terminal = current.recoveryDeadlineAt !== null && now >= current.recoveryDeadlineAt;
        await tx.aiKeyDestructionClaim.updateMany({
          where: { id: marker.claimId, state: "executing", claimVersion: marker.claimVersion },
          data: {
            state: terminal ? "blocked" : "failed_retryable",
            errorCode: terminal ? "key_destruction_recovery_expired" : "key_registry_unavailable",
            claimVersion: { increment: 1 },
          },
        });
      });
      throw error;
    }
  }

  async markLegalErasure(input: {
    exportId: string;
    holdId: string;
    reasonDigest: string;
    approvals: readonly [CapabilityDecisionSnapshot, CapabilityDecisionSnapshot];
  }): Promise<void> {
    const claimId = await this.db.$transaction(async (tx) => {
      const now = await dbNow(tx);
      const requestedApprovals = input.approvals;
      const [requestedA, requestedB] = requestedApprovals;
      if (!requestedA || !requestedB
        || requestedA.operatorId === requestedB.operatorId
        || requestedA.operation !== "key_destroy" || requestedB.operation !== "key_destroy"
        || requestedA.subjectId !== input.exportId || requestedB.subjectId !== input.exportId) {
        throw new VeraLifecycleError("capability_denied", "The approval snapshots do not authorize this export.", 403);
      }

      // Lock order is owner -> hold -> export object -> lifecycle operation ->
      // destruction claim. No one-operator shortcut or caller-provided
      // authority digest can bypass these current, persisted checks.
      const initial = await tx.aiExportJob.findUnique({ where: { id: input.exportId }, select: { id: true, studentId: true } });
      if (!initial) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      if (initial.studentId) await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.studentId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM ai_retention_holds WHERE id = ${input.holdId}::uuid FOR UPDATE`;
      const hold = await tx.aiRetentionHold.findUnique({ where: { id: input.holdId } });
      if (!hold || hold.state !== "active" || hold.subjectState !== "attached" || !hold.holdDigest) throw new VeraLifecycleError("hold_active", "A locked active hold is required before legal erasure.", 409);
      let holdAppliesToExport = Boolean(initial.studentId && hold.studentId === initial.studentId);
      if (hold.subjectType === "conversation" && hold.subjectId && initial.studentId) {
        const conversation = await tx.aiConversation.findFirst({ where: { id: hold.subjectId, studentId: initial.studentId }, select: { id: true } });
        holdAppliesToExport = Boolean(conversation);
      } else if (hold.subjectType === "artifact" && hold.subjectId && initial.studentId) {
        const artifact = await tx.aiArtifact.findFirst({ where: { id: hold.subjectId, studentId: initial.studentId }, select: { id: true } });
        holdAppliesToExport = Boolean(artifact);
      } else if (hold.subjectType === "evidence_object" && hold.subjectId && initial.studentId) {
        const evidence = await tx.aiContextPack.findFirst({ where: { id: hold.subjectId, request: { studentId: initial.studentId } }, select: { id: true } });
        holdAppliesToExport = Boolean(evidence);
      }
      if (!holdAppliesToExport) throw new VeraLifecycleError("hold_active", "The locked active hold does not cover this export owner.", 409);
      const applicableHoldIds = initial.studentId
        ? await lockApplicableHolds(tx, {
          studentId: initial.studentId,
          conversationId: hold.subjectType === "conversation" ? hold.subjectId : null,
          artifactIds: hold.subjectType === "artifact" && hold.subjectId ? [hold.subjectId] : [],
        })
        : [];
      if (!applicableHoldIds.includes(input.holdId)) throw new VeraLifecycleError("hold_active", "The legal-erasure hold was not in the locked applicable hold set.", 409);
      await tx.$queryRaw`
        SELECT id
        FROM ai_retention_hold_releases
        WHERE hold_id IN (${Prisma.join(applicableHoldIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY hold_id, expected_hold_version, id
        FOR UPDATE
      `;
      await tx.$queryRaw`SELECT id FROM ai_export_jobs WHERE id = ${input.exportId}::uuid FOR UPDATE`;
      const job = await tx.aiExportJob.findUnique({ where: { id: input.exportId } });
      if (!job) throw new VeraLifecycleError("target_unavailable", "Export not found.", 404);
      await tx.$queryRaw`SELECT id FROM ai_lifecycle_operations WHERE id = ${job.operationId}::uuid FOR UPDATE`;
      const operation = await tx.aiLifecycleOperation.findUnique({ where: { id: job.operationId } });
      if (!operation) throw new VeraLifecycleError("export_state_mismatch", "Export lifecycle operation is unavailable.");

      const operatorIds = [requestedA.operatorId, requestedB.operatorId];
      const authorizedRows = await tx.user.findMany({
        where: {
          id: { in: operatorIds },
          status: "active",
          softDeletedAt: null,
          roleAssignments: { some: { role: "admin", revokedAt: null } },
        },
        select: {
          id: true,
          roleAssignments: { where: { role: "admin", revokedAt: null }, select: { id: true, role: true } },
        },
      });
      const activeGrants = await tx.aiCapabilityGrant.findMany({
        where: {
          userId: { in: operatorIds },
          isActive: true,
          capability: { in: ["canManageAiPolicy", "canManageAiGovernance"] },
        },
        select: { id: true, userId: true, capability: true },
      });
      if (authorizedRows.length !== 2) throw new VeraLifecycleError("capability_denied", "Both operators must remain currently authorized admins.", 403);
      const authorizedById = new Map(authorizedRows.map((row) => [row.id, row]));
      const grantsById = new Map<string, typeof activeGrants>();
      for (const grant of activeGrants) {
        const existing = grantsById.get(grant.userId ?? "") ?? [];
        existing.push(grant);
        if (grant.userId) grantsById.set(grant.userId, existing);
      }
      const makeAuthorization = (operatorId: string): PersistedOperatorAuthorization => {
        if (!authorizedById.has(operatorId)) throw new VeraLifecycleError("capability_denied", "Both operators must remain currently authorized admins.", 403);
        const grants = grantsById.get(operatorId) ?? [];
        const capabilities = [...new Set(grants.map((grant) => String(grant.capability)))];
        if (!capabilities.includes("canManageAiPolicy") || !capabilities.includes("canManageAiGovernance")) {
          throw new VeraLifecycleError("capability_denied", "Both operators require current policy and governance capability grants.", 403);
        }
        return {
          operatorId,
          roleAssignmentIds: authorizedById.get(operatorId)?.roleAssignments.map((assignment) => assignment.id) ?? [],
          capabilityIds: grants.map((grant) => grant.id),
          capabilities,
        };
      };
      const operatorA = persistedAuthorizationSnapshot(makeAuthorization(requestedA.operatorId), input.exportId, now);
      const operatorB = persistedAuthorizationSnapshot(makeAuthorization(requestedB.operatorId), input.exportId, now);
      try {
        assertDualCapabilityApproval([operatorA, operatorB], [...LEGAL_ERASURE_CAPABILITIES]);
      } catch (error) {
        throw new VeraLifecycleError("capability_denied", error instanceof Error ? error.message : "Two current approvals are required.", 403);
      }

      const keyLineageDigest = job.contentEnvelopeKeyId ? sha256Hex(job.contentEnvelopeKeyId) : sha256Hex(job.id);
      await tx.$queryRaw`SELECT id FROM ai_key_destruction_claims WHERE object_type = 'AiExportJob' AND object_id = ${job.id}::uuid AND key_lineage_digest = ${keyLineageDigest} FOR UPDATE`;
      const existingClaim = await tx.aiKeyDestructionClaim.findUnique({ where: { objectType_objectId_keyLineageDigest: { objectType: "AiExportJob", objectId: job.id, keyLineageDigest } } });
      const decisionSnapshot = {
        operatorA: capabilitySnapshotJson(operatorA),
        operatorB: capabilitySnapshotJson(operatorB),
        holdId: input.holdId,
        holdDigest: hold.holdDigest,
        reasonDigest: input.reasonDigest,
      };
      const decisionSnapshotDigest = sha256Hex(canonicalExportJson(decisionSnapshot));
      if (existingClaim) {
        if (existingClaim.overrideHoldId !== input.holdId || existingClaim.overrideReasonDigest !== input.reasonDigest
          || existingClaim.operatorAId !== operatorA.operatorId || existingClaim.operatorBId !== operatorB.operatorId) {
          throw new VeraLifecycleError("idempotency_conflict", "A different legal-erasure decision already owns this key claim.", 409);
        }
        // An identical claim is a durable replay. It must not repeat state or
        // key-destruction work.
        return existingClaim.id;
      }

      const claim = await tx.aiKeyDestructionClaim.create({
        data: {
          operationId: operation.id,
          holdId: input.holdId,
          objectType: "AiExportJob",
          objectId: job.id,
          keyLineageDigest,
          state: "approved",
          requestedByOperatorId: operatorA.operatorId,
          requestedCapability: LEGAL_ERASURE_CAPABILITIES.join("+"),
          requestedCapabilityDigest: operatorA.snapshotDigest,
          operatorAId: operatorA.operatorId,
          operatorAApprovedAt: operatorA.evaluatedAt,
          operatorADigest: operatorA.snapshotDigest,
          operatorBId: operatorB.operatorId,
          operatorBApprovedAt: operatorB.evaluatedAt,
          operatorBDigest: operatorB.snapshotDigest,
          approvedByOperatorId: operatorB.operatorId,
          approvedCapability: LEGAL_ERASURE_CAPABILITIES.join("+"),
          approvedCapabilityDigest: operatorB.snapshotDigest,
          operatorACapabilityDecisionId: operatorA.capabilityDecisionId,
          operatorACapabilityPolicyVersion: operatorA.capabilityPolicyVersion,
          operatorAGrantedCapabilitySetDigest: operatorA.grantedCapabilitySetDigest,
          operatorACapabilityDecision: operatorA.decision,
          operatorACapabilityEvaluatedAt: operatorA.evaluatedAt,
          operatorACapabilitySnapshotDigest: operatorA.snapshotDigest,
          operatorBCapabilityDecisionId: operatorB.capabilityDecisionId,
          operatorBCapabilityPolicyVersion: operatorB.capabilityPolicyVersion,
          operatorBGrantedCapabilitySetDigest: operatorB.grantedCapabilitySetDigest,
          operatorBCapabilityDecision: operatorB.decision,
          operatorBCapabilityEvaluatedAt: operatorB.evaluatedAt,
          operatorBCapabilitySnapshotDigest: operatorB.snapshotDigest,
          decisionSnapshot: asJson(decisionSnapshot),
          decisionSnapshotDigest,
          erasureOverride: true,
          erasureOverrideCode: "export_erased_legal",
          overrideHoldId: input.holdId,
          overrideAuthorityDigest: operatorA.snapshotDigest,
          overrideReasonDigest: input.reasonDigest,
          recoveryDeadlineAt: new Date(now.getTime() + VERA_RETENTION.recoveryGraceHours * 60 * 60 * 1000),
        },
      });
      if (!claim) throw new VeraLifecycleError("target_unavailable", "Legal-erasure claim could not be persisted.", 503);

      const deadlines = preReadyExportDeadlines(now);
      const updatedJob = await tx.aiExportJob.updateMany({
        where: { id: job.id, state: { not: "expired" } },
        data: {
          // Legal erasure is a terminal failure of the export operation, not
          // an ordinary download expiry. The current forward migration's
          // pre-ready constraint requires the two learner-access timestamps
          // to be null for failed_terminal; retain the content-free digest and
          // byte count plus the original expiry in the linked operation's
          // exportExpiresAt field below.
          state: "failed_terminal",
          errorCode: "export_erased_legal",
          terminalAt: now,
          partialPackagePurgeAt: deadlines.partialPackagePurgeAt,
          terminalRetentionExpiresAt: deadlines.terminalRetentionExpiresAt,
          exportAccessGrantState: "expired",
          downloadReadyAt: null,
          downloadExpiresAt: null,
        },
      });
      if (updatedJob.count !== 1) throw new VeraLifecycleError("export_state_mismatch", "Export state changed during legal-erasure claim.", 409);
      const updatedOperation = await tx.aiLifecycleOperation.updateMany({ where: { id: operation.id, version: operation.version, state: { not: "expired" } }, data: { state: "failed_terminal", errorCode: "export_erased_legal", errorDigest: input.reasonDigest, terminalAt: now, resultState: "failed_terminal", expiresAt: deadlines.terminalRetentionExpiresAt, version: { increment: 1 } } });
      if (updatedOperation.count !== 1) throw new VeraLifecycleError("target_revision_conflict", "Export lifecycle changed during legal-erasure claim.", 409);
      return claim.id;
    });
    await this.processKeyDestructionClaim(claimId);
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
