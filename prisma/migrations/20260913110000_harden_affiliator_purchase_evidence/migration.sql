-- A succeeded purchase is provider-idempotent and must carry the completion
-- timestamp used by the affiliator conversion log.
ALTER TABLE "package_purchases"
  ADD CONSTRAINT "package_purchases_succeeded_evidence_ck"
  CHECK (
    "status" <> 'succeeded'
    OR ("provider_reference" IS NOT NULL AND "completed_at" IS NOT NULL)
  );
