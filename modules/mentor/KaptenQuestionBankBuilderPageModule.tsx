"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
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
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  saveQuestionBankAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

const INVENTORY_QUESTIONS_PER_PAGE = 9;

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
      <MediaAssetPreview
        alt={label}
        assetId={assetId}
        className="max-h-48 bg-white"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={onReplace}
          size="sm"
          type="button"
          variant="brandOutline"
        >
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
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "bank-soal-baru";
}

function isReady(question: BankQuestion) {
  return (
    question.prompt.trim() &&
    question.choices.length >= 2 &&
    question.choices.length <= 5 &&
    question.choices.every((choice) => choice.text.trim()) &&
    question.choices.some((choice) => choice.id === question.correctChoiceId)
  );
}

function toQuestionDraft(question: BankQuestion): BankQuestion {
  return {
    ...question,
    choices: question.choices.map((choice) => ({ ...choice })),
    tags: [],
  };
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
  const [localBuilderState, setLocalBuilderState] = useState(() => {
    const subjectCode = initialBank?.subjectCode ?? "PU";
    const fallbackQuestionId = `${subjectCode.toLowerCase()}-question-${Date.now()}`;
    const questions = initialQuestions.length
      ? initialQuestions
      : [{ ...emptyQuestion(bankId ?? initialBank?.id ?? fallbackQuestionId, subjectCode), id: fallbackQuestionId }];

    return {
      description: initialBank?.description ?? "",
      questions,
      subjectCode,
      title: initialBank?.title ?? "Bank Soal Baru",
    };
  });
  const initialQuestion = localBuilderState.questions[0]!;
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(initialQuestion.id);
  const [activeTab, setActiveTab] = useState("information");
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [questionDraft, setQuestionDraft] = useState<BankQuestion>(() =>
    toQuestionDraft(initialQuestion),
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(
    initialQuestions.length === 0,
  );
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<
    string | null
  >(null);
  const [mediaPickerTarget, setMediaPickerTarget] =
    useState<MediaPickerTarget | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState(initialBank?.status ?? "draft");
  const [revision, setRevision] = useState(initialBank?.revision);
  const [isSaving, setIsSaving] = useState(false);
  const [questionEditorTab, setQuestionEditorTab] = useState("edit");
  const [previewChoiceId, setPreviewChoiceId] = useState<string | null>(null);
  const [hasSubmittedPreview, setHasSubmittedPreview] = useState(false);

  const builderState = localBuilderState;

  const activeQuestion = activeQuestionId
    ? (builderState.questions.find(
        (question) => question.id === activeQuestionId,
      ) ?? null)
    : null;
  const isQuestionContentLocked = lifecycleStatus === "published";
  const isDraftLifecycle = lifecycleStatus === "draft";
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(builderState.questions.length / INVENTORY_QUESTIONS_PER_PAGE),
  );
  const visibleInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const paginatedQuestions = builderState.questions.slice(
    (visibleInventoryPage - 1) * INVENTORY_QUESTIONS_PER_PAGE,
    visibleInventoryPage * INVENTORY_QUESTIONS_PER_PAGE,
  );
  const selectedQuestionSubject = kaptenSubjects.find(
    (subject) => subject.code === questionDraft.subjectCode,
  );
  const selectedMediaAssetId =
    mediaPickerTarget?.kind === "prompt"
      ? questionDraft.promptMediaAssetId
      : mediaPickerTarget?.kind === "explanation"
        ? questionDraft.explanationMediaAssetId
        : mediaPickerTarget?.kind === "choice"
          ? questionDraft.choices.find(
              (choice) => choice.id === mediaPickerTarget.choiceId,
            )?.mediaAssetId
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

  function updateMetadata(
    field: "title" | "description",
    value: string,
  ) {
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

  function openQuestion(question: BankQuestion) {
    setActiveQuestionId(question.id);
    setQuestionEditorTab("edit");
    setPreviewChoiceId(null);
    setHasSubmittedPreview(false);
    setQuestionDraft(toQuestionDraft(question));
  }

  function updateQuestionDraft(next: BankQuestion) {
    if (isQuestionContentLocked) return;
    setQuestionDraft(next);
    if (!activeQuestionId) return;
    markChanged({
      ...builderState,
      questions: builderState.questions.map((question) =>
        question.id === activeQuestionId ? next : question,
      ),
    });
  }

  function selectMediaAsset(asset: MediaAssetDto) {
    if (!mediaPickerTarget) return;

    if (mediaPickerTarget.kind === "prompt") {
      updateQuestionDraft({ ...questionDraft, promptMediaAssetId: asset.id });
      return;
    }

    if (mediaPickerTarget.kind === "explanation") {
      updateQuestionDraft({
        ...questionDraft,
        explanationMediaAssetId: asset.id,
      });
      return;
    }

    updateQuestionDraft({
      ...questionDraft,
      choices: questionDraft.choices.map((choice) =>
        choice.id === mediaPickerTarget.choiceId
          ? { ...choice, mediaAssetId: asset.id }
          : choice,
      ),
    });
  }

  function removeChoiceMedia(choiceId: string) {
    updateQuestionDraft({
      ...questionDraft,
      choices: questionDraft.choices.map((choice) =>
        choice.id === choiceId
          ? { ...choice, mediaAssetId: undefined }
          : choice,
      ),
    });
  }

  function addChoice() {
    if (isQuestionContentLocked || questionDraft.choices.length >= 5) return;
    const id = String.fromCharCode(97 + questionDraft.choices.length);
    updateQuestionDraft({ ...questionDraft, choices: [...questionDraft.choices, { id, text: "" }] });
  }

  function removeChoice(choiceId: string) {
    if (isQuestionContentLocked || questionDraft.choices.length <= 2) return;
    const choices = questionDraft.choices.filter((choice) => choice.id !== choiceId);
    updateQuestionDraft({ ...questionDraft, choices, correctChoiceId: questionDraft.correctChoiceId === choiceId ? choices[0]?.id ?? "a" : questionDraft.correctChoiceId });
  }

  function addQuestion() {
    if (isQuestionContentLocked) return;
    const subjectCode = activeQuestion?.subjectCode ?? builderState.questions.at(-1)?.subjectCode ?? "PU";
    const id = `${subjectCode.toLowerCase()}-question-${Date.now()}`;
    const nextQuestion = {
      ...emptyQuestion(
        bankId ?? initialBank?.id ?? id,
        subjectCode,
      ),
      id,
    };
    markChanged({
      ...builderState,
      questions: [...builderState.questions, nextQuestion],
    });
    setActiveQuestionId(id);
    setQuestionEditorTab("edit");
    setPreviewChoiceId(null);
    setHasSubmittedPreview(false);
    setInventoryPage(
      Math.ceil(
        (builderState.questions.length + 1) / INVENTORY_QUESTIONS_PER_PAGE,
      ),
    );
    setQuestionDraft(nextQuestion);
  }

  function removeQuestion(id: string) {
    if (isQuestionContentLocked || builderState.questions.length <= 1) return;
    const questions = builderState.questions.filter(
      (question) => question.id !== id,
    );
    const firstQuestion = questions[0]!;
    markChanged({ ...builderState, questions });
    setActiveQuestionId(firstQuestion.id);
    setInventoryPage(1);
    setQuestionEditorTab("edit");
    setPreviewChoiceId(null);
    setHasSubmittedPreview(false);
    setQuestionDraft(toQuestionDraft(firstQuestion));
  }

  function requestQuestionRemoval(id: string) {
    if (builderState.questions.length <= 1) return;
    const question = builderState.questions.find((item) => item.id === id);
    const questionLabel = question?.prompt || "Soal tanpa pertanyaan";

    setConfirmationRequest({
      confirmLabel: "Hapus soal",
      description: `“${questionLabel}” akan dihapus dari Bank Soal dan tidak dapat dikembalikan.`,
      onConfirm: () => removeQuestion(id),
      title: "Hapus soal ini?",
    });
  }

  async function saveDraft() {
    const id =
      initialBank?.id ??
      bankId ??
      `bank-${slugify(builderState.title)}-${Date.now()}`;
    setIsSaving(true); setLifecycleError(null);
    const result = await saveQuestionBankAction({ description: builderState.description, id: mode === "edit" ? id : undefined, questions: builderState.questions, revision, title: builderState.title });
    setIsSaving(false);
    if (!result.ok) { setLifecycleError(result.message); return; }
    setLocalBuilderState({ description: result.result.bank.description, questions: result.result.questions, subjectCode: "PU", title: result.result.bank.title });
    setRevision(result.result.bank.revision); setLifecycleStatus(result.result.bank.status); setHasUnsavedChanges(false);
    if (mode === "create") setPendingRouteReplacement(`/mentor/quiz/question-bank/${result.result.bank.id}`);
  }

  async function updateLifecycle(operation: "publish" | "unpublish") {
    const id = initialBank?.id ?? bankId;
    if (!id) return;
    const result = await updateQuestionBankLifecycleAction(id, operation);
    if (!result.ok) { setLifecycleError(result.message); return; }
    setLifecycleStatus(result.result.status); setLifecycleError(null);
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
          <Button
            render={<Link href="/mentor/quiz/question-bank" />}
            aria-label="Kembali ke bank soal"
            size="icon-sm"
            title="Kembali ke bank soal"
            variant="ghost"
          >
            <ChevronLeft />
          </Button>
          <div className="mt-5 flex flex-col gap-x-3 gap-y-2">
            <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
              {mode === "create" ? "Buat Bank Soal" : builderState.title}
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-2 text-sm font-medium",
                hasUnsavedChanges ? "text-[#856300]" : "text-primary-800",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  hasUnsavedChanges ? "bg-[#d29b18]" : "bg-primary-700",
                )}
              />
              {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button aria-label="Simpan perubahan" disabled={isSaving} onClick={saveDraft} size="icon-sm" title="Simpan perubahan" type="button" variant="brand"><Save /></Button>
          {isDraftLifecycle ? <Button onClick={() => setConfirmationRequest({ confirmLabel: "Terbitkan", description: "Bank lengkap akan tersedia sebagai sumber Quiz dan Tryout.", onConfirm: () => updateLifecycle("publish"), title: "Terbitkan bank?" })} type="button" variant="brandOutline">Terbitkan</Button> : <Button onClick={() => setConfirmationRequest({ confirmLabel: "Batalkan terbit", description: "Bank kembali menjadi draf dan isi soal dapat diedit.", onConfirm: () => updateLifecycle("unpublish"), title: "Batalkan penerbitan bank?" })} type="button" variant="brandOutline">Jadikan draf</Button>}
        </div>
      </section>

      {lifecycleError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{lifecycleError}</p> : null}

      <Tabs className="gap-8" onValueChange={setActiveTab} value={activeTab}>
        {isQuestionContentLocked ? <Alert><AlertTitle className="text-secondary-900">Bank diterbitkan</AlertTitle><AlertDescription className="text-secondary-900">Untuk validasi ini, isi soal dikunci sampai bank dikembalikan ke draf dari katalog. Metadata dan tag tetap dapat diperbarui.</AlertDescription></Alert> : null}
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList
            className="w-max min-w-full sm:min-w-0"
          >
            <TabsTrigger
              className="h-11 rounded-full px-4 text-sm"
              value="information"
            >
              Informasi bank
            </TabsTrigger>
            <TabsTrigger
              className="h-11 rounded-full px-4 text-sm"
              value="content"
            >
              Isi bank
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">
                {builderState.questions.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="m-0" value="information">
          <section className="w-full">
            <div className="grid gap-5 lg:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="bank-title">Judul bank</FieldLabel>
                <FieldInput
                  id="bank-title"
                  onChange={(event) =>
                    updateMetadata("title", event.target.value)
                  }
                  value={builderState.title}
                />
              </Field>
              <Field className="lg:col-span-2">
                <FieldLabel htmlFor="bank-description">Deskripsi</FieldLabel>
                <FieldTextarea
                  className="min-h-[100px]"
                  id="bank-description"
                  onChange={(event) =>
                    updateMetadata("description", event.target.value)
                  }
                  value={builderState.description}
                />
              </Field>
            </div>
          </section>
        </TabsContent>

        <TabsContent className="m-0" value="content">
          <section className="grid gap-8 xl:grid-cols-[minmax(270px,0.3fr)_minmax(0,0.7fr)]">
            <div className="order-2">
              <div className="flex min-h-11 items-center">
                <h2 className="text-2xl font-semibold text-secondary-900">
                  Edit soal
                </h2>
              </div>
              <Tabs
                className="mt-5 gap-5"
                onValueChange={setQuestionEditorTab}
                value={questionEditorTab}
              >
                <TabsList>
                  <TabsTrigger className="rounded-full px-4" value="edit">Edit</TabsTrigger>
                  <TabsTrigger className="rounded-full px-4" value="preview">Preview</TabsTrigger>
                </TabsList>
                <TabsContent className="m-0" value="edit">
                  <div className="grid gap-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
                <Field>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel htmlFor="question-prompt">
                      Pertanyaan
                    </FieldLabel>
                    <Button
                      disabled={!activeQuestionId}
                      onClick={() =>
                        setMediaPickerTarget({
                          kind: "prompt",
                          label: "Gambar pertanyaan",
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <ImagePlus data-icon="inline-start" />
                      {questionDraft.promptMediaAssetId
                        ? "Ganti gambar"
                        : "Tambah gambar"}
                    </Button>
                  </div>
                  <FieldTextarea
                    id="question-prompt"
                    onChange={(event) =>
                      updateQuestionDraft({
                        ...questionDraft,
                        prompt: event.target.value,
                      })
                    }
                    value={questionDraft.prompt}
                  />
                  {questionDraft.promptMediaAssetId ? (
                    <QuestionMediaAttachment
                      assetId={questionDraft.promptMediaAssetId}
                      label="Gambar pertanyaan"
                      onRemove={() =>
                        updateQuestionDraft({
                          ...questionDraft,
                          promptMediaAssetId: undefined,
                        })
                      }
                      onReplace={() =>
                        setMediaPickerTarget({
                          kind: "prompt",
                          label: "Gambar pertanyaan",
                        })
                      }
                    />
                  ) : null}
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  {questionDraft.choices.map((choice, index) => {
                    const choiceLabel = String.fromCharCode(65 + index);
                    const inputId = `bank-choice-${choice.id}`;

                    return (
                      <div
                        className="flex min-w-0 flex-col gap-3 rounded-2xl border border-primary-100 px-3 py-3"
                        key={choice.id}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <input
                            aria-label={`Jawaban benar opsi ${index + 1}`}
                            checked={
                              choice.id === questionDraft.correctChoiceId
                            }
                            className="size-4 accent-primary-700"
                            name="bank-correct-choice"
                            onChange={() =>
                              updateQuestionDraft({
                                ...questionDraft,
                                correctChoiceId: choice.id,
                              })
                            }
                            type="radio"
                          />
                          <label
                            className="text-xs font-semibold text-primary-800"
                            htmlFor={inputId}
                          >
                            {choiceLabel}
                          </label>
                          <input
                            aria-label={`Opsi ${index + 1}`}
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400"
                            id={inputId}
                            onChange={(event) =>
                              updateQuestionDraft({
                                ...questionDraft,
                                choices: questionDraft.choices.map((item) =>
                                  item.id === choice.id
                                    ? { ...item, text: event.target.value }
                                    : item,
                                ),
                              })
                            }
                            placeholder={`Opsi ${choiceLabel}`}
                            value={choice.text}
                          />
                          <Button
                            aria-label={`${choice.mediaAssetId ? "Ganti" : "Tambah"} gambar opsi ${choiceLabel}`}
                            disabled={!activeQuestionId}
                            onClick={() =>
                              setMediaPickerTarget({
                                kind: "choice",
                                choiceId: choice.id,
                                label: `Gambar opsi ${choiceLabel}`,
                              })
                            }
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <ImagePlus />
                          </Button>
                          <Button aria-label={`Hapus opsi ${choiceLabel}`} disabled={questionDraft.choices.length <= 2 || isQuestionContentLocked} onClick={() => removeChoice(choice.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
                        </div>
                        {choice.mediaAssetId ? (
                          <QuestionMediaAttachment
                            assetId={choice.mediaAssetId}
                            label={`Gambar opsi ${choiceLabel}`}
                            onRemove={() => removeChoiceMedia(choice.id)}
                            onReplace={() =>
                              setMediaPickerTarget({
                                kind: "choice",
                                choiceId: choice.id,
                                label: `Gambar opsi ${choiceLabel}`,
                              })
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end"><Button disabled={questionDraft.choices.length >= 5 || isQuestionContentLocked} onClick={addChoice} size="sm" type="button" variant="brandOutline"><Plus />Tambah opsi</Button></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="question-subtest">Tag subject / Topik</FieldLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger disabled={isQuestionContentLocked} render={<Button aria-describedby={isQuestionContentLocked ? "question-subtest-lock" : undefined} className="w-full justify-between" id="question-subtest" type="button" variant="context" />}>
                        <span className="truncate">{selectedQuestionSubject ? `${selectedQuestionSubject.code} - ${selectedQuestionSubject.name}` : "Pilih subject"}</span>
                        <ChevronDown className="size-4 text-secondary-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-(--anchor-width)">
                        <DropdownMenuLabel>Pilih subject / topik</DropdownMenuLabel>
                        <DropdownMenuGroup>
                          <DropdownMenuRadioGroup onValueChange={(value) => updateQuestionDraft({ ...questionDraft, subjectCode: value })} value={questionDraft.subjectCode}>
                            {kaptenSubjects.map((subject) => <DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" key={subject.code} value={subject.code}>{subject.code} - {subject.name}</DropdownMenuRadioItem>)}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {isQuestionContentLocked ? <p className="text-xs text-secondary-500" id="question-subtest-lock">Subtest dikunci saat Bank diterbitkan. Jadikan draf untuk mengubahnya.</p> : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="question-difficulty">
                      Tingkat kesulitan
                    </FieldLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={isQuestionContentLocked}
                        render={<Button className="w-full justify-between" id="question-difficulty" type="button" variant="context" />}
                      >
                        <span>{questionDraft.difficulty === "easy" ? "Mudah" : questionDraft.difficulty === "hard" ? "Sulit" : "Sedang"}</span>
                        <ChevronDown className="text-secondary-400" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-(--anchor-width)">
                        <DropdownMenuLabel>Pilih tingkat kesulitan</DropdownMenuLabel>
                        <DropdownMenuGroup>
                          <DropdownMenuRadioGroup onValueChange={(value) => updateQuestionDraft({ ...questionDraft, difficulty: value as BankQuestion["difficulty"] })} value={questionDraft.difficulty}>
                            <DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="easy">Mudah</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="medium">Sedang</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="hard">Sulit</DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Field>
                </div>
                <Field>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FieldLabel htmlFor="question-explanation">
                      Penjelasan{" "}
                      <span className="font-normal text-secondary-400">
                        (opsional)
                      </span>
                    </FieldLabel>
                    <Button
                      disabled={!activeQuestionId}
                      onClick={() =>
                        setMediaPickerTarget({
                          kind: "explanation",
                          label: "Gambar penjelasan",
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <ImagePlus data-icon="inline-start" />
                      {questionDraft.explanationMediaAssetId
                        ? "Ganti gambar"
                        : "Tambah gambar"}
                    </Button>
                  </div>
                  <FieldTextarea
                    id="question-explanation"
                    onChange={(event) =>
                      updateQuestionDraft({
                        ...questionDraft,
                        explanation: event.target.value,
                      })
                    }
                    value={questionDraft.explanation}
                  />
                  {questionDraft.explanationMediaAssetId ? (
                    <QuestionMediaAttachment
                      assetId={questionDraft.explanationMediaAssetId}
                      label="Gambar penjelasan"
                      onRemove={() =>
                        updateQuestionDraft({
                          ...questionDraft,
                          explanationMediaAssetId: undefined,
                        })
                      }
                      onReplace={() =>
                        setMediaPickerTarget({
                          kind: "explanation",
                          label: "Gambar penjelasan",
                        })
                      }
                    />
                  ) : null}
                </Field>
                  </div>
                </TabsContent>
                <TabsContent className="m-0" value="preview">
                  <section className="rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
                      <p className="text-xl leading-8 font-semibold text-secondary-900">
                        {questionDraft.prompt || "Pertanyaan akan tampil di sini."}
                      </p>
                      {questionDraft.promptMediaAssetId ? (
                        <MediaAssetPreview
                          alt="Gambar pertanyaan"
                          assetId={questionDraft.promptMediaAssetId}
                          className="mt-5"
                        />
                      ) : null}
                      <RadioGroup
                        className="mt-6"
                        onValueChange={(value) => {
                          setPreviewChoiceId(value);
                          setHasSubmittedPreview(false);
                        }}
                        value={previewChoiceId ?? undefined}
                      >
                        {questionDraft.choices.map((choice, index) => {
                          const choiceLabel = String.fromCharCode(65 + index);
                          const choiceId = `preview-choice-${questionDraft.id}-${choice.id}`;
                          return (
                            <label
                              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary-100 px-4 py-4 text-sm text-secondary-700 transition-colors hover:border-primary-300 hover:bg-primary-50/60 has-[[data-checked]]:border-primary-300 has-[[data-checked]]:bg-primary-50"
                              htmlFor={choiceId}
                              key={choice.id}
                            >
                              <RadioGroupItem id={choiceId} value={choice.id} />
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                                {choiceLabel}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col gap-3">
                                <span>{choice.text || `Opsi ${choiceLabel}`}</span>
                                {choice.mediaAssetId ? (
                                  <MediaAssetPreview
                                    alt={`Gambar opsi ${choiceLabel}`}
                                    assetId={choice.mediaAssetId}
                                    className="max-h-44"
                                  />
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
                      </RadioGroup>
                      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-primary-100 pt-5">
                        <Button
                          disabled={!previewChoiceId}
                          onClick={() => setHasSubmittedPreview(true)}
                          type="button"
                          variant="brand"
                        >
                          Kirim jawaban
                        </Button>
                        {hasSubmittedPreview ? (
                          <p
                            aria-live="polite"
                            className={cn(
                              "rounded-2xl px-3 py-2 text-sm font-medium",
                              previewChoiceId === questionDraft.correctChoiceId
                                ? "bg-primary-50 text-primary-800"
                                : "bg-red-50 text-red-800",
                            )}
                          >
                            {previewChoiceId === questionDraft.correctChoiceId
                              ? "Jawaban benar."
                              : "Belum tepat. Coba lagi."}
                          </p>
                        ) : null}
                      </div>
                  </section>
                </TabsContent>
              </Tabs>
            </div>

            <aside className="order-1 min-w-0 border-b border-primary-100 pb-5 xl:border-r xl:border-b-0 xl:pr-7 xl:pb-0">
              <div className="flex items-center justify-between gap-4">
                <h2 className="flex min-h-11 items-center text-2xl font-semibold text-secondary-900">
                  Inventori soal
                </h2>
                <Button aria-label="Tambah soal" onClick={addQuestion} size="icon-sm" type="button" variant="brandOutline"><Plus /></Button>
              </div>
              <ScrollArea className="mt-4 h-56 border-t border-primary-100 xl:mt-5">
                <div className="grid grid-cols-1 gap-1 pt-3 pr-3 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedQuestions.length > 0 ? (
                    paginatedQuestions.map((question, index) => (
                    <div
                      className={cn(
                        "flex min-w-0 w-full items-center gap-2 rounded-2xl px-2 py-2 transition-colors",
                        activeQuestionId === question.id
                          ? "bg-primary-50"
                          : "hover:bg-primary-50/60",
                      )}
                      key={question.id}
                    >
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openQuestion(question)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-secondary-900">
                          <span className="truncate">
                            {String(
                              (visibleInventoryPage - 1) *
                                INVENTORY_QUESTIONS_PER_PAGE +
                                index +
                                1,
                            ).padStart(2, "0")}
                            . {question.prompt || "Soal tanpa pertanyaan"}
                          </span>
                          {isReady(question) ? (
                            <Check aria-label="Siap dipakai Quiz" className="size-4 shrink-0 text-primary-700" />
                          ) : null}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge size="ui" variant="mint">{question.subjectCode}</Badge>
                          {!isReady(question) ? <span className="text-xs text-secondary-500">Belum lengkap</span> : null}
                        </span>
                      </button>
                      <Button
                        aria-label={`Hapus soal ${index + 1}`}
                        disabled={builderState.questions.length <= 1}
                        onClick={() => requestQuestionRemoval(question.id)}
                        size="icon-sm"
                        title={builderState.questions.length <= 1 ? "Bank Soal minimal memiliki satu soal" : undefined}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    ))
                  ) : (
                    <p className="px-2 py-4 text-sm leading-6 text-secondary-500">
                      Belum ada soal. Tambahkan soal pertama dan pilih Subtest-nya.
                    </p>
                  )}
                </div>
              </ScrollArea>
              {builderState.questions.length > 0 ? (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4">
                  <p className="text-sm text-secondary-500">
                    Halaman {visibleInventoryPage} dari {inventoryPageCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label="Halaman sebelumnya"
                      disabled={visibleInventoryPage === 1}
                      onClick={() => setInventoryPage(visibleInventoryPage - 1)}
                      size="sm"
                      type="button"
                      variant="brandOutline"
                    >
                      <ChevronLeft /> Sebelumnya
                    </Button>
                    <Button
                      aria-label="Halaman berikutnya"
                      disabled={visibleInventoryPage === inventoryPageCount}
                      onClick={() => setInventoryPage(visibleInventoryPage + 1)}
                      size="sm"
                      type="button"
                      variant="brandOutline"
                    >
                      Berikutnya <ChevronRight />
                    </Button>
                  </div>
                </div>
              ) : null}
            </aside>
          </section>
        </TabsContent>
      </Tabs>

      <MediaPickerDialog
        onOpenChange={(isOpen) => {
          if (!isOpen) setMediaPickerTarget(null);
        }}
        onSelect={selectMediaAsset}
        open={Boolean(mediaPickerTarget)}
        selectedAssetId={selectedMediaAssetId}
        title={mediaPickerTarget?.label ?? "Pilih gambar"}
      />

      <Dialog
        onOpenChange={(isOpen) => {
          if (!isOpen) closeConfirmation();
        }}
        open={Boolean(confirmationRequest)}
      >
        <DialogContent
          className="gap-5 border-red-100 bg-white p-6 sm:max-w-3xl"
          showCloseButton={false}
        >
          <Alert
            className="border-red-200 bg-transparent text-secondary-900"
            variant="destructive"
          >
            <CircleHelp className="text-red-700" />
            <AlertTitle>
              <DialogTitle className="font-semibold text-secondary-900">
                {confirmationRequest?.title}
              </DialogTitle>
            </AlertTitle>
            <AlertDescription className="mt-1 text-red-700">
              <DialogDescription className="whitespace-normal text-red-700 sm:whitespace-nowrap">
                {confirmationRequest?.description}
              </DialogDescription>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              onClick={closeConfirmation}
              type="button"
              variant="brandOutline"
            >
              Batal
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:border-red-700 focus-visible:ring-red-700/25"
              onClick={confirmPendingAction}
              type="button"
              variant="destructive"
            >
              {confirmationRequest?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankBuilderPageModule };
