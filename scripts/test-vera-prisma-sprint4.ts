import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260826090000_add_vera_policy_console/migration.sql", "utf8");
const correctionMigration = readFileSync("prisma/migrations/20260826110000_harden_vera_sprint4_preview/migration.sql", "utf8");
const policyService = readFileSync("lib/admin/ai-policy/service.ts", "utf8");
const usageService = readFileSync("lib/admin/ai-usage/service.ts", "utf8");
const runtimeFixture = readFileSync("scripts/test-vera-prisma-sprint4-runtime.ts", "utf8");
const policyUi = readFileSync("modules/admin/AiPolicyPageModule.tsx", "utf8");
const priorFixtures = [
  "scripts/test-vera-prisma-sprint2.ts",
  "scripts/test-vera-prisma-sprint3.ts",
  "scripts/test-vera-http-sprint3.ts",
].map((file) => readFileSync(file, "utf8"));

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
check(schema.includes("resultKind            AiAdminCommandResultKind @map(\"result_kind\")"), "command result kind maps to the additive SQL column");
check(migration.includes("CHECK (\"provider_gate_state\" = 'open_blocked')"), "provider gate is database-enforced closed");
check(migration.includes("policy audit history is append-only"), "audit trigger is append-only");
check(migration.includes("policy editor actor set is append-only"), "editor set cannot shrink");
check(migration.includes("ai_policy_bundles_active_unique"), "one active bundle is enforced");
check(migration.includes("ai_policy_bundles_scheduled_unique"), "one scheduled successor is enforced");
check(migration.includes("ai_policy_approval_snapshots_audit_event_key"), "approval snapshot audit link is unique");
check(migration.includes("ai_admin_command_ledgers_principal_operation_key"), "command identity is unique per principal and operation");
check(correctionMigration.includes("preview_reservation_uuid"), "preview reservation has a typed durable command link");
check(correctionMigration.includes("pending_approval' AND NEW.\"state\" = 'scheduled'"), "schedule boundary is the only non-draft effectiveAt/digest exception");
check(correctionMigration.includes("non-draft policy bundle content is immutable"), "production non-draft policy immutability remains enforced");
for (const operation of operations) check(schema.includes(operation), `operation ${operation} is closed and persisted`);
check(!migration.includes("AiReportReservation"), "T9 report reservation ownership is not duplicated");
check(!schema.includes("providerGateState   AiProviderGateState @default(release_ready)"), "release_ready is not a default");
check(policyService.includes("createPolicyPreviewReservationAdapter"), "production policy service wires the shared preview reservation adapter");
check(policyService.includes("VeraAdminUsageError"), "policy preview maps shared budget errors to typed policy errors");
check(policyService.includes("transaction: tx"), "preview reservation and completion share the command transaction");
check(policyService.includes("buildPolicyPreviewEffects"), "aggregate preview reads real durable populations");
check(policyService.includes("ensureEffectivePolicyBoundary(tx, now"), "preview uses the DB-clock policy boundary");
check(usageService.includes("admin_policy_preview"), "shared usage service owns the policy-preview operation");
check(usageService.includes("Math.max(0, effective.policy.reportConfig.requestLimit - burst.requestCount)"), "Redis burst admission is rehydrated from the durable window");
check(usageService.indexOf("existing.state === AiReportReservationState.expired") < usageService.indexOf("existing.request_fingerprint !== input.requestFingerprint"), "preview expiry wins before fingerprint comparison");
check(usageService.includes("localDateSpan: { from: query.from, to: query.to }"), "preview audit persists the exact local range");
check(runtimeFixture.includes("const runCommandRace"), "runtime fixture executes concurrent command races through the real service");
for (const operation of ["create", "edit", "validate", "preview", "approve", "schedule", "activate", "rollback", "retention"]) {
  check(runtimeFixture.includes(`\"${operation}\"`), `runtime fixture covers the ${operation} command race`);
}
check(runtimeFixture.includes("runPartitionFault") && runtimeFixture.includes("partial_unavailable"), "runtime fixture covers partition-local aggregate faults");
check(runtimeFixture.includes("const fixtureNamespace = `vera-sprint4-runtime-${randomUUID()}`"), "runtime fixture is namespaced for repeatable isolated runs");
for (const marker of ["dirtySections", "markDirty(\"quota\")", "patch.quotaConfig", "patch.settlementConfig", "patch.reportConfig", "patch.retentionConfig"]) {
  check(policyUi.includes(marker), `policy UI submits only dirty ${marker} sections`);
}
for (const fixture of priorFixtures) {
  check(fixture.indexOf('data: { state: "draft" }') < fixture.indexOf('data: { state: "active"'), "disposable fixture stages policy rows before active content normalization");
}
console.log(`PASS vera-prisma-sprint4: ${checks} checks`);
