import { randomUUID } from "node:crypto";

import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";

import {
  EnrollmentImportDispatchStatus,
  EnrollmentImportStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildImportJobId, isImportId } from "./job-id";
import {
  failImportGeneration,
  processImportGeneration,
} from "./processing";

const IMPORT_QUEUE_NAME = "admin-enrollment-imports";
const IMPORT_JOB_NAME = "admin-enrollment-import";
const DISPATCH_CLAIM_LEASE_MS = 45_000;
const DISPATCH_BATCH_SIZE = 10;
const DISPATCH_RECONCILE_PAGE_SIZE = 100;
const DISPATCH_BACKOFF_BASE_MS = 2_000;
const DISPATCH_BACKOFF_MAX_MS = 5 * 60_000;
const BULLMQ_ATTEMPTS = 5;
const COMPLETED_RETENTION_AGE_SECONDS = 7 * 24 * 60 * 60;
const FAILED_RETENTION_AGE_SECONDS = 30 * 24 * 60 * 60;
const RETENTION_COUNT = 1_000;

const DISPATCH_QUEUE_OPTIONS: JobsOptions = {
  attempts: BULLMQ_ATTEMPTS,
  backoff: {
    delay: DISPATCH_BACKOFF_BASE_MS,
    type: "exponential",
  },
  removeOnComplete: {
    age: COMPLETED_RETENTION_AGE_SECONDS,
    count: RETENTION_COUNT,
  },
  removeOnFail: {
    age: FAILED_RETENTION_AGE_SECONDS,
    count: RETENTION_COUNT,
  },
};

type DispatchJobPayload = {
  importId: string;
  generation: number;
};

type ImportQueue = Pick<Queue<DispatchJobPayload>, "add" | "getJob">;

type ClaimedDispatch = {
  id: string;
  importId: string;
  generation: number;
  queueJobId: string;
  attemptCount: number;
  claimToken: string;
  claimedBy: string;
};

type DispatchReconcileResult = {
  missingJobs: number;
  staleClaims: number;
};

type DispatchReconcileCursor = {
  // Keep PostgreSQL's timestamp text so sub-millisecond precision is not lost
  // when a cursor crosses the node-postgres Date boundary.
  createdAt: string;
  id: string;
};

type DispatchErrorCode = "queue_unavailable" | "queue_job_missing";

const DISPATCH_ERROR_MESSAGES: Record<DispatchErrorCode, string> = {
  queue_job_missing: "Proses impor mengalami kendala sementara dan akan dicoba lagi otomatis.",
  queue_unavailable: "Proses impor sedang mengalami gangguan. Sistem akan mencoba lagi otomatis.",
};

// Keep each pass bounded while rotating through a stable created_at/id order.
// This cursor is process-local by design: every worker eventually scans the
// full backlog, and a restart safely begins again at the first page.
let dispatchReconcileCursor: DispatchReconcileCursor | null = null;
let dispatchReconcileInFlight: Promise<DispatchReconcileResult> | null = null;

function buildImportJobPayload(importId: string, generation: number): DispatchJobPayload {
  if (!isImportId(importId) || !Number.isSafeInteger(generation) || generation < 1) {
    throw new Error("invalid_import_job_identity");
  }
  // Keep this object literal deliberately narrow. It is the only value ever
  // handed to BullMQ, so CSV/profile/credential data cannot cross the queue
  // boundary accidentally.
  return { importId, generation };
}

function parseImportJobPayload(value: unknown): DispatchJobPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "generation" || keys[1] !== "importId") {
    return null;
  }
  const payload = value as { generation?: unknown; importId?: unknown };
  if (
    typeof payload.importId !== "string"
    || !isImportId(payload.importId)
    || typeof payload.generation !== "number"
    || !Number.isSafeInteger(payload.generation)
    || payload.generation < 1
  ) {
    return null;
  }
  return buildImportJobPayload(payload.importId, payload.generation);
}

function getDispatchBackoffMs(attemptCount: number) {
  const normalizedAttempt = Math.max(1, Math.min(Math.floor(attemptCount), 31));
  return Math.min(
    DISPATCH_BACKOFF_MAX_MS,
    DISPATCH_BACKOFF_BASE_MS * (2 ** (normalizedAttempt - 1)),
  );
}

function boundedDispatchError(code: DispatchErrorCode) {
  return {
    code,
    message: DISPATCH_ERROR_MESSAGES[code],
  };
}

function createImportQueue(connection: ConnectionOptions) {
  const queue = new Queue<DispatchJobPayload>(IMPORT_QUEUE_NAME, {
    connection,
    defaultJobOptions: DISPATCH_QUEUE_OPTIONS,
  });
  // BullMQ forwards RedisConnection failures through the queue emitter. Keep
  // an error sink attached from construction through teardown so an
  // unreachable pre-ready Redis cannot become an uncaught EventEmitter error
  // after queue.close() removes BullMQ's internal listeners.
  queue.on("error", () => undefined);
  return queue;
}

async function claimImportDispatches({
  limit = DISPATCH_BATCH_SIZE,
  workerId,
}: {
  limit?: number;
  workerId: string;
}) {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const boundedWorkerId = workerId.trim().slice(0, 120) || "admin-import-worker";

  return prisma.$transaction(async (tx) => {
    const candidates = await tx.$queryRaw<Array<{
      id: string;
      import_id: string;
      generation: number;
      queue_job_id: string;
      attempt_count: number;
    }>>`
      SELECT
        d.id,
        d.import_id,
        d.generation,
        d.queue_job_id,
        d.attempt_count
      FROM enrollment_import_dispatches d
      INNER JOIN enrollment_imports i ON i.id = d.import_id
      WHERE d.generation = i.dispatch_generation
        AND i.status IN ('queued'::enrollment_import_status, 'processing'::enrollment_import_status)
        AND d.status IN ('pending'::enrollment_import_dispatch_status, 'failed'::enrollment_import_dispatch_status)
        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= clock_timestamp())
        AND (
          d.claim_token IS NULL
          OR d.claim_expires_at IS NULL
          OR d.claim_expires_at <= clock_timestamp()
        )
      ORDER BY d.created_at ASC, d.id ASC
      LIMIT ${boundedLimit}
      FOR UPDATE OF d SKIP LOCKED
    `;

    const claimedAt = new Date();
    const claimed = await Promise.all(candidates.map(async (candidate): Promise<ClaimedDispatch> => {
      const claimToken = randomUUID();
      const queueJobId = buildImportJobId(candidate.import_id, candidate.generation);
      await tx.enrollmentImportDispatch.update({
        data: {
          attemptCount: { increment: 1 },
          claimExpiresAt: new Date(claimedAt.getTime() + DISPATCH_CLAIM_LEASE_MS),
          claimToken,
          claimedBy: boundedWorkerId,
          queueJobId,
        },
        where: { id: candidate.id },
      });
      return {
        attemptCount: candidate.attempt_count + 1,
        claimToken,
        claimedBy: boundedWorkerId,
        generation: candidate.generation,
        id: candidate.id,
        importId: candidate.import_id,
        queueJobId,
      };
    }));

    return claimed;
  });
}

async function markImportDispatchEnqueued({
  claimToken,
  dispatchId,
}: {
  claimToken: string;
  dispatchId: string;
}) {
  const result = await prisma.enrollmentImportDispatch.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      claimedBy: null,
      enqueuedAt: new Date(),
      lastErrorCode: null,
      lastErrorMessage: null,
      status: EnrollmentImportDispatchStatus.enqueued,
    },
    where: {
      claimToken,
      id: dispatchId,
      status: { in: [EnrollmentImportDispatchStatus.pending, EnrollmentImportDispatchStatus.failed] },
    },
  });
  return result.count === 1;
}

async function markImportDispatchFailed({
  claimToken,
  dispatchId,
  errorCode = "queue_unavailable",
}: {
  claimToken: string;
  dispatchId: string;
  errorCode?: DispatchErrorCode;
}) {
  const error = boundedDispatchError(errorCode);
  const current = await prisma.enrollmentImportDispatch.findFirst({
    select: { attemptCount: true },
    where: { claimToken, id: dispatchId },
  });
  const attemptCount = current?.attemptCount ?? 1;
  const nextAttemptAt = new Date(Date.now() + getDispatchBackoffMs(attemptCount));
  const result = await prisma.enrollmentImportDispatch.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      claimedBy: null,
      lastErrorCode: error.code,
      lastErrorMessage: error.message,
      nextAttemptAt,
      status: EnrollmentImportDispatchStatus.failed,
    },
    where: {
      claimToken,
      id: dispatchId,
      status: { in: [EnrollmentImportDispatchStatus.pending, EnrollmentImportDispatchStatus.failed] },
    },
  });
  return result.count === 1;
}

async function enqueueClaimedImportDispatch(
  queue: ImportQueue,
  dispatch: ClaimedDispatch,
) {
  const payload = buildImportJobPayload(dispatch.importId, dispatch.generation);
  const queueJobId = buildImportJobId(dispatch.importId, dispatch.generation);
  try {
    const existing = await queue.getJob(queueJobId);
    if (existing) {
      const jobWithState = existing as unknown as {
        getState?: () => Promise<string>;
        remove?: () => Promise<void>;
      };
      const state = typeof jobWithState.getState === "function"
        ? await jobWithState.getState()
        : null;
      if (state !== "completed" && state !== "failed") {
        await markImportDispatchEnqueued({
          claimToken: dispatch.claimToken,
          dispatchId: dispatch.id,
        });
        return { enqueued: true, payload };
      }
      if (typeof jobWithState.remove !== "function") {
        throw new Error("terminal_import_job_cannot_be_replaced");
      }
      await jobWithState.remove();
    }
    await queue.add(IMPORT_JOB_NAME, payload, {
      ...DISPATCH_QUEUE_OPTIONS,
      jobId: queueJobId,
    });
    await markImportDispatchEnqueued({
      claimToken: dispatch.claimToken,
      dispatchId: dispatch.id,
    });
    return { enqueued: true, payload };
  } catch {
    await markImportDispatchFailed({
      claimToken: dispatch.claimToken,
      dispatchId: dispatch.id,
    });
    return { enqueued: false, payload };
  }
}

async function dispatchPendingImportJobs({
  limit = DISPATCH_BATCH_SIZE,
  queue,
  workerId,
}: {
  limit?: number;
  queue: ImportQueue;
  workerId: string;
}) {
  const claimed = await claimImportDispatches({ limit, workerId });
  const results = await Promise.all(claimed.map((dispatch) => enqueueClaimedImportDispatch(queue, dispatch)));
  const enqueued = results.filter((result) => result.enqueued).length;
  return { claimed: claimed.length, enqueued, failed: results.length - enqueued };
}

async function resetStaleImportDispatchClaims() {
  const result = await prisma.enrollmentImportDispatch.updateMany({
    data: {
      claimExpiresAt: null,
      claimToken: null,
      claimedBy: null,
    },
    where: {
      claimExpiresAt: { lte: new Date() },
      status: { in: [EnrollmentImportDispatchStatus.pending, EnrollmentImportDispatchStatus.failed] },
    },
  });
  return result.count;
}

async function resetMissingImportJob(dispatchId: string) {
  const result = await prisma.enrollmentImportDispatch.updateMany({
    data: {
      enqueuedAt: null,
      lastErrorCode: "queue_job_missing",
      lastErrorMessage: DISPATCH_ERROR_MESSAGES.queue_job_missing,
      nextAttemptAt: new Date(),
      status: EnrollmentImportDispatchStatus.pending,
    },
    where: {
      id: dispatchId,
      status: EnrollmentImportDispatchStatus.enqueued,
    },
  });
  return result.count === 1;
}

async function reconcileImportDispatchesPass(queue: ImportQueue): Promise<DispatchReconcileResult> {
  const staleClaims = await resetStaleImportDispatchClaims();
  const currentEnqueued = dispatchReconcileCursor
    ? await prisma.$queryRaw<Array<{
      created_at: string;
      id: string;
      import_id: string;
      generation: number;
      queue_job_id: string;
    }>>`
      SELECT d.created_at::text AS created_at, d.id, d.import_id, d.generation, d.queue_job_id
      FROM enrollment_import_dispatches d
      INNER JOIN enrollment_imports i ON i.id = d.import_id
      WHERE d.status = 'enqueued'::enrollment_import_dispatch_status
        AND d.generation = i.dispatch_generation
        AND i.status IN ('queued'::enrollment_import_status, 'processing'::enrollment_import_status)
        AND (
          d.created_at > ${dispatchReconcileCursor.createdAt}::timestamptz
          OR (d.created_at = ${dispatchReconcileCursor.createdAt}::timestamptz AND d.id > ${dispatchReconcileCursor.id}::uuid)
        )
      ORDER BY d.created_at ASC, d.id ASC
      LIMIT ${DISPATCH_RECONCILE_PAGE_SIZE}
    `
    : await prisma.$queryRaw<Array<{
      created_at: string;
      id: string;
      import_id: string;
      generation: number;
      queue_job_id: string;
    }>>`
      SELECT d.created_at::text AS created_at, d.id, d.import_id, d.generation, d.queue_job_id
      FROM enrollment_import_dispatches d
      INNER JOIN enrollment_imports i ON i.id = d.import_id
      WHERE d.status = 'enqueued'::enrollment_import_dispatch_status
        AND d.generation = i.dispatch_generation
        AND i.status IN ('queued'::enrollment_import_status, 'processing'::enrollment_import_status)
      ORDER BY d.created_at ASC, d.id ASC
      LIMIT ${DISPATCH_RECONCILE_PAGE_SIZE}
    `;
  let missingJobs = 0;

  if (currentEnqueued.length === 0) {
    // The next pass starts at the first page after completing a cycle (or when
    // the backlog drained), so a large backlog cannot starve its tail.
    dispatchReconcileCursor = null;
    return { missingJobs, staleClaims };
  }

  const reconcileResults = await Promise.all(currentEnqueued.map(async (dispatch) => {
    const queueJobId = buildImportJobId(dispatch.import_id, dispatch.generation);
    if (dispatch.queue_job_id !== queueJobId) {
      await prisma.enrollmentImportDispatch.updateMany({
        data: { queueJobId },
        where: { id: dispatch.id, status: EnrollmentImportDispatchStatus.enqueued },
      });
    }
    const job = await queue.getJob(queueJobId);
    if (job) {
      const jobWithState = job as unknown as {
        getState?: () => Promise<string>;
        remove?: () => Promise<void>;
      };
      const state = typeof jobWithState.getState === "function"
        ? await jobWithState.getState()
        : null;
      if (state !== "completed" && state !== "failed") return 0;
      if (typeof jobWithState.remove !== "function") return 0;
      await jobWithState.remove();
      return (await resetMissingImportJob(dispatch.id)) ? 1 : 0;
    }
    return (await resetMissingImportJob(dispatch.id)) ? 1 : 0;
  }));
  missingJobs = reconcileResults.reduce<number>((total, result) => total + result, 0);

  const last = currentEnqueued[currentEnqueued.length - 1];
  dispatchReconcileCursor = { createdAt: last.created_at, id: last.id };

  return { missingJobs, staleClaims };
}

/**
 * Own the process-local cursor with one in-flight pass. The worker invokes
 * reconciliation from two timers; callers share this promise so a slower
 * page cannot finish after a newer page and move the cursor backward.
 */
function reconcileImportDispatches(queue: ImportQueue): Promise<DispatchReconcileResult> {
  if (dispatchReconcileInFlight) return dispatchReconcileInFlight;

  const pass = reconcileImportDispatchesPass(queue);
  dispatchReconcileInFlight = pass;
  pass.then(
    () => {
      if (dispatchReconcileInFlight === pass) dispatchReconcileInFlight = null;
    },
    () => {
      if (dispatchReconcileInFlight === pass) dispatchReconcileInFlight = null;
    },
  );
  return pass;
}

async function isCurrentImportGeneration({ importId, generation }: DispatchJobPayload) {
  if (!isImportId(importId) || !Number.isSafeInteger(generation) || generation < 1) return false;
  const imported = await prisma.enrollmentImport.findUnique({
    select: { dispatchGeneration: true, status: true },
    where: { id: importId },
  });
  return Boolean(
    imported
    && imported.dispatchGeneration === generation
    && (imported.status === EnrollmentImportStatus.queued || imported.status === EnrollmentImportStatus.processing),
  );
}

async function processImportJobPayload(
  value: unknown,
  options: {
    attemptsMade?: number;
    maxAttempts?: number;
    workerId?: string;
  } = {},
) {
  const payload = parseImportJobPayload(value);
  if (!payload) {
    throw new Error("invalid_import_job_payload");
  }
  const current = await isCurrentImportGeneration(payload);
  if (!current) {
    // A retry advances dispatchGeneration. Jobs from older generations remain
    // valid BullMQ records but are a strict no-op at the PostgreSQL boundary.
    return { current, payload, stale: !current };
  }

  try {
    const processed = await processImportGeneration({
      generation: payload.generation,
      importId: payload.importId,
      workerId: options.workerId,
    });
    return { current, payload, stale: false, ...processed };
  } catch (error) {
    const attemptsMade = Math.max(0, Math.floor(options.attemptsMade ?? 0));
    const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? BULLMQ_ATTEMPTS));
    if (attemptsMade + 1 < maxAttempts) throw error;
    const finalized = await failImportGeneration({
      errorCode: "job_exhausted",
      generation: payload.generation,
      importId: payload.importId,
    });
    return { current, payload, stale: false, exhausted: true, ...finalized };
  }
}

function getImportQueueOptions() {
  return { ...DISPATCH_QUEUE_OPTIONS };
}

export {
  BULLMQ_ATTEMPTS,
  COMPLETED_RETENTION_AGE_SECONDS,
  DISPATCH_BACKOFF_BASE_MS,
  DISPATCH_BACKOFF_MAX_MS,
  DISPATCH_BATCH_SIZE,
  DISPATCH_CLAIM_LEASE_MS,
  DISPATCH_RECONCILE_PAGE_SIZE,
  FAILED_RETENTION_AGE_SECONDS,
  IMPORT_JOB_NAME,
  IMPORT_QUEUE_NAME,
  RETENTION_COUNT,
  buildImportJobId,
  buildImportJobPayload,
  claimImportDispatches,
  createImportQueue,
  dispatchPendingImportJobs,
  getDispatchBackoffMs,
  getImportQueueOptions,
  isCurrentImportGeneration,
  markImportDispatchEnqueued,
  markImportDispatchFailed,
  parseImportJobPayload,
  processImportJobPayload,
  reconcileImportDispatches,
  resetStaleImportDispatchClaims,
};

export type {
  ClaimedDispatch,
  DispatchErrorCode,
  DispatchJobPayload,
  DispatchReconcileResult,
  ImportQueue,
};
