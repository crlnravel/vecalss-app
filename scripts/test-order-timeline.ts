import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { buildOrderTimeline, getOrderTimeline, type OrderTimeline, type TimelineEntry, type TimelineInput } from "../lib/admin/order-timeline";
import { paymentAuditLabel, paymentEventReasonLabel } from "../lib/admin/payment-audit-labels";
import { prisma } from "../lib/prisma";
import { DemoSeedRefusedError, demoSeedRefusals } from "../lib/payments/stand-in/demo-seed-guard";
import { DEMO_SCENARIOS, runDemoSeed, type DemoScenarioSlug } from "./transaction-demo-seed";
import { MerchantEnvironmentError } from "../lib/retention/environment-guard.mjs";
import { auditActionLabel, auditEventStatus, auditOrderHref, auditTargetLabel } from "../modules/admin/audit-log-presentation";
import { createRuntimeLogin } from "./retention-test-kit";

/**
 * MS-22: the order timeline, the audit-log wording and the demo transaction seed.
 * Pure parts first (labels, the builder's order and masking, the seed's gate),
 * then the real seed against the local database: every demo state, run twice,
 * with the triggers left on and the restricted login able to read what it made.
 * Local database only; orders and audit rows cannot be deleted, so the demo
 * transactions stay until the database is reset.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

// The suite plays a developer's machine: the stand-in's local opt-in and a loopback app URL.
process.env.PAYMENT_STAND_IN_LOCAL = "1";
process.env.APP_BASE_URL = process.env.APP_BASE_URL?.startsWith("http://localhost") ? process.env.APP_BASE_URL : "http://localhost:3000";
process.env.FRAUD_OWNER_EMAIL ||= "admin@vecalss.local";
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("The order timeline suite only runs against the local dev database on 127.0.0.1:55432.");
}

const GOOD_ENV = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/some_db",
  NODE_ENV: "development",
  PAYMENT_STAND_IN_LOCAL: "1",
};

function walk(dir: string, found: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.(ts|tsx|mjs)$/u.test(name)) found.push(path);
  }
  return found;
}

function titlesOf(entries: TimelineEntry[]) {
  return entries.map((entry) => entry.title);
}

function indexOfTitle(entries: TimelineEntry[], title: string) {
  const index = titlesOf(entries).indexOf(title);
  assert.ok(index >= 0, `the timeline has "${title}" (has: ${titlesOf(entries).join(" | ")})`);
  return index;
}

function assertInOrder(entries: TimelineEntry[], titles: string[]) {
  const indexes = titles.map((title) => indexOfTitle(entries, title));
  for (let position = 1; position < indexes.length; position += 1) {
    assert.ok(indexes[position] > indexes[position - 1], `"${titles[position - 1]}" comes before "${titles[position]}"`);
  }
}

function entriesOf(timeline: OrderTimeline | null) {
  assert.ok(timeline && timeline.kind === "present", "the order has a timeline");
  return timeline.entries;
}

async function main() {
  // ---- Labels: every payment, refund, dispute, fraud and retention action reads as Indonesian --------------------------
  {
    const written = new Set<string>();
    const literal = /(?:action:\s*|VALUES\s*\(\s*|VALUES\s*\(\s*\$\{[^}]*\}\s*,\s*)["'`]((?:payment|refund|dispute|fraud|retention|risk)\.[a-z_]+(?:\.[a-z_]+)?)["'`]/gu;
    for (const file of walk(fileURLToPath(new URL("../lib", import.meta.url)))) {
      for (const match of readFileSync(file, "utf8").matchAll(literal)) written.add(match[1]);
    }
    // Written through a template string (`payment.order.${to}`, `refund.${to}`, `dispute.${outcome}`, `fraud.case.${kind}`).
    for (const action of [
      "payment.order.paid", "payment.order.failed", "payment.order.expired", "payment.order.review",
      "refund.cancelled", "refund.rejected", "refund.failed", "dispute.won", "dispute.lost",
      "fraud.case.acknowledged", "fraud.case.escalated", "fraud.case.closed", "fraud.case.reopened",
      "dispute.export.created", "dispute.export.downloaded", "dispute.export.refused", "retention.hold.released",
    ]) written.add(action);
    assert.ok(written.size >= 30, `the scan found the audit actions in the code (${written.size})`);
    for (const action of written) {
      assert.ok(paymentAuditLabel(action), `${action} has an Indonesian label`);
      const label = auditActionLabel(action);
      assert.notEqual(label, "Aktivitas tercatat", `${action} is not the generic label`);
      assert.doesNotMatch(label, /[a-z]+\.[a-z_]+|_/u, `${action}'s label shows no code`);
    }
    assert.equal(auditActionLabel("payment.order.paid"), "Pembayaran diterima, pesanan lunas");
    assert.equal(auditActionLabel("payment.event.quarantined"), "Kabar dari penyedia pembayaran ditahan karena datanya tidak cocok");
    assert.equal(auditActionLabel("refund.completed"), "Pengembalian dana selesai");
    assert.equal(auditActionLabel("dispute.opened"), "Sengketa dibuka, akses dijeda");
    assert.equal(auditActionLabel("retention.hold.placed"), "Bukti ditahan, tidak akan dihapus");
    assert.equal(auditActionLabel("student_enrollment.updated"), "Pendaftaran Voyager diperbarui", "existing labels are unchanged");
    assert.equal(auditActionLabel("something.unheard_of"), "Aktivitas tercatat");
    assert.equal(auditEventStatus("payment.event.quarantined").tone, "danger");
    assert.equal(auditEventStatus("payment.order.review").tone, "attention");
    assert.equal(auditEventStatus("payment.order.paid").tone, "neutral");
    assert.equal(auditTargetLabel("payment_order"), "Pesanan");
    assert.equal(auditTargetLabel("nonsense"), "Aktivitas lainnya");
    pass("every payment, refund, dispute, fraud and retention action in the code has an Indonesian label and no code shows");
  }
  {
    const orderId = randomUUID();
    assert.equal(auditOrderHref({ targetId: orderId, targetType: "payment_order" }), `/admin/fraud/orders/${orderId}`);
    assert.equal(auditOrderHref({ targetId: orderId, targetType: "payment_event" }), null);
    assert.equal(auditOrderHref({ targetId: orderId, targetType: "user" }), null);
    assert.equal(auditOrderHref({ targetId: null, targetType: "payment_order" }), null);
    assert.equal(auditOrderHref({ targetId: "../../etc", targetType: "payment_order" }), null);
    assert.equal(paymentEventReasonLabel("amount,buyer"), "Data tidak cocok dengan pesanan: nominal, pembeli.");
    assert.match(paymentEventReasonLabel("late_success_after_expired") ?? "", /setelah waktu pembayaran habis/u);
    assert.doesNotMatch(paymentEventReasonLabel("something_new") ?? "", /something_new/u);
    pass("a payment row links to its order page only when it is about an order; reasons are words, not codes");
  }

  // ---- The builder: order, ties, masking, scrub -----------------------------------------------------------------------
  {
    const t = (seconds: number) => new Date(Date.UTC(2026, 10, 7, 3, 0, seconds));
    const buyerId = randomUUID();
    const ownerId = randomUUID();
    const input: TimelineInput = {
      access: [{ actorUserId: null, endsAt: t(900), id: "a1", kind: "grant", occurredAt: t(10), planCode: "monthly", source: "payment" }],
      audits: [
        { action: "payment.order.paid", actorUserId: null, id: "u2", metadata: {}, occurredAt: t(10), targetId: null, targetType: "payment_order" },
        { action: "payment.order.created", actorUserId: buyerId, id: "u1", metadata: {}, occurredAt: t(0), targetId: null, targetType: "payment_order" },
        { action: "payment.event.quarantined", actorUserId: null, id: "u3", metadata: {}, occurredAt: t(10), targetId: null, targetType: "payment_order" },
        { action: "payment.order.delivered", actorUserId: null, id: "u4", metadata: {}, occurredAt: t(10), targetId: null, targetType: "payment_order" },
        { action: "refund.approved", actorUserId: ownerId, id: "u5", metadata: {}, occurredAt: t(20), targetId: null, targetType: "payment_order" },
        { action: "unknown.action", actorUserId: null, id: "u6", metadata: {}, occurredAt: t(21), targetId: null, targetType: "payment_order" },
      ],
      buyerId,
      cases: [],
      deliveries: [{ attemptedAt: t(10), channel: "in_app", id: "d1", outcome: "sent" }],
      disputes: [],
      events: [{ amountRupiah: 49_000, callerIp: "198.51.100.20", id: "e1", outcome: "accepted", reason: null, receivedAt: t(10), source: "webhook", type: "succeeded" }],
      holds: [],
      intentCreatedAt: t(-5),
      order: { amountRupiah: 49_000, buyerIp: "203.0.113.12", createdAt: t(0), expiresAt: t(900), id: randomUUID() },
      ownerEmail: "owner@vecalss.local",
      receipt: { createdAt: t(10), id: "r1", receiptNumber: "VCL-0001" },
      refunds: [],
      scrubbedAt: t(30),
      usage: [],
      users: new Map([[ownerId, { email: "owner@vecalss.local", fullName: "Pemilik Uji", id: ownerId }]]),
    };
    const entries = buildOrderTimeline(input);
    assert.deepEqual(
      titlesOf(entries),
      [
        "Pembeli menyetujui Syarat Pembelian dan memulai checkout",
        "Pesanan dibuat",
        "Penyedia melaporkan pembayaran berhasil",
        "Pembayaran diterima, pesanan lunas",
        "Akses diberikan ke pembeli",
        "Struk dibuat",
        "Struk terkirim lewat pemberitahuan di aplikasi",
        "Alamat IP dan perangkat pembeli dihapus sesuai kebijakan retensi",
      ],
      "entries sharing one transaction time are ordered by what had to happen first; duplicated and unknown audit rows are left out",
    );
    const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
    assert.deepEqual(entries.map((entry) => entry.key), sorted.map((entry) => entry.key), "time order holds");
    assert.deepEqual(buildOrderTimeline({ ...input, audits: [...input.audits].reverse(), events: [...input.events] }).map((entry) => entry.key), entries.map((entry) => entry.key), "the order does not depend on the order rows were read in");
    const created = entries.find((entry) => entry.title === "Pesanan dibuat");
    assert.equal(created?.actor, "Pembeli");
    assert.match(created?.detail ?? "", /203\.0\.\*\.\*/u);
    assert.match(created?.detail ?? "", /Rp/u);
    const json = JSON.stringify(entries);
    assert.doesNotMatch(json, /203\.0\.113\.12|198\.51\.100\.20/u, "no raw address");
    assert.match(json, /198\.51\.\*\.\*/u, "the provider's address is masked");
    assert.equal(entries.every((entry) => /^\d{4}-\d{2}-\d{2}T/u.test(entry.at)), true, "times are ISO database times");
    const refunded = buildOrderTimeline({
      ...input,
      audits: [],
      refunds: [{
        accessEffect: "revoked", amountRupiah: 49_000, approvalReason: "ok", approvedAt: t(40), approvedByEmail: "owner@vecalss.local",
        authorityDeadlineAt: null, authorityName: null, authorityReceivedAt: null, authorityReference: null, closedAt: null, closureReason: null,
        completedAt: t(50), confirmationSource: "provider_event", decisionDueAt: t(1000), destinationHolder: null, destinationMasked: null,
        eligibilityApproved: null, eligibilityPrepared: {}, events: [
          { actorEmail: "owner@vecalss.local", actorKind: "owner", at: t(40), kind: "approved", metadata: {}, note: "Bukti sudah dicek.", version: 2 },
          { actorEmail: null, actorKind: "provider", at: t(50), kind: "completed", metadata: {}, note: null, version: 4 },
        ],
        id: "rc1", method: "provider", outcomeUnknown: false, payoutDueAt: null, preparedAt: t(35), preparedByEmail: "owner@vecalss.local", proofNote: null,
        providerPaymentId: "sip_secret_payment_id", providerRefundId: "rfd_secret_refund_id", reasonCategory: "our_fault", reasonCode: "double_charge",
        reference: "rf_demo", requestChannel: "whatsapp", requestedAt: t(34), requestNote: "x", revokeAccess: false, selfApproved: true, state: "completed",
        transferReference: null, version: 4,
      }],
    });
    const approved = refunded.find((entry) => entry.title === "Pengembalian dana disetujui pemilik");
    assert.equal(approved?.actor, "Pemilik (Pemilik Uji)", "the authority holder is named as such");
    assert.match(approved?.detail ?? "", /Disiapkan dan disetujui orang yang sama/u);
    assert.doesNotMatch(JSON.stringify(refunded), /sip_secret|rfd_secret|owner@vecalss/u, "no provider ids or emails");
    pass("the builder orders ties by what happens first, names actors, masks addresses and shows no ids or emails");
  }

  // ---- The seed's gate --------------------------------------------------------------------------------------------------
  {
    assert.deepEqual(demoSeedRefusals(GOOD_ENV), []);
    const refused = (patch: Record<string, string | undefined>, pattern: RegExp) => {
      const problems = demoSeedRefusals({ ...GOOD_ENV, ...patch });
      assert.ok(problems.length > 0 && problems.some((problem) => pattern.test(problem)), `refused (${JSON.stringify(Object.keys(patch))}): ${problems.join("; ")}`);
      assert.doesNotMatch(problems.join(" "), /postgres(ql)?:\/\/|:p@/u, "a refusal never prints a connection string");
    };
    refused({ PAYMENT_STAND_IN_LOCAL: undefined }, /PAYMENT_STAND_IN_LOCAL/u);
    refused({ PAYMENT_STAND_IN_LOCAL: "0" }, /PAYMENT_STAND_IN_LOCAL/u);
    refused({ NODE_ENV: "production" }, /production/u);
    refused({ DATABASE_URL: "postgresql://u:p@ep-cool-name-123.ap-southeast-1.aws.neon.tech/neondb" }, /DATABASE_URL/u);
    refused({ DATABASE_URL: "postgresql://u:p@host.docker.internal:5432/db" }, /DATABASE_URL/u);
    refused({ DATABASE_URL: undefined }, /DATABASE_URL/u);
    refused({ APP_BASE_URL: "https://app.example.com" }, /APP_BASE_URL/u);
    refused({ APP_BASE_URL: undefined }, /APP_BASE_URL/u);
    refused({ APP_BASE_URL: "http://localhost.evil.example" }, /APP_BASE_URL/u);
    for (const marker of ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "NETLIFY", "RENDER", "FLY_APP_NAME", "KUBERNETES_SERVICE_HOST"]) {
      refused({ [marker]: "1" }, new RegExp(marker, "u"));
    }

    const [{ n: auditBefore }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM audit_logs`;
    const [{ n: usersBefore }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`;
    await assert.rejects(
      () => runDemoSeed({ env: { ...process.env, DATABASE_URL: "postgresql://u:p@ep-cool-name-123.ap-southeast-1.aws.neon.tech/neondb" } }),
      (error: unknown) => error instanceof DemoSeedRefusedError && !/neon\.tech|:p@/u.test(error.message),
      "the seed refuses a Neon database without naming it",
    );
    await assert.rejects(() => runDemoSeed({ env: { ...process.env, PAYMENT_STAND_IN_LOCAL: "" } }), DemoSeedRefusedError);
    await assert.rejects(() => runDemoSeed({ env: { ...process.env, VERCEL: "1" } }), DemoSeedRefusedError);
    const [{ n: auditAfter }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM audit_logs`;
    const [{ n: usersAfter }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM users`;
    assert.equal(auditAfter, auditBefore, "a refused seed wrote no audit row");
    assert.equal(usersAfter, usersBefore, "a refused seed wrote no account");
    pass("the seed refuses without the local opt-in, in production, on Neon or a docker host, on a non-loopback app URL and on any hosting marker, and writes nothing");
  }
  {
    // A database marked as the merchant's: a scratch database with the mark row, never the dev database.
    const base = new URL(process.env.DATABASE_URL ?? "");
    const scratch = `vecalss_ms22_mark_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const adminUrl = new URL(base);
    adminUrl.pathname = "/postgres";
    adminUrl.search = "";
    const admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(scratch)}`);
      const markedUrl = new URL(base);
      markedUrl.pathname = `/${scratch}`;
      markedUrl.search = "";
      const marked = new pg.Client({ connectionString: markedUrl.toString() });
      await marked.connect();
      try {
        await marked.query("CREATE TABLE environment_marks (id int primary key, environment text, marked_at timestamptz DEFAULT now(), note text)");
        await marked.query("INSERT INTO environment_marks (id, environment, note) VALUES (1, 'merchant', 'test')");
      } finally {
        await marked.end();
      }
      await assert.rejects(
        () => runDemoSeed({ env: { ...process.env, DATABASE_URL: markedUrl.toString(), MIGRATE_DATABASE_URL: markedUrl.toString() } }),
        MerchantEnvironmentError,
        "the seed refuses a database marked as a merchant's",
      );
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(scratch)} WITH (FORCE)`);
      await admin.end();
    }
    pass("the seed refuses a database marked as the merchant environment");
  }

  // ---- The real seed, twice ---------------------------------------------------------------------------------------------
  const first = await runDemoSeed({ env: process.env });
  assert.equal(first.length, DEMO_SCENARIOS.length, "every scenario ran or was found");
  const counts = async () => {
    const [row] = await prisma.$queryRaw<Array<{ audits: number; events: number; orders: number; refunds: number; users: number }>>`
      SELECT (SELECT count(*)::int FROM audit_logs a WHERE a.target_id IN (SELECT id FROM payment_orders WHERE buyer_id IN (SELECT id FROM users WHERE email LIKE 'demo-transaksi-%'))) AS audits,
             (SELECT count(*)::int FROM payment_events WHERE order_id IN (SELECT id FROM payment_orders WHERE buyer_id IN (SELECT id FROM users WHERE email LIKE 'demo-transaksi-%'))) AS events,
             (SELECT count(*)::int FROM payment_orders WHERE buyer_id IN (SELECT id FROM users WHERE email LIKE 'demo-transaksi-%')) AS orders,
             (SELECT count(*)::int FROM refund_cases WHERE buyer_id IN (SELECT id FROM users WHERE email LIKE 'demo-transaksi-%')) AS refunds,
             (SELECT count(*)::int FROM users WHERE email LIKE 'demo-%@vecalss.local' AND email LIKE 'demo-%transaksi%') AS users
    `;
    return row;
  };
  const before = await counts();
  assert.equal(before.orders, DEMO_SCENARIOS.length, "one order per demo buyer");
  const second = await runDemoSeed({ env: process.env });
  assert.equal(second.every((item) => item.seeded === false), true, "a second run seeds nothing");
  assert.deepEqual(await counts(), before, "a second run adds no order, event, refund, audit row or account");
  pass("the seed makes one order per scenario and a second run changes nothing");

  const orderOf = (slug: DemoScenarioSlug) => {
    const found = second.find((item) => item.slug === slug);
    assert.ok(found, `scenario ${slug} exists`);
    return found.orderId;
  };
  const timelineOf = async (slug: DemoScenarioSlug) => entriesOf(await getOrderTimeline(orderOf(slug)));

  const all: Record<string, TimelineEntry[]> = {};
  for (const scenario of DEMO_SCENARIOS) {
    const entries = await timelineOf(scenario.slug);
    all[scenario.slug] = entries;
    const stamps = entries.map((entry) => entry.at);
    assert.deepEqual(stamps, [...stamps].sort(), `${scenario.slug}: times never go backwards`);
    assert.ok(entries.every((entry) => entry.actor.length > 0 && entry.title.length > 0), `${scenario.slug}: every line says what and who`);
    const json = JSON.stringify(entries);
    assert.doesNotMatch(json, /sip_|evt_|rfd_|stand_in|203\.0\.113\.\d+|198\.51\.100\.\d+|demo-transaksi-[a-z-]+@|admin@vecalss\.local|demo-admin-transaksi@/u, `${scenario.slug}: no provider id, raw address or email`);
    assert.doesNotMatch(json, /payment\.|refund\.|dispute\.|_(?:succeeded|failed|opened)/u, `${scenario.slug}: no action or event code`);
  }
  assert.match(JSON.stringify(all.paid), /203\.0\.\*\.\*/u, "the buyer's address shows masked");
  pass("every demo state has an ordered, readable timeline with no ids, raw addresses or emails");

  assertInOrder(all.paid, [
    "Pembeli menyetujui Syarat Pembelian dan memulai checkout",
    "Pesanan dibuat",
    "Penyedia melaporkan pembayaran berhasil",
    "Pembayaran diterima, pesanan lunas",
    "Akses diberikan ke pembeli",
    "Struk dibuat",
  ]);
  assert.ok(all.paid.some((entry) => entry.title.startsWith("Struk terkirim")), "paid: the receipt was delivered");
  assert.equal(all.paid.find((entry) => entry.title === "Pesanan dibuat")?.actor, "Pembeli");
  assert.equal(all.paid.find((entry) => entry.title === "Akses diberikan ke pembeli")?.actor, "Sistem");
  assert.deepEqual(titlesOf(all.pending), ["Pembeli menyetujui Syarat Pembelian dan memulai checkout", "Pesanan dibuat"], "pending: nothing after the order");
  assertInOrder(all.expired, ["Pesanan dibuat", "Penyedia melaporkan waktu pembayaran habis", "Waktu pembayaran habis"]);
  assertInOrder(all.failed, ["Pesanan dibuat", "Penyedia melaporkan pembayaran gagal", "Pembayaran gagal"]);
  assert.ok(!titlesOf(all.failed).includes("Akses diberikan ke pembeli"), "failed: no access");
  pass("paid, pending, expired and failed read in the order they happened, with who did each");

  assertInOrder(all.refunded, [
    "Pembayaran diterima, pesanan lunas",
    "Akses diberikan ke pembeli",
    "Pengembalian dana disiapkan",
    "Pengembalian dana disetujui pemilik",
    "Pengembalian dana dikirim ke penyedia pembayaran",
    "Penyedia melaporkan pengembalian dana berhasil",
    "Pengembalian dana selesai",
    "Akses pembeli dicabut",
  ]);
  const prepared = all.refunded.find((entry) => entry.title === "Pengembalian dana disiapkan");
  const approved = all.refunded.find((entry) => entry.title === "Pengembalian dana disetujui pemilik");
  assert.equal(prepared?.actor, "Admin (Demo Admin Transaksi)");
  assert.match(approved?.actor ?? "", /^Pemilik \(/u);
  assert.match(prepared?.detail ?? "", /Tertagih dua kali/u);
  assert.equal(all.refunded.find((entry) => entry.title === "Pengembalian dana selesai")?.actor, "Penyedia pembayaran");
  pass("a full refund shows who prepared it, who approved it, the provider's confirmation and the access taken away");

  assertInOrder(all.dispute_open, [
    "Pembayaran diterima, pesanan lunas",
    "Penyedia melaporkan sengketa dibuka",
    "Sengketa dibuka, akses pembeli dijeda",
    "Akses pembeli dijeda",
  ]);
  assert.ok(!titlesOf(all.dispute_open).includes("Akses pembeli dicabut"), "an open dispute pauses access, it does not revoke it");
  pass("an open dispute shows the provider's notice, the dispute and the paused access");

  const held = all.quarantined.find((entry) => entry.title === "Penyedia melaporkan pembayaran berhasil");
  assert.equal(held?.tone, "danger");
  assert.match(held?.detail ?? "", /Ditahan/u);
  assert.match(held?.detail ?? "", /nominal/u);
  assert.ok(!titlesOf(all.quarantined).includes("Pembayaran diterima, pesanan lunas"), "a held event does not pay the order");
  pass("a mismatched provider event is shown as held, with the reason in words, and the order stays unpaid");

  assertInOrder(all.late_success_review, ["Waktu pembayaran habis", "Penyedia melaporkan pembayaran berhasil", "Pembayaran masuk setelah pesanan ditutup, perlu ditinjau"]);
  const late = all.late_success_review.filter((entry) => entry.title === "Penyedia melaporkan pembayaran berhasil")[0];
  assert.match(late?.detail ?? "", /Perlu ditinjau/u);
  assert.match(late?.detail ?? "", /setelah waktu pembayaran habis/u);
  assert.ok(!titlesOf(all.late_success_review).includes("Akses diberikan ke pembeli"), "a payment in review grants nothing");
  pass("a late success after expiry is shown as sent to review, with no access given");

  const authority = all.authority_refund.find((entry) => entry.title === "Pengembalian dana disiapkan");
  assert.match(authority?.detail ?? "", /Diperintahkan oleh Pengadilan Negeri Jakarta Selatan, nomor Demo No\./u);
  assert.equal(authority?.actor, "Admin (Demo Admin Transaksi)");
  assertInOrder(all.authority_refund, ["Pengembalian dana disiapkan", "Pengembalian dana disetujui pemilik", "Pengembalian dana selesai", "Akses pembeli dicabut"]);
  pass("a refund ordered by an authority names the authority and its reference");

  // ---- Genuine rows: the audit log really holds the steps, the triggers are on, the login can read ----------------------
  {
    const rows = await prisma.$queryRaw<Array<{ action: string }>>`
      SELECT action FROM audit_logs WHERE target_type = 'payment_order' AND target_id = ${orderOf("refunded")}::uuid ORDER BY occurred_at, id
    `;
    const actions = rows.map((row) => row.action);
    for (const expected of ["payment.order.created", "payment.order.paid", "payment.order.delivered", "refund.prepared", "refund.approved", "refund.execution_started", "refund.completed"]) {
      assert.ok(actions.includes(expected), `the audit log holds ${expected}`);
    }
    const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgrelid IN ('audit_logs'::regclass, 'payment_orders'::regclass, 'payment_events'::regclass, 'refund_cases'::regclass, 'payment_receipts'::regclass)
        AND NOT tgisinternal AND tgenabled <> 'O'
    `;
    assert.equal(n, 0, "no evidence trigger was left disabled");
    await assert.rejects(() => prisma.$executeRaw`UPDATE audit_logs SET action = 'x' WHERE target_id = ${orderOf("paid")}::uuid`, /append-only|immutable|cannot|not allowed/iu, "the audit log still refuses edits");
    pass("the demo rows are in the real audit log, written with every trigger on");
  }
  {
    // The restricted application login can run the seed's read-and-check pass over what the owner made.
    const login = await createRuntimeLogin("ms22");
    try {
      const child = spawnSync(
        process.execPath,
        ["--conditions=react-server", "--import", "tsx", fileURLToPath(new URL("./seed-transaction-demo.ts", import.meta.url))],
        { cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", env: { ...process.env, DATABASE_URL: login.url, MIGRATE_DATABASE_URL: login.url }, timeout: 120_000 },
      );
      assert.equal(child.status, 0, `the restricted login can run the seed (${(child.stderr || child.stdout).replace(/postgres(ql)?:\/\/\S+/gu, "<redacted>").slice(0, 300)})`);
      assert.match(child.stdout, /0 new, 9 already there/u);
    } finally {
      await login.drop();
    }
    pass("the seed also runs under the restricted application login");
  }

  // ---- The purged state --------------------------------------------------------------------------------------------------
  {
    const purgedId = randomUUID();
    const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM payment_orders WHERE id = ${purgedId}::uuid`;
    assert.equal(n, 0);
    assert.equal(await getOrderTimeline(purgedId), null, "an order that never existed has no timeline");
    assert.equal(await getOrderTimeline("not-a-uuid"), null);
    // The tombstone the retention job leaves when it removes an order family.
    await prisma.$executeRaw`
      INSERT INTO retention_purges (record_class, subject_table, subject_id, subject_reference, run_id, register_version)
      VALUES ('order_family', 'payment_orders', ${purgedId}::uuid, 'order-demo-purged', gen_random_uuid(), 1)
    `;
    const purged = await getOrderTimeline(purgedId);
    assert.equal(purged?.kind, "purged", "a removed order shows its purged state");
    assert.ok(purged && purged.kind === "purged" && !("entries" in purged), "and no timeline");
    pass("an order removed under the retention policy answers with its purged state instead of a timeline");
  }

  console.log(`Order timeline checks passed: ${checks.join("; ")}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
