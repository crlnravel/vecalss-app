import "server-only";

import type { EmailMessage, MailResult } from "@/lib/email/mailer";
import { prisma } from "@/lib/prisma";

import type { OutboxHandlers, OutboxJob } from "./outbox";

const MISMATCH_LABELS: Record<string, string> = {
  amount: "nominal",
  buyer: "pembeli",
  currency: "mata uang",
  merchant: "akun merchant",
  package: "paket",
  payment: "nomor pembayaran",
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
  sendEmail: (message: EmailMessage) => Promise<MailResult>;
};

/**
 * Handlers for the payment outbox. A handler throws to ask for a retry; the
 * mailer's idempotency key is the job id, so a retry after a send that did go
 * out does not email twice.
 */
function createPaymentOutboxHandlers({ alertTo, sendEmail }: HandlerDeps): OutboxHandlers {
  return {
    async critical_alert(job: OutboxJob) {
      if (!alertTo) throw new Error("No alert address is set (MAINTENANCE_ALERT_EMAIL).");

      const payload = job.payload as { kind?: string; paymentEventId?: string; reason?: string };
      const held = payload.kind === "review"
        ? "Ada pembayaran masuk yang perlu ditinjau"
        : "Ada pembayaran yang ditahan karena tidak cocok dengan pesanan";
      const reason = describeReason(payload.reason);
      const lines = [
        `${held}.`,
        `Penyebab: ${reason}.`,
        job.orderId ? `Pesanan: ${job.orderId}.` : "Pesanan: tidak ditemukan.",
        payload.paymentEventId ? `Catatan kejadian: ${payload.paymentEventId}.` : "",
        "Akses belum diberikan. Periksa catatan pembayaran sebelum mengambil langkah apa pun.",
      ].filter(Boolean);

      const result = await sendEmail({
        html: lines.map((line) => `<p>${line}</p>`).join(""),
        idempotencyKey: `payment-outbox:${job.id}`,
        subject: "Vecalss: pembayaran perlu diperiksa",
        text: lines.join("\n"),
        to: alertTo,
      });
      if (!result.ok) throw new Error(`The alert email was not sent (${result.reason}).`);
    },

    async receipt_email(job: OutboxJob) {
      // Stub until MS-08 builds receipts. The job proves a receipt was owed for
      // this order; it only checks that the order is really paid and does not send.
      if (!job.orderId) throw new Error("A receipt job needs an order.");
      const order = await prisma.paymentOrder.findUnique({
        select: { status: true },
        where: { id: job.orderId },
      });
      if (order?.status !== "paid") throw new Error("The order is not paid.");
    },
  };
}

export { createPaymentOutboxHandlers, describeReason };
export type { HandlerDeps };
