import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

import type { PaymentProviderAdapter, VerifiedPaymentEvent } from "./adapter";
import { checkOrderBlocks, type BlockCheck } from "@/lib/fraud/blocks";
import { fulfillPaidOrder, queueGrantRetry, type FulfillOptions } from "@/lib/fulfillment/grant";
import { FraudConfigError } from "@/lib/fraud/errors";
import { flagBlockedAttempt, flagPaymentReview, flagQuarantinedEvent } from "@/lib/fraud/signals";

import { writePaymentAudit } from "./audit";
import { enqueueOutbox } from "./outbox";
import { moveReservation } from "./risk/reserve";

type OrderState = "pending" | "paid" | "failed" | "expired" | "review";
type EventOutcome = "accepted" | "declined" | "expired" | "review" | "quarantined" | "ignored";
type EventSource = "webhook" | "reconciliation";

/** The columns of an order that a decision needs. */
type OrderForDecision = {
  amountRupiah: number;
  buyerId: string;
  currency: string;
  id: string;
  packageCode: string;
  provider: string;
  providerAccount: string;
  providerEnvironment: string;
  providerReference: string | null;
  status: OrderState;
};

type Decision = {
  /** What the order becomes, if it changes. */
  orderTo: "paid" | "failed" | "expired" | "review" | null;
  outcome: EventOutcome;
  reason: string | null;
};

/**
 * Compares a verified event with the server's own order. Any difference is a
 * mismatch and the event is quarantined: it is stored and alerted, and the
 * order is left exactly as it was.
 */
function findMismatches(
  order: OrderForDecision | null,
  event: VerifiedPaymentEvent,
  adapter: PaymentProviderAdapter,
) {
  if (!order) return ["unknown_order"];

  const mismatches: string[] = [];
  if (
    event.merchantAccount !== adapter.merchantAccount
    || event.environment !== adapter.environment
    || order.provider !== adapter.id
    || order.providerAccount !== event.merchantAccount
    || order.providerEnvironment !== event.environment
  ) mismatches.push("merchant");
  if (event.amountRupiah !== order.amountRupiah) mismatches.push("amount");
  if (event.currency !== order.currency) mismatches.push("currency");
  if (event.buyerId !== order.buyerId) mismatches.push("buyer");
  if (event.packageCode !== order.packageCode) mismatches.push("package");
  if (
    (event.kind === "payment.succeeded" && !event.providerPaymentId)
    || (event.providerPaymentId && order.providerReference !== null && order.providerReference !== event.providerPaymentId)
  ) mismatches.push("payment");

  return mismatches;
}

/**
 * Pure decision for one event against one order's current state.
 *
 * - success on a pending order is accepted;
 * - success on a failed or expired order is never accepted automatically: the
 *   money is real, so the order goes to review;
 * - a second success for the same payment is a duplicate, and one for a
 *   different payment is an unexpected second capture, recorded for review;
 * - failure and expiry only move a pending order, and are ignored otherwise,
 *   so a reordered event cannot undo a payment.
 */
function decidePaymentEvent(
  order: OrderForDecision | null,
  event: VerifiedPaymentEvent,
  adapter: PaymentProviderAdapter,
): Decision {
  const mismatches = findMismatches(order, event, adapter);

  // Everything matches except the payment id, and the order is already settled:
  // a second, genuine capture. The money moved, so it is kept and reviewed
  // rather than discarded as a duplicate or merged into the first payment.
  if (
    order
    && event.kind === "payment.succeeded"
    && (order.status === "paid" || order.status === "review")
    && mismatches.length === 1
    && mismatches[0] === "payment"
  ) {
    return { orderTo: null, outcome: "review", reason: "second_capture" };
  }

  if (mismatches.length > 0 || !order) {
    return { orderTo: null, outcome: "quarantined", reason: mismatches.join(",") };
  }

  if (event.kind === "payment.succeeded") {
    switch (order.status) {
      case "pending":
        return { orderTo: "paid", outcome: "accepted", reason: null };
      case "failed":
      case "expired":
        return { orderTo: "review", outcome: "review", reason: `late_success_after_${order.status}` };
      case "paid":
      case "review":
        // Same payment id (a different payment id was handled above).
        return { orderTo: null, outcome: "ignored", reason: "duplicate_capture" };
    }
  }

  if (order.status !== "pending") return { orderTo: null, outcome: "ignored", reason: `order_${order.status}` };

  return event.kind === "payment.failed"
    ? { orderTo: "failed", outcome: "declined", reason: null }
    : { orderTo: "expired", outcome: "expired", reason: null };
}

type ProcessInput = {
  adapter: PaymentProviderAdapter;
  bodySha256?: string | null;
  callerIp?: string | null;
  event: VerifiedPaymentEvent;
  /** Server settings for the access grant (the Full Access end dates). Tests pass their own. */
  fulfillment?: FulfillOptions;
  source: EventSource;
};

type ProcessResult =
  | { orderId: string | null; outcome: EventOutcome; reason: string | null; status: "processed" }
  | { status: "duplicate" };

const KIND_TO_TYPE = {
  "payment.expired": "expired",
  "payment.failed": "failed",
  "payment.succeeded": "succeeded",
} as const;

/**
 * Applies one verified event in a single transaction: the event row (with its
 * decision), the order transition, the purchase summary, the audit event and
 * the outbox jobs commit together or not at all. The order row is locked first,
 * so two deliveries for one order are decided one after the other, and the
 * event identity is unique, so a repeated delivery changes nothing.
 */
async function processPaymentEvent(input: ProcessInput): Promise<ProcessResult> {
  const { adapter, event } = input;

  return prisma.$transaction(async (tx) => {
    const [order = null] = await tx.$queryRaw<OrderForDecision[]>`
      SELECT id, buyer_id AS "buyerId", amount_rupiah AS "amountRupiah", currency,
             package_code AS "packageCode", provider, provider_account AS "providerAccount",
             provider_environment AS "providerEnvironment", provider_reference AS "providerReference",
             status
      FROM payment_orders
      WHERE reference = ${event.merchantReference}
      FOR UPDATE
    `;

    let decision = decidePaymentEvent(order, event, adapter);

    // A payment that would be accepted is checked against the blocks once more:
    // the buyer may have been blocked since checkout started. The money has
    // arrived, so it is kept, not refused: the order goes to review, no access
    // follows, and a case is opened. If blocks cannot be read at all, the same
    // holds (fail closed).
    let heldForBlock: BlockCheck | null = null;
    if (order && decision.orderTo === "paid") {
      try {
        const check = await checkOrderBlocks(tx, order.id);
        if (check.blocked) {
          heldForBlock = check;
          decision = { orderTo: "review", outcome: "review", reason: "blocked_buyer" };
        }
      } catch (error) {
        if (!(error instanceof FraudConfigError)) throw error;
        decision = { orderTo: "review", outcome: "review", reason: "blocks_unavailable" };
      }
    }

    const [recorded] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO payment_events (
        provider, provider_environment, provider_account, event_id, type, source,
        provider_payment_id, merchant_reference, order_id, amount_rupiah, currency,
        buyer_id, package_code, outcome, reason, body_sha256, caller_ip, provider_occurred_at
      )
      VALUES (
        ${adapter.id}, ${event.environment}, ${event.merchantAccount}, ${event.eventId},
        ${KIND_TO_TYPE[event.kind]}::payment_event_type, ${input.source}::payment_event_source,
        ${event.providerPaymentId}, ${event.merchantReference}, ${order?.id ?? null}::uuid,
        ${event.amountRupiah}, ${event.currency}, ${event.buyerId}, ${event.packageCode},
        ${decision.outcome}::payment_event_outcome, ${decision.reason},
        ${input.bodySha256 ?? null}, ${input.callerIp ?? null}::inet, ${event.occurredAt}
      )
      ON CONFLICT (provider, provider_environment, provider_account, event_id) DO NOTHING
      RETURNING id
    `;
    // A delivery we have already decided on: nothing else may happen.
    if (!recorded) return { status: "duplicate" as const };

    const audit = (action: string, extra: Record<string, unknown> = {}) =>
      writePaymentAudit(tx, {
        action,
        ipAddress: input.callerIp ?? null,
        metadata: {
          amountRupiah: event.amountRupiah,
          eventId: event.eventId,
          paymentEventId: recorded.id,
          providerPaymentId: event.providerPaymentId,
          reason: decision.reason,
          source: input.source,
          ...extra,
        },
        targetId: order?.id ?? recorded.id,
        targetType: order ? "payment_order" : "payment_event",
      });

    if (decision.outcome === "quarantined") {
      await audit("payment.event.quarantined");
      await flagQuarantinedEvent(tx, {
        eventId: recorded.id,
        orderId: order?.id ?? null,
        reason: decision.reason,
        userId: order?.buyerId ?? null,
      });
      await enqueueOutbox(tx, {
        dedupeKey: `alert:event:${recorded.id}`,
        kind: "critical_alert",
        orderId: order?.id ?? null,
        payload: { kind: "quarantined", paymentEventId: recorded.id, reason: decision.reason },
      });
    } else if (order && decision.orderTo === "paid") {
      const [purchase] = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO package_purchases (
          student_id, package_code, package_name, status, affiliator_profile_id,
          referral_code_snapshot, provider_reference, completed_at, provenance
        )
        SELECT o.buyer_id, o.package_code, o.package_name, 'succeeded'::package_purchase_status,
               o.affiliator_profile_id, o.referral_code, 'order:' || o.id::text, now(),
               'order'::package_purchase_provenance
        FROM payment_orders o
        WHERE o.id = ${order.id}::uuid
        RETURNING id
      `;
      await tx.$executeRaw`
        UPDATE payment_orders
        SET status = 'paid', status_changed_at = now(), paid_at = now(),
            provider_reference = COALESCE(provider_reference, ${event.providerPaymentId}),
            package_purchase_id = ${purchase.id}::uuid, updated_at = now()
        WHERE id = ${order.id}::uuid
      `;
      const reserved = await moveReservation(tx, order.id, "paid", null);
      // Paid, summarised and granted commit together. The grant (MS-04, key
      // `order:<id>`) is part of this transaction; if it cannot happen the order
      // stays paid with delivery pending and a retry job is queued. A failure
      // inside the grant never takes the payment record down with it.
      const fulfilled = await fulfillPaidOrder(tx, order.id, input.fulfillment);
      if (fulfilled.status === "pending") await queueGrantRetry(tx, order.id);
      await audit("payment.order.paid", {
        delivery: fulfilled.status,
        packagePurchaseId: purchase.id,
        reservation: reserved ? "paid" : null,
      });
    } else if (order && decision.orderTo) {
      const reasonColumn = decision.orderTo === "review" ? decision.reason : null;
      await tx.$executeRaw`
        UPDATE payment_orders
        SET status = ${decision.orderTo}::payment_order_status, status_changed_at = now(),
            status_reason = ${reasonColumn},
            provider_reference = COALESCE(provider_reference, ${event.providerPaymentId}),
            updated_at = now()
        WHERE id = ${order.id}::uuid
      `;
      // The limits follow the order, in this same transaction: a confirmed
      // failure or expiry frees the exposure, and a payment that arrives after
      // one holds it again. This never reads the risk policy.
      const reservation = decision.orderTo === "review" ? "review" : "released";
      const reserved = await moveReservation(
        tx,
        order.id,
        reservation,
        decision.orderTo === "review" ? decision.reason : decision.orderTo,
      );
      await audit(`payment.order.${decision.orderTo}`, { reservation: reserved ? reservation : null });
      if (decision.orderTo === "review") {
        await flagPaymentReview(tx, {
          eventId: recorded.id,
          orderId: order.id,
          reason: decision.reason,
          userId: order.buyerId,
        });
        if (heldForBlock) {
          await flagBlockedAttempt(tx, {
            context: "paid_order",
            matches: heldForBlock.matches,
            orderId: order.id,
            userId: order.buyerId,
          });
        }
        await enqueueOutbox(tx, {
          dedupeKey: `alert:event:${recorded.id}`,
          kind: "critical_alert",
          orderId: order.id,
          payload: { kind: "review", paymentEventId: recorded.id, reason: decision.reason },
        });
      }
    } else if (order && decision.outcome === "review") {
      // A second capture on an order that is already settled: keep the evidence.
      await audit("payment.event.review");
      await flagPaymentReview(tx, {
        eventId: recorded.id,
        orderId: order.id,
        reason: decision.reason,
        userId: order.buyerId,
      });
      await enqueueOutbox(tx, {
        dedupeKey: `alert:event:${recorded.id}`,
        kind: "critical_alert",
        orderId: order.id,
        payload: { kind: "review", paymentEventId: recorded.id, reason: decision.reason },
      });
    }

    return {
      orderId: order?.id ?? null,
      outcome: decision.outcome,
      reason: decision.reason,
      status: "processed" as const,
    };
  });
}

type ReceiveInput = {
  adapter: PaymentProviderAdapter;
  callerIp: string | null;
  headers: Headers;
  rawBody: Uint8Array;
};

type ReceiveResult =
  | { result: ProcessResult; status: "received" }
  | { reason: "bad_signature" | "malformed" | "stale"; status: "refused" };

/**
 * The inbox entry point. The signature and freshness are checked on the raw
 * bytes against database time before anything is parsed or written; a refused
 * request leaves no trace in the tables.
 */
async function receivePaymentEvent(input: ReceiveInput): Promise<ReceiveResult> {
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
  const verified = input.adapter.verifyAndParseEvent({ headers: input.headers, now, rawBody: input.rawBody });
  if (!verified.ok) return { reason: verified.reason, status: "refused" };

  const result = await processPaymentEvent({
    adapter: input.adapter,
    bodySha256: createHash("sha256").update(input.rawBody).digest("hex"),
    callerIp: input.callerIp,
    event: verified.event,
    source: "webhook",
  });

  return { result, status: "received" };
}

export { decidePaymentEvent, findMismatches, processPaymentEvent, receivePaymentEvent };
export type { Decision, OrderForDecision, ProcessInput, ProcessResult, ReceiveResult };
