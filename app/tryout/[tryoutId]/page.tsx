import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { ParticipantTryoutDetailModule } from "@/modules/tryout/ParticipantTryoutDetailModule";
import { canEnterParticipantWaitingRoom } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

export const metadata: Metadata = { title: "Detail Tryout | Vecalss LMS" };

export default async function ParticipantTryoutDetailPage({
  params,
}: {
  params: Promise<{ tryoutId: string }>;
}) {
  const [{ tryoutId }, session] = await Promise.all([params, requireStudentSession()]);
  const tryout = await participantTryoutDetail(tryoutId, session.user.id);
  if (!tryout) notFound();
  if (canEnterParticipantWaitingRoom(tryout)) {
    redirect(`/tryout/${tryout.id}/waiting`);
  }
  return <ParticipantTryoutDetailModule session={session} tryout={tryout} />;
}
