import type { Metadata } from "next";

import { getAppBaseUrl } from "@/lib/config";
import { readContinuation } from "@/lib/registration/links";
import { CheckEmailPageModule } from "@/modules/auth/CheckEmailPageModule";

export const metadata: Metadata = {
  description: "Periksa emailmu untuk menyelesaikan pendaftaran PTN Pro.",
  title: "Periksa emailmu | PTN Pro",
};

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** The link handed on by the signup form outside production, and only if it points at this app's verification page. */
function readDevLink(value: string | undefined) {
  if (process.env.NODE_ENV === "production" || !value) return null;
  return value.startsWith(`${getAppBaseUrl()}/daftar/verifikasi/`) ? value : null;
}

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const continuation = readContinuation({ ref: firstValue(params.ref), returnTo: firstValue(params.returnTo) });
  const loginHref = continuation.returnTo
    ? `/login?${new URLSearchParams({ returnTo: continuation.returnTo })}`
    : "/login";

  return (
    <CheckEmailPageModule
      devLink={readDevLink(firstValue(params.dev))}
      loginHref={loginHref}
      referral={continuation.ref}
      returnTo={continuation.returnTo}
    />
  );
}
