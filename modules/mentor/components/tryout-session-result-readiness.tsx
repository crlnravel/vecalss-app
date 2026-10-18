"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { buildMentorTryoutAttemptHref, type MentorTryoutContext } from "@/lib/navigation/canonical-context";
import { readTryoutSessionReadiness, type TryoutResultReadinessScope, type TryoutSessionReadiness } from "@/lib/tryout/result-readiness";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { TryoutResultPolicyForm, resultPolicyLabels } from "@/modules/mentor/components/tryout-result-policy-form";
import { TryoutResultPublication } from "@/modules/mentor/components/tryout-result-publication";

async function inspect(scope: TryoutResultReadinessScope) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([readTryoutSessionReadiness(scope), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Read deadline")), 15_000); })]);
    if (!response.ok || response.snapshot.scope.tryoutId !== scope.tryoutId || response.snapshot.scope.sessionId !== scope.sessionId) throw new Error("Unavailable readiness");
    return response.snapshot;
  } finally { clearTimeout(timer); }
}

/** Full selected session; table search/filter/page never enter this request. */
export function TryoutSessionResultReadiness({ scope, context, tryoutTitle = "Tryout", allowPublication = false }: { scope: TryoutResultReadinessScope; context: MentorTryoutContext; tryoutTitle?: string; allowPublication?: boolean }) {
  const [snapshot, setSnapshot] = useState<TryoutSessionReadiness | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { tryoutId, sessionId } = scope;
  const active = useRef(false);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    void inspect({ tryoutId, sessionId }).then((value) => { if (current) { setSnapshot(value); setLoading(false); } }).catch(() => { if (current) { setFailed(true); setLoading(false); } });
    return () => { current = false; };
  }, [tryoutId, sessionId]);
  async function refresh() {
    if (!active.current) return;
    setLoading(true);
    try { const next = await inspect(scope); if (active.current) { setSnapshot(next); setFailed(false); } }
    catch (error) { if (active.current) setFailed(true); throw error; }
    finally { if (active.current) setLoading(false); }
  }
  return (
    <ReferenceSurface as="section" className="mt-5 grid min-w-0 gap-5 p-4 sm:p-5" aria-labelledby="session-readiness-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-prose">
          <h2 id="session-readiness-title" className="text-xl font-semibold text-secondary-900">Kesiapan hasil sesi</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">Ringkasan mencakup seluruh sesi yang dipilih, termasuk peserta di luar pencarian tabel.</p>
        </div>
        <Button className="min-h-11 w-full sm:w-auto" variant="outline" disabled={loading} onClick={() => void refresh().catch(() => {})}>
          {loading ? "Memuat…" : "Perbarui kesiapan"}
        </Button>
      </div>
      {failed ? <p className="text-sm leading-6 text-secondary-700">Kesiapan terbaru belum dapat dimuat. Perbarui kesiapan sebelum melanjutkan.</p> : null}
      {snapshot ? (
        <>
          <dl className="grid min-w-0 gap-4 border-y border-primary-100 py-4 text-sm leading-6 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-secondary-600">Pengerjaan yang disertakan</dt>
              <dd className="mt-1 font-semibold tabular-nums text-secondary-900">{snapshot.counts.ready} siap · {snapshot.counts.blocked} perlu diperiksa</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-600">Tidak disertakan</dt>
              <dd className="mt-1 tabular-nums text-secondary-700">{snapshot.counts.void} dibatalkan · {snapshot.counts.abandoned} ditinggalkan · {snapshot.counts.noAttempt} belum mengerjakan</dd>
            </div>
          </dl>
          <dl className="grid min-w-0 gap-4 text-sm leading-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-secondary-600">Sesi</dt>
              <dd className="break-words font-medium text-secondary-900">{snapshot.sessionName}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-600">Waktu selesai</dt>
              <dd className="break-words font-medium text-secondary-900">{formatTryoutDateTime(snapshot.availableUntil)} WIB</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-secondary-600">Aturan yang berlaku</dt>
              <dd className="font-medium text-secondary-900">{resultPolicyLabels[snapshot.effectivePolicy] ?? "Belum tersedia"}</dd>
              <dd className="text-secondary-600">{snapshot.inherited ? "Mengikuti Tryout" : "Ditentukan pada sesi"}</dd>
            </div>
          </dl>
          {snapshot.publication && (!allowPublication || !snapshot.publication.receipt) ? (
            <p className="break-words text-sm leading-6 text-secondary-700">Hasil dirilis {formatTryoutDateTime(snapshot.publication.releasedAt)} WIB. Alasan: {snapshot.publication.reason ?? "Tercatat pada riwayat sesi."}</p>
          ) : null}
          {snapshot.blockers.length ? (
            <section aria-labelledby="result-blockers-title" className="grid gap-3">
              <h3 id="result-blockers-title" className="text-base font-semibold text-secondary-900">Yang perlu diselesaikan</h3>
              <ul className="divide-y divide-primary-100 text-sm leading-6 text-secondary-700">
                {snapshot.blockers.map((blocker, index) => (
                  <li key={`${blocker.category}-${blocker.attemptId}-${blocker.section}-${index}`} className="flex min-w-0 flex-col items-start gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <p className="min-w-0 break-words">{blocker.section ? <span className="font-semibold text-secondary-900">Tes {blocker.section}: </span> : null}{blocker.message}</p>
                    {blocker.attemptId ? (
                      <Link className="inline-flex min-h-11 shrink-0 items-center rounded-control font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2" href={buildMentorTryoutAttemptHref(scope.tryoutId, blocker.attemptId, { ...context, session: scope.sessionId, workspace: "participants" })}>
                        Periksa pengerjaan
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : !snapshot.publication ? <p className="text-sm leading-6 text-secondary-700">Seluruh hasil yang disertakan sudah siap.</p> : null}
          {allowPublication ? <TryoutResultPublication initial={snapshot} tryoutTitle={tryoutTitle} available={!loading && !failed} refresh={refresh} /> : null}
          <TryoutResultPolicyForm initial={snapshot} refresh={refresh} />
        </>
      ) : !loading && !failed ? <p className="text-sm text-secondary-700">Ringkasan hasil belum tersedia.</p> : null}
    </ReferenceSurface>
  );
}
