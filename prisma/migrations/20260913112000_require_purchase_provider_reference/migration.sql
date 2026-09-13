-- Every purchase row has a provider identity. This keeps pending checkout
-- attempts traceable and makes succeeded-event retries unambiguously idempotent.
ALTER TABLE "package_purchases"
  ALTER COLUMN "provider_reference" SET NOT NULL;
