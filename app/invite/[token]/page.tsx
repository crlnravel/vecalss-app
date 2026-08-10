import type { Metadata } from "next";

import { getEnrollmentInviteStatus } from "@/lib/auth/service";
import { InvitePasswordSetupPageModule } from "@/modules/auth/InvitePasswordSetupPageModule";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function EnrollmentInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const status = await getEnrollmentInviteStatus(token);

  return <InvitePasswordSetupPageModule isValid={status.valid} token={token} />;
}
