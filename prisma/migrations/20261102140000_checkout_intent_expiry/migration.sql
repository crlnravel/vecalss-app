-- AlterTable
ALTER TABLE "checkout_intents" ADD COLUMN "expires_at" TIMESTAMPTZ;

-- Existing rows get the same 30 minute window as new ones.
UPDATE "checkout_intents" SET "expires_at" = "created_at" + INTERVAL '30 minutes';

ALTER TABLE "checkout_intents" ALTER COLUMN "expires_at" SET NOT NULL;
