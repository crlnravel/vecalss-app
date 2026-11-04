import "server-only";

import type { EmailMessage, MailResult } from "@/lib/email/mailer";
import { retryFulfillment } from "@/lib/fulfillment/grant";
import { sendReceiptEmail } from "@/lib/fulfillment/receipt-email";

import type { OutboxHandlers, OutboxJob } from "./outbox";

const MISMATCH_LABELS: Record<string, string> = {
  amount: "nominal",
  buyer: "pembeli",
  currency: "mata uang",
  merchant: "akun merchant",
  package: "paket",
  full_end_not_configured: "tanggal akhir Full Access belum diatur",
  full_end_passed: "tanggal akhir Full Access sudah lewat",
  grant_error: "kesalahan saat memberi akses",
  paused: "akses sedang dijeda",
  payment: "nomor pembayaran",
  plan_unknown: "paket tidak dikenali",
  student_not_found: "akun pembeli tidak ditemukan",
  unknown_order: "pesanan tidak dikenal",
};

function describeReason(reason: unknown) {
  if (typeof reason !== "string" || !reason) return "alasan tidak tercatat";

  return reason
    .split(",")
    .map((part) => MISMATCH_LABELS[part] ?? part.replaceAll("_", " "))
    .join(", ");
}

type HandlerDeps = {
  alertTo: string | null;
  /** Server settings for the access grant. Tests pass their own. */
  fulfillmentEnv?: Partial<Record<string, string | undefined>>;
  sendEmail: (message: EmailMessage) => Promise<MailResult>;
};

/**
 * Handlers for the payment outbox. A handler throws to ask for a retry; the
 * mailer's idempotency key is the job id, so a retry after a send that did go
 * out does not email twice.
 */
function createPaymentOutboxHandlers({ alertTo, fulfillmentEnv, sendEmail }: HandlerDeps): OutboxHandlers {
  return {
    async access_grant(job: OutboxJob) {
      if (!job.orderId) throw new Error("A grant job needs an order.");

      const result = await retryFulfillment(job.orderId, { env: fulfillmentEnv });
      if (result.status === "pending") throw new Error(`Access is still pending (${result.reason}).`);
      if (result.status === "not_paid") throw new Error("The order is not paid.");
    },

    async critical_alert(job: OutboxJob) {
      if (!alertTo) throw new Error("No alert address is set (MAINTENANCE_ALERT_EMAIL).");

      const payload = job.payload as { kind?: string; paymentEventId?: string; reason?: string };
      const stalled = payload.kind === "capture_without_access";
      const held = stalled
        ? "Ada pembayaran yang sudah masuk lebih dari 1 jam lalu, tetapi akses pembelinya belum diberikan"
        : payload.kind === "review"
          ? "Ada pembayaran masuk yang perlu ditinjau"
          : "Ada pembayaran yang ditahan karena tidak cocok dengan pesanan";
      const reason = describeReason(payload.reason);
      const lines = [
        `${held}.`,
        `Penyebab: ${reason}.`,
        job.orderId ? `Pesanan: ${job.orderId}.` : "Pesanan: tidak ditemukan.",
        payload.paymentEventId ? `Catatan kejadian: ${payload.paymentEventId}.` : "",
        stalled
          ? "Uangnya sudah diterima. Buka antrean fraud, periksa kasusnya, lalu berikan akses atau kembalikan dana."
          : "Akses belum diberikan. Periksa catatan pembayaran sebelum mengambil langkah apa pun.",
      ].filter(Boolean);

      const result = await sendEmail({
        html: lines.map((line) => `<p>${line}</p>`).join(""),
        idempotencyKey: `payment-outbox:${job.id}`,
        subject: stalled ? "Vecalss: pembayaran masuk, akses belum diberikan" : "Vecalss: pembayaran perlu diperiksa",
        text: lines.join("\n"),
        to: alertTo,
      });
      if (!result.ok) throw new Error(`The alert email was not sent (${result.reason}).`);
    },

    async receipt_email(job: OutboxJob) {
      if (!job.orderId) throw new Error("A receipt job needs an order.");
      await sendReceiptEmail(job.orderId, { sendEmail });
    },
  };
}

export { createPaymentOutboxHandlers, describeReason };
export type { HandlerDeps };
