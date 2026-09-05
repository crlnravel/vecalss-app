"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Flag,
  CircleX,
  House,
  RefreshCw,
} from "@/lib/icons";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { StudentBadge } from "@/components/ui/student-badge";
import {
  AssessmentUtilityPill,
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
import { AssessmentReviewAnswerOption } from "@/modules/assessment/AssessmentReviewAnswerOption";
import { AssessmentResultStat } from "@/modules/assessment/AssessmentResultStat";
import { cn } from "@/lib/utils";

import { startQuizAction } from "./actions";

const REPORT_DISCLOSURE = "Tanda ini hanya tersimpan sementara di halaman ini, tidak dikirim ke staf, dan terhapus saat halaman ditutup atau dimuat ulang.";

type QuizResult = {
  aggregateScore: number | null;
  answeredCount: number;
  canRestart: boolean;
  correctCount: number | null;
  correctnessAvailable: boolean;
  isSubmitted: boolean;
  questions: Array<{
    explanation: string | null;
    id: string;
    options: Array<{ correct: boolean; id: string; key: string; text: string }>;
    prompt: string;
    selectedOptionId: string | null;
  }>;
  policy: {
    attemptsAllowed: number | null;
    correctAnswerVisibility: "show" | "hide";
    formBehavior: "same" | "fresh_randomized";
    retryDelaySeconds: number | null;
    reviewTiming: "immediate" | "after_close" | "never";
    scorePolicy: "highest" | "latest" | "first" | "average";
  };
  reviewAvailable: boolean;
  attemptScore: number | null;
  score: number | null;
  title: string;
  totalQuestions: number;
};

function QuizResultPageModule({
  result,
  quizSlug,
  subjectSlug,
  subjectTitle,
}: {
  result: QuizResult;
  quizSlug: string;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const router = useRouter();
  const restartRequestIdRef = useRef<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);
  const isAttemptLimitReached = restartMessage?.startsWith("Batas percobaan quiz ini sudah tercapai") ?? false;
  const resultStatLabelClassName = "font-bold tracking-[0.14em] uppercase";
  const readingTextClass = "text-lg leading-[1.85]";
  const explanationTextClass = "text-base leading-7";

  function toggleReport() {
    setReportedQuestions((current) => current.includes(currentQuestion)
      ? current.filter((number) => number !== currentQuestion)
      : [...current, currentQuestion]);
  }

  async function restartQuiz() {
    if (isRestarting) return;
    setIsRestarting(true);
    setRestartMessage(null);

    try {
      const requestId = restartRequestIdRef.current ?? crypto.randomUUID();
      restartRequestIdRef.current = requestId;
      const response = await startQuizAction(subjectTitle, quizSlug, requestId);
      if (!response.ok) {
        setRestartMessage(response.message);
        return;
      }

      router.replace(`/quiz/${subjectSlug}/${quizSlug}?attemptId=${encodeURIComponent(response.result.attemptId)}`);
    } catch (error) {
      setRestartMessage(error instanceof Error ? error.message : "Quiz belum dapat dimulai kembali.");
    } finally {
      setIsRestarting(false);
    }
  }

  if (!result.isSubmitted) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-semibold text-secondary-900">Quiz belum dikirim</h1>
        <p className="mt-3 text-secondary-600">Kembali ke quiz untuk menyelesaikan dan mengirim jawabanmu.</p>
        <BackButton
          className="mt-6"
          href={`/quiz/${subjectSlug}`}
          label="Kembali ke daftar quiz"
          variant="brand"
        >
          <ArrowLeft />
        </BackButton>
      </main>
    );
  }

  const question = result.questions[currentQuestion - 1];
  if (!question) return null;
  const selectedOption = question.options.find((option) => option.id === question.selectedOptionId);
  const correctOption = question.options.find((option) => option.correct);
  const isCorrect = result.correctnessAvailable && (selectedOption?.correct ?? false);
  const markers = result.questions.map((reviewQuestion, index) => {
    const answer = reviewQuestion.options.find((option) => option.id === reviewQuestion.selectedOptionId);
    const outcome = !answer
      ? "unanswered"
      : !result.correctnessAvailable
        ? undefined
        : answer.correct
          ? "correct"
          : "incorrect";
    return {
      id: reviewQuestion.id,
      number: index + 1,
      outcome,
      state: index + 1 === currentQuestion
        ? "current"
        : !answer
          ? "unanswered"
          : !result.correctnessAvailable
            ? "neutral"
          : answer.correct
            ? "correct"
            : "incorrect",
    } as const;
  });

  return (
    <AssessmentResultWorkspace
      headerActions={
        <>
          {result.canRestart && !isAttemptLimitReached ? (
            <Button
              aria-label="Ulangi quiz"
              aria-busy={isRestarting}
              className="inline-flex"
              disabled={isRestarting}
              onClick={() => { void restartQuiz(); }}
              variant="brandOutline"
            >
              <RefreshCw />
              <span className="hidden sm:inline">{isRestarting ? "Memulai…" : "Ulangi"}</span>
            </Button>
          ) : null}
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
          compact
          items={markers}
          label="Ringkasan soal"
          onSelect={setCurrentQuestion}
        />
      }
      floatingPanels
      score={result.aggregateScore ?? result.score ?? 0}
      scoreLabel="Skor Akhir"
      smoothHeaderDivider
      summary={
        <div className="grid grid-cols-2 gap-2 text-left lg:grid-cols-1">
          <AssessmentResultStat
            label="Benar"
            labelClassName={resultStatLabelClassName}
            value={`${result.correctCount ?? 0}`}
          />
          <AssessmentResultStat
            label="Dijawab"
            labelClassName={resultStatLabelClassName}
            value={
              <>
                {result.answeredCount}
                <span className="text-xs font-semibold text-secondary-500">/{result.totalQuestions}</span>
              </>
            }
          />
        </div>
      }
      title={result.title}
    >
      <article className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_rgba(1,76,56,0.55)] sm:p-8">
        {restartMessage ? <p className="mb-5 text-sm font-medium text-student-status-danger-fg" role="alert">{restartMessage}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 pb-5">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-secondary-900">Soal #{currentQuestion}</p>
            <span className="sr-only">{subjectTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <AssessmentUtilityPill active={reportedQuestions.includes(currentQuestion)} icon={Flag} label="Tandai untuk ditinjau" onClick={toggleReport} />
            <StudentBadge size="md" tone={!result.correctnessAvailable ? "neutral" : isCorrect ? "success" : "danger"}>
              {result.correctnessAvailable ? (isCorrect ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />) : null}
              {result.correctnessAvailable ? (isCorrect ? "Benar" : selectedOption ? "Salah" : "Tidak dijawab") : selectedOption ? "Jawaban tersimpan" : "Tidak dijawab"}
            </StudentBadge>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-secondary-500">{REPORT_DISCLOSURE}</p>

        <div className={cn("mt-6 font-medium text-secondary-900", readingTextClass)}>
          <p>{question.prompt}</p>
        </div>

        <div className="mt-7 grid gap-3">
          {question.options.map((option) => (
            <AssessmentReviewAnswerOption
              correctnessAvailable={result.correctnessAvailable}
              correct={option.correct}
              key={option.id}
              label={option.key}
              selected={option.id === question.selectedOptionId}
              text={option.text}
              textClassName={readingTextClass}
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
              <p className="mt-1 font-semibold text-secondary-900">{result.reviewAvailable && result.policy.correctAnswerVisibility === "show" && correctOption ? `${correctOption.key}. ${correctOption.text}` : "Belum dibuka"}</p>
            </div>
          </div>
        </section>

        <div className="mt-7 flex items-center justify-between gap-3 pt-5 print:hidden">
          <Button disabled={currentQuestion === 1} onClick={() => setCurrentQuestion((number) => number - 1)} variant="brandOutline">
            <ArrowLeft />
            <span className="hidden sm:inline">Sebelumnya</span>
          </Button>
          {currentQuestion < result.totalQuestions ? (
            <Button onClick={() => setCurrentQuestion((number) => number + 1)} variant="brand">
              <span className="hidden sm:inline">Selanjutnya</span>
              <ArrowRight />
            </Button>
          ) : null}
        </div>
      </article>
    </AssessmentResultWorkspace>
  );
}

export { QuizResultPageModule };
