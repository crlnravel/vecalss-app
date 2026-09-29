import type { Metadata } from "next";

import { requireAffiliatorSession } from "@/lib/auth/access";
import { getAffiliatorConversionLog } from "@/lib/affiliator/service";
import { AffiliatorPurchaseLogPageModule } from "@/modules/affiliator/AffiliatorPurchaseLogPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Riwayat pembelian | Vecalss LMS",
};

export default async function AffiliatorPurchaseLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAffiliatorSession();
  const params = await searchParams;
  const rawPage = params.logPage;
  const parsedPage = typeof rawPage === "string" ? Number.parseInt(rawPage, 10) : 1;
  const log = await getAffiliatorConversionLog(session.user.id, {
    page: Number.isFinite(parsedPage) ? parsedPage : 1,
  });

  return <AffiliatorPurchaseLogPageModule log={log} session={session} />;
}
