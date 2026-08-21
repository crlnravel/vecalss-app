-- Managed preview subjects are system fixtures, never ordinary enrollments.
-- Keep the marker nullable for human accounts while making each purpose
-- globally unique (PostgreSQL permits multiple NULL values in a unique index).
ALTER TABLE "users"
  ADD COLUMN "preview_purpose" VARCHAR(80);

CREATE UNIQUE INDEX "users_preview_purpose_key"
  ON "users" ("preview_purpose")
  WHERE "preview_purpose" IS NOT NULL;

-- Reserve the original fixture identity at migration time. This gives the
-- repair/seed path a durable anchor: a later missing row is a recovery fault,
-- never permission to silently create a replacement account.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "email" = 'admin-student-preview@vecalss.local'
      AND "id" <> '00000000-0000-4000-8000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'admin_student_preview_fixture_email_conflict',
      HINT = 'Move the conflicting account before applying the preview foundation migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "preview_purpose" = 'admin.student-preview'
      AND "id" <> '00000000-0000-4000-8000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'admin_student_preview_fixture_identity_conflict',
      HINT = 'Restore the original preview fixture UUID before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "id" = '00000000-0000-4000-8000-000000000001'::uuid
      AND "preview_purpose" IS DISTINCT FROM 'admin.student-preview'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'admin_student_preview_fixture_uuid_conflict',
      HINT = 'Restore the original preview fixture UUID before applying this migration.';
  END IF;
END $$;

INSERT INTO "users" (
  "id",
  "email",
  "full_name",
  "password_hash",
  "must_change_password",
  "preview_purpose",
  "status"
)
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'admin-student-preview@vecalss.local',
  'Alya Preview',
  'managed-preview-disabled',
  TRUE,
  'admin.student-preview',
  'active'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "role_assignments" ("user_id", "role")
VALUES ('00000000-0000-4000-8000-000000000001'::uuid, 'student'::role_name)
ON CONFLICT DO NOTHING;

INSERT INTO "student_profiles" ("user_id", "display_name", "onboarding_status", "timezone")
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'Alya Preview',
  'completed'::onboarding_status,
  'Asia/Jakarta'
)
ON CONFLICT ("user_id") DO NOTHING;

-- Generic user lifecycle code must not be able to mutate or remove a managed
-- preview identity. The explicit seed/operations repair path opts in only for
-- its own transaction with SET LOCAL app.admin_student_preview_repair = 'on'.
-- Other account fields remain mutable for narrowly scoped system maintenance,
-- but marker, credential, and lifecycle changes fail closed here as a
-- database backstop behind the application guards.
CREATE OR REPLACE FUNCTION "protect_managed_preview_user"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."preview_purpose" IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = 'managed_preview_fixture_lifecycle_forbidden',
        HINT = 'Restore the original fixture through the approved preview repair operation.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."preview_purpose" IS NOT NULL
      AND current_setting('app.admin_student_preview_repair', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = 'managed_preview_fixture_lifecycle_forbidden',
        HINT = 'Use the approved preview seed/repair operation for fixture maintenance.';
    END IF;
    RETURN NEW;
  END IF;

  IF current_setting('app.admin_student_preview_repair', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD."preview_purpose" IS NOT NULL OR NEW."preview_purpose" IS NOT NULL THEN
    IF OLD."preview_purpose" IS DISTINCT FROM NEW."preview_purpose"
      OR OLD."status" IS DISTINCT FROM NEW."status"
      OR OLD."soft_deleted_at" IS DISTINCT FROM NEW."soft_deleted_at"
      OR OLD."password_hash" IS DISTINCT FROM NEW."password_hash"
      OR OLD."password_updated_at" IS DISTINCT FROM NEW."password_updated_at"
      OR OLD."must_change_password" IS DISTINCT FROM NEW."must_change_password" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'insufficient_privilege',
        MESSAGE = 'managed_preview_fixture_lifecycle_forbidden',
        HINT = 'Use the approved preview seed/repair operation for fixture maintenance.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "users_protect_managed_preview_user"
BEFORE INSERT OR UPDATE OR DELETE ON "users"
FOR EACH ROW
EXECUTE FUNCTION "protect_managed_preview_user"();
