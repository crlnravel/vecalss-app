-- A pending signup has no credential. Verification sets the password atomically.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
UPDATE users SET password_hash = NULL
WHERE email_verified_at IS NULL
  AND EXISTS (SELECT 1 FROM email_verification_tokens t WHERE t.user_id = users.id);
ALTER TABLE users ADD CONSTRAINT users_verified_password_check
  CHECK (email_verified_at IS NULL OR password_hash IS NOT NULL);

-- New ordinary tables (including pending_authentications where installed) need explicit grants.
-- Default privileges intentionally remain fail closed.
SELECT public.retention_apply_runtime_grants();
-- MS-20 R2A-02: a runtime login must not be able to grant the runtime role to
-- another login. Check the explicit ADMIN OPTION on its runtime membership.
CREATE OR REPLACE FUNCTION public.retention_role_check() RETURNS jsonb
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
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles granted_role ON granted_role.oid = m.roleid
    WHERE m.member = me.oid AND granted_role.rolname = 'vecalss_runtime' AND m.admin_option
  ) THEN
    findings := array_append(findings, 'runtime_admin_option');
  END IF;
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

  -- Ordinary-table availability is as necessary as evidence-table restrictions.
  FOR t IN SELECT c.relname AS table_name FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
      AND NOT EXISTS (SELECT 1 FROM public.evidence_tables e WHERE e.table_name = c.relname)
  LOOP
    qualified := 'public.' || quote_ident(t.table_name);
    IF NOT (has_table_privilege(current_user, qualified, 'SELECT')
      AND has_table_privilege(current_user, qualified, 'INSERT')
      AND has_table_privilege(current_user, qualified, 'UPDATE')
      AND has_table_privilege(current_user, qualified, 'DELETE')) THEN
      findings := array_append(findings, 'ordinary_access:' || t.table_name);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', cardinality(findings) = 0, 'findings', to_jsonb(findings[1:25]), 'role', current_user::text);
END;
$fn$;
