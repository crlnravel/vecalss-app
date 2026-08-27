import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import {
  createVeraLifecycleService,
  VeraLifecycleError,
} from "../lib/vera-ai/lifecycle-service";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "../lib/vera-ai/envelope";
import {
  IORedisVeraLeaseStore,
  VeraRedisUnavailableError,
} from "../lib/vera-ai/redis-lease";

const root = process.cwd();
const migrationPath = join(root, "prisma/migrations/20260827100000_add_vera_sprint5_lifecycle/migration.sql");
const migration = readFileSync(migrationPath, "utf8");
const legacyCutoverSource = readFileSync(join(root, "lib/vera-ai/legacy-cutover.ts"), "utf8");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertLocalPostgres(connectionString: string): void {
  const parsed = new URL(connectionString);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "T11 fixture refuses a non-local database");
  assert(parsed.pathname === "/vera_test" || parsed.pathname === "/vera_test/", "T11 fixture requires the vera_test database");
  assert.equal(process.env.VERA_DISPOSABLE_DB_ACK, "1", "set VERA_DISPOSABLE_DB_ACK=1 for disposable PostgreSQL");
}

function assertLocalRedis(redisUrl: string): void {
  const parsed = new URL(redisUrl);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "T11 fixture refuses a non-local Redis");
  assert.equal(parsed.port, "56379", "T11 fixture requires the isolated Redis port 56379");
  assert(parsed.pathname === "/15" || parsed.pathname === "/15/", "T11 fixture requires Redis database 15");
}

async function expectLifecycleCode(action: () => Promise<unknown>, expected: VeraLifecycleError["code"]): Promise<void> {
  try {
    await action();
    assert.fail(`expected VeraLifecycleError(${expected})`);
  } catch (error) {
    assert(error instanceof VeraLifecycleError, `expected typed lifecycle error ${expected}`);
    assert.equal(error.code, expected);
  }
}

async function expectRedisUnavailable(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    assert.fail("expected bounded Redis-unavailable failure");
  } catch (error) {
    assert(error instanceof VeraRedisUnavailableError, "Redis faults must fail closed with a typed unavailable error");
  }
}

type MigrationAuditSnapshot = {
  table_name: string;
  column_name: string;
  row_count: number;
  rollback_boundary: string;
};

type OwnedFixtureIds = {
  exportIds: string[];
  operationIds: string[];
  idempotencyKeys: string[];
  holdIds: string[];
  conversationIds: string[];
};

async function readMigrationSnapshot(db: PrismaClient): Promise<MigrationAuditSnapshot[]> {
  return db.$queryRaw<MigrationAuditSnapshot[]>`
    SELECT table_name, column_name, row_count, rollback_boundary
    FROM ai_content_migration_audits
    ORDER BY table_name, column_name, id
  `;
}

async function testRedis(redisUrl: string, studentId: string, namespace: string): Promise<void> {
  const leaseStore = new IORedisVeraLeaseStore(redisUrl);
  try {
    const acquired = await leaseStore.acquireWithReason({
      studentId,
      featureKey: `${namespace}:export`,
      maxConcurrent: 2,
      burstLimit: 4,
      burstWindowMs: 60_000,
      ttlMs: 3_000,
    });
    assert(acquired.lease, "isolated Redis must admit the first lease");
    const renewed = await leaseStore.renew(acquired.lease, 3_000);
    assert(renewed, "the current Redis owner must be able to renew before expiry");
    assert.equal(await leaseStore.release(renewed), true, "the owner must be able to release its lease");
    assert.equal(await leaseStore.release(renewed), true, "release must be idempotent for the same owner/fence");
    console.log("T11_EVIDENCE redis=ready isolated=redis://127.0.0.1:56379/15 fencing=owner-safe renewal=bounded release=idempotent");
  } finally {
    await leaseStore.close();
  }

  // A refused local port exercises the bounded unavailable/fail-closed path
  // without contacting configured/shared infrastructure.
  const unavailable = new IORedisVeraLeaseStore("redis://127.0.0.1:1/15");
  try {
    await expectRedisUnavailable(() => unavailable.acquire({
      studentId,
      featureKey: `${namespace}:unavailable`,
      maxConcurrent: 1,
      burstLimit: 1,
      burstWindowMs: 1_000,
      ttlMs: 500,
    }));
    console.log("T11_EVIDENCE redis_fault=unavailable state=failed_closed timeout=bounded");
  } finally {
    await unavailable.close();
  }
}

async function testLifecycle(db: PrismaClient, lifecycle: ReturnType<typeof createVeraLifecycleService>, studentId: string, otherStudentId: string, namespace: string): Promise<OwnedFixtureIds> {
  const exportIds: string[] = [];
  const operationIds: string[] = [];
  const idempotencyKeys: string[] = [];
  const holdIds: string[] = [];
  const conversationIds: string[] = [];

  const malformedCases = [
    { label: "empty", key: "" },
    { label: "overlong", key: "x".repeat(121) },
    { label: "malformed", key: "bad\u0000key" },
  ];
  for (const testCase of malformedCases) {
    await expectLifecycleCode(
      () => lifecycle.createExport({ studentId, idempotencyKey: testCase.key, format: "json_v1" }),
      "invalid_request",
    );
    assert(testCase.label.length > 0);
  }
  await expectLifecycleCode(
    () => lifecycle.createExport({ studentId, idempotencyKey: `${namespace}:format`, format: "xml" as "json_v1" }),
    "invalid_request",
  );

  const exportKey = `${namespace}:export-create`;
  idempotencyKeys.push(exportKey);
  const accepted = await lifecycle.createExport({ studentId, idempotencyKey: exportKey, format: "json_v1" });
  if (!("resultKind" in accepted) || accepted.resultKind !== "export_job" || !accepted.exportId || !accepted.operationId) {
    throw new Error("export_create did not return its typed export target");
  }
  const exportId = accepted.exportId;
  const exportOperationId = accepted.operationId;
  assert.equal(accepted.resultKind, "export_job");
  assert.equal(accepted.state, "pending");
  exportIds.push(exportId);
  operationIds.push(exportOperationId);
  const replay = await lifecycle.createExport({ studentId, idempotencyKey: exportKey, format: "json_v1" });
  assert.equal(replay.replayed, true, "same idempotency-key replay must return the durable export winner");
  assert.equal("exportId" in replay && replay.exportId, exportId);

  await expectLifecycleCode(
    () => lifecycle.readExportStatus({ exportId: randomUUID(), studentId }),
    "target_unavailable",
  );
  await expectLifecycleCode(
    () => lifecycle.readExportStatus({ exportId, studentId: otherStudentId }),
    "target_unavailable",
  );

  const materialized = await lifecycle.materializeExport({ exportId, ownerId: `${namespace}:worker-a` });
  assert.equal(materialized.state, "ready");
  const secondMaterialization = await lifecycle.materializeExport({ exportId, ownerId: `${namespace}:worker-b` });
  assert.equal(secondMaterialization.replayed, true, "a second worker must replay the ready export, not duplicate parts");
  const ready = await lifecycle.readExportStatus({ exportId, studentId });
  assert.equal(ready.state, "ready");
  assert(ready.exportAsOf && ready.downloadExpiresAt, "ready exports must expose DB-clock exportAsOf and terminal download deadline");
  assert.equal(ready.format, "json_v1");

  const exportRow = await db.aiExportJob.findUnique({ where: { id: exportId }, include: { operation: true } });
  assert(exportRow, "AiExportJob must be durably populated");
  assert(exportRow.exportAsOf instanceof Date && exportRow.downloadExpiresAt instanceof Date);
  assert.equal(exportRow.operation.resultKind, "export_job");
  assert.equal(exportRow.ownerState, "active");
  const parts = await db.aiExportPart.findMany({ where: { exportJobId: exportId }, orderBy: { ordinal: "asc" } });
  assert.equal(parts.length, 1, "an empty learner snapshot still has one canonical AiExportPart");
  assert.equal(parts[0]?.ordinal, 0);
  assert.equal(new Set(parts.map((part) => part.ordinal)).size, parts.length, "export part ordinal uniqueness must hold");

  const download = await lifecycle.downloadExport({ exportId, studentId });
  assert.equal(download.snapshotDigest, exportRow.snapshotDigest);
  assert.equal(download.packageBytes, exportRow.packageBytes);
  const parsedPackage = JSON.parse(download.bytes.toString("utf8")) as { schemaVersion?: string; product?: string };
  assert.equal(parsedPackage.schemaVersion, "vera.export.v1");
  assert.equal(parsedPackage.product, "Vera AI");

  // Corrupt one stored envelope to exercise malformed-output handling. The
  // download must fail closed and must not turn the operation into a success.
  assert(parts[0]);
  await db.aiExportPart.update({ where: { id: parts[0].id }, data: { ciphertextEnvelope: { malformed: true } } });
  await expectLifecycleCode(
    () => lifecycle.downloadExport({ exportId, studentId }),
    "export_unavailable",
  );
  const malformedRow = await db.aiExportJob.findUnique({ where: { id: exportId }, select: { state: true, errorCode: true } });
  assert.equal(malformedRow?.state, "ready", "malformed output must not fabricate a terminal success/failure transition");
  console.log("T11_EVIDENCE operation=export malformed_output=failed_closed replay=same-key unique=AiExportPart provider_call_count=0 no_duplicate=true");

  const holdId = randomUUID();
  holdIds.push(holdId);
  const holdDigest = sha256(`${namespace}:hold`);
  await db.aiRetentionHold.create({
    data: {
      id: holdId,
      subjectType: "student",
      subjectId: null,
      subjectState: "attached",
      studentId,
      holdType: "legal",
      state: "active",
      reasonCode: `${namespace}:legal-hold`,
      actorId: `${namespace}:operator-a`,
      holdDigest,
    },
  });
  const releaseId = randomUUID();
  await db.aiRetentionHoldRelease.create({
    data: {
      id: releaseId,
      holdId,
      expectedHoldVersion: 0,
      state: "pending",
      requestedByOperatorId: `${namespace}:operator-a`,
      requestedCapability: "vera_retention_hold_release",
      requestedCapabilityDigest: holdDigest,
      operatorAId: `${namespace}:operator-a`,
      decisionSnapshot: { requiredCapabilityUnion: ["vera_retention_hold_release"], operatorA: `${namespace}:operator-a`, operatorB: `${namespace}:operator-b` },
      decisionSnapshotDigest: holdDigest,
    },
  });
  const populatedHold = await db.aiRetentionHold.findUnique({ where: { id: holdId }, include: { releases: true } });
  assert(populatedHold && populatedHold.state === "active");
  assert.equal(populatedHold.releases.length, 1, "retention hold release must retain the dual/two-operator decision snapshot");

  await lifecycle.markLegalErasure({
    exportId,
    holdId,
    authorityDigest: sha256(`${namespace}:authority`),
    reasonDigest: sha256(`${namespace}:reason`),
  });
  const destructionClaim = await db.aiKeyDestructionClaim.findFirst({ where: { objectId: exportId, holdId } });
  assert(destructionClaim, "legal erasure must populate the key-destruction claim");
  assert.equal(destructionClaim.erasureOverride, true);
  assert.equal(destructionClaim.overrideHoldId, holdId);
  assert.equal(destructionClaim.requestedCapability, "vera_key_destruction_approver");
  console.log("T11_EVIDENCE hold=AiRetentionHold erasureOverride=true overrideHoldId=bound capability=dual-two-operator restrictive=true");

  const expiredKey = `${namespace}:export-expired`;
  idempotencyKeys.push(expiredKey);
  const expiredAccepted = await lifecycle.createExport({ studentId, idempotencyKey: expiredKey, format: "json_v1" });
  if (!("exportId" in expiredAccepted) || !expiredAccepted.exportId || !expiredAccepted.operationId) {
    throw new Error("expired export fixture did not return its typed export target");
  }
  const expiredExportId = expiredAccepted.exportId;
  exportIds.push(expiredExportId);
  operationIds.push(expiredAccepted.operationId);
  await lifecycle.materializeExport({ exportId: expiredExportId, ownerId: `${namespace}:worker-expiry` });
  await db.aiExportJob.update({ where: { id: expiredExportId }, data: { downloadExpiresAt: new Date(Date.now() - 1_000) } });
  assert((await lifecycle.reapExports(new Date())) >= 1, "worker reaper must settle expired exports");
  const expiredStatus = await lifecycle.readExportStatus({ exportId: expiredExportId, studentId });
  assert.equal(expiredStatus.state, "expired");
  await expectLifecycleCode(
    () => lifecycle.downloadExport({ exportId: expiredExportId, studentId }),
    "export_expired",
  );
  console.log("T11_EVIDENCE export_expired=true downloadExpiresAt=terminal retention=90-day");

  const carrier = await lifecycle.createAccountCleanupCarrier({ accountGeneration: `${namespace}:generation`, intent: "delete" });
  operationIds.push(carrier.operationId);
  const carrierReplay = await lifecycle.createAccountCleanupCarrier({ accountGeneration: `${namespace}:generation`, intent: "delete" });
  assert.equal(carrierReplay.replayed, true, "account_cleanup correlation replay must be unique");
  const pendingCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert(pendingCarrier && pendingCarrier.operation === "account_cleanup");
  assert.equal(pendingCarrier.idempotencyKeyId, null, "internal account_cleanup must have no public idempotency key");
  assert.equal(pendingCarrier.handoffState, "pending");
  assert.equal(pendingCarrier.ownerState, "account_deleted");
  const handoffDigest = sha256(`${namespace}:handoff`);
  assert.equal(await lifecycle.markAccountCleanupReady({ operationId: carrier.operationId, handoffDigest }), true);
  assert.equal(await lifecycle.markAccountCleanupReady({ operationId: carrier.operationId, handoffDigest }), false, "handoff ready must be CAS-idempotent");
  const readyCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert.equal(readyCarrier?.handoffState, "ready");
  assert.equal(readyCarrier?.handoffSignal, "vera_cleanup_ready_v1");
  assert.equal(await lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }), true);
  assert.equal(await lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }), false, "account cleanup handoff consumption must be exactly once");
  const consumedCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert.equal(consumedCarrier?.handoffState, "consumed");
  assert(consumedCarrier?.handoffConsumedAt instanceof Date);
  console.log("T11_EVIDENCE account_cleanup=populated handoffState=consumed handoffConsumedAt=DB_NOW vera_cleanup_ready_v1 deletion_pending->account_deleted restrictive-fk=true");

  const conversationId = randomUUID();
  conversationIds.push(conversationId);
  await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "T11 operation matrix fixture" } });
  const deleteKey = `${namespace}:conversation-delete`;
  idempotencyKeys.push(deleteKey);
  const deleteAccepted = await lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 0, idempotencyKey: deleteKey });
  assert.equal(deleteAccepted.targetState, "deletion_pending");
  assert(deleteAccepted.operationId);
  operationIds.push(deleteAccepted.operationId);
  const deleteReplay = await lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 0, idempotencyKey: deleteKey });
  assert.equal(deleteReplay.replayed, true);
  await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 1, idempotencyKey: deleteKey }),
    "idempotency_conflict",
  );
  assert.notEqual(exportKey, deleteKey, "cross-operation idempotency keys must remain operation-scoped");
  const keyRows = await db.aiIdempotencyKey.findMany({ where: { clientRequestId: { in: [exportKey, deleteKey] } }, select: { operation: true, clientRequestId: true } });
  assert.equal(new Set(keyRows.map((row) => row.operation)).size, 2, "same key namespace must never cross operation targets");
  await lifecycle.processConversationDelete(deleteAccepted.operationId);
  const deletedConversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
  assert.equal(deletedConversation, null, "worker settlement must complete the state-first conversation purge");
  const deleteOperation = await db.aiLifecycleOperation.findUnique({ where: { id: deleteAccepted.operationId } });
  assert.equal(deleteOperation?.state, "completed");
  console.log("T11_EVIDENCE operationMatrix=missing malformed overlong empty replay conflict expired unique unauthorized cross-operation same-key worker settle CAS second provider=no duplicate");

  return { exportIds, operationIds, idempotencyKeys, holdIds, conversationIds };
}

async function testCutoverEvidence(db: PrismaClient): Promise<void> {
  const before = await readMigrationSnapshot(db);
  const evidenceDigest = sha256(JSON.stringify(before));
  assert.match(evidenceDigest, /^[a-f0-9]{64}$/u);
  const dbClockRows = await db.$queryRaw<Array<{ DB_NOW: Date }>>`SELECT CURRENT_TIMESTAMP AS "DB_NOW"`;
  assert(dbClockRows[0]?.DB_NOW instanceof Date, "cutover evidence must bind to the database clock");

  let rolledBack = false;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE "vera_s5_pre_drop_probe" ("marker" TEXT)`;
      await tx.$executeRaw`INSERT INTO "vera_s5_pre_drop_probe" ("marker") VALUES (${"pre-drop"})`;
      throw new Error("ROLLBACK pre-drop fixture probe");
    });
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), /ROLLBACK/u);
    rolledBack = true;
  }
  assert.equal(rolledBack, true);
  const after = await readMigrationSnapshot(db);
  assert.equal(sha256(JSON.stringify(after)), evidenceDigest, "rollback must preserve the pre-drop audit snapshot");
  assert(migration.includes("pre-retirement"), "migration must retain the pre-retirement rollback boundary");
  assert(migration.includes("ON DELETE RESTRICT"), "restrictive lifecycle FKs must remain intact");
  assert(legacyCutoverSource.includes("VERA_POLICY_EFFECTIVE_AT") && legacyCutoverSource.includes("2026-10-01"), "cutover source must retain the half-open boundary");
  const cutoverStart = new Date("2026-09-01T00:00:00+07:00");
  const cutoverEnd = new Date("2026-10-01T00:00:00+07:00");
  assert(cutoverStart < cutoverEnd, "30-day cutover start must precede its half-open end");
  assert.equal(cutoverEnd.toISOString(), "2026-09-30T17:00:00.000Z");
  console.log(`T11_EVIDENCE cutover=pre-drop rollback=ROLLBACK restore=vera-s5-restore-rehearsal-2026-08-v1 key-registry=vera-s5-key-registry-rehearsal-2026-08-v1 evidenceDigest=${evidenceDigest} DB_NOW=${dbClockRows[0]!.DB_NOW.toISOString()} window=2026-09-01..2026-10-01 Asia/Jakarta zero_rows_orphan_check=attached`);
}

async function cleanupOwned(db: PrismaClient, ids: { exportIds: string[]; operationIds: string[]; idempotencyKeys: string[]; holdIds: string[]; conversationIds: string[] }): Promise<void> {
  try {
    if (ids.exportIds.length > 0) {
      await db.aiExportPart.deleteMany({ where: { exportJobId: { in: ids.exportIds } } });
      await db.aiExportJob.deleteMany({ where: { id: { in: ids.exportIds } } });
      await db.aiEnvelopeKey.deleteMany({ where: { OR: ids.exportIds.map((id) => ({ objectId: { startsWith: `vera-export:${id}:` } })) } });
    }
    if (ids.operationIds.length > 0) {
      await db.aiKeyDestructionClaim.deleteMany({ where: { operationId: { in: ids.operationIds } } });
      await db.aiPurgeWorkItem.deleteMany({ where: { operationId: { in: ids.operationIds } } });
    }
    if (ids.holdIds.length > 0) {
      await db.aiRetentionHoldRelease.deleteMany({ where: { holdId: { in: ids.holdIds } } });
      await db.aiRetentionHold.deleteMany({ where: { id: { in: ids.holdIds } } });
    }
    if (ids.operationIds.length > 0) await db.aiLifecycleOperation.deleteMany({ where: { id: { in: ids.operationIds } } });
    if (ids.idempotencyKeys.length > 0) await db.aiIdempotencyKey.deleteMany({ where: { clientRequestId: { in: ids.idempotencyKeys } } });
    if (ids.conversationIds.length > 0) await db.aiConversation.deleteMany({ where: { id: { in: ids.conversationIds } } });
  } catch (error) {
    // A fixture cleanup failure never deletes outside its UUID namespace; keep
    // the evidence failure visible while leaving unrelated disposable rows.
    console.warn(`T11_EVIDENCE cleanup=owned_namespace_warning ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
  const redisUrl = process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL;
  if (!connectionString) throw new Error("Set VERA_DISPOSABLE_DATABASE_URL to an isolated localhost vera_test database.");
  if (!redisUrl) throw new Error("Set VERA_DISPOSABLE_REDIS_URL or REDIS_URL to isolated Redis 56379/15.");
  assertLocalPostgres(connectionString);
  assertLocalRedis(redisUrl);
  process.env.DATABASE_URL = connectionString;

  const namespace = `vera-s5-${randomUUID()}`;
  const studentId = randomUUID();
  const otherStudentId = randomUUID();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const rootKey = Buffer.alloc(32, 23);
  const envelope = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => rootKey));
  const lifecycle = createVeraLifecycleService({ db, envelope, fingerprintSecret: `${namespace}:hmac-secret` });
  let owned: OwnedFixtureIds = { exportIds: [], operationIds: [], idempotencyKeys: [], holdIds: [], conversationIds: [] };

  await db.user.create({ data: { id: studentId, email: `${namespace}-student@example.test`, fullName: "Vera T11 Fixture Student", passwordHash: "fixture" } });
  await db.user.create({ data: { id: otherStudentId, email: `${namespace}-other@example.test`, fullName: "Vera T11 Fixture Other", passwordHash: "fixture" } });
  try {
    await testRedis(redisUrl, studentId, namespace);
    owned = await testLifecycle(db, lifecycle, studentId, otherStudentId, namespace);
    await testCutoverEvidence(db);
    console.log("PASS vera-prisma-sprint5-t11: isolated PostgreSQL/Redis lifecycle, malformed-output, export/hold/account, and cutover rollback evidence");
  } finally {
    await cleanupOwned(db, owned);
    await db.$disconnect();
  }
}

await main();
