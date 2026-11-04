-- MS-09 phase A: the owner can resolve an order held in review by granting
-- access, which moves the order from review to paid (and its reservation with
-- it). Every other transition is unchanged. Forward-only.

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
    -- The owner's decision to accept a payment that was held for review.
    OR (OLD.status = 'review' AND NEW.status = 'paid')
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
    OR (OLD.state = 'review' AND NEW.state = 'paid')
  ) THEN
    RAISE EXCEPTION 'risk reservation cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
