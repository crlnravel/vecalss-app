"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "@/lib/icons";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { groupReadinessBlockers, formatBlockerSections } from "@/lib/tryout/readiness-blocker-groups";
import { buildMentorTryoutAttemptHref, type MentorTryoutContext } from "@/lib/navigation/canonical-context";
import { readTryoutSessionReadiness, type TryoutResultReadinessScope, type TryoutSessionReadiness } from "@/lib/tryout/result-readiness";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { TryoutPublishBlockedHelp } from "@/modules/mentor/components/tryout-publish-blocked-help";
import { describePublishBlockedReason } from "@/lib/tryout/result-release-status";
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
export function TryoutSessionResultReadiness({ scope, context, tryoutTitle = "Tryout", allowPublication = false, compact = false }: { scope: TryoutResultReadinessScope; context: MentorTryoutContext; tryoutTitle?: string; allowPublication?: boolean; compact?: boolean }) {
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
  // Nothing to act on or read yet (e.g. a draft Tryout whose rule cannot be changed): skip the card.
  const hasContent = Boolean(snapshot && (snapshot.policy.editable || snapshot.publication || blockerGroups.length || snapshot.effectivePolicy === "manual"));
  const visibleGroups = showAllBlockers ? blockerGroups : blockerGroups.slice(0, BLOCKER_PREVIEW);
  const blockedReason = snapshot ? describePublishBlockedReason(snapshot, !loading) : null;
  if (compact) {
    if (!allowPublication) return null;
    return <div className="mb-5 flex min-w-0 flex-wrap items-center justify-end gap-3">
      {failed ? <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm leading-6 text-secondary-700">Kesiapan terbaru belum dapat dimuat. Muat ulang sebelum melanjutkan.</p>
        <Button variant="outline" disabled={loading} onClick={() => void refresh().catch(() => {})}>{loading ? "Memuat…" : "Muat ulang"}</Button>
      </div> : null}
      {snapshot ? <TryoutResultPublication compact initial={snapshot} tryoutTitle={tryoutTitle} available={!loading && !failed} refresh={refresh} /> : <Button disabled>Rilis hasil</Button>}
      {snapshot && !failed && blockedReason ? <TryoutPublishBlockedHelp reason={blockedReason} /> : null}
    </div>;
  }
  if (!failed && !hasContent) return null;
  return (
    <ReferenceSurface as="section" className="mb-5 grid min-w-0 grid-cols-1 gap-5 p-4 sm:p-5" aria-labelledby="session-readiness-title">
      <h2 id="session-readiness-title" className="sr-only">Kesiapan hasil sesi</h2>
      {failed ? <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-secondary-700">Kesiapan terbaru belum dapat dimuat. Muat ulang sebelum melanjutkan.</p>
        <Button variant="outline" disabled={loading} onClick={() => void refresh().catch(() => {})}>{loading ? "Memuat…" : "Muat ulang"}</Button>
      </div> : null}
      {snapshot ? (
        <>
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
                      <Link className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2" href={buildMentorTryoutAttemptHref(scope.tryoutId, group.attemptId, { ...context, workspace: "participants" })}>
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
      ) : null}
    </ReferenceSurface>
  );
}
