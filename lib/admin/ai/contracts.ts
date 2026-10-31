export const VERA_CAPABILITIES = [
  "vera.chat",
  "vera.drill",
  "vera.review",
  "vera.analysis",
  "vera.ptn",
  "vera.route",
  "vera.summary",
] as const;

export type VeraCapability = (typeof VERA_CAPABILITIES)[number];

export const VERA_GATEWAYS = ["openrouter", "direct_anthropic", "direct_openai", "mock"] as const;
export type VeraGateway = (typeof VERA_GATEWAYS)[number];

export const VERA_MODELS = [
  "z-ai/glm-5.2:free",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o-mini",
  "mock",
] as const;
export type VeraModel = (typeof VERA_MODELS)[number];

export const VERA_PRIVACY_MIN_COHORT_SIZE = 5 as const;

export type MetricDataState = "available" | "partial" | "suppressed" | "unavailable";

export type SemanticMetric<T = number> =
  | {
      state: "available";
      value: T;
      trendDelta?: number | null;
      trendUnit?: string;
      formattedValue?: string;
    }
  | {
      state: "partial";
      value: T;
      coverage: number;
      trendDelta?: number | null;
      trendUnit?: string;
      formattedValue?: string;
    }
  | {
      state: "suppressed";
      reason: "insufficient_cohort" | "complement_protection";
      message?: string;
    }
  | {
      state: "unavailable";
      reason: string;
      message?: string;
    };

export type AdmittedStatus = "succeeded" | "fallback" | "failed";
export type RejectedReason = "quota" | "quota_overrun_lock" | "burst" | "concurrency";
export type RequestClass = "admitted" | "rejected";

export type IncidentDomain = "admission" | "infrastructure" | "upstream" | "application";

export type IncidentType =
  | "quota"
  | "quota_overrun_lock"
  | "burst"
  | "concurrency"
  | "redis_unavailable"
  | "lease_failure"
  | "queue_failure"
  | "settlement_failure"
  | "provider_timeout"
  | "provider_rate_limit"
  | "provider_5xx"
  | "malformed_provider_response"
  | "schema_validation"
  | "context_pack_failure"
  | "orchestration_failure";

export type IncidentSeverity = "normal" | "warning" | "critical";

export type IncidentSummaryItem = {
  domain: IncidentDomain;
  type: IncidentType;
  label: string;
  count: number;
  rate: number;
  changePp: number | null;
  severity: IncidentSeverity;
  affectedFeatures?: Array<{ feature: VeraCapability; share: number }>;
  affectedGateways?: Array<{ gateway: VeraGateway; share: number }>;
  affectedModels?: Array<{ model: string; share: number }>;
  p50LatencyMs?: number | null;
  p95LatencyMs?: number | null;
  privacySatisfied: boolean;
};

export type QuotaHealthState = {
  privacyState: "available" | "suppressed";
  hourlyPrivacyState: "available" | "suppressed";
  capacityAvailable: boolean;
  allocatedDailyUnits: number;
  consumedUnits: number;
  reservedUnits: number;
  overrunDebtUnits: number;
  availableUnits: number;
  consumedPercentage: number;
  reservedPercentage: number;
  availablePercentage: number;
  studentsAtOrAbove80Percent: number | null;
  studentsAtOrAbove80PercentShare: number | null;
  studentsHardLocked: number;
  hardLockRate: number;
  earlyExhaustionAlert: {
    status: "normal" | "elevated" | "critical" | "unavailable";
    exhaustedBeforeNoonShare: number;
    normalThresholdShare: number;
    message: string;
  };
  hourlyLocks: Array<{
    hour: number;
    hourLabel: string;
    lockCount: number;
    cumulativeLocks: number;
  }>;
};

export type ReliabilityMetrics = {
  executionSuccessRate: SemanticMetric<number>;
  effectiveCompletionRate: SemanticMetric<number>;
  fallbackRate: SemanticMetric<number>;
  executionFailureRate: SemanticMetric<number>;
  admissionRejectionRate: SemanticMetric<number>;
  fallbackRecoveryRate: SemanticMetric<number>;
  p50LatencyMs: SemanticMetric<number>;
  p95LatencyMs: SemanticMetric<number>;
  p50TimeToFirstTokenMs: SemanticMetric<number>;
  p95TimeToFirstTokenMs: SemanticMetric<number>;
  gracefulDegradationBreakdown: {
    available: boolean;
    primaryLlmShare: number;
    alternativeModelShare: number;
    cachedCandidateBankShare: number;
    staticQuestionBankShare: number;
    unrecoverableShare: number;
  };
};

export type SystemCapacityMetrics = {
  quotaCapacityShare: number;
  quotaStatus: "healthy" | "elevated" | "critical";
  concurrencyShare: number;
  concurrencyStatus: "healthy" | "elevated" | "critical";
  providerRpmShare: number;
  providerRpmStatus: "healthy" | "elevated" | "critical";
  providerTpmShare: number;
  providerTpmStatus: "healthy" | "elevated" | "critical";
  queueDepthShare: number;
  queueDepthStatus: "healthy" | "elevated" | "critical";
};

export type GatewayHealthInfo = {
  gateway: VeraGateway;
  label: string;
  status: "healthy" | "warning" | "degraded" | "disabled";
  trafficShare: number;
  successRate: number;
  p95LatencySec: number;
  fallbackTriggeredRate: number;
  credentialFingerprint: string;
  lastRotatedDate: string;
  credentialHealth: "valid" | "expiring_soon" | "invalid";
};

export type CapabilityRoutingInfo = {
  capability: VeraCapability;
  label: string;
  configuredChain: {
    primary: { gateway: VeraGateway; model: string };
    fallback1?: { gateway: VeraGateway; model: string };
    fallback2?: { type: "curated_bank" | "static_bank" | "none"; label: string };
    timeoutMs: number;
    retryPolicy: string;
  };
  observedLast24h: {
    primaryCompletionShare: number;
    modelFallbackShare: number;
    staticFallbackShare: number;
    failedShare: number;
  };
};

export type CostMetrics = {
  state: "available" | "partial" | "unavailable" | "suppressed";
  rangeState: "available" | "partial" | "unavailable" | "suppressed";
  spendRangeIdr: number;
  exchangeRateIdr: number;
  monthCoveragePercentage: number;
  spendMtdIdr: number;
  projectedEomIdr: number;
  monthlyBudgetIdr: number;
  projectedUtilizationShare: number;
  costByCapability: Array<{
    capability: VeraCapability;
    spendIdr: number;
    spendUsd: number;
    quotaUnits: number;
    costPerUnitUsd: number;
    share: number;
    privacyState: "available" | "suppressed";
    costAvailable: boolean;
  }>;
  tokenCoverage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    knownPercentage: number;
    unavailablePercentage: number;
  };
  costCoverage: {
    knownPercentage: number;
    estimatedCostUsd: number;
  };
};

export type FreshnessState = {
  requests: { asOf: string; label: string; state: "live" | "snapshot" | "stale" | "unavailable" };
  quota: { asOf: string; label: string; state: "live" | "snapshot" | "stale" | "unavailable" };
  cost: { asOf: string; label: string; state: "fresh" | "snapshot" | "stale" | "unavailable" | "partial" | "suppressed" };
  analytics: { asOf: string; label: string; state: "fresh" | "snapshot" | "stale" | "unavailable" };
};

export type VeraAiOverviewDto = {
  systemStatus: "healthy" | "warning" | "degraded" | "unavailable";
  activePolicy: {
    bundleVersion: string;
    activatedAt: string;
  } | null;
  freshness: FreshnessState;
  kpis: {
    requestsToday: SemanticMetric<number>;
    activeLearnersToday: SemanticMetric<number>;
    quotaConsumedToday: SemanticMetric<number>;
    successRateToday: SemanticMetric<number>;
    p95LatencyTodayMs: SemanticMetric<number>;
    spendMtdIdr: SemanticMetric<number>;
  };
  requestsOverTime: Array<{
    timestamp: string;
    timeLabel: string;
    total: number;
  }>;
  timeSeriesPrivacyState: "available" | "suppressed";
  quotaHealth: QuotaHealthState;
  reliabilitySummary: {
    successRate: number | null;
    fallbackRate: number | null;
    p95LatencySec: number | null;
    p95TimeToFirstTokenSec: number | null;
  };
  featureUsageBreakdown: Array<{
    capability: VeraCapability;
    label: string;
    quotaUnits: number;
    requests: number;
    sharePercentage: number;
    privacyState: "available" | "suppressed";
  }>;
  openIncidents: IncidentSummaryItem[];
};

export type VeraAiUsageBreakdownDto = {
  range: { from: string; to: string; timezone: string };
  freshness: FreshnessState;
  metricSelected: "quota_units" | "requests" | "tokens" | "cost";
  groupBySelected: "feature" | "model" | "gateway" | "status";
  items: Array<{
    id: string;
    label: string;
    requests: number;
    quotaUnits: number;
    tokens: number;
    costUsd: number;
    costAvailable: boolean;
    sharePercentage: number;
    privacyState: "available" | "suppressed";
    suppressionMessage?: string;
  }>;
  quotaHealth: QuotaHealthState;
  cost: CostMetrics;
};

export type VeraAiReliabilityDto = {
  privacyState: "available" | "suppressed";
  range: { from: string; to: string; timezone: string };
  freshness: FreshnessState;
  requestClassification: {
    attemptedAdmissions: number;
    admittedRequests: {
      total: number;
      succeeded: number;
      fallback: number;
      failed: number;
    };
    rejectedAdmissions: {
      total: number;
      byReason: Record<RejectedReason, number>;
    };
    terminalRequests: number;
  };
  metrics: ReliabilityMetrics;
  incidentTaxonomy: {
    admission: IncidentSummaryItem[];
    infrastructure: IncidentSummaryItem[];
    upstream: IncidentSummaryItem[];
    application: IncidentSummaryItem[];
  };
};

export type VeraAiProvidersDto = {
  freshness: FreshnessState;
  gateways: GatewayHealthInfo[];
  capacityHeadroom: SystemCapacityMetrics | null;
  capabilityRoutes: CapabilityRoutingInfo[];
};
