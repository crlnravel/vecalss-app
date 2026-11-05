import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import type { EmailMessage, MailResult } from "../lib/email/mailer";
import { runDailyMaintenance } from "../lib/maintenance/daily";
import {
  claimOutboxJobs,
  completeOutboxJob,
  countRecentDeadCriticalAlerts,
  drainOutbox,
  enqueueOutbox,
  reapExhaustedOutboxJobs,
  type OutboxHandlers,
} from "../lib/payments/outbox";
import { createPaymentOutboxHandlers, describeReason } from "../lib/payments/outbox-handlers";
import { runPaymentMaintenance } from "../lib/payments/maintenance";
import { deliver, makeOrder, prisma, provider, signedEventFor } from "./payment-test-kit";

/**
 * The payment outbox: leases, retries with backoff, dead jobs, the alert and
 * receipt handlers, and the idempotent step in the daily maintenance job.
 */

const prefix = `suite-${randomUUID().slice(0, 8)}:`;
const filter = { dedupeKeyPrefix: prefix };
let counter = 0;

async function job(overrides: { maxAttempts?: number; payload?: Record<string, unknown>; kind?: "critical_alert" | "receipt_email"; orderId?: string } = {}) {
  counter += 1;
  const dedupeKey = `${prefix}${counter}`;
  await enqueueOutbox(prisma, {
    dedupeKey,
    kind: overrides.kind ?? "critical_alert",
    orderId: overrides.orderId ?? null,
    payload: overrides.payload ?? {},
  });
  if (overrides.maxAttempts) {
    await prisma.$executeRaw`UPDATE payment_outbox SET max_attempts = ${overrides.maxAttempts} WHERE dedupe_key = ${dedupeKey}`;
  }
  return prisma.paymentOutbox.findUniqueOrThrow({ where: { dedupeKey } });
}

const reload = (id: string) => prisma.paymentOutbox.findUniqueOrThrow({ where: { id } });
const secondsUntilNextRun = async (id: string) => {
  const [row] = await prisma.$queryRaw<Array<{ seconds: number }>>`
    SELECT extract(epoch FROM (next_run_at - now())) AS seconds FROM payment_outbox WHERE id = ${id}::uuid`;
  return Number(row.seconds);
};
const makeDue = (id: string) => prisma.$executeRaw`UPDATE payment_outbox SET next_run_at = now() - interval '1 second' WHERE id = ${id}::uuid`;

const noop: OutboxHandlers = { access_grant: async () => {}, critical_alert: async () => {}, receipt_email: async () => {} };

async function main() {
  // ---- Queueing is idempotent per business fact ---------------------------------
  {
    const first = await job();
    await enqueueOutbox(prisma, { dedupeKey: first.dedupeKey, kind: "critical_alert" });
    await enqueueOutbox(prisma, { dedupeKey: first.dedupeKey, kind: "receipt_email" });
    assert.equal(await prisma.paymentOutbox.count({ where: { dedupeKey: first.dedupeKey } }), 1);
    assert.equal(first.status, "pending");
    assert.equal(first.attempts, 0);
    await drainOutbox(noop, { filter });
  }

  // ---- Leases: one worker per job, a dead worker's job comes back --------------------
  {
    const jobs = await Promise.all(Array.from({ length: 6 }, () => job()));
    const ids = new Set(jobs.map((item) => item.id));
    const [a, b] = await Promise.all([
      claimOutboxJobs(prisma, "worker-a", 4, filter),
      claimOutboxJobs(prisma, "worker-b", 4, filter),
    ]);
    const claimed = [...a, ...b].map((item) => item.id);
    assert.equal(new Set(claimed).size, claimed.length, "no job is claimed by two workers");
    assert.equal(claimed.length, 6, "together they take every due job");
    assert.ok(claimed.every((id) => ids.has(id)));
    assert.ok([...a, ...b].every((item) => item.attempts === 1), "the claim counts as an attempt");

    // While the leases are live, nobody else can take them.
    assert.deepEqual(await claimOutboxJobs(prisma, "worker-c", 10, filter), []);

    // A worker that vanished: once its lease has run out, another takes over and the attempt is spent.
    const abandoned = a[0];
    await prisma.$executeRaw`UPDATE payment_outbox SET leased_until = now() - interval '1 second' WHERE id = ${abandoned.id}::uuid`;
    const takeover = await claimOutboxJobs(prisma, "worker-c", 10, filter);
    assert.deepEqual(takeover.map((item) => item.id), [abandoned.id]);
    assert.equal(takeover[0].attempts, 2);
    assert.equal((await reload(abandoned.id)).leaseOwner, "worker-c");

    // The old holder can no longer finish it.
    await completeOutboxJob(prisma, abandoned.id, "worker-a");
    assert.equal((await reload(abandoned.id)).status, "pending");
    await completeOutboxJob(prisma, abandoned.id, "worker-c");
    assert.equal((await reload(abandoned.id)).status, "done");

    for (const item of [...a, ...b]) {
      if (item.id !== abandoned.id) await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id = ${item.id}::uuid`;
    }
  }

  // ---- Retry with backoff, and a job that gives up ---------------------------------------
  {
    const item = await job();
    let calls = 0;
    const failing: OutboxHandlers = {
      ...noop,
      critical_alert: async () => {
        calls += 1;
        throw new Error("mail server unreachable");
      },
    };
    assert.deepEqual(await drainOutbox(failing, { filter }), { dead: 0, done: 0, failed: 1 });
    let state = await reload(item.id);
    assert.equal(state.status, "pending");
    assert.equal(state.attempts, 1);
    assert.equal(state.lastError, "mail server unreachable");
    assert.equal(state.leaseOwner, null);
    const first = await secondsUntilNextRun(item.id);
    assert.ok(first > 50 && first <= 60, `first retry in about a minute (${first}s)`);

    // Not due yet: a drain right now does nothing.
    assert.deepEqual(await drainOutbox(failing, { filter }), { dead: 0, done: 0, failed: 0 });
    assert.equal(calls, 1);

    await makeDue(item.id);
    await drainOutbox(failing, { filter });
    state = await reload(item.id);
    assert.equal(state.attempts, 2);
    const second = await secondsUntilNextRun(item.id);
    assert.ok(second > 110 && second <= 120, `then two minutes (${second}s)`);

    // Eventually it works, once, and is never run again.
    await makeDue(item.id);
    let sent = 0;
    const recovered: OutboxHandlers = { ...noop, critical_alert: async () => { sent += 1; } };
    assert.deepEqual(await drainOutbox(recovered, { filter }), { dead: 0, done: 1, failed: 0 });
    state = await reload(item.id);
    assert.equal(state.status, "done");
    assert.equal(state.lastError, null);
    assert.ok(state.completedAt);
    assert.deepEqual(await drainOutbox(recovered, { filter }), { dead: 0, done: 0, failed: 0 });
    assert.equal(sent, 1);
  }
  {
    const item = await job({ maxAttempts: 2 });
    const failing: OutboxHandlers = { ...noop, critical_alert: async () => { throw new Error("still down"); } };
    await drainOutbox(failing, { filter });
    await makeDue(item.id);
    assert.deepEqual(await drainOutbox(failing, { filter }), { dead: 1, done: 0, failed: 0 });
    const state = await reload(item.id);
    assert.equal(state.status, "dead", "parked after its last attempt");
    assert.equal(state.lastError, "still down");
    await makeDue(item.id);
    assert.deepEqual(await drainOutbox(failing, { filter }), { dead: 0, done: 0, failed: 0 }, "a dead job is not retried");

    // One failing job does not hold up the rest of the batch.
    const bad = await job({ payload: { bad: true } });
    const good = await job();
    const mixed: OutboxHandlers = {
      ...noop,
      critical_alert: async (queued) => {
        if (queued.payload.bad) throw new Error("boom");
      },
    };
    assert.deepEqual(await drainOutbox(mixed, { filter }), { dead: 0, done: 1, failed: 1 });
    assert.equal((await reload(good.id)).status, "done");
    assert.equal((await reload(bad.id)).status, "pending");
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id = ${bad.id}::uuid`;
  }

  // ---- A worker that dies on its last attempt cannot run the job past its limit (P-06) --------
  {
    const throwing: OutboxHandlers = { ...noop, critical_alert: async () => { throw new Error("poison"); } };
    const handled: string[] = [];
    const counting: OutboxHandlers = { ...noop, critical_alert: async (queued) => { handled.push(queued.id); } };

    // The normal path still works as before: dead after its last thrown attempt, never claimed again.
    const thrown = await job({ maxAttempts: 2 });
    await drainOutbox(throwing, { filter });
    await makeDue(thrown.id);
    assert.deepEqual(await drainOutbox(throwing, { filter }), { dead: 1, done: 0, failed: 0 });
    await makeDue(thrown.id);
    assert.deepEqual(await drainOutbox(counting, { filter }), { dead: 0, done: 0, failed: 0 });
    assert.equal((await reload(thrown.id)).attempts, 2, "a dead job's attempts never grow");
    assert.equal(handled.includes(thrown.id), false);

    // A crash after the last lease: the final attempt is spent, no result is ever recorded,
    // and the lease runs out. The next claim parks the job instead of running it a third time.
    const crashed = await job({ maxAttempts: 2 });
    await prisma.$executeRaw`UPDATE payment_outbox SET attempts = 1 WHERE id = ${crashed.id}::uuid`;
    const lastLease = await claimOutboxJobs(prisma, "worker-that-dies", 20, filter);
    assert.deepEqual(lastLease.map((item) => [item.id, item.attempts]), [[crashed.id, 2]], "the last allowed attempt is leased");
    // Still leased: nobody else may take it, and it is not parked while a worker may be running it.
    assert.deepEqual(await claimOutboxJobs(prisma, "other-worker", 20, filter), []);
    assert.equal((await reload(crashed.id)).status, "pending");

    await prisma.$executeRaw`UPDATE payment_outbox SET leased_until = now() - interval '1 second' WHERE id = ${crashed.id}::uuid`;
    assert.deepEqual(await claimOutboxJobs(prisma, "other-worker", 20, filter), [], "an exhausted job is not claimed again");
    assert.deepEqual(await drainOutbox(counting, { filter }), { dead: 0, done: 0, failed: 0 });
    const parked = await reload(crashed.id);
    assert.equal(parked.status, "dead");
    assert.equal(parked.attempts, 2, "never past max_attempts");
    assert.equal(parked.leaseOwner, null);
    assert.match(parked.lastError ?? "", /last allowed attempt/u);
    assert.equal(handled.includes(crashed.id), false, "its handler never ran a third time");

    // A job that still has attempts left is reclaimed as before.
    const survivor = await job({ maxAttempts: 3 });
    await claimOutboxJobs(prisma, "worker-that-dies", 20, filter);
    await prisma.$executeRaw`UPDATE payment_outbox SET leased_until = now() - interval '1 second' WHERE id = ${survivor.id}::uuid`;
    const reclaimed = await claimOutboxJobs(prisma, "other-worker", 20, filter);
    assert.deepEqual(reclaimed.map((item) => [item.id, item.attempts]), [[survivor.id, 2]]);
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id = ${survivor.id}::uuid`;

    // Dead critical alerts are what the daily job reports (P-04): recent ones only, and only that kind.
    const baseline = await countRecentDeadCriticalAlerts(prisma);
    assert.ok(baseline >= 2, "the two parked above are counted");
    const deadReceipt = await job({ kind: "receipt_email" });
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'dead' WHERE id = ${deadReceipt.id}::uuid`;
    assert.equal(await countRecentDeadCriticalAlerts(prisma), baseline, "a dead receipt is not a lost alert");
    const old = await job();
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'dead', created_at = now() - interval '10 days', dead_at = now() - interval '10 days' WHERE id = ${old.id}::uuid`;
    assert.equal(await countRecentDeadCriticalAlerts(prisma), baseline, "an old one has been reported already");

    const lateDeath = await job({ maxAttempts: 1 });
    await prisma.$executeRaw`UPDATE payment_outbox SET attempts = 1, created_at = now() - interval '4 days', leased_until = NULL WHERE id = ${lateDeath.id}::uuid`;
    assert.equal(await countRecentDeadCriticalAlerts(prisma), baseline, "an old pending job is not reported before it dies");
    await reapExhaustedOutboxJobs(prisma, filter);
    const deadLateDeath = await reload(lateDeath.id);
    assert.equal(deadLateDeath.status, "dead");
    assert.ok(deadLateDeath.deadAt, "the dead transition is timestamped");
    assert.equal(await countRecentDeadCriticalAlerts(prisma), baseline + 1, "a critical alert that dies after three days is reported from its death time");
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id IN (${deadReceipt.id}::uuid, ${old.id}::uuid)`;
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id = ${lateDeath.id}::uuid`;
  }

  // ---- Handlers -----------------------------------------------------------------------------
  {
    const sent: EmailMessage[] = [];
    let result: MailResult = { id: "m1", ok: true, redirected: false };
    const handlers = createPaymentOutboxHandlers({
      alertTo: "owner@vecalss.test",
      sendEmail: async (message) => {
        sent.push(message);
        return result;
      },
    });

    // A real mismatch becomes a real alert.
    const order = await makeOrder();
    await deliver(signedEventFor(order, "payment.succeeded", { amountRupiah: 1_000, buyerId: "someone" }));
    const alert = await prisma.paymentOutbox.findFirstOrThrow({ where: { kind: "critical_alert", orderId: order.id } });

    result = { ok: false, reason: "network" };
    const outcome = await drainOutbox(handlers, { filter: { dedupeKeyPrefix: alert.dedupeKey } });
    assert.deepEqual(outcome, { dead: 0, done: 0, failed: 1 });
    assert.match((await reload(alert.id)).lastError ?? "", /not sent \(network\)/u);
    await makeDue(alert.id);
    result = { id: "m2", ok: true, redirected: false };
    assert.deepEqual(await drainOutbox(handlers, { filter: { dedupeKeyPrefix: alert.dedupeKey } }), { dead: 0, done: 1, failed: 0 });
    assert.equal(sent.length, 2);
    assert.equal(sent[0].idempotencyKey, `payment-outbox:${alert.id}`);
    assert.equal(sent[1].idempotencyKey, sent[0].idempotencyKey, "a retried send is the same message to the mailer");
    assert.equal(sent[1].to, "owner@vecalss.test");
    assert.match(sent[1].subject, /pembayaran perlu diperiksa/u);
    assert.match(sent[1].text, new RegExp(order.id, "u"));
    assert.match(sent[1].text, /nominal, pembeli/u);
    assert.doesNotMatch(sent[1].text, /sip_|secret|buyer_id/iu, "no internals in the email");

    // No address configured: the job waits and retries instead of vanishing.
    const noAddress = createPaymentOutboxHandlers({ alertTo: null, sendEmail: async () => result });
    const stuck = await job();
    assert.deepEqual(await drainOutbox(noAddress, { filter }), { dead: 0, done: 0, failed: 1 });
    assert.match((await reload(stuck.id)).lastError ?? "", /No alert address/u);
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id = ${stuck.id}::uuid`;

    assert.equal(describeReason("amount,buyer"), "nominal, pembeli");
    assert.equal(describeReason("late_success_after_expired"), "late success after expired");
    assert.equal(describeReason(null), "alasan tidak tercatat");

    // The receipt email is real now: it sends once for a delivered order and refuses an order with no receipt.
    const paid = await makeOrder();
    await deliver(signedEventFor(paid, "payment.succeeded"));
    const receipt = await prisma.paymentOutbox.findFirstOrThrow({ where: { kind: "receipt_email", orderId: paid.id } });
    assert.deepEqual(
      await drainOutbox(handlers, { filter: { dedupeKeyPrefix: receipt.dedupeKey } }),
      { dead: 0, done: 1, failed: 0 },
    );
    assert.equal(sent.length, 3, "the receipt email went out");
    assert.match(sent[2].subject, /Struk pembelian Vecalss VCL-/u);
    const unpaid = await makeOrder();
    const premature = await job({ kind: "receipt_email", orderId: unpaid.id });
    assert.deepEqual(await drainOutbox(handlers, { filter }), { dead: 0, done: 0, failed: 1 });
    assert.match((await reload(premature.id)).lastError ?? "", /no receipt/u);
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE id = ${premature.id}::uuid`;
  }

  // ---- The daily maintenance job drains the outbox, and is safe to repeat -------------------
  {
    // The checks above park alerts on purpose, and earlier runs or other branches' versions of this suite
    // may have left dead ones in the shared database. They are all disposable test data: settle them here
    // so the daily run below is judged on the fixtures this run creates, not on leftovers.
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE kind = 'critical_alert' AND status = 'dead'`;

    const order = await makeOrder();
    await deliver(signedEventFor(order, "payment.succeeded"));
    const receipt = await prisma.paymentOutbox.findFirstOrThrow({ where: { kind: "receipt_email", orderId: order.id } });
    assert.equal(receipt.status, "pending");

    const handled: string[] = [];
    const handlers: OutboxHandlers = {
      access_grant: async () => {},
      critical_alert: async () => {},
      receipt_email: async (queued) => {
        handled.push(queued.id);
      },
    };
    const emails: EmailMessage[] = [];
    const fakeDb = { $executeRaw: async () => 0, $queryRaw: async () => [{ count: 0n }] } as unknown as Parameters<typeof runDailyMaintenance>[0]["db"];
    const ok = async () => {};
    const run = (payments?: () => ReturnType<typeof runPaymentMaintenance>) =>
      runDailyMaintenance({
        alertTo: "owner@vecalss.test",
        db: fakeDb,
        now: new Date("2026-11-04T19:00:00Z"),
        payments,
        probes: { database: ok, redis: ok },
        sendAlert: async (message) => {
          emails.push(message);
          return { id: "x", ok: true, redirected: false };
        },
      });

    const first = await run(() => runPaymentMaintenance({ handlers, provider }));
    assert.equal(first.ok, true);
    assert.ok(first.payments && first.payments.outbox.done >= 1);
    assert.ok(handled.includes(receipt.id), "the daily job delivered the waiting receipt job");
    assert.equal((await reload(receipt.id)).status, "done");

    const before = handled.length;
    const second = await run(() => runPaymentMaintenance({ handlers, provider }));
    assert.equal(second.ok, true);
    assert.equal(handled.length, before, "a second run finds nothing left to do");
    assert.equal(emails.length, 0, "a healthy run sends no email");

    // Without a configured provider the outbox still drains and reconciliation is skipped.
    const noProvider = await runPaymentMaintenance({ handlers, provider: null });
    assert.equal(noProvider.reconciliation, null);

    // A broken payment step is reported without hiding the rest of the run.
    const broken = await run(async () => {
      throw new Error("database exploded");
    });
    assert.equal(broken.ok, false);
    assert.deepEqual(broken.failures, ["payment_maintenance"]);
    assert.equal(emails.length, 1);
    assert.match(emails[0].text, /pemeriksaan dan antrean pembayaran/u);
    assert.doesNotMatch(emails[0].text, /exploded/u, "no error text in the email");

    // Runs that are given no payment step behave as before.
    const plain = await run();
    assert.equal(plain.payments, null);
  }

  console.log("Payment outbox checks passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Alerts this suite parks on purpose are test data: settle them so a later run, or any suite that
    // runs the daily job's payment step, never finds a dead critical alert left behind.
    await prisma.$executeRaw`UPDATE payment_outbox SET status = 'done' WHERE kind = 'critical_alert' AND status = 'dead' AND dedupe_key LIKE ${prefix} || '%'`;
    await prisma.$disconnect();
  });
