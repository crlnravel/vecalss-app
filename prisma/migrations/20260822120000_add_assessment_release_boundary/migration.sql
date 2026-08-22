-- AS-09: durable, content-addressed Tryout publication identity.
--
-- This migration deliberately leaves existing sessions, attempts, runs, and
-- their snapshot JSON nullable/unbound.  They remain readable as historical
-- rows; only newly participant-accessible runtime paths are required to bind
-- an AssessmentRelease. A session/child repair may be transiently mixed
-- inside one transaction, but the deferred parent trigger rejects that state
-- at commit.

CREATE TABLE "assessment_releases" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tryout_id" uuid NOT NULL,
  "release_number" integer NOT NULL,
  "content_digest" varchar(128) NOT NULL,
  "payload" jsonb NOT NULL,
  "published_at" timestamptz NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "assessment_releases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_releases_release_number_check" CHECK ("release_number" > 0),
  CONSTRAINT "assessment_releases_tryout_fkey"
    FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "assessment_releases_created_by_user_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "assessment_releases_tryout_release_number_key"
  ON "assessment_releases"("tryout_id", "release_number");
CREATE UNIQUE INDEX "assessment_releases_tryout_content_digest_key"
  ON "assessment_releases"("tryout_id", "content_digest");
CREATE INDEX "assessment_releases_tryout_created_idx"
  ON "assessment_releases"("tryout_id", "created_at");

ALTER TABLE "tryout_delivery_sessions"
  ADD COLUMN "assessment_release_id" uuid;
ALTER TABLE "tryout_attempts"
  ADD COLUMN "assessment_release_id" uuid,
  ADD COLUMN "assessment_release_number" integer,
  ADD COLUMN "assessment_release_digest" varchar(128);
ALTER TABLE "tryout_attempt_test_runs"
  ADD COLUMN "assessment_release_id" uuid,
  ADD COLUMN "assessment_release_number" integer,
  ADD COLUMN "assessment_release_digest" varchar(128);

ALTER TABLE "tryout_delivery_sessions"
  ADD CONSTRAINT "tryout_delivery_sessions_assessment_release_fkey"
    FOREIGN KEY ("assessment_release_id") REFERENCES "assessment_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tryout_attempts"
  ADD CONSTRAINT "tryout_attempts_assessment_release_fkey"
    FOREIGN KEY ("assessment_release_id") REFERENCES "assessment_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tryout_attempt_test_runs"
  ADD CONSTRAINT "tryout_attempt_test_runs_assessment_release_fkey"
    FOREIGN KEY ("assessment_release_id") REFERENCES "assessment_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tryout_delivery_sessions_assessment_release_idx"
  ON "tryout_delivery_sessions"("assessment_release_id");
CREATE INDEX "tryout_attempts_assessment_release_idx"
  ON "tryout_attempts"("assessment_release_id");
CREATE INDEX "tryout_attempt_test_runs_assessment_release_idx"
  ON "tryout_attempt_test_runs"("assessment_release_id");

-- A release is append-only.  A digest collision reuses the existing row in
-- the locked publish transaction; no UPDATE/DELETE path may rewrite history.
CREATE OR REPLACE FUNCTION "protect_assessment_release_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'integrity_constraint_violation',
    MESSAGE = 'assessment_release_append_only';
END;
$$;

CREATE TRIGGER "assessment_releases_append_only"
BEFORE UPDATE OR DELETE ON "assessment_releases"
FOR EACH ROW
EXECUTE FUNCTION "protect_assessment_release_append_only"();

-- A session may transition from an unbound draft to one release exactly once;
-- a published/active session cannot be repointed at a later release.  A
-- deferrable parent-side check below ensures no committed release-bound
-- session retains nullable legacy children while still allowing an atomic
-- seed repair to bind the parent and backfill its children in one transaction.
CREATE OR REPLACE FUNCTION "validate_assessment_release_session_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."assessment_release_id" IS NOT NULL
       AND NEW."assessment_release_id" IS DISTINCT FROM OLD."assessment_release_id" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'assessment_release_session_rebinding_forbidden';
    END IF;
  END IF;

  IF NEW."assessment_release_id" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM "assessment_releases" release
       WHERE release."id" = NEW."assessment_release_id"
         AND release."tryout_id" = NEW."tryout_id"
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'foreign_key_violation',
      MESSAGE = 'assessment_release_tryout_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tryout_delivery_sessions_validate_assessment_release"
BEFORE INSERT OR UPDATE ON "tryout_delivery_sessions"
FOR EACH ROW
EXECUTE FUNCTION "validate_assessment_release_session_binding"();

CREATE OR REPLACE FUNCTION "validate_assessment_release_session_children"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."assessment_release_id" IS NOT NULL
     AND (
       EXISTS (
         SELECT 1
         FROM "tryout_attempts" attempt
         WHERE attempt."delivery_session_id" = NEW."id"
           AND (
             attempt."assessment_release_id" IS NULL
             OR attempt."assessment_release_number" IS NULL
             OR attempt."assessment_release_digest" IS NULL
           )
       )
       OR EXISTS (
         SELECT 1
         FROM "tryout_attempt_test_runs" run
         JOIN "tryout_attempts" attempt ON attempt."id" = run."attempt_id"
         WHERE attempt."delivery_session_id" = NEW."id"
           AND (
             run."assessment_release_id" IS NULL
             OR run."assessment_release_number" IS NULL
             OR run."assessment_release_digest" IS NULL
           )
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'assessment_release_session_children_unbound';
  END IF;
  RETURN NEW;
END;
$$;

-- Deferral is intentional: the seed can bind a historical closed session and
-- repair its attempts/runs before transaction commit, while direct writes
-- still fail closed if the parent remains bound with nullable children.
CREATE CONSTRAINT TRIGGER "tryout_delivery_sessions_validate_assessment_release_children"
AFTER INSERT OR UPDATE ON "tryout_delivery_sessions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "validate_assessment_release_session_children"();

-- Attempts and runs carry a denormalized release number/digest for stable DTO
-- metadata.  The database checks that the copied values match the immutable
-- release row; legacy rows are allowed to keep all three columns NULL only
-- when their parent session/attempt is also unbound.
CREATE OR REPLACE FUNCTION "validate_assessment_release_metadata"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_number integer;
  expected_digest varchar(128);
  release_tryout_id uuid;
  attempt_tryout_id uuid;
  session_release_id uuid;
  attempt_release_id uuid;
  attempt_release_number integer;
  attempt_release_digest varchar(128);
BEGIN
  IF NEW."assessment_release_id" IS NULL THEN
    IF NEW."assessment_release_number" IS NOT NULL
       OR NEW."assessment_release_digest" IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'assessment_release_metadata_requires_id';
    END IF;
    IF TG_TABLE_NAME = 'tryout_attempts' THEN
      SELECT session."assessment_release_id"
        INTO session_release_id
      FROM "tryout_delivery_sessions" session
      WHERE session."id" = NEW."delivery_session_id";
      IF session_release_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'integrity_constraint_violation',
          MESSAGE = 'assessment_release_attempt_metadata_required';
      END IF;
    ELSE
      SELECT attempt."assessment_release_id"
        INTO attempt_release_id
      FROM "tryout_attempts" attempt
      WHERE attempt."id" = NEW."attempt_id";
      IF attempt_release_id IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = 'integrity_constraint_violation',
          MESSAGE = 'assessment_release_run_metadata_required';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT release."release_number", release."content_digest", release."tryout_id"
    INTO expected_number, expected_digest, release_tryout_id
  FROM "assessment_releases" release
  WHERE release."id" = NEW."assessment_release_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'foreign_key_violation',
      MESSAGE = 'assessment_release_not_found';
  END IF;

  IF NEW."assessment_release_number" IS DISTINCT FROM expected_number
     OR NEW."assessment_release_digest" IS DISTINCT FROM expected_digest THEN
    RAISE EXCEPTION USING
      ERRCODE = 'integrity_constraint_violation',
      MESSAGE = 'assessment_release_metadata_mismatch';
  END IF;

  IF TG_TABLE_NAME = 'tryout_attempts' THEN
    IF release_tryout_id IS DISTINCT FROM NEW."tryout_id" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'assessment_release_attempt_tryout_mismatch';
    END IF;
    SELECT session."assessment_release_id"
      INTO session_release_id
    FROM "tryout_delivery_sessions" session
    WHERE session."id" = NEW."delivery_session_id";
    IF session_release_id IS DISTINCT FROM NEW."assessment_release_id" THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'assessment_release_attempt_session_mismatch';
    END IF;
  ELSE
    SELECT attempt."tryout_id", attempt."assessment_release_id",
           attempt."assessment_release_number", attempt."assessment_release_digest"
      INTO attempt_tryout_id, attempt_release_id,
           attempt_release_number, attempt_release_digest
    FROM "tryout_attempts" attempt
    WHERE attempt."id" = NEW."attempt_id";
    IF release_tryout_id IS DISTINCT FROM attempt_tryout_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'assessment_release_run_tryout_mismatch';
    END IF;
    IF NEW."assessment_release_id" IS DISTINCT FROM attempt_release_id
       OR NEW."assessment_release_number" IS DISTINCT FROM attempt_release_number
       OR NEW."assessment_release_digest" IS DISTINCT FROM attempt_release_digest THEN
      RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = 'assessment_release_run_attempt_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tryout_attempts_validate_assessment_release_metadata"
BEFORE INSERT OR UPDATE ON "tryout_attempts"
FOR EACH ROW
EXECUTE FUNCTION "validate_assessment_release_metadata"();

CREATE TRIGGER "tryout_attempt_test_runs_validate_assessment_release_metadata"
BEFORE INSERT OR UPDATE ON "tryout_attempt_test_runs"
FOR EACH ROW
EXECUTE FUNCTION "validate_assessment_release_metadata"();
