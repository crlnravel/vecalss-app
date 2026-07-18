"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  fieldControlClassName,
} from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { MediaAssetDto } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  type BankQuestion,
  type KaptenQuestionBank,
} from "@/modules/mentor/mock-data";
import {
  getSubjectName,
  saveQuestionBankDraft,
  useStoredQuestionBankDraft,
} from "@/modules/mentor/question-bank-draft-storage";

const INVENTORY_QUESTIONS_PER_PAGE = 8;

type ConfirmationRequest = {
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  title: string;
};

type MediaPickerTarget =
  | { kind: "choice"; choiceId: string; label: string }
  | { kind: "explanation"; label: string }
  | { kind: "prompt"; label: string };

function QuestionMediaAttachment({
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
    <div className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 p-3">
      <MediaAssetPreview alt={label} assetId={assetId} className="max-h-48 bg-white" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onReplace} size="sm" type="button" variant="brandOutline">
          <ImagePlus data-icon="inline-start" />
          Ganti
        </Button>
        <Button onClick={onRemove} size="sm" type="button" variant="ghost">
          <X data-icon="inline-start" />
          Lepas
        </Button>
      </div>
    </div>
  );
}

const emptyQuestion = (bankId: string, subjectCode: string): BankQuestion => ({
  bankId,
  choices: [
    { id: "a", text: "" },
    { id: "b", text: "" },
    { id: "c", text: "" },
    { id: "d", text: "" },
  ],
  correctChoiceId: "a",
  difficulty: "medium",
  explanation: "",
  id: "",
  prompt: "",
  subjectCode,
  tags: [],
});

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || "bank-soal-baru";
}

function difficultyMix(questions: BankQuestion[]) {
  if (questions.length === 0) return "Belum ada soal";
  const counts = questions.reduce<Record<string, number>>((result, question) => {
    result[question.difficulty] = (result[question.difficulty] ?? 0) + 1;
    return result;
  }, {});
  return ["easy", "medium", "hard"]
    .filter((difficulty) => counts[difficulty])
    .map((difficulty) => `${Math.round(((counts[difficulty] ?? 0) / questions.length) * 100)}% ${difficulty === "easy" ? "mudah" : difficulty === "medium" ? "sedang" : "sulit"}`)
    .join(", ");
}

function isReady(question: BankQuestion) {
  return question.prompt.trim() && question.choices.length === 4 && question.choices.every((choice) => choice.text.trim()) && question.choices.some((choice) => choice.id === question.correctChoiceId);
}

function KaptenQuestionBankBuilderPageModule({
  bankId,
  initialBank = null,
  initialQuestions = [],
  mode,
  session,
}: {
  bankId?: string;
  initialBank?: KaptenQuestionBank | null;
  initialQuestions?: BankQuestion[];
  mode: "create" | "edit";
  session: SessionContext;
}) {
  const router = useRouter();
  const storedDraft = useStoredQuestionBankDraft(bankId ?? initialBank?.id ?? "");
  const [localBuilderState, setLocalBuilderState] = useState(() => ({
    description: initialBank?.description ?? "",
    questions: initialQuestions,
    subjectCode: initialBank?.subjectCode ?? "PU",
    title: initialBank?.title ?? "Bank Soal Baru",
    topic: initialBank?.topic ?? "",
  }));
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("information");
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [questionDraft, setQuestionDraft] = useState<BankQuestion>(() => emptyQuestion(
    bankId ?? initialBank?.id ?? "new-bank",
    initialBank?.subjectCode ?? "PU",
  ));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);

  const builderState = useMemo(() => {
    if (!hasUnsavedChanges && storedDraft) {
      return {
        description: storedDraft.bank.description,
        questions: storedDraft.questions,
        subjectCode: storedDraft.bank.subjectCode ?? "PU",
        title: storedDraft.bank.title,
        topic: storedDraft.bank.topic ?? "",
      };
    }

    return localBuilderState;
  }, [hasUnsavedChanges, localBuilderState, storedDraft]);

  const activeQuestion = activeQuestionId
    ? builderState.questions.find((question) => question.id === activeQuestionId) ?? null
    : null;
  const readyCount = builderState.questions.filter(isReady).length;
  const subjectLocked = builderState.questions.length > 0;
  const lifecycleStatus = storedDraft?.bank.status ?? initialBank?.status ?? "draft";
  const isDraftLifecycle = lifecycleStatus === "draft";
  const saveLabel = isDraftLifecycle ? "Simpan Draft" : "Simpan perubahan";
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(builderState.questions.length / INVENTORY_QUESTIONS_PER_PAGE),
  );
  const visibleInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const paginatedQuestions = builderState.questions.slice(
    (visibleInventoryPage - 1) * INVENTORY_QUESTIONS_PER_PAGE,
    visibleInventoryPage * INVENTORY_QUESTIONS_PER_PAGE,
  );
  const selectedMediaAssetId = mediaPickerTarget?.kind === "prompt"
    ? questionDraft.promptMediaAssetId
    : mediaPickerTarget?.kind === "explanation"
      ? questionDraft.explanationMediaAssetId
      : mediaPickerTarget?.kind === "choice"
        ? questionDraft.choices.find((choice) => choice.id === mediaPickerTarget.choiceId)?.mediaAssetId
        : undefined;

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) {
      return;
    }

    // The shell consumes its synthetic history entry before this replacement,
    // leaving the saved route with one ordinary Back step.
    const frame = window.requestAnimationFrame(() => {
      router.replace(pendingRouteReplacement);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);

  function markChanged(nextState: typeof builderState) {
    setLocalBuilderState(nextState);
    setHasUnsavedChanges(true);
  }

  function updateMetadata(field: "title" | "description" | "topic", value: string) {
    markChanged({ ...builderState, [field]: value });
  }

  function closeConfirmation() {
    setConfirmationRequest(null);
  }

  function confirmPendingAction() {
    const pendingRequest = confirmationRequest;

    closeConfirmation();
    pendingRequest?.onConfirm();
  }

  function selectSubject(subjectCode: string) {
    if (subjectLocked || subjectCode === builderState.subjectCode) return;
    setQuestionDraft((question) => ({ ...question, subjectCode }));
    markChanged({ ...builderState, subjectCode });
  }

  function openQuestion(question: BankQuestion) {
    setActiveQuestionId(question.id);
    setQuestionDraft({ ...question, choices: question.choices.map((choice) => ({ ...choice })), tags: [...question.tags] });
  }

  function updateQuestionDraft(next: BankQuestion) {
    setQuestionDraft(next);
    if (!activeQuestionId) return;
    markChanged({
      ...builderState,
      questions: builderState.questions.map((question) => question.id === activeQuestionId ? next : question),
    });
  }

  function selectMediaAsset(asset: MediaAssetDto) {
    if (!mediaPickerTarget) return;

    if (mediaPickerTarget.kind === "prompt") {
      updateQuestionDraft({ ...questionDraft, promptMediaAssetId: asset.id });
      return;
    }

    if (mediaPickerTarget.kind === "explanation") {
      updateQuestionDraft({ ...questionDraft, explanationMediaAssetId: asset.id });
      return;
    }

    updateQuestionDraft({
      ...questionDraft,
      choices: questionDraft.choices.map((choice) => choice.id === mediaPickerTarget.choiceId
        ? { ...choice, mediaAssetId: asset.id }
        : choice),
    });
  }

  function removeChoiceMedia(choiceId: string) {
    updateQuestionDraft({
      ...questionDraft,
      choices: questionDraft.choices.map((choice) => choice.id === choiceId
        ? { ...choice, mediaAssetId: undefined }
        : choice),
    });
  }

  function addQuestion() {
    const id = `${builderState.subjectCode.toLowerCase()}-question-${Date.now()}`;
    const nextQuestion = { ...emptyQuestion(bankId ?? initialBank?.id ?? id, builderState.subjectCode), id };
    markChanged({ ...builderState, questions: [...builderState.questions, nextQuestion] });
    setActiveQuestionId(id);
    setInventoryPage(Math.ceil((builderState.questions.length + 1) / INVENTORY_QUESTIONS_PER_PAGE));
    setQuestionDraft(nextQuestion);
  }

  function removeQuestion(id: string) {
    const questions = builderState.questions.filter((question) => question.id !== id);
    markChanged({ ...builderState, questions });
    if (activeQuestionId === id) {
      setActiveQuestionId(null);
      setQuestionDraft(emptyQuestion(bankId ?? initialBank?.id ?? "new-bank", builderState.subjectCode));
    }
  }

  function requestQuestionRemoval(id: string) {
    const question = builderState.questions.find((item) => item.id === id);
    const questionLabel = question?.prompt || "Soal tanpa pertanyaan";

    setConfirmationRequest({
      confirmLabel: "Hapus soal",
      description: `“${questionLabel}” akan dihapus dari Bank Soal dan tidak dapat dikembalikan.`,
      onConfirm: () => removeQuestion(id),
      title: "Hapus soal ini?",
    });
  }

  function saveDraft() {
    const id = initialBank?.id ?? bankId ?? `bank-${slugify(builderState.title)}-${Date.now()}`;
    const bank: KaptenQuestionBank = {
      description: builderState.description,
      difficultyMix: difficultyMix(builderState.questions),
      href: `/mentor/quiz/question-bank/${id}`,
      id,
      primaryMetric: `${builderState.questions.length} soal`,
      progress: builderState.questions.length ? Math.round((readyCount / builderState.questions.length) * 100) : 0,
      questionCount: builderState.questions.length,
      resourceType: "question-bank",
      reusableIn: ["Quiz"],
      status: lifecycleStatus,
      subjectCode: builderState.subjectCode,
      subjectName: getSubjectName(builderState.subjectCode),
      title: builderState.title || "Bank Soal Baru",
      topic: builderState.topic,
      updatedAt: "Diedit baru saja",
    };
    const questions = builderState.questions.map((question) => ({
      ...question,
      bankId: id,
      subjectCode: builderState.subjectCode,
      choices: question.choices.map((choice) => ({ ...choice })),
      tags: [...question.tags],
    }));

    saveQuestionBankDraft({ bank, questions });
    setLocalBuilderState({ ...builderState, questions });
    setHasUnsavedChanges(false);
    if (mode === "create") setPendingRouteReplacement(`/mentor/quiz/question-bank/${id}`);
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Bank Soal"
      breadcrumbLabel={mode === "create" ? "Buat Bank Soal" : "Edit Bank Soal"}
      mainClassName="max-w-[1500px] gap-7"
      onNavigateAway={() => !hasUnsavedChanges}
      searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
      session={session}
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button render={<Link href="/mentor/quiz/question-bank" />} size="sm" variant="ghost">
            <ArrowLeft />
            Question Bank
          </Button>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
              {mode === "create" ? "Buat Bank Soal" : builderState.title}
            </h1>
            <span className={cn("inline-flex items-center gap-2 text-sm font-medium", hasUnsavedChanges ? "text-[#856300]" : "text-primary-800")}>
              <span aria-hidden="true" className={cn("size-2 rounded-full", hasUnsavedChanges ? "bg-[#d29b18]" : "bg-primary-700")} />
              {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
            </span>
          </div>
          {builderState.questions.length > 0 ? (
            <p className="mt-2 text-sm text-secondary-500">{readyCount}/{builderState.questions.length} soal siap</p>
          ) : null}
        </div>
        <Button onClick={saveDraft} type="button" variant="brand"><Save /> {saveLabel}</Button>
      </section>

      <Tabs className="gap-8" onValueChange={setActiveTab} value={activeTab}>
        <div className="border-b border-primary-100">
          <TabsList className="h-auto gap-4 rounded-none bg-transparent p-0" variant="line">
            <TabsTrigger className="h-11 rounded-none px-1 text-sm" value="information">Informasi bank</TabsTrigger>
            <TabsTrigger className="h-11 rounded-none px-1 text-sm" value="content">
              Isi bank
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">{builderState.questions.length}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="m-0" value="information">
          <section className="w-full">
            <div className="grid gap-5 lg:grid-cols-2">
              <Field><FieldLabel htmlFor="bank-title">Judul bank</FieldLabel><FieldInput id="bank-title" onChange={(event) => updateMetadata("title", event.target.value)} value={builderState.title} /></Field>
              <Field><FieldLabel htmlFor="bank-topic">Topik <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldInput id="bank-topic" onChange={(event) => updateMetadata("topic", event.target.value)} value={builderState.topic} /></Field>
              <Field><FieldLabel htmlFor="bank-subject">Subject</FieldLabel><div className="relative"><select className={`${fieldControlClassName} appearance-none pr-12`} disabled={subjectLocked} id="bank-subject" onChange={(event) => selectSubject(event.target.value)} value={builderState.subjectCode}>{kaptenSubjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>)}</select><ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" /></div>{subjectLocked ? <p className="mt-2 text-xs text-secondary-500">Subject terkunci setelah soal pertama ditambahkan.</p> : null}</Field>
              <Field className="lg:col-span-2"><FieldLabel htmlFor="bank-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-[100px]" id="bank-description" onChange={(event) => updateMetadata("description", event.target.value)} value={builderState.description} /></Field>
            </div>
          </section>
        </TabsContent>

        <TabsContent className="m-0" value="content">
          <section className="grid gap-8 xl:grid-cols-[minmax(0,0.7fr)_minmax(270px,0.3fr)]">
            <div className="order-1 xl:order-none">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-secondary-900">{activeQuestion ? "Edit soal" : "Soal aktif"}</p><p className="mt-1 text-sm text-secondary-500">Simpan soal lengkap atau biarkan belum lengkap untuk dilanjutkan nanti.</p></div><Button onClick={addQuestion} type="button" variant="brandOutline"><Plus /> Tambah soal</Button></div>
              <div className="mt-5 grid gap-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
                <Field>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel htmlFor="question-prompt">Pertanyaan</FieldLabel>
                    <Button disabled={!activeQuestionId} onClick={() => setMediaPickerTarget({ kind: "prompt", label: "Gambar pertanyaan" })} size="sm" type="button" variant="ghost">
                      <ImagePlus data-icon="inline-start" />
                      {questionDraft.promptMediaAssetId ? "Ganti gambar" : "Tambah gambar"}
                    </Button>
                  </div>
                  <FieldTextarea id="question-prompt" onChange={(event) => updateQuestionDraft({ ...questionDraft, prompt: event.target.value })} value={questionDraft.prompt} />
                  {questionDraft.promptMediaAssetId ? (
                    <QuestionMediaAttachment
                      assetId={questionDraft.promptMediaAssetId}
                      label="Gambar pertanyaan"
                      onRemove={() => updateQuestionDraft({ ...questionDraft, promptMediaAssetId: undefined })}
                      onReplace={() => setMediaPickerTarget({ kind: "prompt", label: "Gambar pertanyaan" })}
                    />
                  ) : null}
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  {questionDraft.choices.map((choice, index) => {
                    const choiceLabel = String.fromCharCode(65 + index);
                    const inputId = `bank-choice-${choice.id}`;

                    return (
                      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-primary-100 px-3 py-3" key={choice.id}>
                        <div className="flex min-w-0 items-center gap-3">
                          <input
                            aria-label={`Jawaban benar opsi ${index + 1}`}
                            checked={choice.id === questionDraft.correctChoiceId}
                            className="size-4 accent-primary-700"
                            name="bank-correct-choice"
                            onChange={() => updateQuestionDraft({ ...questionDraft, correctChoiceId: choice.id })}
                            type="radio"
                          />
                          <label className="text-xs font-semibold text-primary-800" htmlFor={inputId}>{choiceLabel}</label>
                          <input
                            aria-label={`Opsi ${index + 1}`}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400"
                            id={inputId}
                            onChange={(event) => updateQuestionDraft({
                              ...questionDraft,
                              choices: questionDraft.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item),
                            })}
                            placeholder={`Opsi ${choiceLabel}`}
                            value={choice.text}
                          />
                          <Button
                            aria-label={`${choice.mediaAssetId ? "Ganti" : "Tambah"} gambar opsi ${choiceLabel}`}
                            disabled={!activeQuestionId}
                            onClick={() => setMediaPickerTarget({ kind: "choice", choiceId: choice.id, label: `Gambar opsi ${choiceLabel}` })}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <ImagePlus />
                          </Button>
                        </div>
                        {choice.mediaAssetId ? (
                          <QuestionMediaAttachment
                            assetId={choice.mediaAssetId}
                            label={`Gambar opsi ${choiceLabel}`}
                            onRemove={() => removeChoiceMedia(choice.id)}
                            onReplace={() => setMediaPickerTarget({ kind: "choice", choiceId: choice.id, label: `Gambar opsi ${choiceLabel}` })}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-5 sm:grid-cols-2"><Field><FieldLabel htmlFor="question-difficulty">Tingkat kesulitan</FieldLabel><select className={fieldControlClassName} id="question-difficulty" onChange={(event) => updateQuestionDraft({ ...questionDraft, difficulty: event.target.value as BankQuestion["difficulty"] })} value={questionDraft.difficulty}><option value="easy">Mudah</option><option value="medium">Sedang</option><option value="hard">Sulit</option></select></Field><Field><FieldLabel htmlFor="question-tags">Tags <span className="font-normal text-secondary-400">(pisahkan koma)</span></FieldLabel><FieldInput id="question-tags" onChange={(event) => updateQuestionDraft({ ...questionDraft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} value={questionDraft.tags.join(", ")} /></Field></div>
                <Field>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel htmlFor="question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel>
                    <Button disabled={!activeQuestionId} onClick={() => setMediaPickerTarget({ kind: "explanation", label: "Gambar penjelasan" })} size="sm" type="button" variant="ghost">
                      <ImagePlus data-icon="inline-start" />
                      {questionDraft.explanationMediaAssetId ? "Ganti gambar" : "Tambah gambar"}
                    </Button>
                  </div>
                  <FieldTextarea id="question-explanation" onChange={(event) => updateQuestionDraft({ ...questionDraft, explanation: event.target.value })} value={questionDraft.explanation} />
                  {questionDraft.explanationMediaAssetId ? (
                    <QuestionMediaAttachment
                      assetId={questionDraft.explanationMediaAssetId}
                      label="Gambar penjelasan"
                      onRemove={() => updateQuestionDraft({ ...questionDraft, explanationMediaAssetId: undefined })}
                      onReplace={() => setMediaPickerTarget({ kind: "explanation", label: "Gambar penjelasan" })}
                    />
                  ) : null}
                </Field>
                {activeQuestionId ? <Button onClick={() => requestQuestionRemoval(activeQuestionId)} type="button" variant="ghost"><Trash2 /> Hapus soal ini</Button> : <p className="text-sm text-secondary-500">Pilih soal di inventori atau tambah soal baru untuk mulai mengedit.</p>}
              </div>
            </div>

            <aside className="order-2 border-t border-primary-100 pt-5 xl:order-none xl:border-t-0 xl:border-l xl:pl-7 xl:pt-1">
              <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-secondary-900">Inventori soal</p><p className="mt-1 text-xs text-secondary-500">{builderState.questions.length} soal · {readyCount} siap</p></div><Button onClick={addQuestion} size="icon-sm" type="button" variant="brandOutline"><Plus /></Button></div>
              <div className="mt-4 flex gap-1 overflow-x-auto border-t border-primary-100 pt-3 xl:mt-5 xl:block xl:space-y-1">
                {paginatedQuestions.length > 0 ? paginatedQuestions.map((question, index) => (
                  <div className={cn("flex min-w-[220px] items-center gap-2 rounded-2xl px-2 py-2 transition-colors xl:w-full", activeQuestionId === question.id ? "bg-primary-50" : "hover:bg-primary-50/60")} key={question.id}>
                    <button className="min-w-0 flex-1 text-left" onClick={() => openQuestion(question)} type="button"><span className="block truncate text-sm font-semibold text-secondary-900">{String((visibleInventoryPage - 1) * INVENTORY_QUESTIONS_PER_PAGE + index + 1).padStart(2, "0")}. {question.prompt || "Soal tanpa pertanyaan"}</span><span className="mt-1 block text-xs text-secondary-500">{isReady(question) ? "Siap dipakai Quiz" : "Belum lengkap"}</span></button>
                    <Button aria-label={`Hapus soal ${index + 1}`} onClick={() => requestQuestionRemoval(question.id)} size="icon-sm" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button>
                  </div>
                )) : <p className="px-2 py-4 text-sm leading-6 text-secondary-500">Belum ada soal. Tambahkan soal pertama untuk mengunci subject.</p>}
              </div>
              {builderState.questions.length > 0 ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-sm text-secondary-500">Halaman {visibleInventoryPage} dari {inventoryPageCount}</p><div className="flex items-center gap-2"><Button aria-label="Halaman sebelumnya" disabled={visibleInventoryPage === 1} onClick={() => setInventoryPage(visibleInventoryPage - 1)} size="sm" type="button" variant="brandOutline"><ChevronLeft /> Sebelumnya</Button><Button aria-label="Halaman berikutnya" disabled={visibleInventoryPage === inventoryPageCount} onClick={() => setInventoryPage(visibleInventoryPage + 1)} size="sm" type="button" variant="brandOutline">Berikutnya <ChevronRight /></Button></div></div> : null}
            </aside>
          </section>
        </TabsContent>
      </Tabs>

      <MediaPickerDialog
        onOpenChange={(isOpen) => { if (!isOpen) setMediaPickerTarget(null); }}
        onSelect={selectMediaAsset}
        open={Boolean(mediaPickerTarget)}
        selectedAssetId={selectedMediaAssetId}
        title={mediaPickerTarget?.label ?? "Pilih gambar"}
      />

      <Dialog onOpenChange={(isOpen) => { if (!isOpen) closeConfirmation(); }} open={Boolean(confirmationRequest)}>
        <DialogContent className="gap-5 border-red-100 bg-white p-6 sm:max-w-3xl" showCloseButton={false}>
          <Alert className="border-red-200 bg-transparent text-secondary-900" variant="destructive"><CircleHelp className="text-red-700" /><AlertTitle><DialogTitle className="font-semibold text-secondary-900">{confirmationRequest?.title}</DialogTitle></AlertTitle><AlertDescription className="mt-1 text-red-700"><DialogDescription className="whitespace-normal text-red-700 sm:whitespace-nowrap">{confirmationRequest?.description}</DialogDescription></AlertDescription></Alert>
          <DialogFooter><Button onClick={closeConfirmation} type="button" variant="brandOutline">Batal</Button><Button className="border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:border-red-700 focus-visible:ring-red-700/25" onClick={confirmPendingAction} type="button" variant="destructive">{confirmationRequest?.confirmLabel}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankBuilderPageModule };
