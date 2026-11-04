-- MS-19 C-01: the application's runtime login can no longer release a legal hold.
--
-- A hold is placed in the app and released only by the owner, on the owner's own
-- database login (`pnpm retention:release-hold`). The runtime role keeps SELECT
-- and INSERT on legal_holds and loses UPDATE on the three release columns, so a
-- compromised app cannot lift a hold and then call the cleanup functions against
-- what it covered. The one-way release trigger is unchanged and still applies to
-- the owner.
UPDATE "evidence_tables"
SET "update_columns" = ARRAY[]::text[],
    "note" = 'Placed by the app; released only by the owner on the owner login (retention:release-hold)'
WHERE "table_name" = 'legal_holds';

SELECT public.retention_apply_runtime_grants();
