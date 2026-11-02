import "dotenv/config";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { PackagePurchaseStatus, RoleName } from "../generated/prisma/client";
import { POST as purchaseCallback } from "../app/api/internal/package-purchases/succeeded/route";
import type { SessionContext } from "../lib/auth/types";
import {
  createCheckoutIdempotencyKey,
  isCheckoutPaused,
  parseCheckoutIdempotencyKey,
} from "../lib/pricing/checkout-intent";
import {
  handleCheckoutPayPost,
  handleCheckoutPayRedirect,
  type CheckoutPayDeps,
} from "../lib/pricing/checkout-pay";
import { prisma } from "../lib/prisma";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:checkout-intent only runs against the local dev database on 127.0.0.1:55432.");
}

const APP_ORIGIN = "https://app.example.test";
const PAY_URL = `${APP_ORIGIN}/pricing/checkout/pay`;
const baseEnv = {
  APP_BASE_URL: APP_ORIGIN,
  CHECKOUT_BASE_URL: "https://pay.example.test/checkout",
  NODE_ENV: "test",
  PRICING_PACKAGE_CODE_FULL_MANDIRI: "FULL-MANDIRI",
  PRICING_PACKAGE_CODE_FULL_UTBK: "FULL-UTBK",
  PRICING_PACKAGE_CODE_MONTHLY: "MONTHLY",
} as unknown as NodeJS.ProcessEnv;
const NOVEMBER = new Date("2026-11-20T10:00:00+07:00");
const DECEMBER = new Date("2026-12-20T10:00:00+07:00");

function sessionFor(userId: string, roles: RoleName[]): SessionContext {
  return {
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: `session-${userId}`,
    user: {
      email: `${userId}@example.test`,
      fullName: "Checkout Test",
      id: userId,
      mustChangePassword: false,
      onboardingStatus: null,
      roles,
      status: "active",
    },
  };
}

function postRequest(
  fields: Record<string, string>,
  { contentType = "application/x-www-form-urlencoded", origin = APP_ORIGIN as string | null } = {},
) {
  const headers: Record<string, string> = { "content-type": contentType };
  if (origin !== null) headers.origin = origin;
  return new Request(PAY_URL, {
    body: new URLSearchParams(fields).toString(),
    headers,
    method: "POST",
  });
}

function location(response: Response) {
  assert.equal(response.status, 303);
  return new URL(response.headers.get("location") ?? "");
}

async function main() {
  const runId = crypto.randomUUID().slice(0, 8);
  const [alice, bob] = await Promise.all(
    ["alice", "bob"].map((name) =>
      prisma.user.create({
        data: {
          email: `checkout-intent-${name}-${runId}@vecalss.local`,
          fullName: `Checkout Intent ${name}`,
          passwordHash: "not-a-real-hash",
        },
        select: { id: true },
      }),
    ),
  );
  const buyerIds = [alice.id, bob.id];
  const intentCount = () => prisma.checkoutIntent.count({ where: { buyerId: { in: buyerIds } } });

  const referral = await prisma.affiliatorProfile.findFirst({
    select: { referralCode: true },
    where: { isActive: true },
  });
  assert.ok(referral, "The dev database needs an active affiliator profile (run pnpm db:seed).");
  const publishedPackage = await prisma.tryoutPackage.findFirst({
    select: { code: true },
    where: { status: "published" },
  });
  assert.ok(publishedPackage, "The dev database needs a published tryout package (run pnpm db:seed).");
  const seededStudent = await prisma.user.findFirstOrThrow({
    select: { id: true },
    where: { email: "student@vecalss.local" },
  });

  let sessionCalls = 0;
  let session: SessionContext | null = sessionFor(alice.id, [RoleName.student]);
  const deps = (overrides: Partial<CheckoutPayDeps> = {}): CheckoutPayDeps => ({
    env: baseEnv,
    getSession: async () => {
      sessionCalls += 1;
      return session;
    },
    now: () => NOVEMBER,
    ...overrides,
  });

  const providerReference = `checkout-intent-test-${runId}`;
  try {
    // Keys are minted per render and carry no state.
    const first = createCheckoutIdempotencyKey();
    assert.notEqual(first, createCheckoutIdempotencyKey());
    assert.equal(parseCheckoutIdempotencyKey(first), first);
    assert.equal(parseCheckoutIdempotencyKey(first.toUpperCase()), first);
    for (const bad of [null, "", "short", "x".repeat(36), `${first}0`]) {
      assert.equal(parseCheckoutIdempotencyKey(bad), null, String(bad));
    }
    assert.equal(await intentCount(), 0);

    // GET and HEAD: no side effects, old links land on the checkout page.
    for (const method of ["GET", "HEAD"]) {
      const response = handleCheckoutPayRedirect(
        new Request(`${PAY_URL}?plan=full&ref=SALSA2027`, { method }),
        deps(),
      );
      const target = location(response);
      assert.equal(target.pathname, "/pricing/checkout");
      assert.equal(target.searchParams.get("plan"), "full");
      assert.equal(target.searchParams.get("ref"), "SALSA2027");
    }
    assert.equal(location(handleCheckoutPayRedirect(new Request(`${PAY_URL}?plan=gold`), deps())).pathname, "/pricing");
    assert.equal(sessionCalls, 0, "GET/HEAD must not even read the session");
    assert.equal(await intentCount(), 0);

    // A cross-site or origin-less POST is rejected before the session or database is touched.
    const fields = { key: first, plan: "monthly" };
    for (const origin of ["https://evil.example", "null", "http://app.example.test", `${APP_ORIGIN}.evil.example`, null]) {
      const response = await handleCheckoutPayPost(postRequest(fields, { origin }), deps());
      assert.equal(response.status, 403, String(origin));
    }
    assert.equal(sessionCalls, 0);
    assert.equal(await intentCount(), 0);

    // Unauthenticated and non-student submissions are redirected and create nothing.
    session = null;
    const unauth = location(await handleCheckoutPayPost(postRequest({ ...fields, ref: "salsa2027" }), deps()));
    assert.equal(unauth.pathname, "/login");
    assert.equal(unauth.searchParams.get("returnTo"), "/pricing/checkout?plan=monthly&ref=salsa2027");
    session = sessionFor(alice.id, [RoleName.admin]);
    const nonStudent = location(await handleCheckoutPayPost(postRequest(fields), deps()));
    assert.equal(nonStudent.pathname, "/pricing");
    assert.equal(nonStudent.searchParams.get("notice"), "student-only");
    assert.equal(await intentCount(), 0);
    session = sessionFor(alice.id, [RoleName.student]);

    // Malformed submissions create nothing.
    const malformed: Array<[string, Request]> = [
      ["missing key", postRequest({ plan: "monthly" })],
      ["bad key", postRequest({ key: "not-a-key", plan: "monthly" })],
      ["unknown plan", postRequest({ key: first, plan: "gold" })],
      ["wrong content type", postRequest(fields, { contentType: "application/json" })],
      ["oversized form", postRequest({ ...fields, pad: "x".repeat(5000) })],
      ["inactive referral", postRequest({ ...fields, ref: "NOPE-CODE" })],
    ];
    for (const [label, request] of malformed) {
      const response = await handleCheckoutPayPost(request, deps());
      assert.equal(response.status, 303, label);
      assert.equal(await intentCount(), 0, label);
    }

    // A same-origin POST creates one intent and goes to the provisional checkout redirect.
    const created = await handleCheckoutPayPost(
      postRequest({ ...fields, ref: ` ${referral.referralCode.toLowerCase()} ` }),
      deps(),
    );
    const createdTarget = location(created);
    assert.equal(createdTarget.origin, "https://pay.example.test");
    assert.equal(createdTarget.searchParams.get("package"), "MONTHLY");
    assert.equal(createdTarget.searchParams.get("amount"), "49000");
    assert.equal(createdTarget.searchParams.get("student"), alice.id);
    assert.equal(createdTarget.searchParams.get("ref"), referral.referralCode);
    const [intent] = await prisma.checkoutIntent.findMany({ where: { buyerId: alice.id } });
    assert.equal(await intentCount(), 1);
    assert.equal(intent.idempotencyKey, first);
    assert.equal(intent.plan, "monthly");
    assert.equal(intent.pricingMonth, "2026-11");
    assert.equal(intent.amountRupiah, 49_000);
    assert.equal(intent.referralCode, referral.referralCode);

    // A retry (also a concurrent double submit) reuses the intent, and keeps its quote across a price change.
    const retry = { ...fields, ref: referral.referralCode };
    const retries = await Promise.all([
      handleCheckoutPayPost(postRequest(retry), deps()),
      handleCheckoutPayPost(postRequest(retry), deps()),
      handleCheckoutPayPost(postRequest(retry), deps({ now: () => DECEMBER })),
    ]);
    for (const response of retries) {
      assert.equal(location(response).href, createdTarget.href);
    }
    assert.equal(await intentCount(), 1);
    assert.equal((await prisma.checkoutIntent.findFirstOrThrow({ where: { buyerId: alice.id } })).id, intent.id);

    // The same key with a different plan or referral is rejected and writes nothing.
    for (const changed of [{ ...retry, plan: "full" }, { key: first, plan: "monthly" }]) {
      const conflict = location(await handleCheckoutPayPost(postRequest(changed), deps()));
      assert.equal(conflict.pathname, "/pricing/checkout");
      assert.equal(conflict.searchParams.get("notice"), "checkout-changed");
      assert.equal(conflict.origin, APP_ORIGIN);
    }
    assert.equal(await intentCount(), 1);
    const unchanged = await prisma.checkoutIntent.findFirstOrThrow({ where: { buyerId: alice.id } });
    assert.equal(unchanged.plan, "monthly");
    assert.equal(unchanged.referralCode, referral.referralCode);

    // Another buyer cannot ride on the same key; a fresh key for the same buyer is a new intent.
    session = sessionFor(bob.id, [RoleName.student]);
    await handleCheckoutPayPost(postRequest({ key: first, plan: "full" }), deps());
    session = sessionFor(alice.id, [RoleName.student]);
    await handleCheckoutPayPost(postRequest({ key: createCheckoutIdempotencyKey(), plan: "full" }), deps());
    assert.equal(await intentCount(), 3);
    assert.equal(await prisma.checkoutIntent.count({ where: { buyerId: bob.id } }), 1);

    // Kill switch: no new intent (and no redirect to the payment service); config parsing fails closed.
    for (const [value, paused] of [["", false], ["0", false], ["false", false], ["OFF", false], ["1", true], ["on", true], ["yes please", true]] as const) {
      assert.equal(isCheckoutPaused({ CHECKOUT_KILL_SWITCH: value }), paused, value);
    }
    assert.equal(isCheckoutPaused({}), false);
    const pausedEnv = { ...baseEnv, CHECKOUT_KILL_SWITCH: "1" } as unknown as NodeJS.ProcessEnv;
    const before = await intentCount();
    for (const key of [createCheckoutIdempotencyKey(), first]) {
      const pausedTarget = location(await handleCheckoutPayPost(postRequest({ key, plan: "monthly" }), deps({ env: pausedEnv })));
      assert.equal(pausedTarget.origin, APP_ORIGIN);
      assert.equal(pausedTarget.pathname, "/pricing/checkout");
    }
    assert.equal(await intentCount(), before);

    // ...while the purchase callback still records, with the switch on.
    const previousSwitch = process.env.CHECKOUT_KILL_SWITCH;
    const previousSecret = process.env.AFFILIATOR_PURCHASE_WEBHOOK_SECRET;
    process.env.CHECKOUT_KILL_SWITCH = "1";
    process.env.AFFILIATOR_PURCHASE_WEBHOOK_SECRET = "checkout-intent-test-secret";
    try {
      const body = JSON.stringify({
        event: "package.purchase.succeeded",
        packageCode: publishedPackage.code,
        providerReference,
        studentId: seededStudent.id,
      });
      const signature = `sha256=${createHmac("sha256", "checkout-intent-test-secret").update(body).digest("hex")}`;
      const callback = await purchaseCallback(new Request("https://app.example.test/api/internal/package-purchases/succeeded", {
        body,
        headers: { "content-type": "application/json", "x-vecalss-purchase-signature": signature },
        method: "POST",
      }));
      assert.equal(callback.status, 200);
      assert.equal((await callback.json() as { recorded: boolean }).recorded, true);
      const purchase = await prisma.packagePurchase.findUniqueOrThrow({ where: { providerReference } });
      assert.equal(purchase.status, PackagePurchaseStatus.succeeded);
    } finally {
      if (previousSwitch === undefined) delete process.env.CHECKOUT_KILL_SWITCH;
      else process.env.CHECKOUT_KILL_SWITCH = previousSwitch;
      if (previousSecret === undefined) delete process.env.AFFILIATOR_PURCHASE_WEBHOOK_SECRET;
      else process.env.AFFILIATOR_PURCHASE_WEBHOOK_SECRET = previousSecret;
    }

    console.log("Checkout intent boundary checks passed.");
  } finally {
    await prisma.packagePurchase.deleteMany({ where: { providerReference } });
    await prisma.checkoutIntent.deleteMany({ where: { buyerId: { in: buyerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: buyerIds } } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
