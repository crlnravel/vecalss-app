-- AS-06: durable assembly modes and immutable, version-owned definitions.
--
-- Existing package/version rows remain fixed Sets.  The compatibility
-- sourceBankId columns stay in place for the existing one-Bank path; the
-- normalized scope rows below are authoritative for new multi-Bank modes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "reusable_question_package_mode" AS ENUM (
  'fixed_set',
  'random_pool',
  'blueprint',
  'cat_pool'
);

CREATE TYPE "reusable_question_package_version_provenance" AS ENUM (
  'authored',
  'legacy_provable',
  'legacy_unknown'
);

ALTER TABLE "reusable_question_packages"
  ADD COLUMN "mode" "reusable_question_package_mode" NOT NULL DEFAULT 'fixed_set';

ALTER TABLE "reusable_question_package_versions"
  ADD COLUMN "subtest_id" UUID,
  ADD COLUMN "mode" "reusable_question_package_mode" NOT NULL DEFAULT 'fixed_set',
  ADD COLUMN "definition_digest" VARCHAR(128),
  ADD COLUMN "provenance" "reusable_question_package_version_provenance" NOT NULL DEFAULT 'authored';

-- Migration 30 installed this trigger before the new immutable metadata
-- backfill.  Remove it for the one-time UPDATE below; the replacement
-- function and trigger are installed again before this migration commits.
DROP TRIGGER IF EXISTS reusable_question_package_versions_ready_immutable
  ON reusable_question_package_versions;

UPDATE "reusable_question_package_versions" version
SET
  "subtest_id" = package."subtest_id",
  "provenance" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "reusable_question_package_version_items" item_provenance
      WHERE item_provenance."package_version_id" = version."id"
        AND (
          item_provenance."source_question_revision_id" IS NULL
          OR item_provenance."source_content_digest" IS NULL
          OR item_provenance."source_revision_provenance" IS NULL
          OR item_provenance."source_revision_provenance" = 'legacy_unknown'::"question_revision_provenance"
        )
    ) THEN 'legacy_unknown'::"reusable_question_package_version_provenance"
    ELSE 'legacy_provable'::"reusable_question_package_version_provenance"
  END,
  "definition_digest" = definition."digest"
FROM "reusable_question_packages" package,
(
  SELECT
    version_row."id",
    encode(
      digest(
        concat_ws(
          '|',
          'reusable-package-definition-v1',
          version_row."package_id"::text,
          version_row."source_bank_id"::text,
          version_row."version_no"::text,
          version_row."mode"::text,
          package_row."subtest_id"::text,
          COALESCE(
            string_agg(
              concat_ws(
                ':',
                item."source_question_id"::text,
                COALESCE(item."source_question_revision_id"::text, ''),
                COALESCE(item."source_content_digest", ''),
                item."sort_order"::text,
                item."point_value"::text
              ),
              '|' ORDER BY item."sort_order"
            ),
            ''
          )
        ),
        'sha256'
      ),
      'hex'
    ) AS "digest"
  FROM "reusable_question_package_versions" version_row
  JOIN "reusable_question_packages" package_row
    ON package_row."id" = version_row."package_id"
  LEFT JOIN "reusable_question_package_version_items" item
    ON item."package_version_id" = version_row."id"
  GROUP BY
    version_row."id",
    version_row."package_id",
    version_row."source_bank_id",
    version_row."version_no",
    version_row."mode",
    package_row."subtest_id"
) definition
WHERE package."id" = version."package_id"
  AND definition."id" = version."id";

ALTER TABLE "reusable_question_package_versions"
  ADD CONSTRAINT "reusable_qpv_subtest_fkey"
    FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "reusable_question_packages_mode_status_idx"
  ON "reusable_question_packages"("mode", "status");
CREATE INDEX "reusable_question_package_versions_subtest_mode_status_idx"
  ON "reusable_question_package_versions"("subtest_id", "mode", "status");

CREATE TABLE "reusable_question_package_version_bank_scopes" (
  "package_version_id" UUID NOT NULL,
  "question_bank_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reusable_qpv_bank_scope_pkey"
    PRIMARY KEY ("package_version_id", "question_bank_id"),
  CONSTRAINT "reusable_qpv_bank_scope_version_fkey"
    FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reusable_qpv_bank_scope_bank_fkey"
    FOREIGN KEY ("question_bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reusable_qpv_bank_scope_bank_version_idx"
  ON "reusable_question_package_version_bank_scopes"("question_bank_id", "package_version_id");

CREATE TABLE "reusable_question_package_version_folder_scopes" (
  "package_version_id" UUID NOT NULL,
  "folder_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reusable_qpv_folder_scope_pkey"
    PRIMARY KEY ("package_version_id", "folder_id"),
  CONSTRAINT "reusable_qpv_folder_scope_version_fkey"
    FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reusable_qpv_folder_scope_folder_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "question_bank_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reusable_qpv_folder_scope_folder_version_idx"
  ON "reusable_question_package_version_folder_scopes"("folder_id", "package_version_id");

CREATE TABLE "reusable_question_package_version_category_scopes" (
  "package_version_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reusable_qpv_category_scope_pkey"
    PRIMARY KEY ("package_version_id", "category_id"),
  CONSTRAINT "reusable_qpv_category_scope_version_fkey"
    FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reusable_qpv_category_scope_category_fkey"
    FOREIGN KEY ("category_id") REFERENCES "question_bank_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "reusable_qpv_category_scope_category_version_idx"
  ON "reusable_question_package_version_category_scopes"("category_id", "package_version_id");

INSERT INTO "reusable_question_package_version_bank_scopes" (
  "package_version_id",
  "question_bank_id"
)
SELECT "id", "source_bank_id"
FROM "reusable_question_package_versions"
ON CONFLICT ("package_version_id", "question_bank_id") DO NOTHING;

CREATE TABLE "reusable_question_package_version_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "package_version_id" UUID NOT NULL,
  "requested_count" INTEGER NOT NULL,
  "easy_count" INTEGER NOT NULL DEFAULT 0,
  "medium_count" INTEGER NOT NULL DEFAULT 0,
  "hard_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reusable_qpv_rule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reusable_qpv_rule_version_key" UNIQUE ("package_version_id"),
  CONSTRAINT "reusable_qpv_rule_version_fkey"
    FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reusable_qpv_rule_requested_count_check" CHECK ("requested_count" > 0),
  CONSTRAINT "reusable_qpv_rule_non_negative_quota_check"
    CHECK ("easy_count" >= 0 AND "medium_count" >= 0 AND "hard_count" >= 0),
  CONSTRAINT "reusable_qpv_rule_quota_sum_check"
    CHECK (
      ("easy_count" = 0 AND "medium_count" = 0 AND "hard_count" = 0)
      OR ("easy_count" + "medium_count" + "hard_count") = "requested_count"
    )
);

CREATE INDEX "reusable_qpv_rules_requested_count_idx"
  ON "reusable_question_package_version_rules"("requested_count");

ALTER TABLE "assessment_releases"
  ADD COLUMN "assembly_mode" "reusable_question_package_mode",
  ADD COLUMN "assembly_package_id" UUID,
  ADD COLUMN "assembly_package_version_id" UUID,
  ADD COLUMN "resolver_version" VARCHAR(120),
  ADD COLUMN "assembly_seed" VARCHAR(128),
  ADD COLUMN "assembly_requested_count" INTEGER,
  ADD COLUMN "assembly_candidate_count" INTEGER,
  ADD COLUMN "assembly_quotas" JSONB,
  ADD COLUMN "assembly_scope_summary" JSONB,
  ADD COLUMN "assembly_resolved_source_ids" JSONB,
  ADD COLUMN "assembly_resolved_revision_digests" JSONB,
  ADD COLUMN "assembly_cat_calibration" JSONB;

ALTER TABLE "assessment_releases"
  ADD CONSTRAINT "assessment_releases_assembly_package_fkey"
    FOREIGN KEY ("assembly_package_id") REFERENCES "reusable_question_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "assessment_releases_assembly_package_version_fkey"
    FOREIGN KEY ("assembly_package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "assessment_releases_assembly_counts_check"
    CHECK (
      ("assembly_requested_count" IS NULL OR "assembly_requested_count" > 0)
      AND ("assembly_candidate_count" IS NULL OR "assembly_candidate_count" >= 0)
    ),
  ADD CONSTRAINT "assessment_releases_assembly_json_shape_check"
    CHECK (
      ("assembly_quotas" IS NULL OR jsonb_typeof("assembly_quotas") = 'object')
      AND ("assembly_scope_summary" IS NULL OR jsonb_typeof("assembly_scope_summary") = 'object')
      AND ("assembly_resolved_source_ids" IS NULL OR jsonb_typeof("assembly_resolved_source_ids") = 'array')
      AND ("assembly_resolved_revision_digests" IS NULL OR jsonb_typeof("assembly_resolved_revision_digests") = 'array')
      AND ("assembly_cat_calibration" IS NULL OR jsonb_typeof("assembly_cat_calibration") = 'array')
    );

CREATE INDEX "assessment_releases_assembly_package_idx"
  ON "assessment_releases"("assembly_package_id");
CREATE INDEX "assessment_releases_assembly_package_version_idx"
  ON "assessment_releases"("assembly_package_version_id");

-- A Ready revision remains append-only.  The existing guard is extended to
-- the normalized scope/rule children so new definition rows cannot be edited
-- after publication.
CREATE OR REPLACE FUNCTION assessment_reject_ready_package_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status content_status;
  old_version_id uuid;
  new_version_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'reusable_question_package_versions' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'ready reusable package versions are immutable' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'reusable_question_package_version_item_options' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT item.package_version_id INTO old_version_id
      FROM reusable_question_package_version_items item
      WHERE item.id = OLD.package_version_item_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT item.package_version_id INTO new_version_id
      FROM reusable_question_package_version_items item
      WHERE item.id = NEW.package_version_item_id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      old_version_id := OLD.package_version_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      new_version_id := NEW.package_version_id;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN (
    'reusable_question_package_version_items',
    'reusable_question_package_version_item_options',
    'reusable_question_package_version_bank_scopes',
    'reusable_question_package_version_folder_scopes',
    'reusable_question_package_version_category_scopes',
    'reusable_question_package_version_rules'
  ) THEN
    IF old_version_id IS NOT NULL THEN
      SELECT status INTO version_status
      FROM reusable_question_package_versions
      WHERE id = old_version_id;
      IF version_status = 'published' THEN
        RAISE EXCEPTION 'ready reusable package version snapshots are immutable' USING ERRCODE = '55000';
      END IF;
    END IF;
    IF new_version_id IS NOT NULL AND new_version_id IS DISTINCT FROM old_version_id THEN
      SELECT status INTO version_status
      FROM reusable_question_package_versions
      WHERE id = new_version_id;
      IF version_status = 'published' THEN
        RAISE EXCEPTION 'ready reusable package version snapshots are immutable' USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reusable_question_package_versions_ready_immutable
  BEFORE UPDATE OR DELETE ON reusable_question_package_versions
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

CREATE TRIGGER reusable_question_package_version_bank_scopes_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_bank_scopes
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

CREATE TRIGGER reusable_question_package_version_folder_scopes_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_folder_scopes
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

CREATE TRIGGER reusable_question_package_version_category_scopes_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_category_scopes
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

CREATE TRIGGER reusable_question_package_version_rules_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_rules
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

-- Ready revisions must carry the metadata that explains their immutable
-- definition.  The fixed-Set writer predates these columns, so the transition
-- trigger fills the compatible Subtest and computes a stable digest when a
-- legacy writer only asks to mark the version published.
CREATE OR REPLACE FUNCTION assessment_compute_reusable_package_version_definition_digest(p_version_id uuid)
RETURNS varchar(128)
LANGUAGE sql
STABLE
AS $$
SELECT encode(
  digest(
    convert_to(
      jsonb_build_object(
        'packageId', version_row.package_id,
        'sourceBankId', version_row.source_bank_id,
        'subtestId', version_row.subtest_id,
        'versionNo', version_row.version_no,
        'mode', version_row.mode,
        'items', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'sourceQuestionId', item.source_question_id,
              'sourceQuestionRevisionId', item.source_question_revision_id,
              'sourceContentDigest', item.source_content_digest,
              'sourceRevisionProvenance', item.source_revision_provenance,
              'sortOrder', item.sort_order,
              'pointValue', item.point_value,
              'prompt', item.prompt,
              'explanation', item.explanation,
              'difficulty', item.difficulty,
              'subtestId', item.subtest_id,
              'promptAssetId', item.prompt_asset_id,
              'explanationAssetId', item.explanation_asset_id,
              'options', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'choiceKey', option.choice_key,
                    'content', option.content,
                    'isCorrect', option.is_correct,
                    'sortOrder', option.sort_order,
                    'sourceQuestionOptionId', option.source_question_option_id,
                    'sourceQuestionRevisionOptionId', option.source_question_revision_option_id,
                    'assetId', option.asset_id
                  )
                  ORDER BY option.sort_order
                )
                FROM reusable_question_package_version_item_options option
                WHERE option.package_version_item_id = item.id
              ), '[]'::jsonb)
            )
            ORDER BY item.sort_order
          )
          FROM reusable_question_package_version_items item
          WHERE item.package_version_id = version_row.id
        ), '[]'::jsonb),
        'bankScopes', COALESCE((
          SELECT jsonb_agg(scope.question_bank_id ORDER BY scope.question_bank_id)
          FROM reusable_question_package_version_bank_scopes scope
          WHERE scope.package_version_id = version_row.id
        ), '[]'::jsonb),
        'folderScopes', COALESCE((
          SELECT jsonb_agg(scope.folder_id ORDER BY scope.folder_id)
          FROM reusable_question_package_version_folder_scopes scope
          WHERE scope.package_version_id = version_row.id
        ), '[]'::jsonb),
        'categoryScopes', COALESCE((
          SELECT jsonb_agg(scope.category_id ORDER BY scope.category_id)
          FROM reusable_question_package_version_category_scopes scope
          WHERE scope.package_version_id = version_row.id
        ), '[]'::jsonb),
        'rule', COALESCE((
          SELECT jsonb_build_object(
            'requestedCount', rule.requested_count,
            'easyCount', rule.easy_count,
            'mediumCount', rule.medium_count,
            'hardCount', rule.hard_count
          )
          FROM reusable_question_package_version_rules rule
          WHERE rule.package_version_id = version_row.id
        ), 'null'::jsonb)
      )::text,
      'UTF8'
    ),
    'sha256'
  ),
  'hex'
)
FROM reusable_question_package_versions version_row
WHERE version_row.id = p_version_id;
$$;

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

CREATE TRIGGER reusable_question_package_versions_ready_metadata
  BEFORE INSERT OR UPDATE OF status, subtest_id, definition_digest, ready_at
  ON reusable_question_package_versions
  FOR EACH ROW EXECUTE FUNCTION assessment_prepare_reusable_package_version_ready();

-- Non-fixed definitions must declare a non-empty Bank scope and exactly one
-- mode-specific rule.  Deferred constraint triggers allow a repository to
-- create the version, scope, and rule in one transaction while still
-- rejecting incomplete definitions at commit.
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
    RAISE EXCEPTION 'Pool and CAT Pool rules cannot declare Blueprint difficulty quotas' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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

-- If a release carries assembly metadata, its package/version identity and
-- mode must agree. Existing direct/fixed releases keep all nullable fields
-- empty and remain untouched.
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
       OR NEW.assembly_resolved_revision_digests IS NOT NULL
       OR NEW.assembly_cat_calibration IS NOT NULL THEN
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
  ELSIF version_mode = 'cat_pool' THEN
    IF NEW.resolver_version IS NULL
       OR NEW.assembly_requested_count IS NULL
       OR NEW.assembly_candidate_count IS NULL
       OR NEW.assembly_cat_calibration IS NULL
       OR jsonb_typeof(NEW.assembly_cat_calibration) <> 'array'
       OR NEW.assembly_resolved_source_ids IS NULL
       OR jsonb_typeof(NEW.assembly_resolved_source_ids) <> 'array'
       OR NEW.assembly_resolved_revision_digests IS NULL
       OR jsonb_typeof(NEW.assembly_resolved_revision_digests) <> 'array'
       OR NEW.assembly_candidate_count < NEW.assembly_requested_count
       OR jsonb_array_length(NEW.assembly_resolved_source_ids) <> NEW.assembly_candidate_count
       OR jsonb_array_length(NEW.assembly_resolved_revision_digests) <> NEW.assembly_candidate_count
       OR jsonb_array_length(NEW.assembly_cat_calibration) <> NEW.assembly_candidate_count THEN
      RAISE EXCEPTION 'CAT Pool releases require complete candidate and calibration metadata' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assessment_releases_validate_assembly_identity
  BEFORE INSERT OR UPDATE ON assessment_releases
  FOR EACH ROW EXECUTE FUNCTION assessment_validate_release_assembly_identity();
