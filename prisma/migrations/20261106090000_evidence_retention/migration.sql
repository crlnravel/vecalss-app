-- MS-10 phase A: evidence retention and immutability.
-- Forward-only. Adds the retention register, the maintenance path (scrub and
-- delete, run by a dedicated no-login role), legal holds, the environment mark,
-- and the grants that keep the application's runtime role from rewriting or
-- deleting evidence.
--
-- Roles. Two NOLOGIN roles are created here when they do not exist:
--   vecalss_retention  owns the maintenance functions. It is the only role the
--                      freeze triggers let scrub or delete evidence.
--   vecalss_runtime    holds the application's privileges. A login role is made
--                      a member of it by scripts/setup-runtime-role.mjs; the
--                      login is never created, and no password is set, here.
-- This file works for a non-superuser owner that has CREATEROLE (the Neon
-- default). If that owner cannot create roles, create the two NOLOGIN roles
-- first with scripts/setup-runtime-role.mjs and run this migration again.

-- Roles ----------------------------------------------------------------------
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vecalss_retention') THEN
    CREATE ROLE vecalss_retention NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vecalss_runtime') THEN
    CREATE ROLE vecalss_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'MS-10 needs the NOLOGIN roles vecalss_retention and vecalss_runtime. Create them with scripts/setup-runtime-role.mjs (as a role that can create roles), then apply this migration again.';
END
$roles$;

-- The migration owner must be able to hand the maintenance functions to
-- vecalss_retention (ALTER FUNCTION ... OWNER TO needs membership). This makes the
-- owner a member; the runtime login is never a member of vecalss_retention.
GRANT vecalss_retention TO CURRENT_USER;

-- Tables ---------------------------------------------------------------------
-- CreateTable
CREATE TABLE "retention_register_versions" (
    "version" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_register_versions_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "retention_register_rules" (
    "version" INTEGER NOT NULL,
    "record_class" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "financial" BOOLEAN NOT NULL DEFAULT false,
    "period_months" INTEGER,
    "period_days" INTEGER,
    "start_rule" VARCHAR(240) NOT NULL,
    "action_after" VARCHAR(10) NOT NULL,

    CONSTRAINT "retention_register_rules_pkey" PRIMARY KEY ("version","record_class")
);

-- CreateTable
CREATE TABLE "evidence_tables" (
    "table_name" VARCHAR(80) NOT NULL,
    "record_class" VARCHAR(40) NOT NULL,
    "update_columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "runtime_insert" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(240) NOT NULL DEFAULT '',

    CONSTRAINT "evidence_tables_pkey" PRIMARY KEY ("table_name")
);

-- CreateTable
CREATE TABLE "retention_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(10) NOT NULL,
    "record_class" VARCHAR(40) NOT NULL,
    "register_version" INTEGER NOT NULL,
    "batch_limit" INTEGER NOT NULL,
    "examined" INTEGER NOT NULL DEFAULT 0,
    "held_skipped" INTEGER NOT NULL DEFAULT 0,
    "case_skipped" INTEGER NOT NULL DEFAULT 0,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "complete" BOOLEAN NOT NULL DEFAULT true,
    "invoked_by" VARCHAR(64) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_scrubs" (
    "order_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "register_version" INTEGER NOT NULL,
    "scrubbed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_scrubs_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "retention_purges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_class" VARCHAR(40) NOT NULL,
    "subject_table" VARCHAR(80) NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_reference" VARCHAR(120),
    "run_id" UUID NOT NULL,
    "register_version" INTEGER NOT NULL,
    "rows_removed" JSONB NOT NULL DEFAULT '{}',
    "purged_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_purges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" VARCHAR(10) NOT NULL,
    "subject_id" UUID NOT NULL,
    "case_kind" VARCHAR(10),
    "reason" VARCHAR(500) NOT NULL,
    "placed_by_user_id" UUID NOT NULL,
    "placed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ,
    "released_by_user_id" UUID,
    "release_reason" VARCHAR(500),

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_marks" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "environment" VARCHAR(20) NOT NULL,
    "marked_by" VARCHAR(120) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "marked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_runs_started_at_idx" ON "retention_runs"("started_at");

-- CreateIndex
CREATE INDEX "retention_purges_purged_at_idx" ON "retention_purges"("purged_at");

-- CreateIndex
CREATE UNIQUE INDEX "retention_purges_subject_table_subject_id_key" ON "retention_purges"("subject_table", "subject_id");

-- CreateIndex
CREATE INDEX "legal_holds_scope_subject_id_idx" ON "legal_holds"("scope", "subject_id");

-- AddForeignKey
ALTER TABLE "retention_register_rules" ADD CONSTRAINT "retention_register_rules_version_fkey" FOREIGN KEY ("version") REFERENCES "retention_register_versions"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_placed_by_user_id_fkey" FOREIGN KEY ("placed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_holds" ADD CONSTRAINT "legal_holds_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Register rules: what the table itself enforces ------------------------------
ALTER TABLE "retention_register_rules"
  ADD CONSTRAINT "retention_rule_action_check" CHECK ("action_after" IN ('delete', 'scrub', 'external', 'keep')),
  ADD CONSTRAINT "retention_rule_period_check" CHECK (
    ("action_after" = 'keep' AND "period_months" IS NULL AND "period_days" IS NULL)
    OR ("action_after" <> 'keep' AND ("period_months" IS NULL) <> ("period_days" IS NULL))
  ),
  ADD CONSTRAINT "retention_rule_positive_check" CHECK (
    COALESCE("period_months", 1) > 0 AND COALESCE("period_days", 1) > 0
  ),
  -- Financial evidence is never kept for less than six calendar months, and the
  -- period is counted in calendar months, not in days.
  ADD CONSTRAINT "retention_rule_financial_floor_check" CHECK (
    NOT "financial" OR ("period_months" IS NOT NULL AND "period_months" >= 6)
  );

ALTER TABLE "retention_register_rules" ADD CONSTRAINT "retention_rule_class_check" CHECK ("record_class" ~ '^[a-z_]+$');

ALTER TABLE "retention_runs" ADD CONSTRAINT "retention_runs_kind_check" CHECK ("kind" IN ('scrub', 'delete'));
ALTER TABLE "legal_holds"
  ADD CONSTRAINT "legal_holds_scope_check" CHECK (
    ("scope" IN ('order', 'buyer') AND "case_kind" IS NULL)
    OR ("scope" = 'case' AND "case_kind" IN ('refund', 'dispute', 'fraud'))
  ),
  ADD CONSTRAINT "legal_holds_reason_check" CHECK (length(btrim("reason")) >= 10),
  ADD CONSTRAINT "legal_holds_release_check" CHECK (
    ("released_at" IS NULL AND "released_by_user_id" IS NULL AND "release_reason" IS NULL)
    OR ("released_at" IS NOT NULL AND "released_by_user_id" IS NOT NULL AND length(btrim("release_reason")) >= 10)
  );
CREATE INDEX "legal_holds_open_idx" ON "legal_holds" ("scope", "subject_id") WHERE "released_at" IS NULL;
ALTER TABLE "environment_marks" ADD CONSTRAINT "environment_marks_singleton_check" CHECK ("id" = 1 AND "environment" = 'merchant');

-- Append-only rules for the new tables ---------------------------------------
CREATE FUNCTION public.retention_append_only() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$fn$;

CREATE TRIGGER retention_register_versions_immutable BEFORE UPDATE OR DELETE ON "retention_register_versions" FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_register_versions_truncate_immutable BEFORE TRUNCATE ON "retention_register_versions" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_register_rules_immutable BEFORE UPDATE OR DELETE ON "retention_register_rules" FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_register_rules_truncate_immutable BEFORE TRUNCATE ON "retention_register_rules" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_runs_immutable BEFORE UPDATE OR DELETE ON "retention_runs" FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_runs_truncate_immutable BEFORE TRUNCATE ON "retention_runs" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_scrubs_immutable BEFORE UPDATE OR DELETE ON "retention_scrubs" FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_scrubs_truncate_immutable BEFORE TRUNCATE ON "retention_scrubs" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_purges_immutable BEFORE UPDATE OR DELETE ON "retention_purges" FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER retention_purges_truncate_immutable BEFORE TRUNCATE ON "retention_purges" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER environment_marks_immutable BEFORE UPDATE OR DELETE ON "environment_marks" FOR EACH ROW EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER environment_marks_truncate_immutable BEFORE TRUNCATE ON "environment_marks" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER legal_holds_truncate_immutable BEFORE TRUNCATE ON "legal_holds" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();
CREATE TRIGGER evidence_tables_truncate_immutable BEFORE TRUNCATE ON "evidence_tables" FOR EACH STATEMENT EXECUTE FUNCTION public.retention_append_only();

-- A financial class never loses its financial flag in a later version.
CREATE FUNCTION public.retention_rule_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.retention_register_rules r
    WHERE r.record_class = NEW.record_class AND r.version < NEW.version AND r.financial AND NOT NEW.financial
  ) THEN
    RAISE EXCEPTION 'a financial record class stays financial in every later version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER retention_register_rules_guard BEFORE INSERT ON "retention_register_rules" FOR EACH ROW EXECUTE FUNCTION public.retention_rule_guard();

-- Holds: placed once, released once, never deleted ----------------------------
CREATE FUNCTION public.guard_legal_hold_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal holds are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.released_at IS NOT NULL THEN
      RAISE EXCEPTION 'a legal hold is placed open' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (NEW.scope = 'order' AND EXISTS (SELECT 1 FROM public.payment_orders WHERE id = NEW.subject_id))
      OR (NEW.scope = 'buyer' AND EXISTS (SELECT 1 FROM public.users WHERE id = NEW.subject_id))
      OR (NEW.scope = 'case' AND NEW.case_kind = 'refund' AND EXISTS (SELECT 1 FROM public.refund_cases WHERE id = NEW.subject_id))
      OR (NEW.scope = 'case' AND NEW.case_kind = 'dispute' AND EXISTS (SELECT 1 FROM public.payment_disputes WHERE id = NEW.subject_id))
      OR (NEW.scope = 'case' AND NEW.case_kind = 'fraud' AND EXISTS (SELECT 1 FROM public.fraud_cases WHERE id = NEW.subject_id))
    ) THEN
      RAISE EXCEPTION 'a legal hold must name an existing order, buyer or case' USING ERRCODE = '23514';
    END IF;
    NEW.placed_at := now();
    RETURN NEW;
  END IF;

  -- Only a release changes a hold, once, on database time.
  IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
    RAISE EXCEPTION 'a legal hold can only be released, once' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(OLD) - 'released_at' - 'released_by_user_id' - 'release_reason')
     IS DISTINCT FROM (to_jsonb(NEW) - 'released_at' - 'released_by_user_id' - 'release_reason') THEN
    RAISE EXCEPTION 'what a legal hold covers cannot be changed' USING ERRCODE = '55000';
  END IF;
  NEW.released_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER legal_holds_guard BEFORE INSERT OR UPDATE OR DELETE ON "legal_holds" FOR EACH ROW EXECUTE FUNCTION public.guard_legal_hold_change();

-- Calendar arithmetic ---------------------------------------------------------
-- Periods count on the Asia/Jakarta calendar, on database time. A start day that
-- does not exist in the end month (31 Aug + 6 months, 29 Feb + a year) ends at
-- the first instant of the next month, so a period is never shorter than named.
CREATE FUNCTION public.retention_period_end(p_anchor timestamptz, p_months integer, p_days integer) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  local_start timestamp;
  local_end timestamp;
BEGIN
  IF p_anchor IS NULL THEN
    RETURN NULL;
  END IF;
  local_start := p_anchor AT TIME ZONE 'Asia/Jakarta';
  IF p_months IS NOT NULL THEN
    local_end := local_start + make_interval(months => p_months);
    IF extract(day FROM local_end) <> extract(day FROM local_start) THEN
      local_end := date_trunc('month', local_end) + interval '1 month';
    END IF;
  ELSE
    local_end := local_start + make_interval(days => p_days);
  END IF;
  RETURN local_end AT TIME ZONE 'Asia/Jakarta';
END;
$fn$;

CREATE FUNCTION public.retention_active_version() RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT max(version) FROM public.retention_register_versions
$fn$;

-- The end of a class's period for a start event, under a register version
-- (the newest by default). 'infinity' when the class is kept, NULL for no start.
CREATE FUNCTION public.retention_rule_end(p_class text, p_anchor timestamptz, p_version integer DEFAULT NULL) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  rule public.retention_register_rules%ROWTYPE;
BEGIN
  IF p_anchor IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO rule FROM public.retention_register_rules
  WHERE version = COALESCE(p_version, public.retention_active_version()) AND record_class = p_class;
  IF NOT FOUND OR (rule.period_months IS NULL AND rule.period_days IS NULL) THEN
    RETURN 'infinity';
  END IF;
  RETURN public.retention_period_end(p_anchor, rule.period_months, rule.period_days);
END;
$fn$;

-- Register version 1: the G4 decisions of 3 November 2026 -----------------------
INSERT INTO "retention_register_versions" ("version", "note") VALUES
  (1, 'Versi 1 (5 November 2026): periode dari keputusan G4 (3 November 2026). Titik mulai adalah default pelaksana dan bisa diubah lewat versi baru. Akuntan masih perlu mengonfirmasi 10 tahun.');

INSERT INTO "retention_register_rules" ("version", "record_class", "label", "financial", "period_months", "period_days", "start_rule", "action_after") VALUES
  (1, 'order_family', 'Pesanan dan catatan yang terkait', true, 120, NULL, 'paid_at pesanan, atau created_at bila tidak pernah dibayar; catatan terkait ikut jam pesanan', 'delete'),
  (1, 'case_record', 'Kasus sengketa dan pengembalian dana', true, 24, NULL, 'penutupan kasus; tidak pernah lebih pendek dari periode pesanan', 'delete'),
  (1, 'buyer_ip_device', 'Alamat IP dan bukti perangkat pembeli', false, 12, NULL, 'created_at pesanan (transaksi)', 'scrub'),
  (1, 'fraud_case', 'Kasus fraud, peristiwa, dan banding', false, 24, NULL, 'penutupan kasus', 'delete'),
  (1, 'fraud_block', 'Blokir yang berakhir dan peristiwanya', false, 24, NULL, 'saat blokir berakhir (ended_at)', 'delete'),
  (1, 'checkout_intent', 'Niat checkout tanpa pesanan', false, NULL, 30, 'expires_at niat', 'delete'),
  (1, 'risk_policy', 'Versi dan aktivasi kebijakan risiko', false, 120, NULL, 'pembuatan versi', 'delete'),
  (1, 'risk_counter', 'Penghitung harian batas transaksi', false, 120, NULL, 'tanggal penghitung', 'delete'),
  (1, 'security_log', 'Log keamanan (percobaan masuk, atur ulang sandi, gagal MFA)', false, NULL, 90, 'dijalankan pekerjaan harian MS-16', 'external'),
  (1, 'audit_log', 'Log audit', false, NULL, NULL, 'tidak dipangkas; hanya IP pada baris pembayaran dibersihkan bersama pesanannya', 'keep'),
  (1, 'billing_access', 'Riwayat akses penagihan', false, NULL, NULL, 'tidak dipangkas', 'keep');

-- Holds and case state, as the maintenance functions read them ------------------
CREATE FUNCTION public.retention_buyer_held(p_user uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.legal_holds h WHERE h.released_at IS NULL AND h.scope = 'buyer' AND h.subject_id = p_user)
$fn$;

CREATE FUNCTION public.retention_order_held(p_order uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.legal_holds h
    WHERE h.released_at IS NULL AND (
      (h.scope = 'order' AND h.subject_id = p_order)
      OR (h.scope = 'buyer' AND h.subject_id = (SELECT buyer_id FROM public.payment_orders WHERE id = p_order))
      OR (h.scope = 'case' AND (
        (h.case_kind = 'refund' AND h.subject_id IN (SELECT id FROM public.refund_cases WHERE order_id = p_order))
        OR (h.case_kind = 'dispute' AND h.subject_id IN (SELECT id FROM public.payment_disputes WHERE order_id = p_order))
        OR (h.case_kind = 'fraud' AND h.subject_id IN (SELECT id FROM public.fraud_cases WHERE order_id = p_order))
      ))
    )
  )
  OR EXISTS (SELECT 1 FROM public.refund_cases WHERE order_id = p_order AND evidence_hold)
  OR EXISTS (SELECT 1 FROM public.payment_disputes WHERE order_id = p_order AND evidence_hold)
$fn$;

CREATE FUNCTION public.retention_fraud_case_held(p_case uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.fraud_cases c
    WHERE c.id = p_case AND (
      EXISTS (SELECT 1 FROM public.legal_holds h WHERE h.released_at IS NULL AND h.scope = 'case' AND h.case_kind = 'fraud' AND h.subject_id = c.id)
      OR (c.user_id IS NOT NULL AND public.retention_buyer_held(c.user_id))
      OR (c.order_id IS NOT NULL AND public.retention_order_held(c.order_id))
    )
  )
$fn$;

-- When the cases on an order stop needing its evidence: NULL with no case,
-- 'infinity' while any case is open, otherwise the latest case period end.
CREATE FUNCTION public.retention_case_end(p_order uuid) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  latest timestamptz := NULL;
  r record;
BEGIN
  FOR r IN SELECT state::text AS state, COALESCE(closed_at, completed_at) AS closed FROM public.refund_cases WHERE order_id = p_order LOOP
    IF r.state IN ('prepared', 'approved', 'processing') OR r.closed IS NULL THEN
      RETURN 'infinity';
    END IF;
    latest := GREATEST(latest, public.retention_rule_end('case_record', r.closed));
  END LOOP;
  FOR r IN SELECT state::text AS state, resolved_at AS closed FROM public.payment_disputes WHERE order_id = p_order LOOP
    IF r.state = 'open' OR r.closed IS NULL THEN
      RETURN 'infinity';
    END IF;
    latest := GREATEST(latest, public.retention_rule_end('case_record', r.closed));
  END LOOP;
  FOR r IN SELECT state::text AS state, closed_at AS closed FROM public.fraud_cases WHERE order_id = p_order LOOP
    IF r.state <> 'closed' OR r.closed IS NULL THEN
      RETURN 'infinity';
    END IF;
    latest := GREATEST(latest, public.retention_rule_end('fraud_case', r.closed));
  END LOOP;
  RETURN latest;
END;
$fn$;

-- The end of an order's own period, never earlier than its cases need.
CREATE FUNCTION public.retention_order_end(p_order uuid) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  base timestamptz;
BEGIN
  SELECT public.retention_rule_end('order_family', COALESCE(paid_at, created_at)) INTO base
  FROM public.payment_orders WHERE id = p_order;
  RETURN GREATEST(base, public.retention_case_end(p_order));
END;
$fn$;

-- The end of the IP and device period: 12 months from the transaction, and not
-- before the cases on the order have run their own periods.
CREATE FUNCTION public.retention_ip_end(p_order uuid) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  base timestamptz;
BEGIN
  SELECT public.retention_rule_end('buyer_ip_device', created_at) INTO base
  FROM public.payment_orders WHERE id = p_order;
  RETURN GREATEST(base, public.retention_case_end(p_order));
END;
$fn$;

CREATE FUNCTION public.retention_add(p_counts jsonb, p_key text, p_n integer) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT jsonb_set(COALESCE(p_counts, '{}'::jsonb), ARRAY[p_key], to_jsonb(COALESCE((p_counts ->> p_key)::integer, 0) + COALESCE(p_n, 0)))
$fn$;

-- The freeze and guard triggers, with one role-checked exception ----------------------
-- Each function below is the live definition from MS-05 to MS-09 plus a block at the
-- top that applies only when current_user is vecalss_retention (see the comments).
-- No session setting or other value the runtime role can set takes part in the check.

CREATE OR REPLACE FUNCTION public.guard_dispute_export_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  moving text[] := ARRAY['packet', 'downloaded_at', 'packet_purged_at'];
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'dispute exports are never deleted' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a dispute export record cannot be changed' USING ERRCODE = '55000';
  END IF;

  -- The packet can only be dropped, never replaced; a download is recorded once.
  IF NEW.packet IS NOT NULL AND NEW.packet IS DISTINCT FROM OLD.packet THEN
    RAISE EXCEPTION 'a dispute export packet cannot be replaced' USING ERRCODE = '55000';
  END IF;
  IF OLD.downloaded_at IS NOT NULL AND NEW.downloaded_at IS DISTINCT FROM OLD.downloaded_at THEN
    RAISE EXCEPTION 'a dispute export download is recorded once' USING ERRCODE = '55000';
  END IF;
  IF OLD.packet_purged_at IS NOT NULL AND NEW.packet_purged_at IS DISTINCT FROM OLD.packet_purged_at THEN
    RAISE EXCEPTION 'a dispute export purge is recorded once' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_fraud_appeal_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  moving text[] := ARRAY['state', 'decided_at', 'decision_reason', 'reopen_count', 'version', 'due_at'];
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fraud appeals are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'pending' OR NEW.version <> 1 OR NEW.reopen_count <> 0 THEN
      RAISE EXCEPTION 'a new fraud appeal starts pending' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a fraud appeal as received cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a fraud appeal change must carry the next version' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'pending' AND NEW.state IN ('granted', 'denied') THEN
    IF NEW.decided_at IS NULL OR char_length(btrim(coalesce(NEW.decision_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'an appeal decision records when and why' USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.state = 'denied' AND NEW.state = 'pending' THEN
    IF NEW.reopen_count <> OLD.reopen_count + 1 OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'reopening an appeal is counted and clears the decision' USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'a fraud appeal cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_fraud_block_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  moving text[] := ARRAY['status', 'version', 'expires_at', 'review_due_at', 'ended_at', 'last_event_id', 'updated_at'];
  expected_kind text;
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fraud blocks are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.status <> 'active' OR NEW.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new fraud block starts active at version 1' USING ERRCODE = '23514';
    END IF;
    IF NEW.source = 'manual' AND NEW.block_type IN ('account', 'email', 'phone') AND NEW.expires_at IS NOT NULL THEN
      RAISE EXCEPTION 'a manual account, email or phone block lasts until lifted' USING ERRCODE = '23514';
    END IF;
    PERFORM assert_fraud_block_lifetime(NEW.block_type, NEW.source, NEW.expires_at, NEW.review_due_at, true);
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a fraud block identifier, type, source and reason cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION 'a % fraud block cannot change any more', OLD.status USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a fraud block change must carry the next version' USING ERRCODE = '55000';
  END IF;

  IF NEW.status <> 'active' THEN
    IF NEW.ended_at IS NULL OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.review_due_at IS DISTINCT FROM OLD.review_due_at THEN
      RAISE EXCEPTION 'ending a fraud block records when, and nothing else' USING ERRCODE = '55000';
    END IF;
    expected_kind := NEW.status::text;
  ELSE
    IF NEW.ended_at IS NOT NULL
      OR (NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at AND NEW.review_due_at IS NOT DISTINCT FROM OLD.review_due_at) THEN
      RAISE EXCEPTION 'a renewal changes the end or review date' USING ERRCODE = '55000';
    END IF;
    PERFORM assert_fraud_block_lifetime(NEW.block_type, NEW.source, NEW.expires_at, NEW.review_due_at, false);
    expected_kind := 'renewed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fraud_block_events e
    WHERE e.id = NEW.last_event_id AND e.block_id = OLD.id AND e.block_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a fraud block change needs its history row first' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_fraud_case_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'severity', 'owner_user_id', 'hit_count', 'last_seen_at', 'evidence',
    'acknowledged_at', 'escalated_at', 'closed_at', 'closure_reason', 'last_event_id', 'updated_at'
  ];
  expected_kind text;
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fraud cases are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state <> 'open' THEN
      RAISE EXCEPTION 'a new fraud case starts open at version 1' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    RAISE EXCEPTION 'what a fraud case is about cannot be changed' USING ERRCODE = '55000';
  END IF;
  IF NEW.severity < OLD.severity THEN
    RAISE EXCEPTION 'a fraud case severity only goes up' USING ERRCODE = '55000';
  END IF;
  IF NEW.hit_count < OLD.hit_count THEN
    RAISE EXCEPTION 'a fraud case hit count only goes up' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = OLD.state THEN
    IF NEW.version <> OLD.version
      OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
      OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
      OR NEW.escalated_at IS DISTINCT FROM OLD.escalated_at
      OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.closure_reason IS DISTINCT FROM OLD.closure_reason
      OR NEW.last_event_id IS DISTINCT FROM OLD.last_event_id
    THEN
      RAISE EXCEPTION 'a fraud case only changes its state through a recorded step' USING ERRCODE = '55000';
    END IF;
    IF OLD.state = 'closed' AND to_jsonb(OLD) - 'updated_at' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' THEN
      RAISE EXCEPTION 'a closed fraud case does not take new hits' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'open' AND NEW.state IN ('acknowledged', 'escalated', 'closed'))
    OR (OLD.state = 'acknowledged' AND NEW.state IN ('escalated', 'closed'))
    OR (OLD.state = 'escalated' AND NEW.state = 'closed')
    OR (OLD.state = 'closed' AND NEW.state = 'open')
  ) THEN
    RAISE EXCEPTION 'a fraud case cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a fraud case step must carry the next version' USING ERRCODE = '55000';
  END IF;
  IF NEW.state = 'closed' AND (NEW.closed_at IS NULL OR NEW.closure_reason IS NULL) THEN
    RAISE EXCEPTION 'closing a fraud case records when and why' USING ERRCODE = '55000';
  END IF;

  expected_kind := CASE NEW.state
    WHEN 'acknowledged' THEN 'acknowledged'
    WHEN 'escalated' THEN 'escalated'
    WHEN 'closed' THEN 'closed'
    ELSE 'reopened'
  END;
  IF NOT EXISTS (
    SELECT 1 FROM fraud_case_events e
    WHERE e.id = NEW.last_event_id AND e.case_id = OLD.id AND e.case_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a fraud case step needs its history row first' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_payment_dispute_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'evidence_hold', 'access_paused', 'refund_in_flight', 'resolved_at',
    'resolved_by_user_id', 'resolution_source', 'resolution_note', 'access_effect', 'last_event_id', 'updated_at'
  ];
  expected_kind text;
  capture integer;
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment disputes are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'open' OR NEW.version <> 1 OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new dispute starts open at version 1' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM payment_orders WHERE id = NEW.order_id FOR UPDATE;
    capture := refund_capture_amount(NEW.order_id, NEW.provider_payment_id);
    IF capture <= 0 OR NEW.amount_rupiah > capture THEN
      RAISE EXCEPTION 'a dispute must name a captured payment and no more than it' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    RAISE EXCEPTION 'what a dispute is about cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF OLD.state <> 'open' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'a resolved dispute cannot be changed' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state = 'open' THEN
    IF NEW.version <> OLD.version OR NEW.last_event_id IS DISTINCT FROM OLD.last_event_id
      OR NEW.resolved_at IS NOT NULL OR NEW.evidence_hold IS DISTINCT FROM OLD.evidence_hold
      OR (OLD.access_paused AND NOT NEW.access_paused)
      OR (OLD.refund_in_flight AND NOT NEW.refund_in_flight) THEN
      RAISE EXCEPTION 'an open dispute only gains access and refund notes' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a dispute step must carry the next version' USING ERRCODE = '55000';
  END IF;
  IF NEW.resolved_at IS NULL OR NEW.resolution_source IS NULL OR NEW.resolution_note IS NULL
    OR length(btrim(NEW.resolution_note)) < 3 OR NEW.evidence_hold THEN
    RAISE EXCEPTION 'resolving a dispute records when, by whom and why' USING ERRCODE = '55000';
  END IF;
  IF NEW.resolution_source NOT IN ('owner', 'provider_event') THEN
    RAISE EXCEPTION 'a dispute is resolved by the owner or a provider event' USING ERRCODE = '55000';
  END IF;

  expected_kind := CASE NEW.state WHEN 'won' THEN 'resolved_won' ELSE 'resolved_lost' END;
  IF NOT EXISTS (
    SELECT 1 FROM payment_dispute_events e
    WHERE e.id = NEW.last_event_id AND e.dispute_id = OLD.id AND e.dispute_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a dispute step needs its history row first' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_payment_order_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  moving text[] := ARRAY[
    'status', 'status_changed_at', 'status_reason', 'paid_at', 'provider_reference',
    'session_url', 'session_attempts', 'session_requested_at', 'package_purchase_id', 'updated_at'
  ];
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  -- Retention exception (MS-10): the scrub nulls the buyer's IP and device token and nothing else.
  IF TG_OP = 'UPDATE' AND current_user = 'vecalss_retention'
    AND (to_jsonb(OLD) - 'buyer_ip' - 'device_lookup_token') = (to_jsonb(NEW) - 'buyer_ip' - 'device_lookup_token')
    AND NEW.buyer_ip IS NULL AND NEW.device_lookup_token IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'payment orders are never deleted' USING ERRCODE = '55000';
  END IF;

  -- The quote, buyer, package, amount, provider identity and buyer-IP evidence
  -- are frozen at creation.
  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a payment order snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('paid', 'failed', 'expired', 'review'))
    OR (OLD.status IN ('failed', 'expired') AND NEW.status = 'review')
    -- The owner's decision to accept a payment that was held for review.
    OR (OLD.status = 'review' AND NEW.status = 'paid')
  ) THEN
    RAISE EXCEPTION 'payment order cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '55000';
  END IF;

  -- Set once, never replaced or cleared.
  IF OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR OLD.session_url IS NOT NULL AND NEW.session_url IS DISTINCT FROM OLD.session_url
    OR OLD.package_purchase_id IS NOT NULL AND NEW.package_purchase_id IS DISTINCT FROM OLD.package_purchase_id
    OR OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at
  THEN
    RAISE EXCEPTION 'a payment order link cannot be replaced' USING ERRCODE = '55000';
  END IF;

  IF NEW.session_attempts < OLD.session_attempts THEN
    RAISE EXCEPTION 'session attempts only increase' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_payment_receipt_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  moving text[] := ARRAY[
    'delivery_status', 'pending_reason', 'access_plan_code', 'grant_event_id',
    'valid_from', 'valid_until', 'granted_at'
  ];
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'payment receipts are never deleted' USING ERRCODE = '55000';
  END IF;

  -- What was bought, for how much and under which terms is frozen.
  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a payment receipt snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;

  -- Delivery happens once and is never undone or rewritten.
  IF OLD.delivery_status = 'delivered' AND (to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
    RAISE EXCEPTION 'a delivered receipt cannot be changed' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_refund_case_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  mutable text[] := ARRAY[
    'state', 'version', 'approved_by_user_id', 'approved_at', 'approval_reason', 'self_approved',
    'eligibility_approved', 'payout_due_at', 'revoke_access', 'closed_by_user_id', 'closed_at',
    'closure_reason', 'method', 'provider_refund_id', 'execution_attempts', 'last_attempt_at',
    'outcome_unknown', 'destination_masked', 'destination_holder', 'transfer_reference', 'proof_note',
    'confirmed_by_user_id', 'completed_at', 'confirmation_source', 'confirmation_event_id',
    'access_effect', 'evidence_hold', 'last_event_id', 'updated_at'
  ];
  expected_kind text;
  order_row payment_orders%ROWTYPE;
  capture integer;
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund cases are never deleted' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version <> 1 OR NEW.state <> 'prepared' THEN
      RAISE EXCEPTION 'a new refund case starts prepared at version 1' USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by_user_id IS NOT NULL OR NEW.method IS NOT NULL OR NEW.completed_at IS NOT NULL
      OR NEW.provider_refund_id IS NOT NULL OR NEW.execution_attempts <> 0 THEN
      RAISE EXCEPTION 'a new refund case carries no approval or execution' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO order_row FROM payment_orders WHERE id = NEW.order_id;
    capture := refund_capture_amount(NEW.order_id, NEW.provider_payment_id);
    IF order_row.id IS NULL OR order_row.buyer_id <> NEW.buyer_id OR order_row.currency <> NEW.currency THEN
      RAISE EXCEPTION 'a refund case must name the paid order, its buyer and currency' USING ERRCODE = '23514';
    END IF;
    IF capture <= 0 OR NEW.amount_rupiah > capture THEN
      RAISE EXCEPTION 'a refund cannot be more than the captured payment' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable) THEN
    RAISE EXCEPTION 'what a refund case is about cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF OLD.state IN ('completed', 'rejected', 'cancelled', 'failed') THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      RAISE EXCEPTION 'a % refund case cannot be changed', OLD.state USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  -- Set once, never replaced or cleared.
  IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN
    RAISE EXCEPTION 'the provider refund id cannot be replaced' USING ERRCODE = '55000';
  END IF;
  IF NEW.execution_attempts < OLD.execution_attempts THEN
    RAISE EXCEPTION 'execution attempts only increase' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = OLD.state THEN
    -- Inside one state only the execution bookkeeping of a refund with the provider moves.
    IF NEW.version <> OLD.version
      OR NEW.last_event_id IS DISTINCT FROM OLD.last_event_id
      OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approval_reason IS DISTINCT FROM OLD.approval_reason
      OR NEW.self_approved IS DISTINCT FROM OLD.self_approved
      OR NEW.eligibility_approved IS DISTINCT FROM OLD.eligibility_approved
      OR NEW.payout_due_at IS DISTINCT FROM OLD.payout_due_at
      OR NEW.revoke_access IS DISTINCT FROM OLD.revoke_access
      OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.confirmation_source IS DISTINCT FROM OLD.confirmation_source
      OR NEW.evidence_hold IS DISTINCT FROM OLD.evidence_hold
      OR NEW.method IS DISTINCT FROM OLD.method
    THEN
      RAISE EXCEPTION 'a refund case only changes its state through a recorded step' USING ERRCODE = '55000';
    END IF;
    IF OLD.state <> 'processing' AND (
      NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id
      OR NEW.execution_attempts <> OLD.execution_attempts
      OR NEW.last_attempt_at IS DISTINCT FROM OLD.last_attempt_at
      OR NEW.outcome_unknown IS DISTINCT FROM OLD.outcome_unknown
    ) THEN
      RAISE EXCEPTION 'only a refund with the provider takes execution updates' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'prepared' AND NEW.state IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.state = 'approved' AND NEW.state IN ('processing', 'completed', 'cancelled'))
    OR (OLD.state = 'processing' AND NEW.state IN ('completed', 'failed'))
  ) THEN
    RAISE EXCEPTION 'a refund case cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'a refund case step must carry the next version' USING ERRCODE = '55000';
  END IF;

  expected_kind := CASE NEW.state
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'processing' THEN 'execution_started'
    WHEN 'completed' THEN 'completed'
    ELSE 'failed'
  END;
  IF NOT EXISTS (
    SELECT 1 FROM refund_case_events e
    WHERE e.id = NEW.last_event_id AND e.case_id = OLD.id AND e.case_version = NEW.version AND e.kind = expected_kind
  ) THEN
    RAISE EXCEPTION 'a refund case step needs its history row first' USING ERRCODE = '55000';
  END IF;

  -- Lock the order first: approvals, executions and disputes for one order run one after the other.
  IF NEW.state IN ('approved', 'processing', 'completed') AND OLD.state IN ('prepared', 'approved') THEN
    PERFORM 1 FROM payment_orders WHERE id = OLD.order_id FOR UPDATE;
  END IF;

  IF NEW.state = 'approved' THEN
    IF NEW.approved_by_user_id IS NULL OR NEW.approved_at IS NULL OR NEW.payout_due_at IS NULL
      OR NEW.eligibility_approved IS NULL OR NEW.self_approved IS NULL
      OR NEW.approval_reason IS NULL OR length(btrim(NEW.approval_reason)) < 10 THEN
      RAISE EXCEPTION 'approving a refund records who, when, why, the eligibility check and the payout deadline' USING ERRCODE = '55000';
    END IF;
    IF NEW.self_approved IS DISTINCT FROM (NEW.approved_by_user_id = NEW.prepared_by_user_id) THEN
      RAISE EXCEPTION 'a refund approved by its own preparer is stored as self-approved' USING ERRCODE = '55000';
    END IF;
    -- The owner approves against the system's own check, which the database
    -- repeats from the order and the usage evidence rather than trusting the
    -- stored copy alone.
    IF NEW.reason_category = 'change_of_mind' AND (
      (NEW.eligibility_approved ->> 'eligible') IS DISTINCT FROM 'true'
      OR NOT refund_change_of_mind_eligible(NEW.order_id, NEW.requested_at)
    ) THEN
      RAISE EXCEPTION 'a change-of-mind refund that fails the eligibility check cannot be approved' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.state IN ('approved', 'processing') OR (NEW.state = 'completed' AND OLD.state = 'approved') THEN
    IF EXISTS (
      SELECT 1 FROM payment_disputes d
      WHERE d.order_id = OLD.order_id AND d.provider_payment_id = OLD.provider_payment_id AND d.state = 'open'
    ) THEN
      RAISE EXCEPTION 'a refund cannot be approved or executed while a dispute is open on the payment' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.state = 'approved' THEN
    capture := refund_capture_amount(OLD.order_id, OLD.provider_payment_id);
    IF refund_balance_used(OLD.order_id, OLD.provider_payment_id, OLD.id) + NEW.amount_rupiah > capture THEN
      RAISE EXCEPTION 'refunds cannot be more than the captured payment' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.state = 'processing' AND NEW.method IS DISTINCT FROM 'provider' THEN
    RAISE EXCEPTION 'only a provider refund is processed' USING ERRCODE = '55000';
  END IF;

  IF NEW.state = 'completed' THEN
    IF NEW.completed_at IS NULL OR NEW.confirmation_source IS NULL OR NEW.evidence_hold THEN
      RAISE EXCEPTION 'completing a refund records when and by what confirmation' USING ERRCODE = '55000';
    END IF;
    IF OLD.state = 'approved' THEN
      IF NEW.method IS DISTINCT FROM 'manual_transfer' OR NEW.confirmation_source <> 'owner_manual'
        OR NEW.confirmed_by_user_id IS NULL OR NEW.destination_masked IS NULL OR NEW.destination_holder IS NULL
        OR NEW.transfer_reference IS NULL OR NEW.proof_note IS NULL THEN
        RAISE EXCEPTION 'a manual transfer is completed with its destination, reference, proof and the owner who confirmed it' USING ERRCODE = '55000';
      END IF;
    ELSE
      IF NEW.method IS DISTINCT FROM 'provider' OR NEW.confirmation_source NOT IN ('provider_event', 'provider_status')
        OR NEW.provider_refund_id IS NULL THEN
        RAISE EXCEPTION 'a provider refund completes only on a verified provider confirmation' USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;

  IF NEW.state IN ('rejected', 'cancelled', 'failed') THEN
    IF NEW.closed_at IS NULL OR NEW.closure_reason IS NULL OR length(btrim(NEW.closure_reason)) < 3 OR NEW.evidence_hold THEN
      RAISE EXCEPTION 'ending a refund case records when and why' USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.guard_risk_reservation_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
DECLARE
  moving text[] := ARRAY['state', 'state_reason', 'state_changed_at'];
BEGIN
  -- Retention exception (MS-10): only the dedicated no-login owner of the maintenance
  -- functions may delete, and the runtime role can never become that role.
  IF TG_OP = 'DELETE' AND current_user = 'vecalss_retention' THEN
    RETURN OLD;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'risk reservations are never deleted' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(OLD) - moving) IS DISTINCT FROM (to_jsonb(NEW) - moving) THEN
    RAISE EXCEPTION 'a risk reservation snapshot cannot be changed' USING ERRCODE = '55000';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state AND NOT (
    (OLD.state = 'pending' AND NEW.state IN ('paid', 'released', 'review'))
    OR (OLD.state = 'released' AND NEW.state = 'review')
    OR (OLD.state = 'review' AND NEW.state = 'paid')
  ) THEN
    RAISE EXCEPTION 'risk reservation cannot move from % to %', OLD.state, NEW.state USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
BEGIN
  -- Retention exception (MS-10): the scrub removes the IP and user agent of payment-related rows
  -- and changes nothing else. Rows are never deleted.
  IF current_user = 'vecalss_retention' AND TG_LEVEL = 'ROW' AND TG_OP = 'UPDATE' THEN
    IF (OLD.action LIKE 'payment.%' OR OLD.target_type IN ('payment_order', 'payment_event', 'checkout_intent'))
      AND (to_jsonb(OLD) - 'ip_address' - 'user_agent') = (to_jsonb(NEW) - 'ip_address' - 'user_agent')
      AND NEW.ip_address IS NULL AND NEW.user_agent IS NULL
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit logs are immutable' USING ERRCODE = '55000';
END;
$guard$;

CREATE OR REPLACE FUNCTION public.prevent_payment_record_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $guard$
BEGIN
  -- Retention exceptions (MS-10), for the no-login owner of the maintenance functions only.
  IF current_user = 'vecalss_retention' AND TG_LEVEL = 'ROW' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    -- The scrub removes a provider caller's IP from an event and changes nothing else.
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'payment_events'
      AND (to_jsonb(OLD) - 'caller_ip') = (to_jsonb(NEW) - 'caller_ip') AND NEW.caller_ip IS NULL
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION '% records are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$guard$;

-- The maintenance path ----------------------------------------------------------
-- Every run writes one row per class to retention_runs. Only the functions below
-- (owned by vecalss_retention) write it; the application role can read it.
CREATE FUNCTION public.retention_log_run(
  p_id uuid, p_kind text, p_class text, p_version integer, p_limit integer,
  p_examined integer, p_held integer, p_case integer, p_counts jsonb, p_complete boolean, p_started timestamptz
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.retention_runs (id, kind, record_class, register_version, batch_limit, examined, held_skipped, case_skipped, counts, complete, invoked_by, started_at, finished_at)
  VALUES (p_id, p_kind, p_class, p_version, p_limit, p_examined, p_held, p_case, p_counts, p_complete, left(session_user::text, 64), p_started, clock_timestamp());
END;
$fn$;

-- Scrub: removes IP and device evidence once its period has passed, unless the
-- order is held or has a case that still needs it. The order and the rest of its
-- record stay. Safe to run twice: a scrubbed row is no longer a candidate.
CREATE FUNCTION public.retention_run_scrub(p_limit integer DEFAULT 200) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_version integer := public.retention_active_version();
  v_rule public.retention_register_rules%ROWTYPE;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
  v_run uuid := gen_random_uuid();
  v_started timestamptz := clock_timestamp();
  v_counts jsonb := '{}'::jsonb;
  v_examined integer := 0;
  v_held integer := 0;
  v_case integer := 0;
  v_more boolean := false;
  r record;
  n integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('retention:scrub', 0)) THEN
    RETURN jsonb_build_object('busy', true);
  END IF;

  SELECT * INTO v_rule FROM public.retention_register_rules WHERE version = v_version AND record_class = 'buyer_ip_device';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the retention register has no buyer_ip_device rule';
  END IF;

  -- What is past its period but waits: held, or an open or recent case.
  SELECT count(*) FILTER (WHERE public.retention_order_held(o.id)),
         count(*) FILTER (WHERE NOT public.retention_order_held(o.id) AND public.retention_ip_end(o.id) > now())
    INTO v_held, v_case
  FROM public.payment_orders o
  WHERE public.retention_period_end(o.created_at, v_rule.period_months, v_rule.period_days) <= now()
    AND (o.buyer_ip IS NOT NULL OR o.device_lookup_token IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.payment_events e WHERE e.order_id = o.id AND e.caller_ip IS NOT NULL));

  FOR r IN
    SELECT o.id
    FROM public.payment_orders o
    WHERE public.retention_period_end(o.created_at, v_rule.period_months, v_rule.period_days) <= now()
      AND (o.buyer_ip IS NOT NULL OR o.device_lookup_token IS NOT NULL
           OR EXISTS (SELECT 1 FROM public.payment_events e WHERE e.order_id = o.id AND e.caller_ip IS NOT NULL))
      AND NOT public.retention_order_held(o.id)
      AND public.retention_ip_end(o.id) <= now()
    ORDER BY o.created_at
    LIMIT v_limit + 1
  LOOP
    IF v_examined >= v_limit THEN
      v_more := true;
      EXIT;
    END IF;
    v_examined := v_examined + 1;

    UPDATE public.payment_orders SET buyer_ip = NULL, device_lookup_token = NULL
    WHERE id = r.id AND (buyer_ip IS NOT NULL OR device_lookup_token IS NOT NULL);
    GET DIAGNOSTICS n = ROW_COUNT;
    v_counts := public.retention_add(v_counts, 'payment_orders', n);

    UPDATE public.payment_events SET caller_ip = NULL WHERE order_id = r.id AND caller_ip IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    v_counts := public.retention_add(v_counts, 'payment_events', n);

    -- The payment audit rows of this order carried the same address.
    UPDATE public.audit_logs SET ip_address = NULL, user_agent = NULL
    WHERE (ip_address IS NOT NULL OR user_agent IS NOT NULL) AND (
      (target_type = 'payment_order' AND target_id = r.id)
      OR (target_type = 'payment_event' AND target_id IN (SELECT id FROM public.payment_events WHERE order_id = r.id))
      OR (target_type = 'checkout_intent' AND target_id = (SELECT intent_id FROM public.payment_orders WHERE id = r.id))
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    v_counts := public.retention_add(v_counts, 'audit_logs', n);

    INSERT INTO public.retention_scrubs (order_id, run_id, register_version) VALUES (r.id, v_run, v_version)
    ON CONFLICT (order_id) DO NOTHING;
  END LOOP;

  -- Events no order claims (quarantined, unmatched): their own clock, unless a
  -- fraud case still points at them.
  UPDATE public.payment_events SET caller_ip = NULL
  WHERE id IN (
    SELECT e.id FROM public.payment_events e
    WHERE e.order_id IS NULL AND e.caller_ip IS NOT NULL
      AND public.retention_period_end(e.received_at, v_rule.period_months, v_rule.period_days) <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.fraud_cases c
        WHERE c.payment_event_id = e.id
          AND (c.state <> 'closed' OR c.closed_at IS NULL OR public.retention_rule_end('fraud_case', c.closed_at) > now()
               OR public.retention_fraud_case_held(c.id))
      )
    LIMIT v_limit
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := public.retention_add(v_counts, 'payment_events_unmatched', n);

  -- Payment audit rows with no order behind them (refused checkouts, unmatched events).
  UPDATE public.audit_logs SET ip_address = NULL, user_agent = NULL
  WHERE id IN (
    SELECT a.id FROM public.audit_logs a
    WHERE a.ip_address IS NOT NULL AND a.action LIKE 'payment.%'
      AND public.retention_period_end(a.occurred_at, v_rule.period_months, v_rule.period_days) <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_orders o
        WHERE (a.target_type = 'payment_order' AND o.id = a.target_id)
           OR (a.target_type = 'checkout_intent' AND o.intent_id = a.target_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_events e
        WHERE a.target_type = 'payment_event' AND e.id = a.target_id AND e.order_id IS NOT NULL
      )
    LIMIT v_limit
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := public.retention_add(v_counts, 'audit_logs_unlinked', n);

  PERFORM public.retention_log_run(v_run, 'scrub', 'buyer_ip_device', v_version, v_limit, v_examined, v_held, v_case, v_counts, NOT v_more, v_started);
  RETURN jsonb_build_object('class', 'buyer_ip_device', 'complete', NOT v_more, 'counts', v_counts, 'examined', v_examined,
                            'heldSkipped', v_held, 'caseSkipped', v_case, 'registerVersion', v_version, 'runId', v_run);
END;
$fn$;

-- Delete: removes what is past its period and not held, in dependency order,
-- a whole order family at a time. Rows a retained row still needs are never
-- deleted: a family with a case still in its period, or a fraud case still
-- pointing at it, stays whole.
CREATE FUNCTION public.retention_run_delete(p_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_version integer := public.retention_active_version();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_started timestamptz;
  v_run uuid;
  v_counts jsonb;
  v_examined integer;
  v_held integer;
  v_case integer;
  v_more boolean;
  v_failed integer;
  v_summary jsonb := '[]'::jsonb;
  v_tables text[];
  v_sql text[];
  v_row jsonb;
  r record;
  n integer;
  i integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('retention:delete', 0)) THEN
    RETURN jsonb_build_object('busy', true);
  END IF;

  -- 1. Fraud cases, 2 years after closure ------------------------------------
  v_started := clock_timestamp(); v_run := gen_random_uuid(); v_counts := '{}'::jsonb;
  v_examined := 0; v_case := 0; v_more := false; v_failed := 0;
  SELECT count(*) INTO v_held FROM public.fraud_cases c
  WHERE c.state = 'closed' AND c.closed_at IS NOT NULL
    AND public.retention_rule_end('fraud_case', c.closed_at) <= now() AND public.retention_fraud_case_held(c.id);
  v_tables := ARRAY['fraud_case_events', 'fraud_case_blocks', 'fraud_appeals', 'fraud_cases'];
  v_sql := ARRAY[
    'DELETE FROM public.fraud_case_events WHERE case_id = $1',
    'DELETE FROM public.fraud_case_blocks WHERE case_id = $1',
    'DELETE FROM public.fraud_appeals WHERE case_id = $1',
    'DELETE FROM public.fraud_cases WHERE id = $1'
  ];
  FOR r IN
    SELECT c.id FROM public.fraud_cases c
    WHERE c.state = 'closed' AND c.closed_at IS NOT NULL
      AND public.retention_rule_end('fraud_case', c.closed_at) <= now()
      AND NOT public.retention_fraud_case_held(c.id)
    ORDER BY c.closed_at LIMIT v_limit + 1
  LOOP
    IF v_examined >= v_limit THEN v_more := true; EXIT; END IF;
    v_examined := v_examined + 1;
    BEGIN
      v_row := '{}'::jsonb;
      FOR i IN 1..array_length(v_tables, 1) LOOP
        EXECUTE v_sql[i] USING r.id;
        GET DIAGNOSTICS n = ROW_COUNT;
        v_row := public.retention_add(v_row, v_tables[i], n);
        v_counts := public.retention_add(v_counts, v_tables[i], n);
      END LOOP;
      INSERT INTO public.retention_purges (record_class, subject_table, subject_id, run_id, register_version, rows_removed)
      VALUES ('fraud_case', 'fraud_cases', r.id, v_run, v_version, v_row);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;
  v_counts := public.retention_add(v_counts, 'failed', v_failed);
  PERFORM public.retention_log_run(v_run, 'delete', 'fraud_case', v_version, v_limit, v_examined, v_held, v_case, v_counts, NOT v_more, v_started);
  v_summary := v_summary || jsonb_build_object('class', 'fraud_case', 'counts', v_counts, 'complete', NOT v_more, 'heldSkipped', v_held);

  -- 2. Blocks, 2 years after they ended ---------------------------------------
  -- A block a retained case still links to or appeals against waits with it.
  v_started := clock_timestamp(); v_run := gen_random_uuid(); v_counts := '{}'::jsonb;
  v_examined := 0; v_case := 0; v_more := false; v_failed := 0;
  SELECT count(*) INTO v_held FROM public.fraud_blocks b
  WHERE b.status IN ('lifted', 'expired') AND b.ended_at IS NOT NULL
    AND public.retention_rule_end('fraud_block', b.ended_at) <= now()
    AND b.subject_user_id IS NOT NULL AND public.retention_buyer_held(b.subject_user_id);
  SELECT count(*) INTO v_case FROM public.fraud_blocks b
  WHERE b.status IN ('lifted', 'expired') AND b.ended_at IS NOT NULL
    AND public.retention_rule_end('fraud_block', b.ended_at) <= now()
    AND (EXISTS (SELECT 1 FROM public.fraud_case_blocks cb WHERE cb.block_id = b.id)
         OR EXISTS (SELECT 1 FROM public.fraud_appeals a WHERE a.block_id = b.id));
  v_tables := ARRAY['fraud_block_events', 'fraud_blocks'];
  v_sql := ARRAY[
    'DELETE FROM public.fraud_block_events WHERE block_id = $1',
    'DELETE FROM public.fraud_blocks WHERE id = $1'
  ];
  FOR r IN
    SELECT b.id FROM public.fraud_blocks b
    WHERE b.status IN ('lifted', 'expired') AND b.ended_at IS NOT NULL
      AND public.retention_rule_end('fraud_block', b.ended_at) <= now()
      AND NOT EXISTS (SELECT 1 FROM public.fraud_case_blocks cb WHERE cb.block_id = b.id)
      AND NOT EXISTS (SELECT 1 FROM public.fraud_appeals a WHERE a.block_id = b.id)
      AND NOT (b.subject_user_id IS NOT NULL AND public.retention_buyer_held(b.subject_user_id))
    ORDER BY b.ended_at LIMIT v_limit + 1
  LOOP
    IF v_examined >= v_limit THEN v_more := true; EXIT; END IF;
    v_examined := v_examined + 1;
    BEGIN
      v_row := '{}'::jsonb;
      FOR i IN 1..array_length(v_tables, 1) LOOP
        EXECUTE v_sql[i] USING r.id;
        GET DIAGNOSTICS n = ROW_COUNT;
        v_row := public.retention_add(v_row, v_tables[i], n);
        v_counts := public.retention_add(v_counts, v_tables[i], n);
      END LOOP;
      INSERT INTO public.retention_purges (record_class, subject_table, subject_id, run_id, register_version, rows_removed)
      VALUES ('fraud_block', 'fraud_blocks', r.id, v_run, v_version, v_row);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;
  v_counts := public.retention_add(v_counts, 'failed', v_failed);
  PERFORM public.retention_log_run(v_run, 'delete', 'fraud_block', v_version, v_limit, v_examined, v_held, v_case, v_counts, NOT v_more, v_started);
  v_summary := v_summary || jsonb_build_object('class', 'fraud_block', 'counts', v_counts, 'complete', NOT v_more, 'heldSkipped', v_held);

  -- 3. Orders and everything linked to them -----------------------------------
  v_started := clock_timestamp(); v_run := gen_random_uuid(); v_counts := '{}'::jsonb;
  v_examined := 0; v_more := false; v_failed := 0;
  SELECT count(*) INTO v_held FROM public.payment_orders o
  WHERE public.retention_rule_end('order_family', COALESCE(o.paid_at, o.created_at)) <= now() AND public.retention_order_held(o.id);
  SELECT count(*) INTO v_case FROM public.payment_orders o
  WHERE public.retention_rule_end('order_family', COALESCE(o.paid_at, o.created_at)) <= now()
    AND NOT public.retention_order_held(o.id) AND public.retention_order_end(o.id) > now();
  v_tables := ARRAY[
    'dispute_exports', 'receipt_deliveries', 'payment_receipts', 'fulfillment_usage_events',
    'refund_case_events', 'refund_cases', 'payment_dispute_events', 'payment_disputes',
    'risk_reservations', 'payment_outbox', 'payment_events', 'payment_orders',
    'checkout_intents', 'package_purchases'
  ];
  v_sql := ARRAY[
    'DELETE FROM public.dispute_exports WHERE order_id = $1',
    'DELETE FROM public.receipt_deliveries WHERE receipt_id IN (SELECT id FROM public.payment_receipts WHERE order_id = $1)',
    'DELETE FROM public.payment_receipts WHERE order_id = $1',
    'DELETE FROM public.fulfillment_usage_events WHERE order_id = $1',
    'DELETE FROM public.refund_case_events WHERE case_id IN (SELECT id FROM public.refund_cases WHERE order_id = $1)',
    'DELETE FROM public.refund_cases WHERE order_id = $1',
    'DELETE FROM public.payment_dispute_events WHERE dispute_id IN (SELECT id FROM public.payment_disputes WHERE order_id = $1)',
    'DELETE FROM public.payment_disputes WHERE order_id = $1',
    'DELETE FROM public.risk_reservations WHERE order_id = $1',
    'DELETE FROM public.payment_outbox WHERE order_id = $1',
    'DELETE FROM public.payment_events WHERE order_id = $1',
    'DELETE FROM public.payment_orders WHERE id = $1',
    'DELETE FROM public.checkout_intents WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM public.payment_orders WHERE intent_id = $2)',
    'DELETE FROM public.package_purchases WHERE id = $3 AND NOT EXISTS (SELECT 1 FROM public.payment_orders WHERE package_purchase_id = $3)'
  ];
  FOR r IN
    SELECT o.id, o.reference, o.intent_id, o.package_purchase_id FROM public.payment_orders o
    WHERE public.retention_rule_end('order_family', COALESCE(o.paid_at, o.created_at)) <= now()
      AND public.retention_order_end(o.id) <= now()
      AND NOT public.retention_order_held(o.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.fraud_cases c
        WHERE c.order_id = o.id OR c.payment_event_id IN (SELECT id FROM public.payment_events WHERE order_id = o.id)
      )
    ORDER BY o.created_at LIMIT v_limit + 1
  LOOP
    IF v_examined >= v_limit THEN v_more := true; EXIT; END IF;
    v_examined := v_examined + 1;
    BEGIN
      v_row := '{}'::jsonb;
      FOR i IN 1..array_length(v_tables, 1) LOOP
        EXECUTE v_sql[i] USING r.id, r.intent_id, r.package_purchase_id;
        GET DIAGNOSTICS n = ROW_COUNT;
        v_row := public.retention_add(v_row, v_tables[i], n);
        v_counts := public.retention_add(v_counts, v_tables[i], n);
      END LOOP;
      INSERT INTO public.retention_purges (record_class, subject_table, subject_id, subject_reference, run_id, register_version, rows_removed)
      VALUES ('order_family', 'payment_orders', r.id, r.reference, v_run, v_version, v_row);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Events no order claims, once their own period has passed.
  DELETE FROM public.payment_events
  WHERE id IN (
    SELECT e.id FROM public.payment_events e
    WHERE e.order_id IS NULL
      AND public.retention_rule_end('order_family', e.received_at) <= now()
      AND NOT EXISTS (SELECT 1 FROM public.fraud_cases c WHERE c.payment_event_id = e.id)
    LIMIT v_limit
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := public.retention_add(v_counts, 'payment_events_unmatched', n);
  v_counts := public.retention_add(v_counts, 'failed', v_failed);
  PERFORM public.retention_log_run(v_run, 'delete', 'order_family', v_version, v_limit, v_examined, v_held, v_case, v_counts, NOT v_more, v_started);
  v_summary := v_summary || jsonb_build_object('class', 'order_family', 'counts', v_counts, 'complete', NOT v_more, 'heldSkipped', v_held, 'caseSkipped', v_case);

  -- 4. Checkout intents that never became an order ------------------------------
  v_started := clock_timestamp(); v_run := gen_random_uuid(); v_counts := '{}'::jsonb; v_case := 0;
  SELECT count(*) INTO v_held FROM public.checkout_intents i
  WHERE public.retention_rule_end('checkout_intent', i.expires_at) <= now()
    AND NOT EXISTS (SELECT 1 FROM public.payment_orders o WHERE o.intent_id = i.id)
    AND public.retention_buyer_held(i.buyer_id);
  DELETE FROM public.checkout_intents
  WHERE id IN (
    SELECT i.id FROM public.checkout_intents i
    WHERE public.retention_rule_end('checkout_intent', i.expires_at) <= now()
      AND NOT EXISTS (SELECT 1 FROM public.payment_orders o WHERE o.intent_id = i.id)
      AND NOT public.retention_buyer_held(i.buyer_id)
    ORDER BY i.expires_at LIMIT v_limit
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := public.retention_add(v_counts, 'checkout_intents', n);
  PERFORM public.retention_log_run(v_run, 'delete', 'checkout_intent', v_version, v_limit, n, v_held, 0, v_counts, n < v_limit, v_started);
  v_summary := v_summary || jsonb_build_object('class', 'checkout_intent', 'counts', v_counts, 'complete', n < v_limit, 'heldSkipped', v_held);

  -- 5. Risk policy versions nothing retained still points at --------------------
  v_started := clock_timestamp(); v_run := gen_random_uuid(); v_counts := '{}'::jsonb;
  v_examined := 0; v_more := false; v_failed := 0; v_held := 0;
  SELECT count(*) INTO v_case FROM public.risk_policy_versions v
  WHERE public.retention_rule_end('risk_policy', v.created_at) <= now()
    AND (EXISTS (SELECT 1 FROM public.risk_reservations rr WHERE rr.policy_version = v.version)
         OR EXISTS (SELECT 1 FROM public.fraud_cases fc WHERE fc.policy_version = v.version));
  FOR r IN
    SELECT v.id, v.version FROM public.risk_policy_versions v
    WHERE public.retention_rule_end('risk_policy', v.created_at) <= now()
      AND NOT EXISTS (SELECT 1 FROM public.risk_reservations rr WHERE rr.policy_version = v.version)
      AND NOT EXISTS (SELECT 1 FROM public.fraud_cases fc WHERE fc.policy_version = v.version)
      AND v.version < (SELECT max(version) FROM public.risk_policy_versions)
      AND v.id IS DISTINCT FROM (SELECT policy_version_id FROM public.risk_policy_activations ORDER BY id DESC LIMIT 1)
    ORDER BY v.version LIMIT v_limit + 1
  LOOP
    IF v_examined >= v_limit THEN v_more := true; EXIT; END IF;
    v_examined := v_examined + 1;
    BEGIN
      DELETE FROM public.risk_policy_activations WHERE policy_version_id = r.id;
      GET DIAGNOSTICS n = ROW_COUNT;
      v_counts := public.retention_add(v_counts, 'risk_policy_activations', n);
      DELETE FROM public.risk_policy_versions WHERE id = r.id;
      GET DIAGNOSTICS n = ROW_COUNT;
      v_counts := public.retention_add(v_counts, 'risk_policy_versions', n);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;
  v_counts := public.retention_add(v_counts, 'failed', v_failed);
  PERFORM public.retention_log_run(v_run, 'delete', 'risk_policy', v_version, v_limit, v_examined, v_held, v_case, v_counts, NOT v_more, v_started);
  v_summary := v_summary || jsonb_build_object('class', 'risk_policy', 'counts', v_counts, 'complete', NOT v_more);

  -- 6. Daily limit counters ------------------------------------------------------
  v_started := clock_timestamp(); v_run := gen_random_uuid(); v_counts := '{}'::jsonb;
  SELECT count(*) INTO v_held FROM public.risk_day_buckets b
  WHERE public.retention_rule_end('risk_counter', (b.bucket_date::timestamp AT TIME ZONE 'Asia/Jakarta')) <= now()
    AND public.retention_buyer_held(b.user_id);
  DELETE FROM public.risk_day_buckets
  WHERE (user_id, bucket_date) IN (
    SELECT b.user_id, b.bucket_date FROM public.risk_day_buckets b
    WHERE public.retention_rule_end('risk_counter', (b.bucket_date::timestamp AT TIME ZONE 'Asia/Jakarta')) <= now()
      AND NOT public.retention_buyer_held(b.user_id)
    ORDER BY b.bucket_date LIMIT v_limit
  );
  GET DIAGNOSTICS n = ROW_COUNT;
  v_counts := public.retention_add(v_counts, 'risk_day_buckets', n);
  PERFORM public.retention_log_run(v_run, 'delete', 'risk_counter', v_version, v_limit, n, v_held, 0, v_counts, n < v_limit, v_started);
  v_summary := v_summary || jsonb_build_object('class', 'risk_counter', 'counts', v_counts, 'complete', n < v_limit, 'heldSkipped', v_held);

  RETURN jsonb_build_object('registerVersion', v_version, 'classes', v_summary);
END;
$fn$;

-- Does the connected role look like the restricted runtime role? ----------------
-- Read-only, cheap, and safe for any role to call: it only reports on itself.
CREATE FUNCTION public.retention_role_check() RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  me pg_roles%ROWTYPE;
  findings text[] := ARRAY[]::text[];
  t record;
  qualified text;
  stray name;
BEGIN
  SELECT * INTO me FROM pg_roles WHERE rolname = current_user;
  IF me.rolsuper THEN findings := array_append(findings, 'superuser'); END IF;
  IF me.rolcreaterole THEN findings := array_append(findings, 'create_role'); END IF;
  IF me.rolcreatedb THEN findings := array_append(findings, 'create_db'); END IF;
  IF me.rolbypassrls THEN findings := array_append(findings, 'bypass_rls'); END IF;
  IF has_schema_privilege(current_user, 'public', 'CREATE') THEN findings := array_append(findings, 'schema_create'); END IF;
  IF pg_has_role(current_user, 'vecalss_retention', 'MEMBER') THEN findings := array_append(findings, 'retention_member'); END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'MEMBER')
  ) THEN
    findings := array_append(findings, 'owns_tables');
  END IF;

  FOR t IN SELECT table_name, COALESCE(update_columns, ARRAY[]::text[]) AS update_columns FROM public.evidence_tables ORDER BY table_name LOOP
    qualified := 'public.' || quote_ident(t.table_name);
    IF to_regclass(qualified) IS NULL THEN CONTINUE; END IF;
    IF has_table_privilege(current_user, qualified, 'DELETE') THEN findings := array_append(findings, ('delete:' || t.table_name)); END IF;
    IF has_table_privilege(current_user, qualified, 'TRUNCATE') THEN findings := array_append(findings, ('truncate:' || t.table_name)); END IF;
    IF has_table_privilege(current_user, qualified, 'TRIGGER') THEN findings := array_append(findings, ('trigger:' || t.table_name)); END IF;
    IF has_table_privilege(current_user, qualified, 'REFERENCES') THEN findings := array_append(findings, ('references:' || t.table_name)); END IF;
    -- UPDATE beyond the guarded columns: a whole-table grant shows up on every column.
    SELECT a.attname INTO stray FROM pg_attribute a
    WHERE a.attrelid = qualified::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(current_user, a.attrelid, a.attnum, 'UPDATE')
      AND a.attname::text <> ALL (t.update_columns)
    ORDER BY a.attnum LIMIT 1;
    IF FOUND THEN
      findings := array_append(findings, 'update:' || t.table_name || '.' || stray);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', cardinality(findings) = 0, 'findings', to_jsonb(findings[1:25]), 'role', current_user::text);
END;
$fn$;

-- Evidence tables ------------------------------------------------------------
INSERT INTO "evidence_tables" ("table_name", "record_class", "update_columns", "runtime_insert", "note") VALUES
  ('audit_logs', 'audit_log', ARRAY[]::text[], true, 'Append-only; IP scrub by the maintenance role only'),
  ('billing_access_events', 'billing_access', ARRAY[]::text[], true, 'Append-only grant ledger'),
  ('checkout_intents', 'checkout_intent', ARRAY[]::text[], true, 'Intents with an order are kept with it'),
  ('package_purchases', 'order_family', ARRAY['status', 'completed_at', 'updated_at', 'provider_reference'], true, 'Purchase summary linked from an order'),
  ('payment_orders', 'order_family', ARRAY['status', 'status_changed_at', 'status_reason', 'paid_at', 'provider_reference', 'session_url', 'session_attempts', 'session_requested_at', 'package_purchase_id', 'updated_at'], true, 'Guarded transitions'),
  ('payment_events', 'order_family', ARRAY[]::text[], true, 'Append-only'),
  ('payment_outbox', 'order_family', ARRAY['status', 'attempts', 'next_run_at', 'leased_until', 'lease_owner', 'last_error', 'completed_at'], true, 'Leased jobs'),
  ('payment_receipts', 'order_family', ARRAY['delivery_status', 'pending_reason', 'access_plan_code', 'grant_event_id', 'valid_from', 'valid_until', 'granted_at'], true, 'Delivery moves once'),
  ('receipt_deliveries', 'order_family', ARRAY[]::text[], true, 'Append-only'),
  ('fulfillment_usage_events', 'order_family', ARRAY[]::text[], true, 'Append-only'),
  ('dispute_exports', 'order_family', ARRAY['packet', 'downloaded_at', 'packet_purged_at'], true, 'Export log; the packet is dropped after download'),
  ('refund_cases', 'case_record', ARRAY['state', 'version', 'approved_by_user_id', 'approved_at', 'approval_reason', 'self_approved', 'eligibility_approved', 'payout_due_at', 'revoke_access', 'closed_by_user_id', 'closed_at', 'closure_reason', 'method', 'provider_refund_id', 'execution_attempts', 'last_attempt_at', 'outcome_unknown', 'destination_masked', 'destination_holder', 'transfer_reference', 'proof_note', 'confirmed_by_user_id', 'completed_at', 'confirmation_source', 'confirmation_event_id', 'access_effect', 'evidence_hold', 'last_event_id', 'updated_at'], true, 'Guarded state machine'),
  ('refund_case_events', 'case_record', ARRAY[]::text[], true, 'Append-only'),
  ('payment_disputes', 'case_record', ARRAY['state', 'version', 'evidence_hold', 'access_paused', 'refund_in_flight', 'resolved_at', 'resolved_by_user_id', 'resolution_source', 'resolution_note', 'access_effect', 'last_event_id', 'updated_at'], true, 'Guarded state machine'),
  ('payment_dispute_events', 'case_record', ARRAY[]::text[], true, 'Append-only'),
  ('risk_policy_versions', 'risk_policy', ARRAY[]::text[], true, 'Append-only'),
  ('risk_policy_activations', 'risk_policy', ARRAY[]::text[], true, 'Append-only'),
  ('risk_account_tiers', 'risk_counter', ARRAY['tier', 'basis', 'evaluated_at'], true, 'Account tier and lock'),
  ('risk_day_buckets', 'risk_counter', ARRAY['purchase_count', 'amount_rupiah', 'updated_at'], true, 'Daily counters kept in step with reservations'),
  ('risk_reservations', 'order_family', ARRAY['state', 'state_reason', 'state_changed_at'], true, 'Guarded transitions'),
  ('fraud_blocks', 'fraud_block', ARRAY['status', 'version', 'expires_at', 'review_due_at', 'ended_at', 'last_event_id', 'updated_at'], true, 'Guarded transitions'),
  ('fraud_block_events', 'fraud_block', ARRAY[]::text[], true, 'Append-only'),
  ('fraud_cases', 'fraud_case', ARRAY['state', 'version', 'severity', 'owner_user_id', 'hit_count', 'last_seen_at', 'evidence', 'acknowledged_at', 'escalated_at', 'closed_at', 'closure_reason', 'last_event_id', 'updated_at'], true, 'Guarded transitions'),
  ('fraud_case_events', 'fraud_case', ARRAY[]::text[], true, 'Append-only'),
  ('fraud_case_blocks', 'fraud_case', ARRAY[]::text[], true, 'Append-only'),
  ('fraud_appeals', 'fraud_case', ARRAY['state', 'decided_at', 'decision_reason', 'reopen_count', 'version', 'due_at'], true, 'Guarded transitions'),
  ('legal_holds', 'legal_hold', ARRAY['released_at', 'released_by_user_id', 'release_reason'], true, 'A release is recorded once on the same row'),
  ('retention_register_versions', 'retention_register', ARRAY[]::text[], false, 'Changed only by a reviewed migration'),
  ('retention_register_rules', 'retention_register', ARRAY[]::text[], false, 'Changed only by a reviewed migration'),
  ('evidence_tables', 'retention_register', ARRAY[]::text[], false, 'Changed only by a reviewed migration'),
  ('retention_runs', 'retention_register', ARRAY[]::text[], false, 'Written by the maintenance functions'),
  ('retention_scrubs', 'retention_register', ARRAY[]::text[], false, 'Written by the maintenance functions'),
  ('retention_purges', 'retention_register', ARRAY[]::text[], false, 'Written by the maintenance functions'),
  ('environment_marks', 'retention_register', ARRAY[]::text[], false, 'Set once by the owner at go-live');

-- Grants ---------------------------------------------------------------------
-- Re-run this after any migration that adds a table: SELECT public.retention_apply_runtime_grants();
-- It grants the runtime role everything on ordinary tables, and on evidence tables
-- only SELECT, INSERT and the column-limited UPDATE the registry names.
CREATE FUNCTION public.retention_apply_runtime_grants() RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  t record;
BEGIN
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vecalss_runtime;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM vecalss_runtime;
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
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vecalss_runtime;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vecalss_runtime;

  GRANT EXECUTE ON FUNCTION public.retention_run_scrub(integer), public.retention_run_delete(integer) TO vecalss_runtime;
END;
$fn$;

-- The maintenance role: the narrowest privileges its functions need ---------------
GRANT USAGE ON SCHEMA public TO vecalss_retention;
GRANT SELECT ON
  "payment_orders", "payment_events", "audit_logs", "checkout_intents", "package_purchases", "payment_receipts",
  "receipt_deliveries", "fulfillment_usage_events", "dispute_exports", "refund_cases", "refund_case_events",
  "payment_disputes", "payment_dispute_events", "risk_reservations", "payment_outbox", "risk_policy_versions",
  "risk_policy_activations", "risk_day_buckets", "fraud_cases", "fraud_case_events", "fraud_case_blocks",
  "fraud_blocks", "fraud_block_events", "fraud_appeals", "legal_holds", "retention_register_versions",
  "retention_register_rules", "retention_scrubs", "retention_runs", "retention_purges", "evidence_tables"
  TO vecalss_retention;
GRANT DELETE ON
  "payment_orders", "payment_events", "checkout_intents", "package_purchases", "payment_receipts",
  "receipt_deliveries", "fulfillment_usage_events", "dispute_exports", "refund_cases", "refund_case_events",
  "payment_disputes", "payment_dispute_events", "risk_reservations", "payment_outbox", "risk_policy_versions",
  "risk_policy_activations", "risk_day_buckets", "fraud_cases", "fraud_case_events", "fraud_case_blocks",
  "fraud_blocks", "fraud_block_events", "fraud_appeals"
  TO vecalss_retention;
GRANT UPDATE ("buyer_ip", "device_lookup_token") ON "payment_orders" TO vecalss_retention;
GRANT UPDATE ("caller_ip") ON "payment_events" TO vecalss_retention;
GRANT UPDATE ("ip_address", "user_agent") ON "audit_logs" TO vecalss_retention;
GRANT INSERT ON "retention_runs", "retention_scrubs", "retention_purges" TO vecalss_retention;

-- Ownership and who may call what ---------------------------------------------------
-- ALTER FUNCTION ... OWNER TO needs CREATE on the schema for the new owner; it is
-- granted for the statements below and taken back straight after.
GRANT CREATE ON SCHEMA public TO vecalss_retention;
ALTER FUNCTION public.retention_run_scrub(integer) OWNER TO vecalss_retention;
ALTER FUNCTION public.retention_run_delete(integer) OWNER TO vecalss_retention;
ALTER FUNCTION public.retention_log_run(uuid, text, text, integer, integer, integer, integer, integer, jsonb, boolean, timestamptz) OWNER TO vecalss_retention;
REVOKE CREATE ON SCHEMA public FROM vecalss_retention;

REVOKE EXECUTE ON FUNCTION public.retention_run_scrub(integer), public.retention_run_delete(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retention_log_run(uuid, text, text, integer, integer, integer, integer, integer, jsonb, boolean, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.retention_apply_runtime_grants() FROM PUBLIC;

SELECT public.retention_apply_runtime_grants();
