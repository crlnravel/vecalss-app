import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import type { SessionContext } from "@/lib/auth/types";
import type { DeveloperReportListItem } from "@/lib/reports";

import { DeveloperReportsTable } from "./DeveloperReportsTable";
import { DeveloperWorkspaceShell } from "./components/developer-workspace-shell";

function DeveloperReportsPageModule({
  reports,
  session,
}: {
  reports: DeveloperReportListItem[];
  session: SessionContext;
}) {
  return (
    <DeveloperWorkspaceShell userName={session.user.fullName}>
      <section className="flex min-w-0 flex-col gap-7" aria-labelledby="developer-reports-title">
        <ReferencePageHeader title={<span id="developer-reports-title">Laporan</span>} />

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
          <DeveloperReportsTable reports={reports} />
        </div>
      </section>
    </DeveloperWorkspaceShell>
  );
}

export { DeveloperReportsPageModule };
