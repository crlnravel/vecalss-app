import assert from "node:assert/strict";

import { buildAdminUsageDto } from "@/lib/admin/ai-usage/aggregate";
import { localDateToUtc, parseAdminUsageQuery, reportCost } from "@/lib/admin/ai-usage/validation";
import type {
  VeraAdminAdmissionDbRow,
  VeraAdminReportDbRow,
  VeraReportPolicy,
} from "@/lib/admin/ai-usage/types";

function expectThrows(action: () => unknown, message: string) {
  assert.throws(action, message);
}

function requestRow(index: number, status: VeraAdminReportDbRow["status"], createdAt = new Date("2026-08-20T03:00:00.000Z")): VeraAdminReportDbRow {
  return {
    id: `request-${index}`,
    studentId: `student-${index}`,
    createdAt,
    featureKey: "vera.chat",
    gateway: index === 5 ? null : "mock",
    upstreamProvider: "mock",
    model: index === 5 ? null : "mock",
    status,
    inputTokens: index === 0 ? null : 10,
    outputTokens: index === 0 ? null : 20,
    quotaUnitsReserved: 4,
    quotaUnitsConsumed: status === "pending" || status === "staged" ? 0 : 4,
    quotaOverrunUnits: index === 3 ? 2 : 0,
    tokenUsageState: index === 0 ? "unknown" : "known",
    usageAccountingState: index === 3 ? "overrun_debt" : "known",
    latencyMs: status === "pending" || status === "staged" ? null : 100 + index * 10,
    timeToFirstTokenMs: status === "pending" || status === "staged" ? null : 40 + index,
    settlementDeadlineAt: status === "pending" || status === "staged" ? new Date("2026-08-20T03:30:00.000Z") : null,
  };
}

function admissionRow(index: number, reason: VeraAdminAdmissionDbRow["reason"]): VeraAdminAdmissionDbRow {
  return {
    id: `admission-${index}`,
    studentId: `student-${index}`,
    occurredAt: new Date("2026-08-20T03:01:00.000Z"),
    featureKey: "vera.chat",
    gateway: "mock",
    upstreamProvider: "mock",
    model: "mock",
    reason,
  };
}

const fixedNow = new Date("2026-08-26T04:00:00.000Z");
const query = parseAdminUsageQuery(new URLSearchParams({
  from: "2026-08-20",
  to: "2026-08-21",
  timezone: "Asia/Jakarta",
  include: "dailyTrend,byFeature,byModel,byStatus,incidents,comparison",
}), fixedNow);

assert.equal(query.dayCount, 1);
assert.equal(reportCost(query.include), 10);
assert.equal(reportCost(new Set()), 1);
assert.equal(reportCost(new Set(["dailyTrend", "byFeature", "byModel", "byStatus", "incidents", "comparison"])), 10);

const nySpringStart = localDateToUtc("2024-03-10", "America/New_York");
const nySpringEnd = localDateToUtc("2024-03-11", "America/New_York");
assert.equal(nySpringEnd.getTime() - nySpringStart.getTime(), 23 * 60 * 60 * 1000, "spring DST day is 23 hours");
const nyFallStart = localDateToUtc("2024-11-03", "America/New_York");
const nyFallEnd = localDateToUtc("2024-11-04", "America/New_York");
assert.equal(nyFallEnd.getTime() - nyFallStart.getTime(), 25 * 60 * 60 * 1000, "fall DST day is 25 hours");

expectThrows(() => parseAdminUsageQuery(new URLSearchParams({ from: "2026-08-01", to: "2026-09-02" }), fixedNow), "31-day maximum");
expectThrows(() => parseAdminUsageQuery(new URLSearchParams({ from: "2026-08-01T00:00:00Z", to: "2026-08-02" }), fixedNow), "whole local dates only");
expectThrows(() => parseAdminUsageQuery(new URLSearchParams({ from: "2026-08-01", to: "2026-08-02", timezone: "Mars/Olympus" }), fixedNow), "IANA timezone allowlist");

const currentRequests = [
  requestRow(0, "succeeded"),
  requestRow(1, "succeeded"),
  requestRow(2, "fallback"),
  requestRow(3, "failed"),
  requestRow(4, "pending"),
  requestRow(5, "staged"),
];
const previousRequests = Array.from({ length: 6 }, (_, index) => requestRow(index, "succeeded", new Date("2026-08-19T03:00:00.000Z")));
const currentAdmissions = [
  admissionRow(0, "quota"),
  admissionRow(1, "quota"),
  admissionRow(2, "burst"),
  admissionRow(3, "concurrency"),
  admissionRow(4, "redis_unavailable"),
  admissionRow(5, "quota_overrun_lock"),
];
const policy: VeraReportPolicy = {
  bundleVersion: "vera-policy-test",
  effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
  reportConfig: { unitLimit: 60, requestLimit: 10, minimumGroupSize: 5, maxRangeDays: 31 },
};
const built = buildAdminUsageDto({
  query,
  sources: {
    requests: currentRequests,
    admissions: currentAdmissions,
    previousRequests,
    previousAdmissions: currentAdmissions,
    now: fixedNow,
    lastUpdatedAt: new Date("2026-08-26T03:59:00.000Z"),
  },
  policy,
  scheduledPolicy: null,
});

assert.equal(built.dto.summary.state, "ready");
assert.equal(built.dto.summary.rows[0]?.requests, 6, "pending and staged remain in headline request count");
assert.equal(built.dto.summary.rows[0]?.terminalRequests, 4, "terminal denominator excludes pending and staged");
assert.equal(built.dto.summary.rows[0]?.successRate, 2 / 4);
assert.equal(built.dto.summary.rows[0]?.promptTokens, 30, "null token usage is excluded rather than coerced to zero");
assert.equal(built.dto.summary.rows[0]?.unknownUsage, 1);
assert.equal(built.dto.summary.rows[0]?.overrunDebtUnits, 2);
assert.equal(built.dto.byFeature.state, "suppressed", "unsafe feature partition is suppressed with complement protection");
assert.equal(built.dto.incidents.state, "suppressed", "incident cohorts use the same k=5 complement rule");
assert.equal(built.dto.comparison.state, "suppressed", "current/previous comparison applies one union complement boundary");
assert.equal(built.dto.freshness.state, "fresh");
assert.equal(built.outcome, "suppressed");
assert.equal(JSON.stringify(built.dto).includes("request-"), false, "DTO must not contain request identifiers");
assert.equal(JSON.stringify(built.dto).includes("student-"), false, "DTO must not contain student identifiers");

// A daily trend with six affected students and one complement must not be
// widened into a ready/coarsened row. Repeat the same query to prove the
// suppression decision is deterministic and cannot be differenced into a
// hidden cohort value.
const trendQuery = parseAdminUsageQuery(new URLSearchParams({
  from: "2026-08-20",
  to: "2026-08-22",
  timezone: "Asia/Jakarta",
  include: "dailyTrend,comparison",
}), fixedNow);
const adversarialRows = Array.from({ length: 7 }, (_, index) => requestRow(index, "succeeded", new Date(index < 6 ? "2026-08-20T03:00:00.000Z" : "2026-08-21T03:00:00.000Z")));
const adversarialPrevious = Array.from({ length: 7 }, (_, index) => requestRow(index, "succeeded", new Date("2026-08-19T03:00:00.000Z")));
const adversarialSources = {
  requests: adversarialRows,
  admissions: [],
  previousRequests: adversarialPrevious,
  now: fixedNow,
  lastUpdatedAt: new Date("2026-08-26T03:59:00.000Z"),
};
const adversarialA = buildAdminUsageDto({ query: trendQuery, sources: adversarialSources, policy, scheduledPolicy: null });
const adversarialB = buildAdminUsageDto({ query: trendQuery, sources: adversarialSources, policy, scheduledPolicy: null });
assert.equal(adversarialA.dto.dailyTrend.state, "suppressed", "6-of-7 daily trend cannot coarsen around a one-student complement");
assert.equal(adversarialA.dto.comparison.state, "suppressed", "6-of-7 comparison cannot expose current/previous complements");
assert.deepEqual(adversarialB.dto, adversarialA.dto, "repeated adversarial queries must return the same suppression boundary");

console.log("vera admin usage unit checks passed");
