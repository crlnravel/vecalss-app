"use server";

import { approveRefund, cancelRefund, prepareRefund, rejectRefund } from "@/lib/refunds/cases";
import { recordDisputeNotice, resolveDispute } from "@/lib/refunds/disputes";
import { RefundError } from "@/lib/refunds/errors";
import { executeProviderRefund, reconcileRefund, recordManualTransfer } from "@/lib/refunds/execute";
import { acceptReviewedOrder } from "@/lib/refunds/review";
import { getPaymentProvider } from "@/lib/payments/provider";
import { integer, runAdmin, runOwner, text } from "@/modules/admin/fraud/action-helpers";

/**
 * Server actions behind the refund and dispute panels of the order page. The
 * authority rules are in the lib functions; these only read the form, pick the
 * provider, and say what happened in words (see action-helpers).
 */

function orderPage(form: FormData) {
  const orderId = text(form, "orderId");
  return /^[0-9a-f-]{36}$/iu.test(orderId) ? `/admin/fraud/orders/${orderId}` : "/admin/fraud/orders";
}

/** A `datetime-local` value is Jakarta time. Empty means "now", which the lib supplies from the database clock. */
function jakartaDate(form: FormData, key: string): Date | null {
  const value = text(form, key);
  if (!value) return null;

  const parsed = new Date(`${value.length === 16 ? `${value}:00` : value}+07:00`);
  if (Number.isNaN(parsed.getTime())) throw new RefundError("invalid_input", "Tanggal dan jamnya belum benar.");
  return parsed;
}

function rupiah(form: FormData, key: string): number | null {
  const value = text(form, key).replaceAll(".", "");
  if (!value) return null;
  if (!/^\d{1,9}$/u.test(value)) throw new RefundError("invalid_input", "Jumlah harus angka rupiah tanpa titik atau koma.");
  return Number.parseInt(value, 10);
}

async function prepareRefundAction(form: FormData) {
  await runAdmin(form, orderPage(form), "Pengembalian dana disiapkan. Pemilik yang memutuskan.", (admin) =>
    prepareRefund(admin, {
      amountRupiah: rupiah(form, "amount"),
      orderId: text(form, "orderId"),
      providerPaymentId: text(form, "providerPaymentId") || null,
      reasonCode: text(form, "reasonCode"),
      requestChannel: text(form, "requestChannel"),
      requestedAt: jakartaDate(form, "requestedAt"),
      requestNote: text(form, "requestNote"),
    }),
  );
}

async function approveRefundAction(form: FormData) {
  await runOwner(form, orderPage(form), "Pengembalian dana disetujui.", (owner) =>
    approveRefund(owner, {
      caseId: text(form, "caseId"),
      expectedVersion: integer(form, "version"),
      reason: text(form, "reason"),
      revokeAccess: form.get("revokeAccess") === "on",
    }),
  );
}

async function rejectRefundAction(form: FormData) {
  await runOwner(form, orderPage(form), "Permintaan ditolak.", (owner) =>
    rejectRefund(owner, { caseId: text(form, "caseId"), expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function cancelRefundAction(form: FormData) {
  await runOwner(form, orderPage(form), "Pengembalian dana dibatalkan.", (owner) =>
    cancelRefund(owner, { caseId: text(form, "caseId"), expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function executeRefundAction(form: FormData) {
  await runOwner(form, orderPage(form), "Permintaan dikirim ke penyedia. Selesai setelah penyedia mengonfirmasi.", async (owner) => {
    const result = await executeProviderRefund(
      owner,
      { caseId: text(form, "caseId"), expectedVersion: integer(form, "version") },
      { provider: getPaymentProvider() },
    );
    if (result.result === "unknown") throw new RefundError("provider_unavailable", "The provider did not answer.");
    if (result.result === "rejected") throw new RefundError("provider_rejected", result.reason);
  });
}

async function reconcileRefundAction(form: FormData) {
  await runOwner(form, orderPage(form), "Status di penyedia sudah diperiksa.", async (owner) => {
    const provider = getPaymentProvider();
    if (!provider) throw new RefundError("no_provider", "No payment provider is configured.");
    await reconcileRefund(text(form, "caseId"), { provider }, { kind: "owner", userId: owner.userId });
  });
}

async function manualTransferAction(form: FormData) {
  await runOwner(form, orderPage(form), "Transfer manual dicatat. Pengembalian dana selesai.", (owner) =>
    recordManualTransfer(owner, {
      caseId: text(form, "caseId"),
      destinationHolder: text(form, "destinationHolder"),
      destinationMasked: text(form, "destinationMasked"),
      expectedVersion: integer(form, "version"),
      proofNote: text(form, "proofNote"),
      reason: text(form, "reason"),
      transferReference: text(form, "transferReference"),
    }),
  );
}

async function recordDisputeAction(form: FormData) {
  await runOwner(form, orderPage(form), "Sengketa dicatat. Akses pembeli dijeda.", (owner) =>
    recordDisputeNotice(owner, {
      amountRupiah: rupiah(form, "amount"),
      noticeReceivedAt: jakartaDate(form, "noticeReceivedAt"),
      orderId: text(form, "orderId"),
      providerDisputeId: text(form, "providerDisputeId"),
      providerPaymentId: text(form, "providerPaymentId") || null,
      reasonText: text(form, "reasonText"),
      responseDueAt: jakartaDate(form, "responseDueAt"),
    }),
  );
}

async function resolveDisputeAction(form: FormData) {
  const outcome = text(form, "outcome");
  await runOwner(form, orderPage(form), outcome === "won" ? "Sengketa dimenangkan. Akses dilanjutkan." : "Sengketa kalah. Akses diakhiri.", (owner) =>
    resolveDispute(owner, { disputeId: text(form, "disputeId"), expectedVersion: integer(form, "version"), outcome, reason: text(form, "reason") }),
  );
}

async function acceptReviewAction(form: FormData) {
  await runOwner(form, orderPage(form), "Pembayaran diterima dan akses diberikan.", (owner) =>
    acceptReviewedOrder(owner, { orderId: text(form, "orderId"), reason: text(form, "reason") }),
  );
}

export {
  acceptReviewAction,
  approveRefundAction,
  cancelRefundAction,
  executeRefundAction,
  manualTransferAction,
  prepareRefundAction,
  reconcileRefundAction,
  recordDisputeAction,
  rejectRefundAction,
  resolveDisputeAction,
};
