import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RoleName } from "../generated/prisma/client";
import type { SessionContext } from "../lib/auth/types";
import { requireAdmin, requireOwner } from "../lib/fraud/authority";
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

const FULL_REASON = "Pembeli meminta uang kembali lewat WhatsApp dan buktinya sudah dicek.";

export {
  ENV,
  FULL_REASON,
  OWNER_EMAIL,
  failLeftoverOrders,
  makeBuyer,
  makeOrder,
  paidOrder,
  prisma,
  provider,
  refundCase,
  reviewOrder,
  runId,
  sessionFor,
  setupAuthority,
  signedEventFor,
  withTriggersOff,
};
