-- Vera Sprint 3 product boundary. Additive only: legacy plaintext fields remain
-- present for audited read-only evidence, while all new content is enveloped.

ALTER TABLE "ai_requests"
  ADD COLUMN "output_schema_id" VARCHAR(120),
  ADD COLUMN "output_schema_hash" VARCHAR(128);

ALTER TABLE "ai_request_result_stages"
  ADD COLUMN "output_schema_id" VARCHAR(120),
  ADD COLUMN "output_schema_hash" VARCHAR(128);

ALTER TABLE "ai_artifact_applies"
  ADD COLUMN "registry_key" VARCHAR(100);

UPDATE "ai_artifact_applies"
SET "registry_key" = CASE "target_entity_type"
  WHEN 'LearningRecommendation' THEN 'learning_recommendation.v1'
  WHEN 'AdaptivePracticeSession' THEN 'adaptive_practice_session.v1'
  WHEN 'PtnStrategySession' THEN 'ptn_strategy_session.v1'
  ELSE 'legacy.unknown'
END
WHERE "registry_key" IS NULL;

ALTER TABLE "ai_artifact_applies" ALTER COLUMN "registry_key" SET NOT NULL;

ALTER TABLE "learning_recommendations"
  ADD COLUMN "rationale_envelope" JSONB,
  ADD COLUMN "rationale_digest" VARCHAR(128),
  ADD COLUMN "vera_schema_id" VARCHAR(120),
  ADD COLUMN "vera_schema_hash" VARCHAR(128),
  ADD COLUMN "source_artifact_revision_id" UUID,
  ADD COLUMN "source_artifact_digest" VARCHAR(128),
  ADD COLUMN "applied_artifact_revision_id" UUID,
  ADD COLUMN "applied_artifact_digest" VARCHAR(128),
  ADD COLUMN "materialization_schema_version" VARCHAR(40);

ALTER TABLE "weakness_analyses"
  ADD COLUMN "request_id" UUID,
  ADD COLUMN "result_envelope" JSONB,
  ADD COLUMN "result_digest" VARCHAR(128),
  ADD COLUMN "vera_schema_id" VARCHAR(120),
  ADD COLUMN "vera_schema_hash" VARCHAR(128);

ALTER TABLE "weakness_analysis_topics"
  ADD COLUMN "confidence" DECIMAL(6,5);

ALTER TABLE "adaptive_practice_sessions"
  ADD COLUMN "request_id" UUID,
  ADD COLUMN "result_envelope" JSONB,
  ADD COLUMN "result_digest" VARCHAR(128),
  ADD COLUMN "vera_schema_id" VARCHAR(120),
  ADD COLUMN "vera_schema_hash" VARCHAR(128),
  ADD COLUMN "applied_artifact_revision_id" UUID,
  ADD COLUMN "applied_artifact_digest" VARCHAR(128),
  ADD COLUMN "applied_plan_envelope" JSONB,
  ADD COLUMN "applied_plan_digest" VARCHAR(128),
  ADD COLUMN "submission_client_id" VARCHAR(120),
  ADD COLUMN "submission_fingerprint" VARCHAR(128);

ALTER TABLE "ptn_strategy_sessions"
  ADD COLUMN "request_id" UUID,
  ADD COLUMN "result_envelope" JSONB,
  ADD COLUMN "result_digest" VARCHAR(128),
  ADD COLUMN "vera_schema_id" VARCHAR(120),
  ADD COLUMN "vera_schema_hash" VARCHAR(128),
  ADD COLUMN "applied_artifact_revision_id" UUID,
  ADD COLUMN "applied_artifact_digest" VARCHAR(128),
  ADD COLUMN "applied_strategy_envelope" JSONB,
  ADD COLUMN "applied_strategy_digest" VARCHAR(128);

ALTER TABLE "adaptive_practice_answers"
  ADD COLUMN "client_answer_id" VARCHAR(120),
  ADD COLUMN "answer_fingerprint" VARCHAR(128),
  ADD COLUMN "selected_option_key" VARCHAR(16),
  ADD COLUMN "item_revision_digest" VARCHAR(128),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "adaptive_practice_items"
  ADD COLUMN "candidate_contract_version" VARCHAR(40),
  ADD COLUMN "candidate_source_kind" VARCHAR(40),
  ADD COLUMN "source_attempt_id" UUID,
  ADD COLUMN "source_assessment_item_id" UUID,
  ADD COLUMN "assessment_release_digest" VARCHAR(128),
  ADD COLUMN "render_release_state" VARCHAR(24),
  ADD COLUMN "answer_release_state" VARCHAR(24),
  ADD COLUMN "explanation_release_state" VARCHAR(24);

UPDATE "adaptive_practice_items"
SET "candidate_contract_version" = 'legacy.unverified'
WHERE "candidate_contract_version" IS NULL;

ALTER TABLE "adaptive_practice_items"
  ALTER COLUMN "candidate_contract_version" SET DEFAULT 'vera-drill-v1',
  ALTER COLUMN "candidate_contract_version" SET NOT NULL;

CREATE UNIQUE INDEX "learning_recommendations_source_artifact_revision_id_key"
  ON "learning_recommendations"("source_artifact_revision_id");
CREATE UNIQUE INDEX "weakness_analyses_request_id_key"
  ON "weakness_analyses"("request_id");
CREATE UNIQUE INDEX "adaptive_practice_sessions_request_id_key"
  ON "adaptive_practice_sessions"("request_id");
CREATE UNIQUE INDEX "ptn_strategy_sessions_request_id_key"
  ON "ptn_strategy_sessions"("request_id");
CREATE UNIQUE INDEX "ai_artifacts_request_id_key"
  ON "ai_artifacts"("request_id");
CREATE UNIQUE INDEX "adaptive_practice_answers_session_client_key"
  ON "adaptive_practice_answers"("adaptive_session_id", "client_answer_id");
CREATE UNIQUE INDEX "adaptive_practice_answers_item_key"
  ON "adaptive_practice_answers"("adaptive_practice_item_id");

ALTER TABLE "learning_recommendations"
  ADD CONSTRAINT "learning_recommendations_source_artifact_fkey"
    FOREIGN KEY ("source_artifact_revision_id") REFERENCES "ai_artifacts"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "learning_recommendations_applied_artifact_fkey"
    FOREIGN KEY ("applied_artifact_revision_id") REFERENCES "ai_artifacts"("id") ON DELETE RESTRICT;

ALTER TABLE "weakness_analyses"
  ADD CONSTRAINT "weakness_analyses_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE RESTRICT;

ALTER TABLE "adaptive_practice_sessions"
  ADD CONSTRAINT "adaptive_practice_sessions_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "adaptive_practice_sessions_applied_artifact_fkey"
    FOREIGN KEY ("applied_artifact_revision_id") REFERENCES "ai_artifacts"("id") ON DELETE RESTRICT;

ALTER TABLE "ptn_strategy_sessions"
  ADD CONSTRAINT "ptn_strategy_sessions_request_id_fkey"
    FOREIGN KEY ("request_id") REFERENCES "ai_requests"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ptn_strategy_sessions_applied_artifact_fkey"
    FOREIGN KEY ("applied_artifact_revision_id") REFERENCES "ai_artifacts"("id") ON DELETE RESTRICT;

ALTER TABLE "adaptive_practice_items"
  ADD CONSTRAINT "adaptive_practice_items_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "adaptive_practice_items_question_revision_id_fkey"
    FOREIGN KEY ("question_revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "adaptive_practice_items_candidate_complete_ck" CHECK (
    "candidate_contract_version" <> 'vera-drill-v1'
    OR (
      "candidate_source_kind" IN ('standalone_quiz', 'tryout')
      AND "source_attempt_id" IS NOT NULL
      AND "source_assessment_item_id" IS NOT NULL
      AND "assessment_release_digest" IS NOT NULL
      AND "render_release_state" = 'released'
      AND "answer_release_state" = 'released'
      AND "explanation_release_state" IN ('released', 'unavailable')
    )
  );

ALTER TABLE "adaptive_practice_answers"
  ADD CONSTRAINT "adaptive_practice_answers_version_nonnegative_ck" CHECK ("version" >= 0),
  ADD CONSTRAINT "adaptive_practice_answers_new_contract_ck" CHECK (
    "client_answer_id" IS NULL
    OR (
      "adaptive_practice_item_id" IS NOT NULL
      AND "answer_fingerprint" IS NOT NULL
      AND "selected_option_key" IS NOT NULL
      AND "item_revision_digest" IS NOT NULL
      AND "answer_text" IS NULL
      AND "question_id" IS NULL
    )
  );

CREATE OR REPLACE FUNCTION prevent_vera_sprint3_plaintext_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'learning_recommendations'
     AND (NEW."source_artifact_revision_id" IS NOT NULL OR NEW."applied_artifact_revision_id" IS NOT NULL)
     AND NEW."reason" IS NOT NULL THEN
    RAISE EXCEPTION 'Vera recommendation plaintext reason is read-only legacy evidence';
  END IF;
  IF TG_TABLE_NAME = 'weakness_analyses'
     AND NEW."request_id" IS NOT NULL
     AND NEW."summary_markdown" IS NOT NULL THEN
    RAISE EXCEPTION 'Vera analysis plaintext summary is forbidden';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vera_recommendation_plaintext_guard
BEFORE INSERT OR UPDATE ON "learning_recommendations"
FOR EACH ROW EXECUTE FUNCTION prevent_vera_sprint3_plaintext_write();

CREATE TRIGGER vera_analysis_plaintext_guard
BEFORE INSERT OR UPDATE ON "weakness_analyses"
FOR EACH ROW EXECUTE FUNCTION prevent_vera_sprint3_plaintext_write();

CREATE OR REPLACE FUNCTION prevent_vera_analysis_topic_plaintext_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."recommendation_text" IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM "weakness_analyses"
       WHERE "id" = NEW."weakness_analysis_id" AND "request_id" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Vera analysis topic plaintext recommendation is forbidden';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vera_analysis_topic_plaintext_guard
BEFORE INSERT OR UPDATE ON "weakness_analysis_topics"
FOR EACH ROW EXECUTE FUNCTION prevent_vera_analysis_topic_plaintext_write();

CREATE OR REPLACE FUNCTION prevent_adaptive_practice_item_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'adaptive practice item snapshots are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER adaptive_practice_item_immutable
BEFORE UPDATE ON "adaptive_practice_items"
FOR EACH ROW EXECUTE FUNCTION prevent_adaptive_practice_item_mutation();

-- Extend the existing artifact append-only guard to the new unique request link.
CREATE OR REPLACE FUNCTION prevent_ai_artifact_revision_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id"
     OR NEW."artifact_key" <> OLD."artifact_key"
     OR NEW."revision" <> OLD."revision"
     OR NEW."request_id" IS DISTINCT FROM OLD."request_id"
     OR NEW."student_id" <> OLD."student_id"
     OR NEW."conversation_id" IS DISTINCT FROM OLD."conversation_id"
     OR NEW."artifact_type" <> OLD."artifact_type"
     OR NEW."provenance_kind" <> OLD."provenance_kind"
     OR NEW."title_ciphertext" IS DISTINCT FROM OLD."title_ciphertext"
     OR NEW."content_markdown_ciphertext" IS DISTINCT FROM OLD."content_markdown_ciphertext"
     OR NEW."payload_ciphertext" IS DISTINCT FROM OLD."payload_ciphertext"
     OR NEW."artifact_schema_version" <> OLD."artifact_schema_version"
     OR NEW."source_entity_type" IS DISTINCT FROM OLD."source_entity_type"
     OR NEW."source_entity_id" IS DISTINCT FROM OLD."source_entity_id"
     OR NEW."source_entity_revision" IS DISTINCT FROM OLD."source_entity_revision"
     OR NEW."source_entity_digest" IS DISTINCT FROM OLD."source_entity_digest"
     OR NEW."content_digest" <> OLD."content_digest"
     OR NEW."render_version" <> OLD."render_version"
     OR NEW."retention_policy_version" <> OLD."retention_policy_version"
     OR NEW."created_at" <> OLD."created_at"
     OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at" THEN
    RAISE EXCEPTION 'ai_artifact revisions are append-only';
  END IF;
  RETURN NEW;
END;
$$;
