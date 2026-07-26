CREATE TYPE tryout_cat_run_state AS ENUM ('not_applicable', 'ready', 'failed', 'voided');

CREATE TABLE two_pl_question_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  model_version varchar(120) NOT NULL,
  discrimination numeric(10, 6) NOT NULL CHECK (discrimination > 0),
  difficulty numeric(10, 6) NOT NULL,
  approval_state varchar(24) NOT NULL DEFAULT 'approved' CHECK (approval_state = 'approved'),
  recorded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  audit_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, model_version)
);
CREATE INDEX two_pl_question_calibrations_model_approval_idx ON two_pl_question_calibrations(model_version, approval_state);

ALTER TABLE tryout_attempt_test_runs
  ADD COLUMN cat_state tryout_cat_run_state NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN cat_snapshot jsonb,
  ADD COLUMN cat_failure_reason text,
  ADD COLUMN calculation_releaseable boolean NOT NULL DEFAULT false;

CREATE TABLE tryout_cat_resolution_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES tryout_attempt_test_runs(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(32) NOT NULL CHECK (action IN ('retry', 'void')),
  reason text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tryout_cat_resolution_audits_run_created_idx ON tryout_cat_resolution_audits(run_id, created_at);
