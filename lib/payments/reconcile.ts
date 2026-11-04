import "server-only";

import { prisma } from "@/lib/prisma";
import { serverLogger } from "@/lib/server-logger";

import type { PaymentProviderAdapter, VerifiedPaymentEvent } from "./adapter";
import { processPaymentEvent } from "./inbox";
import { findingDigest, findStatusMismatches, quarantineStatusMismatch } from "./status-binding";

type OpenOrder = {
  amountRupiah: number;
  buyerId: string;
  currency: string;
  id: string;
  packageCode: string;
  providerAccount: string;
  providerEnvironment: string;
  reference: string;
};

type ReconcileResult = {
  checked: number;
  /** Orders the provider settled one way or the other during this run. */
  resolved: number;
  /** The provider still says pending after our expiry; asked again next run. */
  stillPending: number;
  /** The provider could not be reached or answered with something unusable. */
  unavailable: number;
};

const RECONCILE_BATCH = 50;

/**
 * Orders still open after their expiry, oldest first, on database time. They
 * are resolved only from the provider's own account of the payment: our clock
 * passing the expiry does not make an order expired, because the payment may
 * still have been captured.
 */
async function findOpenOrdersPastExpiry(provider: PaymentProviderAdapter, limit: number) {
  return prisma.$queryRaw<OpenOrder[]>`
    SELECT id, reference, buyer_id AS "buyerId", package_code AS "packageCode",
           amount_rupiah AS "amountRupiah", currency,
           provider_account AS "providerAccount", provider_environment AS "providerEnvironment"
    FROM payment_orders
    WHERE status = 'pending' AND provider = ${provider.id} AND expires_at <= now()
    ORDER BY expires_at
    LIMIT ${limit}
  `;
}

/**
 * Looks one open order up at the provider and applies the answer through the
 * same decision code as a webhook. The event ids are stable per payment, state
 * and reported facts, so repeating a run, or a webhook arriving for the same payment later,
 * changes nothing twice.
 */
async function reconcileOrder(order: OpenOrder, provider: PaymentProviderAdapter) {
  const status = await provider.getStatus(order.reference);

  if (!status.found) {
    // The provider has no payment for this reference and the time to pay has
    // passed, so nothing can still settle: the order expires.
    const result = await processPaymentEvent({
      adapter: provider,
      event: {
        amountRupiah: order.amountRupiah,
        buyerId: order.buyerId,
        currency: order.currency,
        environment: order.providerEnvironment,
        eventId: `reconcile:absent:${order.id}`,
        kind: "payment.expired",
        merchantAccount: order.providerAccount,
        merchantReference: order.reference,
        occurredAt: new Date(),
        packageCode: order.packageCode,
        providerPaymentId: null,
      },
      source: "reconciliation",
    });
    return result.status === "processed" ? "resolved" : "unchanged";
  }

  // The answer must be about the order that was asked about. If it is not, it
  // is recorded against that order and nothing else happens.
  const mismatches = findStatusMismatches(order, status, provider);
  if (mismatches.length > 0) {
    return (await quarantineStatusMismatch(order, status, provider, mismatches)) ? "resolved" : "unchanged";
  }

  if (status.state === "pending") return "pending";

  const event: VerifiedPaymentEvent = {
    amountRupiah: status.amountRupiah,
    buyerId: status.buyerId,
    currency: status.currency,
    environment: status.environment,
    // The id covers what the provider reported, so the same finding repeated is
    // one event, while a corrected finding for the same payment is a new one.
    eventId: `reconcile:${status.providerPaymentId}:${status.state}:${findingDigest(status)}`,
    kind: `payment.${status.state}`,
    merchantAccount: status.merchantAccount,
    merchantReference: status.merchantReference,
    occurredAt: status.occurredAt,
    packageCode: status.packageCode,
    providerPaymentId: status.providerPaymentId,
  };
  const result = await processPaymentEvent({ adapter: provider, event, source: "reconciliation" });
  return result.status === "processed" ? "resolved" : "unchanged";
}

/**
 * Resolves one order now if it is still open past its expiry, for a buyer who
 * is looking at it. Returns whether anything was decided; a provider that
 * cannot be reached leaves the order as it was for the next run.
 */
async function reconcileOrderByReference(reference: string, provider: PaymentProviderAdapter) {
  const [order] = await prisma.$queryRaw<OpenOrder[]>`
    SELECT id, reference, buyer_id AS "buyerId", package_code AS "packageCode",
           amount_rupiah AS "amountRupiah", currency,
           provider_account AS "providerAccount", provider_environment AS "providerEnvironment"
    FROM payment_orders
    WHERE reference = ${reference} AND status = 'pending' AND provider = ${provider.id} AND expires_at <= now()
  `;
  if (!order) return "unchanged" as const;

  try {
    return await reconcileOrder(order, provider);
  } catch {
    return "unchanged" as const;
  }
}

async function reconcileOpenOrders(
  provider: PaymentProviderAdapter,
  options: { limit?: number } = {},
): Promise<ReconcileResult> {
  const orders = await findOpenOrdersPastExpiry(provider, options.limit ?? RECONCILE_BATCH);
  const result: ReconcileResult = { checked: orders.length, resolved: 0, stillPending: 0, unavailable: 0 };

  for (const order of orders) {
    try {
      const outcome = await reconcileOrder(order, provider);
      if (outcome === "resolved") result.resolved += 1;
      else if (outcome === "pending") result.stillPending += 1;
    } catch (error) {
      result.unavailable += 1;
      serverLogger.error("payments.reconcile.failed", error instanceof Error ? error : new Error("reconcile failed"), {
        area: "payments",
      });
    }
  }

  return result;
}

export { findOpenOrdersPastExpiry, reconcileOpenOrders, reconcileOrder, reconcileOrderByReference };
export type { OpenOrder, ReconcileResult };
