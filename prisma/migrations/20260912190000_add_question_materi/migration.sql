-- Subject-specific Materi categorization for Bank Soal questions.
-- The field is nullable so existing questions remain valid until a Kapten
-- chooses a categorization in the editor.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

LOCK TABLE "questions" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "question_revisions" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('questions') IS NULL OR to_regclass('question_revisions') IS NULL THEN
    RAISE EXCEPTION 'Question Materi migration requires the question tables';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name IN ('questions', 'question_revisions')
       AND column_name = 'materi'
  ) THEN
    RAISE EXCEPTION 'Question Materi migration has already started; inspect the database before retrying';
  END IF;
END
$$;

ALTER TABLE "questions"
  ADD COLUMN "materi" VARCHAR(200);

ALTER TABLE "question_revisions"
  ADD COLUMN "materi" VARCHAR(200);

COMMIT;
