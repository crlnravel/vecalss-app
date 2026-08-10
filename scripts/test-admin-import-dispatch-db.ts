import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import IORedis from "ioredis";
import pg from "pg";

import type { ImportQueue } from "@/lib/admin/imports/dispatch";
import { buildImportJobId } from "@/lib/admin/imports/job-id";
import { validateDisposableSmokeUrls } from "@/lib/admin/imports/runtime";

const { Client } = pg;
const TEST_DATABASE_ENV = "ADMIN_IMPORT_DISPATCH_TEST_DATABASE_URL";
const TEST_REDIS_ENV = "ADMIN_IMPORT_DISPATCH_TEST_REDIS_URL";

function assertLocalDatabase(raw: string) {
  const parsed = new URL(raw);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !["localhost", "127.0.0.1", "::1"].includes(hostname)
    || !/(?:test|integration|dispatch|import)/iu.test(databaseName)
    || process.env.NODE_ENV === "production"
  ) {
    throw new Error(`${TEST_DATABASE_ENV} must point to a non-production local test database.`);
  }
  if (process.env.DATABASE_URL?.trim() === raw) {
    throw new Error(`${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
  }
}

async function main() {
  const databaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  const redisUrl = process.env[TEST_REDIS_ENV]?.trim();
  if (!databaseUrl || !redisUrl) {
    console.log(`admin import dispatch DB/Redis integration skipped: ${TEST_DATABASE_ENV} and ${TEST_REDIS_ENV} are required; runtime URLs are never used.`);
    return;
  }
  assertLocalDatabase(databaseUrl);
  const disposable = validateDisposableSmokeUrls({ databaseUrl, redisUrl });

  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = disposable.databaseUrl;
  const client = new Client({ connectionString: disposable.databaseUrl });
  const redis = new IORedis(disposable.redisUrl);
  const adminId = randomUUID();
  const importId = randomUUID();
  const validRowId = randomUUID();
  const invalidRowId = randomUUID();
  const dispatchId = randomUUID();
  const fairImportIds = Array.from({ length: 105 }, () => randomUUID());
  const fairDispatchIds = fairImportIds.map(() => randomUUID());
  let reconcileMode: "missing" | "fair" = "missing";
  let fairPageOneJobIds = new Set<string>();
  let blockNextFairGet = false;
  let fairGetStartedResolve: (() => void) | null = null;
  let fairGetReleaseResolve: (() => void) | null = null;
  const added: Array<{ data: unknown; jobId: string; name: string }> = [];
  const fakeQueue = {
    async add(name: string, data: unknown, options: { jobId?: string }) {
      added.push({ data, jobId: options.jobId ?? "", name });
      return { id: options.jobId };
    },
    async getJob(jobId?: string) {
      if (reconcileMode === "fair") {
        if (blockNextFairGet) {
          blockNextFairGet = false;
          fairGetStartedResolve?.();
          await new Promise<void>((resolve) => {
            fairGetReleaseResolve = resolve;
          });
        }
        return fairPageOneJobIds.has(jobId ?? "") ? { id: jobId } : null;
      }
      return null;
    },
  } as unknown as ImportQueue;

  try {
    await client.connect();
    await client.query("SELECT 1");
    await redis.ping();
    const tableCheck = await client.query<{ missing: string[] }>(
      `SELECT ARRAY_REMOVE(ARRAY[
        CASE WHEN to_regclass('public.users') IS NULL THEN 'users' END,
        CASE WHEN to_regclass('public.enrollment_imports') IS NULL THEN 'enrollment_imports' END,
        CASE WHEN to_regclass('public.enrollment_import_rows') IS NULL THEN 'enrollment_import_rows' END,
        CASE WHEN to_regclass('public.enrollment_import_dispatches') IS NULL THEN 'enrollment_import_dispatches' END,
        CASE WHEN to_regclass('public.audit_logs') IS NULL THEN 'audit_logs' END
      ], NULL) AS missing`,
    );
    assert.deepEqual(tableCheck.rows[0]?.missing ?? [], [], "The isolated database is missing the foundation migration; this harness never runs migrations.");

    await client.query(
      `INSERT INTO users (id, email, full_name, password_hash, status)
       VALUES ($1::uuid, $2, 'Dispatch Test Admin', 'fixture-hash', 'active')`,
      [adminId, `dispatch-test-${adminId}@example.test`],
    );
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count, created_by_user_id)
       VALUES ($1::uuid, 'student', 'draft', 'dispatch.csv', 'fixture-hash', 'students.v1', 2, $2::uuid)`,
      [importId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json)
       VALUES
        ($1::uuid, $3::uuid, 1, 'valid@example.test', 'create', 'pending', '{"email":"valid@example.test","full_name":"Valid"}'::jsonb),
        ($2::uuid, $3::uuid, 2, 'invalid@example.test', 'none', 'invalid', '{"email":"invalid@example.test","full_name":"Invalid"}'::jsonb)`,
      [validRowId, invalidRowId, importId],
    );

    const {
      EnrollmentImportConfirmationError,
      confirmEnrollmentImport,
    } = await import("@/lib/admin/imports/service");
    const dispatch = await import("@/lib/admin/imports/dispatch");

    await assert.rejects(
      confirmEnrollmentImport({
        actorUserId: adminId,
        handoffMethod: "invite_link",
        importId,
      }),
      (error: unknown) => error instanceof EnrollmentImportConfirmationError && error.code === "invalid_rows_pending_skip",
    );

    await client.query(
      "UPDATE enrollment_import_rows SET status = 'skipped' WHERE id = $1::uuid",
      [invalidRowId],
    );
    const firstConfirmation = await confirmEnrollmentImport({
      actorUserId: adminId,
      handoffMethod: "invite_link",
      importId,
    });
    assert.equal(firstConfirmation.idempotent, false);
    assert.equal(firstConfirmation.generation, 1);
    assert.equal(firstConfirmation.queueJobId, buildImportJobId(importId, 1));
    await client.query(
      "UPDATE enrollment_import_dispatches SET queue_job_id = $1 WHERE import_id = $2::uuid AND generation = 1",
      [`${importId}:1`, importId],
    );
    const duplicateConfirmation = await confirmEnrollmentImport({
      actorUserId: adminId,
      handoffMethod: "temporary_password",
      importId,
    });
    assert.equal(duplicateConfirmation.idempotent, true);
    assert.equal(duplicateConfirmation.handoffMethod, "invite_link");
    assert.equal(duplicateConfirmation.queueJobId, buildImportJobId(importId, 1));
    const repairedDispatch = await client.query<{ queue_job_id: string }>(
      "SELECT queue_job_id FROM enrollment_import_dispatches WHERE import_id = $1::uuid AND generation = 1",
      [importId],
    );
    assert.equal(repairedDispatch.rows[0]?.queue_job_id, buildImportJobId(importId, 1));

    const outbox = await client.query<{ count: number; status: string }>(
      "SELECT count(*)::int AS count, min(status)::text AS status FROM enrollment_import_dispatches WHERE import_id = $1::uuid",
      [importId],
    );
    assert.equal(outbox.rows[0]?.count, 1);
    assert.equal(outbox.rows[0]?.status, "pending");

    const claimed = await dispatch.claimImportDispatches({ limit: 1, workerId: "dispatch-test-worker" });
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0]?.claimToken.length, 36);
    assert.equal(claimed[0]?.claimedBy, "dispatch-test-worker");
    await dispatch.markImportDispatchFailed({
      claimToken: claimed[0]?.claimToken ?? "",
      dispatchId: claimed[0]?.id ?? dispatchId,
    });
    const failed = await client.query<{ status: string; next_attempt_at: Date | null; attempt_count: number }>(
      "SELECT status, next_attempt_at, attempt_count FROM enrollment_import_dispatches WHERE import_id = $1::uuid",
      [importId],
    );
    assert.equal(failed.rows[0]?.status, "failed");
    assert.equal(failed.rows[0]?.attempt_count, 1);
    assert.ok(failed.rows[0]?.next_attempt_at);

    await client.query(
      "UPDATE enrollment_import_dispatches SET next_attempt_at = now() WHERE import_id = $1::uuid",
      [importId],
    );
    const dispatched = await dispatch.dispatchPendingImportJobs({
      limit: 1,
      queue: fakeQueue,
      workerId: "dispatch-test-worker",
    });
    assert.equal(dispatched.enqueued, 1);
    assert.deepEqual(added[0]?.data, { generation: 1, importId });
    assert.equal(added[0]?.jobId, buildImportJobId(importId, 1));
    const enqueued = await client.query<{ status: string }>(
      "SELECT status FROM enrollment_import_dispatches WHERE import_id = $1::uuid",
      [importId],
    );
    assert.equal(enqueued.rows[0]?.status, "enqueued");

    const reconciled = await dispatch.reconcileImportDispatches(fakeQueue);
    assert.equal(reconciled.missingJobs, 1);
    const reset = await client.query<{ status: string }>(
      "SELECT status FROM enrollment_import_dispatches WHERE import_id = $1::uuid",
      [importId],
    );
    assert.equal(reset.rows[0]?.status, "pending");

    // Exercise the rotating reconciliation cursor: the final missing job is
    // deliberately beyond the first bounded page.
    const fairCreatedAt = new Date(Date.now() + 1_000);
    const fairImportParams: unknown[] = [];
    const fairImportValues = fairImportIds.map((fairId, index) => {
      const offset = index * 5;
      fairImportParams.push(
        fairId,
        new Date(fairCreatedAt.getTime() + index),
        `dispatch-fair-${index}.csv`,
        `dispatch-fair-hash-${index}`,
        adminId,
      );
      return `($${offset + 1}::uuid, 'student', 'queued', $${offset + 2}::timestamptz, $${offset + 3}, $${offset + 4}, 'students.v1', 1, $${offset + 5}::uuid, 1)`;
    });
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, created_at, source_filename, content_hash, template_version, row_count, created_by_user_id, dispatch_generation)
       VALUES ${fairImportValues.join(",")}`,
      fairImportParams,
    );
    const fairDispatchParams: unknown[] = [];
    const fairDispatchValues = fairImportIds.map((fairId, index) => {
      const offset = index * 4;
      const createdAt = new Date(fairCreatedAt.getTime() + index);
      fairDispatchParams.push(
        fairDispatchIds[index],
        fairId,
        buildImportJobId(fairId, 1),
        createdAt,
      );
      return `($${offset + 1}::uuid, $${offset + 2}::uuid, 1, 'enqueued', $${offset + 3}, $${offset + 4}::timestamptz, $${offset + 4}::timestamptz)`;
    });
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id, created_at, enqueued_at)
       VALUES ${fairDispatchValues.join(",")}`,
      fairDispatchParams,
    );
    reconcileMode = "fair";
    fairPageOneJobIds = new Set(
      fairImportIds
        .slice(0, dispatch.DISPATCH_RECONCILE_PAGE_SIZE)
        .map((fairId) => buildImportJobId(fairId, 1)),
    );
    blockNextFairGet = true;
    const fairGetStarted = new Promise<void>((resolve) => {
      fairGetStartedResolve = resolve;
    });
    const firstFairReconciliation = dispatch.reconcileImportDispatches(fakeQueue);
    await fairGetStarted;
    let concurrentPassCompleted = false;
    const concurrentFairReconciliation = dispatch.reconcileImportDispatches(fakeQueue).then((result) => {
      concurrentPassCompleted = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(concurrentPassCompleted, false, "concurrent reconciliation must share the in-flight pass");
    const releaseFairGet = fairGetReleaseResolve as unknown as (() => void);
    releaseFairGet();
    const [firstFairResult, concurrentFairResult] = await Promise.all([
      firstFairReconciliation,
      concurrentFairReconciliation,
    ]);
    assert.equal(firstFairResult.missingJobs, 0);
    assert.deepEqual(concurrentFairResult, firstFairResult);
    const secondFairReconciliation = await dispatch.reconcileImportDispatches(fakeQueue);
    assert.equal(
      secondFairReconciliation.missingJobs,
      fairImportIds.length - dispatch.DISPATCH_RECONCILE_PAGE_SIZE,
    );
    const fairTail = await client.query<{ status: string }>(
      "SELECT status FROM enrollment_import_dispatches WHERE id = $1::uuid",
      [fairDispatchIds[fairDispatchIds.length - 1]],
    );
    assert.equal(fairTail.rows[0]?.status, "pending");

    await client.query(
      "UPDATE enrollment_imports SET dispatch_generation = 2 WHERE id = $1::uuid",
      [importId],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 2, 'pending', $3)`,
      [dispatchId, importId, buildImportJobId(importId, 2)],
    );
    const stale = await dispatch.processImportJobPayload({ importId, generation: 1 });
    assert.equal(stale.stale, true);
    const current = await dispatch.processImportJobPayload({ importId, generation: 2 });
    assert.equal(current.stale, false);
    console.log("admin import dispatch DB/Redis checks passed");
  } finally {
    await client.query("DELETE FROM audit_logs WHERE target_id = $1::uuid", [importId]).catch(() => undefined);
    await client.query("DELETE FROM enrollment_imports WHERE id = ANY($1::uuid[])", [fairImportIds]).catch(() => undefined);
    await client.query("DELETE FROM enrollment_imports WHERE id = $1::uuid", [importId]).catch(() => undefined);
    await client.query("DELETE FROM users WHERE id = $1::uuid", [adminId]).catch(() => undefined);
    await client.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect().catch(() => undefined);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "admin_import_dispatch_db_failed");
  process.exitCode = 1;
});
