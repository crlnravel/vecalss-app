import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDefaultHomePath } from "@/lib/auth/paths";
import { getSessionContext } from "@/lib/auth/session";
import { getRegistrationFormUrl } from "@/lib/config";
import { readContinuation } from "@/lib/registration/links";
import { getRegistrationStatus } from "@/lib/registration/switch";
import { getTurnstileSiteKey } from "@/lib/registration/turnstile";
import { RegisterPageModule } from "@/modules/auth/RegisterPageModule";

export const metadata: Metadata = {
  description: "Buat akun siswa PTN Pro.",
  title: "Buat akun | PTN Pro",
};

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (session) {
    const homePath = getDefaultHomePath(session.user);
    if (homePath !== "/login") redirect(homePath);
  }

  const params = await searchParams;
  const continuation = readContinuation({ ref: firstValue(params.ref), returnTo: firstValue(params.returnTo) });
  const open = getRegistrationStatus().open;
  const siteKey = open ? getTurnstileSiteKey() : null;
  const loginHref = continuation.returnTo
    ? `/login?${new URLSearchParams({ returnTo: continuation.returnTo })}`
    : "/login";

  return (
    <RegisterPageModule
      closedFormUrl={open && siteKey ? null : getRegistrationFormUrl()}
      loginHref={loginHref}
      referral={continuation.ref}
      returnTo={continuation.returnTo}
      siteKey={open ? siteKey : null}
    />
  );
}
