import { AuthShell } from "./components/auth-shell";
import { ForgotPasswordForm } from "./components/forgot-password-form";

function ForgotPasswordPageModule() {
  return (
    <AuthShell
      description="Request a fresh password reset link. In this first slice the delivery is stubbed in development, but the reset token lifecycle is real and matches the production rules."
      eyebrow="Password reset"
      title="Recover access without leaving the app shell"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

export { ForgotPasswordPageModule };
