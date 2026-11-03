import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { SessionContext } from "../lib/auth/types";
import { handlePaymentEventRequest } from "../lib/payments/inbox-http";
import { getPaymentProvider, isStandInAllowed } from "../lib/payments/provider";
import { StandInProvider } from "../lib/payments/stand-in/provider";
import { checkStandInSignature, signStandInEvent } from "../lib/payments/stand-in/signing";
import * as checkoutConfig from "../lib/pricing/checkout";
import { handleCheckoutPayPost, type CheckoutPayDeps } from "../lib/pricing/checkout-pay";
import {
  APP_ORIGIN,
  TEST_SECRET,
  getPackageCode,
  makeBuyer,
  makeOrder,
  prisma,
  provider,
  signedEventFor,
} from "./payment-test-kit";

/**
 * The provider switch: the stand-in runs only outside production against a
 * local database, and anywhere else checkout has no provider and fails closed.
 * Also the inbox endpoint's answers and the stand-in's signing.
 */

const LOCAL = "postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public";
const NEON = "postgresql://user:pass@ep-spring-unit-ao75v221-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

async function main() {
  // ---- When the stand-in may run ---------------------------------------------------
  const allowed = [
    { DATABASE_URL: LOCAL, NODE_ENV: "development" },
    { DATABASE_URL: LOCAL, NODE_ENV: "test" },
    { DATABASE_URL: "postgresql://u:p@localhost:5432/x", NODE_ENV: "development" },
    { DATABASE_URL: "postgresql://u:p@[::1]:5432/x", NODE_ENV: undefined },
  ];
  for (const env of allowed) assert.equal(isStandInAllowed(env), true, JSON.stringify(env));

  const refused = [
    { DATABASE_URL: LOCAL, NODE_ENV: "production" },
    { DATABASE_URL: NEON, NODE_ENV: "development" },
    { DATABASE_URL: NEON, NODE_ENV: "production" },
    { DATABASE_URL: undefined, NODE_ENV: "development" },
    { DATABASE_URL: "", NODE_ENV: "development" },
    { DATABASE_URL: "not a url", NODE_ENV: "development" },
    { DATABASE_URL: "postgresql://u:p@localhost.evil.example:5432/x", NODE_ENV: "development" },
    { DATABASE_URL: "postgresql://u:p@127.0.0.1.evil.example:5432/x", NODE_ENV: "development" },
    { DATABASE_URL: "postgresql://u:p@db.internal.example:5432/x", NODE_ENV: "development" },
  ];
  for (const env of refused) assert.equal(isStandInAllowed(env), false, JSON.stringify(env));

  // ---- Which provider is configured -------------------------------------------------
  const local = { APP_BASE_URL: APP_ORIGIN, DATABASE_URL: LOCAL, NODE_ENV: "development" };
  assert.equal(getPaymentProvider({ ...local }), null, "nothing selected, nothing configured");
  assert.equal(getPaymentProvider({ ...local, PAYMENT_PROVIDER: "" }), null);
  assert.equal(getPaymentProvider({ ...local, PAYMENT_PROVIDER: "e2pay" }), null, "E2Pay's adapter does not exist yet");
  assert.equal(getPaymentProvider({ ...local, PAYMENT_PROVIDER: "unknown" }), null);
  assert.ok(getPaymentProvider({ ...local, PAYMENT_PROVIDER: "stand-in" }) instanceof StandInProvider);
  assert.equal(getPaymentProvider({ ...local, PAYMENT_PROVIDER: " Stand-In " })?.id, "stand-in");
  for (const env of refused) {
    assert.equal(
      getPaymentProvider({ ...env, APP_BASE_URL: APP_ORIGIN, PAYMENT_PROVIDER: "stand-in" }),
      null,
      `the stand-in is refused: ${JSON.stringify(env)}`,
    );
  }

  // ---- Production refusal, end to end -------------------------------------------------
  {
    const buyerId = await makeBuyer();
    const packageCode = await getPackageCode();
    const session: SessionContext = {
      expiresAt: new Date(Date.now() + 3_600_000),
      sessionId: "session-provider",
      user: { email: "p@example.test", fullName: "P", id: buyerId, mustChangePassword: false, onboardingStatus: null, roles: ["student"], status: "active" },
    };
    const base = {
      APP_BASE_URL: APP_ORIGIN,
      PAYMENT_PROVIDER: "stand-in",
      PRICING_PACKAGE_CODE_FULL_MANDIRI: packageCode,
      PRICING_PACKAGE_CODE_FULL_UTBK: packageCode,
      PRICING_PACKAGE_CODE_MONTHLY: packageCode,
    };
    const submit = (env: Record<string, string | undefined>) => {
      // No provider override: the handler resolves the provider from this environment itself.
      const deps: CheckoutPayDeps = { env: env as unknown as NodeJS.ProcessEnv, getSession: async () => session, now: () => new Date("2026-11-20T10:00:00+07:00") };
      return handleCheckoutPayPost(
        new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
          body: new URLSearchParams({ key: randomUUID(), plan: "monthly" }).toString(),
          headers: { "content-type": "application/x-www-form-urlencoded", origin: APP_ORIGIN },
          method: "POST",
        }),
        deps,
      );
    };
    const written = async () => ({
      intents: await prisma.checkoutIntent.count({ where: { buyerId } }),
      orders: await prisma.paymentOrder.count({ where: { buyerId } }),
      sessions: await prisma.standInPayment.count(),
    });

    const before = await written();
    for (const env of [
      { ...base, DATABASE_URL: LOCAL, NODE_ENV: "production" },
      { ...base, DATABASE_URL: NEON, NODE_ENV: "development" },
      { ...base, DATABASE_URL: LOCAL, NODE_ENV: "test", PAYMENT_PROVIDER: undefined },
      { ...base, DATABASE_URL: LOCAL, NODE_ENV: "test", PAYMENT_PROVIDER: "e2pay" },
      { ...base, CHECKOUT_BASE_URL: "https://pay.example.test/checkout", DATABASE_URL: LOCAL, NODE_ENV: "test", PAYMENT_PROVIDER: undefined },
    ]) {
      const response = await submit(env);
      assert.equal(response.status, 303);
      const target = new URL(response.headers.get("location") ?? "");
      assert.equal(target.origin, APP_ORIGIN, "never sent anywhere else, so no editable redirect is left");
      assert.equal(target.pathname, "/pricing/checkout");
      assert.deepEqual(await written(), before, `nothing written: ${JSON.stringify({ ...env, DATABASE_URL: "…" })}`);
    }

    // And it works when the environment allows it, which is what the checks above are measured against.
    const open = await submit({ ...base, DATABASE_URL: LOCAL, NODE_ENV: "test" });
    assert.match(new URL(open.headers.get("location") ?? "").pathname, /^\/pay\/stand-in\//u);
    assert.equal((await written()).orders, before.orders + 1);

    // The old redirect builder is gone from the module.
    assert.deepEqual(Object.keys(checkoutConfig).sort(), ["PACKAGE_CODE_ENV_KEYS", "getPackageCode"]);

    // The payment inbox answers nothing when the stand-in is refused.
    const order = await makeOrder();
    const event = signedEventFor(order, "payment.succeeded");
    const post = (body: Uint8Array, headers: Record<string, string>) =>
      new Request(`${APP_ORIGIN}/api/payments/events/stand-in`, { body: body as BodyInit, headers, method: "POST" });
    const refusedEnv = { ...base, DATABASE_URL: NEON, NODE_ENV: "production" };
    const closed = await handlePaymentEventRequest(post(event.body, event.headers), "stand-in", {
      afterReceive: () => assert.fail("nothing to drain"),
      getProvider: () => getPaymentProvider(refusedEnv),
    });
    assert.equal(closed.status, 404);
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "pending");
    assert.equal(await prisma.paymentEvent.count({ where: { orderId: order.id } }), 0);
  }

  // ---- The inbox endpoint ---------------------------------------------------------------
  {
    const order = await makeOrder();
    let drains = 0;
    const deps = { afterReceive: () => { drains += 1; }, getProvider: () => provider };
    const post = (body: Uint8Array, headers: Record<string, string>, providerId = "stand-in", extra: Record<string, string> = {}) =>
      handlePaymentEventRequest(
        new Request(`${APP_ORIGIN}/api/payments/events/${providerId}`, { body: body as BodyInit, headers: { ...headers, ...extra }, method: "POST" }),
        providerId,
        deps,
      );
    const event = signedEventFor(order, "payment.succeeded");

    assert.equal((await post(event.body, event.headers, "someone-else")).status, 404, "another provider's name");
    assert.equal((await handlePaymentEventRequest(new Request(APP_ORIGIN, { body: event.body as BodyInit, method: "POST" }), "stand-in", { getProvider: () => null })).status, 404);

    const forged = signStandInEvent("wrong", event.body, new Date());
    const unsigned = await post(event.body, forged);
    assert.equal(unsigned.status, 401);
    assert.deepEqual(await unsigned.json(), { error: "invalid_signature" });
    const stale = signedEventFor(order, "payment.succeeded", { at: new Date(Date.now() - 20 * 60_000) });
    assert.equal((await post(stale.body, stale.headers)).status, 400);
    const junk = new TextEncoder().encode("not json");
    assert.equal((await post(junk, signStandInEvent(TEST_SECRET, junk, new Date()))).status, 400);
    const huge = new Uint8Array(40 * 1024).fill(97);
    assert.equal((await post(huge, signStandInEvent(TEST_SECRET, huge, new Date()))).status, 413);
    assert.equal(drains, 0, "refused requests start no work");
    assert.equal(await prisma.paymentEvent.count({ where: { orderId: order.id } }), 0);

    const accepted = await post(event.body, event.headers, "stand-in", { "x-forwarded-for": "198.51.100.77" });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { outcome: "accepted", received: true });
    assert.equal(accepted.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(drains, 1);
    const stored = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(stored.callerIp, null, "an untrusted forwarded header is not believed");

    const repeat = await post(event.body, event.headers);
    assert.equal(repeat.status, 200);
    assert.deepEqual(await repeat.json(), { duplicate: true, received: true });

    // A mismatch is still a 200: the provider must not retry what we have decided to hold.
    const forgedAmount = signedEventFor(await makeOrder(), "payment.succeeded", { amountRupiah: 5 });
    const held = await post(forgedAmount.body, forgedAmount.headers);
    assert.equal(held.status, 200);
    assert.deepEqual(await held.json(), { outcome: "quarantined", received: true });

    // A server fault is a 5xx so the provider retries.
    const broken = await handlePaymentEventRequest(
      new Request(`${APP_ORIGIN}/api/payments/events/stand-in`, { body: event.body as BodyInit, headers: event.headers, method: "POST" }),
      "stand-in",
      {
        getProvider: () => ({ ...provider, id: "stand-in", verifyAndParseEvent: () => { throw new Error("db down"); } }) as unknown as typeof provider,
      },
    );
    assert.equal(broken.status, 503);
  }

  // ---- Signing -------------------------------------------------------------------------------
  {
    const body = new TextEncoder().encode('{"a":1}');
    const at = new Date("2026-11-04T10:00:00Z");
    const headers = new Headers(signStandInEvent("k", body, at));
    const near = (seconds: number) => new Date(at.getTime() + seconds * 1000);
    assert.equal(checkStandInSignature("k", headers, body, near(0)), "ok");
    assert.equal(checkStandInSignature("k", headers, body, near(299)), "ok");
    assert.equal(checkStandInSignature("k", headers, body, near(-299)), "ok");
    assert.equal(checkStandInSignature("k", headers, body, near(301)), "stale");
    assert.equal(checkStandInSignature("k", headers, body, near(-301)), "stale");
    assert.equal(checkStandInSignature("other", headers, body, near(0)), "bad_signature");
    assert.equal(checkStandInSignature("k", headers, new TextEncoder().encode('{"a":2}'), near(0)), "bad_signature");
    for (const bad of ["", "v1=", "v1=zz", "sha256=abcd", `v1=${"0".repeat(64)}`, `v1=${"0".repeat(63)}`]) {
      const tampered = new Headers(headers);
      tampered.set("x-stand-in-signature", bad);
      assert.equal(checkStandInSignature("k", tampered, body, near(0)), "bad_signature", bad);
    }
    const noStamp = new Headers(headers);
    noStamp.delete("x-stand-in-timestamp");
    assert.equal(checkStandInSignature("k", noStamp, body, near(0)), "bad_signature");
  }

  // ---- The stand-in's own payment state ----------------------------------------------------------
  {
    const order = await makeOrder();
    const succeeded = await provider.settle(order.reference, "succeeded", new Date());
    assert.ok(succeeded, "a pending payment settles");
    assert.equal(await provider.settle(order.reference, "failed", new Date()), null, "only once");
    const status = await provider.getStatus(order.reference);
    assert.ok(status.found && status.state === "succeeded");

    const expired = await makeOrder({ pastExpiry: true, session: true });
    assert.equal(await provider.settle(expired.reference, "succeeded", new Date()), null, "the stand-in refuses to take money after its expiry");
    const lapsed = await provider.getStatus(expired.reference);
    assert.ok(lapsed.found && lapsed.state === "expired");
    assert.deepEqual(await provider.getStatus(`missing-${randomUUID()}`), { found: false });
  }

  console.log("Payment provider checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
