"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  ZoomIn,
  ZoomOut,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QuizResult = {
  answeredCount: number;
  correctCount: number | null;
  isSubmitted: boolean;
  questions: Array<{
    explanation: string | null;
    id: string;
    options: Array<{ correct: boolean; id: string; key: string; text: string }>;
    prompt: string;
    selectedOptionId: string | null;
  }>;
  score: number | null;
  title: string;
  totalQuestions: number;
};

function QuizResultPageModule({
  result,
  subjectSlug,
  subjectTitle,
}: {
  result: QuizResult;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [textScale, setTextScale] = useState<"compact" | "default" | "large">("default");

  const readingTextClass =
    textScale === "large"
      ? "text-xl leading-[1.9]"
      : textScale === "compact"
        ? "text-base leading-[1.8]"
        : "text-lg leading-[1.85]";

  const explanationTextClass =
    textScale === "large"
      ? "text-lg leading-8"
      : textScale === "compact"
        ? "text-sm leading-6"
        : "text-base leading-7";

  function updateTextScale(direction: "smaller" | "larger") {
    setTextScale((current) => {
      if (direction === "smaller") {
        return current === "large" ? "default" : "compact";
      }

      return current === "compact" ? "default" : "large";
    });
  }

  if (!result.isSubmitted) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-semibold text-secondary-900">Quiz belum dikirim</h1>
        <p className="mt-3 text-secondary-600">Kembali ke quiz untuk menyelesaikan dan mengirim jawabanmu.</p>
        <Button
          aria-label="Kembali ke daftar quiz"
          className="mt-6"
          nativeButton={false}
          render={<Link href={`/quiz/${subjectSlug}`} />}
          size="icon"
          title="Kembali ke daftar quiz"
          variant="brand"
        >
          <ChevronLeft />
        </Button>
      </main>
    );
  }

  const question = result.questions[currentQuestion - 1];
  if (!question) return null;
  const selectedOption = question.options.find((option) => option.id === question.selectedOptionId);
  const correctOption = question.options.find((option) => option.correct);
  const isCorrect = selectedOption?.correct ?? false;

  return (
    <div className="min-h-svh bg-white text-secondary-900">
      <div className="grid min-h-svh gap-0 lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-primary-100 bg-[#fcfdfc] lg:border-r lg:border-b-0">
          <div className="border-b border-primary-100 px-5 py-5">
            <Button
              aria-label="Kembali ke daftar quiz"
              nativeButton={false}
              render={<Link href={`/quiz/${subjectSlug}`} />}
              size="icon-sm"
              title="Kembali ke daftar quiz"
              variant="ghost"
            >
              <ChevronLeft />
            </Button>
          </div>

          <div className="px-5 py-6">
            <p className="text-xs font-semibold tracking-[0.08em] text-primary-700 uppercase">
              Review Jawaban
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              {result.questions.map((reviewQuestion, index) => {
                const answer = reviewQuestion.options.find(
                  (option) => option.id === reviewQuestion.selectedOptionId,
                );
                const state = !answer
                  ? "unanswered"
                  : answer.correct
                    ? "correct"
                    : "incorrect";
                const number = index + 1;

                return (
                  <QuestionMarker
                    current={number === currentQuestion}
                    key={reviewQuestion.id}
                    number={number}
                    onClick={() => setCurrentQuestion(number)}
                    state={state}
                  />
                );
              })}
            </div>

            <div className="mt-7 grid grid-cols-2 gap-2 border-t border-primary-100 pt-5">
              <ResultStat label="Skor" value={`${result.score ?? 0}`} />
              <ResultStat label="Benar" value={`${result.correctCount ?? 0}/${result.totalQuestions}`} />
            </div>
          </div>
        </aside>

        <main className="flex min-h-svh flex-col bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary-100 px-4 py-4 md:px-8 lg:px-10">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.08em] text-primary-700 uppercase">Hasil Quiz</p>
              <h1 className="mt-1 text-3xl leading-none font-semibold text-secondary-900 md:text-4xl">
                {result.title}
              </h1>
            </div>
          </div>

          <div className="flex-1 px-4 py-6 md:px-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1550px] flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3 text-base font-medium">
                <span className="font-semibold tracking-[0.08em] text-primary-700 uppercase">Soal {currentQuestion}</span>
                <span className="text-secondary-300">•</span>
                <span className="text-secondary-400">{subjectTitle}</span>
                <span className="text-secondary-300">|</span>
                <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold", isCorrect ? "bg-primary-50 text-primary-800" : "bg-red-50 text-red-700")}>
                  {isCorrect ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />}
                  {isCorrect ? "Benar" : selectedOption ? "Belum tepat" : "Tidak dijawab"}
                </span>
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
                <div className={cn("border-t border-primary-100 pt-5 pb-1 font-medium text-secondary-900", readingTextClass)}>
                  <p>{question.prompt}</p>
                </div>

                <div className="grid gap-4">
                  {question.options.map((option) => (
                    <ReviewAnswerOption
                      key={option.id}
                      option={option}
                      selected={option.id === question.selectedOptionId}
                      textClass={readingTextClass}
                    />
                  ))}
                </div>

                <section aria-label="Pembahasan" className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 md:p-6">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-amber-950">Pembahasan</h2>
                    <p className={cn("mt-1.5 text-secondary-700", explanationTextClass)}>
                      {question.explanation || "Pembahasan untuk soal ini belum tersedia."}
                    </p>
                    <p className="mt-3 border-t border-amber-200 pt-3 text-sm font-medium text-secondary-700">
                      {selectedOption
                        ? `Pilihan: ${selectedOption.key}. Kunci: ${correctOption?.key ?? "—"}.`
                        : `Kunci: ${correctOption?.key ?? "—"}.`}
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 border-t border-primary-100 bg-white/96 px-4 py-4 backdrop-blur md:px-8 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
              <Button
                disabled={currentQuestion === 1}
                onClick={() => setCurrentQuestion((number) => number - 1)}
                size="lg"
                variant="brandOutline"
              >
                <ChevronLeft data-icon="inline-start" />
                Soal Sebelumnya
              </Button>
              {currentQuestion < result.totalQuestions ? (
                <Button
                  className="border-primary-700 bg-primary-700 text-white hover:border-primary-800 hover:bg-primary-800 focus-visible:border-primary-700 focus-visible:ring-primary-700/35"
                  onClick={() => setCurrentQuestion((number) => number + 1)}
                  size="lg"
                >
                  Soal Selanjutnya
                  <ChevronRight data-icon="inline-end" />
                </Button>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function QuestionMarker({
  current,
  number,
  onClick,
  state,
}: {
  current: boolean;
  number: number;
  onClick: () => void;
  state: "correct" | "incorrect" | "unanswered";
}) {
  return (
    <button
      aria-current={current ? "step" : undefined}
      className={cn(
        "flex h-12 items-center justify-center rounded-2xl border text-sm font-semibold transition-all duration-200 focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none",
        state === "correct" && "border-primary-300 bg-primary-50 text-primary-800",
        state === "incorrect" && "border-red-200 bg-red-50 text-red-700",
        state === "unanswered" && "border-secondary-200 bg-secondary-50 text-secondary-500",
        current && "ring-2 ring-primary-700 ring-offset-2",
      )}
      onClick={onClick}
      type="button"
    >
      {number}
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
      aria-label={ariaLabel}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary-50 text-secondary-600 transition-colors hover:bg-secondary-100"
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
    </button>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white px-3 py-3">
      <p className="text-[11px] font-medium text-secondary-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

function ReviewAnswerOption({
  option,
  selected,
  textClass,
}: {
  option: { correct: boolean; id: string; key: string; text: string };
  selected: boolean;
  textClass: string;
}) {
  const isIncorrectSelection = selected && !option.correct;

  return (
    <div
      className={cn(
        "flex w-full items-start gap-4 rounded-4xl border bg-white px-5 py-5 text-left md:px-6",
        option.correct && "border-primary-300 bg-primary-50",
        isIncorrectSelection && "border-red-200 bg-red-50",
        !option.correct && !isIncorrectSelection && "border-primary-100",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          option.correct && "border-primary-700 bg-primary-700 text-white",
          isIncorrectSelection && "border-red-500 bg-red-500 text-white",
          !option.correct && !isIncorrectSelection && "border-secondary-200 bg-secondary-50 text-secondary-500",
        )}
      >
        {option.correct ? <Check className="size-5" /> : option.key}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-secondary-800", textClass)}>{option.text}</p>
      </div>
    </div>
  );
}

export { QuizResultPageModule };
