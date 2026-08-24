import "server-only";

import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  AiIdempotencyOperation,
  AiRequestLifecycleState,
} from "@/generated/prisma/client";

import {
  VeraAdmissionError,
  type VeraAdmissionInput,
  type VeraRequestStatusDto,
} from "./admission";
import {
  VeraPrismaAdmissionService,
} from "./admission-service";
import { VeraContractError } from "./contracts";
import { prepareContextPack, type VeraContextResolver } from "./context-pack";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry, environmentEnvelopeRootKeyProvider, type AiEncryptedPayload } from "./envelope";
import { IdempotencyService, InMemoryIdempotencyStore } from "./idempotency";
import {
  IORedisVeraLeaseStore,
  type VeraLease,
  type VeraLeaseAcquireOutcome,
  type VeraLeaseStore,
  VeraRedisUnavailableError,
} from "./redis-lease";
import { VeraOutputValidationError, validateVeraResult, type NormalizedVeraResult } from "./output-validator";
import { ProviderSafetyError, type PreparedProviderTask, type VeraProviderAdapter } from "./provider";
import { getVeraFeatureContract, validateStudioOutput } from "./studio-contracts";
import { prepareStudioAuthority, type VeraStudioIdentityAuthority } from "./studio-authority";
import type { VeraSseEvent, VeraSseEventName } from "./chat-orchestrator";

type PrismaChatDb = typeof defaultPrisma;

export type PrismaVeraChatOrchestratorOptions = {
  db?: PrismaChatDb;
  admission?: VeraPrismaAdmissionService;
  contextResolver: VeraContextResolver;
  provider: VeraProviderAdapter;
  envelope?: EnvelopeService;
  leaseStore?: VeraLeaseStore;
  hmacSecret: string;
  assertConversationOwner?: (studentId: string, conversationId: string) => Promise<void>;
};

type PreparedAdmission = {
  kind: "accepted";
  requestId: string;
  preparedProviderTask: PreparedProviderTask;
  allowedCitationKeys: string[];
  lease: VeraLease;
  now: Date;
  feature: ReturnType<typeof getVeraFeatureContract>;
  identityAuthority: VeraStudioIdentityAuthority | null;
};

type TransportAdmission = PreparedAdmission | { kind: "json"; status: VeraRequestStatusDto };

function payloadForFingerprint(input: VeraAdmissionInput): Record<string, unknown> {
  return {
    conversationId: input.conversationId,
    kind: input.kind ?? "chat",
    toolId: input.toolId ?? null,
    text: input.text,
    sources: (input.selection ?? []).map(({ sourceType, sourceId }) => ({ sourceType, sourceId })),
    options: input.options ?? {},
    retryOfRequestId: input.retryOfRequestId ?? null,
  };
}

function statusForRejection(input: VeraAdmissionInput, code: string): VeraRequestStatusDto {
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

function errorCode(error: unknown): string {
  if (error instanceof VeraAdmissionError || error instanceof VeraContractError) return error.code;
  if (error instanceof ProviderSafetyError) return "provider_prepare_unavailable";
  if (error instanceof VeraRedisUnavailableError) return "redis_unavailable";
  if (error instanceof Error && error.message === "drill_candidate_unavailable") return "drill_candidate_unavailable";
  if (error instanceof Error && error.message.startsWith("studio_authority_")) return "context_release_unavailable";
  return "admission_unavailable";
}

function encodeEvent(event: VeraSseEvent): Uint8Array {
  return new TextEncoder().encode(`id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

function isTerminal(status: VeraRequestStatusDto): boolean {
  return status.state === "succeeded" || status.state === "fallback" || status.state === "failed";
}

async function decodePersistedResult(envelope: EnvelopeService | undefined, ciphertext: unknown): Promise<{ text: string | null; citationKeys: string[] } | null> {
  if (!envelope || !ciphertext || typeof ciphertext !== "object") return null;
  try {
    const parsed = JSON.parse(await envelope.decryptTextAsync(ciphertext as AiEncryptedPayload)) as NormalizedVeraResult;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.citationKeys)) return null;
    return { text: parsed.text, citationKeys: parsed.citationKeys.filter((key): key is string => typeof key === "string") };
  } catch {
    return null;
  }
}

/**
 * Durable production transport. Admission, replay, stage, settlement, and
 * status all use Prisma; only the focused tests use the in-memory orchestrator.
 */
export class VeraPrismaChatOrchestrator {
  private readonly db: PrismaChatDb;
  private readonly admission: VeraPrismaAdmissionService;
  private readonly provider: VeraProviderAdapter;
  private readonly contextResolver: VeraContextResolver;
  private readonly envelope: EnvelopeService;
  private readonly leaseStore: VeraLeaseStore;
  private readonly idempotency: IdempotencyService;
  private readonly options: PrismaVeraChatOrchestratorOptions;

  constructor(options: PrismaVeraChatOrchestratorOptions) {
    this.options = options;
    this.db = options.db ?? defaultPrisma;
    this.provider = options.provider;
    this.contextResolver = options.contextResolver;
    this.envelope = options.envelope ?? new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(this.db, environmentEnvelopeRootKeyProvider()));
    this.admission = options.admission ?? new VeraPrismaAdmissionService(this.db, this.envelope);
    this.leaseStore = options.leaseStore ?? this.createLeaseStore();
    this.idempotency = new IdempotencyService(new InMemoryIdempotencyStore(), { hmacSecret: options.hmacSecret });
  }

  async status(input: { studentId: string; conversationId: string; clientRequestId: string }): Promise<VeraRequestStatusDto | null> {
    await this.options.assertConversationOwner?.(input.studentId, input.conversationId);
    return readPrismaVeraRequestStatus(this.db, input, { admission: this.admission, envelope: this.envelope });
  }

  async sse(input: VeraAdmissionInput & { signal?: AbortSignal }): Promise<Response> {
    await this.options.assertConversationOwner?.(input.studentId, input.conversationId);
    let admission: TransportAdmission;
    try {
      admission = await this.prepareAdmission(input);
    } catch (error) {
      if (error instanceof VeraAdmissionError || error instanceof VeraContractError) throw error;
      throw new VeraAdmissionError({ code: errorCode(error), status: 503 });
    }
    if (admission.kind === "json") {
      const expired = admission.status.state === "expired" || admission.status.errorCode === "idempotency_key_expired";
      return Response.json(admission.status, {
        status: admission.status.state === "rejected" || expired ? 409 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const stream = this.createProgressiveStream(admission, input);
    return new Response(stream, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  }

  private createLeaseStore(): VeraLeaseStore {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      return {
        acquire: async () => { throw new VeraRedisUnavailableError("A dedicated Vera Redis URL is required."); },
        renew: async () => { throw new VeraRedisUnavailableError("A dedicated Vera Redis URL is required."); },
        release: async () => { throw new VeraRedisUnavailableError("A dedicated Vera Redis URL is required."); },
      };
    }
    return new IORedisVeraLeaseStore(url);
  }

  private async prepareAdmission(input: VeraAdmissionInput): Promise<TransportAdmission> {
    const now = await this.admission.databaseNow();
    const feature = getVeraFeatureContract(input.kind ?? "chat", input.toolId);
    if (input.retryOfRequestId) {
      await this.admission.assertRetryTargetEligible({
        requestId: input.retryOfRequestId,
        studentId: input.studentId,
        conversationId: input.conversationId,
        featureKey: feature.featureKey,
        text: input.text,
      });
    }
    const fingerprint = this.idempotency.fingerprint("ai_request", payloadForFingerprint(input));
    const existing = await this.admission.lookupIdempotencyKey(input.studentId, input.clientRequestId);
    if (existing) {
      if (existing.expiresAt <= now || existing.state === "expired") {
        const status = await readPrismaVeraRequestStatus(this.db, input, { admission: this.admission, envelope: this.envelope });
        if (status) return { kind: "json", status };
        throw new VeraAdmissionError({ code: "idempotency_key_expired", status: 409 });
      }
      if (existing.requestFingerprint !== fingerprint) throw new VeraAdmissionError({ code: "idempotency_conflict", status: 409 });
      const status = await readPrismaVeraRequestStatus(this.db, input, { admission: this.admission, envelope: this.envelope });
      if (existing.state === "accepted" || existing.rejectionClass === "terminal" || status?.state !== "rejected") {
        if (status) return { kind: "json", status };
      }
    }

    const policy = await this.admission.snapshotForStudentAt({
      studentId: input.studentId,
      now,
      featureKey: feature.featureKey,
    });
    if (now < policy.policy.effectiveAt) throw new VeraAdmissionError({ code: "vera_not_active", status: 422 });

    const leaseInput = {
      studentId: input.studentId,
      featureKey: feature.featureKey,
      maxConcurrent: 2,
      burstLimit: 10,
      burstWindowMs: 60_000,
      ttlMs: Math.max(10_000, Math.min(120_000, policy.policy.settlementConfig.maxPendingAgeMinutes * 60_000)),
      now,
    };
    let outcome: VeraLeaseAcquireOutcome;
    try {
      outcome = this.leaseStore.acquireWithReason
        ? await this.leaseStore.acquireWithReason(leaseInput)
        : { lease: await this.leaseStore.acquire(leaseInput) };
    } catch {
      await this.admission.recordRejectedAdmission({
        studentId: input.studentId,
        clientRequestId: input.clientRequestId,
        requestFingerprint: fingerprint,
        featureKey: feature.featureKey,
        policy,
        now,
        code: "redis_unavailable",
        reason: "redis_unavailable",
      });
      return { kind: "json", status: statusForRejection(input, "redis_unavailable") };
    }
    if (!outcome.lease) {
      const reason = outcome.rejectionReason ?? "concurrency";
      await this.admission.recordRejectedAdmission({
        studentId: input.studentId,
        clientRequestId: input.clientRequestId,
        requestFingerprint: fingerprint,
        featureKey: feature.featureKey,
        policy,
        now,
        code: reason,
        reason,
      });
      return { kind: "json", status: statusForRejection(input, reason) };
    }
    let activeLease = outcome.lease;
    try {
      const renewed = await this.leaseStore.renew(activeLease, leaseInput.ttlMs, now);
      if (!renewed) throw new VeraRedisUnavailableError("Vera Redis fencing renewal was lost before commit.");
      activeLease = renewed;
    } catch {
      await this.admission.recordRejectedAdmission({
        studentId: input.studentId,
        clientRequestId: input.clientRequestId,
        requestFingerprint: fingerprint,
        featureKey: feature.featureKey,
        policy,
        now,
        code: "redis_unavailable",
        reason: "redis_unavailable",
      });
      await this.leaseStore.release(activeLease).catch(() => false);
      return { kind: "json", status: statusForRejection(input, "redis_unavailable") };
    }

    try {
      // Redis is the first downstream side effect after policy admission. A
      // burst/concurrency rejection or unavailable Redis must not resolve
      // context or invoke provider.prepare.
      let preparedProviderTask: PreparedProviderTask;
      let pack;
      let studioAuthority: Awaited<ReturnType<typeof prepareStudioAuthority>> | null = null;
      try {
        studioAuthority = feature.toolId
          ? await prepareStudioAuthority(this.db, { studentId: input.studentId, selection: input.selection ?? [] })
          : null;
        pack = await prepareContextPack({
          studentId: input.studentId,
          selection: input.selection ?? [],
          userText: input.text,
          policyVersion: policy.bundleVersion,
          promptTemplateHash: `${feature.featureKey}-prompt-v1`,
          toolSchemaHash: feature.schemaHash,
          systemPolicyHash: policy.policy.validationDigest,
          taskAuthority: studioAuthority ? { studio: studioAuthority.identity, drill: studioAuthority.drill } : undefined,
        }, this.contextResolver);
        preparedProviderTask = await this.provider.prepare({
          featureKey: feature.featureKey,
          behaviorVersion: feature.behaviorVersion,
          taskBytes: pack.canonicalTaskBytes,
          contextTaskDigest: pack.contextTaskDigest,
          hardOutputQuotaUnits: policy.hardOutputQuotaUnits,
        });
        if (!preparedProviderTask.upstreamProviderSlug || preparedProviderTask.upstreamProviderSlug === preparedProviderTask.gateway) {
          throw new ProviderSafetyError("Observed upstream provider identity is not pinned.");
        }
      } catch (error) {
        const code = errorCode(error);
        await this.admission.recordRejectedAdmission({
          studentId: input.studentId,
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          featureKey: feature.featureKey,
          policy,
          now,
          code,
        });
        return { kind: "json", status: statusForRejection(input, code) };
      }

      try {
        const persisted = await this.admission.admitPreparedRequest({
          studentId: input.studentId,
          conversationId: input.conversationId,
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          featureKey: feature.featureKey,
          requestType: feature.requestType,
          behaviorVersion: feature.behaviorVersion,
          outputSchemaVersion: feature.outputSchemaVersion,
          outputSchemaId: feature.schemaId,
          outputSchemaHash: feature.schemaHash,
          text: input.text,
          retryOfRequestId: input.retryOfRequestId,
          pack,
          preparedProviderTask,
          policy,
          now,
          retentionPolicyVersion: policy.bundleVersion,
          stageRetentionExpiresAt: new Date(now.getTime() + policy.policy.retentionConfig.stageTtlHours * 60 * 60_000),
        });
        if (!persisted.accepted) {
          return { kind: "json", status: statusForRejection(input, persisted.rejectionCode ?? "quota") };
        }
        return {
          kind: "accepted",
          requestId: persisted.requestId,
          preparedProviderTask: persisted.preparedProviderTask ?? preparedProviderTask,
          allowedCitationKeys: pack.blocks.map((block) => block.citationKey),
          lease: activeLease,
          now,
          feature,
          identityAuthority: studioAuthority?.identity ?? null,
        };
      } catch (error) {
        if (error instanceof VeraAdmissionError && ["idempotency_conflict", "idempotency_key_expired"].includes(error.code)) throw error;
        if (error instanceof VeraAdmissionError && error.code === "request_pending") {
          const status = await readPrismaVeraRequestStatus(this.db, input, { admission: this.admission, envelope: this.envelope });
          if (status) return { kind: "json", status };
          throw error;
        }
        const code = errorCode(error);
        await this.admission.recordRejectedAdmission({
          studentId: input.studentId,
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          featureKey: feature.featureKey,
          policy,
          now,
          code,
        });
        return { kind: "json", status: statusForRejection(input, code) };
      }
    } finally {
      await this.leaseStore.release(activeLease).catch(() => false);
    }
  }

  private createProgressiveStream(admission: PreparedAdmission, input: VeraAdmissionInput & { signal?: AbortSignal }): ReadableStream<Uint8Array> {
    let streamCancelled = false;
    let cancelSettled = false;
    let sequence = 0;
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const write = (event: VeraSseEventName, data: Record<string, unknown>) => {
      if (streamCancelled || !controllerRef) return;
      const next: VeraSseEvent = { id: ++sequence, event, data };
      controllerRef.enqueue(encodeEvent(next));
    };
    const settleCancelled = async (code = "cancelled", forceUnknown = false) => {
      if (cancelSettled) return;
      cancelSettled = true;
      await this.admission.settleOverdueRequest({ requestId: admission.requestId, now: admission.now, forceUnknown, errorCode: code }).catch(() => undefined);
    };
    const onAbort = () => {
      void settleCancelled("cancelled", true);
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        controllerRef = controller;
        write("request.started", { requestId: admission.requestId, clientRequestId: input.clientRequestId, provisional: true });
        if (admission.feature.toolId) {
          write("progress.updated", { requestId: admission.requestId, stage: "preparing", progress: 20, provisional: true });
        }
        void this.executeAccepted(admission, input, write, settleCancelled)
          .catch(async (error) => {
            if (streamCancelled) return;
            const code = errorCode(error);
            await settleCancelled(code);
            write("request.recovery_pending", { requestId: admission.requestId, code, provisional: false });
          })
          .finally(() => {
            input.signal?.removeEventListener("abort", onAbort);
            if (!streamCancelled) controller.close();
          });
      },
      cancel: async () => {
        streamCancelled = true;
        await settleCancelled("cancelled", true);
      },
    });
  }

  private async executeAccepted(
    admission: PreparedAdmission,
    input: VeraAdmissionInput & { signal?: AbortSignal },
    write: (event: VeraSseEventName, data: Record<string, unknown>) => void,
    settleCancelled: (code?: string, forceUnknown?: boolean) => Promise<void>,
  ): Promise<void> {
    if (input.signal?.aborted) {
      await settleCancelled("cancelled", true);
      write("request.failed", { requestId: admission.requestId, code: "cancelled", provisional: false });
      return;
    }
    let providerResult;
    try {
      providerResult = await this.provider.run(
        admission.preparedProviderTask,
        admission.feature.toolId
          ? undefined
          : (delta) => {
            write("message.delta", { requestId: admission.requestId, text: delta.text, provisional: true });
          },
      );
    } catch (error) {
      await settleCancelled(errorCode(error));
      write("request.recovery_pending", { requestId: admission.requestId, code: errorCode(error), provisional: false });
      return;
    }
    if (input.signal?.aborted) {
      await settleCancelled("cancelled", true);
      write("request.failed", { requestId: admission.requestId, code: "cancelled", provisional: false });
      return;
    }
    let studioPayload;
    let normalized: NormalizedVeraResult;
    try {
      studioPayload = admission.feature.toolId
        ? validateStudioOutput({
          toolId: admission.feature.toolId,
          structured: providerResult.structured,
          allowedCitationKeys: admission.allowedCitationKeys,
          identityAuthority: admission.identityAuthority!,
        })
        : null;
      if (studioPayload) {
        write("progress.updated", { requestId: admission.requestId, stage: "validating", progress: 70, provisional: true });
      }
      normalized = validateVeraResult({
        text: studioPayload ? null : providerResult.text,
        structured: studioPayload ?? providerResult.structured,
        kind: providerResult.kind === "text" || providerResult.kind === "structured" ? "success" : providerResult.kind === "fallback" ? "fallback" : "discarded",
        finishReason: providerResult.finishReason,
        usage: providerResult.usage,
        allowedCitationKeys: admission.allowedCitationKeys,
      });
    } catch (error) {
      const code = error instanceof VeraOutputValidationError ? error.code : "malformed_output";
      await this.admission.failAcceptedProviderResult({
        requestId: admission.requestId,
        errorCode: code,
        usage: providerResult.usage,
      });
      write("request.failed", { requestId: admission.requestId, code, provisional: false });
      return;
    }
    const encrypted = await this.envelope.encryptAsync(JSON.stringify(normalized), `ai-result:${admission.requestId}`);
    const finalizeNow = await this.admission.databaseNow();
    await this.admission.stageResult({
      requestId: admission.requestId,
      result: normalized,
      encryptedResult: encrypted,
      outputSchemaId: admission.feature.schemaId,
      outputSchemaHash: admission.feature.schemaHash,
      now: finalizeNow,
    });
    if (studioPayload) {
      write("progress.updated", { requestId: admission.requestId, stage: "committing", progress: 90, provisional: true });
    }
    const finalized = await this.admission.finalizeAcceptedRequest({
      requestId: admission.requestId,
      normalizedResult: normalized,
      now: finalizeNow,
    });
    if (studioPayload) {
      const artifact = await this.db.aiArtifact.findUnique({
        where: { requestId: admission.requestId },
        select: { id: true, artifactType: true, revision: true },
      });
      if (!artifact) throw new VeraAdmissionError({ code: "artifact_commit_unavailable", status: 503 });
      write("artifact.ready", {
        requestId: admission.requestId,
        artifactRevisionId: artifact.id,
        artifactType: artifact.artifactType,
        revision: artifact.revision,
        provisional: false,
      });
    } else {
      write("message.generated", { requestId: admission.requestId, text: normalized.text, citationKeys: normalized.citationKeys, provisional: true });
      write("message.committed", { requestId: admission.requestId, assistantMessageId: finalized.assistantMessageId, provisional: false });
    }
    const status = await readPrismaVeraRequestStatus(this.db, {
      studentId: input.studentId,
      conversationId: input.conversationId,
      clientRequestId: input.clientRequestId,
    }, { admission: this.admission, envelope: this.envelope });
    if (status && isTerminal(status)) {
      write("request.completed", { requestId: admission.requestId, state: status.state, usage: status.usage });
    } else {
      write("request.recovery_pending", { requestId: admission.requestId, code: "status_unavailable", provisional: false });
    }
  }
}

export async function readPrismaVeraRequestStatus(
  db: PrismaChatDb,
  input: { studentId: string; conversationId: string; clientRequestId: string },
  options: { admission?: VeraPrismaAdmissionService; envelope?: EnvelopeService } = {},
): Promise<VeraRequestStatusDto | null> {
  const snapshot = await db.$transaction(async (tx) => {
    const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const now = nowRows[0]?.now ?? new Date();
    const key = await tx.aiIdempotencyKey.findUnique({
      where: {
        studentId_operation_clientRequestId: {
          studentId: input.studentId,
          operation: AiIdempotencyOperation.ai_request,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (!key) return null;
    const request = key.resultId
      ? await tx.aiRequest.findFirst({ where: { id: key.resultId, studentId: input.studentId, conversationId: input.conversationId }, include: { resultStage: true, artifacts: { select: { id: true, artifactType: true, revision: true }, take: 1 } } })
      : null;
    if (!request) return null;
    return { now, key, request };
  });
  if (!snapshot) return null;
  const { now, key, request } = snapshot;
  if (key.expiresAt <= now || key.state === "expired") {
    return {
      requestId: request.id,
      conversationId: input.conversationId,
      clientRequestId: input.clientRequestId,
      state: "expired",
      resultState: "expired",
      errorCode: "idempotency_key_expired",
      result: null,
      artifact: null,
      usage: { quotaUnitsReserved: 0, quotaUnitsConsumed: 0, tokenUsageState: "not_applicable", usageAccountingState: "unknown" },
      sequence: 4,
    };
  }

  const requestPending = request.status === AiRequestLifecycleState.pending || request.status === AiRequestLifecycleState.staged;
  const deadlineExpired = Boolean(request.settlementDeadlineAt && request.settlementDeadlineAt <= now);
  const stageExpired = request.resultStage?.state === "available" && request.resultStage.expiresAt <= now;
  if (options.admission && requestPending && (deadlineExpired || stageExpired)) {
    await options.admission.settleOverdueRequest({
      requestId: request.id,
      now,
      errorCode: "settlement_deadline_expired",
    });
    return readPrismaVeraRequestStatus(db, input, options);
  }

  const terminal = request.status === AiRequestLifecycleState.succeeded || request.status === AiRequestLifecycleState.fallback || request.status === AiRequestLifecycleState.failed;
  const result = await decodePersistedResult(options.envelope, request.resultStage?.normalizedResultCiphertext);
  const resultState = terminal ? request.assistantMessageId || result ? "committed" : "unavailable" : request.resultStage?.state === "available" ? "staged" : "pending";
  return {
    requestId: request.id,
    conversationId: input.conversationId,
    clientRequestId: input.clientRequestId,
    state: request.status as VeraRequestStatusDto["state"],
    resultState,
    errorCode: request.errorCode,
    result,
    artifact: request.artifacts[0] ?? null,
    usage: {
      quotaUnitsReserved: request.quotaUnitsReserved,
      quotaUnitsConsumed: request.quotaUnitsConsumed,
      tokenUsageState: request.tokenUsageState,
      usageAccountingState: request.usageAccountingState,
    },
    sequence: terminal ? 4 : request.resultStage?.state === "available" ? 3 : 1,
  };
}
