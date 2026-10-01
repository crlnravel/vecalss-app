-- Add the Developer role and persistent Mentor report records.
ALTER TYPE "role_name" ADD VALUE IF NOT EXISTS 'developer';

CREATE TYPE "mentor_report_feature" AS ENUM (
  'dashboard',
  'materi',
  'video',
  'kuis',
  'bank_soal_kuis',
  'tryout',
  'bank_soal_tryout',
  'media',
  'profile'
);

CREATE TABLE "mentor_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "author_id" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "feature" "mentor_report_feature" NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "description" TEXT NOT NULL,
  "attachment_key" TEXT,
  "attachment_file_name" VARCHAR(255),
  "attachment_content_type" VARCHAR(100),
  "attachment_size_bytes" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mentor_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mentor_reports_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "mentor_reports_author_id_created_at_idx"
  ON "mentor_reports"("author_id", "created_at");

CREATE INDEX "mentor_reports_created_at_idx"
  ON "mentor_reports"("created_at");
