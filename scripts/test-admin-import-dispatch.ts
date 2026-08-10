import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BULLMQ_ATTEMPTS,
  COMPLETED_RETENTION_AGE_SECONDS,
  FAILED_RETENTION_AGE_SECONDS,
  RETENTION_COUNT,
  buildImportJobId,
  buildImportJobPayload,
  getDispatchBackoffMs,
  getImportQueueOptions,
  parseImportJobPayload,
} from "@/lib/admin/imports/dispatch";
import {
  AdminImportRuntimeConfigError,
  validateAdminImportWorkerConfig,
  validateDisposableSmokeUrls,
} from "@/lib/admin/imports/runtime";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const importService = await readFile(resolve(root, "lib/admin/imports/service.ts"), "utf8");
const dispatch = await readFile(resolve(root, "lib/admin/imports/dispatch.ts"), "utf8");
const confirmRoute = await readFile(resolve(root, "app/api/admin/imports/[importId]/confirm/route.ts"), "utf8");
const smoke = await readFile(resolve(root, "scripts/admin-import-worker-smoke.ts"), "utf8");
const readiness = await readFile(resolve(root, "scripts/test-admin-import-worker-readiness.ts"), "utf8");
const flap = await readFile(resolve(root, "scripts/test-admin-import-worker-flap.ts"), "utf8");
const worker = await readFile(resolve(root, "workers/admin-import-worker.ts"), "utf8");

const importId = "550e8400-e29b-41d4-a716-446655440000";
const jobId = buildImportJobId(importId, 1);
assert.equal(jobId, `${importId}:dispatch:1`);
assert.deepEqual(jobId.split(":"), [importId, "dispatch", "1"]);
assert.notEqual(jobId, buildImportJobId(importId, 2));
assert.deepEqual(buildImportJobPayload(importId, 3), { importId, generation: 3 });
assert.deepEqual(parseImportJobPayload({ importId, generation: 3 }), { importId, generation: 3 });
assert.equal(parseImportJobPayload({ importId, generation: 3, csv: "secret" }), null);
assert.equal(parseImportJobPayload({ importId: "not-an-id", generation: 3 }), null);
assert.throws(() => buildImportJobId(importId, 0), /invalid_import_job_identity/u);
assert.deepEqual(
  [1, 2, 3, 20].map(getDispatchBackoffMs),
  [2_000, 4_000, 8_000, 300_000],
);
const queueOptions = getImportQueueOptions();
assert.equal(queueOptions.attempts, BULLMQ_ATTEMPTS);
assert.deepEqual(queueOptions.backoff, { delay: 2_000, type: "exponential" });
assert.deepEqual(queueOptions.removeOnComplete, { age: COMPLETED_RETENTION_AGE_SECONDS, count: RETENTION_COUNT });
assert.deepEqual(queueOptions.removeOnFail, { age: FAILED_RETENTION_AGE_SECONDS, count: RETENTION_COUNT });

const key = randomBytes(32).toString("base64");
const validEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://worker:password@localhost:5432/vecalss_worker",
  REDIS_URL: "redis://localhost:6379/0",
  APP_BASE_URL: "https://app.example.test",
  ENROLLMENT_HANDOFF_KEY_RING: JSON.stringify({ "local-v1": key }),
  ENROLLMENT_HANDOFF_ACTIVE_KEY_ID: "local-v1",
  NODE_ENV: "production",
};
const config = validateAdminImportWorkerConfig(validEnv);
assert.equal(config.appBaseUrl, "https://app.example.test");
assert.equal(config.redisUrl, validEnv.REDIS_URL);
assert.equal(config.databaseUrl, validEnv.DATABASE_URL);
assert.equal(config.heartbeatTtlSeconds, 45);

assert.throws(
  () => validateAdminImportWorkerConfig({ ...validEnv, DATABASE_URL: "" }),
  (error: unknown) => error instanceof AdminImportRuntimeConfigError && error.code === "missing_database_url",
);
assert.throws(
  () => validateAdminImportWorkerConfig({ ...validEnv, REDIS_URL: "https://redis.example.test" }),
  (error: unknown) => error instanceof AdminImportRuntimeConfigError && error.code === "invalid_redis_url",
);
assert.throws(
  () => validateAdminImportWorkerConfig({ ...validEnv, APP_BASE_URL: "https://app.example.test/path" }),
  (error: unknown) => error instanceof AdminImportRuntimeConfigError && error.code === "invalid_app_base_url",
);
assert.throws(
  () => validateDisposableSmokeUrls({
    databaseUrl: "postgresql://worker:password@db.staging.example.test:5432/worker_test",
    redisUrl: "redis://localhost:6379/0",
  }),
  /local_disposable/u,
);

assert.match(importService, /prisma\.\$transaction\(async \(tx\)/u);
assert.match(importService, /FROM enrollment_imports[\s\S]*FOR UPDATE/u);
assert.match(importService, /enrollmentImportDispatch\.create/u);
assert.match(importService, /status: EnrollmentImportStatus\.queued/u);
assert.match(importService, /invalid_rows_pending_skip/u);
assert.match(importService, /const queueJobId = buildImportJobId\(imported\.id, generation\)/u);
assert.match(importService, /queueJobId\s*\}\s*,/u);
assert.match(dispatch, /FOR UPDATE OF d SKIP LOCKED/u);
assert.match(dispatch, /next_attempt_at/u);
assert.match(dispatch, /queue\.getJob/u);
assert.match(dispatch, /getState/u);
assert.match(dispatch, /jobWithState\.remove/u);
assert.match(dispatch, /terminal_import_job_cannot_be_replaced/u);
assert.match(dispatch, /dispatchReconcileCursor/u);
assert.match(dispatch, /ORDER BY d\.created_at ASC, d\.id ASC/u);
assert.match(dispatch, /DISPATCH_RECONCILE_PAGE_SIZE/u);
assert.match(dispatch, /dispatchReconcileInFlight/u);
assert.match(dispatch, /queue\.on\("error", \(\) => undefined\)/u);
assert.match(dispatch, /dispatchGeneration === generation/u);
assert.match(dispatch, /stale: !current/u);
assert.match(smoke, /buildImportJobId\(importId, generation\)/u);
assert.match(smoke, /await queue\.add\(/u);
assert.match(smoke, /assert\.equal\(job\.id, jobId\)/u);
assert.match(confirmRoute, /origin/u);
assert.match(confirmRoute, /requireAdminSession/u);
assert.match(confirmRoute, /Cache-Control.*no-store/u);
assert.match(worker, /heartbeatKey/u);
assert.match(worker, /waitForWorkerReadiness/u);
assert.match(worker, /STARTUP_READINESS_TIMEOUT_MS/u);
assert.match(worker, /queueRedis\.ping\(\)/u);
assert.match(worker, /queueReady\.catch\(\(\) => undefined\)/u);
assert.match(worker, /buildPostReadyQueueConnection/u);
assert.match(worker, /retryStrategy: \(attempt: number\)/u);
assert.match(worker, /finalizeWorkerStartup/u);
assert.match(worker, /startupController\.abort\(\)/u);
assert.match(worker, /worker_startup_cancelled/u);
assert.match(worker, /SIGTERM/u);
assert.match(worker, /worker\.close\(\)/u);
assert.match(readiness, /spawn\(process\.execPath/u);
assert.match(readiness, /SIGTERM.*SIGINT/u);
assert.match(readiness, /worker_spawn_readiness_exit_timeout/u);
assert.match(readiness, /heartbeatRaceController/u);
assert.match(flap, /stopRedis\(redis\)/u);
assert.match(flap, /queue\.getJob/u);
assert.match(flap, /buildPostReadyQueueConnection/u);
assert.ok(
  worker.indexOf('process.once("SIGTERM", onSigterm)')
    < worker.indexOf("startAdminImportWorker(process.env, startupController.signal)"),
  "startup signal handlers must be installed before readiness",
);

console.log("admin import dispatch/runtime checks passed");
