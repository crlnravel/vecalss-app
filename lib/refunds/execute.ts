import "server-only";

import { assertStillOwner } from "@/lib/disputes/export";
import { requireReason, type OwnerContext } from "@/lib/fraud/authority";
import { ProviderOutcomeUnknownError, type PaymentProviderAdapter, type ProviderRefundStatus } from "@/lib/payments/adapter";
import { writePaymentAudit } from "@/lib/payments/audit";
import { prisma } from "@/lib/prisma";

import { MAX_PROOF_NOTE_LENGTH, isDestinationHolder } from "./constants";
import { insertRefundEvent, lockRefundCase, type RefundCaseRow, type Tx } from "./core";
import { completeRefund, endRefundCase } from "./effects";
import { RefundError } from "./errors";

type Env = Partial<Record<string, string | undefined>>;

/**
 * Sending an approved refund through the payment provider.
 *
 * The case moves to `processing` and commits BEFORE the provider is called, so
 * a crash or timeout leaves a record that the call may have happened. A timeout
 * is an unknown outcome, not a failure: the case is marked unknown and cannot be
 * sent again until `reconcileRefund` has asked the provider what it knows. The
 * provider is given our refund reference as its idempotency key every time.
 *
 * A refund completes only on a verified confirmation: a signed refund event
 * (see events.ts) or the provider's own status lookup, never because the
 * request was accepted.
 */

type ExecuteResult =
  | { providerRefundId: string; result: "sent" }
  | { reason: string; result: "rejected" }
  | { result: "unknown" };

function sameFacts(row: RefundCaseRow, status: Extract<ProviderRefundStatus, { found: true }>, provider: PaymentProviderAdapter) {
  return status.amountRupiah === row.amountRupiah
    && status.currency === row.currency
    && status.providerPaymentId === row.providerPaymentId
    && status.refundReference === row.reference
    && status.merchantAccount === provider.merchantAccount
    && status.environment === provider.environment;
}

/**
 * Stores what the provider's status lookup said as a `payment_events` row (type
 * refund_succeeded, source reconciliation, accepted), the same shape a signed
 * webhook leaves, and returns its id. The identity is fixed per refund, so asking
 * twice stores it once.
 */
async function recordRefundStatusEvent(
  tx: Tx,
  row: RefundCaseRow,
  status: Extract<ProviderRefundStatus, { found: true }>,
  provider: PaymentProviderAdapter,
) {
  const [order] = await tx.$queryRaw<Array<{ reference: string }>>`SELECT reference FROM payment_orders WHERE id = ${row.orderId}::uuid`;
  const eventKey = `status:${row.reference}:${status.providerRefundId}`;
  const [inserted = null] = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO payment_events (
      provider, provider_environment, provider_account, event_id, type, source, provider_payment_id,
      merchant_reference, order_id, amount_rupiah, currency, buyer_id, refund_reference, provider_refund_id,
      outcome, provider_occurred_at
    )
    VALUES (
      ${provider.id}, ${status.environment}, ${status.merchantAccount}, ${eventKey}, 'refund_succeeded'::payment_event_type,
      'reconciliation'::payment_event_source, ${status.providerPaymentId}, ${order.reference}, ${row.orderId}::uuid,
      ${status.amountRupiah}, ${status.currency}, ${row.buyerId}, ${row.reference}, ${status.providerRefundId},
      'accepted'::payment_event_outcome, ${status.occurredAt}
    )
    ON CONFLICT (provider, provider_environment, provider_account, event_id) DO NOTHING
    RETURNING id
  `;
  if (inserted) return inserted.id;
  const [existing] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM payment_events
    WHERE provider = ${provider.id} AND provider_environment = ${status.environment}
      AND provider_account = ${status.merchantAccount} AND event_id = ${eventKey}
  `;
  return existing.id;
}

async function executeProviderRefund(
  owner: OwnerContext,
  input: { caseId: string; expectedVersion: number },
  deps: { env?: Env; provider: PaymentProviderAdapter | null },
): Promise<ExecuteResult> {
  const provider = deps.provider;
  if (!provider) throw new RefundError("no_provider", "No payment provider is configured.");

  // 1. Record that the call is about to be made.
  const row = await prisma.$transaction(async (tx) => {
    await assertStillOwner(tx, owner, deps.env);
    const locked = await lockRefundCase(tx, input.caseId, input.expectedVersion);
    const [order] = await tx.$queryRaw<Array<{ provider: string }>>`SELECT provider FROM payment_orders WHERE id = ${locked.orderId}::uuid`;
    if (order.provider !== provider.id) throw new RefundError("no_provider", "The payment was not made through the configured provider.");

    if (locked.state === "approved") {
      const [open = null] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM payment_disputes
        WHERE order_id = ${locked.orderId}::uuid AND provider_payment_id = ${locked.providerPaymentId} AND state = 'open' LIMIT 1
      `;
      if (open) throw new RefundError("dispute_open", "A dispute is open on the payment.");

      const nextVersion = locked.version + 1;
      const eventId = await insertRefundEvent(tx, {
        actor: { kind: "owner", userId: owner.userId },
        caseId: locked.id,
        caseVersion: nextVersion,
        kind: "execution_started",
        metadata: { attempt: 1 },
      });
      await tx.$executeRaw`
        UPDATE refund_cases
        SET state = 'processing', version = ${nextVersion}, last_event_id = ${eventId}::uuid, method = 'provider',
            execution_attempts = 1, last_attempt_at = now(), updated_at = now()
        WHERE id = ${locked.id}::uuid
      `;
      await writePaymentAudit(tx, {
        action: "refund.execution_started",
        actorUserId: owner.userId,
        metadata: { amountRupiah: locked.amountRupiah, caseId: locked.id },
        targetId: locked.orderId,
        targetType: "payment_order",
      });
      return { ...locked, executionAttempts: 1, state: "processing" as const, version: nextVersion };
    }

    if (locked.state !== "processing") throw new RefundError("wrong_state", "Only an approved refund can be sent.");
    // Already with the provider: sending again is allowed only once the provider is known not to have it.
    if (locked.outcomeUnknown) throw new RefundError("outcome_unknown", "The last request has an unknown result.");
    if (locked.providerRefundId) throw new RefundError("wrong_state", "The provider already has this refund.");

    await tx.$executeRaw`
      UPDATE refund_cases SET execution_attempts = execution_attempts + 1, last_attempt_at = now(), updated_at = now()
      WHERE id = ${locked.id}::uuid
    `;
    await insertRefundEvent(tx, {
      actor: { kind: "owner", userId: owner.userId },
      caseId: locked.id,
      caseVersion: locked.version,
      kind: "execution_retried",
      metadata: { attempt: locked.executionAttempts + 1 },
    });
    return { ...locked, executionAttempts: locked.executionAttempts + 1 };
  });

  // 2. Ask the provider. Nothing is held open while it answers.
  let answer: Awaited<ReturnType<PaymentProviderAdapter["createRefund"]>>;
  try {
    answer = await provider.createRefund({
      amountRupiah: row.amountRupiah,
      currency: "IDR",
      providerPaymentId: row.providerPaymentId,
      refundReference: row.reference,
    });
  } catch (error) {
    // Timed out, unreachable, anything unexpected: the provider may or may not have it.
    await prisma.$transaction(async (tx) => {
      const locked = await lockRefundCase(tx, row.id);
      if (locked.state !== "processing") return;
      await tx.$executeRaw`UPDATE refund_cases SET outcome_unknown = true, updated_at = now() WHERE id = ${row.id}::uuid`;
      await insertRefundEvent(tx, {
        actor: { kind: "system" },
        caseId: row.id,
        caseVersion: locked.version,
        kind: "execution_unknown",
        metadata: { timeout: error instanceof ProviderOutcomeUnknownError },
      });
    });
    return { result: "unknown" };
  }

  // 3. Record the answer.
  return prisma.$transaction(async (tx): Promise<ExecuteResult> => {
    const locked = await lockRefundCase(tx, row.id);
    if (answer.outcome === "rejected") {
      if (locked.state === "processing") {
        await endRefundCase(tx, locked, "failed", { kind: "system" }, `Penyedia menolak: ${answer.reason}`);
      }
      return { reason: answer.reason, result: "rejected" };
    }

    if (locked.state === "processing" && !locked.providerRefundId) {
      await tx.$executeRaw`
        UPDATE refund_cases SET provider_refund_id = ${answer.providerRefundId}, outcome_unknown = false, updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      await insertRefundEvent(tx, {
        actor: { kind: "system" },
        caseId: row.id,
        caseVersion: locked.version,
        kind: "execution_accepted",
        metadata: { providerRefundId: answer.providerRefundId, providerState: answer.state },
      });
    }
    return { providerRefundId: answer.providerRefundId, result: "sent" };
  });
}

type ReconcileOutcome =
  | { result: "completed" | "failed" | "not_seen" | "pending" | "unchanged" }
  | { result: "mismatch" };

/**
 * Asks the provider what it knows about a refund and applies the answer. This
 * is what a timeout leads to. If the provider has no record, the call never
 * arrived and it is safe to send again; if it has one, the case follows it. A
 * status that does not match the case (amount, payment, account) is not
 * applied. Safe to run any number of times.
 */
async function reconcileRefund(
  caseId: string,
  deps: { provider: PaymentProviderAdapter },
  actor: { kind: "owner"; userId: string } | { kind: "system" } = { kind: "system" },
): Promise<ReconcileOutcome> {
  const [ref = null] = await prisma.$queryRaw<Array<{ reference: string; state: string }>>`
    SELECT reference, state::text AS state FROM refund_cases WHERE id = ${caseId}::uuid
  `;
  if (!ref) throw new RefundError("not_found", "The refund case was not found.");
  if (ref.state !== "processing") return { result: "unchanged" };

  let status: ProviderRefundStatus;
  try {
    status = await deps.provider.getRefundStatus(ref.reference);
  } catch {
    throw new RefundError("provider_unavailable", "The provider did not answer.");
  }

  return prisma.$transaction(async (tx): Promise<ReconcileOutcome> => {
    const row = await lockRefundCase(tx, caseId);
    if (row.state !== "processing") return { result: "unchanged" };

    if (!status.found) {
      // The provider has no record: the request never arrived. Allow another attempt.
      if (!row.outcomeUnknown || row.providerRefundId) return { result: "unchanged" };
      await tx.$executeRaw`UPDATE refund_cases SET outcome_unknown = false, updated_at = now() WHERE id = ${row.id}::uuid`;
      await insertRefundEvent(tx, {
        actor,
        caseId: row.id,
        caseVersion: row.version,
        kind: "execution_reconciled",
        metadata: { providerHasRecord: false },
      });
      return { result: "not_seen" };
    }

    if (!sameFacts(row, status, deps.provider) || (row.providerRefundId && row.providerRefundId !== status.providerRefundId)) {
      await insertRefundEvent(tx, {
        actor,
        caseId: row.id,
        caseVersion: row.version,
        kind: "note",
        metadata: { reason: "provider_status_mismatch" },
        note: "Status dari penyedia tidak cocok dengan kasus ini, jadi tidak dipakai.",
      });
      return { result: "mismatch" };
    }

    if (status.state === "succeeded") {
      // The completion points at a stored event for this refund (the database requires it), so the
      // status answer is recorded first, as a reconciliation event, once per refund.
      const eventId = await recordRefundStatusEvent(tx, row, status, deps.provider);
      await completeRefund(tx, row, { actor, eventId, source: "provider_status" }, status.providerRefundId);
      return { result: "completed" };
    }
    if (status.state === "failed") {
      await endRefundCase(tx, row, "failed", actor, "Penyedia melaporkan pengembalian dana gagal.");
      return { result: "failed" };
    }

    if (!row.providerRefundId || row.outcomeUnknown) {
      await tx.$executeRaw`
        UPDATE refund_cases SET provider_refund_id = COALESCE(provider_refund_id, ${status.providerRefundId}),
          outcome_unknown = false, updated_at = now() WHERE id = ${row.id}::uuid
      `;
      await insertRefundEvent(tx, {
        actor,
        caseId: row.id,
        caseVersion: row.version,
        kind: "execution_reconciled",
        metadata: { providerHasRecord: true, providerState: status.state, providerRefundId: status.providerRefundId },
      });
    }
    return { result: "pending" };
  });
}

type ManualTransferInput = {
  caseId: string;
  destinationHolder: string;
  destinationMasked: string;
  expectedVersion: number;
  proofNote: string;
  reason: string;
  transferReference: string;
};

/** The destination is kept masked: never more than the last four digits of an account or number. */
function requireMaskedDestination(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < 4 || text.length > 80) {
    throw new RefundError("invalid_input", "Tulis tujuan transfer dengan nomor yang disamarkan (4 sampai 80 karakter).");
  }
  if (/\d{5,}/u.test(text.replace(/[\s.-]/gu, ""))) {
    throw new RefundError("invalid_input", "Samarkan nomor tujuan: tulis hanya 4 digit terakhir, misalnya BCA ••••1234 a.n. Budi.");
  }
  return text;
}

/**
 * The manual-transfer path, for when the provider cannot refund to the original
 * method. The owner records where the money went (masked), the bank reference
 * and the proof, and confirms it. That confirmation is what completes the case;
 * there is no provider call. The proof is a reference and a note, not a file:
 * the app's R2 helpers are built for specific private uploads and do not fit a
 * new proof file without new key rules and screens.
 */
async function recordManualTransfer(owner: OwnerContext, input: ManualTransferInput, env: Env = process.env) {
  const reason = requireReason(input.reason);
  const destinationMasked = requireMaskedDestination(input.destinationMasked);
  if (!isDestinationHolder(input.destinationHolder)) {
    throw new RefundError("invalid_input", "Pilih atas nama siapa rekening atau e-wallet tujuan.");
  }
  const transferReference = typeof input.transferReference === "string" ? input.transferReference.trim() : "";
  if (transferReference.length < 3 || transferReference.length > 120) {
    throw new RefundError("invalid_input", "Tulis nomor referensi transfer (3 sampai 120 karakter).");
  }
  const proofNote = typeof input.proofNote === "string" ? input.proofNote.trim() : "";
  if (proofNote.length < 10 || proofNote.length > MAX_PROOF_NOTE_LENGTH) {
    throw new RefundError("invalid_input", "Tulis catatan bukti transfer (10 sampai 1000 karakter).");
  }
  const destinationHolder = input.destinationHolder;

  return prisma.$transaction(async (tx: Tx) => {
    await assertStillOwner(tx, owner, env);
    const row = await lockRefundCase(tx, input.caseId, input.expectedVersion);
    if (row.state !== "approved") throw new RefundError("wrong_state", "Only an approved refund can be paid by manual transfer.");

    const [open = null] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM payment_disputes
      WHERE order_id = ${row.orderId}::uuid AND provider_payment_id = ${row.providerPaymentId} AND state = 'open' LIMIT 1
    `;
    if (open) throw new RefundError("dispute_open", "A dispute is open on the payment.");

    return completeRefund(tx, row, {
      actor: { kind: "owner", userId: owner.userId },
      destinationHolder,
      destinationMasked,
      proofNote,
      reason,
      source: "owner_manual",
      transferReference,
    });
  });
}

export { executeProviderRefund, recordManualTransfer, reconcileRefund, requireMaskedDestination };
export type { ExecuteResult, ManualTransferInput, ReconcileOutcome };
