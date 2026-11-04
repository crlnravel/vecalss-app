-- MS-08 phase A: delivery of a paid order (receipt, delivery attempts, use) and
-- the owner's dispute export. Forward-only. Receipts, delivery attempts, usage
-- events and the export log are append-only or guarded-transition tables.

-- CreateEnum
CREATE TYPE "fulfillment_delivery_status" AS ENUM ('pending', 'delivered');

-- AlterEnum
ALTER TYPE "payment_outbox_kind" ADD VALUE 'access_grant';

-- AlterTable
ALTER TABLE "checkout_intents" ADD COLUMN     "terms_version" VARCHAR(40);

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "terms_version" VARCHAR(40);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "receipt_number" VARCHAR(24) NOT NULL,
    "package_code" VARCHAR(80) NOT NULL,
    "package_name" VARCHAR(220) NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "pricing_month" VARCHAR(7) NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "terms_version" VARCHAR(40) NOT NULL,
    "provider_payment_id" VARCHAR(160),
    "paid_at" TIMESTAMPTZ NOT NULL,
    "delivery_status" "fulfillment_delivery_status" NOT NULL DEFAULT 'pending',
    "pending_reason" VARCHAR(60),
    "access_plan_code" VARCHAR(80),
    "grant_event_id" UUID,
    "valid_from" TIMESTAMPTZ,
    "valid_until" TIMESTAMPTZ,
    "granted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_id" UUID NOT NULL,
    "channel" VARCHAR(10) NOT NULL,
    "outcome" VARCHAR(10) NOT NULL,
    "detail" VARCHAR(120),
    "provider_message_id" VARCHAR(160),
    "notification_id" UUID,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grant_event_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "jakarta_day" DATE NOT NULL,
    "first_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_exports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "digest_sha256" VARCHAR(64) NOT NULL,
    "packet_bytes" INTEGER NOT NULL,
    "packet" TEXT,
    "downloaded_at" TIMESTAMPTZ,
    "packet_purged_at" TIMESTAMPTZ,

    CONSTRAINT "dispute_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_order_id_key" ON "payment_receipts"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_receipt_number_key" ON "payment_receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_grant_event_id_key" ON "payment_receipts"("grant_event_id");

-- CreateIndex
CREATE INDEX "payment_receipts_delivery_status_paid_at_idx" ON "payment_receipts"("delivery_status", "paid_at");

-- CreateIndex
CREATE INDEX "receipt_deliveries_receipt_id_attempted_at_idx" ON "receipt_deliveries"("receipt_id", "attempted_at");

-- CreateIndex
CREATE INDEX "fulfillment_usage_events_order_id_jakarta_day_idx" ON "fulfillment_usage_events"("order_id", "jakarta_day");

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_usage_events_grant_event_id_jakarta_day_key" ON "fulfillment_usage_events"("grant_event_id", "jakarta_day");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_exports_token_hash_key" ON "dispute_exports"("token_hash");

-- CreateIndex
CREATE INDEX "dispute_exports_order_id_created_at_idx" ON "dispute_exports"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_grant_event_id_fkey" FOREIGN KEY ("grant_event_id") REFERENCES "billing_access_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_usage_events" ADD CONSTRAINT "fulfillment_usage_events_grant_event_id_fkey" FOREIGN KEY ("grant_event_id") REFERENCES "billing_access_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_usage_events" ADD CONSTRAINT "fulfillment_usage_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_usage_events" ADD CONSTRAINT "fulfillment_usage_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_exports" ADD CONSTRAINT "dispute_exports_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_exports" ADD CONSTRAINT "dispute_exports_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Terms: a new order must carry the version its intent recorded. Orders made
-- before this migration keep a null version and are never touched again (the
-- order guard freezes every snapshot column, and this one is not a moving one).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION require_payment_order_terms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  agreed text;
BEGIN
  SELECT terms_version INTO agreed FROM checkout_intents WHERE id = NEW.intent_id;
  IF NEW.terms_version IS NULL OR agreed IS NULL OR NEW.terms_version <> agreed THEN
    RAISE EXCEPTION 'a payment order needs the purchase terms its buyer agreed to' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_orders_require_terms
  BEFORE INSERT ON "payment_orders"
  FOR EACH ROW EXECUTE FUNCTION require_payment_order_terms();

-- An intent's agreement is recorded when it is made and never changed.
CREATE OR REPLACE FUNCTION freeze_checkout_intent_terms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.terms_version IS DISTINCT FROM OLD.terms_version THEN
    RAISE EXCEPTION 'the terms version of a checkout intent cannot change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checkout_intents_freeze_terms
  BEFORE UPDATE ON "checkout_intents"
  FOR EACH ROW EXECUTE FUNCTION freeze_checkout_intent_terms();

-- ---------------------------------------------------------------------------
-- Receipts: written pending, delivered once, never deleted.
-- ---------------------------------------------------------------------------
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_amount_check" CHECK ("amount_rupiah" > 0);
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_currency_check" CHECK ("currency" = 'IDR');
-- Delivered means an entitlement was granted, with its window and time. Pending
-- means none of that exists yet.
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_delivery_check"
  CHECK (
    ("delivery_status" = 'delivered'
      AND "grant_event_id" IS NOT NULL AND "granted_at" IS NOT NULL
      AND "valid_from" IS NOT NULL AND "valid_until" IS NOT NULL AND "access_plan_code" IS NOT NULL
      AND "valid_until" > "valid_from" AND "pending_reason" IS NULL)
    OR
    ("delivery_status" = 'pending'
      AND "grant_event_id" IS NULL AND "granted_at" IS NULL
      AND "valid_from" IS NULL AND "valid_until" IS NULL AND "access_plan_code" IS NULL)
  );

CREATE OR REPLACE FUNCTION guard_payment_receipt_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moving text[] := ARRAY[
    'delivery_status', 'pending_reason', 'access_plan_code', 'grant_event_id',
    'valid_from', 'valid_until', 'granted_at'
  ];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'payment receipts are never deleted' USING ERRCODE = '55000';
  END IF;

  -- What was bought, for how much and under which terms is frozen.
  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a payment receipt snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;

  -- Delivery happens once and is never undone or rewritten.
  IF OLD.delivery_status = 'delivered' AND (to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
    RAISE EXCEPTION 'a delivered receipt cannot be changed' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_receipts_guard
  BEFORE UPDATE OR DELETE ON "payment_receipts"
  FOR EACH ROW EXECUTE FUNCTION guard_payment_receipt_change();

CREATE TRIGGER payment_receipts_truncate_immutable
  BEFORE TRUNCATE ON "payment_receipts"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Delivery attempts and usage events: append-only.
-- ---------------------------------------------------------------------------
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_channel_check"
  CHECK ("channel" IN ('email', 'in_app'));
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_outcome_check"
  CHECK ("outcome" IN ('sent', 'failed', 'skipped'));
-- At most one successful delivery per receipt and channel, however many retries.
CREATE UNIQUE INDEX "receipt_deliveries_one_sent_key"
  ON "receipt_deliveries"("receipt_id", "channel") WHERE "outcome" = 'sent';

CREATE TRIGGER receipt_deliveries_immutable
  BEFORE UPDATE OR DELETE ON "receipt_deliveries"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER receipt_deliveries_truncate_immutable
  BEFORE TRUNCATE ON "receipt_deliveries"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER fulfillment_usage_events_immutable
  BEFORE UPDATE OR DELETE ON "fulfillment_usage_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER fulfillment_usage_events_truncate_immutable
  BEFORE TRUNCATE ON "fulfillment_usage_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Dispute exports: the log is permanent; only the one-use download state moves.
-- ---------------------------------------------------------------------------
ALTER TABLE "dispute_exports" ADD CONSTRAINT "dispute_exports_reason_check"
  CHECK (char_length(btrim("reason")) >= 10);
ALTER TABLE "dispute_exports" ADD CONSTRAINT "dispute_exports_window_check"
  CHECK ("expires_at" > "created_at");

CREATE OR REPLACE FUNCTION guard_dispute_export_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moving text[] := ARRAY['packet', 'downloaded_at', 'packet_purged_at'];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'dispute exports are never deleted' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a dispute export record cannot be changed' USING ERRCODE = '55000';
  END IF;

  -- The packet can only be dropped, never replaced; a download is recorded once.
  IF NEW.packet IS NOT NULL AND NEW.packet IS DISTINCT FROM OLD.packet THEN
    RAISE EXCEPTION 'a dispute export packet cannot be replaced' USING ERRCODE = '55000';
  END IF;
  IF OLD.downloaded_at IS NOT NULL AND NEW.downloaded_at IS DISTINCT FROM OLD.downloaded_at THEN
    RAISE EXCEPTION 'a dispute export download is recorded once' USING ERRCODE = '55000';
  END IF;
  IF OLD.packet_purged_at IS NOT NULL AND NEW.packet_purged_at IS DISTINCT FROM OLD.packet_purged_at THEN
    RAISE EXCEPTION 'a dispute export purge is recorded once' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dispute_exports_guard
  BEFORE UPDATE OR DELETE ON "dispute_exports"
  FOR EACH ROW EXECUTE FUNCTION guard_dispute_export_change();

CREATE TRIGGER dispute_exports_truncate_immutable
  BEFORE TRUNCATE ON "dispute_exports"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();
