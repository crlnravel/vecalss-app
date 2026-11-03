-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN     "mfa_factor_id" UUID,
ADD COLUMN     "mfa_verified_at" TIMESTAMPTZ;


-- CreateTable
CREATE TABLE "user_mfa_factors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "secret_envelope" JSONB NOT NULL,
    "confirmed_at" TIMESTAMPTZ,
    "last_accepted_step" INTEGER,
    "pending_session_id" UUID,
    "setup_code_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "factor_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_setup_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "issued_by" VARCHAR(160) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_setup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_failed_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_failed_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_factors_user_id_key" ON "user_mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_factors_setup_code_id_key" ON "user_mfa_factors"("setup_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_recovery_codes_factor_id_code_hash_key" ON "mfa_recovery_codes"("factor_id", "code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_setup_codes_code_hash_key" ON "mfa_setup_codes"("code_hash");

-- CreateIndex
CREATE INDEX "mfa_setup_codes_user_id_created_at_idx" ON "mfa_setup_codes"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "mfa_failed_attempts_user_id_kind_occurred_at_idx" ON "mfa_failed_attempts"("user_id", "kind", "occurred_at");

-- CreateIndex
CREATE INDEX "auth_sessions_mfa_factor_id_idx" ON "auth_sessions"("mfa_factor_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_mfa_factor_id_fkey" FOREIGN KEY ("mfa_factor_id") REFERENCES "user_mfa_factors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mfa_factors" ADD CONSTRAINT "user_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mfa_factors" ADD CONSTRAINT "user_mfa_factors_setup_code_id_fkey" FOREIGN KEY ("setup_code_id") REFERENCES "mfa_setup_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "user_mfa_factors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_setup_codes" ADD CONSTRAINT "mfa_setup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_failed_attempts" ADD CONSTRAINT "mfa_failed_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "affiliator_profiles_active_code_idx" RENAME TO "affiliator_profiles_is_active_referral_code_idx";

-- RenameIndex
ALTER INDEX "package_purchases_affiliator_status_completed_at_idx" RENAME TO "package_purchases_affiliator_profile_id_status_completed_at_idx";

-- RenameIndex
ALTER INDEX "package_purchases_student_created_at_idx" RENAME TO "package_purchases_student_id_created_at_idx";

-- RenameIndex
ALTER INDEX "question_bank_media_folder_reservations_owner_user_id_adopted_b" RENAME TO "question_bank_media_folder_reservations_owner_user_id_adopt_idx";

-- RenameIndex
ALTER INDEX "question_bank_xlsx_import_attempt_assets_attempt_id_content_sha" RENAME TO "question_bank_xlsx_import_attempt_assets_attempt_id_content_key";

-- RenameIndex
ALTER INDEX "standalone_quiz_start_commands_quiz_id_student_id_created_at_id" RENAME TO "standalone_quiz_start_commands_quiz_id_student_id_created_a_idx";

-- RenameIndex
ALTER INDEX "standalone_quiz_start_commands_quiz_id_student_id_request_id_ke" RENAME TO "standalone_quiz_start_commands_quiz_id_student_id_request_i_key";


-- Throttle bookkeeping only ever records one of these kinds.
ALTER TABLE "mfa_failed_attempts" ADD CONSTRAINT "mfa_failed_attempts_kind_check" CHECK ("kind" IN ('challenge', 'recovery', 'setup'));
