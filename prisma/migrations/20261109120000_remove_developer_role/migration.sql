-- MS-23: retire the developer role. Every developer becomes an admin with every
-- admin power; the role value is then removed from the database type.
--
-- Forward-only. Nothing here touches the second factor: user_mfa_factors,
-- mfa_recovery_codes and auth_sessions are not read or written, so a converted
-- developer keeps their authenticator and any session that already passed it.
-- The assignment keeps its id and assigned_at, so a verified session stays
-- verified (a role granted after verification forces a new check; this one was
-- granted before it). A converted account with no factor yet enrolls like any
-- new admin.
--
-- One transaction: either every developer is converted and the type is
-- recreated, or nothing changes.

BEGIN;

-- Leave a record for every assignment this migration touches. audit_logs is
-- append-only; inserting is allowed, and its triggers are not altered.
CREATE TEMP TABLE "ms23_developer_assignments" AS
SELECT
  assignment.id,
  assignment.user_id,
  assignment.assigned_at,
  assignment.revoked_at,
  CASE
    WHEN assignment.revoked_at IS NOT NULL THEN 'revoked_history_removed'
    WHEN EXISTS (
      SELECT 1 FROM role_assignments admin_assignment
      WHERE admin_assignment.user_id = assignment.user_id
        AND admin_assignment.role = 'admin'
        AND admin_assignment.revoked_at IS NULL
    ) THEN 'merged_into_existing_admin'
    ELSE 'converted_to_admin'
  END AS outcome
FROM role_assignments assignment
WHERE assignment.role = 'developer';

INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
SELECT
  NULL,
  'role_assignment.developer_retired',
  'role_assignment',
  id,
  jsonb_build_object(
    'userId', user_id,
    'outcome', outcome,
    'assignedAt', assigned_at,
    'revokedAt', revoked_at
  )
FROM "ms23_developer_assignments";

-- An active developer with no active admin assignment becomes an admin in place.
UPDATE role_assignments assignment
SET role = 'admin'
FROM "ms23_developer_assignments" retired
WHERE assignment.id = retired.id
  AND retired.outcome = 'converted_to_admin';

-- An active developer who is already an admin keeps the admin assignment (the
-- unique index allows one active assignment per role), and a revoked developer
-- assignment grants nothing; both are dropped so no row names the old value.
DELETE FROM role_assignments assignment
USING "ms23_developer_assignments" retired
WHERE assignment.id = retired.id
  AND retired.outcome IN ('merged_into_existing_admin', 'revoked_history_removed');

DROP TABLE "ms23_developer_assignments";

-- PostgreSQL cannot drop a value from an enum, so the type is recreated without
-- it. role_assignments.role is the only column of this type; DROP TYPE (no
-- CASCADE) fails the whole migration if anything else still depends on it.
ALTER TYPE "role_name" RENAME TO "role_name_old";
CREATE TYPE "role_name" AS ENUM ('student', 'tutor', 'admin', 'affiliator');
ALTER TABLE "role_assignments" ALTER COLUMN "role" TYPE "role_name" USING ("role"::text::"role_name");
DROP TYPE "role_name_old";

COMMIT;
