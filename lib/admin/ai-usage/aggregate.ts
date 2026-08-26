import {
  VERA_REPORT_FEATURES,
  VERA_REPORT_INCIDENT_REASONS,
  VERA_REPORT_MIN_GROUP_SIZE,
  VERA_REPORT_MODELS,
  VERA_REPORT_STATUSES,
  type VeraAdminAdmissionDbRow,
  type VeraAdminUsageDto,
  type VeraAdminUsageQuery,
  type VeraAggregatePartition,
  type VeraAggregateRow,
  type VeraComparisonRow,
  type VeraIncidentRow,
  type VeraReportOutcomeState,
  type VeraReportPolicy,
} from "./types";
import { dateForDisplay } from "./validation";
import type { VeraAdminReportDbRow, VeraAdminUsageSources } from "./types";

type MetricRows = VeraAdminReportDbRow[];

const TERMINAL_STATUSES = new Set(["succeeded", "fallback", "failed"]);

function numericSum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? null;
}

function distinctStudents(rows: Array<{ studentId: string | null }>): Set<string> {
  return new Set(rows.map((row) => row.studentId).filter((studentId): studentId is string => Boolean(studentId)));
}

function safeCell(baseStudents: Set<string>, cellStudents: Set<string>, minimum = VERA_REPORT_MIN_GROUP_SIZE): boolean {
  return baseStudents.size >= minimum && cellStudents.size >= minimum && baseStudents.size - cellStudents.size >= minimum;
}

function summarySafe(baseStudents: Set<string>, minimum = VERA_REPORT_MIN_GROUP_SIZE): boolean {
  return baseStudents.size >= minimum;
}

function emptyMetrics(): VeraAggregateRow {
  return {
    requests: 0,
    terminalRequests: 0,
    succeeded: 0,
    fallback: 0,
    failed: 0,
    pending: 0,
    staged: 0,
    overdueRecovery: 0,
    activeStudents: null,
    successRate: null,
    quotaUnits: 0,
    reservedQuotaUnits: 0,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    unknownUsage: 0,
    overrunDebtUnits: 0,
    overrunRequests: 0,
    p50LatencyMs: null,
    p95LatencyMs: null,
    p50TimeToFirstTokenMs: null,
    p95TimeToFirstTokenMs: null,
  };
}

function aggregateMetrics(rows: MetricRows, now: Date, activeStudents: number | null): VeraAggregateRow {
  const metrics = emptyMetrics();
  metrics.requests = rows.length;
  metrics.terminalRequests = rows.filter((row) => TERMINAL_STATUSES.has(row.status)).length;
  metrics.succeeded = rows.filter((row) => row.status === "succeeded").length;
  metrics.fallback = rows.filter((row) => row.status === "fallback").length;
  metrics.failed = rows.filter((row) => row.status === "failed").length;
  metrics.pending = rows.filter((row) => row.status === "pending").length;
  metrics.staged = rows.filter((row) => row.status === "staged").length;
  metrics.overdueRecovery = rows.filter((row) =>
    (row.status === "pending" || row.status === "staged")
    && row.settlementDeadlineAt !== null
    && row.settlementDeadlineAt <= now,
  ).length;
  metrics.activeStudents = activeStudents;
  metrics.successRate = metrics.terminalRequests > 0
    ? Number((metrics.succeeded / metrics.terminalRequests).toFixed(4))
    : null;

  const terminal = rows.filter((row) => TERMINAL_STATUSES.has(row.status));
  metrics.quotaUnits = numericSum(terminal.map((row) => row.quotaUnitsConsumed));
  metrics.reservedQuotaUnits = numericSum(rows.filter((row) => row.status === "pending" || row.status === "staged").map((row) => row.quotaUnitsReserved));
  const promptValues = terminal.map((row) => row.inputTokens).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const completionValues = terminal.map((row) => row.outputTokens).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  metrics.promptTokens = promptValues.length > 0 ? numericSum(promptValues) : null;
  metrics.completionTokens = completionValues.length > 0 ? numericSum(completionValues) : null;
  metrics.totalTokens = metrics.promptTokens === null || metrics.completionTokens === null
    ? null
    : metrics.promptTokens + metrics.completionTokens;
  metrics.unknownUsage = terminal.filter((row) => row.tokenUsageState === "unknown" || row.usageAccountingState === "unknown").length;
  metrics.overrunDebtUnits = numericSum(rows.map((row) => row.quotaOverrunUnits));
  metrics.overrunRequests = rows.filter((row) => row.quotaOverrunUnits > 0 || row.usageAccountingState === "overrun_debt").length;
  const latencies = terminal.map((row) => row.latencyMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const firstTokens = terminal.map((row) => row.timeToFirstTokenMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  metrics.p50LatencyMs = percentile(latencies, 0.5);
  metrics.p95LatencyMs = percentile(latencies, 0.95);
  metrics.p50TimeToFirstTokenMs = percentile(firstTokens, 0.5);
  metrics.p95TimeToFirstTokenMs = percentile(firstTokens, 0.95);
  return metrics;
}

function matchesValue(value: string | null, filter: string): boolean {
  if (filter === "all") return true;
  const normalized = value?.trim() || "unknown";
  return normalized === filter;
}

export function filterRequestRows(rows: MetricRows, query: VeraAdminUsageQuery): MetricRows {
  return rows.filter((row) =>
    (query.feature === "all" || row.featureKey === query.feature)
    && matchesValue(row.gateway, query.gateway)
    && matchesValue(row.upstreamProvider, query.upstreamProvider)
    && matchesValue(row.model, query.model)
    && (query.status === "all" || row.status === query.status),
  );
}

export function filterAdmissionRows(rows: VeraAdminAdmissionDbRow[], query: VeraAdminUsageQuery): VeraAdminAdmissionDbRow[] {
  return rows.filter((row) =>
    (query.feature === "all" || row.featureKey === query.feature)
    && matchesValue(row.gateway, query.gateway)
    && matchesValue(row.upstreamProvider, query.upstreamProvider)
    && matchesValue(row.model, query.model),
  );
}

function suppressed<T>(): VeraAggregatePartition<T> {
  return { state: "suppressed", reason: "insufficient_data" };
}

function unavailable<T>(reason: string): VeraAggregatePartition<T> {
  return { state: "unavailable", reason };
}

function rowWithLabel(rows: MetricRows, label: string, now: Date, baseStudents: Set<string>): VeraAggregateRow {
  return { ...aggregateMetrics(rows, now, distinctStudents(rows).size), label, activeStudents: baseStudents.size };
}

function buildSummary(rows: MetricRows, now: Date): VeraAggregatePartition {
  const baseStudents = distinctStudents(rows);
  if (!summarySafe(baseStudents)) return suppressed();
  return { state: "ready", rows: [aggregateMetrics(rows, now, baseStudents.size)] };
}

function buildBreakdown(
  rows: MetricRows,
  now: Date,
  labels: readonly string[],
  valueFor: (row: VeraAdminReportDbRow) => string,
): VeraAggregatePartition {
  const baseStudents = distinctStudents(rows);
  const cells = labels.map((label) => {
    const cellRows = rows.filter((row) => valueFor(row) === label);
    return { label, rows: cellRows, students: distinctStudents(cellRows) };
  });
  if (!summarySafe(baseStudents) || cells.some((cell) => !safeCell(baseStudents, cell.students))) return suppressed();
  return {
    state: "ready",
    rows: cells.map((cell) => rowWithLabel(cell.rows, cell.label, now, cell.students)),
  };
}

function localDateRows(rows: MetricRows, query: VeraAdminUsageQuery): Array<{ date: string; rows: MetricRows; students: Set<string> }> {
  const byDate = new Map<string, MetricRows>();
  for (const row of rows) {
    const date = dateForDisplay(row.createdAt, query.timezone);
    const list = byDate.get(date) ?? [];
    list.push(row);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dateRows]) => ({ date, rows: dateRows, students: distinctStudents(dateRows) }));
}

function buildDailyTrend(rows: MetricRows, query: VeraAdminUsageQuery, now: Date): { partition: VeraAggregatePartition; coarsened: boolean } {
  const baseStudents = distinctStudents(rows);
  const days = localDateRows(rows, query);
  if (!summarySafe(baseStudents)) return { partition: suppressed(), coarsened: false };
  if (days.length === 0) {
    return { partition: { state: "ready", rows: [] }, coarsened: false };
  }
  if (days.every((day) => safeCell(baseStudents, day.students))) {
    return {
      partition: {
        state: "ready",
        rows: days.map((day) => ({ ...aggregateMetrics(day.rows, now, day.students.size), date: day.date })),
      },
      coarsened: false,
    };
  }

  // Keep the daily floor while coarsening unsafe cells into one bounded local
  // calendar range. A range label carries no hidden row count or value.
  const coarsenedStudents = distinctStudents(rows);
  if (!safeCell(baseStudents, coarsenedStudents) && baseStudents.size < VERA_REPORT_MIN_GROUP_SIZE) {
    return { partition: suppressed(), coarsened: false };
  }
  const dateRange = `${query.from}–${query.to}`;
  return {
    partition: { state: "ready", rows: [{ ...aggregateMetrics(rows, now, coarsenedStudents.size), date: dateRange }] },
    coarsened: true,
  };
}

function buildIncidents(rows: VeraAdminAdmissionDbRow[], requestRows: MetricRows, now: Date): VeraAggregatePartition<VeraIncidentRow> {
  const baseStudents = distinctStudents(rows);
  if (!summarySafe(baseStudents)) return suppressed();
  const requestBase = distinctStudents(requestRows);
  const incidentCells = VERA_REPORT_INCIDENT_REASONS.map((label) => {
    if (label === "provider_failure" || label === "fallback" || label === "overrun_debt" || label === "staged_recovery") {
      const cellRows = label === "provider_failure"
        ? requestRows.filter((row) => row.status === "failed")
        : label === "fallback"
          ? requestRows.filter((row) => row.status === "fallback")
          : label === "overrun_debt"
            ? requestRows.filter((row) => row.quotaOverrunUnits > 0 || row.usageAccountingState === "overrun_debt")
            : requestRows.filter((row) => (row.status === "pending" || row.status === "staged") && row.settlementDeadlineAt !== null && row.settlementDeadlineAt <= now);
      return { label, count: cellRows.length, students: distinctStudents(cellRows), source: "request" as const };
    }
    const cellRows = rows.filter((row) => row.reason === label);
    return { label, count: cellRows.length, students: distinctStudents(cellRows), source: "admission" as const };
  });
  if (incidentCells.some((cell) => {
    const population = cell.source === "request" ? requestBase : baseStudents;
    return !safeCell(population, cell.students);
  })) return suppressed();
  return {
    state: "ready",
    rows: incidentCells.map((cell) => ({ label: cell.label, count: cell.count, activeStudents: cell.students.size })),
  };
}

function buildComparison(current: MetricRows, previous: MetricRows, now: Date): VeraAggregatePartition<VeraComparisonRow> {
  const currentStudents = distinctStudents(current);
  const previousStudents = distinctStudents(previous);
  if (!summarySafe(currentStudents) || !summarySafe(previousStudents)) return suppressed();
  const currentMetrics = aggregateMetrics(current, now, currentStudents.size);
  const previousMetrics = aggregateMetrics(previous, now, previousStudents.size);
  return {
    state: "ready",
    rows: [{
      current: currentMetrics,
      previous: previousMetrics,
      delta: {
        requests: currentMetrics.requests - previousMetrics.requests,
        succeeded: currentMetrics.succeeded - previousMetrics.succeeded,
        fallback: currentMetrics.fallback - previousMetrics.fallback,
        failed: currentMetrics.failed - previousMetrics.failed,
        quotaUnits: currentMetrics.quotaUnits - previousMetrics.quotaUnits,
      },
    }],
  };
}

function selectedModel(row: VeraAdminReportDbRow): string {
  return row.model?.trim() || "unknown";
}

function policySummary(policy: VeraReportPolicy, scheduled: { bundleVersion: string; effectiveAt: Date } | null): VeraAdminUsageDto["policySummary"] {
  return {
    active: {
      bundleVersion: policy.bundleVersion,
      effectiveAt: policy.effectiveAt.toISOString(),
      allowlistedThresholds: policy.reportConfig,
    },
    scheduled: scheduled ? { bundleVersion: scheduled.bundleVersion, effectiveAt: scheduled.effectiveAt.toISOString() } : null,
  };
}

export function freshness(now: Date, lastUpdatedAt: Date | null): VeraAdminUsageDto["freshness"] {
  if (!lastUpdatedAt) return { state: "unavailable", asOf: null };
  const age = Math.max(0, now.getTime() - lastUpdatedAt.getTime());
  return {
    state: age <= 5 * 60_000 ? "fresh" : age <= 30 * 60_000 ? "stale" : "unavailable",
    asOf: lastUpdatedAt.toISOString(),
  };
}

export function buildAdminUsageDto(input: {
  query: VeraAdminUsageQuery;
  sources: VeraAdminUsageSources;
  policy: VeraReportPolicy;
  scheduledPolicy: { bundleVersion: string; effectiveAt: Date } | null;
}): { dto: VeraAdminUsageDto; outcome: VeraReportOutcomeState } {
  const { query, sources } = input;
  const currentRequests = filterRequestRows(sources.requests, query);
  const currentAdmissions = filterAdmissionRows(sources.admissions, query);
  const previousRequests = filterRequestRows(sources.previousRequests ?? [], query);
  const summary = buildSummary(currentRequests, sources.now);
  const daily: { partition: VeraAggregatePartition; coarsened: boolean } = query.include.has("dailyTrend") ? buildDailyTrend(currentRequests, query, sources.now) : { partition: unavailable<VeraAggregateRow>("not_requested"), coarsened: false };
  const byFeature: VeraAggregatePartition = query.include.has("byFeature")
    ? buildBreakdown(currentRequests, sources.now, VERA_REPORT_FEATURES, (row) => row.featureKey?.trim() || "")
    : unavailable<VeraAggregateRow>("not_requested");
  const byModel: VeraAggregatePartition = query.include.has("byModel")
    ? buildBreakdown(currentRequests, sources.now, [...VERA_REPORT_MODELS, "unknown"], selectedModel)
    : unavailable<VeraAggregateRow>("not_requested");
  const byStatus: VeraAggregatePartition = query.include.has("byStatus")
    ? buildBreakdown(currentRequests, sources.now, VERA_REPORT_STATUSES, (row) => row.status)
    : unavailable<VeraAggregateRow>("not_requested");
  const latency: VeraAggregatePartition = summary.state === "ready"
    ? { state: "ready" as const, rows: summary.rows }
    : summary;
  const incidents = query.include.has("incidents") ? buildIncidents(currentAdmissions, currentRequests, sources.now) : unavailable<VeraIncidentRow>("not_requested");
  const comparison = query.include.has("comparison")
    ? buildComparison(currentRequests, previousRequests, sources.now)
    : unavailable<VeraComparisonRow>("not_requested");
  const partitions = [summary, daily.partition, byFeature, byModel, byStatus, latency, incidents, comparison];
  const hasSuppressed = partitions.some((partition) => partition.state === "suppressed");
  const hasUnavailable = partitions.some((partition) => partition.state === "unavailable" && partition.reason !== "not_requested");
  const outcome: VeraReportOutcomeState = hasUnavailable
    ? "partial_unavailable"
    : hasSuppressed
      ? "suppressed"
      : daily.coarsened
        ? "coarsened"
        : "ready";
  return {
    dto: {
      range: { from: query.from, to: query.to, timezone: query.timezone },
      summary,
      dailyTrend: daily.partition,
      byFeature,
      byModel,
      byStatus,
      latency,
      incidents,
      comparison,
      policySummary: policySummary(input.policy, input.scheduledPolicy),
      freshness: freshness(sources.now, sources.lastUpdatedAt),
      lastUpdatedAt: sources.lastUpdatedAt?.toISOString() ?? null,
    },
    outcome,
  };
}

export { aggregateMetrics, distinctStudents, safeCell, summarySafe, emptyMetrics };
