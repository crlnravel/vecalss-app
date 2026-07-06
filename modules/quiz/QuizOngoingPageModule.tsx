"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Lock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { QuizAttempt, QuizAttemptNavState, QuizItem } from "./data";

function QuizOngoingPageModule({
  attempt,
  quiz,
  subjectSlug,
  subjectTitle,
}: {
  attempt: QuizAttempt;
  quiz: QuizItem;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const router = useRouter();
  const [textScale, setTextScale] = useState<"compact" | "default" | "large">(
    "default",
  );
  const [currentQuestion, setCurrentQuestion] = useState(attempt.currentNumber);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>(
    attempt.question.selectedOptionKey
      ? { [attempt.currentNumber]: attempt.question.selectedOptionKey }
      : {},
  );
  const [flaggedQuestions, setFlaggedQuestions] = useState<number[]>(
    attempt.markers
      .filter((marker) => marker.state === "flagged")
      .map((marker) => marker.number),
  );
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);

  const readingTextClass =
    textScale === "large"
      ? "text-xl leading-[1.9]"
      : textScale === "compact"
        ? "text-base leading-[1.8]"
        : "text-lg leading-[1.85]";

  const uiTextClass =
    textScale === "large"
      ? "text-lg"
      : textScale === "compact"
        ? "text-sm"
        : "text-base";

  const unlockedQuestionCount = Math.max(
    currentQuestion,
    ...Object.keys(selectedAnswers).map(Number),
    1,
  );

  const currentSelectedOptionKey = selectedAnswers[currentQuestion] ?? null;
  const isCurrentQuestionFlagged = flaggedQuestions.includes(currentQuestion);
  const isCurrentQuestionReported = reportedQuestions.includes(currentQuestion);

  function updateTextScale(direction: "smaller" | "larger") {
    setTextScale((current) => {
      if (direction === "smaller") {
        return current === "large" ? "default" : "compact";
      }

      return current === "compact" ? "default" : "large";
    });
  }

  function goToQuestion(nextQuestion: number) {
    if (nextQuestion < 1 || nextQuestion > quiz.questionCount) {
      return;
    }

    if (nextQuestion > unlockedQuestionCount + 1) {
      return;
    }

    setCurrentQuestion(nextQuestion);
  }

  function toggleFlag() {
    setFlaggedQuestions((current) =>
      current.includes(currentQuestion)
        ? current.filter((question) => question !== currentQuestion)
        : [...current, currentQuestion].sort((a, b) => a - b),
    );
  }

  function toggleReport() {
    setReportedQuestions((current) =>
      current.includes(currentQuestion)
        ? current.filter((question) => question !== currentQuestion)
        : [...current, currentQuestion].sort((a, b) => a - b),
    );
  }

  function selectAnswer(optionKey: string) {
    setSelectedAnswers((current) => ({
      ...current,
      [currentQuestion]: optionKey,
    }));
  }

  return (
    <div className="min-h-svh bg-white text-secondary-900">
      <Dialog onOpenChange={setIsExitDialogOpen} open={isExitDialogOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[34px] bg-white p-0 shadow-[0_40px_120px_-48px_rgba(15,23,42,0.35)] sm:max-w-[900px]"
          showCloseButton={false}
        >
          <div className="flex items-start gap-5 px-7 py-8 md:px-11 md:py-10">
            <div className="flex size-24 shrink-0 items-center justify-center rounded-full bg-[#fff1f1] text-[#ef4444]">
              <AlertTriangle className="size-11" strokeWidth={2.2} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <DialogTitle className="text-3xl leading-tight font-semibold text-secondary-900 md:text-5xl">
                  Keluar dari Latihan?
                </DialogTitle>
                <button
                  aria-label="Tutup modal"
                  className="inline-flex size-11 items-center justify-center rounded-full text-secondary-300 transition-colors hover:bg-secondary-50 hover:text-secondary-500"
                  onClick={() => setIsExitDialogOpen(false)}
                  type="button"
                >
                  <span className="text-4xl leading-none">×</span>
                </button>
              </div>

              <DialogDescription className="mt-4 max-w-[26ch] text-2xl leading-[1.55] font-medium text-secondary-500 md:text-3xl">
                Yakin mau keluar? Progres kamu di sesi ini bakal hilang lho.
                Sayang banget kan!🥲
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-primary-100 bg-[#fbfbfb] px-7 py-7 md:px-11 md:py-8">
            <button
              className="inline-flex h-16 min-w-[170px] items-center justify-center rounded-full px-8 text-2xl font-semibold text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-700"
              onClick={() => setIsExitDialogOpen(false)}
              type="button"
            >
              Batal
            </button>
            <button
              className="inline-flex h-16 min-w-[230px] items-center justify-center rounded-full bg-[#ff0008] px-10 text-2xl font-semibold text-white transition-colors hover:bg-[#e10007]"
              onClick={() => router.push(`/quiz/${subjectSlug}`)}
              type="button"
            >
              Ya, Keluar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid min-h-svh gap-0 lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-primary-100 bg-[#fcfdfc] lg:border-r lg:border-b-0">
          <div className="border-b border-primary-100 px-5 py-5">
            <div className="flex items-start">
              <Button
                onClick={() => setIsExitDialogOpen(true)}
                size="icon-sm"
                variant="ghost"
              >
                <ArrowLeft data-icon="inline-start" />
              </Button>
            </div>
          </div>

          <div className="px-5 py-6">
            <p className="text-xs font-semibold tracking-[0.08em] text-secondary-400 uppercase">
              Navigasi Soal
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              {Array.from({ length: quiz.questionCount }, (_, index) => {
                const number = index + 1;
                const markerState: QuizAttemptNavState =
                  number === currentQuestion
                    ? "active"
                    : flaggedQuestions.includes(number)
                      ? "flagged"
                      : selectedAnswers[number]
                        ? "answered"
                        : number <= unlockedQuestionCount + 1
                          ? "empty"
                          : "locked";

                return (
                  <QuestionMarker
                    key={number}
                    marker={{ number, state: markerState }}
                    onClick={() => goToQuestion(number)}
                  />
                );
              })}
            </div>
          </div>
        </aside>

        <main className="flex min-h-svh flex-col bg-white">
          <div className="flex items-center justify-between border-b border-primary-100 px-4 py-4 md:px-8 lg:px-10">
            <div className="min-w-0">
              <h2 className="text-3xl leading-none font-semibold text-secondary-900 md:text-4xl">
                {quiz.title}
              </h2>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white px-4 py-2 text-sm font-medium text-secondary-700 shadow-sm">
              <Clock3 className="size-4 text-secondary-500" />
              <span>{attempt.remainingTime}</span>
            </div>
          </div>

          <div className="flex-1 px-4 py-6 md:px-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1550px] flex-col gap-5">
              <div className={cn("flex flex-wrap items-center gap-3 font-medium", uiTextClass)}>
                <span className="font-semibold tracking-[0.08em] text-[#7fd0f6] uppercase">
                  Soal {currentQuestion}
                </span>
                <span className="text-secondary-300">•</span>
                <span className="font-medium text-secondary-400">{subjectTitle}</span>
                <span className="text-secondary-300">|</span>
                <UtilityPill
                  active={isCurrentQuestionReported}
                  icon={AlertTriangle}
                  label="Laporkan"
                  onClick={toggleReport}
                />
                <UtilityPill
                  active={isCurrentQuestionFlagged}
                  icon={Flag}
                  label="Tandai"
                  onClick={toggleFlag}
                />
                <MagnifierButton
                  ariaLabel="Perkecil ukuran font"
                  icon={ZoomOut}
                  onClick={() => updateTextScale("smaller")}
                />
                <MagnifierButton
                  ariaLabel="Perbesar ukuran font"
                  icon={ZoomIn}
                  onClick={() => updateTextScale("larger")}
                />
              </div>

              <div className="space-y-5">
                <div
                  className={cn(
                    "space-y-5 border-t border-primary-100 pt-5 pb-6 font-medium text-secondary-800",
                    readingTextClass,
                  )}
                >
                  {attempt.question.passage.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                <div>
                  <p
                    className={cn(
                      "font-medium text-secondary-900",
                      readingTextClass,
                    )}
                  >
                    {attempt.question.prompt}
                  </p>
                  <p className={cn("mt-3 font-medium text-secondary-500", uiTextClass)}>
                    {attempt.question.hint}
                  </p>
                </div>

                <div className="grid gap-4">
                  {attempt.question.options.map((option) => (
                    <AnswerOption
                      onClick={() => selectAnswer(option.key)}
                      key={option.key}
                      option={option}
                      selected={option.key === currentSelectedOptionKey}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 border-t border-primary-100 bg-white/96 px-4 py-4 backdrop-blur md:px-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
              <Button
                disabled={currentQuestion === 1}
                onClick={() => goToQuestion(currentQuestion - 1)}
                size="lg"
                variant="brandOutline"
              >
                <ChevronLeft data-icon="inline-start" />
                Soal Sebelumnya
              </Button>
              <Button
                className="border-[#f6d86c] bg-[#fde68a] text-secondary-900 hover:bg-[#f9df77] focus-visible:border-[#f6d86c] focus-visible:ring-[#f6d86c]/35"
                disabled={currentQuestion === quiz.questionCount}
                onClick={() => goToQuestion(currentQuestion + 1)}
                size="lg"
              >
                Soal Selanjutnya
                <ChevronRight data-icon="inline-end" />
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
  onClick,
}: {
  marker: { number: number; state: QuizAttemptNavState };
  onClick: () => void;
}) {
  const icon =
    marker.state === "locked" ? <Lock className="size-4" /> : marker.number;

  return (
    <button
      className={cn(
        "flex h-12 items-center justify-center rounded-[16px] border text-sm font-semibold transition-all duration-200",
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
      disabled={marker.state === "locked"}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
}

function MagnifierButton({
  ariaLabel,
  icon: Icon,
  onClick,
}: {
  ariaLabel: string;
  icon: typeof ZoomIn;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary-50 text-secondary-600 transition-colors hover:bg-secondary-100",
      )}
      aria-label={ariaLabel}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
    </button>
  );
}

function UtilityPill({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: typeof AlertTriangle;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-[#f3fbff] text-[#3f95bf]"
          : "bg-secondary-50 text-secondary-600 hover:bg-secondary-100",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function AnswerOption({
  onClick,
  option,
  selected,
}: {
  onClick: () => void;
  option: { key: string; text: string };
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "group flex w-full items-start gap-4 rounded-[26px] border bg-white px-5 py-5 text-left shadow-none transition-all duration-200 hover:border-[#c9ebfa] hover:bg-[#f8fcff] focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none md:px-6",
        selected ? "border-[#8fd9fb] bg-[#f3fbff]" : "border-primary-100",
      )}
      onClick={onClick}
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
      <span className="text-lg leading-[1.85] font-medium text-secondary-800">
        {option.text}
      </span>
    </button>
  );
}

export { QuizOngoingPageModule };
