-- Sprint 2 stage replay guard. The request_id unique key keeps one active
-- stage per logical request; this composite identity makes the normalized
-- result digest an explicit replay boundary for future stage variants.
CREATE UNIQUE INDEX "ai_request_result_stages_request_id_result_digest_key"
ON "ai_request_result_stages"("request_id", "result_digest");

ALTER TABLE "ai_request_result_stages"
  ADD CONSTRAINT "ai_request_result_stages_quota_nonnegative_ck"
  CHECK (
    ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
    AND ("quota_units_consumed" IS NULL OR "quota_units_consumed" >= 0)
    AND "version" >= 0
  );
