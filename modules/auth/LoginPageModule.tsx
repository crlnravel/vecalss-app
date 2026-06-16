import { getRegistrationFormUrl } from "@/lib/config";

import { AuthShell } from "./components/auth-shell";
import { LoginForm } from "./components/login-form";

const noticeCopy: Record<string, string> = {
  "password-reset": "Your password has been updated. You can sign in with the new credentials now.",
  "signed-out": "You have been signed out of Vecalss.",
};

function LoginPageModule({ notice }: { notice?: string | null }) {
  return (
    <AuthShell
      description="Use the shared sign-in flow for both student and admin accounts. Students will be routed into password setup, onboarding, or the dashboard depending on their current state."
      eyebrow="UC-00 Authentication"
      footer={
        <p className="text-sm leading-6 text-secondary-600">
          Need an account first? Use the official registration flow, then wait for an
          admin to provision your access.
        </p>
      }
      title="Sign in to continue your Vecalss learning flow"
    >
      <LoginForm
        notice={notice ? noticeCopy[notice] ?? null : null}
        registerUrl={getRegistrationFormUrl()}
      />
    </AuthShell>
  );
}

export { LoginPageModule };
