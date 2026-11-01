import type { ComponentProps, ReactNode } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Archive } from "@/lib/icons";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { KaptenTryoutArchivedAdministration } from "@/modules/mentor/KaptenTryoutArchivedAdministration";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { modeLabels, policyLabels, type DefaultPolicy } from "@/modules/mentor/KaptenTryoutOperationsData";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";
import type { TryoutWorkspaceTab } from "@/modules/mentor/KaptenTryoutWorkspaceHeader";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";

const LIVE_SESSION_STATUSES = new Set(["active", "in_progress"]);

type ArchivedFrameInitial = Pick<TryoutOperationsView, "bannerMediaId" | "description" | "id" | "status" | "title">;
type DeletionPlan = ComponentProps<typeof KaptenTryoutArchivedAdministration>["plan"];
type ArchivedTryoutOutline = { sections: Array<{ durationMinutes: number; id: string; questionCount: number; title: string }> };

function ArchivedSectionHeading({ children, id }: { children: ReactNode; id: string }) {
  return <h2 className="text-xl font-semibold text-secondary-900" id={id}>{children}</h2>;
}

function ArchivedNotice() {
  return (
    <p className="flex items-center gap-2 text-sm text-secondary-600">
      <Archive aria-hidden="true" className="size-4 shrink-0 text-secondary-500" />
      Hanya untuk dilihat. Tryout ini sudah diarsipkan.
    </p>
  );
}

/** Same workspace chrome as an active Tryout; every body rendered inside it is read-only. */
function KaptenTryoutArchivedHistoryFrame({
  activeTab = "participants",
  children,
  initial,
  parentId,
}: {
  activeTab?: TryoutWorkspaceTab;
  children: ReactNode;
  initial: ArchivedFrameInitial;
  parentId?: string;
}) {
  return (
    <KaptenTryoutWorkspaceFrame activeTab={activeTab} initial={initial} parentId={parentId}>
      <div className="grid min-w-0 gap-6">
        <ArchivedNotice />
        {children}
      </div>
    </KaptenTryoutWorkspaceFrame>
  );
}

function ArchivedEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-primary-100 px-4 py-6 text-center text-sm text-secondary-600">{children}</p>;
}

function ArchivedSubtests({ outline }: { outline: ArchivedTryoutOutline | null }) {
  return (
    <section aria-labelledby="archived-tryout-subtests" className="grid gap-3">
      <ArchivedSectionHeading id="archived-tryout-subtests">Subtes</ArchivedSectionHeading>
      {outline?.sections.length ? (
        <ReferenceSurface as="div" className="overflow-hidden" variant="raised">
          <ul className="divide-y divide-primary-100">
            {outline.sections.map((section) => (
              <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-4 sm:px-5" key={section.id}>
                <p className="min-w-0 truncate font-semibold text-secondary-900">{section.title}</p>
                <p className="text-sm tabular-nums text-secondary-600">{section.questionCount} soal · {section.durationMinutes} menit</p>
              </li>
            ))}
          </ul>
        </ReferenceSurface>
      ) : <ArchivedEmpty>Belum ada subtes yang tercatat.</ArchivedEmpty>}
    </section>
  );
}

function ArchivedSessions({ initial }: { initial: TryoutOperationsView }) {
  return (
    <section aria-labelledby="archived-tryout-sessions" className="grid gap-3">
      <ArchivedSectionHeading id="archived-tryout-sessions">Sesi</ArchivedSectionHeading>
      {initial.session ? (
        <ReferenceSurface as="div" className="overflow-hidden" variant="raised">
          <ul className="divide-y divide-primary-100">
            {[initial.session].map((session) => (
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
      ) : <ArchivedEmpty>Belum ada sesi yang tercatat.</ArchivedEmpty>}
    </section>
  );
}

function ArchivedSettings({ deletionPlan, initial }: { deletionPlan: DeletionPlan; initial: TryoutOperationsView }) {
  return (
    <section aria-labelledby="archived-tryout-settings" className="grid gap-3">
      <ArchivedSectionHeading id="archived-tryout-settings">Pengaturan</ArchivedSectionHeading>
      <ReferenceSurface as="div" className="p-5 sm:p-6" variant="raised">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="text-xs font-semibold text-secondary-500">Akses peserta</dt>
            <dd className="text-base font-semibold text-secondary-900">{modeLabels[initial.admissionMode]}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs font-semibold text-secondary-500">Rilis hasil</dt>
            <dd className="text-base font-semibold text-secondary-900">{policyLabels[initial.defaultReleasePolicy as DefaultPolicy] ?? policyLabels.automatic_at_end}</dd>
          </div>
        </dl>
      </ReferenceSurface>
      <KaptenTryoutArchivedAdministration plan={deletionPlan} title={initial.title} tryoutId={initial.id} />
    </section>
  );
}

function KaptenTryoutArchivedHistoryPageModule({
  activeWorkspace,
  deletionPlan,
  initial,
  outline,
  parentId,
}: {
  activeWorkspace: TryoutWorkspaceTab;
  deletionPlan: DeletionPlan;
  initial: TryoutOperationsView;
  outline: ArchivedTryoutOutline | null;
  parentId?: string;
}) {
  return (
    <KaptenTryoutArchivedHistoryFrame activeTab={activeWorkspace} initial={initial} parentId={parentId}>
      {activeWorkspace === "subtests" ? <ArchivedSubtests outline={outline} /> : null}
      {activeWorkspace === "operations" ? <ArchivedSessions initial={initial} /> : null}
      {activeWorkspace === "participants" ? (
        <section aria-labelledby="archived-tryout-attempts" className="grid min-w-0 gap-3">
          <ArchivedSectionHeading id="archived-tryout-attempts">Riwayat pengerjaan</ArchivedSectionHeading>
          <KaptenTryoutParticipantsPageModule embedded initial={initial} resultMaintenance={false} showReadiness={false} />
        </section>
      ) : null}
      {activeWorkspace === "settings" ? <ArchivedSettings deletionPlan={deletionPlan} initial={initial} /> : null}
    </KaptenTryoutArchivedHistoryFrame>
  );
}

export { KaptenTryoutArchivedHistoryFrame, KaptenTryoutArchivedHistoryPageModule };
export type { ArchivedTryoutOutline };
