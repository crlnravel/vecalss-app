import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { participantTargetProfile, participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { prisma } from "@/lib/prisma";
import { ParticipantTryoutDetailModule } from "@/modules/tryout/ParticipantTryoutDetailModule";
import { canEnterParticipantWaitingRoom } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

export const metadata: Metadata = { title: "Detail Tryout | Vecalss LMS" };

export default async function ParticipantTryoutDetailPage({
  params,
}: {
  params: Promise<{ tryoutId: string }>;
}) {
  const [{ tryoutId }, session] = await Promise.all([params, requireStudentSession()]);
  const [tryout, notificationFeed, targetProfile, universities, majors] = await Promise.all([
    participantTryoutDetail(tryoutId, session.user.id),
    getStudentNotificationFeed({ userId: session.user.id }),
    participantTargetProfile(session.user.id),
    prisma.university.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, shortName: true },
    }),
    prisma.major.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, universityId: true },
      where: { isActive: true },
    }),
  ]);
  if (!tryout) notFound();
  if (canEnterParticipantWaitingRoom(tryout)) {
    redirect(`/tryout/${tryout.id}/waiting`);
  }
  return (
    <ParticipantTryoutDetailModule
      initialMajorId={targetProfile.major?.id ?? null}
      initialUniversityId={targetProfile.university?.id ?? null}
      majors={majors}
      notificationFeed={notificationFeed}
      session={session}
      tryout={tryout}
      universities={universities}
    />
  );
}
