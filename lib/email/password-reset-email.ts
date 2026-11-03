import { PASSWORD_RESET_WINDOW_MINUTES } from "@/lib/auth/constants";

import type { EmailMessage } from "./mailer";

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/** Indonesian reset email. The link appears here and nowhere else the app writes. */
function buildPasswordResetEmail({
  fullName,
  idempotencyKey,
  resetUrl,
  to,
}: {
  fullName: string;
  idempotencyKey: string;
  resetUrl: string;
  to: string;
}): EmailMessage {
  const name = fullName.trim() || "kamu";
  const minutes = PASSWORD_RESET_WINDOW_MINUTES;

  const text = [
    `Halo ${name},`,
    "",
    "Kami menerima permintaan untuk mengatur ulang kata sandi akunmu. Buka tautan ini untuk membuat kata sandi baru:",
    "",
    resetUrl,
    "",
    `Tautan ini berlaku ${minutes} menit dan hanya bisa dipakai sekali.`,
    "",
    "Kalau bukan kamu yang meminta, abaikan saja email ini. Kata sandimu tidak berubah.",
    "",
    "Vecalss tidak pernah meminta kata sandimu lewat email, chat, atau telepon. Jangan bagikan tautan ini ke siapa pun.",
    "",
    "Salam,",
    "Tim Vecalss",
  ].join("\n");

  const safeUrl = escapeHtml(resetUrl);
  const html = `<!doctype html>
<html lang="id">
<body style="margin:0;padding:24px;background:#f4f6f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#14231d;line-height:1.6">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 16px">Halo ${escapeHtml(name)},</p>
<p style="margin:0 0 20px">Kami menerima permintaan untuk mengatur ulang kata sandi akunmu. Buka tautan ini untuk membuat kata sandi baru:</p>
<p style="margin:0 0 20px"><a href="${safeUrl}" style="display:inline-block;background:#014c38;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Atur ulang kata sandi</a></p>
<p style="margin:0 0 20px;font-size:14px;color:#4b5b54">Kalau tombolnya tidak bisa diklik, salin tautan ini ke peramban:<br><span style="word-break:break-all">${safeUrl}</span></p>
<p style="margin:0 0 16px">Tautan ini berlaku ${minutes} menit dan hanya bisa dipakai sekali.</p>
<p style="margin:0 0 16px">Kalau bukan kamu yang meminta, abaikan saja email ini. Kata sandimu tidak berubah.</p>
<p style="margin:0 0 16px">Vecalss tidak pernah meminta kata sandimu lewat email, chat, atau telepon. Jangan bagikan tautan ini ke siapa pun.</p>
<p style="margin:0">Salam,<br>Tim Vecalss</p>
</div>
</body>
</html>`;

  return {
    html,
    idempotencyKey,
    subject: "Atur ulang kata sandi akun Vecalss-mu",
    text,
    to,
  };
}

export { buildPasswordResetEmail };
