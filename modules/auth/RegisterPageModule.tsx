import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";

import { AuthShell } from "./components/auth-shell";
import { FormNotice } from "./components/form-notice";
import { RegisterForm } from "./components/register-form";

function RegisterPageModule({
  closedFormUrl,
  loginHref,
  referral,
  returnTo,
  siteKey,
}: {
  /** Where to register while signup is closed. Null when signup is open. */
  closedFormUrl: string | null;
  loginHref: string;
  referral?: string | null;
  returnTo?: string | null;
  /** The Turnstile site key. Null when signup is closed. */
  siteKey: string | null;
}) {
  const open = closedFormUrl === null && siteKey !== null;

  return (
    <AuthShell
      description={open ? "Buat akun siswa untuk mulai belajar di PTN Pro." : "Pendaftaran mandiri belum dibuka."}
      eyebrow="Daftar"
      title="Buat akun PTN Pro"
    >
      {open ? (
        <RegisterForm loginHref={loginHref} referral={referral} returnTo={returnTo} siteKey={siteKey} />
      ) : (
        <div className="space-y-5">
          <FormNotice label="Belum dibuka" tone="neutral">
            Untuk saat ini, akun siswa dibuat oleh tim PTN Pro. Kalau kamu ingin bergabung, daftar lewat formulir kami dan tim akan menghubungimu.
          </FormNotice>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Link
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary-700 hover:text-primary-800"
              href={loginHref}
            >
              Sudah punya akun? Masuk
            </Link>
            {closedFormUrl ? (
              <Link className={buttonVariants({ size: "lg", variant: "default" })} href={closedFormUrl}>
                Daftar lewat formulir
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export { RegisterPageModule };
