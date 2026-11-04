import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { ProviderOutcomeUnknownError, type PaymentProviderAdapter } from "../lib/payments/adapter";
import { getAccessState, grantAccess } from "../lib/billing/service";
import { FraudAuthorityError, FraudValidationError } from "../lib/fraud/errors";
import { PURCHASE_TERMS, TERMS_VERSIONS, getTermsByVersion } from "../lib/fulfillment/terms";
import { recordPaidUse } from "../lib/fulfillment/usage";
import { findStandingPaidOrder } from "../lib/payments/risk/tier";
import { approveRefund, cancelRefund, prepareRefund, rejectRefund } from "../lib/refunds/cases";
import { evaluateEligibility } from "../lib/refunds/eligibility";
import { RefundError } from "../lib/refunds/errors";
import { executeProviderRefund, reconcileRefund, recordManualTransfer, requireMaskedDestination } from "../lib/refunds/execute";
import { flagStalledRefunds, runRefundMaintenance } from "../lib/refunds/maintenance";
import { acceptReviewedOrder } from "../lib/refunds/review";
import { requireOwner } from "../lib/fraud/authority";
import { deliver } from "./payment-test-kit";
import {
  ENV,
  FULL_REASON,
  cleanUp,
  makeBuyer,
  paidOrder,
  prisma,
  provider,
  refundCase,
  reviewOrder,
  setupAuthority,
  signedEventFor,
  withTriggersOff,
} from "./refund-test-kit";

/**
 * Commerce behavior test 8 (MS-09 phase A), the refund half: eligibility the
 * system decides, owner-only approval and self-approval, a refundable balance
 * that concurrent and partial refunds cannot exceed, provider and manual
 * execution, a timeout that leads to a reconcile, terminal states that never
 * come back, and what a confirmed refund does to access, the purchase summary,
 * the limits and the tier. Disputes and the export are in test-disputes.ts.
 * Test 7 (3DS) does not apply: payments are QRIS and e-wallets, no cards.
 * Runs on the local database only (payment-test-kit refuses the rest).
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const NOTE = "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan.";
const dayMs = 86_400_000;

async function refundError(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof RefundError && error.code === code, `expected a refund error: ${code}`);
}

async function main() {
  const authority = await setupAuthority();
  const { admin, owner } = authority;

  const prepare = (orderId: string, reasonCode: string, extra: { amountRupiah?: number; requestedAt?: Date } = {}, who = admin) =>
    prepareRefund(who, { orderId, reasonCode, requestChannel: "whatsapp", requestNote: NOTE, ...extra });
  const approve = (caseId: string, revokeAccess = false, reason = FULL_REASON) =>
    refundCase(caseId).then((row) => approveRefund(owner, { caseId, expectedVersion: row.version, reason, revokeAccess }, ENV));
  const execute = (caseId: string, deps: { provider: PaymentProviderAdapter | null } = { provider }) =>
    refundCase(caseId).then((row) => executeProviderRefund(owner, { caseId, expectedVersion: row.version }, { env: ENV, ...deps }));
  const settle = async (reference: string, outcome: "failed" | "succeeded") => {
    const event = await provider.settleRefund(reference, outcome, new Date());
    assert.ok(event, "the stand-in had a pending refund to settle");
    return deliver(event);
  };

  // ---- Eligibility: decided by the system, on database time ---------------------------------------
  {
    const order = await paidOrder();
    const paidAt = order.paidAt!;
    const at = (offsetMs: number) => new Date(paidAt.getTime() + offsetMs);

    const onTheDay = await evaluateEligibility(prisma, { asOf: at(3 * dayMs), orderId: order.id, reasonCode: "change_of_mind" });
    assert.equal(onTheDay.eligible, true, "exactly 3 days after payment is still inside the window");
    assert.equal(onTheDay.rule, "change_of_mind_ok");
    const late = await evaluateEligibility(prisma, { asOf: at(3 * dayMs + 1000), orderId: order.id, reasonCode: "change_of_mind" });
    assert.equal(late.eligible, false);
    assert.equal(late.rule, "change_of_mind_window_passed");
    const defaultClock = await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "change_of_mind" });
    const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    assert.equal(defaultClock.eligible, true, "a fresh payment is inside the window on database time");
    assert.ok(Math.abs(new Date(defaultClock.evaluatedAt).getTime() - now.getTime()) < 5000, "evaluated on the database's clock");

    for (const code of ["double_charge", "wrong_amount", "access_not_delivered", "service_unavailable"]) {
      const faulty = await evaluateEligibility(prisma, { asOf: at(60 * dayMs), orderId: order.id, reasonCode: code as "double_charge" });
      assert.equal(faulty.eligible, true, `${code}: our fault is always eligible, however late`);
      assert.equal(faulty.rule, "our_fault");
    }

    // Used: one usage row ends change-of-mind eligibility, not our-fault.
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { orderId: order.id } }), 0);
    await recordPaidUse(order.buyerId);
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { orderId: order.id } }), 1);
    const used = await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "change_of_mind" });
    assert.equal(used.eligible, false);
    assert.equal(used.rule, "change_of_mind_used");
    assert.equal(used.usageRows, 1);
    const both = await evaluateEligibility(prisma, { asOf: at(4 * dayMs), orderId: order.id, reasonCode: "change_of_mind" });
    assert.equal(both.rule, "change_of_mind_window_and_used");
    assert.equal((await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "wrong_amount" })).eligible, true);
    pass("eligibility: 3-day boundary on database time, used vs unused, our fault always");
  }

  // ---- MS-19 M-01: a failed usage write is a gap, and a gap counts as use ----------------------------
  {
    // A client whose usage write (and, when asked, gap write) fails, handed to recordPaidUse; everything else is the real client.
    const failingDb = (failGap: boolean) => ({
      $executeRaw: ((strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = Array.isArray(strings) ? strings.join("?") : "";
        if (text.includes("INSERT INTO fulfillment_usage_events")) return Promise.reject(new Error("simulated write failure"));
        if (failGap && text.includes("INSERT INTO fulfillment_usage_gaps")) return Promise.reject(new Error("simulated gap failure"));
        return prisma.$executeRaw(strings, ...values);
      }) as typeof prisma.$executeRaw,
    });

    const order = await paidOrder();
    await recordPaidUse(order.buyerId, failingDb(false));
    await recordPaidUse(order.buyerId, failingDb(false));
    assert.equal(await prisma.fulfillmentUsageEvent.count({ where: { orderId: order.id } }), 0, "the usage row was not written");
    assert.equal(await prisma.fulfillmentUsageGap.count({ where: { studentId: order.buyerId } }), 1, "a gap was recorded instead, once for the day");
    const gapCheck = await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "change_of_mind" });
    assert.equal(gapCheck.usageRows, 0);
    assert.equal(gapCheck.usageGaps, 1);
    assert.equal(gapCheck.eligible, false, "a failed usage write is not read as 'not used'");
    assert.equal(gapCheck.rule, "change_of_mind_used");
    assert.equal((await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "wrong_amount" })).eligible, true, "our fault is unaffected");
    const [{ eligible }] = await prisma.$queryRaw<Array<{ eligible: boolean }>>`SELECT refund_change_of_mind_eligible(${order.id}::uuid, now()) AS eligible`;
    assert.equal(eligible, false, "the database's own recheck at approval agrees");
    const prepared = await prepare(order.id, "change_of_mind");
    assert.equal(prepared.eligibility.eligible, false);

    // A gap from before the payment is not about this order; a quiet order stays eligible.
    const calm = await paidOrder();
    await prisma.$executeRaw`
      INSERT INTO fulfillment_usage_gaps (student_id, occurred_at, jakarta_day)
      SELECT ${calm.buyerId}::uuid, o.paid_at - interval '1 hour', date '2020-01-01' FROM payment_orders o WHERE o.id = ${calm.id}::uuid
    `;
    assert.equal((await evaluateEligibility(prisma, { orderId: calm.id, reasonCode: "change_of_mind" })).eligible, true);
    const [{ calmEligible }] = await prisma.$queryRaw<Array<{ calmEligible: boolean }>>`SELECT refund_change_of_mind_eligible(${calm.id}::uuid, now()) AS "calmEligible"`;
    assert.equal(calmEligible, true);

    // If the gap cannot be written either, the student's page still loads (nothing throws).
    const other = await paidOrder();
    await recordPaidUse(other.buyerId, failingDb(true));
    assert.equal(await prisma.fulfillmentUsageGap.count({ where: { studentId: other.buyerId } }), 0);

    // Gaps are append-only.
    await assert.rejects(prisma.$executeRaw`UPDATE fulfillment_usage_gaps SET occurred_at = now() WHERE student_id = ${order.buyerId}::uuid`);
    await assert.rejects(prisma.$executeRaw`DELETE FROM fulfillment_usage_gaps WHERE student_id = ${order.buyerId}::uuid`);
    pass("a failed usage write records a gap, a gap counts as use for change of mind (in the app and in the database), and the page still loads");
  }

  // ---- Eligibility of an order held in review: the window runs from when the money arrived ----------
  {
    const held = await reviewOrder();
    assert.equal(held.paidAt, null);
    const row = await evaluateEligibility(prisma, { orderId: held.id, reasonCode: "change_of_mind" });
    assert.ok(row.paidAt, "the capture time stands in for paid_at");
    assert.equal(row.eligible, true);
    pass("eligibility of an order in review uses the capture time");
  }

  // ---- Preparing: any admin; the system writes the check; the preparer cannot make it eligible ------
  {
    const order = await paidOrder();
    await recordPaidUse(order.buyerId);
    const prepared = await prepare(order.id, "change_of_mind");
    assert.equal(prepared.eligibility.eligible, false);
    const row = await refundCase(prepared.caseId);
    assert.equal(row.state, "prepared");
    assert.equal(row.version, 1);
    assert.equal(row.preparedByUserId, authority.otherId, "any MFA admin can prepare");
    assert.equal(row.amountRupiah, order.amountRupiah, "the default is the whole payment");
    assert.equal(row.currency, "IDR");
    assert.equal(row.reasonCategory, "change_of_mind");
    assert.equal(row.requestChannel, "whatsapp");
    assert.equal(row.providerPaymentId, order.providerReference);
    assert.match(row.reference, /^rf_[0-9a-f]{24}$/u);
    assert.ok(row.decisionDueAt.getTime() > row.requestedAt.getTime());
    assert.equal((row.eligibilityPrepared as { eligible: boolean }).eligible, false);
    assert.equal(row.evidenceHold, true);

    // Inputs are checked; a future request date or an unknown reason is refused.
    await refundError(() => prepare(order.id, "because"), "invalid_input");
    await refundError(() => prepare(order.id, "wrong_amount", { requestedAt: new Date(Date.now() + dayMs) }), "invalid_input");
    await refundError(() => prepare(order.id, "wrong_amount", { amountRupiah: 0 }), "invalid_input");
    await refundError(() => prepare(order.id, "wrong_amount", { amountRupiah: order.amountRupiah + 1 }), "balance_exceeded");
    await refundError(() => prepare(randomUUID(), "wrong_amount"), "not_found");
    const pending = await prisma.paymentOrder.findFirstOrThrow({ where: { buyerId: (await makeBuyer("unpaid")), status: "pending" } }).catch(() => null);
    assert.equal(pending, null);

    // Decision due: 3 working days (Mon-Fri, Asia/Jakarta) after the request.
    const friday = new Date("2026-11-06T03:00:00Z"); // Friday 10:00 WIB
    const dueFromFriday = (await import("../lib/fraud/appeals")).addWorkingDays(friday, 3);
    assert.equal(dueFromFriday.toISOString(), "2026-11-11T03:00:00.000Z", "Friday + 3 working days is Wednesday");

    // The owner cannot approve it: the system's check is the rule.
    await refundError(() => approve(prepared.caseId), "ineligible");
    assert.equal((await refundCase(prepared.caseId)).state, "prepared");

    // ...and the database refuses it too, whatever a buggy caller stored.
    await assert.rejects(
      () => prisma.$transaction(async (tx) => {
        const [event] = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO refund_case_events (case_id, case_version, kind, actor_kind) VALUES (${prepared.caseId}::uuid, 2, 'approved', 'owner') RETURNING id
        `;
        await tx.$executeRaw`
          UPDATE refund_cases SET state = 'approved', version = 2, last_event_id = ${event.id}::uuid,
            approved_by_user_id = ${authority.ownerId}::uuid, approved_at = now(), approval_reason = 'alasan yang cukup panjang',
            self_approved = false, eligibility_approved = '{"eligible": true}'::jsonb, payout_due_at = now() + interval '14 days'
          WHERE id = ${prepared.caseId}::uuid
        `;
      }),
      /eligibility check/u,
    );

    // Our fault on the same order is fine, at any time and with usage.
    const fault = await prepare(order.id, "wrong_amount");
    assert.equal(fault.eligibility.eligible, true);
    await approve(fault.caseId);
    pass("preparing: system check; owner cannot approve an ineligible change of mind");
  }

  // ---- Authority: owner approves, with a written reason; self-approval is recorded ------------------
  {
    const order = await paidOrder();
    const prepared = await prepare(order.id, "change_of_mind", { amountRupiah: 20_000 });

    assert.throws(() => requireOwner(authority.sessionFor(authority.otherEmail, { id: authority.otherId }), ENV), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner");
    assert.throws(() => requireOwner(authority.sessionFor((ENV.FRAUD_OWNER_EMAIL), { id: authority.ownerId, mfa: "challenge" }), ENV), (error: unknown) => error instanceof FraudAuthorityError && error.code === "mfa_required");

    // A forged owner context is refused against the database.
    const forged = { email: authority.otherEmail, userId: authority.otherId } as unknown as typeof owner;
    await assert.rejects(
      () => approveRefund(forged, { caseId: prepared.caseId, expectedVersion: 1, reason: FULL_REASON }, ENV),
      (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner",
    );
    // A written reason is required.
    await assert.rejects(
      () => approveRefund(owner, { caseId: prepared.caseId, expectedVersion: 1, reason: "ok" }, ENV),
      (error: unknown) => error instanceof FraudValidationError && error.code === "invalid_reason",
    );
    assert.equal((await refundCase(prepared.caseId)).state, "prepared", "nothing changed");

    const approved = await approve(prepared.caseId);
    assert.equal(approved.selfApproved, false, "a different admin prepared it");
    const row = await refundCase(prepared.caseId);
    assert.equal(row.state, "approved");
    assert.equal(row.selfApproved, false);
    assert.equal(row.approvedByUserId, authority.ownerId);
    assert.equal(row.approvalReason, FULL_REASON);
    assert.ok(row.payoutDueAt && Math.abs(row.payoutDueAt.getTime() - (row.approvedAt!.getTime() + 14 * dayMs)) < 60_000, "payout due 14 days after approval");
    assert.equal((row.eligibilityApproved as { eligible: boolean }).eligible, true);

    // Owner prepares and approves the same case: stored as self-approved.
    const own = await prepare(order.id, "wrong_amount", { amountRupiah: 10_000 }, authority.adminAsOwner);
    const ownApproval = await approve(own.caseId);
    assert.equal(ownApproval.selfApproved, true);
    assert.equal((await refundCase(own.caseId)).selfApproved, true);

    // The history has one row per step with the actor kind.
    const events = await prisma.refundCaseEvent.findMany({ orderBy: { createdAt: "asc" }, where: { caseId: prepared.caseId } });
    assert.deepEqual(events.map((e) => `${e.kind}:${e.actorKind}:v${e.caseVersion}`), ["prepared:admin:v1", "approved:owner:v2"]);
    pass("authority: owner-only approval with reason, self-approval recorded");
  }

  // ---- Concurrent checks: stale version, double approval, rejection and cancellation ----------------
  {
    const order = await paidOrder();
    const prepared = await prepare(order.id, "wrong_amount", { amountRupiah: 20_000 });
    await refundError(() => approveRefund(owner, { caseId: prepared.caseId, expectedVersion: 9, reason: FULL_REASON }, ENV), "stale_version");

    const results = await Promise.allSettled([
      approveRefund(owner, { caseId: prepared.caseId, expectedVersion: 1, reason: FULL_REASON }, ENV),
      approveRefund(owner, { caseId: prepared.caseId, expectedVersion: 1, reason: FULL_REASON }, ENV),
      rejectRefund(owner, { caseId: prepared.caseId, expectedVersion: 1, reason: "Menolak karena permintaan ganda." }, ENV),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "exactly one of the racing steps wins");
    const row = await refundCase(prepared.caseId);
    assert.equal(row.version, 2);

    const other = await prepare(order.id, "wrong_amount", { amountRupiah: 5000 });
    await rejectRefund(owner, { caseId: other.caseId, expectedVersion: 1, reason: "Tidak ada bukti permintaan." }, ENV);
    const rejected = await refundCase(other.caseId);
    assert.equal(rejected.state, "rejected");
    assert.equal(rejected.evidenceHold, false);
    assert.equal(rejected.closureReason, "Tidak ada bukti permintaan.");
    await refundError(() => approveRefund(owner, { caseId: other.caseId, expectedVersion: 2, reason: FULL_REASON }, ENV), "wrong_state");
    pass("concurrent steps: one winner, stale versions refused");
  }

  // ---- Refundable balance: partial and concurrent refunds never exceed the capture -------------------
  {
    const order = await paidOrder(); // Rp49.000
    const a = await prepare(order.id, "wrong_amount", { amountRupiah: 30_000 });
    const b = await prepare(order.id, "wrong_amount", { amountRupiah: 30_000 });
    // Both are only prepared: nothing is reserved yet. Approvals race.
    const raced = await Promise.allSettled([approve(a.caseId), approve(b.caseId)]);
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1, "only one 30.000 fits in 49.000");
    const loser = raced.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(loser.reason instanceof RefundError && loser.reason.code === "balance_exceeded");

    const winnerId = (await refundCase(a.caseId)).state === "approved" ? a.caseId : b.caseId;
    const loserId = winnerId === a.caseId ? b.caseId : a.caseId;
    const rest = await prepare(order.id, "wrong_amount", { amountRupiah: 19_000 });
    await approve(rest.caseId);
    await refundError(() => prepare(order.id, "wrong_amount", { amountRupiah: 1 }), "balance_exceeded");

    // An approved case that is cancelled gives its balance back.
    await cancelRefund(owner, { caseId: winnerId, expectedVersion: 2, reason: "Pembeli menarik permintaannya." }, ENV);
    assert.equal((await refundCase(winnerId)).state, "cancelled");
    await approve(loserId);
    assert.equal((await refundCase(loserId)).state, "approved");

    // The database refuses a case beyond the capture, whatever the application did.
    await assert.rejects(
      () => prisma.$executeRaw`
        INSERT INTO refund_cases (reference, order_id, buyer_id, provider_payment_id, reason_category, reason_code, request_note,
          request_channel, requested_at, amount_rupiah, prepared_by_user_id, decision_due_at, eligibility_prepared)
        VALUES (${`rf_${randomUUID().replaceAll("-", "").slice(0, 20)}`}, ${order.id}::uuid, ${order.buyerId}::uuid, ${order.providerReference},
          'our_fault', 'wrong_amount', 'x', 'email', now(), ${order.amountRupiah + 1}, ${authority.otherId}::uuid, now(), '{}'::jsonb)
      `,
      /more than the captured/u,
    );
    pass("balance: concurrent and partial refunds never exceed the capture");
  }

  // ---- Provider path: reserved, sent, completed only on a verified confirmation -----------------------
  const completedFull = await (async () => {
    const order = await paidOrder();
    const buyerId = order.buyerId;
    assert.equal((await getAccessState(buyerId)).status, "active");
    const reservationBefore = await prisma.riskReservation.findUniqueOrThrow({ where: { orderId: order.id } });
    const [bucketBefore] = await prisma.$queryRaw<Array<{ amount: number; count: number }>>`
      SELECT amount_rupiah AS amount, purchase_count AS count FROM risk_day_buckets
      WHERE user_id = ${buyerId}::uuid AND bucket_date = ${reservationBefore.bucketDate}
    `;

    const prepared = await prepare(order.id, "change_of_mind");
    await approve(prepared.caseId);

    const sent = await execute(prepared.caseId);
    assert.equal(sent.result, "sent");
    let row = await refundCase(prepared.caseId);
    assert.equal(row.state, "processing");
    assert.equal(row.method, "provider");
    assert.ok(row.providerRefundId);
    assert.equal(row.executionAttempts, 1);
    assert.equal((await getAccessState(buyerId)).status, "active", "accepted by the provider is not confirmed");
    assert.equal(await prisma.standInRefund.count({ where: { reference: row.reference } }), 1);
    await refundError(() => execute(prepared.caseId), "wrong_state");

    // A forged confirmation does not complete it: wrong amount, unknown reference, bad signature.
    const wrongAmount = await deliver(await provider.buildSignedRefundEventFor(row.reference, "refund.succeeded", new Date(), { amountRupiah: 1 }));
    assert.ok(wrongAmount.status === "received" && wrongAmount.result.status === "processed" && wrongAmount.result.outcome === "quarantined");
    const unknown = await deliver(await provider.buildSignedRefundEventFor(row.reference, "refund.succeeded", new Date(), { refundReference: "rf_unknown0000000000000000" }));
    assert.ok(unknown.status === "received" && unknown.result.status === "processed" && unknown.result.outcome === "quarantined");
    const forgedSignature = await provider.buildSignedRefundEventFor(row.reference, "refund.succeeded", new Date());
    const refused = await deliver({ body: forgedSignature.body, headers: { ...forgedSignature.headers, "x-stand-in-signature": "v1=00" } });
    assert.equal(refused.status, "refused");
    assert.equal((await refundCase(prepared.caseId)).state, "processing", "still not confirmed");

    // The verified, signed confirmation completes it.
    const confirmed = await settle(row.reference, "succeeded");
    assert.ok(confirmed.status === "received" && confirmed.result.status === "processed" && confirmed.result.outcome === "accepted");
    row = await refundCase(prepared.caseId);
    assert.equal(row.state, "completed");
    assert.equal(row.confirmationSource, "provider_event");
    assert.ok(row.confirmationEventId && row.completedAt);
    assert.equal(row.evidenceHold, false);
    assert.equal(row.accessEffect, "revoked");
    const confirmation = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: row.confirmationEventId! } });
    assert.equal(confirmation.type, "refund_succeeded");
    assert.equal(confirmation.refundReference, row.reference);
    assert.equal(confirmation.providerRefundId, row.providerRefundId);

    // Effects: access ended, summary refunded, allowance not restored, order untouched.
    assert.equal((await getAccessState(buyerId)).status, "revoked", "a full refund ends access immediately");
    const purchase = await prisma.packagePurchase.findUniqueOrThrow({ where: { id: order.packagePurchaseId! } });
    assert.equal(purchase.status, "refunded");
    const reservationAfter = await prisma.riskReservation.findUniqueOrThrow({ where: { orderId: order.id } });
    assert.equal(reservationAfter.state, "paid", "the reservation is untouched");
    const [bucketAfter] = await prisma.$queryRaw<Array<{ amount: number; count: number }>>`
      SELECT amount_rupiah AS amount, purchase_count AS count FROM risk_day_buckets
      WHERE user_id = ${buyerId}::uuid AND bucket_date = ${reservationBefore.bucketDate}
    `;
    assert.deepEqual(bucketAfter, bucketBefore, "a refund never gives the day's allowance back");
    assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "paid");
    assert.equal(await prisma.auditLog.count({ where: { action: "refund.completed", targetId: order.id } }), 1);
    const events = await prisma.refundCaseEvent.findMany({ orderBy: { createdAt: "asc" }, where: { caseId: prepared.caseId } });
    assert.deepEqual(events.map((e) => e.kind), ["prepared", "approved", "execution_started", "execution_accepted", "completed"]);
    assert.equal(events.at(-1)?.actorKind, "provider");

    // The same event again is a duplicate; a later failure notice contradicts a completed refund and is only kept for review.
    const eventAgain = await provider.buildSignedRefundEventFor(row.reference, "refund.succeeded", new Date(), { eventId: confirmation.eventId });
    const duplicate = await deliver(eventAgain);
    assert.ok(duplicate.status === "received" && duplicate.result.status === "duplicate");
    const otherId = await provider.buildSignedRefundEventFor(row.reference, "refund.succeeded", new Date());
    const ignored = await deliver(otherId);
    assert.ok(ignored.status === "received" && ignored.result.status === "processed" && ignored.result.outcome === "ignored");
    const contradiction = await deliver(await provider.buildSignedRefundEventFor(row.reference, "refund.failed", new Date()));
    assert.ok(contradiction.status === "received" && contradiction.result.status === "processed" && contradiction.result.outcome === "review");
    assert.equal((await refundCase(prepared.caseId)).state, "completed", "a late event never reopens a completed refund");
    assert.equal((await getAccessState(buyerId)).status, "revoked");
    pass("provider path: sent, completed only on a verified confirmation; full refund revokes access");
    return { order, row };
  })();

  // ---- Terminal states: nothing brings a refunded payment back --------------------------------------------
  {
    const { order, row } = completedFull;
    await assert.rejects(() => prisma.$executeRaw`UPDATE refund_cases SET state = 'approved' WHERE id = ${row.id}::uuid`, /cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE refund_cases SET amount_rupiah = 1 WHERE id = ${row.id}::uuid`, /cannot be changed|cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM refund_cases WHERE id = ${row.id}::uuid`, /never deleted/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE refund_case_events SET note = 'x' WHERE case_id = ${row.id}::uuid`, /append-only/u);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM refund_case_events WHERE case_id = ${row.id}::uuid`, /append-only/u);

    // A refunded purchase does not become succeeded again (the old writer would have).
    await assert.rejects(
      () => prisma.$executeRaw`UPDATE package_purchases SET status = 'succeeded' WHERE id = ${order.packagePurchaseId}::uuid`,
      /cannot become succeeded/u,
    );
    const { recordSuccessfulPackagePurchase } = await import("../lib/affiliator/service");
    await assert.rejects(
      () => recordSuccessfulPackagePurchase({
        completedAt: new Date(), packageCode: order.packageCode, providerReference: `order:${order.id}`, referralCode: order.referralCode ?? undefined, studentId: order.buyerId,
      } as Parameters<typeof recordSuccessfulPackagePurchase>[0]),
      /already refunded or cancelled/u,
    );

    // A late or repeated payment event cannot revive the order or the purchase.
    const lateSuccess = await deliver(signedEventFor(order, "payment.succeeded"));
    assert.ok(lateSuccess.status === "received" && lateSuccess.result.status === "processed" && lateSuccess.result.outcome === "ignored");
    for (const kind of ["payment.failed", "payment.expired"] as const) {
      const late = await deliver(signedEventFor(order, kind));
      assert.ok(late.status === "received" && late.result.status === "processed" && late.result.outcome === "ignored");
    }
    assert.equal((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: order.packagePurchaseId! } })).status, "refunded");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked");
    // A second, different capture is still kept as evidence for review.
    const second = await deliver(signedEventFor(order, "payment.succeeded", { providerPaymentId: `sip_second_${randomUUID().slice(0, 8)}` }));
    assert.ok(second.status === "received" && second.result.status === "processed" && second.result.outcome === "review");
    pass("terminal states are guarded: no late event revives a refunded payment");
  }

  // ---- Partial refund keeps access unless the owner chooses otherwise; the failed path; rejection ---------
  {
    const order = await paidOrder();
    const partial = await prepare(order.id, "wrong_amount", { amountRupiah: 10_000 });
    await approve(partial.caseId);
    assert.equal((await execute(partial.caseId)).result, "sent");
    await settle((await refundCase(partial.caseId)).reference, "succeeded");
    let row = await refundCase(partial.caseId);
    assert.equal(row.state, "completed");
    assert.equal(row.accessEffect, "kept");
    assert.equal((await getAccessState(order.buyerId)).status, "active", "a partial refund keeps access");
    assert.equal((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: order.packagePurchaseId! } })).status, "succeeded");

    // The rest of the payment, as a second refund, is a full refund in total.
    const rest = await prepare(order.id, "wrong_amount");
    assert.equal((await refundCase(rest.caseId)).amountRupiah, 39_000);
    await approve(rest.caseId);
    await execute(rest.caseId);
    await settle((await refundCase(rest.caseId)).reference, "succeeded");
    assert.equal((await refundCase(rest.caseId)).accessEffect, "revoked", "refunds adding up to the whole payment end access");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked");

    // The owner may choose to revoke on a partial refund.
    const second = await paidOrder();
    const chosen = await prepare(second.id, "wrong_amount", { amountRupiah: 5_000 });
    await approve(chosen.caseId, true);
    await execute(chosen.caseId);
    await settle((await refundCase(chosen.caseId)).reference, "succeeded");
    row = await refundCase(chosen.caseId);
    assert.equal(row.revokeAccess, true);
    assert.equal((await getAccessState(second.buyerId)).status, "revoked");

    // The provider says it failed: the case fails, access stays, and the balance is free again.
    const third = await paidOrder();
    const failing = await prepare(third.id, "wrong_amount");
    await approve(failing.caseId);
    await execute(failing.caseId);
    const failed = await settle((await refundCase(failing.caseId)).reference, "failed");
    assert.ok(failed.status === "received" && failed.result.status === "processed" && failed.result.outcome === "declined");
    row = await refundCase(failing.caseId);
    assert.equal(row.state, "failed");
    assert.equal(row.evidenceHold, false);
    assert.equal((await getAccessState(third.buyerId)).status, "active");
    const again = await prepare(third.id, "wrong_amount");
    await approve(again.caseId); // the full balance is free again
    // A success notice after a failure is not applied, only kept for review.
    const afterFail = await deliver(await provider.buildSignedRefundEventFor(row.reference, "refund.succeeded", new Date()));
    assert.ok(afterFail.status === "received" && afterFail.result.status === "processed" && afterFail.result.outcome === "review");
    assert.equal((await refundCase(failing.caseId)).state, "failed");

    // A provider that refuses outright: the case fails and the balance is free again.
    const fourth = await paidOrder();
    const refusing = await prepare(fourth.id, "wrong_amount");
    await approve(refusing.caseId);
    const stubborn: PaymentProviderAdapter = Object.create(provider, {
      createRefund: { value: async () => ({ outcome: "rejected" as const, reason: "not_supported" }) },
    });
    const result = await execute(refusing.caseId, { provider: stubborn });
    assert.deepEqual(result, { reason: "not_supported", result: "rejected" });
    assert.equal((await refundCase(refusing.caseId)).state, "failed");
    await refundError(() => execute(refusing.caseId), "wrong_state");
    await refundError(() => execute(refusing.caseId, { provider: null }), "no_provider");
    pass("partial refunds keep access unless chosen; failures free the balance");
  }

  // ---- Timeout means unknown: reconcile before retrying -----------------------------------------------------
  {
    // The request is lost: the provider never saw it.
    const lost = await paidOrder();
    const first = await prepare(lost.id, "wrong_amount");
    await approve(first.caseId);
    provider.failNextRefundCall("before");
    assert.deepEqual(await execute(first.caseId), { result: "unknown" });
    let row = await refundCase(first.caseId);
    assert.equal(row.state, "processing");
    assert.equal(row.outcomeUnknown, true);
    assert.equal(row.providerRefundId, null);
    assert.equal(await prisma.standInRefund.count({ where: { reference: row.reference } }), 0, "the provider has nothing");
    await refundError(() => execute(first.caseId), "outcome_unknown");
    assert.equal(row.executionAttempts, 1, "the refused retry did not count as an attempt");
    assert.deepEqual(await reconcileRefund(first.caseId, { provider }), { result: "not_seen" });
    row = await refundCase(first.caseId);
    assert.equal(row.outcomeUnknown, false);
    assert.equal((await execute(first.caseId)).result, "sent");
    row = await refundCase(first.caseId);
    assert.equal(row.executionAttempts, 2);
    assert.ok(row.providerRefundId);
    assert.equal(await prisma.standInRefund.count({ where: { reference: row.reference } }), 1);

    // The answer is lost: the provider did record the refund. A retry would be a mistake.
    const recorded = await paidOrder();
    const second = await prepare(recorded.id, "wrong_amount");
    await approve(second.caseId);
    provider.failNextRefundCall("after");
    assert.deepEqual(await execute(second.caseId), { result: "unknown" });
    row = await refundCase(second.caseId);
    assert.equal(row.outcomeUnknown, true);
    assert.equal(await prisma.standInRefund.count({ where: { reference: row.reference } }), 1, "the provider has it");
    await refundError(() => execute(second.caseId), "outcome_unknown");
    assert.deepEqual(await reconcileRefund(second.caseId, { provider }), { result: "pending" });
    row = await refundCase(second.caseId);
    assert.equal(row.outcomeUnknown, false);
    assert.ok(row.providerRefundId, "learned from the provider's own status");
    await refundError(() => execute(second.caseId), "wrong_state");
    assert.equal(await prisma.standInRefund.count({ where: { reference: row.reference } }), 1, "never a second refund");

    // The confirmation webhook is lost; the status lookup completes it.
    await prisma.$executeRaw`UPDATE stand_in_refunds SET state = 'succeeded', settled_at = now() WHERE reference = ${row.reference}`;
    assert.deepEqual(await reconcileRefund(second.caseId, { provider }), { result: "completed" });
    row = await refundCase(second.caseId);
    assert.equal(row.state, "completed");
    assert.equal(row.confirmationSource, "provider_status");
    assert.equal((await getAccessState(recorded.buyerId)).status, "revoked");
    assert.deepEqual(await reconcileRefund(second.caseId, { provider }), { result: "unchanged" }, "repeating changes nothing");

    // An unreachable provider leaves everything as it was; a status that does not match is not applied.
    const down = await paidOrder();
    const third = await prepare(down.id, "wrong_amount");
    await approve(third.caseId);
    await execute(third.caseId);
    const unreachable: PaymentProviderAdapter = Object.create(provider, {
      getRefundStatus: { value: async () => { throw new ProviderOutcomeUnknownError(); } },
    });
    await refundError(() => reconcileRefund(third.caseId, { provider: unreachable }), "provider_unavailable");
    assert.equal((await refundCase(third.caseId)).state, "processing");
    const liar: PaymentProviderAdapter = Object.create(provider, {
      getRefundStatus: {
        value: async (reference: string) => {
          const real = await provider.getRefundStatus(reference);
          return real.found ? { ...real, amountRupiah: real.amountRupiah + 1, state: "succeeded" as const } : real;
        },
      },
    });
    assert.deepEqual(await reconcileRefund(third.caseId, { provider: liar }), { result: "mismatch" });
    assert.equal((await refundCase(third.caseId)).state, "processing");

    // The daily job settles what is with the provider by itself.
    await prisma.$executeRaw`UPDATE stand_in_refunds SET state = 'succeeded', settled_at = now() WHERE reference = ${(await refundCase(third.caseId)).reference}`;
    const maintenance = await runRefundMaintenance({ provider });
    assert.ok(maintenance.reconciled.completed >= 1);
    assert.equal((await refundCase(third.caseId)).state, "completed");
    pass("timeout means unknown: reconcile before retry; lost confirmation settled from status");
  }

  // ---- Manual transfer: the owner records destination, reference and proof ----------------------------------
  {
    const order = await paidOrder();
    const prepared = await prepare(order.id, "wrong_amount");
    const transfer = (overrides: Partial<Parameters<typeof recordManualTransfer>[1]> = {}, who = owner) =>
      refundCase(prepared.caseId).then((row) => recordManualTransfer(who, {
        caseId: prepared.caseId,
        destinationHolder: "buyer",
        destinationMasked: "BCA ••••1234 a.n. Budi",
        expectedVersion: row.version,
        proofNote: "Bukti transfer BCA disimpan di folder keuangan, tertanggal hari ini.",
        reason: "Transfer sudah dicek di mutasi rekening.",
        transferReference: "TRX-20261105-0001",
        ...overrides,
      }, ENV));

    await refundError(() => transfer(), "wrong_state"); // not approved yet
    await approve(prepared.caseId);
    assert.throws(() => requireMaskedDestination("1234567890"), (error: unknown) => error instanceof RefundError && error.code === "invalid_input");
    assert.throws(() => requireMaskedDestination("0812 3456 7890"), (error: unknown) => error instanceof RefundError);
    assert.equal(requireMaskedDestination("OVO ••••7890 a.n. Siti"), "OVO ••••7890 a.n. Siti");
    await refundError(() => transfer({ destinationMasked: "1234567890" }), "invalid_input");
    await refundError(() => transfer({ destinationHolder: "friend" }), "invalid_input");
    await refundError(() => transfer({ transferReference: "x" }), "invalid_input");
    await refundError(() => transfer({ proofNote: "" }), "invalid_input");
    const forged = { email: authority.otherEmail, userId: authority.otherId } as unknown as typeof owner;
    await assert.rejects(() => transfer({}, forged), (error: unknown) => error instanceof FraudAuthorityError);
    assert.equal((await refundCase(prepared.caseId)).state, "approved", "nothing completed without the owner's confirmation");

    await transfer({ destinationHolder: "parent" });
    const row = await refundCase(prepared.caseId);
    assert.equal(row.state, "completed");
    assert.equal(row.method, "manual_transfer");
    assert.equal(row.confirmationSource, "owner_manual");
    assert.equal(row.confirmedByUserId, authority.ownerId);
    assert.equal(row.destinationMasked, "BCA ••••1234 a.n. Budi");
    assert.equal(row.destinationHolder, "parent");
    assert.equal(row.transferReference, "TRX-20261105-0001");
    assert.match(row.proofNote ?? "", /Bukti transfer/u);
    assert.equal(row.accessEffect, "revoked");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked");
    assert.equal((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: order.packagePurchaseId! } })).status, "refunded");
    await refundError(() => transfer(), "wrong_state");

    // A provider refund cannot be completed by hand, and a manual one needs everything.
    const second = await paidOrder();
    const viaProvider = await prepare(second.id, "wrong_amount");
    await approve(viaProvider.caseId);
    await execute(viaProvider.caseId);
    await assert.rejects(
      () => prisma.$executeRaw`UPDATE refund_cases SET state = 'completed' WHERE id = ${viaProvider.caseId}::uuid`,
      /needs its history row first|refund case/u,
    );
    pass("manual transfer: masked destination, reference, proof, owner confirmation");
  }

  // ---- Tier seam: refunds and disputes stop an order from verifying a buyer ----------------------------------
  {
    const order = await paidOrder();
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), order.id);
    const prepared = await prepare(order.id, "wrong_amount");
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), order.id, "a request alone changes nothing");
    await rejectRefund(owner, { caseId: prepared.caseId, expectedVersion: 1, reason: "Tidak ada kesalahan di pihak kami." }, ENV);
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), order.id, "a rejected request changes nothing");

    const second = await prepare(order.id, "wrong_amount");
    await approve(second.caseId);
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), null, "an approved refund means the order no longer stands");
    await cancelRefund(owner, { caseId: second.caseId, expectedVersion: 2, reason: "Pembeli menarik permintaannya." }, ENV);
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), order.id, "a cancelled refund changes nothing");

    const completed = await prepare(order.id, "wrong_amount");
    await approve(completed.caseId);
    await recordManualTransfer(owner, {
      caseId: completed.caseId, destinationHolder: "buyer", destinationMasked: "BCA ••••1234", expectedVersion: 2,
      proofNote: "Bukti transfer disimpan oleh keuangan.", reason: "Sudah dicek di mutasi.", transferReference: "TRX-TIER-1",
    }, ENV);
    assert.equal(await findStandingPaidOrder(prisma, order.buyerId), null);
    pass("tier seam counts refunds");
  }

  // ---- Orders in review: the owner grants access, or opens a refund --------------------------------------------
  {
    const granted = await reviewOrder();
    assert.equal(await prisma.paymentReceipt.count({ where: { orderId: granted.id } }), 0);
    assert.equal((await getAccessState(granted.buyerId)).status, "none");
    await assert.rejects(
      () => acceptReviewedOrder({ email: authority.otherEmail, userId: authority.otherId } as unknown as typeof owner, { orderId: granted.id, reason: FULL_REASON }, { env: ENV }),
      (error: unknown) => error instanceof FraudAuthorityError,
    );
    const accepted = await acceptReviewedOrder(owner, { orderId: granted.id, reason: "Pembayaran sah, terlambat karena penyedia." }, { env: ENV });
    assert.equal(accepted.delivery, "delivered");
    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: granted.id } });
    assert.equal(order.status, "paid");
    assert.ok(order.paidAt && order.packagePurchaseId);
    assert.equal(order.statusReason, "accepted_by_owner");
    assert.equal((await getAccessState(granted.buyerId)).status, "active", "granted through the same fulfilment as a normal payment");
    assert.equal((await prisma.paymentReceipt.findUniqueOrThrow({ where: { orderId: granted.id } })).deliveryStatus, "delivered");
    assert.equal((await prisma.riskReservation.findUniqueOrThrow({ where: { orderId: granted.id } })).state, "paid");
    assert.equal(await prisma.auditLog.count({ where: { action: "payment.order.review_accepted", targetId: granted.id } }), 1);
    await refundError(() => acceptReviewedOrder(owner, { orderId: granted.id, reason: FULL_REASON }, { env: ENV }), "wrong_state");
    const plain = await paidOrder();
    await refundError(() => acceptReviewedOrder(owner, { orderId: plain.id, reason: FULL_REASON }, { env: ENV }), "wrong_state");

    // The other resolution: refund it. Access the buyer has from somewhere else is not touched.
    const held = await reviewOrder();
    await grantAccess({ actorUserId: authority.ownerId, idempotencyKey: `review-${randomUUID()}`, plan: "monthly", reason: "Akses lain untuk uji", source: "admin", studentId: held.buyerId });
    const refund = await prepare(held.id, "service_unavailable");
    await approve(refund.caseId);
    await recordManualTransfer(owner, {
      caseId: refund.caseId, destinationHolder: "buyer", destinationMasked: "Dana ••••4321", expectedVersion: 2,
      proofNote: "Bukti transfer disimpan oleh keuangan.", reason: "Sudah dicek di mutasi.", transferReference: "TRX-REVIEW-1",
    }, ENV);
    const done = await refundCase(refund.caseId);
    assert.equal(done.state, "completed");
    assert.equal(done.accessEffect, "none_paid_order");
    assert.equal((await getAccessState(held.buyerId)).status, "active", "this order never granted access, so it cannot take it away");
    await refundError(() => acceptReviewedOrder(owner, { orderId: held.id, reason: FULL_REASON }, { env: ENV }), "wrong_state");
    pass("review resolution: grant through fulfilment, or refund");
  }

  // ---- A refund that stalls opens the MS-07 case ----------------------------------------------------------------
  {
    const order = await paidOrder();
    const prepared = await prepare(order.id, "wrong_amount");
    assert.equal((await prisma.fraudCase.count({ where: { signal: "refund_stalled", subjectKey: `refund:${prepared.caseId}` } })), 0);
    await flagStalledRefunds();
    assert.equal((await prisma.fraudCase.count({ where: { signal: "refund_stalled", subjectKey: `refund:${prepared.caseId}` } })), 0, "not late yet");

    // The decision deadline passes (the deadline column is frozen; the test moves it with the guard off).
    await withTriggersOff("refund_cases", (tx) => tx.$executeRaw`UPDATE refund_cases SET decision_due_at = now() - interval '1 hour' WHERE id = ${prepared.caseId}::uuid`);
    await flagStalledRefunds();
    await flagStalledRefunds();
    const cases = await prisma.fraudCase.findMany({ where: { signal: "refund_stalled", subjectKey: `refund:${prepared.caseId}` } });
    assert.equal(cases.length, 1, "one case, however often the job runs");
    assert.equal(cases[0].orderId, order.id);
    assert.equal(cases[0].severity, "high");
    assert.equal(cases[0].state, "open");
    assert.equal(cases[0].hitCount, 2);

    // A refund that finished is no longer late.
    const done = await prepare(order.id, "wrong_amount", { amountRupiah: 1000 });
    await withTriggersOff("refund_cases", (tx) => tx.$executeRaw`UPDATE refund_cases SET decision_due_at = now() - interval '1 hour' WHERE id = ${done.caseId}::uuid`);
    await rejectRefund(owner, { caseId: done.caseId, expectedVersion: 1, reason: "Tidak ada kesalahan di pihak kami." }, ENV);
    await flagStalledRefunds();
    assert.equal(await prisma.fraudCase.count({ where: { signal: "refund_stalled", subjectKey: `refund:${done.caseId}` } }), 0);

    // An approved refund not paid within 14 days is flagged on the payout deadline.
    const payout = await prepare(order.id, "wrong_amount", { amountRupiah: 2000 });
    await approve(payout.caseId);
    await withTriggersOff("refund_cases", (tx) => tx.$executeRaw`UPDATE refund_cases SET payout_due_at = now() - interval '1 minute' WHERE id = ${payout.caseId}::uuid`);
    await flagStalledRefunds();
    const payoutCase = await prisma.fraudCase.findFirstOrThrow({ where: { signal: "refund_stalled", subjectKey: `refund:${payout.caseId}` } });
    assert.equal((payoutCase.evidence as { payoutOverdue: boolean }).payoutOverdue, true);
    pass("a stalled refund opens a refund_stalled case");
  }

  // ---- Terms: the refund rules, a new version, still a draft -------------------------------------------------------
  {
    const old = getTermsByVersion("2026-11-04.1");
    assert.ok(old, "orders made under the earlier version can still print its text");
    assert.notEqual(PURCHASE_TERMS.version, "2026-11-04.1", "the version was bumped");
    assert.equal(PURCHASE_TERMS.status, "draft", "still a draft until the owner approves it");
    assert.equal(new Set(TERMS_VERSIONS.map((terms) => terms.version)).size, TERMS_VERSIONS.length);
    assert.equal(TERMS_VERSIONS.at(-1), PURCHASE_TERMS);
    const headings = (terms: typeof PURCHASE_TERMS) => terms.sections.map((section) => section.heading);
    assert.ok(!headings(old).some((heading) => heading.includes("Kapan uangmu")), "the earlier text is untouched");
    assert.equal(old.sections.length, 6);
    const text = PURCHASE_TERMS.sections.flatMap((section) => section.body).join(" ");
    assert.match(text, /3 hari/u);
    assert.match(text, /3 hari kerja/u);
    assert.match(text, /14 hari kalender/u);
    assert.match(text, /dikembalikan penuh/u);
    assert.match(text, /Full Access/u);
    assert.match(text, /atas namamu/u);
    assert.match(text, /orang tua atau walimu/u);
    assert.doesNotMatch(text, /\bv\d\b|UUID|\bAPI\b|E2Pay|stand-in/u, "no internals in text buyers read");
    assert.equal(getTermsByVersion("nope"), null);
    pass("terms: refund rules added, version bumped, still a draft");
  }

  await cleanUp();
  console.log(`Refund checks passed: ${checks.join("; ")}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
