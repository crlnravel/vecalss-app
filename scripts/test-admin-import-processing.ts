import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_SELECTED_HANDOFFS,
  formulaSafe,
  validateSelectedHandoffIds,
} from "@/lib/admin/imports/handoff-file";
import {
  MAX_ROW_ATTEMPTS,
  ROW_BATCH_SIZE,
  ROW_CLAIM_LEASE_MS,
  finalImportStatus,
} from "@/lib/admin/imports/processing";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const processingSource = await readFile(resolve(root, "lib/admin/imports/processing.ts"), "utf8");
const auditSchemaSource = await readFile(resolve(root, "prisma/schema.prisma"), "utf8");
const auditMigrationSource = await readFile(resolve(root, "prisma/migrations/20260901090000_make_audit_logs_immutable/migration.sql"), "utf8");
const seedSource = await readFile(resolve(root, "prisma/seed.mjs"), "utf8");
const handoffSource = await readFile(resolve(root, "lib/admin/imports/handoff-file.ts"), "utf8");
const workerSource = await readFile(resolve(root, "workers/admin-import-worker.ts"), "utf8");
const handoffRouteSource = await readFile(resolve(root, "app/api/admin/imports/[importId]/handoff-file/route.ts"), "utf8");
const retryRouteSource = await readFile(resolve(root, "app/api/admin/imports/[importId]/retry/route.ts"), "utf8");
const cancelRouteSource = await readFile(resolve(root, "app/api/admin/imports/[importId]/cancel/route.ts"), "utf8");

assert.equal(ROW_CLAIM_LEASE_MS, 120_000);
assert.equal(ROW_BATCH_SIZE, 10);
assert.equal(MAX_ROW_ATTEMPTS, 5);
assert.equal(finalImportStatus({
  created: 2,
  failed: 0,
  invalid: 0,
  pending: 0,
  processing: 0,
  skipped: 0,
  total: 2,
  updated: 0,
}), "completed");
assert.equal(finalImportStatus({
  created: 0,
  failed: 1,
  invalid: 0,
  pending: 0,
  processing: 0,
  skipped: 0,
  total: 1,
  updated: 0,
}), "failed");
assert.equal(finalImportStatus({
  created: 0,
  failed: 0,
  invalid: 0,
  pending: 0,
  processing: 0,
  skipped: 1,
  total: 1,
  updated: 0,
}), "partial");
assert.equal(finalImportStatus({
  created: 0,
  failed: 0,
  invalid: 0,
  pending: 1,
  processing: 0,
  skipped: 0,
  total: 1,
  updated: 0,
}), null);

assert.equal(formulaSafe("=SUM(A1:A2)"), "'=SUM(A1:A2)");
assert.equal(formulaSafe("+user@example.test"), "'+user@example.test");
assert.equal(formulaSafe("normal@example.test"), "normal@example.test");
assert.equal(MAX_SELECTED_HANDOFFS, 500);
assert.throws(() => validateSelectedHandoffIds(["not-a-uuid"]), /selected handoffs are invalid/u);
const handoffId = "550e8400-e29b-41d4-a716-446655440000";
assert.deepEqual(validateSelectedHandoffIds([handoffId]), [handoffId]);
assert.throws(() => validateSelectedHandoffIds([handoffId, handoffId]), /selected handoffs are invalid/u);

assert.match(processingSource, /FOR UPDATE OF r SKIP LOCKED/u);
assert.match(processingSource, /pg_advisory_xact_lock\(hashtextextended/u);
assert.match(processingSource, /claim_expires_at > clock_timestamp\(\)/u);
assert.match(processingSource, /UPDATE enrollment_import_rows[\s\S]*claim_token[\s\S]*claim_expires_at > clock_timestamp/u);
assert.match(processingSource, /matchedUserUpdatedAt\.getTime\(\)/u);
assert.match(processingSource, /EnrollmentHandoffMethod\.invite_link/u);
assert.match(processingSource, /createEnrollmentHandoff/u);
assert.match(processingSource, /retryEnrollmentImport/u);
assert.match(processingSource, /expectedGeneration/u);
assert.match(processingSource, /idempotencyKey/u);
assert.match(processingSource, /metadata ->> 'requestKey'/u);
assert.match(processingSource, /persistRetryGenerationResult/u);
assert.match(processingSource, /enrollment_import\.retry_completed/u);
assert.doesNotMatch(processingSource, /auditLog\.update(?:Many)?/u);
assert.match(auditSchemaSource, /model AuditLog[\s\S]*onDelete: Restrict[\s\S]*onUpdate: Restrict/u);
assert.match(auditMigrationSource, /BEFORE UPDATE OR DELETE ON "audit_logs"/u);
assert.match(auditMigrationSource, /BEFORE TRUNCATE ON "audit_logs"/u);
assert.match(auditMigrationSource, /audit logs are immutable/u);
assert.match(seedSource, /seedAuditLogs/u);
assert.match(seedSource, /INSERT INTO audit_logs/u);
assert.match(seedSource, /ON CONFLICT \(id\) DO NOTHING/u);
assert.match(seedSource, /seedKey/u);
assert.match(processingSource, /completed_at < \$\{importCutoff\}/u);
assert.match(processingSource, /SELECT id[\s\S]*FROM enrollment_imports[\s\S]*FOR UPDATE/u);
assert.match(processingSource, /previousGeneration/u);
assert.match(processingSource, /idempotent: true/u);
assert.match(processingSource, /cleanupEnrollmentImports/u);
assert.match(processingSource, /requeuedDispatches/u);
assert.match(processingSource, /STUDENT_DISPLAY_NAME_MAX/u);
assert.match(processingSource, /EnrollmentImportStatus\.cancelled/u);
assert.match(processingSource, /EnrollmentImportStatus\.partial/u);
assert.match(handoffSource, /secretEnvelope: Prisma\.DbNull/u);
assert.match(handoffSource, /formulaSafe/u);
assert.match(handoffSource, /isManagedPreviewPurpose\(handoff\.preview_purpose\)/u);
assert.match(handoffSource, /user: \{ previewPurpose: null \}/u);
assert.match(handoffRouteSource, /requireAdminSession/u);
assert.match(handoffRouteSource, /Cache-Control.*no-store/u);
assert.match(handoffRouteSource, /Content-Disposition/u);
assert.match(handoffRouteSource, /invalid_origin/u);
assert.match(retryRouteSource, /retryEnrollmentImport/u);
assert.match(retryRouteSource, /isRetryBodyShape/u);
assert.match(retryRouteSource, /expectedGeneration/u);
assert.match(retryRouteSource, /idempotencyKey/u);
assert.match(cancelRouteSource, /cancelEnrollmentImport/u);
assert.match(cancelRouteSource, /requireAdminSession/u);
assert.match(workerSource, /reapExpiredImportRowClaims/u);
assert.match(workerSource, /cleanupEnrollmentImports/u);
assert.match(processingSource, /user: \{ previewPurpose: null \}/u);

console.log("admin import processing contract checks passed");
