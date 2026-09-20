"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  CircleHelp,
  LibraryBig,
  Plus,
  Save,
  Trash2,
} from "@/lib/icons";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import { buildMentorQuizEditorHref } from "@/lib/navigation/canonical-context";
import { validateAnswerKey } from "@/lib/question-bank/answer-contract";
import { cn } from "@/lib/utils";
import { QuestionMobileInventoryOption } from "@/modules/mentor/components/question-mobile-inventory-option";
import { QuestionBankPickerDialog } from "@/modules/mentor/components/question-bank-picker";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import {
  acceptStandaloneQuizQuestionUpdateAction,
  saveStandaloneQuizAction,
} from "@/modules/mentor/quiz-actions";
import { kaptenSubjects, type KaptenQuiz } from "@/modules/mentor/mock-data";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MediaAssetPreview } from "@/modules/media/media-library";

type QuizEditorForm = {
  attemptsAllowed: number | null;
  closesAt: string;
  correctAnswerVisibility: NonNullable<KaptenQuiz["correctAnswerVisibility"]>;
  description: string;
  formBehavior: NonNullable<KaptenQuiz["formBehavior"]>;
  opensAt: string;
  questions: QuizQuestionSnapshot[];
  retryDelaySeconds: number | null;
  reviewTiming: NonNullable<KaptenQuiz["reviewTiming"]>;
  scorePolicy: NonNullable<KaptenQuiz["scorePolicy"]>;
  subjectCode: string;
  title: string;
};

function questionTypeFor(question: Pick<QuizQuestionSnapshot, "questionType">) {
  return question.questionType ?? "single_choice";
}

function correctChoiceIdsFor(
  question: Pick<QuizQuestionSnapshot, "correctChoiceId" | "correctChoiceIds">,
) {
  const ids =
    question.correctChoiceIds ??
    (question.correctChoiceId ? [question.correctChoiceId] : []);
  return [...new Set(ids)];
}

function asEditorQuestion(
  question: QuizQuestionSnapshot,
): QuizQuestionSnapshot {
  const correctChoiceIds = correctChoiceIdsFor(question);
  return {
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceId: correctChoiceIds[0] ?? question.correctChoiceId,
    correctChoiceIds,
    explanation: question.explanation,
    explanationMediaAssetId: question.explanationMediaAssetId,
    id: question.id,
    isReady: question.isReady,
    origin: question.origin,
    prompt: question.prompt,
    promptMediaAssetId: question.promptMediaAssetId,
    questionType: questionTypeFor(question),
    sourceContentDigest: question.sourceContentDigest,
    sourceQuestionId: question.sourceQuestionId,
    sourceQuestionRevisionId: question.sourceQuestionRevisionId,
    sourceRevisionProvenance: question.sourceRevisionProvenance,
    sourceUpdate: question.sourceUpdate
      ? {
          ...question.sourceUpdate,
          choices: question.sourceUpdate.choices.map((choice) => ({
            ...choice,
          })),
          correctChoiceIds: [...question.sourceUpdate.correctChoiceIds],
        }
      : undefined,
  };
}

function getInitialForm(
  initialQuiz: KaptenQuiz | null | undefined,
  initialQuestions: QuizQuestionSnapshot[],
  initialSubjectCode?: string,
) {
  const questions = initialQuestions.map(asEditorQuestion);
  return {
    attemptsAllowed: initialQuiz?.attemptsAllowed ?? 1,
    closesAt: initialQuiz?.closesAt ?? "",
    correctAnswerVisibility: initialQuiz?.correctAnswerVisibility ?? "show",
    description: initialQuiz?.description ?? "",
    formBehavior: initialQuiz?.formBehavior ?? "same",
    opensAt: initialQuiz?.opensAt ?? "",
    questions,
    retryDelaySeconds: initialQuiz?.retryDelaySeconds ?? null,
    reviewTiming: initialQuiz?.reviewTiming ?? "immediate",
    scorePolicy: initialQuiz?.scorePolicy ?? "latest",
    subjectCode:
      initialQuiz?.subjectCode ??
      initialSubjectCode ??
      kaptenSubjects[0]?.code ??
      "PU",
    title: initialQuiz?.title ?? "Kuis baru",
  } satisfies QuizEditorForm;
}

function questionIssues(question: QuizQuestionSnapshot) {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push("pertanyaan");
  if (question.choices.length < 2 || question.choices.length > 5)
    issues.push("jumlah opsi");
  if (question.choices.some((choice) => !choice.text.trim()))
    issues.push("teks opsi");
  const correctChoiceIds = correctChoiceIdsFor(question);
  const answerKey = validateAnswerKey(
    questionTypeFor(question),
    question.choices.map((choice) => ({
      id: choice.id,
      isCorrect: correctChoiceIds.includes(choice.id),
    })),
  );
  if (!answerKey.ok) issues.push("jawaban benar");
  return issues;
}

function hasQuizDraftContent(
  form: QuizEditorForm,
  pristineSubjectCode = kaptenSubjects[0]?.code ?? "PU",
) {
  const title = form.title.trim();

  return Boolean(
    (title && title !== "Kuis baru") ||
    form.description.trim() ||
    (form.subjectCode && form.subjectCode !== pristineSubjectCode) ||
    form.opensAt.trim() ||
    form.closesAt.trim() ||
    form.attemptsAllowed !== 1 ||
    form.correctAnswerVisibility !== "show" ||
    form.formBehavior !== "same" ||
    form.retryDelaySeconds !== null ||
    form.reviewTiming !== "immediate" ||
    form.scorePolicy !== "latest" ||
    form.questions.length > 0,
  );
}

function QuestionInventory({
  activeQuestionId,
  disabled,
  onAddFromBank,
  onDelete,
  onMove,
  onSelect,
  sourceBankHref,
  sourceBankTitle,
  questions,
}: {
  activeQuestionId: string | null;
  disabled: boolean;
  onAddFromBank: () => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
  sourceBankHref?: string;
  sourceBankTitle?: string;
  questions: QuizQuestionSnapshot[];
}) {
  const incompleteCount = questions.reduce(
    (count, question) => count + (questionIssues(question).length > 0 ? 1 : 0),
    0,
  );

  return (
    <aside
      aria-labelledby="quiz-inventory-title"
      className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-primary-100 bg-white p-3 md:p-4"
    >
      <div className="flex flex-col items-start gap-3">
        <div className="flex w-full items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className="text-lg font-semibold text-secondary-900"
              id="quiz-inventory-title"
            >
              Inventori soal
            </h2>
            <p className="mt-1 text-xs text-secondary-500">
              {questions.length} soal
              {incompleteCount > 0
                ? ` · ${incompleteCount} perlu diperbaiki`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              aria-label="Tambah soal dari Bank Soal"
              disabled={disabled}
              onClick={onAddFromBank}
              size="sm"
              type="button"
              variant="brandOutline"
            >
              <Plus />
              <span className="hidden lg:inline">Tambah Soal</span>
            </Button>
            {sourceBankHref && sourceBankTitle ? (
              <p className="max-w-[13rem] truncate text-right text-xs text-secondary-500">
                Bank Soal:{" "}
                <Link
                  className="font-semibold text-primary-800 hover:underline"
                  href={sourceBankHref}
                  title={sourceBankTitle}
                >
                  {sourceBankTitle}
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <nav
        aria-label="Navigasi soal"
        className="mt-3 flex min-h-0 flex-1 flex-col"
      >
        <div
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
          id="quiz-inventory-list"
        >
          <ul aria-label="Daftar soal" className="flex flex-col gap-1.5">
            {questions.length > 0 ? (
              questions.map((question, index) => {
                const issueCount = questionIssues(question).length;
                const isActive = activeQuestionId === question.id;
                return (
                  <li
                    className={cn(
                      "group flex min-w-0 items-center gap-1 rounded-xl border border-transparent px-2 py-1.5 transition-colors",
                      isActive
                        ? "border-primary-200 bg-primary-50"
                        : issueCount > 0
                          ? "border-warning-300 bg-warning-50/70 hover:border-warning-400 hover:bg-warning-50"
                          : "hover:border-primary-100 hover:bg-primary-50/60",
                    )}
                    key={question.id}
                  >
                    <button
                      aria-current={isActive ? "true" : undefined}
                      aria-label={`Soal ${index + 1}${issueCount ? `, ${issueCount} masalah` : ""}${isActive ? ", dipilih" : ""}`}
                      className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-primary-200"
                      onClick={() => onSelect(question.id)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal leading-4 text-secondary-900">
                        <span className="min-w-0 flex-1 truncate">
                          {index + 1}.{" "}
                          {question.prompt || "Soal tanpa pertanyaan"}
                        </span>
                      </span>
                      {issueCount > 0 ? (
                        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                          <MentorBadge
                            aria-label={`Soal ${index + 1} memiliki ${issueCount} masalah`}
                            className="size-7 justify-center !px-0 !py-0"
                            role="img"
                            size="xs"
                            title={`Soal ${index + 1} memiliki ${issueCount} masalah`}
                            tone="attention"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                          </MentorBadge>
                        </span>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        aria-label={`Pindah soal ${index + 1} ke atas`}
                        disabled={disabled || index === 0}
                        onClick={() => onMove(question.id, "up")}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={`Pindah soal ${index + 1} ke bawah`}
                        disabled={disabled || index === questions.length - 1}
                        onClick={() => onMove(question.id, "down")}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        aria-label={`Hapus soal ${index + 1}`}
                        disabled={disabled}
                        onClick={() => onDelete(question.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="px-2 py-4 text-sm leading-6 text-secondary-500">
                Belum ada soal dari Bank Soal.
              </li>
            )}
          </ul>
        </div>
      </nav>
    </aside>
  );
}

function QuizMobileInventory({
  activeQuestionId,
  disabled,
  onAddFromBank,
  onSelect,
  sourceBankHref,
  sourceBankTitle,
  questions,
}: {
  activeQuestionId: string | null;
  disabled: boolean;
  onAddFromBank: () => void;
  onSelect: (id: string) => void;
  sourceBankHref?: string;
  sourceBankTitle?: string;
  questions: QuizQuestionSnapshot[];
}) {
  const activeIndex = questions.findIndex(
    (question) => question.id === activeQuestionId,
  );
  const activeQuestion = questions[activeIndex] ?? questions[0];
  const incompleteCount = questions.reduce(
    (count, question) => count + (questionIssues(question).length > 0 ? 1 : 0),
    0,
  );

  return (
    <div className="border-b border-primary-100 bg-voyage-canvas px-3 py-3 shadow-xs md:hidden">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Pilih soal yang sedang ditinjau"
            render={
              <Button
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.select,
                  "min-w-0 flex-1",
                )}
                disabled={questions.length === 0}
                type="button"
                variant="reference"
              />
            }
          >
            <span className="min-w-0 truncate">
              {activeQuestion
                ? `${activeIndex + 1}. ${activeQuestion.prompt || "Soal tanpa pertanyaan"}`
                : "Belum ada soal"}
            </span>
            <ChevronDown className="size-4 shrink-0 text-secondary-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[60vh] w-[calc(100vw-4.5rem)] max-w-sm overflow-y-auto"
          >
            <DropdownMenuLabel>Pilih soal</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={onSelect}
              value={activeQuestionId ?? undefined}
            >
              {questions.map((question, index) => {
                const issueCount = questionIssues(question).length;
                return (
                  <QuestionMobileInventoryOption
                    issueCount={issueCount}
                    key={question.id}
                    prompt={question.prompt}
                    questionNumber={index + 1}
                    value={question.id}
                  />
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            aria-label="Tambah soal dari Bank Soal"
            disabled={disabled}
            onClick={onAddFromBank}
            size="sm"
            type="button"
            variant="brandOutline"
          >
            <Plus />
            <span className="hidden sm:inline">Tambah Soal</span>
          </Button>
          {sourceBankHref && sourceBankTitle ? (
            <p className="max-w-[11rem] truncate text-right text-xs text-secondary-500">
              Bank Soal:{" "}
              <Link
                className="font-semibold text-primary-800 hover:underline"
                href={sourceBankHref}
                title={sourceBankTitle}
              >
                {sourceBankTitle}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-secondary-500">
        <span>{questions.length} soal di Kuis</span>
        {incompleteCount > 0 ? (
          <span className="font-semibold text-warning-900">
            {incompleteCount} perlu diperbaiki
          </span>
        ) : null}
      </div>
    </div>
  );
}

function QuestionPreview({ question }: { question: QuizQuestionSnapshot }) {
  const correctChoiceIds = correctChoiceIdsFor(question);
  return (
    <ReferenceSurface as="section" className="min-w-0 p-5 md:p-7">
      <h3 className="text-xl leading-8 font-semibold text-secondary-900">
        {question.prompt || "Pertanyaan akan tampil di sini."}
      </h3>
      {question.promptMediaAssetId ? (
        <MediaAssetPreview
          alt="Gambar pertanyaan"
          assetId={question.promptMediaAssetId}
          className="mt-5"
        />
      ) : null}
      <div className="mt-6 grid gap-3">
        {question.choices.map((choice, index) => (
          <div
            className="rounded-xl border border-primary-100 bg-secondary-50/40 p-4"
            key={choice.id}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center border text-xs font-bold uppercase",
                  questionTypeFor(question) === "multiple_choice"
                    ? "rounded-md"
                    : "rounded-full",
                  correctChoiceIds.includes(choice.id)
                    ? "border-primary-700 bg-primary-700 text-white"
                    : "border-primary-200 bg-primary-50 text-primary-800",
                )}
              >
                {String.fromCharCode(65 + index)}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-6 text-secondary-800">
                {choice.text || `Opsi ${String.fromCharCode(65 + index)}`}
                {choice.mediaAssetId ? (
                  <MediaAssetPreview
                    alt={`Gambar opsi ${String.fromCharCode(65 + index)}`}
                    assetId={choice.mediaAssetId}
                    className="mt-3 max-h-44"
                  />
                ) : null}
              </span>
            </div>
          </div>
        ))}
      </div>
      {question.explanation ? (
        <div className="mt-6 pt-5">
          <h4 className="text-sm font-semibold text-secondary-900">
            Penjelasan
          </h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary-600">
            {question.explanation}
          </p>
          {question.explanationMediaAssetId ? (
            <MediaAssetPreview
              alt="Gambar penjelasan"
              assetId={question.explanationMediaAssetId}
              className="mt-4"
            />
          ) : null}
        </div>
      ) : null}
    </ReferenceSurface>
  );
}

type QuizEditorChangeMarker = (nextForm?: QuizEditorForm) => void;

function useQuizEditorNavigation({
  hasUnsavedChanges,
  pendingRouteReplacement,
  router,
  setPendingExitRoute,
}: {
  hasUnsavedChanges: boolean;
  pendingRouteReplacement: string | null;
  router: ReturnType<typeof useRouter>;
  setPendingExitRoute: (route: string | null) => void;
}) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) return;
    const frame = window.requestAnimationFrame(() =>
      router.replace(pendingRouteReplacement),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);

  const requestExit = useCallback(
    (route: string) => {
      if (hasUnsavedChanges) {
        setPendingExitRoute(route);
        return;
      }
      router.push(route);
    },
    [hasUnsavedChanges, router, setPendingExitRoute],
  );

  return { requestExit };
}

function useQuizEditorQuestionListActions({
  activeQuestionId,
  editorDisabled,
  form,
  markChanged,
  setActiveQuestionId,
  setForm,
  setPendingDeleteId,
}: {
  activeQuestionId: string | null;
  editorDisabled: boolean;
  form: QuizEditorForm;
  markChanged: QuizEditorChangeMarker;
  setActiveQuestionId: (id: string | null) => void;
  setForm: (form: QuizEditorForm) => void;
  setPendingDeleteId: (id: string | null) => void;
}) {
  const removeQuestion = useCallback(
    (questionId: string) => {
      if (editorDisabled) return;
      const nextQuestions = form.questions.filter(
        (question) => question.id !== questionId,
      );
      const nextForm = { ...form, questions: nextQuestions };
      setForm(nextForm);
      if (activeQuestionId === questionId) {
        const next =
          nextQuestions[
            Math.max(
              0,
              form.questions.findIndex(
                (question) => question.id === questionId,
              ) - 1,
            )
          ] ??
          nextQuestions[0] ??
          null;
        setActiveQuestionId(next?.id ?? null);
      }
      setPendingDeleteId(null);
      markChanged(nextForm);
    },
    [
      activeQuestionId,
      editorDisabled,
      form,
      markChanged,
      setActiveQuestionId,
      setForm,
      setPendingDeleteId,
    ],
  );

  const moveQuestion = useCallback(
    (questionId: string, direction: "up" | "down") => {
      if (editorDisabled) return;
      const index = form.questions.findIndex(
        (question) => question.id === questionId,
      );
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= form.questions.length)
        return;
      const questions = [...form.questions];
      const [moved] = questions.splice(index, 1);
      if (!moved) return;
      questions.splice(nextIndex, 0, moved);
      const nextForm = { ...form, questions };
      setForm(nextForm);
      markChanged(nextForm);
    },
    [editorDisabled, form, markChanged, setForm],
  );

  return { moveQuestion, removeQuestion };
}

function useQuizEditorPersistence({
  activeQuestionId,
  editorDisabled,
  form,
  isSaving,
  mode,
  quizId,
  savedQuiz,
  setIsSaving,
  setPendingRouteReplacement,
  setSaveError,
  setActiveQuestionId,
  setForm,
  setSavedQuiz,
  setHasUnsavedChanges,
}: {
  activeQuestionId: string | null;
  editorDisabled: boolean;
  form: QuizEditorForm;
  isSaving: boolean;
  mode: "create" | "edit";
  quizId?: string;
  savedQuiz: KaptenQuiz | null;
  setIsSaving: (saving: boolean) => void;
  setPendingRouteReplacement: (route: string | null) => void;
  setSaveError: (error: string | null) => void;
  setActiveQuestionId: (id: string | null) => void;
  setForm: Dispatch<SetStateAction<QuizEditorForm>>;
  setSavedQuiz: (quiz: KaptenQuiz | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
}) {
  const publishRequestIdRef = useRef<string | null>(null);
  const saveQuiz = useCallback(async () => {
    if (isSaving || editorDisabled) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const shouldPublish = savedQuiz?.status === "published";
      if (shouldPublish && !publishRequestIdRef.current)
        publishRequestIdRef.current = crypto.randomUUID();
      const result = await saveStandaloneQuizAction({
        attemptsAllowed: form.attemptsAllowed,
        closesAt: form.closesAt,
        correctAnswerVisibility: form.correctAnswerVisibility,
        description: form.description,
        expectedDraftRevision: savedQuiz?.draftRevision,
        formBehavior: form.formBehavior,
        id: savedQuiz?.id ?? quizId,
        opensAt: form.opensAt,
        publishRequestId: shouldPublish ? publishRequestIdRef.current : null,
        questions: mode === "create" ? [] : form.questions,
        retryDelaySeconds: form.retryDelaySeconds,
        reviewTiming: form.reviewTiming,
        scorePolicy: form.scorePolicy,
        status: shouldPublish ? "published" : "draft",
        subjectCode: form.subjectCode,
        title: form.title,
      });
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      const canonicalQuestions = result.questions.map(asEditorQuestion);
      const activeQuestionIndex = form.questions.findIndex(
        (question) => question.id === activeQuestionId,
      );
      setForm((current) => ({ ...current, questions: canonicalQuestions }));
      setActiveQuestionId(
        canonicalQuestions[activeQuestionIndex]?.id ??
          canonicalQuestions[0]?.id ??
          null,
      );
      setSavedQuiz(result.quiz);
      publishRequestIdRef.current = null;
      setHasUnsavedChanges(false);
      setSaveError(null);
      showToast("Perubahan Kuis tersimpan.", { variant: "success" });
      if (!quizId)
        setPendingRouteReplacement(
          buildMentorQuizEditorHref(result.quiz.id, form.subjectCode),
        );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Kuis belum dapat disimpan.",
        { variant: "error" },
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    activeQuestionId,
    editorDisabled,
    form,
    isSaving,
    mode,
    quizId,
    savedQuiz,
    setHasUnsavedChanges,
    setIsSaving,
    setPendingRouteReplacement,
    setSaveError,
    setActiveQuestionId,
    setForm,
    setSavedQuiz,
  ]);

  return { saveQuiz };
}

function useQuizEditorState({
  initialQuestions,
  initialQuiz,
  initialSubjectCode,
  mode,
  quizId,
}: {
  initialQuestions: QuizQuestionSnapshot[];
  initialQuiz: KaptenQuiz | null;
  initialSubjectCode?: string;
  mode: "create" | "edit";
  quizId?: string;
}) {
  const router = useRouter();
  const pristineSubjectCode =
    initialQuiz?.subjectCode ??
    initialSubjectCode ??
    kaptenSubjects[0]?.code ??
    "PU";
  const initialForm = useState<QuizEditorForm>(() =>
    getInitialForm(initialQuiz, initialQuestions, initialSubjectCode),
  )[0];
  const [form, setForm] = useState<QuizEditorForm>(initialForm);
  const [savedQuiz, setSavedQuiz] = useState<KaptenQuiz | null>(initialQuiz);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    initialForm.questions[0]?.id ?? null,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(
    mode === "create" &&
      hasQuizDraftContent(initialForm, pristineSubjectCode),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingExitRoute, setPendingExitRoute] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<
    string | null
  >(null);
  const [questionBankPickerOpen, setQuestionBankPickerOpen] = useState(false);
  const [acceptingUpdateQuestionId, setAcceptingUpdateQuestionId] = useState<
    string | null
  >(null);
  const autoAppliedUpdateKeysRef = useRef(new Set<string>());
  const activeQuestion = useMemo(
    () =>
      form.questions.find((question) => question.id === activeQuestionId) ??
      null,
    [activeQuestionId, form.questions],
  );
  const editorDisabled = savedQuiz?.status === "archived";
  const scheduleError =
    form.opensAt &&
    form.closesAt &&
    new Date(form.closesAt) <= new Date(form.opensAt)
      ? "Waktu tutup harus setelah waktu buka."
      : null;

  const markChanged = useCallback(
    (nextForm = form) => {
      setHasUnsavedChanges(
        mode === "create"
          ? hasQuizDraftContent(nextForm, pristineSubjectCode)
          : true,
      );
      setSaveError(null);
    },
    [form, mode, pristineSubjectCode],
  );

  const patchForm = useCallback(
    (patch: Partial<QuizEditorForm>) => {
      const nextForm = { ...form, ...patch };
      setForm(nextForm);
      markChanged(nextForm);
    },
    [form, markChanged],
  );
  const replaceImportedQuestions = useCallback(
    (questions: QuizQuestionSnapshot[], quiz: KaptenQuiz) => {
      setForm((current) => ({ ...current, questions }));
      setSavedQuiz(quiz);
      setActiveQuestionId(questions[0]?.id ?? null);
      setHasUnsavedChanges(false);
      setSaveError(null);
      showToast("Soal dari Bank Soal ditambahkan ke Kuis.", {
        variant: "success",
      });
    },
    [],
  );
  const acceptSourceUpdate = useCallback(
    async (question: QuizQuestionSnapshot) => {
      if (
        acceptingUpdateQuestionId ||
        !savedQuiz?.id ||
        savedQuiz.status === "archived" ||
        !question.sourceUpdate ||
        !question.sourceQuestionRevisionId ||
        !question.sourceContentDigest
      )
        return false;
      const sourceUpdate = question.sourceUpdate;
      const hadUnsavedChanges = hasUnsavedChanges;
      setAcceptingUpdateQuestionId(question.id);
      setSaveError(null);
      try {
        const result = await acceptStandaloneQuizQuestionUpdateAction({
          expectedCurrentContentDigest: question.sourceContentDigest,
          expectedCurrentRevisionId: question.sourceQuestionRevisionId,
          quizId: savedQuiz.id,
          quizItemId: question.id,
          targetContentDigest: sourceUpdate.sourceContentDigest,
          targetRevisionId: sourceUpdate.sourceQuestionRevisionId,
        });
        if (!result.ok) {
          showToast(result.message, { variant: "error" });
          return false;
        }
        const updatedQuestion = result.questions.find(
          (candidate) => candidate.id === question.id,
        );
        const versionedUpdatedQuestion =
          updatedQuestion ??
          result.questions.find(
            (candidate) =>
              candidate.sourceQuestionId === question.sourceQuestionId &&
              candidate.sourceQuestionRevisionId ===
                sourceUpdate.sourceQuestionRevisionId,
          );
        if (versionedUpdatedQuestion) {
          const persistedBySourceQuestionId = new Map(
            result.questions
              .filter((candidate) => candidate.sourceQuestionId)
              .map((candidate) => [candidate.sourceQuestionId, candidate]),
          );
          setForm((current) => ({
            ...current,
            questions: current.questions.map((candidate) => {
              if (candidate.id === question.id)
                return asEditorQuestion(versionedUpdatedQuestion);
              const persisted = candidate.sourceQuestionId
                ? persistedBySourceQuestionId.get(candidate.sourceQuestionId)
                : undefined;
              return persisted ? { ...candidate, id: persisted.id } : candidate;
            }),
          }));
          setActiveQuestionId((current) =>
            current === question.id ? versionedUpdatedQuestion.id : current,
          );
        }
        setSavedQuiz(result.quiz);
        setHasUnsavedChanges(hadUnsavedChanges);
        setSaveError(null);
        showToast("Revisi Bank Soal otomatis diterapkan ke draf Kuis.", {
          variant: "success",
        });
        return true;
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : "Revisi soal belum dapat diterapkan.",
          { variant: "error" },
        );
        return false;
      } finally {
        setAcceptingUpdateQuestionId(null);
      }
    },
    [
      acceptingUpdateQuestionId,
      hasUnsavedChanges,
      savedQuiz,
      setForm,
      setHasUnsavedChanges,
      setSaveError,
      setSavedQuiz,
    ],
  );
  useEffect(() => {
    if (
      mode !== "edit" ||
      editorDisabled ||
      !savedQuiz?.id ||
      isSaving ||
      acceptingUpdateQuestionId
    ) {
      return;
    }
    const pending = form.questions.find((question) => {
      const update = question.sourceUpdate;
      if (
        !update ||
        !question.sourceQuestionRevisionId ||
        !question.sourceContentDigest
      ) {
        return false;
      }
      const key = `${question.id}:${update.sourceQuestionRevisionId}:${update.sourceContentDigest}`;
      return !autoAppliedUpdateKeysRef.current.has(key);
    });
    if (!pending?.sourceUpdate) return;
    const key = `${pending.id}:${pending.sourceUpdate.sourceQuestionRevisionId}:${pending.sourceUpdate.sourceContentDigest}`;
    autoAppliedUpdateKeysRef.current.add(key);
    void acceptSourceUpdate(pending);
  }, [
    acceptingUpdateQuestionId,
    acceptSourceUpdate,
    editorDisabled,
    form.questions,
    isSaving,
    mode,
    savedQuiz?.id,
  ]);
  const navigation = useQuizEditorNavigation({
    hasUnsavedChanges,
    pendingRouteReplacement,
    router,
    setPendingExitRoute,
  });
  const questionActions = useQuizEditorQuestionListActions({
    activeQuestionId,
    editorDisabled,
    form,
    markChanged,
    setActiveQuestionId,
    setForm,
    setPendingDeleteId,
  });
  const persistence = useQuizEditorPersistence({
    activeQuestionId,
    editorDisabled,
    form,
    isSaving,
    mode,
    quizId,
    savedQuiz,
    setHasUnsavedChanges,
    setIsSaving,
    setPendingRouteReplacement,
    setSaveError,
    setActiveQuestionId,
    setForm,
    setSavedQuiz,
  });

  return {
    activeQuestion,
    activeQuestionId,
    acceptingUpdateQuestionId,
    acceptSourceUpdate,
    editorDisabled,
    form,
    hasUnsavedChanges,
    isSaving,
    navigation,
    pendingDeleteId,
    pendingExitRoute,
    patchForm,
    persistence,
    questionBankPickerOpen,
    questionActions,
    saveError,
    savedQuiz,
    scheduleError,
    setActiveQuestionId,
    setPendingDeleteId,
    setPendingExitRoute,
    setQuestionBankPickerOpen,
    replaceImportedQuestions,
    router,
  };
}

type QuizEditorState = ReturnType<typeof useQuizEditorState>;

function QuizEditorFeedback({ scheduleError }: Pick<QuizEditorState, "scheduleError">) {
  return (
    <>
      {scheduleError ? (
        <p
          className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
          role="alert"
        >
          {scheduleError}
        </p>
      ) : null}
    </>
  );
}

function QuizEditHeader({
  quizId,
  state,
  subject,
}: {
  quizId?: string;
  state: QuizEditorState;
  subject?: (typeof kaptenSubjects)[number];
}) {
  return (
    <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-100 bg-voyage-canvas/95 px-3 py-2 shadow-[0_10px_24px_-24px_color-mix(in_oklab,var(--voyage-forest)_42%,transparent)] backdrop-blur-xl md:h-14 md:flex-nowrap md:px-6 md:py-0">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <Button
          aria-label="Kembali ke detail Kuis"
          onClick={() => state.navigation.requestExit(`/mentor/quiz/${quizId}`)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="max-w-[150px] truncate text-base font-bold text-secondary-900 sm:max-w-xs md:max-w-md">
            {state.form.title || "Kuis"}
          </h1>
          {state.hasUnsavedChanges ? (
            <ReferenceStatusBadge
              appearance="mentor"
              label="Belum disimpan"
              size="xs"
              status="need_help"
            />
          ) : null}
          {subject ? (
            <MentorBadge
              className="hidden sm:inline-flex"
              size="xs"
              tone="category"
            >
              {subject.code}
            </MentorBadge>
          ) : null}
        </div>
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
        <Button
          aria-busy={state.isSaving}
          aria-label="Simpan"
          disabled={state.isSaving || state.editorDisabled}
          onClick={() => void state.persistence.saveQuiz()}
          size="sm"
          title="Simpan perubahan"
          type="button"
          variant="brand"
        >
          <Save />
          {state.isSaving ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
    </header>
  );
}

function QuizEditQuestionArea({ state }: { state: QuizEditorState }) {
  const selectQuestion = (id: string) => {
    state.setActiveQuestionId(id);
  };
  const hasQuestions = state.form.questions.length > 0;
  const questionEditor = state.activeQuestion ? (
    <div
      className="flex min-w-0 flex-col gap-4"
      data-quiz-question-content-editor="disabled"
    >
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-secondary-900">Preview Soal</h2>
      </div>
      <QuestionPreview question={state.activeQuestion} />
    </div>
  ) : (
    <ReferenceSurface
      className="grid min-h-72 place-items-center p-8 text-center"
      data-quiz-question-empty={hasQuestions ? undefined : "true"}
      variant="inset"
    >
      <ReferenceEmptyState
        action={
          !hasQuestions && !state.editorDisabled ? (
            <Button
              aria-label="Tambah soal dari Bank Soal"
              onClick={() => state.setQuestionBankPickerOpen(true)}
              size="sm"
              type="button"
              variant="brand"
            >
              <Plus />
              Tambah dari Bank Soal
            </Button>
          ) : undefined
        }
        description={
          hasQuestions
            ? "Pilih soal dari daftar untuk meninjau isinya."
            : "Pilih soal dari Bank Soal untuk mulai menyusun Kuis."
        }
        icon={hasQuestions ? CircleHelp : LibraryBig}
        title={
          hasQuestions
            ? "Pilih soal untuk ditinjau"
            : "Belum ada soal di Kuis ini"
        }
      />
    </ReferenceSurface>
  );

  return (
    <>
      <QuizMobileInventory
        activeQuestionId={state.activeQuestionId}
        disabled={state.editorDisabled}
        onAddFromBank={() => state.setQuestionBankPickerOpen(true)}
        onSelect={selectQuestion}
        sourceBankHref={
          state.savedQuiz?.sourceBankId
            ? `/mentor/quiz/question-bank/${state.savedQuiz.sourceBankId}?purpose=quiz`
            : undefined
        }
        sourceBankTitle={state.savedQuiz?.sourceBank}
        questions={state.form.questions}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-72 shrink-0 overflow-y-auto border-r border-primary-100 bg-white md:flex md:flex-col lg:w-80 [&_aside]:rounded-none [&_aside]:border-0 [&_aside]:shadow-none">
          <QuestionInventory
            activeQuestionId={state.activeQuestionId}
            disabled={state.editorDisabled}
            onAddFromBank={() => state.setQuestionBankPickerOpen(true)}
            onDelete={state.setPendingDeleteId}
            onMove={state.questionActions.moveQuestion}
            onSelect={selectQuestion}
            sourceBankHref={
              state.savedQuiz?.sourceBankId
                ? `/mentor/quiz/question-bank/${state.savedQuiz.sourceBankId}?purpose=quiz`
                : undefined
            }
            sourceBankTitle={state.savedQuiz?.sourceBank}
            questions={state.form.questions}
          />
        </div>
        <main className="flex-1 overflow-y-auto bg-voyage-canvas p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-4xl space-y-6">{questionEditor}</div>
        </main>
      </div>
    </>
  );
}
function QuizEditorDialogs({ state }: { state: QuizEditorState }) {
  return (
    <>
      <QuestionBankPickerDialog
        expectedDraftRevision={state.savedQuiz?.draftRevision}
        key={`${state.questionBankPickerOpen ? "open" : "closed"}-${state.savedQuiz?.sourceBankId ?? "none"}`}
        currentQuestions={state.form.questions}
        disabled={state.editorDisabled}
        onImported={state.replaceImportedQuestions}
        onOpenChange={state.setQuestionBankPickerOpen}
        open={state.questionBankPickerOpen}
        quizId={state.savedQuiz?.id}
        sourceBankId={state.savedQuiz?.sourceBankId}
        subjectCode={state.form.subjectCode}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) state.setPendingDeleteId(null);
        }}
        open={Boolean(state.pendingDeleteId)}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Hapus soal ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Soal akan dihapus dari Kuis ini. Bank atau sumber lain tidak akan
              berubah.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => state.setPendingDeleteId(null)}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (state.pendingDeleteId)
                  state.questionActions.removeQuestion(state.pendingDeleteId);
              }}
              variant="destructive"
            >
              Hapus soal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) state.setPendingExitRoute(null);
        }}
        open={Boolean(state.pendingExitRoute)}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              <CircleHelp />
            </AlertDialogMedia>
            <AlertDialogTitle>Keluar tanpa menyimpan?</AlertDialogTitle>
            <AlertDialogDescription>
              Perubahan Kuis yang belum disimpan akan hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => state.setPendingExitRoute(null)}>
              Tetap di editor
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const route = state.pendingExitRoute;
                state.setPendingExitRoute(null);
                if (route) state.router.push(route);
              }}
              variant="destructive"
            >
              Keluar tanpa menyimpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuizEditWorkspace({
  quizId,
  state,
}: {
  quizId?: string;
  state: QuizEditorState;
}) {
  const subject = kaptenSubjects.find(
    (item) => item.code === state.form.subjectCode,
  );
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-voyage-canvas"
      data-quiz-editor-shell="full-page"
    >
      <QuizEditHeader quizId={quizId} state={state} subject={subject} />
      <QuizEditorFeedback scheduleError={state.scheduleError} />
      <QuizEditQuestionArea state={state} />
      <QuizEditorDialogs state={state} />
    </div>
  );
}

function QuizCreateHeader() {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button
        aria-label="Kembali ke daftar Kuis"
        className="mt-1 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
        nativeButton={false}
        render={<Link href="/mentor/quiz" />}
        size="icon"
        title="Kembali ke daftar Kuis"
        variant="ghost"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Button>
      <ReferencePageHeader
        className="min-w-0 flex-1"
        title="Kuis baru"
      />
    </div>
  );
}

function QuizCreateSubmitButton({ state }: { state: QuizEditorState }) {
  return (
    <div className="w-full">
      <Button
        aria-busy={state.isSaving}
        aria-label="Buat"
        className="w-full"
        disabled={state.isSaving || state.editorDisabled}
        onClick={() => void state.persistence.saveQuiz()}
        type="button"
        variant="brand"
      >
        <Save /> {state.isSaving ? "Membuat…" : "Buat"}
      </Button>
    </div>
  );
}

function QuizCreateFields({ state }: { state: QuizEditorState }) {
  return (
    <ReferenceSurface
      as="section"
      className="grid gap-5 p-5 md:p-7"
    >
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="quiz-editor-title"
          required
        >
          Judul Kuis
        </FieldLabel>
        <FieldInput
          className={REFERENCE_CONTROL_CLASS_NAMES.input}
          disabled={state.editorDisabled}
          id="quiz-editor-title"
          onChange={(event) => state.patchForm({ title: event.target.value })}
          value={state.form.title}
        />
      </Field>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="quiz-editor-subject"
          required
        >
          Subjek
        </FieldLabel>
        <ReferenceSelect
          disabled={state.editorDisabled}
          id="quiz-editor-subject"
          onValueChange={(value) => state.patchForm({ subjectCode: value })}
          options={kaptenSubjects.map((subject) => ({
            label: `${subject.code} · ${subject.name}`,
            value: subject.code,
          }))}
          placeholder="Pilih subjek"
          value={state.form.subjectCode}
        />
      </Field>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="quiz-editor-description"
        >
          Deskripsi
        </FieldLabel>
        <FieldTextarea
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[96px]`}
          disabled={state.editorDisabled}
          id="quiz-editor-description"
          onChange={(event) =>
            state.patchForm({ description: event.target.value })
          }
          value={state.form.description}
        />
      </Field>
    </ReferenceSurface>
  );
}

function QuizCreateWorkspace({
  session,
  state,
}: {
  session: SessionContext;
  state: QuizEditorState;
}) {
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Buat Kuis"
      contentElement="div"
      mainClassName="max-w-[1500px] gap-6"
      onNavigateAway={() => !state.hasUnsavedChanges}
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
      shouldGuardNavigation={state.hasUnsavedChanges}
    >
      <QuizCreateHeader />
      <QuizEditorFeedback scheduleError={state.scheduleError} />
      <QuizCreateFields state={state} />
      <QuizCreateSubmitButton state={state} />
    </MentorWorkspaceShell>
  );
}

function KaptenQuizEditorPageModule({
  initialQuestions = [],
  initialQuiz = null,
  initialSubjectCode,
  mode,
  quizId,
  session,
}: {
  initialQuestions?: QuizQuestionSnapshot[];
  initialQuiz?: KaptenQuiz | null;
  initialSubjectCode?: string;
  mode: "create" | "edit";
  quizId?: string;
  session: SessionContext;
}) {
  const state = useQuizEditorState({
    initialQuestions,
    initialQuiz,
    initialSubjectCode,
    mode,
    quizId,
  });
  return mode === "edit" ? (
    <QuizEditWorkspace quizId={quizId} state={state} />
  ) : (
    <QuizCreateWorkspace session={session} state={state} />
  );

  /* legacy edit workspace removed */
}

export { KaptenQuizEditorPageModule };
