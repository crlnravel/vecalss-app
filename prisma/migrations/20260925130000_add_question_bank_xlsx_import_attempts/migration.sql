BEGIN;

CREATE TYPE "question_bank_xlsx_import_attempt_state" AS ENUM (
  'upload_pending',
  'previewing',
  'previewed',
  'applying',
  'completed',
  'failed',
  'cleanup_pending',
  'discarded'
);

CREATE TYPE "question_bank_xlsx_import_asset_state" AS ENUM (
  'pending',
  'ready',
  'cleanup_pending',
  'cleaned'
);

CREATE TABLE "question_bank_xlsx_import_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "state" "question_bank_xlsx_import_attempt_state" NOT NULL DEFAULT 'upload_pending',
  "original_file_name" VARCHAR(255) NOT NULL,
  "upload_object_key" VARCHAR(512) NOT NULL,
  "staging_prefix" VARCHAR(512) NOT NULL,
  "manifest_object_key" VARCHAR(512),
  "staged_object_keys" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "preview_image_index" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "workbook_sha256" VARCHAR(64),
  "workbook_size_bytes" INTEGER,
  "manifest_sha256" VARCHAR(64),
  "question_count" INTEGER NOT NULL DEFAULT 0,
  "image_count" INTEGER NOT NULL DEFAULT 0,
  "target_bank_id" UUID,
  "target_mode" VARCHAR(16),
  "media_folder_reservation_id" UUID,
  "result" JSONB,
  "last_error_code" VARCHAR(80),
  "upload_expires_at" TIMESTAMPTZ NOT NULL,
  "preview_expires_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "question_bank_xlsx_import_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_bank_xlsx_import_attempts_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "question_bank_xlsx_import_attempts_upload_object_key_key"
  ON "question_bank_xlsx_import_attempts"("upload_object_key");
CREATE UNIQUE INDEX "question_bank_xlsx_import_attempts_manifest_object_key_key"
  ON "question_bank_xlsx_import_attempts"("manifest_object_key");
CREATE INDEX "question_bank_xlsx_import_attempts_owner_user_id_expires_at_idx"
  ON "question_bank_xlsx_import_attempts"("owner_user_id", "expires_at");
CREATE INDEX "question_bank_xlsx_import_attempts_state_expires_at_idx"
  ON "question_bank_xlsx_import_attempts"("state", "expires_at");
CREATE INDEX "question_bank_xlsx_import_attempts_target_bank_id_idx"
  ON "question_bank_xlsx_import_attempts"("target_bank_id");

CREATE TABLE "question_bank_xlsx_import_attempt_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attempt_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "content_sha256" VARCHAR(64) NOT NULL,
  "object_key" VARCHAR(512) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "state" "question_bank_xlsx_import_asset_state" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "question_bank_xlsx_import_attempt_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_bank_xlsx_import_attempt_assets_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "question_bank_xlsx_import_attempts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "question_bank_xlsx_import_attempt_assets_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "question_bank_xlsx_import_attempt_assets_asset_id_key"
  ON "question_bank_xlsx_import_attempt_assets"("asset_id");
CREATE UNIQUE INDEX "question_bank_xlsx_import_attempt_assets_object_key_key"
  ON "question_bank_xlsx_import_attempt_assets"("object_key");
CREATE UNIQUE INDEX "question_bank_xlsx_import_attempt_assets_attempt_id_content_sha256_key"
  ON "question_bank_xlsx_import_attempt_assets"("attempt_id", "content_sha256");
CREATE INDEX "question_bank_xlsx_import_attempt_assets_attempt_id_state_idx"
  ON "question_bank_xlsx_import_attempt_assets"("attempt_id", "state");

COMMIT;
