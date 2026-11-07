import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

import { REGISTRATION_LIMITS, RESEND_LIMITS } from "./constants";

/**
 * Limits on signups and on verification resends, counted in Postgres on database
 * time. Every attempt that reaches this point counts the same, whether or not
 * the email belongs to an account, so a refusal says nothing about accounts. Only
 * attempts that are let through are recorded, so a flood of refused ones cannot
 * extend anyone's lock-out. The daily job removes old rows with the other
 * security logs (lib/maintenance/retention.ts).
 */

type AttemptKind = "resend" | "signup";

function hashRegistrationEmail(normalizedEmail: string) {
  return createHash("sha256").update(`registration:${normalizedEmail}`).digest("hex");
}

/**
 * Returns true and records the attempt when both limits allow it; false (and no
 * record) when either is used up. The email is stored only as a hash. Runs in
 * its own transaction with advisory locks taken in a fixed order, so concurrent
 * attempts for one address or email cannot both slip through the last slot.
 */
async function consumeRegistrationAttempt({
  ipAddress,
  kind,
  normalizedEmail,
}: {
  ipAddress: string | null;
  kind: AttemptKind;
  normalizedEmail: string;
}) {
  const emailHash = hashRegistrationEmail(normalizedEmail);
  const limits = kind === "signup" ? REGISTRATION_LIMITS : RESEND_LIMITS;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`registration:${kind}:email:${emailHash}`}, 0))`;
    if (ipAddress) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`registration:${kind}:ip:${ipAddress}`}, 0))`;
    }

    const [{ count: emailCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM registration_attempts
      WHERE kind = ${kind}
        AND email_hash = ${emailHash}
        AND requested_at > now() - make_interval(mins => ${limits.email.windowMinutes})
    `;
    if (Number(emailCount) >= limits.email.max) return false;

    if (ipAddress) {
      const [{ count: ipCount }] = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count FROM registration_attempts
        WHERE kind = ${kind}
          AND ip_address = ${ipAddress}::inet
          AND requested_at > now() - make_interval(mins => ${limits.ip.windowMinutes})
      `;
      if (Number(ipCount) >= limits.ip.max) return false;
    }

    await tx.$executeRaw`
      INSERT INTO registration_attempts (kind, email_hash, ip_address)
      VALUES (${kind}, ${emailHash}, ${ipAddress}::inet)
    `;
    return true;
  });
}

export { consumeRegistrationAttempt, hashRegistrationEmail };
export type { AttemptKind };
