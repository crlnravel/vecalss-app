import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { getAccessState } from "../lib/billing/service";
import { createDisputeExport } from "../lib/disputes/export";
import { verifyPacketFile } from "../lib/disputes/canonical";
import { requireAdmin, requireOwner } from "../lib/fraud/authority";
import { FraudAuthorityError, FraudValidationError } from "../lib/fraud/errors";
import { recordPaidUse } from "../lib/fulfillment/usage";
import { approveRefund, prepareRefund, type PrepareInput } from "../lib/refunds/cases";
import { cancelRefund } from "../lib/refunds/cases";
import { REFUND_REASONS } from "../lib/refunds/constants";
import { evaluateEligibility } from "../lib/refunds/eligibility";
import { RefundError } from "../lib/refunds/errors";
import { executeProviderRefund } from "../lib/refunds/execute";
import { flagStalledRefunds } from "../lib/refunds/maintenance";
import { listRecentRefunds, listRefundRecords } from "../lib/refunds/records";
import { deliver } from "./payment-test-kit";
import { ENV, FULL_REASON, cleanUp, paidOrder, prisma, provider, refundCase, setupAuthority, withTriggersOff } from "./refund-test-kit";

/**
 * MS-18: the refund reason `authority_order`. The database refuses an authority
 * case without its fields (and the fields on any other case); the reason is
 * always eligible, even on an old order whose features were used; the payout
 * deadline and the refund-stalled signal honour an earlier authority deadline;
 * only the owner approves, a self-approval is stored; the case completes against
 * the stand-in; the evidence reaches the case records, the dispute packet and
 * the retention rules for refund cases. Runs on the local database only
 * (payment-test-kit refuses the rest).
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const dayMs = 86_400_000;
const hourMs = 3_600_000;
const NOTE = "Surat perintah dari pengadilan diterima lewat email, meminta pembayaran ini dikembalikan.";

async function refundError(work: () => Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => error instanceof RefundError && error.code === code, `expected a refund error: ${code}`);
}

async function main() {
  const authority = await setupAuthority();
  const { admin, owner } = authority;

  /** The order is received the moment the order was created, so the date received is never before the order nor in the future. */
  const prepare = async (orderId: string, extra: Partial<PrepareInput> = {}, who = admin) => {
    const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId }, select: { createdAt: true } });
    return prepareRefund(who, {
      authorityName: "Pengadilan Negeri Jakarta Selatan",
      authorityReference: `No. 123/Pdt.G/2026/${randomUUID().slice(0, 6)}`,
      orderId,
      reasonCode: "authority_order",
      requestChannel: "email",
      requestedAt: order.createdAt,
      requestNote: NOTE,
      ...extra,
    });
  };
  const approve = (caseId: string, reason = FULL_REASON) =>
    refundCase(caseId).then((row) => approveRefund(owner, { caseId, expectedVersion: row.version, reason }, ENV));

  // ---- The reason exists and is its own category ------------------------------------------------------------------
  assert.equal(REFUND_REASONS.authority_order.category, "authority_order");
  pass("the reason authority_order is listed as its own category");

  // ---- The code refuses an authority case without its fields -------------------------------------------------------
  {
    const order = await paidOrder();
    const bad = (patch: Partial<PrepareInput>) => prepare(order.id, patch);
    await refundError(() => bad({ authorityName: "" }), "invalid_input");
    await refundError(() => bad({ authorityName: "ab" }), "invalid_input");
    await refundError(() => bad({ authorityName: null }), "invalid_input");
    await refundError(() => bad({ authorityReference: "   " }), "invalid_input");
    await refundError(() => bad({ authorityReference: null }), "invalid_input");
    await refundError(() => bad({ requestedAt: null }), "invalid_input");
    await refundError(() => bad({ requestedAt: new Date(Date.now() + dayMs) }), "invalid_input");
    await refundError(() => bad({ authorityDeadlineAt: new Date(Date.now() - 2 * hourMs) }), "invalid_input");
    assert.equal(await prisma.refundCase.count({ where: { orderId: order.id } }), 0, "nothing was written");

    // The buyer reasons carry no authority fields, whatever was typed.
    const plain = await prepareRefund(admin, {
      authorityName: "Pengadilan lain", authorityReference: "X-1", orderId: order.id, reasonCode: "wrong_amount", requestChannel: "email", requestNote: NOTE,
    });
    const row = await refundCase(plain.caseId);
    assert.equal(row.authorityName, null);
    assert.equal(row.authorityReference, null);
    assert.equal(row.authorityReceivedAt, null);
    assert.equal(row.authorityDeadlineAt, null);
    pass("the code refuses an authority case without name, reference or received date, and drops the fields on other reasons");
  }

  // ---- The database refuses it too ---------------------------------------------------------------------------------
  {
    const order = await paidOrder();
    const insert = (cols: { category?: string; code?: string; name?: string | null; ref?: string | null; received?: Date | null; deadline?: Date | null; requested?: Date }) => {
      const requested = cols.requested ?? new Date(Date.now() - hourMs);
      const category = cols.category ?? "authority_order";
      return prisma.$executeRaw`
        INSERT INTO refund_cases (reference, order_id, buyer_id, provider_payment_id, reason_category, reason_code, request_note,
          request_channel, requested_at, amount_rupiah, prepared_by_user_id, decision_due_at, eligibility_prepared,
          authority_name, authority_reference, authority_received_at, authority_deadline_at)
        VALUES (${`rf_${randomUUID().replaceAll("-", "").slice(0, 20)}`}, ${order.id}::uuid, ${order.buyerId}::uuid, ${order.providerReference},
          ${category}::refund_reason_category, ${cols.code ?? category}, 'x', 'email', ${requested}, 1000, ${authority.otherId}::uuid, now(), '{}'::jsonb,
          ${cols.name === undefined ? "Bank Indonesia" : cols.name}, ${cols.ref === undefined ? "BI-1" : cols.ref},
          ${cols.received === undefined ? requested : cols.received}, ${cols.deadline ?? null})
      `;
    };
    const refused = /refund_cases_authority_check|refund_cases_reason_check/u;

    await insert({}); // the complete case is accepted
    await assert.rejects(() => insert({ name: null }), refused, "no issuing authority");
    await assert.rejects(() => insert({ name: "  " }), refused, "a blank issuing authority");
    await assert.rejects(() => insert({ ref: null }), refused, "no reference number");
    await assert.rejects(() => insert({ ref: "" }), refused, "an empty reference number");
    await assert.rejects(() => insert({ received: null }), refused, "no date received");
    await assert.rejects(() => insert({ received: new Date(Date.now() - 5 * hourMs) }), refused, "the date received is the request date");
    await assert.rejects(() => insert({ deadline: new Date(Date.now() - 3 * hourMs) }), refused, "a deadline before it was received");
    await assert.rejects(() => insert({ code: "wrong_amount" }), refused, "the authority category needs the authority reason");
    await assert.rejects(() => insert({ category: "our_fault", code: "authority_order" }), refused, "the authority reason needs the authority category");
    await assert.rejects(() => insert({ category: "our_fault", code: "wrong_amount" }), refused, "authority fields on an our-fault case");
    await assert.rejects(() => insert({ category: "change_of_mind", code: "change_of_mind", name: null, ref: "x" }), refused, "an authority reference on a change of mind");
    await insert({ category: "our_fault", code: "wrong_amount", name: null, ref: null, received: null });
    await insert({ deadline: new Date(Date.now() + dayMs) });
    pass("the database refuses an authority case without its fields, and the fields on any other case");
  }

  // ---- Always eligible: an old order with paid features used ---------------------------------------------------------
  {
    const order = await paidOrder();
    await recordPaidUse(order.buyerId);
    await withTriggersOff("payment_orders", (tx) => tx.$executeRaw`
      UPDATE payment_orders SET created_at = now() - interval '60 days', paid_at = now() - interval '60 days' WHERE id = ${order.id}::uuid
    `);

    const old = await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "authority_order" });
    assert.equal(old.eligible, true);
    assert.equal(old.rule, "authority_order");
    assert.equal(old.category, "authority_order");
    assert.ok(old.usageRows >= 1, "the order has paid use");
    assert.equal(old.withinWindow, false, "60 days after payment");
    const comparison = await evaluateEligibility(prisma, { orderId: order.id, reasonCode: "change_of_mind" });
    assert.equal(comparison.eligible, false, "a change of mind on the same order is refused");

    const prepared = await prepare(order.id);
    assert.equal(prepared.eligibility.eligible, true);
    const row = await refundCase(prepared.caseId);
    assert.equal(row.reasonCategory, "authority_order");
    assert.equal(row.reasonCode, "authority_order");
    assert.equal(row.amountRupiah, order.amountRupiah, "the default is the whole payment");
    assert.equal((row.eligibilityPrepared as { rule: string }).rule, "authority_order");
    await approve(prepared.caseId);
    const approved = await refundCase(prepared.caseId);
    assert.equal(approved.state, "approved", "the owner can approve it on an old, used order");
    assert.equal((approved.eligibilityApproved as { eligible: boolean }).eligible, true);

    // Any amount up to the captured payment, and not more.
    const partialOrder = await paidOrder();
    const partial = await prepare(partialOrder.id, { amountRupiah: 1000 });
    assert.equal((await refundCase(partial.caseId)).amountRupiah, 1000);
    await refundError(() => prepare(partialOrder.id, { amountRupiah: partialOrder.amountRupiah + 1 }), "balance_exceeded");
    await refundError(() => prepare(partialOrder.id, { amountRupiah: 0 }), "invalid_input");
    pass("always eligible: an old order with paid use is refundable, in any amount up to the capture");
  }

  // ---- Roles: any MFA admin prepares; only the owner approves, with a reason; self-approval is stored -------------------
  {
    const order = await paidOrder();
    assert.throws(
      () => requireAdmin(authority.sessionFor(authority.otherEmail, { id: authority.otherId, mfa: "challenge" })),
      (error: unknown) => error instanceof FraudAuthorityError && error.code === "mfa_required",
      "an admin without a verified second factor cannot prepare",
    );
    const prepared = await prepare(order.id, { amountRupiah: 10_000 });
    assert.equal((await refundCase(prepared.caseId)).preparedByUserId, authority.otherId, "any MFA admin prepared it");

    assert.throws(() => requireOwner(authority.sessionFor(authority.otherEmail, { id: authority.otherId }), ENV), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner");
    const forged = { email: authority.otherEmail, userId: authority.otherId } as unknown as typeof owner;
    await assert.rejects(
      () => approveRefund(forged, { caseId: prepared.caseId, expectedVersion: 1, reason: FULL_REASON }, ENV),
      (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner",
    );
    await assert.rejects(
      () => approveRefund(owner, { caseId: prepared.caseId, expectedVersion: 1, reason: "ok" }, ENV),
      (error: unknown) => error instanceof FraudValidationError && error.code === "invalid_reason",
    );
    assert.equal((await refundCase(prepared.caseId)).state, "prepared", "nothing changed");

    const approved = await approve(prepared.caseId);
    assert.equal(approved.selfApproved, false);
    const row = await refundCase(prepared.caseId);
    assert.equal(row.approvedByUserId, authority.ownerId);
    assert.equal(row.approvalReason, FULL_REASON);
    assert.equal(row.selfApproved, false);

    // The owner prepares and approves the same case: stored as self-approved, and disclosed in the case record.
    const own = await prepare(order.id, { amountRupiah: 5_000 }, authority.adminAsOwner);
    const ownApproval = await approve(own.caseId);
    assert.equal(ownApproval.selfApproved, true);
    assert.equal((await refundCase(own.caseId)).selfApproved, true);
    const records = await listRefundRecords(prisma, order.id);
    assert.equal(records.find((record) => record.id === own.caseId)?.selfApproved, true);
    const events = await prisma.refundCaseEvent.findMany({ orderBy: { createdAt: "asc" }, where: { caseId: own.caseId } });
    assert.equal((events.at(-1)?.metadata as { selfApproved: boolean }).selfApproved, true);
    pass("any MFA admin prepares, only the owner approves with a written reason, and a self-approval is stored and disclosed");
  }

  // ---- The deadline: the authority's, when earlier than 14 days -----------------------------------------------------------
  {
    const order = await paidOrder();
    const near = new Date(Date.now() + 5 * dayMs);
    const early = await prepare(order.id, { amountRupiah: 1000, authorityDeadlineAt: near });
    assert.equal((await refundCase(early.caseId)).authorityDeadlineAt?.getTime(), near.getTime());
    await approve(early.caseId);
    const earlyRow = await refundCase(early.caseId);
    assert.equal(earlyRow.payoutDueAt?.getTime(), near.getTime(), "the payout is due by the authority's earlier deadline");

    const far = new Date(Date.now() + 30 * dayMs);
    const late = await prepare(order.id, { amountRupiah: 1000, authorityDeadlineAt: far });
    await approve(late.caseId);
    const lateRow = await refundCase(late.caseId);
    assert.ok(Math.abs(lateRow.payoutDueAt!.getTime() - (lateRow.approvedAt!.getTime() + 14 * dayMs)) < 60_000, "a later authority deadline leaves the usual 14 days");

    const none = await prepare(order.id, { amountRupiah: 1000 });
    await approve(none.caseId);
    const noneRow = await refundCase(none.caseId);
    assert.equal(noneRow.authorityDeadlineAt, null);
    assert.ok(Math.abs(noneRow.payoutDueAt!.getTime() - (noneRow.approvedAt!.getTime() + 14 * dayMs)) < 60_000, "no deadline: 14 days");

    // The database repeats it: an approval whose payout runs past the authority's deadline is refused.
    const raw = await prepare(order.id, { amountRupiah: 1000, authorityDeadlineAt: near });
    await assert.rejects(
      () => prisma.$transaction(async (tx) => {
        const [event] = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO refund_case_events (case_id, case_version, kind, actor_kind) VALUES (${raw.caseId}::uuid, 2, 'approved', 'owner') RETURNING id
        `;
        await tx.$executeRaw`
          UPDATE refund_cases SET state = 'approved', version = 2, last_event_id = ${event.id}::uuid,
            approved_by_user_id = ${authority.ownerId}::uuid, approved_at = now(), approval_reason = 'alasan yang cukup panjang',
            self_approved = false, eligibility_approved = '{"eligible": true}'::jsonb, payout_due_at = now() + interval '14 days'
          WHERE id = ${raw.caseId}::uuid
        `;
      }),
      /authority's deadline/u,
    );
    assert.equal((await refundCase(raw.caseId)).state, "prepared");

    // The evidence cannot be rewritten afterwards.
    await assert.rejects(() => prisma.$executeRaw`UPDATE refund_cases SET authority_deadline_at = now() + interval '90 days' WHERE id = ${raw.caseId}::uuid`, /cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE refund_cases SET authority_name = 'Lain' WHERE id = ${raw.caseId}::uuid`, /cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE refund_cases SET authority_reference = NULL WHERE id = ${raw.caseId}::uuid`, /cannot be changed/u);
    pass("the payout deadline is the authority's when earlier than 14 days, and the database repeats it");
  }

  // ---- The refund-stalled signal uses the authority's deadline ------------------------------------------------------------
  {
    const order = await paidOrder();
    const received = order.createdAt;
    // A deadline that has already passed, though the 3 working days to decide have not.
    const overdue = await prepare(order.id, { amountRupiah: 1000, authorityDeadlineAt: new Date(received.getTime() + 1), requestedAt: received });
    const row = await refundCase(overdue.caseId);
    assert.ok(row.decisionDueAt.getTime() > Date.now(), "the 3 working days have not run out");

    const listed = (await listRecentRefunds(prisma, 100)).find((item) => item.id === overdue.caseId);
    assert.equal(listed?.overdue, true, "the refund list shows it late on the authority's deadline");

    await flagStalledRefunds();
    const flagged = await prisma.fraudCase.findFirstOrThrow({ where: { signal: "refund_stalled", subjectKey: `refund:${overdue.caseId}` } });
    const evidence = flagged.evidence as { authorityDeadlineOverdue: boolean; decisionOverdue: boolean };
    assert.equal(evidence.authorityDeadlineOverdue, true);
    assert.equal(evidence.decisionOverdue, false);

    // A buyer refund with the same dates is not late; neither is an authority case whose deadline is ahead.
    const fine = await prepare(order.id, { amountRupiah: 1000, authorityDeadlineAt: new Date(Date.now() + 2 * dayMs) });
    const plain = await prepareRefund(admin, { amountRupiah: 1000, orderId: order.id, reasonCode: "wrong_amount", requestChannel: "email", requestNote: NOTE });
    await flagStalledRefunds();
    assert.equal(await prisma.fraudCase.count({ where: { signal: "refund_stalled", subjectKey: { in: [`refund:${fine.caseId}`, `refund:${plain.caseId}`] } } }), 0);

    // Approved after its deadline has passed: the payout was due at the deadline, so it is late at once.
    await approve(overdue.caseId);
    assert.ok((await refundCase(overdue.caseId)).payoutDueAt!.getTime() < Date.now(), "the payout was due at the authority's deadline");
    await flagStalledRefunds();
    const again = await prisma.fraudCase.findFirstOrThrow({ where: { signal: "refund_stalled", subjectKey: `refund:${overdue.caseId}` } });
    assert.equal((again.evidence as { payoutOverdue: boolean }).payoutOverdue, true);
    assert.equal(await prisma.fraudCase.count({ where: { signal: "refund_stalled", subjectKey: `refund:${overdue.caseId}` } }), 1, "one case per refund");
    pass("the refund-stalled signal and the refund list use the authority's earlier deadline");
  }

  // ---- Completion against the stand-in ------------------------------------------------------------------------------------
  const completed = await (async () => {
    const order = await paidOrder();
    assert.equal((await getAccessState(order.buyerId)).status, "active");
    const prepared = await prepare(order.id, { authorityDeadlineAt: new Date(Date.now() + 7 * dayMs) });
    await approve(prepared.caseId);

    const sent = await refundCase(prepared.caseId).then((row) => executeProviderRefund(owner, { caseId: prepared.caseId, expectedVersion: row.version }, { env: ENV, provider }));
    assert.equal(sent.result, "sent");
    assert.equal((await refundCase(prepared.caseId)).state, "processing");
    assert.equal((await getAccessState(order.buyerId)).status, "active", "nothing is revoked before the provider confirms");

    const reference = (await refundCase(prepared.caseId)).reference;
    const confirmation = await provider.settleRefund(reference, "succeeded", new Date());
    assert.ok(confirmation, "the stand-in had a pending refund");
    const received = await deliver(confirmation);
    assert.ok(received.status === "received" && received.result.status === "processed" && received.result.outcome === "accepted");

    const row = await refundCase(prepared.caseId);
    assert.equal(row.state, "completed");
    assert.equal(row.method, "provider");
    assert.equal(row.confirmationSource, "provider_event");
    assert.equal(row.authorityName, "Pengadilan Negeri Jakarta Selatan", "the evidence is still on the finished case");
    assert.equal((await getAccessState(order.buyerId)).status, "revoked", "a full refund ends access");
    assert.equal((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: order.packagePurchaseId! } })).status, "refunded");
    assert.equal(await prisma.auditLog.count({ where: { action: "refund.completed", targetId: order.id } }), 1);
    pass("an authority-order refund prepared, approved, sent and confirmed by the stand-in completes and ends access");
    return { caseId: prepared.caseId, order, reference };
  })();

  // ---- The evidence: the case record, the dispute packet ------------------------------------------------------------------
  {
    const { caseId, order } = completed;
    const deadline = (await refundCase(caseId)).authorityDeadlineAt;
    const records = await listRefundRecords(prisma, order.id);
    assert.equal(records.length, 1);
    const record = records[0];
    assert.equal(record.reasonCategory, "authority_order");
    assert.equal(record.authorityName, "Pengadilan Negeri Jakarta Selatan");
    assert.match(record.authorityReference ?? "", /^No\. 123\/Pdt\.G\/2026\//u);
    assert.equal(record.authorityReceivedAt?.getTime(), record.requestedAt.getTime());
    assert.equal(record.authorityDeadlineAt?.getTime(), deadline?.getTime());
    assert.equal(record.preparedByEmail, authority.otherEmail, "who entered it is on the case");

    // Another order with a buyer refund, so the packet tells the two apart.
    const exported = await createDisputeExport(owner, { env: ENV, orderId: order.id, reason: "Menyiapkan bukti untuk surat perintah otoritas." });
    const fileText = (await prisma.disputeExport.findUniqueOrThrow({ where: { id: exported.exportId } })).packet!;
    assert.equal(verifyPacketFile(fileText), true, "the digest verifies");
    const packet = (JSON.parse(fileText) as { packet: Record<string, any> }).packet; // eslint-disable-line @typescript-eslint/no-explicit-any
    assert.equal(packet.refunds.records.length, 1);
    const refund = packet.refunds.records[0];
    assert.equal(refund.reasonCode, "authority_order");
    assert.equal(refund.reasonCategory, "authority_order");
    assert.equal(refund.authorityName, "Pengadilan Negeri Jakarta Selatan");
    assert.equal(refund.authorityReference, record.authorityReference);
    assert.equal(refund.authorityReceivedAt, record.authorityReceivedAt!.toISOString());
    assert.equal(refund.authorityDeadlineAt, deadline!.toISOString());
    assert.equal(refund.preparedByEmail, authority.otherEmail);
    assert.equal(refund.state, "completed");

    assert.equal(packet.communications.authorityOrders.length, 1);
    const letter = packet.communications.authorityOrders[0];
    assert.equal(letter.authority, "Pengadilan Negeri Jakarta Selatan");
    assert.equal(letter.authorityReference, record.authorityReference);
    assert.equal(letter.deadlineAt, deadline!.toISOString());
    assert.equal(letter.refundReference, refund.reference);
    assert.deepEqual(packet.communications.buyerRefundRequests, [], "an authority's order is not shown as the buyer's request");
    assert.match(packet.communications.note, /otoritas/u);

    const prepared = packet.financialTimeline.find((entry: { label: string }) => entry.label === `Pengembalian dana ${refund.reference}: prepared`);
    assert.ok(prepared, "the timeline has the preparation");
    assert.equal(prepared.detail.authorityName, "Pengadilan Negeri Jakarta Selatan");
    assert.equal(prepared.detail.authorityReference, record.authorityReference);
    assert.equal(packet.manifest.counts.refundCases, 1);
    pass("the authority evidence is in the case record and the dispute packet's refund section, communications and timeline");
  }

  // ---- Retention: still a refund case ---------------------------------------------------------------------------------------
  {
    const order = await paidOrder();
    const prepared = await prepare(order.id, { amountRupiah: 1000 });
    const held = async () => (await prisma.$queryRaw<Array<{ h: boolean }>>`SELECT retention_order_held(${order.id}::uuid) AS h`)[0].h;
    const row = await refundCase(prepared.caseId);
    assert.equal(row.evidenceHold, true, "an open authority case holds evidence, like any refund case");
    assert.equal(await held(), true, "and holds the order's family");
    await approve(prepared.caseId);
    await cancelRefund(owner, { caseId: prepared.caseId, expectedVersion: 2, reason: "Otoritas mencabut perintahnya." }, ENV);
    const closed = await refundCase(prepared.caseId);
    assert.equal(closed.state, "cancelled");
    assert.equal(closed.evidenceHold, false, "closing it releases the flag");
    assert.equal(await held(), false);
    const [{ endsAt }] = await prisma.$queryRaw<Array<{ endsAt: Date | null }>>`SELECT retention_case_end(${order.id}::uuid) AS "endsAt"`;
    assert.ok(endsAt && endsAt.getTime() > Date.now() + 700 * dayMs, "the case's own two-year period runs from closure");
    pass("retention treats an authority case as a refund case: hold while open, two years from closure");
  }

  await cleanUp();
  console.log(`Authority refund checks passed: ${checks.join("; ")}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
