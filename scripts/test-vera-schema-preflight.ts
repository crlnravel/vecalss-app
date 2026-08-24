import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assert, expectReject, runChecks } from "./vera-test-support";
import { assertMigrationInventoryComplete } from "@/lib/vera-ai/provenance";
import { defaultVeraPolicyBundle, isCapabilityGranted, resolveVeraQuotaLimit } from "@/lib/vera-ai/policy";
import { assertLegacyFieldReadOnly, assertUnknownRawUsageIsNullable } from "@/lib/vera-ai/legacy-cutover";
import { VERA_APPLY_TARGET_REGISTRY, assertApplyRevision, getApplyTargetContract } from "@/lib/vera-ai/apply-targets";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20260824090000_add_vera_foundation/migration.sql"), "utf8");

await runChecks("vera-schema-preflight", [
  {
    name: "schema contains additive lifecycle, ledger, replay, context, artifact, policy, and attempt contracts",
    run: () => {
      for (const required of [
        "AiRequestLifecycleState",
        "AiUsageLedgerVersion",
        "AiIdempotencyOperation",
        "AiPolicyBundle",
        "AiLifecycleOperation",
        "AiRequestAttempt",
        "AiRequestResultStage",
        "AiContextPack",
        "AiRequestSource",
        "AiArtifactLifecycle",
        "AdaptivePracticeItem",
        "acceptedRequestCount",
        "finalizedRequestCount",
        "dailyAiTokenLimit",
        "dailyAiQuotaLimit",
        "tokenUsageState",
        "usageAccountingState",
        "settlementDeadlineAt",
        "idempotencyEvidenceState",
        "retryOfRequestId",
        "targetEntityRevision",
        "expectedTargetRevision",
        "lifecycleRevision",
        "deletionState",
        "deletionOperationId",
        "claimedRevision",
        "claimedExpectedRevision",
      ]) assert(schema.includes(required), `missing ${required}`);
      for (const required of [
        "@@unique([studentId, usageDate, ledgerVersion])",
        "@@unique([requestId, ordinal])",
        "idempotencyKeyId String",
        "legacy_raw_token_v0",
        "vera_quota_v1",
        "AiLifecycleOperationState",
      ]) assert(schema.includes(required) || migration.includes(required), `missing structural assertion ${required}`);
      assert(/inputTokens\s+Int\?/.test(schema) && /outputTokens\s+Int\?/.test(schema), "raw token fields are not nullable");
    },
  },
  {
    name: "migration is forward-only and preserves unrelated history",
    run: () => {
      assert(!/DROP\s+(TABLE|COLUMN)/i.test(migration), "destructive table/column drop found");
      const changed = execFileSync("git", ["diff", "--name-only", "--", "prisma/migrations"], { encoding: "utf8" })
        .split("\n").map((line) => line.trim()).filter(Boolean);
      const allowedBaseline = "prisma/migrations/20260822110000_admin_student_preview_tryout_restart/migration.sql";
      const unexpected = changed.filter((file) => file !== allowedBaseline);
      assert(unexpected.length === 0, `unexpected existing migration changes: ${unexpected.join(", ")}`);
      assert(migration.includes("ai_policy_bundles"), "policy migration missing");
      assert(migration.includes("ai_content_migration_audits"), "inventory migration missing");
      assert(migration.includes("ai_request_sources_request_id_fkey") && migration.includes("ai_request_sources_pack_request_identity_fkey"), "request/source identity FKs missing");
      assert(migration.includes("ai_context_pack_snapshot_immutable") && migration.includes("ai_request_source_snapshot_immutable"), "snapshot immutability triggers missing");
    },
  },
  {
    name: "legacy content inventory names hidden/system and learner-visible fields",
    run: () => {
      assertMigrationInventoryComplete([
        { sourceTable: "ai_messages", sourceField: "content_markdown", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "ai_messages", sourceField: "role=system", contentClass: "hidden_system", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "ai_messages", sourceField: "metadata", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "ai_messages", sourceField: "metadata:role=system", contentClass: "hidden_system", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "ai_messages", sourceField: "metadata:role=tool", contentClass: "hidden_system", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "ai_conversations", sourceField: "context_entity", contentClass: "content_free", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "weakness_analyses", sourceField: "summary_markdown", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "weakness_analysis_topics", sourceField: "recommendation_text", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "learning_recommendations", sourceField: "reason", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "adaptive_practice_answers", sourceField: "answer_text", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "ai_requests", sourceField: "prompt_template", contentClass: "content_free", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "adaptive_practice_items", sourceField: "prompt_snapshot_ciphertext", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "adaptive_practice_items", sourceField: "option_snapshot_ciphertext", contentClass: "learner_visible", rowCount: 0, unclassifiedPlaintext: 0 },
        { sourceTable: "adaptive_practice_items", sourceField: "scoring_snapshot_ciphertext", contentClass: "hidden_system", rowCount: 0, unclassifiedPlaintext: 0 },
      ]);
      assert(!migration.includes("'plaintext'"), "migration audit must not store plaintext");
      assert(migration.includes("hidden_system"), "hidden system inventory missing");
      assert(migration.includes("zero_rows"), "zero-row proof missing");
      for (const requiredInventorySql of [
        "'ai_messages', 'content_markdown'",
        "'ai_messages', 'role=system'",
        "'ai_messages', 'metadata'",
        "'ai_messages', 'metadata:role=system'",
        "'ai_messages', 'metadata:role=tool'",
        "'ai_conversations', 'context_entity'",
        "'weakness_analyses', 'summary_markdown'",
        "'weakness_analysis_topics', 'recommendation_text'",
        "'learning_recommendations', 'reason'",
        "'adaptive_practice_answers', 'answer_text'",
        "'ai_requests', 'prompt_template'",
        "'adaptive_practice_items', 'prompt_snapshot_ciphertext'",
        "'adaptive_practice_items', 'option_snapshot_ciphertext'",
        "'adaptive_practice_items', 'scoring_snapshot_ciphertext'",
      ]) assert(migration.includes(requiredInventorySql), `missing migration inventory ${requiredInventorySql}`);
    },
  },
  {
    name: "policy seed and pre-effective plan boundary are named",
    run: () => {
      assert(schema.includes("canManageAiPolicy") && schema.includes("canManageAiGovernance"), "capability primitives missing");
      assert(migration.includes("vera-policy-bundle-v1-2026-08-24"), "policy seed version missing");
      assert(migration.includes("vera-quota-v1-2026-08-24"), "quota seed version missing");
      assert(migration.includes("2026-09-01T00:00:00+07:00"), "effective boundary missing");
    },
  },
  {
    name: "pre-effective vera_not_active and post-cutover BillingAccount mapping ignore legacy student limit",
    run: () => {
      const policy = defaultVeraPolicyBundle();
      const before = resolveVeraQuotaLimit({
        now: new Date("2026-08-31T23:59:59+07:00"),
        billing: { planCode: "pro" },
        studentLegacyDailyAiTokenLimit: 1,
        policy,
      });
      assert(!before.active && before.reason === "vera_not_active" && before.limitUnits === 0, "pre-effective admission boundary missing");
      const pro = resolveVeraQuotaLimit({
        now: new Date("2026-09-01T00:00:01+07:00"),
        billing: { planCode: "pro" },
        studentLegacyDailyAiTokenLimit: 1,
        policy,
      });
      const fallback = resolveVeraQuotaLimit({
        now: new Date("2026-09-01T00:00:01+07:00"),
        billing: null,
        studentLegacyDailyAiTokenLimit: 999_999,
        policy,
      });
      const legacyChanged = resolveVeraQuotaLimit({
        now: new Date("2026-09-01T00:00:01+07:00"),
        billing: { planCode: "pro" },
        studentLegacyDailyAiTokenLimit: 999_999,
        policy,
      });
      assert(pro.limitUnits === 20_000 && pro.source === "plan", "BillingAccount plan mapping missing");
      assert(fallback.limitUnits === policy.quotaConfig.defaultDailyLimit && fallback.reason === "billing_default", "missing billing default missing");
      assert(legacyChanged.limitUnits === pro.limitUnits, "legacy dailyAiTokenLimit influenced policy");
      assert(!isCapabilityGranted({ capability: "canManageAiPolicy", active: true, role: "student" }), "capability default deny missing");
    },
  },
  {
    name: "legacy scalar/context and raw-token fields are read-only and unknown usage is not numeric zero",
    run: async () => {
      await expectReject(() => Promise.resolve(assertLegacyFieldReadOnly("ai_messages.content_markdown")), "legacy plaintext write/read was allowed");
      await expectReject(() => Promise.resolve(assertLegacyFieldReadOnly("ai_conversations.context_entity")), "legacy scalar context write/read was allowed");
      await expectReject(() => Promise.resolve(assertUnknownRawUsageIsNullable({ tokenUsageState: "unknown", inputTokens: 0, outputTokens: null })), "unknown usage accepted numeric zero");
    },
  },
  {
    name: "the three Apply targets share one locked revision source and reject arbitrary registries",
    run: async () => {
      const targets = Object.keys(VERA_APPLY_TARGET_REGISTRY);
      assert(targets.length === 3, "Apply registry is not closed to three v1 targets");
      for (const target of targets) {
        const contract = getApplyTargetContract(target);
        assert(contract.revisionColumn === "revision" && contract.lifecycleColumn === "lifecycleState" && contract.lockedRevisionSource === "row_for_update.revision", `target ${target} does not use the shared revision source`);
      }
      assertApplyRevision(0, 0);
      await expectReject(() => Promise.resolve(getApplyTargetContract("arbitrary_table")), "arbitrary Apply target accepted");
      await expectReject(() => Promise.resolve(assertApplyRevision(0, 1)), "stale Apply revision accepted");
    },
  },
]);
