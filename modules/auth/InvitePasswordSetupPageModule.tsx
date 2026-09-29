import { FormNotice } from "./components/form-notice";
import { AuthShell } from "./components/auth-shell";
import { InvitePasswordSetupForm } from "./components/invite-password-setup-form";
import { INVALID_INVITE_MESSAGE } from "./invite-copy";

function InvitePasswordSetupPageModule({
  isValid,
  token,
}: {
  isValid: boolean;
  token: string;
}) {
  return (
    <AuthShell
      description="Buat kata sandi untuk mengaktifkan akun Vecalss. Tautan ini berlaku 24 jam dan hanya bisa digunakan sekali."
      eyebrow="Undangan akun"
      title="Atur kata sandi"
    >
      {isValid ? (
        <InvitePasswordSetupForm token={token} />
      ) : (
        <FormNotice tone="danger">{INVALID_INVITE_MESSAGE}</FormNotice>
      )}
    </AuthShell>
  );
}

export { InvitePasswordSetupPageModule };
