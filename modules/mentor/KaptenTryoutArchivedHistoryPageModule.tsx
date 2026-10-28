import type { ReactNode } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Archive } from "@/lib/icons";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";

const LIVE_SESSION_STATUSES = new Set(["active", "in_progress"]);

function ArchivedSectionHeading({ children, id }: { children: ReactNode; id: string }) {
  return <h2 className="text-xl font-semibold text-secondary-900" id={id}>{children}</h2>;
}

function ArchivedSummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold text-secondary-500">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums text-secondary-900">{value}</dd>
    </div>
  );
}

function KaptenTryoutArchivedHistoryFrame({
  children,
  initial,
  summary,
}: {
  children: ReactNode;
  initial: Pick<TryoutOperationsView, "id" | "title">;
  summary?: ReactNode;
}) {
  return (
    <div className="grid min-w-0 w-full gap-8">
      <ReferenceSurface aria-labelledby="archived-tryout-title" as="section" className="grid min-w-0 gap-5 p-5 sm:p-7" variant="raised">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <h1 className="min-w-0 break-words text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl" id="archived-tryout-title">{initial.title}</h1>
          <StatusBadge status="archived" />
        </div>
        <p className="flex items-center gap-2 text-sm text-secondary-600">
          <Archive aria-hidden="true" className="size-4 shrink-0 text-secondary-500" />
          Hanya untuk dilihat. Tryout ini sudah diarsipkan.
        </p>
        {summary}
      </ReferenceSurface>
      {children}
    </div>
  );
}

function KaptenTryoutArchivedHistoryPageModule({ initial }: { initial: TryoutOperationsView }) {
  const submittedCount = initial.attempts.filter((attempt) => !["in_progress", "abandoned"].includes(attempt.status)).length;

  return (
    <KaptenTryoutArchivedHistoryFrame
      initial={initial}
      summary={(
        <dl aria-label="Ringkasan riwayat" className="grid grid-cols-3 gap-4 border-t border-primary-100 pt-5">
          <ArchivedSummaryItem label="Sesi" value={initial.sessions.length} />
          <ArchivedSummaryItem label="Pengerjaan" value={initial.attempts.length} />
          <ArchivedSummaryItem label="Terkirim" value={submittedCount} />
        </dl>
      )}
    >
      <section aria-labelledby="archived-tryout-sessions" className="grid gap-3">
        <ArchivedSectionHeading id="archived-tryout-sessions">Riwayat sesi</ArchivedSectionHeading>
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
        <ArchivedSectionHeading id="archived-tryout-attempts">Riwayat pengerjaan</ArchivedSectionHeading>
        <KaptenTryoutParticipantsPageModule embedded initial={initial} resultMaintenance={false} showReadiness={false} />
      </section>
    </KaptenTryoutArchivedHistoryFrame>
  );
}

export { KaptenTryoutArchivedHistoryFrame, KaptenTryoutArchivedHistoryPageModule };
