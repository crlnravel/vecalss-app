import { VERIFICATION_TOKEN_HOURS } from "@/lib/registration/constants";

import type { EmailMessage } from "./mailer";

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function page(body: string) {
  return `<!doctype html>
<html lang="id">
<body style="margin:0;padding:24px;background:#f4f6f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#14231d;line-height:1.6">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
${body}
</div>
</body>
</html>`;
}

function button(url: string, label: string) {
  return `<p style="margin:0 0 20px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#014c38;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${label}</a></p>`;
}

/** The email that carries the verification link. The link appears here and nowhere else the app writes. */
function buildVerificationEmail({
  fullName,
  idempotencyKey,
  to,
  verifyUrl,
}: {
  fullName: string;
  idempotencyKey: string;
  to: string;
  verifyUrl: string;
}): EmailMessage {
  const name = fullName.trim() || "kamu";
  const hours = VERIFICATION_TOKEN_HOURS;

  const text = [
    `Halo ${name},`,
    "",
    "Seseorang membuat akun PTN Pro dengan alamat email ini. Kalau itu kamu, buka tautan ini untuk memverifikasi emailmu:",
    "",
    verifyUrl,
    "",
    `Tautan ini berlaku ${hours} jam dan hanya bisa dipakai sekali. Setelah itu kamu bisa masuk dengan email dan kata sandi yang tadi kamu buat.`,
    "",
    "Kalau bukan kamu, abaikan saja email ini. Akun yang tidak diverifikasi dihapus otomatis dalam 7 hari.",
    "",
    "PTN Pro tidak pernah meminta kata sandimu lewat email, chat, atau telepon. Jangan bagikan tautan ini ke siapa pun.",
    "",
    "Salam,",
    "Tim PTN Pro",
  ].join("\n");

  const html = page(`<p style="margin:0 0 16px">Halo ${escapeHtml(name)},</p>
<p style="margin:0 0 20px">Seseorang membuat akun PTN Pro dengan alamat email ini. Kalau itu kamu, buka tautan ini untuk memverifikasi emailmu:</p>
${button(verifyUrl, "Verifikasi email")}
<p style="margin:0 0 20px;font-size:14px;color:#4b5b54">Kalau tombolnya tidak bisa diklik, salin tautan ini ke peramban:<br><span style="word-break:break-all">${escapeHtml(verifyUrl)}</span></p>
<p style="margin:0 0 16px">Tautan ini berlaku ${hours} jam dan hanya bisa dipakai sekali. Setelah itu kamu bisa masuk dengan email dan kata sandi yang tadi kamu buat.</p>
<p style="margin:0 0 16px">Kalau bukan kamu, abaikan saja email ini. Akun yang tidak diverifikasi dihapus otomatis dalam 7 hari.</p>
<p style="margin:0 0 16px">PTN Pro tidak pernah meminta kata sandimu lewat email, chat, atau telepon. Jangan bagikan tautan ini ke siapa pun.</p>
<p style="margin:0">Salam,<br>Tim PTN Pro</p>`);

  return { html, idempotencyKey, subject: "Verifikasi email akun PTN Pro-mu", text, to };
}

/**
 * Sent instead of a verification link when someone signs up with an address that
 * already has an account. The form answers the same way either way, so this email
 * is the only place the owner of the address learns it.
 */
function buildExistingAccountEmail({
  fullName,
  idempotencyKey,
  loginUrl,
  resetUrl,
  to,
}: {
  fullName: string;
  idempotencyKey: string;
  loginUrl: string;
  resetUrl: string;
  to: string;
}): EmailMessage {
  const name = fullName.trim() || "kamu";

  const text = [
    `Halo ${name},`,
    "",
    "Seseorang, mungkin kamu, mencoba membuat akun PTN Pro dengan alamat email ini. Alamat ini sudah punya akun, jadi tidak ada akun baru yang dibuat dan akunmu tidak berubah.",
    "",
    "Untuk masuk:",
    loginUrl,
    "",
    "Kalau kamu lupa kata sandi:",
    resetUrl,
    "",
    "Kalau bukan kamu yang mencoba mendaftar, abaikan saja email ini.",
    "",
    "Salam,",
    "Tim PTN Pro",
  ].join("\n");

  const html = page(`<p style="margin:0 0 16px">Halo ${escapeHtml(name)},</p>
<p style="margin:0 0 20px">Seseorang, mungkin kamu, mencoba membuat akun PTN Pro dengan alamat email ini. Alamat ini sudah punya akun, jadi tidak ada akun baru yang dibuat dan akunmu tidak berubah.</p>
${button(loginUrl, "Masuk ke PTN Pro")}
<p style="margin:0 0 16px">Kalau kamu lupa kata sandi, <a href="${escapeHtml(resetUrl)}" style="color:#014c38">atur ulang kata sandi di sini</a>.</p>
<p style="margin:0 0 16px">Kalau bukan kamu yang mencoba mendaftar, abaikan saja email ini.</p>
<p style="margin:0">Salam,<br>Tim PTN Pro</p>`);

  return { html, idempotencyKey, subject: "Kamu sudah punya akun PTN Pro", text, to };
}

export { buildExistingAccountEmail, buildVerificationEmail };
