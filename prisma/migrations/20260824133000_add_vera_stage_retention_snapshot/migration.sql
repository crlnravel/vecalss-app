-- Capture the policy-derived stage retention boundary at admission. Stage
-- workers must never reconstruct a TTL from a later policy or a hardcoded
-- operational default.
ALTER TABLE "ai_requests"
  ADD COLUMN "stage_retention_expires_at" TIMESTAMPTZ;
