-- Vera T11 correction: a legally erased export remains a content-free,
-- non-downloadable audit tombstone.  Preserve its original ready/download
-- metadata while the grant is expired; only pending/materializing/retryable
-- rows must have an empty learner download window.
--
-- Forward-only and additive: the original Sprint 5 migration is immutable.
ALTER TABLE "ai_export_jobs"
  DROP CONSTRAINT IF EXISTS "ai_export_jobs_pre_ready_contract_ck";

ALTER TABLE "ai_export_jobs"
  ADD CONSTRAINT "ai_export_jobs_pre_ready_contract_ck" CHECK (
    "state" NOT IN ('pending', 'materializing', 'failed_retryable')
    OR ("download_ready_at" IS NULL AND "download_expires_at" IS NULL)
  );
