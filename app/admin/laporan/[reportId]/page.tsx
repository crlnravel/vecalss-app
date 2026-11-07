import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { getAdminReportById } from "@/lib/reports";
import { AdminReportDetailPageModule } from "@/modules/admin/reports/AdminReportDetailPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detail Laporan | PTN Pro LMS",
};

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await requireAdminSession();
  const { reportId } = await params;
  const report = await getAdminReportById(reportId);

  if (!report) {
    notFound();
  }

  return <AdminReportDetailPageModule report={report} session={session} />;
}
