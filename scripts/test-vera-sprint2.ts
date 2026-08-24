import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VeraAdmissionError,
  VeraAdmissionService,
} from "../lib/vera-ai/admission";
import { VeraChatOrchestrator } from "../lib/vera-ai/chat-orchestrator";
import { VeraContractError } from "../lib/vera-ai/contracts";
import { prepareContextPack, type VeraContextResolver } from "../lib/vera-ai/context-pack";
import { InMemoryVeraLeaseStore, IORedisVeraLeaseStore, VeraRedisUnavailableError } from "../lib/vera-ai/redis-lease";
import { MockProviderAdapter } from "../lib/vera-ai/provider";
import { defaultVeraPolicyBundle, resolveVeraQuotaLimit, snapshotVeraPolicy, type VeraPolicyBundle } from "../lib/vera-ai/policy";
import { quotaDateAndDayEnd, reserveQuota, settleQuota, type QuotaLedger } from "../lib/vera-ai/quota";
import { validateVeraResult } from "../lib/vera-ai/output-validator";

type TestCase = { name: string; run: () => Promise<void> | void };

const studentId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
const effectiveNow = new Date("2026-09-02T03:00:00.000Z");

const resolver: VeraContextResolver = {
  async resolve(selection) {
    return {
      sourceType: selection.sourceType as "material" | "practice",
      sourceId: selection.sourceId,
      title: "Released source",
      citationLabel: "Released source",
      citationKey: `src_${selection.sourceId}`,
      content: "Released server projection only.",
    };
  },
};

function policy(overrides: Partial<VeraPolicyBundle["quotaConfig"]> = {}): VeraPolicyBundle {
  const base = defaultVeraPolicyBundle();
  return {
    ...base,
    effectiveAt: new Date("2026-09-01T00:00:00+07:00"),
    quotaConfig: { ...base.quotaConfig, ...overrides },
  };
}

function input(clientRequestId: string = randomUUID(), text = "Explain this released source.") {
  return {
    studentId,
    conversationId,
    clientRequestId,
    text,
    selection: [{ sourceType: "material" as const, sourceId: "00000000-0000-4000-8000-000000000003" }],
    now: effectiveNow,
    billing: { planCode: "pro" },
    profileTimezone: "Asia/Jakarta",
    legacyDailyAiTokenLimit: 1,
  };
}

function makeService(options: Partial<ConstructorParameters<typeof VeraAdmissionService>[0]> = {}) {
  return new VeraAdmissionService({
    contextResolver: resolver,
    provider: new MockProviderAdapter(),
    policy: policy(),
    ...options,
  });
}

function baseLedger(overrides: Partial<QuotaLedger> = {}): QuotaLedger {
  return {
    usageDate: "2026-09-02",
    quotaLimitUnitsSnapshot: 10_000,
    usedQuotaUnits: 0,
    reservedQuotaUnits: 0,
    quotaDebtUnits: 0,
    quotaOverrunLockUntil: null,
    quotaTimezone: "Asia/Jakarta",
    quotaTimezonePolicyVersion: "vera-timezone-v1",
    acceptedRequestCount: 0,
    finalizedRequestCount: 0,
    ...overrides,
  };
}

const tests: TestCase[] = [
  {
    name: "replay-first matrix and concurrent absent-key loser",
    async run() {
      const provider = new MockProviderAdapter();
      const service = makeService({ provider });
      const request = input("same-key");
      const [first, second] = await Promise.all([service.admit(request), service.admit(request)]);
      assert.equal(first.kind, "accepted");
      assert.equal(second.kind, "replay");
      assert.equal(provider.calls.length, 0, "admit does not run provider before commit");
      assert.equal(service.requests.size, 1);
      const replay = await service.admit({ ...request, text: "changed payload" }).catch((error) => error);
      assert(replay instanceof VeraAdmissionError);
      assert.equal(replay.code, "idempotency_conflict");
      await service.runAccepted({ requestId: first.kind === "accepted" ? first.request.id : "" });
      assert.equal(provider.calls.length, 1);
      const terminalReplay = await service.admit(request);
      assert.equal(terminalReplay.kind, "replay");
      assert.equal(provider.calls.length, 1);
    },
  },
  {
    name: "pre-effective boundary and policy/plan mapping",
    async run() {
      const service = makeService();
      const before = await service.admit({ ...input("before"), now: new Date("2026-08-31T16:59:59.999Z") }).catch((error) => error);
      assert(before instanceof VeraAdmissionError);
      assert.equal(before.code, "vera_not_active");
      assert.equal(service.requests.size, 0);
      assert.equal(service.events.length, 0);
      assert.equal(resolveVeraQuotaLimit({ now: effectiveNow, billing: { planCode: "pro" }, studentLegacyDailyAiTokenLimit: 1 }).limitUnits, 20_000);
      assert.equal(resolveVeraQuotaLimit({ now: effectiveNow, billing: null, studentLegacyDailyAiTokenLimit: 999_999 }).limitUnits, 10_000);
      const snap = snapshotVeraPolicy({ policy: policy(), now: effectiveNow, billing: { planCode: "pro" }, timezone: "America/New_York" });
      assert.equal(snap.quotaLimitUnits, 20_000);
      assert.equal(snap.timezone, "America/New_York");
      assert.equal(snap.maxProviderAttempts, 2);
    },
  },
  {
    name: "context/prepare rejection has no admission event or accepted rows",
    async run() {
      const rejectResolver: VeraContextResolver = { async resolve() { throw new VeraContractError("context_release_unavailable", "not released", 410); } };
      const service = makeService({ contextResolver: rejectResolver });
      const result = await service.admit(input("context-reject"));
      assert.equal(result.kind, "rejected");
      assert.equal(service.events.length, 0);
      assert.equal(service.requests.size, 0);
      assert.equal(service.ledgers.size, 0);

      let contextCalls = 0;
      let providerCalls = 0;
      const redisRejectingProvider = new MockProviderAdapter();
      const originalPrepare = redisRejectingProvider.prepare.bind(redisRejectingProvider);
      redisRejectingProvider.prepare = async (...args: Parameters<MockProviderAdapter["prepare"]>) => {
        providerCalls += 1;
        return originalPrepare(...args);
      };
      const redisRejectingService = makeService({
        leaseStore: new InMemoryVeraLeaseStore({ reject: true }),
        contextResolver: {
          async resolve(selection) {
            contextCalls += 1;
            return resolver.resolve(selection);
          },
        },
        provider: redisRejectingProvider,
      });
      const redisRejected = await redisRejectingService.admit(input("redis-before-prepare"));
      assert.equal(redisRejected.kind, "rejected");
      assert.equal(redisRejectingService.events.at(-1)?.reason, "concurrency");
      assert.equal(contextCalls, 0, "Redis rejection must not resolve context");
      assert.equal(providerCalls, 0, "Redis rejection must not prepare provider");
    },
  },
  {
    name: "Redis fencing, atomic burst/concurrency and fault semantics",
    async run() {
      const store = new InMemoryVeraLeaseStore();
      const leaseInput = { studentId, featureKey: "vera.chat", maxConcurrent: 1, burstLimit: 2, burstWindowMs: 60_000, ttlMs: 10_000, now: effectiveNow };
      const first = await store.acquire(leaseInput);
      assert(first);
      const concurrencyRejection = await store.acquireWithReason?.(leaseInput);
      assert.equal(concurrencyRejection?.rejectionReason, "concurrency");
      assert.equal(await store.release(first), true);
      assert.equal(await store.release(first), true);
      const second = await store.acquire(leaseInput);
      assert(second);
      assert(second.fencingToken > first.fencingToken);
      assert.equal(await store.release(first), false);
      assert(await store.renew(second, 20_000, effectiveNow));
      assert.equal(await new InMemoryVeraLeaseStore({ unavailable: true }).acquire(leaseInput).catch(() => null), null);
      const burstStore = new InMemoryVeraLeaseStore();
      const burstInput = { ...leaseInput, maxConcurrent: 2, burstLimit: 1 };
      const burstFirst = await burstStore.acquire(burstInput);
      assert(burstFirst);
      const burstRejection = await burstStore.acquireWithReason?.(burstInput);
      assert.equal(burstRejection?.rejectionReason, "burst");
      await burstStore.release(burstFirst);
      const renewalFailure = makeService({ leaseStore: new InMemoryVeraLeaseStore({ renewalFailure: true }) });
      const rejected = await renewalFailure.admit(input("renewal-failure"));
      assert.equal(rejected.kind, "rejected");
      assert.equal(renewalFailure.events.at(-1)?.reason, "redis_unavailable");
      const releaseFailure = makeService({ leaseStore: new InMemoryVeraLeaseStore({ releaseFailure: true }) });
      const accepted = await releaseFailure.admit(input("release-failure"));
      assert.equal(accepted.kind, "accepted");
      const unavailable = new IORedisVeraLeaseStore("redis://127.0.0.1:6399");
      await assert.rejects(() => unavailable.acquire(leaseInput), (error: unknown) => error instanceof VeraRedisUnavailableError);
      await unavailable.close?.();
    },
  },
  {
    name: "quota formulas, unknown usage, overrun debt, accepted/finalized separation",
    run() {
      const reserved = reserveQuota(baseLedger(), 500, effectiveNow);
      assert.equal(reserved.ledger.reservedQuotaUnits, 500);
      assert.equal(reserved.ledger.acceptedRequestCount, 1);
      assert.equal(reserved.ledger.finalizedRequestCount, 0);
      const known = settleQuota(reserved.ledger, { reservedUnits: 500, actualUnits: 320, localDayEnd: new Date("2026-09-02T17:00:00Z") });
      assert.equal(known.ledger.usedQuotaUnits, 320);
      assert.equal(known.ledger.reservedQuotaUnits, 0);
      assert.equal(known.ledger.finalizedRequestCount, 1);
      const unknown = settleQuota(reserveQuota(baseLedger(), 500).ledger, { reservedUnits: 500, actualUnits: null, localDayEnd: new Date("2026-09-02T17:00:00Z") });
      assert.equal(unknown.settlementKind, "conservative_reservation");
      assert.equal(unknown.usageAccountingState, "unknown");
      const overrun = settleQuota(reserveQuota(baseLedger(), 500).ledger, { reservedUnits: 500, actualUnits: 12_000, localDayEnd: new Date("2026-09-02T17:00:00Z") });
      assert.equal(overrun.overrunUnits, 11_500);
      assert.equal(overrun.usageAccountingState, "overrun_debt");
      assert(overrun.ledger.quotaOverrunLockUntil);
    },
  },
  {
    name: "DST/profile timezone and selection digest invariants",
    run() {
      const before = quotaDateAndDayEnd(new Date("2026-03-08T06:59:00Z"), "America/New_York");
      const after = quotaDateAndDayEnd(new Date("2026-03-08T07:01:00Z"), "America/New_York");
      assert.equal(before.usageDate, "2026-03-08");
      assert.equal(after.usageDate, "2026-03-08");
      assert.equal(after.dayEnd.getTime() - new Date("2026-03-08T05:00:00Z").getTime(), 23 * 60 * 60_000);
      const first = prepareContextPack({ selection: [{ sourceType: "material", sourceId: "b" }, { sourceType: "material", sourceId: "a" }], userText: "x", policyVersion: "v", promptTemplateHash: "p", toolSchemaHash: "t", systemPolicyHash: "s" }, resolver);
      const second = prepareContextPack({ selection: [{ sourceType: "material", sourceId: "a" }, { sourceType: "material", sourceId: "b" }], userText: "x", policyVersion: "v", promptTemplateHash: "p", toolSchemaHash: "t", systemPolicyHash: "s" }, resolver);
      return Promise.all([first, second]).then(([one, two]) => assert.equal(one.selectionDigest, two.selectionDigest));
    },
  },
  {
    name: "stage uniqueness, callback rollback boundary and overdue unknown settlement",
    async run() {
      const service = makeService();
      const admitted = await service.admit(input("stage"));
      assert.equal(admitted.kind, "accepted");
      if (admitted.kind !== "accepted") return;
      const normalized = validateVeraResult({ text: "answer", usage: { inputTokens: 1, outputTokens: 2, quotaUnitsConsumed: 3, tokenUsageState: "known" }, allowedCitationKeys: [] });
      const stage = await service.stageResult({ requestId: admitted.request.id, result: normalized, now: effectiveNow });
      assert.equal((await service.stageResult({ requestId: admitted.request.id, result: normalized, now: effectiveNow })).id, stage.id);
      const conflict = validateVeraResult({ text: "different", usage: { inputTokens: 1, outputTokens: 2, quotaUnitsConsumed: 3, tokenUsageState: "known" }, allowedCitationKeys: [] });
      await assert.rejects(() => service.stageResult({ requestId: admitted.request.id, result: conflict, now: effectiveNow }), /stage_conflict/);
      await assert.rejects(() => service.finalizeAcceptedRequest({ requestId: admitted.request.id, persistDurableResult: async () => { throw new Error("crash window"); } }), /finalization_unavailable/);
      assert.equal(service.stages.get(stage.id)?.state, "available");
      await service.finalizeAcceptedRequest({ requestId: admitted.request.id });
      assert.equal(service.requests.get(admitted.request.id)?.lifecycleState, "succeeded");

      const admissionSource = readFileSync(join(process.cwd(), "lib/vera-ai/admission-service.ts"), "utf8");
      const stageStart = admissionSource.indexOf("async stageResult");
      const finalizerStart = admissionSource.indexOf("private async decodeStagedResult");
      assert(stageStart >= 0 && finalizerStart > stageStart, "Prisma stage boundary is not discoverable");
      const stageSource = admissionSource.slice(stageStart, finalizerStart);
      assert(!stageSource.includes("ai_usage_daily") && !stageSource.includes("aiUsageDaily"), "stageResult must not lock or mutate daily accounting");
      assert(admissionSource.includes("LOCK TABLE ai_policy_bundles IN SHARE MODE"), "admission transaction policy lock is missing");

      const overdue = await service.admit(input("overdue"));
      assert.equal(overdue.kind, "accepted");
      if (overdue.kind === "accepted") {
        await service.settleOverdueRequest({ requestId: overdue.request.id, now: new Date("2026-09-03T00:00:00Z"), forceUnknown: true });
        assert.equal(service.requests.get(overdue.request.id)?.errorCode, "missing_stage_unknown");
      }
    },
  },
  {
    name: "output safety and strict SSE replay",
    async run() {
      const sanitized = validateVeraResult({ text: "safe [^src_ok] [^invented]", usage: { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" }, allowedCitationKeys: ["src_ok"] });
      assert.equal(sanitized.citationKeys.join(","), "src_ok");
      assert(!sanitized.text?.includes("invented"));
      assert.throws(() => validateVeraResult({ text: "<script>x</script>", usage: { inputTokens: null, outputTokens: null, quotaUnitsConsumed: null, tokenUsageState: "unknown" }, allowedCitationKeys: [] }), /Raw HTML/);
      const provider = new MockProviderAdapter();
      const service = makeService({ provider });
      const orchestrator = new VeraChatOrchestrator(service);
      const result = await orchestrator.post(input("sse"));
      assert.equal(result.kind, "stream");
      if (result.kind !== "stream") return;
      assert.deepEqual(result.events.map((event) => event.event), ["request.started", "message.delta", "message.generated", "message.committed", "request.completed"]);
      assert.deepEqual(result.events.map((event) => event.id), [1, 2, 3, 4, 5]);
      assert.equal(provider.calls.length, 1);
      const replay = await orchestrator.post(input("sse"));
      assert.equal(replay.kind, "json");
      assert.equal(provider.calls.length, 1);
      const streamResponse = await orchestrator.sse(input("sse-stream"));
      assert.equal(streamResponse.headers.get("Content-Type"), "text/event-stream; charset=utf-8");
      const reader = streamResponse.body?.getReader();
      assert(reader);
      const firstChunk = await reader.read();
      assert.equal(firstChunk.done, false);
      assert(new TextDecoder().decode(firstChunk.value).includes("request.started"));
      let tail = "";
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        tail += new TextDecoder().decode(next.value);
      }
      assert(tail.includes("request.completed"));
      const replayResponse = await orchestrator.sse(input("sse-stream"));
      assert.equal(replayResponse.headers.get("Content-Type"), "application/json");
      assert.equal(provider.calls.length, 2);
    },
  },
];

let failures = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${test.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures > 0) process.exitCode = 1;
else console.log(`PASS vera sprint2 focused suite (${tests.length} cases)`);
