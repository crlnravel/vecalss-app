import type { ReactNode } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";
import { TryoutWorkspaceHeader } from "@/modules/mentor/KaptenTryoutWorkspaceHeader";

function KaptenTryoutArchivedHistoryFrame({
  backHref,
  backLabel,
  children,
  initial,
}: {
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  initial: Pick<TryoutOperationsView, "id" | "title">;
}) {
  return (
    <div className="mx-auto min-w-0 w-full max-w-[1420px] px-4 py-6 sm:px-6 lg:px-8">
      <TryoutWorkspaceHeader
        actions={<StatusBadge status="archived" />}
        activeTab="participants"
        backHref={backHref}
        backLabel={backLabel}
        id={initial.id}
        showTabs={false}
        title={initial.title}
      />
      <p className="mt-3 text-sm leading-6 text-secondary-600">
        Tryout ini sudah diarsipkan. Jadwal, pengerjaan, dan hasil peserta tetap dapat dilihat.
      </p>
      <div className="mt-6 grid min-w-0 gap-8">{children}</div>
    </div>
  );
}

function KaptenTryoutArchivedHistoryPageModule({ initial }: { initial: TryoutOperationsView }) {
  return (
    <KaptenTryoutArchivedHistoryFrame initial={initial}>
      <section aria-labelledby="archived-tryout-sessions" className="grid gap-3">
        <h2 className="text-xl font-semibold text-secondary-900" id="archived-tryout-sessions">Riwayat sesi</h2>
        {initial.sessions.length ? initial.sessions.map((session) => (
          <ReferenceSurface className="grid gap-2 p-4 sm:p-5" key={session.id} variant="raised">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-secondary-900">{session.name}</h3>
              <StatusBadge status={session.status} />
            </div>
            <p className="text-sm leading-6 text-secondary-600">
              {formatTryoutDateTime(session.availableFrom)} WIB — {formatTryoutDateTime(session.availableUntil)} WIB
            </p>
          </ReferenceSurface>
        )) : <p className="text-sm text-secondary-600">Belum ada sesi yang tercatat.</p>}
      </section>
      <section aria-labelledby="archived-tryout-attempts" className="grid min-w-0 gap-3">
        <h2 className="text-xl font-semibold text-secondary-900" id="archived-tryout-attempts">Riwayat pengerjaan</h2>
        <KaptenTryoutParticipantsPageModule embedded initial={initial} />
      </section>
    </KaptenTryoutArchivedHistoryFrame>
  );
}

export { KaptenTryoutArchivedHistoryFrame, KaptenTryoutArchivedHistoryPageModule };
