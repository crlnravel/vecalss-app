import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPendingEnrollment } from "@/lib/auth/mfa/service";
import { getDefaultHomePath, getSafeMfaReturnPath, isMfaPending } from "@/lib/auth/paths";
import { getSessionContext } from "@/lib/auth/session";
import { MfaPageModule } from "@/modules/auth/MfaPageModule";

export const metadata: Metadata = {
  title: "Verifikasi dua langkah | Vecalss",
  robots: { follow: false, index: false },
};

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  // A forced password change always comes before the second factor.
  if (session.user.mustChangePassword) redirect("/change-password");

  const params = await searchParams;
  const returnTo = getSafeMfaReturnPath(firstValue(params.returnTo));

  if (!isMfaPending(session.user)) {
    redirect(returnTo ?? getDefaultHomePath(session.user));
  }

  if (session.user.mfaStatus === "unavailable") return <MfaPageModule kind="unavailable" />;

  if (session.user.mfaStatus === "challenge") {
    return (
      <MfaPageModule
        kind="challenge"
        mode={firstValue(params.mode) === "recovery" ? "recovery" : "code"}
        returnTo={returnTo}
      />
    );
  }

  const pending = await getPendingEnrollment({
    accountLabel: session.user.email,
    sessionId: session.sessionId,
    userId: session.user.id,
  });

  return pending
    ? <MfaPageModule kind="scan" manualKey={pending.manualKey} qrSvg={pending.qrSvg} returnTo={returnTo} />
    : <MfaPageModule kind="setup-code" returnTo={returnTo} />;
}
