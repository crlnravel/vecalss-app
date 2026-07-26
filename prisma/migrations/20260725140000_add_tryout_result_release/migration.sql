-- Result release is a delivery-session boundary. `automatic_at_end` remains
-- the persisted name for the participant-facing "after session close" policy.
ALTER TYPE tryout_result_release_policy ADD VALUE IF NOT EXISTS 'immediate';

ALTER TABLE tryout_packages
  ADD COLUMN default_result_release_policy tryout_result_release_policy NOT NULL DEFAULT 'automatic_at_end';

ALTER TABLE tryout_delivery_sessions
  ADD COLUMN released_at timestamptz,
  ADD COLUMN released_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX tryout_delivery_sessions_release_idx
  ON tryout_delivery_sessions (tryout_id, released_at);
