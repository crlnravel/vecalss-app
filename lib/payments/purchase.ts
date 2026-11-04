import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Writes the `package_purchases` summary of a paid order (affiliator
 * conversions read it), keyed `order:<id>`. The snapshot comes from the frozen
 * order, never from mutable catalog rows. Used when a payment is accepted and
 * when the owner accepts one that was held in review.
 */
async function insertOrderPurchase(tx: Prisma.TransactionClient, orderId: string) {
  const [purchase] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO package_purchases (
      student_id, package_code, package_name, status, affiliator_profile_id,
      referral_code_snapshot, provider_reference, completed_at, provenance
    )
    SELECT o.buyer_id, o.package_code, o.package_name, 'succeeded'::package_purchase_status,
           o.affiliator_profile_id, o.referral_code, 'order:' || o.id::text, now(),
           'order'::package_purchase_provenance
    FROM payment_orders o
    WHERE o.id = ${orderId}::uuid
    RETURNING id
  `;
  return purchase.id;
}

export { insertOrderPurchase };
