-- Add the first-party attribution boundary for affiliator accounts and
-- successful package purchase evidence.

ALTER TYPE "role_name" ADD VALUE IF NOT EXISTS 'affiliator';

CREATE TYPE "package_purchase_status" AS ENUM (
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'cancelled'
);

CREATE TABLE "affiliator_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "referral_code" VARCHAR(40) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "affiliator_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "affiliator_profiles_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "affiliator_profiles_referral_code_key" UNIQUE ("referral_code"),
  CONSTRAINT "affiliator_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "affiliator_profiles_active_code_idx"
  ON "affiliator_profiles" ("is_active", "referral_code");

CREATE TABLE "package_purchases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "package_code" VARCHAR(80) NOT NULL,
  "package_name" VARCHAR(220) NOT NULL,
  "status" "package_purchase_status" NOT NULL DEFAULT 'pending',
  "affiliator_profile_id" UUID,
  "referral_code_snapshot" VARCHAR(40),
  "provider_reference" VARCHAR(160),
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "package_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_purchases_provider_reference_key" UNIQUE ("provider_reference"),
  CONSTRAINT "package_purchases_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "package_purchases_affiliator_profile_id_fkey"
    FOREIGN KEY ("affiliator_profile_id") REFERENCES "affiliator_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "package_purchases_student_created_at_idx"
  ON "package_purchases" ("student_id", "created_at");
CREATE INDEX "package_purchases_affiliator_status_completed_at_idx"
  ON "package_purchases" ("affiliator_profile_id", "status", "completed_at");
CREATE INDEX "package_purchases_status_completed_at_idx"
  ON "package_purchases" ("status", "completed_at");
