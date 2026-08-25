"use client";

import Link from "next/link";
import { ExternalLink, Search } from "@/lib/icons";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SessionContext } from "@/lib/auth/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type Attempt = {
  aggregateScore: number | null;
  correctCount: number | null;
  createdAt: string;
  finalScore: number | null;
  id: string;
  participationId: string;
  score: number | null;
  status: string;
  student: { name: string };
  submittedAt: string | null;
};

type Result = {
  attempts: Attempt[];
  quiz: { id: string; questionCount: number; subject: string; title: string };
};

const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta", timeStyle: "short" });

function KaptenQuizResultsContent({ result }: { result: Result }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "in_progress" | "submitted">("all");
  const visibleAttempts = useMemo(() => result.attempts.filter((attempt) => {
    const matchesQuery = !query.trim() || attempt.student.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchesStatus = filter === "all" || (filter === "submitted" ? attempt.status !== "in_progress" : attempt.status === "in_progress");
    return matchesQuery && matchesStatus;
  }), [filter, query, result.attempts]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-secondary-900">Hasil Kuis</h2>
      </div>
      <section className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block min-w-0 flex-1 lg:max-w-md"><span className="sr-only">Cari nama siswa</span><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" /><input className="h-11 w-full rounded-2xl border border-primary-200 bg-primary-50/30 px-10 text-sm text-secondary-900 outline-none transition focus:border-primary-500 focus:ring-3 focus:ring-primary-300/35" onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama siswa…" type="search" value={query} /></label>
          <div aria-label="Filter hasil" className="flex flex-wrap gap-2" role="group">
            {([[
              "all",
              "Semua",
            ], ["submitted", "Terkirim"], ["in_progress", "Berjalan"]] as const).map(([value, label]) => <Button aria-pressed={filter === value} className="rounded-full" key={value} onClick={() => setFilter(value)} size="sm" type="button" variant={filter === value ? "brand" : "brandOutline"}>{label}</Button>)}
          </div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-2xl border border-primary-100">
          <Table className="min-w-[720px]"><TableHeader className="bg-primary-50/75"><TableRow className="hover:bg-primary-50/75"><TableHead className="h-auto px-5 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Nama</TableHead><TableHead className="h-auto w-28 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Skor</TableHead><TableHead className="h-auto w-36 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Status</TableHead><TableHead className="h-auto w-44 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Mulai</TableHead><TableHead className="h-auto w-24 px-5 py-3 text-right text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Aksi</TableHead></TableRow></TableHeader><TableBody>{visibleAttempts.length ? visibleAttempts.map((attempt) => <AttemptRow attempt={attempt} key={attempt.id} quizId={result.quiz.id} />) : <TableRow><TableCell className="h-32 text-center text-sm text-secondary-500" colSpan={5}>Belum ada hasil yang sesuai.</TableCell></TableRow>}</TableBody></Table>
        </div>
      </section>
    </div>
  );
}

function AttemptRow({ attempt, quizId }: { attempt: Attempt; quizId: string }) {
  const isSubmitted = attempt.status !== "in_progress";
  return <TableRow className="border-primary-100 hover:bg-primary-50/40"><TableCell className="px-5 py-4"><div className="flex min-w-0 items-center gap-3"><Avatar className="size-9 border border-primary-100 bg-primary-50"><AvatarFallback className="bg-primary-50 text-xs font-bold text-primary-800">{initials(attempt.student.name)}</AvatarFallback></Avatar><span className="truncate font-semibold text-secondary-900">{attempt.student.name}</span></div></TableCell><TableCell className="px-4 py-4"><span className="text-xl font-semibold tabular-nums text-secondary-900">{isSubmitted ? attempt.aggregateScore ?? attempt.finalScore ?? attempt.score ?? 0 : "—"}</span></TableCell><TableCell className="px-4 py-4"><Badge className="rounded-full px-2.5 py-1 text-xs" size="ui" variant={isSubmitted ? "mint" : "accent"}>{isSubmitted ? "Terkirim" : "Sedang dikerjakan"}</Badge></TableCell><TableCell className="px-4 py-4 text-sm text-secondary-600"><time dateTime={attempt.createdAt}>{dateTime.format(new Date(attempt.createdAt))}</time></TableCell><TableCell className="px-5 py-4 text-right"><Button aria-label="Lihat submisi" nativeButton={false} render={<Link href={`/mentor/quiz/${quizId}/results/${attempt.id}`} />} size="icon-sm" variant="brand"><ExternalLink /></Button></TableCell></TableRow>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
}

function KaptenQuizResultsPageModule({ result, session }: { result: Result; session: SessionContext }) {
  return <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={`${result.quiz.subject} · Hasil Kuis`} contentElement="div" session={session} showSearch={false}><KaptenQuizResultsContent result={result} /></MentorWorkspaceShell>;
}

export { KaptenQuizResultsContent, KaptenQuizResultsPageModule };
export type { Result as KaptenQuizResultsData };
