-- MS-19 M-04: the runtime role no longer gets broad rights on tables created later.
--
-- MS-10 set default privileges so every future public table began with SELECT,
-- INSERT, UPDATE and DELETE for vecalss_runtime. A new evidence table that missed
-- the registry therefore started wide open. Now a new table starts with nothing
-- for the runtime role until retention_apply_runtime_grants() runs, and that
-- helper refuses to run while a table with a merchant-evidence name prefix is
-- neither in evidence_tables nor on the short reviewed list of ordinary tables.
-- A migration that adds a table finishes with `SELECT public.retention_apply_runtime_grants();`
-- (docs/evidence-retention-ops.md). Forward-only.
CREATE OR REPLACE FUNCTION public.retention_apply_runtime_grants() RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  t record;
  unregistered text;
  -- Tables whose names look like merchant evidence but were reviewed and are ordinary
  -- mutable tables: the current access state of a student, and the older cohort-risk flag list.
  reviewed_ordinary constant text[] := ARRAY['billing_accounts', 'risk_flags'];
BEGIN
  -- Fail closed: a table that looks like merchant evidence must be classified first.
  SELECT string_agg(c.relname::text, ', ' ORDER BY c.relname) INTO unregistered
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    AND c.relname ~ '^(payment_|refund_|risk_|fraud_|retention_|receipt_|fulfillment_|dispute_|billing_|legal_|environment_|checkout_)'
    AND NOT EXISTS (SELECT 1 FROM public.evidence_tables e WHERE e.table_name = c.relname)
    AND c.relname <> ALL (reviewed_ordinary);
  IF unregistered IS NOT NULL THEN
    RAISE EXCEPTION 'the runtime grants are not applied: % looks like merchant evidence but is not in evidence_tables. Register it in the migration that creates it.', unregistered
      USING ERRCODE = '55000';
  END IF;

  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vecalss_runtime;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM vecalss_runtime;
  -- No broad default for tables and sequences created later (see the header).
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM vecalss_runtime;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM vecalss_runtime;
  GRANT USAGE ON SCHEMA public TO vecalss_runtime;
  -- Nobody but the schema owner creates objects in public.
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  REVOKE CREATE ON SCHEMA public FROM vecalss_runtime;

  FOR t IN
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
      AND NOT EXISTS (SELECT 1 FROM public.evidence_tables e WHERE e.table_name = c.relname)
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO vecalss_runtime', t.relname);
  END LOOP;

  FOR t IN SELECT table_name, runtime_insert, COALESCE(update_columns, ARRAY[]::text[]) AS update_columns FROM public.evidence_tables LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO vecalss_runtime', t.table_name);
    IF t.runtime_insert THEN
      EXECUTE format('GRANT INSERT ON public.%I TO vecalss_runtime', t.table_name);
    END IF;
    IF cardinality(t.update_columns) > 0 THEN
      EXECUTE format('GRANT UPDATE (%s) ON public.%I TO vecalss_runtime',
        (SELECT string_agg(quote_ident(c), ', ') FROM unnest(t.update_columns) AS c), t.table_name);
    END IF;
  END LOOP;

  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vecalss_runtime;

  GRANT EXECUTE ON FUNCTION public.retention_run_scrub(integer), public.retention_run_delete(integer) TO vecalss_runtime;
END;
$fn$;

SELECT public.retention_apply_runtime_grants();
