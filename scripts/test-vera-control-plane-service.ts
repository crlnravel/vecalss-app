import assert from "node:assert/strict";
import type { PrismaClient } from "@/generated/prisma/client";
import { VeraAiControlPlaneService } from "@/lib/admin/ai/service";
import type { RawAiRequestRecord } from "@/lib/admin/ai/aggregators";

const now = new Date("2026-10-15T05:00:00Z");
const records: RawAiRequestRecord[] = ["2026-09-30T16:59:59Z", "2026-10-01T01:00:00Z", "2026-10-15T01:00:00Z"].flatMap((at, i) => Array.from({length:5},(_,student) => ({
  id: `private-request-${i}-${student}`, studentId: `private-student-${student}`, createdAt: new Date(at), featureKey: "vera.chat",
  gateway: "openrouter", upstreamProvider: null, model: null, status: "succeeded", inputTokens: 1, outputTokens: 1,
  quotaUnitsReserved: 1, quotaUnitsConsumed: 1, quotaOverrunUnits: 0, tokenUsageState: "known",
  latencyMs: 100, timeToFirstTokenMs: 10, chargedProviderCostUsdMicros: 200_000n,
})));
type Range = { gte: Date; lte?: Date; lt?: Date };
const source = {
  aiRequest: { findMany: async ({where}: {where: {createdAt: Range}}) => records.filter(r => r.createdAt >= where.createdAt.gte && (where.createdAt.lte ? r.createdAt <= where.createdAt.lte : r.createdAt < where.createdAt.lt!)) },
  aiAdmissionEvent: { findMany: async () => [] },
  aiPolicyBundle: { findFirst: async () => null },
} as unknown as PrismaClient;
const service = new VeraAiControlPlaneService(source, () => now);
const today = await service.getUsage();
const range = await service.getUsage({from:"2026-09-20T17:00:00Z",to:now.toISOString()});
assert.equal(today.cost.spendMtdIdr, 32_000);
assert.equal(range.cost.spendMtdIdr, 32_000, "selected range does not change month-to-date source");
assert.equal(today.cost.spendRangeIdr, 16_000);
assert.equal(range.cost.spendRangeIdr, 48_000);
assert.equal(today.range.from, "2026-10-14T17:00:00.000Z");
assert.equal(range.quotaHealth.consumedUnits, 5, "daily quota does not expand with the selected period");
const overview = await service.getOverview();
assert.equal(overview.kpis.spendMtdIdr.state, "available");
assert.equal("value" in overview.kpis.spendMtdIdr && overview.kpis.spendMtdIdr.value, 32_000);
assert.equal(overview.activePolicy, null);
assert.ok(!JSON.stringify(today).includes("private-student"));
assert.ok(!JSON.stringify(today).includes("private-request"));
await assert.rejects(service.getUsage({from:"invalid"}));
let clockReads = 0;
const crossing = new VeraAiControlPlaneService(source, () => new Date(clockReads++ === 0 ? "2026-10-31T16:59:59Z" : "2026-10-31T17:00:01Z"));
const snapshot = await crossing.getOverview();
assert.equal(clockReads, 1, "one timestamp owns query bounds, labels and monthly scope");
assert.equal(snapshot.freshness.requests.asOf, "2026-10-31T16:59:59.000Z");
console.log("Vera control-plane service range, month and daily-quota checks passed");
