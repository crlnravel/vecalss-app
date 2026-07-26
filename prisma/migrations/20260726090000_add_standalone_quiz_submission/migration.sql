ALTER TABLE "standalone_quiz_attempts"
  ADD COLUMN "correct_count" INTEGER,
  ADD COLUMN "score" INTEGER,
  ADD COLUMN "submitted_at" TIMESTAMPTZ;

CREATE TABLE "standalone_quiz_answers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attempt_id" UUID NOT NULL,
  "quiz_item_id" UUID NOT NULL,
  "selected_option_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "standalone_quiz_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "standalone_quiz_answers_attempt_id_quiz_item_id_key"
  ON "standalone_quiz_answers"("attempt_id", "quiz_item_id");
CREATE INDEX "standalone_quiz_answers_attempt_id_idx"
  ON "standalone_quiz_answers"("attempt_id");

ALTER TABLE "standalone_quiz_answers"
  ADD CONSTRAINT "standalone_quiz_answers_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "standalone_quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_answers"
  ADD CONSTRAINT "standalone_quiz_answers_quiz_item_id_fkey"
  FOREIGN KEY ("quiz_item_id") REFERENCES "standalone_quiz_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_answers"
  ADD CONSTRAINT "standalone_quiz_answers_selected_option_id_fkey"
  FOREIGN KEY ("selected_option_id") REFERENCES "standalone_quiz_item_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
