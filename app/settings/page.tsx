import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { canonicalContextMessage, parseStudentContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { SettingsPageModule } from "@/modules/student/SettingsPageModule";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

export const metadata: Metadata = {
  title: "Profil | Vecalss LMS",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const session = await requireStudentSession();
  const [query, profile, examEvents, universities, majors, notificationFeed] = await Promise.all([
    searchParams,
    prisma.studentProfile.findUnique({
      include: {
        targetExamEvent: true,
        targetMajor: true,
        targetUniversity: true,
      },
      where: {
        userId: session.user.id,
      },
    }),
    prisma.examEvent.findMany({
      orderBy: [{ examDate: "asc" }, { name: "asc" }],
      where: { isActive: true },
    }),
    prisma.university.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.major.findMany({
      include: { university: true },
      orderBy: { name: "asc" },
      where: { isActive: true },
    }),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);

  const context = parseStudentContext(query);
  if (context.issues.length) {
    return (
      <StudentWorkspaceShell activeLabel="Profil" breadcrumbLabel="Profil" notificationFeed={notificationFeed} session={session}>
        <section aria-labelledby="settings-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg" role="alert">
          <h1 className="text-lg font-semibold" id="settings-context-unavailable">Konteks profil tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(context.issues)}</p>
        </section>
      </StudentWorkspaceShell>
    );
  }

  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <SettingsPageModule
      key={`${profile.userId}:${profile.updatedAt.getTime()}`}
      examEvents={examEvents}
      majors={majors}
      notificationFeed={notificationFeed}
      profile={profile}
      returnToHref={context.returnTo}
      session={session}
      universities={universities}
    />
  );
}
