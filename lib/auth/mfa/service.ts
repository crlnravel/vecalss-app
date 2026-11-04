import { randomUUID } from "node:crypto";

import { generateSecret, generateURI, verifySync } from "otplib";
import { renderSVG } from "uqr";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  MFA_ATTEMPT_WINDOW_MINUTES,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_REQUIRED_ROLES,
  RECOVERY_CODE_COUNT,
  TOTP_DIGITS,
  TOTP_EPOCH_TOLERANCE_SECONDS,
  TOTP_ISSUER,
  TOTP_PERIOD_SECONDS,
  type MfaAttemptKind,
} from "./constants";
import { generateOneUseCode, hashOneUseCode, normalizeOneUseCode } from "./codes.mjs";
import { loadMfaKeyRing, openMfaSecret, sealMfaSecret } from "./secret-envelope.mjs";

type Tx = Prisma.TransactionClient;

type RequestEvidence = { ipAddress?: string | null; userAgent?: string | null };

type VerifyFailure = "invalid" | "throttled" | "unavailable" | "not_enrolled";
type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

type EnrollStartFailure = "invalid" | "throttled" | "unavailable" | "already_enrolled" | "not_privileged";
type EnrollConfirmFailure = "invalid" | "throttled" | "unavailable" | "expired";

/** TOTP codes are six digits; tolerate the spaces authenticator apps display. */
function normalizeTotpCode(value: unknown) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\s/gu, "");
  return new RegExp(`^\\d{${TOTP_DIGITS}}$`, "u").test(digits) ? digits : null;
}

/**
 * Runs `attempt` under a per-account, per-kind advisory lock after checking the
 * failure count in Postgres. A failed attempt is recorded in the same
 * transaction, so concurrent guesses cannot slip past the limit and a Redis
 * outage changes nothing: nothing here uses Redis.
 *
 * Nothing here deletes rows. The count above reads `occurred_at`, so old
 * failures stop counting on their own, and the daily maintenance job removes
 * them after the 90-day security log retention (lib/maintenance/retention.ts).
 */
async function throttled<T extends { ok: boolean }>(
  userId: string,
  kind: MfaAttemptKind,
  attempt: (tx: Tx) => Promise<T>,
): Promise<T | { ok: false; reason: "throttled" }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mfa:${kind}:${userId}`}, 0))`;

    const [{ failures }] = await tx.$queryRaw<Array<{ failures: bigint }>>`
      SELECT count(*) AS failures
      FROM mfa_failed_attempts
      WHERE user_id = ${userId}::uuid
        AND kind = ${kind}
        AND occurred_at > now() - make_interval(mins => ${MFA_ATTEMPT_WINDOW_MINUTES})
    `;
    if (Number(failures) >= MFA_MAX_FAILED_ATTEMPTS) return { ok: false as const, reason: "throttled" as const };

    const result = await attempt(tx);
    if (!result.ok) {
      await tx.$executeRaw`
        INSERT INTO mfa_failed_attempts (user_id, kind) VALUES (${userId}::uuid, ${kind})
      `;
    }

    return result;
  });
}

async function isPrivilegedAccount(tx: Tx, userId: string) {
  const count = await tx.roleAssignment.count({
    where: { revokedAt: null, role: { in: [...MFA_REQUIRED_ROLES] }, userId },
  });
  return count > 0;
}

/** The session must still be this user's live session; locked so a logout cannot race the verification. */
async function lockLiveSession(tx: Tx, userId: string, sessionId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM auth_sessions
    WHERE id = ${sessionId}::uuid
      AND user_id = ${userId}::uuid
      AND status = 'active'
      AND revoked_at IS NULL
      AND expires_at > now()
    FOR UPDATE
  `;
  return rows.length === 1;
}

/** Marks the session verified, using the database clock. */
async function markSessionVerified(tx: Tx, sessionId: string, factorId: string) {
  await tx.$executeRaw`
    UPDATE auth_sessions
    SET mfa_verified_at = now(), mfa_factor_id = ${factorId}::uuid
    WHERE id = ${sessionId}::uuid
  `;
}

async function audit(
  tx: Tx,
  action: string,
  userId: string,
  metadata: Prisma.InputJsonObject,
  evidence: RequestEvidence = {},
) {
  await tx.auditLog.create({
    data: {
      action,
      actorUserId: userId,
      ipAddress: evidence.ipAddress ?? null,
      metadata,
      targetId: userId,
      targetType: "user",
      userAgent: evidence.userAgent ?? null,
    },
  });
}

type FactorForUpdate = { id: string; last_accepted_step: number | null; secret_envelope: unknown };

async function lockConfirmedFactor(tx: Tx, userId: string) {
  const rows = await tx.$queryRaw<FactorForUpdate[]>`
    SELECT id, secret_envelope, last_accepted_step
    FROM user_mfa_factors
    WHERE user_id = ${userId}::uuid AND confirmed_at IS NOT NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

function checkTotp(secret: string, code: string, afterTimeStep: number | null) {
  const result = verifySync({
    afterTimeStep: afterTimeStep ?? undefined,
    epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    secret,
    strategy: "totp",
    token: code,
  });
  return result.valid && "timeStep" in result ? result.timeStep : null;
}

/** Sign-in and 12-hour check: an authenticator-app code. */
async function verifyTotpChallenge({
  code,
  evidence,
  sessionId,
  userId,
}: {
  code: unknown;
  evidence?: RequestEvidence;
  sessionId: string;
  userId: string;
}): Promise<VerifyResult> {
  const token = normalizeTotpCode(code);

  const result = await throttled<VerifyResult>(userId, "challenge", async (tx) => {
    if (!(await lockLiveSession(tx, userId, sessionId))) return { ok: false, reason: "invalid" };

    const factor = await lockConfirmedFactor(tx, userId);
    if (!factor) return { ok: false, reason: "not_enrolled" };

    let secret: string;
    try {
      secret = openMfaSecret(factor.secret_envelope, { factorId: factor.id, userId });
    } catch {
      return { ok: false, reason: "unavailable" };
    }

    const step = token ? checkTotp(secret, token, factor.last_accepted_step) : null;
    if (step === null) return { ok: false, reason: "invalid" };

    // The row is locked, so this cannot race; the guard in the WHERE keeps the
    // rule true even if a future caller forgets the lock.
    const accepted = await tx.$executeRaw`
      UPDATE user_mfa_factors
      SET last_accepted_step = ${step}
      WHERE id = ${factor.id}::uuid
        AND (last_accepted_step IS NULL OR last_accepted_step < ${step})
    `;
    if (accepted !== 1) return { ok: false, reason: "invalid" };

    await markSessionVerified(tx, sessionId, factor.id);
    await audit(tx, "auth.mfa.verified", userId, { method: "totp", sessionId }, evidence);
    return { ok: true };
  });

  return result;
}

/** Lost phone: one of the ten recovery codes, consumed atomically. */
async function verifyRecoveryCode({
  code,
  evidence,
  sessionId,
  userId,
}: {
  code: unknown;
  evidence?: RequestEvidence;
  sessionId: string;
  userId: string;
}): Promise<VerifyResult> {
  const normalized = normalizeOneUseCode(code);

  return throttled<VerifyResult>(userId, "recovery", async (tx) => {
    if (!(await lockLiveSession(tx, userId, sessionId))) return { ok: false, reason: "invalid" };

    const factor = await lockConfirmedFactor(tx, userId);
    if (!factor) return { ok: false, reason: "not_enrolled" };
    try {
      openMfaSecret(factor.secret_envelope, { factorId: factor.id, userId });
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    if (!normalized) return { ok: false, reason: "invalid" };

    const consumed = await tx.$executeRaw`
      UPDATE mfa_recovery_codes
      SET used_at = now()
      WHERE factor_id = ${factor.id}::uuid
        AND code_hash = ${hashOneUseCode(normalized)}
        AND used_at IS NULL
    `;
    if (consumed !== 1) return { ok: false, reason: "invalid" };

    const [{ remaining }] = await tx.$queryRaw<Array<{ remaining: bigint }>>`
      SELECT count(*) AS remaining FROM mfa_recovery_codes
      WHERE factor_id = ${factor.id}::uuid AND used_at IS NULL
    `;

    await markSessionVerified(tx, sessionId, factor.id);
    await audit(
      tx,
      "auth.mfa.recovery_code_used",
      userId,
      { remainingRecoveryCodes: Number(remaining), sessionId },
      evidence,
    );
    return { ok: true };
  });
}

/**
 * Step one of enrollment: the setup code issued by the operator script. It
 * starts a pending factor owned by this session; nothing is enabled and the
 * setup code is not spent until the first authenticator code is confirmed.
 */
async function startEnrollment({
  sessionId,
  setupCode,
  userId,
}: {
  sessionId: string;
  setupCode: unknown;
  userId: string;
}): Promise<{ ok: true } | { ok: false; reason: EnrollStartFailure }> {
  const normalized = normalizeOneUseCode(setupCode);

  return throttled<{ ok: true } | { ok: false; reason: EnrollStartFailure }>(userId, "setup", async (tx) => {
    if (!(await isPrivilegedAccount(tx, userId))) return { ok: false, reason: "not_privileged" };
    if (!(await lockLiveSession(tx, userId, sessionId))) return { ok: false, reason: "invalid" };

    const confirmed = await tx.userMfaFactor.findFirst({
      select: { id: true },
      where: { confirmedAt: { not: null }, userId },
    });
    if (confirmed) return { ok: false, reason: "already_enrolled" };

    try {
      loadMfaKeyRing();
    } catch {
      return { ok: false, reason: "unavailable" };
    }

    const codes = normalized
      ? await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM mfa_setup_codes
          WHERE user_id = ${userId}::uuid
            AND code_hash = ${hashOneUseCode(normalized)}
            AND used_at IS NULL
            AND expires_at > now()
          FOR UPDATE
        `
      : [];
    const setup = codes[0];
    if (!setup) return { ok: false, reason: "invalid" };

    const factorId = randomUUID();
    const sealed = sealMfaSecret(generateSecret(), { factorId, userId });

    // One pending enrollment per account: a fresh setup code, or the same code
    // from another browser, replaces the earlier attempt and its session link.
    await tx.userMfaFactor.deleteMany({ where: { confirmedAt: null, userId } });
    await tx.userMfaFactor.create({
      data: {
        id: factorId,
        pendingSessionId: sessionId,
        secretEnvelope: sealed,
        setupCodeId: setup.id,
        userId,
      },
    });

    return { ok: true };
  });
}

type PendingEnrollment = { manualKey: string; qrSvg: string };

/** The key and QR code for the enrollment this session started, or null. Never for another session. */
async function getPendingEnrollment({
  accountLabel,
  sessionId,
  userId,
}: {
  accountLabel: string;
  sessionId: string;
  userId: string;
}): Promise<PendingEnrollment | null> {
  const factor = await prisma.userMfaFactor.findFirst({
    include: { setupCode: { select: { expiresAt: true, usedAt: true } } },
    where: { confirmedAt: null, pendingSessionId: sessionId, userId },
  });
  if (!factor?.setupCode || factor.setupCode.usedAt !== null) return null;

  const [{ valid }] = await prisma.$queryRaw<Array<{ valid: boolean }>>`
    SELECT (expires_at > now()) AS valid FROM mfa_setup_codes WHERE id = ${factor.setupCodeId}::uuid
  `;
  if (!valid) return null;

  let secret: string;
  try {
    secret = openMfaSecret(factor.secretEnvelope, { factorId: factor.id, userId });
  } catch {
    return null;
  }

  const uri = generateURI({
    digits: TOTP_DIGITS,
    issuer: TOTP_ISSUER,
    label: accountLabel,
    period: TOTP_PERIOD_SECONDS,
    secret,
    strategy: "totp",
  });

  return { manualKey: secret.match(/.{1,4}/gu)?.join(" ") ?? secret, qrSvg: renderSVG(uri, { border: 2 }) };
}

/**
 * Step two: the first authenticator code. Enables the factor, spends the setup
 * code, creates the recovery codes and verifies this session, atomically.
 * Returns the recovery codes in plain text exactly once.
 */
async function confirmEnrollment({
  code,
  evidence,
  sessionId,
  userId,
}: {
  code: unknown;
  evidence?: RequestEvidence;
  sessionId: string;
  userId: string;
}): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; reason: EnrollConfirmFailure }> {
  const token = normalizeTotpCode(code);

  return throttled<{ ok: true; recoveryCodes: string[] } | { ok: false; reason: EnrollConfirmFailure }>(
    userId,
    "setup",
    async (tx) => {
      if (!(await lockLiveSession(tx, userId, sessionId))) return { ok: false, reason: "invalid" };

      const pending = await tx.$queryRaw<Array<{ id: string; secret_envelope: unknown; setup_code_id: string | null }>>`
        SELECT id, secret_envelope, setup_code_id
        FROM user_mfa_factors
        WHERE user_id = ${userId}::uuid
          AND confirmed_at IS NULL
          AND pending_session_id = ${sessionId}::uuid
        FOR UPDATE
      `;
      const factor = pending[0];
      if (!factor || !factor.setup_code_id) return { ok: false, reason: "expired" };

      const live = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM mfa_setup_codes
        WHERE id = ${factor.setup_code_id}::uuid AND used_at IS NULL AND expires_at > now()
        FOR UPDATE
      `;
      if (!live.length) return { ok: false, reason: "expired" };

      let secret: string;
      try {
        secret = openMfaSecret(factor.secret_envelope, { factorId: factor.id, userId });
      } catch {
        return { ok: false, reason: "unavailable" };
      }

      const step = token ? checkTotp(secret, token, null) : null;
      if (step === null) return { ok: false, reason: "invalid" };

      const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateOneUseCode());
      await tx.$executeRaw`UPDATE mfa_setup_codes SET used_at = now() WHERE id = ${factor.setup_code_id}::uuid`;
      await tx.$executeRaw`
        UPDATE user_mfa_factors
        SET confirmed_at = now(), last_accepted_step = ${step}, pending_session_id = NULL
        WHERE id = ${factor.id}::uuid
      `;
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          codeHash: hashOneUseCode(normalizeOneUseCode(recoveryCode) as string),
          factorId: factor.id,
        })),
      });
      await markSessionVerified(tx, sessionId, factor.id);
      await audit(
        tx,
        "auth.mfa.enrolled",
        userId,
        { factorId: factor.id, sessionId, setupCodeId: factor.setup_code_id },
        evidence,
      );

      return { ok: true, recoveryCodes };
    },
  );
}

export {
  confirmEnrollment,
  getPendingEnrollment,
  startEnrollment,
  verifyRecoveryCode,
  verifyTotpChallenge,
};
export type { EnrollConfirmFailure, EnrollStartFailure, PendingEnrollment, RequestEvidence, VerifyFailure, VerifyResult };
