import { AuthShell } from "./components/auth-shell";
import { ChangePasswordForm } from "./components/change-password-form";

function ChangePasswordPageModule() {
  return (
    <AuthShell
      description="Tolong ubah kata sandi sementara Anda dengan kata sandi baru yaTolong ubah kata sandi sementara Anda dengan kata sandi baru."
      eyebrow="Akses pertama"
      title="Amankan akun Anda sebelum melanjutkan"
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}

export { ChangePasswordPageModule };
