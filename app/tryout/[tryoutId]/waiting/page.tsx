import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { ParticipantWaitingRoomModule } from "@/modules/tryout/ParticipantWaitingRoomModule";

export default async function TryoutWaitingRoomPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }, session] = await Promise.all([params, requireStudentSession()]);
  const tryout = await participantTryoutDetail(tryoutId, session.user.id);
  if (!tryout) notFound();
  const assignment = tryout.assignments[0];
  if (!assignment || tryout.admissionStatus !== "active") redirect(`/tryout/${tryout.id}`);
  return <ParticipantWaitingRoomModule assignment={assignment} session={session} tryout={tryout} />;
}
