-- Bank Soal has no independent publication gate. Every non-archived bank is
-- active/published; question revision readiness remains the source gate.
BEGIN;

LOCK TABLE question_banks IN ACCESS EXCLUSIVE MODE;

UPDATE question_banks
SET status = 'published'::content_status
WHERE status <> 'archived'::content_status;

ALTER TABLE question_banks
  ALTER COLUMN status SET DEFAULT 'published'::content_status;

CREATE OR REPLACE FUNCTION normalize_question_bank_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'archived'::content_status THEN
    NEW.status := 'published'::content_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS question_banks_auto_publish_non_archived ON question_banks;

CREATE TRIGGER question_banks_auto_publish_non_archived
BEFORE INSERT OR UPDATE OF status ON question_banks
FOR EACH ROW
EXECUTE FUNCTION normalize_question_bank_status();

COMMIT;
