-- MS-20 R2B-03: a provider-sourced refund completion must reference a recorded
-- payment_events row for the same order, refund and original provider identity.
-- Re-creates the current final body from MS-19, retaining the MS-18 authority-
-- deadline check, MS-10 retention delete exception and MS-19 event requirement.
-- A manual-transfer completion stays owner-attested by design. Forward-only.

CREATE OR REPLACE FUNCTION public.guard_refund_case_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
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
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

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
    -- The owner approves against the system's own check, which the database
    -- repeats from the order and the usage evidence rather than trusting the
    -- stored copy alone.
    IF NEW.reason_category = 'change_of_mind' AND (
      (NEW.eligibility_approved ->> 'eligible') IS DISTINCT FROM 'true'
      OR NOT refund_change_of_mind_eligible(NEW.order_id, NEW.requested_at)
    ) THEN
      RAISE EXCEPTION 'a change-of-mind refund that fails the eligibility check cannot be approved' USING ERRCODE = '55000';
    END IF;
    -- MS-18: an authority order that set a deadline is paid back by then, never later.
    IF NEW.reason_category = 'authority_order' AND NEW.authority_deadline_at IS NOT NULL
      AND NEW.payout_due_at > NEW.authority_deadline_at THEN
      RAISE EXCEPTION 'a refund for an authority order is due by the authority''s deadline' USING ERRCODE = '55000';
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
      -- MS-19 H-01 (defense in depth): the confirmation names a recorded provider event
      -- for this order, of the refund-succeeded type, accepted, and its refund reference,
      -- provider refund id, payment, amount and currency are the case's own. A webhook
      -- confirmation points at a webhook row and a status lookup at a reconciliation row.
      -- The database cannot prove what the provider said (anyone who can insert an event
      -- row can write one), but a completion no longer stands on free-form fields alone.
      SELECT * INTO order_row FROM payment_orders WHERE id = NEW.order_id;
      IF NEW.confirmation_event_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM payment_events e
        WHERE e.id = NEW.confirmation_event_id
          AND e.order_id = NEW.order_id
          AND e.provider = order_row.provider
          AND e.provider_account = order_row.provider_account
          AND e.provider_environment = order_row.provider_environment
          AND e.type = 'refund_succeeded'
          AND e.outcome = 'accepted'
          AND e.refund_reference = NEW.reference
          AND e.provider_refund_id = NEW.provider_refund_id
          AND e.provider_payment_id = NEW.provider_payment_id
          AND e.amount_rupiah = NEW.amount_rupiah
          AND e.currency = NEW.currency
          AND e.source = (CASE NEW.confirmation_source WHEN 'provider_event' THEN 'webhook' ELSE 'reconciliation' END)::payment_event_source
      ) THEN
        RAISE EXCEPTION 'a provider refund completes only on a recorded provider event for this order, merchant context, refund and amount' USING ERRCODE = '55000';
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
$guard$;
