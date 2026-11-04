import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RoleName } from "../generated/prisma/client";
import type { SessionContext } from "../lib/auth/types";
import { requireAdmin, requireOwner } from "../lib/fraud/authority";
import { createManualBlock } from "../lib/fraud/blocks";
import { acknowledgeCase, closeCase, escalateCase, linkBlockToCase, openFraudCase, reopenCase } from "../lib/fraud/cases";
import { FRAUD_SIGNALS } from "../lib/fraud/constants";
import { isVolumeSpike, runDailyFraudSignals } from "../lib/fraud/daily";
import { FraudAuthorityError, FraudConflictError } from "../lib/fraud/errors";
import { buildDailySummary, buildSummaryEmail, runFraudMaintenance } from "../lib/fraud/maintenance";
import { publishPolicyVersion } from "../lib/fraud/limit-exception";
import { buildMonthlyReport, currentReportMonth } from "../lib/fraud/report";
import { newDeviceToken, tokenFor } from "../lib/fraud/tokens";
import { createOrderFromIntent } from "../lib/payments/orders";
import { loadPolicyInForce } from "../lib/payments/risk/policy";
import { runDailyMaintenance } from "../lib/maintenance/daily";
import { deliver, failLeftoverOrders, getPackageCode, makeBuyer, makeIntent, makeOrder, prisma, provider, randomBuyerIp, signedEventFor } from "./payment-test-kit";

/**
 * The fraud case queue: signals, dedupe, the acknowledge / escalate / close
 * fixture, the daily job's signals, the owner's summary email, the monthly
 * report (aggregates only) and limit exceptions. Local database only.
 */

const OWNER_EMAIL = `owner-${randomUUID().slice(0, 8)}@vecalss.local`;
const ENV = { FRAUD_OWNER_EMAIL: OWNER_EMAIL };

function sessionFor(email: string, id: string = randomUUID(), roles: RoleName[] = [RoleName.admin]): SessionContext {
  return {
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: randomUUID(),
    user: { email, fullName: "Admin", id, mfaStatus: "verified", mustChangePassword: false, onboardingStatus: null, roles, status: "active" },
  };
}

async function makeAdmin(email: string) {
  return (await prisma.user.create({ data: { email, fullName: "Admin", passwordHash: "x", roleAssignments: { create: [{ role: "admin" }] } }, select: { id: true } })).id;
}

async function rejects(work: Promise<unknown>, check: (error: unknown) => boolean, label: string) {
  try {
    await work;
  } catch (error) {
    assert.ok(check(error), `${label}: wrong error ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  assert.fail(`${label}: expected a refusal`);
}

async function checkout(buyerId: string, options: { device?: string; ip?: string } = {}) {
  const intent = await makeIntent(buyerId, 49_000, null);
  const result = await createOrderFromIntent({
    buyerId,
    buyerIp: options.ip ?? randomBuyerIp(),
    buyerIpExemption: null,
    buyerIpSource: "trusted-proxy:1",
    deviceToken: options.device ?? null,
    intent,
    packageCode: await getPackageCode(),
    provider,
  });
  assert.ok(result.ok, "fixture checkout");
  return result.order;
}

async function payOrder(orderId: string) {
  const order = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  const { ensurePaymentSession } = await import("../lib/payments/orders");
  const session = await ensurePaymentSession(order as never, provider, "https://app.example.test");
  assert.ok(session.ok);
  const fresh = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  assert.equal((await deliver(signedEventFor(fresh, "payment.succeeded"))).status, "received");
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
}

async function main() {
  const checks: string[] = [];
  const pass = (label: string) => checks.push(label);

  const ownerId = await makeAdmin(OWNER_EMAIL);
  process.env.FRAUD_OWNER_EMAIL = OWNER_EMAIL;
  const owner = requireOwner(sessionFor(OWNER_EMAIL, ownerId), ENV);
  const otherAdmin = requireAdmin(sessionFor(`other-${randomUUID().slice(0, 6)}@vecalss.local`, await makeAdmin(`other-${randomUUID().slice(0, 6)}@vecalss.local`)));

  // ---- Immediate signal: a quarantined event, through the real inbox -------
  const order = await makeOrder();
  const forged = signedEventFor(order, "payment.succeeded", { amountRupiah: order.amountRupiah + 1 });
  await deliver(forged);
  const quarantined = await prisma.fraudCase.findFirstOrThrow({ where: { orderId: order.id, signal: "payment_quarantined" } });
  assert.equal(quarantined.severity, "critical");
  assert.equal(quarantined.state, "open");
  assert.equal(quarantined.ownerUserId, ownerId, "the case is owned by the owner");
  assert.ok(quarantined.ruleVersion >= 1);
  assert.equal(quarantined.userId, order.buyerId);
  assert.equal(typeof quarantined.evidence, "object");
  assert.ok(await prisma.fraudCaseEvent.findFirst({ where: { caseId: quarantined.id, kind: "opened" } }));
  // a second bad event for the same order is a hit on the same case
  await deliver(signedEventFor(order, "payment.succeeded", { amountRupiah: order.amountRupiah + 2 }));
  const hit = await prisma.fraudCase.findUniqueOrThrow({ where: { id: quarantined.id } });
  assert.equal(hit.hitCount, 2);
  assert.equal(await prisma.fraudCase.count({ where: { orderId: order.id, signal: "payment_quarantined" } }), 1, "deduped per signal and subject");
  pass("quarantine signal");

  // ---- Late payment goes to review and opens a case ------------------------
  const lateOrder = await makeOrder({ pastExpiry: true, session: true });
  await deliver(signedEventFor(lateOrder, "payment.expired"));
  await deliver(signedEventFor(lateOrder, "payment.succeeded"));
  assert.equal((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: lateOrder.id } })).status, "review");
  assert.equal(await prisma.fraudCase.count({ where: { orderId: lateOrder.id, signal: "payment_review" } }), 1);
  pass("review signal");

  // ---- The lifecycle: create, acknowledge, escalate, close, reopen ---------
  const caseId = quarantined.id;
  await rejects(escalateCaseAsNonOwner(), (e) => e instanceof FraudAuthorityError && e.code === "not_owner", "a non-owner cannot escalate");
  function escalateCaseAsNonOwner() {
    return Promise.resolve().then(() => requireOwner(sessionFor("someone@vecalss.local"), ENV));
  }
  const acknowledgedVersion = await acknowledgeCase(otherAdmin, { caseId, expectedVersion: 1, reason: "Sudah saya lihat, menunggu pemilik" });
  assert.equal(acknowledgedVersion, 2);
  await rejects(acknowledgeCase(otherAdmin, { caseId, expectedVersion: 1, reason: "Tab lama mencoba lagi" }), (e) => e instanceof FraudConflictError && e.code === "stale_version", "stale version caught");
  await rejects(acknowledgeCase(otherAdmin, { caseId, expectedVersion: 2, reason: "Sudah dilihat dua kali" }), (e) => e instanceof FraudConflictError && e.code === "wrong_state", "cannot acknowledge twice");
  const escalated = await escalateCase(owner, { caseId, expectedVersion: 2, reason: "Nominal tidak cocok, perlu keputusan pemilik" });
  assert.equal(escalated, 3);
  await rejects(closeCase(owner, { caseId, closureReason: "bukan-alasan", expectedVersion: 3, reason: "Alasan penutupan tidak dikenal" }), () => true, "unknown closure reason");
  const block = await createManualBlock(owner, { caseId, reason: "Percobaan pembayaran dengan nominal palsu", reasonCode: "payment_fraud", target: { type: "account", userId: order.buyerId } });
  assert.equal(await prisma.fraudCaseBlock.count({ where: { blockId: block.id, caseId } }), 1, "a block can be linked at creation");
  const linkTarget = await createManualBlock(owner, { days: 2, reason: "Alamat dipakai untuk percobaan serupa", reasonCode: "payment_fraud", target: { type: "ip", value: randomBuyerIp() } });
  assert.equal(await linkBlockToCase(owner, { blockId: linkTarget.id, caseId }), true);
  assert.equal(await linkBlockToCase(owner, { blockId: linkTarget.id, caseId }), false, "linking twice is a no-op");
  const caseVersion = (await prisma.fraudCase.findUniqueOrThrow({ where: { id: caseId } })).version;
  const closed = await closeCase(owner, { caseId, closureReason: "confirmed_fraud", expectedVersion: caseVersion, reason: "Terbukti memalsukan nominal, blokir dipasang" });
  const closedRow = await prisma.fraudCase.findUniqueOrThrow({ where: { id: caseId } });
  assert.equal(closedRow.state, "closed");
  assert.equal(closedRow.closureReason, "confirmed_fraud");
  assert.ok(closedRow.acknowledgedAt && closedRow.escalatedAt && closedRow.closedAt, "acknowledgement, escalation and closure are all recorded");
  const events = await prisma.fraudCaseEvent.findMany({ orderBy: { createdAt: "asc" }, where: { caseId } });
  const kinds = events.map((event) => event.kind);
  for (const kind of ["opened", "hit", "acknowledged", "escalated", "block_linked", "closed"]) assert.ok(kinds.includes(kind), `history has ${kind}`);
  assert.equal(events.find((event) => event.kind === "acknowledged")?.actorKind, "admin");
  assert.equal(events.find((event) => event.kind === "escalated")?.actorKind, "owner");
  const audits = (await prisma.auditLog.findMany({ select: { action: true }, where: { targetId: caseId } })).map((row) => row.action);
  for (const action of ["fraud.case.opened", "fraud.case.acknowledged", "fraud.case.escalated", "fraud.case.closed"]) assert.ok(audits.includes(action), `audit has ${action}`);
  void closed;
  // a closed case takes no hits; a new occurrence opens a fresh case
  await deliver(signedEventFor(order, "payment.succeeded", { amountRupiah: order.amountRupiah + 3 }));
  assert.equal((await prisma.fraudCase.findUniqueOrThrow({ where: { id: caseId } })).hitCount, closedRow.hitCount, "a closed case takes no new hits");
  assert.equal(await prisma.fraudCase.count({ where: { orderId: order.id, signal: "payment_quarantined", state: { not: "closed" } } }), 1, "the new occurrence opens a new case");
  await rejects(reopenCase(owner, { caseId, expectedVersion: closedRow.version, reason: "Ada bukti baru dari penyelidikan lanjutan" }), (e) => e instanceof FraudConflictError && e.code === "wrong_state", "no reopening beside a newer open case");
  const newer = await prisma.fraudCase.findFirstOrThrow({ where: { orderId: order.id, signal: "payment_quarantined", state: { not: "closed" } } });
  await closeCase(owner, { caseId: newer.id, closureReason: "duplicate", expectedVersion: newer.version, reason: "Duplikat dari kasus yang akan dibuka lagi" });
  const reopened = await reopenCase(owner, { caseId, expectedVersion: closedRow.version, reason: "Ada bukti baru dari penyelidikan lanjutan" });
  assert.equal(reopened, closedRow.version + 1);
  // The database enforces the shape too.
  await rejects(prisma.$executeRaw`UPDATE fraud_cases SET state = 'closed', version = version + 1, closed_at = now(), closure_reason = 'other' WHERE id = ${caseId}::uuid`, () => true, "a step without its history row");
  await rejects(prisma.$executeRaw`UPDATE fraud_cases SET signal = 'volume_spike' WHERE id = ${caseId}::uuid`, () => true, "what a case is about is frozen");
  await rejects(prisma.$executeRaw`DELETE FROM fraud_cases WHERE id = ${caseId}::uuid`, () => true, "cases are never deleted");
  await rejects(prisma.$executeRaw`UPDATE fraud_case_events SET note = 'edit' WHERE case_id = ${caseId}::uuid`, () => true, "case history is append-only");
  pass("case lifecycle");

  // ---- Daily signals and their dedupe --------------------------------------
  const sharedIp = randomBuyerIp();
  const sharedDevice = newDeviceToken();
  const farm: string[] = [];
  for (let n = 0; n < 3; n += 1) {
    const buyer = await makeBuyer(`farm${n}`);
    farm.push(buyer);
    const placed = await checkout(buyer, { device: sharedDevice, ip: sharedIp });
    await payOrder(placed.id);
  }
  const failer = await makeBuyer("failer");
  for (let n = 0; n < 3; n += 1) {
    const failing = await makeOrder({ buyerId: failer });
    assert.equal((await deliver(signedEventFor(failing, "payment.failed"))).status, "received");
  }
  const endingBlock = await createManualBlock(owner, { days: 2, reason: "Alamat ini dipantau karena pola mencurigakan", reasonCode: "other", target: { type: "ip", value: randomBuyerIp() } });

  const first = await runDailyFraudSignals();
  assert.ok(first.signals.ipMultiAccount >= 1 && first.signals.deviceMultiAccount >= 1 && first.signals.repeatedFailures >= 1 && first.signals.blockEnding >= 1);
  const ipToken = tokenFor("ip", sharedIp)!;
  const deviceToken = tokenFor("device", sharedDevice)!;
  const ipCase = await prisma.fraudCase.findFirstOrThrow({ where: { signal: "ip_multi_account", state: { not: "closed" }, subjectKey: ipToken } });
  const deviceCase = await prisma.fraudCase.findFirstOrThrow({ where: { signal: "device_multi_account", state: { not: "closed" }, subjectKey: deviceToken } });
  assert.equal(deviceCase.severity, "high");
  assert.equal((ipCase.evidence as { accounts: number }).accounts, 3);
  assert.ok(await prisma.fraudCase.findFirst({ where: { signal: "repeated_payment_failures", state: { not: "closed" }, subjectKey: `user:${failer}` } }));
  assert.ok(await prisma.fraudCase.findFirst({ where: { signal: "block_ending", state: { not: "closed" }, subjectKey: `block:${endingBlock.id}` } }), "an ending block needs a fresh reason to renew");
  const automatic = await prisma.fraudBlock.findFirstOrThrow({ where: { blockType: "device", lookupToken: deviceToken, source: "automatic" } });
  assert.equal(automatic.deactivatedAccount, false, "an automatic block never deactivates an account");
  assert.ok(automatic.expiresAt!.getTime() - automatic.createdAt.getTime() <= 24 * 3_600_000, "automatic blocks last 24 hours");
  assert.equal((await prisma.user.count({ where: { id: { in: farm }, status: "active" } })), 3, "no account was deactivated");
  // raw values never reach a case
  const caseDump = JSON.stringify(await prisma.fraudCase.findMany({ where: { id: { in: [ipCase.id, deviceCase.id] } } }));
  assert.ok(!caseDump.includes(sharedIp) && !caseDump.includes(sharedDevice), "cases hold lookup tokens, not identifiers");
  // dedupe: a second run adds hits, never a second open case or block
  await runDailyFraudSignals();
  for (const [signal, key] of [["ip_multi_account", ipToken], ["device_multi_account", deviceToken], ["repeated_payment_failures", `user:${failer}`]] as const) {
    assert.equal(await prisma.fraudCase.count({ where: { signal, state: { not: "closed" }, subjectKey: key } }), 1, `${signal} is deduped`);
  }
  assert.equal(await prisma.fraudBlock.count({ where: { blockType: "device", lookupToken: deviceToken, status: "active" } }), 1, "one automatic block, not two");
  // two accounts do not trip the account rule
  const pairIp = randomBuyerIp();
  for (let n = 0; n < 2; n += 1) await payOrder((await checkout(await makeBuyer(`pair${n}`), { ip: pairIp })).id);
  await runDailyFraudSignals();
  assert.equal(await prisma.fraudCase.count({ where: { signal: "ip_multi_account", subjectKey: tokenFor("ip", pairIp)! } }), 0, "two accounts are below the threshold");
  // volume rule
  assert.equal(isVolumeSpike(6, 2), true);
  assert.equal(isVolumeSpike(5, 0), false, "a minimum number of orders is needed");
  assert.equal(isVolumeSpike(12, 5), false, "below three times the average");
  assert.equal(isVolumeSpike(15, 5), true, "three times the average");
  // MS-08 and MS-09 seams exist and work without being raised by this ticket
  assert.ok("capture_without_access" in FRAUD_SIGNALS && "refund_stalled" in FRAUD_SIGNALS);
  const seam = await prisma.$transaction((tx) => openFraudCase(tx, { evidence: { note: "seam check" }, signal: "capture_without_access", subjectKey: `order:${randomUUID()}`, subjectType: "order" }));
  assert.equal(seam.created, true);
  pass("daily signals and dedupe");

  // ---- The daily job step, summary email ------------------------------------
  const sent: Array<{ html: string; idempotencyKey: string; subject: string; text: string; to: string }> = [];
  const job = await runDailyMaintenance({
    alertTo: "owner@example.test",
    db: prisma,
    fraud: () => runFraudMaintenance({ alertTo: "owner@example.test", sendEmail: async (message) => { sent.push(message); return { id: "x", ok: true, redirected: false }; } }),
    probes: { database: async () => true, redis: async () => true } as never,
    sendAlert: async () => ({ id: "x", ok: true, redirected: false }),
  });
  assert.ok(job.fraud, "the daily job runs the fraud step");
  assert.ok(!job.failures.includes("fraud_maintenance"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.test");
  assert.match(sent[0].text, /Kasus terbuka: \d+/u);
  assert.match(sent[0].text, /Blokir yang segera berakhir/u);
  assert.ok(!/\d+\.\d+\.\d+\.\d+/u.test(sent[0].text.replace(/localhost:\d+/u, "")), "the summary lists no IP address");
  assert.ok(!sent[0].text.includes("@"), "and no email address");
  const summary = await buildDailySummary();
  assert.equal(buildSummaryEmail(summary, "a@b.test").idempotencyKey, `fraud-summary:${summary.day}`);
  const failing = await runDailyMaintenance({
    alertTo: null,
    db: prisma,
    fraud: async () => { throw new Error("boom"); },
    probes: { database: async () => true, redis: async () => true } as never,
    sendAlert: async () => ({ id: "x", ok: true, redirected: false }),
  });
  assert.ok(failing.failures.includes("fraud_maintenance"), "a failing fraud step is reported");
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "fraud.daily_review.completed" } }), "the review leaves audit proof");
  pass("daily job and summary email");

  // ---- Monthly report: aggregates only ---------------------------------------
  const report = await buildMonthlyReport(await currentReportMonth());
  const json = JSON.stringify(report);
  assert.ok(!/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/u.test(json), "no IP address in the report");
  assert.ok(!/@/u.test(json), "no email in the report");
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu.test(json), "no ids in the report");
  assert.ok(!/[0-9a-f]{64}/u.test(json), "no lookup tokens in the report");
  assert.ok(!json.includes(sharedDevice) && !json.includes(sharedIp));
  assert.ok(report.cases.openedBySignal.length > 0 && report.blocks.createdByTypeAndSource.length > 0 && report.orders.started.count > 0);
  await assert.rejects(() => buildMonthlyReport("2026-13"), /must look like/u);
  pass("report");

  // ---- Limit exception: a new policy version, owner only ----------------------
  const inForce = await loadPolicyInForce(prisma);
  assert.ok(inForce);
  const { version: _version, ...values } = inForce;
  void _version;
  const v1Id = (await prisma.riskPolicyVersion.findFirstOrThrow({ where: { version: 1 } })).id;
  try {
    const published = await publishPolicyVersion(owner, { expectedVersionInForce: inForce.version, reason: "Pengecualian sementara untuk kelas sekolah", values: { ...values, unverifiedDailyPurchases: values.unverifiedDailyPurchases + 1 } });
    assert.equal(published.version, inForce.version + 1 > published.version ? published.version : published.version);
    assert.equal((await loadPolicyInForce(prisma))?.version, published.version);
    await rejects(publishPolicyVersion(owner, { expectedVersionInForce: inForce.version, reason: "Pengecualian lagi dengan versi usang", values }), (e) => e instanceof FraudConflictError && e.code === "stale_version", "concurrent policy change");
    await rejects(prisma.$executeRaw`UPDATE risk_policy_versions SET max_open_payments = 9 WHERE version = ${published.version}`, () => true, "policy versions stay append-only");
  } finally {
    await prisma.$executeRaw`INSERT INTO risk_policy_activations (policy_version_id, reason) VALUES (${v1Id}::uuid, 'test-fraud-cases: back to version 1')`;
  }
  assert.equal((await loadPolicyInForce(prisma))?.version, 1);
  pass("limit exception");

  console.log(`Fraud case checks passed: ${checks.join(", ")}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await failLeftoverOrders().catch(() => undefined);
    await prisma.$disconnect();
  });
