import type { Metadata } from "next";

import { requireAffiliatorSession } from "@/lib/auth/access";
import { getAffiliatorDashboard } from "@/lib/affiliator/service";
import { AffiliatorDashboardPageModule } from "@/modules/affiliator/AffiliatorDashboardPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard Affiliator | Vecalss LMS",
};

export default async function AffiliatorDashboardPage() {
  const session = await requireAffiliatorSession();
  const dashboard = await getAffiliatorDashboard(session.user.id);

  return <AffiliatorDashboardPageModule dashboard={dashboard} session={session} />;
}
