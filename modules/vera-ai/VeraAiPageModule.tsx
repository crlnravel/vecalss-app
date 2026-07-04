"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  BookOpenCheck,
  Brain,
  ChartNoAxesColumnIncreasing,
  CircleCheck,
  Clock3,
  Dumbbell,
  FileQuestion,
  Gauge,
  GraduationCap,
  Lightbulb,
  MessageCircle,
  NotebookPen,
  Paperclip,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  Target,
  TriangleAlert,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

import {
  veraAdaptiveDrills,
  veraExplanationContexts,
  veraMessages,
  veraQuickPrompts,
  veraRecommendations,
  veraStrategySnapshot,
  veraWeaknessTopics,
  type VeraAdaptiveDrill,
  type VeraExplanationContext,
  type VeraMessage,
  type VeraWeaknessTopic,
} from "./data";

const drillStatusClass: Record<VeraAdaptiveDrill["status"], string> = {
  Review: "bg-[#fff6d5] text-[#8a6a00]",
  Siap: "bg-primary-100 text-primary-800",
  Ulang: "bg-secondary-100 text-secondary-700",
};

function VeraAiPageModule({ session }: { session: SessionContext }) {
  return (
    <StudentWorkspaceShell
      activeLabel="Vera AI"
      breadcrumbLabel="Vera AI"
      mainClassName="max-w-[1500px] gap-7 lg:gap-8"
      searchPlaceholder="Cari percakapan, topik lemah, atau rekomendasi Vera..."
      session={session}
      sidebarFooterLabel="Vera AI workspace"
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
        <VeraConsole />
        <VeraStatusPanel />
      </section>

      <section>
        <Tabs defaultValue="weakness">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-[30px] leading-tight font-semibold text-secondary-900 md:text-[38px]">
                Vera AI workspace
              </h1>
              <p className="mt-2 max-w-[66ch] text-sm leading-7 text-secondary-500 md:text-base">
                Tempat tanya materi, membaca kelemahan, memilih rekomendasi
                belajar, dan menyiapkan drill personal dari aktivitasmu.
              </p>
            </div>
            <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-primary-50 p-1 sm:max-w-[620px] sm:grid-cols-4">
              <TabsTrigger value="weakness">Kelemahan</TabsTrigger>
              <TabsTrigger value="recommendations">Rute</TabsTrigger>
              <TabsTrigger value="drill">Drill</TabsTrigger>
              <TabsTrigger value="strategy">PTN</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="mt-5" value="weakness">
            <WeaknessAnalysisPanel />
          </TabsContent>
          <TabsContent className="mt-5" value="recommendations">
            <RecommendationQueue />
          </TabsContent>
          <TabsContent className="mt-5" value="drill">
            <AdaptiveDrillPanel />
          </TabsContent>
          <TabsContent className="mt-5" value="strategy">
            <StrategyPanel />
          </TabsContent>
        </Tabs>
      </section>

      <ExplanationReviewPanel />
    </StudentWorkspaceShell>
  );
}

function VeraConsole() {
  return (
    <Card className="relative overflow-hidden rounded-[32px] border border-primary-900/20 bg-[#014c38] py-0 text-white shadow-[0_30px_90px_-54px_rgba(1,76,56,0.58)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(245,197,24,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.12),transparent_42%)]" />
      <div className="relative grid min-h-[630px] gap-0 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 p-5 lg:border-r lg:border-b-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
            <Sparkles className="size-3.5" />
            Live prototype
          </div>
          <h2 className="mt-5 max-w-[12ch] text-[34px] leading-none font-semibold md:text-[42px]">
            Tanya Vera
          </h2>
          <p className="mt-4 text-sm leading-6 text-white/68">
            Chat tutor, analisis kelemahan, rekomendasi belajar, dan strategi
            PTN dalam satu ruang kerja.
          </p>

          <div className="mt-7 grid gap-3">
            <ConsoleMetric icon={MessageCircle} label="Mode" value="Tutor 24/7" />
            <ConsoleMetric icon={Brain} label="Konteks" value="Tryout + quiz" />
            <ConsoleMetric icon={Zap} label="Status" value="Siap bantu" />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 md:px-6">
            <div>
              <p className="text-sm font-semibold text-white">Sesi belajar</p>
              <p className="mt-1 text-xs text-white/56">
                Ringkasan dari performa terakhir
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ContextChip icon={Gauge} label="Tryout 04" />
              <ContextChip icon={BookOpenCheck} label="Quiz PK" />
              <ContextChip icon={Target} label="Target UI" />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-4">
              {veraMessages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
            </div>
          </ScrollArea>

          <div className="border-t border-white/10 p-5 md:p-6">
            <div className="mb-4 flex flex-wrap gap-2">
              {veraQuickPrompts.map((prompt) => (
                <button
                  className="rounded-full border border-white/14 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/82 transition-colors hover:bg-white/14"
                  key={prompt.id}
                  title={prompt.prompt}
                  type="button"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-[22px] border border-white/12 bg-white/10 p-2">
              <Button aria-label="Lampirkan konteks" size="icon-sm" variant="inverseOutline">
                <Paperclip />
              </Button>
              <Input
                className="h-11 border-transparent bg-transparent text-white placeholder:text-white/42 focus-visible:border-white/20 focus-visible:ring-white/15"
                placeholder="Tulis pertanyaan untuk Vera..."
                readOnly
              />
              <Button disabled size="sm" variant="inverseOutline">
                Menunggu backend
                <SendHorizontal data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function VeraStatusPanel() {
  return (
    <div className="grid gap-5">
      <Card className="rounded-[30px] border border-primary-100 bg-white/94 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.25)]">
        <CardHeader className="gap-2 px-6 pt-6">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bot className="size-4 text-primary-700" />
            Hari ini Vera melihat
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-6">
          <StatusRow
            icon={TriangleAlert}
            label="Perlu perhatian"
            value="PU dan PK turun di tipe dua langkah."
          />
          <StatusRow
            icon={CircleCheck}
            label="Masih aman"
            value="LBI stabil, cukup jaga ritme review."
          />
          <StatusRow
            icon={Clock3}
            label="Sesi singkat"
            value="28 menit cukup untuk rute rekomendasi hari ini."
          />
        </CardContent>
      </Card>

      <Card className="rounded-[30px] border border-primary-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,248,244,0.98))] shadow-[0_20px_72px_-56px_rgba(1,76,56,0.22)]">
        <CardHeader className="gap-2 px-6 pt-6">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <GraduationCap className="size-4 text-primary-700" />
            Target snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 px-6">
          <div className="rounded-[24px] border border-primary-100 bg-white/84 p-5">
            <p className="text-xs font-semibold tracking-[0.12em] text-primary-700 uppercase">
              {veraStrategySnapshot.target}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <MiniStat label="Skor" value={veraStrategySnapshot.currentScore} />
              <MiniStat label="Target" value={veraStrategySnapshot.targetScore} />
              <MiniStat label="Gap" value={veraStrategySnapshot.gap} />
            </div>
          </div>
          <Button
            nativeButton={false}
            render={<Link href="#strategy" />}
            size="sm"
            variant="brandOutline"
          >
            Lihat strategi
            <ArrowUpRight data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WeaknessAnalysisPanel() {
  return (
    <div id="weakness" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="rounded-[30px] border border-primary-100 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.24)]">
        <CardHeader className="gap-2 px-6 pt-6 md:px-7">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <ChartNoAxesColumnIncreasing className="size-4 text-primary-700" />
            Analisis kelemahan
          </CardTitle>
          <CardAction>
            <Button size="sm" variant="ghost">
              Refresh
              <RefreshCw data-icon="inline-end" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 px-6 md:px-7">
          {veraWeaknessTopics.map((topic) => (
            <WeaknessTopicCard key={topic.id} topic={topic} />
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[30px] border border-primary-100 bg-primary-50/70 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.18)]">
        <CardHeader className="gap-2 px-6 pt-6">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Lightbulb className="size-4 text-primary-700" />
            Cara baca Vera
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-6">
          <p className="text-sm leading-7 text-secondary-600">
            Vera tidak hanya melihat skor akhir. Ia memecah sumber kelemahan
            dari topik, tempo, dan pola salah supaya rekomendasi tidak terasa
            acak.
          </p>
          <div className="grid gap-3">
            <MiniStat label="Sumber data" value="Tryout, quiz, drill" />
            <MiniStat label="Prioritas" value="Akurasi + tempo" />
            <MiniStat label="Output" value="Modul dan soal berikutnya" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RecommendationQueue() {
  return (
    <div id="recommendations" className="grid gap-5 lg:grid-cols-3">
      {veraRecommendations.map((item) => (
        <article
          className="flex min-h-[260px] flex-col rounded-[30px] border border-primary-100 bg-white/94 p-6 shadow-[0_20px_72px_-58px_rgba(1,76,56,0.22)]"
          key={item.id}
        >
          <div className="flex items-start justify-between gap-4">
            <span className="text-[32px] leading-none font-semibold text-primary-200">
              {item.rank}
            </span>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">
              {item.type}
            </span>
          </div>
          <h2 className="mt-8 text-2xl leading-tight font-semibold text-secondary-900">
            {item.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-secondary-500">
            {item.reason}
          </p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-7">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-secondary-600">
              <Clock3 className="size-4 text-primary-700" />
              {item.duration}
            </span>
            <Button
              nativeButton={false}
              render={<Link href={item.href} />}
              size="sm"
              variant="brand"
            >
              Buka
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function AdaptiveDrillPanel() {
  return (
    <Card
      id="drill"
      className="rounded-[30px] border border-primary-100 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.24)]"
    >
      <CardHeader className="gap-2 px-6 pt-6 md:px-7">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Dumbbell className="size-4 text-primary-700" />
          Drill soal adaptif
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-6 md:grid-cols-3 md:px-7">
        {veraAdaptiveDrills.map((drill) => (
          <article
            className="flex min-h-[250px] flex-col rounded-[26px] border border-primary-100 bg-white/88 p-5"
            key={drill.id}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-full bg-secondary-50 px-3 py-1 text-xs font-semibold text-secondary-600">
                {drill.difficulty}
              </span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  drillStatusClass[drill.status],
                )}
              >
                {drill.status}
              </span>
            </div>
            <h2 className="mt-6 text-xl leading-snug font-semibold text-secondary-900">
              {drill.topic}
            </h2>
            <p className="mt-3 text-sm leading-6 text-secondary-500">
              {drill.readiness}
            </p>
            <div className="mt-5 grid gap-2 text-sm text-secondary-600">
              <span className="inline-flex items-center gap-2">
                <NotebookPen className="size-4 text-primary-700" />
                {drill.questionCount}
              </span>
              <span className="inline-flex items-center gap-2">
                <Sparkles className="size-4 text-primary-700" />
                {drill.source}
              </span>
            </div>
            <div className="mt-auto pt-6">
              <Button className="w-full" disabled size="sm" variant="brand">
                Siapkan drill
                <Zap data-icon="inline-end" />
              </Button>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}

function StrategyPanel() {
  return (
    <div id="strategy" className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
      <Card className="rounded-[30px] border border-primary-100 bg-[#014c38] text-white shadow-[0_24px_84px_-56px_rgba(1,76,56,0.45)]">
        <CardHeader className="gap-2 px-6 pt-6">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <GraduationCap className="size-4 text-white/86" />
            Konsultasi PTN dan jurusan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-white/54 uppercase">
            Target utama
          </p>
          <h2 className="mt-3 text-[30px] leading-tight font-semibold">
            {veraStrategySnapshot.target}
          </h2>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <DarkStat label="Skor" value={veraStrategySnapshot.currentScore} />
            <DarkStat label="Target" value={veraStrategySnapshot.targetScore} />
            <DarkStat label="Gap" value={veraStrategySnapshot.gap} />
          </div>
          <Button className="mt-7" disabled size="sm" variant="inverseOutline">
            Tanya strategi 14 hari
            <MessageCircle data-icon="inline-end" />
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-[30px] border border-primary-100 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.24)]">
        <CardHeader className="gap-2 px-6 pt-6">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Target className="size-4 text-primary-700" />
            Rencana dari Vera
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-6">
          {veraStrategySnapshot.focus.map((item, index) => (
            <div
              className="flex gap-3 rounded-[22px] border border-primary-100 bg-white/86 p-4"
              key={item}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-semibold text-white">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-secondary-600">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ExplanationReviewPanel() {
  return (
    <Card className="rounded-[30px] border border-primary-100 bg-white/94 shadow-[0_20px_72px_-56px_rgba(1,76,56,0.22)]">
      <CardHeader className="gap-2 px-6 pt-6 md:px-7">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <FileQuestion className="size-4 text-primary-700" />
          Pembahasan soal salah
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-6 md:grid-cols-3 md:px-7">
        {veraExplanationContexts.map((item) => (
          <ExplanationCard item={item} key={item.id} />
        ))}
      </CardContent>
    </Card>
  );
}

function WeaknessTopicCard({ topic }: { topic: VeraWeaknessTopic }) {
  return (
    <article className="rounded-[26px] border border-primary-100 bg-white/88 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">
              {topic.subtest}
            </span>
            <span className="text-xs font-semibold text-secondary-400">
              {topic.source}
            </span>
          </div>
          <h2 className="mt-3 text-xl leading-tight font-semibold text-secondary-900">
            {topic.topic}
          </h2>
          <p className="mt-2 text-sm leading-6 text-secondary-500">
            {topic.recommendation}
          </p>
        </div>
        <Button size="sm" variant="brandOutline">
          Ask Vera
          <MessageCircle data-icon="inline-end" />
        </Button>
      </div>
      <Progress className="mt-5 gap-2" value={topic.mastery}>
        <ProgressLabel className="text-sm text-secondary-600">
          Mastery
        </ProgressLabel>
        <ProgressValue className="text-xs text-secondary-500">
          {() => `${topic.mastery}%`}
        </ProgressValue>
      </Progress>
      <p className="mt-2 text-xs font-medium text-secondary-400">
        {topic.trend}
      </p>
    </article>
  );
}

function ExplanationCard({ item }: { item: VeraExplanationContext }) {
  return (
    <article className="flex min-h-[240px] flex-col rounded-[26px] border border-primary-100 bg-primary-50/64 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-800">
          {item.label}
        </span>
        <span className="text-xs font-medium text-secondary-400">
          {item.source}
        </span>
      </div>
      <h2 className="mt-5 text-lg leading-snug font-semibold text-secondary-900">
        {item.question}
      </h2>
      <p className="mt-3 text-sm leading-6 text-secondary-500">
        {item.mistake}
      </p>
      <div className="mt-auto pt-6">
        <Button className="w-full" disabled size="sm" variant="brandOutline">
          Jelaskan dengan Vera
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </div>
    </article>
  );
}

function ChatBubble({ message }: { message: VeraMessage }) {
  const isVera = message.role === "vera";

  return (
    <div className={cn("flex", isVera ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[760px] rounded-[24px] px-4 py-3 md:px-5 md:py-4",
          isVera
            ? "bg-white text-secondary-900"
            : "bg-[#f5c518] text-secondary-900",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold">
            {isVera ? "Vera AI" : "Kamu"}
          </span>
          <span className="text-xs opacity-58">{message.time}</span>
          {message.context ? (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
              {message.context}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-7 md:text-[15px]">{message.text}</p>
      </div>
    </div>
  );
}

function ConsoleMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/8 p-3.5">
      <div className="flex items-center gap-2 text-white/68">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ContextChip({
  icon: Icon,
  label,
}: {
  icon: typeof Gauge;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/80">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function StatusRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TriangleAlert;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3 rounded-[22px] border border-primary-100 bg-white/84 p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-secondary-900">{label}</p>
        <p className="mt-1 text-sm leading-6 text-secondary-500">{value}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white/86 p-3">
      <p className="text-xs text-secondary-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

function DarkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <p className="text-xs text-white/56">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export { VeraAiPageModule };
