import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireDeveloperSession } from "@/lib/auth/access";
import { getDeveloperReportById } from "@/lib/reports";
import { DeveloperReportDetailPageModule } from "@/modules/developer/DeveloperReportDetailPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detail Laporan | Vecalss LMS",
};

export default async function DeveloperReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await requireDeveloperSession();
  const { reportId } = await params;
  const report = await getDeveloperReportById(reportId);

  if (!report) {
    notFound();
  }

  return <DeveloperReportDetailPageModule report={report} session={session} />;
}
