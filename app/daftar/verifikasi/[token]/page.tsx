import type { Metadata } from "next";

import { isVerificationLinkUsable } from "@/lib/registration/service";
import { continuationQuery, readContinuation } from "@/lib/registration/links";
import { VerifyEmailPageModule } from "@/modules/auth/VerifyEmailPageModule";

export const metadata: Metadata = {
  description: "Verifikasi email akun PTN Pro.",
  robots: { follow: false, index: false },
  title: "Verifikasi email | PTN Pro",
};

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Opening the link only reads: it never verifies anything, so an email scanner that
 * fetches it changes nothing. The account is verified by the button, which POSTs.
 */
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const continuation = readContinuation({ ref: firstValue(query.ref), returnTo: firstValue(query.returnTo) });

  return (
    <VerifyEmailPageModule
      isValid={await isVerificationLinkUsable(token)}
      referral={continuation.ref}
      resendHref={`/daftar/periksa-email${continuationQuery(continuation)}`}
      returnTo={continuation.returnTo}
      token={token}
    />
  );
}
