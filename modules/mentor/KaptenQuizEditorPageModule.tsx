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
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { showToast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import type { MediaAssetDto } from "@/lib/media/types";
import type { SessionContext } from "@/lib/auth/types";
import { buildMentorQuizEditorHref } from "@/lib/navigation/canonical-context";
import { cn } from "@/lib/utils";
import { QuestionMobileInventoryOption } from "@/modules/mentor/components/question-mobile-inventory-option";
import type { QuizChoice, QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import { saveStandaloneQuizAction } from "@/modules/mentor/quiz-actions";
import { kaptenSubjects, type KaptenQuiz } from "@/modules/mentor/mock-data";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MediaAssetPreview, MediaPickerDialog } from "@/modules/media/media-library";

type MediaPickerTarget =
  | { kind: "choice"; choiceId: string; label: string }
  | { kind: "explanation"; label: string }
  | { kind: "prompt"; label: string };

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

const emptyChoice = (index: number): QuizChoice => ({
  id: String.fromCharCode(97 + index),
  text: "",
});

function createQuestionId() {
  return `local-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createEmptyQuestion(): QuizQuestionSnapshot {
  return {
    choices: [emptyChoice(0), emptyChoice(1)],
    correctChoiceId: "a",
    explanation: "",
    id: createQuestionId(),
    origin: "local",
    prompt: "",
  };
}

function asLocalQuestion(question: QuizQuestionSnapshot): QuizQuestionSnapshot {
  return {
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceId: question.correctChoiceId,
    explanation: question.explanation,
    explanationMediaAssetId: question.explanationMediaAssetId,
    id: question.id || createQuestionId(),
    isReady: question.isReady,
    origin: "local",
    prompt: question.prompt,
    promptMediaAssetId: question.promptMediaAssetId,
  };
}

function getInitialForm(initialQuiz: KaptenQuiz | null | undefined, initialQuestions: QuizQuestionSnapshot[], initialSubjectCode?: string) {
  const questions = initialQuestions.length ? initialQuestions.map(asLocalQuestion) : [createEmptyQuestion()];
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
    subjectCode: initialQuiz?.subjectCode ?? initialSubjectCode ?? kaptenSubjects[0]?.code ?? "PU",
    title: initialQuiz?.title ?? "Kuis baru",
  } satisfies QuizEditorForm;
}

function questionIssues(question: QuizQuestionSnapshot) {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push("pertanyaan");
  if (question.choices.length < 2 || question.choices.length > 5) issues.push("jumlah opsi");
  if (question.choices.some((choice) => !choice.text.trim())) issues.push("teks opsi");
  if (!question.choices.some((choice) => choice.id === question.correctChoiceId)) issues.push("jawaban benar");
  return issues;
}

function hasQuizQuestionDraftContent(question: QuizQuestionSnapshot) {
  return Boolean(
    question.prompt.trim()
      || question.explanation.trim()
      || question.promptMediaAssetId
      || question.explanationMediaAssetId
      || question.choices.length !== 2
      || question.correctChoiceId !== "a"
      || question.choices.some((choice) => choice.text.trim() || choice.mediaAssetId),
  );
}

function hasQuizDraftContent(form: QuizEditorForm) {
  const defaultSubjectCode = kaptenSubjects[0]?.code ?? "PU";
  const title = form.title.trim();

  return Boolean(
    (title && title !== "Kuis baru")
      || form.description.trim()
      || (form.subjectCode && form.subjectCode !== defaultSubjectCode)
      || form.opensAt.trim()
      || form.closesAt.trim()
      || form.attemptsAllowed !== 1
      || form.correctAnswerVisibility !== "show"
      || form.formBehavior !== "same"
      || form.retryDelaySeconds !== null
      || form.reviewTiming !== "immediate"
      || form.scorePolicy !== "latest"
      || form.questions.length !== 1
      || form.questions.some(hasQuizQuestionDraftContent),
  );
}

function cloneForSave(questions: QuizQuestionSnapshot[]) {
  return questions.map((question) => ({
    ...asLocalQuestion(question),
    sourceContentDigest: undefined,
    sourceQuestionId: undefined,
    sourceQuestionRevisionId: undefined,
    sourceRevisionProvenance: undefined,
  }));
}

function MediaAttachment({
  assetId,
  label,
  onRemove,
  onReplace,
}: {
  assetId: string;
  label: string;
  onRemove: () => void;
  onReplace: () => void;
}) {
  return (
    <ReferenceSurface as="div" className="grid gap-3 p-3" variant="inset">
      <MediaAssetPreview alt={label} assetId={assetId} className="max-h-48 bg-white" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onReplace} size="sm" type="button" variant="reference">
          <ImagePlus /> Ganti
        </Button>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          <X /> Lepas
        </Button>
      </div>
    </ReferenceSurface>
  );
}

function QuestionInventory({
  activeQuestionId,
  disabled,
  onAdd,
  onDelete,
  onMove,
  onSelect,
  questions,
}: {
  activeQuestionId: string | null;
  disabled: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSelect: (id: string) => void;
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-secondary-900" id="quiz-inventory-title">
            Inventori soal
          </h2>
          <p className="mt-1 text-xs text-secondary-500">
            {questions.length} soal{incompleteCount > 0 ? ` · ${incompleteCount} perlu diperbaiki` : ""}
          </p>
        </div>
        <Button
          aria-label="Tambah soal"
          disabled={disabled}
          onClick={onAdd}
          size="icon-sm"
          type="button"
          variant="brandOutline"
        >
          <Plus />
        </Button>
      </div>
      <nav aria-label="Navigasi soal" className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1" id="quiz-inventory-list">
          <ul aria-label="Daftar soal" className="flex flex-col gap-1.5">
            {questions.length > 0 ? questions.map((question, index) => {
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
                        {index + 1}. {question.prompt || "Soal tanpa pertanyaan"}
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
                          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
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
            }) : (
              <li className="px-2 py-4 text-sm leading-6 text-secondary-500">
                Belum ada soal. Tambahkan soal pertama.
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
  onAdd,
  onSelect,
  questions,
}: {
  activeQuestionId: string | null;
  disabled: boolean;
  onAdd: () => void;
  onSelect: (id: string) => void;
  questions: QuizQuestionSnapshot[];
}) {
  const activeIndex = questions.findIndex((question) => question.id === activeQuestionId);
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
            aria-label="Pilih soal yang sedang diedit"
            render={
              <Button
                className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "min-w-0 flex-1")}
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
            <DropdownMenuRadioGroup onValueChange={onSelect} value={activeQuestionId ?? undefined}>
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
        <Button aria-label="Tambah soal" disabled={disabled} onClick={onAdd} size="icon-sm" type="button" variant="reference">
          <Plus />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-secondary-500">
        <span>{questions.length} soal di Kuis</span>
        {incompleteCount > 0 ? <span className="font-semibold text-warning-900">{incompleteCount} perlu diperbaiki</span> : null}
      </div>
    </div>
  );
}

function QuestionForm({
  disabled,
  onAddChoice,
  onChange,
  onOpenMedia,
  onRemoveChoice,
  onRemoveMedia,
  question,
}: {
  disabled: boolean;
  onAddChoice: () => void;
  onChange: (patch: Partial<QuizQuestionSnapshot>) => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveMedia: (target: MediaPickerTarget) => void;
  question: QuizQuestionSnapshot;
}) {
  const issues = questionIssues(question);
  return (
    <ReferenceSurface as="section" className="grid min-w-0 gap-6 p-5 md:p-7">
      {issues.length ? <p aria-live="polite" className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">Lengkapi {issues.join(", ")} sebelum Kuis diterbitkan.</p> : null}
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-question-prompt">Pertanyaan</FieldLabel>
          <Button disabled={disabled} onClick={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })} size="sm" type="button" variant="ghost"><ImagePlus /> {question.promptMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button>
        </div>
        <FieldTextarea className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={disabled} id="quiz-question-prompt" onChange={(event) => onChange({ prompt: event.target.value })} placeholder="Tulis pertanyaan untuk siswa…" value={question.prompt} />
        {question.promptMediaAssetId ? <MediaAttachment assetId={question.promptMediaAssetId} label="Gambar pertanyaan" onRemove={() => onRemoveMedia({ kind: "prompt", label: "Gambar pertanyaan" })} onReplace={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })} /> : null}
      </Field>

      <fieldset className="grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="text-base leading-7 text-primary-900">Pilihan jawaban</legend>
        <p className="sm:col-span-2 text-sm leading-6 text-secondary-500">Pilih satu jawaban benar dengan radio di sebelah kiri.</p>
        {question.choices.map((choice, index) => {
          const label = String.fromCharCode(65 + index);
          return (
            <ReferenceSurface as="div" className="min-w-0 p-3" key={choice.id} variant="inset">
              <div className="flex min-w-0 items-center gap-3">
                <input aria-label={`Jawaban benar opsi ${label}`} checked={choice.id === question.correctChoiceId} disabled={disabled} name={`correct-choice-${question.id ?? "current"}`} onChange={() => onChange({ correctChoiceId: choice.id })} type="radio" />
                <span aria-hidden="true" className="text-xs font-semibold text-primary-800">{label}</span>
                <input aria-label={`Teks opsi ${label}`} className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-w-0 flex-1 py-2`} disabled={disabled} onChange={(event) => onChange({ choices: question.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item) })} placeholder={`Opsi ${label}`} value={choice.text} />
                <Button aria-label={`${choice.mediaAssetId ? "Ganti" : "Tambah"} gambar opsi ${label}`} disabled={disabled} onClick={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${label}` })} size="icon-sm" type="button" variant="ghost"><ImagePlus /></Button>
                <Button aria-label={`Hapus opsi ${label}`} disabled={disabled || question.choices.length <= 2} onClick={() => onRemoveChoice(choice.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
              </div>
              {choice.mediaAssetId ? <MediaAttachment assetId={choice.mediaAssetId} label={`Gambar opsi ${label}`} onRemove={() => onRemoveMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${label}` })} onReplace={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${label}` })} /> : null}
            </ReferenceSurface>
          );
        })}
        <div className="sm:col-span-2"><Button disabled={disabled || question.choices.length >= 5} onClick={onAddChoice} size="sm" type="button" variant="brandOutline"><Plus /> Tambah opsi</Button></div>
      </fieldset>

      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel>
          <Button disabled={disabled} onClick={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} size="sm" type="button" variant="ghost"><ImagePlus /> {question.explanationMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button>
        </div>
        <FieldTextarea className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[150px]`} disabled={disabled} id="quiz-question-explanation" onChange={(event) => onChange({ explanation: event.target.value })} placeholder="Beri konteks agar siswa memahami jawabannya…" value={question.explanation} />
        {question.explanationMediaAssetId ? <MediaAttachment assetId={question.explanationMediaAssetId} label="Gambar penjelasan" onRemove={() => onRemoveMedia({ kind: "explanation", label: "Gambar penjelasan" })} onReplace={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} /> : null}
      </Field>
    </ReferenceSurface>
  );
}

function QuestionPreview({ question }: { question: QuizQuestionSnapshot }) {
  return (
    <ReferenceSurface as="section" className="min-w-0 p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold tracking-[0.12em] text-secondary-400 uppercase"><span>Preview soal</span><span>Tampilan penulis · belum dikirim</span></div>
      <h3 className="mt-5 text-xl leading-8 font-semibold text-secondary-900">{question.prompt || "Pertanyaan akan tampil di sini."}</h3>
      {question.promptMediaAssetId ? <MediaAssetPreview alt="Gambar pertanyaan" assetId={question.promptMediaAssetId} className="mt-5" /> : null}
      <div className="mt-6 grid gap-3">
        {question.choices.map((choice, index) => <div className="rounded-xl border border-primary-100 bg-secondary-50/40 p-4" key={choice.id}><div className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold uppercase text-primary-800">{String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1 text-sm leading-6 text-secondary-800">{choice.text || `Opsi ${String.fromCharCode(65 + index)}`}{choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${String.fromCharCode(65 + index)}`} assetId={choice.mediaAssetId} className="mt-3 max-h-44" /> : null}</span></div></div>)}
      </div>
      {question.explanation ? <div className="mt-6 border-t border-primary-100 pt-5"><h4 className="text-sm font-semibold text-secondary-900">Penjelasan</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary-600">{question.explanation}</p>{question.explanationMediaAssetId ? <MediaAssetPreview alt="Gambar penjelasan" assetId={question.explanationMediaAssetId} className="mt-4" /> : null}</div> : null}
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
    const frame = window.requestAnimationFrame(() => router.replace(pendingRouteReplacement));
    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);

  const requestExit = useCallback((route: string) => {
    if (hasUnsavedChanges) {
      setPendingExitRoute(route);
      return;
    }
    router.push(route);
  }, [hasUnsavedChanges, router, setPendingExitRoute]);

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
  setQuestionEditorTab,
}: {
  activeQuestionId: string | null;
  editorDisabled: boolean;
  form: QuizEditorForm;
  markChanged: QuizEditorChangeMarker;
  setActiveQuestionId: (id: string | null) => void;
  setForm: (form: QuizEditorForm) => void;
  setPendingDeleteId: (id: string | null) => void;
  setQuestionEditorTab: (tab: string) => void;
}) {
  const updateActiveQuestion = useCallback((patch: Partial<QuizQuestionSnapshot>) => {
    if (!activeQuestionId || editorDisabled) return;
    const nextForm = {
      ...form,
      questions: form.questions.map((question) => question.id === activeQuestionId ? { ...question, ...patch } : question),
    };
    setForm(nextForm);
    markChanged(nextForm);
  }, [activeQuestionId, editorDisabled, form, markChanged, setForm]);

  const addQuestion = useCallback(() => {
    if (editorDisabled) return;
    const question = createEmptyQuestion();
    const nextForm = { ...form, questions: [...form.questions, question] };
    setForm(nextForm);
    setActiveQuestionId(question.id);
    setQuestionEditorTab("edit");
    markChanged(nextForm);
  }, [editorDisabled, form, markChanged, setActiveQuestionId, setForm, setQuestionEditorTab]);

  const removeQuestion = useCallback((questionId: string) => {
    if (editorDisabled) return;
    const nextQuestions = form.questions.filter((question) => question.id !== questionId);
    const nextForm = { ...form, questions: nextQuestions };
    setForm(nextForm);
    if (activeQuestionId === questionId) {
      const next = nextQuestions[Math.max(0, form.questions.findIndex((question) => question.id === questionId) - 1)] ?? nextQuestions[0] ?? null;
      setActiveQuestionId(next?.id ?? null);
    }
    setPendingDeleteId(null);
    markChanged(nextForm);
  }, [activeQuestionId, editorDisabled, form, markChanged, setActiveQuestionId, setForm, setPendingDeleteId]);

  const moveQuestion = useCallback((questionId: string, direction: "up" | "down") => {
    if (editorDisabled) return;
    const index = form.questions.findIndex((question) => question.id === questionId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= form.questions.length) return;
    const questions = [...form.questions];
    const [moved] = questions.splice(index, 1);
    if (!moved) return;
    questions.splice(nextIndex, 0, moved);
    const nextForm = { ...form, questions };
    setForm(nextForm);
    markChanged(nextForm);
  }, [editorDisabled, form, markChanged, setForm]);

  return { addQuestion, moveQuestion, removeQuestion, updateActiveQuestion };
}

function useQuizEditorChoiceActions({
  activeQuestion,
  editorDisabled,
  setMediaPickerTarget,
  updateActiveQuestion,
}: {
  activeQuestion: QuizQuestionSnapshot | null;
  editorDisabled: boolean;
  setMediaPickerTarget: (target: MediaPickerTarget | null) => void;
  updateActiveQuestion: (patch: Partial<QuizQuestionSnapshot>) => void;
}) {
  const addChoice = useCallback(() => {
    if (!activeQuestion || activeQuestion.choices.length >= 5 || editorDisabled) return;
    updateActiveQuestion({ choices: [...activeQuestion.choices, emptyChoice(activeQuestion.choices.length)] });
  }, [activeQuestion, editorDisabled, updateActiveQuestion]);

  const removeChoice = useCallback((choiceId: string) => {
    if (!activeQuestion || activeQuestion.choices.length <= 2 || editorDisabled) return;
    const choices = activeQuestion.choices.filter((choice) => choice.id !== choiceId);
    updateActiveQuestion({ choices, correctChoiceId: activeQuestion.correctChoiceId === choiceId ? choices[0]?.id ?? "a" : activeQuestion.correctChoiceId });
  }, [activeQuestion, editorDisabled, updateActiveQuestion]);

  const removeMedia = useCallback((target: MediaPickerTarget) => {
    if (!activeQuestion) return;
    if (target.kind === "prompt") updateActiveQuestion({ promptMediaAssetId: undefined });
    else if (target.kind === "explanation") updateActiveQuestion({ explanationMediaAssetId: undefined });
    else updateActiveQuestion({ choices: activeQuestion.choices.map((choice) => choice.id === target.choiceId ? { ...choice, mediaAssetId: undefined } : choice) });
  }, [activeQuestion, updateActiveQuestion]);

  const selectMediaAsset = useCallback((asset: MediaAssetDto, target: MediaPickerTarget | null) => {
    if (!target || !activeQuestion) return;
    if (target.kind === "prompt") updateActiveQuestion({ promptMediaAssetId: asset.id });
    else if (target.kind === "explanation") updateActiveQuestion({ explanationMediaAssetId: asset.id });
    else updateActiveQuestion({ choices: activeQuestion.choices.map((choice) => choice.id === target.choiceId ? { ...choice, mediaAssetId: asset.id } : choice) });
    setMediaPickerTarget(null);
  }, [activeQuestion, setMediaPickerTarget, updateActiveQuestion]);

  return { addChoice, removeChoice, removeMedia, selectMediaAsset };
}

function useQuizEditorPersistence({
  editorDisabled,
  form,
  isSaving,
  mode,
  quizId,
  savedQuiz,
  setIsSaving,
  setPendingRouteReplacement,
  setSaveError,
  setSavedQuiz,
  setHasUnsavedChanges,
}: {
  editorDisabled: boolean;
  form: QuizEditorForm;
  isSaving: boolean;
  mode: "create" | "edit";
  quizId?: string;
  savedQuiz: KaptenQuiz | null;
  setIsSaving: (saving: boolean) => void;
  setPendingRouteReplacement: (route: string | null) => void;
  setSaveError: (error: string | null) => void;
  setSavedQuiz: (quiz: KaptenQuiz | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
}) {
  const saveQuiz = useCallback(async () => {
    if (isSaving || editorDisabled) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveStandaloneQuizAction({
        attemptsAllowed: form.attemptsAllowed,
        closesAt: form.closesAt,
        correctAnswerVisibility: form.correctAnswerVisibility,
        description: form.description,
        formBehavior: form.formBehavior,
        id: savedQuiz?.id ?? quizId,
        opensAt: form.opensAt,
        questions: mode === "create" ? [] : cloneForSave(form.questions),
        retryDelaySeconds: form.retryDelaySeconds,
        reviewTiming: form.reviewTiming,
        scorePolicy: form.scorePolicy,
        status: savedQuiz?.status === "published" ? "published" : "draft",
        subjectCode: form.subjectCode,
        title: form.title,
      });
      if (!result.ok) {
        setSaveError(result.message);
        return;
      }
      setSavedQuiz(result.quiz);
      setHasUnsavedChanges(false);
      setSaveError(null);
      showToast("Perubahan Kuis tersimpan.", { variant: "success" });
      if (!quizId) setPendingRouteReplacement(buildMentorQuizEditorHref(result.quiz.id, form.subjectCode));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kuis belum dapat disimpan.");
    } finally {
      setIsSaving(false);
    }
  }, [editorDisabled, form, isSaving, mode, quizId, savedQuiz, setHasUnsavedChanges, setIsSaving, setPendingRouteReplacement, setSaveError, setSavedQuiz]);

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
  const initialForm = useState<QuizEditorForm>(() => getInitialForm(initialQuiz, initialQuestions, initialSubjectCode))[0];
  const [form, setForm] = useState<QuizEditorForm>(initialForm);
  const [savedQuiz, setSavedQuiz] = useState<KaptenQuiz | null>(initialQuiz);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(initialForm.questions[0]?.id ?? null);
  const [questionEditorTab, setQuestionEditorTab] = useState("edit");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(mode === "create" && hasQuizDraftContent(initialForm));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingExitRoute, setPendingExitRoute] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);
  const activeQuestion = useMemo(() => form.questions.find((question) => question.id === activeQuestionId) ?? null, [activeQuestionId, form.questions]);
  const editorDisabled = savedQuiz?.status === "archived";
  const scheduleError = form.opensAt && form.closesAt && new Date(form.closesAt) <= new Date(form.opensAt) ? "Waktu tutup harus setelah waktu buka." : null;

  const markChanged = useCallback((nextForm = form) => {
    setHasUnsavedChanges(mode === "create" ? hasQuizDraftContent(nextForm) : true);
    setSaveError(null);
  }, [form, mode]);

  const patchForm = useCallback((patch: Partial<QuizEditorForm>) => {
    const nextForm = { ...form, ...patch };
    setForm(nextForm);
    markChanged(nextForm);
  }, [form, markChanged]);
  const navigation = useQuizEditorNavigation({ hasUnsavedChanges, pendingRouteReplacement, router, setPendingExitRoute });
  const questionActions = useQuizEditorQuestionListActions({ activeQuestionId, editorDisabled, form, markChanged, setActiveQuestionId, setForm, setPendingDeleteId, setQuestionEditorTab });
  const choiceActions = useQuizEditorChoiceActions({ activeQuestion, editorDisabled, setMediaPickerTarget, updateActiveQuestion: questionActions.updateActiveQuestion });
  const persistence = useQuizEditorPersistence({ editorDisabled, form, isSaving, mode, quizId, savedQuiz, setHasUnsavedChanges, setIsSaving, setPendingRouteReplacement, setSaveError, setSavedQuiz });

  return {
    activeQuestion,
    activeQuestionId,
    editorDisabled,
    form,
    hasUnsavedChanges,
    isSaving,
    mediaPickerTarget,
    navigation,
    pendingDeleteId,
    pendingExitRoute,
    patchForm,
    persistence,
    questionActions,
    questionEditorTab,
    saveError,
    savedQuiz,
    scheduleError,
    setActiveQuestionId,
    setMediaPickerTarget,
    setPendingDeleteId,
    setPendingExitRoute,
    setQuestionEditorTab,
    choiceActions,
    router,
  };
}

type QuizEditorState = ReturnType<typeof useQuizEditorState>;

function QuizEditorFeedback({ saveError, scheduleError }: Pick<QuizEditorState, "saveError" | "scheduleError">) {
  return (
    <>
      {saveError ? <p aria-live="assertive" className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">{saveError}</p> : null}
      {scheduleError ? <p className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">{scheduleError}</p> : null}
    </>
  );
}

function QuizEditHeader({ quizId, state, subject }: { quizId?: string; state: QuizEditorState; subject?: (typeof kaptenSubjects)[number] }) {
  return (
    <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-100 bg-voyage-canvas/95 px-3 py-2 shadow-[0_10px_24px_-24px_color-mix(in_oklab,var(--voyage-forest)_42%,transparent)] backdrop-blur-xl md:h-14 md:flex-nowrap md:px-6 md:py-0">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <Button aria-label="Kembali ke detail Kuis" onClick={() => state.navigation.requestExit(`/mentor/quiz/${quizId}`)} size="sm" type="button" variant="ghost"><ChevronLeft /><span className="hidden font-medium sm:inline">Kembali ke Detail</span></Button>
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="max-w-[150px] truncate text-base font-bold text-secondary-900 sm:max-w-xs md:max-w-md">{state.form.title || "Kuis"}</h1>
          {state.hasUnsavedChanges ? <ReferenceStatusBadge appearance="mentor" label="Belum disimpan" size="xs" status="need_help" /> : null}
          {subject ? <MentorBadge className="hidden sm:inline-flex" size="xs" tone="category">{subject.code}</MentorBadge> : null}
        </div>
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto"><Button aria-busy={state.isSaving} aria-label="Simpan" disabled={state.isSaving || state.editorDisabled} onClick={() => void state.persistence.saveQuiz()} size="sm" title="Simpan perubahan" type="button" variant="brand"><Save />{state.isSaving ? "Menyimpan…" : "Simpan"}</Button></div>
    </header>
  );
}

function QuizEditQuestionArea({ state }: { state: QuizEditorState }) {
  const selectQuestion = (id: string) => {
    state.setActiveQuestionId(id);
    state.setQuestionEditorTab("edit");
  };
  const questionEditor = state.activeQuestion ? (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-secondary-900">Edit soal</h2>
        <label className="ml-auto inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-secondary-700" htmlFor="quiz-preview-toggle">Toggle preview<Switch checked={state.questionEditorTab === "preview"} id="quiz-preview-toggle" onCheckedChange={(checked) => state.setQuestionEditorTab(checked ? "preview" : "edit")} /></label>
      </div>
      {state.questionEditorTab === "edit" ? <QuestionForm disabled={state.editorDisabled} onAddChoice={state.choiceActions.addChoice} onChange={state.questionActions.updateActiveQuestion} onOpenMedia={state.setMediaPickerTarget} onRemoveChoice={state.choiceActions.removeChoice} onRemoveMedia={state.choiceActions.removeMedia} question={state.activeQuestion} /> : <QuestionPreview question={state.activeQuestion} />}
    </div>
  ) : <ReferenceSurface className="grid min-h-72 place-items-center p-8 text-center" variant="inset"><ReferenceEmptyState action={<Button disabled={state.editorDisabled} onClick={state.questionActions.addQuestion} size="sm" type="button" variant="brand"><Plus />Tambah soal</Button>} description="Daftar soalmu masih kosong. Tambahkan soal pertama dari panel di sebelah kiri." icon={CircleHelp} title="Pilih soal untuk mulai mengedit" /></ReferenceSurface>;

  return (
    <>
      <QuizMobileInventory activeQuestionId={state.activeQuestionId} disabled={state.editorDisabled} onAdd={state.questionActions.addQuestion} onSelect={selectQuestion} questions={state.form.questions} />
      <div className="flex min-h-0 flex-1 overflow-hidden"><div className="hidden w-72 shrink-0 overflow-y-auto border-r border-primary-100 bg-white md:flex md:flex-col lg:w-80 [&_aside]:rounded-none [&_aside]:border-0 [&_aside]:shadow-none"><QuestionInventory activeQuestionId={state.activeQuestionId} disabled={state.editorDisabled} onAdd={state.questionActions.addQuestion} onDelete={state.setPendingDeleteId} onMove={state.questionActions.moveQuestion} onSelect={selectQuestion} questions={state.form.questions} /></div><main className="flex-1 overflow-y-auto bg-voyage-canvas p-4 sm:p-6 md:p-8"><div className="mx-auto max-w-4xl space-y-6">{questionEditor}</div></main></div>
    </>
  );
}

function QuizEditorDialogs({ state }: { state: QuizEditorState }) {
  const mediaPickerTarget = state.mediaPickerTarget;
  const selectedAssetId = mediaPickerTarget?.kind === "prompt"
    ? state.activeQuestion?.promptMediaAssetId
    : mediaPickerTarget?.kind === "explanation"
      ? state.activeQuestion?.explanationMediaAssetId
      : mediaPickerTarget?.kind === "choice"
        ? state.activeQuestion?.choices.find((choice) => choice.id === mediaPickerTarget.choiceId)?.mediaAssetId
        : undefined;

  return (
    <>
      <MediaPickerDialog onOpenChange={(open) => { if (!open) state.setMediaPickerTarget(null); }} onSelect={(asset) => state.choiceActions.selectMediaAsset(asset, state.mediaPickerTarget)} open={Boolean(state.mediaPickerTarget)} selectedAssetId={selectedAssetId} title={state.mediaPickerTarget?.label ?? "Pilih gambar"} />
      <AlertDialog onOpenChange={(open) => { if (!open) state.setPendingDeleteId(null); }} open={Boolean(state.pendingDeleteId)}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Hapus soal ini?</AlertDialogTitle><AlertDialogDescription>Soal akan dihapus dari Kuis ini. Bank atau sumber lain tidak akan berubah.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => state.setPendingDeleteId(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { if (state.pendingDeleteId) state.questionActions.removeQuestion(state.pendingDeleteId); }} variant="destructive">Hapus soal</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog onOpenChange={(open) => { if (!open) state.setPendingExitRoute(null); }} open={Boolean(state.pendingExitRoute)}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><CircleHelp /></AlertDialogMedia><AlertDialogTitle>Keluar tanpa menyimpan?</AlertDialogTitle><AlertDialogDescription>Perubahan Kuis yang belum disimpan akan hilang.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => state.setPendingExitRoute(null)}>Tetap di editor</AlertDialogCancel><AlertDialogAction onClick={() => { const route = state.pendingExitRoute; state.setPendingExitRoute(null); if (route) state.router.push(route); }} variant="destructive">Keluar tanpa menyimpan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </>
  );
}

function QuizEditWorkspace({ quizId, state }: { quizId?: string; state: QuizEditorState }) {
  const subject = kaptenSubjects.find((item) => item.code === state.form.subjectCode);
  return <div className="flex h-screen flex-col overflow-hidden bg-voyage-canvas" data-quiz-editor-shell="full-page"><QuizEditHeader quizId={quizId} state={state} subject={subject} /><QuizEditorFeedback saveError={state.saveError} scheduleError={state.scheduleError} /><QuizEditQuestionArea state={state} /><QuizEditorDialogs state={state} /></div>;
}

function QuizCreateHeader({ state }: { state: QuizEditorState }) {
  return <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><Button aria-label="Kembali ke daftar Kuis" nativeButton={false} render={<Link href="/mentor/quiz" />} size="sm" type="button" variant="ghost"><ChevronLeft />Kembali ke daftar</Button><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="min-w-0 truncate text-2xl font-semibold tracking-[-0.03em] text-secondary-900 sm:text-3xl">{state.form.title || "Kuis tanpa judul"}</h1>{state.hasUnsavedChanges ? <ReferenceStatusBadge appearance="mentor" label="Belum disimpan" size="xs" status="need_help" /> : null}</div><p className="mt-2 text-sm leading-6 text-secondary-500">Atur informasi dasar Kuis sebelum menambahkan soal.</p></div><Button aria-busy={state.isSaving} aria-label="Buat" disabled={state.isSaving || state.editorDisabled} onClick={() => void state.persistence.saveQuiz()} type="button" variant="brand"><Save /> {state.isSaving ? "Membuat…" : "Buat"}</Button></header>;
}

function QuizCreateFields({ state }: { state: QuizEditorState }) {
  return <ReferenceSurface as="section" className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.38fr)] md:p-7"><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-editor-title">Judul Kuis</FieldLabel><FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={state.editorDisabled} id="quiz-editor-title" onChange={(event) => state.patchForm({ title: event.target.value })} value={state.form.title} /></Field><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-editor-subject">Subjek</FieldLabel><ReferenceSelect disabled={state.editorDisabled} id="quiz-editor-subject" onValueChange={(value) => state.patchForm({ subjectCode: value })} options={kaptenSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.code }))} placeholder="Pilih subjek" value={state.form.subjectCode} /></Field><Field className="md:col-span-2"><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-editor-description">Deskripsi <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldTextarea className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[96px]`} disabled={state.editorDisabled} id="quiz-editor-description" onChange={(event) => state.patchForm({ description: event.target.value })} value={state.form.description} /></Field></ReferenceSurface>;
}

function QuizCreateWorkspace({ session, state }: { session: SessionContext; state: QuizEditorState }) {
  return <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel="Buat Kuis" contentElement="div" mainClassName="max-w-[1500px] gap-6" onNavigateAway={() => !state.hasUnsavedChanges} session={session} showSearch={false} sidebarAppearance="reference" shouldGuardNavigation={state.hasUnsavedChanges}><QuizCreateHeader state={state} /><QuizEditorFeedback saveError={state.saveError} scheduleError={state.scheduleError} /><QuizCreateFields state={state} /></MentorWorkspaceShell>;
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
  const state = useQuizEditorState({ initialQuestions, initialQuiz, initialSubjectCode, mode, quizId });
  return mode === "edit"
    ? <QuizEditWorkspace quizId={quizId} state={state} />
    : <QuizCreateWorkspace session={session} state={state} />;

  /* legacy edit workspace removed */
}

export { KaptenQuizEditorPageModule };
