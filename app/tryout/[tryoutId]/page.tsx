import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import {
  buildStudentTryoutSubrouteHref,
  canonicalContextMessage,
  parseStudentTryoutContext,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { participantTargetProfile, participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { prisma } from "@/lib/prisma";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { ParticipantTryoutDetailModule } from "@/modules/tryout/ParticipantTryoutDetailModule";
import { canEnterParticipantWaitingRoom } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

export const metadata: Metadata = { title: "Detail Tryout | Vecalss LMS" };

export default async function ParticipantTryoutDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [{ tryoutId }, query, session] = await Promise.all([params, searchParams, requireStudentSession()]);
  const parsedQuery = parseStudentTryoutContext(query);
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
  const issues: CanonicalContextIssue[] = [...parsedQuery.issues];
  if (parsedQuery.session && !tryout.sessions.some((candidate) => candidate.id === parsedQuery.session)) {
    issues.push({ code: "unsupported", field: "session", message: "Sesi tryout tersebut tidak tersedia untuk dipilih.", value: parsedQuery.session });
  }
  if (issues.length) {
    return (
      <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail tryout" notificationFeed={notificationFeed} session={session} showSearch={false}>
        <section aria-labelledby="student-tryout-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg" role="alert">
          <h1 className="text-lg font-semibold" id="student-tryout-context-unavailable">Konteks tryout tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih sesi tryout yang tersedia untuk melanjutkan.</p>
        </section>
      </CourseWorkspaceShell>
    );
  }
  const selectedSessionId = parsedQuery.session ?? tryout.assignments[0]?.id;
  if (canEnterParticipantWaitingRoom(tryout, selectedSessionId)) {
    redirect(buildStudentTryoutSubrouteHref(tryout.id, "waiting", { returnTo: parsedQuery.returnTo, session: selectedSessionId }));
  }
  return (
    <ParticipantTryoutDetailModule
      initialMajorId={targetProfile.major?.id ?? null}
      initialUniversityId={targetProfile.university?.id ?? null}
      majors={majors}
      notificationFeed={notificationFeed}
      returnToHref={parsedQuery.returnTo}
      session={session}
      sessionId={selectedSessionId}
      tryout={tryout}
      universities={universities}
    />
  );
}
