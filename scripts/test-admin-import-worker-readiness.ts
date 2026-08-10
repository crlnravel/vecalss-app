import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import IORedis from "ioredis";

import {
  finalizeWorkerStartup,
  STARTUP_READINESS_ATTEMPTS,
  STARTUP_READINESS_TIMEOUT_MS,
  waitForWorkerReadiness,
} from "@/workers/admin-import-worker";
import { validateDisposableSmokeUrls } from "@/lib/admin/imports/runtime";

const startedAt = performance.now();
const unreachableRedis = new IORedis("redis://127.0.0.1:1/0", {
  connectTimeout: 100,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
unreachableRedis.on("error", () => undefined);
await assert.rejects(
  waitForWorkerReadiness({
    checkDependencies: async () => {
      await unreachableRedis.ping();
    },
    waitForQueue: async () => undefined,
    attempts: 1,
    timeoutMs: 100,
    retryDelayMs: 0,
  }),
  /worker_startup_not_ready/u,
);
unreachableRedis.disconnect();
const elapsedMs = performance.now() - startedAt;
assert.ok(elapsedMs < 1_000, `readiness exceeded bounded test window: ${elapsedMs}ms`);

await assert.rejects(
  waitForWorkerReadiness({
    // A hanging ping models a network black hole; the timeout remains bounded
    // even when the client cannot produce an immediate ECONNREFUSED.
    checkDependencies: () => new Promise<void>(() => undefined),
    waitForQueue: async () => undefined,
    attempts: 2,
    timeoutMs: 100,
    retryDelayMs: 0,
  }),
  /worker_startup_not_ready/u,
);

const startupAbort = new AbortController();
const cancelledReadiness = waitForWorkerReadiness({
  checkDependencies: () => new Promise<void>(() => undefined),
  waitForQueue: async () => undefined,
  attempts: 2,
  timeoutMs: 1_000,
  signal: startupAbort.signal,
});
setTimeout(() => startupAbort.abort(), 10);
await assert.rejects(cancelledReadiness, /worker_startup_cancelled/u);

let readyChecks = 0;
await waitForWorkerReadiness({
  checkDependencies: async () => {
    readyChecks += 1;
  },
  waitForQueue: async () => undefined,
});
assert.equal(readyChecks, 1);
assert.ok(STARTUP_READINESS_ATTEMPTS > 0);
assert.ok(STARTUP_READINESS_TIMEOUT_MS > 0);

let heartbeatRaceTimersCreated = false;
let heartbeatRaceReady = false;
const heartbeatRaceController = new AbortController();
await assert.rejects(
  finalizeWorkerStartup({
    signal: heartbeatRaceController.signal,
    writeHeartbeat: async () => {
      heartbeatRaceController.abort();
    },
    createTimers: () => {
      heartbeatRaceTimersCreated = true;
    },
    emitReady: () => {
      heartbeatRaceReady = true;
    },
  }),
  /worker_startup_cancelled/u,
);
assert.equal(heartbeatRaceTimersCreated, false);
assert.equal(heartbeatRaceReady, false);

let beforeReadyRaceReady = false;
const beforeReadyRaceController = new AbortController();
await assert.rejects(
  finalizeWorkerStartup({
    signal: beforeReadyRaceController.signal,
    writeHeartbeat: async () => undefined,
    createTimers: () => {
      beforeReadyRaceController.abort();
    },
    emitReady: () => {
      beforeReadyRaceReady = true;
    },
  }),
  /worker_startup_cancelled/u,
);
assert.equal(beforeReadyRaceReady, false);

type ProbeMode = "close" | "hold";

type RedisProbe = {
  close: () => Promise<void>;
  url: string;
};

async function createRedisProbe(mode: ProbeMode): Promise<RedisProbe> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.once("close", () => sockets.delete(socket));
    if (mode === "close") socket.destroy();
  });
  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolvePromise();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address() as AddressInfo;
  return {
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      });
    },
    url: `redis://127.0.0.1:${address.port}/0`,
  };
}

type SpawnedWorkerResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
};

function spawnWorker(redisUrl: string, databaseUrl: string) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const workerPath = resolve(root, "workers/admin-import-worker.ts");
  const key = Buffer.alloc(32, 7).toString("base64");
  const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
    cwd: root,
    env: {
      ...process.env,
      APP_BASE_URL: "https://app.example.test",
      DATABASE_URL: databaseUrl,
      ENROLLMENT_HANDOFF_ACTIVE_KEY_ID: "spawn-test-v1",
      ENROLLMENT_HANDOFF_KEY_RING: JSON.stringify({ "spawn-test-v1": key }),
      NODE_ENV: "test",
      REDIS_URL: redisUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<SpawnedWorkerResult>((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("worker_spawn_readiness_exit_timeout"));
    }, 8_000);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stderr, stdout });
    });
  });
  return { child, exited };
}

function combinedOutput(result: SpawnedWorkerResult) {
  return `${result.stdout}\n${result.stderr}`;
}

function assertNoStartupLeaks(result: SpawnedWorkerResult) {
  const output = combinedOutput(result);
  assert.doesNotMatch(output, /RedisConnection|Emitted ['"]error['"]|uncaught|Unhandled/u);
  assert.doesNotMatch(output, /admin_import_worker_ready|admin_import_worker_heartbeat/u);
  return output;
}

if (process.env.ADMIN_IMPORT_WORKER_SPAWN_TEST !== "1") {
  console.log("admin import worker spawned readiness checks skipped: set ADMIN_IMPORT_WORKER_SPAWN_TEST=1 with a dedicated local test database URL; runtime URLs are never used.");
} else if (!process.env.ADMIN_IMPORT_WORKER_SPAWN_TEST_DATABASE_URL) {
  console.log("admin import worker spawned readiness checks skipped: ADMIN_IMPORT_WORKER_SPAWN_TEST_DATABASE_URL is required; runtime URLs are never used.");
} else {
  const { databaseUrl } = validateDisposableSmokeUrls({
    databaseUrl: process.env.ADMIN_IMPORT_WORKER_SPAWN_TEST_DATABASE_URL,
    redisUrl: "redis://127.0.0.1:1/0",
  });

  const refusingProbe = await createRedisProbe("close");
  try {
    const failedWorker = spawnWorker(refusingProbe.url, databaseUrl);
    const failedResult = await failedWorker.exited;
    const failedOutput = assertNoStartupLeaks(failedResult);
    assert.equal(failedResult.code, 1);
    assert.match(failedOutput, /"code":"worker_startup_not_ready"/u);
    assert.doesNotMatch(failedOutput, /worker_startup_cancelled/u);
  } finally {
    await refusingProbe.close();
  }

  const hangingProbe = await createRedisProbe("hold");
  try {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const signalledWorker = spawnWorker(hangingProbe.url, databaseUrl);
      // Allow tsx to load the module and install the pre-ready handlers while
      // the probe keeps Redis readiness pending.
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
      assert.equal(signalledWorker.child.kill(signal), true);
      const signalledResult = await signalledWorker.exited;
      const signalledOutput = assertNoStartupLeaks(signalledResult);
      assert.equal(signalledResult.code, 0);
      assert.match(signalledOutput, /admin_import_worker_startup_cancelled/u);
      assert.doesNotMatch(signalledOutput, /worker_startup_failed|worker_startup_not_ready/u);
    }
  } finally {
    await hangingProbe.close();
  }
  console.log("admin import worker spawned readiness checks passed");
}

console.log("admin import worker readiness checks passed");
