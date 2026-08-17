import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { SettingsPageModule } from "@/modules/student/SettingsPageModule";

export const metadata: Metadata = {
  title: "Profil | Vecalss LMS",
};

export default async function SettingsPage() {
  const session = await requireStudentSession();
  const [profile, examEvents, universities, majors, notificationFeed] = await Promise.all([
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
      session={session}
      universities={universities}
    />
  );
}
