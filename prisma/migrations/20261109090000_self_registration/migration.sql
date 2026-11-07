-- MS-21: student self-registration with email verification.
--
-- users.email_verified_at: null means "not proven yet". The default is now(), so an account
-- made by an admin (or by a seed or an import) is verified at creation; only self-registration
-- writes null explicitly. Every account that exists today is backfilled as verified, at the
-- time it was created.
--
-- email_verification_tokens: the link sent to a new student (hash only, one use, 24 hours),
-- carrying what the student agreed to until the link is used.
-- registration_attempts: the per-address and per-email limits (a security log, 90 days).
-- registration_consents: append-only evidence of the agreement, written when the email is
-- verified, registered in evidence_tables (MS-10).
-- Forward-only.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Existing accounts are verified as of the day they were created.
UPDATE "users" SET "email_verified_at" = "created_at";

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "terms_version" VARCHAR(40) NOT NULL,
    "privacy_version" VARCHAR(40) NOT NULL,
    "consented_at" TIMESTAMPTZ NOT NULL,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(10) NOT NULL,
    "email_hash" VARCHAR(64) NOT NULL,
    "ip_address" INET,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "terms_version" VARCHAR(40) NOT NULL,
    "privacy_version" VARCHAR(40) NOT NULL,
    "age_confirmed" BOOLEAN NOT NULL,
    "consented_at" TIMESTAMPTZ NOT NULL,
    "ip_address" INET,
    "verified_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_created_at_idx" ON "email_verification_tokens"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "registration_attempts_kind_email_hash_requested_at_idx" ON "registration_attempts"("kind", "email_hash", "requested_at");

-- CreateIndex
CREATE INDEX "registration_attempts_kind_ip_address_requested_at_idx" ON "registration_attempts"("kind", "ip_address", "requested_at");

-- CreateIndex
CREATE INDEX "registration_attempts_requested_at_idx" ON "registration_attempts"("requested_at");

-- CreateIndex
CREATE INDEX "registration_consents_user_id_idx" ON "registration_consents"("user_id");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_consents" ADD CONSTRAINT "registration_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- What the database itself insists on ----------------------------------------------------------
ALTER TABLE "registration_attempts"
  ADD CONSTRAINT "registration_attempts_kind_check" CHECK ("kind" IN ('signup', 'resend'));

-- A consent row exists only for someone who ticked the box, and names both versions.
ALTER TABLE "registration_consents"
  ADD CONSTRAINT "registration_consents_age_confirmed_check" CHECK ("age_confirmed"),
  ADD CONSTRAINT "registration_consents_versions_check" CHECK (length(btrim("terms_version")) > 0 AND length(btrim("privacy_version")) > 0);

-- Append-only: the same guard the other evidence tables use.
CREATE TRIGGER registration_consents_immutable
  BEFORE UPDATE OR DELETE ON "registration_consents"
  FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();

CREATE TRIGGER registration_consents_truncate_immutable
  BEFORE TRUNCATE ON "registration_consents"
  FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();

-- Evidence registry (MS-10): the app may read and add rows, never change or remove them.
-- No retention rule is registered for this class yet: the owner has not decided how long
-- it is kept after an account is gone, and an unlisted class is kept, never deleted.
INSERT INTO "evidence_tables" ("table_name", "record_class", "update_columns", "runtime_insert", "note")
VALUES ('registration_consents', 'registration_consent', ARRAY[]::text[], true, 'Append-only; written when a self-registered email is verified');

SELECT public.retention_apply_runtime_grants();
