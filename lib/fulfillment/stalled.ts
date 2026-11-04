import "server-only";

import { openFraudCase } from "@/lib/fraud/cases";
import { enqueueOutbox } from "@/lib/payments/outbox";
import { prisma } from "@/lib/prisma";

import { listPendingFulfillments, retryFulfillment, type FulfillOptions } from "./grant";

/** How long a paid order may wait for its access before it becomes a case (decision "Fraud operations rules"). */
const STALLED_AFTER_SECONDS = 60 * 60;

type StalledResult = {
  /** Cases opened or refreshed this run. */
  flagged: number;
  /** Pending orders this run delivered on its own retry. */
  retried: number;
};

/**
 * Money arrived and nothing was delivered for over an hour: open an MS-07
 * `capture_without_access` case and queue a critical alert. Judged on database
 * time. One case per order while it is open, and one alert per order.
 */
async function flagStalledFulfillments(
  options: { afterSeconds?: number; limit?: number } = {},
): Promise<number> {
  const afterSeconds = options.afterSeconds ?? STALLED_AFTER_SECONDS;
  const limit = options.limit ?? 100;

  return prisma.$transaction(async (tx) => {
    const stalled = await tx.$queryRaw<Array<{ buyerId: string; orderId: string; pendingReason: string | null; receiptId: string }>>`
      SELECT r.order_id AS "orderId", r.buyer_id AS "buyerId", r.id AS "receiptId", r.pending_reason AS "pendingReason"
      FROM payment_receipts r
      WHERE r.delivery_status = 'pending'
        AND r.paid_at <= now() - make_interval(secs => ${afterSeconds}::double precision)
      ORDER BY r.paid_at
      LIMIT ${limit}
      FOR UPDATE OF r SKIP LOCKED
    `;

    for (const item of stalled) {
      await openFraudCase(tx, {
        evidence: { orderId: item.orderId, pendingReason: item.pendingReason, receiptId: item.receiptId },
        orderId: item.orderId,
        signal: "capture_without_access",
        subjectKey: `order:${item.orderId}`,
        subjectType: "order",
        userId: item.buyerId,
      });
      await enqueueOutbox(tx, {
        dedupeKey: `alert:stalled:${item.orderId}`,
        kind: "critical_alert",
        orderId: item.orderId,
        payload: { kind: "capture_without_access", reason: item.pendingReason ?? "grant_error" },
      });
    }

    return stalled.length;
  });
}

/**
 * The fulfillment part of the daily job. First every pending order gets
 * another try (this covers a retry job that ran out of attempts), then the ones
 * still waiting after an hour are flagged.
 */
async function runFulfillmentMaintenance(options: FulfillOptions & { afterSeconds?: number } = {}): Promise<StalledResult> {
  let retried = 0;
  for (const { orderId } of await listPendingFulfillments()) {
    try {
      const result = await retryFulfillment(orderId, { env: options.env });
      if (result.status === "delivered") retried += 1;
    } catch {
      // The order stays pending and is flagged below if it is old enough.
    }
  }

  return { flagged: await flagStalledFulfillments({ afterSeconds: options.afterSeconds }), retried };
}

export { STALLED_AFTER_SECONDS, flagStalledFulfillments, runFulfillmentMaintenance };
export type { StalledResult };
