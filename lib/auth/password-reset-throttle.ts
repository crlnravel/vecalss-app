import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * Limits on password reset requests. They live in Postgres, counted on
 * database time, so they hold when Redis is down and across server instances.
 *
 * Only requests that are let through are recorded, so a flood of refused ones
 * cannot extend someone's lock-out; an attacker can at most use up the quota
 * and make the owner wait for the window to pass.
 *
 * Nothing here deletes rows. The windows below are read from `requested_at`, so
 * old rows never count, and the daily maintenance job removes them after the
 * 90-day security log retention (lib/maintenance/retention.ts).
 */
const PASSWORD_RESET_REQUEST_LIMITS = {
  /** Per normalized email address: enough for a typo and a retry. */
  email: { max: 3, windowMinutes: 15 },
  /** Per client address: roomy enough for a school or mobile network sharing one. */
  ip: { max: 10, windowMinutes: 15 },
} as const;

function hashEmail(normalizedEmail: string) {
  return createHash("sha256").update(`password-reset:${normalizedEmail}`).digest("hex");
}

/**
 * Returns true and records the request when both limits allow it; returns
 * false (recording nothing) when either is used up. The email is stored only as
 * a hash, because most addresses typed here belong to no account.
 */
async function consumePasswordResetRequest({
  ipAddress,
  normalizedEmail,
}: {
  ipAddress: string | null;
  normalizedEmail: string;
}) {
  const emailHash = hashEmail(normalizedEmail);
  const { email: emailLimit, ip: ipLimit } = PASSWORD_RESET_REQUEST_LIMITS;

  return prisma.$transaction(async (tx) => {
    // Locks are taken in a fixed order, so two requests never wait on each other in a circle.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pwreset:email:${emailHash}`}, 0))`;
    if (ipAddress) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pwreset:ip:${ipAddress}`}, 0))`;
    }

    const [{ count: emailCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM password_reset_requests
      WHERE email_hash = ${emailHash}
        AND requested_at > now() - make_interval(mins => ${emailLimit.windowMinutes})
    `;
    if (Number(emailCount) >= emailLimit.max) return false;

    if (ipAddress) {
      const [{ count: ipCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM password_reset_requests
        WHERE ip_address = ${ipAddress}::inet
          AND requested_at > now() - make_interval(mins => ${ipLimit.windowMinutes})
      `;
      if (Number(ipCount) >= ipLimit.max) return false;
    }

    await tx.$executeRaw`
      INSERT INTO password_reset_requests (email_hash, ip_address)
      VALUES (${emailHash}, ${ipAddress}::inet)
    `;
    return true;
  });
}

export { PASSWORD_RESET_REQUEST_LIMITS, consumePasswordResetRequest, hashEmail };
