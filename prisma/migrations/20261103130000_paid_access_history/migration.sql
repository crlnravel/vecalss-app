-- CreateEnum
CREATE TYPE "billing_access_event_kind" AS ENUM ('grant', 'extend', 'revoke', 'pause', 'resume');

-- CreateEnum
CREATE TYPE "billing_access_source" AS ENUM ('admin', 'payment');


-- CreateTable
CREATE TABLE "billing_access_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_account_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" "billing_access_event_kind" NOT NULL,
    "source" "billing_access_source" NOT NULL,
    "actor_user_id" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "plan_code" VARCHAR(80),
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "resulting_status" "billing_status" NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_access_events_idempotency_key_key" ON "billing_access_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "billing_access_events_student_id_occurred_at_idx" ON "billing_access_events"("student_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "billing_access_events" ADD CONSTRAINT "billing_access_events_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_access_events" ADD CONSTRAINT "billing_access_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_access_events" ADD CONSTRAINT "billing_access_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- An admin change always carries a written reason and names who made it; only a
-- payment (added later) may leave the actor empty.
ALTER TABLE "billing_access_events" ADD CONSTRAINT "billing_access_events_admin_actor_check"
  CHECK ("source" <> 'admin' OR ("actor_user_id" IS NOT NULL AND length(btrim("reason")) > 0));

ALTER TABLE "billing_access_events" ADD CONSTRAINT "billing_access_events_window_check"
  CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" >= "starts_at");

-- The history is evidence of what was granted, extended, paused or revoked, and
-- when. Like audit_logs, it is never rewritten or deleted.
CREATE OR REPLACE FUNCTION prevent_billing_access_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'billing access events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER billing_access_events_immutable
  BEFORE UPDATE OR DELETE ON "billing_access_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_billing_access_event_mutation();

CREATE TRIGGER billing_access_events_truncate_immutable
  BEFORE TRUNCATE ON "billing_access_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_billing_access_event_mutation();
