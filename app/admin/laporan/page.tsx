import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { listAdminReports } from "@/lib/reports";
import { AdminReportsPageModule } from "@/modules/admin/reports/AdminReportsPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laporan | PTN Pro LMS",
};

export default async function AdminReportsPage() {
  const session = await requireAdminSession();
  const reports = await listAdminReports();

  return <AdminReportsPageModule reports={reports} session={session} />;
}
