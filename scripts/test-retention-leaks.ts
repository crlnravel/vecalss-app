import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { getAdminAuditLogPage } from "../lib/admin/operations/service";
import { openFraudCase } from "../lib/fraud/cases";
import { getCaseDetail, listBlocks, listCases } from "../lib/fraud/queries";
import { buildMonthlyReport, currentReportMonth } from "../lib/fraud/report";
import { listRecentOrders } from "../lib/disputes/queries";
import { listRecentRefunds } from "../lib/refunds/records";
import { prepareRefund } from "../lib/refunds/cases";
import { maskEmail, maskIp } from "../lib/retention/mask";
import { serverLogger } from "../lib/server-logger";
import { setupSql } from "./retention-test-kit";
import { deliver } from "./payment-test-kit";
import { ENV, cleanUp, makeOrder, prisma, provider, setupAuthority } from "./refund-test-kit";

/**
 * MS-10 phase A, the leak audit as far as a test can check it: the server logger
 * never writes an address, device value or email; the fraud lists, the case page,
 * the monthly report and the general audit page show masked values or none; the
 * raw address stays on the owner's order page and in the dispute export; and no
 * new file starts reading the raw address columns without being listed here.
 * Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/u;
const ABSENT = (text: string, needles: string[], where: string) => {
  for (const needle of needles) assert.equal(text.includes(needle), false, `${where} must not contain ${needle}`);
};

/** Captures what the logger writes to the console. */
async function captureLog(work: () => void | Promise<void>) {
  const lines: string[] = [];
  const original = { debug: console.debug, error: console.error, info: console.info, warn: console.warn };
  const record = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
  console.debug = record;
  console.error = record;
  console.info = record;
  console.warn = record;
  const level = process.env.APP_LOG_LEVEL;
  process.env.APP_LOG_LEVEL = "debug";
  try {
    await work();
  } finally {
    Object.assign(console, original);
    if (level === undefined) delete process.env.APP_LOG_LEVEL;
    else process.env.APP_LOG_LEVEL = level;
  }
  return lines.join("\n");
}

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/u.test(name)) found.push(path);
  }
  return found;
}

async function main() {
  // ---- The server logger -------------------------------------------------------------------------------------------------------
  const secretValues = [
    "203.0.113.7", "198.51.100.4", "10.1.2.3", "2001:db8:85a3::8a2e:370:7334", "fe80::1", "2001:db8::2:1",
    "devtok0123456789abcdef", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", "budi.santoso@example.com",
  ];
  const output = await captureLog(() => {
    serverLogger.error("payments.inbox.failed", new Error(
      "Failed for buyer_ip=203.0.113.7 caller_ip: 198.51.100.4 device=devtok0123456789abcdef user-agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) email=budi.santoso@example.com",
    ), { area: "payments", code: "retained 203.0.113.7" });
    serverLogger.error("db", new Error("connect ECONNREFUSED 10.1.2.3:5432"));
    serverLogger.error("ipv6", new Error("caller 2001:db8:85a3::8a2e:370:7334 via fe80::1 and 2001:db8::2:1 sent x-forwarded-for: 198.51.100.4, 10.1.2.3"));
    serverLogger.warn("fraud.note", { area: "fraud", code: "address 203.0.113.7" });
    serverLogger.info("fraud.note", { area: "fraud", code: "address 203.0.113.7" });
  });
  ABSENT(output, secretValues, "the server log");
  assert.match(output, /REDACTED/u, "the logger said it redacted something");

  // Ordinary text is left alone: times, versions and scope operators are not addresses.
  const harmless = await captureLog(() => {
    serverLogger.error("harmless", new Error("started at 12:34:56 on build 2026.11.04.12, std::vector, version 1.2.3, port 5432"));
  });
  assert.match(harmless, /12:34:56/u);
  assert.match(harmless, /std::vector/u);
  assert.match(harmless, /version 1\.2\.3/u);
  pass("the server logger redacts IPv4 and IPv6 addresses, address, device and user-agent assignments and emails, and leaves times, versions and scope operators alone");

  // ---- Masks ----------------------------------------------------------------------------------------------------------------------
  assert.equal(maskIp("203.0.113.7"), "203.0.*.*");
  assert.equal(maskIp("2001:db8:85a3::8a2e:370:7334"), "2001:db8:****");
  assert.equal(maskIp(null), null);
  assert.equal(maskIp(""), null);
  assert.equal(maskEmail("budi.santoso@example.com"), "bu***@e***.com");
  assert.equal(maskEmail("a@b.co"), "a***@b***.co");
  assert.equal(maskEmail(null), null);
  for (const value of ["203.0.113.7", "budi.santoso@example.com"]) {
    assert.equal(maskIp(value)?.includes("113.7") ?? false, false);
    assert.equal(maskEmail(value)?.includes("santoso") ?? false, false);
  }
  pass("the masks hide the host part of an address and most of an email");

  // ---- Fixtures: an order with a raw address, a fraud case on it, a refund case, a refused checkout ---------------------------------------
  const authority = await setupAuthority();
  const order = await makeOrder();
  const settled = await provider.settle(order.reference, "succeeded", new Date());
  assert.ok(settled);
  await deliver(settled, "198.51.100.77");
  const paid = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id }, include: { buyer: { select: { email: true } } } });
  const rawIp = paid.buyerIp!;
  const email = paid.buyer.email;
  assert.ok(rawIp && email);
  const fraud = await prisma.$transaction((tx) =>
    openFraudCase(tx, { evidence: { orderId: paid.id }, orderId: paid.id, signal: "payment_review", subjectKey: `order:${paid.id}`, subjectType: "order", userId: paid.buyerId }),
  );
  await prepareRefund(authority.admin, { orderId: paid.id, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan." });
  const secrets = [rawIp, "198.51.100.77", email];

  // ---- Fraud lists, case page, refund and order lists -----------------------------------------------------------------------------------------
  const detail = await getCaseDetail(fraud.id);
  assert.ok(detail);
  assert.equal(detail.detail.order?.buyerIp, maskIp(rawIp), "the case page shows the masked address");
  assert.equal(detail.detail.userEmail, maskEmail(email), "the case page shows the masked email");
  ABSENT(JSON.stringify(detail), secrets, "the case detail");
  for (const state of ["active", "open", "closed"] as const) {
    ABSENT(JSON.stringify(await listCases(state, 500)), secrets, `the case list (${state})`);
  }
  ABSENT(JSON.stringify(await listBlocks("all", 500)), secrets, "the block list");
  const orders = await listRecentOrders(100);
  assert.ok(orders.some((row) => row.id === paid.id), "the order is in the recent list");
  ABSENT(JSON.stringify(orders), secrets, "the order list");
  const refunds = await listRecentRefunds(prisma, 100);
  assert.ok(refunds.some((row) => row.orderId === paid.id));
  ABSENT(JSON.stringify(refunds), secrets, "the refund list");
  pass("the case page, case and block lists, order list and refund list show masked buyer values and no raw address or email");

  // ---- The monthly report ----------------------------------------------------------------------------------------------------------------------
  const report = JSON.stringify(await buildMonthlyReport(await currentReportMonth()));
  ABSENT(report, secrets, "the monthly report");
  assert.equal(IPV4.test(report), false, "the monthly report holds no address at all");
  assert.equal(report.includes("@"), false, "the monthly report holds no email at all");
  pass("the monthly report holds aggregates only: no address, no email");

  // ---- The general audit page --------------------------------------------------------------------------------------------------------------------
  await setupSql("INSERT INTO audit_logs (action, target_type, target_id, metadata, ip_address) VALUES ('auth.login.leak_test', 'user', $1, '{}'::jsonb, '203.0.113.50'::inet)", [paid.buyerId]);
  const pageForOrder = await getAdminAuditLogPage({ pageSize: 50, query: paid.id });
  const paymentRows = pageForOrder.entries.filter((entry) => entry.targetId === paid.id && entry.targetType === "payment_order");
  assert.ok(paymentRows.length >= 1, "the order's audit rows are listed");
  for (const entry of paymentRows) assert.ok(entry.ipAddress === null || entry.ipAddress.includes("*"), "a payment audit row shows a masked address");
  ABSENT(JSON.stringify(pageForOrder), [rawIp, "198.51.100.77"], "the audit page");
  const pageForUser = await getAdminAuditLogPage({ pageSize: 50, query: paid.buyerId });
  const loginRow = pageForUser.entries.find((entry) => entry.action === "auth.login.leak_test");
  assert.equal(loginRow?.ipAddress, "203.0.113.50", "a security audit row keeps its address (not payment evidence)");
  pass("the general audit page masks the address of payment rows and leaves security rows as they are");

  // ---- Who may read the raw address columns ----------------------------------------------------------------------------------------------------------
  const ROOT = fileURLToPath(new URL("..", import.meta.url));
  const allowed = new Set([
    "lib/admin/operations/service.ts", // masks payment rows (audit page)
    "lib/auth/mfa/service.ts", "lib/auth/password-reset-throttle.ts", "lib/auth/request.ts", "lib/auth/service.ts", // sessions and security logs
    "lib/disputes/export.ts", // the owner's evidence packet
    "lib/fraud/blocks.ts", "lib/fraud/daily.ts", // lookup tokens and daily signals; the case never holds the address
    "lib/fraud/queries.ts", // masks the address for the case page
    "lib/payments/audit.ts", "lib/payments/inbox.ts", "lib/payments/orders.ts", "lib/payments/risk/reserve.ts", // where the evidence is written
    "lib/pricing/checkout-pay.ts", // resolves the buyer's address at checkout
    "lib/retention/maintenance.ts", "lib/retention/mask.ts", "lib/retention/status.ts", // scrub, mask, and the owner's order page
    "lib/payments/inbox-http.ts", // reads the caller's address from the request
    "modules/admin/AuditLogsPageModule.tsx", "modules/admin/audit-log-presentation.ts", // show what the service already masked
    "modules/auth/mfa-actions.ts",
    "modules/admin/fraud/retention-panel.tsx", // the owner's address, or its mask, on the order page
    "app/admin/fraud/[caseId]/page.tsx", // shows the masked value
    "app/admin/fraud/orders/[orderId]/page.tsx", // masks it for everyone but the owner
  ]);
  const pattern = /ip_address|ipAddress|buyer_ip|buyerIp|caller_ip|callerIp|device_lookup_token|deviceLookupToken/u;
  const strays: string[] = [];
  for (const dir of ["lib", "modules", "app"]) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const rel = relative(ROOT, file);
      if (pattern.test(readFileSync(file, "utf8")) && !allowed.has(rel)) strays.push(rel);
    }
  }
  assert.deepEqual(strays, [], `these files read an address or device column and are not on the reviewed list: ${strays.join(", ")}`);
  const orderPage = readFileSync(join(ROOT, "app/admin/fraud/orders/[orderId]/page.tsx"), "utf8");
  assert.match(orderPage, /authority\.isOwner \? rawBuyerIp : maskIp\(rawBuyerIp\)/u, "the order page shows the raw address to the owner only");
  // MS-19 M-02: the buyer's email is masked for every admin who is not the owner, and appears nowhere on the page unmasked.
  assert.match(orderPage, /authority\.isOwner \? order\.buyerEmail : \(maskEmail\(order\.buyerEmail\) \?\? "\*\*\*"\)/u, "the order page shows the full email to the owner only");
  assert.equal([...orderPage.matchAll(/order\.buyerEmail/gu)].length, 2, "the only uses of the buyer's email on the order page are the owner check and its mask");
  assert.equal(maskEmail("budi.santoso@mail.com"), "bu***@m***.com");
  const caseQueries = readFileSync(join(ROOT, "lib/fraud/queries.ts"), "utf8");
  assert.match(caseQueries, /buyerIp: maskIp\(orderBuyerIp\)/u);
  pass("only the reviewed files read the raw address and device columns; the order page gives the raw address to the owner and a mask to everyone else");

  // ---- The dispute export keeps the raw address for the owner ------------------------------------------------------------------------------------------
  const { createDisputeExport, claimDisputeExport } = await import("../lib/disputes/export");
  const made = await createDisputeExport(authority.owner, { env: ENV, orderId: paid.id, reason: "Menjawab pertanyaan penyedia pembayaran." });
  const claimed = await claimDisputeExport(authority.owner, made.token, ENV);
  assert.ok(claimed.ok);
  if (claimed.ok) assert.ok(claimed.text.includes(rawIp), "the owner's export carries the raw address");
  pass("the owner's dispute export keeps the raw address");

  await cleanUp();
  await prisma.$disconnect();
  console.log(`retention leaks: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
