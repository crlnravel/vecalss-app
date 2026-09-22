-- Vera automatic-context foundation. This migration is additive: legacy
-- manual context rows, requests, and request evidence remain untouched.

CREATE TYPE "ai_context_tool_invocation_state" AS ENUM ('planned', 'executing', 'completed', 'failed', 'unavailable');
CREATE TYPE "ai_request_attempt_stage_purpose" AS ENUM ('context_selection', 'answer');

ALTER TABLE "ai_request_attempts"
  ADD COLUMN "stage_purpose" "ai_request_attempt_stage_purpose" NOT NULL DEFAULT 'answer';

ALTER TABLE "ai_context_packs"
  ADD COLUMN "tool_call_digest" VARCHAR(128),
  ADD COLUMN "tool_result_digest" VARCHAR(128),
  ADD COLUMN "registry_version" VARCHAR(120),
  ADD COLUMN "resolver_version" VARCHAR(120),
  ADD COLUMN "source_manifest_digest" VARCHAR(128);

CREATE TABLE "ai_context_tool_invocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_id" UUID NOT NULL,
  "tool_name" VARCHAR(120) NOT NULL,
  "tool_schema_version" VARCHAR(80) NOT NULL,
  "registry_version" VARCHAR(120) NOT NULL,
  "resolver_version" VARCHAR(120) NOT NULL,
  "canonical_arguments_ciphertext" JSONB,
  "arguments_digest" VARCHAR(128),
  "result_manifest_ciphertext" JSONB,
  "result_manifest_digest" VARCHAR(128),
  "result_digest" VARCHAR(128),
  "state" "ai_context_tool_invocation_state" NOT NULL DEFAULT 'planned',
  "selected_source_count" INTEGER NOT NULL DEFAULT 0,
  "result_byte_count" INTEGER NOT NULL DEFAULT 0,
  "truncation_count" INTEGER NOT NULL DEFAULT 0,
  "selector_latency_ms" INTEGER,
  "registry_latency_ms" INTEGER,
  "error_code" VARCHAR(100),
  "planned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executing_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "retention_class" VARCHAR(80) NOT NULL,
  "retention_policy_version" VARCHAR(80) NOT NULL,
  "purge_state" "ai_purge_state" NOT NULL DEFAULT 'available',
  "purge_at" TIMESTAMPTZ NOT NULL,
  "purge_started_at" TIMESTAMPTZ,
  "purged_at" TIMESTAMPTZ,
  "purge_reason" VARCHAR(160),
  "content_key_lineage_digest" VARCHAR(128),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_context_tool_invocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_context_tool_invocations_request_id_key" UNIQUE ("request_id"),
  CONSTRAINT "ai_context_tool_invocations_counts_check" CHECK (
    "selected_source_count" >= 0 AND "selected_source_count" <= 4
    AND "result_byte_count" >= 0
    AND "truncation_count" >= 0
  ),
  CONSTRAINT "ai_context_tool_invocations_digest_envelope_check" CHECK (
    ("canonical_arguments_ciphertext" IS NULL OR "arguments_digest" IS NOT NULL)
    AND ("result_manifest_ciphertext" IS NULL OR "result_manifest_digest" IS NOT NULL)
  ),
  CONSTRAINT "ai_context_tool_invocations_purge_marker_check" CHECK (
    ("purge_state" = 'available' AND "purge_started_at" IS NULL AND "purged_at" IS NULL)
    OR ("purge_state" = 'purging' AND "purge_started_at" IS NOT NULL AND "purged_at" IS NULL)
    OR ("purge_state" = 'purged' AND "purge_started_at" IS NOT NULL AND "purged_at" IS NOT NULL)
  )
);

CREATE INDEX "ai_context_tool_invocations_state_created_idx"
  ON "ai_context_tool_invocations" ("state", "created_at");
CREATE INDEX "ai_context_tool_invocations_purge_state_purge_at_idx"
  ON "ai_context_tool_invocations" ("purge_state", "purge_at");
CREATE INDEX "ai_context_tool_invocations_registry_created_idx"
  ON "ai_context_tool_invocations" ("registry_version", "created_at");
CREATE INDEX "ai_request_attempts_request_stage_purpose_idx"
  ON "ai_request_attempts" ("request_id", "stage_purpose");
CREATE INDEX "ai_context_packs_tool_result_digest_idx"
  ON "ai_context_packs" ("tool_result_digest");

ALTER TABLE "ai_context_tool_invocations"
  ADD CONSTRAINT "ai_context_tool_invocations_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_context_packs"
  ADD CONSTRAINT "ai_context_packs_tool_call_digest_check"
  CHECK ("tool_call_digest" IS NULL OR "tool_call_digest" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "ai_context_packs_tool_result_digest_check"
  CHECK ("tool_result_digest" IS NULL OR "tool_result_digest" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "ai_context_packs_source_manifest_digest_check"
  CHECK ("source_manifest_digest" IS NULL OR "source_manifest_digest" ~ '^[a-f0-9]{64}$');

ALTER TABLE "ai_context_tool_invocations"
  ADD CONSTRAINT "ai_context_tool_invocations_digest_format_check"
  CHECK (
    ("arguments_digest" IS NULL OR "arguments_digest" ~ '^[a-f0-9]{64}$')
    AND ("result_manifest_digest" IS NULL OR "result_manifest_digest" ~ '^[a-f0-9]{64}$')
    AND ("result_digest" IS NULL OR "result_digest" ~ '^[a-f0-9]{64}$')
    AND ("content_key_lineage_digest" IS NULL OR "content_key_lineage_digest" ~ '^[a-f0-9]{64}$')
  );
