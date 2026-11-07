import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import type { SessionContext } from "@/lib/auth/types";
import type { AdminReportListItem } from "@/lib/reports";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { AdminReportsTable } from "./AdminReportsTable";

function AdminReportsPageModule({
  reports,
  session,
}: {
  reports: AdminReportListItem[];
  session: SessionContext;
}) {
  return (
    <PortalShell
      activeAdminSection="laporan"
      audience="admin"
      description="Kendala dan usulan perbaikan yang dikirim mentor."
      session={session}
      title="Laporan"
    >
      <section className="flex min-w-0 flex-col gap-7" aria-labelledby="admin-reports-title">
        <ReferencePageHeader id="admin-reports-title" title="Laporan" />

        <div className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-primary-100 px-4 py-5 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-secondary-900">Laporan mentor</h2>
              <p className="mt-1 max-w-[55ch] text-sm leading-6 text-secondary-600">
                Kendala dan usulan perbaikan yang dikirim mentor.
              </p>
            </div>
            <p className="flex shrink-0 items-baseline gap-1.5 text-sm text-secondary-600">
              <span className="font-semibold text-secondary-900 tabular-nums">{reports.length.toLocaleString("id-ID")}</span>
              <span>laporan</span>
            </p>
          </div>
          <AdminReportsTable reports={reports} />
        </div>
      </section>
    </PortalShell>
  );
}

export { AdminReportsPageModule };
