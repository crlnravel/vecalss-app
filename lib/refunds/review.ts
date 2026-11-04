import "server-only";

import { assertStillOwner } from "@/lib/disputes/export";
import { requireReason, type OwnerContext } from "@/lib/fraud/authority";
import { fulfillPaidOrder, queueGrantRetry, type FulfillOptions, type FulfillResult } from "@/lib/fulfillment/grant";
import { writePaymentAudit } from "@/lib/payments/audit";
import { insertOrderPurchase } from "@/lib/payments/purchase";
import { moveReservation } from "@/lib/payments/risk/reserve";
import { prisma } from "@/lib/prisma";

import { RefundError } from "./errors";

type Env = Partial<Record<string, string | undefined>>;

/**
 * An order held in review (a late success, a blocked buyer, a payment the
 * checks could not clear) is settled by the owner in one of two ways:
 *
 * - accept the payment and grant access, here, through the same MS-08
 *   `fulfillPaidOrder` as a normal payment; or
 * - open a refund for it (`prepareRefund` works on a captured order in review).
 *
 * Accepting is refused once a refund is on its way or done, or a dispute is open:
 * a payment cannot be both honoured and given back.
 */
async function acceptReviewedOrder(
  owner: OwnerContext,
  input: { orderId: string; reason: string },
  options: { env?: Env; fulfillment?: FulfillOptions } = {},
): Promise<{ delivery: FulfillResult["status"] }> {
  const reason = requireReason(input.reason);
  if (!/^[0-9a-f-]{36}$/iu.test(input.orderId)) throw new RefundError("not_found", "The order was not found.");

  return prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, options.env ?? process.env);
    const [order = null] = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM payment_orders WHERE id = ${input.orderId}::uuid FOR UPDATE
    `;
    if (!order) throw new RefundError("not_found", "The order was not found.");
    if (order.status !== "review") throw new RefundError("wrong_state", "Only an order held in review can be accepted.");

    const [blocker = null] = await tx.$queryRaw<Array<{ kind: string }>>`
      SELECT 'refund' AS kind FROM refund_cases WHERE order_id = ${input.orderId}::uuid AND state IN ('approved', 'processing', 'completed')
      UNION ALL
      SELECT 'dispute' AS kind FROM payment_disputes WHERE order_id = ${input.orderId}::uuid AND state = 'open'
      LIMIT 1
    `;
    if (blocker) {
      throw new RefundError(
        blocker.kind === "dispute" ? "dispute_open" : "wrong_state",
        "A refund or dispute already decides this payment.",
      );
    }

    const purchaseId = await insertOrderPurchase(tx, input.orderId);
    await tx.$executeRaw`
      UPDATE payment_orders
      SET status = 'paid', status_changed_at = now(), status_reason = 'accepted_by_owner',
          paid_at = COALESCE(
            (SELECT min(e.received_at) FROM payment_events e
              WHERE e.order_id = ${input.orderId}::uuid AND e.type::text = 'succeeded' AND e.outcome::text IN ('accepted', 'review')),
            now()),
          package_purchase_id = ${purchaseId}::uuid, updated_at = now()
      WHERE id = ${input.orderId}::uuid
    `;
    const reserved = await moveReservation(tx, input.orderId, "paid", "accepted_by_owner");
    const fulfilled = await fulfillPaidOrder(tx, input.orderId, options.fulfillment);
    if (fulfilled.status === "pending") await queueGrantRetry(tx, input.orderId);

    await writePaymentAudit(tx, {
      action: "payment.order.review_accepted",
      actorUserId: owner.userId,
      metadata: { delivery: fulfilled.status, reason, reservation: reserved ? "paid" : null },
      targetId: input.orderId,
      targetType: "payment_order",
    });

    return { delivery: fulfilled.status };
  });
}

export { acceptReviewedOrder };
