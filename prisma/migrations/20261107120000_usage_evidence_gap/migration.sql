-- MS-19 M-01: a failed usage-evidence write must not read as "not used".
--
-- recordPaidUse() swallows a failed write so a student never loses a page. When it
-- does, it now records a student-level gap here, once per Jakarta day. Change-of-mind
-- eligibility (the app and the database's own recheck at approval) treats a gap
-- after the payment as use. The table is append-only and registered as evidence.
-- Forward-only.

-- CreateTable
CREATE TABLE "fulfillment_usage_gaps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "jakarta_day" DATE NOT NULL DEFAULT risk_jakarta_day(now()),
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillment_usage_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fulfillment_usage_gaps_student_id_jakarta_day_key" ON "fulfillment_usage_gaps"("student_id", "jakarta_day");

-- AddForeignKey
ALTER TABLE "fulfillment_usage_gaps" ADD CONSTRAINT "fulfillment_usage_gaps_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER fulfillment_usage_gaps_immutable
  BEFORE UPDATE OR DELETE ON "fulfillment_usage_gaps"
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_record_mutation();

CREATE TRIGGER fulfillment_usage_gaps_truncate_immutable
  BEFORE TRUNCATE ON "fulfillment_usage_gaps"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_payment_record_mutation();

-- Evidence registry: append-only, never pruned (a student id and a time), runtime insert only.
INSERT INTO "evidence_tables" ("table_name", "record_class", "update_columns", "runtime_insert", "note")
VALUES ('fulfillment_usage_gaps', 'billing_access', ARRAY[]::text[], true, 'Append-only; a failed usage write counts as use');

-- The database's own eligibility recheck at approval also counts a gap since the payment.
CREATE OR REPLACE FUNCTION refund_change_of_mind_eligible(p_order uuid, p_requested timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    p_requested <= COALESCE(
      o.paid_at,
      (SELECT min(e.received_at) FROM payment_events e
        WHERE e.order_id = o.id AND e.type::text = 'succeeded' AND e.outcome::text IN ('accepted', 'review'))
    ) + interval '3 days'
    AND NOT EXISTS (SELECT 1 FROM fulfillment_usage_events u WHERE u.order_id = o.id)
    AND NOT EXISTS (
      SELECT 1 FROM fulfillment_usage_gaps g
      WHERE g.student_id = o.buyer_id
        AND g.occurred_at >= COALESCE(
          o.paid_at,
          (SELECT min(e.received_at) FROM payment_events e
            WHERE e.order_id = o.id AND e.type::text = 'succeeded' AND e.outcome::text IN ('accepted', 'review'))
        )
    ),
    false
  )
  FROM payment_orders o WHERE o.id = p_order
$$;

SELECT public.retention_apply_runtime_grants();
