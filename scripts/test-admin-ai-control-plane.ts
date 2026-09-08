import {
  VERA_CAPABILITIES,
} from "@/lib/admin/ai/contracts";
import {
  buildVeraAiOverviewDto,
  buildVeraAiProvidersDto,
  buildVeraAiReliabilityDto,
  buildVeraAiUsageDto,
  calculateCostMetrics,
  calculateQuotaHealth,
  calculateReliabilityMetrics,
  classifyIncidentDomain,
  formatSemanticMetric,
} from "@/lib/admin/ai/aggregators";

let checks = 0;
function check(condition: boolean, message: string) {
  checks += 1;
  if (!condition) throw new Error(`FAIL admin-ai-control-plane: ${message}`);
}

// 1. Semantic Metric formatting
const availableMetric = formatSemanticMetric("available", 18420, {
  formatter: (v) => v.toLocaleString("id-ID"),
});
check(availableMetric.state === "available", "available metric state is available");
if (availableMetric.state === "available") {
  check(availableMetric.value === 18420, "value is preserved");
}

const suppressedMetric = formatSemanticMetric("suppressed", 2, {
  suppressReason: "insufficient_cohort",
});
check(suppressedMetric.state === "suppressed", "suppressed metric state is suppressed");
if (suppressedMetric.state === "suppressed") {
  check(
    suppressedMetric.message?.includes("minimum privacy threshold") ?? false,
    "suppression message uses cohort threshold disclosure language",
  );
  check(!suppressedMetric.message?.includes("< 5"), "never leaks '< 5' text");
}

// 2. Incident domain classification
check(classifyIncidentDomain("quota") === "admission", "quota classified as admission");
check(classifyIncidentDomain("burst") === "admission", "burst classified as admission");
check(classifyIncidentDomain("concurrency") === "admission", "concurrency classified as admission");
check(classifyIncidentDomain("redis_unavailable") === "infrastructure", "redis classified as infrastructure");
check(classifyIncidentDomain("provider_timeout") === "upstream", "timeout classified as upstream");
check(classifyIncidentDomain("schema_validation") === "application", "schema classified as application");

// 3. Reliability math & request classification
const mockRequests = [
  {
    id: "req-1",
    studentId: "s-1",
    createdAt: new Date(),
    featureKey: "vera.chat",
    gateway: "openrouter",
    upstreamProvider: "decart",
    model: "z-ai/glm-5.2:free",
    status: "succeeded",
    inputTokens: 100,
    outputTokens: 200,
    quotaUnitsReserved: 1,
    quotaUnitsConsumed: 1,
    quotaOverrunUnits: 0,
    tokenUsageState: "complete",
    latencyMs: 1200,
    timeToFirstTokenMs: 400,
  },
  {
    id: "req-2",
    studentId: "s-2",
    createdAt: new Date(),
    featureKey: "vera.review",
    gateway: "openrouter",
    upstreamProvider: "decart",
    model: "z-ai/glm-5.2:free",
    status: "fallback",
    inputTokens: 150,
    outputTokens: 300,
    quotaUnitsReserved: 2,
    quotaUnitsConsumed: 2,
    quotaOverrunUnits: 0,
    tokenUsageState: "complete",
    latencyMs: 2500,
    timeToFirstTokenMs: 600,
  },
  {
    id: "req-3",
    studentId: "s-3",
    createdAt: new Date(),
    featureKey: "vera.drill",
    gateway: "openrouter",
    upstreamProvider: "decart",
    model: "z-ai/glm-5.2:free",
    status: "failed",
    inputTokens: 0,
    outputTokens: 0,
    quotaUnitsReserved: 1,
    quotaUnitsConsumed: 0,
    quotaOverrunUnits: 0,
    tokenUsageState: "failed",
    latencyMs: 8000,
    timeToFirstTokenMs: 0,
  },
];

const mockAdmissions = [
  {
    id: "adm-1",
    studentId: "s-4",
    occurredAt: new Date(),
    featureKey: "vera.chat",
    gateway: "openrouter",
    upstreamProvider: "decart",
    model: "z-ai/glm-5.2:free",
    reason: "quota",
  },
];

const rel = calculateReliabilityMetrics(mockRequests, mockAdmissions);
// Terminal = 3 (succeeded 1, fallback 1, failed 1)
if (rel.executionSuccessRate.state === "available") {
  check(Math.abs(rel.executionSuccessRate.value - 1 / 3) < 0.01, "execution success rate = succeeded / terminal");
}
if (rel.effectiveCompletionRate.state === "available") {
  check(Math.abs(rel.effectiveCompletionRate.value - 2 / 3) < 0.01, "effective completion rate = (succeeded + fallback) / terminal");
}
if (rel.fallbackRate.state === "available") {
  check(Math.abs(rel.fallbackRate.value - 1 / 3) < 0.01, "fallback rate = fallback / terminal");
}
if (rel.admissionRejectionRate.state === "available") {
  check(Math.abs(rel.admissionRejectionRate.value - 1 / 4) < 0.01, "admission rejection rate = rejected / attempted");
}

// 4. Quota health calculation
const quotaHealth = calculateQuotaHealth(mockRequests, mockAdmissions, 100);
check(quotaHealth.consumedUnits === 3, "consumed units is sum of consumed");
check(quotaHealth.allocatedDailyUnits === 100, "allocated daily capacity is preserved");
check(quotaHealth.hourlyLocks.length === 24, "hourly locks distribution spans 24 hours");

// 5. Cost metrics calculation
const cost = calculateCostMetrics(mockRequests, 8000000);
check(cost.monthlyBudgetIdr === 8000000, "monthly budget preserved");
check(cost.costByCapability.length === VERA_CAPABILITIES.length, "cost broken down across all capabilities");
check(cost.tokenCoverage.totalTokens === 750, "token count summed correctly");

// 6. Full DTO Builders
const overview = buildVeraAiOverviewDto({
  requests: mockRequests,
  admissions: mockAdmissions,
  now: new Date(),
});
check(overview.kpis.requestsToday.state === "available", "overview requestsToday KPI populated");
check(overview.activePolicy.bundleVersion.length > 0, "overview active policy version present");
check(overview.freshness.requests.label.includes("Live"), "requests freshness is live");

const usage = buildVeraAiUsageDto({
  requests: mockRequests,
  admissions: mockAdmissions,
  now: new Date(),
});
check(usage.items.length > 0, "usage items populated");

const reliability = buildVeraAiReliabilityDto({
  requests: mockRequests,
  admissions: mockAdmissions,
  now: new Date(),
});
check(reliability.requestClassification.admittedRequests.total === 3, "reliability admitted requests correct");
check(reliability.requestClassification.rejectedAdmissions.total === 1, "reliability rejected admissions correct");

const providers = buildVeraAiProvidersDto(new Date());
check(providers.gateways.length === 3, "providers gateways populated");
check(providers.capacityHeadroom.concurrencyShare > 0, "capacity headroom populated");
check(providers.capabilityRoutes.length > 0, "capability routes populated");

console.log(`PASS admin-ai-control-plane: ${checks} checks`);
