CREATE TYPE "ai_context_decision_state" AS ENUM (
  'shortlisted',
  'dispatching',
  'decided',
  'frozen',
  'failed',
  'unavailable'
);

CREATE TABLE "ai_context_decisions" (
  "request_id" UUID NOT NULL,
  "protocol_version" VARCHAR(80) NOT NULL,
  "selector_kind" VARCHAR(40) NOT NULL DEFAULT 'respan_span01_lite',
  "state" "ai_context_decision_state" NOT NULL DEFAULT 'shortlisted',
  "candidate_map_ciphertext" JSONB NOT NULL,
  "candidate_map_digest" VARCHAR(128) NOT NULL,
  "selector_request_ciphertext" JSONB,
  "selector_request_digest" VARCHAR(128),
  "selector_response_ciphertext" JSONB,
  "selector_response_digest" VARCHAR(128),
  "selector_response_model" VARCHAR(120),
  "selector_log_id" VARCHAR(160),
  "selector_input_tokens" INTEGER,
  "selector_price_snapshot_digest" VARCHAR(128),
  "selector_dispatch_started_at" TIMESTAMPTZ,
  "typed_decision_ciphertext" JSONB,
  "typed_decision_digest" VARCHAR(128),
  "selected_candidate_count" INTEGER NOT NULL DEFAULT 0,
  "selector_cost_usd_micros" BIGINT,
  "selector_cost_provenance" VARCHAR(40),
  "network_dispatch_count" INTEGER NOT NULL DEFAULT 0,
  "frozen_evidence_digest" VARCHAR(128),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ,
  "frozen_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "error_code" VARCHAR(100),
  CONSTRAINT "ai_context_decisions_pkey" PRIMARY KEY ("request_id"),
  CONSTRAINT "ai_context_decisions_request_id_fkey" FOREIGN KEY ("request_id")
    REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_context_decisions_dispatch_check" CHECK (
    ("selector_kind" = 'respan_span01_lite' AND "network_dispatch_count" BETWEEN 0 AND 1)
    OR ("selector_kind" = 'dev_stub' AND "network_dispatch_count" = 0
      AND "selector_cost_usd_micros" = 0 AND "selector_cost_provenance" = 'non_network_stub_v1')
  ),
  CONSTRAINT "ai_context_decisions_known_zero_check" CHECK (
    "selector_cost_usd_micros" IS NULL
    OR ("selector_cost_usd_micros" = 0 AND "selector_cost_provenance" = 'respan_published_free_tier_v1'
      AND "selector_response_model" = 'respan-01-free' AND "selector_price_snapshot_digest" IS NOT NULL)
  ),
  CONSTRAINT "ai_context_decisions_count_check" CHECK ("selected_candidate_count" BETWEEN 0 AND 12)
);

CREATE INDEX "ai_context_decisions_state_created_at_idx"
  ON "ai_context_decisions"("state", "created_at");

ALTER TABLE "ai_request_attempts"
  ADD COLUMN "outbound_payload_ciphertext" JSONB;

CREATE INDEX "modules_published_registry_idx"
  ON "modules"("status", "published_at" DESC, "id");

CREATE INDEX "standalone_quiz_attempts_release_registry_idx"
  ON "standalone_quiz_attempts"("release_state", "status", "release_at" DESC, "id");

CREATE INDEX "standalone_quiz_participations_student_registry_idx"
  ON "standalone_quiz_participations"("student_id", "id");

CREATE INDEX "tryout_attempts_student_release_registry_idx"
  ON "tryout_attempts"("student_id", "release_state", "status", "release_at" DESC, "id");

CREATE INDEX "ai_request_attempts_local_settlement_idx"
  ON "ai_request_attempts"("stage_purpose", "state", "charged_provider_cost_usd_micros");

-- Phase-one metadata searches use case-insensitive contains predicates. Trigram
-- GIN indexes keep those bounded `take` queries searchable on large catalogues.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "modules_title_local_context_trgm_idx"
  ON "modules" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "topics_name_local_context_trgm_idx"
  ON "topics" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "standalone_quizzes_title_local_context_trgm_idx"
  ON "standalone_quizzes" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "tryout_packages_title_local_context_trgm_idx"
  ON "tryout_packages" USING GIN ("title" gin_trgm_ops);
