import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";
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
  let port = 5023;
  try {
    if (!(await isPortAvailable(port))) {
      port = 5024;
      while (!(await isPortAvailable(port))) port += 1;
    }
    server = spawn("pnpm", ["next", "dev", "--port", String(port)], {
      cwd: root,
      env: integrationEnv({ APP_BASE_URL: `http://127.0.0.1:${port}`, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: "" }),
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    console.log(`T12_EVIDENCE actual_http=t9-report+t10-metadata+draft+replay lifecycle=export-create+status+download+grant+expiry+conversation-delete+artifact-delete+reconnect status=pass port=${port}`);

    const browserSource = String.raw`
const task = await useOrCreateTaskSpace('vera sprint5 isolated browser evidence')
const base = ${JSON.stringify(base)}
const adminToken = ${JSON.stringify(fixture.adminToken)}
const studentToken = ${JSON.stringify(fixture.studentToken)}
const readyExportId = ${JSON.stringify(exportTarget.exportId)}
const grantExportId = ${JSON.stringify(browserGrantTarget.exportId)}
const grantToken = ${JSON.stringify(browserGrantToken)}
const conversationOperationId = ${JSON.stringify(conversationDelete.operationId)}
const artifactOperationId = ${JSON.stringify(artifactDelete.operationId)}
async function session(token, path) {
  await openOrReuseTab(base + path, { wait: true, timeout: 30 })
  await cdp('Network.deleteCookies', { name: 'vecalss_session', domain: '127.0.0.1' })
  await cdp('Network.setCookie', { name: 'vecalss_session', value: token, url: base })
  await gotoAndWait(base + path, { timeout: 30, settle: 1 })
  await new Promise((resolve) => setTimeout(resolve, 5_000))
}
async function bodyText() { return await js('document.body.innerText') }
async function browserJson(path, options = {}) {
  const script = '(async () => { const response = await fetch(' + JSON.stringify(base) + ' + ' + JSON.stringify(path) + ', ' + JSON.stringify(options) + '); const text = await response.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: response.status, body }; })()'
  return await js(script)
}
async function assertPage(path, token, markers) {
  await session(token, path)
  const text = await bodyText()
  for (const marker of markers) if (!text.includes(marker)) throw new Error(path + ' missing ' + marker + ' body=' + text.slice(0, 600))
  return text
}
async function openStudio() {
  const clickState = await js("(() => { const buttons = [...document.querySelectorAll('button')].filter((node) => node.textContent?.trim() === 'Studio'); const button = buttons.find((node) => node.offsetParent !== null && getComputedStyle(node).visibility !== 'hidden'); if (button) button.click(); return { count: buttons.length, visible: Boolean(button), before: buttons.map((node) => node.getAttribute('data-active')) }; })()")
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  const text = await bodyText()
  const studioState = await js("(() => ({ buttons: [...document.querySelectorAll('button')].filter((node) => node.textContent?.trim() === 'Studio').map((node) => ({ active: node.getAttribute('data-active'), selected: node.getAttribute('aria-selected'), display: getComputedStyle(node).display, parentDisplay: getComputedStyle(node.parentElement).display })), panels: [...document.querySelectorAll('[data-slot=\\\"tabs-content\\\"]')].map((node) => ({ hidden: node.hasAttribute('hidden'), ariaHidden: node.getAttribute('aria-hidden'), display: getComputedStyle(node).display, text: (node.textContent || '').slice(0, 200) })) }))()")
  const fullText = String(await js('document.body.textContent || ""'))
  for (const marker of ['Analisis kelemahan', 'Rute belajar', 'Ulas soal', 'Strategi PTN', 'Ringkasan sesi', 'Drill adaptif']) if (!text.includes(marker) && !fullText.includes(marker)) throw new Error('/vera-ai Studio missing ' + marker + ' viewport=' + String(await js('window.innerWidth')) + ' click=' + JSON.stringify(clickState) + ' state=' + JSON.stringify(studioState) + ' body=' + text.slice(0, 600))
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
await assertPage('/admin/ai-policy', adminToken, ['Vera AI policy console', 'Provider gate: open_blocked'])
await assertPage('/admin/ai-usage', adminToken, ['AI usage', 'Mock / disabled telemetry only'])
await assertPage('/vera-ai', studentToken, ['Studio'])
await openStudio()
const browserReadyStatus = await browserJson('/api/vera-ai/exports/' + readyExportId)
if (browserReadyStatus.status !== 200 || browserReadyStatus.body?.state !== 'ready') throw new Error('browser export status/reconnect failed: ' + JSON.stringify(browserReadyStatus))
const browserDownload = await browserJson('/api/vera-ai/exports/' + readyExportId + '/download')
if (browserDownload.status !== 200 || browserDownload.body?.schemaVersion !== 'vera.export.v1') throw new Error('browser export download failed: ' + JSON.stringify(browserDownload))
const browserConversationStatus = await browserJson('/api/vera-ai/lifecycle/' + conversationOperationId)
const browserArtifactStatus = await browserJson('/api/vera-ai/lifecycle/' + artifactOperationId)
if (browserConversationStatus.status !== 200 || browserConversationStatus.body?.state !== 'completed' || browserArtifactStatus.status !== 200 || browserArtifactStatus.body?.state !== 'completed') throw new Error('browser lifecycle reconnect failed: ' + JSON.stringify({ browserConversationStatus, browserArtifactStatus }))
await cdp('Network.deleteCookies', { name: 'vecalss_session', domain: '127.0.0.1' })
const browserGrantStatus = await browserJson('/api/vera-ai/exports/' + grantExportId, { headers: { 'x-vera-export-grant': grantToken } })
if (browserGrantStatus.status !== 200 || browserGrantStatus.body?.accessMode !== 'cleanup_grant') throw new Error('browser cleanup-grant status failed: ' + JSON.stringify(browserGrantStatus))
const browserGrantDownload = await browserJson('/api/vera-ai/exports/' + grantExportId + '/download', { headers: { 'x-vera-export-grant': grantToken } })
if (browserGrantDownload.status !== 200 || browserGrantDownload.body?.schemaVersion !== 'vera.export.v1') throw new Error('browser cleanup-grant download failed: ' + JSON.stringify(browserGrantDownload))
const browserGrantReplay = await browserJson('/api/vera-ai/exports/' + grantExportId + '/download', { headers: { 'x-vera-export-grant': grantToken } })
if (browserGrantReplay.status !== 410 || browserGrantReplay.body?.error !== 'export_access_consumed') throw new Error('browser grant replay was not terminal: ' + JSON.stringify(browserGrantReplay))
cliLog('PASS VERA_BROWSER_LIFECYCLE export=create+status+download+grant+consumed conversation=delete+reconnect artifact=delete+reconnect')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1496, height: 900, deviceScaleFactor: 1, mobile: false })
if ((await js('window.innerWidth')) !== 1496) throw new Error('desktop viewport evidence did not apply')
await captureScreenshot()
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
await assertPage('/admin/ai-policy', adminToken, ['Provider gate: open_blocked'])
await assertPage('/admin/ai-usage', adminToken, ['AI usage', 'Mock / disabled telemetry only'])
await assertPage('/vera-ai', studentToken, ['Studio'])
await openStudio()
const overflow = await js('({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth })')
if (overflow.scrollWidth > overflow.width + 1 || overflow.bodyWidth > overflow.width + 1) throw new Error('390px browser evidence has horizontal overflow')
await captureScreenshot()
cliLog('PASS VERA_BROWSER_EVIDENCE desktop=1496 mobile=390 authenticated=admin+learner six-studio-tools=visible no-horizontal-scroll')
await completeTaskSpace(task.id, { keep: false })
`;
    let browserOutput = "";
    try {
      const browserResult = spawnSync("ego-browser", ["nodejs"], {
        cwd: root,
        env: integrationEnv({ VERA_BROWSER_BASE_URL: base, VERA_BROWSER_ADMIN_TOKEN: fixture.adminToken, VERA_BROWSER_STUDENT_TOKEN: fixture.studentToken }),
        input: browserSource,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      });
      browserOutput = `${browserResult.stdout ?? ""}\n${browserResult.stderr ?? ""}`;
      if (browserResult.error) throw browserResult.error;
      if (browserResult.status !== 0) throw new Error(`ego-browser exited with status ${String(browserResult.status)}${browserResult.signal ? ` (${browserResult.signal})` : ""}: ${browserOutput.slice(-12_000)}`);
    } catch (error) {
      const detail = error && typeof error === "object" && "stdout" in error
        ? `${String((error as { stdout?: unknown }).stdout ?? "")}\n${String((error as { stderr?: unknown }).stderr ?? "")}`
        : String(error);
      throw new Error(`isolated browser evidence failed: ${detail.slice(-12_000)}`);
    }
    assert.match(browserOutput, /PASS VERA_BROWSER_EVIDENCE/u, "browser evidence did not report a pass");
    const browserEvidenceLines = browserOutput.split("\n").filter((line) => line.includes("PASS VERA_BROWSER_LIFECYCLE") || line.includes("PASS VERA_BROWSER_EVIDENCE"));
    assert(browserEvidenceLines.some((line) => line.includes("PASS VERA_BROWSER_LIFECYCLE")), "browser lifecycle evidence did not report a pass");
    console.log(browserEvidenceLines.join("\n"));
    console.log(`T12_EVIDENCE browser=pass desktop=1496 mobile=390 port=${port}`);
    return { port, browserOutput };
  } finally {
    await stopServer(server);
    await dbCleanupBrowserLifecycle(db, lifecycleFixture);
    await dbCleanupBrowserFixture(db, fixture);
  }
}

async function dbCleanupBrowserLifecycle(db: PrismaClient, fixture: BrowserLifecycleFixture): Promise<void> {
  try {
    if (fixture.artifactIds.length > 0) {
      await db.aiArtifactApply.deleteMany({ where: { artifactRevisionId: { in: fixture.artifactIds } } });
      await db.aiArtifactLifecycle.deleteMany({ where: { artifactRevisionId: { in: fixture.artifactIds } } });
      await db.aiArtifact.deleteMany({ where: { id: { in: fixture.artifactIds } } });
      for (const artifactId of fixture.artifactIds) {
        await db.aiEnvelopeKey.deleteMany({ where: { objectId: { endsWith: `:${artifactId}` } } });
      }
    }
    if (fixture.conversationIds.length > 0) await db.aiConversation.deleteMany({ where: { id: { in: fixture.conversationIds } } });
    if (fixture.exportIds.length > 0) {
      await db.aiExportPart.deleteMany({ where: { exportJobId: { in: fixture.exportIds } } });
      await db.aiExportJob.deleteMany({ where: { id: { in: fixture.exportIds } } });
      for (const exportId of fixture.exportIds) {
        await db.aiEnvelopeKey.deleteMany({ where: { objectId: { startsWith: `vera-export:${exportId}:` } } });
      }
    }
    if (fixture.operationIds.length > 0) {
      await db.aiKeyDestructionClaim.deleteMany({ where: { operationId: { in: fixture.operationIds } } });
      await db.aiPurgeWorkItem.deleteMany({ where: { operationId: { in: fixture.operationIds } } });
      await db.aiLifecycleOperation.deleteMany({ where: { id: { in: fixture.operationIds } } });
    }
    if (fixture.idempotencyKeys.length > 0) await db.aiIdempotencyKey.deleteMany({ where: { clientRequestId: { in: fixture.idempotencyKeys }, studentId: { not: null } } });
  } catch (error) {
    console.warn(`T12_EVIDENCE cleanup=browser_lifecycle_warning ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function dbCleanupBrowserFixture(db: PrismaClient, fixture: BrowserFixture): Promise<void> {
  await db.authSession.deleteMany({ where: { id: { in: [fixture.adminSessionId, fixture.studentSessionId] } } });
  await db.aiConversation.deleteMany({ where: { id: fixture.conversationId } });
  await db.billingAccount.deleteMany({ where: { studentId: fixture.studentId } });
  await db.studentProfile.deleteMany({ where: { userId: fixture.studentId } });
  await db.roleAssignment.deleteMany({ where: { userId: fixture.studentId } });
  await db.user.deleteMany({ where: { id: fixture.studentId } });
  // Re-establish the prior active/scheduled state after browser evidence. All
  // updates are state-only, preserving the production immutability trigger.
  const current = await db.aiPolicyBundle.findMany({ where: { state: { in: [AiPolicyState.active, AiPolicyState.scheduled] } }, select: { id: true } });
  for (const row of current) await db.aiPolicyBundle.update({ where: { id: row.id }, data: { state: AiPolicyState.draft } });
  // Restore immutable content fields while every fixture row is draft, then
  // restore lifecycle states in a separate statement. This keeps the
  // production non-draft content trigger active during cleanup as well.
  for (const row of fixture.policyRows) await db.aiPolicyBundle.update({ where: { id: row.id }, data: { effectiveAt: row.effectiveAt, activatedAt: row.activatedAt } });
  for (const row of fixture.policyRows) await db.aiPolicyBundle.update({ where: { id: row.id }, data: { state: row.state } });
}

async function main(): Promise<void> {
  if (!databaseUrl || !redisUrl) throw new Error("Set VERA_DISPOSABLE_DATABASE_URL and VERA_DISPOSABLE_REDIS_URL for executable Sprint 5 evidence.");
  requireLocalDatabase(databaseUrl);
  requireLocalRedis(redisUrl);
  assert(!["true", "1", "yes", "on"].includes(liveProvider ?? ""), "live provider must remain disabled");
  process.env.DATABASE_URL = databaseUrl;

  // The accepted Sprint 4 runtime fixture uses the stable disposable tutor
  // identity as its second policy approver. Fresh migration-only databases do
  // not contain application seed users, so provision that one isolated
  // approver before invoking the prior-sprint executable; no configured data
  // or application seed is changed.
  const setupDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  const runtimeApprover = await setupDb.user.findUnique({ where: { email: "tutor@vecalss.local" }, select: { id: true } });
  if (!runtimeApprover) {
    const approverId = randomUUID();
    await setupDb.user.create({ data: { id: approverId, email: "tutor@vecalss.local", fullName: "Vera isolated policy approver", passwordHash: "fixture" } });
    await setupDb.roleAssignment.create({ data: { userId: approverId, role: RoleName.admin } });
    console.log("T12_EVIDENCE fixture=isolated-sprint4-approver provisioned=true");
  }
  await setupDb.$disconnect();

  const evidence: Array<[string, readonly string[]]> = [
    ["test:vera-prisma-sprint5-t11", ["callbacks=chat analysis route review summary ptn drill", "export/hold/account"]],
    ["test:vera-prisma-sprint2", ["actual HTTP route auth/body/privacy/replay/expired DTO assertions", "one provider"]],
    ["test:vera-prisma-sprint4-runtime", ["optional include/read gating", "partition faults return privacy-safe"]],
  ];
  // T11 invokes the already-accepted all-seven callback crash matrix; Sprint 2
  // supplies the authenticated learner flow; Sprint 4 supplies populated T9
  // report and T10 preview/runtime evidence. Every child receives the same
  // local-only env and mock/disabled provider gate.
  const outputs = evidence.map(([script, markers]) => [script, runEvidenceScript(script, markers)] as const);
  const callbackOutput = outputs.find(([script]) => script === "test:vera-prisma-sprint5-t11")?.[1] ?? "";
  const learnerOutput = outputs.find(([script]) => script === "test:vera-prisma-sprint2")?.[1] ?? "";
  const t9t10Output = outputs.find(([script]) => script === "test:vera-prisma-sprint4-runtime")?.[1] ?? "";
  assert.match(callbackOutput.toLowerCase(), /all seven persisted callback tuples/u);
  for (const namespace of ["chat", "analysis", "route", "review", "summary", "ptn", "drill"]) {
    assert(callbackOutput.includes(`T11_EVIDENCE callback_namespace=${namespace}`), `T11 callback evidence did not prove ${namespace}`);
  }
  assert.match(learnerOutput, /PASS vera-prisma-sprint2/u, "Sprint 2 learner flow did not report an executable pass");
  assert.match(t9t10Output, /PASS vera-prisma-sprint4-runtime/u, "Sprint 4 T9/T10 runtime did not report an executable pass");
  for (const line of callbackOutput.split("\n").filter((line) => line.startsWith("T11_EVIDENCE callback_namespace="))) console.log(line);
  console.log("T12_EVIDENCE namespaces=chat analysis route review summary ptn drill source=test:vera-prisma-sprint5-t11 status=pass");
  console.log("T12_EVIDENCE learner_flow=authenticated-http-post-status-usage-replay-cross-student source=test:vera-prisma-sprint2 status=pass");
  console.log("T12_EVIDENCE t9_t10_runtime=populated-report-policy-preview source=test:vera-prisma-sprint4-runtime status=pass");

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
