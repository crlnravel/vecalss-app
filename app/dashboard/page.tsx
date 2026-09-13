import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedStudentBannerPresentation } from "@/lib/student/banner-reader";
import { DashboardPageModule } from "@/modules/dashboard/DashboardPageModule";

export default async function DashboardPage() {
  const session = await requireStudentSession();
  const [profile, banners, notificationFeed] = await Promise.all([
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
    getPublishedStudentBannerPresentation("beranda"),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);

  if (!profile) {
    redirect("/onboarding");
  }

  return <DashboardPageModule banner={banners} notificationFeed={notificationFeed} profile={profile} session={session} />;
}
