import "server-only";

import type { VerifiedPaymentEvent } from "@/lib/payments/adapter";

import { getCapturedPayment } from "./balance";
import { lockRefundCase, type Tx } from "./core";
import { openDisputeInTx, resolveDisputeInTx } from "./disputes";
import { completeRefund, endRefundCase } from "./effects";

/**
 * Refund and dispute events from the provider, applied by the payment inbox
 * (lib/payments/inbox.ts) after the signature, freshness, merchant, currency,
 * buyer and package were verified. The inbox has already locked the order.
 *
 * `decide` only reads and says what the event means; the inbox stores that
 * decision with the event, and then `apply` carries it out in the same
 * transaction. Terminal states are never changed: an event that contradicts one
 * is kept for review, not applied.
 */

type EventOutcome = "accepted" | "declined" | "ignored" | "quarantined" | "review";

type EventAction =
  | { disputeId: string; kind: "dispute_resolve"; outcome: "lost" | "won" }
  | { kind: "dispute_open" }
  | { kind: "none" }
  | { caseId: string; kind: "refund_complete" }
  | { caseId: string; kind: "refund_fail" };

type RefundEventDecision = { action: EventAction; outcome: EventOutcome; reason: string | null };

const REFUND_KINDS = ["refund.succeeded", "refund.failed"] as const;
const DISPUTE_KINDS = ["dispute.opened", "dispute.won", "dispute.lost"] as const;

function isRefundOrDisputeKind(kind: string) {
  return kind.startsWith("refund.") || kind.startsWith("dispute.");
}

const none = (outcome: EventOutcome, reason: string | null): RefundEventDecision => ({ action: { kind: "none" }, outcome, reason });

async function decideRefundEvent(tx: Tx, orderId: string, event: VerifiedPaymentEvent): Promise<RefundEventDecision> {
  const reference = event.refund?.refundReference;
  if (!event.refund || !reference) return none("quarantined", "refund_malformed");

  const [found = null] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM refund_cases WHERE reference = ${reference} AND order_id = ${orderId}::uuid
  `;
  if (!found) return none("quarantined", "unknown_refund");
  const row = await lockRefundCase(tx, found.id);

  if (event.providerPaymentId !== row.providerPaymentId) return none("quarantined", "refund_payment");
  if (event.amountRupiah !== row.amountRupiah) return none("quarantined", "refund_amount");
  if (row.providerRefundId && row.providerRefundId !== event.refund.providerRefundId) return none("quarantined", "refund_id");

  const succeeded = event.kind === "refund.succeeded";
  switch (row.state) {
    case "processing":
      return succeeded
        ? { action: { caseId: row.id, kind: "refund_complete" }, outcome: "accepted", reason: null }
        : { action: { caseId: row.id, kind: "refund_fail" }, outcome: "declined", reason: null };
    case "completed":
      return succeeded ? none("ignored", "duplicate_refund_event") : none("review", "refund_failed_after_completed");
    case "failed":
      return succeeded ? none("review", "refund_succeeded_after_failed") : none("ignored", "duplicate_refund_event");
    case "cancelled":
    case "rejected":
      return succeeded ? none("review", `refund_succeeded_after_${row.state}`) : none("ignored", `refund_${row.state}`);
    default:
      // Prepared or approved: we never sent this refund, so the provider has no business confirming it.
      return none("quarantined", "refund_not_started");
  }
}

async function decideDisputeEvent(tx: Tx, orderId: string, event: VerifiedPaymentEvent): Promise<RefundEventDecision> {
  const providerDisputeId = event.dispute?.providerDisputeId;
  if (!event.dispute || !providerDisputeId || !event.providerPaymentId) return none("quarantined", "dispute_malformed");

  const [existing = null] = await tx.$queryRaw<Array<{ id: string; state: string }>>`
    SELECT id, state::text AS state FROM payment_disputes
    WHERE order_id = ${orderId}::uuid AND provider_dispute_id = ${providerDisputeId}
  `;

  if (event.kind === "dispute.opened") {
    if (existing) return none("ignored", "duplicate_dispute");

    const payment = await getCapturedPayment(tx, orderId, event.providerPaymentId);
    if (!payment) return none("review", "dispute_without_capture");
    if (event.amountRupiah > payment.capturedRupiah) return none("review", "dispute_amount_exceeds_capture");

    const [open = null] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payment_disputes
      WHERE order_id = ${orderId}::uuid AND provider_payment_id = ${event.providerPaymentId} AND state = 'open' LIMIT 1
    `;
    if (open) return none("review", "second_open_dispute");
    return { action: { kind: "dispute_open" }, outcome: "accepted", reason: null };
  }

  const outcome = event.kind === "dispute.won" ? "won" : "lost";
  if (!existing) return none("review", "dispute_unknown");
  if (existing.state === "open") {
    return { action: { disputeId: existing.id, kind: "dispute_resolve", outcome }, outcome: "accepted", reason: null };
  }
  return existing.state === outcome ? none("ignored", "duplicate_dispute_resolution") : none("review", "dispute_conflicting_resolution");
}

/** What a refund or dispute event means for this order, read under the order lock. */
async function decideRefundDisputeEvent(tx: Tx, orderId: string, event: VerifiedPaymentEvent): Promise<RefundEventDecision> {
  if ((REFUND_KINDS as readonly string[]).includes(event.kind)) return decideRefundEvent(tx, orderId, event);
  if ((DISPUTE_KINDS as readonly string[]).includes(event.kind)) return decideDisputeEvent(tx, orderId, event);
  return none("quarantined", "unknown_event_kind");
}

/** Carries out a decided event. `recordedEventId` is the stored `payment_events` row. */
async function applyRefundDisputeEvent(
  tx: Tx,
  input: { action: EventAction; event: VerifiedPaymentEvent; orderId: string; recordedEventId: string },
) {
  const { action, event } = input;

  switch (action.kind) {
    case "refund_complete": {
      const row = await lockRefundCase(tx, action.caseId);
      return completeRefund(
        tx,
        row,
        { actor: { kind: "provider" }, eventId: input.recordedEventId, source: "provider_event" },
        event.refund?.providerRefundId ?? null,
      );
    }
    case "refund_fail": {
      const row = await lockRefundCase(tx, action.caseId);
      await endRefundCase(tx, row, "failed", { kind: "provider" }, "Penyedia melaporkan pengembalian dana gagal.");
      return null;
    }
    case "dispute_open":
      return openDisputeInTx(tx, {
        amountRupiah: event.amountRupiah,
        noticeReceivedAt: event.occurredAt,
        orderId: input.orderId,
        paymentEventId: input.recordedEventId,
        providerDisputeId: event.dispute?.providerDisputeId ?? "",
        providerPaymentId: event.providerPaymentId ?? "",
        reasonText: event.dispute?.reason?.trim() || "Sengketa dari penyedia pembayaran",
        recordedBy: { kind: "provider" },
        responseDueAt: event.dispute?.responseDueAt ?? null,
        source: "provider_event",
      });
    case "dispute_resolve":
      return resolveDisputeInTx(tx, {
        actor: { kind: "provider" },
        disputeId: action.disputeId,
        note: `Dilaporkan penyedia (kejadian ${event.eventId}).`,
        outcome: action.outcome,
        source: "provider_event",
      });
    default:
      return null;
  }
}

export { applyRefundDisputeEvent, decideRefundDisputeEvent, isRefundOrDisputeKind };
export type { EventAction, RefundEventDecision };
