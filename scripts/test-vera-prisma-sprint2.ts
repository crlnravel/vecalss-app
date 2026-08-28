import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

import { VeraPrismaAdmissionService } from "../lib/vera-ai/admission-service";
import { readPrismaVeraRequestStatus } from "../lib/vera-ai/prisma-chat-orchestrator";
import { VeraPrismaChatOrchestrator } from "../lib/vera-ai/prisma-chat-orchestrator";
import { IORedisVeraLeaseStore, type VeraLeaseStore } from "../lib/vera-ai/redis-lease";
import { PrismaKmsEnvelopeKeyRegistry, EnvelopeService } from "../lib/vera-ai/envelope";
import { MockProviderAdapter } from "../lib/vera-ai/provider";
import { prepareContextPack } from "../lib/vera-ai/context-pack";

const SESSION_COOKIE_NAME = "vecalss_session";

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-4_000); });
  child.stderr?.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-4_000); });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`isolated Vera route server exited before readiness: ${output}`);
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The development server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`isolated Vera route server did not become ready: ${output}`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function assertLocalDisposable(connectionString: string): void {
  const parsed = new URL(connectionString);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "fixture runner refuses non-local databases");
  assert(parsed.pathname === "/vera_test" || parsed.pathname === "/vera_test/", "fixture runner requires database name vera_test");
  assert(process.env.VERA_DISPOSABLE_DB_ACK === "1", "set VERA_DISPOSABLE_DB_ACK=1 for the disposable database");
}

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString) throw new Error("Set VERA_DISPOSABLE_DATABASE_URL to an isolated localhost vera_test database.");
assertLocalDisposable(connectionString);
process.env.DATABASE_URL = connectionString;
const redisConnectionString = process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL;
if (!redisConnectionString) throw new Error("Set VERA_DISPOSABLE_REDIS_URL or REDIS_URL to isolated Redis 56379/15.");
const redisLocation = new URL(redisConnectionString);
assert(["127.0.0.1", "localhost"].includes(redisLocation.hostname), "fixture runner refuses non-local Redis");
assert.equal(redisLocation.port, "56379", "fixture runner requires isolated Redis port 56379");
assert.equal(redisLocation.pathname.replace(/\/$/u, ""), "/15", "fixture runner requires Redis database 15");

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });
const policyWriter = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const rootKey = Buffer.alloc(32, 7);
const envelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
const admission = new VeraPrismaAdmissionService(db, envelope);
const raceDb = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const raceEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(raceDb, () => rootKey));
const raceAdmission = new VeraPrismaAdmissionService(raceDb, raceEnvelope);
const provider = new MockProviderAdapter();
const leaseStore: VeraLeaseStore = new IORedisVeraLeaseStore(redisConnectionString);
const resolver = {
  async resolve(selection: { sourceType: "practice" | "material"; sourceId: string }) {
    return {
      sourceType: selection.sourceType,
      sourceId: selection.sourceId,
      title: "Disposable source",
      citationLabel: "Disposable source",
      citationKey: `src_${selection.sourceId}`,
      content: "Disposable released source content.",
    };
  },
};

const studentId = randomUUID();
const conversationId = randomUUID();
const sourceId = randomUUID();
const otherStudentId = randomUUID();
const studentToken = `vera-route-${randomUUID()}`;
const otherStudentToken = `vera-route-other-${randomUUID()}`;
const now = new Date();
const policyRow = await db.aiPolicyBundle.findFirst({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" } });
if (!policyRow) throw new Error("Vera policy seed is missing from the disposable database.");
// The policy-console migration intentionally rejects content/effectiveAt
// edits once a bundle is non-draft. Normalize this disposable fixture through
// the legal state transition first; production rows are never bypassed.
const competingPolicyRows = await db.aiPolicyBundle.findMany({
  where: { id: { not: policyRow.id }, state: { in: ["active", "scheduled"] } },
  select: { id: true },
});
for (const competing of competingPolicyRows) {
  await db.aiPolicyBundle.update({ where: { id: competing.id }, data: { state: "draft" } });
}
if (policyRow.state !== "draft") {
  await db.aiPolicyBundle.update({ where: { id: policyRow.id }, data: { state: "draft" } });
}
await db.aiPolicyBundle.update({
  where: { id: policyRow.id },
  data: { state: "active", effectiveAt: new Date(now.getTime() - 60_000) },
});
await db.user.create({ data: { id: studentId, email: `vera-prisma-${studentId}@example.test`, fullName: "Vera Prisma Fixture", passwordHash: "fixture" } });
await db.user.create({ data: { id: otherStudentId, email: `vera-prisma-other-${otherStudentId}@example.test`, fullName: "Vera Other Fixture", passwordHash: "fixture" } });
await db.studentProfile.create({ data: { userId: studentId, timezone: "Asia/Jakarta", dailyAiTokenLimit: 1 } });
await db.billingAccount.create({ data: { studentId, planCode: "pro", status: "trial" } });
await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "Prisma fixture" } });
await db.authSession.create({ data: { id: randomUUID(), userId: studentId, refreshTokenHash: hashToken(studentToken), status: "active", expiresAt: new Date(now.getTime() + 3_600_000), lastSeenAt: now } });
await db.authSession.create({ data: { id: randomUUID(), userId: otherStudentId, refreshTokenHash: hashToken(otherStudentToken), status: "active", expiresAt: new Date(now.getTime() + 3_600_000), lastSeenAt: now } });

const orchestrator = new VeraPrismaChatOrchestrator({
  db,
  admission,
  contextResolver: resolver,
  provider,
  envelope,
  leaseStore,
  hmacSecret: "vera-prisma-fixture-secret",
});
const raceOrchestrator = new VeraPrismaChatOrchestrator({
  db: raceDb,
  admission: raceAdmission,
  contextResolver: resolver,
  provider,
  envelope: raceEnvelope,
  leaseStore,
  hmacSecret: "vera-prisma-fixture-secret",
});

const baseInput = {
  studentId,
  conversationId,
  text: "Explain the disposable source.",
  selection: [{ sourceType: "material" as const, sourceId }],
};
let routeServer: ChildProcess | undefined;

try {
  const routeSupportSource = readFileSync(join(process.cwd(), "lib/vera-ai/route-support.ts"), "utf8");
  assert(routeSupportSource.includes("PrismaKmsEnvelopeKeyRegistry"), "production route does not wire the durable envelope registry");
  assert(!routeSupportSource.includes("InMemoryEnvelopeKeyRegistry"), "production route still wires the in-memory envelope registry");
  const firstClientRequestId = randomUUID();
  const firstResponse = await orchestrator.sse({ ...baseInput, clientRequestId: firstClientRequestId });
  if (firstResponse.headers.get("content-type") !== "text/event-stream; charset=utf-8") {
    throw new Error(`Prisma route rejected fixture request: ${await firstResponse.text()}`);
  }
  await firstResponse.text();
  const firstStatus = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId: firstClientRequestId }, { admission, envelope });
  assert(firstStatus?.state === "succeeded", "Prisma route did not durably finalize the request");
  assert(firstStatus.result?.text, "Prisma status did not return the persisted result DTO");

  const usageModule = await import("../lib/vera-ai/route-support");
  const usage = await usageModule.readVeraUsageDto(studentId, db);
  assert(Number(usage.usedQuotaUnits) > 0, "usage route did not read the durable quota ledger");
  assert(Number(usage.quotaLimitUnits) === 20_000, "usage route ignored BillingAccount plan mapping");

  const restartedEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
  const restartedStatus = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId: firstClientRequestId }, { admission: new VeraPrismaAdmissionService(db, restartedEnvelope), envelope: restartedEnvelope });
  assert(restartedStatus?.result?.text === firstStatus.result?.text, "persisted envelope was not decryptable after registry restart");

  const raceClientRequestId = randomUUID();
  const providerCallsBeforeRace = provider.calls.length;
  const raceResponses = await Promise.all([
    orchestrator.sse({ ...baseInput, clientRequestId: raceClientRequestId }),
    raceOrchestrator.sse({ ...baseInput, clientRequestId: raceClientRequestId }),
  ]);
  await Promise.all(raceResponses.map(async (response) => {
    if (response.headers.get("content-type") === "text/event-stream; charset=utf-8") await response.text();
    else await response.json();
  }));
  assert.equal(provider.calls.length - providerCallsBeforeRace, 1, "two-client admission race ran the provider more than once");

  const raceStatus = await readPrismaVeraRequestStatus(db, { studentId, conversationId, clientRequestId: raceClientRequestId }, { admission, envelope });
  assert(raceStatus?.state === "succeeded", "race winner did not reach terminal durable status");
  const raceRequestId = raceStatus?.requestId;
  assert(raceRequestId, "race winner request id missing");
  await Promise.all([
    admission.settleOverdueRequest({ requestId: raceRequestId, now: new Date(now.getTime() + 120_000), forceUnknown: true }),
    raceAdmission.settleOverdueRequest({ requestId: raceRequestId, now: new Date(now.getTime() + 120_000), forceUnknown: true }),
  ]);
  const finalizedCount = await db.aiUsageDaily.aggregate({ _sum: { finalizedRequestCount: true }, where: { studentId } });
  assert.equal(finalizedCount._sum.finalizedRequestCount, 2, "settlement race double-counted a terminal request");

  const routePort = 43_000 + Math.floor(Math.random() * 1_000);
  routeServer = spawn("pnpm", ["next", "dev", "--port", String(routePort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_BASE_URL: `http://127.0.0.1:${routePort}`,
      DATABASE_URL: connectionString,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      REDIS_URL: redisConnectionString,
      VERA_DISPOSABLE_REDIS_URL: redisConnectionString,
      VERA_DISPOSABLE_DB_ACK: "1",
      VERA_ENVELOPE_MASTER_KEY: rootKey.toString("base64url"),
      VERA_HTTP_ROUTE_TEST_MODE: "1",
      VERA_IDEMPOTENCY_HMAC_SECRET: "vera-http-route-fixture-secret",
      VERA_MOCK_PROVIDER_ENABLED: "true",
      VERA_LIVE_PROVIDER_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const routeBase = `http://127.0.0.1:${routePort}`;
  const requestRoute = `${routeBase}/api/vera-ai/conversations/${conversationId}/requests`;
  const studentCookie = `${SESSION_COOKIE_NAME}=${studentToken}`;
  const otherStudentCookie = `${SESSION_COOKIE_NAME}=${otherStudentToken}`;
  await waitForServer(routeServer, `${routeBase}/api/vera-ai/usage`);
  const routeRequestBody = { clientRequestId: randomUUID(), kind: "chat", text: "Actual HTTP route fixture.", sources: [], options: {} };

  const unauthenticatedPost = await fetch(requestRoute, { body: JSON.stringify(routeRequestBody), headers: { "content-type": "application/json" }, method: "POST" });
  assert.equal(unauthenticatedPost.status, 401, "POST route did not require auth");
  const invalidBody = await fetch(requestRoute, {
    body: JSON.stringify({ ...routeRequestBody, unexpected: true }),
    headers: { cookie: studentCookie, "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(invalidBody.status, 400, "POST route accepted an unknown body field");
  assert.equal((await invalidBody.json() as { error: string }).error, "invalid_request");
  const oversizedBody = await fetch(requestRoute, {
    body: JSON.stringify({ ...routeRequestBody, text: "x".repeat(40_001) }),
    headers: { cookie: studentCookie, "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(oversizedBody.status, 400, "POST route accepted an oversized text field");

  const httpPost = await fetch(requestRoute, {
    body: JSON.stringify(routeRequestBody),
    headers: { cookie: studentCookie, "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(httpPost.status, 200, "authenticated HTTP POST did not open SSE");
  assert(httpPost.headers.get("content-type")?.startsWith("text/event-stream"), "authenticated HTTP POST did not return SSE");
  const httpSse = await httpPost.text();
  assert(httpSse.includes("event: request.completed"), "HTTP SSE did not emit a terminal completion");

  const httpGet = await fetch(`${requestRoute}?clientRequestId=${encodeURIComponent(routeRequestBody.clientRequestId)}`, { headers: { cookie: studentCookie }, method: "GET" });
  assert.equal(httpGet.status, 200, "authenticated HTTP status GET failed");
  const httpStatus = await httpGet.json() as { state: string; result: { text: string } | null };
  assert.equal(httpStatus.state, "succeeded");
  assert(httpStatus.result?.text, "HTTP status GET omitted persisted result");

  const httpUsage = await fetch(`${routeBase}/api/vera-ai/usage`, { headers: { cookie: studentCookie }, method: "GET" });
  assert.equal(httpUsage.status, 200, "authenticated HTTP usage GET failed");
  const httpUsagePayload = await httpUsage.json() as Record<string, unknown>;
  assert(Number(httpUsagePayload.usedQuotaUnits) > 0, "HTTP usage GET omitted durable usage");
  assert.equal("prompt" in httpUsagePayload, false, "HTTP usage DTO leaked prompt content");

  const beforeHttpReplay = await db.aiUsageDaily.aggregate({ _sum: { acceptedRequestCount: true, finalizedRequestCount: true }, where: { studentId } });
  const httpReplay = await fetch(requestRoute, {
    body: JSON.stringify(routeRequestBody),
    headers: { cookie: studentCookie, "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(httpReplay.status, 200, "terminal HTTP replay did not return JSON 200");
  assert(httpReplay.headers.get("content-type")?.includes("application/json"), "terminal HTTP replay reopened SSE");
  const replayPayload = await httpReplay.json() as { state: string; result: unknown };
  assert.equal(replayPayload.state, "succeeded");
  const afterHttpReplay = await db.aiUsageDaily.aggregate({ _sum: { acceptedRequestCount: true, finalizedRequestCount: true }, where: { studentId } });
  assert.deepEqual(afterHttpReplay._sum, beforeHttpReplay._sum, "terminal HTTP replay changed durable accounting");

  const crossStudentGet = await fetch(`${requestRoute}?clientRequestId=${encodeURIComponent(routeRequestBody.clientRequestId)}`, { headers: { cookie: otherStudentCookie }, method: "GET" });
  assert.equal(crossStudentGet.status, 404, "cross-student status GET leaked request existence");
  assert.equal((await crossStudentGet.json() as { error: string }).error, "request_not_found");
  const unauthenticatedUsage = await fetch(`${routeBase}/api/vera-ai/usage`, { method: "GET" });
  assert.equal(unauthenticatedUsage.status, 401, "usage route did not require auth");

  const httpKey = await db.aiIdempotencyKey.findUnique({ where: { studentId_operation_clientRequestId: { studentId, operation: "ai_request", clientRequestId: routeRequestBody.clientRequestId } } });
  assert(httpKey, "HTTP request did not persist its idempotency key");
  await db.aiIdempotencyKey.update({ where: { id: httpKey.id }, data: { expiresAt: new Date(now.getTime() - 1_000) } });
  const expiredHttpReplay = await fetch(requestRoute, {
    body: JSON.stringify(routeRequestBody),
    headers: { cookie: studentCookie, "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(expiredHttpReplay.status, 409, "expired HTTP replay was mapped to 200");
  const expiredPayload = await expiredHttpReplay.json() as { state: string; errorCode: string };
  assert.equal(expiredPayload.state, "expired");
  assert.equal(expiredPayload.errorCode, "idempotency_key_expired");
  await stopServer(routeServer);
  routeServer = undefined;

  const stalePolicy = await admission.snapshotForStudentAt({ studentId, now, featureKey: "vera.chat" });
  const stalePack = await prepareContextPack({ selection: [], userText: "stale policy", policyVersion: stalePolicy.bundleVersion, promptTemplateHash: "p", toolSchemaHash: "t", systemPolicyHash: stalePolicy.policy.validationDigest }, resolver);
  const staleTask = await provider.prepare({ featureKey: "vera.chat", behaviorVersion: "1", taskBytes: stalePack.canonicalTaskBytes, contextTaskDigest: stalePack.contextTaskDigest, hardOutputQuotaUnits: stalePolicy.hardOutputQuotaUnits });
  const expiryClientRequestId = randomUUID();
  const expiryFingerprint = "stale-expiry-fingerprint";
  const expiryKey = await db.aiIdempotencyKey.create({
    data: {
      studentId,
      operation: "ai_request",
      clientRequestId: expiryClientRequestId,
      requestFingerprint: expiryFingerprint,
      fingerprintKeyVersion: "vera-fingerprint-v1",
      policyBundleVersion: stalePolicy.bundleVersion,
      retentionPolicyVersion: stalePolicy.bundleVersion,
      state: "rejected",
      rejectionClass: "transient",
      rejectionCode: "redis_unavailable",
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  let expiryWriterReadyResolve: (() => void) | undefined;
  const expiryWriterReady = new Promise<void>((resolve) => { expiryWriterReadyResolve = resolve; });
  const expiryChange = policyWriter.$transaction(async (tx) => {
    await tx.aiIdempotencyKey.update({ where: { id: expiryKey.id }, data: { expiresAt: new Date(now.getTime() - 1_000) } });
    expiryWriterReadyResolve?.();
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  await expiryWriterReady;
  await assert.rejects(
    () => admission.admitPreparedRequest({
      studentId,
      conversationId,
      clientRequestId: expiryClientRequestId,
      requestFingerprint: expiryFingerprint,
      featureKey: "vera.chat",
      text: "stale expiry",
      pack: stalePack,
      preparedProviderTask: staleTask,
      policy: stalePolicy,
      now: new Date(now.getTime() - 120_000),
    }),
    (error: unknown) => error instanceof Error && error.message === "idempotency_key_expired",
  );
  await expiryChange;
  assert.equal(await db.aiRequest.count({ where: { studentId, requestFingerprint: expiryFingerprint } }), 0, "concurrent expiry admitted a request using a stale caller clock");
  const changedQuotaConfig = { ...stalePolicy.policy.quotaConfig, defaultDailyLimit: 9_000 };
  let writerReadyResolve: (() => void) | undefined;
  const writerReady = new Promise<void>((resolve) => { writerReadyResolve = resolve; });
  const policyChange = policyWriter.$transaction(async (tx) => {
    // The production trigger rejects content edits on non-draft bundles. Keep
    // this concurrency fixture legal by moving the disposable row through
    // draft before changing its quota, then restore the active state before
    // releasing the writer lock. The admission transaction still observes a
    // complete active successor and must reject the stale captured snapshot.
    await tx.aiPolicyBundle.update({ where: { id: policyRow.id }, data: { state: "draft" } });
    await tx.aiPolicyBundle.update({ where: { id: policyRow.id }, data: { quotaConfig: changedQuotaConfig } });
    await tx.aiPolicyBundle.update({ where: { id: policyRow.id }, data: { state: "active" } });
    writerReadyResolve?.();
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  await writerReady;
  await assert.rejects(
    () => admission.admitPreparedRequest({
      studentId,
      conversationId,
      clientRequestId: randomUUID(),
      requestFingerprint: "stale-policy-fingerprint",
      featureKey: "vera.chat",
      text: "stale policy",
      pack: stalePack,
      preparedProviderTask: staleTask,
      policy: stalePolicy,
      now,
    }),
    (error: unknown) => error instanceof Error && error.message === "policy_changed",
  );
  await policyChange;
  const staleRows = await db.aiRequest.count({ where: { studentId, requestFingerprint: "stale-policy-fingerprint" } });
  assert.equal(staleRows, 0, "concurrent policy drift created an accepted request");

  console.log("PASS vera-prisma-sprint2: Prisma route POST/status/usage durable writes and restart decryptability");
  console.log("PASS vera-prisma-sprint2: actual HTTP route auth/body/privacy/replay/expired DTO assertions");
  console.log("PASS vera-prisma-sprint2: two-client admission race runs one provider and settlement CAS counts once");
  console.log("PASS vera-prisma-sprint2: in-transaction policy/clock/plan and stale-clock expiry revalidation reject before accepted rows");
} finally {
  if (routeServer) await stopServer(routeServer).catch(() => undefined);
  await db.$executeRaw`DELETE FROM auth_sessions WHERE user_id IN (${studentId}::uuid, ${otherStudentId}::uuid)`;
  const ownedEnvelopeMarkers = [conversationId, studentId];
  await db.aiEnvelopeKey.deleteMany({ where: { OR: ownedEnvelopeMarkers.map((marker) => ({ objectId: { contains: marker } })) } });
  await db.$executeRaw`DELETE FROM ai_requests WHERE student_id = ${studentId}::uuid`;
  await db.$executeRaw`DELETE FROM ai_idempotency_keys WHERE student_id = ${studentId}::uuid`;
  await db.$executeRaw`DELETE FROM ai_usage_daily WHERE student_id = ${studentId}::uuid`;
  await db.$executeRaw`DELETE FROM ai_messages WHERE conversation_id = ${conversationId}::uuid`;
  await db.$executeRaw`DELETE FROM ai_conversations WHERE id = ${conversationId}::uuid`;
  await db.$executeRaw`DELETE FROM billing_accounts WHERE student_id = ${studentId}::uuid`;
  await db.$executeRaw`DELETE FROM student_profiles WHERE user_id = ${studentId}::uuid`;
  await db.$executeRaw`DELETE FROM users WHERE id = ${studentId}::uuid`;
  await db.$executeRaw`DELETE FROM users WHERE id = ${otherStudentId}::uuid`;
  await db.aiPolicyBundle.update({ where: { id: policyRow.id }, data: { state: "draft" } });
  await db.aiPolicyBundle.update({ where: { id: policyRow.id }, data: { state: "scheduled", effectiveAt: new Date("2026-09-01T00:00:00+07:00"), quotaConfig: policyRow.quotaConfig as unknown as Prisma.InputJsonValue } });
  await policyWriter.$disconnect();
  await raceDb.$disconnect();
  await leaseStore.close?.();
  await db.$disconnect();
}
