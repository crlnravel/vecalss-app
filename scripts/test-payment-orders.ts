import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { PaymentProviderAdapter } from "../lib/payments/adapter";
import { PAYMENT_EXPIRY_MINUTES } from "../lib/payments/constants";
import { createOrderFromIntent, ensurePaymentSession } from "../lib/payments/orders";
import { STAND_IN_NO_PROXY_EXEMPTION } from "../lib/payments/risk/buyer-ip";
import { PURCHASE_TERMS } from "../lib/fulfillment/terms";
import { handleCheckoutPayPost, type CheckoutPayDeps } from "../lib/pricing/checkout-pay";
import type { SessionContext } from "../lib/auth/types";
import {
  APP_ORIGIN,
  deliver,
  getPackageCode,
  makeBuyer,
  makeOrder,
  prisma,
  provider,
  signedEventFor,
} from "./payment-test-kit";

/**
 * Orders and payment sessions: the quote snapshot, one order per intent, and
 * the remote idempotency that stops a lost response, a retry, a concurrent
 * request or an early callback from creating a second payable session.
 * Behavior test 4 (session part) against the stand-in provider.
 */

const standInCount = (reference: string) => prisma.standInPayment.count({ where: { reference } });

/** The stand-in with hooks around its calls, to cut a response off or count calls. */
function instrumented(hooks: {
  afterCreate?: () => never;
  beforeCreate?: () => never;
  statusFails?: boolean;
}) {
  const calls = { create: 0, status: 0 };
  const wrapped: PaymentProviderAdapter = {
    createSession: async (request) => {
      calls.create += 1;
      hooks.beforeCreate?.();
      const session = await provider.createSession(request);
      hooks.afterCreate?.();
      return session;
    },
    createRefund: (request) => provider.createRefund(request),
    environment: provider.environment,
    getRefundStatus: (reference) => provider.getRefundStatus(reference),
    getStatus: async (reference) => {
      calls.status += 1;
      if (hooks.statusFails) throw new Error("status lookup timed out");
      return provider.getStatus(reference);
    },
    id: provider.id,
    merchantAccount: provider.merchantAccount,
    verifyAndParseEvent: (input) => provider.verifyAndParseEvent(input),
  };
  return { calls, provider: wrapped };
}

const timeout = (): never => {
  throw new Error("The request timed out.");
};

async function main() {
  // ---- Order from an intent -----------------------------------------------
  {
    assert.equal(PAYMENT_EXPIRY_MINUTES, 15);
    const order = await makeOrder({ amountRupiah: 49_000, referral: true });
    assert.equal(order.amountRupiah, 49_000, "the amount is the intent's stored quote");
    assert.equal(order.currency, "IDR");
    assert.equal(order.plan, "monthly");
    assert.equal(order.pricingMonth, "2026-11");
    assert.equal(order.quoteVersion, 1);
    assert.ok(order.buyerIp, "the buyer address is recorded");
    assert.equal(order.buyerIpSource, "trusted-proxy:1");
    assert.equal(order.provider, "stand-in");
    assert.equal(order.providerAccount, provider.merchantAccount);
    assert.equal(order.status, "pending");
    assert.match(order.reference, /^[A-Za-z0-9_-]{43}$/u, "an opaque token, not the order id");
    assert.notEqual(order.reference, order.id);

    const [timing] = await prisma.$queryRaw<Array<{ minutes: number; sessionLinked: boolean }>>`
      SELECT extract(epoch FROM (expires_at - created_at)) / 60 AS minutes, session_url IS NOT NULL AS "sessionLinked"
      FROM payment_orders WHERE id = ${order.id}::uuid
    `;
    assert.equal(Number(timing.minutes), 15, "expiry is database time plus the single payment window");
    assert.equal(timing.sessionLinked, true);
    const [{ drift }] = await prisma.$queryRaw<Array<{ drift: number }>>`
      SELECT abs(extract(epoch FROM (created_at - now()))) AS drift FROM payment_orders WHERE id = ${order.id}::uuid
    `;
    assert.ok(Number(drift) < 30, "stored on the database clock");

    const created = await prisma.auditLog.findMany({ where: { action: "payment.order.created", targetId: order.id } });
    assert.equal(created.length, 1);
    assert.equal(created[0].ipAddress, order.buyerIp);

    // The stored order is still the quote after the catalogue moves on.
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).amountRupiah, 49_000);
  }

  // ---- One intent, at most one order ----------------------------------------
  {
    const buyerId = await makeBuyer();
    const packageCode = await getPackageCode();
    const intent = await prisma.checkoutIntent.create({
      data: {
        amountRupiah: 49_000,
        buyerId,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        idempotencyKey: randomUUID(),
        plan: "monthly",
        pricingMonth: "2026-11",
        termsVersion: "test-terms",
      },
    });
    const input = {
      buyerId,
      buyerIp: null,
      buyerIpExemption: STAND_IN_NO_PROXY_EXEMPTION,
      buyerIpSource: "unavailable",
      intent,
      packageCode,
      provider,
    };
    const results = await Promise.all(Array.from({ length: 8 }, () => createOrderFromIntent(input)));
    const orders = results.map((result) => (result.ok ? result.order : null));
    assert.ok(orders.every((order) => order?.id === orders[0]?.id), "every caller gets the same order");
    assert.equal(results.filter((result) => result.ok && result.created).length, 1, "only one caller creates it");
    assert.equal(await prisma.paymentOrder.count({ where: { intentId: intent.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.created", targetId: orders[0]?.id } }), 1);
    const stored = await prisma.paymentOrder.findUniqueOrThrow({ where: { intentId: intent.id } });
    assert.equal(stored.buyerIp, null);
    assert.equal(stored.buyerIpSource, "unavailable", "a missing address is recorded as missing, not invented");
    assert.equal(stored.buyerIpExemption, STAND_IN_NO_PROXY_EXEMPTION, "and the reason it was allowed is recorded");

    await assert.rejects(
      () => prisma.$executeRaw`
        INSERT INTO payment_orders (intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name,
          amount_rupiah, buyer_ip_source, buyer_ip_exemption, terms_version, provider, provider_environment, provider_account, expires_at)
        VALUES (${intent.id}::uuid, ${buyerId}::uuid, ${randomUUID()}, 'monthly', '2026-11', ${packageCode}, 'x',
          49000, 'unavailable', 'test-fixture', 'test-terms', 'stand-in', 'local', 'stand-in-local', now() + interval '15 minutes')`,
      /unique|intent_id/iu,
    );

    // A plan whose package is not published creates nothing.
    const other = await prisma.checkoutIntent.create({
      data: {
        amountRupiah: 49_000,
        buyerId,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        idempotencyKey: randomUUID(),
        plan: "monthly",
        pricingMonth: "2026-11",
        termsVersion: "test-terms",
      },
    });
    assert.deepEqual(
      await createOrderFromIntent({ ...input, intent: other, packageCode: "NO-SUCH-PACKAGE" }),
      { ok: false, reason: "package_unavailable" },
    );
    assert.equal(await prisma.paymentOrder.count({ where: { intentId: other.id } }), 0);
  }

  // ---- Lost session-creation response ------------------------------------------
  {
    // The provider accepts the request, then the answer is lost.
    const order = await makeOrder({ session: false });
    const lost = instrumented({ afterCreate: timeout });
    const recovered = await ensurePaymentSession(order, lost.provider, APP_ORIGIN);
    assert.equal(recovered.ok, true, "the payment is found by its reference");
    assert.equal(await standInCount(order.reference), 1);
    const linked = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(linked.providerReference && linked.sessionUrl);
    assert.equal(linked.sessionAttempts, 1);
    assert.equal(lost.calls.create, 1);
    assert.equal(lost.calls.status, 1, "an unknown outcome is resolved by a status lookup");

    // A later retry reuses the stored session without calling the provider.
    const again = instrumented({});
    const reused = await ensurePaymentSession(linked, again.provider, APP_ORIGIN);
    assert.deepEqual(reused, { checkoutUrl: linked.sessionUrl, ok: true });
    assert.deepEqual(again.calls, { create: 0, status: 0 });
  }
  {
    // The request never reached the provider: nothing exists, so the retry creates the one session.
    const order = await makeOrder({ session: false });
    const dropped = instrumented({ beforeCreate: timeout });
    assert.deepEqual(await ensurePaymentSession(order, dropped.provider, APP_ORIGIN), { ok: false, reason: "unavailable" });
    assert.equal(await standInCount(order.reference), 0);
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).sessionUrl, null);

    // Worse: the answer is lost and the status lookup is down too. Still no second payable session.
    const dark = instrumented({ afterCreate: timeout, statusFails: true });
    assert.deepEqual(await ensurePaymentSession(order, dark.provider, APP_ORIGIN), { ok: false, reason: "unavailable" });
    assert.equal(await standInCount(order.reference), 1);
    const healthy = await ensurePaymentSession(order, instrumented({}).provider, APP_ORIGIN);
    assert.equal(healthy.ok, true);
    assert.equal(await standInCount(order.reference), 1, "the same reference hands back the same payment");
    const final = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal((await provider.getStatus(order.reference)).found && (await provider.getStatus(order.reference) as { providerPaymentId: string }).providerPaymentId, final.providerReference);
    assert.equal(final.sessionAttempts, 3);
  }

  // ---- Concurrent requests --------------------------------------------------
  {
    const order = await makeOrder({ session: false });
    const results = await Promise.all(Array.from({ length: 8 }, () => ensurePaymentSession(order, provider, APP_ORIGIN)));
    assert.ok(results.every((result) => result.ok));
    const urls = new Set(results.map((result) => (result.ok ? result.checkoutUrl : "")));
    assert.equal(urls.size, 1, "everyone is sent to the same payment page");
    assert.equal(await standInCount(order.reference), 1);
  }

  // ---- Early callback, before the session is linked ------------------------------
  {
    const order = await makeOrder({ session: false });
    // The provider has the payment and reports it paid before our link is saved.
    const session = await provider.createSession({
      amountRupiah: order.amountRupiah,
      currency: "IDR",
      expiresAt: order.expiresAt,
      merchantReference: order.reference,
      metadata: { buyerId: order.buyerId, packageCode: order.packageCode },
      returnUrl: `${APP_ORIGIN}/x`,
    });
    const early = await deliver(signedEventFor(order, "payment.succeeded", { providerPaymentId: session.providerPaymentId }));
    assert.equal(early.status === "received" && early.result.status === "processed" && early.result.outcome, "accepted");
    const paid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(paid.status, "paid");
    assert.equal(paid.providerReference, session.providerPaymentId, "linked from the event");
    assert.equal(paid.sessionUrl, null);

    // The slow request then finishes: no new session for a paid order.
    const spy = instrumented({});
    assert.deepEqual(await ensurePaymentSession(order, spy.provider, APP_ORIGIN), { ok: false, reason: "closed" });
    assert.deepEqual(spy.calls, { create: 0, status: 0 });
    assert.equal(await standInCount(order.reference), 1);
  }

  // ---- No session for an order that cannot be paid ----------------------------------
  {
    const late = await makeOrder({ pastExpiry: true, session: false });
    const spy = instrumented({});
    assert.deepEqual(await ensurePaymentSession(late, spy.provider, APP_ORIGIN), { ok: false, reason: "closed" });
    assert.deepEqual(spy.calls, { create: 0, status: 0 }, "past its time, the provider is not even asked");
    assert.equal(await standInCount(late.reference), 0);

    const failed = await makeOrder({ session: false });
    await deliver(signedEventFor(failed, "payment.failed", { providerPaymentId: `sip_${randomUUID().slice(0, 12)}` }));
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: failed.id } })).status, "failed");
    assert.deepEqual(await ensurePaymentSession(failed, spy.provider, APP_ORIGIN), { ok: false, reason: "closed" });
  }

  // ---- Through the checkout handler, with the stand-in itself ------------------------------
  {
    const buyerId = await makeBuyer();
    const packageCode = await getPackageCode();
    const env = {
      APP_BASE_URL: APP_ORIGIN,
      // The suite only runs on the local database, which is what lets the stand-in run without a proxy.
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: "test",
      PRICING_PACKAGE_CODE_FULL_MANDIRI: packageCode,
      PRICING_PACKAGE_CODE_FULL_UTBK: packageCode,
      PRICING_PACKAGE_CODE_MONTHLY: packageCode,
    } as unknown as NodeJS.ProcessEnv;
    const session: SessionContext = {
      expiresAt: new Date(Date.now() + 3_600_000),
      sessionId: "session-orders",
      user: {
        email: "orders@example.test",
        fullName: "Orders",
        id: buyerId,
        mustChangePassword: false,
        onboardingStatus: null,
        roles: ["student"],
        status: "active",
      },
    };
    const deps: CheckoutPayDeps = {
      env,
      getProvider: () => provider,
      getSession: async () => session,
      now: () => new Date("2026-11-20T10:00:00+07:00"),
    };
    const key = randomUUID();
    const submit = () =>
      handleCheckoutPayPost(
        new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
          body: new URLSearchParams({ key, plan: "monthly", terms: PURCHASE_TERMS.version }).toString(),
          headers: { "content-type": "application/x-www-form-urlencoded", origin: APP_ORIGIN, "x-forwarded-for": "192.0.2.1" },
          method: "POST",
        }),
        deps,
      );

    const responses = await Promise.all([submit(), submit(), submit()]);
    const targets = new Set(responses.map((response) => response.headers.get("location")));
    assert.equal(targets.size, 1);
    const target = new URL([...targets][0] ?? "");
    assert.equal(target.origin, APP_ORIGIN);
    assert.match(target.pathname, /^\/pay\/stand-in\//u);
    assert.equal(target.search, "", "nothing editable in the payment link");

    const intent = await prisma.checkoutIntent.findFirstOrThrow({ where: { buyerId }, include: { order: true } });
    assert.ok(intent.order);
    assert.equal(await prisma.paymentOrder.count({ where: { buyerId } }), 1, "three clicks, one order");
    assert.equal(await standInCount(intent.order.reference), 1, "and one payable session");
    assert.equal(intent.order.buyerIp, null, "no trusted proxy configured: the forwarded header is not believed");
    assert.equal(intent.order.buyerIpSource, "unavailable");
    assert.equal(intent.order.buyerIpExemption, STAND_IN_NO_PROXY_EXEMPTION);

    // Behind a trusted proxy the address is taken from the right place and its source recorded.
    const proxiedBuyerId = await makeBuyer();
    const proxied = {
      ...deps,
      env: { ...env, TRUSTED_PROXY_COUNT: "1" } as NodeJS.ProcessEnv,
      getSession: async () => ({ ...session, user: { ...session.user, id: proxiedBuyerId } }),
    };
    const secondKey = randomUUID();
    const proxiedResponse = await handleCheckoutPayPost(
      new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
        body: new URLSearchParams({ key: secondKey, plan: "monthly", terms: PURCHASE_TERMS.version }).toString(),
        headers: { "content-type": "application/x-www-form-urlencoded", origin: APP_ORIGIN, "x-forwarded-for": "10.9.9.9, 192.0.2.55" },
        method: "POST",
      }),
      proxied,
    );
    assert.equal(proxiedResponse.status, 303);
    const proxiedOrder = await prisma.paymentOrder.findFirstOrThrow({
      where: { intent: { buyerId: proxiedBuyerId, idempotencyKey: secondKey } },
    });
    assert.equal(proxiedOrder.buyerIp, "192.0.2.55");
    assert.equal(proxiedOrder.buyerIpSource, "trusted-proxy:1");
    assert.equal(proxiedOrder.buyerIpExemption, null, "an address was found, so no exemption is needed");

    // Once the payment is final, the same form lands on the status page instead of a payment page.
    const order = intent.order;
    await prisma.$executeRaw`UPDATE stand_in_payments SET state = 'failed' WHERE reference = ${order.reference}`;
    const stored = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    await deliver(signedEventFor(stored, "payment.failed"));
    const closed = await submit();
    assert.equal(new URL(closed.headers.get("location") ?? "").pathname, `/pricing/checkout/status/${order.reference}`);
  }

  console.log("Payment order and session checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
