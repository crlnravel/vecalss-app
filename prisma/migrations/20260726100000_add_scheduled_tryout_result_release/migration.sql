-- Scheduled release is session-specific. Manual release remains an explicit
-- operator action and never acquires an implicit schedule.
ALTER TYPE tryout_result_release_policy ADD VALUE IF NOT EXISTS 'scheduled';

ALTER TABLE tryout_delivery_sessions
  ADD COLUMN scheduled_release_at timestamptz;

ALTER TABLE tryout_delivery_sessions
  ADD CONSTRAINT tryout_delivery_sessions_scheduled_release_check
  CHECK (
    (result_release_policy::text = 'scheduled' AND scheduled_release_at IS NOT NULL AND scheduled_release_at >= available_until)
    OR
    (result_release_policy::text <> 'scheduled' AND scheduled_release_at IS NULL)
  );

ALTER TABLE tryout_packages
  ADD CONSTRAINT tryout_packages_default_release_not_scheduled_check
  CHECK (default_result_release_policy::text <> 'scheduled');

CREATE INDEX tryout_delivery_sessions_scheduled_release_idx
  ON tryout_delivery_sessions (scheduled_release_at)
  WHERE scheduled_release_at IS NOT NULL;
