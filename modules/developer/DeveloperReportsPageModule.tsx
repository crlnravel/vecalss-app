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
    <DeveloperWorkspaceShell session={session}>
      <section className="flex flex-col gap-6" aria-labelledby="developer-reports-title">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-secondary-950" id="developer-reports-title">
            Laporan
          </h1>
          <p className="max-w-[65ch] text-sm leading-6 text-secondary-600">
            Lihat laporan kendala dan usulan perbaikan yang dikirim mentor.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-primary-100 bg-white">
          <DeveloperReportsTable reports={reports} />
        </div>
      </section>
    </DeveloperWorkspaceShell>
  );
}

export { DeveloperReportsPageModule };
