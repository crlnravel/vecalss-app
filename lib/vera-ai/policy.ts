import "server-only";

import {
  VERA_POLICY_BUNDLE_VERSION,
  VERA_POLICY_EFFECTIVE_AT,
  VERA_QUOTA_POLICY_VERSION,
  VeraContractError,
} from "./contracts";

export type VeraModePolicy = {
  inputBound: number;
  hardOutputCap: number;
  reservationBound: number;
};

export type VeraPolicyConfig = {
  defaultDailyLimit: number;
  quotaVersion: string;
  maxProviderAttempts: number;
  modes: Record<string, VeraModePolicy>;
};

export type VeraSettlementConfig = { maxPendingAgeMinutes: number };
export type VeraReportConfig = { unitLimit: number; requestLimit: number; minimumGroupSize: number; maxRangeDays: number };
export type VeraRetentionConfig = {
  stageTtlHours: number;
  contextEvidenceTtlDays: number;
  acceptedKeyTtlDays: number;
  rejectedKeyTtlHours: number;
  tombstoneTtlDays: number;
  admissionTelemetryTtlDays: number;
  operationalMetadataTtlDays: number;
};

export type VeraPolicyBundle = {
  bundleVersion: string;
  configSchemaVersion: string;
  state: "draft" | "pending_approval" | "scheduled" | "active" | "retired" | "rejected";
  effectiveAt: Date;
  quotaConfig: VeraPolicyConfig;
  settlementConfig: VeraSettlementConfig;
  reportConfig: VeraReportConfig;
  retentionConfig: VeraRetentionConfig;
  validationDigest: string;
};

const V1_MODES: Record<string, VeraModePolicy> = {
  "vera.chat": { inputBound: 4_000, hardOutputCap: 1_500, reservationBound: 5_500 },
  "vera.analysis": { inputBound: 4_500, hardOutputCap: 1_800, reservationBound: 6_300 },
  "vera.route": { inputBound: 4_500, hardOutputCap: 1_800, reservationBound: 6_300 },
  "vera.drill": { inputBound: 3_500, hardOutputCap: 2_000, reservationBound: 5_500 },
  "vera.review": { inputBound: 4_000, hardOutputCap: 1_600, reservationBound: 5_600 },
  "vera.ptn": { inputBound: 4_500, hardOutputCap: 1_800, reservationBound: 6_300 },
  "vera.summary": { inputBound: 4_500, hardOutputCap: 1_600, reservationBound: 6_100 },
};

export const VERA_V1_QUOTA_CONFIG: VeraPolicyConfig = {
  defaultDailyLimit: 10_000,
  quotaVersion: VERA_QUOTA_POLICY_VERSION,
  maxProviderAttempts: 2,
  modes: V1_MODES,
};

export const VERA_V1_SETTLEMENT_CONFIG: VeraSettlementConfig = { maxPendingAgeMinutes: 120 };
export const VERA_V1_REPORT_CONFIG: VeraReportConfig = {
  unitLimit: 60,
  requestLimit: 10,
  minimumGroupSize: 5,
  maxRangeDays: 31,
};
export const VERA_V1_RETENTION_CONFIG: VeraRetentionConfig = {
  stageTtlHours: 24,
  contextEvidenceTtlDays: 30,
  acceptedKeyTtlDays: 90,
  rejectedKeyTtlHours: 24,
  tombstoneTtlDays: 90,
  admissionTelemetryTtlDays: 90,
  operationalMetadataTtlDays: 365,
};

export function validatePolicyConfig(input: {
  quotaConfig: VeraPolicyConfig;
  settlementConfig: VeraSettlementConfig;
  reportConfig: VeraReportConfig;
  retentionConfig: VeraRetentionConfig;
}): void {
  const quota = input.quotaConfig;
  if (quota.defaultDailyLimit < 1_000 || quota.defaultDailyLimit > 50_000) {
    throw new VeraContractError("vera_not_active", "Batas harian berada di luar pagar kebijakan.", 422);
  }
  if (quota.maxProviderAttempts !== 2) {
    throw new VeraContractError("vera_not_active", "Batas dua percobaan provider tidak dapat diubah.", 422);
  }
  for (const [featureKey, mode] of Object.entries(quota.modes)) {
    if (mode.inputBound < 1_000 || mode.inputBound > 12_000) {
      throw new VeraContractError("vera_not_active", `Batas input ${featureKey} tidak aman.`, 422);
    }
    if (mode.hardOutputCap < 256 || mode.hardOutputCap > 4_000) {
      throw new VeraContractError("vera_not_active", `Batas output ${featureKey} tidak aman.`, 422);
    }
    if (mode.reservationBound < mode.inputBound + mode.hardOutputCap || mode.reservationBound > 20_000) {
      throw new VeraContractError("vera_not_active", `Reservasi ${featureKey} tidak tersertifikasi.`, 422);
    }
  }
  if (input.settlementConfig.maxPendingAgeMinutes < 30 || input.settlementConfig.maxPendingAgeMinutes > 360) {
    throw new VeraContractError("vera_not_active", "Batas settlement berada di luar pagar kebijakan.", 422);
  }
  if (input.reportConfig.minimumGroupSize < 5 || input.reportConfig.maxRangeDays > 31) {
    throw new VeraContractError("vera_not_active", "Privasi laporan tidak dapat dilemahkan.", 422);
  }
  if (input.retentionConfig.stageTtlHours * 60 < input.settlementConfig.maxPendingAgeMinutes + 30) {
    throw new VeraContractError("vera_not_active", "Stage TTL terlalu pendek untuk pemulihan settlement.", 422);
  }
}

export function defaultVeraPolicyBundle(): VeraPolicyBundle {
  const bundle: VeraPolicyBundle = {
    bundleVersion: VERA_POLICY_BUNDLE_VERSION,
    configSchemaVersion: "vera-policy-v1",
    state: "scheduled",
    effectiveAt: new Date(VERA_POLICY_EFFECTIVE_AT),
    quotaConfig: VERA_V1_QUOTA_CONFIG,
    settlementConfig: VERA_V1_SETTLEMENT_CONFIG,
    reportConfig: VERA_V1_REPORT_CONFIG,
    retentionConfig: VERA_V1_RETENTION_CONFIG,
    validationDigest: "vera-policy-v1-default",
  };
  validatePolicyConfig(bundle);
  return bundle;
}

export type BillingPlan = { planCode: string | null; status?: string };

export const VERA_PLAN_LIMITS: Readonly<Record<string, number>> = {
  free: 10_000,
  trial: 10_000,
  starter: 10_000,
  pro: 20_000,
};

export type VeraPolicySnapshot = {
  bundleVersion: string;
  policy: VeraPolicyBundle;
  planCode: string | null;
  planSource: "plan" | "billing_default";
  quotaLimitUnits: number;
  timezone: string;
  timezonePolicyVersion: string;
  acceptedAt: Date;
  settlementDeadlineAt: Date;
  hardOutputQuotaUnits: number;
  maxProviderAttempts: 2;
};

function assertTimezone(timezone: string): string {
  const normalized = timezone.trim() || "Asia/Jakarta";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
  } catch {
    throw new VeraContractError("vera_not_active", "Zona waktu profil tidak valid.", 422);
  }
  return normalized;
}

/**
 * Select one and only one effective, complete bundle. A missing or
 * overlapping active set fails closed; callers must not merge environment
 * defaults into a persisted admission.
 */
export function selectActiveVeraPolicyBundle(
  bundles: VeraPolicyBundle[],
  now: Date,
): VeraPolicyBundle {
  const candidates = bundles.filter((bundle) =>
    (bundle.state === "active" || bundle.state === "scheduled") && bundle.effectiveAt <= now);
  if (candidates.length !== 1) {
    throw new VeraContractError("vera_not_active", "Exact active Vera policy bundle is unavailable.", 503, {
      candidateCount: candidates.length,
    });
  }
  const bundle = candidates[0];
  if (!bundle) throw new VeraContractError("vera_not_active", "Vera policy bundle is unavailable.", 503);
  validatePolicyConfig(bundle);
  if (!bundle.bundleVersion.trim() || !bundle.configSchemaVersion.trim() || !bundle.validationDigest.trim()) {
    throw new VeraContractError("vera_not_active", "Vera policy evidence is incomplete.", 503);
  }
  return bundle;
}

export function snapshotVeraPolicy(input: {
  policy: VeraPolicyBundle;
  now: Date;
  billing: BillingPlan | null;
  timezone?: string | null;
  featureKey?: string;
}): VeraPolicySnapshot {
  validatePolicyConfig(input.policy);
  const resolved = resolveVeraQuotaLimit({
    now: input.now,
    billing: input.billing,
    policy: input.policy,
  });
  if (!resolved.active) {
    throw new VeraContractError("vera_not_active", "Vera belum aktif pada waktu transaksi ini.", 422);
  }
  const feature = input.featureKey ?? "vera.chat";
  const mode = input.policy.quotaConfig.modes[feature] ?? input.policy.quotaConfig.modes["vera.chat"];
  if (!mode) throw new VeraContractError("vera_not_active", "Mode Vera tidak tersedia dalam bundle.", 503);
  const timezone = assertTimezone(input.timezone ?? "Asia/Jakarta");
  const settlementDeadlineAt = new Date(
    input.now.getTime() + input.policy.settlementConfig.maxPendingAgeMinutes * 60_000,
  );
  return {
    bundleVersion: input.policy.bundleVersion,
    policy: input.policy,
    planCode: input.billing?.planCode?.trim().toLowerCase() || null,
    planSource: resolved.source === "plan" ? "plan" : "billing_default",
    quotaLimitUnits: resolved.limitUnits,
    timezone,
    timezonePolicyVersion: "vera-timezone-v1",
    acceptedAt: new Date(input.now),
    settlementDeadlineAt,
    hardOutputQuotaUnits: mode.hardOutputCap,
    maxProviderAttempts: 2,
  };
}

export function resolveVeraQuotaLimit(input: {
  now: Date;
  billing: BillingPlan | null;
  studentLegacyDailyAiTokenLimit?: number | null;
  policy?: VeraPolicyBundle;
}): { active: boolean; reason?: "vera_not_active" | "billing_default"; limitUnits: number; source: "policy" | "plan" | "default" } {
  const policy = input.policy ?? defaultVeraPolicyBundle();
  if (input.now < policy.effectiveAt) {
    return { active: false, reason: "vera_not_active", limitUnits: 0, source: "policy" };
  }

  const planLimitByCode = VERA_PLAN_LIMITS;
  const planCode = input.billing?.planCode?.trim().toLowerCase();
  const limitUnits = planCode && planLimitByCode[planCode]
    ? planLimitByCode[planCode]
    : policy.quotaConfig.defaultDailyLimit;

  // Deliberately read and ignore legacy metadata to make the authority
  // boundary visible to tests and reviewers.
  void input.studentLegacyDailyAiTokenLimit;
  return {
    active: true,
    reason: planCode && planLimitByCode[planCode] ? undefined : "billing_default",
    limitUnits,
    source: planCode && planLimitByCode[planCode] ? "plan" : "default",
  };
}

export function isCapabilityGranted(input: { capability: "canManageAiPolicy" | "canManageAiGovernance"; active: boolean; role?: string }): boolean {
  return input.active && (input.role === "admin" || input.role === "ai_policy_operator" || input.role === "ai_governance_operator");
}
