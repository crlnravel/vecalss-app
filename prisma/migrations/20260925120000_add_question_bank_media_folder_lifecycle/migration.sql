BEGIN;

ALTER TABLE "question_banks"
  ADD COLUMN "media_folder_id" UUID;

CREATE UNIQUE INDEX "question_banks_media_folder_id_key"
  ON "question_banks"("media_folder_id");

ALTER TABLE "question_banks"
  ADD CONSTRAINT "question_banks_media_folder_id_fkey"
  FOREIGN KEY ("media_folder_id") REFERENCES "media_folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "question_bank_media_folder_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" UUID NOT NULL,
  "media_folder_id" UUID NOT NULL,
  "provisional_name" VARCHAR(160) NOT NULL,
  "adopted_bank_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "question_bank_media_folder_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "question_bank_media_folder_reservations_media_folder_id_key"
  ON "question_bank_media_folder_reservations"("media_folder_id");
CREATE UNIQUE INDEX "question_bank_media_folder_reservations_adopted_bank_id_key"
  ON "question_bank_media_folder_reservations"("adopted_bank_id");
CREATE INDEX "question_bank_media_folder_reservations_owner_user_id_adopted_bank_id_idx"
  ON "question_bank_media_folder_reservations"("owner_user_id", "adopted_bank_id");

ALTER TABLE "question_bank_media_folder_reservations"
  ADD CONSTRAINT "question_bank_media_folder_reservations_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "question_bank_media_folder_reservations_media_folder_id_fkey"
  FOREIGN KEY ("media_folder_id") REFERENCES "media_folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "question_bank_media_folder_reservations_adopted_bank_id_fkey"
  FOREIGN KEY ("adopted_bank_id") REFERENCES "question_banks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
