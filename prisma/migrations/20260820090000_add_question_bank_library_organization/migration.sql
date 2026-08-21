-- Bank Soal organization cutover.
--
-- Preflight for the canonical assessment baseline confirmed that tags and
-- question_bank_tags are discovery metadata only. Question -> Subtest and
-- all Quiz/Paket/Tryout snapshot relations remain the source of truth, so the
-- fixed subject-tag tables can be removed after the organization tables are
-- in place.

CREATE TABLE "question_bank_folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bank_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_bank_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bank_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_bank_category_assignments" (
    "question_bank_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "assigned_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_bank_category_assignments_pkey" PRIMARY KEY ("question_bank_id", "category_id")
);

ALTER TABLE "question_banks"
  ADD COLUMN "folder_id" UUID;

ALTER TABLE "question_bank_folders"
  ADD CONSTRAINT "question_bank_folders_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "question_bank_folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_bank_folders"
  ADD CONSTRAINT "question_bank_folders_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_bank_folders"
  ADD CONSTRAINT "question_bank_folders_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_bank_categories"
  ADD CONSTRAINT "question_bank_categories_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_bank_categories"
  ADD CONSTRAINT "question_bank_categories_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_banks"
  ADD CONSTRAINT "question_banks_folder_id_fkey"
  FOREIGN KEY ("folder_id") REFERENCES "question_bank_folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_bank_category_assignments"
  ADD CONSTRAINT "question_bank_category_assignments_question_bank_id_fkey"
  FOREIGN KEY ("question_bank_id") REFERENCES "question_banks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_bank_category_assignments"
  ADD CONSTRAINT "question_bank_category_assignments_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "question_bank_categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_bank_category_assignments"
  ADD CONSTRAINT "question_bank_category_assignments_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "question_bank_folders_parent_id_name_idx"
  ON "question_bank_folders"("parent_id", "name");

CREATE UNIQUE INDEX "question_bank_folders_root_name_ci_key"
  ON "question_bank_folders"(lower(btrim("name")))
  WHERE "parent_id" IS NULL;

CREATE UNIQUE INDEX "question_bank_folders_parent_name_ci_key"
  ON "question_bank_folders"("parent_id", lower(btrim("name")))
  WHERE "parent_id" IS NOT NULL;

CREATE INDEX "question_bank_categories_name_idx"
  ON "question_bank_categories"("name");

CREATE UNIQUE INDEX "question_bank_categories_name_ci_key"
  ON "question_bank_categories"(lower(btrim("name")));

CREATE INDEX "question_bank_category_assignments_category_id_question_bank_id_idx"
  ON "question_bank_category_assignments"("category_id", "question_bank_id");

CREATE INDEX "question_banks_folder_id_idx"
  ON "question_banks"("folder_id");

-- Existing banks intentionally keep folder_id NULL and therefore appear in
-- the virtual Unfiled root. No folder/category rows are guessed or seeded.

-- Destructive cutover guard. The canonical baseline only ever used the fixed
-- subject codes below. If a production database contains a custom tag row,
-- abort before dropping either legacy table so an operator can back it up and
-- decide how to map it instead of losing it silently.
DO $$
DECLARE
  unexpected_codes TEXT[];
BEGIN
  IF to_regclass('public.tags') IS NULL OR to_regclass('public.question_bank_tags') IS NULL THEN
    RAISE EXCEPTION 'Bank organization preflight failed: legacy tag tables are missing';
  END IF;

  SELECT ARRAY_AGG(code ORDER BY code)
    INTO unexpected_codes
    FROM "tags"
   WHERE code NOT IN ('PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM');

  IF unexpected_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Bank organization preflight failed: unexpected legacy tag codes: %', array_to_string(unexpected_codes, ', ');
  END IF;
END $$;

DROP TABLE "question_bank_tags";
DROP TABLE "tags";
