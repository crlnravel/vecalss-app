"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer } from "@phosphor-icons/react";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Flag,
  CircleX,
  House,
  RefreshCw,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { StudentBadge } from "@/components/ui/student-badge";
import {
  AssessmentUtilityPill,
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
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
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);
  const readingTextClass = "text-lg leading-[1.85]";
  const explanationTextClass = "text-base leading-7";

  function toggleReport() {
    setReportedQuestions((current) => current.includes(currentQuestion)
      ? current.filter((number) => number !== currentQuestion)
      : [...current, currentQuestion]);
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
          <ArrowLeft />
        </Button>
      </main>
    );
  }

  const question = result.questions[currentQuestion - 1];
  if (!question) return null;
  const selectedOption = question.options.find((option) => option.id === question.selectedOptionId);
  const correctOption = question.options.find((option) => option.correct);
  const isCorrect = selectedOption?.correct ?? false;
  const markers = result.questions.map((reviewQuestion, index) => {
    const answer = reviewQuestion.options.find((option) => option.id === reviewQuestion.selectedOptionId);
    return {
      id: reviewQuestion.id,
      number: index + 1,
      state: index + 1 === currentQuestion
        ? "current"
        : !answer
          ? "unanswered"
          : answer.correct
            ? "correct"
            : "incorrect",
    } as const;
  });

  return (
    <AssessmentResultWorkspace
      headerActions={
        <>
          <Button
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={<Link href={`/quiz/${subjectSlug}`} />}
            variant="brandOutline"
          >
            <RefreshCw />
            Ulangi
          </Button>
          <Button
            aria-label="Kembali ke menu quiz"
            className="hidden sm:inline-flex"
            nativeButton={false}
            render={<Link href="/quiz" />}
            title="Kembali ke menu quiz"
            variant="brand"
          >
            <House />
            Menu
          </Button>
        </>
      }
      navigation={
        <AssessmentResultNavigation
          items={markers}
          label="Ringkasan soal"
          onSelect={setCurrentQuestion}
        />
      }
      score={result.score ?? 0}
      scoreLabel="Skor Akhir"
      summary={
        <div className="grid grid-cols-2 gap-2 text-left lg:grid-cols-1">
          <ResultStat label="Benar" value={`${result.correctCount ?? 0}`} />
          <ResultStat label="Dijawab" value={`${result.answeredCount}/${result.totalQuestions}`} />
        </div>
      }
      title={result.title}
    >
      <article className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(1,76,56,0.55)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 pb-5">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-secondary-900">Soal #{currentQuestion}</p>
            <span className="sr-only">{subjectTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <AssessmentUtilityPill active={reportedQuestions.includes(currentQuestion)} icon={Flag} label="Laporkan soal" onClick={toggleReport} />
            <StudentBadge size="md" tone={isCorrect ? "success" : "danger"}>
              {isCorrect ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />}
              {isCorrect ? "Benar" : selectedOption ? "Salah" : "Tidak dijawab"}
            </StudentBadge>
          </div>
        </div>

        <div className={cn("mt-6 font-medium text-secondary-900", readingTextClass)}>
          <p>{question.prompt}</p>
        </div>

        <div className="mt-7 grid gap-3">
          {question.options.map((option) => (
            <ReviewAnswerOption
              key={option.id}
              option={option}
              selected={option.id === question.selectedOptionId}
              textClass={readingTextClass}
            />
          ))}
        </div>

        <section aria-label="Pembahasan" className="mt-7 rounded-3xl border border-student-status-success-border bg-student-status-success-bg/70 p-5 sm:p-6">
          <h2 className="font-semibold text-student-status-success-fg">Pembahasan</h2>
          <div className={cn("mt-2 text-secondary-700", explanationTextClass)}>
            {question.explanation || "Pembahasan untuk soal ini belum tersedia."}
          </div>
          <div className="mt-4 grid gap-3 border-t border-student-status-success-border pt-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold text-secondary-500">Jawabanmu</p>
              <p className="mt-1 font-semibold text-secondary-900">{selectedOption ? `${selectedOption.key}. ${selectedOption.text}` : "Tidak dijawab"}</p>
            </div>
            <div>
              <p className="font-semibold text-secondary-500">Jawaban benar</p>
              <p className="mt-1 font-semibold text-secondary-900">{correctOption ? `${correctOption.key}. ${correctOption.text}` : "—"}</p>
            </div>
          </div>
        </section>

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-primary-100 pt-5 print:hidden">
          <Button disabled={currentQuestion === 1} onClick={() => setCurrentQuestion((number) => number - 1)} variant="brandOutline">
            <ArrowLeft />
            <span className="hidden sm:inline">Sebelumnya</span>
          </Button>
          {currentQuestion < result.totalQuestions ? (
            <Button onClick={() => setCurrentQuestion((number) => number + 1)} variant="brand">
              <span className="hidden sm:inline">Selanjutnya</span>
              <ArrowRight />
            </Button>
          ) : (
            <Button onClick={() => window.print()} variant="brandOutline">
              <Printer />
              <span className="hidden sm:inline">Cetak</span>
            </Button>
          )}
        </div>
      </article>
    </AssessmentResultWorkspace>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-secondary-50 px-3 py-3">
      <p className="text-xs font-medium text-secondary-500">{label}</p>
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
        "flex w-full items-start gap-4 rounded-3xl border bg-white px-4 py-4 text-left sm:px-5",
        option.correct && "border-student-status-success-border bg-student-status-success-bg",
        isIncorrectSelection && "border-student-status-danger-border bg-student-status-danger-bg",
        !option.correct && !isIncorrectSelection && "border-primary-100",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          option.correct && "border-student-status-success-solid-bg bg-student-status-success-solid-bg text-student-status-success-solid-fg",
          isIncorrectSelection && "border-student-status-danger-solid-bg bg-student-status-danger-solid-bg text-student-status-danger-solid-fg",
          !option.correct && !isIncorrectSelection && "border-secondary-200 bg-secondary-50 text-secondary-500",
        )}
      >
        {option.correct ? <Check className="size-5" /> : option.key}
      </span>
      <p className={cn("min-w-0 flex-1 font-medium text-secondary-800", textClass)}>{option.text}</p>
    </div>
  );
}

export { QuizResultPageModule };
