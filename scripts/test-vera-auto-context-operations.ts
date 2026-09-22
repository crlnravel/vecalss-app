import assert from "node:assert/strict";

import {
  aggregateVeraAutomaticTelemetry,
  automaticContextMustFailClosed,
  automaticContextTelemetryDigest,
  createVeraAutomaticTelemetryEvent,
  evaluateVeraAutomaticContextAlerts,
  evaluateVeraAutomaticContextGate,
  readVeraAutomaticContextRolloutConfig,
  stableVeraAutomaticContextBasisPoints,
} from "@/lib/vera-ai/automatic-context-operations";

const canary = {
  canaryVerifiedAt: "2026-09-20T00:00:00.000Z",
  canaryExpiresAt: "2026-10-20T00:00:00.000Z",
};

const base = {
  state: "cohort" as const,
  rolloutBasisPoints: 10_000,
  policyVersion: "vera-auto-v1",
  emergencyOff: false,
  internalStudentIds: [],
  providerCapabilityReady: true,
  capabilityEvidence: {
    functionToolsSupported: true,
    toolChoiceSupported: true,
    requireParametersSupported: true,
    serverToolsDisabled: true,
    pluginsDisabled: true,
    singleFunctionCallVerified: true,
    usageReconciled: true,
    costKnown: true,
    privacyZdrVerified: true,
    dataCollectionDenied: true,
  },
  ...canary,
};

assert.equal(stableVeraAutomaticContextBasisPoints("student-1", "vera-auto-v1"), stableVeraAutomaticContextBasisPoints("student-1", "vera-auto-v1"));
assert.equal(evaluateVeraAutomaticContextGate({ studentId: "student-1", config: base, now: new Date("2026-09-23T00:00:00.000Z") }).enabled, true);
assert.equal(evaluateVeraAutomaticContextGate({ studentId: "student-1", config: { ...base, emergencyOff: true }, now: new Date("2026-09-23T00:00:00.000Z") }).reason, "emergency_off");
assert.equal(evaluateVeraAutomaticContextGate({ studentId: "student-1", config: { ...base, providerCapabilityReady: false }, now: new Date("2026-09-23T00:00:00.000Z") }).reason, "provider_capability_unready");
assert.equal(evaluateVeraAutomaticContextGate({
  studentId: "student-1",
  config: { ...base, capabilityEvidence: { ...base.capabilityEvidence!, costKnown: false } },
  now: new Date("2026-09-23T00:00:00.000Z"),
}).reason, "capability_evidence_unready");
assert.equal(evaluateVeraAutomaticContextGate({ studentId: "student-1", config: base, isDevelopment: true }).reason, "development");
assert.equal(evaluateVeraAutomaticContextGate({ studentId: "student-1", config: { ...base, canaryExpiresAt: "2026-09-22T00:00:00.000Z" }, now: new Date("2026-09-23T00:00:00.000Z") }).reason, "canary_unavailable");

const events = Array.from({ length: 5 }, (_, index) => createVeraAutomaticTelemetryEvent({
  policyVersion: "vera-auto-v1",
  gateState: "cohort",
  outcome: index === 4 ? "no_match" : "completed",
  sourceCount: index === 4 ? 0 : 2,
  sourceKindCounts: { materi: 1, kuis: 1, tryout: 0 },
  selectorLatencyMs: 100 + index,
  registryLatencyMs: 200 + index,
  finalLatencyMs: 400 + index,
  totalLatencyMs: 800 + index,
  chargedUsdMicros: "1000",
  queryDigest: "a".repeat(64),
  resultDigest: "b".repeat(64),
}));
const aggregate = aggregateVeraAutomaticTelemetry(events);
assert.equal(aggregate.state, "ready");
assert.equal(aggregate.sampleCount, 5);
assert.equal(aggregate.noMatchCount, 1);
assert.equal(aggregate.totalLatencyP95Ms, 804);
assert.equal(aggregate.chargedUsdMicros, "5000");
assert.equal(automaticContextTelemetryDigest(events[0]).length, 64);
assert.doesNotMatch(JSON.stringify(aggregate), /student|query|sourceId|title|content/i);

const alerts = evaluateVeraAutomaticContextAlerts({
  providerCapabilityReady: false,
  canaryExpiresAt: "2026-09-22T00:00:00.000Z",
  now: new Date("2026-09-23T00:00:00.000Z"),
  aggregate: { ...aggregate, unknownUsageCount: 1, citationValidationFailures: 1, chargedUsdMicros: "9999" },
  spendLimitUsdMicros: 5000n,
});
assert.equal(automaticContextMustFailClosed(alerts), true);
const unknownCostAggregate = aggregateVeraAutomaticTelemetry([
  ...events.slice(0, 4),
  createVeraAutomaticTelemetryEvent({ policyVersion: "vera-auto-v1", gateState: "cohort", outcome: "completed", chargedUsdMicros: null }),
]);
assert.equal(unknownCostAggregate.unknownCostCount, 1);
const unknownCostAlerts = evaluateVeraAutomaticContextAlerts({
  providerCapabilityReady: true,
  capabilityEvidence: base.capabilityEvidence,
  canaryExpiresAt: canary.canaryExpiresAt,
  now: new Date("2026-09-23T00:00:00.000Z"),
  aggregate: unknownCostAggregate,
});
assert.equal(unknownCostAlerts.some((alert) => alert.code === "unknown_cost" && alert.failClosed), true);
assert.equal(automaticContextMustFailClosed(unknownCostAlerts), true);
assert.equal(readVeraAutomaticContextRolloutConfig({ VERA_AUTOMATIC_CONTEXT_EMERGENCY_OFF: "unexpected" }).emergencyOff, true);
assert.deepEqual(readVeraAutomaticContextRolloutConfig({ NODE_ENV: "production", VERA_AUTOMATIC_CONTEXT_STATE: "bad", VERA_AUTOMATIC_CONTEXT_ROLLOUT_BASIS_POINTS: "12000" }), {
  state: "off",
  rolloutBasisPoints: 10000,
  policyVersion: "vera-auto-context-off",
  emergencyOff: false,
  internalStudentIds: [],
  providerCapabilityReady: false,
  capabilityEvidence: {
    functionToolsSupported: false,
    toolChoiceSupported: false,
    requireParametersSupported: false,
    serverToolsDisabled: false,
    pluginsDisabled: false,
    singleFunctionCallVerified: false,
    usageReconciled: false,
    costKnown: false,
    privacyZdrVerified: false,
    dataCollectionDenied: false,
  },
  canaryVerifiedAt: null,
  canaryExpiresAt: null,
});

console.log("Vera automatic-context operations checks passed.");
