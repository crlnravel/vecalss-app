"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
  saveQuestionBankAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

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

function difficultyMix(questions: BankQuestion[]) {
  if (questions.length === 0) return "Belum ada soal";
  const counts = questions.reduce<Record<string, number>>(
    (result, question) => {
      result[question.difficulty] = (result[question.difficulty] ?? 0) + 1;
      return result;
    },
    {},
  );
  return ["easy", "medium", "hard"]
    .filter((difficulty) => counts[difficulty])
    .map(
      (difficulty) =>
        `${Math.round(((counts[difficulty] ?? 0) / questions.length) * 100)}% ${difficulty === "easy" ? "mudah" : difficulty === "medium" ? "sedang" : "sulit"}`,
    )
    .join(", ");
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
  const [localBuilderState, setLocalBuilderState] = useState(() => ({
    description: initialBank?.description ?? "",
    questions: initialQuestions,
    subjectCode: initialBank?.subjectCode ?? "PU",
    title: initialBank?.title ?? "Bank Soal Baru",
    tags: (initialBank?.tags?.length ? initialBank.tags : [initialBank?.subjectCode ?? "PU"]).filter((tag) => kaptenSubjects.some((subject) => subject.code === tag)),
  }));
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("information");
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [questionDraft, setQuestionDraft] = useState<BankQuestion>(() =>
    emptyQuestion(
      bankId ?? initialBank?.id ?? "new-bank",
      initialBank?.subjectCode ?? "PU",
    ),
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<
    string | null
  >(null);
  const [mediaPickerTarget, setMediaPickerTarget] =
    useState<MediaPickerTarget | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState(initialBank?.status ?? "draft");
  const [revision, setRevision] = useState(initialBank?.revision);
  const [isSaving, setIsSaving] = useState(false);

  const builderState = localBuilderState;

  const activeQuestion = activeQuestionId
    ? (builderState.questions.find(
        (question) => question.id === activeQuestionId,
      ) ?? null)
    : null;
  const readyCount = builderState.questions.filter(isReady).length;
  const isQuestionContentLocked = lifecycleStatus === "published";
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

  useEffect(() => {
    if (builderState.questions.length > 0 || activeQuestionId || isQuestionContentLocked) return;
    const frame = window.requestAnimationFrame(() => addQuestion());
    return () => window.cancelAnimationFrame(frame);
  }, [activeQuestionId, bankId, builderState.questions.length, isQuestionContentLocked]);

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
    setQuestionDraft({
      ...question,
      choices: question.choices.map((choice) => ({ ...choice })),
      tags: [],
    });
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
    const subjectCode = builderState.tags[0] ?? "PU";
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
    setInventoryPage(
      Math.ceil(
        (builderState.questions.length + 1) / INVENTORY_QUESTIONS_PER_PAGE,
      ),
    );
    setQuestionDraft(nextQuestion);
  }

  function removeQuestion(id: string) {
    if (isQuestionContentLocked) return;
    const questions = builderState.questions.filter(
      (question) => question.id !== id,
    );
    markChanged({ ...builderState, questions });
    if (activeQuestionId === id) {
      setActiveQuestionId(null);
      setQuestionDraft(
        emptyQuestion(
          bankId ?? initialBank?.id ?? "new-bank",
          builderState.subjectCode,
        ),
      );
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

  async function saveDraft() {
    const id =
      initialBank?.id ??
      bankId ??
      `bank-${slugify(builderState.title)}-${Date.now()}`;
    setIsSaving(true); setLifecycleError(null);
    const result = await saveQuestionBankAction({ description: builderState.description, id: mode === "edit" ? id : undefined, questions: builderState.questions, revision, tags: builderState.tags, title: builderState.title });
    setIsSaving(false);
    if (!result.ok) { setLifecycleError(result.message); return; }
    setLocalBuilderState({ description: result.result.bank.description, questions: result.result.questions, subjectCode: "PU", tags: result.result.bank.tags, title: result.result.bank.title });
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
          <Button disabled={isSaving} onClick={saveDraft} type="button" variant="brand"><Save /> {isSaving ? "Menyimpan..." : saveLabel}</Button>
          {isDraftLifecycle ? <Button onClick={() => setConfirmationRequest({ confirmLabel: "Terbitkan", description: "Bank lengkap akan tersedia sebagai sumber mock.", onConfirm: () => updateLifecycle("publish"), title: "Terbitkan bank?" })} type="button" variant="brandOutline">Terbitkan</Button> : <Button onClick={() => setConfirmationRequest({ confirmLabel: "Batalkan terbit", description: "Bank kembali menjadi draf dan isi soal dapat diedit.", onConfirm: () => updateLifecycle("unpublish"), title: "Batalkan penerbitan bank?" })} type="button" variant="brandOutline">Jadikan draf</Button>}
        </div>
      </section>

      {lifecycleError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{lifecycleError}</p> : null}

      <Tabs className="gap-8" onValueChange={setActiveTab} value={activeTab}>
        {isQuestionContentLocked ? <Alert><AlertTitle className="text-secondary-900">Bank diterbitkan</AlertTitle><AlertDescription className="text-secondary-900">Untuk validasi ini, isi soal dikunci sampai bank dikembalikan ke draf dari katalog. Metadata dan tag tetap dapat diperbarui.</AlertDescription></Alert> : null}
        <div className="border-b border-primary-100">
          <TabsList
            className="h-auto gap-4 rounded-none bg-transparent p-0"
            variant="line"
          >
            <TabsTrigger
              className="h-11 rounded-none px-1 text-sm"
              value="information"
            >
              Informasi bank
            </TabsTrigger>
            <TabsTrigger
              className="h-11 rounded-none px-1 text-sm"
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
              <Field>
                <FieldLabel>Tag subject</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-2">
                  {kaptenSubjects.map((subject) => {
                    const selected = builderState.tags.includes(subject.code);
                    const used = builderState.questions.some((question) => question.subjectCode === subject.code);
                    return <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-primary-100 bg-white px-3 py-2 text-sm text-secondary-700" key={subject.code}>
                      <input checked={selected} className="size-4 accent-primary-700" disabled={selected && used} onChange={() => markChanged({ ...builderState, tags: selected ? builderState.tags.filter((tag) => tag !== subject.code) : [...builderState.tags, subject.code] })} type="checkbox" />
                      <span><span className="font-semibold text-primary-800">{subject.code}</span> · {subject.name}</span>
                    </label>;
                  })}
                </div>
                <p className="text-xs text-secondary-500">Pilih subject untuk pencarian. Kecocokan quiz dan tryout tetap mengikuti Subtest pada setiap soal.</p>
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
          <section className="grid gap-8 xl:grid-cols-[minmax(0,0.7fr)_minmax(270px,0.3fr)]">
            <div className="order-1 xl:order-none">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-secondary-900">
                    {activeQuestion ? "Edit soal" : "Soal aktif"}
                  </p>
                  <p className="mt-1 text-sm text-secondary-500">
                    Simpan soal lengkap atau biarkan belum lengkap untuk
                    dilanjutkan nanti.
                  </p>
                </div>
                <Button
                  onClick={addQuestion}
                  type="button"
                  variant="brandOutline"
                >
                  <Plus /> Tambah soal
                </Button>
              </div>
              <div className="mt-5 grid gap-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
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
                    <select aria-describedby={isQuestionContentLocked ? "question-subtest-lock" : undefined} className={fieldControlClassName} disabled={isQuestionContentLocked} id="question-subtest" onChange={(event) => updateQuestionDraft({ ...questionDraft, subjectCode: event.target.value })} value={questionDraft.subjectCode}>
                      {kaptenSubjects.filter((subject) => builderState.tags.includes(subject.code)).map((subject) => <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>)}
                    </select>
                    {isQuestionContentLocked ? <p className="text-xs text-secondary-500" id="question-subtest-lock">Subtest dikunci saat Bank diterbitkan. Jadikan draf untuk mengubahnya.</p> : null}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="question-difficulty">
                      Tingkat kesulitan
                    </FieldLabel>
                    <select
                      className={fieldControlClassName}
                      id="question-difficulty"
                      onChange={(event) =>
                        updateQuestionDraft({
                          ...questionDraft,
                          difficulty: event.target
                            .value as BankQuestion["difficulty"],
                        })
                      }
                      value={questionDraft.difficulty}
                    >
                      <option value="easy">Mudah</option>
                      <option value="medium">Sedang</option>
                      <option value="hard">Sulit</option>
                    </select>
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
                {activeQuestionId ? (
                  <Button
                    onClick={() => requestQuestionRemoval(activeQuestionId)}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 /> Hapus soal ini
                  </Button>
                ) : (
                  <p className="text-sm text-secondary-500">
                    Pilih soal di inventori atau tambah soal baru untuk mulai
                    mengedit.
                  </p>
                )}
              </div>
            </div>

            <aside className="order-2 border-t border-primary-100 pt-5 xl:order-none xl:border-t-0 xl:border-l xl:pl-7 xl:pt-1">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-secondary-900">
                    Inventori soal
                  </p>
                  <p className="mt-1 text-xs text-secondary-500">
                    {builderState.questions.length} soal · {readyCount} siap
                  </p>
                </div>
                <Button
                  onClick={addQuestion}
                  size="icon-sm"
                  type="button"
                  variant="brandOutline"
                >
                  <Plus />
                </Button>
              </div>
              <div className="mt-4 flex gap-1 overflow-x-auto border-t border-primary-100 pt-3 xl:mt-5 xl:block xl:space-y-1">
                {paginatedQuestions.length > 0 ? (
                  paginatedQuestions.map((question, index) => (
                    <div
                      className={cn(
                        "flex min-w-[220px] items-center gap-2 rounded-2xl px-2 py-2 transition-colors xl:w-full",
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
                        <span className="block truncate text-sm font-semibold text-secondary-900">
                          {String(
                            (visibleInventoryPage - 1) *
                              INVENTORY_QUESTIONS_PER_PAGE +
                              index +
                              1,
                          ).padStart(2, "0")}
                          . {question.prompt || "Soal tanpa pertanyaan"}
                        </span>
                        <span className="mt-1 block text-xs text-secondary-500">
                          {isReady(question)
                            ? "Siap dipakai Quiz"
                            : "Belum lengkap"}
                        </span>
                      </button>
                      <Button
                        aria-label={`Hapus soal ${index + 1}`}
                        onClick={() => requestQuestionRemoval(question.id)}
                        size="icon-sm"
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
