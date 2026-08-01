import type { Metadata } from "next";
import { requireStudentSession } from "@/lib/auth/access";
import { participantTryoutCatalogue } from "@/lib/tryout/participant-repository";

import { ParticipantTryoutWorkspace } from "@/modules/tryout/ParticipantTryoutWorkspace";

export const metadata: Metadata = {
  title: "Tryout | Vecalss LMS",
  description:
    "Browse Vecalss tryout packages for flexible, premium, and regular SNBT practice.",
};

export default async function TryoutPage() {
  const session = await requireStudentSession();
  const initialTryouts = await participantTryoutCatalogue(session.user.id);

  return (
    <ParticipantTryoutWorkspace
      initialTryouts={initialTryouts}
      session={session}
    />
  );
}
