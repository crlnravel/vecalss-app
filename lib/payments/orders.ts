import "server-only";

import { randomBytes } from "node:crypto";

import { findActiveAffiliatorProfile, findPublishedPackageName } from "@/lib/affiliator/service";
import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

import type { PaymentProviderAdapter } from "./adapter";
import { writePaymentAudit } from "./audit";
import { PAYMENT_CURRENCY, PAYMENT_EXPIRY_MINUTES } from "./constants";

type OrderIntent = {
  amountRupiah: number;
  id: string;
  plan: string;
  pricingMonth: string;
  referralCode: string | null;
};

type CreateOrderInput = {
  buyerId: string;
  buyerIp: string | null;
  /** How the IP was obtained, for example `trusted-proxy:1`, or `unavailable`. */
  buyerIpSource: string;
  intent: OrderIntent;
  packageCode: string;
  provider: PaymentProviderAdapter;
};

const orderSelect = {
  amountRupiah: true,
  buyerId: true,
  currency: true,
  expiresAt: true,
  id: true,
  packageCode: true,
  plan: true,
  provider: true,
  providerReference: true,
  reference: true,
  sessionUrl: true,
  status: true,
} as const;

/** A fresh opaque token: 32 random bytes, URL-safe. */
function newOrderReference() {
  return randomBytes(32).toString("base64url");
}

/**
 * Creates the order for a checkout intent, or returns the one it already has.
 * The amount, plan, month and referral come from the intent's stored quote, so
 * nothing from the browser reaches the order. The package title and the
 * affiliator are snapshotted here, and later archival or deactivation never
 * rewrites them. Expiry is database time plus the payment window.
 *
 * Returns null when the plan's package is not published (nothing is created).
 */
async function createOrderFromIntent(input: CreateOrderInput) {
  const existing = await prisma.paymentOrder.findUnique({
    select: orderSelect,
    where: { intentId: input.intent.id },
  });
  if (existing) return existing;

  let packageName: string;
  try {
    packageName = await findPublishedPackageName(input.packageCode);
  } catch {
    return null;
  }
  const affiliator = input.intent.referralCode
    ? await findActiveAffiliatorProfile(input.intent.referralCode)
    : null;

  await prisma.$transaction(async (tx) => {
    const inserted = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO payment_orders (
        intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name,
        amount_rupiah, currency, referral_code, affiliator_profile_id, buyer_ip, buyer_ip_source,
        provider, provider_environment, provider_account, expires_at
      )
      VALUES (
        ${input.intent.id}::uuid, ${input.buyerId}::uuid, ${newOrderReference()}, ${input.intent.plan},
        ${input.intent.pricingMonth}, ${input.packageCode}, ${packageName},
        ${input.intent.amountRupiah}, ${PAYMENT_CURRENCY}, ${input.intent.referralCode},
        ${affiliator?.id ?? null}::uuid, ${input.buyerIp}::inet, ${input.buyerIpSource},
        ${input.provider.id}, ${input.provider.environment}, ${input.provider.merchantAccount},
        now() + make_interval(mins => ${PAYMENT_EXPIRY_MINUTES}::int)
      )
      ON CONFLICT (intent_id) DO NOTHING
      RETURNING id
    `;

    if (inserted[0]) {
      await writePaymentAudit(tx, {
        action: "payment.order.created",
        actorUserId: input.buyerId,
        ipAddress: input.buyerIp,
        metadata: {
          amountRupiah: input.intent.amountRupiah,
          buyerIpSource: input.buyerIpSource,
          currency: PAYMENT_CURRENCY,
          intentId: input.intent.id,
          packageCode: input.packageCode,
          provider: input.provider.id,
        },
        targetId: inserted[0].id,
        targetType: "payment_order",
      });
    }
  });

  return prisma.paymentOrder.findUnique({ select: orderSelect, where: { intentId: input.intent.id } });
}

type OrderRow = NonNullable<Awaited<ReturnType<typeof createOrderFromIntent>>>;

type SessionResult =
  | { checkoutUrl: string; ok: true }
  /** The order is not payable any more (paid, failed, expired, under review, or past its time). */
  | { ok: false; reason: "closed" }
  /** The provider could not be reached or gave an unusable answer; try again. */
  | { ok: false; reason: "unavailable" };

/**
 * Makes sure the order has exactly one payable session and returns where to
 * send the buyer.
 *
 * The provider is asked with the order's reference, which it treats as an
 * idempotency key, so a retry or a concurrent request is handed the same
 * session and never a second one. If the answer to a create call is lost
 * (timeout, crash after the provider accepted it), the next attempt looks the
 * reference up first; an unknown outcome never starts a new payable session.
 */
async function ensurePaymentSession(
  order: OrderRow,
  provider: PaymentProviderAdapter,
  appBaseUrl: string,
): Promise<SessionResult> {
  // Judge the order as it is now, not as the caller last read it.
  const [current] = await prisma.$queryRaw<Array<{ expired: boolean; sessionUrl: string | null; status: string }>>`
    SELECT expires_at <= now() AS expired, session_url AS "sessionUrl", status
    FROM payment_orders WHERE id = ${order.id}::uuid
  `;
  if (!current || current.status !== "pending" || current.expired) return { ok: false, reason: "closed" };
  if (current.sessionUrl) return { checkoutUrl: current.sessionUrl, ok: true };

  await prisma.$executeRaw`
    UPDATE payment_orders
    SET session_attempts = session_attempts + 1, session_requested_at = now(), updated_at = now()
    WHERE id = ${order.id}::uuid AND session_url IS NULL
  `;

  let session: { checkoutUrl: string; providerPaymentId: string } | null = null;
  try {
    session = await provider.createSession({
      amountRupiah: order.amountRupiah,
      currency: PAYMENT_CURRENCY,
      expiresAt: order.expiresAt,
      merchantReference: order.reference,
      metadata: { buyerId: order.buyerId, packageCode: order.packageCode },
      returnUrl: `${appBaseUrl}/pricing/checkout/status/${order.reference}`,
    });
  } catch {
    // The outcome is unknown: the provider may have accepted the request.
    try {
      const status = await provider.getStatus(order.reference);
      if (status.found) {
        if (status.state !== "pending" || !status.checkoutUrl) return { ok: false, reason: "closed" };
        session = { checkoutUrl: status.checkoutUrl, providerPaymentId: status.providerPaymentId };
      }
    } catch {
      // Still unknown. Report unavailable; the next attempt asks again.
    }
  }
  if (!session) return { ok: false, reason: "unavailable" };

  // First writer wins; a concurrent writer gets the same answer from the provider.
  await prisma.$executeRaw`
    UPDATE payment_orders
    SET provider_reference = COALESCE(provider_reference, ${session.providerPaymentId}),
        session_url = ${session.checkoutUrl},
        updated_at = now()
    WHERE id = ${order.id}::uuid AND session_url IS NULL AND status = 'pending'
  `;

  const linked = await prisma.paymentOrder.findUniqueOrThrow({
    select: { providerReference: true, sessionUrl: true, status: true },
    where: { id: order.id },
  });
  if (linked.status !== "pending") return { ok: false, reason: "closed" };
  if (!linked.sessionUrl || linked.providerReference !== session.providerPaymentId) {
    serverLogger.error("payments.session.reference_conflict", new Error("The order is linked to a different provider payment."), {
      area: "payments",
    });
    return { ok: false, reason: "unavailable" };
  }

  return { checkoutUrl: linked.sessionUrl, ok: true };
}

export { createOrderFromIntent, ensurePaymentSession, newOrderReference };
export type { CreateOrderInput, OrderIntent, OrderRow, SessionResult };
