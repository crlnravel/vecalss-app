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
  const [currentQuestion, setCurrentQuestion] = useState(() => attempt.currentNumber);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>(
    () => Object.fromEntries(
      attempt.questions.flatMap((question, index) =>
        question.selectedOptionKey ? [[index + 1, question.selectedOptionKey]] : [],
      ),
    ),
  );
  const [flaggedQuestions] = useState<number[]>(
    () => attempt.markers.reduce<number[]>((numbers, marker) => {
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
  const toggleAnnotation = useCallback(() => setIsAnnotationOpen((open) => !open), []);
  const savingQuestionSet = useMemo(() => new Set(savingQuestions), [savingQuestions]);
  const flaggedQuestionSet = useMemo(() => new Set(flaggedQuestions), [flaggedQuestions]);

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
  const currentQuizQuestion = attempt.questions[currentQuestion - 1];
  const isCurrentQuestionReported = reportedQuestions.includes(currentQuestion);
  const unansweredCount = Math.max(0, quiz.questionCount - Object.keys(selectedAnswers).length);

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
    if (!currentQuizQuestion || savingQuestionSet.has(currentQuestion) || isSubmitting) {
      return;
    }
    const previousOptionId = selectedAnswers[currentQuestion];
    setSelectedAnswers((current) => ({
      ...current,
      [currentQuestion]: optionId,
    }));
    setSavingQuestions((current) => [...current, currentQuestion]);
    setMessage(null);
    const response = await saveQuizAnswerAction(attemptId, currentQuizQuestion.id, optionId);
    setSavingQuestions((current) => current.filter((number) => number !== currentQuestion));
    if (!response.ok) {
      setSelectedAnswers((current) => {
        const next = { ...current };
        if (previousOptionId) next[currentQuestion] = previousOptionId;
        else delete next[currentQuestion];
        return next;
      });
      setMessage(response.message);
    }
  }

  async function submitQuiz() {
    if (savingQuestions.length) {
      setMessage("Tunggu sampai jawaban tersimpan sebelum mengirim quiz.");
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
      router.push(`/quiz/${subjectSlug}/${quiz.slug}/result`);
    } catch (submitError) {
      unstable_rethrow(submitError);
      setMessage(submitError instanceof Error ? submitError.message : "Quiz belum dapat dikirim.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <QuizOngoingScreen
      attempt={attempt}
      currentQuestion={currentQuestion}
      currentQuizQuestion={currentQuizQuestion}
      currentSelectedOptionKey={currentSelectedOptionKey}
      flaggedQuestionSet={flaggedQuestionSet}
      message={message}
      onExit={() => router.push(`/quiz/${subjectSlug}`)}
      onExitDialogChange={setIsExitDialogOpen}
      onGoToQuestion={goToQuestion}
      onSelectAnswer={selectAnswer}
      onSubmitDialogChange={setIsSubmitDialogOpen}
      onSubmitQuiz={() => { void submitQuiz(); }}
      onToggleReport={toggleReport}
      onToggleAnnotation={toggleAnnotation}
      onUpdateTextScale={updateTextScale}
      quiz={quiz}
      readingTextClass={readingTextClass}
      savingQuestionSet={savingQuestionSet}
      selectedAnswers={selectedAnswers}
      subjectTitle={subjectTitle}
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
  currentSelectedOptionKey: string | null;
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
  selectedAnswers: Record<number, string>;
  subjectTitle: string;
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
  currentSelectedOptionKey,
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
  uiTextClass,
  unlockedQuestionCount,
  unansweredCount,
  viewState,
}: QuizOngoingScreenProps) {
  const questionMarkers = attempt.questions.map((question, index) => {
    const number = index + 1;
    const markerState: QuizAttemptNavState =
      number === currentQuestion
        ? "active"
        : flaggedQuestionSet.has(number)
          ? "flagged"
          : selectedAnswers[number]
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
                <span className={cn("shrink-0 font-semibold", uiTextClass)}>Soal {currentQuestion}</span>
                <div className="flex items-center gap-2">
                  <AssessmentUtilityPill
                    active={viewState.reported}
                    icon={Flag}
                    label="Laporkan soal"
                    onClick={onToggleReport}
                  />
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

              <div className={cn("mt-7 space-y-5 font-medium text-secondary-800", readingTextClass)}>
                {currentQuizQuestion?.passage.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              <div className="mt-8">
                <p className={cn("font-medium text-secondary-900", readingTextClass)}>
                  {currentQuizQuestion?.prompt}
                </p>
                <p className={cn("mt-3 font-medium text-secondary-500", uiTextClass)}>
                  {currentQuizQuestion?.hint}
                </p>
              </div>
            </section>

            <section className="grid gap-4">
              {currentQuizQuestion?.options.map((option) => (
                <AssessmentAnswerOption
                  disabled={savingQuestionSet.has(currentQuestion) || viewState.submitting}
                  key={option.key}
                  onClick={() => void onSelectAnswer(option.id)}
                  option={option}
                  selected={option.id === currentSelectedOptionKey}
                />
              ))}
            </section>
          </div>
          {message ? <p className="mt-3 text-sm font-medium text-student-status-danger-fg">{message}</p> : null}
        </div>
      }
      dialog={
        <>
          <AlertDialog onOpenChange={onExitDialogChange} open={viewState.dialogOpen}>
          <AlertDialogContent variant="danger">
            <AlertDialogHeader>
              <AlertDialogMedia variant="danger"><AlertTriangle /></AlertDialogMedia>
              <AlertDialogTitle>Keluar dari Latihan?</AlertDialogTitle>
              <AlertDialogDescription>
                Yakin mau keluar? Progres kamu di sesi ini bakal hilang lho.
                Sayang banget kan!🥲
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Periksa lagi</AlertDialogCancel>
              <AlertDialogAction onClick={onExit} variant="destructive">Ya, Keluar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
          <AlertDialog onOpenChange={onSubmitDialogChange} open={viewState.submitDialogOpen}>
          <AlertDialogContent pending={viewState.submitting} variant="warning">
            <AlertDialogHeader>
              <AlertDialogMedia variant="warning"><AlertTriangle /></AlertDialogMedia>
              <AlertDialogTitle>{unansweredCount ? "Masih ada soal yang belum terjawab" : "Selesaikan quiz ini?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {unansweredCount ? (
                  <>Kamu masih memiliki <strong className="text-secondary-900">{unansweredCount} soal belum terjawab</strong>. Periksa kembali sebelum mengirim quiz.</>
                ) : "Setelah dikirim, jawabanmu akan dikunci dan hasil quiz akan disiapkan."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={viewState.submitting} variant="brandOutline">Periksa lagi</AlertDialogCancel>
              <AlertDialogAction disabled={viewState.submitting} onClick={onSubmitQuiz} variant="destructive">{viewState.submitting ? "Mengirim…" : "Tetap kirim"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        </>
      }
      exitControl={
        <Button
          aria-label="Keluar dari latihan"
          onClick={() => onExitDialogChange(true)}
          size="icon-sm"
          title="Keluar dari latihan"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      }
      footer={
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 px-4 md:bottom-7 md:px-8">
          <div className="pointer-events-auto mx-auto grid w-full max-w-[570px] grid-cols-[1fr_7rem_1fr] items-center gap-3 rounded-[1.5rem] border border-primary-100 bg-white p-3 shadow-[0_18px_42px_-28px_rgba(1,76,56,0.65)]">
            <Button
              aria-label="Soal sebelumnya"
              className="h-16 w-full justify-center"
              disabled={currentQuestion === 1}
              onClick={() => onGoToQuestion(currentQuestion - 1)}
              size="lg"
              variant="brandOutline"
            >
              <ChevronLeft />
              <span className="sr-only">Sebelumnya</span>
            </Button>
            <button
              aria-label="Coretan (sementara dinonaktifkan)"
              className="flex min-w-20 cursor-not-allowed flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-secondary-400 opacity-60"
              disabled
              title="Coretan sementara dinonaktifkan"
              type="button"
            >
              <span className="grid size-12 place-items-center rounded-full border-2 border-secondary-300">
                <PenTool className="size-7" />
              </span>
              Coretan
            </button>
            {currentQuestion === quiz.questionCount ? (
              <Button
                aria-label="Selesai"
                className="h-16 w-full justify-center"
                disabled={viewState.submitting || savingQuestionSet.size > 0}
                onClick={() => onSubmitDialogChange(true)}
                size="lg"
                variant="brand"
              >
                Selesai
              </Button>
            ) : (
              <Button aria-label="Soal selanjutnya" className="h-16 w-full justify-center" onClick={() => onGoToQuestion(currentQuestion + 1)} size="lg" variant="brand">
                <span className="sr-only">Selanjutnya</span>
                <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      }
      header={
        <div className="relative flex min-h-20 items-center justify-center border-t-4 border-primary-700 border-b border-primary-100 bg-white px-16 py-4 sm:min-h-24">
          <h2 className="sr-only">{quiz.title} · {subjectTitle}</h2>
          <BrandLockup />

          <div className="absolute right-4 inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm sm:right-8">
            <Clock3 className="size-4 text-secondary-500" />
            <span>{attempt.remainingTime}</span>
          </div>
        </div>
      }
      annotation={
        <AssessmentAnnotationOverlay onClose={onToggleAnnotation} open={viewState.annotationOpen} />
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

export { QuizOngoingPageModule };
