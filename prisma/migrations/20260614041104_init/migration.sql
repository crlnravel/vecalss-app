-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'locked', 'disabled', 'soft_deleted');

-- CreateEnum
CREATE TYPE "role_name" AS ENUM ('student', 'tutor', 'admin');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "login_attempt_result" AS ENUM ('success', 'failed', 'locked', 'service_unavailable');

-- CreateEnum
CREATE TYPE "onboarding_status" AS ENUM ('not_started', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "university_type" AS ENUM ('ptn', 'private', 'other');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "module_asset_type" AS ENUM ('text', 'video', 'example', 'attachment');

-- CreateEnum
CREATE TYPE "progress_status" AS ENUM ('locked', 'not_started', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('single_choice', 'multiple_choice', 'free_text');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('easy', 'medium', 'hard', 'adaptive');

-- CreateEnum
CREATE TYPE "tryout_package_type" AS ENUM ('tryout', 'diagnostic');

-- CreateEnum
CREATE TYPE "mission_task_type" AS ENUM ('daily_mission', 'smart_drill');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'expired', 'abandoned', 'scored');

-- CreateEnum
CREATE TYPE "answer_source" AS ENUM ('server', 'client', 'client_offline_buffer');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('pending', 'synced', 'failed', 'discarded');

-- CreateEnum
CREATE TYPE "mission_status" AS ENUM ('assigned', 'in_progress', 'verifying', 'completed', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "badge_status" AS ENUM ('earned', 'revoked');

-- CreateEnum
CREATE TYPE "streak_freeze_status" AS ENUM ('available', 'consumed', 'expired');

-- CreateEnum
CREATE TYPE "ai_conversation_type" AS ENUM ('vera_chat', 'weakness_analysis', 'ptn_strategy', 'smart_drill');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('system', 'user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "ai_request_status" AS ENUM ('pending', 'succeeded', 'failed', 'fallback');

-- CreateEnum
CREATE TYPE "recommendation_status" AS ENUM ('active', 'clicked', 'dismissed', 'completed', 'expired');

-- CreateEnum
CREATE TYPE "announcement_placement" AS ENUM ('landing_top', 'dashboard', 'sidebar', 'breaking');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email', 'push', 'sms');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('queued', 'delivered', 'failed', 'dropped', 'read');

-- CreateEnum
CREATE TYPE "notification_event_type" AS ENUM ('daily_mission', 'tryout_graded', 'tutor_intervention', 'announcement', 'password_reset', 'purchase_receipt', 'inactivity', 'custom');

-- CreateEnum
CREATE TYPE "analytics_event_type" AS ENUM ('page_view', 'dashboard_view', 'recommendation_click', 'module_open', 'quiz_submit', 'tryout_submit', 'ai_interaction', 'notification_click', 'admin_action');

-- CreateEnum
CREATE TYPE "billing_status" AS ENUM ('trial', 'active', 'expired', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "risk_flag_status" AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "intervention_status" AS ENUM ('drafted', 'queued', 'sent', 'read', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_updated_at" TIMESTAMPTZ,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "avatar_url" TEXT,
    "phone" VARCHAR(40),
    "status" "user_status" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "soft_deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'active',
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ,
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "ip_address" INET,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "user_id" UUID,
    "result" "login_attempt_result" NOT NULL,
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role" "role_name" NOT NULL,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(120),
    "onboarding_status" "onboarding_status" NOT NULL DEFAULT 'not_started',
    "target_exam_event_id" UUID,
    "target_university_id" UUID,
    "target_major_id" UUID,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_streak_date" DATE,
    "daily_ai_token_limit" INTEGER NOT NULL DEFAULT 10000,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    "enrolled_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tutor_profiles" (
    "user_id" UUID NOT NULL,
    "headline" VARCHAR(160),
    "bio" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "exam_programs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_program_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "exam_date" DATE,
    "registration_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "short_name" VARCHAR(40),
    "type" "university_type" NOT NULL DEFAULT 'ptn',
    "city" VARCHAR(120),
    "province" VARCHAR(120),
    "official_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "majors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "university_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "faculty" VARCHAR(160),
    "degree_level" VARCHAR(40),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "major_id" UUID NOT NULL,
    "exam_event_id" UUID,
    "year" INTEGER NOT NULL,
    "passing_grade" DECIMAL(6,2),
    "quota" INTEGER,
    "applicants" INTEGER,
    "accepted" INTEGER,
    "source_url" TEXT,
    "audited_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admission_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subtest_id" UUID NOT NULL,
    "parent_topic_id" UUID,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "summary" TEXT,
    "sequence_no" INTEGER NOT NULL,
    "estimated_minutes" INTEGER,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "asset_type" "module_asset_type" NOT NULL,
    "title" VARCHAR(220),
    "body_text" TEXT,
    "media_url" TEXT,
    "duration_seconds" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_prerequisites" (
    "module_id" UUID NOT NULL,
    "prerequisite_module_id" UUID NOT NULL,

    CONSTRAINT "module_prerequisites_pkey" PRIMARY KEY ("module_id","prerequisite_module_id")
);

-- CreateTable
CREATE TABLE "module_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "status" "progress_status" NOT NULL DEFAULT 'locked',
    "percent_complete" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "video_position_seconds" INTEGER NOT NULL DEFAULT 0,
    "scroll_position" INTEGER NOT NULL DEFAULT 0,
    "unlocked_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "last_opened_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_banks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "subtest_id" UUID,
    "topic_id" UUID,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_bank_id" UUID,
    "topic_id" UUID NOT NULL,
    "stem" TEXT NOT NULL,
    "question_type" "question_type" NOT NULL DEFAULT 'single_choice',
    "difficulty" "difficulty_level" NOT NULL DEFAULT 'medium',
    "explanation" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "source" VARCHAR(120),
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "label" VARCHAR(8) NOT NULL,
    "content" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_quizzes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "passing_score" DECIMAL(5,2),
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "module_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,

    CONSTRAINT "quiz_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ,
    "score" DECIMAL(6,2),
    "max_score" DECIMAL(6,2),
    "mastery_delta" DECIMAL(6,2),
    "draft_payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempt_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "answer_text" TEXT,
    "is_correct" BOOLEAN,
    "points_awarded" DECIMAL(6,2),
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryout_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_event_id" UUID,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "assessment_type" "tryout_package_type" NOT NULL DEFAULT 'tryout',
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tryout_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryout_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tryout_id" UUID NOT NULL,
    "subtest_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "question_count" INTEGER NOT NULL,

    CONSTRAINT "tryout_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryout_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tryout_section_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "points" DECIMAL(6,2) NOT NULL DEFAULT 1,

    CONSTRAINT "tryout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryout_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tryout_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "server_started_at" TIMESTAMPTZ NOT NULL,
    "server_deadline_at" TIMESTAMPTZ NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "auto_submitted_at" TIMESTAMPTZ,
    "score" DECIMAL(7,2),
    "percentile_national" DECIMAL(5,2),
    "percentile_cohort" DECIMAL(5,2),
    "disconnect_started_at" TIMESTAMPTZ,
    "total_disconnect_seconds" INTEGER NOT NULL DEFAULT 0,
    "reconciled_at" TIMESTAMPTZ,
    "offline_buffer_cleared_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tryout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryout_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_option_id" UUID,
    "answer_text" TEXT,
    "is_correct" BOOLEAN,
    "points_awarded" DECIMAL(6,2),
    "source" "answer_source" NOT NULL DEFAULT 'client',
    "answered_at" TIMESTAMPTZ,
    "synced_at" TIMESTAMPTZ,

    CONSTRAINT "tryout_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_answer_buffers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "sync_status" NOT NULL DEFAULT 'pending',
    "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "synced_at" TIMESTAMPTZ,

    CONSTRAINT "offline_answer_buffers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryout_score_breakdowns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "subtest_id" UUID NOT NULL,
    "topic_id" UUID,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "wrong_count" INTEGER NOT NULL DEFAULT 0,
    "unanswered_count" INTEGER NOT NULL DEFAULT 0,
    "raw_score" DECIMAL(7,2),
    "scaled_score" DECIMAL(7,2),

    CONSTRAINT "tryout_score_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_topic_performance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "correct_count" INTEGER NOT NULL DEFAULT 0,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "mastery_score" DECIMAL(6,2),
    "latest_score" DECIMAL(6,2),
    "weakness_score" DECIMAL(6,2),
    "last_activity_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_topic_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_subtest_performance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "subtest_id" UUID NOT NULL,
    "latest_score" DECIMAL(6,2),
    "average_score" DECIMAL(6,2),
    "weak_flag" BOOLEAN NOT NULL DEFAULT false,
    "last_tryout_session_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_subtest_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "topic_id" UUID,
    "module_id" UUID,
    "source" VARCHAR(80) NOT NULL,
    "reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "recommendation_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clicked_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "learning_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "event_type" "analytics_event_type" NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" UUID,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "task_type" "mission_task_type" NOT NULL DEFAULT 'daily_mission',
    "topic_id" UUID,
    "question_count" INTEGER NOT NULL DEFAULT 5,
    "completion_rule" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_missions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mission_template_id" UUID NOT NULL,
    "mission_date" DATE NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_mission_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "daily_mission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "daily_mission_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_mission_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "daily_mission_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "mission_status" NOT NULL DEFAULT 'assigned',
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "verification_key" VARCHAR(160),

    CONSTRAINT "daily_mission_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streak_freezes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "status" "streak_freeze_status" NOT NULL DEFAULT 'available',
    "source" VARCHAR(80),
    "earned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "streak_freezes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "criteria" JSONB NOT NULL,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "badge_id" UUID NOT NULL,
    "status" "badge_status" NOT NULL DEFAULT 'earned',
    "earned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_entity_type" VARCHAR(80),
    "source_entity_id" UUID,

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "conversation_type" "ai_conversation_type" NOT NULL,
    "context_entity_type" VARCHAR(80),
    "context_entity_id" UUID,
    "title" VARCHAR(220),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "content_markdown" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "conversation_id" UUID,
    "request_type" "ai_conversation_type" NOT NULL,
    "prompt_template" VARCHAR(120),
    "model" VARCHAR(120),
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "status" "ai_request_status" NOT NULL DEFAULT 'pending',
    "latency_ms" INTEGER,
    "error_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "usage_date" DATE NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "limit_tokens" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weakness_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "conversation_id" UUID,
    "status" "ai_request_status" NOT NULL DEFAULT 'pending',
    "summary_markdown" TEXT,
    "tryout_session_ids" JSONB,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weakness_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weakness_analysis_topics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weakness_analysis_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "module_id" UUID,
    "rank" INTEGER NOT NULL,
    "weakness_score" DECIMAL(6,2),
    "recommendation_text" TEXT,

    CONSTRAINT "weakness_analysis_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptive_practice_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "source_conversation_id" UUID,
    "difficulty" "difficulty_level" NOT NULL DEFAULT 'adaptive',
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "fallback_question_bank_id" UUID,
    "ai_generation_discarded_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ,
    "score" DECIMAL(6,2),

    CONSTRAINT "adaptive_practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adaptive_practice_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adaptive_session_id" UUID NOT NULL,
    "question_id" UUID,
    "generated_item_ref" VARCHAR(80),
    "answer_text" TEXT,
    "is_correct" BOOLEAN,
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptive_practice_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ptn_strategy_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "university_id" UUID,
    "major_id" UUID,
    "conversation_id" UUID,
    "tryout_average_score" DECIMAL(7,2),
    "disclaimer_shown" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ptn_strategy_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "uploaded_by_user_id" UUID,
    "url" TEXT NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT NOT NULL,
    "image_asset_id" UUID,
    "cta_label" VARCHAR(80),
    "cta_url" TEXT,
    "placement" "announcement_placement" NOT NULL DEFAULT 'dashboard',
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_page_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_key" VARCHAR(80) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT,
    "cta_label" VARCHAR(80),
    "cta_url" TEXT,
    "image_asset_id" UUID,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_event_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohort_students" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cohort_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,

    CONSTRAINT "cohort_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_cohort_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tutor_id" UUID NOT NULL,
    "cohort_id" UUID NOT NULL,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "tutor_cohort_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "cohort_id" UUID,
    "flag_type" VARCHAR(80) NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "status" "risk_flag_status" NOT NULL DEFAULT 'open',
    "detected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interventions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tutor_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "cohort_id" UUID,
    "risk_flag_id" UUID,
    "recommended_module_id" UUID,
    "message" TEXT NOT NULL,
    "status" "intervention_status" NOT NULL DEFAULT 'drafted',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "read_at" TIMESTAMPTZ,

    CONSTRAINT "interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "marketing_email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_alerts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_user_id" UUID NOT NULL,
    "event_type" "notification_event_type" NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT NOT NULL,
    "deep_link" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source_entity_type" VARCHAR(80),
    "source_entity_id" UUID,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'queued',
    "provider_message_id" VARCHAR(255),
    "queued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ,
    "failed_at" TIMESTAMPTZ,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "status" "billing_status" NOT NULL DEFAULT 'trial',
    "plan_code" VARCHAR(80),
    "access_starts_at" TIMESTAMPTZ,
    "access_expires_at" TIMESTAMPTZ,
    "extended_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_key" VARCHAR(120) NOT NULL,
    "config_value" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "target_type" VARCHAR(80),
    "target_id" UUID,
    "metadata" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "login_attempts_email_idx" ON "login_attempts"("email");

-- CreateIndex
CREATE INDEX "login_attempts_user_id_idx" ON "login_attempts"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_attempted_at_idx" ON "login_attempts"("attempted_at");

-- CreateIndex
CREATE INDEX "role_assignments_user_id_role_idx" ON "role_assignments"("user_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "exam_programs_code_key" ON "exam_programs"("code");

-- CreateIndex
CREATE INDEX "exam_events_exam_program_id_idx" ON "exam_events"("exam_program_id");

-- CreateIndex
CREATE INDEX "exam_events_exam_date_idx" ON "exam_events"("exam_date");

-- CreateIndex
CREATE INDEX "universities_name_idx" ON "universities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "majors_university_id_name_key" ON "majors"("university_id", "name");

-- CreateIndex
CREATE INDEX "admission_stats_exam_event_id_idx" ON "admission_stats"("exam_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "admission_stats_major_id_year_key" ON "admission_stats"("major_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "subtests_code_key" ON "subtests"("code");

-- CreateIndex
CREATE INDEX "topics_parent_topic_id_idx" ON "topics"("parent_topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_subtest_id_code_key" ON "topics"("subtest_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "modules_code_key" ON "modules"("code");

-- CreateIndex
CREATE INDEX "modules_status_idx" ON "modules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "modules_topic_id_sequence_no_key" ON "modules"("topic_id", "sequence_no");

-- CreateIndex
CREATE INDEX "module_progress_status_idx" ON "module_progress"("status");

-- CreateIndex
CREATE UNIQUE INDEX "module_progress_student_id_module_id_key" ON "module_progress"("student_id", "module_id");

-- CreateIndex
CREATE INDEX "questions_topic_id_idx" ON "questions"("topic_id");

-- CreateIndex
CREATE INDEX "questions_question_bank_id_idx" ON "questions"("question_bank_id");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_id_label_key" ON "question_options"("question_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "module_quizzes_module_id_key" ON "module_quizzes"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_items_quiz_id_question_id_key" ON "quiz_items"("quiz_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_items_quiz_id_sort_order_key" ON "quiz_items"("quiz_id", "sort_order");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_student_id_idx" ON "quiz_attempts"("student_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_status_idx" ON "quiz_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempt_answers_attempt_id_question_id_key" ON "quiz_attempt_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "tryout_packages_code_key" ON "tryout_packages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tryout_sections_tryout_id_sequence_no_key" ON "tryout_sections"("tryout_id", "sequence_no");

-- CreateIndex
CREATE UNIQUE INDEX "tryout_items_tryout_section_id_question_id_key" ON "tryout_items"("tryout_section_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "tryout_items_tryout_section_id_sort_order_key" ON "tryout_items"("tryout_section_id", "sort_order");

-- CreateIndex
CREATE INDEX "tryout_sessions_tryout_id_idx" ON "tryout_sessions"("tryout_id");

-- CreateIndex
CREATE INDEX "tryout_sessions_student_id_idx" ON "tryout_sessions"("student_id");

-- CreateIndex
CREATE INDEX "tryout_sessions_status_idx" ON "tryout_sessions"("status");

-- CreateIndex
CREATE INDEX "tryout_sessions_server_deadline_at_idx" ON "tryout_sessions"("server_deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "tryout_answers_session_id_question_id_key" ON "tryout_answers"("session_id", "question_id");

-- CreateIndex
CREATE INDEX "offline_answer_buffers_session_id_idx" ON "offline_answer_buffers"("session_id");

-- CreateIndex
CREATE INDEX "offline_answer_buffers_student_id_idx" ON "offline_answer_buffers"("student_id");

-- CreateIndex
CREATE INDEX "offline_answer_buffers_status_idx" ON "offline_answer_buffers"("status");

-- CreateIndex
CREATE INDEX "offline_answer_buffers_expires_at_idx" ON "offline_answer_buffers"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tryout_score_breakdowns_session_id_subtest_id_topic_id_key" ON "tryout_score_breakdowns"("session_id", "subtest_id", "topic_id");

-- CreateIndex
CREATE INDEX "student_topic_performance_weakness_score_idx" ON "student_topic_performance"("weakness_score");

-- CreateIndex
CREATE UNIQUE INDEX "student_topic_performance_student_id_topic_id_key" ON "student_topic_performance"("student_id", "topic_id");

-- CreateIndex
CREATE INDEX "student_subtest_performance_weak_flag_idx" ON "student_subtest_performance"("weak_flag");

-- CreateIndex
CREATE UNIQUE INDEX "student_subtest_performance_student_id_subtest_id_key" ON "student_subtest_performance"("student_id", "subtest_id");

-- CreateIndex
CREATE INDEX "learning_recommendations_student_id_idx" ON "learning_recommendations"("student_id");

-- CreateIndex
CREATE INDEX "learning_recommendations_status_idx" ON "learning_recommendations"("status");

-- CreateIndex
CREATE INDEX "learning_recommendations_priority_idx" ON "learning_recommendations"("priority");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events"("user_id");

-- CreateIndex
CREATE INDEX "analytics_events_event_type_idx" ON "analytics_events"("event_type");

-- CreateIndex
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events"("occurred_at");

-- CreateIndex
CREATE INDEX "daily_missions_mission_date_idx" ON "daily_missions"("mission_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_missions_mission_template_id_mission_date_key" ON "daily_missions"("mission_template_id", "mission_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_mission_questions_daily_mission_id_question_id_key" ON "daily_mission_questions"("daily_mission_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_mission_questions_daily_mission_id_sort_order_key" ON "daily_mission_questions"("daily_mission_id", "sort_order");

-- CreateIndex
CREATE INDEX "daily_mission_assignments_status_idx" ON "daily_mission_assignments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_mission_assignments_daily_mission_id_student_id_key" ON "daily_mission_assignments"("daily_mission_id", "student_id");

-- CreateIndex
CREATE INDEX "streak_freezes_student_id_idx" ON "streak_freezes"("student_id");

-- CreateIndex
CREATE INDEX "streak_freezes_status_idx" ON "streak_freezes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "badges_code_key" ON "badges"("code");

-- CreateIndex
CREATE UNIQUE INDEX "student_badges_student_id_badge_id_key" ON "student_badges"("student_id", "badge_id");

-- CreateIndex
CREATE INDEX "ai_conversations_student_id_idx" ON "ai_conversations"("student_id");

-- CreateIndex
CREATE INDEX "ai_conversations_conversation_type_idx" ON "ai_conversations"("conversation_type");

-- CreateIndex
CREATE INDEX "ai_conversations_expires_at_idx" ON "ai_conversations"("expires_at");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_messages_created_at_idx" ON "ai_messages"("created_at");

-- CreateIndex
CREATE INDEX "ai_requests_student_id_idx" ON "ai_requests"("student_id");

-- CreateIndex
CREATE INDEX "ai_requests_conversation_id_idx" ON "ai_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_requests_created_at_idx" ON "ai_requests"("created_at");

-- CreateIndex
CREATE INDEX "ai_requests_status_idx" ON "ai_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_daily_student_id_usage_date_key" ON "ai_usage_daily"("student_id", "usage_date");

-- CreateIndex
CREATE INDEX "weakness_analyses_student_id_idx" ON "weakness_analyses"("student_id");

-- CreateIndex
CREATE INDEX "weakness_analyses_generated_at_idx" ON "weakness_analyses"("generated_at");

-- CreateIndex
CREATE INDEX "weakness_analysis_topics_rank_idx" ON "weakness_analysis_topics"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "weakness_analysis_topics_weakness_analysis_id_topic_id_key" ON "weakness_analysis_topics"("weakness_analysis_id", "topic_id");

-- CreateIndex
CREATE INDEX "adaptive_practice_sessions_student_id_idx" ON "adaptive_practice_sessions"("student_id");

-- CreateIndex
CREATE INDEX "adaptive_practice_sessions_topic_id_idx" ON "adaptive_practice_sessions"("topic_id");

-- CreateIndex
CREATE INDEX "adaptive_practice_sessions_status_idx" ON "adaptive_practice_sessions"("status");

-- CreateIndex
CREATE INDEX "assets_checksum_idx" ON "assets"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "landing_page_sections_section_key_key" ON "landing_page_sections"("section_key");

-- CreateIndex
CREATE INDEX "cohort_students_cohort_id_student_id_idx" ON "cohort_students"("cohort_id", "student_id");

-- CreateIndex
CREATE INDEX "cohort_students_student_id_idx" ON "cohort_students"("student_id");

-- CreateIndex
CREATE INDEX "tutor_cohort_assignments_tutor_id_cohort_id_idx" ON "tutor_cohort_assignments"("tutor_id", "cohort_id");

-- CreateIndex
CREATE INDEX "risk_flags_student_id_idx" ON "risk_flags"("student_id");

-- CreateIndex
CREATE INDEX "risk_flags_cohort_id_idx" ON "risk_flags"("cohort_id");

-- CreateIndex
CREATE INDEX "risk_flags_status_idx" ON "risk_flags"("status");

-- CreateIndex
CREATE INDEX "risk_flags_severity_idx" ON "risk_flags"("severity");

-- CreateIndex
CREATE INDEX "interventions_tutor_id_idx" ON "interventions"("tutor_id");

-- CreateIndex
CREATE INDEX "interventions_student_id_idx" ON "interventions"("student_id");

-- CreateIndex
CREATE INDEX "interventions_status_idx" ON "interventions"("status");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_idx" ON "notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "notifications_event_type_idx" ON "notifications"("event_type");

-- CreateIndex
CREATE INDEX "notifications_read_at_idx" ON "notifications"("read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_source_entity_type_source_entity_id_idx" ON "notifications"("source_entity_type", "source_entity_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_notification_id_idx" ON "notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_channel_idx" ON "notification_deliveries"("channel");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_accounts_student_id_key" ON "billing_accounts"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_config_key_key" ON "system_configs"("config_key");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_target_exam_event_id_fkey" FOREIGN KEY ("target_exam_event_id") REFERENCES "exam_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_target_university_id_fkey" FOREIGN KEY ("target_university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_target_major_id_fkey" FOREIGN KEY ("target_major_id") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_enrolled_by_user_id_fkey" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_exam_program_id_fkey" FOREIGN KEY ("exam_program_id") REFERENCES "exam_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "majors" ADD CONSTRAINT "majors_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_stats" ADD CONSTRAINT "admission_stats_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_stats" ADD CONSTRAINT "admission_stats_exam_event_id_fkey" FOREIGN KEY ("exam_event_id") REFERENCES "exam_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_topic_id_fkey" FOREIGN KEY ("parent_topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_assets" ADD CONSTRAINT "module_assets_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_prerequisites" ADD CONSTRAINT "module_prerequisites_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_prerequisites" ADD CONSTRAINT "module_prerequisites_prerequisite_module_id_fkey" FOREIGN KEY ("prerequisite_module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_bank_id_fkey" FOREIGN KEY ("question_bank_id") REFERENCES "question_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_quizzes" ADD CONSTRAINT "module_quizzes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_items" ADD CONSTRAINT "quiz_items_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "module_quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_items" ADD CONSTRAINT "quiz_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "module_quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_packages" ADD CONSTRAINT "tryout_packages_exam_event_id_fkey" FOREIGN KEY ("exam_event_id") REFERENCES "exam_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_packages" ADD CONSTRAINT "tryout_packages_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_sections" ADD CONSTRAINT "tryout_sections_tryout_id_fkey" FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_sections" ADD CONSTRAINT "tryout_sections_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_tryout_section_id_fkey" FOREIGN KEY ("tryout_section_id") REFERENCES "tryout_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_items" ADD CONSTRAINT "tryout_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_sessions" ADD CONSTRAINT "tryout_sessions_tryout_id_fkey" FOREIGN KEY ("tryout_id") REFERENCES "tryout_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_sessions" ADD CONSTRAINT "tryout_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tryout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_answers" ADD CONSTRAINT "tryout_answers_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_answer_buffers" ADD CONSTRAINT "offline_answer_buffers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tryout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_answer_buffers" ADD CONSTRAINT "offline_answer_buffers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_score_breakdowns" ADD CONSTRAINT "tryout_score_breakdowns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tryout_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_score_breakdowns" ADD CONSTRAINT "tryout_score_breakdowns_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryout_score_breakdowns" ADD CONSTRAINT "tryout_score_breakdowns_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_performance" ADD CONSTRAINT "student_topic_performance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_performance" ADD CONSTRAINT "student_topic_performance_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subtest_performance" ADD CONSTRAINT "student_subtest_performance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subtest_performance" ADD CONSTRAINT "student_subtest_performance_subtest_id_fkey" FOREIGN KEY ("subtest_id") REFERENCES "subtests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subtest_performance" ADD CONSTRAINT "student_subtest_performance_last_tryout_session_id_fkey" FOREIGN KEY ("last_tryout_session_id") REFERENCES "tryout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_recommendations" ADD CONSTRAINT "learning_recommendations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_recommendations" ADD CONSTRAINT "learning_recommendations_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_recommendations" ADD CONSTRAINT "learning_recommendations_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_templates" ADD CONSTRAINT "mission_templates_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_missions" ADD CONSTRAINT "daily_missions_mission_template_id_fkey" FOREIGN KEY ("mission_template_id") REFERENCES "mission_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_mission_questions" ADD CONSTRAINT "daily_mission_questions_daily_mission_id_fkey" FOREIGN KEY ("daily_mission_id") REFERENCES "daily_missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_mission_questions" ADD CONSTRAINT "daily_mission_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_mission_assignments" ADD CONSTRAINT "daily_mission_assignments_daily_mission_id_fkey" FOREIGN KEY ("daily_mission_id") REFERENCES "daily_missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_mission_assignments" ADD CONSTRAINT "daily_mission_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weakness_analyses" ADD CONSTRAINT "weakness_analyses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weakness_analyses" ADD CONSTRAINT "weakness_analyses_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weakness_analysis_topics" ADD CONSTRAINT "weakness_analysis_topics_weakness_analysis_id_fkey" FOREIGN KEY ("weakness_analysis_id") REFERENCES "weakness_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weakness_analysis_topics" ADD CONSTRAINT "weakness_analysis_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weakness_analysis_topics" ADD CONSTRAINT "weakness_analysis_topics_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_sessions" ADD CONSTRAINT "adaptive_practice_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_sessions" ADD CONSTRAINT "adaptive_practice_sessions_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_sessions" ADD CONSTRAINT "adaptive_practice_sessions_source_conversation_id_fkey" FOREIGN KEY ("source_conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_sessions" ADD CONSTRAINT "adaptive_practice_sessions_fallback_question_bank_id_fkey" FOREIGN KEY ("fallback_question_bank_id") REFERENCES "question_banks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_answers" ADD CONSTRAINT "adaptive_practice_answers_adaptive_session_id_fkey" FOREIGN KEY ("adaptive_session_id") REFERENCES "adaptive_practice_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adaptive_practice_answers" ADD CONSTRAINT "adaptive_practice_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptn_strategy_sessions" ADD CONSTRAINT "ptn_strategy_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptn_strategy_sessions" ADD CONSTRAINT "ptn_strategy_sessions_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptn_strategy_sessions" ADD CONSTRAINT "ptn_strategy_sessions_major_id_fkey" FOREIGN KEY ("major_id") REFERENCES "majors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ptn_strategy_sessions" ADD CONSTRAINT "ptn_strategy_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_page_sections" ADD CONSTRAINT "landing_page_sections_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_page_sections" ADD CONSTRAINT "landing_page_sections_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_exam_event_id_fkey" FOREIGN KEY ("exam_event_id") REFERENCES "exam_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohort_students" ADD CONSTRAINT "cohort_students_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohort_students" ADD CONSTRAINT "cohort_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_cohort_assignments" ADD CONSTRAINT "tutor_cohort_assignments_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_cohort_assignments" ADD CONSTRAINT "tutor_cohort_assignments_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_cohort_assignments" ADD CONSTRAINT "tutor_cohort_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_risk_flag_id_fkey" FOREIGN KEY ("risk_flag_id") REFERENCES "risk_flags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_recommended_module_id_fkey" FOREIGN KEY ("recommended_module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_extended_by_user_id_fkey" FOREIGN KEY ("extended_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_configs" ADD CONSTRAINT "system_configs_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
