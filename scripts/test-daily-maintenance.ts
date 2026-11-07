import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { EmailMessage, MailResult } from "../lib/email/mailer";
import {
  checkCronAuthorization,
  handleDailyMaintenanceRequest,
  runDailyMaintenance,
  type MaintenanceDeps,
} from "../lib/maintenance/daily";
import { checkDependencies, isReady, withTimeout, type DependencyProbes } from "../lib/maintenance/readiness";
import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_MAX_BATCHES,
  purgeSecurityLogs,
  purgeTable,
  SECURITY_LOG_RETENTION_DAYS,
  SECURITY_LOG_TABLES,
} from "../lib/maintenance/retention";

/**
 * Behaviour that does not need the database: cron authorization, the readiness
 * shape and timeout, alerts that fire only on failure, batch caps, and the SQL
 * the cleanup sends (which must never name audit_logs).
 */

const SECRET = "cron-secret-for-tests-0123456789";
const ok = async () => "ok";
const down = async () => {
  throw new Error("connection refused at 10.0.0.5:5432");
};

// 1. Cron authorization fails closed.
assert.equal(checkCronAuthorization("Bearer anything", undefined), "not_configured");
assert.equal(checkCronAuthorization("Bearer anything", ""), "not_configured");
assert.equal(checkCronAuthorization(null, SECRET), "unauthorized");
assert.equal(checkCronAuthorization(`Bearer ${SECRET}x`, SECRET), "unauthorized");
assert.equal(checkCronAuthorization("Bearer wrong-secret", SECRET), "unauthorized");
assert.equal(checkCronAuthorization(SECRET, SECRET), "unauthorized", "the Bearer scheme is required");
assert.equal(checkCronAuthorization(`Bearer ${SECRET}`, SECRET), "ok");

let runs = 0;
const runStub = async () => {
  runs += 1;
  return {
    cleanup: null,
    failures: [] as never[],
    ok: true,
    readiness: { database: "up" as const, redis: "up" as const },
    staleEditLeases: 0,
  };
};

const request = (authorization?: string) =>
  new Request("https://app.example.test/api/cron/daily-maintenance", {
    headers: authorization ? { authorization } : {},
    method: "GET",
  });

const unconfigured = await handleDailyMaintenanceRequest(request(`Bearer ${SECRET}`), {
  run: runStub,
  secret: undefined,
});
assert.equal(unconfigured.status, 503);
assert.deepEqual(await unconfigured.json(), { error: "cron_not_configured" });
assert.equal(runs, 0, "an unconfigured secret must not run the job");

const missing = await handleDailyMaintenanceRequest(request(), { run: runStub, secret: SECRET });
assert.equal(missing.status, 401);
assert.equal(runs, 0, "a missing header must not run the job");

const wrong = await handleDailyMaintenanceRequest(request("Bearer nope"), { run: runStub, secret: SECRET });
assert.equal(wrong.status, 401);
assert.equal(runs, 0, "a wrong secret must not run the job");

const right = await handleDailyMaintenanceRequest(request(`Bearer ${SECRET}`), { run: runStub, secret: SECRET });
assert.equal(right.status, 200);
assert.equal(right.headers.get("cache-control"), "no-store");
assert.equal(runs, 1, "the right secret runs the job once");

// 2. Readiness shape: only up or down per dependency.
const allUp = await checkDependencies({ database: ok, redis: ok });
assert.deepEqual(Object.keys(allUp).sort(), ["database", "redis"]);
assert.deepEqual(allUp, { database: "up", redis: "up" });
assert.equal(isReady(allUp), true);

const dbDown = await checkDependencies({ database: down, redis: ok });
assert.deepEqual(dbDown, { database: "down", redis: "up" });
assert.equal(isReady(dbDown), false);
assert.equal(JSON.stringify(dbDown).includes("10.0.0.5"), false, "no host or error text in the readiness result");

// A missing REDIS_URL throws before any promise exists; that must still read as down.
const redisMissing = await checkDependencies({
  database: ok,
  redis: () => {
    throw new Error("missing_redis_url");
  },
});
assert.deepEqual(redisMissing, { database: "up", redis: "down" });

// 3. Readiness timeout: a hung dependency is down within the bound.
const hung: DependencyProbes = { database: () => new Promise(() => {}), redis: ok };
const started = Date.now();
const timedOut = await checkDependencies(hung, 50);
const elapsed = Date.now() - started;
assert.deepEqual(timedOut, { database: "down", redis: "up" });
assert.ok(elapsed < 1_000, `a hung probe must not hold the response (took ${elapsed} ms)`);

await assert.rejects(withTimeout(new Promise(() => {}), 20), /timeout/u);

// 4. Alerts only on failure, through a stubbed mailer.
type Db = MaintenanceDeps["db"];
const healthyDb = {
  $executeRaw: async () => 0,
  $queryRaw: async () => [{ count: 0n }],
} as unknown as Db;

const sent: EmailMessage[] = [];
const recordingAlert = async (message: EmailMessage): Promise<MailResult> => {
  sent.push(message);
  return { id: "email_test", ok: true, redirected: false };
};
const baseDeps = (overrides: Partial<MaintenanceDeps> = {}): MaintenanceDeps => ({
  alertTo: "owner@vecalss.test",
  db: healthyDb,
  now: new Date("2026-11-03T19:00:00Z"),
  probes: { database: ok, redis: ok },
  sendAlert: recordingAlert,
  ...overrides,
});

const healthy = await runDailyMaintenance(baseDeps());
assert.equal(healthy.ok, true);
assert.deepEqual(healthy.failures, []);
assert.equal(sent.length, 0, "a healthy run sends no email");
assert.ok(healthy.cleanup, "cleanup ran");
for (const table of SECURITY_LOG_TABLES) {
  assert.equal(healthy.cleanup?.[table].complete, true);
}

const brokenCleanupDb = {
  $executeRaw: async () => {
    throw new Error("relation login_attempts does not exist");
  },
  $queryRaw: async () => [{ count: 0n }],
} as unknown as Db;
const broken = await runDailyMaintenance(baseDeps({ db: brokenCleanupDb }));
assert.equal(broken.ok, false);
assert.deepEqual(broken.failures, ["security_log_cleanup"]);
assert.equal(sent.length, 1, "one failure sends one email");
assert.equal(sent[0]?.to, "owner@vecalss.test");
assert.equal(sent[0]?.idempotencyKey, "daily-maintenance:2026-11-03:security_log_cleanup");
assert.equal(sent[0]?.text.includes("relation login_attempts"), false, "the email carries no error text");
assert.equal(sent[0]?.text.includes("pembersihan log keamanan"), true);

const cappedCleanupDb = {
  $executeRaw: async () => CLEANUP_BATCH_SIZE,
  $queryRaw: async () => [{ count: 0n }],
} as unknown as Db;
const beforeCappedCleanup = sent.length;
const cappedCleanup = await runDailyMaintenance(baseDeps({ db: cappedCleanupDb }));
assert.equal(cappedCleanup.ok, false, "hitting the cleanup batch cap is a failure");
assert.deepEqual(cappedCleanup.failures, ["security_log_cleanup"]);
assert.ok(Object.values(cappedCleanup.cleanup ?? {}).every((table) => !table.complete));
assert.equal(sent.length, beforeCappedCleanup + 1, "the cap sends a cleanup alert");
assert.equal(sent.at(-1)?.idempotencyKey, "daily-maintenance:2026-11-03:security_log_cleanup");
const cappedAlert = sent.at(-1)?.text ?? "";
for (const table of SECURITY_LOG_TABLES) {
  assert.ok(cappedAlert.includes(table), `the cleanup alert names ${table}`);
  assert.ok(cappedAlert.includes(String(CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES)), `the cleanup alert includes the count for ${table}`);
}
assert.equal(cappedAlert.includes("relation"), false, "the cleanup alert contains no database error detail");

const beforeRedisDown = sent.length;
const redisDown = await runDailyMaintenance(baseDeps({ probes: { database: ok, redis: down } }));
assert.deepEqual(redisDown.failures, ["redis"]);
assert.equal(sent.length, beforeRedisDown + 1);

const beforeNoAddress = sent.length;
const noAddress = await runDailyMaintenance(baseDeps({ alertTo: null, probes: { database: down, redis: ok } }));
assert.equal(noAddress.ok, false, "a failure still reports not ok when no alert address is set");
assert.equal(sent.length, beforeNoAddress, "no address means no email");

const mailerDown = await runDailyMaintenance(
  baseDeps({
    probes: { database: down, redis: ok },
    sendAlert: async () => ({ ok: false, reason: "network" }),
  }),
);
assert.equal(mailerDown.ok, false, "a failed alert send does not hide the failure or throw");

// 4b. Payment conditions that need the owner (P-04). A transient failed lookup is quiet; an order unanswered
// since before the previous run, and a critical alert that could not be delivered, fail the run.
const paymentResult = (overrides: { deadCriticalAlerts?: number; persistentlyUnavailable?: number; unavailable?: number } = {}) =>
  async () => ({
    deadCriticalAlerts: overrides.deadCriticalAlerts ?? 0,
    exportPacketsPurged: 0,
    fulfillment: {},
    outbox: { dead: 0, done: 0, failed: 0 },
    reconciliation: {
      checked: 5,
      persistentlyUnavailable: overrides.persistentlyUnavailable ?? 0,
      resolved: 0,
      stillPending: 0,
      unavailable: overrides.unavailable ?? 0,
    },
    refunds: {},
  }) as never;

const sentBefore = sent.length;
const transient = await runDailyMaintenance(baseDeps({ payments: paymentResult({ unavailable: 4 }) }));
assert.equal(transient.ok, true, "transient retries stay quiet");
assert.deepEqual(transient.failures, []);
assert.equal(sent.length, sentBefore, "and send no email");
const handledQuietly = await handleDailyMaintenanceRequest(request(`Bearer ${SECRET}`), { run: async () => transient, secret: SECRET });
assert.equal(handledQuietly.status, 200);

const stuckReconciliation = await runDailyMaintenance(baseDeps({ payments: paymentResult({ persistentlyUnavailable: 2, unavailable: 2 }) }));
assert.equal(stuckReconciliation.ok, false);
assert.deepEqual(stuckReconciliation.failures, ["payment_reconciliation"]);
assert.equal(sent.length, sentBefore + 1, "one email for the condition");
assert.equal(sent.at(-1)?.idempotencyKey, "daily-maintenance:2026-11-03:payment_reconciliation");
assert.match(sent.at(-1)?.text ?? "", /pesanan yang belum terkonfirmasi penyedia/u);
assert.match(sent.at(-1)?.text ?? "", /lebih dari 24 jam/u);
const failingCron = await handleDailyMaintenanceRequest(request(`Bearer ${SECRET}`), { run: async () => stuckReconciliation, secret: SECRET });
assert.equal(failingCron.status, 500, "the cron answers with a failure");

const lostAlert = await runDailyMaintenance(baseDeps({ payments: paymentResult({ deadCriticalAlerts: 1 }) }));
assert.deepEqual(lostAlert.failures, ["payment_alert_dead"]);
assert.equal(lostAlert.ok, false);
assert.equal(sent.at(-1)?.idempotencyKey, "daily-maintenance:2026-11-03:payment_alert_dead");
assert.match(sent.at(-1)?.text ?? "", /peringatan pembayaran penting/u);
assert.equal(sent.at(-1)?.text.includes("exploded"), false);

// Both at once, with an unrelated failure: each payment condition is its own email with its own daily key,
// and the rest keeps the key it always had, so a retried run repeats the keys rather than the emails.
const sentMark = sent.length;
const everything = await runDailyMaintenance(baseDeps({
  db: brokenCleanupDb,
  payments: paymentResult({ deadCriticalAlerts: 1, persistentlyUnavailable: 1 }),
}));
assert.deepEqual(everything.failures, ["security_log_cleanup", "payment_reconciliation", "payment_alert_dead"]);
assert.deepEqual(
  sent.slice(sentMark).map((message) => message.idempotencyKey),
  [
    "daily-maintenance:2026-11-03:security_log_cleanup",
    "daily-maintenance:2026-11-03:payment_reconciliation",
    "daily-maintenance:2026-11-03:payment_alert_dead",
  ],
);
const repeatMark = sent.length;
await runDailyMaintenance(baseDeps({
  db: brokenCleanupDb,
  payments: paymentResult({ deadCriticalAlerts: 1, persistentlyUnavailable: 1 }),
}));
assert.deepEqual(
  sent.slice(repeatMark).map((message) => message.idempotencyKey),
  sent.slice(sentMark, repeatMark).map((message) => message.idempotencyKey),
  "a retried run asks for the same keys, so the mailer sends each once",
);

// A payment step that throws is still reported as before.
const throwing = await runDailyMaintenance(baseDeps({ payments: async () => { throw new Error("exploded"); } }));
assert.deepEqual(throwing.failures, ["payment_maintenance"]);

// 5. Batch cap: a full batch means more may remain; a short batch means done.
const batchesOf = (sizes: number[]) => {
  const queue = [...sizes];
  return {
    $executeRaw: async () => queue.shift() ?? 0,
    $queryRaw: async () => [{ count: 0n }],
  } as unknown as Db;
};
const capped = await purgeTable(batchesOf([2, 2, 2, 2]), "login_attempts", { batchSize: 2, maxBatches: 3 });
assert.deepEqual(capped, { complete: false, deleted: 6 });
const finishing = await purgeTable(batchesOf([2, 2, 1]), "login_attempts", { batchSize: 2, maxBatches: 3 });
assert.deepEqual(finishing, { complete: true, deleted: 5 });
assert.equal(CLEANUP_BATCH_SIZE > 0, true);

// 6. The SQL: retention is 90 days from database time, deletes by primary key
// in bounded batches, and never names audit_logs.
const statements: Array<{ sql: string; values: unknown[] }> = [];
const recordingDb = {
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    statements.push({ sql: strings.join("?"), values });
    return 0;
  },
  $queryRaw: async () => [{ count: 0n }],
} as unknown as Db;
await purgeSecurityLogs(recordingDb);
assert.equal(statements.length, SECURITY_LOG_TABLES.length);
assert.equal(SECURITY_LOG_RETENTION_DAYS, 90);
for (const statement of statements) {
  assert.equal(statement.sql.includes("audit_logs"), false, "cleanup must never touch audit_logs");
  assert.equal(statement.sql.includes("now()"), true, "cutoff comes from database time");
  assert.equal(statement.sql.includes("LIMIT"), true, "every delete is bounded");
  assert.equal(statement.values.includes(SECURITY_LOG_RETENTION_DAYS), true, "retention is 90 days");
}

// 8. The registration step (MS-21): unverified signups are cleaned up daily; an account that
// could not be removed is a failure the owner is told about; a crash in it stops nothing else.
{
  const alerts: EmailMessage[] = [];
  const base = (overrides: Partial<MaintenanceDeps>): MaintenanceDeps => ({
    alertTo: "owner@ptnpro.test",
    db: { $executeRaw: async () => 0, $queryRaw: async () => [{ count: 0n }] } as unknown as MaintenanceDeps["db"],
    now: new Date("2026-11-09T19:00:00Z"),
    probes: { database: ok, redis: ok },
    sendAlert: async (message) => {
      alerts.push(message);
      return { id: "email_test", ok: true, redirected: false } as MailResult;
    },
    ...overrides,
  });

  const clean = await runDailyMaintenance(base({ registration: async () => ({ complete: true, deleted: 3, failed: 0 }) }));
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.registration, { complete: true, deleted: 3, failed: 0 }, "the step's counts are in the result");
  assert.equal(alerts.length, 0, "deleting unverified signups is routine and sends nothing");

  const stuck = await runDailyMaintenance(base({ registration: async () => ({ complete: true, deleted: 1, failed: 2 }) }));
  assert.deepEqual(stuck.failures, ["registration_cleanup"], "an account that could not be removed is a failure");
  assert.equal(stuck.ok, false);
  assert.equal(alerts.length, 1, "and the owner is told");
  assert.match(alerts[0].text, /pembersihan pendaftaran yang belum diverifikasi/u);
  alerts.length = 0;

  const crashed = await runDailyMaintenance(base({
    payments: async () => ({ deadCriticalAlerts: 0 } as never),
    registration: async () => {
      throw new Error("relation users does not exist");
    },
  }));
  assert.deepEqual(crashed.failures, ["registration_cleanup"], "a crash in the step is a failure of that step only");
  assert.equal(crashed.registration, null);
  assert.equal(alerts[0]?.text.includes("relation users"), false, "the alert carries no error text");
  alerts.length = 0;

  const without = await runDailyMaintenance(base({}));
  assert.equal(without.registration, null, "a run given no registration step reports none");
  assert.equal(without.ok, true);

  const route = readFileSync("app/api/cron/daily-maintenance/route.ts", "utf8");
  assert.match(route, /registration: \(\) => cleanupUnverifiedSignups\(\)/u, "the cron route runs the cleanup");
  assert.ok((SECURITY_LOG_TABLES as readonly string[]).includes("registration_attempts"), "signup attempts are cleaned up with the other security logs");
  const response = await (await handleDailyMaintenanceRequest(
    new Request("https://app.example.test/api/cron/daily-maintenance", { headers: { authorization: `Bearer ${SECRET}` } }),
    { run: async () => ({ ...(await runStub()), registration: { complete: true, deleted: 1, failed: 0 } }), secret: SECRET },
  )).json();
  assert.deepEqual(response.registration, { complete: true, deleted: 1, failed: 0 }, "the cron answer carries the counts");
}

console.log("Daily maintenance checks passed.");
