"use client";

import { useMemo, useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  AlertTriangle,
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
  return (
    <div className="min-h-svh bg-white text-secondary-900">
      <Dialog onOpenChange={onExitDialogChange} open={viewState.dialogOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-3xl bg-white p-0 shadow-xl sm:max-w-md"
          showCloseButton={false}
        >
          <div className="px-5 py-5">
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-4">
                <DialogTitle className="text-2xl leading-tight font-semibold text-secondary-900">
                  Keluar dari Latihan?
                </DialogTitle>
                <button
                  aria-label="Tutup modal"
                  className="inline-flex size-8 items-center justify-center rounded-full text-secondary-300 transition-colors hover:bg-secondary-50 hover:text-secondary-500"
                  onClick={() => onExitDialogChange(false)}
                  type="button"
                >
                  <span className="text-2xl leading-none">×</span>
                </button>
              </div>

              <DialogDescription className="mt-2 text-base leading-[1.5] font-medium text-secondary-500">
                Yakin mau keluar? Progres kamu di sesi ini bakal hilang lho.
                Sayang banget kan!🥲
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-primary-100 bg-[#fbfbfb] px-5 py-4">
            <button
              className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-full px-5 text-base font-semibold text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-700"
              onClick={() => onExitDialogChange(false)}
              type="button"
            >
              Batal
            </button>
            <button
              className="inline-flex h-10 min-w-[132px] items-center justify-center rounded-full bg-[#ff0008] px-5 text-base font-semibold text-white transition-colors hover:bg-[#e10007]"
              onClick={() => onExit}
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
                aria-label="Keluar dari latihan"
                onClick={() => onExitDialogChange(true)}
                size="icon-sm"
                title="Keluar dari latihan"
                variant="ghost"
              >
                <ChevronLeft />
              </Button>
            </div>
          </div>

          <div className="px-5 py-6">
            <p className="text-xs font-semibold tracking-[0.08em] text-secondary-400 uppercase">
              Navigasi Soal
            </p>
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              {attempt.questions.map((question, index) => {
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

                return (
                  <QuestionMarker
                    key={question.id}
                    marker={{ number, state: markerState }}
                    onClick={() => onGoToQuestion(number)}
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
                <span className="font-semibold tracking-[0.08em] text-primary-700 uppercase">
                  Soal {currentQuestion}
                </span>
                <span className="text-secondary-300">•</span>
                <span className="font-medium text-secondary-400">{subjectTitle}</span>
                <span className="text-secondary-300">|</span>
                <UtilityPill
                  active={viewState.reported}
                  icon={AlertTriangle}
                  label="Laporkan"
                  onClick={onToggleReport}
                />
                <UtilityPill
                  active={viewState.flagged}
                  icon={Flag}
                  label="Tandai"
                  onClick={onToggleFlag}
                />
                <MagnifierButton
                  ariaLabel="Perkecil ukuran font"
                  icon={ZoomOut}
                  onClick={() => onUpdateTextScale("smaller")}
                />
                <MagnifierButton
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
                  <p
                    className={cn(
                      "font-medium text-secondary-900",
                      readingTextClass,
                    )}
                  >
                    {currentQuizQuestion?.prompt}
                  </p>
                  <p className={cn("mt-3 font-medium text-secondary-500", uiTextClass)}>
                    {currentQuizQuestion?.hint}
                  </p>
                </div>

                <div className="grid gap-4">
                  {currentQuizQuestion?.options.map((option) => (
                    <AnswerOption
                      onClick={() => void onSelectAnswer(option.id)}
                      key={option.key}
                      option={option}
                      selected={option.id === currentSelectedOptionKey}
                      disabled={savingQuestionSet.has(currentQuestion) || viewState.submitting}
                    />
                  ))}
                </div>
              </div>
              {message ? <p className="mt-3 text-sm font-medium text-red-600">{message}</p> : null}
            </div>
          </div>

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
        "flex h-12 items-center justify-center rounded-2xl border text-sm font-semibold transition-all duration-200",
        marker.state === "active" &&
          "border-primary-300 bg-primary-50 text-primary-800 shadow-[0_12px_28px_-18px_rgba(1,76,56,0.35)]",
        marker.state === "answered" &&
          "border-primary-200 bg-primary-50 text-primary-800",
        marker.state === "flagged" &&
          "border-[#f4dea2] bg-[#fff6d5] text-[#8a6a00]",
        marker.state === "locked" &&
          "border-primary-100 bg-secondary-50 text-secondary-400",
        marker.state === "empty" &&
          "border-primary-100 bg-white text-secondary-500 hover:border-primary-300 hover:bg-primary-50/60",
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
          ? "bg-primary-50 text-primary-800"
          : "bg-secondary-50 text-secondary-600 hover:bg-primary-50 hover:text-primary-800",
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
  disabled,
  onClick,
  option,
  selected,
}: {
  disabled: boolean;
  onClick: () => void;
  option: { id: string; key: string; text: string };
  selected: boolean;
}) {
  return (
    <button
      className={cn(
        "group flex w-full items-start gap-4 rounded-4xl border bg-white px-5 py-5 text-left shadow-none transition-all duration-200 hover:border-primary-300 hover:bg-primary-50/60 focus-visible:ring-3 focus-visible:ring-primary-400/20 focus-visible:outline-none md:px-6",
        selected ? "border-primary-300 bg-primary-50" : "border-primary-100",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          selected
            ? "border-primary-700 bg-primary-700 text-white"
            : "border-secondary-200 bg-secondary-50 text-secondary-500 group-hover:border-primary-300 group-hover:bg-white",
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
