-- Sprint 4 T10 policy console. Additive and forward-only: historical policy,
-- audit, request, usage, and lifecycle rows are never rewritten or removed.

CREATE TYPE "ai_provider_gate_state" AS ENUM ('open_blocked', 'release_ready');
CREATE TYPE "ai_admin_command_operation" AS ENUM (
  'ai_policy_draft_create',
  'ai_policy_draft_edit',
  'ai_policy_validate',
  'ai_policy_preview',
  'ai_policy_approve',
  'ai_policy_schedule',
  'ai_policy_activate',
  'ai_policy_rollback',
  'ai_policy_retention_extension_request'
);
CREATE TYPE "ai_admin_command_state" AS ENUM ('pending', 'accepted', 'rejected', 'expired');
CREATE TYPE "ai_admin_command_result_kind" AS ENUM (
  'draft', 'validation', 'preview', 'approval', 'schedule', 'activation',
  'rollback', 'retention_extension'
);
CREATE TYPE "ai_policy_preview_mode" AS ENUM ('categorical', 'aggregate');

ALTER TYPE "ai_policy_audit_action" ADD VALUE IF NOT EXISTS 'draft_edited';
ALTER TYPE "ai_policy_audit_action" ADD VALUE IF NOT EXISTS 'previewed';
ALTER TYPE "ai_policy_audit_action" ADD VALUE IF NOT EXISTS 'rollback_created';
ALTER TYPE "ai_policy_audit_action" ADD VALUE IF NOT EXISTS 'retention_extension_requested';

ALTER TABLE "ai_policy_bundles"
  ADD COLUMN "provider_gate_state" "ai_provider_gate_state" NOT NULL DEFAULT 'open_blocked',
  ADD COLUMN "editor_actor_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "required_capability_union" "ai_capability_name"[] NOT NULL DEFAULT ARRAY[]::"ai_capability_name"[],
  ADD COLUMN "approval_snapshot_id" UUID,
  ADD COLUMN "approval_snapshot_digest" VARCHAR(128),
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ai_policy_audit_events"
  ADD COLUMN "validation_digest" VARCHAR(128),
  ADD COLUMN "from_state" "ai_policy_state",
  ADD COLUMN "to_state" "ai_policy_state",
  ADD COLUMN "approval_snapshot_id" UUID,
  ADD COLUMN "approval_snapshot_digest" VARCHAR(128);

CREATE TABLE "ai_policy_approval_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bundle_id" UUID NOT NULL,
  "bundle_revision" INTEGER NOT NULL,
  "snapshot_version" VARCHAR(40) NOT NULL,
  "editor_actor_ids" UUID[] NOT NULL,
  "required_capability_union" "ai_capability_name"[] NOT NULL,
  "snapshot_digest" VARCHAR(128) NOT NULL,
  "approval_audit_event_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_policy_approval_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_admin_command_ledgers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "admin_principal_id" UUID NOT NULL,
  "operation" "ai_admin_command_operation" NOT NULL,
  "client_request_id" VARCHAR(120) NOT NULL,
  "request_fingerprint" VARCHAR(128) NOT NULL,
  "fingerprint_key_version" VARCHAR(40) NOT NULL,
  "state" "ai_admin_command_state" NOT NULL DEFAULT 'pending',
  "result_kind" "ai_admin_command_result_kind" NOT NULL,
  "result_id" UUID,
  "rejection_code" VARCHAR(100),
  "rejection_class" "ai_rejection_class",
  "retention_target_ref" VARCHAR(160),
  "retention_upper_bound" TIMESTAMPTZ,
  "retention_policy_bundle_version" VARCHAR(120),
  "retention_audit_reference" UUID,
  "preview_mode" "ai_policy_preview_mode",
  "preview_active_bundle_id" UUID,
  "preview_active_bundle_version" VARCHAR(120),
  "preview_effective_at" TIMESTAMPTZ,
  "preview_as_of" TIMESTAMPTZ,
  "preview_validation_digest" VARCHAR(128),
  "preview_reservation_id" VARCHAR(120),
  "reason" VARCHAR(500),
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "terminal_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ai_admin_command_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_policy_bundles_active_unique"
  ON "ai_policy_bundles" (("state")) WHERE "state" = 'active';
CREATE UNIQUE INDEX "ai_policy_bundles_scheduled_unique"
  ON "ai_policy_bundles" (("state")) WHERE "state" = 'scheduled';
CREATE INDEX "ai_policy_bundles_state_effective_revision_idx"
  ON "ai_policy_bundles" ("state", "effective_at", "revision");

CREATE UNIQUE INDEX "ai_policy_bundles_approval_snapshot_id_key"
  ON "ai_policy_bundles" ("approval_snapshot_id");
CREATE UNIQUE INDEX "ai_policy_approval_snapshots_bundle_revision_key"
  ON "ai_policy_approval_snapshots" ("bundle_id", "bundle_revision");
CREATE UNIQUE INDEX "ai_policy_approval_snapshots_snapshot_digest_key"
  ON "ai_policy_approval_snapshots" ("snapshot_digest");
CREATE UNIQUE INDEX "ai_policy_approval_snapshots_audit_event_key"
  ON "ai_policy_approval_snapshots" ("approval_audit_event_id");
CREATE INDEX "ai_policy_audit_events_action_occurred_idx"
  ON "ai_policy_audit_events" ("action", "occurred_at");

CREATE UNIQUE INDEX "ai_admin_command_ledgers_principal_operation_key"
  ON "ai_admin_command_ledgers" ("admin_principal_id", "operation", "client_request_id");
CREATE INDEX "ai_admin_command_ledgers_principal_operation_state_idx"
  ON "ai_admin_command_ledgers" ("admin_principal_id", "operation", "state");
CREATE INDEX "ai_admin_command_ledgers_state_expires_idx"
  ON "ai_admin_command_ledgers" ("state", "expires_at");

ALTER TABLE "ai_policy_bundles"
  ADD CONSTRAINT "ai_policy_bundles_revision_nonnegative_ck" CHECK ("revision" >= 0),
  ADD CONSTRAINT "ai_policy_bundles_provider_gate_blocked_ck"
    CHECK ("provider_gate_state" = 'open_blocked');
ALTER TABLE "ai_policy_approval_snapshots"
  ADD CONSTRAINT "ai_policy_approval_snapshots_revision_nonnegative_ck" CHECK ("bundle_revision" >= 0);
ALTER TABLE "ai_admin_command_ledgers"
  ADD CONSTRAINT "ai_admin_command_ledgers_version_nonnegative_ck" CHECK ("version" >= 0),
  ADD CONSTRAINT "ai_admin_command_ledgers_key_length_ck" CHECK (length("client_request_id") BETWEEN 1 AND 120);

ALTER TABLE "ai_policy_approval_snapshots"
  ADD CONSTRAINT "ai_policy_approval_snapshots_bundle_fkey"
    FOREIGN KEY ("bundle_id") REFERENCES "ai_policy_bundles"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_policy_bundles"
  ADD CONSTRAINT "ai_policy_bundles_approval_snapshot_fkey"
    FOREIGN KEY ("approval_snapshot_id") REFERENCES "ai_policy_approval_snapshots"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_policy_audit_events"
  ADD CONSTRAINT "ai_policy_audit_events_approval_snapshot_fkey"
    FOREIGN KEY ("approval_snapshot_id") REFERENCES "ai_policy_approval_snapshots"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_policy_approval_snapshots"
  ADD CONSTRAINT "ai_policy_approval_snapshots_audit_event_fkey"
    FOREIGN KEY ("approval_audit_event_id") REFERENCES "ai_policy_audit_events"("id") ON DELETE RESTRICT;
ALTER TABLE "ai_admin_command_ledgers"
  ADD CONSTRAINT "ai_admin_command_ledgers_principal_fkey"
    FOREIGN KEY ("admin_principal_id") REFERENCES "users"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_ai_policy_bundle_unsafe_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."provider_gate_state" <> 'open_blocked' THEN
    RAISE EXCEPTION 'provider release gate is owner-authoritative and blocked';
  END IF;
  IF NEW."revision" < OLD."revision" THEN
    RAISE EXCEPTION 'policy bundle revision cannot move backwards';
  END IF;
  IF NOT (NEW."editor_actor_ids" @> OLD."editor_actor_ids") THEN
    RAISE EXCEPTION 'policy editor actor set is append-only';
  END IF;
  IF OLD."state" NOT IN ('draft', 'rejected') AND (
    NEW."bundle_version" IS DISTINCT FROM OLD."bundle_version"
    OR NEW."config_schema_version" IS DISTINCT FROM OLD."config_schema_version"
    OR NEW."effective_at" IS DISTINCT FROM OLD."effective_at"
    OR NEW."supersedes_bundle_id" IS DISTINCT FROM OLD."supersedes_bundle_id"
    OR NEW."quota_config" IS DISTINCT FROM OLD."quota_config"
    OR NEW."settlement_config" IS DISTINCT FROM OLD."settlement_config"
    OR NEW."report_config" IS DISTINCT FROM OLD."report_config"
    OR NEW."retention_config" IS DISTINCT FROM OLD."retention_config"
    OR NEW."validation_digest" IS DISTINCT FROM OLD."validation_digest"
    OR NEW."editor_actor_ids" IS DISTINCT FROM OLD."editor_actor_ids"
    OR NEW."required_capability_union" IS DISTINCT FROM OLD."required_capability_union"
  ) THEN
    RAISE EXCEPTION 'non-draft policy bundle content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_policy_bundle_unsafe_mutation
BEFORE UPDATE ON "ai_policy_bundles"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_policy_bundle_unsafe_mutATION();

CREATE OR REPLACE FUNCTION prevent_ai_policy_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'policy audit history is append-only';
END;
$$;

CREATE TRIGGER ai_policy_audit_no_update
BEFORE UPDATE OR DELETE ON "ai_policy_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_policy_audit_mutation();

CREATE OR REPLACE FUNCTION prevent_ai_policy_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."approval_audit_event_id" IS NULL
     AND NEW."approval_audit_event_id" IS NOT NULL
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."bundle_id" IS NOT DISTINCT FROM OLD."bundle_id"
     AND NEW."bundle_revision" IS NOT DISTINCT FROM OLD."bundle_revision"
     AND NEW."snapshot_version" IS NOT DISTINCT FROM OLD."snapshot_version"
     AND NEW."editor_actor_ids" IS NOT DISTINCT FROM OLD."editor_actor_ids"
     AND NEW."required_capability_union" IS NOT DISTINCT FROM OLD."required_capability_union"
     AND NEW."snapshot_digest" IS NOT DISTINCT FROM OLD."snapshot_digest"
     AND NEW."created_at" IS NOT DISTINCT FROM OLD."created_at" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'policy approval snapshots are immutable';
END;
$$;

CREATE TRIGGER ai_policy_snapshot_no_update
BEFORE UPDATE OR DELETE ON "ai_policy_approval_snapshots"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_policy_snapshot_mutation();

CREATE OR REPLACE FUNCTION prevent_ai_admin_command_identity_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."admin_principal_id" IS DISTINCT FROM OLD."admin_principal_id"
     OR NEW."operation" IS DISTINCT FROM OLD."operation"
     OR NEW."client_request_id" IS DISTINCT FROM OLD."client_request_id"
     OR NEW."request_fingerprint" IS DISTINCT FROM OLD."request_fingerprint"
     OR NEW."fingerprint_key_version" IS DISTINCT FROM OLD."fingerprint_key_version" THEN
    RAISE EXCEPTION 'admin command identity is immutable';
  END IF;
  IF NEW."version" < OLD."version" THEN
    RAISE EXCEPTION 'admin command version cannot move backwards';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_admin_command_identity_immutable
BEFORE UPDATE ON "ai_admin_command_ledgers"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_admin_command_identity_mutation();
