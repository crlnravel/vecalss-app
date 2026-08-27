-- Vera Sprint 5 T11: lifecycle, retention, export and legacy cutover.
-- This migration is deliberately forward-only. It never edits or retires a
-- prior migration and it does not contact a configured service.

ALTER TYPE "ai_idempotency_operation" ADD VALUE IF NOT EXISTS 'account_cleanup';
ALTER TYPE "ai_idempotency_result_kind" ADD VALUE IF NOT EXISTS 'account_cleanup';
ALTER TYPE "ai_content_lifecycle_state" ADD VALUE IF NOT EXISTS 'purging';
ALTER TYPE "ai_lifecycle_operation_state" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "ai_lifecycle_operation_state" ADD VALUE IF NOT EXISTS 'awaiting_dependency';
ALTER TYPE "ai_lifecycle_operation_state" ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE "ai_lifecycle_operation_state" ADD VALUE IF NOT EXISTS 'failed_retryable';
ALTER TYPE "ai_lifecycle_operation_state" ADD VALUE IF NOT EXISTS 'failed_terminal';

CREATE TYPE "ai_owner_state" AS ENUM ('active', 'account_deleted');
CREATE TYPE "ai_lifecycle_target_state" AS ENUM (
  'available', 'deletion_pending', 'deleted', 'purged',
  'account_deleted', 'target_unavailable'
);
CREATE TYPE "ai_export_state" AS ENUM (
  'pending', 'materializing', 'ready', 'failed_retryable',
  'failed_terminal', 'expired'
);
CREATE TYPE "ai_export_access_grant_state" AS ENUM (
  'none', 'active', 'claiming', 'consumed', 'expired'
);
CREATE TYPE "ai_retention_hold_subject_type" AS ENUM (
  'student', 'conversation', 'artifact', 'evidence_object'
);
CREATE TYPE "ai_retention_hold_subject_state" AS ENUM (
  'attached', 'detached', 'account_deleted', 'purged'
);
CREATE TYPE "ai_retention_hold_type" AS ENUM ('legal', 'safety');
CREATE TYPE "ai_retention_hold_state" AS ENUM ('active', 'released');
CREATE TYPE "ai_retention_hold_release_state" AS ENUM (
  'pending', 'approved', 'applied', 'rejected'
);
CREATE TYPE "ai_key_destruction_claim_state" AS ENUM (
  'pending', 'approved', 'executing', 'destroyed', 'failed_retryable', 'blocked'
);
CREATE TYPE "ai_purge_work_item_state" AS ENUM (
  'pending', 'claimed', 'completed', 'failed_retryable', 'blocked'
);
CREATE TYPE "ai_migration_classification" AS ENUM (
  'envelope_backfilled', 'digest_only', 'zero_rows', 'review_required', 'retired'
);
CREATE TYPE "ai_migration_action" AS ENUM (
  'preserve_read_only', 'backfill_envelope', 'clear_after_cutover', 'none'
);
CREATE TYPE "ai_migration_audit_status" AS ENUM (
  'discovered', 'converted', 'validated', 'blocked', 'retired'
);

ALTER TABLE "ai_messages"
  ADD COLUMN "metadata_envelope" JSONB,
  ADD COLUMN "metadata_digest" VARCHAR(128),
  -- Existing rows still have legacy metadata and must not be relabeled as
  -- encrypted merely because the additive column has a default.
  ADD COLUMN "metadata_state" "ai_content_lifecycle_state" NOT NULL DEFAULT 'legacy_plaintext';

ALTER TABLE "ai_requests"
  ALTER COLUMN "student_id" DROP NOT NULL,
  ALTER COLUMN "idempotency_key_id" DROP NOT NULL,
  ADD COLUMN "owner_state" "ai_owner_state" NOT NULL DEFAULT 'active',
  ADD COLUMN "owner_reference_digest" VARCHAR(128),
  ADD COLUMN "account_deleted_at" TIMESTAMPTZ;

ALTER TABLE "ai_idempotency_keys"
  ALTER COLUMN "student_id" DROP NOT NULL,
  ADD COLUMN "owner_state" "ai_owner_state" NOT NULL DEFAULT 'active',
  ADD COLUMN "owner_reference_digest" VARCHAR(128),
  ADD COLUMN "account_deleted_at" TIMESTAMPTZ;

ALTER TABLE "ai_lifecycle_operations"
  ALTER COLUMN "student_id" DROP NOT NULL,
  ALTER COLUMN "idempotency_key_id" DROP NOT NULL,
  ADD COLUMN "owner_state" "ai_owner_state" NOT NULL DEFAULT 'active',
  ADD COLUMN "owner_reference_digest" VARCHAR(128),
  ADD COLUMN "account_deleted_at" TIMESTAMPTZ,
  ADD COLUMN "target_state" "ai_lifecycle_target_state",
  ADD COLUMN "recovery_deadline_at" TIMESTAMPTZ,
  ADD COLUMN "terminal_at" TIMESTAMPTZ,
  ADD COLUMN "error_code" VARCHAR(100),
  ADD COLUMN "error_digest" VARCHAR(128),
  ADD COLUMN "target_tombstone_code" VARCHAR(100),
  ADD COLUMN "handoff_signal" VARCHAR(120),
  ADD COLUMN "handoff_at" TIMESTAMPTZ,
  ADD COLUMN "handoff_state" VARCHAR(40),
  ADD COLUMN "handoff_consumed_at" TIMESTAMPTZ,
  ADD COLUMN "handoff_consumer_id" VARCHAR(160),
  ADD COLUMN "handoff_digest" VARCHAR(128),
  ADD COLUMN "handoff_ack_digest" VARCHAR(128),
  ADD COLUMN "account_cleanup_correlation_digest" VARCHAR(128),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ai_request_result_stages"
  ADD COLUMN "purge_state" "ai_purge_state" NOT NULL DEFAULT 'available',
  ADD COLUMN "purge_at" TIMESTAMPTZ,
  ADD COLUMN "purge_started_at" TIMESTAMPTZ,
  ADD COLUMN "purged_at" TIMESTAMPTZ,
  ADD COLUMN "purge_reason" VARCHAR(160),
  ADD COLUMN "content_key_lineage_digest" VARCHAR(128);

ALTER TABLE "ai_context_packs"
  ADD COLUMN "content_key_lineage_digest" VARCHAR(128);

ALTER TABLE "ai_request_sources"
  ADD COLUMN "content_key_lineage_digest" VARCHAR(128);

ALTER TABLE "ai_artifact_lifecycles"
  ADD COLUMN "deleted_at" TIMESTAMPTZ,
  ADD COLUMN "retention_policy_version" VARCHAR(80);

ALTER TABLE "adaptive_practice_items"
  ADD COLUMN "purge_state" "ai_purge_state" NOT NULL DEFAULT 'available',
  ADD COLUMN "purge_at" TIMESTAMPTZ,
  ADD COLUMN "purge_started_at" TIMESTAMPTZ,
  ADD COLUMN "purged_at" TIMESTAMPTZ,
  ADD COLUMN "purge_reason" VARCHAR(160),
  ADD COLUMN "content_key_lineage_digest" VARCHAR(128);

ALTER TABLE "ai_content_migration_audits"
  ADD COLUMN "table_name" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "column_name" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "row_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "classification" "ai_migration_classification" NOT NULL DEFAULT 'review_required',
  ADD COLUMN "action" "ai_migration_action" NOT NULL DEFAULT 'none',
  ADD COLUMN "status" "ai_migration_audit_status" NOT NULL DEFAULT 'discovered',
  ADD COLUMN "rollback_boundary" VARCHAR(120) NOT NULL DEFAULT 'pre-retirement';

-- Existing audit rows retain their original Sprint 1-4 values. T11 evidence
-- is appended below with the expanded inventory vocabulary; no historical
-- audit row is updated or copied into a content-bearing field.

-- New lifecycle records use the operation row as the durable source of truth.
CREATE TABLE "ai_export_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" UUID NOT NULL,
  "student_id" UUID,
  "owner_state" "ai_owner_state" NOT NULL DEFAULT 'active',
  "owner_reference_digest" VARCHAR(128),
  "account_deleted_at" TIMESTAMPTZ,
  "format" VARCHAR(40) NOT NULL DEFAULT 'json_v1',
  "state" "ai_export_state" NOT NULL DEFAULT 'pending',
  "export_as_of" TIMESTAMPTZ NOT NULL,
  "snapshot_digest" VARCHAR(128),
  "package_bytes" INTEGER,
  "download_ready_at" TIMESTAMPTZ,
  "download_expires_at" TIMESTAMPTZ,
  "export_access_grant_digest" VARCHAR(128),
  "export_access_grant_state" "ai_export_access_grant_state" NOT NULL DEFAULT 'none',
  "export_access_grant_version" INTEGER NOT NULL DEFAULT 0,
  "export_access_grant_claim_id" VARCHAR(160),
  "export_access_grant_claimed_at" TIMESTAMPTZ,
  "export_access_grant_lease_expires_at" TIMESTAMPTZ,
  "materialization_claim_id" VARCHAR(160),
  "materialization_owner_id" VARCHAR(160),
  "materialization_claimed_at" TIMESTAMPTZ,
  "materialization_lease_expires_at" TIMESTAMPTZ,
  "materialization_fence" INTEGER NOT NULL DEFAULT 0,
  "recovery_deadline_at" TIMESTAMPTZ NOT NULL,
  "partial_package_purge_at" TIMESTAMPTZ,
  "terminal_retention_expires_at" TIMESTAMPTZ,
  "error_code" VARCHAR(100),
  "retention_policy_version" VARCHAR(80) NOT NULL,
  "content_envelope_key_id" VARCHAR(240),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "terminal_at" TIMESTAMPTZ,
  "expired_at" TIMESTAMPTZ,

  CONSTRAINT "ai_export_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_export_parts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "export_job_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "ciphertext_envelope" JSONB NOT NULL,
  "plaintext_bytes" INTEGER NOT NULL,
  "part_digest" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_export_parts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_retention_holds" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "subject_type" "ai_retention_hold_subject_type" NOT NULL,
  "subject_id" UUID,
  "subject_state" "ai_retention_hold_subject_state" NOT NULL DEFAULT 'attached',
  "student_id" UUID,
  "subject_reference_digest" VARCHAR(128),
  "hold_type" "ai_retention_hold_type" NOT NULL,
  "state" "ai_retention_hold_state" NOT NULL DEFAULT 'active',
  "reason_code" VARCHAR(100) NOT NULL,
  "actor_id" VARCHAR(160) NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ,
  "hold_digest" VARCHAR(128) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_retention_holds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_retention_hold_releases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "hold_id" UUID NOT NULL,
  "expected_hold_version" INTEGER NOT NULL,
  "state" "ai_retention_hold_release_state" NOT NULL DEFAULT 'pending',
  "requested_by_operator_id" VARCHAR(160) NOT NULL,
  "requested_capability" VARCHAR(100) NOT NULL,
  "requested_capability_digest" VARCHAR(128) NOT NULL,
  "operator_a_id" VARCHAR(160) NOT NULL,
  "operator_a_approved_at" TIMESTAMPTZ,
  "operator_a_digest" VARCHAR(128),
  "operator_b_id" VARCHAR(160),
  "operator_b_approved_at" TIMESTAMPTZ,
  "operator_b_digest" VARCHAR(128),
  "approved_by_operator_id" VARCHAR(160),
  "approved_capability" VARCHAR(100),
  "approved_capability_digest" VARCHAR(128),
  "operator_a_capability_decision_id" VARCHAR(160),
  "operator_a_capability_snapshot_version" INTEGER,
  "operator_a_capability_policy_version" VARCHAR(120),
  "operator_a_required_capability_union_digest" VARCHAR(128),
  "operator_a_granted_capability_set_digest" VARCHAR(128),
  "operator_a_capability_decision" VARCHAR(20),
  "operator_a_capability_evaluated_at" TIMESTAMPTZ,
  "operator_a_capability_snapshot_digest" VARCHAR(128),
  "operator_b_capability_decision_id" VARCHAR(160),
  "operator_b_capability_snapshot_version" INTEGER,
  "operator_b_capability_policy_version" VARCHAR(120),
  "operator_b_required_capability_union_digest" VARCHAR(128),
  "operator_b_granted_capability_set_digest" VARCHAR(128),
  "operator_b_capability_decision" VARCHAR(20),
  "operator_b_capability_evaluated_at" TIMESTAMPTZ,
  "operator_b_capability_snapshot_digest" VARCHAR(128),
  "reason_digest" VARCHAR(128),
  "rejection_code" VARCHAR(100),
  "version" INTEGER NOT NULL DEFAULT 0,
  "decision_snapshot" JSONB NOT NULL,
  "decision_snapshot_digest" VARCHAR(128) NOT NULL,
  "applied_at" TIMESTAMPTZ,
  "rejected_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_retention_hold_releases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_key_destruction_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" UUID NOT NULL,
  "hold_id" UUID,
  "object_type" VARCHAR(100) NOT NULL,
  "object_id" UUID NOT NULL,
  "key_lineage_digest" VARCHAR(128) NOT NULL,
  "state" "ai_key_destruction_claim_state" NOT NULL DEFAULT 'pending',
  "claim_version" INTEGER NOT NULL DEFAULT 0,
  "requested_by_operator_id" VARCHAR(160) NOT NULL,
  "requested_capability" VARCHAR(100) NOT NULL,
  "requested_capability_digest" VARCHAR(128) NOT NULL,
  "operator_a_id" VARCHAR(160) NOT NULL,
  "operator_a_approved_at" TIMESTAMPTZ,
  "operator_a_digest" VARCHAR(128),
  "operator_b_id" VARCHAR(160),
  "operator_b_approved_at" TIMESTAMPTZ,
  "operator_b_digest" VARCHAR(128),
  "operator_a_capability_decision_id" VARCHAR(160),
  "operator_a_capability_snapshot_version" INTEGER,
  "operator_a_capability_policy_version" VARCHAR(120),
  "operator_a_required_capability_union_digest" VARCHAR(128),
  "operator_a_granted_capability_set_digest" VARCHAR(128),
  "operator_a_capability_decision" VARCHAR(20),
  "operator_a_capability_evaluated_at" TIMESTAMPTZ,
  "operator_a_capability_snapshot_digest" VARCHAR(128),
  "operator_b_capability_decision_id" VARCHAR(160),
  "operator_b_capability_snapshot_version" INTEGER,
  "operator_b_capability_policy_version" VARCHAR(120),
  "operator_b_required_capability_union_digest" VARCHAR(128),
  "operator_b_granted_capability_set_digest" VARCHAR(128),
  "operator_b_capability_decision" VARCHAR(20),
  "operator_b_capability_evaluated_at" TIMESTAMPTZ,
  "operator_b_capability_snapshot_digest" VARCHAR(128),
  "approved_by_operator_id" VARCHAR(160),
  "approved_capability" VARCHAR(100),
  "approved_capability_digest" VARCHAR(128),
  "decision_snapshot" JSONB NOT NULL,
  "decision_snapshot_digest" VARCHAR(128) NOT NULL,
  "erasure_override" BOOLEAN NOT NULL DEFAULT false,
  "erasure_override_code" VARCHAR(100),
  "override_hold_id" UUID,
  "override_authority_digest" VARCHAR(128),
  "override_reason_digest" VARCHAR(128),
  "key_registry_result_digest" VARCHAR(128),
  "recovery_deadline_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "destroyed_at" TIMESTAMPTZ,
  "error_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_key_destruction_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_purge_work_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" UUID NOT NULL,
  "object_type" VARCHAR(100) NOT NULL,
  "object_id" UUID NOT NULL,
  "state" "ai_purge_work_item_state" NOT NULL DEFAULT 'pending',
  "claim_id" VARCHAR(160),
  "claimed_at" TIMESTAMPTZ,
  "lease_expires_at" TIMESTAMPTZ,
  "fence" INTEGER NOT NULL DEFAULT 0,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "key_lineage_digest" VARCHAR(128),
  "error_code" VARCHAR(100),
  "error_digest" VARCHAR(128),
  "recovery_deadline_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_purge_work_items_pkey" PRIMARY KEY ("id")
);

-- The old namespaces are deliberately replaced: account_cleanup is an
-- internal lifecycle carrier and can never be a public idempotency key.
ALTER TABLE "ai_lifecycle_operations"
  DROP CONSTRAINT "ai_lifecycle_operations_target_contract_ck";
ALTER TABLE "ai_idempotency_keys"
  DROP CONSTRAINT "ai_idempotency_keys_result_namespace_ck";

ALTER TABLE "ai_lifecycle_operations"
  ADD CONSTRAINT "ai_lifecycle_operations_target_contract_ck" CHECK (
    (
      "operation" = 'export_create' AND "result_kind" = 'export_job'
      AND "idempotency_key_id" IS NOT NULL
      AND "account_cleanup_correlation_digest" IS NULL
      AND "export_format" = 'json_v1' AND "export_scope" IS NOT NULL
      AND "export_as_of" IS NOT NULL
      AND "expected_conversation_version" IS NULL
      AND "expected_lifecycle_revision" IS NULL
    )
    OR (
      "operation" = 'conversation_delete' AND "result_kind" = 'conversation_delete'
      AND "idempotency_key_id" IS NOT NULL
      AND "account_cleanup_correlation_digest" IS NULL
      AND "target_entity_id" IS NOT NULL
      AND "expected_conversation_version" IS NOT NULL
      AND "claimed_conversation_version" IS NOT NULL
      AND "expected_lifecycle_revision" IS NULL
      AND "export_as_of" IS NULL
    )
    OR (
      "operation" = 'artifact_delete' AND "result_kind" = 'artifact_delete'
      AND "idempotency_key_id" IS NOT NULL
      AND "account_cleanup_correlation_digest" IS NULL
      AND "target_entity_id" IS NOT NULL
      AND "expected_lifecycle_revision" IS NOT NULL
      AND "claimed_lifecycle_revision" IS NOT NULL
      AND "expected_conversation_version" IS NULL
      AND "export_as_of" IS NULL
    )
    OR (
      "operation" = 'account_cleanup' AND "result_kind" = 'account_cleanup'
      AND "idempotency_key_id" IS NULL
      AND "student_id" IS NULL
      AND "account_cleanup_correlation_digest" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "ai_lifecycle_operations_state_contract_ck" CHECK (
    "state" <> 'awaiting_dependency' OR "operation" = 'account_cleanup'
  ),
  ADD CONSTRAINT "ai_lifecycle_operations_revision_nonnegative_t11_ck" CHECK (
    "version" >= 0
    AND ("expected_conversation_version" IS NULL OR "expected_conversation_version" >= 0)
    AND ("claimed_conversation_version" IS NULL OR "claimed_conversation_version" >= 0)
    AND ("expected_lifecycle_revision" IS NULL OR "expected_lifecycle_revision" >= 0)
    AND ("claimed_lifecycle_revision" IS NULL OR "claimed_lifecycle_revision" >= 0)
  ),
  ADD CONSTRAINT "ai_lifecycle_operations_owner_state_ck" CHECK (
    ("owner_state" = 'active' AND "student_id" IS NOT NULL)
    OR ("owner_state" = 'account_deleted' AND "student_id" IS NULL AND "owner_reference_digest" IS NOT NULL)
  );

ALTER TABLE "ai_idempotency_keys"
  ADD CONSTRAINT "ai_idempotency_keys_no_account_cleanup_ck" CHECK ("operation" <> 'account_cleanup'),
  ADD CONSTRAINT "ai_idempotency_keys_owner_state_ck" CHECK (
    ("owner_state" = 'active' AND "student_id" IS NOT NULL)
    OR ("owner_state" = 'account_deleted' AND "student_id" IS NULL AND "owner_reference_digest" IS NOT NULL)
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

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_owner_state_ck" CHECK (
    ("owner_state" = 'active' AND "student_id" IS NOT NULL)
    OR ("owner_state" = 'account_deleted' AND "student_id" IS NULL AND "owner_reference_digest" IS NOT NULL)
  );

-- Purging is an explicit unavailable marker. Existing legacy rows may not
-- have an envelope, so the foundation check is widened without touching the
-- prior migration file or copying plaintext.
ALTER TABLE "ai_messages"
  DROP CONSTRAINT "ai_messages_envelope_required_after_legacy_ck";
ALTER TABLE "ai_messages"
  ADD CONSTRAINT "ai_messages_envelope_required_after_legacy_ck" CHECK (
    "content_state" IN ('legacy_plaintext', 'retired', 'purging', 'purged')
    OR ("content_envelope" IS NOT NULL AND "content_digest" IS NOT NULL)
  ),
  ADD CONSTRAINT "ai_messages_metadata_envelope_required_ck" CHECK (
    "metadata_state" IN ('legacy_plaintext', 'retired', 'purging', 'purged')
    OR ("metadata_envelope" IS NOT NULL AND "metadata_digest" IS NOT NULL)
  );

ALTER TABLE "ai_messages"
  ALTER COLUMN "metadata_state" SET DEFAULT 'encrypted';

ALTER TABLE "ai_export_jobs"
  ADD CONSTRAINT "ai_export_jobs_format_ck" CHECK ("format" = 'json_v1'),
  ADD CONSTRAINT "ai_export_jobs_part_limits_ck" CHECK (
    "package_bytes" IS NULL OR "package_bytes" BETWEEN 1 AND 10485760
  ),
  ADD CONSTRAINT "ai_export_jobs_owner_state_ck" CHECK (
    ("owner_state" = 'active' AND "student_id" IS NOT NULL)
    OR ("owner_state" = 'account_deleted' AND "student_id" IS NULL AND "owner_reference_digest" IS NOT NULL)
  ),
  ADD CONSTRAINT "ai_export_jobs_ready_contract_ck" CHECK (
    ("state" <> 'ready'
      OR ("snapshot_digest" IS NOT NULL AND "package_bytes" IS NOT NULL
          AND "download_ready_at" IS NOT NULL AND "download_expires_at" IS NOT NULL))
    AND ("state" <> 'expired' OR "expired_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "ai_export_jobs_terminal_retention_ck" CHECK (
    "state" NOT IN ('failed_terminal', 'expired')
    OR ("terminal_at" IS NOT NULL
        AND "terminal_retention_expires_at" IS NOT NULL
        AND "terminal_retention_expires_at" >= "terminal_at")
  ),
  ADD CONSTRAINT "ai_export_jobs_pre_ready_contract_ck" CHECK (
    "state" NOT IN ('pending', 'materializing', 'failed_retryable')
    OR ("download_ready_at" IS NULL AND "download_expires_at" IS NULL)
  );

ALTER TABLE "ai_export_parts"
  ADD CONSTRAINT "ai_export_parts_ordinal_ck" CHECK ("ordinal" >= 0),
  ADD CONSTRAINT "ai_export_parts_size_ck" CHECK ("plaintext_bytes" BETWEEN 1 AND 262144);

ALTER TABLE "ai_retention_holds"
  ADD CONSTRAINT "ai_retention_holds_subject_ck" CHECK (
    ("subject_type" = 'student' AND "subject_id" IS NULL AND "student_id" IS NOT NULL)
    OR ("subject_type" <> 'student' AND "subject_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "ai_retention_holds_version_ck" CHECK ("version" >= 0),
  ADD CONSTRAINT "ai_retention_holds_release_time_ck" CHECK (
    ("state" = 'active' AND "released_at" IS NULL)
    OR ("state" = 'released' AND "released_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "ai_retention_holds_digest_state_ck" CHECK (
    ("state" = 'active' AND length(trim("hold_digest")) >= 32)
    OR ("state" = 'released' AND length(trim("hold_digest")) >= 32)
  );

ALTER TABLE "ai_retention_hold_releases"
  ADD CONSTRAINT "ai_retention_hold_releases_operator_ck" CHECK (
    "approved_by_operator_id" IS NULL OR "approved_by_operator_id" <> "requested_by_operator_id"
  ),
  ADD CONSTRAINT "ai_retention_hold_releases_version_ck" CHECK ("expected_hold_version" >= 0);

ALTER TABLE "ai_key_destruction_claims"
  ADD CONSTRAINT "ai_key_destruction_claims_operator_ck" CHECK (
    "approved_by_operator_id" IS NULL OR "approved_by_operator_id" <> "requested_by_operator_id"
  ),
  ADD CONSTRAINT "ai_key_destruction_claims_version_ck" CHECK ("claim_version" >= 0),
  ADD CONSTRAINT "ai_key_destruction_claims_override_ck" CHECK (
    (NOT "erasure_override" AND "erasure_override_code" IS NULL)
    OR ("erasure_override" AND "erasure_override_code" IS NOT NULL
        AND "override_hold_id" IS NOT NULL
        AND "operator_b_id" IS NOT NULL
        AND "operator_a_id" <> "operator_b_id"
        AND "operator_a_capability_snapshot_digest" IS NOT NULL
        AND "operator_b_capability_snapshot_digest" IS NOT NULL)
  );

ALTER TABLE "ai_purge_work_items"
  ADD CONSTRAINT "ai_purge_work_items_version_ck" CHECK ("fence" >= 0);

CREATE OR REPLACE FUNCTION prevent_ai_content_migration_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai content migration audit rows are append-only';
END;
$$;

CREATE TRIGGER ai_content_migration_audits_append_only
BEFORE UPDATE OR DELETE ON "ai_content_migration_audits"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_content_migration_audit_mutation();

CREATE UNIQUE INDEX "ai_lifecycle_operations_account_cleanup_correlation_key"
  ON "ai_lifecycle_operations" ("account_cleanup_correlation_digest")
  WHERE "operation" = 'account_cleanup';
CREATE INDEX "ai_lifecycle_operations_operation_correlation_idx"
  ON "ai_lifecycle_operations" ("operation", "account_cleanup_correlation_digest");

CREATE INDEX "ai_export_jobs_state_recovery_deadline_idx"
  ON "ai_export_jobs" ("state", "recovery_deadline_at");
CREATE INDEX "ai_export_jobs_owner_state_download_expires_idx"
  ON "ai_export_jobs" ("owner_state", "download_expires_at");
CREATE UNIQUE INDEX "ai_export_jobs_operation_id_key"
  ON "ai_export_jobs" ("operation_id");
CREATE UNIQUE INDEX "ai_export_parts_job_ordinal_key"
  ON "ai_export_parts" ("export_job_id", "ordinal");
CREATE INDEX "ai_export_parts_job_ordinal_idx"
  ON "ai_export_parts" ("export_job_id", "ordinal");

CREATE UNIQUE INDEX "ai_retention_holds_active_subject_key"
  ON "ai_retention_holds" (
    "subject_type", COALESCE("subject_id", "student_id"), "hold_type"
  )
  WHERE "state" = 'active' AND "subject_state" = 'attached';
CREATE INDEX "ai_retention_holds_subject_state_idx"
  ON "ai_retention_holds" ("subject_type", "subject_id", "hold_type", "state");
CREATE INDEX "ai_retention_holds_student_state_idx"
  ON "ai_retention_holds" ("student_id", "state");
CREATE UNIQUE INDEX "ai_retention_hold_releases_hold_version_key"
  ON "ai_retention_hold_releases" ("hold_id", "expected_hold_version");
CREATE INDEX "ai_retention_hold_releases_state_created_idx"
  ON "ai_retention_hold_releases" ("state", "created_at");

CREATE UNIQUE INDEX "ai_key_destruction_claims_object_lineage_key"
  ON "ai_key_destruction_claims" ("object_type", "object_id", "key_lineage_digest");
CREATE INDEX "ai_key_destruction_claims_operation_state_idx"
  ON "ai_key_destruction_claims" ("operation_id", "state");
CREATE INDEX "ai_key_destruction_claims_state_created_idx"
  ON "ai_key_destruction_claims" ("state", "created_at");
CREATE UNIQUE INDEX "ai_purge_work_items_operation_object_key"
  ON "ai_purge_work_items" ("operation_id", "object_type", "object_id");
CREATE INDEX "ai_purge_work_items_state_lease_idx"
  ON "ai_purge_work_items" ("state", "lease_expires_at");

ALTER TABLE "ai_export_jobs"
  ADD CONSTRAINT "ai_export_jobs_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "ai_lifecycle_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_export_jobs_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_export_parts"
  ADD CONSTRAINT "ai_export_parts_export_job_id_fkey"
  FOREIGN KEY ("export_job_id") REFERENCES "ai_export_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_retention_holds"
  ADD CONSTRAINT "ai_retention_holds_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_retention_hold_releases"
  ADD CONSTRAINT "ai_retention_hold_releases_hold_id_fkey"
  FOREIGN KEY ("hold_id") REFERENCES "ai_retention_holds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_key_destruction_claims"
  ADD CONSTRAINT "ai_key_destruction_claims_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "ai_lifecycle_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_key_destruction_claims_hold_id_fkey"
  FOREIGN KEY ("hold_id") REFERENCES "ai_retention_holds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_purge_work_items"
  ADD CONSTRAINT "ai_purge_work_items_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "ai_lifecycle_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Inventory is explicit even when a source has zero rows. Scalar context and
-- routing/token fields remain read-only evidence until a later retirement
-- migration; this migration never clears them.
INSERT INTO "ai_content_migration_audits" (
  "source_table", "source_field", "source_object_id", "content_class",
  "source_digest", "migration_version", "state", "details",
  "table_name", "column_name", "row_count", "classification", "action",
  "status", "rollback_boundary"
)
SELECT v.source_table, v.source_field, NULL, v.content_class,
       md5(v.source_table || ':' || v.source_field || ':' || v.row_count::text),
       '20260827100000',
       CASE WHEN v.row_count = 0 THEN 'zero_rows'::"ai_migration_state"
            WHEN v.action = 'preserve_read_only' THEN 'pending'::"ai_migration_state"
            ELSE 'blocked'::"ai_migration_state" END,
       jsonb_build_object('inventory', true, 'rowCount', v.row_count,
                          'effectiveAt', '2026-09-01T00:00:00+07:00',
                          'retirementMigration', 'post-validation-only'),
       v.source_table, v.source_field, v.row_count,
       CASE WHEN v.row_count = 0 THEN 'zero_rows'::"ai_migration_classification"
            WHEN v.action = 'preserve_read_only' THEN 'digest_only'::"ai_migration_classification"
            ELSE 'review_required'::"ai_migration_classification" END,
       v.action, CASE WHEN v.row_count = 0 THEN 'validated'::"ai_migration_audit_status"
                     WHEN v.action = 'preserve_read_only' THEN 'discovered'::"ai_migration_audit_status"
                     ELSE 'blocked'::"ai_migration_audit_status" END,
       'pre-retirement'
FROM (
  SELECT 'ai_conversations' AS source_table, 'context_entity_type' AS source_field,
         'content_free'::"ai_migration_content_class" AS content_class,
         COUNT(*) FILTER (WHERE "context_entity_type" IS NOT NULL)::integer AS row_count,
         'preserve_read_only'::"ai_migration_action" AS action
  FROM "ai_conversations"
  UNION ALL
  SELECT 'ai_conversations', 'context_entity_id', 'content_free',
         COUNT(*) FILTER (WHERE "context_entity_id" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_conversations"
  UNION ALL
  SELECT 'ai_conversations', 'context_entity', 'content_free',
         COUNT(*) FILTER (WHERE "context_entity_type" IS NOT NULL OR "context_entity_id" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_conversations"
  UNION ALL
  SELECT 'ai_messages', 'content_markdown', 'learner_visible',
         COUNT(*) FILTER (WHERE "content_markdown" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "ai_messages"
  UNION ALL
  SELECT 'ai_messages', 'role=system', 'hidden_system',
         COUNT(*) FILTER (WHERE "role" = 'system'::"ai_message_role")::integer, 'preserve_read_only'
  FROM "ai_messages"
  UNION ALL
  SELECT 'ai_messages', 'metadata', 'learner_visible',
         COUNT(*) FILTER (WHERE "metadata" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "ai_messages"
  UNION ALL
  SELECT 'ai_messages', 'metadata:role=system', 'hidden_system',
         COUNT(*) FILTER (WHERE "role" = 'system'::"ai_message_role" AND "metadata" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_messages"
  UNION ALL
  SELECT 'ai_messages', 'metadata:role=tool', 'hidden_system',
         COUNT(*) FILTER (WHERE "role" = 'tool'::"ai_message_role" AND "metadata" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_messages"
  UNION ALL
  SELECT 'ai_messages', 'content_markdown:role=system', 'hidden_system',
         COUNT(*) FILTER (WHERE "role" = 'system'::"ai_message_role" AND "content_markdown" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_messages"
  UNION ALL
  SELECT 'weakness_analyses', 'summary_markdown', 'learner_visible',
         COUNT(*) FILTER (WHERE "summary_markdown" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "weakness_analyses"
  UNION ALL
  SELECT 'weakness_analysis_topics', 'recommendation_text', 'learner_visible',
         COUNT(*) FILTER (WHERE "recommendation_text" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "weakness_analysis_topics"
  UNION ALL
  SELECT 'learning_recommendations', 'reason', 'learner_visible',
         COUNT(*) FILTER (WHERE "reason" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "learning_recommendations"
  UNION ALL
  SELECT 'adaptive_practice_answers', 'answer_text', 'learner_visible',
         COUNT(*) FILTER (WHERE "answer_text" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "adaptive_practice_answers"
  UNION ALL
  SELECT 'adaptive_practice_answers', 'generated_item_ref', 'content_free',
         COUNT(*) FILTER (WHERE "generated_item_ref" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "adaptive_practice_answers"
  UNION ALL
  SELECT 'adaptive_practice_items', 'prompt_snapshot_ciphertext', 'learner_visible',
         COUNT(*) FILTER (WHERE "prompt_snapshot_ciphertext" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "adaptive_practice_items"
  UNION ALL
  SELECT 'adaptive_practice_items', 'option_snapshot_ciphertext', 'learner_visible',
         COUNT(*) FILTER (WHERE "option_snapshot_ciphertext" IS NOT NULL)::integer, 'backfill_envelope'
  FROM "adaptive_practice_items"
  UNION ALL
  SELECT 'adaptive_practice_items', 'scoring_snapshot_ciphertext', 'hidden_system',
         COUNT(*) FILTER (WHERE "scoring_snapshot_ciphertext" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "adaptive_practice_items"
  UNION ALL
  SELECT 'ai_requests', 'prompt_template', 'content_free',
         COUNT(*) FILTER (WHERE "prompt_template" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_requests"
  UNION ALL
  SELECT 'ai_requests', 'model', 'content_free',
         COUNT(*) FILTER (WHERE "model" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_requests"
  UNION ALL
  SELECT 'ai_requests', 'input_tokens', 'content_free',
         COUNT(*) FILTER (WHERE "input_tokens" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_requests"
  UNION ALL
  SELECT 'ai_requests', 'output_tokens', 'content_free',
         COUNT(*) FILTER (WHERE "output_tokens" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_requests"
  UNION ALL
  SELECT 'ai_usage_daily', 'prompt_tokens', 'content_free',
         COUNT(*) FILTER (WHERE "prompt_tokens" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_usage_daily"
  UNION ALL
  SELECT 'ai_usage_daily', 'completion_tokens', 'content_free',
         COUNT(*) FILTER (WHERE "completion_tokens" IS NOT NULL)::integer, 'preserve_read_only'
  FROM "ai_usage_daily"
) AS v
ON CONFLICT DO NOTHING;

-- State-first purge markers are intentionally represented as data. A worker
-- must transition the marker to purging before destroying any envelope key;
-- ciphertext is never removed by a null-only update.
