-- MS-19 M-03: a won dispute resumes access only when that dispute caused the pause.
--
-- Opening a dispute used to mark access as dispute-paused even when the account
-- was already paused for another reason, so winning resumed that unrelated pause.
-- `access_paused` still means "access is held paused while this dispute is open"
-- (another open dispute keeps it so). `pause_caused` is new: true only when this
-- dispute's own pause changed the account (or took over from a dispute that did).
-- An existing open dispute defaults to false, i.e. it does not own the pause, so
-- winning it leaves access as it is and an admin resumes it by hand. The guard
-- function is re-created from the MS-10 version with the column added and
-- one-way while the dispute is open; every other check is kept. Forward-only.

-- AlterTable
ALTER TABLE "payment_disputes" ADD COLUMN     "pause_caused" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_payment_dispute_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'evidence_hold', 'access_paused', 'refund_in_flight', 'resolved_at',
    'resolved_by_user_id', 'resolution_source', 'resolution_note', 'access_effect', 'last_event_id', 'updated_at',
    'pause_caused'
  ];
  expected_kind text;
  capture integer;
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

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
      OR (OLD.pause_caused AND NOT NEW.pause_caused)
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
$guard$;

-- The runtime role may set the new flag on the guarded transitions, like its neighbours.
UPDATE "evidence_tables"
SET "update_columns" = array_append("update_columns", 'pause_caused')
WHERE "table_name" = 'payment_disputes' AND NOT ('pause_caused' = ANY("update_columns"));

SELECT public.retention_apply_runtime_grants();
