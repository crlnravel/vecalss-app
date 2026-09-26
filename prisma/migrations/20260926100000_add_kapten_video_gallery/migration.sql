-- Create persisted YouTube video entries for Kapten and student galleries.

CREATE TYPE "kapten_video_status" AS ENUM ('draft', 'published');

CREATE TYPE "kapten_video_subtest" AS ENUM ('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM');

CREATE TABLE "kapten_videos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_by_user_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "youtube_url" TEXT NOT NULL,
    "subtest" "kapten_video_subtest" NOT NULL,
    "status" "kapten_video_status" NOT NULL DEFAULT 'draft',
    "is_visible_to_students" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kapten_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kapten_videos_created_by_user_id_updated_at_idx"
  ON "kapten_videos"("created_by_user_id", "updated_at");

CREATE INDEX "kapten_videos_status_is_visible_to_students_published_at_idx"
  ON "kapten_videos"("status", "is_visible_to_students", "published_at");

ALTER TABLE "kapten_videos"
  ADD CONSTRAINT "kapten_videos_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
