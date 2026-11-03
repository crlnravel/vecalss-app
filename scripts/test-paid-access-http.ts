import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, openSync, readFileSync } from "node:fs";

import { generateSecret } from "otplib";

import { RoleName } from "../generated/prisma/client";
import { createOpaqueToken, hashToken } from "../lib/auth/crypto";
import { sealMfaSecret } from "../lib/auth/mfa/secret-envelope.mjs";
import { grantAccess, pauseAccess, revokeAccess } from "../lib/billing/service";
import { prisma } from "../lib/prisma";

/**
 * Runs the real app (next dev) and calls its student pages, API routes and
 * server actions with session cookies, once with PAID_ACCESS_ENFORCED off and
 * once on. Off: every student surface behaves as before. On: every paid surface
 * refuses a student without running access and serves one with it, whether the
 * call comes from a page, a route or a direct server-action request.
 * Needs port 5023 free and the local database.
 */
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:paid-access-http only runs against the local dev database on 127.0.0.1:55432.");
}

const BASE = "http://localhost:5023";
const ROOT = process.cwd();
const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const UUID_A = "00000000-0000-4000-8000-0000000000a1";
const UUID_B = "00000000-0000-4000-8000-0000000000b2";

async function makeUser(label: string, role: RoleName) {
  const user = await prisma.user.create({
    data: {
      email: `paid-http-${label}-${runId}@vecalss.local`,
      fullName: `Paid HTTP ${label}`,
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: [{ role }] },
      ...(role === RoleName.student ? { studentProfile: { create: { displayName: label, onboardingStatus: "completed" } } } : {}),
    },
    select: { id: true },
  });
  // Granted long ago on database time, like every other role assignment fixture.
  await prisma.$executeRaw`UPDATE role_assignments SET assigned_at = now() - make_interval(days => 30) WHERE user_id = ${user.id}::uuid`;
  userIds.push(user.id);
  return user.id;
}

async function sessionFor(userId: string, verification?: { factorId: string }) {
  const token = createOpaqueToken();
  const row = await prisma.authSession.create({
    data: { expiresAt: new Date(Date.now() + 3_600_000), refreshTokenHash: hashToken(token), userId },
    select: { id: true },
  });
  if (verification) {
    await prisma.$executeRaw`
      UPDATE auth_sessions SET mfa_verified_at = now(), mfa_factor_id = ${verification.factorId}::uuid WHERE id = ${row.id}::uuid
    `;
  }
  return `vecalss_session=${token}`;
}

async function adminWithFactor() {
  const adminId = await makeUser("admin", RoleName.admin);
  const secret = generateSecret();
  const factorId = randomUUID();
  await prisma.userMfaFactor.create({
    data: { confirmedAt: new Date(), id: factorId, secretEnvelope: sealMfaSecret(secret, { factorId, userId: adminId }), userId: adminId },
  });
  return { adminId, factorId };
}

function startServer(enforced: string | null): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (enforced === null) delete env.PAID_ACCESS_ENFORCED;
  else env.PAID_ACCESS_ENFORCED = enforced;
  // Set PAID_TEST_SERVER_LOG to a file path to keep the server's output while debugging.
  const log = process.env.PAID_TEST_SERVER_LOG ? openSync(process.env.PAID_TEST_SERVER_LOG, "a") : "ignore";
  return spawn(`${ROOT}/node_modules/.bin/next`, ["dev", "-p", "5023"], { cwd: ROOT, env, stdio: ["ignore", log, log] });
}

async function stopServer(server: ChildProcess) {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    server.once("exit", resolve);
    setTimeout(resolve, 5000);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      await fetch(`${BASE}/login`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("the dev server did not start");
}

const get = (path: string, cookie?: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { redirect: "manual", ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });

/** Where a response sends the browser: a Location header or the refresh tag Next writes once a shell is streaming. */
async function redirectTarget(response: Response) {
  const header = response.headers.get("location") ?? response.headers.get("x-action-redirect");
  if (header) return new URL(header.split(";")[0], BASE).pathname;

  const body = await response.text();
  const tag = body.match(/http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/u)?.[1];
  return tag ? new URL(tag.replace(/&amp;/gu, "&"), BASE).pathname : null;
}

// Every learning surface, and the few a student needs whatever their package.
const PAID_PAGES = [
  "/dashboard",
  "/courses",
  "/courses/no-such-course",
  "/courses/no-such-course/no-lesson",
  "/videos",
  "/quiz",
  "/quiz/no-such-subject",
  "/quiz/no-such-subject/no-quiz",
  "/quiz/no-such-subject/no-quiz/result",
  "/tryout",
  `/tryout/${UUID_A}`,
  `/tryout/${UUID_A}/register`,
  `/tryout/${UUID_A}/waiting`,
  `/tryout/attempt/${UUID_B}`,
  `/tryout/attempt/${UUID_B}/result`,
  "/vera-ai",
];
const OPEN_PAGES = ["/settings", "/notifications", "/akses-paket", "/pricing"];

const PAID_APIS: Array<{ body?: string; method: string; path: string }> = [
  { method: "GET", path: "/api/vera/usage" },
  { method: "GET", path: "/api/vera/conversations" },
  { method: "POST", path: "/api/vera/conversations" },
  { method: "GET", path: "/api/vera/mentions?q=ab" },
  { method: "PATCH", path: `/api/vera/conversations/${UUID_A}`, body: "{}" },
  { method: "DELETE", path: `/api/vera/conversations/${UUID_A}` },
  { method: "GET", path: "/api/vera/studio" },
  { method: "POST", path: "/api/vera/studio", body: "{}" },
  { method: "GET", path: `/api/vera/studio/${UUID_A}` },
  { method: "DELETE", path: `/api/vera/studio/${UUID_A}` },
  { method: "POST", path: "/api/vera/chat", body: "{}" },
  { method: "GET", path: "/api/courses/no-such-course/no-lesson/document" },
  { method: "POST", path: "/api/courses/no-such-course/no-lesson/progress", body: "{}" },
  { method: "GET", path: `/api/tryout/recovery?kind=register&tryoutId=${UUID_A}` },
];
const OPEN_APIS = ["/api/notifications"];

// Server actions a student can call. All but the unpaid exemptions are paid.
const PAID_ACTIONS: Array<{ exportedName: string; filename: string }> = [
  { exportedName: "startQuizAction", filename: "modules/quiz/actions.ts" },
  { exportedName: "saveQuizAnswerAction", filename: "modules/quiz/actions.ts" },
  { exportedName: "submitQuizAction", filename: "modules/quiz/actions.ts" },
  { exportedName: "syncQuizAttemptClockAction", filename: "modules/quiz/actions.ts" },
  { exportedName: "registerForTryoutAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "registerForTryoutWithTargetAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "startTryoutAttemptAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "tryoutAttemptStateAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "startActiveTryoutTestRunAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "startTryoutDisconnectAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "reconcileTryoutDisconnectAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "saveTryoutAnswerAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "sealTryoutTestRunAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "recordTryoutIntegrityEventAction", filename: "modules/tryout/participant-actions.ts" },
  { exportedName: "participantTryoutResultAction", filename: "modules/tryout/participant-actions.ts" },
];

function actionIds() {
  const manifest = [`${ROOT}/.next/dev/server/server-reference-manifest.json`, `${ROOT}/.next/server/server-reference-manifest.json`].find(existsSync);
  assert.ok(manifest, "the server reference manifest is missing");
  const node = JSON.parse(readFileSync(manifest, "utf8")).node as Record<string, { exportedName: string; filename: string }>;
  return new Map(Object.entries(node).map(([id, value]) => [`${value.filename}#${value.exportedName}`, id]));
}

function callAction(id: string, pagePath: string, cookie: string | undefined, args: unknown[]) {
  return fetch(`${BASE}${pagePath}`, {
    body: JSON.stringify(args),
    headers: { "Content-Type": "text/plain;charset=UTF-8", "Next-Action": id, ...(cookie ? { cookie } : {}) },
    method: "POST",
    redirect: "manual",
  });
}

/** manageStudentAccessAction takes (previousState, formData); this is the form body Next decodes for that. */
function callAccessAction(id: string, cookie: string | undefined, fields: Record<string, string>) {
  const form = new FormData();
  // The referenced form fields come before the root entry, as React's own encoder writes them.
  for (const [name, value] of Object.entries(fields)) form.set(`_1_${name}`, value);
  form.set("0", JSON.stringify([{ status: "idle" }, "$K1"]));
  return fetch(`${BASE}/admin`, {
    body: form,
    headers: { "Next-Action": id, ...(cookie ? { cookie } : {}) },
    method: "POST",
    redirect: "manual",
  });
}

async function main() {
  const base = { actorUserId: null as string | null, reason: "paid access test", source: "admin" as const };
  const { adminId, factorId } = await adminWithFactor();
  const grantor = { ...base, actorUserId: adminId };

  const none = await makeUser("none", RoleName.student);
  const active = await makeUser("active", RoleName.student);
  const expired = await makeUser("expired", RoleName.student);
  const paused = await makeUser("paused", RoleName.student);
  const revoked = await makeUser("revoked", RoleName.student);
  const target = await makeUser("target", RoleName.student);
  const tutor = await makeUser("tutor", RoleName.tutor);

  await grantAccess({ ...grantor, idempotencyKey: `http-${runId}-active`, plan: "monthly", studentId: active });
  await grantAccess({ ...grantor, idempotencyKey: `http-${runId}-expired`, now: new Date(Date.now() - 90 * 86_400_000), plan: "monthly", studentId: expired });
  await grantAccess({ ...grantor, idempotencyKey: `http-${runId}-paused`, plan: "monthly", studentId: paused });
  await pauseAccess({ ...grantor, idempotencyKey: `http-${runId}-paused-p`, studentId: paused });
  await grantAccess({ ...grantor, idempotencyKey: `http-${runId}-revoked`, plan: "monthly", studentId: revoked });
  await revokeAccess({ ...grantor, idempotencyKey: `http-${runId}-revoked-r`, studentId: revoked });

  const cookies = {
    active: await sessionFor(active),
    admin: await sessionFor(adminId, { factorId }),
    adminUnverified: await sessionFor(adminId),
    expired: await sessionFor(expired),
    none: await sessionFor(none),
    paused: await sessionFor(paused),
    revoked: await sessionFor(revoked),
    tutor: await sessionFor(tutor),
  };
  const withoutAccess = ["none", "expired", "paused", "revoked"] as const;

  // ---- Switch OFF: exactly as before ------------------------------------
  let server = startServer(null);
  try {
    await waitForServer();
    for (const who of ["none", "active"] as const) {
      for (const path of [...PAID_PAGES, ...OPEN_PAGES]) {
        const response = await get(path, cookies[who]);
        assert.notEqual(await redirectTarget(response), "/akses-paket", `off: ${who} ${path}`);
      }
      for (const api of PAID_APIS) {
        const response = await get(api.path, cookies[who], { body: api.body, headers: api.body ? { "content-type": "application/json" } : {}, method: api.method } satisfies RequestInit);
        const body = await response.text();
        assert.ok(!body.includes("paid_access_required"), `off: ${who} ${api.method} ${api.path}`);
      }
    }
    // The page that explains a missing package has nothing to say while the switch is off.
    assert.equal(await redirectTarget(await get("/akses-paket", cookies.none)), "/dashboard");

    const ids = actionIds();
    for (const action of PAID_ACTIONS) {
      const id = ids.get(`${action.filename}#${action.exportedName}`);
      if (!id) continue;
      const response = await callAction(id, "/quiz", cookies.none, [UUID_A, UUID_B, "x", "y"]);
      assert.notEqual(await redirectTarget(response), "/akses-paket", `off: action ${action.exportedName}`);
    }
  } finally {
    await stopServer(server);
  }

  // ---- Switch ON ---------------------------------------------------------
  server = startServer("1");
  try {
    await waitForServer();

    // Pages: a student without running access is sent to the explanation, one with access gets in.
    for (const path of PAID_PAGES) {
      for (const who of withoutAccess) {
        assert.equal(await redirectTarget(await get(path, cookies[who])), "/akses-paket", `on: ${who} ${path}`);
      }
      assert.notEqual(await redirectTarget(await get(path, cookies.active)), "/akses-paket", `on: active ${path}`);
    }
    // What a student keeps whatever the package.
    for (const path of ["/settings", "/notifications", "/pricing"]) {
      for (const who of withoutAccess) {
        assert.notEqual(await redirectTarget(await get(path, cookies[who])), "/akses-paket", `on: ${who} ${path}`);
      }
    }
    for (const who of withoutAccess) {
      const page = await get("/akses-paket", cookies[who]);
      assert.equal(page.status, 200, `the explanation renders for ${who}`);
      const html = await page.text();
      assert.match(html, /href="\/pricing"/u, "links to the pricing page");
      assert.match(html, who === "expired" ? /sudah berakhir/u : who === "paused" ? /sedang dijeda/u : who === "revoked" ? /sudah dihentikan/u : /belum termasuk dalam paketmu/u);
    }
    assert.equal(await redirectTarget(await get("/akses-paket", cookies.active)), "/dashboard", "a student with access has nothing to read there");

    // API routes: 403 with the paid-access code, or served.
    for (const api of PAID_APIS) {
      const init: RequestInit = { body: api.body, headers: api.body ? { "content-type": "application/json" } : {}, method: api.method };
      for (const who of withoutAccess) {
        const response = await get(api.path, cookies[who], init);
        const text = await response.text();
        assert.equal(response.status, 403, `on: ${who} ${api.method} ${api.path}`);
        if (!api.path.startsWith("/api/tryout/recovery")) assert.match(text, /paid_access_required/u, `${api.method} ${api.path}`);
      }
      const served = await get(api.path, cookies.active, init);
      const servedText = await served.text();
      assert.ok(!servedText.includes("paid_access_required"), `on: active ${api.method} ${api.path}`);
      if (api.path.startsWith("/api/tryout/recovery")) assert.notEqual(served.status, 403, "recovery is served to a student with access");
    }
    for (const path of OPEN_APIS) {
      for (const who of withoutAccess) {
        assert.ok(!(await (await get(path, cookies[who])).text()).includes("paid_access_required"), `on: ${who} ${path}`);
      }
    }

    // Direct server-action calls (the same boundary the pages use).
    const ids = actionIds();
    let called = 0;
    for (const action of PAID_ACTIONS) {
      const id = ids.get(`${action.filename}#${action.exportedName}`);
      if (!id) continue;
      called += 1;
      for (const who of withoutAccess) {
        const response = await callAction(id, "/quiz", cookies[who], [UUID_A, UUID_B, "x", "y"]);
        assert.equal(await redirectTarget(response), "/akses-paket", `on: ${who} action ${action.exportedName}`);
      }
      const response = await callAction(id, "/quiz", cookies.active, [UUID_A, UUID_B, "x", "y"]);
      assert.notEqual(await redirectTarget(response), "/akses-paket", `on: active action ${action.exportedName}`);
    }
    assert.ok(called >= 8, `the manifest exposed ${called} paid student actions`);
    console.log(`paid student actions called directly: ${called}`);

    // The admin action: admin only, and with a verified second factor.
    // The student page renders the panel for a verified admin, which also makes the action callable.
    const adminPage = await get(`/admin/enrollment/${target}`, cookies.admin);
    assert.equal(adminPage.status, 200);
    const adminHtml = await adminPage.text();
    assert.match(adminHtml, /Paket belajar/u);
    assert.match(adminHtml, /Belum punya paket/u);
    assert.match(adminHtml, /Pembatasan paket belum diaktifkan|Riwayat akses/u);
    await sleep(1500);
    const accessActionId = actionIds().get("modules/admin/billing-actions.ts#manageStudentAccessAction");
    assert.ok(accessActionId, "the admin access action is exposed");
    const fields = (key: string) => ({ idempotencyKey: key, operation: "grant", plan: "monthly", reason: "uji tindakan admin", studentId: target });
    const targetEvents = () => prisma.billingAccessEvent.count({ where: { studentId: target } });

    assert.equal(await redirectTarget(await callAccessAction(accessActionId, undefined, fields(`k-anon-${runId}`))), "/login");
    assert.equal(await redirectTarget(await callAccessAction(accessActionId, cookies.active, fields(`k-student-${runId}`))), "/dashboard", "a student");
    assert.ok((await redirectTarget(await callAccessAction(accessActionId, cookies.tutor, fields(`k-tutor-${runId}`))))?.startsWith("/mentor"), "a tutor");
    assert.equal(await redirectTarget(await callAccessAction(accessActionId, cookies.adminUnverified, fields(`k-unverified-${runId}`))), "/mfa", "an admin without a second factor");
    assert.equal(await targetEvents(), 0, "none of those changed anything");

    const applied = await callAccessAction(accessActionId, cookies.admin, fields(`k-admin-${runId}`));
    assert.equal(applied.status, 200);
    assert.match(await applied.text(), /"status":"success"/u);
    assert.equal(await targetEvents(), 1, "a verified admin changes access");
    const event = await prisma.billingAccessEvent.findFirstOrThrow({ where: { studentId: target } });
    assert.equal(event.actorUserId, adminId);
    assert.equal(event.source, "admin");
    assert.equal(await prisma.auditLog.count({ where: { action: "billing.access.grant", targetId: target } }), 1);
    // The same form submitted twice is recorded once.
    const repeated = await callAccessAction(accessActionId, cookies.admin, fields(`k-admin-${runId}`));
    assert.match(await repeated.text(), /sudah tercatat/u);
    assert.equal(await targetEvents(), 1);
    // The student the admin just granted gets in.
    const targetCookie = await sessionFor(target);
    assert.notEqual(await redirectTarget(await get("/dashboard", targetCookie)), "/akses-paket");
  } finally {
    await stopServer(server);
  }

  console.log("Paid access HTTP checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (userIds.length) {
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userMfaFactor.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.updateMany({ data: { status: "disabled" }, where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });
