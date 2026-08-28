-- Vera T11 correction: a legally erased export remains a content-free,
-- non-downloadable audit tombstone.  Preserve its original ready/download
-- metadata while the grant is expired; only pending/materializing/retryable
-- rows must have an empty learner download window.  A failed_terminal row may
-- retain a package only when it is the explicit legal-erasure transition from
-- a previously ready package; an ordinary failure, including a missing-part
-- failure, must not retain ready metadata.
--
-- Forward-only and additive: the original Sprint 5 migration is immutable.
ALTER TABLE "ai_export_jobs"
  DROP CONSTRAINT IF EXISTS "ai_export_jobs_pre_ready_contract_ck";

ALTER TABLE "ai_export_jobs"
  ADD CONSTRAINT "ai_export_jobs_pre_ready_contract_ck" CHECK (
    ("state" NOT IN ('pending', 'materializing', 'failed_retryable')
      OR ("download_ready_at" IS NULL AND "download_expires_at" IS NULL
          AND "snapshot_digest" IS NULL AND "package_bytes" IS NULL))
    AND ("state" <> 'failed_terminal'
      OR ("download_ready_at" IS NULL AND "download_expires_at" IS NULL
          AND "snapshot_digest" IS NULL AND "package_bytes" IS NULL)
      OR ("error_code" = 'export_erased_legal'
          AND "download_ready_at" IS NOT NULL AND "download_expires_at" IS NOT NULL
          AND "snapshot_digest" IS NOT NULL AND "package_bytes" IS NOT NULL))
  );
