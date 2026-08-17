import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { ParticipantWaitingRoomModule } from "@/modules/tryout/ParticipantWaitingRoomModule";
import { canEnterParticipantWaitingRoom } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

export const metadata: Metadata = {
  title: "Ruang tunggu tryout | Vecalss",
};

export default async function TryoutWaitingRoomPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }, session] = await Promise.all([params, requireStudentSession()]);
  const [tryout, notificationFeed] = await Promise.all([
    participantTryoutDetail(tryoutId, session.user.id),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  if (!tryout) notFound();
  const assignment = tryout.assignments[0];
  if (!assignment || !canEnterParticipantWaitingRoom(tryout)) {
    redirect(`/tryout/${tryout.id}`);
  }
  return <ParticipantWaitingRoomModule assignment={assignment} notificationFeed={notificationFeed} session={session} tryout={tryout} />;
}
