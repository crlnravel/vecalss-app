-- Standalone tutor-authored quizzes; ModuleQuiz remains tied to learning modules.
CREATE TABLE "standalone_quizzes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(240) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "subject_code" VARCHAR(24) NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "opens_at" TIMESTAMPTZ,
    "closes_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standalone_quizzes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "standalone_quiz_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "correct_key" VARCHAR(64) NOT NULL,
    "explanation" TEXT,
    "origin" VARCHAR(24) NOT NULL,
    "source_id" VARCHAR(240),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standalone_quiz_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "standalone_quiz_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "standalone_quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "standalone_quizzes_slug_key" ON "standalone_quizzes"("slug");
CREATE INDEX "standalone_quizzes_status_opens_at_closes_at_idx" ON "standalone_quizzes"("status", "opens_at", "closes_at");
CREATE INDEX "standalone_quizzes_subject_code_status_idx" ON "standalone_quizzes"("subject_code", "status");
CREATE UNIQUE INDEX "standalone_quiz_items_quiz_id_sort_order_key" ON "standalone_quiz_items"("quiz_id", "sort_order");
CREATE UNIQUE INDEX "standalone_quiz_attempts_quiz_id_student_id_key" ON "standalone_quiz_attempts"("quiz_id", "student_id");
CREATE INDEX "standalone_quiz_attempts_student_id_status_idx" ON "standalone_quiz_attempts"("student_id", "status");

ALTER TABLE "standalone_quizzes" ADD CONSTRAINT "standalone_quizzes_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_items" ADD CONSTRAINT "standalone_quiz_items_quiz_id_fkey"
  FOREIGN KEY ("quiz_id") REFERENCES "standalone_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_attempts" ADD CONSTRAINT "standalone_quiz_attempts_quiz_id_fkey"
  FOREIGN KEY ("quiz_id") REFERENCES "standalone_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "standalone_quiz_attempts" ADD CONSTRAINT "standalone_quiz_attempts_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
