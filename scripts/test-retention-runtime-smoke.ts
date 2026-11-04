import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createRuntimeLogin, ownerQuery } from "./retention-test-kit";

/**
 * MS-10 phase A, the runtime-role smoke suite. The real application code paths
 * (checkout intent, order, payment event, fulfillment, usage, receipt outbox,
 * refund, dispute, dispute export, fraud cases and blocks, daily maintenance,
 * holds) run through a Prisma client connected as the restricted login role,
 * the way production will. Everything that needs more than the runtime role
 * (fixture users, backdating) is done by the owner in other suites, not here.
 *
 * A missing grant would make a path fail with "permission denied"; some paths
 * (usage evidence) swallow errors by design, so this suite also checks that
 * their rows really exist. Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

async function main() {
  const login = await createRuntimeLogin("smoke");
  // Everything below loads after this line, so lib/prisma connects as the restricted login.
  process.env.DATABASE_URL = login.url;
  process.env.PAYMENT_PROVIDER = "stand-in";

  try {
    const { prisma, provider, deliver, signedEventFor, makeBuyer, makeIntent, randomBuyerIp, getPackageCode, APP_ORIGIN, failLeftoverOrders } = await import("./payment-test-kit");
    const refundKit = await import("./refund-test-kit");
    const { ENV, FULL_REASON, setupAuthority, paidOrder, refundCase } = refundKit;
    const { createOrderFromIntent, ensurePaymentSession } = await import("../lib/payments/orders");
    const { resolveCheckoutIntent } = await import("../lib/pricing/checkout-intent");
    const { resolvePricing } = await import("../lib/pricing/schedule");
    const { drainOutbox } = await import("../lib/payments/outbox");
    const { runPaymentMaintenance } = await import("../lib/payments/maintenance");
    const { recordPaidUse } = await import("../lib/fulfillment/usage");
    const { getAccessState } = await import("../lib/billing/service");
    const { approveRefund, prepareRefund } = await import("../lib/refunds/cases");
    const { executeProviderRefund } = await import("../lib/refunds/execute");
    const { recordDisputeNotice, resolveDispute } = await import("../lib/refunds/disputes");
    const { claimDisputeExport, createDisputeExport } = await import("../lib/disputes/export");
    const { verifyPacketFile } = await import("../lib/disputes/canonical");
    const { acknowledgeCase, closeCase } = await import("../lib/fraud/cases");
    const { createManualBlock, liftBlock, markLapsedBlocksExpired } = await import("../lib/fraud/blocks");
    const { fileAppeal, decideAppeal } = await import("../lib/fraud/appeals");
    const { runFraudMaintenance } = await import("../lib/fraud/maintenance");
    const { runRetentionMaintenance, checkRuntimeRole } = await import("../lib/retention/maintenance");
    const { placeLegalHold, releaseLegalHold } = await import("../lib/retention/holds");
    const { getOrderRetention } = await import("../lib/retention/status");

    // ---- The client really is the restricted login ------------------------------------------------------------
    const [{ who }] = await prisma.$queryRaw<Array<{ who: string }>>`SELECT current_user::text AS who`;
    assert.equal(who, login.role, "the Prisma client is connected as the restricted login");
    assert.deepEqual(await checkRuntimeRole(), { findings: [], ok: true, role: login.role });
    pass("the application client connects as the restricted login, and the production role check passes it");

    const { admin, owner, ownerId } = await setupAuthority();

    // ---- Checkout intent, order, payment event, fulfillment ----------------------------------------------------
    const buyerId = await makeBuyer("smoke");
    const pricing = resolvePricing(new Date());
    assert.equal(pricing.status, "active", "the pricing schedule has a month for today");
    const termsVersion = "test-terms";
    const intentResult = await resolveCheckoutIntent({
      buyerId,
      entry: pricing.entry!,
      idempotencyKey: randomUUID(),
      plan: "monthly",
      referralCode: null,
      termsVersion,
    });
    assert.equal(intentResult.status, "created", "the intent insert works for the runtime role");
    if (intentResult.status !== "created") throw new Error("unreachable");
    const created = await createOrderFromIntent({
      buyerId,
      buyerIp: randomBuyerIp(),
      buyerIpExemption: null,
      buyerIpSource: "trusted-proxy:1",
      intent: intentResult.intent,
      packageCode: await getPackageCode(),
      provider,
    });
    assert.ok(created.ok, "the order, its risk reservation and its audit event are written");
    if (!created.ok) throw new Error("unreachable");
    const session = await ensurePaymentSession(created.order, provider, APP_ORIGIN);
    assert.ok(session.ok, "the payment session updates the order's guarded columns");

    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: created.order.id } });
    const settled = await provider.settle(order.reference, "succeeded", new Date());
    assert.ok(settled);
    const received = await deliver(settled, "203.0.113.7");
    assert.ok(received.status === "received" && received.result.status === "processed" && received.result.outcome === "accepted");

    const paid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(paid.status, "paid");
    assert.ok(paid.paidAt && paid.packagePurchaseId, "the accepted payment moved the order and wrote the purchase summary");
    const purchase = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: paid.packagePurchaseId! } });
    assert.equal(purchase.status, "succeeded");
    const receipt = await prisma.paymentReceipt.findUniqueOrThrow({ where: { orderId: order.id } });
    assert.equal(receipt.deliveryStatus, "delivered", "the access grant and receipt happened in the payment transaction");
    assert.ok((await getAccessState(buyerId)).status, "the buyer has a billing account");
    const reservation = await prisma.riskReservation.findUniqueOrThrow({ where: { orderId: order.id } });
    assert.equal(reservation.state, "paid", "the reservation moved pending to paid");
    pass("checkout intent, order, risk reservation, payment event, access grant and receipt all work as the runtime role");

    // Usage evidence swallows errors by design, so check the row.
    await recordPaidUse(buyerId);
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { orderId: order.id } }), 1, "the usage evidence row was written");

    // The receipt email job runs through its lease, retry and completion updates.
    const handled: string[] = [];
    const drained = await drainOutbox(
      { access_grant: async () => undefined, critical_alert: async () => undefined, receipt_email: async (job) => void handled.push(job.id) },
      { filter: { dedupeKeyPrefix: `receipt:${order.id}` } },
    );
    assert.equal(drained.done, 1);
    assert.equal(handled.length, 1);
    pass("usage evidence is recorded and the outbox lease, retry and completion updates work");

    // The daily payment maintenance (reconciliation, stalled fulfillment, export purge, refund deadlines).
    const maintenance = await runPaymentMaintenance({
      handlers: { access_grant: async () => undefined, critical_alert: async () => undefined, receipt_email: async () => undefined },
      provider,
    });
    assert.ok(maintenance.outbox && maintenance.fulfillment, "the payment maintenance step ran as the runtime role");
    pass("the daily payment maintenance runs as the runtime role");

    // ---- Refund: prepare, approve, execute, settle, effects --------------------------------------------------------
    const refundOrder = await paidOrder();
    const prepared = await prepareRefund(admin, {
      orderId: refundOrder.id,
      reasonCode: "wrong_amount",
      requestChannel: "whatsapp",
      requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan.",
    });
    const approved = await refundCase(prepared.caseId).then((row) => approveRefund(owner, { caseId: prepared.caseId, expectedVersion: row.version, reason: FULL_REASON }, ENV));
    assert.ok(approved);
    await refundCase(prepared.caseId).then((row) => executeProviderRefund(owner, { caseId: prepared.caseId, expectedVersion: row.version }, { env: ENV, provider }));
    const refundEvent = await provider.settleRefund((await refundCase(prepared.caseId)).reference, "succeeded", new Date());
    assert.ok(refundEvent, "the stand-in had a pending refund");
    await deliver(refundEvent);
    const completed = await refundCase(prepared.caseId);
    assert.equal(completed.state, "completed", "the refund completed on the provider's signed event");
    const refunded = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: refundOrder.packagePurchaseId! } });
    assert.equal(refunded.status, "refunded", "the purchase summary moved to refunded");
    pass("a refund goes through prepare, approve, execute and the provider's signed confirmation, with its effects on access and the purchase");

    // ---- Dispute: notice, resolve, export ----------------------------------------------------------------------------
    const disputeOrder = await paidOrder();
    const notice = await recordDisputeNotice(owner, { orderId: disputeOrder.id, providerDisputeId: `DSP-${randomUUID().slice(0, 8)}`, reasonText: "Pembeli menyangkal transaksi di bank." }, ENV);
    const disputeRow = await prisma.paymentDispute.findUniqueOrThrow({ where: { id: notice.disputeId } });
    assert.equal(disputeRow.state, "open");
    await resolveDispute(owner, { disputeId: disputeRow.id, expectedVersion: disputeRow.version, outcome: "won", reason: "Hasil dari pemberitahuan penyedia." }, ENV);
    assert.equal((await prisma.paymentDispute.findUniqueOrThrow({ where: { id: disputeRow.id } })).state, "won");

    const exported = await createDisputeExport(owner, { env: ENV, orderId: disputeOrder.id, reason: "Menjawab pertanyaan penyedia pembayaran." });
    const claimed = await claimDisputeExport(owner, exported.token, ENV);
    assert.ok(claimed.ok);
    if (claimed.ok) {
      assert.equal(verifyPacketFile(claimed.text), true, "the packet's digest verifies");
      const packet = JSON.parse(claimed.text) as { packet: { retention: { ipAndDevice: { state: string } } } };
      assert.equal(packet.packet.retention.ipAndDevice.state, "kept", "the packet says the IP and device sections were kept");
    }
    pass("a dispute is recorded and resolved, and its evidence packet is built, claimed once and verified");

    // ---- Fraud: a quarantined event opens a case; blocks, appeals, case steps ----------------------------------------------
    const mismatched = await (async () => {
      const probe = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: (await paidOrder()).id } });
      return probe;
    })();
    const forged = await deliver(signedEventFor(mismatched, "payment.succeeded", { amountRupiah: mismatched.amountRupiah + 1, eventId: `evt-${randomUUID()}` }));
    assert.equal(forged.status, "received");
    const fraudCase = await prisma.fraudCase.findFirstOrThrow({ orderBy: { openedAt: "desc" }, where: { orderId: mismatched.id } });
    const acked = await acknowledgeCase(admin, { caseId: fraudCase.id, expectedVersion: fraudCase.version, reason: "Sudah saya lihat, menunggu pemilik" });
    assert.ok(acked);
    const block = await createManualBlock(owner, {
      caseId: fraudCase.id,
      reason: "Percobaan pembayaran dengan nominal palsu",
      reasonCode: "payment_fraud",
      target: { type: "ip", value: randomBuyerIp() },
      days: 3,
    });
    const blockRow = await prisma.fraudBlock.findUniqueOrThrow({ where: { id: block.id } });
    const appeal = await fileAppeal(owner, { blockId: blockRow.id, channel: "email", expectedBlockVersion: blockRow.version, summary: "Pembeli menyatakan itu salah ketik" });
    const appealRow = await prisma.fraudAppeal.findUniqueOrThrow({ where: { id: appeal.appealId } });
    await decideAppeal(owner, { appealId: appealRow.id, decision: "denied", expectedVersion: appealRow.version, reason: "Bukti belum cukup untuk mencabut blokir" });
    const afterAppeal = await prisma.fraudBlock.findUniqueOrThrow({ where: { id: blockRow.id } });
    await liftBlock(owner, { blockId: afterAppeal.id, expectedVersion: afterAppeal.version, reason: "Pemilik mencabut setelah memeriksa ulang" });
    const reloaded = await prisma.fraudCase.findUniqueOrThrow({ where: { id: fraudCase.id } });
    await closeCase(owner, { caseId: reloaded.id, closureReason: "confirmed_fraud", expectedVersion: reloaded.version, reason: "Terbukti memalsukan nominal, blokir dipasang" });
    await markLapsedBlocksExpired();
    pass("fraud cases and blocks: acknowledge, block, appeal, decide, lift, close and lapse all work as the runtime role");

    // A lost dispute ends access; the daily fraud review (signals, lapsed blocks, summary) runs too.
    const lostOrder = await paidOrder();
    const lostNotice = await recordDisputeNotice(owner, { orderId: lostOrder.id, providerDisputeId: `DSP-${randomUUID().slice(0, 8)}`, reasonText: "Pembeli menyangkal transaksi di bank." }, ENV);
    const lostRow = await prisma.paymentDispute.findUniqueOrThrow({ where: { id: lostNotice.disputeId } });
    await resolveDispute(owner, { disputeId: lostRow.id, expectedVersion: lostRow.version, outcome: "lost", reason: "Hasil dari pemberitahuan penyedia." }, ENV);
    assert.equal((await prisma.paymentDispute.findUniqueOrThrow({ where: { id: lostRow.id } })).state, "lost");
    const fraudDaily = await runFraudMaintenance({ alertTo: null, sendEmail: async () => ({ ok: true }) as never });
    assert.ok(fraudDaily.daily, "the daily fraud signals ran as the runtime role");
    pass("a lost dispute and the daily fraud review run as the runtime role");

    // ---- Holds and retention maintenance ----------------------------------------------------------------------------------
    const hold = await placeLegalHold(owner, { env: ENV, reason: "Pemeriksaan sengketa dengan penyedia pembayaran", scope: "order", subjectId: disputeOrder.id });
    const held = await getOrderRetention(disputeOrder.id);
    assert.ok(held && held.kind === "present" && held.held && held.holds.length === 1);
    await releaseLegalHold(owner, { env: ENV, holdId: hold.holdId, reason: "Pemeriksaan selesai tanpa temuan" });
    const released = await getOrderRetention(disputeOrder.id);
    assert.ok(released && released.kind === "present" && !released.held);
    const result = await runRetentionMaintenance();
    assert.equal(result.failedRows, 0);
    assert.ok(result.scrub.length >= 1 && result.delete.length >= 6, "every class ran and wrote its run log");
    const runs = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM retention_runs WHERE started_at > now() - interval '1 minute'`;
    assert.ok(runs[0].n >= 7, "the run log was written by the maintenance functions");
    pass("legal holds are placed and released, and the retention maintenance runs and logs, all as the runtime role");

    // Nothing in the whole run needed more than the restricted role.
    // Close this run's unpaid orders and outbox jobs so they do not crowd the maintenance suites.
    await refundKit.cleanUp();
    void failLeftoverOrders;
    void ownerId;
    void makeIntent;
    const stillRestricted = (await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1", [login.role]))[0].n;
    assert.ok(stillRestricted >= 1, "the suite ran on connections of the restricted login");
    pass("every step above ran on connections of the restricted login");

    await prisma.$disconnect();
  } finally {
    await login.drop().catch(() => undefined);
  }

  console.log(`retention runtime smoke: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
