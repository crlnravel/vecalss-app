import "server-only";

import { prisma } from "@/lib/prisma";
import { maskEmail } from "@/lib/retention/mask";

type OrderListRow = {
  amountRupiah: number;
  buyerEmail: string;
  createdAt: Date;
  deliveryStatus: "delivered" | "pending" | null;
  id: string;
  packageName: string;
  status: string;
};

/** The newest orders, for the admin to pick one. Aggregates and ids only; no payment evidence, and the buyer is shown masked. */
async function listRecentOrders(limit = 50): Promise<OrderListRow[]> {
  const rows = await prisma.$queryRaw<OrderListRow[]>`
    SELECT o.id, o.created_at AS "createdAt", o.status::text AS status, o.amount_rupiah AS "amountRupiah",
           o.package_name AS "packageName", u.email AS "buyerEmail", r.delivery_status::text AS "deliveryStatus"
    FROM payment_orders o
    JOIN users u ON u.id = o.buyer_id
    LEFT JOIN payment_receipts r ON r.order_id = o.id
    ORDER BY o.created_at DESC
    LIMIT ${Math.min(limit, 100)}
  `;
  // The list is a summary: the buyer's full email is on the order page, not here.
  return rows.map((row) => ({ ...row, buyerEmail: maskEmail(row.buyerEmail) ?? "***" }));
}

type OrderSummary = OrderListRow & {
  buyerId: string;
  grantedAt: Date | null;
  pendingReason: string | null;
  receiptNumber: string | null;
  reference: string;
  termsVersion: string | null;
  usageDays: number;
  validUntil: Date | null;
};

async function getOrderSummary(orderId: string): Promise<OrderSummary | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(orderId)) return null;

  const [row = null] = await prisma.$queryRaw<OrderSummary[]>`
    SELECT o.id, o.created_at AS "createdAt", o.status::text AS status, o.amount_rupiah AS "amountRupiah",
           o.package_name AS "packageName", o.reference, o.terms_version AS "termsVersion",
           u.email AS "buyerEmail", o.buyer_id AS "buyerId", r.delivery_status::text AS "deliveryStatus",
           r.pending_reason AS "pendingReason", r.receipt_number AS "receiptNumber",
           r.granted_at AS "grantedAt", r.valid_until AS "validUntil",
           (SELECT count(*)::int FROM fulfillment_usage_events e WHERE e.order_id = o.id) AS "usageDays"
    FROM payment_orders o
    JOIN users u ON u.id = o.buyer_id
    LEFT JOIN payment_receipts r ON r.order_id = o.id
    WHERE o.id = ${orderId}::uuid
  `;
  return row;
}

export { getOrderSummary, listRecentOrders };
export type { OrderListRow, OrderSummary };
