import "server-only";

import { prisma } from "@/lib/prisma";

type Db = Pick<typeof prisma, "$queryRaw">;

type HoldRow = {
  caseKind: string | null;
  id: string;
  placedAt: Date;
  placedByEmail: string;
  reason: string;
  releaseReason: string | null;
  releasedAt: Date | null;
  releasedByEmail: string | null;
  scope: "buyer" | "case" | "order";
  subjectId: string;
};

type IpState = "kept" | "none" | "removed";

/** A case on the order that a hold can cover on its own. */
type CaseOption = { id: string; kind: "dispute" | "fraud" | "refund"; label: string };

type OrderRetention =
  | {
      /** Removed under the retention policy; only this tombstone remains. */
      kind: "purged";
      purgedAt: Date;
      reference: string | null;
    }
  | {
      /** A case is still open, so the period has no end yet. */
      caseOpen: boolean;
      cases: CaseOption[];
      /** Why a hold applies, including the case flags that hold evidence by themselves. */
      held: boolean;
      holds: HoldRow[];
      ip: { endsAt: Date | null; scrubbedAt: Date | null; state: IpState };
      kind: "present";
      label: string;
      periodEndsAt: Date | null;
      recordClass: string;
      startsAt: Date;
    };

/** Infinity travels badly through JSON and drivers; the queries turn it into NULL with a flag. */
async function getOrderRetention(orderId: string, db: Db = prisma): Promise<OrderRetention | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(orderId)) return null;

  const [row = null] = await db.$queryRaw<
    Array<{
      caseOpen: boolean;
      held: boolean;
      hasIp: boolean;
      ipEndsAt: Date | null;
      label: string;
      periodEndsAt: Date | null;
      scrubbedAt: Date | null;
      startsAt: Date;
    }>
  >`
    SELECT
      COALESCE(o.paid_at, o.created_at) AS "startsAt",
      retention_case_end(o.id) = 'infinity' AS "caseOpen",
      retention_order_held(o.id) AS held,
      (o.buyer_ip IS NOT NULL OR o.device_lookup_token IS NOT NULL
        OR EXISTS (SELECT 1 FROM payment_events e WHERE e.order_id = o.id AND e.caller_ip IS NOT NULL)) AS "hasIp",
      CASE WHEN retention_order_end(o.id) = 'infinity' THEN NULL ELSE retention_order_end(o.id) END AS "periodEndsAt",
      CASE WHEN retention_ip_end(o.id) = 'infinity' THEN NULL ELSE retention_ip_end(o.id) END AS "ipEndsAt",
      s.scrubbed_at AS "scrubbedAt",
      (SELECT r.label FROM retention_register_rules r
        WHERE r.version = retention_active_version() AND r.record_class = 'order_family') AS label
    FROM payment_orders o
    LEFT JOIN retention_scrubs s ON s.order_id = o.id
    WHERE o.id = ${orderId}::uuid
  `;

  if (!row) {
    const [purge = null] = await db.$queryRaw<Array<{ purgedAt: Date; reference: string | null }>>`
      SELECT purged_at AS "purgedAt", subject_reference AS reference
      FROM retention_purges WHERE subject_table = 'payment_orders' AND subject_id = ${orderId}::uuid
    `;
    return purge ? { kind: "purged", purgedAt: purge.purgedAt, reference: purge.reference } : null;
  }

  const holds = await db.$queryRaw<HoldRow[]>`
    SELECT h.id, h.scope, h.case_kind AS "caseKind", h.subject_id AS "subjectId", h.reason,
           h.placed_at AS "placedAt", pu.email AS "placedByEmail",
           h.released_at AS "releasedAt", h.release_reason AS "releaseReason", ru.email AS "releasedByEmail"
    FROM legal_holds h
    JOIN users pu ON pu.id = h.placed_by_user_id
    LEFT JOIN users ru ON ru.id = h.released_by_user_id
    WHERE (h.scope = 'order' AND h.subject_id = ${orderId}::uuid)
       OR (h.scope = 'buyer' AND h.subject_id = (SELECT buyer_id FROM payment_orders WHERE id = ${orderId}::uuid))
       OR (h.scope = 'case' AND (
            (h.case_kind = 'refund' AND h.subject_id IN (SELECT id FROM refund_cases WHERE order_id = ${orderId}::uuid))
         OR (h.case_kind = 'dispute' AND h.subject_id IN (SELECT id FROM payment_disputes WHERE order_id = ${orderId}::uuid))
         OR (h.case_kind = 'fraud' AND h.subject_id IN (SELECT id FROM fraud_cases WHERE order_id = ${orderId}::uuid))))
    ORDER BY h.placed_at DESC
  `;

  const cases = await db.$queryRaw<CaseOption[]>`
    SELECT id, 'refund' AS kind, 'Pengembalian dana ' || reference AS label FROM refund_cases WHERE order_id = ${orderId}::uuid
    UNION ALL
    SELECT id, 'dispute' AS kind, 'Sengketa ' || left(provider_dispute_id, 20) AS label FROM payment_disputes WHERE order_id = ${orderId}::uuid
    UNION ALL
    SELECT id, 'fraud' AS kind, 'Kasus fraud ' || signal AS label FROM fraud_cases WHERE order_id = ${orderId}::uuid
    ORDER BY label
  `;

  const ipState: IpState = row.scrubbedAt ? "removed" : row.hasIp ? "kept" : "none";
  return {
    caseOpen: row.caseOpen,
    cases,
    held: row.held,
    holds,
    ip: { endsAt: row.ipEndsAt, scrubbedAt: row.scrubbedAt, state: ipState },
    kind: "present",
    label: row.label,
    periodEndsAt: row.periodEndsAt,
    recordClass: "order_family",
    startsAt: row.startsAt,
  };
}

/** Whether an order's IP and device sections still exist, for the dispute packet. */
async function getIpEvidenceState(orderId: string, db: Db): Promise<{ scrubbedAt: Date | null; state: IpState }> {
  const [row = null] = await db.$queryRaw<Array<{ hasIp: boolean; scrubbedAt: Date | null }>>`
    SELECT (o.buyer_ip IS NOT NULL OR o.device_lookup_token IS NOT NULL
             OR EXISTS (SELECT 1 FROM payment_events e WHERE e.order_id = o.id AND e.caller_ip IS NOT NULL)) AS "hasIp",
           s.scrubbed_at AS "scrubbedAt"
    FROM payment_orders o LEFT JOIN retention_scrubs s ON s.order_id = o.id
    WHERE o.id = ${orderId}::uuid
  `;
  if (!row) return { scrubbedAt: null, state: "none" };
  return { scrubbedAt: row.scrubbedAt, state: row.scrubbedAt ? "removed" : row.hasIp ? "kept" : "none" };
}

export { getIpEvidenceState, getOrderRetention };
export type { CaseOption, HoldRow, IpState, OrderRetention };
