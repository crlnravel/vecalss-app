import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { BillingAccessError, grantPaidAccess } from "@/lib/billing/service";
import { accessPlanLabel, isAccessPlan, type AccessPlan } from "@/lib/billing/plans";
import { writePaymentAudit } from "@/lib/payments/audit";
import { enqueueOutbox } from "@/lib/payments/outbox";
import { PRICING_SCHEDULE } from "@/lib/pricing/schedule";
import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

type Tx = Prisma.TransactionClient;
type Env = Partial<Record<string, string | undefined>>;

/** Why a paid order is waiting for its access. Stored on the receipt. */
type PendingReason =
  | "full_end_not_configured"
  | "full_end_passed"
  | "grant_error"
  | "paused"
  | "plan_unknown"
  | "student_not_found";

type FulfillResult =
  | { receiptId: string; status: "already_delivered" }
  | { receiptId: string; status: "delivered"; validUntil: Date }
  | { receiptId: string; reason: PendingReason; status: "pending" }
  | { status: "not_paid" };

/**
 * The access plan an order buys. Monthly is monthly; Full Access ends on the
 * date of the exam target the order's pricing month names.
 */
function accessPlanForOrder(plan: string, pricingMonth: string): AccessPlan | null {
  if (plan === "monthly") return "monthly";
  if (plan !== "full") return null;

  const entry = PRICING_SCHEDULE.find((item) => item.month === pricingMonth);
  if (!entry) return null;

  const code = `full_${entry.fullTarget}`;
  return isAccessPlan(code) ? code : null;
}

type OrderForReceipt = {
  amountRupiah: number;
  buyerId: string;
  currency: string;
  id: string;
  packageCode: string;
  packageName: string;
  paidAt: Date;
  plan: string;
  pricingMonth: string;
  providerReference: string | null;
  reference: string;
  status: string;
  termsVersion: string | null;
};

const LEGACY_TERMS = "tidak-tercatat";

/**
 * Writes the receipt of a paid order, pending, in the caller's transaction. A
 * second call finds the first. The receipt copies what was bought and agreed
 * from the frozen order snapshot; nothing is read from mutable catalog rows.
 */
async function ensureReceipt(tx: Tx, orderId: string) {
  const [order = null] = await tx.$queryRaw<OrderForReceipt[]>`
    SELECT id, buyer_id AS "buyerId", reference, plan, pricing_month AS "pricingMonth",
           package_code AS "packageCode", package_name AS "packageName",
           amount_rupiah AS "amountRupiah", currency, terms_version AS "termsVersion",
           provider_reference AS "providerReference", paid_at AS "paidAt", status::text AS status
    FROM payment_orders WHERE id = ${orderId}::uuid
  `;
  if (!order || order.status !== "paid" || !order.paidAt) return null;

  await tx.$executeRaw`
    INSERT INTO payment_receipts (
      order_id, buyer_id, receipt_number, package_code, package_name, plan, pricing_month,
      amount_rupiah, currency, terms_version, provider_payment_id, paid_at
    )
    VALUES (
      ${order.id}::uuid, ${order.buyerId}::uuid,
      'VCL-' || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYMMDD') || '-'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
      ${order.packageCode}, ${order.packageName}, ${order.plan}, ${order.pricingMonth},
      ${order.amountRupiah}, ${order.currency}, ${order.termsVersion ?? LEGACY_TERMS},
      ${order.providerReference}, ${order.paidAt}
    )
    ON CONFLICT (order_id) DO NOTHING
  `;

  const [receipt] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM payment_receipts WHERE order_id = ${order.id}::uuid
  `;
  return { orderId: order.id, receiptId: receipt.id };
}

const SAVEPOINT = "fulfill_paid_order";

/**
 * Runs `work` so that, if it fails with anything unexpected, only its own
 * writes are undone and the caller's transaction (the payment) carries on.
 */
async function withSavepoint<T>(tx: Tx, work: () => Promise<T>): Promise<{ error: unknown; ok: false } | { ok: true; value: T }> {
  await tx.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT}`);
  try {
    const value = await work();
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    return { ok: true, value };
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
    return { error, ok: false };
  }
}

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

async function recordInAppReceipt(
  tx: Tx,
  input: { buyerId: string; planLabel: string; receiptId: string; receiptNumber: string; reference: string; validUntil: Date },
) {
  const existing = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM notifications
    WHERE source_entity_type = 'payment_receipt' AND source_entity_id = ${input.receiptId}::uuid
    LIMIT 1
  `;
  if (existing.length > 0) return existing[0].id;

  const [notification] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO notifications (
      recipient_user_id, event_type, title, body, deep_link, priority, source_entity_type, source_entity_id
    )
    VALUES (
      ${input.buyerId}::uuid, 'purchase_receipt'::notification_event_type,
      'Pembayaran diterima, aksesmu aktif',
      ${`${input.planLabel} aktif sampai ${dateFormat.format(input.validUntil)}. Nomor struk: ${input.receiptNumber}.`},
      ${`/pricing/checkout/status/${input.reference}`}, 1, 'payment_receipt', ${input.receiptId}::uuid
    )
    RETURNING id
  `;
  await tx.$executeRaw`
    INSERT INTO notification_deliveries (notification_id, channel, status, queued_at, delivered_at)
    VALUES (${notification.id}::uuid, 'in_app'::notification_channel, 'delivered'::notification_status, now(), now())
  `;
  await tx.$executeRaw`
    INSERT INTO receipt_deliveries (receipt_id, channel, outcome, notification_id)
    VALUES (${input.receiptId}::uuid, 'in_app', 'sent', ${notification.id}::uuid)
    ON CONFLICT DO NOTHING
  `;
  return notification.id;
}

type FulfillOptions = {
  /** Server settings that carry the Full Access end dates. Tests pass their own. */
  env?: Env;
};

/**
 * Delivers what a paid order bought, in the caller's transaction: the MS-04
 * grant (key `order:<id>`), the delivered receipt, the in-app notification and
 * the receipt email job. Safe to call again for the same order: a delivered
 * receipt is left as it is, so a retry never grants, notifies or mails twice.
 *
 * When the grant cannot happen the order stays paid and the receipt stays
 * `pending` with the reason; nothing is marked delivered because money arrived.
 * The caller decides whether to queue a retry (see `queueGrantRetry`).
 *
 * The receipt row is locked first, so two callers for one order run one after
 * the other.
 */
async function fulfillPaidOrder(tx: Tx, orderId: string, options: FulfillOptions = {}): Promise<FulfillResult> {
  const created = await ensureReceipt(tx, orderId);
  if (!created) return { status: "not_paid" };

  const [receipt] = await tx.$queryRaw<Array<{
    buyerId: string;
    deliveryStatus: string;
    id: string;
    pendingReason: string | null;
    plan: string;
    pricingMonth: string;
    receiptNumber: string;
    reference: string;
  }>>`
    SELECT r.id, r.buyer_id AS "buyerId", r.delivery_status::text AS "deliveryStatus",
           r.pending_reason AS "pendingReason", r.plan, r.pricing_month AS "pricingMonth",
           r.receipt_number AS "receiptNumber", o.reference
    FROM payment_receipts r JOIN payment_orders o ON o.id = r.order_id
    WHERE r.id = ${created.receiptId}::uuid
    FOR UPDATE OF r
  `;
  if (receipt.deliveryStatus === "delivered") return { receiptId: receipt.id, status: "already_delivered" };

  const holdPending = async (reason: PendingReason): Promise<FulfillResult> => {
    // Only the first time a reason appears is worth an audit event.
    if (receipt.pendingReason !== reason) {
      await tx.$executeRaw`UPDATE payment_receipts SET pending_reason = ${reason} WHERE id = ${receipt.id}::uuid`;
      await writePaymentAudit(tx, {
        action: "payment.order.delivery_pending",
        metadata: { reason, receiptId: receipt.id },
        targetId: orderId,
        targetType: "payment_order",
      });
    }
    return { reason, receiptId: receipt.id, status: "pending" };
  };

  const plan = accessPlanForOrder(receipt.plan, receipt.pricingMonth);
  if (!plan) return holdPending("plan_unknown");

  const attempt = await withSavepoint(tx, async () => {
    try {
      const granted = await grantPaidAccess(tx, { env: options.env, orderId, plan, studentId: receipt.buyerId });
      return { granted, ok: true as const };
    } catch (error) {
      // A refusal is thrown before anything is written; anything else may have
      // written part of a grant, which the savepoint rolls back.
      if (error instanceof BillingAccessError) return { code: error.code, ok: false as const };
      throw error;
    }
  });

  if (!attempt.ok) {
    serverLogger.error("fulfillment.grant.failed", attempt.error instanceof Error ? attempt.error : new Error("grant failed"), {
      area: "fulfillment",
    });
    return holdPending("grant_error");
  }
  if (!attempt.value.ok) {
    const code = attempt.value.code;
    const reason: PendingReason = code === "paused" || code === "full_end_not_configured" || code === "full_end_passed" || code === "student_not_found"
      ? code
      : "grant_error";
    return holdPending(reason);
  }

  const event = attempt.value.granted.event;
  if (!event || !event.startsAt || !event.endsAt || !event.planCode) {
    // An "unchanged" outcome cannot happen for a grant; treat it as a failure to deliver.
    return holdPending("grant_error");
  }

  await tx.$executeRaw`
    UPDATE payment_receipts
    SET delivery_status = 'delivered', pending_reason = NULL, access_plan_code = ${event.planCode},
        grant_event_id = ${event.id}::uuid, valid_from = ${event.startsAt}, valid_until = ${event.endsAt},
        granted_at = ${event.occurredAt}
    WHERE id = ${receipt.id}::uuid
  `;
  await recordInAppReceipt(tx, {
    buyerId: receipt.buyerId,
    planLabel: accessPlanLabel(event.planCode),
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    reference: receipt.reference,
    validUntil: event.endsAt,
  });
  await enqueueOutbox(tx, {
    dedupeKey: `receipt:${orderId}`,
    kind: "receipt_email",
    orderId,
    payload: { orderId },
  });
  await writePaymentAudit(tx, {
    action: "payment.order.delivered",
    metadata: {
      grantEventId: event.id,
      planCode: event.planCode,
      receiptId: receipt.id,
      validUntil: event.endsAt.toISOString(),
    },
    targetId: orderId,
    targetType: "payment_order",
  });

  return { receiptId: receipt.id, status: "delivered", validUntil: event.endsAt };
}

/** Queues the job that tries again. One job per order, however often this is called. */
async function queueGrantRetry(tx: Tx, orderId: string) {
  await enqueueOutbox(tx, {
    dedupeKey: `grant:${orderId}`,
    kind: "access_grant",
    orderId,
    payload: { orderId },
  });
}

/**
 * One retry in its own transaction. Returns whether the order is delivered now.
 * The outbox handler throws when it is not, so the job backs off and tries again.
 */
async function retryFulfillment(orderId: string, options: FulfillOptions = {}) {
  return prisma.$transaction(async (tx) => fulfillPaidOrder(tx, orderId, options), { maxWait: 10_000, timeout: 20_000 });
}

/** Paid orders whose access is still pending, oldest first. */
async function listPendingFulfillments(limit = 50) {
  return prisma.$queryRaw<Array<{ orderId: string }>>`
    SELECT order_id AS "orderId" FROM payment_receipts
    WHERE delivery_status = 'pending'
    ORDER BY paid_at
    LIMIT ${limit}
  `;
}

export {
  accessPlanForOrder,
  ensureReceipt,
  fulfillPaidOrder,
  listPendingFulfillments,
  queueGrantRetry,
  retryFulfillment,
};
export type { FulfillOptions, FulfillResult, PendingReason };
