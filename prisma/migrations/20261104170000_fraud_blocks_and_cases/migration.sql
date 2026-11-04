
-- CreateEnum
CREATE TYPE "fraud_block_type" AS ENUM ('account', 'email', 'phone', 'device', 'ip');

-- CreateEnum
CREATE TYPE "fraud_block_source" AS ENUM ('automatic', 'manual');

-- CreateEnum
CREATE TYPE "fraud_block_status" AS ENUM ('active', 'lifted', 'expired');

-- CreateEnum
CREATE TYPE "fraud_case_state" AS ENUM ('open', 'acknowledged', 'escalated', 'closed');

-- CreateEnum
CREATE TYPE "fraud_severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "fraud_appeal_state" AS ENUM ('pending', 'granted', 'denied');

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "device_lookup_token" VARCHAR(64);

-- CreateTable
CREATE TABLE "fraud_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_type" "fraud_block_type" NOT NULL,
    "lookup_token" VARCHAR(64) NOT NULL,
    "hint" VARCHAR(80) NOT NULL,
    "subject_user_id" UUID,
    "source" "fraud_block_source" NOT NULL,
    "reason_code" VARCHAR(40) NOT NULL,
    "reason_note" TEXT NOT NULL,
    "owner_user_id" UUID,
    "created_by_user_id" UUID,
    "deactivated_account" BOOLEAN NOT NULL DEFAULT false,
    "status" "fraud_block_status" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "review_due_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "last_event_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_block_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_id" UUID NOT NULL,
    "block_version" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "actor_user_id" UUID,
    "actor_kind" VARCHAR(10) NOT NULL,
    "reason" TEXT NOT NULL,
    "from_expires_at" TIMESTAMPTZ,
    "to_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_block_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "signal" VARCHAR(60) NOT NULL,
    "subject_type" VARCHAR(20) NOT NULL,
    "subject_key" VARCHAR(100) NOT NULL,
    "severity" "fraud_severity" NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "policy_version" INTEGER,
    "state" "fraud_case_state" NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 1,
    "owner_user_id" UUID,
    "user_id" UUID,
    "order_id" UUID,
    "payment_event_id" UUID,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "hit_count" INTEGER NOT NULL DEFAULT 1,
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ,
    "escalated_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "closure_reason" VARCHAR(40),
    "last_event_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_case_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "case_version" INTEGER NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "actor_user_id" UUID,
    "actor_kind" VARCHAR(10) NOT NULL,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_case_blocks" (
    "case_id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "linked_by_user_id" UUID,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fraud_case_blocks_pkey" PRIMARY KEY ("case_id","block_id")
);

-- CreateTable
CREATE TABLE "fraud_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "block_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "state" "fraud_appeal_state" NOT NULL DEFAULT 'pending',
    "channel" VARCHAR(30) NOT NULL,
    "summary" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ NOT NULL,
    "decided_at" TIMESTAMPTZ,
    "decision_reason" TEXT,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "fraud_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fraud_blocks_block_type_lookup_token_status_idx" ON "fraud_blocks"("block_type", "lookup_token", "status");

-- CreateIndex
CREATE INDEX "fraud_blocks_status_expires_at_idx" ON "fraud_blocks"("status", "expires_at");

-- CreateIndex
CREATE INDEX "fraud_blocks_subject_user_id_idx" ON "fraud_blocks"("subject_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_block_events_block_id_block_version_key" ON "fraud_block_events"("block_id", "block_version");

-- CreateIndex
CREATE INDEX "fraud_cases_state_severity_opened_at_idx" ON "fraud_cases"("state", "severity", "opened_at");

-- CreateIndex
CREATE INDEX "fraud_cases_signal_opened_at_idx" ON "fraud_cases"("signal", "opened_at");

-- CreateIndex
CREATE INDEX "fraud_case_events_case_id_created_at_idx" ON "fraud_case_events"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fraud_appeals_block_id_key" ON "fraud_appeals"("block_id");

-- CreateIndex
CREATE INDEX "fraud_appeals_state_due_at_idx" ON "fraud_appeals"("state", "due_at");

-- CreateIndex
CREATE INDEX "payment_orders_device_lookup_token_created_at_idx" ON "payment_orders"("device_lookup_token", "created_at");

-- AddForeignKey
ALTER TABLE "fraud_blocks" ADD CONSTRAINT "fraud_blocks_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_blocks" ADD CONSTRAINT "fraud_blocks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_blocks" ADD CONSTRAINT "fraud_blocks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_block_events" ADD CONSTRAINT "fraud_block_events_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "fraud_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_block_events" ADD CONSTRAINT "fraud_block_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_case_events" ADD CONSTRAINT "fraud_case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "fraud_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_case_events" ADD CONSTRAINT "fraud_case_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_case_blocks" ADD CONSTRAINT "fraud_case_blocks_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "fraud_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_case_blocks" ADD CONSTRAINT "fraud_case_blocks_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "fraud_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_case_blocks" ADD CONSTRAINT "fraud_case_blocks_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_appeals" ADD CONSTRAINT "fraud_appeals_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "fraud_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_appeals" ADD CONSTRAINT "fraud_appeals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "fraud_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- One block per identifier while it is active, one case per signal and subject
-- while it is not closed.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "fraud_blocks_active_identifier_key"
  ON "fraud_blocks"("block_type", "lookup_token") WHERE "status" = 'active';
CREATE UNIQUE INDEX "fraud_cases_open_subject_key"
  ON "fraud_cases"("signal", "subject_key") WHERE "state" <> 'closed';

-- ---------------------------------------------------------------------------
-- Checks that hold whatever code writes the rows.
-- A lookup token is a UUID (account) or a 64-character HMAC: never a readable
-- email, phone number or address.
-- ---------------------------------------------------------------------------
ALTER TABLE "fraud_blocks" ADD CONSTRAINT "fraud_blocks_token_check" CHECK (
  "lookup_token" ~ '^[0-9a-f-]+$' AND char_length("lookup_token") IN (36, 64)
);
ALTER TABLE "fraud_blocks" ADD CONSTRAINT "fraud_blocks_account_subject_check" CHECK (
  "block_type" <> 'account' OR "subject_user_id" IS NOT NULL
);
ALTER TABLE "fraud_blocks" ADD CONSTRAINT "fraud_blocks_reason_check" CHECK (char_length(btrim("reason_note")) >= 10);
ALTER TABLE "fraud_block_events" ADD CONSTRAINT "fraud_block_events_reason_check" CHECK (char_length(btrim("reason")) >= 10);
ALTER TABLE "fraud_block_events" ADD CONSTRAINT "fraud_block_events_kind_check"
  CHECK ("kind" IN ('created', 'renewed', 'lifted', 'expired') AND "actor_kind" IN ('owner', 'system'));
ALTER TABLE "fraud_case_events" ADD CONSTRAINT "fraud_case_events_actor_check" CHECK ("actor_kind" IN ('admin', 'owner', 'system'));
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_evidence_check" CHECK (jsonb_typeof("evidence") = 'object');
ALTER TABLE "fraud_cases" ADD CONSTRAINT "fraud_cases_counters_check" CHECK ("hit_count" >= 1);

-- ---------------------------------------------------------------------------
-- How long a block may last, by type (decision "Fraud operations rules"):
--   automatic          24 hours at creation, pending review
--   account/email/phone  until lifted, reviewed within 30 days
--   device             at most 30 days
--   ip                 at most 7 days
-- Measured against the database clock, on creation and on every renewal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_fraud_block_lifetime(
  kind fraud_block_type, origin fraud_block_source, expires timestamptz, review timestamptz, creating boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  moment timestamptz := clock_timestamp();
BEGIN
  IF creating AND origin = 'automatic' THEN
    IF expires IS NULL OR expires > moment + interval '24 hours' THEN
      RAISE EXCEPTION 'an automatic block lasts at most 24 hours' USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  IF kind = 'ip' THEN
    IF expires IS NULL OR expires > moment + interval '7 days' THEN
      RAISE EXCEPTION 'an IP block lasts at most 7 days' USING ERRCODE = '23514';
    END IF;
  ELSIF kind = 'device' THEN
    IF expires IS NULL OR expires > moment + interval '30 days' THEN
      RAISE EXCEPTION 'a device block lasts at most 30 days' USING ERRCODE = '23514';
    END IF;
  ELSIF expires IS NULL THEN
    -- Until lifted: it must say when it is next reviewed.
    IF review IS NULL OR review > moment + interval '30 days' THEN
      RAISE EXCEPTION 'a block with no end date is reviewed within 30 days' USING ERRCODE = '23514';
    END IF;
  ELSIF creating OR expires > moment + interval '30 days' OR review IS NOT NULL THEN
    RAISE EXCEPTION 'an account, email or phone block lasts until lifted or at most 30 days' USING ERRCODE = '23514';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Blocks: the identifier, type, source and reason are frozen. A block only
-- ends (active -> lifted | expired) or is renewed (new end or review date),
-- and every such change carries the next version number and points at the
-- history row that records it, so no change can happen without one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_fraud_block_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moving text[] := ARRAY['status', 'version', 'expires_at', 'review_due_at', 'ended_at', 'last_event_id', 'updated_at'];
  expected_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fraud blocks are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.status <> 'active' OR NEW.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new fraud block starts active at version 1' USING ERRCODE = '23514';
    END IF;
    IF NEW.source = 'manual' AND NEW.block_type IN ('account', 'email', 'phone') AND NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'a manual account, email or phone block lasts until lifted' USING ERRCODE = '23514';
    END IF;
    PERFORM assert_fraud_block_lifetime(NEW.block_type, NEW.source, NEW.expires_at, NEW.review_due_at, true);
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a fraud block identifier, type, source and reason cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION 'a % fraud block cannot change any more', OLD.status USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a fraud block change must carry the next version' USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> 'active' THEN
    IF NEW.ended_at IS NULL OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.review_due_at IS DISTINCT FROM OLD.review_due_at THEN
      RAISE EXCEPTION 'ending a fraud block records when, and nothing else' USING ERRCODE = '55000';
    END IF;
    expected_kind := NEW.status::text;
  ELSE
    IF NEW.ended_at IS NOT NULL
      OR (NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at AND NEW.review_due_at IS NOT DISTINCT FROM OLD.review_due_at) THEN
      RAISE EXCEPTION 'a renewal changes the end or review date' USING ERRCODE = '55000';
    END IF;
    PERFORM assert_fraud_block_lifetime(NEW.block_type, NEW.source, NEW.expires_at, NEW.review_due_at, false);
    expected_kind := 'renewed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fraud_block_events e
    WHERE e.id = NEW.last_event_id AND e.block_id = OLD.id AND e.block_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a fraud block change needs its history row first' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fraud_blocks_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "fraud_blocks"
  FOR EACH ROW EXECUTE FUNCTION guard_fraud_block_change();
CREATE TRIGGER fraud_blocks_truncate_immutable
  BEFORE TRUNCATE ON "fraud_blocks"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER fraud_block_events_immutable
  BEFORE UPDATE OR DELETE ON "fraud_block_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();
CREATE TRIGGER fraud_block_events_truncate_immutable
  BEFORE TRUNCATE ON "fraud_block_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Cases: what the case is about is frozen. While it stays in one state only
-- hits are added (counter, last seen, evidence, a higher severity). A change of
-- state follows the allowed lines, carries the next version and points at its
-- history row:
--   open -> acknowledged | escalated | closed
--   acknowledged -> escalated | closed
--   escalated -> closed
--   closed -> open (new evidence)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_fraud_case_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'severity', 'owner_user_id', 'hit_count', 'last_seen_at', 'evidence',
    'acknowledged_at', 'escalated_at', 'closed_at', 'closure_reason', 'last_event_id', 'updated_at'
  ];
  expected_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fraud cases are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state <> 'open' THEN
      RAISE EXCEPTION 'a new fraud case starts open at version 1' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    RAISE EXCEPTION 'what a fraud case is about cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.severity < OLD.severity THEN
    RAISE EXCEPTION 'a fraud case severity only goes up' USING ERRCODE = '55000';
  END IF;
  IF NEW.hit_count < OLD.hit_count THEN
    RAISE EXCEPTION 'a fraud case hit count only goes up' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = OLD.state THEN
    IF NEW.version <> OLD.version
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
      OR NEW.escalated_at IS DISTINCT FROM OLD.escalated_at
      OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.closure_reason IS DISTINCT FROM OLD.closure_reason
      OR NEW.last_event_id IS DISTINCT FROM OLD.last_event_id
    THEN
      RAISE EXCEPTION 'a fraud case only changes its state through a recorded step' USING ERRCODE = '55000';
    END IF;
    IF OLD.state = 'closed' AND to_jsonb(OLD) - 'updated_at' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' THEN
      RAISE EXCEPTION 'a closed fraud case does not take new hits' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'open' AND NEW.state IN ('acknowledged', 'escalated', 'closed'))
    OR (OLD.state = 'acknowledged' AND NEW.state IN ('escalated', 'closed'))
    OR (OLD.state = 'escalated' AND NEW.state = 'closed')
    OR (OLD.state = 'closed' AND NEW.state = 'open')
  ) THEN
    RAISE EXCEPTION 'a fraud case cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a fraud case step must carry the next version' USING ERRCODE = '55000';
  END IF;
  IF NEW.state = 'closed' AND (NEW.closed_at IS NULL OR NEW.closure_reason IS NULL) THEN
    RAISE EXCEPTION 'closing a fraud case records when and why' USING ERRCODE = '55000';
  END IF;

  expected_kind := CASE NEW.state
    WHEN 'acknowledged' THEN 'acknowledged'
    WHEN 'escalated' THEN 'escalated'
    WHEN 'closed' THEN 'closed'
    ELSE 'reopened'
  END;
  IF NOT EXISTS (
    SELECT 1 FROM fraud_case_events e
    WHERE e.id = NEW.last_event_id AND e.case_id = OLD.id AND e.case_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a fraud case step needs its history row first' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fraud_cases_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "fraud_cases"
  FOR EACH ROW EXECUTE FUNCTION guard_fraud_case_change();
CREATE TRIGGER fraud_cases_truncate_immutable
  BEFORE TRUNCATE ON "fraud_cases"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER fraud_case_events_immutable
  BEFORE UPDATE OR DELETE ON "fraud_case_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();
CREATE TRIGGER fraud_case_events_truncate_immutable
  BEFORE TRUNCATE ON "fraud_case_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER fraud_case_blocks_immutable
  BEFORE UPDATE OR DELETE ON "fraud_case_blocks"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();
CREATE TRIGGER fraud_case_blocks_truncate_immutable
  BEFORE TRUNCATE ON "fraud_case_blocks"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Appeals: one per block. Only the decision moves:
--   pending -> granted | denied (with a written reason)
--   denied -> pending (new evidence, counted, with a new decision deadline)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_fraud_appeal_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moving text[] := ARRAY['state', 'decided_at', 'decision_reason', 'reopen_count', 'version', 'due_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fraud appeals are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' OR NEW.version <> 1 OR NEW.reopen_count <> 0 THEN
      RAISE EXCEPTION 'a new fraud appeal starts pending' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a fraud appeal as received cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a fraud appeal change must carry the next version' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'pending' AND NEW.state IN ('granted', 'denied') THEN
    IF NEW.decided_at IS NULL OR char_length(btrim(coalesce(NEW.decision_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'an appeal decision records when and why' USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.state = 'denied' AND NEW.state = 'pending' THEN
    IF NEW.reopen_count <> OLD.reopen_count + 1 OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'reopening an appeal is counted and clears the decision' USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'a fraud appeal cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER fraud_appeals_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "fraud_appeals"
  FOR EACH ROW EXECUTE FUNCTION guard_fraud_appeal_change();
CREATE TRIGGER fraud_appeals_truncate_immutable
  BEFORE TRUNCATE ON "fraud_appeals"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- A paid event for a buyer who has been blocked since checkout starts is held
-- for review, not accepted. That needs a pending order, and its reservation, to
-- be able to go to review directly. Everything else in the two guards is
-- unchanged from the migrations that created them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_payment_order_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moving text[] := ARRAY[
    'status', 'status_changed_at', 'status_reason', 'paid_at', 'provider_reference',
    'session_url', 'session_attempts', 'session_requested_at', 'package_purchase_id', 'updated_at'
  ];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'payment orders are never deleted' USING ERRCODE = '55000';
  END IF;

  -- The quote, buyer, package, amount, provider identity and buyer-IP evidence
  -- are frozen at creation.
  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a payment order snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'expired', 'review'))
    OR (OLD.status IN ('failed', 'expired') AND NEW.status = 'review')
  ) THEN
    RAISE EXCEPTION 'payment order cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '55000';
  END IF;

  -- Set once, never replaced or cleared.
  IF OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR OLD.session_url IS NOT NULL AND NEW.session_url IS DISTINCT FROM OLD.session_url
    OR OLD.package_purchase_id IS NOT NULL AND NEW.package_purchase_id IS DISTINCT FROM OLD.package_purchase_id
    OR OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at
  THEN
    RAISE EXCEPTION 'a payment order link cannot be replaced' USING ERRCODE = '55000';
  END IF;

  IF NEW.session_attempts < OLD.session_attempts THEN
    RAISE EXCEPTION 'session attempts only increase' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_risk_reservation_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moving text[] := ARRAY['state', 'state_reason', 'state_changed_at'];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'risk reservations are never deleted' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a risk reservation snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state = 'pending' AND NEW.state IN ('paid', 'released', 'review'))
    OR (OLD.state = 'released' AND NEW.state = 'review')
  ) THEN
    RAISE EXCEPTION 'risk reservation cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
