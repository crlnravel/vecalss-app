import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { getBannerMakerDestinationSnapshot } from "@/lib/admin/banner-maker-repository";
import { isBannerV2EditorEnabled } from "@/lib/banner/activation";
import { BannerDestinationError, parseBannerDestinationQuery, type BannerDestination } from "@/lib/banner/destinations";
import { BannerDestinationQueryError } from "@/modules/admin/BannerDestinationQueryError";
import { BannerMakerDestinationPageModule } from "@/modules/admin/BannerMakerDestinationPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editor banner | Vecalss LMS",
};

export default async function AdminStudentBannersPage({
  searchParams,
}: {
  searchParams: Promise<{
    destination?: string | string[];
    edit?: string | string[];
  }>;
}) {
  const session = await requireAdminSession();
  const { destination: rawDestination, edit: rawEdit } = await searchParams;
  let destination: BannerDestination;
  try {
    destination = parseBannerDestinationQuery(rawDestination);
  } catch (error) {
    if (!(error instanceof BannerDestinationError)) throw error;
    return <BannerDestinationQueryError />;
  }

  const editBanners = rawEdit === "banners"
    || (Array.isArray(rawEdit) && rawEdit.includes("banners"));
  if (editBanners) {
    redirect(`/admin/student-banners?destination=${encodeURIComponent(destination)}`);
  }

  if (!isBannerV2EditorEnabled()) {
    return <BannerDestinationQueryError mode="safe-fallback" />;
  }

  const snapshot = await getBannerMakerDestinationSnapshot(destination);
  return <BannerMakerDestinationPageModule session={session} snapshot={snapshot} />;
}
