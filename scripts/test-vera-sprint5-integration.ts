import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AiPolicyState,
  OnboardingStatus,
  PrismaClient,
  RoleName,
  SessionStatus,
} from "@/generated/prisma/client";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "../lib/vera-ai/envelope";
import { createVeraLifecycleService } from "../lib/vera-ai/lifecycle-service";

const root = process.cwd();
const databaseUrl = process.env.VERA_DISPOSABLE_DATABASE_URL;
const redisUrl = process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL;
const dbAck = process.env.VERA_DISPOSABLE_DB_ACK;
const liveProvider = process.env.VERA_LIVE_PROVIDER_ENABLED?.trim().toLowerCase();
const rootKey = Buffer.alloc(32, 41).toString("base64url");
const hmacSecret = "vera-sprint5-integration-secret";

function requireLocalDatabase(value: string): void {
  const parsed = new URL(value);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "integration refuses a non-local PostgreSQL host");
  assert.equal(parsed.pathname.replace(/\/$/u, ""), "/vera_test", "integration requires database vera_test");
  assert.equal(dbAck, "1", "set VERA_DISPOSABLE_DB_ACK=1 for the isolated database");
}

function requireLocalRedis(value: string): void {
  const parsed = new URL(value);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "integration refuses a non-local Redis host");
  assert.equal(parsed.pathname.replace(/\/$/u, ""), "/15", "integration requires Redis database 15");
  assert.equal(parsed.port, "56379", "integration requires the isolated Redis port 56379");
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function assertCurrentSprint5Migration(db: PrismaClient): Promise<void> {
  const migrationName = "20260827100000_add_vera_sprint5_lifecycle";
  const migrationSql = readFileSync(`${root}/prisma/migrations/${migrationName}/migration.sql`, "utf8");
  const expectedChecksum = createHash("sha256").update(migrationSql).digest("hex");
  const rows = await db.$queryRaw<Array<{ checksum: string }>>`
    SELECT checksum
    FROM "_prisma_migrations"
    WHERE migration_name = ${migrationName} AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `;
  assert.equal(rows[0]?.checksum, expectedChecksum, "isolated browser DB must apply the current Sprint 5 migration checksum");
  const correctionName = "20260828100000_retain_legal_export_metadata";
  const correctionSql = readFileSync(`${root}/prisma/migrations/${correctionName}/migration.sql`, "utf8");
  const expectedCorrectionChecksum = createHash("sha256").update(correctionSql).digest("hex");
  const correctionRows = await db.$queryRaw<Array<{ checksum: string }>>`
    SELECT checksum
    FROM "_prisma_migrations"
    WHERE migration_name = ${correctionName} AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `;
  assert.equal(correctionRows[0]?.checksum, expectedCorrectionChecksum, "isolated browser DB must apply the current legal-export metadata correction checksum");
  console.log(`T12_EVIDENCE migration=${migrationName} checksum=${expectedChecksum} correction=${correctionName} correctionChecksum=${expectedCorrectionChecksum} current=true isolated=true`);
}

function integrationEnv(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  if (!databaseUrl || !redisUrl) throw new Error("isolated PostgreSQL and Redis are required");
  return {
    ...process.env,
    ...extra,
    DATABASE_URL: databaseUrl,
    VERA_DISPOSABLE_DATABASE_URL: databaseUrl,
    VERA_DISPOSABLE_DB_ACK: "1",
    VERA_DISPOSABLE_REDIS_URL: redisUrl,
    REDIS_URL: redisUrl,
    VERA_ENVELOPE_MASTER_KEY: rootKey,
    VERA_IDEMPOTENCY_HMAC_SECRET: hmacSecret,
    VERA_MOCK_PROVIDER_ENABLED: "true",
    VERA_LIVE_PROVIDER_ENABLED: "false",
  };
}

function runEvidenceScript(script: string, markers: readonly string[]): string {
  const output = execFileSync("pnpm", [script], {
    cwd: root,
    env: integrationEnv(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  for (const marker of markers) assert(output.toLowerCase().includes(marker.toLowerCase()), `${script} is missing evidence marker ${marker}`);
  console.log(`T12_EVIDENCE executable=${script} status=pass`);
  return output;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (available: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(available);
    };
    socket.once("connect", () => finish(false));
    socket.once("error", () => finish(true));
  });
}

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-8_000); });
  child.stderr?.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-8_000); });
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`isolated Next server exited before readiness: ${output}`);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Next compiles route bundles lazily; continue polling the local server.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`isolated Next server did not become ready: ${output}`);
}

async function stopServer(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
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

type BrowserFixture = {
  adminId: string;
  adminToken: string;
  studentToken: string;
  studentId: string;
  conversationId: string;
  adminSessionId: string;
  studentSessionId: string;
  policyRows: Array<{ id: string; state: AiPolicyState; effectiveAt: Date; activatedAt: Date | null }>;
};

type BrowserLifecycleFixture = {
  exportIds: string[];
  operationIds: string[];
  idempotencyKeys: string[];
  conversationIds: string[];
  artifactIds: string[];
};

async function createBrowserFixture(db: PrismaClient): Promise<BrowserFixture> {
  const seed = await db.aiPolicyBundle.findFirstOrThrow({ where: { bundleVersion: "vera-policy-bundle-v1-2026-08-24" }, select: { id: true, state: true, effectiveAt: true, activatedAt: true } });
  const policyRows = await db.aiPolicyBundle.findMany({ where: { state: { in: [AiPolicyState.active, AiPolicyState.scheduled] } }, select: { id: true, state: true, effectiveAt: true, activatedAt: true } });
  if (!policyRows.some((row) => row.id === seed.id)) policyRows.push(seed);
  for (const row of policyRows) {
    if (row.state !== AiPolicyState.draft) await db.aiPolicyBundle.update({ where: { id: row.id }, data: { state: AiPolicyState.draft } });
  }
  // The production trigger intentionally rejects an effectiveAt edit in the
  // same statement that promotes a non-draft row. Normalize the disposable
  // fixture through draft first, then perform the legal state transition.
  await db.aiPolicyBundle.update({ where: { id: seed.id }, data: { effectiveAt: new Date(Date.now() - 60_000) } });
  await db.aiPolicyBundle.update({ where: { id: seed.id }, data: { state: AiPolicyState.active } });

  const studentId = randomUUID();
  const adminId = randomUUID();
  const conversationId = randomUUID();
  const adminToken = `vera-s5-browser-admin-${randomUUID()}`;
  const studentToken = `vera-s5-browser-student-${randomUUID()}`;
  const now = new Date();
  await db.user.create({ data: { id: adminId, email: `vera-s5-browser-admin-${adminId}@example.test`, fullName: "Vera browser admin", passwordHash: "fixture" } });
  await db.roleAssignment.create({ data: { userId: adminId, role: RoleName.admin } });
  await db.aiCapabilityGrant.createMany({ data: [
    { userId: adminId, capability: "canManageAiPolicy", isActive: true },
    { userId: adminId, capability: "canManageAiGovernance", isActive: true },
  ] });
  await db.user.create({ data: { id: studentId, email: `vera-s5-browser-${studentId}@example.test`, fullName: "Vera browser fixture", passwordHash: "fixture" } });
  await db.roleAssignment.create({ data: { userId: studentId, role: RoleName.student } });
  await db.studentProfile.create({ data: { userId: studentId, displayName: "Vera browser fixture", onboardingStatus: OnboardingStatus.completed, timezone: "Asia/Jakarta", dailyAiTokenLimit: 1 } });
  await db.billingAccount.create({ data: { studentId, planCode: "pro", status: "trial" } });
  await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "Browser evidence session" } });
  const adminSession = await db.authSession.create({ data: { id: randomUUID(), userId: adminId, refreshTokenHash: hashToken(adminToken), status: SessionStatus.active, expiresAt: new Date(now.getTime() + 3_600_000), lastSeenAt: now } });
  const studentSession = await db.authSession.create({ data: { id: randomUUID(), userId: studentId, refreshTokenHash: hashToken(studentToken), status: SessionStatus.active, expiresAt: new Date(now.getTime() + 3_600_000), lastSeenAt: now } });
  return { adminId, adminToken, studentToken, studentId, conversationId, adminSessionId: adminSession.id, studentSessionId: studentSession.id, policyRows };
}

async function runAdminHttpAndBrowser(db: PrismaClient): Promise<{ port: number; browserOutput: string }> {
  const fixture = await createBrowserFixture(db);
  const lifecycleFixture: BrowserLifecycleFixture = { exportIds: [], operationIds: [], idempotencyKeys: [], conversationIds: [], artifactIds: [] };
  let server: ChildProcess | undefined;
  let serverOutput = "";
  let port = 5023;
  try {
    if (!(await isPortAvailable(port))) {
      port = 5024;
      while (!(await isPortAvailable(port))) port += 1;
    }
    server = spawn("pnpm", ["next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: root,
      env: integrationEnv({ APP_BASE_URL: `http://127.0.0.1:${port}`, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "" }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => { serverOutput = `${serverOutput}${chunk.toString()}`.slice(-16_000); });
    server.stderr?.on("data", (chunk: Buffer) => { serverOutput = `${serverOutput}${chunk.toString()}`.slice(-16_000); });
    // Keep the browser origin aligned with the explicit local Next bind so the
    // development client bundle/HMR bootstrap is same-origin in ego.
    const base = `http://127.0.0.1:${port}`;
    const adminCookie = `vecalss_session=${fixture.adminToken}`;
    const studentCookie = `vecalss_session=${fixture.studentToken}`;
    await waitForServer(server, `${base}/api/admin/ai-usage`);

    const unauthenticatedPolicy = await fetch(`${base}/api/admin/ai-policy`);
    assert(unauthenticatedPolicy.url.includes("/login") || unauthenticatedPolicy.status === 401 || (unauthenticatedPolicy.status >= 300 && unauthenticatedPolicy.status < 400), "admin policy route must reject unauthenticated callers");
    const policyMetadata = await fetch(`${base}/api/admin/ai-policy`, { headers: { cookie: adminCookie } });
    assert.equal(policyMetadata.status, 200, "actual T10 metadata route did not authorize the isolated admin fixture");
    const metadataBody = await policyMetadata.json() as { metadata?: { capabilities?: string[]; providerGateState?: string } };
    assert(metadataBody.metadata?.capabilities, "T10 metadata DTO is missing capability union");
    const draftBody = { clientRequestId: `vera-s5-browser-draft-${randomUUID()}`, reason: "browser evidence draft" };
    const draftResponse = await fetch(`${base}/api/admin/ai-policy/drafts`, { method: "POST", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify(draftBody) });
    assert.equal(draftResponse.status, 200, "actual T10 draft route did not persist the isolated command");
    const draftPayload = await draftResponse.json() as { result?: { id?: string; state?: string } };
    assert.equal(draftPayload.result?.state, "draft", "T10 HTTP draft did not return a typed draft result");
    const draftReplay = await fetch(`${base}/api/admin/ai-policy/drafts`, { method: "POST", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify(draftBody) });
    assert.equal(draftReplay.status, 200, "same-key T10 HTTP replay did not return the durable winner");
    assert.equal((await draftReplay.json() as { result?: { id?: string } }).result?.id, draftPayload.result?.id, "same-key T10 replay changed command target");

    const reportKey = `vera-s5-browser-report-${randomUUID()}`;
    const report = await fetch(`${base}/api/admin/ai-usage?from=2026-08-20&to=2026-08-21&timezone=Asia%2FJakarta&include=dailyTrend%2CbyFeature%2CbyModel%2CbyStatus%2Cincidents%2Ccomparison`, { headers: { cookie: adminCookie, "Idempotency-Key": reportKey } });
    assert.equal(report.status, 200, "actual T9 usage route did not return its aggregate DTO");
    const reportBody = await report.json() as { range?: { from?: string; to?: string; timezone?: string }; incidents?: { state?: string }; byFeature?: { state?: string } };
    assert.equal(reportBody.range?.timezone, "Asia/Jakarta", "T9 HTTP DTO lost the requested IANA timezone");
    assert(reportBody.incidents && reportBody.byFeature, "T9 HTTP DTO omitted aggregate partitions");
    const reportReplay = await fetch(`${base}/api/admin/ai-usage?from=2026-08-20&to=2026-08-21&timezone=Asia%2FJakarta&include=dailyTrend%2CbyFeature%2CbyModel%2CbyStatus%2Cincidents%2Ccomparison`, { headers: { cookie: adminCookie, "Idempotency-Key": reportKey } });
    assert.equal(reportReplay.status, 200, "same-key T9 HTTP replay did not return JSON 200");
    assert.deepEqual(await reportReplay.json(), reportBody, "T9 HTTP replay changed the aggregate snapshot");
    const learnerConversations = await fetch(`${base}/api/vera-ai/conversations?limit=50`, { headers: { cookie: studentCookie } });
    const learnerConversationText = await learnerConversations.text();
    assert.equal(learnerConversations.status, 200, `learner conversation list route was not authorized (${learnerConversationText})`);
    const learnerConversationBody = JSON.parse(learnerConversationText) as { defaultConversationId?: string | null; conversations?: Array<{ id?: string }> };
    assert.equal(learnerConversationBody.defaultConversationId, fixture.conversationId, "browser learner fixture did not expose its owned conversation");
    assert(learnerConversationBody.conversations?.some((row) => row.id === fixture.conversationId), "browser learner fixture conversation is missing from the actual route");

    const lifecycleEnvelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.from(rootKey, "base64url")));
    const lifecycle = createVeraLifecycleService({ db, envelope: lifecycleEnvelope, fingerprintSecret: hmacSecret });
    const jsonBody = async <T>(response: Response): Promise<T> => JSON.parse(await response.text()) as T;
    const createHttpExport = async (idempotencyKey: string): Promise<{ exportId: string; operationId: string }> => {
      lifecycleFixture.idempotencyKeys.push(idempotencyKey);
      const response = await fetch(`${base}/api/vera-ai/exports`, {
        method: "POST",
        headers: { cookie: studentCookie, "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ format: "json_v1" }),
      });
      const bodyText = await response.text();
      assert.equal(response.status, 202, `actual export create route rejected the isolated student (${bodyText})`);
      const body = JSON.parse(bodyText) as { exportId?: string; operationId?: string; state?: string };
      assert.equal(body.state, "pending", "export create route must return pending before materialization");
      assert(body.exportId && body.operationId, "export create route omitted durable IDs");
      lifecycleFixture.exportIds.push(body.exportId);
      lifecycleFixture.operationIds.push(body.operationId);
      return { exportId: body.exportId, operationId: body.operationId };
    };

    const exportKey = `vera-s5-http-export-${randomUUID()}`;
    const exportTarget = await createHttpExport(exportKey);
    await lifecycle.materializeExport({ exportId: exportTarget.exportId, ownerId: "vera-s5-http-evidence-worker" });
    const exportStatusResponse = await fetch(`${base}/api/vera-ai/exports/${exportTarget.exportId}`, { headers: { cookie: studentCookie } });
    assert.equal(exportStatusResponse.status, 200, "actual export status route did not return the ready package");
    const exportStatus = await jsonBody<{ state?: string; accessMode?: string }>(exportStatusResponse);
    assert.equal(exportStatus.state, "ready");
    assert.equal(exportStatus.accessMode, "session");
    const exportDownloadResponse = await fetch(`${base}/api/vera-ai/exports/${exportTarget.exportId}/download`, { headers: { cookie: studentCookie } });
    assert.equal(exportDownloadResponse.status, 200, "actual export download route did not return the ready package");
    const exportPackage = JSON.parse(await exportDownloadResponse.text()) as { schemaVersion?: string; exportAsOf?: string };
    assert.equal(exportPackage.schemaVersion, "vera.export.v1");
    assert(typeof exportPackage.exportAsOf === "string", "export download omitted the frozen exportAsOf");

    const grantKey = `vera-s5-http-grant-${randomUUID()}`;
    const grantTarget = await createHttpExport(grantKey);
    await lifecycle.materializeExport({ exportId: grantTarget.exportId, ownerId: "vera-s5-http-grant-worker" });
    const rawGrant = `vera-s5-http-grant-token-${randomUUID()}`;
    const grantDigest = lifecycle.issueCleanupGrant(grantTarget.exportId, rawGrant).digest;
    await db.aiExportJob.update({ where: { id: grantTarget.exportId }, data: { exportAccessGrantDigest: grantDigest, exportAccessGrantState: "active", exportAccessGrantVersion: { increment: 1 } } });
    const grantStatusResponse = await fetch(`${base}/api/vera-ai/exports/${grantTarget.exportId}`, { headers: { "x-vera-export-grant": rawGrant } });
    assert.equal(grantStatusResponse.status, 200, "cleanup-grant status route did not authorize the isolated grant");
    const grantStatus = await jsonBody<{ accessMode?: string; exportAccessGrantState?: string }>(grantStatusResponse);
    assert.equal(grantStatus.accessMode, "cleanup_grant");
    assert.equal(grantStatus.exportAccessGrantState, "active");
    const grantDownloadResponse = await fetch(`${base}/api/vera-ai/exports/${grantTarget.exportId}/download`, { headers: { "x-vera-export-grant": rawGrant } });
    assert.equal(grantDownloadResponse.status, 200, "cleanup-grant download route did not return the package");
    const grantReplayResponse = await fetch(`${base}/api/vera-ai/exports/${grantTarget.exportId}/download`, { headers: { "x-vera-export-grant": rawGrant } });
    assert.equal(grantReplayResponse.status, 410, "a consumed cleanup grant must not be reusable");
    assert.equal((await jsonBody<{ error?: string }>(grantReplayResponse)).error, "export_access_consumed");

    // Keep a second isolated grant for the browser flow. The direct HTTP
    // assertion above intentionally consumes its grant to prove the one-shot
    // fence; reusing that same token would make the browser check observe the
    // already-terminal response instead of exercising the browser path.
    const browserGrantKey = `vera-s5-http-browser-grant-${randomUUID()}`;
    const browserGrantTarget = await createHttpExport(browserGrantKey);
    await lifecycle.materializeExport({ exportId: browserGrantTarget.exportId, ownerId: "vera-s5-http-browser-grant-worker" });
    const browserGrantToken = `vera-s5-http-browser-grant-token-${randomUUID()}`;
    const browserGrantDigest = lifecycle.issueCleanupGrant(browserGrantTarget.exportId, browserGrantToken).digest;
    await db.aiExportJob.update({ where: { id: browserGrantTarget.exportId }, data: { exportAccessGrantDigest: browserGrantDigest, exportAccessGrantState: "active", exportAccessGrantVersion: { increment: 1 } } });

    const expiredKey = `vera-s5-http-expired-${randomUUID()}`;
    const expiredTarget = await createHttpExport(expiredKey);
    await lifecycle.materializeExport({ exportId: expiredTarget.exportId, ownerId: "vera-s5-http-expiry-worker" });
    await db.aiExportJob.update({ where: { id: expiredTarget.exportId }, data: { downloadExpiresAt: new Date(Date.now() - 60_000) } });
    assert((await lifecycle.reapExports()) >= 1, "DB-clock reaper did not expire the disposable HTTP export");
    const expiredStatusResponse = await fetch(`${base}/api/vera-ai/exports/${expiredTarget.exportId}`, { headers: { cookie: studentCookie } });
    assert.equal(expiredStatusResponse.status, 200);
    assert.equal((await jsonBody<{ state?: string }>(expiredStatusResponse)).state, "expired");
    const expiredDownloadResponse = await fetch(`${base}/api/vera-ai/exports/${expiredTarget.exportId}/download`, { headers: { cookie: studentCookie } });
    assert.equal(expiredDownloadResponse.status, 410, "expired export download must return a typed terminal response");
    assert.equal((await jsonBody<{ error?: string }>(expiredDownloadResponse)).error, "export_expired");

    // Use an owned export that has crossed the account-detachment/purge
    // boundary for the learner stale-CAS branch.  This is a real persisted
    // target created by the authenticated route, then transitioned to the
    // content-free post-purge owner state; the browser must receive the same
    // privacy-safe target_unavailable response as it would after a worker
    // completed account cleanup, never a random UUID that proves nothing.
    const staleTarget = await createHttpExport(`vera-s5-http-stale-owned-${randomUUID()}`);
    await lifecycle.materializeExport({ exportId: staleTarget.exportId, ownerId: "vera-s5-http-stale-worker" });
    lifecycleFixture.exportIds.push(staleTarget.exportId);
    const staleAt = new Date();
    await db.aiExportJob.update({ where: { id: staleTarget.exportId }, data: { state: "expired", ownerState: "account_deleted", ownerReferenceDigest: hashToken(`vera-s5-stale-owner:${staleTarget.exportId}`), studentId: null, accountDeletedAt: staleAt, expiredAt: staleAt, terminalAt: staleAt, terminalRetentionExpiresAt: new Date(staleAt.getTime() + 90 * 24 * 60 * 60 * 1000), snapshotDigest: null, packageBytes: null, downloadReadyAt: null, downloadExpiresAt: null, exportAccessGrantState: "expired" } });
    const staleStatusResponse = await fetch(`${base}/api/vera-ai/exports/${staleTarget.exportId}`, { headers: { cookie: studentCookie } });
    assert.equal(staleStatusResponse.status, 404, "an owned post-purge export must not leak its detached lifecycle state to the learner");
    assert.equal((await jsonBody<{ error?: string }>(staleStatusResponse)).error, "target_unavailable");

    const deleteConversationId = randomUUID();
    lifecycleFixture.conversationIds.push(deleteConversationId);
    await db.aiConversation.create({ data: { id: deleteConversationId, studentId: fixture.studentId, conversationType: "vera_chat", title: "HTTP lifecycle delete fixture" } });
    const conversationDeleteKey = `vera-s5-http-conversation-delete-${randomUUID()}`;
    lifecycleFixture.idempotencyKeys.push(conversationDeleteKey);
    const conversationDeleteBody = JSON.stringify({ expectedVersion: 0 });
    const conversationDeleteResponse = await fetch(`${base}/api/vera-ai/conversations/${deleteConversationId}`, {
      method: "DELETE",
      headers: { cookie: studentCookie, "content-type": "application/json", "idempotency-key": conversationDeleteKey },
      body: conversationDeleteBody,
    });
    assert.equal(conversationDeleteResponse.status, 202, "actual conversation delete route did not accept the owner request");
    const conversationDelete = await jsonBody<{ operationId?: string; targetState?: string }>(conversationDeleteResponse);
    assert(conversationDelete.operationId, "conversation delete route omitted operationId");
    lifecycleFixture.operationIds.push(conversationDelete.operationId);
    assert.equal(conversationDelete.targetState, "deletion_pending");
    const conversationDeleteReplay = await fetch(`${base}/api/vera-ai/conversations/${deleteConversationId}`, {
      method: "DELETE",
      headers: { cookie: studentCookie, "content-type": "application/json", "idempotency-key": conversationDeleteKey },
      body: conversationDeleteBody,
    });
    assert.equal(conversationDeleteReplay.status, 200, "same-key conversation delete must replay JSON without a second worker");
    await lifecycle.processConversationDelete(conversationDelete.operationId);
    const conversationReconnectResponse = await fetch(`${base}/api/vera-ai/lifecycle/${conversationDelete.operationId}`, { headers: { cookie: studentCookie } });
    assert.equal(conversationReconnectResponse.status, 200, "lifecycle status route did not support reconnect after conversation deletion");
    assert.equal((await jsonBody<{ state?: string }>(conversationReconnectResponse)).state, "completed");

    const artifactId = randomUUID();
    lifecycleFixture.artifactIds.push(artifactId);
    const artifactPayload = JSON.stringify({ toolId: "route", title: "Lifecycle artifact", markdown: "Delete me", payload: { fixture: true } });
    const artifactDigest = hashToken(artifactPayload);
    const artifactTitle = await lifecycleEnvelope.encryptAsync("Lifecycle artifact", `vera-s5-http-artifact-title:${artifactId}`);
    const artifactMarkdown = await lifecycleEnvelope.encryptAsync("Delete me", `vera-s5-http-artifact-markdown:${artifactId}`);
    const artifactPayloadEnvelope = await lifecycleEnvelope.encryptAsync(artifactPayload, `vera-s5-http-artifact-payload:${artifactId}`);
    await db.aiArtifact.create({
      data: {
        id: artifactId,
        artifactKey: `vera.s5.http.lifecycle.${artifactId}`,
        revision: 1,
        studentId: fixture.studentId,
        conversationId: null,
        artifactType: "route",
        provenanceKind: "typed_entity",
        titleCiphertext: artifactTitle,
        contentMarkdownCiphertext: artifactMarkdown,
        payloadCiphertext: artifactPayloadEnvelope,
        artifactSchemaVersion: "1",
        sourceEntityType: "HttpLifecycleFixture",
        sourceEntityId: randomUUID(),
        sourceEntityRevision: 0,
        sourceEntityDigest: artifactDigest,
        contentDigest: artifactDigest,
        renderVersion: "vera-render-v1",
        retentionPolicyVersion: "vera-retention-v1",
        lifecycle: { create: { lifecycleRevision: 0 } },
      },
    });
    const artifactDeleteKey = `vera-s5-http-artifact-delete-${randomUUID()}`;
    lifecycleFixture.idempotencyKeys.push(artifactDeleteKey);
    const artifactDeleteResponse = await fetch(`${base}/api/vera-ai/artifacts/${artifactId}`, {
      method: "DELETE",
      headers: { cookie: studentCookie, "content-type": "application/json", "idempotency-key": artifactDeleteKey },
      body: JSON.stringify({ expectedLifecycleRevision: 0 }),
    });
    assert.equal(artifactDeleteResponse.status, 202, "actual artifact delete route did not accept the owner request");
    const artifactDelete = await jsonBody<{ operationId?: string; targetState?: string }>(artifactDeleteResponse);
    assert(artifactDelete.operationId, "artifact delete route omitted operationId");
    lifecycleFixture.operationIds.push(artifactDelete.operationId);
    assert.equal(artifactDelete.targetState, "deletion_pending");
    await lifecycle.processArtifactDelete(artifactDelete.operationId);
    const artifactReconnectResponse = await fetch(`${base}/api/vera-ai/lifecycle/${artifactDelete.operationId}`, { headers: { cookie: studentCookie } });
    assert.equal(artifactReconnectResponse.status, 200, "lifecycle status route did not support reconnect after artifact deletion");
    assert.equal((await jsonBody<{ state?: string }>(artifactReconnectResponse)).state, "completed");
    const learnerPageResponse = await fetch(`${base}/vera-ai`, {
      headers: { cookie: studentCookie },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const learnerPageText = await learnerPageResponse.text();
    assert.equal(learnerPageResponse.status, 200, `actual learner page route did not authorize the isolated student (${learnerPageResponse.status})`);
    assert(learnerPageText.includes("Studio"), "actual learner page response omitted the Studio surface");
    const httpEvidenceDigest = hashToken(JSON.stringify({
      learnerPageStatus: learnerPageResponse.status,
      learnerSurface: learnerPageText.includes("Studio"),
      policyMetadata: metadataBody.metadata?.capabilities,
      draftId: draftPayload.result?.id,
      reportTimezone: reportBody.range?.timezone,
      reportPartitions: Boolean(reportBody.incidents && reportBody.byFeature),
      exportState: exportStatus.state,
      exportDownloadStatus: exportDownloadResponse.status,
      grantState: grantStatus.exportAccessGrantState,
      expiredState: expiredStatusResponse.status,
      conversationDeleteOperation: conversationDelete.operationId,
      artifactDeleteOperation: artifactDelete.operationId,
    }));
    console.log(`T12_EVIDENCE learner_page actual=true http=GET authenticated=student digest=${httpEvidenceDigest} status=pass`);
    console.log(`T12_EVIDENCE http_export_lifecycle=POST+status+download+grant evidenceDigest=${httpEvidenceDigest} status=pass`);
    console.log(`T12_EVIDENCE http_conversation_delete=DELETE+status-reconnect worker=state-first evidenceDigest=${httpEvidenceDigest} status=pass`);
    console.log(`T12_EVIDENCE http_artifact_delete=DELETE+status-reconnect worker=state-first evidenceDigest=${httpEvidenceDigest} status=pass`);
    console.log(`T12_EVIDENCE actual_http=t9-report+t10-metadata+draft+replay lifecycle=export-create+status+download+grant+expiry+conversation-delete+artifact-delete+reconnect evidenceDigest=${httpEvidenceDigest} status=pass port=${port}`);

    const browserTaskName = `vera sprint5 isolated browser evidence ${randomUUID()}`;
    const browserSource = String.raw`
const task = await useOrCreateTaskSpace(${JSON.stringify(browserTaskName)})
const base = ${JSON.stringify(base)}
const adminToken = ${JSON.stringify(fixture.adminToken)}
const studentToken = ${JSON.stringify(fixture.studentToken)}
const readyExportId = ${JSON.stringify(exportTarget.exportId)}
const expiredExportId = ${JSON.stringify(expiredTarget.exportId)}
const staleExportId = ${JSON.stringify(staleTarget.exportId)}
const grantExportId = ${JSON.stringify(browserGrantTarget.exportId)}
const grantToken = ${JSON.stringify(browserGrantToken)}
const conversationOperationId = ${JSON.stringify(conversationDelete.operationId)}
const artifactOperationId = ${JSON.stringify(artifactDelete.operationId)}
async function session(token, path) {
  const targetUrl = base + path
  cliLog('BROWSER_SESSION start ' + path)
  // A fresh real tab keeps a previous Next/HMR navigation from blocking the
  // CDP document-readiness probe.  Open it before pruning the old tab so the
  // task space always retains one live tab (closing its last tab destroys the
  // ego task space).  The task space remains shared, while each page assertion
  // gets an isolated navigation and the same explicit cookie.
  const priorTabs = await listTabs()
  await openOrReuseTab('about:blank', { wait: true, timeout: 10 })
  const activeTab = await currentTab()
  for (const tab of priorTabs) {
    if (tab.targetId !== activeTab?.targetId) {
      try { await closeTab(tab.targetId) } catch {}
    }
  }
  await cdp('Network.deleteCookies', { name: 'vecalss_session', domain: '127.0.0.1' })
  await cdp('Network.setCookie', { name: 'vecalss_session', value: token, url: base })
  cliLog('BROWSER_SESSION navigate ' + path)
  const navigationTimeout = path === '/vera-ai' ? 90 : 30
  // Navigate from the cookie-bearing blank tab so the helper owns the target
  // page lifecycle; raw Page.navigate can leave a heavy React route in a
  // half-attached state even though the server is healthy.
  await openOrReuseTab(targetUrl, { wait: true, timeout: navigationTimeout })
  cliLog('BROWSER_SESSION settle ' + path)
  await new Promise((resolve) => setTimeout(resolve, path === '/vera-ai' ? 10_000 : 5_000))
  cliLog('BROWSER_SESSION ready ' + path)
}
async function browserJson(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (!headers.cookie && !headers['x-vera-export-grant']) headers.cookie = 'vecalss_session=' + studentToken
  const text = await serverFetch(base + path, { ...options, headers })
  let body = null
  try { body = JSON.parse(text) } catch {}
  // serverFetch deliberately exposes the actual response body only. HTTP
  // status assertions are made by the Node handler probes above; the browser
  // path proves the authenticated, typed DTO/reconnect interaction without a
  // fabricated status value.
  return { body }
}
async function visibleText(marker) {
  // Accessibility snapshots remain readable while a Next client bundle is
  // hydrating; a document Runtime.evaluate can transiently time out during a
  // route's initial compile and would otherwise make a real page look absent.
  const text = String(await snapshotText())
  return text.includes(marker) ? { marker, text: text.slice(0, 220) } : null
}
async function visibleControls() {
  return await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; return [...document.querySelectorAll("button,input,textarea,select,[role=tab],[role=status],[role=alert]")].filter(visible).map((node) => ({ tag: node.tagName, text: (node.textContent || "").trim().slice(0, 100), aria: node.getAttribute("aria-label"), role: node.getAttribute("role"), disabled: node.disabled === true || node.getAttribute("aria-disabled") === "true" })); })()')
}
async function assertVisiblePage(path, token, markers) {
  await session(token, path)
  cliLog('BROWSER_PAGE checking ' + path)
  let lastControls = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const missing = []
    for (const marker of markers) if (!(await visibleText(marker))) missing.push(marker)
    if (missing.length === 0) return
    cliLog('BROWSER_PAGE waiting ' + path + ' missing=' + missing.join(','))
    lastControls = await visibleControls()
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(path + ' missing visible control/content ' + markers.join(',') + ' controls=' + JSON.stringify(lastControls))
}
async function openStudio(requireComposer = true) {
  let pendingCancelIssued = false
  if (requireComposer) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const readiness = await js('(() => { const composer = document.querySelector("textarea[aria-label=\\"Pesan untuk Vera\\"]"); const rect = composer?.getBoundingClientRect(); return { activeConversation: Boolean(composer && !composer.disabled), composerVisible: Boolean(rect && rect.width > 0 && rect.height > 0), conversationOptions: document.querySelectorAll("#vera-mobile-conversation option").length }; })()')
      if (readiness.activeConversation && readiness.composerVisible) break
      const pending = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; return [...document.querySelectorAll("button[aria-label=\\"Batalkan permintaan\\"]")].some(visible); })()')
      if (pending && !pendingCancelIssued) {
        await click('button[aria-label="Batalkan permintaan"]', { label: 'cancel pending learner request' })
        pendingCancelIssued = true
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        continue
      }
      if (attempt === 8 && !pendingCancelIssued) {
        const clicked = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const node = [...document.querySelectorAll("button[aria-label=\\"Percakapan baru\\"]")].find(visible); if (!node) return false; node.click(); return true; })()')
        if (!clicked) throw new Error('learner browser fixture did not expose a visible new-conversation control: ' + JSON.stringify(readiness) + ' controls=' + JSON.stringify(await visibleControls()))
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  const existingTab = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const nodes = [...document.querySelectorAll("[data-slot=tabs-trigger]")].filter((node) => visible(node) && (node.textContent || "").trim() === "Studio"); const active = nodes.find((node) => node.hasAttribute("data-active") || node.getAttribute("aria-selected") === "true" || node.getAttribute("data-state") === "active"); return { visible: nodes.length, active: Boolean(active) }; })()')
  if (!existingTab.active) {
    const clicked = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const node = [...document.querySelectorAll("[data-slot=tabs-trigger]")].find((candidate) => visible(candidate) && (candidate.textContent || "").trim() === "Studio"); if (!node) return false; node.click(); return true; })()')
    if (!clicked) throw new Error('Studio tab is not visible in the learner workspace')
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  const tabState = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const tab = [...document.querySelectorAll("[data-slot=tabs-trigger]")].find((node) => visible(node) && (node.textContent || "").trim() === "Studio"); const panel = [...document.querySelectorAll("[data-slot=tabs-content]")].find((node) => visible(node) && node.hasAttribute("data-active")); return { selected: tab?.getAttribute("aria-selected"), state: tab?.getAttribute("data-state"), active: tab?.hasAttribute("data-active"), panelVisible: Boolean(panel) }; })()')
  if (!tabState.active && tabState.selected !== 'true' && tabState.state !== 'active') throw new Error('Studio tab did not become selected: ' + JSON.stringify(tabState))
  const labels = ['Analisis kelemahan', 'Rute belajar', 'Ulas soal', 'Strategi PTN', 'Ringkasan sesi', 'Drill adaptif']
  const unavailableLabels = []
  for (const label of labels) {
    if (!(await visibleText(label))) throw new Error('/vera-ai Studio missing visible tool ' + label + ' controls=' + JSON.stringify(await visibleControls()))
    const availability = await js('(() => { const wanted = ' + JSON.stringify(label) + '; const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const node = [...document.querySelectorAll("button")].find((candidate) => visible(candidate) && (candidate.textContent || "").trim() === wanted); return node ? { visible: true, enabled: !node.disabled } : { visible: false, enabled: false }; })()')
    if (!availability.visible) throw new Error('Studio tool button was not visible for ' + label + ' controls=' + JSON.stringify(await visibleControls()))
    if (!availability.enabled) {
      unavailableLabels.push(label)
      continue
    }
    const clicked = await js('(() => { const wanted = ' + JSON.stringify(label) + '; const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const node = [...document.querySelectorAll("button")].find((candidate) => visible(candidate) && !candidate.disabled && (candidate.textContent || "").trim() === wanted); if (!node) return false; node.click(); return true; })()')
    if (!clicked) throw new Error('Studio tool button was not enabled for ' + label + ' controls=' + JSON.stringify(await visibleControls()))
    await new Promise((resolve) => setTimeout(resolve, 350))
    const state = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const cancel = [...document.querySelectorAll("button[aria-label=\\"Batalkan permintaan\\"]")].find(visible); const status = [...document.querySelectorAll("[role=status],[role=alert]")].filter(visible).map((node) => ({ role: node.getAttribute("role"), text: (node.textContent || "").trim().slice(0, 180), ariaLive: node.getAttribute("aria-live") })); return { cancelVisible: Boolean(cancel), status }; })()')
    if (state.cancelVisible) {
      await click('button[aria-label="Batalkan permintaan"]', { label: 'cancel Studio request' })
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    if (!state.cancelVisible && !state.status.length) throw new Error('Studio tool click produced no bounded progress/error state for ' + label + ' state=' + JSON.stringify(state) + ' controls=' + JSON.stringify(await visibleControls()))
  }
  if (unavailableLabels.length > 0) {
    const status = await js('(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((node) => (node.textContent || "").trim()).filter(Boolean))()')
    if (!status.length && !pendingCancelIssued) throw new Error('Studio disabled tools had no bounded unavailable/cancelled status: ' + unavailableLabels.join(', '))
    cliLog('BROWSER_STUDIO unavailable=' + unavailableLabels.join('+') + ' provider=mock-disabled status=bounded')
  }
  if (!requireComposer) {
    cliLog('BROWSER_STUDIO chat-tab=hidden while studio-selected provider=mock-disabled status=bounded')
    return
  }
  const composer = await js('(() => { const node = document.querySelector("textarea[aria-label=\\"Pesan untuk Vera\\"]"); if (!node) return null; const rect = node.getBoundingClientRect(); return { visible: rect.width > 0 && rect.height > 0, disabled: node.disabled === true }; })()')
  if (!composer?.visible) throw new Error('Vera chat composer is not visible in Studio')
  if (composer.disabled) {
    cliLog('BROWSER_STUDIO chat=unavailable provider=mock-disabled status=bounded')
    return
  }
  await fillInput('textarea[aria-label="Pesan untuk Vera"]', 'Browser lifecycle probe')
  await click('button[aria-label="Kirim pesan"]', { label: 'send chat probe' })
  await new Promise((resolve) => setTimeout(resolve, 350))
  const cancel = await js('(() => [...document.querySelectorAll("button[aria-label=\\"Batalkan permintaan\\"]")].some((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }))()')
  if (cancel) await click('button[aria-label="Batalkan permintaan"]', { label: 'cancel chat probe' })
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
// Open the learner workspace before the heavier admin/report interactions so
// its initial bundle and hydration are independently observable in the real
// browser rather than competing with an in-flight admin route.
await assertVisiblePage('/vera-ai', studentToken, ['Studio'])
await openStudio()
cliLog('BROWSER_DESKTOP learner=studio six-studio-tools=visible')
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
const lifecyclePanel = await js('(() => { const panel = document.querySelector("[data-vera-lifecycle-panel]"); const status = panel?.querySelector("[role=status]"); return { panelVisible: Boolean(panel && panel.getBoundingClientRect().width > 0), statusLive: status?.getAttribute("aria-live"), statusText: (status?.textContent || "").trim() }; })()')
if (!lifecyclePanel.panelVisible || lifecyclePanel.statusLive !== 'polite') throw new Error('learner lifecycle panel did not expose a visible polite live region: ' + JSON.stringify(lifecyclePanel))
await js('document.querySelector("[data-vera-lifecycle-panel]")?.scrollIntoView({ block: "center", behavior: "auto" })')
for (let attempt = 0; attempt < 8; attempt += 1) {
  const panelViewport = await js('(() => { const node = document.querySelector("[data-vera-lifecycle-panel]"); const rect = node?.getBoundingClientRect(); return { top: rect?.top ?? -1, bottom: rect?.bottom ?? -1, height: window.innerHeight }; })()')
  if (panelViewport.top >= 0 && panelViewport.bottom <= panelViewport.height) break
  // The lifecycle panel lives below the flex workspace.  DOM scrolling keeps
  // the probe deterministic when the page is busy with Studio hydration;
  // the control interaction below is still a real viewport pointer click.
  await scrollBy(900)
}
const createExportButton = await js('(() => { const panel = document.querySelector("[data-vera-lifecycle-panel]"); const node = [...(panel?.querySelectorAll("button") || [])].find((candidate) => (candidate.textContent || "").trim() === "Buat ekspor data"); if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.textContent?.trim() || null }; })()')
if (!createExportButton || createExportButton.width <= 0 || createExportButton.height <= 0) throw new Error('learner export create control was not pointer-visible: ' + JSON.stringify(createExportButton))
cliLog('BROWSER_LIFECYCLE_UI pointer-target=' + JSON.stringify(createExportButton))
await click([createExportButton.x + createExportButton.width / 2, createExportButton.y + createExportButton.height / 2], { label: 'create learner export from lifecycle panel' })
let exportUiState = null
for (let attempt = 0; attempt < 12; attempt += 1) {
  exportUiState = await js('(() => { const panel = document.querySelector("[data-vera-lifecycle-panel]"); const status = panel?.querySelector("[role=status]"); const error = [...(panel?.parentElement?.querySelectorAll("[role=alert]") || [])].map((node) => (node.textContent || "").trim()).filter(Boolean); const buttons = [...(panel?.querySelectorAll("button") || [])].map((node) => ({ text: (node.textContent || "").trim(), disabled: node.disabled })); return { text: (status?.textContent || "").trim(), error, buttons }; })()')
  if (exportUiState.text.includes('Ekspor:')) break
  await new Promise((resolve) => setTimeout(resolve, 1_000))
}
if (!exportUiState?.text.includes('Ekspor:')) throw new Error('learner export UI did not expose a persisted state: ' + JSON.stringify(exportUiState))
await click('xpath=//button[contains(normalize-space(.), "Periksa status tersimpan")]', { label: 'reconnect learner lifecycle status' })
await new Promise((resolve) => setTimeout(resolve, 800))
if (!(await visibleText('Status tersimpan sudah diperbarui.'))) throw new Error('learner lifecycle reconnect control did not announce its stored status')
// Bind the learner page to a real ready export from the HTTP fixture, then
// exercise the page download control (not only the raw download endpoint).
await fillInput('input[aria-label="ID ekspor"]', readyExportId)
await click('xpath=//button[contains(normalize-space(.), "Periksa status tersimpan")]', { label: 'load ready export in learner lifecycle panel' })
await new Promise((resolve) => setTimeout(resolve, 800))
const readyUiState = await js('(() => (document.querySelector("[data-vera-lifecycle-panel] [role=status]")?.textContent || "").trim())()')
if (!readyUiState.includes('Ekspor: ready')) throw new Error('learner lifecycle panel did not load the ready export state: ' + readyUiState)
await click('[data-vera-export-download]', { label: 'download learner export from page' })
await new Promise((resolve) => setTimeout(resolve, 800))
const downloadedUiState = await js('(() => (document.querySelector("[data-vera-lifecycle-panel] [role=status]")?.textContent || "").trim())()')
if (!downloadedUiState.includes('Unduh: downloaded')) throw new Error('learner page download control did not report a completed download: ' + downloadedUiState)
// The same page must surface terminal lifecycle states and a typed stale/
// already-purged target without exposing whether another student owns it.
await fillInput('input[aria-label="ID ekspor"]', expiredExportId)
await click('xpath=//button[contains(normalize-space(.), "Periksa status tersimpan")]', { label: 'show expired learner export' })
await new Promise((resolve) => setTimeout(resolve, 800))
const expiredUiState = await js('(() => (document.querySelector("[data-vera-lifecycle-panel] [role=status]")?.textContent || "").trim())()')
if (!expiredUiState.includes('Ekspor: expired')) throw new Error('learner page did not surface expired export state: ' + expiredUiState)
await fillInput('input[aria-label="ID ekspor"]', staleExportId)
await click('xpath=//button[contains(normalize-space(.), "Periksa status tersimpan")]', { label: 'show stale learner export target' })
await new Promise((resolve) => setTimeout(resolve, 800))
const staleUiState = await js('(() => ({ status: (document.querySelector("[data-vera-lifecycle-panel] [role=status]")?.textContent || "").trim(), alerts: [...document.querySelectorAll("[role=alert]")].map((node) => (node.textContent || "").trim()).filter(Boolean) }))()')
if (!staleUiState.alerts.some((message) => message.includes('target unavailable') || message.includes('target_unavailable'))) throw new Error('learner page did not surface a privacy-safe stale/already-purged error: ' + JSON.stringify(staleUiState))
await fillInput('input[aria-label="ID ekspor"]', grantExportId)
await fillInput('input[aria-label="Token akses cleanup"]', grantToken)
await click('xpath=//button[contains(normalize-space(.), "Periksa grant")]', { label: 'check learner cleanup grant' })
await new Promise((resolve) => setTimeout(resolve, 1_000))
const grantUiState = await js('(() => { const status = document.querySelector("[data-vera-lifecycle-panel] [role=status]"); return (status?.textContent || "").trim(); })()')
if (!grantUiState.includes('Grant: cleanup_grant:active')) throw new Error('learner lifecycle grant control did not expose the active cleanup grant: ' + grantUiState)
await click('xpath=//button[contains(normalize-space(.), "Hapus percakapan ini")]', { label: 'delete learner conversation from lifecycle panel' })
await new Promise((resolve) => setTimeout(resolve, 1_000))
if (!(await visibleText('Konfirmasi penghapusan percakapan?'))) throw new Error('learner delete UI did not require an explicit confirmation')
await click('[data-vera-delete-confirm] button', { label: 'confirm learner conversation deletion' })
await new Promise((resolve) => setTimeout(resolve, 1_000))
const deleteUiState = await js('(() => { const status = document.querySelector("[data-vera-lifecycle-panel] [role=status]"); return (status?.textContent || "").trim(); })()')
if (!deleteUiState.includes('Hapus:')) throw new Error('learner delete UI did not expose a durable operation state: ' + deleteUiState)
await click('xpath=//button[contains(normalize-space(.), "Periksa status tersimpan")]', { label: 'reconcile learner delete status' })
await new Promise((resolve) => setTimeout(resolve, 800))
const reducedMotionState = await js('({ reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, panelVisible: Boolean(document.querySelector("[data-vera-lifecycle-panel]")), liveRegion: document.querySelector("[data-vera-lifecycle-panel] [role=status]")?.getAttribute("aria-live"), download: (document.querySelector("[data-vera-lifecycle-panel] [role=status]")?.textContent || "").includes("Unduh:") })')
if (!reducedMotionState.reducedMotion || !reducedMotionState.panelVisible || reducedMotionState.liveRegion !== 'polite') throw new Error('learner lifecycle reduced-motion/accessibility evidence failed: ' + JSON.stringify(reducedMotionState))
cliLog('PASS VERA_BROWSER_LIFECYCLE_UI export=create+status+download+expired+stale conversation=delete+confirmation+already-purged reconnect=checked grant=active reduced-motion=checked accessibility=live-region')
const learnerAccessibility = await js('(() => { const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0; }; const focusable = [...document.querySelectorAll("button,textarea,input,[role=tab]")].find(visible); if (focusable) focusable.focus(); const active = document.activeElement; const statusNodes = [...document.querySelectorAll("[role=status],[role=alert]")].filter(visible); return { focusable: Boolean(focusable && active === focusable), statusesHaveLiveRegion: statusNodes.every((node) => node.getAttribute("aria-live") === "polite" || node.getAttribute("aria-live") === "assertive") }; })()')
if (!learnerAccessibility.focusable || !learnerAccessibility.statusesHaveLiveRegion) throw new Error('learner Studio accessibility evidence failed: ' + JSON.stringify(learnerAccessibility))
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
await assertCurrentPage(['Studio'])
const learnerMobileOverflow = await js('({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })')
if (learnerMobileOverflow.scrollWidth > learnerMobileOverflow.width + 1 || learnerMobileOverflow.bodyWidth > learnerMobileOverflow.width + 1) throw new Error('390px browser evidence has horizontal overflow on learner Studio')
const learnerMobileControls = await visibleControls()
if (!learnerMobileControls.some((control) => control.aria || control.text)) throw new Error('learner Studio 390px evidence exposed no usable controls')
cliLog('BROWSER_MOBILE page=learner-studio width=390 interactive=true accessibility=focus+live-region overflow=false')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
await assertVisiblePage('/admin/ai-policy', adminToken, ['Vera AI policy console', 'Provider gate: open_blocked'])
await fillInput('textarea#policy-reason', 'browser policy evidence')
await click('xpath=//button[contains(normalize-space(.), "Buat complete draft")]', { label: 'create policy draft' })
await new Promise((resolve) => setTimeout(resolve, 400))
if (!(await visibleText('Provider gate: open_blocked'))) throw new Error('T10 policy browser interaction lost provider gate state')
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
await assertCurrentPage(['Vera AI policy console', 'Provider gate: open_blocked'])
const policyMobileOverflow = await js('({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })')
if (policyMobileOverflow.scrollWidth > policyMobileOverflow.width + 1 || policyMobileOverflow.bodyWidth > policyMobileOverflow.width + 1) throw new Error('390px browser evidence has horizontal overflow on policy')
cliLog('BROWSER_MOBILE page=policy width=390 interactive=true overflow=false')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
await assertVisiblePage('/admin/ai-usage', adminToken, ['AI usage', 'Mock / disabled telemetry only'])
await fillInput('input[aria-label="Tanggal mulai"]', '2026-08-20')
await fillInput('input[aria-label="Tanggal akhir eksklusif"]', '2026-08-21')
await click('xpath=//button[contains(normalize-space(.), "Muat laporan")]', { label: 'load usage report' })
await new Promise((resolve) => setTimeout(resolve, 500))
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
await assertCurrentPage(['AI usage', 'Mock / disabled telemetry only'])
const usageMobileOverflow = await js('({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })')
if (usageMobileOverflow.scrollWidth > usageMobileOverflow.width + 1 || usageMobileOverflow.bodyWidth > usageMobileOverflow.width + 1) throw new Error('390px browser evidence has horizontal overflow on usage')
cliLog('BROWSER_MOBILE page=usage width=390 interactive=true overflow=false')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
const browserConversationProbe = await browserJson('/api/vera-ai/conversations?limit=50')
if (browserConversationProbe.body?.defaultConversationId && browserConversationProbe.body?.conversations?.length !== 1) throw new Error('browser learner conversation API probe returned an inconsistent owner list: ' + JSON.stringify(browserConversationProbe))
const browserConversationId = browserConversationProbe.body.defaultConversationId
const browserHydrationProbe = await Promise.all([
  browserJson('/api/vera-ai/sources?limit=50'),
  browserJson('/api/vera-ai/usage'),
  ...(browserConversationId ? [
    browserJson('/api/vera-ai/conversations/' + browserConversationId),
    browserJson('/api/vera-ai/conversations/' + browserConversationId + '/messages?limit=50'),
    browserJson('/api/vera-ai/conversations/' + browserConversationId + '/context'),
    browserJson('/api/vera-ai/conversations/' + browserConversationId + '/artifacts?limit=50'),
  ] : []),
])
if (browserHydrationProbe.some((probe) => !probe.body)) throw new Error('browser learner hydration API probe failed: ' + JSON.stringify(browserHydrationProbe))
if (!browserConversationId && browserConversationProbe.body?.conversations?.length !== 0) throw new Error('browser learner delete did not return an empty owner-scoped list: ' + JSON.stringify(browserConversationProbe))
const browserReadyStatus = await browserJson('/api/vera-ai/exports/' + readyExportId)
if (browserReadyStatus.body?.state !== 'ready') throw new Error('browser export status/reconnect failed: ' + JSON.stringify(browserReadyStatus))
const browserDownload = await browserJson('/api/vera-ai/exports/' + readyExportId + '/download')
if (browserDownload.body?.schemaVersion !== 'vera.export.v1') throw new Error('browser export download failed: ' + JSON.stringify(browserDownload))
const browserConversationStatus = await browserJson('/api/vera-ai/lifecycle/' + conversationOperationId)
const browserArtifactStatus = await browserJson('/api/vera-ai/lifecycle/' + artifactOperationId)
if (browserConversationStatus.body?.state !== 'completed' || browserArtifactStatus.body?.state !== 'completed') throw new Error('browser lifecycle reconnect failed: ' + JSON.stringify({ browserConversationStatus, browserArtifactStatus }))
await cdp('Network.deleteCookies', { name: 'vecalss_session', domain: '127.0.0.1' })
const browserGrantStatus = await browserJson('/api/vera-ai/exports/' + grantExportId, { headers: { 'x-vera-export-grant': grantToken } })
if (browserGrantStatus.body?.accessMode !== 'cleanup_grant') throw new Error('browser cleanup-grant status failed: ' + JSON.stringify(browserGrantStatus))
const browserGrantDownload = await browserJson('/api/vera-ai/exports/' + grantExportId + '/download', { headers: { 'x-vera-export-grant': grantToken } })
if (browserGrantDownload.body?.schemaVersion !== 'vera.export.v1') throw new Error('browser cleanup-grant download failed: ' + JSON.stringify(browserGrantDownload))
let browserGrantReplayError = ''
try {
  await serverFetch(base + '/api/vera-ai/exports/' + grantExportId + '/download', { headers: { 'x-vera-export-grant': grantToken } })
} catch (error) {
  browserGrantReplayError = String(error)
}
if (!browserGrantReplayError.includes('HTTP 410')) throw new Error('browser grant replay was not terminal: ' + browserGrantReplayError)
cliLog('PASS VERA_BROWSER_LIFECYCLE export=create+status+download+grant+consumed conversation=delete+reconnect artifact=delete+reconnect')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
if ((await js('window.innerWidth')) !== 1496) throw new Error('desktop viewport evidence did not apply')
cliLog('BROWSER_DESKTOP authenticated=admin+learner policy=interactive usage=interactive learner=studio six-studio-tools=visible')
await completeTaskSpace(task.id, { keep: false })

async function assertCurrentPage(markers) {
  let lastControls = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const missing = []
    for (const marker of markers) if (!(await visibleText(marker))) missing.push(marker)
    if (missing.length === 0) return
    lastControls = await visibleControls()
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error('mobile page missing visible control/content ' + markers.join(',') + ' controls=' + JSON.stringify(lastControls))
}
cliLog('PASS VERA_BROWSER_EVIDENCE desktop=1496 mobile=390 authenticated=admin+learner six-studio-tools=visible no-horizontal-scroll')
`;
    let browserOutput = "";
    try {
      const browserResult = await new Promise<{ status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn("ego-browser", ["nodejs"], {
          cwd: root,
          env: integrationEnv({ VERA_BROWSER_BASE_URL: base, VERA_BROWSER_ADMIN_TOKEN: fixture.adminToken, VERA_BROWSER_STUDENT_TOKEN: fixture.studentToken }),
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`ego-browser evidence exceeded 120s stdout=${stdout.slice(-4_000)} stderr=${stderr.slice(-4_000)}`));
        }, 120_000);
        child.stdout?.on("data", (chunk: Buffer) => {
          stdout = `${stdout}${chunk.toString()}`.slice(-8 * 1024 * 1024);
          process.stdout.write(chunk);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr = `${stderr}${chunk.toString()}`.slice(-8 * 1024 * 1024);
          process.stderr.write(chunk);
        });
        child.once("error", (error) => { clearTimeout(timeout); reject(error); });
        child.once("close", (status, signal) => { clearTimeout(timeout); resolve({ status, signal, stdout, stderr }); });
        child.stdin?.end(browserSource);
      });
      browserOutput = `${browserResult.stdout}\n${browserResult.stderr}`;
      if (browserResult.status !== 0) throw new Error(`ego-browser exited with status ${String(browserResult.status)}${browserResult.signal ? ` (${browserResult.signal})` : ""}: ${browserOutput.slice(-12_000)}`);
    } catch (error) {
      const detail = error && typeof error === "object" && "stdout" in error
        ? `${String((error as { stdout?: unknown }).stdout ?? "")}\n${String((error as { stderr?: unknown }).stderr ?? "")}`
        : String(error);
      throw new Error(`isolated browser evidence failed: ${detail.slice(-12_000)} server=${serverOutput}`);
    }
    assert.match(browserOutput, /PASS VERA_BROWSER_EVIDENCE/u, "browser evidence did not report a pass");
    const browserEvidenceLines = browserOutput.split("\n").filter((line) => line.includes("PASS VERA_BROWSER_LIFECYCLE") || line.includes("PASS VERA_BROWSER_EVIDENCE"));
    assert(browserEvidenceLines.some((line) => line.includes("PASS VERA_BROWSER_LIFECYCLE_UI")), "browser learner lifecycle controls did not report a pass");
    assert(browserEvidenceLines.some((line) => line.includes("PASS VERA_BROWSER_LIFECYCLE")), "browser lifecycle evidence did not report a pass");
    console.log(browserEvidenceLines.join("\n"));
    console.log(`T12_EVIDENCE browser=pass desktop=1496 mobile=390 port=${port}`);
    return { port, browserOutput };
  } finally {
    await stopServer(server);
    await dbCleanupBrowserLifecycle(db, lifecycleFixture, [fixture.studentId, fixture.adminId]);
    await dbCleanupBrowserFixture(db, fixture);
  }
}

async function dbCleanupBrowserLifecycle(db: PrismaClient, fixture: BrowserLifecycleFixture, ownerIds: string[]): Promise<void> {
  try {
    const ownerExports = await db.aiExportJob.findMany({ where: { studentId: { in: ownerIds } }, select: { id: true, operationId: true } });
    const exportIds = [...new Set([...fixture.exportIds, ...ownerExports.map(({ id }) => id)])];
    const operationIds = [...new Set([...fixture.operationIds, ...ownerExports.map(({ operationId }) => operationId)])];
    const ownerKeys = await db.aiIdempotencyKey.findMany({ where: { studentId: { in: ownerIds } }, select: { id: true } });
    const fixtureKeys = fixture.idempotencyKeys.length > 0
      ? await db.aiIdempotencyKey.findMany({ where: { clientRequestId: { in: fixture.idempotencyKeys } }, select: { id: true } })
      : [];
    const idempotencyIds = [...new Set([...ownerKeys.map(({ id }) => id), ...fixtureKeys.map(({ id }) => id)])];
    const linkedOperations = idempotencyIds.length > 0
      ? await db.aiLifecycleOperation.findMany({ where: { idempotencyKeyId: { in: idempotencyIds } }, select: { id: true } })
      : [];
    for (const { id } of linkedOperations) if (!operationIds.includes(id)) operationIds.push(id);
    if (fixture.artifactIds.length > 0) {
      await db.aiArtifactApply.deleteMany({ where: { artifactRevisionId: { in: fixture.artifactIds } } });
      await db.aiArtifactLifecycle.deleteMany({ where: { artifactRevisionId: { in: fixture.artifactIds } } });
      for (const artifactId of fixture.artifactIds) {
        await db.aiEnvelopeKey.deleteMany({ where: { objectId: { contains: artifactId } } });
      }
      await db.aiArtifact.deleteMany({ where: { id: { in: fixture.artifactIds } } });
    }
    if (fixture.conversationIds.length > 0) await db.aiConversation.deleteMany({ where: { id: { in: fixture.conversationIds } } });
    if (exportIds.length > 0) {
      await db.aiExportPart.deleteMany({ where: { exportJobId: { in: exportIds } } });
      await db.aiExportJob.deleteMany({ where: { id: { in: exportIds } } });
      for (const exportId of exportIds) {
        await db.aiEnvelopeKey.deleteMany({ where: { objectId: { startsWith: `vera-export:${exportId}:` } } });
      }
    }
    if (operationIds.length > 0) {
      await db.aiKeyDestructionClaim.deleteMany({ where: { operationId: { in: operationIds } } });
      await db.aiPurgeWorkItem.deleteMany({ where: { operationId: { in: operationIds } } });
      await db.aiLifecycleOperation.deleteMany({ where: { id: { in: operationIds } } });
    }
    if (idempotencyIds.length > 0) {
      await db.aiAdmissionEvent.updateMany({ where: { idempotencyKeyId: { in: idempotencyIds } }, data: { idempotencyKeyId: null } });
      await db.aiArtifactApply.deleteMany({ where: { idempotencyKeyId: { in: idempotencyIds } } });
      await db.aiRequest.updateMany({ where: { idempotencyKeyId: { in: idempotencyIds } }, data: { idempotencyKeyId: null } });
      await db.aiIdempotencyKey.deleteMany({ where: { OR: [{ id: { in: idempotencyIds } }, { studentId: { in: ownerIds } }] } });
    }
  } catch (error) {
    throw new Error(`browser lifecycle fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function dbCleanupBrowserFixture(db: PrismaClient, fixture: BrowserFixture): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.authSession.deleteMany({ where: { id: { in: [fixture.adminSessionId, fixture.studentSessionId] } } });

    // The browser deliberately exercises real Studio requests.  A conversation
    // therefore cannot be deleted directly: request message FKs, request
    // children, typed targets, and idempotency rows must be detached in the
    // same dependency order as the production account workflow.  Keep this
    // cleanup scoped to the random fixture owner so prior disposable evidence
    // (and every configured/shared database) is untouched.
    const conversations = await tx.aiConversation.findMany({ where: { studentId: fixture.studentId }, select: { id: true } });
    const conversationIds = conversations.map(({ id }) => id);
    const conversationWhere = conversationIds.length > 0 ? { conversationId: { in: conversationIds } } : { conversationId: fixture.conversationId };
    const conversationMessages = conversationIds.length > 0
      ? await tx.aiMessage.findMany({ where: conversationWhere, select: { id: true } })
      : [];
    const messageIds = conversationMessages.map(({ id }) => id);
    const requestRows = await tx.aiRequest.findMany({
      where: {
        OR: [
          { studentId: fixture.studentId },
          ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
          ...(messageIds.length > 0 ? [{ userMessageId: { in: messageIds } }, { assistantMessageId: { in: messageIds } }] : []),
        ],
      },
      select: { id: true, idempotencyKeyId: true },
    });
    const requestIds = requestRows.map(({ id }) => id);
    const requestIdempotencyIds = requestRows.flatMap(({ idempotencyKeyId }) => idempotencyKeyId ? [idempotencyKeyId] : []);

    const artifacts = await tx.aiArtifact.findMany({
      where: {
        OR: [
          { studentId: fixture.studentId },
          ...(requestIds.length > 0 ? [{ requestId: { in: requestIds } }] : []),
          ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const artifactIds = artifacts.map(({ id }) => id);
    const analyses = await tx.weaknessAnalysis.findMany({
      where: { OR: [{ studentId: fixture.studentId }, ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : [])] },
      select: { id: true },
    });
    const analysisIds = analyses.map(({ id }) => id);
    const adaptiveSessions = await tx.adaptivePracticeSession.findMany({
      where: { OR: [{ studentId: fixture.studentId }, ...(conversationIds.length > 0 ? [{ sourceConversationId: { in: conversationIds } }] : [])] },
      select: { id: true },
    });
    const adaptiveSessionIds = adaptiveSessions.map(({ id }) => id);

    if (artifactIds.length > 0) {
      await tx.learningRecommendation.updateMany({ where: { OR: [{ appliedArtifactRevisionId: { in: artifactIds } }, { sourceArtifactRevisionId: { in: artifactIds } }] }, data: { appliedArtifactRevisionId: null, sourceArtifactRevisionId: null } });
      await tx.aiArtifactApply.deleteMany({ where: { artifactRevisionId: { in: artifactIds } } });
      await tx.aiArtifactLifecycle.deleteMany({ where: { artifactRevisionId: { in: artifactIds } } });
      await tx.aiEnvelopeKey.deleteMany({ where: { objectId: { contains: fixture.studentId } } });
      await tx.aiArtifact.deleteMany({ where: { id: { in: artifactIds } } });
    }
    await tx.learningRecommendation.deleteMany({ where: { studentId: fixture.studentId } });
    if (analysisIds.length > 0) {
      await tx.weaknessAnalysisTopic.deleteMany({ where: { weaknessAnalysisId: { in: analysisIds } } });
      await tx.weaknessAnalysis.deleteMany({ where: { id: { in: analysisIds } } });
    }
    if (adaptiveSessionIds.length > 0) {
      await tx.adaptivePracticeAnswer.deleteMany({ where: { adaptiveSessionId: { in: adaptiveSessionIds } } });
      await tx.adaptivePracticeItem.deleteMany({ where: { adaptiveSessionId: { in: adaptiveSessionIds } } });
      await tx.adaptivePracticeSession.deleteMany({ where: { id: { in: adaptiveSessionIds } } });
    }
    await tx.ptnStrategySession.deleteMany({ where: { OR: [{ studentId: fixture.studentId }, ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : [])] } });

    if (requestIds.length > 0) {
      await tx.aiRequestSource.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.aiRequestAttempt.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.aiRequestResultStage.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.aiContextPack.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.weaknessAnalysis.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.adaptivePracticeSession.updateMany({ where: { requestId: { in: requestIds } }, data: { requestId: null } });
      await tx.ptnStrategySession.updateMany({ where: { requestId: { in: requestIds } }, data: { requestId: null } });
      await tx.aiRequest.updateMany({ where: { retryOfRequestId: { in: requestIds } }, data: { retryOfRequestId: null } });
      const cleanupAt = new Date();
      await tx.aiRequest.updateMany({
        where: { id: { in: requestIds } },
        data: {
          studentId: null,
          conversationId: null,
          userMessageId: null,
          assistantMessageId: null,
          idempotencyKeyId: null,
          ownerState: "account_deleted",
          ownerReferenceDigest: hashToken(`browser-fixture-owner:${fixture.studentId}`),
          accountDeletedAt: cleanupAt,
          status: "failed",
          errorCode: "browser_fixture_cleanup",
          idempotencyEvidenceState: "tombstoned",
          usageAccountingState: "unknown",
          finalizedAt: cleanupAt,
        },
      });
      await tx.aiRequest.deleteMany({ where: { id: { in: requestIds } } });
    }
    if (messageIds.length > 0) await tx.aiMessage.deleteMany({ where: { id: { in: messageIds } } });
    if (conversationIds.length > 0) {
      await tx.aiConversationSource.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await tx.aiConversation.deleteMany({ where: { id: { in: conversationIds }, studentId: fixture.studentId } });
    }

    const fixtureIdempotency = await tx.aiIdempotencyKey.findMany({ where: { OR: [{ studentId: fixture.studentId }, ...(requestIdempotencyIds.length > 0 ? [{ id: { in: requestIdempotencyIds } }] : [])] }, select: { id: true } });
    const idempotencyIds = fixtureIdempotency.map(({ id }) => id);
    if (idempotencyIds.length > 0) {
      await tx.aiAdmissionEvent.updateMany({ where: { idempotencyKeyId: { in: idempotencyIds } }, data: { idempotencyKeyId: null } });
      await tx.aiArtifactApply.deleteMany({ where: { idempotencyKeyId: { in: idempotencyIds } } });
      await tx.aiLifecycleOperation.deleteMany({ where: { idempotencyKeyId: { in: idempotencyIds } } });
      await tx.aiIdempotencyKey.deleteMany({ where: { id: { in: idempotencyIds } } });
    }
    await tx.aiAdmissionEvent.updateMany({ where: { studentId: fixture.studentId }, data: { studentId: null } });
    await tx.aiUsageDaily.deleteMany({ where: { studentId: fixture.studentId } });
    await tx.aiCapabilityGrant.deleteMany({ where: { userId: fixture.adminId } });
    await tx.roleAssignment.deleteMany({ where: { userId: fixture.studentId } });
    await tx.roleAssignment.deleteMany({ where: { userId: fixture.adminId } });
    await tx.billingAccount.deleteMany({ where: { studentId: fixture.studentId } });
    await tx.studentProfile.deleteMany({ where: { userId: fixture.studentId } });
    await tx.user.deleteMany({ where: { id: fixture.studentId } });
    // Policy audit history is append-only and retains its actor FK. Keep the
    // isolated browser admin as an anonymized soft-deleted principal instead of
    // deleting audit rows or weakening that production invariant.
    await tx.user.update({ where: { id: fixture.adminId }, data: { status: "soft_deleted", softDeletedAt: new Date(), fullName: "Deleted Vera browser admin" } });
    // Re-establish the prior active/scheduled state after browser evidence. All
    // updates are state-only, preserving the production immutability trigger.
    const current = await tx.aiPolicyBundle.findMany({ where: { state: { in: [AiPolicyState.active, AiPolicyState.scheduled] } }, select: { id: true } });
    for (const row of current) await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { state: AiPolicyState.draft } });
    // Restore immutable content fields while every fixture row is draft, then
    // restore lifecycle states in a separate statement. This keeps the
    // production non-draft content trigger active during cleanup as well.
    for (const row of fixture.policyRows) await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { effectiveAt: row.effectiveAt, activatedAt: row.activatedAt } });
    for (const row of fixture.policyRows) await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { state: row.state } });
  });
}

async function main(): Promise<void> {
  if (!databaseUrl || !redisUrl) throw new Error("Set VERA_DISPOSABLE_DATABASE_URL and VERA_DISPOSABLE_REDIS_URL for executable Sprint 5 evidence.");
  requireLocalDatabase(databaseUrl);
  requireLocalRedis(redisUrl);
  assert(!["true", "1", "yes", "on"].includes(liveProvider ?? ""), "live provider must remain disabled");
  process.env.DATABASE_URL = databaseUrl;
  // Apply/check only the command-local disposable database. This makes the
  // integration evidence fail closed on a stale parent migration checksum and
  // never mutates a configured/shared database.
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: root,
    env: integrationEnv({ DATABASE_URL: databaseUrl }),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  // The accepted Sprint 4 runtime fixture uses the stable disposable tutor
  // identity as its second policy approver. Fresh migration-only databases do
  // not contain application seed users, so provision that one isolated
  // approver before invoking the prior-sprint executable; no configured data
  // or application seed is changed.
  const setupDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  await assertCurrentSprint5Migration(setupDb);
  const runtimeApprover = await setupDb.user.findUnique({ where: { email: "tutor@vecalss.local" }, select: { id: true } });
  if (!runtimeApprover) {
    const approverId = randomUUID();
    await setupDb.user.create({ data: { id: approverId, email: "tutor@vecalss.local", fullName: "Vera isolated policy approver", passwordHash: "fixture" } });
    await setupDb.roleAssignment.create({ data: { userId: approverId, role: RoleName.admin } });
    console.log("T12_EVIDENCE fixture=isolated-sprint4-approver provisioned=true");
  }
  await setupDb.$disconnect();

  const evidence: Array<[string, readonly string[]]> = [
    ["test:vera-prisma-sprint5-t11", ["T11_EXECUTABLE_LIFECYCLE_OPERATION_EDGE_MATRIX=", "T11_EVIDENCE operation_edge=export_create actual=true", "T11_EVIDENCE operation_edge=conversation_delete actual=true", "T11_EVIDENCE operation_edge=artifact_delete actual=true", "T11_EVIDENCE account_settlement=preserved-stage+context-pack+daily-ledger", "T11_EVIDENCE hold_worker=conversation+artifact", "daily_validation_checks=30", "T11_EVIDENCE cutover=pre-drop rollback=ROLLBACK restore=restarted-kms actual=true", "T11_EVIDENCE reaper=failed_terminal"]],
    ["test:vera-prisma-sprint3", ["PASS vera-prisma-sprint3", "T12_EXECUTABLE_OPERATION_EDGE_MATRIX="]],
    ["test:vera-learner-authority", ["PASS vera-learner-authority", "learner_authority=prisma-context-resolver", "kuis=", "tryout=", "released=true"]],
    ["test:vera-prisma-sprint2", ["actual HTTP route auth/body/privacy/replay/expired DTO assertions", "one provider"]],
    ["test:vera-prisma-sprint4-runtime", ["optional include/read gating", "partition faults return privacy-safe"]],
  ];
  // T11 invokes the already-accepted all-seven callback crash matrix; Sprint 2
  // supplies the authenticated learner flow; Sprint 4 supplies populated T9
  // report and T10 preview/runtime evidence. Every child receives the same
  // local-only env and mock/disabled provider gate.
  const outputs = evidence.map(([script, markers]) => [script, runEvidenceScript(script, markers)] as const);
  const callbackOutput = outputs.find(([script]) => script === "test:vera-prisma-sprint5-t11")?.[1] ?? "";
  const sprint3Output = outputs.find(([script]) => script === "test:vera-prisma-sprint3")?.[1] ?? "";
  const learnerAuthorityOutput = outputs.find(([script]) => script === "test:vera-learner-authority")?.[1] ?? "";
  const learnerOutput = outputs.find(([script]) => script === "test:vera-prisma-sprint2")?.[1] ?? "";
  const t9t10Output = outputs.find(([script]) => script === "test:vera-prisma-sprint4-runtime")?.[1] ?? "";
  assert.match(callbackOutput, /all-seven=true/u);
  const callbackEvidenceLines = callbackOutput.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("T11_EVIDENCE callback_namespace=") && line.includes(" actual=true") && line.includes(" status=pass"));
  assert.equal(callbackEvidenceLines.length, 7, "T11 callback fixture did not emit seven executable namespace results");
  const callbackNamespaces = callbackEvidenceLines.map((line) => line.match(/^T11_EVIDENCE callback_namespace=([^ ]+)/u)?.[1]).filter((value): value is string => Boolean(value));
  assert.deepEqual([...new Set(callbackNamespaces)].sort(), ["analysis", "chat", "drill", "ptn", "review", "route", "summary"]);
  for (const namespace of ["chat", "analysis", "route", "review", "summary", "ptn", "drill"]) {
    assert(callbackOutput.includes(`T11_EVIDENCE callback_namespace=${namespace}`), `T11 callback evidence did not prove ${namespace}`);
  }
  for (const line of callbackOutput.split("\n").map((candidate) => candidate.trim()).filter((candidate) => (
    candidate.startsWith("T11_EVIDENCE account_settlement=")
    || candidate.startsWith("T11_EVIDENCE hold_worker=")
    || candidate.startsWith("T11_EVIDENCE reaper=")
    || candidate.includes("daily_validation_checks=30")
  ))) console.log(line);
  assert.match(learnerOutput, /PASS vera-prisma-sprint2/u, "Sprint 2 learner flow did not report an executable pass");
  assert.match(learnerAuthorityOutput, /PASS vera-learner-authority/u, "learner authority fixture did not report an executable pass");
  assert.match(learnerAuthorityOutput, /learner_authority=prisma-context-resolver.*kuis=.*tryout=.*released=true/u, "learner authority fixture did not exercise both released Kuis and Tryout sources");
  assert.match(sprint3Output, /PASS vera-prisma-sprint3/u, "Sprint 3 callback/read evidence did not report an executable pass");
  const operationEvidenceLines = callbackOutput.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("T11_EVIDENCE operation_edge=") && line.includes(" actual=true") && line.includes(" status=pass") && line.includes(" evidenceDigest="));
  const operationNamespaces = operationEvidenceLines
    .map((line) => line.match(/^T11_EVIDENCE operation_edge=([^ ]+)/u)?.[1])
    .filter((value): value is string => Boolean(value));
  assert.deepEqual([...new Set(operationNamespaces)].sort(), ["ai_request", "artifact_apply", "artifact_delete", "conversation_create", "conversation_delete", "export_create", "learning_recommendation_create"], "T11/T12 operation evidence must cover exactly the seven persisted operation namespaces");
  assert.equal(new Set(operationNamespaces).size, 7, "T11/T12 operation evidence contained a duplicate or unknown namespace");
  assert.match(t9t10Output, /PASS vera-prisma-sprint4-runtime/u, "Sprint 4 T9/T10 runtime did not report an executable pass");
  for (const line of callbackEvidenceLines) console.log(line);
  // Forward only the seven verified operation rows emitted by the executable
  // T11/T12 fixtures. The wrapper never infers coverage from source markers.
  for (const line of operationEvidenceLines) console.log(line);
  const callbackSummary = callbackOutput.split("\n").map((line) => line.trim()).find((line) => line.startsWith("T11_EVIDENCE callbacks=") && line.includes(" actual=true") && line.includes(" status=pass"));
  assert(callbackSummary, "T11 callback summary was not produced by the executable matrix");
  const learnerPass = learnerOutput.split("\n").map((line) => line.trim()).find((line) => line.startsWith("PASS vera-prisma-sprint2:"));
  assert(learnerPass, "learner flow did not emit an executable PASS line");
  const learnerAuthorityPass = learnerAuthorityOutput.split("\n").map((line) => line.trim()).find((line) => line.startsWith("PASS vera-learner-authority:"));
  assert(learnerAuthorityPass, "learner authority fixture did not emit an executable PASS line");
  const t9t10Pass = t9t10Output.split("\n").map((line) => line.trim()).find((line) => line.startsWith("PASS vera-prisma-sprint4-runtime:"));
  assert(t9t10Pass, "T9/T10 runtime did not emit an executable PASS line");
  console.log(`T12_EVIDENCE callbacks=chat+analysis+route+review+summary+ptn+drill source=test:vera-prisma-sprint5-t11 actual=true evidenceDigest=${hashToken(callbackSummary)} status=pass`);
  console.log(`T12_EVIDENCE learner_flow=authenticated-http-post-status-usage-replay-cross-student source=test:vera-prisma-sprint2 actual=true evidenceDigest=${hashToken(learnerPass)} status=pass`);
  console.log(`T12_EVIDENCE learner_authority=prisma-context-resolver kuis+tryout=owner-scoped-released source=test:vera-learner-authority actual=true evidenceDigest=${hashToken(learnerAuthorityPass)} status=pass`);
  console.log(`T12_EVIDENCE t9_t10_runtime=populated-report-policy-preview source=test:vera-prisma-sprint4-runtime actual=true evidenceDigest=${hashToken(t9t10Pass)} status=pass`);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const browser = await runAdminHttpAndBrowser(db);
    console.log(JSON.stringify({
      status: "passed",
      operationNamespaces: "verified",
      learnerFlow: "verified",
      t9Http: "verified",
      t10Http: "verified",
      browser: { desktop: "verified", mobile390: "verified", port: browser.port },
      providerGateState: "open_blocked",
      liveProvider: false,
      noSharedInfrastructure: true,
    }));
    console.log("PASS vera-sprint5-integration: executable isolated T11/T12 evidence complete");
  } finally {
    await db.$disconnect();
  }
}

await main();
