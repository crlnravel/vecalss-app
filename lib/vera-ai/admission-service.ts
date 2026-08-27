import "server-only";

import { randomUUID } from "node:crypto";

import {
  AiConversationType,
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
  Prisma,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { VeraAdmissionError } from "./admission";
import { encryptPreparedContextPackAsync, type PreparedContextPack } from "./context-pack";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";
import { VERA_FINGERPRINT_KEY_VERSION, sha256Hex } from "./contracts";
import { resolveVeraQuotaLimit, snapshotVeraPolicy, type BillingPlan, type VeraPolicyBundle, type VeraPolicySnapshot } from "./policy";
import { quotaDateAndDayEnd } from "./quota";
import type { NormalizedVeraResult } from "./output-validator";
import type { PreparedProviderTask } from "./provider";
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

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
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
    const policy = await this.resolveActivePolicyBundle(input.tx, input.now);
    const [billing, profile] = await Promise.all([
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
      // Lock order starts with the idempotency row, then the local-day row.
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${idempotencyKey.id}::uuid FOR UPDATE`;

      const localDay = quotaDateAndDayEnd(input.now, input.policy.timezone);
      const usageDate = dateOnly(localDay.usageDate);
      const ledger = await tx.aiUsageDaily.upsert({
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
      const reservation = input.preparedProviderTask.certifiedEstimate.reservationBound;
      assertPositiveInteger(reservation, "reservationBound");
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

      const conversation = await tx.aiConversation.findFirst({ where: { id: input.conversationId, studentId: input.studentId, deletionState: "active" }, select: { id: true } });
      if (!conversation) throw new VeraAdmissionError({ code: "target_unavailable", status: 404 });
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
          providerTaskDigest: input.preparedProviderTask.providerTaskDigest,
          quotaPolicyVersion: input.policy.policy.quotaConfig.quotaVersion,
          policyBundleVersion: input.policy.bundleVersion,
          retentionPolicyVersion: input.retentionPolicyVersion ?? "vera-retention-v1",
          settlementDeadlineAt: input.policy.settlementDeadlineAt,
          stageRetentionExpiresAt: input.stageRetentionExpiresAt
            ?? new Date(input.now.getTime() + input.policy.policy.retentionConfig.stageTtlHours * 60 * 60_000),
          hardOutputQuotaUnits: input.policy.hardOutputQuotaUnits,
          maxProviderAttempts: 2,
          quotaUnitsReserved: reservation,
          quotaUnitsConsumed: 0,
          tokenUsageState: AiTokenUsageState.unknown,
          usageAccountingState: AiUsageAccountingState.unknown,
          startedAt: input.now,
          userMessageId: durableUserMessageId,
          retryOfRequestId: input.retryOfRequestId ?? undefined,
        },
      });
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
          canonicalBytesCiphertext: encrypted ? json(encrypted.normalizedTaskCiphertext) : undefined,
          byteCount: input.pack.byteCount,
          packDigest: input.pack.packDigest,
          truncationJson: json(input.pack.truncation),
          redactionPolicyVersion: input.pack.redactionPolicyVersion,
          conversationMessageManifestCiphertext: json(input.pack.messageManifest),
          systemPolicyHash: input.pack.systemPolicyHash,
          promptTemplateHash: input.pack.promptTemplateHash,
          toolSchemaHash: input.pack.toolSchemaHash,
          providerTaskDigest: input.preparedProviderTask.providerTaskDigest,
          retentionClass: "vera-context",
          retentionPolicyVersion: input.retentionPolicyVersion ?? input.policy.bundleVersion,
          purgeAt: contextPurgeAt,
        },
      });
      for (const [index, block] of input.pack.blocks.entries()) {
        const snapshot = encrypted?.sourceSnapshots[index];
        await tx.aiRequestSource.create({
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
      }
      await tx.aiUsageDaily.update({ where: { id: ledger.id }, data: { reservedQuotaUnits: { increment: reservation }, acceptedRequestCount: { increment: 1 } } });
      const acceptedKey = await tx.aiIdempotencyKey.updateMany({
        where: { id: idempotencyKey.id, version: idempotencyKey.version, state: AiIdempotencyState.rejected },
        data: { state: AiIdempotencyState.accepted, resultKind: AiIdempotencyResultKind.request, resultId: request.id, acceptedAt: input.now, settlementDeadlineAt: input.policy.settlementDeadlineAt, expiresAt: new Date(input.now.getTime() + input.policy.policy.retentionConfig.acceptedKeyTtlDays * 24 * 60 * 60_000), rejectionClass: null, rejectionCode: null, version: { increment: 1 } },
      });
      if (acceptedKey.count !== 1) throw new VeraAdmissionError({ code: "idempotency_cas_conflict", status: 409 });
      return { accepted: true, requestId: request.id, idempotencyKeyId: idempotencyKey.id, userMessageId: durableUserMessageId, contextPackId, usageDate: localDay.usageDate, quotaUnitsReserved: reservation, preparedProviderTask: input.preparedProviderTask };
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

  async stageResult(input: {
    requestId: string;
    result: NormalizedVeraResult;
    encryptedResult: AiEncryptedPayload;
    outputSchemaId?: string;
    outputSchemaHash?: string;
    now?: Date;
  }): Promise<{ id: string; replayed: boolean }> {
    const now = input.now ?? await this.databaseNow();
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
          stagedAt: now,
          expiresAt: stageExpiresAt,
          retentionPolicyVersion: request.retentionPolicyVersion ?? "unknown",
        },
      });
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
    };
    stage: {
      id: string;
      version: number;
      state: AiResultStageState;
      resultDigest: string | null;
      quotaUnitsConsumed: number | null;
      tokenUsageState: AiTokenUsageState;
    };
    normalizedResult: NormalizedVeraResult;
    now: Date;
    persistDurableResult: (tx: Prisma.TransactionClient, normalizedResult: NormalizedVeraResult) => Promise<VeraDurableCallbackResult>;
  }): Promise<{ requestId: string; assistantMessageId: string | null; usageAccountingState: AiUsageAccountingState }> {
    const { tx, request, daily, stage, normalizedResult, now } = input;
    if (!request.idempotencyKeyId || !request.idempotencyKey) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    const durable = await input.persistDurableResult(tx, normalizedResult);
    const reserved = request.quotaUnitsReserved;
    const actual = stage.quotaUnitsConsumed ?? reserved;
    const remainingReserved = daily.reservedQuotaUnits - reserved;
    if (remainingReserved < 0) throw new VeraAdmissionError({ code: "quota_ledger_conflict", status: 409 });
    const used = daily.usedQuotaUnits + actual;
    const debt = Math.max(0, used + remainingReserved - daily.quotaLimitUnitsSnapshot);
    const overrun = Math.max(0, actual - reserved);
    const localDayEnd = quotaDateAndDayEnd(request.createdAt, daily.quotaTimezone).dayEnd;
    const overrunLockUntil = overrun > 0 || debt > 0 ? localDayEnd : daily.quotaOverrunLockUntil;
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
        },
      });
    }
    const requestState = normalizedResult.kind === "fallback" ? AiRequestLifecycleState.fallback : normalizedResult.kind === "discarded" ? AiRequestLifecycleState.failed : AiRequestLifecycleState.succeeded;
    const accounting = stage.quotaUnitsConsumed === null ? AiUsageAccountingState.unknown : overrun > 0 || debt > 0 ? AiUsageAccountingState.overrun_debt : AiUsageAccountingState.known;
    await tx.aiUsageDaily.update({ where: { id: daily.id }, data: { reservedQuotaUnits: remainingReserved, usedQuotaUnits: used, quotaDebtUnits: debt, quotaOverrunLockUntil: overrunLockUntil, finalizedRequestCount: { increment: 1 } } });
    const consumed = await tx.aiRequestResultStage.updateMany({
      where: { id: stage.id, version: stage.version, state: AiResultStageState.available },
      data: { state: AiResultStageState.consumed, consumedAt: now, version: { increment: 1 } },
    });
    if (consumed.count !== 1) throw new VeraAdmissionError({ code: "stage_cas_conflict", status: 409 });
    const finalized = await tx.aiRequest.updateMany({
      where: { id: request.id, version: request.version, status: { in: [AiRequestLifecycleState.pending, AiRequestLifecycleState.staged] } },
      data: { status: requestState, assistantMessageId, quotaUnitsConsumed: actual, quotaOverrunUnits: overrun, tokenUsageState: stage.tokenUsageState, usageAccountingState: accounting, completedAt: now, finalizedAt: now, version: { increment: 1 } },
    });
    if (finalized.count !== 1) throw new VeraAdmissionError({ code: "request_cas_conflict", status: 409 });
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
        select: { id: true, studentId: true, idempotencyKeyId: true, createdAt: true },
      });
      if (!initial || !initial.studentId || !initial.idempotencyKeyId) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });

      // Lock order: idempotency -> frozen daily row -> request -> stage.
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
      const dailyCandidates = await tx.aiUsageDaily.findMany({ where: { studentId: initial.studentId, ledgerVersion: AiUsageLedgerVersion.vera_quota_v1 }, orderBy: { usageDate: "desc" } });
      const daily = dailyCandidates.find((candidate) => quotaDateAndDayEnd(initial.createdAt, candidate.quotaTimezone).usageDate === candidate.usageDate.toISOString().slice(0, 10));
      if (!daily) throw new VeraAdmissionError({ code: "quota_ledger_missing", status: 503 });
      await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE id = ${daily.id}::uuid FOR UPDATE`;
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

      return this.finalizeLockedRequest({
        tx,
        request,
        daily,
        stage,
        normalizedResult: input.normalizedResult,
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
    now?: Date;
  }): Promise<void> {
    const now = input.now ?? await this.databaseNow();
    await this.db.$transaction(async (tx) => {
      const initial = await tx.aiRequest.findUnique({
        where: { id: input.requestId },
        select: { id: true, studentId: true, idempotencyKeyId: true, createdAt: true },
      });
      if (!initial || !initial.studentId || !initial.idempotencyKeyId) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
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
      const actual = input.usage.quotaUnitsConsumed ?? reserved;
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
        select: { id: true, studentId: true, idempotencyKeyId: true, createdAt: true },
      });
      if (!initial || !initial.studentId || !initial.idempotencyKeyId) return;

      // The worker follows the same global lock order as admission/finalizer:
      // idempotency -> frozen daily row -> request -> stage.
      await tx.$queryRaw`SELECT id FROM ai_idempotency_keys WHERE id = ${initial.idempotencyKeyId}::uuid FOR UPDATE`;
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
          await tx.$executeRawUnsafe("SAVEPOINT vera_durable_recovery");
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
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT vera_durable_recovery");
            return;
          } catch (error) {
            await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT vera_durable_recovery");
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT vera_durable_recovery");
            if (!request.settlementDeadlineAt || request.settlementDeadlineAt > now) {
              throw new VeraAdmissionError({
                code: error instanceof VeraDurableResultError ? error.code : "durable_recovery_unavailable",
                status: 503,
              });
            }
          }
        }
      }
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
