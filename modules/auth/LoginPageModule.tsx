import { getRegistrationFormUrl } from "@/lib/config";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<string, { compact?: boolean; text: string }> = {
  "password-reset": {
    text: "Kata sandi berhasil diperbarui. Masuk kembali untuk melanjutkan.",
  },
  "invite-completed": {
    text: "Akunmu sudah aktif. Masuk dengan kata sandi yang baru kamu buat.",
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
  return (
    <AuthShell
      description="Masuk ke akun Vecalss untuk melanjutkan."
      title="Masuk ke Vecalss"
    >
      <LoginForm
        notice={notice ? (noticeCopy[notice] ?? null) : null}
        registerUrl={getRegistrationFormUrl()}
        returnTo={returnTo}
      />
    </AuthShell>
  );
}

export { LoginPageModule };
