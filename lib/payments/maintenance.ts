import "server-only";

import type { PaymentProviderAdapter } from "./adapter";
import { drainOutbox, type DrainResult, type OutboxHandlers } from "./outbox";
import { reconcileOpenOrders, type ReconcileResult } from "./reconcile";

type PaymentMaintenanceResult = {
  outbox: DrainResult;
  /** Null when no payment provider is configured. */
  reconciliation: ReconcileResult | null;
};

/** Most batches of outbox jobs one run works through, so a backlog cannot hold the function open. */
const MAX_OUTBOX_BATCHES = 10;

/**
 * The payment part of the daily job: resolve orders still open past their
 * expiry, then drain the outbox. Both steps are idempotent and safe to run
 * while a request-time drain is also running (jobs are leased).
 */
async function runPaymentMaintenance(deps: {
  handlers: OutboxHandlers;
  provider: PaymentProviderAdapter | null;
}): Promise<PaymentMaintenanceResult> {
  const reconciliation = deps.provider ? await reconcileOpenOrders(deps.provider) : null;

  const outbox: DrainResult = { dead: 0, done: 0, failed: 0 };
  for (let batch = 0; batch < MAX_OUTBOX_BATCHES; batch += 1) {
    const drained = await drainOutbox(deps.handlers);
    outbox.dead += drained.dead;
    outbox.done += drained.done;
    outbox.failed += drained.failed;
    if (drained.done + drained.failed + drained.dead === 0) break;
  }

  return { outbox, reconciliation };
}

export { runPaymentMaintenance };
export type { PaymentMaintenanceResult };
