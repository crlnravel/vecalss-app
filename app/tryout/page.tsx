import type { Metadata } from "next";
import { requireStudentSession } from "@/lib/auth/access";
import { getStudentBannerContents } from "@/lib/student/banner-repository";
import { participantTryoutCatalogue } from "@/lib/tryout/participant-repository";

import { ParticipantTryoutWorkspace } from "@/modules/tryout/ParticipantTryoutWorkspace";

export const metadata: Metadata = {
  title: "Tryout | Vecalss LMS",
  description:
    "Browse Vecalss tryout packages for flexible, premium, and regular SNBT practice.",
};

export default async function TryoutPage() {
  const session = await requireStudentSession();
  const [initialTryouts, banners] = await Promise.all([
    participantTryoutCatalogue(session.user.id),
    getStudentBannerContents(),
  ]);

  return (
    <ParticipantTryoutWorkspace
      initialTryouts={initialTryouts}
      banner={banners.tryout}
      session={session}
    />
  );
}
