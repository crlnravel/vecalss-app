import "dotenv/config";

import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import IORedis from "ioredis";
import { Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import {
  IMPORT_QUEUE_NAME,
  createImportQueue,
  dispatchPendingImportJobs,
  processImportJobPayload,
  reconcileImportDispatches,
} from "@/lib/admin/imports/dispatch";
import {
  cleanupEnrollmentImports,
  reapExpiredImportRowClaims,
} from "@/lib/admin/imports/processing";
import {
  AdminImportRuntimeConfigError,
  validateAdminImportWorkerConfig,
  type WorkerRuntimeConfig,
} from "@/lib/admin/imports/runtime";

type ImportWorkerHandle = {
  shutdown: (signal?: string) => Promise<void>;
};

const STARTUP_READINESS_TIMEOUT_MS = 2_000;
const STARTUP_READINESS_ATTEMPTS = 2;
const STARTUP_RETRY_DELAY_MS = 100;
const SHUTDOWN_CONNECTION_TIMEOUT_MS = 1_000;
const POST_READY_QUEUE_RETRY_DELAY_MAX_MS = 2_000;

class WorkerStartupCancelledError extends Error {
  readonly code = "worker_startup_cancelled";

  constructor() {
    super("worker_startup_cancelled");
    this.name = "WorkerStartupCancelledError";
  }
}

function logEvent(event: string, fields: Record<string, string | number | boolean> = {}) {
  // IDs and bounded counters only. Never include Redis URLs, database URLs,
  // queue payloads, CSV data, or exception messages in worker logs.
  console.info(JSON.stringify({ event, ...fields }));
}

function buildPostReadyQueueConnection(url: string) {
  return {
    url,
    connectTimeout: STARTUP_READINESS_TIMEOUT_MS,
    enableReadyCheck: true,
    // Startup readiness is bounded by withTimeout; after that gate the Queue
    // must reconnect instead of ending permanently on a transient Redis flap.
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt: number) => Math.min(
      Math.max(attempt, 1) * 100,
      POST_READY_QUEUE_RETRY_DELAY_MAX_MS,
    ),
  };
}

function assertWorkerStartupActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new WorkerStartupCancelledError();
}

async function finalizeWorkerStartup({
  signal,
  writeHeartbeat,
  createTimers,
  emitReady,
}: {
  signal?: AbortSignal;
  writeHeartbeat: () => Promise<void>;
  createTimers: () => void;
  emitReady: () => void;
}) {
  await writeHeartbeat();
  // The signal can win after the heartbeat promise settles but before its
  // continuation runs. Check immediately, before timers, and before ready.
  assertWorkerStartupActive(signal);
  assertWorkerStartupActive(signal);
  createTimers();
  assertWorkerStartupActive(signal);
  emitReady();
}

async function checkDependencies(redis: IORedis) {
  await redis.ping();
  await prisma.$queryRaw`SELECT 1`;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("worker_startup_timeout"));
    }, timeoutMs);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new WorkerStartupCancelledError());
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

type WorkerReadinessChecks = {
  checkDependencies: () => Promise<void>;
  waitForQueue: () => Promise<void>;
  attempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
};

async function waitForWorkerReadiness({
  checkDependencies: check,
  waitForQueue,
  attempts = STARTUP_READINESS_ATTEMPTS,
  timeoutMs = STARTUP_READINESS_TIMEOUT_MS,
  retryDelayMs = STARTUP_RETRY_DELAY_MS,
  signal,
}: WorkerReadinessChecks) {
  const boundedAttempts = Math.min(Math.max(Math.floor(attempts), 1), 5);
  const boundedTimeout = Math.min(Math.max(Math.floor(timeoutMs), 50), 10_000);
  const boundedRetryDelay = Math.min(Math.max(Math.floor(retryDelayMs), 0), 1_000);
  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    if (signal?.aborted) throw new WorkerStartupCancelledError();
    try {
      await withTimeout(check(), boundedTimeout, signal);
      await withTimeout(waitForQueue(), boundedTimeout, signal);
      return;
    } catch (error) {
      if (error instanceof WorkerStartupCancelledError) throw error;
      if (attempt < boundedAttempts) await wait(boundedRetryDelay, signal);
    }
  }
  throw new Error("worker_startup_not_ready");
}

async function closeRedis(redis: IORedis) {
  try {
    await withTimeout(redis.quit(), SHUTDOWN_CONNECTION_TIMEOUT_MS);
  } catch {
    redis.disconnect();
  }
}

function createWorkerRedis(url: string) {
  const redis = new IORedis(url, {
    connectTimeout: STARTUP_READINESS_TIMEOUT_MS,
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  });
  // Keep connection errors bounded and out of logs; readiness owns the
  // surfaced startup result and emits only a stable code.
  redis.on("error", () => undefined);
  return redis;
}

async function writeHeartbeat(redis: IORedis, config: WorkerRuntimeConfig) {
  await redis.set(
    config.heartbeatKey,
    config.workerId,
    "EX",
    config.heartbeatTtlSeconds,
  );
}

async function clearHeartbeat(redis: IORedis, config: WorkerRuntimeConfig) {
  const current = await redis.get(config.heartbeatKey);
  if (current === config.workerId) {
    await redis.del(config.heartbeatKey);
  }
}

async function startAdminImportWorker(
  env: NodeJS.ProcessEnv = process.env,
  signal?: AbortSignal,
): Promise<ImportWorkerHandle> {
  if (signal?.aborted) throw new WorkerStartupCancelledError();
  const config = validateAdminImportWorkerConfig(env);
  const queueRedis = createWorkerRedis(config.redisUrl);
  const workerRedis = createWorkerRedis(config.redisUrl);
  const heartbeatRedis = createWorkerRedis(config.redisUrl);
  let queue: ReturnType<typeof createImportQueue> | null = null;
  let queueReady: Promise<unknown> | null = null;
  let worker: Worker | null = null;

  let stopping = false;
  let dispatchTimer: NodeJS.Timeout | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let reconcileTimer: NodeJS.Timeout | null = null;
  let rowReaperTimer: NodeJS.Timeout | null = null;
  let cleanupTimer: NodeJS.Timeout | null = null;

  const clearWorkerTimers = () => {
    if (dispatchTimer) clearInterval(dispatchTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (rowReaperTimer) clearInterval(rowReaperTimer);
    if (cleanupTimer) clearInterval(cleanupTimer);
    dispatchTimer = null;
    heartbeatTimer = null;
    reconcileTimer = null;
    rowReaperTimer = null;
    cleanupTimer = null;
  };

  const runDispatchCycle = async () => {
    const currentQueue = queue;
    if (stopping || !currentQueue) return;
    try {
      const reconciliation = await reconcileImportDispatches(currentQueue);
      if (reconciliation.missingJobs > 0) {
        logEvent("admin_import_worker_queue_job_missing", {
          count: reconciliation.missingJobs,
          workerId: config.workerId,
        });
      }
      if (reconciliation.staleClaims > 0) {
        logEvent("admin_import_worker_stale_claims_repaired", {
          count: reconciliation.staleClaims,
          workerId: config.workerId,
        });
      }
      await dispatchPendingImportJobs({
        queue: currentQueue,
        workerId: config.workerId,
      });
    } catch {
      logEvent("admin_import_worker_dispatch_cycle_failed", { workerId: config.workerId });
    }
  };

  const runHeartbeat = async () => {
    if (stopping) return;
    try {
      await checkDependencies(heartbeatRedis);
      await writeHeartbeat(heartbeatRedis, config);
    } catch {
      logEvent("admin_import_worker_heartbeat_failed", { workerId: config.workerId });
    }
  };

  const shutdown = async (signal = "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    clearWorkerTimers();
    await Promise.allSettled([
      worker ? withTimeout(worker.close(), SHUTDOWN_CONNECTION_TIMEOUT_MS) : Promise.resolve(),
      queue ? withTimeout(queue.close(), SHUTDOWN_CONNECTION_TIMEOUT_MS) : Promise.resolve(),
      withTimeout(clearHeartbeat(heartbeatRedis, config), SHUTDOWN_CONNECTION_TIMEOUT_MS),
    ]);
    await Promise.allSettled([
      closeRedis(heartbeatRedis),
      closeRedis(workerRedis),
      closeRedis(queueRedis),
    ]);
    await withTimeout(prisma.$disconnect(), SHUTDOWN_CONNECTION_TIMEOUT_MS).catch(() => undefined);
    logEvent("admin_import_worker_stopped", { signal, workerId: config.workerId });
  };

  try {
    // Raw Redis readiness is deliberately checked before constructing BullMQ's
    // Queue. This keeps an unreachable endpoint out of BullMQ's asynchronous
    // initialization/teardown race; the queue still has an error sink for
    // failures after construction.
    await waitForWorkerReadiness({
      checkDependencies: async () => {
        await checkDependencies(heartbeatRedis);
        await workerRedis.ping();
        await queueRedis.ping();
      },
      waitForQueue: async () => undefined,
      signal,
    });
    queue = createImportQueue(buildPostReadyQueueConnection(config.redisUrl));
    // Observe the same promise that Queue.close may otherwise leave pending;
    // its rejection remains handled even if signal cancellation wins the
    // bounded readiness race.
    queueReady = queue.waitUntilReady();
    void queueReady.catch(() => undefined);
    await withTimeout(queueReady, STARTUP_READINESS_TIMEOUT_MS, signal);
    worker = new Worker(
      IMPORT_QUEUE_NAME,
      async (job) => processImportJobPayload(job.data, {
        attemptsMade: job.attemptsMade,
        maxAttempts: typeof job.opts.attempts === "number" ? job.opts.attempts : undefined,
        workerId: config.workerId,
      }),
      {
        concurrency: 1,
        connection: workerRedis,
      },
    );
    worker.on("error", () => {
      logEvent("admin_import_worker_job_error", { workerId: config.workerId });
    });
    await finalizeWorkerStartup({
      signal,
      writeHeartbeat: () => withTimeout(
        writeHeartbeat(heartbeatRedis, config),
        STARTUP_READINESS_TIMEOUT_MS,
        signal,
      ),
      createTimers: () => {
        const runningQueue = queue;
        if (!runningQueue) throw new Error("worker_startup_not_ready");
        dispatchTimer = setInterval(() => void runDispatchCycle(), 1_000);
        heartbeatTimer = setInterval(() => void runHeartbeat(), config.heartbeatIntervalMs);
        reconcileTimer = setInterval(() => void reconcileImportDispatches(runningQueue).catch(() => {
          logEvent("admin_import_worker_reconcile_failed", { workerId: config.workerId });
        }), 15_000);
        rowReaperTimer = setInterval(() => void reapExpiredImportRowClaims().then((result) => {
          if (result.reset > 0 || result.failed > 0 || result.requeuedDispatches > 0) {
            logEvent("admin_import_worker_row_claims_reaped", {
              failed: result.failed,
              requeuedDispatches: result.requeuedDispatches,
              reset: result.reset,
              workerId: config.workerId,
            });
          }
        }).catch(() => {
          logEvent("admin_import_worker_row_reaper_failed", { workerId: config.workerId });
        }), 30_000);
        cleanupTimer = setInterval(() => void cleanupEnrollmentImports().then((result) => {
          if (result.expiredHandoffs > 0 || result.purgedHandoffs > 0 || result.purgedImports > 0) {
            logEvent("admin_import_worker_cleanup", {
              expiredHandoffs: result.expiredHandoffs,
              purgedHandoffs: result.purgedHandoffs,
              purgedImports: result.purgedImports,
              workerId: config.workerId,
            });
          }
        }).catch(() => {
          logEvent("admin_import_worker_cleanup_failed", { workerId: config.workerId });
        }), 24 * 60 * 60 * 1_000);
        dispatchTimer.unref();
        heartbeatTimer.unref();
        reconcileTimer.unref();
        rowReaperTimer.unref();
        cleanupTimer.unref();
      },
      emitReady: () => {
        logEvent("admin_import_worker_ready", {
          heartbeatTtlSeconds: config.heartbeatTtlSeconds,
          host: hostname(),
          queue: IMPORT_QUEUE_NAME,
          workerId: config.workerId,
        });
      },
    });
    void runDispatchCycle();
  } catch (error) {
    clearWorkerTimers();
    // Let any in-flight BullMQ initialization settle while its queue error
    // sink is still attached, then close the queue and raw clients. This
    // avoids a late RedisConnection rejection escaping after queue.close().
    if (queueReady) {
      await withTimeout(queueReady.catch(() => undefined), SHUTDOWN_CONNECTION_TIMEOUT_MS).catch(() => undefined);
    }
    await Promise.allSettled([
      worker ? withTimeout(worker.close(), SHUTDOWN_CONNECTION_TIMEOUT_MS) : Promise.resolve(),
      queue ? withTimeout(queue.close(), SHUTDOWN_CONNECTION_TIMEOUT_MS) : Promise.resolve(),
      withTimeout(clearHeartbeat(heartbeatRedis, config), SHUTDOWN_CONNECTION_TIMEOUT_MS),
      closeRedis(heartbeatRedis),
      closeRedis(workerRedis),
      closeRedis(queueRedis),
    ]);
    await withTimeout(prisma.$disconnect(), SHUTDOWN_CONNECTION_TIMEOUT_MS).catch(() => undefined);
    if (error instanceof WorkerStartupCancelledError) throw error;
    throw new Error("worker_startup_not_ready");
  }

  return { shutdown };
}

async function main() {
  const startupController = new AbortController();
  let handle: ImportWorkerHandle | null = null;
  let running = false;
  const onSignal = (signal: string) => {
    if (handle) {
      void handle.shutdown(signal);
      return;
    }
    startupController.abort();
  };
  const onSigterm = () => onSignal("SIGTERM");
  const onSigint = () => onSignal("SIGINT");
  // Install handlers before any DB/Redis/queue readiness await so startup
  // interruption uses the same bounded cleanup path as a running worker.
  process.once("SIGTERM", onSigterm);
  process.once("SIGINT", onSigint);

  try {
    handle = await startAdminImportWorker(process.env, startupController.signal);
    if (startupController.signal.aborted) {
      await handle.shutdown("startup_signal");
      return;
    }
    running = true;
  } catch (error) {
    if (error instanceof WorkerStartupCancelledError || startupController.signal.aborted) {
      logEvent("admin_import_worker_startup_cancelled", { code: "worker_startup_cancelled" });
      return;
    }
    if (error instanceof AdminImportRuntimeConfigError) {
      console.error(JSON.stringify({ code: error.code, event: "admin_import_worker_startup_failed" }));
    } else {
      const code = error instanceof Error && error.message === "worker_startup_not_ready"
        ? "worker_startup_not_ready"
        : "worker_startup_failed";
      console.error(JSON.stringify({ code, event: "admin_import_worker_startup_failed" }));
    }
    process.exitCode = 1;
  } finally {
    if (!running) {
      process.removeListener("SIGTERM", onSigterm);
      process.removeListener("SIGINT", onSigint);
    }
  }
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  void main();
}

export {
  checkDependencies,
  clearHeartbeat,
  logEvent,
  main,
  assertWorkerStartupActive,
  buildPostReadyQueueConnection,
  finalizeWorkerStartup,
  startAdminImportWorker,
  POST_READY_QUEUE_RETRY_DELAY_MAX_MS,
  STARTUP_READINESS_ATTEMPTS,
  STARTUP_READINESS_TIMEOUT_MS,
  WorkerStartupCancelledError,
  waitForWorkerReadiness,
  writeHeartbeat,
};

export type { ImportWorkerHandle };
