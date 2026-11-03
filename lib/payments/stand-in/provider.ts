import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import type {
  EventVerification,
  PaymentEventKind,
  PaymentProviderAdapter,
  PaymentSession,
  PaymentSessionRequest,
  ProviderPaymentStatus,
  VerifyEventInput,
} from "../adapter";
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
/** Documented test secret. The stand-in only exists on a local database, so a fixed fallback is safe. */
const STAND_IN_DEFAULT_SECRET = "stand-in-local-test-secret";

const EVENT_KINDS = ["payment.succeeded", "payment.failed", "payment.expired"] as const satisfies readonly PaymentEventKind[];

const eventSchema = z.object({
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
});

type StandInOptions = {
  appBaseUrl: string;
  secret?: string;
};

class StandInProvider implements PaymentProviderAdapter {
  readonly id = STAND_IN_PROVIDER_ID;
  readonly merchantAccount = STAND_IN_ACCOUNT;
  readonly environment = STAND_IN_ENVIRONMENT;

  private readonly appBaseUrl: string;
  private readonly secret: string;

  constructor({ appBaseUrl, secret }: StandInOptions) {
    this.appBaseUrl = appBaseUrl;
    this.secret = secret?.trim() || STAND_IN_DEFAULT_SECRET;
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
    overrides: { eventId?: string; account?: string; environment?: string } = {},
  ) {
    const body = new TextEncoder().encode(JSON.stringify({
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
}

export {
  STAND_IN_ACCOUNT,
  STAND_IN_DEFAULT_SECRET,
  STAND_IN_ENVIRONMENT,
  STAND_IN_PROVIDER_ID,
  StandInProvider,
};
