-- Keep Kuis availability windows inside the immutable definition boundary.
-- Legacy version 1 rows inherit the stable Kuis schedule exactly once.

ALTER TABLE "standalone_quiz_versions"
  ADD COLUMN "opens_at" TIMESTAMPTZ,
  ADD COLUMN "closes_at" TIMESTAMPTZ;

UPDATE "standalone_quiz_versions" version
SET
  "opens_at" = quiz."opens_at",
  "closes_at" = quiz."closes_at"
FROM "standalone_quizzes" quiz
WHERE quiz."id" = version."quiz_id";
