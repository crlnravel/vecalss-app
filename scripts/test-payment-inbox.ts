import assert from "node:assert/strict";

import { signStandInEvent } from "../lib/payments/stand-in/signing";
import {
  TEST_SECRET,
  deliver,
  getReferral,
  makeOrder,
  prisma,
  signedEventFor,
  snapshotOf,
} from "./payment-test-kit";

/**
 * Commerce behavior tests 3 and 4 against the stand-in provider: signature and
 * freshness, duplicate and out-of-order events, mismatches, late success, the
 * atomic accepted transition, and the database's own protection of orders and
 * events.
 */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function rejectsWithDatabase(run: () => Promise<unknown>, message: RegExp, label: string) {
  await assert.rejects(run, (error: unknown) => {
    assert.match(String(error), message, label);
    return true;
  });
}

async function main() {
  // ---- 1. Signature and freshness ----------------------------------------
  {
    const order = await makeOrder();
    const before = await snapshotOf(order.id);
    const good = signedEventFor(order, "payment.succeeded");

    const forged = signStandInEvent("some-other-secret", good.body, new Date());
    assert.deepEqual(await deliver({ body: good.body, headers: forged }), { reason: "bad_signature", status: "refused" }, "wrong key");

    const tampered = signedEventFor(order, "payment.succeeded");
    const text = new TextDecoder().decode(tampered.body).replace(`"amount":${order.amountRupiah}`, `"amount":1`);
    assert.notEqual(text, new TextDecoder().decode(tampered.body));
    assert.deepEqual(
      await deliver({ body: new TextEncoder().encode(text), headers: tampered.headers }),
      { reason: "bad_signature", status: "refused" },
      "body changed after signing",
    );

    // Same body, re-serialized with different whitespace: the signature is over the exact bytes.
    const spaced = new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(good.body)), null, 2));
    assert.deepEqual(await deliver({ body: spaced, headers: good.headers }), { reason: "bad_signature", status: "refused" }, "re-serialized");

    for (const headers of [{}, { "x-stand-in-signature": "v1=" }, { "x-stand-in-timestamp": "1" }] as Array<Record<string, string>>) {
      assert.equal((await deliver({ body: good.body, headers })).status, "refused", JSON.stringify(headers));
    }

    // Right key, wrong time: refused as stale in both directions.
    for (const [label, at] of [["10 minutes old", minutesAgo(10)], ["10 minutes ahead", minutesAgo(-10)]] as const) {
      const old = signedEventFor(order, "payment.succeeded", { at });
      assert.deepEqual(await deliver(old), { reason: "stale", status: "refused" }, label);
    }
    // A fresh timestamp pasted onto an old signature does not verify either.
    const replay = signedEventFor(order, "payment.succeeded", { at: minutesAgo(10) });
    const freshStamp = { ...replay.headers, "x-stand-in-timestamp": String(Math.floor(Date.now() / 1000)) };
    assert.equal((await deliver({ body: replay.body, headers: freshStamp })).status, "refused");

    // Within the window is fine; nothing was written by any refusal.
    assert.deepEqual(await snapshotOf(order.id), before, "refused requests leave no trace");
    const slightlyOld = await deliver(signedEventFor(order, "payment.failed", { at: minutesAgo(4) }));
    assert.equal(slightlyOld.status, "received");

    // Malformed but correctly signed.
    const junk = new TextEncoder().encode("{not json");
    assert.deepEqual(
      await deliver({ body: junk, headers: signStandInEvent(TEST_SECRET, junk, new Date()) }),
      { reason: "malformed", status: "refused" },
    );
    const shapeless = new TextEncoder().encode(JSON.stringify({ id: "x" }));
    assert.deepEqual(
      await deliver({ body: shapeless, headers: signStandInEvent(TEST_SECRET, shapeless, new Date()) }),
      { reason: "malformed", status: "refused" },
    );
  }

  // ---- 2. Accepted payment: one transaction, everything or nothing --------
  {
    const referral = await getReferral();
    const order = await makeOrder({ referral: true });
    assert.equal(order.status, "pending");
    assert.equal(order.affiliatorProfileId, referral.id);
    const event = signedEventFor(order, "payment.succeeded");
    const received = await deliver(event, "198.51.100.9");
    assert.deepEqual(received, {
      result: { orderId: order.id, outcome: "accepted", reason: null, status: "processed" },
      status: "received",
    });

    const paid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(paid.status, "paid");
    assert.ok(paid.paidAt && paid.packagePurchaseId);
    const purchase = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: paid.packagePurchaseId } });
    assert.equal(purchase.status, "succeeded");
    assert.equal(purchase.provenance, "order");
    assert.equal(purchase.studentId, order.buyerId);
    assert.equal(purchase.packageCode, order.packageCode);
    assert.equal(purchase.packageName, order.packageName);
    assert.equal(purchase.affiliatorProfileId, referral.id, "the affiliator's conversion is kept");
    assert.equal(purchase.referralCodeSnapshot, referral.referralCode);
    assert.ok(purchase.completedAt);

    const audits = await prisma.auditLog.findMany({ where: { action: "payment.order.paid", targetId: order.id } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].ipAddress, "198.51.100.9", "the provider's address is kept apart from the buyer's");
    const jobs = await prisma.paymentOutbox.findMany({ where: { orderId: order.id } });
    assert.deepEqual(jobs.map((job) => [job.kind, job.status]), [["receipt_email", "pending"]]);
    const [stored] = await prisma.paymentEvent.findMany({ where: { orderId: order.id } });
    assert.equal(stored.outcome, "accepted");
    assert.equal(stored.source, "webhook");
    assert.equal(stored.amountRupiah, order.amountRupiah);
    assert.equal(stored.bodySha256?.length, 64);
    assert.equal(stored.receivedAt.getTime() - paid.paidAt.getTime() < 5_000, true);
    const baseline = await snapshotOf(order.id);

    // ---- 3. Duplicates and out-of-order events change nothing -------------
    assert.deepEqual(await deliver(event), { result: { status: "duplicate" }, status: "received" }, "same event again");
    assert.deepEqual(await snapshotOf(order.id), baseline);

    const concurrent = await Promise.all(Array.from({ length: 5 }, () => deliver(event)));
    assert.ok(concurrent.every((result) => result.status === "received" && result.result.status === "duplicate"));

    // The same payment reported by a different delivery (for example a reconciliation) is no second capture.
    const again = await deliver(signedEventFor(order, "payment.succeeded"));
    assert.equal(again.status === "received" && again.result.status === "processed" && again.result.outcome, "ignored");
    for (const kind of ["payment.failed", "payment.expired"] as const) {
      const late = await deliver(signedEventFor(order, kind));
      assert.equal(late.status === "received" && late.result.status === "processed" && late.result.outcome, "ignored", kind);
    }
    const afterNoise = await snapshotOf(order.id);
    assert.equal(afterNoise.order.status, "paid", "reordered events cannot undo a payment");
    assert.equal(afterNoise.purchases, 1);
    assert.equal(afterNoise.audits, baseline.audits, "no new transition, no new domain audit");
    assert.equal(afterNoise.outbox, baseline.outbox);
    assert.equal(afterNoise.events, baseline.events + 3, "each distinct delivery is still kept as evidence");

    // An unexpected second capture is recorded for review, never merged or dropped.
    const second = await deliver(signedEventFor(order, "payment.succeeded", { providerPaymentId: "sip_second_capture" }));
    assert.equal(second.status === "received" && second.result.status === "processed" && second.result.outcome, "review");
    const afterSecond = await snapshotOf(order.id);
    assert.equal(afterSecond.order.status, "paid", "the first payment stands");
    assert.equal(afterSecond.purchases, 1, "one purchase, one conversion");
    const kept = await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: order.id, reason: "second_capture" } });
    assert.equal(kept.providerPaymentId, "sip_second_capture", "the capture is kept");
    assert.equal(await prisma.paymentOutbox.count({ where: { dedupeKey: `alert:event:${kept.id}` } }), 1);

    // A different payment id with a wrong amount is still a mismatch, not a second capture.
    const odd = await deliver(signedEventFor(order, "payment.succeeded", { amountRupiah: 3, providerPaymentId: "sip_third" }));
    assert.equal(odd.status === "received" && odd.result.status === "processed" && odd.result.outcome, "quarantined");
  }

  // ---- 4. Concurrent first deliveries decide once -------------------------
  {
    const order = await makeOrder();
    const event = signedEventFor(order, "payment.succeeded");
    const results = await Promise.all(Array.from({ length: 6 }, () => deliver(event)));
    const processed = results.filter((result) => result.status === "received" && result.result.status === "processed");
    assert.equal(processed.length, 1, "exactly one delivery decides");
    const snapshot = await snapshotOf(order.id);
    assert.equal(snapshot.order.status, "paid");
    assert.equal(snapshot.purchases, 1);
    assert.equal(snapshot.events, 1);
    assert.equal(snapshot.audits, 3, "created, paid, and delivered");
    assert.equal(snapshot.outbox, 1);
  }

  // ---- 5. Mismatches are quarantined, never accepted ----------------------
  {
    const cases: Array<[string, (order: Awaited<ReturnType<typeof makeOrder>>) => ReturnType<typeof signedEventFor>, string]> = [
      ["amount", (order) => signedEventFor(order, "payment.succeeded", { amountRupiah: order.amountRupiah - 1000 }), "amount"],
      ["currency", (order) => signedEventFor(order, "payment.succeeded", { currency: "USD" }), "currency"],
      ["buyer", (order) => signedEventFor(order, "payment.succeeded", { buyerId: "someone-else" }), "buyer"],
      ["package", (order) => signedEventFor(order, "payment.succeeded", { packageCode: "OTHER-PACKAGE" }), "package"],
      ["merchant account", (order) => signedEventFor(order, "payment.succeeded", { account: "another-merchant" }), "merchant"],
      ["environment", (order) => signedEventFor(order, "payment.succeeded", { environment: "production" }), "merchant"],
      ["payment id", (order) => signedEventFor(order, "payment.succeeded", { providerPaymentId: "sip_not_ours" }), "payment"],
      ["amount and buyer", (order) => signedEventFor(order, "payment.succeeded", { amountRupiah: 1, buyerId: "x" }), "amount,buyer"],
      ["a failure with the wrong amount", (order) => signedEventFor(order, "payment.failed", { amountRupiah: 5 }), "amount"],
    ];
    for (const [label, forge, reason] of cases) {
      const order = await makeOrder();
      const before = await snapshotOf(order.id);
      const result = await deliver(forge(order));
      assert.equal(
        result.status === "received" && result.result.status === "processed" && result.result.outcome,
        "quarantined",
        label,
      );
      const after = await snapshotOf(order.id);
      assert.equal(after.order.status, "pending", `${label}: the order is untouched`);
      assert.equal(after.purchases, 0, `${label}: no purchase`);
      assert.equal(after.order.packagePurchaseId, null);
      const [event] = await prisma.paymentEvent.findMany({ where: { orderId: order.id } });
      assert.equal(event.outcome, "quarantined", label);
      assert.equal(event.reason, reason, label);
      assert.equal(await prisma.auditLog.count({ where: { action: "payment.event.quarantined", targetId: order.id } }), 1, label);
      const alerts = await prisma.paymentOutbox.findMany({ where: { kind: "critical_alert", orderId: order.id } });
      assert.equal(alerts.length, 1, `${label}: a critical alert is queued`);
      assert.equal(after.outbox, before.outbox + 1);
    }

    // An unknown reference has no order to attach to, but is stored and alerted.
    const stray = signedEventFor(
      { amountRupiah: 49_000, buyerId: "x", currency: "IDR", packageCode: "P", providerReference: "sip_x", reference: `nope-${Date.now()}` },
      "payment.succeeded",
    );
    const strayResult = await deliver(stray);
    assert.equal(strayResult.status === "received" && strayResult.result.status === "processed" && strayResult.result.outcome, "quarantined");
    const [strayEvent] = await prisma.paymentEvent.findMany({ where: { orderId: null, reason: "unknown_order" }, orderBy: { receivedAt: "desc" }, take: 1 });
    assert.ok(strayEvent);
    assert.equal(await prisma.paymentOutbox.count({ where: { dedupeKey: `alert:event:${strayEvent.id}` } }), 1);

    // A quarantined event does not block the real one, which is a different delivery.
    const order = await makeOrder();
    await deliver(signedEventFor(order, "payment.succeeded", { amountRupiah: 2 }));
    const real = await deliver(signedEventFor(order, "payment.succeeded"));
    assert.equal(real.status === "received" && real.result.status === "processed" && real.result.outcome, "accepted");
  }

  // ---- 6. Late success after a confirmed expiry goes to review ------------
  {
    const order = await makeOrder();
    const expired = await deliver(signedEventFor(order, "payment.expired"));
    assert.equal(expired.status === "received" && expired.result.status === "processed" && expired.result.outcome, "expired");
    assert.equal((await snapshotOf(order.id)).order.status, "expired");

    const late = await deliver(signedEventFor(order, "payment.succeeded"));
    assert.equal(late.status === "received" && late.result.status === "processed" && late.result.outcome, "review");
    const after = await snapshotOf(order.id);
    assert.equal(after.order.status, "review");
    assert.equal(after.order.statusReason, "late_success_after_expired");
    assert.equal(after.order.paidAt, null, "never auto-accepted");
    assert.equal(after.order.packagePurchaseId, null);
    assert.equal(after.purchases, 0, "no purchase summary, so no conversion and no access");
    assert.equal(await prisma.paymentOutbox.count({ where: { kind: "receipt_email", orderId: order.id } }), 0);
    assert.equal(await prisma.paymentOutbox.count({ where: { kind: "critical_alert", orderId: order.id } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.review", targetId: order.id } }), 1);
    const kept = await prisma.paymentEvent.findMany({ where: { orderId: order.id }, orderBy: { receivedAt: "asc" } });
    assert.deepEqual(kept.map((event) => event.outcome), ["expired", "review"], "the capture is kept as evidence");

    // Success after a failure is treated the same way, and a repeat of it is a duplicate.
    const failed = await makeOrder();
    await deliver(signedEventFor(failed, "payment.failed"));
    const lateAfterFailure = await deliver(signedEventFor(failed, "payment.succeeded"));
    assert.equal(lateAfterFailure.status === "received" && lateAfterFailure.result.status === "processed" && lateAfterFailure.result.outcome, "review");
    assert.equal((await snapshotOf(failed.id)).order.statusReason, "late_success_after_failed");
    const repeat = await deliver(signedEventFor(failed, "payment.succeeded"));
    assert.equal(repeat.status === "received" && repeat.result.status === "processed" && repeat.result.outcome, "ignored");

    // A failure or expiry changes only a pending order.
    const reviewed = await deliver(signedEventFor(failed, "payment.expired"));
    assert.equal(reviewed.status === "received" && reviewed.result.status === "processed" && reviewed.result.outcome, "ignored");
    assert.equal((await snapshotOf(failed.id)).order.status, "review");
  }

  // ---- 7. Delayed outcomes use the order's own snapshots ------------------
  {
    const referral = await getReferral();
    const order = await makeOrder({ referral: true });
    const buyerBefore = await prisma.user.findUniqueOrThrow({ select: { status: true }, where: { id: order.buyerId } });
    const packageBefore = await prisma.tryoutPackage.findFirstOrThrow({ select: { id: true, status: true, title: true }, where: { code: order.packageCode } });
    try {
      await prisma.affiliatorProfile.update({ data: { isActive: false }, where: { id: referral.id } });
      await prisma.user.update({ data: { status: "disabled" }, where: { id: order.buyerId } });
      await prisma.tryoutPackage.update({ data: { title: `${packageBefore.title} (renamed)` }, where: { id: packageBefore.id } });

      const result = await deliver(signedEventFor(order, "payment.succeeded"));
      assert.equal(result.status === "received" && result.result.status === "processed" && result.result.outcome, "accepted", "a real capture is never discarded");
      const purchase = await prisma.packagePurchase.findUniqueOrThrow({ where: { providerReference: `order:${order.id}` } });
      assert.equal(purchase.status, "succeeded");
      assert.equal(purchase.packageName, order.packageName, "the title snapshotted on the order, not the renamed one");
      assert.equal(purchase.affiliatorProfileId, referral.id);
      assert.equal(purchase.referralCodeSnapshot, referral.referralCode);
    } finally {
      await prisma.affiliatorProfile.update({ data: { isActive: true }, where: { id: referral.id } });
      await prisma.user.update({ data: { status: buyerBefore.status }, where: { id: order.buyerId } });
      await prisma.tryoutPackage.update({ data: { title: packageBefore.title }, where: { id: packageBefore.id } });
    }
  }

  // ---- 8. Atomic: a failure anywhere rolls the whole payment back ---------
  {
    const order = await makeOrder();
    const before = await snapshotOf(order.id);
    // A purchase row already holds the reference the accepted transition needs.
    await prisma.$executeRaw`
      INSERT INTO package_purchases (student_id, package_code, package_name, status, provider_reference)
      VALUES (${order.buyerId}::uuid, ${order.packageCode}, 'blocker', 'pending', ${`order:${order.id}`})
    `;
    try {
      await assert.rejects(() => deliver(signedEventFor(order, "payment.succeeded")));
      const after = await snapshotOf(order.id);
      assert.equal(after.order.status, "pending", "the order did not move");
      assert.equal(after.events, before.events, "the event row rolled back, so the provider's retry is decided afresh");
      assert.equal(after.audits, before.audits);
      assert.equal(after.outbox, before.outbox);
    } finally {
      await prisma.packagePurchase.deleteMany({ where: { providerReference: `order:${order.id}` } });
    }
    const retried = await deliver(signedEventFor(order, "payment.succeeded"));
    assert.equal(retried.status === "received" && retried.result.status === "processed" && retried.result.outcome, "accepted");
  }

  // ---- 9. The database refuses to rewrite financial records ---------------
  {
    const order = await makeOrder();
    await deliver(signedEventFor(order, "payment.succeeded"));
    const protectedOrder = (sql: string) => prisma.$executeRawUnsafe(sql, order.id);
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET amount_rupiah = 1 WHERE id = $1::uuid`), /snapshot cannot be changed/u, "amount");
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET buyer_id = id WHERE id = $1::uuid`), /snapshot cannot be changed/u, "buyer");
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET expires_at = expires_at + interval '1 day' WHERE id = $1::uuid`), /snapshot cannot be changed/u, "expiry");
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET status = 'pending' WHERE id = $1::uuid`), /cannot move from paid to pending/u, "paid to pending");
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET status = 'review' WHERE id = $1::uuid`), /cannot move from paid to review/u, "paid to review");
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET package_purchase_id = NULL WHERE id = $1::uuid`), /paid|link/u, "unlink the purchase");
    await rejectsWithDatabase(() => protectedOrder(`DELETE FROM payment_orders WHERE id = $1::uuid`), /never deleted/u, "delete");
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`TRUNCATE payment_orders CASCADE`), /append-only/u, "truncate");
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`UPDATE payment_events SET outcome = 'ignored' WHERE order_id = $1::uuid`, order.id), /append-only/u, "event update");
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`DELETE FROM payment_events WHERE order_id = $1::uuid`, order.id), /append-only/u, "event delete");
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`TRUNCATE payment_events`), /append-only|cannot truncate a table referenced/u, "event truncate");
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`DELETE FROM payment_outbox WHERE order_id = $1::uuid`, order.id), /append-only/u, "outbox delete");

    // Paid is impossible without its purchase summary, and a pending order cannot be marked paid by hand.
    const pending = await makeOrder();
    await rejectsWithDatabase(() => protectedOrder(`UPDATE payment_orders SET status = 'paid', paid_at = now() WHERE id = '${pending.id}'::uuid AND $1::uuid IS NOT NULL`), /check constraint|paid_complete/u, "paid without a purchase");
    // Amount and currency are constrained at the source.
    await rejectsWithDatabase(
      () => prisma.$executeRawUnsafe(`UPDATE payment_orders SET session_attempts = -1 WHERE id = $1::uuid`, pending.id),
      /session_attempts|only increase|check/u,
      "attempts cannot go down",
    );
    // What may move still moves: the session link is set once.
    await prisma.$executeRawUnsafe(`UPDATE payment_orders SET updated_at = now() WHERE id = $1::uuid`, pending.id);
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`UPDATE payment_orders SET session_url = 'https://other.example/' WHERE id = $1::uuid`, pending.id), /link cannot be replaced/u, "replace the session");
    await rejectsWithDatabase(() => prisma.$executeRawUnsafe(`UPDATE payment_orders SET provider_reference = 'sip_other' WHERE id = $1::uuid`, pending.id), /link cannot be replaced/u, "replace the payment id");
  }

  console.log("Payment inbox checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
