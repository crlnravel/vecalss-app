import "server-only";

import { openFraudCase } from "@/lib/fraud/cases";
import type { PaymentProviderAdapter } from "@/lib/payments/adapter";
import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

import { reconcileRefund } from "./execute";

type RefundMaintenanceResult = {
  /** Refunds with the provider that were checked against its own status. */
  reconciled: { checked: number; completed: number; failed: number; unavailable: number };
  /** Late refunds that got (or kept) a `refund_stalled` case this run. */
  stalled: number;
};

const BATCH = 50;

/**
 * A refund still not paid back 3 working days after the buyer asked (the
 * decision deadline), or 14 days after approval (the payout deadline), opens an
 * MS-07 `refund_stalled` case: the "refunds pending more than 3 working days"
 * rule of the daily review. An authority order that set an earlier deadline is
 * late once that deadline passes, approved or not. One case per refund while it
 * is open. Judged on database time.
 */
async function flagStalledRefunds(limit = 100): Promise<number> {
  const late = await prisma.$queryRaw<Array<{
    authorityDue: boolean; buyerId: string; decisionDue: boolean; id: string; orderId: string; payoutDue: boolean; state: string;
  }>>`
    SELECT id, order_id AS "orderId", buyer_id AS "buyerId", state::text AS state,
           (decision_due_at <= now()) AS "decisionDue", (payout_due_at IS NOT NULL AND payout_due_at <= now()) AS "payoutDue",
           (authority_deadline_at IS NOT NULL AND authority_deadline_at <= now()) AS "authorityDue"
    FROM refund_cases
    WHERE state IN ('prepared', 'approved', 'processing')
      AND (decision_due_at <= now() OR (payout_due_at IS NOT NULL AND payout_due_at <= now())
        OR (authority_deadline_at IS NOT NULL AND authority_deadline_at <= now()))
    ORDER BY decision_due_at
    LIMIT ${limit}
  `;

  for (const item of late) {
    await prisma.$transaction((tx) =>
      openFraudCase(tx, {
        evidence: { authorityDeadlineOverdue: item.authorityDue, decisionOverdue: item.decisionDue, orderId: item.orderId, payoutOverdue: item.payoutDue, refundCaseId: item.id, state: item.state },
        orderId: item.orderId,
        signal: "refund_stalled",
        subjectKey: `refund:${item.id}`,
        subjectType: "order",
        userId: item.buyerId,
      }),
    );
  }
  return late.length;
}

/**
 * Asks the provider about every refund that is with it, so a refund whose
 * confirmation was lost, or whose request timed out, is settled from the
 * provider's own account. Each one is safe to repeat.
 */
async function reconcileProcessingRefunds(provider: PaymentProviderAdapter, limit = BATCH) {
  const open = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM refund_cases c JOIN payment_orders o ON o.id = c.order_id
    WHERE c.state = 'processing' AND o.provider = ${provider.id}
    ORDER BY c.last_attempt_at NULLS FIRST
    LIMIT ${limit}
  `;
  const result = { checked: open.length, completed: 0, failed: 0, unavailable: 0 };

  for (const { id } of open) {
    try {
      const outcome = await reconcileRefund(id, { provider });
      if (outcome.result === "completed") result.completed += 1;
      if (outcome.result === "failed") result.failed += 1;
    } catch (error) {
      result.unavailable += 1;
      serverLogger.error("refunds.reconcile.failed", error instanceof Error ? error : new Error("refund reconcile failed"), { area: "payments" });
    }
  }
  return result;
}

/** The refund part of the daily payment step. */
async function runRefundMaintenance(deps: { provider: PaymentProviderAdapter | null }): Promise<RefundMaintenanceResult> {
  const reconciled = deps.provider
    ? await reconcileProcessingRefunds(deps.provider)
    : { checked: 0, completed: 0, failed: 0, unavailable: 0 };
  // After reconciling, so a refund that just completed is not flagged as late.
  const stalled = await flagStalledRefunds();
  return { reconciled, stalled };
}

export { flagStalledRefunds, reconcileProcessingRefunds, runRefundMaintenance };
export type { RefundMaintenanceResult };
