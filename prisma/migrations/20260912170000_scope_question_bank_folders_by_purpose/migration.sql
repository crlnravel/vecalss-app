-- Purpose-scoped Bank Soal folders.
--
-- Existing folder rows are retained as the Quiz tree and cloned into a
-- Tryout tree. Banks and Tryout package folder scopes are remapped while the
-- old single-purpose foreign keys are temporarily removed. Everything runs
-- in one transaction so a failed deploy cannot leave half of a tree behind.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Lock the owning tables before checking or changing any relationship. The
-- folder table is locked first because both dependent tables reference it.
LOCK TABLE "question_bank_folders" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "question_banks" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "reusable_question_package_version_folder_scopes" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regclass('question_bank_folders') IS NULL
     OR to_regclass('question_banks') IS NULL
     OR to_regclass('reusable_question_package_version_folder_scopes') IS NULL THEN
    RAISE EXCEPTION 'Question-bank folder purpose migration requires the existing organization tables';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'question_bank_folders'
       AND column_name = 'purpose'
  ) THEN
    RAISE EXCEPTION 'Question-bank folder purpose migration has already started; inspect the database before retrying';
  END IF;
END
$$;

ALTER TABLE "question_banks"
  DROP CONSTRAINT IF EXISTS "question_banks_folder_id_fkey";

ALTER TABLE "question_bank_folders"
  DROP CONSTRAINT IF EXISTS "question_bank_folders_parent_id_fkey";

ALTER TABLE "question_bank_folders"
  ADD COLUMN "purpose" "question_bank_purpose";

-- The legacy indexes are purpose-blind, so remove them before inserting the
-- same-named Tryout clones. Purpose-aware replacements are created below in
-- the same transaction.
DROP INDEX IF EXISTS "question_bank_folders_root_name_ci_key";
DROP INDEX IF EXISTS "question_bank_folders_parent_name_ci_key";

-- Every existing folder gets a stable Quiz identity. The second mapping row
-- receives a new id for the independent Tryout tree and keeps the old parent
-- relationship available for the clone insert below.
CREATE TEMP TABLE "_question_bank_folder_purpose_map" (
  "old_id" UUID NOT NULL,
  "purpose" "question_bank_purpose" NOT NULL,
  "new_id" UUID NOT NULL,
  PRIMARY KEY ("old_id", "purpose"),
  UNIQUE ("new_id")
) ON COMMIT DROP;

INSERT INTO "_question_bank_folder_purpose_map" ("old_id", "purpose", "new_id")
SELECT "id", 'quiz'::"question_bank_purpose", "id"
  FROM "question_bank_folders";

INSERT INTO "_question_bank_folder_purpose_map" ("old_id", "purpose", "new_id")
SELECT "id", 'tryout'::"question_bank_purpose", gen_random_uuid()
  FROM "question_bank_folders";

INSERT INTO "question_bank_folders" (
  "id",
  "parent_id",
  "purpose",
  "name",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
)
SELECT tryout_map."new_id",
       parent_map."new_id",
       'tryout'::"question_bank_purpose",
       source_folder."name",
       source_folder."created_by_user_id",
       source_folder."updated_by_user_id",
       source_folder."created_at",
       source_folder."updated_at"
  FROM "question_bank_folders" source_folder
  JOIN "_question_bank_folder_purpose_map" tryout_map
    ON tryout_map."old_id" = source_folder."id"
   AND tryout_map."purpose" = 'tryout'::"question_bank_purpose"
  LEFT JOIN "_question_bank_folder_purpose_map" parent_map
    ON parent_map."old_id" = source_folder."parent_id"
   AND parent_map."purpose" = 'tryout'::"question_bank_purpose";

UPDATE "question_bank_folders"
   SET "purpose" = 'quiz'::"question_bank_purpose"
 WHERE "purpose" IS NULL;

-- A package version must have one purpose. Abort rather than guessing if a
-- legacy row combines Quiz and Tryout bank scopes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "reusable_question_package_version_folder_scopes" scope
     WHERE (
       EXISTS (
         SELECT 1
           FROM "reusable_question_package_versions" version
           JOIN "question_banks" source_bank ON source_bank."id" = version."source_bank_id"
          WHERE version."id" = scope."package_version_id"
            AND source_bank."purpose" = 'quiz'::"question_bank_purpose"
       )
       OR EXISTS (
         SELECT 1
           FROM "reusable_question_package_version_bank_scopes" bank_scope
           JOIN "question_banks" scoped_bank ON scoped_bank."id" = bank_scope."question_bank_id"
          WHERE bank_scope."package_version_id" = scope."package_version_id"
            AND scoped_bank."purpose" = 'quiz'::"question_bank_purpose"
       )
     )
     AND (
       EXISTS (
         SELECT 1
           FROM "reusable_question_package_versions" version
           JOIN "question_banks" source_bank ON source_bank."id" = version."source_bank_id"
          WHERE version."id" = scope."package_version_id"
            AND source_bank."purpose" = 'tryout'::"question_bank_purpose"
       )
       OR EXISTS (
         SELECT 1
           FROM "reusable_question_package_version_bank_scopes" bank_scope
           JOIN "question_banks" scoped_bank ON scoped_bank."id" = bank_scope."question_bank_id"
          WHERE bank_scope."package_version_id" = scope."package_version_id"
            AND scoped_bank."purpose" = 'tryout'::"question_bank_purpose"
       )
     )
  ) THEN
    RAISE EXCEPTION 'Question-bank folder purpose migration refused: a package folder scope mixes Quiz and Tryout banks';
  END IF;
END
$$;

-- Banks remain in their existing rows; only the folder identity changes for
-- Tryout banks. Unfiled banks remain unfiled in their own purpose tree.
UPDATE "question_banks" bank
   SET "folder_id" = folder_map."new_id"
  FROM "_question_bank_folder_purpose_map" folder_map
 WHERE folder_map."old_id" = bank."folder_id"
   AND folder_map."purpose" = 'tryout'::"question_bank_purpose"
   AND bank."purpose" = 'tryout'::"question_bank_purpose";

-- Folder scopes are not themselves purpose-labelled, so infer their purpose
-- from the version's source/scoped banks. The mixed-purpose guard above makes
-- this remap deterministic.
UPDATE "reusable_question_package_version_folder_scopes" scope
   SET "folder_id" = folder_map."new_id"
  FROM "_question_bank_folder_purpose_map" folder_map
 WHERE folder_map."old_id" = scope."folder_id"
   AND folder_map."purpose" = 'tryout'::"question_bank_purpose"
   AND (
     EXISTS (
       SELECT 1
         FROM "reusable_question_package_versions" version
         JOIN "question_banks" source_bank ON source_bank."id" = version."source_bank_id"
        WHERE version."id" = scope."package_version_id"
          AND source_bank."purpose" = 'tryout'::"question_bank_purpose"
     )
     OR EXISTS (
       SELECT 1
         FROM "reusable_question_package_version_bank_scopes" bank_scope
         JOIN "question_banks" scoped_bank ON scoped_bank."id" = bank_scope."question_bank_id"
        WHERE bank_scope."package_version_id" = scope."package_version_id"
          AND scoped_bank."purpose" = 'tryout'::"question_bank_purpose"
     )
   );

ALTER TABLE "question_bank_folders"
  ALTER COLUMN "purpose" SET NOT NULL;

-- Prisma's model-level @@unique is needed as the target of the composite
-- foreign keys. The case/trim expression indexes preserve the existing UX
-- rule while adding purpose to the uniqueness scope.
CREATE UNIQUE INDEX "question_bank_folders_id_purpose_key"
  ON "question_bank_folders" ("id", "purpose");

CREATE UNIQUE INDEX "question_bank_folders_purpose_root_name_ci_key"
  ON "question_bank_folders" ("purpose", lower(btrim("name")))
  WHERE "parent_id" IS NULL;

CREATE UNIQUE INDEX "question_bank_folders_purpose_parent_name_ci_key"
  ON "question_bank_folders" ("purpose", "parent_id", lower(btrim("name")))
  WHERE "parent_id" IS NOT NULL;

CREATE INDEX "question_bank_folders_purpose_parent_id_name_idx"
  ON "question_bank_folders" ("purpose", "parent_id", "name");

CREATE INDEX "question_banks_folder_id_purpose_idx"
  ON "question_banks" ("folder_id", "purpose");

ALTER TABLE "question_bank_folders"
  ADD CONSTRAINT "question_bank_folders_parent_id_purpose_fkey"
  FOREIGN KEY ("parent_id", "purpose")
  REFERENCES "question_bank_folders" ("id", "purpose")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "question_banks"
  ADD CONSTRAINT "question_banks_folder_id_purpose_fkey"
  FOREIGN KEY ("folder_id", "purpose")
  REFERENCES "question_bank_folders" ("id", "purpose")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "question_bank_folder_purpose_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."purpose" IS DISTINCT FROM OLD."purpose" THEN
    RAISE EXCEPTION 'question bank folder purpose is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "question_bank_folder_purpose_immutable"
BEFORE UPDATE OF "purpose" ON "question_bank_folders"
FOR EACH ROW
EXECUTE FUNCTION "question_bank_folder_purpose_immutable"();

COMMIT;
