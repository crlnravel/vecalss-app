import "server-only";

import { randomBytes } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { assertStillOwner } from "@/lib/disputes/export";
import { requireReason, type AdminContext, type OwnerContext } from "@/lib/fraud/authority";
import { addWorkingDays } from "@/lib/fraud/appeals";
import { writePaymentAudit } from "@/lib/payments/audit";
import { prisma } from "@/lib/prisma";

import { getCapturedPayment } from "./balance";
import {
  isRefundReasonCode,
  isRequestChannel,
  MAX_REQUEST_NOTE_LENGTH,
  MIN_NOTE_LENGTH,
  REFUND_DECISION_WORKING_DAYS,
  REFUND_REASONS,
} from "./constants";
import { databaseNow, insertRefundEvent, lockRefundCase } from "./core";
import { endRefundCase } from "./effects";
import { evaluateEligibility } from "./eligibility";
import { RefundError } from "./errors";

type Env = Partial<Record<string, string | undefined>>;

type PrepareInput = {
  /** Defaults to what is left of the payment. */
  amountRupiah?: number | null;
  orderId: string;
  /** Which captured payment. Defaults to the order's own payment. */
  providerPaymentId?: string | null;
  reasonCode: string;
  requestChannel: string;
  /** When the buyer's request arrived. Defaults to now; never in the future. */
  requestedAt?: Date | null;
  requestNote: string;
};

/** Turns a database refusal of a guarded step into the plain error the interface understands. */
function translateDatabaseRefusal(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("dispute is open")) throw new RefundError("dispute_open", "A dispute is open on the payment.");
  if (message.includes("more than the captured")) throw new RefundError("balance_exceeded", "Refunds would exceed the captured payment.");
  if (message.includes("fails the eligibility check")) throw new RefundError("ineligible", "The refund is not eligible.");
  throw error;
}

async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError || (error instanceof Error && error.name.includes("Prisma"))) translateDatabaseRefusal(error);
    throw error;
  }
}

/**
 * Prepares a refund case for a captured payment. Any admin with a verified
 * second factor may do this; it reserves nothing and pays nothing. The system
 * writes the eligibility check into the case: nothing the preparer types can
 * make a change-of-mind refund eligible.
 */
async function prepareRefund(admin: AdminContext, input: PrepareInput) {
  if (!isRefundReasonCode(input.reasonCode)) throw new RefundError("invalid_input", "Pilih alasan pengembalian dana.");
  if (!isRequestChannel(input.requestChannel)) throw new RefundError("invalid_input", "Pilih lewat mana permintaan masuk.");
  const requestNote = typeof input.requestNote === "string" ? input.requestNote.trim() : "";
  if (requestNote.length < MIN_NOTE_LENGTH || requestNote.length > MAX_REQUEST_NOTE_LENGTH) {
    throw new RefundError("invalid_input", `Tulis ringkasan permintaan pembeli (${MIN_NOTE_LENGTH} sampai ${MAX_REQUEST_NOTE_LENGTH} karakter).`);
  }
  if (!/^[0-9a-f-]{36}$/iu.test(input.orderId)) throw new RefundError("not_found", "The order was not found.");
  const reasonCode = input.reasonCode;
  const reason = REFUND_REASONS[reasonCode];

  return guarded(() => prisma.$transaction(async (tx) => {
    const [order = null] = await tx.$queryRaw<Array<{ buyerId: string; createdAt: Date; currency: string; providerReference: string | null; status: string }>>`
      SELECT buyer_id AS "buyerId", created_at AS "createdAt", currency, provider_reference AS "providerReference", status::text AS status
      FROM payment_orders WHERE id = ${input.orderId}::uuid FOR UPDATE
    `;
    if (!order) throw new RefundError("not_found", "The order was not found.");
    if (order.status !== "paid" && order.status !== "review") throw new RefundError("not_refundable", "The order has no captured payment.");

    const paymentId = input.providerPaymentId?.trim() || order.providerReference;
    const payment = paymentId ? await getCapturedPayment(tx, input.orderId, paymentId) : null;
    if (!payment) throw new RefundError("not_refundable", "The order has no captured payment.");

    if (payment.remainingRupiah <= 0) throw new RefundError("balance_exceeded", "Nothing is left of the payment to refund.");
    const amount = input.amountRupiah ?? payment.remainingRupiah;
    if (!Number.isInteger(amount) || amount <= 0) throw new RefundError("invalid_input", "Jumlah pengembalian harus bilangan rupiah bulat lebih dari nol.");
    if (amount > payment.remainingRupiah) throw new RefundError("balance_exceeded", "More than what is left of the payment.");

    const now = await databaseNow(tx);
    const requestedAt = input.requestedAt ?? now;
    if (Number.isNaN(requestedAt.getTime()) || requestedAt.getTime() > now.getTime()) {
      throw new RefundError("invalid_input", "Tanggal permintaan pembeli tidak boleh di masa depan.");
    }
    if (requestedAt.getTime() < order.createdAt.getTime()) {
      throw new RefundError("invalid_input", "Tanggal permintaan pembeli tidak boleh sebelum pesanan dibuat.");
    }

    const eligibility = await evaluateEligibility(tx, { asOf: requestedAt, orderId: input.orderId, reasonCode });
    const decisionDueAt = addWorkingDays(requestedAt, REFUND_DECISION_WORKING_DAYS);
    const reference = `rf_${randomBytes(12).toString("hex")}`;

    const [created] = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO refund_cases (
        reference, order_id, buyer_id, provider_payment_id, reason_category, reason_code, request_note,
        request_channel, requested_at, amount_rupiah, currency, prepared_by_user_id, decision_due_at, eligibility_prepared
      )
      VALUES (
        ${reference}, ${input.orderId}::uuid, ${order.buyerId}::uuid, ${payment.providerPaymentId},
        ${reason.category}::refund_reason_category, ${reasonCode}, ${requestNote},
        ${input.requestChannel}, ${requestedAt}, ${amount}, ${order.currency}, ${admin.userId}::uuid,
        ${decisionDueAt}, ${JSON.stringify(eligibility)}::jsonb
      )
      RETURNING id
    `;
    await insertRefundEvent(tx, {
      actor: { kind: "admin", userId: admin.userId },
      caseId: created.id,
      caseVersion: 1,
      kind: "prepared",
      metadata: { amountRupiah: amount, eligible: eligibility.eligible, reasonCode },
      note: requestNote,
    });
    await writePaymentAudit(tx, {
      action: "refund.prepared",
      actorUserId: admin.userId,
      metadata: { amountRupiah: amount, caseId: created.id, eligible: eligibility.eligible, reasonCode },
      targetId: input.orderId,
      targetType: "payment_order",
    });

    return { caseId: created.id, eligibility, reference };
  }));
}

type ApproveInput = { caseId: string; expectedVersion: number; reason: string; revokeAccess?: boolean };

/**
 * The owner approves a prepared case, with a written reason. This is the
 * moment the refundable balance is reserved, under the order lock, so two
 * approvals can never add up to more than the capture. The eligibility check
 * is run again here; a change-of-mind case that fails it is refused, and the
 * database refuses it too. An owner who prepared the case approves it as
 * self-approved, and that is recorded.
 */
async function approveRefund(owner: OwnerContext, input: ApproveInput, env: Env = process.env) {
  const reason = requireReason(input.reason);

  return guarded(() => prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, env);
    const row = await lockRefundCase(tx, input.caseId, input.expectedVersion);
    if (row.state !== "prepared") throw new RefundError("wrong_state", "Only a prepared refund can be approved.");

    const reasonCode = row.reasonCode;
    if (!isRefundReasonCode(reasonCode)) throw new RefundError("invalid_input", "The refund reason is not recognised.");
    const eligibility = await evaluateEligibility(tx, { asOf: row.requestedAt, orderId: row.orderId, reasonCode });
    if (!eligibility.eligible) throw new RefundError("ineligible", "The refund fails the eligibility check.");

    const [dispute = null] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payment_disputes
      WHERE order_id = ${row.orderId}::uuid AND provider_payment_id = ${row.providerPaymentId} AND state = 'open'
      LIMIT 1
    `;
    if (dispute) throw new RefundError("dispute_open", "A dispute is open on the payment.");

    const payment = await getCapturedPayment(tx, row.orderId, row.providerPaymentId);
    if (!payment || row.amountRupiah > payment.remainingRupiah) {
      throw new RefundError("balance_exceeded", "More than what is left of the payment.");
    }

    const selfApproved = row.preparedByUserId === owner.userId;
    const nextVersion = row.version + 1;
    const eventId = await insertRefundEvent(tx, {
      actor: { kind: "owner", userId: owner.userId },
      caseId: row.id,
      caseVersion: nextVersion,
      kind: "approved",
      metadata: { amountRupiah: row.amountRupiah, eligible: eligibility.eligible, revokeAccess: input.revokeAccess === true, selfApproved },
      note: reason,
    });
    await tx.$executeRaw`
      UPDATE refund_cases
      SET state = 'approved', version = ${nextVersion}, last_event_id = ${eventId}::uuid,
          approved_by_user_id = ${owner.userId}::uuid, approved_at = now(), approval_reason = ${reason},
          self_approved = ${selfApproved}, eligibility_approved = ${JSON.stringify(eligibility)}::jsonb,
          payout_due_at = now() + interval '14 days', revoke_access = ${input.revokeAccess === true}, updated_at = now()
      WHERE id = ${row.id}::uuid
    `;
    await writePaymentAudit(tx, {
      action: "refund.approved",
      actorUserId: owner.userId,
      metadata: { amountRupiah: row.amountRupiah, caseId: row.id, selfApproved },
      targetId: row.orderId,
      targetType: "payment_order",
    });

    return { selfApproved, version: nextVersion };
  }));
}

type EndInput = { caseId: string; expectedVersion: number; reason: string };

/** The owner turns a prepared request down. The reason goes to the case. */
async function rejectRefund(owner: OwnerContext, input: EndInput, env: Env = process.env) {
  const reason = requireReason(input.reason);

  return prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, env);
    const row = await lockRefundCase(tx, input.caseId, input.expectedVersion);
    if (row.state !== "prepared") throw new RefundError("wrong_state", "Only a prepared refund can be rejected.");
    await endRefundCase(tx, row, "rejected", { kind: "owner", userId: owner.userId }, reason);
  });
}

/** The owner cancels a case that has not gone to the provider yet. An approved case gives its balance back. */
async function cancelRefund(owner: OwnerContext, input: EndInput, env: Env = process.env) {
  const reason = requireReason(input.reason);

  return prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, env);
    const row = await lockRefundCase(tx, input.caseId, input.expectedVersion);
    if (row.state !== "prepared" && row.state !== "approved") {
      throw new RefundError("wrong_state", "A refund already with the provider cannot be cancelled.");
    }
    await endRefundCase(tx, row, "cancelled", { kind: "owner", userId: owner.userId }, reason);
  });
}

export { approveRefund, cancelRefund, prepareRefund, rejectRefund };
export type { ApproveInput, EndInput, PrepareInput };
