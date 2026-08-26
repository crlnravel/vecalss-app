export const VERA_REPORT_OPERATION = "admin_report_query" as const;
export const VERA_REPORT_FINGERPRINT_KEY_VERSION = "vera-report-hmac-v1" as const;
export const VERA_REPORT_MIN_GROUP_SIZE = 5 as const;
export const VERA_REPORT_MAX_RANGE_DAYS = 31 as const;
export const VERA_REPORT_MAX_RESULT_BYTES = 256 * 1024;
export const VERA_REPORT_RECOVERY_LEASE_MS = 30_000;
export const VERA_REPORT_BURST_WINDOW_MS = 10 * 60_000;
export const VERA_REPORT_REPLAY_TTL_DAYS = 90;

export const VERA_REPORT_FEATURES = [
  "vera.chat",
  "vera.analysis",
  "vera.route",
  "vera.review",
  "vera.ptn",
  "vera.summary",
  "vera.drill",
] as const;

export const VERA_REPORT_GATEWAYS = ["openrouter", "mock"] as const;
export const VERA_REPORT_UPSTREAMS = ["decart", "mock"] as const;
export const VERA_REPORT_MODELS = ["z-ai/glm-5.2:free", "mock"] as const;
export const VERA_REPORT_STATUSES = ["pending", "staged", "succeeded", "fallback", "failed"] as const;
export const VERA_REPORT_INCIDENT_REASONS = [
  "quota",
  "quota_overrun_lock",
  "burst",
  "concurrency",
  "redis_unavailable",
  "provider_failure",
  "fallback",
  "overrun_debt",
  "staged_recovery",
] as const;

export type VeraReportFeature = (typeof VERA_REPORT_FEATURES)[number];
export type VeraReportGateway = (typeof VERA_REPORT_GATEWAYS)[number];
export type VeraReportUpstream = (typeof VERA_REPORT_UPSTREAMS)[number];
export type VeraReportModel = (typeof VERA_REPORT_MODELS)[number];
export type VeraReportStatus = (typeof VERA_REPORT_STATUSES)[number];
export type VeraReportInclude = "dailyTrend" | "byFeature" | "byModel" | "byStatus" | "incidents" | "comparison";
export type VeraReportIncidentReason = (typeof VERA_REPORT_INCIDENT_REASONS)[number];

export type VeraAdminUsageQuery = {
  from: string;
  to: string;
  timezone: string;
  feature: VeraReportFeature | "all";
  gateway: VeraReportGateway | "unknown" | "all";
  upstreamProvider: VeraReportUpstream | "unknown" | "all";
  model: VeraReportModel | "unknown" | "all";
  status: VeraReportStatus | "all";
  include: ReadonlySet<VeraReportInclude>;
  utcStart: Date;
  utcEnd: Date;
  previousUtcStart: Date;
  previousUtcEnd: Date;
  previousFrom: string;
  previousTo: string;
  dayCount: number;
};

export type VeraAggregatePartition<T = VeraAggregateRow> =
  | { state: "ready"; rows: T[] }
  | { state: "suppressed"; reason: "insufficient_data" }
  | { state: "unavailable"; reason: string };

export type VeraAggregateRow = {
  label?: string;
  date?: string;
  requests: number;
  terminalRequests: number;
  succeeded: number;
  fallback: number;
  failed: number;
  pending: number;
  staged: number;
  overdueRecovery: number;
  activeStudents: number | null;
  successRate: number | null;
  quotaUnits: number;
  reservedQuotaUnits: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  unknownUsage: number;
  overrunDebtUnits: number;
  overrunRequests: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p50TimeToFirstTokenMs: number | null;
  p95TimeToFirstTokenMs: number | null;
};

export type VeraIncidentRow = {
  label: VeraReportIncidentReason;
  count: number;
  activeStudents: number | null;
};

export type VeraComparisonRow = {
  current: VeraAggregateRow;
  previous: VeraAggregateRow;
  delta: Partial<Record<"requests" | "succeeded" | "fallback" | "failed" | "quotaUnits", number>> | null;
};

export type VeraPolicySummary = {
  active: {
    bundleVersion: string;
    effectiveAt: string;
    allowlistedThresholds: {
      unitLimit: number;
      requestLimit: number;
      minimumGroupSize: number;
      maxRangeDays: number;
    };
  };
  scheduled: { bundleVersion: string; effectiveAt: string } | null;
};

export type VeraAdminUsageDto = {
  range: { from: string; to: string; timezone: string };
  summary: VeraAggregatePartition;
  dailyTrend: VeraAggregatePartition;
  byFeature: VeraAggregatePartition;
  byModel: VeraAggregatePartition;
  byStatus: VeraAggregatePartition;
  latency: VeraAggregatePartition;
  incidents: VeraAggregatePartition<VeraIncidentRow>;
  comparison: VeraAggregatePartition<VeraComparisonRow>;
  policySummary: VeraPolicySummary;
  freshness: { state: "fresh" | "stale" | "unavailable"; asOf: string | null };
  lastUpdatedAt: string | null;
};

export type VeraAdminReportFailureDto = {
  state: "error";
  code: string;
  retryable: boolean;
  reservationId: string;
};

export type VeraReportOutcomeState =
  | "ready"
  | "partial_unavailable"
  | "suppressed"
  | "coarsened"
  | "unavailable"
  | "failed"
  | "process_lost";

export type VeraReportReplay =
  | { kind: "completed"; dto: VeraAdminUsageDto; status: 200 }
  | { kind: "pending"; reservationId: string; status: 202 }
  | { kind: "failure"; dto: VeraAdminReportFailureDto; status: 503 | 409 }
  | { kind: "expired"; status: 409 }
  | { kind: "conflict"; status: 409 };

export type VeraReportQueryResult = {
  dto: VeraAdminUsageDto;
  outcome: VeraReportOutcomeState;
  resultDigest: string;
};

export type VeraAdminReportDbRow = {
  id: string;
  studentId: string | null;
  createdAt: Date;
  featureKey: string | null;
  gateway: string | null;
  upstreamProvider: string | null;
  model: string | null;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  quotaUnitsReserved: number;
  quotaUnitsConsumed: number;
  quotaOverrunUnits: number;
  tokenUsageState: string;
  usageAccountingState: string;
  latencyMs: number | null;
  timeToFirstTokenMs: number | null;
  settlementDeadlineAt: Date | null;
};

export type VeraAdminAdmissionDbRow = {
  id: string;
  studentId: string | null;
  occurredAt: Date;
  featureKey: string | null;
  gateway: string | null;
  upstreamProvider: string | null;
  model: string | null;
  reason: string;
};

export type VeraAdminUsageSources = {
  requests: VeraAdminReportDbRow[];
  admissions: VeraAdminAdmissionDbRow[];
  previousRequests?: VeraAdminReportDbRow[];
  previousAdmissions?: VeraAdminAdmissionDbRow[];
  now: Date;
  lastUpdatedAt: Date | null;
};

export type VeraReportPolicy = {
  bundleVersion: string;
  effectiveAt: Date;
  reportConfig: {
    unitLimit: number;
    requestLimit: number;
    minimumGroupSize: number;
    maxRangeDays: number;
  };
};
