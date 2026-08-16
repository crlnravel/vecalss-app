import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { ADMIN_CARD_CLASS_NAME } from "./admin-ui-contract";
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
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">Kirim Notifikasi</h1>

        {cohorts.length > 0 ? (
          <KelasNotificationForm cohorts={cohorts} />
        ) : (
          <section className={`${ADMIN_CARD_CLASS_NAME} px-5 py-8 text-center sm:px-7`}>
            <p className="text-sm font-semibold text-secondary-900">Belum ada kelas aktif dengan siswa</p>
            <p className="mt-1 text-sm leading-6 text-secondary-600">Pastikan kelas aktif memiliki minimal satu siswa aktif sebelum mengirim update.</p>
          </section>
        )}
      </div>
    </PortalShell>
  );
}

export { NotificationsPageModule };
