-- CreateEnum
CREATE TYPE "ai_request_lifecycle_state" AS ENUM ('pending', 'staged', 'succeeded', 'fallback', 'failed');

-- CreateEnum
CREATE TYPE "ai_token_usage_state" AS ENUM ('known', 'unknown', 'not_applicable');

-- Legacy provider telemetry is retained verbatim while this classification
-- records whether the old row was provably populated or ambiguous.
CREATE TYPE "ai_legacy_usage_state" AS ENUM ('known', 'ambiguous', 'not_applicable');

-- CreateEnum
CREATE TYPE "ai_usage_accounting_state" AS ENUM ('known', 'unknown', 'overrun_debt');

-- CreateEnum
CREATE TYPE "ai_usage_ledger_version" AS ENUM ('legacy_raw_token_v0', 'vera_quota_v1');

-- CreateEnum
CREATE TYPE "ai_idempotency_operation" AS ENUM ('conversation_create', 'ai_request', 'artifact_apply', 'learning_recommendation_create', 'export_create', 'conversation_delete', 'artifact_delete');

-- CreateEnum
CREATE TYPE "ai_idempotency_state" AS ENUM ('rejected', 'accepted', 'expired');

-- CreateEnum
CREATE TYPE "ai_rejection_class" AS ENUM ('transient', 'terminal');

-- CreateEnum
CREATE TYPE "ai_idempotency_result_kind" AS ENUM ('none', 'request', 'conversation', 'artifact_apply', 'learning_recommendation', 'export_job', 'conversation_delete', 'artifact_delete');

-- CreateEnum
CREATE TYPE "ai_idempotency_tombstone_code" AS ENUM ('target_unavailable', 'account_deleted', 'retention_expired', 'idempotency_key_expired');

-- CreateEnum
CREATE TYPE "ai_context_source_type" AS ENUM ('practice', 'material', 'document');

-- CreateEnum
CREATE TYPE "ai_context_snapshot_state" AS ENUM ('available', 'purging', 'purged');

-- CreateEnum
CREATE TYPE "ai_context_provenance_state" AS ENUM ('reconstructable', 'unavailable');

-- CreateEnum
CREATE TYPE "ai_purge_state" AS ENUM ('available', 'purging', 'purged');

-- CreateEnum
CREATE TYPE "ai_policy_state" AS ENUM ('draft', 'pending_approval', 'scheduled', 'active', 'retired', 'rejected');

-- CreateEnum
CREATE TYPE "ai_policy_audit_action" AS ENUM ('created', 'validated', 'rejected', 'submitted', 'approved', 'scheduled', 'activated', 'retired', 'rolled_back');

-- CreateEnum
CREATE TYPE "ai_attempt_state" AS ENUM ('prepared', 'sent', 'accepted', 'completed', 'ambiguous', 'failed');

-- CreateEnum
CREATE TYPE "ai_attempt_result_kind" AS ENUM ('none', 'success', 'discarded');

-- CreateEnum
CREATE TYPE "ai_result_stage_state" AS ENUM ('available', 'consumed', 'purged');

-- CreateEnum
CREATE TYPE "ai_result_kind" AS ENUM ('success', 'fallback', 'discarded', 'none');

-- CreateEnum
CREATE TYPE "ai_settlement_kind" AS ENUM ('result', 'usage_only', 'conservative_reservation');

-- CreateEnum
CREATE TYPE "ai_artifact_type" AS ENUM ('analysis', 'route', 'drill', 'review', 'ptn', 'summary');

-- CreateEnum
CREATE TYPE "ai_artifact_provenance_kind" AS ENUM ('request', 'typed_entity');

-- CreateEnum
CREATE TYPE "ai_artifact_lifecycle_state" AS ENUM ('visible', 'expired', 'purging', 'purged');

-- CreateEnum
CREATE TYPE "ai_deletion_state" AS ENUM ('active', 'deletion_pending', 'deleted');

-- CreateEnum
CREATE TYPE "ai_lifecycle_operation_state" AS ENUM ('pending', 'completed', 'conflict', 'expired');

-- CreateEnum
CREATE TYPE "ai_artifact_apply_state" AS ENUM ('applied', 'target_unavailable', 'purged');

-- CreateEnum
CREATE TYPE "ai_target_lifecycle_state" AS ENUM ('active', 'deleted', 'tombstoned');

-- CreateEnum
CREATE TYPE "ai_content_lifecycle_state" AS ENUM ('encrypted', 'legacy_plaintext', 'retired', 'purged');

-- CreateEnum
CREATE TYPE "ai_migration_content_class" AS ENUM ('learner_visible', 'hidden_system', 'content_free');

-- CreateEnum
CREATE TYPE "ai_migration_state" AS ENUM ('pending', 'encrypted', 'zero_rows', 'retired', 'blocked');

-- CreateEnum
CREATE TYPE "ai_capability_name" AS ENUM ('canManageAiPolicy', 'canManageAiGovernance');

-- CreateEnum
CREATE TYPE "ai_admission_reason" AS ENUM ('quota', 'quota_overrun_lock', 'burst', 'concurrency', 'redis_unavailable');

-- CreateEnum
CREATE TYPE "ai_report_budget_state" AS ENUM ('active', 'exhausted', 'expired');

-- DropIndex
DROP INDEX "ai_usage_daily_student_id_usage_date_key";

-- AlterTable
ALTER TABLE "student_profiles" ADD COLUMN     "daily_ai_quota_limit" INTEGER;

-- AlterTable
ALTER TABLE "learning_recommendations" ADD COLUMN     "claimed_revision" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "deletion_operation_id" UUID,
ADD COLUMN     "deletion_state" "ai_deletion_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "lifecycle_state" "ai_target_lifecycle_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ai_conversations" ADD COLUMN     "claimed_version" INTEGER,
ADD COLUMN     "context_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletion_operation_id" UUID,
ADD COLUMN     "deletion_state" "ai_deletion_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ai_messages" ADD COLUMN     "content_digest" VARCHAR(128),
ADD COLUMN     "content_envelope" JSONB,
ADD COLUMN     "content_state" "ai_content_lifecycle_state" NOT NULL DEFAULT 'legacy_plaintext',
ALTER COLUMN "content_markdown" DROP NOT NULL;

ALTER TABLE "ai_messages" ALTER COLUMN "content_state" SET DEFAULT 'encrypted';

-- AlterTable
ALTER TABLE "ai_requests" ADD COLUMN     "assistant_message_id" UUID,
ADD COLUMN     "behavior_version" VARCHAR(40) NOT NULL DEFAULT '1',
ADD COLUMN     "client_request_id" VARCHAR(160),
ADD COLUMN     "completed_at" TIMESTAMPTZ,
ADD COLUMN     "context_pack_version" VARCHAR(40) NOT NULL DEFAULT '1',
ADD COLUMN     "fallback_reason" VARCHAR(120),
ADD COLUMN     "feature_key" VARCHAR(80),
ADD COLUMN     "finalized_at" TIMESTAMPTZ,
ADD COLUMN     "fingerprint_key_version" VARCHAR(40),
ADD COLUMN     "first_token_at" TIMESTAMPTZ,
ADD COLUMN     "gateway" VARCHAR(80),
ADD COLUMN     "hard_output_quota_units" INTEGER,
ADD COLUMN     "idempotency_evidence_state" VARCHAR(30) NOT NULL DEFAULT 'active',
ADD COLUMN     "idempotency_key_id" UUID,
ADD COLUMN     "max_provider_attempts" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "observed_upstream_provider_slug" VARCHAR(160),
ADD COLUMN     "output_schema_version" VARCHAR(40) NOT NULL DEFAULT '1',
ADD COLUMN     "policy_bundle_version" VARCHAR(120),
ADD COLUMN     "provider_endpoint_digest" VARCHAR(128),
ADD COLUMN     "provider_request_ref" VARCHAR(160),
ADD COLUMN     "provider_task_digest" VARCHAR(128),
ADD COLUMN     "quota_overrun_units" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quota_policy_version" VARCHAR(80),
ADD COLUMN     "quota_units_consumed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quota_units_reserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_usage_state" "ai_legacy_usage_state" NOT NULL DEFAULT 'ambiguous',
ADD COLUMN     "request_fingerprint" VARCHAR(128),
ADD COLUMN     "retention_policy_version" VARCHAR(80),
ADD COLUMN     "retry_of_request_id" UUID,
ADD COLUMN     "routing_policy_version" VARCHAR(80),
ADD COLUMN     "settlement_deadline_at" TIMESTAMPTZ,
ADD COLUMN     "started_at" TIMESTAMPTZ,
ADD COLUMN     "time_to_first_token_ms" INTEGER,
ADD COLUMN     "token_usage_state" "ai_token_usage_state" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "upstream_provider" VARCHAR(80),
ADD COLUMN     "upstream_provider_slug" VARCHAR(160),
ADD COLUMN     "usage_accounting_state" "ai_usage_accounting_state" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "user_message_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "input_tokens" DROP NOT NULL,
ALTER COLUMN "input_tokens" DROP DEFAULT,
ALTER COLUMN "output_tokens" DROP NOT NULL,
ALTER COLUMN "output_tokens" DROP DEFAULT,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "ai_request_lifecycle_state" USING "status"::text::"ai_request_lifecycle_state";

ALTER TABLE "ai_requests" ALTER COLUMN "status" SET DEFAULT 'pending';

-- Preserve legacy provider telemetry verbatim. Non-zero pairs are provably
-- populated legacy evidence; all-zero/null pairs are explicitly ambiguous
-- legacy evidence and therefore are not relabeled as known Vera usage.
UPDATE "ai_requests"
SET "legacy_usage_state" = CASE
      WHEN "input_tokens" IS NULL OR "output_tokens" IS NULL
        OR ("input_tokens" = 0 AND "output_tokens" = 0)
        THEN 'ambiguous'::"ai_legacy_usage_state"
      ELSE 'known'::"ai_legacy_usage_state"
    END,
    "token_usage_state" = CASE
      WHEN "input_tokens" IS NULL OR "output_tokens" IS NULL
        OR ("input_tokens" = 0 AND "output_tokens" = 0)
        THEN 'not_applicable'::"ai_token_usage_state"
      ELSE 'known'::"ai_token_usage_state"
    END,
    "usage_accounting_state" = CASE
      WHEN "status" IN ('succeeded', 'fallback', 'failed')
        AND "input_tokens" IS NOT NULL AND "output_tokens" IS NOT NULL
        AND NOT ("input_tokens" = 0 AND "output_tokens" = 0)
        THEN 'known'::"ai_usage_accounting_state"
      ELSE 'unknown'::"ai_usage_accounting_state"
    END;

ALTER TABLE "ai_requests"
  ALTER COLUMN "legacy_usage_state" SET DEFAULT 'not_applicable';

-- AlterTable
ALTER TABLE "ai_usage_daily" ADD COLUMN     "accepted_request_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "finalized_request_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ledger_version" "ai_usage_ledger_version" NOT NULL DEFAULT 'legacy_raw_token_v0',
ADD COLUMN     "policy_bundle_version" VARCHAR(120),
ADD COLUMN     "quota_debt_units" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quota_limit_units_snapshot" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "quota_overrun_lock_until" TIMESTAMPTZ,
ADD COLUMN     "quota_timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
ADD COLUMN     "quota_timezone_policy_version" VARCHAR(40),
ADD COLUMN     "reserved_quota_units" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "used_quota_units" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "legacy_usage_state" "ai_legacy_usage_state" NOT NULL DEFAULT 'ambiguous',
ALTER COLUMN "prompt_tokens" DROP NOT NULL,
ALTER COLUMN "prompt_tokens" DROP DEFAULT,
ALTER COLUMN "completion_tokens" DROP NOT NULL,
ALTER COLUMN "completion_tokens" DROP DEFAULT,
ALTER COLUMN "limit_tokens" DROP NOT NULL;

UPDATE "ai_usage_daily"
SET "legacy_usage_state" = CASE
      WHEN "prompt_tokens" IS NULL OR "completion_tokens" IS NULL
        OR ("prompt_tokens" = 0 AND "completion_tokens" = 0)
        THEN 'ambiguous'::"ai_legacy_usage_state"
      ELSE 'known'::"ai_legacy_usage_state"
    END,
    "accepted_request_count" = GREATEST("request_count", 0),
    "finalized_request_count" = LEAST(
      GREATEST("request_count", 0),
      (
        SELECT COUNT(*)::integer
        FROM "ai_requests" r
        WHERE r."student_id" = "ai_usage_daily"."student_id"
          AND r."created_at"::date = "ai_usage_daily"."usage_date"
          AND r."status" IN ('succeeded', 'fallback', 'failed')
      )
    )
WHERE "ledger_version" = 'legacy_raw_token_v0';

ALTER TABLE "ai_usage_daily"
  ALTER COLUMN "ledger_version" SET DEFAULT 'vera_quota_v1',
  ALTER COLUMN "legacy_usage_state" SET DEFAULT 'not_applicable';

-- AlterTable
ALTER TABLE "adaptive_practice_sessions" ADD COLUMN     "claimed_revision" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "deletion_operation_id" UUID,
ADD COLUMN     "deletion_state" "ai_deletion_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "lifecycle_state" "ai_target_lifecycle_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "adaptive_practice_answers" ADD COLUMN     "adaptive_practice_item_id" UUID;

-- AlterTable
ALTER TABLE "ptn_strategy_sessions" ADD COLUMN     "claimed_revision" INTEGER,
ADD COLUMN     "deleted_at" TIMESTAMPTZ,
ADD COLUMN     "deletion_operation_id" UUID,
ADD COLUMN     "deletion_state" "ai_deletion_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "lifecycle_state" "ai_target_lifecycle_state" NOT NULL DEFAULT 'active',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ai_policy_bundles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bundle_version" VARCHAR(120) NOT NULL,
    "config_schema_version" VARCHAR(40) NOT NULL,
    "state" "ai_policy_state" NOT NULL DEFAULT 'draft',
    "effective_at" TIMESTAMPTZ NOT NULL,
    "supersedes_bundle_id" UUID,
    "quota_config" JSONB NOT NULL,
    "settlement_config" JSONB NOT NULL,
    "report_config" JSONB NOT NULL,
    "retention_config" JSONB NOT NULL,
    "validation_digest" VARCHAR(128) NOT NULL,
    "change_reason" VARCHAR(500),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "activated_at" TIMESTAMPTZ,

    CONSTRAINT "ai_policy_bundles_pkey" PRIMARY KEY ("id")
);

-- Immutable system seed. The nullable creator is intentional for an empty
-- database; a later policy command must attribute every operator-authored
-- bundle to a real capability-checked user.
INSERT INTO "ai_policy_bundles" (
  "bundle_version", "config_schema_version", "state", "effective_at",
  "quota_config", "settlement_config", "report_config", "retention_config",
  "validation_digest", "change_reason"
) SELECT * FROM (VALUES (
  'vera-policy-bundle-v1-2026-08-24', 'vera-policy-v1', 'scheduled'::ai_policy_state,
  '2026-09-01T00:00:00+07:00'::timestamptz,
  '{"defaultDailyLimit":10000,"quotaVersion":"vera-quota-v1-2026-08-24","maxProviderAttempts":2,"modes":{"vera.chat":{"inputBound":4000,"hardOutputCap":1500,"reservationBound":5500},"vera.analysis":{"inputBound":4500,"hardOutputCap":1800,"reservationBound":6300},"vera.route":{"inputBound":4500,"hardOutputCap":1800,"reservationBound":6300},"vera.drill":{"inputBound":3500,"hardOutputCap":2000,"reservationBound":5500},"vera.review":{"inputBound":4000,"hardOutputCap":1600,"reservationBound":5600},"vera.ptn":{"inputBound":4500,"hardOutputCap":1800,"reservationBound":6300},"vera.summary":{"inputBound":4500,"hardOutputCap":1600,"reservationBound":6100}}}'::jsonb,
  '{"maxPendingAgeMinutes":120}'::jsonb,
  '{"unitLimit":60,"requestLimit":10,"minimumGroupSize":5,"maxRangeDays":31}'::jsonb,
  '{"stageTtlHours":24,"contextEvidenceTtlDays":30,"acceptedKeyTtlDays":90,"rejectedKeyTtlHours":24,"tombstoneTtlDays":90,"admissionTelemetryTtlDays":90,"operationalMetadataTtlDays":365}'::jsonb,
  md5('vera-policy-bundle-v1-2026-08-24:vera-policy-v1'),
  'System seed; operator attribution is required for later policy commands'
)) AS seed("bundle_version", "config_schema_version", "state", "effective_at", "quota_config", "settlement_config", "report_config", "retention_config", "validation_digest", "change_reason")
WHERE NOT EXISTS (
  SELECT 1 FROM "ai_policy_bundles" existing
  WHERE existing."bundle_version" = seed."bundle_version"
);

-- CreateTable
CREATE TABLE "ai_policy_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bundle_id" UUID NOT NULL,
    "action" "ai_policy_audit_action" NOT NULL,
    "actor_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diff_digest" VARCHAR(128),
    "reason" VARCHAR(500),

    CONSTRAINT "ai_policy_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_capability_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "capability" "ai_capability_name" NOT NULL,
    "user_id" UUID,
    "role" "role_name",
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_capability_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_content_migration_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_table" VARCHAR(120) NOT NULL,
    "source_field" VARCHAR(120) NOT NULL,
    "source_object_id" UUID,
    "content_class" "ai_migration_content_class" NOT NULL,
    "source_digest" VARCHAR(128),
    "envelope_reference" VARCHAR(240),
    "migration_version" VARCHAR(80) NOT NULL,
    "state" "ai_migration_state" NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_content_migration_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "operation" "ai_idempotency_operation" NOT NULL,
    "client_request_id" VARCHAR(160) NOT NULL,
    "request_fingerprint" VARCHAR(128) NOT NULL,
    "fingerprint_key_version" VARCHAR(40) NOT NULL,
    "policy_bundle_version" VARCHAR(120),
    "retention_policy_version" VARCHAR(80),
    "state" "ai_idempotency_state" NOT NULL DEFAULT 'rejected',
    "rejection_class" "ai_rejection_class",
    "rejection_code" VARCHAR(80),
    "tombstone_code" "ai_idempotency_tombstone_code",
    "result_kind" "ai_idempotency_result_kind" NOT NULL DEFAULT 'none',
    "result_id" UUID,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ,
    "terminal_at" TIMESTAMPTZ,
    "settlement_deadline_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- Typed lifecycle jobs/tombstones are separate replay targets; they never
-- assume that an idempotency row points to an AiRequest.
-- CreateTable
CREATE TABLE "ai_lifecycle_operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "idempotency_key_id" UUID NOT NULL,
    "operation" "ai_idempotency_operation" NOT NULL,
    "result_kind" "ai_idempotency_result_kind" NOT NULL,
    "state" "ai_lifecycle_operation_state" NOT NULL DEFAULT 'pending',
    "target_entity_type" VARCHAR(100),
    "target_entity_id" UUID,
    "expected_conversation_version" INTEGER,
    "claimed_conversation_version" INTEGER,
    "expected_lifecycle_revision" INTEGER,
    "claimed_lifecycle_revision" INTEGER,
    "delete_mode" VARCHAR(40),
    "export_format" VARCHAR(40),
    "export_scope" VARCHAR(80),
    "export_conversation_id" UUID,
    "requested_policy_version" VARCHAR(120),
    "export_version" VARCHAR(40),
    "export_as_of" TIMESTAMPTZ,
    "export_expires_at" TIMESTAMPTZ,
    "status_code" VARCHAR(80),
    "result_state" VARCHAR(40),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "ai_lifecycle_operations_pkey" PRIMARY KEY ("id")
);

-- Preserve legacy request identity without fabricating completion evidence.
-- Provably terminal rows retain a typed request target; pending rows receive a
-- terminal, non-replayable reconciliation tombstone until a later worker can
-- establish their actual outcome.
INSERT INTO "ai_idempotency_keys" (
    "student_id", "operation", "client_request_id", "request_fingerprint",
    "fingerprint_key_version", "policy_bundle_version", "retention_policy_version",
    "state", "rejection_class", "rejection_code", "tombstone_code",
    "result_kind", "result_id", "first_seen_at", "last_seen_at",
    "accepted_at", "terminal_at", "expires_at"
)
SELECT
    r."student_id", 'ai_request', 'legacy-' || r."id"::text,
    md5('legacy.raw-token-v0:' || r."id"::text), 'legacy.raw-token-v0',
    NULL, 'legacy.raw-token-v0',
    CASE WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN 'accepted'::"ai_idempotency_state" ELSE 'rejected'::"ai_idempotency_state" END,
    CASE WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN NULL ELSE 'terminal'::"ai_rejection_class" END,
    CASE WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN NULL ELSE 'legacy_unreconciled' END,
    CASE WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN NULL ELSE 'target_unavailable'::"ai_idempotency_tombstone_code" END,
    CASE WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN 'request'::"ai_idempotency_result_kind" ELSE 'none'::"ai_idempotency_result_kind" END,
    CASE WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN r."id" ELSE NULL END,
    r."created_at", r."created_at", NULL, NULL,
    CURRENT_TIMESTAMP + interval '90 days'
FROM "ai_requests" r;

UPDATE "ai_requests" r
SET "idempotency_key_id" = k."id",
    "client_request_id" = k."client_request_id",
    "request_fingerprint" = k."request_fingerprint",
    "fingerprint_key_version" = k."fingerprint_key_version",
    "feature_key" = COALESCE(r."prompt_template", 'legacy.ai_request'),
    "idempotency_evidence_state" = CASE
      WHEN r."status" IN ('succeeded', 'fallback', 'failed') THEN 'legacy_reconciled'
      ELSE 'legacy_unreconciled'
    END
FROM "ai_idempotency_keys" k
WHERE k."client_request_id" = 'legacy-' || r."id"::text
  AND k."operation" = 'ai_request';

UPDATE "ai_requests"
SET "client_request_id" = COALESCE("client_request_id", 'legacy-' || "id"::text),
    "request_fingerprint" = COALESCE("request_fingerprint", md5('legacy.raw-token-v0:' || "id"::text)),
    "fingerprint_key_version" = COALESCE("fingerprint_key_version", 'legacy.raw-token-v0'),
    "feature_key" = COALESCE("feature_key", 'legacy.ai_request');

ALTER TABLE "ai_requests"
  ALTER COLUMN "client_request_id" SET NOT NULL,
  ALTER COLUMN "request_fingerprint" SET NOT NULL,
  ALTER COLUMN "fingerprint_key_version" SET NOT NULL,
  ALTER COLUMN "feature_key" SET NOT NULL,
  ALTER COLUMN "idempotency_key_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "ai_conversation_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "source_type" "ai_context_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "title_snapshot" VARCHAR(220),
    "content_digest" VARCHAR(128),
    "sort_order" INTEGER NOT NULL,
    "selection_digest" VARCHAR(128) NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_context_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "pack_schema_version" VARCHAR(40) NOT NULL,
    "context_pack_version" VARCHAR(40) NOT NULL,
    "ordered_block_manifest_json" JSONB NOT NULL,
    "normalized_task_ciphertext" JSONB,
    "canonical_encoding" VARCHAR(40) NOT NULL DEFAULT 'utf-8-json',
    "canonical_bytes_ciphertext" JSONB,
    "byte_count" INTEGER NOT NULL,
    "pack_digest" VARCHAR(128) NOT NULL,
    "truncation_json" JSONB,
    "redaction_policy_version" VARCHAR(40) NOT NULL,
    "conversation_message_manifest_ciphertext" JSONB,
    "system_policy_hash" VARCHAR(128) NOT NULL,
    "prompt_template_hash" VARCHAR(128) NOT NULL,
    "tool_schema_hash" VARCHAR(128) NOT NULL,
    "provider_task_digest" VARCHAR(128),
    "provenance_state" "ai_context_provenance_state" NOT NULL DEFAULT 'reconstructable',
    "purge_state" "ai_purge_state" NOT NULL DEFAULT 'available',
    "retention_class" VARCHAR(80) NOT NULL,
    "retention_policy_version" VARCHAR(80) NOT NULL,
    "purge_at" TIMESTAMPTZ NOT NULL,
    "purge_started_at" TIMESTAMPTZ,
    "purged_at" TIMESTAMPTZ,
    "purge_reason" VARCHAR(160),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_context_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_request_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "context_pack_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "source_type" "ai_context_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "citation_key" VARCHAR(80) NOT NULL,
    "source_version_id" UUID,
    "title_snapshot" VARCHAR(220),
    "citation_label" VARCHAR(220),
    "content_digest" VARCHAR(128) NOT NULL,
    "bounded_snapshot_ciphertext" JSONB,
    "snapshot_encoding" VARCHAR(40) NOT NULL DEFAULT 'utf-8-json',
    "snapshot_bytes" INTEGER NOT NULL DEFAULT 0,
    "truncation_json" JSONB,
    "redaction_policy_version" VARCHAR(40) NOT NULL,
    "retention_policy_version" VARCHAR(80) NOT NULL,
    "purge_at" TIMESTAMPTZ NOT NULL,
    "snapshot_state" "ai_context_snapshot_state" NOT NULL DEFAULT 'available',
    "purge_started_at" TIMESTAMPTZ,
    "purged_at" TIMESTAMPTZ,
    "purge_reason" VARCHAR(160),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_request_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_request_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "gateway" VARCHAR(80) NOT NULL,
    "upstream_provider" VARCHAR(80) NOT NULL,
    "upstream_provider_slug" VARCHAR(160),
    "model" VARCHAR(120) NOT NULL,
    "provider_idempotency_key" VARCHAR(160),
    "observed_upstream_provider_slug" VARCHAR(160),
    "state" "ai_attempt_state" NOT NULL DEFAULT 'prepared',
    "result_kind" "ai_attempt_result_kind" NOT NULL DEFAULT 'none',
    "provider_request_ref" VARCHAR(160),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "quota_units_consumed" INTEGER,
    "token_usage_state" "ai_token_usage_state" NOT NULL DEFAULT 'unknown',
    "error_code" VARCHAR(100),
    "release_manifest_digest" VARCHAR(128),
    "privacy_evidence_digest" VARCHAR(128),
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "ai_request_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_request_result_stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "state" "ai_result_stage_state" NOT NULL DEFAULT 'available',
    "result_kind" "ai_result_kind" NOT NULL DEFAULT 'none',
    "normalized_result_ciphertext" JSONB,
    "result_digest" VARCHAR(128),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "quota_units_consumed" INTEGER,
    "token_usage_state" "ai_token_usage_state" NOT NULL DEFAULT 'unknown',
    "settlement_kind" "ai_settlement_kind" NOT NULL DEFAULT 'conservative_reservation',
    "provider_request_ref" VARCHAR(160),
    "gateway" VARCHAR(80),
    "upstream_provider" VARCHAR(80),
    "upstream_provider_slug" VARCHAR(160),
    "model" VARCHAR(120),
    "staged_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "retention_policy_version" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_request_result_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_admission_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "local_quota_date" DATE NOT NULL,
    "quota_timezone" VARCHAR(64) NOT NULL,
    "quota_timezone_policy_version" VARCHAR(40),
    "policy_bundle_version" VARCHAR(120),
    "quota_offset_minutes" INTEGER,
    "feature_key" VARCHAR(80),
    "behavior_version" VARCHAR(40),
    "gateway" VARCHAR(80),
    "upstream_provider" VARCHAR(80),
    "upstream_provider_slug" VARCHAR(160),
    "model" VARCHAR(120),
    "reason" "ai_admission_reason" NOT NULL,
    "idempotency_key_id" UUID,

    CONSTRAINT "ai_admission_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_key" VARCHAR(120) NOT NULL,
    "revision" INTEGER NOT NULL,
    "request_id" UUID,
    "student_id" UUID NOT NULL,
    "conversation_id" UUID,
    "artifact_type" "ai_artifact_type" NOT NULL,
    "provenance_kind" "ai_artifact_provenance_kind" NOT NULL,
    "title_ciphertext" JSONB,
    "content_markdown_ciphertext" JSONB,
    "payload_ciphertext" JSONB,
    "artifact_schema_version" VARCHAR(40) NOT NULL,
    "source_entity_type" VARCHAR(100),
    "source_entity_id" UUID,
    "source_entity_revision" INTEGER,
    "source_entity_digest" VARCHAR(128),
    "content_digest" VARCHAR(128) NOT NULL,
    "render_version" VARCHAR(40) NOT NULL,
    "retention_policy_version" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "ai_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_artifact_lifecycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_revision_id" UUID NOT NULL,
    "state" "ai_artifact_lifecycle_state" NOT NULL DEFAULT 'visible',
    "lifecycle_revision" INTEGER NOT NULL DEFAULT 0,
    "deletion_state" "ai_deletion_state" NOT NULL DEFAULT 'active',
    "deletion_operation_id" UUID,
    "claimed_expected_revision" INTEGER,
    "reason" VARCHAR(160),
    "deletion_claim_token" VARCHAR(160),
    "claim_expires_at" TIMESTAMPTZ,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" UUID,
    "purge_digest" VARCHAR(128),

    CONSTRAINT "ai_artifact_lifecycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_artifact_applies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key_id" UUID NOT NULL,
    "artifact_revision_id" UUID NOT NULL,
    "target_entity_type" VARCHAR(100) NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "expected_target_revision" INTEGER NOT NULL,
    "target_entity_revision" INTEGER NOT NULL,
    "target_entity_digest" VARCHAR(128),
    "apply_state" "ai_artifact_apply_state" NOT NULL DEFAULT 'applied',
    "applied_by_student_id" UUID NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purged_at" TIMESTAMPTZ,
    "purge_reason" VARCHAR(160),

    CONSTRAINT "ai_artifact_applies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptive_practice_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adaptive_session_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "question_id" UUID NOT NULL,
    "question_revision_id" UUID NOT NULL,
    "question_revision_digest" VARCHAR(128) NOT NULL,
    "prompt_snapshot_ciphertext" JSONB NOT NULL,
    "option_snapshot_ciphertext" JSONB,
    "scoring_snapshot_ciphertext" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptive_practice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_report_budget_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "principal_key" VARCHAR(160) NOT NULL,
    "policy_bundle_version" VARCHAR(120) NOT NULL,
    "state" "ai_report_budget_state" NOT NULL DEFAULT 'active',
    "window_started_at" TIMESTAMPTZ NOT NULL,
    "window_expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_units" INTEGER NOT NULL DEFAULT 0,
    "consumed_requests" INTEGER NOT NULL DEFAULT 0,
    "unit_limit" INTEGER NOT NULL,
    "request_limit" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_report_budget_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_admin_report_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID NOT NULL,
    "query_fingerprint" VARCHAR(128) NOT NULL,
    "display_timezone" VARCHAR(64) NOT NULL,
    "range_start" DATE NOT NULL,
    "range_end" DATE NOT NULL,
    "suppression_applied" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_admin_report_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_policy_bundles_bundle_version_key" ON "ai_policy_bundles"("bundle_version");

-- CreateIndex
CREATE INDEX "ai_policy_bundles_state_effective_at_idx" ON "ai_policy_bundles"("state", "effective_at");

-- CreateIndex
CREATE INDEX "ai_policy_audit_events_bundle_id_occurred_at_idx" ON "ai_policy_audit_events"("bundle_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ai_capability_grants_capability_is_active_idx" ON "ai_capability_grants"("capability", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ai_capability_grants_capability_user_id_role_key" ON "ai_capability_grants"("capability", "user_id", "role");

-- CreateIndex
CREATE INDEX "ai_content_migration_audits_state_content_class_idx" ON "ai_content_migration_audits"("state", "content_class");

-- CreateIndex
CREATE UNIQUE INDEX "ai_content_migration_audits_source_table_source_field_sourc_key" ON "ai_content_migration_audits"("source_table", "source_field", "source_object_id", "migration_version");

-- CreateIndex
CREATE INDEX "ai_idempotency_keys_state_rejection_class_expires_at_idx" ON "ai_idempotency_keys"("state", "rejection_class", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_idempotency_keys_student_id_operation_client_request_id_key" ON "ai_idempotency_keys"("student_id", "operation", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_lifecycle_operations_idempotency_key_id_key" ON "ai_lifecycle_operations"("idempotency_key_id");

-- CreateIndex
CREATE INDEX "ai_lifecycle_operations_student_id_operation_state_idx" ON "ai_lifecycle_operations"("student_id", "operation", "state");

-- CreateIndex
CREATE INDEX "ai_lifecycle_operations_state_expires_at_idx" ON "ai_lifecycle_operations"("state", "expires_at");

-- CreateIndex
CREATE INDEX "ai_conversation_sources_source_type_source_id_idx" ON "ai_conversation_sources"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_sources_conversation_id_source_type_source__key" ON "ai_conversation_sources"("conversation_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversation_sources_conversation_id_sort_order_key" ON "ai_conversation_sources"("conversation_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ai_context_packs_request_id_key" ON "ai_context_packs"("request_id");

CREATE UNIQUE INDEX "ai_context_packs_id_request_id_key" ON "ai_context_packs"("id", "request_id");

-- CreateIndex
CREATE INDEX "ai_request_sources_snapshot_state_purge_at_idx" ON "ai_request_sources"("snapshot_state", "purge_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_request_sources_request_id_ordinal_key" ON "ai_request_sources"("request_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ai_request_sources_request_id_source_type_source_id_key" ON "ai_request_sources"("request_id", "source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_request_attempts_request_id_attempt_no_key" ON "ai_request_attempts"("request_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "ai_request_result_stages_request_id_key" ON "ai_request_result_stages"("request_id");

-- CreateIndex
CREATE INDEX "ai_admission_events_occurred_at_feature_key_reason_idx" ON "ai_admission_events"("occurred_at", "feature_key", "reason");

-- CreateIndex
CREATE INDEX "ai_admission_events_occurred_at_model_reason_idx" ON "ai_admission_events"("occurred_at", "model", "reason");

-- CreateIndex
CREATE INDEX "ai_admission_events_student_id_occurred_at_idx" ON "ai_admission_events"("student_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ai_artifacts_student_id_created_at_idx" ON "ai_artifacts"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_artifacts_artifact_key_revision_key" ON "ai_artifacts"("artifact_key", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "ai_artifact_lifecycles_artifact_revision_id_key" ON "ai_artifact_lifecycles"("artifact_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_artifact_applies_idempotency_key_id_key" ON "ai_artifact_applies"("idempotency_key_id");

-- CreateIndex
CREATE INDEX "ai_artifact_applies_target_entity_type_target_entity_id_tar_idx" ON "ai_artifact_applies"("target_entity_type", "target_entity_id", "target_entity_revision");

-- CreateIndex
CREATE UNIQUE INDEX "adaptive_practice_items_adaptive_session_id_ordinal_key" ON "adaptive_practice_items"("adaptive_session_id", "ordinal");

-- CreateIndex
CREATE INDEX "ai_report_budget_windows_state_window_expires_at_idx" ON "ai_report_budget_windows"("state", "window_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_report_budget_windows_principal_key_window_started_at_key" ON "ai_report_budget_windows"("principal_key", "window_started_at");

-- CreateIndex
CREATE INDEX "ai_admin_report_audits_actor_id_occurred_at_idx" ON "ai_admin_report_audits"("actor_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_requests_idempotency_key_id_key" ON "ai_requests"("idempotency_key_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_requests_assistant_message_id_key" ON "ai_requests"("assistant_message_id");

-- CreateIndex
CREATE INDEX "ai_requests_user_message_id_idx" ON "ai_requests"("user_message_id");

-- CreateIndex
CREATE INDEX "ai_requests_created_at_feature_key_status_idx" ON "ai_requests"("created_at", "feature_key", "status");

-- CreateIndex
CREATE INDEX "ai_requests_created_at_model_status_idx" ON "ai_requests"("created_at", "model", "status");

-- CreateIndex
CREATE INDEX "ai_requests_status_created_at_idx" ON "ai_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_daily_student_id_usage_date_ledger_version_key" ON "ai_usage_daily"("student_id", "usage_date", "ledger_version");

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "ai_idempotency_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_retry_of_request_id_fkey" FOREIGN KEY ("retry_of_request_id") REFERENCES "ai_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_message_id_fkey" FOREIGN KEY ("user_message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_assistant_message_id_fkey" FOREIGN KEY ("assistant_message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_answers" ADD CONSTRAINT "adaptive_practice_answers_adaptive_practice_item_id_fkey" FOREIGN KEY ("adaptive_practice_item_id") REFERENCES "adaptive_practice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_bundles" ADD CONSTRAINT "ai_policy_bundles_supersedes_bundle_id_fkey" FOREIGN KEY ("supersedes_bundle_id") REFERENCES "ai_policy_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_bundles" ADD CONSTRAINT "ai_policy_bundles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_bundles" ADD CONSTRAINT "ai_policy_bundles_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_audit_events" ADD CONSTRAINT "ai_policy_audit_events_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "ai_policy_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_audit_events" ADD CONSTRAINT "ai_policy_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_capability_grants" ADD CONSTRAINT "ai_capability_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_idempotency_keys" ADD CONSTRAINT "ai_idempotency_keys_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_lifecycle_operations" ADD CONSTRAINT "ai_lifecycle_operations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_lifecycle_operations" ADD CONSTRAINT "ai_lifecycle_operations_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "ai_idempotency_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_sources" ADD CONSTRAINT "ai_conversation_sources_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_packs" ADD CONSTRAINT "ai_context_packs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_request_sources" ADD CONSTRAINT "ai_request_sources_context_pack_id_fkey" FOREIGN KEY ("context_pack_id") REFERENCES "ai_context_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every source is tied to both its pack and the pack's request. The composite
-- key prevents a source row from smuggling a different request identity.
ALTER TABLE "ai_request_sources" ADD CONSTRAINT "ai_request_sources_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_request_sources" ADD CONSTRAINT "ai_request_sources_pack_request_identity_fkey" FOREIGN KEY ("context_pack_id", "request_id") REFERENCES "ai_context_packs"("id", "request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_request_attempts" ADD CONSTRAINT "ai_request_attempts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_request_result_stages" ADD CONSTRAINT "ai_request_result_stages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admission_events" ADD CONSTRAINT "ai_admission_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admission_events" ADD CONSTRAINT "ai_admission_events_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "ai_idempotency_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifact_lifecycles" ADD CONSTRAINT "ai_artifact_lifecycles_artifact_revision_id_fkey" FOREIGN KEY ("artifact_revision_id") REFERENCES "ai_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifact_lifecycles" ADD CONSTRAINT "ai_artifact_lifecycles_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifact_applies" ADD CONSTRAINT "ai_artifact_applies_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "ai_idempotency_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifact_applies" ADD CONSTRAINT "ai_artifact_applies_artifact_revision_id_fkey" FOREIGN KEY ("artifact_revision_id") REFERENCES "ai_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_artifact_applies" ADD CONSTRAINT "ai_artifact_applies_applied_by_student_id_fkey" FOREIGN KEY ("applied_by_student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_items" ADD CONSTRAINT "adaptive_practice_items_adaptive_session_id_fkey" FOREIGN KEY ("adaptive_session_id") REFERENCES "adaptive_practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admin_report_audits" ADD CONSTRAINT "ai_admin_report_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Structural safety checks. Runtime commands add the cross-row CAS checks;
-- these constraints prevent silent negative/debt-invalid ledger evidence.
CREATE UNIQUE INDEX "ai_policy_bundles_one_active_idx"
  ON "ai_policy_bundles" ("state") WHERE "state" = 'active';
CREATE UNIQUE INDEX "ai_policy_bundles_one_scheduled_idx"
  ON "ai_policy_bundles" ("state") WHERE "state" = 'scheduled';

ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_version_nonnegative_ck" CHECK ("version" >= 0),
  ADD CONSTRAINT "ai_conversations_context_version_nonnegative_ck" CHECK ("context_version" >= 0),
  ADD CONSTRAINT "ai_conversations_claimed_version_nonnegative_ck" CHECK ("claimed_version" IS NULL OR "claimed_version" >= 0);

ALTER TABLE "learning_recommendations"
  ADD CONSTRAINT "learning_recommendations_revision_nonnegative_ck" CHECK ("revision" >= 0),
  ADD CONSTRAINT "learning_recommendations_claimed_revision_nonnegative_ck" CHECK ("claimed_revision" IS NULL OR "claimed_revision" >= 0);

ALTER TABLE "adaptive_practice_sessions"
  ADD CONSTRAINT "adaptive_practice_sessions_revision_nonnegative_ck" CHECK ("revision" >= 0),
  ADD CONSTRAINT "adaptive_practice_sessions_claimed_revision_nonnegative_ck" CHECK ("claimed_revision" IS NULL OR "claimed_revision" >= 0);

ALTER TABLE "ptn_strategy_sessions"
  ADD CONSTRAINT "ptn_strategy_sessions_revision_nonnegative_ck" CHECK ("revision" >= 0),
  ADD CONSTRAINT "ptn_strategy_sessions_claimed_revision_nonnegative_ck" CHECK ("claimed_revision" IS NULL OR "claimed_revision" >= 0);

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_quota_nonnegative_ck" CHECK (
    "quota_units_reserved" >= 0 AND "quota_units_consumed" >= 0 AND "quota_overrun_units" >= 0
  ),
  ADD CONSTRAINT "ai_requests_attempt_bound_ck" CHECK ("max_provider_attempts" BETWEEN 1 AND 2),
  ADD CONSTRAINT "ai_requests_retry_not_self_ck" CHECK ("retry_of_request_id" IS NULL OR "retry_of_request_id" <> "id"),
  ADD CONSTRAINT "ai_requests_version_nonnegative_ck" CHECK ("version" >= 0);

ALTER TABLE "ai_usage_daily"
  ADD CONSTRAINT "ai_usage_daily_nonnegative_ck" CHECK (
    "used_quota_units" >= 0 AND "reserved_quota_units" >= 0 AND "quota_debt_units" >= 0
    AND "accepted_request_count" >= 0 AND "finalized_request_count" >= 0
  ),
  ADD CONSTRAINT "ai_usage_daily_exposure_ck" CHECK (
    "used_quota_units" + "reserved_quota_units" <= "quota_limit_units_snapshot" + "quota_debt_units"
  );

ALTER TABLE "ai_request_attempts"
  ADD CONSTRAINT "ai_request_attempts_number_ck" CHECK ("attempt_no" BETWEEN 1 AND 2);

ALTER TABLE "ai_artifact_lifecycles"
  ADD CONSTRAINT "ai_artifact_lifecycles_revision_nonnegative_ck" CHECK ("lifecycle_revision" >= 0),
  ADD CONSTRAINT "ai_artifact_lifecycles_claimed_revision_nonnegative_ck" CHECK ("claimed_expected_revision" IS NULL OR "claimed_expected_revision" >= 0);

ALTER TABLE "ai_messages"
  ADD CONSTRAINT "ai_messages_envelope_required_after_legacy_ck" CHECK (
    "content_state" = 'legacy_plaintext'
    OR ("content_envelope" IS NOT NULL AND "content_digest" IS NOT NULL)
  );

ALTER TABLE "ai_lifecycle_operations"
  ADD CONSTRAINT "ai_lifecycle_operations_target_contract_ck" CHECK (
    ("operation" = 'export_create' AND "result_kind" = 'export_job'
      AND "export_format" IS NOT NULL AND "export_scope" IS NOT NULL AND "export_as_of" IS NOT NULL
      AND "expected_conversation_version" IS NULL AND "expected_lifecycle_revision" IS NULL)
    OR
    ("operation" = 'conversation_delete' AND "result_kind" = 'conversation_delete'
      AND "target_entity_id" IS NOT NULL AND "expected_conversation_version" IS NOT NULL
      AND "claimed_conversation_version" IS NOT NULL AND "expected_lifecycle_revision" IS NULL
      AND "export_as_of" IS NULL)
    OR
    ("operation" = 'artifact_delete' AND "result_kind" = 'artifact_delete'
      AND "target_entity_id" IS NOT NULL AND "expected_lifecycle_revision" IS NOT NULL
      AND "claimed_lifecycle_revision" IS NOT NULL AND "expected_conversation_version" IS NULL
      AND "export_as_of" IS NULL)
  ),
  ADD CONSTRAINT "ai_lifecycle_operations_revision_nonnegative_ck" CHECK (
    ("expected_conversation_version" IS NULL OR "expected_conversation_version" >= 0)
    AND ("claimed_conversation_version" IS NULL OR "claimed_conversation_version" >= 0)
    AND ("expected_lifecycle_revision" IS NULL OR "expected_lifecycle_revision" >= 0)
    AND ("claimed_lifecycle_revision" IS NULL OR "claimed_lifecycle_revision" >= 0)
  );

ALTER TABLE "ai_idempotency_keys"
  ADD CONSTRAINT "ai_idempotency_keys_rejected_result_ck" CHECK (
    ("state" = 'rejected' AND "result_kind" = 'none') OR "state" <> 'rejected'
  ),
  ADD CONSTRAINT "ai_idempotency_keys_result_namespace_ck" CHECK (
    "result_kind" = 'none'
    OR ("operation" = 'conversation_create' AND "result_kind" = 'conversation')
    OR ("operation" = 'ai_request' AND "result_kind" = 'request')
    OR ("operation" = 'artifact_apply' AND "result_kind" = 'artifact_apply')
    OR ("operation" = 'learning_recommendation_create' AND "result_kind" = 'learning_recommendation')
    OR ("operation" = 'export_create' AND "result_kind" = 'export_job')
    OR ("operation" = 'conversation_delete' AND "result_kind" = 'conversation_delete')
    OR ("operation" = 'artifact_delete' AND "result_kind" = 'artifact_delete')
  );

ALTER TABLE "adaptive_practice_items"
  ADD CONSTRAINT "adaptive_practice_items_ordinal_nonnegative_ck" CHECK ("ordinal" >= 0);

CREATE OR REPLACE FUNCTION prevent_ai_artifact_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id"
     OR NEW."artifact_key" <> OLD."artifact_key"
     OR NEW."revision" <> OLD."revision"
     OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
     OR NEW."student_id" <> OLD."student_id"
     OR NEW."conversation_id" IS DISTINCT FROM OLD."conversation_id"
     OR NEW."artifact_type" <> OLD."artifact_type"
     OR NEW."provenance_kind" <> OLD."provenance_kind"
     OR NEW."title_ciphertext" IS DISTINCT FROM OLD."title_ciphertext"
     OR NEW."content_markdown_ciphertext" IS DISTINCT FROM OLD."content_markdown_ciphertext"
     OR NEW."payload_ciphertext" IS DISTINCT FROM OLD."payload_ciphertext"
     OR NEW."artifact_schema_version" <> OLD."artifact_schema_version"
     OR NEW."source_entity_type" IS DISTINCT FROM OLD."source_entity_type"
     OR NEW."source_entity_id" IS DISTINCT FROM OLD."source_entity_id"
     OR NEW."source_entity_revision" IS DISTINCT FROM OLD."source_entity_revision"
     OR NEW."source_entity_digest" IS DISTINCT FROM OLD."source_entity_digest"
     OR NEW."content_digest" <> OLD."content_digest"
     OR NEW."render_version" <> OLD."render_version"
     OR NEW."retention_policy_version" <> OLD."retention_policy_version"
     OR NEW."created_at" <> OLD."created_at"
     OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN
    RAISE EXCEPTION 'ai_artifact revisions are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_artifact_revision_immutable
BEFORE UPDATE ON "ai_artifacts"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_artifact_revision_mutation();

CREATE OR REPLACE FUNCTION prevent_ai_context_pack_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id"
     OR NEW."request_id" <> OLD."request_id"
     OR NEW."pack_schema_version" <> OLD."pack_schema_version"
     OR NEW."context_pack_version" <> OLD."context_pack_version"
     OR NEW."ordered_block_manifest_json" IS DISTINCT FROM OLD."ordered_block_manifest_json"
     OR NEW."normalized_task_ciphertext" IS DISTINCT FROM OLD."normalized_task_ciphertext"
     OR NEW."canonical_encoding" <> OLD."canonical_encoding"
     OR NEW."canonical_bytes_ciphertext" IS DISTINCT FROM OLD."canonical_bytes_ciphertext"
     OR NEW."byte_count" <> OLD."byte_count"
     OR NEW."pack_digest" <> OLD."pack_digest"
     OR NEW."truncation_json" IS DISTINCT FROM OLD."truncation_json"
     OR NEW."redaction_policy_version" <> OLD."redaction_policy_version"
     OR NEW."conversation_message_manifest_ciphertext" IS DISTINCT FROM OLD."conversation_message_manifest_ciphertext"
     OR NEW."system_policy_hash" <> OLD."system_policy_hash"
     OR NEW."prompt_template_hash" <> OLD."prompt_template_hash"
     OR NEW."tool_schema_hash" <> OLD."tool_schema_hash"
     OR NEW."provider_task_digest" IS DISTINCT FROM OLD."provider_task_digest"
     OR NEW."retention_class" <> OLD."retention_class"
     OR NEW."retention_policy_version" <> OLD."retention_policy_version"
     OR NEW."purge_at" <> OLD."purge_at"
     OR NEW."created_at" <> OLD."created_at" THEN
    RAISE EXCEPTION 'ai_context_packs snapshots are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_context_pack_snapshot_immutable
BEFORE UPDATE ON "ai_context_packs"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_context_pack_snapshot_mutation();

CREATE OR REPLACE FUNCTION prevent_ai_request_source_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id"
     OR NEW."context_pack_id" <> OLD."context_pack_id"
     OR NEW."request_id" <> OLD."request_id"
     OR NEW."ordinal" <> OLD."ordinal"
     OR NEW."source_type" <> OLD."source_type"
     OR NEW."source_id" <> OLD."source_id"
     OR NEW."citation_key" <> OLD."citation_key"
     OR NEW."source_version_id" IS DISTINCT FROM OLD."source_version_id"
     OR NEW."title_snapshot" IS DISTINCT FROM OLD."title_snapshot"
     OR NEW."citation_label" IS DISTINCT FROM OLD."citation_label"
     OR NEW."content_digest" <> OLD."content_digest"
     OR NEW."bounded_snapshot_ciphertext" IS DISTINCT FROM OLD."bounded_snapshot_ciphertext"
     OR NEW."snapshot_encoding" <> OLD."snapshot_encoding"
     OR NEW."snapshot_bytes" <> OLD."snapshot_bytes"
     OR NEW."truncation_json" IS DISTINCT FROM OLD."truncation_json"
     OR NEW."redaction_policy_version" <> OLD."redaction_policy_version"
     OR NEW."retention_policy_version" <> OLD."retention_policy_version"
     OR NEW."purge_at" <> OLD."purge_at"
     OR NEW."created_at" <> OLD."created_at" THEN
    RAISE EXCEPTION 'ai_request_sources snapshots are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_request_source_snapshot_immutable
BEFORE UPDATE ON "ai_request_sources"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_request_source_snapshot_mutation();

-- Migration-only inventory. Rows contain digests/classification only, never
-- plaintext. A fallback row makes an empty source table an explicit proof.
INSERT INTO "ai_content_migration_audits" (
  "source_table", "source_field", "source_object_id", "content_class",
  "source_digest", "migration_version", "state", "details"
)
SELECT 'ai_messages', 'content_markdown', m."id",
       CASE WHEN m."role" = 'system' THEN 'hidden_system'::"ai_migration_content_class"
            ELSE 'learner_visible'::"ai_migration_content_class" END,
       md5(COALESCE(m."content_markdown", '')),
       '20260824090000', 'blocked'::"ai_migration_state", '{"requiresEnvelopeBackfill":true}'::jsonb
FROM "ai_messages" m
WHERE m."content_markdown" IS NOT NULL
UNION ALL
SELECT 'ai_messages', 'content_markdown', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no existing AI message content"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "ai_messages" WHERE "content_markdown" IS NOT NULL)
UNION ALL
SELECT 'ai_messages', 'role=system', m."id",
       'hidden_system'::"ai_migration_content_class",
       md5(COALESCE(m."content_markdown", '')), '20260824090000',
       'blocked'::"ai_migration_state", '{"requiresEnvelopeBackfill":true,"classification":"hidden_system"}'::jsonb
FROM "ai_messages" m
WHERE m."role" = 'system'
UNION ALL
SELECT 'ai_messages', 'role=system', NULL,
       'hidden_system'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no existing system-role AI messages"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "ai_messages" WHERE "role" = 'system')
UNION ALL
SELECT 'ai_messages', 'metadata', m."id",
       'learner_visible'::"ai_migration_content_class",
       md5(COALESCE(m."metadata"::text, '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true,"classification":"learner_visible"}'::jsonb
FROM "ai_messages" m
WHERE m."metadata" IS NOT NULL AND m."role" NOT IN ('system', 'tool')
UNION ALL
SELECT 'ai_messages', 'metadata', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no learner-visible message metadata"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "ai_messages"
  WHERE "metadata" IS NOT NULL AND "role" NOT IN ('system', 'tool')
)
UNION ALL
SELECT 'ai_messages', 'metadata:role=system', m."id",
       'hidden_system'::"ai_migration_content_class",
       md5(COALESCE(m."metadata"::text, '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true,"classification":"hidden_system"}'::jsonb
FROM "ai_messages" m
WHERE m."metadata" IS NOT NULL AND m."role" = 'system'
UNION ALL
SELECT 'ai_messages', 'metadata:role=system', NULL,
       'hidden_system'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no system message metadata"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "ai_messages"
  WHERE "metadata" IS NOT NULL AND "role" = 'system'
)
UNION ALL
SELECT 'ai_messages', 'metadata:role=tool', m."id",
       'hidden_system'::"ai_migration_content_class",
       md5(COALESCE(m."metadata"::text, '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true,"classification":"hidden_system"}'::jsonb
FROM "ai_messages" m
WHERE m."metadata" IS NOT NULL AND m."role" = 'tool'
UNION ALL
SELECT 'ai_messages', 'metadata:role=tool', NULL,
       'hidden_system'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no tool message metadata"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "ai_messages"
  WHERE "metadata" IS NOT NULL AND "role" = 'tool'
)
UNION ALL
SELECT 'ai_conversations', 'context_entity', c."id",
       'content_free'::"ai_migration_content_class",
       md5(COALESCE(c."context_entity_type", '') || ':' || COALESCE(c."context_entity_id"::text, '')),
       '20260824090000', 'blocked'::"ai_migration_state",
       '{"classification":"legacy_scalar_context","newAuthority":"ai_conversation_sources","requiresContextBackfill":true}'::jsonb
FROM "ai_conversations" c
WHERE c."context_entity_type" IS NOT NULL OR c."context_entity_id" IS NOT NULL
UNION ALL
SELECT 'ai_conversations', 'context_entity', NULL,
       'content_free'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state",
       '{"proof":"no legacy scalar conversation context"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM "ai_conversations"
  WHERE "context_entity_type" IS NOT NULL OR "context_entity_id" IS NOT NULL
)
UNION ALL
SELECT 'weakness_analyses', 'summary_markdown', w."id",
       'learner_visible'::"ai_migration_content_class",
       md5(COALESCE(w."summary_markdown", '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true}'::jsonb
FROM "weakness_analyses" w
WHERE w."summary_markdown" IS NOT NULL
UNION ALL
SELECT 'weakness_analyses', 'summary_markdown', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no existing weakness summary"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "weakness_analyses" WHERE "summary_markdown" IS NOT NULL)
UNION ALL
SELECT 'weakness_analysis_topics', 'recommendation_text', t."id",
       'learner_visible'::"ai_migration_content_class",
       md5(COALESCE(t."recommendation_text", '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true}'::jsonb
FROM "weakness_analysis_topics" t
WHERE t."recommendation_text" IS NOT NULL
UNION ALL
SELECT 'weakness_analysis_topics', 'recommendation_text', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no existing topic recommendation text"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "weakness_analysis_topics" WHERE "recommendation_text" IS NOT NULL)
UNION ALL
SELECT 'learning_recommendations', 'reason', r."id",
       'learner_visible'::"ai_migration_content_class",
       md5(COALESCE(r."reason", '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true,"classification":"learner_visible","typedApplyTarget":true}'::jsonb
FROM "learning_recommendations" r
WHERE r."reason" IS NOT NULL
UNION ALL
SELECT 'learning_recommendations', 'reason', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state",
       '{"proof":"no existing learning recommendation reason"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "learning_recommendations" WHERE "reason" IS NOT NULL)
UNION ALL
SELECT 'adaptive_practice_answers', 'answer_text', a."id",
       'learner_visible'::"ai_migration_content_class",
       md5(COALESCE(a."answer_text", '')), '20260824090000', 'blocked'::"ai_migration_state",
       '{"requiresEnvelopeBackfill":true}'::jsonb
FROM "adaptive_practice_answers" a
WHERE a."answer_text" IS NOT NULL
UNION ALL
SELECT 'adaptive_practice_answers', 'answer_text', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no existing adaptive answers"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "adaptive_practice_answers" WHERE "answer_text" IS NOT NULL)
UNION ALL
SELECT 'ai_requests', 'prompt_template', r."id",
       'content_free'::"ai_migration_content_class",
       md5(COALESCE(r."prompt_template", '')), '20260824090000',
       'retired'::"ai_migration_state", '{"proof":"legacy routing metadata; no learner content"}'::jsonb
FROM "ai_requests" r
WHERE r."prompt_template" IS NOT NULL
UNION ALL
SELECT 'ai_requests', 'prompt_template', NULL,
       'content_free'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"no legacy prompt template metadata"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "ai_requests" WHERE "prompt_template" IS NOT NULL)
UNION ALL
SELECT 'adaptive_practice_items', 'prompt_snapshot_ciphertext', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"new encrypted item table starts empty"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "adaptive_practice_items")
UNION ALL
SELECT 'adaptive_practice_items', 'option_snapshot_ciphertext', NULL,
       'learner_visible'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"new encrypted item table starts empty"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "adaptive_practice_items")
UNION ALL
SELECT 'adaptive_practice_items', 'scoring_snapshot_ciphertext', NULL,
       'hidden_system'::"ai_migration_content_class", NULL,
       '20260824090000', 'zero_rows'::"ai_migration_state", '{"proof":"new encrypted item table starts empty"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM "adaptive_practice_items");
