import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { RoleName } from "../generated/prisma/client";
import type { SessionContext } from "../lib/auth/types";
import { sealPacket, verifyPacketFile } from "../lib/disputes/canonical";
import {
  claimDisputeExport,
  createDisputeExport,
  EXPORT_LINK_MINUTES,
  listExportsForOrder,
  purgeExpiredExportPackets,
} from "../lib/disputes/export";
import { requireOwner } from "../lib/fraud/authority";
import { FraudAuthorityError, FraudValidationError } from "../lib/fraud/errors";
import { PURCHASE_TERMS } from "../lib/fulfillment/terms";
import { recordPaidUse } from "../lib/fulfillment/usage";
import { createOrderFromIntent, ensurePaymentSession } from "../lib/payments/orders";
import {
  deliver,
  failLeftoverOrders,
  getPackageCode,
  getReferral,
  makeBuyer,
  makeIntent,
  makeOrder,
  prisma,
  provider,
  randomBuyerIp,
  APP_ORIGIN,
  runId,
  signedEventFor,
} from "./payment-test-kit";

/**
 * Commerce behavior test 6 (MS-08 phase A): the dispute export. Owner-only with
 * a verified second factor and a written reason; one order's genuine evidence
 * only, other students redacted; a digest that detects changes; every export
 * logged; a one-use link that expires in minutes. Runs on the local database
 * only (payment-test-kit refuses the rest).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the packet is read as loose JSON, field by field
type LoosePacket = Record<string, any>;

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const OWNER_EMAIL = `export-owner-${runId}@vecalss.local`;
const ENV = { FRAUD_OWNER_EMAIL: OWNER_EMAIL };
const REASON = "Pembeli mengajukan sengketa ke penyedia pembayaran.";

function sessionFor(email: string, options: { id?: string; mfa?: "challenge" | "verified"; roles?: RoleName[] } = {}): SessionContext {
  return {
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: `session-${randomUUID()}`,
    user: {
      email,
      fullName: "Admin",
      id: options.id ?? randomUUID(),
      mfaStatus: options.mfa ?? "verified",
      mustChangePassword: false,
      onboardingStatus: null,
      roles: options.roles ?? [RoleName.admin],
      status: "active",
    },
  };
}

async function makeAdmin(email: string) {
  const user = await prisma.user.create({
    data: { email, fullName: "Admin", passwordHash: "not-a-real-hash", roleAssignments: { create: [{ role: "admin" }] } },
    select: { id: true },
  });
  return user.id;
}

async function withTriggersOff<T>(table: string, work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    const value = await work(tx);
    await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    return value;
  });
}

async function main() {
  const ownerId = await makeAdmin(OWNER_EMAIL);
  const owner = requireOwner(sessionFor(OWNER_EMAIL, { id: ownerId }), ENV);
  const packageCode = await getPackageCode();
  const referral = await getReferral();
  const sharedIp = randomBuyerIp();

  // The order under dispute: real terms, an affiliator referral, a delivered grant, one day of use.
  const buyerId = await makeBuyer("disputed");
  const intent = await makeIntent(buyerId, 49_000, referral.referralCode, { termsVersion: PURCHASE_TERMS.version });
  const created = await createOrderFromIntent({
    buyerId, buyerIp: sharedIp, buyerIpExemption: null, buyerIpSource: "trusted-proxy:1",
    deviceToken: "device-cookie-for-test-0123456789abcdef", intent, packageCode, provider,
  });
  assert.ok(created.ok);
  assert.ok((await ensurePaymentSession(created.order, provider, APP_ORIGIN)).ok);
  const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: created.order.id } });
  await deliver(signedEventFor(order, "payment.succeeded"));
  await recordPaidUse(buyerId);
  const buyer = await prisma.user.findUniqueOrThrow({ where: { id: buyerId } });

  // Another student shares the buyer's address; none of their data may appear.
  const other = await makeOrder();
  const otherUser = await prisma.user.findUniqueOrThrow({ where: { id: other.buyerId } });
  await prisma.user.update({ data: { fullName: `ZZSecretStudent-${runId}` }, where: { id: other.buyerId } });
  await deliver(signedEventFor(other, "payment.succeeded"));

  // ---- Authority: owner only, verified second factor, written reason ---------------------------
  {
    const refusals: Array<[string, () => unknown, string]> = [
      ["another admin", () => requireOwner(sessionFor(`someone-${runId}@vecalss.local`), ENV), "not_owner"],
      ["the owner without a verified second factor", () => requireOwner(sessionFor(OWNER_EMAIL, { mfa: "challenge" }), ENV), "mfa_required"],
      ["no session", () => requireOwner(null, ENV), "unauthenticated"],
      ["a student who has the owner's address", () => requireOwner(sessionFor(OWNER_EMAIL, { roles: [RoleName.student] }), ENV), "not_admin"],
      ["no owner configured", () => requireOwner(sessionFor(OWNER_EMAIL, {}), {}), "owner_unset"],
    ];
    for (const [label, attempt, code] of refusals) {
      assert.throws(attempt, (error: unknown) => error instanceof FraudAuthorityError && error.code === code, label);
    }

    // A context that was forged or outlived a role change is refused by the export itself.
    const before = await prisma.disputeExport.count({ where: { orderId: order.id } });
    const forged = { email: `someone-${runId}@vecalss.local`, userId: await makeAdmin(`someone-${runId}@vecalss.local`) } as unknown as typeof owner;
    await assert.rejects(() => createDisputeExport(forged, { env: ENV, orderId: order.id, reason: REASON }), /not_owner/u);
    const stranger = { email: OWNER_EMAIL, userId: randomUUID() } as unknown as typeof owner;
    await assert.rejects(() => createDisputeExport(stranger, { env: ENV, orderId: order.id, reason: REASON }), /not_owner/u);
    await assert.rejects(() => createDisputeExport(owner, { env: {}, orderId: order.id, reason: REASON }), /owner_unset/u);

    for (const reason of ["", "      ", "pendek", "x".repeat(501), undefined]) {
      await assert.rejects(
        () => createDisputeExport(owner, { env: ENV, orderId: order.id, reason }),
        (error: unknown) => error instanceof FraudValidationError && error.code === "invalid_reason",
      );
    }
    await assert.rejects(() => createDisputeExport(owner, { env: ENV, orderId: randomUUID(), reason: REASON }), /not found/u);
    await assert.rejects(() => createDisputeExport(owner, { env: ENV, orderId: "not-an-id", reason: REASON }), /not found/u);
    assert.equal(await prisma.disputeExport.count({ where: { orderId: order.id } }), before, "a refused export leaves no row");
    assert.equal(await prisma.auditLog.count({ where: { action: "dispute.export.created", targetId: order.id } }), 0, "and no audit event");
    pass("owner only, second factor and written reason required");
  }

  // ---- The packet ------------------------------------------------------------------------------
  const exported = await createDisputeExport(owner, { env: ENV, orderId: order.id, reason: REASON });
  const row = await prisma.disputeExport.findUniqueOrThrow({ where: { id: exported.exportId } });
  assert.ok(row.packet);
  const file = JSON.parse(row.packet) as {
    digest: { method: string; sha256: string };
    packet: LoosePacket;
  };
  const packet = file.packet;

  {
    assert.equal(packet.manifest.orderId, order.id);
    assert.equal(packet.manifest.reason, REASON);
    assert.equal(packet.manifest.generatedBy.userId, ownerId);
    assert.deepEqual(packet.manifest.sections, ["order", "financialTimeline", "payment", "grant", "receipt", "usage", "provenance", "retention", "acceptedTerms", "refunds", "disputes", "communications", "cases"]);
    assert.ok(packet.manifest.redactions.length >= 4);

    // Financial timeline: ordered, and it carries the order, the payment, the grant and the use.
    const timeline = packet.financialTimeline as Array<{ at: string; label: string; source: string }>;
    const times = timeline.map((entry) => Date.parse(entry.at));
    assert.deepEqual(times, [...times].sort((a, b) => a - b), "the timeline runs in time order");
    for (const source of ["checkout", "order", "payment_event", "audit", "receipt", "access", "delivery", "use"]) {
      assert.ok(timeline.some((entry) => entry.source === source), `the timeline has ${source}`);
    }
    assert.equal(packet.payment.events.length, 1);
    assert.equal(packet.payment.events[0].outcome, "accepted");
    assert.equal(packet.payment.purchaseSummary.status, "succeeded");
    assert.equal(packet.payment.reservation.state, "paid");

    // Grant, receipt, use: all genuine and consistent with the tables.
    const receipt = await prisma.paymentReceipt.findUniqueOrThrow({ where: { orderId: order.id } });
    assert.equal(packet.receipt.receiptNumber, receipt.receiptNumber);
    assert.equal(packet.receipt.deliveryStatus, "delivered");
    assert.equal(packet.grant.accessHistorySinceGrant[0].idempotencyKey, `order:${order.id}`);
    assert.equal(packet.grant.accessHistorySinceGrant[0].isGrantForThisOrder, true);
    assert.equal(packet.usage.length, 1);
    assert.equal(packet.communications.receiptDeliveries[0].channel, "in_app");

    // Provenance and policy.
    assert.equal(packet.provenance.buyerIp, sharedIp);
    assert.equal(packet.provenance.buyerIpSource, "trusted-proxy:1");
    assert.ok(typeof packet.provenance.deviceTokenRef === "string" && packet.provenance.deviceTokenRef.length === 12 || packet.provenance.deviceTokenRef === null);
    assert.equal(packet.acceptedTerms.version, PURCHASE_TERMS.version);
    assert.equal(packet.acceptedTerms.status, "draft");
    assert.ok(packet.acceptedTerms.text.length > 3, "the accepted text is printed");
    assert.deepEqual(packet.refunds.records, [], "an order with no refund says so");
    assert.match(packet.refunds.note, /Tidak ada permintaan pengembalian dana/u);
    assert.deepEqual(packet.disputes.records, []);
    assert.equal(packet.manifest.packetVersion, 3, "MS-10 added the retention section, so packets are version 3");
    assert.equal(packet.order.affiliatorReferralCode, referral.referralCode);
    assert.equal(packet.buyer.email, buyer.email);
    assert.equal(packet.manifest.counts.usageDays, 1);
    pass("the packet holds the genuine evidence");
  }

  // ---- Genuine only: an undelivered order shows no grant and no use -----------------------------
  {
    const stuck = await makeOrder({ plan: "full" });
    await deliver(signedEventFor(stuck, "payment.succeeded"));
    const undelivered = await createDisputeExport(owner, { env: ENV, orderId: stuck.id, reason: REASON });
    const text = (await prisma.disputeExport.findUniqueOrThrow({ where: { id: undelivered.exportId } })).packet!;
    const stuckPacket = (JSON.parse(text) as { packet: LoosePacket }).packet;
    assert.equal(stuckPacket.receipt.deliveryStatus, "pending");
    assert.equal(stuckPacket.receipt.grantEventId, null);
    assert.deepEqual(stuckPacket.grant.accessHistorySinceGrant, [], "no grant is invented");
    assert.deepEqual(stuckPacket.usage, [], "no use is invented");
    assert.equal(stuckPacket.acceptedTerms.text, null, "an unknown terms version prints no text rather than a guess");
    assert.ok(stuckPacket.financialTimeline.every((entry: { source: string }) => entry.source !== "use" && entry.source !== "access"));
    pass("an undelivered order exports as undelivered");
  }

  // ---- Redaction --------------------------------------------------------------------------------
  {
    const text = row.packet!;
    for (const secret of [other.buyerId, other.id, other.reference, otherUser.email, `ZZSecretStudent-${runId}`]) {
      assert.ok(!text.includes(secret), `the packet leaves out another student's data (${secret.slice(0, 12)}…)`);
    }
    const affiliator = await prisma.affiliatorProfile.findUniqueOrThrow({ include: { user: true }, where: { id: referral.id } });
    assert.ok(!text.includes(affiliator.user.email), "the affiliator's identity is left out");
    assert.ok(buyer.passwordHash, "the verified fixture has a credential");
    assert.ok(!text.includes("tokenHash") && !text.includes(buyer.passwordHash), "no secret material");
    assert.ok(!/device-cookie-for-test/u.test(text), "the device value is never printed, only a reference");
    assert.equal(packet.cases.every((item: Record<string, unknown>) => !("evidence" in item)), true, "case evidence stays out");
    pass("other students are redacted");
  }

  // ---- Integrity digest -------------------------------------------------------------------------
  {
    assert.equal(file.digest.sha256, exported.digestSha256);
    assert.equal(row.digestSha256, exported.digestSha256);
    assert.ok(verifyPacketFile(row.packet!), "the digest verifies");
    assert.equal(createHash("sha256").update(row.packet!).digest("hex") === exported.digestSha256, false, "the digest covers the canonical packet, not the file bytes");

    const tampered = row.packet!.replace('"amountRupiah": 49000', '"amountRupiah": 4900');
    assert.notEqual(tampered, row.packet);
    assert.equal(verifyPacketFile(tampered), false, "a changed amount is detected");
    assert.equal(verifyPacketFile(row.packet!.replace(buyer.email, "ganti@example.test")), false, "a changed identity is detected");
    assert.equal(verifyPacketFile("not json"), false);

    // Key order and whitespace do not matter; content does.
    const reordered = JSON.stringify({ packet: Object.fromEntries(Object.entries(packet).reverse()), digest: file.digest });
    assert.ok(verifyPacketFile(reordered), "the same data in another order verifies");
    assert.equal(sealPacket({ b: 1, a: [2, { d: 1, c: 2 }] }).digest.sha256, sealPacket({ a: [2, { c: 2, d: 1 }], b: 1 }).digest.sha256);
    assert.notEqual(sealPacket({ a: 1 }).digest.sha256, sealPacket({ a: 2 }).digest.sha256);
    pass("the digest verifies and detects change");
  }

  // ---- Logging ----------------------------------------------------------------------------------
  {
    assert.equal(row.requestedById, ownerId);
    assert.equal(row.reason, REASON);
    assert.equal(row.orderId, order.id);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "dispute.export.created", targetId: order.id } });
    assert.equal(audit.actorUserId, ownerId);
    assert.equal((audit.metadata as { exportId?: string }).exportId, exported.exportId);
    assert.equal((audit.metadata as { digestSha256?: string }).digestSha256, exported.digestSha256);
    assert.ok(!JSON.stringify(audit.metadata).includes(buyer.email), "the audit event carries no evidence");
    const listed = await listExportsForOrder(order.id);
    assert.equal(listed[0].id, exported.exportId);
    assert.equal(listed[0].requestedByEmail, OWNER_EMAIL);

    // Every export row has its audit event: count them side by side for this order.
    const [{ exportsCount, auditsCount }] = await prisma.$queryRaw<Array<{ auditsCount: number; exportsCount: number }>>`
      SELECT (SELECT count(*)::int FROM dispute_exports WHERE order_id = ${order.id}::uuid) AS "exportsCount",
             (SELECT count(*)::int FROM audit_logs WHERE action = 'dispute.export.created' AND target_id = ${order.id}::uuid) AS "auditsCount"
    `;
    assert.equal(exportsCount, auditsCount, "no export without its audit event");
    pass("every export is logged");
  }

  // ---- The one-use, short-lived link --------------------------------------------------------------
  {
    const windowMinutes = (row.expiresAt.getTime() - row.createdAt.getTime()) / 60_000;
    assert.equal(windowMinutes, EXPORT_LINK_MINUTES, "about ten minutes, on database time");
    assert.equal(createHash("sha256").update(exported.token).digest("hex"), row.tokenHash);
    assert.ok(!JSON.stringify(row).includes(exported.token), "only the hash of the token is stored");

    // A stranger or a mistyped link gets nothing and consumes nothing.
    assert.deepEqual(await claimDisputeExport(owner, "x".repeat(43), ENV), { ok: false, reason: "expired_or_used" });
    assert.deepEqual(await claimDisputeExport(owner, "short", ENV), { ok: false, reason: "expired_or_used" });
    await assert.rejects(() => claimDisputeExport(forged(), exported.token, ENV), /not_owner/u);
    assert.equal((await prisma.disputeExport.findUniqueOrThrow({ where: { id: exported.exportId } })).downloadedAt, null, "a refused claim consumes nothing");

    const first = await claimDisputeExport(owner, exported.token, ENV);
    assert.ok(first.ok);
    assert.equal(first.text, row.packet, "the packet is handed over as built");
    assert.ok(verifyPacketFile(first.text));
    assert.match(first.fileName, /^bukti-sengketa-[0-9a-f-]{36}\.json$/u);

    const second = await claimDisputeExport(owner, exported.token, ENV);
    assert.deepEqual(second, { ok: false, reason: "expired_or_used" }, "the link works once");
    const used = await prisma.disputeExport.findUniqueOrThrow({ where: { id: exported.exportId } });
    assert.ok(used.downloadedAt);
    assert.equal(used.packet, null, "the packet is dropped once handed over");
    assert.ok(used.packetPurgedAt);
    assert.equal(used.digestSha256, exported.digestSha256, "the log keeps the digest");
    assert.equal(await prisma.auditLog.count({ where: { action: "dispute.export.downloaded", targetId: order.id } }), 1);

    // Concurrent claims: exactly one wins.
    const racing = await createDisputeExport(owner, { env: ENV, orderId: order.id, reason: REASON });
    const results = await Promise.all(Array.from({ length: 6 }, () => claimDisputeExport(owner, racing.token, ENV)));
    assert.equal(results.filter((result) => result.ok).length, 1);

    // An expired link gives nothing, and the packet is purged.
    const stale = await createDisputeExport(owner, { env: ENV, orderId: order.id, reason: REASON });
    await withTriggersOff("dispute_exports", (tx) =>
      tx.$executeRaw`UPDATE dispute_exports SET created_at = now() - interval '20 minutes', expires_at = now() - interval '10 minutes' WHERE id = ${stale.exportId}::uuid`,
    );
    assert.deepEqual(await claimDisputeExport(owner, stale.token, ENV), { ok: false, reason: "expired_or_used" });
    assert.ok(await purgeExpiredExportPackets() >= 1);
    const purged = await prisma.disputeExport.findUniqueOrThrow({ where: { id: stale.exportId } });
    assert.equal(purged.packet, null);
    assert.ok(purged.packetPurgedAt);
    assert.equal(purged.downloadedAt, null, "it was never downloaded");
    assert.equal(await purgeExpiredExportPackets(), 0, "purging again does nothing");
    pass("the link is one-use and expires");
  }

  // ---- The log cannot be rewritten ----------------------------------------------------------------
  {
    await assert.rejects(() => prisma.$executeRaw`UPDATE dispute_exports SET reason = 'diubah lagi untuk menghapus jejak' WHERE id = ${exported.exportId}::uuid`, /cannot be changed/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE dispute_exports SET packet = 'baru' WHERE id = ${exported.exportId}::uuid`, /cannot be (changed|replaced)/u);
    await assert.rejects(() => prisma.$executeRaw`DELETE FROM dispute_exports WHERE id = ${exported.exportId}::uuid`, /never deleted/u);
    await assert.rejects(() => prisma.$executeRaw`TRUNCATE dispute_exports`, /append-only/u);
    await assert.rejects(() => prisma.$executeRaw`UPDATE dispute_exports SET downloaded_at = now() WHERE id = ${exported.exportId}::uuid`, /recorded once/u);
    pass("the export log is guarded");
  }

  await failLeftoverOrders();
  console.log(`Dispute export checks passed: ${checks.join(", ")}.`);

  function forged() {
    return { email: `someone-${runId}@vecalss.local`, userId: randomUUID() } as unknown as typeof owner;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
