import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RoleName } from "../generated/prisma/client";
import type { SessionContext } from "../lib/auth/types";
import { enterPaidSurface } from "../lib/billing/enforcement";
import { grantAccess, pauseAccess, resumeAccess, revokeAccess } from "../lib/billing/service";
import { addCalendarMonths } from "../lib/billing/plans";
import { retryFulfillment } from "../lib/fulfillment/grant";
import { flagStalledFulfillments, runFulfillmentMaintenance } from "../lib/fulfillment/stalled";
import { PURCHASE_TERMS } from "../lib/fulfillment/terms";
import { recordPaidUse } from "../lib/fulfillment/usage";
import { createManualBlock } from "../lib/fraud/blocks";
import { requireOwner } from "../lib/fraud/authority";
import type { EmailMessage, MailResult } from "../lib/email/mailer";
import { createOrderFromIntent } from "../lib/payments/orders";
import { drainOutbox } from "../lib/payments/outbox";
import { createPaymentOutboxHandlers } from "../lib/payments/outbox-handlers";
import { handleCheckoutPayPost, type CheckoutPayDeps } from "../lib/pricing/checkout-pay";
import {
  APP_ORIGIN,
  deliver,
  failLeftoverOrders,
  getPackageCode,
  makeBuyer,
  makeIntent,
  makeOrder,
  prisma,
  provider,
  randomBuyerIp,
  runId,
  signedEventFor,
} from "./payment-test-kit";

/**
 * Commerce behavior test 4 (MS-08 phase A): a payment grants access inside its
 * own transaction, once. Covers the plan rules, a grant that cannot happen (kept
 * paid, pending, retried, then flagged after an hour), orders held for review
 * getting nothing, the receipt and its delivery attempts, the terms agreement
 * and usage evidence. Runs on the local database only (payment-test-kit
 * refuses the rest).
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const FULL_END_ENV = { FULL_ACCESS_ENDS_ON_UTBK: "2027-04-30" };
// 30 April 2027 runs through its last day in Jakarta, so access ends at the start of 1 May there.
const FULL_END = new Date("2027-04-30T17:00:00.000Z");

const accessEvents = (orderId: string) => prisma.billingAccessEvent.findMany({ where: { idempotencyKey: `order:${orderId}` } });
const jobs = (orderId: string, kind: "access_grant" | "critical_alert" | "receipt_email") =>
  prisma.paymentOutbox.findMany({ where: { kind, orderId } });
const receiptOf = (orderId: string) => prisma.paymentReceipt.findUnique({ where: { orderId } });
const account = (studentId: string) => prisma.billingAccount.findUniqueOrThrow({ where: { studentId } });

async function pay(options: Parameters<typeof makeOrder>[0] = {}) {
  const order = await makeOrder(options);
  const result = await deliver(signedEventFor(order, "payment.succeeded"));
  assert.equal(result.status, "received");
  return { order, result };
}

async function withTriggersOff<T>(table: string, work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    const value = await work(tx);
    await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    return value;
  });
}

async function makeAdminUser() {
  const user = await prisma.user.create({
    data: {
      email: `fulfil-admin-${randomUUID().slice(0, 8)}@vecalss.local`,
      fullName: "Fulfilment admin",
      passwordHash: "not-a-real-hash",
      roleAssignments: { create: [{ role: "admin" }] },
    },
    select: { id: true },
  });
  return user.id;
}

function mailer() {
  const calls: EmailMessage[] = [];
  let failNext = 0;
  const sendEmail = async (message: EmailMessage): Promise<MailResult> => {
    calls.push(message);
    if (failNext > 0) {
      failNext -= 1;
      return { ok: false, reason: "network" };
    }
    return { id: `email-${calls.length}`, ok: true, redirected: false };
  };
  return { calls, failNext: (count: number) => { failNext = count; }, sendEmail };
}

async function main() {
  const prefix = (orderId: string) => ({ dedupeKeyPrefix: `receipt:${orderId}` });

  // ---- A paid Monthly order is granted, receipted and notified in the payment transaction ----
  {
    const { order } = await pay();
    const paid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(paid.status, "paid");
    assert.equal(paid.termsVersion, "test-terms", "the order keeps the version its buyer agreed to");

    const events = await accessEvents(order.id);
    assert.equal(events.length, 1);
    assert.equal(events[0].source, "payment");
    assert.equal(events[0].kind, "grant");
    assert.equal(events[0].actorUserId, null);
    const state = await account(order.buyerId);
    assert.equal(state.status, "active");
    assert.equal(state.planCode, "monthly");
    assert.equal(state.accessStartsAt?.getTime(), events[0].occurredAt.getTime(), "access starts when it was granted, on database time");
    assert.equal(state.accessExpiresAt?.getTime(), addCalendarMonths(events[0].occurredAt, 1).getTime(), "Monthly is one calendar month");

    const receipt = await receiptOf(order.id);
    assert.ok(receipt);
    assert.match(receipt.receiptNumber, /^VCL-\d{6}-[0-9A-F]{6}$/u);
    assert.equal(receipt.deliveryStatus, "delivered");
    assert.equal(receipt.buyerId, order.buyerId);
    assert.equal(receipt.amountRupiah, 49_000);
    assert.equal(receipt.packageCode, order.packageCode);
    assert.equal(receipt.termsVersion, "test-terms");
    assert.equal(receipt.grantEventId, events[0].id);
    assert.equal(receipt.grantedAt?.getTime(), events[0].occurredAt.getTime());
    assert.equal(receipt.validUntil?.getTime(), state.accessExpiresAt?.getTime());
    assert.equal(receipt.paidAt.getTime(), paid.paidAt?.getTime());

    const notification = await prisma.notification.findFirstOrThrow({
      include: { deliveries: true },
      where: { recipientUserId: order.buyerId, sourceEntityId: receipt.id },
    });
    assert.equal(notification.eventType, "purchase_receipt");
    assert.equal(notification.deliveries[0].channel, "in_app");
    assert.equal(notification.deliveries[0].status, "delivered");
    const deliveries = await prisma.receiptDelivery.findMany({ where: { receiptId: receipt.id } });
    assert.deepEqual(deliveries.map((item) => `${item.channel}:${item.outcome}`), ["in_app:sent"], "the in-app record is delivery evidence");

    assert.equal((await jobs(order.id, "receipt_email")).length, 1);
    assert.equal((await jobs(order.id, "access_grant")).length, 0, "no retry is needed");
    assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.delivered", targetId: order.id } }), 1);
    pass("grant in the payment transaction");
  }

  // ---- Behavior test 4: duplicates and retries give one grant, one receipt, one email ----
  {
    const order = await makeOrder();
    const event = signedEventFor(order, "payment.succeeded");
    const results = await Promise.all(Array.from({ length: 6 }, () => deliver(event)));
    assert.equal(results.filter((item) => item.status === "received" && item.result.status === "processed").length, 1);
    assert.equal((await accessEvents(order.id)).length, 1, "one grant");
    assert.equal(await prisma.paymentReceipt.count({ where: { orderId: order.id } }), 1, "one receipt");
    assert.equal((await jobs(order.id, "receipt_email")).length, 1, "one email job");

    // Direct retries of the fulfilment step change nothing once it is delivered.
    const again = await Promise.all(Array.from({ length: 5 }, () => retryFulfillment(order.id)));
    assert.ok(again.every((item) => item.status === "already_delivered"));
    assert.equal((await accessEvents(order.id)).length, 1);
    const receipt = (await receiptOf(order.id))!;
    assert.equal(await prisma.notification.count({ where: { sourceEntityId: receipt.id } }), 1, "one in-app notification");

    // The email: the first send fails, the retry sends, a repeat of the job sends nothing.
    const mail = mailer();
    const handlers = createPaymentOutboxHandlers({ alertTo: "ops@vecalss.test", sendEmail: mail.sendEmail });
    const filter = prefix(order.id);
    mail.failNext(1);
    assert.deepEqual(await drainOutbox(handlers, { filter }), { dead: 0, done: 0, failed: 1 });
    const job = await prisma.paymentOutbox.findFirstOrThrow({ where: { kind: "receipt_email", orderId: order.id } });
    await prisma.$executeRaw`UPDATE payment_outbox SET next_run_at = now() - interval '1 second' WHERE id = ${job.id}::uuid`;
    assert.deepEqual(await drainOutbox(handlers, { filter }), { dead: 0, done: 1, failed: 0 });
    assert.equal(mail.calls.length, 2, "two attempts were made");
    assert.equal(new Set(mail.calls.map((call) => call.idempotencyKey)).size, 1, "both attempts carry one idempotency key");
    assert.equal(mail.calls[1].to, (await prisma.user.findUniqueOrThrow({ where: { id: order.buyerId } })).email);
    assert.match(mail.calls[1].subject, new RegExp(receipt.receiptNumber, "u"));
    assert.match(mail.calls[1].text, /sampai/u);
    assert.doesNotMatch(mail.calls[1].text, /order:|sip_|test-terms/u, "no internals in the email");

    // A lease that expired mid-run, or a job run twice: the delivery record stops a second send.
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'pending', next_run_at = now() - interval '1 second', leased_until = NULL, lease_owner = NULL WHERE id = ${job.id}::uuid`;
    assert.deepEqual(await drainOutbox(handlers, { filter }), { dead: 0, done: 1, failed: 0 });
    assert.equal(mail.calls.length, 2, "the repeated job sent nothing");
    const attempts = await prisma.receiptDelivery.findMany({ orderBy: { attemptedAt: "asc" }, where: { channel: "email", receiptId: receipt.id } });
    assert.deepEqual(attempts.map((item) => item.outcome), ["failed", "sent"]);
    assert.equal(attempts[1].providerMessageId, "email-2");
    pass("behavior test 4: one grant, one receipt, one email");
  }

  // ---- Plan rules ----------------------------------------------------------------------
  {
    // Monthly extends from the current end while access is running.
    const buyerId = await makeBuyer("extend");
    const admin = await makeAdminUser();
    const first = await grantAccess({ actorUserId: admin, idempotencyKey: `seed-${randomUUID()}`, plan: "monthly", reason: "Akses awal untuk uji", source: "admin", studentId: buyerId });
    const currentEnd = first.state.endsAt!;
    const { order } = await pay({ buyerId });
    const events = await accessEvents(order.id);
    assert.equal(events[0].kind, "extend");
    assert.equal(events[0].startsAt?.getTime(), first.state.startsAt?.getTime(), "the window keeps its start");
    assert.equal(events[0].endsAt?.getTime(), addCalendarMonths(currentEnd, 1).getTime(), "one month from the current end");
    pass("monthly extends from the current end");
  }
  {
    // Monthly after access ran out starts now.
    const buyerId = await makeBuyer("lapsed");
    await prisma.billingAccount.create({
      data: { accessExpiresAt: new Date(Date.now() - 86_400_000), accessStartsAt: new Date(Date.now() - 31 * 86_400_000), planCode: "monthly", status: "active", studentId: buyerId },
    });
    const { order } = await pay({ buyerId });
    const [event] = await accessEvents(order.id);
    assert.equal(event.kind, "grant");
    assert.equal(event.startsAt?.getTime(), event.occurredAt.getTime(), "starts now");
    assert.equal(event.endsAt?.getTime(), addCalendarMonths(event.occurredAt, 1).getTime());
    pass("monthly after expiry starts now");
  }
  {
    // Full Access ends on the exam date; with no date set it cannot be granted yet.
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    const { order } = await pay({ plan: "full" });
    const [event] = await accessEvents(order.id);
    assert.equal(event.planCode, "full_utbk");
    assert.equal(event.endsAt?.getTime(), FULL_END.getTime());
    assert.equal((await receiptOf(order.id))?.validUntil?.getTime(), FULL_END.getTime());
    pass("full access ends on the configured exam date");
  }
  {
    // Full Access keeps a later end the account already has.
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    const buyerId = await makeBuyer("later");
    const later = new Date("2030-01-01T00:00:00.000Z");
    await prisma.billingAccount.create({
      data: { accessExpiresAt: later, accessStartsAt: new Date(Date.now() - 86_400_000), planCode: "monthly", status: "active", studentId: buyerId },
    });
    const { order } = await pay({ buyerId, plan: "full" });
    const [event] = await accessEvents(order.id);
    assert.equal(event.endsAt?.getTime(), later.getTime(), "the later end is kept");
    assert.equal(event.planCode, "full_utbk");
    pass("full access keeps a later existing end");
  }
  {
    // Monthly while Full Access runs is refused at checkout, before any payment.
    const buyerId = await makeBuyer("fullactive");
    await prisma.billingAccount.create({
      data: { accessExpiresAt: new Date(Date.now() + 90 * 86_400_000), accessStartsAt: new Date(Date.now() - 86_400_000), planCode: "full_utbk", status: "active", studentId: buyerId },
    });
    const intent = await makeIntent(buyerId, 49_000, null);
    const refused = await createOrderFromIntent({
      buyerId, buyerIp: randomBuyerIp(), buyerIpExemption: null, buyerIpSource: "trusted-proxy:1",
      intent, packageCode: await getPackageCode(), provider,
    });
    assert.deepEqual(refused.ok ? null : refused.reason, "full_access_active");
    assert.equal(await prisma.paymentOrder.count({ where: { buyerId } }), 0, "no order exists");
    assert.equal(await prisma.riskReservation.count({ where: { userId: buyerId } }), 0, "no reservation exists");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.checkout.refused", actorUserId: buyerId } });
    assert.equal((audit.metadata as { reason?: string }).reason, "full_access_active");

    // Through the checkout form it comes back as a calm notice and nothing is written.
    const packageCode = await getPackageCode();
    const env = {
      APP_BASE_URL: APP_ORIGIN, DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test",
      PRICING_PACKAGE_CODE_FULL_MANDIRI: packageCode, PRICING_PACKAGE_CODE_FULL_UTBK: packageCode, PRICING_PACKAGE_CODE_MONTHLY: packageCode,
    } as unknown as NodeJS.ProcessEnv;
    const session: SessionContext = {
      expiresAt: new Date(Date.now() + 3_600_000), sessionId: `session-${buyerId}`,
      user: { email: `${buyerId}@example.test`, fullName: "Full", id: buyerId, mustChangePassword: false, onboardingStatus: null, roles: [RoleName.student], status: "active" },
    };
    const deps: CheckoutPayDeps = { env, getProvider: () => provider, getSession: async () => session, now: () => new Date("2026-11-20T10:00:00+07:00") };
    const response = await handleCheckoutPayPost(
      new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
        body: new URLSearchParams({ quoted_amount: "49000", quoted_month: "2026-11", key: randomUUID(), plan: "monthly", terms: PURCHASE_TERMS.version }).toString(),
        headers: { "content-type": "application/x-www-form-urlencoded", origin: APP_ORIGIN },
        method: "POST",
      }),
      deps,
    );
    assert.match(response.headers.get("location") ?? "", /notice=checkout-full-access/u);
    assert.equal(await prisma.paymentOrder.count({ where: { buyerId } }), 0);

    // Full Access is still sold to someone whose Full Access runs.
    const full = await makeIntent(buyerId, 200_000, null, { plan: "full" });
    const allowed = await createOrderFromIntent({
      buyerId, buyerIp: randomBuyerIp(), buyerIpExemption: null, buyerIpSource: "trusted-proxy:1",
      intent: full, packageCode, provider,
    });
    assert.ok(allowed.ok, "only Monthly is refused");
    pass("monthly is refused while full access runs");
  }

  // ---- A grant that cannot happen: paid, pending, retried, then flagged ----------------
  {
    delete process.env.FULL_ACCESS_ENDS_ON_UTBK;
    const { order } = await pay({ plan: "full" });
    const paid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(paid.status, "paid", "the money is recorded");
    assert.equal((await prisma.packagePurchase.count({ where: { providerReference: `order:${order.id}` } })), 1);
    assert.equal((await accessEvents(order.id)).length, 0, "nothing was granted");
    const receipt = (await receiptOf(order.id))!;
    assert.equal(receipt.deliveryStatus, "pending", "not fulfilled because money arrived");
    assert.equal(receipt.pendingReason, "full_end_not_configured");
    assert.equal(receipt.grantEventId, null);
    assert.equal((await jobs(order.id, "receipt_email")).length, 0, "no receipt email until access exists");
    assert.equal(await prisma.notification.count({ where: { sourceEntityId: receipt.id } }), 0, "no in-app receipt until access exists");
    const retryJobs = await jobs(order.id, "access_grant");
    assert.equal(retryJobs.length, 1, "a retry job is queued");
    assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.delivery_pending", targetId: order.id } }), 1);

    // The retry job fails while the date is missing, with backoff.
    const mail = mailer();
    const handlers = createPaymentOutboxHandlers({ alertTo: "ops@vecalss.test", sendEmail: mail.sendEmail });
    const filter = { dedupeKeyPrefix: `grant:${order.id}` };
    assert.deepEqual(await drainOutbox(handlers, { filter }), { dead: 0, done: 0, failed: 1 });
    assert.match((await prisma.paymentOutbox.findUniqueOrThrow({ where: { id: retryJobs[0].id } })).lastError ?? "", /pending \(full_end_not_configured\)/u);
    assert.equal((await receiptOf(order.id))?.deliveryStatus, "pending");
    assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.delivery_pending", targetId: order.id } }), 1, "the same reason is not audited twice");

    // Once the date is set, the next retry delivers: grant, receipt, notification, email job, no duplicates.
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    await prisma.$executeRaw`UPDATE payment_outbox SET next_run_at = now() - interval '1 second' WHERE id = ${retryJobs[0].id}::uuid`;
    assert.deepEqual(await drainOutbox(handlers, { filter }), { dead: 0, done: 1, failed: 0 });
    const delivered = (await receiptOf(order.id))!;
    assert.equal(delivered.deliveryStatus, "delivered");
    assert.equal(delivered.pendingReason, null);
    assert.equal((await accessEvents(order.id)).length, 1);
    assert.equal((await jobs(order.id, "receipt_email")).length, 1);
    assert.equal(await prisma.notification.count({ where: { sourceEntityId: delivered.id } }), 1);

    // Concurrent retries of a pending order deliver exactly once.
    delete process.env.FULL_ACCESS_ENDS_ON_UTBK;
    const racing = await pay({ plan: "full" });
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    const race = await Promise.all(Array.from({ length: 5 }, () => retryFulfillment(racing.order.id)));
    assert.equal(race.filter((item) => item.status === "delivered").length, 1, "one retry delivers");
    assert.equal(race.filter((item) => item.status === "already_delivered").length, 4);
    assert.equal((await accessEvents(racing.order.id)).length, 1);
    assert.equal(await prisma.notification.count({ where: { sourceEntityId: (await receiptOf(racing.order.id))!.id } }), 1);
    pass("a grant that cannot happen stays pending and is retried");
  }
  {
    // After one hour still pending: a capture_without_access case and a critical alert, once.
    delete process.env.FULL_ACCESS_ENDS_ON_UTBK;
    const fresh = await pay({ plan: "full" });
    const stale = await pay({ plan: "full" });
    await withTriggersOff("payment_receipts", (tx) =>
      tx.$executeRaw`UPDATE payment_receipts SET paid_at = now() - interval '2 hours' WHERE order_id = ${stale.order.id}::uuid`,
    );
    const caseFor = (orderId: string) => prisma.fraudCase.findMany({ where: { orderId, signal: "capture_without_access", state: { not: "closed" } } });

    assert.ok((await flagStalledFulfillments()) >= 1);
    assert.equal((await caseFor(fresh.order.id)).length, 0, "within the hour nothing is raised");
    const raised = await caseFor(stale.order.id);
    assert.equal(raised.length, 1);
    assert.equal(raised[0].severity, "critical");
    assert.equal(raised[0].userId, stale.order.buyerId);
    assert.equal((raised[0].evidence as { pendingReason?: string }).pendingReason, "full_end_not_configured");
    const alerts = await prisma.paymentOutbox.findMany({ where: { kind: "critical_alert", orderId: stale.order.id } });
    assert.equal(alerts.length, 1);
    assert.equal((alerts[0].payload as { kind?: string }).kind, "capture_without_access");

    // The maintenance step repeats safely: still one case, one alert.
    const result = await runFulfillmentMaintenance({ env: {} });
    assert.ok(result.flagged >= 1);
    assert.equal((await caseFor(stale.order.id)).length, 1);
    assert.equal((await prisma.paymentOutbox.findMany({ where: { kind: "critical_alert", orderId: stale.order.id } })).length, 1);

    const mail = mailer();
    const handlers = createPaymentOutboxHandlers({ alertTo: "ops@vecalss.test", sendEmail: mail.sendEmail });
    await drainOutbox(handlers, { filter: { dedupeKeyPrefix: `alert:stalled:${stale.order.id}` } });
    assert.equal(mail.calls.length, 1);
    assert.match(mail.calls[0].subject, /akses belum diberikan/u);
    assert.match(mail.calls[0].text, new RegExp(stale.order.id, "u"));
    assert.match(mail.calls[0].text, /tanggal akhir Full Access belum diatur/u);

    // Fixing the cause delivers it on the next maintenance run, with no manual step.
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    const healed = await runFulfillmentMaintenance({ env: FULL_END_ENV });
    assert.ok(healed.retried >= 2);
    assert.equal((await receiptOf(stale.order.id))?.deliveryStatus, "delivered");
    assert.equal((await receiptOf(fresh.order.id))?.deliveryStatus, "delivered");
    pass("pending after one hour opens a case and alerts once");
  }
  {
    // Paused access: the payment is kept, delivery waits for the resume.
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    const buyerId = await makeBuyer("paused");
    const admin = await makeAdminUser();
    await grantAccess({ actorUserId: admin, idempotencyKey: `seed-${randomUUID()}`, plan: "monthly", reason: "Akses awal untuk uji", source: "admin", studentId: buyerId });
    await pauseAccess({ actorUserId: admin, idempotencyKey: `pause-${randomUUID()}`, reason: "Sengketa terbuka untuk uji", source: "admin", studentId: buyerId });
    const { order } = await pay({ buyerId });
    assert.equal((await receiptOf(order.id))?.pendingReason, "paused");
    assert.equal((await accessEvents(order.id)).length, 0);
    await resumeAccess({ actorUserId: admin, idempotencyKey: `resume-${randomUUID()}`, reason: "Sengketa selesai untuk uji", source: "admin", studentId: buyerId });
    assert.equal((await retryFulfillment(order.id)).status, "delivered");
    assert.equal((await accessEvents(order.id)).length, 1);
    pass("paused access keeps the payment pending");
  }
  {
    // A failure inside the grant never takes the payment record with it.
    const order = await makeOrder();
    const broken = new Proxy({}, { get: () => { throw new Error("settings unreadable"); } }) as Record<string, string>;
    const { processPaymentEvent } = await import("../lib/payments/inbox");
    const event = signedEventFor(order, "payment.succeeded");
    const verified = provider.verifyAndParseEvent({ headers: new Headers(event.headers), now: new Date(), rawBody: event.body });
    assert.ok(verified.ok);
    const outcome = await processPaymentEvent({ adapter: provider, event: verified.event, fulfillment: { env: broken }, source: "webhook" });
    assert.equal(outcome.status, "processed");
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "paid");
    assert.equal((await receiptOf(order.id))?.pendingReason, null, "monthly never reads the settings, so it still delivered");
    // A full order does read them, and fails inside the savepoint.
    const full = await makeOrder({ plan: "full" });
    const fullEvent = signedEventFor(full, "payment.succeeded");
    const fullVerified = provider.verifyAndParseEvent({ headers: new Headers(fullEvent.headers), now: new Date(), rawBody: fullEvent.body });
    assert.ok(fullVerified.ok);
    const failed = await processPaymentEvent({ adapter: provider, event: fullVerified.event, fulfillment: { env: broken }, source: "webhook" });
    assert.equal(failed.status, "processed");
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: full.id } })).status, "paid", "paid despite the failed grant");
    assert.equal((await receiptOf(full.id))?.pendingReason, "grant_error");
    assert.equal((await jobs(full.id, "access_grant")).length, 1);
    pass("a failing grant keeps the payment");
  }

  // ---- Orders held for review get nothing ------------------------------------------------
  {
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    // A late success after a confirmed failure.
    const late = await makeOrder();
    await deliver(signedEventFor(late, "payment.failed"));
    await deliver(signedEventFor(late, "payment.succeeded"));
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: late.id } })).status, "review");
    // A buyer blocked after checkout began.
    const blocked = await makeOrder();
    const ownerEmail = `owner-${runId}@vecalss.local`;
    const ownerId = (await prisma.user.create({
      data: { email: ownerEmail, fullName: "Owner", passwordHash: "not-a-real-hash", roleAssignments: { create: [{ role: "admin" }] } },
      select: { id: true },
    })).id;
    const owner = requireOwner(
      {
        expiresAt: new Date(Date.now() + 3_600_000), sessionId: "s",
        user: { email: ownerEmail, fullName: "Owner", id: ownerId, mfaStatus: "verified", mustChangePassword: false, onboardingStatus: null, roles: [RoleName.admin], status: "active" },
      },
      { FRAUD_OWNER_EMAIL: ownerEmail },
    );
    await createManualBlock(owner, { reason: "Pembeli dilaporkan lewat saluran resmi", reasonCode: "payment_fraud", target: { type: "account", userId: blocked.buyerId } });
    await deliver(signedEventFor(blocked, "payment.succeeded"));
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: blocked.id } })).status, "review");
    // A second capture on a paid order.
    const { order: twice } = await pay();
    await deliver(signedEventFor(twice, "payment.succeeded", { providerPaymentId: `sip_${randomUUID().slice(0, 12)}` }));

    for (const held of [late, blocked]) {
      assert.equal((await accessEvents(held.id)).length, 0, "no grant");
      assert.equal(await prisma.paymentReceipt.count({ where: { orderId: held.id } }), 0, "no receipt");
      assert.equal((await jobs(held.id, "access_grant")).length, 0, "no retry either");
      assert.equal((await jobs(held.id, "receipt_email")).length, 0, "no receipt email");
      assert.equal(await prisma.billingAccount.count({ where: { studentId: held.buyerId } }), 0, "no access account was touched");
    }
    assert.equal((await accessEvents(twice.id)).length, 1, "a second capture does not grant again");
    assert.equal(await prisma.paymentReceipt.count({ where: { orderId: twice.id } }), 1);
    // And the maintenance retry never picks them up.
    await runFulfillmentMaintenance({ env: FULL_END_ENV });
    assert.equal((await accessEvents(late.id)).length + (await accessEvents(blocked.id)).length, 0);
    pass("orders held for review get no grant");
  }

  // ---- Terms agreement ------------------------------------------------------------------
  {
    const buyerId = await makeBuyer("terms");
    const packageCode = await getPackageCode();
    const env = {
      APP_BASE_URL: APP_ORIGIN, DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test",
      PRICING_PACKAGE_CODE_FULL_MANDIRI: packageCode, PRICING_PACKAGE_CODE_FULL_UTBK: packageCode, PRICING_PACKAGE_CODE_MONTHLY: packageCode,
    } as unknown as NodeJS.ProcessEnv;
    const session: SessionContext = {
      expiresAt: new Date(Date.now() + 3_600_000), sessionId: `session-${buyerId}`,
      user: { email: `${buyerId}@example.test`, fullName: "Terms", id: buyerId, mustChangePassword: false, onboardingStatus: null, roles: [RoleName.student], status: "active" },
    };
    const deps: CheckoutPayDeps = { env, getProvider: () => provider, getSession: async () => session, now: () => new Date("2026-11-20T10:00:00+07:00") };
    const post = (fields: Record<string, string>) =>
      handleCheckoutPayPost(
        new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
          body: new URLSearchParams({ quoted_amount: "49000", quoted_month: "2026-11", key: randomUUID(), plan: "monthly", ...fields }).toString(),
          headers: { "content-type": "application/x-www-form-urlencoded", origin: APP_ORIGIN, "x-forwarded-for": randomBuyerIp() },
          method: "POST",
        }),
        deps,
      );
    const footprint = async () => ({
      intents: await prisma.checkoutIntent.count({ where: { buyerId } }),
      orders: await prisma.paymentOrder.count({ where: { buyerId } }),
      reservations: await prisma.riskReservation.count({ where: { userId: buyerId } }),
    });

    for (const [label, fields] of [
      ["no agreement", {}],
      ["an empty agreement", { terms: "" }],
      ["an old version", { terms: "2020-01-01.1" }],
    ] as const) {
      const response = await post(fields);
      assert.match(response.headers.get("location") ?? "", /notice=checkout-terms/u, label);
      assert.deepEqual(await footprint(), { intents: 0, orders: 0, reservations: 0 }, `${label} writes nothing payable`);
    }

    const agreed = await post({ terms: PURCHASE_TERMS.version });
    assert.match(agreed.headers.get("location") ?? "", /\/pay\/stand-in\//u);
    const intent = await prisma.checkoutIntent.findFirstOrThrow({ where: { buyerId } });
    const order = await prisma.paymentOrder.findFirstOrThrow({ where: { buyerId } });
    assert.equal(intent.termsVersion, PURCHASE_TERMS.version);
    assert.equal(order.termsVersion, PURCHASE_TERMS.version, "the order stores the version");

    // The database repeats the rule for every other writer.
    const noTerms = await makeIntent(await makeBuyer("noterms"), 49_000, null, { termsVersion: null });
    const refused = await createOrderFromIntent({
      buyerId: noTerms.id ? (await prisma.checkoutIntent.findUniqueOrThrow({ where: { id: noTerms.id } })).buyerId : buyerId,
      buyerIp: randomBuyerIp(), buyerIpExemption: null, buyerIpSource: "trusted-proxy:1", intent: noTerms, packageCode, provider,
    });
    assert.deepEqual(refused.ok ? null : refused.reason, "terms_required");
    const rawBuyer = await makeBuyer("rawterms");
    const rawIntent = await makeIntent(rawBuyer, 49_000, null, { termsVersion: null });
    await assert.rejects(
      () => prisma.$executeRaw`
        INSERT INTO payment_orders (intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name,
          amount_rupiah, buyer_ip_source, buyer_ip_exemption, provider, provider_environment, provider_account, expires_at)
        VALUES (${rawIntent.id}::uuid, ${rawBuyer}::uuid, ${randomUUID()}, 'monthly', '2026-11', ${packageCode}, 'x',
          49000, 'unavailable', 'test-fixture', 'stand-in', 'local', 'stand-in-local', now() + interval '15 minutes')`,
      /needs the purchase terms/u,
    );
    // An order cannot claim a version its intent never recorded, and an intent's version cannot change.
    const mismatch = await makeIntent(await makeBuyer("mismatch"), 49_000, null);
    await assert.rejects(
      () => prisma.$executeRaw`
        INSERT INTO payment_orders (intent_id, buyer_id, reference, plan, pricing_month, package_code, package_name,
          amount_rupiah, buyer_ip_source, buyer_ip_exemption, terms_version, provider, provider_environment, provider_account, expires_at)
        SELECT ${mismatch.id}::uuid, buyer_id, ${randomUUID()}, 'monthly', '2026-11', ${packageCode}, 'x',
          49000, 'unavailable', 'test-fixture', 'another-version', 'stand-in', 'local', 'stand-in-local', now() + interval '15 minutes'
        FROM checkout_intents WHERE id = ${mismatch.id}::uuid`,
      /needs the purchase terms/u,
    );
    await assert.rejects(() => prisma.checkoutIntent.update({ data: { termsVersion: "changed" }, where: { id: mismatch.id } }), /cannot change/u);

    assert.equal(PURCHASE_TERMS.status, "draft", "the terms stay a draft until the owner approves them");
    await failLeftoverOrders();
    pass("terms agreement is required and stored");
  }

  // ---- Usage evidence ---------------------------------------------------------------------
  {
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    const { order } = await pay();
    const usage = () => prisma.fulfillmentUsageEvent.findMany({ orderBy: { jakartaDay: "asc" }, where: { orderId: order.id } });
    assert.equal((await usage()).length, 0, "nothing is recorded until the student really uses something");

    await Promise.all(Array.from({ length: 8 }, () => recordPaidUse(order.buyerId)));
    await recordPaidUse(order.buyerId);
    const rows = await usage();
    assert.equal(rows.length, 1, "at most once per grant per Jakarta day");
    const [event] = await accessEvents(order.id);
    assert.equal(rows[0].grantEventId, event.id);
    const [{ today }] = await prisma.$queryRaw<Array<{ today: string }>>`SELECT risk_jakarta_day(now())::text AS today`;
    assert.equal(rows[0].jakartaDay.toISOString().slice(0, 10), today);

    // The next Jakarta day records again, once.
    await withTriggersOff("fulfillment_usage_events", (tx) =>
      tx.$executeRaw`UPDATE fulfillment_usage_events SET jakarta_day = jakarta_day - 1 WHERE order_id = ${order.id}::uuid`,
    );
    await recordPaidUse(order.buyerId);
    await recordPaidUse(order.buyerId);
    assert.equal((await usage()).length, 2, "a new day adds one row");

    // Access an admin granted is not payment evidence: nothing is recorded.
    const adminBuyer = await makeBuyer("adminonly");
    await grantAccess({ actorUserId: await makeAdminUser(), idempotencyKey: `seed-${randomUUID()}`, plan: "monthly", reason: "Akses awal untuk uji", source: "admin", studentId: adminBuyer });
    await recordPaidUse(adminBuyer);
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { studentId: adminBuyer } }), 0);

    // Access that ran out records nothing.
    const expired = await pay();
    await withTriggersOff("billing_access_events", (tx) =>
      tx.$executeRaw`UPDATE billing_access_events SET ends_at = now() - interval '1 hour', starts_at = now() - interval '2 months' WHERE idempotency_key = ${`order:${expired.order.id}`}`,
    );
    await recordPaidUse(expired.order.buyerId);
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { orderId: expired.order.id } }), 0);

    // The paid-surface check is the hook, with the paywall off or on: the switch decides who is let in, not whether use is recorded.
    const surface = await pay();
    const rowsFor = (orderId: string) => prisma.fulfillmentUsageEvent.count({ where: { orderId } });
    assert.equal(await rowsFor(surface.order.id), 0, "nothing is recorded until a page view");
    assert.equal(await enterPaidSurface(surface.order.buyerId, {}), true, "switch off: everyone is let in");
    assert.equal(await enterPaidSurface(surface.order.buyerId, {}), true);
    assert.equal(await rowsFor(surface.order.id), 1, "switch off: a paid student's page view records one row");
    await withTriggersOff("fulfillment_usage_events", (tx) =>
      tx.$executeRaw`UPDATE fulfillment_usage_events SET jakarta_day = jakarta_day - 1 WHERE order_id = ${surface.order.id}::uuid`,
    );
    await enterPaidSurface(surface.order.buyerId, {});
    await enterPaidSurface(surface.order.buyerId, {});
    assert.equal(await rowsFor(surface.order.id), 2, "switch off: one row per day");
    assert.equal(await enterPaidSurface(surface.order.buyerId, { PAID_ACCESS_ENFORCED: "1" }), true);
    assert.equal(await rowsFor(surface.order.id), 2, "switch on: the same day adds nothing");
    const stranger = await makeBuyer("stranger");
    assert.equal(await enterPaidSurface(stranger, { PAID_ACCESS_ENFORCED: "1" }), false, "no access, no entry");
    assert.equal(await enterPaidSurface(stranger, {}), true, "switch off: still let in");
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { studentId: stranger } }), 0, "no payment grant, no use recorded, switch on or off");

    // Access an admin paused or revoked after the payment records nothing, switch on or off.
    const admin = await makeAdminUser();
    const paused = await pay();
    await pauseAccess({ actorUserId: admin, idempotencyKey: `pause-${randomUUID()}`, reason: "Sengketa terbuka untuk uji", source: "admin", studentId: paused.order.buyerId });
    await enterPaidSurface(paused.order.buyerId, {});
    await enterPaidSurface(paused.order.buyerId, { PAID_ACCESS_ENFORCED: "1" });
    assert.equal(await rowsFor(paused.order.id), 0, "paused access records nothing");
    await resumeAccess({ actorUserId: admin, idempotencyKey: `resume-${randomUUID()}`, reason: "Sengketa selesai untuk uji", source: "admin", studentId: paused.order.buyerId });
    await enterPaidSurface(paused.order.buyerId, {});
    assert.equal(await rowsFor(paused.order.id), 1, "resumed access records again");

    const revoked = await pay();
    await revokeAccess({ actorUserId: admin, idempotencyKey: `revoke-${randomUUID()}`, reason: "Pengembalian dana penuh untuk uji", source: "admin", studentId: revoked.order.buyerId });
    await enterPaidSurface(revoked.order.buyerId, {});
    await enterPaidSurface(revoked.order.buyerId, { PAID_ACCESS_ENFORCED: "1" });
    assert.equal(await rowsFor(revoked.order.id), 0, "revoked access records nothing");
    pass("usage evidence once per grant per day, never synthesized");
  }

  // ---- The records cannot be rewritten --------------------------------------------------------
  {
    const { order } = await pay();
    const receipt = (await receiptOf(order.id))!;
    await assert.rejects(() => prisma.$executeRaw`UPDATE payment_receipts SET amount_rupiah = 1 WHERE id = ${receipt.id}::uuid`, /snapshot cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE payment_receipts SET pending_reason = 'x' WHERE id = ${receipt.id}::uuid`, /delivered receipt cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM payment_receipts WHERE id = ${receipt.id}::uuid`, /never deleted/u);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM receipt_deliveries WHERE receipt_id = ${receipt.id}::uuid`, /append-only/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE receipt_deliveries SET outcome = 'failed' WHERE receipt_id = ${receipt.id}::uuid`, /append-only/u);
    await assert.rejects(() => prisma.$executeRaw`TRUNCATE fulfillment_usage_events`, /append-only/u);
    // Delivered needs its grant: a receipt cannot be marked delivered without one.
    process.env.FULL_ACCESS_ENDS_ON_UTBK = FULL_END_ENV.FULL_ACCESS_ENDS_ON_UTBK;
    delete process.env.FULL_ACCESS_ENDS_ON_UTBK;
    const pending = await pay({ plan: "full" });
    await assert.rejects(
      () => prisma.$executeRaw`UPDATE payment_receipts SET delivery_status = 'delivered' WHERE order_id = ${pending.order.id}::uuid`,
      /payment_receipts_delivery_check/u,
    );
    pass("receipts, attempts and usage are guarded");
  }

  await failLeftoverOrders();
  console.log(`Fulfilment checks passed: ${checks.join(", ")}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.FULL_ACCESS_ENDS_ON_UTBK;
    await prisma.$disconnect();
  });
