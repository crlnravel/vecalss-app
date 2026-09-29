UPDATE "standalone_quizzes"
SET "status" = 'published'
WHERE "status" = 'draft';

ALTER TABLE "standalone_quizzes"
ALTER COLUMN "status" SET DEFAULT 'published';

ALTER TABLE "standalone_quizzes"
ADD CONSTRAINT "standalone_quizzes_status_published_or_archived"
CHECK ("status" IN ('published', 'archived'));
