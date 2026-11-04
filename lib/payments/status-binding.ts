import "server-only";

import { createHash } from "node:crypto";

import { serverLogger } from "@/lib/server-logger";

import type { PaymentProviderAdapter, ProviderPaymentStatus } from "./adapter";
import { processPaymentEvent } from "./inbox";

type FoundStatus = Extract<ProviderPaymentStatus, { found: true }>;

/** The facts of the order that was asked about, which the provider's answer must repeat. */
type QueriedOrder = {
  amountRupiah: number;
  buyerId: string;
  currency: string;
  id: string;
  packageCode: string;
  providerAccount: string;
  providerEnvironment: string;
  reference: string;
};

function findingDigest(status: Pick<FoundStatus, "amountRupiah" | "buyerId" | "currency" | "environment" | "merchantAccount" | "packageCode">, ...extra: string[]) {
  return createHash("sha256")
    .update(JSON.stringify([
      status.amountRupiah, status.buyerId, status.currency, status.environment, status.merchantAccount, status.packageCode, ...extra,
    ]))
    .digest("hex")
    .slice(0, 12);
}

/**
 * What a status answer says that the order it was asked about does not. A
 * status lookup is a request about one reference; an answer that names another
 * reference, amount, buyer, package, merchant account or environment is not an
 * answer about that order and must not move it, whatever its state says.
 * Empty means the answer is about this order.
 */
function findStatusMismatches(order: QueriedOrder, status: FoundStatus, provider: PaymentProviderAdapter) {
  const mismatches: string[] = [];
  if (status.merchantReference !== order.reference) mismatches.push("reference");
  if (status.amountRupiah !== order.amountRupiah) mismatches.push("amount");
  if (status.currency !== order.currency) mismatches.push("currency");
  if (status.buyerId !== order.buyerId) mismatches.push("buyer");
  if (status.packageCode !== order.packageCode) mismatches.push("package");
  if (status.merchantAccount !== order.providerAccount || status.merchantAccount !== provider.merchantAccount) mismatches.push("merchant");
  if (status.environment !== order.providerEnvironment || status.environment !== provider.environment) mismatches.push("environment");
  return mismatches;
}

/**
 * Records a mismatched status answer against the order that was asked about:
 * a quarantined event, an audit event, a fraud signal and a critical alert,
 * written by the same transaction as a webhook mismatch. The order itself is
 * left exactly as it was. The event id covers what the provider reported, so
 * the same wrong answer repeated is one event and one alert.
 */
async function quarantineStatusMismatch(
  order: QueriedOrder,
  status: FoundStatus,
  provider: PaymentProviderAdapter,
  mismatches: string[],
) {
  try {
    await processPaymentEvent({
      adapter: provider,
      event: {
        amountRupiah: status.amountRupiah,
        buyerId: status.buyerId,
        currency: status.currency,
        environment: status.environment,
        eventId: `status-mismatch:${order.id}:${status.providerPaymentId}:${status.state}:${findingDigest(status, status.merchantReference)}`,
        kind: `payment.${status.state === "pending" ? "expired" : status.state}`,
        merchantAccount: status.merchantAccount,
        // Always the queried order's reference: that is where the finding belongs.
        merchantReference: order.reference,
        occurredAt: status.occurredAt,
        packageCode: status.packageCode,
        providerPaymentId: status.providerPaymentId,
      },
      source: "reconciliation",
      statusMismatch: mismatches,
    });
  } catch (error) {
    serverLogger.error("payments.status.quarantine_failed", error instanceof Error ? error : new Error("quarantine failed"), {
      area: "payments",
    });
  }
}

export { findingDigest, findStatusMismatches, quarantineStatusMismatch };
export type { FoundStatus, QueriedOrder };
