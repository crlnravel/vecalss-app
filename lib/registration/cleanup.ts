import "server-only";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

import { UNVERIFIED_SIGNUP_RETENTION_DAYS } from "./constants";

type Db = Pick<typeof prisma, "$queryRaw" | "$transaction">;

/** Candidates per batch, and batches per daily run. */
const BATCH_SIZE = 200;
const MAX_BATCHES = 10;

type RegistrationCleanupResult = {
  /** False when the batch cap was reached; the rest waits for the next run. */
  complete: boolean;
  deleted: number;
  /** Accounts that could not be removed because something unexpected refers to them. Non-zero means a person should look. */
  failed: number;
};

/**
 * Deletes self-registered accounts that never verified their email. The age
 * counts from the newest verification link (the last time anyone tried to sign
 * up with the address), on database time, so someone who comes back on day six
 * is not deleted on day seven. Only an account with a verification link, no
 * session and no other record qualifies: the foreign keys stop the delete for
 * anything else, and such an account is counted as failed instead of being
 * forced out. An unverified account has no orders, no consent record and no
 * learning data by construction.
 *
 * The three tables an unverified account can own are removed with it (its
 * student profile, its role and any password reset links); the verification
 * links go with the account.
 */
async function cleanupUnverifiedSignups(
  db: Db = prisma,
  options: { retentionDays?: number } = {},
): Promise<RegistrationCleanupResult> {
  const days = options.retentionDays ?? UNVERIFIED_SIGNUP_RETENTION_DAYS;
  let deleted = 0;
  let failed = 0;
  const skipped = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const candidates = await db.$queryRaw<Array<{ id: string }>>`
      SELECT u.id
      FROM users u
      WHERE u.email_verified_at IS NULL
        AND u.preview_purpose IS NULL
        AND EXISTS (SELECT 1 FROM email_verification_tokens t WHERE t.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id)
        AND (SELECT max(t.created_at) FROM email_verification_tokens t WHERE t.user_id = u.id) < now() - make_interval(days => ${days}::int)
      ORDER BY u.created_at
      LIMIT ${BATCH_SIZE}
    `;
    const fresh = candidates.filter((candidate) => !skipped.has(candidate.id));
    if (fresh.length === 0) return { complete: true, deleted, failed };

    for (const { id } of fresh) {
      try {
        const removed = await db.$transaction(async (tx) => {
          // Re-check inside the transaction: the account may have verified a moment ago.
          const [locked = null] = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM users WHERE id = ${id}::uuid AND email_verified_at IS NULL FOR UPDATE
          `;
          if (!locked) return false;
          // A separate statement sees a renewal committed while we waited for the user lock.
          const [eligible] = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT u.id FROM users u WHERE u.id = ${id}::uuid
              AND u.email_verified_at IS NULL AND u.preview_purpose IS NULL
              AND NOT EXISTS (SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id)
              AND (SELECT max(t.created_at) FROM email_verification_tokens t WHERE t.user_id = u.id)
                < now() - make_interval(days => ${days}::int)
          `;
          if (!eligible) return false;
          await tx.$executeRaw`DELETE FROM password_reset_tokens WHERE user_id = ${id}::uuid`;
          await tx.$executeRaw`DELETE FROM student_profiles WHERE user_id = ${id}::uuid`;
          await tx.$executeRaw`DELETE FROM role_assignments WHERE user_id = ${id}::uuid`;
          await tx.$executeRaw`DELETE FROM users WHERE id = ${id}::uuid AND email_verified_at IS NULL`;
          return true;
        });
        if (removed) deleted += 1;
      } catch (error) {
        failed += 1;
        skipped.add(id);
        serverLogger.error("registration.cleanup.account_failed", error, { area: "registration", operation: "cleanup" });
      }
    }
  }

  return { complete: false, deleted, failed };
}

export { cleanupUnverifiedSignups };
export type { RegistrationCleanupResult };
