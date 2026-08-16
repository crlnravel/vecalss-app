import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { FormNotice } from "./components/form-notice";
import { ResetPasswordForm } from "./components/reset-password-form";

function getResetPasswordCopy(audience: LoginAudience) {
  if (audience === "admin") {
    return {
      backHref: "/login",
      description:
        "Choose a new admin password to restore access. Reset links expire after 15 minutes and can only be used once.",
      requestNewLinkHref: "/forgot-password?audience=admin",
      title: "Set a new admin password and return to enrollment",
    };
  }

  if (audience === "tutor") {
    return {
      backHref: "/login",
      description:
        "Choose a new Kapten password to restore access to the content workspace.",
      requestNewLinkHref: "/forgot-password?audience=tutor",
      title: "Set a new Kapten password and return to the CMS",
    };
  }

  return {
    backHref: "/login",
    description:
      "Choose a new password to restore access. Reset links expire after 15 minutes and can only be used once.",
    requestNewLinkHref: "/forgot-password",
    title: "Set a new password and return to study mode",
  };
}

function ResetPasswordPageModule({
  audience = "student",
  isValid,
  token,
}: {
  audience?: LoginAudience;
  isValid: boolean;
  token: string;
}) {
  const copy = getResetPasswordCopy(audience);

  return (
    <AuthShell
      description={copy.description}
      eyebrow="Password reset"
      title={copy.title}
    >
      {isValid ? (
        <ResetPasswordForm
          audience={audience}
          backHref={copy.backHref}
          token={token}
        />
      ) : (
        <div className="space-y-5">
          <FormNotice tone="danger">
            This reset link is invalid or has expired. Request a fresh reset link to
            continue.
          </FormNotice>
          <Link className={buttonVariants({ size: "lg", variant: "brand" })} href={copy.requestNewLinkHref}>
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export { ResetPasswordPageModule };
