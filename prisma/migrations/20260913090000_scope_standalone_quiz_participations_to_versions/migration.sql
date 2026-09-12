-- A Kuis participation belongs to the immutable snapshot used by its
-- attempts. Keep old participations intact while allowing a new participation
-- when the next lazy snapshot is activated.

DROP INDEX IF EXISTS "standalone_quiz_participations_quiz_id_student_id_key";

-- PostgreSQL UNIQUE indexes treat NULLs as distinct. Keep the legacy
-- unversioned participation invariant for rows that predate snapshot links.
CREATE UNIQUE INDEX "standalone_quiz_participations_quiz_id_student_id_legacy_key"
  ON "standalone_quiz_participations"("quiz_id", "student_id")
  WHERE "quiz_version_id" IS NULL;

CREATE UNIQUE INDEX "standalone_quiz_participations_quiz_version_id_student_id_key"
  ON "standalone_quiz_participations"("quiz_version_id", "student_id");
