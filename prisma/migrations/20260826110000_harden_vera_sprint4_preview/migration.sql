-- Sprint 4 correction: make the T10 aggregate-preview handoff a typed,
-- durable relationship.  This migration is additive and leaves all prior
-- Sprint 1-3 migrations untouched.

ALTER TABLE "ai_admin_command_ledgers"
  ADD COLUMN "preview_reservation_uuid" UUID;

CREATE UNIQUE INDEX "ai_admin_command_ledgers_preview_reservation_uuid_key"
  ON "ai_admin_command_ledgers" ("preview_reservation_uuid")
  WHERE "preview_reservation_uuid" IS NOT NULL;

ALTER TABLE "ai_admin_command_ledgers"
  ADD CONSTRAINT "ai_admin_command_ledgers_preview_reservation_uuid_fkey"
    FOREIGN KEY ("preview_reservation_uuid")
    REFERENCES "ai_report_reservations"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- The policy-console schedule command is the one narrow lifecycle transition
-- that is allowed to choose a future effective boundary after approval. Keep
-- all bundle content immutable: only pending_approval -> scheduled may change
-- effective_at, and every other non-draft content mutation remains rejected.
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
    OR (
      NEW."effective_at" IS DISTINCT FROM OLD."effective_at"
      AND NOT (OLD."state" = 'pending_approval' AND NEW."state" = 'scheduled')
    )
    OR NEW."supersedes_bundle_id" IS DISTINCT FROM OLD."supersedes_bundle_id"
    OR NEW."quota_config" IS DISTINCT FROM OLD."quota_config"
    OR NEW."settlement_config" IS DISTINCT FROM OLD."settlement_config"
    OR NEW."report_config" IS DISTINCT FROM OLD."report_config"
    OR NEW."retention_config" IS DISTINCT FROM OLD."retention_config"
    OR (
      NEW."validation_digest" IS DISTINCT FROM OLD."validation_digest"
      AND NOT (OLD."state" = 'pending_approval' AND NEW."state" = 'scheduled')
    )
    OR NEW."editor_actor_ids" IS DISTINCT FROM OLD."editor_actor_ids"
    OR NEW."required_capability_union" IS DISTINCT FROM OLD."required_capability_union"
  ) THEN
    RAISE EXCEPTION 'non-draft policy bundle content is immutable';
  END IF;
  RETURN NEW;
END;
$$;
