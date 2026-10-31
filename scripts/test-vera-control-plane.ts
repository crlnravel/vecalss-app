import assert from "node:assert/strict";
import { buildVeraAiOverviewDto, buildVeraAiProvidersDto, buildVeraAiReliabilityDto, buildVeraAiUsageDto, calculateQuotaHealth, type RawAiRequestRecord } from "@/lib/admin/ai/aggregators";
import { startOfWibDay, startOfWibMonth, startOfNextWibMonth } from "@/lib/admin/ai/periods";

const now = new Date("2026-10-15T05:00:00Z");
assert.equal(startOfWibDay(now).toISOString(), "2026-10-14T17:00:00.000Z");
assert.equal(startOfWibMonth(now).toISOString(), "2026-09-30T17:00:00.000Z");
assert.equal(startOfNextWibMonth(now).toISOString(), "2026-10-31T17:00:00.000Z");
const empty = { requests: [], admissions: [], now };
const overview = buildVeraAiOverviewDto(empty);
assert.equal(overview.kpis.requestsToday.state, "available");
assert.equal("value" in overview.kpis.requestsToday && overview.kpis.requestsToday.value, 0);
assert.equal("value" in overview.kpis.quotaConsumedToday && overview.kpis.quotaConsumedToday.value, 0);
assert.equal(overview.kpis.p95LatencyTodayMs.state, "unavailable");
assert.equal(overview.openIncidents.length, 0);
assert.equal(overview.freshness.requests.state, "snapshot");
assert.equal(overview.quotaHealth.earlyExhaustionAlert.status, "unavailable", "an empty cohort cannot establish a normal rate");
const reliability = buildVeraAiReliabilityDto(empty);
assert.equal(reliability.requestClassification.attemptedAdmissions, 0);
assert.equal(reliability.metrics.executionSuccessRate.state, "unavailable");
const providers = buildVeraAiProvidersDto(now);
assert.equal(providers.gateways.length, 0, "unmeasured health must not be invented");
assert.equal(providers.freshness.requests.state, "unavailable");
console.log("Vera control-plane zero and unavailable checks passed");

const request = (student: string, feature = "vera.chat", cost: bigint | null = 1_000_000n): RawAiRequestRecord => ({
  id: `request-${student}`, studentId: student, createdAt: now, featureKey: feature, gateway: "openrouter",
  upstreamProvider: null, model: null, status: "succeeded", inputTokens: 10, outputTokens: 20,
  quotaUnitsReserved: 1, quotaUnitsConsumed: 1, quotaOverrunUnits: 0, tokenUsageState: "known",
  latencyMs: 100, timeToFirstTokenMs: 50, chargedProviderCostUsdMicros: cost,
});
// Repeated requests by one learner do not meet a five-learner privacy boundary.
const privateRows = Array.from({length: 10}, () => request("only-learner"));
const privateOverview = buildVeraAiOverviewDto({...empty, requests: privateRows});
const chat = privateOverview.featureUsageBreakdown.find(x => x.capability === "vera.chat")!;
assert.equal(chat.privacyState, "suppressed");
assert.deepEqual([chat.requests,chat.quotaUnits,chat.sharePercentage],[0,0,0]);
assert.ok(privateOverview.featureUsageBreakdown.every(x => x.privacyState === "suppressed"), "partition shape must not reveal the only active feature");
assert.equal(privateOverview.kpis.requestsToday.state, "suppressed");
assert.equal(privateOverview.kpis.activeLearnersToday.state, "suppressed");
assert.equal(privateOverview.kpis.quotaConsumedToday.state, "suppressed");
assert.equal(privateOverview.kpis.spendMtdIdr.state, "suppressed");
assert.equal(privateOverview.timeSeriesPrivacyState, "suppressed");
assert.equal(privateOverview.requestsOverTime.length, 0);
assert.equal(privateOverview.quotaHealth.privacyState, "suppressed");
assert.equal(privateOverview.quotaHealth.consumedUnits, 0);
const privateReliability = buildVeraAiReliabilityDto({...empty, requests:privateRows});
assert.equal(privateReliability.privacyState, "suppressed");
assert.equal(privateReliability.requestClassification.terminalRequests, 0);
assert.equal(privateReliability.metrics.executionSuccessRate.state, "suppressed");
const usage = buildVeraAiUsageDto({...empty,requests:privateRows});
assert.deepEqual([usage.items[0].requests,usage.items[0].sharePercentage,usage.items[0].costUsd],[0,0,0]);
assert.equal(usage.cost.costByCapability[0].privacyState, "suppressed");
assert.equal(usage.cost.costByCapability[0].spendIdr, 0);
assert.equal(usage.items[0].id, "suppressed", "suppression must not expose the occupied category alongside a global total");

// Five chat users and one review user must not reveal the review cohort by subtraction.
const rows = Array.from({length:5},(_,i)=>request(`student-${i}`));
const mixed = buildVeraAiUsageDto({...empty,requests:[...rows,request("private","vera.review")]});
assert.ok(mixed.items.every(x => x.privacyState === "suppressed" && x.sharePercentage === 0));

// $5 in the selected range, $10 month-to-date: no extrapolation in either total.
const monthRows = [...rows,...rows.map(r=>({...r,createdAt:new Date("2026-10-01T03:00:00Z")}))];
const costs = buildVeraAiUsageDto({...empty,requests:rows,monthRequests:monthRows}).cost;
assert.equal(costs.spendRangeIdr, 80_000);
assert.equal(costs.spendMtdIdr, 160_000);
assert.equal(costs.projectedEomIdr, 342_069, "31-day October projection at noon on day 15 uses 14.5 elapsed days");
assert.equal(costs.costByCapability[0].privacyState, "suppressed", "a single feature cannot disclose the full cohort membership");
assert.equal(costs.costCoverage.knownPercentage, 100);
const longerRange = buildVeraAiUsageDto({...empty,requests:monthRows,monthRequests:monthRows}).cost;
assert.equal(longerRange.spendMtdIdr, costs.spendMtdIdr);
assert.equal(longerRange.spendRangeIdr, 160_000);
const crossing = buildVeraAiUsageDto({...empty,requests:monthRows,monthRequests:[...monthRows,request("outside","vera.chat",100_000_000n)].map((r,i)=>i===10?{...r,createdAt:new Date("2026-09-30T16:59:59Z")}:r)}).cost;
assert.equal(crossing.spendMtdIdr, 160_000, "previous-month costs cannot leak across the WIB month boundary");
const unknownRows = rows.map(r=>({...r,chargedProviderCostUsdMicros:null}));
const unknown = buildVeraAiUsageDto({...empty,requests:unknownRows,monthRequests:unknownRows});
assert.equal(unknown.cost.state, "unavailable");
const partial = buildVeraAiUsageDto({...empty, requests:rows.map((r,i)=>i===0?{...r,chargedProviderCostUsdMicros:null}:r)});
assert.equal(partial.freshness.cost.state, "partial");
assert.ok(partial.freshness.cost.label.includes("80%"));
const partitioned = [...rows,...rows.map((r,i)=>({...r,studentId:`review-${i}`,featureKey:"vera.review",chargedProviderCostUsdMicros:2_000_000n}))];
const allocation = buildVeraAiUsageDto({...empty,requests:partitioned}).cost.costByCapability;
assert.equal(allocation.find(x=>x.capability==="vera.chat")?.spendIdr, 80_000);
assert.equal(allocation.find(x=>x.capability==="vera.review")?.spendIdr, 160_000, "costs follow measured charges rather than equal quota shares");
const residual = buildVeraAiUsageDto({...empty,requests:[...partitioned,request("private-residual","unrecognized.feature")]}).cost;
assert.ok(residual.costByCapability.every(x=>x.privacyState==="suppressed"&&x.spendIdr===0), "unknown feature keys participate in complement suppression");
const lock = (studentId: string, hour: number) => ({id:`lock-${studentId}-${hour}`,studentId,occurredAt:new Date(`2026-10-15T${String(hour).padStart(2,"0")}:00:00Z`),featureKey:"vera.chat",gateway:null,upstreamProvider:null,model:null,reason:"quota"});
const admittedOne = calculateQuotaHealth([request("one-request")], Array.from({length:5},(_,i)=>lock(`admission-${i}`,0)));
assert.equal(admittedOne.privacyState, "suppressed", "a larger admission cohort cannot unmask a small request cohort");
const ten = Array.from({length:10},(_,i)=>request(`learner-${i}`));
const repeatedLocks = [...Array.from({length:5},(_,i)=>lock(`learner-${i}`,0)),...Array.from({length:4},(_,i)=>lock(`learner-${i}`,1)),lock("learner-5",1)];
const lockSummary = calculateQuotaHealth(ten,repeatedLocks);
assert.equal(lockSummary.hourlyPrivacyState, "suppressed", "privacy cells must use first-lock learners, matching the deduplicated chart");
const nearlyAllLocked = calculateQuotaHealth([...ten,request("one-unlocked")],Array.from({length:10},(_,i)=>lock(`learner-${i}`,i<5?0:1)));
assert.equal(nearlyAllLocked.hourlyPrivacyState,"suppressed","safe hourly bins must not expose a one-learner complement through their cumulative total");
assert.equal(nearlyAllLocked.studentsHardLocked,0);
assert.equal(nearlyAllLocked.hardLockRate,0);
assert.equal(nearlyAllLocked.earlyExhaustionAlert.exhaustedBeforeNoonShare,0);
assert.equal(nearlyAllLocked.hourlyLocks.length,0);
const timedRows = Array.from({length:20},(_,i)=>({...request(`timed-${i}`),createdAt:new Date(i<10?"2026-10-15T00:00:00Z":"2026-10-15T04:00:00Z"),status:i===0?"failed":"succeeded"}));
const timed = buildVeraAiOverviewDto({...empty,requests:timedRows});
assert.equal(timed.timeSeriesPrivacyState, "available");
assert.equal(timed.requestsOverTime.reduce((sum,slot)=>sum+slot.total,0),20);
assert.ok(timed.requestsOverTime.every(slot=>Object.keys(slot).sort().join(",")==="timeLabel,timestamp,total"), "safe time totals must not expose a one-learner status subcell");
const statuses = timedRows.map((r,i)=>({...r,status:i<10?"succeeded":"fallback"}));
const reasons = [...Array.from({length:5},(_,i)=>lock(`quota-${i}`,0)),...Array.from({length:5},(_,i)=>({...lock(`burst-${i}`,0),reason:"burst"})),{...lock("redis-private",0),reason:"redis_unavailable"}];
const residualReason = buildVeraAiReliabilityDto({...empty,requests:statuses,admissions:reasons});
assert.equal(residualReason.privacyState,"suppressed","all observed admission reasons participate in complementary suppression");
assert.equal(residualReason.requestClassification.rejectedAdmissions.total,0);
assert.equal(Object.values(residualReason.incidentTaxonomy).flat().length,0);
console.log("Vera control-plane privacy and cost-scope checks passed");
