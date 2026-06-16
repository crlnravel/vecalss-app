import { requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { DashboardPageModule } from "@/modules/dashboard/DashboardPageModule";

export default async function DashboardPage() {
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
    throw new Error("Student profile is missing for this account.");
  }

  return <DashboardPageModule profile={profile} session={session} />;
}
