import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RoleName } from "../generated/prisma/client";
import type { SessionContext } from "../lib/auth/types";
import { requireAdmin, requireOwner } from "../lib/fraud/authority";
import { closeCase } from "../lib/fraud/cases";
import { cancelRefund } from "../lib/refunds/cases";
import { reconcileRefund } from "../lib/refunds/execute";
import {
  deliver,
  failLeftoverOrders,
  makeBuyer,
  makeOrder,
  prisma,
  provider,
  runId,
  signedEventFor,
} from "./payment-test-kit";

/**
 * Shared fixtures for the refund and dispute suites: an owner and a second
 * admin who really exist in the local database, and orders that are truly paid
 * (the stand-in's own record is settled too, so a refund can be sent to it).
 */

const OWNER_EMAIL = `refund-owner-${runId}@vecalss.local`;
const ENV = { FRAUD_OWNER_EMAIL: OWNER_EMAIL };

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

async function setupAuthority() {
  const ownerId = await makeAdmin(OWNER_EMAIL);
  const otherEmail = `refund-admin-${runId}@vecalss.local`;
  const otherId = await makeAdmin(otherEmail);
  return {
    admin: requireAdmin(sessionFor(otherEmail, { id: otherId })),
    adminAsOwner: requireAdmin(sessionFor(OWNER_EMAIL, { id: ownerId })),
    otherEmail,
    otherId,
    owner: requireOwner(sessionFor(OWNER_EMAIL, { id: ownerId }), ENV),
    ownerId,
    sessionFor,
  };
}

/** An order that was paid through the stand-in: the order is paid and the stand-in has captured the money. */
async function paidOrder(options: Parameters<typeof makeOrder>[0] = {}) {
  const order = await makeOrder(options);
  const settled = await provider.settle(order.reference, "succeeded", new Date());
  assert.ok(settled, "the stand-in settled the payment");
  const received = await deliver(settled);
  assert.ok(received.status === "received" && received.result.status === "processed" && received.result.outcome === "accepted");
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
}

/** An order whose payment arrived after a confirmed failure: held in review, nothing granted. */
async function reviewOrder() {
  const order = await makeOrder();
  await deliver(signedEventFor(order, "payment.failed"));
  const late = await deliver(signedEventFor(order, "payment.succeeded"));
  assert.ok(late.status === "received" && late.result.status === "processed" && late.result.outcome === "review");
  const held = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(held.status, "review");
  return held;
}

async function withTriggersOff<T>(table: string, work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    const value = await work(tx);
    await tx.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    return value;
  });
}

async function refundCase(caseId: string) {
  return prisma.refundCase.findUniqueOrThrow({ where: { id: caseId } });
}

/**
 * Fails this run's unpaid orders and closes the outbox jobs its orders queued
 * (receipt emails, alerts). The suites never drain the outbox themselves, and a
 * backlog of them would crowd the daily-maintenance suite, which drains only the
 * first few batches. Only this run's buyers are touched.
 */
async function cleanUp() {
  await failLeftoverOrders();
  await prisma.$executeRaw`
    UPDATE payment_outbox SET status = 'done', completed_at = now()
    WHERE status = 'pending'
      AND order_id IN (
        SELECT o.id FROM payment_orders o JOIN users u ON u.id = o.buyer_id
        WHERE u.email LIKE ${`pay-%-${runId}@vecalss.local`}
      )
  `;
}

const CLEANUP_REASON = "Pengujian selesai, kasus ini ditutup agar tidak tertinggal di database lokal.";

/**
 * Settles every refund and every `refund_stalled` case this run left open, so a
 * run that ends halfway (or ends well) leaves nothing for later runs to step
 * around, and the daily scans never have to find this run's rows among old ones.
 * Prepared and approved refunds are cancelled by the owner. A refund with the
 * provider is settled there and reconciled. Then the late-refund cases are
 * closed, last, so a refund that is still open cannot raise a new one. Everything
 * goes through the same guarded paths the product uses, and only this run's
 * buyers are touched. A step that fails does not stop the others; the failures
 * are thrown together at the end.
 */
async function settleRunRefunds() {
  const [owner = null] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE email = ${OWNER_EMAIL}`;
  if (!owner) return; // the run stopped before it had an owner, so it opened no refund
  const authority = requireOwner(sessionFor(OWNER_EMAIL, { id: owner.id }), ENV);
  const buyers = `pay-%-${runId}@vecalss.local`;
  const problems: string[] = [];
  const attempt = async (what: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      problems.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const open = await prisma.$queryRaw<Array<{ id: string; state: string; version: number }>>`
    SELECT c.id, c.state::text AS state, c.version FROM refund_cases c
    JOIN payment_orders o ON o.id = c.order_id JOIN users u ON u.id = o.buyer_id
    WHERE u.email LIKE ${buyers} AND c.state IN ('prepared', 'approved', 'processing')
  `;
  for (const item of open) {
    if (item.state === "processing") {
      await attempt(`settle refund ${item.id}`, async () => {
        const [{ reference }] = await prisma.$queryRaw<Array<{ reference: string }>>`SELECT reference FROM refund_cases WHERE id = ${item.id}::uuid`;
        await provider.settleRefund(reference, "succeeded", new Date());
        const outcome = await reconcileRefund(item.id, { provider });
        assert.equal(outcome.result, "completed", "the provider's answer settles the refund");
      });
    } else {
      await attempt(`cancel refund ${item.id}`, () =>
        cancelRefund(authority, { caseId: item.id, expectedVersion: item.version, reason: CLEANUP_REASON }, ENV),
      );
    }
  }

  const cases = await prisma.$queryRaw<Array<{ id: string; version: number }>>`
    SELECT f.id, f.version FROM fraud_cases f
    JOIN refund_cases c ON f.subject_key = 'refund:' || c.id::text
    JOIN payment_orders o ON o.id = c.order_id JOIN users u ON u.id = o.buyer_id
    WHERE f.signal = 'refund_stalled' AND f.state <> 'closed' AND u.email LIKE ${buyers}
  `;
  for (const item of cases) {
    await attempt(`close case ${item.id}`, () =>
      closeCase(authority, { caseId: item.id, closureReason: "no_action_needed", expectedVersion: item.version, reason: CLEANUP_REASON }),
    );
  }

  if (problems.length) throw new Error(`Could not settle this run's refunds:\n${problems.join("\n")}`);
}

const FULL_REASON = "Pembeli meminta uang kembali lewat WhatsApp dan buktinya sudah dicek.";

export {
  ENV,
  FULL_REASON,
  OWNER_EMAIL,
  cleanUp,
  makeBuyer,
  makeOrder,
  paidOrder,
  prisma,
  provider,
  refundCase,
  reviewOrder,
  runId,
  sessionFor,
  settleRunRefunds,
  setupAuthority,
  signedEventFor,
  withTriggersOff,
};
