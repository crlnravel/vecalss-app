-- Replace separate draft/publication and visibility controls with archival.
-- Preserve videos that were not student-facing by moving them to the archive.

ALTER TABLE "kapten_videos"
  ADD COLUMN "archived_at" TIMESTAMPTZ;

UPDATE "kapten_videos"
SET "archived_at" = COALESCE("updated_at", CURRENT_TIMESTAMP)
WHERE "status" <> 'published' OR "is_visible_to_students" = false;

DROP INDEX "kapten_videos_status_is_visible_to_students_published_at_idx";

ALTER TABLE "kapten_videos"
  DROP COLUMN "status",
  DROP COLUMN "is_visible_to_students",
  DROP COLUMN "published_at";

DROP TYPE "kapten_video_status";

CREATE INDEX "kapten_videos_created_by_user_id_archived_at_updated_at_idx"
  ON "kapten_videos"("created_by_user_id", "archived_at", "updated_at");
