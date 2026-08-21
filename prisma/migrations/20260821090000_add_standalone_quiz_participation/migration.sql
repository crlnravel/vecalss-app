-- Canonical Kuis attempt boundary.
--
-- StandaloneQuizParticipation is the stable learner/Kuis relationship. Existing
-- attempt and answer UUIDs are deliberately retained while the old direct
-- quiz/student ownership is replaced by participation_id.

CREATE TYPE "standalone_quiz_score_policy" AS ENUM (
  'highest',
  'latest',
  'first',
  'average'
);

CREATE TYPE "standalone_quiz_form_behavior" AS ENUM (
  'same',
  'fresh_randomized'
);

CREATE TYPE "standalone_quiz_review_timing" AS ENUM (
  'immediate',
  'after_close',
  'never'
);

CREATE TYPE "standalone_quiz_correct_answer_visibility" AS ENUM (
  'show',
  'hide'
);

ALTER TABLE "standalone_quizzes"
  ADD COLUMN "attempts_allowed" INTEGER DEFAULT 1,
  ADD COLUMN "score_policy" "standalone_quiz_score_policy" NOT NULL DEFAULT 'latest',
  ADD COLUMN "retry_delay_seconds" INTEGER,
  ADD COLUMN "form_behavior" "standalone_quiz_form_behavior" NOT NULL DEFAULT 'same',
  ADD COLUMN "review_timing" "standalone_quiz_review_timing" NOT NULL DEFAULT 'immediate',
  ADD COLUMN "correct_answer_visibility" "standalone_quiz_correct_answer_visibility" NOT NULL DEFAULT 'show';

ALTER TABLE "standalone_quizzes"
  ADD CONSTRAINT "standalone_quizzes_attempts_allowed_check"
    CHECK ("attempts_allowed" IS NULL OR "attempts_allowed" > 0),
  ADD CONSTRAINT "standalone_quizzes_retry_delay_seconds_check"
    CHECK ("retry_delay_seconds" IS NULL OR "retry_delay_seconds" >= 0);

CREATE TABLE "standalone_quiz_participations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "policy_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standalone_quiz_participations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "standalone_quiz_participations"
  ADD CONSTRAINT "standalone_quiz_participations_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "standalone_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_participations_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "standalone_quiz_participations_quiz_id_student_id_key"
  ON "standalone_quiz_participations"("quiz_id", "student_id");
CREATE INDEX "standalone_quiz_participations_student_id_idx"
  ON "standalone_quiz_participations"("student_id");

ALTER TABLE "standalone_quiz_attempts"
  ADD COLUMN "participation_id" UUID,
  ADD COLUMN "attempt_no" INTEGER,
  ADD COLUMN "start_request_id" UUID,
  ADD COLUMN "policy_snapshot" JSONB,
  ADD COLUMN "form_item_order" JSONB,
  ADD COLUMN "form_snapshot" JSONB;

-- Allocate the historical display number deterministically. The UUID is only
-- used as a tie-breaker; neither attempt IDs nor answer IDs are rewritten.
INSERT INTO "standalone_quiz_participations" ("quiz_id", "student_id", "policy_snapshot", "created_at", "updated_at")
SELECT
  "quiz_id",
  "student_id",
  (
    SELECT jsonb_build_object(
      'attemptsAllowed', q."attempts_allowed",
      'correctAnswerVisibility', q."correct_answer_visibility",
      'formBehavior', q."form_behavior",
      'retryDelaySeconds', q."retry_delay_seconds",
      'reviewTiming', q."review_timing",
      'scorePolicy', q."score_policy"
    )
    FROM "standalone_quizzes" q
    WHERE q."id" = attempts."quiz_id"
  ),
  MIN(attempts."created_at"),
  MAX(attempts."updated_at")
FROM "standalone_quiz_attempts" attempts
GROUP BY attempts."quiz_id", attempts."student_id";

WITH "numbered_attempts" AS (
  SELECT
    a."id",
    p."id" AS "participation_id",
    ROW_NUMBER() OVER (
      PARTITION BY a."quiz_id", a."student_id"
      ORDER BY a."created_at" ASC, a."id" ASC
    )::INTEGER AS "attempt_no"
  FROM "standalone_quiz_attempts" a
  JOIN "standalone_quiz_participations" p
    ON p."quiz_id" = a."quiz_id"
   AND p."student_id" = a."student_id"
)
UPDATE "standalone_quiz_attempts" a
SET
  "participation_id" = numbered."participation_id",
  "attempt_no" = numbered."attempt_no"
FROM "numbered_attempts" numbered
WHERE a."id" = numbered."id";

-- Freeze the policy and item order used by each historical attempt. New Starts
-- write the same snapshots in application code before the attempt is exposed.
UPDATE "standalone_quiz_attempts" a
SET
  "policy_snapshot" = jsonb_build_object(
    'attemptsAllowed', q."attempts_allowed",
    'correctAnswerVisibility', q."correct_answer_visibility",
    'formBehavior', q."form_behavior",
    'retryDelaySeconds', q."retry_delay_seconds",
    'reviewTiming', q."review_timing",
    'scorePolicy', q."score_policy"
  ),
  "form_item_order" = COALESCE(
    (
      SELECT jsonb_agg(items."id" ORDER BY items."sort_order")
      FROM "standalone_quiz_items" items
      WHERE items."quiz_id" = q."id"
    ),
    '[]'::jsonb
  ),
  "form_snapshot" = COALESCE(
    (
      SELECT jsonb_build_object(
        'version', 1,
        'items', jsonb_agg(
          jsonb_build_object(
            'id', items."id",
            'sortOrder', items."sort_order",
            'prompt', items."prompt",
            'explanation', items."explanation",
            'promptAssetId', items."prompt_asset_id",
            'explanationAssetId', items."explanation_asset_id",
            'sourceQuestionId', items."source_question_id",
            'options', COALESCE(
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', options."id",
                    'choiceKey', options."choice_key",
                    'content', options."content",
                    'isCorrect', options."is_correct",
                    'sortOrder', options."sort_order",
                    'assetId', options."asset_id"
                  ) ORDER BY options."sort_order"
                )
                FROM "standalone_quiz_item_options" options
                WHERE options."quiz_item_id" = items."id"
              ),
              '[]'::jsonb
            )
          ) ORDER BY items."sort_order"
        )
      )
      FROM "standalone_quiz_items" items
      WHERE items."quiz_id" = q."id"
    ),
    jsonb_build_object('version', 1, 'items', '[]'::jsonb)
  )
FROM "standalone_quiz_participations" p
JOIN "standalone_quizzes" q ON q."id" = p."quiz_id"
WHERE a."participation_id" = p."id";

ALTER TABLE "standalone_quiz_attempts"
  ALTER COLUMN "participation_id" SET NOT NULL,
  ALTER COLUMN "attempt_no" SET NOT NULL,
  ALTER COLUMN "policy_snapshot" SET NOT NULL,
  ALTER COLUMN "form_item_order" SET NOT NULL,
  ADD CONSTRAINT "standalone_quiz_attempts_participation_id_fkey"
    FOREIGN KEY ("participation_id") REFERENCES "standalone_quiz_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "standalone_quiz_attempts_attempt_no_check"
    CHECK ("attempt_no" > 0);

ALTER TABLE "standalone_quiz_participations"
  ALTER COLUMN "policy_snapshot" SET NOT NULL;

DROP INDEX "standalone_quiz_attempts_quiz_id_student_id_key";
DROP INDEX "standalone_quiz_attempts_student_id_status_idx";
ALTER TABLE "standalone_quiz_attempts"
  DROP CONSTRAINT "standalone_quiz_attempts_quiz_id_fkey",
  DROP CONSTRAINT "standalone_quiz_attempts_student_id_fkey",
  DROP COLUMN "quiz_id",
  DROP COLUMN "student_id";

CREATE UNIQUE INDEX "standalone_quiz_attempts_participation_id_attempt_no_key"
  ON "standalone_quiz_attempts"("participation_id", "attempt_no");
CREATE UNIQUE INDEX "standalone_quiz_attempts_participation_id_start_request_id_key"
  ON "standalone_quiz_attempts"("participation_id", "start_request_id");
CREATE INDEX "standalone_quiz_attempts_participation_id_status_idx"
  ON "standalone_quiz_attempts"("participation_id", "status");
