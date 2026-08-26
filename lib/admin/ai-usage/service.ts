import "server-only";

import {
  AiAdminReportEventType,
  AiAdminReportOperation,
  AiAdminReportSuppressionState,
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
  type VeraLease,
  type VeraLeaseStore,
} from "@/lib/vera-ai/redis-lease";
import { canonicalJson, sha256Hex } from "@/lib/vera-ai/contracts";
import type { AiPolicyImpactPreviewDto, PreviewReservationAdapter } from "@/lib/admin/ai-policy/contracts";
import { parseCompletePolicyConfig } from "@/lib/admin/ai-policy/validation";

import { buildAdminUsageDto } from "./aggregate";
import {
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
  const rows = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw reportDbError("report_unavailable");
  return now;
}

async function activePolicy(db: ReportDb, now: Date): Promise<{ policy: VeraReportPolicy; scheduledPolicy: { bundleVersion: string; effectiveAt: Date } | null }> {
  const rows = await db.aiPolicyBundle.findMany({
    where: { state: { in: ["active", "scheduled"] }, effectiveAt: { lte: now } },
    orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
    take: 2,
  });
  if (rows.length !== 1 || !rows[0]) throw reportDbError("report_unavailable", false);
  const row = rows[0];
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

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function previewAuditQuery(asOf: Date): VeraAdminUsageQuery {
  const day = asOf.toISOString().slice(0, 10);
  const nextDay = new Date(asOf.getTime() + 86_400_000).toISOString().slice(0, 10);
  return parseAdminUsageQuery(new URLSearchParams({ from: day, to: nextDay, timezone: "UTC" }), asOf);
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
  if (snapshot.kind !== "typed_error" || snapshot.state !== "error" || typeof snapshot.code !== "string") {
    return { state: "error", code: row.failureCode ?? "report_unavailable", retryable: false, reservationId: row.id };
  }
  return {
    state: "error",
    code: snapshot.code,
    retryable: snapshot.retryable === true,
    reservationId: row.id,
  };
}

function asStoredReservation(value: unknown): StoredReportReservation {
  return value as StoredReportReservation;
}

function isExpired(row: StoredReportReservation, now: Date): boolean {
  return row.state === AiReportReservationState.expired || Boolean(row.expiresAt && row.expiresAt <= now);
}

function replayResponse(row: StoredReportReservation): ReportResponse {
  if (row.state === AiReportReservationState.completed && row.resultKind === AiReportReservationResultKind.report) {
    const snapshot = row.resultSnapshot as { kind?: string; dto?: VeraAdminUsageDto } | null;
    if (snapshot?.kind === "report" && snapshot.dto) return { status: 200, body: snapshot.dto };
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
  private readonly policyPreviewLeases = new Map<string, VeraLease>();

  constructor(input: { db?: PrismaClient; leaseStore?: VeraLeaseStore; hmacSecret?: string } = {}) {
    this.db = input.db ?? defaultPrisma;
    this.hmacSecret = input.hmacSecret ?? process.env.VERA_IDEMPOTENCY_HMAC_SECRET ?? "";
    this.leaseStore = input.leaseStore ?? createDefaultReportLeaseStore();
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
  }): Promise<{ reservationId: string }> {
    if (!isSafeReportKey(input.clientRequestId)) {
      throw new VeraAdminUsageError("missing_idempotency_key", 400, false);
    }

    const query = previewAuditQuery(input.asOf);
    let lease: VeraLease | null = null;
    let createdReservationId: string | null = null;
    try {
      const reservation = await this.db.$transaction(async (tx) => {
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

        const effective = await activePolicy(tx, dbNow);
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
              burstLimit: effective.policy.reportConfig.requestLimit,
              burstWindowMs: VERA_REPORT_BURST_WINDOW_MS,
              ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2,
              now: dbNow,
            })
          : { lease: await this.leaseStore.acquire({
              studentId: input.principalId,
              featureKey: REPORT_REDIS_FEATURE,
              maxConcurrent: 1,
              burstLimit: effective.policy.reportConfig.requestLimit,
              burstWindowMs: VERA_REPORT_BURST_WINDOW_MS,
              ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2,
              now: dbNow,
            }) };
        if (!acquired.lease) {
          if (acquired.rejectionReason === "burst") throw new VeraAdminUsageError("report_burst_limited", 429);
          throw reportDbError("report_unavailable");
        }
        lease = acquired.lease;

        const created = await tx.aiReportReservation.create({
          data: {
            adminPrincipalId: input.principalId,
            operation: AiAdminReportOperation.admin_policy_preview,
            idempotencyKey: input.clientRequestId,
            requestFingerprint: input.requestFingerprint,
            fingerprintKeyVersion: VERA_REPORT_FINGERPRINT_KEY_VERSION,
            policyBundleVersion: input.policyBundleVersion,
            costUnits: input.costUnits,
            state: AiReportReservationState.reserved,
            reservedAt: dbNow,
            recoveryDeadlineAt: new Date(dbNow.getTime() + VERA_REPORT_RECOVERY_LEASE_MS),
            recoveryLeaseOwner: lease.ownerId,
            recoveryFenceToken: lease.fencingToken,
          },
        });
        await tx.aiReportBudgetWindow.update({
          where: { id: budget.id },
          data: {
            usedBudgetUnits: { increment: input.costUnits },
            requestCount: { increment: 1 },
            consumedUnits: { increment: input.costUnits },
            consumedRequests: { increment: 1 },
            version: { increment: 1 },
          },
        });
        await tx.aiReportBudgetWindow.update({
          where: { id: burst.id },
          data: { requestCount: { increment: 1 }, consumedRequests: { increment: 1 }, version: { increment: 1 } },
        });
        await tx.aiAdminReportAudit.create({
          data: {
            actorId: input.principalId,
            adminPrincipalId: input.principalId,
            reservationId: created.id,
            eventType: AiAdminReportEventType.reservation,
            operation: AiAdminReportOperation.admin_policy_preview,
            policyBundleVersion: input.policyBundleVersion,
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
        createdReservationId = created.id;
        return created.id;
      });
      if (createdReservationId && lease) this.policyPreviewLeases.set(createdReservationId, lease);
      return { reservationId: reservation };
    } catch (error) {
      if (createdReservationId) this.policyPreviewLeases.delete(createdReservationId);
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
  }): Promise<void> {
    const query = previewAuditQuery(new Date(input.result.asOf));
    const lease = this.policyPreviewLeases.get(input.reservationId);
    try {
      await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM ai_report_reservations WHERE id = ${input.reservationId}::uuid FOR UPDATE
        `;
        if (!rows[0]) throw reportDbError("report_unavailable", false, input.reservationId);
        const current = asStoredReservation(await tx.aiReportReservation.findUnique({ where: { id: input.reservationId } }));
        if (!current) throw reportDbError("report_unavailable", false, input.reservationId);
        if (current.state === AiReportReservationState.completed && current.resultKind === AiReportReservationResultKind.policy_preview) return;
        if (current.state !== AiReportReservationState.reserved || !lease) throw reportDbError("report_process_lost", false, input.reservationId);
        const dbNow = await databaseNow(tx);
        if (
          current.recoveryDeadlineAt <= dbNow
          || current.recoveryLeaseOwner !== lease.ownerId
          || current.recoveryFenceToken !== lease.fencingToken
        ) throw reportDbError("report_process_lost", false, input.reservationId);
        const snapshot = { kind: "policy_preview", dto: input.result };
        const digest = sha256Hex(canonicalJson(snapshot));
        if (input.resultDigest !== digest) throw reportDbError("report_unavailable", false, input.reservationId);
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
              suppressionState: AiAdminReportSuppressionState.ready,
              suppressionApplied: false,
              resultDigest: digest,
            },
          });
        }
      });
    } finally {
      if (lease) {
        this.policyPreviewLeases.delete(input.reservationId);
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
        const effective = await activePolicy(tx, dbNow);
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
                burstLimit: effective.policy.reportConfig.requestLimit,
                burstWindowMs: VERA_REPORT_BURST_WINDOW_MS,
                ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2,
                now: dbNow,
              })
            : { lease: await this.leaseStore.acquire({ studentId: input.adminPrincipalId, featureKey: REPORT_REDIS_FEATURE, maxConcurrent: 1, burstLimit: effective.policy.reportConfig.requestLimit, burstWindowMs: VERA_REPORT_BURST_WINDOW_MS, ttlMs: VERA_REPORT_RECOVERY_LEASE_MS * 2, now: dbNow }) };
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

        const reservation = await tx.aiReportReservation.create({
          data: {
            adminPrincipalId: input.adminPrincipalId,
            operation: AiAdminReportOperation.admin_report_query,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.fingerprint,
            fingerprintKeyVersion: VERA_REPORT_FINGERPRINT_KEY_VERSION,
            policyBundleVersion: effective.policy.bundleVersion,
            costUnits: input.costUnits,
            state: AiReportReservationState.reserved,
            reservedAt: dbNow,
            recoveryDeadlineAt: new Date(dbNow.getTime() + VERA_REPORT_RECOVERY_LEASE_MS),
            recoveryLeaseOwner: lease.ownerId,
            recoveryFenceToken: lease.fencingToken,
          },
        });
        await tx.aiReportBudgetWindow.update({ where: { id: budget.id }, data: { usedBudgetUnits: { increment: input.costUnits }, requestCount: { increment: 1 }, consumedUnits: { increment: input.costUnits }, consumedRequests: { increment: 1 }, version: { increment: 1 } } });
        await tx.aiReportBudgetWindow.update({ where: { id: burst.id }, data: { requestCount: { increment: 1 }, consumedRequests: { increment: 1 }, version: { increment: 1 } } });
        await tx.aiAdminReportAudit.create({
          data: {
            actorId: input.adminPrincipalId,
            adminPrincipalId: input.adminPrincipalId,
            reservationId: reservation.id,
            eventType: AiAdminReportEventType.reservation,
            operation: AiAdminReportOperation.admin_report_query,
            policyBundleVersion: effective.policy.bundleVersion,
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
        return { reservation: asStoredReservation(reservation), policy: effective.policy, scheduledPolicy: effective.scheduledPolicy, dbNow };
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
    const current = await databaseNow(this.db);
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
    const [requests, admissions, previousRequests, previousAdmissions] = await Promise.all([
      this.db.aiRequest.findMany({ where: requestWhere(query.utcStart, query.utcEnd), select: requestSelect, take: 100_001 }),
      this.db.aiAdmissionEvent.findMany({ where: admissionWhere(query.utcStart, query.utcEnd), select: admissionSelect, take: 100_001 }),
      query.include.has("comparison") ? this.db.aiRequest.findMany({ where: requestWhere(query.previousUtcStart, query.previousUtcEnd), select: requestSelect, take: 100_001 }) : Promise.resolve([]),
      query.include.has("comparison") ? this.db.aiAdmissionEvent.findMany({ where: admissionWhere(query.previousUtcStart, query.previousUtcEnd), select: admissionSelect, take: 100_001 }) : Promise.resolve([]),
    ]);
    if (requests.length > 100_000 || admissions.length > 100_000 || previousRequests.length > 100_000 || previousAdmissions.length > 100_000) throw reportDbError("report_unavailable");
    const typedRequests = requests as unknown as VeraAdminReportDbRow[];
    const typedAdmissions = admissions as unknown as VeraAdminAdmissionDbRow[];
    const typedPreviousRequests = previousRequests as unknown as VeraAdminReportDbRow[];
    const typedPreviousAdmissions = previousAdmissions as unknown as VeraAdminAdmissionDbRow[];
    const allTimes = [...typedRequests.map((row) => row.createdAt), ...typedAdmissions.map((row) => row.occurredAt)];
    const lastUpdatedAt = allTimes.length > 0 ? new Date(Math.max(...allTimes.map((value) => value.getTime()))) : null;
    const built = buildAdminUsageDto({ query, sources: { requests: typedRequests, admissions: typedAdmissions, previousRequests: typedPreviousRequests, previousAdmissions: typedPreviousAdmissions, now: current, lastUpdatedAt }, policy, scheduledPolicy });
    return { ...built, resultDigest: sha256Hex(canonicalJson({ kind: "report", dto: built.dto })) };
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
    const snapshot = { kind: "typed_error", state: "error", code: "report_process_lost", retryable: false, reservationId: row.id };
    const resultDigest = sha256Hex(canonicalJson(snapshot));
    await tx.aiReportReservation.update({ where: { id: row.id }, data: { state: AiReportReservationState.process_lost, resultKind: AiReportReservationResultKind.typed_error, resultSnapshot: snapshot, resultDigest, failureCode: "report_process_lost", completedAt: now, expiresAt: new Date(now.getTime() + VERA_REPORT_REPLAY_TTL_DAYS * 86_400_000), recoveryLeaseOwner: null, recoveryFenceToken: null, version: { increment: 1 } } });
    const audit = await tx.aiAdminReportAudit.findFirst({ where: { reservationId: row.id, eventType: AiAdminReportEventType.outcome }, select: { id: true } });
    if (!audit) {
      await tx.aiAdminReportAudit.create({ data: { actorId: row.adminPrincipalId, adminPrincipalId: row.adminPrincipalId, reservationId: row.id, eventType: AiAdminReportEventType.outcome, operation: AiAdminReportOperation.admin_report_query, policyBundleVersion: row.policyBundleVersion, queryFingerprint: row.requestFingerprint, queryShapeDigest: row.requestFingerprint, displayTimezone: "unknown", rangeStart: new Date("1970-01-01T00:00:00.000Z"), rangeEnd: new Date("1970-01-01T00:00:00.000Z"), costUnits: row.costUnits, suppressionState: AiAdminReportSuppressionState.process_lost, suppressionApplied: false, outcomeCode: "report_process_lost", resultDigest } });
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
