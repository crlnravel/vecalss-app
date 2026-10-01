import "server-only";

import { randomUUID } from "node:crypto";

import {
  AiConversationType,
  AiAttemptResultKind,
  AiAttemptState,
  AiContentLifecycleState,
  AiIdempotencyOperation,
  AiIdempotencyResultKind,
  AiIdempotencyState,
  AiRejectionClass,
  AiRequestLifecycleState,
  AiResultKind,
  AiResultStageState,
  AiSettlementKind,
  AiTokenUsageState,
  AiUsageAccountingState,
  AiUsageLedgerVersion,
  AiUsageWindowPeriodKind,
  AiUsageWindowState,
  AiMonetaryDebtState,
  AiReservationState,
  AiRequestBillingState,
  AiRequestAttemptStagePurpose,
  AiContextDecisionState,
  Prisma,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { VeraAdmissionError } from "./admission";
import { encryptPreparedContextPackAsync, type AutomaticContextPackSource, type PreparedContextPack } from "./context-pack";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import { VERA_FINGERPRINT_KEY_VERSION, canonicalJson, sha256Hex } from "./contracts";
import { resolveVeraQuotaLimit, snapshotVeraPolicy, type BillingPlan, type VeraPolicyBundle, type VeraPolicySnapshot } from "./policy";
import { quotaDateAndDayEnd } from "./quota";
import {
  assertReservationConservation,
  correctUnknownReservation,
  settleReservation,
  type ReservationAmounts,
} from "./billing";
import {
  deriveV2MonthWindow,
  deriveV2WindowKeys,
  ledgerVersionFor,
  nextMonthWindow,
  parseMonthWindowKey,
  toVeraUsageDto,
  VERA_CREDIT_USD_V2,
  VERA_CREDIT_USD_V2_EFFECTIVE_FROM,
  VERA_DAILY_CREDIT_LIMIT,
  VERA_MONTHLY_CREDIT_LIMIT,
  VERA_MONTHLY_COST_LIMIT_USD_MICROS,
  VERA_WEEKLY_CREDIT_LIMIT,
  type VeraUsageDto,
  type QuotaWindowSnapshot,
} from "./quota-v2";
import type { NormalizedVeraResult } from "./output-validator";
import type { VeraAutomaticContextGateSnapshot } from "./automatic-context-operations";
import { buildOpenRouterPaidRequestBytes, type PreparedProviderTask, type ProviderFailureEvidence, type ProviderResult } from "./provider";
import {
  VERA_CONTEXT_REGISTRY_VERSION,
  VERA_CONTEXT_RESOLVER_VERSION,
  VERA_CONTEXT_TOOL_NAME,
  VERA_CONTEXT_TOOL_SCHEMA_ID,
  type ContextToolResult,
} from "./context-tool-contracts";
import { encryptContextToolInvocationAsync, verifyContextToolInvocationDigests } from "./context-tool-invocation";
import { readLocalOutboundPayload, VERA_LOCAL_DECISION_COST_PROVENANCE, VERA_LOCAL_DECISION_PROTOCOL, type LocalContextCandidate, type LocalOutboundPayload, type LocalOutboundSource } from "./local-context-decision";
import { validateLocalSpan01Response, type LocalSpan01Decision, type LocalSpan01ResponseEnvelope, type PreparedLocalSpan01Request } from "./local-respan-selector";
import {
  VeraDurableResultError,
  createVeraDurableResultCallback,
  type VeraDurableCallbackResult,
} from "./durable-results";

type DbClient = typeof defaultPrisma;

export const VERA_DB_LOCK_ORDER = [
  "ai_idempotency_keys",
  "ai_usage_daily",
  "ai_requests",
  "ai_request_result_stages",
  "ai_messages_and_payloads",
] as const;

export type PersistPreparedAdmissionInput = {
  studentId: string;
  conversationId: string;
  clientRequestId: string;
  requestFingerprint: string;
  featureKey: string;
  requestType?: AiConversationType;
  behaviorVersion?: string;
  outputSchemaVersion?: string;
  outputSchemaId?: string;
  outputSchemaHash?: string;
  text: string;
  retryOfRequestId?: string | null;
  pack: PreparedContextPack;
  preparedProviderTask: PreparedProviderTask;
  policy: VeraPolicySnapshot;
  now: Date;
  retentionPolicyVersion?: string;
  stageRetentionExpiresAt?: Date;
  /** When true, admission creates the one request-owned invocation row in the
   * same transaction as the reservation and selector dispatch row. */
  automaticContext?: boolean;
  automaticContextGateSnapshot?: VeraAutomaticContextGateSnapshot;
  stagePurpose?: AiRequestAttemptStagePurpose;
  /** Metadata-only candidates persisted atomically with local admission. */
  localContextShortlist?: readonly LocalContextCandidate[];
  /** Exact canonical Respan request bytes are encrypted with the shortlist. */
  localSelectorRequest?: PreparedLocalSpan01Request;
  localSelectorPriceSnapshotDigest?: string;
};

export type PersistedAdmission = {
  accepted: boolean;
  requestId: string;
  idempotencyKeyId: string;
  userMessageId: string;
  contextPackId: string;
  usageDate: string;
  quotaUnitsReserved: number;
  rejectionCode?: string;
  preparedProviderTask?: PreparedProviderTask;
};

export type VeraV2QuotaReservation = {
  ledgerVersion: typeof VERA_CREDIT_USD_V2;
  requestId: string;
  creditCost: number;
  reservedUsdMicros: bigint;
  reservationIds: string[];
  usage: VeraUsageDto;
};

export type VeraV2QuotaSettlement = {
  requestId: string;
  state: "known" | "unknown" | "released" | "overrun";
  consumedCredits: number;
  chargedUsdMicros: bigint;
  unknownUsdMicros: bigint;
  overrunUsdMicros: bigint;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseMicrosString(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function providerRequestKeyFor(requestId: string, attemptNo: number): string {
  return sha256Hex(`vera-provider-request-key-v1:${requestId}:${attemptNo}`);
}

/**
 * Bind the write-ahead payload evidence to the exact paid HTTP body. The
 * selector and final automatic stages are the only stages that require this
 * stronger binding; the free/mock route deliberately keeps its existing
 * development-only evidence contract.
 */
function bindExactProviderPayload(prepared: PreparedProviderTask): { prepared: PreparedProviderTask; byteCount: number | null } {
  if (prepared.routingOptions.kind === "openrouter_free_poc" && prepared.preparedTask.outboundPayloadBytes instanceof Uint8Array) {
    const bytes = prepared.preparedTask.outboundPayloadBytes;
    const digest = sha256Hex(bytes);
    if (prepared.finalPayloadHash && prepared.finalPayloadHash !== digest) {
      throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
    }
    return { prepared: { ...prepared, finalPayloadHash: digest }, byteCount: bytes.byteLength };
  }
  if (!prepared.stagePurpose
    || prepared.routingOptions.kind === "openrouter_free_poc"
    || prepared.upstreamProvider !== "relace"
    || !prepared.providerRequestKey) {
    return { prepared, byteCount: null };
  }
  const bytes = buildOpenRouterPaidRequestBytes({ prepared, providerRequestKey: prepared.providerRequestKey });
  return {
    prepared: { ...prepared, finalPayloadHash: sha256Hex(bytes) },
    byteCount: bytes.byteLength,
  };
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new VeraAdmissionError({ code: "quota", status: 409, details: { field: name } });
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function policySnapshotIdentity(snapshot: VeraPolicySnapshot): string {
  return JSON.stringify({
    bundleVersion: snapshot.bundleVersion,
    planCode: snapshot.planCode,
    planSource: snapshot.planSource,
    quotaLimitUnits: snapshot.quotaLimitUnits,
    timezone: snapshot.timezone,
    timezonePolicyVersion: snapshot.timezonePolicyVersion,
    hardOutputQuotaUnits: snapshot.hardOutputQuotaUnits,
    maxProviderAttempts: snapshot.maxProviderAttempts,
    ledgerVersion: snapshot.ledgerVersion,
    creditCost: snapshot.creditCost,
    maxProviderCostUsdMicros: snapshot.maxProviderCostUsdMicros.toString(),
    policy: {
      configSchemaVersion: snapshot.policy.configSchemaVersion,
      state: snapshot.policy.state,
      effectiveAt: snapshot.policy.effectiveAt.toISOString(),
      validationDigest: snapshot.policy.validationDigest,
      quotaConfig: snapshot.policy.quotaConfig,
      settlementConfig: snapshot.policy.settlementConfig,
      reportConfig: snapshot.policy.reportConfig,
      retentionConfig: snapshot.policy.retentionConfig,
    },
  });
}

function assertPolicySnapshotStable(captured: VeraPolicySnapshot, current: VeraPolicySnapshot): void {
  if (policySnapshotIdentity(captured) !== policySnapshotIdentity(current)) {
    throw new VeraAdmissionError({ code: "policy_changed", status: 409, details: { capturedBundleVersion: captured.bundleVersion, currentBundleVersion: current.bundleVersion } });
  }
}

type V2WindowRow = {
  id: string;
  periodKind: AiUsageWindowPeriodKind;
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
  quotaTimezone: string;
  creditLimit: number;
  consumedCredits: number;
  reservedCredits: number;
  costLimitUsdMicros: bigint;
  reservedUsdMicros: bigint;
  settledUsdMicros: bigint;
  unknownUsdMicros: bigint;
  overrunUsdMicros: bigint;
  monetaryDebtState: AiMonetaryDebtState;
};

function v2WindowSnapshot(row: V2WindowRow): QuotaWindowSnapshot {
  return {
    id: row.id,
    periodKind: row.periodKind,
    windowKey: row.windowKey,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    quotaTimezone: row.quotaTimezone,
    creditLimit: row.creditLimit,
    costLimitUsdMicros: row.costLimitUsdMicros,
    consumedCredits: row.consumedCredits,
    reservedCredits: row.reservedCredits,
    releasedCredits: 0,
    reservedUsdMicros: row.reservedUsdMicros,
    settledUsdMicros: row.settledUsdMicros,
    unknownUsdMicros: row.unknownUsdMicros,
    releasedUsdMicros: 0n,
    overrunUsdMicros: row.overrunUsdMicros,
    monetaryDebtState: row.monetaryDebtState,
  };
}

function v2ReservationState(input: {
  settledUsdMicros: bigint;
  unknownUsdMicros: bigint;
  overrunUsdMicros: bigint;
  outcome: "known" | "unknown" | "released";
  forceOverrun?: boolean;
}): AiReservationState {
  if (input.forceOverrun) return AiReservationState.overrun;
  if (input.overrunUsdMicros > 0n) return AiReservationState.overrun;
  if (input.outcome === "unknown") return AiReservationState.unknown;
  if (input.outcome === "released") return AiReservationState.released;
  return AiReservationState.settled;
}

type V2AdmissionReservationInput = {
  studentId: string;
  requestId: string;
  now: Date;
  quotaTimezone: string;
  policyBundleVersion: string;
  quotaPolicyVersion: string;
  creditCost: number;
  maxProviderCostUsdMicros: bigint;
};

/**
 * Reserve the v2 windows inside an already-open admission transaction. The
 * public reserveV2Quota method below is useful to workers and callers that
 * already have a durable request; admission needs this transaction-bound
 * variant so request creation and quota reservation commit (or roll back)
 * together.
 */
async function reserveV2QuotaInAdmissionTransaction(
  tx: Prisma.TransactionClient,
  input: V2AdmissionReservationInput,
): Promise<string[]> {
  if (!Number.isSafeInteger(input.creditCost) || input.creditCost < 1) {
    throw new VeraAdmissionError({ code: "invalid_credit_cost", status: 422 });
  }
  if (input.maxProviderCostUsdMicros < 0n) {
    throw new VeraAdmissionError({ code: "invalid_provider_cost_reservation", status: 422 });
  }

  // First-use calendar bootstrap is serialized per student and ledger. The
  // caller already owns the idempotency/request/conversation rows.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.studentId} || ':' || ${VERA_CREDIT_USD_V2}, 0))`;
  await tx.aiQuotaCalendar.upsert({
    where: { studentId_ledgerVersion: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2 } },
    create: {
      studentId: input.studentId,
      ledgerVersion: VERA_CREDIT_USD_V2,
      quotaTimezone: input.quotaTimezone,
      effectiveFrom: VERA_CREDIT_USD_V2_EFFECTIVE_FROM,
    },
    update: {},
  });
  await tx.$queryRaw`SELECT id FROM ai_quota_calendars WHERE student_id = ${input.studentId}::uuid AND ledger_version = 'vera_credit_usd_v2'::ai_usage_ledger_version FOR UPDATE`;
  const calendar = await tx.aiQuotaCalendar.findUnique({
    where: { studentId_ledgerVersion: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2 } },
  });
  if (!calendar) throw new VeraAdmissionError({ code: "quota_calendar_invalid", status: 503 });

  const target = deriveV2WindowKeys(input.now, calendar.quotaTimezone);
  let monthly = calendar.currentMonthlyWindowId
    ? await tx.aiUsageWindow.findUnique({ where: { id: calendar.currentMonthlyWindowId } })
    : null;
  if (monthly && monthly.periodKind !== AiUsageWindowPeriodKind.month) {
    throw new VeraAdmissionError({ code: "quota_calendar_invalid", status: 503 });
  }
  if (monthly && monthly.windowKey > target.month.key) {
    throw new VeraAdmissionError({ code: "quota_calendar_invalid", status: 503 });
  }
  const monthlyData = (window: { key: string; start: Date; end: Date }) => ({
    studentId: input.studentId,
    ledgerVersion: VERA_CREDIT_USD_V2,
    periodKind: AiUsageWindowPeriodKind.month,
    windowKey: window.key,
    windowStart: window.start,
    windowEnd: window.end,
    quotaTimezone: calendar!.quotaTimezone,
    policyBundleVersion: input.policyBundleVersion,
    quotaPolicyVersion: input.quotaPolicyVersion,
    creditLimit: VERA_MONTHLY_CREDIT_LIMIT,
    costLimitUsdMicros: VERA_MONTHLY_COST_LIMIT_USD_MICROS,
  });
  if (!monthly) {
    monthly = await tx.aiUsageWindow.create({ data: monthlyData(target.month) });
  } else {
    let cursor = parseMonthWindowKey(monthly.windowKey);
    while (monthly.windowKey < target.month.key) {
      await tx.aiUsageWindow.update({
        where: { id: monthly.id },
        data: { state: AiUsageWindowState.closed, closedAt: monthly.windowEnd },
      });
      cursor = nextMonthWindow(cursor.year, cursor.month);
      const next = deriveV2MonthWindow(cursor.year, cursor.month, calendar.quotaTimezone);
      monthly = await tx.aiUsageWindow.upsert({
        where: { studentId_ledgerVersion_periodKind_windowKey: {
          studentId: input.studentId,
          ledgerVersion: VERA_CREDIT_USD_V2,
          periodKind: AiUsageWindowPeriodKind.month,
          windowKey: next.key,
        } },
        create: monthlyData(next),
        update: {},
      });
    }
  }
  await tx.aiQuotaCalendar.update({ where: { id: calendar.id }, data: { currentMonthlyWindowId: monthly.id } });

  const day = await tx.aiUsageWindow.upsert({
    where: { studentId_ledgerVersion_periodKind_windowKey: {
      studentId: input.studentId,
      ledgerVersion: VERA_CREDIT_USD_V2,
      periodKind: AiUsageWindowPeriodKind.day,
      windowKey: target.day.key,
    } },
    create: { ...monthlyData(target.day), periodKind: AiUsageWindowPeriodKind.day, creditLimit: VERA_DAILY_CREDIT_LIMIT, costLimitUsdMicros: 0n },
    update: {},
  });
  // react-doctor-disable-next-line server-sequential-independent-await -- Prisma interactive transactions serialize operations on this one connection.
  const isoWeek = await tx.aiUsageWindow.upsert({
    where: { studentId_ledgerVersion_periodKind_windowKey: {
      studentId: input.studentId,
      ledgerVersion: VERA_CREDIT_USD_V2,
      periodKind: AiUsageWindowPeriodKind.iso_week,
      windowKey: target.isoWeek.key,
    } },
    create: { ...monthlyData(target.isoWeek), periodKind: AiUsageWindowPeriodKind.iso_week, creditLimit: VERA_WEEKLY_CREDIT_LIMIT, costLimitUsdMicros: 0n },
    update: {},
  });

  const ids = [day.id, isoWeek.id, monthly.id];
  for (const id of ids) {
    // react-doctor-disable-next-line async-await-in-loop -- lock quota windows in fixed day/week/month order.
    await tx.$queryRaw`SELECT id FROM ai_usage_windows WHERE id = ${id}::uuid FOR UPDATE`;
  }
  const rows = await tx.aiUsageWindow.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const lockedDay = byId.get(day.id);
  const lockedWeek = byId.get(isoWeek.id);
  const lockedMonth = byId.get(monthly.id);
  if (!lockedDay || !lockedWeek || !lockedMonth) throw new VeraAdmissionError({ code: "quota_window_missing", status: 503 });
  for (const window of [lockedDay, lockedWeek, lockedMonth]) {
    if (window.monetaryDebtState === AiMonetaryDebtState.debt) throw new VeraAdmissionError({ code: "quota_exhausted_monetary", status: 409 });
    if (window.consumedCredits + window.reservedCredits + input.creditCost > window.creditLimit) {
      throw new VeraAdmissionError({ code: `quota_exhausted_${window.periodKind}`, status: 409 });
    }
  }
  const monthlyExposure = lockedMonth.reservedUsdMicros + lockedMonth.settledUsdMicros + lockedMonth.unknownUsdMicros;
  if (monthlyExposure + input.maxProviderCostUsdMicros > lockedMonth.costLimitUsdMicros) {
    throw new VeraAdmissionError({
      code: "quota_exhausted_monetary",
      status: 409,
      details: { monthlyExposureUsdMicros: monthlyExposure.toString(), requestedUsdMicros: input.maxProviderCostUsdMicros.toString() },
    });
  }
  await tx.aiUsageWindow.update({ where: { id: lockedDay.id }, data: { reservedCredits: { increment: input.creditCost } } });
  await tx.aiUsageWindow.update({ where: { id: lockedWeek.id }, data: { reservedCredits: { increment: input.creditCost } } });
  await tx.aiUsageWindow.update({ where: { id: lockedMonth.id }, data: { reservedCredits: { increment: input.creditCost }, reservedUsdMicros: { increment: input.maxProviderCostUsdMicros } } });
  const created: string[] = [];
  for (const reservation of [
    { usageWindowId: lockedDay.id, reservedUsdMicros: 0n },
    { usageWindowId: lockedWeek.id, reservedUsdMicros: 0n },
    { usageWindowId: lockedMonth.id, reservedUsdMicros: input.maxProviderCostUsdMicros },
  ]) {
    // react-doctor-disable-next-line async-await-in-loop -- persist reservation lineage in fixed day/week/month order.
    const row = await tx.aiRequestUsageReservation.create({
      data: {
        requestId: input.requestId,
        usageWindowId: reservation.usageWindowId,
        reservedCredits: input.creditCost,
        reservedUsdMicros: reservation.reservedUsdMicros,
      },
      select: { id: true },
    });
    created.push(row.id);
  }
  return created;
}

/**
 * Prisma-backed persistence seam for tickets 5–6. All write methods execute
 * the same lock order as the executable in-memory contract and use the
 * transaction clock for local-day/deadline decisions.
 */
export class VeraPrismaAdmissionService {
  constructor(
    private readonly db: DbClient = defaultPrisma,
    private readonly envelope?: EnvelopeService,
  ) {}

  /**
   * Reserve the v2 day/week/month ledger atomically for an already-created
   * request. The request creation path can call this immediately before its
   * final accepted-key CAS; the exact window ids are then the settlement
   * lineage and are never reconstructed from a timestamp.
   */
  async reserveV2Quota(input: {
    studentId: string;
    conversationId?: string;
    idempotencyKeyId?: string;
    requestId: string;
    now: Date;
    quotaTimezone?: string | null;
    policyBundleVersion?: string | null;
    quotaPolicyVersion?: string | null;
    creditCost: number;
    maxProviderCostUsdMicros: bigint;
    creditLimit?: number;
    costLimitUsdMicros?: bigint;
  }): Promise<VeraV2QuotaReservation> {
    if (ledgerVersionFor(input.now) !== VERA_CREDIT_USD_V2 || input.now < VERA_CREDIT_USD_V2_EFFECTIVE_FROM) {
      throw new VeraAdmissionError({ code: "v2_ledger_not_active", status: 409 });
    }
    if (!Number.isSafeInteger(input.creditCost) || input.creditCost < 1) {
      throw new VeraAdmissionError({ code: "invalid_credit_cost", status: 422 });
    }
    if (input.maxProviderCostUsdMicros < 0n) throw new VeraAdmissionError({ code: "invalid_provider_cost_reservation", status: 422 });
    const creditLimit = input.creditLimit ?? VERA_MONTHLY_CREDIT_LIMIT;
    const costLimitUsdMicros = input.costLimitUsdMicros ?? VERA_MONTHLY_COST_LIMIT_USD_MICROS;
    const quotaTimezone = input.quotaTimezone?.trim() || "Asia/Jakarta";

    return this.db.$transaction(async (tx) => {
      // Fixed lock order: idempotency/request key -> conversation -> calendar
      // -> day -> ISO week -> month. The advisory lock covers first-use
      // bootstrap, where there is no calendar row to lock yet.
      if (input.idempotencyKeyId) {
        await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${input.idempotencyKeyId}::uuid FOR UPDATE`;
      }
      if (input.conversationId) {
        await tx.$queryRaw`SELECT id FROM ai_conversations WHERE id = ${input.conversationId}::uuid AND student_id = ${input.studentId}::uuid FOR UPDATE`;
      }
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      const existingReservations = await tx.aiRequestUsageReservation.findMany({
        where: { requestId: input.requestId },
        orderBy: { createdAt: "asc" },
      });
      // react-doctor-disable-next-line server-sequential-independent-await -- both reads follow the request lock and share the transaction connection.
      const lockedRequest = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { ledgerVersion: true, creditCost: true },
      });
      if (!lockedRequest) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (existingReservations.length > 0 && lockedRequest.ledgerVersion !== VERA_CREDIT_USD_V2) {
        throw new VeraAdmissionError({ code: "v2_lineage_conflict", status: 409 });
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.studentId} || ':' || ${VERA_CREDIT_USD_V2}, 0))`;
      await tx.aiQuotaCalendar.upsert({
        where: { studentId_ledgerVersion: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2 } },
        create: {
          studentId: input.studentId,
          ledgerVersion: VERA_CREDIT_USD_V2,
          quotaTimezone,
          effectiveFrom: VERA_CREDIT_USD_V2_EFFECTIVE_FROM,
        },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM ai_quota_calendars WHERE student_id = ${input.studentId}::uuid AND ledger_version = 'vera_credit_usd_v2'::ai_usage_ledger_version FOR UPDATE`;
      const calendar = await tx.aiQuotaCalendar.findUnique({
        where: { studentId_ledgerVersion: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2 } },
      });
      if (!calendar) throw new VeraAdmissionError({ code: "quota_calendar_invalid", status: 503 });
      // A profile timezone edit never mutates an active ledger calendar; the
      // stored snapshot remains authoritative for all derived windows.
      const target = deriveV2WindowKeys(input.now, calendar.quotaTimezone);
      let monthly = calendar.currentMonthlyWindowId
        ? await tx.aiUsageWindow.findUnique({ where: { id: calendar.currentMonthlyWindowId } })
        : null;
      if (monthly && monthly.periodKind !== AiUsageWindowPeriodKind.month) throw new VeraAdmissionError({ code: "quota_calendar_invalid", status: 503 });
      if (monthly && monthly.windowKey > target.month.key) throw new VeraAdmissionError({ code: "quota_calendar_invalid", status: 503 });
      const monthlyData = (window: { key: string; start: Date; end: Date }) => ({
        studentId: input.studentId,
        ledgerVersion: VERA_CREDIT_USD_V2,
        periodKind: AiUsageWindowPeriodKind.month,
        windowKey: window.key,
        windowStart: window.start,
        windowEnd: window.end,
        quotaTimezone: calendar!.quotaTimezone,
        policyBundleVersion: input.policyBundleVersion ?? null,
        quotaPolicyVersion: input.quotaPolicyVersion ?? null,
        creditLimit,
        costLimitUsdMicros,
      });
      if (!monthly) {
        monthly = await tx.aiUsageWindow.create({ data: monthlyData(target.month) });
      } else {
        const currentKey = parseMonthWindowKey(monthly.windowKey);
        let cursor = currentKey;
        while (monthly.windowKey < target.month.key) {
          await tx.aiUsageWindow.update({ where: { id: monthly.id }, data: { state: AiUsageWindowState.closed, closedAt: monthly.windowEnd } });
          cursor = nextMonthWindow(cursor.year, cursor.month);
          const next = deriveV2MonthWindow(cursor.year, cursor.month, calendar.quotaTimezone);
          monthly = await tx.aiUsageWindow.upsert({
            where: { studentId_ledgerVersion_periodKind_windowKey: {
              studentId: input.studentId,
              ledgerVersion: VERA_CREDIT_USD_V2,
              periodKind: AiUsageWindowPeriodKind.month,
              windowKey: next.key,
            } },
            create: monthlyData(next),
            update: {},
          });
        }
      }
      await tx.aiQuotaCalendar.update({ where: { id: calendar.id }, data: { currentMonthlyWindowId: monthly.id } });
      const day = await tx.aiUsageWindow.upsert({
        where: { studentId_ledgerVersion_periodKind_windowKey: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2, periodKind: AiUsageWindowPeriodKind.day, windowKey: target.day.key } },
        create: { ...monthlyData(target.day), periodKind: AiUsageWindowPeriodKind.day, creditLimit: VERA_DAILY_CREDIT_LIMIT, costLimitUsdMicros: 0n },
        update: {},
      });
      // react-doctor-disable-next-line server-sequential-independent-await -- Prisma interactive transactions serialize operations on this one connection.
      const isoWeek = await tx.aiUsageWindow.upsert({
        where: { studentId_ledgerVersion_periodKind_windowKey: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2, periodKind: AiUsageWindowPeriodKind.iso_week, windowKey: target.isoWeek.key } },
        create: { ...monthlyData(target.isoWeek), periodKind: AiUsageWindowPeriodKind.iso_week, creditLimit: VERA_WEEKLY_CREDIT_LIMIT, costLimitUsdMicros: 0n },
        update: {},
      });

      const ids = [day.id, isoWeek.id, monthly.id];
      for (const id of ids) {
        // react-doctor-disable-next-line async-await-in-loop -- lock quota windows in fixed day/week/month order.
        await tx.$queryRaw`SELECT id FROM ai_usage_windows WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const windows = await tx.aiUsageWindow.findMany({ where: { id: { in: ids } } });
      const byId = new Map(windows.map((window) => [window.id, window]));
      const lockedDay = byId.get(day.id);
      const lockedWeek = byId.get(isoWeek.id);
      const lockedMonth = byId.get(monthly.id);
      if (!lockedDay || !lockedWeek || !lockedMonth) throw new VeraAdmissionError({ code: "quota_window_missing", status: 503 });
      // A replay is already owned by this request's exact lineage. Return it
      // before any current quota/debt checks so a later request cannot make a
      // previously accepted idempotency key fail on retry.
      if (existingReservations.length > 0) {
        const snapshots = [lockedDay, lockedWeek, lockedMonth].map(v2WindowSnapshot);
        return {
          ledgerVersion: VERA_CREDIT_USD_V2,
          requestId: input.requestId,
          creditCost: lockedRequest.creditCost || existingReservations[0]?.reservedCredits || input.creditCost,
          reservedUsdMicros: existingReservations.reduce((total, row) => total + row.reservedUsdMicros, 0n),
          reservationIds: existingReservations.map((row) => row.id),
          usage: toVeraUsageDto(snapshots, calendar.quotaTimezone),
        };
      }
      for (const window of [lockedDay, lockedWeek, lockedMonth]) {
        if (window.monetaryDebtState === AiMonetaryDebtState.debt) throw new VeraAdmissionError({ code: "quota_exhausted_monetary", status: 409 });
        if (window.consumedCredits + window.reservedCredits + input.creditCost > window.creditLimit) {
          throw new VeraAdmissionError({ code: `quota_exhausted_${window.periodKind}`, status: 409 });
        }
      }
      const monthlyExposure = lockedMonth.reservedUsdMicros + lockedMonth.settledUsdMicros + lockedMonth.unknownUsdMicros;
      if (monthlyExposure + input.maxProviderCostUsdMicros > lockedMonth.costLimitUsdMicros) {
        throw new VeraAdmissionError({ code: "quota_exhausted_monetary", status: 409, details: { monthlyExposureUsdMicros: monthlyExposure.toString(), requestedUsdMicros: input.maxProviderCostUsdMicros.toString() } });
      }
      await tx.aiUsageWindow.update({ where: { id: lockedDay.id }, data: { reservedCredits: { increment: input.creditCost } } });
      await tx.aiUsageWindow.update({ where: { id: lockedWeek.id }, data: { reservedCredits: { increment: input.creditCost } } });
      await tx.aiUsageWindow.update({ where: { id: lockedMonth.id }, data: { reservedCredits: { increment: input.creditCost }, reservedUsdMicros: { increment: input.maxProviderCostUsdMicros } } });
      const reservationInputs = [
        { usageWindowId: lockedDay.id, reservedUsdMicros: 0n },
        { usageWindowId: lockedWeek.id, reservedUsdMicros: 0n },
        { usageWindowId: lockedMonth.id, reservedUsdMicros: input.maxProviderCostUsdMicros },
      ];
      const created = [] as Array<{ id: string }>;
      for (const reservation of reservationInputs) {
        // react-doctor-disable-next-line async-await-in-loop -- write reservation rows in fixed day/week/month order.
        created.push(await tx.aiRequestUsageReservation.create({ data: {
          requestId: input.requestId,
          usageWindowId: reservation.usageWindowId,
          reservedCredits: input.creditCost,
          reservedUsdMicros: reservation.reservedUsdMicros,
        }, select: { id: true } }));
      }
      await tx.aiRequest.update({ where: { id: input.requestId }, data: {
        ledgerVersion: VERA_CREDIT_USD_V2,
        creditCost: input.creditCost,
        creditReservationState: AiReservationState.reserved,
        billingState: AiRequestBillingState.prepared,
      } });
      const afterRows = await tx.aiUsageWindow.findMany({ where: { id: { in: ids } } });
      const afterById = new Map(afterRows.map((window) => [window.id, window]));
      const after = [afterById.get(day.id), afterById.get(isoWeek.id), afterById.get(monthly.id)];
      if (after.some((window) => !window)) throw new VeraAdmissionError({ code: "quota_window_missing", status: 503 });
      return {
        ledgerVersion: VERA_CREDIT_USD_V2,
        requestId: input.requestId,
        creditCost: input.creditCost,
        reservedUsdMicros: input.maxProviderCostUsdMicros,
        reservationIds: created.map((row) => row.id),
        usage: toVeraUsageDto(after.map((window) => v2WindowSnapshot(window!)), calendar.quotaTimezone),
      };
    });
  }

  /** Settle the exact three lineage rows; retries are no-ops after terminal state. */
  async settleV2Quota(input: {
    requestId: string;
    outcome: "known" | "unknown" | "released";
    chargedUsdMicros?: bigint;
    forceOverrun?: boolean;
    releaseCreditsOnUnknown?: boolean;
    now?: Date;
    transaction?: Prisma.TransactionClient;
  }): Promise<VeraV2QuotaSettlement> {
    const now = input.now ?? await this.databaseNow();
    const settle = async (tx: Prisma.TransactionClient): Promise<VeraV2QuotaSettlement> => {
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({ where: { id: input.requestId }, select: { id: true, ledgerVersion: true, creditCost: true, billingState: true } });
      if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (request.ledgerVersion !== VERA_CREDIT_USD_V2) throw new VeraAdmissionError({ code: "v2_lineage_missing", status: 409 });
      const rows = await tx.aiRequestUsageReservation.findMany({ where: { requestId: input.requestId }, orderBy: { createdAt: "asc" } });
      if (rows.length === 0) throw new VeraAdmissionError({ code: "v2_lineage_missing", status: 409 });
      const windowIds = rows.map((row) => row.usageWindowId);
      for (const id of windowIds) {
        // react-doctor-disable-next-line async-await-in-loop -- lock all referenced windows in the row order established above.
        await tx.$queryRaw`SELECT id FROM ai_usage_windows WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const windows = await tx.aiUsageWindow.findMany({ where: { id: { in: windowIds } } });
      const byWindow = new Map(windows.map((window) => [window.id, window]));
      let chargedUsdMicros = 0n;
      let unknownUsdMicros = 0n;
      let overrunUsdMicros = 0n;
      let consumedCredits = 0;
      let requestState: VeraV2QuotaSettlement["state"] = input.forceOverrun ? "overrun" : input.outcome;
      if (rows.every((row) => row.state !== AiReservationState.reserved)) {
        requestState = rows.some((row) => row.state === AiReservationState.overrun)
          ? "overrun"
          : rows.some((row) => row.state === AiReservationState.unknown)
            ? "unknown"
            : rows.every((row) => row.state === AiReservationState.released)
              ? "released"
              : "known";
      }
      for (const row of rows) {
        const window = byWindow.get(row.usageWindowId);
        if (!window) throw new VeraAdmissionError({ code: "quota_window_missing", status: 503 });
        const current: ReservationAmounts = {
          reservedCredits: row.reservedCredits,
          consumedCredits: row.consumedCredits,
          releasedCredits: row.releasedCredits,
          reservedUsdMicros: row.reservedUsdMicros,
          settledUsdMicros: row.settledUsdMicros,
          unknownUsdMicros: row.unknownUsdMicros,
          releasedUsdMicros: row.releasedUsdMicros,
          overrunUsdMicros: row.overrunUsdMicros,
        };
        assertReservationConservation(current);
        if (row.state !== AiReservationState.reserved) {
          consumedCredits += row.consumedCredits;
          chargedUsdMicros += row.settledUsdMicros;
          unknownUsdMicros += row.unknownUsdMicros;
          overrunUsdMicros += row.overrunUsdMicros;
          if (row.state === AiReservationState.overrun) requestState = "overrun";
          else if (row.state === AiReservationState.unknown && requestState !== "overrun") requestState = "unknown";
          continue;
        }
      const next = settleReservation({
          current,
          outcome: input.outcome,
          chargedUsdMicros: input.outcome === "known" && window.periodKind === AiUsageWindowPeriodKind.month ? input.chargedUsdMicros ?? 0n : 0n,
          unresolvedUsdMicros: input.outcome === "unknown" && window.periodKind === AiUsageWindowPeriodKind.month ? row.reservedUsdMicros : 0n,
          ...(input.outcome === "unknown" && input.releaseCreditsOnUnknown ? { consumedCredits: 0 } : {}),
        });
      assertReservationConservation(next);
      const nextState = v2ReservationState({ settledUsdMicros: next.settledUsdMicros, unknownUsdMicros: next.unknownUsdMicros, overrunUsdMicros: next.overrunUsdMicros, outcome: input.outcome, forceOverrun: input.forceOverrun });
        // react-doctor-disable-next-line async-await-in-loop -- reservation state and its usage window must be updated together in row order.
        await tx.aiRequestUsageReservation.update({ where: { id: row.id }, data: {
          consumedCredits: next.consumedCredits,
          releasedCredits: next.releasedCredits,
          settledUsdMicros: next.settledUsdMicros,
          unknownUsdMicros: next.unknownUsdMicros,
          releasedUsdMicros: next.releasedUsdMicros,
          overrunUsdMicros: next.overrunUsdMicros,
          state: nextState,
          settledAt: now,
        } });
        const monetary = window.periodKind === AiUsageWindowPeriodKind.month;
        await tx.aiUsageWindow.update({ where: { id: window.id }, data: {
          reservedCredits: { decrement: row.reservedCredits },
          consumedCredits: { increment: next.consumedCredits },
          ...(monetary ? {
            reservedUsdMicros: { decrement: row.reservedUsdMicros },
            settledUsdMicros: { increment: next.settledUsdMicros },
            unknownUsdMicros: { increment: next.unknownUsdMicros },
            overrunUsdMicros: { increment: next.overrunUsdMicros },
            monetaryDebtState: next.overrunUsdMicros > 0n ? AiMonetaryDebtState.debt : undefined,
          } : {}),
        } });
        consumedCredits += next.consumedCredits;
        chargedUsdMicros += next.settledUsdMicros;
        unknownUsdMicros += next.unknownUsdMicros;
        overrunUsdMicros += next.overrunUsdMicros;
        if (nextState === AiReservationState.overrun) requestState = "overrun";
        else if (nextState === AiReservationState.unknown && requestState !== "overrun") requestState = "unknown";
      }
      const finalBillingState = requestState === "known" ? AiRequestBillingState.known
        : requestState === "unknown" ? AiRequestBillingState.unknown
          : requestState === "released" ? AiRequestBillingState.released
            : AiRequestBillingState.overrun;
      await tx.aiRequest.update({ where: { id: request.id }, data: {
        billingState: finalBillingState,
        creditReservationState: requestState === "known" ? AiReservationState.settled : requestState === "unknown" ? AiReservationState.unknown : requestState === "released" ? AiReservationState.released : AiReservationState.overrun,
        chargedProviderCostUsdMicros: chargedUsdMicros,
        overrunUsdMicros,
      } });
      return { requestId: request.id, state: requestState, consumedCredits, chargedUsdMicros, unknownUsdMicros, overrunUsdMicros };
    };
    return input.transaction ? settle(input.transaction) : this.db.$transaction(settle);
  }

  /** Persist the selector's canonical arguments exactly once. The request FK
   * owns this row; callers cannot create an invocation detached from a request
   * or replace an already executing/completed tool call. */
  async markAutomaticInvocationExecuting(input: {
    requestId: string;
    toolArguments: unknown;
    now?: Date;
  }): Promise<{ argumentsDigest: string; replayed: boolean; state: "executing" | "completed" }> {
    if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      const invocation = await tx.aiContextToolInvocation.findUnique({ where: { requestId: input.requestId } });
      if (!invocation) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      const encrypted = await encryptContextToolInvocationAsync({
        toolArguments: input.toolArguments,
        envelope: this.envelope!.forClient(tx),
        objectId: invocation.id,
      });
      if (invocation.state === "executing" || invocation.state === "completed") {
        if (invocation.argumentsDigest !== encrypted.argumentsDigest) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
        return { argumentsDigest: encrypted.argumentsDigest, replayed: true, state: invocation.state === "completed" ? "completed" : "executing" };
      }
      if (invocation.state !== "planned") throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
      const changed = await tx.aiContextToolInvocation.updateMany({
        where: { id: invocation.id, requestId: input.requestId, state: "planned" },
        data: {
          state: "executing",
          canonicalArgumentsCiphertext: json(encrypted.canonicalArgumentsCiphertext),
          argumentsDigest: encrypted.argumentsDigest,
          errorCode: null,
          executingAt: now,
        },
      });
      if (changed.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
      return { argumentsDigest: encrypted.argumentsDigest, replayed: false, state: "executing" };
    });
  }

  /** Atomically claim the sole selector send before network I/O. */
  async beginLocalSelectorDispatch(input: { requestId: string; requestDigest: string; now?: Date }): Promise<{ claimed: boolean; replayed: boolean }> {
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      // react-doctor-disable-next-line server-sequential-independent-await -- read decision state only after acquiring the request identity lock.
      const trace = await tx.aiContextDecision.findUnique({ where: { requestId: input.requestId } });
      // react-doctor-disable-next-line server-sequential-independent-await -- both state reads follow the request lock in one interactive transaction.
      const attempt = await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 1 } } });
      if (!trace || trace.protocolVersion !== VERA_LOCAL_DECISION_PROTOCOL || !attempt
        || trace.selectorRequestDigest !== input.requestDigest
        || !trace.selectorRequestCiphertext || trace.selectorKind !== "respan_span01_lite") {
        throw new VeraAdmissionError({ code: "local_context_selector_unavailable", status: 409 });
      }
      if (trace.state === AiContextDecisionState.dispatching || trace.networkDispatchCount === 1) return { claimed: false, replayed: true };
      if (trace.state !== AiContextDecisionState.shortlisted || trace.networkDispatchCount !== 0 || attempt.state !== AiAttemptState.reserved) {
        throw new VeraAdmissionError({ code: "local_context_selector_unavailable", status: 409 });
      }
      const changedTrace = await tx.aiContextDecision.updateMany({
        where: { requestId: input.requestId, state: AiContextDecisionState.shortlisted, networkDispatchCount: 0, selectorRequestDigest: input.requestDigest },
        data: { state: AiContextDecisionState.dispatching, networkDispatchCount: 1, selectorDispatchStartedAt: now },
      });
      // react-doctor-disable-next-line server-sequential-independent-await -- keep the decision-then-attempt CAS lock order inside the transaction.
      const changedAttempt = await tx.aiRequestAttempt.updateMany({
        where: { id: attempt.id, state: AiAttemptState.reserved, finalPayloadHash: input.requestDigest },
        data: { state: AiAttemptState.dispatching, sendStartedAt: now, startedAt: now, errorCode: null },
      });
      if (changedTrace.count !== 1 || changedAttempt.count !== 1) throw new VeraAdmissionError({ code: "local_context_selector_cas_conflict", status: 409 });
      return { claimed: true, replayed: false };
    });
  }

  /** Encrypt the exact response and probabilities; zero is known only with the
   * observed model and the current pricing evidence bound at admission. */
  async recordLocalSelectorResponse(input: {
    requestId: string;
    envelope: LocalSpan01ResponseEnvelope;
    priceSnapshotDigest: string;
    now?: Date;
  }): Promise<{ decision: LocalSpan01Decision; selected: LocalContextCandidate[]; decisionDigest: string; replayed: boolean }> {
    const envelopeService = this.envelope;
    if (!envelopeService) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      // react-doctor-disable-next-line server-sequential-independent-await -- the locked request is the serialization barrier for selector response writes.
      const trace = await tx.aiContextDecision.findUnique({ where: { requestId: input.requestId } });
      // react-doctor-disable-next-line server-sequential-independent-await -- these independent reads share the locked transaction connection.
      const attempt = await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 1 } } });
      // react-doctor-disable-next-line server-sequential-independent-await -- read the request snapshot after the identity lock on the same transaction connection.
      const request = await tx.aiRequest.findUnique({ where: { id: input.requestId }, select: { automaticContextGateSnapshot: true } });
      const gateSnapshot = request?.automaticContextGateSnapshot && typeof request.automaticContextGateSnapshot === "object" && !Array.isArray(request.automaticContextGateSnapshot)
        ? request.automaticContextGateSnapshot as Record<string, unknown>
        : null;
      const priceSnapshot = gateSnapshot?.selectorPriceSnapshot && typeof gateSnapshot.selectorPriceSnapshot === "object" && !Array.isArray(gateSnapshot.selectorPriceSnapshot)
        ? gateSnapshot.selectorPriceSnapshot as Record<string, unknown>
        : null;
      const verifiedAt = typeof priceSnapshot?.verifiedAt === "string" ? Date.parse(priceSnapshot.verifiedAt) : Number.NaN;
      if (!trace || !attempt || trace.selectorPriceSnapshotDigest !== input.priceSnapshotDigest
        || trace.networkDispatchCount !== 1 || trace.selectorKind !== "respan_span01_lite"
        || gateSnapshot?.protocol !== "local_respan_free"
        || !priceSnapshot
        || Object.keys(priceSnapshot).sort().join(",") !== "endpoint,inputPriceUsdPerM,model,outputPriceUsdPerM,sourceUrl,verifiedAt,version"
        || priceSnapshot.version !== "respan-published-free-tier-v1"
        || priceSnapshot.endpoint !== "https://api.respan.ai/api/v1/scores"
        || priceSnapshot.model !== "respan-01-free"
        || priceSnapshot.inputPriceUsdPerM !== "0"
        || priceSnapshot.outputPriceUsdPerM !== "0"
        || priceSnapshot.sourceUrl !== "https://www.respan.ai/docs/documentation/span-01/concept"
        || !Number.isFinite(verifiedAt) || verifiedAt > now.getTime() + 30_000 || now.getTime() - verifiedAt > 24 * 60 * 60_000
        || sha256Hex(canonicalJson(priceSnapshot)) !== input.priceSnapshotDigest) {
        throw new VeraAdmissionError({ code: "local_context_selector_provenance_invalid", status: 409 });
      }
      const envelope = envelopeService.forClient(tx);
      if (trace.state === AiContextDecisionState.decided || trace.state === AiContextDecisionState.frozen) {
        if (!trace.typedDecisionCiphertext || !trace.typedDecisionDigest) throw new VeraAdmissionError({ code: "local_context_decision_unavailable", status: 409 });
        const serialized = await envelope.decryptTextAsync(trace.typedDecisionCiphertext as unknown as AiEncryptedPayload);
        if (sha256Hex(serialized) !== trace.typedDecisionDigest) throw new VeraAdmissionError({ code: "local_context_decision_digest_conflict", status: 409 });
        const decision = JSON.parse(serialized) as LocalSpan01Decision;
        const candidateMapText = await envelope.decryptTextAsync(trace.candidateMapCiphertext as unknown as AiEncryptedPayload);
        if (sha256Hex(candidateMapText) !== trace.candidateMapDigest) throw new VeraAdmissionError({ code: "local_context_shortlist_digest_conflict", status: 409 });
        const candidates = JSON.parse(candidateMapText) as LocalContextCandidate[];
        const selected = decision.scores
          .filter((score) => score.p_present >= 0.8 && score.p_not_observable <= 0.2)
          .sort((left, right) => right.p_present - left.p_present || decision.scores.indexOf(left) - decision.scores.indexOf(right))
          .map((score) => candidates.find((candidate) => candidate.key === score.id)).filter((candidate): candidate is LocalContextCandidate => Boolean(candidate)).slice(0, 4);
        return { decision, selected, decisionDigest: trace.typedDecisionDigest, replayed: true };
      }
      if (trace.state !== AiContextDecisionState.dispatching || attempt.state !== AiAttemptState.dispatching
        || !trace.candidateMapDigest || !trace.candidateMapCiphertext) throw new VeraAdmissionError({ code: "local_context_selector_unavailable", status: 409 });
      if (input.envelope.observedModel !== "respan-01-free"
        || input.envelope.responseDigest !== sha256Hex(input.envelope.responseBytes)
        || !/^[a-f0-9]{64}$/u.test(input.priceSnapshotDigest)) throw new VeraAdmissionError({ code: "local_context_selector_provenance_invalid", status: 409 });
      const candidateMapText = await envelope.decryptTextAsync(trace.candidateMapCiphertext as unknown as AiEncryptedPayload);
      if (sha256Hex(candidateMapText) !== trace.candidateMapDigest) throw new VeraAdmissionError({ code: "local_context_shortlist_digest_conflict", status: 409 });
      const candidates = JSON.parse(candidateMapText) as LocalContextCandidate[];
      const parsed = validateLocalSpan01Response({ envelope: input.envelope, candidates });
      const decisionJson = canonicalJson(parsed.decision);
      const decisionDigest = sha256Hex(decisionJson);
      const typedDecisionCiphertext = await envelope.encryptAsync(decisionJson, `ai-context-decision:${input.requestId}:decision`);
      const responseText = new TextDecoder("utf-8", { fatal: true }).decode(input.envelope.responseBytes);
      const selectorResponseCiphertext = await envelope.encryptAsync(responseText, `ai-context-decision:${input.requestId}:response`);
      const changedTrace = await tx.aiContextDecision.updateMany({
        where: { requestId: input.requestId, state: AiContextDecisionState.dispatching, networkDispatchCount: 1, selectorPriceSnapshotDigest: input.priceSnapshotDigest },
        data: {
          state: AiContextDecisionState.decided,
          selectorResponseCiphertext: json(selectorResponseCiphertext),
          selectorResponseDigest: input.envelope.responseDigest,
          selectorResponseModel: input.envelope.observedModel,
          selectorLogId: input.envelope.logId,
          selectorInputTokens: input.envelope.inputTokens,
          selectorCostUsdMicros: 0n,
          selectorCostProvenance: VERA_LOCAL_DECISION_COST_PROVENANCE,
          typedDecisionCiphertext: json(typedDecisionCiphertext),
          typedDecisionDigest: decisionDigest,
          selectedCandidateCount: parsed.selected.length,
          decidedAt: now,
        },
      });
      // react-doctor-disable-next-line server-sequential-independent-await -- preserve the decision-then-attempt CAS order within this transaction.
      const changedAttempt = await tx.aiRequestAttempt.updateMany({
        where: { id: attempt.id, state: AiAttemptState.dispatching, finalPayloadHash: trace.selectorRequestDigest },
        data: {
          state: AiAttemptState.known,
          resultKind: AiAttemptResultKind.success,
          observedUpstreamProviderSlug: "respan-01-free",
          providerName: "respan",
          inputTokens: input.envelope.inputTokens,
          tokenUsageState: input.envelope.inputTokens === null ? AiTokenUsageState.unknown : AiTokenUsageState.known,
          reportedProviderCostUsdMicros: 0n,
          recomputedProviderCostUsdMicros: 0n,
          chargedProviderCostUsdMicros: 0n,
          priceSnapshot: json({ ...priceSnapshot, digest: input.priceSnapshotDigest }),
          completedAt: now,
        },
      });
      await tx.aiRequest.updateMany({
        where: { id: input.requestId, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
        data: {
          reportedProviderCostUsdMicros: 0n,
          recomputedProviderCostUsdMicros: 0n,
          chargedProviderCostUsdMicros: 0n,
        },
      });
      if (changedTrace.count !== 1 || changedAttempt.count !== 1) throw new VeraAdmissionError({ code: "local_context_selector_cas_conflict", status: 409 });
      return { decision: parsed.decision, selected: parsed.selected, decisionDigest, replayed: false };
    });
  }

  /** Read an admitted selector only from its encrypted, digested write-ahead
   * record. Recovery can dispatch the exact prepared bytes while the attempt
   * is still reserved, or continue a durable decision without reranking. */
  async readLocalAutomaticRecoveryRequest(input: { requestId: string }) {
    return this.db.aiRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        studentId: true,
        conversationId: true,
        createdAt: true,
        status: true,
        automaticContextGateSnapshot: true,
        featureKey: true,
        behaviorVersion: true,
        policyBundleVersion: true,
        hardOutputQuotaUnits: true,
        settlementDeadlineAt: true,
        dispatchDeadlineAt: true,
        userMessage: { select: { contentEnvelope: true, contentState: true } },
        contextPack: {
          select: {
            id: true,
            purgeState: true,
            promptTemplateHash: true,
            toolSchemaHash: true,
            systemPolicyHash: true,
          },
        },
        attempts: {
          orderBy: { attemptNo: "asc" },
          select: {
            attemptNo: true,
            state: true,
            stagePurpose: true,
            providerRequestKey: true,
            finalPayloadHash: true,
            dispatchDeadlineAt: true,
          },
        },
      },
    });
  }

  async readLocalContextDecision(input: { requestId: string }): Promise<{
    state: AiContextDecisionState;
    request: PreparedLocalSpan01Request | null;
    candidates: LocalContextCandidate[];
    selected: LocalContextCandidate[];
    decision: LocalSpan01Decision | null;
    decisionDigest: string | null;
    priceSnapshotDigest: string | null;
    attemptState: AiAttemptState | null;
    errorCode: string | null;
  } | null> {
    if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const [trace, attempt] = await Promise.all([
      this.db.aiContextDecision.findUnique({ where: { requestId: input.requestId } }),
      this.db.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 1 } }, select: { state: true } }),
    ]);
    if (!trace || trace.selectorKind !== "respan_span01_lite") return null;
    const envelope = this.envelope;
    let candidates: LocalContextCandidate[];
    try {
      const candidateMapText = await envelope.decryptTextAsync(trace.candidateMapCiphertext as unknown as AiEncryptedPayload);
      if (sha256Hex(candidateMapText) !== trace.candidateMapDigest) throw new Error("candidate_digest");
      candidates = JSON.parse(candidateMapText) as LocalContextCandidate[];
      if (!Array.isArray(candidates) || candidates.length > 12) throw new Error("candidate_schema");
    } catch {
      throw new VeraAdmissionError({ code: "local_context_shortlist_digest_conflict", status: 409 });
    }
    let preparedRequest: PreparedLocalSpan01Request | null = null;
    if (trace.selectorRequestCiphertext) {
      try {
        const requestText = await envelope.decryptTextAsync(trace.selectorRequestCiphertext as unknown as AiEncryptedPayload);
        const body = JSON.parse(requestText) as PreparedLocalSpan01Request["body"];
        const bytes = new TextEncoder().encode(requestText);
        const candidateKeys = Array.isArray(body.behaviors) ? body.behaviors.map((row) => row.id) : [];
        if (canonicalJson(body) !== requestText || sha256Hex(bytes) !== trace.selectorRequestDigest
          || candidateKeys.some((key) => typeof key !== "string" || !/^cand_[0-9]{2}$/u.test(key))
          || candidateKeys.length !== candidates.length
          || candidateKeys.some((key, index) => key !== candidates[index]?.key)) throw new Error("request_digest");
        preparedRequest = { body, bytes, digest: sha256Hex(bytes), candidateKeys };
      } catch {
        throw new VeraAdmissionError({ code: "local_context_selector_request_unavailable", status: 409 });
      }
    }
    let decision: LocalSpan01Decision | null = null;
    let decisionDigest: string | null = null;
    let selected: LocalContextCandidate[] = [];
    if (trace.selectorResponseCiphertext && trace.selectorResponseDigest && trace.selectorResponseModel) {
      try {
        const responseText = await envelope.decryptTextAsync(trace.selectorResponseCiphertext as unknown as AiEncryptedPayload);
        const responseBytes = new TextEncoder().encode(responseText);
        const response = JSON.parse(responseText) as unknown;
        const parsed = validateLocalSpan01Response({ envelope: {
          response,
          responseBytes,
          responseDigest: sha256Hex(responseBytes),
          observedModel: trace.selectorResponseModel,
          logId: trace.selectorLogId,
          inputTokens: trace.selectorInputTokens,
        }, candidates });
        const serialized = await envelope.decryptTextAsync(trace.typedDecisionCiphertext as unknown as AiEncryptedPayload);
        if (sha256Hex(serialized) !== trace.typedDecisionDigest || serialized !== canonicalJson(parsed.decision)
          || trace.selectorResponseDigest !== sha256Hex(responseBytes)) throw new Error("decision_digest");
        decision = parsed.decision;
        selected = parsed.selected;
        decisionDigest = trace.typedDecisionDigest;
      } catch {
        throw new VeraAdmissionError({ code: "local_context_decision_unavailable", status: 409 });
      }
    }
    return {
      state: trace.state,
      request: preparedRequest,
      candidates,
      selected,
      decision,
      decisionDigest,
      priceSnapshotDigest: trace.selectorPriceSnapshotDigest,
      attemptState: attempt?.state ?? null,
      errorCode: trace.errorCode,
    };
  }

  /** Read the already-frozen free answer request for safe pre-dispatch
   * recovery. This never rebuilds evidence from the live registry. */
  async readLocalFrozenAnswer(input: { requestId: string }): Promise<{
    request: { featureKey: string; behaviorVersion: string; hardOutputQuotaUnits: number | null };
    attempt: {
      state: AiAttemptState;
      finalPayloadHash: string | null;
      providerRequestKey: string | null;
      dispatchDeadlineAt: Date | null;
      gateway: string;
      upstreamProvider: string;
      upstreamProviderSlug: string | null;
      model: string;
      releaseManifestDigest: string | null;
    };
    outbound: LocalOutboundPayload;
  } | null> {
    if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const [request, attempt, sourceRows] = await Promise.all([
      this.db.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { featureKey: true, behaviorVersion: true, hardOutputQuotaUnits: true, automaticContextGateSnapshot: true },
      }),
      this.db.aiRequestAttempt.findUnique({
        where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 2 } },
        select: { state: true, finalPayloadHash: true, providerRequestKey: true, dispatchDeadlineAt: true, gateway: true, upstreamProvider: true, upstreamProviderSlug: true, model: true, releaseManifestDigest: true, outboundPayloadCiphertext: true },
      }),
      this.db.aiRequestSource.findMany({
        where: { requestId: input.requestId },
        orderBy: { ordinal: "asc" },
        select: { sourceType: true, sourceId: true, citationKey: true, contentDigest: true, boundedSnapshotCiphertext: true, snapshotState: true },
      }),
    ]);
    const gateSnapshot = request?.automaticContextGateSnapshot && typeof request.automaticContextGateSnapshot === "object" && !Array.isArray(request.automaticContextGateSnapshot)
      ? request.automaticContextGateSnapshot as Record<string, unknown>
      : null;
    if (!request || gateSnapshot?.protocol !== "local_respan_free" || !attempt || !attempt.outboundPayloadCiphertext || !attempt.finalPayloadHash) return null;
    try {
      const bodyText = await this.envelope.decryptTextAsync(attempt.outboundPayloadCiphertext as unknown as AiEncryptedPayload);
      const bytes = new TextEncoder().encode(bodyText);
      if (sha256Hex(bytes) !== attempt.finalPayloadHash) throw new Error("local_payload_digest");
      const sources: LocalOutboundSource[] = await Promise.all(sourceRows.map(async (row) => {
        if (!row.boundedSnapshotCiphertext || row.snapshotState !== "available") throw new Error("local_source_snapshot_missing");
        const sourceText = await this.envelope!.decryptTextAsync(row.boundedSnapshotCiphertext as unknown as AiEncryptedPayload);
        const snapshot = JSON.parse(sourceText) as Record<string, unknown>;
        if (Object.keys(snapshot).sort().join(",") !== "citationKey,content,sourceId,sourceType"
          || snapshot.citationKey !== row.citationKey || snapshot.sourceId !== row.sourceId
          || snapshot.sourceType !== row.sourceType || typeof snapshot.content !== "string"
          || sha256Hex(snapshot.content) !== row.contentDigest) throw new Error("local_source_snapshot_invalid");
        const kind = row.citationKey.startsWith("materi_") ? "materi"
          : row.citationKey.startsWith("kuis_") ? "kuis"
            : row.citationKey.startsWith("tryout_") ? "tryout" : null;
        if (!kind || kind === "materi" && row.sourceType !== "material"
          || kind !== "materi" && row.sourceType !== "practice") throw new Error("local_source_kind_invalid");
        return { citationKey: row.citationKey, kind, evidenceSegments: [snapshot.content] };
      }));
      const outbound = readLocalOutboundPayload({ bytes, committedSources: sources });
      return {
        request: { featureKey: request.featureKey, behaviorVersion: request.behaviorVersion, hardOutputQuotaUnits: request.hardOutputQuotaUnits },
        attempt: {
          state: attempt.state,
          finalPayloadHash: attempt.finalPayloadHash,
          providerRequestKey: attempt.providerRequestKey,
          dispatchDeadlineAt: attempt.dispatchDeadlineAt,
          gateway: attempt.gateway,
          upstreamProvider: attempt.upstreamProvider,
          upstreamProviderSlug: attempt.upstreamProviderSlug,
          model: attempt.model,
          releaseManifestDigest: attempt.releaseManifestDigest,
        },
        outbound,
      };
    } catch {
      throw new VeraAdmissionError({ code: "local_context_frozen_payload_unavailable", status: 409 });
    }
  }

  async failLocalSelector(input: { requestId: string; errorCode: string; now?: Date }): Promise<void> {
    const now = input.now ?? await this.databaseNow();
    const errorCode = /^[a-z0-9_:-]{1,100}$/iu.test(input.errorCode) ? input.errorCode : "respan_selector_unavailable";
    await this.db.$transaction(async (tx) => {
      const trace = await tx.aiContextDecision.findUnique({ where: { requestId: input.requestId } });
      // react-doctor-disable-next-line server-sequential-independent-await -- both state reads share the transaction connection before conditional writes.
      const attempt = await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 1 } } });
      if (!trace || trace.state === AiContextDecisionState.decided || trace.state === AiContextDecisionState.frozen) return;
      await tx.aiContextDecision.updateMany({
        where: { requestId: input.requestId, state: { in: [AiContextDecisionState.shortlisted, AiContextDecisionState.dispatching] } },
        data: { state: AiContextDecisionState.unavailable, errorCode, failedAt: now },
      });
      if (attempt && (attempt.state === AiAttemptState.dispatching
        || attempt.state === AiAttemptState.sent
        || attempt.state === AiAttemptState.ambiguous)) {
        await tx.aiRequestAttempt.updateMany({ where: { id: attempt.id, state: attempt.state }, data: { state: AiAttemptState.unknown, errorCode, completedAt: now } });
      } else if (attempt && attempt.state === AiAttemptState.reserved) {
        await tx.aiRequestAttempt.updateMany({ where: { id: attempt.id, state: AiAttemptState.reserved }, data: { state: AiAttemptState.released, errorCode, completedAt: now } });
      }
    });
  }

  /** Claim the registry callback after selector arguments have been durably
   * recorded. The errorCode marker is a small CAS-owned substate available in
   * the existing invocation row; a late worker must observe it and return
   * recovery rather than execute the registry twice. */
  async claimAutomaticRegistryExecution(input: { requestId: string }): Promise<{ claimed: boolean; replayed: boolean }> {
    const invocation = await this.db.aiContextToolInvocation.findUnique({ where: { requestId: input.requestId }, select: { id: true, state: true, errorCode: true } });
    if (!invocation) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    if (invocation.state === "completed") return { claimed: false, replayed: true };
    if (invocation.state !== "executing") throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
    if (invocation.errorCode === "registry_dispatching") return { claimed: false, replayed: true };
    const changed = await this.db.aiContextToolInvocation.updateMany({
      where: { id: invocation.id, requestId: input.requestId, state: "executing", errorCode: null },
      data: { errorCode: "registry_dispatching" },
    });
    if (changed.count === 1) return { claimed: true, replayed: false };
    return { claimed: false, replayed: true };
  }

  /** Read the encrypted request-owned invocation for a reconnect worker. This
   * never returns internal source UUIDs; the result manifest is the same
   * identity-free ContextToolResult that the final serializer consumes. */
  async readAutomaticInvocation(input: { requestId: string }): Promise<{
    state: "planned" | "executing" | "completed" | "failed" | "unavailable";
    toolArguments: unknown | null;
    result: ContextToolResult | null;
    sources: AutomaticContextPackSource[];
  }> {
    if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const invocation = await this.db.aiContextToolInvocation.findUnique({ where: { requestId: input.requestId } });
    if (!invocation) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    let toolArguments: unknown | null = null;
    let result: ContextToolResult | null = null;
    const sourceRows = await this.db.aiRequestSource.findMany({ where: { requestId: input.requestId }, orderBy: { ordinal: "asc" } });
    try {
      if (invocation.canonicalArgumentsCiphertext) {
        toolArguments = JSON.parse(await this.envelope.decryptTextAsync(invocation.canonicalArgumentsCiphertext as unknown as AiEncryptedPayload)) as unknown;
      }
      if (invocation.resultManifestCiphertext) {
        result = JSON.parse(await this.envelope.decryptTextAsync(invocation.resultManifestCiphertext as unknown as AiEncryptedPayload)) as ContextToolResult;
      }
      if (toolArguments !== null && invocation.argumentsDigest && result !== null) {
        verifyContextToolInvocationDigests({
          toolArguments,
          result,
          argumentsDigest: invocation.argumentsDigest,
          resultDigest: invocation.resultDigest,
          resultManifestDigest: invocation.resultManifestDigest,
        });
      }
    } catch {
      throw new VeraAdmissionError({ code: "context_tool_recovery_unavailable", status: 503 });
    }
    return {
      state: invocation.state,
      toolArguments,
      result,
      sources: result && sourceRows.length === result.sources.length
        ? result.sources.map((source, index) => ({ ...source, sourceId: sourceRows[index]!.sourceId }))
      : [],
    };
  }

  /**
   * Read the durable, content-encrypted inputs needed by a reconnect worker.
   * Provider request bodies are never reconstructed from client input; the
   * request row, frozen pack metadata, and invocation evidence are the only
   * authority for continuation.
   */
  async readAutomaticRecoveryRequest(input: { requestId: string }) {
    const request = await this.db.aiRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        studentId: true,
        conversationId: true,
        createdAt: true,
        status: true,
        errorCode: true,
        automaticContextGateSnapshot: true,
        featureKey: true,
        behaviorVersion: true,
        contextPackVersion: true,
        policyBundleVersion: true,
        hardOutputQuotaUnits: true,
        settlementDeadlineAt: true,
        dispatchDeadlineAt: true,
        userMessage: { select: { contentEnvelope: true, contentState: true } },
        contextPack: {
          select: {
            id: true,
            systemPolicyHash: true,
            promptTemplateHash: true,
            toolSchemaHash: true,
            registryVersion: true,
            resolverVersion: true,
            purgeState: true,
          },
        },
        contextToolInvocation: { select: { state: true } },
        attempts: {
          orderBy: { attemptNo: "asc" },
          select: {
            attemptNo: true,
            state: true,
            stagePurpose: true,
            gateway: true,
            upstreamProvider: true,
            upstreamProviderSlug: true,
            model: true,
            providerRequestKey: true,
            finalPayloadHash: true,
            dispatchDeadlineAt: true,
            releaseManifestDigest: true,
            generationId: true,
          },
        },
      },
    });
    if (!request || !request.contextPack || !request.contextToolInvocation) return null;
    const invocation = await this.readAutomaticInvocation({ requestId: input.requestId });
    return { request, invocation };
  }

  /** Complete the one invocation with an encrypted identity-free result
   * manifest. Source UUIDs are frozen separately into AiRequestSource rows. */
  async completeAutomaticInvocation(input: {
    requestId: string;
    result: ContextToolResult;
    /** Internal identities are persisted separately from the provider-visible
     * identity-free result so a reconnect can rebuild the final pack without
     * executing the registry again. */
    sources?: readonly AutomaticContextPackSource[];
    selectedSourceCount: number;
    resultByteCount: number;
    truncationCount: number;
    registryLatencyMs?: number;
    now?: Date;
  }): Promise<{ resultDigest: string; replayed: boolean }> {
    if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      const request = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: {
          retentionPolicyVersion: true,
          contextPack: { select: { id: true, purgeAt: true } },
        },
      });
      if (!request?.contextPack) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      const invocation = await tx.aiContextToolInvocation.findUnique({ where: { requestId: input.requestId } });
      if (!invocation) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (!invocation.canonicalArgumentsCiphertext || !invocation.argumentsDigest) {
        throw new VeraAdmissionError({ code: "context_tool_arguments_missing", status: 409 });
      }
      // The invocation's encrypted arguments are the source of truth on a
      // reconnect. Never re-encrypt a placeholder object: the helper enforces
      // the selector schema and the stored digest must remain unchanged.
      let toolArguments: unknown;
      try {
        toolArguments = JSON.parse(await this.envelope!.forClient(tx).decryptTextAsync(
          invocation.canonicalArgumentsCiphertext as unknown as AiEncryptedPayload,
        )) as unknown;
      } catch {
        throw new VeraAdmissionError({ code: "context_tool_arguments_unavailable", status: 409 });
      }
      const encrypted = await encryptContextToolInvocationAsync({
        toolArguments,
        result: input.result,
        envelope: this.envelope!.forClient(tx),
        objectId: invocation.id,
      });
      try {
        verifyContextToolInvocationDigests({
          toolArguments,
          result: input.result,
          argumentsDigest: invocation.argumentsDigest,
          resultDigest: encrypted.resultDigest,
          resultManifestDigest: encrypted.resultManifestDigest,
        });
      } catch {
        throw new VeraAdmissionError({ code: "context_tool_digest_conflict", status: 409 });
      }
      const resultDigest = encrypted.resultDigest;
      if (!resultDigest) throw new VeraAdmissionError({ code: "context_tool_invalid", status: 422 });
      const sources = [...(input.sources ?? [])];
      if (sources.length !== input.result.sources.length || sources.some((source, index) => {
        const projection = input.result.sources[index];
        return !projection || source.kind !== projection.kind || source.title !== projection.title || source.citationKey !== projection.citationKey;
      })) throw new VeraAdmissionError({ code: "context_tool_source_conflict", status: 409 });
      const createSourceIdentities = async (): Promise<void> => {
        for (const [index, source] of sources.entries()) {
          const sourceType = source.kind === "materi" ? "material" : "practice";
          // react-doctor-disable-next-line async-await-in-loop -- retain citation ordinal order while writing source identities.
          await tx.aiRequestSource.create({
            data: {
              id: randomUUID(),
              contextPackId: request.contextPack!.id,
              requestId: input.requestId,
              ordinal: index + 1,
              sourceType,
              sourceId: source.sourceId,
              citationKey: source.citationKey,
              titleSnapshot: source.title,
              citationLabel: source.title,
              contentDigest: source.releaseMetadata.versionDigest,
              snapshotBytes: 0,
              truncationJson: json({ truncated: false }),
              redactionPolicyVersion: "vera-redaction-v1",
              retentionPolicyVersion: request.retentionPolicyVersion ?? "unknown",
              purgeAt: request.contextPack!.purgeAt,
            },
          });
        }
      };
      if (invocation.state === "completed") {
        if (invocation.resultDigest !== resultDigest) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
        const persistedSources = await tx.aiRequestSource.findMany({
          where: { requestId: input.requestId },
          orderBy: { ordinal: "asc" },
          select: { ordinal: true, sourceType: true, sourceId: true, citationKey: true, titleSnapshot: true, contentDigest: true },
        });
        if (persistedSources.length !== sources.length || persistedSources.some((persisted, index) => {
          const source = sources[index];
          return !source
            || persisted.ordinal !== index + 1
            || persisted.sourceType !== (source.kind === "materi" ? "material" : "practice")
            || persisted.sourceId !== source.sourceId
            || persisted.citationKey !== source.citationKey
            || persisted.titleSnapshot !== source.title
            || persisted.contentDigest !== source.releaseMetadata.versionDigest;
        })) throw new VeraAdmissionError({ code: "context_tool_source_conflict", status: 409 });
        return { resultDigest, replayed: true };
      }
      if (invocation.state !== "executing") throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
      const changed = await tx.aiContextToolInvocation.updateMany({
        where: { id: invocation.id, requestId: input.requestId, state: "executing" },
        data: {
          state: "completed",
          resultManifestCiphertext: encrypted.resultManifestCiphertext ? json(encrypted.resultManifestCiphertext) : undefined,
          resultManifestDigest: encrypted.resultManifestDigest,
          resultDigest,
          selectedSourceCount: input.selectedSourceCount,
          resultByteCount: input.resultByteCount,
          truncationCount: input.truncationCount,
          registryLatencyMs: input.registryLatencyMs,
          errorCode: null,
          completedAt: now,
        },
      });
      if (changed.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
      await createSourceIdentities();
      return { resultDigest, replayed: false };
    });
  }

  async failAutomaticInvocation(input: { requestId: string; errorCode: string; now?: Date }): Promise<void> {
    const now = input.now ?? await this.databaseNow();
    await this.db.aiContextToolInvocation.updateMany({
      where: { requestId: input.requestId, state: { in: ["planned", "executing"] } },
      data: { state: "failed", errorCode: input.errorCode, failedAt: now },
    });
  }

  /** Freeze the final context pack and write the answer attempt before any
   * final transport. This is the second and last provider dispatch slot. */
  async prepareAutomaticAnswerStage(input: {
    requestId: string;
    pack?: PreparedContextPack;
    preparedProviderTask: PreparedProviderTask;
    /** Exact local free-router body, validated before the freeze transaction. */
    localOutboundPayload?: LocalOutboundPayload;
    /** Reauthorize only these persisted selected IDs inside the freeze transaction. */
    revalidateLocalSources?: (tx: Prisma.TransactionClient) => Promise<void>;
    now?: Date;
  }): Promise<PreparedProviderTask> {
    if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        include: { contextPack: true },
      });
      if (!request || !request.contextPack) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      const gateSnapshot = request.automaticContextGateSnapshot && typeof request.automaticContextGateSnapshot === "object" && !Array.isArray(request.automaticContextGateSnapshot)
        ? request.automaticContextGateSnapshot as Record<string, unknown>
        : null;
      const localProtocol = gateSnapshot?.protocol === "local_respan_free";
      const invocation = localProtocol ? null : await tx.aiContextToolInvocation.findUnique({ where: { requestId: input.requestId } });
      const localDecisionState = localProtocol
        ? await tx.aiContextDecision.findUnique({ where: { requestId: input.requestId }, select: { state: true } })
        : null;
      if (localProtocol
        ? (!input.localOutboundPayload || (localDecisionState?.state !== AiContextDecisionState.decided && localDecisionState?.state !== AiContextDecisionState.frozen))
        : (!invocation || invocation.state !== "completed")) {
        throw new VeraAdmissionError({ code: localProtocol ? "local_context_freeze_invalid" : "context_tool_invalid", status: 409 });
      }
      const existing = await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 2 } } });
      let localFreePriceSnapshot: Record<string, unknown> | null = null;
      if (input.localOutboundPayload) {
        if ((!existing && !input.revalidateLocalSources) || input.preparedProviderTask.routingOptions.kind !== "openrouter_free_poc") {
          throw new VeraAdmissionError({ code: "local_context_freeze_invalid", status: 409 });
        }
        localFreePriceSnapshot = gateSnapshot?.freePriceSnapshot && typeof gateSnapshot.freePriceSnapshot === "object" && !Array.isArray(gateSnapshot.freePriceSnapshot)
          ? gateSnapshot.freePriceSnapshot as Record<string, unknown>
          : null;
        const observedAt = typeof localFreePriceSnapshot?.observedAt === "string" ? Date.parse(localFreePriceSnapshot.observedAt) : Number.NaN;
        if (!localFreePriceSnapshot || !gateSnapshot
          || Object.keys(localFreePriceSnapshot).sort().join(",") !== "completionPriceUsdPerM,observedAt,promptPriceUsdPerM,provider,resolvedModel,routeModel,source"
          || localFreePriceSnapshot.routeModel !== "openrouter/free"
          || localFreePriceSnapshot.provider !== gateSnapshot.expectedFreeProvider
          || localFreePriceSnapshot.resolvedModel !== gateSnapshot.expectedFreeModel
          || localFreePriceSnapshot.promptPriceUsdPerM !== "0"
          || localFreePriceSnapshot.completionPriceUsdPerM !== "0"
          || localFreePriceSnapshot.source !== "openrouter-models-v1"
          || !Number.isFinite(observedAt) || observedAt > now.getTime() + 30_000 || now.getTime() - observedAt > 15 * 60_000
          || sha256Hex(canonicalJson(localFreePriceSnapshot)) !== gateSnapshot.freePriceSnapshotDigest) {
          throw new VeraAdmissionError({ code: "local_context_free_price_provenance_invalid", status: 409 });
        }
        const outboundBytes = input.preparedProviderTask.preparedTask.outboundPayloadBytes;
        if (!(outboundBytes instanceof Uint8Array)
          || sha256Hex(outboundBytes) !== input.localOutboundPayload.digest
          || Buffer.compare(Buffer.from(outboundBytes), Buffer.from(input.localOutboundPayload.bytes)) !== 0) {
          throw new VeraAdmissionError({ code: "local_context_payload_digest_conflict", status: 409 });
        }
        const frame = (citationKey: string, segment: string) => `[[e:${citationKey}]]\n${segment}\n[[/e]]`;
        const bodyText = input.localOutboundPayload.body.messages[0].content;
        if (input.pack && (input.pack.blocks.length !== input.localOutboundPayload.retainedSources.length
          || input.pack.blocks.some((block) => !input.localOutboundPayload!.retainedSources.some((source) =>
            source.citationKey === block.citationKey
            && source.evidenceSegments.some((segment) => segment.trim() && bodyText.includes(frame(source.citationKey, segment)))
            && block.content === source.evidenceSegments[0])))) {
          throw new VeraAdmissionError({ code: "local_context_evidence_payload_conflict", status: 409 });
        }
        if (!input.pack && !existing) throw new VeraAdmissionError({ code: "local_context_freeze_invalid", status: 409 });
        if (!existing) await input.revalidateLocalSources!(tx);
      }
      const providerRequestKey = input.preparedProviderTask.providerRequestKey?.trim() || providerRequestKeyFor(input.requestId, 2);
      const dispatchDeadlineAt = request.dispatchDeadlineAt ?? new Date(now.getTime() + 120 * 60_000);
      const preparedProviderTaskBase: PreparedProviderTask = {
        ...input.preparedProviderTask,
        providerRequestKey,
        dispatchDeadlineAt: dispatchDeadlineAt.toISOString(),
        preparedTask: {
          ...input.preparedProviderTask.preparedTask,
          requestId: input.requestId,
          attemptNo: 2,
          providerRequestKey,
          dispatchDeadlineAt: dispatchDeadlineAt.toISOString(),
          stagePurpose: "answer",
        },
        stagePurpose: "answer",
      };
      const exactProviderPayload = bindExactProviderPayload(preparedProviderTaskBase);
      const preparedProviderTask = exactProviderPayload.prepared;
      if (existing) {
        if (existing.stagePurpose !== AiRequestAttemptStagePurpose.answer
          || existing.finalPayloadHash !== (preparedProviderTask.finalPayloadHash ?? null)
          || existing.providerRequestKey !== providerRequestKey
          || existing.gateway !== preparedProviderTask.gateway
          || existing.upstreamProvider !== preparedProviderTask.upstreamProvider
          || existing.upstreamProviderSlug !== preparedProviderTask.upstreamProviderSlug
          || existing.model !== preparedProviderTask.model
          || existing.releaseManifestDigest !== (preparedProviderTask.manifestDigest ?? null)) {
          throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
        }
        if (input.localOutboundPayload) {
          const persistedDecision = await tx.aiContextDecision.findUnique({ where: { requestId: input.requestId } });
          if (persistedDecision?.state !== AiContextDecisionState.frozen
            || existing.finalPayloadHash !== input.localOutboundPayload.digest) {
            throw new VeraAdmissionError({ code: "local_context_freeze_invalid", status: 409 });
          }
        }
        return preparedProviderTask;
      }
      if (!input.pack) throw new VeraAdmissionError({ code: "context_pack_missing", status: 409 });
      const pack = input.pack;
      const encrypted = await encryptPreparedContextPackAsync(pack, this.envelope!.forClient(tx), `ai-pack:${input.requestId}`);
      await tx.aiContextPack.update({
        where: { id: request.contextPack.id },
        data: {
          contextPackVersion: pack.contextPackVersion,
          orderedBlockManifestJson: json(pack.blocks.map((block) => ({ ordinal: block.ordinal, sourceType: block.sourceType, sourceId: block.sourceId, citationKey: block.citationKey, titleSnapshot: block.titleSnapshot, citationLabel: block.citationLabel, contentDigest: block.contentDigest, redacted: block.redacted, truncated: block.truncated }))),
          normalizedTaskCiphertext: json(encrypted.normalizedTaskCiphertext),
          canonicalBytesCiphertext: json(encrypted.canonicalBytesCiphertext),
          byteCount: pack.byteCount,
          packDigest: pack.packDigest,
          truncationJson: json(pack.truncation),
          toolCallDigest: pack.toolCallDigest,
          toolResultDigest: pack.toolResultDigest,
          registryVersion: pack.registryVersion,
          resolverVersion: pack.resolverVersion,
          sourceManifestDigest: pack.sourceManifestDigest,
          providerTaskDigest: preparedProviderTask.providerTaskDigest,
        },
      });
      await tx.aiRequestSource.deleteMany({ where: { requestId: input.requestId } });
      await Promise.all(pack.blocks.map((block, index) => {
        const snapshot = encrypted.sourceSnapshots[index];
        return tx.aiRequestSource.create({
          data: {
            id: randomUUID(),
            contextPackId: request.contextPack!.id,
            requestId: input.requestId,
            ordinal: block.ordinal,
            sourceType: block.sourceType,
            sourceId: block.sourceId,
            citationKey: block.citationKey,
            titleSnapshot: block.titleSnapshot,
            citationLabel: block.citationLabel,
            contentDigest: block.contentDigest,
            boundedSnapshotCiphertext: snapshot ? json(snapshot) : undefined,
            snapshotBytes: Buffer.byteLength(block.content, "utf8"),
            truncationJson: json({ truncated: block.truncated }),
            redactionPolicyVersion: pack.redactionPolicyVersion,
            retentionPolicyVersion: request.retentionPolicyVersion ?? "unknown",
            purgeAt: request.contextPack!.purgeAt,
          },
        });
      }));
      let outboundPayloadCiphertext: AiEncryptedPayload | null = null;
      if (input.localOutboundPayload) {
        const bytes = input.preparedProviderTask.preparedTask.outboundPayloadBytes!;
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        outboundPayloadCiphertext = await this.envelope!.forClient(tx).encryptAsync(text, `ai-outbound:${input.requestId}:2`);
      }
      await tx.aiRequest.update({ where: { id: request.id }, data: { contextPackVersion: pack.contextPackVersion, providerTaskDigest: preparedProviderTask.providerTaskDigest, providerRequestKey, finalPayloadHash: preparedProviderTask.finalPayloadHash ?? null } });
      await tx.aiRequestAttempt.create({
        data: {
          requestId: request.id,
          attemptNo: 2,
          gateway: preparedProviderTask.gateway,
          upstreamProvider: preparedProviderTask.upstreamProvider,
          upstreamProviderSlug: preparedProviderTask.upstreamProviderSlug,
          model: preparedProviderTask.model,
          stagePurpose: AiRequestAttemptStagePurpose.answer,
          providerRequestKey,
          state: AiAttemptState.reserved,
          tokenUsageState: AiTokenUsageState.unknown,
          finalPayloadHash: preparedProviderTask.finalPayloadHash ?? null,
          dispatchDeadlineAt,
          certifierId: preparedProviderTask.certifierId ?? null,
          certifierVersion: preparedProviderTask.certifierVersion ?? null,
          priceSnapshot: input.localOutboundPayload && localFreePriceSnapshot
            ? json({ ...localFreePriceSnapshot, digest: sha256Hex(canonicalJson(localFreePriceSnapshot)) })
            : preparedProviderTask.priceSnapshot ? json(preparedProviderTask.priceSnapshot) : undefined,
          finalMeasuredBytes: exactProviderPayload.byteCount ?? pack.byteCount,
          finalMeasuredTokenUpperBound: preparedProviderTask.inputQuotaUnitsUpperBound,
          releaseManifestDigest: preparedProviderTask.manifestDigest,
          outboundPayloadCiphertext: outboundPayloadCiphertext ? json(outboundPayloadCiphertext) : undefined,
        },
      });
      if (input.localOutboundPayload) {
        const decision = await tx.aiContextDecision.findUnique({ where: { requestId: input.requestId } });
        if (!decision || decision.state !== AiContextDecisionState.decided) throw new VeraAdmissionError({ code: "local_context_freeze_invalid", status: 409 });
        const frozenEvidenceDigest = sha256Hex(canonicalJson({
          outboundDigest: input.localOutboundPayload.digest,
          sourceRows: input.pack.blocks.map((block) => ({ citationKey: block.citationKey, sourceId: block.sourceId, contentDigest: block.contentDigest })),
        }));
        const changed = await tx.aiContextDecision.updateMany({
          where: { requestId: input.requestId, state: AiContextDecisionState.decided },
          data: { state: AiContextDecisionState.frozen, frozenEvidenceDigest, frozenAt: now },
        });
        if (changed.count !== 1) throw new VeraAdmissionError({ code: "local_context_freeze_cas_conflict", status: 409 });
      }
      return preparedProviderTask;
    });
  }

  /** Record selector provider evidence without creating the final result
   * stage. Automatic requests accept exactly one attempt for this purpose. */
  async recordAutomaticStageResult(input: {
    requestId: string;
    preparedProviderTask: PreparedProviderTask;
    providerResult: ProviderResult;
    /** Selector arguments and provider evidence are committed atomically so a
     * crash cannot leave a successful selector result with no resumable call. */
    toolArguments?: unknown;
    invocationFailureCode?: string;
    now?: Date;
  }): Promise<void> {
    if (input.providerResult.attempts.length !== 1 || input.providerResult.attempts[0]?.attemptNo !== 1) throw new VeraAdmissionError({ code: "provider_attempt_terminal", status: 409 });
    if (input.toolArguments !== undefined && input.invocationFailureCode) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
    const now = input.now ?? await this.databaseNow();
    const attempt = input.providerResult.attempts[0];
    return this.db.$transaction(async (tx) => {
      const existing = await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: 1 } } });
      if (!existing || existing.stagePurpose !== AiRequestAttemptStagePurpose.context_selection) throw new VeraAdmissionError({ code: "provider_attempt_missing", status: 503 });
      const preparedPayloadHash = input.preparedProviderTask.finalPayloadHash ?? null;
      const returnedPayloadHash = attempt.finalPayloadHash ?? null;
      if (existing.finalPayloadHash !== preparedPayloadHash || (returnedPayloadHash !== null && returnedPayloadHash !== preparedPayloadHash)) {
        throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
      }
      if (existing.providerRequestKey !== (input.preparedProviderTask.providerRequestKey ?? null)
        || existing.gateway !== input.preparedProviderTask.gateway
        || existing.upstreamProvider !== input.preparedProviderTask.upstreamProvider
        || existing.upstreamProviderSlug !== input.preparedProviderTask.upstreamProviderSlug
        || existing.model !== input.preparedProviderTask.model
        || existing.releaseManifestDigest !== (input.preparedProviderTask.manifestDigest ?? null)) {
        throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
      }
      const observedPayloadHash = preparedPayloadHash;
      if (input.toolArguments !== undefined || input.invocationFailureCode) {
        const invocation = await tx.aiContextToolInvocation.findUnique({ where: { requestId: input.requestId } });
        if (!invocation) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
        if (input.toolArguments !== undefined) {
          if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });
          const encrypted = await encryptContextToolInvocationAsync({
            toolArguments: input.toolArguments,
            envelope: this.envelope.forClient(tx),
            objectId: invocation.id,
          });
          if (invocation.state === "executing" || invocation.state === "completed") {
            if (invocation.argumentsDigest !== encrypted.argumentsDigest) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
          } else if (invocation.state === "planned") {
            const changed = await tx.aiContextToolInvocation.updateMany({
              where: { id: invocation.id, requestId: input.requestId, state: "planned" },
              data: {
                state: "executing",
                canonicalArgumentsCiphertext: json(encrypted.canonicalArgumentsCiphertext),
                argumentsDigest: encrypted.argumentsDigest,
                errorCode: null,
                executingAt: now,
              },
            });
            if (changed.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
          } else {
            throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
          }
        } else if (invocation.state === "planned") {
          const changed = await tx.aiContextToolInvocation.updateMany({
            where: { id: invocation.id, requestId: input.requestId, state: "planned" },
            data: { state: "failed", errorCode: input.invocationFailureCode, failedAt: now },
          });
          if (changed.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
        } else if (invocation.state !== "failed" || invocation.errorCode !== input.invocationFailureCode) {
          throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
        }
      }
      await tx.aiRequestAttempt.update({
        where: { id: existing.id },
        data: {
          state: attempt.state as AiAttemptState,
          resultKind: AiAttemptResultKind.success,
          providerRequestRef: attempt.providerRequestRef,
          inputTokens: attempt.usage.inputTokens,
          outputTokens: attempt.usage.outputTokens,
          quotaUnitsConsumed: attempt.usage.quotaUnitsConsumed,
          tokenUsageState: attempt.usage.tokenUsageState as AiTokenUsageState,
          cachedTokens: attempt.usage.cachedTokens ?? null,
          cacheWriteTokens: attempt.usage.cacheWriteTokens ?? null,
          reasoningTokens: attempt.usage.reasoningTokens ?? null,
          reportedProviderCostUsdMicros: parseMicrosString(attempt.reportedCostMicros ?? attempt.usage.reportedCostMicros),
          recomputedProviderCostUsdMicros: parseMicrosString(attempt.recomputedCostMicros ?? attempt.usage.recomputedCostMicros),
          chargedProviderCostUsdMicros: parseMicrosString(attempt.reportedCostMicros ?? attempt.usage.reportedCostMicros),
          errorCode: attempt.errorCode,
          generationId: attempt.generationId ?? null,
          upstreamId: attempt.upstreamId ?? null,
          providerRequestId: attempt.providerRequestId ?? null,
          observedUpstreamProviderSlug: attempt.observedUpstreamProviderSlug ?? null,
          finalPayloadHash: observedPayloadHash,
          completedAt: now,
        },
      });
    });
  }

  /**
   * Move definitive late evidence from the unknown bucket to settled cost.
   * The correction is tied to one attempt/generation and is audited before
   * any lineage or window totals change. Replaying the same evidence hash is
   * a no-op, which makes worker retries safe after a process crash.
   */
  async correctV2QuotaFromEvidence(input: {
    requestId: string;
    attemptId: string;
    generationId: string;
    evidenceHash: string;
    chargedUsdMicros: bigint;
    now?: Date;
    actor?: string;
  }): Promise<VeraV2QuotaSettlement> {
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      // react-doctor-disable-next-line server-sequential-independent-await -- acquire the request lock before the attempt lock to preserve the quota lock order.
      await tx.$queryRaw`SELECT id FROM ai_request_attempts WHERE id = ${input.attemptId}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          ledgerVersion: true,
          creditCost: true,
          billingState: true,
          chargedProviderCostUsdMicros: true,
          overrunUsdMicros: true,
        },
      });
      // react-doctor-disable-next-line server-sequential-independent-await -- request and attempt are read after their locks on the same transaction connection.
      const attempt = await tx.aiRequestAttempt.findUnique({
        where: { id: input.attemptId },
        select: { id: true, requestId: true, generationId: true, state: true },
      });
      if (!request || request.ledgerVersion !== VERA_CREDIT_USD_V2 || attempt?.requestId !== request.id || attempt.generationId !== input.generationId) {
        throw new VeraAdmissionError({ code: "v2_generation_identity_mismatch", status: 409 });
      }
      const existingCorrection = await tx.aiBillingCorrectionEvent.findFirst({
        where: { requestId: request.id, generationId: input.generationId, evidenceHash: input.evidenceHash },
        orderBy: { createdAt: "desc" },
      });
      if (existingCorrection) {
        return {
          requestId: request.id,
          state: request.billingState === AiRequestBillingState.overrun ? "overrun" : "known",
          consumedCredits: request.creditCost,
          chargedUsdMicros: request.chargedProviderCostUsdMicros ?? 0n,
          unknownUsdMicros: 0n,
          overrunUsdMicros: request.overrunUsdMicros,
        };
      }
      const rows = await tx.aiRequestUsageReservation.findMany({ where: { requestId: request.id }, orderBy: { createdAt: "asc" } });
      if (rows.length === 0) throw new VeraAdmissionError({ code: "v2_lineage_missing", status: 409 });
      const windowIds = rows.map((row) => row.usageWindowId);
      for (const id of windowIds) {
        // react-doctor-disable-next-line async-await-in-loop -- lock correction windows in stable reservation order.
        await tx.$queryRaw`SELECT id FROM ai_usage_windows WHERE id = ${id}::uuid FOR UPDATE`;
      }
      const windows = await tx.aiUsageWindow.findMany({ where: { id: { in: windowIds } } });
      const byWindow = new Map(windows.map((window) => [window.id, window]));
      const monthlyRow = rows.find((row) => byWindow.get(row.usageWindowId)?.periodKind === AiUsageWindowPeriodKind.month);
      const monthlyWindow = monthlyRow ? byWindow.get(monthlyRow.usageWindowId) : undefined;
      if (!monthlyRow || !monthlyWindow) throw new VeraAdmissionError({ code: "v2_monthly_lineage_missing", status: 409 });
      const current: ReservationAmounts = {
        reservedCredits: monthlyRow.reservedCredits,
        consumedCredits: monthlyRow.consumedCredits,
        releasedCredits: monthlyRow.releasedCredits,
        reservedUsdMicros: monthlyRow.reservedUsdMicros,
        settledUsdMicros: monthlyRow.settledUsdMicros,
        unknownUsdMicros: monthlyRow.unknownUsdMicros,
        releasedUsdMicros: monthlyRow.releasedUsdMicros,
        overrunUsdMicros: monthlyRow.overrunUsdMicros,
      };
      const next = correctUnknownReservation({ current, chargedUsdMicros: input.chargedUsdMicros });
      if (current.unknownUsdMicros === 0n && next.settledUsdMicros === current.settledUsdMicros) {
        return {
          requestId: request.id,
          state: request.billingState === AiRequestBillingState.overrun ? "overrun" : "known",
          consumedCredits: request.creditCost,
          chargedUsdMicros: request.chargedProviderCostUsdMicros ?? current.settledUsdMicros,
          unknownUsdMicros: current.unknownUsdMicros,
          overrunUsdMicros: current.overrunUsdMicros,
        };
      }
      const nextState = next.overrunUsdMicros > 0n ? AiReservationState.overrun : AiReservationState.settled;
      await tx.aiBillingCorrectionEvent.create({
        data: {
          requestId: request.id,
          attemptId: attempt.id,
          generationId: input.generationId,
          oldAttemptState: attempt.state,
          newAttemptState: nextState === AiReservationState.overrun ? AiAttemptState.overrun : AiAttemptState.known,
          oldLineageState: monthlyRow.state,
          newLineageState: nextState,
          oldSettledUsdMicros: current.settledUsdMicros,
          newSettledUsdMicros: next.settledUsdMicros,
          oldUnknownUsdMicros: current.unknownUsdMicros,
          newUnknownUsdMicros: next.unknownUsdMicros,
          oldReleasedUsdMicros: current.releasedUsdMicros,
          newReleasedUsdMicros: next.releasedUsdMicros,
          oldOverrunUsdMicros: current.overrunUsdMicros,
          newOverrunUsdMicros: next.overrunUsdMicros,
          evidenceHash: input.evidenceHash,
          reason: "late_generation_evidence",
          actor: input.actor ?? "vera-ai-reconciliation-worker",
        },
      });
      await tx.aiRequestUsageReservation.update({ where: { id: monthlyRow.id }, data: {
        settledUsdMicros: next.settledUsdMicros,
        unknownUsdMicros: next.unknownUsdMicros,
        releasedUsdMicros: next.releasedUsdMicros,
        overrunUsdMicros: next.overrunUsdMicros,
        state: nextState,
        settledAt: now,
      } });
      await tx.aiUsageWindow.update({ where: { id: monthlyWindow.id }, data: {
        settledUsdMicros: { increment: next.settledUsdMicros - current.settledUsdMicros },
        unknownUsdMicros: { decrement: current.unknownUsdMicros - next.unknownUsdMicros },
        overrunUsdMicros: { increment: next.overrunUsdMicros - current.overrunUsdMicros },
        monetaryDebtState: next.overrunUsdMicros > 0n ? AiMonetaryDebtState.debt : undefined,
      } });
      const state = nextState === AiReservationState.overrun ? "overrun" : "known";
      await tx.aiRequest.update({ where: { id: request.id }, data: {
        billingState: state === "overrun" ? AiRequestBillingState.overrun : AiRequestBillingState.known,
        creditReservationState: state === "overrun" ? AiReservationState.overrun : AiReservationState.settled,
        chargedProviderCostUsdMicros: next.settledUsdMicros,
        overrunUsdMicros: next.overrunUsdMicros,
      } });
      return {
        requestId: request.id,
        state,
        consumedCredits: request.creditCost,
        chargedUsdMicros: next.settledUsdMicros,
        unknownUsdMicros: next.unknownUsdMicros,
        overrunUsdMicros: next.overrunUsdMicros,
      };
    });
  }

  async readV2Usage(input: { studentId: string; now?: Date }): Promise<VeraUsageDto | null> {
    const now = input.now ?? new Date();
    if (ledgerVersionFor(now) !== VERA_CREDIT_USD_V2) return null;
    const calendar = await this.db.aiQuotaCalendar.findUnique({ where: { studentId_ledgerVersion: { studentId: input.studentId, ledgerVersion: VERA_CREDIT_USD_V2 } } });
    if (!calendar?.currentMonthlyWindowId) return null;
    const keys = deriveV2WindowKeys(now, calendar.quotaTimezone);
    const windows = await this.db.aiUsageWindow.findMany({ where: {
      studentId: input.studentId,
      ledgerVersion: VERA_CREDIT_USD_V2,
      OR: [
        { periodKind: AiUsageWindowPeriodKind.day, windowKey: keys.day.key },
        { periodKind: AiUsageWindowPeriodKind.iso_week, windowKey: keys.isoWeek.key },
        { periodKind: AiUsageWindowPeriodKind.month, windowKey: keys.month.key },
      ],
    } });
    if (windows.length !== 3) return null;
    return toVeraUsageDto(windows.map(v2WindowSnapshot), calendar.quotaTimezone);
  }

  async databaseNow(tx: Prisma.TransactionClient = this.db): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new VeraAdmissionError({ code: "db_clock_unavailable", status: 503 });
    return now;
  }

  async assertRetryTargetEligible(input: {
    requestId: string;
    studentId: string;
    conversationId: string;
    featureKey: string;
    text: string;
  }): Promise<void> {
    const target = await this.db.aiRequest.findFirst({
      where: { id: input.requestId, studentId: input.studentId, conversationId: input.conversationId },
      select: {
        status: true,
        featureKey: true,
        userMessageId: true,
        userMessage: { select: { contentDigest: true, contentState: true } },
      },
    });
    if (!target || target.status !== AiRequestLifecycleState.failed || target.featureKey !== input.featureKey
      || !target.userMessageId || target.userMessage?.contentState !== AiContentLifecycleState.encrypted
      || target.userMessage.contentDigest !== sha256Hex(input.text)) {
      throw new VeraAdmissionError({ code: "retry_target_unavailable", status: 409 });
    }
  }

  async resolveActivePolicyBundle(tx: Prisma.TransactionClient, now: Date): Promise<VeraPolicyBundle> {
    const bundles = await tx.aiPolicyBundle.findMany({
      where: {
        effectiveAt: { lte: now },
        state: { in: ["active", "scheduled"] },
      },
      orderBy: { effectiveAt: "desc" },
    });
    if (bundles.length !== 1) throw new VeraAdmissionError({ code: "vera_not_active", status: 503, details: { candidateCount: bundles.length } });
    const bundle = bundles[0];
    if (!bundle) throw new VeraAdmissionError({ code: "vera_not_active", status: 503 });
    return {
      bundleVersion: bundle.bundleVersion,
      configSchemaVersion: bundle.configSchemaVersion,
      state: bundle.state,
      effectiveAt: bundle.effectiveAt,
      quotaConfig: bundle.quotaConfig as unknown as VeraPolicyBundle["quotaConfig"],
      settlementConfig: bundle.settlementConfig as unknown as VeraPolicyBundle["settlementConfig"],
      reportConfig: bundle.reportConfig as unknown as VeraPolicyBundle["reportConfig"],
      retentionConfig: bundle.retentionConfig as unknown as VeraPolicyBundle["retentionConfig"],
      validationDigest: bundle.validationDigest,
    };
  }

  async snapshotForStudent(input: {
    tx: Prisma.TransactionClient;
    studentId: string;
    now: Date;
    featureKey?: string;
  }): Promise<VeraPolicySnapshot> {
    const [policy, billing, profile] = await Promise.all([
      this.resolveActivePolicyBundle(input.tx, input.now),
      input.tx.billingAccount.findUnique({ where: { studentId: input.studentId }, select: { planCode: true, status: true } }),
      input.tx.studentProfile.findUnique({ where: { userId: input.studentId }, select: { timezone: true, dailyAiTokenLimit: true } }),
    ]);
    // Explicitly do not consult dailyAiTokenLimit. Selecting it above keeps
    // the compatibility boundary visible to review without making it an
    // admission authority.
    void profile?.dailyAiTokenLimit;
    const resolvedBilling: BillingPlan | null = billing ? { planCode: billing.planCode, status: billing.status } : null;
    const resolved = resolveVeraQuotaLimit({ now: input.now, billing: resolvedBilling, policy });
    if (!resolved.active) throw new VeraAdmissionError({ code: "vera_not_active", status: 422 });
    return snapshotVeraPolicy({
      policy,
      billing: resolvedBilling,
      now: input.now,
      timezone: profile?.timezone ?? "Asia/Jakarta",
      featureKey: input.featureKey ?? "vera.chat",
    });
  }

  async snapshotForStudentAt(input: {
    studentId: string;
    now: Date;
    featureKey?: string;
  }): Promise<VeraPolicySnapshot> {
    return this.db.$transaction((tx) => this.snapshotForStudent({ ...input, tx }));
  }

  async lookupIdempotencyKey(studentId: string, clientRequestId: string) {
    return this.db.aiIdempotencyKey.findUnique({
      where: {
        studentId_operation_clientRequestId: {
          studentId,
          operation: AiIdempotencyOperation.ai_request,
          clientRequestId,
        },
      },
    });
  }

  async recordRejectedAdmission(input: {
    studentId: string;
    clientRequestId: string;
    requestFingerprint: string;
    featureKey: string;
    policy: VeraPolicySnapshot;
    now: Date;
    code: string;
    reason?: "quota" | "quota_overrun_lock" | "burst" | "concurrency" | "redis_unavailable";
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const existing = await tx.aiIdempotencyKey.findUnique({
        where: {
          studentId_operation_clientRequestId: {
            studentId: input.studentId,
            operation: AiIdempotencyOperation.ai_request,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      const key = existing ?? await tx.aiIdempotencyKey.create({
        data: {
          studentId: input.studentId,
          operation: AiIdempotencyOperation.ai_request,
          clientRequestId: input.clientRequestId,
          requestFingerprint: input.requestFingerprint,
          fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
          policyBundleVersion: input.policy.bundleVersion,
          retentionPolicyVersion: input.policy.bundleVersion,
          state: AiIdempotencyState.rejected,
          rejectionClass: AiRejectionClass.transient,
          rejectionCode: input.code,
          expiresAt: new Date(input.now.getTime() + input.policy.policy.retentionConfig.rejectedKeyTtlHours * 60 * 60_000),
          lastSeenAt: input.now,
        },
      });
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${key.id}::uuid FOR UPDATE`;
      const lockedKey = await tx.aiIdempotencyKey.findUnique({ where: { id: key.id } });
      if (!lockedKey || lockedKey.state === AiIdempotencyState.accepted || lockedKey.state === AiIdempotencyState.expired) return;
      await tx.aiIdempotencyKey.updateMany({
        where: { id: lockedKey.id, version: lockedKey.version, state: AiIdempotencyState.rejected },
        data: {
          requestFingerprint: input.requestFingerprint,
          fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
          policyBundleVersion: input.policy.bundleVersion,
          rejectionClass: AiRejectionClass.transient,
          rejectionCode: input.code,
          lastSeenAt: input.now,
          terminalAt: null,
          expiresAt: new Date(input.now.getTime() + input.policy.policy.retentionConfig.rejectedKeyTtlHours * 60 * 60_000),
          version: { increment: 1 },
        },
      });
      if (input.reason) {
        const localDay = quotaDateAndDayEnd(input.now, input.policy.timezone);
        await this.createAdmissionEvent(tx, {
          studentId: input.studentId,
          idempotencyKeyId: key.id,
          featureKey: input.featureKey,
          policy: input.policy,
          usageDate: localDay.usageDate,
          reason: input.reason,
          now: input.now,
        });
      }
    });
  }

  async admitPreparedRequest(input: PersistPreparedAdmissionInput): Promise<PersistedAdmission> {
    const featureTuple = {
      requestType: input.requestType ?? AiConversationType.vera_chat,
      behaviorVersion: input.behaviorVersion ?? "1",
      outputSchemaVersion: input.outputSchemaVersion ?? "1",
      outputSchemaId: input.outputSchemaId ?? "vera.chat.freeform.v1",
      outputSchemaHash: input.outputSchemaHash ?? input.pack.toolSchemaHash,
    };
    const localProtocol = input.automaticContextGateSnapshot?.protocol === "local_respan_free";
    if (localProtocol !== (input.localContextShortlist !== undefined)
      || localProtocol && ((input.localContextShortlist!.length > 0) !== (input.localSelectorRequest !== undefined))
      || localProtocol !== (input.localSelectorPriceSnapshotDigest !== undefined)) {
      throw new VeraAdmissionError({ code: "local_context_shortlist_missing", status: 422 });
    }
    if (localProtocol && (!this.envelope || input.localContextShortlist!.length > 12
      || input.localSelectorRequest && input.localSelectorRequest.digest !== sha256Hex(input.localSelectorRequest.bytes)
      || input.localSelectorPriceSnapshotDigest!.length !== 64)) {
      throw new VeraAdmissionError({ code: "local_context_shortlist_invalid", status: 422 });
    }
    try {
      return await this.db.$transaction(async (tx) => {
      const existing = await tx.aiIdempotencyKey.findUnique({
        where: {
          studentId_operation_clientRequestId: {
            studentId: input.studentId,
            operation: AiIdempotencyOperation.ai_request,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      let idempotencyKey = existing;
      let lockedAt: Date | null = null;
      if (existing) {
        await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${existing.id}::uuid FOR UPDATE`;
        const lockedExisting = await tx.aiIdempotencyKey.findUnique({ where: { id: existing.id } });
        lockedAt = await this.databaseNow(tx);
        if (!lockedExisting) throw new VeraAdmissionError({ code: "idempotency_key_expired", status: 409 });
        idempotencyKey = lockedExisting;
        if (lockedExisting.expiresAt <= lockedAt || lockedExisting.state === AiIdempotencyState.expired) {
          throw new VeraAdmissionError({ code: "idempotency_key_expired", status: 409 });
        }
        if (lockedExisting.requestFingerprint !== input.requestFingerprint) {
          throw new VeraAdmissionError({ code: "idempotency_conflict", status: 409 });
        }
        if (lockedExisting.resultId) return this.readExistingAdmission(tx, lockedExisting.resultId, lockedExisting.id);
        if (lockedExisting.state === AiIdempotencyState.accepted || lockedExisting.rejectionClass === AiRejectionClass.terminal) {
          throw new VeraAdmissionError({ code: "request_pending", status: 202 });
        }
      }

      // The HTTP-side snapshot is only an optimistic admission hint. Re-read
      // the database clock, policy bundle, BillingAccount plan, and profile
      // timezone under the accepting transaction, with write-side policy and
      // account locks held until commit. Any drift aborts before an accepted
      // idempotency/request/ledger row can become visible. Existing replay
      // rows returned above never reach this policy lock boundary.
      const transactionNow = lockedAt ?? await this.databaseNow(tx);
      await tx.$executeRaw`LOCK TABLE ai_policy_bundles IN SHARE MODE`;
      await tx.$queryRaw`SELECT id FROM billing_accounts WHERE student_id = ${input.studentId}::uuid FOR SHARE`;
      await tx.$queryRaw`SELECT user_id FROM student_profiles WHERE user_id = ${input.studentId}::uuid FOR SHARE`;
      const transactionPolicy = await this.snapshotForStudent({ tx, studentId: input.studentId, now: transactionNow, featureKey: input.featureKey });
      assertPolicySnapshotStable(input.policy, transactionPolicy);
      if (transactionNow < transactionPolicy.policy.effectiveAt) throw new VeraAdmissionError({ code: "vera_not_active", status: 422 });
      input = { ...input, now: transactionNow, policy: transactionPolicy };
      if (input.now < input.policy.policy.effectiveAt) throw new VeraAdmissionError({ code: "vera_not_active", status: 422 });
      idempotencyKey ??= await tx.aiIdempotencyKey.create({
        data: {
          studentId: input.studentId,
          operation: AiIdempotencyOperation.ai_request,
          clientRequestId: input.clientRequestId,
          requestFingerprint: input.requestFingerprint,
          fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
          policyBundleVersion: input.policy.bundleVersion,
          retentionPolicyVersion: input.retentionPolicyVersion ?? input.policy.bundleVersion,
          state: AiIdempotencyState.rejected,
          expiresAt: new Date(input.now.getTime() + input.policy.policy.retentionConfig.rejectedKeyTtlHours * 60 * 60_000),
        },
      });
      // Lock order starts with the idempotency row. The pre-cutover ledger
      // keeps its historical token reservation; v2 admits against the
      // weighted day/week/month credit ledger instead.
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${idempotencyKey.id}::uuid FOR UPDATE`;

      const isV2 = input.policy.ledgerVersion === VERA_CREDIT_USD_V2;
      const localDay = quotaDateAndDayEnd(input.now, input.policy.timezone);
      const usageDate = dateOnly(localDay.usageDate);
      const reservation = isV2 ? input.policy.creditCost : input.preparedProviderTask.certifiedEstimate.reservationBound;
      assertPositiveInteger(reservation, isV2 ? "creditCost" : "reservationBound");
      let ledger: Awaited<ReturnType<typeof tx.aiUsageDaily.upsert>> | null = null;
      if (!isV2) {
        ledger = await tx.aiUsageDaily.upsert({
          where: {
            studentId_usageDate_ledgerVersion: {
              studentId: input.studentId,
              usageDate,
              ledgerVersion: AiUsageLedgerVersion.vera_quota_v1,
            },
          },
          create: {
            studentId: input.studentId,
            usageDate,
            ledgerVersion: AiUsageLedgerVersion.vera_quota_v1,
            policyBundleVersion: input.policy.bundleVersion,
            quotaLimitUnitsSnapshot: input.policy.quotaLimitUnits,
            quotaTimezone: input.policy.timezone,
            quotaTimezonePolicyVersion: input.policy.timezonePolicyVersion,
          },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE id = ${ledger.id}::uuid FOR UPDATE`;
        if (ledger.quotaOverrunLockUntil && ledger.quotaOverrunLockUntil > input.now) {
          await this.rejectAdmissionKey(tx, idempotencyKey, "quota_overrun_lock", input.now);
          await this.createAdmissionEvent(tx, {
            studentId: input.studentId,
            idempotencyKeyId: idempotencyKey.id,
            featureKey: input.featureKey,
            policy: input.policy,
            usageDate: localDay.usageDate,
            reason: "quota_overrun_lock",
            now: input.now,
          });
          return { accepted: false, requestId: "", idempotencyKeyId: idempotencyKey.id, userMessageId: "", contextPackId: "", usageDate: localDay.usageDate, quotaUnitsReserved: 0, rejectionCode: "quota_overrun_lock" };
        }
        if (ledger.usedQuotaUnits + ledger.reservedQuotaUnits + reservation > ledger.quotaLimitUnitsSnapshot + ledger.quotaDebtUnits) {
          await this.rejectAdmissionKey(tx, idempotencyKey, "quota", input.now);
          await this.createAdmissionEvent(tx, {
            studentId: input.studentId,
            idempotencyKeyId: idempotencyKey.id,
            featureKey: input.featureKey,
            policy: input.policy,
            usageDate: localDay.usageDate,
            reason: "quota",
            now: input.now,
          });
          return { accepted: false, requestId: "", idempotencyKeyId: idempotencyKey.id, userMessageId: "", contextPackId: "", usageDate: localDay.usageDate, quotaUnitsReserved: 0, rejectionCode: "quota" };
        }
      }

      const conversation = await tx.aiConversation.findFirst({ where: { id: input.conversationId, studentId: input.studentId, deletionState: "active", archivedAt: null }, select: { id: true } });
      if (!conversation) throw new VeraAdmissionError({ code: "target_unavailable", status: 404 });
      await tx.$queryRaw`SELECT id FROM ai_conversations WHERE id = ${conversation.id}::uuid FOR UPDATE`;
      const sequenceRows = await tx.$queryRaw<Array<{ next_request_sequence: number }>>`
        SELECT next_request_sequence FROM ai_conversations WHERE id = ${conversation.id}::uuid FOR UPDATE
      `;
      const conversationSequence = (sequenceRows[0]?.next_request_sequence ?? 0) + 1;
      await tx.aiConversation.update({ where: { id: conversation.id }, data: { nextRequestSequence: conversationSequence } });
      const retryTarget = input.retryOfRequestId
        ? await tx.aiRequest.findFirst({
          where: { id: input.retryOfRequestId, studentId: input.studentId, conversationId: input.conversationId },
          select: {
            userMessageId: true,
            status: true,
            featureKey: true,
            requestType: true,
            behaviorVersion: true,
            outputSchemaVersion: true,
            outputSchemaId: true,
            outputSchemaHash: true,
            contextPackVersion: true,
            userMessage: { select: { contentDigest: true, contentState: true } },
          },
        })
        : null;
      if (retryTarget && (
        retryTarget.status !== AiRequestLifecycleState.failed
        ||
        retryTarget.featureKey !== input.featureKey
        || retryTarget.requestType !== featureTuple.requestType
        || retryTarget.behaviorVersion !== featureTuple.behaviorVersion
        || retryTarget.outputSchemaVersion !== featureTuple.outputSchemaVersion
        || retryTarget.outputSchemaId !== featureTuple.outputSchemaId
        || retryTarget.outputSchemaHash !== featureTuple.outputSchemaHash
        || retryTarget.contextPackVersion !== input.pack.contextPackVersion
        || retryTarget.userMessage?.contentState !== AiContentLifecycleState.encrypted
        || retryTarget.userMessage.contentDigest !== sha256Hex(input.text)
      )) throw new VeraAdmissionError({ code: "retry_target_unavailable", status: 409 });
      const userMessageId = retryTarget?.userMessageId ?? null;
      if (input.retryOfRequestId && !userMessageId) throw new VeraAdmissionError({ code: "retry_target_unavailable", status: 409 });
      const durableUserMessageId = userMessageId ?? randomUUID();
      if (!userMessageId) {
        const envelope = this.envelope
          ? await this.envelope.forClient(tx).encryptAsync(input.text, `ai-message:${durableUserMessageId}`)
          : null;
        await tx.aiMessage.create({
          data: {
            id: durableUserMessageId,
            conversationId: input.conversationId,
            role: "user",
            contentMarkdown: null,
            contentEnvelope: envelope ? json(envelope) : undefined,
            contentState: AiContentLifecycleState.encrypted,
            contentDigest: envelope?.plaintextDigest,
            metadataState: AiContentLifecycleState.legacy_plaintext,
          },
        });
      }

      const encrypted = this.envelope
        ? await encryptPreparedContextPackAsync(input.pack, this.envelope.forClient(tx), `ai-pack:${input.clientRequestId}`)
        : null;
      const contextPackId = randomUUID();
      const requestId = randomUUID();
      const contextPurgeAt = new Date(
        input.now.getTime() + input.policy.policy.retentionConfig.contextEvidenceTtlDays * 24 * 60 * 60_000,
      );
      const attemptNo = 1;
      const providerRequestKey = input.preparedProviderTask.providerRequestKey?.trim()
        || providerRequestKeyFor(requestId, attemptNo);
      const dispatchDeadlineAt = input.policy.settlementDeadlineAt;
      const providerTaskForDispatchBase: PreparedProviderTask = {
        ...input.preparedProviderTask,
        providerRequestKey,
        dispatchDeadlineAt: dispatchDeadlineAt.toISOString(),
        preparedTask: {
          ...input.preparedProviderTask.preparedTask,
          requestId,
          attemptNo,
          providerRequestKey,
          dispatchDeadlineAt: dispatchDeadlineAt.toISOString(),
        },
      };
      const exactProviderPayload = bindExactProviderPayload(providerTaskForDispatchBase);
      const providerTaskForDispatch = exactProviderPayload.prepared;
      // AiContextPack and AiRequestSource have immediate parent FKs to the
      // request. Create the request parent first; the whole sequence remains
      // inside this transaction so any later snapshot failure rolls back the
      // parent, user message, ledger reservation, and idempotency CAS.
      const request = await tx.aiRequest.create({
        data: {
          id: requestId,
          studentId: input.studentId,
          conversationId: input.conversationId,
          requestType: featureTuple.requestType,
          status: AiRequestLifecycleState.pending,
          idempotencyKeyId: idempotencyKey.id,
          clientRequestId: input.clientRequestId,
          requestFingerprint: input.requestFingerprint,
          fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
          featureKey: input.featureKey,
          behaviorVersion: featureTuple.behaviorVersion,
          outputSchemaVersion: featureTuple.outputSchemaVersion,
          outputSchemaId: featureTuple.outputSchemaId,
          outputSchemaHash: featureTuple.outputSchemaHash,
          contextPackVersion: input.pack.contextPackVersion,
          gateway: input.preparedProviderTask.gateway,
          upstreamProvider: input.preparedProviderTask.upstreamProvider,
          upstreamProviderSlug: input.preparedProviderTask.upstreamProviderSlug,
          routingPolicyVersion: input.preparedProviderTask.routingPolicyVersion,
          providerEndpointDigest: input.preparedProviderTask.endpointMetadataDigest,
          providerTaskDigest: providerTaskForDispatch.providerTaskDigest,
          quotaPolicyVersion: input.policy.policy.quotaConfig.quotaVersion,
          policyBundleVersion: input.policy.bundleVersion,
          automaticContextGateSnapshot: input.automaticContextGateSnapshot ? json(input.automaticContextGateSnapshot) : undefined,
          retentionPolicyVersion: input.retentionPolicyVersion ?? "vera-retention-v1",
          settlementDeadlineAt: input.policy.settlementDeadlineAt,
          stageRetentionExpiresAt: input.stageRetentionExpiresAt
            ?? new Date(input.now.getTime() + input.policy.policy.retentionConfig.stageTtlHours * 60 * 60_000),
          hardOutputQuotaUnits: input.policy.hardOutputQuotaUnits,
          maxProviderAttempts: 2,
          quotaUnitsReserved: reservation,
          quotaUnitsConsumed: 0,
          providerRequestKey,
          dispatchDeadlineAt,
          certifierId: providerTaskForDispatch.certifierId ?? null,
          certifierVersion: providerTaskForDispatch.certifierVersion ?? null,
          priceSnapshot: providerTaskForDispatch.priceSnapshot ? json(providerTaskForDispatch.priceSnapshot) : undefined,
          ledgerVersion: input.policy.ledgerVersion,
          creditCost: isV2 ? input.policy.creditCost : 0,
          creditReservationState: isV2 ? AiReservationState.reserved : undefined,
          billingState: isV2 ? AiRequestBillingState.prepared : undefined,
          conversationSequence,
          historyCutoffSequence: conversationSequence,
          tokenUsageState: AiTokenUsageState.unknown,
          usageAccountingState: AiUsageAccountingState.unknown,
          startedAt: input.now,
          userMessageId: durableUserMessageId,
          retryOfRequestId: input.retryOfRequestId ?? undefined,
        },
      });
      if (!localProtocol) {
        await tx.aiRequestAttempt.create({
          data: {
            requestId: request.id,
            attemptNo,
            gateway: providerTaskForDispatch.gateway,
            upstreamProvider: providerTaskForDispatch.upstreamProvider,
            upstreamProviderSlug: providerTaskForDispatch.upstreamProviderSlug,
            model: providerTaskForDispatch.model,
            stagePurpose: input.stagePurpose ?? (input.automaticContext ? AiRequestAttemptStagePurpose.context_selection : AiRequestAttemptStagePurpose.answer),
            providerRequestKey,
            state: AiAttemptState.reserved,
            creditCost: isV2 ? input.policy.creditCost : reservation,
            tokenUsageState: AiTokenUsageState.unknown,
            finalPayloadHash: providerTaskForDispatch.finalPayloadHash ?? null,
            dispatchDeadlineAt,
            certifierId: providerTaskForDispatch.certifierId ?? null,
            certifierVersion: providerTaskForDispatch.certifierVersion ?? null,
            priceSnapshot: providerTaskForDispatch.priceSnapshot ? json(providerTaskForDispatch.priceSnapshot) : undefined,
            finalMeasuredBytes: exactProviderPayload.byteCount ?? input.pack.byteCount,
            finalMeasuredTokenUpperBound: providerTaskForDispatch.inputQuotaUnitsUpperBound,
            releaseManifestDigest: providerTaskForDispatch.manifestDigest,
          },
        });
      }
      if (input.automaticContext && !localProtocol) {
        // requestId is the lifecycle owner and the unique request FK makes
        // duplicate/replayed admission unable to create a second invocation.
        await tx.aiContextToolInvocation.create({
          data: {
            requestId: request.id,
            toolName: VERA_CONTEXT_TOOL_NAME,
            toolSchemaVersion: VERA_CONTEXT_TOOL_SCHEMA_ID,
            registryVersion: VERA_CONTEXT_REGISTRY_VERSION,
            resolverVersion: VERA_CONTEXT_RESOLVER_VERSION,
            state: "planned",
            retentionClass: "vera-context-tool",
            retentionPolicyVersion: input.retentionPolicyVersion ?? input.policy.bundleVersion,
            purgeAt: contextPurgeAt,
          },
        });
      }
      if (localProtocol) {
        const candidateKeys = input.localSelectorRequest?.candidateKeys ?? [];
        const candidateKeySet = new Set(candidateKeys);
        const candidateMap = input.localContextShortlist!
          .filter((candidate) => candidateKeySet.has(candidate.key))
          .map((candidate) => {
            if (!/^cand_[0-9]{2}$/u.test(candidate.key)
              || !candidate.stableSourceId.trim()
              || !candidate.title.trim()
              || !candidate.versionDigest.trim()
              || candidate.evidenceSegments?.some((segment) => segment.trim())) {
              throw new VeraAdmissionError({ code: "local_context_shortlist_invalid", status: 422 });
            }
            return {
              key: candidate.key,
              kind: candidate.kind,
              stableSourceId: candidate.stableSourceId,
              title: candidate.title,
              topic: candidate.topic,
              teaser: candidate.teaser,
              releasedAt: candidate.releasedAt,
              versionDigest: candidate.versionDigest,
              releaseVersionHandle: candidate.releaseVersionHandle ?? null,
              priorHint: candidate.priorHint ?? null,
              priorHints: candidate.priorHints ?? [],
            };
          });
        if (candidateMap.length !== candidateKeys.length || new Set(candidateMap.map((candidate) => candidate.key)).size !== candidateMap.length) {
          throw new VeraAdmissionError({ code: "local_context_shortlist_invalid", status: 422 });
        }
        const candidateMapText = canonicalJson(candidateMap);
        const candidateMapCiphertext = await this.envelope!.forClient(tx).encryptAsync(candidateMapText, `ai-context-decision:${request.id}:shortlist`);
        const selectorRequestText = input.localSelectorRequest
          ? new TextDecoder("utf-8", { fatal: true }).decode(input.localSelectorRequest.bytes)
          : null;
        if (input.localSelectorRequest && selectorRequestText !== canonicalJson(input.localSelectorRequest.body)) throw new VeraAdmissionError({ code: "local_context_selector_request_invalid", status: 422 });
        const selectorRequestCiphertext = selectorRequestText
          ? await this.envelope!.forClient(tx).encryptAsync(selectorRequestText, `ai-context-decision:${request.id}:selector-request`)
          : null;
        const selectorState = candidateKeys.length > 0 ? AiContextDecisionState.shortlisted : AiContextDecisionState.unavailable;
        await tx.aiContextDecision.create({
          data: {
            requestId: request.id,
            protocolVersion: VERA_LOCAL_DECISION_PROTOCOL,
            selectorKind: "respan_span01_lite",
            state: selectorState,
            candidateMapCiphertext: json(candidateMapCiphertext),
            candidateMapDigest: sha256Hex(candidateMapText),
            ...(selectorRequestCiphertext ? { selectorRequestCiphertext: json(selectorRequestCiphertext) } : {}),
            selectorRequestDigest: input.localSelectorRequest?.digest,
            selectorPriceSnapshotDigest: input.localSelectorPriceSnapshotDigest,
            selectorCostUsdMicros: null,
            selectorCostProvenance: null,
            networkDispatchCount: 0,
            ...(candidateKeys.length === 0 ? { errorCode: "no_match", failedAt: input.now } : {}),
          },
        });
        if (input.localSelectorRequest) await tx.aiRequestAttempt.create({
          data: {
            requestId: request.id,
            attemptNo: 1,
            gateway: "respan",
            upstreamProvider: "respan",
            upstreamProviderSlug: "respan-01-free",
            model: "respan-01-free",
            stagePurpose: AiRequestAttemptStagePurpose.context_selection,
            providerRequestKey,
            state: AiAttemptState.reserved,
            creditCost: isV2 ? input.policy.creditCost : reservation,
            tokenUsageState: AiTokenUsageState.unknown,
            finalPayloadHash: input.localSelectorRequest.digest,
            dispatchDeadlineAt,
            finalMeasuredBytes: input.localSelectorRequest.bytes.byteLength,
          },
        });
      }
      if (isV2) {
        await reserveV2QuotaInAdmissionTransaction(tx, {
          studentId: input.studentId,
          requestId: request.id,
          now: input.now,
          quotaTimezone: input.policy.timezone,
          policyBundleVersion: input.policy.bundleVersion,
          quotaPolicyVersion: input.policy.policy.quotaConfig.quotaVersion,
          creditCost: input.policy.creditCost,
          maxProviderCostUsdMicros: input.policy.maxProviderCostUsdMicros,
        });
      }
      await tx.aiContextPack.create({
        data: {
          id: contextPackId,
          requestId,
          packSchemaVersion: "vera-context-pack-v1",
          contextPackVersion: input.pack.contextPackVersion,
          orderedBlockManifestJson: json(input.pack.blocks.map((block) => ({
            ordinal: block.ordinal,
            sourceType: block.sourceType,
            sourceId: block.sourceId,
            citationKey: block.citationKey,
            titleSnapshot: block.titleSnapshot,
            citationLabel: block.citationLabel,
            contentDigest: block.contentDigest,
            redacted: block.redacted,
            truncated: block.truncated,
          }))),
          normalizedTaskCiphertext: encrypted ? json(encrypted.normalizedTaskCiphertext) : undefined,
          canonicalBytesCiphertext: encrypted ? json(encrypted.canonicalBytesCiphertext) : undefined,
          byteCount: input.pack.byteCount,
          packDigest: input.pack.packDigest,
          truncationJson: json(input.pack.truncation),
          redactionPolicyVersion: input.pack.redactionPolicyVersion,
          conversationMessageManifestCiphertext: json(input.pack.messageManifest),
          systemPolicyHash: input.pack.systemPolicyHash,
          promptTemplateHash: input.pack.promptTemplateHash,
          toolSchemaHash: input.pack.toolSchemaHash,
          toolCallDigest: input.pack.toolCallDigest,
          toolResultDigest: input.pack.toolResultDigest,
          registryVersion: input.pack.registryVersion,
          resolverVersion: input.pack.resolverVersion,
          sourceManifestDigest: input.pack.sourceManifestDigest,
          providerTaskDigest: input.preparedProviderTask.providerTaskDigest,
          retentionClass: "vera-context",
          retentionPolicyVersion: input.retentionPolicyVersion ?? input.policy.bundleVersion,
          purgeAt: contextPurgeAt,
        },
      });
      await Promise.all(
        input.pack.blocks.map((block, index) => {
          const snapshot = encrypted?.sourceSnapshots[index];
          return tx.aiRequestSource.create({
            data: {
              id: randomUUID(),
              contextPackId,
              requestId,
              ordinal: block.ordinal,
              sourceType: block.sourceType,
              sourceId: block.sourceId,
              citationKey: block.citationKey,
              titleSnapshot: block.titleSnapshot,
              citationLabel: block.citationLabel,
              contentDigest: block.contentDigest,
              boundedSnapshotCiphertext: snapshot ? json(snapshot) : undefined,
              snapshotBytes: Buffer.byteLength(block.content, "utf8"),
              truncationJson: json({ truncated: block.truncated }),
              redactionPolicyVersion: input.pack.redactionPolicyVersion,
              retentionPolicyVersion: input.retentionPolicyVersion ?? input.policy.bundleVersion,
              purgeAt: contextPurgeAt,
            },
          });
        }),
      );
      if (ledger) {
        await tx.aiUsageDaily.update({ where: { id: ledger.id }, data: { reservedQuotaUnits: { increment: reservation }, acceptedRequestCount: { increment: 1 } } });
      }
      const acceptedKey = await tx.aiIdempotencyKey.updateMany({
        where: { id: idempotencyKey.id, version: idempotencyKey.version, state: AiIdempotencyState.rejected },
        data: { state: AiIdempotencyState.accepted, resultKind: AiIdempotencyResultKind.request, resultId: request.id, acceptedAt: input.now, settlementDeadlineAt: input.policy.settlementDeadlineAt, expiresAt: new Date(input.now.getTime() + input.policy.policy.retentionConfig.acceptedKeyTtlDays * 24 * 60 * 60_000), rejectionClass: null, rejectionCode: null, version: { increment: 1 } },
      });
      if (acceptedKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
      return { accepted: true, requestId: request.id, idempotencyKeyId: idempotencyKey.id, userMessageId: durableUserMessageId, contextPackId, usageDate: localDay.usageDate, quotaUnitsReserved: reservation, preparedProviderTask: providerTaskForDispatch };
      });
    } catch (error) {
      // Two absent-key admissions can both observe no row. PostgreSQL rejects
      // the loser at the unique constraint; never turn that race into a new
      // rejected idempotency key or let the loser run a provider task. The
      // transport re-reads this winner marker and returns scoped JSON replay.
      if (!isPrismaUniqueViolation(error)) throw error;
      const winner = await this.lookupIdempotencyKey(input.studentId, input.clientRequestId);
      if (!winner) throw error;
      if (winner.expiresAt <= input.now || winner.state === AiIdempotencyState.expired) {
        throw new VeraAdmissionError({ code: "idempotency_key_expired", status: 409 });
      }
      if (winner.requestFingerprint !== input.requestFingerprint) {
        throw new VeraAdmissionError({ code: "idempotency_conflict", status: 409 });
      }
      throw new VeraAdmissionError({
        code: "request_pending",
        status: 202,
        details: { winnerRequestId: winner.resultId ?? null },
      });
    }
  }

  /**
   * Write the provider dispatch intent before any network I/O. A process
   * crash after this CAS leaves the attempt provider-exposed and therefore
   * eligible for Generation API reconciliation; it is never silently
   * released as an unused reservation.
   */
  async beginProviderDispatch(input: { requestId: string; attemptNo?: number; now?: Date }): Promise<{ claimed: boolean; replayed: boolean; state: AiAttemptState }> {
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      const request = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, status: true, version: true, ledgerVersion: true, providerRequestKey: true, dispatchDeadlineAt: true, settlementDeadlineAt: true },
      });
      if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (request.status === AiRequestLifecycleState.succeeded || request.status === AiRequestLifecycleState.fallback || request.status === AiRequestLifecycleState.failed) {
        return { claimed: false, replayed: true, state: AiAttemptState.completed };
      }
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${request.id}::uuid FOR UPDATE`;
      const attemptNo = input.attemptNo ?? 1;
      if (!Number.isSafeInteger(attemptNo) || attemptNo < 1 || attemptNo > 2) throw new VeraAdmissionError({ code: "provider_attempt_missing", status: 503 });
      const attempt = await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: request.id, attemptNo } } });
      if (!attempt) throw new VeraAdmissionError({ code: "provider_attempt_missing", status: 503 });
      await tx.$queryRaw`SELECT id FROM ai_request_attempts WHERE id = ${attempt.id}::uuid FOR UPDATE`;
      if (attempt.state === AiAttemptState.dispatching || attempt.state === AiAttemptState.sent || attempt.state === AiAttemptState.completed || attempt.state === AiAttemptState.known) {
        return { claimed: false, replayed: true, state: attempt.state };
      }
      if (attempt.state !== AiAttemptState.reserved) throw new VeraAdmissionError({ code: "provider_attempt_terminal", status: 409 });
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const dispatchNow = clock[0]?.now ?? now;
      const deadlines = [request.settlementDeadlineAt, request.dispatchDeadlineAt, attempt.dispatchDeadlineAt]
        .filter((deadline): deadline is Date => deadline instanceof Date);
      if (deadlines.length === 0 || deadlines.some((deadline) => deadline <= dispatchNow)) {
        throw new VeraAdmissionError({ code: "stage_after_deadline", status: 409 });
      }
      const dispatching = await tx.aiRequestAttempt.updateMany({
        where: { id: attempt.id, state: AiAttemptState.reserved },
        data: {
          state: AiAttemptState.dispatching,
          sendStartedAt: dispatchNow,
          startedAt: dispatchNow,
          errorCode: null,
        },
      });
      if (dispatching.count !== 1) throw new VeraAdmissionError({ code: "provider_attempt_cas_conflict", status: 409 });
      await tx.aiRequest.updateMany({
        where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
        data: {
          billingState: request.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2 ? AiRequestBillingState.dispatching : undefined,
          sendStartedAt: dispatchNow,
          providerRequestKey: attempt.providerRequestKey ?? request.providerRequestKey,
          dispatchDeadlineAt: attempt.dispatchDeadlineAt ?? request.dispatchDeadlineAt ?? new Date(dispatchNow.getTime() + 120 * 60_000),
          version: { increment: 1 },
        },
      });
      return { claimed: true, replayed: false, state: AiAttemptState.dispatching };
    });
  }

  async stageResult(input: {
    requestId: string;
    result: NormalizedVeraResult;
    encryptedResult: AiEncryptedPayload;
    preparedProviderTask?: PreparedProviderTask;
    providerResult?: ProviderResult;
    outputSchemaId?: string;
    outputSchemaHash?: string;
    stagePurpose?: AiRequestAttemptStagePurpose;
    now?: Date;
  }): Promise<{ id: string; replayed: boolean }> {
    const now = input.now ?? await this.databaseNow();
    if (input.stagePurpose && input.providerResult) {
      const expectedAttemptNo = input.stagePurpose === AiRequestAttemptStagePurpose.context_selection ? 1 : 2;
      if (input.providerResult.attempts.length !== 1 || input.providerResult.attempts[0]?.attemptNo !== expectedAttemptNo) {
        throw new VeraAdmissionError({ code: "provider_attempt_terminal", status: 409 });
      }
    }
    return this.db.$transaction(async (tx) => {
      const initial = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          idempotencyKeyId: true,
          stageRetentionExpiresAt: true,
          retentionPolicyVersion: true,
          outputSchemaId: true,
          outputSchemaHash: true,
        },
      });
      if (!initial || !initial.idempotencyKeyId) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${input.requestId}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          status: true,
          version: true,
          settlementDeadlineAt: true,
          stageRetentionExpiresAt: true,
          retentionPolicyVersion: true,
          outputSchemaId: true,
          outputSchemaHash: true,
        },
      });
      if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (request.status !== AiRequestLifecycleState.pending && request.status !== AiRequestLifecycleState.staged) throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
      if (request.settlementDeadlineAt && now > request.settlementDeadlineAt) throw new VeraAdmissionError({ code: "stage_after_deadline", status: 409 });
      const existing = await tx.aiRequestResultStage.findUnique({ where: { requestId: input.requestId } });
      if (existing) {
        if (existing.resultDigest !== input.result.digest) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
        return { id: existing.id, replayed: true };
      }
      const stageExpiresAt = request.stageRetentionExpiresAt;
      if (!stageExpiresAt) throw new VeraAdmissionError({ code: "retention_snapshot_missing", status: 503 });
      const stage = await tx.aiRequestResultStage.create({
        data: {
          requestId: input.requestId,
          state: AiResultStageState.available,
          resultKind: input.result.kind === "success" ? AiResultKind.success : input.result.kind === "fallback" ? AiResultKind.fallback : AiResultKind.discarded,
          normalizedResultCiphertext: json(input.encryptedResult),
          resultDigest: input.result.digest,
          outputSchemaId: input.outputSchemaId ?? request.outputSchemaId,
          outputSchemaHash: input.outputSchemaHash ?? request.outputSchemaHash,
          inputTokens: input.result.usage.inputTokens,
          outputTokens: input.result.usage.outputTokens,
          quotaUnitsConsumed: input.result.usage.quotaUnitsConsumed,
          tokenUsageState: input.result.usage.tokenUsageState as AiTokenUsageState,
          settlementKind: input.result.usage.quotaUnitsConsumed === null ? AiSettlementKind.conservative_reservation : AiSettlementKind.result,
          providerRequestRef: input.providerResult?.attempts[0]?.providerRequestRef ?? null,
          gateway: input.preparedProviderTask?.gateway ?? null,
          upstreamProvider: input.preparedProviderTask?.upstreamProvider ?? null,
          upstreamProviderSlug: input.preparedProviderTask?.upstreamProviderSlug ?? null,
          model: input.providerResult?.providerMetadata?.selectedModel ?? input.preparedProviderTask?.model ?? null,
          stagedAt: now,
          expiresAt: stageExpiresAt,
          retentionPolicyVersion: request.retentionPolicyVersion ?? "unknown",
        },
      });
      if (input.preparedProviderTask && input.providerResult) {
        const resolvedModel = input.providerResult.providerMetadata?.selectedModel ?? input.preparedProviderTask.model;
        const resolvedProvider = input.providerResult.providerMetadata?.providerIdentity
          ?? input.providerResult.attempts.find((attempt) => attempt.observedUpstreamProviderSlug)?.observedUpstreamProviderSlug
          ?? null;
        const reportedCostUsdMicros = parseMicrosString(input.providerResult.usage.reportedCostMicros);
        const recomputedCostUsdMicros = parseMicrosString(input.providerResult.usage.recomputedCostMicros);
        for (const attempt of input.providerResult.attempts) {
          const attemptProviderRequestKey = attempt.providerRequestKey?.trim()
            || (attempt.attemptNo === 1 ? input.preparedProviderTask.providerRequestKey : providerRequestKeyFor(input.requestId, attempt.attemptNo));
          const attemptReportedCostUsdMicros = parseMicrosString(attempt.reportedCostMicros ?? attempt.usage.reportedCostMicros);
          const attemptRecomputedCostUsdMicros = parseMicrosString(attempt.recomputedCostMicros ?? attempt.usage.recomputedCostMicros);
          const attemptDispatchDeadlineAt = attempt.dispatchDeadlineAt ? new Date(attempt.dispatchDeadlineAt) : input.preparedProviderTask.dispatchDeadlineAt ? new Date(input.preparedProviderTask.dispatchDeadlineAt) : null;
        const completed = new Set<string>(["completed", "known", "failed", "ambiguous", "unknown", "overrun", "released"]).has(attempt.state);
        // react-doctor-disable-next-line async-await-in-loop -- upsert provider attempts in attempt number order for deterministic lineage.
        await tx.aiRequestAttempt.upsert({
            where: { requestId_attemptNo: { requestId: input.requestId, attemptNo: attempt.attemptNo } },
            create: {
              requestId: input.requestId,
              attemptNo: attempt.attemptNo,
              gateway: input.preparedProviderTask.gateway,
              upstreamProvider: input.preparedProviderTask.upstreamProvider,
              upstreamProviderSlug: input.preparedProviderTask.upstreamProviderSlug,
              model: resolvedModel,
              stagePurpose: input.stagePurpose ?? AiRequestAttemptStagePurpose.answer,
              providerRequestKey: attemptProviderRequestKey,
              generationId: attempt.generationId ?? null,
              upstreamId: attempt.upstreamId ?? null,
              providerRequestId: attempt.providerRequestId ?? null,
              providerName: input.providerResult.providerMetadata?.providerIdentity ?? null,
              observedUpstreamProviderSlug: attempt.observedUpstreamProviderSlug ?? resolvedProvider,
              state: attempt.state as AiAttemptState,
              resultKind: input.result.kind === "discarded" ? AiAttemptResultKind.discarded : AiAttemptResultKind.success,
              providerRequestRef: attempt.providerRequestRef,
              inputTokens: attempt.usage.inputTokens,
              outputTokens: attempt.usage.outputTokens,
              quotaUnitsConsumed: attempt.usage.quotaUnitsConsumed,
              tokenUsageState: attempt.usage.tokenUsageState as AiTokenUsageState,
              cachedTokens: attempt.usage.cachedTokens ?? null,
              cacheWriteTokens: attempt.usage.cacheWriteTokens ?? null,
              reasoningTokens: attempt.usage.reasoningTokens ?? null,
              reportedProviderCostUsdMicros: attemptReportedCostUsdMicros,
              recomputedProviderCostUsdMicros: attemptRecomputedCostUsdMicros,
              chargedProviderCostUsdMicros: attemptReportedCostUsdMicros,
              rawReportedCostDecimal: attempt.rawReportedCostDecimal ?? attempt.usage.rawReportedCostDecimal ?? null,
              canonicalReportedCostDecimal: attempt.canonicalReportedCostDecimal ?? attempt.usage.canonicalReportedCostDecimal ?? null,
              errorCode: attempt.errorCode,
              finalPayloadHash: attempt.finalPayloadHash ?? input.preparedProviderTask.finalPayloadHash ?? null,
              sendStartedAt: completed ? now : null,
              dispatchDeadlineAt: attemptDispatchDeadlineAt,
              finalMeasuredTokenUpperBound: input.preparedProviderTask.inputQuotaUnitsUpperBound,
              releaseManifestDigest: input.preparedProviderTask.manifestDigest,
              certifierId: input.preparedProviderTask.certifierId ?? null,
              certifierVersion: input.preparedProviderTask.certifierVersion ?? null,
              priceSnapshot: input.preparedProviderTask.priceSnapshot ? json(input.preparedProviderTask.priceSnapshot) : undefined,
              startedAt: now,
              completedAt: completed ? now : null,
            },
            update: {
              gateway: input.preparedProviderTask.gateway,
              upstreamProvider: input.preparedProviderTask.upstreamProvider,
              upstreamProviderSlug: input.preparedProviderTask.upstreamProviderSlug,
              model: resolvedModel,
              stagePurpose: input.stagePurpose ?? AiRequestAttemptStagePurpose.answer,
              providerRequestKey: attemptProviderRequestKey,
              generationId: attempt.generationId ?? undefined,
              upstreamId: attempt.upstreamId ?? undefined,
              providerRequestId: attempt.providerRequestId ?? undefined,
              providerName: input.providerResult.providerMetadata?.providerIdentity ?? undefined,
              observedUpstreamProviderSlug: attempt.observedUpstreamProviderSlug ?? resolvedProvider ?? undefined,
              state: attempt.state as AiAttemptState,
              resultKind: input.result.kind === "discarded" ? AiAttemptResultKind.discarded : AiAttemptResultKind.success,
              providerRequestRef: attempt.providerRequestRef,
              inputTokens: attempt.usage.inputTokens,
              outputTokens: attempt.usage.outputTokens,
              quotaUnitsConsumed: attempt.usage.quotaUnitsConsumed,
              tokenUsageState: attempt.usage.tokenUsageState as AiTokenUsageState,
              cachedTokens: attempt.usage.cachedTokens ?? undefined,
              cacheWriteTokens: attempt.usage.cacheWriteTokens ?? undefined,
              reasoningTokens: attempt.usage.reasoningTokens ?? undefined,
              reportedProviderCostUsdMicros: attemptReportedCostUsdMicros ?? undefined,
              recomputedProviderCostUsdMicros: attemptRecomputedCostUsdMicros ?? undefined,
              chargedProviderCostUsdMicros: attemptReportedCostUsdMicros ?? undefined,
              rawReportedCostDecimal: attempt.rawReportedCostDecimal ?? attempt.usage.rawReportedCostDecimal ?? undefined,
              canonicalReportedCostDecimal: attempt.canonicalReportedCostDecimal ?? attempt.usage.canonicalReportedCostDecimal ?? undefined,
              errorCode: attempt.errorCode,
              finalPayloadHash: attempt.finalPayloadHash ?? input.preparedProviderTask.finalPayloadHash ?? undefined,
              sendStartedAt: completed ? now : undefined,
              dispatchDeadlineAt: attemptDispatchDeadlineAt ?? undefined,
              finalMeasuredTokenUpperBound: input.preparedProviderTask.inputQuotaUnitsUpperBound,
              releaseManifestDigest: input.preparedProviderTask.manifestDigest,
              certifierId: input.preparedProviderTask.certifierId ?? undefined,
              certifierVersion: input.preparedProviderTask.certifierVersion ?? undefined,
              priceSnapshot: input.preparedProviderTask.priceSnapshot ? json(input.preparedProviderTask.priceSnapshot) : undefined,
              completedAt: completed ? now : undefined,
            },
          });
        }
        // The request's durable provider identity is updated only as provider
        // metadata, while lifecycle/accounting ownership remains with the
        // finalizer below. This records the free router's resolved model and
        // observed upstream without pretending it is release-manifest data.
        await tx.aiRequest.updateMany({
          where: { id: input.requestId, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
          data: {
            model: resolvedModel,
            observedUpstreamProviderSlug: resolvedProvider,
            providerRequestRef: input.providerResult.attempts[0]?.providerRequestRef ?? null,
            generationId: input.providerResult.providerMetadata && "generationId" in input.providerResult.providerMetadata
              ? input.providerResult.providerMetadata.generationId : undefined,
            upstreamId: input.providerResult.providerMetadata && "upstreamId" in input.providerResult.providerMetadata
              ? input.providerResult.providerMetadata.upstreamId : undefined,
            providerRequestId: input.providerResult.providerMetadata && "providerRequestId" in input.providerResult.providerMetadata
              ? input.providerResult.providerMetadata.providerRequestId : undefined,
            reportedProviderCostUsdMicros: reportedCostUsdMicros ?? undefined,
            recomputedProviderCostUsdMicros: recomputedCostUsdMicros ?? undefined,
            chargedProviderCostUsdMicros: reportedCostUsdMicros ?? undefined,
            rawReportedCostDecimal: input.providerResult.usage.rawReportedCostDecimal ?? undefined,
            canonicalReportedCostDecimal: input.providerResult.usage.canonicalReportedCostDecimal ?? undefined,
          },
        });
        const automaticAttempts = await tx.aiRequestAttempt.findMany({
          where: { requestId: input.requestId, stagePurpose: { in: [AiRequestAttemptStagePurpose.context_selection, AiRequestAttemptStagePurpose.answer] } },
          select: { stagePurpose: true, state: true, chargedProviderCostUsdMicros: true, reportedProviderCostUsdMicros: true, recomputedProviderCostUsdMicros: true },
        });
        if (automaticAttempts.some((attempt) => attempt.stagePurpose === AiRequestAttemptStagePurpose.context_selection)) {
          const unresolved = automaticAttempts.length < 2 || automaticAttempts.some((attempt) => !([AiAttemptState.completed, AiAttemptState.known] as string[]).includes(attempt.state));
          const completeCosts = !unresolved && automaticAttempts.every((attempt) => attempt.chargedProviderCostUsdMicros !== null);
          const charged = completeCosts ? automaticAttempts.reduce((sum, attempt) => sum + (attempt.chargedProviderCostUsdMicros ?? 0n), 0n) : null;
          const reported = completeCosts ? automaticAttempts.reduce((sum, attempt) => sum + (attempt.reportedProviderCostUsdMicros ?? 0n), 0n) : null;
          const recomputed = completeCosts ? automaticAttempts.reduce((sum, attempt) => sum + (attempt.recomputedProviderCostUsdMicros ?? 0n), 0n) : null;
          await tx.aiRequest.updateMany({ where: { id: input.requestId, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } }, data: { chargedProviderCostUsdMicros: charged, reportedProviderCostUsdMicros: reported, recomputedProviderCostUsdMicros: recomputed } });
        }
      }
      // Staging is deliberately side-effect free for request lifecycle and
      // quota accounting. Only the shared finalizer/overdue settlement owns
      // request, stage, idempotency, and daily-ledger CAS transitions.
      return { id: stage.id, replayed: false };
    });
  }

  private async decodeStagedResult(stage: {
    normalizedResultCiphertext: Prisma.JsonValue | null;
    resultDigest: string | null;
  }): Promise<NormalizedVeraResult> {
    if (!this.envelope || !stage.normalizedResultCiphertext) {
      throw new VeraAdmissionError({ code: "result_recovery_unavailable", status: 503 });
    }
    try {
      const plaintext = await this.envelope.decryptTextAsync(stage.normalizedResultCiphertext as unknown as AiEncryptedPayload);
      const result = JSON.parse(plaintext) as NormalizedVeraResult;
      if (!result || typeof result !== "object" || result.digest !== stage.resultDigest) {
        throw new Error("The staged result digest does not match.");
      }
      return result;
    } catch (error) {
      if (error instanceof VeraAdmissionError) throw error;
      throw new VeraAdmissionError({ code: "result_recovery_unavailable", status: 503, details: { cause: "staged_result_invalid" } });
    }
  }

  private async finalizeLockedRequest(input: {
    tx: Prisma.TransactionClient;
    request: {
      id: string;
      conversationId: string | null;
      idempotencyKeyId: string | null;
      createdAt: Date;
      status: AiRequestLifecycleState;
      version: number;
      settlementDeadlineAt: Date | null;
      quotaUnitsReserved: number;
      ledgerVersion: AiUsageLedgerVersion;
      chargedProviderCostUsdMicros: bigint | null;
      assistantMessageId: string | null;
      idempotencyKey: { version: number; state: AiIdempotencyState; resultId: string | null } | null;
    };
    daily: {
      id: string;
      reservedQuotaUnits: number;
      usedQuotaUnits: number;
      quotaDebtUnits: number;
      quotaLimitUnitsSnapshot: number;
      quotaOverrunLockUntil: Date | null;
      quotaTimezone: string;
    } | null;
    stage: {
      id: string;
      version: number;
      state: AiResultStageState;
      resultDigest: string | null;
      quotaUnitsConsumed: number | null;
      tokenUsageState: AiTokenUsageState;
    };
    normalizedResult: NormalizedVeraResult;
    releaseReservation?: boolean;
    now: Date;
    persistDurableResult: (tx: Prisma.TransactionClient, normalizedResult: NormalizedVeraResult) => Promise<VeraDurableCallbackResult>;
  }): Promise<{ requestId: string; assistantMessageId: string | null; usageAccountingState: AiUsageAccountingState }> {
    const { tx, request, daily, stage, normalizedResult, now } = input;
    if (!request.idempotencyKeyId || !request.idempotencyKey) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    const durable = await input.persistDurableResult(tx, normalizedResult);
    const isV2 = request.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2;
    const reserved = request.quotaUnitsReserved;
    const actual = input.releaseReservation ? 0 : stage.quotaUnitsConsumed ?? reserved;
    let remainingReserved = 0;
    let used = 0;
    let debt = 0;
    let overrun = 0;
    let accounting: AiUsageAccountingState;
    let v2Settlement: VeraV2QuotaSettlement | null = null;
    if (isV2) {
      const outcome = input.releaseReservation ? "released" : request.chargedProviderCostUsdMicros === null ? "unknown" : "known";
      v2Settlement = await this.settleV2Quota({
        requestId: request.id,
        outcome,
        chargedUsdMicros: request.chargedProviderCostUsdMicros ?? undefined,
        now,
        transaction: tx,
      });
      accounting = v2Settlement.state === "unknown"
        ? AiUsageAccountingState.unknown
        : v2Settlement.state === "overrun" ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.known;
    } else {
      if (!daily) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      remainingReserved = daily.reservedQuotaUnits - reserved;
      if (remainingReserved < 0) throw new VeraAdmissionError({ code: "quota_ledger_conflict", status: 409 });
      used = daily.usedQuotaUnits + actual;
      debt = Math.max(0, used + remainingReserved - daily.quotaLimitUnitsSnapshot);
      overrun = Math.max(0, actual - reserved);
      accounting = stage.quotaUnitsConsumed === null ? AiUsageAccountingState.unknown : overrun > 0 || debt > 0 ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.known;
    }
    const assistantMessageId = durable.assistantMessageId ?? (normalizedResult.text === null ? null : randomUUID());
    if (assistantMessageId && normalizedResult.text !== null) {
      const envelope = this.envelope
        ? await this.envelope.forClient(tx).encryptAsync(normalizedResult.text, `ai-message:${assistantMessageId}`)
        : null;
      await tx.aiMessage.create({
        data: {
          id: assistantMessageId,
          conversationId: request.conversationId ?? "",
          role: "assistant",
          contentMarkdown: null,
          contentEnvelope: envelope ? json(envelope) : undefined,
          contentState: AiContentLifecycleState.encrypted,
          contentDigest: envelope?.plaintextDigest,
          metadataState: AiContentLifecycleState.legacy_plaintext,
        },
      });
    }
    const requestState = normalizedResult.kind === "fallback" ? AiRequestLifecycleState.fallback : normalizedResult.kind === "discarded" ? AiRequestLifecycleState.failed : AiRequestLifecycleState.succeeded;
    if (daily) {
      const localDayEnd = quotaDateAndDayEnd(request.createdAt, daily.quotaTimezone).dayEnd;
      const overrunLockUntil = overrun > 0 || debt > 0 ? localDayEnd : daily.quotaOverrunLockUntil;
      await tx.aiUsageDaily.update({ where: { id: daily.id }, data: { reservedQuotaUnits: remainingReserved, usedQuotaUnits: used, quotaDebtUnits: debt, quotaOverrunLockUntil: overrunLockUntil, finalizedRequestCount: { increment: 1 } } });
    }
    const consumed = await tx.aiRequestResultStage.updateMany({
      where: { id: stage.id, version: stage.version, state: AiResultStageState.available },
      data: { state: AiResultStageState.consumed, consumedAt: now, version: { increment: 1 } },
    });
    if (consumed.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
    const finalized = await tx.aiRequest.updateMany({
      where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
      data: {
        status: requestState,
        assistantMessageId,
        quotaUnitsConsumed: isV2 ? v2Settlement!.consumedCredits : actual,
        quotaOverrunUnits: isV2 ? (v2Settlement!.state === "overrun" ? reserved : 0) : overrun,
        tokenUsageState: stage.tokenUsageState,
        usageAccountingState: accounting,
        completedAt: now,
        finalizedAt: now,
        version: { increment: 1 },
      },
    });
    if (finalized.count !== 1) throw new VeraAdmissionError({ code: "request_cas_conflict", status: 409 });
    const terminalAttemptState = isV2
      ? v2Settlement!.state === "overrun" ? AiAttemptState.overrun : v2Settlement!.state === "unknown" ? AiAttemptState.unknown : AiAttemptState.known
      : stage.tokenUsageState === AiTokenUsageState.unknown ? AiAttemptState.unknown : AiAttemptState.known;
    await tx.aiRequestAttempt.updateMany({
      where: {
        requestId: request.id,
        state: { in: [AiAttemptState.dispatching, AiAttemptState.sent, AiAttemptState.accepted, AiAttemptState.completed, AiAttemptState.ambiguous] },
      },
      data: { state: terminalAttemptState, completedAt: now },
    });
    const terminalKey = await tx.aiIdempotencyKey.updateMany({
      where: { id: request.idempotencyKeyId, version: request.idempotencyKey.version, state: AiIdempotencyState.accepted, resultId: request.id },
      data: { terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
    });
    if (terminalKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
    return { requestId: request.id, assistantMessageId, usageAccountingState: accounting };
  }

  /**
   * The sole Prisma finalization transaction. The callback is deliberately
   * transaction-bound: a typed result/artifact write that throws rolls back
   * the assistant message, stage CAS, idempotency target, and daily ledger as
   * one unit.
   */
  async finalizeAcceptedRequest(input: {
    requestId: string;
    normalizedResult: NormalizedVeraResult;
    now?: Date;
  }): Promise<{ requestId: string; assistantMessageId: string | null; usageAccountingState: AiUsageAccountingState }> {
    const now = input.now ?? await this.databaseNow();
    return this.db.$transaction(async (tx) => {
      const initial = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, studentId: true, idempotencyKeyId: true, createdAt: true, ledgerVersion: true },
      });
      if (!initial || !initial.studentId || !initial.idempotencyKeyId) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });

      // Lock order: idempotency -> frozen daily row -> request -> stage.
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
      const daily = initial.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2
        ? null
        : (await tx.aiUsageDaily.findMany({ where: { studentId: initial.studentId, ledgerVersion: AiUsageLedgerVersion.vera_quota_v1 }, orderBy: { usageDate: "desc" } }))
          .find((candidate) => quotaDateAndDayEnd(initial.createdAt, candidate.quotaTimezone).usageDate === candidate.usageDate.toISOString().slice(0, 10)) ?? null;
      if (initial.ledgerVersion !== AiUsageLedgerVersion.vera_credit_usd_v2 && !daily) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      if (daily) await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE id = ${daily.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({ where: { id: initial.id }, include: { idempotencyKey: true } });
      if (!request || !request.studentId || !request.idempotencyKeyId || !request.idempotencyKey) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (request.status === AiRequestLifecycleState.succeeded || request.status === AiRequestLifecycleState.fallback || request.status === AiRequestLifecycleState.failed) {
        return { requestId: request.id, assistantMessageId: request.assistantMessageId, usageAccountingState: request.usageAccountingState };
      }
      const stage = await tx.aiRequestResultStage.findUnique({ where: { requestId: request.id } });
      if (!stage || stage.state !== AiResultStageState.available) throw new VeraAdmissionError({ code: "stage_unavailable", status: 409 });
      await tx.$queryRaw`SELECT id FROM ai_request_result_stages WHERE id = ${stage.id}::uuid FOR UPDATE`;
      if (stage.resultDigest !== input.normalizedResult.digest) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
      if (request.settlementDeadlineAt && now > request.settlementDeadlineAt) throw new VeraAdmissionError({ code: "stage_after_deadline", status: 409 });
      if (!this.envelope) throw new VeraAdmissionError({ code: "durable_callback_missing", status: 503 });

      const localNoAnswer = (request.automaticContextGateSnapshot as { protocol?: unknown } | null)?.protocol === "local_respan_free"
        && input.normalizedResult.kind === "fallback"
        && stage.quotaUnitsConsumed === 0
        && !(await tx.aiRequestAttempt.findUnique({ where: { requestId_attemptNo: { requestId: request.id, attemptNo: 2 } }, select: { id: true } }));

      return this.finalizeLockedRequest({
        tx,
        request,
        daily,
        stage,
        normalizedResult: input.normalizedResult,
        releaseReservation: localNoAnswer,
        now,
        persistDurableResult: createVeraDurableResultCallback({ requestId: request.id, envelope: this.envelope }),
      });
    });
  }

  /**
   * Terminalize a provider response that completed upstream but failed the
   * server-owned output contract. The provider's observed usage is settled
   * immediately; no result stage, assistant message, typed entity, or artifact
   * is created, so malformed output can never become recovery-pending work.
   */
  async failAcceptedProviderResult(input: {
    requestId: string;
    errorCode: string;
    usage: NormalizedVeraResult["usage"];
    providerEvidence?: ProviderFailureEvidence;
    /** Local no-answer failures release learner credits while any unresolved
     * provider spend stays in the unknown-cost bucket. */
    releaseCreditsOnFailure?: boolean;
    /** A cancellation before either provider dispatch returns both credits
     * and the monetary reservation. */
    releaseReservationOnFailure?: boolean;
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? await this.databaseNow();
    await this.db.$transaction(async (tx) => {
      const initial = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, studentId: true, idempotencyKeyId: true, createdAt: true, ledgerVersion: true },
      });
      if (!initial || !initial.studentId || !initial.idempotencyKeyId) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
      if (initial.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2) {
        await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${initial.id}::uuid FOR UPDATE`;
        const request = await tx.aiRequest.findUnique({ where: { id: initial.id }, include: { idempotencyKey: true } });
        if (!request || !request.idempotencyKeyId || !request.idempotencyKey) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
        if (request.status === AiRequestLifecycleState.succeeded || request.status === AiRequestLifecycleState.fallback || request.status === AiRequestLifecycleState.failed) return;
        const evidence = input.providerEvidence;
        const reportedCostUsdMicros = evidence?.reportedCostMicros ? parseMicrosString(evidence.reportedCostMicros) : null;
        const settlementOutcome = input.releaseReservationOnFailure ? "released" : evidence?.settlementOutcome
          ?? (evidence?.state === "overrun" && reportedCostUsdMicros !== null ? "known" : "unknown");
        const settlement = await this.settleV2Quota({
          requestId: request.id,
          outcome: settlementOutcome,
          chargedUsdMicros: reportedCostUsdMicros ?? undefined,
          forceOverrun: evidence?.state === "overrun",
          releaseCreditsOnUnknown: input.releaseCreditsOnFailure,
          now,
          transaction: tx,
        });
        const tokenState = input.usage.tokenUsageState === "known"
          ? AiTokenUsageState.known
          : input.usage.tokenUsageState === "not_applicable" ? AiTokenUsageState.not_applicable : AiTokenUsageState.unknown;
        await tx.aiRequest.updateMany({
          where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
          data: {
            status: AiRequestLifecycleState.failed,
            errorCode: input.errorCode,
            inputTokens: input.usage.inputTokens,
            outputTokens: input.usage.outputTokens,
            quotaUnitsConsumed: settlement.consumedCredits,
            quotaOverrunUnits: settlement.state === "overrun" ? request.quotaUnitsReserved : 0,
            tokenUsageState: tokenState,
            usageAccountingState: settlement.state === "overrun" ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.unknown,
            reportedProviderCostUsdMicros: reportedCostUsdMicros ?? undefined,
            recomputedProviderCostUsdMicros: evidence?.recomputedCostMicros ? parseMicrosString(evidence.recomputedCostMicros) ?? undefined : undefined,
            chargedProviderCostUsdMicros: settlement.chargedUsdMicros,
            rawReportedCostDecimal: evidence?.rawReportedCostDecimal ?? undefined,
            canonicalReportedCostDecimal: evidence?.canonicalReportedCostDecimal ?? undefined,
            generationId: evidence?.generationId ?? undefined,
            upstreamId: evidence?.upstreamId ?? undefined,
            providerRequestId: evidence?.providerRequestId ?? undefined,
            overrunUsdMicros: settlement.overrunUsdMicros,
            completedAt: now,
            finalizedAt: now,
            version: { increment: 1 },
          },
        });
        await tx.aiRequestAttempt.updateMany({
          where: { requestId: request.id, state: { in: [AiAttemptState.dispatching, AiAttemptState.sent, AiAttemptState.accepted, AiAttemptState.completed, AiAttemptState.ambiguous] } },
          data: {
            state: settlement.state === "overrun" ? AiAttemptState.overrun : AiAttemptState.unknown,
            errorCode: input.errorCode,
            generationId: evidence?.generationId ?? undefined,
            upstreamId: evidence?.upstreamId ?? undefined,
            providerRequestId: evidence?.providerRequestId ?? undefined,
            providerName: evidence?.providerName ?? undefined,
            reportedProviderCostUsdMicros: reportedCostUsdMicros ?? undefined,
            recomputedProviderCostUsdMicros: evidence?.recomputedCostMicros ? parseMicrosString(evidence.recomputedCostMicros) ?? undefined : undefined,
            chargedProviderCostUsdMicros: settlement.chargedUsdMicros,
            rawReportedCostDecimal: evidence?.rawReportedCostDecimal ?? undefined,
            canonicalReportedCostDecimal: evidence?.canonicalReportedCostDecimal ?? undefined,
            overrunUsdMicros: settlement.overrunUsdMicros,
            completedAt: now,
          },
        });
        const terminalKey = await tx.aiIdempotencyKey.updateMany({
          where: { id: request.idempotencyKeyId, version: request.idempotencyKey.version, state: AiIdempotencyState.accepted, resultId: request.id },
          data: { terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
        });
        if (terminalKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
        return;
      }
      const dailyCandidates = await tx.aiUsageDaily.findMany({
        where: { studentId: initial.studentId, ledgerVersion: AiUsageLedgerVersion.vera_quota_v1 },
        orderBy: { usageDate: "desc" },
      });
      const daily = dailyCandidates.find((candidate) =>
        quotaDateAndDayEnd(initial.createdAt, candidate.quotaTimezone).usageDate
        === candidate.usageDate.toISOString().slice(0, 10));
      if (!daily) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE id = ${daily.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({ where: { id: initial.id }, include: { idempotencyKey: true } });
      if (!request || !request.studentId || !request.idempotencyKeyId || !request.idempotencyKey) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      if (request.status === AiRequestLifecycleState.succeeded
        || request.status === AiRequestLifecycleState.fallback
        || request.status === AiRequestLifecycleState.failed) return;

      const reserved = request.quotaUnitsReserved;
      const actual = input.releaseReservationOnFailure || input.releaseCreditsOnFailure ? 0 : input.usage.quotaUnitsConsumed ?? reserved;
      const remainingReserved = daily.reservedQuotaUnits - reserved;
      if (remainingReserved < 0) throw new VeraAdmissionError({ code: "quota_ledger_conflict", status: 409 });
      const used = daily.usedQuotaUnits + actual;
      const debt = Math.max(0, used + remainingReserved - daily.quotaLimitUnitsSnapshot);
      const overrun = Math.max(0, actual - reserved);
      const dayEnd = quotaDateAndDayEnd(request.createdAt, daily.quotaTimezone).dayEnd;
      const accounting = input.usage.quotaUnitsConsumed === null
        ? AiUsageAccountingState.unknown
        : overrun > 0 || debt > 0 ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.known;
      const tokenState = input.usage.tokenUsageState === "known"
        ? AiTokenUsageState.known
        : input.usage.tokenUsageState === "not_applicable" ? AiTokenUsageState.not_applicable : AiTokenUsageState.unknown;

      await tx.aiUsageDaily.update({
        where: { id: daily.id },
        data: {
          reservedQuotaUnits: remainingReserved,
          usedQuotaUnits: used,
          quotaDebtUnits: debt,
          quotaOverrunLockUntil: overrun > 0 || debt > 0 ? dayEnd : daily.quotaOverrunLockUntil,
          finalizedRequestCount: { increment: 1 },
        },
      });
      const failed = await tx.aiRequest.updateMany({
        where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
        data: {
          status: AiRequestLifecycleState.failed,
          errorCode: input.errorCode,
          inputTokens: input.usage.inputTokens,
          outputTokens: input.usage.outputTokens,
          quotaUnitsConsumed: actual,
          quotaOverrunUnits: overrun,
          tokenUsageState: tokenState,
          usageAccountingState: accounting,
          completedAt: now,
          finalizedAt: now,
          version: { increment: 1 },
        },
      });
      if (failed.count !== 1) throw new VeraAdmissionError({ code: "request_cas_conflict", status: 409 });
      await tx.aiRequestAttempt.updateMany({
        where: { requestId: request.id, state: { in: [AiAttemptState.dispatching, AiAttemptState.sent, AiAttemptState.accepted, AiAttemptState.completed, AiAttemptState.ambiguous] } },
        data: { state: input.usage.quotaUnitsConsumed === null ? AiAttemptState.unknown : overrun > 0 ? AiAttemptState.overrun : AiAttemptState.failed, errorCode: input.errorCode, completedAt: now },
      });
      const terminalKey = await tx.aiIdempotencyKey.updateMany({
        where: { id: request.idempotencyKeyId, version: request.idempotencyKey.version, state: AiIdempotencyState.accepted, resultId: request.id },
        data: { terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
      });
      if (terminalKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
    });
  }

  async settleOverdueRequest(input: {
    requestId: string;
    now?: Date;
    missingStage?: boolean;
    forceUnknown?: boolean;
    errorCode?: string;
  }): Promise<void> {
    const now = input.now ?? await this.databaseNow();
    await this.db.$transaction(async (tx) => {
      const initial = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, studentId: true, idempotencyKeyId: true, createdAt: true, ledgerVersion: true },
      });
      if (!initial || !initial.studentId || !initial.idempotencyKeyId) return;

      // The worker follows the same global lock order as admission/finalizer:
      // idempotency -> frozen daily row -> request -> stage.
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
      const daily = initial.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2
        ? null
        : (await tx.aiUsageDaily.findMany({
          where: { studentId: initial.studentId, ledgerVersion: AiUsageLedgerVersion.vera_quota_v1 },
          orderBy: { usageDate: "desc" },
        })).find((candidate) =>
          quotaDateAndDayEnd(initial.createdAt, candidate.quotaTimezone).usageDate
          === candidate.usageDate.toISOString().slice(0, 10)) ?? null;
      if (initial.ledgerVersion !== AiUsageLedgerVersion.vera_credit_usd_v2 && !daily) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      if (daily) await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE id = ${daily.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM ai_requests WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const request = await tx.aiRequest.findUnique({ where: { id: initial.id }, include: { idempotencyKey: true } });
      if (!request || !request.studentId || !request.idempotencyKeyId || !request.idempotencyKey) return;
      if (request.status === AiRequestLifecycleState.succeeded || request.status === AiRequestLifecycleState.fallback || request.status === AiRequestLifecycleState.failed) return;
      if (request.settlementDeadlineAt && request.settlementDeadlineAt > now && !input.missingStage && !input.forceUnknown) return;

      const stageCandidate = await tx.aiRequestResultStage.findUnique({ where: { requestId: request.id } });
      const stageIsEligible = !input.forceUnknown
        && stageCandidate?.state === AiResultStageState.available
        && stageCandidate.expiresAt > now;
      if (stageCandidate) {
        await tx.$queryRaw`SELECT id FROM ai_request_result_stages WHERE id = ${stageCandidate.id}::uuid FOR UPDATE`;
      }
      const stage = stageIsEligible ? stageCandidate : null;
      if (stage) {
        // An eligible staged result follows the exact same transaction-bound
        // finalizer as the normal provider completion. It must be decrypted,
        // durably persisted, and only then consume stage/accounting CAS; an
        // accounting-only success would lose the learner-visible result.
        const normalizedResult = await this.decodeStagedResult(stage);
        const callback = this.envelope ? createVeraDurableResultCallback({ requestId: request.id, envelope: this.envelope }) : null;
        if (callback) {
          await tx.$executeRaw`SAVEPOINT vera_durable_recovery`;
          try {
            await this.finalizeLockedRequest({
              tx,
              request,
              daily,
              stage,
              normalizedResult,
              now,
              persistDurableResult: callback,
            });
            await tx.$executeRaw`RELEASE SAVEPOINT vera_durable_recovery`;
            return;
          } catch (error) {
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT vera_durable_recovery`;
            await tx.$executeRaw`RELEASE SAVEPOINT vera_durable_recovery`;
            if (!request.settlementDeadlineAt || request.settlementDeadlineAt > now) {
              throw new VeraAdmissionError({
                code: error instanceof VeraDurableResultError ? error.code : "durable_recovery_unavailable",
                status: 503,
              });
            }
          }
        }
      }
      if (request.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2) {
        const settlement = await this.settleV2Quota({ requestId: request.id, outcome: "unknown", now, transaction: tx });
        const errorCode = input.errorCode ?? (input.missingStage ? "missing_stage_unknown" : stage ? "durable_recovery_failed" : "settlement_deadline_expired");
        const finalized = await tx.aiRequest.updateMany({
          where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
          data: {
            status: AiRequestLifecycleState.failed,
            errorCode,
            quotaUnitsConsumed: settlement.consumedCredits,
            quotaOverrunUnits: settlement.state === "overrun" ? request.quotaUnitsReserved : 0,
            tokenUsageState: AiTokenUsageState.unknown,
            usageAccountingState: settlement.state === "overrun" ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.unknown,
            finalizedAt: now,
            completedAt: now,
            version: { increment: 1 },
          },
        });
        if (finalized.count !== 1) throw new VeraAdmissionError({ code: "request_cas_conflict", status: 409 });
        await tx.aiRequestAttempt.updateMany({
          where: { requestId: request.id, state: { in: [AiAttemptState.dispatching, AiAttemptState.sent, AiAttemptState.accepted, AiAttemptState.completed, AiAttemptState.ambiguous] } },
          data: { state: AiAttemptState.unknown, errorCode, completedAt: now },
        });
        if (stageCandidate?.state === AiResultStageState.available) {
          const discarded = await tx.aiRequestResultStage.updateMany({
            where: { id: stageCandidate.id, version: stageCandidate.version, state: AiResultStageState.available },
            data: { state: AiResultStageState.consumed, resultKind: AiResultKind.discarded, consumedAt: now, version: { increment: 1 } },
          });
          if (discarded.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
        }
        const terminalKey = await tx.aiIdempotencyKey.updateMany({
          where: { id: request.idempotencyKeyId, version: request.idempotencyKey.version, state: AiIdempotencyState.accepted, resultId: request.id },
          data: { terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
        });
        if (terminalKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
        return;
      }
      if (!daily) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      const reserved = request.quotaUnitsReserved;
      const actual = reserved;
      const remainingReserved = daily.reservedQuotaUnits - reserved;
      if (remainingReserved < 0) throw new VeraAdmissionError({ code: "quota_ledger_conflict", status: 409 });
      const used = daily.usedQuotaUnits + actual;
      const debt = Math.max(0, used + remainingReserved - daily.quotaLimitUnitsSnapshot);
      const overrun = Math.max(0, actual - reserved);
      const localDayEnd = quotaDateAndDayEnd(request.createdAt, daily.quotaTimezone).dayEnd;
      const overrunLockUntil = overrun > 0 || debt > 0 ? localDayEnd : daily.quotaOverrunLockUntil;
      const accounting = AiUsageAccountingState.unknown;
      const requestState = AiRequestLifecycleState.failed;
      const errorCode = input.errorCode ?? (input.missingStage ? "missing_stage_unknown" : stage ? "durable_recovery_failed" : "settlement_deadline_expired");

      await tx.aiUsageDaily.update({
        where: { id: daily.id },
        data: {
          reservedQuotaUnits: remainingReserved,
          usedQuotaUnits: used,
          quotaDebtUnits: debt,
          quotaOverrunLockUntil: overrunLockUntil,
          finalizedRequestCount: { increment: 1 },
        },
      });
      const finalized = await tx.aiRequest.updateMany({
        where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
        data: {
          status: requestState,
          errorCode,
          quotaUnitsConsumed: actual,
          quotaOverrunUnits: overrun,
          tokenUsageState: AiTokenUsageState.unknown,
          usageAccountingState: accounting,
          finalizedAt: now,
          completedAt: now,
          version: { increment: 1 },
        },
      });
      if (finalized.count !== 1) throw new VeraAdmissionError({ code: "request_cas_conflict", status: 409 });
      await tx.aiRequestAttempt.updateMany({
        where: { requestId: request.id, state: { in: [AiAttemptState.dispatching, AiAttemptState.sent, AiAttemptState.accepted, AiAttemptState.completed, AiAttemptState.ambiguous] } },
        data: { state: AiAttemptState.unknown, errorCode, completedAt: now },
      });
      if (stageCandidate?.state === AiResultStageState.available) {
        const discarded = await tx.aiRequestResultStage.updateMany({
          where: { id: stageCandidate.id, version: stageCandidate.version, state: AiResultStageState.available },
          data: { state: AiResultStageState.consumed, resultKind: AiResultKind.discarded, consumedAt: now, version: { increment: 1 } },
        });
        if (discarded.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
      }
      const terminalKey = await tx.aiIdempotencyKey.updateMany({
        where: { id: request.idempotencyKeyId, version: request.idempotencyKey.version, state: AiIdempotencyState.accepted, resultId: request.id },
        data: { terminalAt: now, lastSeenAt: now, version: { increment: 1 } },
      });
      if (terminalKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
    });
  }

  private async rejectAdmissionKey(tx: Prisma.TransactionClient, key: { id: string; version: number }, code: string, now: Date): Promise<void> {
    const rejected = await tx.aiIdempotencyKey.updateMany({
      where: { id: key.id, version: key.version, state: AiIdempotencyState.rejected },
      data: { state: AiIdempotencyState.rejected, rejectionClass: AiRejectionClass.transient, rejectionCode: code, lastSeenAt: now, version: { increment: 1 } },
    });
    if (rejected.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
  }

  private async createAdmissionEvent(
    tx: Prisma.TransactionClient,
    input: {
      studentId: string;
      idempotencyKeyId: string;
      featureKey: string;
      policy: VeraPolicySnapshot;
      usageDate: string;
      reason: "quota" | "quota_overrun_lock" | "burst" | "concurrency" | "redis_unavailable";
      now: Date;
    },
  ): Promise<void> {
    await tx.aiAdmissionEvent.create({
      data: {
        studentId: input.studentId,
        occurredAt: input.now,
        localQuotaDate: dateOnly(input.usageDate),
        quotaTimezone: input.policy.timezone,
        quotaTimezonePolicyVersion: input.policy.timezonePolicyVersion,
        policyBundleVersion: input.policy.bundleVersion,
        featureKey: input.featureKey,
        behaviorVersion: "1",
        gateway: null,
        upstreamProvider: null,
        upstreamProviderSlug: null,
        reason: input.reason,
        idempotencyKeyId: input.idempotencyKeyId,
      },
    });
  }

  private async readExistingAdmission(tx: Prisma.TransactionClient, requestId: string, keyId: string): Promise<PersistedAdmission> {
    const row = await tx.aiRequest.findUnique({ where: { id: requestId }, include: { contextPack: true } });
    if (!row?.contextPack) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    const usageDate = row.createdAt.toISOString().slice(0, 10);
    return { accepted: true, requestId: row.id, idempotencyKeyId: keyId, userMessageId: row.userMessageId ?? "", contextPackId: row.contextPack.id, usageDate, quotaUnitsReserved: row.quotaUnitsReserved };
  }
}
