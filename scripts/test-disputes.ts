import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { getAccessState, hasPaidAccess, pauseAccess } from "../lib/billing/service";
import { sealPacket, verifyPacketFile } from "../lib/disputes/canonical";
import { claimDisputeExport, createDisputeExport } from "../lib/disputes/export";
import { FraudAuthorityError } from "../lib/fraud/errors";
import { PURCHASE_TERMS } from "../lib/fulfillment/terms";
import { createOrderFromIntent, ensurePaymentSession } from "../lib/payments/orders";
import { findStandingPaidOrder } from "../lib/payments/risk/tier";
import { approveRefund, cancelRefund, prepareRefund } from "../lib/refunds/cases";
import { recordDisputeNotice, resolveDispute } from "../lib/refunds/disputes";
import { RefundError } from "../lib/refunds/errors";
import { executeProviderRefund, recordManualTransfer } from "../lib/refunds/execute";
import { deliver, getPackageCode, makeIntent, randomBuyerIp, APP_ORIGIN } from "./payment-test-kit";
import {
  ENV,
  FULL_REASON,
  cleanUp,
  makeBuyer,
  makeOrder,
  paidOrder,
  prisma,
  provider,
  refundCase,
  setupAuthority,
  withTriggersOff,
} from "./refund-test-kit";

/**
 * Commerce behavior test 8 (MS-09 phase A), the dispute half: an owner-entered
 * provider notice or a stand-in dispute event opens a dispute, an open dispute
 * pauses access and holds evidence, a win resumes and a loss revokes, and a
 * refund raced against an open dispute resolves by one written rule. Also the
 * dispute export's refund, dispute and communication sections.
 * Runs on the local database only (payment-test-kit refuses the rest).
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);
const NOTE = "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan.";

async function refundError(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof RefundError && error.code === code, `expected a refund error: ${code}`);
}

async function main() {
  const authority = await setupAuthority();
  const { admin, owner } = authority;
  const forged = { email: authority.otherEmail, userId: authority.otherId } as unknown as typeof owner;

  const prepare = (orderId: string, extra: { amountRupiah?: number } = {}) =>
    prepareRefund(admin, { orderId, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: NOTE, ...extra });
  const approve = (caseId: string) => refundCase(caseId).then((row) => approveRefund(owner, { caseId, expectedVersion: row.version, reason: FULL_REASON }, ENV));
  const execute = (caseId: string) => refundCase(caseId).then((row) => executeProviderRefund(owner, { caseId, expectedVersion: row.version }, { env: ENV, provider }));
  const dispute = (orderId: string, extra: Partial<Parameters<typeof recordDisputeNotice>[1]> = {}) =>
    recordDisputeNotice(owner, { orderId, providerDisputeId: `DSP-${randomUUID().slice(0, 8)}`, reasonText: "Pembeli menyangkal transaksi di bank.", ...extra }, ENV);
  const disputeRow = (disputeId: string) => prisma.paymentDispute.findUniqueOrThrow({ where: { id: disputeId } });
  const resolve = async (disputeId: string, outcome: "lost" | "won") =>
    resolveDispute(owner, { disputeId, expectedVersion: (await disputeRow(disputeId)).version, outcome, reason: "Hasil dari pemberitahuan penyedia." }, ENV);
  const processed = (received: Awaited<ReturnType<typeof deliver>>) => {
    assert.ok(received.status === "received" && received.result.status === "processed", "the event was processed");
    return received.result;
  };

  // ---- An owner-entered notice pauses access and holds evidence; won resumes, lost revokes ----------------------
  {
    const order = await paidOrder();
    assert.equal(await hasPaidAccess(order.buyerId), true);

    await assert.rejects(() => dispute(order.id, { }).then(() => recordDisputeNotice(forged, { orderId: order.id, providerDisputeId: "DSP-FORGED", reasonText: "Tidak sah." }, ENV)), (error: unknown) => error instanceof FraudAuthorityError);
    const baseline = await prisma.paymentDispute.count({ where: { orderId: order.id } });
    assert.equal(baseline, 1, "the first (genuine) notice was recorded, the forged one was not");

    const row = (await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: order.id } }));
    assert.equal(row.state, "open");
    assert.equal(row.source, "owner_notice");
    assert.equal(row.evidenceHold, true, "evidence is held while the dispute is open");
    assert.equal(row.accessPaused, true);
    assert.equal(row.amountRupiah, order.amountRupiah);
    assert.equal(row.providerPaymentId, order.providerReference);
    assert.equal(row.recordedByUserId, authority.ownerId);
    assert.equal((await getAccessState(order.buyerId)).status, "paused", "an open dispute pauses access");
    assert.equal(await hasPaidAccess(order.buyerId), false);
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), null, "a dispute stops the order from verifying the buyer");

    // One live dispute per payment, and the same notice twice is not a new dispute.
    await refundError(() => dispute(order.id), "wrong_state");
    await refundError(() => dispute(order.id, { providerDisputeId: row.providerDisputeId }), "wrong_state");
    await refundError(() => dispute(order.id, { amountRupiah: order.amountRupiah + 1, providerDisputeId: "DSP-OTHER" }), "invalid_input");
    await refundError(() => dispute(randomUUID()), "not_found");
    const unpaid = await makeOrder();
    await refundError(() => dispute(unpaid.id), "not_refundable");

    // Resolving: stale versions and non-owners are refused; the decision is final.
    await refundError(() => resolveDispute(owner, { disputeId: row.id, expectedVersion: 7, outcome: "won", reason: FULL_REASON }, ENV), "stale_version");
    await assert.rejects(() => resolveDispute(forged, { disputeId: row.id, expectedVersion: 1, outcome: "won", reason: FULL_REASON }, ENV), (error: unknown) => error instanceof FraudAuthorityError);
    await refundError(() => resolveDispute(owner, { disputeId: row.id, expectedVersion: 1, outcome: "maybe", reason: FULL_REASON }, ENV), "invalid_input");
    assert.equal((await disputeRow(row.id)).state, "open");

    await resolve(row.id, "won");
    const won = await disputeRow(row.id);
    assert.equal(won.state, "won");
    assert.equal(won.evidenceHold, false);
    assert.equal(won.accessEffect, "resumed");
    assert.equal(won.resolutionSource, "owner");
    assert.equal((await getAccessState(order.buyerId)).status, "active", "a win resumes access");
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), null, "a won dispute still happened");
    await refundError(() => resolve(row.id, "lost"), "wrong_state");
    await assert.rejects(() => prisma.$executeRaw`UPDATE payment_disputes SET state = 'lost' WHERE id = ${row.id}::uuid`, /cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM payment_disputes WHERE id = ${row.id}::uuid`, /never deleted/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE payment_dispute_events SET note = 'x' WHERE dispute_id = ${row.id}::uuid`, /append-only/u);
    const history = await prisma.paymentDisputeEvent.findMany({ orderBy: { createdAt: "asc" }, where: { disputeId: row.id } });
    assert.deepEqual(history.map((event) => event.kind), ["opened", "resolved_won"]);

    // A second dispute on the same payment, lost: access ends and the amount is gone from the balance.
    const second = await dispute(order.id);
    assert.equal((await getAccessState(order.buyerId)).status, "paused");
    await resolve(second.disputeId, "lost");
    const lost = await disputeRow(second.disputeId);
    assert.equal(lost.state, "lost");
    assert.equal(lost.accessEffect, "revoked");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked", "a loss revokes access");
    await refundError(() => prepare(order.id), "balance_exceeded");
    assert.ok(await prisma.auditLog.count({ where: { action: { in: ["dispute.opened", "dispute.won", "dispute.lost"] }, targetId: order.id } }) >= 4);
    pass("owner notice: opens, pauses, holds evidence; won resumes; lost revokes");
  }

  // ---- MS-19 M-03: a win lifts only a pause the dispute itself caused ---------------------------------------------
  {
    // An admin paused this buyer for another reason first. A dispute opens and is won: the admin's pause stays.
    const order = await paidOrder();
    await pauseAccess({ actorUserId: authority.ownerId, idempotencyKey: `admin-pause:${order.id}`, reason: "Dijeda admin karena alasan lain", source: "admin", studentId: order.buyerId });
    assert.equal((await getAccessState(order.buyerId)).status, "paused");
    const opened = await dispute(order.id);
    const heldRow = await disputeRow(opened.disputeId);
    assert.equal(heldRow.accessPaused, true, "the dispute holds access while it is open");
    assert.equal(heldRow.pauseCaused, false, "…but it did not cause the pause");
    assert.equal(heldRow.accessEffect, "already_paused");
    await resolve(opened.disputeId, "won");
    const wonRow = await disputeRow(opened.disputeId);
    assert.equal(wonRow.accessEffect, "pause_not_from_dispute");
    assert.equal((await getAccessState(order.buyerId)).status, "paused", "winning does not undo the admin's pause");

    // A dispute that did cause the pause still resumes it when won.
    const own = await paidOrder();
    const ownDispute = await dispute(own.id);
    assert.equal((await disputeRow(ownDispute.disputeId)).pauseCaused, true);
    await resolve(ownDispute.disputeId, "won");
    assert.equal((await disputeRow(ownDispute.disputeId)).accessEffect, "resumed");
    assert.equal((await getAccessState(own.buyerId)).status, "active");

    // Two open disputes: the first caused the pause, the second joined it. Winning the first leaves the
    // pause with the second, and winning the second then lifts it.
    const chain = await paidOrder();
    // The day's purchase counter would refuse a second order for this buyer, so it is cleared for the fixture.
    await prisma.$executeRaw`UPDATE risk_day_buckets SET purchase_count = 0, amount_rupiah = 0 WHERE user_id = ${chain.buyerId}::uuid`;
    const chainSecond = await paidOrder({ buyerId: chain.buyerId });
    const first = await dispute(chain.id);
    const secondOpen = await dispute(chainSecond.id);
    assert.equal((await disputeRow(first.disputeId)).pauseCaused, true);
    assert.equal((await disputeRow(secondOpen.disputeId)).pauseCaused, false);
    await resolve(first.disputeId, "won");
    assert.equal((await disputeRow(first.disputeId)).accessEffect, "still_paused_other_dispute");
    assert.equal((await disputeRow(secondOpen.disputeId)).pauseCaused, true, "the pause passed to the dispute still open");
    assert.equal((await getAccessState(chain.buyerId)).status, "paused");
    await resolve(secondOpen.disputeId, "won");
    assert.equal((await getAccessState(chain.buyerId)).status, "active", "the last win lifts the pause the disputes caused");

    // A dispute that was already open before this change does not own the pause: winning it leaves access alone.
    const legacy = await paidOrder();
    const old = await dispute(legacy.id);
    // While a dispute is open the flag only moves one way (the database refuses clearing it); the fixture clears it with triggers off.
    await assert.rejects(() => prisma.$executeRaw`UPDATE payment_disputes SET pause_caused = false WHERE id = ${old.disputeId}::uuid`, /only gains access and refund notes/u);
    await withTriggersOff("payment_disputes", (tx) => tx.$executeRaw`UPDATE payment_disputes SET pause_caused = false WHERE id = ${old.disputeId}::uuid`);
    await resolve(old.disputeId, "won");
    assert.equal((await disputeRow(old.disputeId)).accessEffect, "pause_not_from_dispute");
    assert.equal((await getAccessState(legacy.buyerId)).status, "paused");
    pass("a won dispute lifts only a pause it caused: an admin's earlier pause stays, a chain of disputes hands the pause on, an older dispute leaves access alone");
  }

  // ---- A stand-in dispute event does the same, through the inbox ---------------------------------------------------
  {
    const order = await paidOrder();
    const disputeId = `DSP-EVT-${randomUUID().slice(0, 8)}`;
    const opened = await provider.buildSignedDisputeEventFor(order.reference, "dispute.opened", new Date(), { providerDisputeId: disputeId, reason: "Transaksi tidak dikenali", responseDueAt: new Date(Date.now() + 7 * 86_400_000) });
    assert.equal(processed(await deliver(opened)).outcome, "accepted");
    const row = await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(row.source, "provider_event");
    assert.equal(row.providerDisputeId, disputeId);
    assert.equal(row.reasonText, "Transaksi tidak dikenali");
    assert.ok(row.responseDueAt);
    assert.ok(row.paymentEventId, "linked to the event that opened it");
    assert.equal(row.recordedByUserId, null);
    assert.equal((await getAccessState(order.buyerId)).status, "paused");

    // The same event again is a duplicate; the same dispute under a new event is ignored.
    const repeat = await deliver(opened);
    assert.ok(repeat.status === "received" && repeat.result.status === "duplicate");
    const again = await provider.buildSignedDisputeEventFor(order.reference, "dispute.opened", new Date(), { providerDisputeId: disputeId });
    assert.equal(processed(await deliver(again)).outcome, "ignored");
    assert.equal(await prisma.paymentDispute.count({ where: { orderId: order.id } }), 1);

    // A different dispute while one is open, and one larger than the payment, are kept for review and not applied.
    const second = await provider.buildSignedDisputeEventFor(order.reference, "dispute.opened", new Date(), { providerDisputeId: "DSP-EVT-SECOND" });
    assert.equal(processed(await deliver(second)).outcome, "review");
    const tooBig = await provider.buildSignedDisputeEventFor(order.reference, "dispute.opened", new Date(), { amountRupiah: order.amountRupiah + 1, providerDisputeId: "DSP-EVT-BIG" });
    assert.equal(processed(await deliver(tooBig)).outcome, "review");
    assert.equal(await prisma.paymentDispute.count({ where: { orderId: order.id } }), 1);
    assert.ok(await prisma.fraudCase.count({ where: { orderId: order.id, signal: "payment_review" } }) >= 1, "kept for review as a case");

    // A forged signature, and an event for a payment that never settled.
    const forgedEvent = await provider.buildSignedDisputeEventFor(order.reference, "dispute.lost", new Date(), { providerDisputeId: disputeId });
    assert.equal((await deliver({ body: forgedEvent.body, headers: { ...forgedEvent.headers, "x-stand-in-signature": "v1=00" } })).status, "refused");
    const pending = await makeOrder();
    const uncaptured = await provider.buildSignedDisputeEventFor(pending.reference, "dispute.opened", new Date(), { providerDisputeId: "DSP-NOCAPTURE" });
    assert.equal(processed(await deliver(uncaptured)).outcome, "review");
    assert.equal(await prisma.paymentDispute.count({ where: { orderId: pending.id } }), 0);

    // Won resumes; an unknown dispute and a contradicting resolution are kept for review only.
    const won = await provider.buildSignedDisputeEventFor(order.reference, "dispute.won", new Date(), { providerDisputeId: disputeId });
    assert.equal(processed(await deliver(won)).outcome, "accepted");
    let resolved = await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(resolved.state, "won");
    assert.equal(resolved.resolutionSource, "provider_event");
    assert.equal(resolved.evidenceHold, false);
    assert.equal((await getAccessState(order.buyerId)).status, "active");
    const duplicateWin = await provider.buildSignedDisputeEventFor(order.reference, "dispute.won", new Date(), { providerDisputeId: disputeId });
    assert.equal(processed(await deliver(duplicateWin)).outcome, "ignored");
    const contradiction = await provider.buildSignedDisputeEventFor(order.reference, "dispute.lost", new Date(), { providerDisputeId: disputeId });
    assert.equal(processed(await deliver(contradiction)).outcome, "review");
    const unknown = await provider.buildSignedDisputeEventFor(order.reference, "dispute.lost", new Date(), { providerDisputeId: "DSP-NEVER-OPENED" });
    assert.equal(processed(await deliver(unknown)).outcome, "review");
    resolved = await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(resolved.state, "won", "a late or contradicting event never rewrites a resolved dispute");
    assert.equal((await getAccessState(order.buyerId)).status, "active");

    // Lost by event revokes.
    const other = await paidOrder();
    await deliver(await provider.buildSignedDisputeEventFor(other.reference, "dispute.opened", new Date(), { providerDisputeId: "DSP-EVT-LOST" }));
    assert.equal(processed(await deliver(await provider.buildSignedDisputeEventFor(other.reference, "dispute.lost", new Date(), { providerDisputeId: "DSP-EVT-LOST" }))).outcome, "accepted");
    assert.equal((await getAccessState(other.buyerId)).status, "revoked");
    pass("stand-in dispute events: opened, won, lost, duplicates, contradictions, forgeries");
  }

  // ---- The refund-versus-dispute rule --------------------------------------------------------------------------------
  // 1. Nothing is approved or sent to the provider while a dispute is open on the payment.
  // 2. A refund already with the provider is not recalled: it finishes or fails on its confirmation, and the
  //    dispute is flagged for the owner (refund_in_flight, a case and an alert).
  // 3. A refund not sent yet is held while the dispute is open; if the dispute is lost it is cancelled (the
  //    provider already took the money back); if won, it can go ahead.
  {
    const order = await paidOrder();
    const approved = await prepare(order.id, { amountRupiah: 20_000 });
    await approve(approved.caseId);
    const waiting = await prepare(order.id, { amountRupiah: 10_000 });

    const opened = await dispute(order.id);
    await refundError(() => execute(approved.caseId), "dispute_open");
    await refundError(() => approve(waiting.caseId), "dispute_open");
    await refundError(() => refundCase(approved.caseId).then((row) => recordManualTransfer(owner, {
      caseId: approved.caseId, destinationHolder: "buyer", destinationMasked: "BCA ••••1234", expectedVersion: row.version,
      proofNote: "Bukti transfer disimpan oleh keuangan.", reason: "Sudah dicek di mutasi.", transferReference: "TRX-RACE-1",
    }, ENV)), "dispute_open");
    assert.equal((await refundCase(approved.caseId)).state, "approved", "held, not sent");
    assert.equal((await refundCase(waiting.caseId)).state, "prepared");
    assert.equal((await disputeRow(opened.disputeId)).refundInFlight, false);
    assert.equal(opened.heldRefunds, 2);

    // The database refuses it as well, whatever the application did.
    await assert.rejects(
      () => prisma.$transaction(async (tx) => {
        const row = await tx.refundCase.findUniqueOrThrow({ where: { id: approved.caseId } });
        const [event] = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO refund_case_events (case_id, case_version, kind, actor_kind) VALUES (${row.id}::uuid, ${row.version + 1}, 'execution_started', 'owner') RETURNING id
        `;
        await tx.$executeRaw`
          UPDATE refund_cases SET state = 'processing', version = ${row.version + 1}, last_event_id = ${event.id}::uuid, method = 'provider',
            execution_attempts = 1, last_attempt_at = now() WHERE id = ${row.id}::uuid
        `;
      }),
      /dispute is open/u,
    );

    // Cancelling is still allowed while a dispute is open.
    await cancelRefund(owner, { caseId: waiting.caseId, expectedVersion: 1, reason: "Menunggu sengketa selesai dulu." }, ENV);

    // Won: the held refund may go ahead.
    await resolve(opened.disputeId, "won");
    assert.equal((await execute(approved.caseId)).result, "sent");
    await prisma.$executeRaw`UPDATE stand_in_refunds SET state = 'pending' WHERE reference = ${(await refundCase(approved.caseId)).reference}`;
    pass("rule 1 and 3: nothing is approved or sent while a dispute is open; won lets a held refund go ahead");
  }

  {
    // Lost: the unsent refund is cancelled; the lost amount counts against the balance.
    const order = await paidOrder();
    const held = await prepare(order.id, { amountRupiah: 20_000 });
    await approve(held.caseId);
    const prepared = await prepare(order.id, { amountRupiah: 5_000 });
    const opened = await dispute(order.id, { amountRupiah: 30_000 });
    await resolve(opened.disputeId, "lost");
    for (const id of [held.caseId, prepared.caseId]) {
      const row = await refundCase(id);
      assert.equal(row.state, "cancelled");
      assert.match(row.closureReason ?? "", /Sengketa kalah/u);
      assert.equal(row.evidenceHold, false);
    }
    const events = await prisma.refundCaseEvent.findMany({ where: { caseId: held.caseId }, orderBy: { createdAt: "asc" } });
    assert.equal(events.at(-1)?.actorKind, "system");
    // 49.000 captured, 30.000 taken back: 19.000 is all that can still be refunded.
    await refundError(() => prepare(order.id, { amountRupiah: 19_001 }), "balance_exceeded");
    const rest = await prepare(order.id, { amountRupiah: 19_000 });
    await approve(rest.caseId);
    pass("rule 3: a lost dispute cancels unsent refunds and uses up its amount");
  }

  {
    // Rule 2: the refund is already with the provider when the dispute arrives.
    const order = await paidOrder();
    const sent = await prepare(order.id);
    await approve(sent.caseId);
    assert.equal((await execute(sent.caseId)).result, "sent");
    const reference = (await refundCase(sent.caseId)).reference;

    const event = await provider.buildSignedDisputeEventFor(order.reference, "dispute.opened", new Date(), { providerDisputeId: "DSP-RACE-INFLIGHT" });
    assert.equal(processed(await deliver(event)).outcome, "accepted");
    const row = await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: order.id } });
    assert.equal(row.refundInFlight, true, "the dispute knows a refund was already on its way");
    assert.equal(await prisma.fraudCase.count({ where: { orderId: order.id, signal: "payment_review" } }), 1, "the owner gets a case");
    assert.equal(await prisma.paymentOutbox.count({ where: { dedupeKey: `alert:dispute:${row.id}` } }), 1, "and an alert");
    assert.equal((await refundCase(sent.caseId)).state, "processing", "the refund is not recalled");

    // It still finishes on its confirmation, and then the dispute outcome applies.
    const settled = await provider.settleRefund(reference, "succeeded", new Date());
    assert.equal(processed(await deliver(settled!)).outcome, "accepted");
    assert.equal((await refundCase(sent.caseId)).state, "completed");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked");
    await resolve(row.id, "lost");
    assert.equal((await prisma.fraudCase.count({ where: { orderId: order.id, signal: "payment_review" } })) >= 1, true);
    assert.equal(await prisma.paymentOutbox.count({ where: { dedupeKey: `alert:dispute-resolved:${row.id}` } }), 1, "refunded and charged back: the owner is alerted");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked");
    pass("rule 2: a refund already with the provider finishes; the dispute is flagged");
  }

  {
    // The race itself: a refund is sent and a dispute is recorded at the same moment. Each way round
    // must end in a state the rule allows: either the dispute came first and the refund was refused, or
    // the refund came first and the dispute knows about it.
    let disputeFirst = 0;
    let refundFirst = 0;
    for (let i = 0; i < 6; i += 1) {
      const order = await paidOrder();
      const prepared = await prepare(order.id);
      await approve(prepared.caseId);
      const version = (await refundCase(prepared.caseId)).version;

      const [sent, recorded] = await Promise.allSettled([
        executeProviderRefund(owner, { caseId: prepared.caseId, expectedVersion: version }, { env: ENV, provider }),
        dispute(order.id),
      ]);
      assert.equal(recorded.status, "fulfilled", "the dispute is always recorded");
      const row = await refundCase(prepared.caseId);
      const opened = await prisma.paymentDispute.findFirstOrThrow({ where: { orderId: order.id } });

      if (sent.status === "fulfilled") {
        refundFirst += 1;
        assert.equal(row.state, "processing");
        assert.equal(opened.refundInFlight, true, "refund first: the dispute is flagged");
      } else {
        disputeFirst += 1;
        assert.ok(sent.reason instanceof RefundError && sent.reason.code === "dispute_open", "dispute first: the refund is refused");
        assert.equal(row.state, "approved");
        assert.equal(opened.refundInFlight, false);
        assert.equal(await prisma.standInRefund.count({ where: { reference: row.reference } }), 0, "nothing reached the provider");
      }
    }
    assert.equal(disputeFirst + refundFirst, 6);

    // Approval against a dispute racing it.
    for (let i = 0; i < 4; i += 1) {
      const order = await paidOrder();
      const prepared = await prepare(order.id);
      const [approval, recorded] = await Promise.allSettled([approve(prepared.caseId), dispute(order.id)]);
      assert.equal(recorded.status, "fulfilled");
      const row = await refundCase(prepared.caseId);
      if (approval.status === "fulfilled") assert.equal(row.state, "approved", "approved first, then held by the dispute");
      else {
        assert.ok(approval.reason instanceof RefundError && approval.reason.code === "dispute_open");
        assert.equal(row.state, "prepared");
      }
      // In neither case can the refund be sent while the dispute is open.
      if (row.state === "approved") await refundError(() => execute(prepared.caseId), "dispute_open");
    }
    pass("the refund-versus-dispute race resolves the same way every time");
  }

  // ---- Export: refund, dispute and communication sections -----------------------------------------------------------
  {
    const buyerId = await makeBuyer("exported");
    const intent = await makeIntent(buyerId, 49_000, null, { termsVersion: "2026-11-04.1" });
    const created = await createOrderFromIntent({
      buyerId, buyerIp: randomBuyerIp(), buyerIpExemption: null, buyerIpSource: "trusted-proxy:1",
      intent, packageCode: await getPackageCode(), provider,
    });
    assert.ok(created.ok);
    assert.ok((await ensurePaymentSession(created.order, provider, APP_ORIGIN)).ok);
    const settled = await provider.settle(created.order.reference, "succeeded", new Date());
    await deliver(settled!);
    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: created.order.id } });

    // A partial refund by manual transfer, and a lost dispute.
    const refund = await prisma.$transaction(async () => prepareRefund(authority.adminAsOwner, {
      amountRupiah: 10_000, orderId: order.id, reasonCode: "double_charge", requestChannel: "email", requestNote: "Pembeli tertagih dua kali, ada tangkapan layar.",
    }));
    await approve(refund.caseId);
    await recordManualTransfer(owner, {
      caseId: refund.caseId, destinationHolder: "parent", destinationMasked: "BCA ••••1234 a.n. Wali", expectedVersion: 2,
      proofNote: "Bukti transfer disimpan oleh keuangan.", reason: "Sudah dicek di mutasi.", transferReference: "TRX-EXPORT-1",
    }, ENV);
    const opened = await dispute(order.id, { amountRupiah: 20_000, providerDisputeId: "DSP-EXPORT-1" });
    await resolve(opened.disputeId, "won");

    const exported = await createDisputeExport(owner, { env: ENV, orderId: order.id, reason: "Menyiapkan jawaban sengketa ke penyedia." });
    const fileText = (await prisma.disputeExport.findUniqueOrThrow({ where: { id: exported.exportId } })).packet!;
    assert.equal(verifyPacketFile(fileText), true, "the digest verifies");
    const packet = (JSON.parse(fileText) as { packet: Record<string, any> }).packet; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(packet.manifest.packetVersion, 3, "MS-10 added the retention section, so packets are version 3");
    assert.ok(packet.manifest.sections.includes("refunds") && packet.manifest.sections.includes("disputes"));
    assert.equal(packet.manifest.counts.refundCases, 1);
    assert.equal(packet.manifest.counts.disputes, 1);

    assert.equal(packet.refunds.records.length, 1);
    const record = packet.refunds.records[0];
    assert.equal(record.state, "completed");
    assert.equal(record.amountRupiah, 10_000);
    assert.equal(record.reasonCode, "double_charge");
    assert.equal(record.preparedByEmail, authority.adminAsOwner.email);
    assert.equal(record.approvedByEmail, authority.adminAsOwner.email);
    assert.equal(record.selfApproved, true, "self-approval is disclosed in the evidence pack");
    assert.equal(record.approvalReason, FULL_REASON);
    assert.equal(record.method, "manual_transfer");
    assert.equal(record.destinationMasked, "BCA ••••1234 a.n. Wali");
    assert.equal(record.destinationHolder, "parent");
    assert.equal(record.transferReference, "TRX-EXPORT-1");
    assert.equal(record.eligibilityPrepared.eligible, true);
    assert.deepEqual(record.events.map((event: { kind: string }) => event.kind), ["prepared", "approved", "completed"]);
    assert.equal(packet.disputes.records.length, 1);
    assert.equal(packet.disputes.records[0].state, "won");
    assert.equal(packet.disputes.records[0].providerDisputeId, "DSP-EXPORT-1");
    assert.deepEqual(packet.disputes.records[0].events.map((event: { kind: string }) => event.kind), ["opened", "resolved_won"]);

    assert.equal(packet.communications.buyerRefundRequests.length, 1);
    assert.equal(packet.communications.buyerRefundRequests[0].channel, "email");
    assert.match(packet.communications.buyerRefundRequests[0].summary, /tertagih dua kali/u);
    assert.equal(packet.communications.disputeNotices[0].providerDisputeId, "DSP-EXPORT-1");
    assert.ok(packet.communications.receiptDeliveries.length >= 1);
    const sources = new Set(packet.financialTimeline.map((entry: { source: string }) => entry.source));
    assert.ok(sources.has("refund") && sources.has("dispute"), "the timeline carries refunds and disputes");
    assert.ok(packet.financialTimeline.some((entry: { source: string; label: string }) => entry.source === "audit" && entry.label === "refund.completed"));
    assert.ok(!packet.financialTimeline.some((entry: { label: string }) => entry.label.startsWith("dispute.export")), "export bookkeeping is not part of the money story");
    assert.doesNotMatch(fileText, /not-a-real-hash/u, "no credentials");

    // The terms text is the version the buyer agreed to, not the current one.
    assert.equal(packet.acceptedTerms.version, "2026-11-04.1");
    assert.equal(packet.acceptedTerms.text.length, 6);
    assert.notEqual(packet.acceptedTerms.version, PURCHASE_TERMS.version);

    const claimed = await claimDisputeExport(owner, exported.token, ENV);
    assert.ok(claimed.ok);
    assert.equal(sealPacket({ x: 1 }).digest.method.length > 0, true);
    pass("export: refund, dispute and communication sections, with self-approval disclosed");
  }

  await cleanUp();
  console.log(`Dispute checks passed: ${checks.join("; ")}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
