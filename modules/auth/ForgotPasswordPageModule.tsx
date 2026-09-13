import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { ForgotPasswordForm } from "./components/forgot-password-form";

function getForgotPasswordCopy(audience: LoginAudience) {
  if (audience === "admin") {
    return {
      backHref: "/login",
      description:
        "Request a fresh admin password reset link. Delivery is still stubbed in development, but the token rules already match the production flow.",
      title: "Recover admin access without leaving the app shell",
    };
  }

  if (audience === "tutor") {
    return {
      backHref: "/login",
      description:
        "Request a fresh Kapten password reset link and return to the content workspace.",
      title: "Recover Kapten access without leaving the app shell",
    };
  }

  if (audience === "affiliator") {
    return {
      backHref: "/login",
      description: "Minta link untuk mengatur ulang password workspace affiliator.",
      title: "Pulihkan akses affiliator",
    };
  }

  return {
    backHref: "/login",
    description:
      "Request a fresh password reset link. In this first slice the delivery is stubbed in development, but the reset token lifecycle is real and matches the production rules.",
    title: "Recover access without leaving the app shell",
  };
}

function ForgotPasswordPageModule({
  audience = "student",
  defaultEmail,
}: {
  audience?: LoginAudience;
  defaultEmail?: string;
}) {
  const copy = getForgotPasswordCopy(audience);

  return (
    <AuthShell
      description={copy.description}
      eyebrow="Password reset"
      title={copy.title}
    >
      <ForgotPasswordForm
        audience={audience}
        backHref={copy.backHref}
        defaultEmail={defaultEmail}
      />
    </AuthShell>
  );
}

export { ForgotPasswordPageModule };
