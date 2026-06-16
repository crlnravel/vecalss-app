import { AuthShell } from "./components/auth-shell";
import { ChangePasswordForm } from "./components/change-password-form";

function ChangePasswordPageModule() {
  return (
    <AuthShell
      description="This first login still uses an admin-issued temporary password. Set a new one now so the account can move into onboarding and the student dashboard."
      eyebrow="First access"
      title="Secure your account before continuing"
    >
      <ChangePasswordForm />
    </AuthShell>
  );
}

export { ChangePasswordPageModule };
