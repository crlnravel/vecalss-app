import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { getBannerMakerDestinationSnapshot, getBannerMakerSnapshot } from "@/lib/admin/banner-maker-repository";
import { parseBannerDestinationQuery } from "@/lib/banner/destinations";
import { BannerMakerDestinationPageModule } from "@/modules/admin/BannerMakerDestinationPageModule";
import { BannerMakerPageModule } from "@/modules/admin/BannerMakerPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Banner maker | Vecalss LMS",
};

/** BP-05 flips this only after legacy writers/readers are retired and drained. */
const BANNER_V2_EDITOR_PUBLICLY_ENABLED = false;

export default async function AdminStudentBannersPage({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string | string[] }>;
}) {
  const session = await requireAdminSession();
  const { destination: rawDestination } = await searchParams;
  const destination = parseBannerDestinationQuery(rawDestination);

  if (BANNER_V2_EDITOR_PUBLICLY_ENABLED) {
    const snapshot = await getBannerMakerDestinationSnapshot(destination);
    return <BannerMakerDestinationPageModule session={session} snapshot={snapshot} />;
  }

  const snapshot = await getBannerMakerSnapshot();

  return <BannerMakerPageModule session={session} snapshot={snapshot} />;
}
