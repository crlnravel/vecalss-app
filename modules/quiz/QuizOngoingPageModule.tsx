import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  Clock3,
  Flag,
  Lock,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

import type {
  QuizAttempt,
  QuizAttemptNavState,
  QuizItem,
  QuizSubject,
} from "./data";

function QuizOngoingPageModule({
  attempt,
  quiz,
  subject,
}: {
  attempt: QuizAttempt;
  quiz: QuizItem;
  session: SessionContext;
  subject: QuizSubject;
}) {
  return (
    <div className="min-h-svh bg-white text-secondary-900">
      <div className="grid min-h-svh gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-primary-100 bg-[#fcfdfc] lg:border-r lg:border-b-0">
          <div className="border-b border-primary-100 px-5 py-5">
            <div className="flex items-start gap-3">
              <Button
                render={
                  <Link href={`/quiz/${subject.slug}`}>
                    <ArrowLeft data-icon="inline-start" />
                  </Link>
                }
                size="icon-sm"
                variant="ghost"
              />

              <div className="min-w-0">
                <p className="text-sm font-medium text-secondary-400">
                  {attempt.focusLabel}
                </p>
                <h1 className="text-[30px] leading-[0.95] font-semibold text-secondary-900">
                  {subject.title}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-between gap-6 px-5 py-6">
            <div>
              <p className="text-[13px] font-semibold tracking-[0.08em] text-secondary-400 uppercase">
                Navigasi Soal
              </p>
              <div className="mt-5 grid grid-cols-4 gap-3">
                {attempt.markers.map((marker) => (
                  <QuestionMarker key={marker.number} marker={marker} />
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid gap-3 rounded-[28px] border border-primary-100 bg-white p-4 shadow-[0_18px_42px_-34px_rgba(1,76,56,0.22)]">
                <MetricTile label="Terjawab" value={`${attempt.answeredCount} soal`} />
                <MetricTile label="Ditandai" value={`${attempt.flaggedCount} soal`} />
                <MetricTile label="Durasi" value={quiz.duration} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-secondary-500">
                <LegendDot color="bg-primary-700" label="Aktif" />
                <LegendDot color="bg-emerald-500" label="Benar" />
                <LegendDot color="bg-[#fde68a]" label="Ditandai" />
                <LegendDot color="bg-secondary-300" label="Kosong" />
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-h-svh flex-col bg-white">
          <div className="flex items-center justify-between border-b border-primary-100 px-4 py-4 md:px-8 lg:px-10">
            <div className="min-w-0">
              <p className="text-sm font-medium text-secondary-400">
                {quiz.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[30px] leading-none font-semibold text-[#7fd0f6]">
                  SOAL {attempt.currentNumber}
                </span>
                <span className="text-sm text-secondary-400">•</span>
                <span className="text-sm text-secondary-500">{subject.title}</span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-4 py-2 text-sm font-semibold text-secondary-700 shadow-sm">
              <Clock3 className="size-4 text-secondary-500" />
              <span>{attempt.remainingTime}</span>
            </div>
          </div>

          <div className="flex-1 px-4 py-6 md:px-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1550px] flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3 text-sm md:text-base">
                <span className="font-semibold tracking-[0.08em] text-[#7fd0f6] uppercase">
                  Soal {attempt.currentNumber}
                </span>
                <span className="text-secondary-300">•</span>
                <span className="font-medium text-secondary-400">{subject.title}</span>
                <span className="text-secondary-300">|</span>
                <UtilityPill icon={AlertTriangle} label="Laporkan" />
                <UtilityPill icon={Flag} label="Tandai" />
              </div>

              <div className="space-y-5">
                <div className="space-y-5 border-t border-primary-100 pt-5 pb-6 text-[19px] leading-[1.85] text-secondary-800 md:text-[20px]">
                  {attempt.question.passage.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <div>
                  <p className="text-[20px] leading-[1.75] font-medium text-secondary-900 md:text-[22px]">
                    {attempt.question.prompt}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-secondary-500">
                    {attempt.question.hint}
                  </p>
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
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 border-t border-primary-100 bg-white/96 px-4 py-4 backdrop-blur md:px-8 lg:px-10 xl:hidden">
            <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
              <Button size="lg" variant="brandOutline">
                <ChevronLeft data-icon="inline-start" />
                Sebelumnya
              </Button>
              <Button
                className="border-[#f6d86c] bg-[#fde68a] text-secondary-900 hover:bg-[#f9df77] focus-visible:border-[#f6d86c] focus-visible:ring-[#f6d86c]/35"
                size="lg"
              >
                Periksa
                <Search data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </main>
      </div>
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
          "border-[#9fdef9] bg-[#ecf8ff] text-[#3f95bf] shadow-[0_12px_28px_-18px_rgba(127,208,246,0.55)]",
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
      className="inline-flex items-center gap-2 rounded-full bg-secondary-50 px-4 py-2 text-sm font-medium text-secondary-600 transition-colors hover:bg-secondary-100"
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
        "group flex w-full items-start gap-4 rounded-[26px] border bg-white px-5 py-5 text-left shadow-none transition-all duration-200 hover:border-[#c9ebfa] hover:bg-[#f8fcff] focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none md:px-6",
        selected ? "border-[#8fd9fb] bg-[#f3fbff]" : "border-primary-100",
      )}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          selected
            ? "border-[#78cff5] bg-[#8dd8fb] text-white"
            : "border-secondary-200 bg-secondary-50 text-secondary-500 group-hover:border-[#c9ebfa] group-hover:bg-white",
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
