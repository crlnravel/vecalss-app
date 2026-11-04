import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import {
  ProviderOutcomeUnknownError,
  type EventVerification,
  type PaymentEventKind,
  type PaymentProviderAdapter,
  type PaymentSession,
  type PaymentSessionRequest,
  type ProviderPaymentStatus,
  type ProviderRefundState,
  type ProviderRefundStatus,
  type RefundRequest,
  type RefundResult,
  type VerifyEventInput,
} from "../adapter";
import { isLocalStandInRuntime } from "./gate";
import { checkStandInSignature, signStandInEvent } from "./signing";

/**
 * A local stand-in for the real payment provider, so orders, the payment inbox,
 * the outbox and reconciliation can be built and tested before E2Pay's
 * documentation exists. It keeps its own payment state in `stand_in_payments`,
 * signs its events like a real provider would, and has a plain "pay" page.
 *
 * It is enabled only by `PAYMENT_PROVIDER=stand-in` against a local database;
 * see lib/payments/provider.ts. It must never run anywhere else.
 */

const STAND_IN_PROVIDER_ID = "stand-in";
const STAND_IN_ACCOUNT = "stand-in-local";
const STAND_IN_ENVIRONMENT = "local";
/** Documented test secret. Usable only after the local-runtime gate (./gate.ts) passes, so a deployed process can never fall back to it. */
const STAND_IN_DEFAULT_SECRET = "stand-in-local-test-secret";

const EVENT_KINDS = [
  "payment.succeeded",
  "payment.failed",
  "payment.expired",
  "refund.succeeded",
  "refund.failed",
  "dispute.opened",
  "dispute.won",
  "dispute.lost",
] as const satisfies readonly PaymentEventKind[];

const eventSchema = z.object({
  dispute: z.object({
    id: z.string().min(1).max(160),
    reason: z.string().max(500).nullish(),
    responseDueAt: z.iso.datetime({ offset: true }).nullish(),
  }).optional(),
  refund: z.object({
    id: z.string().min(1).max(160),
    reference: z.string().min(1).max(40),
  }).optional(),
  createdAt: z.iso.datetime({ offset: true }),
  environment: z.string().min(1).max(40),
  id: z.string().min(1).max(160),
  merchantAccount: z.string().min(1).max(80),
  payment: z.object({
    amount: z.number().int().min(0),
    currency: z.string().length(3),
    id: z.string().min(1).max(160),
    metadata: z.object({
      buyerId: z.string().max(80).optional(),
      packageCode: z.string().max(80).optional(),
    }).default({}),
    reference: z.string().min(1).max(120),
  }),
  type: z.enum(EVENT_KINDS),
}).superRefine((value, context) => {
  if (value.type.startsWith("refund.") && !value.refund) context.addIssue({ code: "custom", message: "refund missing", path: ["refund"] });
  if (value.type.startsWith("dispute.") && !value.dispute) context.addIssue({ code: "custom", message: "dispute missing", path: ["dispute"] });
});

type StandInOptions = {
  appBaseUrl: string;
  /** The environment the local-runtime gate reads when no secret is given. Defaults to process.env. */
  env?: Partial<Record<string, string | undefined>>;
  secret?: string;
};

type RefundFault = "after" | "before";

class StandInProvider implements PaymentProviderAdapter {
  readonly id = STAND_IN_PROVIDER_ID;
  readonly merchantAccount = STAND_IN_ACCOUNT;
  readonly environment = STAND_IN_ENVIRONMENT;

  private readonly appBaseUrl: string;
  private readonly secret: string;
  private readonly refundFaults: RefundFault[] = [];

  constructor({ appBaseUrl, env = process.env, secret }: StandInOptions) {
    this.appBaseUrl = appBaseUrl;

    const explicit = secret?.trim();
    if (!explicit && !isLocalStandInRuntime(env)) {
      throw new Error("The stand-in's fixed test secret is only available on a developer's own machine.");
    }
    this.secret = explicit || STAND_IN_DEFAULT_SECRET;
  }

  /** Same reference, same session: the insert is skipped when the reference already exists. */
  async createSession(request: PaymentSessionRequest): Promise<PaymentSession> {
    const paymentId = `sip_${randomBytes(12).toString("hex")}`;
    await prisma.$executeRaw`
      INSERT INTO stand_in_payments (reference, provider_payment_id, amount_rupiah, currency, metadata, expires_at)
      VALUES (
        ${request.merchantReference},
        ${paymentId},
        ${request.amountRupiah},
        ${request.currency},
        ${JSON.stringify(request.metadata)}::jsonb,
        ${request.expiresAt}
      )
      ON CONFLICT (reference) DO NOTHING
    `;

    const stored = await prisma.standInPayment.findUniqueOrThrow({
      where: { reference: request.merchantReference },
    });
    if (stored.amountRupiah !== request.amountRupiah || stored.currency !== request.currency) {
      throw new Error("The reference was already used for a different payment.");
    }

    return {
      checkoutUrl: `${this.appBaseUrl}/pay/stand-in/${encodeURIComponent(request.merchantReference)}`,
      providerPaymentId: stored.providerPaymentId,
    };
  }

  async getStatus(merchantReference: string): Promise<ProviderPaymentStatus> {
    // The stand-in's own clock is the database's: a pending payment past its
    // expiry reads as expired without anything having to flip it.
    const [row] = await prisma.$queryRaw<Array<{
      amountRupiah: number;
      currency: string;
      metadata: { buyerId?: string; packageCode?: string };
      providerPaymentId: string;
      reference: string;
      state: string;
      occurredAt: Date;
    }>>`
      SELECT amount_rupiah AS "amountRupiah",
             currency,
             metadata,
             provider_payment_id AS "providerPaymentId",
             reference,
             CASE WHEN state = 'pending' AND expires_at <= now() THEN 'expired' ELSE state END AS state,
             COALESCE(settled_at, CASE WHEN state = 'pending' AND expires_at <= now() THEN expires_at END, created_at) AS "occurredAt"
      FROM stand_in_payments
      WHERE reference = ${merchantReference}
    `;
    if (!row) return { found: false };

    return {
      amountRupiah: row.amountRupiah,
      buyerId: row.metadata.buyerId ?? null,
      checkoutUrl: `${this.appBaseUrl}/pay/stand-in/${encodeURIComponent(row.reference)}`,
      currency: row.currency,
      environment: this.environment,
      found: true,
      merchantAccount: this.merchantAccount,
      merchantReference: row.reference,
      occurredAt: row.occurredAt,
      packageCode: row.metadata.packageCode ?? null,
      providerPaymentId: row.providerPaymentId,
      state: row.state as "pending" | "succeeded" | "failed" | "expired",
    };
  }

  /**
   * Makes the next refund call time out, as a test: `before` loses the request
   * (the provider never saw it), `after` loses the answer (the provider did
   * record the refund). The caller sees the same unknown outcome either way.
   */
  failNextRefundCall(fault: RefundFault) {
    this.refundFaults.push(fault);
  }

  /** Same reference, same refund. A refund beyond what the payment captured is refused outright. */
  async createRefund(request: RefundRequest): Promise<RefundResult> {
    const fault = this.refundFaults.shift();
    if (fault === "before") throw new ProviderOutcomeUnknownError();

    const result = await prisma.$transaction(async (tx): Promise<RefundResult> => {
      // One refund request per payment at a time, so the sum below cannot be raced.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stand-in-refund:${request.providerPaymentId}`}))`;

      const [existing = null] = await tx.$queryRaw<Array<{ amountRupiah: number; providerPaymentId: string; providerRefundId: string; state: ProviderRefundState }>>`
        SELECT amount_rupiah AS "amountRupiah", provider_payment_id AS "providerPaymentId",
               provider_refund_id AS "providerRefundId", state
        FROM stand_in_refunds WHERE reference = ${request.refundReference}
      `;
      if (existing) {
        if (existing.amountRupiah !== request.amountRupiah || existing.providerPaymentId !== request.providerPaymentId) {
          return { outcome: "rejected", reason: "reference_reused" };
        }
        return { outcome: "accepted", providerRefundId: existing.providerRefundId, state: existing.state };
      }

      const [payment = null] = await tx.$queryRaw<Array<{ amountRupiah: number; currency: string; state: string }>>`
        SELECT amount_rupiah AS "amountRupiah", currency, state FROM stand_in_payments
        WHERE provider_payment_id = ${request.providerPaymentId}
      `;
      if (!payment || payment.state !== "succeeded") return { outcome: "rejected", reason: "payment_not_captured" };
      if (payment.currency !== request.currency) return { outcome: "rejected", reason: "currency" };

      const [{ taken }] = await tx.$queryRaw<Array<{ taken: number }>>`
        SELECT COALESCE(sum(amount_rupiah), 0)::int AS taken FROM stand_in_refunds
        WHERE provider_payment_id = ${request.providerPaymentId} AND state IN ('pending', 'succeeded')
      `;
      if (taken + request.amountRupiah > payment.amountRupiah) return { outcome: "rejected", reason: "exceeds_capture" };

      const providerRefundId = `sir_${randomBytes(12).toString("hex")}`;
      await tx.$executeRaw`
        INSERT INTO stand_in_refunds (reference, provider_refund_id, provider_payment_id, amount_rupiah, currency)
        VALUES (${request.refundReference}, ${providerRefundId}, ${request.providerPaymentId}, ${request.amountRupiah}, ${request.currency})
      `;
      return { outcome: "accepted", providerRefundId, state: "pending" };
    });

    if (fault === "after") throw new ProviderOutcomeUnknownError();
    return result;
  }

  async getRefundStatus(refundReference: string): Promise<ProviderRefundStatus> {
    const [row = null] = await prisma.$queryRaw<Array<{
      amountRupiah: number;
      currency: string;
      occurredAt: Date;
      providerPaymentId: string;
      providerRefundId: string;
      reference: string;
      state: ProviderRefundState;
    }>>`
      SELECT amount_rupiah AS "amountRupiah", currency, COALESCE(settled_at, created_at) AS "occurredAt",
             provider_payment_id AS "providerPaymentId", provider_refund_id AS "providerRefundId",
             reference, state
      FROM stand_in_refunds WHERE reference = ${refundReference}
    `;
    if (!row) return { found: false };

    return {
      amountRupiah: row.amountRupiah,
      currency: row.currency,
      environment: this.environment,
      found: true,
      merchantAccount: this.merchantAccount,
      occurredAt: row.occurredAt,
      providerPaymentId: row.providerPaymentId,
      providerRefundId: row.providerRefundId,
      refundReference: row.reference,
      state: row.state,
    };
  }

  /**
   * What the stand-in's refund console does: settle a pending refund and return
   * the signed event the provider would send. Null when it is not pending.
   */
  async settleRefund(refundReference: string, outcome: "failed" | "succeeded", at: Date) {
    const [row = null] = await prisma.$queryRaw<Array<{ providerPaymentId: string; providerRefundId: string; reference: string }>>`
      UPDATE stand_in_refunds SET state = ${outcome}, settled_at = now()
      WHERE reference = ${refundReference} AND state = 'pending'
      RETURNING provider_payment_id AS "providerPaymentId", provider_refund_id AS "providerRefundId", reference
    `;
    if (!row) return null;

    return this.buildSignedRefundEventFor(row.reference, `refund.${outcome}`, at);
  }

  /** A signed refund event for a refund the stand-in knows, whatever its state. Tests forge variants with the overrides. */
  async buildSignedRefundEventFor(
    refundReference: string,
    kind: "refund.failed" | "refund.succeeded",
    at: Date,
    overrides: { amountRupiah?: number; eventId?: string; providerPaymentId?: string; refundReference?: string } = {},
  ) {
    const [row] = await prisma.$queryRaw<Array<{
      amountRupiah: number;
      currency: string;
      metadata: { buyerId?: string; packageCode?: string };
      orderReference: string;
      providerPaymentId: string;
      providerRefundId: string;
    }>>`
      SELECT r.amount_rupiah AS "amountRupiah", r.currency, p.metadata, p.reference AS "orderReference",
             r.provider_payment_id AS "providerPaymentId", r.provider_refund_id AS "providerRefundId"
      FROM stand_in_refunds r JOIN stand_in_payments p ON p.provider_payment_id = r.provider_payment_id
      WHERE r.reference = ${refundReference}
    `;
    if (!row) throw new Error("The stand-in has no such refund.");

    return this.buildSignedEvent(
      {
        amountRupiah: overrides.amountRupiah ?? row.amountRupiah,
        currency: row.currency,
        metadata: row.metadata,
        providerPaymentId: overrides.providerPaymentId ?? row.providerPaymentId,
        reference: row.orderReference,
      },
      kind,
      at,
      {
        eventId: overrides.eventId,
        extra: { refund: { id: row.providerRefundId, reference: overrides.refundReference ?? refundReference } },
      },
    );
  }

  verifyAndParseEvent({ headers, now, rawBody }: VerifyEventInput): EventVerification {
    const check = checkStandInSignature(this.secret, headers, rawBody, now);
    if (check !== "ok") return { ok: false, reason: check };

    let parsed: z.infer<typeof eventSchema>;
    try {
      const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
      parsed = eventSchema.parse(json);
    } catch {
      return { ok: false, reason: "malformed" };
    }

    return {
      event: {
        amountRupiah: parsed.payment.amount,
        buyerId: parsed.payment.metadata.buyerId ?? null,
        currency: parsed.payment.currency,
        environment: parsed.environment,
        eventId: parsed.id,
        kind: parsed.type,
        merchantAccount: parsed.merchantAccount,
        merchantReference: parsed.payment.reference,
        occurredAt: new Date(parsed.createdAt),
        packageCode: parsed.payment.metadata.packageCode ?? null,
        providerPaymentId: parsed.payment.id,
        ...(parsed.refund ? { refund: { providerRefundId: parsed.refund.id, refundReference: parsed.refund.reference } } : {}),
        ...(parsed.dispute
          ? {
              dispute: {
                providerDisputeId: parsed.dispute.id,
                reason: parsed.dispute.reason ?? null,
                responseDueAt: parsed.dispute.responseDueAt ? new Date(parsed.dispute.responseDueAt) : null,
              },
            }
          : {}),
      },
      ok: true,
    };
  }

  /**
   * What the stand-in's own "pay" page does: settle a pending payment and
   * return the signed event the provider would send. Null when the payment is
   * not pending any more, or has run out of time to be paid.
   */
  async settle(merchantReference: string, outcome: "succeeded" | "failed" | "expired", at: Date) {
    const [row] = await prisma.$queryRaw<Array<{
      amountRupiah: number;
      currency: string;
      metadata: { buyerId?: string; packageCode?: string };
      providerPaymentId: string;
      reference: string;
    }>>`
      UPDATE stand_in_payments
      SET state = ${outcome}, settled_at = now()
      WHERE reference = ${merchantReference}
        AND state = 'pending'
        AND (${outcome} <> 'succeeded' OR expires_at > now())
      RETURNING amount_rupiah AS "amountRupiah", currency, metadata,
                provider_payment_id AS "providerPaymentId", reference
    `;
    if (!row) return null;

    return this.buildSignedEvent(row, `payment.${outcome}` as PaymentEventKind, at);
  }

  /** A signed event for any payment shape. The pay page uses it; tests also forge variants with it. */
  buildSignedEvent(
    payment: {
      amountRupiah: number;
      currency: string;
      metadata: { buyerId?: string; packageCode?: string };
      providerPaymentId: string;
      reference: string;
    },
    kind: PaymentEventKind,
    at: Date,
    overrides: {
      account?: string;
      environment?: string;
      eventId?: string;
      /** Extra top-level members of the event body: the `refund` or `dispute` object. */
      extra?: Record<string, unknown>;
    } = {},
  ) {
    const body = new TextEncoder().encode(JSON.stringify({
      ...overrides.extra,
      createdAt: at.toISOString(),
      environment: overrides.environment ?? this.environment,
      id: overrides.eventId ?? `evt_${randomUUID()}`,
      merchantAccount: overrides.account ?? this.merchantAccount,
      payment: {
        amount: payment.amountRupiah,
        currency: payment.currency,
        id: payment.providerPaymentId,
        metadata: payment.metadata,
        reference: payment.reference,
      },
      type: kind,
    }));

    return { body, headers: signStandInEvent(this.secret, body, at) };
  }

  /**
   * A signed dispute event for a payment the stand-in knows. The stand-in keeps
   * no dispute state of its own: a dispute is only ever an event.
   */
  async buildSignedDisputeEventFor(
    orderReference: string,
    kind: "dispute.lost" | "dispute.opened" | "dispute.won",
    at: Date,
    dispute: { amountRupiah?: number; eventId?: string; providerDisputeId: string; reason?: string | null; responseDueAt?: Date | null },
  ) {
    const [row] = await prisma.$queryRaw<Array<{
      amountRupiah: number;
      currency: string;
      metadata: { buyerId?: string; packageCode?: string };
      providerPaymentId: string;
    }>>`
      SELECT amount_rupiah AS "amountRupiah", currency, metadata, provider_payment_id AS "providerPaymentId"
      FROM stand_in_payments WHERE reference = ${orderReference}
    `;
    if (!row) throw new Error("The stand-in has no such payment.");

    return this.buildSignedEvent(
      {
        amountRupiah: dispute.amountRupiah ?? row.amountRupiah,
        currency: row.currency,
        metadata: row.metadata,
        providerPaymentId: row.providerPaymentId,
        reference: orderReference,
      },
      kind,
      at,
      {
        eventId: dispute.eventId,
        extra: {
          dispute: {
            id: dispute.providerDisputeId,
            reason: dispute.reason ?? null,
            responseDueAt: dispute.responseDueAt ? dispute.responseDueAt.toISOString() : null,
          },
        },
      },
    );
  }
}

export {
  STAND_IN_ACCOUNT,
  STAND_IN_DEFAULT_SECRET,
  STAND_IN_ENVIRONMENT,
  STAND_IN_PROVIDER_ID,
  StandInProvider,
};
