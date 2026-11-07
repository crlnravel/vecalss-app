import { getRegistrationFormUrl } from "@/lib/config";
import { continuationQuery, readContinuation } from "@/lib/registration/links";
import { getRegistrationStatus } from "@/lib/registration/switch";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<string, { compact?: boolean; text: string }> = {
  "password-reset": {
    text: "Kata sandi berhasil diperbarui. Masuk kembali untuk melanjutkan.",
  },
  "invite-completed": {
    text: "Akunmu sudah aktif. Masuk dengan kata sandi yang baru kamu buat.",
  },
  "email-verified": {
    text: "Emailmu sudah terverifikasi. Masuk untuk melanjutkan.",
  },
  "signed-out": {
    text: "Kamu sudah keluar dari akun.",
  },
};

function LoginPageModule({
  notice,
  returnTo,
}: {
  notice?: string | null;
  returnTo?: string | null;
}) {
  // While signup is open the link goes to it, keeping where the buyer was headed; while it is
  // closed it stays on the registration form the team uses.
  const registerUrl = getRegistrationStatus().open
    ? `/daftar${continuationQuery(readContinuation({ returnTo }))}`
    : getRegistrationFormUrl();

  return (
    <AuthShell
      description="Masuk ke akun PTN Pro untuk melanjutkan."
      title="Masuk ke PTN Pro"
    >
      <LoginForm
        notice={notice ? (noticeCopy[notice] ?? null) : null}
        registerUrl={registerUrl}
        returnTo={returnTo}
      />
    </AuthShell>
  );
}

export { LoginPageModule };
