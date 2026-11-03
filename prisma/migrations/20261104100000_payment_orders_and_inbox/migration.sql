-- CreateEnum
CREATE TYPE "package_purchase_provenance" AS ENUM ('incomplete', 'order');

-- CreateEnum
CREATE TYPE "payment_order_status" AS ENUM ('pending', 'paid', 'failed', 'expired', 'review');

-- CreateEnum
CREATE TYPE "payment_event_type" AS ENUM ('succeeded', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "payment_event_source" AS ENUM ('webhook', 'reconciliation');

-- CreateEnum
CREATE TYPE "payment_event_outcome" AS ENUM ('accepted', 'declined', 'expired', 'review', 'quarantined', 'ignored');

-- CreateEnum
CREATE TYPE "payment_outbox_kind" AS ENUM ('receipt_email', 'critical_alert');

-- CreateEnum
CREATE TYPE "payment_outbox_status" AS ENUM ('pending', 'done', 'dead');

-- AlterTable
ALTER TABLE "package_purchases" ADD COLUMN     "provenance" "package_purchase_provenance" NOT NULL DEFAULT 'incomplete';

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "intent_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "reference" VARCHAR(64) NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "pricing_month" VARCHAR(7) NOT NULL,
    "quote_version" INTEGER NOT NULL DEFAULT 1,
    "package_code" VARCHAR(80) NOT NULL,
    "package_name" VARCHAR(220) NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "referral_code" VARCHAR(40),
    "affiliator_profile_id" UUID,
    "buyer_ip" INET,
    "buyer_ip_source" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "provider_environment" VARCHAR(40) NOT NULL,
    "provider_account" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "status" "payment_order_status" NOT NULL DEFAULT 'pending',
    "status_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_reason" VARCHAR(120),
    "paid_at" TIMESTAMPTZ,
    "provider_reference" VARCHAR(160),
    "session_url" TEXT,
    "session_attempts" INTEGER NOT NULL DEFAULT 0,
    "session_requested_at" TIMESTAMPTZ,
    "package_purchase_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(40) NOT NULL,
    "provider_environment" VARCHAR(40) NOT NULL,
    "provider_account" VARCHAR(80) NOT NULL,
    "event_id" VARCHAR(160) NOT NULL,
    "type" "payment_event_type" NOT NULL,
    "source" "payment_event_source" NOT NULL,
    "provider_payment_id" VARCHAR(160),
    "merchant_reference" VARCHAR(120) NOT NULL,
    "order_id" UUID,
    "amount_rupiah" INTEGER,
    "currency" VARCHAR(3),
    "buyer_id" VARCHAR(80),
    "package_code" VARCHAR(80),
    "outcome" "payment_event_outcome" NOT NULL,
    "reason" VARCHAR(160),
    "body_sha256" VARCHAR(64),
    "caller_ip" INET,
    "provider_occurred_at" TIMESTAMPTZ NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "payment_outbox_kind" NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "order_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "payment_outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 8,
    "next_run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leased_until" TIMESTAMPTZ,
    "lease_owner" VARCHAR(64),
    "last_error" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "payment_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stand_in_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(120) NOT NULL,
    "provider_payment_id" VARCHAR(64) NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "state" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,

    CONSTRAINT "stand_in_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_intent_id_key" ON "payment_orders"("intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_reference_key" ON "payment_orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_package_purchase_id_key" ON "payment_orders"("package_purchase_id");

-- CreateIndex
CREATE INDEX "payment_orders_status_expires_at_idx" ON "payment_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "payment_orders_buyer_id_created_at_idx" ON "payment_orders"("buyer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_provider_provider_environment_provider_accou_key" ON "payment_orders"("provider", "provider_environment", "provider_account", "provider_reference");

-- CreateIndex
CREATE INDEX "payment_events_order_id_received_at_idx" ON "payment_events"("order_id", "received_at");

-- CreateIndex
CREATE INDEX "payment_events_outcome_received_at_idx" ON "payment_events"("outcome", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_provider_environment_provider_accou_key" ON "payment_events"("provider", "provider_environment", "provider_account", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_outbox_dedupe_key_key" ON "payment_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "payment_outbox_status_next_run_at_idx" ON "payment_outbox"("status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "stand_in_payments_reference_key" ON "stand_in_payments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "stand_in_payments_provider_payment_id_key" ON "stand_in_payments"("provider_payment_id");

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "checkout_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_affiliator_profile_id_fkey" FOREIGN KEY ("affiliator_profile_id") REFERENCES "affiliator_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_package_purchase_id_fkey" FOREIGN KEY ("package_purchase_id") REFERENCES "package_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing purchases stay as they are and are marked as incomplete provenance by
-- the column default above: they carry no amount, currency, buyer IP or provider
-- evidence, and none is back-filled. Only a purchase written from a paid order
-- is marked 'order'.

-- ---------------------------------------------------------------------------
-- Orders: one frozen quote per checkout intent, and a state that only moves
-- through the transitions below.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_amount_check" CHECK ("amount_rupiah" > 0);
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_currency_check" CHECK ("currency" = 'IDR');
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_window_check" CHECK ("expires_at" > "created_at");
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_session_attempts_check" CHECK ("session_attempts" >= 0);
-- A paid order always carries the purchase summary and the time it was paid, so
-- the two can never be written apart.
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_paid_complete_check"
  CHECK ("status" <> 'paid' OR ("package_purchase_id" IS NOT NULL AND "paid_at" IS NOT NULL));
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_paid_at_check"
  CHECK ("paid_at" IS NULL OR "status" = 'paid');

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
    (OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'expired'))
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

CREATE TRIGGER payment_orders_guard
  BEFORE UPDATE OR DELETE ON "payment_orders"
  FOR EACH ROW EXECUTE FUNCTION guard_payment_order_change();

CREATE OR REPLACE FUNCTION prevent_payment_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER payment_orders_truncate_immutable
  BEFORE TRUNCATE ON "payment_orders"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Payment events: written once with the decision already taken.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_reason_check"
  CHECK ("outcome" NOT IN ('quarantined', 'review') OR "reason" IS NOT NULL);

CREATE TRIGGER payment_events_immutable
  BEFORE UPDATE OR DELETE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER payment_events_truncate_immutable
  BEFORE TRUNCATE ON "payment_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Outbox: a job table, so rows are updated as they are leased and finished, but
-- a job is evidence that a notification was owed and is never deleted.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_outbox" ADD CONSTRAINT "payment_outbox_attempts_check"
  CHECK ("attempts" >= 0 AND "max_attempts" > 0);

CREATE TRIGGER payment_outbox_no_delete
  BEFORE DELETE ON "payment_outbox"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER payment_outbox_truncate_immutable
  BEFORE TRUNCATE ON "payment_outbox"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

ALTER TABLE "stand_in_payments" ADD CONSTRAINT "stand_in_payments_state_check"
  CHECK ("state" IN ('pending', 'succeeded', 'failed', 'expired'));

