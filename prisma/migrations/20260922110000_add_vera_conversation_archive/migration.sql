-- Vera learner conversation archive state. Archiving is reversible and is
-- intentionally separate from deletion_state, which remains the privacy and
-- lifecycle purge authority.
ALTER TABLE "ai_conversations"
  ADD COLUMN "archived_at" TIMESTAMPTZ;

CREATE INDEX "ai_conversations_student_id_archived_at_updated_at_idx"
  ON "ai_conversations"("student_id", "archived_at", "updated_at");
