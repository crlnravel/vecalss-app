"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Clock3, ExternalLink, ListChecks, ShieldAlert, Timer } from "@/lib/icons";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { liveStateLabels, resultReadinessLabels } from "@/lib/tryout/operations-projections";
import { participantAttemptStateLabels } from "@/modules/mentor/KaptenTryoutOperationsData";
import { AssessmentReleaseNotice } from "@/modules/mentor/KaptenTryoutOperationalShared";

type AttemptFilter = "all" | "cat_failure" | "disconnected" | "in_progress" | "needs_attention" | "submitted";

const attemptFilters: Array<{ label: string; value: AttemptFilter }> = [
  { label: "Semua", value: "all" },
  { label: "Berlangsung", value: "in_progress" },
  { label: "Terputus", value: "disconnected" },
  { label: "Butuh tindakan", value: "needs_attention" },
  { label: "CAT perlu ditinjau", value: "cat_failure" },
  { label: "Terkirim", value: "submitted" },
];

const integrityEventLabels: Record<string, string> = {
  focus_lost: "Fokus keluar",
  focus_returned: "Fokus kembali",
  fullscreen_entered: "Layar penuh masuk",
  fullscreen_exited: "Layar penuh keluar",
  visibility_hidden: "Tab tidak terlihat",
  visibility_visible: "Tab terlihat",
};

function formatRemaining(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}d`;
}

function AttemptPill({ label, tone = "neutral" }: { label: string; tone?: "attention" | "danger" | "neutral" | "success" }) {
  return <Badge className="rounded-full" size="ui" variant={tone === "success" ? "mint" : "accent"}>{label}</Badge>;
}

function KaptenTryoutAttemptsPageModule({ initial }: { initial: TryoutOperationsView }) {
  const [filter, setFilter] = useState<AttemptFilter>("all");
  const liveByAttemptId = useMemo(() => new Map(initial.live.filter((item) => item.attemptId).map((item) => [item.attemptId!, item])), [initial.live]);
  const resultByAttemptId = useMemo(() => new Map(initial.results.map((item) => [item.attemptId, item])), [initial.results]);
  const visibleAttempts = useMemo(() => initial.attempts.filter((attempt) => {
    const state = liveByAttemptId.get(attempt.id)?.state;
    return filter === "all" || state === filter;
  }), [filter, initial.attempts, liveByAttemptId]);
  const counts = {
    attention: initial.attempts.filter((attempt) => ["needs_attention", "cat_failure", "disconnected"].includes(liveByAttemptId.get(attempt.id)?.state ?? "")).length,
    inProgress: initial.attempts.filter((attempt) => liveByAttemptId.get(attempt.id)?.state === "in_progress").length,
    submitted: initial.attempts.filter((attempt) => liveByAttemptId.get(attempt.id)?.state === "submitted").length,
    total: initial.attempts.length,
  };

  return (
    <section className="grid gap-6" aria-labelledby="tryout-attempts-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
            <ListChecks aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-secondary-900" id="tryout-attempts-title">Attempts</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Lihat tujuh Test, timer, jawaban yang tersimpan, sinyal integritas, dan resolusi CAT dari sumber runtime yang sama.</p>
          </div>
        </div>
        <Badge className="rounded-full" size="ui" variant="mint">{counts.total} attempt</Badge>
      </header>

      <AssessmentReleaseNotice
        label="Konten attempt"
        missingDescription="Attempt baru dapat dibuat setelah sesi memiliki AssessmentRelease yang valid."
        release={initial.assessmentRelease}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Berlangsung</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{counts.inProgress}</p></CardContent></Card>
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Butuh tindakan</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{counts.attention}</p><p className="mt-1 text-xs text-secondary-600">Review manusia, disconnect, atau CAT perlu ditinjau</p></CardContent></Card>
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Terkirim</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{counts.submitted}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filter attempt" role="group">
        {attemptFilters.map((option) => (
          <Button aria-pressed={filter === option.value} className="rounded-xl" key={option.value} onClick={() => setFilter(option.value)} size="sm" variant={filter === option.value ? "contextSelected" : "ghost"}>
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4">
        {visibleAttempts.length ? visibleAttempts.map((attempt) => {
          const live = liveByAttemptId.get(attempt.id);
          const result = resultByAttemptId.get(attempt.id);
          const activeRun = attempt.runs.find((run) => run.status === "active") ?? null;
          const answeredCount = attempt.runs.reduce((total, run) => total + run.answeredCount, 0);
          const questionCount = attempt.runs.reduce((total, run) => total + run.questionCount, 0);
          const sealedRuns = attempt.runs.filter((run) => run.status === "sealed" || run.status === "expired").length;
          return (
            <Card className="shadow-none ring-primary-100" key={attempt.id}>
              <CardHeader>
                <CardTitle className="font-semibold">{attempt.student}</CardTitle>
                <CardDescription>{attempt.sessionName} · {live ? liveStateLabels[live.state] : participantAttemptStateLabels[attempt.attemptState] ?? attempt.attemptState}</CardDescription>
                <CardAction className="flex items-center gap-2">
                  <AttemptPill label={resultReadinessLabels[result?.resultReadiness ?? "scoring_pending"]} tone={result?.resultReadiness === "review_required" ? "attention" : result?.resultReadiness === "scored" ? "success" : "neutral"} />
                  <ChevronRight aria-hidden="true" className="text-secondary-400" />
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs text-secondary-500">State attempt</p><p className="mt-1 font-semibold text-secondary-900">{participantAttemptStateLabels[attempt.attemptState] ?? attempt.attemptState}</p></div>
                  <div><p className="text-xs text-secondary-500">Progress Test</p><p className="mt-1 font-semibold text-secondary-900">{sealedRuns}/{attempt.runs.length || 7} selesai</p></div>
                  <div><p className="text-xs text-secondary-500">Jawaban</p><p className="mt-1 font-semibold text-secondary-900">{answeredCount}/{questionCount || "—"} tersimpan</p></div>
                  <div><p className="text-xs text-secondary-500">Timer aktif</p><p className="mt-1 flex items-center gap-1.5 font-semibold text-secondary-900"><Timer aria-hidden="true" className="size-4 text-primary-800" />{formatRemaining(activeRun?.remainingSeconds ?? null)}</p></div>
                </div>

                <div className="grid gap-2" aria-label={`Run Test untuk ${attempt.student}`}>
                  {attempt.runs.map((run) => (
                    <div className="grid gap-2 rounded-2xl border border-primary-100 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={run.id}>
                      <div className="min-w-0">
                        <p className="font-medium text-secondary-900">Test {run.sequenceNo}{run.subtestName ? ` · ${run.subtestName}` : ""}{run.testType === "cat" ? " · CAT" : ""}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-600"><span>{run.answeredCount}/{run.questionCount || "—"} jawaban</span><span>{run.integrityEvents} sinyal</span>{run.status === "active" ? <span className="flex items-center gap-1"><Clock3 aria-hidden="true" className="size-3.5" />{formatRemaining(run.remainingSeconds)}</span> : null}</p>
                        {run.catFailureReason ? <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-[#6a4a00]"><ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{run.catFailureReason}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end"><AttemptPill label={run.status === "sealed" ? "Selesai" : run.status === "active" ? "Aktif" : run.status === "expired" ? "Kedaluwarsa" : "Menunggu"} tone={run.catState === "failed" ? "danger" : run.status === "sealed" ? "success" : "neutral"} />{run.catState !== "not_applicable" ? <span className="text-xs text-secondary-600">CAT: {run.catState}</span> : null}</div>
                    </div>
                  ))}
                </div>

                {attempt.runs.some((run) => run.integrityEventTrail.length) ? (
                  <section className="grid gap-2 rounded-2xl border border-[#f3d486] bg-[#fff7e5] p-4" aria-labelledby={`integrity-${attempt.id}`}>
                    <div className="flex items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#a46b00]" /><div><h3 className="font-semibold text-secondary-900" id={`integrity-${attempt.id}`}>Trail integritas</h3><p className="mt-1 text-xs leading-5 text-secondary-700">Fokus, visibilitas, dan layar penuh adalah sinyal untuk review manusia. Tidak ada konsekuensi otomatis.</p></div></div>
                    <div className="grid gap-1.5 border-t border-[#f3d486] pt-2 text-xs text-secondary-700">{attempt.runs.flatMap((run) => run.integrityEventTrail.map((event) => ({ ...event, sequenceNo: run.sequenceNo }))).slice(-8).map((event) => <p className="flex flex-wrap items-center gap-x-2 gap-y-1" key={`${event.sequenceNo}-${event.serverSequence}`}><span className="font-semibold">Test {event.sequenceNo}</span><span>{integrityEventLabels[event.eventType] ?? event.eventType}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("id-ID")}</time></p>)}</div>
                  </section>
                ) : null}

                {attempt.runs.some((run) => run.catResolutionAudits.length) ? (
                  <section className="grid gap-2 rounded-2xl border border-primary-100 bg-primary-50/35 p-4" aria-labelledby={`cat-audit-${attempt.id}`}>
                    <h3 className="font-semibold text-secondary-900" id={`cat-audit-${attempt.id}`}>Resolusi CAT</h3>
                    <div className="grid gap-1.5 border-t border-primary-100 pt-2 text-xs text-secondary-700">{attempt.runs.flatMap((run) => run.catResolutionAudits.map((audit) => ({ ...audit, sequenceNo: run.sequenceNo }))).slice(0, 6).map((audit) => <p className="flex flex-wrap items-center gap-x-2 gap-y-1" key={`${audit.sequenceNo}-${audit.createdAt}-${audit.action}`}><span className="font-semibold">Test {audit.sequenceNo}</span><span>{audit.action}</span><span>{audit.reason}</span></p>)}</div>
                  </section>
                ) : null}

                {attempt.scoringReviewReason ? <p className="flex items-start gap-2 rounded-2xl border border-[#f3d486] bg-[#fff7e5] px-3.5 py-3 text-sm leading-6 text-secondary-800"><AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0 text-[#a46b00]" />{attempt.scoringReviewReason}</p> : null}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary-100 pt-3">
                  <p className="text-xs text-secondary-600">Rilis hasil: {result?.releaseState ?? "hidden"} · Peringkat: {result?.rankingAvailability ?? "pending"}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary-200 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${initial.id}/operations/participants/${attempt.admissionId}`}>Participant</Link>
                    <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary-700 px-3 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${initial.id}/operations/attempts/${attempt.id}`}>Buka detail <ExternalLink aria-hidden="true" className="size-4" /></Link>
                    <Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${initial.id}/operations/sessions/${attempt.sessionId}`}>Sesi</Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }) : <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-10 text-center text-sm text-secondary-500">Tidak ada attempt pada filter ini.</div>}
      </div>
    </section>
  );
}

export { KaptenTryoutAttemptsPageModule };
