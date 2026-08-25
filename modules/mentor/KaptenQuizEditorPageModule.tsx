"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  CircleHelp,
  Eye,
  ImagePlus,
  ListChecks,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { showToast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MediaAssetDto } from "@/lib/media/types";
import type { SessionContext } from "@/lib/auth/types";
import type { QuizChoice, QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import { saveStandaloneQuizAction } from "@/modules/mentor/quiz-actions";
import { kaptenSubjects, type KaptenQuiz } from "@/modules/mentor/mock-data";
import { DropdownField } from "@/modules/mentor/components/kapten-ui";
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

function getInitialForm(initialQuiz: KaptenQuiz | null | undefined, initialQuestions: QuizQuestionSnapshot[]) {
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
    subjectCode: initialQuiz?.subjectCode ?? kaptenSubjects[0]?.code ?? "PU",
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
    <div className="grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 p-3">
      <MediaAssetPreview alt={label} assetId={assetId} className="max-h-48 bg-white" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onReplace} size="sm" type="button" variant="brandOutline">
          <ImagePlus /> Ganti
        </Button>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          <X /> Lepas
        </Button>
      </div>
    </div>
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
  return (
    <div className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-secondary-900">Daftar soal</h2>
          <p className="mt-1 text-xs leading-5 text-secondary-500">Susun urutan yang akan dilihat siswa.</p>
        </div>
        <span aria-label={`${questions.length} soal`} className="inline-flex min-w-8 items-center justify-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800">
          {questions.length}
        </span>
      </div>
      <Button className="mt-4 w-full" disabled={disabled} onClick={onAdd} type="button" variant="brandOutline">
        <Plus /> Tambah soal
      </Button>
      {questions.length ? (
        <ol className="mt-4 grid gap-2 border-t border-primary-100 pt-4">
          {questions.map((question, index) => {
            const issues = questionIssues(question);
            const selected = question.id === activeQuestionId;
            return (
              <li className="min-w-0" key={question.id}>
                <div className={selected ? "rounded-2xl border border-primary-300 bg-primary-50/70 p-2" : "rounded-2xl border border-transparent p-2 hover:border-primary-100 hover:bg-primary-50/40"}>
                  <button
                    aria-current={selected ? "step" : undefined}
                    aria-label={`Edit soal ${index + 1}`}
                    className="flex min-w-0 w-full items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/50"
                    onClick={() => onSelect(question.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-primary-800 shadow-sm">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-secondary-900">{question.prompt || "Soal tanpa pertanyaan"}</span>
                      <span className={issues.length ? "mt-1 block text-xs font-medium text-student-status-danger-fg" : "mt-1 block text-xs text-secondary-500"}>{issues.length ? `${issues.length} bagian perlu dilengkapi` : "Siap ditinjau"}</span>
                    </span>
                  </button>
                  <div className="mt-2 flex justify-end gap-1">
                    <Button aria-label={`Pindah soal ${index + 1} ke atas`} disabled={disabled || index === 0} onClick={() => onMove(question.id, "up")} size="icon-sm" type="button" variant="ghost"><ArrowUp /></Button>
                    <Button aria-label={`Pindah soal ${index + 1} ke bawah`} disabled={disabled || index === questions.length - 1} onClick={() => onMove(question.id, "down")} size="icon-sm" type="button" variant="ghost"><ArrowDown /></Button>
                    <Button aria-label={`Hapus soal ${index + 1}`} disabled={disabled} onClick={() => onDelete(question.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-primary-200 px-4 py-8 text-center">
          <ListChecks aria-hidden="true" className="mx-auto size-7 text-primary-300" />
          <p className="mt-3 text-sm font-semibold text-secondary-900">Belum ada soal</p>
          <p className="mt-1 text-sm leading-6 text-secondary-500">Tambahkan soal pertama untuk mulai menyusun Kuis.</p>
        </div>
      )}
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
    <div className="grid min-w-0 gap-6 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6">
      {issues.length ? <p aria-live="polite" className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">Lengkapi {issues.join(", ")} sebelum Kuis diterbitkan.</p> : null}
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="quiz-question-prompt">Pertanyaan</FieldLabel>
          <Button disabled={disabled} onClick={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })} size="sm" type="button" variant="ghost"><ImagePlus /> {question.promptMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button>
        </div>
        <FieldTextarea disabled={disabled} id="quiz-question-prompt" onChange={(event) => onChange({ prompt: event.target.value })} placeholder="Tulis pertanyaan untuk siswa…" value={question.prompt} />
        {question.promptMediaAssetId ? <MediaAttachment assetId={question.promptMediaAssetId} label="Gambar pertanyaan" onRemove={() => onRemoveMedia({ kind: "prompt", label: "Gambar pertanyaan" })} onReplace={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })} /> : null}
      </Field>

      <fieldset className="grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="text-base leading-7 text-primary-900">Pilihan jawaban</legend>
        <p className="sm:col-span-2 text-sm leading-6 text-secondary-500">Pilih satu jawaban benar dengan radio di sebelah kiri.</p>
        {question.choices.map((choice, index) => {
          const label = String.fromCharCode(65 + index);
          return (
            <div className="min-w-0 rounded-2xl border border-primary-100 bg-white p-3" key={choice.id}>
              <div className="flex min-w-0 items-center gap-3">
                <input aria-label={`Jawaban benar opsi ${label}`} checked={choice.id === question.correctChoiceId} disabled={disabled} onChange={() => onChange({ correctChoiceId: choice.id })} type="radio" />
                <span aria-hidden="true" className="text-xs font-semibold text-primary-800">{label}</span>
                <input aria-label={`Teks opsi ${label}`} className="min-w-0 flex-1 bg-transparent text-sm text-secondary-900 outline-none placeholder:text-secondary-400 focus-visible:ring-3 focus-visible:ring-primary-200" disabled={disabled} onChange={(event) => onChange({ choices: question.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item) })} placeholder={`Opsi ${label}`} value={choice.text} />
                <Button aria-label={`${choice.mediaAssetId ? "Ganti" : "Tambah"} gambar opsi ${label}`} disabled={disabled} onClick={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${label}` })} size="icon-sm" type="button" variant="ghost"><ImagePlus /></Button>
                <Button aria-label={`Hapus opsi ${label}`} disabled={disabled || question.choices.length <= 2} onClick={() => onRemoveChoice(choice.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
              </div>
              {choice.mediaAssetId ? <MediaAttachment assetId={choice.mediaAssetId} label={`Gambar opsi ${label}`} onRemove={() => onRemoveMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${label}` })} onReplace={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${label}` })} /> : null}
            </div>
          );
        })}
        <div className="sm:col-span-2"><Button disabled={disabled || question.choices.length >= 5} onClick={onAddChoice} size="sm" type="button" variant="brandOutline"><Plus /> Tambah opsi</Button></div>
      </fieldset>

      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="quiz-question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel>
          <Button disabled={disabled} onClick={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} size="sm" type="button" variant="ghost"><ImagePlus /> {question.explanationMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button>
        </div>
        <FieldTextarea className="min-h-[150px]" disabled={disabled} id="quiz-question-explanation" onChange={(event) => onChange({ explanation: event.target.value })} placeholder="Beri konteks agar siswa memahami jawabannya…" value={question.explanation} />
        {question.explanationMediaAssetId ? <MediaAttachment assetId={question.explanationMediaAssetId} label="Gambar penjelasan" onRemove={() => onRemoveMedia({ kind: "explanation", label: "Gambar penjelasan" })} onReplace={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} /> : null}
      </Field>
    </div>
  );
}

function QuestionPreview({ question }: { question: QuizQuestionSnapshot }) {
  return (
    <section className="min-w-0 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold tracking-[0.12em] text-secondary-400 uppercase"><span>Preview soal</span><span>Tampilan penulis · belum dikirim</span></div>
      <h3 className="mt-5 text-xl leading-8 font-semibold text-secondary-900">{question.prompt || "Pertanyaan akan tampil di sini."}</h3>
      {question.promptMediaAssetId ? <MediaAssetPreview alt="Gambar pertanyaan" assetId={question.promptMediaAssetId} className="mt-5" /> : null}
      <div className="mt-6 grid gap-3">
        {question.choices.map((choice, index) => <div className="rounded-xl border border-primary-100 bg-secondary-50/40 p-4" key={choice.id}><div className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold uppercase text-primary-800">{String.fromCharCode(65 + index)}</span><span className="min-w-0 flex-1 text-sm leading-6 text-secondary-800">{choice.text || `Opsi ${String.fromCharCode(65 + index)}`}{choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${String.fromCharCode(65 + index)}`} assetId={choice.mediaAssetId} className="mt-3 max-h-44" /> : null}</span></div></div>)}
      </div>
      {question.explanation ? <div className="mt-6 border-t border-primary-100 pt-5"><h4 className="text-sm font-semibold text-secondary-900">Penjelasan</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary-600">{question.explanation}</p>{question.explanationMediaAssetId ? <MediaAssetPreview alt="Gambar penjelasan" assetId={question.explanationMediaAssetId} className="mt-4" /> : null}</div> : null}
    </section>
  );
}

function QuizEditorStatusPill({ status }: { status: KaptenQuiz["status"] }) {
  const copy = status === "published" ? "Terbit" : status === "archived" ? "Diarsipkan" : status === "scheduled" ? "Terjadwal" : "Draf";
  const className = status === "published" ? "border-primary-200 bg-primary-50 text-primary-800" : status === "archived" ? "border-secondary-200 bg-secondary-50 text-secondary-700" : "border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{copy}</span>;
}

function KaptenQuizEditorPageModule({
  initialQuestions = [],
  initialQuiz = null,
  mode,
  quizId,
  session,
}: {
  initialQuestions?: QuizQuestionSnapshot[];
  initialQuiz?: KaptenQuiz | null;
  mode: "create" | "edit";
  quizId?: string;
  session: SessionContext;
}) {
  const router = useRouter();
  const initialForm = useState<QuizEditorForm>(() => getInitialForm(initialQuiz, initialQuestions))[0];
  const [form, setForm] = useState<QuizEditorForm>(initialForm);
  const [savedQuiz, setSavedQuiz] = useState<KaptenQuiz | null>(initialQuiz);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(initialForm.questions[0]?.id ?? null);
  const [questionEditorTab, setQuestionEditorTab] = useState("edit");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(mode === "create");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingExitRoute, setPendingExitRoute] = useState<string | null>(null);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);

  const activeQuestion = useMemo(() => form.questions.find((question) => question.id === activeQuestionId) ?? null, [activeQuestionId, form.questions]);
  const editorDisabled = savedQuiz?.status === "archived";
  const scheduleError = form.opensAt && form.closesAt && new Date(form.closesAt) <= new Date(form.opensAt) ? "Waktu tutup harus setelah waktu buka." : null;

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

  function markChanged() {
    setHasUnsavedChanges(true);
    setSaveError(null);
  }

  function patchForm(patch: Partial<QuizEditorForm>) {
    setForm((current) => ({ ...current, ...patch }));
    markChanged();
  }

  function updateActiveQuestion(patch: Partial<QuizQuestionSnapshot>) {
    if (!activeQuestionId || editorDisabled) return;
    setForm((current) => ({ ...current, questions: current.questions.map((question) => question.id === activeQuestionId ? { ...question, ...patch } : question) }));
    markChanged();
  }

  function addQuestion() {
    if (editorDisabled) return;
    const question = createEmptyQuestion();
    setForm((current) => ({ ...current, questions: [...current.questions, question] }));
    setActiveQuestionId(question.id);
    setQuestionEditorTab("edit");
    markChanged();
  }

  function removeQuestion(questionId: string) {
    if (editorDisabled) return;
    const nextQuestions = form.questions.filter((question) => question.id !== questionId);
    setForm((current) => ({ ...current, questions: nextQuestions }));
    if (activeQuestionId === questionId) {
      const next = nextQuestions[Math.max(0, form.questions.findIndex((question) => question.id === questionId) - 1)] ?? nextQuestions[0] ?? null;
      setActiveQuestionId(next?.id ?? null);
    }
    setPendingDeleteId(null);
    markChanged();
  }

  function moveQuestion(questionId: string, direction: "up" | "down") {
    if (editorDisabled) return;
    const index = form.questions.findIndex((question) => question.id === questionId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= form.questions.length) return;
    const questions = [...form.questions];
    const [moved] = questions.splice(index, 1);
    if (!moved) return;
    questions.splice(nextIndex, 0, moved);
    setForm((current) => ({ ...current, questions }));
    markChanged();
  }

  function addChoice() {
    if (!activeQuestion || activeQuestion.choices.length >= 5 || editorDisabled) return;
    updateActiveQuestion({ choices: [...activeQuestion.choices, emptyChoice(activeQuestion.choices.length)] });
  }

  function removeChoice(choiceId: string) {
    if (!activeQuestion || activeQuestion.choices.length <= 2 || editorDisabled) return;
    const choices = activeQuestion.choices.filter((choice) => choice.id !== choiceId);
    updateActiveQuestion({ choices, correctChoiceId: activeQuestion.correctChoiceId === choiceId ? choices[0]?.id ?? "a" : activeQuestion.correctChoiceId });
  }

  function removeMedia(target: MediaPickerTarget) {
    if (!activeQuestion) return;
    if (target.kind === "prompt") updateActiveQuestion({ promptMediaAssetId: undefined });
    else if (target.kind === "explanation") updateActiveQuestion({ explanationMediaAssetId: undefined });
    else updateActiveQuestion({ choices: activeQuestion.choices.map((choice) => choice.id === target.choiceId ? { ...choice, mediaAssetId: undefined } : choice) });
  }

  function selectMediaAsset(asset: MediaAssetDto) {
    if (!mediaPickerTarget || !activeQuestion) return;
    if (mediaPickerTarget.kind === "prompt") updateActiveQuestion({ promptMediaAssetId: asset.id });
    else if (mediaPickerTarget.kind === "explanation") updateActiveQuestion({ explanationMediaAssetId: asset.id });
    else updateActiveQuestion({ choices: activeQuestion.choices.map((choice) => choice.id === mediaPickerTarget.choiceId ? { ...choice, mediaAssetId: asset.id } : choice) });
    setMediaPickerTarget(null);
  }

  async function saveQuiz() {
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
        questions: cloneForSave(form.questions),
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
      showToast("Perubahan Kuis tersimpan.", { variant: "success" });
      if (!quizId) setPendingRouteReplacement(`/mentor/quiz/${result.quiz.id}/editor`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kuis belum dapat disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestExit(route: string) {
    if (hasUnsavedChanges) {
      setPendingExitRoute(route);
      return;
    }
    router.push(route);
  }

  if (mode === "edit") {
    const detailHref = `/mentor/quiz/${quizId}`;
    const subject = kaptenSubjects.find((item) => item.code === form.subjectCode);
    const lifecycleStatus = savedQuiz?.status ?? initialQuiz?.status ?? "draft";
    const selectQuestion = (id: string) => {
      setActiveQuestionId(id);
      setQuestionEditorTab("edit");
    };
    const inventory = <QuestionInventory activeQuestionId={activeQuestionId} disabled={editorDisabled} onAdd={addQuestion} onDelete={setPendingDeleteId} onMove={moveQuestion} onSelect={selectQuestion} questions={form.questions} />;
    const questionEditor = activeQuestion ? (
      <Tabs className="min-w-0 gap-4" onValueChange={setQuestionEditorTab} value={questionEditorTab}>
        <TabsList aria-label="Mode soal" className="w-fit max-w-full overflow-x-auto">
          <TabsTrigger className="min-h-11" value="edit"><Save /> Edit soal</TabsTrigger>
          <TabsTrigger className="min-h-11" value="preview"><Eye /> Preview</TabsTrigger>
        </TabsList>
        <TabsContent className="m-0 min-w-0" value="edit"><QuestionForm disabled={editorDisabled} onAddChoice={addChoice} onChange={updateActiveQuestion} onOpenMedia={setMediaPickerTarget} onRemoveChoice={removeChoice} onRemoveMedia={removeMedia} question={activeQuestion} /></TabsContent>
        <TabsContent className="m-0 min-w-0" value="preview"><QuestionPreview question={activeQuestion} /></TabsContent>
      </Tabs>
    ) : (
      <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-primary-200 bg-white p-8 text-center"><div><CircleHelp aria-hidden="true" className="mx-auto size-8 text-primary-300" /><h2 className="mt-4 text-lg font-semibold text-secondary-900">Pilih soal untuk mulai mengedit</h2><p className="mx-auto mt-2 max-w-sm leading-6 text-secondary-500">Daftar soalmu masih kosong. Tambahkan soal pertama dari panel di sebelah kiri.</p><Button className="mt-5" disabled={editorDisabled} onClick={addQuestion} type="button" variant="brand"><Plus /> Tambah soal</Button></div></div>
    );
    const metadata = <section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-xs sm:p-6"><div className="space-y-6"><div><div className="flex flex-wrap items-center gap-3"><QuizEditorStatusPill status={lifecycleStatus} />{subject ? <Badge size="ui" variant="mint">{subject.code}</Badge> : null}<span className="text-sm text-secondary-500">{form.questions.length} soal</span></div><div className="group mt-3 flex items-start gap-3"><Field className="min-w-0 flex-1 gap-0"><FieldLabel className="sr-only" htmlFor="quiz-editor-title">Judul Kuis</FieldLabel><FieldInput className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-4xl" disabled={editorDisabled} id="quiz-editor-title" onChange={(event) => patchForm({ title: event.target.value })} value={form.title} /></Field><Button aria-label="Ubah judul Kuis" className="mt-1 size-8 shrink-0 text-secondary-400 opacity-60 hover:text-secondary-900 group-hover:opacity-100" onClick={() => document.getElementById("quiz-editor-title")?.focus()} size="icon-sm" title="Ubah judul Kuis" type="button" variant="ghost"><Pencil className="size-4" /></Button></div></div><Field className="border-t border-primary-100/70 pt-4"><FieldLabel htmlFor="quiz-editor-description">Deskripsi <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldTextarea className="min-h-[96px]" disabled={editorDisabled} id="quiz-editor-description" onChange={(event) => patchForm({ description: event.target.value })} placeholder="Tuliskan deskripsi ringkas tentang Kuis ini…" value={form.description} /></Field><div className="grid gap-5 border-t border-primary-100/70 pt-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="quiz-editor-subject">Subjek</FieldLabel><DropdownField disabled={editorDisabled} id="quiz-editor-subject" onValueChange={(value) => patchForm({ subjectCode: value })} options={kaptenSubjects.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.code }))} placeholder="Pilih subjek" value={form.subjectCode} /></Field><div><p className="text-base leading-7 text-primary-900">Struktur</p><p className="mt-[5px] text-sm leading-6 text-secondary-500">Soal tersimpan lokal di Kuis ini dan tidak mengubah Bank Soal.</p></div></div></div></section>;

    return <div className="flex h-screen flex-col overflow-hidden bg-secondary-50/40" data-quiz-editor-shell="full-page">
      <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-100 bg-white px-3 py-2 shadow-xs md:h-14 md:flex-nowrap md:px-6 md:py-0"><div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3"><Button aria-label="Kembali ke detail Kuis" onClick={() => requestExit(detailHref)} size="sm" type="button" variant="ghost"><ChevronLeft /><span className="hidden font-medium sm:inline">Kembali ke Detail</span></Button><div className="h-5 w-px bg-primary-100" /><div className="flex min-w-0 items-center gap-2.5"><h1 className="max-w-[150px] truncate text-base font-bold text-secondary-900 sm:max-w-xs md:max-w-md">{form.title || "Kuis"}</h1>{hasUnsavedChanges ? <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"><span aria-hidden="true" className="size-1.5 rounded-full bg-[#d29b18]" />Belum disimpan</span> : null}{subject ? <Badge className="hidden sm:inline-flex" size="ui" variant="mint">{subject.code}</Badge> : null}</div></div><div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto"><Button aria-busy={isSaving} aria-label="Simpan" disabled={isSaving || editorDisabled} onClick={() => void saveQuiz()} size="sm" title="Simpan perubahan" type="button" variant={hasUnsavedChanges ? "brand" : "brandOutline"}><Save />{isSaving ? "Menyimpan…" : "Simpan"}</Button></div></header>
      {saveError ? <div className="border-b border-student-status-danger-border bg-student-status-danger-bg px-4 py-2.5 md:px-6"><p aria-live="assertive" className="text-xs font-semibold text-student-status-danger-fg" role="alert">{saveError}</p></div> : null}
      {scheduleError ? <div className="border-b border-student-status-danger-border bg-student-status-danger-bg px-4 py-2.5 md:px-6"><p className="text-xs font-semibold text-student-status-danger-fg" role="alert">{scheduleError}</p></div> : null}
      <div className="border-b border-primary-100 bg-white px-3 py-3 md:hidden">{inventory}</div>
      <div className="flex min-h-0 flex-1 overflow-hidden"><div className="hidden w-72 shrink-0 overflow-y-auto border-r border-primary-100 bg-white md:flex lg:w-80 [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">{inventory}</div><main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8"><div className="mx-auto max-w-4xl space-y-6">{metadata}<div className="flex min-h-11 flex-wrap items-center gap-3"><h2 className="text-2xl font-semibold text-secondary-900">Edit soal</h2></div>{questionEditor}</div></main></div>
      <MediaPickerDialog onOpenChange={(open) => { if (!open) setMediaPickerTarget(null); }} onSelect={selectMediaAsset} open={Boolean(mediaPickerTarget)} selectedAssetId={mediaPickerTarget?.kind === "prompt" ? activeQuestion?.promptMediaAssetId : mediaPickerTarget?.kind === "explanation" ? activeQuestion?.explanationMediaAssetId : activeQuestion?.choices.find((choice) => choice.id === mediaPickerTarget?.choiceId)?.mediaAssetId} title={mediaPickerTarget?.label ?? "Pilih gambar"} />
      <AlertDialog onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }} open={Boolean(pendingDeleteId)}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Hapus soal ini?</AlertDialogTitle><AlertDialogDescription>Soal akan dihapus dari Kuis ini. Bank atau sumber lain tidak akan berubah.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDeleteId) removeQuestion(pendingDeleteId); }} variant="destructive">Hapus soal</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog onOpenChange={(open) => { if (!open) setPendingExitRoute(null); }} open={Boolean(pendingExitRoute)}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><CircleHelp /></AlertDialogMedia><AlertDialogTitle>Keluar tanpa menyimpan?</AlertDialogTitle><AlertDialogDescription>Perubahan Kuis yang belum disimpan akan hilang.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setPendingExitRoute(null)}>Tetap di editor</AlertDialogCancel><AlertDialogAction onClick={() => { const route = pendingExitRoute; setPendingExitRoute(null); if (route) router.push(route); }} variant="destructive">Keluar tanpa menyimpan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>;
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={mode === "create" ? "Buat Kuis" : `${initialQuiz?.title ?? "Edit Kuis"} · Editor`}
      contentElement="div"
      mainClassName="max-w-[1500px] gap-6"
      onNavigateAway={() => !hasUnsavedChanges}
      session={session}
      showSearch={false}
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button aria-label={mode === "create" ? "Kembali ke daftar Kuis" : "Kembali ke Detail Kuis"} nativeButton={false} render={<Link href={quizId ? `/mentor/quiz/${quizId}` : "/mentor/quiz"} />} size="sm" type="button" variant="ghost"><ChevronLeft /> {mode === "create" ? "Kembali ke Kuis" : "Kembali ke Detail"}</Button>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-[-0.03em] text-secondary-900 sm:text-3xl">{form.title || "Kuis tanpa judul"}</h1>
            {hasUnsavedChanges ? <span className="rounded-full border border-student-status-attention-border bg-student-status-attention-bg px-2.5 py-1 text-xs font-semibold text-student-status-attention-fg">Belum disimpan</span> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-secondary-500">Editor soal mandiri · {form.questions.length} soal</p>
        </div>
        <Button aria-busy={isSaving} disabled={isSaving || editorDisabled} onClick={() => void saveQuiz()} type="button" variant="brand"><Save /> {isSaving ? "Menyimpan…" : "Simpan"}</Button>
      </header>

      {saveError ? <p aria-live="assertive" className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">{saveError}</p> : null}
      {scheduleError ? <p className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">{scheduleError}</p> : null}

      <section className="grid gap-4 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.38fr)] md:p-6">
        <Field><FieldLabel htmlFor="quiz-editor-title">Judul Kuis</FieldLabel><FieldInput disabled={editorDisabled} id="quiz-editor-title" onChange={(event) => patchForm({ title: event.target.value })} value={form.title} /></Field>
        <Field><FieldLabel htmlFor="quiz-editor-subject">Subjek</FieldLabel><DropdownField disabled={editorDisabled} id="quiz-editor-subject" onValueChange={(value) => patchForm({ subjectCode: value })} options={kaptenSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.code }))} placeholder="Pilih subjek" value={form.subjectCode} /></Field>
        <Field className="md:col-span-2"><FieldLabel htmlFor="quiz-editor-description">Deskripsi <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldTextarea className="min-h-[96px]" disabled={editorDisabled} id="quiz-editor-description" onChange={(event) => patchForm({ description: event.target.value })} value={form.description} /></Field>
      </section>

      <div className="xl:hidden"><QuestionInventory activeQuestionId={activeQuestionId} disabled={editorDisabled} onAdd={addQuestion} onDelete={setPendingDeleteId} onMove={moveQuestion} onSelect={(id) => { setActiveQuestionId(id); setQuestionEditorTab("edit"); }} questions={form.questions} /></div>
      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(250px,0.3fr)_minmax(0,0.7fr)]">
        <aside className="hidden min-w-0 xl:block"><div className="sticky top-6"><QuestionInventory activeQuestionId={activeQuestionId} disabled={editorDisabled} onAdd={addQuestion} onDelete={setPendingDeleteId} onMove={moveQuestion} onSelect={(id) => { setActiveQuestionId(id); setQuestionEditorTab("edit"); }} questions={form.questions} /></div></aside>
        <section className="min-w-0" ref={(node) => { if (node && activeQuestionId) node.dataset.activeQuestionId = activeQuestionId; }}>
          {activeQuestion ? (
            <Tabs className="min-w-0 gap-4" onValueChange={setQuestionEditorTab} value={questionEditorTab}>
              <TabsList aria-label="Mode soal" className="w-fit max-w-full overflow-x-auto">
                <TabsTrigger className="min-h-11" value="edit"><Save /> Edit soal</TabsTrigger>
                <TabsTrigger className="min-h-11" value="preview"><Eye /> Preview</TabsTrigger>
              </TabsList>
              <TabsContent className="m-0 min-w-0" value="edit"><QuestionForm disabled={editorDisabled} onAddChoice={addChoice} onChange={updateActiveQuestion} onOpenMedia={setMediaPickerTarget} onRemoveChoice={removeChoice} onRemoveMedia={removeMedia} question={activeQuestion} /></TabsContent>
              <TabsContent className="m-0 min-w-0" value="preview"><QuestionPreview question={activeQuestion} /></TabsContent>
            </Tabs>
          ) : (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-primary-200 bg-white p-8 text-center"><div><CircleHelp aria-hidden="true" className="mx-auto size-8 text-primary-300" /><h2 className="mt-4 text-lg font-semibold text-secondary-900">Pilih soal untuk mulai mengedit</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-secondary-500">Daftar soalmu masih kosong. Tambahkan soal pertama dari panel di sebelah kiri.</p><Button className="mt-5" disabled={editorDisabled} onClick={addQuestion} type="button" variant="brand"><Plus /> Tambah soal</Button></div></div>
          )}
        </section>
      </section>

      <MediaPickerDialog onOpenChange={(open) => { if (!open) setMediaPickerTarget(null); }} onSelect={selectMediaAsset} open={Boolean(mediaPickerTarget)} selectedAssetId={mediaPickerTarget?.kind === "prompt" ? activeQuestion?.promptMediaAssetId : mediaPickerTarget?.kind === "explanation" ? activeQuestion?.explanationMediaAssetId : activeQuestion?.choices.find((choice) => choice.id === mediaPickerTarget?.choiceId)?.mediaAssetId} title={mediaPickerTarget?.label ?? "Pilih gambar"} />
      <AlertDialog onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }} open={Boolean(pendingDeleteId)}>
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader><AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Hapus soal ini?</AlertDialogTitle><AlertDialogDescription>Soal akan dihapus dari Kuis ini. Bank atau sumber lain tidak akan berubah.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setPendingDeleteId(null)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingDeleteId) removeQuestion(pendingDeleteId); }} variant="destructive">Hapus soal</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizEditorPageModule };
