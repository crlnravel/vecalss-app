import Link from "next/link";

import { ReferenceEmptyState } from "@/components/dashboard";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { buttonVariants } from "@/components/ui/button-variants";
import { LockKeyhole, RefreshCw } from "@/lib/icons";
import type { AccessStatus } from "@/lib/billing/service";
import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

const COPY: Record<Exclude<AccessStatus, "active">, { description: string; title: string }> = {
  expired: {
    description: "Pilih paket lagi untuk melanjutkan belajar. Hasil belajarmu tetap tersimpan.",
    title: "Paketmu sudah berakhir",
  },
  none: {
    description: "Materi, kuis, tryout, video, dan Vera AI tersedia lewat paket belajar. Pilih paket yang cocok untuk mulai.",
    title: "Fitur ini belum termasuk dalam paketmu",
  },
  paused: {
    description: "Hubungi tim Vecalss kalau kamu butuh bantuan. Hasil belajarmu tetap tersimpan.",
    title: "Aksesmu sedang dijeda",
  },
  revoked: {
    description: "Pilih paket lagi untuk melanjutkan belajar. Hasil belajarmu tetap tersimpan.",
    title: "Akses paketmu sudah dihentikan",
  },
};

function PaidAccessRequiredPageModule({
  notificationFeed,
  retryMessage,
  session,
  status,
}: {
  notificationFeed: StudentNotificationFeed;
  retryMessage?: string;
  session: SessionContext;
  status: Exclude<AccessStatus, "active">;
}) {
  const copy = COPY[status];
  const title = retryMessage ? "Halaman belum bisa dibuka" : copy.title;

  return (
    <StudentWorkspaceShell
      activeLabel="Beranda"
      breadcrumbLabel="Paket belajar"
      notificationFeed={notificationFeed}
      session={session}
    >
      <section
        aria-label={title}
        aria-live={retryMessage ? "polite" : undefined}
        className={cn(REFERENCE_SURFACE_CLASS_NAMES.raised, "mx-auto mt-6 w-full max-w-2xl p-4 sm:p-8")}
        role={retryMessage ? "status" : undefined}
      >
        <ReferenceEmptyState
          action={(
            <Link className={buttonVariants({ size: "lg" })} href={retryMessage ? "/akses-paket" : "/pricing"}>
              {retryMessage ? "Coba lagi" : "Lihat paket"}
            </Link>
          )}
          description={retryMessage ?? copy.description}
          icon={retryMessage ? RefreshCw : LockKeyhole}
          title={title}
        />
      </section>
    </StudentWorkspaceShell>
  );
}

export { PaidAccessRequiredPageModule };
