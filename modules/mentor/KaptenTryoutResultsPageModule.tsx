import Link from "next/link";
import { BarChart3, ChevronRight, CircleAlert, ExternalLink, ShieldCheck } from "@/lib/icons";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import {
  rankingAvailabilityLabels,
  resultReadinessLabels,
  resultReleaseStateLabels,
} from "@/lib/tryout/operations-projections";
import { rankingLabels, policyLabels, type Policy } from "@/modules/mentor/KaptenTryoutOperationsData";
import { AssessmentReleaseNotice } from "@/modules/mentor/KaptenTryoutOperationalShared";

function ResultPill({ label, tone = "neutral" }: { label: string; tone?: "attention" | "neutral" | "success" }) {
  return <Badge className="rounded-full" size="ui" variant={tone === "success" ? "mint" : "accent"}>{label}</Badge>;
}

function KaptenTryoutResultsPageModule({ initial }: { initial: TryoutOperationsView }) {
  const scored = initial.results.filter((result) => result.resultReadiness === "scored").length;
  const reviewRequired = initial.results.filter((result) => result.resultReadiness === "review_required").length;
  const released = initial.results.filter((result) => result.releaseState === "released").length;
  const rankingAvailable = initial.results.filter((result) => result.rankingAvailability === "available").length;

  return (
    <section className="grid gap-6" aria-labelledby="tryout-results-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
            <BarChart3 aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-secondary-900" id="tryout-results-title">Results</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">Bedakan kesiapan scoring, kebutuhan review, status rilis, dan ketersediaan peringkat sebelum membuka analisis.</p>
          </div>
        </div>
        <Badge className="rounded-full" size="ui" variant="mint">{initial.results.length} hasil terpantau</Badge>
      </header>

      <AssessmentReleaseNotice
        label="Rilis konten Tryout"
        missingDescription="AssessmentRelease adalah sumber konten immutable untuk seluruh attempt dan hasil."
        release={initial.assessmentRelease}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3.5 text-sm leading-6 text-secondary-700" role="status">
        <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary-800" />
        <p><strong className="font-semibold text-secondary-900">Workspace tidak membuka bundle hasil parsial.</strong> Skor hanya tampil ketika scoring sudah valid dan paket hasil sesi sudah dirilis; jawaban, kunci, dan konten embargo tetap mengikuti gate server.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Sudah dinilai</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{scored}</p></CardContent></Card>
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Perlu review</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{reviewRequired}</p></CardContent></Card>
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Hasil dirilis</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{released}</p></CardContent></Card>
        <Card className="shadow-none ring-primary-100"><CardContent className="p-5"><p className="text-xs text-secondary-500">Peringkat tersedia</p><p className="mt-1 text-2xl font-semibold tabular-nums text-secondary-900">{rankingAvailable}</p></CardContent></Card>
      </div>

      <div className="grid gap-4">
        {initial.sessions.length ? initial.sessions.map((session) => {
          const results = initial.results.filter((result) => result.sessionId === session.id);
          const sessionScored = results.filter((result) => result.resultReadiness === "scored").length;
          const sessionReview = results.filter((result) => result.resultReadiness === "review_required").length;
          const effectivePolicy = (session.releasePolicy === "inherit" ? initial.defaultReleasePolicy : session.releasePolicy) as Policy;
          return (
            <Card className="shadow-none ring-primary-100" key={session.id}>
              <CardHeader>
                <CardTitle className="font-semibold">{session.name}</CardTitle>
                <CardDescription>{new Date(session.availableFrom).toLocaleString("id-ID")} — {new Date(session.availableUntil).toLocaleString("id-ID")}</CardDescription>
                <CardAction className="flex items-center gap-2"><ResultPill label={resultReleaseStateLabels[session.releaseState as keyof typeof resultReleaseStateLabels] ?? session.releaseState} tone={session.releaseState === "released" ? "success" : "attention"} /><ChevronRight aria-hidden="true" className="text-secondary-400" /></CardAction>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div><p className="text-xs text-secondary-500">Kebijakan</p><p className="mt-1 font-semibold text-secondary-900">{policyLabels[effectivePolicy]}</p></div>
                  <div><p className="text-xs text-secondary-500">Peringkat</p><p className="mt-1 font-semibold text-secondary-900">{rankingLabels[session.rankingRule as keyof typeof rankingLabels] ?? session.rankingRule}</p></div>
                  <div><p className="text-xs text-secondary-500">Scoring</p><p className="mt-1 font-semibold text-secondary-900">{sessionScored} dinilai · {sessionReview} review</p></div>
                  <div><p className="text-xs text-secondary-500">Rilis</p><p className="mt-1 font-semibold text-secondary-900">{session.releaseState === "scheduled" && session.scheduledReleaseAt ? new Date(session.scheduledReleaseAt).toLocaleString("id-ID") : resultReleaseStateLabels[session.releaseState as keyof typeof resultReleaseStateLabels] ?? session.releaseState}</p></div>
                </div>

                {results.length ? <div className="grid gap-2">{results.map((result) => (
                  <div className="grid gap-3 rounded-2xl border border-primary-100 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={result.attemptId}>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-secondary-900">{result.participant}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-600"><span>{resultReadinessLabels[result.resultReadiness]}</span><span>{resultReleaseStateLabels[result.releaseState]}</span><span>{rankingAvailabilityLabels[result.rankingAvailability]}</span></p>
                      {result.reviewReason ? <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-[#6a4a00]"><CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{result.reviewReason}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className="min-w-24 text-right text-sm font-semibold tabular-nums text-secondary-900">{result.scoreVisible && result.displayScore !== null ? Number(result.displayScore).toFixed(2) : "Skor ditahan"}</span><Link className="inline-flex min-h-10 items-center justify-center rounded-xl border border-primary-200 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${initial.id}/operations/participants/${result.admissionId}`}>Participant</Link><Link aria-label={`Buka analisis attempt ${result.participant}`} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary-700 px-3 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${initial.id}/operations/attempts/${result.attemptId}`}>Analisis <ExternalLink aria-hidden="true" className="size-4" /></Link></div>
                  </div>
                ))}</div> : <p className="rounded-2xl border border-dashed border-primary-200 px-4 py-8 text-center text-sm text-secondary-500">Belum ada attempt untuk sesi ini.</p>}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary-100 pt-3"><p className="text-xs text-secondary-600">Buka detail sesi untuk tindakan rilis dan validasi bundle lengkap.</p><Link className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30" href={`/mentor/tryout/${initial.id}/operations/sessions/${session.id}`}>Detail sesi <ChevronRight aria-hidden="true" className="size-4" /></Link></div>
              </CardContent>
            </Card>
          );
        }) : <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-10 text-center text-sm text-secondary-500">Belum ada sesi delivery untuk menampilkan hasil.</div>}
      </div>
    </section>
  );
}

export { KaptenTryoutResultsPageModule };
