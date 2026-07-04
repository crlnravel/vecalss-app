import type { Metadata } from "next";
import { OnboardingStatus, RoleName } from "@/generated/prisma/client";
import { getSessionContext, hasRole } from "@/lib/auth/session";

import TryoutPageModule from "@/modules/tryout/TryoutPageModule";
import { TryoutWorkspacePageModule } from "@/modules/tryout/TryoutWorkspacePageModule";

export const metadata: Metadata = {
  title: "Tryout | Vecalss LMS",
  description:
    "Browse Vecalss tryout packages for flexible, premium, and regular SNBT practice.",
};

export default async function TryoutPage() {
  const session = await getSessionContext();

  const shouldShowWorkspace = Boolean(
    session
      && hasRole(session, RoleName.student)
      && !session.user.mustChangePassword
      && session.user.onboardingStatus !== null
      && session.user.onboardingStatus !== OnboardingStatus.not_started,
  );

  if (shouldShowWorkspace && session) {
    return <TryoutWorkspacePageModule session={session} />;
  }

  return <TryoutPageModule />;
}
