import type { PAYMENT_CURRENCY } from "./constants";

/**
 * What the checkout and the payment inbox need from any payment provider.
 * Amounts are whole rupiah. The provider only ever sees an opaque
 * `merchantReference` for the order, never the order id.
 *
 * E2Pay (phase B) plugs in here: its session call, status call and signature
 * scheme map onto these three methods. The shapes below stay generic on
 * purpose; E2Pay's field names are translated inside its adapter, not here.
 */

type PaymentSessionRequest = {
  amountRupiah: number;
  currency: typeof PAYMENT_CURRENCY;
  expiresAt: Date;
  /**
   * Our opaque order reference. The provider must treat it as an idempotency
   * key: asking again with the same reference returns the same session and
   * never a second payable one.
   */
  merchantReference: string;
  /** Echoed back on events and status lookups, and matched against the order. */
  metadata: { buyerId: string; packageCode: string };
  /** Where the browser returns to. It is never evidence that payment succeeded. */
  returnUrl: string;
};

type PaymentSession = {
  /** Where to send the browser to pay. */
  checkoutUrl: string;
  providerPaymentId: string;
};

type ProviderPaymentState = "pending" | "succeeded" | "failed" | "expired";

/** The provider's account of one payment, from a status lookup. */
type ProviderPaymentStatus =
  | { found: false }
  | {
      amountRupiah: number;
      buyerId: string | null;
      checkoutUrl: string | null;
      currency: string;
      found: true;
      merchantAccount: string;
      environment: string;
      merchantReference: string;
      occurredAt: Date;
      packageCode: string | null;
      providerPaymentId: string;
      state: ProviderPaymentState;
    };

type PaymentEventKind =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.expired"
  | "refund.succeeded"
  | "refund.failed"
  | "dispute.opened"
  | "dispute.won"
  | "dispute.lost";

/** What we ask the provider to give back. `refundReference` is our idempotency key for it. */
type RefundRequest = {
  amountRupiah: number;
  currency: typeof PAYMENT_CURRENCY;
  /** The captured payment being refunded (the provider's payment id). */
  providerPaymentId: string;
  /**
   * Our opaque refund case reference. The provider must treat it as an
   * idempotency key: asking again with the same reference returns the same
   * refund and never a second one.
   */
  refundReference: string;
};

type ProviderRefundState = "pending" | "succeeded" | "failed";

/**
 * The provider's answer to a refund request. A definite refusal is `rejected`.
 * An unreachable or timed-out provider is not an answer: the adapter throws, and
 * the caller treats the outcome as unknown until it asks `getRefundStatus`.
 */
type RefundResult =
  | { outcome: "accepted"; providerRefundId: string; state: ProviderRefundState }
  | { outcome: "rejected"; reason: string };

/** The provider's account of one refund, from a status lookup. */
type ProviderRefundStatus =
  | { found: false }
  | {
      amountRupiah: number;
      currency: string;
      environment: string;
      found: true;
      merchantAccount: string;
      occurredAt: Date;
      providerPaymentId: string;
      providerRefundId: string;
      refundReference: string;
      state: ProviderRefundState;
    };

/** A provider event whose signature and freshness were verified. */
type VerifiedPaymentEvent = {
  amountRupiah: number;
  buyerId: string | null;
  currency: string;
  environment: string;
  eventId: string;
  kind: PaymentEventKind;
  merchantAccount: string;
  merchantReference: string;
  occurredAt: Date;
  packageCode: string | null;
  providerPaymentId: string | null;
  /** Refund and dispute events only. */
  dispute?: { providerDisputeId: string; reason: string | null; responseDueAt: Date | null };
  refund?: { providerRefundId: string; refundReference: string };
};

type EventVerification =
  | { event: VerifiedPaymentEvent; ok: true }
  | { ok: false; reason: "bad_signature" | "malformed" | "stale" };

type VerifyEventInput = {
  headers: Headers;
  /** Database time, so freshness is judged on the same clock as everything stored. */
  now: Date;
  /** The exact bytes received. The signature is computed over these, never over re-serialized JSON. */
  rawBody: Uint8Array;
};

interface PaymentProviderAdapter {
  /** Stable id used in the inbox URL and stored with every order and event. */
  readonly id: string;
  /** Account and environment this adapter signs in as; events from any other are quarantined. */
  readonly merchantAccount: string;
  readonly environment: string;

  createSession(request: PaymentSessionRequest): Promise<PaymentSession>;
  /** Looks a payment up by our reference. Throws when the provider cannot be reached. */
  getStatus(merchantReference: string): Promise<ProviderPaymentStatus>;
  /** Asks the provider to refund a captured payment. Throws when the answer is unknown. */
  createRefund(request: RefundRequest): Promise<RefundResult>;
  /** Looks a refund up by our refund reference. Throws when the provider cannot be reached. */
  getRefundStatus(refundReference: string): Promise<ProviderRefundStatus>;
  verifyAndParseEvent(input: VerifyEventInput): EventVerification;
}

/** Thrown by an adapter when a refund call may or may not have reached the provider. */
class ProviderOutcomeUnknownError extends Error {
  constructor(message = "The provider did not answer in time.") {
    super(message);
    this.name = "ProviderOutcomeUnknownError";
  }
}

export { ProviderOutcomeUnknownError };
export type {
  EventVerification,
  PaymentEventKind,
  PaymentProviderAdapter,
  PaymentSession,
  PaymentSessionRequest,
  ProviderPaymentState,
  ProviderPaymentStatus,
  ProviderRefundState,
  ProviderRefundStatus,
  RefundRequest,
  RefundResult,
  VerifiedPaymentEvent,
  VerifyEventInput,
};
