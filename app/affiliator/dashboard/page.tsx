import type { Metadata } from "next";

import { requireAffiliatorSession } from "@/lib/auth/access";
import { getAffiliatorDashboard } from "@/lib/affiliator/service";
import { AffiliatorDashboardPageModule } from "@/modules/affiliator/AffiliatorDashboardPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard Affiliator | Vecalss LMS",
};

export default async function AffiliatorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAffiliatorSession();
  const params = await searchParams;
  const rawPage = params.logPage;
  const parsedPage = typeof rawPage === "string" ? Number.parseInt(rawPage, 10) : 1;
  const dashboard = await getAffiliatorDashboard(session.user.id, {
    conversionLogPage: Number.isFinite(parsedPage) ? parsedPage : 1,
  });

  return <AffiliatorDashboardPageModule dashboard={dashboard} session={session} />;
}
