import "server-only";

import { accessPlanLabel } from "@/lib/billing/plans";
import { getAppBaseUrl, getSupportContact } from "@/lib/config";
import type { EmailMessage, MailResult } from "@/lib/email/mailer";
import { formatRupiah } from "@/lib/pricing/schedule";
import { prisma } from "@/lib/prisma";

type ReceiptEmailDeps = {
  /** Where the app is served, for links. */
  appBaseUrl?: string;
  nodeEnv?: string;
  sendEmail: (message: EmailMessage) => Promise<MailResult>;
};

type ReceiptRow = {
  accessPlanCode: string | null;
  amountRupiah: number;
  buyerEmail: string;
  buyerName: string;
  deliveryStatus: string;
  grantedAt: Date | null;
  id: string;
  packageName: string;
  receiptNumber: string;
  reference: string;
  validFrom: Date | null;
  validUntil: Date | null;
};

const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function composeReceiptEmail(receipt: ReceiptRow, appBaseUrl: string, support: { label: string; url: string }) {
  const planLabel = accessPlanLabel(receipt.accessPlanCode);
  const from = receipt.validFrom ? dateFormat.format(receipt.validFrom) : "-";
  const until = receipt.validUntil ? dateFormat.format(receipt.validUntil) : "-";
  const firstName = receipt.buyerName.trim().split(/\s+/u)[0] || "Voyager";
  const statusLink = `${appBaseUrl}/pricing/checkout/status/${receipt.reference}`;
  const termsLink = `${appBaseUrl}/syarat-pembelian`;

  const rows: Array<[string, string]> = [
    ["Nomor struk", receipt.receiptNumber],
    ["Paket", `${planLabel} (${receipt.packageName})`],
    ["Total dibayar", formatRupiah(receipt.amountRupiah)],
    ["Akses aktif", `${from} sampai ${until}`],
  ];
  const intro = `Halo ${firstName}, pembayaranmu sudah kami terima dan aksesmu sudah aktif.`;
  const text = [
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Lihat status pembayaranmu: ${statusLink}`,
    `Syarat Pembelian: ${termsLink}`,
    `Butuh bantuan? ${support.label}: ${support.url}`,
  ].join("\n");
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    "<table role=\"presentation\" style=\"border-collapse:collapse\">",
    ...rows.map(
      ([label, value]) =>
        `<tr><td style="padding:2px 16px 2px 0;color:#5f776a">${escapeHtml(label)}</td><td style="padding:2px 0"><strong>${escapeHtml(value)}</strong></td></tr>`,
    ),
    "</table>",
    `<p><a href="${escapeHtml(statusLink)}">Lihat status pembayaranmu</a><br><a href="${escapeHtml(termsLink)}">Syarat Pembelian</a></p>`,
    `<p>Butuh bantuan? <a href="${escapeHtml(support.url)}">${escapeHtml(support.label)}</a></p>`,
  ].join("");

  return { html, subject: `Struk pembelian Vecalss ${receipt.receiptNumber}`, text };
}

/**
 * Sends the receipt email for a delivered order, once. Every attempt is written
 * to `receipt_deliveries`; a job that runs again after a success finds that row
 * and sends nothing. The mailer's idempotency key is the receipt, so even a send
 * that went out but was never recorded (a timeout after Resend accepted it) is
 * not delivered twice.
 *
 * It throws to ask for a retry: while access is still pending (the email says
 * access is active, so it waits for the grant) and when the send fails.
 */
async function sendReceiptEmail(orderId: string, deps: ReceiptEmailDeps) {
  const [receipt = null] = await prisma.$queryRaw<ReceiptRow[]>`
    SELECT r.id, r.receipt_number AS "receiptNumber", r.package_name AS "packageName",
           r.amount_rupiah AS "amountRupiah", r.delivery_status::text AS "deliveryStatus",
           r.access_plan_code AS "accessPlanCode", r.valid_from AS "validFrom",
           r.valid_until AS "validUntil", r.granted_at AS "grantedAt", o.reference,
           u.email AS "buyerEmail", u.full_name AS "buyerName"
    FROM payment_receipts r
    JOIN payment_orders o ON o.id = r.order_id
    JOIN users u ON u.id = r.buyer_id
    WHERE r.order_id = ${orderId}::uuid
  `;
  if (!receipt) throw new Error("The order has no receipt.");
  if (receipt.deliveryStatus !== "delivered") throw new Error("Access is not delivered yet.");

  const [alreadySent] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM receipt_deliveries WHERE receipt_id = ${receipt.id}::uuid AND channel = 'email' AND outcome = 'sent' LIMIT 1
  `;
  if (alreadySent) return { sent: false as const };

  const appBaseUrl = deps.appBaseUrl ?? getAppBaseUrl();
  const message = composeReceiptEmail(receipt, appBaseUrl, getSupportContact());
  const result = await deps.sendEmail({
    ...message,
    idempotencyKey: `receipt-email:${receipt.id}`,
    to: receipt.buyerEmail,
  });

  const production = (deps.nodeEnv ?? process.env.NODE_ENV) === "production";
  if (result.ok) {
    await prisma.$executeRaw`
      INSERT INTO receipt_deliveries (receipt_id, channel, outcome, provider_message_id, detail)
      VALUES (${receipt.id}::uuid, 'email', 'sent', ${result.id}, ${result.redirected ? "dev_redirect" : null})
      ON CONFLICT DO NOTHING
    `;
    return { sent: true as const };
  }

  // Outside production an unset sender or redirect only means this machine
  // cannot send mail: record that and stop, rather than retry for hours.
  const localOnly = !production && (result.reason === "dev_redirect_required" || result.reason === "not_configured");
  await prisma.$executeRaw`
    INSERT INTO receipt_deliveries (receipt_id, channel, outcome, detail)
    VALUES (${receipt.id}::uuid, 'email', ${localOnly ? "skipped" : "failed"}, ${result.reason})
  `;
  if (localOnly) return { sent: false as const };
  throw new Error(`The receipt email was not sent (${result.reason}).`);
}

export { composeReceiptEmail, sendReceiptEmail };
export type { ReceiptEmailDeps };
