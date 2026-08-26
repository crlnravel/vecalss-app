-- Sprint 4 T9: additive, forward-only report reservation and outcome audit.
-- Existing report-window/audit columns remain for compatibility with the
-- Sprint 1 foundation. New T9 paths use the typed columns below.

CREATE TYPE "ai_report_window_kind" AS ENUM ('budget_24h', 'burst_10m');
CREATE TYPE "ai_report_reservation_state" AS ENUM ('reserved', 'completed', 'failed', 'process_lost', 'expired');
CREATE TYPE "ai_report_reservation_result_kind" AS ENUM ('report', 'policy_preview', 'typed_error');
CREATE TYPE "ai_admin_report_event_type" AS ENUM ('reservation', 'outcome');
CREATE TYPE "ai_admin_report_operation" AS ENUM ('admin_report_query', 'admin_policy_preview');
CREATE TYPE "ai_admin_report_suppression_state" AS ENUM ('not_evaluated', 'ready', 'partial_unavailable', 'suppressed', 'coarsened', 'unavailable', 'failed', 'process_lost');

ALTER TABLE "ai_report_budget_windows"
  ADD COLUMN "window_kind" "ai_report_window_kind" NOT NULL DEFAULT 'budget_24h',
  ADD COLUMN "window_ends_at" TIMESTAMPTZ,
  ADD COLUMN "budget_units_snapshot" INTEGER,
  ADD COLUMN "used_budget_units" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "request_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "ai_report_budget_windows"
SET "window_ends_at" = "window_expires_at",
    "budget_units_snapshot" = "unit_limit",
    "used_budget_units" = "consumed_units",
    "request_count" = "consumed_requests"
WHERE "window_ends_at" IS NULL OR "budget_units_snapshot" IS NULL;

ALTER TABLE "ai_report_budget_windows"
  ALTER COLUMN "window_ends_at" SET NOT NULL,
  ALTER COLUMN "budget_units_snapshot" SET NOT NULL;

DROP INDEX IF EXISTS "ai_report_budget_windows_principal_key_window_started_at_key";
CREATE UNIQUE INDEX "ai_report_budget_windows_principal_key_window_kind_window_started_at_key"
  ON "ai_report_budget_windows"("principal_key", "window_kind", "window_started_at");
CREATE INDEX "ai_report_budget_windows_principal_key_window_kind_window_ends_at_idx"
  ON "ai_report_budget_windows"("principal_key", "window_kind", "window_ends_at");

ALTER TABLE "ai_admin_report_audits"
  ADD COLUMN "reservation_id" UUID,
  ADD COLUMN "admin_principal_id" UUID,
  ADD COLUMN "event_type" "ai_admin_report_event_type" NOT NULL DEFAULT 'reservation',
  ADD COLUMN "operation" "ai_admin_report_operation" NOT NULL DEFAULT 'admin_report_query',
  ADD COLUMN "policy_bundle_version" VARCHAR(120) NOT NULL DEFAULT 'legacy',
  ADD COLUMN "query_shape_digest" VARCHAR(128),
  ADD COLUMN "local_date_span" JSONB,
  ADD COLUMN "cost_units" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "suppression_state" "ai_admin_report_suppression_state" NOT NULL DEFAULT 'not_evaluated',
  ADD COLUMN "outcome_code" VARCHAR(80),
  ADD COLUMN "result_digest" VARCHAR(128),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "ai_admin_report_audits"
SET "admin_principal_id" = "actor_id",
    "query_shape_digest" = "query_fingerprint"
WHERE "admin_principal_id" IS NULL OR "query_shape_digest" IS NULL;

CREATE TABLE "ai_report_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_principal_id" UUID NOT NULL,
    "operation" "ai_admin_report_operation" NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "request_fingerprint" VARCHAR(128) NOT NULL,
    "fingerprint_key_version" VARCHAR(40) NOT NULL,
    "policy_bundle_version" VARCHAR(120) NOT NULL,
    "cost_units" INTEGER NOT NULL,
    "state" "ai_report_reservation_state" NOT NULL DEFAULT 'reserved',
    "result_kind" "ai_report_reservation_result_kind",
    "result_snapshot" JSONB,
    "result_digest" VARCHAR(128),
    "failure_code" VARCHAR(80),
    "reserved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "recovery_deadline_at" TIMESTAMPTZ NOT NULL,
    "recovery_lease_owner" VARCHAR(120),
    "recovery_fence_token" INTEGER,
    "expires_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_report_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_report_reservations_principal_operation_key_key"
  ON "ai_report_reservations"("admin_principal_id", "operation", "idempotency_key");
CREATE INDEX "ai_report_reservations_state_recovery_deadline_idx"
  ON "ai_report_reservations"("state", "recovery_deadline_at");
CREATE INDEX "ai_report_reservations_principal_reserved_at_idx"
  ON "ai_report_reservations"("admin_principal_id", "reserved_at");

CREATE UNIQUE INDEX "ai_admin_report_audits_reservation_id_event_type_key"
  ON "ai_admin_report_audits"("reservation_id", "event_type");
CREATE INDEX "ai_admin_report_audits_admin_principal_id_occurred_at_idx"
  ON "ai_admin_report_audits"("admin_principal_id", "occurred_at");

ALTER TABLE "ai_report_reservations"
  ADD CONSTRAINT "ai_report_reservations_admin_principal_id_fkey"
    FOREIGN KEY ("admin_principal_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_admin_report_audits"
  ADD CONSTRAINT "ai_admin_report_audits_reservation_id_fkey"
    FOREIGN KEY ("reservation_id") REFERENCES "ai_report_reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_report_budget_windows"
  ADD CONSTRAINT "ai_report_budget_windows_t9_nonnegative_ck" CHECK (
    "window_ends_at" > "window_started_at"
    AND "budget_units_snapshot" >= 0
    AND "used_budget_units" >= 0
    AND "request_count" >= 0
    AND "version" >= 0
  );

ALTER TABLE "ai_report_reservations"
  ADD CONSTRAINT "ai_report_reservations_cost_ck" CHECK ("cost_units" BETWEEN 1 AND 12),
  ADD CONSTRAINT "ai_report_reservations_version_ck" CHECK ("version" >= 0),
  ADD CONSTRAINT "ai_report_reservations_fence_ck" CHECK ("recovery_fence_token" IS NULL OR "recovery_fence_token" >= 0),
  ADD CONSTRAINT "ai_report_reservations_recovery_deadline_ck" CHECK ("recovery_deadline_at" >= "reserved_at"),
  ADD CONSTRAINT "ai_report_reservations_state_contract_ck" CHECK (
    ("state" = 'reserved' AND "result_kind" IS NULL AND "result_snapshot" IS NULL AND "result_digest" IS NULL AND "failure_code" IS NULL)
    OR ("state" = 'completed'
      AND (("operation" = 'admin_report_query' AND "result_kind" = 'report')
        OR ("operation" = 'admin_policy_preview' AND "result_kind" = 'policy_preview'))
      AND "result_snapshot" IS NOT NULL AND "result_digest" IS NOT NULL AND "failure_code" IS NULL)
    OR ("state" IN ('failed', 'process_lost') AND "result_kind" = 'typed_error' AND "result_snapshot" IS NOT NULL AND "result_digest" IS NOT NULL AND "failure_code" IS NOT NULL)
    OR ("state" = 'expired' AND "result_kind" IS NULL AND "result_snapshot" IS NULL AND "result_digest" IS NULL AND "failure_code" IS NULL)
  );

CREATE OR REPLACE FUNCTION prevent_ai_admin_report_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai admin report audit rows are append-only';
END;
$$;

CREATE TRIGGER ai_admin_report_audits_append_only
BEFORE UPDATE OR DELETE ON "ai_admin_report_audits"
FOR EACH ROW EXECUTE FUNCTION prevent_ai_admin_report_audit_mutation();
