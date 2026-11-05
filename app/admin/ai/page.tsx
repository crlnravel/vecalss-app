import type { Metadata } from "next";
import Link from "next/link";

import { getAdminVeraUsage } from "@/lib/admin/ai-usage/summary";
import { requireAdminSession } from "@/lib/auth/access";
import { VeraUsageNote, VeraUsageStudentTable, VeraUsageTotalCards } from "@/modules/admin/ai-usage/VeraUsageViews";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ringkasan Vera AI | PTN Pro Admin",
};

/** How many students the overview lists. The usage page lists the heaviest ones. */
const OVERVIEW_STUDENTS = 5;

export default async function AdminAiOverviewPage() {
  const session = await requireAdminSession();
  const usage = await getAdminVeraUsage();

  return (
    <PortalShell activeAdminSection="ai" audience="admin" description="Ringkasan pemakaian Vera AI." session={session} title="Ringkasan">
      <div className="flex flex-col gap-8">
        <VeraUsageTotalCards label="Hari ini" totals={usage.today} />
        <VeraUsageTotalCards label="Bulan ini" totals={usage.month} />

        <section aria-labelledby="vera-top-students" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold text-secondary-950" id="vera-top-students">
              Pemakaian tertinggi bulan ini
            </h2>
            <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/admin/ai/usage">
              Lihat semua siswa
            </Link>
          </div>
          <VeraUsageStudentTable
            caption={`${OVERVIEW_STUDENTS} siswa dengan pemakaian Vera tertinggi bulan ini`}
            students={usage.students.slice(0, OVERVIEW_STUDENTS)}
          />
        </section>

        <VeraUsageNote generatedAt={usage.generatedAt} />
      </div>
    </PortalShell>
  );
}
