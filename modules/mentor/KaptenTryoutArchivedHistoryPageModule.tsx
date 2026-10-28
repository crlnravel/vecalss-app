import type { ReactNode } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Archive, CalendarDays, Users } from "@/lib/icons";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";
import { TryoutWorkspaceHeader } from "@/modules/mentor/KaptenTryoutWorkspaceHeader";

const LIVE_SESSION_STATUSES = new Set(["active", "in_progress"]);

function ArchivedSectionHeading({ children, icon, id }: { children: ReactNode; icon: ReactNode; id: string }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold text-secondary-900" id={id}>
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-primary-50 text-primary-800">{icon}</span>
      {children}
    </h2>
  );
}

function ArchivedSummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5 px-4 py-3 sm:px-5">
      <dt className="text-xs font-medium text-secondary-600">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums text-secondary-900">{value}</dd>
    </div>
  );
}

function KaptenTryoutArchivedHistoryFrame({
  backHref,
  backLabel,
  children,
  initial,
  summary,
}: {
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  initial: Pick<TryoutOperationsView, "id" | "title">;
  summary?: ReactNode;
}) {
  return (
    <div className="min-w-0 w-full">
      <TryoutWorkspaceHeader
        actions={<StatusBadge status="archived" />}
        activeTab="participants"
        backHref={backHref}
        backLabel={backLabel}
        id={initial.id}
        showTabs={false}
        title={initial.title}
      />
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 px-4 py-3 text-sm text-secondary-700">
        <Archive aria-hidden="true" className="size-5 shrink-0 text-primary-800" />
        <p className="min-w-0"><span className="font-semibold text-secondary-900">Hanya untuk dilihat.</span> Tryout ini sudah diarsipkan.</p>
      </div>
      {summary}
      <div className="mt-8 grid min-w-0 gap-8">{children}</div>
    </div>
  );
}

function KaptenTryoutArchivedHistoryPageModule({ initial }: { initial: TryoutOperationsView }) {
  const submittedCount = initial.attempts.filter((attempt) => !["in_progress", "abandoned"].includes(attempt.status)).length;

  return (
    <KaptenTryoutArchivedHistoryFrame
      initial={initial}
      summary={(
        <ReferenceSurface as="section" aria-label="Ringkasan riwayat" className="mt-4 overflow-hidden" variant="raised">
          <dl className="grid grid-cols-3 divide-x divide-primary-100">
            <ArchivedSummaryItem label="Sesi" value={initial.sessions.length} />
            <ArchivedSummaryItem label="Pengerjaan" value={initial.attempts.length} />
            <ArchivedSummaryItem label="Terkirim" value={submittedCount} />
          </dl>
        </ReferenceSurface>
      )}
    >
      <section aria-labelledby="archived-tryout-sessions" className="grid gap-3">
        <ArchivedSectionHeading icon={<CalendarDays className="size-4" />} id="archived-tryout-sessions">Riwayat sesi</ArchivedSectionHeading>
        {initial.sessions.length ? (
          <ReferenceSurface as="div" className="overflow-hidden" variant="raised">
            <ul className="divide-y divide-primary-100">
              {initial.sessions.map((session) => (
                <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-4 sm:px-5" key={session.id}>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-secondary-900">{session.name}</p>
                    <p className="mt-0.5 text-sm tabular-nums text-secondary-600">
                      {formatTryoutDateTime(session.availableFrom)} – {formatTryoutDateTime(session.availableUntil)} WIB
                    </p>
                  </div>
                  <StatusBadge status={LIVE_SESSION_STATUSES.has(session.status) ? "closed" : session.status} />
                </li>
              ))}
            </ul>
          </ReferenceSurface>
        ) : <p className="rounded-2xl border border-dashed border-primary-100 px-4 py-6 text-center text-sm text-secondary-600">Belum ada sesi yang tercatat.</p>}
      </section>
      <section aria-labelledby="archived-tryout-attempts" className="grid min-w-0 gap-3">
        <ArchivedSectionHeading icon={<Users className="size-4" />} id="archived-tryout-attempts">Riwayat pengerjaan</ArchivedSectionHeading>
        <KaptenTryoutParticipantsPageModule embedded initial={initial} resultMaintenance={false} showReadiness={false} />
      </section>
    </KaptenTryoutArchivedHistoryFrame>
  );
}

export { KaptenTryoutArchivedHistoryFrame, KaptenTryoutArchivedHistoryPageModule };
