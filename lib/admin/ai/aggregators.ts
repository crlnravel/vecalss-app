import { startOfWibDay, startOfWibMonth, startOfNextWibMonth } from "./periods";
import { distinctStudents, safeCell, summarySafe } from "../ai-usage/privacy";
import {
  VERA_CAPABILITIES,
  type CostMetrics,
  type FreshnessState,
  type IncidentDomain,
  type IncidentType,
  type QuotaHealthState,
  type RejectedReason,
  type ReliabilityMetrics,
  type SemanticMetric,
  type VeraAiOverviewDto,
  type VeraAiProvidersDto,
  type VeraAiReliabilityDto,
  type VeraAiUsageBreakdownDto,
} from "./contracts";

export type RawAiRequestRecord = {
  id: string;
  studentId: string | null;
  createdAt: Date;
  featureKey: string | null;
  gateway: string | null;
  upstreamProvider: string | null;
  model: string | null;
  status: string; // 'succeeded' | 'fallback' | 'failed' | 'pending' | 'staged'
  chargedProviderCostUsdMicros?: bigint | null;
  errorCode?: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  quotaUnitsReserved: number;
  quotaUnitsConsumed: number;
  quotaOverrunUnits: number;
  tokenUsageState: string;
  latencyMs: number | null;
  timeToFirstTokenMs: number | null;
};

export type RawAiAdmissionRecord = {
  id: string;
  studentId: string | null;
  occurredAt: Date;
  featureKey: string | null;
  gateway: string | null;
  upstreamProvider: string | null;
  model: string | null;
  reason: string; // 'quota' | 'quota_overrun_lock' | 'burst' | 'concurrency' | ...
};

export type AggregateComputationInput = {
  requests: RawAiRequestRecord[];
  admissions: RawAiAdmissionRecord[];
  previousRequests?: RawAiRequestRecord[];
  monthRequests?: RawAiRequestRecord[];
  todayRequests?: RawAiRequestRecord[];
  todayAdmissions?: RawAiAdmissionRecord[];
  now: Date;
  activePolicyVersion?: string;
  activePolicyActivatedAt?: string;
  dailyAllocatedQuota?: number;
  monthlyBudgetIdr?: number;
};

type CohortRow = { studentId: string | null };
const cohortSafe = (rows: CohortRow[]) => rows.length === 0 || summarySafe(distinctStudents(rows));
function partitionSafe(base: CohortRow[], cells: CohortRow[][]) {
  const students = distinctStudents(base);
  return cells.filter(rows => rows.length > 0).every(rows => safeCell(students, distinctStudents(rows)));
}

function observedCells<T extends CohortRow>(rows: T[], keyFor: (row: T) => string): T[][] {
  const cells = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const cell = cells.get(key) ?? [];
    cell.push(row);
    cells.set(key, cell);
  }
  return [...cells.values()];
}

export function classifyIncidentDomain(type: IncidentType): IncidentDomain {
  switch (type) {
    case "quota":
    case "quota_overrun_lock":
    case "burst":
    case "concurrency":
      return "admission";
    case "redis_unavailable":
    case "lease_failure":
    case "queue_failure":
    case "settlement_failure":
      return "infrastructure";
    case "provider_timeout":
    case "provider_rate_limit":
    case "provider_5xx":
    case "malformed_provider_response":
      return "upstream";
    case "schema_validation":
    case "context_pack_failure":
    case "orchestration_failure":
      return "application";
    default:
      return "application";
  }
}

export function formatSemanticMetric<T extends number>(
  state: "available" | "partial" | "suppressed" | "unavailable",
  value: T,
  options?: {
    coverage?: number;
    trendDelta?: number | null;
    trendUnit?: string;
    formatter?: (val: T) => string;
    suppressReason?: "insufficient_cohort" | "complement_protection";
    unavailableReason?: string;
  },
): SemanticMetric<T> {
  if (state === "suppressed") {
    return {
      state: "suppressed",
      reason: options?.suppressReason ?? "insufficient_cohort",
      message: "Ringkasan disembunyikan untuk menjaga privasi siswa.",
    };
  }

  if (state === "unavailable") {
    return {
      state: "unavailable",
      reason: options?.unavailableReason ?? "data_unavailable",
      message: "Data belum tersedia.",
    };
  }

  const formatted = options?.formatter ? options.formatter(value) : String(value);

  if (state === "partial") {
    return {
      state: "partial",
      value,
      coverage: options?.coverage ?? 1,
      trendDelta: options?.trendDelta,
      trendUnit: options?.trendUnit,
      formattedValue: formatted,
    };
  }

  return {
    state: "available",
    value,
    trendDelta: options?.trendDelta,
    trendUnit: options?.trendUnit,
    formattedValue: formatted,
  };
}

export function computePercentile(numbers: number[], p: number): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? null;
}

export function calculateReliabilityMetrics(
  requests: RawAiRequestRecord[],
  admissions: RawAiAdmissionRecord[],
): ReliabilityMetrics {
  if (!cohortSafe(requests) || !cohortSafe(admissions) || !partitionSafe(requests, observedCells(requests,r=>r.status))) {
    const hidden = calculateReliabilityMetrics([], []);
    for (const key of Object.keys(hidden) as (keyof ReliabilityMetrics)[]) {
      if (key !== "gracefulDegradationBreakdown") hidden[key] = formatSemanticMetric("suppressed", 0);
    }
    return hidden;
  }
  const terminal = requests.filter((r) =>
    r.status === "succeeded" || r.status === "fallback" || r.status === "failed",
  );
  const succeeded = terminal.filter((r) => r.status === "succeeded").length;
  const fallback = terminal.filter((r) => r.status === "fallback").length;
  const failed = terminal.filter((r) => r.status === "failed").length;
  const terminalCount = terminal.length;

  const attemptedAdmissions = requests.length + admissions.length;
  const rejectedAdmissions = admissions.length;

  const executionSuccessRateVal = terminalCount > 0 ? succeeded / terminalCount : 1;
  const effectiveCompletionRateVal = terminalCount > 0 ? (succeeded + fallback) / terminalCount : 1;
  const fallbackRateVal = terminalCount > 0 ? fallback / terminalCount : 0;
  const executionFailureRateVal = terminalCount > 0 ? failed / terminalCount : 0;
  const admissionRejectionRateVal = attemptedAdmissions > 0 ? rejectedAdmissions / attemptedAdmissions : 0;

  // Fallback recovery rate: of all fallback attempts, how many succeeded through fallback
  const fallbackRecoveryRateVal = fallback > 0 ? fallback / (fallback + failed) : 1;

  const latencies = terminal
    .map((r) => r.latencyMs)
    .filter((l): l is number => typeof l === "number" && Number.isFinite(l));
  const ttfts = terminal
    .map((r) => r.timeToFirstTokenMs)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));

  const p50Lat = computePercentile(latencies, 0.5) ?? 0;
  const p95Lat = computePercentile(latencies, 0.95) ?? 0;
  const p50Ttft = computePercentile(ttfts, 0.5) ?? 0;
  const p95Ttft = computePercentile(ttfts, 0.95) ?? 0;

  return {
    executionSuccessRate: formatSemanticMetric(terminalCount ? "available" : "unavailable", executionSuccessRateVal, {
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
    }),
    effectiveCompletionRate: formatSemanticMetric(terminalCount ? "available" : "unavailable", effectiveCompletionRateVal, {
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
    }),
    fallbackRate: formatSemanticMetric(terminalCount ? "available" : "unavailable", fallbackRateVal, {
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
    }),
    executionFailureRate: formatSemanticMetric(terminalCount ? "available" : "unavailable", executionFailureRateVal, {
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
    }),
    admissionRejectionRate: formatSemanticMetric(attemptedAdmissions ? "available" : "unavailable", admissionRejectionRateVal, {
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
    }),
    fallbackRecoveryRate: formatSemanticMetric("unavailable", fallbackRecoveryRateVal, {
      formatter: (v) => `${(v * 100).toFixed(1)}%`,
    }),
    p50LatencyMs: formatSemanticMetric(latencies.length ? "available" : "unavailable", p50Lat, {
      formatter: (v) => `${v.toFixed(0)} ms`,
    }),
    p95LatencyMs: formatSemanticMetric(latencies.length ? "available" : "unavailable", p95Lat, {
      formatter: (v) => `${v.toFixed(0)} ms`,
    }),
    p50TimeToFirstTokenMs: formatSemanticMetric(ttfts.length ? "available" : "unavailable", p50Ttft, {
      formatter: (v) => `${v.toFixed(0)} ms`,
    }),
    p95TimeToFirstTokenMs: formatSemanticMetric(ttfts.length ? "available" : "unavailable", p95Ttft, {
      formatter: (v) => `${v.toFixed(0)} ms`,
    }),
    gracefulDegradationBreakdown: {
      available: false,
      primaryLlmShare: 0, alternativeModelShare: 0, cachedCandidateBankShare: 0,
      staticQuestionBankShare: 0, unrecoverableShare: 0,
    },
  };
}

export function calculateQuotaHealth(
  requests: RawAiRequestRecord[],
  admissions: RawAiAdmissionRecord[],
  allocatedDailyCapacity = 0,
): QuotaHealthState {
  const allRows = [...requests, ...admissions];
  if (!cohortSafe(requests) || !cohortSafe(allRows)) return { ...calculateQuotaHealth([], [], allocatedDailyCapacity), privacyState: "suppressed", hourlyPrivacyState: "suppressed" };
  const consumedUnits = requests.reduce((acc, r) => acc + (r.quotaUnitsConsumed || 0), 0);
  const reservedUnits = requests
    .filter((r) => r.status === "pending" || r.status === "staged")
    .reduce((acc, r) => acc + (r.quotaUnitsReserved || 0), 0);
  const overrunDebtUnits = requests.reduce((acc, r) => acc + (r.quotaOverrunUnits || 0), 0);
  const availableUnits = Math.max(0, allocatedDailyCapacity - consumedUnits - reservedUnits);

  const consumedPct = allocatedDailyCapacity > 0 ? Math.round((consumedUnits / allocatedDailyCapacity) * 100) : 0;
  const reservedPct = allocatedDailyCapacity > 0 ? Math.round((reservedUnits / allocatedDailyCapacity) * 100) : 0;
  const availablePct = allocatedDailyCapacity > 0 ? Math.max(0, 100 - consumedPct - reservedPct) : 0;

  // Group requests by student to calculate threshold saturation
  const studentUsage = new Map<string, number>();
  for (const r of requests) {
    if (r.studentId) {
      studentUsage.set(r.studentId, (studentUsage.get(r.studentId) ?? 0) + (r.quotaUnitsConsumed || 0));
    }
  }

  const hardLockAdmissions = admissions.filter(
    (a) => a.reason === "quota" || a.reason === "quota_overrun_lock",
  );
  const lockedStudentIds = new Set(
    hardLockAdmissions.map((a) => a.studentId).filter((id): id is string => Boolean(id)),
  );

  const totalActiveStudents = Math.max(1, new Set([...studentUsage.keys(), ...lockedStudentIds]).size);
  const studentsHardLocked = lockedStudentIds.size;
  const hardLockRate = Number(((studentsHardLocked / totalActiveStudents) * 100).toFixed(1));

  // Early quota exhaustion check (<12:00 WIB / 05:00 UTC)
  const exhaustedEarly = new Set(hardLockAdmissions.filter(a => (a.occurredAt.getUTCHours() + 7) % 24 < 12).map(a => a.studentId).filter(Boolean)).size;
  const earlyShare = Number(((exhaustedEarly / totalActiveStudents) * 100).toFixed(1));
  const isEarlyExhaustionElevated = earlyShare >= 3.0;

  // Hourly distribution
  const hourlyCounts = new Array(24).fill(0);
  const countedStudents = new Set<string>();
  const firstLocks: RawAiAdmissionRecord[] = [];
  for (const a of [...hardLockAdmissions].sort((a,b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    if (!a.studentId || countedStudents.has(a.studentId)) continue;
    countedStudents.add(a.studentId);
    firstLocks.push(a);
    const wibHour = (a.occurredAt.getUTCHours() + 7) % 24;
    hourlyCounts[wibHour] += 1;
  }

  let runningCumulative = 0;
  const hourlyLocks = hourlyCounts.map((count, hour) => {
    runningCumulative += count;
    const hourLabel = `${String(hour).padStart(2, "0")}:00`;
    return {
      hour,
      hourLabel,
      lockCount: count,
      cumulativeLocks: runningCumulative,
    };
  });

  const hourlyCells = Array.from({length:24},(_,hour) => firstLocks.filter(a => (a.occurredAt.getUTCHours()+7)%24 === hour));
  const cumulativeCells = Array.from({length:24},(_,hour) => firstLocks.filter(a => (a.occurredAt.getUTCHours()+7)%24 <= hour));
  // Prefixes include the pre-noon and all-lock cohorts used by the displayed rates.
  const hourlySafe = partitionSafe([...requests,...firstLocks], [...hourlyCells,...cumulativeCells]);

  return {
    privacyState: "available",
    hourlyPrivacyState: hourlySafe ? "available" : "suppressed",
    capacityAvailable: allocatedDailyCapacity > 0,
    allocatedDailyUnits: allocatedDailyCapacity,
    consumedUnits,
    reservedUnits,
    overrunDebtUnits,
    availableUnits,
    consumedPercentage: consumedPct,
    reservedPercentage: reservedPct,
    availablePercentage: availablePct,
    studentsAtOrAbove80Percent: null,
    studentsAtOrAbove80PercentShare: null,
    studentsHardLocked: hourlySafe ? studentsHardLocked : 0,
    hardLockRate: hourlySafe ? hardLockRate : 0,
    earlyExhaustionAlert: {
      status: !allRows.length || !hourlySafe ? "unavailable" : isEarlyExhaustionElevated ? (earlyShare >= 6.0 ? "critical" : "elevated") : "normal",
      exhaustedBeforeNoonShare: hourlySafe ? earlyShare : 0,
      normalThresholdShare: 3.0,
      message: !allRows.length ? "Belum ada aktivitas penggunaan yang dapat diringkas." : !hourlySafe ? "Ringkasan disembunyikan untuk menjaga privasi siswa." : isEarlyExhaustionElevated
        ? `${earlyShare}% of active AI learners reached their hard quota before 12:00 WIB (Normal: <3%).`
        : "Early quota exhaustion is within normal operating limits (<3%).",
    },
    hourlyLocks: hourlySafe ? hourlyLocks : [],
  };
}

const USD_TO_IDR = 16_000;
const terminalRequest = (r: RawAiRequestRecord) => ["succeeded", "fallback", "failed"].includes(r.status);

function recordedCost(r: RawAiRequestRecord): number | null {
  if (!terminalRequest(r) || r.chargedProviderCostUsdMicros == null) return null;
  return Number(r.chargedProviderCostUsdMicros) / 1_000_000;
}

function coverageState(rows: RawAiRequestRecord[]): CostMetrics["state"] {
  const terminal = rows.filter(terminalRequest);
  const known = terminal.filter(r => recordedCost(r) !== null).length;
  return terminal.length === 0 || known === terminal.length ? "available" : known === 0 ? "unavailable" : "partial";
}

function databaseFreshness(now: Date, costState: CostMetrics["state"] = "unavailable", coverage = 100): FreshnessState {
  const asOf = now.toISOString();
  return {
    requests: { asOf, label: "Catatan penggunaan", state: "snapshot" },
    quota: { asOf, label: "Dihitung dari catatan penggunaan", state: "snapshot" },
    cost: { asOf, label: costState === "partial" ? `Biaya tercatat (${Math.round(coverage)}% cakupan)` : costState === "suppressed" ? "Disembunyikan untuk menjaga privasi" : costState === "available" ? "Berdasarkan biaya tercatat" : "Biaya belum tercatat", state: costState === "available" ? "snapshot" : costState },
    analytics: { asOf, label: "Dihitung saat data dimuat", state: "snapshot" },
  };
}

export function calculateCostMetrics(
  requests: RawAiRequestRecord[], monthlyBudgetIdr = 0,
  monthRequests: RawAiRequestRecord[] = requests,
  now = new Date(),
): CostMetrics {
  const terminal = requests.filter(terminalRequest);
  const monthStart = startOfWibMonth(now);
  const monthTerminal = monthRequests.filter(r => terminalRequest(r) && r.createdAt >= monthStart && r.createdAt <= now);
  const sumCost = (rows: RawAiRequestRecord[]) => rows.reduce((sum, r) => sum + (recordedCost(r) ?? 0), 0);
  const usdCost = sumCost(terminal);
  const monthUsd = sumCost(monthTerminal);
  const nextMonth = startOfNextWibMonth(now);
  const elapsed = now.getTime() - monthStart.getTime();
  const spendMtdIdr = Math.round(monthUsd * USD_TO_IDR);
  const projectedEomIdr = elapsed > 0 ? Math.round(monthUsd * USD_TO_IDR * (nextMonth.getTime() - monthStart.getTime()) / elapsed) : 0;
  const groups = VERA_CAPABILITIES.map(capability => ({ capability, rows: terminal.filter(r => r.featureKey === capability) }));
  // Suppress the complete partition when a small cohort could be inferred by subtraction.
  const otherRows = terminal.filter(r => !VERA_CAPABILITIES.some(capability => capability === r.featureKey));
  const unsafePartition = !partitionSafe(terminal, [...groups.map(g=>g.rows), otherRows]);
  const knownTokens = terminal.filter(r => r.inputTokens !== null && r.outputTokens !== null);
  const tokenCoverage = terminal.length ? knownTokens.length / terminal.length : 1;
  const costCoverage = terminal.length ? terminal.filter(r => recordedCost(r) !== null).length / terminal.length : 1;
  const metrics: CostMetrics = {
    state: coverageState(monthTerminal), rangeState: coverageState(terminal),
    monthCoveragePercentage: monthTerminal.length ? monthTerminal.filter(r => recordedCost(r) !== null).length / monthTerminal.length * 100 : 100,
    exchangeRateIdr: USD_TO_IDR, spendRangeIdr: Math.round(usdCost * USD_TO_IDR),
    spendMtdIdr, projectedEomIdr, monthlyBudgetIdr,
    projectedUtilizationShare: monthlyBudgetIdr > 0 ? Number((projectedEomIdr / monthlyBudgetIdr * 100).toFixed(1)) : 0,
    costByCapability: groups.map(({capability, rows}) => {
      const safe = !unsafePartition;
      const cost = safe ? sumCost(rows) : 0;
      const units = safe ? rows.reduce((sum, r) => sum + r.quotaUnitsConsumed, 0) : 0;
      return { capability, spendIdr: Math.round(cost * USD_TO_IDR), spendUsd: cost, quotaUnits: units,
        costPerUnitUsd: units ? cost / units : 0, share: safe && usdCost ? Number((cost / usdCost * 100).toFixed(1)) : 0,
        privacyState: safe ? "available" : "suppressed", costAvailable: safe && coverageState(rows) !== "unavailable" };
    }),
    tokenCoverage: {
      inputTokens: knownTokens.reduce((sum, r) => sum + r.inputTokens!, 0),
      outputTokens: knownTokens.reduce((sum, r) => sum + r.outputTokens!, 0),
      totalTokens: knownTokens.reduce((sum, r) => sum + r.inputTokens! + r.outputTokens!, 0),
      knownPercentage: tokenCoverage * 100, unavailablePercentage: (1 - tokenCoverage) * 100,
    },
    costCoverage: { knownPercentage: costCoverage * 100, estimatedCostUsd: usdCost },
  };
  if (!cohortSafe(monthTerminal)) {
    metrics.state = "suppressed";
    metrics.spendMtdIdr = 0;
    metrics.projectedEomIdr = 0;
    metrics.projectedUtilizationShare = 0;
    metrics.monthCoveragePercentage = 0;
  }
  if (!cohortSafe(terminal)) {
    metrics.rangeState = "suppressed";
    metrics.spendRangeIdr = 0;
    metrics.tokenCoverage = {inputTokens:0,outputTokens:0,totalTokens:0,knownPercentage:0,unavailablePercentage:0};
    metrics.costCoverage = {knownPercentage:0,estimatedCostUsd:0};
  }
  return metrics;
}

function incidentTaxonomy(input: AggregateComputationInput): VeraAiReliabilityDto["incidentTaxonomy"] {
  const result: VeraAiReliabilityDto["incidentTaxonomy"] = { admission: [], infrastructure: [], upstream: [], application: [] };
  const knownTypes: IncidentType[] = ["quota", "quota_overrun_lock", "burst", "concurrency", "redis_unavailable", "lease_failure", "queue_failure", "settlement_failure", "provider_timeout", "provider_rate_limit", "provider_5xx", "malformed_provider_response", "schema_validation", "context_pack_failure", "orchestration_failure"];
  const events = [...input.admissions.map(a => ({type:a.reason,studentId:a.studentId})), ...input.requests.filter(r => r.status === "failed" && r.errorCode).map(r => ({type:r.errorCode!,studentId:r.studentId}))];
  const total = input.requests.length + input.admissions.length;
  if (!partitionSafe([...input.requests,...input.admissions], observedCells(events,e=>e.type))) return result;
  for (const type of knownTypes) {
    const rows = events.filter(e => e.type === type);
    if (!rows.length || !partitionSafe([...input.requests,...input.admissions],[rows])) continue;
    const domain = classifyIncidentDomain(type);
    result[domain].push({ domain, type, label: type, count: rows.length, rate: total ? rows.length / total : 0,
      changePp: null, severity: "warning", privacySatisfied: true });
  }
  return result;
}

export function buildVeraAiOverviewDto(input: AggregateComputationInput): VeraAiOverviewDto {
  const { requests, admissions, previousRequests = [], now } = input;
  const rel = calculateReliabilityMetrics(requests, admissions);
  const quotaHealth = calculateQuotaHealth(requests, admissions, input.dailyAllocatedQuota);
  const cost = calculateCostMetrics(requests, input.monthlyBudgetIdr, input.monthRequests ?? requests, now);
  const distinct = (rows: RawAiRequestRecord[]) => new Set(rows.map(r => r.studentId).filter(Boolean)).size;
  const delta = (current: number, previous: number) => previous > 0 ? Number(((current - previous) / previous * 100).toFixed(1)) : null;
  const usage = buildVeraAiUsageDto(input);
  const safe = cohortSafe(requests);
  const previousSafe = cohortSafe(previousRequests) && partitionSafe([...requests,...previousRequests],[requests,previousRequests]);
  const timeCells = Array.from({length:6},(_,index) => requests.filter(r=>Math.floor(((r.createdAt.getUTCHours()+7)%24)/4)===index));
  const timeSafe = partitionSafe(requests,timeCells);
  const headline = (value: number, formatter?: (v:number)=>string, trendDelta?:number|null) => formatSemanticMetric(safe?"available":"suppressed",value,{formatter,trendDelta:previousSafe?trendDelta:null});
  return {
    systemStatus: "unavailable", // Request history cannot establish current infrastructure health.
    activePolicy: input.activePolicyVersion ? { bundleVersion: input.activePolicyVersion, activatedAt: input.activePolicyActivatedAt ?? "" } : null,
    freshness: databaseFreshness(now, cost.state, cost.monthCoveragePercentage),
    kpis: {
      requestsToday: headline(requests.length,v=>v.toLocaleString("id-ID"),delta(requests.length,previousRequests.length)),
      activeLearnersToday: headline(distinct(requests),v=>v.toLocaleString("id-ID"),delta(distinct(requests),distinct(previousRequests))),
      quotaConsumedToday: headline(quotaHealth.consumedUnits,v=>`${v.toLocaleString("id-ID")} kuota`),
      successRateToday: rel.executionSuccessRate,
      p95LatencyTodayMs: rel.p95LatencyMs,
      spendMtdIdr: formatSemanticMetric(cost.state, cost.spendMtdIdr, {coverage: cost.state === "partial" ? cost.monthCoveragePercentage / 100 : 1, formatter:v=>`Rp ${v.toLocaleString("id-ID")}`}),
    },
    timeSeriesPrivacyState: timeSafe ? "available" : "suppressed",
    requestsOverTime: !timeSafe ? [] : Array.from({length:6},(_,index) => {
      const rows = requests.filter(r=> Math.floor(((r.createdAt.getUTCHours()+7)%24)/4)===index);
      const timeLabel = `${String(index*4).padStart(2,"0")}:00`;
      return {timestamp:timeLabel,timeLabel,total:rows.length};
    }),
    quotaHealth,
    reliabilitySummary: {
      successRate: "value" in rel.executionSuccessRate ? rel.executionSuccessRate.value * 100 : null,
      fallbackRate: "value" in rel.fallbackRate ? rel.fallbackRate.value * 100 : null,
      p95LatencySec: "value" in rel.p95LatencyMs ? rel.p95LatencyMs.value / 1000 : null,
      p95TimeToFirstTokenSec: "value" in rel.p95TimeToFirstTokenMs ? rel.p95TimeToFirstTokenMs.value / 1000 : null,
    },
    featureUsageBreakdown: VERA_CAPABILITIES.map(capability => {
      const item=usage.items.find(i=>i.id===capability);
      return {capability,label:capability,quotaUnits:item?.quotaUnits??0,requests:item?.requests??0,sharePercentage:item?.sharePercentage??0,privacyState:usage.items.some(i=>i.privacyState==="suppressed")?"suppressed":item?.privacyState??"available"};
    }),
    openIncidents:Object.values(incidentTaxonomy(input)).flat(),
  };
}

export function buildVeraAiUsageDto(input: AggregateComputationInput, options?: {
  metric?: "quota_units" | "requests" | "tokens" | "cost";
  groupBy?: "feature" | "model" | "gateway" | "status";
  from?: string; to?: string; timezone?: string;
}): VeraAiUsageBreakdownDto {
  const metric=options?.metric??"quota_units", groupBy=options?.groupBy??"feature";
  const {requests,admissions,now}=input;
  const groups=new Map<string,RawAiRequestRecord[]>();
  for(const r of requests) {
    const id=(groupBy==="feature"?r.featureKey:groupBy==="model"?r.model:groupBy==="gateway"?r.gateway:r.status)??"unspecified";
    groups.set(id,[...(groups.get(id)??[]),r]);
  }
  const unsafe=!partitionSafe(requests,[...groups.values()]);
  const values=[...groups.entries()].map(([id,rows])=>({id,rows,units:rows.reduce((s,r)=>s+r.quotaUnitsConsumed,0),tokens:rows.reduce((s,r)=>s+(r.inputTokens??0)+(r.outputTokens??0),0),cost:rows.reduce((s,r)=>s+(recordedCost(r)??0),0)}));
  const value=(g:typeof values[number])=>metric==="quota_units"?g.units:metric==="requests"?g.rows.length:metric==="tokens"?g.tokens:g.cost;
  const total=values.reduce((s,g)=>s+value(g),0);
  const cost=calculateCostMetrics(requests,input.monthlyBudgetIdr,input.monthRequests??requests,now);
  return {
    range:{from:options?.from??startOfWibDay(now).toISOString(),to:options?.to??now.toISOString(),timezone:options?.timezone??"Asia/Jakarta"},
    freshness:databaseFreshness(now,cost.rangeState,cost.costCoverage.knownPercentage),metricSelected:metric,groupBySelected:groupBy,
    // Do not disclose which categories exist inside a suppressed partition.
    items:unsafe ? [{id:"suppressed",label:"Ringkasan penggunaan",requests:0,quotaUnits:0,tokens:0,costUsd:0,costAvailable:false,sharePercentage:0,privacyState:"suppressed",suppressionMessage:"Ringkasan disembunyikan untuk menjaga privasi siswa."}] : values.map(g=>({
      id:g.id,label:g.id,requests:g.rows.length,quotaUnits:g.units,tokens:g.tokens,
      costUsd:g.cost,costAvailable:coverageState(g.rows)!=="unavailable",
      sharePercentage:total?Number((value(g)/total*100).toFixed(1)):0,privacyState:"available",
    })),
    quotaHealth:calculateQuotaHealth(input.todayRequests??requests,input.todayAdmissions??admissions,input.dailyAllocatedQuota),cost,
  };
}

export function buildVeraAiReliabilityDto(input: AggregateComputationInput): VeraAiReliabilityDto {
  const {requests,admissions,now}=input;
  const count=(status:string)=>requests.filter(r=>r.status===status).length;
  const succeeded=count("succeeded"),fallback=count("fallback"),failed=count("failed");
  const safe=cohortSafe(requests)&&cohortSafe(admissions)&&partitionSafe(requests,observedCells(requests,r=>r.status))&&partitionSafe([...requests,...admissions],observedCells(admissions,a=>a.reason));
  const byReason:Record<RejectedReason,number>={quota:0,quota_overrun_lock:0,burst:0,concurrency:0};
  for(const a of admissions) if(Object.hasOwn(byReason,a.reason)) byReason[a.reason as RejectedReason]++;
  if(!safe) for(const reason of Object.keys(byReason) as RejectedReason[]) byReason[reason]=0;
  return {
    privacyState:safe?"available":"suppressed",
    range:{from:startOfWibDay(now).toISOString(),to:now.toISOString(),timezone:"Asia/Jakarta"},freshness:databaseFreshness(now),
    requestClassification:safe?{attemptedAdmissions:requests.length+admissions.length,admittedRequests:{total:requests.length,succeeded,fallback,failed},rejectedAdmissions:{total:admissions.length,byReason},terminalRequests:succeeded+fallback+failed}:{attemptedAdmissions:0,admittedRequests:{total:0,succeeded:0,fallback:0,failed:0},rejectedAdmissions:{total:0,byReason},terminalRequests:0},
    metrics:calculateReliabilityMetrics(requests,admissions),incidentTaxonomy:incidentTaxonomy(input),
  };
}

export function buildVeraAiProvidersDto(now: Date): VeraAiProvidersDto {
  const unavailable={asOf:now.toISOString(),label:"Pengukuran belum tersedia",state:"unavailable" as const};
  return {freshness:{requests:unavailable,quota:unavailable,cost:unavailable,analytics:unavailable},gateways:[],capacityHeadroom:null,capabilityRoutes:[]};
}
