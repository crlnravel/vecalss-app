-- RLCSV-03: reusable PostgreSQL-backed authoring edit leases.
-- Raw lease-instance tokens are never persisted; token_digest stores only the
-- SHA-256 digest of the current 32-byte proof.

CREATE TYPE "edit_lease_resource_type" AS ENUM (
  'materi',
  'quiz',
  'question_bank',
  'question_package',
  'tryout',
  'media_asset',
  'media_folder'
);

CREATE TABLE "edit_leases" (
  "resource_type" "edit_lease_resource_type" NOT NULL,
  "resource_id" VARCHAR(128) NOT NULL,
  "holder_user_id" UUID NOT NULL,
  "token_digest" VARCHAR(64) NOT NULL,
  "generation" INTEGER NOT NULL,
  "acquired_at" TIMESTAMPTZ NOT NULL,
  "heartbeat_at" TIMESTAMPTZ NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "released_at" TIMESTAMPTZ,
  CONSTRAINT "edit_leases_pkey" PRIMARY KEY ("resource_type", "resource_id"),
  CONSTRAINT "edit_leases_generation_check" CHECK ("generation" > 0),
  CONSTRAINT "edit_leases_holder_user_id_fkey"
    FOREIGN KEY ("holder_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "edit_leases_expires_at_idx" ON "edit_leases"("expires_at");
CREATE INDEX "edit_leases_holder_user_id_idx" ON "edit_leases"("holder_user_id");
CREATE INDEX "edit_leases_released_at_expires_at_idx"
  ON "edit_leases"("released_at", "expires_at");
