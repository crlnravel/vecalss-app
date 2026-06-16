import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { ForgotPasswordForm } from "./components/forgot-password-form";

function ForgotPasswordPageModule({ audience = "student" }: { audience?: LoginAudience }) {
  return (
    <AuthShell
      description={audience === "admin"
        ? "Request a fresh admin password reset link. Delivery is still stubbed in development, but the token rules already match the production flow."
        : "Request a fresh password reset link. In this first slice the delivery is stubbed in development, but the reset token lifecycle is real and matches the production rules."}
      eyebrow="Password reset"
      title={audience === "admin"
        ? "Recover admin access without leaving the app shell"
        : "Recover access without leaving the app shell"}
    >
      <ForgotPasswordForm
        audience={audience}
        backHref={audience === "admin" ? "/admin/login" : "/login"}
      />
    </AuthShell>
  );
}

export { ForgotPasswordPageModule };
