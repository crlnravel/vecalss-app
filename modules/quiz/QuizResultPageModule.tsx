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
import { Badge } from "@/components/ui/badge";
import { showToast } from "@/components/ui/toast";
import {
  AssessmentUtilityPill,
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
import { AssessmentReviewAnswerOption } from "@/modules/assessment/AssessmentReviewAnswerOption";
import { AssessmentResultStat } from "@/modules/assessment/AssessmentResultStat";
import { compareSelectedOptionSets } from "@/lib/question-bank/answer-contract";
import { cn } from "@/lib/utils";

import { startQuizAction } from "./actions";

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
    selectedOptionIds?: string[];
    questionType?: "single_choice" | "multiple_choice";
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

type QuizResultQuestion = QuizResult["questions"][number];

function selectedOptionIdsForQuestion(question: QuizResultQuestion) {
  return question.selectedOptionIds?.length
    ? question.selectedOptionIds
    : question.selectedOptionId
      ? [question.selectedOptionId]
      : [];
}

function isQuestionCorrect(question: QuizResultQuestion) {
  const selectedOptionIds = selectedOptionIdsForQuestion(question);
  const correctOptionIds = question.options
    .filter((option) => option.correct)
    .map((option) => option.id);
  return (
    selectedOptionIds.length > 0 &&
    compareSelectedOptionSets(selectedOptionIds, correctOptionIds).ok &&
    compareSelectedOptionSets(selectedOptionIds, correctOptionIds).equal
  );
}

function optionSummary(options: QuizResultQuestion["options"]) {
  return options.length
    ? options.map((option) => `${option.key}. ${option.text}`).join(", ")
    : "Tidak dijawab";
}

function correctAnswerSummary(
  result: QuizResult,
  correctOptions: QuizResultQuestion["options"],
) {
  if (!result.reviewAvailable) {
    if (result.policy.reviewTiming === "after_close") {
      return "Dibuka setelah kuis ditutup";
    }

    return result.policy.reviewTiming === "never"
      ? "Tidak tersedia"
      : "Hasil sedang disiapkan";
  }

  return result.policy.correctAnswerVisibility === "show"
    ? optionSummary(correctOptions)
    : "Tidak ditampilkan";
}

function buildQuizResultMarkers(result: QuizResult, currentQuestion: number) {
  return result.questions.map((reviewQuestion, index) => {
    const selectedOptionIds = selectedOptionIdsForQuestion(reviewQuestion);
    const hasAnswer = selectedOptionIds.length > 0;
    const correct =
      result.correctnessAvailable && isQuestionCorrect(reviewQuestion);
    const outcome = !hasAnswer
      ? "unanswered"
      : !result.correctnessAvailable
        ? undefined
        : correct
          ? "correct"
          : "incorrect";
    const state =
      index + 1 === currentQuestion
        ? "current"
        : !hasAnswer
          ? "unanswered"
          : !result.correctnessAvailable
            ? "neutral"
            : correct
              ? "correct"
              : "incorrect";
    return {
      id: reviewQuestion.id,
      number: index + 1,
      outcome,
      state,
    } as const;
  });
}

function QuizNotSubmitted({ subjectSlug }: { subjectSlug: string }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-semibold text-secondary-900">
        Kuis belum dikumpulkan
      </h1>
      <p className="mt-3 text-secondary-600">
        Kembali ke kuis untuk menyelesaikan dan mengumpulkan jawabanmu.
      </p>
      <BackButton
        className="mt-6"
        href={`/quiz/${subjectSlug}`}
        label="Kembali ke daftar kuis"
        variant="default"
      >
        <ArrowLeft />
      </BackButton>
    </main>
  );
}

function QuizResultHeaderActions({
  canRestart,
  isAttemptLimitReached,
  isRestarting,
  onRestart,
}: {
  canRestart: boolean;
  isAttemptLimitReached: boolean;
  isRestarting: boolean;
  onRestart: () => void;
}) {
  return (
    <>
      <>
        {canRestart && !isAttemptLimitReached ? (
          <Button
            aria-label="Ulangi kuis"
            aria-busy={isRestarting}
            className="inline-flex"
            disabled={isRestarting}
            onClick={onRestart}
            variant="outline"
          >
            <RefreshCw />
            <span className="hidden sm:inline">
              {isRestarting ? "Memulai…" : "Ulangi"}
            </span>
          </Button>
        ) : null}
      </>
      <Button
        aria-label="Kembali ke menu kuis"
        className="hidden sm:inline-flex"
        nativeButton={false}
        render={<Link href="/quiz" />}
        title="Kembali ke menu kuis"
        variant="default"
      >
        <House />
        Menu
      </Button>
    </>
  );
}

function QuizResultSummary({
  result,
  labelClassName,
}: {
  result: QuizResult;
  labelClassName: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-left lg:grid-cols-1">
      <AssessmentResultStat
        label="Benar"
        labelClassName={labelClassName}
        value={`${result.correctCount ?? 0}`}
      />
      <AssessmentResultStat
        label="Dijawab"
        labelClassName={labelClassName}
        value={
          <>
            {result.answeredCount}
            <span className="text-xs font-semibold text-secondary-500">
              /{result.totalQuestions}
            </span>
          </>
        }
      />
    </div>
  );
}

function QuizResultExplanation({
  correctOptions,
  question,
  result,
  selectedOptions,
  explanationTextClass,
}: {
  correctOptions: QuizResultQuestion["options"];
  explanationTextClass: string;
  question: QuizResultQuestion;
  result: QuizResult;
  selectedOptions: QuizResultQuestion["options"];
}) {
  return (
    <section
      aria-label="Pembahasan"
      className="mt-7 rounded-3xl border border-student-status-success-border bg-student-status-success-bg/70 p-5 sm:p-6"
    >
      <h2 className="font-semibold text-student-status-success-fg">
        Pembahasan
      </h2>
      <div className={cn("mt-2 text-secondary-700", explanationTextClass)}>
        {question.explanation || "Pembahasan untuk soal ini belum tersedia."}
      </div>
      <div className="mt-4 grid gap-3 border-t border-student-status-success-border pt-4 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold text-secondary-500">Jawabanmu</p>
          <p className="mt-1 font-semibold text-secondary-900">
            {optionSummary(selectedOptions)}
          </p>
        </div>
        <div>
          <p className="font-semibold text-secondary-500">Jawaban benar</p>
          <p className="mt-1 font-semibold text-secondary-900">
            {correctAnswerSummary(result, correctOptions)}
          </p>
        </div>
      </div>
    </section>
  );
}

function QuizResultQuestionCard({
  currentQuestion,
  explanationTextClass,
  isCorrect,
  onNext,
  onPrevious,
  onToggleReport,
  question,
  reported,
  result,
  readingTextClass,
  selectedOptions,
}: {
  currentQuestion: number;
  explanationTextClass: string;
  isCorrect: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onToggleReport: () => void;
  question: QuizResultQuestion;
  reported: boolean;
  result: QuizResult;
  readingTextClass: string;
  selectedOptions: QuizResultQuestion["options"];
}) {
  const correctOptions = question.options.filter((option) => option.correct);
  const badgeTone = !result.correctnessAvailable
    ? "neutral"
    : isCorrect
      ? "success"
      : "danger";
  const badgeIcon = result.correctnessAvailable ? (
    isCorrect ? (
      <CheckCircle2 className="size-4" />
    ) : (
      <CircleX className="size-4" />
    )
  ) : null;
  const badgeLabel = result.correctnessAvailable
    ? isCorrect
      ? "Benar"
      : selectedOptions.length
        ? "Belum tepat"
        : "Tidak dijawab"
    : selectedOptions.length
      ? "Jawaban tersimpan"
      : "Tidak dijawab";
  const selectedOptionIds = selectedOptionIdsForQuestion(question);
  const selectedOptionIdSet = new Set(selectedOptionIds);
  return (
    <article className="rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-[0_20px_48px_-36px_color-mix(in_oklab,var(--voyage-deep)_55%,transparent)] sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 pb-5">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-secondary-900">
            Soal #{currentQuestion}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* <AssessmentUtilityPill */}
          {/*   active={reported} */}
          {/*   icon={Flag} */}
          {/*   label="Tandai untuk ditinjau" */}
          {/*   onClick={onToggleReport} */}
          {/* /> */}
          <Badge size="md" tone={badgeTone}>
            {badgeIcon}
            {badgeLabel}
          </Badge>
        </div>
      </div>
      <div
        className={cn("mt-6 font-medium text-secondary-900", readingTextClass)}
      >
        <p>{question.prompt}</p>
      </div>
      <div className="mt-7 grid gap-3">
        {question.options.map((option) => (
          <AssessmentReviewAnswerOption
            correctnessAvailable={result.correctnessAvailable}
            correct={option.correct}
            key={option.id}
            label={option.key}
            selected={selectedOptionIdSet.has(option.id)}
            text={option.text}
            textClassName={readingTextClass}
          />
        ))}
      </div>
      <QuizResultExplanation
        correctOptions={correctOptions}
        explanationTextClass={explanationTextClass}
        question={question}
        result={result}
        selectedOptions={selectedOptions}
      />
      <div className="mt-7 flex items-center justify-between gap-3 pt-5 print:hidden">
        <Button
          disabled={currentQuestion === 1}
          onClick={onPrevious}
          variant="outline"
        >
          <ArrowLeft />
          <span className="hidden sm:inline">Sebelumnya</span>
        </Button>
        {currentQuestion < result.totalQuestions ? (
          <Button onClick={onNext} variant="default">
            <span className="hidden sm:inline">Selanjutnya</span>
            <ArrowRight />
          </Button>
        ) : null}
      </div>
    </article>
  );
}

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
  const isAttemptLimitReached =
    restartMessage?.startsWith("Batas percobaan Kuis ini sudah tercapai") ??
    false;
  const resultStatLabelClassName = "font-bold tracking-[0.14em] uppercase";
  const readingTextClass = "text-lg leading-[1.85]";
  const explanationTextClass = "text-base leading-7";

  function toggleReport() {
    setReportedQuestions((current) =>
      current.includes(currentQuestion)
        ? current.filter((number) => number !== currentQuestion)
        : [...current, currentQuestion],
    );
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
        if (response.message.startsWith("Batas percobaan Kuis ini sudah tercapai")) {
          setRestartMessage(response.message);
        } else {
          showToast(response.message, { variant: "error" });
        }
        return;
      }

      router.replace(
        `/quiz/${subjectSlug}/${quizSlug}?attemptId=${encodeURIComponent(response.result.attemptId)}`,
      );
    } catch {
      showToast(
        "Kuis belum berhasil dimulai kembali. Periksa koneksi lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      setIsRestarting(false);
    }
  }

  if (!result.isSubmitted)
    return <QuizNotSubmitted subjectSlug={subjectSlug} />;

  const question = result.questions[currentQuestion - 1];
  if (!question) return null;
  const selectedOptionIds = selectedOptionIdsForQuestion(question);
  const selectedOptionIdSet = new Set(selectedOptionIds);
  const selectedOptions = question.options.filter((option) =>
    selectedOptionIdSet.has(option.id),
  );
  const isCorrect = result.correctnessAvailable && isQuestionCorrect(question);
  const markers = buildQuizResultMarkers(result, currentQuestion);

  return (
    <AssessmentResultWorkspace
      headerActions={
        <QuizResultHeaderActions
          canRestart={result.canRestart}
          isAttemptLimitReached={isAttemptLimitReached}
          isRestarting={isRestarting}
          onRestart={() => void restartQuiz()}
        />
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
        <QuizResultSummary
          labelClassName={resultStatLabelClassName}
          result={result}
        />
      }
      title={result.title}
    >
      <div>
        {restartMessage && isAttemptLimitReached ? (
          <p
            className="mb-5 text-sm font-medium text-student-status-danger-fg"
            role="alert"
          >
            {restartMessage}
          </p>
        ) : null}
        <QuizResultQuestionCard
          currentQuestion={currentQuestion}
          explanationTextClass={explanationTextClass}
          isCorrect={isCorrect}
          onNext={() => setCurrentQuestion((number) => number + 1)}
          onPrevious={() => setCurrentQuestion((number) => number - 1)}
          onToggleReport={toggleReport}
          question={question}
          reported={reportedQuestions.includes(currentQuestion)}
          result={result}
          readingTextClass={readingTextClass}
          selectedOptions={selectedOptions}
        />
      </div>
    </AssessmentResultWorkspace>
  );
}

export { QuizResultPageModule };
