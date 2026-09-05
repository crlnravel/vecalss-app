import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import {
  buildStudentTryoutHref,
  canonicalContextMessage,
  parseStudentTryoutContext,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { ParticipantWaitingRoomModule } from "@/modules/tryout/ParticipantWaitingRoomModule";
import { canEnterParticipantWaitingRoom } from "@/modules/tryout/ParticipantTryoutWorkspaceUtils";

export const metadata: Metadata = {
  title: "Ruang tunggu tryout | Vecalss",
};

export default async function TryoutWaitingRoomPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ tryoutId }, query, session] = await Promise.all([params, searchParams, requireStudentSession()]);
  const parsedQuery = parseStudentTryoutContext(query);
  const [tryout, notificationFeed] = await Promise.all([
    participantTryoutDetail(tryoutId, session.user.id),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  if (!tryout) notFound();
  const issues: CanonicalContextIssue[] = [...parsedQuery.issues];
  if (parsedQuery.session && !tryout.sessions.some((candidate) => candidate.id === parsedQuery.session)) {
    issues.push({ code: "unsupported", field: "session", message: "Sesi tryout tersebut tidak tersedia untuk dipilih.", value: parsedQuery.session });
  }
  if (issues.length) {
    return (
      <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Ruang tunggu" notificationFeed={notificationFeed} session={session} showSearch={false}>
        <section aria-labelledby="student-waiting-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg" role="alert">
          <h1 className="text-lg font-semibold" id="student-waiting-context-unavailable">Konteks ruang tunggu tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
        </section>
      </CourseWorkspaceShell>
    );
  }
  const assignment = parsedQuery.session
    ? tryout.assignments.find((candidate) => candidate.id === parsedQuery.session)
    : tryout.assignments[0];
  if (!assignment || !canEnterParticipantWaitingRoom(tryout, parsedQuery.session)) {
    redirect(buildStudentTryoutHref(tryout.id, { returnTo: parsedQuery.returnTo, session: parsedQuery.session }));
  }
  return <ParticipantWaitingRoomModule assignment={assignment} notificationFeed={notificationFeed} returnToHref={parsedQuery.returnTo} session={session} tryout={tryout} />;
}
