import type { Metadata } from "next";
import { requireStudentSession } from "@/lib/auth/access";
import {
  participantTargetProfile,
  participantTryoutCatalogue,
} from "@/lib/tryout/participant-repository";

import { ParticipantTryoutWorkspace } from "@/modules/tryout/ParticipantTryoutWorkspace";

export const metadata: Metadata = {
  title: "Tryout | Vecalss LMS",
  description:
    "Browse Vecalss tryout packages for flexible, premium, and regular SNBT practice.",
};

export default async function TryoutPage() {
  const session = await requireStudentSession();
  const [initialTryouts, targetProfile] = await Promise.all([
    participantTryoutCatalogue(session.user.id),
    participantTargetProfile(session.user.id),
  ]);

  return (
    <ParticipantTryoutWorkspace
      initialTryouts={initialTryouts}
      session={session}
      targetProfile={targetProfile}
    />
  );
}
