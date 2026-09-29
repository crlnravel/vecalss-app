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
      description: "Tautan ini berlaku 15 menit dan hanya bisa digunakan sekali.",
      requestNewLinkHref: "/forgot-password?audience=admin",
      title: "Buat kata sandi baru",
    };
  }

  if (audience === "tutor") {
    return {
      backHref: "/login",
      description: "Tautan ini berlaku 15 menit dan hanya bisa digunakan sekali.",
      requestNewLinkHref: "/forgot-password?audience=tutor",
      title: "Buat kata sandi baru",
    };
  }

  if (audience === "affiliator") {
    return {
      backHref: "/login",
      description: "Tautan ini berlaku 15 menit dan hanya bisa digunakan sekali.",
      requestNewLinkHref: "/forgot-password?audience=affiliator",
      title: "Buat kata sandi baru",
    };
  }

  return {
    backHref: "/login",
    description: "Tautan ini berlaku 15 menit dan hanya bisa digunakan sekali.",
    requestNewLinkHref: "/forgot-password",
    title: "Buat kata sandi baru",
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
      eyebrow="Atur ulang kata sandi"
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
            Tautan ini tidak valid atau sudah kedaluwarsa. Minta tautan baru untuk
            mengatur ulang kata sandi.
          </FormNotice>
          <Link className={buttonVariants({ size: "lg", variant: "brand" })} href={copy.requestNewLinkHref}>
            Minta tautan baru
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export { ResetPasswordPageModule };
