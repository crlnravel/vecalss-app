-- Multiple accepted Start/resume keys can refer to the same attempt. Request
-- identity and all foreign keys remain unchanged.
DROP INDEX "standalone_quiz_start_commands_attempt_id_key";
CREATE INDEX "standalone_quiz_start_commands_attempt_id_idx"
  ON "standalone_quiz_start_commands"("attempt_id");
