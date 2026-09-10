-- Ticket 03: preserve the Tryout/CBT answer mode and selected option set.
-- Existing rows remain valid through the single-choice defaults and scalar
-- projection; CAT runtime continues to read the scalar field only.

ALTER TABLE "tryout_items"
  ADD COLUMN "question_type" "question_type" NOT NULL DEFAULT 'single_choice';

UPDATE "tryout_items" item
SET "question_type" = COALESCE(
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
);

ALTER TABLE "tryout_answers"
  ADD COLUMN "selected_option_ids" JSONB;

UPDATE "tryout_answers"
SET "selected_option_ids" = jsonb_build_array("selected_option_id")
WHERE "selected_option_id" IS NOT NULL;
