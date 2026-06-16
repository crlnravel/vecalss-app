import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

import { AuthShell } from "./components/auth-shell";
import { FormNotice } from "./components/form-notice";
import { ResetPasswordForm } from "./components/reset-password-form";

function ResetPasswordPageModule({
  isValid,
  token,
}: {
  isValid: boolean;
  token: string;
}) {
  return (
    <AuthShell
      description="Choose a new password to restore access. Reset links expire after 15 minutes and can only be used once."
      eyebrow="Password reset"
      title="Set a new password and return to study mode"
    >
      {isValid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-5">
          <FormNotice tone="danger">
            This reset link is invalid or has expired. Request a fresh reset link to
            continue.
          </FormNotice>
          <Link className={buttonVariants({ size: "lg", variant: "brand" })} href="/forgot-password">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export { ResetPasswordPageModule };
