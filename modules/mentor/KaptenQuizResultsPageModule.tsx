"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ExternalLink, Search } from "@/lib/icons";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SessionContext } from "@/lib/auth/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

const Bar = dynamic(() => import("recharts").then((module) => module.Bar));
const BarChart = dynamic(() => import("recharts").then((module) => module.BarChart));
const CartesianGrid = dynamic(() => import("recharts").then((module) => module.CartesianGrid));
const LabelList = dynamic(() => import("recharts").then((module) => module.LabelList));
const Scatter = dynamic(() => import("recharts").then((module) => module.Scatter));
const ScatterChart = dynamic(() => import("recharts").then((module) => module.ScatterChart));
const XAxis = dynamic(() => import("recharts").then((module) => module.XAxis));
const YAxis = dynamic(() => import("recharts").then((module) => module.YAxis));

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
const scoreIntervals = [
  { label: "0–24", maximumScore: 24, minimumScore: 0 },
  { label: "25–49", maximumScore: 49, minimumScore: 25 },
  { label: "50–74", maximumScore: 74, minimumScore: 50 },
  { label: "75–100", maximumScore: 100, minimumScore: 75 },
] as const;
const gradeDistributionChartConfig = { students: { color: "var(--primary-700)", label: "Siswa" } } satisfies ChartConfig;
const scoreProfileChartConfig = { score: { color: "var(--primary-500)", label: "Skor" } } satisfies ChartConfig;

function percentage(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function median(scores: number[]) {
  if (!scores.length) return 0;
  const ordered = [...scores].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : Math.round(((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2);
}

function KaptenQuizResultsContent({ result }: { result: Result }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "in_progress" | "submitted">("all");
  const submitted = result.attempts.filter((attempt) => attempt.status !== "in_progress");
  const scores = submitted.map((attempt) => attempt.aggregateScore ?? attempt.finalScore ?? attempt.score ?? 0);
  const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const topScore = scores.length ? Math.max(...scores) : 0;
  const lowestScore = scores.length ? Math.min(...scores) : 0;
  const averageCorrect = submitted.length ? Math.round(submitted.reduce((sum, attempt) => sum + (attempt.correctCount ?? 0), 0) / submitted.length) : 0;
  const completionRate = percentage(submitted.length, result.attempts.length);
  const distribution = scoreIntervals.map((interval) => ({ ...interval, count: scores.filter((score) => score >= interval.minimumScore && score <= interval.maximumScore).length }));
  const visibleAttempts = useMemo(() => result.attempts.filter((attempt) => {
    const matchesQuery = !query.trim() || attempt.student.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchesStatus = filter === "all" || (filter === "submitted" ? attempt.status !== "in_progress" : attempt.status === "in_progress");
    return matchesQuery && matchesStatus;
  }), [filter, query, result.attempts]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-secondary-900">Hasil Kuis</h2>
        <p className="mt-1 text-sm leading-6 text-secondary-500">Pantau penyelesaian dan performa siswa tanpa meninggalkan detail Kuis.</p>
      </div>
      <Tabs className="gap-5" defaultValue="students">
        <TabsList aria-label="Bagian hasil Kuis" className="w-fit max-w-full overflow-x-auto">
          <TabsTrigger className="min-h-11" value="students">Peserta</TabsTrigger>
          <TabsTrigger className="min-h-11" value="statistics">Statistik</TabsTrigger>
        </TabsList>
        <TabsContent className="m-0" value="students">
          <section className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block min-w-0 flex-1 lg:max-w-md"><span className="sr-only">Cari nama siswa</span><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" /><input className="h-11 w-full rounded-2xl border border-primary-200 bg-primary-50/30 px-10 text-sm text-secondary-900 outline-none transition focus:border-primary-500 focus:ring-3 focus:ring-primary-300/35" onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama siswa…" type="search" value={query} /></label>
              <Tabs className="w-fit gap-0" onValueChange={(value) => setFilter(value as typeof filter)} value={filter}><TabsList aria-label="Filter hasil peserta"><TabsTrigger className="min-h-11 rounded-full px-3 text-sm font-semibold" value="all">Semua</TabsTrigger><TabsTrigger className="min-h-11 rounded-full px-3 text-sm font-semibold" value="submitted">Terkirim</TabsTrigger><TabsTrigger className="min-h-11 rounded-full px-3 text-sm font-semibold" value="in_progress">Berjalan</TabsTrigger></TabsList></Tabs>
            </div>
            <div className="mt-5 overflow-x-auto rounded-2xl border border-primary-100">
              <Table className="min-w-[720px]"><TableHeader className="bg-primary-50/75"><TableRow className="hover:bg-primary-50/75"><TableHead className="h-auto px-5 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Nama</TableHead><TableHead className="h-auto w-28 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Skor</TableHead><TableHead className="h-auto w-36 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Status</TableHead><TableHead className="h-auto w-44 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Mulai</TableHead><TableHead className="h-auto w-24 px-5 py-3 text-right text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">Aksi</TableHead></TableRow></TableHeader><TableBody>{visibleAttempts.length ? visibleAttempts.map((attempt) => <AttemptRow attempt={attempt} key={attempt.id} quizId={result.quiz.id} />) : <TableRow><TableCell className="h-32 text-center text-sm text-secondary-500" colSpan={5}>Belum ada hasil yang sesuai.</TableCell></TableRow>}</TableBody></Table>
            </div>
          </section>
        </TabsContent>
        <TabsContent className="m-0" value="statistics"><StatisticsPanel average={average} averageCorrect={averageCorrect} completionRate={completionRate} distribution={distribution} lowestScore={lowestScore} medianScore={median(scores)} participantCount={result.attempts.length} questionCount={result.quiz.questionCount} submittedCount={submitted.length} topScore={topScore} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatisticsPanel({ average, averageCorrect, completionRate, distribution, lowestScore, medianScore, participantCount, questionCount, submittedCount, topScore }: { average: number; averageCorrect: number; completionRate: number; distribution: Array<{ count: number; label: string; maximumScore: number; minimumScore: number }>; lowestScore: number; medianScore: number; participantCount: number; questionCount: number; submittedCount: number; topScore: number }) {
  const scoreProfile = [{ label: "Min", score: lowestScore }, { label: "Median", score: medianScore }, { label: "Rata-rata", score: average }, { label: "Maks", score: topScore }];
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]"><section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6"><div className="flex items-baseline justify-between gap-4"><div><h3 className="text-lg font-semibold text-secondary-900">Distribusi nilai</h3><p className="mt-1 text-sm text-secondary-500">Kelompok nilai dari hasil yang telah dikirim.</p></div><span className="shrink-0 text-sm text-secondary-500">{submittedCount} terkirim</span></div><ChartContainer className="mt-5 h-[280px] w-full" config={gradeDistributionChartConfig}><BarChart accessibilityLayer data={distribution} margin={{ bottom: 2, left: 0, right: 4, top: 20 }}><CartesianGrid strokeDasharray="4 4" vertical={false} /><XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={32} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `Interval nilai ${value}`} />} /><Bar dataKey="count" fill="var(--color-students)" name="students" radius={[8, 8, 2, 2]}><LabelList className="fill-secondary-700 text-xs font-semibold" dataKey="count" position="top" /></Bar></BarChart></ChartContainer></section><div className="grid gap-4"><section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6"><div><h3 className="text-lg font-semibold text-secondary-900">Peta skor</h3><p className="mt-1 text-sm text-secondary-500">Posisi min, median, rata-rata, dan maks pada skala 0–100.</p></div><ChartContainer className="mt-4 h-[220px] w-full" config={scoreProfileChartConfig}><ScatterChart accessibilityLayer margin={{ bottom: 2, left: 0, right: 44, top: 12 }}><CartesianGrid horizontal={false} strokeDasharray="4 4" /><XAxis axisLine={false} dataKey="score" domain={[0, 100]} tickLine={false} tickMargin={10} type="number" /><YAxis axisLine={false} dataKey="label" tickLine={false} type="category" width={82} /><ChartTooltip content={<ChartTooltipContent labelKey="label" nameKey="score" />} /><Scatter data={scoreProfile} dataKey="score" fill="var(--color-score)" name="score"><LabelList className="fill-secondary-700 text-xs font-semibold" dataKey="score" position="right" /></Scatter></ScatterChart></ChartContainer></section><section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6"><Progress aria-label="Penyelesaian Kuis" className="gap-2.5" value={completionRate}><div className="flex items-center justify-between gap-4"><ProgressLabel className="font-semibold text-secondary-900">Penyelesaian Kuis</ProgressLabel><ProgressValue className="text-base font-semibold text-primary-800" /></div></Progress><p className="mt-2 text-sm leading-6 text-secondary-500">{submittedCount} dari {participantCount} siswa telah mengirim jawaban.</p><div className="mt-4 flex items-baseline justify-between gap-4 border-t border-primary-100 pt-4"><p className="text-sm text-secondary-500">Rata-rata benar</p><p className="text-lg font-semibold tabular-nums text-secondary-900">{averageCorrect}<span className="ml-1 text-sm font-medium text-secondary-500">/ {questionCount}</span></p></div></section></div></div>;
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
