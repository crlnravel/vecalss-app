import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { approveRefund, prepareRefund } from "../lib/refunds/cases";
import { lockRefundCase } from "../lib/refunds/core";
import { completeRefund } from "../lib/refunds/effects";
import { executeProviderRefund, reconcileRefund } from "../lib/refunds/execute";
import type { PaymentProviderAdapter, ProviderRefundStatus } from "../lib/payments/adapter";
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

  const [guard] = await prisma.$queryRaw<Array<{ definition: string }>>`
    SELECT pg_get_functiondef('public.guard_refund_case_change()'::regprocedure) AS definition
  `;
  assert.match(guard.definition, /e\.provider_account\s*=\s*order_row\.provider_account/u);
  assert.match(guard.definition, /e\.provider_environment\s*=\s*order_row\.provider_environment/u);
  assert.match(guard.definition, /current_user\s*=\s*'vecalss_retention'/u, "the retention delete exception survives the re-creation");
  assert.match(guard.definition, /authority_deadline_at/u, "the authority deadline check survives the re-creation");
  assert.match(guard.definition, /payment_events\s+e/u, "the event evidence check survives the re-creation");
  pass("the deployed completion guard binds event account/environment to its order and retains prior checks");

  const processing = async (failBeforeProvider = false) => {
    const order = await paidOrder();
    const prepared = await prepareRefund(admin, { orderId: order.id, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan." });
    await approveRefund(owner, { caseId: prepared.caseId, expectedVersion: (await refundCase(prepared.caseId)).version, reason: FULL_REASON, revokeAccess: false }, ENV);
    if (failBeforeProvider) provider.failNextRefundCall("before");
    const sent = await executeProviderRefund(owner, { caseId: prepared.caseId, expectedVersion: (await refundCase(prepared.caseId)).version }, { env: ENV, provider });
    assert.equal(sent.result, failBeforeProvider ? "unknown" : "sent");
    return { order, row: await refundCase(prepared.caseId) };
  };

  const alteredProvider = (
    identity: Partial<Pick<PaymentProviderAdapter, "id" | "merchantAccount" | "environment">> = {},
    statusOverrides: Partial<Omit<Extract<ProviderRefundStatus, { found: true }>, "found">> = {},
  ) => new Proxy(provider, {
    get(target, property) {
      if (property === "id" && identity.id) return identity.id;
      if (property === "merchantAccount" && identity.merchantAccount) return identity.merchantAccount;
      if (property === "environment" && identity.environment) return identity.environment;
      if (property === "getRefundStatus" && Object.keys(statusOverrides).length) {
        return async (reference: string) => {
          const status = await target.getRefundStatus(reference);
          return status.found ? { ...status, ...statusOverrides } : status;
        };
      }
      return Reflect.get(target, property, target);
    },
  }) as unknown as PaymentProviderAdapter;

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
      (error: unknown) => /recorded provider event for this order/u.test(String((error as Error).message)),
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
  await forge("a different merchant account", (await event({ providerAccount: "different-account" })).id);
  await forge("a different merchant environment", (await event({ providerEnvironment: "different-environment" })).id);
  await forge("a refund-failed event", (await event({ type: "refund_failed" })).id);
  await forge("a payment event", (await event({ type: "succeeded" })).id);
  await forge("an event that was only quarantined", (await event({ outcome: "quarantined", reason: "refund_amount" })).id);
  await forge("a webhook row used as a status lookup", (await event({ source: "webhook" })).id, "provider_status");
  await forge("a reconciliation row used as a webhook", (await event({ source: "reconciliation" })).id, "provider_event");
  assert.equal((await getAccessStatus(order.buyerId)), "active", "no refused attempt changed access");
  pass("a completion naming no event, another order's, or an event with a different amount, refund, payment, currency, type, outcome or source is refused");

  // ---- Status identity is bound to the original order under the case lock --------------------------------------------------------------
  const mismatchedStatus = async (
    label: string,
    identity: Partial<Pick<PaymentProviderAdapter, "id" | "merchantAccount" | "environment">> = {},
    statusOverrides: Partial<Omit<Extract<ProviderRefundStatus, { found: true }>, "found">> = {},
    notFound = false,
  ) => {
    const { row: target } = await processing(notFound);
    assert.deepEqual(await reconcileRefund(target.id, { provider: alteredProvider(identity, statusOverrides) }), { result: "mismatch" }, label);
    const after = await refundCase(target.id);
    assert.equal(after.state, "processing", `${label}: the case remains unresolved for review`);
    assert.equal(after.outcomeUnknown, notFound, `${label}: a mismatch never clears an unknown outcome`);
    assert.ok(
      await prisma.refundCaseEvent.findFirst({ where: { caseId: target.id, kind: "note", metadata: { path: ["reason"], equals: "provider_status_mismatch" } } }),
      `${label}: the mismatch is recorded for review`,
    );
  };

  await mismatchedStatus("adapter provider id differs", { id: "other-provider" });
  await mismatchedStatus("adapter account differs", { merchantAccount: "other-account" });
  await mismatchedStatus("adapter environment differs", { environment: "other-environment" });
  await mismatchedStatus("returned account differs", {}, { merchantAccount: "other-account" });
  await mismatchedStatus("returned environment differs", {}, { environment: "other-environment" });
  await mismatchedStatus("returned payment id differs", {}, { providerPaymentId: "other-payment" });
  await mismatchedStatus("a not-found answer from a changed account cannot authorize a retry", { merchantAccount: "other-account" }, {}, true);
  pass("status and adapter identities must match the original order; mismatches remain processing and are recorded for review");

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
