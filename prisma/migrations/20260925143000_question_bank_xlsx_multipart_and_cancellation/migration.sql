BEGIN;

ALTER TYPE "question_bank_xlsx_import_attempt_state"
  ADD VALUE IF NOT EXISTS 'multipart_creating';
ALTER TYPE "question_bank_xlsx_import_attempt_state"
  ADD VALUE IF NOT EXISTS 'multipart_uploading';
ALTER TYPE "question_bank_xlsx_import_attempt_state"
  ADD VALUE IF NOT EXISTS 'multipart_completing';
ALTER TYPE "question_bank_xlsx_import_attempt_state"
  ADD VALUE IF NOT EXISTS 'upload_complete';

ALTER TABLE "question_bank_xlsx_import_attempts"
  ADD COLUMN "multipart_upload_id" VARCHAR(1024),
  ADD COLUMN "expected_workbook_size_bytes" INTEGER,
  ADD COLUMN "expected_multipart_part_count" INTEGER,
  ADD COLUMN "cancel_requested_at" TIMESTAMPTZ,
  ADD COLUMN "operation_lease_expires_at" TIMESTAMPTZ;

ALTER TABLE "question_bank_xlsx_import_attempts"
  ADD CONSTRAINT "question_bank_xlsx_import_attempts_expected_size_check"
    CHECK (
      "expected_workbook_size_bytes" IS NULL
      OR "expected_workbook_size_bytes" BETWEEN 1 AND 25165824
    ),
  ADD CONSTRAINT "question_bank_xlsx_import_attempts_expected_part_count_check"
    CHECK (
      "expected_multipart_part_count" IS NULL
      OR "expected_multipart_part_count" BETWEEN 1 AND 3
    );

CREATE INDEX "question_bank_xlsx_import_attempts_operation_lease_expires_at_idx"
  ON "question_bank_xlsx_import_attempts"("operation_lease_expires_at");

COMMIT;
