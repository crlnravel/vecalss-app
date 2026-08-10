import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { ParticipantTryoutRegistrationModule } from "@/modules/tryout/ParticipantTryoutRegistrationModule";

export default async function TryoutRegistrationPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }, session] = await Promise.all([params, requireStudentSession()]);
  const [tryout, profile, universities, majors] = await Promise.all([
    participantTryoutDetail(tryoutId, session.user.id),
    prisma.studentProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.university.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, shortName: true } }),
    prisma.major.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, universityId: true }, where: { isActive: true } }),
  ]);
  if (!tryout) notFound();
  if (tryout.admissionStatus === "active") {
    redirect(tryout.assignments.length ? `/tryout/${tryout.id}/waiting` : `/tryout/${tryout.id}`);
  }
  if (tryout.admissionStatus) redirect(`/tryout/${tryout.id}`);
  if (tryout.admissionMode === "invitation_only") redirect(`/tryout/${tryout.id}`);
  return (
    <ParticipantTryoutRegistrationModule
      initialMajorId={profile?.targetMajorId ?? null}
      initialUniversityId={profile?.targetUniversityId ?? null}
      majors={majors}
      session={session}
      tryout={tryout}
      universities={universities}
    />
  );
}
