-- DropForeignKey
ALTER TABLE "adaptive_practice_items" DROP CONSTRAINT "adaptive_practice_items_question_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_items" DROP CONSTRAINT "adaptive_practice_items_question_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_sessions" DROP CONSTRAINT "adaptive_practice_sessions_applied_artifact_fkey";

-- DropForeignKey
ALTER TABLE "adaptive_practice_sessions" DROP CONSTRAINT "adaptive_practice_sessions_request_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_command_ledgers" DROP CONSTRAINT "ai_admin_command_ledgers_principal_fkey";

-- DropForeignKey
ALTER TABLE "ai_admin_report_audits" DROP CONSTRAINT "ai_admin_report_audits_reservation_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_idempotency_keys" DROP CONSTRAINT "ai_idempotency_keys_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_lifecycle_operations" DROP CONSTRAINT "ai_lifecycle_operations_idempotency_key_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_lifecycle_operations" DROP CONSTRAINT "ai_lifecycle_operations_student_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_approval_snapshots" DROP CONSTRAINT "ai_policy_approval_snapshots_audit_event_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_approval_snapshots" DROP CONSTRAINT "ai_policy_approval_snapshots_bundle_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_audit_events" DROP CONSTRAINT "ai_policy_audit_events_approval_snapshot_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_bundles" DROP CONSTRAINT "ai_policy_bundles_approval_snapshot_fkey";

-- DropForeignKey
ALTER TABLE "ai_policy_bundles" DROP CONSTRAINT "ai_policy_bundles_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_request_sources" DROP CONSTRAINT "ai_request_sources_pack_request_identity_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_idempotency_key_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_requests" DROP CONSTRAINT "ai_requests_student_id_fkey";

-- DropForeignKey
ALTER TABLE "learning_recommendations" DROP CONSTRAINT "learning_recommendations_applied_artifact_fkey";

-- DropForeignKey
ALTER TABLE "learning_recommendations" DROP CONSTRAINT "learning_recommendations_source_artifact_fkey";

-- DropForeignKey
ALTER TABLE "ptn_strategy_sessions" DROP CONSTRAINT "ptn_strategy_sessions_applied_artifact_fkey";

-- DropForeignKey
ALTER TABLE "ptn_strategy_sessions" DROP CONSTRAINT "ptn_strategy_sessions_request_id_fkey";

-- DropForeignKey
ALTER TABLE "question_banks" DROP CONSTRAINT "question_banks_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "question_banks" DROP CONSTRAINT "question_banks_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "question_options" DROP CONSTRAINT "question_options_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_current_revision_identity_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_explanation_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_prompt_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_question_bank_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_subtest_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_topic_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_items" DROP CONSTRAINT "reusable_question_package_items_package_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_items" DROP CONSTRAINT "reusable_question_package_items_source_question_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_items" DROP CONSTRAINT "reusable_question_package_items_source_revision_identity_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_item_options" DROP CONSTRAINT "reusable_question_package_versio_source_question_option_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_item_options" DROP CONSTRAINT "reusable_question_package_version__package_version_item_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_item_options" DROP CONSTRAINT "reusable_question_package_version_item_options_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_items" DROP CONSTRAINT "reusable_question_package_version_ite_explanation_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_items" DROP CONSTRAINT "reusable_question_package_version_items_package_version_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_items" DROP CONSTRAINT "reusable_question_package_version_items_prompt_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_items" DROP CONSTRAINT "reusable_question_package_version_items_source_question_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_items" DROP CONSTRAINT "reusable_question_package_version_items_source_revision_identit";

-- DropForeignKey
ALTER TABLE "reusable_question_package_version_items" DROP CONSTRAINT "reusable_question_package_version_items_subtest_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_versions" DROP CONSTRAINT "reusable_question_package_versions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_versions" DROP CONSTRAINT "reusable_question_package_versions_package_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_package_versions" DROP CONSTRAINT "reusable_question_package_versions_source_bank_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_packages" DROP CONSTRAINT "reusable_question_packages_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_packages" DROP CONSTRAINT "reusable_question_packages_source_bank_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_packages" DROP CONSTRAINT "reusable_question_packages_subtest_id_fkey";

-- DropForeignKey
ALTER TABLE "reusable_question_packages" DROP CONSTRAINT "reusable_question_packages_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_item_options" DROP CONSTRAINT "standalone_quiz_item_options_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_item_options" DROP CONSTRAINT "standalone_quiz_item_options_quiz_item_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_item_options" DROP CONSTRAINT "standalone_quiz_item_options_source_question_option_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_items" DROP CONSTRAINT "standalone_quiz_items_explanation_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_items" DROP CONSTRAINT "standalone_quiz_items_prompt_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_items" DROP CONSTRAINT "standalone_quiz_items_source_question_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_items" DROP CONSTRAINT "standalone_quiz_items_source_revision_identity_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quiz_items" DROP CONSTRAINT "standalone_quiz_items_subtest_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quizzes" DROP CONSTRAINT "standalone_quizzes_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quizzes" DROP CONSTRAINT "standalone_quizzes_source_bank_id_fkey";

-- DropForeignKey
ALTER TABLE "standalone_quizzes" DROP CONSTRAINT "standalone_quizzes_subtest_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_admissions" DROP CONSTRAINT "tryout_admissions_decided_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_admissions" DROP CONSTRAINT "tryout_admissions_student_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_admissions" DROP CONSTRAINT "tryout_admissions_tryout_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_answers" DROP CONSTRAINT "tryout_answers_attempt_test_run_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_answers" DROP CONSTRAINT "tryout_answers_item_package_fkey";

-- DropForeignKey
ALTER TABLE "tryout_answers" DROP CONSTRAINT "tryout_answers_option_item_fkey";

-- DropForeignKey
ALTER TABLE "tryout_answers" DROP CONSTRAINT "tryout_answers_session_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_answers" DROP CONSTRAINT "tryout_answers_session_package_fkey";

-- DropForeignKey
ALTER TABLE "tryout_attempt_test_runs" DROP CONSTRAINT "tryout_attempt_test_runs_attempt_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_attempt_test_runs" DROP CONSTRAINT "tryout_attempt_test_runs_tryout_section_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_attempts" DROP CONSTRAINT "tryout_attempts_admission_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_attempts" DROP CONSTRAINT "tryout_attempts_delivery_session_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_cat_resolution_audits" DROP CONSTRAINT "tryout_cat_resolution_audits_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_cat_resolution_audits" DROP CONSTRAINT "tryout_cat_resolution_audits_run_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_assignments" DROP CONSTRAINT "tryout_delivery_assignments_admission_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_assignments" DROP CONSTRAINT "tryout_delivery_assignments_assigned_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_assignments" DROP CONSTRAINT "tryout_delivery_assignments_delivery_session_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_audits" DROP CONSTRAINT "tryout_delivery_audits_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_audits" DROP CONSTRAINT "tryout_delivery_audits_delivery_session_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_audits" DROP CONSTRAINT "tryout_delivery_audits_tryout_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_sessions" DROP CONSTRAINT "tryout_delivery_sessions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_sessions" DROP CONSTRAINT "tryout_delivery_sessions_released_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_sessions" DROP CONSTRAINT "tryout_delivery_sessions_tryout_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_delivery_sessions" DROP CONSTRAINT "tryout_delivery_sessions_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_item_options" DROP CONSTRAINT "tryout_item_options_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_item_options" DROP CONSTRAINT "tryout_item_options_source_question_option_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_item_options" DROP CONSTRAINT "tryout_item_options_tryout_item_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_explanation_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_package_version_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_prompt_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_source_question_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_source_revision_identity_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_subtest_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_items" DROP CONSTRAINT "tryout_items_tryout_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_packages" DROP CONSTRAINT "tryout_packages_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "tryout_sections" DROP CONSTRAINT "tryout_sections_package_version_id_fkey";

-- DropForeignKey
ALTER TABLE "two_pl_question_calibrations" DROP CONSTRAINT "two_pl_question_calibrations_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "two_pl_question_calibrations" DROP CONSTRAINT "two_pl_question_calibrations_question_id_fkey";

-- DropForeignKey
ALTER TABLE "two_pl_question_calibrations" DROP CONSTRAINT "two_pl_question_calibrations_question_identity_fkey";

-- DropForeignKey
ALTER TABLE "two_pl_question_calibrations" DROP CONSTRAINT "two_pl_question_calibrations_recorded_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "weakness_analyses" DROP CONSTRAINT "weakness_analyses_request_id_fkey";

-- DropIndex
DROP INDEX "ai_context_packs_id_request_id_key";

-- DropIndex
DROP INDEX "ai_policy_audit_events_action_occurred_idx";

-- DropIndex
DROP INDEX "ai_policy_bundles_state_effective_revision_idx";

-- DropIndex
DROP INDEX "question_revisions_question_id_id_key";

-- DropIndex
DROP INDEX "reusable_question_package_items_source_question_revision_id_idx";

-- DropIndex
DROP INDEX "reusable_question_package_version_item_options_source_question_";

-- DropIndex
DROP INDEX "reusable_question_package_version_items_source_question_revisio";

-- DropIndex
DROP INDEX "reusable_question_packages_source_bank_id_idx";

-- DropIndex
DROP INDEX "standalone_quiz_attempts_scoring_state_idx";

-- DropIndex
DROP INDEX "standalone_quiz_item_options_source_question_revision_option_id";

-- DropIndex
DROP INDEX "standalone_quiz_items_source_question_revision_id_idx";

-- DropIndex
DROP INDEX "tryout_attempt_test_runs_assessment_release_idx";

-- DropIndex
DROP INDEX "tryout_attempt_test_runs_scoring_state_idx";

-- DropIndex
DROP INDEX "tryout_attempts_assessment_release_idx";

-- DropIndex
DROP INDEX "tryout_attempts_scoring_state_idx";

-- DropIndex
DROP INDEX "tryout_delivery_sessions_assessment_release_idx";

-- DropIndex
DROP INDEX "tryout_delivery_sessions_release_idx";

-- DropIndex
DROP INDEX "tryout_item_options_source_question_revision_option_id_idx";

-- DropIndex
DROP INDEX "tryout_items_package_version_id_idx";

-- DropIndex
DROP INDEX "tryout_items_source_question_revision_id_idx";

-- DropIndex
DROP INDEX "tryout_sections_package_version_id_idx";

-- AlterTable
ALTER TABLE "ai_content_migration_audits" ALTER COLUMN "table_name" DROP DEFAULT,
ALTER COLUMN "column_name" DROP DEFAULT;

-- AlterTable
ALTER TABLE "reusable_question_package_version_bank_scopes" RENAME CONSTRAINT "reusable_qpv_bank_scope_pkey" TO "reusable_question_package_version_bank_scopes_pkey";

-- AlterTable
ALTER TABLE "reusable_question_package_version_category_scopes" RENAME CONSTRAINT "reusable_qpv_category_scope_pkey" TO "reusable_question_package_version_category_scopes_pkey";

-- AlterTable
ALTER TABLE "reusable_question_package_version_folder_scopes" RENAME CONSTRAINT "reusable_qpv_folder_scope_pkey" TO "reusable_question_package_version_folder_scopes_pkey";

-- AlterTable
ALTER TABLE "reusable_question_package_version_rules" RENAME CONSTRAINT "reusable_qpv_rule_pkey" TO "reusable_question_package_version_rules_pkey";

-- AlterTable
ALTER TABLE "tryout_packages" ADD COLUMN     "banner_media_id" UUID;

-- CreateIndex
CREATE INDEX "tryout_packages_exam_event_id_idx" ON "tryout_packages"("exam_event_id");

-- CreateIndex
CREATE INDEX "tryout_packages_banner_media_id_idx" ON "tryout_packages"("banner_media_id");

-- RenameForeignKey
ALTER TABLE "assessment_releases" RENAME CONSTRAINT "assessment_releases_assembly_package_fkey" TO "assessment_releases_assembly_package_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_releases" RENAME CONSTRAINT "assessment_releases_assembly_package_version_fkey" TO "assessment_releases_assembly_package_version_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_releases" RENAME CONSTRAINT "assessment_releases_created_by_user_fkey" TO "assessment_releases_created_by_user_id_fkey";

-- RenameForeignKey
ALTER TABLE "assessment_releases" RENAME CONSTRAINT "assessment_releases_tryout_fkey" TO "assessment_releases_tryout_id_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_items" RENAME CONSTRAINT "reusable_question_package_items_source_question_revision_id_fke" TO "reusable_question_package_items_source_question_revision_i_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_bank_scopes" RENAME CONSTRAINT "reusable_qpv_bank_scope_bank_fkey" TO "reusable_question_package_version_bank_scopes_question_ban_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_bank_scopes" RENAME CONSTRAINT "reusable_qpv_bank_scope_version_fkey" TO "reusable_question_package_version_bank_scopes_package_vers_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_category_scopes" RENAME CONSTRAINT "reusable_qpv_category_scope_category_fkey" TO "reusable_question_package_version_category_scopes_category_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_category_scopes" RENAME CONSTRAINT "reusable_qpv_category_scope_version_fkey" TO "reusable_question_package_version_category_scopes_package__fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_folder_scopes" RENAME CONSTRAINT "reusable_qpv_folder_scope_folder_fkey" TO "reusable_question_package_version_folder_scopes_folder_id_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_folder_scopes" RENAME CONSTRAINT "reusable_qpv_folder_scope_version_fkey" TO "reusable_question_package_version_folder_scopes_package_ve_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_items" RENAME CONSTRAINT "reusable_question_package_version_items_source_question_revisio" TO "reusable_question_package_version_items_source_question_re_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_version_rules" RENAME CONSTRAINT "reusable_qpv_rule_version_fkey" TO "reusable_question_package_version_rules_package_version_id_fkey";

-- RenameForeignKey
ALTER TABLE "reusable_question_package_versions" RENAME CONSTRAINT "reusable_qpv_subtest_fkey" TO "reusable_question_package_versions_subtest_id_fkey";

-- RenameForeignKey
ALTER TABLE "standalone_quiz_item_options" RENAME CONSTRAINT "standalone_quiz_item_options_source_question_revision_option_id" TO "standalone_quiz_item_options_source_question_revision_opti_fkey";

-- RenameForeignKey
ALTER TABLE "standalone_quizzes" RENAME CONSTRAINT "standalone_quizzes_assembly_version_fkey" TO "standalone_quizzes_assembly_package_version_id_fkey";

-- RenameForeignKey
ALTER TABLE "tryout_attempt_test_runs" RENAME CONSTRAINT "tryout_attempt_test_runs_assessment_release_fkey" TO "tryout_attempt_test_runs_assessment_release_id_fkey";

-- RenameForeignKey
ALTER TABLE "tryout_attempts" RENAME CONSTRAINT "tryout_attempts_assessment_release_fkey" TO "tryout_attempts_assessment_release_id_fkey";

-- RenameForeignKey
ALTER TABLE "tryout_attempts" RENAME CONSTRAINT "tryout_sessions_student_id_fkey" TO "tryout_attempts_student_id_fkey";

-- RenameForeignKey
ALTER TABLE "tryout_attempts" RENAME CONSTRAINT "tryout_sessions_tryout_id_fkey" TO "tryout_attempts_tryout_id_fkey";

-- RenameForeignKey
ALTER TABLE "tryout_delivery_sessions" RENAME CONSTRAINT "tryout_delivery_sessions_assessment_release_fkey" TO "tryout_delivery_sessions_assessment_release_id_fkey";

-- RenameForeignKey
ALTER TABLE "tryout_score_breakdowns" RENAME CONSTRAINT "tryout_score_breakdowns_session_id_fkey" TO "tryout_score_breakdowns_attempt_id_fkey";

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_bank_id_fkey" FOREIGN KEY ("question_bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_prompt_asset_id_fkey" FOREIGN KEY ("prompt_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_explanation_asset_id_fkey" FOREIGN KEY ("explanation_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_pl_question_calibrations" ADD CONSTRAINT "two_pl_question_calibrations_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_pl_question_calibrations" ADD CONSTRAINT "two_pl_question_calibrations_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_pl_question_calibrations" ADD CONSTRAINT "two_pl_question_calibrations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quizzes" ADD CONSTRAINT "standalone_quizzes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quizzes" ADD CONSTRAINT "standalone_quizzes_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quizzes" ADD CONSTRAINT "standalone_quizzes_source_bank_id_fkey" FOREIGN KEY ("source_bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_items" ADD CONSTRAINT "standalone_quiz_items_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_items" ADD CONSTRAINT "standalone_quiz_items_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_items" ADD CONSTRAINT "standalone_quiz_items_prompt_asset_id_fkey" FOREIGN KEY ("prompt_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_items" ADD CONSTRAINT "standalone_quiz_items_explanation_asset_id_fkey" FOREIGN KEY ("explanation_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_item_options" ADD CONSTRAINT "standalone_quiz_item_options_quiz_item_id_fkey" FOREIGN KEY ("quiz_item_id") REFERENCES "standalone_quiz_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_item_options" ADD CONSTRAINT "standalone_quiz_item_options_source_question_option_id_fkey" FOREIGN KEY ("source_question_option_id") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standalone_quiz_item_options" ADD CONSTRAINT "standalone_quiz_item_options_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_packages" ADD CONSTRAINT "reusable_question_packages_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_packages" ADD CONSTRAINT "reusable_question_packages_source_bank_id_fkey" FOREIGN KEY ("source_bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_packages" ADD CONSTRAINT "reusable_question_packages_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_packages" ADD CONSTRAINT "reusable_question_packages_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_items" ADD CONSTRAINT "reusable_question_package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "reusable_question_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_items" ADD CONSTRAINT "reusable_question_package_items_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_versions" ADD CONSTRAINT "reusable_question_package_versions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "reusable_question_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_versions" ADD CONSTRAINT "reusable_question_package_versions_source_bank_id_fkey" FOREIGN KEY ("source_bank_id") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_versions" ADD CONSTRAINT "reusable_question_package_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_items" ADD CONSTRAINT "reusable_question_package_version_items_package_version_id_fkey" FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_items" ADD CONSTRAINT "reusable_question_package_version_items_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_items" ADD CONSTRAINT "reusable_question_package_version_items_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_items" ADD CONSTRAINT "reusable_question_package_version_items_prompt_asset_id_fkey" FOREIGN KEY ("prompt_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_items" ADD CONSTRAINT "reusable_question_package_version_items_explanation_asset__fkey" FOREIGN KEY ("explanation_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_item_options" ADD CONSTRAINT "reusable_question_package_version_item_options_package_ver_fkey" FOREIGN KEY ("package_version_item_id") REFERENCES "reusable_question_package_version_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_item_options" ADD CONSTRAINT "reusable_question_package_version_item_options_source_ques_fkey" FOREIGN KEY ("source_question_option_id") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reusable_question_package_version_item_options" ADD CONSTRAINT "reusable_question_package_version_item_options_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_packages" ADD CONSTRAINT "tryout_packages_banner_media_id_fkey" FOREIGN KEY ("banner_media_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_packages" ADD CONSTRAINT "tryout_packages_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_sessions" ADD CONSTRAINT "tryout_delivery_sessions_tryout_id_fkey" FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_sessions" ADD CONSTRAINT "tryout_delivery_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_sessions" ADD CONSTRAINT "tryout_delivery_sessions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_sessions" ADD CONSTRAINT "tryout_delivery_sessions_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_admissions" ADD CONSTRAINT "tryout_admissions_tryout_id_fkey" FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_admissions" ADD CONSTRAINT "tryout_admissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_assignments" ADD CONSTRAINT "tryout_delivery_assignments_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "tryout_admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_assignments" ADD CONSTRAINT "tryout_delivery_assignments_delivery_session_id_fkey" FOREIGN KEY ("delivery_session_id") REFERENCES "tryout_delivery_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_assignments" ADD CONSTRAINT "tryout_delivery_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_audits" ADD CONSTRAINT "tryout_delivery_audits_tryout_id_fkey" FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_audits" ADD CONSTRAINT "tryout_delivery_audits_delivery_session_id_fkey" FOREIGN KEY ("delivery_session_id") REFERENCES "tryout_delivery_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_delivery_audits" ADD CONSTRAINT "tryout_delivery_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_sections" ADD CONSTRAINT "tryout_sections_package_version_id_fkey" FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_tryout_id_fkey" FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_prompt_asset_id_fkey" FOREIGN KEY ("prompt_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_explanation_asset_id_fkey" FOREIGN KEY ("explanation_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_package_version_id_fkey" FOREIGN KEY ("package_version_id") REFERENCES "reusable_question_package_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_item_options" ADD CONSTRAINT "tryout_item_options_tryout_item_id_fkey" FOREIGN KEY ("tryout_item_id") REFERENCES "tryout_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_item_options" ADD CONSTRAINT "tryout_item_options_source_question_option_id_fkey" FOREIGN KEY ("source_question_option_id") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_item_options" ADD CONSTRAINT "tryout_item_options_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_attempts" ADD CONSTRAINT "tryout_attempts_delivery_session_id_fkey" FOREIGN KEY ("delivery_session_id") REFERENCES "tryout_delivery_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_attempts" ADD CONSTRAINT "tryout_attempts_admission_id_fkey" FOREIGN KEY ("admission_id") REFERENCES "tryout_admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_attempt_test_runs" ADD CONSTRAINT "tryout_attempt_test_runs_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "tryout_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_attempt_test_runs" ADD CONSTRAINT "tryout_attempt_test_runs_tryout_section_id_fkey" FOREIGN KEY ("tryout_section_id") REFERENCES "tryout_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_cat_resolution_audits" ADD CONSTRAINT "tryout_cat_resolution_audits_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "tryout_attempt_test_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_cat_resolution_audits" ADD CONSTRAINT "tryout_cat_resolution_audits_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_attempt_id_tryout_id_fkey" FOREIGN KEY ("attempt_id", "tryout_id") REFERENCES "tryout_attempts"("id", "tryout_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_attempt_test_run_id_fkey" FOREIGN KEY ("attempt_test_run_id") REFERENCES "tryout_attempt_test_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_tryout_item_id_tryout_id_fkey" FOREIGN KEY ("tryout_item_id", "tryout_id") REFERENCES "tryout_items"("id", "tryout_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_selected_option_id_tryout_item_id_fkey" FOREIGN KEY ("selected_option_id", "tryout_item_id") REFERENCES "tryout_item_options"("id", "tryout_item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "ai_idempotency_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_bundles" ADD CONSTRAINT "ai_policy_bundles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_policy_approval_snapshots" ADD CONSTRAINT "ai_policy_approval_snapshots_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "ai_policy_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admin_command_ledgers" ADD CONSTRAINT "ai_admin_command_ledgers_admin_principal_id_fkey" FOREIGN KEY ("admin_principal_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_idempotency_keys" ADD CONSTRAINT "ai_idempotency_keys_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_lifecycle_operations" ADD CONSTRAINT "ai_lifecycle_operations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_lifecycle_operations" ADD CONSTRAINT "ai_lifecycle_operations_idempotency_key_id_fkey" FOREIGN KEY ("idempotency_key_id") REFERENCES "ai_idempotency_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_admin_report_audits" ADD CONSTRAINT "ai_admin_report_audits_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "ai_report_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "adaptive_practice_answers_item_key" RENAME TO "adaptive_practice_answers_adaptive_practice_item_id_key";

-- RenameIndex
ALTER INDEX "adaptive_practice_answers_session_client_key" RENAME TO "adaptive_practice_answers_adaptive_session_id_client_answer_key";

-- RenameIndex
ALTER INDEX "admin_preview_tryout_restarts_preview_student_id_tryout_id_crea" RENAME TO "admin_preview_tryout_restarts_preview_student_id_tryout_id__idx";

-- RenameIndex
ALTER INDEX "ai_admin_command_ledgers_principal_operation_key" RENAME TO "ai_admin_command_ledgers_admin_principal_id_operation_clien_key";

-- RenameIndex
ALTER INDEX "ai_admin_command_ledgers_principal_operation_state_idx" RENAME TO "ai_admin_command_ledgers_admin_principal_id_operation_state_idx";

-- RenameIndex
ALTER INDEX "ai_admin_command_ledgers_state_expires_idx" RENAME TO "ai_admin_command_ledgers_state_expires_at_idx";

-- RenameIndex
ALTER INDEX "ai_export_jobs_owner_state_download_expires_idx" RENAME TO "ai_export_jobs_owner_state_download_expires_at_idx";

-- RenameIndex
ALTER INDEX "ai_export_jobs_state_recovery_deadline_idx" RENAME TO "ai_export_jobs_state_recovery_deadline_at_idx";

-- RenameIndex
ALTER INDEX "ai_export_parts_job_ordinal_idx" RENAME TO "ai_export_parts_export_job_id_ordinal_idx";

-- RenameIndex
ALTER INDEX "ai_export_parts_job_ordinal_key" RENAME TO "ai_export_parts_export_job_id_ordinal_key";

-- RenameIndex
ALTER INDEX "ai_key_destruction_claims_object_lineage_key" RENAME TO "ai_key_destruction_claims_object_type_object_id_key_lineage_key";

-- RenameIndex
ALTER INDEX "ai_key_destruction_claims_operation_state_idx" RENAME TO "ai_key_destruction_claims_operation_id_state_idx";

-- RenameIndex
ALTER INDEX "ai_key_destruction_claims_state_created_idx" RENAME TO "ai_key_destruction_claims_state_created_at_idx";

-- RenameIndex
ALTER INDEX "ai_lifecycle_operations_account_cleanup_correlation_key" RENAME TO "ai_lifecycle_operations_account_cleanup_correlation_digest_key";

-- RenameIndex
ALTER INDEX "ai_lifecycle_operations_operation_correlation_idx" RENAME TO "ai_lifecycle_operations_operation_account_cleanup_correlati_idx";

-- RenameIndex
ALTER INDEX "ai_policy_approval_snapshots_audit_event_key" RENAME TO "ai_policy_approval_snapshots_approval_audit_event_id_key";

-- RenameIndex
ALTER INDEX "ai_policy_approval_snapshots_bundle_revision_key" RENAME TO "ai_policy_approval_snapshots_bundle_id_bundle_revision_key";

-- RenameIndex
ALTER INDEX "ai_purge_work_items_operation_object_key" RENAME TO "ai_purge_work_items_operation_id_object_type_object_id_key";

-- RenameIndex
ALTER INDEX "ai_purge_work_items_state_lease_idx" RENAME TO "ai_purge_work_items_state_lease_expires_at_idx";

-- RenameIndex
ALTER INDEX "ai_report_budget_windows_principal_key_window_kind_window_ends_" RENAME TO "ai_report_budget_windows_principal_key_window_kind_window_e_idx";

-- RenameIndex
ALTER INDEX "ai_report_budget_windows_principal_key_window_kind_window_start" RENAME TO "ai_report_budget_windows_principal_key_window_kind_window_s_key";

-- RenameIndex
ALTER INDEX "ai_report_reservations_principal_operation_key_key" RENAME TO "ai_report_reservations_admin_principal_id_operation_idempot_key";

-- RenameIndex
ALTER INDEX "ai_report_reservations_principal_reserved_at_idx" RENAME TO "ai_report_reservations_admin_principal_id_reserved_at_idx";

-- RenameIndex
ALTER INDEX "ai_report_reservations_state_recovery_deadline_idx" RENAME TO "ai_report_reservations_state_recovery_deadline_at_idx";

-- RenameIndex
ALTER INDEX "ai_retention_hold_releases_hold_version_key" RENAME TO "ai_retention_hold_releases_hold_id_expected_hold_version_key";

-- RenameIndex
ALTER INDEX "ai_retention_hold_releases_state_created_idx" RENAME TO "ai_retention_hold_releases_state_created_at_idx";

-- RenameIndex
ALTER INDEX "ai_retention_holds_student_state_idx" RENAME TO "ai_retention_holds_student_id_state_idx";

-- RenameIndex
ALTER INDEX "ai_retention_holds_subject_state_idx" RENAME TO "ai_retention_holds_subject_type_subject_id_hold_type_state_idx";

-- RenameIndex
ALTER INDEX "assessment_releases_assembly_package_idx" RENAME TO "assessment_releases_assembly_package_id_idx";

-- RenameIndex
ALTER INDEX "assessment_releases_assembly_package_version_idx" RENAME TO "assessment_releases_assembly_package_version_id_idx";

-- RenameIndex
ALTER INDEX "assessment_releases_tryout_content_digest_key" RENAME TO "assessment_releases_tryout_id_content_digest_key";

-- RenameIndex
ALTER INDEX "assessment_releases_tryout_created_idx" RENAME TO "assessment_releases_tryout_id_created_at_idx";

-- RenameIndex
ALTER INDEX "assessment_releases_tryout_release_number_key" RENAME TO "assessment_releases_tryout_id_release_number_key";

-- RenameIndex
ALTER INDEX "enrollment_handoffs_status_expiry_idx" RENAME TO "enrollment_handoffs_status_expires_at_idx";

-- RenameIndex
ALTER INDEX "enrollment_handoffs_user_status_expiry_idx" RENAME TO "enrollment_handoffs_user_id_status_expires_at_idx";

-- RenameIndex
ALTER INDEX "enrollment_import_dispatches_claim_idx" RENAME TO "enrollment_import_dispatches_status_next_attempt_at_claim_e_idx";

-- RenameIndex
ALTER INDEX "enrollment_import_dispatches_import_generation_key" RENAME TO "enrollment_import_dispatches_import_id_generation_key";

-- RenameIndex
ALTER INDEX "enrollment_import_rows_import_email_idx" RENAME TO "enrollment_import_rows_import_id_normalized_email_idx";

-- RenameIndex
ALTER INDEX "enrollment_import_rows_import_status_idx" RENAME TO "enrollment_import_rows_import_id_status_idx";

-- RenameIndex
ALTER INDEX "question_bank_category_assignments_category_id_question_bank_id" RENAME TO "question_bank_category_assignments_category_id_question_ban_idx";

-- RenameIndex
ALTER INDEX "reusable_question_package_ite_package_id_source_question_id_key" RENAME TO "reusable_question_package_items_package_id_source_question__key";

-- RenameIndex
ALTER INDEX "reusable_qpv_bank_scope_bank_version_idx" RENAME TO "reusable_question_package_version_bank_scopes_question_bank_idx";

-- RenameIndex
ALTER INDEX "reusable_qpv_category_scope_category_version_idx" RENAME TO "reusable_question_package_version_category_scopes_category__idx";

-- RenameIndex
ALTER INDEX "reusable_qpv_folder_scope_folder_version_idx" RENAME TO "reusable_question_package_version_folder_scopes_folder_id_p_idx";

-- RenameIndex
ALTER INDEX "reusable_question_package_ver_package_version_item_id_choic_key" RENAME TO "reusable_package_version_option_key";

-- RenameIndex
ALTER INDEX "reusable_question_package_ver_package_version_item_id_sort__key" RENAME TO "reusable_package_version_option_order_key";

-- RenameIndex
ALTER INDEX "reusable_question_package_ver_package_version_id_sort_order_key" RENAME TO "reusable_package_version_item_order_key";

-- RenameIndex
ALTER INDEX "reusable_question_package_ver_package_version_id_source_que_key" RENAME TO "reusable_package_version_item_source_key";

-- RenameIndex
ALTER INDEX "reusable_qpv_rule_version_key" RENAME TO "reusable_question_package_version_rules_package_version_id_key";

-- RenameIndex
ALTER INDEX "reusable_qpv_rules_requested_count_idx" RENAME TO "reusable_question_package_version_rules_requested_count_idx";

-- RenameIndex
ALTER INDEX "reusable_question_package_versions_subtest_mode_status_idx" RENAME TO "reusable_question_package_versions_subtest_id_mode_status_idx";

-- RenameIndex
ALTER INDEX "standalone_quizzes_assembly_version_idx" RENAME TO "standalone_quizzes_assembly_package_version_id_idx";

-- RenameIndex
ALTER INDEX "tryout_admissions_student_status_idx" RENAME TO "tryout_admissions_student_id_status_idx";

-- RenameIndex
ALTER INDEX "tryout_answers_run_item_key" RENAME TO "tryout_answers_attempt_test_run_id_tryout_item_id_key";

-- RenameIndex
ALTER INDEX "tryout_attempt_test_runs_attempt_status_idx" RENAME TO "tryout_attempt_test_runs_attempt_id_status_idx";

-- RenameIndex
ALTER INDEX "tryout_attempts_delivery_session_status_idx" RENAME TO "tryout_attempts_delivery_session_id_status_idx";

-- RenameIndex
ALTER INDEX "tryout_attempts_delivery_session_student_key" RENAME TO "tryout_attempts_delivery_session_id_student_id_key";

-- RenameIndex
ALTER INDEX "tryout_sessions_id_tryout_id_key" RENAME TO "tryout_attempts_id_tryout_id_key";

-- RenameIndex
ALTER INDEX "tryout_sessions_server_deadline_at_idx" RENAME TO "tryout_attempts_server_deadline_at_idx";

-- RenameIndex
ALTER INDEX "tryout_sessions_status_idx" RENAME TO "tryout_attempts_status_idx";

-- RenameIndex
ALTER INDEX "tryout_sessions_student_id_idx" RENAME TO "tryout_attempts_student_id_idx";

-- RenameIndex
ALTER INDEX "tryout_sessions_tryout_id_idx" RENAME TO "tryout_attempts_tryout_id_idx";

-- RenameIndex
ALTER INDEX "tryout_cat_resolution_audits_run_created_idx" RENAME TO "tryout_cat_resolution_audits_run_id_created_at_idx";

-- RenameIndex
ALTER INDEX "tryout_delivery_assignments_session_status_idx" RENAME TO "tryout_delivery_assignments_delivery_session_id_status_idx";

-- RenameIndex
ALTER INDEX "tryout_delivery_audits_admission_created_idx" RENAME TO "tryout_delivery_audits_admission_id_created_at_idx";

-- RenameIndex
ALTER INDEX "tryout_delivery_audits_tryout_created_idx" RENAME TO "tryout_delivery_audits_tryout_id_created_at_idx";

-- RenameIndex
ALTER INDEX "tryout_delivery_sessions_availability_idx" RENAME TO "tryout_delivery_sessions_tryout_id_status_available_from_av_idx";

-- RenameIndex
ALTER INDEX "tryout_delivery_sessions_scheduled_release_idx" RENAME TO "tryout_delivery_sessions_scheduled_release_at_idx";

-- RenameIndex
ALTER INDEX "two_pl_question_calibrations_model_approval_idx" RENAME TO "two_pl_question_calibrations_model_version_approval_state_idx";

-- RenameIndex
ALTER INDEX "two_pl_question_calibrations_question_revision_id_model_version" RENAME TO "two_pl_question_calibrations_question_revision_id_model_ver_key";
