import { getRegistrationFormUrl } from "@/lib/config";
import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<string, string> = {
  "password-reset": "Your password has been updated. You can sign in with the new credentials now.",
  "signed-out": "You have been signed out of Vecalss.",
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
        ? "Use your admin credentials to open the enrollment workspace and manage student provisioning inside the app."
        : "Sign in with your student credentials to continue into first-password setup, onboarding, or the dashboard depending on your account state."}
      eyebrow={isAdminLogin ? "Admin access" : "UC-00 Authentication"}
      footer={
        <p className="text-sm leading-6 text-secondary-600">
          {isAdminLogin
            ? "This screen is reserved for active admin accounts. Students should use the standard login flow."
            : "Need an account first? Use the official registration flow, then wait for an admin to provision your access."}
        </p>
      }
      title={isAdminLogin
        ? "Admin login for enrollment management"
        : "Sign in to continue your Vecalss learning flow"}
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
