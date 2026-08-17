import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getStudentBannerSnapshot } from "@/lib/student/banner-repository";
import { StudentBannersPageModule } from "@/modules/admin/StudentBannersPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student banners | Vecalss LMS",
};

export default async function AdminStudentBannersPage() {
  const session = await requireAdminSession();
  const snapshot = await getStudentBannerSnapshot();

  return (
    <StudentBannersPageModule
      banners={snapshot.banners}
      hasUnpublishedChanges={snapshot.hasUnpublishedChanges}
      session={session}
      version={snapshot.version}
    />
  );
}
