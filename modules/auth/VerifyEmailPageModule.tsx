import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";

import { AuthShell } from "./components/auth-shell";
import { FormNotice } from "./components/form-notice";
import { VerifyEmailForm } from "./components/verify-email-form";

function VerifyEmailPageModule({
  isValid,
  referral,
  resendHref,
  returnTo,
  token,
}: {
  isValid: boolean;
  referral?: string | null;
  resendHref: string;
  returnTo?: string | null;
  token: string;
}) {
  return (
    <AuthShell
      description={isValid ? "Satu langkah lagi sebelum kamu bisa masuk." : "Tautan verifikasi ini sudah tidak bisa dipakai."}
      eyebrow="Verifikasi email"
      title={isValid ? "Verifikasi emailmu" : "Tautan tidak berlaku"}
    >
      {isValid ? (
        <div className="space-y-5">
          <p className="text-base leading-7 text-secondary-600">
            Buat kata sandi untuk akunmu, lalu pilih tombol di bawah untuk memverifikasi email. Setelah itu kamu bisa masuk.
          </p>
          <VerifyEmailForm referral={referral} resendHref={resendHref} returnTo={returnTo} token={token} />
        </div>
      ) : (
        <div className="space-y-5">
          <FormNotice tone="danger">
            Tautan ini tidak valid atau sudah kedaluwarsa. Kalau emailmu sudah terverifikasi, kamu bisa langsung masuk. Kalau belum, minta tautan baru.
          </FormNotice>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Link
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:text-primary-800"
              href="/login"
            >
              Ke halaman masuk
            </Link>
            <Link className={buttonVariants({ size: "lg", variant: "default" })} href={resendHref}>
              Minta tautan baru
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export { VerifyEmailPageModule };
