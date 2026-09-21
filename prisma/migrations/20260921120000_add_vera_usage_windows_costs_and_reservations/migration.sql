-- Vera MVP billing/quota v2. The ledger version and calendar are immutable;
-- this migration is additive and leaves legacy v1 rows available for
-- settlement of pre-cutover requests.

ALTER TYPE "ai_usage_ledger_version" ADD VALUE IF NOT EXISTS 'vera_credit_usd_v2';
ALTER TYPE "ai_attempt_state" ADD VALUE IF NOT EXISTS 'reserved';
ALTER TYPE "ai_attempt_state" ADD VALUE IF NOT EXISTS 'dispatching';
ALTER TYPE "ai_attempt_state" ADD VALUE IF NOT EXISTS 'known';
ALTER TYPE "ai_attempt_state" ADD VALUE IF NOT EXISTS 'unknown';
ALTER TYPE "ai_attempt_state" ADD VALUE IF NOT EXISTS 'released';
ALTER TYPE "ai_attempt_state" ADD VALUE IF NOT EXISTS 'overrun';

CREATE TYPE "ai_usage_window_period_kind" AS ENUM ('day', 'iso_week', 'month');
CREATE TYPE "ai_usage_window_state" AS ENUM ('open', 'closed');
CREATE TYPE "ai_monetary_debt_state" AS ENUM ('clear', 'debt');
CREATE TYPE "ai_request_billing_state" AS ENUM ('prepared', 'dispatching', 'sent', 'known', 'unknown', 'released', 'overrun');
CREATE TYPE "ai_reservation_state" AS ENUM ('reserved', 'settled', 'released', 'unknown', 'overrun');

ALTER TABLE "ai_conversations"
  ADD COLUMN "next_request_sequence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ai_requests"
  ADD COLUMN "ledger_version" "ai_usage_ledger_version" NOT NULL DEFAULT 'vera_quota_v1',
  ADD COLUMN "conversation_sequence" INTEGER,
  ADD COLUMN "history_cutoff_sequence" INTEGER,
  ADD COLUMN "credit_cost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credit_reservation_state" "ai_reservation_state" NOT NULL DEFAULT 'reserved',
  ADD COLUMN "billing_state" "ai_request_billing_state" NOT NULL DEFAULT 'prepared',
  ADD COLUMN "provider_request_key" VARCHAR(160),
  ADD COLUMN "generation_id" VARCHAR(160),
  ADD COLUMN "upstream_id" VARCHAR(160),
  ADD COLUMN "provider_request_id" VARCHAR(160),
  ADD COLUMN "final_payload_hash" VARCHAR(128),
  ADD COLUMN "send_started_at" TIMESTAMPTZ,
  ADD COLUMN "dispatch_deadline_at" TIMESTAMPTZ,
  ADD COLUMN "reported_provider_cost_usd_micros" BIGINT,
  ADD COLUMN "recomputed_provider_cost_usd_micros" BIGINT,
  ADD COLUMN "charged_provider_cost_usd_micros" BIGINT,
  ADD COLUMN "raw_reported_cost_decimal" VARCHAR(128),
  ADD COLUMN "canonical_reported_cost_decimal" VARCHAR(128),
  ADD COLUMN "overrun_usd_micros" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "price_snapshot" JSONB,
  ADD COLUMN "certifier_id" VARCHAR(160),
  ADD COLUMN "certifier_version" VARCHAR(80),
  ADD COLUMN "final_measured_bytes" INTEGER,
  ADD COLUMN "final_measured_token_upper_bound" INTEGER;

ALTER TABLE "ai_request_attempts"
  ADD COLUMN "provider_request_key" VARCHAR(160),
  ADD COLUMN "generation_id" VARCHAR(160),
  ADD COLUMN "upstream_id" VARCHAR(160),
  ADD COLUMN "provider_request_id" VARCHAR(160),
  ADD COLUMN "provider_name" VARCHAR(80),
  ADD COLUMN "credit_cost" INTEGER,
  ADD COLUMN "usage_is_estimated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cached_tokens" INTEGER,
  ADD COLUMN "cache_write_tokens" INTEGER,
  ADD COLUMN "reasoning_tokens" INTEGER,
  ADD COLUMN "server_tool_cost" BIGINT,
  ADD COLUMN "reported_provider_cost_usd_micros" BIGINT,
  ADD COLUMN "recomputed_provider_cost_usd_micros" BIGINT,
  ADD COLUMN "charged_provider_cost_usd_micros" BIGINT,
  ADD COLUMN "raw_reported_cost_decimal" VARCHAR(128),
  ADD COLUMN "canonical_reported_cost_decimal" VARCHAR(128),
  ADD COLUMN "overrun_usd_micros" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "price_snapshot" JSONB,
  ADD COLUMN "final_payload_hash" VARCHAR(128),
  ADD COLUMN "send_started_at" TIMESTAMPTZ,
  ADD COLUMN "dispatch_deadline_at" TIMESTAMPTZ,
  ADD COLUMN "certifier_id" VARCHAR(160),
  ADD COLUMN "certifier_version" VARCHAR(80),
  ADD COLUMN "final_measured_bytes" INTEGER,
  ADD COLUMN "final_measured_token_upper_bound" INTEGER,
  ADD COLUMN "reconciliation_lease_until" TIMESTAMPTZ,
  ADD COLUMN "reconciliation_claimed_by" VARCHAR(160),
  ADD COLUMN "last_evidence_poll_at" TIMESTAMPTZ,
  ADD COLUMN "next_evidence_poll_at" TIMESTAMPTZ;

CREATE TABLE "ai_usage_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "ledger_version" "ai_usage_ledger_version" NOT NULL,
  "period_kind" "ai_usage_window_period_kind" NOT NULL,
  "window_key" VARCHAR(20) NOT NULL,
  "window_start" TIMESTAMPTZ NOT NULL,
  "window_end" TIMESTAMPTZ NOT NULL,
  "quota_timezone" VARCHAR(64) NOT NULL,
  "policy_bundle_version" VARCHAR(120),
  "quota_policy_version" VARCHAR(80),
  "state" "ai_usage_window_state" NOT NULL DEFAULT 'open',
  "closed_at" TIMESTAMPTZ,
  "credit_limit" INTEGER NOT NULL DEFAULT 0,
  "consumed_credits" INTEGER NOT NULL DEFAULT 0,
  "reserved_credits" INTEGER NOT NULL DEFAULT 0,
  "cost_limit_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "reserved_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "settled_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "unknown_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "overrun_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "monetary_debt_state" "ai_monetary_debt_state" NOT NULL DEFAULT 'clear',
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_usage_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_usage_windows_bounds_check" CHECK ("window_start" < "window_end"),
  CONSTRAINT "ai_usage_windows_credit_nonnegative_check" CHECK ("credit_limit" >= 0 AND "consumed_credits" >= 0 AND "reserved_credits" >= 0),
  CONSTRAINT "ai_usage_windows_amounts_nonnegative_check" CHECK ("cost_limit_usd_micros" >= 0 AND "reserved_usd_micros" >= 0 AND "settled_usd_micros" >= 0 AND "unknown_usd_micros" >= 0 AND "overrun_usd_micros" >= 0),
  CONSTRAINT "ai_usage_windows_day_week_usd_zero_check" CHECK ("period_kind" = 'month' OR ("cost_limit_usd_micros" = 0 AND "reserved_usd_micros" = 0 AND "settled_usd_micros" = 0 AND "unknown_usd_micros" = 0 AND "overrun_usd_micros" = 0))
);

CREATE TABLE "ai_quota_calendars" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "ledger_version" "ai_usage_ledger_version" NOT NULL,
  "quota_timezone" VARCHAR(64) NOT NULL,
  "effective_from" TIMESTAMPTZ NOT NULL,
  "current_monthly_window_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_quota_calendars_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_request_usage_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "usage_window_id" UUID NOT NULL,
  "reserved_credits" INTEGER NOT NULL DEFAULT 0,
  "consumed_credits" INTEGER NOT NULL DEFAULT 0,
  "released_credits" INTEGER NOT NULL DEFAULT 0,
  "reserved_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "settled_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "unknown_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "released_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "overrun_usd_micros" BIGINT NOT NULL DEFAULT 0,
  "state" "ai_reservation_state" NOT NULL DEFAULT 'reserved',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ,

  CONSTRAINT "ai_request_usage_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_request_usage_reservations_amounts_nonnegative_check" CHECK ("reserved_credits" >= 0 AND "consumed_credits" >= 0 AND "released_credits" >= 0 AND "reserved_usd_micros" >= 0 AND "settled_usd_micros" >= 0 AND "unknown_usd_micros" >= 0 AND "released_usd_micros" >= 0 AND "overrun_usd_micros" >= 0),
  CONSTRAINT "ai_request_usage_reservations_credit_conservation_check" CHECK ("state" = 'reserved' OR "reserved_credits" = "consumed_credits" + "released_credits"),
  CONSTRAINT "ai_request_usage_reservations_usd_conservation_check" CHECK ("state" = 'reserved' OR "reserved_usd_micros" + "overrun_usd_micros" = "settled_usd_micros" + "unknown_usd_micros" + "released_usd_micros")
);

CREATE TABLE "ai_billing_correction_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "attempt_id" UUID,
  "generation_id" VARCHAR(160),
  "old_attempt_state" VARCHAR(40),
  "new_attempt_state" VARCHAR(40),
  "old_lineage_state" VARCHAR(40),
  "new_lineage_state" VARCHAR(40),
  "old_settled_us_micros" BIGINT NOT NULL DEFAULT 0,
  "new_settled_us_micros" BIGINT NOT NULL DEFAULT 0,
  "old_unknown_us_micros" BIGINT NOT NULL DEFAULT 0,
  "new_unknown_us_micros" BIGINT NOT NULL DEFAULT 0,
  "old_released_us_micros" BIGINT NOT NULL DEFAULT 0,
  "new_released_us_micros" BIGINT NOT NULL DEFAULT 0,
  "old_overrun_us_micros" BIGINT NOT NULL DEFAULT 0,
  "new_overrun_us_micros" BIGINT NOT NULL DEFAULT 0,
  "evidence_hash" VARCHAR(128) NOT NULL,
  "reason" VARCHAR(160) NOT NULL,
  "actor" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_billing_correction_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_billing_correction_events_amounts_nonnegative_check" CHECK ("old_settled_us_micros" >= 0 AND "new_settled_us_micros" >= 0 AND "old_unknown_us_micros" >= 0 AND "new_unknown_us_micros" >= 0 AND "old_released_us_micros" >= 0 AND "new_released_us_micros" >= 0 AND "old_overrun_us_micros" >= 0 AND "new_overrun_us_micros" >= 0)
);

-- Calendar identity/timezone and window identity/bounds are bootstrap
-- snapshots. Only counters, lifecycle state, and the calendar's current
-- monthly pointer may change after creation.
CREATE FUNCTION "vera_quota_calendar_immutable_fields"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.ledger_version IS DISTINCT FROM OLD.ledger_version
    OR NEW.quota_timezone IS DISTINCT FROM OLD.quota_timezone
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'quota calendar bootstrap fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ai_quota_calendars_immutable_fields_trigger"
BEFORE UPDATE ON "ai_quota_calendars"
FOR EACH ROW EXECUTE FUNCTION "vera_quota_calendar_immutable_fields"();

CREATE FUNCTION "vera_usage_window_immutable_fields"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.ledger_version IS DISTINCT FROM OLD.ledger_version
    OR NEW.period_kind IS DISTINCT FROM OLD.period_kind
    OR NEW.window_key IS DISTINCT FROM OLD.window_key
    OR NEW.window_start IS DISTINCT FROM OLD.window_start
    OR NEW.window_end IS DISTINCT FROM OLD.window_end
    OR NEW.quota_timezone IS DISTINCT FROM OLD.quota_timezone
    OR NEW.credit_limit IS DISTINCT FROM OLD.credit_limit
    OR NEW.cost_limit_usd_micros IS DISTINCT FROM OLD.cost_limit_usd_micros THEN
    RAISE EXCEPTION 'usage window identity fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ai_usage_windows_immutable_fields_trigger"
BEFORE UPDATE ON "ai_usage_windows"
FOR EACH ROW EXECUTE FUNCTION "vera_usage_window_immutable_fields"();

CREATE FUNCTION "vera_billing_correction_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'billing correction events are append-only';
END;
$$;
CREATE TRIGGER "ai_billing_correction_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "ai_billing_correction_events"
FOR EACH ROW EXECUTE FUNCTION "vera_billing_correction_append_only"();

CREATE UNIQUE INDEX "ai_usage_windows_student_ledger_period_key" ON "ai_usage_windows"("student_id", "ledger_version", "period_kind", "window_key");
CREATE INDEX "ai_usage_windows_student_period_key_idx" ON "ai_usage_windows"("student_id", "period_kind", "window_key");
CREATE INDEX "ai_usage_windows_student_ledger_period_state_idx" ON "ai_usage_windows"("student_id", "ledger_version", "period_kind", "state");
CREATE UNIQUE INDEX "ai_quota_calendars_student_ledger_key" ON "ai_quota_calendars"("student_id", "ledger_version");
CREATE UNIQUE INDEX "ai_quota_calendars_current_monthly_window_key" ON "ai_quota_calendars"("current_monthly_window_id");
CREATE INDEX "ai_quota_calendars_student_ledger_idx" ON "ai_quota_calendars"("student_id", "ledger_version");
CREATE UNIQUE INDEX "ai_request_usage_reservations_request_window_key" ON "ai_request_usage_reservations"("request_id", "usage_window_id");
CREATE INDEX "ai_request_usage_reservations_window_state_idx" ON "ai_request_usage_reservations"("usage_window_id", "state");
CREATE INDEX "ai_request_usage_reservations_request_window_idx" ON "ai_request_usage_reservations"("request_id", "usage_window_id");
CREATE INDEX "ai_billing_correction_events_generation_created_idx" ON "ai_billing_correction_events"("generation_id", "created_at");
CREATE INDEX "ai_billing_correction_events_request_created_idx" ON "ai_billing_correction_events"("request_id", "created_at");
CREATE UNIQUE INDEX "ai_requests_conversation_sequence_key" ON "ai_requests"("conversation_id", "conversation_sequence");
CREATE UNIQUE INDEX "ai_requests_generation_id_key" ON "ai_requests"("generation_id");
CREATE UNIQUE INDEX "ai_request_attempts_generation_id_key" ON "ai_request_attempts"("generation_id");
CREATE INDEX "ai_requests_billing_state_deadline_idx" ON "ai_requests"("billing_state", "settlement_deadline_at");
CREATE INDEX "ai_request_attempts_state_started_idx" ON "ai_request_attempts"("state", "started_at");
CREATE INDEX "ai_request_attempts_state_dispatch_deadline_idx" ON "ai_request_attempts"("state", "dispatch_deadline_at");
CREATE INDEX "ai_request_attempts_evidence_lease_idx" ON "ai_request_attempts"("next_evidence_poll_at", "reconciliation_lease_until");

ALTER TABLE "ai_usage_windows"
  ADD CONSTRAINT "ai_usage_windows_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_quota_calendars"
  ADD CONSTRAINT "ai_quota_calendars_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_quota_calendars_current_monthly_window_id_fkey" FOREIGN KEY ("current_monthly_window_id") REFERENCES "ai_usage_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_usage_reservations"
  ADD CONSTRAINT "ai_request_usage_reservations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ai_request_usage_reservations_usage_window_id_fkey" FOREIGN KEY ("usage_window_id") REFERENCES "ai_usage_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_billing_correction_events"
  ADD CONSTRAINT "ai_billing_correction_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_billing_amounts_nonnegative_check" CHECK (
    "credit_cost" >= 0
    AND "overrun_usd_micros" >= 0
    AND ("reported_provider_cost_usd_micros" IS NULL OR "reported_provider_cost_usd_micros" >= 0)
    AND ("recomputed_provider_cost_usd_micros" IS NULL OR "recomputed_provider_cost_usd_micros" >= 0)
    AND ("charged_provider_cost_usd_micros" IS NULL OR "charged_provider_cost_usd_micros" >= 0)
  );
ALTER TABLE "ai_request_attempts"
  ADD CONSTRAINT "ai_request_attempts_billing_amounts_nonnegative_check" CHECK (
    ("credit_cost" IS NULL OR "credit_cost" >= 0)
    AND "overrun_usd_micros" >= 0
    AND ("reported_provider_cost_usd_micros" IS NULL OR "reported_provider_cost_usd_micros" >= 0)
    AND ("recomputed_provider_cost_usd_micros" IS NULL OR "recomputed_provider_cost_usd_micros" >= 0)
    AND ("charged_provider_cost_usd_micros" IS NULL OR "charged_provider_cost_usd_micros" >= 0)
    AND ("server_tool_cost" IS NULL OR "server_tool_cost" >= 0)
  );
