import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import pg from "pg";

import { validateDisposableSmokeUrls } from "@/lib/admin/imports/runtime";
import { buildImportJobId } from "@/lib/admin/imports/job-id";

const { Client } = pg;

async function main() {
  if (process.env.ADMIN_IMPORT_SMOKE !== "1") {
    console.log("admin import worker smoke skipped: set ADMIN_IMPORT_SMOKE=1 with dedicated local URLs; runtime URLs are never used.");
    return;
  }

  const urls = validateDisposableSmokeUrls({
    databaseUrl: process.env.ADMIN_IMPORT_SMOKE_DATABASE_URL,
    redisUrl: process.env.ADMIN_IMPORT_SMOKE_REDIS_URL,
  });
  const database = new Client({ connectionString: urls.databaseUrl });
  const queueRedis = new IORedis(urls.redisUrl, { maxRetriesPerRequest: null });
  const workerRedis = new IORedis(urls.redisUrl, { maxRetriesPerRequest: null });
  const queueName = `admin-enrollment-imports-smoke-${randomUUID()}`;
  const queue = new Queue(queueName, {
    connection: queueRedis,
    defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: true },
  });
  const importId = randomUUID();
  const generation = 1;
  const payload = { importId, generation };
  const jobId = buildImportJobId(importId, generation);
  assert.deepEqual(jobId.split(":"), [importId, "dispatch", String(generation)]);
  const worker = new Worker(queueName, async (job) => {
    assert.deepEqual(Object.keys(job.data).sort(), ["generation", "importId"]);
    assert.deepEqual(job.data, payload);
    assert.equal(job.id, jobId);
    return { accepted: true };
  }, { connection: workerRedis });
  const seen = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("admin_import_smoke_job_timeout")), 10_000);
    worker.on("completed", () => {
      clearTimeout(timer);
      resolve();
    });
    worker.on("failed", () => {
      clearTimeout(timer);
      reject(new Error("admin_import_smoke_job_failed"));
    });
  });

  try {
    await database.connect();
    await database.query("SELECT 1");
    await queueRedis.ping();
    const job = await queue.add("admin-enrollment-import", payload, { jobId });
    assert.equal(job.id, jobId);
    await seen;
    console.log(JSON.stringify({ event: "admin_import_worker_smoke_passed", jobId, queue: queueName }));
  } finally {
    await worker.close().catch(() => undefined);
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close().catch(() => undefined);
    await Promise.allSettled([queueRedis.quit(), workerRedis.quit()]);
    await database.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ code: error instanceof Error ? error.message : "admin_import_smoke_failed", event: "admin_import_worker_smoke_failed" }));
  process.exitCode = 1;
});
