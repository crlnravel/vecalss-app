import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { SettingsPageModule } from "@/modules/student/SettingsPageModule";

export const metadata: Metadata = {
  title: "Profil | Vecalss LMS",
};

export default async function SettingsPage() {
  const session = await requireStudentSession();
  const [profile, examEvents, universities, majors] = await Promise.all([
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
  ]);

  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <SettingsPageModule
      examEvents={examEvents}
      majors={majors}
      profile={profile}
      session={session}
      universities={universities}
    />
  );
}
