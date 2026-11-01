-- Assessment releases stay append-only: UPDATE is always rejected, and DELETE is
-- rejected too unless the transaction declares it is purging exactly that
-- release's Tryout. Only the Kapten "delete archived Tryout with its history"
-- flow sets `vecalss.tryout_purge_id` (transaction-local, via set_config(..., true)),
-- so a stray DELETE or a purge of a different Tryout still fails.
CREATE OR REPLACE FUNCTION protect_assessment_release_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND OLD.tryout_id::text = NULLIF(current_setting('vecalss.tryout_purge_id', true), '') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING
    ERRCODE = 'integrity_constraint_violation',
    MESSAGE = 'assessment_release_append_only';
END;
$function$;
