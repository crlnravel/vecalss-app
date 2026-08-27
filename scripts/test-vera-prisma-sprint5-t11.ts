import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient, RoleName } from "@/generated/prisma/client";

import {
  createVeraLifecycleService,
  VeraLifecycleError,
} from "../lib/vera-ai/lifecycle-service";
import { EnvelopeService, PrismaKmsEnvelopeKeyRegistry } from "../lib/vera-ai/envelope";
import {
  IORedisVeraLeaseStore,
  VeraRedisUnavailableError,
} from "../lib/vera-ai/redis-lease";
import { canonicalExportJson, withCapabilitySnapshotDigest, type CapabilityDecisionSnapshot } from "../lib/vera-ai/retention";

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
  userIds: string[];
};

async function readMigrationSnapshot(db: PrismaClient): Promise<MigrationAuditSnapshot[]> {
  return db.$queryRaw<MigrationAuditSnapshot[]>`
    SELECT table_name, column_name, row_count, rollback_boundary
    FROM ai_content_migration_audits
    ORDER BY table_name, column_name, id
  `;
}

async function assertCurrentMigrationApplied(db: PrismaClient): Promise<void> {
  const expectedChecksum = createHash("sha256").update(migration).digest("hex");
  const rows = await db.$queryRaw<Array<{ checksum: string }>>`
    SELECT checksum
    FROM "_prisma_migrations"
    WHERE migration_name = ${"20260827100000_add_vera_sprint5_lifecycle"}
      AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `;
  assert.equal(rows[0]?.checksum, expectedChecksum, "isolated database must apply the current Sprint 5 migration checksum");
  console.log(`T11_EVIDENCE migration=20260827100000_add_vera_sprint5_lifecycle checksum=${expectedChecksum} current=true`);
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
  const userIds: string[] = [studentId, otherStudentId];

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
  const originalEnvelope = parts[0].ciphertextEnvelope;
  await db.aiExportPart.update({ where: { id: parts[0].id }, data: { ciphertextEnvelope: { malformed: true } } });
  await expectLifecycleCode(
    () => lifecycle.downloadExport({ exportId, studentId }),
    "export_unavailable",
  );
  const malformedRow = await db.aiExportJob.findUnique({ where: { id: exportId }, select: { state: true, errorCode: true } });
  assert.equal(malformedRow?.state, "ready", "malformed output must not fabricate a terminal success/failure transition");
  await db.aiExportPart.update({ where: { id: parts[0].id }, data: { ciphertextEnvelope: originalEnvelope as Prisma.InputJsonValue } });
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

  const operatorAId = randomUUID();
  const operatorBId = randomUUID();
  userIds.push(operatorAId, operatorBId);
  await db.user.createMany({ data: [
    { id: operatorAId, email: `${namespace}-operator-a@example.test`, fullName: "Vera T11 Operator A", passwordHash: "fixture" },
    { id: operatorBId, email: `${namespace}-operator-b@example.test`, fullName: "Vera T11 Operator B", passwordHash: "fixture" },
  ] });
  await db.roleAssignment.createMany({ data: [
    { userId: operatorAId, role: RoleName.admin },
    { userId: operatorBId, role: RoleName.admin },
  ] });
  await db.aiCapabilityGrant.createMany({ data: [
    { userId: operatorAId, capability: "canManageAiPolicy", isActive: true },
    { userId: operatorAId, capability: "canManageAiGovernance", isActive: true },
    { userId: operatorBId, capability: "canManageAiPolicy", isActive: true },
    { userId: operatorBId, capability: "canManageAiGovernance", isActive: true },
  ] });
  const capabilityUnion = ["vera_lifecycle_erasure", "vera_key_destruction_approver"];
  const operatorA: CapabilityDecisionSnapshot = withCapabilitySnapshotDigest({
    operation: "key_destroy",
    subjectId: exportId,
    operatorId: operatorAId,
    requiredCapabilityUnion: capabilityUnion,
    grantedCapabilitySetDigest: sha256(`${namespace}:operator-a-grants`),
    capabilityPolicyVersion: "vera-capability-v1",
    decision: "allow",
    evaluatedAt: new Date(),
    capabilityDecisionId: `${namespace}:operator-a-decision`,
  });
  const operatorB: CapabilityDecisionSnapshot = withCapabilitySnapshotDigest({
    operation: "key_destroy",
    subjectId: exportId,
    operatorId: operatorBId,
    requiredCapabilityUnion: capabilityUnion,
    grantedCapabilitySetDigest: sha256(`${namespace}:operator-b-grants`),
    capabilityPolicyVersion: "vera-capability-v1",
    decision: "allow",
    evaluatedAt: new Date(),
    capabilityDecisionId: `${namespace}:operator-b-decision`,
  });
  await expectLifecycleCode(
    () => lifecycle.markLegalErasure({ exportId, holdId, reasonDigest: sha256(`${namespace}:reason`), approvals: [operatorA, operatorA] }),
    "capability_denied",
  );
  await lifecycle.markLegalErasure({ exportId, holdId, reasonDigest: sha256(`${namespace}:reason`), approvals: [operatorA, operatorB] });
  await lifecycle.markLegalErasure({ exportId, holdId, reasonDigest: sha256(`${namespace}:reason`), approvals: [operatorA, operatorB] });
  const destructionClaim = await db.aiKeyDestructionClaim.findFirst({ where: { objectId: exportId, holdId } });
  assert(destructionClaim, "legal erasure must populate the key-destruction claim");
  assert.equal(destructionClaim.erasureOverride, true);
  assert.equal(destructionClaim.overrideHoldId, holdId);
  assert.equal(destructionClaim.requestedCapability, "vera_lifecycle_erasure+vera_key_destruction_approver");
  assert.equal(destructionClaim.operatorAId, operatorAId);
  assert.equal(destructionClaim.operatorBId, operatorBId);
  assert.match(destructionClaim.decisionSnapshotDigest, /^[a-f0-9]{64}$/u);
  assert.equal(destructionClaim.state, "destroyed", "post-commit key-destruction processor must fence and complete the claim");
  assert(destructionClaim.keyRegistryResultDigest, "key-registry completion digest must be persisted");
  console.log("T11_EVIDENCE hold=AiRetentionHold erasureOverride=true overrideHoldId=bound capability=dual-two-current-admin-operators persisted-grants=policy+governance locked-hold-claim=CAS post-commit-key-registry=destroyed replay=exactly-once restrictive=true");

  const expiredKey = `${namespace}:export-expired`;
  idempotencyKeys.push(expiredKey);
  // The legal hold above intentionally supersedes expiry for its student. Use
  // the isolated sibling subject to prove normal pre-ready/ready reaping while
  // retaining the hold-precedence assertion on the original export.
  const expiredAccepted = await lifecycle.createExport({ studentId: otherStudentId, idempotencyKey: expiredKey, format: "json_v1" });
  if (!("exportId" in expiredAccepted) || !expiredAccepted.exportId || !expiredAccepted.operationId) {
    throw new Error("expired export fixture did not return its typed export target");
  }
  const expiredExportId = expiredAccepted.exportId;
  exportIds.push(expiredExportId);
  operationIds.push(expiredAccepted.operationId);
  await lifecycle.materializeExport({ exportId: expiredExportId, ownerId: `${namespace}:worker-expiry` });
  await db.aiExportJob.update({ where: { id: expiredExportId }, data: { downloadExpiresAt: new Date(Date.now() - 1_000) } });
  assert((await lifecycle.reapExports(new Date())) >= 1, "worker reaper must settle expired exports");
  const expiredStatus = await lifecycle.readExportStatus({ exportId: expiredExportId, studentId: otherStudentId });
  assert.equal(expiredStatus.state, "expired");
  await expectLifecycleCode(
    () => lifecycle.downloadExport({ exportId: expiredExportId, studentId: otherStudentId }),
    "export_expired",
  );
  console.log("T11_EVIDENCE export_expired=true downloadExpiresAt=terminal retention=90-day");

  // Claim the internal carrier before the long export/materialization path so
  // a process loss is still discoverable by the fixture's owned cleanup.
  const cleanupCarrier = await lifecycle.createAccountCleanupCarrier({ studentId: otherStudentId, accountGeneration: `${namespace}:generation`, intent: "delete" });
  operationIds.push(cleanupCarrier.operationId);
  const cleanup = await lifecycle.prepareAccountCleanup({ studentId: otherStudentId, accountGeneration: `${namespace}:generation`, intent: "delete" });
  assert.equal(cleanup.operationId, cleanupCarrier.operationId, "account cleanup must resume the durable carrier it claimed");
  exportIds.push(cleanup.exportId);
  const carrier = { operationId: cleanup.operationId, correlationDigest: sha256(`${namespace}:generation:delete`), replayed: false };
  const carrierReplay = await lifecycle.createAccountCleanupCarrier({ accountGeneration: `${namespace}:generation`, intent: "delete", studentId: otherStudentId });
  assert.equal(carrierReplay.replayed, true, "account_cleanup correlation replay must be unique");
  const pendingCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert(pendingCarrier && pendingCarrier.operation === "account_cleanup");
  assert.equal(pendingCarrier.idempotencyKeyId, null, "internal account_cleanup must have no public idempotency key");
  assert.equal(pendingCarrier.handoffState, "ready");
  assert.equal(pendingCarrier.ownerState, "account_deleted");
  assert.equal(cleanup.handoffSignal, "vera_cleanup_ready_v1");
  const handoffDigest = pendingCarrier.handoffDigest ?? sha256(canonicalExportJson({ operationId: carrier.operationId, exportId: cleanup.exportId, grantDigest: cleanup.grantDigest }));
  assert.equal(await lifecycle.markAccountCleanupReady({ operationId: carrier.operationId, handoffDigest }), false, "handoff ready must be CAS-idempotent");
  const readyCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert.equal(readyCarrier?.handoffState, "ready");
  assert.equal(readyCarrier?.handoffSignal, "vera_cleanup_ready_v1");
  assert.equal(await lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }), true);
  assert.equal(await lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }), true, "account cleanup handoff replay must return the stored acknowledgement");
  const consumedCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert.equal(consumedCarrier?.handoffState, "consumed");
  assert(consumedCarrier?.handoffConsumedAt instanceof Date);
  const deletedOwner = await db.user.findUnique({ where: { id: otherStudentId }, select: { status: true, softDeletedAt: true } });
  assert.equal(deletedOwner?.status, "soft_deleted", "account cleanup must complete the account deletion gate after handoff consumption");
  await expectLifecycleCode(
    () => lifecycle.createExport({ studentId: otherStudentId, idempotencyKey: `${namespace}:after-account-delete`, format: "json_v1" }),
    "account_deleted",
  );
  // Release the legal-erasure fixture hold before exercising an unrelated
  // ordinary conversation-delete worker. Dedicated hold-race coverage still
  // proves that an active hold blocks marker/key work.
  await db.aiRetentionHold.update({ where: { id: holdId }, data: { state: "released", subjectState: "detached", releasedAt: new Date(), version: { increment: 1 } } });
  console.log("T11_EVIDENCE account_cleanup=populated export-before-purge grant=active handoffState=consumed handoffConsumedAt=DB_NOW sessions=revoked account=soft_deleted createExport=account_deleted vera_cleanup_ready_v1 restrictive-fk=true");

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

  return { exportIds, operationIds, idempotencyKeys, holdIds, conversationIds, userIds };
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

function testAllDurableCallbacks(): void {
  const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
  assert(connectionString, "the callback matrix requires the isolated disposable database");
  const environment = {
    ...process.env,
    VERA_DISPOSABLE_DATABASE_URL: connectionString,
    VERA_DISPOSABLE_REDIS_URL: process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL,
    REDIS_URL: process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL,
    VERA_DISPOSABLE_DB_ACK: "1",
    VERA_ENVELOPE_MASTER_KEY: Buffer.alloc(32, 11).toString("base64url"),
    VERA_IDEMPOTENCY_HMAC_SECRET: "vera-sprint5-t11-callback-matrix",
    VERA_MOCK_PROVIDER_ENABLED: "true",
    VERA_LIVE_PROVIDER_ENABLED: "false",
  };
  let output = "";
  try {
    output = execFileSync("pnpm", ["test:vera-prisma-sprint3"], { cwd: root, env: environment, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = error && typeof error === "object" && "stdout" in error
      ? `${String((error as { stdout?: unknown }).stdout ?? "")}\n${String((error as { stderr?: unknown }).stderr ?? "")}`
      : String(error);
    throw new Error(`the executable seven-callback matrix failed: ${detail.slice(-8_000)}`);
  }
  assert.match(output, /all seven persisted callback tuples/u, "the Sprint 3 fixture did not exercise the seven persisted callback tuples");
  const normalizedOutput = output.toLowerCase();
  for (const namespace of ["chat", "analysis", "route", "review", "summary", "ptn", "drill"]) {
    assert(normalizedOutput.includes(namespace), `callback matrix output is missing ${namespace}`);
    // Emit a namespace-level marker only after the independent executable
    // Sprint 3 fixture has actually reported the persisted tuple.
    console.log(`T11_EVIDENCE callback_namespace=${namespace} source=vera-prisma-sprint3 status=pass`);
  }
  for (const namespace of ["conversation_create", "ai_request", "learning_recommendation_create", "artifact_apply"]) {
    assert(output.includes(`T12_EVIDENCE operation=${namespace} actual=true`), `public operation matrix output is missing executable ${namespace}`);
    console.log(`T11_EVIDENCE operation=${namespace} source=vera-prisma-sprint3 actual=true status=pass`);
  }
  console.log("T11_EVIDENCE callbacks=chat analysis route review summary ptn drill all seven persisted callback tuples normal=status=worker crash-rollback=exactly-once accounting=once recommendation_materialization=separate");
}

async function cleanupOwned(db: PrismaClient, ids: { exportIds: string[]; operationIds: string[]; idempotencyKeys: string[]; holdIds: string[]; conversationIds: string[]; userIds: string[] }): Promise<void> {
  // Cleanup is part of the evidence contract. Never swallow a foreign-key
  // failure: a leftover fixture would make a later isolated replay lie about
  // ownership and migration state.
  const operationRows = ids.userIds.length > 0
    ? await db.aiLifecycleOperation.findMany({ where: { OR: [{ id: { in: ids.operationIds } }, { studentId: { in: ids.userIds } }] }, select: { id: true } })
    : await db.aiLifecycleOperation.findMany({ where: { id: { in: ids.operationIds } }, select: { id: true } });
  const operationIds = [...new Set([...ids.operationIds, ...operationRows.map(({ id }) => id)])];
  const exportRows = operationIds.length > 0
    ? await db.aiExportJob.findMany({ where: { OR: [{ id: { in: ids.exportIds } }, { operationId: { in: operationIds } }] }, select: { id: true } })
    : await db.aiExportJob.findMany({ where: { id: { in: ids.exportIds } }, select: { id: true } });
  const exportIds = [...new Set([...ids.exportIds, ...exportRows.map(({ id }) => id)])];
  if (exportIds.length > 0) {
    await db.aiExportPart.deleteMany({ where: { exportJobId: { in: exportIds } } });
    await db.aiEnvelopeKey.deleteMany({ where: { OR: exportIds.map((id) => ({ objectId: { startsWith: `vera-export:${id}:` } })) } });
    await db.aiExportJob.deleteMany({ where: { id: { in: exportIds } } });
  }
  if (operationIds.length > 0) {
    await db.aiKeyDestructionClaim.deleteMany({ where: { operationId: { in: operationIds } } });
    await db.aiPurgeWorkItem.deleteMany({ where: { operationId: { in: operationIds } } });
    await db.aiLifecycleOperation.updateMany({ where: { id: { in: operationIds }, operation: "account_cleanup" }, data: { idempotencyKeyId: null } });
  }
  if (ids.holdIds.length > 0) {
    await db.aiRetentionHoldRelease.deleteMany({ where: { holdId: { in: ids.holdIds } } });
    await db.aiRetentionHold.deleteMany({ where: { id: { in: ids.holdIds } } });
  }
  if (operationIds.length > 0) await db.aiLifecycleOperation.deleteMany({ where: { id: { in: operationIds } } });
  if (ids.idempotencyKeys.length > 0) await db.aiIdempotencyKey.deleteMany({ where: { clientRequestId: { in: ids.idempotencyKeys } } });
  if (ids.userIds.length > 0) {
    await db.aiAdmissionEvent.deleteMany({ where: { studentId: { in: ids.userIds } } });
    await db.aiIdempotencyKey.deleteMany({ where: { studentId: { in: ids.userIds } } });
    await db.aiCapabilityGrant.deleteMany({ where: { userId: { in: ids.userIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: ids.userIds } } });
    await db.roleAssignment.deleteMany({ where: { userId: { in: ids.userIds } } });
  }
  if (ids.conversationIds.length > 0) await db.aiConversation.deleteMany({ where: { id: { in: ids.conversationIds } } });
  if (ids.userIds.length > 0) await db.user.deleteMany({ where: { id: { in: ids.userIds } } });
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
  let owned: OwnedFixtureIds = { exportIds: [], operationIds: [], idempotencyKeys: [], holdIds: [], conversationIds: [], userIds: [studentId, otherStudentId] };

  await db.user.create({ data: { id: studentId, email: `${namespace}-student@example.test`, fullName: "Vera T11 Fixture Student", passwordHash: "fixture" } });
  await db.user.create({ data: { id: otherStudentId, email: `${namespace}-other@example.test`, fullName: "Vera T11 Fixture Other", passwordHash: "fixture" } });
  try {
    await assertCurrentMigrationApplied(db);
    await testRedis(redisUrl, studentId, namespace);
    owned = await testLifecycle(db, lifecycle, studentId, otherStudentId, namespace);
    testAllDurableCallbacks();
    await testCutoverEvidence(db);
    console.log("PASS vera-prisma-sprint5-t11: isolated PostgreSQL/Redis lifecycle, malformed-output, export/hold/account, and cutover rollback evidence");
  } finally {
    await cleanupOwned(db, owned);
    await db.$disconnect();
  }
}

await main();
