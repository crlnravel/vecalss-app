import "server-only";

import { prisma } from "@/lib/prisma";

import { VeraAdmissionError } from "./admission";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry, environmentEnvelopeRootKeyProvider } from "./envelope";
import { VeraPrismaAdmissionService } from "./admission-service";
import { createPrismaVeraContextResolver } from "./prisma-context-resolver";
import { VeraPrismaChatOrchestrator, readPrismaVeraRequestStatus } from "./prisma-chat-orchestrator";
import { createDefaultProviderAdapter, MockProviderAdapter } from "./provider";
import { createVeraOpenRouterFreePocProviderAdapter } from "./openrouter-free-poc-provider";
import { evaluateVeraOpenRouterFreePocGate } from "./openrouter-free-poc";
import type { VeraProviderAdapter } from "./provider";
import { IORedisVeraLeaseStore } from "./redis-lease";
import type { VeraRequestStatusDto } from "./admission";
import { VeraLearnerService } from "./learner-service";
import { VeraArtifactCommandService } from "./artifact-commands";
import { VeraDrillService } from "./drill-service";
import { VeraLifecycleService } from "./lifecycle-service";
import { emptyV2UsageDto, ledgerVersionFor } from "./quota-v2";

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
  cachedLearnerService = VeraLearnerService.withDefaults({ db: prisma, envelope: routeEnvelope, cursorSecret, fingerprintSecret });
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
