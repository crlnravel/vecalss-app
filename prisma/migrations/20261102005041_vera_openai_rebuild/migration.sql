-- CreateEnum
CREATE TYPE "vera_message_role" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "vera_usage_kind" AS ENUM ('chat', 'studio', 'title');

-- CreateEnum
CREATE TYPE "vera_usage_status" AS ENUM ('reserved', 'settled', 'released', 'failed');

-- CreateEnum
CREATE TYPE "vera_effort" AS ENUM ('cepat', 'seimbang', 'mendalam');

-- CreateEnum
CREATE TYPE "vera_studio_tool" AS ENUM ('weakness_analysis', 'study_route', 'wrong_answer_review');

-- DropForeignKey
ALTER TABLE "ai_conversations" DROP CONSTRAINT "ai_conversations_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_messages" DROP CONSTRAINT "ai_messages_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_idempotency_key_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_retry_of_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_user_message_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_assistant_message_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_daily" DROP CONSTRAINT "ai_usage_daily_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_quota_calendars" DROP CONSTRAINT "ai_quota_calendars_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_quota_calendars" DROP CONSTRAINT "ai_quota_calendars_current_monthly_window_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_windows" DROP CONSTRAINT "ai_usage_windows_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_usage_reservations" DROP CONSTRAINT "ai_request_usage_reservations_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_usage_reservations" DROP CONSTRAINT "ai_request_usage_reservations_usage_window_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_billing_correction_events" DROP CONSTRAINT "ai_billing_correction_events_request_id_fkey";

-- DropForeignKey
ALTER TABLE "weakness_analyses" DROP CONSTRAINT "weakness_analyses_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_sessions" DROP CONSTRAINT "adaptive_practice_sessions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_sessions" DROP CONSTRAINT "adaptive_practice_sessions_topic_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_sessions" DROP CONSTRAINT "adaptive_practice_sessions_source_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_sessions" DROP CONSTRAINT "adaptive_practice_sessions_fallback_question_bank_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_answers" DROP CONSTRAINT "adaptive_practice_answers_adaptive_session_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_answers" DROP CONSTRAINT "adaptive_practice_answers_question_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_answers" DROP CONSTRAINT "adaptive_practice_answers_adaptive_practice_item_id_fkey";

-- DropForeignKey
ALTER TABLE "ptn_strategy_sessions" DROP CONSTRAINT "ptn_strategy_sessions_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_bundles" DROP CONSTRAINT "ai_policy_bundles_supersedes_bundle_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_bundles" DROP CONSTRAINT "ai_policy_bundles_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_bundles" DROP CONSTRAINT "ai_policy_bundles_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_audit_events" DROP CONSTRAINT "ai_policy_audit_events_bundle_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_audit_events" DROP CONSTRAINT "ai_policy_audit_events_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_approval_snapshots" DROP CONSTRAINT "ai_policy_approval_snapshots_bundle_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_command_ledgers" DROP CONSTRAINT "ai_admin_command_ledgers_admin_principal_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_command_ledgers" DROP CONSTRAINT "ai_admin_command_ledgers_preview_reservation_uuid_fkey";

-- DropForeignKey
ALTER TABLE "ai_capability_grants" DROP CONSTRAINT "ai_capability_grants_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_idempotency_keys" DROP CONSTRAINT "ai_idempotency_keys_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_lifecycle_operations" DROP CONSTRAINT "ai_lifecycle_operations_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_lifecycle_operations" DROP CONSTRAINT "ai_lifecycle_operations_idempotency_key_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_export_jobs" DROP CONSTRAINT "ai_export_jobs_operation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_export_jobs" DROP CONSTRAINT "ai_export_jobs_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_export_parts" DROP CONSTRAINT "ai_export_parts_export_job_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_retention_holds" DROP CONSTRAINT "ai_retention_holds_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_retention_hold_releases" DROP CONSTRAINT "ai_retention_hold_releases_hold_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_key_destruction_claims" DROP CONSTRAINT "ai_key_destruction_claims_operation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_key_destruction_claims" DROP CONSTRAINT "ai_key_destruction_claims_hold_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_purge_work_items" DROP CONSTRAINT "ai_purge_work_items_operation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_conversation_sources" DROP CONSTRAINT "ai_conversation_sources_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_context_packs" DROP CONSTRAINT "ai_context_packs_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_context_tool_invocations" DROP CONSTRAINT "ai_context_tool_invocations_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_context_decisions" DROP CONSTRAINT "ai_context_decisions_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_sources" DROP CONSTRAINT "ai_request_sources_context_pack_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_sources" DROP CONSTRAINT "ai_request_sources_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_attempts" DROP CONSTRAINT "ai_request_attempts_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_result_stages" DROP CONSTRAINT "ai_request_result_stages_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admission_events" DROP CONSTRAINT "ai_admission_events_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admission_events" DROP CONSTRAINT "ai_admission_events_idempotency_key_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifacts" DROP CONSTRAINT "ai_artifacts_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifacts" DROP CONSTRAINT "ai_artifacts_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifacts" DROP CONSTRAINT "ai_artifacts_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifact_lifecycles" DROP CONSTRAINT "ai_artifact_lifecycles_artifact_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifact_lifecycles" DROP CONSTRAINT "ai_artifact_lifecycles_changed_by_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifact_applies" DROP CONSTRAINT "ai_artifact_applies_idempotency_key_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifact_applies" DROP CONSTRAINT "ai_artifact_applies_artifact_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_artifact_applies" DROP CONSTRAINT "ai_artifact_applies_applied_by_student_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_items" DROP CONSTRAINT "adaptive_practice_items_adaptive_session_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_report_reservations" DROP CONSTRAINT "ai_report_reservations_admin_principal_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_report_audits" DROP CONSTRAINT "ai_admin_report_audits_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_report_audits" DROP CONSTRAINT "ai_admin_report_audits_reservation_id_fkey";

-- AlterTable
ALTER TABLE "learning_recommendations" DROP COLUMN "deletion_state",
DROP COLUMN "lifecycle_state";

-- AlterTable
ALTER TABLE "weakness_analyses" DROP COLUMN "conversation_id",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "ptn_strategy_sessions" DROP COLUMN "conversation_id",
DROP COLUMN "deletion_state",
DROP COLUMN "lifecycle_state";

-- DropTable
DROP TABLE "ai_conversations";

-- DropTable
DROP TABLE "ai_messages";

-- DropTable
DROP TABLE "ai_requests";

-- DropTable
DROP TABLE "ai_usage_daily";

-- DropTable
DROP TABLE "ai_quota_calendars";

-- DropTable
DROP TABLE "ai_usage_windows";

-- DropTable
DROP TABLE "ai_request_usage_reservations";

-- DropTable
DROP TABLE "ai_billing_correction_events";

-- DropTable
DROP TABLE "adaptive_practice_sessions";

-- DropTable
DROP TABLE "adaptive_practice_answers";

-- DropTable
DROP TABLE "ai_policy_bundles";

-- DropTable
DROP TABLE "ai_policy_audit_events";

-- DropTable
DROP TABLE "ai_policy_approval_snapshots";

-- DropTable
DROP TABLE "ai_admin_command_ledgers";

-- DropTable
DROP TABLE "ai_capability_grants";

-- DropTable
DROP TABLE "ai_content_migration_audits";

-- DropTable
DROP TABLE "ai_envelope_keys";

-- DropTable
DROP TABLE "ai_idempotency_keys";

-- DropTable
DROP TABLE "ai_lifecycle_operations";

-- DropTable
DROP TABLE "ai_export_jobs";

-- DropTable
DROP TABLE "ai_export_parts";

-- DropTable
DROP TABLE "ai_retention_holds";

-- DropTable
DROP TABLE "ai_retention_hold_releases";

-- DropTable
DROP TABLE "ai_key_destruction_claims";

-- DropTable
DROP TABLE "ai_purge_work_items";

-- DropTable
DROP TABLE "ai_conversation_sources";

-- DropTable
DROP TABLE "ai_context_packs";

-- DropTable
DROP TABLE "ai_context_tool_invocations";

-- DropTable
DROP TABLE "ai_context_decisions";

-- DropTable
DROP TABLE "ai_request_sources";

-- DropTable
DROP TABLE "ai_request_attempts";

-- DropTable
DROP TABLE "ai_request_result_stages";

-- DropTable
DROP TABLE "ai_admission_events";

-- DropTable
DROP TABLE "ai_artifacts";

-- DropTable
DROP TABLE "ai_artifact_lifecycles";

-- DropTable
DROP TABLE "ai_artifact_applies";

-- DropTable
DROP TABLE "adaptive_practice_items";

-- DropTable
DROP TABLE "ai_report_budget_windows";

-- DropTable
DROP TABLE "ai_report_reservations";

-- DropTable
DROP TABLE "ai_admin_report_audits";

-- DropEnum
DROP TYPE "ai_conversation_type";

-- DropEnum
DROP TYPE "ai_message_role";

-- DropEnum
DROP TYPE "ai_request_status";

-- DropEnum
DROP TYPE "ai_request_lifecycle_state";

-- DropEnum
DROP TYPE "ai_token_usage_state";

-- DropEnum
DROP TYPE "ai_legacy_usage_state";

-- DropEnum
DROP TYPE "ai_usage_accounting_state";

-- DropEnum
DROP TYPE "ai_usage_ledger_version";

-- DropEnum
DROP TYPE "ai_usage_window_period_kind";

-- DropEnum
DROP TYPE "ai_usage_window_state";

-- DropEnum
DROP TYPE "ai_monetary_debt_state";

-- DropEnum
DROP TYPE "ai_request_billing_state";

-- DropEnum
DROP TYPE "ai_reservation_state";

-- DropEnum
DROP TYPE "ai_idempotency_operation";

-- DropEnum
DROP TYPE "ai_idempotency_state";

-- DropEnum
DROP TYPE "ai_rejection_class";

-- DropEnum
DROP TYPE "ai_idempotency_result_kind";

-- DropEnum
DROP TYPE "ai_idempotency_tombstone_code";

-- DropEnum
DROP TYPE "ai_context_source_type";

-- DropEnum
DROP TYPE "ai_context_snapshot_state";

-- DropEnum
DROP TYPE "ai_context_provenance_state";

-- DropEnum
DROP TYPE "ai_context_tool_invocation_state";

-- DropEnum
DROP TYPE "ai_context_decision_state";

-- DropEnum
DROP TYPE "ai_purge_state";

-- DropEnum
DROP TYPE "ai_policy_state";

-- DropEnum
DROP TYPE "ai_policy_audit_action";

-- DropEnum
DROP TYPE "ai_attempt_state";

-- DropEnum
DROP TYPE "ai_attempt_result_kind";

-- DropEnum
DROP TYPE "ai_request_attempt_stage_purpose";

-- DropEnum
DROP TYPE "ai_result_stage_state";

-- DropEnum
DROP TYPE "ai_result_kind";

-- DropEnum
DROP TYPE "ai_settlement_kind";

-- DropEnum
DROP TYPE "ai_artifact_type";

-- DropEnum
DROP TYPE "ai_artifact_provenance_kind";

-- DropEnum
DROP TYPE "ai_artifact_lifecycle_state";

-- DropEnum
DROP TYPE "ai_deletion_state";

-- DropEnum
DROP TYPE "ai_lifecycle_operation_state";

-- DropEnum
DROP TYPE "ai_owner_state";

-- DropEnum
DROP TYPE "ai_lifecycle_target_state";

-- DropEnum
DROP TYPE "ai_export_state";

-- DropEnum
DROP TYPE "ai_export_access_grant_state";

-- DropEnum
DROP TYPE "ai_retention_hold_subject_type";

-- DropEnum
DROP TYPE "ai_retention_hold_subject_state";

-- DropEnum
DROP TYPE "ai_retention_hold_type";

-- DropEnum
DROP TYPE "ai_retention_hold_state";

-- DropEnum
DROP TYPE "ai_retention_hold_release_state";

-- DropEnum
DROP TYPE "ai_key_destruction_claim_state";

-- DropEnum
DROP TYPE "ai_purge_work_item_state";

-- DropEnum
DROP TYPE "ai_migration_classification";

-- DropEnum
DROP TYPE "ai_migration_action";

-- DropEnum
DROP TYPE "ai_migration_audit_status";

-- DropEnum
DROP TYPE "ai_artifact_apply_state";

-- DropEnum
DROP TYPE "ai_target_lifecycle_state";

-- DropEnum
DROP TYPE "ai_content_lifecycle_state";

-- DropEnum
DROP TYPE "ai_migration_content_class";

-- DropEnum
DROP TYPE "ai_migration_state";

-- DropEnum
DROP TYPE "ai_capability_name";

-- DropEnum
DROP TYPE "ai_provider_gate_state";

-- DropEnum
DROP TYPE "ai_admin_command_operation";

-- DropEnum
DROP TYPE "ai_admin_command_state";

-- DropEnum
DROP TYPE "ai_admin_command_result_kind";

-- DropEnum
DROP TYPE "ai_policy_preview_mode";

-- DropEnum
DROP TYPE "ai_admission_reason";

-- DropEnum
DROP TYPE "ai_report_budget_state";

-- DropEnum
DROP TYPE "ai_report_window_kind";

-- DropEnum
DROP TYPE "ai_report_reservation_state";

-- DropEnum
DROP TYPE "ai_report_reservation_result_kind";

-- DropEnum
DROP TYPE "ai_admin_report_event_type";

-- DropEnum
DROP TYPE "ai_admin_report_operation";

-- DropEnum
DROP TYPE "ai_admin_report_suppression_state";

-- CreateTable
CREATE TABLE "vera_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL DEFAULT 'Sesi baru',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vera_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vera_messages" (
    "id" VARCHAR(64) NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "vera_message_role" NOT NULL,
    "parts" JSONB NOT NULL,
    "mentions" JSONB,
    "sources" JSONB,
    "effort" "vera_effort",
    "credits" DECIMAL(6,1),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vera_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vera_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "kind" "vera_usage_kind" NOT NULL,
    "status" "vera_usage_status" NOT NULL DEFAULT 'reserved',
    "effort" "vera_effort",
    "model" VARCHAR(80) NOT NULL,
    "conversation_id" UUID,
    "message_id" VARCHAR(64),
    "studio_document_id" UUID,
    "reserved_credits" DECIMAL(6,1) NOT NULL,
    "credits" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "cost_usd_micros" BIGINT NOT NULL DEFAULT 0,
    "reserved_usd_micros" BIGINT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "reasoning_tokens" INTEGER NOT NULL DEFAULT 0,
    "steps" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(60),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,

    CONSTRAINT "vera_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vera_studio_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "tool" "vera_studio_tool" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "markdown" TEXT NOT NULL,
    "sources" JSONB,
    "input" JSONB,
    "credits" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vera_studio_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vera_materi_texts" (
    "module_asset_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "text" TEXT NOT NULL,
    "extracted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vera_materi_texts_pkey" PRIMARY KEY ("module_asset_id")
);

-- CreateIndex
CREATE INDEX "vera_conversations_student_id_updated_at_idx" ON "vera_conversations"("student_id", "updated_at");

-- CreateIndex
CREATE INDEX "vera_messages_conversation_id_created_at_idx" ON "vera_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "vera_usage_events_student_id_created_at_idx" ON "vera_usage_events"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "vera_usage_events_created_at_idx" ON "vera_usage_events"("created_at");

-- CreateIndex
CREATE INDEX "vera_studio_documents_student_id_created_at_idx" ON "vera_studio_documents"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "vera_materi_texts_module_id_idx" ON "vera_materi_texts"("module_id");

-- AddForeignKey
ALTER TABLE "vera_conversations" ADD CONSTRAINT "vera_conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vera_messages" ADD CONSTRAINT "vera_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "vera_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vera_usage_events" ADD CONSTRAINT "vera_usage_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vera_studio_documents" ADD CONSTRAINT "vera_studio_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
