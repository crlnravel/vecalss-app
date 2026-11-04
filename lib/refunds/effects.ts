import "server-only";

import { BillingAccessError, revokeAccessInTx } from "@/lib/billing/service";
import { openFraudCase } from "@/lib/fraud/cases";
import { writePaymentAudit } from "@/lib/payments/audit";

import { insertRefundEvent, type Actor, type RefundCaseRow, type Tx } from "./core";

/**
 * What a refund does once it is confirmed, and how a case ends badly. Both run
 * inside the caller's transaction, with the order and the case already locked
 * (see `lockRefundCase`), so the money, the history row, the purchase summary
 * and the access change commit together.
 */

type Confirmation =
  | { actor: Actor; eventId: string; source: "provider_event" | "provider_status" }
  | {
      actor: { kind: "owner"; userId: string };
      destinationHolder: "buyer" | "parent";
      destinationMasked: string;
      proofNote: string;
      /** The owner's written reason for confirming the transfer. */
      reason: string;
      source: "owner_manual";
      transferReference: string;
    };

type AccessEffect = "already_ended" | "kept" | "none_paid_order" | "revoke_failed" | "revoked";

/** Ends access for a full refund, or a partial one the owner chose to revoke. Never touches access the order did not grant. */
async function applyAccessEffect(tx: Tx, row: RefundCaseRow, actor: Actor): Promise<{ effect: AccessEffect; full: boolean }> {
  const [facts] = await tx.$queryRaw<Array<{
    captured: number;
    completedBefore: number;
    ownPayment: boolean;
    packagePurchaseId: string | null;
    status: string;
  }>>`
    SELECT o.status::text AS status, o.package_purchase_id AS "packagePurchaseId",
           (o.provider_reference IS NOT DISTINCT FROM ${row.providerPaymentId}) AS "ownPayment",
           refund_capture_amount(o.id, ${row.providerPaymentId}) AS captured,
           COALESCE((SELECT sum(c.amount_rupiah) FROM refund_cases c
             WHERE c.order_id = o.id AND c.provider_payment_id = ${row.providerPaymentId}
               AND c.state::text = 'completed' AND c.id <> ${row.id}::uuid), 0)::int AS "completedBefore"
    FROM payment_orders o WHERE o.id = ${row.orderId}::uuid
  `;

  const full = facts.ownPayment && facts.completedBefore + row.amountRupiah >= facts.captured;
  if (full && facts.packagePurchaseId) {
    // A refunded purchase never becomes anything else again (database guard).
    await tx.$executeRaw`
      UPDATE package_purchases SET status = 'refunded'::package_purchase_status, updated_at = now()
      WHERE id = ${facts.packagePurchaseId}::uuid AND status = 'succeeded'::package_purchase_status
    `;
  }

  // Only an order that granted access can take it away. A payment held in
  // review never granted any, and the buyer's access may come from another order.
  if (facts.status !== "paid" || !facts.ownPayment) return { effect: "none_paid_order", full };
  if (!full && !row.revokeAccess) return { effect: "kept", full };

  try {
    const result = await revokeAccessInTx(tx, {
      actorUserId: "userId" in actor ? actor.userId : null,
      idempotencyKey: `refund:${row.id}:revoke`,
      reason: `Pengembalian dana ${row.reference}`,
      source: "userId" in actor ? "admin" : "payment",
      studentId: row.buyerId,
    });
    return { effect: result.outcome === "unchanged" ? "already_ended" : "revoked", full };
  } catch (error) {
    if (!(error instanceof BillingAccessError)) throw error;
    // The money is back; that cannot be undone. Say loudly that access is still on.
    await openFraudCase(tx, {
      evidence: { caseId: row.id, orderId: row.orderId, reason: `revoke_${error.code}` },
      orderId: row.orderId,
      signal: "payment_review",
      subjectKey: `order:${row.orderId}`,
      subjectType: "order",
      userId: row.buyerId,
    });
    return { effect: "revoke_failed", full };
  }
}

/** Completes a case on a verified confirmation. The case is `processing` (provider) or `approved` (manual transfer). */
async function completeRefund(
  tx: Tx,
  row: RefundCaseRow,
  confirmation: Confirmation,
  providerRefundId: string | null = null,
) {
  const { effect, full } = await applyAccessEffect(tx, row, confirmation.actor);
  const nextVersion = row.version + 1;
  const eventId = await insertRefundEvent(tx, {
    actor: confirmation.actor,
    caseId: row.id,
    caseVersion: nextVersion,
    kind: "completed",
    metadata: {
      accessEffect: effect,
      confirmationEventId: "eventId" in confirmation ? confirmation.eventId : null,
      fullRefund: full,
      source: confirmation.source,
      ...(confirmation.source === "owner_manual" ? { transferReference: confirmation.transferReference } : {}),
    },
    note: confirmation.source === "owner_manual" ? confirmation.reason : null,
  });

  if (confirmation.source === "owner_manual") {
    await tx.$executeRaw`
      UPDATE refund_cases
      SET state = 'completed', version = ${nextVersion}, last_event_id = ${eventId}::uuid, method = 'manual_transfer',
          completed_at = now(), evidence_hold = false, confirmation_source = 'owner_manual',
          confirmed_by_user_id = ${confirmation.actor.userId}::uuid, destination_masked = ${confirmation.destinationMasked},
          destination_holder = ${confirmation.destinationHolder}, transfer_reference = ${confirmation.transferReference},
          proof_note = ${confirmation.proofNote}, access_effect = ${effect}, updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
  } else {
    await tx.$executeRaw`
      UPDATE refund_cases
      SET state = 'completed', version = ${nextVersion}, last_event_id = ${eventId}::uuid,
          provider_refund_id = COALESCE(provider_refund_id, ${providerRefundId}), outcome_unknown = false,
          completed_at = now(), evidence_hold = false, confirmation_source = ${confirmation.source},
          confirmation_event_id = ${confirmation.eventId}::uuid, access_effect = ${effect}, updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
  }

  await writePaymentAudit(tx, {
    action: "refund.completed",
    actorUserId: "userId" in confirmation.actor ? confirmation.actor.userId : null,
    metadata: {
      accessEffect: effect,
      amountRupiah: row.amountRupiah,
      caseId: row.id,
      fullRefund: full,
      method: confirmation.source === "owner_manual" ? "manual_transfer" : "provider",
      source: confirmation.source,
    },
    targetId: row.orderId,
    targetType: "payment_order",
  });

  return { accessEffect: effect, fullRefund: full };
}

/** Ends a case that did not and will not pay out. The balance it held is free again. */
async function endRefundCase(
  tx: Tx,
  row: RefundCaseRow,
  to: "cancelled" | "failed" | "rejected",
  actor: Actor,
  reason: string,
) {
  const nextVersion = row.version + 1;
  const eventId = await insertRefundEvent(tx, {
    actor,
    caseId: row.id,
    caseVersion: nextVersion,
    kind: to,
    metadata: { fromState: row.state },
    note: reason,
  });
  await tx.$executeRaw`
    UPDATE refund_cases
    SET state = ${to}::refund_case_state, version = ${nextVersion}, last_event_id = ${eventId}::uuid,
        closed_by_user_id = ${"userId" in actor ? actor.userId : null}::uuid, closed_at = now(),
        closure_reason = ${reason}, evidence_hold = false, outcome_unknown = false, updated_at = now()
    WHERE id = ${row.id}::uuid
  `;
  await writePaymentAudit(tx, {
    action: `refund.${to}`,
    actorUserId: "userId" in actor ? actor.userId : null,
    metadata: { caseId: row.id, fromState: row.state },
    targetId: row.orderId,
    targetType: "payment_order",
  });
}

export { applyAccessEffect, completeRefund, endRefundCase };
export type { AccessEffect, Confirmation };
