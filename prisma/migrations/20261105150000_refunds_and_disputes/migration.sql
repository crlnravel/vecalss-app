-- MS-09 phase A: refund cases, disputes, and the stand-in provider's refunds.
-- Forward-only. Refund cases and disputes move only through guarded steps, each
-- with a history row written first; their histories are append-only. The
-- refundable balance is enforced here as well as in the application.

-- CreateEnum
CREATE TYPE "refund_reason_category" AS ENUM ('our_fault', 'change_of_mind');

-- CreateEnum
CREATE TYPE "refund_case_state" AS ENUM ('prepared', 'approved', 'processing', 'completed', 'rejected', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "refund_method" AS ENUM ('provider', 'manual_transfer');

-- CreateEnum
CREATE TYPE "payment_dispute_state" AS ENUM ('open', 'won', 'lost');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "payment_event_type" ADD VALUE 'refund_succeeded';
ALTER TYPE "payment_event_type" ADD VALUE 'refund_failed';
ALTER TYPE "payment_event_type" ADD VALUE 'dispute_opened';
ALTER TYPE "payment_event_type" ADD VALUE 'dispute_won';
ALTER TYPE "payment_event_type" ADD VALUE 'dispute_lost';

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "provider_dispute_id" VARCHAR(160),
ADD COLUMN     "provider_refund_id" VARCHAR(160),
ADD COLUMN     "refund_reference" VARCHAR(40);


-- CreateTable
CREATE TABLE "refund_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" VARCHAR(40) NOT NULL,
    "order_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "provider_payment_id" VARCHAR(160) NOT NULL,
    "reason_category" "refund_reason_category" NOT NULL,
    "reason_code" VARCHAR(40) NOT NULL,
    "request_note" VARCHAR(1000) NOT NULL,
    "request_channel" VARCHAR(30) NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "state" "refund_case_state" NOT NULL DEFAULT 'prepared',
    "version" INTEGER NOT NULL DEFAULT 1,
    "prepared_by_user_id" UUID NOT NULL,
    "prepared_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision_due_at" TIMESTAMPTZ NOT NULL,
    "eligibility_prepared" JSONB NOT NULL,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "approval_reason" VARCHAR(500),
    "self_approved" BOOLEAN,
    "eligibility_approved" JSONB,
    "payout_due_at" TIMESTAMPTZ,
    "revoke_access" BOOLEAN NOT NULL DEFAULT false,
    "closed_by_user_id" UUID,
    "closed_at" TIMESTAMPTZ,
    "closure_reason" VARCHAR(500),
    "method" "refund_method",
    "provider_refund_id" VARCHAR(160),
    "execution_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ,
    "outcome_unknown" BOOLEAN NOT NULL DEFAULT false,
    "destination_masked" VARCHAR(80),
    "destination_holder" VARCHAR(10),
    "transfer_reference" VARCHAR(120),
    "proof_note" VARCHAR(1000),
    "confirmed_by_user_id" UUID,
    "completed_at" TIMESTAMPTZ,
    "confirmation_source" VARCHAR(30),
    "confirmation_event_id" UUID,
    "access_effect" VARCHAR(40),
    "evidence_hold" BOOLEAN NOT NULL DEFAULT true,
    "last_event_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_case_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "case_version" INTEGER NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "actor_user_id" UUID,
    "actor_kind" VARCHAR(10) NOT NULL,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_case_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "provider_payment_id" VARCHAR(160) NOT NULL,
    "provider_dispute_id" VARCHAR(160) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "reason_text" VARCHAR(500) NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "notice_received_at" TIMESTAMPTZ NOT NULL,
    "response_due_at" TIMESTAMPTZ,
    "state" "payment_dispute_state" NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 1,
    "evidence_hold" BOOLEAN NOT NULL DEFAULT true,
    "recorded_by_user_id" UUID,
    "payment_event_id" UUID,
    "access_paused" BOOLEAN NOT NULL DEFAULT false,
    "refund_in_flight" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by_user_id" UUID,
    "resolution_source" VARCHAR(20),
    "resolution_note" VARCHAR(500),
    "access_effect" VARCHAR(40),
    "last_event_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_dispute_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dispute_id" UUID NOT NULL,
    "dispute_version" INTEGER NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "actor_user_id" UUID,
    "actor_kind" VARCHAR(10) NOT NULL,
    "note" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_dispute_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stand_in_refunds" (
    "reference" VARCHAR(40) NOT NULL,
    "provider_refund_id" VARCHAR(160) NOT NULL,
    "provider_payment_id" VARCHAR(160) NOT NULL,
    "amount_rupiah" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "state" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,

    CONSTRAINT "stand_in_refunds_pkey" PRIMARY KEY ("reference")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_cases_reference_key" ON "refund_cases"("reference");

-- CreateIndex
CREATE INDEX "refund_cases_order_id_state_idx" ON "refund_cases"("order_id", "state");

-- CreateIndex
CREATE INDEX "refund_cases_state_decision_due_at_idx" ON "refund_cases"("state", "decision_due_at");

-- CreateIndex
CREATE INDEX "refund_cases_state_payout_due_at_idx" ON "refund_cases"("state", "payout_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "refund_cases_provider_refund_id_key" ON "refund_cases"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refund_case_events_case_id_created_at_idx" ON "refund_case_events"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_disputes_order_id_state_idx" ON "payment_disputes"("order_id", "state");

-- CreateIndex
CREATE INDEX "payment_disputes_state_response_due_at_idx" ON "payment_disputes"("state", "response_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_order_id_provider_dispute_id_key" ON "payment_disputes"("order_id", "provider_dispute_id");

-- CreateIndex
CREATE INDEX "payment_dispute_events_dispute_id_created_at_idx" ON "payment_dispute_events"("dispute_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stand_in_refunds_provider_refund_id_key" ON "stand_in_refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "stand_in_refunds_provider_payment_id_idx" ON "stand_in_refunds"("provider_payment_id");

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_prepared_by_user_id_fkey" FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_confirmation_event_id_fkey" FOREIGN KEY ("confirmation_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_case_events" ADD CONSTRAINT "refund_case_events_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "refund_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_case_events" ADD CONSTRAINT "refund_case_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_events" ADD CONSTRAINT "payment_dispute_events_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "payment_disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_dispute_events" ADD CONSTRAINT "payment_dispute_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- One live dispute per captured payment. A second notice for the same payment
-- while the first is open would be a duplicate fact, not a second dispute.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "payment_disputes_one_open_per_payment_key"
  ON "payment_disputes"("order_id", "provider_payment_id") WHERE "state" = 'open';

-- ---------------------------------------------------------------------------
-- Shape checks.
-- ---------------------------------------------------------------------------
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_amount_check" CHECK ("amount_rupiah" > 0);
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_currency_check" CHECK ("currency" = 'IDR');
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_reason_check" CHECK (
  ("reason_category" = 'change_of_mind' AND "reason_code" = 'change_of_mind')
  OR ("reason_category" = 'our_fault'
      AND "reason_code" IN ('double_charge', 'wrong_amount', 'access_not_delivered', 'service_unavailable'))
);
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_attempts_check" CHECK ("execution_attempts" >= 0);
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_destination_holder_check"
  CHECK ("destination_holder" IS NULL OR "destination_holder" IN ('buyer', 'parent'));
-- Evidence stays held while a case is open and is released once it ends.
ALTER TABLE "refund_cases" ADD CONSTRAINT "refund_cases_evidence_hold_check"
  CHECK (("state" IN ('prepared', 'approved', 'processing')) = "evidence_hold");

ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_amount_check" CHECK ("amount_rupiah" > 0);
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_currency_check" CHECK ("currency" = 'IDR');
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_source_check"
  CHECK ("source" IN ('owner_notice', 'provider_event'));
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_evidence_hold_check"
  CHECK (("state" = 'open') = "evidence_hold");

ALTER TABLE "refund_case_events" ADD CONSTRAINT "refund_case_events_actor_kind_check"
  CHECK ("actor_kind" IN ('admin', 'owner', 'system', 'provider'));
ALTER TABLE "payment_dispute_events" ADD CONSTRAINT "payment_dispute_events_actor_kind_check"
  CHECK ("actor_kind" IN ('admin', 'owner', 'system', 'provider'));

ALTER TABLE "stand_in_refunds" ADD CONSTRAINT "stand_in_refunds_state_check"
  CHECK ("state" IN ('pending', 'succeeded', 'failed'));
ALTER TABLE "stand_in_refunds" ADD CONSTRAINT "stand_in_refunds_amount_check" CHECK ("amount_rupiah" > 0);

-- ---------------------------------------------------------------------------
-- The captured amount of one payment, and how much of it is spoken for.
--
-- A payment is captured when its order is paid or held in review. The order's
-- own payment is the order amount; an unexpected second capture is recorded as
-- an inbox event held for review, and carries the amount it arrived with.
-- Reserved refunds (approved, processing, completed) and lost disputes use up
-- the balance. An open dispute does not: it blocks refunds instead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refund_capture_amount(p_order uuid, p_payment text)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT o.amount_rupiah
      FROM payment_orders o
      WHERE o.id = p_order AND o.status::text IN ('paid', 'review') AND o.provider_reference = p_payment
    ),
    (
      SELECT e.amount_rupiah
      FROM payment_events e
      JOIN payment_orders o ON o.id = e.order_id
      WHERE e.order_id = p_order
        AND o.status::text IN ('paid', 'review')
        AND e.provider_payment_id = p_payment
        AND e.type::text = 'succeeded'
        AND e.outcome::text = 'review'
        AND e.reason = 'second_capture'
      ORDER BY e.received_at
      LIMIT 1
    ),
    0
  )::integer
$$;

CREATE OR REPLACE FUNCTION refund_balance_used(p_order uuid, p_payment text, p_except uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT (
    COALESCE((
      SELECT sum(c.amount_rupiah)
      FROM refund_cases c
      WHERE c.order_id = p_order AND c.provider_payment_id = p_payment
        AND c.state::text IN ('approved', 'processing', 'completed')
        AND (p_except IS NULL OR c.id <> p_except)
    ), 0)
    + COALESCE((
      SELECT sum(d.amount_rupiah)
      FROM payment_disputes d
      WHERE d.order_id = p_order AND d.provider_payment_id = p_payment AND d.state::text = 'lost'
    ), 0)
  )::integer
$$;

-- ---------------------------------------------------------------------------
-- Refund cases.
--
--   prepared   -> approved | rejected | cancelled
--   approved   -> processing | completed (manual transfer) | cancelled
--   processing -> completed | failed
--
-- completed, rejected, cancelled and failed never change. Every step carries
-- the next version and a history row written first. Approval reserves the
-- refundable balance under a lock on the order row, and is refused for a
-- change-of-mind case that failed the eligibility check, and while a dispute is
-- open on the payment. Execution (provider or manual) is refused while a
-- dispute is open; a refund already with the provider may still finish.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_refund_case_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'approved_by_user_id', 'approved_at', 'approval_reason', 'self_approved',
    'eligibility_approved', 'payout_due_at', 'revoke_access', 'closed_by_user_id', 'closed_at',
    'closure_reason', 'method', 'provider_refund_id', 'execution_attempts', 'last_attempt_at',
    'outcome_unknown', 'destination_masked', 'destination_holder', 'transfer_reference', 'proof_note',
    'confirmed_by_user_id', 'completed_at', 'confirmation_source', 'confirmation_event_id',
    'access_effect', 'evidence_hold', 'last_event_id', 'updated_at'
  ];
  expected_kind text;
  order_row payment_orders%ROWTYPE;
  capture integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund cases are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state <> 'prepared' THEN
      RAISE EXCEPTION 'a new refund case starts prepared at version 1' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_user_id IS NOT NULL OR NEW.method IS NOT NULL OR NEW.completed_at IS NOT NULL
      OR NEW.provider_refund_id IS NOT NULL OR NEW.execution_attempts <> 0 THEN
      RAISE EXCEPTION 'a new refund case carries no approval or execution' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO order_row FROM payment_orders WHERE id = NEW.order_id;
    capture := refund_capture_amount(NEW.order_id, NEW.provider_payment_id);
    IF order_row.id IS NULL OR order_row.buyer_id <> NEW.buyer_id OR order_row.currency <> NEW.currency THEN
      RAISE EXCEPTION 'a refund case must name the paid order, its buyer and currency' USING ERRCODE = '23514';
    END IF;
    IF capture <= 0 OR NEW.amount_rupiah > capture THEN
      RAISE EXCEPTION 'a refund cannot be more than the captured payment' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    RAISE EXCEPTION 'what a refund case is about cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF OLD.state IN ('completed', 'rejected', 'cancelled', 'failed') THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'a % refund case cannot be changed', OLD.state USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  -- Set once, never replaced or cleared.
  IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN
    RAISE EXCEPTION 'the provider refund id cannot be replaced' USING ERRCODE = '55000';
  END IF;
  IF NEW.execution_attempts < OLD.execution_attempts THEN
    RAISE EXCEPTION 'execution attempts only increase' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = OLD.state THEN
    -- Inside one state only the execution bookkeeping of a refund with the provider moves.
    IF NEW.version <> OLD.version
      OR NEW.last_event_id IS DISTINCT FROM OLD.last_event_id
      OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approval_reason IS DISTINCT FROM OLD.approval_reason
      OR NEW.self_approved IS DISTINCT FROM OLD.self_approved
      OR NEW.eligibility_approved IS DISTINCT FROM OLD.eligibility_approved
      OR NEW.payout_due_at IS DISTINCT FROM OLD.payout_due_at
      OR NEW.revoke_access IS DISTINCT FROM OLD.revoke_access
      OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.confirmation_source IS DISTINCT FROM OLD.confirmation_source
      OR NEW.evidence_hold IS DISTINCT FROM OLD.evidence_hold
      OR NEW.method IS DISTINCT FROM OLD.method
    THEN
      RAISE EXCEPTION 'a refund case only changes its state through a recorded step' USING ERRCODE = '55000';
    END IF;
    IF OLD.state <> 'processing' AND (
      NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id
      OR NEW.execution_attempts <> OLD.execution_attempts
      OR NEW.last_attempt_at IS DISTINCT FROM OLD.last_attempt_at
      OR NEW.outcome_unknown IS DISTINCT FROM OLD.outcome_unknown
    ) THEN
      RAISE EXCEPTION 'only a refund with the provider takes execution updates' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'prepared' AND NEW.state IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.state = 'approved' AND NEW.state IN ('processing', 'completed', 'cancelled'))
    OR (OLD.state = 'processing' AND NEW.state IN ('completed', 'failed'))
  ) THEN
    RAISE EXCEPTION 'a refund case cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a refund case step must carry the next version' USING ERRCODE = '55000';
  END IF;

  expected_kind := CASE NEW.state
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'processing' THEN 'execution_started'
    WHEN 'completed' THEN 'completed'
    ELSE 'failed'
  END;
  IF NOT EXISTS (
    SELECT 1 FROM refund_case_events e
    WHERE e.id = NEW.last_event_id AND e.case_id = OLD.id AND e.case_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a refund case step needs its history row first' USING ERRCODE = '55000';
  END IF;

  -- Lock the order first: approvals, executions and disputes for one order run one after the other.
  IF NEW.state IN ('approved', 'processing', 'completed') AND OLD.state IN ('prepared', 'approved') THEN
    PERFORM 1 FROM payment_orders WHERE id = OLD.order_id FOR UPDATE;
  END IF;

  IF NEW.state = 'approved' THEN
    IF NEW.approved_by_user_id IS NULL OR NEW.approved_at IS NULL OR NEW.payout_due_at IS NULL
      OR NEW.eligibility_approved IS NULL OR NEW.self_approved IS NULL
      OR NEW.approval_reason IS NULL OR length(btrim(NEW.approval_reason)) < 10 THEN
      RAISE EXCEPTION 'approving a refund records who, when, why, the eligibility check and the payout deadline' USING ERRCODE = '55000';
    END IF;
    IF NEW.self_approved IS DISTINCT FROM (NEW.approved_by_user_id = NEW.prepared_by_user_id) THEN
      RAISE EXCEPTION 'a refund approved by its own preparer is stored as self-approved' USING ERRCODE = '55000';
    END IF;
    IF NEW.reason_category = 'change_of_mind' AND (NEW.eligibility_approved ->> 'eligible') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'a change-of-mind refund that fails the eligibility check cannot be approved' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.state IN ('approved', 'processing') OR (NEW.state = 'completed' AND OLD.state = 'approved') THEN
    IF EXISTS (
      SELECT 1 FROM payment_disputes d
      WHERE d.order_id = OLD.order_id AND d.provider_payment_id = OLD.provider_payment_id AND d.state = 'open'
    ) THEN
      RAISE EXCEPTION 'a refund cannot be approved or executed while a dispute is open on the payment' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.state = 'approved' THEN
    capture := refund_capture_amount(OLD.order_id, OLD.provider_payment_id);
    IF refund_balance_used(OLD.order_id, OLD.provider_payment_id, OLD.id) + NEW.amount_rupiah > capture THEN
      RAISE EXCEPTION 'refunds cannot be more than the captured payment' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.state = 'processing' AND NEW.method IS DISTINCT FROM 'provider' THEN
    RAISE EXCEPTION 'only a provider refund is processed' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = 'completed' THEN
    IF NEW.completed_at IS NULL OR NEW.confirmation_source IS NULL OR NEW.evidence_hold THEN
      RAISE EXCEPTION 'completing a refund records when and by what confirmation' USING ERRCODE = '55000';
    END IF;
    IF OLD.state = 'approved' THEN
      IF NEW.method IS DISTINCT FROM 'manual_transfer' OR NEW.confirmation_source <> 'owner_manual'
        OR NEW.confirmed_by_user_id IS NULL OR NEW.destination_masked IS NULL OR NEW.destination_holder IS NULL
        OR NEW.transfer_reference IS NULL OR NEW.proof_note IS NULL THEN
        RAISE EXCEPTION 'a manual transfer is completed with its destination, reference, proof and the owner who confirmed it' USING ERRCODE = '55000';
      END IF;
    ELSE
      IF NEW.method IS DISTINCT FROM 'provider' OR NEW.confirmation_source NOT IN ('provider_event', 'provider_status')
        OR NEW.provider_refund_id IS NULL THEN
        RAISE EXCEPTION 'a provider refund completes only on a verified provider confirmation' USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;

  IF NEW.state IN ('rejected', 'cancelled', 'failed') THEN
    IF NEW.closed_at IS NULL OR NEW.closure_reason IS NULL OR length(btrim(NEW.closure_reason)) < 3 OR NEW.evidence_hold THEN
      RAISE EXCEPTION 'ending a refund case records when and why' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER refund_cases_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "refund_cases"
  FOR EACH ROW EXECUTE FUNCTION guard_refund_case_change();
CREATE TRIGGER refund_cases_truncate_immutable
  BEFORE TRUNCATE ON "refund_cases"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER refund_case_events_immutable
  BEFORE UPDATE OR DELETE ON "refund_case_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();
CREATE TRIGGER refund_case_events_truncate_immutable
  BEFORE TRUNCATE ON "refund_case_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- Disputes: open -> won | lost, once. Opening takes the order lock too, so a
-- dispute and an approval for one order are decided one after the other.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_payment_dispute_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'evidence_hold', 'access_paused', 'refund_in_flight', 'resolved_at',
    'resolved_by_user_id', 'resolution_source', 'resolution_note', 'access_effect', 'last_event_id', 'updated_at'
  ];
  expected_kind text;
  capture integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment disputes are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new dispute starts open at version 1' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM payment_orders WHERE id = NEW.order_id FOR UPDATE;
    capture := refund_capture_amount(NEW.order_id, NEW.provider_payment_id);
    IF capture <= 0 OR NEW.amount_rupiah > capture THEN
      RAISE EXCEPTION 'a dispute must name a captured payment and no more than it' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    RAISE EXCEPTION 'what a dispute is about cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF OLD.state <> 'open' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'a resolved dispute cannot be changed' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state = 'open' THEN
    IF NEW.version <> OLD.version OR NEW.last_event_id IS DISTINCT FROM OLD.last_event_id
      OR NEW.resolved_at IS NOT NULL OR NEW.evidence_hold IS DISTINCT FROM OLD.evidence_hold
      OR (OLD.access_paused AND NOT NEW.access_paused)
      OR (OLD.refund_in_flight AND NOT NEW.refund_in_flight) THEN
      RAISE EXCEPTION 'an open dispute only gains access and refund notes' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a dispute step must carry the next version' USING ERRCODE = '55000';
  END IF;
  IF NEW.resolved_at IS NULL OR NEW.resolution_source IS NULL OR NEW.resolution_note IS NULL
    OR length(btrim(NEW.resolution_note)) < 3 OR NEW.evidence_hold THEN
    RAISE EXCEPTION 'resolving a dispute records when, by whom and why' USING ERRCODE = '55000';
  END IF;
  IF NEW.resolution_source NOT IN ('owner', 'provider_event') THEN
    RAISE EXCEPTION 'a dispute is resolved by the owner or a provider event' USING ERRCODE = '55000';
  END IF;

  expected_kind := CASE NEW.state WHEN 'won' THEN 'resolved_won' ELSE 'resolved_lost' END;
  IF NOT EXISTS (
    SELECT 1 FROM payment_dispute_events e
    WHERE e.id = NEW.last_event_id AND e.dispute_id = OLD.id AND e.dispute_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a dispute step needs its history row first' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_disputes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "payment_disputes"
  FOR EACH ROW EXECUTE FUNCTION guard_payment_dispute_change();
CREATE TRIGGER payment_disputes_truncate_immutable
  BEFORE TRUNCATE ON "payment_disputes"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER payment_dispute_events_immutable
  BEFORE UPDATE OR DELETE ON "payment_dispute_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();
CREATE TRIGGER payment_dispute_events_truncate_immutable
  BEFORE TRUNCATE ON "payment_dispute_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- ---------------------------------------------------------------------------
-- A refunded or cancelled purchase never becomes anything else. The provisional
-- success callback used to write `succeeded` over any row that was not
-- succeeded yet; this makes a late or repeated success unable to revive it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_package_purchase_terminal_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'a % purchase cannot become % again', OLD.status, NEW.status USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER package_purchases_terminal_status
  BEFORE UPDATE OF "status" ON "package_purchases"
  FOR EACH ROW
  WHEN (OLD."status" IN ('refunded', 'cancelled') AND NEW."status" IS DISTINCT FROM OLD."status")
  EXECUTE FUNCTION guard_package_purchase_terminal_status();
