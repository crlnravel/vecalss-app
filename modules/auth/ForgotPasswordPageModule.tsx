import type { LoginAudience } from "@/lib/auth/types";

import { AuthShell } from "./components/auth-shell";
import { ForgotPasswordForm } from "./components/forgot-password-form";

function getForgotPasswordCopy(audience: LoginAudience) {
  if (audience === "admin") {
    return {
      backHref: "/login",
      description: "Masukkan email akunmu untuk meminta tautan pengaturan ulang kata sandi.",
      title: "Atur ulang kata sandi admin",
    };
  }

  if (audience === "tutor") {
    return {
      backHref: "/login",
      description: "Masukkan email akun Kapten untuk meminta tautan pengaturan ulang kata sandi.",
      title: "Atur ulang kata sandi Kapten",
    };
  }

  if (audience === "affiliator") {
    return {
      backHref: "/login",
      description: "Masukkan email akunmu untuk meminta tautan pengaturan ulang kata sandi.",
      title: "Atur ulang kata sandi affiliator",
    };
  }

  return {
    backHref: "/login",
    description: "Masukkan email akunmu untuk meminta tautan pengaturan ulang kata sandi.",
    title: "Atur ulang kata sandi",
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
      eyebrow="Lupa kata sandi"
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
