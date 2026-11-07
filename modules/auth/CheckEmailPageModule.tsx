import { AuthShell } from "./components/auth-shell";
import { FormNotice } from "./components/form-notice";
import { ResendVerificationForm } from "./components/resend-verification-form";

function CheckEmailPageModule({
  devLink,
  loginHref,
  referral,
  returnTo,
}: {
  /** Local development only: the link, shown because no mailbox is involved. */
  devLink: string | null;
  loginHref: string;
  referral?: string | null;
  returnTo?: string | null;
}) {
  return (
    <AuthShell
      description="Kami mengirim tautan verifikasi ke emailmu kalau alamat itu bisa dipakai untuk mendaftar."
      eyebrow="Verifikasi email"
      title="Periksa emailmu"
    >
      <div className="space-y-6">
        <FormNotice label="Langkah berikutnya" tone="neutral">
          <p>
            Buka email dari PTN Pro, lalu pilih tombol verifikasi. Tautannya berlaku 24 jam dan hanya bisa dipakai sekali.
            Kalau belum ada, periksa folder spam.
          </p>
        </FormNotice>

        {devLink ? (
          <FormNotice tone="neutral">
            <p className="font-medium">Tautan verifikasi (hanya tampil di komputer pengembang)</p>
            <a className="mt-1 inline-flex min-h-11 items-center break-all text-sm font-semibold text-primary-700 underline underline-offset-4" href={devLink}>
              Buka tautan verifikasi
            </a>
          </FormNotice>
        ) : null}

        <div className="space-y-3">
          <h3 className="font-heading text-xl font-semibold text-secondary-900">Belum menerima email?</h3>
          <p className="text-sm leading-6 text-secondary-600">
            Masukkan emailmu lagi untuk meminta tautan baru. Kamu bisa meminta sampai 3 kali dalam satu jam.
          </p>
          <ResendVerificationForm loginHref={loginHref} referral={referral} returnTo={returnTo} />
        </div>
      </div>
    </AuthShell>
  );
}

export { CheckEmailPageModule };
