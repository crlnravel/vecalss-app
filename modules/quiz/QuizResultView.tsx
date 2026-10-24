"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleX,
  House,
  RefreshCw,
} from "@/lib/icons";

import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AssessmentResultNavigation,
  AssessmentResultWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
import { AssessmentReviewAnswerOption } from "@/modules/assessment/AssessmentReviewAnswerOption";
import { AssessmentResultStat } from "@/modules/assessment/AssessmentResultStat";
import { compareSelectedOptionSets } from "@/lib/question-bank/answer-contract";
import { cn } from "@/lib/utils";
import { QuizAutoSubmittedNotice } from "./QuizAutoSubmittedNotice";

type QuizResult = {
  aggregateScore: number | null;
  autoSubmitted: boolean;
  answeredCount: number;
  canRestart: boolean;
  resumeAttemptId?: string | null;
  correctCount: number | null;
  correctnessAvailable: boolean;
  isSubmitted: boolean;
  released: boolean;
  releaseAt: string | null;
  releaseState: "hidden" | "scheduled" | "released";
  scoringState: "pending" | "scored" | "review_required" | "recalculating";
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

function currentQuizScore(result: QuizResult) {
  if (result.released && result.releaseState === "released" && result.scoringState === "scored" && result.attemptScore !== null && Number.isFinite(result.attemptScore)) {
    return result.attemptScore;
  }
  const state = result.scoringState === "review_required"
    ? { label: "Perlu ditinjau", description: "Jawabanmu sudah tersimpan. Penilaian perlu ditinjau sebelum nilainya tersedia." }
    : result.scoringState === "recalculating"
      ? { label: "Sedang dihitung", description: "Nilai pengerjaan ini sedang dihitung ulang." }
      : result.scoringState === "pending"
        ? { label: "Belum dinilai", description: "Jawabanmu sudah tersimpan. Penilaian belum selesai." }
        : result.releaseState === "scheduled"
          ? { label: "Belum dibuka", description: "Nilai pengerjaan ini dibuka setelah kuis ditutup." }
          : result.releaseState === "hidden"
            ? { label: "Tidak ditampilkan", description: "Nilai pengerjaan ini tidak ditampilkan sesuai pengaturan kuis." }
            : { label: "Belum tersedia", description: "Nilai pengerjaan ini belum tersedia." };
  return { state: "unavailable" as const, ...state };
}

const aggregatePolicyLabels = {
  highest: "Nilai tertinggi",
  latest: "Nilai terbaru",
  first: "Nilai pertama",
  average: "Nilai rata-rata",
};

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
  canResume,
  isAttemptLimitReached,
  isRestarting,
  onRestart,
}: {
  canRestart: boolean;
  canResume: boolean;
  isAttemptLimitReached: boolean;
  isRestarting: boolean;
  onRestart: () => void;
}) {
  return (
    <>
      <>
        {canRestart && !isAttemptLimitReached ? (
          <Button
            aria-label={canResume ? "Lanjutkan kuis" : "Ulangi kuis"}
            aria-busy={isRestarting}
            className="inline-flex"
            disabled={isRestarting}
            onClick={onRestart}
            variant="outline"
          >
            <RefreshCw />
            <span>
              {isRestarting ? "Memulai…" : canResume ? "Lanjutkan" : "Ulangi"}
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
  const score = currentQuizScore(result);
  const correctCount = typeof score === "number" && result.correctCount !== null
    ? result.correctCount
    : null;
  const correctLabel = correctCount === null
    ? typeof score === "number" ? "Belum tersedia" : score.label
    : String(correctCount);
  const aggregateScore = result.aggregateScore !== null && Number.isFinite(result.aggregateScore)
    ? Math.round(Math.max(0, Math.min(100, result.aggregateScore)))
    : null;
  return (
    <div className="grid grid-cols-2 gap-2 text-left lg:grid-cols-1">
      <AssessmentResultStat
        label="Benar"
        labelClassName={labelClassName}
        value={<span role="group" aria-label={`Benar: ${correctLabel}`} className={correctCount === null ? "text-sm" : undefined}>{correctLabel}</span>}
      />
      <AssessmentResultStat
        label="Dijawab"
        labelClassName={labelClassName}
        value={
          <span role="group" aria-label={`Dijawab: ${result.answeredCount} dari ${result.totalQuestions}`}>
            {result.answeredCount}
            <span className="text-xs font-semibold text-secondary-500">
              /{result.totalQuestions}
            </span>
          </span>
        }
      />
      {typeof score !== "number" && aggregateScore !== null ? (
        <section aria-label="Nilai gabungan yang sudah dibuka" className="col-span-2 mt-3 border-t border-primary-100 pt-4 lg:col-span-1">
          <h2 className="text-sm font-semibold text-secondary-900">Nilai gabungan yang sudah dibuka</h2>
          <p className="mt-2 text-xl font-semibold tabular-nums text-primary-800">
            <output aria-label={`Nilai gabungan yang sudah dibuka: ${aggregateScore}`}>{aggregateScore}</output>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-secondary-600">
            {aggregatePolicyLabels[result.policy.scorePolicy]} dari pengerjaan yang nilainya sudah dibuka. Nilai ini bukan nilai khusus pengerjaan ini.
          </p>
        </section>
      ) : null}
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
  question,
  result,
  readingTextClass,
  selectedOptions,
}: {
  currentQuestion: number;
  explanationTextClass: string;
  isCorrect: boolean;
  onNext: () => void;
  onPrevious: () => void;
  question: QuizResultQuestion;
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

function QuizResultView({
  result,
  subjectSlug,
  currentQuestion,
  isRestarting,
  restartMessage,
  onRestart,
  onSelectQuestion,
}: {
  result: QuizResult;
  subjectSlug: string;
  currentQuestion: number;
  isRestarting: boolean;
  restartMessage: string | null;
  onRestart: () => void;
  onSelectQuestion: (number: number) => void;
}) {
  const isAttemptLimitReached =
    restartMessage?.startsWith("Batas percobaan Kuis ini sudah tercapai") ??
    false;
  const resultStatLabelClassName = "font-bold tracking-[0.14em] uppercase";
  const readingTextClass = "text-lg leading-[1.85]";
  const explanationTextClass = "text-base leading-7";

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
          canResume={Boolean(result.resumeAttemptId)}
          isAttemptLimitReached={isAttemptLimitReached}
          isRestarting={isRestarting}
          onRestart={onRestart}
        />
      }
      navigation={
        <AssessmentResultNavigation
          compact
          items={markers}
          label="Ringkasan soal"
          onSelect={onSelectQuestion}
        />
      }
      floatingPanels
      score={currentQuizScore(result)}
      scoreLabel="Nilai pengerjaan ini"
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
        {result.autoSubmitted ? <QuizAutoSubmittedNotice /> : null}
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
          onNext={() => onSelectQuestion(currentQuestion + 1)}
          onPrevious={() => onSelectQuestion(currentQuestion - 1)}
          question={question}
          result={result}
          readingTextClass={readingTextClass}
          selectedOptions={selectedOptions}
        />
      </div>
    </AssessmentResultWorkspace>
  );
}

export { QuizResultView };
export type { QuizResult };
