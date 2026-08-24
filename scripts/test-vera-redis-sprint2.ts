import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Socket } from "node:net";

import IORedis from "ioredis";

import {
  IORedisVeraLeaseStore,
  VeraRedisUnavailableError,
} from "../lib/vera-ai/redis-lease";

type RaceResult = {
  acquired: boolean;
  fencingToken: number | null;
  rejectionReason: string | null;
  workerId: string;
};

type RaceWorker = {
  child: ChildProcess;
  finished: Promise<RaceResult>;
  ready: Promise<void>;
};

function requireDisposableRedisUrl(): string {
  const value = process.env.VERA_DISPOSABLE_REDIS_URL;
  if (!value) throw new Error("Set VERA_DISPOSABLE_REDIS_URL to the isolated Redis database.");
  return value;
}

const redisUrl = requireDisposableRedisUrl();
assert.equal(process.env.REDIS_URL, redisUrl, "REDIS_URL must be command-local and match the disposable Redis URL");
const parsedRedisUrl = new URL(redisUrl);
assert(["127.0.0.1", "localhost"].includes(parsedRedisUrl.hostname), "Redis fixture refuses non-local hosts");
assert.equal(parsedRedisUrl.pathname, "/15", "Redis fixture requires isolated database 15");

const namespace = `vera-sprint2-${randomUUID()}`;
const keyPattern = `vera:lease:${namespace}-*`;
const admin = new IORedis(redisUrl, {
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
const stores: IORedisVeraLeaseStore[] = [];

function makeStore(url = redisUrl): IORedisVeraLeaseStore {
  const store = new IORedisVeraLeaseStore(url);
  stores.push(store);
  return store;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function deleteFixtureKeys(): Promise<void> {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await admin.scan(cursor, "MATCH", keyPattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) await admin.del(...keys);
  } while (cursor !== "0");
}

function raceWorker(studentId: string, workerId: string): RaceWorker {
  const child = spawn("pnpm", ["exec", "tsx", "scripts/vera-redis-race-worker.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --conditions=react-server`.trim(),
      REDIS_URL: redisUrl,
      VERA_DISPOSABLE_REDIS_URL: redisUrl,
      VERA_REDIS_RACE_STUDENT: studentId,
      VERA_REDIS_RACE_WORKER: workerId,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let result: RaceResult | null = null;
  let readyResolve: (() => void) | undefined;
  let readyReject: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("READY ")) readyResolve?.();
      if (line.startsWith("{")) result = JSON.parse(line) as RaceResult;
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBuffer = `${stderrBuffer}${chunk.toString()}`.slice(-4_000);
  });
  const finished = new Promise<RaceResult>((resolve, reject) => {
    child.once("error", (error) => {
      readyReject?.(error);
      reject(error);
    });
    child.once("close", (code) => {
      if (code === 0 && result) resolve(result);
      else {
        const error = new Error(`Redis race worker ${workerId} failed (${code}): ${stderrBuffer}`);
        readyReject?.(error);
        reject(error);
      }
    });
  });
  return { child, finished, ready };
}

async function createBlackholeServer(): Promise<{ close: () => Promise<void>; port: number }> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Blackhole server did not expose a TCP port.");
  return {
    port: address.port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function expectUnavailableWithin(operation: () => Promise<unknown>, maximumMilliseconds: number): Promise<number> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await assert.rejects(
    () => Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis operation exceeded its bounded timeout.")), maximumMilliseconds);
      }),
    ]),
    (error: unknown) => error instanceof VeraRedisUnavailableError,
  );
  if (timer) clearTimeout(timer);
  return Date.now() - startedAt;
}

try {
  await admin.connect();
  assert.equal(await admin.ping(), "PONG");
  await deleteFixtureKeys();

  const readinessStores = Array.from({ length: 8 }, () => makeStore());
  const readinessOutcomes = await Promise.all(readinessStores.map((store, index) => store.acquire({
    studentId: `${namespace}-readiness-${index}`,
    featureKey: "vera.chat",
    maxConcurrent: 1,
    burstLimit: 5,
    burstWindowMs: 60_000,
    ttlMs: 1_000,
  })));
  assert(readinessOutcomes.every((lease) => lease), "healthy Redis rejected a first command before ready");
  await Promise.all(readinessOutcomes.map((lease, index) => readinessStores[index]!.release(lease!)));
  console.log("PASS vera-redis-sprint2: eight healthy first commands wait for ready without offline queues");

  const concurrencyStores = [makeStore(), makeStore()];
  const concurrencyInput = {
    studentId: `${namespace}-atomic-concurrency`,
    featureKey: "vera.chat",
    maxConcurrent: 1,
    burstLimit: 10,
    burstWindowMs: 60_000,
    ttlMs: 2_000,
  };
  const concurrencyOutcomes = await Promise.all(concurrencyStores.map((store) => store.acquireWithReason(concurrencyInput)));
  assert.equal(concurrencyOutcomes.filter((outcome) => outcome.lease).length, 1, "atomic concurrency admitted more than one owner");
  assert.equal(concurrencyOutcomes.filter((outcome) => outcome.rejectionReason === "concurrency").length, 1);
  const concurrencyLease = concurrencyOutcomes.find((outcome) => outcome.lease)?.lease;
  assert(concurrencyLease);
  await concurrencyStores[0]!.release(concurrencyLease);

  const burstStores = [makeStore(), makeStore()];
  const burstInput = { ...concurrencyInput, studentId: `${namespace}-atomic-burst`, maxConcurrent: 2, burstLimit: 1 };
  const burstFirst = await burstStores[0]!.acquireWithReason(burstInput);
  assert(burstFirst.lease);
  const burstSecond = await burstStores[1]!.acquireWithReason(burstInput);
  assert.equal(burstSecond.rejectionReason, "burst");
  await burstStores[0]!.release(burstFirst.lease);
  console.log("PASS vera-redis-sprint2: atomic Lua acquisition preserves concurrency and burst reasons");

  const fencingStore = makeStore();
  const fencingInput = { ...concurrencyInput, studentId: `${namespace}-fencing`, ttlMs: 1_000 };
  const firstFence = await fencingStore.acquire(fencingInput);
  assert(firstFence);
  assert.equal(await fencingStore.release(firstFence), true);
  assert.equal(await fencingStore.release(firstFence), true, "release was not idempotent");
  const secondFence = await fencingStore.acquire(fencingInput);
  assert(secondFence);
  assert(secondFence.fencingToken > firstFence.fencingToken, "fencing token did not advance");
  assert.equal(await fencingStore.renew(firstFence, 1_000), null, "stale owner renewed a newer lease");
  await fencingStore.release(firstFence);
  assert(await fencingStore.renew(secondFence, 1_000), "stale release invalidated the current owner");
  await fencingStore.release(secondFence);
  console.log("PASS vera-redis-sprint2: fencing advances and stale release/renew cannot affect the current owner");

  const ttlStore = makeStore();
  const ttlPeer = makeStore();
  const ttlInput = { ...concurrencyInput, studentId: `${namespace}-ttl`, maxConcurrent: 2, ttlMs: 200 };
  const expiringLease = await ttlStore.acquire(ttlInput);
  const survivingLease = await ttlPeer.acquire(ttlInput);
  assert(expiringLease && survivingLease);
  await delay(120);
  const survivingRenewal = await ttlPeer.renew(survivingLease, 600);
  assert(survivingRenewal);
  await delay(130);
  assert.equal(await ttlStore.renew(expiringLease, 300), null, "expired owner was revived while a peer kept the hash alive");
  const replacementLease = await ttlStore.acquire(ttlInput);
  assert(replacementLease, "expired owner was not pruned for reacquisition");
  assert(replacementLease.fencingToken > survivingLease.fencingToken);
  await ttlStore.release(expiringLease);
  assert(await ttlPeer.renew(survivingRenewal, 300), "old owner release removed a surviving peer");
  await ttlStore.release(replacementLease);
  await ttlPeer.release(survivingRenewal);

  const ttlIsolationStore = makeStore();
  const ttlIsolationInput = {
    ...concurrencyInput,
    studentId: `${namespace}-ttl-isolation`,
    maxConcurrent: 2,
    ttlMs: 700,
  };
  const longOwner = await ttlIsolationStore.acquire(ttlIsolationInput);
  assert(longOwner);
  await delay(50);
  const shortOwner = await ttlIsolationStore.acquire({ ...ttlIsolationInput, ttlMs: 100 });
  assert(shortOwner);
  await delay(170);
  const isolationOutcome = await ttlIsolationStore.acquireWithReason({ ...ttlIsolationInput, maxConcurrent: 1, ttlMs: 300 });
  assert.equal(isolationOutcome.lease, null, "short owner truncated a longer sibling's hash TTL");
  assert.equal(isolationOutcome.rejectionReason, "concurrency");
  await ttlIsolationStore.release(longOwner);
  console.log("PASS vera-redis-sprint2: renewal rejects expired owners and per-owner TTL isolation stays fenced");

  const unavailableUrl = new URL(redisUrl);
  unavailableUrl.port = "1";
  const unavailableStore = makeStore(unavailableUrl.toString());
  const unavailableElapsed = await expectUnavailableWithin(
    () => unavailableStore.acquire({ ...concurrencyInput, studentId: `${namespace}-unavailable` }),
    2_500,
  );
  assert(unavailableElapsed < 2_500);

  const blackhole = await createBlackholeServer();
  const timeoutUrl = new URL(redisUrl);
  timeoutUrl.port = String(blackhole.port);
  const timeoutStore = makeStore(timeoutUrl.toString());
  try {
    const timeoutElapsed = await expectUnavailableWithin(
      () => timeoutStore.acquire({ ...concurrencyInput, studentId: `${namespace}-timeout` }),
      2_500,
    );
    assert(timeoutElapsed >= 750 && timeoutElapsed < 2_500, `command timeout was not bounded: ${timeoutElapsed}ms`);
  } finally {
    await blackhole.close();
  }

  const releaseFaultStore = makeStore();
  const releaseFaultLease = await releaseFaultStore.acquire({ ...concurrencyInput, studentId: `${namespace}-release-fault`, ttlMs: 250 });
  assert(releaseFaultLease);
  await releaseFaultStore.close();
  await assert.rejects(() => releaseFaultStore.release(releaseFaultLease), (error: unknown) => error instanceof VeraRedisUnavailableError);
  await delay(300);
  console.log("PASS vera-redis-sprint2: unavailable, command-timeout, and release-fault paths fail closed without queues");

  const raceStudent = `${namespace}-multiprocess`;
  const workers = Array.from({ length: 6 }, (_, index) => raceWorker(raceStudent, `worker-${index + 1}`));
  await Promise.all(workers.map((worker) => worker.ready));
  for (const worker of workers) worker.child.stdin?.write("GO\n");
  const raceResults = await Promise.all(workers.map((worker) => worker.finished));
  const raceWinners = raceResults.filter((result) => result.acquired);
  const raceLosers = raceResults.filter((result) => !result.acquired);
  assert.equal(raceWinners.length, 2, "multi-process race exceeded the concurrency cap");
  assert.equal(raceLosers.length, 4);
  assert(raceLosers.every((result) => result.rejectionReason === "concurrency"));
  const raceFences = raceWinners.map((result) => result.fencingToken);
  assert.equal(new Set(raceFences).size, 2, "multi-process winners shared a fencing token");
  console.log("PASS vera-redis-sprint2: six-process race admits two fenced owners and rejects four as concurrency");
} finally {
  await Promise.all(stores.map((store) => store.close().catch(() => undefined)));
  await deleteFixtureKeys().catch(() => undefined);
  await admin.quit().catch(() => admin.disconnect());
}

console.log("PASS vera-redis-sprint2: real Redis acceptance suite (6 cases)");
