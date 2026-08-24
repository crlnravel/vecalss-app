import { randomUUID } from "node:crypto";

import { IORedisVeraLeaseStore } from "../lib/vera-ai/redis-lease";

const redisUrl = process.env.VERA_DISPOSABLE_REDIS_URL;
const studentId = process.env.VERA_REDIS_RACE_STUDENT;
const workerId = process.env.VERA_REDIS_RACE_WORKER ?? randomUUID();

if (!redisUrl || !studentId) throw new Error("Redis race worker requires disposable Redis and student scope.");

await new Promise<void>((resolve) => {
  process.stdin.setEncoding("utf8");
  process.stdin.once("data", () => {
    process.stdin.pause();
    process.stdin.destroy();
    resolve();
  });
  process.stdout.write(`READY ${workerId}\n`);
});

const store = new IORedisVeraLeaseStore(redisUrl);
try {
  const outcome = await store.acquireWithReason({
    studentId,
    featureKey: "vera.chat",
    maxConcurrent: 2,
    burstLimit: 100,
    burstWindowMs: 60_000,
    ttlMs: 2_000,
  });
  process.stdout.write(`${JSON.stringify({
    acquired: Boolean(outcome.lease),
    fencingToken: outcome.lease?.fencingToken ?? null,
    rejectionReason: outcome.rejectionReason ?? null,
    workerId,
  })}\n`);
  if (outcome.lease) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await store.release(outcome.lease);
  }
} finally {
  await store.close();
}
