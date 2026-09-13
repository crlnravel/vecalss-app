import type { Metadata } from "next";
import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedStudentBannerPresentation } from "@/lib/student/banner-reader";
import { getStudentBannerVariablesForUser } from "@/lib/student/banner-variables";
import { participantTryoutCatalogue } from "@/lib/tryout/participant-repository";

import { ParticipantTryoutWorkspace } from "@/modules/tryout/ParticipantTryoutWorkspace";

export const metadata: Metadata = {
  title: "Tryout | Vecalss LMS",
  description:
    "Browse Vecalss tryout packages for flexible, premium, and regular SNBT practice.",
};

export default async function TryoutPage() {
  const session = await requireStudentSession();
  const [initialTryouts, banners, notificationFeed, bannerVariables] = await Promise.all([
    participantTryoutCatalogue(session.user.id),
    getPublishedStudentBannerPresentation("tryout"),
    getStudentNotificationFeed({ userId: session.user.id }),
    getStudentBannerVariablesForUser(session.user.id, session.user.fullName),
  ]);

  return (
    <ParticipantTryoutWorkspace
      initialTryouts={initialTryouts}
      banner={banners}
      bannerVariables={bannerVariables}
      notificationFeed={notificationFeed}
      session={session}
    />
  );
}
