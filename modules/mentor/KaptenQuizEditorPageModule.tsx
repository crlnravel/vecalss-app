"use client";

import Link from "next/link";
import { quizDashboardReturnHref } from "@/modules/mentor/quiz-dashboard-contract";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  CircleHelp,
  LibraryBig,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "@/lib/icons";
import {
  type Dispatch,
  type ReactNode,
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
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import type { SessionContext } from "@/lib/auth/types";
import { buildMentorQuizEditorHref } from "@/lib/navigation/canonical-context";
import { validateAnswerKey } from "@/lib/question-bank/answer-contract";
import { asQuizOwnedQuestion } from "@/lib/quiz/question-ownership";
import {
  QuestionContentEditor as QuizQuestionEditor,
} from "@/modules/mentor/components/question-content-editor";
import {
  correctChoiceIdsFor,
  questionTypeFor,
  setQuestionMediaAsset,
  type EditorQuestion as QuizEditorQuestion,
  type QuestionMediaTarget as QuizQuestionMediaTarget,
} from "@/modules/mentor/components/question-content-editor-helpers";
import {
  QuestionEditorPageShell,
  QuestionEditorWorkspace,
} from "@/modules/mentor/components/question-editor-workspace";
import { QuizMobileInventory, QuizQuestionInventory } from "@/modules/mentor/components/quiz-question-inventory";
import { getQuizQuestionBankContext } from "@/modules/mentor/components/quiz-question-bank-context";
import { QuestionBankPickerDialog } from "@/modules/mentor/components/question-bank-picker";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import {
  saveStandaloneQuizAction,
} from "@/modules/mentor/quiz-actions";
import { kaptenSubjects, type KaptenQuiz } from "@/modules/mentor/mock-data";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  MediaPickerDialog,
} from "@/modules/media/media-library";
import {
  ResourceAuthoringLockBanner,
  type AuthoringLockState,
} from "@/modules/mentor/components/resource-authoring-lock-banner";
import {
  ResourceEditLockProvider,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";

type QuizEditorForm = {
  attemptsAllowed: number | null;
  closesAt: string;
  correctAnswerVisibility: NonNullable<KaptenQuiz["correctAnswerVisibility"]>;
  description: string;
  formBehavior: NonNullable<KaptenQuiz["formBehavior"]>;
  opensAt: string;
  questions: QuizEditorQuestion[];
  retryDelaySeconds: number | null;
  reviewTiming: NonNullable<KaptenQuiz["reviewTiming"]>;
  scorePolicy: NonNullable<KaptenQuiz["scorePolicy"]>;
  subjectCode: string;
  title: string;
};

function asEditorQuestion(question: QuizQuestionSnapshot): QuizEditorQuestion {
  question = asQuizOwnedQuestion(question);
  const correctChoiceIds = correctChoiceIdsFor(question);
  return {
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceId: correctChoiceIds[0] ?? question.correctChoiceId,
    correctChoiceIds,
    difficulty: question.difficulty ?? "medium",
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
  const correctChoiceIdSet = new Set(correctChoiceIds);
  const answerKey = validateAnswerKey(
    questionTypeFor(question),
    question.choices.map((choice) => ({
      id: choice.id,
      isCorrect: correctChoiceIdSet.has(choice.id),
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

  const reorderQuestion = useCallback(
    (questionId: string, targetId: string) => {
      if (editorDisabled || questionId === targetId) return;
      const from = form.questions.findIndex((question) => question.id === questionId);
      const to = form.questions.findIndex((question) => question.id === targetId);
      if (from < 0 || to < 0) return;
      const questions = [...form.questions];
      const [moved] = questions.splice(from, 1);
      questions.splice(to, 0, moved);
      const nextForm = { ...form, questions };
      setForm(nextForm);
      markChanged(nextForm);
    },
    [editorDisabled, form, markChanged, setForm],
  );

  return { removeQuestion, reorderQuestion };
}

function useQuizEditorPersistence({
  activeQuestionId,
  editorDisabled,
  editLease,
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
  editLease?: import("@/lib/serialization/authoring-lease").AuthoringEditLease;
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
      if (savedQuiz && !publishRequestIdRef.current)
        publishRequestIdRef.current = crypto.randomUUID();
      const result = await saveStandaloneQuizAction({
        attemptsAllowed: form.attemptsAllowed,
        closesAt: form.closesAt,
        correctAnswerVisibility: form.correctAnswerVisibility,
        description: form.description,
        editLease,
        expectedDraftRevision: savedQuiz?.draftRevision,
        formBehavior: form.formBehavior,
        id: savedQuiz?.id ?? quizId,
        opensAt: form.opensAt,
        publishRequestId: publishRequestIdRef.current,
        questions: mode === "create" ? [] : form.questions,
        questionOwnership: "quiz",
        retryDelaySeconds: form.retryDelaySeconds,
        reviewTiming: form.reviewTiming,
        scorePolicy: form.scorePolicy,
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
    editLease,
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
  const resourceLock = useResourceEditLock();
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
    mode === "create" && hasQuizDraftContent(initialForm, pristineSubjectCode),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingExitRoute, setPendingExitRoute] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<
    string | null
  >(null);
  const [questionBankPickerOpen, setQuestionBankPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] =
    useState<QuizQuestionMediaTarget | null>(null);
  const activeQuestion = useMemo(
    () =>
      form.questions.find((question) => question.id === activeQuestionId) ??
      null,
    [activeQuestionId, form.questions],
  );
  const editorDisabled =
    savedQuiz?.status === "archived" ||
    (mode === "edit" && !resourceLock.canEdit);
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
  const updateQuestion = useCallback(
    (
      questionId: string,
      update: (current: QuizEditorQuestion) => QuizEditorQuestion,
    ) => {
      if (editorDisabled) return;
      const nextForm = {
        ...form,
        questions: form.questions.map((question) =>
          question.id === questionId ? update(question) : question,
        ),
      };
      setForm(nextForm);
      markChanged(nextForm);
    },
    [editorDisabled, form, markChanged],
  );
  const applySelectedMedia = useCallback(
    (assetId: string) => {
      if (!mediaPickerTarget) return;
      updateQuestion(mediaPickerTarget.questionId, (question) =>
        setQuestionMediaAsset(question, mediaPickerTarget, assetId),
      );
    },
    [mediaPickerTarget, updateQuestion],
  );
  const appendImportedQuestions = useCallback(
    (questions: QuizQuestionSnapshot[], importedCount: number) => {
      const editorQuestions = questions.map(asEditorQuestion);
      if (!editorQuestions.length) return;
      setForm((current) => ({
        ...current,
        questions: [...current.questions, ...editorQuestions],
      }));
      setActiveQuestionId(editorQuestions[0]?.id ?? null);
      setHasUnsavedChanges(true);
      setSaveError(null);
      showToast(`${importedCount} soal ditambahkan ke Kuis.`, {
        variant: "success",
      });
    },
    [],
  );
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
    editLease: mode === "edit" ? (resourceLock.proof ?? undefined) : undefined,
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
    editorDisabled,
    form,
    hasUnsavedChanges,
    isSaving,
    navigation,
    pendingDeleteId,
    pendingExitRoute,
    patchForm,
    updateQuestion,
    applySelectedMedia,
    persistence,
    editLease: resourceLock.proof ?? undefined,
    questionBankPickerOpen,
    questionActions,
    saveError,
    savedQuiz,
    scheduleError,
    lockState: (mode === "create"
      ? "owned"
      : resourceLock.state) as AuthoringLockState,
    retryLock: resourceLock.retry,
    setActiveQuestionId,
    setPendingDeleteId,
    setPendingExitRoute,
    setQuestionBankPickerOpen,
    mediaPickerTarget,
    setMediaPickerTarget,
    appendImportedQuestions,
    router,
  };
}

type QuizEditorState = ReturnType<typeof useQuizEditorState>;

function isQuizBankPickerDisabled(state: QuizEditorState) {
  return (
    state.editorDisabled ||
    !state.savedQuiz ||
    !state.editLease ||
    state.savedQuiz.sourceMode === "assembly"
  );
}

function QuizEditorFeedback({
  scheduleError,
}: Pick<QuizEditorState, "scheduleError">) {
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
  const searchParams = useSearchParams();
  const returnHref = quizDashboardReturnHref(searchParams.get("returnTo"));
  const [titleEditorOpen, setTitleEditorOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(state.form.title);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setTitleDraft(state.form.title);
        setTitleEditorOpen(open);
      }}
      open={titleEditorOpen}
    >
      <header className="z-10 flex min-h-24 shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-primary-100 bg-voyage-canvas/95 px-4 py-4 shadow-[0_10px_24px_-24px_color-mix(in_oklab,var(--voyage-forest)_42%,transparent)] backdrop-blur-xl md:flex-nowrap md:px-6" data-quiz-editor-header="true">
        <span className="sr-only" role="status">{state.hasUnsavedChanges ? "Ada perubahan belum tersimpan" : ""}</span>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button
            aria-label="Kembali ke detail Kuis"
            onClick={() => state.navigation.requestExit(`/mentor/quiz/${quizId}?returnTo=${encodeURIComponent(returnHref)}`)}
            size="icon"
            type="button"
            variant="quiet"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <h1 className="min-w-0 truncate text-base font-bold text-secondary-900 md:text-lg">{state.form.title || "Kuis"}</h1>
              <Tooltip>
                <TooltipTrigger render={
                  <DialogTrigger render={
                    <Button aria-label="Ubah judul Kuis" className="w-10 px-0 max-md:size-11" disabled={state.editorDisabled || state.isSaving} size="xs" type="button" variant="quiet">
                      <Pencil aria-hidden="true" />
                    </Button>
                  } />
                } />
                <TooltipContent>Ubah judul Kuis</TooltipContent>
              </Tooltip>
              {state.hasUnsavedChanges ? (
                <Tooltip>
                  <TooltipTrigger render={
                    <span aria-label="Ada perubahan belum tersimpan" className="inline-flex size-10 shrink-0 items-center justify-center rounded-control outline-none focus-visible:ring-3 focus-visible:ring-voyage-leaf/35 max-md:size-11" role="img" tabIndex={0}>
                      <span aria-hidden="true" className="size-2 rounded-full bg-student-status-attention-solid-bg" />
                    </span>
                  } />
                  <TooltipContent>Ada perubahan belum tersimpan</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            {subject ? <Badge className="mt-1 max-w-full truncate" size="sm" tone="category">{subject.name}</Badge> : null}
          </div>
        </div>
        <div className="flex w-full shrink-0 justify-end md:w-auto">
          <Button aria-busy={state.isSaving} aria-label="Simpan" disabled={state.isSaving || state.editorDisabled} id="quiz-save-button" onClick={() => void state.persistence.saveQuiz()} type="button" variant="default">
            <Save aria-hidden="true" />{state.isSaving ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </header>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah judul Kuis</DialogTitle>
        </DialogHeader>
        <form className="mt-4 space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const title = titleDraft.trim();
          if (!title || state.editorDisabled || state.isSaving) return;
          if (title !== state.form.title) state.patchForm({ title });
          setTitleEditorOpen(false);
        }}>
          <Field>
            <FieldLabel htmlFor="quiz-editor-title-edit">Judul Kuis</FieldLabel>
            <FieldInput autoFocus disabled={state.editorDisabled || state.isSaving} id="quiz-editor-title-edit" onChange={(event) => setTitleDraft(event.target.value)} required value={titleDraft} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setTitleEditorOpen(false)} type="button" variant="outline">Batal</Button>
            <Button disabled={!titleDraft.trim() || state.editorDisabled || state.isSaving} type="submit">Terapkan</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuizEditQuestionArea({ state }: { state: QuizEditorState }) {
  const selectQuestion = (id: string) => {
    state.setActiveQuestionId(id);
  };
  const bankPickerDisabled = isQuizBankPickerDisabled(state);
  const { showAddFromBank, sourceBankHref, sourceBankTitle } = getQuizQuestionBankContext(state.savedQuiz);

  const inventoryProps = {
    activeQuestionId: state.activeQuestionId,
    addDisabled: bankPickerDisabled,
    addVisible: showAddFromBank,
    countLabel: `${state.form.questions.length} soal di Kuis`,
    disabled: state.editorDisabled,
    emptyLabel: "Belum ada soal di Kuis ini.",
    idPrefix: "quiz",
    onAdd: () => state.setQuestionBankPickerOpen(true),
    onDelete: state.setPendingDeleteId,
    onSelect: selectQuestion,
    questions: state.form.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      issueCount: questionIssues(question).length,
    })),
    sourceBankHref,
    sourceBankTitle,
  };

  return (
    <QuestionEditorWorkspace
      inventory={<QuizQuestionInventory {...inventoryProps} onReorder={state.questionActions.reorderQuestion} />}
      mainId="quiz-question-editor-main"
      mobileInventory={<QuizMobileInventory {...inventoryProps} onReorder={state.questionActions.reorderQuestion} />}
    >
      <QuizQuestionAreaMain bankPickerDisabled={bankPickerDisabled} state={state} />
    </QuestionEditorWorkspace>
  );
}

function getQuizEmptyStateContent(state: QuizEditorState, hasQuestions: boolean) {
  if (hasQuestions) {
    return { description: "Pilih soal dari daftar untuk meninjau isinya.", icon: CircleHelp, title: "Pilih soal untuk ditinjau" };
  }
  if (state.savedQuiz?.sourceMode === "assembly") {
    return {
      description: "Kuis ini disusun dari Bank Soal yang terhubung. Gunakan tautan Bank Soal untuk mengelola soal sumber.",
      icon: LibraryBig,
      title: "Belum ada soal di Kuis ini",
    };
  }
  return {
    description: state.savedQuiz ? "Pilih soal dari Bank Soal untuk mulai menyusun Kuis." : "Simpan Kuis terlebih dahulu untuk menambahkan soal dari Bank Soal.",
    icon: LibraryBig,
    title: "Belum ada soal di Kuis ini",
  };
}

function QuizQuestionAreaMain({ bankPickerDisabled, state }: { bankPickerDisabled: boolean; state: QuizEditorState }) {
  const question = state.activeQuestion;
  if (!question) {
    const hasQuestions = state.form.questions.length > 0;
    const content = getQuizEmptyStateContent(state, hasQuestions);
    return (
      <ReferenceSurface className="grid min-h-72 place-items-center p-8 text-center" data-quiz-question-empty={hasQuestions ? undefined : "true"} variant="inset">
        <ReferenceEmptyState
          action={!hasQuestions && !bankPickerDisabled ? <Button aria-label="Tambah soal dari Bank Soal" id="quiz-empty-state-add-bank-question" onClick={() => state.setQuestionBankPickerOpen(true)} size="sm" type="button" variant="default"><Plus />Tambah dari Bank Soal</Button> : undefined}
          description={content.description}
          icon={content.icon}
          title={content.title}
        />
      </ReferenceSurface>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-4" data-quiz-question-content-editor="enabled">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-secondary-900">Edit soal</h2></div>
      <QuizQuestionEditor disabled={state.editorDisabled} onOpenMedia={state.setMediaPickerTarget} question={question} updateQuestion={state.updateQuestion} />
    </div>
  );
}
function focusFirstAvailableQuizEditorControl(ids: readonly string[]) {
  for (const id of ids) {
    const control = document.getElementById(id);
    if (
      !(control instanceof HTMLElement) ||
      control.hasAttribute("disabled") ||
      control.getClientRects().length === 0
    ) {
      continue;
    }
    control.focus();
    return;
  }
}

function QuizEditorDialogs({ state }: { state: QuizEditorState }) {
  const bankPickerDisabled = isQuizBankPickerDisabled(state);
  const mediaTarget = state.mediaPickerTarget;
  const mediaQuestion = mediaTarget
    ? state.form.questions.find(
        (question) => question.id === mediaTarget.questionId,
      )
    : undefined;
  const selectedMediaAssetId = mediaTarget
    ? mediaTarget.field === "prompt"
      ? mediaQuestion?.promptMediaAssetId
      : mediaTarget.field === "explanation"
        ? mediaQuestion?.explanationMediaAssetId
        : mediaQuestion?.choices.find(
            (choice) => choice.id === mediaTarget.choiceId,
          )?.mediaAssetId
    : undefined;

  return (
    <>
      <MediaPickerDialog
        onOpenChange={(open) => {
          if (!open) state.setMediaPickerTarget(null);
        }}
        onSelect={(asset) => state.applySelectedMedia(asset.id)}
        open={Boolean(mediaTarget)}
        selectedAssetId={selectedMediaAssetId}
        title={mediaTarget?.label ?? "Pilih gambar"}
      />
      <QuestionBankPickerDialog
        editLease={state.editLease}
        expectedDraftRevision={state.savedQuiz?.draftRevision}
        key={`${state.questionBankPickerOpen ? "open" : "closed"}-${state.savedQuiz?.id ?? "none"}`}
        disabled={bankPickerDisabled}
        onImported={state.appendImportedQuestions}
        onOpenChange={state.setQuestionBankPickerOpen}
        open={state.questionBankPickerOpen && !bankPickerDisabled}
        quizId={state.savedQuiz?.id}
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
                const questionId = state.pendingDeleteId;
                if (!questionId) return;

                const remainingQuestions = state.form.questions.filter(
                  (question) => question.id !== questionId,
                );
                const deletedIndex = state.form.questions.findIndex(
                  (question) => question.id === questionId,
                );
                const nextActiveQuestionId =
                  remainingQuestions.find(
                    (question) => question.id === state.activeQuestionId,
                  )?.id ??
                  remainingQuestions[Math.max(0, deletedIndex - 1)]?.id ??
                  remainingQuestions[0]?.id;

                state.questionActions.removeQuestion(questionId);
                window.requestAnimationFrame(() => {
                  if (remainingQuestions.length > 0) {
                    focusFirstAvailableQuizEditorControl([
                      "quiz-mobile-question-picker-trigger",
                      ...(nextActiveQuestionId
                        ? [`quiz-question-select-${nextActiveQuestionId}`]
                        : []),
                      "quiz-save-button",
                    ]);
                    return;
                  }

                  focusFirstAvailableQuizEditorControl([
                    "quiz-mobile-add-bank-question",
                    "quiz-desktop-add-bank-question",
                    "quiz-empty-state-add-bank-question",
                    "quiz-save-button",
                    "quiz-question-editor-main",
                  ]);
                });
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
              Keluar
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
    <QuestionEditorPageShell marker="quiz">
      <QuizEditHeader quizId={quizId} state={state} subject={subject} />
      <ResourceAuthoringLockBanner
        hasLocalChanges={state.hasUnsavedChanges}
        onRetry={state.retryLock}
        resourceLabel="Kuis"
        state={state.lockState}
      />
      <QuizEditorFeedback scheduleError={state.scheduleError} />
      <QuizEditQuestionArea state={state} />
      <QuizEditorDialogs state={state} />
    </QuestionEditorPageShell>
  );
}

function QuizCreateHeader() {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button
        aria-label="Kembali ke daftar Kuis"
        className="mt-1 shrink-0"
        nativeButton={false}
        render={<Link href="/mentor/quiz" />}
        size="icon"
        title="Kembali ke daftar Kuis"
        variant="outline"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Button>
      <ReferencePageHeader className="min-w-0 flex-1" title="Kuis baru" />
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
        variant="default"
      >
        <Save /> {state.isSaving ? "Membuat…" : "Buat"}
      </Button>
    </div>
  );
}

function QuizCreateFields({
  presentation = "page",
  state,
}: {
  presentation?: "page" | "modal";
  state: QuizEditorState;
}) {
  const fields = (
    <>
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
    </>
  );

  if (presentation === "modal") {
    return <div className="grid gap-5">{fields}</div>;
  }

  return (
    <ReferenceSurface as="section" className="grid gap-5 p-5 md:p-7">
      {fields}
    </ReferenceSurface>
  );
}

function QuizCreateDialogContent({
  initialSubjectCode,
  onOpenChange,
  open,
}: {
  initialSubjectCode?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const state = useQuizEditorState({
    initialQuestions: [],
    initialQuiz: null,
    initialSubjectCode,
    mode: "create",
  });
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (state.isSaving) return;
    if (state.hasUnsavedChanges) {
      setDiscardConfirmationOpen(true);
      return;
    }
    onOpenChange(false);
  }

  return (
    <>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent
          className="max-h-[min(86vh,760px)] w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-2xl sm:p-8"
          data-quiz-create-modal="true"
          pending={state.isSaving}
        >
          <DialogHeader className="pr-8">
            <DialogTitle>Kuis baru</DialogTitle>
          </DialogHeader>
          <QuizEditorFeedback scheduleError={state.scheduleError} />
          <QuizCreateFields presentation="modal" state={state} />
          <QuizCreateSubmitButton state={state} />
        </DialogContent>
      </Dialog>
      <AlertDialog
        onOpenChange={setDiscardConfirmationOpen}
        open={discardConfirmationOpen}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Keluar tanpa menyimpan?</AlertDialogTitle>
            <AlertDialogDescription>
              Perubahan Kuis yang belum disimpan akan hilang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDiscardConfirmationOpen(false)}
            >
              Lanjut mengedit
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardConfirmationOpen(false);
                onOpenChange(false);
              }}
            >
              Keluar tanpa menyimpan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MentorQuizCreateDialog({
  initialSubjectCode,
  onOpenChange,
  open,
}: {
  initialSubjectCode?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  if (!open) return null;

  return (
    <ResourceEditLockProvider
      enabled={false}
      resourceId="00000000-0000-4000-8000-000000000000"
      resourceType="quiz"
    >
      <QuizCreateDialogContent
        initialSubjectCode={initialSubjectCode}
        onOpenChange={onOpenChange}
        open={open}
      />
    </ResourceEditLockProvider>
  );
}

function QuizCreateDialogTrigger({
  ariaLabel,
  buttonClassName,
  children,
  initialSubjectCode,
}: {
  ariaLabel?: string;
  buttonClassName?: string;
  children: ReactNode;
  initialSubjectCode?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={ariaLabel}
        className={buttonClassName}
        onClick={() => setOpen(true)}
        size="default"
        type="button"
        variant="default"
      >
        {children}
      </Button>
      <MentorQuizCreateDialog
        initialSubjectCode={initialSubjectCode}
        onOpenChange={setOpen}
        open={open}
      />
    </>
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

function QuizEditorContent({
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

function KaptenQuizEditorPageModule(props: {
  initialQuestions?: QuizQuestionSnapshot[];
  initialQuiz?: KaptenQuiz | null;
  initialSubjectCode?: string;
  mode: "create" | "edit";
  quizId?: string;
  session: SessionContext;
}) {
  return (
    <ResourceEditLockProvider
      enabled={props.mode === "edit" && Boolean(props.quizId)}
      resourceId={props.quizId ?? "00000000-0000-4000-8000-000000000000"}
      resourceType="quiz"
    >
      <QuizEditorContent {...props} />
    </ResourceEditLockProvider>
  );
}

export {
  KaptenQuizEditorPageModule,
  MentorQuizCreateDialog,
  QuizCreateDialogTrigger,
};
