import "server-only";

import { prisma } from "@/lib/prisma";

import { VeraAdmissionError } from "./admission";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry, environmentEnvelopeRootKeyProvider } from "./envelope";
import { VeraPrismaAdmissionService } from "./admission-service";
import { createPrismaVeraContextResolver } from "./prisma-context-resolver";
import { createPrismaContextRegistry } from "./context-query-registry";
import { createPrismaLocalContextRegistry } from "./local-context-registry";
import { VeraPrismaChatOrchestrator, readPrismaVeraRequestStatus } from "./prisma-chat-orchestrator";
import { createDefaultProviderAdapter, MockProviderAdapter } from "./provider";
import { createVeraOpenRouterFreePocProviderAdapter } from "./openrouter-free-poc-provider";
import { evaluateVeraOpenRouterFreePocGate } from "./openrouter-free-poc";
import { Span01LocalSelector } from "./local-respan-selector";
import { canonicalJson, sha256Hex } from "./contracts";
import type { VeraProviderAdapter } from "./provider";
import { IORedisVeraLeaseStore } from "./redis-lease";
import type { VeraRequestStatusDto } from "./admission";
import { VeraLearnerService } from "./learner-service";
import { VeraArtifactCommandService } from "./artifact-commands";
import { VeraDrillService } from "./drill-service";
import { VeraLifecycleService } from "./lifecycle-service";
import { emptyV2UsageDto, ledgerVersionFor } from "./quota-v2";
import {
  evaluateVeraAutomaticContextGate,
  evaluateVeraAutomaticContextRollout,
  automaticContextRolloutStageForConfig,
  parseVeraAutomaticContextPromotionEvidence,
  readVeraAutomaticContextPromotionEvidence,
  readVeraAutomaticContextRolloutConfig,
  type VeraAutomaticContextGate,
} from "./automatic-context-operations";

let cachedOrchestrator: VeraPrismaChatOrchestrator | null = null;
const routeEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(prisma, environmentEnvelopeRootKeyProvider()));
const routeAdmission = new VeraPrismaAdmissionService(prisma, routeEnvelope);
let cachedLearnerService: VeraLearnerService | null = null;
let cachedArtifactCommandService: VeraArtifactCommandService | null = null;
let cachedDrillService: VeraDrillService | null = null;
let cachedLifecycleService: VeraLifecycleService | null = null;

const TIMEZONE_DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatLocalDateInTimezone(date: Date, timeZone: string): string {
  let formatter = TIMEZONE_DATE_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    TIMEZONE_DATE_FORMATTERS.set(timeZone, formatter);
  }
  return formatter.format(date);
}

/**
 * Select the only dev POC provider ahead of the normal mock/default chain.
 * The POC adapter performs the complete explicit environment gate itself;
 * this helper exists so route tests can verify selection without constructing
 * a Prisma orchestrator or invoking any provider transport.
 */
export function selectVeraChatProvider(env: NodeJS.ProcessEnv = process.env): VeraProviderAdapter {
  const poc = createVeraOpenRouterFreePocProviderAdapter({ env });
  if (poc.enabled) return poc;
  // Development must never spend against the paid release route. The free
  // POC is selected only after its complete explicit gate passes; if that
  // gate is incomplete, keep the local route mock/disabled rather than
  // silently turning on a paid provider because a shared shell exported the
  // live flag.
  if (env.NODE_ENV?.toLowerCase() === "development") {
    if (env.VERA_MOCK_PROVIDER_ENABLED === "true") return new MockProviderAdapter();
    return new MockProviderAdapter("outage");
  }
  // A live flag is an explicit production route selection. The paid adapter
  // validates the release manifest and returns a disabled adapter when the
  // manifest, API key, or transport gate is absent; it must not silently fall
  // through to the mock provider.
  if (env.VERA_LIVE_PROVIDER_ENABLED === "true") return createDefaultProviderAdapter(env);
  if (env.VERA_MOCK_PROVIDER_ENABLED === "true") return new MockProviderAdapter();
  return createDefaultProviderAdapter(env);
}

export function veraProviderAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (evaluateVeraOpenRouterFreePocGate(env).enabled) return true;
  if (env.NODE_ENV?.toLowerCase() === "development") return false;
  if (env.VERA_LIVE_PROVIDER_ENABLED !== "true") return false;
  return createDefaultProviderAdapter(env).enabled;
}

function veraPaidAutomaticProviderReady(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV?.toLowerCase() === "development") return false;
  if (env.VERA_LIVE_PROVIDER_ENABLED !== "true") return false;
  if (env.VERA_MOCK_PROVIDER_ENABLED === "true") return false;
  if (evaluateVeraOpenRouterFreePocGate(env).enabled) return false;
  const provider = selectVeraChatProvider(env);
  return provider.enabled === true && provider.automaticContextCapable === true;
}

/** Resolve the effective student-scoped rollout. The legacy boolean remains
 * an explicit compatibility requirement; the operations policy adds stable
 * cohorts, canary freshness, provider capability, and emergency-off checks. */
export function veraAutomaticContextGateForStudent(
  studentId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): VeraAutomaticContextGate {
  const providerReady = veraPaidAutomaticProviderReady(env)
    && env.VERA_AUTOMATIC_CONTEXT_PROVIDER_CAPABILITY_READY === "true";
  const config = readVeraAutomaticContextRolloutConfig({
    ...env,
    VERA_AUTOMATIC_CONTEXT_STATE: env.VERA_AUTOMATIC_CONTEXT_ENABLED === "true" ? env.VERA_AUTOMATIC_CONTEXT_STATE : "off",
    VERA_AUTOMATIC_CONTEXT_PROVIDER_CAPABILITY_READY: providerReady ? "true" : "false",
  });
  if (config.state !== "off") {
    const promotion = readVeraAutomaticContextPromotionEvidence(env);
    const target = automaticContextRolloutStageForConfig(config);
    const promotionVerified = promotion
      && promotion.target === target
      && evaluateVeraAutomaticContextRollout({
        current: promotion.current,
        target: promotion.target,
        aggregate: promotion.aggregate,
        providerCapabilityReady: providerReady && promotion.providerCapabilityReady,
        capabilityEvidence: promotion.capabilityEvidence,
        canaryExpiresAt: promotion.canaryExpiresAt,
        legacyRetirementReviewed: promotion.legacyRetirementReviewed,
        now,
      }).allowed;
    if (!promotionVerified) {
      return {
        enabled: false,
        state: "off",
        policyVersion: config.policyVersion,
        reason: "promotion_unverified",
        cohortBasisPoints: null,
      };
    }
  }
  return evaluateVeraAutomaticContextGate({
    studentId,
    now,
    config,
    isDevelopment: env.NODE_ENV?.toLowerCase() === "development",
  });
}

type LocalFreePriceSnapshot = {
  routeModel: "openrouter/free";
  resolvedModel: string;
  provider: string;
  promptPriceUsdPerM: "0";
  completionPriceUsdPerM: "0";
  observedAt: string;
  source: "openrouter-models-v1";
};

export type LocalRespanFreePriceSnapshot = {
  version: "respan-published-free-tier-v1";
  endpoint: "https://api.respan.ai/api/v1/scores";
  model: "respan-01-free";
  inputPriceUsdPerM: "0";
  outputPriceUsdPerM: "0";
  sourceUrl: "https://www.respan.ai/docs/documentation/span-01/concept";
  verifiedAt: string;
};

function readLocalRespanFreePriceSnapshot(env: NodeJS.ProcessEnv, now: Date): LocalRespanFreePriceSnapshot | null {
  const raw = env.VERA_LOCAL_CONTEXT_RESPAN_PRICE_EVIDENCE_JSON?.trim();
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "endpoint,inputPriceUsdPerM,model,outputPriceUsdPerM,sourceUrl,verifiedAt,version"
      || value.version !== "respan-published-free-tier-v1"
      || value.endpoint !== "https://api.respan.ai/api/v1/scores"
      || value.model !== "respan-01-free"
      || value.inputPriceUsdPerM !== "0"
      || value.outputPriceUsdPerM !== "0"
      || value.sourceUrl !== "https://www.respan.ai/docs/documentation/span-01/concept"
      || typeof value.verifiedAt !== "string") return null;
    const verifiedAt = Date.parse(value.verifiedAt);
    if (!Number.isFinite(verifiedAt) || verifiedAt > now.getTime() + 30_000 || now.getTime() - verifiedAt > 24 * 60 * 60_000) return null;
    return value as LocalRespanFreePriceSnapshot;
  } catch {
    return null;
  }
}

export function readVeraLocalFreePriceSnapshot(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): LocalFreePriceSnapshot | null {
  const provider = env.VERA_LOCAL_CONTEXT_FREE_PROVIDER?.trim();
  const raw = env.VERA_LOCAL_CONTEXT_FREE_PRICE_SNAPSHOT_JSON?.trim();
  if (!provider || !raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(value).sort().join(",");
    if (keys !== "completionPriceUsdPerM,observedAt,promptPriceUsdPerM,provider,resolvedModel,routeModel,source"
      || value.routeModel !== "openrouter/free"
      || typeof value.resolvedModel !== "string" || !value.resolvedModel.trim() || value.resolvedModel.length > 120
      || value.provider !== provider
      || value.promptPriceUsdPerM !== "0"
      || value.completionPriceUsdPerM !== "0"
      || value.source !== "openrouter-models-v1"
      || typeof value.observedAt !== "string") return null;
    const observedAt = Date.parse(value.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > now.getTime() + 30_000 || now.getTime() - observedAt > 15 * 60_000) return null;
    return value as LocalFreePriceSnapshot;
  } catch {
    return null;
  }
}

function localDatabaseUrlMatches(env: NodeJS.ProcessEnv): boolean {
  try {
    const value = new URL(env.DATABASE_URL ?? "");
    const database = decodeURIComponent(value.pathname.replace(/^\//u, ""));
    return ["localhost", "127.0.0.1", "::1"].includes(value.hostname)
      && value.port === "55432"
      && database === "vecalss_dev"
      && (value.searchParams.get("schema") ?? "public") === "public";
  } catch {
    return false;
  }
}

/**
 * Disposable local mode is a separate authority from the live function-tool
 * rollout. It requires a verified local DB connection, explicit opt-in, the
 * free POC route, a fresh zero-price snapshot, and no unresolved nonzero or
 * ambiguous local answer settlement.
 */
export async function veraLocalAutomaticContextGateForStudent(
  studentId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<VeraAutomaticContextGate> {
  const disabled = (reason: VeraAutomaticContextGate["reason"] = "disabled"): VeraAutomaticContextGate => ({
    enabled: false,
    state: "off",
    policyVersion: "local-respan-span01-free-v1",
    reason,
    cohortBasisPoints: null,
  });
  if (!studentId.trim() || env.NODE_ENV?.toLowerCase() !== "development") return disabled("development");
  if (env.VERA_AUTOMATIC_CONTEXT_ENABLED !== "true"
    || env.VERA_LOCAL_CONTEXT_RESPAN_ENABLED !== "true"
    || !env.RESPAN_API_KEY?.trim()
    || env.VERA_LIVE_PROVIDER_ENABLED === "true") return disabled("disabled");
  if (!localDatabaseUrlMatches(env)) return disabled("development");
  if (!evaluateVeraOpenRouterFreePocGate(env).enabled) return disabled("provider_capability_unready");
  const priceSnapshot = readVeraLocalFreePriceSnapshot(env, now);
  const selectorPriceSnapshot = readLocalRespanFreePriceSnapshot(env, now);
  if (!priceSnapshot || !selectorPriceSnapshot) return disabled("provider_capability_unready");
  try {
    const topology = await prisma.$queryRaw<Array<{ database_name: string; schema_name: string; server_port: number }>>`
      SELECT current_database() AS database_name, current_schema() AS schema_name, inet_server_port() AS server_port
    `;
    const actual = topology[0];
    if (actual?.database_name !== "vecalss_dev" || actual.schema_name !== "public" || Number(actual.server_port) !== 55432) {
      return disabled("development");
    }
    const blocked = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM ai_request_attempts attempt
        JOIN ai_requests request ON request.id = attempt.request_id
        WHERE request.automatic_context_gate_snapshot->>'protocol' = 'local_respan_free'
          AND (
            attempt.state IN ('unknown'::ai_attempt_state, 'ambiguous'::ai_attempt_state, 'overrun'::ai_attempt_state)
            OR (attempt.state IN ('known'::ai_attempt_state, 'completed'::ai_attempt_state)
              AND attempt.charged_provider_cost_usd_micros IS DISTINCT FROM 0::bigint)
          )
      ) AS blocked
    `;
    if (blocked[0]?.blocked) return disabled("provider_capability_unready");
    const freeProvider = createVeraOpenRouterFreePocProviderAdapter({ env });
    if (!freeProvider.enabled) return disabled("provider_capability_unready");
    const priceDigest = sha256Hex(canonicalJson(priceSnapshot));
    return {
      enabled: true,
      state: "internal",
      policyVersion: "local-respan-span01-free-v1",
      reason: "internal_allowlist",
      cohortBasisPoints: null,
      protocol: "local_respan_free",
      expectedFreeModel: priceSnapshot.resolvedModel,
      expectedFreeProvider: priceSnapshot.provider,
      freePriceSnapshotDigest: priceDigest,
      freePriceSnapshot: priceSnapshot,
      selectorPriceSnapshotDigest: sha256Hex(canonicalJson(selectorPriceSnapshot)),
      selectorPriceSnapshot,
    };
  } catch {
    return disabled("development");
  }
}

/**
 * Production admission authority. Promotion evidence is read from the
 * approved policy bundle rather than from a learner request or a mutable
 * process flag. Development uses its separate asynchronous disposable-DB
 * authority so routes and learner DTOs observe the same gate.
 */
export async function veraAutomaticContextGateForStudentFromPolicy(
  studentId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<VeraAutomaticContextGate> {
  if (env.NODE_ENV?.toLowerCase() === "development") return veraLocalAutomaticContextGateForStudent(studentId, env, now);
  if (env.NODE_ENV?.toLowerCase() !== "production") return veraAutomaticContextGateForStudent(studentId, env, now);
  const disabled = (reason: VeraAutomaticContextGate["reason"], policyVersion = "vera-auto-context-off"): VeraAutomaticContextGate => ({
    enabled: false,
    state: "off",
    policyVersion,
    reason,
    cohortBasisPoints: null,
  });
  // Keep the explicit operational compatibility switch authoritative in the
  // durable-policy path as well as the environment-only development path.
  if (env.VERA_AUTOMATIC_CONTEXT_ENABLED !== "true") return disabled("disabled");
  const bundles = await prisma.aiPolicyBundle.findMany({
    where: { state: { in: ["active", "scheduled"] }, effectiveAt: { lte: now } },
    orderBy: { effectiveAt: "desc" },
    select: { bundleVersion: true, reportConfig: true, approvalSnapshotDigest: true },
  });
  const bundle = bundles.length === 1 ? bundles[0] : null;
  const promotion = bundle && parseVeraAutomaticContextPromotionEvidence(
    bundle.reportConfig && typeof bundle.reportConfig === "object" && !Array.isArray(bundle.reportConfig)
      ? (bundle.reportConfig as Record<string, unknown>).automaticContextPromotion
      : null,
  );
  if (!bundle || !promotion
    || promotion.policyVersion !== bundle.bundleVersion
    || promotion.approvalDigest !== bundle.approvalSnapshotDigest
    || promotion.aggregate.policyVersions.length !== 1
    || promotion.aggregate.policyVersions[0] !== bundle.bundleVersion) {
    return disabled("promotion_unverified", bundle?.bundleVersion);
  }
  const providerReady = veraPaidAutomaticProviderReady(env)
    && env.VERA_AUTOMATIC_CONTEXT_PROVIDER_CAPABILITY_READY === "true";
  const config = readVeraAutomaticContextRolloutConfig({
    ...env,
    VERA_AUTOMATIC_CONTEXT_POLICY_VERSION: bundle.bundleVersion,
    VERA_AUTOMATIC_CONTEXT_PROVIDER_CAPABILITY_READY: providerReady ? "true" : "false",
  });
  if (config.state === "off") return evaluateVeraAutomaticContextGate({ studentId, now, config, isDevelopment: false });
  if (automaticContextRolloutStageForConfig(config) !== promotion.target) return disabled("promotion_unverified", bundle.bundleVersion);
  const verified = evaluateVeraAutomaticContextRollout({
    current: promotion.current,
    target: promotion.target,
    aggregate: promotion.aggregate,
    providerCapabilityReady: providerReady && promotion.providerCapabilityReady,
    capabilityEvidence: promotion.capabilityEvidence,
    canaryExpiresAt: promotion.canaryExpiresAt,
    legacyRetirementReviewed: promotion.legacyRetirementReviewed,
    now,
  });
  if (!verified.allowed) return disabled("promotion_unverified", bundle.bundleVersion);
  return evaluateVeraAutomaticContextGate({ studentId, now, config, isDevelopment: false });
}

export async function veraAutomaticContextAuthorityForStudent(studentId: string, env: NodeJS.ProcessEnv = process.env) {
  const gate = await veraAutomaticContextGateForStudentFromPolicy(studentId, env);
  return {
    enabled: gate.enabled,
    state: gate.state,
    policyVersion: gate.enabled ? gate.policyVersion : null,
  } as const;
}

/** Synchronous production compatibility gate. Development local Respan uses
 * the separate async verified-database gate shared by admission, routes, and
 * learner DTOs. Client `contextMode` is only an intent. */
export function veraAutomaticContextEnabledForServer(env: NodeJS.ProcessEnv = process.env): boolean {
  return veraAutomaticContextGateForStudent("__server_probe__", env).enabled;
}

export function getVeraLifecycleService(): VeraLifecycleService {
  if (cachedLifecycleService) return cachedLifecycleService;
  const fingerprintSecret = process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  if (!fingerprintSecret?.trim()) throw new VeraAdmissionError({ code: "idempotency_config_missing", status: 503 });
  cachedLifecycleService = new VeraLifecycleService(prisma, routeEnvelope, fingerprintSecret);
  return cachedLifecycleService;
}

export function getVeraDrillService(): VeraDrillService {
  if (cachedDrillService) return cachedDrillService;
  const secret = process.env.VERA_CURSOR_HMAC_SECRET ?? process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  if (!secret?.trim()) throw new VeraAdmissionError({ code: "idempotency_config_missing", status: 503 });
  cachedDrillService = new VeraDrillService(prisma, routeEnvelope, secret);
  return cachedDrillService;
}

export function getVeraArtifactCommandService(): VeraArtifactCommandService {
  if (cachedArtifactCommandService) return cachedArtifactCommandService;
  const fingerprintSecret = process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  if (!fingerprintSecret?.trim()) throw new VeraAdmissionError({ code: "idempotency_config_missing", status: 503 });
  cachedArtifactCommandService = new VeraArtifactCommandService(prisma, routeEnvelope, fingerprintSecret);
  return cachedArtifactCommandService;
}

export function getVeraLearnerService(): VeraLearnerService {
  if (cachedLearnerService) return cachedLearnerService;
  const cursorSecret = process.env.VERA_CURSOR_HMAC_SECRET ?? process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  const fingerprintSecret = process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  if (!cursorSecret?.trim() || !fingerprintSecret?.trim()) throw new VeraAdmissionError({ code: "idempotency_config_missing", status: 503 });
  cachedLearnerService = VeraLearnerService.withDefaults({
    db: prisma,
    envelope: routeEnvelope,
    cursorSecret,
    fingerprintSecret,
    automaticContext: {
      enabled: false,
      state: "off",
      policyVersion: null,
    },
    automaticContextResolver: (studentId) => veraAutomaticContextAuthorityForStudent(studentId),
  });
  return cachedLearnerService;
}

export function getVeraChatOrchestrator(): VeraPrismaChatOrchestrator {
  if (cachedOrchestrator) return cachedOrchestrator;
  const hmacSecret = process.env.VERA_IDEMPOTENCY_HMAC_SECRET;
  if (!hmacSecret?.trim()) throw new VeraAdmissionError({ code: "idempotency_config_missing", status: 503 });
  const provider = selectVeraChatProvider();
  const disposableRedisUrl = process.env.VERA_DISPOSABLE_REDIS_URL?.trim() || process.env.REDIS_URL?.trim();
  const disposableRouteLease = process.env.NODE_ENV !== "production"
    && process.env.VERA_DISPOSABLE_DB_ACK === "1"
    && process.env.VERA_HTTP_ROUTE_TEST_MODE === "1"
    ? disposableRedisUrl ? new IORedisVeraLeaseStore(disposableRedisUrl) : undefined
    : undefined;
  cachedOrchestrator = new VeraPrismaChatOrchestrator({
    db: prisma,
    admission: routeAdmission,
    contextResolver: createPrismaVeraContextResolver(prisma),
    provider,
    leaseStore: disposableRouteLease,
    envelope: routeEnvelope,
    hmacSecret,
    automaticContextEnabled: false,
    automaticContextGateForStudent: (studentId, now) => veraAutomaticContextGateForStudent(studentId, process.env, now),
    automaticContextGateForStudentAsync: (studentId, now) => veraAutomaticContextGateForStudentFromPolicy(studentId, process.env, now),
    automaticRegistry: createPrismaContextRegistry(prisma),
    localAutomaticRegistry: createPrismaLocalContextRegistry(prisma),
    localContextSelector: new Span01LocalSelector({ env: { RESPAN_API_KEY: process.env.RESPAN_API_KEY } }),
    assertConversationOwner: async (studentId, conversationId) => {
      const conversation = await prisma.aiConversation.findFirst({ where: { id: conversationId, studentId, deletionState: "active", archivedAt: null }, select: { id: true } });
      if (!conversation) throw new VeraAdmissionError({ code: "target_unavailable", status: 404 });
    },
  });
  return cachedOrchestrator;
}

export async function readVeraUsageDto(studentId: string, db: typeof prisma = prisma): Promise<Record<string, unknown>> {
  const nowRows = await db.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = nowRows[0]?.now ?? new Date();
  if (ledgerVersionFor(now) === "vera_credit_usd_v2") {
    const v2Usage = await new VeraPrismaAdmissionService(db).readV2Usage({ studentId, now });
    const [profile, policy] = await Promise.all([
      db.studentProfile.findUnique({ where: { userId: studentId }, select: { timezone: true } }),
      db.aiPolicyBundle.findFirst({
        where: { state: { in: ["active", "scheduled"] }, effectiveAt: { lte: now } },
        orderBy: { effectiveAt: "desc" },
        select: { bundleVersion: true },
      }),
    ]);
    const usage = v2Usage ?? emptyV2UsageDto(now, profile?.timezone ?? "Asia/Jakarta");
    return {
      ...usage,
      usageDate: formatLocalDateInTimezone(now, usage.quotaTimezone),
      quotaTimezonePolicyVersion: "vera-timezone-v1",
      policyBundleVersion: policy?.bundleVersion ?? null,
      quotaLimitUnits: usage.creditLimit,
      usedQuotaUnits: usage.consumedCredits,
      reservedQuotaUnits: usage.reservedCredits,
      quotaDebtUnits: usage.monetaryDebtState === "debt" ? 1 : 0,
      quotaOverrunLockUntil: null,
      rawTokenUsageState: usage.providerSpend.unknownUsdMicros === "0" ? "known" : "unknown",
      providerAvailable: veraProviderAvailable(),
      redisAvailable: Boolean(process.env.REDIS_URL),
    };
  }
  return db.$transaction(async (tx) => {
    const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const now = nowRows[0]?.now ?? new Date();
    const [profile, billing] = await Promise.all([
      tx.studentProfile.findUnique({ where: { userId: studentId }, select: { timezone: true } }),
      tx.billingAccount.findUnique({ where: { studentId }, select: { planCode: true, status: true } }),
    ]);
    const timezone = profile?.timezone ?? "Asia/Jakarta";
    const parts = formatLocalDateInTimezone(now, timezone);
    const usageDate = new Date(`${parts}T00:00:00.000Z`);
    const [ledger, policy] = await Promise.all([
      tx.aiUsageDaily.findUnique({ where: { studentId_usageDate_ledgerVersion: { studentId, usageDate, ledgerVersion: "vera_quota_v1" } } }),
      tx.aiPolicyBundle.findFirst({ where: { state: { in: ["active", "scheduled"] }, effectiveAt: { lte: now } }, orderBy: { effectiveAt: "desc" } }),
    ]);
    const planCode = billing?.planCode?.trim().toLowerCase() ?? null;
    const limit = planCode === "pro" ? 20_000 : 10_000;
    return {
      usageDate: parts,
      quotaTimezone: ledger?.quotaTimezone ?? timezone,
      quotaTimezonePolicyVersion: ledger?.quotaTimezonePolicyVersion ?? "vera-timezone-v1",
      policyBundleVersion: ledger?.policyBundleVersion ?? policy?.bundleVersion ?? null,
      quotaLimitUnits: ledger?.quotaLimitUnitsSnapshot ?? limit,
      usedQuotaUnits: ledger?.usedQuotaUnits ?? 0,
      reservedQuotaUnits: ledger?.reservedQuotaUnits ?? 0,
      quotaDebtUnits: ledger?.quotaDebtUnits ?? 0,
      quotaOverrunLockUntil: ledger?.quotaOverrunLockUntil ?? null,
      rawTokenUsageState: "unknown",
      providerAvailable: veraProviderAvailable(),
      redisAvailable: Boolean(process.env.REDIS_URL),
    };
  });
}

/** Durable, scoped replay/status read used after a browser reload or process
 * restart. A missing/cross-conversation request is intentionally null. */
export async function readVeraRequestStatus(input: {
  studentId: string;
  conversationId: string;
  clientRequestId: string;
}): Promise<VeraRequestStatusDto | null> {
  return readPrismaVeraRequestStatus(prisma, input, { admission: routeAdmission, envelope: routeEnvelope });
}
