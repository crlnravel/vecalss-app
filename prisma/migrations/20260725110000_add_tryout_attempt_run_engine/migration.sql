-- A delivery-scoped attempt replaces the old tryout-wide learner session.
-- This migration intentionally assumes the prior guarded cutover's empty learner
-- Tryout history; it is a forward schema migration and is not applied by this ticket.
CREATE TYPE tryout_attempt_test_run_status AS ENUM ('pending', 'active', 'sealed', 'expired');

ALTER TABLE tryout_sessions RENAME TO tryout_attempts;
ALTER TABLE tryout_attempts RENAME CONSTRAINT tryout_sessions_pkey TO tryout_attempts_pkey;

-- The old table retained a tryout/student uniqueness. Delivery assignment is now
-- the retake identity, so add the delivery/admission links before replacing it.
ALTER TABLE tryout_attempts
  ADD COLUMN delivery_session_id uuid NOT NULL REFERENCES tryout_delivery_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN admission_id uuid NOT NULL REFERENCES tryout_admissions(id) ON DELETE RESTRICT,
  ADD COLUMN release_policy_snapshot jsonb NOT NULL,
  ADD COLUMN content_snapshot jsonb NOT NULL;
ALTER TABLE tryout_attempts DROP CONSTRAINT IF EXISTS tryout_sessions_tryout_id_student_id_key;
ALTER TABLE tryout_attempts ADD CONSTRAINT tryout_attempts_delivery_session_student_key UNIQUE (delivery_session_id, student_id);
CREATE INDEX tryout_attempts_delivery_session_status_idx ON tryout_attempts(delivery_session_id, status);

CREATE TABLE tryout_attempt_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES tryout_attempts(id) ON DELETE RESTRICT,
  tryout_section_id uuid NOT NULL REFERENCES tryout_sections(id) ON DELETE RESTRICT,
  sequence_no integer NOT NULL,
  status tryout_attempt_test_run_status NOT NULL DEFAULT 'pending',
  server_started_at timestamptz,
  server_deadline_at timestamptz,
  sealed_at timestamptz,
  content_snapshot jsonb NOT NULL,
  calculation_input jsonb,
  calculation_result jsonb,
  calculation_version varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, tryout_section_id),
  UNIQUE (attempt_id, sequence_no)
);
CREATE INDEX tryout_attempt_test_runs_attempt_status_idx ON tryout_attempt_test_runs(attempt_id, status);
CREATE UNIQUE INDEX tryout_attempt_test_runs_one_active_idx
  ON tryout_attempt_test_runs(attempt_id) WHERE status = 'active';

ALTER TABLE tryout_answers RENAME COLUMN session_id TO attempt_id;
ALTER TABLE tryout_answers ADD COLUMN attempt_test_run_id uuid NOT NULL REFERENCES tryout_attempt_test_runs(id) ON DELETE RESTRICT;
ALTER TABLE tryout_answers DROP CONSTRAINT IF EXISTS tryout_answers_session_id_tryout_item_id_key;
ALTER TABLE tryout_answers ADD CONSTRAINT tryout_answers_run_item_key UNIQUE (attempt_test_run_id, tryout_item_id);

ALTER TABLE tryout_score_breakdowns RENAME COLUMN session_id TO attempt_id;
ALTER TABLE tryout_score_breakdowns DROP CONSTRAINT IF EXISTS tryout_score_breakdowns_session_id_subtest_id_topic_id_key;
ALTER TABLE tryout_score_breakdowns ADD CONSTRAINT tryout_score_breakdowns_attempt_subtest_topic_key UNIQUE (attempt_id, subtest_id, topic_id);
