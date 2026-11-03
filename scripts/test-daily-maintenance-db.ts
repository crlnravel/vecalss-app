import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { prisma } from "../lib/prisma";
import { countStaleEditLeases, purgeSecurityLogs, purgeTable } from "../lib/maintenance/retention";

/**
 * Cleanup against the real schema on the local disposable database. Everything
 * runs inside one transaction that is always rolled back, so no fixture rows
 * remain. Cutoffs are database time, so the fixtures use `now() - interval`.
 */

const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/vecalss_dev") {
  throw new Error("Daily maintenance DB test requires the local disposable vecalss_dev database on port 55432.");
}

class RollbackForTest extends Error {}

const hex = () => randomBytes(32).toString("hex");

await prisma
  .$transaction(
    async (tx) => {
      // Start from an empty expired state so the counts below are exact. Rolled back.
      await purgeSecurityLogs(tx, { batchSize: 100_000, maxBatches: 20 });

      const user = await tx.user.findFirstOrThrow({ select: { id: true } });
      const auditBefore = await tx.$queryRaw<Array<{ total: bigint; old: bigint }>>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE occurred_at < now() - make_interval(days => 90)) AS old
        FROM audit_logs`;

      // One row 89 days old (kept) and one 91 days old (deleted) per table.
      const [login89] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO login_attempts (email, result, attempted_at)
        VALUES ('retention-89@test.invalid', 'failed', now() - make_interval(days => 89))
        RETURNING id`;
      const [login91] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO login_attempts (email, result, attempted_at)
        VALUES ('retention-91@test.invalid', 'failed', now() - make_interval(days => 91))
        RETURNING id`;

      const [reset89] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO password_reset_requests (email_hash, requested_at)
        VALUES (${hex()}, now() - make_interval(days => 89))
        RETURNING id`;
      const [reset91] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO password_reset_requests (email_hash, requested_at)
        VALUES (${hex()}, now() - make_interval(days => 91))
        RETURNING id`;

      const [mfa89] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO mfa_failed_attempts (user_id, kind, occurred_at)
        VALUES (${user.id}::uuid, 'challenge', now() - make_interval(days => 89))
        RETURNING id`;
      const [mfa91] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO mfa_failed_attempts (user_id, kind, occurred_at)
        VALUES (${user.id}::uuid, 'challenge', now() - make_interval(days => 91))
        RETURNING id`;

      // Sessions: revoked 91 days ago (deleted), revoked 89 days ago (kept),
      // active but expired 91 days ago (deleted), active and expired 89 days ago (kept),
      // active and still valid (kept).
      const sessionRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO auth_sessions (user_id, refresh_token_hash, status, expires_at, revoked_at)
        VALUES
          (${user.id}::uuid, ${hex()}, 'revoked', now() + make_interval(days => 30), now() - make_interval(days => 91)),
          (${user.id}::uuid, ${hex()}, 'revoked', now() + make_interval(days => 30), now() - make_interval(days => 89)),
          (${user.id}::uuid, ${hex()}, 'active', now() - make_interval(days => 91), NULL),
          (${user.id}::uuid, ${hex()}, 'active', now() - make_interval(days => 89), NULL),
          (${user.id}::uuid, ${hex()}, 'active', now() + make_interval(days => 7), NULL)
        RETURNING id`;
      const [sessionRevoked91, sessionRevoked89, sessionExpired91, sessionExpired89, sessionValid] = sessionRows;

      // 1. Per-table cutoffs at 89 (kept) and 91 days (deleted).
      const cleanup = await purgeSecurityLogs(tx);

      const loginLeft = await tx.loginAttempt.findMany({ where: { id: { in: [login89.id, login91.id] } }, select: { id: true } });
      assert.deepEqual(loginLeft.map((row) => row.id), [login89.id], "89-day login attempt kept, 91-day deleted");

      const resetLeft = await tx.passwordResetRequest.findMany({ where: { id: { in: [reset89.id, reset91.id] } }, select: { id: true } });
      assert.deepEqual(resetLeft.map((row) => row.id), [reset89.id], "89-day reset request kept, 91-day deleted");

      const mfaLeft = await tx.mfaFailedAttempt.findMany({ where: { id: { in: [mfa89.id, mfa91.id] } }, select: { id: true } });
      assert.deepEqual(mfaLeft.map((row) => row.id), [mfa89.id], "89-day MFA failure kept, 91-day deleted");

      const sessionsLeft = await tx.authSession.findMany({
        where: { id: { in: sessionRows.map((row) => row.id) } },
        select: { id: true },
      });
      const keptSessions = new Set(sessionsLeft.map((row) => row.id));
      assert.equal(keptSessions.has(sessionRevoked91.id), false, "revoked 91 days ago is deleted");
      assert.equal(keptSessions.has(sessionExpired91.id), false, "active but expired 91 days ago is deleted");
      assert.equal(keptSessions.has(sessionRevoked89.id), true, "revoked 89 days ago is kept");
      assert.equal(keptSessions.has(sessionExpired89.id), true, "active but expired 89 days ago is kept");
      assert.equal(keptSessions.has(sessionValid.id), true, "a still-valid session is kept");

      assert.equal(cleanup.login_attempts.deleted, 1);
      assert.equal(cleanup.password_reset_requests.deleted, 1);
      assert.equal(cleanup.mfa_failed_attempts.deleted, 1);
      assert.equal(cleanup.auth_sessions.deleted, 2);
      for (const table of Object.values(cleanup)) assert.equal(table.complete, true);

      // 2. Batch cap: five old rows, batches of two, two batches allowed.
      for (let i = 0; i < 5; i += 1) {
        await tx.$executeRaw`
          INSERT INTO login_attempts (email, result, attempted_at)
          VALUES (${`batch-${i}@test.invalid`}, 'failed', now() - make_interval(days => 91))`;
      }
      const firstPass = await purgeTable(tx, "login_attempts", { batchSize: 2, maxBatches: 2 });
      assert.deepEqual(firstPass, { complete: false, deleted: 4 }, "stops at the batch cap and reports incomplete");
      const secondPass = await purgeTable(tx, "login_attempts", { batchSize: 2, maxBatches: 5 });
      assert.deepEqual(secondPass, { complete: true, deleted: 1 }, "the next run finishes the remainder");

      // 3. Stale edit-lease count is a read-only number.
      const stale = await countStaleEditLeases(tx);
      assert.equal(Number.isInteger(stale) && stale >= 0, true);

      // 4. audit_logs is untouched: same totals before and after the cleanup.
      const auditAfter = await tx.$queryRaw<Array<{ total: bigint; old: bigint }>>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE occurred_at < now() - make_interval(days => 90)) AS old
        FROM audit_logs`;
      assert.equal(auditAfter[0]?.total, auditBefore[0]?.total, "audit_logs row count unchanged");
      assert.equal(auditAfter[0]?.old, auditBefore[0]?.old, "old audit_logs rows are still there");

      throw new RollbackForTest();
    },
    { timeout: 120_000 },
  )
  .catch((error: unknown) => {
    if (!(error instanceof RollbackForTest)) throw error;
  });

console.log("Daily maintenance DB checks passed (rolled back; no fixture rows remain).");
