import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Heart,
  Lock,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";

import type {
  QuizAttempt,
  QuizAttemptNavState,
  QuizItem,
  QuizSubject,
} from "./data";

function QuizOngoingPageModule({
  attempt,
  quiz,
  session,
  subject,
}: {
  attempt: QuizAttempt;
  quiz: QuizItem;
  session: SessionContext;
  subject: QuizSubject;
}) {
  return (
    <StudentWorkspaceShell
      activeLabel="Quiz"
      breadcrumbLabel={`${subject.title} · ${quiz.title}`}
      mainClassName="max-w-none gap-6 px-0 py-0 md:px-0 lg:px-0"
      searchPlaceholder="Cari istilah, konsep, atau soal serupa..."
      session={session}
      sidebarFooterLabel="Student workspace"
    >
      <section className="relative overflow-hidden border-b border-primary-100/80 bg-[linear-gradient(180deg,rgba(247,250,248,0.98)_0%,rgba(255,255,255,0.96)_100%)] px-4 py-5 md:px-8 lg:px-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(253,224,71,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(1,76,56,0.12),transparent_30%)]" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              render={
                <Link href={`/quiz/${subject.slug}`}>
                  <ArrowLeft data-icon="inline-start" />
                  Kembali
                </Link>
              }
              size="sm"
              variant="ghost"
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-primary-100 bg-white/90 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-primary-800 uppercase shadow-sm">
                {attempt.focusLabel}
              </span>
              <span className="rounded-full bg-primary-700 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                {quiz.difficulty}
              </span>
            </div>

            <div>
              <h1 className="text-[28px] leading-tight font-semibold text-secondary-900 md:text-[34px]">
                {quiz.title}
              </h1>
              <p className="mt-1 text-sm text-secondary-500">
                {quiz.questionCount} soal · {quiz.duration} · estimasi selesai{" "}
                {attempt.estimatedFinish}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusChip
              icon={Clock3}
              label="Waktu tersisa"
              tone="emerald"
              value={attempt.remainingTime}
            />
            <StatusChip
              icon={Sparkles}
              label="Progress"
              tone="gold"
              value={`${attempt.answeredCount}/${quiz.questionCount}`}
            />
          </div>
        </div>
      </section>

      <section className="grid min-h-[calc(100svh-12rem)] gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-primary-100/80 bg-[#fbfcfb] xl:border-r xl:border-b-0">
          <div className="sticky top-0 flex flex-col gap-6 px-4 py-6 md:px-8 xl:px-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-secondary-400 uppercase">
                Navigasi Soal
              </p>
              <div className="mt-3 grid grid-cols-4 gap-3">
                {attempt.markers.map((marker) => (
                  <QuestionMarker key={marker.number} marker={marker} />
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-primary-100 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(1,76,56,0.24)]">
              <p className="text-sm font-semibold text-secondary-900">
                Ringkasan sesi
              </p>
              <div className="mt-4 grid gap-3">
                <MetricTile
                  label="Terjawab"
                  value={`${attempt.answeredCount} soal`}
                />
                <MetricTile
                  label="Ditandai"
                  value={`${attempt.flaggedCount} soal`}
                />
                <MetricTile label="Mode" value="Fokus mandiri" />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-secondary-500">
              <LegendDot color="bg-primary-700" label="Aktif" />
              <LegendDot color="bg-emerald-500" label="Benar" />
              <LegendDot color="bg-amber-300" label="Ditandai" />
              <LegendDot color="bg-secondary-300" label="Kosong" />
            </div>
          </div>
        </aside>

        <div className="bg-white px-4 py-6 md:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5">
            <div className="flex flex-col gap-4 rounded-[28px] border border-primary-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,248,0.98))] p-5 shadow-[0_22px_64px_-44px_rgba(1,76,56,0.34)] md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-800">
                    Soal {attempt.currentNumber}
                  </span>
                  <span className="rounded-full bg-secondary-50 px-3 py-1 text-sm font-medium text-secondary-600">
                    {subject.title}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <UtilityPill icon={AlertTriangle} label="Laporkan" />
                  <UtilityPill icon={Flag} label="Tandai" />
                  <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-white px-3 py-2 text-sm font-semibold text-secondary-700 shadow-sm">
                    <Heart className="size-4 fill-[#ef4444] text-[#ef4444]" />
                    {attempt.question.supportCount}
                  </div>
                </div>
              </div>

              <div className="h-px bg-primary-100" />

              <div className="space-y-6">
                <div className="space-y-4 text-[19px] leading-[1.85] text-secondary-800 md:text-[20px]">
                  {attempt.question.passage.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <div className="rounded-[24px] border border-primary-100 bg-primary-50/60 px-5 py-4">
                  <p className="text-lg font-semibold text-secondary-900 md:text-[22px]">
                    {attempt.question.prompt}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-secondary-500">
                    {attempt.question.hint}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {attempt.question.options.map((option) => (
                <AnswerOption
                  key={option.key}
                  option={option}
                  selected={option.key === attempt.question.selectedOptionKey}
                />
              ))}
            </div>

            <div className="sticky bottom-4 z-10 pt-2">
              <div className="flex flex-col gap-4 rounded-[28px] border border-primary-100 bg-white/96 p-4 shadow-[0_26px_70px_-42px_rgba(1,76,56,0.35)] backdrop-blur md:flex-row md:items-center md:justify-between md:p-5">
                <div>
                  <p className="text-sm font-semibold text-secondary-900">
                    Ritme kamu bagus. Lanjutkan sebelum timer habis.
                  </p>
                  <p className="mt-1 text-sm text-secondary-500">
                    Progress tersimpan otomatis setiap perpindahan soal.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button size="lg" variant="brandOutline">
                    <ChevronLeft data-icon="inline-start" />
                    Sebelumnya
                  </Button>
                  <Button
                    className="border-[#f6d86c] bg-[#fde68a] text-secondary-900 hover:bg-[#f9df77] focus-visible:border-[#f6d86c] focus-visible:ring-[#f6d86c]/35"
                    size="lg"
                  >
                    Selanjutnya
                    <ChevronRight data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </StudentWorkspaceShell>
  );
}

function StatusChip({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  tone: "emerald" | "gold";
  value: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border px-4 py-2 shadow-sm",
        tone === "emerald"
          ? "border-primary-100 bg-white text-secondary-900"
          : "border-[#f4dea2] bg-[#fff8df] text-secondary-900",
      )}
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full",
          tone === "emerald" ? "bg-primary-50 text-primary-700" : "bg-[#fde68a] text-secondary-900",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex flex-col">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-secondary-400 uppercase">
          {label}
        </span>
        <span className="text-sm font-semibold">{value}</span>
      </span>
    </div>
  );
}

function QuestionMarker({
  marker,
}: {
  marker: { number: number; state: QuizAttemptNavState };
}) {
  const icon =
    marker.state === "locked" ? <Lock className="size-4" /> : marker.number;

  return (
    <button
      className={cn(
        "flex h-14 items-center justify-center rounded-[18px] border text-sm font-semibold transition-all duration-200",
        marker.state === "active" &&
          "border-primary-300 bg-primary-50 text-primary-800 shadow-[0_12px_28px_-18px_rgba(1,76,56,0.35)]",
        marker.state === "answered" &&
          "border-emerald-200 bg-emerald-50 text-emerald-700",
        marker.state === "flagged" &&
          "border-[#f4dea2] bg-[#fff6d5] text-[#8a6a00]",
        marker.state === "locked" &&
          "border-primary-100 bg-secondary-50 text-secondary-400",
        marker.state === "empty" &&
          "border-primary-100 bg-white text-secondary-500 hover:border-primary-200 hover:bg-primary-50/30",
      )}
      type="button"
    >
      {icon}
    </button>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[18px] bg-secondary-50 px-4 py-3">
      <span className="text-sm text-secondary-500">{label}</span>
      <span className="text-sm font-semibold text-secondary-900">{value}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-3 rounded-full", color)} />
      {label}
    </span>
  );
}

function UtilityPill({
  icon: Icon,
  label,
}: {
  icon: typeof AlertTriangle;
  label: string;
}) {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-3 py-2 text-sm font-medium text-secondary-600 shadow-sm transition-colors hover:bg-primary-50"
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function AnswerOption({
  option,
  selected,
}: {
  option: { key: string; text: string };
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "group flex w-full items-start gap-4 rounded-[26px] border bg-white px-5 py-5 text-left shadow-[0_16px_40px_-34px_rgba(1,76,56,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50/30 focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none md:px-6",
        selected ? "border-primary-300 bg-primary-50/60" : "border-primary-100",
      )}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          selected
            ? "border-primary-700 bg-primary-700 text-white"
            : "border-secondary-200 bg-secondary-50 text-secondary-500 group-hover:border-primary-200 group-hover:bg-white",
        )}
      >
        {option.key}
      </span>
      <span className="text-[17px] leading-8 text-secondary-800 md:text-[18px]">
        {option.text}
      </span>
    </button>
  );
}

export { QuizOngoingPageModule };
