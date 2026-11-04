import "server-only";

import type { Tx } from "./audit";
import { openFraudCase } from "./cases";
import type { BlockMatch } from "./blocks";

/**
 * The signals raised the moment something happens, inside the transaction that
 * handled it: a held payment event, a payment that went to review, and an
 * attempt from a blocked identifier. The cases they open carry ids, codes and
 * counts only; the raw evidence stays in the order and event tables, where only
 * an admin with a verified second factor can read it.
 */

/** A provider event that did not match the order it named (MS-05). */
async function flagQuarantinedEvent(
  tx: Tx,
  input: { eventId: string; orderId: string | null; reason: string | null; userId?: string | null },
) {
  return openFraudCase(tx, {
    evidence: { orderId: input.orderId, paymentEventId: input.eventId, reason: input.reason },
    orderId: input.orderId,
    paymentEventId: input.eventId,
    signal: "payment_quarantined",
    subjectKey: input.orderId ? `order:${input.orderId}` : `event:${input.eventId}`,
    subjectType: input.orderId ? "order" : "event",
    userId: input.userId ?? null,
  });
}

/** A payment that was kept but not accepted: a late success, a second capture, or a blocked buyer. */
async function flagPaymentReview(
  tx: Tx,
  input: { eventId: string; orderId: string; reason: string | null; userId: string },
) {
  return openFraudCase(tx, {
    evidence: { orderId: input.orderId, paymentEventId: input.eventId, reason: input.reason },
    orderId: input.orderId,
    paymentEventId: input.eventId,
    signal: "payment_review",
    subjectKey: `order:${input.orderId}`,
    subjectType: "order",
    userId: input.userId,
  });
}

type AttemptContext = "checkout" | "paid_order" | "signup";

/** Someone tried to act with an identifier that is blocked. Deduped per account while the case is open. */
async function flagBlockedAttempt(
  tx: Tx,
  input: { context: AttemptContext; matches: BlockMatch[]; orderId?: string | null; policyVersion?: number | null; userId: string },
) {
  return openFraudCase(tx, {
    evidence: {
      blockIds: input.matches.map((match) => match.id),
      context: input.context,
      matchedTypes: [...new Set(input.matches.map((match) => match.type))],
      ...(input.orderId ? { orderId: input.orderId } : {}),
    },
    orderId: input.orderId ?? null,
    policyVersion: input.policyVersion ?? null,
    signal: "blocked_attempt",
    subjectKey: `user:${input.userId}`,
    subjectType: "user",
    userId: input.userId,
  });
}

export { flagBlockedAttempt, flagPaymentReview, flagQuarantinedEvent };
export type { AttemptContext };
