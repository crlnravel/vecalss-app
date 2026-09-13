-- CBT-only schema retirement, phase 2.
--
-- The preceding cbt_only_remove_cat_data migration removed CAT-owned rows while
-- retaining nullable columns, compatibility enum values, and validators for a
-- staged application rollout.  This migration is the irreversible schema
-- boundary: it refuses to run unless the operator supplies an explicit
-- acknowledgement and recoverable snapshot identity, proves that no CAT data
-- remains, then removes the compatibility objects in one transaction.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  acknowledgement text := current_setting('cbt.schema_retirement_ack', true);
  snapshot_id text := current_setting('cbt.schema_retirement_snapshot_id', true);
  target_database text := current_setting('cbt.schema_retirement_database', true);
BEGIN
  IF acknowledgement IS DISTINCT FROM 'RETIRE_CAT_SCHEMA'
     OR snapshot_id IS NULL OR length(trim(snapshot_id)) = 0
     OR target_database IS NULL OR target_database <> current_database() THEN
    RAISE EXCEPTION
      'CBT schema retirement requires cbt.schema_retirement_ack=RETIRE_CAT_SCHEMA, cbt.schema_retirement_snapshot_id, and cbt.schema_retirement_database=current_database()';
  END IF;
END $$;

-- Never discard compatibility data silently. The two tables below are
-- CAT-only persistence surfaces; their rows are deliberately removed here
-- under the explicit acknowledgement and recoverable snapshot marker above.
-- All other CAT payloads must already be empty, so a missed phase-1 cleanup
-- still fails closed before any schema object is removed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tryout_sections WHERE test_type::text = 'cat') THEN
    RAISE EXCEPTION 'CBT schema retirement refused: CAT Tryout sections remain';
  END IF;
  IF EXISTS (SELECT 1 FROM tryout_sections WHERE cat_item_count IS NOT NULL OR cat_model_version IS NOT NULL) THEN
    RAISE EXCEPTION 'CBT schema retirement refused: Tryout section CAT metadata remains';
  END IF;
  IF EXISTS (SELECT 1 FROM tryout_attempt_test_runs WHERE cat_state::text <> 'not_applicable' OR cat_snapshot IS NOT NULL OR cat_failure_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'CBT schema retirement refused: CAT run state or snapshot remains';
  END IF;
  IF EXISTS (SELECT 1 FROM assessment_releases WHERE assembly_cat_calibration IS NOT NULL) THEN
    RAISE EXCEPTION 'CBT schema retirement refused: AssessmentRelease CAT calibration remains';
  END IF;
  IF EXISTS (SELECT 1 FROM reusable_question_packages WHERE mode::text = 'cat_pool')
     OR EXISTS (SELECT 1 FROM reusable_question_package_versions WHERE mode::text = 'cat_pool')
     OR EXISTS (SELECT 1 FROM standalone_quizzes WHERE assembly_mode::text = 'cat_pool')
     OR EXISTS (SELECT 1 FROM standalone_quiz_versions WHERE assembly_mode::text = 'cat_pool')
     OR EXISTS (SELECT 1 FROM assessment_releases WHERE assembly_mode::text = 'cat_pool') THEN
    RAISE EXCEPTION 'CBT schema retirement refused: CAT package mode remains';
  END IF;
END $$;

-- Drop triggers before the functions and tables they guard.  The immutable
-- package-version triggers are intentionally retained; their function does
-- not depend on the retired CAT enum or columns.
DROP TRIGGER IF EXISTS assessment_releases_validate_assembly_identity ON assessment_releases;
DROP TRIGGER IF EXISTS standalone_quizzes_validate_assembly_binding ON standalone_quizzes;
DROP TRIGGER IF EXISTS reusable_qpv_definition_version_guard ON reusable_question_package_versions;
DROP TRIGGER IF EXISTS reusable_qpv_definition_bank_scope_guard ON reusable_question_package_version_bank_scopes;
DROP TRIGGER IF EXISTS reusable_qpv_definition_folder_scope_guard ON reusable_question_package_version_folder_scopes;
DROP TRIGGER IF EXISTS reusable_qpv_definition_category_scope_guard ON reusable_question_package_version_category_scopes;
DROP TRIGGER IF EXISTS reusable_qpv_definition_rule_guard ON reusable_question_package_version_rules;
DROP TRIGGER IF EXISTS reusable_question_package_versions_ready_metadata ON reusable_question_package_versions;
DROP TRIGGER IF EXISTS two_pl_question_calibrations_revision_identity_guard ON two_pl_question_calibrations;

DROP FUNCTION IF EXISTS assessment_validate_release_assembly_identity();
DROP FUNCTION IF EXISTS standalone_quiz_validate_assembly_binding();
DROP FUNCTION IF EXISTS assessment_validate_reusable_package_version_definition();
DROP FUNCTION IF EXISTS assessment_prepare_reusable_package_version_ready();
DROP FUNCTION IF EXISTS assessment_guard_question_calibration_identity();

-- These tables have no non-CAT consumers. Delete only their rows, retaining
-- the operator-supplied snapshot as the recovery point before the tables are
-- dropped below. The post-delete assertion prevents a partial cleanup from
-- being mistaken for a successful retirement.
DELETE FROM tryout_cat_resolution_audits;
DELETE FROM two_pl_question_calibrations;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tryout_cat_resolution_audits)
     OR EXISTS (SELECT 1 FROM two_pl_question_calibrations) THEN
    RAISE EXCEPTION 'CBT schema retirement refused: retired CAT rows could not be removed';
  END IF;
END $$;

ALTER TABLE assessment_releases
  DROP CONSTRAINT IF EXISTS assessment_releases_assembly_json_shape_check;

ALTER TABLE assessment_releases
  DROP COLUMN assembly_cat_calibration;

ALTER TABLE tryout_attempt_test_runs
  DROP COLUMN cat_failure_reason,
  DROP COLUMN cat_snapshot,
  DROP COLUMN cat_state;

ALTER TABLE tryout_sections
  DROP COLUMN cat_item_count,
  DROP COLUMN cat_model_version;

DROP TABLE tryout_cat_resolution_audits;
DROP TABLE two_pl_question_calibrations;
DROP TYPE tryout_cat_run_state;

-- Rebuild the package mode enum without the retired CAT pool value.  Defaults
-- are removed first so PostgreSQL does not retain an expression typed with
-- the old enum while the columns are converted.
CREATE TYPE reusable_question_package_mode_new AS ENUM ('fixed_set', 'random_pool', 'blueprint');
ALTER TABLE reusable_question_packages ALTER COLUMN mode DROP DEFAULT;
ALTER TABLE reusable_question_package_versions ALTER COLUMN mode DROP DEFAULT;
ALTER TABLE standalone_quizzes ALTER COLUMN assembly_mode DROP DEFAULT;
ALTER TABLE standalone_quiz_versions ALTER COLUMN assembly_mode DROP DEFAULT;
ALTER TABLE assessment_releases ALTER COLUMN assembly_mode DROP DEFAULT;
ALTER TABLE standalone_quizzes
  ALTER COLUMN assembly_mode TYPE reusable_question_package_mode_new
  USING assembly_mode::text::reusable_question_package_mode_new;
ALTER TABLE standalone_quiz_versions
  ALTER COLUMN assembly_mode TYPE reusable_question_package_mode_new
  USING assembly_mode::text::reusable_question_package_mode_new;
ALTER TABLE reusable_question_packages
  ALTER COLUMN mode TYPE reusable_question_package_mode_new
  USING mode::text::reusable_question_package_mode_new;
ALTER TABLE reusable_question_package_versions
  ALTER COLUMN mode TYPE reusable_question_package_mode_new
  USING mode::text::reusable_question_package_mode_new;
ALTER TABLE assessment_releases
  ALTER COLUMN assembly_mode TYPE reusable_question_package_mode_new
  USING assembly_mode::text::reusable_question_package_mode_new;
ALTER TYPE reusable_question_package_mode RENAME TO reusable_question_package_mode_old;
ALTER TYPE reusable_question_package_mode_new RENAME TO reusable_question_package_mode;
DROP TYPE reusable_question_package_mode_old;
ALTER TABLE reusable_question_packages ALTER COLUMN mode SET DEFAULT 'fixed_set';
ALTER TABLE reusable_question_package_versions ALTER COLUMN mode SET DEFAULT 'fixed_set';

-- Replace the Tryout test type with a one-value CBT enum.
CREATE TYPE tryout_test_type_new AS ENUM ('cbt');
ALTER TABLE tryout_sections ALTER COLUMN test_type DROP DEFAULT;
ALTER TABLE tryout_sections
  ALTER COLUMN test_type TYPE tryout_test_type_new
  USING test_type::text::tryout_test_type_new;
ALTER TYPE tryout_test_type RENAME TO tryout_test_type_old;
ALTER TYPE tryout_test_type_new RENAME TO tryout_test_type;
DROP TYPE tryout_test_type_old;
ALTER TABLE tryout_sections ALTER COLUMN test_type SET DEFAULT 'cbt';

-- Recreate the validators against the replacement enum and the reduced
-- AssessmentRelease shape.  These are the same CBT/package invariants as the
-- staged validators, with retired branches removed.
CREATE OR REPLACE FUNCTION assessment_prepare_reusable_package_version_ready()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  package_subtest uuid;
  package_mode reusable_question_package_mode;
BEGIN
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    SELECT package.subtest_id, package.mode
      INTO package_subtest, package_mode
    FROM reusable_question_packages package
    WHERE package.id = NEW.package_id;
    IF NEW.mode IS DISTINCT FROM package_mode THEN
      RAISE EXCEPTION 'Ready reusable package version mode must match its package' USING ERRCODE = '23514';
    END IF;
    IF NEW.subtest_id IS NULL THEN
      NEW.subtest_id := package_subtest;
    END IF;
    IF NEW.subtest_id IS NULL OR NEW.subtest_id IS DISTINCT FROM package_subtest THEN
      RAISE EXCEPTION 'Ready reusable package versions require a compatible Subtest' USING ERRCODE = '23514';
    END IF;
    IF NEW.definition_digest IS NULL THEN
      NEW.definition_digest := assessment_compute_reusable_package_version_definition_digest(NEW.id);
    END IF;
    IF NEW.definition_digest IS NULL THEN
      RAISE EXCEPTION 'Ready reusable package versions require an immutable definition digest' USING ERRCODE = '23514';
    END IF;
    IF NEW.ready_at IS NULL THEN
      NEW.ready_at := CURRENT_TIMESTAMP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assessment_validate_reusable_package_version_definition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_id uuid;
  version_mode reusable_question_package_mode;
  version_subtest uuid;
  package_subtest uuid;
  package_mode reusable_question_package_mode;
  scope_count integer;
  folder_scope_count integer;
  category_scope_count integer;
  rule_count integer;
  requested_count integer;
  easy_count integer;
  medium_count integer;
  hard_count integer;
BEGIN
  IF TG_TABLE_NAME = 'reusable_question_package_versions' THEN
    IF TG_OP = 'DELETE' THEN
      version_id := OLD.id;
    ELSE
      version_id := NEW.id;
      version_mode := NEW.mode;
      version_subtest := NEW.subtest_id;
      SELECT package.subtest_id, package.mode
        INTO package_subtest, package_mode
      FROM reusable_question_packages package
      WHERE package.id = NEW.package_id;
      IF version_subtest IS NOT NULL AND version_subtest IS DISTINCT FROM package_subtest THEN
        RAISE EXCEPTION 'reusable package version Subtest must match its package' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      version_id := OLD.package_version_id;
    ELSE
      version_id := NEW.package_version_id;
    END IF;
    SELECT version.mode, version.subtest_id
      INTO version_mode, version_subtest
    FROM reusable_question_package_versions version
    WHERE version.id = version_id;
  END IF;

  IF version_mode IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF version_mode = 'fixed_set' THEN
    SELECT COUNT(*) INTO folder_scope_count
    FROM reusable_question_package_version_folder_scopes
    WHERE package_version_id = version_id;
    SELECT COUNT(*) INTO category_scope_count
    FROM reusable_question_package_version_category_scopes
    WHERE package_version_id = version_id;
    SELECT COUNT(*) INTO rule_count
    FROM reusable_question_package_version_rules
    WHERE package_version_id = version_id;
    IF folder_scope_count > 0 OR category_scope_count > 0 OR rule_count > 0 THEN
      RAISE EXCEPTION 'fixed reusable package versions cannot carry folder, category, or rule definitions' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*) INTO scope_count
    FROM reusable_question_package_version_bank_scopes
    WHERE package_version_id = version_id;
    IF scope_count > 1 THEN
      RAISE EXCEPTION 'fixed reusable package versions can reference only one Bank scope' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF version_subtest IS NULL THEN
    RAISE EXCEPTION 'non-fixed reusable package versions require a compatible Subtest' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*) INTO scope_count
  FROM reusable_question_package_version_bank_scopes
  WHERE package_version_id = version_id;
  IF scope_count < 1 THEN
    RAISE EXCEPTION 'non-fixed reusable package versions require at least one Bank scope' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(*), MAX(rule.requested_count), MAX(rule.easy_count), MAX(rule.medium_count), MAX(rule.hard_count)
    INTO rule_count, requested_count, easy_count, medium_count, hard_count
  FROM reusable_question_package_version_rules rule
  WHERE rule.package_version_id = version_id;
  IF rule_count <> 1 THEN
    RAISE EXCEPTION 'non-fixed reusable package versions require exactly one rule' USING ERRCODE = '23514';
  END IF;

  IF version_mode = 'blueprint' THEN
    IF easy_count + medium_count + hard_count <> requested_count THEN
      RAISE EXCEPTION 'Blueprint difficulty quotas must sum to requested count' USING ERRCODE = '23514';
    END IF;
  ELSIF easy_count <> 0 OR medium_count <> 0 OR hard_count <> 0 THEN
    RAISE EXCEPTION 'Pool rules cannot declare Blueprint difficulty quotas' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assessment_validate_release_assembly_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_package_id uuid;
  version_mode reusable_question_package_mode;
  version_status content_status;
BEGIN
  IF NEW.assembly_package_version_id IS NULL THEN
    IF NEW.assembly_package_id IS NOT NULL OR NEW.assembly_mode IS NOT NULL THEN
      RAISE EXCEPTION 'assembly metadata requires a package version' USING ERRCODE = '23514';
    END IF;
    IF NEW.resolver_version IS NOT NULL
       OR NEW.assembly_seed IS NOT NULL
       OR NEW.assembly_requested_count IS NOT NULL
       OR NEW.assembly_candidate_count IS NOT NULL
       OR NEW.assembly_quotas IS NOT NULL
       OR NEW.assembly_scope_summary IS NOT NULL
       OR NEW.assembly_resolved_source_ids IS NOT NULL
       OR NEW.assembly_resolved_revision_digests IS NOT NULL THEN
      RAISE EXCEPTION 'assembly metadata requires a package version' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT version.package_id, version.mode, version.status
    INTO version_package_id, version_mode, version_status
  FROM reusable_question_package_versions version
  WHERE version.id = NEW.assembly_package_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assembly package version does not exist' USING ERRCODE = '23503';
  END IF;
  IF version_status <> 'published' THEN
    RAISE EXCEPTION 'assembly release must reference a Ready package version' USING ERRCODE = '23514';
  END IF;
  IF NEW.assembly_package_id IS DISTINCT FROM version_package_id
     OR NEW.assembly_mode IS DISTINCT FROM version_mode THEN
    RAISE EXCEPTION 'assembly release metadata does not match its package version' USING ERRCODE = '23514';
  END IF;
  IF version_mode = 'random_pool' THEN
    IF NEW.resolver_version IS NULL
       OR NEW.assembly_seed IS NULL
       OR NEW.assembly_requested_count IS NULL
       OR NEW.assembly_candidate_count IS NULL
       OR NEW.assembly_resolved_source_ids IS NULL
       OR jsonb_typeof(NEW.assembly_resolved_source_ids) <> 'array'
       OR NEW.assembly_resolved_revision_digests IS NULL
       OR jsonb_typeof(NEW.assembly_resolved_revision_digests) <> 'array'
       OR NEW.assembly_candidate_count < NEW.assembly_requested_count
       OR jsonb_array_length(NEW.assembly_resolved_source_ids) <> NEW.assembly_requested_count
       OR jsonb_array_length(NEW.assembly_resolved_revision_digests) <> NEW.assembly_requested_count THEN
      RAISE EXCEPTION 'Pool releases require complete seeded resolution metadata' USING ERRCODE = '23514';
    END IF;
  ELSIF version_mode = 'blueprint' THEN
    IF NEW.resolver_version IS NULL
       OR NEW.assembly_seed IS NULL
       OR NEW.assembly_requested_count IS NULL
       OR NEW.assembly_resolved_source_ids IS NULL
       OR jsonb_typeof(NEW.assembly_resolved_source_ids) <> 'array'
       OR NEW.assembly_resolved_revision_digests IS NULL
       OR jsonb_typeof(NEW.assembly_resolved_revision_digests) <> 'array'
       OR jsonb_array_length(NEW.assembly_resolved_source_ids) <> NEW.assembly_requested_count
       OR jsonb_array_length(NEW.assembly_resolved_revision_digests) <> NEW.assembly_requested_count THEN
      RAISE EXCEPTION 'Blueprint releases require complete seeded resolution metadata' USING ERRCODE = '23514';
    END IF;
    IF NEW.assembly_quotas IS NULL
       OR jsonb_typeof(NEW.assembly_quotas) <> 'object'
       OR NEW.assembly_scope_summary IS NULL
       OR jsonb_typeof(NEW.assembly_scope_summary) <> 'object' THEN
      RAISE EXCEPTION 'Blueprint releases require quota and scope provenance' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  IF NEW."assembly_mode" IS DISTINCT FROM version_mode
     OR NEW."assembly_definition_digest" IS DISTINCT FROM version_digest
     OR version_digest IS NULL THEN
    RAISE EXCEPTION 'standalone Kuis assembly metadata does not match its Ready version'
      USING ERRCODE = '23514';
  END IF;
  IF package_subtest_id IS DISTINCT FROM version_subtest_id THEN
    RAISE EXCEPTION 'standalone Kuis assembly Subtest does not match its package'
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

CREATE TRIGGER reusable_question_package_versions_ready_metadata
  BEFORE INSERT OR UPDATE OF status, subtest_id, definition_digest, ready_at
  ON reusable_question_package_versions
  FOR EACH ROW EXECUTE FUNCTION assessment_prepare_reusable_package_version_ready();

CREATE CONSTRAINT TRIGGER reusable_qpv_definition_version_guard
  AFTER INSERT OR UPDATE OR DELETE ON reusable_question_package_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_reusable_package_version_definition();
CREATE CONSTRAINT TRIGGER reusable_qpv_definition_bank_scope_guard
  AFTER INSERT OR UPDATE OR DELETE ON reusable_question_package_version_bank_scopes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_reusable_package_version_definition();
CREATE CONSTRAINT TRIGGER reusable_qpv_definition_folder_scope_guard
  AFTER INSERT OR UPDATE OR DELETE ON reusable_question_package_version_folder_scopes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_reusable_package_version_definition();
CREATE CONSTRAINT TRIGGER reusable_qpv_definition_category_scope_guard
  AFTER INSERT OR UPDATE OR DELETE ON reusable_question_package_version_category_scopes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_reusable_package_version_definition();
CREATE CONSTRAINT TRIGGER reusable_qpv_definition_rule_guard
  AFTER INSERT OR UPDATE OR DELETE ON reusable_question_package_version_rules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_reusable_package_version_definition();

CREATE TRIGGER assessment_releases_validate_assembly_identity
  BEFORE INSERT OR UPDATE ON assessment_releases
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_release_assembly_identity();

CREATE TRIGGER standalone_quizzes_validate_assembly_binding
  BEFORE INSERT OR UPDATE OF "subtest_id", "source_bank_id", "assembly_mode",
    "assembly_package_version_id", "assembly_definition_digest", "assembly_seed"
  ON "standalone_quizzes"
  FOR EACH ROW
  EXECUTE FUNCTION standalone_quiz_validate_assembly_binding();

ALTER TABLE assessment_releases
  ADD CONSTRAINT assessment_releases_assembly_json_shape_check
  CHECK (
    (assembly_quotas IS NULL OR jsonb_typeof(assembly_quotas) = 'object')
    AND (assembly_scope_summary IS NULL OR jsonb_typeof(assembly_scope_summary) = 'object')
    AND (assembly_resolved_source_ids IS NULL OR jsonb_typeof(assembly_resolved_source_ids) = 'array')
    AND (assembly_resolved_revision_digests IS NULL OR jsonb_typeof(assembly_resolved_revision_digests) = 'array')
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('tryout_cat_run_state', 'tryout_test_type_old', 'reusable_question_package_mode_old')) THEN
    RAISE EXCEPTION 'CBT schema retirement refused: retired enum type remains';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    WHERE relation.relname IN ('assessment_releases', 'tryout_sections', 'tryout_attempt_test_runs')
      AND attribute.attname IN ('assembly_cat_calibration', 'cat_item_count', 'cat_model_version', 'cat_state', 'cat_snapshot', 'cat_failure_reason')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION 'CBT schema retirement refused: retired CAT column remains';
  END IF;
  IF to_regclass('two_pl_question_calibrations') IS NOT NULL
     OR to_regclass('tryout_cat_resolution_audits') IS NOT NULL THEN
    RAISE EXCEPTION 'CBT schema retirement refused: retired CAT table remains';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cat_pool')
     OR EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cat') THEN
    RAISE EXCEPTION 'CBT schema retirement refused: CAT enum value remains';
  END IF;
END $$;

COMMIT;
