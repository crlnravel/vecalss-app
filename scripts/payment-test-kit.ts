import "dotenv/config";
import { randomUUID } from "node:crypto";

import type { PaymentEventKind } from "../lib/payments/adapter";
import { receivePaymentEvent } from "../lib/payments/inbox";
import { createOrderFromIntent, ensurePaymentSession } from "../lib/payments/orders";
import { StandInProvider } from "../lib/payments/stand-in/provider";
import { prisma } from "../lib/prisma";

/**
 * Shared fixtures for the payment suites. Orders and payment events are never
 * deleted (the database refuses), so every run uses fresh users and references
 * and leaves its rows behind in the disposable local database.
 */

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("The payment suites only run against the local dev database on 127.0.0.1:55432.");
}

const APP_ORIGIN = "https://app.example.test";
const TEST_SECRET = "payment-suite-secret";
const runId = randomUUID().slice(0, 8);

const provider = new StandInProvider({ appBaseUrl: APP_ORIGIN, secret: TEST_SECRET });

let publishedPackageCode: string | null = null;
async function getPackageCode() {
  if (publishedPackageCode) return publishedPackageCode;
  const found = await prisma.tryoutPackage.findFirst({ select: { code: true }, where: { status: "published" } });
  if (!found) throw new Error("The dev database needs a published tryout package (run pnpm db:seed).");
  publishedPackageCode = found.code;
  return found.code;
}

async function getReferral() {
  const profile = await prisma.affiliatorProfile.findFirst({
    select: { id: true, referralCode: true },
    where: { isActive: true },
  });
  if (!profile) throw new Error("The dev database needs an active affiliator profile (run pnpm db:seed).");
  return profile;
}

let buyerCount = 0;
async function makeBuyer(label = "buyer") {
  buyerCount += 1;
  const user = await prisma.user.create({
    data: {
      email: `pay-${label}-${buyerCount}-${runId}@vecalss.local`,
      fullName: `Payment ${label}`,
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: [{ role: "student" }] },
    },
    select: { id: true },
  });
  return user.id;
}

/** A different address for every order, so the per-IP hourly limit never trips on fixtures. */
function randomBuyerIp() {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

type MakeOrderOptions = {
  amountRupiah?: number;
  buyerId?: string;
  /** Insert an order that is already past its time to pay, as if created 20 minutes ago. */
  pastExpiry?: boolean;
  referral?: boolean;
  session?: boolean;
};

async function makeIntent(buyerId: string, amountRupiah: number, referralCode: string | null) {
  return prisma.checkoutIntent.create({
    data: {
      amountRupiah,
      buyerId,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      idempotencyKey: randomUUID(),
      plan: "monthly",
      pricingMonth: "2026-11",
      referralCode,
    },
    select: { amountRupiah: true, id: true, plan: true, pricingMonth: true, referralCode: true },
  });
}

/** An order for a fresh buyer, optionally with its provider session already created. */
async function makeOrder(options: MakeOrderOptions = {}) {
  const buyerId = options.buyerId ?? (await makeBuyer());
  const packageCode = await getPackageCode();
  const referral = options.referral ? await getReferral() : null;
  const intent = await makeIntent(buyerId, options.amountRupiah ?? 49_000, referral?.referralCode ?? null);

  if (options.pastExpiry) {
    const reference = randomUUID().replaceAll("-", "");
    const packageName = (await prisma.tryoutPackage.findFirstOrThrow({ select: { title: true }, where: { code: packageCode } })).title;
    await prisma.$executeRaw`
      INSERT INTO payment_orders (
        intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name,
        amount_rupiah, currency, referral_code, affiliator_profile_id, buyer_ip_source, buyer_ip_exemption,
        provider, provider_environment, provider_account, created_at, expires_at
      ) VALUES (
        ${intent.id}::uuid, ${buyerId}::uuid, ${reference}, 'monthly', '2026-11', ${packageCode}, ${packageName},
        ${intent.amountRupiah}, 'IDR', ${intent.referralCode}, ${referral?.id ?? null}::uuid, 'unavailable', 'test-fixture',
        ${provider.id}, ${provider.environment}, ${provider.merchantAccount},
        now() - interval '20 minutes', now() - interval '5 minutes'
      )
    `;
    let order = await prisma.paymentOrder.findUniqueOrThrow({ where: { intentId: intent.id } });
    if (options.session) {
      // The provider took the payment while the order was still open.
      await prisma.$executeRaw`
        INSERT INTO stand_in_payments (reference, provider_payment_id, amount_rupiah, currency, metadata, expires_at)
        VALUES (${order.reference}, ${`sip_${randomUUID().replaceAll("-", "").slice(0, 20)}`}, ${order.amountRupiah}, 'IDR',
                ${JSON.stringify({ buyerId, packageCode })}::jsonb, now() - interval '5 minutes')
      `;
      const payment = await prisma.standInPayment.findUniqueOrThrow({ where: { reference: order.reference } });
      await prisma.$executeRaw`
        UPDATE payment_orders SET provider_reference = ${payment.providerPaymentId},
          session_url = ${`${APP_ORIGIN}/pay/stand-in/${order.reference}`}, updated_at = now()
        WHERE id = ${order.id}::uuid
      `;
      order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    }
    return order;
  }

  const created = await createOrderFromIntent({
    buyerId,
    buyerIp: randomBuyerIp(),
    buyerIpExemption: null,
    buyerIpSource: "trusted-proxy:1",
    intent,
    packageCode,
    provider,
  });
  if (!created.ok) throw new Error(`The order was not created (${created.reason}).`);
  if (options.session !== false) {
    const session = await ensurePaymentSession(created.order, provider, APP_ORIGIN);
    if (!session.ok) throw new Error("The session was not created.");
  }
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: created.order.id } });
}

type OrderLike = {
  amountRupiah: number;
  buyerId: string;
  currency: string;
  packageCode: string;
  providerReference: string | null;
  reference: string;
};

/** A correctly signed event for an order, with any field overridable to forge a variant. */
function signedEventFor(
  order: OrderLike,
  kind: PaymentEventKind,
  overrides: {
    account?: string;
    amountRupiah?: number;
    at?: Date;
    buyerId?: string;
    currency?: string;
    environment?: string;
    eventId?: string;
    packageCode?: string;
    providerPaymentId?: string;
    reference?: string;
  } = {},
) {
  return provider.buildSignedEvent(
    {
      amountRupiah: overrides.amountRupiah ?? order.amountRupiah,
      currency: overrides.currency ?? order.currency,
      metadata: {
        buyerId: overrides.buyerId ?? order.buyerId,
        packageCode: overrides.packageCode ?? order.packageCode,
      },
      providerPaymentId: overrides.providerPaymentId ?? order.providerReference ?? `sip_${randomUUID().slice(0, 12)}`,
      reference: overrides.reference ?? order.reference,
    },
    kind,
    overrides.at ?? new Date(),
    { account: overrides.account, environment: overrides.environment, eventId: overrides.eventId },
  );
}

function deliver(event: { body: Uint8Array; headers: Record<string, string> }, callerIp: string | null = null) {
  return receivePaymentEvent({
    adapter: provider,
    callerIp,
    headers: new Headers(event.headers),
    rawBody: event.body,
  });
}

/** Everything written for an order, for exact before/after comparisons. */
async function snapshotOf(orderId: string) {
  const [order, events, audits, outbox, purchases] = await Promise.all([
    prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } }),
    prisma.paymentEvent.count({ where: { orderId } }),
    prisma.auditLog.count({ where: { targetId: orderId } }),
    prisma.paymentOutbox.count({ where: { orderId } }),
    prisma.packagePurchase.count({ where: { providerReference: `order:${orderId}` } }),
  ]);
  return { audits, events, order, outbox, purchases };
}

/**
 * Closes the unpaid orders this run's buyers left behind, through the real
 * inbox, so a suite does not pile up open orders for the reconciliation suite
 * (which only looks at the oldest few hundred). Only this run's buyers.
 */
async function failLeftoverOrders() {
  const leftovers = await prisma.paymentOrder.findMany({
    where: { buyer: { email: { endsWith: `-${runId}@vecalss.local`, startsWith: "pay-" } }, status: "pending" },
  });
  for (const order of leftovers) await deliver(signedEventFor(order, "payment.failed"));
  return leftovers.length;
}

const expectedAdapterIdentity = { account: provider.merchantAccount, environment: provider.environment };

export {
  APP_ORIGIN,
  TEST_SECRET,
  deliver,
  expectedAdapterIdentity,
  failLeftoverOrders,
  getPackageCode,
  getReferral,
  makeBuyer,
  makeIntent,
  makeOrder,
  randomBuyerIp,
  prisma,
  provider,
  runId,
  signedEventFor,
  snapshotOf,
};
