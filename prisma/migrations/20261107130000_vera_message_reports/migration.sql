-- CreateEnum
CREATE TYPE "vera_message_report_reason" AS ENUM ('wrong_answer', 'not_my_context', 'inappropriate', 'other');

-- CreateTable
CREATE TABLE "vera_message_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "message_id" VARCHAR(64) NOT NULL,
    "reason" "vera_message_report_reason" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vera_message_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vera_message_reports_conversation_id_idx" ON "vera_message_reports"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vera_message_reports_student_id_message_id_key" ON "vera_message_reports"("student_id", "message_id");

-- AddForeignKey
ALTER TABLE "vera_message_reports" ADD CONSTRAINT "vera_message_reports_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vera_message_reports" ADD CONSTRAINT "vera_message_reports_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "vera_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
