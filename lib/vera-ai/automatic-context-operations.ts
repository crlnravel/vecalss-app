import "server-only";

import { createHash } from "node:crypto";

import { VERA_AUTOMATIC_CONTEXT_BUDGETS, canonicalJson, sha256Hex } from "./contracts";

export const VERA_AUTOMATIC_ROLLOUT_STATES = ["off", "internal", "cohort", "on"] as const;
export type VeraAutomaticRolloutState = (typeof VERA_AUTOMATIC_ROLLOUT_STATES)[number];

export const VERA_AUTOMATIC_OUTCOMES = [
  "completed",
  "no_match",
  "schema_invalid",
  "unavailable",
  "failed",
] as const;
export type VeraAutomaticContextOutcome = (typeof VERA_AUTOMATIC_OUTCOMES)[number];

export type VeraAutomaticContextRolloutConfig = {
  state: VeraAutomaticRolloutState;
  rolloutBasisPoints: number;
  policyVersion: string;
  emergencyOff: boolean;
  internalStudentIds: readonly string[];
  providerCapabilityReady: boolean;
  capabilityEvidence?: VeraAutomaticContextCapabilityEvidence | null;
  canaryVerifiedAt: string | null;
  canaryExpiresAt: string | null;
};

/**
 * Evidence captured by the paid-route canary. The rollout gate deliberately
 * consumes booleans and timestamps only; it never receives prompts, tool
 * arguments, provider responses, or source content.
 */
export type VeraAutomaticContextCapabilityEvidence = {
  functionToolsSupported: boolean;
  toolChoiceSupported: boolean;
  requireParametersSupported: boolean;
  serverToolsDisabled: boolean;
  pluginsDisabled: boolean;
  singleFunctionCallVerified: boolean;
  usageReconciled: boolean;
  costKnown: boolean;
  privacyZdrVerified: boolean;
  dataCollectionDenied: boolean;
};

export type VeraAutomaticContextGate = {
  enabled: boolean;
  state: VeraAutomaticRolloutState;
  policyVersion: string;
  reason:
    | "disabled"
    | "development"
    | "emergency_off"
    | "provider_capability_unready"
    | "capability_evidence_unready"
    | "canary_unavailable"
    | "internal_allowlist"
    | "cohort"
    | "on";
  cohortBasisPoints: number | null;
};

/** Content-free rollout authority captured when an automatic request is
 * admitted. Existing requests keep this snapshot if policy later changes. */
export type VeraAutomaticContextGateSnapshot = VeraAutomaticContextGate & {
  evaluatedAt: string;
};

export type VeraAutomaticTelemetryEvent = {
  policyVersion: string;
  gateState: VeraAutomaticRolloutState;
  outcome: VeraAutomaticContextOutcome;
  sourceCount: number;
  sourceKindCounts: { materi: number; kuis: number; tryout: number };
  selectorLatencyMs: number | null;
  registryLatencyMs: number | null;
  finalLatencyMs: number | null;
  totalLatencyMs: number | null;
  firstTokenLatencyMs: number | null;
  citationValidationFailures: number;
  schemaValidationFailures: number;
  sourceAuthorizationFailures: number;
  replayCount: number;
  unknownUsage: boolean;
  unknownCost: boolean;
  chargedUsdMicros: string | null;
  queryDigest: string | null;
  resultDigest: string | null;
};

export type VeraAutomaticTelemetryAggregate = {
  state: "ready" | "suppressed";
  sampleCount: number;
  completedCount: number;
  noMatchCount: number;
  unavailableCount: number;
  schemaInvalidCount: number;
  failedCount: number;
  sourceCount: number;
  sourceKindCounts: { materi: number; kuis: number; tryout: number };
  selectorLatencyP95Ms: number | null;
  registryLatencyP95Ms: number | null;
  finalLatencyP95Ms: number | null;
  totalLatencyP95Ms: number | null;
  citationValidationFailures: number;
  sourceAuthorizationFailures: number;
  replayCount: number;
  unknownUsageCount: number;
  unknownCostCount: number;
  chargedUsdMicros: string;
  policyVersions: string[];
};

export type VeraAutomaticContextAlertCode =
  | "provider_capability_drift"
  | "tool_schema_failure"
  | "canary_expired"
  | "unknown_usage"
  | "unknown_cost"
  | "source_authorization"
  | "citation_validation"
  | "latency_budget"
  | "spend_exposure";

export type VeraAutomaticContextAlert = {
  code: VeraAutomaticContextAlertCode;
  severity: "critical" | "warning";
  failClosed: boolean;
};

const BASIS_POINT_LIMIT = 10_000;
const MIN_REPORT_GROUP_SIZE = 5;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

const REQUIRED_CAPABILITY_EVIDENCE: readonly (keyof VeraAutomaticContextCapabilityEvidence)[] = [
  "functionToolsSupported",
  "toolChoiceSupported",
  "requireParametersSupported",
  "serverToolsDisabled",
  "pluginsDisabled",
  "singleFunctionCallVerified",
  "usageReconciled",
  "costKnown",
  "privacyZdrVerified",
  "dataCollectionDenied",
];

function boundedNonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function boundedDigest(value: unknown): string | null {
  return typeof value === "string" && DIGEST_PATTERN.test(value) ? value : null;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function rolloutState(value: unknown): VeraAutomaticRolloutState {
  return typeof value === "string" && VERA_AUTOMATIC_ROLLOUT_STATES.includes(value as VeraAutomaticRolloutState)
    ? value as VeraAutomaticRolloutState
    : "off";
}

function envBoolean(env: NodeJS.ProcessEnv, name: string): boolean {
  return env[name] === "true";
}

function readEmergencyOff(env: NodeJS.ProcessEnv): boolean {
  const value = env.VERA_AUTOMATIC_CONTEXT_EMERGENCY_OFF?.trim().toLowerCase() ?? "";
  if (value === "" || value === "false" || value === "0") return false;
  // Any non-empty value other than an explicit false is an emergency stop.
  return true;
}

export function veraAutomaticContextCapabilityEvidenceReady(
  evidence: VeraAutomaticContextCapabilityEvidence | null | undefined,
): boolean {
  if (!evidence) return false;
  return REQUIRED_CAPABILITY_EVIDENCE.every((key) => evidence[key] === true);
}

export function readVeraAutomaticContextRolloutConfig(env: NodeJS.ProcessEnv = process.env): VeraAutomaticContextRolloutConfig {
  const configuredBasisPoints = Number(env.VERA_AUTOMATIC_CONTEXT_ROLLOUT_BASIS_POINTS ?? 0);
  const rolloutBasisPoints = Number.isSafeInteger(configuredBasisPoints)
    ? Math.max(0, Math.min(BASIS_POINT_LIMIT, configuredBasisPoints))
    : 0;
  const policyVersion = env.VERA_AUTOMATIC_CONTEXT_POLICY_VERSION?.trim() || "vera-auto-context-off";
  const internalStudentIds = (env.VERA_AUTOMATIC_CONTEXT_INTERNAL_STUDENT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const capabilityEvidence: VeraAutomaticContextCapabilityEvidence = {
    functionToolsSupported: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_FUNCTION_TOOLS_SUPPORTED"),
    toolChoiceSupported: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_TOOL_CHOICE_SUPPORTED"),
    requireParametersSupported: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_REQUIRE_PARAMETERS_SUPPORTED"),
    serverToolsDisabled: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_SERVER_TOOLS_DISABLED"),
    pluginsDisabled: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_PLUGINS_DISABLED"),
    singleFunctionCallVerified: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_SINGLE_FUNCTION_CALL_VERIFIED"),
    usageReconciled: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_USAGE_RECONCILED"),
    costKnown: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_COST_KNOWN"),
    privacyZdrVerified: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_PRIVACY_ZDR_VERIFIED"),
    dataCollectionDenied: envBoolean(env, "VERA_AUTOMATIC_CONTEXT_DATA_COLLECTION_DENIED"),
  };
  return {
    state: rolloutState(env.VERA_AUTOMATIC_CONTEXT_STATE),
    rolloutBasisPoints,
    policyVersion,
    emergencyOff: readEmergencyOff(env),
    internalStudentIds,
    providerCapabilityReady: env.VERA_AUTOMATIC_CONTEXT_PROVIDER_CAPABILITY_READY === "true",
    capabilityEvidence,
    canaryVerifiedAt: parseTimestamp(env.VERA_AUTOMATIC_CONTEXT_CANARY_VERIFIED_AT),
    canaryExpiresAt: parseTimestamp(env.VERA_AUTOMATIC_CONTEXT_CANARY_EXPIRES_AT),
  };
}

export function stableVeraAutomaticContextBasisPoints(studentId: string, policyVersion: string): number {
  const digest = createHash("sha256").update(`vera-auto-context-cohort-v1:${policyVersion}:${studentId}`).digest("hex");
  return Number.parseInt(digest.slice(0, 8), 16) % BASIS_POINT_LIMIT;
}

export function evaluateVeraAutomaticContextGate(input: {
  studentId: string;
  now?: Date;
  config: VeraAutomaticContextRolloutConfig;
  isDevelopment?: boolean;
}): VeraAutomaticContextGate {
  const config = input.config;
  const off = (reason: VeraAutomaticContextGate["reason"]): VeraAutomaticContextGate => ({
    enabled: false,
    state: "off",
    policyVersion: config.policyVersion,
    reason,
    cohortBasisPoints: null,
  });
  if (input.isDevelopment) return off("development");
  if (config.emergencyOff) return off("emergency_off");
  if (config.state === "off") return off("disabled");
  if (!config.providerCapabilityReady) return off("provider_capability_unready");
  if (!veraAutomaticContextCapabilityEvidenceReady(config.capabilityEvidence)) {
    return off("capability_evidence_unready");
  }
  const now = input.now ?? new Date();
  const canaryExpiry = config.canaryExpiresAt ? new Date(config.canaryExpiresAt) : null;
  const canaryVerified = config.canaryVerifiedAt ? new Date(config.canaryVerifiedAt) : null;
  if (!canaryExpiry || !canaryVerified || Number.isNaN(canaryExpiry.getTime()) || Number.isNaN(canaryVerified.getTime()) || canaryVerified > now || canaryExpiry <= now) {
    return off("canary_unavailable");
  }
  if (config.state === "internal") {
    return config.internalStudentIds.includes(input.studentId)
      ? { enabled: true, state: "internal", policyVersion: config.policyVersion, reason: "internal_allowlist", cohortBasisPoints: null }
      : off("disabled");
  }
  if (config.state === "on") {
    return { enabled: true, state: "on", policyVersion: config.policyVersion, reason: "on", cohortBasisPoints: null };
  }
  const cohortBasisPoints = stableVeraAutomaticContextBasisPoints(input.studentId, config.policyVersion);
  return cohortBasisPoints < config.rolloutBasisPoints
    ? { enabled: true, state: "cohort", policyVersion: config.policyVersion, reason: "cohort", cohortBasisPoints }
    : { ...off("disabled"), cohortBasisPoints };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.ceil((percentileValue / 100) * ordered.length) - 1);
  return ordered[Math.max(0, index)] ?? null;
}

export function createVeraAutomaticTelemetryEvent(input: Partial<VeraAutomaticTelemetryEvent> & Pick<VeraAutomaticTelemetryEvent, "policyVersion" | "gateState" | "outcome">): VeraAutomaticTelemetryEvent {
  const sourceKindCounts = {
    materi: boundedNonNegativeInteger(input.sourceKindCounts?.materi),
    kuis: boundedNonNegativeInteger(input.sourceKindCounts?.kuis),
    tryout: boundedNonNegativeInteger(input.sourceKindCounts?.tryout),
  };
  const chargedUsdMicros = typeof input.chargedUsdMicros === "string" && /^\d{1,24}$/u.test(input.chargedUsdMicros)
    ? input.chargedUsdMicros
    : null;
  return {
    policyVersion: input.policyVersion.slice(0, 120),
    gateState: rolloutState(input.gateState),
    outcome: VERA_AUTOMATIC_OUTCOMES.includes(input.outcome) ? input.outcome : "failed",
    sourceCount: Math.min(4, boundedNonNegativeInteger(input.sourceCount)),
    sourceKindCounts,
    selectorLatencyMs: input.selectorLatencyMs == null ? null : boundedNonNegativeInteger(input.selectorLatencyMs),
    registryLatencyMs: input.registryLatencyMs == null ? null : boundedNonNegativeInteger(input.registryLatencyMs),
    finalLatencyMs: input.finalLatencyMs == null ? null : boundedNonNegativeInteger(input.finalLatencyMs),
    totalLatencyMs: input.totalLatencyMs == null ? null : boundedNonNegativeInteger(input.totalLatencyMs),
    firstTokenLatencyMs: input.firstTokenLatencyMs == null ? null : boundedNonNegativeInteger(input.firstTokenLatencyMs),
    citationValidationFailures: boundedNonNegativeInteger(input.citationValidationFailures),
    schemaValidationFailures: boundedNonNegativeInteger(input.schemaValidationFailures),
    sourceAuthorizationFailures: boundedNonNegativeInteger(input.sourceAuthorizationFailures),
    replayCount: boundedNonNegativeInteger(input.replayCount),
    unknownUsage: input.unknownUsage === true,
    unknownCost: input.unknownCost === true || chargedUsdMicros === null,
    chargedUsdMicros,
    queryDigest: boundedDigest(input.queryDigest),
    resultDigest: boundedDigest(input.resultDigest),
  };
}

export function aggregateVeraAutomaticTelemetry(events: readonly VeraAutomaticTelemetryEvent[], minimumGroupSize = MIN_REPORT_GROUP_SIZE): VeraAutomaticTelemetryAggregate {
  const safeEvents = events.filter((event) => event && typeof event.policyVersion === "string");
  const sum = (selector: (event: VeraAutomaticTelemetryEvent) => number) => safeEvents.reduce((total, event) => total + selector(event), 0);
  const chargedUsdMicros = safeEvents.reduce((total, event) => total + BigInt(event.chargedUsdMicros ?? "0"), 0n).toString();
  return {
    state: safeEvents.length >= Math.max(MIN_REPORT_GROUP_SIZE, minimumGroupSize) ? "ready" : "suppressed",
    sampleCount: safeEvents.length,
    completedCount: safeEvents.filter((event) => event.outcome === "completed").length,
    noMatchCount: safeEvents.filter((event) => event.outcome === "no_match").length,
    unavailableCount: safeEvents.filter((event) => event.outcome === "unavailable").length,
    schemaInvalidCount: safeEvents.filter((event) => event.outcome === "schema_invalid" || event.schemaValidationFailures > 0).length,
    failedCount: safeEvents.filter((event) => event.outcome === "failed" || event.outcome === "schema_invalid").length,
    sourceCount: sum((event) => event.sourceCount),
    sourceKindCounts: {
      materi: sum((event) => event.sourceKindCounts.materi),
      kuis: sum((event) => event.sourceKindCounts.kuis),
      tryout: sum((event) => event.sourceKindCounts.tryout),
    },
    selectorLatencyP95Ms: percentile(safeEvents.flatMap((event) => event.selectorLatencyMs == null ? [] : [event.selectorLatencyMs]), 95),
    registryLatencyP95Ms: percentile(safeEvents.flatMap((event) => event.registryLatencyMs == null ? [] : [event.registryLatencyMs]), 95),
    finalLatencyP95Ms: percentile(safeEvents.flatMap((event) => event.finalLatencyMs == null ? [] : [event.finalLatencyMs]), 95),
    totalLatencyP95Ms: percentile(safeEvents.flatMap((event) => event.totalLatencyMs == null ? [] : [event.totalLatencyMs]), 95),
    citationValidationFailures: sum((event) => event.citationValidationFailures),
    sourceAuthorizationFailures: sum((event) => event.sourceAuthorizationFailures),
    replayCount: sum((event) => event.replayCount),
    unknownUsageCount: safeEvents.filter((event) => event.unknownUsage).length,
    unknownCostCount: safeEvents.filter((event) => event.unknownCost).length,
    chargedUsdMicros,
    policyVersions: [...new Set(safeEvents.map((event) => event.policyVersion))].sort(),
  };
}

export function evaluateVeraAutomaticContextAlerts(input: {
  providerCapabilityReady: boolean;
  canaryExpiresAt: string | null;
  now?: Date;
  aggregate: VeraAutomaticTelemetryAggregate;
  capabilityEvidence?: VeraAutomaticContextCapabilityEvidence | null;
  selectorLatencyBudgetMs?: number;
  registryLatencyBudgetMs?: number;
  finalLatencyBudgetMs?: number;
  totalLatencyBudgetMs?: number;
  spendLimitUsdMicros?: bigint;
}): VeraAutomaticContextAlert[] {
  const now = input.now ?? new Date();
  const alerts: VeraAutomaticContextAlert[] = [];
  if (!input.providerCapabilityReady) alerts.push({ code: "provider_capability_drift", severity: "critical", failClosed: true });
  if (!veraAutomaticContextCapabilityEvidenceReady(input.capabilityEvidence)) {
    alerts.push({ code: "provider_capability_drift", severity: "critical", failClosed: true });
  }
  const expiry = input.canaryExpiresAt ? new Date(input.canaryExpiresAt) : null;
  if (!expiry || Number.isNaN(expiry.getTime()) || expiry <= now) alerts.push({ code: "canary_expired", severity: "critical", failClosed: true });
  if (input.aggregate.schemaInvalidCount > 0) alerts.push({ code: "tool_schema_failure", severity: "critical", failClosed: true });
  if (input.aggregate.unknownUsageCount > 0) alerts.push({ code: "unknown_usage", severity: "critical", failClosed: true });
  if (input.aggregate.unknownCostCount > 0) alerts.push({ code: "unknown_cost", severity: "critical", failClosed: true });
  if (input.aggregate.sourceAuthorizationFailures > 0) alerts.push({ code: "source_authorization", severity: "critical", failClosed: true });
  if (input.aggregate.citationValidationFailures > 0) alerts.push({ code: "citation_validation", severity: "critical", failClosed: true });
  const latencyBreached = (input.aggregate.selectorLatencyP95Ms ?? 0) > (input.selectorLatencyBudgetMs ?? VERA_AUTOMATIC_CONTEXT_BUDGETS.selectorTimeoutMs)
    || (input.aggregate.registryLatencyP95Ms ?? 0) > (input.registryLatencyBudgetMs ?? VERA_AUTOMATIC_CONTEXT_BUDGETS.registryTimeoutMs)
    || (input.aggregate.finalLatencyP95Ms ?? 0) > (input.finalLatencyBudgetMs ?? VERA_AUTOMATIC_CONTEXT_BUDGETS.finalProviderTimeoutMs)
    || (input.aggregate.totalLatencyP95Ms ?? 0) > (input.totalLatencyBudgetMs ?? VERA_AUTOMATIC_CONTEXT_BUDGETS.logicalDeadlineMs);
  if (latencyBreached) alerts.push({ code: "latency_budget", severity: "warning", failClosed: false });
  if (input.spendLimitUsdMicros !== undefined && BigInt(input.aggregate.chargedUsdMicros) > input.spendLimitUsdMicros) alerts.push({ code: "spend_exposure", severity: "critical", failClosed: true });
  return alerts;
}

export function automaticContextMustFailClosed(alerts: readonly VeraAutomaticContextAlert[]): boolean {
  return alerts.some((alert) => alert.failClosed);
}

export function automaticContextTelemetryDigest(event: VeraAutomaticTelemetryEvent): string {
  return sha256Hex(canonicalJson(event));
}

export const VERA_AUTOMATIC_CONTEXT_OPERATIONAL_BUDGETS = VERA_AUTOMATIC_CONTEXT_BUDGETS;
