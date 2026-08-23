"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ChevronRight, RefreshCw, ShieldAlert, Users } from "@/lib/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { AssessmentReleaseNotice } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { liveStateLabels, type LiveSeverity, type LiveState } from "@/lib/tryout/operations-projections";
import { refreshTryoutLiveAction } from "@/modules/mentor/tryout-operations-actions";

const LIVE_REFRESH_INTERVAL_MS = 15_000;
const MAX_AUTO_REFRESH_FAILURES = 3;

const liveStates: LiveState[] = [
  "registered",
  "checked_in",
  "in_progress",
  "disconnected",
  "needs_attention",
  "cat_failure",
  "submitted",
];

const liveSeverityLabels: Record<LiveSeverity, string> = {
  attention: "Perlu ditinjau",
  critical: "Butuh tindakan",
  neutral: "Normal",
};

const liveActionPriority: Record<LiveState, number> = {
  needs_attention: 0,
  disconnected: 1,
  cat_failure: 2,
  in_progress: 3,
  registered: 4,
  checked_in: 4,
  submitted: 5,
};

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function LiveStateBadge({ severity, state }: { severity: LiveSeverity; state: LiveState }) {
  return (
    <Badge className="rounded-full" size="ui" variant={severity === "neutral" ? "mint" : "accent"}>
      {liveStateLabels[state]}
    </Badge>
  );
}

function KaptenTryoutLivePageModule({ initial }: { initial: TryoutOperationsView }) {
  const [view, setView] = useState(initial);
  const [refreshState, setRefreshState] = useState<"idle" | "refreshing" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const automaticFailureCount = useRef(0);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshState("refreshing");
    const result = await refreshTryoutLiveAction(initial.id);
    refreshInFlight.current = false;
    if (!result.ok) {
      automaticFailureCount.current += 1;
      setRefreshState("error");
      setRefreshMessage(automaticFailureCount.current >= MAX_AUTO_REFRESH_FAILURES
        ? "Refresh otomatis dihentikan setelah beberapa kegagalan. Coba lagi secara manual."
        : result.message);
      return;
    }
    automaticFailureCount.current = 0;
    setView(result.result);
    setLastUpdatedAt(result.serverUpdatedAt);
    setRefreshState("idle");
    setRefreshMessage(null);
  }, [initial.id]);

  const retryRefresh = () => {
    automaticFailureCount.current = 0;
    void refresh();
  };

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible" && automaticFailureCount.current < MAX_AUTO_REFRESH_FAILURES) {
        void refresh();
      }
    };
    const interval = window.setInterval(poll, LIVE_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const counts = liveStates.reduce<Record<LiveState, number>>((summary, state) => {
    summary[state] = view.live.filter((item) => item.state === state).length;
    return summary;
  }, {
    cat_failure: 0,
    checked_in: 0,
    disconnected: 0,
    in_progress: 0,
    needs_attention: 0,
    registered: 0,
    submitted: 0,
  });
  const updatedLabel = formatTimestamp(lastUpdatedAt);
  const orderedLive = useMemo(() => [...view.live].sort((left, right) => {
    const priorityDelta = liveActionPriority[left.state] - liveActionPriority[right.state];
    if (priorityDelta !== 0) return priorityDelta;
    return left.participant.displayName.localeCompare(right.participant.displayName, "id");
  }), [view.live]);

  return (
    <section className="grid gap-6" aria-labelledby="tryout-live-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
            <Activity aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-secondary-900" id="tryout-live-title">Live</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">
              Pantau posisi peserta dari admission sampai terkirim dalam satu proyeksi operasional.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="text-right text-xs text-secondary-500" aria-live="polite">
            {refreshState === "refreshing" ? "Memperbarui dari server…" : updatedLabel ? `Diperbarui ${updatedLabel}` : "Menunggu refresh server"}
          </div>
          <Button
            aria-label="Refresh status Live"
            disabled={refreshState === "refreshing"}
            onClick={retryRefresh}
            size="sm"
            variant="brandOutline"
          >
            <RefreshCw className={refreshState === "refreshing" ? "animate-spin" : undefined} data-icon="inline-start" />
            Refresh
          </Button>
          <Badge className="rounded-full" size="ui" variant="mint">{view.live.length} peserta terpantau</Badge>
        </div>
      </header>

      {refreshMessage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f3d486] bg-[#fff7e5] px-4 py-3.5 text-sm leading-6 text-[#6a4a00]" role="alert">
          <span>Data mungkin tertinggal. {refreshMessage}</span>
          <Button onClick={retryRefresh} size="sm" variant="outline">Coba lagi</Button>
        </div>
      ) : null}

      <AssessmentReleaseNotice
        label="Konten delivery"
        missingDescription="Sesi tidak dapat dibuka sebelum AssessmentRelease tervalidasi server."
        release={view.assessmentRelease}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3.5 text-sm leading-6 text-secondary-700" role="status">
        <ShieldAlert aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary-800" />
        <p><strong className="font-semibold text-secondary-900">Sinyal fokus dan layar penuh hanya untuk review manusia.</strong> Tidak ada penalti skor, pencabutan admission, void attempt, atau blokir hasil otomatis dari sinyal ini. Status Terputus hanya muncul dari marker lifecycle server; start/reconcile disconnect memerlukan perintah berwenang dan alasan audit.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {liveStates.map((state) => (
          <Card className="shadow-none ring-primary-100" key={state}>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-secondary-500">{liveStateLabels[state]}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{counts[state]}</p>
              <p className="mt-1 text-xs leading-5 text-secondary-600">{state === "needs_attention" || state === "cat_failure" || state === "disconnected" ? "Perlu dibuka dari detail" : "Status saat ini"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="grid gap-3" aria-labelledby="tryout-live-participants-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-secondary-900" id="tryout-live-participants-title">Peserta dan next action</h3>
            <p className="mt-1 text-sm text-secondary-600">Buka participant untuk akses, atau attempt untuk run dan sinyal yang lebih rinci.</p>
          </div>
          <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary-800 underline decoration-primary-300 underline-offset-4 hover:text-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${view.id}?workspace=schedule&delivery=participants`}>
            Buka Participants <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        {view.live.length ? (
          <div className="grid gap-3">
            {orderedLive.map((item) => (
              <Card className="shadow-none ring-primary-100" key={item.admissionId}>
                <CardHeader>
                  <CardTitle className="flex min-w-0 items-center gap-2 font-semibold">
                    <Users aria-hidden="true" className="size-4 shrink-0 text-primary-800" />
                    <span className="truncate">{item.participant.displayName}</span>
                  </CardTitle>
                  <CardDescription>{item.session?.name ?? "Belum ditugaskan ke sesi"} · {liveSeverityLabels[item.severity]}</CardDescription>
                  <CardAction className="flex items-center gap-2">
                    <LiveStateBadge severity={item.severity} state={item.state} />
                    <ChevronRight aria-hidden="true" className="text-secondary-400" />
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm leading-6 text-secondary-700">{item.reason}</p>
                    {item.disconnectStartedAt ? (
                      <p className="mt-1 text-xs font-medium text-secondary-600">
                        Marker disconnect dimulai {formatTimestamp(item.disconnectStartedAt)}
                        {item.reconciledAt ? ` · direkonsiliasi ${formatTimestamp(item.reconciledAt)}` : " · menunggu reconcile"}
                      </p>
                    ) : null}
                    {item.integrityEventCount ? <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[#6a4a00]"><AlertTriangle aria-hidden="true" className="size-3.5" />{item.integrityEventCount} sinyal integritas tercatat untuk review manusia.</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Link className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-200 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${view.id}/operations/participants/${item.admissionId}`}>Participant</Link>
                    {item.attemptId ? <Link className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary-700 px-3 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${view.id}/operations/attempts/${item.attemptId}`}>Buka attempt</Link> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-10 text-center text-sm text-secondary-500">
            Belum ada peserta atau attempt yang dapat dipantau.
          </div>
        )}
      </section>
    </section>
  );
}

export { KaptenTryoutLivePageModule };
