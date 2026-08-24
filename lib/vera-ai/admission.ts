import "server-only";

import { randomUUID } from "node:crypto";

import {
  VERA_FINGERPRINT_KEY_VERSION,
  VeraContractError,
  type VeraContextSelection,
  type VeraRequestState,
} from "./contracts";
import {
  IdempotencyService,
  InMemoryIdempotencyStore,
  type IdempotencyBeginResult,
  type IdempotencyRecord,
} from "./idempotency";
import {
  prepareContextPack,
  type PreparedContextPack,
  type VeraContextResolver,
} from "./context-pack";
import {
  InMemoryVeraLeaseStore,
  type VeraLease,
  type VeraLeaseAcquireInput,
  type VeraLeaseAcquireOutcome,
  type VeraLeaseStore,
  VeraRedisUnavailableError,
} from "./redis-lease";
import {
  defaultVeraPolicyBundle,
  snapshotVeraPolicy,
  type BillingPlan,
  type VeraPolicyBundle,
  type VeraPolicySnapshot,
} from "./policy";
import {
  quotaDateAndDayEnd,
  reserveQuota,
  settleQuota,
  type QuotaLedger,
} from "./quota";
import {
  MockProviderAdapter,
  type PreparedProviderTask,
  type ProviderResult,
  type ProviderTask,
  type VeraProviderAdapter,
} from "./provider";
import { EnvelopeService, InMemoryEnvelopeKeyRegistry, type AiEncryptedPayload } from "./envelope";
import { validateVeraResult, type NormalizedVeraResult } from "./output-validator";

export type VeraAdmissionInput = {
  studentId: string;
  conversationId: string;
  clientRequestId: string;
  kind?: "chat" | "studio";
  text: string;
  selection?: VeraContextSelection[];
  options?: Record<string, unknown>;
  toolId?: string | null;
  retryOfRequestId?: string | null;
  now?: Date;
  billing?: BillingPlan | null;
  profileTimezone?: string | null;
  legacyDailyAiTokenLimit?: number | null;
};

export type VeraAdmissionEvent = {
  reason: "quota" | "quota_overrun_lock" | "burst" | "concurrency" | "redis_unavailable";
  studentId: string;
  featureKey: string;
  occurredAt: Date;
  usageDate: string;
  quotaTimezone: string;
  policyBundleVersion: string | null;
  idempotencyKeyId: string | null;
};

export type VeraDurableMessage = {
  id: string;
  conversationId: string;
  studentId: string;
  role: "user" | "assistant";
  text: string | null;
  envelope: AiEncryptedPayload | null;
  createdAt: Date;
};

export type VeraStageRecord = {
  id: string;
  requestId: string;
  state: "available" | "consumed" | "purged";
  result: NormalizedVeraResult;
  resultDigest: string;
  stagedAt: Date;
  consumedAt: Date | null;
  expiresAt: Date;
  version: number;
};

export type VeraRequestRecord = {
  id: string;
  studentId: string;
  conversationId: string;
  clientRequestId: string;
  requestFingerprint: string;
  idempotencyKeyId: string;
  featureKey: string;
  lifecycleState: VeraRequestState;
  policy: VeraPolicySnapshot;
  contextPack: PreparedContextPack;
  preparedProviderTask: PreparedProviderTask;
  userMessageId: string;
  assistantMessageId: string | null;
  retryOfRequestId: string | null;
  quotaUnitsReserved: number;
  quotaUnitsConsumed: number;
  quotaOverrunUnits: number;
  tokenUsageState: "known" | "unknown" | "not_applicable";
  usageAccountingState: "known" | "unknown" | "overrun_debt";
  settlementDeadlineAt: Date;
  startedAt: Date;
  firstTokenAt: Date | null;
  completedAt: Date | null;
  errorCode: string | null;
  result: NormalizedVeraResult | null;
  stageId: string | null;
  version: number;
};

export type VeraRequestStatusDto = {
  requestId: string;
  conversationId: string;
  clientRequestId: string;
  state: VeraRequestState | "rejected" | "expired";
  resultState: "pending" | "staged" | "committed" | "unavailable" | "rejected" | "expired";
  errorCode: string | null;
  result: { text: string | null; citationKeys: string[] } | null;
  artifact?: { id: string; artifactType: string; revision: number } | null;
  usage: {
    quotaUnitsReserved: number;
    quotaUnitsConsumed: number;
    tokenUsageState: "known" | "unknown" | "not_applicable";
    usageAccountingState: "known" | "unknown" | "overrun_debt";
  };
  sequence: number;
};

export type VeraAdmissionResponse =
  | { kind: "accepted"; request: VeraRequestRecord; replayed: false; lease: VeraLease }
  | { kind: "replay"; request: VeraRequestStatusDto; replayed: true }
  | { kind: "rejected"; status: VeraRequestStatusDto; replayed: false };

export type VeraFinalizationTx = {
  requestId: string;
  persistEncryptedPayload(payload: AiEncryptedPayload): string;
  addArtifactRevision(input: { artifactKey: string; contentDigest: string }): string;
};

export type VeraAdmissionServiceOptions = {
  policy?: VeraPolicyBundle;
  policyBundles?: VeraPolicyBundle[];
  billingResolver?: (studentId: string) => Promise<BillingPlan | null>;
  timezoneResolver?: (studentId: string) => Promise<string | null>;
  policyResolver?: (now: Date) => Promise<VeraPolicyBundle>;
  leaseStore?: VeraLeaseStore;
  provider?: VeraProviderAdapter;
  contextResolver: VeraContextResolver;
  envelope?: EnvelopeService;
  hmacSecret?: string;
  now?: () => Date;
  featureKey?: string;
};

export class VeraAdmissionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly admissionReason?: VeraAdmissionEvent["reason"];
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    status?: number;
    message?: string;
    admissionReason?: VeraAdmissionEvent["reason"];
    details?: Record<string, unknown>;
  }) {
    super(input.message ?? input.code);
    this.name = "VeraAdmissionError";
    this.code = input.code;
    this.status = input.status ?? 409;
    this.admissionReason = input.admissionReason;
    this.details = input.details;
  }
}

function isExpired(record: IdempotencyRecord, now: Date): boolean {
  return record.state === "expired" || now >= record.expiresAt;
}

function assertRequestInput(input: VeraAdmissionInput): void {
  if (!input.studentId || !input.conversationId || !input.clientRequestId) {
    throw new VeraAdmissionError({ code: "invalid_request", status: 400 });
  }
  if (input.clientRequestId.length > 160 || input.clientRequestId.includes("\u0000")) {
    throw new VeraAdmissionError({ code: "invalid_request", status: 400 });
  }
  if (typeof input.text !== "string" || input.text.length < 1 || Buffer.byteLength(input.text, "utf8") > 40_000) {
    throw new VeraAdmissionError({ code: "invalid_request", status: 400 });
  }
  if ((input.selection?.length ?? 0) > 6) {
    throw new VeraAdmissionError({ code: "context_release_unavailable", status: 422 });
  }
}

function mapStatus(
  request: VeraRequestRecord,
  stage: VeraStageRecord | null,
): VeraRequestStatusDto {
  const terminal = request.lifecycleState === "succeeded"
    || request.lifecycleState === "fallback"
    || request.lifecycleState === "failed";
  return {
    requestId: request.id,
    conversationId: request.conversationId,
    clientRequestId: request.clientRequestId,
    state: request.lifecycleState,
    resultState: terminal ? request.result ? "committed" : "unavailable" : stage?.state === "available" ? "staged" : "pending",
    errorCode: request.errorCode,
    result: request.result
      ? { text: request.result.text, citationKeys: request.result.citationKeys }
      : null,
    usage: {
      quotaUnitsReserved: request.quotaUnitsReserved,
      quotaUnitsConsumed: request.quotaUnitsConsumed,
      tokenUsageState: request.tokenUsageState,
      usageAccountingState: request.usageAccountingState,
    },
    sequence: terminal ? 4 : stage ? 3 : 1,
  };
}

/**
 * Server-only admission and settlement implementation. The in-memory stores
 * make the exact boundary executable in focused tests; the production route
 * supplies the same contracts through the Prisma adapter in
 * `admission-service.ts`.
 */
export class VeraAdmissionService {
  readonly idempotency: IdempotencyService;
  readonly events: VeraAdmissionEvent[] = [];
  readonly requests = new Map<string, VeraRequestRecord>();
  readonly stages = new Map<string, VeraStageRecord>();
  readonly messages = new Map<string, VeraDurableMessage>();
  readonly ledgers = new Map<string, QuotaLedger>();

  private readonly leaseStore: VeraLeaseStore;
  private readonly provider: VeraProviderAdapter;
  private readonly envelope: EnvelopeService;
  private readonly now: () => Date;
  private readonly featureKey: string;
  private readonly options: VeraAdmissionServiceOptions;
  private readonly keyLocks = new Map<string, Promise<void>>();
  private readonly requestLocks = new Map<string, Promise<void>>();

  constructor(options: VeraAdmissionServiceOptions) {
    this.options = options;
    this.leaseStore = options.leaseStore ?? new InMemoryVeraLeaseStore();
    this.provider = options.provider ?? new MockProviderAdapter();
    this.envelope = options.envelope ?? new EnvelopeService(new InMemoryEnvelopeKeyRegistry());
    this.now = options.now ?? (() => new Date());
    this.featureKey = options.featureKey ?? "vera.chat";
    this.idempotency = new IdempotencyService(new InMemoryIdempotencyStore(), {
      hmacSecret: options.hmacSecret ?? "vera-focused-test-secret",
      fingerprintKeyVersion: VERA_FINGERPRINT_KEY_VERSION,
    });
  }

  async status(input: { studentId: string; conversationId: string; clientRequestId: string; now?: Date }): Promise<VeraRequestStatusDto | null> {
    const record = await this.idempotency.lookup({
      studentId: input.studentId,
      operation: "ai_request",
      clientRequestId: input.clientRequestId,
    });
    if (!record) return null;
    if (isExpired(record, input.now ?? this.now())) {
      return {
        requestId: record.resultId ?? "",
        conversationId: input.conversationId,
        clientRequestId: input.clientRequestId,
        state: "expired",
        resultState: "expired",
        errorCode: "idempotency_key_expired",
        result: null,
        usage: {
          quotaUnitsReserved: 0,
          quotaUnitsConsumed: 0,
          tokenUsageState: "not_applicable",
          usageAccountingState: "unknown",
        },
        sequence: 4,
      };
    }
    if (!record.resultId) {
      return {
        requestId: "",
        conversationId: input.conversationId,
        clientRequestId: input.clientRequestId,
        state: "rejected",
        resultState: "rejected",
        errorCode: record.rejectionCode ?? null,
        result: null,
        usage: {
          quotaUnitsReserved: 0,
          quotaUnitsConsumed: 0,
          tokenUsageState: "not_applicable",
          usageAccountingState: "unknown",
        },
        sequence: 4,
      };
    }
    const request = this.requests.get(record.resultId);
    if (!request || request.studentId !== input.studentId || request.conversationId !== input.conversationId) return null;
    return mapStatus(request, request.stageId ? this.stages.get(request.stageId) ?? null : null);
  }

  async admit(input: VeraAdmissionInput): Promise<VeraAdmissionResponse> {
    assertRequestInput(input);
    const now = input.now ?? this.now();
    const lockKey = `${input.studentId}:ai_request:${input.clientRequestId}`;
    return this.withLock(this.keyLocks, lockKey, async () => this.admitLocked(input, now));
  }

  private async admitLocked(input: VeraAdmissionInput, now: Date): Promise<VeraAdmissionResponse> {
    // Replay is intentionally the first database/store read. It happens
    // before policy, Redis, context, and provider preparation.
    const existing = await this.idempotency.lookup({
      studentId: input.studentId,
      operation: "ai_request",
      clientRequestId: input.clientRequestId,
    });
    if (existing) {
      const fingerprint = this.idempotency.fingerprint("ai_request", this.payloadForFingerprint(input));
      if (isExpired(existing, now)) {
        throw new VeraAdmissionError({ code: "idempotency_key_expired", status: 409 });
      }
      if (existing.requestFingerprint !== fingerprint) {
        throw new VeraAdmissionError({ code: "idempotency_conflict", status: 409 });
      }
      // Only accepted and terminally rejected rows short-circuit. A
      // transient rejection is explicitly retryable under the same key.
      if (existing.state === "accepted" || existing.rejectionClass === "terminal") {
        const replay = await this.status({ ...input, now });
        if (replay) return { kind: "replay", request: replay, replayed: true };
      }
    }

    const policy = await this.resolvePolicy(now);
    const billing = input.billing !== undefined
      ? input.billing
      : await this.options.billingResolver?.(input.studentId) ?? null;
    const timezone = input.profileTimezone !== undefined
      ? input.profileTimezone
      : await this.options.timezoneResolver?.(input.studentId) ?? "Asia/Jakarta";
    if (now < policy.effectiveAt) {
      // The cutover check happens before snapshot, Redis, context, provider,
      // event, reservation, or message work for a new key.
      throw new VeraAdmissionError({ code: "vera_not_active", status: 422 });
    }
    const snapshot = snapshotVeraPolicy({
      policy,
      now,
      billing,
      timezone,
      featureKey: this.featureKey,
    });

    const begin = await this.idempotency.begin({
      studentId: input.studentId,
      operation: "ai_request",
      clientRequestId: input.clientRequestId,
      payload: this.payloadForFingerprint(input),
      now,
    });
    if (begin.kind === "conflict") throw new VeraAdmissionError({ code: "idempotency_conflict", status: 409 });
    if (begin.kind === "expired") throw new VeraAdmissionError({ code: "idempotency_key_expired", status: 409 });
    if (begin.kind === "replay") {
      const replay = await this.status({ ...input, now });
      if (replay) return { kind: "replay", request: replay, replayed: true };
      throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    }

    const localDay = quotaDateAndDayEnd(now, snapshot.timezone);
    const leaseInput: VeraLeaseAcquireInput = {
      studentId: input.studentId,
      featureKey: this.featureKey,
      maxConcurrent: 2,
      burstLimit: 10,
      burstWindowMs: 60_000,
      ttlMs: Math.max(10_000, Math.min(120_000, snapshot.policy.settlementConfig.maxPendingAgeMinutes * 60_000)),
      now,
    };
    let lease: VeraLease | null = null;
    let acquireOutcome: VeraLeaseAcquireOutcome;
    try {
      acquireOutcome = this.leaseStore.acquireWithReason
        ? await this.leaseStore.acquireWithReason(leaseInput)
        : { lease: await this.leaseStore.acquire(leaseInput) };
      lease = acquireOutcome.lease;
    } catch (error) {
      if (error instanceof VeraRedisUnavailableError) {
        await this.rejectWithEvent(begin, input, snapshot, localDay.usageDate, now, "redis_unavailable");
        return { kind: "rejected", status: this.rejectedStatus(input, "redis_unavailable"), replayed: false };
      }
      throw error;
    }
    if (!lease) {
      const reason = acquireOutcome?.rejectionReason ?? "concurrency";
      await this.rejectWithEvent(begin, input, snapshot, localDay.usageDate, now, reason);
      return { kind: "rejected", status: this.rejectedStatus(input, reason), replayed: false };
    }

    try {
      const pack = await prepareContextPack({
        studentId: input.studentId,
        selection: input.selection ?? [],
        userText: input.text,
        policyVersion: snapshot.bundleVersion,
        promptTemplateHash: "vera-chat-prompt-v1",
        toolSchemaHash: "vera-chat-tools-v1",
        systemPolicyHash: snapshot.policy.validationDigest,
      }, this.options.contextResolver);
      const providerTask: ProviderTask = {
        featureKey: this.featureKey,
        behaviorVersion: "1",
        taskBytes: pack.canonicalTaskBytes,
        contextTaskDigest: pack.contextTaskDigest,
        hardOutputQuotaUnits: snapshot.hardOutputQuotaUnits,
      };
      const preparedProviderTask = await this.provider.prepare(providerTask);
      this.assertPreparedProviderTask(preparedProviderTask, snapshot);

      // Renew immediately before the quota/accepted transaction. A lost
      // fence before commit rejects without creating accepted rows; a later
      // release failure cannot undo an already committed request.
      let renewedLease: VeraLease | null;
      try {
        renewedLease = await this.leaseStore.renew(lease, leaseInput.ttlMs, now);
      } catch {
        await this.rejectWithEvent(begin, input, snapshot, localDay.usageDate, now, "redis_unavailable");
        return { kind: "rejected", status: this.rejectedStatus(input, "redis_unavailable"), replayed: false };
      }
      if (!renewedLease) {
        await this.rejectWithEvent(begin, input, snapshot, localDay.usageDate, now, "redis_unavailable");
        return { kind: "rejected", status: this.rejectedStatus(input, "redis_unavailable"), replayed: false };
      }
      lease = renewedLease;

      const ledgerKey = `${input.studentId}:${localDay.usageDate}:vera_quota_v1`;
      const before = this.ledgers.get(ledgerKey) ?? this.emptyLedger(input, snapshot, localDay.usageDate);
      let reservation;
      try {
        reservation = reserveQuota(before, preparedProviderTask.certifiedEstimate.reservationBound, now);
      } catch (error) {
        const code = error instanceof Error && error.message.includes("overrun") ? "quota_overrun_lock" : "quota";
        await this.rejectWithEvent(begin, input, snapshot, localDay.usageDate, now, code);
        return { kind: "rejected", status: this.rejectedStatus(input, code), replayed: false };
      }

      const requestId = randomUUID();
      const userMessageId = await this.resolveUserMessage(input);
      const messageEnvelope = this.envelope.encrypt(input.text, `ai-message:${userMessageId}`);
      const request: VeraRequestRecord = {
        id: requestId,
        studentId: input.studentId,
        conversationId: input.conversationId,
        clientRequestId: input.clientRequestId,
        requestFingerprint: begin.record.requestFingerprint,
        idempotencyKeyId: begin.record.id,
        featureKey: this.featureKey,
        lifecycleState: "pending",
        policy: snapshot,
        contextPack: pack,
        preparedProviderTask,
        userMessageId,
        assistantMessageId: null,
        retryOfRequestId: input.retryOfRequestId ?? null,
        quotaUnitsReserved: reservation.reservedUnits,
        quotaUnitsConsumed: 0,
        quotaOverrunUnits: 0,
        tokenUsageState: "unknown",
        usageAccountingState: "unknown",
        settlementDeadlineAt: snapshot.settlementDeadlineAt,
        startedAt: now,
        firstTokenAt: null,
        completedAt: null,
        errorCode: null,
        result: null,
        stageId: null,
        version: 0,
      };
      // The accepted transaction boundary is represented by these writes in
      // one synchronous critical section: pack, source evidence, message,
      // reservation, request, and accepted idempotency target.
      this.ledgers.set(ledgerKey, reservation.ledger);
      this.messages.set(userMessageId, {
        id: userMessageId,
        conversationId: input.conversationId,
        studentId: input.studentId,
        role: "user",
        text: null,
        envelope: messageEnvelope,
        createdAt: now,
      });
      this.requests.set(request.id, request);
      await this.idempotency.accept(begin.record, { kind: "request", id: request.id }, now, snapshot.settlementDeadlineAt);

      return { kind: "accepted", request, replayed: false, lease };
    } catch (error) {
      // Context/provider preparation errors are typed rejected keys without
      // admission telemetry. Accepted rows are only written after prepare.
      if (error instanceof VeraContractError || error instanceof Error) {
        const code = error instanceof VeraContractError ? error.code : "provider_prepare_unavailable";
        await this.idempotency.reject(begin.record, { code, classification: "transient" }, now);
        return { kind: "rejected", status: this.rejectedStatus(input, code), replayed: false };
      }
      throw error;
    } finally {
      // A release failure cannot undo an accepted transaction. The bounded
      // lease TTL/fencing token is the recovery boundary.
      if (lease) await this.leaseStore.release(lease).catch(() => false);
    }
  }

  async runAccepted(input: { requestId: string; emit?: (delta: string) => void; now?: Date }): Promise<VeraRequestStatusDto> {
    const request = this.requests.get(input.requestId);
    if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    if (request.lifecycleState !== "pending") return mapStatus(request, request.stageId ? this.stages.get(request.stageId) ?? null : null);
    const now = input.now ?? request.startedAt;
    let providerResult: ProviderResult;
    try {
      providerResult = await this.provider.run(request.preparedProviderTask, (delta) => {
        request.firstTokenAt ??= now;
        input.emit?.(delta.text);
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "provider_unavailable";
      await this.settleOverdueRequest({ requestId: request.id, now, errorCode: code, forceUnknown: true });
      return mapStatus(request, null);
    }
    const normalized = validateVeraResult({
      text: providerResult.text,
      structured: providerResult.structured,
      kind: providerResult.kind === "text" || providerResult.kind === "structured" ? "success" : providerResult.kind === "fallback" ? "fallback" : "discarded",
      finishReason: providerResult.finishReason,
      usage: providerResult.usage,
      allowedCitationKeys: request.contextPack.blocks.map((block) => block.citationKey),
    });
    await this.stageResult({ requestId: request.id, result: normalized, now });
    await this.finalizeAcceptedRequest({ requestId: request.id, now });
    return mapStatus(request, request.stageId ? this.stages.get(request.stageId) ?? null : null);
  }

  async stageResult(input: { requestId: string; result: NormalizedVeraResult; now?: Date }): Promise<VeraStageRecord> {
    const request = this.requests.get(input.requestId);
    if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    const now = input.now ?? request.startedAt;
    if (request.lifecycleState === "succeeded" || request.lifecycleState === "fallback" || request.lifecycleState === "failed") {
      throw new VeraAdmissionError({ code: "stage_after_terminal", status: 409 });
    }
    if (now > request.settlementDeadlineAt) {
      throw new VeraAdmissionError({ code: "stage_after_deadline", status: 409 });
    }
    const existing = request.stageId ? this.stages.get(request.stageId) : undefined;
    if (existing) {
      if (existing.resultDigest !== input.result.digest) throw new VeraAdmissionError({ code: "stage_conflict", status: 409 });
      return existing;
    }
    const stage: VeraStageRecord = {
      id: randomUUID(),
      requestId: request.id,
      state: "available",
      result: input.result,
      resultDigest: input.result.digest,
      stagedAt: now,
      consumedAt: null,
      expiresAt: new Date(Math.min(
        request.settlementDeadlineAt.getTime() + 24 * 60 * 60_000,
        now.getTime() + 24 * 60 * 60_000,
      )),
      version: 0,
    };
    this.stages.set(stage.id, stage);
    request.stageId = stage.id;
    return stage;
  }

  async finalizeAcceptedRequest(input: {
    requestId: string;
    now?: Date;
    persistDurableResult?: (tx: VeraFinalizationTx, normalizedResult: NormalizedVeraResult) => Promise<{ assistantMessageId?: string | null }>;
  }): Promise<VeraRequestRecord> {
    const suppliedNow = input.now;
    return this.withLock(this.requestLocks, input.requestId, async () => {
      const request = this.requests.get(input.requestId);
      if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      const now = suppliedNow ?? request.startedAt;
      if (request.lifecycleState === "succeeded" || request.lifecycleState === "fallback" || request.lifecycleState === "failed") return request;
      const stage = request.stageId ? this.stages.get(request.stageId) : null;
      if (!stage || stage.state !== "available") {
        if (now >= request.settlementDeadlineAt) return this.settleOverdueRequest({ requestId: request.id, now, errorCode: "missing_stage_unknown", forceUnknown: true });
        throw new VeraAdmissionError({ code: "stage_unavailable", status: 409 });
      }
      const staged = stage.result;
      const tx: VeraFinalizationTx = {
        requestId: request.id,
        persistEncryptedPayload: () => randomUUID(),
        addArtifactRevision: () => randomUUID(),
      };
      let callbackResult: { assistantMessageId?: string | null } = {};
      try {
        callbackResult = await input.persistDurableResult?.(tx, staged) ?? {};
      } catch (error) {
        // No request/stage/ledger mutation happens before this callback
        // succeeds, so a process or callback failure is transaction-safe.
        throw new VeraAdmissionError({ code: "finalization_unavailable", status: 503, details: { cause: error instanceof Error ? error.message : "unknown" } });
      }
      // The usage row is frozen at admission. Settlement after a worker
      // restart must charge that captured local day, never today's row.
      const localDay = quotaDateAndDayEnd(request.startedAt, request.policy.timezone);
      const ledgerKey = `${request.studentId}:${localDay.usageDate}:vera_quota_v1`;
      const ledger = this.ledgers.get(ledgerKey);
      if (!ledger) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      const settlement = settleQuota(ledger, {
        reservedUnits: request.quotaUnitsReserved,
        actualUnits: staged.usage.quotaUnitsConsumed,
        localDayEnd: localDay.dayEnd,
        unknownReason: staged.usage.quotaUnitsConsumed === null ? "provider_unknown" : undefined,
      });
      this.ledgers.set(ledgerKey, settlement.ledger);
      request.quotaUnitsConsumed = settlement.consumedUnits;
      request.quotaOverrunUnits = settlement.overrunUnits;
      request.tokenUsageState = staged.usage.tokenUsageState;
      request.usageAccountingState = settlement.usageAccountingState;
      request.result = staged;
      request.assistantMessageId = callbackResult.assistantMessageId ?? (staged.text === null ? null : randomUUID());
      if (request.assistantMessageId && staged.text !== null && !this.messages.has(request.assistantMessageId)) {
        this.messages.set(request.assistantMessageId, {
          id: request.assistantMessageId,
          conversationId: request.conversationId,
          studentId: request.studentId,
          role: "assistant",
          text: null,
          envelope: this.envelope.encrypt(staged.text, `ai-message:${request.assistantMessageId}`),
          createdAt: now,
        });
      }
      request.lifecycleState = staged.kind === "fallback" ? "fallback" : staged.kind === "discarded" ? "failed" : "succeeded";
      request.completedAt = now;
      request.errorCode = staged.kind === "discarded" ? "discarded" : null;
      request.version += 1;
      stage.state = "consumed";
      stage.consumedAt = now;
      stage.version += 1;
      return request;
    });
  }

  async settleOverdueRequest(input: { requestId: string; now?: Date; errorCode?: string; forceUnknown?: boolean }): Promise<VeraRequestRecord> {
    const request = this.requests.get(input.requestId);
    const now = input.now ?? this.now();
    if (!request) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    if (request.lifecycleState === "succeeded" || request.lifecycleState === "fallback" || request.lifecycleState === "failed") return request;
    if (!input.forceUnknown && now < request.settlementDeadlineAt) throw new VeraAdmissionError({ code: "settlement_not_due", status: 409 });
    const localDay = quotaDateAndDayEnd(request.startedAt, request.policy.timezone);
    const ledgerKey = `${request.studentId}:${localDay.usageDate}:vera_quota_v1`;
    const ledger = this.ledgers.get(ledgerKey);
    if (!ledger) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
    const settlement = settleQuota(ledger, {
      reservedUnits: request.quotaUnitsReserved,
      actualUnits: null,
      localDayEnd: localDay.dayEnd,
      unknownReason: "missing_stage_unknown",
    });
    this.ledgers.set(ledgerKey, settlement.ledger);
    request.lifecycleState = "failed";
    request.errorCode = input.errorCode ?? "missing_stage_unknown";
    request.quotaUnitsConsumed = settlement.consumedUnits;
    request.quotaOverrunUnits = settlement.overrunUnits;
    request.tokenUsageState = "unknown";
    request.usageAccountingState = "unknown";
    request.completedAt = now;
    request.version += 1;
    return request;
  }

  usage(studentId: string, now = this.now()): {
    usageDate: string;
    quotaTimezone: string;
    policyBundleVersion: string | null;
    quotaLimitUnits: number;
    usedQuotaUnits: number;
    reservedQuotaUnits: number;
    quotaDebtUnits: number;
    quotaOverrunLockUntil: Date | null;
    tokenUsageState: "known" | "unknown" | "not_applicable";
    providerAvailable: boolean;
    redisAvailable: boolean;
  } {
    const request = [...this.requests.values()].filter((candidate) => candidate.studentId === studentId).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    const timezone = request?.policy.timezone ?? "Asia/Jakarta";
    const localDay = quotaDateAndDayEnd(now, timezone);
    const ledger = this.ledgers.get(`${studentId}:${localDay.usageDate}:vera_quota_v1`);
    return {
      usageDate: localDay.usageDate,
      quotaTimezone: timezone,
      policyBundleVersion: request?.policy.bundleVersion ?? null,
      quotaLimitUnits: ledger?.quotaLimitUnitsSnapshot ?? 0,
      usedQuotaUnits: ledger?.usedQuotaUnits ?? 0,
      reservedQuotaUnits: ledger?.reservedQuotaUnits ?? 0,
      quotaDebtUnits: ledger?.quotaDebtUnits ?? 0,
      quotaOverrunLockUntil: ledger?.quotaOverrunLockUntil ?? null,
      tokenUsageState: request?.tokenUsageState ?? "not_applicable",
      providerAvailable: this.provider.enabled,
      redisAvailable: true,
    };
  }

  private async resolvePolicy(now: Date): Promise<VeraPolicyBundle> {
    if (this.options.policyResolver) return this.options.policyResolver(now);
    if (this.options.policy) return this.options.policy;
    if (this.options.policyBundles) {
      const bundle = this.options.policyBundles.find((candidate) => candidate.effectiveAt <= now && (candidate.state === "active" || candidate.state === "scheduled"));
      if (bundle) return bundle;
    }
    return defaultVeraPolicyBundle();
  }

  private payloadForFingerprint(input: VeraAdmissionInput): Record<string, unknown> {
    return {
      conversationId: input.conversationId,
      kind: input.kind ?? "chat",
      toolId: input.toolId ?? null,
      text: input.text,
      sourceIds: (input.selection ?? []).map((selection) => selection.sourceId),
      options: input.options ?? {},
      retryOfRequestId: input.retryOfRequestId ?? null,
    };
  }

  private emptyLedger(input: VeraAdmissionInput, snapshot: VeraPolicySnapshot, usageDate: string): QuotaLedger {
    return {
      usageDate,
      quotaLimitUnitsSnapshot: snapshot.quotaLimitUnits,
      usedQuotaUnits: 0,
      reservedQuotaUnits: 0,
      quotaDebtUnits: 0,
      quotaOverrunLockUntil: null,
      quotaTimezone: snapshot.timezone,
      quotaTimezonePolicyVersion: snapshot.timezonePolicyVersion,
      acceptedRequestCount: 0,
      finalizedRequestCount: 0,
    };
  }

  private async resolveUserMessage(input: VeraAdmissionInput): Promise<string> {
    if (input.retryOfRequestId) {
      const retryOf = this.requests.get(input.retryOfRequestId);
      if (!retryOf || retryOf.studentId !== input.studentId || retryOf.conversationId !== input.conversationId) {
        throw new VeraAdmissionError({ code: "retry_target_unavailable", status: 409 });
      }
      return retryOf.userMessageId;
    }
    return randomUUID();
  }

  private assertPreparedProviderTask(prepared: PreparedProviderTask, snapshot: VeraPolicySnapshot): void {
    if (!prepared.upstreamProviderSlug || prepared.upstreamProviderSlug === prepared.gateway) {
      throw new VeraAdmissionError({ code: "provider_prepare_unavailable", status: 503 });
    }
    if (prepared.maxProviderAttempts !== 2 || prepared.certifiedEstimate.certified !== true) {
      throw new VeraAdmissionError({ code: "provider_prepare_unavailable", status: 503 });
    }
    if (prepared.hardOutputQuotaUnits !== snapshot.hardOutputQuotaUnits) {
      throw new VeraAdmissionError({ code: "provider_prepare_unavailable", status: 503 });
    }
    if (prepared.certifiedEstimate.reservationBound < 1) {
      throw new VeraAdmissionError({ code: "provider_prepare_unavailable", status: 503 });
    }
  }

  private async rejectWithEvent(
    begin: IdempotencyBeginResult,
    input: VeraAdmissionInput,
    snapshot: VeraPolicySnapshot,
    usageDate: string,
    now: Date,
    reason: VeraAdmissionEvent["reason"],
  ): Promise<void> {
    if (begin.kind !== "new" && begin.kind !== "retry_rejected") return;
    await this.idempotency.reject(begin.record, { code: reason, classification: "transient" }, now);
    this.events.push({
      reason,
      studentId: input.studentId,
      featureKey: this.featureKey,
      occurredAt: now,
      usageDate,
      quotaTimezone: snapshot.timezone,
      policyBundleVersion: snapshot.bundleVersion,
      idempotencyKeyId: begin.record.id,
    });
  }

  private rejectedStatus(input: VeraAdmissionInput, code: string): VeraRequestStatusDto {
    return {
      requestId: "",
      conversationId: input.conversationId,
      clientRequestId: input.clientRequestId,
      state: "rejected",
      resultState: "rejected",
      errorCode: code,
      result: null,
      usage: {
        quotaUnitsReserved: 0,
        quotaUnitsConsumed: 0,
        tokenUsageState: "not_applicable",
        usageAccountingState: "unknown",
      },
      sequence: 4,
    };
  }

  private async withLock<T>(locks: Map<string, Promise<void>>, key: string, fn: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    locks.set(key, current);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (locks.get(key) === current) locks.delete(key);
    }
  }
}

export function createFocusedVeraAdmissionService(input: {
  contextResolver: VeraContextResolver;
  provider?: VeraProviderAdapter;
  leaseStore?: VeraLeaseStore;
  now?: () => Date;
}): VeraAdmissionService {
  return new VeraAdmissionService({
    contextResolver: input.contextResolver,
    provider: input.provider,
    leaseStore: input.leaseStore,
    now: input.now,
    policy: defaultVeraPolicyBundle(),
  });
}
