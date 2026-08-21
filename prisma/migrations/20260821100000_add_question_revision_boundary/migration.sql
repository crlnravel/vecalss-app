-- Physical QuestionRevision boundary.
--
-- The existing Question/QuestionOption rows stay in place as a compatibility
-- projection. Revisions are append-only source snapshots and their options
-- become immutable once the revision is Ready;
-- downstream snapshot rows retain their existing IDs and receive nullable
-- provenance links so this migration never rewrites delivered attempts.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "question_revision_status" AS ENUM ('draft', 'review', 'ready', 'retired');
CREATE TYPE "question_revision_provenance" AS ENUM ('authored', 'legacy_provable', 'legacy_synthetic', 'legacy_unknown');

CREATE TABLE "question_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "status" "question_revision_status" NOT NULL DEFAULT 'draft',
    "provenance" "question_revision_provenance" NOT NULL DEFAULT 'authored',
    "stem" TEXT NOT NULL,
    "question_type" "question_type" NOT NULL DEFAULT 'single_choice',
    "difficulty" "difficulty_level" NOT NULL DEFAULT 'medium',
    "explanation" TEXT,
    "prompt_asset_id" UUID,
    "explanation_asset_id" UUID,
    "content_digest" VARCHAR(128) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMPTZ,
    "retired_at" TIMESTAMPTZ,

    CONSTRAINT "question_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_revisions_question_id_revision_no_key" UNIQUE ("question_id", "revision_no"),
    CONSTRAINT "question_revisions_question_id_fkey"
      FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "question_revisions_prompt_asset_id_fkey"
      FOREIGN KEY ("prompt_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "question_revisions_explanation_asset_id_fkey"
      FOREIGN KEY ("explanation_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "question_revisions_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "question_revisions_updated_by_user_id_fkey"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "question_revision_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_revision_id" UUID NOT NULL,
    "label" VARCHAR(8) NOT NULL,
    "content" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "asset_id" UUID,

    CONSTRAINT "question_revision_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_revision_options_question_revision_id_fkey"
      FOREIGN KEY ("question_revision_id") REFERENCES "question_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "question_revision_options_asset_id_fkey"
      FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "question_revision_options_question_revision_id_label_key"
      UNIQUE ("question_revision_id", "label"),
    CONSTRAINT "question_revision_options_question_revision_id_sort_order_key"
      UNIQUE ("question_revision_id", "sort_order")
);

ALTER TABLE "questions"
  ADD COLUMN "current_revision_id" UUID;

-- The application and migration use the same length-safe (hex encoded)
-- canonical field stream. Hex keeps separators unambiguous even when stems,
-- explanations, or option text contain arbitrary UTF-8.
WITH question_digests AS (
  SELECT
    q.id,
    encode(
      digest(
        concat(
          encode(convert_to('question-revision-digest-v1', 'UTF8'), 'hex'), ':',
          encode(convert_to(q.difficulty::text, 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(q.explanation, ''), 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(q.explanation_asset_id::text, ''), 'UTF8'), 'hex'), ':',
          COALESCE((
            SELECT string_agg(
              concat(
                encode(convert_to(COALESCE(qo.asset_id::text, ''), 'UTF8'), 'hex'), ':',
                encode(convert_to(qo.content, 'UTF8'), 'hex'), ':',
                encode(convert_to(qo.is_correct::text, 'UTF8'), 'hex'), ':',
                encode(convert_to(qo.label, 'UTF8'), 'hex'), ':',
                encode(convert_to(qo.sort_order::text, 'UTF8'), 'hex')
              ), ':' ORDER BY qo.sort_order, qo.label
            )
            FROM question_options qo
            WHERE qo.question_id = q.id
          ), ''), ':',
          encode(convert_to(q.stem, 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(q.prompt_asset_id::text, ''), 'UTF8'), 'hex'), ':',
          encode(convert_to(q.question_type::text, 'UTF8'), 'hex')
        ),
        'sha256'
      ),
      'hex'
    ) AS digest
  FROM questions q
)
INSERT INTO "question_revisions" (
  "question_id",
  "revision_no",
  "status",
  "provenance",
  "stem",
  "question_type",
  "difficulty",
  "explanation",
  "prompt_asset_id",
  "explanation_asset_id",
  "content_digest",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "ready_at",
  "retired_at"
)
SELECT
  q.id,
  GREATEST(q.revision, 1),
  CASE q.status
    WHEN 'published' THEN 'ready'::question_revision_status
    WHEN 'scheduled' THEN 'review'::question_revision_status
    WHEN 'archived' THEN 'retired'::question_revision_status
    ELSE 'draft'::question_revision_status
  END,
  'legacy_provable'::question_revision_provenance,
  q.stem,
  q.question_type,
  q.difficulty,
  q.explanation,
  q.prompt_asset_id,
  q.explanation_asset_id,
  question_digests.digest,
  q.created_by_user_id,
  q.updated_by_user_id,
  q.created_at,
  q.updated_at,
  CASE WHEN q.status = 'published' THEN q.updated_at ELSE NULL END,
  CASE WHEN q.status = 'archived' THEN q.updated_at ELSE NULL END
FROM questions q
JOIN question_digests ON question_digests.id = q.id;

INSERT INTO "question_revision_options" (
  "question_revision_id", "label", "content", "is_correct", "sort_order", "asset_id"
)
SELECT
  revision.id, option.label, option.content, option.is_correct, option.sort_order, option.asset_id
FROM question_options option
JOIN question_revisions revision
  ON revision.question_id = option.question_id
 AND revision.revision_no = GREATEST((SELECT q.revision FROM questions q WHERE q.id = option.question_id), 1);

UPDATE questions q
SET current_revision_id = revision.id
FROM question_revisions revision
WHERE revision.question_id = q.id
  AND revision.revision_no = GREATEST(q.revision, 1);

ALTER TABLE "questions"
  ALTER COLUMN "current_revision_id" SET NOT NULL,
  ADD CONSTRAINT "questions_current_revision_id_fkey"
    FOREIGN KEY ("current_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX "questions_current_revision_id_key" ON "questions"("current_revision_id");
CREATE INDEX "question_revisions_question_id_status_idx" ON "question_revisions"("question_id", "status");
CREATE INDEX "question_revisions_status_content_digest_idx" ON "question_revisions"("status", "content_digest");

ALTER TABLE "two_pl_question_calibrations"
  ADD COLUMN "question_revision_id" UUID,
  ADD COLUMN "content_digest" VARCHAR(128),
  ADD COLUMN "source_revision_provenance" "question_revision_provenance" NOT NULL DEFAULT 'authored'::question_revision_provenance;

UPDATE "two_pl_question_calibrations" calibration
SET
  question_revision_id = question.current_revision_id,
  content_digest = revision.content_digest,
  -- The legacy row has no evidence that its parameters were recorded for
  -- this exact revision. Keep its existing approval-state value for schema
  -- compatibility, but quarantine it with explicit unknown provenance.
  source_revision_provenance = 'legacy_unknown'::question_revision_provenance
FROM questions question
JOIN question_revisions revision ON revision.id = question.current_revision_id
WHERE question.id = calibration.question_id;

ALTER TABLE "two_pl_question_calibrations"
  ALTER COLUMN "question_revision_id" SET NOT NULL,
  ALTER COLUMN "content_digest" SET NOT NULL,
  ADD CONSTRAINT "two_pl_question_calibrations_question_revision_id_fkey"
    FOREIGN KEY ("question_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "two_pl_question_calibrations"
  DROP CONSTRAINT IF EXISTS "two_pl_question_calibrations_question_id_model_version_key",
  ADD CONSTRAINT "two_pl_question_calibrations_question_revision_id_model_version_key"
    UNIQUE ("question_revision_id", "model_version");

CREATE UNIQUE INDEX "question_revisions_question_id_id_key"
  ON "question_revisions"("question_id", "id");

ALTER TABLE "two_pl_question_calibrations"
  ADD CONSTRAINT "two_pl_question_calibrations_question_identity_fkey"
    FOREIGN KEY ("question_id", "question_revision_id")
    REFERENCES "question_revisions"("question_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "two_pl_question_calibrations_question_id_model_version_idx"
  ON "two_pl_question_calibrations"("question_id", "model_version");

CREATE OR REPLACE FUNCTION "assessment_guard_question_calibration_identity"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_question_id UUID;
  revision_digest VARCHAR(128);
BEGIN
  SELECT question_id, content_digest
  INTO revision_question_id, revision_digest
  FROM question_revisions
  WHERE id = NEW.question_revision_id;
  IF revision_question_id IS NULL
    OR revision_question_id IS DISTINCT FROM NEW.question_id
    OR revision_digest IS DISTINCT FROM NEW.content_digest
  THEN
    RAISE EXCEPTION 'CAT calibration must match its QuestionRevision identity and digest' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "two_pl_question_calibrations_revision_identity_guard"
BEFORE INSERT OR UPDATE ON "two_pl_question_calibrations"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_question_calibration_identity"();

ALTER TABLE "standalone_quiz_items"
  ADD COLUMN "source_question_revision_id" UUID,
  ADD COLUMN "source_content_digest" VARCHAR(128),
  ADD COLUMN "source_revision_provenance" "question_revision_provenance";
ALTER TABLE "reusable_question_package_items"
  ADD COLUMN "source_question_revision_id" UUID,
  ADD COLUMN "source_content_digest" VARCHAR(128),
  ADD COLUMN "source_revision_provenance" "question_revision_provenance";
ALTER TABLE "reusable_question_package_version_items"
  ADD COLUMN "source_question_revision_id" UUID,
  ADD COLUMN "source_content_digest" VARCHAR(128),
  ADD COLUMN "source_revision_provenance" "question_revision_provenance";
ALTER TABLE "tryout_items"
  ADD COLUMN "source_question_revision_id" UUID,
  ADD COLUMN "source_content_digest" VARCHAR(128),
  ADD COLUMN "source_revision_provenance" "question_revision_provenance";

ALTER TABLE "standalone_quiz_item_options"
  ADD COLUMN "source_question_revision_option_id" UUID;
ALTER TABLE "reusable_question_package_version_item_options"
  ADD COLUMN "source_question_revision_option_id" UUID;
ALTER TABLE "tryout_item_options"
  ADD COLUMN "source_question_revision_option_id" UUID;

-- Existing source links remain valid and render through their copied snapshot
-- fields. The current revision is a useful compatibility pointer, but legacy
-- snapshot content cannot be proven identical without rewriting history, so
-- those links are explicitly marked unknown.
UPDATE standalone_quiz_items item
SET source_question_revision_id = question.current_revision_id,
    source_content_digest = revision.content_digest,
    source_revision_provenance = 'legacy_unknown'::question_revision_provenance
FROM questions question
JOIN question_revisions revision ON revision.id = question.current_revision_id
WHERE item.source_question_id = question.id;

UPDATE reusable_question_package_items item
SET source_question_revision_id = question.current_revision_id,
    source_content_digest = revision.content_digest,
    source_revision_provenance = 'legacy_unknown'::question_revision_provenance
FROM questions question
JOIN question_revisions revision ON revision.id = question.current_revision_id
WHERE item.source_question_id = question.id;

UPDATE reusable_question_package_version_items item
SET source_question_revision_id = question.current_revision_id,
    source_content_digest = revision.content_digest,
    source_revision_provenance = 'legacy_unknown'::question_revision_provenance
FROM questions question
JOIN question_revisions revision ON revision.id = question.current_revision_id
WHERE item.source_question_id = question.id;

UPDATE tryout_items item
SET source_question_revision_id = question.current_revision_id,
    source_content_digest = revision.content_digest,
    source_revision_provenance = 'legacy_unknown'::question_revision_provenance
FROM questions question
JOIN question_revisions revision ON revision.id = question.current_revision_id
WHERE item.source_question_id = question.id;

ALTER TABLE "standalone_quiz_items"
  ADD CONSTRAINT "standalone_quiz_items_source_question_revision_id_fkey"
    FOREIGN KEY ("source_question_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reusable_question_package_items"
  ADD CONSTRAINT "reusable_question_package_items_source_question_revision_id_fkey"
    FOREIGN KEY ("source_question_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reusable_question_package_version_items"
  ADD CONSTRAINT "reusable_question_package_version_items_source_question_revision_id_fkey"
    FOREIGN KEY ("source_question_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tryout_items"
  ADD CONSTRAINT "tryout_items_source_question_revision_id_fkey"
    FOREIGN KEY ("source_question_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_item_options"
  ADD CONSTRAINT "standalone_quiz_item_options_source_question_revision_option_id_fkey"
    FOREIGN KEY ("source_question_revision_option_id") REFERENCES "question_revision_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reusable_question_package_version_item_options"
  ADD CONSTRAINT "rqpvio_source_revision_option_fkey"
    FOREIGN KEY ("source_question_revision_option_id") REFERENCES "question_revision_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tryout_item_options"
  ADD CONSTRAINT "tryout_item_options_source_question_revision_option_id_fkey"
    FOREIGN KEY ("source_question_revision_option_id") REFERENCES "question_revision_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "standalone_quiz_items_source_question_revision_id_idx" ON "standalone_quiz_items"("source_question_revision_id");
CREATE INDEX "reusable_question_package_items_source_question_revision_id_idx" ON "reusable_question_package_items"("source_question_revision_id");
CREATE INDEX "reusable_question_package_version_items_source_question_revision_id_idx" ON "reusable_question_package_version_items"("source_question_revision_id");
CREATE INDEX "tryout_items_source_question_revision_id_idx" ON "tryout_items"("source_question_revision_id");
CREATE INDEX "standalone_quiz_item_options_source_question_revision_option_id_idx" ON "standalone_quiz_item_options"("source_question_revision_option_id");
CREATE INDEX "reusable_question_package_version_item_options_source_question_revision_option_id_idx" ON "reusable_question_package_version_item_options"("source_question_revision_option_id");
CREATE INDEX "tryout_item_options_source_question_revision_option_id_idx" ON "tryout_item_options"("source_question_revision_option_id");

-- A revision pointer is meaningful only in the context of its Question. The
-- composite constraints below prevent a stale/mismatched Question ID from
-- being paired with an otherwise valid revision UUID.
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_current_revision_identity_fkey"
    FOREIGN KEY ("id", "current_revision_id")
    REFERENCES "question_revisions"("question_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "standalone_quiz_items"
  ADD CONSTRAINT "standalone_quiz_items_source_revision_identity_fkey"
    FOREIGN KEY ("source_question_id", "source_question_revision_id")
    REFERENCES "question_revisions"("question_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reusable_question_package_items"
  ADD CONSTRAINT "reusable_question_package_items_source_revision_identity_fkey"
    FOREIGN KEY ("source_question_id", "source_question_revision_id")
    REFERENCES "question_revisions"("question_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reusable_question_package_version_items"
  ADD CONSTRAINT "reusable_question_package_version_items_source_revision_identity_fkey"
    FOREIGN KEY ("source_question_id", "source_question_revision_id")
    REFERENCES "question_revisions"("question_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tryout_items"
  ADD CONSTRAINT "tryout_items_source_revision_identity_fkey"
    FOREIGN KEY ("source_question_id", "source_question_revision_id")
    REFERENCES "question_revisions"("question_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "assessment_guard_source_revision_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_question_id UUID;
  revision_digest VARCHAR(128);
BEGIN
  IF NEW.source_question_revision_id IS NULL THEN
    IF NEW.source_question_id IS NOT NULL
      OR NEW.source_content_digest IS NOT NULL
      OR NEW.source_revision_provenance IS NOT NULL
    THEN
      RAISE EXCEPTION 'Source QuestionRevision snapshot fields must be complete' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT question_id, content_digest
  INTO revision_question_id, revision_digest
  FROM question_revisions
  WHERE id = NEW.source_question_revision_id;
  IF revision_question_id IS NULL
    OR revision_question_id IS DISTINCT FROM NEW.source_question_id
    OR revision_digest IS DISTINCT FROM NEW.source_content_digest
  THEN
    RAISE EXCEPTION 'Source snapshot must match its QuestionRevision identity and digest' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_revision_provenance IS NULL THEN
    RAISE EXCEPTION 'Source snapshot provenance is required when a QuestionRevision is present' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "standalone_quiz_items_source_revision_snapshot_guard"
BEFORE INSERT OR UPDATE ON "standalone_quiz_items"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_source_revision_snapshot"();
CREATE TRIGGER "reusable_question_package_items_source_revision_snapshot_guard"
BEFORE INSERT OR UPDATE ON "reusable_question_package_items"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_source_revision_snapshot"();
CREATE TRIGGER "reusable_question_package_version_items_source_revision_snapshot_guard"
BEFORE INSERT OR UPDATE ON "reusable_question_package_version_items"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_source_revision_snapshot"();
CREATE TRIGGER "tryout_items_source_revision_snapshot_guard"
BEFORE INSERT OR UPDATE ON "tryout_items"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_source_revision_snapshot"();

CREATE OR REPLACE FUNCTION "assessment_reject_question_revision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  option_count INTEGER;
  correct_count INTEGER;
  options_ready BOOLEAN;
  expected_digest VARCHAR(128);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QuestionRevision rows are append-only' USING ERRCODE = '55000';
  END IF;

  IF TG_OP <> 'INSERT' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'QuestionRevision identity and author are immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.status IN ('ready', 'retired') THEN
    IF NEW.stem IS DISTINCT FROM OLD.stem
      OR NEW.question_type IS DISTINCT FROM OLD.question_type
      OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
      OR NEW.explanation IS DISTINCT FROM OLD.explanation
      OR NEW.prompt_asset_id IS DISTINCT FROM OLD.prompt_asset_id
      OR NEW.explanation_asset_id IS DISTINCT FROM OLD.explanation_asset_id
      OR NEW.content_digest IS DISTINCT FROM OLD.content_digest
      OR NEW.provenance IS DISTINCT FROM OLD.provenance
      OR (OLD.status = 'retired' AND NEW.status IS DISTINCT FROM OLD.status)
      OR (OLD.status = 'ready' AND NEW.status NOT IN ('ready', 'retired'))
    THEN
      RAISE EXCEPTION 'Ready or retired QuestionRevision content is immutable' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.status = 'ready' THEN
    SELECT encode(
      digest(
        concat(
          encode(convert_to('question-revision-digest-v1', 'UTF8'), 'hex'), ':',
          encode(convert_to(NEW.difficulty::text, 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(NEW.explanation, ''), 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(NEW.explanation_asset_id::text, ''), 'UTF8'), 'hex'), ':',
          COALESCE((
            SELECT string_agg(
              concat(
                encode(convert_to(COALESCE(revision_option.asset_id::text, ''), 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.content, 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.is_correct::text, 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.label, 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.sort_order::text, 'UTF8'), 'hex')
              ), ':' ORDER BY revision_option.sort_order, revision_option.label
            )
            FROM question_revision_options revision_option
            WHERE revision_option.question_revision_id = NEW.id
          ), ''), ':',
          encode(convert_to(NEW.stem, 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(NEW.prompt_asset_id::text, ''), 'UTF8'), 'hex'), ':',
          encode(convert_to(NEW.question_type::text, 'UTF8'), 'hex')
        ),
        'sha256'
      ),
      'hex'
    ) INTO expected_digest;
    IF NEW.content_digest IS DISTINCT FROM expected_digest THEN
      RAISE EXCEPTION 'QuestionRevision content digest does not match its content' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE is_correct)::int,
           COALESCE(BOOL_AND(BTRIM(content) <> '' AND (asset_id IS NULL OR EXISTS (
             SELECT 1 FROM assets
             WHERE assets.id = question_revision_options.asset_id
               AND assets.state = 'ready'
           ))), TRUE)
      INTO option_count, correct_count, options_ready
      FROM question_revision_options
     WHERE question_revision_id = NEW.id;
    IF BTRIM(NEW.stem) = ''
      OR option_count < 2
      OR option_count > 5
      OR correct_count <> 1
      OR NOT options_ready
      OR (NEW.prompt_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assets WHERE assets.id = NEW.prompt_asset_id AND assets.state = 'ready'))
      OR (NEW.explanation_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assets WHERE assets.id = NEW.explanation_asset_id AND assets.state = 'ready'))
    THEN
      RAISE EXCEPTION 'QuestionRevision does not satisfy Ready content requirements' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_revisions_append_only_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "question_revisions"
FOR EACH ROW EXECUTE FUNCTION "assessment_reject_question_revision_mutation"();

CREATE OR REPLACE FUNCTION "assessment_reject_question_revision_option_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_revision_status question_revision_status;
  new_revision_status question_revision_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO new_revision_status
    FROM question_revisions
    WHERE id = NEW.question_revision_id;
    IF new_revision_status IN ('ready', 'retired') THEN
      RAISE EXCEPTION 'Ready or retired QuestionRevisionOption rows are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    SELECT status INTO old_revision_status
    FROM question_revisions
    WHERE id = OLD.question_revision_id;
    IF old_revision_status IN ('ready', 'retired') THEN
      RAISE EXCEPTION 'Ready or retired QuestionRevisionOption rows are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO old_revision_status
  FROM question_revisions
  WHERE id = OLD.question_revision_id;
  SELECT status INTO new_revision_status
  FROM question_revisions
  WHERE id = NEW.question_revision_id;
  IF old_revision_status IN ('ready', 'retired') OR new_revision_status IN ('ready', 'retired') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.question_revision_id IS DISTINCT FROM OLD.question_revision_id
      OR NEW.label IS DISTINCT FROM OLD.label
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.is_correct IS DISTINCT FROM OLD.is_correct
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
    THEN
      RAISE EXCEPTION 'QuestionRevisionOption content is immutable once the revision is Ready' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_revision_options_append_only_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "question_revision_options"
FOR EACH ROW EXECUTE FUNCTION "assessment_reject_question_revision_option_mutation"();

CREATE OR REPLACE FUNCTION "assessment_guard_question_compatibility_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_status question_revision_status;
BEGIN
  IF NEW.current_revision_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM question_revisions WHERE id = NEW.current_revision_id)
    AND NOT EXISTS (
      SELECT 1 FROM question_revisions revision
      WHERE revision.id = NEW.current_revision_id AND revision.question_id = NEW.id
    )
  THEN
    RAISE EXCEPTION 'Question.current_revision_id must belong to the same Question' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.current_revision_id IS NOT NULL
    AND NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
  THEN
    SELECT status INTO revision_status FROM question_revisions WHERE id = OLD.current_revision_id;
    IF revision_status IN ('ready', 'retired')
      AND (NEW.stem IS DISTINCT FROM OLD.stem
        OR NEW.question_type IS DISTINCT FROM OLD.question_type
        OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
        OR NEW.explanation IS DISTINCT FROM OLD.explanation
        OR NEW.prompt_asset_id IS DISTINCT FROM OLD.prompt_asset_id
        OR NEW.explanation_asset_id IS DISTINCT FROM OLD.explanation_asset_id)
    THEN
      RAISE EXCEPTION 'Ready Question content requires a new QuestionRevision' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "questions_revision_compatibility_guard"
BEFORE INSERT OR UPDATE ON "questions"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_question_compatibility_mutation"();

CREATE OR REPLACE FUNCTION "assessment_guard_question_option_compatibility_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  revision_status question_revision_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT revision.status INTO revision_status
    FROM questions question
    JOIN question_revisions revision ON revision.id = question.current_revision_id
    WHERE question.id = OLD.question_id;
  ELSE
    SELECT revision.status INTO revision_status
    FROM questions question
    JOIN question_revisions revision ON revision.id = question.current_revision_id
    WHERE question.id = NEW.question_id;
  END IF;

  IF TG_OP = 'INSERT' AND revision_status IN ('ready', 'retired') THEN
    RAISE EXCEPTION 'Legacy QuestionOption rows are immutable while the current QuestionRevision is Ready' USING ERRCODE = '55000';
  ELSIF TG_OP = 'UPDATE' AND revision_status IN ('ready', 'retired') THEN
    IF NEW.question_id IS DISTINCT FROM OLD.question_id
      OR NEW.label IS DISTINCT FROM OLD.label
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.is_correct IS DISTINCT FROM OLD.is_correct
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
    THEN
      RAISE EXCEPTION 'Legacy QuestionOption rows are immutable while the current QuestionRevision is Ready' USING ERRCODE = '55000';
    END IF;
  ELSIF revision_status IN ('ready', 'retired') THEN
    RAISE EXCEPTION 'Legacy QuestionOption rows are immutable while the current QuestionRevision is Ready' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_options_revision_compatibility_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "question_options"
FOR EACH ROW EXECUTE FUNCTION "assessment_guard_question_option_compatibility_mutation"();
