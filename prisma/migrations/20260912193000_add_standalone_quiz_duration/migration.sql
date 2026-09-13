ALTER TABLE "standalone_quizzes"
  ADD COLUMN "duration_seconds" INTEGER;

ALTER TABLE "standalone_quiz_versions"
  ADD COLUMN "duration_seconds" INTEGER;

UPDATE "standalone_quiz_versions" AS version
SET "duration_seconds" = quiz."duration_seconds"
FROM "standalone_quizzes" AS quiz
WHERE quiz."id" = version."quiz_id";
