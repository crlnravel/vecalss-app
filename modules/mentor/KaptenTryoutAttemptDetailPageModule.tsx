"use client";

import { useRouter } from "next/navigation";

import { ReferencePageHeader, ReferenceSectionHeading, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import type { TryoutResultRecoverySnapshot } from "@/lib/tryout/result-recovery";
import { TryoutAttemptResultRecovery } from "@/modules/mentor/components/tryout-attempt-result-recovery";

type AttemptRecord = NonNullable<TryoutOperationsView["session"]>["attempts"][number];
type AttemptRun = AttemptRecord["runs"][number];

function AttemptRunRow({ run }: { run: AttemptRun }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <p className="break-words font-semibold text-secondary-900">{run.subtestName?.trim() || run.title?.trim() || `Tes ${run.sequenceNo}`}</p>
        {run.integrityEvents > 0 ? <p className="mt-0.5 text-sm text-secondary-600">{run.integrityEvents} catatan pemantauan</p> : null}
      </div>
      <StatusBadge status={run.status} />
    </li>
  );
}

function AttemptRunsSection({ attempt }: { attempt: AttemptRecord }) {
  return (
    <section aria-labelledby="attempt-runs-title" className="grid content-start gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><h2 id="attempt-runs-title" className="text-xl font-semibold">Tujuh tes tryout</h2><span className="text-sm font-medium text-secondary-700">Skor dari 100: {attempt.score !== null ? Number(attempt.score).toFixed(2) : "belum dihitung"}</span></div>
      {attempt.runs.length ? (
        <ReferenceSurface as="div" className="overflow-hidden" variant="raised">
          <ul className="divide-y divide-primary-100">{attempt.runs.map((run) => <AttemptRunRow key={run.id} run={run} />)}</ul>
        </ReferenceSurface>
      ) : <p className="rounded-2xl border border-dashed border-primary-100 px-4 py-6 text-center text-sm text-secondary-600">Belum ada tes yang tercatat.</p>}
    </section>
  );
}

function KaptenTryoutAttemptDetailPageModule({
  attemptId,
  embedded = false,
  initial,
  readOnly = false,
  resultRecovery,
}: {
  attemptId: string;
  embedded?: boolean;
  initial: TryoutOperationsView;
  readOnly?: boolean;
  resultRecovery?: TryoutResultRecoverySnapshot | null;
}) {
  const router = useRouter();
  const delivery = initial.session!;
  const attempt = delivery.attempts.find((item) => item.id === attemptId)!;

  return (
    <div className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? null : <ReferencePageHeader actions={<StatusBadge status={attempt.status} />} className="min-w-0" title={attempt.student} />}
      {embedded && readOnly ? <ReferenceSectionHeading action={<StatusBadge status={attempt.status} />} title={attempt.student} /> : null}
      <div className="mt-5 grid gap-5">
        <AttemptRunsSection attempt={attempt} />
        {resultRecovery ? <TryoutAttemptResultRecovery readOnly={readOnly} key={`${resultRecovery.scope.attemptId}:${resultRecovery.scope.sessionId}`} initial={resultRecovery} refresh={() => router.refresh()} /> : null}
      </div>
    </div>
  );
}

export { KaptenTryoutAttemptDetailPageModule };
