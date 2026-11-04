import "server-only";

import {
  BillingAccessError,
  pauseAccessInTx,
  resumeAccessInTx,
  revokeAccessInTx,
} from "@/lib/billing/service";
import { assertStillOwner } from "@/lib/disputes/export";
import { openFraudCase } from "@/lib/fraud/cases";
import { requireReason, type OwnerContext } from "@/lib/fraud/authority";
import { writePaymentAudit } from "@/lib/payments/audit";
import { enqueueOutbox } from "@/lib/payments/outbox";
import { prisma } from "@/lib/prisma";

import { getCapturedPayment } from "./balance";
import { databaseNow, lockRefundCase, type Actor, type Tx } from "./core";
import { endRefundCase } from "./effects";
import { RefundError } from "./errors";

type Env = Partial<Record<string, string | undefined>>;

/**
 * Disputes (chargebacks) on a captured payment.
 *
 * - An open dispute pauses the buyer's access and holds the order's evidence
 *   (`evidence_hold`, which MS-10's retention job must honour).
 * - Won: access resumes if this dispute paused it. Lost: access ends.
 * - The refund-versus-dispute rule is in docs/payments.md and enforced by the
 *   database: nothing new goes to the provider or gets approved while a dispute
 *   is open on the payment; a refund already with the provider is left to finish
 *   and the dispute is flagged for the owner.
 *
 * Every function here assumes the order row is locked by the caller, so a
 * dispute, an approval and a confirmation for one order are decided one after
 * the other.
 */

type OpenDisputeInput = {
  amountRupiah: number;
  noticeReceivedAt: Date;
  orderId: string;
  paymentEventId?: string | null;
  providerDisputeId: string;
  providerPaymentId: string;
  reasonText: string;
  recordedBy: Actor;
  responseDueAt?: Date | null;
  source: "owner_notice" | "provider_event";
};

async function insertDisputeEvent(
  tx: Tx,
  input: { actor: Actor; disputeId: string; disputeVersion: number; kind: string; metadata?: Record<string, unknown>; note?: string | null },
) {
  const [{ id }] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO payment_dispute_events (dispute_id, dispute_version, kind, actor_user_id, actor_kind, note, metadata)
    VALUES (
      ${input.disputeId}::uuid, ${input.disputeVersion}, ${input.kind},
      ${"userId" in input.actor ? input.actor.userId : null}::uuid, ${input.actor.kind},
      ${input.note ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING id
  `;
  return id;
}

function billingSource(actor: Actor) {
  return "userId" in actor ? ("admin" as const) : ("payment" as const);
}

async function orderFacts(tx: Tx, orderId: string) {
  const [order] = await tx.$queryRaw<Array<{ buyerId: string; reference: string; status: string }>>`
    SELECT buyer_id AS "buyerId", reference, status::text AS status FROM payment_orders WHERE id = ${orderId}::uuid
  `;
  return order;
}

/** Records a dispute, pauses access and notes any refund already on its way. */
async function openDisputeInTx(tx: Tx, input: OpenDisputeInput) {
  const order = await orderFacts(tx, input.orderId);
  if (!order) throw new RefundError("not_found", "The order was not found.");

  const [dispute] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO payment_disputes (
      order_id, buyer_id, provider_payment_id, provider_dispute_id, source, reason_text, amount_rupiah,
      notice_received_at, response_due_at, recorded_by_user_id, payment_event_id
    )
    VALUES (
      ${input.orderId}::uuid, ${order.buyerId}::uuid, ${input.providerPaymentId}, ${input.providerDisputeId},
      ${input.source}, ${input.reasonText}, ${input.amountRupiah}, ${input.noticeReceivedAt}, ${input.responseDueAt ?? null},
      ${"userId" in input.recordedBy ? input.recordedBy.userId : null}::uuid, ${input.paymentEventId ?? null}::uuid
    )
    RETURNING id
  `;
  await insertDisputeEvent(tx, {
    actor: input.recordedBy,
    disputeId: dispute.id,
    disputeVersion: 1,
    kind: "opened",
    metadata: { amountRupiah: input.amountRupiah, source: input.source },
    note: input.reasonText,
  });

  // An open dispute pauses the access this order granted.
  let accessEffect = "none_paid_order";
  let accessPaused = false;
  // True only when this dispute's pause changed the account. A pause that was already
  // there (an admin's, say) is not this dispute's to lift when it is won.
  let pauseCaused = false;
  if (order.status === "paid") {
    try {
      const paused = await pauseAccessInTx(tx, {
        actorUserId: "userId" in input.recordedBy ? input.recordedBy.userId : null,
        idempotencyKey: `dispute:${dispute.id}:pause`,
        reason: `Sengketa pembayaran ${input.providerDisputeId}`,
        source: billingSource(input.recordedBy),
        studentId: order.buyerId,
      });
      accessEffect = paused.outcome === "unchanged" ? "already_paused" : "paused";
      accessPaused = true;
      pauseCaused = paused.outcome !== "unchanged";
    } catch (error) {
      if (!(error instanceof BillingAccessError)) throw error;
      accessEffect = `not_active_${error.code}`.slice(0, 40);
    }
  }

  const processing = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM refund_cases
    WHERE order_id = ${input.orderId}::uuid AND provider_payment_id = ${input.providerPaymentId} AND state = 'processing'
  `;
  const held = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM refund_cases
    WHERE order_id = ${input.orderId}::uuid AND provider_payment_id = ${input.providerPaymentId} AND state IN ('prepared', 'approved')
  `;
  await tx.$executeRaw`
    UPDATE payment_disputes
    SET access_paused = ${accessPaused}, pause_caused = ${pauseCaused}, access_effect = ${accessEffect}, refund_in_flight = ${processing.length > 0}, updated_at = now()
    WHERE id = ${dispute.id}::uuid
  `;

  if (processing.length > 0) {
    // The refund is already with the provider and cannot be recalled. The owner
    // has to tell the provider or acquirer, so it becomes a case and an alert.
    await openFraudCase(tx, {
      evidence: { disputeId: dispute.id, orderId: input.orderId, reason: "dispute_during_refund", refundCases: processing.length },
      orderId: input.orderId,
      signal: "payment_review",
      subjectKey: `order:${input.orderId}`,
      subjectType: "order",
      userId: order.buyerId,
    });
    await enqueueOutbox(tx, {
      dedupeKey: `alert:dispute:${dispute.id}`,
      kind: "critical_alert",
      orderId: input.orderId,
      payload: { kind: "review", reason: "dispute_during_refund" },
    });
  }

  await writePaymentAudit(tx, {
    action: "dispute.opened",
    actorUserId: "userId" in input.recordedBy ? input.recordedBy.userId : null,
    metadata: {
      accessEffect,
      amountRupiah: input.amountRupiah,
      disputeId: dispute.id,
      heldRefunds: held.length,
      refundsInFlight: processing.length,
      source: input.source,
    },
    targetId: input.orderId,
    targetType: "payment_order",
  });

  return { accessEffect, disputeId: dispute.id, heldRefunds: held.length, refundsInFlight: processing.length };
}

/** An owner-entered notice from the provider or acquirer. */
async function recordDisputeNotice(
  owner: OwnerContext,
  input: {
    amountRupiah?: number | null;
    noticeReceivedAt?: Date | null;
    orderId: string;
    providerDisputeId: string;
    providerPaymentId?: string | null;
    reasonText: string;
    responseDueAt?: Date | null;
  },
  env: Env = process.env,
) {
  if (!/^[0-9a-f-]{36}$/iu.test(input.orderId)) throw new RefundError("not_found", "The order was not found.");
  const providerDisputeId = typeof input.providerDisputeId === "string" ? input.providerDisputeId.trim() : "";
  if (providerDisputeId.length < 3 || providerDisputeId.length > 160) {
    throw new RefundError("invalid_input", "Tulis nomor sengketa dari penyedia (3 sampai 160 karakter).");
  }
  const reasonText = typeof input.reasonText === "string" ? input.reasonText.trim() : "";
  if (reasonText.length < 3 || reasonText.length > 500) {
    throw new RefundError("invalid_input", "Tulis alasan sengketa menurut pemberitahuan penyedia (3 sampai 500 karakter).");
  }

  return prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, env);
    const [order = null] = await tx.$queryRaw<Array<{ providerReference: string | null; status: string }>>`
      SELECT provider_reference AS "providerReference", status::text AS status FROM payment_orders
      WHERE id = ${input.orderId}::uuid FOR UPDATE
    `;
    if (!order) throw new RefundError("not_found", "The order was not found.");

    const paymentId = input.providerPaymentId?.trim() || order.providerReference;
    const payment = paymentId ? await getCapturedPayment(tx, input.orderId, paymentId) : null;
    if (!payment) throw new RefundError("not_refundable", "The order has no captured payment.");

    const amount = input.amountRupiah ?? payment.capturedRupiah;
    if (!Number.isInteger(amount) || amount <= 0 || amount > payment.capturedRupiah) {
      throw new RefundError("invalid_input", "Jumlah sengketa harus bilangan rupiah bulat dan tidak lebih dari pembayarannya.");
    }

    const now = await databaseNow(tx);
    const received = input.noticeReceivedAt ?? now;
    if (Number.isNaN(received.getTime()) || received.getTime() > now.getTime()) {
      throw new RefundError("invalid_input", "Tanggal pemberitahuan tidak boleh di masa depan.");
    }

    const [existing = null] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payment_disputes
      WHERE order_id = ${input.orderId}::uuid AND (provider_dispute_id = ${providerDisputeId} OR (provider_payment_id = ${payment.providerPaymentId} AND state = 'open'))
      LIMIT 1
    `;
    if (existing) throw new RefundError("wrong_state", "Sengketa ini sudah tercatat.");

    return openDisputeInTx(tx, {
      amountRupiah: amount,
      noticeReceivedAt: received,
      orderId: input.orderId,
      providerDisputeId,
      providerPaymentId: payment.providerPaymentId,
      reasonText,
      recordedBy: { kind: "owner", userId: owner.userId },
      responseDueAt: input.responseDueAt ?? null,
      source: "owner_notice",
    });
  });
}

/** Resolves an open dispute inside a transaction whose order lock the caller holds. */
async function resolveDisputeInTx(
  tx: Tx,
  input: { actor: Actor; disputeId: string; expectedVersion?: number; note: string; outcome: "lost" | "won"; source: "owner" | "provider_event" },
) {
  const [dispute = null] = await tx.$queryRaw<Array<{
    buyerId: string; id: string; orderId: string; pauseCaused: boolean; providerDisputeId: string; providerPaymentId: string; state: string; version: number; accessPaused: boolean;
  }>>`
    SELECT id, order_id AS "orderId", buyer_id AS "buyerId", provider_payment_id AS "providerPaymentId",
           provider_dispute_id AS "providerDisputeId", state::text AS state, version, access_paused AS "accessPaused",
           pause_caused AS "pauseCaused"
    FROM payment_disputes WHERE id = ${input.disputeId}::uuid FOR UPDATE
  `;
  if (!dispute) throw new RefundError("not_found", "The dispute was not found.");
  if (input.expectedVersion !== undefined && dispute.version !== input.expectedVersion) {
    throw new RefundError("stale_version", "The dispute was changed by someone else.");
  }
  if (dispute.state !== "open") throw new RefundError("wrong_state", "The dispute is already resolved.");

  const order = await orderFacts(tx, dispute.orderId);
  const userId = "userId" in input.actor ? input.actor.userId : null;
  let accessEffect = "none_paid_order";

  if (input.outcome === "won") {
    if (dispute.accessPaused) {
      // Another open dispute on the same buyer keeps access paused. If this one caused the
      // pause, that dispute now owns it, so winning it later still lifts the pause.
      const [other = null] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM payment_disputes
        WHERE buyer_id = ${dispute.buyerId}::uuid AND state = 'open' AND access_paused AND id <> ${dispute.id}::uuid
        ORDER BY notice_received_at LIMIT 1
      `;
      if (other) {
        if (dispute.pauseCaused) {
          await tx.$executeRaw`UPDATE payment_disputes SET pause_caused = true, updated_at = now() WHERE id = ${other.id}::uuid`;
        }
        accessEffect = "still_paused_other_dispute";
      } else if (!dispute.pauseCaused) {
        // The pause was there before this dispute (or another dispute took it on and has ended): leave it.
        accessEffect = "pause_not_from_dispute";
      } else {
        try {
          const resumed = await resumeAccessInTx(tx, {
            actorUserId: userId,
            idempotencyKey: `dispute:${dispute.id}:resume`,
            reason: `Sengketa ${dispute.providerDisputeId} dimenangkan`,
            source: billingSource(input.actor),
            studentId: dispute.buyerId,
          });
          accessEffect = resumed.outcome === "unchanged" ? "not_paused" : "resumed";
        } catch (error) {
          if (!(error instanceof BillingAccessError)) throw error;
          accessEffect = `resume_failed_${error.code}`.slice(0, 40);
        }
      }
    } else {
      accessEffect = "not_paused_by_dispute";
    }
  } else {
    if (order.status === "paid") {
      try {
        const revoked = await revokeAccessInTx(tx, {
          actorUserId: userId,
          idempotencyKey: `dispute:${dispute.id}:revoke`,
          reason: `Sengketa ${dispute.providerDisputeId} kalah`,
          source: billingSource(input.actor),
          studentId: dispute.buyerId,
        });
        accessEffect = revoked.outcome === "unchanged" ? "already_ended" : "revoked";
      } catch (error) {
        if (!(error instanceof BillingAccessError)) throw error;
        accessEffect = `revoke_failed_${error.code}`.slice(0, 40);
      }
    }

    // The provider has already taken this money back, so a refund that has not
    // gone out yet would pay it a second time. Those are cancelled.
    const unsent = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM refund_cases
      WHERE order_id = ${dispute.orderId}::uuid AND provider_payment_id = ${dispute.providerPaymentId} AND state IN ('prepared', 'approved')
      ORDER BY prepared_at
    `;
    for (const { id } of unsent) {
      const row = await lockRefundCase(tx, id);
      await endRefundCase(tx, row, "cancelled", { kind: "system" }, "Sengketa kalah: penyedia sudah menarik dana ini kembali.");
    }
  }

  const nextVersion = dispute.version + 1;
  const eventId = await insertDisputeEvent(tx, {
    actor: input.actor,
    disputeId: dispute.id,
    disputeVersion: nextVersion,
    kind: input.outcome === "won" ? "resolved_won" : "resolved_lost",
    metadata: { accessEffect, source: input.source },
    note: input.note,
  });
  await tx.$executeRaw`
    UPDATE payment_disputes
    SET state = ${input.outcome}::payment_dispute_state, version = ${nextVersion}, last_event_id = ${eventId}::uuid,
        evidence_hold = false, resolved_at = now(), resolved_by_user_id = ${userId}::uuid,
        resolution_source = ${input.source}, resolution_note = ${input.note}, access_effect = ${accessEffect}, updated_at = now()
    WHERE id = ${dispute.id}::uuid
  `;

  if (input.outcome === "lost") {
    // Money out twice: a refund already completed or in flight, and now the chargeback too.
    const [{ over }] = await tx.$queryRaw<Array<{ over: boolean }>>`
      SELECT refund_balance_used(${dispute.orderId}::uuid, ${dispute.providerPaymentId}, NULL)
             > refund_capture_amount(${dispute.orderId}::uuid, ${dispute.providerPaymentId}) AS over
    `;
    if (over) {
      await openFraudCase(tx, {
        evidence: { disputeId: dispute.id, orderId: dispute.orderId, reason: "dispute_lost_after_refund" },
        orderId: dispute.orderId,
        signal: "payment_review",
        subjectKey: `order:${dispute.orderId}`,
        subjectType: "order",
        userId: dispute.buyerId,
      });
      await enqueueOutbox(tx, {
        dedupeKey: `alert:dispute-resolved:${dispute.id}`,
        kind: "critical_alert",
        orderId: dispute.orderId,
        payload: { kind: "review", reason: "dispute_lost_after_refund" },
      });
    }
  }

  await writePaymentAudit(tx, {
    action: `dispute.${input.outcome}`,
    actorUserId: userId,
    metadata: { accessEffect, disputeId: dispute.id, source: input.source },
    targetId: dispute.orderId,
    targetType: "payment_order",
  });

  return { accessEffect, orderId: dispute.orderId };
}

/** The owner records the outcome of a dispute. */
async function resolveDispute(
  owner: OwnerContext,
  input: { disputeId: string; expectedVersion: number; outcome: string; reason: string },
  env: Env = process.env,
) {
  const note = requireReason(input.reason);
  if (input.outcome !== "won" && input.outcome !== "lost") throw new RefundError("invalid_input", "Pilih hasil sengketa.");
  const outcome = input.outcome;
  if (!/^[0-9a-f-]{36}$/iu.test(input.disputeId)) throw new RefundError("not_found", "The dispute was not found.");

  return prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, env);
    const [ref = null] = await tx.$queryRaw<Array<{ orderId: string }>>`SELECT order_id AS "orderId" FROM payment_disputes WHERE id = ${input.disputeId}::uuid`;
    if (!ref) throw new RefundError("not_found", "The dispute was not found.");
    await tx.$executeRaw`SELECT 1 FROM payment_orders WHERE id = ${ref.orderId}::uuid FOR UPDATE`;

    return resolveDisputeInTx(tx, {
      actor: { kind: "owner", userId: owner.userId },
      disputeId: input.disputeId,
      expectedVersion: input.expectedVersion,
      note,
      outcome,
      source: "owner",
    });
  });
}

export { openDisputeInTx, recordDisputeNotice, resolveDispute, resolveDisputeInTx };
export type { OpenDisputeInput };
