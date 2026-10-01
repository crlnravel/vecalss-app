import type { Metadata } from "next";

import { requireDeveloperSession } from "@/lib/auth/access";
import { listDeveloperReports } from "@/lib/reports";
import { DeveloperReportsPageModule } from "@/modules/developer/DeveloperReportsPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laporan | Vecalss LMS",
};

export default async function DeveloperReportsPage() {
  const session = await requireDeveloperSession();
  const reports = await listDeveloperReports();

  return <DeveloperReportsPageModule reports={reports} session={session} />;
}
