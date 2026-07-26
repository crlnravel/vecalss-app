-- Delivery configuration is distinct from the legacy learner TryoutSession row.
-- Creating, scheduling, assigning, and opening these rows never changes Tryout content.
CREATE TYPE tryout_admission_mode AS ENUM ('open', 'approval_required', 'invitation_only');
CREATE TYPE tryout_admission_status AS ENUM ('pending', 'active', 'rejected', 'revoked');
CREATE TYPE tryout_delivery_session_status AS ENUM ('draft', 'active', 'closed', 'archived');
CREATE TYPE tryout_result_release_policy AS ENUM ('inherit', 'manual', 'automatic_at_end');
CREATE TYPE tryout_ranking_rule AS ENUM ('none', 'national', 'cohort');
CREATE TYPE tryout_assignment_status AS ENUM ('active', 'revoked');

ALTER TABLE tryout_packages
  ADD COLUMN admission_mode tryout_admission_mode NOT NULL DEFAULT 'open';

CREATE TABLE tryout_delivery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id uuid NOT NULL REFERENCES tryout_packages(id) ON DELETE RESTRICT,
  name varchar(180) NOT NULL,
  available_from timestamptz NOT NULL,
  available_until timestamptz NOT NULL,
  result_release_policy tryout_result_release_policy NOT NULL DEFAULT 'inherit',
  ranking_rule tryout_ranking_rule NOT NULL DEFAULT 'none',
  is_default_open_registration boolean NOT NULL DEFAULT false,
  status tryout_delivery_session_status NOT NULL DEFAULT 'draft',
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tryout_delivery_session_window_check CHECK (available_until > available_from),
  UNIQUE (tryout_id, name)
);
CREATE INDEX tryout_delivery_sessions_availability_idx ON tryout_delivery_sessions(tryout_id, status, available_from, available_until);
CREATE UNIQUE INDEX tryout_delivery_sessions_one_default_open_registration_idx
  ON tryout_delivery_sessions(tryout_id) WHERE is_default_open_registration;

CREATE TABLE tryout_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id uuid NOT NULL REFERENCES tryout_packages(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status tryout_admission_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tryout_id, student_id)
);
CREATE INDEX tryout_admissions_student_status_idx ON tryout_admissions(student_id, status);

CREATE TABLE tryout_delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES tryout_admissions(id) ON DELETE RESTRICT,
  delivery_session_id uuid NOT NULL REFERENCES tryout_delivery_sessions(id) ON DELETE RESTRICT,
  status tryout_assignment_status NOT NULL DEFAULT 'active',
  assigned_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  UNIQUE (admission_id, delivery_session_id)
);
CREATE INDEX tryout_delivery_assignments_session_status_idx ON tryout_delivery_assignments(delivery_session_id, status);

CREATE TABLE tryout_delivery_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tryout_id uuid NOT NULL REFERENCES tryout_packages(id) ON DELETE RESTRICT,
  delivery_session_id uuid REFERENCES tryout_delivery_sessions(id) ON DELETE RESTRICT,
  admission_id uuid,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(100) NOT NULL,
  reason text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tryout_delivery_audits_tryout_created_idx ON tryout_delivery_audits(tryout_id, created_at);
CREATE INDEX tryout_delivery_audits_admission_created_idx ON tryout_delivery_audits(admission_id, created_at);
