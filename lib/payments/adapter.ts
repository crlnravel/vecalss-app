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

type PaymentEventKind = "payment.succeeded" | "payment.failed" | "payment.expired";

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
  verifyAndParseEvent(input: VerifyEventInput): EventVerification;
}

export type {
  EventVerification,
  PaymentEventKind,
  PaymentProviderAdapter,
  PaymentSession,
  PaymentSessionRequest,
  ProviderPaymentState,
  ProviderPaymentStatus,
  VerifiedPaymentEvent,
  VerifyEventInput,
};
