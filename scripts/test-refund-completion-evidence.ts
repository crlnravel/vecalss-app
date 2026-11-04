import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { approveRefund, prepareRefund } from "../lib/refunds/cases";
import { lockRefundCase } from "../lib/refunds/core";
import { completeRefund } from "../lib/refunds/effects";
import { executeProviderRefund, reconcileRefund } from "../lib/refunds/execute";
import { deliver } from "./payment-test-kit";
import { cleanUp, ENV, FULL_REASON, paidOrder, prisma, provider, refundCase, setupAuthority } from "./refund-test-kit";

/**
 * MS-19 H-01: a provider-sourced refund completion must point at a recorded
 * provider event for the same order, refund and amount. A completion that names
 * no event, someone else's event, or an event that does not match is refused by
 * the database; both real paths (signed webhook, status lookup) still complete
 * because each stores its event before completing. Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

async function main() {
  const { admin, owner } = await setupAuthority();
  const processing = async () => {
    const order = await paidOrder();
    const prepared = await prepareRefund(admin, { orderId: order.id, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan." });
    await approveRefund(owner, { caseId: prepared.caseId, expectedVersion: (await refundCase(prepared.caseId)).version, reason: FULL_REASON, revokeAccess: false }, ENV);
    const sent = await executeProviderRefund(owner, { caseId: prepared.caseId, expectedVersion: (await refundCase(prepared.caseId)).version }, { env: ENV, provider });
    assert.equal(sent.result, "sent");
    return { order, row: await refundCase(prepared.caseId) };
  };

  // ---- Forged completions are refused by the database --------------------------------------------------------------------------------------
  const { order, row } = await processing();
  const other = await processing();
  const event = (over: Record<string, unknown> = {}, target = { order, row }) =>
    prisma.paymentEvent.create({
      data: {
        amountRupiah: target.row.amountRupiah,
        currency: target.row.currency,
        eventId: `forged-${randomUUID()}`,
        merchantReference: target.order.reference,
        orderId: target.order.id,
        outcome: "accepted",
        provider: provider.id,
        providerAccount: provider.merchantAccount,
        providerEnvironment: provider.environment,
        providerOccurredAt: new Date(),
        providerPaymentId: target.row.providerPaymentId,
        providerRefundId: target.row.providerRefundId,
        refundReference: target.row.reference,
        source: "webhook",
        type: "refund_succeeded",
        ...over,
      } as never,
    });

  const forge = async (label: string, eventId: string | null, source: "provider_event" | "provider_status" = "provider_event") => {
    await assert.rejects(
      prisma.$transaction((tx) => lockRefundCase(tx, row.id).then((locked) => completeRefund(tx, locked, { actor: { kind: "system" }, eventId: eventId as string, source }, row.providerRefundId))),
      (error: unknown) => /recorded provider event for this order, refund and amount/u.test(String((error as Error).message)),
      label,
    );
    assert.equal((await refundCase(row.id)).state, "processing", `${label}: the case is still processing`);
  };

  await forge("no event named", null);
  await forge("an event that does not exist", randomUUID());
  await forge("another order's event", (await event({}, other)).id);
  await forge("a different amount", (await event({ amountRupiah: row.amountRupiah - 1 })).id);
  await forge("a different refund id", (await event({ providerRefundId: "some-other-refund" })).id);
  await forge("a different refund reference", (await event({ refundReference: other.row.reference })).id);
  await forge("a different payment", (await event({ providerPaymentId: "pay_other" })).id);
  await forge("a different currency", (await event({ currency: "USD" })).id);
  await forge("a refund-failed event", (await event({ type: "refund_failed" })).id);
  await forge("a payment event", (await event({ type: "succeeded" })).id);
  await forge("an event that was only quarantined", (await event({ outcome: "quarantined", reason: "refund_amount" })).id);
  await forge("a webhook row used as a status lookup", (await event({ source: "webhook" })).id, "provider_status");
  await forge("a reconciliation row used as a webhook", (await event({ source: "reconciliation" })).id, "provider_event");
  assert.equal((await getAccessStatus(order.buyerId)), "active", "no refused attempt changed access");
  pass("a completion naming no event, another order's, or an event with a different amount, refund, payment, currency, type, outcome or source is refused");

  // ---- A direct write of the completed state without a history row or event is refused too ----------------------------------------------------
  await assert.rejects(
    prisma.$executeRaw`UPDATE refund_cases SET state = 'completed', version = version + 1, completed_at = now(), confirmation_source = 'provider_status', evidence_hold = false WHERE id = ${row.id}::uuid`,
    (error: unknown) => /history row/u.test(String((error as Error).message)),
  );
  pass("writing the completed state directly is refused");

  // ---- The real paths still complete ---------------------------------------------------------------------------------------------------------
  const settled = await provider.settleRefund(row.reference, "succeeded", new Date());
  assert.ok(settled);
  const received = await deliver(settled);
  assert.ok(received.status === "received" && received.result.status === "processed" && received.result.outcome === "accepted");
  const viaEvent = await refundCase(row.id);
  assert.equal(viaEvent.state, "completed");
  assert.equal(viaEvent.confirmationSource, "provider_event");
  const webhookRow = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: viaEvent.confirmationEventId! } });
  assert.equal(webhookRow.source, "webhook");
  pass("a signed refund webhook still completes the case, pointing at the event it stored");

  await prisma.$executeRaw`UPDATE stand_in_refunds SET state = 'succeeded', settled_at = now() WHERE reference = ${other.row.reference}`;
  assert.deepEqual(await reconcileRefund(other.row.id, { provider }), { result: "completed" });
  const viaStatus = await refundCase(other.row.id);
  assert.equal(viaStatus.state, "completed");
  assert.equal(viaStatus.confirmationSource, "provider_status");
  const statusRow = await prisma.paymentEvent.findUniqueOrThrow({ where: { id: viaStatus.confirmationEventId! } });
  assert.equal(statusRow.source, "reconciliation");
  assert.equal(statusRow.type, "refund_succeeded");
  assert.equal(statusRow.outcome, "accepted");
  assert.equal(statusRow.orderId, other.order.id);
  assert.equal(statusRow.amountRupiah, other.row.amountRupiah);
  assert.equal(statusRow.providerRefundId, viaStatus.providerRefundId);
  assert.equal(statusRow.refundReference, other.row.reference);
  assert.equal(await prisma.paymentEvent.count({ where: { refundReference: other.row.reference, source: "reconciliation" } }), 1, "the status answer is stored once");
  assert.deepEqual(await reconcileRefund(other.row.id, { provider }), { result: "unchanged" }, "repeating changes nothing");
  pass("a status lookup still completes the case, after storing its answer as one reconciliation event");

  await cleanUp();
  await prisma.$disconnect();
  console.log(`refund completion evidence: ${checks.length} checks passed`);
  for (const line of checks) console.log(` - ${line}`);
}

async function getAccessStatus(buyerId: string) {
  const { getAccessState } = await import("../lib/billing/service");
  return (await getAccessState(buyerId)).status;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
