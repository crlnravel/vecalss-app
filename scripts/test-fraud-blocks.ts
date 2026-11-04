import assert from "node:assert/strict";
import { PURCHASE_TERMS } from "../lib/fulfillment/terms";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { RoleName } from "../generated/prisma/client";
import type { SessionContext } from "../lib/auth/types";
import { requireAdmin, requireOwner, describeAuthority } from "../lib/fraud/authority";
import { checkBlocks, createManualBlock, liftBlock, markLapsedBlocksExpired, renewBlock } from "../lib/fraud/blocks";
import { FraudAuthorityError, FraudConflictError, FraudValidationError } from "../lib/fraud/errors";
import { buildDeviceSetCookie, readDeviceTokenFromHeader } from "../lib/fraud/device";
import { fileAppeal, decideAppeal, reopenAppeal, addWorkingDays } from "../lib/fraud/appeals";
import { getLookupSecret, isLookupSecretAvailable, newDeviceToken, tokenFor } from "../lib/fraud/tokens";
import { createOrderFromIntent } from "../lib/payments/orders";
import { handleCheckoutPayPost, type CheckoutPayDeps } from "../lib/pricing/checkout-pay";
import { deliver, failLeftoverOrders, getPackageCode, makeBuyer, makeIntent, prisma, provider, randomBuyerIp, signedEventFor, APP_ORIGIN } from "./payment-test-kit";

/**
 * Commerce behavior test 5 (MS-07 phase A): fraud blocks. Typed blocks under
 * HMAC lookup tokens; owner-only authority; expiry at read time; concurrent
 * changes; the checkout, signup and paid-order checks; and the shared-IP false
 * positive. Runs on the local database only (payment-test-kit refuses the rest).
 */

const OWNER_EMAIL = `owner-${randomUUID().slice(0, 8)}@vecalss.local`;
const ENV = { FRAUD_OWNER_EMAIL: OWNER_EMAIL };

function sessionFor(email: string, options: { mfa?: "verified" | "challenge"; roles?: RoleName[] } = {}): SessionContext {
  return {
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: `session-${randomUUID()}`,
    user: {
      email,
      fullName: "Test admin",
      id: randomUUID(),
      mfaStatus: options.mfa ?? "verified",
      mustChangePassword: false,
      onboardingStatus: null,
      roles: options.roles ?? [RoleName.admin],
      status: "active",
    },
  };
}

async function makeAdminUser(email: string) {
  const user = await prisma.user.create({
    data: { email, fullName: "Owner", passwordHash: "not-a-real-hash", roleAssignments: { create: [{ role: "admin" }] } },
    select: { id: true },
  });
  return user.id;
}

async function ownerContext() {
  const ownerId = await makeAdminUser(OWNER_EMAIL);
  const session = sessionFor(OWNER_EMAIL);
  session.user.id = ownerId;
  return requireOwner(session, ENV);
}

async function makeStudent(label: string, extra: { email?: string; phone?: string } = {}) {
  const id = await makeBuyer(label);
  if (extra.phone) await prisma.user.update({ data: { phone: extra.phone }, where: { id } });
  if (extra.email) await prisma.user.update({ data: { email: extra.email }, where: { id } });
  return id;
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`;

async function checkout(buyerId: string, options: { device?: string | null; ip?: string | null } = {}) {
  const intent = await makeIntent(buyerId, 49_000, null);
  const ip = options.ip === undefined ? randomBuyerIp() : options.ip;
  return createOrderFromIntent({
    buyerId,
    buyerIp: ip,
    buyerIpExemption: null,
    buyerIpSource: "trusted-proxy:1",
    deviceToken: options.device ?? null,
    intent,
    packageCode: await getPackageCode(),
    provider,
  });
}

async function footprint(buyerId: string) {
  const orders = await prisma.paymentOrder.findMany({ select: { id: true, reference: true }, where: { buyerId } });
  const [reservations, sessions] = await Promise.all([
    prisma.riskReservation.count({ where: { userId: buyerId } }),
    prisma.standInPayment.count({ where: { reference: { in: orders.map((order) => order.reference) } } }),
  ]);
  return { orders: orders.length, reservations, sessions };
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

const authorityIs = (code: string) => (error: unknown) => error instanceof FraudAuthorityError && error.code === code;

async function main() {
  const owner = await ownerContext();
  const school = randomBuyerIp();
  const checks: string[] = [];
  const pass = (label: string) => checks.push(label);

  // ---- Authority --------------------------------------------------------
  assert.throws(() => requireOwner(sessionFor("someone.else@vecalss.local"), ENV), authorityIs("not_owner"));
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL), {}), authorityIs("owner_unset"), "owner unset fails closed");
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL), { FRAUD_OWNER_EMAIL: "   " }), authorityIs("owner_unset"));
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL, { mfa: "challenge" }), ENV), authorityIs("mfa_required"), "an unverified session is refused");
  assert.throws(() => requireAdmin(sessionFor(OWNER_EMAIL, { mfa: "challenge" })), authorityIs("mfa_required"));
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL, { roles: [RoleName.student] }), ENV), authorityIs("not_admin"));
  assert.throws(() => requireAdmin(null), authorityIs("unauthenticated"));
  assert.equal(requireAdmin(sessionFor("someone.else@vecalss.local")).email, "someone.else@vecalss.local", "any verified admin may view and acknowledge");
  assert.deepEqual(describeAuthority(sessionFor("x@vecalss.local"), ENV), { isOwner: false, ownerConfigured: true });
  assert.deepEqual(describeAuthority(sessionFor(OWNER_EMAIL), {}), { isOwner: false, ownerConfigured: false });
  assert.deepEqual(describeAuthority(sessionFor(OWNER_EMAIL), ENV), { isOwner: true, ownerConfigured: true });

  // The server actions: every owner mutation goes through runOwner, admin-only ones through runAdmin.
  const actions = readFileSync("modules/admin/fraud-actions.ts", "utf8");
  const ownerActions = ["escalateCase", "closeCase", "reopenCase", "linkBlock", "createBlock", "liftBlock", "renewBlock", "fileAppeal", "decideAppeal", "reopenAppeal"];
  for (const name of ownerActions) {
    const body = actions.slice(actions.indexOf(`async function ${name}Action`));
    assert.match(body.slice(0, body.indexOf("\n}\n")), /runOwner\(/u, `${name}Action must require the owner`);
  }
  const ack = actions.slice(actions.indexOf("async function acknowledgeCaseAction"));
  assert.match(ack.slice(0, ack.indexOf("\n}\n")), /runAdmin\(/u);
  assert.match(actions, /requireAdminSession\(\)/u, "actions re-authenticate with a verified admin session");
  pass("authority");

  // ---- Lookup tokens hide the values -------------------------------------
  const rawEmail = `hidden-${unique()}@example.test`;
  const phoneTail = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
  const rawPhone = `0812${phoneTail}`;
  const rawIp = randomBuyerIp();
  const rawDevice = newDeviceToken();
  const victim = await makeStudent("victim", { email: rawEmail, phone: rawPhone });
  await prisma.authSession.create({ data: { expiresAt: new Date(Date.now() + 3_600_000), refreshTokenHash: randomUUID(), userId: victim } });
  const created = [
    await createManualBlock(owner, { reason: "Dugaan penipuan pembayaran berulang", reasonCode: "payment_fraud", target: { type: "phone", value: rawPhone } }),
    await createManualBlock(owner, { days: 7, reason: "Dugaan penipuan pembayaran berulang", reasonCode: "payment_fraud", target: { type: "ip", value: rawIp } }),
    await createManualBlock(owner, { days: 30, reason: "Dugaan penipuan pembayaran berulang", reasonCode: "payment_fraud", target: { type: "device", value: rawDevice } }),
    await createManualBlock(owner, { reason: "Dugaan penipuan pembayaran berulang", reasonCode: "payment_fraud", target: { type: "email", value: rawEmail } }),
  ];
  const ids = created.flatMap((block) => [block.id, block.linkedAccountBlockId]).filter((id): id is string => id !== null);
  const dump = JSON.stringify([
    await prisma.$queryRaw`SELECT fb::text AS row FROM fraud_blocks fb WHERE id = ANY(${ids}::uuid[])`,
    await prisma.$queryRaw`SELECT fe::text AS row FROM fraud_block_events fe WHERE block_id = ANY(${ids}::uuid[])`,
    await prisma.$queryRaw`SELECT metadata::text AS row FROM audit_logs WHERE target_id = ANY(${ids}::uuid[])`,
  ]);
  for (const raw of [rawEmail, rawPhone, rawIp, rawDevice, `62812${phoneTail}`, rawEmail.split("@")[0]]) {
    assert.ok(!dump.includes(raw), `a block, its history or its audit event leaked ${raw.slice(0, 6)}…`);
  }
  const stored = await prisma.$queryRaw<Array<{ token: string; type: string }>>`
    SELECT lookup_token AS token, block_type::text AS type FROM fraud_blocks WHERE id = ANY(${ids}::uuid[]) ORDER BY block_type`;
  assert.ok(stored.every((row) => /^[0-9a-f]{64}$/u.test(row.token) || /^[0-9a-f-]{36}$/u.test(row.token)));
  assert.equal(stored.find((row) => row.type === "email")?.token, tokenFor("email", rawEmail.toUpperCase()), "email tokens ignore case");
  assert.equal(tokenFor("phone", "+62 812-3456-0000"), tokenFor("phone", "0812 3456 0000"), "phone tokens ignore formatting");
  assert.equal(tokenFor("ip", "::ffff:10.1.2.3"), tokenFor("ip", "10.1.2.3"), "mapped IPv6 equals IPv4");
  assert.equal(tokenFor("email", "not-an-email"), null);
  assert.equal(tokenFor("device", "short"), null);
  assert.notEqual(tokenFor("email", "a@b.co"), tokenFor("phone", "a@b.co"), "token types do not collide");
  // the database refuses a readable value as a token
  await rejects(prisma.$executeRaw`
    INSERT INTO fraud_blocks (block_type, lookup_token, hint, source, reason_code, reason_note, expires_at)
    VALUES ('ip', '10.0.0.1', 'x', 'manual', 'other', 'a long enough reason', now() + interval '1 day')`, () => true, "a raw IP as a token");
  pass("tokens hide values");

  // ---- Production fails closed without the secret ------------------------
  assert.throws(() => getLookupSecret({ NODE_ENV: "production" }), /FRAUD_LOOKUP_SECRET is required/u);
  assert.throws(() => getLookupSecret({ FRAUD_LOOKUP_SECRET: "short", NODE_ENV: "production" }), /at least 32/u);
  assert.equal(isLookupSecretAvailable({ NODE_ENV: "production" }), false);
  assert.equal(isLookupSecretAvailable({ FRAUD_LOOKUP_SECRET: "x".repeat(40), NODE_ENV: "production" }), true);
  assert.notEqual(
    tokenFor("email", "a@b.co", { FRAUD_LOOKUP_SECRET: "a".repeat(40) }),
    tokenFor("email", "a@b.co", { FRAUD_LOOKUP_SECRET: "b".repeat(40) }),
    "another secret yields other tokens",
  );
  const before = process.env.NODE_ENV;
  const failClosedBuyer = await makeStudent("closed");
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  const delete_ = process.env.FRAUD_LOOKUP_SECRET;
  delete process.env.FRAUD_LOOKUP_SECRET;
  try {
    assert.deepEqual(await checkout(failClosedBuyer), { ok: false, reason: "blocks_unavailable" }, "checkout refuses when blocks cannot be read");
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = before;
    if (delete_ !== undefined) process.env.FRAUD_LOOKUP_SECRET = delete_;
  }
  assert.deepEqual(await footprint(failClosedBuyer), { orders: 0, reservations: 0, sessions: 0 });
  pass("production fails closed");

  // ---- Lengths, by type ---------------------------------------------------
  const lengths = await prisma.$queryRaw<Array<{ days: number | null; review: number | null; type: string }>>`
    SELECT block_type::text AS type,
           round(extract(epoch FROM expires_at - created_at) / 86400)::int AS days,
           round(extract(epoch FROM review_due_at - created_at) / 86400)::int AS review
    FROM fraud_blocks WHERE id = ANY(${ids}::uuid[])`;
  const byType = Object.fromEntries(lengths.map((row) => [row.type, row]));
  assert.equal(byType.ip.days, 7);
  assert.equal(byType.device.days, 30);
  assert.deepEqual([byType.phone.days, byType.phone.review], [null, 30], "phone: until lifted, reviewed in 30 days");
  assert.deepEqual([byType.email.days, byType.email.review], [null, 30]);
  assert.equal(byType.account.days, null, "an email block on an existing account adds an account block");
  await rejects(createManualBlock(owner, { days: 8, reason: "Dugaan penipuan pembayaran berulang", reasonCode: "other", target: { type: "ip", value: randomBuyerIp() } }), (e) => e instanceof FraudValidationError && e.code === "invalid_duration", "IP block over 7 days");
  await rejects(createManualBlock(owner, { days: 31, reason: "Dugaan penipuan pembayaran berulang", reasonCode: "other", target: { type: "device", value: newDeviceToken() } }), (e) => e instanceof FraudValidationError && e.code === "invalid_duration", "device block over 30 days");
  await rejects(createManualBlock(owner, { reason: "pendek", reasonCode: "other", target: { type: "ip", value: randomBuyerIp() } }), (e) => e instanceof FraudValidationError && e.code === "invalid_reason", "a reason is mandatory");
  await rejects(prisma.$executeRaw`
    INSERT INTO fraud_blocks (block_type, lookup_token, hint, source, reason_code, reason_note, expires_at)
    VALUES ('ip', ${"a".repeat(64)}, 'x', 'manual', 'other', 'a long enough reason', now() + interval '8 days')`, () => true, "the database refuses a long IP block");
  await rejects(prisma.$executeRaw`
    INSERT INTO fraud_blocks (block_type, lookup_token, hint, source, reason_code, reason_note, expires_at)
    VALUES ('email', ${"b".repeat(64)}, 'x', 'automatic', 'other', 'a long enough reason', now() + interval '3 days')`, () => true, "the database refuses a long automatic block");
  await rejects(prisma.$executeRaw`
    INSERT INTO fraud_blocks (block_type, lookup_token, hint, source, reason_code, reason_note, expires_at)
    VALUES ('email', ${"c".repeat(64)}, 'x', 'manual', 'other', 'a long enough reason', now() + interval '3 days')`, () => true, "a manual email block lasts until lifted");
  pass("lengths");

  // ---- An email block treats the existing account as blocked -------------
  const victimAfter = await prisma.user.findUniqueOrThrow({ select: { status: true }, where: { id: victim } });
  assert.equal(victimAfter.status, "disabled", "the account behind a blocked email is deactivated");
  assert.equal(await prisma.authSession.count({ where: { status: "active", userId: victim } }), 0, "and its sessions are revoked");
  // revoke path: block a second account with a live session
  const second = await makeStudent("second");
  await prisma.authSession.create({ data: { expiresAt: new Date(Date.now() + 3_600_000), refreshTokenHash: randomUUID(), userId: second } });
  const secondBlock = await createManualBlock(owner, { reason: "Dugaan penyalahgunaan akun berulang", reasonCode: "account_abuse", target: { type: "account", userId: second } });
  assert.equal(await prisma.authSession.count({ where: { status: "active", userId: second } }), 0, "an account block revokes sessions");
  assert.equal((await prisma.user.findUniqueOrThrow({ select: { status: true }, where: { id: second } })).status, "disabled");
  const lifted = await liftBlock(owner, { blockId: secondBlock.id, expectedVersion: 1, reason: "Setelah diperiksa, ini salah deteksi" });
  assert.equal(lifted.reactivated, true);
  assert.equal((await prisma.user.findUniqueOrThrow({ select: { status: true }, where: { id: second } })).status, "active", "lifting gives the account back");
  const auditActions = (await prisma.auditLog.findMany({ select: { action: true }, where: { targetId: secondBlock.id } })).map((row) => row.action).sort();
  assert.deepEqual(auditActions, ["fraud.block.created", "fraud.block.lifted"]);
  const history = await prisma.$queryRaw<Array<{ kind: string }>>`SELECT kind FROM fraud_block_events WHERE block_id = ${secondBlock.id}::uuid ORDER BY block_version`;
  assert.deepEqual(history.map((row) => row.kind), ["created", "lifted"], "every change writes a history row");
  // protected accounts
  await rejects(createManualBlock(owner, { reason: "Dugaan penyalahgunaan akun berulang", reasonCode: "other", target: { type: "account", userId: owner.userId } }), (e) => e instanceof FraudValidationError && e.code === "protected_account", "admin accounts cannot be blocked");
  pass("account block and lift");

  // ---- Expiry at read time, with no cron ---------------------------------
  const lapsedIp = randomBuyerIp();
  const lapsedToken = tokenFor("ip", lapsedIp)!;
  await prisma.$executeRaw`
    INSERT INTO fraud_blocks (block_type, lookup_token, hint, source, reason_code, reason_note, expires_at)
    VALUES ('ip', ${lapsedToken}, 'lapsed', 'manual', 'other', 'fixture: a block that has already lapsed', now() - interval '1 minute')`;
  const readerBuyer = await makeStudent("lapsed");
  const lapsedCheck = await prisma.$transaction((tx) => checkBlocks(tx, { ip: lapsedIp }));
  assert.equal(lapsedCheck.blocked, false, "a block past its end date stops counting at once");
  const lapsedOrder = await checkout(readerBuyer, { ip: lapsedIp });
  assert.ok(lapsedOrder.ok, "checkout from a lapsed IP block goes through, no job having run");
  const lapsedStatus = await prisma.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM fraud_blocks WHERE lookup_token = ${lapsedToken}`;
  assert.equal(lapsedStatus[0].status, "active", "(still marked active: the row was never touched)");
  assert.ok((await markLapsedBlocksExpired()) >= 1);
  assert.equal((await prisma.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM fraud_blocks WHERE lookup_token = ${lapsedToken}`)[0].status, "expired");
  assert.equal(await prisma.fraudBlockEvent.count({ where: { block: { lookupToken: lapsedToken }, kind: "expired" } }), 1, "housekeeping leaves a history row");
  // a lapsed identifier can be blocked again; a live one cannot be blocked twice
  const again = await createManualBlock(owner, { days: 1, reason: "Dipakai lagi untuk percobaan penipuan", reasonCode: "payment_fraud", target: { type: "ip", value: lapsedIp } });
  await rejects(createManualBlock(owner, { days: 1, reason: "Dipakai lagi untuk percobaan penipuan", reasonCode: "payment_fraud", target: { type: "ip", value: lapsedIp } }), (e) => e instanceof FraudConflictError && e.code === "already_blocked", "blocked twice");
  void again;
  pass("expiry at read time");

  // ---- Concurrent changes -------------------------------------------------
  const target = await createManualBlock(owner, { days: 5, reason: "Dugaan penipuan pembayaran berulang", reasonCode: "payment_fraud", target: { type: "ip", value: randomBuyerIp() } });
  const outcomes = await Promise.allSettled([
    liftBlock(owner, { blockId: target.id, expectedVersion: 1, reason: "Dicabut oleh tab pertama setelah diperiksa" }),
    liftBlock(owner, { blockId: target.id, expectedVersion: 1, reason: "Dicabut oleh tab kedua setelah diperiksa" }),
    renewBlock(owner, { blockId: target.id, days: 3, expectedVersion: 1, reason: "Diperpanjang oleh tab ketiga setelah diperiksa" }),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1, "exactly one of three concurrent changes wins");
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      assert.ok(outcome.reason instanceof FraudConflictError, "the others are told the block changed");
    }
  }
  assert.equal(await prisma.fraudBlockEvent.count({ where: { blockId: target.id } }), 2, "one creation and one change");
  await rejects(liftBlock(owner, { blockId: target.id, expectedVersion: 99, reason: "Versi yang salah dan sudah usang" }), (e) => e instanceof FraudConflictError, "stale version");
  // the database itself refuses a change without a history row, and edits to history
  const sample = await createManualBlock(owner, { days: 2, reason: "Dugaan penipuan pembayaran berulang", reasonCode: "payment_fraud", target: { type: "ip", value: randomBuyerIp() } });
  await rejects(prisma.$executeRaw`UPDATE fraud_blocks SET status = 'lifted', version = 2, ended_at = now() WHERE id = ${sample.id}::uuid`, () => true, "a lift without a history row");
  await rejects(prisma.$executeRaw`UPDATE fraud_blocks SET lookup_token = ${"d".repeat(64)} WHERE id = ${sample.id}::uuid`, () => true, "the identifier is frozen");
  await rejects(prisma.$executeRaw`DELETE FROM fraud_blocks WHERE id = ${sample.id}::uuid`, () => true, "blocks are never deleted");
  await rejects(prisma.$executeRaw`UPDATE fraud_block_events SET reason = 'edited reason here' WHERE block_id = ${sample.id}::uuid`, () => true, "history is append-only");
  await rejects(prisma.$executeRaw`DELETE FROM fraud_block_events WHERE block_id = ${sample.id}::uuid`, () => true, "history is never deleted");
  await rejects(prisma.$executeRaw`TRUNCATE fraud_block_events`, () => true, "history is never truncated");
  pass("concurrency and append-only history");

  // ---- Shared-IP false positive and checkout enforcement ------------------
  const students = [];
  for (let n = 0; n < 6; n += 1) students.push(await makeStudent(`school${n}`));
  const [culprit, ...others] = students;
  await createManualBlock(owner, { reason: "Pembeli ini dilaporkan memakai kartu curian", reasonCode: "payment_fraud", target: { type: "account", userId: culprit } });
  const blockedTry = await checkout(culprit, { ip: school });
  assert.deepEqual(blockedTry, { ok: false, reason: "blocked" }, "the blocked buyer is refused");
  assert.deepEqual(await footprint(culprit), { orders: 0, reservations: 0, sessions: 0 }, "a refused attempt leaves nothing payable");
  for (const student of others) {
    const result = await checkout(student, { ip: school });
    assert.ok(result.ok, "a student behind the same school IP is unaffected");
  }
  assert.equal(await prisma.user.count({ where: { id: { in: others }, status: "active" } }), others.length, "no account is deactivated for a shared IP");
  const refusal = await prisma.auditLog.findFirst({ orderBy: { occurredAt: "desc" }, where: { action: "payment.checkout.refused", actorUserId: culprit } });
  assert.equal((refusal?.metadata as { reason?: string }).reason, "blocked", "the refusal is audited");
  const caseRow = await prisma.fraudCase.findFirst({ where: { signal: "blocked_attempt", userId: culprit } });
  assert.ok(caseRow, "a blocked attempt opens a case");
  await checkout(culprit, { ip: school });
  assert.equal(await prisma.fraudCase.count({ where: { signal: "blocked_attempt", userId: culprit } }), 1, "deduped per signal and subject");
  assert.equal((await prisma.fraudCase.findUniqueOrThrow({ where: { id: caseRow.id } })).hitCount, 2);

  // IP block: refuses everyone from that address, and only that address; accounts stay active
  const ipBlocked = randomBuyerIp();
  await createManualBlock(owner, { days: 1, reason: "Serangan pembayaran dari alamat ini", reasonCode: "payment_fraud", target: { type: "ip", value: ipBlocked } });
  const behind = await makeStudent("behind");
  const elsewhere = await makeStudent("elsewhere");
  assert.deepEqual(await checkout(behind, { ip: ipBlocked }), { ok: false, reason: "blocked" });
  assert.ok((await checkout(elsewhere, { ip: randomBuyerIp() })).ok);
  assert.equal((await prisma.user.findUniqueOrThrow({ select: { status: true }, where: { id: behind } })).status, "active", "an IP block never deactivates an account");
  assert.ok((await checkout(behind, { ip: randomBuyerIp() })).ok, "the same student is fine from another address");

  // Device block: only that device
  const badDevice = newDeviceToken();
  await createManualBlock(owner, { days: 5, reason: "Perangkat ini dipakai banyak akun curang", reasonCode: "multi_account", target: { type: "device", value: badDevice } });
  const devA = await makeStudent("devA");
  const devB = await makeStudent("devB");
  assert.deepEqual(await checkout(devA, { device: badDevice }), { ok: false, reason: "blocked" });
  assert.ok((await checkout(devB, { device: newDeviceToken() })).ok, "another device is unaffected");

  // Phone block matches the profile phone
  const phoneBuyer = await makeStudent("phone", { phone: `0856 ${phoneTail.slice(0, 3)} ${phoneTail.slice(3)}` });
  await createManualBlock(owner, { reason: "Nomor ini dipakai untuk penipuan", reasonCode: "payment_fraud", target: { type: "phone", value: `+62 856-${phoneTail.slice(0, 3)}-${phoneTail.slice(3)}` } });
  assert.deepEqual(await checkout(phoneBuyer), { ok: false, reason: "blocked" }, "phone blocks match the profile number");
  pass("checkout enforcement and the shared-IP false positive");

  // ---- The device cookie --------------------------------------------------
  const token = newDeviceToken();
  const setCookie = buildDeviceSetCookie(token, true);
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Secure/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.equal(readDeviceTokenFromHeader(`a=b; vc_device=${token}; c=d`), token);
  assert.equal(readDeviceTokenFromHeader("vc_device=short"), null);
  const deviceBuyer = await makeStudent("cookie");
  const posted = await postThroughHandler(deviceBuyer, {});
  assert.ok(posted.headers.get("set-cookie")?.startsWith("vc_device="), "checkout sets the device cookie when there is none");
  const cookieValue = /vc_device=([^;]+)/u.exec(posted.headers.get("set-cookie") ?? "")![1];
  const order = await prisma.paymentOrder.findFirstOrThrow({ where: { buyerId: deviceBuyer } });
  assert.equal(order.deviceLookupToken, tokenFor("device", cookieValue), "the order records only the HMAC");
  assert.ok(!JSON.stringify(order).includes(cookieValue), "the cookie value is not stored");
  const again2 = await postThroughHandler(await makeStudent("cookie2"), { cookie: `vc_device=${cookieValue}` });
  assert.equal(again2.headers.get("set-cookie"), null, "an existing cookie is kept");
  const crossSite = await postThroughHandler(await makeStudent("cookie3"), { origin: "https://evil.example.test" });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get("set-cookie"), null, "a cross-site request gets no cookie");
  pass("device cookie");

  // ---- A paid order from a since-blocked buyer goes to review -------------
  const payer = await makeStudent("payer");
  const opened = await checkout(payer);
  assert.ok(opened.ok);
  const openOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: opened.order.id } });
  await createManualBlock(owner, { reason: "Pembeli dilaporkan lewat saluran resmi", reasonCode: "payment_fraud", target: { type: "account", userId: payer } });
  // the stand-in needs a session record to know the payment; reuse the helper path
  const { ensurePaymentSession } = await import("../lib/payments/orders");
  const session = await ensurePaymentSession(openOrder as never, provider, APP_ORIGIN);
  assert.ok(session.ok);
  const paidOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: openOrder.id } });
  const delivered = await deliver(signedEventFor(paidOrder, "payment.succeeded"));
  assert.equal(delivered.status, "received");
  const after = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: openOrder.id } });
  assert.equal(after.status, "review", "money that arrived is kept, not refused or accepted");
  assert.equal(after.statusReason, "blocked_buyer");
  assert.equal(after.packagePurchaseId, null, "no purchase, so no access follows");
  assert.equal((await prisma.riskReservation.findUniqueOrThrow({ where: { orderId: openOrder.id } })).state, "review");
  assert.equal(await prisma.fraudCase.count({ where: { orderId: openOrder.id, signal: "payment_review" } }), 1, "a case is opened");
  assert.equal(await prisma.fraudCase.count({ where: { orderId: openOrder.id, signal: "blocked_attempt" } }), 1);
  assert.equal(await prisma.paymentOutbox.count({ where: { kind: "critical_alert", orderId: openOrder.id } }), 1, "the owner is alerted");
  assert.equal((await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: openOrder.id } })).outcome, "review");
  const replay = await deliver(signedEventFor(paidOrder, "payment.succeeded", { eventId: (await prisma.paymentEvent.findFirstOrThrow({ where: { orderId: openOrder.id } })).eventId }));
  assert.equal(replay.status, "received");
  assert.equal(await prisma.fraudCase.count({ where: { orderId: openOrder.id, signal: "payment_review" } }), 1, "a duplicate delivery adds no case");
  pass("paid order from a since-blocked buyer");

  // ---- Appeals -------------------------------------------------------------
  const appealed = await makeStudent("appeal");
  const appealBlock = await createManualBlock(owner, { reason: "Dugaan penyalahgunaan akun berulang", reasonCode: "account_abuse", target: { type: "account", userId: appealed } });
  const filed = await fileAppeal(owner, { blockId: appealBlock.id, channel: "Instagram", expectedBlockVersion: 1, summary: "Pembeli mengaku akunnya dipakai orang lain" });
  await rejects(fileAppeal(owner, { blockId: appealBlock.id, channel: "Instagram", expectedBlockVersion: 1, summary: "Banding kedua untuk blokir yang sama" }), (e) => e instanceof FraudConflictError && e.code === "appeal_exists", "one appeal per block");
  const dueDays = (filed.dueAt.getTime() - Date.now()) / 86_400_000;
  assert.ok(dueDays > 2.9 && dueDays < 5.1, "due in three working days");
  await decideAppeal(owner, { appealId: filed.appealId, decision: "denied", expectedVersion: 1, reason: "Bukti yang diberikan belum cukup" });
  await rejects(decideAppeal(owner, { appealId: filed.appealId, decision: "granted", expectedVersion: 1, reason: "Keputusan kedua dengan versi usang" }), (e) => e instanceof FraudConflictError, "decided once");
  await reopenAppeal(owner, { appealId: filed.appealId, expectedVersion: 2, reason: "Pembeli mengirim bukti baru yang sah" });
  await decideAppeal(owner, { appealId: filed.appealId, decision: "granted", expectedVersion: 3, reason: "Bukti baru menunjukkan akun diretas" });
  const appealBlockRow = await prisma.fraudBlock.findUniqueOrThrow({ where: { id: appealBlock.id } });
  assert.equal(appealBlockRow.status, "lifted", "a granted appeal lifts the block in the same step");
  assert.equal((await prisma.user.findUniqueOrThrow({ select: { status: true }, where: { id: appealed } })).status, "active");
  const trail = (await prisma.fraudCaseEvent.findMany({ orderBy: { createdAt: "asc" }, where: { caseId: filed.caseId } })).map((event) => event.kind);
  for (const kind of ["opened", "appeal_filed", "appeal_decided", "appeal_reopened"]) assert.ok(trail.includes(kind), `the case records ${kind}`);
  // Friday + 3 working days = Wednesday
  const friday = new Date("2026-11-06T03:00:00Z");
  assert.equal(new Date(addWorkingDays(friday, 3).getTime() + 7 * 3_600_000).getUTCDay(), 3);
  pass("appeals");

  console.log(`Fraud block checks passed: ${checks.join(", ")}.`);
}

async function postThroughHandler(buyerId: string, options: { cookie?: string; origin?: string } = {}) {
  const packageCode = await getPackageCode();
  const env = {
    APP_BASE_URL: APP_ORIGIN,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
    PRICING_PACKAGE_CODE_FULL_MANDIRI: packageCode,
    PRICING_PACKAGE_CODE_FULL_UTBK: packageCode,
    PRICING_PACKAGE_CODE_MONTHLY: packageCode,
  } as unknown as NodeJS.ProcessEnv;
  const session: SessionContext = {
    expiresAt: new Date(Date.now() + 3_600_000),
    sessionId: `session-${buyerId}`,
    user: { email: `${buyerId}@example.test`, fullName: "Risk", id: buyerId, mustChangePassword: false, onboardingStatus: null, roles: [RoleName.student], status: "active" },
  };
  const deps: CheckoutPayDeps = { env, getProvider: () => provider, getSession: async () => session, now: () => new Date("2026-11-20T10:00:00+07:00") };
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", origin: options.origin ?? APP_ORIGIN };
  if (options.cookie) headers.cookie = options.cookie;
  return handleCheckoutPayPost(
    new Request(`${APP_ORIGIN}/pricing/checkout/pay`, {
      body: new URLSearchParams({ key: randomUUID(), plan: "monthly", terms: PURCHASE_TERMS.version }).toString(),
      headers,
      method: "POST",
    }),
    deps,
  );
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
