import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../prisma/migrations/20260826100000_add_vera_report_reservations/migration.sql", import.meta.url), "utf8");

for (const marker of [
  "enum AiReportWindowKind",
  "enum AiReportReservationState",
  "enum AiReportReservationResultKind",
  "model AiReportReservation",
  "model AiAdminReportAudit",
  "@@unique([adminPrincipalId, operation, idempotencyKey])",
]) assert.ok(schema.includes(marker), `schema marker missing: ${marker}`);

for (const marker of [
  "CREATE TYPE \"ai_report_window_kind\"",
  "CREATE TABLE \"ai_report_reservations\"",
  "ALTER TABLE \"ai_admin_report_audits\"",
  "CREATE OR REPLACE FUNCTION prevent_ai_admin_report_audit_mutation",
  "ai_admin_report_audits_append_only",
  "ai_report_reservations_principal_operation_key_key",
]) assert.ok(migration.includes(marker), `migration marker missing: ${marker}`);

assert.doesNotMatch(migration, /DROP TABLE/iu, "T9 migration must be forward-only");
assert.doesNotMatch(migration, /DESIGN\.md|PRODUCT\.md|\.env/iu);
assert.ok(migration.includes('CHECK ("cost_units" BETWEEN 1 AND 12)'));
assert.ok(migration.includes('CHECK ("recovery_deadline_at" >= "reserved_at")'));
assert.match(schema, /resultKind\s+AiReportReservationResultKind\?\s+@map\("result_kind"\)/u);

console.log("vera admin usage schema checks passed");
