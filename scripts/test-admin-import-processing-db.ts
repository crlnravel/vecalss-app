import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import IORedis from "ioredis";
import { Worker, type Queue } from "bullmq";
import pg from "pg";

import { validateDisposableSmokeUrls } from "@/lib/admin/imports/runtime";

const { Client } = pg;
const TEST_DATABASE_ENV = "ADMIN_IMPORT_PROCESSING_TEST_DATABASE_URL";
const TEST_REDIS_ENV = "ADMIN_IMPORT_PROCESSING_TEST_REDIS_URL";

function assertLocalTestDatabase(raw: string) {
  const parsed = new URL(raw);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !["localhost", "127.0.0.1", "::1"].includes(hostname)
    || !/(?:test|integration|processing|import)/iu.test(databaseName)
    || process.env.NODE_ENV === "production"
  ) {
    throw new Error(`${TEST_DATABASE_ENV} must be a dedicated local test database.`);
  }
  if (process.env.DATABASE_URL?.trim() === raw) {
    throw new Error(`${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
  }
}

async function main() {
  const databaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  const redisUrl = process.env[TEST_REDIS_ENV]?.trim();
  if (!databaseUrl || !redisUrl) {
    console.log(`admin import processing DB/Redis integration skipped: ${TEST_DATABASE_ENV} and ${TEST_REDIS_ENV} are required; runtime URLs are never used.`);
    return;
  }
  assertLocalTestDatabase(databaseUrl);
  const disposable = validateDisposableSmokeUrls({ databaseUrl, redisUrl });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = disposable.databaseUrl;
  process.env.APP_BASE_URL = "https://app.example.test";
  process.env.ENROLLMENT_HANDOFF_ACTIVE_KEY_ID = "processing-test-v1";
  process.env.ENROLLMENT_HANDOFF_KEY_RING = JSON.stringify({
    "processing-test-v1": Buffer.alloc(32, 11).toString("base64"),
  });

  const client = new Client({ connectionString: disposable.databaseUrl });
  const redis = new IORedis(disposable.redisUrl);
  redis.on("error", () => undefined);
  const adminId = randomUUID();
  const otherAdminId = randomUUID();
  const importId = randomUUID();
  const rowId = randomUUID();
  const dispatchId = randomUUID();
  const retryImportId = randomUUID();
  const retryRowId = randomUUID();
  const retryDispatchId = randomUUID();
  const reapImportId = randomUUID();
  const reapRowId = randomUUID();
  const reapDispatchId = randomUUID();
  const boundaryCreateImportId = randomUUID();
  const boundaryCreateRowId = randomUUID();
  const boundaryCreateDispatchId = randomUUID();
  const boundaryUpdateImportId = randomUUID();
  const boundaryUpdateRowId = randomUUID();
  const boundaryUpdateDispatchId = randomUUID();
  const boundaryUpdateUserId = randomUUID();
  const cancelImportId = randomUUID();
  const cancelRowId = randomUUID();
  const cancelDispatchId = randomUUID();
  const partialImportId = randomUUID();
  const partialSuccessRowId = randomUUID();
  const partialFailedRowId = randomUUID();
  const partialDispatchId = randomUUID();
  const failedTerminalImportId = randomUUID();
  const failedTerminalRowId = randomUUID();
  const failedTerminalDispatchId = randomUUID();
  const raceImportId = randomUUID();
  const raceRowId = randomUUID();
  const raceDispatchId = randomUUID();
  const createdUserIds: string[] = [];
  let processingQueue: Queue | null = null;

  try {
    await client.connect();
    await client.query("SELECT 1");
    await redis.ping();
    const tableCheck = await client.query<{ missing: string[] }>(
      `SELECT ARRAY_REMOVE(ARRAY[
        CASE WHEN to_regclass('public.users') IS NULL THEN 'users' END,
        CASE WHEN to_regclass('public.role_assignments') IS NULL THEN 'role_assignments' END,
        CASE WHEN to_regclass('public.student_profiles') IS NULL THEN 'student_profiles' END,
        CASE WHEN to_regclass('public.enrollment_handoffs') IS NULL THEN 'enrollment_handoffs' END,
        CASE WHEN to_regclass('public.enrollment_imports') IS NULL THEN 'enrollment_imports' END,
        CASE WHEN to_regclass('public.enrollment_import_rows') IS NULL THEN 'enrollment_import_rows' END,
        CASE WHEN to_regclass('public.enrollment_import_dispatches') IS NULL THEN 'enrollment_import_dispatches' END,
        CASE WHEN to_regclass('public.audit_logs') IS NULL THEN 'audit_logs' END
      ], NULL) AS missing`,
    );
    assert.deepEqual(tableCheck.rows[0]?.missing ?? [], [], "The isolated database is missing the foundation migration; this harness never runs migrations.");

    await client.query(
      `INSERT INTO users (id, email, full_name, password_hash, status)
       VALUES
         ($1::uuid, $2, 'Processing Test Admin', 'fixture-hash', 'active'),
         ($3::uuid, $4, 'Other Processing Admin', 'fixture-hash', 'active')`,
      [adminId, `processing-admin-${adminId}@example.test`, otherAdminId, `processing-other-${otherAdminId}@example.test`],
    );
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation,
         confirmed_at)
       VALUES ($1::uuid, 'student', 'queued', 'formula.csv', 'processing-hash', 'students.v1', 1,
         'invite_link', $2::uuid, $2::uuid, 1, now())`,
      [importId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'pending', $4::jsonb)`,
      [rowId, importId, `formula-${rowId}@example.test`, JSON.stringify({
        email: `formula-${rowId}@example.test`,
        full_name: "=SUM(A1:A2)",
      })],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [dispatchId, importId, `${importId}:dispatch:1`],
    );

    const processing = await import("@/lib/admin/imports/processing");
    const dispatch = await import("@/lib/admin/imports/dispatch");
    const handoffFile = await import("@/lib/admin/imports/handoff-file");
    const handoffs = await import("@/lib/admin/handoffs/service");
    const importService = await import("@/lib/admin/imports/service");
    const { STUDENT_DISPLAY_NAME_MAX } = await import("@/lib/admin/imports/contracts");
    const { buildPostReadyQueueConnection } = await import("@/workers/admin-import-worker");

    // Two deliveries for the same generation race on one pending row. The
    // advisory email lock and row claim leave one account/profile/handoff.
    await Promise.all([
      dispatch.processImportJobPayload({ importId, generation: 1 }, { workerId: "processing-a" }),
      dispatch.processImportJobPayload({ importId, generation: 1 }, { workerId: "processing-b" }),
    ]);
    const created = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [`formula-${rowId}@example.test`],
    );
    assert.equal(created.rows.length, 1);
    createdUserIds.push(created.rows[0]!.id);
    const accountObjects = await client.query<{ roles: string; profiles: string; handoffs: string }>(
      `SELECT
        (SELECT count(*)::text FROM role_assignments WHERE user_id = $1::uuid AND revoked_at IS NULL) AS roles,
        (SELECT count(*)::text FROM student_profiles WHERE user_id = $1::uuid) AS profiles,
        (SELECT count(*)::text FROM enrollment_handoffs WHERE user_id = $1::uuid) AS handoffs`,
      [created.rows[0]!.id],
    );
    assert.deepEqual(accountObjects.rows[0], { roles: "1", profiles: "1", handoffs: "1" });
    const processedRow = await client.query<{ status: string; handoff_id: string }>(
      "SELECT status, handoff_id FROM enrollment_import_rows WHERE id = $1::uuid",
      [rowId],
    );
    assert.equal(processedRow.rows[0]?.status, "created");
    assert.ok(processedRow.rows[0]?.handoff_id);
    const processedImport = await client.query<{ status: string }>(
      "SELECT status FROM enrollment_imports WHERE id = $1::uuid",
      [importId],
    );
    assert.equal(processedImport.rows[0]?.status, "completed");

    const handoffId = processedRow.rows[0]!.handoff_id;
    await assert.rejects(
      handoffFile.releaseImportHandoffFile({
        actorUserId: otherAdminId,
        handoffIds: [handoffId],
        importId,
      }),
      (error: unknown) => error instanceof handoffFile.EnrollmentImportHandoffFileError && error.code === "import_not_found",
    );
    const concurrentRelease = await Promise.allSettled([
      handoffFile.releaseImportHandoffFile({ actorUserId: adminId, handoffIds: [handoffId], importId }),
      handoffFile.releaseImportHandoffFile({ actorUserId: adminId, handoffIds: [handoffId], importId }),
    ]);
    assert.equal(concurrentRelease.filter((result) => result.status === "fulfilled").length, 1);
    const released = concurrentRelease.find((result) => result.status === "fulfilled");
    assert.ok(released && released.status === "fulfilled");
    assert.match(released.value.content, /'=SUM\(A1:A2\)/u);
    assert.match(released.value.content, /invite_url/u);
    const releasedHandoff = await client.query<{ status: string; secret_envelope: unknown }>(
      "SELECT status, secret_envelope FROM enrollment_handoffs WHERE id = $1::uuid",
      [handoffId],
    );
    assert.equal(releasedHandoff.rows[0]?.status, "released");
    assert.equal(releasedHandoff.rows[0]?.secret_envelope, null);

    // An import-sourced handoff cannot be replaced from the generic reissue
    // path. Blocking before the revoke/update transaction preserves the only
    // deliverable until an authenticated handoff-file workflow is reachable.
    await assert.rejects(
      handoffs.reissueEnrollmentHandoff({ actorUserId: adminId, handoffId }),
      (error: unknown) => error instanceof handoffs.EnrollmentHandoffStateError && error.code === "handoff_import_recovery_required",
    );
    const preservedImportHandoff = await client.query<{ status: string; source_import_row_id: string | null }>(
      "SELECT status, source_import_row_id FROM enrollment_handoffs WHERE id = $1::uuid",
      [handoffId],
    );
    assert.deepEqual(preservedImportHandoff.rows[0], { status: "released", source_import_row_id: rowId });
    const preservedImportRow = await client.query<{ handoff_id: string }>(
      "SELECT handoff_id FROM enrollment_import_rows WHERE id = $1::uuid",
      [rowId],
    );
    assert.equal(preservedImportRow.rows[0]?.handoff_id, handoffId);

    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation, completed_at)
       VALUES ($1::uuid, 'student', 'failed', 'retry.csv', 'retry-hash', 'students.v1', 1,
         'temporary_password', $2::uuid, $2::uuid, 1, now())`,
      [retryImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json,
         error_code, error_message, processed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'failed', $4::jsonb,
         'job_exhausted', 'The import worker exhausted its retry attempts.', now())`,
      [retryRowId, retryImportId, `retry-${retryRowId}@example.test`, JSON.stringify({
        email: `retry-${retryRowId}@example.test`,
        full_name: "Retry User",
      })],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [retryDispatchId, retryImportId, `${retryImportId}:dispatch:1`],
    );
    const retry = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      importId: retryImportId,
      idempotencyKey: "retry-lost-response",
    });
    assert.equal(retry.generation, 2);
    assert.equal(retry.idempotent, false);
    assert.equal(retry.retriedCount, 1);
    assert.equal(retry.status, "queued");
    const repeatedRetry = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      importId: retryImportId,
      idempotencyKey: "retry-lost-response",
    });
    assert.equal(repeatedRetry.generation, 2);
    assert.equal(repeatedRetry.idempotent, true);
    assert.equal(repeatedRetry.queueJobId, retry.queueJobId);
    const retryDispatchRows = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM enrollment_import_dispatches WHERE import_id = $1::uuid AND generation = 2",
      [retryImportId],
    );
    assert.equal(retryDispatchRows.rows[0]?.count, "1");
    await assert.rejects(
      processing.retryEnrollmentImport({
        actorUserId: adminId,
        expectedGeneration: 2,
        idempotencyKey: "retry-lost-response",
        importId: retryImportId,
        rowNumbers: [1],
      }),
      (error: unknown) => error instanceof processing.ImportRetryError && error.code === "retry_conflict",
    );
    const staleRetry = await dispatch.processImportJobPayload({ importId: retryImportId, generation: 1 });
    assert.equal(staleRetry.stale, true);
    await dispatch.processImportJobPayload({ importId: retryImportId, generation: 2 }, { workerId: "retry-worker" });
    const retryFinal = await client.query<{ status: string }>(
      "SELECT status FROM enrollment_imports WHERE id = $1::uuid",
      [retryImportId],
    );
    assert.equal(retryFinal.rows[0]?.status, "completed");
    for (let index = 0; index < 25; index += 1) {
      await client.query(
        `INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
         VALUES ($1::uuid, $2::uuid, 'enrollment_import.retry_queued', 'enrollment_import', $3::uuid, $4::jsonb)`,
        [
          randomUUID(),
          adminId,
          retryImportId,
          JSON.stringify({
            generation: 100 + index,
            previousGeneration: 99 + index,
            requestKey: `dummy-retry-${index}`,
            retriedCount: 1,
          }),
        ],
      );
    }
    const terminalRetryReplay = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      idempotencyKey: "retry-lost-response",
      importId: retryImportId,
    });
    assert.equal(terminalRetryReplay.idempotent, true);
    assert.equal(terminalRetryReplay.generation, 2);
    assert.equal(terminalRetryReplay.status, "completed");
    assert.equal(terminalRetryReplay.queueJobId, retry.queueJobId);

    // Terminal replay remains idempotent for partial and failed outcomes too.
    const partialOversizedName = "P".repeat(STUDENT_DISPLAY_NAME_MAX + 1);
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation,
         completed_at)
       VALUES ($1::uuid, 'student', 'failed', 'partial-retry.csv', 'partial-retry-hash', 'students.v1', 2,
         'invite_link', $2::uuid, $2::uuid, 1, now())`,
      [partialImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json,
         error_code, error_message, processed_at)
       VALUES
         ($1::uuid, $2::uuid, 1, $3, 'create', 'failed', $4::jsonb, 'job_exhausted', 'retryable', now()),
         ($5::uuid, $2::uuid, 2, $6, 'create', 'failed', $7::jsonb, 'profile_field_too_long', 'too long', now())`,
      [
        partialSuccessRowId,
        partialImportId,
        `partial-success-${partialSuccessRowId}@example.test`,
        JSON.stringify({ email: `partial-success-${partialSuccessRowId}@example.test`, full_name: "Partial Success" }),
        partialFailedRowId,
        `partial-failed-${partialFailedRowId}@example.test`,
        JSON.stringify({ email: `partial-failed-${partialFailedRowId}@example.test`, full_name: partialOversizedName }),
      ],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [partialDispatchId, partialImportId, `${partialImportId}:dispatch:1`],
    );
    const partialRetry = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      idempotencyKey: "partial-terminal-replay",
      importId: partialImportId,
      rowNumbers: [1, 2],
    });
    assert.equal(partialRetry.generation, 2);
    await dispatch.processImportJobPayload({ importId: partialImportId, generation: 2 }, { workerId: "partial-retry-worker" });
    const partialReplay = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      idempotencyKey: "partial-terminal-replay",
      importId: partialImportId,
      rowNumbers: [1, 2],
    });
    assert.equal(partialReplay.idempotent, true);
    assert.equal(partialReplay.generation, 2);
    assert.equal(partialReplay.status, "partial");
    assert.equal(partialReplay.counts.created, 1);
    assert.equal(partialReplay.counts.failed, 1);
    createdUserIds.push((await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [`partial-success-${partialSuccessRowId}@example.test`],
    )).rows[0]!.id);

    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation,
         completed_at)
       VALUES ($1::uuid, 'student', 'failed', 'failed-retry.csv', 'failed-retry-hash', 'students.v1', 1,
         'invite_link', $2::uuid, $2::uuid, 1, now())`,
      [failedTerminalImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json,
         error_code, error_message, processed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'failed', $4::jsonb, 'job_exhausted', 'retryable', now())`,
      [
        failedTerminalRowId,
        failedTerminalImportId,
        `failed-terminal-${failedTerminalRowId}@example.test`,
        JSON.stringify({ email: `failed-terminal-${failedTerminalRowId}@example.test`, full_name: partialOversizedName }),
      ],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [failedTerminalDispatchId, failedTerminalImportId, `${failedTerminalImportId}:dispatch:1`],
    );
    const failedRetry = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      idempotencyKey: "failed-terminal-replay",
      importId: failedTerminalImportId,
    });
    await dispatch.processImportJobPayload({ importId: failedTerminalImportId, generation: failedRetry.generation }, { workerId: "failed-retry-worker" });
    const failedReplay = await processing.retryEnrollmentImport({
      actorUserId: adminId,
      expectedGeneration: 1,
      idempotencyKey: "failed-terminal-replay",
      importId: failedTerminalImportId,
    });
    assert.equal(failedReplay.idempotent, true);
    assert.equal(failedReplay.generation, failedRetry.generation);
    assert.equal(failedReplay.status, "failed");
    assert.equal(failedReplay.counts.failed, 1);

    // Cleanup and retry contend on the same old terminal import. Whichever
    // transaction wins, the other observes the locked post-commit state and
    // cannot delete a newly queued generation.
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation,
         completed_at)
       VALUES ($1::uuid, 'student', 'failed', 'race.csv', 'race-hash', 'students.v1', 1,
         'invite_link', $2::uuid, $2::uuid, 1, now() - interval '31 days')`,
      [raceImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json,
         error_code, error_message, processed_at)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'failed', $4::jsonb, 'job_exhausted', 'retryable', now() - interval '31 days')`,
      [raceRowId, raceImportId, `race-${raceRowId}@example.test`, JSON.stringify({ email: `race-${raceRowId}@example.test`, full_name: "Race Retry" })],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [raceDispatchId, raceImportId, `${raceImportId}:dispatch:1`],
    );
    const [raceCleanup, raceRetry] = await Promise.allSettled([
      processing.cleanupEnrollmentImports({ now: new Date(), importRetentionMs: 30 * 24 * 60 * 60 * 1_000 }),
      processing.retryEnrollmentImport({
        actorUserId: adminId,
        expectedGeneration: 1,
        idempotencyKey: "cleanup-retry-race",
        importId: raceImportId,
      }),
    ]);
    if (raceRetry.status === "fulfilled") {
      assert.equal(raceRetry.value.generation, 2);
      const survivedRace = await client.query<{ status: string; generation: number; dispatch_count: string }>(
        `SELECT i.status, i.dispatch_generation AS generation,
                (SELECT count(*)::text FROM enrollment_import_dispatches d WHERE d.import_id = i.id) AS dispatch_count
         FROM enrollment_imports i WHERE i.id = $1::uuid`,
        [raceImportId],
      );
      assert.deepEqual(survivedRace.rows[0], { status: "queued", generation: 2, dispatch_count: "2" });
    } else {
      assert.ok(raceRetry.reason instanceof processing.ImportRetryError);
      assert.equal(raceRetry.reason.code, "import_not_found");
      assert.equal((await client.query("SELECT count(*)::int AS count FROM enrollment_imports WHERE id = $1::uuid", [raceImportId])).rows[0]?.count, 0);
    }
    if (raceCleanup.status === "rejected") throw raceCleanup.reason;

    // The worker boundary validates the StudentProfile VARCHAR(120) limit
    // before account/profile mutation for both create and update rows.
    const oversizedName = "B".repeat(STUDENT_DISPLAY_NAME_MAX + 1);
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation,
         confirmed_at)
       VALUES ($1::uuid, 'student', 'queued', 'boundary-create.csv', 'boundary-create-hash', 'students.v1', 1,
         'invite_link', $2::uuid, $2::uuid, 1, now())`,
      [boundaryCreateImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'pending', $4::jsonb)`,
      [
        boundaryCreateRowId,
        boundaryCreateImportId,
        `boundary-create-${boundaryCreateRowId}@example.test`,
        JSON.stringify({
          email: `boundary-create-${boundaryCreateRowId}@example.test`,
          full_name: oversizedName,
        }),
      ],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [boundaryCreateDispatchId, boundaryCreateImportId, `${boundaryCreateImportId}:dispatch:1`],
    );

    await client.query(
      `INSERT INTO users (id, email, full_name, password_hash, status)
       VALUES ($1::uuid, $2, 'Boundary Original', 'fixture-hash', 'active')`,
      [boundaryUpdateUserId, `boundary-update-${boundaryUpdateUserId}@example.test`],
    );
    createdUserIds.push(boundaryUpdateUserId);
    await client.query(
      `INSERT INTO role_assignments (user_id, role, assigned_by_user_id)
       VALUES ($1::uuid, 'student', $2::uuid)`,
      [boundaryUpdateUserId, adminId],
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, display_name)
       VALUES ($1::uuid, 'Boundary Original')`,
      [boundaryUpdateUserId],
    );
    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         handoff_method, created_by_user_id, confirmed_by_user_id, dispatch_generation,
         confirmed_at)
       VALUES ($1::uuid, 'student', 'queued', 'boundary-update.csv', 'boundary-update-hash', 'students.v1', 1,
         'invite_link', $2::uuid, $2::uuid, 1, now())`,
      [boundaryUpdateImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json,
         matched_user_id)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'update', 'pending', $4::jsonb, $5::uuid)`,
      [
        boundaryUpdateRowId,
        boundaryUpdateImportId,
        `boundary-update-${boundaryUpdateUserId}@example.test`,
        JSON.stringify({
          email: `boundary-update-${boundaryUpdateUserId}@example.test`,
          full_name: oversizedName,
        }),
        boundaryUpdateUserId,
      ],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [boundaryUpdateDispatchId, boundaryUpdateImportId, `${boundaryUpdateImportId}:dispatch:1`],
    );
    await dispatch.processImportJobPayload({ importId: boundaryCreateImportId, generation: 1 });
    await dispatch.processImportJobPayload({ importId: boundaryUpdateImportId, generation: 1 });
    const boundaryRows = await client.query<{ import_id: string; status: string; error_code: string | null }>(
      `SELECT import_id, status, error_code
       FROM enrollment_import_rows
       WHERE id = ANY($1::uuid[])
       ORDER BY import_id`,
      [[boundaryCreateRowId, boundaryUpdateRowId]],
    );
    assert.equal(boundaryRows.rows.length, 2);
    assert.deepEqual(boundaryRows.rows.map((row) => row.status), ["failed", "failed"]);
    assert.deepEqual(boundaryRows.rows.map((row) => row.error_code), ["profile_field_too_long", "profile_field_too_long"]);
    const boundaryAccount = await client.query<{ full_name: string; display_name: string | null }>(
      `SELECT u.full_name, p.display_name
       FROM users u
       INNER JOIN student_profiles p ON p.user_id = u.id
       WHERE u.id = $1::uuid`,
      [boundaryUpdateUserId],
    );
    assert.deepEqual(boundaryAccount.rows[0], { full_name: "Boundary Original", display_name: "Boundary Original" });

    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         created_by_user_id, confirmed_by_user_id, dispatch_generation)
       VALUES ($1::uuid, 'student', 'processing', 'reap.csv', 'reap-hash', 'students.v1', 1,
         $2::uuid, $2::uuid, 1)`,
      [reapImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json,
         claim_token, claim_expires_at, claimed_by)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'processing', $4::jsonb,
         $5::uuid, now() - interval '1 minute', 'stale-worker')`,
      [reapRowId, reapImportId, `reap-${reapRowId}@example.test`, JSON.stringify({ email: `reap-${reapRowId}@example.test`, full_name: "Reap" }), randomUUID()],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'enqueued', $3)`,
      [reapDispatchId, reapImportId, `${reapImportId}:dispatch:1`],
    );

    // Leave a completed Redis job behind when the row lease is reaped. The
    // current-generation dispatch must be reset and replace that terminal
    // job before it can be kicked again.
    processingQueue = dispatch.createImportQueue(buildPostReadyQueueConnection(disposable.redisUrl));
    await processingQueue.waitUntilReady();
    const completedWorker = new Worker(
      dispatch.IMPORT_QUEUE_NAME,
      async () => "completed-fixture",
      { connection: buildPostReadyQueueConnection(disposable.redisUrl) },
    );
    completedWorker.on("error", () => undefined);
    await completedWorker.waitUntilReady();
    const completedJobPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("completed_fixture_timeout")), 10_000);
      completedWorker.once("completed", (job) => {
        if (job.id !== `${reapImportId}:dispatch:1`) return;
        clearTimeout(timer);
        resolve();
      });
      completedWorker.once("failed", (job, error) => {
        if (job?.id !== `${reapImportId}:dispatch:1`) return;
        clearTimeout(timer);
        reject(error);
      });
    });
    await processingQueue.add(
      dispatch.IMPORT_JOB_NAME,
      dispatch.buildImportJobPayload(reapImportId, 1),
      { jobId: `${reapImportId}:dispatch:1` },
    );
    await completedJobPromise;
    const completedRedisJob = await processingQueue.getJob(`${reapImportId}:dispatch:1`);
    assert.ok(completedRedisJob);
    assert.equal(await (completedRedisJob as { getState: () => Promise<string> }).getState(), "completed");
    await completedWorker.close();

    const reaped = await processing.reapExpiredImportRowClaims({ importId: reapImportId, generation: 1 });
    assert.equal(reaped.reset, 1);
    assert.equal(reaped.requeuedDispatches, 1);
    const reapedRow = await client.query<{ status: string; claim_token: string | null }>(
      "SELECT status, claim_token FROM enrollment_import_rows WHERE id = $1::uuid",
      [reapRowId],
    );
    assert.deepEqual(reapedRow.rows[0], { status: "pending", claim_token: null });
    const reapedDispatch = await client.query<{ status: string }>(
      "SELECT status FROM enrollment_import_dispatches WHERE id = $1::uuid",
      [reapDispatchId],
    );
    assert.equal(reapedDispatch.rows[0]?.status, "pending");
    const redispatch = await dispatch.dispatchPendingImportJobs({
      queue: processingQueue,
      workerId: "reaper-redispatch-test",
    });
    assert.deepEqual(redispatch, { claimed: 1, enqueued: 1, failed: 0 });
    const replacementRedisJob = await processingQueue.getJob(`${reapImportId}:dispatch:1`);
    assert.ok(replacementRedisJob);
    assert.notEqual(await (replacementRedisJob as { getState: () => Promise<string> }).getState(), "completed");
    await (replacementRedisJob as { remove: () => Promise<void> }).remove();

    await client.query(
      `INSERT INTO enrollment_imports
        (id, role, status, source_filename, content_hash, template_version, row_count,
         created_by_user_id, confirmed_by_user_id, dispatch_generation)
       VALUES ($1::uuid, 'student', 'draft', 'cancel.csv', 'cancel-hash', 'students.v1', 1,
         $2::uuid, NULL, 0)`,
      [cancelImportId, adminId],
    );
    await client.query(
      `INSERT INTO enrollment_import_rows
        (id, import_id, row_number, normalized_email, operation, status, input_json)
       VALUES ($1::uuid, $2::uuid, 1, $3, 'create', 'pending', $4::jsonb)`,
      [cancelRowId, cancelImportId, `cancel-${cancelRowId}@example.test`, JSON.stringify({ email: `cancel-${cancelRowId}@example.test`, full_name: "Cancelled" })],
    );
    await client.query(
      `INSERT INTO enrollment_import_dispatches
        (id, import_id, generation, status, queue_job_id)
       VALUES ($1::uuid, $2::uuid, 1, 'pending', $3)`,
      [cancelDispatchId, cancelImportId, `${cancelImportId}:dispatch:1`],
    );
    const cancelled = await importService.cancelEnrollmentImport({ actorUserId: adminId, importId: cancelImportId });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.idempotent, false);
    const repeatedCancel = await importService.cancelEnrollmentImport({ actorUserId: adminId, importId: cancelImportId });
    assert.equal(repeatedCancel.status, "cancelled");
    assert.equal(repeatedCancel.idempotent, true);
    await assert.rejects(
      importService.cancelEnrollmentImport({ actorUserId: otherAdminId, importId: cancelImportId }),
      (error: unknown) => error instanceof importService.EnrollmentImportCancellationError && error.code === "import_not_found",
    );
    const cancelledRecord = await client.query<{ status: string; completed_at: Date | null }>(
      "SELECT status, completed_at FROM enrollment_imports WHERE id = $1::uuid",
      [cancelImportId],
    );
    assert.equal(cancelledRecord.rows[0]?.status, "cancelled");
    assert.ok(cancelledRecord.rows[0]?.completed_at);

    await client.query(
      "UPDATE enrollment_imports SET completed_at = now() - interval '31 days' WHERE id = ANY($1::uuid[])",
      [[retryImportId, cancelImportId]],
    );
    const cleanup = await processing.cleanupEnrollmentImports({
      now: new Date(),
      importRetentionMs: 30 * 24 * 60 * 60 * 1_000,
    });
    assert.ok(cleanup.purgedImports >= 2);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM enrollment_imports WHERE id = $1::uuid", [retryImportId])).rows[0]?.count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM enrollment_imports WHERE id = $1::uuid", [cancelImportId])).rows[0]?.count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM enrollment_import_rows WHERE id = $1::uuid", [cancelRowId])).rows[0]?.count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM enrollment_import_dispatches WHERE id = $1::uuid", [cancelDispatchId])).rows[0]?.count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM users WHERE id = $1::uuid", [created.rows[0]!.id])).rows[0]?.count, 1);
    console.log("admin import processing DB/Redis checks passed");
  } finally {
    await processingQueue?.close().catch(() => undefined);
    await client.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[]) OR target_id = ANY($2::uuid[])", [[adminId, otherAdminId], [importId, retryImportId, reapImportId, boundaryCreateImportId, boundaryUpdateImportId, cancelImportId, partialImportId, failedTerminalImportId, raceImportId]]).catch(() => undefined);
    await client.query("DELETE FROM enrollment_imports WHERE id = ANY($1::uuid[])", [[importId, retryImportId, reapImportId, boundaryCreateImportId, boundaryUpdateImportId, cancelImportId, partialImportId, failedTerminalImportId, raceImportId]]).catch(() => undefined);
    if (createdUserIds.length > 0) {
      await client.query("DELETE FROM enrollment_handoffs WHERE user_id = ANY($1::uuid[])", [createdUserIds]).catch(() => undefined);
      await client.query("DELETE FROM notification_preferences WHERE user_id = ANY($1::uuid[])", [createdUserIds]).catch(() => undefined);
      await client.query("DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])", [createdUserIds]).catch(() => undefined);
      await client.query("DELETE FROM tutor_profiles WHERE user_id = ANY($1::uuid[])", [createdUserIds]).catch(() => undefined);
      await client.query("DELETE FROM role_assignments WHERE user_id = ANY($1::uuid[])", [createdUserIds]).catch(() => undefined);
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]).catch(() => undefined);
    }
    await client.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[])", [[adminId, otherAdminId]]).catch(() => undefined);
    await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[adminId, otherAdminId]]).catch(() => undefined);
    await client.end().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect().catch(() => undefined);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "admin_import_processing_db_failed");
  process.exitCode = 1;
});
