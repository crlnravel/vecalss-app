import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { Bell } from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { KelasNotificationForm, type KelasOption } from "./components/kelas-notification-form";

function NotificationsPageModule({
  cohorts,
  session,
}: {
  cohorts: KelasOption[];
  session: SessionContext;
}) {
  return (
    <PortalShell
      activeAdminSection="notifications"
      audience="admin"
      description="Kirim notifikasi ke kelas aktif."
      session={session}
      title="Kirim Notifikasi"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          description="Kirim notifikasi ke kelas aktif."
          title="Kirim Notifikasi"
        />

        {cohorts.length > 0 ? (
          <KelasNotificationForm cohorts={cohorts} />
        ) : (
          <ReferenceSurface as="section" aria-label="Kelas aktif" className="min-h-56" variant="inset">
            <ReferenceEmptyState
              description="Pastikan kelas aktif memiliki minimal satu siswa aktif sebelum mengirim update."
              icon={Bell}
              title="Belum ada kelas aktif dengan siswa"
            />
          </ReferenceSurface>
        )}
      </div>
    </PortalShell>
  );
}

export { NotificationsPageModule };
