-- MS-20 R2B-04: retain the time the job became dead so the daily alert window
-- starts when the failure becomes actionable, even when retries took days.
-- Generated column change from `prisma migrate diff`; existing dead rows get a
-- fresh three-day reporting window because their original transition time is
-- not available.
ALTER TABLE "payment_outbox" ADD COLUMN "dead_at" TIMESTAMPTZ;

UPDATE payment_outbox SET dead_at = now() WHERE status = 'dead' AND dead_at IS NULL;

UPDATE public.evidence_tables
SET update_columns = array_append(COALESCE(update_columns, ARRAY[]::text[]), 'dead_at')
WHERE table_name = 'payment_outbox'
  AND NOT ('dead_at' = ANY(COALESCE(update_columns, ARRAY[]::text[])));

SELECT public.retention_apply_runtime_grants();
