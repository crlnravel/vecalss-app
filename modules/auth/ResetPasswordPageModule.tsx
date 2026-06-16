import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { FormNotice } from "./components/form-notice";
import { ResetPasswordForm } from "./components/reset-password-form";

function ResetPasswordPageModule({
  audience = "student",
  isValid,
  token,
}: {
  audience?: LoginAudience;
  isValid: boolean;
  token: string;
}) {
  const requestNewLinkHref = audience === "admin"
    ? "/forgot-password?audience=admin"
    : "/forgot-password";

  return (
    <AuthShell
      description={audience === "admin"
        ? "Choose a new admin password to restore access. Reset links expire after 15 minutes and can only be used once."
        : "Choose a new password to restore access. Reset links expire after 15 minutes and can only be used once."}
      eyebrow="Password reset"
      title={audience === "admin"
        ? "Set a new admin password and return to enrollment"
        : "Set a new password and return to study mode"}
    >
      {isValid ? (
        <ResetPasswordForm
          audience={audience}
          backHref={audience === "admin" ? "/admin/login" : "/login"}
          token={token}
        />
      ) : (
        <div className="space-y-5">
          <FormNotice tone="danger">
            This reset link is invalid or has expired. Request a fresh reset link to
            continue.
          </FormNotice>
          <Link className={buttonVariants({ size: "lg", variant: "brand" })} href={requestNewLinkHref}>
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export { ResetPasswordPageModule };
