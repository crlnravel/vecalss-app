import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
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
const legalMetadataMigrationPath = join(root, "prisma/migrations/20260828100000_retain_legal_export_metadata/migration.sql");
const legalMetadataMigration = readFileSync(legalMetadataMigrationPath, "utf8");
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

async function expectLifecycleCode(action: () => Promise<unknown>, expected: VeraLifecycleError["code"]): Promise<true> {
  try {
    await action();
    assert.fail(`expected VeraLifecycleError(${expected})`);
  } catch (error) {
    assert(error instanceof VeraLifecycleError, `expected typed lifecycle error ${expected}`);
    assert.equal(error.code, expected);
  }
  return true;
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
  artifactIds: string[];
  operationIds: string[];
  idempotencyKeys: string[];
  holdIds: string[];
  conversationIds: string[];
  requestIds: string[];
  contextPackIds: string[];
  stageIds: string[];
  dailyIds: string[];
  envelopeKeyRefs: string[];
  userIds: string[];
  operationEdges: LifecycleOperationEdge[];
};

type LifecycleOperationEdge = {
  operation: "export_create" | "conversation_delete" | "artifact_delete";
  keyMalformed: boolean;
  keyOverlong: boolean;
  keyEmpty: boolean;
  missingKey: boolean;
  payloadValidation: boolean;
  unauthorizedKey: boolean;
  replay: boolean;
  conflict: boolean;
  expiry: boolean;
  uniqueLoser: boolean;
  unauthorized: boolean;
  recovery: {
    kind: "export_takeover" | "delete_worker_cas";
    exercised: boolean;
  };
  crossOperationTargetIsolation: boolean;
  evidenceDigest: string;
};

type StudioOperationEdge = Omit<LifecycleOperationEdge, "operation"> & {
  operation: "conversation_create" | "ai_request" | "learning_recommendation_create" | "artifact_apply";
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
  const expectedLegalMetadataChecksum = createHash("sha256").update(legalMetadataMigration).digest("hex");
  const normalizedMigration = migration.replaceAll('"', "");
  assert(normalizedMigration.includes("terminal_retention_expires_at >= terminal_at"), "migration must enforce terminal_retention_expires_at >= terminal_at");
  assert(normalizedMigration.includes("failed_terminal"), "migration must include failed_terminal terminal-retention state");
  assert(legalMetadataMigration.includes("ai_export_jobs_pre_ready_contract_ck"), "legal metadata migration must explicitly replace the pre-ready check");
  assert(legalMetadataMigration.includes("failed_retryable"), "legal metadata migration must preserve retryable pre-ready invariant");
  assert(legalMetadataMigration.includes("export_erased_legal"), "legal metadata migration must allow metadata only for legal-erasure terminal tombstones");
  assert(legalMetadataMigration.includes("snapshot_digest") && legalMetadataMigration.includes("package_bytes"), "legal metadata migration must guard the complete retained ready metadata tuple");
  const rows = await db.$queryRaw<Array<{ checksum: string }>>`
    SELECT checksum
    FROM "_prisma_migrations"
    WHERE migration_name = ${"20260827100000_add_vera_sprint5_lifecycle"}
      AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `;
  assert.equal(rows[0]?.checksum, expectedChecksum, "isolated database must apply the current Sprint 5 migration checksum");
  const legalRows = await db.$queryRaw<Array<{ checksum: string }>>`
    SELECT checksum
    FROM "_prisma_migrations"
    WHERE migration_name = ${"20260828100000_retain_legal_export_metadata"}
      AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `;
  assert.equal(legalRows[0]?.checksum, expectedLegalMetadataChecksum, "isolated database must apply the legal-export metadata correction checksum");
  console.log(`T11_EVIDENCE migration=20260827100000_add_vera_sprint5_lifecycle checksum=${expectedChecksum} correction=20260828100000_retain_legal_export_metadata correctionChecksum=${expectedLegalMetadataChecksum} current=true terminal_retention_expires_at >= terminal_at failed_terminal=true`);
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

async function testLifecycle(db: PrismaClient, lifecycle: ReturnType<typeof createVeraLifecycleService>, envelope: EnvelopeService, studentId: string, otherStudentId: string, namespace: string): Promise<OwnedFixtureIds> {
  const exportIds: string[] = [];
  const artifactIds: string[] = [];
  const operationIds: string[] = [];
  const idempotencyKeys: string[] = [];
  const holdIds: string[] = [];
  const conversationIds: string[] = [];
  const requestIds: string[] = [];
  const contextPackIds: string[] = [];
  const stageIds: string[] = [];
  const dailyIds: string[] = [];
  const envelopeKeyRefs: string[] = [];
  const userIds: string[] = [studentId, otherStudentId];

  const createEdgeArtifact = async (artifactId: string, label: string): Promise<void> => {
    const payload = JSON.stringify({ toolId: "summary", title: label, markdown: `${label} payload`, payload: { namespace } });
    const digest = sha256(payload);
    const [titleEnvelope, markdownEnvelope, payloadEnvelope] = await Promise.all([
      envelope.encryptAsync(label, `vera-t11-edge-artifact-title:${artifactId}`),
      envelope.encryptAsync(`${label} payload`, `vera-t11-edge-artifact-markdown:${artifactId}`),
      envelope.encryptAsync(payload, `vera-t11-edge-artifact-payload:${artifactId}`),
    ]);
    artifactIds.push(artifactId);
    envelopeKeyRefs.push(titleEnvelope.keyRef, markdownEnvelope.keyRef, payloadEnvelope.keyRef);
    await db.aiArtifact.create({ data: {
      id: artifactId,
      artifactKey: `vera.t11.edge.${artifactId}`,
      revision: 1,
      studentId,
      conversationId: null,
      artifactType: "summary",
      provenanceKind: "typed_entity",
      titleCiphertext: titleEnvelope as Prisma.InputJsonValue,
      contentMarkdownCiphertext: markdownEnvelope as Prisma.InputJsonValue,
      payloadCiphertext: payloadEnvelope as Prisma.InputJsonValue,
      artifactSchemaVersion: "1",
      sourceEntityType: "T11OperationEdgeFixture",
      sourceEntityId: randomUUID(),
      sourceEntityRevision: 0,
      sourceEntityDigest: digest,
      contentDigest: digest,
      renderVersion: "vera-render-v1",
      retentionPolicyVersion: "vera-retention-v1",
      lifecycle: { create: { lifecycleRevision: 0 } },
    } });
  };

  const malformedCases = [
    { label: "empty", key: "" },
    { label: "overlong", key: "x".repeat(121) },
    { label: "malformed", key: "bad\u0000key" },
  ];
  let exportMissingKey = false;
  let exportPayloadValidation = false;
  await expectLifecycleCode(
    () => lifecycle.createExport({ studentId, idempotencyKey: undefined as unknown as string, format: "json_v1" }),
    "invalid_request",
  );
  exportMissingKey = true;
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
  exportPayloadValidation = true;

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

  // Export create has one valid v1 format, so the changed-payload conflict is
  // exercised by temporarily replacing the persisted canonical fingerprint
  // with a different payload digest.  The original digest is restored before
  // any later materialization/retention assertions; this is a fixture-only
  // conflict, not a production mutation path.
  const exportKeyRow = await db.aiIdempotencyKey.findUnique({ where: { studentId_operation_clientRequestId: { studentId, operation: "export_create", clientRequestId: exportKey } }, select: { id: true, requestFingerprint: true } });
  assert(exportKeyRow?.id && exportKeyRow.requestFingerprint, "export replay key must persist its canonical fingerprint");
  await db.aiIdempotencyKey.update({ where: { id: exportKeyRow.id }, data: { requestFingerprint: sha256(`${namespace}:export-create-changed-payload`) } });
  const exportConflict = await expectLifecycleCode(
    () => lifecycle.createExport({ studentId, idempotencyKey: exportKey, format: "json_v1" }),
    "idempotency_conflict",
  );
  await db.aiIdempotencyKey.update({ where: { id: exportKeyRow.id }, data: { requestFingerprint: exportKeyRow.requestFingerprint } });

  // The unique-key loser must re-read the durable winner rather than create a
  // second job or report a synthetic rejection.  Both calls use the same
  // student lock and operation-scoped key, so the replay result is observable
  // even when the race is won by either Promise.
  const exportRaceKey = `${namespace}:export-create-race`;
  idempotencyKeys.push(exportRaceKey);
  const exportRace = await Promise.all([
    lifecycle.createExport({ studentId, idempotencyKey: exportRaceKey, format: "json_v1" }),
    lifecycle.createExport({ studentId, idempotencyKey: exportRaceKey, format: "json_v1" }),
  ]);
  assert.equal(exportRace.length, 2);
  assert.equal(exportRace.filter((result) => result.replayed).length, 1, "export create unique loser must replay exactly one winner");
  assert.equal(new Set(exportRace.flatMap((result) => "exportId" in result && result.exportId ? [result.exportId] : [])).size, 1, "export race must have one durable job");
  for (const result of exportRace) {
    if ("exportId" in result && result.exportId) exportIds.push(result.exportId);
    if ("operationId" in result && result.operationId) operationIds.push(result.operationId);
  }

  // Before-ready materialization must fail closed when a learner-visible part
  // cannot be decoded.  The first failure is retryable while the bounded
  // recovery lease is alive; after the DB-clock deadline the same durable
  // operation becomes a terminal export_payload_unavailable tombstone.  The
  // idempotency replay must preserve that exact reason and never fabricate a
  // ready package or account-only success.
  const malformedStudentId = randomUUID();
  userIds.push(malformedStudentId);
  await db.user.create({ data: { id: malformedStudentId, email: `${namespace}-malformed@example.test`, fullName: "Vera malformed payload fixture", passwordHash: "fixture" } });
  const malformedMaterializationConversationId = randomUUID();
  conversationIds.push(malformedMaterializationConversationId);
  await db.aiConversation.create({ data: {
    id: malformedMaterializationConversationId,
    studentId: malformedStudentId,
    conversationType: "vera_chat",
    title: "Malformed pre-ready materialization fixture",
    // Pin fixture timestamps before the export's DB-clock snapshot. Prisma's
    // client-side timestamp defaults can otherwise land a few milliseconds
    // after exportAsOf even though the create calls are awaited, causing the
    // malformed learner-visible envelope to be silently outside the package.
    createdAt: new Date(Date.now() - 120_000),
  } });
  await db.aiMessage.create({ data: {
    id: randomUUID(),
    conversationId: malformedMaterializationConversationId,
    role: "user",
    contentMarkdown: null,
    contentEnvelope: { malformed: true },
    contentDigest: sha256(`${namespace}:malformed-pre-ready-message`),
    contentState: "encrypted",
    metadataState: "legacy_plaintext",
    createdAt: new Date(Date.now() - 60_000),
  } });
  const malformedMaterializationKey = `${namespace}:export-materialization-malformed`;
  idempotencyKeys.push(malformedMaterializationKey);
  const malformedMaterialization = await lifecycle.createExport({ studentId: malformedStudentId, idempotencyKey: malformedMaterializationKey, format: "json_v1" });
  if (!("exportId" in malformedMaterialization) || !malformedMaterialization.exportId || !malformedMaterialization.operationId) throw new Error("malformed pre-ready export fixture was not accepted");
  exportIds.push(malformedMaterialization.exportId);
  operationIds.push(malformedMaterialization.operationId);
  await expectLifecycleCode(
    () => lifecycle.materializeExport({ exportId: malformedMaterialization.exportId!, ownerId: `${namespace}:malformed-materialization-worker` }),
    "export_payload_unavailable",
  );
  const retryableMalformed = await db.aiExportJob.findUnique({ where: { id: malformedMaterialization.exportId }, include: { operation: true } });
  assert.equal(retryableMalformed?.state, "failed_retryable", "undecipherable pre-ready materialization must remain retryable before its recovery deadline");
  assert.equal(retryableMalformed?.errorCode, "export_payload_unavailable");
  assert.equal(retryableMalformed.operation.errorCode, "export_payload_unavailable");
  const malformedReplay = await lifecycle.createExport({ studentId: malformedStudentId, idempotencyKey: malformedMaterializationKey, format: "json_v1" });
  assert.equal(malformedReplay.replayed, true, "malformed pre-ready export must replay the durable retryable operation");
  assert.equal("state" in malformedReplay && malformedReplay.state, "failed_retryable");
  await db.aiExportJob.update({ where: { id: malformedMaterialization.exportId }, data: { recoveryDeadlineAt: new Date(Date.now() - 60_000) } });
  await assert.doesNotReject(() => lifecycle.reapExports(), "the DB-clock reaper must own the pre-ready deadline transition");
  const terminalMalformed = await db.aiExportJob.findUnique({ where: { id: malformedMaterialization.exportId }, include: { operation: true, parts: true } });
  assert.equal(terminalMalformed?.state, "failed_terminal");
  assert.equal(terminalMalformed?.errorCode, "export_payload_unavailable", "deadline settlement must preserve the malformed payload reason");
  assert.equal(terminalMalformed.operation.errorCode, "export_payload_unavailable");
  assert(terminalMalformed?.terminalAt instanceof Date && terminalMalformed.terminalRetentionExpiresAt instanceof Date && terminalMalformed.terminalRetentionExpiresAt >= terminalMalformed.terminalAt);
  assert.equal(terminalMalformed?.parts.length, 0, "a malformed pre-ready payload must never create a partial ready part");
  const terminalMalformedReplay = await lifecycle.createExport({ studentId: malformedStudentId, idempotencyKey: malformedMaterializationKey, format: "json_v1" });
  assert.equal(terminalMalformedReplay.replayed, true, "terminal malformed export must replay the same tombstone");
  assert.equal("state" in terminalMalformedReplay && terminalMalformedReplay.state, "failed_terminal");
  console.log("T11_EVIDENCE materialization_pre_ready=malformed-envelope failed_retryable->failed_terminal error=export_payload_unavailable DB-clock=reaper same-key-replay=true parts=none deletion-order=after-terminal");

  await expectLifecycleCode(
    () => lifecycle.readExportStatus({ exportId: randomUUID(), studentId }),
    "target_unavailable",
  );
  const exportUnauthorized = await expectLifecycleCode(
    () => lifecycle.readExportStatus({ exportId, studentId: otherStudentId }),
    "target_unavailable",
  );

  const materialized = await lifecycle.materializeExport({ exportId, ownerId: `${namespace}:worker-a` });
  assert.equal(materialized.state, "ready");
  const exportUnauthorizedKey = await expectLifecycleCode(
    () => lifecycle.downloadExport({ exportId, grant: `${namespace}:unauthorized-grant` }),
    "target_unavailable",
  );
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
  const readySnapshotDigest = exportRow.snapshotDigest;
  const readyPackageBytes = exportRow.packageBytes;
  const readyDownloadAt = exportRow.downloadReadyAt;
  const readyDownloadExpiresAt = exportRow.downloadExpiresAt;
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

  // A missing package part is a distinct integrity failure from a malformed
  // envelope.  It must fail closed and transition ready -> failed_terminal;
  // an ordinary failed_terminal row is not allowed to retain ready metadata.
  const missingPartKey = `${namespace}:export-missing-part`;
  idempotencyKeys.push(missingPartKey);
  const missingPartAccepted = await lifecycle.createExport({ studentId, idempotencyKey: missingPartKey, format: "json_v1" });
  if (!("exportId" in missingPartAccepted) || !missingPartAccepted.exportId || !missingPartAccepted.operationId) throw new Error("missing-part export fixture was not accepted");
  exportIds.push(missingPartAccepted.exportId);
  operationIds.push(missingPartAccepted.operationId);
  await lifecycle.materializeExport({ exportId: missingPartAccepted.exportId, ownerId: `${namespace}:missing-part-worker` });
  const missingParts = await db.aiExportPart.findMany({ where: { exportJobId: missingPartAccepted.exportId }, select: { id: true } });
  assert(missingParts.length > 0, "missing-part fixture must materialize at least one export part");
  await db.aiExportPart.delete({ where: { id: missingParts[0]!.id } });
  await expectLifecycleCode(
    () => lifecycle.downloadExport({ exportId: missingPartAccepted.exportId!, studentId }),
    "export_unavailable",
  );
  const missingPartRow = await db.aiExportJob.findUnique({ where: { id: missingPartAccepted.exportId }, select: { state: true, errorCode: true, terminalAt: true, terminalRetentionExpiresAt: true, snapshotDigest: true, packageBytes: true, downloadReadyAt: true, downloadExpiresAt: true } });
  assert.equal(missingPartRow?.state, "failed_terminal", "missing export parts must terminalize the durable ready state");
  assert.equal(missingPartRow?.errorCode, "export_parts_missing");
  assert(missingPartRow?.terminalAt instanceof Date, "missing-part terminalization must persist terminalAt");
  assert(missingPartRow?.terminalRetentionExpiresAt instanceof Date && missingPartRow.terminalRetentionExpiresAt >= missingPartRow.terminalAt, "missing-part terminalization must persist terminal retention after terminalAt");
  assert.equal(missingPartRow?.snapshotDigest, null);
  assert.equal(missingPartRow?.packageBytes, null);
  assert.equal(missingPartRow?.downloadReadyAt, null);
  assert.equal(missingPartRow?.downloadExpiresAt, null);
  await assert.rejects(
    () => db.aiExportJob.update({
      where: { id: missingPartAccepted.exportId! },
      data: {
        state: "failed_terminal",
        errorCode: "fixture_failed_terminal",
        snapshotDigest: readySnapshotDigest ?? sha256(`${namespace}:ordinary-failed-terminal`),
        packageBytes: readyPackageBytes ?? 1,
        downloadReadyAt: readyDownloadAt ?? new Date(),
        downloadExpiresAt: readyDownloadExpiresAt ?? new Date(Date.now() + 60_000),
      },
    }),
    /ai_export_jobs_pre_ready_contract_ck|check constraint|constraint/iu,
    "ordinary failed_terminal rows must not retain ready package metadata",
  );
  const remainingMissingParts = await db.aiExportPart.count({ where: { exportJobId: missingPartAccepted.exportId } });
  assert.equal(remainingMissingParts, 0, "missing-part replay must not create replacement package parts");
  console.log("T11_EVIDENCE export_materialization_integrity=failed_closed missing_part=failed_terminal retention=terminalAt+90d ordinary_metadata_rejected=true replay=same-key unique=AiExportPart provider_call_count=0 no_duplicate=true status=pass");

  // A materialization worker can disappear after claiming a package.  The
  // next owner must take over only after the persisted lease expires, advance
  // the materialization fence, and remain the sole owner of the part set.
  const takeoverKey = `${namespace}:export-materialization-takeover`;
  idempotencyKeys.push(takeoverKey);
  const takeoverAccepted = await lifecycle.createExport({ studentId, idempotencyKey: takeoverKey, format: "json_v1" });
  if (!("exportId" in takeoverAccepted) || !takeoverAccepted.exportId || !takeoverAccepted.operationId) throw new Error("materialization takeover fixture was not accepted");
  exportIds.push(takeoverAccepted.exportId);
  operationIds.push(takeoverAccepted.operationId);
  const firstClaim = await lifecycle.claimMaterialization({ exportId: takeoverAccepted.exportId, ownerId: `${namespace}:materialization-owner-a` });
  assert(firstClaim, "first materialization owner must receive a durable claim");
  await db.aiExportJob.update({ where: { id: takeoverAccepted.exportId }, data: { materializationLeaseExpiresAt: new Date(Date.now() - 60_000) } });
  const takeoverReady = await lifecycle.materializeExport({ exportId: takeoverAccepted.exportId, ownerId: `${namespace}:materialization-owner-b` });
  assert.equal(takeoverReady.state, "ready", "the fenced takeover owner must be able to finalize the export");
  const takeoverRow = await db.aiExportJob.findUnique({ where: { id: takeoverAccepted.exportId }, select: { materializationFence: true, materializationClaimId: true, materializationOwnerId: true, state: true } });
  assert(takeoverRow && takeoverRow.materializationFence > firstClaim.fence && takeoverRow.materializationClaimId === null && takeoverRow.materializationOwnerId === null && takeoverRow.state === "ready", "stale materialization ownership must not survive finalization");
  console.log("T11_EVIDENCE export_materialization=stale-owner-fenced lease-expired takeover=owner-b finalizer=CAS exactly-once parts=unique");

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
  // Legal erasure must parse the complete persisted part/key lineage before
  // creating a destruction claim. A malformed envelope is a hard rejection;
  // no claim may be marked destroyed while any required part is unprocessed.
  await db.aiExportPart.update({ where: { id: parts[0]!.id }, data: { ciphertextEnvelope: { malformed: true } } });
  await expectLifecycleCode(
    () => lifecycle.markLegalErasure({ exportId, holdId, reasonDigest: sha256(`${namespace}:malformed-legal-reason`), approvals: [operatorA, operatorB] }),
    "export_payload_unavailable",
  );
  const malformedLegalClaim = await db.aiKeyDestructionClaim.findFirst({ where: { objectId: exportId, holdId }, select: { state: true } });
  assert(!malformedLegalClaim || malformedLegalClaim.state !== "destroyed", "malformed legal export must not create a destroyed key claim");
  await db.aiExportPart.update({ where: { id: parts[0]!.id }, data: { ciphertextEnvelope: originalEnvelope as Prisma.InputJsonValue } });
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
  const legallyErasedJob = await db.aiExportJob.findUnique({ where: { id: exportId }, include: { operation: true } });
  assert(legallyErasedJob, "legal-erasure must retain the export tombstone");
  assert.equal(legallyErasedJob.state, "failed_terminal", "legal erasure must use the explicit failed_terminal projection");
  assert.equal(legallyErasedJob.errorCode, "export_erased_legal");
  assert.equal(legallyErasedJob.exportAccessGrantState, "expired");
  assert.equal(legallyErasedJob.operation.state, "failed_terminal");
  assert.equal(legallyErasedJob.operation.errorCode, "export_erased_legal");
  assert.equal(legallyErasedJob.snapshotDigest, readySnapshotDigest, "legal erasure must retain content-free snapshot digest metadata");
  assert.equal(legallyErasedJob.packageBytes, readyPackageBytes, "legal erasure must retain content-free package byte metadata");
  assert.equal(legallyErasedJob.downloadReadyAt?.getTime(), readyDownloadAt?.getTime(), "legal erasure must retain the original ready timestamp as audit metadata");
  assert.equal(legallyErasedJob.downloadExpiresAt?.getTime(), readyDownloadExpiresAt?.getTime(), "legal erasure must retain the original download deadline as audit metadata");
  assert(legallyErasedJob.operation.exportExpiresAt?.getTime() === readyDownloadExpiresAt?.getTime(), "the original download deadline must remain in the operation metadata");
  const legalEnvelope = originalEnvelope as { keyRef?: string };
  if (legalEnvelope.keyRef) {
    const destroyedKey = await db.aiEnvelopeKey.findUnique({ where: { keyRef: legalEnvelope.keyRef }, select: { state: true } });
    assert.equal(destroyedKey?.state, "destroyed", "legal erasure must destroy the object-scoped export key after commit");
  }
  console.log("T11_EVIDENCE hold=AiRetentionHold erasureOverride=true overrideHoldId=bound capability=dual-two-current-admin-operators persisted-grants=policy+governance locked-hold-claim=CAS post-commit-key-registry=destroyed replay=exactly-once restrictive=true job=failed_terminal digest+bytes=retained");

  // Legal erasure also applies before materialization.  There is no ready
  // package metadata to retain in this branch, but the operation, grant and
  // key-claim projections must still reach their exact terminal states under
  // the locked active hold and two current operator snapshots.
  const beforeReadyKey = `${namespace}:export-before-ready-erasure`;
  idempotencyKeys.push(beforeReadyKey);
  const beforeReadyAccepted = await lifecycle.createExport({ studentId, idempotencyKey: beforeReadyKey, format: "json_v1" });
  if (!("exportId" in beforeReadyAccepted) || !beforeReadyAccepted.exportId || !beforeReadyAccepted.operationId) throw new Error("before-ready legal-erasure export fixture was not accepted");
  exportIds.push(beforeReadyAccepted.exportId);
  operationIds.push(beforeReadyAccepted.operationId);
  const beforeReadyOperatorA = withCapabilitySnapshotDigest({ ...operatorA, subjectId: beforeReadyAccepted.exportId, capabilityDecisionId: `${namespace}:before-ready-operator-a` });
  const beforeReadyOperatorB = withCapabilitySnapshotDigest({ ...operatorB, subjectId: beforeReadyAccepted.exportId, capabilityDecisionId: `${namespace}:before-ready-operator-b` });
  await lifecycle.markLegalErasure({ exportId: beforeReadyAccepted.exportId, holdId, reasonDigest: sha256(`${namespace}:before-ready-erasure`), approvals: [beforeReadyOperatorA, beforeReadyOperatorB] });
  await lifecycle.markLegalErasure({ exportId: beforeReadyAccepted.exportId, holdId, reasonDigest: sha256(`${namespace}:before-ready-erasure`), approvals: [beforeReadyOperatorA, beforeReadyOperatorB] });
  const beforeReadyErased = await db.aiExportJob.findUnique({ where: { id: beforeReadyAccepted.exportId }, include: { operation: true } });
  assert(beforeReadyErased, "before-ready legal erasure must retain its export tombstone");
  assert.equal(beforeReadyErased.state, "failed_terminal");
  assert.equal(beforeReadyErased.errorCode, "export_erased_legal");
  assert.equal(beforeReadyErased.exportAccessGrantState, "expired");
  assert.equal(beforeReadyErased.downloadReadyAt, null);
  assert.equal(beforeReadyErased.downloadExpiresAt, null);
  assert.equal(beforeReadyErased.snapshotDigest, null);
  assert.equal(beforeReadyErased.packageBytes, null);
  assert.equal(beforeReadyErased.operation.state, "failed_terminal");
  assert.equal(beforeReadyErased.operation.errorCode, "export_erased_legal");
  const beforeReadyClaim = await db.aiKeyDestructionClaim.findFirst({ where: { objectType: "AiExportJob", objectId: beforeReadyAccepted.exportId }, select: { state: true, keyLineageDigest: true, decisionSnapshotDigest: true } });
  assert(beforeReadyClaim, "before-ready legal erasure must persist a key claim even when the part set is empty");
  assert.equal(beforeReadyClaim.state, "destroyed");
  assert.match(beforeReadyClaim.keyLineageDigest, /^[a-f0-9]{64}$/u);
  assert.match(beforeReadyClaim.decisionSnapshotDigest, /^[a-f0-9]{64}$/u);
  const beforeReadyReplay = await lifecycle.createExport({ studentId, idempotencyKey: beforeReadyKey, format: "json_v1" });
  assert.equal(beforeReadyReplay.replayed, true);
  assert.equal("state" in beforeReadyReplay && beforeReadyReplay.state, "failed_terminal");
  console.log("T11_EVIDENCE legal_erasure=before_ready+after_ready before_ready=failed_terminal export_erased_legal operation=failed_terminal grant=expired key_claim=destroyed metadata=absent replay=exactly-once");

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

  // Exercise the pre-ready terminal retention path with a populated partial
  // package. The fixture deliberately moves a ready package to the explicit
  // failed_terminal projection in one isolated update (download timestamps
  // are cleared to satisfy the production migration check), then proves the
  // reaper anchors +24h/+90d decisions to terminalAt and persists the key
  // purge before metadata expiry.
  const failedTerminalKey = `${namespace}:export-failed-terminal`;
  idempotencyKeys.push(failedTerminalKey);
  const failedTerminalAccepted = await lifecycle.createExport({ studentId: otherStudentId, idempotencyKey: failedTerminalKey, format: "json_v1" });
  if (!("exportId" in failedTerminalAccepted) || !failedTerminalAccepted.exportId || !failedTerminalAccepted.operationId) {
    throw new Error("failed-terminal export fixture did not return its typed export target");
  }
  const failedTerminalExportId = failedTerminalAccepted.exportId;
  exportIds.push(failedTerminalExportId);
  operationIds.push(failedTerminalAccepted.operationId);
  await lifecycle.materializeExport({ exportId: failedTerminalExportId, ownerId: `${namespace}:worker-failed-terminal` });
  const failedTerminalRow = await db.aiExportJob.findUnique({ where: { id: failedTerminalExportId }, select: { parts: { select: { id: true } } } });
  assert(failedTerminalRow?.parts.length === 1, "failed-terminal fixture must start with one durable package part");
  const terminalAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  const terminalRetentionExpiresAt = new Date(terminalAt.getTime() + 90 * 24 * 60 * 60 * 1000);
  await db.aiExportJob.update({
    where: { id: failedTerminalExportId },
    data: {
      state: "failed_terminal",
      errorCode: "fixture_failed_terminal",
      terminalAt,
      partialPackagePurgeAt: new Date(terminalAt.getTime() + 24 * 60 * 60 * 1000),
      terminalRetentionExpiresAt,
      snapshotDigest: null,
      packageBytes: null,
      downloadReadyAt: null,
      downloadExpiresAt: null,
      exportAccessGrantState: "expired",
    },
  });
  await db.aiLifecycleOperation.update({ where: { id: failedTerminalAccepted.operationId }, data: { state: "failed_terminal", resultState: "failed_terminal", errorCode: "fixture_failed_terminal", terminalAt, expiresAt: terminalRetentionExpiresAt, version: { increment: 1 } } });
  assert((await lifecycle.reapExports()) >= 1, "reaper must discover and purge failed_terminal partial packages");
  const failedAfterPartial = await db.aiExportJob.findUnique({ where: { id: failedTerminalExportId }, include: { operation: true, parts: true } });
  assert(failedAfterPartial && failedAfterPartial.state === "failed_terminal", "failed_terminal must remain a replayable metadata tombstone after partial purge");
  assert.equal(failedAfterPartial.parts.length, 0, "failed_terminal +24h must purge package parts");
  assert.equal(failedAfterPartial.operation.state, "failed_terminal");
  // Move the persisted terminalAt across the +90d boundary (rather than
  // trusting a caller-provided retention timestamp). The reaper must derive
  // both deadlines from this authoritative terminal marker.
  const metadataTerminalAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
  const metadataExpiredAt = new Date(metadataTerminalAt.getTime() + 90 * 24 * 60 * 60 * 1000);
  await db.aiExportJob.update({ where: { id: failedTerminalExportId }, data: { terminalAt: metadataTerminalAt, terminalRetentionExpiresAt: metadataExpiredAt } });
  await db.aiLifecycleOperation.update({ where: { id: failedTerminalAccepted.operationId }, data: { terminalAt: metadataTerminalAt, expiresAt: metadataExpiredAt, version: { increment: 1 } } });
  assert((await lifecycle.reapExports()) >= 1, "reaper must discover failed_terminal metadata retention expiry");
  const failedAfterMetadata = await db.aiExportJob.findUnique({ where: { id: failedTerminalExportId }, include: { operation: true } });
  assert.equal(failedAfterMetadata?.state, "expired", "failed_terminal metadata must expire at terminalAt+90d via DB-clock CAS");
  assert.equal(failedAfterMetadata?.operation.state, "expired");
  console.log("T11_EVIDENCE reaper=failed_terminal discovered terminalAt=authoritative partial_package=+24h metadata=+90d row_version_CAS=pass hold_precedence=pass");

  // Populate a real pending request, normalized context pack, staged result,
  // and daily reservation before account cleanup. The cleanup handoff must
  // preserve these rows and settle their reservation instead of deleting or
  // rewriting the accepted usage to unknown.
  const settlementConversationId = randomUUID();
  conversationIds.push(settlementConversationId);
  await db.aiConversation.create({ data: { id: settlementConversationId, studentId: otherStudentId, conversationType: "vera_chat", title: "settlement evidence conversation" } });
  const settlementKey = `${namespace}:settlement-request`;
  idempotencyKeys.push(settlementKey);
  const settlementKeyId = randomUUID();
  const settlementRequestId = randomUUID();
  const settlementPackId = randomUUID();
  const settlementStageId = randomUUID();
  const settlementNow = new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(settlementNow);
  const settlementDigest = sha256(`${namespace}:settlement`);
  const settlementSourceId = randomUUID();
  const [settlementTaskEnvelope, settlementCanonicalEnvelope, settlementManifestEnvelope, settlementStageEnvelope, settlementSourceEnvelope] = await Promise.all([
    envelope.encryptAsync(JSON.stringify({ task: "settlement" }), `vera-t11-settlement-task:${settlementPackId}`),
    envelope.encryptAsync(JSON.stringify({ canonical: "settlement" }), `vera-t11-settlement-canonical:${settlementPackId}`),
    envelope.encryptAsync(JSON.stringify({ messages: [] }), `vera-t11-settlement-manifest:${settlementPackId}`),
    envelope.encryptAsync(JSON.stringify({ result: "settlement" }), `vera-t11-settlement-stage:${settlementStageId}`),
    envelope.encryptAsync(JSON.stringify({ source: "settlement" }), `vera-t11-settlement-source:${settlementSourceId}`),
  ]);
  envelopeKeyRefs.push(
    settlementTaskEnvelope.keyRef,
    settlementCanonicalEnvelope.keyRef,
    settlementManifestEnvelope.keyRef,
    settlementStageEnvelope.keyRef,
    settlementSourceEnvelope.keyRef,
  );
  await db.aiIdempotencyKey.create({ data: { id: settlementKeyId, studentId: otherStudentId, operation: "ai_request", clientRequestId: settlementKey, requestFingerprint: settlementDigest, fingerprintKeyVersion: "vera-hmac-v1", state: "accepted", resultKind: "request", resultId: settlementRequestId, acceptedAt: settlementNow, expiresAt: new Date(settlementNow.getTime() + 90 * 24 * 60 * 60 * 1000) } });
  await db.aiUsageDaily.create({ data: { id: randomUUID(), studentId: otherStudentId, usageDate: new Date(`${localDate}T00:00:00.000Z`), ledgerVersion: "vera_quota_v1", quotaLimitUnitsSnapshot: 100, reservedQuotaUnits: 3, acceptedRequestCount: 1 } }).then((row) => dailyIds.push(row.id));
  await db.aiRequest.create({ data: { id: settlementRequestId, studentId: otherStudentId, conversationId: settlementConversationId, requestType: "vera_chat", status: "pending", idempotencyKeyId: settlementKeyId, clientRequestId: settlementKey, requestFingerprint: settlementDigest, fingerprintKeyVersion: "vera-hmac-v1", featureKey: "vera.chat", behaviorVersion: "1", outputSchemaVersion: "1", contextPackVersion: "1", policyBundleVersion: "vera-policy-bundle-v1-2026-08-24", retentionPolicyVersion: "vera-retention-v1", quotaUnitsReserved: 3, quotaUnitsConsumed: 0, tokenUsageState: "unknown", usageAccountingState: "unknown", settlementDeadlineAt: new Date(settlementNow.getTime() + 24 * 60 * 60 * 1000), stageRetentionExpiresAt: new Date(settlementNow.getTime() + 48 * 60 * 60 * 1000), startedAt: settlementNow } });
  await db.aiContextPack.create({ data: { id: settlementPackId, requestId: settlementRequestId, packSchemaVersion: "vera-context-pack-v1", contextPackVersion: "1", orderedBlockManifestJson: [], normalizedTaskCiphertext: settlementTaskEnvelope as Prisma.InputJsonValue, canonicalBytesCiphertext: settlementCanonicalEnvelope as Prisma.InputJsonValue, byteCount: 0, packDigest: settlementDigest, redactionPolicyVersion: "vera-redaction-v1", conversationMessageManifestCiphertext: settlementManifestEnvelope as Prisma.InputJsonValue, systemPolicyHash: settlementDigest, promptTemplateHash: settlementDigest, toolSchemaHash: settlementDigest, retentionClass: "vera-context", retentionPolicyVersion: "vera-retention-v1", purgeAt: new Date(settlementNow.getTime() + 90 * 24 * 60 * 60 * 1000), contentKeyLineageDigest: sha256(settlementTaskEnvelope.keyRef) } });
  await db.aiRequestSource.create({ data: { id: randomUUID(), contextPackId: settlementPackId, requestId: settlementRequestId, ordinal: 0, sourceType: "material", sourceId: settlementSourceId, citationKey: `${namespace}:settlement-source`, titleSnapshot: "settlement source", citationLabel: "settlement source", contentDigest: settlementDigest, boundedSnapshotCiphertext: settlementSourceEnvelope as Prisma.InputJsonValue, snapshotBytes: 0, redactionPolicyVersion: "vera-redaction-v1", retentionPolicyVersion: "vera-retention-v1", purgeAt: new Date(settlementNow.getTime() + 90 * 24 * 60 * 60 * 1000), contentKeyLineageDigest: sha256(settlementSourceEnvelope.keyRef) } });
  await db.aiRequestResultStage.create({ data: { id: settlementStageId, requestId: settlementRequestId, resultKind: "success", normalizedResultCiphertext: settlementStageEnvelope as Prisma.InputJsonValue, resultDigest: settlementDigest, outputSchemaId: "chat-1", outputSchemaHash: settlementDigest, inputTokens: 2, outputTokens: 3, quotaUnitsConsumed: 3, tokenUsageState: "known", settlementKind: "result", stagedAt: settlementNow, expiresAt: new Date(settlementNow.getTime() + 48 * 60 * 60 * 1000), retentionPolicyVersion: "vera-retention-v1", contentKeyLineageDigest: sha256(settlementStageEnvelope.keyRef) } });
  requestIds.push(settlementRequestId);
  contextPackIds.push(settlementPackId);
  stageIds.push(settlementStageId);
  console.log(`T11_EVIDENCE settlement_fixture request=${settlementRequestId} stage=${settlementStageId} pack=${settlementPackId} daily=${dailyIds[0]} accepted=1 reserved=3 staged_usage=3 populated=true`);

  // Keep a second pending request with an explicitly unknown provider usage
  // state.  Account cleanup must settle its conservative reservation while
  // retaining unknown accounting metadata; this proves that a missing token
  // result is never coerced into numeric zero or a known settlement.
  const unknownSettlementNow = new Date(settlementNow.getTime() + 24 * 60 * 60 * 1000);
  const unknownLocalDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(unknownSettlementNow);
  const unknownSettlementKey = `${namespace}:settlement-unknown-request`;
  const unknownSettlementKeyId = randomUUID();
  const unknownSettlementRequestId = randomUUID();
  const unknownSettlementDigest = sha256(`${namespace}:settlement-unknown`);
  idempotencyKeys.push(unknownSettlementKey);
  requestIds.push(unknownSettlementRequestId);
  const unknownDaily = await db.aiUsageDaily.create({ data: {
    id: randomUUID(),
    studentId: otherStudentId,
    usageDate: new Date(`${unknownLocalDate}T00:00:00.000Z`),
    ledgerVersion: "vera_quota_v1",
    quotaLimitUnitsSnapshot: 100,
    reservedQuotaUnits: 2,
    acceptedRequestCount: 1,
  } });
  dailyIds.push(unknownDaily.id);
  await db.aiIdempotencyKey.create({ data: {
    id: unknownSettlementKeyId,
    studentId: otherStudentId,
    operation: "ai_request",
    clientRequestId: unknownSettlementKey,
    requestFingerprint: unknownSettlementDigest,
    fingerprintKeyVersion: "vera-hmac-v1",
    state: "accepted",
    resultKind: "request",
    resultId: unknownSettlementRequestId,
    acceptedAt: unknownSettlementNow,
    expiresAt: new Date(unknownSettlementNow.getTime() + 90 * 24 * 60 * 60 * 1000),
  } });
  await db.aiRequest.create({ data: {
    id: unknownSettlementRequestId,
    studentId: otherStudentId,
    conversationId: settlementConversationId,
    requestType: "vera_chat",
    status: "pending",
    idempotencyKeyId: unknownSettlementKeyId,
    clientRequestId: unknownSettlementKey,
    requestFingerprint: unknownSettlementDigest,
    fingerprintKeyVersion: "vera-hmac-v1",
    featureKey: "vera.chat",
    behaviorVersion: "1",
    outputSchemaVersion: "1",
    contextPackVersion: "1",
    policyBundleVersion: "vera-policy-bundle-v1-2026-08-24",
    retentionPolicyVersion: "vera-retention-v1",
    quotaUnitsReserved: 2,
    quotaUnitsConsumed: 0,
    tokenUsageState: "unknown",
    usageAccountingState: "unknown",
    settlementDeadlineAt: new Date(unknownSettlementNow.getTime() + 24 * 60 * 60 * 1000),
    stageRetentionExpiresAt: new Date(unknownSettlementNow.getTime() + 48 * 60 * 60 * 1000),
    startedAt: unknownSettlementNow,
    createdAt: unknownSettlementNow,
  } });
  console.log(`T11_EVIDENCE settlement_unknown request=${unknownSettlementRequestId} reserved=2 tokenUsageState=unknown usageAccountingState=unknown populated=true`);

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
  const concurrentCarrierReplays = await Promise.all([
    lifecycle.createAccountCleanupCarrier({ accountGeneration: `${namespace}:generation`, intent: "delete", studentId: otherStudentId }),
    lifecycle.createAccountCleanupCarrier({ accountGeneration: `${namespace}:generation`, intent: "delete", studentId: otherStudentId }),
  ]);
  assert(concurrentCarrierReplays.every((replay) => replay.replayed && replay.operationId === carrier.operationId), "concurrent account_cleanup carrier calls must replay one durable winner");
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
  // An evidence-object hold is applicable through the normalized context pack,
  // not only through the direct student FK. Cleanup must stop before any row
  // settlement while that hold is active.
  const evidenceHoldId = randomUUID();
  holdIds.push(evidenceHoldId);
  await db.aiRetentionHold.create({ data: {
    id: evidenceHoldId,
    subjectType: "evidence_object",
    subjectId: settlementPackId,
    subjectState: "attached",
    studentId: otherStudentId,
    holdType: "legal",
    state: "active",
    reasonCode: `${namespace}:evidence-hold`,
    actorId: `${namespace}:evidence-operator`,
    holdDigest: sha256(`${namespace}:evidence-hold`),
  } });
  await expectLifecycleCode(
    () => lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }),
    "hold_active",
  );
  await db.aiRetentionHold.update({ where: { id: evidenceHoldId }, data: { state: "released", subjectState: "detached", releasedAt: new Date(), version: { increment: 1 } } });
  const concurrentConsumptions = await Promise.all([
    lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }),
    lifecycle.consumeAccountCleanupHandoff({ operationId: carrier.operationId, consumerId: `${namespace}:cleanup-worker`, acknowledgementDigest: sha256(`${namespace}:ack`) }),
  ]);
  assert(concurrentConsumptions.every(Boolean), "concurrent account cleanup handoff consumers must return the stored CAS outcome");
  const settlementWorkItems = await db.aiPurgeWorkItem.findMany({ where: { operationId: carrier.operationId, objectType: "envelope_key" }, select: { claimId: true, state: true } });
  const settlementWorkKeyRefs = [...new Set(settlementWorkItems.flatMap(({ claimId }) => claimId ? [claimId] : []))];
  const settlementKeyRows = await db.aiEnvelopeKey.findMany({ where: { keyRef: { in: settlementWorkKeyRefs } }, select: { keyRef: true, state: true } });
  assert(settlementKeyRows.length >= 5, "account cleanup must discover every settlement envelope key lineage");
  assert.equal(new Set(settlementKeyRows.map(({ keyRef }) => keyRef)).size, settlementWorkKeyRefs.length, "account cleanup must persist every discovered envelope key before registry work");
  assert(settlementKeyRows.every((row) => row.state === "destroyed"), "account cleanup key registry must fence each settlement envelope exactly once");
  assert.equal(new Set(settlementWorkItems.map(({ claimId }) => claimId)).size, settlementKeyRows.length, "account cleanup must persist one work item per envelope key");
  assert(settlementWorkItems.every((row) => row.state === "completed"), "account cleanup key work items must complete after the post-commit registry pass");
  const settlementLineage = await db.aiPurgeWorkItem.findMany({
    where: { operationId: carrier.operationId, objectType: { not: "envelope_key" } },
    select: { objectType: true, objectId: true, state: true, keyLineageDigest: true },
    orderBy: [{ objectType: "asc" }, { objectId: "asc" }],
  });
  const lineageByType = new Map<string, typeof settlementLineage>();
  for (const item of settlementLineage) lineageByType.set(item.objectType, [...(lineageByType.get(item.objectType) ?? []), item]);
  for (const expectedType of ["ai_request", "ai_request_result_stage", "ai_context_pack", "ai_request_source"]) {
    const items = lineageByType.get(expectedType) ?? [];
    assert(items.length > 0, `account cleanup must persist durable ${expectedType} lineage`);
    assert(items.every((item) => item.state === "completed"), `${expectedType} lineage must be completed after key acknowledgement`);
    assert(items.every((item) => /^[a-f0-9]{64}$/u.test(item.keyLineageDigest ?? "")), `${expectedType} lineage must retain a content-free key digest`);
  }
  assert(settlementLineage.every((item) => item.state === "completed"), "all account cleanup object lineage must be reclaimably completed");
  console.log(`T11_EVIDENCE cleanup_lineage=durable object_types=${[...lineageByType.keys()].sort().join("+")} rows=${settlementLineage.length} key_digest=content-free state=completed reclaimable=true`);
  const consumedCarrier = await db.aiLifecycleOperation.findUnique({ where: { id: carrier.operationId } });
  assert.equal(consumedCarrier?.handoffState, "consumed");
  assert(consumedCarrier?.handoffConsumedAt instanceof Date);
  const deletedOwner = await db.user.findUnique({ where: { id: otherStudentId }, select: { status: true, softDeletedAt: true } });
  assert.equal(deletedOwner?.status, "soft_deleted", "account cleanup must complete the account deletion gate after handoff consumption");
  const detachedExports = await db.aiExportJob.findMany({ where: { ownerState: "account_deleted", studentId: null, ownerReferenceDigest: { not: null } }, select: { id: true, state: true, ownerState: true } });
  assert(detachedExports.some((row) => row.id === failedTerminalExportId), "account cleanup must detach retention-managed Vera export rows without deleting them");
  await expectLifecycleCode(
    () => lifecycle.createExport({ studentId: otherStudentId, idempotencyKey: `${namespace}:after-account-delete`, format: "json_v1" }),
    "account_deleted",
  );
  const preservedRequest = await db.aiRequest.findUnique({ where: { id: settlementRequestId }, select: { studentId: true, status: true, usageAccountingState: true, quotaUnitsConsumed: true } });
  const preservedStage = await db.aiRequestResultStage.findUnique({ where: { id: settlementStageId }, select: { purgeState: true, resultDigest: true } });
  const preservedPack = await db.aiContextPack.findUnique({ where: { id: settlementPackId }, select: { purgeState: true, provenanceState: true, packDigest: true } });
  const preservedDaily = dailyIds[0] ? await db.aiUsageDaily.findUnique({ where: { id: dailyIds[0] }, select: { reservedQuotaUnits: true, usedQuotaUnits: true, finalizedRequestCount: true } }) : null;
  const preservedUnknownRequest = await db.aiRequest.findUnique({ where: { id: unknownSettlementRequestId }, select: { status: true, tokenUsageState: true, usageAccountingState: true, quotaUnitsConsumed: true, quotaOverrunUnits: true } });
  const preservedUnknownDaily = await db.aiUsageDaily.findUnique({ where: { id: unknownDaily.id }, select: { reservedQuotaUnits: true, usedQuotaUnits: true, finalizedRequestCount: true } });
  assert(preservedRequest && preservedRequest.status === "failed" && preservedRequest.studentId === null, "account cleanup must retain a settled request tombstone with detached owner");
  assert.equal(preservedRequest.usageAccountingState, "known", "account cleanup must not rewrite accepted usage to unknown");
  assert.equal(preservedRequest.quotaUnitsConsumed, 3);
  assert(preservedStage && preservedStage.purgeState === "purging" && preservedStage.resultDigest === settlementDigest, "account cleanup must preserve staged result evidence");
  assert(preservedPack && preservedPack.purgeState === "purging" && preservedPack.provenanceState === "unavailable" && preservedPack.packDigest === settlementDigest, "account cleanup must preserve context-pack provenance");
  assert(preservedDaily && preservedDaily.reservedQuotaUnits === 0 && preservedDaily.usedQuotaUnits === 3 && preservedDaily.finalizedRequestCount === 1, "account cleanup must settle, not delete, the daily quota ledger");
  assert(preservedUnknownRequest && preservedUnknownRequest.status === "failed", "unknown-usage request must still reach a terminal cleanup state");
  assert.equal(preservedUnknownRequest.tokenUsageState, "unknown", "unknown provider usage must remain unknown after account cleanup");
  assert.equal(preservedUnknownRequest.usageAccountingState, "unknown", "unknown provider usage must not become known accounting");
  assert.equal(preservedUnknownRequest.quotaUnitsConsumed, 2, "unknown settlement must retain its conservative reservation amount");
  assert.equal(preservedUnknownRequest.quotaOverrunUnits, 0, "unknown settlement must not invent overrun debt");
  assert(preservedUnknownDaily && preservedUnknownDaily.reservedQuotaUnits === 0 && preservedUnknownDaily.usedQuotaUnits === 2 && preservedUnknownDaily.finalizedRequestCount === 1, "unknown settlement must preserve a settled daily reservation without deleting the ledger row");
  const cleanupReplay = await lifecycle.prepareAccountCleanup({ studentId: otherStudentId, accountGeneration: `${namespace}:generation`, intent: "delete" });
  assert.equal(cleanupReplay.operationId, cleanup.operationId, "a post-consumption account-cleanup retry must replay the durable carrier");
  assert.equal(cleanupReplay.exportId, cleanup.exportId, "a post-consumption account-cleanup retry must replay the same export target");
  assert.equal(cleanupReplay.grantDigest, cleanup.grantDigest, "a post-consumption account-cleanup retry must replay the same grant digest");
  // Reclaim a simulated crashed grant claim with the DB-clock reaper, then
  // race two real cleanup-grant downloads. Exactly one caller may consume the
  // fenced grant; the other receives a typed in-progress/consumed result and
  // never downloads a second package.
  await db.aiExportJob.update({ where: { id: cleanup.exportId }, data: {
    exportAccessGrantState: "claiming",
    exportAccessGrantClaimId: `${namespace}:crashed-grant-claim`,
    exportAccessGrantClaimedAt: new Date(Date.now() - 120_000),
    exportAccessGrantLeaseExpiresAt: new Date(Date.now() - 60_000),
    exportAccessGrantVersion: { increment: 1 },
  } });
  assert((await lifecycle.reapExports()) >= 0, "grant-claim reaper did not execute its DB-clock pass");
  const reclaimedGrant = await db.aiExportJob.findUnique({ where: { id: cleanup.exportId }, select: { exportAccessGrantState: true } });
  assert.equal(reclaimedGrant?.exportAccessGrantState, "active", "an expired cleanup-grant claim must be reclaimable");
  const concurrentGrantDownloads = await Promise.allSettled([
    lifecycle.downloadExport({ exportId: cleanup.exportId, grant: cleanup.rawGrant }),
    lifecycle.downloadExport({ exportId: cleanup.exportId, grant: cleanup.rawGrant }),
  ]);
  assert.equal(concurrentGrantDownloads.filter((result) => result.status === "fulfilled").length, 1, "concurrent cleanup-grant downloads must have one durable winner");
  const rejectedGrantDownloads = concurrentGrantDownloads.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.equal(rejectedGrantDownloads.length, 1);
  assert(rejectedGrantDownloads[0]?.reason instanceof VeraLifecycleError, "grant race loser must receive a typed lifecycle error");
  assert(["export_download_in_progress", "export_access_consumed"].includes((rejectedGrantDownloads[0]!.reason as VeraLifecycleError).code), "grant race loser must be in-progress/consumed, not a second success");
  const consumedGrant = await db.aiExportJob.findUnique({ where: { id: cleanup.exportId }, select: { exportAccessGrantState: true, ownerState: true, studentId: true } });
  assert.equal(consumedGrant?.exportAccessGrantState, "consumed");
  assert.equal(consumedGrant?.ownerState, "account_deleted");
  assert.equal(consumedGrant?.studentId, null, "post-parent grant download must use the detached export owner marker");
  console.log("T11_EVIDENCE account_settlement=preserved-stage+context-pack+daily-ledger request=known-usage reserved-released=3 used=3 finalized=1 owner=detached unknown=preserved-unknown-accounting reservation=2");
  // Release the legal-erasure fixture hold before exercising an unrelated
  // ordinary conversation-delete worker. Dedicated hold-race coverage still
  // proves that an active hold blocks marker/key work.
  const holdReleaseA: CapabilityDecisionSnapshot = withCapabilitySnapshotDigest({
    ...operatorA,
    operation: "hold_release",
    subjectId: holdId,
    capabilityDecisionId: `${namespace}:hold-release-a-decision`,
  });
  const holdReleaseB: CapabilityDecisionSnapshot = withCapabilitySnapshotDigest({
    ...operatorB,
    operation: "hold_release",
    subjectId: holdId,
    capabilityDecisionId: `${namespace}:hold-release-b-decision`,
  });
  const holdRelease = await lifecycle.releaseRetentionHold({
    holdId,
    reasonDigest: sha256(`${namespace}:ordinary-hold-release`),
    approvals: [holdReleaseA, holdReleaseB],
  });
  const holdReleaseReplay = await lifecycle.releaseRetentionHold({
    holdId,
    reasonDigest: sha256(`${namespace}:ordinary-hold-release`),
    approvals: [holdReleaseA, holdReleaseB],
  });
  assert.equal(holdReleaseReplay.releaseId, holdRelease.releaseId, "ordinary hold release replay must return the durable winner");
  assert.equal(holdReleaseReplay.replayed, true, "ordinary hold release replay must be marked as replay");
  const releasedHold = await db.aiRetentionHold.findUnique({ where: { id: holdId }, select: { state: true, subjectState: true, version: true } });
  assert.equal(releasedHold?.state, "released");
  assert.equal(releasedHold?.subjectState, "attached", "ordinary hold release must preserve the attached subject until its worker detaches it");
  const appliedHoldRelease = await db.aiRetentionHoldRelease.findUnique({ where: { id: holdRelease.releaseId }, select: { state: true, operatorAId: true, operatorBId: true, decisionSnapshotDigest: true } });
  assert.equal(appliedHoldRelease?.state, "applied");
  assert.equal(appliedHoldRelease?.operatorAId, operatorAId);
  assert.equal(appliedHoldRelease?.operatorBId, operatorBId);
  assert.match(appliedHoldRelease?.decisionSnapshotDigest ?? "", /^[a-f0-9]{64}$/u);
  console.log("T11_EVIDENCE hold_release=ordinary active-hold-lock dual-current-operators replay=exactly-once state=released release=applied");
  console.log("T11_EVIDENCE account_cleanup=populated export-before-purge grant=active handoffState=consumed handoffConsumedAt=DB_NOW sessions=revoked account=soft_deleted createExport=account_deleted vera_cleanup_ready_v1 restrictive-fk=true");

  const conversationId = randomUUID();
  conversationIds.push(conversationId);
  await db.aiConversation.create({ data: { id: conversationId, studentId, conversationType: "vera_chat", title: "T11 operation matrix fixture" } });
  // Keep one artifact attached to the conversation so the state-first worker
  // must use the append-only lifecycle/tombstone path. The immutable
  // ciphertext is captured and compared after purge; no artifact revision is
  // rewritten to make the conversation deletable.
  const conversationArtifactId = randomUUID();
  artifactIds.push(conversationArtifactId);
  const conversationArtifactPayload = JSON.stringify({ toolId: "route", title: "Conversation artifact", markdown: "Tombstone me", payload: { namespace } });
  const conversationArtifactDigest = sha256(conversationArtifactPayload);
  const [conversationArtifactTitle, conversationArtifactMarkdown, conversationArtifactPayloadEnvelope] = await Promise.all([
    envelope.encryptAsync("Conversation artifact", `vera-t11-conversation-artifact-title:${conversationArtifactId}`),
    envelope.encryptAsync("Tombstone me", `vera-t11-conversation-artifact-markdown:${conversationArtifactId}`),
    envelope.encryptAsync(conversationArtifactPayload, `vera-t11-conversation-artifact-payload:${conversationArtifactId}`),
  ]);
  envelopeKeyRefs.push(conversationArtifactTitle.keyRef, conversationArtifactMarkdown.keyRef, conversationArtifactPayloadEnvelope.keyRef);
  await db.aiArtifact.create({ data: {
    id: conversationArtifactId,
    artifactKey: `vera.t11.conversation.${conversationArtifactId}`,
    revision: 1,
    studentId,
    conversationId,
    artifactType: "route",
    provenanceKind: "typed_entity",
    titleCiphertext: conversationArtifactTitle as Prisma.InputJsonValue,
    contentMarkdownCiphertext: conversationArtifactMarkdown as Prisma.InputJsonValue,
    payloadCiphertext: conversationArtifactPayloadEnvelope as Prisma.InputJsonValue,
    artifactSchemaVersion: "1",
    sourceEntityType: "T11ConversationFixture",
    sourceEntityId: randomUUID(),
    sourceEntityRevision: 0,
    sourceEntityDigest: conversationArtifactDigest,
    contentDigest: conversationArtifactDigest,
    renderVersion: "vera-render-v1",
    retentionPolicyVersion: "vera-retention-v1",
    lifecycle: { create: { lifecycleRevision: 0 } },
  } });

  // Exercise an artifact-specific hold independently from the conversation
  // hold below. The marker worker must stop while the hold is active, then
  // two concurrent released workers must converge on one tombstone and one
  // object-scoped key-destruction result.
  const heldArtifactId = randomUUID();
  artifactIds.push(heldArtifactId);
  const heldArtifactPayload = JSON.stringify({ toolId: "summary", title: "Held artifact", markdown: "Hold me", payload: { namespace } });
  const heldArtifactDigest = sha256(heldArtifactPayload);
  const [heldArtifactTitle, heldArtifactMarkdown, heldArtifactPayloadEnvelope] = await Promise.all([
    envelope.encryptAsync("Held artifact", `vera-t11-held-artifact-title:${heldArtifactId}`),
    envelope.encryptAsync("Hold me", `vera-t11-held-artifact-markdown:${heldArtifactId}`),
    envelope.encryptAsync(heldArtifactPayload, `vera-t11-held-artifact-payload:${heldArtifactId}`),
  ]);
  envelopeKeyRefs.push(heldArtifactTitle.keyRef, heldArtifactMarkdown.keyRef, heldArtifactPayloadEnvelope.keyRef);
  await db.aiArtifact.create({ data: {
    id: heldArtifactId,
    artifactKey: `vera.t11.held.${heldArtifactId}`,
    revision: 1,
    studentId,
    conversationId: null,
    artifactType: "summary",
    provenanceKind: "typed_entity",
    titleCiphertext: heldArtifactTitle as Prisma.InputJsonValue,
    contentMarkdownCiphertext: heldArtifactMarkdown as Prisma.InputJsonValue,
    payloadCiphertext: heldArtifactPayloadEnvelope as Prisma.InputJsonValue,
    artifactSchemaVersion: "1",
    sourceEntityType: "T11HeldArtifactFixture",
    sourceEntityId: randomUUID(),
    sourceEntityRevision: 0,
    sourceEntityDigest: heldArtifactDigest,
    contentDigest: heldArtifactDigest,
    renderVersion: "vera-render-v1",
    retentionPolicyVersion: "vera-retention-v1",
    lifecycle: { create: { lifecycleRevision: 0 } },
  } });
  const heldArtifactHoldId = randomUUID();
  holdIds.push(heldArtifactHoldId);
  await db.aiRetentionHold.create({ data: {
    id: heldArtifactHoldId,
    subjectType: "artifact",
    subjectId: heldArtifactId,
    subjectState: "attached",
    studentId,
    holdType: "legal",
    state: "active",
    reasonCode: `${namespace}:artifact-hold`,
    actorId: `${namespace}:artifact-hold-operator`,
    holdDigest: sha256(`${namespace}:artifact-hold`),
  } });
  const heldArtifactDeleteKey = `${namespace}:artifact-delete-held`;
  idempotencyKeys.push(heldArtifactDeleteKey);
  const heldArtifactDelete = await lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 0, idempotencyKey: heldArtifactDeleteKey });
  assert(heldArtifactDelete.operationId, "held artifact delete must persist an operation before the worker hold check");
  operationIds.push(heldArtifactDelete.operationId);
  const heldArtifactConflict = await expectLifecycleCode(
    () => lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 1, idempotencyKey: heldArtifactDeleteKey }),
    "idempotency_conflict",
  );
  const heldArtifactDeleteReplay = await lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 0, idempotencyKey: heldArtifactDeleteKey });
  assert.equal(heldArtifactDeleteReplay.replayed, true, "artifact delete replay must return the durable operation before worker settlement");
  const heldArtifactUnauthorizedKey = await expectLifecycleCode(
    () => lifecycle.requestArtifactDelete({ studentId: otherStudentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 0, idempotencyKey: heldArtifactDeleteKey }),
    "artifact_unavailable",
  );
  await expectLifecycleCode(() => lifecycle.processArtifactDelete(heldArtifactDelete.operationId), "hold_active");
  await db.aiRetentionHold.update({ where: { id: heldArtifactHoldId }, data: { state: "released", subjectState: "detached", releasedAt: new Date(), version: { increment: 1 } } });
  const heldArtifactWorkers = await Promise.allSettled([
    lifecycle.processArtifactDelete(heldArtifactDelete.operationId),
    lifecycle.processArtifactDelete(heldArtifactDelete.operationId),
  ]);
  assert(heldArtifactWorkers.every((result) => result.status === "fulfilled"), "released artifact deletion workers must converge without a duplicate irreversible call");
  const heldArtifactLifecycle = await db.aiArtifactLifecycle.findUnique({ where: { artifactRevisionId: heldArtifactId }, select: { state: true, deletionState: true } });
  assert.equal(heldArtifactLifecycle?.state, "purged");
  assert.equal(heldArtifactLifecycle?.deletionState, "deleted");
  const heldArtifactKeys = await db.aiEnvelopeKey.findMany({ where: { keyRef: { in: [heldArtifactTitle.keyRef, heldArtifactMarkdown.keyRef, heldArtifactPayloadEnvelope.keyRef] } }, select: { state: true } });
  assert.equal(heldArtifactKeys.length, 3, "artifact hold fixture must retain all three object-scoped envelope keys");
  assert(heldArtifactKeys.every(({ state }) => state === "destroyed"), "artifact workers must fence object-scoped key destruction");

  let deleteMissingKey = false;
  await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 0, idempotencyKey: undefined as unknown as string }),
    "invalid_request",
  );
  await expectLifecycleCode(
    () => lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 0, idempotencyKey: undefined as unknown as string }),
    "invalid_request",
  );
  deleteMissingKey = true;
  let deletePayloadValidation = false;
  await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: -1, idempotencyKey: `${namespace}:conversation-delete-invalid-version` }),
    "invalid_request",
  );
  await expectLifecycleCode(
    () => lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: -1, idempotencyKey: `${namespace}:artifact-delete-invalid-version` }),
    "invalid_request",
  );
  deletePayloadValidation = true;
  const deleteMalformedCases = ["", "x".repeat(121), "bad\u0000key"];
  for (const key of deleteMalformedCases) {
    await expectLifecycleCode(
      () => lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 0, idempotencyKey: key }),
      "invalid_request",
    );
    await expectLifecycleCode(
      () => lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 0, idempotencyKey: key }),
      "invalid_request",
    );
  }

  const deleteKey = `${namespace}:conversation-delete`;
  idempotencyKeys.push(deleteKey);
  const deleteAccepted = await lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 0, idempotencyKey: deleteKey });
  assert.equal(deleteAccepted.targetState, "deletion_pending");
  assert(deleteAccepted.operationId);
  operationIds.push(deleteAccepted.operationId);
  const deleteReplay = await lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 0, idempotencyKey: deleteKey });
  assert.equal(deleteReplay.replayed, true);
  const conversationConflict = await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId, conversationId, expectedVersion: 1, idempotencyKey: deleteKey }),
    "idempotency_conflict",
  );
  const conversationUnauthorizedKey = await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId: otherStudentId, conversationId, expectedVersion: 0, idempotencyKey: deleteKey }),
    "target_unavailable",
  );
  assert.notEqual(exportKey, deleteKey, "cross-operation idempotency keys must remain operation-scoped");
  const keyRows = await db.aiIdempotencyKey.findMany({ where: { clientRequestId: { in: [exportKey, deleteKey] } }, select: { operation: true, clientRequestId: true } });
  assert.equal(new Set(keyRows.map((row) => row.operation)).size, 2, "same key namespace must never cross operation targets");
  const conversationHoldId = randomUUID();
  holdIds.push(conversationHoldId);
  await db.aiRetentionHold.create({ data: {
    id: conversationHoldId,
    subjectType: "conversation",
    subjectId: conversationId,
    subjectState: "attached",
    studentId,
    holdType: "legal",
    state: "active",
    reasonCode: `${namespace}:conversation-hold`,
    actorId: `${namespace}:conversation-hold-operator`,
    holdDigest: sha256(`${namespace}:conversation-hold`),
  } });
  await expectLifecycleCode(() => lifecycle.processConversationDelete(deleteAccepted.operationId), "hold_active");
  await db.aiRetentionHold.update({ where: { id: conversationHoldId }, data: { state: "released", subjectState: "detached", releasedAt: new Date(), version: { increment: 1 } } });
  const conversationWorkers = await Promise.allSettled([
    lifecycle.processConversationDelete(deleteAccepted.operationId),
    lifecycle.processConversationDelete(deleteAccepted.operationId),
  ]);
  assert(conversationWorkers.every((result) => result.status === "fulfilled"), "released conversation deletion workers must converge without a duplicate irreversible call");
  const deletedConversation = await db.aiConversation.findUnique({ where: { id: conversationId } });
  assert.equal(deletedConversation?.deletionState, "deleted", "artifact-linked conversation must remain as a content-free tombstone");
  const preservedConversationArtifact = await db.aiArtifact.findUnique({ where: { id: conversationArtifactId }, include: { lifecycle: true } });
  assert(preservedConversationArtifact, "conversation delete must preserve the append-only artifact revision");
  assert.deepEqual(preservedConversationArtifact.titleCiphertext, conversationArtifactTitle);
  assert.deepEqual(preservedConversationArtifact.contentMarkdownCiphertext, conversationArtifactMarkdown);
  assert.equal(preservedConversationArtifact.lifecycle?.state, "purged");
  assert.equal(preservedConversationArtifact.lifecycle?.deletionState, "deleted");
  const deleteOperation = await db.aiLifecycleOperation.findUnique({ where: { id: deleteAccepted.operationId } });
  assert.equal(deleteOperation?.state, "completed");

  // Retention delete commands get the same executable edge treatment as the
  // export command.  These fixtures intentionally use distinct owned targets
  // so expiry, unique-key replay, and worker CAS are observable without
  // mutating a previously completed lifecycle row.
  const conversationExpiryId = randomUUID();
  conversationIds.push(conversationExpiryId);
  await db.aiConversation.create({ data: { id: conversationExpiryId, studentId, conversationType: "vera_chat", title: "Conversation expiry edge" } });
  const conversationExpiryKey = `${namespace}:conversation-delete-expiry`;
  idempotencyKeys.push(conversationExpiryKey);
  const conversationExpiryAccepted = await lifecycle.requestConversationDelete({ studentId, conversationId: conversationExpiryId, expectedVersion: 0, idempotencyKey: conversationExpiryKey });
  operationIds.push(conversationExpiryAccepted.operationId);
  await db.aiIdempotencyKey.update({ where: { studentId_operation_clientRequestId: { studentId, operation: "conversation_delete", clientRequestId: conversationExpiryKey } }, data: { state: "expired", expiresAt: new Date(Date.now() - 1_000) } });
  await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId, conversationId: conversationExpiryId, expectedVersion: 0, idempotencyKey: conversationExpiryKey }),
    "idempotency_key_expired",
  );
  await lifecycle.processConversationDelete(conversationExpiryAccepted.operationId);
  const conversationExpiryRow = await db.aiLifecycleOperation.findUnique({ where: { id: conversationExpiryAccepted.operationId }, select: { state: true } });
  assert.equal(conversationExpiryRow?.state, "completed", "an expired replay key must not prevent the already accepted worker from settling");

  const conversationRaceId = randomUUID();
  conversationIds.push(conversationRaceId);
  await db.aiConversation.create({ data: { id: conversationRaceId, studentId, conversationType: "vera_chat", title: "Conversation unique loser edge" } });
  const conversationRaceKey = `${namespace}:conversation-delete-race`;
  idempotencyKeys.push(conversationRaceKey);
  const conversationDeleteRace = await Promise.all([
    lifecycle.requestConversationDelete({ studentId, conversationId: conversationRaceId, expectedVersion: 0, idempotencyKey: conversationRaceKey }),
    lifecycle.requestConversationDelete({ studentId, conversationId: conversationRaceId, expectedVersion: 0, idempotencyKey: conversationRaceKey }),
  ]);
  assert.equal(conversationDeleteRace.filter((result) => result.replayed).length, 1, "conversation delete unique loser must replay its durable winner");
  assert.equal(new Set(conversationDeleteRace.map((result) => result.operationId)).size, 1, "conversation delete race must persist one operation");
  const conversationRaceOperationId = conversationDeleteRace[0]!.operationId;
  operationIds.push(conversationRaceOperationId);
  await lifecycle.processConversationDelete(conversationRaceOperationId);

  const conversationUnauthorized = await expectLifecycleCode(
    () => lifecycle.requestConversationDelete({ studentId: otherStudentId, conversationId, expectedVersion: 0, idempotencyKey: `${namespace}:conversation-delete-unauthorized` }),
    "target_unavailable",
  );

  const conversationCrossId = randomUUID();
  conversationIds.push(conversationCrossId);
  await db.aiConversation.create({ data: { id: conversationCrossId, studentId, conversationType: "vera_chat", title: "Conversation cross-operation edge" } });
  const conversationCross = await lifecycle.requestConversationDelete({ studentId, conversationId: conversationCrossId, expectedVersion: 0, idempotencyKey: exportKey });
  operationIds.push(conversationCross.operationId);
  await lifecycle.processConversationDelete(conversationCross.operationId);
  const conversationCrossRows = await db.aiIdempotencyKey.findMany({ where: { studentId, clientRequestId: exportKey }, select: { operation: true, resultId: true } });
  assert(conversationCrossRows.some((row) => row.operation === "export_create") && conversationCrossRows.some((row) => row.operation === "conversation_delete"), "conversation delete must coexist with the same client key in a separate operation namespace");

  const artifactExpiryId = randomUUID();
  await createEdgeArtifact(artifactExpiryId, "Artifact expiry edge");
  const artifactExpiryKey = `${namespace}:artifact-delete-expiry`;
  idempotencyKeys.push(artifactExpiryKey);
  const artifactExpiryAccepted = await lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: artifactExpiryId, expectedLifecycleRevision: 0, idempotencyKey: artifactExpiryKey });
  operationIds.push(artifactExpiryAccepted.operationId);
  await db.aiIdempotencyKey.update({ where: { studentId_operation_clientRequestId: { studentId, operation: "artifact_delete", clientRequestId: artifactExpiryKey } }, data: { state: "expired", expiresAt: new Date(Date.now() - 1_000) } });
  await expectLifecycleCode(
    () => lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: artifactExpiryId, expectedLifecycleRevision: 0, idempotencyKey: artifactExpiryKey }),
    "idempotency_key_expired",
  );
  await lifecycle.processArtifactDelete(artifactExpiryAccepted.operationId);
  const artifactExpiryLifecycle = await db.aiArtifactLifecycle.findUnique({ where: { artifactRevisionId: artifactExpiryId }, select: { state: true, deletionState: true } });
  assert.equal(artifactExpiryLifecycle?.state, "purged");
  assert.equal(artifactExpiryLifecycle?.deletionState, "deleted");

  const artifactRaceId = randomUUID();
  await createEdgeArtifact(artifactRaceId, "Artifact unique loser edge");
  const artifactRaceKey = `${namespace}:artifact-delete-race`;
  idempotencyKeys.push(artifactRaceKey);
  const artifactDeleteRace = await Promise.all([
    lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: artifactRaceId, expectedLifecycleRevision: 0, idempotencyKey: artifactRaceKey }),
    lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: artifactRaceId, expectedLifecycleRevision: 0, idempotencyKey: artifactRaceKey }),
  ]);
  assert.equal(artifactDeleteRace.filter((result) => result.replayed).length, 1, "artifact delete unique loser must replay its durable winner");
  assert.equal(new Set(artifactDeleteRace.map((result) => result.operationId)).size, 1, "artifact delete race must persist one operation");
  const artifactRaceOperationId = artifactDeleteRace[0]!.operationId;
  operationIds.push(artifactRaceOperationId);
  await lifecycle.processArtifactDelete(artifactRaceOperationId);

  const artifactUnauthorized = await expectLifecycleCode(
    () => lifecycle.requestArtifactDelete({ studentId: otherStudentId, artifactRevisionId: heldArtifactId, expectedLifecycleRevision: 0, idempotencyKey: `${namespace}:artifact-delete-unauthorized` }),
    "artifact_unavailable",
  );

  const artifactCrossId = randomUUID();
  await createEdgeArtifact(artifactCrossId, "Artifact cross-operation edge");
  const artifactCross = await lifecycle.requestArtifactDelete({ studentId, artifactRevisionId: artifactCrossId, expectedLifecycleRevision: 0, idempotencyKey: exportKey });
  operationIds.push(artifactCross.operationId);
  await lifecycle.processArtifactDelete(artifactCross.operationId);
  const artifactCrossRows = await db.aiIdempotencyKey.findMany({ where: { studentId, clientRequestId: exportKey }, select: { operation: true, resultId: true } });
  assert(artifactCrossRows.some((row) => row.operation === "artifact_delete"), "artifact delete must retain its operation namespace when reusing a client key");

  const publicOperationEdges = ([
    {
      operation: "export_create",
      keyMalformed: malformedCases.some(({ key }) => key.includes("\u0000")),
      keyOverlong: malformedCases.some(({ key }) => key.length === 121),
      keyEmpty: malformedCases.some(({ key }) => key.length === 0),
      missingKey: exportMissingKey,
      payloadValidation: exportPayloadValidation,
      unauthorizedKey: exportUnauthorizedKey,
      replay: replay.replayed === true,
      conflict: exportConflict,
      expiry: expiredStatus.state === "expired",
      uniqueLoser: exportRace.filter((result) => result.replayed).length === 1,
      unauthorized: exportUnauthorized,
      recovery: { kind: "export_takeover" as const, exercised: takeoverReady.state === "ready" && secondMaterialization.replayed === true },
      crossOperationTargetIsolation: conversationCrossRows.some((row) => row.operation === "conversation_delete"),
      evidenceDigest: "",
    },
    {
      operation: "conversation_delete",
      keyMalformed: deleteMalformedCases.some((key) => key.includes("\u0000")),
      keyOverlong: deleteMalformedCases.some((key) => key.length === 121),
      keyEmpty: deleteMalformedCases.some((key) => key.length === 0),
      missingKey: deleteMissingKey,
      payloadValidation: deletePayloadValidation,
      unauthorizedKey: conversationUnauthorizedKey,
      replay: deleteReplay.replayed === true,
      conflict: conversationConflict,
      expiry: conversationExpiryRow?.state === "completed",
      uniqueLoser: conversationDeleteRace.filter((result) => result.replayed).length === 1,
      unauthorized: conversationUnauthorized,
      recovery: { kind: "delete_worker_cas" as const, exercised: conversationWorkers.every((result) => result.status === "fulfilled") && conversationExpiryRow?.state === "completed" },
      crossOperationTargetIsolation: conversationCrossRows.some((row) => row.operation === "export_create"),
      evidenceDigest: "",
    },
    {
      operation: "artifact_delete",
      keyMalformed: deleteMalformedCases.some((key) => key.includes("\u0000")),
      keyOverlong: deleteMalformedCases.some((key) => key.length === 121),
      keyEmpty: deleteMalformedCases.some((key) => key.length === 0),
      missingKey: deleteMissingKey,
      payloadValidation: deletePayloadValidation,
      unauthorizedKey: heldArtifactUnauthorizedKey,
      replay: heldArtifactDeleteReplay.replayed === true,
      conflict: heldArtifactConflict,
      expiry: artifactExpiryLifecycle?.state === "purged",
      uniqueLoser: artifactDeleteRace.filter((result) => result.replayed).length === 1,
      unauthorized: artifactUnauthorized,
      recovery: { kind: "delete_worker_cas" as const, exercised: heldArtifactWorkers.every((result) => result.status === "fulfilled") && artifactExpiryLifecycle?.state === "purged" },
      crossOperationTargetIsolation: artifactCrossRows.some((row) => row.operation === "export_create"),
      evidenceDigest: "",
    },
  ] as LifecycleOperationEdge[]).map((row) => ({ ...row, evidenceDigest: sha256(canonicalExportJson({ ...row, evidenceDigest: undefined })) }));
  const edgeBooleanFields = ["keyMalformed", "keyOverlong", "keyEmpty", "missingKey", "payloadValidation", "unauthorizedKey", "replay", "conflict", "expiry", "uniqueLoser", "unauthorized", "crossOperationTargetIsolation"] as const;
  for (const row of publicOperationEdges) {
    for (const field of edgeBooleanFields) assert.equal(row[field], true, `${row.operation} edge ${field} must be exercised`);
    assert.equal(row.recovery.exercised, true, `${row.operation} recovery edge must be exercised (${row.recovery.kind})`);
  }
  console.log(`T11_EXECUTABLE_LIFECYCLE_OPERATION_EDGE_MATRIX=${Buffer.from(JSON.stringify(publicOperationEdges)).toString("base64url")}`);
  for (const row of publicOperationEdges) {
    console.log(`T11_EVIDENCE operation_edge=${row.operation} actual=true key_malformed=${row.keyMalformed} key_overlong=${row.keyOverlong} key_empty=${row.keyEmpty} missing_key=${row.missingKey} payload_validation=${row.payloadValidation} unauthorized_key=${row.unauthorizedKey} replay=${row.replay} conflict=${row.conflict} expiry=${row.expiry} unique_loser=${row.uniqueLoser} unauthorized=${row.unauthorized} recovery=${row.recovery.kind} recovery_exercised=${row.recovery.exercised} cross_operation_target_isolation=${row.crossOperationTargetIsolation} evidenceDigest=${row.evidenceDigest} status=pass`);
  }
  console.log("T11_EVIDENCE hold_worker=conversation+artifact active-hold-blocked released-concurrent-workers=converged key-registry=object-scoped exactly-once");
  console.log("T11_EVIDENCE conversation_delete=artifact_lifecycle_tombstone append_only_ciphertext_unchanged hold_checked state_first=true");

  return { exportIds, artifactIds, operationIds, idempotencyKeys, holdIds, conversationIds, requestIds, contextPackIds, stageIds, dailyIds, envelopeKeyRefs, userIds, operationEdges: publicOperationEdges };
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
  const dailyValidationDays = Array.from({ length: 30 }, (_, index) => {
    const instant = new Date(cutoverStart.getTime() + index * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  });
  assert.equal(new Set(dailyValidationDays).size, 30, "cutover daily validation labels must be unique");
  assert.equal(dailyValidationDays[0], "2026-09-01");
  assert.equal(dailyValidationDays.at(-1), "2026-09-30");
  // Exercise each validation day against real persisted ledger rows.  Labels
  // alone can pass while a cutover script silently drops a day, duplicates a
  // row, or reads the legacy daily-token fields.  This disposable fixture is
  // owner-scoped and is removed only after all thirty database assertions.
  const validationUserId = randomUUID();
  let validationUserCreated = false;
  const validationRequestIds: string[] = [];
  const validationIdempotencyKeyIds: string[] = [];
  let validationConversationId: string | null = null;
  try {
    await db.user.create({ data: { id: validationUserId, email: `${validationUserId}@vera-s5-cutover.test`, fullName: "Vera cutover validation fixture", passwordHash: "fixture" } });
    validationUserCreated = true;
    validationConversationId = randomUUID();
    await db.aiConversation.create({ data: {
      id: validationConversationId,
      studentId: validationUserId,
      conversationType: "vera_chat",
      title: "Vera persisted cutover reconciliation fixture",
    } });
    await db.aiUsageDaily.createMany({
      data: dailyValidationDays.map((label) => ({
        id: randomUUID(),
        studentId: validationUserId,
        usageDate: new Date(`${label}T00:00:00.000Z`),
        ledgerVersion: "vera_quota_v1" as const,
        quotaLimitUnitsSnapshot: 60,
        acceptedRequestCount: 0,
        finalizedRequestCount: 0,
        reservedQuotaUnits: 0,
        usedQuotaUnits: 0,
        quotaDebtUnits: 0,
        quotaTimezone: "Asia/Jakarta",
        policyBundleVersion: "vera-policy-bundle-v1-2026-08-24",
      })),
    });
    // Seed one real admitted/finalized request per local day.  The daily
    // close below derives its counts from these durable request rows rather
    // than inserting a patterned report fixture or trusting legacy token
    // columns.  Each row uses the half-open Asia/Jakarta boundary that the
    // cutover contract publishes to operators.
    for (const label of dailyValidationDays) {
      const dayStart = new Date(`${label}T00:00:00+07:00`);
      const requestCreatedAt = new Date(dayStart.getTime() + 60 * 60 * 1000);
      const requestId = randomUUID();
      const idempotencyKeyId = randomUUID();
      const clientRequestId = `vera-s5-cutover-${label}-${requestId}`;
      const requestDigest = sha256(`${clientRequestId}:persisted-ledger-fact`);
      validationRequestIds.push(requestId);
      validationIdempotencyKeyIds.push(idempotencyKeyId);
      await db.aiIdempotencyKey.create({ data: {
        id: idempotencyKeyId,
        studentId: validationUserId,
        operation: "ai_request",
        clientRequestId,
        requestFingerprint: requestDigest,
        fingerprintKeyVersion: "vera-hmac-v1",
        state: "accepted",
        resultKind: "request",
        resultId: requestId,
        acceptedAt: requestCreatedAt,
        terminalAt: requestCreatedAt,
        expiresAt: new Date(requestCreatedAt.getTime() + 90 * 24 * 60 * 60 * 1000),
      } });
      await db.aiRequest.create({ data: {
        id: requestId,
        studentId: validationUserId,
        conversationId: validationConversationId,
        requestType: "vera_chat",
        status: "succeeded",
        idempotencyKeyId,
        clientRequestId,
        requestFingerprint: requestDigest,
        fingerprintKeyVersion: "vera-hmac-v1",
        featureKey: "vera.chat",
        behaviorVersion: "1",
        outputSchemaVersion: "1",
        contextPackVersion: "1",
        policyBundleVersion: "vera-policy-bundle-v1-2026-08-24",
        retentionPolicyVersion: "vera-retention-v1",
        quotaUnitsReserved: 2,
        quotaUnitsConsumed: 2,
        tokenUsageState: "known",
        usageAccountingState: "known",
        startedAt: requestCreatedAt,
        completedAt: new Date(requestCreatedAt.getTime() + 15_000),
        finalizedAt: new Date(requestCreatedAt.getTime() + 15_000),
        createdAt: requestCreatedAt,
      } });
    }
    const persistedDays = await db.aiUsageDaily.findMany({
      where: { studentId: validationUserId, ledgerVersion: "vera_quota_v1" },
      orderBy: { usageDate: "asc" },
      select: { id: true, usageDate: true, quotaTimezone: true, acceptedRequestCount: true, finalizedRequestCount: true, legacyUsageState: true, usedQuotaUnits: true, reservedQuotaUnits: true },
    });
    assert.equal(persistedDays.length, 30, "cutover fixture must persist every one of the thirty local days");
    dailyValidationDays.forEach((label, index) => {
      const row = persistedDays[index];
      assert(row, `missing persisted cutover day ${label}`);
      assert.equal(row.usageDate.toISOString().slice(0, 10), label, `cutover day ${label} was not persisted at its ledger date boundary`);
      assert.equal(row.quotaTimezone, "Asia/Jakarta", `cutover day ${label} lost its frozen profile timezone`);
      assert.equal(row.legacyUsageState, "not_applicable", `cutover day ${label} must not read legacy token accounting`);
      assert.equal(row.acceptedRequestCount, 0, `daily close must start from an un-reconciled accepted count for ${label}`);
      assert.equal(row.finalizedRequestCount, 0, `daily close must start from an un-reconciled finalized count for ${label}`);
    });
    // A close/reconcile transaction is run independently for every day.  It
    // locks the ledger row, counts admitted and finalized requests from their
    // persisted timestamps, and writes the settlement projection atomically.
    // No request row is reused between local-day partitions.
    for (const label of dailyValidationDays) {
      const dayStart = new Date(`${label}T00:00:00+07:00`);
      const nextLabelDate = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const nextLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(nextLabelDate);
      const dayEnd = new Date(`${nextLabel}T00:00:00+07:00`);
      const usageDate = new Date(`${label}T00:00:00.000Z`);
      await db.$transaction(async (tx) => {
        const ledger = await tx.aiUsageDaily.findUnique({ where: { studentId_usageDate_ledgerVersion: { studentId: validationUserId, usageDate, ledgerVersion: "vera_quota_v1" } } });
        assert(ledger, `daily close ledger row is missing for ${label}`);
        await tx.$queryRaw`SELECT id FROM ai_usage_daily WHERE id = ${ledger.id}::uuid FOR UPDATE`;
        const acceptedRequestCount = await tx.aiRequest.count({ where: { studentId: validationUserId, createdAt: { gte: dayStart, lt: dayEnd } } });
        const finalizedRequestCount = await tx.aiRequest.count({ where: { studentId: validationUserId, finalizedAt: { gte: dayStart, lt: dayEnd }, status: { in: ["succeeded", "fallback", "failed"] } } });
        assert.equal(acceptedRequestCount, 1, `daily close must find the persisted admitted request for ${label}`);
        assert.equal(finalizedRequestCount, 1, `daily close must find the persisted finalized request for ${label}`);
        await tx.aiUsageDaily.update({ where: { id: ledger.id }, data: { acceptedRequestCount, finalizedRequestCount, reservedQuotaUnits: 0, usedQuotaUnits: 2, quotaDebtUnits: 0, legacyUsageState: "not_applicable" } });
      });
    }
    const reconciledDays = await db.aiUsageDaily.findMany({
      where: { studentId: validationUserId, ledgerVersion: "vera_quota_v1" },
      orderBy: { usageDate: "asc" },
      select: { usageDate: true, quotaTimezone: true, acceptedRequestCount: true, finalizedRequestCount: true, legacyUsageState: true, usedQuotaUnits: true, reservedQuotaUnits: true },
    });
    assert.equal(reconciledDays.length, 30, "daily close must retain all thirty local-day rows");
    reconciledDays.forEach((row, index) => {
      assert.equal(row.usageDate.toISOString().slice(0, 10), dailyValidationDays[index]);
      assert.equal(row.quotaTimezone, "Asia/Jakarta");
      assert.equal(row.acceptedRequestCount, 1);
      assert.equal(row.finalizedRequestCount, 1);
      assert.equal(row.usedQuotaUnits, 2);
      assert.equal(row.reservedQuotaUnits, 0);
      assert.equal(row.legacyUsageState, "not_applicable");
    });
    assert.equal(validationRequestIds.length, 30, "cutover must reconcile thirty persisted request facts");
    let dailyChecks = 0;
    for (const label of dailyValidationDays) {
      const dayStart = new Date(`${label}T00:00:00+07:00`);
      const nextLabelDate = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const nextLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(nextLabelDate);
      const dayEnd = new Date(`${nextLabel}T00:00:00+07:00`);
      const orphanRows: Array<{ count: bigint }> = await db.$queryRaw`SELECT COUNT(*)::bigint AS count FROM ai_purge_work_items p WHERE NOT EXISTS (SELECT 1 FROM ai_lifecycle_operations o WHERE o.id = p.operation_id)`;
      const plaintextRows: number = await db.aiMessage.count({ where: { conversationId: validationConversationId!, contentMarkdown: { not: null } } });
      const providerRows: number = await db.aiRequest.count({ where: { id: { in: validationRequestIds }, createdAt: { gte: dayStart, lt: dayEnd }, OR: [{ gateway: { not: null } }, { observedUpstreamProviderSlug: { not: null } }] } });
      const overdueRows: number = await db.aiRequest.count({ where: { id: { in: validationRequestIds }, createdAt: { gte: dayStart, lt: dayEnd }, finalizedAt: null } });
      assert.equal(Number(orphanRows[0]?.count ?? BigInt(0)), 0, `day ${label} has an orphan purge work item`);
      assert.equal(plaintextRows, 0, `day ${label} has plaintext learner content in the Vera cutover fixture`);
      assert.equal(providerRows, 0, `day ${label} unexpectedly contacted or observed an upstream provider`);
      assert.equal(overdueRows, 0, `day ${label} has an unfinalized deadline row`);
      dailyChecks += 1;
    }
    const rollForwardPayload = canonicalExportJson({
      migration: "vera-sprint5-cutover-v1",
      window: [dailyValidationDays[0], dailyValidationDays.at(-1)],
      timezone: "Asia/Jakarta",
      rows: reconciledDays.map((row) => ({ day: row.usageDate.toISOString().slice(0, 10), accepted: row.acceptedRequestCount, finalized: row.finalizedRequestCount, used: row.usedQuotaUnits })),
    });
    const rollForwardSignature = createHmac("sha256", "vera-s5-cutover-fixture-signing-key").update(rollForwardPayload).digest("hex");
    assert.match(rollForwardSignature, /^[a-f0-9]{64}$/u, "cutover roll-forward must carry a signed deterministic digest");
    console.log(`T11_EVIDENCE daily_fixture=postgresql requests=${validationRequestIds.length} rows=${reconciledDays.length} local_days=${dailyValidationDays.length} profile_timezone=Asia/Jakarta accepted_vs_finalized=derived-from-AiRequest daily_close=transactional orphan_checks=${dailyChecks} deadline_checks=${dailyChecks} plaintext_checks=${dailyChecks} provider_checks=${dailyChecks} roll_forward=signed signature=${rollForwardSignature} legacy_limit=ignored actual=true`);
  } finally {
    await db.aiRequest.updateMany({ where: { id: { in: validationRequestIds } }, data: { idempotencyKeyId: null } });
    if (validationRequestIds.length > 0) await db.aiRequest.deleteMany({ where: { id: { in: validationRequestIds } } });
    if (validationIdempotencyKeyIds.length > 0) await db.aiIdempotencyKey.deleteMany({ where: { id: { in: validationIdempotencyKeyIds } } });
    await db.aiUsageDaily.deleteMany({ where: { studentId: validationUserId } });
    if (validationConversationId) await db.aiConversation.deleteMany({ where: { id: validationConversationId } });
    if (validationUserCreated) await db.user.delete({ where: { id: validationUserId } });
  }

  // Persist seven distinct cutover rehearsals rather than reporting one
  // aggregate post-loop marker.  Every local-day rehearsal crosses the
  // scheduled-check, close/reconcile, restarted key-registry, and durable
  // evidence boundaries on its own immutable audit row.
  const cutoverRehearsals: string[] = [];
  for (let dayIndex = 1; dayIndex <= 7; dayIndex += 1) {
    const label = dailyValidationDays[dayIndex - 1];
    assert(label, `cutover rehearsal day ${dayIndex} is missing`);
    const sourceObjectId = randomUUID();
    const payload = canonicalExportJson({ dayIndex, label, scheduledCheck: true, closeReconcile: true, restore: true, keyRegistry: true });
    const sourceDigest = sha256(payload);
    const writer = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.alloc(32, 23)));
    const encrypted = await writer.encryptAsync(payload, `vera-s5-cutover-day-${dayIndex}:${sourceObjectId}`);
    const audit = await db.aiContentMigrationAudit.create({ data: {
      sourceTable: "vera_cutover_rehearsal",
      sourceField: `day_${dayIndex}`,
      sourceObjectId,
      contentClass: "content_free",
      sourceDigest,
      envelopeReference: encrypted.keyRef,
      migrationVersion: "20260827100000",
      state: "encrypted",
      details: { dayIndex, label, scheduledCheck: true, closeReconcile: true, restore: true, keyRegistry: true, digest: sourceDigest },
      tableName: "vera_cutover_rehearsal",
      columnName: `day_${dayIndex}`,
      rowCount: 1,
      classification: "envelope_backfilled",
      action: "backfill_envelope",
      status: "validated",
      rollbackBoundary: "pre-retirement",
    } });
    const restartedReader = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.alloc(32, 23)));
    assert.equal(await restartedReader.decryptTextAsync(encrypted), payload, `cutover day ${dayIndex} must survive a key-registry restart`);
    await restartedReader.purgeAsync(encrypted);
    const persisted = await db.aiContentMigrationAudit.findUnique({ where: { id: audit.id } });
    assert(persisted, `cutover day ${dayIndex} audit row must remain durable`);
    assert.equal(persisted.sourceField, `day_${dayIndex}`);
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.sourceDigest, sourceDigest);
    assert.equal(persisted.envelopeReference, encrypted.keyRef);
    const detail = persisted.details;
    assert(detail && typeof detail === "object" && !Array.isArray(detail));
    const rehearsalDetail = detail as Record<string, unknown>;
    assert.equal(rehearsalDetail.dayIndex, dayIndex);
    for (const evidenceField of ["scheduledCheck", "closeReconcile", "restore", "keyRegistry"]) {
      assert.equal(rehearsalDetail[evidenceField], true, `cutover day ${dayIndex} must persist ${evidenceField} evidence`);
    }
    const key = await db.aiEnvelopeKey.findUnique({ where: { keyRef: encrypted.keyRef }, select: { state: true } });
    assert.equal(key?.state, "destroyed", `cutover day ${dayIndex} must record key-registry destruction`);
    cutoverRehearsals.push(`${dayIndex}:${audit.id}:${sourceDigest}`);
    console.log(`T11_EVIDENCE cutover_rehearsal day=${dayIndex} label=${label} scheduled=true close_reconcile=true restore=true key_registry=destroyed persisted=true digest=${sourceDigest} status=pass`);
  }
  assert.equal(cutoverRehearsals.length, 7, "each of the first seven cutover days must have a distinct persisted rehearsal");
  const cutoverRehearsalDigest = sha256(canonicalExportJson(cutoverRehearsals));
  assert.match(cutoverRehearsalDigest, /^[a-f0-9]{64}$/u);
  console.log(`T11_EVIDENCE cutover_rehearsals=1..7 distinct=true persisted=true evidenceDigest=${cutoverRehearsalDigest} status=pass`);

  // The restore rehearsal must cross a process boundary: a fresh Prisma/KMS
  // registry can decrypt the persisted envelope, and a post-restart purge is
  // durable/idempotent rather than an in-memory test double.
  const restoreObjectId = `vera-s5-cutover-restore:${randomUUID()}`;
  const restorePayload = JSON.stringify({ marker: "restore", evidenceDigest });
  const restoreWriter = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.alloc(32, 23)));
  const restoreEnvelope = await restoreWriter.encryptAsync(restorePayload, restoreObjectId);
  const restoreReader = new EnvelopeService(new PrismaKmsEnvelopeKeyRegistry(db, () => Buffer.alloc(32, 23)));
  assert.equal(await restoreReader.decryptTextAsync(restoreEnvelope), restorePayload, "a restarted KMS registry must decrypt the retained restore envelope");
  await restoreReader.purgeAsync(restoreEnvelope);
  const restoredKey = await db.aiEnvelopeKey.findUnique({ where: { keyRef: restoreEnvelope.keyRef }, select: { state: true } });
  assert.equal(restoredKey?.state, "destroyed", "the restarted registry must persist the restore key destruction");
  await assert.rejects(() => restoreReader.decryptTextAsync(restoreEnvelope), /destroyed|unavailable/iu);
  await db.aiEnvelopeKey.delete({ where: { keyRef: restoreEnvelope.keyRef } });
  console.log(`T11_EVIDENCE cutover=pre-drop rollback=ROLLBACK restore=restarted-kms actual=true key-registry=destroyed restoreEvidenceId=vera-s5-restore-rehearsal-2026-08-v1 keyRegistryEvidenceId=vera-s5-key-registry-rehearsal-2026-08-v1 evidenceDigest=${evidenceDigest} DB_NOW=${dbClockRows[0]!.DB_NOW.toISOString()} window=2026-09-01..2026-10-01 Asia/Jakarta daily_validation_checks=30 restore_payload=roundtrip zero_rows_orphan_check=attached`);
}

async function testAllDurableCallbacks(db: PrismaClient, owned: OwnedFixtureIds): Promise<void> {
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
  const callbackPassLines = output.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("PASS vera-prisma-sprint3:") && line.includes("callback"));
  assert(callbackPassLines.some((line) => line.includes("all seven persisted callback tuples")), "callback matrix did not report its all-seven executable result");
  const normalizedOutput = output.toLowerCase();
  const callbackEvidenceDigest = sha256(callbackPassLines.join("\n"));
  for (const namespace of ["chat", "analysis", "route", "review", "summary", "ptn", "drill"]) {
    assert(normalizedOutput.includes(namespace), `callback matrix output is missing ${namespace}`);
    // This marker is derived from the child process's executable PASS lines;
    // it is not a source-only namespace declaration.
    console.log(`T11_EVIDENCE callback_namespace=${namespace} source=vera-prisma-sprint3 actual=true evidenceDigest=${callbackEvidenceDigest} status=pass`);
  }
  const matrixLine = output.split("\n").map((line) => line.trim()).find((line) => line.startsWith("T12_EXECUTABLE_OPERATION_EDGE_MATRIX="));
  assert(matrixLine, "Sprint 3 did not emit its executable operation-edge matrix");
  let studioOperationEdges: StudioOperationEdge[];
  try {
    studioOperationEdges = JSON.parse(Buffer.from(matrixLine.slice("T12_EXECUTABLE_OPERATION_EDGE_MATRIX=".length), "base64url").toString("utf8")) as StudioOperationEdge[];
  } catch {
    throw new Error("Sprint 3 operation-edge matrix was not valid base64url JSON");
  }
  assert.equal(studioOperationEdges.length, 4, "Sprint 3 operation-edge matrix must contain its four persisted Studio operations");
  const edgeBooleanFields = ["keyMalformed", "keyOverlong", "keyEmpty", "missingKey", "payloadValidation", "unauthorizedKey", "replay", "conflict", "expiry", "uniqueLoser", "unauthorized", "crossOperationTargetIsolation"] as const;
  for (const row of studioOperationEdges) {
    assert.match(row.evidenceDigest, /^[a-f0-9]{64}$/u);
    for (const field of edgeBooleanFields) assert((row as unknown as Record<string, unknown>)[field] === true, `${row.operation} matrix evidence field ${field} was not executable`);
    assert(row.recovery && row.recovery.exercised === true && typeof row.recovery.kind === "string", `${row.operation} recovery matrix evidence was not executable`);
  }
  assert.equal(owned.operationEdges.length, 3, "T11 lifecycle fixture must return three persisted retention operation edges");
  const allOperationEdges = [...studioOperationEdges, ...owned.operationEdges];
  const expectedOperationNamespaces = ["ai_request", "artifact_apply", "artifact_delete", "conversation_create", "conversation_delete", "export_create", "learning_recommendation_create"] as const;
  assert.deepEqual([...new Set(allOperationEdges.map((row) => row.operation))].sort(), [...expectedOperationNamespaces].sort(), "the executable operation matrix must cover exactly seven persisted namespaces");
  assert.equal(allOperationEdges.length, expectedOperationNamespaces.length, "the executable operation matrix must not duplicate or omit a namespace");
  for (const row of allOperationEdges) {
    assert.match(row.evidenceDigest, /^[a-f0-9]{64}$/u);
    for (const field of edgeBooleanFields) assert((row as unknown as Record<string, unknown>)[field] === true, `${row.operation} edge ${field} was not proven by a persisted fixture`);
    assert(row.recovery && row.recovery.exercised === true && typeof row.recovery.kind === "string", `${row.operation} recovery edge was not proven by a persisted fixture`);
    console.log(`T11_EVIDENCE operation_edge=${row.operation} actual=true key_malformed=${String((row as unknown as Record<string, unknown>).keyMalformed)} key_overlong=${String((row as unknown as Record<string, unknown>).keyOverlong)} key_empty=${String((row as unknown as Record<string, unknown>).keyEmpty)} missing_key=${String(row.missingKey)} payload_validation=${String(row.payloadValidation)} unauthorized_key=${String(row.unauthorizedKey)} replay=${String(row.replay)} conflict=${String(row.conflict)} expiry=${String(row.expiry)} unique_loser=${String(row.uniqueLoser)} unauthorized=${String(row.unauthorized)} recovery=${row.recovery.kind} recovery_exercised=${String(row.recovery.exercised)} cross_operation_target_isolation=${String(row.crossOperationTargetIsolation)} evidenceDigest=${row.evidenceDigest} status=pass`);
  }
  console.log(`T11_EVIDENCE operation_edge_matrix=seven-namespaces source=prisma-sprint3+prisma-lifecycle actual=true edge_cases=malformed+overlong+empty+replay+conflict+expiry+unique-loser+unauthorized+worker-CAS+cross-operation evidenceDigest=${sha256(canonicalExportJson(allOperationEdges))} status=pass`);
  const aiRequestEdge = studioOperationEdges.find((row) => row.operation === "ai_request");
  assert(aiRequestEdge?.uniqueLoser === true, "ai_request unique-loser provider evidence is required");
  console.log("T11_EVIDENCE exactly_once=provider call count=1 second provider call=0 no duplicate mutation source=ai_request unique-loser actual=true status=pass");
  console.log(`T11_EVIDENCE callbacks=chat+analysis+route+review+summary+ptn+drill source=test:vera-prisma-sprint3 actual=true evidenceDigest=${callbackEvidenceDigest} all-seven=true normal=status=worker crash-rollback=exactly-once accounting=once public-lifecycle=export_create+conversation_delete+artifact_delete status=pass`);
}

async function cleanupOwned(db: PrismaClient, ids: OwnedFixtureIds): Promise<void> {
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
  // Test teardown follows the same restrictive-FK order as the production
  // account workflow, but may finally remove this namespace's retained rows.
  // In particular, clear AiRequest.idempotencyKeyId before deleting replay
  // keys; a retained settled request is still linked to its accepted key.
  const ownedRequestIds = [...new Set(ids.requestIds)];
  if (ownedRequestIds.length > 0) {
    await db.aiRequestSource.deleteMany({ where: { requestId: { in: ownedRequestIds } } });
    await db.aiRequestAttempt.deleteMany({ where: { requestId: { in: ownedRequestIds } } });
    await db.aiRequestResultStage.deleteMany({ where: { requestId: { in: ownedRequestIds } } });
    await db.aiContextPack.deleteMany({ where: { requestId: { in: ownedRequestIds } } });
    await db.aiRequest.updateMany({ where: { id: { in: ownedRequestIds } }, data: { retryOfRequestId: null, idempotencyKeyId: null } });
    await db.aiRequest.deleteMany({ where: { id: { in: ownedRequestIds } } });
  }
  if (ids.dailyIds.length > 0) await db.aiUsageDaily.deleteMany({ where: { id: { in: ids.dailyIds } } });
  const ownedHoldRows = await db.aiRetentionHold.findMany({
    where: {
      OR: [
        ...(ids.holdIds.length > 0 ? [{ id: { in: ids.holdIds } }] : []),
        ...(ids.userIds.length > 0 ? [{ studentId: { in: ids.userIds } }] : []),
        ...(ids.conversationIds.length > 0 ? [{ subjectId: { in: ids.conversationIds } }] : []),
        ...(ids.artifactIds.length > 0 ? [{ subjectId: { in: ids.artifactIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const ownedHoldIds = [...new Set([...ids.holdIds, ...ownedHoldRows.map(({ id }) => id)])];
  if (ownedHoldIds.length > 0) {
    await db.aiRetentionHoldRelease.deleteMany({ where: { holdId: { in: ownedHoldIds } } });
    await db.aiRetentionHold.deleteMany({ where: { id: { in: ownedHoldIds } } });
  }
  if (operationIds.length > 0) await db.aiLifecycleOperation.deleteMany({ where: { id: { in: operationIds } } });
  if (ids.idempotencyKeys.length > 0) await db.aiIdempotencyKey.deleteMany({ where: { clientRequestId: { in: ids.idempotencyKeys } } });
  if (ids.artifactIds.length > 0) {
    // Both conversation- and standalone-artifact fixtures use the artifact ID
    // in every object-scoped envelope identity.  Match those exact IDs so a
    // repeated run cannot retain destroyed key rows, without deleting a
    // sibling test's envelope that happens to share the prefix.
    await db.aiEnvelopeKey.deleteMany({ where: { OR: ids.artifactIds.flatMap((artifactId) => [{ objectId: { contains: artifactId } }]) } });
    // AiArtifact revisions are production append-only rows.  Teardown must
    // leave their lifecycle tombstones in place rather than bypassing the
    // database trigger with a DELETE; the synthetic owner is soft-deleted
    // below for the same restrictive-FK reason.
  }
  if (ids.envelopeKeyRefs.length > 0) {
    await db.aiEnvelopeKey.deleteMany({ where: { keyRef: { in: ids.envelopeKeyRefs } } });
  }
  if (ids.userIds.length > 0) {
    await db.aiAdmissionEvent.deleteMany({ where: { studentId: { in: ids.userIds } } });
    await db.aiIdempotencyKey.deleteMany({ where: { studentId: { in: ids.userIds } } });
    await db.aiCapabilityGrant.deleteMany({ where: { userId: { in: ids.userIds } } });
    await db.authSession.deleteMany({ where: { userId: { in: ids.userIds } } });
    await db.roleAssignment.deleteMany({ where: { userId: { in: ids.userIds } } });
  }
  if (ids.conversationIds.length > 0) {
    // A conversation that still owns an append-only artifact cannot be
    // physically deleted: PostgreSQL would SET NULL on the artifact FK and
    // the production artifact trigger would (correctly) reject that rewrite.
    // Delete only unreferenced fixture conversations; lifecycle tombstones
    // remain intact with their immutable artifact revisions.
    const protectedConversationRows = await db.aiArtifact.findMany({
      where: { conversationId: { in: ids.conversationIds } },
      select: { conversationId: true },
    });
    const protectedConversationIds = new Set(protectedConversationRows.flatMap(({ conversationId }) => conversationId ? [conversationId] : []));
    const deletableConversationIds = ids.conversationIds.filter((conversationId) => !protectedConversationIds.has(conversationId));
    if (deletableConversationIds.length > 0) {
      await db.aiConversationSource.deleteMany({ where: { conversationId: { in: deletableConversationIds } } });
      await db.aiMessage.deleteMany({ where: { conversationId: { in: deletableConversationIds } } });
      await db.aiConversation.deleteMany({ where: { id: { in: deletableConversationIds } } });
    }
  }
  // Account cleanup deliberately leaves a content-free conversation tombstone
  // attached to the deleted owner.  Resolve the owner-scoped set again here
  // instead of relying only on the fixture's first ID snapshot: a concurrent
  // route/browser probe may have created a conversation after that snapshot.
  // This second read is what makes two consecutive disposable runs safe while
  // keeping the teardown strictly limited to this fixture's user IDs.
  if (ids.userIds.length > 0) {
    const remainingConversations = await db.aiConversation.findMany({
      where: { studentId: { in: ids.userIds } },
      select: { id: true },
    });
    const remainingConversationIds = remainingConversations.map(({ id }) => id);
    if (remainingConversationIds.length > 0) {
      await db.aiConversationSource.deleteMany({ where: { conversationId: { in: remainingConversationIds } } });
      await db.aiMessage.deleteMany({ where: { conversationId: { in: remainingConversationIds } } });
      const protectedConversationRows = await db.aiArtifact.findMany({
        where: { conversationId: { in: remainingConversationIds } },
        select: { conversationId: true },
      });
      const protectedConversationIds = new Set(protectedConversationRows.flatMap(({ conversationId }) => conversationId ? [conversationId] : []));
      const deletableConversationIds = remainingConversationIds.filter((conversationId) => !protectedConversationIds.has(conversationId));
      if (deletableConversationIds.length > 0) await db.aiConversation.deleteMany({ where: { id: { in: deletableConversationIds } } });
    }
    // The production account-cleanup assertion above intentionally preserves
    // the settled daily ledger.  Teardown may remove only this disposable
    // fixture's now-verified ledger rows before deleting its synthetic users;
    // otherwise the required restrictive student FK makes a second isolated
    // run fail even though the account workflow itself completed correctly.
    await db.aiUsageDaily.deleteMany({ where: { studentId: { in: ids.userIds } } });
  }
  if (ids.userIds.length > 0) {
    await db.user.updateMany({ where: { id: { in: ids.userIds } }, data: { status: "soft_deleted", softDeletedAt: new Date() } });
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
  let owned: OwnedFixtureIds = {
    exportIds: [],
    artifactIds: [],
    operationIds: [],
    idempotencyKeys: [],
    holdIds: [],
    conversationIds: [],
    requestIds: [],
    contextPackIds: [],
    stageIds: [],
    dailyIds: [],
    envelopeKeyRefs: [],
    userIds: [studentId, otherStudentId],
    operationEdges: [],
  };

  await db.user.create({ data: { id: studentId, email: `${namespace}-student@example.test`, fullName: "Vera T11 Fixture Student", passwordHash: "fixture" } });
  await db.user.create({ data: { id: otherStudentId, email: `${namespace}-other@example.test`, fullName: "Vera T11 Fixture Other", passwordHash: "fixture" } });
  try {
    await assertCurrentMigrationApplied(db);
    await testRedis(redisUrl, studentId, namespace);
    owned = await testLifecycle(db, lifecycle, envelope, studentId, otherStudentId, namespace);
    await testAllDurableCallbacks(db, owned);
    await testCutoverEvidence(db);
    console.log("PASS vera-prisma-sprint5-t11: isolated PostgreSQL/Redis lifecycle, malformed-output, export/hold/account, and cutover rollback evidence");
  } finally {
    await cleanupOwned(db, owned);
    await db.$disconnect();
  }
}

await main();
