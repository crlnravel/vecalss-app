"use client";

import { CircleAlert } from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import {
  resultReleaseStateLabels,
} from "@/lib/tryout/operations-projections";

type ResultStatusTone = "attention" | "neutral" | "success";

function resultReleaseLabel(state: string) {
  return state === "hidden"
    ? "Belum dirilis"
    : resultReleaseStateLabels[state as keyof typeof resultReleaseStateLabels] ?? state;
}

function resultReleaseTone(state: string): ResultStatusTone {
  return state === "released" ? "success" : "attention";
}

function ResultStatus({ label, tone = "neutral" }: { label: string; tone?: ResultStatusTone }) {
  const dotClass = tone === "success" ? "bg-primary-700" : tone === "attention" ? "bg-voyage-warm-sun" : "bg-secondary-400";
  return <span className="inline-flex items-center gap-2 text-sm text-secondary-700"><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dotClass}`} />{label}</span>;
}

function KaptenTryoutResultsPageModule({ initial, selectedSessionId }: { initial: TryoutOperationsView; selectedSessionId?: string | null }) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(selectedSessionId ?? initial.sessions[0]?.id ?? null);
  const validSessionId = useMemo(() => initial.sessions.some((session) => session.id === activeSessionId) ? activeSessionId : initial.sessions[0]?.id ?? null, [activeSessionId, initial.sessions]);
  const activeSession = initial.sessions.find((session) => session.id === validSessionId) ?? null;
  const visibleSessions = activeSession ? [activeSession] : [];

  useEffect(() => {
    if (!selectedSessionId || !validSessionId || selectedSessionId === validSessionId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", "results");
    url.searchParams.set("session", validSessionId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [selectedSessionId, validSessionId]);

  const selectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", "results");
    url.searchParams.set("session", sessionId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <section className="grid gap-6" aria-labelledby="tryout-results-title">
      <header className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-secondary-900" id="tryout-results-title">Results</h2>
      </header>

      {initial.sessions.length ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3.5">
        <label className="text-sm font-semibold text-secondary-900" htmlFor="results-session">Sesi yang ditampilkan</label>
        <select className="min-h-10 w-full min-w-0 basis-full rounded-xl border border-primary-100 bg-white px-3 text-sm text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100 sm:basis-auto sm:flex-1 sm:max-w-md" id="results-session" onChange={(event) => selectSession(event.target.value)} value={validSessionId ?? ""}>
          {initial.sessions.map((session) => <option key={session.id} value={session.id}>{session.name} · {session.status === "closed" ? "Ditutup" : session.status === "active" ? "Aktif" : "Draf"}</option>)}
        </select>
        {selectedSessionId && selectedSessionId !== validSessionId ? <p className="basis-full text-xs leading-5 text-[#8a5e00]">Sesi dari tautan sebelumnya tidak tersedia. Sesi ini dipilih agar konteks tetap aman.</p> : null}
      </div> : null}

      <div className="grid gap-5">
        {visibleSessions.length ? visibleSessions.map((session) => {
          const results = initial.results.filter((result) => result.sessionId === session.id);
          return (
            <section aria-labelledby={`results-session-${session.id}`} key={session.id}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-secondary-900" id={`results-session-${session.id}`}>{session.name}</h3>
                  <p className="mt-1 text-sm text-secondary-600">{formatTryoutDateTime(session.availableFrom)} WIB — {formatTryoutDateTime(session.availableUntil)} WIB</p>
                </div>
                <ResultStatus label={resultReleaseLabel(session.releaseState)} tone={resultReleaseTone(session.releaseState)} />
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-primary-100 bg-white">
                <Table className="min-w-[520px]">
                  <caption className="sr-only">Hasil peserta untuk {session.name}</caption>
                  <TableHeader className="bg-secondary-50/80">
                    <TableRow className="border-primary-100 hover:bg-secondary-50/80">
                      <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold text-secondary-700 sm:px-5">Peserta</TableHead>
                      <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold text-secondary-700 sm:px-5">Skor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.length ? results.map((result) => (
                      <TableRow className="border-primary-100 hover:bg-secondary-50/70" key={result.attemptId}>
                        <TableCell className="max-w-[16rem] whitespace-normal px-4 py-3.5 align-top sm:px-5">
                          <p className="font-medium text-secondary-900">{result.participant}</p>
                          {result.reviewReason ? <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-[#6a4a00]"><CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />{result.reviewReason}</p> : null}
                        </TableCell>
                        <TableCell className="px-4 py-3.5 align-top sm:px-5">{result.scoreVisible && result.displayScore !== null ? <span className="font-semibold tabular-nums text-secondary-900">{Number(result.displayScore).toFixed(2)}</span> : <span className="text-sm text-secondary-500">Belum tersedia</span>}</TableCell>
                      </TableRow>
                    )) : <TableRow className="hover:bg-transparent"><TableCell className="px-4 py-10 text-center text-sm text-secondary-600 sm:px-5" colSpan={2}>{session.status === "closed" ? "Tidak ada attempt untuk sesi ini. Sesi tetap tersimpan untuk audit." : "Belum ada attempt untuk sesi ini."}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        }) : <div className="grid min-h-40 place-items-center rounded-3xl border border-dashed border-primary-200 bg-white px-5 py-10 text-center text-sm text-secondary-500">Belum ada sesi delivery untuk menampilkan hasil.</div>}
      </div>
    </section>
  );
}

export { KaptenTryoutResultsPageModule };
