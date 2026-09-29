import { AuthShell } from "./components/auth-shell";
import { ChangePasswordForm } from "./components/change-password-form";

function ChangePasswordPageModule() {
  return (
    <AuthShell
      description="Perbarui kata sandi sementara sebelum melanjutkan."
      eyebrow="Akses pertama"
      title="Buat kata sandi baru"
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}

export { ChangePasswordPageModule };
