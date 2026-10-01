-- Preserve existing private attachment objects while normalizing each report
-- to zero or more attachment records.
BEGIN;

CREATE TABLE "mentor_report_attachments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "report_id" UUID NOT NULL,
  "storage_key" TEXT NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(100) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "mentor_report_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mentor_report_attachments_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "mentor_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "mentor_report_attachments" (
  "report_id",
  "storage_key",
  "file_name",
  "content_type",
  "size_bytes",
  "created_at"
)
SELECT
  "id",
  "attachment_key",
  COALESCE("attachment_file_name", 'lampiran'),
  COALESCE("attachment_content_type", 'application/octet-stream'),
  COALESCE("attachment_size_bytes", 0),
  "created_at"
FROM "mentor_reports"
WHERE "attachment_key" IS NOT NULL;

CREATE INDEX "mentor_report_attachments_report_id_sort_order_idx"
  ON "mentor_report_attachments"("report_id", "sort_order");

ALTER TABLE "mentor_reports"
  DROP COLUMN "attachment_key",
  DROP COLUMN "attachment_file_name",
  DROP COLUMN "attachment_content_type",
  DROP COLUMN "attachment_size_bytes";

COMMIT;
