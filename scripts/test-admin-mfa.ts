import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { generateSecret, generateSync } from "otplib";

import { RoleName } from "../generated/prisma/client";
import { getDefaultHomePath, getMfaGatePath, getSafeMfaReturnPath } from "../lib/auth/paths";
import { hashToken, createOpaqueToken } from "../lib/auth/crypto";
import { isActiveKaptenOrAdmin } from "../lib/auth/kapten-access";
import {
  MFA_ATTEMPT_WINDOW_MINUTES,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_REVERIFY_SECONDS,
  RECOVERY_CODE_COUNT,
  SETUP_CODE_TTL_MINUTES,
} from "../lib/auth/mfa/constants";
import {
  generateOneUseCode,
  hashOneUseCode,
  normalizeOneUseCode,
} from "../lib/auth/mfa/codes.mjs";
import { kaptenOrAdminRoleSql } from "../lib/auth/mfa/data-layer";
import { loadMfaKeyRing, openMfaSecret, rewrapMfaSecret, sealMfaSecret } from "../lib/auth/mfa/secret-envelope.mjs";
import {
  confirmEnrollment,
  getPendingEnrollment,
  startEnrollment,
  verifyRecoveryCode,
  verifyTotpChallenge,
} from "../lib/auth/mfa/service";
import {
  getReadOnlySessionContextForToken,
  getSessionContextForToken,
} from "../lib/auth/session";
import { changePasswordForUser } from "../lib/auth/service";
import { hasDeveloperReportAccess } from "../lib/reports/access";
import { prisma } from "../lib/prisma";
import { assertBannerDeliverySession } from "../lib/banner/delivery";
import { requireTryoutCapability, TryoutCapabilityError } from "../lib/tryout/capabilities";
import { searchTryoutInvitationStudents } from "../lib/tryout/invitation-picker";
import { Prisma } from "../generated/prisma/client";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:admin-mfa only runs against the local dev database on 127.0.0.1:55432.");
}

const runId = randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const STEP = 30;
const currentEpoch = () => Math.floor(Date.now() / 1000);
const codeAt = (secret: string, epoch = currentEpoch()) => generateSync({ epoch, secret, strategy: "totp" });
const stepOf = (epoch = currentEpoch()) => Math.floor(epoch / STEP);

async function makeUser(label: string, roles: RoleName[], extra: { mustChangePassword?: boolean } = {}) {
  const user = await prisma.user.create({
    data: {
      email: `mfa-test-${label}-${runId}@vecalss.local`,
      fullName: `MFA Test ${label}`,
      mustChangePassword: extra.mustChangePassword ?? false,
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: roles.map((role) => ({ role })) },
    },
    select: { email: true, id: true },
  });
  // Granted long ago on database time, so only a role granted later (see below) forces a new check.
  await prisma.$executeRaw`UPDATE role_assignments SET assigned_at = now() - make_interval(days => 30) WHERE user_id = ${user.id}::uuid`;
  createdUserIds.push(user.id);
  return user;
}

async function makeSession(userId: string) {
  const token = createOpaqueToken();
  const row = await prisma.authSession.create({
    data: {
      expiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenHash: hashToken(token),
      userId,
    },
    select: { id: true },
  });
  return { id: row.id, token };
}

/** A confirmed factor with a known secret, sealed under the current key ring. */
async function provisionFactor(userId: string) {
  const secret = generateSecret();
  const factorId = randomUUID();
  await prisma.userMfaFactor.create({
    data: {
      confirmedAt: new Date(),
      id: factorId,
      lastAcceptedStep: stepOf() - 5,
      secretEnvelope: sealMfaSecret(secret, { factorId, userId }),
      userId,
    },
  });
  return { factorId, secret };
}

async function markVerified(sessionId: string, factorId: string, secondsAgo = 0) {
  await prisma.$executeRaw`
    UPDATE auth_sessions
    SET mfa_verified_at = now() - make_interval(secs => ${secondsAgo}), mfa_factor_id = ${factorId}::uuid
    WHERE id = ${sessionId}::uuid
  `;
}

async function secretOf(userId: string) {
  const factor = await prisma.userMfaFactor.findUniqueOrThrow({ where: { userId } });
  return { factorId: factor.id, secret: openMfaSecret(factor.secretEnvelope, { factorId: factor.id, userId }) };
}

async function failuresOf(userId: string, kind?: string) {
  return prisma.mfaFailedAttempt.count({ where: { kind, userId } });
}

async function contextOf(token: string) {
  const session = await getSessionContextForToken(token);
  assert.ok(session, "session should resolve");
  return session;
}

async function issueSetupCode(userId: string, { expiresInSeconds = 600 } = {}) {
  const code = generateOneUseCode();
  const row = await prisma.mfaSetupCode.create({
    data: {
      codeHash: hashOneUseCode(normalizeOneUseCode(code) as string),
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      issuedBy: "Test Operator",
      reason: "test enrollment",
      userId,
    },
  });
  return { code, id: row.id };
}

function runScript(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

const ORIGINAL_RING = process.env.MFA_KEY_RING;
const ORIGINAL_ACTIVE = process.env.MFA_ACTIVE_KEY_ID;
const ORIGINAL_REDIS = process.env.REDIS_URL;

async function main() {
  // ---- Secret envelope --------------------------------------------------
  const owner = { factorId: randomUUID(), userId: randomUUID() };
  const sealed = sealMfaSecret("JBSWY3DPEHPK3PXP", owner);
  assert.equal(openMfaSecret(sealed, owner), "JBSWY3DPEHPK3PXP");
  assert.notEqual(JSON.stringify(sealed).includes("JBSWY3DPEHPK3PXP"), true, "no plaintext in the envelope");
  assert.throws(() => openMfaSecret(sealed, { ...owner, userId: randomUUID() }), /failed authentication/u, "bound to the owner");
  assert.throws(() => openMfaSecret(sealed, { ...owner, factorId: randomUUID() }), /failed authentication/u);
  assert.throws(
    () => openMfaSecret({ ...sealed, ciphertext: Buffer.from("tampered!!").toString("base64") }, owner),
    /failed authentication/u,
  );
  assert.throws(() => openMfaSecret({ ...sealed, extra: 1 }, owner), /shape/u);

  const keyA = Buffer.alloc(32, 1).toString("base64");
  const keyB = Buffer.alloc(32, 2).toString("base64");
  const ringA = loadMfaKeyRing({ MFA_ACTIVE_KEY_ID: "a", MFA_KEY_RING: JSON.stringify({ a: keyA }) } as unknown as NodeJS.ProcessEnv);
  const ringAB = loadMfaKeyRing({ MFA_ACTIVE_KEY_ID: "b", MFA_KEY_RING: JSON.stringify({ a: keyA, b: keyB }) } as unknown as NodeJS.ProcessEnv);
  const ringBOnly = loadMfaKeyRing({ MFA_ACTIVE_KEY_ID: "b", MFA_KEY_RING: JSON.stringify({ b: keyB }) } as unknown as NodeJS.ProcessEnv);
  const sealedA = sealMfaSecret("SECRET", owner, ringA);
  assert.equal(sealedA.keyId, "a");
  assert.equal(openMfaSecret(sealedA, owner, ringAB), "SECRET", "rotation: old key still opens");
  const rewrapped = rewrapMfaSecret(sealedA, owner, ringAB);
  assert.equal(rewrapped.keyId, "b");
  assert.equal(openMfaSecret(rewrapped, owner, ringBOnly), "SECRET", "after rewrap the old key is no longer needed");
  assert.throws(() => openMfaSecret(sealedA, owner, ringBOnly), /key ring/u);
  for (const [env, pattern] of [
    [{}, /MFA_KEY_RING is required/u],
    [{ MFA_KEY_RING: "{}", MFA_ACTIVE_KEY_ID: "a" }, /at least one key/u],
    [{ MFA_KEY_RING: "not json", MFA_ACTIVE_KEY_ID: "a" }, /valid JSON/u],
    [{ MFA_KEY_RING: JSON.stringify({ a: "c2hvcnQ=" }), MFA_ACTIVE_KEY_ID: "a" }, /32-byte/u],
    [{ MFA_KEY_RING: JSON.stringify({ a: keyA }), MFA_ACTIVE_KEY_ID: "zzz" }, /not in MFA_KEY_RING/u],
    [{ MFA_KEY_RING: JSON.stringify({ a: keyA }) }, /MFA_ACTIVE_KEY_ID is required/u],
  ] as const) {
    assert.throws(() => loadMfaKeyRing(env as unknown as NodeJS.ProcessEnv), pattern);
  }

  // ---- One-use codes ----------------------------------------------------
  const generated = generateOneUseCode();
  assert.match(generated, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/u);
  assert.equal(normalizeOneUseCode(generated.toLowerCase()), normalizeOneUseCode(generated));
  assert.equal(normalizeOneUseCode("rc0o-seed-test"), normalizeOneUseCode("RC00-SEED-TEST"), "look-alikes map");
  assert.equal(normalizeOneUseCode("short"), null);
  assert.equal(normalizeOneUseCode("ILLEGAL-UUUU-CHAR"), null);
  assert.equal(normalizeOneUseCode(42), null);
  assert.notEqual(hashOneUseCode("AAAA"), hashOneUseCode("AAAB"));
  assert.equal(new Set(Array.from({ length: 200 }, generateOneUseCode)).size, 200);
  assert.equal(RECOVERY_CODE_COUNT, 10);
  assert.equal(MFA_REVERIFY_SECONDS, 12 * 3600);

  // ---- Return paths and home routing -----------------------------------
  assert.equal(getSafeMfaReturnPath("/admin/imports?x=1"), "/admin/imports?x=1");
  assert.equal(getSafeMfaReturnPath("/developer/reports"), "/developer/reports");
  for (const bad of ["//evil.example/admin", "https://evil.example/admin", "/adminx", "/mfa", "/dashboard", "/admin\\evil", "/admin /x", null, 7]) {
    assert.equal(getSafeMfaReturnPath(bad), null, String(bad));
  }
  const pendingUser = { email: "a@b.c", fullName: "A", id: "1", mfaStatus: "challenge" as const, mustChangePassword: false, onboardingStatus: null, roles: [], status: "active" as const };
  assert.equal(getDefaultHomePath(pendingUser), "/mfa");
  assert.equal(getDefaultHomePath({ ...pendingUser, mustChangePassword: true }), "/change-password", "forced password change first");
  assert.equal(getMfaGatePath(pendingUser, "/admin/imports"), "/mfa?returnTo=%2Fadmin%2Fimports");
  assert.equal(getMfaGatePath(pendingUser, "//evil"), "/mfa");
  assert.equal(getDefaultHomePath({ ...pendingUser, mfaStatus: "verified", roles: [RoleName.admin] }), "/admin");

  // ---- Fixtures --------------------------------------------------------
  const admin = await makeUser("admin", [RoleName.admin]);
  const developer = await makeUser("developer", [RoleName.developer]);
  const adminTutor = await makeUser("admintutor", [RoleName.admin, RoleName.tutor]);
  const tutor = await makeUser("tutor", [RoleName.tutor]);
  const student = await makeUser("student", [RoleName.student]);

  // ---- Non-privileged accounts never see MFA ---------------------------
  for (const user of [tutor, student]) {
    const { token } = await makeSession(user.id);
    const context = await contextOf(token);
    assert.equal(context.user.mfaStatus, "not_required");
    assert.ok(context.user.roles.length === 1);
  }

  // ---- First enrollment: no factor, password-only session ---------------
  {
    const { id: sessionId, token } = await makeSession(admin.id);
    for (const read of [getSessionContextForToken, getReadOnlySessionContextForToken]) {
      const context = await read(token);
      assert.ok(context);
      assert.equal(context.user.mfaStatus, "enroll");
      assert.deepEqual(context.user.roles, [], "an unverified admin carries no admin role");
      assert.equal(getDefaultHomePath(context.user), "/mfa");
    }

    // Without a setup code (wrong, malformed, expired, already used) nothing is enrolled.
    const noCode = await startEnrollment({ sessionId, setupCode: "", userId: admin.id });
    assert.deepEqual(noCode, { ok: false, reason: "invalid" });
    assert.deepEqual(await startEnrollment({ sessionId, setupCode: generateOneUseCode(), userId: admin.id }), { ok: false, reason: "invalid" });

    const expired = await issueSetupCode(admin.id, { expiresInSeconds: -60 });
    assert.deepEqual(await startEnrollment({ sessionId, setupCode: expired.code, userId: admin.id }), { ok: false, reason: "invalid" });
    const spent = await issueSetupCode(admin.id);
    await prisma.mfaSetupCode.update({ data: { usedAt: new Date() }, where: { id: spent.id } });
    assert.deepEqual(await startEnrollment({ sessionId, setupCode: spent.code, userId: admin.id }), { ok: false, reason: "invalid" });
    assert.equal(await prisma.userMfaFactor.count({ where: { userId: admin.id } }), 0, "no factor without a valid setup code");
    assert.equal(await failuresOf(admin.id, "setup"), 4);
    assert.equal((await contextOf(token)).user.mfaStatus, "enroll");

    // A non-privileged account cannot enroll even with a code.
    const studentSession = await makeSession(student.id);
    const studentCode = await issueSetupCode(student.id);
    assert.deepEqual(
      await startEnrollment({ sessionId: studentSession.id, setupCode: studentCode.code, userId: student.id }),
      { ok: false, reason: "not_privileged" },
    );

    // A valid code starts a pending enrollment owned by this session only.
    const valid = await issueSetupCode(admin.id);
    assert.deepEqual(await startEnrollment({ sessionId, setupCode: valid.code.toLowerCase(), userId: admin.id }), { ok: true });
    const pending = await getPendingEnrollment({ accountLabel: admin.email, sessionId, userId: admin.id });
    assert.ok(pending);
    assert.match(pending.qrSvg, /^<svg/u);
    assert.match(pending.manualKey, /^[A-Z2-7 ]+$/u);
    const other = await makeSession(admin.id);
    assert.equal(await getPendingEnrollment({ accountLabel: admin.email, sessionId: other.id, userId: admin.id }), null, "another session cannot see the pending key");
    assert.deepEqual(
      await confirmEnrollment({ code: "123456", sessionId: other.id, userId: admin.id }),
      { ok: false, reason: "expired" },
      "another session cannot confirm",
    );
    // Pending is not enabled: still unprivileged.
    assert.equal((await contextOf(token)).user.mfaStatus, "enroll");

    // Wrong code does not enable it.
    const { secret } = await (async () => {
      const factor = await prisma.userMfaFactor.findUniqueOrThrow({ where: { userId: admin.id } });
      return { secret: openMfaSecret(factor.secretEnvelope, { factorId: factor.id, userId: admin.id }) };
    })();
    await prisma.mfaFailedAttempt.deleteMany({ where: { userId: admin.id } });
    const wrong = codeAt(secret) === "000000" ? "000001" : "000000";
    assert.deepEqual(await confirmEnrollment({ code: wrong, sessionId, userId: admin.id }), { ok: false, reason: "invalid" });
    assert.equal((await prisma.userMfaFactor.findUniqueOrThrow({ where: { userId: admin.id } })).confirmedAt, null);

    // The right code enables it: recovery codes, verified session, spent setup code.
    const confirmed = await confirmEnrollment({ code: codeAt(secret), sessionId, userId: admin.id });
    assert.ok(confirmed.ok);
    assert.equal(confirmed.recoveryCodes.length, RECOVERY_CODE_COUNT);
    assert.equal(new Set(confirmed.recoveryCodes).size, RECOVERY_CODE_COUNT);
    const stored = await prisma.mfaRecoveryCode.findMany({ where: { factor: { userId: admin.id } } });
    assert.equal(stored.length, RECOVERY_CODE_COUNT);
    for (const code of confirmed.recoveryCodes) assert.ok(!stored.some((row) => row.codeHash === code), "stored hashed only");
    assert.deepEqual(
      new Set(stored.map((row) => row.codeHash)),
      new Set(confirmed.recoveryCodes.map((code) => hashOneUseCode(normalizeOneUseCode(code) as string))),
    );
    assert.notEqual((await prisma.mfaSetupCode.findUniqueOrThrow({ where: { id: valid.id } })).usedAt, null, "setup code spent");
    const verifiedContext = await contextOf(token);
    assert.equal(verifiedContext.user.mfaStatus, "verified");
    assert.ok(verifiedContext.user.roles.includes(RoleName.admin));
    assert.equal((await contextOf(other.token)).user.mfaStatus, "challenge", "a second session is not verified by this one");

    // The spent code cannot enroll again; the factor cannot be replaced from the web.
    assert.deepEqual(await startEnrollment({ sessionId: other.id, setupCode: valid.code, userId: admin.id }), { ok: false, reason: "already_enrolled" });
    const audited = await prisma.auditLog.findMany({ where: { action: "auth.mfa.enrolled", targetId: admin.id } });
    assert.equal(audited.length, 1);
  }

  // ---- Challenge, replay and the 12-hour boundary -----------------------
  {
    const adminSecret = await secretOf(admin.id);
    const session1 = await makeSession(admin.id);
    const session2 = await makeSession(admin.id);
    assert.equal((await contextOf(session1.token)).user.mfaStatus, "challenge");
    assert.deepEqual((await contextOf(session1.token)).user.roles, []);

    // Wrong and malformed codes fail.
    for (const bad of ["", "12345", "abcdef", "1234567", null]) {
      assert.deepEqual(await verifyTotpChallenge({ code: bad, sessionId: session1.id, userId: admin.id }), { ok: false, reason: "invalid" });
    }
    assert.equal((await contextOf(session1.token)).user.mfaStatus, "challenge");

    // Allow one fresh step, accept it once, refuse it again (replay) from any session.
    await prisma.userMfaFactor.update({ data: { lastAcceptedStep: stepOf() - 5 }, where: { userId: admin.id } });
    await prisma.mfaFailedAttempt.deleteMany({ where: { userId: admin.id } });
    const code = codeAt(adminSecret.secret);
    assert.deepEqual(await verifyTotpChallenge({ code: ` ${code.slice(0, 3)} ${code.slice(3)} `, sessionId: session1.id, userId: admin.id }), { ok: true });
    const verified = await contextOf(session1.token);
    assert.equal(verified.user.mfaStatus, "verified");
    assert.ok(verified.user.roles.includes(RoleName.admin));
    assert.deepEqual(await verifyTotpChallenge({ code, sessionId: session2.id, userId: admin.id }), { ok: false, reason: "invalid" }, "replay on another session");
    assert.deepEqual(await verifyTotpChallenge({ code, sessionId: session1.id, userId: admin.id }), { ok: false, reason: "invalid" }, "replay on the same session");
    assert.equal((await contextOf(session2.token)).user.mfaStatus, "challenge");

    // An older step inside the tolerance window is refused once a later step was accepted.
    const olderCode = codeAt(adminSecret.secret, currentEpoch() - STEP);
    assert.notEqual(olderCode, code);
    assert.deepEqual(await verifyTotpChallenge({ code: olderCode, sessionId: session2.id, userId: admin.id }), { ok: false, reason: "invalid" });

    // Clock drift: one step either side is tolerated, two steps are not.
    await prisma.userMfaFactor.update({ data: { lastAcceptedStep: stepOf() - 5 }, where: { userId: admin.id } });
    await prisma.mfaFailedAttempt.deleteMany({ where: { userId: admin.id } });
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(adminSecret.secret, currentEpoch() - 3 * STEP), sessionId: session2.id, userId: admin.id }), { ok: false, reason: "invalid" });
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(adminSecret.secret, currentEpoch() - STEP), sessionId: session2.id, userId: admin.id }), { ok: true });

    // Concurrent replay: two sessions submit the same fresh code at once; exactly one passes.
    const racers = await Promise.all([makeSession(admin.id), makeSession(admin.id), makeSession(admin.id), makeSession(admin.id)]);
    await prisma.userMfaFactor.update({ data: { lastAcceptedStep: stepOf() - 5 }, where: { userId: admin.id } });
    await prisma.mfaFailedAttempt.deleteMany({ where: { userId: admin.id } });
    const raceCode = codeAt(adminSecret.secret);
    const raceResults = await Promise.all(racers.map((racer) => verifyTotpChallenge({ code: raceCode, sessionId: racer.id, userId: admin.id })));
    assert.equal(raceResults.filter((result) => result.ok).length, 1, "one code, one success");
    const verifiedRacers = await Promise.all(racers.map(async (racer) => (await contextOf(racer.token)).user.mfaStatus === "verified"));
    assert.equal(verifiedRacers.filter(Boolean).length, 1);

    // The 12-hour boundary, on database time.
    const sessionB = await makeSession(admin.id);
    await markVerified(sessionB.id, adminSecret.factorId, MFA_REVERIFY_SECONDS - 120);
    assert.equal((await contextOf(sessionB.token)).user.mfaStatus, "verified", "11h58m is still verified");
    await markVerified(sessionB.id, adminSecret.factorId, MFA_REVERIFY_SECONDS + 120);
    const stale = await contextOf(sessionB.token);
    assert.equal(stale.user.mfaStatus, "challenge", "12h02m needs a new code");
    assert.deepEqual(stale.user.roles, []);
    await prisma.$executeRaw`UPDATE auth_sessions SET mfa_verified_at = now() + interval '1 hour' WHERE id = ${sessionB.id}::uuid`;
    assert.equal((await contextOf(sessionB.token)).user.mfaStatus, "challenge", "a verification time in the future never counts");
    await prisma.$executeRaw`UPDATE auth_sessions SET mfa_verified_at = NULL WHERE id = ${sessionB.id}::uuid`;
    assert.equal((await contextOf(sessionB.token)).user.mfaStatus, "challenge");
    // A session verified under a different (replaced) factor does not count.
    await markVerified(sessionB.id, adminSecret.factorId, 0);
    await prisma.$executeRaw`UPDATE auth_sessions SET mfa_factor_id = NULL WHERE id = ${sessionB.id}::uuid`;
    assert.equal((await contextOf(sessionB.token)).user.mfaStatus, "challenge", "verification without the current factor does not count");
    // Re-verifying restores it (reverification path of the 12-hour check).
    await markVerified(sessionB.id, adminSecret.factorId, 0);
    await prisma.userMfaFactor.update({ data: { lastAcceptedStep: stepOf() - 5 }, where: { userId: admin.id } });
    await prisma.mfaFailedAttempt.deleteMany({ where: { userId: admin.id } });
    await prisma.$executeRaw`UPDATE auth_sessions SET mfa_verified_at = now() - interval '13 hours' WHERE id = ${sessionB.id}::uuid`;
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(adminSecret.secret), sessionId: sessionB.id, userId: admin.id }), { ok: true });
    assert.equal((await contextOf(sessionB.token)).user.mfaStatus, "verified");

    // Revoked or expired sessions cannot verify.
    const dead = await makeSession(admin.id);
    await prisma.authSession.update({ data: { revokedAt: new Date(), status: "revoked" }, where: { id: dead.id } });
    await prisma.userMfaFactor.update({ data: { lastAcceptedStep: stepOf() - 5 }, where: { userId: admin.id } });
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(adminSecret.secret), sessionId: dead.id, userId: admin.id }), { ok: false, reason: "invalid" });
    assert.equal(await getSessionContextForToken(dead.token), null);
  }

  // ---- Role grant and factor/account changes ---------------------------
  {
    const adminSecret = await secretOf(admin.id);
    const { id: sessionId, token } = await makeSession(admin.id);
    // Verified a second ago on database time, so the grant below is strictly later on the same clock.
    await markVerified(sessionId, adminSecret.factorId, 1);
    assert.equal((await contextOf(token)).user.mfaStatus, "verified");
    // A privileged role granted after the verification needs a fresh check.
    await prisma.roleAssignment.create({ data: { role: RoleName.developer, userId: admin.id } });
    const regranted = await contextOf(token);
    assert.equal(regranted.user.mfaStatus, "challenge", "role grant re-checks privileged sessions");
    assert.deepEqual(regranted.user.roles, []);
    await markVerified(sessionId, adminSecret.factorId, 0);
    const reverified = await contextOf(token);
    assert.equal(reverified.user.mfaStatus, "verified");
    assert.ok(reverified.user.roles.includes(RoleName.developer) && reverified.user.roles.includes(RoleName.admin));
    await prisma.roleAssignment.updateMany({ data: { revokedAt: new Date() }, where: { role: RoleName.developer, userId: admin.id } });

    // Disabling the account ends the session outright.
    const disabled = await makeUser("disabled", [RoleName.admin]);
    const disabledFactor = await provisionFactor(disabled.id);
    const disabledSession = await makeSession(disabled.id);
    await markVerified(disabledSession.id, disabledFactor.factorId);
    assert.equal((await contextOf(disabledSession.token)).user.mfaStatus, "verified");
    await prisma.user.update({ data: { status: "disabled" }, where: { id: disabled.id } });
    assert.equal(await getSessionContextForToken(disabledSession.token), null);
    assert.equal(await getReadOnlySessionContextForToken(disabledSession.token), null);

    // A password change keeps the factor and neither grants nor removes verification.
    const changer = await makeUser("changer", [RoleName.admin], { mustChangePassword: true });
    const changerFactor = await provisionFactor(changer.id);
    const changerSession = await makeSession(changer.id);
    const changerOther = await makeSession(changer.id);
    await markVerified(changerSession.id, changerFactor.factorId);
    await changePasswordForUser(changer.id, changerSession.id, "Another-Pass-9!");
    assert.equal(await prisma.userMfaFactor.count({ where: { userId: changer.id } }), 1, "a password change never removes the factor");
    assert.equal((await contextOf(changerSession.token)).user.mfaStatus, "verified");
    assert.equal(await getSessionContextForToken(changerOther.token), null, "other sessions are revoked");
    const unverifiedChanger = await makeSession(changer.id);
    assert.equal((await contextOf(unverifiedChanger.token)).user.mfaStatus, "challenge", "a new password-only session is still unprivileged");
  }

  // ---- Recovery codes --------------------------------------------------
  {
    const user = await makeUser("recovery", [RoleName.developer]);
    const factor = await provisionFactor(user.id);
    const codes = Array.from({ length: 4 }, () => generateOneUseCode());
    await prisma.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({ codeHash: hashOneUseCode(normalizeOneUseCode(code) as string), factorId: factor.factorId })),
    });
    const s1 = await makeSession(user.id);
    const s2 = await makeSession(user.id);
    assert.deepEqual(await verifyRecoveryCode({ code: "", sessionId: s1.id, userId: user.id }), { ok: false, reason: "invalid" });
    assert.deepEqual(await verifyRecoveryCode({ code: generateOneUseCode(), sessionId: s1.id, userId: user.id }), { ok: false, reason: "invalid" });
    assert.equal((await contextOf(s1.token)).user.mfaStatus, "challenge");

    assert.deepEqual(await verifyRecoveryCode({ code: codes[0].toLowerCase(), sessionId: s1.id, userId: user.id }), { ok: true });
    assert.equal((await contextOf(s1.token)).user.mfaStatus, "verified");
    assert.deepEqual(await verifyRecoveryCode({ code: codes[0], sessionId: s2.id, userId: user.id }), { ok: false, reason: "invalid" }, "a recovery code works once");
    const event = await prisma.auditLog.findFirstOrThrow({ where: { action: "auth.mfa.recovery_code_used", targetId: user.id } });
    assert.equal((event.metadata as { remainingRecoveryCodes: number }).remainingRecoveryCodes, 3);

    // Concurrent use of one code from several sessions: exactly one wins.
    const racers = await Promise.all([makeSession(user.id), makeSession(user.id), makeSession(user.id), makeSession(user.id), makeSession(user.id)]);
    const results = await Promise.all(racers.map((racer) => verifyRecoveryCode({ code: codes[1], sessionId: racer.id, userId: user.id })));
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal((await prisma.mfaRecoveryCode.findMany({ where: { factorId: factor.factorId, usedAt: { not: null } } })).length, 2);
  }

  // ---- Throttling (Postgres only; Redis down changes nothing) ----------
  {
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    const user = await makeUser("throttle", [RoleName.admin]);
    const factor = await provisionFactor(user.id);
    const bystander = await makeUser("bystander", [RoleName.admin]);
    const bystanderFactor = await provisionFactor(bystander.id);
    const session = await makeSession(user.id);
    const bystanderSession = await makeSession(bystander.id);

    // Concurrent wrong guesses never exceed the limit: the surplus is refused without being counted.
    const guesses = await Promise.all(Array.from({ length: 12 }, () => verifyTotpChallenge({ code: "000000", sessionId: session.id, userId: user.id })));
    const wrongSecret = codeAt(factor.secret) === "000000";
    assert.equal(wrongSecret, false);
    assert.equal(guesses.filter((result) => !result.ok && result.reason === "invalid").length, MFA_MAX_FAILED_ATTEMPTS);
    assert.equal(guesses.filter((result) => !result.ok && result.reason === "throttled").length, 12 - MFA_MAX_FAILED_ATTEMPTS);
    assert.equal(await failuresOf(user.id, "challenge"), MFA_MAX_FAILED_ATTEMPTS);

    // Blocked: even the correct code is refused, and nothing changes.
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(factor.secret), sessionId: session.id, userId: user.id }), { ok: false, reason: "throttled" });
    assert.equal((await contextOf((await makeSession(user.id)).token)).user.mfaStatus, "challenge");
    // Other kinds and other accounts are separate counters.
    assert.deepEqual(await verifyRecoveryCode({ code: generateOneUseCode(), sessionId: session.id, userId: user.id }), { ok: false, reason: "invalid" });
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(bystanderFactor.secret), sessionId: bystanderSession.id, userId: bystander.id }), { ok: true });

    // Recovery and setup codes have their own limits.
    for (let attempt = 0; attempt < MFA_MAX_FAILED_ATTEMPTS; attempt += 1) {
      await verifyRecoveryCode({ code: generateOneUseCode(), sessionId: session.id, userId: user.id });
    }
    assert.deepEqual(await verifyRecoveryCode({ code: generateOneUseCode(), sessionId: session.id, userId: user.id }), { ok: false, reason: "throttled" });
    const noFactor = await makeUser("throttle-setup", [RoleName.developer]);
    const noFactorSession = await makeSession(noFactor.id);
    for (let attempt = 0; attempt < MFA_MAX_FAILED_ATTEMPTS; attempt += 1) {
      assert.deepEqual(await startEnrollment({ sessionId: noFactorSession.id, setupCode: generateOneUseCode(), userId: noFactor.id }), { ok: false, reason: "invalid" });
    }
    const validSetup = await issueSetupCode(noFactor.id);
    assert.deepEqual(await startEnrollment({ sessionId: noFactorSession.id, setupCode: validSetup.code, userId: noFactor.id }), { ok: false, reason: "throttled" }, "a valid setup code is refused while throttled");

    // The block ends when the failures age out of the window.
    await prisma.$executeRaw`UPDATE mfa_failed_attempts SET occurred_at = now() - make_interval(mins => ${MFA_ATTEMPT_WINDOW_MINUTES + 1}) WHERE user_id = ${user.id}::uuid`;
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(factor.secret), sessionId: session.id, userId: user.id }), { ok: true });

    // Failure rows are security evidence for 90 days: later throttle activity does not delete older
    // ones, and the daily maintenance job owns expiry.
    const evidenceUser = await makeUser("evidence", [RoleName.admin]);
    const evidenceFactor = await provisionFactor(evidenceUser.id);
    const evidenceSession = await makeSession(evidenceUser.id);
    await prisma.$executeRaw`
      INSERT INTO mfa_failed_attempts (user_id, kind, occurred_at)
      SELECT ${evidenceUser.id}::uuid, 'challenge', now() - make_interval(days => d) FROM unnest(ARRAY[2, 10, 60, 89]) AS d`;
    assert.deepEqual(await verifyTotpChallenge({ code: "000000", sessionId: evidenceSession.id, userId: evidenceUser.id }), { ok: false, reason: "invalid" });
    assert.deepEqual(await verifyTotpChallenge({ code: codeAt(evidenceFactor.secret), sessionId: evidenceSession.id, userId: evidenceUser.id }), { ok: true });
    const [{ older }] = await prisma.$queryRaw<Array<{ older: bigint }>>`
      SELECT count(*) AS older FROM mfa_failed_attempts WHERE user_id = ${evidenceUser.id}::uuid AND occurred_at < now() - interval '1 day'`;
    assert.equal(Number(older), 4, "throttle activity does not delete failures older than a day");
    assert.equal(await failuresOf(evidenceUser.id, "challenge"), 5, "one new failure plus the four old rows are all still there");
    if (ORIGINAL_REDIS === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = ORIGINAL_REDIS;
  }

  // ---- Missing or rotated key fails closed ------------------------------
  {
    const user = await makeUser("keys", [RoleName.admin]);
    const factor = await provisionFactor(user.id);
    const { id: sessionId, token } = await makeSession(user.id);
    await markVerified(sessionId, factor.factorId);
    assert.equal((await contextOf(token)).user.mfaStatus, "verified");
    const fresh = await makeSession(user.id);

    try {
      // No key ring at all: even an already-verified session loses the admin role.
      delete process.env.MFA_KEY_RING;
      delete process.env.MFA_ACTIVE_KEY_ID;
      for (const read of [getSessionContextForToken, getReadOnlySessionContextForToken]) {
        const context = await read(token);
        assert.ok(context);
        assert.equal(context.user.mfaStatus, "unavailable");
        assert.deepEqual(context.user.roles, []);
      }
      const newcomer = await makeUser("keys-newcomer", [RoleName.developer]);
      const newcomerSession = await makeSession(newcomer.id);
      assert.equal((await contextOf(newcomerSession.token)).user.mfaStatus, "unavailable");
      assert.deepEqual(await startEnrollment({ sessionId: newcomerSession.id, setupCode: (await issueSetupCode(newcomer.id)).code, userId: newcomer.id }), { ok: false, reason: "unavailable" });
      // Non-privileged accounts are unaffected.
      assert.equal((await contextOf((await makeSession(tutor.id)).token)).user.mfaStatus, "not_required");

      // A ring that no longer contains the key this secret was sealed under.
      process.env.MFA_KEY_RING = JSON.stringify({ rotated: Buffer.alloc(32, 9).toString("base64") });
      process.env.MFA_ACTIVE_KEY_ID = "rotated";
      assert.equal((await contextOf(token)).user.mfaStatus, "unavailable");
      assert.deepEqual(await verifyTotpChallenge({ code: "123456", sessionId: fresh.id, userId: user.id }), { ok: false, reason: "unavailable" });

      // A malformed ring.
      process.env.MFA_KEY_RING = "not json";
      assert.equal((await contextOf(token)).user.mfaStatus, "unavailable");
    } finally {
      process.env.MFA_KEY_RING = ORIGINAL_RING;
      process.env.MFA_ACTIVE_KEY_ID = ORIGINAL_ACTIVE;
    }

    // Rotation: a ring holding the old key and a new active key still opens it.
    const ring = JSON.parse(ORIGINAL_RING as string) as Record<string, string>;
    try {
      process.env.MFA_KEY_RING = JSON.stringify({ ...ring, "rotated-2": Buffer.alloc(32, 7).toString("base64") });
      process.env.MFA_ACTIVE_KEY_ID = "rotated-2";
      assert.equal((await contextOf(token)).user.mfaStatus, "verified");
    } finally {
      process.env.MFA_KEY_RING = ORIGINAL_RING;
      process.env.MFA_ACTIVE_KEY_ID = ORIGINAL_ACTIVE;
    }
    assert.equal((await contextOf(token)).user.mfaStatus, "verified");
  }

  // ---- Password-only session: every direct role check ------------------
  {
    const unverifiedAdmin = await contextOf((await makeSession(admin.id)).token);
    const unverifiedDev = await contextOf((await makeSession(developer.id)).token);
    const unverifiedMixed = await contextOf((await makeSession(adminTutor.id)).token);
    const verifiedAdmin = await (async () => {
      const factor = await provisionFactor(adminTutor.id);
      const session = await makeSession(adminTutor.id);
      await markVerified(session.id, factor.factorId);
      return { context: await contextOf(session.token), factor };
    })();

    // lib/tryout/capabilities.ts
    assert.throws(() => requireTryoutCapability(unverifiedAdmin, "tryout.delivery.configure"), TryoutCapabilityError);
    assert.throws(() => requireTryoutCapability(unverifiedDev, "tryout.delivery.configure"), TryoutCapabilityError);
    requireTryoutCapability(verifiedAdmin.context, "tryout.delivery.configure");
    // lib/banner/delivery.ts
    assert.throws(() => assertBannerDeliverySession(unverifiedAdmin, "draft"), /tidak diizinkan/u);
    assert.throws(() => assertBannerDeliverySession(unverifiedAdmin, "admin-published"), /tidak diizinkan/u);
    assertBannerDeliverySession(verifiedAdmin.context, "draft");
    // lib/reports/access.ts (developer reports)
    assert.equal(hasDeveloperReportAccess(unverifiedDev.user.roles, false), false);
    // An account that is both admin and tutor keeps only its tutor role while unverified.
    assert.deepEqual(unverifiedMixed.user.roles, [RoleName.tutor]);
    assert.equal(unverifiedMixed.user.mfaStatus, "enroll");
    requireTryoutCapability(unverifiedMixed, "tryout.delivery.configure"); // still allowed, as a tutor
    assert.throws(() => assertBannerDeliverySession(unverifiedMixed, "draft"), /tidak diizinkan/u);

    // Data-layer checks (lib/auth/kapten-access.ts, invitation-picker, edit-lock SQL). They look the
    // account up by id, so first end every earlier (verified) session of this fixture admin.
    await prisma.authSession.updateMany({ data: { revokedAt: new Date(), status: "revoked" }, where: { userId: admin.id } });
    await makeSession(admin.id);
    assert.equal(await isActiveKaptenOrAdmin(prisma, admin.id), false, "unverified admin is not a manager");
    assert.equal(await isActiveKaptenOrAdmin(prisma, tutor.id), true);
    assert.equal(await isActiveKaptenOrAdmin(prisma, student.id), false);
    await assert.rejects(() => searchTryoutInvitationStudents(randomUUID(), admin.id, "alya"), /tidak dapat mengakses/u);
    const adminFactor = await secretOf(admin.id);
    const verifiedAdminSession = await makeSession(admin.id);
    await markVerified(verifiedAdminSession.id, adminFactor.factorId);
    assert.equal(await isActiveKaptenOrAdmin(prisma, admin.id), true, "a verified session restores it");
    await assert.rejects(() => searchTryoutInvitationStudents(randomUUID(), admin.id, "alya"), /Tryout tidak ditemukan/u, "past authorization: only the missing tryout stops it");
    await prisma.authSession.updateMany({ data: { revokedAt: new Date(), status: "revoked" }, where: { id: verifiedAdminSession.id } });
    assert.equal(await isActiveKaptenOrAdmin(prisma, admin.id), false, "no live verified session, no access");

    const holder = async (userId: string) => {
      const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM "role_assignments" AS ra JOIN "users" AS u ON u."id" = ra."user_id"
          WHERE ra."user_id" = ${userId}::uuid AND ${kaptenOrAdminRoleSql()} AND ra."revoked_at" IS NULL
        ) AS ok
      `);
      return rows[0].ok;
    };
    assert.equal(await holder(tutor.id), true);
    assert.equal(await holder(admin.id), false, "edit-lock holder SQL: unverified admin");
    const holderSession = await makeSession(admin.id);
    await markVerified(holderSession.id, adminFactor.factorId);
    assert.equal(await holder(admin.id), true, "edit-lock holder SQL: verified admin");
  }

  // ---- Operator script -------------------------------------------------
  {
    const script = "scripts/mfa-reset.mjs";
    const user = await makeUser("cli", [RoleName.admin]);
    const factor = await provisionFactor(user.id);
    await prisma.mfaRecoveryCode.create({ data: { codeHash: hashOneUseCode(normalizeOneUseCode(generateOneUseCode()) as string), factorId: factor.factorId } });
    const session = await makeSession(user.id);
    await markVerified(session.id, factor.factorId);
    const earlierCode = await issueSetupCode(user.id);
    const base = ["--email", user.email, "--operator", "Test Operator", "--reason", "lost phone (test)"];
    const auditCount = () => prisma.auditLog.count({ where: { action: "auth.mfa.reset_by_operator", targetId: user.id } });

    // Usage errors and refusals write nothing.
    for (const [label, args, status] of [
      ["no reason", ["--email", user.email, "--operator", "Test Operator", "--yes"], 2],
      ["no operator", ["--email", user.email, "--reason", "lost phone (test)", "--yes"], 2],
      ["short reason", ["--email", user.email, "--operator", "Test Operator", "--reason", "x", "--yes"], 2],
      ["dry run", [...base], 2],
      ["unknown account", ["--email", `nobody-${runId}@vecalss.local`, "--operator", "Test Operator", "--reason", "lost phone (test)", "--yes"], 3],
      ["student account", ["--email", student.email, "--operator", "Test Operator", "--reason", "lost phone (test)", "--yes"], 3],
    ] as const) {
      const result = runScript(script, [...args]);
      assert.equal(result.status, status, `${label}: ${result.stderr}${result.stdout}`);
    }
    assert.equal(await auditCount(), 0);
    assert.equal(await prisma.userMfaFactor.count({ where: { userId: user.id } }), 1, "refusals change nothing");
    assert.equal((await contextOf(session.token)).user.mfaStatus, "verified");

    // "Last admin": the script never looks at other admins. Park every other admin and developer
    // assignment, run it, and put them back.
    const parked = await prisma.roleAssignment.findMany({
      select: { id: true },
      where: { revokedAt: null, role: { in: [RoleName.admin, RoleName.developer] }, userId: { not: user.id } },
    });
    let run: ReturnType<typeof runScript>;
    try {
      await prisma.roleAssignment.updateMany({ data: { revokedAt: new Date() }, where: { id: { in: parked.map((row) => row.id) } } });
      assert.equal(await prisma.roleAssignment.count({ where: { revokedAt: null, role: RoleName.admin } }), 1, "this is the only admin");
      run = runScript(script, [...base, "--yes"]);
    } finally {
      await prisma.roleAssignment.updateMany({ data: { revokedAt: null }, where: { id: { in: parked.map((row) => row.id) } } });
    }
    assert.equal(run.status, 0, run.stderr + run.stdout);
    const printed = run.stdout.match(/\n {2}([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})\n/u)?.[1];
    assert.ok(printed, "the script prints the setup code once");

    assert.equal(await prisma.userMfaFactor.count({ where: { userId: user.id } }), 0, "factor removed");
    assert.equal(await prisma.mfaRecoveryCode.count({ where: { factorId: factor.factorId } }), 0, "recovery codes removed");
    assert.equal(await getSessionContextForToken(session.token), null, "sessions signed out");
    assert.notEqual((await prisma.mfaSetupCode.findUniqueOrThrow({ where: { id: earlierCode.id } })).usedAt, null, "earlier setup code voided");
    const issued = await prisma.mfaSetupCode.findFirstOrThrow({ orderBy: { createdAt: "desc" }, where: { userId: user.id } });
    assert.equal(issued.codeHash, hashOneUseCode(normalizeOneUseCode(printed) as string));
    assert.ok(!JSON.stringify(issued).includes(printed.replace(/-/gu, "")), "plain code is not stored");
    assert.equal(issued.issuedBy, "Test Operator");
    assert.equal(issued.reason, "lost phone (test)");
    const ttlSeconds = (issued.expiresAt.getTime() - issued.createdAt.getTime()) / 1000;
    assert.ok(Math.abs(ttlSeconds - SETUP_CODE_TTL_MINUTES * 60) < 5, `setup code lives ${SETUP_CODE_TTL_MINUTES} minutes (${ttlSeconds}s)`);
    assert.equal(await auditCount(), 1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "auth.mfa.reset_by_operator", targetId: user.id } });
    const meta = audit.metadata as Record<string, unknown>;
    assert.equal(meta.operator, "Test Operator");
    assert.equal(meta.reason, "lost phone (test)");
    assert.equal(meta.hadFactor, true);
    assert.equal(meta.revokedSessions, 1);
    assert.equal(audit.actorUserId, null);
    assert.ok(!JSON.stringify(meta).includes(printed), "the audit event never holds the code");

    // The printed code enrolls a new factor; a password alone still cannot.
    const fresh = await makeSession(user.id);
    assert.equal((await contextOf(fresh.token)).user.mfaStatus, "enroll");
    assert.deepEqual(await startEnrollment({ sessionId: fresh.id, setupCode: generateOneUseCode(), userId: user.id }), { ok: false, reason: "invalid" });
    assert.deepEqual(await startEnrollment({ sessionId: fresh.id, setupCode: printed, userId: user.id }), { ok: true });
    const { secret } = await secretOf(user.id);
    const done = await confirmEnrollment({ code: codeAt(secret), sessionId: fresh.id, userId: user.id });
    assert.ok(done.ok);
    assert.equal((await contextOf(fresh.token)).user.mfaStatus, "verified");

    // A second run replaces the new factor again and voids an unused code; an expired code cannot enroll.
    const second = runScript(script, [...base, "--yes", "--ttl-minutes", "1"]);
    assert.equal(second.status, 0, second.stderr);
    const secondCode = second.stdout.match(/\n {2}([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})\n/u)?.[1] as string;
    await prisma.$executeRaw`UPDATE mfa_setup_codes SET expires_at = now() - interval '1 second' WHERE user_id = ${user.id}::uuid AND used_at IS NULL`;
    const lateSession = await makeSession(user.id);
    assert.deepEqual(await startEnrollment({ sessionId: lateSession.id, setupCode: secondCode, userId: user.id }), { ok: false, reason: "invalid" }, "expired code");
    assert.equal(await auditCount(), 2);

    // A developer account works the same way.
    const dev = await makeUser("cli-dev", [RoleName.developer]);
    const devRun = runScript(script, ["--email", dev.email, "--operator", "Test Operator", "--reason", "first setup (test)", "--yes"]);
    assert.equal(devRun.status, 0, devRun.stderr);
    assert.match(devRun.stdout, /The account had no factor/u);
  }

  // ---- Seeded local accounts use the fixed test secret, local only ------
  {
    const { SEED_MFA_TEST_SECRET, assertSeedMfaAllowed, isSeedMfaAllowed } = await import("../prisma/seed-mfa.mjs");
    const local = { DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/vecalss_dev" } as unknown as NodeJS.ProcessEnv;
    assert.equal(isSeedMfaAllowed(local), true);
    assert.doesNotThrow(() => assertSeedMfaAllowed(local));
    for (const env of [
      { DATABASE_URL: "postgresql://u:p@ep-example.neon.tech/db" },
      { DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/vecalss_dev", NODE_ENV: "production" },
      {},
    ]) {
      assert.equal(isSeedMfaAllowed(env as unknown as NodeJS.ProcessEnv), false);
      assert.throws(() => assertSeedMfaAllowed(env as unknown as NodeJS.ProcessEnv), /only allowed against a database on this machine/u);
    }
    const seededAdmin = await prisma.user.findUnique({ select: { id: true }, where: { email: "admin@vecalss.local" } });
    if (seededAdmin) {
      const seeded = await secretOf(seededAdmin.id);
      assert.equal(seeded.secret, SEED_MFA_TEST_SECRET, "the seeded admin uses the documented test secret");
    } else {
      console.log("skipped: the seeded admin account is not in this database (run pnpm db:seed)");
    }
  }

  console.log("Admin two-step verification checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdUserIds.length) {
      await prisma.authSession.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userMfaFactor.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.mfaSetupCode.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.mfaFailedAttempt.deleteMany({ where: { userId: { in: createdUserIds } } });
      // Audit rows are append-only and reference users, so the throwaway accounts stay, switched off.
      await prisma.user.updateMany({ data: { status: "disabled" }, where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });
