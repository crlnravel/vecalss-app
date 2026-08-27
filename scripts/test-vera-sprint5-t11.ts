import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertDeadlineNeverShortened,
  assertDualCapabilityApproval,
  canonicalExportJson,
  contextEvidenceDeadline,
  exportSnapshotDigest,
  formatExportInstant,
  InMemoryStateFirstPurgeStore,
  preReadyExportDeadlines,
  resultStagePurgeDeadline,
  settlementDeadline,
  splitExportParts,
  withCapabilitySnapshotDigest,
} from "@/lib/vera-ai/retention";
import {
  assertT11MigrationInventoryComplete,
  VERA_T11_LEGACY_INVENTORY_FIELDS,
} from "@/lib/vera-ai/provenance";
import {
  assertLegacyValidationWindowComplete,
  isVeraAdmissionsEnabled,
  recordLegacyValidationDay,
  VERA_LEGACY_CUTOVER_AT,
} from "@/lib/vera-ai/legacy-cutover";

const root = process.cwd();
const migrationPath = join(root, "prisma/migrations/20260827100000_add_vera_sprint5_lifecycle/migration.sql");
const migration = readFileSync(migrationPath, "utf8");

function expectThrows(action: () => unknown, message: string): void {
  assert.throws(action, message);
}

async function expectRejects(action: () => Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(action, message);
}

function assertRoute(path: string, method: string): void {
  const source = readFileSync(join(root, path), "utf8");
  assert.match(source, new RegExp(`export async function ${method}\\b`), `${path} is missing ${method}`);
}

function testRetention(): void {
  const acceptedAt = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(settlementDeadline(acceptedAt).toISOString(), "2026-01-01T02:00:00.000Z");
  assert.equal(
    resultStagePurgeDeadline({ stagedAt: acceptedAt }).toISOString(),
    "2026-01-02T02:00:00.000Z",
  );

  const context = contextEvidenceDeadline({ requestCreatedAt: acceptedAt });
  assert.equal(context.normalDeadline.toISOString(), "2026-01-31T00:00:00.000Z");
  const extended = contextEvidenceDeadline({
    requestCreatedAt: acceptedAt,
    eligibleRetainedArtifactOrTypedResult: true,
    approvedExtensionMs: 100 * 24 * 60 * 60 * 1000,
  });
  assert.equal(extended.normalDeadline.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(contextEvidenceDeadline({ requestCreatedAt: acceptedAt, activeHold: true }).effectiveDeadline, null);
  expectThrows(
    () => assertDeadlineNeverShortened(new Date("2026-02-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z")),
    "retention deadline shortening must fail",
  );

  assert.equal(formatExportInstant(new Date("2026-01-01T00:00:00.123Z")), "2026-01-01T00:00:00.123000Z");
  const canonical = canonicalExportJson({ z: "e\u0301", a: { n: 1 } });
  assert.equal(canonical, "{\"a\":{\"n\":1},\"z\":\"é\"}");
  const bytes = new TextEncoder().encode(JSON.stringify({ emoji: "😀".repeat(100) }));
  const parts = splitExportParts(bytes, 7);
  assert(parts.length > 1, "UTF-8 export fixture should be split");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  assert.equal(Buffer.concat(parts.map((part) => Buffer.from(part))).toString("hex"), Buffer.from(bytes).toString("hex"));
  for (const part of parts) assert.doesNotThrow(() => decoder.decode(part));
  assert.equal(exportSnapshotDigest(bytes).length, 64);

  const terminal = preReadyExportDeadlines(acceptedAt);
  assert.equal(terminal.partialPackagePurgeAt.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(terminal.terminalRetentionExpiresAt.toISOString(), "2026-04-01T00:00:00.000Z");
}

async function testCapabilitiesAndPurge(): Promise<void> {
  const evaluatedAt = new Date("2026-01-02T00:00:00.000Z");
  const a = withCapabilitySnapshotDigest({
    operation: "key_destroy",
    subjectId: "object-1",
    operatorId: "operator-a",
    requiredCapabilityUnion: ["vera_key_destruction_approver"],
    grantedCapabilitySetDigest: "grant-a",
    capabilityPolicyVersion: "policy-1",
    decision: "allow",
    evaluatedAt,
    capabilityDecisionId: "decision-a",
  });
  const b = withCapabilitySnapshotDigest({
    operation: a.operation,
    subjectId: a.subjectId,
    operatorId: "operator-b",
    requiredCapabilityUnion: a.requiredCapabilityUnion,
    grantedCapabilitySetDigest: a.grantedCapabilitySetDigest,
    capabilityPolicyVersion: a.capabilityPolicyVersion,
    decision: a.decision,
    evaluatedAt: a.evaluatedAt,
    capabilityDecisionId: "decision-b",
  });
  assert.doesNotThrow(() => assertDualCapabilityApproval([a, b], ["vera_key_destruction_approver"]));
  expectThrows(() => assertDualCapabilityApproval([a, a]), "same operator must fail dual control");
  expectThrows(
    () => assertDualCapabilityApproval([{ ...b, decision: "deny" }], []),
    "denied capability must fail closed",
  );

  const store = new InMemoryStateFirstPurgeStore();
  store.create({ objectType: "message", objectId: "message-1", keyLineageDigest: "lineage-1" });
  let destroyCalls = 0;
  const keyDestroyer = { destroy: async () => { destroyCalls += 1; return { resultDigest: "destroyed-1" }; } };
  await expectRejects(
    () => store.destroyAndFinalize({ objectType: "message", objectId: "message-1", keyDestroyer }),
    "key destruction before purging marker must fail",
  );
  assert.equal(destroyCalls, 0);
  assert.equal(store.markPurging("message", "message-1", "retention").state, "purging");
  assert.equal(store.get("message", "message-1")?.provenanceState, "unavailable");
}

async function testPurgeCompletion(): Promise<void> {
  const store = new InMemoryStateFirstPurgeStore();
  store.create({ objectType: "artifact", objectId: "artifact-1", keyLineageDigest: "lineage-2" });
  store.markPurging("artifact", "artifact-1", "legal-release");
  let destroyCalls = 0;
  const result = await store.destroyAndFinalize({
    objectType: "artifact",
    objectId: "artifact-1",
    keyDestroyer: { destroy: async () => { destroyCalls += 1; return { resultDigest: "destroyed-2" }; } },
  });
  assert.equal(result.state, "purged");
  assert.equal(result.provenanceState, "unavailable");
  assert.equal(destroyCalls, 1);
  assert.equal((await store.destroyAndFinalize({
    objectType: "artifact",
    objectId: "artifact-1",
    keyDestroyer: { destroy: async () => { destroyCalls += 1; return { resultDigest: "unexpected" }; } },
  })).state, "purged");
  assert.equal(destroyCalls, 1, "a completed purge must be replay-safe");
}

function testLegacyCutover(): void {
  const firstDay = new Date(VERA_LEGACY_CUTOVER_AT);
  const days = Array.from({ length: 30 }, (_, index) => recordLegacyValidationDay({
    now: new Date(firstDay.getTime() + index * 24 * 60 * 60 * 1000),
    evidence: { inventoryRows: 0, providerGateState: "open_blocked" },
  }));
  assert.equal(days[0]?.validationDate, "2026-09-01");
  assert.equal(days.at(-1)?.validationDate, "2026-09-30");
  assert.doesNotThrow(() => assertLegacyValidationWindowComplete(days));
  assert.equal(isVeraAdmissionsEnabled({ now: new Date("2026-10-01T00:00:00+07:00"), validationDays: days }), true);
  expectThrows(
    () => assertLegacyValidationWindowComplete(days.slice(0, 29)),
    "cutover must remain blocked when one validation day is missing",
  );

  assertT11MigrationInventoryComplete(VERA_T11_LEGACY_INVENTORY_FIELDS.map((field) => ({
    ...field,
    rowCount: 0,
    unclassifiedPlaintext: 0,
  })));
}

function testStaticBoundary(): void {
  assert(!/DROP\s+(TABLE|COLUMN)/i.test(migration), "T11 migration must not drop tables or columns");
  assert(!migration.includes('UPDATE "ai_content_migration_audits"'), "migration audit must remain append-only");
  assert(migration.includes('ADD COLUMN "metadata_state" "ai_content_lifecycle_state" NOT NULL DEFAULT \'legacy_plaintext\''));
  assert(migration.includes('ALTER COLUMN "metadata_state" SET DEFAULT \'encrypted\''));
  assert(migration.includes("account_cleanup") && migration.includes("awaiting_dependency"));
  assert(migration.includes("zero_rows") && migration.includes("pre-retirement"));
  assert(!migration.includes("'plaintext'"), "migration must never insert a plaintext marker");
  for (const field of VERA_T11_LEGACY_INVENTORY_FIELDS) {
    assert(migration.includes(`'${field.sourceTable}'`) && migration.includes(`'${field.sourceField}'`), `missing inventory ${field.sourceTable}:${field.sourceField}`);
  }

  assertRoute("app/api/vera-ai/exports/route.ts", "POST");
  assertRoute("app/api/vera-ai/exports/[exportId]/route.ts", "GET");
  assertRoute("app/api/vera-ai/exports/[exportId]/download/route.ts", "GET");
  assertRoute("app/api/vera-ai/conversations/[conversationId]/route.ts", "DELETE");
  assertRoute("app/api/vera-ai/artifacts/[artifactRevisionId]/route.ts", "DELETE");
  assertRoute("app/api/vera-ai/lifecycle/[operationId]/route.ts", "GET");
  const service = readFileSync(join(root, "lib/vera-ai/lifecycle-service.ts"), "utf8");
  for (const marker of [
    "exportAsOf",
    "materializationClaimId",
    "export_access_consumed",
    "target_revision_conflict",
    "account_cleanup",
    "state-first",
  ]) assert(service.includes(marker), `missing T11 service marker ${marker}`);
}

async function main(): Promise<void> {
  testRetention();
  console.log("T11_EVIDENCE operation=retention state=passed result=deadline_export_matrix");
  await testCapabilitiesAndPurge();
  await testPurgeCompletion();
  console.log("T11_EVIDENCE operation=purge state=passed result=state_first_cas_replay");
  testLegacyCutover();
  console.log("T11_EVIDENCE operation=cutover state=passed result=jakarta_30_day_inventory");
  testStaticBoundary();
  console.log("T11_EVIDENCE operation=routes_migration state=passed result=forward_only_exact_namespace");
}

await main();
