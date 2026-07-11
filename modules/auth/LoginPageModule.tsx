import { getRegistrationFormUrl } from "@/lib/config";
import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<
  string,
  { compact?: boolean; text: string }
> = {
  "password-reset": {
    text: "Password kamu sudah diperbarui. Silakan masuk dengan kredensial baru.",
  },
  "signed-out": {
    compact: true,
    text: "Kamu sudah keluar dari akun.",
  },
};

function LoginPageModule({
  audience = "student",
  notice,
}: {
  audience?: LoginAudience;
  notice?: string | null;
}) {
  const isAdminLogin = audience === "admin";
  const isTutorLogin = audience === "tutor";

  return (
    <AuthShell
      description={
        isAdminLogin
          ? "Masuk untuk melanjutkan pengelolaan pendaftaran."
          : isTutorLogin
            ? "Masuk untuk membuat, mengatur, dan mempublikasikan konten belajar."
            : "Masuk untuk melanjutkan perjalanan belajarmu."
      }
      title={
        isAdminLogin
          ? "Masuk admin"
          : isTutorLogin
            ? "Masuk Kapten"
            : "Masuk ke Vecalss"
      }
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
