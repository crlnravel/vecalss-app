import "server-only";

import { randomUUID } from "node:crypto";

import { assertDemoSeedAllowed } from "@/lib/payments/stand-in/demo-seed-guard";

/**
 * Demo transactions for a developer's machine. Every state below is reached the
 * way it is reached in the product: the real checkout handler writes the intent
 * and the order, the stand-in provider settles the payment and signs its event,
 * the real payment inbox decides what the event means, and the real refund and
 * dispute code does the rest. So every audit row, payment event, receipt and
 * access change is genuine, written by the same code and the same triggers as
 * a real payment. Nothing here disables a trigger or writes evidence directly;
 * the only rows made by hand are the demo accounts themselves.
 *
 * It refuses to start unless the stand-in's local-only gate passes (see
 * `demoSeedRefusals`), and it refuses a database marked as a merchant's. It is
 * safe to run twice: a scenario whose buyer already has an order is checked
 * against its expected end state and left alone.
 */

type DemoScenarioSlug =
  | "authority_refund"
  | "dispute_open"
  | "expired"
  | "failed"
  | "late_success_review"
  | "paid"
  | "pending"
  | "quarantined"
  | "refunded";

type DemoScenarioResult = {
  buyerEmail: string;
  note: string;
  orderId: string;
  seeded: boolean;
  slug: DemoScenarioSlug;
};

type DemoSeedOptions = {
  env?: Partial<Record<string, string | undefined>>;
  log?: (line: string) => void;
};

/** Each scenario's buyer. The address ends in `.local`, so no email can ever leave the machine for it. */
const DEMO_SCENARIOS: Array<{ expected: string; name: string; slug: DemoScenarioSlug }> = [
  { expected: "Lunas, struk terbit, akses diberikan", name: "Demo Lunas", slug: "paid" },
  { expected: "Menunggu pembayaran", name: "Demo Menunggu", slug: "pending" },
  { expected: "Kedaluwarsa", name: "Demo Kedaluwarsa", slug: "expired" },
  { expected: "Pembayaran gagal", name: "Demo Gagal", slug: "failed" },
  { expected: "Lunas lalu dikembalikan penuh, akses dicabut", name: "Demo Dikembalikan", slug: "refunded" },
  { expected: "Sengketa terbuka, akses dijeda", name: "Demo Sengketa", slug: "dispute_open" },
  { expected: "Kabar pembayaran dengan nominal keliru ditahan, pesanan tetap menunggu", name: "Demo Ditahan", slug: "quarantined" },
  { expected: "Pembayaran masuk setelah kedaluwarsa, dikirim ke tinjauan", name: "Demo Terlambat", slug: "late_success_review" },
  { expected: "Dikembalikan atas perintah otoritas", name: "Demo Otoritas", slug: "authority_refund" },
];

const DEMO_DOMAIN = "vecalss.local";
const demoEmail = (slug: DemoScenarioSlug) => `demo-transaksi-${slug.replaceAll("_", "-")}@${DEMO_DOMAIN}`;
const DEMO_PREPARER_EMAIL = `demo-admin-transaksi@${DEMO_DOMAIN}`;
const DEFAULT_OWNER_EMAIL = "admin@vecalss.local";

class DemoSeedIncompleteError extends Error {
  constructor(slug: string, found: string) {
    super(`The demo scenario "${slug}" is only partly there (${found}). Reset the local database with "just local-reset" and run the demo seed again.`);
    this.name = "DemoSeedIncompleteError";
  }
}

async function runDemoSeed({ env = process.env, log = () => undefined }: DemoSeedOptions = {}): Promise<DemoScenarioResult[]> {
  // Nothing below this line may run before the gate has passed: not an import that connects, not a query.
  assertDemoSeedAllowed(env);
  const { assertNotMerchantEnvironment } = await import("@/lib/retention/environment-guard.mjs");
  await assertNotMerchantEnvironment("seed:transaction-demo", env);

  const { RoleName } = await import("@/generated/prisma/client");
  const { prisma } = await import("@/lib/prisma");
  const { getAppBaseUrl } = await import("@/lib/config");
  const { requireAdmin, requireOwner } = await import("@/lib/fraud/authority");
  const { PURCHASE_TERMS } = await import("@/lib/fulfillment/terms");
  const { handleCheckoutPayPost } = await import("@/lib/pricing/checkout-pay");
  const { resolvePricing } = await import("@/lib/pricing/schedule");
  const { receivePaymentEvent } = await import("@/lib/payments/inbox");
  const { StandInProvider } = await import("@/lib/payments/stand-in/provider");
  const { approveRefund, prepareRefund } = await import("@/lib/refunds/cases");
  const { executeProviderRefund, reconcileRefund } = await import("@/lib/refunds/execute");

  type Session = import("@/lib/auth/types").SessionContext;
  const appBaseUrl = getAppBaseUrl(env as NodeJS.ProcessEnv);
  const provider = new StandInProvider({ appBaseUrl, env, secret: env.PAYMENT_STAND_IN_SECRET });

  const ownerEmail = (env.FRAUD_OWNER_EMAIL?.trim() || DEFAULT_OWNER_EMAIL).toLowerCase();
  const checkoutEnv = { ...env, TRUSTED_PROXY_COUNT: "1" } as unknown as NodeJS.ProcessEnv;

  const sessionFor = (user: { email: string; fullName: string; id: string }, roles: Array<(typeof RoleName)[keyof typeof RoleName]>): Session => ({
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: `demo-seed-${randomUUID()}`,
    user: { email: user.email, fullName: user.fullName, id: user.id, mfaStatus: "verified", mustChangePassword: false, onboardingStatus: null, roles, status: "active" },
  });

  const owner = await prisma.user.findUnique({ select: { email: true, fullName: true, id: true }, where: { email: ownerEmail } });
  if (!owner) throw new Error(`The owner account ${ownerEmail} does not exist. Seed the local accounts first ("just local-reset").`);
  const ownerContext = requireOwner(sessionFor(owner, [RoleName.admin]), { FRAUD_OWNER_EMAIL: ownerEmail });
  const ownerEnv = { FRAUD_OWNER_EMAIL: ownerEmail };

  // A second admin prepares some refunds, so the history shows two people and a self-approval beside it.
  const preparer = await prisma.user.upsert({
    create: {
      email: DEMO_PREPARER_EMAIL,
      fullName: "Demo Admin Transaksi",
      passwordHash: "demo-account-without-login",
      roleAssignments: { create: [{ role: "admin" }] },
    },
    select: { email: true, fullName: true, id: true },
    update: {},
    where: { email: DEMO_PREPARER_EMAIL },
  });
  const preparerContext = requireAdmin(sessionFor(preparer, [RoleName.admin]));

  const published = await prisma.tryoutPackage.findFirst({ select: { code: true }, where: { status: "published" } });
  if (!published) throw new Error('The local database has no published tryout package. Seed it first ("just local-reset").');
  checkoutEnv.PRICING_PACKAGE_CODE_MONTHLY = published.code;
  checkoutEnv.PRICING_PACKAGE_CODE_FULL_UTBK = published.code;
  checkoutEnv.PRICING_PACKAGE_CODE_FULL_MANDIRI = published.code;

  const ipOf = (index: number) => `203.0.113.${10 + index}`;

  async function buyerFor(slug: DemoScenarioSlug, name: string) {
    const email = demoEmail(slug);
    return prisma.user.upsert({
      create: { email, fullName: name, passwordHash: "demo-account-without-login", roleAssignments: { create: [{ role: "student" }] } },
      select: { email: true, fullName: true, id: true },
      update: {},
      where: { email },
    });
  }

  /** The real checkout POST: intent, risk checks, order and the provider's payment session. */
  async function checkout(buyer: { email: string; fullName: string; id: string }, index: number) {
    const { entry } = resolvePricing(new Date());
    if (!entry) throw new Error("There is no price for the current month in the pricing schedule, so a demo checkout cannot start.");
    const form = new URLSearchParams({
      key: randomUUID(),
      plan: "monthly",
      quoted_amount: String(entry.monthlyPrice),
      quoted_month: entry.month,
      terms: PURCHASE_TERMS.version,
    });
    const response = await handleCheckoutPayPost(
      new Request(`${appBaseUrl}/pricing/checkout/pay`, {
        body: form.toString(),
        headers: { "content-type": "application/x-www-form-urlencoded", origin: appBaseUrl, "x-forwarded-for": ipOf(index) },
        method: "POST",
      }),
      { env: checkoutEnv, getProvider: () => provider, getSession: async () => sessionFor(buyer, [RoleName.student]), now: () => new Date() },
    );
    const order = await prisma.paymentOrder.findFirst({ where: { buyerId: buyer.id } });
    if (!order) throw new Error(`Checkout did not create an order for ${buyer.email} (it answered ${response.status}).`);
    return order;
  }

  async function deliver(event: { body: Uint8Array; headers: Record<string, string> }, callerIp: string | null = "198.51.100.20") {
    const received = await receivePaymentEvent({ adapter: provider, callerIp, headers: new Headers(event.headers), rawBody: event.body });
    if (received.status !== "received") throw new Error(`The payment inbox refused a demo event (${received.status}).`);
    return received.result;
  }

  async function settle(reference: string, outcome: "expired" | "failed" | "succeeded") {
    const event = await provider.settle(reference, outcome, new Date());
    if (!event) throw new Error(`The stand-in could not settle ${reference} as ${outcome}.`);
    return deliver(event);
  }

  /** A signed event that says what the provider would not: a wrong amount, or a payment after the time ran out. */
  function forged(order: { amountRupiah: number; buyerId: string; currency: string; packageCode: string; providerReference: string | null; reference: string }, kind: "payment.succeeded", amountRupiah = order.amountRupiah) {
    return provider.buildSignedEvent(
      {
        amountRupiah,
        currency: order.currency,
        metadata: { buyerId: order.buyerId, packageCode: order.packageCode },
        providerPaymentId: order.providerReference ?? `sip_${randomUUID().slice(0, 12)}`,
        reference: order.reference,
      },
      kind,
      new Date(),
    );
  }

  const caseOf = (caseId: string) => prisma.refundCase.findUniqueOrThrow({ where: { id: caseId } });

  async function refundThroughProvider(input: Parameters<typeof prepareRefund>[1], preparedBy: typeof preparerContext) {
    const prepared = await prepareRefund(preparedBy, input);
    await approveRefund(ownerContext, { caseId: prepared.caseId, expectedVersion: (await caseOf(prepared.caseId)).version, reason: "Bukti permintaan sudah dicek dan pembayarannya memang tertagih." }, ownerEnv);
    await executeProviderRefund(ownerContext, { caseId: prepared.caseId, expectedVersion: (await caseOf(prepared.caseId)).version }, { env: ownerEnv, provider });
    return caseOf(prepared.caseId);
  }

  /** What the order and its records look like when a scenario is whole. */
  async function stateOf(slug: DemoScenarioSlug, orderId: string): Promise<string | null> {
    const order = await prisma.paymentOrder.findUniqueOrThrow({ select: { status: true }, where: { id: orderId } });
    const [counts] = await prisma.$queryRaw<Array<{ completed: number; held: number; quarantined: number; receipts: number; refunds: number; openDisputes: number }>>`
      SELECT (SELECT count(*)::int FROM refund_cases WHERE order_id = ${orderId}::uuid AND state = 'completed') AS completed,
             (SELECT count(*)::int FROM refund_cases WHERE order_id = ${orderId}::uuid AND reason_code = 'authority_order' AND state = 'completed') AS held,
             (SELECT count(*)::int FROM payment_events WHERE order_id = ${orderId}::uuid AND outcome = 'quarantined') AS quarantined,
             (SELECT count(*)::int FROM payment_receipts WHERE order_id = ${orderId}::uuid AND delivery_status = 'delivered') AS receipts,
             (SELECT count(*)::int FROM refund_cases WHERE order_id = ${orderId}::uuid) AS refunds,
             (SELECT count(*)::int FROM payment_disputes WHERE order_id = ${orderId}::uuid AND state = 'open') AS "openDisputes"
    `;
    const found = `order ${order.status}, ${counts.completed} completed refunds, ${counts.openDisputes} open disputes, ${counts.quarantined} held events`;
    const whole: Record<DemoScenarioSlug, boolean> = {
      authority_refund: order.status === "paid" && counts.held === 1,
      dispute_open: order.status === "paid" && counts.openDisputes === 1,
      expired: order.status === "expired",
      failed: order.status === "failed",
      late_success_review: order.status === "review",
      paid: order.status === "paid" && counts.receipts === 1 && counts.refunds === 0,
      pending: order.status === "pending",
      quarantined: order.status === "pending" && counts.quarantined >= 1,
      refunded: order.status === "paid" && counts.completed === 1,
    };
    return whole[slug] ? null : found;
  }

  const results: DemoScenarioResult[] = [];
  for (const [index, scenario] of DEMO_SCENARIOS.entries()) {
    const buyer = await buyerFor(scenario.slug, scenario.name);
    const existing = await prisma.paymentOrder.findFirst({ select: { id: true }, where: { buyerId: buyer.id } });
    if (existing) {
      const problem = await stateOf(scenario.slug, existing.id);
      if (problem) throw new DemoSeedIncompleteError(scenario.slug, problem);
      log(`already there: ${scenario.slug}`);
      results.push({ buyerEmail: buyer.email, note: scenario.expected, orderId: existing.id, seeded: false, slug: scenario.slug });
      continue;
    }

    let order = await checkout(buyer, index);
    switch (scenario.slug) {
      case "paid":
        await settle(order.reference, "succeeded");
        break;
      case "pending":
        break;
      case "expired":
        await settle(order.reference, "expired");
        break;
      case "failed":
        await settle(order.reference, "failed");
        break;
      case "refunded": {
        await settle(order.reference, "succeeded");
        const sent = await refundThroughProvider({
          orderId: order.id,
          reasonCode: "double_charge",
          requestChannel: "whatsapp",
          requestNote: "Pembeli mengirim dua bukti bayar untuk paket yang sama lewat WhatsApp.",
        }, preparerContext);
        const event = await provider.settleRefund(sent.reference, "succeeded", new Date());
        if (!event) throw new Error("The stand-in has no pending refund to settle.");
        await deliver(event);
        break;
      }
      case "dispute_open": {
        await settle(order.reference, "succeeded");
        const opened = await provider.buildSignedDisputeEventFor(order.reference, "dispute.opened", new Date(), {
          providerDisputeId: `dsp_demo_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
          reason: "Pemilik kartu mengaku tidak mengenali transaksi ini.",
          responseDueAt: new Date(Date.now() + 7 * 86_400_000),
        });
        await deliver(opened);
        break;
      }
      case "quarantined":
        // The provider's event names a lower amount than the order: held, and the order stays unpaid.
        await deliver(forged(order, "payment.succeeded", order.amountRupiah - 10_000));
        break;
      case "late_success_review":
        await settle(order.reference, "expired");
        await deliver(forged(order, "payment.succeeded"));
        break;
      case "authority_refund": {
        await settle(order.reference, "succeeded");
        order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
        const sent = await refundThroughProvider({
          authorityName: "Pengadilan Negeri Jakarta Selatan",
          authorityReference: `Demo No. ${order.reference.slice(0, 8)}/Pdt.G/2026`,
          orderId: order.id,
          reasonCode: "authority_order",
          requestChannel: "email",
          requestedAt: order.createdAt,
          requestNote: "Surat perintah pengadilan diterima lewat email, meminta pembayaran ini dikembalikan.",
        }, preparerContext);
        // This one is confirmed by asking the provider for the refund's status, the other by its signed event.
        const settled = await provider.settleRefund(sent.reference, "succeeded", new Date());
        if (!settled) throw new Error("The stand-in has no pending refund to settle.");
        const outcome = await reconcileRefund(sent.id, { provider });
        if (outcome.result !== "completed") throw new Error(`The authority refund did not complete (${outcome.result}).`);
        break;
      }
    }
    log(`seeded: ${scenario.slug}`);
    const problem = await stateOf(scenario.slug, order.id);
    if (problem) throw new DemoSeedIncompleteError(scenario.slug, problem);
    results.push({ buyerEmail: buyer.email, note: scenario.expected, orderId: order.id, seeded: true, slug: scenario.slug });
  }
  return results;
}

export { DEMO_SCENARIOS, DemoSeedIncompleteError, demoEmail, runDemoSeed };
export type { DemoScenarioResult, DemoScenarioSlug };
