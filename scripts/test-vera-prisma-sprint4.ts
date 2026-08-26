import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260826090000_add_vera_policy_console/migration.sql", "utf8");

const operations = [
  "ai_policy_draft_create",
  "ai_policy_draft_edit",
  "ai_policy_validate",
  "ai_policy_preview",
  "ai_policy_approve",
  "ai_policy_schedule",
  "ai_policy_activate",
  "ai_policy_rollback",
  "ai_policy_retention_extension_request",
];
let checks = 0;
function check(condition: boolean, message: string) {
  checks += 1;
  if (!condition) throw new Error(`FAIL vera-prisma-sprint4: ${message}`);
}

check(schema.includes("model AiPolicyApprovalSnapshot"), "approval snapshots are modeled");
check(schema.includes("model AiAdminCommandLedger"), "policy command ledger is modeled");
check(schema.includes("previewMode           AiPolicyPreviewMode?"), "preview replay metadata is typed");
check(migration.includes("CHECK (\"provider_gate_state\" = 'open_blocked')"), "provider gate is database-enforced closed");
check(migration.includes("policy audit history is append-only"), "audit trigger is append-only");
check(migration.includes("policy editor actor set is append-only"), "editor set cannot shrink");
check(migration.includes("ai_policy_bundles_active_unique"), "one active bundle is enforced");
check(migration.includes("ai_policy_bundles_scheduled_unique"), "one scheduled successor is enforced");
check(migration.includes("ai_policy_approval_snapshots_audit_event_key"), "approval snapshot audit link is unique");
check(migration.includes("ai_admin_command_ledgers_principal_operation_key"), "command identity is unique per principal and operation");
for (const operation of operations) check(schema.includes(operation), `operation ${operation} is closed and persisted`);
check(!migration.includes("AiReportReservation"), "T9 report reservation ownership is not duplicated");
check(!schema.includes("providerGateState   AiProviderGateState @default(release_ready)"), "release_ready is not a default");
console.log(`PASS vera-prisma-sprint4: ${checks} checks`);

