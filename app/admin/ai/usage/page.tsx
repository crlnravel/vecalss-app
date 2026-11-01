import type { Metadata } from "next";

import { ADMIN_USAGE_STUDENT_LIMIT, getAdminVeraUsage } from "@/lib/admin/ai-usage/summary";
import { requireAdminSession } from "@/lib/auth/access";
import { VeraUsageNote, VeraUsageStudentTable, VeraUsageTotalCards } from "@/modules/admin/ai-usage/VeraUsageViews";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pemakaian Vera AI | PTN Pro Admin",
};

export default async function AdminAiUsagePage() {
  const session = await requireAdminSession();
  const usage = await getAdminVeraUsage();
  const listed = Math.min(usage.activeStudents, ADMIN_USAGE_STUDENT_LIMIT);

  return (
    <PortalShell activeAdminSection="ai-usage" audience="admin" description="Pemakaian Vera AI bulan ini, per mahasiswa." session={session} title="Pemakaian">
      <div className="flex flex-col gap-8">
        <VeraUsageTotalCards label="Bulan ini" totals={usage.month} />

        <section aria-labelledby="vera-students" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-secondary-950" id="vera-students">
              Per mahasiswa
            </h2>
            <p className="text-sm text-muted-foreground">
              {usage.activeStudents} mahasiswa memakai Vera bulan ini. Daftar menampilkan {listed} dengan pemakaian tertinggi.
            </p>
          </div>
          <VeraUsageStudentTable caption="Pemakaian Vera AI per mahasiswa bulan ini" students={usage.students} />
        </section>

        <VeraUsageNote generatedAt={usage.generatedAt} />
      </div>
    </PortalShell>
  );
}
