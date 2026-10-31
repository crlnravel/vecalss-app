"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCw } from "@/lib/icons";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { groupReadinessBlockers, formatBlockerSections } from "@/lib/tryout/readiness-blocker-groups";
import { buildMentorTryoutAttemptHref, type MentorTryoutContext } from "@/lib/navigation/canonical-context";
import { readTryoutSessionReadiness, type TryoutResultReadinessScope, type TryoutSessionReadiness } from "@/lib/tryout/result-readiness";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { TryoutResultPolicyForm } from "@/modules/mentor/components/tryout-result-policy-form";
import { TryoutResultPublication } from "@/modules/mentor/components/tryout-result-publication";

const BLOCKER_PREVIEW = 5;

async function inspect(scope: TryoutResultReadinessScope) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([readTryoutSessionReadiness(scope), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Read deadline")), 15_000); })]);
    if (!response.ok || response.snapshot.scope.tryoutId !== scope.tryoutId || response.snapshot.scope.sessionId !== scope.sessionId) throw new Error("Unavailable readiness");
    return response.snapshot;
  } finally { clearTimeout(timer); }
}

/** Full selected session; table search/filter/page never enter this request. */
export function TryoutSessionResultReadiness({ scope, context, tryoutTitle = "Tryout", allowPublication = false, compact = false, sessionPicker, manageHref }: { scope: TryoutResultReadinessScope; context: MentorTryoutContext; tryoutTitle?: string; allowPublication?: boolean; compact?: boolean; sessionPicker?: ReactNode; manageHref?: string }) {
  const [snapshot, setSnapshot] = useState<TryoutSessionReadiness | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAllBlockers, setShowAllBlockers] = useState(false);
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
  const allGroups = snapshot ? groupReadinessBlockers(snapshot.blockers) : [];
  const blockerGroups = allGroups.filter((group) => group.attemptId);
  const sessionNotes = allGroups.filter((group) => !group.attemptId).flatMap((group) => group.lines.map((line) => line.message));
  const excluded = snapshot ? [[snapshot.counts.void, "dibatalkan"], [snapshot.counts.abandoned, "ditinggalkan"], [snapshot.counts.noAttempt, "belum mengerjakan"]].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`) : [];
  const visibleGroups = showAllBlockers ? blockerGroups : blockerGroups.slice(0, BLOCKER_PREVIEW);
  if (compact) {
    if (!allowPublication) return null;
    return <div className="mb-5 flex min-w-0 flex-wrap items-center justify-end gap-3">
      {failed ? <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm leading-6 text-secondary-700">Kesiapan terbaru belum dapat dimuat. Muat ulang sebelum melanjutkan.</p>
        <Button variant="outline" disabled={loading} onClick={() => void refresh().catch(() => {})}>{loading ? "Memuat…" : "Muat ulang"}</Button>
      </div> : null}
      {snapshot ? <TryoutResultPublication compact initial={snapshot} tryoutTitle={tryoutTitle} available={!loading && !failed} refresh={refresh} /> : <Button disabled>Rilis hasil</Button>}
    </div>;
  }
  return (
    <ReferenceSurface as="section" className="mt-4 grid min-w-0 grid-cols-1 gap-5 p-4 sm:p-5" aria-labelledby="session-readiness-title">
      <h2 id="session-readiness-title" className="sr-only">Kesiapan hasil sesi</h2>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 sm:flex-none">{sessionPicker}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="quiet" size="icon" aria-label="Perbarui kesiapan" title="Perbarui kesiapan" disabled={loading} onClick={() => void refresh().catch(() => {})}>
            <RefreshCw className={loading ? "animate-spin motion-reduce:animate-none" : undefined} aria-hidden="true" />
          </Button>
          {manageHref ? <Button variant="outline" aria-label="Kelola peserta" render={<Link href={manageHref} />}><span>Kelola<span className="hidden sm:inline"> peserta</span></span></Button> : null}
        </div>
      </div>
      {failed ? <p className="text-sm leading-6 text-secondary-700">Kesiapan terbaru belum dapat dimuat. Perbarui kesiapan sebelum melanjutkan.</p> : null}
      {snapshot ? (
        <>
          <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-primary-100 pt-4 text-sm leading-6">
            {snapshot.counts.candidates > 0 ? (
              <div className="min-w-0">
                <dt className="text-xs text-secondary-600">Pengerjaan</dt>
                <dd className="font-medium tabular-nums text-secondary-900">{snapshot.counts.ready} dari {snapshot.counts.candidates} siap</dd>
              </div>
            ) : null}
            <div className="min-w-0">
              <dt className="text-xs text-secondary-600">Selesai</dt>
              <dd className="break-words font-medium text-secondary-900">{formatTryoutDateTime(snapshot.availableUntil)} WIB</dd>
            </div>
            {excluded.length ? (
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-secondary-600">Tidak disertakan</dt>
                <dd className="text-secondary-700">{excluded.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
          {sessionNotes.map((note) => <p key={note} className="-mt-2 text-sm leading-6 text-secondary-600">{note}</p>)}
          {snapshot.publication && (!allowPublication || !snapshot.publication.receipt) ? (
            <p className="break-words text-sm leading-6 text-secondary-700">Hasil dirilis {formatTryoutDateTime(snapshot.publication.releasedAt)} WIB. Alasan: {snapshot.publication.reason ?? "Tercatat pada riwayat sesi."}</p>
          ) : null}
          {blockerGroups.length ? (
            <section aria-label="Pengerjaan yang perlu diperiksa" className="grid gap-1 rounded-card border border-student-status-attention-border bg-student-status-attention-bg p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-student-status-attention-fg">
                <AlertTriangle aria-hidden="true" />
                {snapshot.counts.blocked} dari {snapshot.counts.candidates} pengerjaan perlu diperiksa
              </h3>
              <ul className="divide-y divide-student-status-attention-border text-sm leading-6 text-secondary-800">
                {visibleGroups.map((group, index) => (
                  <li key={`${group.attemptId ?? "session"}-${index}`} className="flex min-w-0 items-center justify-between gap-4 py-2 first:pt-1 last:pb-0">
                    <div className="min-w-0">
                      {group.lines.map((line) => (
                        <p key={`${line.message}-${line.sections.join(",")}`} className="break-words">
                          {line.sections.length ? <span className="font-semibold text-secondary-900">{formatBlockerSections(line.sections)}: </span> : null}{line.message}
                        </p>
                      ))}
                    </div>
                    {group.attemptId ? (
                      <Link className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2" href={buildMentorTryoutAttemptHref(scope.tryoutId, group.attemptId, { ...context, session: scope.sessionId, workspace: "participants" })}>
                        Periksa<ArrowRight aria-hidden="true" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
              {blockerGroups.length > BLOCKER_PREVIEW ? (
                <Button className="mt-2 min-h-11 w-full sm:w-auto sm:justify-self-start" variant="outline" onClick={() => setShowAllBlockers((value) => !value)}>
                  {showAllBlockers ? "Ringkas daftar" : `Tampilkan ${blockerGroups.length - BLOCKER_PREVIEW} lainnya`}
                </Button>
              ) : null}
            </section>
          ) : null}
          {allowPublication ? <TryoutResultPublication initial={snapshot} tryoutTitle={tryoutTitle} available={!loading && !failed} refresh={refresh} /> : null}
          <TryoutResultPolicyForm initial={snapshot} refresh={refresh} />
        </>
      ) : !loading && !failed ? <p className="text-sm text-secondary-700">Ringkasan hasil belum tersedia.</p> : null}
    </ReferenceSurface>
  );
}
