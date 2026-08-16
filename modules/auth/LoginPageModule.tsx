import { getRegistrationFormUrl } from "@/lib/config";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<
  string,
  { compact?: boolean; text: string }
> = {
  "password-reset": {
    text: "Password kamu sudah diperbarui. Silakan masuk dengan kredensial baru.",
  },
  "invite-completed": {
    text: "Your account is active. Sign in with the password you just created.",
  },
  "signed-out": {
    compact: true,
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
      description="Masuk untuk melanjutkan ke workspace Vecalss."
      title="Masuk ke Vecalss"
    >
      <LoginForm
        notice={notice ? noticeCopy[notice] ?? null : null}
        registerUrl={getRegistrationFormUrl()}
        returnTo={returnTo}
      />
    </AuthShell>
  );
}

export { LoginPageModule };
