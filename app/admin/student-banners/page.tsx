import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getStudentBannerContents } from "@/lib/student/banner-repository";
import { StudentBannersPageModule } from "@/modules/admin/StudentBannersPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student banners | Vecalss LMS",
};

export default async function AdminStudentBannersPage() {
  const session = await requireAdminSession();
  const banners = await getStudentBannerContents();

  return <StudentBannersPageModule banners={banners} session={session} />;
}
