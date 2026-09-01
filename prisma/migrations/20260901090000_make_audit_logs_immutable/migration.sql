-- Audit logs are historical evidence. Keep the actor relation intact so
-- deleting a user cannot rewrite an audit row through ON DELETE SET NULL.
ALTER TABLE "audit_logs"
  DROP CONSTRAINT IF EXISTS "audit_logs_actor_user_id_fkey";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_truncate_immutable
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();
