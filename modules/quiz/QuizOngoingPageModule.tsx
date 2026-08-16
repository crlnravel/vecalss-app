"use client";

import { useMemo, useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  ZoomIn,
  ZoomOut,
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

import {
  AssessmentAnswerOption,
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
  const [flaggedQuestions, setFlaggedQuestions] = useState<number[]>(
    () => attempt.markers.reduce<number[]>((numbers, marker) => {
      if (marker.state === "flagged") numbers.push(marker.number);
      return numbers;
    }, []),
  );
  const [reportedQuestions, setReportedQuestions] = useState<number[]>([]);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
  const isCurrentQuestionFlagged = flaggedQuestionSet.has(currentQuestion);
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
      onSubmitQuiz={() => { void submitQuiz(); }}
      onToggleFlag={toggleFlag}
      onToggleReport={toggleReport}
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
        flagged: isCurrentQuestionFlagged,
        reported: isCurrentQuestionReported,
        submitting: isSubmitting,
      }}
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
  onSubmitQuiz: () => void;
  onToggleFlag: () => void;
  onToggleReport: () => void;
  onUpdateTextScale: (direction: "smaller" | "larger") => void;
  quiz: QuizItem;
  readingTextClass: string;
  savingQuestionSet: Set<number>;
  selectedAnswers: Record<number, string>;
  subjectTitle: string;
  uiTextClass: string;
  unlockedQuestionCount: number;
  viewState: {
    dialogOpen: boolean;
    flagged: boolean;
    reported: boolean;
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
  onSubmitQuiz,
  onToggleFlag,
  onToggleReport,
  onUpdateTextScale,
  quiz,
  readingTextClass,
  savingQuestionSet,
  selectedAnswers,
  subjectTitle,
  uiTextClass,
  unlockedQuestionCount,
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
        <div className="mx-auto flex w-full max-w-[1550px] flex-col gap-5">
          <div className={cn("flex flex-wrap items-center gap-3 font-medium", uiTextClass)}>
            <span className="font-semibold tracking-[0.08em] text-primary-700 uppercase">
              Soal {currentQuestion}
            </span>
            <span className="text-secondary-300">•</span>
            <span className="font-medium text-secondary-400">{subjectTitle}</span>
            <span className="text-secondary-300">|</span>
            <AssessmentUtilityPill
              active={viewState.reported}
              icon={AlertTriangle}
              label="Laporkan"
              onClick={onToggleReport}
            />
            <AssessmentUtilityPill
              active={viewState.flagged}
              icon={Flag}
              label="Tandai"
              onClick={onToggleFlag}
            />
            <AssessmentIconButton
              ariaLabel="Perkecil ukuran font"
              icon={ZoomOut}
              onClick={() => onUpdateTextScale("smaller")}
            />
            <AssessmentIconButton
              ariaLabel="Perbesar ukuran font"
              icon={ZoomIn}
              onClick={() => onUpdateTextScale("larger")}
            />
          </div>

          <div className="space-y-5">
            <div
              className={cn(
                "space-y-5 border-t border-primary-100 pt-5 pb-6 font-medium text-secondary-800",
                readingTextClass,
              )}
            >
              {currentQuizQuestion?.passage.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div>
              <p className={cn("font-medium text-secondary-900", readingTextClass)}>
                {currentQuizQuestion?.prompt}
              </p>
              <p className={cn("mt-3 font-medium text-secondary-500", uiTextClass)}>
                {currentQuizQuestion?.hint}
              </p>
            </div>

            <div className="grid gap-4">
              {currentQuizQuestion?.options.map((option) => (
                <AssessmentAnswerOption
                  disabled={savingQuestionSet.has(currentQuestion) || viewState.submitting}
                  key={option.key}
                  onClick={() => void onSelectAnswer(option.id)}
                  option={option}
                  selected={option.id === currentSelectedOptionKey}
                />
              ))}
            </div>
          </div>
          {message ? <p className="mt-3 text-sm font-medium text-student-status-danger-fg">{message}</p> : null}
        </div>
      }
      dialog={
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
        <div className="sticky bottom-0 z-10 border-t border-primary-100 bg-white/96 px-4 py-4 backdrop-blur md:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3">
            <Button
              disabled={currentQuestion === 1}
              onClick={() => onGoToQuestion(currentQuestion - 1)}
              size="lg"
              variant="brandOutline"
            >
              <ChevronLeft data-icon="inline-start" />
              Soal Sebelumnya
            </Button>
            {currentQuestion === quiz.questionCount ? (
              <Button className="border-primary-700 bg-primary-700 text-white hover:border-primary-800 hover:bg-primary-800 focus-visible:border-primary-700 focus-visible:ring-primary-700/35" disabled={viewState.submitting || savingQuestionSet.size > 0} onClick={() => onSubmitQuiz()} size="lg">
                {viewState.submitting ? "Mengirim quiz…" : "Kirim Quiz"}
                <ChevronRight data-icon="inline-end" />
              </Button>
            ) : (
              <Button className="border-primary-700 bg-primary-700 text-white hover:border-primary-800 hover:bg-primary-800 focus-visible:border-primary-700 focus-visible:ring-primary-700/35" onClick={() => onGoToQuestion(currentQuestion + 1)} size="lg">
                Soal Selanjutnya
                <ChevronRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      }
      header={
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
