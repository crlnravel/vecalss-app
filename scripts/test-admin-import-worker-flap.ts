import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";

import IORedis from "ioredis";

import {
  buildImportJobId,
  buildImportJobPayload,
  createImportQueue,
  IMPORT_JOB_NAME,
} from "@/lib/admin/imports/dispatch";
import { buildPostReadyQueueConnection } from "@/workers/admin-import-worker";

const TEST_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;

function hasRedisServer(binary: string) {
  const result = spawnSync(binary, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

async function reservePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function startRedis(binary: string, port: number) {
  const child = spawn(binary, [
    "--bind",
    "127.0.0.1",
    "--port",
    String(port),
    "--save",
    "",
    "--appendonly",
    "no",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

async function waitForRedis(redisUrl: string) {
  const redis = new IORedis(redisUrl, {
    connectTimeout: 250,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      try {
        await redis.ping();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    throw new Error("admin_import_flap_redis_ready_timeout");
  } finally {
    redis.disconnect();
  }
}

async function stopRedis(child: ChildProcess) {
  if (child.exitCode !== null) return;
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("admin_import_flap_redis_stop_timeout"));
    }, TEST_TIMEOUT_MS);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function eventually<T>(operation: () => Promise<T>) {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("admin_import_flap_operation_timeout");
}

if (process.env.ADMIN_IMPORT_WORKER_FLAP_TEST !== "1") {
  console.log("admin import worker Redis flap checks skipped: set ADMIN_IMPORT_WORKER_FLAP_TEST=1 with a disposable local redis-server; runtime URLs are never used.");
} else {
  const redisBinary = process.env.ADMIN_IMPORT_WORKER_FLAP_REDIS_SERVER_BIN || "redis-server";
  if (!hasRedisServer(redisBinary)) {
    console.log("admin import worker Redis flap checks skipped: disposable redis-server is unavailable; runtime URLs are never used.");
  } else {
    const port = await reservePort();
    const redisUrl = `redis://127.0.0.1:${port}/0`;
    let redis: ChildProcess | null = null;
    let queue: ReturnType<typeof createImportQueue> | null = null;
    try {
      redis = startRedis(redisBinary, port);
      await waitForRedis(redisUrl);
      queue = createImportQueue(buildPostReadyQueueConnection(redisUrl));
      await queue.waitUntilReady();

      const firstImportId = randomUUID();
      const firstJobId = buildImportJobId(firstImportId, 1);
      const firstJob = await queue.add(
        IMPORT_JOB_NAME,
        buildImportJobPayload(firstImportId, 1),
        { jobId: firstJobId },
      );
      assert.equal(firstJob.id, firstJobId);
      assert.ok(await queue.getJob(firstJobId));

      await stopRedis(redis);
      redis = null;
      redis = startRedis(redisBinary, port);
      await waitForRedis(redisUrl);

      const recoveredImportId = randomUUID();
      const recoveredJobId = buildImportJobId(recoveredImportId, 1);
      const recoveredJob = await eventually(() => queue!.add(
        IMPORT_JOB_NAME,
        buildImportJobPayload(recoveredImportId, 1),
        { jobId: recoveredJobId },
      ));
      assert.equal(recoveredJob.id, recoveredJobId);
      assert.ok(await eventually(() => queue!.getJob(recoveredJobId)));
      console.log("admin import worker Redis flap checks passed");
    } finally {
      await queue?.close().catch(() => undefined);
      if (redis) await stopRedis(redis).catch(() => undefined);
    }
  }
}
