import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;
type Db = Pick<Tx, "$executeRaw" | "$queryRaw">;

type OutboxKind = "access_grant" | "critical_alert" | "receipt_email";

/** How long a worker holds a job before another may take it. */
const OUTBOX_LEASE_SECONDS = 120;
/** Retry delay grows 1, 2, 4... minutes and stops growing at 6 hours. */
const OUTBOX_MAX_BACKOFF_SECONDS = 6 * 60 * 60;
const OUTBOX_DEFAULT_BATCH = 20;

/**
 * Queues a job inside the caller's transaction. The dedupe key names the
 * business fact ("receipt:<order>"), so a repeated decision queues nothing new.
 */
async function enqueueOutbox(
  tx: Db,
  job: { dedupeKey: string; kind: OutboxKind; orderId?: string | null; payload?: Record<string, unknown> },
) {
  await tx.$executeRaw`
    INSERT INTO payment_outbox (kind, dedupe_key, order_id, payload)
    VALUES (
      ${job.kind}::payment_outbox_kind,
      ${job.dedupeKey},
      ${job.orderId ?? null}::uuid,
      ${JSON.stringify(job.payload ?? {})}::jsonb
    )
    ON CONFLICT (dedupe_key) DO NOTHING
  `;
}

/** Narrows a claim to jobs whose dedupe key starts with a prefix (used by tests to stay out of other jobs). */
type OutboxFilter = { dedupeKeyPrefix?: string };

type OutboxJob = {
  attempts: number;
  id: string;
  kind: OutboxKind;
  maxAttempts: number;
  orderId: string | null;
  payload: Record<string, unknown>;
};

/**
 * Parks as `dead` any pending job that used its last attempt and whose lease
 * has run out. Such a job's worker died mid-run (a handler that throws is
 * parked by `failOutboxJob` already), and claiming it again would run it past
 * its documented maximum, so a poison job could cycle forever.
 */
async function reapExhaustedOutboxJobs(db: Db, filter: OutboxFilter = {}) {
  const prefix = filter.dedupeKeyPrefix ?? null;
  return db.$executeRaw`
    UPDATE payment_outbox
    SET status = 'dead',
        leased_until = NULL,
        lease_owner = NULL,
        dead_at = now(),
        last_error = 'The worker stopped during the last allowed attempt.'
    WHERE status = 'pending'
      AND attempts >= max_attempts
      AND (leased_until IS NULL OR leased_until <= now())
      AND (${prefix}::text IS NULL OR dedupe_key LIKE ${prefix}::text || '%')
  `;
}

/**
 * Takes up to `limit` due jobs for this worker. A job is due when it is
 * pending, its next run time has come, and no live lease holds it, all judged
 * on database time. `SKIP LOCKED` lets concurrent workers pick different jobs.
 * The attempt is counted when the lease is taken, so a worker that dies
 * mid-job still spends it, and a job with no attempts left is never taken
 * again: it is parked as dead first (see `reapExhaustedOutboxJobs`).
 */
async function claimOutboxJobs(
  db: Db,
  workerId: string,
  limit = OUTBOX_DEFAULT_BATCH,
  filter: OutboxFilter = {},
): Promise<OutboxJob[]> {
  await reapExhaustedOutboxJobs(db, filter);

  const prefix = filter.dedupeKeyPrefix ?? null;
  return db.$queryRaw<OutboxJob[]>`
    UPDATE payment_outbox
    SET attempts = attempts + 1,
        lease_owner = ${workerId},
        leased_until = now() + make_interval(secs => ${OUTBOX_LEASE_SECONDS}::double precision)
    WHERE id IN (
      SELECT id FROM payment_outbox
      WHERE status = 'pending'
        AND attempts < max_attempts
        AND next_run_at <= now()
        AND (leased_until IS NULL OR leased_until <= now())
        AND (${prefix}::text IS NULL OR dedupe_key LIKE ${prefix}::text || '%')
      ORDER BY next_run_at, created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, order_id AS "orderId", payload, attempts, max_attempts AS "maxAttempts"
  `;
}

async function completeOutboxJob(db: Db, id: string, workerId: string) {
  await db.$executeRaw`
    UPDATE payment_outbox
    SET status = 'done', completed_at = now(), leased_until = NULL, lease_owner = NULL, last_error = NULL
    WHERE id = ${id}::uuid AND lease_owner = ${workerId}
  `;
}

/**
 * Records a failed attempt. The job is retried after a backoff, or parked as
 * `dead` once it has used all its attempts. Only the lease holder can do this.
 */
async function failOutboxJob(db: Db, job: OutboxJob, workerId: string, error: string) {
  const dead = job.attempts >= job.maxAttempts;
  await db.$executeRaw`
    UPDATE payment_outbox
    SET status = ${dead ? "dead" : "pending"}::payment_outbox_status,
        next_run_at = now() + make_interval(secs => LEAST(60 * power(2, ${job.attempts - 1}::double precision), ${OUTBOX_MAX_BACKOFF_SECONDS}::double precision)),
        leased_until = NULL,
        lease_owner = NULL,
        dead_at = CASE WHEN ${dead} THEN now() ELSE dead_at END,
        last_error = ${error.slice(0, 200)}
    WHERE id = ${job.id}::uuid AND lease_owner = ${workerId}
  `;
}

type OutboxHandlers = Record<OutboxKind, (job: OutboxJob) => Promise<void>>;

type DrainResult = { dead: number; done: number; failed: number };

/**
 * Runs due jobs one at a time. A handler that throws schedules a retry; the
 * rest of the batch still runs. Handlers must be safe to repeat: a job whose
 * lease expired mid-run may run twice.
 */
async function drainOutbox(
  handlers: OutboxHandlers,
  options: { db?: Db; filter?: OutboxFilter; limit?: number; workerId?: string } = {},
): Promise<DrainResult> {
  const db = options.db ?? prisma;
  const workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const result: DrainResult = { dead: 0, done: 0, failed: 0 };

  const jobs = await claimOutboxJobs(db, workerId, options.limit, options.filter);
  for (const job of jobs) {
    try {
      await handlers[job.kind](job);
      await completeOutboxJob(db, job.id, workerId);
      result.done += 1;
    } catch (error) {
      await failOutboxJob(db, job, workerId, error instanceof Error ? error.message : "unknown error");
      if (job.attempts >= job.maxAttempts) result.dead += 1;
      else result.failed += 1;
    }
  }

  return result;
}

/**
 * How long a parked critical alert keeps counting as an open problem. A job
 * keeps counting as an open problem for three days from the moment it becomes
 * dead; the daily run therefore reports it on each of those runs, then stops.
 * The dead row itself stays, for the operator panel and the audit trail.
 */
const DEAD_ALERT_REPORT_DAYS = 3;

/** Critical-alert jobs that ran out of attempts within the reporting window: alerts nobody received. */
async function countRecentDeadCriticalAlerts(db: Db) {
  const [row] = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM payment_outbox
    WHERE kind = 'critical_alert' AND status = 'dead'
      AND dead_at > now() - make_interval(days => ${DEAD_ALERT_REPORT_DAYS}::int)
  `;
  return Number(row?.count ?? 0);
}

export {
  DEAD_ALERT_REPORT_DAYS,
  OUTBOX_DEFAULT_BATCH,
  OUTBOX_LEASE_SECONDS,
  claimOutboxJobs,
  completeOutboxJob,
  countRecentDeadCriticalAlerts,
  drainOutbox,
  enqueueOutbox,
  failOutboxJob,
  reapExhaustedOutboxJobs,
};
export type { DrainResult, OutboxFilter, OutboxHandlers, OutboxJob, OutboxKind };
