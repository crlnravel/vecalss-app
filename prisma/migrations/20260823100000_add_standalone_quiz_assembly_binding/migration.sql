-- AS-06: retain the Ready assembly identity on standalone Kuis.
--
-- Kuis remains a direct/fixed snapshot runtime.  These nullable columns add
-- the authoring-level binding so Set, Pool, and Blueprint can be revalidated
-- after reload and before publish without changing existing rows.

ALTER TABLE "standalone_quizzes"
  ADD COLUMN "assembly_mode" "reusable_question_package_mode",
  ADD COLUMN "assembly_package_version_id" UUID,
  ADD COLUMN "assembly_definition_digest" VARCHAR(128),
  ADD COLUMN "assembly_seed" VARCHAR(128),
  ADD CONSTRAINT "standalone_quizzes_assembly_metadata_shape_check"
    CHECK (
      ("assembly_package_version_id" IS NULL
        AND "assembly_mode" IS NULL
        AND "assembly_definition_digest" IS NULL
        AND "assembly_seed" IS NULL)
      OR ("assembly_package_version_id" IS NOT NULL
        AND "assembly_mode" IS NOT NULL
        AND "assembly_definition_digest" IS NOT NULL)
    ),
  ADD CONSTRAINT "standalone_quizzes_assembly_version_fkey"
    FOREIGN KEY ("assembly_package_version_id")
    REFERENCES "reusable_question_package_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "standalone_quizzes_assembly_version_idx"
  ON "standalone_quizzes"("assembly_package_version_id");

-- The application revalidates the same boundary inside its transaction.  The
-- trigger is a second line of defense for forged/legacy writes that bypass
-- the repository: a Kuis binding must point to one active Bank, one active
-- Subtest, and an immutable Ready version whose mode/digest identity matches.
CREATE OR REPLACE FUNCTION standalone_quiz_validate_assembly_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_mode reusable_question_package_mode;
  version_digest VARCHAR(128);
  version_status content_status;
  version_source_bank_id UUID;
  version_subtest_id UUID;
  version_subtest_active BOOLEAN;
  package_mode reusable_question_package_mode;
  package_status content_status;
  package_source_bank_id UUID;
  package_subtest_id UUID;
  scope_count BIGINT;
  scope_bank_id UUID;
  scope_bank_status content_status;
BEGIN
  IF NEW."assembly_package_version_id" IS NULL THEN
    IF NEW."assembly_mode" IS NOT NULL
       OR NEW."assembly_definition_digest" IS NOT NULL
       OR NEW."assembly_seed" IS NOT NULL THEN
      RAISE EXCEPTION 'standalone Kuis assembly metadata requires a package version'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT
    version_row."mode",
    version_row."definition_digest",
    version_row."status",
    version_row."source_bank_id",
    version_row."subtest_id",
    subtest."is_active",
    package_row."mode",
    package_row."status",
    package_row."source_bank_id",
    package_row."subtest_id",
    COUNT(scope."question_bank_id"),
    (ARRAY_AGG(scope."question_bank_id" ORDER BY scope."question_bank_id"))[1],
    (ARRAY_AGG(bank."status" ORDER BY scope."question_bank_id"))[1]
  INTO
    version_mode,
    version_digest,
    version_status,
    version_source_bank_id,
    version_subtest_id,
    version_subtest_active,
    package_mode,
    package_status,
    package_source_bank_id,
    package_subtest_id,
    scope_count,
    scope_bank_id,
    scope_bank_status
  FROM "reusable_question_package_versions" AS version_row
  JOIN "reusable_question_packages" AS package_row
    ON package_row."id" = version_row."package_id"
  LEFT JOIN "subtests" subtest
    ON subtest."id" = version_row."subtest_id"
  LEFT JOIN "reusable_question_package_version_bank_scopes" scope
    ON scope."package_version_id" = version_row."id"
  LEFT JOIN "question_banks" bank
    ON bank."id" = scope."question_bank_id"
  WHERE version_row."id" = NEW."assembly_package_version_id"
  GROUP BY
    version_row."mode",
    version_row."definition_digest",
    version_row."status",
    version_row."source_bank_id",
    version_row."subtest_id",
    subtest."is_active",
    package_row."mode",
    package_row."status",
    package_row."source_bank_id",
    package_row."subtest_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'standalone Kuis assembly version does not exist'
      USING ERRCODE = '23503';
  END IF;
  IF version_status <> 'published'::content_status
     OR package_status = 'archived'::content_status THEN
    RAISE EXCEPTION 'standalone Kuis assembly version must be Ready'
      USING ERRCODE = '23514';
  END IF;
  IF package_mode IS DISTINCT FROM version_mode THEN
    RAISE EXCEPTION 'standalone Kuis assembly mode does not match its package version'
      USING ERRCODE = '23514';
  END IF;
  IF package_subtest_id IS DISTINCT FROM version_subtest_id THEN
    RAISE EXCEPTION 'standalone Kuis assembly Subtest does not match its package'
      USING ERRCODE = '23514';
  END IF;
  IF version_mode = 'cat_pool'::reusable_question_package_mode THEN
    RAISE EXCEPTION 'CAT Pool is not supported by standalone Kuis'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."assembly_mode" IS DISTINCT FROM version_mode
     OR NEW."assembly_definition_digest" IS DISTINCT FROM version_digest
     OR version_digest IS NULL THEN
    RAISE EXCEPTION 'standalone Kuis assembly metadata does not match its Ready version'
      USING ERRCODE = '23514';
  END IF;
  IF version_subtest_id IS NULL
     OR NEW."subtest_id" IS DISTINCT FROM version_subtest_id
     OR version_subtest_active IS NOT TRUE THEN
    RAISE EXCEPTION 'standalone Kuis assembly Subtest is not active or does not match'
      USING ERRCODE = '23514';
  END IF;
  IF scope_count <> 1
     OR scope_bank_id IS NULL
     OR version_source_bank_id IS DISTINCT FROM scope_bank_id
     OR package_source_bank_id IS DISTINCT FROM scope_bank_id
     OR NEW."source_bank_id" IS DISTINCT FROM scope_bank_id
     OR scope_bank_status <> 'published'::content_status THEN
    RAISE EXCEPTION 'standalone Kuis assembly must use one published Bank'
      USING ERRCODE = '23514';
  END IF;
  IF version_mode IN ('random_pool'::reusable_question_package_mode, 'blueprint'::reusable_question_package_mode)
     AND NEW."assembly_seed" IS NULL THEN
    RAISE EXCEPTION 'standalone Kuis random assembly requires a persisted seed'
      USING ERRCODE = '23514';
  END IF;
  IF version_mode = 'fixed_set'::reusable_question_package_mode
     AND NEW."assembly_seed" IS NOT NULL THEN
    RAISE EXCEPTION 'standalone Kuis fixed Set cannot carry a random seed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER standalone_quizzes_validate_assembly_binding
  BEFORE INSERT OR UPDATE OF "subtest_id", "source_bank_id", "assembly_mode",
    "assembly_package_version_id", "assembly_definition_digest", "assembly_seed"
  ON "standalone_quizzes"
  FOR EACH ROW
  EXECUTE FUNCTION standalone_quiz_validate_assembly_binding();
