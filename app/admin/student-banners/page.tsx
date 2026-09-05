import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getBannerMakerSnapshot } from "@/lib/admin/banner-maker-repository";
import { BannerMakerPageModule } from "@/modules/admin/BannerMakerPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Banner maker | Vecalss LMS",
};

export default async function AdminStudentBannersPage() {
  const session = await requireAdminSession();
  const snapshot = await getBannerMakerSnapshot();

  return <BannerMakerPageModule session={session} snapshot={snapshot} />;
}
