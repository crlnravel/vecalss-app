-- A Tryout has exactly one Sesi Tryout, and a student has at most one attempt
-- per Tryout. The product is pre-release and its development/staging data is
-- disposable, so legacy multi-session data is resolved by keeping ONE session
-- per Tryout and removing the others together with everything that hangs off
-- them (assignments, attempts, runs, answers, score breakdowns, integrity
-- events). Audit rows are kept and merely detached from the removed sessions.
-- The kept session is the one named 'Sesi utama', else an active one, else
-- the earliest. Databases with real history must NOT run this migration
-- unchanged; take a backup or reset instead.

-- One statement, so the temporary tables live for the whole cleanup.
DO $$
BEGIN
  CREATE TEMP TABLE _single_session_removed ON COMMIT DROP AS
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY tryout_id
        ORDER BY (name = 'Sesi utama') DESC, (status = 'active') DESC, available_from ASC, created_at ASC, id ASC
      ) AS rank_in_tryout
    FROM tryout_delivery_sessions
  ) ranked
  WHERE rank_in_tryout > 1;

  CREATE TEMP TABLE _single_session_removed_attempts ON COMMIT DROP AS
  SELECT id FROM tryout_attempts WHERE delivery_session_id IN (SELECT id FROM _single_session_removed);

  DELETE FROM tryout_integrity_events
  WHERE run_id IN (SELECT id FROM tryout_attempt_test_runs WHERE attempt_id IN (SELECT id FROM _single_session_removed_attempts));
  DELETE FROM tryout_answers WHERE attempt_id IN (SELECT id FROM _single_session_removed_attempts);
  DELETE FROM tryout_score_breakdowns WHERE attempt_id IN (SELECT id FROM _single_session_removed_attempts);
  DELETE FROM tryout_attempt_test_runs WHERE attempt_id IN (SELECT id FROM _single_session_removed_attempts);
  -- student_subtest_performance rows reference attempts with ON DELETE SET NULL.
  DELETE FROM tryout_attempts WHERE id IN (SELECT id FROM _single_session_removed_attempts);
  DELETE FROM tryout_delivery_assignments WHERE delivery_session_id IN (SELECT id FROM _single_session_removed);
  UPDATE tryout_delivery_audits SET delivery_session_id = NULL WHERE delivery_session_id IN (SELECT id FROM _single_session_removed);

  -- The restart table references sessions, so it must be gone before they are.
  DROP TRIGGER IF EXISTS "admin_preview_tryout_restarts_scope_guard" ON "admin_preview_tryout_restarts";
  DROP TABLE IF EXISTS "admin_preview_tryout_restarts";

  DELETE FROM tryout_delivery_sessions WHERE id IN (SELECT id FROM _single_session_removed);
END
$$;

-- The admin student-preview restart created extra sessions and assignments; it
-- no longer exists. Its table is dropped above, so drop its helper function.
DROP FUNCTION IF EXISTS "protect_admin_preview_tryout_restart_scope"();

-- The preview-assignment key guard only existed to support restart.
DROP TRIGGER IF EXISTS "tryout_delivery_assignments_preview_state_guard" ON "tryout_delivery_assignments";
DROP FUNCTION IF EXISTS "protect_preview_assignment_state"();
DROP INDEX IF EXISTS "tryout_delivery_assignments_preview_current_key_key";
ALTER TABLE "tryout_delivery_assignments" DROP COLUMN IF EXISTS "preview_current_key";

-- One session per Tryout replaces per-Tryout names and the default flag.
DROP INDEX IF EXISTS "tryout_delivery_sessions_one_default_open_registration_idx";
ALTER TABLE "tryout_delivery_sessions" DROP COLUMN IF EXISTS "is_default_open_registration";
ALTER TABLE "tryout_delivery_sessions" DROP CONSTRAINT IF EXISTS "tryout_delivery_sessions_tryout_id_name_key";
DROP INDEX IF EXISTS "tryout_delivery_sessions_tryout_id_name_key";
CREATE UNIQUE INDEX "tryout_delivery_sessions_tryout_id_key" ON "tryout_delivery_sessions" ("tryout_id");

-- One attempt per student per Tryout replaces one per session.
ALTER TABLE "tryout_attempts" DROP CONSTRAINT IF EXISTS "tryout_attempts_delivery_session_id_student_id_key";
DROP INDEX IF EXISTS "tryout_attempts_delivery_session_id_student_id_key";
CREATE UNIQUE INDEX "tryout_attempts_tryout_id_student_id_key" ON "tryout_attempts" ("tryout_id", "student_id");
