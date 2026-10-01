"use client";

import { useCallback, useMemo, useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  Minus,
  PenTool,
  Plus,
  X,
} from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { BrandLockup } from "@/modules/home/components/home-primitives";

import {
  AssessmentAnswerOption,
  AssessmentAnnotationOverlay,
  AssessmentIconButton,
  AssessmentQuestionNavigation,
  AssessmentUtilityPill,
  AssessmentWorkspace,
} from "@/modules/assessment/AssessmentWorkspace";
import { AssessmentNavigationFooter } from "@/modules/assessment/AssessmentNavigationFooter";

import { saveQuizAnswerAction, submitQuizAction } from "./actions";

import type { QuizAttempt, QuizAttemptNavState, QuizItem } from "./data";

function QuizOngoingPageModule({
  attempt,
  attemptId,
  quiz,
  subjectSlug,
  subjectTitle,
}: {
  attempt: QuizAttempt;
  attemptId: string;
  quiz: QuizItem;
  subjectSlug: string;
  subjectTitle: string;
}) {
  const router = useRouter();
  const [textScale, setTextScale] = useState<"compact" | "default" | "large">(
    "default",
  );
  const [currentQuestion, setCurrentQuestion] = useState(
    () => attempt.currentNumber,
  );
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, string[]>
  >(() =>
    Object.fromEntries(
      attempt.questions.flatMap((question, index) =>
        question.selectedOptionKeys?.length || question.selectedOptionKey
          ? [
              [
                index + 1,
                question.selectedOptionKeys?.length
                  ? question.selectedOptionKeys
                  : [question.selectedOptionKey!],
              ],
            ]
          : [],
      ),
    ),
  );
  const [flaggedQuestions] = useState<number[]>(() =>
    attempt.markers.reduce<number[]>((numbers, marker) => {
      if (marker.state === "flagged") numbers.push(marker.number);
      return numbers;
    }, []),
  );
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const toggleAnnotation = useCallback(
    () => setIsAnnotationOpen((open) => !open),
    [],
  );
  const savingQuestionSet = useMemo(
    () => new Set(savingQuestions),
    [savingQuestions],
  );
  const flaggedQuestionSet = useMemo(
    () => new Set(flaggedQuestions),
    [flaggedQuestions],
  );

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

  const currentSelectedOptionKeys = selectedAnswers[currentQuestion] ?? [];
  const currentQuizQuestion = attempt.questions[currentQuestion - 1];
  const isCurrentQuestionReported = reportedQuestions.includes(currentQuestion);
  const unansweredCount = Math.max(
    0,
    quiz.questionCount - Object.keys(selectedAnswers).length,
  );

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

  function toggleReport() {
    setReportedQuestions((current) =>
      current.includes(currentQuestion)
        ? current.filter((question) => question !== currentQuestion)
        : [...current, currentQuestion].sort((a, b) => a - b),
    );
  }

  async function selectAnswer(optionId: string) {
    if (
      !currentQuizQuestion ||
      savingQuestionSet.has(currentQuestion) ||
      isSubmitting
    ) {
      return;
    }
    const previousOptionIds = selectedAnswers[currentQuestion] ?? [];
    const nextOptionIds =
      currentQuizQuestion.questionType === "multiple_choice"
        ? previousOptionIds.includes(optionId)
          ? previousOptionIds.filter((id) => id !== optionId)
          : [...previousOptionIds, optionId]
        : [optionId];
    setSelectedAnswers((current) => {
      const next = { ...current };
      if (nextOptionIds.length) next[currentQuestion] = nextOptionIds;
      else delete next[currentQuestion];
      return next;
    });
    setSavingQuestions((current) => [...current, currentQuestion]);
    setMessage(null);
    const response = await saveQuizAnswerAction(
      attemptId,
      currentQuizQuestion.id,
      nextOptionIds,
    );
    setSavingQuestions((current) =>
      current.filter((number) => number !== currentQuestion),
    );
    if (!response.ok) {
      setSelectedAnswers((current) => {
        const next = { ...current };
        if (previousOptionIds.length) next[currentQuestion] = previousOptionIds;
        else delete next[currentQuestion];
        return next;
      });
      setMessage(response.message);
    }
  }

  async function submitQuiz() {
    if (savingQuestions.length) {
      setMessage("Tunggu sampai jawaban tersimpan sebelum mengumpulkan kuis.");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await submitQuizAction(attemptId);
      if (!response.ok) {
        setMessage(response.message);
        return;
      }
      router.push(
        `/quiz/${subjectSlug}/${quiz.slug}/result?attemptId=${encodeURIComponent(response.result.attemptId)}`,
      );
    } catch (submitError) {
      unstable_rethrow(submitError);
      setMessage("Kuis belum berhasil dikumpulkan. Coba lagi beberapa saat lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <QuizOngoingScreen
      attempt={attempt}
      currentQuestion={currentQuestion}
      currentQuizQuestion={currentQuizQuestion}
      currentSelectedOptionKeys={currentSelectedOptionKeys}
      flaggedQuestionSet={flaggedQuestionSet}
      message={message}
      onExit={() => router.push(`/quiz/${subjectSlug}`)}
      onExitDialogChange={setIsExitDialogOpen}
      onGoToQuestion={goToQuestion}
      onSelectAnswer={selectAnswer}
      onSubmitDialogChange={setIsSubmitDialogOpen}
      onSubmitQuiz={() => {
        void submitQuiz();
      }}
      onToggleReport={toggleReport}
      onToggleAnnotation={toggleAnnotation}
      onUpdateTextScale={updateTextScale}
      quiz={quiz}
      readingTextClass={readingTextClass}
      savingQuestionSet={savingQuestionSet}
      selectedAnswers={selectedAnswers}
      subjectTitle={subjectTitle}
      textScale={textScale}
      uiTextClass={uiTextClass}
      unlockedQuestionCount={unlockedQuestionCount}
      viewState={{
        dialogOpen: isExitDialogOpen,
        annotationOpen: isAnnotationOpen,
        reported: isCurrentQuestionReported,
        submitDialogOpen: isSubmitDialogOpen,
        submitting: isSubmitting,
      }}
      unansweredCount={unansweredCount}
    />
  );
}

type QuizOngoingScreenProps = {
  attempt: QuizAttempt;
  currentQuestion: number;
  currentQuizQuestion: QuizAttempt["questions"][number] | undefined;
  currentSelectedOptionKeys: string[];
  flaggedQuestionSet: Set<number>;
  message: string | null;
  onExit: () => void;
  onExitDialogChange: (open: boolean) => void;
  onGoToQuestion: (question: number) => void;
  onSelectAnswer: (optionId: string) => void;
  onSubmitDialogChange: (open: boolean) => void;
  onSubmitQuiz: () => void;
  onToggleReport: () => void;
  onToggleAnnotation: () => void;
  onUpdateTextScale: (direction: "smaller" | "larger") => void;
  quiz: QuizItem;
  readingTextClass: string;
  savingQuestionSet: Set<number>;
  selectedAnswers: Record<number, string[]>;
  subjectTitle: string;
  textScale: "compact" | "default" | "large";
  uiTextClass: string;
  unlockedQuestionCount: number;
  unansweredCount: number;
  viewState: {
    annotationOpen: boolean;
    dialogOpen: boolean;
    reported: boolean;
    submitDialogOpen: boolean;
    submitting: boolean;
  };
};

function QuizOngoingScreen({
  attempt,
  currentQuestion,
  currentQuizQuestion,
  currentSelectedOptionKeys,
  flaggedQuestionSet,
  message,
  onExit,
  onExitDialogChange,
  onGoToQuestion,
  onSelectAnswer,
  onSubmitDialogChange,
  onSubmitQuiz,
  onToggleReport,
  onToggleAnnotation,
  onUpdateTextScale,
  quiz,
  readingTextClass,
  savingQuestionSet,
  selectedAnswers,
  subjectTitle,
  textScale,
  uiTextClass,
  unlockedQuestionCount,
  unansweredCount,
  viewState,
}: QuizOngoingScreenProps) {
  const currentSelectedOptionKeySet = new Set(currentSelectedOptionKeys);
  const questionMarkers = attempt.questions.map((question, index) => {
    const number = index + 1;
    const markerState: QuizAttemptNavState =
      number === currentQuestion
        ? "active"
        : flaggedQuestionSet.has(number)
          ? "flagged"
          : selectedAnswers[number]?.length
            ? "answered"
            : number <= unlockedQuestionCount + 1
              ? "empty"
              : "locked";

    return { id: question.id, number, state: markerState };
  });

  return (
    <AssessmentWorkspace
      content={
        <div className="mx-auto w-full max-w-[1650px]">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.96fr)_minmax(34rem,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,0.98fr)_minmax(36rem,1fr)] xl:gap-16">
            <section className="min-w-0">
              <div className="flex min-h-12 items-center justify-between gap-4">
                <span className={cn("shrink-0 font-semibold", uiTextClass)}>
                  Soal {currentQuestion}
                </span>
                <div className="flex items-center gap-2">
                  {/* <AssessmentUtilityPill */}
                  {/*   active={viewState.reported} */}
                  {/*   icon={Flag} */}
                  {/*   label="Tandai untuk ditinjau" */}
                  {/*   onClick={onToggleReport} */}
                  {/* /> */}
                  <AssessmentIconButton
                    ariaLabel="Perkecil ukuran font"
                    icon={Minus}
                    onClick={() => onUpdateTextScale("smaller")}
                  />
                  <AssessmentIconButton
                    ariaLabel="Perbesar ukuran font"
                    icon={Plus}
                    onClick={() => onUpdateTextScale("larger")}
                  />
                </div>
              </div>

              <div
                className={cn(
                  "mt-7 space-y-5 font-medium text-secondary-800",
                  readingTextClass,
                )}
              >
                {currentQuizQuestion?.passage.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="mt-8">
                <p
                  className={cn(
                    "font-medium text-secondary-900",
                    readingTextClass,
                  )}
                >
                  {currentQuizQuestion?.prompt}
                </p>
                <p
                  className={cn(
                    "mt-3 font-medium text-secondary-900",
                    uiTextClass,
                  )}
                >
                  {currentQuizQuestion?.hint}
                </p>
              </div>
            </section>

            <section className="grid gap-4">
              {currentQuizQuestion?.options.map((option) => (
                <AssessmentAnswerOption
                  disabled={
                    savingQuestionSet.has(currentQuestion) ||
                    viewState.submitting
                  }
                  key={option.key}
                  onClick={() => void onSelectAnswer(option.id)}
                  option={option}
                  selected={currentSelectedOptionKeySet.has(option.id)}
                  selectionMode={
                    currentQuizQuestion?.questionType === "multiple_choice"
                      ? "multiple"
                      : "single"
                  }
                  textScale={textScale}
                />
              ))}
            </section>
          </div>
          {message ? (
            <p
              aria-live="polite"
              className="mt-3 text-sm font-medium text-student-status-danger-fg"
              role="status"
            >
              {message}
            </p>
          ) : null}
        </div>
      }
      dialog={
        <QuizOngoingDialogs
          onExit={onExit}
          onExitDialogChange={onExitDialogChange}
          onSubmitDialogChange={onSubmitDialogChange}
          onSubmitQuiz={onSubmitQuiz}
          unansweredCount={unansweredCount}
          viewState={viewState}
        />
      }
      exitControl={
        <Button
          aria-label="Keluar dari kuis"
          onClick={() => onExitDialogChange(true)}
          size="icon-sm"
          title="Keluar dari kuis"
          variant="outline"
        >
          <X />
        </Button>
      }
      footer={
        <AssessmentNavigationFooter>
          <Button
            aria-label="Soal sebelumnya"
            className="h-12 w-full justify-center"
            disabled={currentQuestion === 1}
            onClick={() => onGoToQuestion(currentQuestion - 1)}
            size="lg"
            variant="outline"
          >
            <ChevronLeft />
            <span className="sr-only">Sebelumnya</span>
          </Button>
          <button
            aria-label="Coretan (sementara dinonaktifkan)"
            className="inline-flex min-w-16 cursor-not-allowed items-center justify-center rounded-xl px-2 py-1 text-secondary-400 opacity-60"
            disabled
            title="Coretan sementara dinonaktifkan"
            type="button"
          >
            <span className="grid size-10 place-items-center rounded-full border-2 border-secondary-300">
              <PenTool className="size-6" />
            </span>
          </button>
          {currentQuestion === quiz.questionCount ? (
            <Button
              aria-label="Kumpulkan kuis"
              className="h-12 w-full justify-center"
              disabled={viewState.submitting || savingQuestionSet.size > 0}
              onClick={() => onSubmitDialogChange(true)}
              size="lg"
              variant="default"
            >
              Kumpulkan kuis
            </Button>
          ) : (
            <Button
              aria-label="Soal selanjutnya"
              className="h-12 w-full justify-center"
              onClick={() => onGoToQuestion(currentQuestion + 1)}
              size="lg"
              variant="default"
            >
              <span className="sr-only">Selanjutnya</span>
              <ChevronRight />
            </Button>
          )}
        </AssessmentNavigationFooter>
      }
      header={
        <div className="relative flex min-h-20 items-center justify-center bg-white px-12 py-2 sm:min-h-20 sm:px-16">
          <h2 className="sr-only">
            {quiz.title} · {subjectTitle}
          </h2>
          <div className="scale-75">
            <BrandLockup />
          </div>

          <div className="absolute right-4 inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-primary-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm sm:right-8">
            <Clock3 className="size-4 text-secondary-500" />
            <span>{attempt.remainingTime}</span>
          </div>
        </div>
      }
      annotation={
        <AssessmentAnnotationOverlay
          onClose={onToggleAnnotation}
          open={viewState.annotationOpen}
        />
      }
      navigation={
        <AssessmentQuestionNavigation
          items={questionMarkers}
          onSelect={onGoToQuestion}
        />
      }
    />
  );
}

function QuizOngoingDialogs({
  onExit,
  onExitDialogChange,
  onSubmitDialogChange,
  onSubmitQuiz,
  unansweredCount,
  viewState,
}: Pick<
  QuizOngoingScreenProps,
  | "onExit"
  | "onExitDialogChange"
  | "onSubmitDialogChange"
  | "onSubmitQuiz"
  | "unansweredCount"
  | "viewState"
>) {
  return (
    <>
      <AlertDialog onOpenChange={onExitDialogChange} open={viewState.dialogOpen}>
        <AlertDialogContent variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Keluar dari kuis?</AlertDialogTitle>
            <AlertDialogDescription>
              Jawaban yang sudah tersimpan tetap aman. Kamu bisa keluar sekarang
              dan kembali melanjutkan kuis ini nanti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={onExit} variant="destructive">
              Keluar dari kuis
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={onSubmitDialogChange}
        open={viewState.submitDialogOpen}
      >
        <AlertDialogContent pending={viewState.submitting} variant="warning">
          <AlertDialogHeader>
            <AlertDialogMedia variant="warning">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {unansweredCount
                ? "Masih ada soal yang belum terjawab"
                : "Kumpulkan kuis?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unansweredCount ? (
                <>
                  Kamu masih memiliki{" "}
                  <strong className="text-secondary-900">
                    {unansweredCount} soal belum terjawab
                  </strong>
                  . Periksa kembali sebelum mengumpulkan kuis.
                </>
              ) : (
                "Setelah dikumpulkan, jawabanmu akan dikunci dan hasil kuis akan disiapkan."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={viewState.submitting}
              variant="outline"
            >
              Kembali
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={viewState.submitting}
              onClick={onSubmitQuiz}
              variant="destructive"
            >
              {viewState.submitting ? "Mengumpulkan…" : "Kumpulkan kuis"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { QuizOngoingPageModule };
