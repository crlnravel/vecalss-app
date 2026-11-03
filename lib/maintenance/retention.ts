import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Cleanup for the security logs the daily job owns. Every cutoff is computed
 * from database time (`now()` in SQL), so the application clock and any clock
 * skew between instances never move a row across the boundary.
 *
 * `audit_logs` is deliberately absent: it is append-only and never deleted here.
 */

type Db = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;

export const SECURITY_LOG_RETENTION_DAYS = 90;
export const CLEANUP_BATCH_SIZE = 1_000;
export const CLEANUP_MAX_BATCHES = 50;

export const SECURITY_LOG_TABLES = [
  "login_attempts",
  "password_reset_requests",
  "mfa_failed_attempts",
  "auth_sessions",
] as const;

export type SecurityLogTable = (typeof SECURITY_LOG_TABLES)[number];

export type CleanupOptions = {
  batchSize?: number;
  maxBatches?: number;
  retentionDays?: number;
};

export type TableCleanupResult = {
  /** False when the batch cap was reached, so the rest waits for the next run. */
  complete: boolean;
  deleted: number;
};

type DeleteBatch = (db: Db, limit: number, days: number) => Promise<number>;

// Each statement deletes at most `limit` rows per call, selected by primary key.
// Table and column names come from prisma/schema.prisma (@@map and @map).
const deleteBatches: Record<SecurityLogTable, DeleteBatch> = {
  login_attempts: (db, limit, days) =>
    db.$executeRaw`
      DELETE FROM login_attempts
      WHERE id IN (
        SELECT id FROM login_attempts
        WHERE attempted_at < now() - make_interval(days => ${days}::int)
        LIMIT ${limit}
      )`,
  password_reset_requests: (db, limit, days) =>
    db.$executeRaw`
      DELETE FROM password_reset_requests
      WHERE id IN (
        SELECT id FROM password_reset_requests
        WHERE requested_at < now() - make_interval(days => ${days}::int)
        LIMIT ${limit}
      )`,
  mfa_failed_attempts: (db, limit, days) =>
    db.$executeRaw`
      DELETE FROM mfa_failed_attempts
      WHERE id IN (
        SELECT id FROM mfa_failed_attempts
        WHERE occurred_at < now() - make_interval(days => ${days}::int)
        LIMIT ${limit}
      )`,
  // A session has ended when it was revoked, or when it passed its expiry while
  // still marked active. The row is kept until 90 days after that moment.
  auth_sessions: (db, limit, days) =>
    db.$executeRaw`
      DELETE FROM auth_sessions
      WHERE id IN (
        SELECT id FROM auth_sessions
        WHERE (status <> 'active' OR expires_at < now())
          AND COALESCE(revoked_at, expires_at) < now() - make_interval(days => ${days}::int)
        LIMIT ${limit}
      )`,
};

export async function purgeTable(
  db: Db,
  table: SecurityLogTable,
  options: CleanupOptions = {},
): Promise<TableCleanupResult> {
  const batchSize = options.batchSize ?? CLEANUP_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? CLEANUP_MAX_BATCHES;
  const days = options.retentionDays ?? SECURITY_LOG_RETENTION_DAYS;

  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const count = await deleteBatches[table](db, batchSize, days);
    deleted += count;
    if (count < batchSize) return { complete: true, deleted };
  }
  return { complete: false, deleted };
}

export async function purgeSecurityLogs(
  db: Db,
  options: CleanupOptions = {},
): Promise<Record<SecurityLogTable, TableCleanupResult>> {
  const result = {} as Record<SecurityLogTable, TableCleanupResult>;
  for (const table of SECURITY_LOG_TABLES) {
    result[table] = await purgeTable(db, table, options);
  }
  return result;
}

/**
 * Edit leases that expired more than a day ago and were never released. Read
 * only: the count is reported, never deleted, because a lease holder may still
 * be mid-save when its lease lapses.
 */
export async function countStaleEditLeases(db: Db): Promise<number> {
  const rows = await db.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT count(*) AS count
    FROM edit_leases
    WHERE released_at IS NULL
      AND expires_at < now() - interval '1 day'`;
  return Number(rows[0]?.count ?? 0);
}
