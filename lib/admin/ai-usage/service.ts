import "server-only";

import {
  AiAdminReportEventType,
  AiAdminReportOperation,
  AiAdminReportSuppressionState,
  AiPolicyAuditAction,
  AiReportBudgetState,
  AiReportReservationResultKind,
  AiReportReservationState,
  AiReportWindowKind,
  Prisma,
  type PrismaClient,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  InMemoryVeraLeaseStore,
  IORedisVeraLeaseStore,
  VeraRedisUnavailableError,
  leaseKey,
  type VeraLease,
  type VeraLeaseStore,
} from "@/lib/vera-ai/redis-lease";
import { canonicalJson, sha256Hex } from "@/lib/vera-ai/contracts";
import { policyValidationDigest } from "@/lib/admin/ai-policy/contracts";
import type { AiPolicyImpactCell, AiPolicyImpactPreviewDto, PreviewReservationAdapter, PreviewReservationRange } from "@/lib/admin/ai-policy/contracts";
import { parseCompletePolicyConfig } from "@/lib/admin/ai-policy/validation";

import { buildAdminUsageDto } from "./aggregate";
import {
  dateForDisplay,
  isSafeReportKey,
  parseAdminUsageQuery,
  reportCost,
  reportFingerprint,
} from "./validation";
import {
  VERA_REPORT_BURST_WINDOW_MS,
  VERA_REPORT_FINGERPRINT_KEY_VERSION,
  VERA_REPORT_MAX_RESULT_BYTES,
  VERA_REPORT_RECOVERY_LEASE_MS,
  VERA_REPORT_REPLAY_TTL_DAYS,
  type VeraAdminAdmissionDbRow,
  type VeraAdminReportDbRow,
  type VeraAdminReportFailureDto,
  type VeraAdminUsageDto,
  type VeraAdminUsageQuery,
  type VeraReportOutcomeState,
  type VeraReportPolicy,
} from "./types";

const REPORT_REDIS_FEATURE = "admin_report_query";

type ReportDb = PrismaClient | Prisma.TransactionClient;

export type VeraAggregateReadPartition = "requests" | "admissions" | "previousRequests";
type AggregateReadHook = (partition: VeraAggregateReadPartition) => void | Promise<void>;

export class VeraAdminUsageError extends Error {
  constructor(
    readonly code:
      | "invalid_report_query"
      | "missing_idempotency_key"
      | "idempotency_conflict"
      | "idempotency_key_expired"
      | "report_budget_exhausted"
      | "report_burst_limited"
      | "report_unavailable"
      | "report_process_lost"
      | "report_result_too_large",
    readonly status: number,
    readonly retryable = false,
    readonly reservationId: string | null = null,
  ) {
    super(code);
    this.name = "VeraAdminUsageError";
  }
}

type StoredReportReservation = {
  id: string;
  adminPrincipalId: string;
  operation: string;
  idempotencyKey: string;
  requestFingerprint: string;
  policyBundleVersion: string;
  costUnits: number;
  state: AiReportReservationState;
  resultKind: AiReportReservationResultKind | null;
  resultSnapshot: unknown;
  resultDigest: string | null;
  failureCode: string | null;
  reservedAt: Date;
  completedAt: Date | null;
  recoveryDeadlineAt: Date;
  recoveryLeaseOwner: string | null;
  recoveryFenceToken: number | null;
  expiresAt: Date | null;
  version: number;
};

type ReservationCommit = {
  reservation: StoredReportReservation;
  policy: VeraReportPolicy;
  scheduledPolicy: { bundleVersion: string; effectiveAt: Date } | null;
  query: VeraAdminUsageQuery;
  lease: VeraLease;
  dbNow: Date;
};

type ReportResponse = {
  status: 200 | 202 | 409 | 429 | 503;
  body: VeraAdminUsageDto | VeraAdminReportFailureDto | { state: "pending"; reservationId: string } | { error: string };
};

function reportDbError(code: VeraAdminUsageError["code"], retryable = true, reservationId: string | null = null): VeraAdminUsageError {
  return new VeraAdminUsageError(code, 503, retryable, reservationId);
}

async function databaseNow(db: ReportDb): Promise<Date> {
  const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw reportDbError("report_unavailable");
  return now;
}

/**
 * Establish one DB-clock policy boundary for every report/preview path.  The
 * row locks are deliberately short-lived and are acquired before any budget
 * or Redis decision.  A complete due successor is promoted in this same
 * transaction; an incomplete/ambiguous successor fails closed instead of
 * letting callers observe the old active bundle or treating a scheduled row
 * as active without state/audit/CAS evidence.
 */
export async function ensureEffectivePolicyBoundary(db: ReportDb, _now: Date, actorId?: string): Promise<void> {
  // The exported helper is also used by workers and disposable fixtures. A
  // plain PrismaClient would otherwise release the FOR UPDATE lock at the end
  // of the SELECT before the retirement/promotion writes. Keep the whole
  // boundary in one transaction when the caller did not already provide one.
  // Interactive transaction clients expose a `$transaction` proxy too, but
  // intentionally do not expose the lifecycle `$connect` method.  Checking
  // `$transaction` alone would open a nested transaction, abort the caller's
  // snapshot, and can cause a second Redis lease attempt during adapter retry.
  if ("$connect" in db && typeof (db as PrismaClient).$connect === "function") {
    await (db as PrismaClient).$transaction(async (tx) => ensureEffectivePolicyBoundaryInTransaction(tx, await databaseNow(tx), actorId));
    return;
  }
  await ensureEffectivePolicyBoundaryInTransaction(db, await databaseNow(db), actorId);
}

async function ensureEffectivePolicyBoundaryInTransaction(db: ReportDb, now: Date, actorId?: string): Promise<void> {
  const locked = await db.$queryRaw<Array<{ id: string; state: string }>>`
    SELECT id, state::text AS state
    FROM ai_policy_bundles
    WHERE state IN ('active'::ai_policy_state, 'scheduled'::ai_policy_state)
      AND (state = 'active'::ai_policy_state OR effective_at <= ${now})
    ORDER BY CASE WHEN state = 'active'::ai_policy_state THEN 0 ELSE 1 END,
             effective_at ASC,
             id ASC
    FOR UPDATE
  `;
  const due = locked.filter((row) => row.state === "scheduled");
  const active = locked.filter((row) => row.state === "active");
  if (due.length > 1) throw reportDbError("report_unavailable", false);
  if (due[0]) {
    if (!actorId || active.length > 1) throw reportDbError("report_unavailable", false);
    const successor = await db.aiPolicyBundle.findUnique({ where: { id: due[0].id } });
    if (
      !successor
      || successor.state !== "scheduled"
      || successor.effectiveAt > now
      || !successor.validationDigest.trim()
      || !successor.approvalSnapshotId
      || !successor.approvedAt
      || !successor.approvedByUserId
    ) {
      throw reportDbError("report_unavailable", false);
    }
    const approvalSnapshot = await db.aiPolicyApprovalSnapshot.findUnique({ where: { id: successor.approvalSnapshotId } });
    if (
      !approvalSnapshot
      || approvalSnapshot.bundleId !== successor.id
      || approvalSnapshot.bundleRevision !== successor.revision - 1
      || approvalSnapshot.snapshotDigest !== successor.approvalSnapshotDigest
      || !approvalSnapshot.approvalAuditEventId
    ) {
      throw reportDbError("report_unavailable", false);
    }
    let successorConfig;
    try {
      successorConfig = parseCompletePolicyConfig({
        bundleVersion: successor.bundleVersion,
        configSchemaVersion: successor.configSchemaVersion,
        effectiveAt: successor.effectiveAt,
        quotaConfig: successor.quotaConfig,
        settlementConfig: successor.settlementConfig,
        reportConfig: successor.reportConfig,
        retentionConfig: successor.retentionConfig,
        providerGateState: successor.providerGateState,
        changeReason: successor.changeReason,
      });
      if (policyValidationDigest(successorConfig) !== successor.validationDigest) throw new Error("policy digest drift");
    } catch {
      throw reportDbError("report_unavailable", false);
    }
    if (active[0]) {
      await db.aiPolicyBundle.update({ where: { id: active[0].id }, data: { state: "retired", revision: { increment: 1 } } });
      await db.aiPolicyAuditEvent.create({
        data: {
          bundleId: active[0].id,
          actorId,
          action: AiPolicyAuditAction.retired,
          reason: "DB-clock successor promotion",
          fromState: "active",
          toState: "retired",
        },
      });
    }
    await db.aiPolicyBundle.update({ where: { id: successor.id }, data: { state: "active", activatedAt: now, revision: { increment: 1 } } });
    await db.aiPolicyAuditEvent.create({
      data: {
        bundleId: successor.id,
        actorId,
        action: AiPolicyAuditAction.activated,
        diffDigest: successor.validationDigest,
        validationDigest: successor.validationDigest,
        reason: "DB-clock successor promotion",
        fromState: "scheduled",
        toState: "active",
      },
    });
    return;
  }
  if (active.length !== 1) throw reportDbError("report_unavailable", false);
  const activeRow = await db.aiPolicyBundle.findUnique({ where: { id: active[0]!.id } });
  if (!activeRow || activeRow.effectiveAt > now || !activeRow.validationDigest.trim()) throw reportDbError("report_unavailable", false);
}

async function activePolicy(db: ReportDb, now: Date, actorId?: string): Promise<{ policy: VeraReportPolicy; scheduledPolicy: { bundleVersion: string; effectiveAt: Date } | null }> {
  await ensureEffectivePolicyBoundary(db, now, actorId);
  const row = await db.aiPolicyBundle.findFirst({ where: { state: "active" } });
  if (!row) throw reportDbError("report_unavailable", false);
  let reportConfig: VeraReportPolicy["reportConfig"];
  try {
    const config = parseCompletePolicyConfig({
      bundleVersion: row.bundleVersion,
      configSchemaVersion: row.configSchemaVersion,
      effectiveAt: row.effectiveAt,
      quotaConfig: row.quotaConfig,
      settlementConfig: row.settlementConfig,
      reportConfig: row.reportConfig,
      retentionConfig: row.retentionConfig,
      providerGateState: row.providerGateState,
      changeReason: row.changeReason,
    });
    if (!row.validationDigest?.trim()) throw new Error("missing policy validation digest");
    reportConfig = config.reportConfig;
  } catch {
    throw reportDbError("report_unavailable", false);
  }
  const scheduled = await db.aiPolicyBundle.findFirst({
    where: { state: "scheduled", effectiveAt: { gt: now } },
    orderBy: [{ effectiveAt: "asc" }, { id: "asc" }],
    select: { bundleVersion: true, effectiveAt: true },
  });
  return {
    policy: { bundleVersion: row.bundleVersion, effectiveAt: row.effectiveAt, reportConfig },
    scheduledPolicy: scheduled,
  };
}

type PreviewChangedSections = Partial<Record<"quota" | "settlement" | "report" | "retention", true>>;
type PolicyPreviewEffects = {
  state: AiPolicyImpactPreviewDto["state"];
  effects: {
    futureAdmissions: AiPolicyImpactCell;
    futureReportReservations: AiPolicyImpactCell;
    futureContentEvidence: AiPolicyImpactCell;
  };
};

function previewPopulationCell(
  category: "quota" | "report_budget" | "content_evidence",
  changed: boolean,
  rows: Array<{ studentId: string | null; at: Date; affected: boolean }>,
  minimum: number,
  timezone: string,
): { cell: AiPolicyImpactCell; coarsened: boolean } {
  if (!changed) return { cell: { state: "unchanged" }, coarsened: false };
  const base = new Set(rows.map((row) => row.studentId).filter((value): value is string => Boolean(value)));
  const affected = new Set(rows.filter((row) => row.affected).map((row) => row.studentId).filter((value): value is string => Boolean(value)));
  if (base.size < minimum || affected.size < minimum || base.size - affected.size < minimum) {
    return { cell: { state: "suppressed" }, coarsened: false };
  }
  const dates = new Set(rows.map((row) => dateForDisplay(row.at, timezone)));
  const coarsened = dates.size > 1 && [...dates].some((date) => {
    const daily = rows.filter((row) => dateForDisplay(row.at, timezone) === date);
    const dailyBase = new Set(daily.map((row) => row.studentId).filter((value): value is string => Boolean(value)));
    const dailyAffected = new Set(daily.filter((row) => row.affected).map((row) => row.studentId).filter((value): value is string => Boolean(value)));
    return dailyBase.size < minimum || dailyAffected.size < minimum || dailyBase.size - dailyAffected.size < minimum;
  });
  return {
    coarsened,
    cell: {
      state: coarsened ? "coarsened" : "forward_only",
      aggregate: { affectedFutureRows: rows.filter((row) => row.affected).length, category },
    },
  };
}

/**
 * Query real durable rows for aggregate policy impact.  This intentionally
 * returns suppression/coarsening/unavailable states rather than manufacturing
 * a ready/zero result when the disposable database has no evidence.
 */
export async function buildPolicyPreviewEffects(input: {
  db: Prisma.TransactionClient;
  query: VeraAdminUsageQuery;
  changed: PreviewChangedSections;
  minimumGroupSize?: number;
}): Promise<PolicyPreviewEffects> {
  const minimum = input.minimumGroupSize ?? 5;
  const needAdmissions = input.changed.quota === true || input.changed.settlement === true;
  const needReports = input.changed.report === true;
  const needContent = input.changed.retention === true;
  const requestWhere = {
    createdAt: { gte: input.query.utcStart, lt: input.query.utcEnd },
    ...(input.query.feature !== "all" ? { featureKey: input.query.feature } : {}),
  };
  const [requestResult, reportResult, artifactResult] = await Promise.allSettled([
    needAdmissions
      ? input.db.aiRequest.findMany({ where: requestWhere, select: { studentId: true, status: true, createdAt: true }, take: 10_001 })
      : Promise.resolve([]),
    needReports
      ? input.db.aiReportReservation.findMany({ where: { reservedAt: { gte: input.query.utcStart, lt: input.query.utcEnd }, operation: AiAdminReportOperation.admin_report_query }, select: { adminPrincipalId: true, state: true, reservedAt: true }, take: 10_001 })
      : Promise.resolve([]),
    needContent
      ? input.db.aiArtifact.findMany({ where: { createdAt: { gte: input.query.utcStart, lt: input.query.utcEnd } }, select: { studentId: true, createdAt: true, expiresAt: true }, take: 10_001 })
      : Promise.resolve([]),
  ]);
  const failedCount = [needAdmissions && requestResult.status === "rejected", needReports && reportResult.status === "rejected", needContent && artifactResult.status === "rejected"].filter(Boolean).length;
  const requestedCount = [needAdmissions, needReports, needContent].filter(Boolean).length;
  if (requestedCount > 0 && failedCount === requestedCount) throw reportDbError("report_unavailable");

  const admissions = requestResult.status === "fulfilled" ? requestResult.value.map((row) => ({ studentId: row.studentId, at: row.createdAt, affected: row.status === "pending" || row.status === "staged" })) : [];
  const reports = reportResult.status === "fulfilled" ? reportResult.value.map((row) => ({ studentId: row.adminPrincipalId, at: row.reservedAt, affected: row.state === AiReportReservationState.reserved })) : [];
  const content = artifactResult.status === "fulfilled" ? artifactResult.value.map((row) => ({ studentId: row.studentId, at: row.createdAt, affected: row.expiresAt === null || row.expiresAt > input.query.utcEnd })) : [];
  const admissionCell = requestResult.status === "rejected" ? { cell: { state: "unavailable" as const }, coarsened: false } : previewPopulationCell("quota", needAdmissions, admissions, minimum, input.query.timezone);
  const reportCell = reportResult.status === "rejected" ? { cell: { state: "unavailable" as const }, coarsened: false } : previewPopulationCell("report_budget", needReports, reports, minimum, input.query.timezone);
  const contentCell = artifactResult.status === "rejected" ? { cell: { state: "unavailable" as const }, coarsened: false } : previewPopulationCell("content_evidence", needContent, content, minimum, input.query.timezone);
  const cells = [admissionCell, reportCell, contentCell];
  const state: AiPolicyImpactPreviewDto["state"] = cells.some((entry) => entry.cell.state === "unavailable")
    ? "partial_unavailable"
    : cells.some((entry) => entry.cell.state === "suppressed")
      ? "suppressed"
      : cells.some((entry) => entry.coarsened)
        ? "coarsened"
        : "ready";
  return { state, effects: { futureAdmissions: admissionCell.cell, futureReportReservations: reportCell.cell, futureContentEvidence: contentCell.cell } };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function replayFailure(row: StoredReportReservation): VeraAdminReportFailureDto {
  if (
    row.resultKind !== AiReportReservationResultKind.typed_error
    || !row.resultSnapshot
    || typeof row.resultSnapshot !== "object"
  ) {
    return { state: "error", code: "report_process_lost", retryable: false, reservationId: row.id };
  }
  const snapshot = row.resultSnapshot as Partial<VeraAdminReportFailureDto> & { kind?: string };
  if (snapshot.kind !== "typed_error" || snapshot.state !== "error" || typeof snapshot.code !== "string" || typeof row.resultDigest !== "string" || sha256Hex(canonicalJson(snapshot)) !== row.resultDigest) {
    return { state: "error", code: row.failureCode ?? "report_unavailable", retryable: false, reservationId: row.id };
  }
  return {
    state: "error",
    code: snapshot.code,
    retryable: snapshot.retryable === true,
    reservationId: row.id,
  };
}

function isValidReportSnapshot(row: StoredReportReservation): row is StoredReportReservation & { resultSnapshot: { kind: "report"; dto: VeraAdminUsageDto }; resultDigest: string } {
  if (row.resultKind !== AiReportReservationResultKind.report || !row.resultSnapshot || typeof row.resultSnapshot !== "object" || Array.isArray(row.resultSnapshot) || typeof row.resultDigest !== "string") return false;
  const snapshot = row.resultSnapshot as { kind?: unknown; dto?: unknown };
  if (snapshot.kind !== "report" || !snapshot.dto || typeof snapshot.dto !== "object" || Array.isArray(snapshot.dto)) return false;
  const dto = snapshot.dto as Partial<VeraAdminUsageDto>;
  if (
    !dto.range
    || typeof dto.range !== "object"
    || Array.isArray(dto.range)
    || typeof dto.range.from !== "string"
    || typeof dto.range.to !== "string"
    || typeof dto.range.timezone !== "string"
    || typeof dto.policySummary !== "object"
    || !dto.policySummary
    || Array.isArray(dto.policySummary)
    || !dto.policySummary.active
    || typeof dto.policySummary.active.bundleVersion !== "string"
    || !dto.summary
    || !dto.dailyTrend
    || !dto.byFeature
    || !dto.byModel
    || !dto.byStatus
    || !dto.latency
    || !dto.incidents
    || !dto.comparison
  ) return false;
  // A replay must be bound to the same persisted policy snapshot and to a
  // closed aggregate partition shape. Never trust a JSON result merely because
  // its outer digest happens to match a corrupted row.
  if (dto.policySummary.active.bundleVersion !== row.policyBundleVersion) return false;
  const partitions = [dto.summary, dto.dailyTrend, dto.byFeature, dto.byModel, dto.byStatus, dto.latency, dto.incidents, dto.comparison];
  if (partitions.some((partition) => !partition || typeof partition !== "object" || Array.isArray(partition) || typeof (partition as { state?: unknown }).state !== "string")) return false;
  return sha256Hex(canonicalJson(row.resultSnapshot)) === row.resultDigest;
}

function asStoredReservation(value: unknown): StoredReportReservation {
  return value as StoredReportReservation;
}

function isExpired(row: StoredReportReservation, now: Date): boolean {
  return row.state === AiReportReservationState.expired || Boolean(row.expiresAt && row.expiresAt <= now);
}

function replayResponse(row: StoredReportReservation): ReportResponse {
  if (row.state === AiReportReservationState.completed && isValidReportSnapshot(row)) {
    return { status: 200, body: row.resultSnapshot.dto };
  }
  if (row.state === AiReportReservationState.reserved) return { status: 202, body: { state: "pending", reservationId: row.id } };
  return { status: 503, body: replayFailure(row) };
}

function suppressionStateForOutcome(outcome: VeraReportOutcomeState): AiAdminReportSuppressionState {
  switch (outcome) {
    case "ready": return AiAdminReportSuppressionState.ready;
    case "partial_unavailable": return AiAdminReportSuppressionState.partial_unavailable;
    case "suppressed": return AiAdminReportSuppressionState.suppressed;
    case "coarsened": return AiAdminReportSuppressionState.coarsened;
    case "process_lost": return AiAdminReportSuppressionState.process_lost;
    case "failed": return AiAdminReportSuppressionState.failed;
    default: return AiAdminReportSuppressionState.unavailable;
  }
}

export class VeraAdminUsageService {
  private readonly db: PrismaClient;
  private readonly leaseStore: VeraLeaseStore;
  private readonly hmacSecret: string;
  private readonly beforeAggregateRead: AggregateReadHook;
  constructor(input: { db?: PrismaClient; leaseStore?: VeraLeaseStore; hmacSecret?: string; beforeAggregateRead?: AggregateReadHook } = {}) {
    this.db = input.db ?? defaultPrisma;
    this.hmacSecret = input.hmacSecret ?? process.env.VERA_IDEMPOTENCY_HMAC_SECRET ?? "";
    this.leaseStore = input.leaseStore ?? createDefaultReportLeaseStore();
    this.beforeAggregateRead = input.beforeAggregateRead ?? (() => undefined);
  }

  async getReport(input: { adminPrincipalId: string; idempotencyKey: string | null; params: URLSearchParams; now?: Date }): Promise<ReportResponse> {
    if (!isSafeReportKey(input.idempotencyKey)) throw new VeraAdminUsageError("missing_idempotency_key", 400, false);
    let query: VeraAdminUsageQuery;
    try {
      query = parseAdminUsageQuery(input.params, input.now ?? new Date());
    } catch (error) {
      if (error instanceof VeraAdminUsageError) throw error;
      const code = error instanceof Error && "details" in error && (error as { details?: { code?: string } }).details?.code === "invalid_report_query"
        ? "invalid_report_query"
        : "invalid_report_query";
      throw new VeraAdminUsageError(code, 400, false);
    }
    const fingerprint = reportFingerprint(query, this.hmacSecret);
    const replay = await this.lookupReplay({ adminPrincipalId: input.adminPrincipalId, idempotencyKey: input.idempotencyKey, fingerprint });
    if (replay) return replay;

    const costUnits = reportCost(query.include);
    let commit: ReservationCommit | null = null;
    try {
      commit = await this.reserve({ adminPrincipalId: input.adminPrincipalId, idempotencyKey: input.idempotencyKey, fingerprint, query, costUnits });
    } catch (error) {
      if (error instanceof VeraAdminUsageError && error.code === "idempotency_conflict") {
        const concurrent = await this.lookupReplay({ adminPrincipalId: input.adminPrincipalId, idempotencyKey: input.idempotencyKey, fingerprint });
        if (concurrent) return concurrent;
      }
      throw error;
    }

    try {
      const result = await this.executeAggregate(query, commit.policy, commit.scheduledPolicy);
      if (Buffer.byteLength(JSON.stringify({ kind: "report", dto: result.dto }), "utf8") > VERA_REPORT_MAX_RESULT_BYTES) {
        throw reportDbError("report_result_too_large", false, commit.reservation.id);
      }
      const finalized = await this.completeReservation(commit, result.dto, result.outcome, result.resultDigest);
      if (finalized) return { status: 200, body: result.dto };
      const replayed = await this.lookupReplay({ adminPrincipalId: input.adminPrincipalId, idempotencyKey: input.idempotencyKey, fingerprint });
      if (replayed) return replayed;
      throw reportDbError("report_process_lost", false, commit.reservation.id);
    } catch (error) {
      if (error instanceof VeraAdminUsageError && error.reservationId === commit.reservation.id) {
        await this.failReservation(commit, error.code, error.retryable);
        return { status: error.status as 503, body: { state: "error", code: error.code, retryable: error.retryable, reservationId: commit.reservation.id } };
      }
      await this.failReservation(commit, "report_unavailable", true);
      return { status: 503, body: { state: "error", code: "report_unavailable", retryable: true, reservationId: commit.reservation.id } };
    } finally {
      try {
        await this.leaseStore.release(commit.lease);
      } catch {
        // The lease is bounded and the durable Postgres budget remains the
        // source of truth; a release failure must not rewrite an accepted row.
      }
    }
  }

  /**
   * Reserve the shared report budget for T10's aggregate policy preview.
   *
   * This deliberately lives beside the T9 report reservation implementation:
   * both operations consume the same principal-scoped rolling windows and
   * fenced Redis gate, while their durable operation/result kinds remain
   * distinct in AiReportReservation.
   */
  async reservePolicyPreview(input: {
    principalId: string;
    clientRequestId: string;
    requestFingerprint: string;
    policyBundleVersion: string;
    costUnits: 3;
    asOf: Date;
    range: PreviewReservationRange;
    commandId: string;
    transaction?: Prisma.TransactionClient;
  }): Promise<{ reservationId: string }> {
    if (!isSafeReportKey(input.clientRequestId)) {
      throw new VeraAdminUsageError("missing_idempotency_key", 400, false);
    }

    const query = parseAdminUsageQuery(new URLSearchParams({ from: input.range.from, to: input.range.to, timezone: input.range.timezone }), input.asOf);
    let lease: VeraLease | null = null;
    try {
      const run = async (tx: Prisma.TransactionClient) => {
        const dbNow = await databaseNow(tx);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.principalId}, 0))`;

        const existingRows = await tx.$queryRaw<Array<{ id: string; request_fingerprint: string; state: AiReportReservationState; expires_at: Date | null; recovery_deadline_at: Date }>>`
          SELECT id, request_fingerprint, state, expires_at, recovery_deadline_at
          FROM ai_report_reservations
          WHERE admin_principal_id = ${input.principalId}::uuid
            AND operation = 'admin_policy_preview'::ai_admin_report_operation
            AND idempotency_key = ${input.clientRequestId}
          FOR UPDATE
        `;
        const existing = existingRows[0];
        if (existing) {
          if (existing.state === AiReportReservationState.expired || (existing.expires_at && existing.expires_at <= dbNow)) {
            throw new VeraAdminUsageError("idempotency_key_expired", 409);
          }
          if (existing.request_fingerprint !== input.requestFingerprint) {
            throw new VeraAdminUsageError("idempotency_conflict", 409);
          }
          if (existing.state === AiReportReservationState.completed) return existing.id;
          if (existing.state === AiReportReservationState.failed || existing.state === AiReportReservationState.process_lost) {
            throw new VeraAdminUsageError("report_process_lost", 503, false, existing.id);
          }
          if (existing.recovery_deadline_at <= dbNow) {
            throw new VeraAdminUsageError("report_process_lost", 503, false, existing.id);
          }
          // A still-live reservation belongs to an in-flight command. Do not
          // charge or create a second row; the command ledger will replay it.
          return existing.id;
        }

        const effective = await activePolicy(tx, dbNow, input.principalId);
        if (effective.policy.bundleVersion !== input.policyBundleVersion) {
          throw new VeraAdminUsageError("report_unavailable", 503, false);
        }
        const budget = await this.lockOrCreateWindow(tx, input.principalId, AiReportWindowKind.budget_24h, effective.policy, dbNow);
        const burst = await this.lockOrCreateWindow(tx, input.principalId, AiReportWindowKind.burst_10m, effective.policy, dbNow);
        if (budget.usedBudgetUnits + input.costUnits > budget.budgetUnitsSnapshot) {
          throw new VeraAdminUsageError("report_budget_exhausted", 429);
        }
        if (burst.requestCount + 1 > effective.policy.reportConfig.requestLimit) {
          throw new VeraAdminUsageError("report_burst_limited", 429);
        }

        const acquired = this.leaseStore.acquireWithReason
          ? await this.leaseStore.acquireWithReason({
              studentId: input.principalId,
              featureKey: REPORT_REDIS_FEATURE,
              maxConcurrent: 1,
              burstLimit: Math.max(0, effective.policy.reportConfig.requestLimit - burst.requestCount),
              burstWindowMs: VERA_REPORT_BURST_WINDOW_MS,
              ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2,
              now: dbNow,
            })
          : { lease: await this.leaseStore.acquire({
              studentId: input.principalId,
              featureKey: REPORT_REDIS_FEATURE,
              maxConcurrent: 1,
              burstLimit: Math.max(0, effective.policy.reportConfig.requestLimit - burst.requestCount),
              burstWindowMs: VERA_REPORT_BURST_WINDOW_MS,
              ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2,
              now: dbNow,
            }) };
        if (!acquired.lease) {
          if (acquired.rejectionReason === "burst") throw new VeraAdminUsageError("report_burst_limited", 429);
          throw reportDbError("report_unavailable");
        }
        lease = acquired.lease;

        // Redis is only an admission gate. Re-read the DB clock and policy
        // boundary after acquiring it so a scheduled cutover or budget race
        // cannot turn an old snapshot into an accepted preview.
        const postRedisNow = await databaseNow(tx);
        const postEffective = await activePolicy(tx, postRedisNow, input.principalId);
        if (postEffective.policy.bundleVersion !== effective.policy.bundleVersion) throw reportDbError("report_unavailable", true);
        const postBudget = await this.lockOrCreateWindow(tx, input.principalId, AiReportWindowKind.budget_24h, postEffective.policy, postRedisNow);
        const postBurst = await this.lockOrCreateWindow(tx, input.principalId, AiReportWindowKind.burst_10m, postEffective.policy, postRedisNow);
        if (postBudget.usedBudgetUnits + input.costUnits > postBudget.budgetUnitsSnapshot) throw new VeraAdminUsageError("report_budget_exhausted", 429);
        if (postBurst.requestCount + 1 > postEffective.policy.reportConfig.requestLimit) throw new VeraAdminUsageError("report_burst_limited", 429);

        const created = await tx.aiReportReservation.create({
          data: {
            adminPrincipalId: input.principalId,
            operation: AiAdminReportOperation.admin_policy_preview,
            idempotencyKey: input.clientRequestId,
            requestFingerprint: input.requestFingerprint,
            fingerprintKeyVersion: VERA_REPORT_FINGERPRINT_KEY_VERSION,
            policyBundleVersion: postEffective.policy.bundleVersion,
            costUnits: input.costUnits,
            state: AiReportReservationState.reserved,
            reservedAt: postRedisNow,
            recoveryDeadlineAt: new Date(postRedisNow.getTime() + VERA_REPORT_RECOVERY_LEASE_MS),
            recoveryLeaseOwner: lease.ownerId,
            recoveryFenceToken: lease.fencingToken,
          },
        });
        await tx.aiReportBudgetWindow.update({
          where: { id: postBudget.id },
          data: {
            usedBudgetUnits: { increment: input.costUnits },
            requestCount: { increment: 1 },
            consumedUnits: { increment: input.costUnits },
            consumedRequests: { increment: 1 },
            version: { increment: 1 },
          },
        });
        await tx.aiReportBudgetWindow.update({
          where: { id: postBurst.id },
          data: { requestCount: { increment: 1 }, consumedRequests: { increment: 1 }, version: { increment: 1 } },
        });
        await tx.aiAdminReportAudit.create({
          data: {
            actorId: input.principalId,
            adminPrincipalId: input.principalId,
            reservationId: created.id,
            eventType: AiAdminReportEventType.reservation,
            operation: AiAdminReportOperation.admin_policy_preview,
            policyBundleVersion: postEffective.policy.bundleVersion,
            queryFingerprint: input.requestFingerprint,
            queryShapeDigest: input.requestFingerprint,
            displayTimezone: query.timezone,
            rangeStart: dateOnly(query.from),
            rangeEnd: dateOnly(query.to),
            localDateSpan: { from: query.from, to: query.to },
            costUnits: input.costUnits,
            suppressionState: AiAdminReportSuppressionState.not_evaluated,
            suppressionApplied: false,
          },
        });
        return created.id;
      };
      const reservation = input.transaction ? await run(input.transaction) : await this.db.$transaction(run);
      return { reservationId: reservation };
    } catch (error) {
      if (lease) {
        try { await this.leaseStore.release(lease); } catch { /* bounded expiry remains safe */ }
      }
      if (error instanceof VeraAdminUsageError) throw error;
      if (error instanceof VeraRedisUnavailableError) throw reportDbError("report_unavailable");
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new VeraAdminUsageError("idempotency_conflict", 409);
      }
      throw reportDbError("report_unavailable");
    }
  }

  /**
   * Complete a policy preview reservation with a discriminated, encrypted-at-
   * rest result snapshot. A completed row is idempotent so a lost response or
   * duplicate command cannot double-charge or rewrite its outcome audit.
   */
  async completePolicyPreview(input: {
    reservationId: string;
    result: AiPolicyImpactPreviewDto;
    resultDigest: string;
    transaction?: Prisma.TransactionClient;
  }): Promise<void> {
    let lease: VeraLease | null = null;
    try {
      const run = async (tx: Prisma.TransactionClient) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM ai_report_reservations WHERE id = ${input.reservationId}::uuid FOR UPDATE
        `;
        if (!rows[0]) throw reportDbError("report_unavailable", false, input.reservationId);
        const current = asStoredReservation(await tx.aiReportReservation.findUnique({ where: { id: input.reservationId } }));
        if (!current) throw reportDbError("report_unavailable", false, input.reservationId);
        if (current.state === AiReportReservationState.completed && current.resultKind === AiReportReservationResultKind.policy_preview) return;
        if (current.state !== AiReportReservationState.reserved || !current.recoveryLeaseOwner || current.recoveryFenceToken === null) throw reportDbError("report_process_lost", false, input.reservationId);
        const dbNow = await databaseNow(tx);
        if (current.recoveryDeadlineAt <= dbNow) throw reportDbError("report_process_lost", false, input.reservationId);
        lease = { key: leaseKey(current.adminPrincipalId, REPORT_REDIS_FEATURE), ownerId: current.recoveryLeaseOwner, fencingToken: current.recoveryFenceToken, expiresAt: current.recoveryDeadlineAt };
        const reservationAudit = await tx.aiAdminReportAudit.findFirst({ where: { reservationId: current.id, eventType: AiAdminReportEventType.reservation }, select: { displayTimezone: true, localDateSpan: true } });
        if (!reservationAudit || !reservationAudit.localDateSpan || typeof reservationAudit.localDateSpan !== "object" || Array.isArray(reservationAudit.localDateSpan)) throw reportDbError("report_unavailable", false, input.reservationId);
        const span = reservationAudit.localDateSpan as { from?: unknown; to?: unknown };
        if (typeof span.from !== "string" || typeof span.to !== "string") throw reportDbError("report_unavailable", false, input.reservationId);
        const query = parseAdminUsageQuery(new URLSearchParams({ from: span.from, to: span.to, timezone: reservationAudit.displayTimezone }), dbNow);
        const snapshot = { kind: "policy_preview", dto: input.result };
        const digest = sha256Hex(canonicalJson(snapshot));
        if (input.resultDigest !== digest || input.result.mode !== "aggregate" || input.result.reservationId !== current.id) throw reportDbError("report_unavailable", false, input.reservationId);
        await tx.aiReportReservation.update({
          where: { id: current.id },
          data: {
            state: AiReportReservationState.completed,
            resultKind: AiReportReservationResultKind.policy_preview,
            resultSnapshot: snapshot,
            resultDigest: digest,
            completedAt: dbNow,
            expiresAt: new Date(dbNow.getTime() + VERA_REPORT_REPLAY_TTL_DAYS * 86_400_000),
            recoveryLeaseOwner: null,
            recoveryFenceToken: null,
            version: { increment: 1 },
          },
        });
        const existingAudit = await tx.aiAdminReportAudit.findFirst({
          where: { reservationId: current.id, eventType: AiAdminReportEventType.outcome },
          select: { id: true },
        });
        if (!existingAudit) {
          const outcomeState = suppressionStateForOutcome(input.result.state === "partial_unavailable" ? "partial_unavailable" : input.result.state);
          await tx.aiAdminReportAudit.create({
            data: {
              actorId: current.adminPrincipalId,
              adminPrincipalId: current.adminPrincipalId,
              reservationId: current.id,
              eventType: AiAdminReportEventType.outcome,
              operation: AiAdminReportOperation.admin_policy_preview,
              policyBundleVersion: current.policyBundleVersion,
              queryFingerprint: current.requestFingerprint,
              queryShapeDigest: current.requestFingerprint,
              displayTimezone: query.timezone,
              rangeStart: dateOnly(query.from),
              rangeEnd: dateOnly(query.to),
              localDateSpan: { from: query.from, to: query.to },
              costUnits: current.costUnits,
              suppressionState: outcomeState,
              suppressionApplied: outcomeState === AiAdminReportSuppressionState.suppressed,
              resultDigest: digest,
            },
          });
        }
      };
      if (input.transaction) await run(input.transaction);
      else await this.db.$transaction(run);
    } finally {
      if (lease) {
        try { await this.leaseStore.release(lease); } catch { /* bounded expiry remains safe */ }
      }
    }
  }

  private async lookupReplay(input: { adminPrincipalId: string; idempotencyKey: string; fingerprint: string }): Promise<ReportResponse | null> {
    return this.db.$transaction(async (tx) => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM ai_report_reservations
        WHERE admin_principal_id = ${input.adminPrincipalId}::uuid
          AND operation = 'admin_report_query'::ai_admin_report_operation
          AND idempotency_key = ${input.idempotencyKey}
        FOR UPDATE
      `;
      const id = ids[0]?.id;
      if (!id) return null;
      const found = await tx.aiReportReservation.findUnique({ where: { id } });
      if (!found) return null;
      const row = asStoredReservation(found);
      const now = await databaseNow(tx);
      if (isExpired(row, now)) {
        if (row.state !== AiReportReservationState.expired) {
          await tx.aiReportReservation.update({
            where: { id: row.id },
            data: {
              state: AiReportReservationState.expired,
              resultKind: null,
              resultSnapshot: Prisma.DbNull,
              resultDigest: null,
              failureCode: null,
              recoveryLeaseOwner: null,
              recoveryFenceToken: null,
              version: { increment: 1 },
            },
          });
        }
        return { status: 409, body: { error: "idempotency_key_expired" } };
      }
      if (row.requestFingerprint !== input.fingerprint) return { status: 409, body: { error: "idempotency_conflict" } };
      if (row.state === AiReportReservationState.reserved && row.recoveryDeadlineAt <= now) {
        await this.markProcessLost(tx, row, now);
        const failed: VeraAdminReportFailureDto = { state: "error", code: "report_process_lost", retryable: false, reservationId: row.id };
        return { status: 503, body: failed };
      }
      return replayResponse(row);
    });
  }

  private async reserve(input: { adminPrincipalId: string; idempotencyKey: string; fingerprint: string; query: VeraAdminUsageQuery; costUnits: number }): Promise<ReservationCommit> {
    let lease: VeraLease | null = null;
    try {
      const committed = await this.db.$transaction(async (tx) => {
        const dbNow = await databaseNow(tx);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.adminPrincipalId}, 0))`;
        const replay = await tx.$queryRaw<Array<{ id: string; request_fingerprint: string }>>`
          SELECT id, request_fingerprint FROM ai_report_reservations
          WHERE admin_principal_id = ${input.adminPrincipalId}::uuid
            AND operation = 'admin_report_query'::ai_admin_report_operation
            AND idempotency_key = ${input.idempotencyKey}
          FOR UPDATE
        `;
        if (replay[0]) {
          if (replay[0].request_fingerprint !== input.fingerprint) throw new VeraAdminUsageError("idempotency_conflict", 409);
          throw new VeraAdminUsageError("idempotency_conflict", 409);
        }
        const effective = await activePolicy(tx, dbNow, input.adminPrincipalId);
        const budget = await this.lockOrCreateWindow(tx, input.adminPrincipalId, AiReportWindowKind.budget_24h, effective.policy, dbNow);
        const burst = await this.lockOrCreateWindow(tx, input.adminPrincipalId, AiReportWindowKind.burst_10m, effective.policy, dbNow);
        if (budget.usedBudgetUnits + input.costUnits > budget.budgetUnitsSnapshot) throw new VeraAdminUsageError("report_budget_exhausted", 429);
        if (burst.requestCount + 1 > effective.policy.reportConfig.requestLimit) throw new VeraAdminUsageError("report_burst_limited", 429);

        try {
          const acquired = this.leaseStore.acquireWithReason
            ? await this.leaseStore.acquireWithReason({
                studentId: input.adminPrincipalId,
                featureKey: REPORT_REDIS_FEATURE,
                maxConcurrent: 1,
                burstLimit: Math.max(0, effective.policy.reportConfig.requestLimit - burst.requestCount),
                burstWindowMs: VERA_REPORT_BURST_WINDOW_MS,
                ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2,
                now: dbNow,
              })
            : { lease: await this.leaseStore.acquire({ studentId: input.adminPrincipalId, featureKey: REPORT_REDIS_FEATURE, maxConcurrent: 1, burstLimit: Math.max(0, effective.policy.reportConfig.requestLimit - burst.requestCount), burstWindowMs: VERA_REPORT_BURST_WINDOW_MS, ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2, now: dbNow }) };
          if (!acquired.lease) {
            if (acquired.rejectionReason === "burst") throw new VeraAdminUsageError("report_burst_limited", 429);
            throw reportDbError("report_unavailable");
          }
          lease = acquired.lease;
        } catch (error) {
          if (error instanceof VeraAdminUsageError) throw error;
          if (error instanceof VeraRedisUnavailableError) throw reportDbError("report_unavailable");
          throw reportDbError("report_unavailable");
        }

        const postRedisNow = await databaseNow(tx);
        const postEffective = await activePolicy(tx, postRedisNow, input.adminPrincipalId);
        if (postEffective.policy.bundleVersion !== effective.policy.bundleVersion) throw reportDbError("report_unavailable", true);
        const postBudget = await this.lockOrCreateWindow(tx, input.adminPrincipalId, AiReportWindowKind.budget_24h, postEffective.policy, postRedisNow);
        const postBurst = await this.lockOrCreateWindow(tx, input.adminPrincipalId, AiReportWindowKind.burst_10m, postEffective.policy, postRedisNow);
        if (postBudget.usedBudgetUnits + input.costUnits > postBudget.budgetUnitsSnapshot) throw new VeraAdminUsageError("report_budget_exhausted", 429);
        if (postBurst.requestCount + 1 > postEffective.policy.reportConfig.requestLimit) throw new VeraAdminUsageError("report_burst_limited", 429);

        const reservation = await tx.aiReportReservation.create({
          data: {
            adminPrincipalId: input.adminPrincipalId,
            operation: AiAdminReportOperation.admin_report_query,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.fingerprint,
            fingerprintKeyVersion: VERA_REPORT_FINGERPRINT_KEY_VERSION,
            policyBundleVersion: postEffective.policy.bundleVersion,
            costUnits: input.costUnits,
            state: AiReportReservationState.reserved,
            reservedAt: postRedisNow,
            recoveryDeadlineAt: new Date(postRedisNow.getTime() + VERA_REPORT_RECOVERY_LEASE_MS),
            recoveryLeaseOwner: lease.ownerId,
            recoveryFenceToken: lease.fencingToken,
          },
        });
        await tx.aiReportBudgetWindow.update({ where: { id: postBudget.id }, data: { usedBudgetUnits: { increment: input.costUnits }, requestCount: { increment: 1 }, consumedUnits: { increment: input.costUnits }, consumedRequests: { increment: 1 }, version: { increment: 1 } } });
        await tx.aiReportBudgetWindow.update({ where: { id: postBurst.id }, data: { requestCount: { increment: 1 }, consumedRequests: { increment: 1 }, version: { increment: 1 } } });
        await tx.aiAdminReportAudit.create({
          data: {
            actorId: input.adminPrincipalId,
            adminPrincipalId: input.adminPrincipalId,
            reservationId: reservation.id,
            eventType: AiAdminReportEventType.reservation,
            operation: AiAdminReportOperation.admin_report_query,
            policyBundleVersion: postEffective.policy.bundleVersion,
            queryFingerprint: input.fingerprint,
            queryShapeDigest: input.fingerprint,
            displayTimezone: input.query.timezone,
            rangeStart: dateOnly(input.query.from),
            rangeEnd: dateOnly(input.query.to),
            localDateSpan: { from: input.query.from, to: input.query.to },
            costUnits: input.costUnits,
            suppressionState: AiAdminReportSuppressionState.not_evaluated,
            suppressionApplied: false,
          },
        });
        return { reservation: asStoredReservation(reservation), policy: postEffective.policy, scheduledPolicy: postEffective.scheduledPolicy, dbNow: postRedisNow };
      });
      if (!lease) throw reportDbError("report_unavailable");
      return { ...committed, query: input.query, lease };
    } catch (error) {
      if (lease) {
        try { await this.leaseStore.release(lease); } catch { /* bounded lease expiry */ }
      }
      if (error instanceof VeraAdminUsageError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new VeraAdminUsageError("idempotency_conflict", 409);
      throw reportDbError("report_unavailable");
    }
  }

  private async lockOrCreateWindow(tx: Prisma.TransactionClient, principalId: string, kind: AiReportWindowKind, policy: VeraReportPolicy, now: Date) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM ai_report_budget_windows
      WHERE principal_key = ${principalId}
        AND window_kind = ${kind}::ai_report_window_kind
        AND window_ends_at > ${now}
      ORDER BY window_started_at DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (rows[0]) {
      const current = await tx.aiReportBudgetWindow.findUnique({ where: { id: rows[0].id } });
      if (current) return current;
    }
    await tx.aiReportBudgetWindow.updateMany({ where: { principalKey: principalId, windowKind: kind, windowEndsAt: { lte: now }, state: { not: "expired" } }, data: { state: "expired" } });
    const durationMs = kind === AiReportWindowKind.budget_24h ? 24 * 60 * 60_000 : VERA_REPORT_BURST_WINDOW_MS;
    return tx.aiReportBudgetWindow.create({
      data: {
        principalKey: principalId,
        windowKind: kind,
        policyBundleVersion: policy.bundleVersion,
        state: AiReportBudgetState.active,
        windowStartedAt: now,
        windowEndsAt: new Date(now.getTime() + durationMs),
        windowExpiresAt: new Date(now.getTime() + durationMs),
        budgetUnitsSnapshot: policy.reportConfig.unitLimit,
        usedBudgetUnits: 0,
        requestCount: 0,
        consumedUnits: 0,
        consumedRequests: 0,
        unitLimit: policy.reportConfig.unitLimit,
        requestLimit: policy.reportConfig.requestLimit,
      },
    });
  }

  private async executeAggregate(query: VeraAdminUsageQuery, policy: VeraReportPolicy, scheduledPolicy: { bundleVersion: string; effectiveAt: Date } | null) {
    // The reservation is already durable at this point. A report partition
    // may therefore fail independently; complete a 200 DTO with a generic
    // unavailable partition instead of turning a post-reservation read fault
    // into a whole-response failure. Never expose raw database error text.
    let current: Date;
    try {
      current = await databaseNow(this.db);
    } catch {
      current = new Date();
    }
    const requestSelect = {
      id: true,
      studentId: true,
      createdAt: true,
      featureKey: true,
      gateway: true,
      upstreamProvider: true,
      model: true,
      status: true,
      inputTokens: true,
      outputTokens: true,
      quotaUnitsReserved: true,
      quotaUnitsConsumed: true,
      quotaOverrunUnits: true,
      tokenUsageState: true,
      usageAccountingState: true,
      latencyMs: true,
      timeToFirstTokenMs: true,
      settlementDeadlineAt: true,
    } as const;
    const admissionSelect = {
      id: true,
      studentId: true,
      occurredAt: true,
      featureKey: true,
      gateway: true,
      upstreamProvider: true,
      model: true,
      reason: true,
    } as const;
    const requestWhere = (start: Date, end: Date) => ({ createdAt: { gte: start, lt: end }, ...(query.feature !== "all" ? { featureKey: query.feature } : {}), ...(query.gateway !== "all" ? { gateway: query.gateway === "unknown" ? null : query.gateway } : {}), ...(query.upstreamProvider !== "all" ? { upstreamProvider: query.upstreamProvider === "unknown" ? null : query.upstreamProvider } : {}), ...(query.model !== "all" ? { model: query.model === "unknown" ? null : query.model } : {}), ...(query.status !== "all" ? { status: query.status } : {}) });
    const admissionWhere = (start: Date, end: Date) => ({ occurredAt: { gte: start, lt: end }, ...(query.feature !== "all" ? { featureKey: query.feature } : {}), ...(query.gateway !== "all" ? { gateway: query.gateway === "unknown" ? null : query.gateway } : {}), ...(query.upstreamProvider !== "all" ? { upstreamProvider: query.upstreamProvider === "unknown" ? null : query.upstreamProvider } : {}), ...(query.model !== "all" ? { model: query.model === "unknown" ? null : query.model } : {}) });
    const read = <T,>(partition: VeraAggregateReadPartition, operation: () => Promise<T[]>): Promise<T[]> => Promise.resolve().then(async () => {
      await this.beforeAggregateRead(partition);
      return operation();
    });
    const reads = await Promise.allSettled([
      read("requests", () => this.db.aiRequest.findMany({ where: requestWhere(query.utcStart, query.utcEnd), select: requestSelect, take: 100_001 })),
      read("admissions", () => this.db.aiAdmissionEvent.findMany({ where: admissionWhere(query.utcStart, query.utcEnd), select: admissionSelect, take: 100_001 })),
      query.include.has("comparison") ? read("previousRequests", () => this.db.aiRequest.findMany({ where: requestWhere(query.previousUtcStart, query.previousUtcEnd), select: requestSelect, take: 100_001 })) : Promise.resolve([]),
    ]);
    const requestRead = reads[0];
    const admissionRead = reads[1];
    const previousRequestRead = reads[2];
    const requests = requestRead.status === "fulfilled" && requestRead.value.length <= 100_000 ? requestRead.value : [];
    const admissions = admissionRead.status === "fulfilled" && admissionRead.value.length <= 100_000 ? admissionRead.value : [];
    const previousRequests = previousRequestRead.status === "fulfilled" && previousRequestRead.value.length <= 100_000 ? previousRequestRead.value : [];
    const requestUnavailable = requestRead.status === "rejected" || (requestRead.status === "fulfilled" && requestRead.value.length > 100_000);
    const admissionUnavailable = admissionRead.status === "rejected" || (admissionRead.status === "fulfilled" && admissionRead.value.length > 100_000);
    const previousRequestUnavailable = query.include.has("comparison") && (previousRequestRead.status === "rejected" || (previousRequestRead.status === "fulfilled" && previousRequestRead.value.length > 100_000));
    const typedRequests = requests as unknown as VeraAdminReportDbRow[];
    const typedAdmissions = admissions as unknown as VeraAdminAdmissionDbRow[];
    const typedPreviousRequests = previousRequests as unknown as VeraAdminReportDbRow[];
    const allTimes = [...typedRequests.map((row) => row.createdAt), ...typedAdmissions.map((row) => row.occurredAt)];
    const lastUpdatedAt = allTimes.length > 0 ? new Date(Math.max(...allTimes.map((value) => value.getTime()))) : null;
    const built = buildAdminUsageDto({ query, sources: { requests: typedRequests, admissions: typedAdmissions, previousRequests: typedPreviousRequests, now: current, lastUpdatedAt }, policy, scheduledPolicy });
    const unavailablePartition = (): { state: "unavailable"; reason: string } => ({ state: "unavailable", reason: "partition_unavailable" });
    if (requestUnavailable) {
      built.dto.summary = unavailablePartition();
      built.dto.dailyTrend = unavailablePartition();
      built.dto.byFeature = unavailablePartition();
      built.dto.byModel = unavailablePartition();
      built.dto.byStatus = unavailablePartition();
      built.dto.latency = unavailablePartition();
      // Incidents combine request and admission cohorts, so a partial
      // incidents partition would carry a misleading denominator.
      built.dto.incidents = unavailablePartition();
      if (query.include.has("comparison")) built.dto.comparison = unavailablePartition();
    }
    if (admissionUnavailable) built.dto.incidents = unavailablePartition();
    if (previousRequestUnavailable && query.include.has("comparison")) built.dto.comparison = unavailablePartition();
    const partitions = [built.dto.summary, built.dto.dailyTrend, built.dto.byFeature, built.dto.byModel, built.dto.byStatus, built.dto.latency, built.dto.incidents, built.dto.comparison];
    const hasUnavailable = partitions.some((partition) => partition.state === "unavailable" && partition.reason !== "not_requested");
    const hasSuppressed = partitions.some((partition) => partition.state === "suppressed");
    const outcome: VeraReportOutcomeState = hasUnavailable
      ? "partial_unavailable"
      : hasSuppressed
        ? "suppressed"
        : built.outcome;
    return { dto: built.dto, outcome, resultDigest: sha256Hex(canonicalJson({ kind: "report", dto: built.dto })) };
  }

  private async completeReservation(commit: ReservationCommit, dto: VeraAdminUsageDto, outcome: VeraReportOutcomeState, resultDigest: string): Promise<boolean> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM ai_report_reservations WHERE id = ${commit.reservation.id}::uuid FOR UPDATE`;
      if (!rows[0]) return false;
      const current = asStoredReservation(await tx.aiReportReservation.findUnique({ where: { id: commit.reservation.id } }));
      const dbNow = await databaseNow(tx);
      if (!current || current.state !== AiReportReservationState.reserved || current.recoveryLeaseOwner !== commit.lease.ownerId || current.recoveryFenceToken !== commit.lease.fencingToken || current.recoveryDeadlineAt <= dbNow) return false;
      await tx.aiReportReservation.update({ where: { id: current.id }, data: { state: AiReportReservationState.completed, resultKind: AiReportReservationResultKind.report, resultSnapshot: { kind: "report", dto }, resultDigest, completedAt: dbNow, expiresAt: new Date(dbNow.getTime() + VERA_REPORT_REPLAY_TTL_DAYS * 86_400_000), recoveryLeaseOwner: null, recoveryFenceToken: null, version: { increment: 1 } } });
      await this.createOutcomeAudit(tx, current, commit, suppressionStateForOutcome(outcome), null, resultDigest);
      return true;
    });
  }

  private async failReservation(commit: ReservationCommit, code: string, retryable: boolean): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM ai_report_reservations WHERE id = ${commit.reservation.id}::uuid FOR UPDATE`;
      if (!rows[0]) return;
      const current = asStoredReservation(await tx.aiReportReservation.findUnique({ where: { id: commit.reservation.id } }));
      if (!current || current.state !== AiReportReservationState.reserved) return;
      const dbNow = await databaseNow(tx);
      const snapshot = { kind: "typed_error", state: "error", code, retryable, reservationId: current.id };
      const resultDigest = sha256Hex(canonicalJson(snapshot));
      await tx.aiReportReservation.update({ where: { id: current.id }, data: { state: AiReportReservationState.failed, resultKind: AiReportReservationResultKind.typed_error, resultSnapshot: snapshot, resultDigest, failureCode: code, completedAt: dbNow, expiresAt: new Date(dbNow.getTime() + VERA_REPORT_REPLAY_TTL_DAYS * 86_400_000), recoveryLeaseOwner: null, recoveryFenceToken: null, version: { increment: 1 } } });
      await this.createOutcomeAudit(tx, current, commit, AiAdminReportSuppressionState.failed, code, resultDigest);
    });
  }

  private async markProcessLost(tx: Prisma.TransactionClient, row: StoredReportReservation, now: Date): Promise<void> {
    // Recovery must never manufacture query metadata.  The reservation audit
    // is the immutable source for the exact range/timezone/shape captured at
    // admission; legacy or corrupt rows fail closed and remain available for
    // an operator reaper rather than receiving a fabricated epoch/UTC result.
    const reservationAudit = await tx.aiAdminReportAudit.findFirst({
      where: { reservationId: row.id, eventType: AiAdminReportEventType.reservation },
      select: {
        operation: true,
        policyBundleVersion: true,
        queryFingerprint: true,
        queryShapeDigest: true,
        displayTimezone: true,
        rangeStart: true,
        rangeEnd: true,
        localDateSpan: true,
        costUnits: true,
      },
    });
    if (
      !reservationAudit
      || reservationAudit.operation !== AiAdminReportOperation.admin_report_query
      || !reservationAudit.queryShapeDigest
      || typeof reservationAudit.displayTimezone !== "string"
      || !reservationAudit.localDateSpan
      || typeof reservationAudit.localDateSpan !== "object"
      || Array.isArray(reservationAudit.localDateSpan)
    ) {
      throw reportDbError("report_unavailable", false, row.id);
    }
    const span = reservationAudit.localDateSpan as { from?: unknown; to?: unknown };
    if (typeof span.from !== "string" || typeof span.to !== "string") {
      throw reportDbError("report_unavailable", false, row.id);
    }
    let query: VeraAdminUsageQuery;
    try {
      query = parseAdminUsageQuery(
        new URLSearchParams({ from: span.from, to: span.to, timezone: reservationAudit.displayTimezone }),
        now,
      );
    } catch {
      throw reportDbError("report_unavailable", false, row.id);
    }
    const snapshot = { kind: "typed_error", state: "error", code: "report_process_lost", retryable: false, reservationId: row.id };
    const resultDigest = sha256Hex(canonicalJson(snapshot));
    await tx.aiReportReservation.update({ where: { id: row.id }, data: { state: AiReportReservationState.process_lost, resultKind: AiReportReservationResultKind.typed_error, resultSnapshot: snapshot, resultDigest, failureCode: "report_process_lost", completedAt: now, expiresAt: new Date(now.getTime() + VERA_REPORT_REPLAY_TTL_DAYS * 86_400_000), recoveryLeaseOwner: null, recoveryFenceToken: null, version: { increment: 1 } } });
    const audit = await tx.aiAdminReportAudit.findFirst({ where: { reservationId: row.id, eventType: AiAdminReportEventType.outcome }, select: { id: true } });
    if (!audit) {
      await tx.aiAdminReportAudit.create({ data: { actorId: row.adminPrincipalId, adminPrincipalId: row.adminPrincipalId, reservationId: row.id, eventType: AiAdminReportEventType.outcome, operation: reservationAudit.operation, policyBundleVersion: reservationAudit.policyBundleVersion, queryFingerprint: reservationAudit.queryFingerprint, queryShapeDigest: reservationAudit.queryShapeDigest, displayTimezone: query.timezone, rangeStart: reservationAudit.rangeStart, rangeEnd: reservationAudit.rangeEnd, localDateSpan: { from: query.from, to: query.to }, costUnits: reservationAudit.costUnits, suppressionState: AiAdminReportSuppressionState.process_lost, suppressionApplied: false, outcomeCode: "report_process_lost", resultDigest } });
    }
  }

  private async createOutcomeAudit(tx: Prisma.TransactionClient, row: StoredReportReservation, commit: ReservationCommit, suppressionState: AiAdminReportSuppressionState, outcomeCode: string | null, resultDigest: string) {
    const existing = await tx.aiAdminReportAudit.findFirst({ where: { reservationId: row.id, eventType: AiAdminReportEventType.outcome }, select: { id: true } });
    if (existing) return;
    await tx.aiAdminReportAudit.create({ data: { actorId: row.adminPrincipalId, adminPrincipalId: row.adminPrincipalId, reservationId: row.id, eventType: AiAdminReportEventType.outcome, operation: AiAdminReportOperation.admin_report_query, policyBundleVersion: row.policyBundleVersion, queryFingerprint: row.requestFingerprint, queryShapeDigest: row.requestFingerprint, displayTimezone: commit.query.timezone, rangeStart: dateOnly(commit.query.from), rangeEnd: dateOnly(commit.query.to), localDateSpan: { from: commit.query.from, to: commit.query.to }, costUnits: row.costUnits, suppressionState, suppressionApplied: suppressionState === AiAdminReportSuppressionState.suppressed, outcomeCode, resultDigest } });
  }
}

/**
 * Lazily construct the production adapter so read-only policy metadata and
 * categorical previews do not require a Redis connection. Aggregate previews
 * still fail closed when the command-local Redis URL is absent or unavailable.
 */
export function createPolicyPreviewReservationAdapter(
  input: { db?: PrismaClient; leaseStore?: VeraLeaseStore; hmacSecret?: string } = {},
): PreviewReservationAdapter {
  let service: VeraAdminUsageService | null = null;
  const getService = () => {
    service ??= new VeraAdminUsageService(input);
    return service;
  };
  return {
    reserveAggregate: (reservationInput) => getService().reservePolicyPreview(reservationInput),
    completeAggregate: (completionInput) => getService().completePolicyPreview(completionInput),
  };
}

function createDefaultReportLeaseStore(): VeraLeaseStore {
  const testMemory = process.env.NODE_ENV !== "production"
    && process.env.VERA_DISPOSABLE_DB_ACK === "1"
    && process.env.VERA_REPORT_REDIS_IN_MEMORY === "1";
  if (testMemory) return new InMemoryVeraLeaseStore();
  const url = process.env.VERA_DISPOSABLE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();
  if (!url) throw new VeraRedisUnavailableError("A report Redis URL is required.");
  return new IORedisVeraLeaseStore(url);
}

export { createDefaultReportLeaseStore };
