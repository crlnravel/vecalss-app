import { getRegistrationFormUrl } from "@/lib/config";
import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<string, string> = {
  "password-reset": "Password kamu sudah diperbarui. Silakan masuk dengan kredensial baru.",
  "signed-out": "Kamu sudah keluar dari Vecalss.",
};

function LoginPageModule({
  audience = "student",
  notice,
}: {
  audience?: LoginAudience;
  notice?: string | null;
}) {
  const isAdminLogin = audience === "admin";

  return (
    <AuthShell
      description={isAdminLogin
        ? "Masuk untuk melanjutkan pengelolaan pendaftaran."
        : "Masuk untuk melanjutkan perjalanan belajarmu."}
      title={isAdminLogin ? "Masuk admin" : "Masuk ke Vecalss"}
    >
      <LoginForm
        audience={audience}
        notice={notice ? noticeCopy[notice] ?? null : null}
        registerUrl={getRegistrationFormUrl()}
      />
    </AuthShell>
  );
}

export { LoginPageModule };
