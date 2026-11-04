import "server-only";

import type { Prisma } from "@/generated/prisma/client";

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

type CapturedPayment = {
  capturedRupiah: number;
  /** Completed refunds only. */
  refundedRupiah: number;
  /** Approved and processing refunds, not yet confirmed. */
  reservedRupiah: number;
  /** Lost disputes use the payment up. */
  disputedLostRupiah: number;
  providerPaymentId: string;
  remainingRupiah: number;
};

/**
 * The payments an order has captured, with how much of each is already spoken
 * for. The order's own payment is the order amount; an unexpected second capture
 * is the amount it arrived with (held in review by the inbox). Mirrors the
 * database functions `refund_capture_amount` and `refund_balance_used`, which
 * are what actually refuses an over-refund.
 */
async function listCapturedPayments(db: Db, orderId: string): Promise<CapturedPayment[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT o.provider_reference AS id FROM payment_orders o
    WHERE o.id = ${orderId}::uuid AND o.status::text IN ('paid', 'review') AND o.provider_reference IS NOT NULL
    UNION
    SELECT e.provider_payment_id AS id FROM payment_events e
    JOIN payment_orders o ON o.id = e.order_id
    WHERE e.order_id = ${orderId}::uuid AND o.status::text IN ('paid', 'review')
      AND e.type::text = 'succeeded' AND e.outcome::text = 'review' AND e.reason = 'second_capture'
      AND e.provider_payment_id IS NOT NULL
  `;

  const payments: CapturedPayment[] = [];
  for (const { id } of rows) {
    const [figures] = await db.$queryRaw<Array<{
      captured: number;
      lost: number;
      refunded: number;
      reserved: number;
    }>>`
      SELECT refund_capture_amount(${orderId}::uuid, ${id}) AS captured,
             COALESCE((SELECT sum(amount_rupiah) FROM refund_cases
               WHERE order_id = ${orderId}::uuid AND provider_payment_id = ${id} AND state::text = 'completed'), 0)::int AS refunded,
             COALESCE((SELECT sum(amount_rupiah) FROM refund_cases
               WHERE order_id = ${orderId}::uuid AND provider_payment_id = ${id} AND state::text IN ('approved', 'processing')), 0)::int AS reserved,
             COALESCE((SELECT sum(amount_rupiah) FROM payment_disputes
               WHERE order_id = ${orderId}::uuid AND provider_payment_id = ${id} AND state::text = 'lost'), 0)::int AS lost
    `;
    if (figures.captured <= 0) continue;
    payments.push({
      capturedRupiah: figures.captured,
      disputedLostRupiah: figures.lost,
      providerPaymentId: id,
      refundedRupiah: figures.refunded,
      remainingRupiah: Math.max(0, figures.captured - figures.refunded - figures.reserved - figures.lost),
      reservedRupiah: figures.reserved,
    });
  }
  return payments;
}

async function getCapturedPayment(db: Db, orderId: string, providerPaymentId: string) {
  return (await listCapturedPayments(db, orderId)).find((payment) => payment.providerPaymentId === providerPaymentId) ?? null;
}

export { getCapturedPayment, listCapturedPayments };
export type { CapturedPayment };
