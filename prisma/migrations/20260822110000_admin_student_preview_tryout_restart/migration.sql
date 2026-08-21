-- Admin student-preview Tryout restarts are a separate, explicit lifecycle.
-- Preserve the existing learner assignment states while making prior preview
-- assignments auditable history instead of revoking/deleting them.
ALTER TYPE "tryout_assignment_status"
  ADD VALUE IF NOT EXISTS 'superseded';

ALTER TABLE "tryout_delivery_assignments"
  ADD COLUMN "preview_current_key" VARCHAR(220);

-- The nullable unique key permits unlimited historical rows while allowing
-- exactly one current assignment for each preview student + Tryout.
CREATE UNIQUE INDEX "tryout_delivery_assignments_preview_current_key_key"
  ON "tryout_delivery_assignments" ("preview_current_key");

-- Backfill only an unambiguous current row. Multiple active rows are an
-- operational inconsistency and must abort the migration rather than choosing
-- a winner. Existing non-preview rows remain keyless.
DO $$
DECLARE
  preview_row RECORD;
  active_count INTEGER;
BEGIN
  FOR preview_row IN
    SELECT a."id", a."admission_id", ad."tryout_id", ad."student_id"
    FROM "tryout_delivery_assignments" a
    JOIN "tryout_admissions" ad ON ad."id" = a."admission_id"
    JOIN "users" u ON u."id" = ad."student_id"
    WHERE u."preview_purpose" = 'admin.student-preview'
      AND a."status" = 'active'::"tryout_assignment_status"
    ORDER BY ad."student_id", ad."tryout_id", a."assigned_at", a."id"
  LOOP
    SELECT count(*)::INTEGER
      INTO active_count
      FROM "tryout_delivery_assignments" a2
      JOIN "tryout_admissions" ad2 ON ad2."id" = a2."admission_id"
      JOIN "users" u2 ON u2."id" = ad2."student_id"
      WHERE u2."preview_purpose" = 'admin.student-preview'
        AND ad2."student_id" = preview_row."student_id"
        AND ad2."tryout_id" = preview_row."tryout_id"
        AND a2."status" = 'active'::"tryout_assignment_status";

    IF active_count > 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'admin_student_preview_multiple_active_assignments',
        DETAIL = format('student=%s tryout=%s', preview_row."student_id", preview_row."tryout_id"),
        HINT = 'Repair preview assignment history before enabling the restart migration.';
    END IF;

    UPDATE "tryout_delivery_assignments"
      SET "preview_current_key" = 'admin.student-preview:' || preview_row."student_id"::text || ':' || preview_row."tryout_id"::text
      WHERE "id" = preview_row."id";
  END LOOP;
END $$;

-- Keep the current-state invariant at the database boundary. Generic
-- registration, manual assignment, retake, or attempt paths cannot create a
-- preview assignment without going through the explicit restart key.
CREATE OR REPLACE FUNCTION "protect_preview_assignment_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  preview_purpose TEXT;
  admission_tryout_id UUID;
  admission_student_id UUID;
  expected_key TEXT;
BEGIN
  SELECT u."preview_purpose", ad."tryout_id", ad."student_id"
    INTO preview_purpose, admission_tryout_id, admission_student_id
    FROM "tryout_admissions" ad
    JOIN "users" u ON u."id" = ad."student_id"
    WHERE ad."id" = NEW."admission_id";

  IF preview_purpose IS NULL THEN
    IF NEW."preview_current_key" IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'preview_current_key_requires_managed_preview_student';
    END IF;
    RETURN NEW;
  END IF;

  IF preview_purpose <> 'admin.student-preview' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'managed_preview_assignment_path_forbidden';
  END IF;

  expected_key := 'admin.student-preview:' || admission_student_id::text || ':' || admission_tryout_id::text;

  IF NEW."status" = 'active'::"tryout_assignment_status" THEN
    IF NEW."preview_current_key" IS DISTINCT FROM expected_key THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'active_preview_assignment_requires_current_key',
        DETAIL = format('expected=%s', expected_key);
    END IF;
  ELSIF NEW."status" = 'superseded'::"tryout_assignment_status" THEN
    IF NEW."preview_current_key" IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'check_violation',
        MESSAGE = 'superseded_preview_assignment_must_be_keyless';
    END IF;
  ELSIF NEW."preview_current_key" IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = 'non_active_preview_assignment_must_be_keyless';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "tryout_delivery_assignments_preview_state_guard"
BEFORE INSERT OR UPDATE ON "tryout_delivery_assignments"
FOR EACH ROW
EXECUTE FUNCTION "protect_preview_assignment_state"();

CREATE TABLE "admin_preview_tryout_restarts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "preview_student_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "tryout_id" UUID NOT NULL,
  "source_delivery_session_id" UUID NOT NULL,
  "raw_reason" TEXT NOT NULL,
  "canonical_reason" TEXT NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "delivery_session_id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "audit_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_preview_tryout_restarts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_preview_tryout_restart_scope_key" UNIQUE ("preview_student_id", "request_id"),
  CONSTRAINT "admin_preview_tryout_restarts_audit_id_key" UNIQUE ("audit_id"),
  CONSTRAINT "admin_preview_tryout_restarts_preview_student_id_fkey"
    FOREIGN KEY ("preview_student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_preview_tryout_restarts_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_preview_tryout_restarts_tryout_id_fkey"
    FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_preview_tryout_restarts_source_delivery_session_id_fkey"
    FOREIGN KEY ("source_delivery_session_id") REFERENCES "tryout_delivery_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_preview_tryout_restarts_delivery_session_id_fkey"
    FOREIGN KEY ("delivery_session_id") REFERENCES "tryout_delivery_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_preview_tryout_restarts_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "tryout_delivery_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "admin_preview_tryout_restarts_audit_id_fkey"
    FOREIGN KEY ("audit_id") REFERENCES "tryout_delivery_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "admin_preview_tryout_restarts_tryout_id_created_at_idx"
  ON "admin_preview_tryout_restarts" ("tryout_id", "created_at");
CREATE INDEX "admin_preview_tryout_restarts_preview_student_id_tryout_id_created_at_idx"
  ON "admin_preview_tryout_restarts" ("preview_student_id", "tryout_id", "created_at");

-- The idempotency row must itself belong to the fixed managed preview subject;
-- this is a second database backstop behind the server resolver.
CREATE OR REPLACE FUNCTION "protect_admin_preview_tryout_restart_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  preview_purpose TEXT;
BEGIN
  SELECT "preview_purpose" INTO preview_purpose
    FROM "users"
    WHERE "id" = NEW."preview_student_id";
  IF preview_purpose IS DISTINCT FROM 'admin.student-preview' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'admin_preview_tryout_restart_requires_fixed_preview_subject';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "admin_preview_tryout_restarts_scope_guard"
BEFORE INSERT OR UPDATE ON "admin_preview_tryout_restarts"
FOR EACH ROW
EXECUTE FUNCTION "protect_admin_preview_tryout_restart_scope"();

