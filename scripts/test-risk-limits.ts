import assert from "node:assert/strict";
import { PURCHASE_TERMS } from "../lib/fulfillment/terms";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { RoleName } from "../generated/prisma/client";
import type { PaymentProviderAdapter } from "../lib/payments/adapter";
import { createOrderFromIntent, ensurePaymentSession } from "../lib/payments/orders";
import { reconcileOpenOrders } from "../lib/payments/reconcile";
import { resolveBuyerIpExemption, STAND_IN_NO_PROXY_EXEMPTION } from "../lib/payments/risk/buyer-ip";
import { isPolicyInForce, loadPolicyInForce } from "../lib/payments/risk/policy";
import type { RefusalReason } from "../lib/payments/risk/reserve";
import { handleCheckoutPayPost, type CheckoutPayDeps } from "../lib/pricing/checkout-pay";
import type { SessionContext } from "../lib/auth/types";
import {
  APP_ORIGIN,
  deliver,
  getPackageCode,
  makeBuyer,
  prisma,
  provider,
  randomBuyerIp,
  signedEventFor,
} from "./payment-test-kit";

/**
 * Commerce behavior test 2 (MS-06 phase A): the versioned policy, the account
 * tier, reservations under row locks, the attempt limits, the missing-IP rule
 * and the Asia/Jakarta day. Everything is counted in Postgres. The suite only
 * runs on the local database (payment-test-kit refuses anything else).
 *
 * Two kinds of test-only fixtures are used, both plain SQL on the disposable
 * local database: users.created_at is moved back to make an account old, and a
 * reservation is inserted on yesterday's day to stand in for "yesterday's
 * purchase" (the database clock cannot be moved). Policy versions made here are
 * appended like any other; the suite puts version 1 back in force when it ends.
 */

type PolicyShape = {
  maxOpenPayments: number;
  maxStartsPerIpHour: number;
  maxUnpaidPerAccountHour: number;
  unverifiedDailyPurchases: number;
  unverifiedDailyRupiah: number;
  verifiedDailyPurchases: number;
  verifiedDailyRupiah: number;
  verifiedMinAccountAgeDays: number;
};

const V1: PolicyShape = {
  maxOpenPayments: 1,
  maxStartsPerIpHour: 20,
  maxUnpaidPerAccountHour: 5,
  unverifiedDailyPurchases: 1,
  unverifiedDailyRupiah: 250_000,
  verifiedDailyPurchases: 2,
  verifiedDailyRupiah: 500_000,
  verifiedMinAccountAgeDays: 7,
};

/** Wide enough that only the limit under test can refuse. */
const ROOMY: PolicyShape = {
  maxOpenPayments: 50,
  maxStartsPerIpHour: 1000,
  maxUnpaidPerAccountHour: 50,
  unverifiedDailyPurchases: 50,
  unverifiedDailyRupiah: 50_000_000,
  verifiedDailyPurchases: 50,
  verifiedDailyRupiah: 50_000_000,
  verifiedMinAccountAgeDays: 7,
};

const QUOTES = {
  fullNov: { amount: 200_000, month: "2026-11", plan: "full" },
  fullDec: { amount: 250_000, month: "2026-12", plan: "full" },
  monthlyDec: { amount: 59_000, month: "2026-12", plan: "monthly" },
  monthlyNov: { amount: 49_000, month: "2026-11", plan: "monthly" },
} as const;

type StartOptions = {
  amount?: number;
  exemption?: string | null;
  /** `undefined` picks a fresh address; `null` is a request with no trusted address. */
  ip?: string | null;
  month?: string;
  plan?: string;
  provider?: PaymentProviderAdapter;
};

const stubProvider: PaymentProviderAdapter = {
  createSession: async (request) => ({
    checkoutUrl: `https://pay.example.test/stub/${request.merchantReference}`,
    providerPaymentId: `stub-${request.merchantReference}`,
  }),
  createRefund: async () => ({ outcome: "rejected" as const, reason: "stub" }),
  environment: "test",
  getRefundStatus: async () => ({ found: false }),
  getStatus: async () => ({ found: false }),
  id: "stub",
  merchantAccount: "stub-account",
  verifyAndParseEvent: () => ({ ok: false, reason: "bad_signature" }),
};

async function makeIntent(buyerId: string, options: StartOptions = {}) {
  return prisma.checkoutIntent.create({
    data: {
      amountRupiah: options.amount ?? QUOTES.monthlyNov.amount,
      buyerId,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      idempotencyKey: randomUUID(),
      plan: options.plan ?? QUOTES.monthlyNov.plan,
      pricingMonth: options.month ?? QUOTES.monthlyNov.month,
      termsVersion: "test-terms",
    },
  });
}

async function startWith(buyerId: string, intent: Awaited<ReturnType<typeof makeIntent>>, options: StartOptions = {}) {
  const ip = options.ip === undefined ? randomBuyerIp() : options.ip;
  return createOrderFromIntent({
    buyerId,
    buyerIp: ip,
    buyerIpExemption: options.exemption ?? null,
    buyerIpSource: ip ? "trusted-proxy:1" : "unavailable",
    intent,
    packageCode: await getPackageCode(),
    provider: options.provider ?? provider,
  });
}

async function start(buyerId: string, options: StartOptions = {}) {
  return startWith(buyerId, await makeIntent(buyerId, options), options);
}

/** A checkout that must be accepted, with its payment session in place. */
async function open(buyerId: string, options: StartOptions = {}) {
  const result = await start(buyerId, options);
  assert.ok(result.ok, `expected the checkout to be accepted, got ${result.ok ? "" : result.reason}`);
  const session = await ensurePaymentSession(result.order, options.provider ?? provider, APP_ORIGIN);
  assert.ok(session.ok);
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: result.order.id } });
}

function refusedWith(result: Awaited<ReturnType<typeof start>>, reason: RefusalReason, label: string) {
  assert.deepEqual(result, { ok: false, reason }, label);
}

const reservationOf = (orderId: string) => prisma.riskReservation.findUniqueOrThrow({ where: { orderId } });

/** The buyer's counted exposure today (Asia/Jakarta, database time), straight from the bucket row. */
async function bucketToday(userId: string) {
  const [row] = await prisma.$queryRaw<Array<{ amount: number; count: number }>>`
    SELECT purchase_count AS count, amount_rupiah AS amount FROM risk_day_buckets
    WHERE user_id = ${userId}::uuid AND bucket_date = risk_jakarta_day(clock_timestamp())
  `;
  return row ?? { amount: 0, count: 0 };
}

/** Everything a refused checkout might have left behind. */
async function footprint(buyerId: string) {
  const orders = await prisma.paymentOrder.findMany({ select: { id: true, reference: true }, where: { buyerId } });
  const [reservations, sessions, outbox] = await Promise.all([
    prisma.riskReservation.count({ where: { userId: buyerId } }),
    prisma.standInPayment.count({ where: { reference: { in: orders.map((order) => order.reference) } } }),
    prisma.paymentOutbox.count({ where: { orderId: { in: orders.map((order) => order.id) } } }),
  ]);
  return { orders: orders.length, outbox, reservations, sessions };
}

/** A paid order, going through the real inbox. */
async function pay(order: { amountRupiah: number; buyerId: string; currency: string; packageCode: string; providerReference: string | null; reference: string }) {
  const outcome = await deliver(signedEventFor(order, "payment.succeeded"));
  assert.equal(outcome.status, "received");
}

async function insertPolicy(shape: PolicyShape) {
  const [{ version }] = await prisma.$queryRaw<Array<{ version: number }>>`
    SELECT coalesce(max(version), 0) + 1 AS version FROM risk_policy_versions
  `;
  const [created] = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO risk_policy_versions (
      version, unverified_daily_purchases, unverified_daily_rupiah, verified_daily_purchases, verified_daily_rupiah,
      verified_min_account_age_days, max_open_payments, max_unpaid_per_account_hour, max_starts_per_ip_hour, note
    ) VALUES (
      ${version}, ${shape.unverifiedDailyPurchases}, ${shape.unverifiedDailyRupiah}, ${shape.verifiedDailyPurchases},
      ${shape.verifiedDailyRupiah}, ${shape.verifiedMinAccountAgeDays}, ${shape.maxOpenPayments},
      ${shape.maxUnpaidPerAccountHour}, ${shape.maxStartsPerIpHour}, 'test-risk-limits'
    ) RETURNING id
  `;
  return { id: created.id, version: Number(version) };
}

async function activate(policyId: string | null, reason: string) {
  await prisma.$executeRaw`
    INSERT INTO risk_policy_activations (policy_version_id, reason) VALUES (${policyId}::uuid, ${reason})
  `;
}

/** Makes a policy with these values the one in force and returns its version number. */
async function putInForce(shape: PolicyShape, reason = "test-risk-limits") {
  const policy = await insertPolicy(shape);
  await activate(policy.id, reason);
  return policy.version;
}

async function makeOldBuyer(days = 8) {
  const buyerId = await makeBuyer("old");
  await prisma.$executeRaw`
    UPDATE users SET created_at = now() - make_interval(days => ${days}::int) WHERE id = ${buyerId}::uuid
  `;
  return buyerId;
}

/**
 * A purchase on a chosen Asia/Jakarta day, as if it happened then: a paid order
 * (written directly, in the past) and its reservation on that day.
 */
async function insertPastPurchase(buyerId: string, dayOffset: number, state: "paid" | "pending" = "paid") {
  const packageCode = await getPackageCode();
  const intent = await makeIntent(buyerId);
  const reference = randomUUID().replaceAll("-", "");
  const status = state === "paid" ? "paid" : "pending";
  let purchaseId: string | null = null;
  if (state === "paid") {
    const [purchase] = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO package_purchases (student_id, package_code, package_name, status, provider_reference, completed_at, provenance)
      VALUES (${buyerId}::uuid, ${packageCode}, 'fixture', 'succeeded', ${`order:fixture-${reference}`}, now(), 'order')
      RETURNING id
    `;
    purchaseId = purchase.id;
  }
  const [order] = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO payment_orders (
      intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name, amount_rupiah,
      buyer_ip_source, buyer_ip_exemption, terms_version, provider, provider_environment, provider_account,
      status, paid_at, package_purchase_id, created_at, expires_at
    ) VALUES (
      ${intent.id}::uuid, ${buyerId}::uuid, ${reference}, 'monthly', '2026-11', ${packageCode}, 'fixture', 49000,
      'unavailable', 'test-fixture', 'test-terms', ${provider.id}, ${provider.environment}, ${provider.merchantAccount},
      ${status}::payment_order_status, ${state === "paid" ? new Date() : null}, ${purchaseId}::uuid,
      now() - interval '30 hours', now() - interval '29 hours'
    ) RETURNING id
  `;
  await prisma.$executeRaw`
    INSERT INTO risk_reservations (order_id, user_id, bucket_date, amount_rupiah, tier, policy_version, state)
    VALUES (
      ${order.id}::uuid, ${buyerId}::uuid, risk_jakarta_day(clock_timestamp()) + ${dayOffset}::int, 49000,
      'unverified', 1, ${state}::risk_reservation_state
    )
  `;
  return order.id;
}

async function expectDatabaseRefusal(run: () => Promise<unknown>, message: RegExp, label: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.match(String(error), message, label);
    return true;
  });
}

async function main() {
  const original = await loadPolicyInForce(prisma);
  assert.ok(original, "the migration puts a policy in force");
  const [{ id: v1Id }] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM risk_policy_versions WHERE version = 1`;
  const buyers: string[] = [];
  const track = (id: string) => {
    buyers.push(id);
    return id;
  };

  try {
    // Start from version 1 whatever the last run left in force.
    await activate(v1Id, "test-risk-limits: start from version 1");

    // ---- 1. The policy: version 1 holds the ticket's values, and is append-only ----------
    {
      const policy = await loadPolicyInForce(prisma);
      assert.ok(policy);
      assert.equal(policy.version, 1);
      assert.deepEqual(
        {
          maxOpenPayments: policy.maxOpenPayments,
          maxStartsPerIpHour: policy.maxStartsPerIpHour,
          maxUnpaidPerAccountHour: policy.maxUnpaidPerAccountHour,
          unverifiedDailyPurchases: policy.unverifiedDailyPurchases,
          unverifiedDailyRupiah: policy.unverifiedDailyRupiah,
          verifiedDailyPurchases: policy.verifiedDailyPurchases,
          verifiedDailyRupiah: policy.verifiedDailyRupiah,
          verifiedMinAccountAgeDays: policy.verifiedMinAccountAgeDays,
        },
        V1,
      );

      await expectDatabaseRefusal(
        () => prisma.$executeRaw`UPDATE risk_policy_versions SET unverified_daily_rupiah = 1 WHERE version = 1`,
        /append-only/u,
        "a policy version is never edited",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`DELETE FROM risk_policy_versions WHERE version = 1`,
        /append-only/u,
        "a policy version is never deleted",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`UPDATE risk_policy_activations SET reason = 'x'`,
        /append-only/u,
        "an activation is never edited",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`TRUNCATE risk_policy_activations`,
        /append-only/u,
        "the history is never truncated",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`
          INSERT INTO risk_policy_versions (
            version, unverified_daily_purchases, unverified_daily_rupiah, verified_daily_purchases, verified_daily_rupiah,
            verified_min_account_age_days, max_open_payments, max_unpaid_per_account_hour, max_starts_per_ip_hour, note
          ) VALUES (99999, 0, 1, 1, 1, 1, 1, 1, 1, 'zero is not a limit')`,
        /risk_policy_versions_values_check/u,
        "a version with a zero limit is refused",
      );
    }

    // ---- 2. Tier: new, verified, and what verified needs -----------------------------------
    {
      const young = track(await makeBuyer("young"));
      const first = await open(young);
      assert.equal((await reservationOf(first.id)).tier, "unverified");
      const youngTier = await prisma.riskAccountTier.findUniqueOrThrow({ where: { userId: young } });
      assert.equal(youngTier.tier, "unverified");
      assert.deepEqual(
        { ...(youngTier.basis as Record<string, unknown>), accountAgeDays: 0 },
        { accountAgeDays: 0, minAccountAgeDays: 7, policyVersion: 1, qualifyingOrderId: null },
        "the tier records what it was based on",
      );

      // Paid, but the account is under 7 days: still unverified.
      await pay(first);
      const second = await start(young);
      refusedWith(second, "daily_limit", "a young account stays within the new-account day");
      assert.equal((await prisma.riskAccountTier.findUniqueOrThrow({ where: { userId: young } })).tier, "unverified");

      // Old enough but nothing paid: unverified.
      const oldUnpaid = track(await makeOldBuyer());
      const unpaid = await open(oldUnpaid);
      assert.equal((await reservationOf(unpaid.id)).tier, "unverified", "age alone does not verify an account");

      // Old enough with a paid order: verified. Registered is not verified.
      const oldPaid = track(await makeOldBuyer());
      const firstPurchase = await open(oldPaid);
      await pay(firstPurchase);
      const verifiedOrder = await open(oldPaid);
      assert.equal((await reservationOf(verifiedOrder.id)).tier, "verified");
      const verifiedTier = await prisma.riskAccountTier.findUniqueOrThrow({ where: { userId: oldPaid } });
      assert.equal(verifiedTier.tier, "verified");
      assert.equal((verifiedTier.basis as { qualifyingOrderId: string }).qualifyingOrderId, firstPurchase.id);
      assert.ok((verifiedTier.basis as { accountAgeDays: number }).accountAgeDays >= 7);
      assert.equal(
        await prisma.auditLog.count({ where: { action: "risk.tier.changed", targetId: oldPaid } }),
        1,
        "becoming verified is audited once",
      );

      // A verified account gets 2 purchases a day: the third is refused. The first paid
      // order was today, so today already holds one completed and one open purchase.
      const third = await start(oldPaid, { ip: randomBuyerIp() });
      refusedWith(third, "open_payment", "one open payment at a time comes first");
      await deliver(signedEventFor(verifiedOrder, "payment.failed"));
      assert.equal((await reservationOf(verifiedOrder.id)).state, "released");
      const replacement = await open(oldPaid);
      await pay(replacement);
      refusedWith(await start(oldPaid), "daily_limit", "verified: 2 purchases a day, then blocked");
      assert.equal((await bucketToday(oldPaid)).count, 2);
    }

    // ---- 3. Concurrent last slot and last rupiah: exactly the allowed number win -------------
    {
      await putInForce({ ...ROOMY, unverifiedDailyPurchases: 3 });
      const slotBuyer = track(await makeBuyer("slots"));
      const results = await Promise.all(Array.from({ length: 8 }, () => start(slotBuyer)));
      assert.equal(results.filter((result) => result.ok).length, 3, "exactly the 3 slots are taken");
      for (const result of results.filter((item) => !item.ok)) assert.deepEqual(result, { ok: false, reason: "daily_limit" });
      assert.deepEqual(await bucketToday(slotBuyer), { amount: 3 * 49_000, count: 3 });
      assert.equal(await prisma.riskReservation.count({ where: { userId: slotBuyer } }), 3);

      // Last rupiah: Rp249.000 fits five Rp49.000 orders and not a sixth.
      await putInForce({ ...ROOMY, unverifiedDailyRupiah: 249_000 });
      const rupiahBuyer = track(await makeBuyer("rupiah"));
      const rupiahResults = await Promise.all(Array.from({ length: 8 }, () => start(rupiahBuyer)));
      assert.equal(rupiahResults.filter((result) => result.ok).length, 5, "exactly the rupiah that fit are taken");
      assert.deepEqual(await bucketToday(rupiahBuyer), { amount: 5 * 49_000, count: 5 });

      // The last Rupiah exactly: Rp98.000 fits two orders and not a third.
      await putInForce({ ...ROOMY, unverifiedDailyRupiah: 98_000 });
      const exact = track(await makeBuyer("exact"));
      const exactResults = await Promise.all(Array.from({ length: 4 }, () => start(exact)));
      assert.equal(exactResults.filter((result) => result.ok).length, 2);
      assert.deepEqual(await bucketToday(exact), { amount: 98_000, count: 2 });

      // The open-payment and hourly limits are as atomic as the daily one.
      await putInForce({ ...ROOMY, maxOpenPayments: 2 });
      const openBuyer = track(await makeBuyer("open-race"));
      const openResults = await Promise.all(Array.from({ length: 8 }, () => start(openBuyer)));
      assert.equal(openResults.filter((result) => result.ok).length, 2, "exactly 2 open payments");
      await putInForce({ ...ROOMY, maxOpenPayments: 50, maxUnpaidPerAccountHour: 3 });
      const hourBuyer = track(await makeBuyer("hour-race"));
      const hourResults = await Promise.all(Array.from({ length: 8 }, () => start(hourBuyer)));
      assert.equal(hourResults.filter((result) => result.ok).length, 3, "exactly 3 unpaid checkouts in the hour");

      // Different accounts do not wait on each other or share a bucket.
      const others = await Promise.all(Array.from({ length: 4 }, async () => track(await makeBuyer("other"))));
      const together = await Promise.all(others.map((id) => start(id)));
      assert.equal(together.filter((result) => result.ok).length, 4);
    }

    // ---- 4. Duplicate intents: one order, one reservation ---------------------------------
    {
      await activate(v1Id, "test-risk-limits: version 1");
      const buyer = track(await makeBuyer("dup"));
      const intent = await makeIntent(buyer);
      const results = await Promise.all(Array.from({ length: 8 }, () => startWith(buyer, intent)));
      assert.ok(results.every((result) => result.ok), "every retry is answered, none is refused as a second purchase");
      const orderIds = new Set(results.map((result) => (result.ok ? result.order.id : "")));
      assert.equal(orderIds.size, 1);
      assert.equal(results.filter((result) => result.ok && result.created).length, 1);
      assert.equal(await prisma.riskReservation.count({ where: { userId: buyer } }), 1);
      assert.deepEqual(await bucketToday(buyer), { amount: 49_000, count: 1 });

      // And again later, with the open payment and the day's single slot already used.
      const again = await startWith(buyer, intent);
      assert.ok(again.ok && !again.created);
      assert.deepEqual(await bucketToday(buyer), { amount: 49_000, count: 1 });
    }

    // ---- 5. A refused checkout leaves nothing payable, and is audited ---------------------------
    {
      const buyer = track(await makeBuyer("refused"));
      await open(buyer);
      const before = await footprint(buyer);
      const ip = "198.51.100.77";
      const intent = await makeIntent(buyer);
      const refused = await startWith(buyer, intent, { ip });
      refusedWith(refused, "open_payment", "a second open payment is refused");
      assert.deepEqual(await footprint(buyer), before, "no order, reservation, payment session or job");
      assert.equal(await prisma.paymentOrder.count({ where: { intentId: intent.id } }), 0);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { action: "payment.checkout.refused", targetId: intent.id },
      });
      assert.equal(audit.ipAddress, ip, "the address already kept with orders");
      assert.equal(audit.actorUserId, buyer);
      const metadata = audit.metadata as Record<string, unknown>;
      assert.equal(metadata.reason, "open_payment");
      assert.equal(metadata.policyVersion, 1);
      assert.equal(metadata.tier, "unverified");
      const text = JSON.stringify(metadata);
      assert.doesNotMatch(text, /@|vecalss\.local|passwordHash/u, "no email or other buyer detail is copied into the audit trail");
    }

    // ---- 6. Failed and expired attempts release; the day is usable again --------------------------
    {
      for (const kind of ["payment.failed", "payment.expired"] as const) {
        const buyer = track(await makeBuyer(kind.split(".")[1]));
        const order = await open(buyer);
        assert.deepEqual(await bucketToday(buyer), { amount: 49_000, count: 1 });
        await deliver(signedEventFor(order, kind));
        const released = await reservationOf(order.id);
        assert.equal(released.state, "released");
        assert.deepEqual(await bucketToday(buyer), { amount: 0, count: 0 }, `${kind} frees the exposure`);

        // The single slot of a new account is available again, and a quiet event changes nothing twice.
        await deliver(signedEventFor(order, kind, { eventId: `repeat-${randomUUID()}` }));
        assert.deepEqual(await bucketToday(buyer), { amount: 0, count: 0 });
        const next = await open(buyer);
        assert.deepEqual(await bucketToday(buyer), { amount: 49_000, count: 1 });
        assert.equal((await reservationOf(next.id)).state, "pending");
      }

      // An order past its time is not released by our clock: it needs a confirmed answer.
      const waiting = track(await makeBuyer("waiting"));
      const order = await open(waiting);
      assert.equal((await reservationOf(order.id)).state, "pending");
      refusedWith(await start(waiting), "open_payment", "while the provider can still settle, nothing is freed");
    }

    // ---- 7. Late success lands in review and keeps its exposure -------------------------------------------
    {
      const buyer = track(await makeBuyer("late"));
      const first = await open(buyer);
      await deliver(signedEventFor(first, "payment.expired"));
      assert.equal((await reservationOf(first.id)).state, "released");
      const replacement = await open(buyer);
      assert.deepEqual(await bucketToday(buyer), { amount: 49_000, count: 1 });

      // The money turns up after the confirmed expiry: review, and the exposure is held again.
      const stored = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: first.id } });
      await deliver(signedEventFor(stored, "payment.succeeded", { providerPaymentId: stored.providerReference ?? undefined }));
      const reviewed = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: first.id } });
      assert.equal(reviewed.status, "review");
      const held = await reservationOf(first.id);
      assert.equal(held.state, "review");
      assert.equal(held.stateReason, "late_success_after_expired");
      assert.deepEqual(await bucketToday(buyer), { amount: 98_000, count: 2 }, "held again, even past the day's cap: the money exists");

      // Nothing later releases it.
      await deliver(signedEventFor(stored, "payment.expired", { eventId: `later-${randomUUID()}` }));
      await deliver(signedEventFor(stored, "payment.failed", { eventId: `later-${randomUUID()}` }));
      await deliver(signedEventFor(stored, "payment.succeeded", { eventId: `again-${randomUUID()}`, providerPaymentId: stored.providerReference ?? undefined }));
      assert.equal((await reservationOf(first.id)).state, "review");
      assert.deepEqual(await bucketToday(buyer), { amount: 98_000, count: 2 });
      refusedWith(await start(buyer), "open_payment", "still within the day");

      // The audit trail names the move.
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.order.review", targetId: first.id } });
      assert.equal((audit.metadata as { reservation: string }).reservation, "review");

      // A paid reservation is permanent: refunds will not appear here, and the database refuses to free it.
      await pay(replacement);
      assert.equal((await reservationOf(replacement.id)).state, "paid");
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`UPDATE risk_reservations SET state = 'released' WHERE order_id = ${replacement.id}::uuid`,
        /cannot move from paid to released/u,
        "a paid reservation cannot be freed",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`UPDATE risk_reservations SET state = 'pending' WHERE order_id = ${first.id}::uuid`,
        /cannot move from review to pending/u,
        "a held reservation cannot be reopened",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`UPDATE risk_reservations SET bucket_date = bucket_date - 1 WHERE order_id = ${first.id}::uuid`,
        /snapshot cannot be changed/u,
        "a reservation stays on its original day",
      );
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`DELETE FROM risk_reservations WHERE order_id = ${first.id}::uuid`,
        /never deleted/u,
        "a reservation is never deleted",
      );
    }

    // ---- 8. Policy version change -----------------------------------------------------------------------------
    {
      await activate(v1Id, "test-risk-limits: version 1");
      const buyer = track(await makeBuyer("policy"));
      const underV1 = await open(buyer);
      assert.equal((await reservationOf(underV1.id)).policyVersion, 1);

      // A new version with more room applies to the next checkout, and the old reservation stays on its own version.
      const generous = await putInForce({ ...V1, maxOpenPayments: 5, unverifiedDailyPurchases: 3, unverifiedDailyRupiah: 500_000 });
      const underGenerous = await open(buyer);
      assert.equal((await reservationOf(underGenerous.id)).policyVersion, generous);
      assert.equal((await reservationOf(underV1.id)).policyVersion, 1, "an existing reservation keeps the version it was taken under");

      // A stricter version counts what is already reserved, and never evicts it.
      await putInForce({ ...V1, maxOpenPayments: 5, unverifiedDailyPurchases: 2 });
      refusedWith(await start(buyer), "daily_limit", "the stricter limit sees the 2 already reserved");
      assert.deepEqual(await bucketToday(buyer), { amount: 98_000, count: 2 });
      assert.equal((await reservationOf(underV1.id)).state, "pending");

      // Going back to version 1 is a new activation, not an edit.
      await activate(v1Id, "test-risk-limits: back to version 1");
      assert.equal((await loadPolicyInForce(prisma))?.version, 1);
      assert.equal((await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM risk_policy_versions WHERE version = 1`)[0].n, 1);
    }

    // ---- 9. No policy: new checkouts stop, everything else keeps running -----------------------------------------------------
    {
      await activate(v1Id, "test-risk-limits: version 1");
      const buyer = track(await makeBuyer("nopolicy"));
      const pending = await open(buyer);
      const other = track(await makeBuyer("nopolicy-other"));
      const releasable = await open(other);
      const lateOne = track(await makeBuyer("nopolicy-late"));
      const lateOrder = await open(lateOne);
      await deliver(signedEventFor(lateOrder, "payment.expired"));

      await activate(null, "test-risk-limits: withdrawn");
      assert.equal(await loadPolicyInForce(prisma), null);
      assert.equal(await isPolicyInForce(), false);

      const stranger = track(await makeBuyer("nopolicy-new"));
      const intent = await makeIntent(stranger);
      refusedWith(await startWith(stranger, intent), "no_policy", "a new checkout is refused");
      assert.deepEqual(await footprint(stranger), { orders: 0, outbox: 0, reservations: 0, sessions: 0 });
      assert.equal(await prisma.auditLog.count({ where: { action: "payment.checkout.refused", targetId: intent.id } }), 1);
      // A retry of an intent that already has an order still finds it.
      const known = await createOrderFromIntent({
        buyerId: buyer,
        buyerIp: null,
        buyerIpExemption: null,
        buyerIpSource: "unavailable",
        intent: await prisma.checkoutIntent.findUniqueOrThrow({ where: { id: pending.intentId } }),
        packageCode: pending.packageCode,
        provider,
      });
      assert.ok(known.ok && !known.created && known.order.id === pending.id);

      // Ingestion, reconciliation and the outbox run without a policy.
      await pay(pending);
      assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: pending.id } })).status, "paid");
      assert.equal((await reservationOf(pending.id)).state, "paid");
      await deliver(signedEventFor(releasable, "payment.failed"));
      assert.equal((await reservationOf(releasable.id)).state, "released");
      const stored = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: lateOrder.id } });
      await deliver(signedEventFor(stored, "payment.succeeded", { providerPaymentId: stored.providerReference ?? undefined }));
      assert.equal((await reservationOf(lateOrder.id)).state, "review");
      await reconcileOpenOrders(provider);

      // Through the form: back to the checkout page, with nothing created.
      const response = await postThroughHandler(stranger);
      assert.equal(new URL(response.headers.get("location") ?? "").pathname, "/pricing/checkout");
      assert.equal((await footprint(stranger)).orders, 0);

      await activate(v1Id, "test-risk-limits: version 1");
      assert.equal(await isPolicyInForce(), true);
    }

    // ---- 10. The Asia/Jakarta day, from database time ------------------------------------------------------------
    {
      const day = async (moment: string) =>
        (await prisma.$queryRaw<Array<{ day: string }>>`SELECT to_char(risk_jakarta_day(${moment}::timestamptz), 'YYYY-MM-DD') AS day`)[0].day;
      assert.equal(await day("2026-11-04 16:59:59.999+00"), "2026-11-04", "23:59:59.999 WIB is still the 4th");
      assert.equal(await day("2026-11-04 17:00:00+00"), "2026-11-05", "midnight WIB starts the 5th");
      assert.equal(await day("2026-11-05 00:00:00+07"), "2026-11-05");
      assert.equal(await day("2026-11-04 23:59:59.999+07"), "2026-11-04");
      assert.equal(await day("2026-11-04 20:00:00+00"), "2026-11-05", "the day is not the UTC date");
      assert.equal(await day("2026-12-31 17:00:00+00"), "2027-01-01", "across a year end");

      // A reservation is bucketed by the database's clock, not the application's.
      const buyer = track(await makeBuyer("today"));
      const order = await open(buyer);
      const [{ matches }] = await prisma.$queryRaw<Array<{ matches: boolean }>>`
        SELECT bucket_date IN (
          risk_jakarta_day(clock_timestamp() - interval '5 seconds'),
          risk_jakarta_day(clock_timestamp() + interval '5 seconds')
        ) AS matches FROM risk_reservations WHERE order_id = ${order.id}::uuid
      `;
      assert.equal(matches, true);

      // Yesterday's purchase does not count today, and no cron has to run for that.
      const yesterday = track(await makeBuyer("yesterday"));
      await insertPastPurchase(yesterday, -1);
      const [{ stillCounted }] = await prisma.$queryRaw<Array<{ stillCounted: number }>>`
        SELECT purchase_count AS "stillCounted" FROM risk_day_buckets
        WHERE user_id = ${yesterday}::uuid AND bucket_date = risk_jakarta_day(clock_timestamp()) - 1
      `;
      assert.equal(stillCounted, 1);
      const nextDay = await open(yesterday);
      assert.equal((await reservationOf(nextDay.id)).state, "pending", "eligible again the next local day");
      assert.deepEqual(await bucketToday(yesterday), { amount: 49_000, count: 1 });

      // The same purchase made today does block.
      const today = track(await makeBuyer("same-day"));
      await insertPastPurchase(today, 0);
      refusedWith(await start(today), "daily_limit", "the same purchase today blocks the day");

      // A reservation stays on its original day: paying or failing it later never moves it.
      const carried = track(await makeBuyer("carried"));
      const carriedOrderId = await insertPastPurchase(carried, -1, "pending");
      const carriedOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: carriedOrderId } });
      await deliver(signedEventFor(carriedOrder, "payment.failed"));
      assert.equal((await reservationOf(carriedOrderId)).state, "released");
      assert.deepEqual(await bucketToday(carried), { amount: 0, count: 0 }, "today is untouched by yesterday's release");
      const [{ yesterdayCount }] = await prisma.$queryRaw<Array<{ yesterdayCount: number }>>`
        SELECT purchase_count AS "yesterdayCount" FROM risk_day_buckets
        WHERE user_id = ${carried}::uuid AND bucket_date = risk_jakarta_day(clock_timestamp()) - 1
      `;
      assert.equal(yesterdayCount, 0, "released on its own day");
    }

    // ---- 11. Attempt limits: open payment, per account per hour, per IP per hour ------------------------------------------------
    {
      // One open unpaid payment, then free again once it ends.
      await activate(v1Id, "test-risk-limits: version 1");
      const solo = track(await makeBuyer("open"));
      const open1 = await open(solo);
      refusedWith(await start(solo), "open_payment", "a second open payment");
      await deliver(signedEventFor(open1, "payment.failed"));
      await open(solo);

      // 5 unpaid checkouts per account per hour; the 6th is refused whatever happened to the first five.
      await putInForce({ ...ROOMY, maxUnpaidPerAccountHour: 5, maxOpenPayments: 50 });
      const hourly = track(await makeBuyer("hourly"));
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const order = await open(hourly);
        await deliver(signedEventFor(order, "payment.failed"));
      }
      refusedWith(await start(hourly), "hourly_attempts", "the 6th unpaid checkout within the hour");
      assert.equal((await footprint(hourly)).orders, 5);
      // Fixtures older than an hour are outside the window, and a paid order is not an unpaid attempt.
      const rested = track(await makeBuyer("rested"));
      for (let attempt = 0; attempt < 5; attempt += 1) await insertOldOrder(rested, null, 3);
      await open(rested);

      // 20 checkout starts per IP per hour, across accounts: with the limit at 3, the 4th start is refused.
      await putInForce({ ...ROOMY, maxStartsPerIpHour: 3 });
      const ip = randomBuyerIp();
      const sharers = await Promise.all(Array.from({ length: 4 }, async () => track(await makeBuyer("shared-ip"))));
      for (const sharer of sharers.slice(0, 3)) {
        const order = await open(sharer, { ip });
        await deliver(signedEventFor(order, "payment.failed"));
      }
      const fourth = await start(sharers[3], { ip });
      refusedWith(fourth, "ip_attempts", "the 4th start from one address, even though the others failed");
      assert.deepEqual(await footprint(sharers[3]), { orders: 0, outbox: 0, reservations: 0, sessions: 0 });
      await open(sharers[3], { ip: randomBuyerIp() });
      // Starts older than an hour fall out of the window.
      const quietIp = randomBuyerIp();
      const quietBuyers = await Promise.all(Array.from({ length: 4 }, async () => track(await makeBuyer("old-ip"))));
      for (const quiet of quietBuyers.slice(0, 3)) await insertOldOrder(quiet, quietIp, 2);
      await open(quietBuyers[3], { ip: quietIp });

      // The real limit is 20 starts: 20 are accepted from one address and the 21st is not.
      await putInForce({ ...ROOMY, maxStartsPerIpHour: 20 });
      const crowdIp = randomBuyerIp();
      const crowd = await Promise.all(Array.from({ length: 21 }, async () => track(await makeBuyer("crowd"))));
      const crowdResults = [];
      for (const member of crowd) crowdResults.push(await start(member, { ip: crowdIp }));
      assert.equal(crowdResults.filter((result) => result.ok).length, 20);
      refusedWith(crowdResults[20], "ip_attempts", "the 21st start from one address");

      // Concurrent starts from one address cannot overshoot the limit.
      await putInForce({ ...ROOMY, maxStartsPerIpHour: 3 });
      const raceIp = randomBuyerIp();
      const racers = await Promise.all(Array.from({ length: 6 }, async () => track(await makeBuyer("race"))));
      const raced = await Promise.all(racers.map((racer) => start(racer, { ip: raceIp })));
      assert.equal(raced.filter((result) => result.ok).length, 3, "exactly the 3 starts the address is allowed");
    }

    // ---- 12. Per transaction: the amount must be the server's quote ---------------------------------------------------------------
    {
      await activate(v1Id, "test-risk-limits: version 1");
      for (const quote of Object.values(QUOTES)) {
        const buyer = track(await makeBuyer("quote"));
        const accepted = await open(buyer, { amount: quote.amount, month: quote.month, plan: quote.plan });
        assert.equal(accepted.amountRupiah, quote.amount);
        assert.equal((await reservationOf(accepted.id)).amountRupiah, quote.amount, "the reservation holds the quoted amount");
      }

      for (const [label, options] of [
        ["one rupiah off", { amount: QUOTES.monthlyNov.amount + 1 }],
        ["half price", { amount: QUOTES.monthlyNov.amount / 2 }],
        ["another month's price", { amount: QUOTES.monthlyDec.amount }],
        ["the full price for a monthly plan", { amount: QUOTES.fullNov.amount }],
        ["a month that is not on sale", { month: "2030-01" }],
        ["an unknown plan", { plan: "gold" }],
      ] as const) {
        const buyer = track(await makeBuyer("forged"));
        const intent = await makeIntent(buyer, options);
        refusedWith(await startWith(buyer, intent, options), "amount_mismatch", label);
        assert.deepEqual(await footprint(buyer), { orders: 0, outbox: 0, reservations: 0, sessions: 0 }, label);
        assert.equal(await prisma.auditLog.count({ where: { action: "payment.checkout.refused", targetId: intent.id } }), 1, label);
      }
    }

    // ---- 13. Missing buyer IP -----------------------------------------------------------------------------------------------------------------
    {
      // Production-like: no trusted address and no stand-in, so the checkout is refused.
      const prodLike = track(await makeBuyer("no-ip"));
      const intent = await makeIntent(prodLike);
      refusedWith(await startWith(prodLike, intent, { ip: null, provider: stubProvider }), "missing_ip", "refused without a buyer IP");
      assert.deepEqual(await footprint(prodLike), { orders: 0, outbox: 0, reservations: 0, sessions: 0 });
      // A caller cannot claim an exemption the environment does not grant: it comes from the provider and environment.
      const localUrl = process.env.DATABASE_URL;
      assert.equal(resolveBuyerIpExemption(provider, { DATABASE_URL: localUrl, NODE_ENV: "development" }), STAND_IN_NO_PROXY_EXEMPTION);
      assert.equal(resolveBuyerIpExemption(provider, { DATABASE_URL: localUrl, NODE_ENV: "production" }), null, "never in production");
      assert.equal(
        resolveBuyerIpExemption(provider, { DATABASE_URL: "postgresql://u:p@db.example.com:5432/x", NODE_ENV: "development" }),
        null,
        "never against a database that is not on this machine",
      );
      assert.equal(resolveBuyerIpExemption(stubProvider, { DATABASE_URL: localUrl, NODE_ENV: "development" }), null, "only the stand-in");

      // Stand-in on a local database: allowed, and the reason is recorded on the order.
      const standIn = track(await makeBuyer("stand-in"));
      const exempt = await open(standIn, { exemption: STAND_IN_NO_PROXY_EXEMPTION, ip: null });
      assert.equal(exempt.buyerIp, null);
      assert.equal(exempt.buyerIpExemption, STAND_IN_NO_PROXY_EXEMPTION);
      assert.equal(exempt.buyerIpSource, "unavailable");
      const created = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.order.created", targetId: exempt.id } });
      assert.equal((created.metadata as { buyerIpExemption: string }).buyerIpExemption, STAND_IN_NO_PROXY_EXEMPTION);
      // An order that has an address records no exemption, even when one was offered.
      const withIp = await open(track(await makeBuyer("has-ip")), { exemption: STAND_IN_NO_PROXY_EXEMPTION });
      assert.equal(withIp.buyerIpExemption, null);

      // The database says the same: a new order needs an address or a reason.
      const raw = track(await makeBuyer("raw"));
      const rawIntent = await makeIntent(raw);
      await expectDatabaseRefusal(
        () => prisma.$executeRaw`
          INSERT INTO payment_orders (intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name,
            amount_rupiah, buyer_ip_source, terms_version, provider, provider_environment, provider_account, expires_at)
          VALUES (${rawIntent.id}::uuid, ${raw}::uuid, ${randomUUID()}, 'monthly', '2026-11', 'X', 'x', 49000,
            'unavailable', 'test-terms', 'stand-in', 'local', 'stand-in-local', now() + interval '15 minutes')`,
        /needs a buyer IP or an exemption/u,
        "no address and no reason",
      );
    }

    // ---- 14. Redis is not involved: caps hold with it unreachable --------------------------------------------------------------------------------------
    {
      const previous = process.env.REDIS_URL;
      process.env.REDIS_URL = "redis://127.0.0.1:1";
      try {
        await activate(v1Id, "test-risk-limits: version 1");
        const buyer = track(await makeBuyer("no-redis"));
        await open(buyer);
        refusedWith(await start(buyer), "open_payment", "the open-payment cap still applies");
        const dayBuyer = track(await makeBuyer("no-redis-day"));
        const paid = await open(dayBuyer);
        await pay(paid);
        refusedWith(await start(dayBuyer), "daily_limit", "the daily cap still applies");
        const racers = track(await makeBuyer("no-redis-race"));
        const results = await Promise.all(Array.from({ length: 6 }, () => start(racers)));
        assert.equal(results.filter((result) => result.ok).length, 1, "and so does the last slot");
      } finally {
        if (previous === undefined) delete process.env.REDIS_URL;
        else process.env.REDIS_URL = previous;
      }

      // The limits code does not even name a cache: there is nothing that an outage could lift.
      const roots = ["lib/payments", "lib/pricing"];
      const sources: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (full.endsWith(".ts")) sources.push(full);
        }
      };
      for (const root of roots) walk(path.join(process.cwd(), root));
      assert.ok(sources.length > 5);
      for (const file of sources) assert.doesNotMatch(readFileSync(file, "utf8"), /redis|ioredis|bullmq/iu, file);
    }

    // ---- 15. Through the checkout form: the messages and what is written -------------------------------------------------------------------------------
    {
      await activate(v1Id, "test-risk-limits: version 1");
      const buyer = track(await makeBuyer("form"));
      const first = await postThroughHandler(buyer);
      assert.match(new URL(first.headers.get("location") ?? "").pathname, /^\/pay\/stand-in\//u, "a first purchase goes to the payment page");

      const openPayment = await postThroughHandler(buyer);
      assert.equal(new URL(openPayment.headers.get("location") ?? "").searchParams.get("notice"), "checkout-open-payment");

      const order = await prisma.paymentOrder.findFirstOrThrow({ where: { buyerId: buyer } });
      await pay(order);
      const dailyLimit = await postThroughHandler(buyer);
      assert.equal(new URL(dailyLimit.headers.get("location") ?? "").searchParams.get("notice"), "checkout-daily-limit");
      assert.equal(await prisma.paymentOrder.count({ where: { buyerId: buyer } }), 1, "refused attempts wrote no order");

      await putInForce({ ...ROOMY, maxStartsPerIpHour: 1 });
      const crowdIp = randomBuyerIp();
      const one = await postThroughHandler(track(await makeBuyer("form-ip")), { forwardedFor: crowdIp, trustedProxies: "1" });
      assert.match(new URL(one.headers.get("location") ?? "").pathname, /^\/pay\/stand-in\//u);
      const two = await postThroughHandler(track(await makeBuyer("form-ip")), { forwardedFor: crowdIp, trustedProxies: "1" });
      assert.equal(new URL(two.headers.get("location") ?? "").searchParams.get("notice"), "checkout-too-many");

      await activate(v1Id, "test-risk-limits: version 1");
      // With no trusted proxy and a non-stand-in provider, the form refuses with the plain unavailable notice.
      const noIp = track(await makeBuyer("form-no-ip"));
      const refused = await postThroughHandler(noIp, { provider: stubProvider });
      assert.equal(new URL(refused.headers.get("location") ?? "").searchParams.get("notice"), "checkout-unavailable");
      assert.equal((await footprint(noIp)).orders, 0);
    }

    // ---- 16. The counters always equal the reservations ---------------------------------------------------------------------------------------------
    {
      const mismatched = await prisma.$queryRaw<Array<{ userId: string }>>`
        SELECT b.user_id AS "userId"
        FROM risk_day_buckets b
        LEFT JOIN (
          SELECT user_id, bucket_date, count(*)::int AS n, sum(amount_rupiah)::int AS amount
          FROM risk_reservations WHERE state <> 'released' GROUP BY user_id, bucket_date
        ) r ON r.user_id = b.user_id AND r.bucket_date = b.bucket_date
        WHERE b.user_id = ANY(${buyers}::uuid[])
          AND (b.purchase_count <> coalesce(r.n, 0) OR b.amount_rupiah <> coalesce(r.amount, 0))
      `;
      assert.deepEqual(mismatched, [], "a day bucket is exactly the sum of its counted reservations");
    }

    console.log("Risk limit checks passed.");
  } finally {
    // Leave version 1 in force whatever happened above.
    await activate(v1Id, "test-risk-limits: restore version 1").catch(() => undefined);
  }
}

/** An order from the past, as a fixture for the hourly windows. */
async function insertOldOrder(buyerId: string, ip: string | null, hoursAgo: number) {
  const packageCode = await getPackageCode();
  const intent = await makeIntent(buyerId);
  await prisma.$executeRaw`
    INSERT INTO payment_orders (
      intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name, amount_rupiah,
      buyer_ip, buyer_ip_source, buyer_ip_exemption, status, terms_version, provider, provider_environment, provider_account,
      created_at, expires_at
    ) VALUES (
      ${intent.id}::uuid, ${buyerId}::uuid, ${randomUUID().replaceAll("-", "")}, 'monthly', '2026-11', ${packageCode},
      'fixture', 49000, ${ip}::inet, ${ip ? "trusted-proxy:1" : "unavailable"}, ${ip ? null : "test-fixture"}, 'pending',
      'test-terms', ${provider.id}, ${provider.environment}, ${provider.merchantAccount},
      now() - make_interval(hours => ${hoursAgo}::int), now() - make_interval(hours => ${hoursAgo}::int) + interval '15 minutes'
    )
  `;
}

/** The real checkout form handler, with the stand-in provider on the local database. */
async function postThroughHandler(
  buyerId: string,
  options: { forwardedFor?: string; provider?: PaymentProviderAdapter; trustedProxies?: string } = {},
) {
  const packageCode = await getPackageCode();
  const env = {
    APP_BASE_URL: APP_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    PRICING_PACKAGE_CODE_FULL_MANDIRI: packageCode,
    PRICING_PACKAGE_CODE_FULL_UTBK: packageCode,
    PRICING_PACKAGE_CODE_MONTHLY: packageCode,
    ...(options.trustedProxies ? { TRUSTED_PROXY_COUNT: options.trustedProxies } : {}),
  } as unknown as NodeJS.ProcessEnv;
  const session: SessionContext = {
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: `session-${buyerId}`,
    user: {
      email: `${buyerId}@example.test`,
      fullName: "Risk",
      id: buyerId,
      mustChangePassword: false,
      onboardingStatus: null,
      roles: [RoleName.student],
      status: "active",
    },
  };
  const deps: CheckoutPayDeps = {
    env,
    getProvider: () => options.provider ?? provider,
    getSession: async () => session,
    now: () => new Date("2026-11-20T10:00:00+07:00"),
  };
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    origin: APP_ORIGIN,
  };
  if (options.forwardedFor) headers["x-forwarded-for"] = options.forwardedFor;
  return handleCheckoutPayPost(
    new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
      body: new URLSearchParams({ key: randomUUID(), plan: "monthly", terms: PURCHASE_TERMS.version }).toString(),
      headers,
      method: "POST",
    }),
    deps,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
