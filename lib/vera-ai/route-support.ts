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

let cachedOrchestrator: VeraPrismaChatOrchestrator | null = null;
const routeEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(prisma, environmentEnvelopeRootKeyProvider()));
const routeAdmission = new VeraPrismaAdmissionService(prisma, routeEnvelope);
let cachedLearnerService: VeraLearnerService | null = null;
let cachedArtifactCommandService: VeraArtifactCommandService | null = null;
let cachedDrillService: VeraDrillService | null = null;
let cachedLifecycleService: VeraLifecycleService | null = null;

/**
 * Select the only dev POC provider ahead of the normal mock/default chain.
 * The POC adapter performs the complete explicit environment gate itself;
 * this helper exists so route tests can verify selection without constructing
 * a Prisma orchestrator or invoking any provider transport.
 */
export function selectVeraChatProvider(env: NodeJS.ProcessEnv = process.env): VeraProviderAdapter {
  const poc = createVeraOpenRouterFreePocProviderAdapter({ env });
  if (poc.enabled) return poc;
  if (env.VERA_MOCK_PROVIDER_ENABLED === "true") return new MockProviderAdapter();
  return createDefaultProviderAdapter(env);
}

export function veraProviderAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (evaluateVeraOpenRouterFreePocGate(env).enabled) return true;
  return env.VERA_LIVE_PROVIDER_ENABLED === "true" && Boolean(env.VERA_PROVIDER_RELEASE_MANIFEST);
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
      const conversation = await prisma.aiConversation.findFirst({ where: { id: conversationId, studentId, deletionState: "active" }, select: { id: true } });
      if (!conversation) throw new VeraAdmissionError({ code: "target_unavailable", status: 404 });
    },
  });
  return cachedOrchestrator;
}

export async function readVeraUsageDto(studentId: string, db: typeof prisma = prisma): Promise<Record<string, unknown>> {
  return db.$transaction(async (tx) => {
    const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const now = nowRows[0]?.now ?? new Date();
    const [profile, billing] = await Promise.all([
      tx.studentProfile.findUnique({ where: { userId: studentId }, select: { timezone: true } }),
      tx.billingAccount.findUnique({ where: { studentId }, select: { planCode: true, status: true } }),
    ]);
    const timezone = profile?.timezone ?? "Asia/Jakarta";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const usageDate = new Date(`${parts}T00:00:00.000Z`);
    const ledger = await tx.aiUsageDaily.findUnique({ where: { studentId_usageDate_ledgerVersion: { studentId, usageDate, ledgerVersion: "vera_quota_v1" } } });
    const policy = await tx.aiPolicyBundle.findFirst({ where: { state: { in: ["active", "scheduled"] }, effectiveAt: { lte: now } }, orderBy: { effectiveAt: "desc" } });
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
