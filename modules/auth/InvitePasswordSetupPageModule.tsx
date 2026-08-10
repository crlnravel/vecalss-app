import { FormNotice } from "./components/form-notice";
import { AuthShell } from "./components/auth-shell";
import { InvitePasswordSetupForm } from "./components/invite-password-setup-form";

const INVALID_INVITE_MESSAGE = "This invite link is invalid or has already expired.";

function InvitePasswordSetupPageModule({
  isValid,
  token,
}: {
  isValid: boolean;
  token: string;
}) {
  return (
    <AuthShell
      description="Set a password to activate your Vecalss account. This invite expires after 24 hours and can only be used once."
      eyebrow="Account invite"
      title="Set your password"
    >
      {isValid ? (
        <InvitePasswordSetupForm token={token} />
      ) : (
        <FormNotice tone="danger">{INVALID_INVITE_MESSAGE}</FormNotice>
      )}
    </AuthShell>
  );
}

export { INVALID_INVITE_MESSAGE, InvitePasswordSetupPageModule };
