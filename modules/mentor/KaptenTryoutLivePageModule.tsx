"use client";

import { Card, CardContent } from "@/components/ui/card";

import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { liveStateLabels, type LiveState } from "@/lib/tryout/operations-projections";
import { TryoutRefreshToolbar, useTryoutOperationsRefresh } from "@/modules/mentor/KaptenTryoutOperationsRefresh";

const liveStates: LiveState[] = [
  "registered",
  "checked_in",
  "in_progress",
  "disconnected",
  "needs_attention",
  "submitted",
];

function KaptenTryoutLivePageModule({ initial, selectedSessionId }: { initial: TryoutOperationsView; selectedSessionId?: string | null }) {
  const { refreshState, retryRefresh, updatedLabel, view } = useTryoutOperationsRefresh(initial);

  const scopedLive = selectedSessionId ? view.live.filter((item) => item.session?.id === selectedSessionId) : view.live;
  const counts = liveStates.reduce<Record<LiveState, number>>((summary, state) => {
    summary[state] = scopedLive.filter((item) => item.state === state).length;
    return summary;
  }, {
    checked_in: 0,
    disconnected: 0,
    in_progress: 0,
    needs_attention: 0,
    registered: 0,
    submitted: 0,
  });
  return (
    <section className="grid gap-5" aria-labelledby="tryout-live-title">
      <h2 className="sr-only" id="tryout-live-title">Status peserta</h2>
      <header className="flex justify-end">
        <TryoutRefreshToolbar
          ariaLabel="Perbarui status peserta"
          onRefresh={retryRefresh}
          refreshState={refreshState}
          updatedLabel={updatedLabel}
        />
      </header>

      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {liveStates.map((state) => (
          <Card className="border border-primary-100 bg-white shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] ring-0" key={state}>
            <CardContent className="p-3.5 sm:p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">{liveStateLabels[state]}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-secondary-900">{counts[state]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

export { KaptenTryoutLivePageModule };
