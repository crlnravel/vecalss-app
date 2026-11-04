-- MS-18: a refund reason for an order from a regulator, acquirer or court.
-- The new category value is added alone: Postgres does not allow a new enum
-- value to be used in the transaction that adds it, so the next migration uses it.
-- Forward-only.

-- AlterEnum
ALTER TYPE "refund_reason_category" ADD VALUE 'authority_order';
