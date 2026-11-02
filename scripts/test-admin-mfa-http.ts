import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { generateSecret } from "otplib";

import { RoleName } from "../generated/prisma/client";
import { createOpaqueToken, hashToken } from "../lib/auth/crypto";
import { sealMfaSecret } from "../lib/auth/mfa/secret-envelope.mjs";
import { prisma } from "../lib/prisma";

/**
 * Runs the real app (next dev) and calls its pages and API routes with session
 * cookies, so the central guards, the read-only guard and the direct role
 * checks are exercised end to end. Needs port 5023 free and the local database.
 */
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:admin-mfa-http only runs against the local dev database on 127.0.0.1:55432.");
}

const BASE = "http://localhost:5023";
const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeUser(label: string, roles: RoleName[], mustChangePassword = false) {
  const user = await prisma.user.create({
    data: {
      email: `mfa-http-${label}-${runId}@vecalss.local`,
      fullName: `MFA HTTP ${label}`,
      mustChangePassword,
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: roles.map((role) => ({ assignedAt: new Date(Date.now() - 30 * 86_400_000), role })) },
      ...(roles.includes(RoleName.student) ? { studentProfile: { create: { displayName: label, onboardingStatus: "completed" } } } : {}),
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

async function factorFor(userId: string) {
  const secret = generateSecret();
  const factorId = randomUUID();
  await prisma.userMfaFactor.create({
    data: { confirmedAt: new Date(), id: factorId, secretEnvelope: sealMfaSecret(secret, { factorId, userId }), userId },
  });
  return { factorId, secret };
}

async function sessionFor(userId: string, verification?: { factorId: string; secondsAgo: number }) {
  const token = createOpaqueToken();
  const row = await prisma.authSession.create({
    data: { expiresAt: new Date(Date.now() + 3_600_000), refreshTokenHash: hashToken(token), userId },
    select: { id: true },
  });
  if (verification) {
    await prisma.$executeRaw`
      UPDATE auth_sessions
      SET mfa_verified_at = now() - make_interval(secs => ${verification.secondsAgo}), mfa_factor_id = ${verification.factorId}::uuid
      WHERE id = ${row.id}::uuid
    `;
  }
  return { cookie: `vecalss_session=${token}`, id: row.id };
}

const get = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers }, redirect: "manual" });

/**
 * Where a response sends the browser: a Location header, or (when a loading
 * shell was already streaming) the refresh tag Next.js writes for a redirect.
 */
async function redirectOf(response: Response) {
  let location = response.headers.get("location");
  if (!location) {
    const body = await response.text();
    location = body.match(/http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/u)?.[1]?.replace(/&amp;/gu, "&") ?? null;
    assert.ok(location, `expected a redirect, got ${response.status}`);
    assert.ok(!body.includes("Ringkasan operasional") && !body.includes("Aktivitas terbaru"), "no privileged content before the redirect");
  }
  const url = new URL(location, BASE);
  return `${url.pathname}${url.search}`;
}

async function main() {
  const adminId = await makeUser("admin", [RoleName.admin]);
  const adminFactor = await factorFor(adminId);
  const devId = await makeUser("developer", [RoleName.developer]);
  const devFactor = await factorFor(devId);
  const newAdminId = await makeUser("newadmin", [RoleName.admin]);
  const mustChangeId = await makeUser("mustchange", [RoleName.admin], true);
  await factorFor(mustChangeId);
  const tutorId = await makeUser("tutor", [RoleName.tutor]);

  const unverifiedAdmin = await sessionFor(adminId);
  const verifiedAdmin = await sessionFor(adminId, { factorId: adminFactor.factorId, secondsAgo: 60 });
  const staleAdmin = await sessionFor(adminId, { factorId: adminFactor.factorId, secondsAgo: 13 * 3600 });
  const unverifiedDev = await sessionFor(devId);
  const verifiedDev = await sessionFor(devId, { factorId: devFactor.factorId, secondsAgo: 60 });
  const newAdmin = await sessionFor(newAdminId);
  const mustChange = await sessionFor(mustChangeId);
  const tutor = await sessionFor(tutorId);

  const server = spawn(`${process.cwd()}/node_modules/.bin/next`, ["dev", "-p", "5023"], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: "ignore",
  });

  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        await fetch(`${BASE}/login`);
        break;
      } catch {
        await sleep(1000);
      }
    }

    // Central guards: a password-only admin or developer session is sent to /mfa, remembering the page.
    assert.equal(await redirectOf(await get("/admin", unverifiedAdmin.cookie)), "/mfa?returnTo=%2Fadmin");
    assert.equal(await redirectOf(await get("/admin/audit-logs", unverifiedAdmin.cookie)), "/mfa?returnTo=%2Fadmin%2Faudit-logs");
    assert.equal(await redirectOf(await get("/developer/reports", unverifiedDev.cookie)), "/mfa?returnTo=%2Fdeveloper%2Freports");
    assert.equal(await redirectOf(await get("/admin", newAdmin.cookie)), "/mfa?returnTo=%2Fadmin", "no factor yet: enrollment, not access");
    // The page cannot be chosen by the client: the proxy overwrites a forged header.
    assert.equal(
      await redirectOf(await get("/admin/audit-logs", unverifiedAdmin.cookie, { "x-vecalss-return-path": "https://evil.example/x" })),
      "/mfa?returnTo=%2Fadmin%2Faudit-logs",
    );
    // A forced password change comes first.
    assert.equal(await redirectOf(await get("/admin", mustChange.cookie)), "/change-password");

    // Verified sessions get in; stale ones are asked again.
    assert.equal((await get("/admin", verifiedAdmin.cookie)).status, 200);
    assert.equal((await get("/developer/reports", verifiedDev.cookie)).status, 200);
    assert.equal(await redirectOf(await get("/admin", staleAdmin.cookie)), "/mfa?returnTo=%2Fadmin", "13 hours after the last code");

    // Read-only guard (admin API routes): redirect when unverified, served when verified.
    assert.equal(await redirectOf(await get("/api/admin/imports/templates/students.v1", unverifiedAdmin.cookie)), "/mfa");
    assert.equal((await get("/api/admin/imports/templates/students.v1", verifiedAdmin.cookie)).status, 200);

    // Direct role check in the media library (admin scope).
    const unverifiedMedia = await get("/api/media/admin", unverifiedAdmin.cookie);
    assert.equal(unverifiedMedia.status, 403);
    assert.equal((await get("/api/media/admin", staleAdmin.cookie)).status, 403);
    assert.equal((await get("/api/media/admin", verifiedAdmin.cookie)).status, 200);

    // The verification screen itself.
    const challenge = await get("/mfa", unverifiedAdmin.cookie);
    assert.equal(challenge.status, 200);
    assert.match(await challenge.text(), /Verifikasi dua langkah/u);
    const enroll = await get("/mfa", newAdmin.cookie);
    assert.equal(enroll.status, 200);
    assert.match(await enroll.text(), /Kode pendaftaran/u);
    assert.equal(await redirectOf(await get("/mfa")), "/login");
    assert.equal(await redirectOf(await get("/mfa", mustChange.cookie)), "/change-password");
    // Verified accounts do not linger on it, and an open redirect through returnTo is refused.
    assert.equal(await redirectOf(await get("/mfa?returnTo=%2Fadmin%2Faudit-logs", verifiedAdmin.cookie)), "/admin/audit-logs");
    assert.equal(await redirectOf(await get("/mfa?returnTo=https%3A%2F%2Fevil.example", verifiedAdmin.cookie)), "/admin");

    // Non-privileged accounts never meet it.
    assert.equal(await redirectOf(await get("/mfa", tutor.cookie)), "/mentor/dashboard");
    assert.equal(await redirectOf(await get("/admin", tutor.cookie)), "/mentor/dashboard");
    assert.equal((await get("/mentor/dashboard", tutor.cookie)).status, 200);

    // Signing out and back in leaves nothing behind: a new session is unverified again.
    const again = await sessionFor(adminId);
    assert.equal(await redirectOf(await get("/admin", again.cookie)), "/mfa?returnTo=%2Fadmin");

    console.log("Admin two-step verification HTTP checks passed.");
  } finally {
    server.kill("SIGTERM");
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userMfaFactor.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.mfaFailedAttempt.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.mfaSetupCode.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.updateMany({ data: { status: "disabled" }, where: { id: { in: userIds } } });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

