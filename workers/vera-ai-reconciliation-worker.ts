import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  AiAttemptState,
  AiRequestBillingState,
  AiReservationState,
  AiUsageLedgerVersion,
  Prisma,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { VeraPrismaAdmissionService } from "@/lib/vera-ai/admission-service";
import { decimalToUsdMicros, parseDecimalLexeme } from "@/lib/vera-ai/billing";

/** Operational bounds are intentionally exported for deployment/readiness tests. */
export const VERA_RECONCILIATION_BATCH_SIZE = 50;
export const VERA_RECONCILIATION_INTERVAL_MS = 30_000;
export const VERA_RECONCILIATION_LEASE_MS = 90_000;
export const VERA_RECONCILIATION_LEASE_RENEWAL_MS = 20_000;
export const VERA_RECONCILIATION_MAX_IN_FLIGHT = 10;
export const VERA_RECONCILIATION_CALL_TIMEOUT_MS = 5_000;
export const VERA_RECONCILIATION_POLL_BACKOFF_MS = 5 * 60_000;
export const VERA_RECONCILIATION_SETTLEMENT_DEADLINE_MS = 120 * 60_000;

type WorkerDb = typeof defaultPrisma;

export type ReconciliationAttempt = {
  id: string;
  requestId: string;
  generationId: string | null;
  providerRequestId: string | null;
  upstreamId: string | null;
  state: AiAttemptState;
  startedAt: Date;
  dispatchDeadlineAt: Date | null;
  reconciliationLeaseUntil: Date | null;
  reconciliationClaimedBy: string | null;
  request: {
    ledgerVersion: AiUsageLedgerVersion;
    billingState: AiRequestBillingState;
    settlementDeadlineAt: Date | null;
  };
};

/** Evidence returned by the generation endpoint after exact decimal parsing. */
export type VeraGenerationEvidence = {
  generationId: string;
  providerRequestId?: string | null;
  upstreamId?: string | null;
  providerName?: string | null;
  reportedCostUsdMicros: bigint;
  recomputedCostUsdMicros?: bigint | null;
  rawReportedCostDecimal?: string | null;
  canonicalReportedCostDecimal?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  reasoningTokens?: number | null;
  finalPayloadHash?: string | null;
  evidenceHash: string;
  usageIsEstimated?: boolean;
};

export type VeraGenerationEvidenceFetcher = (
  attempt: ReconciliationAttempt,
  signal: AbortSignal,
) => Promise<VeraGenerationEvidence | null>;

export type VeraReconciliationWorkerOptions = {
  db?: WorkerDb;
  workerId?: string;
  fetchEvidence?: VeraGenerationEvidenceFetcher;
  now?: () => Date;
};

export type VeraReconciliationCycleResult = {
  claimed: number;
  known: number;
  unknown: number;
  deferred: number;
  failed: number;
};

function logEvent(event: string, fields: Record<string, string | number | boolean> = {}): void {
  // Never log generation payloads, prompts, provider URLs, or exception text.
  console.info(JSON.stringify({ event, ...fields }));
}

function parseBoundedInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function extractRawDecimal(body: string, key: string): string | null {
  // The response body is retained only in memory. Capture the raw JSON
  // lexeme before JSON.parse so decimal costs never pass through Number.
  const pattern = new RegExp(`"${key}"\\s*:\\s*(?:"(?<quoted>[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)"|(?<number>[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?))`, "u");
  const match = pattern.exec(body);
  return match?.groups?.quoted ?? match?.groups?.number ?? null;
}

/**
 * Optional production Generation API adapter. Deployments can provide a
 * private base URL and API key; without those values the worker remains
 * deployable and marks due attempts unknown at the fixed deadline.
 */
export function createOpenRouterGenerationEvidenceFetcher(
  env: NodeJS.ProcessEnv = process.env,
): VeraGenerationEvidenceFetcher {
  const baseUrl = env.VERA_GENERATION_API_URL?.trim() || "https://openrouter.ai/api/v1/generation";
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  return async (attempt, signal) => {
    if (!apiKey || !attempt.generationId) return null;
    const url = new URL(baseUrl);
    url.searchParams.set("id", attempt.generationId);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal,
    });
    if (response.status === 404 || response.status === 429 || !response.ok) return null;
    const body = await response.text();
    const rawTotalCost = extractRawDecimal(body, "total_cost");
    if (!rawTotalCost) return null;
    const parsed = JSON.parse(body) as {
      data?: {
        id?: string;
        request_id?: string;
        upstream_id?: string;
        provider_name?: string;
        tokens_prompt?: unknown;
        tokens_completion?: unknown;
        native_tokens_prompt?: unknown;
        native_tokens_completion?: unknown;
        native_tokens_reasoning?: unknown;
      };
    };
    const data = parsed.data;
    const generationId = data?.id ?? attempt.generationId;
    return {
      generationId,
      providerRequestId: data?.request_id ?? attempt.providerRequestId,
      upstreamId: data?.upstream_id ?? attempt.upstreamId,
      providerName: data?.provider_name ?? null,
      reportedCostUsdMicros: decimalToUsdMicros(rawTotalCost),
      rawReportedCostDecimal: rawTotalCost,
      canonicalReportedCostDecimal: parseDecimalLexeme(rawTotalCost).canonical,
      inputTokens: parseBoundedInteger(data?.tokens_prompt ?? data?.native_tokens_prompt),
      outputTokens: parseBoundedInteger(data?.tokens_completion ?? data?.native_tokens_completion),
      reasoningTokens: parseBoundedInteger(data?.native_tokens_reasoning),
      evidenceHash: createHash("sha256").update(body).digest("hex"),
    };
  };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("reconciliation_call_timeout"));
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("reconciliation_cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function runWithConcurrency<T>(items: T[], limit: number, operation: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) await operation(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

export class VeraAiReconciliationWorker {
  private readonly db: WorkerDb;
  private readonly workerId: string;
  private readonly fetchEvidence: VeraGenerationEvidenceFetcher;
  private readonly now: () => Date;
  private readonly admission: VeraPrismaAdmissionService;

  constructor(options: VeraReconciliationWorkerOptions = {}) {
    this.db = options.db ?? defaultPrisma;
    this.workerId = options.workerId ?? `vera-reconciliation-${randomUUID()}`;
    this.fetchEvidence = options.fetchEvidence ?? createOpenRouterGenerationEvidenceFetcher();
    this.now = options.now ?? (() => new Date());
    this.admission = new VeraPrismaAdmissionService(this.db);
  }

  get id(): string {
    return this.workerId;
  }

  async claimDueAttempts(now = this.now()): Promise<ReconciliationAttempt[]> {
    return this.db.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT a.id
        FROM "ai_request_attempts" a
        JOIN "ai_requests" r ON r.id = a.request_id
        WHERE a.state::text IN ('dispatching', 'sent')
          AND (a.reconciliation_lease_until IS NULL OR a.reconciliation_lease_until < ${now})
          AND (
            a.next_evidence_poll_at IS NULL
            OR a.next_evidence_poll_at <= ${now}
            OR (r.settlement_deadline_at IS NOT NULL AND r.settlement_deadline_at <= ${now})
          )
        ORDER BY r.settlement_deadline_at NULLS LAST, a.started_at
        FOR UPDATE OF a SKIP LOCKED
        LIMIT ${VERA_RECONCILIATION_BATCH_SIZE}
      `);
      if (due.length === 0) return [];
      const ids = due.map((row) => row.id);
      const leaseUntil = new Date(now.getTime() + VERA_RECONCILIATION_LEASE_MS);
      await tx.aiRequestAttempt.updateMany({
        where: { id: { in: ids }, state: { in: [AiAttemptState.dispatching, AiAttemptState.sent] } },
        data: { reconciliationClaimedBy: this.workerId, reconciliationLeaseUntil: leaseUntil },
      });
      return tx.aiRequestAttempt.findMany({
        where: { id: { in: ids }, reconciliationClaimedBy: this.workerId },
        select: {
          id: true,
          requestId: true,
          generationId: true,
          providerRequestId: true,
          upstreamId: true,
          state: true,
          startedAt: true,
          dispatchDeadlineAt: true,
          reconciliationLeaseUntil: true,
          reconciliationClaimedBy: true,
          request: { select: { ledgerVersion: true, billingState: true, settlementDeadlineAt: true } },
        },
      });
    });
  }

  private async ownsLease(attemptId: string, now = this.now()): Promise<boolean> {
    const row = await this.db.aiRequestAttempt.findFirst({
      where: { id: attemptId, reconciliationClaimedBy: this.workerId, reconciliationLeaseUntil: { gt: now } },
      select: { id: true },
    });
    return Boolean(row);
  }

  private async renewLease(attemptId: string): Promise<void> {
    const now = this.now();
    await this.db.aiRequestAttempt.updateMany({
      where: { id: attemptId, reconciliationClaimedBy: this.workerId, reconciliationLeaseUntil: { gt: now } },
      data: { reconciliationLeaseUntil: new Date(now.getTime() + VERA_RECONCILIATION_LEASE_MS) },
    });
  }

  private async clearLease(attemptId: string): Promise<void> {
    await this.db.aiRequestAttempt.updateMany({
      where: { id: attemptId, reconciliationClaimedBy: this.workerId },
      data: { reconciliationLeaseUntil: null, reconciliationClaimedBy: null },
    });
  }

  private async scheduleNextPoll(attempt: ReconciliationAttempt, now: Date): Promise<void> {
    await this.db.aiRequestAttempt.updateMany({
      where: { id: attempt.id, reconciliationClaimedBy: this.workerId },
      data: {
        lastEvidencePollAt: now,
        nextEvidencePollAt: new Date(now.getTime() + VERA_RECONCILIATION_POLL_BACKOFF_MS),
        reconciliationLeaseUntil: null,
        reconciliationClaimedBy: null,
      },
    });
  }

  private async markUnknown(attempt: ReconciliationAttempt, now: Date): Promise<void> {
    if (!(await this.ownsLease(attempt.id, now))) return;
    if (attempt.request.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2) {
      await this.admission.settleV2Quota({ requestId: attempt.requestId, outcome: "unknown", now });
    } else {
      // v1 requests admitted before cutover keep their original daily
      // lineage; cutover never reinterprets them as v2 rows.
      await this.admission.settleOverdueRequest({ requestId: attempt.requestId, now, forceUnknown: true, errorCode: "generation_evidence_unknown" });
    }
    await this.db.aiRequestAttempt.updateMany({
      where: { id: attempt.id, reconciliationClaimedBy: this.workerId },
      data: {
        state: AiAttemptState.unknown,
        errorCode: "generation_evidence_unknown",
        completedAt: now,
        lastEvidencePollAt: now,
        nextEvidencePollAt: null,
        reconciliationLeaseUntil: null,
        reconciliationClaimedBy: null,
      },
    });
  }

  private async applyEvidence(attempt: ReconciliationAttempt, evidence: VeraGenerationEvidence, now: Date): Promise<void> {
    if (!(await this.ownsLease(attempt.id, now))) return;
    const request = await this.db.aiRequest.findUnique({ where: { id: attempt.requestId }, select: { billingState: true, ledgerVersion: true } });
    if (!request) return;
    if (request.ledgerVersion === AiUsageLedgerVersion.vera_credit_usd_v2) {
      if (request.billingState === AiRequestBillingState.unknown) {
        await this.admission.correctV2QuotaFromEvidence({
          requestId: attempt.requestId,
          attemptId: attempt.id,
          generationId: evidence.generationId,
          evidenceHash: evidence.evidenceHash,
          chargedUsdMicros: evidence.reportedCostUsdMicros,
          now,
        });
      } else {
        await this.admission.settleV2Quota({ requestId: attempt.requestId, outcome: "known", chargedUsdMicros: evidence.reportedCostUsdMicros, now });
      }
    } else {
      // Preserve the pre-cutover request's v1 daily lineage. The existing
      // terminal settlement seam consumes the original reservation exactly
      // once; the cutover must never reinterpret it as a v2 window.
      const actualUnits = evidence.inputTokens !== null && evidence.inputTokens !== undefined
        && evidence.outputTokens !== null && evidence.outputTokens !== undefined
        ? evidence.inputTokens + evidence.outputTokens
        : null;
      await this.admission.failAcceptedProviderResult({
        requestId: attempt.requestId,
        errorCode: "generation_reconciled_without_stage",
        usage: {
          inputTokens: evidence.inputTokens ?? null,
          outputTokens: evidence.outputTokens ?? null,
          quotaUnitsConsumed: actualUnits,
          tokenUsageState: actualUnits === null ? "unknown" : "known",
        },
        now,
      });
      const pricingViolation = evidence.recomputedCostUsdMicros !== null
        && evidence.recomputedCostUsdMicros !== undefined
        && evidence.recomputedCostUsdMicros !== evidence.reportedCostUsdMicros;
      await this.db.aiRequest.updateMany({
        where: { id: attempt.requestId },
        data: {
          billingState: pricingViolation ? AiRequestBillingState.overrun : AiRequestBillingState.known,
          creditReservationState: pricingViolation ? AiReservationState.overrun : AiReservationState.settled,
          reportedProviderCostUsdMicros: evidence.reportedCostUsdMicros,
          recomputedProviderCostUsdMicros: evidence.recomputedCostUsdMicros ?? undefined,
          chargedProviderCostUsdMicros: evidence.reportedCostUsdMicros,
          rawReportedCostDecimal: evidence.rawReportedCostDecimal ?? undefined,
          canonicalReportedCostDecimal: evidence.canonicalReportedCostDecimal ?? undefined,
          overrunUsdMicros: pricingViolation ? evidence.reportedCostUsdMicros : 0n,
        },
      });
    }
    const nextState = evidence.recomputedCostUsdMicros !== null
      && evidence.recomputedCostUsdMicros !== undefined
      && evidence.recomputedCostUsdMicros !== evidence.reportedCostUsdMicros
      ? AiAttemptState.overrun
      : AiAttemptState.known;
    await this.db.aiRequestAttempt.updateMany({
      where: { id: attempt.id, reconciliationClaimedBy: this.workerId },
      data: {
        state: nextState,
        generationId: evidence.generationId,
        providerRequestId: evidence.providerRequestId ?? undefined,
        upstreamId: evidence.upstreamId ?? undefined,
        providerName: evidence.providerName ?? undefined,
        inputTokens: evidence.inputTokens ?? undefined,
        outputTokens: evidence.outputTokens ?? undefined,
        cachedTokens: evidence.cachedTokens ?? undefined,
        reasoningTokens: evidence.reasoningTokens ?? undefined,
        usageIsEstimated: evidence.usageIsEstimated ?? false,
        reportedProviderCostUsdMicros: evidence.reportedCostUsdMicros,
        recomputedProviderCostUsdMicros: evidence.recomputedCostUsdMicros ?? undefined,
        chargedProviderCostUsdMicros: evidence.reportedCostUsdMicros,
        rawReportedCostDecimal: evidence.rawReportedCostDecimal ?? undefined,
        canonicalReportedCostDecimal: evidence.canonicalReportedCostDecimal ?? undefined,
        finalPayloadHash: evidence.finalPayloadHash ?? undefined,
        completedAt: now,
        lastEvidencePollAt: now,
        nextEvidencePollAt: null,
        reconciliationLeaseUntil: null,
        reconciliationClaimedBy: null,
      },
    });
  }

  private async processAttempt(attempt: ReconciliationAttempt): Promise<"known" | "unknown" | "deferred"> {
    const now = this.now();
    const deadline = attempt.request.settlementDeadlineAt
      ?? (attempt.dispatchDeadlineAt ?? new Date(attempt.startedAt.getTime() + VERA_RECONCILIATION_SETTLEMENT_DEADLINE_MS));
    if (deadline <= now) {
      await this.markUnknown(attempt, now);
      return "unknown";
    }
    if (!(await this.ownsLease(attempt.id, now))) return "deferred";
    const controller = new AbortController();
    const renewal = setInterval(() => { void this.renewLease(attempt.id); }, VERA_RECONCILIATION_LEASE_RENEWAL_MS);
    try {
      const evidence = await withTimeout(
        this.fetchEvidence(attempt, controller.signal),
        VERA_RECONCILIATION_CALL_TIMEOUT_MS,
        controller.signal,
        () => controller.abort(),
      );
      if (evidence) {
        await this.applyEvidence(attempt, evidence, this.now());
        return "known";
      }
      await this.scheduleNextPoll(attempt, this.now());
      return "deferred";
    } catch {
      if (deadline <= this.now()) {
        await this.markUnknown(attempt, this.now());
        return "unknown";
      }
      await this.scheduleNextPoll(attempt, this.now());
      return "deferred";
    } finally {
      clearInterval(renewal);
      controller.abort();
    }
  }

  async runOnce(): Promise<VeraReconciliationCycleResult> {
    const attempts = await this.claimDueAttempts();
    const result: VeraReconciliationCycleResult = { claimed: attempts.length, known: 0, unknown: 0, deferred: 0, failed: 0 };
    await runWithConcurrency(attempts, VERA_RECONCILIATION_MAX_IN_FLIGHT, async (attempt) => {
      try {
        const state = await this.processAttempt(attempt);
        result[state] += 1;
      } catch {
        result.failed += 1;
        await this.clearLease(attempt.id).catch(() => undefined);
      }
    });
    if (attempts.length > 0) logEvent("vera_reconciliation_cycle", { workerId: this.workerId, ...result });
    return result;
  }

  async releaseClaims(): Promise<void> {
    await this.db.aiRequestAttempt.updateMany({
      where: { reconciliationClaimedBy: this.workerId },
      data: { reconciliationLeaseUntil: null, reconciliationClaimedBy: null },
    });
  }

  async start(signal: AbortSignal): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
    logEvent("vera_reconciliation_worker_ready", { workerId: this.workerId, intervalMs: VERA_RECONCILIATION_INTERVAL_MS });
    while (!signal.aborted) {
      await this.runOnce().catch(() => undefined);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, VERA_RECONCILIATION_INTERVAL_MS);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    await this.releaseClaims();
    logEvent("vera_reconciliation_worker_stopped", { workerId: this.workerId });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  const worker = new VeraAiReconciliationWorker();
  const run = process.env.VERA_RECONCILIATION_ONCE === "1"
    ? worker.runOnce().then(() => worker.releaseClaims())
    : worker.start(controller.signal);
  run.catch(() => { process.exitCode = 1; });
}
