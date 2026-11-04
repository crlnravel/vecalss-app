import "server-only";

import { runFulfillmentMaintenance, type StalledResult } from "@/lib/fulfillment/stalled";
import { purgeExpiredExportPackets } from "@/lib/disputes/export";

import type { PaymentProviderAdapter } from "./adapter";
import { drainOutbox, type DrainResult, type OutboxHandlers } from "./outbox";
import { reconcileOpenOrders, type ReconcileResult } from "./reconcile";

type PaymentMaintenanceResult = {
  /** Packets of dispute exports whose link ran out, dropped this run. */
  exportPacketsPurged: number;
  /** Paid orders still waiting for access: retried, then flagged after an hour. */
  fulfillment: StalledResult;
  outbox: DrainResult;
  /** Null when no payment provider is configured. */
  reconciliation: ReconcileResult | null;
};

/** Most batches of outbox jobs one run works through, so a backlog cannot hold the function open. */
const MAX_OUTBOX_BATCHES = 10;

/**
 * The payment part of the daily job: resolve orders still open past their
 * expiry, retry and flag paid orders that were not delivered, drop expired
 * export packets, then drain the outbox. Both steps are idempotent and safe to run
 * while a request-time drain is also running (jobs are leased).
 */
async function runPaymentMaintenance(deps: {
  handlers: OutboxHandlers;
  provider: PaymentProviderAdapter | null;
}): Promise<PaymentMaintenanceResult> {
  const reconciliation = deps.provider ? await reconcileOpenOrders(deps.provider) : null;

  // Delivery first, so an order that can be delivered now is not flagged, and
  // its receipt email is queued before the outbox drains below.
  const fulfillment = await runFulfillmentMaintenance();
  const exportPacketsPurged = await purgeExpiredExportPackets();

  const outbox: DrainResult = { dead: 0, done: 0, failed: 0 };
  for (let batch = 0; batch < MAX_OUTBOX_BATCHES; batch += 1) {
    const drained = await drainOutbox(deps.handlers);
    outbox.dead += drained.dead;
    outbox.done += drained.done;
    outbox.failed += drained.failed;
    if (drained.done + drained.failed + drained.dead === 0) break;
  }

  return { exportPacketsPurged, fulfillment, outbox, reconciliation };
}

export { runPaymentMaintenance };
export type { PaymentMaintenanceResult };
