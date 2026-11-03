-- CreateEnum
CREATE TYPE "risk_tier" AS ENUM ('unverified', 'verified');

-- CreateEnum
CREATE TYPE "risk_reservation_state" AS ENUM ('pending', 'paid', 'review', 'released');

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "buyer_ip_exemption" VARCHAR(60);

-- CreateTable
CREATE TABLE "risk_policy_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL,
    "unverified_daily_purchases" INTEGER NOT NULL,
    "unverified_daily_rupiah" INTEGER NOT NULL,
    "verified_daily_purchases" INTEGER NOT NULL,
    "verified_daily_rupiah" INTEGER NOT NULL,
    "verified_min_account_age_days" INTEGER NOT NULL,
    "max_open_payments" INTEGER NOT NULL,
    "max_unpaid_per_account_hour" INTEGER NOT NULL,
    "max_starts_per_ip_hour" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_policy_activations" (
    "id" BIGSERIAL NOT NULL,
    "policy_version_id" UUID,
    "reason" VARCHAR(200) NOT NULL,
    "activated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_policy_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_account_tiers" (
    "user_id" UUID NOT NULL,
    "tier" "risk_tier" NOT NULL DEFAULT 'unverified',
    "basis" JSONB NOT NULL DEFAULT '{}',
    "evaluated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_account_tiers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "risk_day_buckets" (
    "user_id" UUID NOT NULL,
    "bucket_date" DATE NOT NULL,
    "purchase_count" INTEGER NOT NULL DEFAULT 0,
    "amount_rupiah" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_day_buckets_pkey" PRIMARY KEY ("user_id","bucket_date")
);

-- CreateTable
CREATE TABLE "risk_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bucket_date" DATE NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "tier" "risk_tier" NOT NULL,
    "tier_basis" JSONB NOT NULL DEFAULT '{}',
    "policy_version" INTEGER NOT NULL,
    "state" "risk_reservation_state" NOT NULL DEFAULT 'pending',
    "state_reason" VARCHAR(80),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_policy_versions_version_key" ON "risk_policy_versions"("version");

-- CreateIndex
CREATE UNIQUE INDEX "risk_reservations_order_id_key" ON "risk_reservations"("order_id");

-- CreateIndex
CREATE INDEX "risk_reservations_user_id_bucket_date_idx" ON "risk_reservations"("user_id", "bucket_date");

-- CreateIndex
CREATE INDEX "payment_orders_buyer_ip_created_at_idx" ON "payment_orders"("buyer_ip", "created_at");

-- AddForeignKey
ALTER TABLE "risk_policy_activations" ADD CONSTRAINT "risk_policy_activations_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "risk_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_account_tiers" ADD CONSTRAINT "risk_account_tiers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_day_buckets" ADD CONSTRAINT "risk_day_buckets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_reservations" ADD CONSTRAINT "risk_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_reservations" ADD CONSTRAINT "risk_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Day buckets use the Asia/Jakarta calendar day of a database timestamp. The
-- application never computes a day itself, and nothing depends on a cron: the
-- first check on a new local day simply finds an empty bucket.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION risk_jakarta_day(moment timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$ SELECT (moment AT TIME ZONE 'Asia/Jakarta')::date $$;

-- ---------------------------------------------------------------------------
-- Checks that hold whatever code writes the rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "risk_policy_versions" ADD CONSTRAINT "risk_policy_versions_values_check" CHECK (
  "version" > 0
  AND "unverified_daily_purchases" > 0 AND "unverified_daily_rupiah" > 0
  AND "verified_daily_purchases" > 0 AND "verified_daily_rupiah" > 0
  AND "verified_min_account_age_days" >= 0
  AND "max_open_payments" > 0 AND "max_unpaid_per_account_hour" > 0 AND "max_starts_per_ip_hour" > 0
);
ALTER TABLE "risk_day_buckets" ADD CONSTRAINT "risk_day_buckets_counters_check"
  CHECK ("purchase_count" >= 0 AND "amount_rupiah" >= 0);
ALTER TABLE "risk_reservations" ADD CONSTRAINT "risk_reservations_amount_check" CHECK ("amount_rupiah" > 0);

-- A new order must carry a buyer IP, or say why it has none. This is checked on
-- insert only (a CHECK would also reject updates to orders written before this
-- migration, which have neither and must still be able to settle).
CREATE OR REPLACE FUNCTION require_payment_order_buyer_ip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.buyer_ip IS NULL AND NEW.buyer_ip_exemption IS NULL THEN
    RAISE EXCEPTION 'a payment order needs a buyer IP or an exemption reason' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_orders_require_buyer_ip
  BEFORE INSERT ON "payment_orders"
  FOR EACH ROW EXECUTE FUNCTION require_payment_order_buyer_ip();

-- ---------------------------------------------------------------------------
-- The policy and its history are append-only: a change is a new version, and
-- choosing which version is in force is a new activation row.
-- ---------------------------------------------------------------------------
CREATE TRIGGER risk_policy_versions_immutable
  BEFORE UPDATE OR DELETE ON "risk_policy_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER risk_policy_versions_truncate_immutable
  BEFORE TRUNCATE ON "risk_policy_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER risk_policy_activations_immutable
  BEFORE UPDATE OR DELETE ON "risk_policy_activations"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER risk_policy_activations_truncate_immutable
  BEFORE TRUNCATE ON "risk_policy_activations"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Reservations: the order, buyer, day, amount and policy are frozen at
-- creation. Only the state moves, and only along these lines:
--   pending  -> paid | released   (the order was paid, or failed/expired for sure)
--   released -> review            (a payment arrived after a confirmed expiry)
-- Rows are never deleted.
-- ---------------------------------------------------------------------------
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
    (OLD.state = 'pending' AND NEW.state IN ('paid', 'released'))
    OR (OLD.state = 'released' AND NEW.state = 'review')
  ) THEN
    RAISE EXCEPTION 'risk reservation cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER risk_reservations_guard
  BEFORE UPDATE OR DELETE ON "risk_reservations"
  FOR EACH ROW EXECUTE FUNCTION guard_risk_reservation_change();

CREATE TRIGGER risk_reservations_truncate_immutable
  BEFORE TRUNCATE ON "risk_reservations"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- The day bucket is derived from the reservations by the database, in the same
-- statement that writes them, so a counter can never disagree with the rows.
-- Every state except `released` counts. Refunds do not appear here on purpose:
-- a refund never gives the day's allowance back.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_risk_reservation_counters()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  delta integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := CASE WHEN NEW.state <> 'released' THEN 1 ELSE 0 END;
  ELSE
    delta := (CASE WHEN NEW.state <> 'released' THEN 1 ELSE 0 END)
           - (CASE WHEN OLD.state <> 'released' THEN 1 ELSE 0 END);
  END IF;

  IF delta > 0 THEN
    INSERT INTO risk_day_buckets (user_id, bucket_date, purchase_count, amount_rupiah)
    VALUES (NEW.user_id, NEW.bucket_date, delta, delta * NEW.amount_rupiah)
    ON CONFLICT (user_id, bucket_date) DO UPDATE
      SET purchase_count = risk_day_buckets.purchase_count + EXCLUDED.purchase_count,
          amount_rupiah = risk_day_buckets.amount_rupiah + EXCLUDED.amount_rupiah,
          updated_at = now();
  ELSIF delta < 0 THEN
    UPDATE risk_day_buckets
    SET purchase_count = purchase_count + delta,
        amount_rupiah = amount_rupiah + delta * NEW.amount_rupiah,
        updated_at = now()
    WHERE user_id = NEW.user_id AND bucket_date = NEW.bucket_date;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER risk_reservations_counters
  AFTER INSERT OR UPDATE ON "risk_reservations"
  FOR EACH ROW EXECUTE FUNCTION apply_risk_reservation_counters();

-- ---------------------------------------------------------------------------
-- Policy version 1: the values closed in the G2 decision on 3 November 2026.
-- Per transaction the order must equal the server quote, and a guest has no
-- checkout at all; both are structural rules in the code, not numbers here.
-- ---------------------------------------------------------------------------
INSERT INTO "risk_policy_versions" (
  "version", "unverified_daily_purchases", "unverified_daily_rupiah",
  "verified_daily_purchases", "verified_daily_rupiah", "verified_min_account_age_days",
  "max_open_payments", "max_unpaid_per_account_hour", "max_starts_per_ip_hour", "note"
) VALUES (
  1, 1, 250000, 2, 500000, 7, 1, 5, 20,
  'Decision G2, closed 3 November 2026. New or unverified accounts: 1 purchase and Rp250.000 per Asia/Jakarta day. Verified (account at least 7 days old and a paid order with no refund or dispute): 2 purchases and Rp500.000. One open unpaid payment per account, 5 unpaid checkouts per account per hour, 20 checkout starts per IP per hour.'
);

INSERT INTO "risk_policy_activations" ("policy_version_id", "reason")
SELECT "id", 'Initial policy (G2)' FROM "risk_policy_versions" WHERE "version" = 1;
