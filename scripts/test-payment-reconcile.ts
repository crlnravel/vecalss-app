import assert from "node:assert/strict";

import type { PaymentProviderAdapter } from "../lib/payments/adapter";
import { reconcileOpenOrders, reconcileOrderByReference } from "../lib/payments/reconcile";
import { deliver, makeOrder, prisma, provider, signedEventFor } from "./payment-test-kit";

/**
 * Reconciliation: orders still open past their expiry are resolved from the
 * provider's own account of the payment, through the same decision code as a
 * webhook. Our clock passing the expiry never expires an order by itself.
 */

const LIMIT = { limit: 500 };

const statusOf = async (id: string) => (await prisma.paymentOrder.findUniqueOrThrow({ where: { id } })).status;
const setProviderState = (reference: string, state: "failed" | "pending" | "succeeded", options: { extendExpiry?: boolean } = {}) =>
  prisma.$executeRaw`
    UPDATE stand_in_payments
    SET state = ${state},
        settled_at = CASE WHEN ${state} = 'pending' THEN NULL ELSE now() END,
        expires_at = CASE WHEN ${options.extendExpiry ?? false} THEN now() + interval '1 hour' ELSE expires_at END
    WHERE reference = ${reference}`;

async function main() {
  // Orders whose time to pay has run out, each in a different place at the provider.
  const lostWebhook = await makeOrder({ pastExpiry: true, referral: true, session: true });
  const providerFailed = await makeOrder({ pastExpiry: true, session: true });
  const providerExpired = await makeOrder({ pastExpiry: true, session: true });
  const stillOpen = await makeOrder({ pastExpiry: true, session: true });
  const neverCreated = await makeOrder({ pastExpiry: true, session: false });
  const mismatched = await makeOrder({ pastExpiry: true, session: true });
  const providerDown = await makeOrder({ pastExpiry: true, session: true });
  const notDueYet = await makeOrder({ session: true });

  await setProviderState(lostWebhook.reference, "succeeded");
  await setProviderState(providerFailed.reference, "failed");
  // providerExpired: left pending with an expiry in the past, which the provider reports as expired.
  await setProviderState(stillOpen.reference, "pending", { extendExpiry: true });
  await prisma.$executeRaw`UPDATE stand_in_payments SET amount_rupiah = 1 WHERE reference = ${mismatched.reference}`;
  await setProviderState(mismatched.reference, "succeeded");

  const flaky: PaymentProviderAdapter = {
    createSession: (request) => provider.createSession(request),
    environment: provider.environment,
    getStatus: async (reference) => {
      if (reference === providerDown.reference) throw new Error("provider unreachable");
      return provider.getStatus(reference);
    },
    id: provider.id,
    merchantAccount: provider.merchantAccount,
    verifyAndParseEvent: (input) => provider.verifyAndParseEvent(input),
  };

  const first = await reconcileOpenOrders(flaky, LIMIT);
  assert.ok(first.checked >= 7, "every order past its expiry was looked at");
  assert.ok(first.stillPending >= 1);
  assert.ok(first.unavailable >= 1);
  assert.ok(first.resolved >= 5);

  // A webhook that never arrived is made up for.
  assert.equal(await statusOf(lostWebhook.id), "paid");
  const purchase = await prisma.packagePurchase.findUniqueOrThrow({ where: { providerReference: `order:${lostWebhook.id}` } });
  assert.equal(purchase.status, "succeeded");
  assert.equal(purchase.affiliatorProfileId, lostWebhook.affiliatorProfileId, "the affiliator still sees the conversion");
  assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.paid", targetId: lostWebhook.id } }), 1);
  const reconciledEvent = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: lostWebhook.id } });
  assert.equal(reconciledEvent.source, "reconciliation");
  assert.equal(reconciledEvent.outcome, "accepted");
  assert.equal(await prisma.paymentOutbox.count({ where: { kind: "receipt_email", orderId: lostWebhook.id } }), 1);

  assert.equal(await statusOf(providerFailed.id), "failed");
  assert.equal(await statusOf(providerExpired.id), "expired");
  assert.equal(await statusOf(neverCreated.id), "expired", "no payment exists at the provider, so none can settle");
  assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: neverCreated.id } })).statusReason, null);

  // The provider still holds the payment open: our own clock does not decide.
  assert.equal(await statusOf(stillOpen.id), "pending");
  // The provider's account does not match the order: held, not paid.
  assert.equal(await statusOf(mismatched.id), "pending");
  const held = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: mismatched.id } });
  assert.equal(held.outcome, "quarantined");
  assert.equal(held.reason, "amount");
  assert.equal(await prisma.paymentOutbox.count({ where: { kind: "critical_alert", orderId: mismatched.id } }), 1);
  // An unreachable provider changes nothing and does not stop the others.
  assert.equal(await statusOf(providerDown.id), "pending");
  // Not past its expiry: not even asked.
  assert.equal(await statusOf(notDueYet.id), "pending");
  assert.equal(await prisma.paymentEvent.count({ where: { orderId: notDueYet.id } }), 0);

  // ---- Running it again changes nothing already decided ----------------------------------
  const counts = async (id: string) => ({
    audits: await prisma.auditLog.count({ where: { targetId: id } }),
    events: await prisma.paymentEvent.count({ where: { orderId: id } }),
    outbox: await prisma.paymentOutbox.count({ where: { orderId: id } }),
  });
  const beforeAgain = await Promise.all([lostWebhook, providerFailed, providerExpired, neverCreated].map((order) => counts(order.id)));
  await reconcileOpenOrders(provider, LIMIT);
  assert.deepEqual(
    await Promise.all([lostWebhook, providerFailed, providerExpired, neverCreated].map((order) => counts(order.id))),
    beforeAgain,
  );
  // The mismatched one is looked at again, and the same finding is the same event: still one record.
  assert.equal(await prisma.paymentEvent.count({ where: { orderId: mismatched.id } }), 1);
  assert.equal(await statusOf(providerDown.id), "expired", "back up, the provider says expired");

  // ---- The webhook that arrives after reconciliation is no second payment ----------------
  const lostWebhookPaid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: lostWebhook.id } });
  const lateWebhook = await deliver(signedEventFor(lostWebhookPaid, "payment.succeeded"));
  assert.equal(lateWebhook.status === "received" && lateWebhook.result.status === "processed" && lateWebhook.result.outcome, "ignored");
  assert.equal(await prisma.packagePurchase.count({ where: { studentId: lostWebhook.buyerId } }), 1);

  // ---- A payment captured after reconciliation expired the order goes to review ----------
  const lateAfterExpiry = await deliver(signedEventFor(
    await prisma.paymentOrder.findUniqueOrThrow({ where: { id: providerExpired.id } }),
    "payment.succeeded",
  ));
  assert.equal(lateAfterExpiry.status === "received" && lateAfterExpiry.result.status === "processed" && lateAfterExpiry.result.outcome, "review");
  assert.equal(await statusOf(providerExpired.id), "review");
  assert.equal(await prisma.packagePurchase.count({ where: { studentId: providerExpired.buyerId } }), 0);

  // ---- A buyer looking at their own order resolves it now ------------------------------------
  const viewing = await makeOrder({ pastExpiry: true, session: true });
  await setProviderState(viewing.reference, "failed");
  assert.equal(await reconcileOrderByReference(viewing.reference, provider), "resolved");
  assert.equal(await statusOf(viewing.id), "failed");
  assert.equal(await reconcileOrderByReference(viewing.reference, provider), "unchanged", "already decided");
  assert.equal(await reconcileOrderByReference(notDueYet.reference, provider), "unchanged", "not past its expiry");

  // ---- Settle the leftovers so nothing stays open in the shared database ---------------------
  await setProviderState(stillOpen.reference, "failed");
  await reconcileOpenOrders(provider, LIMIT);
  assert.equal(await statusOf(stillOpen.id), "failed");
  assert.equal(await statusOf(mismatched.id), "pending", "a held payment stays held while the provider disagrees");

  // Once the provider's account agrees with the order, the corrected finding is decided afresh.
  await prisma.$executeRaw`UPDATE stand_in_payments SET amount_rupiah = ${mismatched.amountRupiah} WHERE reference = ${mismatched.reference}`;
  await reconcileOpenOrders(provider, LIMIT);
  assert.equal(await statusOf(mismatched.id), "paid");
  assert.deepEqual(
    (await prisma.paymentEvent.findMany({ where: { orderId: mismatched.id }, orderBy: { receivedAt: "asc" } })).map((event) => event.outcome),
    ["quarantined", "accepted"],
    "both findings are kept",
  );

  console.log("Payment reconciliation checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
