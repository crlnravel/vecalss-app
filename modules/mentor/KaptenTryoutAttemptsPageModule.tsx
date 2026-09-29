"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { buildMentorTryoutAttemptHref, parseMentorTryoutContext } from "@/lib/navigation/canonical-context";
import { liveStateLabels } from "@/lib/tryout/operations-projections";
import { participantAttemptStateLabels } from "@/modules/mentor/KaptenTryoutOperationsData";
import { TryoutRefreshNotice, TryoutRefreshToolbar, useTryoutOperationsRefresh } from "@/modules/mentor/KaptenTryoutOperationsRefresh";

function formatRemaining(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}d`;
}

function KaptenTryoutAttemptsPageModule({ initial }: { initial: TryoutOperationsView }) {
  const searchParams = useSearchParams();
  const { refreshMessage, refreshState, retryRefresh, updatedLabel, view } = useTryoutOperationsRefresh(initial);
  const liveByAttemptId = useMemo(() => new Map(view.live.flatMap((item) => item.attemptId ? [[item.attemptId, item] as const] : [])), [view.live]);
  const parentContext = useMemo(() => {
    const parsed = parseMentorTryoutContext(new URLSearchParams(searchParams.toString()));
    return parsed.issues.length
      ? {}
      : { delivery: parsed.delivery, parent: parsed.parent, returnTo: parsed.returnTo, workspace: parsed.workspace };
  }, [searchParams]);

  return (
    <section className="grid gap-4" aria-label="Daftar pengerjaan peserta">
      <header className="flex justify-end">
        <TryoutRefreshToolbar
          ariaLabel="Perbarui daftar pengerjaan"
          onRefresh={retryRefresh}
          refreshState={refreshState}
          updatedLabel={updatedLabel}
        />
      </header>
      <TryoutRefreshNotice message={refreshMessage} onRetry={retryRefresh} />

      <div className="overflow-hidden rounded-4xl border border-primary-100 bg-white shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)]">
        <Table className="min-w-[680px]">
          <caption className="sr-only">Daftar attempt peserta yang tercatat</caption>
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="border-0 bg-primary-50/60 hover:bg-primary-50/60">
              <TableHead className="h-11 px-4 text-xs font-semibold text-secondary-600 sm:px-5">Peserta</TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold text-secondary-600 sm:px-5">Sesi</TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold text-secondary-600 sm:px-5">Status</TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold text-secondary-600 sm:px-5">Test selesai</TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold text-secondary-600 sm:px-5">Jawaban</TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold text-secondary-600 sm:px-5">Timer aktif</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.attempts.length ? view.attempts.map((attempt) => {
              const live = liveByAttemptId.get(attempt.id);
              const activeRun = attempt.runs.find((run) => run.status === "active") ?? null;
              const answeredCount = attempt.runs.reduce((total, run) => total + run.answeredCount, 0);
              const questionCount = attempt.runs.reduce((total, run) => total + run.questionCount, 0);
              const sealedRuns = attempt.runs.filter((run) => run.status === "sealed" || run.status === "expired").length;
              const status = live
                ? liveStateLabels[live.state]
                : participantAttemptStateLabels[attempt.attemptState] ?? attempt.attemptState;
              return (
                <TableRow className="border-0 hover:bg-primary-50/45" key={attempt.id}>
                  <TableCell className="max-w-56 truncate px-4 py-3.5 font-semibold text-secondary-900 sm:px-5">
                    <Link
                      className="underline decoration-primary-200 underline-offset-4 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200"
                      href={buildMentorTryoutAttemptHref(initial.id, attempt.id, { ...parentContext, participant: attempt.admissionId, session: attempt.sessionId })}
                    >
                      {attempt.student}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-48 truncate px-4 py-3.5 text-secondary-700 sm:px-5">{attempt.sessionName}</TableCell>
                  <TableCell className="px-4 py-3.5 sm:px-5">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-secondary-800">
                      <span aria-hidden="true" className={`size-2 rounded-full ${live?.severity === "critical" ? "bg-voyage-warm-sun" : live?.severity === "attention" ? "bg-voyage-leaf" : "bg-primary-300"}`} />
                      {status}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 tabular-nums text-secondary-700 sm:px-5">{sealedRuns}/{attempt.runs.length || 7}</TableCell>
                  <TableCell className="px-4 py-3.5 tabular-nums text-secondary-700 sm:px-5">{answeredCount}/{questionCount || "—"}</TableCell>
                  <TableCell className="px-4 py-3.5 tabular-nums text-secondary-700 sm:px-5">{formatRemaining(activeRun?.remainingSeconds ?? null)}</TableCell>
                </TableRow>
              );
            }) : (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell className="h-32 px-5 text-center text-sm text-secondary-500" colSpan={6}>
                  Belum ada attempt yang tercatat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export { KaptenTryoutAttemptsPageModule };
