import "server-only";

import { createHash } from "node:crypto";

import { VERA_AUTOMATIC_CONTEXT_BUDGETS, canonicalJson, sha256Hex } from "./contracts";

export const VERA_AUTOMATIC_ROLLOUT_STATES = ["off", "internal", "cohort", "on"] as const;
export type VeraAutomaticRolloutState = (typeof VERA_AUTOMATIC_ROLLOUT_STATES)[number];

export const VERA_AUTOMATIC_ROLLOUT_STAGES = ["off", "internal", "5%", "25%", "on"] as const;
export type VeraAutomaticRolloutStage = (typeof VERA_AUTOMATIC_ROLLOUT_STAGES)[number];

export const VERA_AUTOMATIC_ROLLOUT_BASIS_POINTS: Record<VeraAutomaticRolloutStage, number> = {
  off: 0,
  internal: 0,
  "5%": 500,
  "25%": 2_500,
  on: 10_000,
};

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
    | "promotion_unverified"
    | "internal_allowlist"
    | "cohort"
    | "on";
  cohortBasisPoints: number | null;
  /** Present only for the verified disposable-local protocol. */
  protocol?: "local_respan_free" | "live_function_tools";
  expectedFreeModel?: string;
  expectedFreeProvider?: string;
  freePriceSnapshotDigest?: string;
  freePriceSnapshot?: {
    routeModel: "openrouter/free";
    resolvedModel: string;
    provider: string;
    promptPriceUsdPerM: "0";
    completionPriceUsdPerM: "0";
    observedAt: string;
    source: "openrouter-models-v1";
  };
  selectorPriceSnapshotDigest?: string;
  selectorPriceSnapshot?: {
    version: "respan-published-free-tier-v1";
    endpoint: "https://api.respan.ai/api/v1/scores";
    model: "respan-01-free";
    inputPriceUsdPerM: "0";
    outputPriceUsdPerM: "0";
    sourceUrl: "https://www.respan.ai/docs/documentation/span-01/concept";
    verifiedAt: string;
  };
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
  duplicateDispatches: number;
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
  duplicateDispatches: number;
  chargedUsdMicros: string;
  policyVersions: string[];
};

/**
 * Content-free promotion evidence supplied by the deployment/control plane.
 * The route recomputes the one-stage verifier from this projection; it never
 * trusts a precomputed `allowed` flag or any learner-level telemetry.
 */
export type VeraAutomaticContextPromotionEvidence = {
  policyVersion: string;
  current: VeraAutomaticRolloutStage;
  target: VeraAutomaticRolloutStage;
  aggregate: VeraAutomaticTelemetryAggregate;
  providerCapabilityReady: boolean;
  capabilityEvidence: VeraAutomaticContextCapabilityEvidence | null;
  canaryExpiresAt: string | null;
  legacyRetirementReviewed: boolean;
  approvalDigest: string;
};

export type VeraAutomaticContextAlertCode =
  | "provider_capability_drift"
  | "tool_schema_failure"
  | "canary_expired"
  | "unknown_usage"
  | "unknown_cost"
  | "source_authorization"
  | "duplicate_dispatch"
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
const PROMOTION_KEYS = [
  "policyVersion",
  "current",
  "target",
  "aggregate",
  "providerCapabilityReady",
  "capabilityEvidence",
  "canaryExpiresAt",
  "legacyRetirementReviewed",
  "approvalDigest",
] as const;
const PROMOTION_AGGREGATE_KEYS = [
  "state", "sampleCount", "completedCount", "noMatchCount", "unavailableCount",
  "schemaInvalidCount", "failedCount", "sourceCount", "sourceKindCounts",
  "selectorLatencyP95Ms", "registryLatencyP95Ms", "finalLatencyP95Ms", "totalLatencyP95Ms",
  "citationValidationFailures", "sourceAuthorizationFailures", "replayCount", "unknownUsageCount",
  "unknownCostCount", "duplicateDispatches", "chargedUsdMicros", "policyVersions",
] as const;

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

function parsePromotionAggregate(value: unknown): VeraAutomaticTelemetryAggregate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== PROMOTION_AGGREGATE_KEYS.length
    || Object.keys(candidate).some((key) => !PROMOTION_AGGREGATE_KEYS.includes(key as (typeof PROMOTION_AGGREGATE_KEYS)[number]))) return null;
  const state = candidate.state === "ready" || candidate.state === "suppressed" ? candidate.state : null;
  const sourceKindCounts = candidate.sourceKindCounts;
  if (!state || !sourceKindCounts || typeof sourceKindCounts !== "object" || Array.isArray(sourceKindCounts)) return null;
  const counts = sourceKindCounts as Record<string, unknown>;
  if (Object.keys(counts).length !== 3 || ["materi", "kuis", "tryout"].some((key) => !Object.prototype.hasOwnProperty.call(counts, key))) return null;
  const integer = (key: string): number | null => {
    const parsed = candidate[key];
    return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const latency = (key: string): number | null => {
    const parsed = candidate[key];
    return parsed === null || (typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed >= 0) ? parsed as number | null : null;
  };
  const sourceCount = integer("sourceCount");
  const sampleCount = integer("sampleCount");
  const completedCount = integer("completedCount");
  const noMatchCount = integer("noMatchCount");
  const unavailableCount = integer("unavailableCount");
  const schemaInvalidCount = integer("schemaInvalidCount");
  const failedCount = integer("failedCount");
  const citationValidationFailures = integer("citationValidationFailures");
  const sourceAuthorizationFailures = integer("sourceAuthorizationFailures");
  const replayCount = integer("replayCount");
  const unknownUsageCount = integer("unknownUsageCount");
  const unknownCostCount = integer("unknownCostCount");
  const duplicateDispatches = integer("duplicateDispatches");
  const materi = counts.materi;
  const kuis = counts.kuis;
  const tryout = counts.tryout;
  const chargedUsdMicros = candidate.chargedUsdMicros;
  const policyVersions = candidate.policyVersions;
  if ([sourceCount, sampleCount, completedCount, noMatchCount, unavailableCount, schemaInvalidCount, failedCount, citationValidationFailures, sourceAuthorizationFailures, replayCount, unknownUsageCount, unknownCostCount, duplicateDispatches].some((value) => value === null)
    || ![materi, kuis, tryout].every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    || sourceCount !== (materi as number) + (kuis as number) + (tryout as number)
    || BigInt(completedCount!) + BigInt(noMatchCount!) + BigInt(unavailableCount!) + BigInt(failedCount!) !== BigInt(sampleCount!)
    || schemaInvalidCount! > sampleCount!
    || typeof chargedUsdMicros !== "string" || !/^\d{1,30}$/u.test(chargedUsdMicros)
    || !Array.isArray(policyVersions) || policyVersions.length > 8
    || policyVersions.some((value) => typeof value !== "string" || !value.trim() || value.length > 120)
    || new Set(policyVersions).size !== policyVersions.length) return null;
  const selectorLatencyP95Ms = latency("selectorLatencyP95Ms");
  const registryLatencyP95Ms = latency("registryLatencyP95Ms");
  const finalLatencyP95Ms = latency("finalLatencyP95Ms");
  const totalLatencyP95Ms = latency("totalLatencyP95Ms");
  return {
    state,
    sampleCount: sampleCount!,
    completedCount: completedCount!,
    noMatchCount: noMatchCount!,
    unavailableCount: unavailableCount!,
    schemaInvalidCount: schemaInvalidCount!,
    failedCount: failedCount!,
    sourceCount: sourceCount!,
    sourceKindCounts: { materi: materi as number, kuis: kuis as number, tryout: tryout as number },
    selectorLatencyP95Ms,
    registryLatencyP95Ms,
    finalLatencyP95Ms,
    totalLatencyP95Ms,
    citationValidationFailures: citationValidationFailures!,
    sourceAuthorizationFailures: sourceAuthorizationFailures!,
    replayCount: replayCount!,
    unknownUsageCount: unknownUsageCount!,
    unknownCostCount: unknownCostCount!,
    duplicateDispatches: duplicateDispatches!,
    chargedUsdMicros,
    policyVersions: [...policyVersions] as string[],
  };
}

function parseCapabilityEvidence(value: unknown): VeraAutomaticContextCapabilityEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== REQUIRED_CAPABILITY_EVIDENCE.length
    || Object.keys(candidate).some((key) => !REQUIRED_CAPABILITY_EVIDENCE.includes(key as (typeof REQUIRED_CAPABILITY_EVIDENCE)[number]))) return null;
  const evidence = {} as VeraAutomaticContextCapabilityEvidence;
  for (const key of REQUIRED_CAPABILITY_EVIDENCE) {
    if (typeof candidate[key] !== "boolean") return null;
    evidence[key] = candidate[key] as boolean;
  }
  return evidence;
}

export function parseVeraAutomaticContextPromotionEvidence(value: unknown): VeraAutomaticContextPromotionEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== PROMOTION_KEYS.length
    || Object.keys(candidate).some((key) => !PROMOTION_KEYS.includes(key as (typeof PROMOTION_KEYS)[number]))) return null;
  const current = candidate.current;
  const target = candidate.target;
  const currentStage = VERA_AUTOMATIC_ROLLOUT_STAGES.includes(current as VeraAutomaticRolloutStage) ? current as VeraAutomaticRolloutStage : null;
  const targetStage = VERA_AUTOMATIC_ROLLOUT_STAGES.includes(target as VeraAutomaticRolloutStage) ? target as VeraAutomaticRolloutStage : null;
  const aggregate = parsePromotionAggregate(candidate.aggregate);
  const capabilityEvidence = parseCapabilityEvidence(candidate.capabilityEvidence);
  const canaryExpiresAt = parseTimestamp(candidate.canaryExpiresAt);
  const approvalDigest = candidate.approvalDigest;
  const policyVersion = candidate.policyVersion;
  if (!currentStage || !targetStage || !aggregate || !capabilityEvidence || typeof candidate.providerCapabilityReady !== "boolean"
    || typeof candidate.legacyRetirementReviewed !== "boolean" || !canaryExpiresAt
    || typeof policyVersion !== "string" || !policyVersion.trim() || policyVersion.length > 120
    || typeof approvalDigest !== "string" || !DIGEST_PATTERN.test(approvalDigest)) return null;
  return {
    policyVersion,
    current: currentStage,
    target: targetStage,
    aggregate,
    providerCapabilityReady: candidate.providerCapabilityReady,
    capabilityEvidence,
    canaryExpiresAt,
    legacyRetirementReviewed: candidate.legacyRetirementReviewed,
    approvalDigest,
  };
}

export function readVeraAutomaticContextPromotionEvidence(env: NodeJS.ProcessEnv = process.env): VeraAutomaticContextPromotionEvidence | null {
  const raw = env.VERA_AUTOMATIC_CONTEXT_PROMOTION_EVIDENCE_JSON?.trim();
  if (!raw) return null;
  try {
    return parseVeraAutomaticContextPromotionEvidence(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function automaticContextRolloutStageForConfig(config: Pick<VeraAutomaticContextRolloutConfig, "state" | "rolloutBasisPoints">): VeraAutomaticRolloutStage {
  if (config.state === "off") return "off";
  if (config.state === "internal") return "internal";
  if (config.state === "on") return "on";
  if (config.rolloutBasisPoints <= VERA_AUTOMATIC_ROLLOUT_BASIS_POINTS["5%"]) return "5%";
  if (config.rolloutBasisPoints <= VERA_AUTOMATIC_ROLLOUT_BASIS_POINTS["25%"]) return "25%";
  return "on";
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
    duplicateDispatches: boundedNonNegativeInteger(input.duplicateDispatches),
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
    duplicateDispatches: sum((event) => event.duplicateDispatches),
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
  if (input.aggregate.duplicateDispatches > 0) alerts.push({ code: "duplicate_dispatch", severity: "critical", failClosed: true });
  if (input.aggregate.citationValidationFailures > 0) alerts.push({ code: "citation_validation", severity: "critical", failClosed: true });
  const modeBudgets = Object.values(VERA_AUTOMATIC_CONTEXT_BUDGETS);
  const defaultSelectorLatencyBudgetMs = Math.min(...modeBudgets.map((budget) => budget.selectorTimeoutMs));
  const defaultRegistryLatencyBudgetMs = Math.min(...modeBudgets.map((budget) => budget.registryTimeoutMs));
  const defaultFinalLatencyBudgetMs = Math.min(...modeBudgets.map((budget) => budget.finalProviderTimeoutMs));
  const defaultTotalLatencyBudgetMs = Math.min(...modeBudgets.map((budget) => budget.logicalDeadlineMs));
  const latencyBreached = (input.aggregate.selectorLatencyP95Ms ?? 0) > (input.selectorLatencyBudgetMs ?? defaultSelectorLatencyBudgetMs)
    || (input.aggregate.registryLatencyP95Ms ?? 0) > (input.registryLatencyBudgetMs ?? defaultRegistryLatencyBudgetMs)
    || (input.aggregate.finalLatencyP95Ms ?? 0) > (input.finalLatencyBudgetMs ?? defaultFinalLatencyBudgetMs)
    || (input.aggregate.totalLatencyP95Ms ?? 0) > (input.totalLatencyBudgetMs ?? defaultTotalLatencyBudgetMs);
  if (latencyBreached) alerts.push({ code: "latency_budget", severity: "warning", failClosed: false });
  if (input.spendLimitUsdMicros !== undefined && BigInt(input.aggregate.chargedUsdMicros) > input.spendLimitUsdMicros) alerts.push({ code: "spend_exposure", severity: "critical", failClosed: true });
  return alerts;
}

export type VeraAutomaticRolloutVerification = {
  allowed: boolean;
  target: VeraAutomaticRolloutStage;
  targetBasisPoints: number;
  blockers: readonly string[];
};

/**
 * Evaluates one-way rollout promotion. Emergency rollback is intentionally
 * handled by the gate's `emergencyOff` switch, so promotion cannot use this
 * helper to widen access or budgets accidentally.
 */
export function evaluateVeraAutomaticContextRollout(input: {
  current: VeraAutomaticRolloutStage;
  target: VeraAutomaticRolloutStage;
  aggregate: VeraAutomaticTelemetryAggregate;
  providerCapabilityReady: boolean;
  capabilityEvidence: VeraAutomaticContextCapabilityEvidence | null | undefined;
  canaryExpiresAt: string | null;
  now?: Date;
  noMatchRateLimit?: number;
  legacyRetirementReviewed?: boolean;
}): VeraAutomaticRolloutVerification {
  const blockers: string[] = [];
  const targetBasisPoints = VERA_AUTOMATIC_ROLLOUT_BASIS_POINTS[input.target];
  const currentIndex = VERA_AUTOMATIC_ROLLOUT_STAGES.indexOf(input.current);
  const targetIndex = VERA_AUTOMATIC_ROLLOUT_STAGES.indexOf(input.target);

  if (input.target === "off") {
    return { allowed: true, target: input.target, targetBasisPoints, blockers };
  }
  if (targetIndex !== currentIndex + 1) blockers.push("rollout_must_advance_one_stage");
  if (!input.providerCapabilityReady) blockers.push("provider_capability_unready");
  if (!veraAutomaticContextCapabilityEvidenceReady(input.capabilityEvidence)) blockers.push("capability_evidence_unready");
  const now = input.now ?? new Date();
  const expiry = input.canaryExpiresAt ? new Date(input.canaryExpiresAt) : null;
  if (!expiry || Number.isNaN(expiry.getTime()) || expiry <= now) blockers.push("canary_expired");
  if (input.aggregate.state !== "ready") blockers.push("telemetry_suppressed");
  if (input.aggregate.sampleCount < MIN_REPORT_GROUP_SIZE) blockers.push("insufficient_evidence");
  if (input.aggregate.schemaInvalidCount > 0) blockers.push("schema_validation_failures");
  if (input.aggregate.sourceAuthorizationFailures > 0) blockers.push("source_authorization_failures");
  if (input.aggregate.duplicateDispatches > 0) blockers.push("duplicate_dispatches");
  if (input.aggregate.citationValidationFailures > 0) blockers.push("citation_validation_failures");
  if (input.aggregate.unknownUsageCount > 0) blockers.push("unknown_usage");
  if (input.aggregate.unknownCostCount > 0) blockers.push("unknown_cost");

  if (input.target === "25%" || input.target === "on") {
    const noMatchRate = input.aggregate.sampleCount === 0 ? 1 : input.aggregate.noMatchCount / input.aggregate.sampleCount;
    if (noMatchRate > (input.noMatchRateLimit ?? 0.5)) blockers.push("no_match_rate");
    const modes = Object.values(VERA_AUTOMATIC_CONTEXT_BUDGETS);
    const selectorBudgetMs = Math.max(...modes.map((budget) => budget.selectorTimeoutMs));
    const registryBudgetMs = Math.max(...modes.map((budget) => budget.registryTimeoutMs));
    const finalBudgetMs = Math.max(...modes.map((budget) => budget.finalProviderTimeoutMs));
    const logicalBudgetMs = Math.max(...modes.map((budget) => budget.logicalDeadlineMs));
    if (input.aggregate.selectorLatencyP95Ms === null || input.aggregate.selectorLatencyP95Ms > selectorBudgetMs) blockers.push("selector_latency_budget");
    if (input.aggregate.registryLatencyP95Ms === null || input.aggregate.registryLatencyP95Ms > registryBudgetMs) blockers.push("registry_latency_budget");
    if (input.aggregate.finalLatencyP95Ms === null || input.aggregate.finalLatencyP95Ms > finalBudgetMs) blockers.push("final_latency_budget");
    if (input.aggregate.totalLatencyP95Ms === null || input.aggregate.totalLatencyP95Ms > logicalBudgetMs) blockers.push("total_latency_budget");
  }
  if (input.target === "on" && input.legacyRetirementReviewed !== true) blockers.push("legacy_retirement_not_reviewed");
  return { allowed: blockers.length === 0, target: input.target, targetBasisPoints, blockers };
}

export function automaticContextMustFailClosed(alerts: readonly VeraAutomaticContextAlert[]): boolean {
  return alerts.some((alert) => alert.failClosed);
}

export function automaticContextTelemetryDigest(event: VeraAutomaticTelemetryEvent): string {
  return sha256Hex(canonicalJson(event));
}

export const VERA_AUTOMATIC_CONTEXT_OPERATIONAL_BUDGETS = VERA_AUTOMATIC_CONTEXT_BUDGETS;
