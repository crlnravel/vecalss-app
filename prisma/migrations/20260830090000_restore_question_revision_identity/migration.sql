-- Restore the manually managed QuestionRevision identity boundary that was
-- dropped by the later schema-generated migration. The simple current
-- revision FK remains the Prisma compatibility relation; this composite pair
-- additionally guarantees that a Question can only point at its own revision.

CREATE UNIQUE INDEX IF NOT EXISTS "question_revisions_question_id_id_key"
  ON "question_revisions"("question_id", "id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'questions_current_revision_identity_fkey'
  ) THEN
    ALTER TABLE "questions"
      ADD CONSTRAINT "questions_current_revision_identity_fkey"
        FOREIGN KEY ("id", "current_revision_id")
        REFERENCES "question_revisions"("question_id", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE
        DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;
