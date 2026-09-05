BEGIN;

LOCK TABLE question_banks IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  existing_bank_count bigint;
BEGIN
  SELECT COUNT(*) INTO existing_bank_count FROM question_banks;
  IF existing_bank_count > 0 THEN
    RAISE EXCEPTION 'question_banks is not empty (% rows); purpose migration requires a fresh database', existing_bank_count;
  END IF;
END
$$;

CREATE TYPE question_bank_purpose AS ENUM ('quiz', 'tryout');

ALTER TABLE question_banks
  ADD COLUMN purpose question_bank_purpose NOT NULL;

CREATE INDEX question_banks_purpose_status_idx
  ON question_banks (purpose, status);

CREATE FUNCTION assessment_reject_question_bank_purpose_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.purpose IS DISTINCT FROM OLD.purpose THEN
    RAISE EXCEPTION 'question bank purpose is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER question_bank_purpose_immutable
BEFORE UPDATE OF purpose ON question_banks
FOR EACH ROW
EXECUTE FUNCTION assessment_reject_question_bank_purpose_update();

COMMIT;
