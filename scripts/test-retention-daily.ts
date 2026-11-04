import assert from "node:assert/strict";

import type { EmailMessage, MailResult } from "../lib/email/mailer";
import { handleDailyMaintenanceRequest, runDailyMaintenance, type MaintenanceDeps } from "../lib/maintenance/daily";
import { checkRuntimeRole, runRetentionMaintenance } from "../lib/retention/maintenance";
import { createRuntimeLogin } from "./retention-test-kit";
import { prisma } from "./payment-test-kit";

/**
 * MS-10 phase A, the daily job: the retention step runs and is reported, a
 * failure in it never stops the other steps, and in production the connected
 * role is checked and the owner is emailed when it can alter schema or delete
 * evidence. Outside production the role check does not run. Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const ok = async () => "ok";
type Db = MaintenanceDeps["db"];
const healthyDb = { $executeRaw: async () => 0, $queryRaw: async () => [{ count: 0n }] } as unknown as Db;

const sent: EmailMessage[] = [];
const recordingAlert = async (message: EmailMessage): Promise<MailResult> => {
  sent.push(message);
  return { id: "email_test", ok: true, redirected: false };
};

const baseDeps = (overrides: Partial<MaintenanceDeps> = {}): MaintenanceDeps => ({
  alertTo: "owner@vecalss.test",
  db: healthyDb,
  now: new Date("2026-11-06T19:00:00Z"),
  probes: { database: ok, redis: ok },
  sendAlert: recordingAlert,
  ...overrides,
});

const emptyRetention = { complete: true, delete: [], failedRows: 0, scrub: [] };

async function main() {
  // ---- The retention step ---------------------------------------------------------------------------------------------------
  const withStep = await runDailyMaintenance(baseDeps({ retention: async () => ({ ...emptyRetention, scrub: [{ class: "buyer_ip_device", complete: true, counts: { payment_orders: 2 } }] }) }));
  assert.equal(withStep.ok, true);
  assert.equal(withStep.retention?.scrub[0].counts.payment_orders, 2, "the step's counts are in the result");
  assert.equal(sent.length, 1, "a retention run that scrubbed something tells the owner");
  assert.equal(sent[0].to, "owner@vecalss.test");
  assert.match(sent[0].text, /payment_orders 2/u, "the notice carries the counts");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-/u.test(sent[0].text), false, "…and no record ids");
  sent.length = 0;

  // MS-19 C-01: nothing changed, nothing sent; deleting counts too; a missing address or a failing send never fails the run.
  await runDailyMaintenance(baseDeps({ retention: async () => ({ ...emptyRetention, scrub: [{ class: "buyer_ip_device", complete: true, counts: { payment_orders: 0 } }] }) }));
  assert.equal(sent.length, 0, "a run that changed nothing sends nothing");
  const deleted = await runDailyMaintenance(baseDeps({ retention: async () => ({ ...emptyRetention, delete: [{ class: "order_family", complete: true, counts: { payment_orders: 1, payment_events: 4 } }] }) }));
  assert.equal(deleted.ok, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /order_family \(dihapus\): payment_orders 1, payment_events 4/u);
  sent.length = 0;
  const unaddressed = await runDailyMaintenance(baseDeps({ alertTo: null, retention: async () => ({ ...emptyRetention, scrub: [{ class: "buyer_ip_device", complete: true, counts: { payment_orders: 2 } }] }) }));
  assert.equal(unaddressed.ok, true, "no alert address does not fail the run");
  const brokenSend = await runDailyMaintenance(baseDeps({ retention: async () => ({ ...emptyRetention, scrub: [{ class: "buyer_ip_device", complete: true, counts: { payment_orders: 2 } }] }), sendAlert: async () => { throw new Error("mail down"); } }));
  assert.equal(brokenSend.ok, true, "a send that throws does not fail the run");
  assert.equal(sent.length, 0);

  const without = await runDailyMaintenance(baseDeps());
  assert.equal(without.retention, null, "a run given no retention step reports none");
  pass("the retention step runs inside the daily job and its counts are reported");

  // A failure in the retention step is reported and never stops the steps around it.
  const order: string[] = [];
  const failing = await runDailyMaintenance(baseDeps({
    fraud: async () => { order.push("fraud"); return { daily: { automaticBlocks: 0, signals: 0 }, emailed: false, summary: {} } as never; },
    payments: async () => { order.push("payments"); return {} as never; },
    retention: async () => { order.push("retention"); throw new Error("relation retention_runs does not exist"); },
    roleCheck: async () => { order.push("role"); return { findings: [], ok: true, role: "vecalss_app" }; },
    production: true,
  }));
  assert.deepEqual(order, ["payments", "fraud", "retention", "role"], "every step ran, in order, after the failing one too");
  assert.deepEqual(failing.failures, ["retention_maintenance"]);
  assert.equal(failing.ok, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text.includes("relation retention_runs"), false, "the email carries no error text");
  assert.match(sent[0].text, /retensi/u);

  const stuck = await runDailyMaintenance(baseDeps({ retention: async () => ({ ...emptyRetention, failedRows: 2 }) }));
  assert.deepEqual(stuck.failures, ["retention_maintenance"], "rows the delete path could not remove are a failure to look into");
  const beforeOthers = sent.length;
  const stillRuns = await runDailyMaintenance(baseDeps({
    payments: async () => { throw new Error("payments down"); },
    retention: async () => emptyRetention,
  }));
  assert.deepEqual(stillRuns.failures, ["payment_maintenance"]);
  assert.ok(stillRuns.retention, "the retention step still ran when the payment step failed");
  assert.equal(sent.length, beforeOthers + 1);
  pass("a failing retention step, or a failing payment step, never stops the other steps, and the owner is told without any error text");

  // ---- The production role check ----------------------------------------------------------------------------------------------
  let checked = 0;
  const risky = async () => { checked += 1; return { findings: ["superuser", "delete:payment_events"], ok: false, role: "owner" }; };
  const notProduction = await runDailyMaintenance(baseDeps({ production: false, roleCheck: risky }));
  assert.equal(checked, 0, "outside production the role check does not run");
  assert.equal(notProduction.runtimeRole, null);
  assert.equal(notProduction.ok, true);

  const mailBefore = sent.length;
  const production = await runDailyMaintenance(baseDeps({ production: true, roleCheck: risky }));
  assert.equal(checked, 1, "in production it runs once");
  assert.deepEqual(production.failures, ["runtime_role"]);
  assert.equal(production.ok, false);
  assert.equal(sent.length, mailBefore + 1, "the owner is emailed");
  assert.match(sent[sent.length - 1].text, /superuser, delete:payment_events/u, "the email names what the role can do");
  assert.match(sent[sent.length - 1].text, /peran basis data/u);
  assert.equal(sent[sent.length - 1].to, "owner@vecalss.test");

  const clean = await runDailyMaintenance(baseDeps({ production: true, roleCheck: async () => ({ findings: [], ok: true, role: "vecalss_app" }) }));
  assert.deepEqual(clean.failures, []);
  assert.equal(clean.runtimeRole?.ok, true);

  const mailAfterClean = sent.length;
  const broken = await runDailyMaintenance(baseDeps({ production: true, roleCheck: async () => { throw new Error("permission denied for function retention_role_check"); } }));
  assert.deepEqual(broken.failures, ["runtime_role"], "a role check that cannot run is reported, not ignored");
  assert.equal(sent.length, mailAfterClean + 1);

  // Production is read from NODE_ENV when it is not injected.
  const previous = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    checked = 0;
    await runDailyMaintenance(baseDeps({ roleCheck: risky }));
    assert.equal(checked, 1, "NODE_ENV=production turns the check on");
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    checked = 0;
    await runDailyMaintenance(baseDeps({ roleCheck: risky }));
    assert.equal(checked, 0, "any other NODE_ENV leaves it off");
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  }

  // The cron response reports whether the role passed, and no more.
  const response = await handleDailyMaintenanceRequest(
    new Request("https://app.example.test/api/cron/daily-maintenance", { headers: { authorization: "Bearer s3cret-for-this-test-0123456789" } }),
    { run: () => runDailyMaintenance(baseDeps({ production: true, roleCheck: risky, retention: async () => emptyRetention })), secret: "s3cret-for-this-test-0123456789" },
  );
  const body = await response.json() as { runtimeRole: { findings: number; ok: boolean }; retention: { failedRows: number } };
  assert.equal(response.status, 500);
  assert.deepEqual(body.runtimeRole, { findings: 2, ok: false });
  assert.equal(JSON.stringify(body).includes("superuser"), false, "the HTTP response does not list the findings");
  pass("in production the connected role is checked and the owner is emailed with what it can do; outside production nothing runs; a check that fails to run is itself a failure");

  // ---- Against the real database ----------------------------------------------------------------------------------------------------------
  // Connected as the schema owner (the local default), the check fails, which is what production must never see.
  const asOwner = await checkRuntimeRole();
  assert.equal(asOwner.ok, false);
  assert.ok(asOwner.findings.includes("superuser"));

  const login = await createRuntimeLogin("daily");
  try {
    // Through the restricted login the check passes and the whole retention step runs.
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: login.url });
    await client.connect();
    try {
      const result = (await client.query("SELECT retention_role_check() AS r")).rows[0].r as { ok: boolean };
      assert.equal(result.ok, true, "the restricted login passes the production check");
      const scrub = (await client.query("SELECT retention_run_scrub(5) AS r")).rows[0].r as { registerVersion: number };
      assert.equal(scrub.registerVersion, 1);
    } finally {
      await client.end();
    }
  } finally {
    await login.drop();
  }

  const real = await runRetentionMaintenance();
  assert.equal(real.failedRows, 0, "the real retention step finds nothing it cannot remove");
  assert.ok(real.scrub.length >= 1 && real.delete.length === 6);
  const live = await runDailyMaintenance({
    alertTo: null,
    db: prisma,
    probes: { database: ok, redis: ok },
    production: false,
    retention: () => runRetentionMaintenance(),
    roleCheck: () => checkRuntimeRole(),
    sendAlert: recordingAlert,
  });
  assert.ok(live.retention, "the daily job ran the real retention step");
  assert.equal(live.runtimeRole, null, "and, outside production, did not run the role check");
  pass("against the database: the owner fails the role check, the restricted login passes it, and the real retention step runs inside the daily job");

  await prisma.$disconnect();
  console.log(`retention daily: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
