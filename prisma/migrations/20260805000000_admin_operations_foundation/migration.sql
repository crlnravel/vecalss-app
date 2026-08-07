-- Admin operations foundation is a forward-only cutover. The preflight runs
-- before any uniqueness constraint is added so a deploy fails with a useful
-- remediation message instead of leaving a half-applied schema.
DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%s (%s rows)', normalized_email, row_count),
    '; ' ORDER BY normalized_email
  )
  INTO duplicate_summary
  FROM (
    SELECT lower(btrim(email)) AS normalized_email, count(*)::integer AS row_count
    FROM users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) duplicate_emails;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'admin_operations_preflight_unresolved_duplicate_emails',
      DETAIL = duplicate_summary,
      HINT = 'Resolve each case-insensitive/trimmed duplicate in users.email, then rerun prisma migrate deploy.';
  END IF;

  -- New writes already normalize email. Normalize legacy rows before the
  -- lower-case index so mixed-case rows cannot bypass the invariant.
  UPDATE users
  SET email = lower(btrim(email))
  WHERE email <> lower(btrim(email));
END $$;

CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" (lower("email"));

-- Keep the newest active assignment and leave a stable, non-PII audit trail for
-- every older duplicate that was revoked during the migration.
CREATE TEMP TABLE "admin_operations_duplicate_roles" (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role role_name NOT NULL
);

INSERT INTO "admin_operations_duplicate_roles" (id, user_id, role)
SELECT id, user_id, role
FROM (
  SELECT
    id,
    user_id,
    role,
    row_number() OVER (
      PARTITION BY user_id, role
      ORDER BY assigned_at DESC, id DESC
    ) AS duplicate_rank
  FROM role_assignments
  WHERE revoked_at IS NULL
) ranked
WHERE duplicate_rank > 1;

UPDATE role_assignments assignment
SET revoked_at = now()
FROM "admin_operations_duplicate_roles" duplicate
WHERE assignment.id = duplicate.id
  AND assignment.revoked_at IS NULL;

INSERT INTO audit_logs (
  actor_user_id,
  action,
  target_type,
  target_id,
  metadata
)
SELECT
  NULL,
  'role_assignment.duplicate_revoked',
  'role_assignment',
  duplicate.id,
  jsonb_build_object(
    'userId', duplicate.user_id,
    'role', duplicate.role,
    'errorCode', 'migration_duplicate_active_role'
  )
FROM "admin_operations_duplicate_roles" duplicate;

DROP TABLE "admin_operations_duplicate_roles";

CREATE UNIQUE INDEX "role_assignments_active_user_role_uq"
  ON "role_assignments" ("user_id", "role")
  WHERE "revoked_at" IS NULL;

CREATE TYPE "enrollment_handoff_method" AS ENUM ('invite_link', 'temporary_password');
CREATE TYPE "enrollment_handoff_status" AS ENUM ('pending', 'released', 'completed', 'expired', 'revoked');
CREATE TYPE "enrollment_import_role" AS ENUM ('student', 'tutor');
CREATE TYPE "enrollment_import_status" AS ENUM ('draft', 'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled');
CREATE TYPE "enrollment_import_operation" AS ENUM ('create', 'update', 'none');
CREATE TYPE "enrollment_import_row_status" AS ENUM ('invalid', 'pending', 'processing', 'created', 'updated', 'failed', 'skipped');
CREATE TYPE "enrollment_import_dispatch_status" AS ENUM ('pending', 'enqueued', 'failed');

CREATE TABLE "enrollment_handoffs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "created_by_user_id" UUID,
  "source_import_row_id" UUID,
  "method" "enrollment_handoff_method" NOT NULL,
  "status" "enrollment_handoff_status" NOT NULL DEFAULT 'pending',
  "token_hash" TEXT,
  "secret_envelope" JSONB,
  "expires_at" TIMESTAMPTZ,
  "released_at" TIMESTAMPTZ,
  "acknowledged_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "enrollment_handoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enrollment_handoffs_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "enrollment_handoffs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "enrollment_handoffs_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "enrollment_handoffs_user_status_expiry_idx"
  ON "enrollment_handoffs" ("user_id", "status", "expires_at");
CREATE INDEX "enrollment_handoffs_source_import_row_id_idx"
  ON "enrollment_handoffs" ("source_import_row_id");
CREATE INDEX "enrollment_handoffs_status_expiry_idx"
  ON "enrollment_handoffs" ("status", "expires_at");

CREATE TABLE "enrollment_imports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "role" "enrollment_import_role" NOT NULL,
  "status" "enrollment_import_status" NOT NULL DEFAULT 'draft',
  "source_filename" VARCHAR(120) NOT NULL,
  "content_hash" TEXT NOT NULL,
  "template_version" VARCHAR(40) NOT NULL,
  "row_count" INTEGER NOT NULL,
  "handoff_method" "enrollment_handoff_method",
  "created_by_user_id" UUID NOT NULL,
  "confirmed_by_user_id" UUID,
  "dispatch_generation" INTEGER NOT NULL DEFAULT 0,
  "last_error_code" VARCHAR(80),
  "last_error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_heartbeat_at" TIMESTAMPTZ,

  CONSTRAINT "enrollment_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enrollment_imports_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "enrollment_imports_confirmed_by_user_id_fkey"
    FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "enrollment_imports_status_updated_at_idx"
  ON "enrollment_imports" ("status", "updated_at");

CREATE TABLE "enrollment_import_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "normalized_email" TEXT NOT NULL,
  "operation" "enrollment_import_operation" NOT NULL DEFAULT 'none',
  "status" "enrollment_import_row_status" NOT NULL DEFAULT 'invalid',
  "input_json" JSONB NOT NULL,
  "matched_user_id" UUID,
  "matched_user_updated_at" TIMESTAMPTZ,
  "result_user_id" UUID,
  "handoff_id" UUID,
  "error_code" VARCHAR(80),
  "error_message" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "claim_token" UUID,
  "claim_expires_at" TIMESTAMPTZ,
  "claimed_by" VARCHAR(120),
  "processed_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "enrollment_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enrollment_import_rows_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "enrollment_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "enrollment_import_rows_matched_user_id_fkey"
    FOREIGN KEY ("matched_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "enrollment_import_rows_result_user_id_fkey"
    FOREIGN KEY ("result_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "enrollment_import_rows_handoff_id_fkey"
    FOREIGN KEY ("handoff_id") REFERENCES "enrollment_handoffs"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "enrollment_import_rows_import_id_row_number_key"
    UNIQUE ("import_id", "row_number")
);

CREATE INDEX "enrollment_import_rows_import_status_idx"
  ON "enrollment_import_rows" ("import_id", "status");
CREATE INDEX "enrollment_import_rows_import_email_idx"
  ON "enrollment_import_rows" ("import_id", "normalized_email");
CREATE INDEX "enrollment_import_rows_claim_expires_at_idx"
  ON "enrollment_import_rows" ("claim_expires_at");
CREATE UNIQUE INDEX "enrollment_import_rows_handoff_id_key"
  ON "enrollment_import_rows" ("handoff_id");

CREATE TABLE "enrollment_import_dispatches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "generation" INTEGER NOT NULL,
  "status" "enrollment_import_dispatch_status" NOT NULL DEFAULT 'pending',
  "queue_job_id" VARCHAR(200) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ,
  "claim_token" UUID,
  "claim_expires_at" TIMESTAMPTZ,
  "claimed_by" VARCHAR(120),
  "enqueued_at" TIMESTAMPTZ,
  "last_error_code" VARCHAR(80),
  "last_error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "enrollment_import_dispatches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "enrollment_import_dispatches_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "enrollment_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "enrollment_import_dispatches_import_generation_key"
    UNIQUE ("import_id", "generation"),
  CONSTRAINT "enrollment_import_dispatches_queue_job_id_key"
    UNIQUE ("queue_job_id")
);

CREATE INDEX "enrollment_import_dispatches_claim_idx"
  ON "enrollment_import_dispatches" ("status", "next_attempt_at", "claim_expires_at");

-- The row link is nullable so retention cleanup can delete a row without
-- deleting its handoff. The handoff link is also nullable for backfill rows.
ALTER TABLE "enrollment_handoffs"
  ADD CONSTRAINT "enrollment_handoffs_source_import_row_id_fkey"
  FOREIGN KEY ("source_import_row_id") REFERENCES "enrollment_import_rows"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill only accounts that still require a first-login credential change.
-- A multi-role account gets one account-level handoff, never one secret per
-- role. Disabled/soft-deleted accounts are immediately revoked and carry no
-- recoverable plaintext secret.
INSERT INTO "enrollment_handoffs" (
  "user_id",
  "method",
  "status",
  "secret_envelope",
  "created_by_user_id",
  "created_at",
  "updated_at"
)
SELECT
  user_record.id,
  'temporary_password',
  CASE
    WHEN user_record.status = 'active'::user_status
      AND user_record.soft_deleted_at IS NULL
      THEN 'pending'::enrollment_handoff_status
    ELSE 'revoked'::enrollment_handoff_status
  END,
  NULL,
  NULL,
  now(),
  now()
FROM users user_record
WHERE user_record.must_change_password
  AND (
    user_record.status IN (
      'active'::user_status,
      'disabled'::user_status,
      'soft_deleted'::user_status
    )
    OR user_record.soft_deleted_at IS NOT NULL
  )
  AND EXISTS (
    SELECT 1
    FROM role_assignments assignment
    WHERE assignment.user_id = user_record.id
      AND assignment.revoked_at IS NULL
      AND assignment.role IN ('student'::role_name, 'tutor'::role_name)
  );

-- This is deliberately created after duplicate cleanup and handoff backfill.
-- It is the database-level guard for one pending/released secret per account.
CREATE UNIQUE INDEX "enrollment_handoffs_one_open_user_uq"
  ON "enrollment_handoffs" ("user_id")
  WHERE "status" IN (
    'pending'::enrollment_handoff_status,
    'released'::enrollment_handoff_status
  );
