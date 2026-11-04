import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { verifyPacketFile } from "../lib/disputes/canonical";
import { claimDisputeExport, createDisputeExport } from "../lib/disputes/export";
import { placeLegalHold } from "../lib/retention/holds";
import { getOrderRetention } from "../lib/retention/status";
import { recordDisputeNotice, resolveDispute } from "../lib/refunds/disputes";
import { approveRefund, cancelRefund, prepareRefund } from "../lib/refunds/cases";
import { recordPaidUse } from "../lib/fulfillment/usage";
import { openFraudCase } from "../lib/fraud/cases";
import { createManualBlock, liftBlock } from "../lib/fraud/blocks";
import { createRuntimeLogin, ownerQuery, releaseHold, setupSql, shiftOrderBack } from "./retention-test-kit";
import { deliver, makeOrder, prisma, provider, randomBuyerIp, signedEventFor } from "./payment-test-kit";
import { ENV, FULL_REASON, cleanUp, refundCase, setupAuthority } from "./refund-test-kit";

/**
 * MS-10 phase A, the maintenance path: the scrub nulls IP and device evidence
 * after 12 months and leaves the record; the delete removes a whole order
 * family after its period, in dependency order; holds, open cases and recent
 * cases stop both; every run is logged under its register version; runs are
 * safe to repeat, bounded, and callable only as intended. Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

type RunResult = {
  busy?: true;
  caseSkipped?: number;
  class?: string;
  classes?: Array<{ class: string; complete: boolean; counts: Record<string, number>; heldSkipped?: number; caseSkipped?: number }>;
  complete?: boolean;
  counts?: Record<string, number>;
  examined?: number;
  heldSkipped?: number;
  registerVersion?: number;
};

async function scrubAll() {
  const merged: RunResult[] = [];
  for (let i = 0; i < 20; i += 1) {
    const [{ r }] = await ownerQuery<{ r: RunResult }>("SELECT retention_run_scrub(1000) AS r");
    merged.push(r);
    if (r.complete !== false) break;
  }
  return merged[merged.length - 1];
}

async function deleteAll() {
  let last: RunResult = {};
  for (let i = 0; i < 20; i += 1) {
    const [{ r }] = await ownerQuery<{ r: RunResult }>("SELECT retention_run_delete(500) AS r");
    last = r;
    if (r.classes?.every((entry) => entry.complete)) break;
  }
  return last;
}

const classOf = (result: RunResult, name: string) => result.classes?.find((entry) => entry.class === name);

/** A paid order whose events and audit rows carry IP addresses, with a device token on the order. */
async function paidWithIp() {
  const order = await makeOrder();
  const settled = await provider.settle(order.reference, "succeeded", new Date());
  assert.ok(settled);
  const received = await deliver(settled, "198.51.100.23");
  assert.ok(received.status === "received" && received.result.status === "processed" && received.result.outcome === "accepted");
  await setupSql("UPDATE payment_orders SET device_lookup_token = $2 WHERE id = $1", [order.id, `dev${randomUUID().replaceAll("-", "")}`]);
  await recordPaidUse(order.buyerId);
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
}

async function ipState(orderId: string) {
  const [row] = await ownerQuery<{ audit: number; device: boolean; events: number; ip: boolean }>(
    `SELECT (buyer_ip IS NOT NULL) AS ip, (device_lookup_token IS NOT NULL) AS device,
            (SELECT count(*)::int FROM payment_events e WHERE e.order_id = o.id AND e.caller_ip IS NOT NULL) AS events,
            (SELECT count(*)::int FROM audit_logs a WHERE a.ip_address IS NOT NULL AND (
               (a.target_type = 'payment_order' AND a.target_id = o.id)
               OR (a.target_type = 'payment_event' AND a.target_id IN (SELECT id FROM payment_events WHERE order_id = o.id))
               OR (a.target_type = 'checkout_intent' AND a.target_id = o.intent_id))) AS audit
     FROM payment_orders o WHERE o.id = $1`,
    [orderId],
  );
  return row;
}

async function family(orderId: string) {
  const [row] = await ownerQuery<Record<string, number>>(
    `SELECT (SELECT count(*)::int FROM payment_orders WHERE id = $1) AS orders,
            (SELECT count(*)::int FROM payment_events WHERE order_id = $1) AS events,
            (SELECT count(*)::int FROM payment_receipts WHERE order_id = $1) AS receipts,
            (SELECT count(*)::int FROM receipt_deliveries WHERE receipt_id IN (SELECT id FROM payment_receipts WHERE order_id = $1)) AS deliveries,
            (SELECT count(*)::int FROM fulfillment_usage_events WHERE order_id = $1) AS usage,
            (SELECT count(*)::int FROM risk_reservations WHERE order_id = $1) AS reservations,
            (SELECT count(*)::int FROM refund_cases WHERE order_id = $1) AS refunds,
            (SELECT count(*)::int FROM refund_case_events WHERE case_id IN (SELECT id FROM refund_cases WHERE order_id = $1)) AS refund_events,
            (SELECT count(*)::int FROM payment_disputes WHERE order_id = $1) AS disputes,
            (SELECT count(*)::int FROM payment_dispute_events WHERE dispute_id IN (SELECT id FROM payment_disputes WHERE order_id = $1)) AS dispute_events,
            (SELECT count(*)::int FROM dispute_exports WHERE order_id = $1) AS exports,
            (SELECT count(*)::int FROM payment_outbox WHERE order_id = $1) AS outbox,
            (SELECT count(*)::int FROM checkout_intents WHERE id = (SELECT intent_id FROM payment_orders WHERE id = $1)) AS intents`,
    [orderId],
  );
  return row;
}

async function main() {
  const authority = await setupAuthority();
  const { admin, owner } = authority;

  // ---- Scrub after 12 months: the evidence goes, the record stays ---------------------------------------------------------
  const young = await paidWithIp();
  const almost = await paidWithIp();
  const old = await paidWithIp();
  assert.deepEqual(await ipState(old.id), { audit: (await ipState(old.id)).audit, device: true, events: 1, ip: true });
  assert.ok((await ipState(old.id)).audit >= 2, "the order and its payment event wrote audit rows with the address");

  await shiftOrderBack(almost.id, "11 months 28 days");
  await shiftOrderBack(old.id, "12 months 2 days");

  const first = await scrubAll();
  assert.equal(first.registerVersion, 1);
  assert.equal(first.class, "buyer_ip_device");
  assert.deepEqual(await ipState(old.id), { audit: 0, device: false, events: 0, ip: false }, "after 12 months the IP and device evidence is nulled");
  const kept = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: old.id } });
  assert.equal(kept.status, "paid");
  assert.equal(kept.amountRupiah, old.amountRupiah, "the order itself stays");
  assert.equal(kept.reference, old.reference);
  assert.ok(await prisma.paymentEvent.count({ where: { orderId: old.id } }), "its events stay");
  assert.ok(await prisma.paymentReceipt.findUnique({ where: { orderId: old.id } }), "its receipt stays");
  assert.ok((await ownerQuery("SELECT 1 FROM retention_scrubs WHERE order_id = $1", [old.id])).length === 1, "the scrub is recorded");
  assert.equal((await ipState(almost.id)).ip, true, "just under 12 months, nothing is removed");
  assert.equal((await ipState(young.id)).ip, true);
  const retention = await getOrderRetention(old.id);
  assert.ok(retention && retention.kind === "present" && retention.ip.state === "removed" && retention.ip.scrubbedAt);
  const retained = await getOrderRetention(almost.id);
  assert.ok(retained && retained.kind === "present" && retained.ip.state === "kept" && retained.ip.endsAt);
  pass("the scrub nulls IP, device token, event caller IP and payment audit IPs after 12 months and keeps the order, events and receipt");

  // Safe to run twice, and the second run finds nothing to do for it.
  const second = await scrubAll();
  assert.equal(second.counts?.payment_orders ?? 0, 0, "a second run changes no order");
  assert.deepEqual(await ipState(old.id), { audit: 0, device: false, events: 0, ip: false });
  pass("running the scrub twice changes nothing the second time");

  // ---- The run log ----------------------------------------------------------------------------------------------------------
  const runs = await ownerQuery<{ batch_limit: number; complete: boolean; counts: Record<string, number>; examined: number; invoked_by: string; kind: string; record_class: string; register_version: number }>(
    "SELECT * FROM retention_runs WHERE kind = 'scrub' ORDER BY started_at DESC LIMIT 2",
  );
  assert.equal(runs.length, 2, "every run writes a row, including the one that found nothing");
  assert.equal(runs[0].record_class, "buyer_ip_device");
  assert.equal(runs[0].register_version, 1, "the run log names the register version");
  assert.equal(runs[1].counts.payment_orders >= 1, true, "the counts of what the first run did are kept");
  assert.equal(runs[0].counts.payment_orders ?? 0, 0, "…and the second run recorded zero");
  assert.equal(runs[0].invoked_by.length > 0, true);
  pass("retention_runs gets a row per run with class, register version, counts and the caller, including zero-count runs");

  // ---- Scrub with a hold: order, buyer and case --------------------------------------------------------------------------------
  const heldOrder = await paidWithIp();
  const heldBuyer = await paidWithIp();
  await shiftOrderBack(heldOrder.id, "13 months");
  await shiftOrderBack(heldBuyer.id, "13 months");
  const orderHold = await placeLegalHold(owner, { env: ENV, reason: "Pemeriksaan sengketa dengan penyedia pembayaran", scope: "order", subjectId: heldOrder.id });
  const buyerHold = await placeLegalHold(owner, { env: ENV, reason: "Pemeriksaan semua pesanan pembeli ini", scope: "buyer", subjectId: heldBuyer.buyerId });
  const withHolds = await scrubAll();
  assert.ok((withHolds.heldSkipped ?? 0) >= 2, "held orders are counted as skipped");
  assert.equal((await ipState(heldOrder.id)).ip, true, "an order hold stops the scrub");
  assert.equal((await ipState(heldBuyer.id)).ip, true, "a buyer hold stops the scrub of the buyer's orders");
  await releaseHold(orderHold.holdId, "Pemeriksaan selesai tanpa temuan");
  await releaseHold(buyerHold.holdId, "Pemeriksaan selesai tanpa temuan");
  await scrubAll();
  assert.equal((await ipState(heldOrder.id)).ip, false, "released, the next run scrubs");
  assert.equal((await ipState(heldBuyer.id)).ip, false);
  pass("an order hold and a buyer hold stop the scrub, and a release lets the next run scrub");

  // The evidence_hold flag on a refund case or dispute is honoured as well.
  {
    const flagged = await paidWithIp();
    await shiftOrderBack(flagged.id, "13 months");
    const prepared = await prepareRefund(admin, { orderId: flagged.id, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan." });
    assert.equal((await refundCase(prepared.caseId)).evidenceHold, true, "an open refund case holds evidence");
    await scrubAll();
    assert.equal((await ipState(flagged.id)).ip, true, "an open refund case keeps the IP and device evidence");
    // Closing it (approve then cancel) starts the case's own period; the scrub still waits.
    const row = await refundCase(prepared.caseId);
    await approveRefund(owner, { caseId: prepared.caseId, expectedVersion: row.version, reason: FULL_REASON }, ENV);
    await cancelRefund(owner, { caseId: prepared.caseId, expectedVersion: 2, reason: "Pembeli menarik permintaannya." }, ENV);
    const closedCase = await refundCase(prepared.caseId);
    assert.equal(closedCase.state, "cancelled");
    await scrubAll();
    assert.equal((await ipState(flagged.id)).ip, true, "a case closed today keeps the evidence for the case's own two years");
    const closure = await getOrderRetention(flagged.id);
    assert.ok(closure && closure.kind === "present" && closure.ip.endsAt && closure.ip.endsAt.getTime() > Date.now() + 700 * 86_400_000, "the panel shows the end of the case period");
    await setupSql("UPDATE refund_cases SET closed_at = now() - interval '25 months', completed_at = NULL WHERE id = $1", [prepared.caseId]);
    await scrubAll();
    assert.equal((await ipState(flagged.id)).ip, false, "two years after closure the evidence is scrubbed");
    pass("an open refund case and a closed refund case keep IP and device evidence until two years after closure");

    // MS-18: an authority-order case is a refund case to the retention rules, held while open and kept two years after closure.
    const authorityOrder = await paidWithIp();
    await shiftOrderBack(authorityOrder.id, "13 months");
    const ordered = await prepareRefund(admin, {
      authorityName: "Bank Indonesia", authorityReference: "BI/2026/0042", orderId: authorityOrder.id, reasonCode: "authority_order",
      requestChannel: "email", requestedAt: authorityOrder.createdAt, requestNote: "Surat perintah pengembalian dana dari otoritas.",
    });
    assert.equal((await refundCase(ordered.caseId)).evidenceHold, true, "an open authority case holds evidence");
    await scrubAll();
    assert.equal((await ipState(authorityOrder.id)).ip, true, "an open authority case keeps the IP and device evidence");
    const orderedRow = await refundCase(ordered.caseId);
    await approveRefund(owner, { caseId: ordered.caseId, expectedVersion: orderedRow.version, reason: FULL_REASON }, ENV);
    await cancelRefund(owner, { caseId: ordered.caseId, expectedVersion: 2, reason: "Otoritas mencabut perintahnya." }, ENV);
    await scrubAll();
    assert.equal((await ipState(authorityOrder.id)).ip, true, "an authority case closed today keeps the evidence for the case's own two years");
    await setupSql("UPDATE refund_cases SET closed_at = now() - interval '25 months', completed_at = NULL WHERE id = $1", [ordered.caseId]);
    await scrubAll();
    assert.equal((await ipState(authorityOrder.id)).ip, false, "two years after closure the evidence is scrubbed");
    pass("an authority-order refund case holds IP and device evidence like any refund case");
  }

  // ---- The month-11 dispute: a dispute opened late keeps the evidence it needs ---------------------------------------------------
  {
    const late = await paidWithIp();
    await shiftOrderBack(late.id, "11 months");
    assert.equal((await ipState(late.id)).ip, true, "at month 11 the evidence is still inside its 12 months");
    const notice = await recordDisputeNotice(owner, { orderId: late.id, providerDisputeId: `DSP-${randomUUID().slice(0, 8)}`, reasonText: "Pembeli menyangkal transaksi di bank." }, ENV);
    // Month 13: the order's 12 months are over, but the dispute is open.
    await shiftOrderBack(late.id, "2 months");
    await scrubAll();
    assert.equal((await ipState(late.id)).ip, true, "an open dispute at month 13 still has its IP and device evidence");
    const asOf13 = await getOrderRetention(late.id);
    assert.ok(asOf13 && asOf13.kind === "present" && asOf13.caseOpen && asOf13.ip.endsAt === null, "the panel says the period waits for the case");

    const packetKept = await (async () => {
      const made = await createDisputeExport(owner, { env: ENV, orderId: late.id, reason: "Menjawab pertanyaan penyedia pembayaran." });
      const claimed = await claimDisputeExport(owner, made.token, ENV);
      assert.ok(claimed.ok);
      if (!claimed.ok) throw new Error("unreachable");
      assert.equal(verifyPacketFile(claimed.text), true);
      return JSON.parse(claimed.text) as { packet: { provenance: { buyerIp: string | null }; retention: { ipAndDevice: { state: string } }; manifest: { sections: string[]; packetVersion: number } } };
    })();
    assert.equal(packetKept.packet.retention.ipAndDevice.state, "kept");
    assert.ok(packetKept.packet.provenance.buyerIp, "the packet still carries the buyer IP");
    assert.ok(packetKept.packet.manifest.sections.includes("retention"));
    assert.equal(packetKept.packet.manifest.packetVersion, 3);

    // Resolved: the case's two years start now.
    const dispute = await prisma.paymentDispute.findUniqueOrThrow({ where: { id: notice.disputeId } });
    await resolveDispute(owner, { disputeId: dispute.id, expectedVersion: dispute.version, outcome: "won", reason: "Hasil dari pemberitahuan penyedia." }, ENV);
    await scrubAll();
    assert.equal((await ipState(late.id)).ip, true, "a dispute closed today keeps the evidence for two more years");
    await setupSql("UPDATE payment_disputes SET resolved_at = now() - interval '25 months' WHERE id = $1", [dispute.id]);
    await scrubAll();
    assert.deepEqual(await ipState(late.id), { audit: 0, device: false, events: 0, ip: false }, "once the case's period is over, the 12 months apply and the evidence is scrubbed");

    const made = await createDisputeExport(owner, { env: ENV, orderId: late.id, reason: "Menjawab pertanyaan penyedia pembayaran." });
    const claimed = await claimDisputeExport(owner, made.token, ENV);
    assert.ok(claimed.ok);
    if (claimed.ok) {
      assert.equal(verifyPacketFile(claimed.text), true, "the digest of a packet built after the scrub verifies");
      const packet = JSON.parse(claimed.text) as { packet: { provenance: { buyerIp: string | null }; retention: { ipAndDevice: { removedAt: string | null; state: string } } } };
      assert.equal(packet.packet.retention.ipAndDevice.state, "removed", "the packet says the IP and device sections were removed");
      assert.ok(packet.packet.retention.ipAndDevice.removedAt);
      assert.equal(packet.packet.provenance.buyerIp, null);
    }
    pass("a dispute opened in month 11 keeps the IP and device evidence past month 12; it is scrubbed two years after closure; the packet says kept, then removed, and its digest verifies");
  }

  // ---- Delete: after the period, not before, hold-blocked, and in family order -------------------------------------------------------------------
  {
    const full = await paidWithIp();
    // A refund case that completed and a dispute that was won, so every family table has rows.
    const prepared = await prepareRefund(admin, { orderId: full.id, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan.", amountRupiah: 1000 });
    const preparedRow = await refundCase(prepared.caseId);
    await approveRefund(owner, { caseId: prepared.caseId, expectedVersion: preparedRow.version, reason: FULL_REASON }, ENV);
    await cancelRefund(owner, { caseId: prepared.caseId, expectedVersion: 2, reason: "Pembeli menarik permintaannya." }, ENV);
    // MS-18: an authority-order case belongs to the same family and goes with it.
    const ordered = await prepareRefund(admin, {
      authorityName: "Bank Indonesia", authorityReference: "BI/2026/0043", orderId: full.id, reasonCode: "authority_order",
      requestChannel: "email", requestedAt: full.createdAt, requestNote: "Surat perintah pengembalian dana dari otoritas.", amountRupiah: 1000,
    });
    await cancelRefund(owner, { caseId: ordered.caseId, expectedVersion: 1, reason: "Otoritas mencabut perintahnya." }, ENV);
    const notice = await recordDisputeNotice(owner, { orderId: full.id, providerDisputeId: `DSP-${randomUUID().slice(0, 8)}`, reasonText: "Pembeli menyangkal transaksi di bank." }, ENV);
    const dispute = await prisma.paymentDispute.findUniqueOrThrow({ where: { id: notice.disputeId } });
    await resolveDispute(owner, { disputeId: dispute.id, expectedVersion: dispute.version, outcome: "won", reason: "Hasil dari pemberitahuan penyedia." }, ENV);
    const exportMade = await createDisputeExport(owner, { env: ENV, orderId: full.id, reason: "Menjawab pertanyaan penyedia pembayaran." });
    assert.ok(exportMade.exportId);

    const before = await family(full.id);
    for (const [key, value] of Object.entries(before)) {
      if (!["deliveries"].includes(key)) assert.ok(value >= 1, `the fixture family has ${key}`);
    }

    // Everything in the family is 9 years 11 months old: not yet.
    await shiftOrderBack(full.id, "9 years 11 months");
    await setupSql("UPDATE refund_cases SET closed_at = now() - interval '9 years', completed_at = NULL WHERE order_id = $1", [full.id]);
    await setupSql("UPDATE payment_disputes SET resolved_at = now() - interval '9 years' WHERE order_id = $1", [full.id]);
    await deleteAll();
    assert.deepEqual(await family(full.id), before, "before ten years nothing is deleted");

    // Ten years and a few days: a hold stops it.
    await shiftOrderBack(full.id, "1 month");
    const hold = await placeLegalHold(owner, { env: ENV, reason: "Penahanan karena pemeriksaan pajak", scope: "order", subjectId: full.id });
    const heldRun = await deleteAll();
    assert.ok((classOf(heldRun, "order_family")?.heldSkipped ?? 0) >= 1, "a held order is counted, not deleted");
    assert.deepEqual(await family(full.id), before, "a hold blocks the delete");
    assert.equal((await getOrderRetention(full.id) as { held: boolean }).held, true);

    // A refund case closed recently extends the family past ten years.
    await releaseHold(hold.holdId, "Pemeriksaan pajak selesai");
    await setupSql("UPDATE refund_cases SET closed_at = now() - interval '1 year' WHERE order_id = $1", [full.id]);
    const caseRun = await deleteAll();
    assert.ok((classOf(caseRun, "order_family")?.caseSkipped ?? 0) >= 1, "an order waiting on a case is counted as such");
    assert.deepEqual(await family(full.id), before, "a case closed one year ago keeps the family for its own two years");

    // Cases long closed: the whole family goes, in order, with nothing left behind.
    await setupSql("UPDATE refund_cases SET closed_at = now() - interval '3 years' WHERE order_id = $1", [full.id]);
    const deleted = await deleteAll();
    const orderClass = classOf(deleted, "order_family");
    assert.equal(orderClass?.counts.failed ?? 0, 0, "no family failed on a foreign key: the delete order is right");
    const after = await family(full.id);
    for (const [key, value] of Object.entries(after)) assert.equal(value, 0, `${key} is gone after the period`);
    const [tomb] = await ownerQuery<{ record_class: string; register_version: number; rows_removed: Record<string, number>; subject_reference: string }>(
      "SELECT * FROM retention_purges WHERE subject_table = 'payment_orders' AND subject_id = $1", [full.id],
    );
    assert.equal(tomb.record_class, "order_family");
    assert.equal(tomb.subject_reference, full.reference);
    assert.equal(tomb.register_version, 1);
    assert.ok(tomb.rows_removed.payment_orders === 1 && tomb.rows_removed.payment_events >= 1);
    const purged = await getOrderRetention(full.id);
    assert.ok(purged && purged.kind === "purged", "the panel can say the record was removed under the policy");
    // The buyer, the audit trail and the access ledger are not part of the family.
    assert.ok(await prisma.user.findUnique({ where: { id: full.buyerId } }), "the buyer's account stays");
    assert.ok(await prisma.billingAccessEvent.count({ where: { studentId: full.buyerId } }) >= 1, "the access ledger stays");
    assert.ok(await prisma.auditLog.count({ where: { targetId: full.id } }) >= 1, "audit_logs is never pruned");
    pass("delete: nothing before ten years, a hold blocks it, a recent case extends it, and after that the whole family goes in dependency order with a tombstone and the audit trail kept");

    // A second run has nothing more to do for it.
    const again = await deleteAll();
    assert.equal(classOf(again, "order_family")?.counts.payment_orders ?? 0, 0);
    pass("running the delete twice changes nothing the second time");
  }

  // ---- A fraud case referencing an order keeps the family whole until the case is gone -----------------------------------------------------------
  {
    const target = await paidWithIp();
    await shiftOrderBack(target.id, "10 years 2 days");
    const opened = await prisma.$transaction((tx) =>
      openFraudCase(tx, { evidence: { orderId: target.id }, orderId: target.id, signal: "payment_review", subjectKey: `order:${target.id}`, subjectType: "order", userId: target.buyerId }),
    );
    const before = await family(target.id);
    const openRun = await deleteAll();
    assert.deepEqual(await family(target.id), before, "an open fraud case keeps the order's family");
    assert.ok((classOf(openRun, "order_family")?.caseSkipped ?? 0) >= 1);
    // Closed a year ago: still inside its two years.
    await setupSql("UPDATE fraud_cases SET state = 'closed', closed_at = now() - interval '1 year', closure_reason = 'duplicate' WHERE id = $1", [opened.id]);
    await deleteAll();
    assert.deepEqual(await family(target.id), before, "a fraud case closed a year ago still protects the family");
    // Closed three years ago: the case goes first, then the family, in one run.
    await setupSql("UPDATE fraud_cases SET closed_at = now() - interval '3 years' WHERE id = $1", [opened.id]);
    const run = await deleteAll();
    assert.equal((classOf(run, "fraud_case")?.counts.fraud_cases ?? 0) >= 1, true);
    assert.equal((await ownerQuery("SELECT 1 FROM fraud_cases WHERE id = $1", [opened.id])).length, 0, "the fraud case was deleted");
    assert.equal((await ownerQuery("SELECT 1 FROM fraud_case_events WHERE case_id = $1", [opened.id])).length, 0, "…with its events");
    assert.equal((await family(target.id)).orders, 0, "and the family followed once nothing retained needed it");
    pass("a fraud case pointing at an order keeps its family until the case itself is past two years; the case is deleted first, then the family");
  }

  // ---- Blocks, intents, risk policy and counters ------------------------------------------------------------------------------------------------
  {
    const buyer = await paidWithIp();
    const block = await createManualBlock(owner, { days: 3, reason: "Alamat dipakai untuk percobaan serupa", reasonCode: "payment_fraud", target: { type: "ip", value: randomBuyerIp() } });
    const row = await prisma.fraudBlock.findUniqueOrThrow({ where: { id: block.id } });
    await liftBlock(owner, { blockId: block.id, expectedVersion: row.version, reason: "Pemilik mencabut setelah memeriksa ulang" });
    const events = await prisma.fraudBlockEvent.count({ where: { blockId: block.id } });
    assert.ok(events >= 2);
    await deleteAll();
    assert.ok(await prisma.fraudBlock.findUnique({ where: { id: block.id } }), "a block that ended today is kept");
    await setupSql("UPDATE fraud_blocks SET ended_at = now() - interval '25 months' WHERE id = $1", [block.id]);
    await deleteAll();
    assert.equal(await prisma.fraudBlock.count({ where: { id: block.id } }), 0, "a block two years after it ended is deleted");
    assert.equal(await prisma.fraudBlockEvent.count({ where: { blockId: block.id } }), 0, "…with its events");
    assert.equal((await ownerQuery("SELECT 1 FROM retention_purges WHERE subject_table = 'fraud_blocks' AND subject_id = $1", [block.id])).length, 1);

    // Checkout intents with no order: 30 days after expiry; intents with an order wait for the family.
    const buyerId = (await makeOrder({ session: false })).buyerId;
    const [old30, young30] = await Promise.all([
      prisma.checkoutIntent.create({ data: { amountRupiah: 1000, buyerId, expiresAt: new Date(), idempotencyKey: randomUUID(), plan: "monthly", pricingMonth: "2026-11", termsVersion: "test-terms" }, select: { id: true } }),
      prisma.checkoutIntent.create({ data: { amountRupiah: 1000, buyerId, expiresAt: new Date(), idempotencyKey: randomUUID(), plan: "monthly", pricingMonth: "2026-11", termsVersion: "test-terms" }, select: { id: true } }),
    ]);
    await setupSql("UPDATE checkout_intents SET expires_at = now() - interval '31 days' WHERE id = $1", [old30.id]);
    await setupSql("UPDATE checkout_intents SET expires_at = now() - interval '29 days' WHERE id = $1", [young30.id]);
    const withOrderIntent = (await prisma.paymentOrder.findFirstOrThrow({ where: { buyerId } })).intentId;
    await setupSql("UPDATE checkout_intents SET expires_at = now() - interval '40 days' WHERE id = $1", [withOrderIntent]);
    await deleteAll();
    assert.equal(await prisma.checkoutIntent.count({ where: { id: old30.id } }), 0, "an intent with no order is deleted 30 days after it expired");
    assert.equal(await prisma.checkoutIntent.count({ where: { id: young30.id } }), 1, "…not before");
    assert.equal(await prisma.checkoutIntent.count({ where: { id: withOrderIntent } }), 1, "an intent with an order is kept with the order");

    // Risk policy versions nothing needs, and daily counters, after ten years; never the newest version.
    // An old policy version that no reservation or case points at, and is not in force: pick one the suites left behind.
    const [spare] = await ownerQuery<{ id: string; version: number }>(
      `SELECT v.id, v.version FROM risk_policy_versions v
       WHERE v.version < (SELECT max(version) FROM risk_policy_versions)
         AND v.id IS DISTINCT FROM (SELECT policy_version_id FROM risk_policy_activations ORDER BY id DESC LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM risk_reservations rr WHERE rr.policy_version = v.version)
         AND NOT EXISTS (SELECT 1 FROM fraud_cases fc WHERE fc.policy_version = v.version)
       ORDER BY v.version LIMIT 1`,
    );
    assert.ok(spare, "the dev database has an unreferenced policy version to age");
    await setupSql("UPDATE risk_policy_versions SET created_at = now() - interval '11 years' WHERE id = $1", [spare.id]);
    // A referenced old version must stay: point one reservation's policy_version at another old version.
    const [referenced] = await ownerQuery<{ id: string; version: number }>(
      `SELECT v.id, v.version FROM risk_policy_versions v
       WHERE v.version < (SELECT max(version) FROM risk_policy_versions) AND v.version <> $1
         AND v.id IS DISTINCT FROM (SELECT policy_version_id FROM risk_policy_activations ORDER BY id DESC LIMIT 1)
         AND NOT EXISTS (SELECT 1 FROM risk_reservations rr WHERE rr.policy_version = v.version)
         AND NOT EXISTS (SELECT 1 FROM fraud_cases fc WHERE fc.policy_version = v.version)
       ORDER BY v.version LIMIT 1`,
      [spare.version],
    );
    await setupSql("UPDATE risk_policy_versions SET created_at = now() - interval '11 years' WHERE id = $1", [referenced.id]);
    await setupSql("UPDATE fraud_cases SET policy_version = $1 WHERE id = (SELECT id FROM fraud_cases WHERE state = 'open' ORDER BY opened_at DESC LIMIT 1)", [referenced.version]);
    await setupSql("INSERT INTO risk_day_buckets (user_id, bucket_date, purchase_count, amount_rupiah) VALUES ($1, (now() - interval '11 years')::date, 1, 1000) ON CONFLICT DO NOTHING", [buyer.buyerId]);
    const hold = await placeLegalHold(owner, { env: ENV, reason: "Penahanan seluruh data pembeli ini", scope: "buyer", subjectId: buyer.buyerId });
    await deleteAll();
    assert.equal((await ownerQuery("SELECT 1 FROM risk_day_buckets WHERE user_id = $1 AND bucket_date < now() - interval '10 years'", [buyer.buyerId])).length, 1, "a buyer hold keeps the old counters");
    assert.equal((await ownerQuery("SELECT 1 FROM risk_policy_versions WHERE id = $1", [spare.id])).length, 0, "an old, unreferenced policy version is deleted");
    assert.equal((await ownerQuery("SELECT 1 FROM risk_policy_versions WHERE id = $1", [referenced.id])).length, 1, "an old policy version a retained case still points at is kept");
    assert.ok((await ownerQuery("SELECT 1 FROM risk_policy_versions WHERE version = (SELECT max(version) FROM risk_policy_versions)")).length === 1, "the newest policy version is never deleted");
    await releaseHold(hold.holdId, "Penahanan seluruh data pembeli ini dilepas");
    await deleteAll();
    assert.equal((await ownerQuery("SELECT 1 FROM risk_day_buckets WHERE user_id = $1 AND bucket_date < now() - interval '10 years'", [buyer.buyerId])).length, 0);
    pass("blocks (two years after they ended), intents with no order (30 days), old policy versions and daily counters are deleted on their own periods, and holds and references stop them");
  }

  // ---- Unmatched events and refused-checkout audit rows ----------------------------------------------------------------------------------------------
  {
    const ghost = await makeOrder({ session: false });
    const event = signedEventFor({ ...ghost, reference: `ghost-${randomUUID().slice(0, 8)}` }, "payment.succeeded", { eventId: `evt-${randomUUID()}` });
    const result = await deliver(event, "192.0.2.55");
    assert.equal(result.status, "received");
    const [unmatched] = await ownerQuery<{ id: string }>("SELECT id FROM payment_events WHERE order_id IS NULL AND caller_ip = '192.0.2.55'::inet ORDER BY received_at DESC LIMIT 1");
    assert.ok(unmatched, "an event no order claims was recorded with the caller's address");
    await setupSql("UPDATE payment_events SET received_at = now() - interval '13 months' WHERE id = $1", [unmatched.id]);
    await scrubAll();
    assert.equal((await ownerQuery("SELECT 1 FROM payment_events WHERE id = $1 AND caller_ip IS NOT NULL", [unmatched.id])).length, 1, "a fraud case about the event is still open, so its address is kept");
    await setupSql("UPDATE fraud_cases SET state = 'closed', closed_at = now() - interval '25 months', closure_reason = 'duplicate' WHERE payment_event_id = $1", [unmatched.id]);
    await scrubAll();
    assert.equal((await ownerQuery("SELECT 1 FROM payment_events WHERE id = $1 AND caller_ip IS NOT NULL", [unmatched.id])).length, 0, "once the case's period is over, the address is removed");

    const marker = `payment.checkout.refused.${randomUUID().slice(0, 6)}`;
    await setupSql("INSERT INTO audit_logs (action, target_type, target_id, metadata, ip_address, occurred_at) VALUES ($1, 'user', gen_random_uuid(), '{}'::jsonb, '203.0.113.99'::inet, now() - interval '13 months')", [marker]);
    await setupSql("INSERT INTO audit_logs (action, target_type, target_id, metadata, ip_address, occurred_at) VALUES ($1, 'user', gen_random_uuid(), '{}'::jsonb, '203.0.113.98'::inet, now() - interval '13 months')", [`auth.login.${marker}`]);
    const auditBefore = (await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs"))[0].n;
    await scrubAll();
    assert.equal((await ownerQuery("SELECT 1 FROM audit_logs WHERE action = $1 AND ip_address IS NOT NULL", [marker])).length, 0, "an old refused-checkout audit row loses its address");
    assert.equal((await ownerQuery("SELECT 1 FROM audit_logs WHERE action = $1 AND ip_address IS NOT NULL", [`auth.login.${marker}`])).length, 1, "a security audit row is not payment evidence and is untouched");
    assert.equal((await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM audit_logs"))[0].n, auditBefore, "no audit row was removed");
    pass("unmatched events and payment audit rows without an order lose their addresses on the same clock, and a security audit row is untouched");
  }

  // ---- The functions: bounded, clamped, one at a time, callable only as intended ----------------------------------------------------------------------------------
  {
    const batch = [await paidWithIp(), await paidWithIp(), await paidWithIp()];
    for (const item of batch) await shiftOrderBack(item.id, "13 months");
    const [{ r: one }] = await ownerQuery<{ r: RunResult }>("SELECT retention_run_scrub(1) AS r");
    assert.equal(one.examined, 1, "a batch of 1 handles one order");
    assert.equal(one.complete, false, "and says more is waiting");
    const [{ r: zero }] = await ownerQuery<{ r: RunResult }>("SELECT retention_run_scrub(0) AS r");
    assert.equal(zero.examined, 1, "a limit below 1 is raised to 1");
    const [{ r: huge }] = await ownerQuery<{ r: RunResult }>("SELECT retention_run_scrub(100000) AS r");
    assert.ok((huge.examined ?? 0) <= 1000, "a huge limit is capped");
    for (const item of batch) assert.equal((await ipState(item.id)).ip, false);

    // One run at a time: while one holds the advisory lock, another says busy instead of doing the work twice.
    const { ownerClient } = await import("./retention-test-kit");
    const a = await ownerClient();
    const b = await ownerClient();
    try {
      await a.query("BEGIN");
      await a.query("SELECT retention_run_scrub(1)");
      const concurrent = (await b.query("SELECT retention_run_scrub(1) AS r")).rows[0].r as RunResult;
      assert.equal(concurrent.busy, true, "a second concurrent run backs off");
      await a.query("COMMIT");
    } finally {
      await a.end();
      await b.end();
    }

    // The restricted runtime login can call both functions, and only they do the work.
    const login = await createRuntimeLogin("maintenance");
    try {
      const runtime = await login.client();
      try {
        const scrubbed = (await runtime.query("SELECT retention_run_scrub(5) AS r")).rows[0].r as RunResult;
        const deleted = (await runtime.query("SELECT retention_run_delete(5) AS r")).rows[0].r as RunResult;
        assert.equal(scrubbed.registerVersion, 1);
        assert.equal(deleted.classes?.length, 6, "the delete path covers six classes");
        // The run log is written as the maintenance role, not the caller.
        const [last] = (await runtime.query("SELECT invoked_by FROM retention_runs ORDER BY started_at DESC LIMIT 1")).rows;
        assert.equal(last.invoked_by, login.role, "the log names the login that called the function");
      } finally {
        await runtime.end();
      }
    } finally {
      await login.drop();
    }
    pass("the functions run in bounded batches (clamped limits), one at a time, and the runtime login can call them and nothing else does the work");
  }

  await cleanUp();
  await prisma.$disconnect();
  console.log(`retention maintenance: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
