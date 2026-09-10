-- Add the durable Kuis authoring boundary without rewriting the existing
-- StandaloneQuiz identity, item snapshots, attempts, or answers.
--
-- The application continues to read the legacy columns until the authoring
-- cutover lands.  Every backfill below is deterministic and preserves the
-- existing UUIDs and scalar answer column for old readers.

CREATE TYPE "standalone_quiz_version_state" AS ENUM (
  'draft',
  'active',
  'superseded'
);

CREATE TYPE "standalone_quiz_version_provenance" AS ENUM (
  'runtime',
  'legacy_migration'
);

CREATE TYPE "standalone_quiz_answer_format" AS ENUM (
  'legacy_scalar',
  'single_option',
  'multiple_options'
);

ALTER TABLE "standalone_quiz_items"
  ADD COLUMN "quiz_version_id" UUID,
  ADD COLUMN "question_type" "question_type" NOT NULL DEFAULT 'single_choice';

ALTER TABLE "standalone_quiz_participations"
  ADD COLUMN "quiz_version_id" UUID;

ALTER TABLE "standalone_quiz_answers"
  ADD COLUMN "selected_option_ids" JSONB,
  ADD COLUMN "answer_format" "standalone_quiz_answer_format" NOT NULL DEFAULT 'legacy_scalar';

CREATE TABLE "standalone_quiz_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "quiz_id" UUID NOT NULL,
  "base_version_id" UUID,
  "state" "standalone_quiz_version_state" NOT NULL DEFAULT 'draft',
  "version_no" INTEGER,
  "title" VARCHAR(220) NOT NULL,
  "description" TEXT,
  "attempts_allowed" INTEGER,
  "score_policy" "standalone_quiz_score_policy" NOT NULL DEFAULT 'latest',
  "retry_delay_seconds" INTEGER,
  "form_behavior" "standalone_quiz_form_behavior" NOT NULL DEFAULT 'same',
  "review_timing" "standalone_quiz_review_timing" NOT NULL DEFAULT 'immediate',
  "correct_answer_visibility" "standalone_quiz_correct_answer_visibility" NOT NULL DEFAULT 'show',
  "source_bank_id" UUID,
  "assembly_mode" "reusable_question_package_mode",
  "assembly_package_version_id" UUID,
  "assembly_definition_digest" VARCHAR(128),
  "assembly_seed" VARCHAR(128),
  "definition_version" VARCHAR(120) NOT NULL DEFAULT 'kuis-assessment-definition-v1',
  "definition_digest" VARCHAR(128),
  "draft_revision" INTEGER,
  "publish_request_id" UUID,
  "published_at" TIMESTAMPTZ,
  "published_by_user_id" UUID,
  "provenance" "standalone_quiz_version_provenance" NOT NULL DEFAULT 'runtime',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "standalone_quiz_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "standalone_quiz_versions_version_no_check"
    CHECK ("version_no" IS NULL OR "version_no" > 0),
  CONSTRAINT "standalone_quiz_versions_attempts_allowed_check"
    CHECK ("attempts_allowed" IS NULL OR "attempts_allowed" > 0),
  CONSTRAINT "standalone_quiz_versions_retry_delay_seconds_check"
    CHECK ("retry_delay_seconds" IS NULL OR "retry_delay_seconds" >= 0)
);

ALTER TABLE "standalone_quiz_versions"
  ADD CONSTRAINT "standalone_quiz_versions_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "standalone_quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_versions_base_version_id_fkey"
    FOREIGN KEY ("base_version_id") REFERENCES "standalone_quiz_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_versions_source_bank_id_fkey"
    FOREIGN KEY ("source_bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_versions_assembly_package_version_id_fkey"
    FOREIGN KEY ("assembly_package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_versions_published_by_user_id_fkey"
    FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "standalone_quiz_versions_quiz_id_version_no_key"
  ON "standalone_quiz_versions"("quiz_id", "version_no");
CREATE UNIQUE INDEX "standalone_quiz_versions_one_active_per_quiz_key"
  ON "standalone_quiz_versions"("quiz_id")
  WHERE "state" = 'active';
CREATE UNIQUE INDEX "standalone_quiz_versions_publish_request_id_key"
  ON "standalone_quiz_versions"("publish_request_id");
CREATE INDEX "standalone_quiz_versions_quiz_id_state_idx"
  ON "standalone_quiz_versions"("quiz_id", "state");
CREATE INDEX "standalone_quiz_versions_source_bank_id_idx"
  ON "standalone_quiz_versions"("source_bank_id");
CREATE INDEX "standalone_quiz_versions_assembly_package_version_id_idx"
  ON "standalone_quiz_versions"("assembly_package_version_id");

-- One version row represents the legacy definition until an explicit draft or
-- publish action creates a new revision.  Archived quizzes remain represented
-- but cannot accidentally become the active version.
INSERT INTO "standalone_quiz_versions" (
  "quiz_id",
  "state",
  "version_no",
  "title",
  "description",
  "attempts_allowed",
  "score_policy",
  "retry_delay_seconds",
  "form_behavior",
  "review_timing",
  "correct_answer_visibility",
  "source_bank_id",
  "assembly_mode",
  "assembly_package_version_id",
  "assembly_definition_digest",
  "assembly_seed",
  "definition_version",
  "draft_revision",
  "published_at",
  "provenance",
  "created_at",
  "updated_at"
)
SELECT
  q."id",
  CASE q."status"
    WHEN 'published'::content_status THEN 'active'::standalone_quiz_version_state
    WHEN 'archived'::content_status THEN 'superseded'::standalone_quiz_version_state
    ELSE 'draft'::standalone_quiz_version_state
  END,
  1,
  q."title",
  q."description",
  q."attempts_allowed",
  q."score_policy",
  q."retry_delay_seconds",
  q."form_behavior",
  q."review_timing",
  q."correct_answer_visibility",
  q."source_bank_id",
  q."assembly_mode",
  q."assembly_package_version_id",
  q."assembly_definition_digest",
  q."assembly_seed",
  'kuis-assessment-definition-v1',
  q."revision",
  CASE WHEN q."status" = 'published'::content_status THEN q."updated_at" ELSE NULL END,
  'legacy_migration'::standalone_quiz_version_provenance,
  q."created_at",
  q."updated_at"
FROM "standalone_quizzes" q;

-- Preserve the current question snapshot and make its answer mode explicit.
-- The source revision is preferred because it is the immutable content
-- boundary already stored on the item; legacy rows without that pointer fall
-- back to the Question row.
UPDATE "standalone_quiz_items" item
SET
  "quiz_version_id" = version."id",
  "question_type" = COALESCE(
    (
      SELECT revision."question_type"
      FROM "question_revisions" revision
      WHERE revision."id" = item."source_question_revision_id"
    ),
    (
      SELECT question."question_type"
      FROM "questions" question
      WHERE question."id" = item."source_question_id"
    ),
    'single_choice'::question_type
  )
FROM "standalone_quiz_versions" version
WHERE version."quiz_id" = item."quiz_id"
  AND version."version_no" = 1;

UPDATE "standalone_quiz_participations" participation
SET "quiz_version_id" = version."id"
FROM "standalone_quiz_versions" version
WHERE version."quiz_id" = participation."quiz_id"
  AND version."version_no" = 1;

UPDATE "standalone_quiz_answers"
SET "selected_option_ids" = jsonb_build_array("selected_option_id"),
    "answer_format" = 'legacy_scalar'::standalone_quiz_answer_format
WHERE "selected_option_id" IS NOT NULL;

CREATE TABLE "standalone_quiz_start_commands" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "quiz_id" UUID NOT NULL,
  "quiz_version_id" UUID,
  "student_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "attempt_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "standalone_quiz_start_commands_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "standalone_quiz_start_commands"
  ADD CONSTRAINT "standalone_quiz_start_commands_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "standalone_quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_start_commands_quiz_version_id_fkey"
    FOREIGN KEY ("quiz_version_id") REFERENCES "standalone_quiz_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_start_commands_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_start_commands_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "standalone_quiz_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "standalone_quiz_start_commands_quiz_id_student_id_request_id_key"
  ON "standalone_quiz_start_commands"("quiz_id", "student_id", "request_id");
CREATE UNIQUE INDEX "standalone_quiz_start_commands_attempt_id_key"
  ON "standalone_quiz_start_commands"("attempt_id");
CREATE INDEX "standalone_quiz_start_commands_quiz_id_student_id_created_at_idx"
  ON "standalone_quiz_start_commands"("quiz_id", "student_id", "created_at");

-- Existing retries become auditable command rows.  Conflicting request IDs
-- are left untouched; the scoped unique key is the future idempotency fence.
INSERT INTO "standalone_quiz_start_commands" (
  "quiz_id",
  "quiz_version_id",
  "student_id",
  "request_id",
  "attempt_id",
  "created_at"
)
SELECT
  participation."quiz_id",
  participation."quiz_version_id",
  participation."student_id",
  attempt."start_request_id",
  attempt."id",
  attempt."created_at"
FROM "standalone_quiz_attempts" attempt
JOIN "standalone_quiz_participations" participation
  ON participation."id" = attempt."participation_id"
WHERE attempt."start_request_id" IS NOT NULL
ON CONFLICT ("quiz_id", "student_id", "request_id") DO NOTHING;

ALTER TABLE "standalone_quiz_items"
  ADD CONSTRAINT "standalone_quiz_items_quiz_version_id_fkey"
    FOREIGN KEY ("quiz_version_id") REFERENCES "standalone_quiz_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_participations"
  ADD CONSTRAINT "standalone_quiz_participations_quiz_version_id_fkey"
    FOREIGN KEY ("quiz_version_id") REFERENCES "standalone_quiz_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "standalone_quiz_items_quiz_version_id_sort_order_idx"
  ON "standalone_quiz_items"("quiz_version_id", "sort_order");
CREATE INDEX "standalone_quiz_participations_quiz_version_id_student_id_idx"
  ON "standalone_quiz_participations"("quiz_version_id", "student_id");
