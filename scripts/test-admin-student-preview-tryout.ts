import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_DEFAULT_SECONDS,
  ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_MAX_SECONDS,
  canonicalizeAdminPreviewReason,
  getPreviewTryoutScheduleStatus,
  isEligiblePreviewTryoutSource,
  previewCurrentAssignmentKey,
  previewRetakeName,
  previewRetakeWindowSeconds,
} from "@/lib/admin/student-preview-tryout-contract";
import { buildAdminStudentPreviewTryoutRoute } from "@/lib/student/preview-routes";

const root = process.cwd();
const now = new Date("2026-01-15T00:00:00.000Z");
const previewStudentId = "11111111-1111-4111-8111-111111111111";
const tryoutId = "22222222-2222-4222-8222-222222222222";

assert.equal(
  canonicalizeAdminPreviewReason("  Ｒｅｓｅｔ  siswa\r\n\tfixture\tTryout  "),
  "Reset siswa\nfixture Tryout",
);
assert.equal(canonicalizeAdminPreviewReason("reason\r\nnext"), "reason\nnext");
assert.throws(() => canonicalizeAdminPreviewReason(" \t\r\n "), /wajib diisi/u);
assert.throws(() => canonicalizeAdminPreviewReason("x".repeat(501)), /maksimal 500/u);

assert.equal(
  getPreviewTryoutScheduleStatus({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "active",
  }, now),
  "active",
);
assert.equal(
  getPreviewTryoutScheduleStatus({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-01-10T00:00:00.000Z"),
    status: "active",
  }, now),
  "closed",
);
assert.equal(
  getPreviewTryoutScheduleStatus({
    availableFrom: new Date("2026-01-20T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "active",
  }, now),
  "future",
);
assert.equal(
  getPreviewTryoutScheduleStatus({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "closed",
  }, now),
  "closed",
);
assert.equal(
  getPreviewTryoutScheduleStatus({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "archived",
  }, now),
  "archived",
);
assert.equal(
  getPreviewTryoutScheduleStatus({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "draft",
  }, now),
  "draft",
);
assert.equal(
  isEligiblePreviewTryoutSource({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "active",
  }, now),
  true,
);
assert.equal(
  isEligiblePreviewTryoutSource({
    availableFrom: new Date("2026-01-01T00:00:00.000Z"),
    availableUntil: new Date("2026-02-01T00:00:00.000Z"),
    status: "archived",
  }, now),
  false,
);
assert.equal(previewCurrentAssignmentKey(previewStudentId, tryoutId), `admin.student-preview:${previewStudentId}:${tryoutId}`);
assert.ok(previewRetakeName("33333333-3333-4333-8333-333333333333").length <= 180);
assert.equal(previewRetakeWindowSeconds({}), ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_DEFAULT_SECONDS);
assert.equal(previewRetakeWindowSeconds({ ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS: "1" }), 1);
assert.equal(previewRetakeWindowSeconds({ ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS: "999999999" }), ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_MAX_SECONDS);
assert.equal(previewRetakeWindowSeconds({ ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS: "not-a-number" }), ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_DEFAULT_SECONDS);

assert.equal(buildAdminStudentPreviewTryoutRoute(), "/admin/student-preview/tryout");
assert.equal(
  buildAdminStudentPreviewTryoutRoute(tryoutId),
  `/admin/student-preview/tryout/${tryoutId}`,
);
assert.throws(() => buildAdminStudentPreviewTryoutRoute("../admin"), /Unsafe admin student preview route/u);

const [readsSource, serviceSource, migrationSource, schemaSource, routeSource, assignmentSource, participantSource, attemptSource, operationsSource, mentorSource] = await Promise.all([
  readFile(resolve(root, "lib/admin/student-preview-tryout-reads.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/student-preview-tryout.ts"), "utf8"),
  readFile(resolve(root, "prisma/migrations/20260822110000_admin_student_preview_tryout_restart/migration.sql"), "utf8"),
  readFile(resolve(root, "prisma/schema.prisma"), "utf8"),
  readFile(resolve(root, "app/admin/student-preview/[[...slug]]/page.tsx"), "utf8"),
  readFile(resolve(root, "lib/tryout/delivery-repository.ts"), "utf8"),
  readFile(resolve(root, "lib/tryout/participant-repository.ts"), "utf8"),
  readFile(resolve(root, "lib/tryout/attempt-repository.ts"), "utf8"),
  readFile(resolve(root, "lib/tryout/operations-view.ts"), "utf8"),
  readFile(resolve(root, "modules/mentor/KaptenTryoutParticipantDetailPageModule.tsx"), "utf8"),
]);

assert.match(readsSource, /PreviewReadBoundary\.run/u);
assert.match(readsSource, /ContentStatus\.published/u);
assert.match(readsSource, /satisfies Prisma\.TryoutPackageSelect/u);
assert.doesNotMatch(readsSource, /(?:create|createMany|update|updateMany|delete|deleteMany|upsert|\$transaction|\$executeRaw|\$queryRaw)\s*\(/u);
assert.doesNotMatch(readsSource, /(?:TryoutAttempt|AttemptAnswer|notification|enqueue|learnerProgress)/u);

assert.match(serviceSource, /pg_advisory_xact_lock/u);
assert.match(serviceSource, /previewStudentId_requestId/u);
assert.match(serviceSource, /TryoutAssignmentStatus\.superseded/u);
assert.match(serviceSource, /expectedCurrentAssignmentId/u);
assert.match(serviceSource, /canonicalReason/u);
assert.match(serviceSource, /canonicalReason: parsed\.canonicalReason/u);
assert.match(serviceSource, /releaseState: AssessmentResultReleaseState\.released/u);
assert.doesNotMatch(serviceSource, /(?:createTryoutAttempt|createAttempt|notification|enqueue|learnerProgress)/u);

assert.match(migrationSource, /ADD VALUE IF NOT EXISTS 'superseded'/u);
assert.match(migrationSource, /admin_preview_tryout_restart_scope_key/u);
assert.match(migrationSource, /UNIQUE \("preview_student_id", "request_id"\)/u);
assert.match(migrationSource, /tryout_delivery_assignments_preview_state_guard/u);
assert.match(migrationSource, /admin_preview_tryout_restarts_scope_guard/u);
assert.match(migrationSource, /preview_current_key/u);
assert.match(migrationSource, /preview_assignment_status_must_be_active_or_superseded/u);
assert.match(migrationSource, /assignment_session_tryout_mismatch/u);
assert.match(schemaSource, /enum TryoutAssignmentStatus[\s\S]*?superseded/u);
assert.match(schemaSource, /model AdminPreviewTryoutRestart[\s\S]*?@@unique\(\[previewStudentId, requestId\]/u);

assert.match(routeSource, /getAdminPreviewTryoutCatalogue/u);
assert.match(routeSource, /getAdminPreviewTryoutDetail/u);
assert.match(routeSource, /kind: "tryout-catalogue"/u);
assert.match(routeSource, /kind: "tryout-detail"/u);
assert.match(assignmentSource, /isManagedPreviewPurpose/u);
assert.match(assignmentSource, /Akun preview admin hanya dapat diakses melalui restart Tryout preview/u);
assert.match(participantSource, /status: TryoutAssignmentStatus\.active/u);
assert.match(attemptSource, /status: TryoutAssignmentStatus\.active/u);
assert.match(operationsSource, /status: assignment\.status/u);
assert.match(mentorSource, /assignment\.status === "active"/u);

console.log("Admin student preview Tryout contract checks passed.");
