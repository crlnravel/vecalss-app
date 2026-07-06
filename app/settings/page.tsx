import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { SettingsPageModule } from "@/modules/student/SettingsPageModule";

export const metadata: Metadata = {
  title: "Pengaturan | Vecalss LMS",
};

export default async function SettingsPage() {
  const session = await requireStudentSession();
  const profile = await prisma.studentProfile.findUnique({
    include: {
      targetExamEvent: true,
      targetMajor: true,
      targetUniversity: true,
    },
    where: {
      userId: session.user.id,
    },
  });

  if (!profile) {
    redirect("/onboarding");
  }

  return <SettingsPageModule profile={profile} session={session} />;
}
