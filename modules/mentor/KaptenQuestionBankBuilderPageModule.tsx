"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Ellipsis,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { showToast } from "@/components/ui/sonner";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import type { MediaAssetDto } from "@/lib/media/types";
import {
  getQuestionBankReadinessFromDrafts,
  getQuestionReadinessFromDraft,
  type QuestionBankReadiness,
  type QuestionReadinessMediaTarget,
  type QuestionReadinessIssue,
} from "@/lib/question-bank/readiness";
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
  setQuestionBankCategoriesAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

type QuestionBankEditorTab = "questions" | "details";

type QuestionRowRefs = {
  current: Record<string, HTMLLIElement | null>;
};

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

type QuestionBankEditorState = {
  activeQuestionId: string | null;
  activeTab: QuestionBankEditorTab;
  confirmationRequest: ConfirmationRequest | null;
  questionDraft: BankQuestion;
  hasUnsavedChanges: boolean;
  pendingRouteReplacement: string | null;
  readinessAnnouncement: string;
  serverReadiness: QuestionBankReadiness | null;
  mediaPickerTarget: MediaPickerTarget | null;
  lifecycleError: string | null;
  lifecycleStatus: KaptenQuestionBank["status"];
  isSaving: boolean;
  questionEditorTab: string;
  previewChoiceId: string | null;
  hasSubmittedPreview: boolean;
};

type LocalQuestionBankState = {
  categoryIds: string[];
  description: string;
  questions: BankQuestion[];
  subjectCode: string;
  title: string;
};

type QuestionBankCategoryOption = {
  id: string;
  name: string;
};

type QuestionBankOrganizationPatch = {
  categoryIds?: string[];
};

type QuestionBankEditorAction = { type: "patch"; patch: Partial<QuestionBankEditorState> };

function questionBankEditorReducer(state: QuestionBankEditorState, action: QuestionBankEditorAction): QuestionBankEditorState {
  return action.type === "patch" ? { ...state, ...action.patch } : state;
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function QuestionMediaAttachment({
  assetId,
  disabled = false,
  field,
  label,
  onRemove,
  onReplace,
}: {
  assetId: string;
  disabled?: boolean;
  field?: string;
  label: string;
  onRemove: () => void;
  onReplace: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-primary-50/35 p-3"
      data-question-field={field ? "media" : undefined}
      data-question-field-key={field}
      id={field ? `question-media-${field}-attachment` : undefined}
    >
      <MediaAssetPreview
        alt={label}
        assetId={assetId}
        className="max-h-48 bg-white"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={disabled}
          onClick={onReplace}
          size="sm"
          type="button"
          variant="brandOutline"
        >
          <ImagePlus data-icon="inline-start" />
          Ganti
        </Button>
        <Button disabled={disabled} onClick={onRemove} size="sm" type="button" variant="ghost">
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

function createQuestionId(subjectCode: string) {
  // Temporary question ids are persisted by the bank repository until the
  // first save, which recognizes the subject-question-<digits> shape.
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
  return `${subjectCode.toLowerCase()}-question-${suffix}`;
}

function isReady(question: BankQuestion) {
  return getQuestionReadinessFromDraft(question).length === 0;
}

function readinessIssueKey(issue: QuestionReadinessIssue) {
  return [issue.questionId, issue.code, issue.field, issue.choiceId ?? "", issue.mediaTarget ?? ""].join(":");
}

function readinessFieldLabel(issue: QuestionReadinessIssue) {
  if (issue.field === "prompt") return "pertanyaan";
  if (issue.field === "choice") return issue.choiceId ? "teks opsi" : "jumlah opsi";
  if (issue.field === "correctChoice") return "jawaban benar";
  if (issue.field === "media") {
    if (issue.choiceId) return "media opsi";
    if (issue.mediaTarget === "explanation") return "media penjelasan";
    if (issue.mediaTarget === "prompt") return "media pertanyaan";
    return "media soal";
  }
  return "Subtest";
}

function mergeQuestionBankReadiness(
  questions: readonly BankQuestion[],
  localReadiness: QuestionBankReadiness,
  serverReadiness: QuestionBankReadiness | null,
): QuestionBankReadiness {
  const localIssuesByQuestion = new Map<string, QuestionReadinessIssue[]>();
  for (const issue of localReadiness.issues) {
    const issues = localIssuesByQuestion.get(issue.questionId) ?? [];
    issues.push(issue);
    localIssuesByQuestion.set(issue.questionId, issues);
  }
  const serverIssuesByQuestion = new Map<string, QuestionReadinessIssue[]>();
  for (const issue of serverReadiness?.issues ?? []) {
    const issues = serverIssuesByQuestion.get(issue.questionId) ?? [];
    issues.push(issue);
    serverIssuesByQuestion.set(issue.questionId, issues);
  }

  const issues = questions.flatMap((question) => {
    const localIssues = localIssuesByQuestion.get(question.id) ?? [];
    const localKeys = new Set(localIssues.map(readinessIssueKey));
    const serverIssues = (serverIssuesByQuestion.get(question.id) ?? []).filter(
      (issue) => !localKeys.has(readinessIssueKey(issue)),
    );
    return [...localIssues, ...serverIssues];
  });
  const incompleteQuestionIds = new Set(issues.map((issue) => issue.questionId));
  const totalCount = questions.length;
  const incompleteCount = incompleteQuestionIds.size;
  return {
    incompleteCount,
    issues,
    readyCount: totalCount - incompleteCount,
    totalCount,
  };
}

function pruneServerReadinessForDraftChange(
  readiness: QuestionBankReadiness | null,
  previousQuestions: readonly BankQuestion[],
  nextQuestions: readonly BankQuestion[],
) {
  if (!readiness) return null;
  const previousById = new Map(previousQuestions.map((question) => [question.id, question]));
  const nextById = new Map(nextQuestions.map((question) => [question.id, question]));
  const issues = readiness.issues.filter((issue) => {
    const previous = previousById.get(issue.questionId);
    const next = nextById.get(issue.questionId);
    if (!next) return false;
    if (!previous) return true;
    if (issue.field === "prompt") return previous.prompt === next.prompt;
    if (issue.field === "subtest") return previous.subjectCode === next.subjectCode;
    if (issue.field === "correctChoice") return previous.correctChoiceId === next.correctChoiceId;
    if (issue.field === "choice") {
      if (previous.choices.length !== next.choices.length) return false;
      if (!issue.choiceId) return true;
      return previous.choices.find((choice) => choice.id === issue.choiceId)?.text === next.choices.find((choice) => choice.id === issue.choiceId)?.text;
    }
    if (issue.choiceId) {
      return previous.choices.find((choice) => choice.id === issue.choiceId)?.mediaAssetId === next.choices.find((choice) => choice.id === issue.choiceId)?.mediaAssetId;
    }
    if (issue.mediaTarget === "prompt") return previous.promptMediaAssetId === next.promptMediaAssetId;
    if (issue.mediaTarget === "explanation") return previous.explanationMediaAssetId === next.explanationMediaAssetId;
    return previous.promptMediaAssetId === next.promptMediaAssetId && previous.explanationMediaAssetId === next.explanationMediaAssetId;
  });
  if (!issues.length) return null;
  const incompleteQuestionIds = new Set(issues.map((issue) => issue.questionId));
  return {
    ...readiness,
    incompleteCount: incompleteQuestionIds.size,
    issues,
    readyCount: readiness.totalCount - incompleteQuestionIds.size,
  };
}

function toQuestionDraft(question: BankQuestion): BankQuestion {
  return {
    ...question,
    choices: question.choices.map((choice) => ({ ...choice })),
    tags: [],
  };
}

function QuestionBankEditorForm({
  activeQuestionId,
  isQuestionContentLocked,
  onAddChoice,
  onOpenMedia,
  onRemoveChoice,
  onRemoveChoiceMedia,
  onUpdate,
  questionDraft,
  readinessIssues,
}: {
  activeQuestionId: string | null;
  isQuestionContentLocked: boolean;
  onAddChoice: () => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
  readinessIssues: QuestionReadinessIssue[];
}) {
  const hasIssue = (
    field: QuestionReadinessIssue["field"],
    choiceId?: string,
    mediaTarget?: QuestionReadinessMediaTarget,
  ) => readinessIssues.some((issue) => issue.field === field
    && issue.choiceId === choiceId
    && (field !== "media"
      || issue.mediaTarget === mediaTarget
      || (mediaTarget !== "prompt" && mediaTarget !== "explanation" && issue.mediaTarget === undefined)));
  const hasMediaIssue = (choiceId?: string, mediaTarget?: QuestionReadinessMediaTarget) =>
    hasIssue("media", choiceId, mediaTarget);
  const hasChoiceCountIssue = hasIssue("choice");
  const hasCorrectChoiceIssue = hasIssue("correctChoice");
  const hasPromptIssue = hasIssue("prompt");
  const hasSubtestIssue = hasIssue("subtest");
  const hasPromptMediaIssue = hasMediaIssue(undefined, "prompt");
  const hasExplanationMediaIssue = hasMediaIssue(undefined, "explanation");
  const readinessHint = readinessIssues.length
    ? `Perbaiki ${readinessIssues.map(readinessFieldLabel).join(", ")}.`
    : undefined;
  const describedBy = (...ids: Array<string | undefined>) => {
    const presentIds = ids.filter((id): id is string => Boolean(id));
    return presentIds.length ? presentIds.join(" ") : undefined;
  };

  return (
    <div className="grid min-w-0 gap-6 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6">
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="question-prompt">Pertanyaan</FieldLabel>
          <Button
            aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasPromptMediaIssue ? "question-prompt-media-error" : undefined)}
            aria-invalid={hasPromptMediaIssue}
            data-question-anchor="media"
            data-question-field="media"
            data-question-field-key="prompt"
            disabled={!activeQuestionId || isQuestionContentLocked}
            id="question-media-prompt"
            onClick={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ImagePlus data-icon="inline-start" />
            {questionDraft.promptMediaAssetId ? "Ganti gambar" : "Tambah gambar"}
          </Button>
        </div>
        <FieldTextarea aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasPromptIssue ? "question-prompt-error" : undefined)} aria-invalid={hasPromptIssue} data-question-anchor="prompt" data-question-field="prompt" disabled={isQuestionContentLocked} id="question-prompt" onChange={(event) => onUpdate({ ...questionDraft, prompt: event.target.value })} value={questionDraft.prompt} />
        {hasPromptIssue ? <p className="text-sm font-medium text-student-status-danger-fg" id="question-prompt-error">Isi pertanyaan sebelum menerbitkan.</p> : null}
        {questionDraft.promptMediaAssetId ? (
          <QuestionMediaAttachment
            assetId={questionDraft.promptMediaAssetId}
            disabled={isQuestionContentLocked}
            field="prompt"
            label="Gambar pertanyaan"
            onRemove={() => onUpdate({ ...questionDraft, promptMediaAssetId: undefined })}
            onReplace={() => onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })}
          />
        ) : null}
        {hasPromptMediaIssue ? <p className="text-sm font-medium text-student-status-danger-fg" id="question-prompt-media-error">Gambar pertanyaan belum siap. Pilih gambar lain atau hapus lampirannya.</p> : null}
      </Field>
      <fieldset aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasChoiceCountIssue ? "question-choice-count-error" : undefined)} aria-invalid={hasChoiceCountIssue} className="grid gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only" id="question-choices-label">Pilihan jawaban</legend>
        <fieldset aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasCorrectChoiceIssue ? "question-correct-choice-error" : undefined)} aria-invalid={hasCorrectChoiceIssue} className="contents">
          <legend className="sr-only">Tentukan jawaban benar</legend>
          {questionDraft.choices.map((choice, index) => {
            const choiceLabel = String.fromCharCode(65 + index);
            const inputId = `bank-choice-${choice.id}`;
            const hasChoiceTextIssue = hasIssue("choice", choice.id);
            const hasChoiceMediaIssue = hasMediaIssue(choice.id);
            return <div className={cn("flex min-w-0 flex-col gap-3 rounded-2xl border px-3 py-3", hasChoiceTextIssue || hasChoiceMediaIssue ? "border-student-status-danger-border bg-student-status-danger-bg/40" : "border-primary-100")} key={choice.id}>
              <div className="flex min-w-0 items-center gap-3">
                <input aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasCorrectChoiceIssue ? "question-correct-choice-error" : undefined)} aria-label={`Jawaban benar opsi ${index + 1}`} checked={choice.id === questionDraft.correctChoiceId} className="size-4 accent-primary-700" data-question-anchor="correctChoice" data-question-choice-id={choice.id} data-question-field="correctChoice" disabled={isQuestionContentLocked} id={`bank-correct-choice-${choice.id}`} name="bank-correct-choice" onChange={() => onUpdate({ ...questionDraft, correctChoiceId: choice.id })} type="radio" />
                <label className="text-xs font-semibold text-primary-800" htmlFor={`bank-correct-choice-${choice.id}`}>{choiceLabel}</label>
                <input aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasChoiceCountIssue ? "question-choice-count-error" : undefined, hasChoiceTextIssue ? `question-choice-${choice.id}-error` : undefined)} aria-invalid={hasChoiceTextIssue} aria-label={`Opsi ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200" data-question-anchor="choice" data-question-choice-id={choice.id} data-question-field="choice" disabled={isQuestionContentLocked} id={inputId} onChange={(event) => onUpdate({ ...questionDraft, choices: questionDraft.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item) })} placeholder={`Opsi ${choiceLabel}`} value={choice.text} />
                <Button aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasChoiceMediaIssue ? `question-choice-${choice.id}-media-error` : undefined)} aria-invalid={hasChoiceMediaIssue} aria-label={`${choice.mediaAssetId ? "Ganti" : "Tambah"} gambar opsi ${choiceLabel}`} data-question-anchor="media" data-question-choice-id={choice.id} data-question-field="media" data-question-field-key={`choice:${choice.id}`} disabled={!activeQuestionId || isQuestionContentLocked} id={`question-media-choice-${choice.id}`} onClick={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${choiceLabel}` })} size="icon-sm" type="button" variant="ghost"><ImagePlus /></Button>
                <Button aria-label={`Hapus opsi ${choiceLabel}`} disabled={questionDraft.choices.length <= 2 || isQuestionContentLocked} onClick={() => onRemoveChoice(choice.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button>
              </div>
              {hasChoiceTextIssue ? <p className="text-sm font-medium text-student-status-danger-fg" id={`question-choice-${choice.id}-error`}>Isi teks opsi ini.</p> : null}
              {hasChoiceMediaIssue ? <p className="text-sm font-medium text-student-status-danger-fg" id={`question-choice-${choice.id}-media-error`}>Gambar opsi belum siap. Pilih gambar lain atau hapus lampirannya.</p> : null}
              {choice.mediaAssetId ? <QuestionMediaAttachment assetId={choice.mediaAssetId} disabled={isQuestionContentLocked} field={`choice-${choice.id}`} label={`Gambar opsi ${choiceLabel}`} onRemove={() => onRemoveChoiceMedia(choice.id)} onReplace={() => onOpenMedia({ choiceId: choice.id, kind: "choice", label: `Gambar opsi ${choiceLabel}` })} /> : null}
            </div>;
          })}
        </fieldset>
      </fieldset>
      {hasChoiceCountIssue ? <p className="-mt-1 text-sm font-medium text-student-status-danger-fg" id="question-choice-count-error">Jumlah opsi harus antara 2 dan 5.</p> : null}
      {hasCorrectChoiceIssue ? <p className="-mt-1 text-sm font-medium text-student-status-danger-fg" id="question-correct-choice-error">Pilih tepat satu jawaban benar.</p> : null}
      <div className="flex justify-end"><Button disabled={questionDraft.choices.length >= 5 || isQuestionContentLocked} onClick={onAddChoice} size="sm" type="button" variant="brandOutline"><Plus />Tambah opsi</Button></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="question-subtest">Subtest</FieldLabel><DropdownMenu><DropdownMenuTrigger disabled={isQuestionContentLocked} render={<Button aria-describedby={describedBy(hasSubtestIssue ? "question-subtest-error" : undefined, readinessHint ? "question-readiness-hint" : undefined)} aria-invalid={hasSubtestIssue} className="w-full justify-between" data-question-anchor="subtest" data-question-field="subtest" id="question-subtest" type="button" variant="context" />}><span className="truncate">{kaptenSubjects.find((subject) => subject.code === questionDraft.subjectCode)?.name ? `${questionDraft.subjectCode} - ${kaptenSubjects.find((subject) => subject.code === questionDraft.subjectCode)?.name}` : "Pilih Subtest"}</span><ChevronDown className="size-4 text-secondary-400" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-(--anchor-width)"><DropdownMenuLabel>Pilih Subtest</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuRadioGroup onValueChange={(value) => onUpdate({ ...questionDraft, subjectCode: value })} value={questionDraft.subjectCode}>{kaptenSubjects.map((subject) => <DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" key={subject.code} value={subject.code}>{subject.code} - {subject.name}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>{hasSubtestIssue ? <p className="text-sm font-medium text-student-status-danger-fg" id="question-subtest-error">Pilih Subtest sebelum menerbitkan.</p> : null}</Field>
        <Field><FieldLabel htmlFor="question-difficulty">Tingkat kesulitan</FieldLabel><DropdownMenu><DropdownMenuTrigger disabled={isQuestionContentLocked} render={<Button className="w-full justify-between" id="question-difficulty" type="button" variant="context" />}><span>{questionDraft.difficulty === "easy" ? "Mudah" : questionDraft.difficulty === "hard" ? "Sulit" : "Sedang"}</span><ChevronDown className="text-secondary-400" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-(--anchor-width)"><DropdownMenuLabel>Pilih tingkat kesulitan</DropdownMenuLabel><DropdownMenuGroup><DropdownMenuRadioGroup onValueChange={(value) => onUpdate({ ...questionDraft, difficulty: value as BankQuestion["difficulty"] })} value={questionDraft.difficulty}><DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="easy">Mudah</DropdownMenuRadioItem><DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="medium">Sedang</DropdownMenuRadioItem><DropdownMenuRadioItem className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900" value="hard">Sulit</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></Field>
      </div>
      <Field><div className="flex flex-wrap items-center justify-between gap-2"><FieldLabel htmlFor="question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><Button aria-describedby={describedBy(readinessHint ? "question-readiness-hint" : undefined, hasExplanationMediaIssue ? "question-explanation-media-error" : undefined)} aria-invalid={hasExplanationMediaIssue} data-question-anchor="media" data-question-field="media" data-question-field-key="explanation" disabled={!activeQuestionId || isQuestionContentLocked} id="question-media-explanation" onClick={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} size="sm" type="button" variant="ghost"><ImagePlus data-icon="inline-start" />{questionDraft.explanationMediaAssetId ? "Ganti gambar" : "Tambah gambar"}</Button></div><FieldTextarea disabled={isQuestionContentLocked} id="question-explanation" onChange={(event) => onUpdate({ ...questionDraft, explanation: event.target.value })} value={questionDraft.explanation} />{questionDraft.explanationMediaAssetId ? <QuestionMediaAttachment assetId={questionDraft.explanationMediaAssetId} disabled={isQuestionContentLocked} field="explanation" label="Gambar penjelasan" onRemove={() => onUpdate({ ...questionDraft, explanationMediaAssetId: undefined })} onReplace={() => onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })} /> : null}{hasExplanationMediaIssue ? <p className="text-sm font-medium text-student-status-danger-fg" id="question-explanation-media-error" role="alert">Gambar penjelasan belum siap. Pilih gambar lain atau hapus lampirannya.</p> : null}</Field>
      {readinessHint ? <p className="sr-only" id="question-readiness-hint">{readinessHint}</p> : null}
    </div>
  );
}

function QuestionBankPreview({ hasSubmittedPreview, onChoiceChange, onSubmit, previewChoiceId, questionDraft }: { hasSubmittedPreview: boolean; onChoiceChange: (choiceId: string) => void; onSubmit: () => void; previewChoiceId: string | null; questionDraft: BankQuestion }) {
  return <section className="min-w-0 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6">
    {questionDraft.promptMediaAssetId ? <MediaAssetPreview alt="Gambar pertanyaan" assetId={questionDraft.promptMediaAssetId} className="mb-5" /> : null}
    <p className="text-xl leading-8 font-normal text-secondary-900">{questionDraft.prompt || "Pertanyaan akan tampil di sini."}</p>
    <RadioGroup key={questionDraft.id} className="mt-6" onValueChange={onChoiceChange} value={previewChoiceId ?? undefined}>{questionDraft.choices.map((choice, index) => { const choiceLabel = String.fromCharCode(65 + index); const choiceId = `preview-choice-${questionDraft.id}-${choice.id}`; return <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary-100 px-4 py-4 text-sm text-secondary-700 transition-colors hover:border-primary-300 hover:bg-primary-50/60 has-[[data-checked]]:border-primary-300 has-[[data-checked]]:bg-primary-50" htmlFor={choiceId} key={choice.id}><RadioGroupItem id={choiceId} value={choice.id} /><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">{choiceLabel}</span><span className="flex min-w-0 flex-1 flex-col gap-3"><span>{choice.text || `Opsi ${choiceLabel}`}</span>{choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${choiceLabel}`} assetId={choice.mediaAssetId} className="max-h-44" /> : null}</span></label>; })}</RadioGroup>
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-primary-100 pt-5"><Button disabled={!previewChoiceId} onClick={onSubmit} type="button" variant="brand">Kirim jawaban</Button>{hasSubmittedPreview ? <p aria-live="polite" className={cn("rounded-2xl px-3 py-2 text-sm font-medium", previewChoiceId === questionDraft.correctChoiceId ? "bg-primary-50 text-primary-800" : "bg-red-50 text-red-800")}>{previewChoiceId === questionDraft.correctChoiceId ? "Jawaban benar." : "Belum tepat. Coba lagi."}</p> : null}</div>
  </section>;
}

function QuestionBankInventory({
  activeQuestionId,
  builderState,
  isDisabled,
  onAddQuestion,
  onOpenQuestion,
  onRemoveQuestion,
  questionRowRefs,
  readiness,
}: {
  activeQuestionId: string | null;
  builderState: { questions: BankQuestion[] };
  isDisabled: boolean;
  onAddQuestion: () => void;
  onOpenQuestion: (questionId: string) => void;
  onRemoveQuestion: (id: string) => void;
  questionRowRefs: QuestionRowRefs;
  readiness: QuestionBankReadiness;
}) {
  const visibleQuestions = builderState.questions;
  const isQuestionReady = (questionId: string) =>
    !readiness.issues.some((issue) => issue.questionId === questionId);
  const incompleteCount = readiness.incompleteCount;
  const focusableQuestionId =
    visibleQuestions.find((question) => question.id === activeQuestionId)?.id ??
    visibleQuestions[0]?.id ??
    null;

  function focusQuestion(questionId: string) {
    onOpenQuestion(questionId);
    window.requestAnimationFrame(() => {
      questionRowRefs.current[questionId]?.querySelector<HTMLButtonElement>("button")?.focus();
    });
  }

  function handleQuestionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    questionId: string,
  ) {
    if (![
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "End",
      "Home",
    ].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = visibleQuestions.findIndex((question) => question.id === questionId);
    if (currentIndex < 0 || visibleQuestions.length === 0) return;

    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? visibleQuestions.length - 1
          : ["ArrowDown", "ArrowRight"].includes(event.key)
            ? Math.min(currentIndex + 1, visibleQuestions.length - 1)
            : Math.max(currentIndex - 1, 0);
    const nextQuestion = visibleQuestions[nextIndex];
    if (nextQuestion && nextQuestion.id !== questionId) {
      focusQuestion(nextQuestion.id);
    }
  }

  return (
    <aside
      aria-labelledby="question-bank-inventory-title"
      className="order-1 min-w-0 rounded-2xl border border-primary-100 bg-white p-3 md:p-4 xl:col-start-1 xl:row-start-1 xl:order-none xl:sticky xl:top-24 xl:self-start"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-secondary-900" id="question-bank-inventory-title">
            Inventori soal
          </h2>
          <p className="mt-1 text-xs text-secondary-500">
            {builderState.questions.length} soal{incompleteCount > 0 ? ` · ${incompleteCount} perlu diperbaiki` : ""}
          </p>
        </div>
        <Button
          aria-label="Tambah soal"
          disabled={isDisabled}
          onClick={onAddQuestion}
          size="icon-sm"
          type="button"
          variant="brandOutline"
        >
          <Plus />
        </Button>
      </div>
      <nav aria-label="Navigasi soal" className="mt-3">
        <div className="mt-3 max-h-56 overflow-y-auto pr-1 xl:max-h-[calc(100svh-20rem)]" id="question-bank-inventory-list">
          <ul aria-label="Daftar soal" className="flex flex-col gap-1.5">
            {visibleQuestions.length > 0 ? visibleQuestions.map((question) => {
              const questionNumber = builderState.questions.findIndex((item) => item.id === question.id) + 1;
              const ready = isQuestionReady(question.id) && isReady(question);
              const isActive = activeQuestionId === question.id;
              const issueCount = readiness.issues.filter((issue) => issue.questionId === question.id).length;
              const hasIssues = !ready;
              const deleteHelpId = `question-bank-delete-help-${question.id}`;
              return (
                <li
                  className={cn(
                    "group flex min-w-0 items-center gap-1 rounded-xl border border-transparent px-2 py-1.5 transition-colors",
                    isActive
                      ? "border-primary-200 bg-primary-50"
                      : hasIssues
                        ? "border-amber-300 bg-amber-50/70 hover:border-amber-400 hover:bg-amber-50"
                      : "hover:border-primary-100 hover:bg-primary-50/60",
                  )}
                  key={question.id}
                  ref={(element) => {
                    questionRowRefs.current[question.id] = element;
                  }}
                >
                  <button
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`Soal ${questionNumber}${issueCount ? `, ${issueCount} masalah` : ""}${isActive ? ", dipilih" : ""}`}
                    className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-primary-200"
                    onClick={() => onOpenQuestion(question.id)}
                    onKeyDown={(event) => handleQuestionKeyDown(event, question.id)}
                    tabIndex={question.id === focusableQuestionId ? 0 : -1}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal leading-4 text-secondary-900">
                      <span className="min-w-0 flex-1 truncate">
                        {questionNumber}. {question.prompt || "Soal tanpa pertanyaan"}
                      </span>
                    </span>
                    <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge size="ui" variant="mint">{question.subjectCode}</Badge>
                      {hasIssues ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-950">
                          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                          <span>Perlu diperbaiki</span>
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <Button
                    aria-describedby={builderState.questions.length <= 1 ? deleteHelpId : undefined}
                    aria-label={`Hapus soal ${questionNumber}`}
                    disabled={isDisabled || builderState.questions.length <= 1}
                    onClick={() => onRemoveQuestion(question.id)}
                    onKeyDown={(event) => handleQuestionKeyDown(event, question.id)}
                    size="icon-sm"
                    tabIndex={isActive ? 0 : -1}
                    title={builderState.questions.length <= 1 ? "Soal terakhir tidak dapat dihapus" : undefined}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  {builderState.questions.length <= 1 ? <span className="sr-only" id={deleteHelpId}>Soal terakhir tidak dapat dihapus.</span> : null}
                </li>
              );
            }) : (
              <li className="px-2 py-4 text-sm leading-6 text-secondary-500">
                Belum ada soal. Tambahkan soal pertama dan pilih Subtest-nya.
              </li>
            )}
          </ul>
        </div>
      </nav>
    </aside>
  );
}

function QuestionBankMobileInventory({
  activeQuestionId,
  builderState,
  isDisabled,
  onAddQuestion,
  onOpenQuestion,
  readiness,
}: {
  activeQuestionId: string | null;
  builderState: { questions: BankQuestion[] };
  isDisabled: boolean;
  onAddQuestion: () => void;
  onOpenQuestion: (questionId: string) => void;
  readiness: QuestionBankReadiness;
}) {
  const activeIndex = builderState.questions.findIndex(
    (question) => question.id === activeQuestionId,
  );
  const activeQuestion = builderState.questions[activeIndex] ?? builderState.questions[0];
  const incompleteCount = readiness.incompleteCount;

  return (
    <div className="border-b border-primary-100 bg-white px-3 py-3 shadow-xs md:hidden">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Pilih soal yang sedang diedit"
            render={
              <Button
                className="min-w-0 flex-1 justify-between text-left"
                disabled={builderState.questions.length === 0}
                type="button"
                variant="context"
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
              onValueChange={onOpenQuestion}
              value={activeQuestionId ?? undefined}
            >
              {builderState.questions.map((question, index) => {
                const issueCount = readiness.issues.filter(
                  (issue) => issue.questionId === question.id,
                ).length;
                return (
                  <DropdownMenuRadioItem key={question.id} value={question.id}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 text-xs font-semibold text-secondary-500">
                        {index + 1}.
                      </span>
                      <span className="min-w-0 truncate">
                        {question.prompt || "Soal tanpa pertanyaan"}
                      </span>
                      {issueCount > 0 ? (
                        <span className="shrink-0 text-xs font-semibold text-amber-700">
                          {issueCount} masalah
                        </span>
                      ) : null}
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          aria-label="Tambah soal"
          disabled={isDisabled}
          onClick={onAddQuestion}
          size="icon-sm"
          type="button"
          variant="brandOutline"
        >
          <Plus />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-secondary-500">
        <span>{builderState.questions.length} soal di bank</span>
        {incompleteCount > 0 ? <span className="font-semibold text-amber-900">{incompleteCount} perlu diperbaiki</span> : null}
      </div>
    </div>
  );
}

function QuestionBankOrganizationPanel({
  builderState,
  categories,
  collapsedByDefault = false,
  isDisabled,
  onUpdate,
}: {
  builderState: QuestionBankBuilderFormState;
  categories: QuestionBankCategoryOption[];
  collapsedByDefault?: boolean;
  isDisabled: boolean;
  onUpdate: (patch: QuestionBankOrganizationPatch) => void;
}) {
  const [isOpen, setIsOpen] = useState(!collapsedByDefault);
  const selectedCategories = categories.filter((category) => builderState.categoryIds.includes(category.id));

  return (
    <section className="rounded-2xl border border-primary-100 bg-primary-50/35 p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <button
          aria-controls="bank-organization-fields"
          aria-expanded={isOpen}
          className="min-w-0 flex-1 text-left"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Organisasi</p>
          <h2 className="mt-1 text-xl font-semibold text-secondary-900">Organisasi (opsional)</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">Atur kategori tanpa mengubah isi soal.</p>
        </button>
        <Button
          aria-controls="bank-organization-fields"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Sembunyikan organisasi" : "Tampilkan organisasi"}
          className="mt-0.5 shrink-0"
          onClick={() => setIsOpen((open) => !open)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronDown className={cn("transition-transform", isOpen ? "rotate-180" : undefined)} />
        </Button>
      </div>
      {isOpen ? <div className="mt-5 grid gap-5" id="bank-organization-fields">
        <Field>
          <FieldLabel htmlFor="bank-categories">Kategori</FieldLabel>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isDisabled}
              render={<Button className="w-full justify-between" id="bank-categories" type="button" variant="context" />}
            >
              <span className="truncate">{selectedCategories.length ? `${selectedCategories.length} kategori dipilih` : "Belum ada kategori"}</span>
              <ChevronDown className="size-4 text-secondary-400" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-(--anchor-width)">
              <DropdownMenuLabel>Pilih satu atau beberapa kategori</DropdownMenuLabel>
              {categories.length ? categories.map((category) => (
                <DropdownMenuCheckboxItem
                  checked={builderState.categoryIds.includes(category.id)}
                  disabled={isDisabled}
                  key={category.id}
                  onCheckedChange={(checked) => onUpdate({ categoryIds: checked ? [...builderState.categoryIds, category.id] : builderState.categoryIds.filter((id) => id !== category.id) })}
                >
                  {category.name}
                </DropdownMenuCheckboxItem>
              )) : <div className="px-3 py-2 text-sm text-secondary-500">Belum ada kategori bersama.</div>}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedCategories.length ? <div className="mt-3 flex flex-wrap gap-2">{selectedCategories.map((category) => <Badge key={category.id} size="ui" variant="mint">{category.name}</Badge>)}</div> : null}
        </Field>
      </div> : <p className="mt-3 text-sm text-secondary-600">Kategori bersifat opsional.</p>}
    </section>
  );
}

type QuestionBankBuilderFormState = {
  categoryIds: string[];
  description: string;
  questions: BankQuestion[];
  subjectCode: string;
  title: string;
};
type QuestionBankBuilderViewState = {
  activeQuestionId: string | null;
  activeTab: QuestionBankEditorTab;
  confirmationRequest: ConfirmationRequest | null;
  hasSubmittedPreview: boolean;
  hasUnsavedChanges: boolean;
  isMetadataLocked: boolean;
  isQuestionContentLocked: boolean;
  isSaving: boolean;
  isDraftLifecycle: boolean;
  lifecycleStatus: KaptenQuestionBank["status"];
  lifecycleError: string | null;
  mediaPickerTarget: MediaPickerTarget | null;
  pendingRouteReplacement: string | null;
  previewChoiceId: string | null;
  questionRowRefs: QuestionRowRefs;
  questionDraft: BankQuestion;
  questionEditorTab: string;
  readiness: QuestionBankReadiness;
  readinessAnnouncement: string;
  selectedMediaAssetId: string | undefined;
};
type QuestionBankBuilderActions = {
  addChoice: () => void;
  addQuestion: () => void;
  closeConfirmation: () => void;
  confirmPendingAction: () => void;
  onChangeTab: (value: string) => void;
  onChoiceChange: (value: string) => void;
  onCloseMedia: () => void;
  onEditorTabChange: (value: string) => void;
  focusFirstIssue: () => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onOpenQuestion: (questionId: string) => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
  onRemoveQuestion: (id: string) => void;
  onSelectMedia: (asset: MediaAssetDto) => void;
  onSubmitPreview: () => void;
  onUpdateDraft: (question: BankQuestion) => void;
  requestArchive: () => void;
  saveDraft: () => void;
  updateMetadata: (field: "title" | "description", value: string) => void;
  updateOrganization: (patch: QuestionBankOrganizationPatch) => void;
  updateLifecycle: (operation: "archive" | "publish" | "unpublish" | "restore") => void;
};

function QuestionBankEditorHeader({ actions, builderState, mode, state }: { actions: QuestionBankBuilderActions; builderState: QuestionBankBuilderFormState; mode: "create" | "edit"; state: QuestionBankBuilderViewState }) {
  const titleMissing = mode === "create" && !builderState.title.trim();
  const saveLabel = mode === "create" ? "Buat dan mulai menulis" : "Simpan perubahan";
  const publishDisabledReason = state.hasUnsavedChanges
    ? "Simpan dulu untuk menerbitkan"
    : state.readiness.incompleteCount > 0
      ? `${state.readiness.incompleteCount} soal belum lengkap`
      : undefined;
  const lifecycleDisabledReason = state.hasUnsavedChanges ? "Simpan dulu untuk mengubah status" : undefined;

  return (
    <section className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><Button nativeButton={false} render={<Link href="/mentor/quiz/question-bank" />} aria-label="Kembali ke bank soal" size="icon-sm" title="Kembali ke bank soal" variant="ghost"><ChevronLeft /></Button><div className="mt-5 flex flex-col gap-x-3 gap-y-2"><h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">{mode === "create" ? "Buat Bank Soal" : builderState.title}</h1>{state.hasUnsavedChanges ? <span className="inline-flex items-center gap-2 text-sm font-medium text-[#856300]"><span aria-hidden="true" className="size-2 rounded-full bg-[#d29b18]" />Belum disimpan</span> : null}{state.readiness.incompleteCount > 0 ? <Button aria-label={`Lihat ${state.readiness.incompleteCount} masalah kesiapan`} className="w-fit justify-start px-0 text-sm font-semibold text-amber-900 underline-offset-4 hover:underline" onClick={actions.focusFirstIssue} type="button" variant="ghost"><AlertTriangle data-icon="inline-start" />Lihat masalah <span className="font-normal">({state.readiness.incompleteCount})</span></Button> : null}</div></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button aria-describedby={titleMissing ? "create-bank-title-help" : undefined} aria-label={saveLabel} disabled={state.isSaving || state.isMetadataLocked || titleMissing} onClick={actions.saveDraft} size="sm" title={mode === "create" ? undefined : saveLabel} type="button" variant={state.hasUnsavedChanges ? "brand" : "brandOutline"}><Save />{mode === "create" ? saveLabel : "Simpan"}</Button>
        {titleMissing ? <p className="text-xs text-secondary-600" id="create-bank-title-help">Isi judul untuk membuat bank soal.</p> : null}
        {mode === "edit" && state.isDraftLifecycle ? <><Button aria-busy={state.isSaving} data-question-bank-lifecycle-action="publish" aria-describedby={publishDisabledReason ? "publish-disabled-reason" : undefined} disabled={state.isSaving || state.hasUnsavedChanges || state.readiness.incompleteCount > 0} id="question-bank-lifecycle-publish" onClick={() => actions.updateLifecycle("publish")} type="button" variant="brandOutline">{state.isSaving ? "Menerbitkan…" : "Terbitkan"}</Button>{publishDisabledReason ? <p className="text-xs text-secondary-600" id="publish-disabled-reason">{publishDisabledReason}</p> : null}</> : null}
        {mode === "edit" && state.isDraftLifecycle ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label="Aksi destruktif Bank Soal" size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup><DropdownMenuItem disabled={state.isSaving || Boolean(lifecycleDisabledReason)} onClick={actions.requestArchive} variant="destructive"><Archive />Arsipkan</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> : null}
      </div>
    </section>
  );
}

function QuestionBankQuestionWorkspace({
  actions,
  builderState,
  state,
  workspaceRef,
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  state: QuestionBankBuilderViewState;
  workspaceRef: { current: HTMLDivElement | null };
}) {
  const questionIssues = state.readiness.issues.filter(
    (issue) => issue.questionId === state.activeQuestionId,
  );

  return (
    <section className="grid items-start gap-6 xl:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)] xl:gap-6">
      <div className="order-2 min-w-0 scroll-mt-24 xl:col-start-2 xl:row-start-1 xl:order-none" data-question-workspace="current" id="question-bank-question-workspace" ref={workspaceRef}>
        <div className="flex min-h-11 flex-wrap items-center gap-3"><h2 className="text-2xl font-semibold text-secondary-900" id="question-bank-question-workspace-title">Edit soal</h2></div>
        {questionIssues.length ? <p aria-live="polite" className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950" role="status"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>Soal ini memiliki {questionIssues.length} masalah. Perbaiki bidang yang ditandai sebelum menerbitkan.</span></p> : null}
        <Tabs className="mt-4 gap-5" onValueChange={actions.onEditorTabChange} value={state.questionEditorTab}>
          <TabsList><TabsTrigger className="rounded-full px-4" value="edit">Edit</TabsTrigger><TabsTrigger className="rounded-full px-4" value="preview">Preview</TabsTrigger></TabsList>
          <TabsContent className="m-0" value="edit"><QuestionBankEditorForm activeQuestionId={state.activeQuestionId} isQuestionContentLocked={state.isQuestionContentLocked} onAddChoice={actions.addChoice} onOpenMedia={actions.onOpenMedia} onRemoveChoice={actions.onRemoveChoice} onRemoveChoiceMedia={actions.onRemoveChoiceMedia} onUpdate={actions.onUpdateDraft} questionDraft={state.questionDraft} readinessIssues={questionIssues} /></TabsContent>
          <TabsContent className="m-0" value="preview"><QuestionBankPreview hasSubmittedPreview={state.hasSubmittedPreview} onChoiceChange={actions.onChoiceChange} onSubmit={actions.onSubmitPreview} previewChoiceId={state.previewChoiceId} questionDraft={state.questionDraft} /></TabsContent>
        </Tabs>
      </div>
      <QuestionBankInventory
        activeQuestionId={state.activeQuestionId}
        builderState={builderState}
        isDisabled={state.isQuestionContentLocked}
        onAddQuestion={actions.addQuestion}
        onOpenQuestion={actions.onOpenQuestion}
        onRemoveQuestion={actions.onRemoveQuestion}
        questionRowRefs={state.questionRowRefs}
        readiness={state.readiness}
      />
    </section>
  );
}

function QuestionBankTabs({ actions, builderState, categories, mode, state, workspaceRef }: { actions: QuestionBankBuilderActions; builderState: QuestionBankBuilderFormState; categories: QuestionBankCategoryOption[]; mode: "create" | "edit"; state: QuestionBankBuilderViewState; workspaceRef: { current: HTMLDivElement | null } }) {
  return <Tabs className="gap-8" onValueChange={actions.onChangeTab} value={state.activeTab}>
    <div className="max-w-full overflow-x-auto pb-1"><TabsList className="w-max min-w-full sm:min-w-0"><TabsTrigger className="h-11 rounded-full px-4 text-sm" value="questions">Soal <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">{builderState.questions.length}</span></TabsTrigger><TabsTrigger className="h-11 rounded-full px-4 text-sm" value="details">Detail bank</TabsTrigger></TabsList></div>
    <TabsContent className="m-0" value="details"><section className="grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start"><div className="grid gap-5"><Field><FieldLabel htmlFor="bank-title">Judul bank</FieldLabel><FieldInput aria-describedby={mode === "create" && !builderState.title.trim() ? "bank-title-help" : undefined} aria-required={mode === "create"} disabled={state.isMetadataLocked} id="bank-title" onChange={(event) => actions.updateMetadata("title", event.target.value)} required={mode === "create"} value={builderState.title} />{mode === "create" && !builderState.title.trim() ? <p className="text-xs text-secondary-600" id="bank-title-help">Isi judul untuk membuat bank soal.</p> : null}</Field><Field><FieldLabel htmlFor="bank-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-[100px]" disabled={state.isMetadataLocked} id="bank-description" onChange={(event) => actions.updateMetadata("description", event.target.value)} value={builderState.description} /></Field></div><QuestionBankOrganizationPanel builderState={builderState} categories={categories} collapsedByDefault={mode === "create"} isDisabled={state.isMetadataLocked} onUpdate={actions.updateOrganization} /></section></TabsContent>
    <TabsContent className="m-0" value="questions"><QuestionBankQuestionWorkspace actions={actions} builderState={builderState} state={state} workspaceRef={workspaceRef} /></TabsContent>
  </Tabs>;
}

function QuestionBankBuilderScreen({
  actions,
  bankId,
  builderState,
  categories,
  mode,
  session,
  state,
  workspaceRef,
}: {
  actions: QuestionBankBuilderActions;
  bankId?: string;
  builderState: QuestionBankBuilderFormState;
  categories: QuestionBankCategoryOption[];
  mode: "create" | "edit";
  session: SessionContext;
  state: QuestionBankBuilderViewState;
  workspaceRef: { current: HTMLDivElement | null };
}) {
  const confirmation = state.confirmationRequest;
  const targetBankId = bankId ?? builderState.title;
  const detailHref = `/mentor/quiz/question-bank/${targetBankId}`;

  const publishDisabledReason = state.hasUnsavedChanges
    ? "Simpan dulu untuk menerbitkan"
    : state.readiness.incompleteCount > 0
      ? `${state.readiness.incompleteCount} soal belum lengkap`
      : undefined;
  const lifecycleDisabledReason = state.hasUnsavedChanges ? "Simpan dulu untuk mengubah status" : undefined;
  const questionIssues = state.readiness.issues.filter(
    (issue) => issue.questionId === state.activeQuestionId,
  );

  if (mode === "create") {
    return (
      <MentorWorkspaceShell
        activeLabel="Bank Soal"
        breadcrumbLabel="Buat Bank Soal"
        contentElement="div"
        mainClassName="max-w-[1500px] gap-7"
        onNavigateAway={() => !state.hasUnsavedChanges}
        searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
        session={session}
        showSearch={false}
        shouldGuardNavigation={state.hasUnsavedChanges}
      >
        <QuestionBankEditorHeader actions={actions} builderState={builderState} mode={mode} state={state} />
        <p aria-live="polite" className="sr-only" role="status">{state.readinessAnnouncement}</p>
        {state.lifecycleError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{state.lifecycleError}</p> : null}
        <QuestionBankTabs actions={actions} builderState={builderState} categories={categories} mode={mode} state={state} workspaceRef={workspaceRef} />
        <MediaPickerDialog onOpenChange={(open) => { if (!open) actions.onCloseMedia(); }} onSelect={actions.onSelectMedia} open={Boolean(state.mediaPickerTarget)} selectedAssetId={state.selectedMediaAssetId} title={state.mediaPickerTarget?.label ?? "Pilih gambar"} />
        <AlertDialog onOpenChange={(open) => { if (!open) actions.closeConfirmation(); }} open={Boolean(state.confirmationRequest)}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><CircleHelp /></AlertDialogMedia><AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={actions.closeConfirmation}>Batal</AlertDialogCancel><AlertDialogAction onClick={actions.confirmPendingAction} variant="destructive">{confirmation?.confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </MentorWorkspaceShell>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-secondary-50/40">
      {/* Full page editor top header */}
      <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-100 bg-white px-3 py-2 shadow-xs md:h-14 md:flex-nowrap md:px-6 md:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <Button
            aria-label="Kembali ke detail bank soal"
            nativeButton={false}
            render={<Link href={detailHref} />}
            size="sm"
            variant="ghost"
          >
            <ChevronLeft />
            <span className="hidden sm:inline font-medium">Kembali ke Detail</span>
          </Button>
          <div className="h-5 w-px bg-primary-100" />
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="max-w-[150px] truncate text-base font-bold text-secondary-900 sm:max-w-xs md:max-w-md">
              {builderState.title || "Bank Soal"}
            </h1>
            {state.hasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#d29b18]" />
                Belum disimpan
              </span>
            ) : null}
          </div>
          {state.readiness.incompleteCount > 0 ? (
            <Button
              aria-label={`Lihat ${state.readiness.incompleteCount} masalah kesiapan`}
              className="hidden h-7 px-2 text-xs font-semibold text-amber-900 underline-offset-4 hover:underline lg:flex"
              onClick={actions.focusFirstIssue}
              type="button"
              variant="ghost"
            >
              <AlertTriangle data-icon="inline-start" />
              Lihat masalah <span className="font-normal">({state.readiness.incompleteCount})</span>
            </Button>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
          <Button
            aria-label="Simpan"
            disabled={state.isSaving || state.isMetadataLocked}
            onClick={actions.saveDraft}
            size="sm"
            title="Simpan perubahan"
            type="button"
            variant={state.hasUnsavedChanges ? "brand" : "brandOutline"}
          >
            <Save />
            {state.isSaving ? "Menyimpan…" : "Simpan"}
          </Button>

          {state.isDraftLifecycle ? (
            <>
              <Button
                aria-busy={state.isSaving}
                data-question-bank-lifecycle-action="publish"
                aria-describedby={publishDisabledReason ? "publish-disabled-reason" : undefined}
                disabled={state.isSaving || state.hasUnsavedChanges || state.readiness.incompleteCount > 0}
                id="question-bank-lifecycle-publish"
                onClick={() => actions.updateLifecycle("publish")}
                size="sm"
                type="button"
                variant="brandOutline"
              >
                {state.isSaving ? "Menerbitkan…" : "Terbitkan"}
              </Button>
              {publishDisabledReason ? <span className="sr-only" id="publish-disabled-reason">{publishDisabledReason}</span> : null}
            </>
          ) : null}

          {state.isDraftLifecycle ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label="Aksi destruktif Bank Soal"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={state.isSaving || Boolean(lifecycleDisabledReason)}
                    onClick={actions.requestArchive}
                    variant="destructive"
                  >
                    <Archive />
                    Arsipkan
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <p aria-live="polite" className="sr-only" role="status">{state.readinessAnnouncement}</p>
      {state.lifecycleError ? (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2.5">
          <p aria-live="assertive" className="text-xs text-red-800 font-semibold" role="alert">
            {state.lifecycleError}
          </p>
        </div>
      ) : null}

      <QuestionBankMobileInventory
        activeQuestionId={state.activeQuestionId}
        builderState={builderState}
        isDisabled={state.isQuestionContentLocked}
        onAddQuestion={actions.addQuestion}
        onOpenQuestion={actions.onOpenQuestion}
        readiness={state.readiness}
      />

      {/* Main Full Page Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Side: Soal Inventori replaces the dashboard sidebar */}
        <div className="hidden md:flex w-72 lg:w-80 border-r border-primary-100 bg-white flex-col shrink-0 overflow-y-auto [&_aside]:rounded-none [&_aside]:border-0 [&_aside]:shadow-none">
          <QuestionBankInventory
            activeQuestionId={state.activeQuestionId}
            builderState={builderState}
            isDisabled={state.isQuestionContentLocked}
            onAddQuestion={actions.addQuestion}
            onOpenQuestion={actions.onOpenQuestion}
            onRemoveQuestion={actions.onRemoveQuestion}
            questionRowRefs={state.questionRowRefs}
            readiness={state.readiness}
          />
        </div>

        {/* Right Side: Main Soal Editor Workspace with Preview */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8"
          data-question-workspace="current"
          id="question-bank-question-workspace"
          ref={workspaceRef}
        >
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex min-h-11 flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-secondary-900" id="question-bank-question-workspace-title">
                Edit soal
              </h2>
            </div>

            {questionIssues.length ? (
              <p aria-live="polite" className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950" role="status">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>Soal ini memiliki {questionIssues.length} masalah. Perbaiki bidang yang ditandai sebelum menerbitkan.</span>
              </p>
            ) : null}

            <Tabs className="gap-5" onValueChange={actions.onEditorTabChange} value={state.questionEditorTab}>
              <TabsList>
                <TabsTrigger className="rounded-full px-4" value="edit">Edit</TabsTrigger>
                <TabsTrigger className="rounded-full px-4" value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent className="m-0" value="edit">
                <QuestionBankEditorForm
                  activeQuestionId={state.activeQuestionId}
                  isQuestionContentLocked={state.isQuestionContentLocked}
                  onAddChoice={actions.addChoice}
                  onOpenMedia={actions.onOpenMedia}
                  onRemoveChoice={actions.onRemoveChoice}
                  onRemoveChoiceMedia={actions.onRemoveChoiceMedia}
                  onUpdate={actions.onUpdateDraft}
                  questionDraft={state.questionDraft}
                  readinessIssues={questionIssues}
                />
              </TabsContent>
              <TabsContent className="m-0" value="preview">
                <QuestionBankPreview
                  hasSubmittedPreview={state.hasSubmittedPreview}
                  onChoiceChange={actions.onChoiceChange}
                  onSubmit={actions.onSubmitPreview}
                  previewChoiceId={state.previewChoiceId}
                  questionDraft={state.questionDraft}
                />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      <MediaPickerDialog
        onOpenChange={(open) => { if (!open) actions.onCloseMedia(); }}
        onSelect={actions.onSelectMedia}
        open={Boolean(state.mediaPickerTarget)}
        selectedAssetId={state.selectedMediaAssetId}
        title={state.mediaPickerTarget?.label ?? "Pilih gambar"}
      />
      <AlertDialog
        onOpenChange={(open) => { if (!open) actions.closeConfirmation(); }}
        open={Boolean(state.confirmationRequest)}
      >
        <AlertDialogContent size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger"><CircleHelp /></AlertDialogMedia>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={actions.closeConfirmation}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={actions.confirmPendingAction} variant="destructive">
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useQuestionBankNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router }: { hasUnsavedChanges: boolean; pendingRouteReplacement: string | null; router: ReturnType<typeof useRouter> }) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) return;
    const frame = window.requestAnimationFrame(() => router.replace(pendingRouteReplacement));
    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);
}

function useQuestionBankPersistence({
  bankIdRef,
  builderState,
  mode,
  onBankNoLongerEditable,
  revisionRef,
  setServerReadiness,
  setLocalBuilderState,
  updateEditor,
}: {
  bankIdRef: { current: string | undefined };
  builderState: LocalQuestionBankState;
  mode: "create" | "edit";
  onBankNoLongerEditable: (bankId: string) => void;
  revisionRef: { current: number | undefined };
  setServerReadiness: (readiness: QuestionBankReadiness | null) => void;
  setLocalBuilderState: (state: LocalQuestionBankState) => void;
  updateEditor: (patch: Partial<QuestionBankEditorState>) => void;
}) {
  async function saveDraft() {
    updateEditor({ isSaving: true, lifecycleError: null });
    try {
      const result = await saveQuestionBankAction({ description: builderState.description, id: bankIdRef.current, questions: builderState.questions, revision: revisionRef.current, title: builderState.title });
      if (!result.ok) { if (result.readiness) setServerReadiness(result.readiness); updateEditor({ lifecycleError: result.message }); return; }
      revisionRef.current = result.result.bank.revision;
      bankIdRef.current = result.result.bank.id;
      const savedBank = result.result.bank;
      const desiredCategoryIds = [...builderState.categoryIds];
      const contentState = {
        categoryIds: desiredCategoryIds,
        description: savedBank.description,
        questions: result.result.questions,
        subjectCode: builderState.subjectCode,
        title: savedBank.title,
      };
      const organizationVersion = { expectedRevision: savedBank.revision, expectedUpdatedAt: savedBank.updatedAt };

      if (!sameStringSet(savedBank.categoryIds, desiredCategoryIds)) {
        const categoryResult = await setQuestionBankCategoriesAction(savedBank.id, desiredCategoryIds, organizationVersion);
        if (!categoryResult.ok) {
          setLocalBuilderState(contentState);
          updateEditor({ lifecycleError: categoryResult.message, hasUnsavedChanges: true });
          return;
        }
      }

      setLocalBuilderState(contentState);
      setServerReadiness(result.result.readiness);
      updateEditor({ hasUnsavedChanges: false, lifecycleStatus: result.result.bank.status });
      showToast(mode === "create" ? "Bank Soal dibuat." : "Perubahan Bank Soal tersimpan.", { variant: "success" });
      if (mode === "create") updateEditor({ pendingRouteReplacement: `/mentor/quiz/question-bank/${result.result.bank.id}` });
    } catch (saveError) {
      updateEditor({ lifecycleError: saveError instanceof Error ? saveError.message : "Bank Soal belum dapat disimpan." });
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  async function updateLifecycle(operation: "archive" | "publish" | "unpublish" | "restore") {
    const id = bankIdRef.current;
    if (!id) return;
    updateEditor({ isSaving: true, lifecycleError: null });
    try {
      const result = await updateQuestionBankLifecycleAction(id, operation, { expectedRevision: revisionRef.current ?? 1 });
      if (!result.ok) { if (result.readiness) setServerReadiness(result.readiness); updateEditor({ lifecycleError: result.message }); return; }
      revisionRef.current = result.result.revision;
      if (operation === "publish") setServerReadiness(null);
      updateEditor({ hasUnsavedChanges: false, lifecycleError: null, lifecycleStatus: result.result.status });
      const lifecycleMessage = operation === "publish"
        ? "Bank Soal diterbitkan."
        : operation === "unpublish"
          ? "Bank Soal dijadikan draf."
          : operation === "archive"
            ? "Bank Soal diarsipkan."
            : "Bank Soal dipulihkan.";
      showToast(lifecycleMessage, { variant: "success" });
      if (operation === "publish" || operation === "archive") {
        onBankNoLongerEditable(result.result.id);
      }
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  return { saveDraft, updateLifecycle };
}

function KaptenQuestionBankBuilderPageModule({
  bankId,
  initialActiveQuestionId,
  initialCategories = [],
  initialBank = null,
  initialQuestions = [],
  initialReadiness = null,
  mode,
  session,
}: {
  bankId?: string;
  initialActiveQuestionId?: string;
  initialCategories?: QuestionBankCategoryOption[];
  initialBank?: KaptenQuestionBank | null;
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
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
      categoryIds: initialBank?.categoryIds ?? [],
      description: initialBank?.description ?? "",
      questions,
      subjectCode,
      title: initialBank?.title ?? "",
    };
  });
  const initialQuestion =
    (initialActiveQuestionId
      ? localBuilderState.questions.find((q) => q.id === initialActiveQuestionId)
      : null) ?? localBuilderState.questions[0]!;
  const [editorState, dispatch] = useReducer(questionBankEditorReducer, {
    activeQuestionId: initialQuestion.id,
    activeTab: mode === "create" ? "details" : "questions",
    confirmationRequest: null,
    hasSubmittedPreview: false,
    hasUnsavedChanges: mode === "create",
    isSaving: false,
    lifecycleError: null,
    lifecycleStatus: initialBank?.status ?? "draft",
    mediaPickerTarget: null,
    pendingRouteReplacement: null,
    readinessAnnouncement: "",
    serverReadiness: mode === "edit" ? initialReadiness : null,
    previewChoiceId: null,
    questionDraft: toQuestionDraft(initialQuestion),
    questionEditorTab: "edit",
  });
  const {
    activeQuestionId,
    activeTab,
    confirmationRequest,
    hasSubmittedPreview,
    hasUnsavedChanges,
    isSaving,
    lifecycleError,
    lifecycleStatus,
    mediaPickerTarget,
    pendingRouteReplacement,
    previewChoiceId,
    questionDraft,
    questionEditorTab,
    readinessAnnouncement,
    serverReadiness,
  } = editorState;
  const updateEditor = (patch: Partial<QuestionBankEditorState>) => dispatch({ patch, type: "patch" });
  const revisionRef = useRef(initialBank?.revision);
  const bankIdRef = useRef(initialBank?.id ?? bankId);
  const questionRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const previousActiveQuestionIdRef = useRef<string | null>(activeQuestionId);
  const questionFocusAfterDeleteRef = useRef<string | null>(null);
  const pendingIssueFocusRef = useRef<QuestionReadinessIssue | null>(null);

  const builderState = localBuilderState;

  const activeQuestion = activeQuestionId
    ? (builderState.questions.find(
        (question) => question.id === activeQuestionId,
      ) ?? null)
    : null;
  const isMetadataLocked = lifecycleStatus === "archived" || lifecycleStatus === "scheduled";
  const isQuestionContentLocked = lifecycleStatus !== "draft";
  const isDraftLifecycle = lifecycleStatus === "draft";
  const localReadiness = getQuestionBankReadinessFromDrafts(builderState.questions);
  const readiness = mergeQuestionBankReadiness(builderState.questions, localReadiness, serverReadiness);
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

  const questionNumber = useCallback((questionId: string) => {
    const index = builderState.questions.findIndex((question) => question.id === questionId);
    return index < 0 ? 0 : index + 1;
  }, [builderState.questions]);

  const focusIssueTarget = useCallback((issue: QuestionReadinessIssue, question: BankQuestion) => {
    const workspace = workspaceRef.current;
    const anchors = workspace
      ? Array.from(workspace.querySelectorAll<HTMLElement>("[data-question-anchor]"))
      : [];
    let target: HTMLElement | undefined;
    if (issue.field === "prompt") {
      target = anchors.find((element) => element.dataset.questionAnchor === "prompt");
    } else if (issue.field === "choice") {
      target = anchors.find((element) => element.dataset.questionAnchor === "choice" && (!issue.choiceId || element.dataset.questionChoiceId === issue.choiceId));
    } else if (issue.field === "correctChoice") {
      target = anchors.find((element) => element.dataset.questionAnchor === "correctChoice");
    } else if (issue.field === "subtest") {
      target = anchors.find((element) => element.dataset.questionAnchor === "subtest");
    } else {
      const mediaIssues = readiness.issues.filter((item) => item.questionId === issue.questionId && item.field === "media" && !item.choiceId);
      const mediaIssueIndex = mediaIssues.findIndex((item) => readinessIssueKey(item) === readinessIssueKey(issue));
      const mediaKey = issue.mediaTarget
        ?? (!question.promptMediaAssetId && question.explanationMediaAssetId
          ? "explanation"
          : mediaIssueIndex > 0
            ? "explanation"
            : "prompt");
      target = anchors.find((element) => element.dataset.questionAnchor === "media" && element.dataset.questionFieldKey === mediaKey && (!issue.choiceId || element.dataset.questionChoiceId === issue.choiceId));
      target ??= anchors.find((element) => element.dataset.questionAnchor === "media" && (!issue.choiceId || element.dataset.questionChoiceId === issue.choiceId));
    }
    if (!target || target.hasAttribute("disabled")) {
      const lifecycleAction = lifecycleStatus === "published"
        ? "unpublish"
        : lifecycleStatus === "archived"
          ? "restore"
          : null;
      const lifecycleTarget = lifecycleAction
        ? document.querySelector<HTMLButtonElement>(`[data-question-bank-lifecycle-action="${lifecycleAction}"]`)
        : null;
      if (!lifecycleTarget || lifecycleTarget.disabled) return false;
      lifecycleTarget.focus({ preventScroll: true });
      return "handoff";
    }
    target.focus({ preventScroll: true });
    return "exact";
  }, [lifecycleStatus, readiness.issues]);

  function announceIssue(issue: QuestionReadinessIssue, issueIndex: number, totalIssues: number) {
    updateEditor({ readinessAnnouncement: `Masalah ${issueIndex + 1} dari ${totalIssues}: Soal ${questionNumber(issue.questionId)}, ${readinessFieldLabel(issue)}.` });
  }

  function focusIssueAt(index: number) {
    const issue = readiness.issues[index];
    if (!issue) return;
    pendingIssueFocusRef.current = issue;
    updateEditor({ activeTab: "questions" });
    openQuestion(issue.questionId);
    announceIssue(issue, index, readiness.issues.length);
  }

  function focusFirstIssue() {
    if (!readiness.issues.length) {
      updateEditor({ readinessAnnouncement: "Tidak ada masalah yang perlu diperbaiki." });
      return;
    }
    focusIssueAt(0);
  }

  useQuestionBankNavigationGuards({ hasUnsavedChanges, pendingRouteReplacement, router });

  useEffect(() => {
    const activeQuestionChanged = previousActiveQuestionIdRef.current !== activeQuestionId;
    previousActiveQuestionIdRef.current = activeQuestionId;
    if (!activeQuestionId) return;

    const row = questionRowRefs.current[activeQuestionId];
    row?.scrollIntoView?.({ block: "nearest" });
    const questionFocusAfterDelete = questionFocusAfterDeleteRef.current;
    if (questionFocusAfterDelete === activeQuestionId) {
      window.requestAnimationFrame(() => {
        questionRowRefs.current[questionFocusAfterDelete]
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus();
        if (questionFocusAfterDeleteRef.current === questionFocusAfterDelete) {
          questionFocusAfterDeleteRef.current = null;
        }
      });
    } else if (questionFocusAfterDelete) {
      questionFocusAfterDeleteRef.current = null;
    }
    if (
      activeQuestionChanged &&
      typeof window !== "undefined" &&
      window.innerWidth < 1280
    ) {
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      workspaceRef.current?.scrollIntoView?.({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }
  }, [activeQuestionId, builderState.questions.length]);

  useEffect(() => {
    const pendingIssue = pendingIssueFocusRef.current;
    if (!pendingIssue || pendingIssue.questionId !== activeQuestionId || !activeQuestion) return;
    const frame = window.requestAnimationFrame(() => {
      questionRowRefs.current[pendingIssue.questionId]?.scrollIntoView?.({ block: "nearest" });
      workspaceRef.current?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      window.requestAnimationFrame(() => {
        if (pendingIssueFocusRef.current !== pendingIssue) return;
        const focusResult = focusIssueTarget(pendingIssue, activeQuestion);
        if (focusResult === "handoff") {
          const lifecycleAction = lifecycleStatus === "published"
            ? "Jadikan draf"
            : lifecycleStatus === "archived"
              ? "Pulihkan bank"
              : "buka kunci lifecycle";
          updateEditor({ readinessAnnouncement: `Soal ${questionNumber(pendingIssue.questionId)} memiliki masalah ${readinessFieldLabel(pendingIssue)} yang terkunci. Pilih ${lifecycleAction} untuk membuka perbaikan.` });
        } else if (!focusResult) {
          updateEditor({ readinessAnnouncement: `Masalah ${readinessFieldLabel(pendingIssue)} pada Soal ${questionNumber(pendingIssue.questionId)} belum dapat difokuskan.` });
        }
        pendingIssueFocusRef.current = null;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeQuestion, activeQuestionId, activeTab, focusIssueTarget, lifecycleStatus, questionNumber, readiness.issues]);

  function markChanged(nextState: typeof builderState) {
    setLocalBuilderState(nextState);
    updateEditor({
      hasUnsavedChanges: true,
      serverReadiness: pruneServerReadinessForDraftChange(serverReadiness, builderState.questions, nextState.questions),
    });
  }

  function updateMetadata(
    field: "title" | "description",
    value: string,
  ) {
    if (isMetadataLocked) return;
    markChanged({ ...builderState, [field]: value });
  }

  function updateOrganization(patch: QuestionBankOrganizationPatch) {
    if (isMetadataLocked) return;
    markChanged({
      ...builderState,
      ...(patch.categoryIds ? { categoryIds: [...new Set(patch.categoryIds)] } : {}),
    });
  }

  function closeConfirmation() {
    updateEditor({ confirmationRequest: null });
  }

  function confirmPendingAction() {
    const pendingRequest = confirmationRequest;

    closeConfirmation();
    pendingRequest?.onConfirm();
  }

  function openQuestion(questionId: string) {
    const question = builderState.questions.find((item) => item.id === questionId);
    if (!question) return;
    const issueCount = readiness.issues.filter((issue) => issue.questionId === question.id).length;

    updateEditor({
      activeQuestionId: question.id,
      hasSubmittedPreview: false,
      previewChoiceId: null,
      questionDraft: toQuestionDraft(question),
      readinessAnnouncement: issueCount
        ? `Soal ${questionNumber(question.id)} dipilih. Ada ${issueCount} masalah yang perlu diperbaiki.`
        : "",
    });
  }

  function selectQuestion(questionId: string) {
    openQuestion(questionId);
  }

  function updateQuestionDraft(next: BankQuestion) {
    if (isQuestionContentLocked) return;
    updateEditor({ questionDraft: next });
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
    const id = createQuestionId(subjectCode);
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
    updateEditor({
      activeQuestionId: id,
      hasSubmittedPreview: false,
      previewChoiceId: null,
      questionDraft: nextQuestion,
      readinessAnnouncement: "Soal baru ditambahkan. Isi pertanyaan, opsi, jawaban benar, dan Subtest sebelum menerbitkan.",
    });
  }

  function removeQuestion(id: string) {
    if (isQuestionContentLocked || builderState.questions.length <= 1) return;
    const questions = builderState.questions.filter(
      (question) => question.id !== id,
    );
    const nextActiveQuestion = questions[0]!;
    questionFocusAfterDeleteRef.current = nextActiveQuestion.id;
    markChanged({ ...builderState, questions });
    updateEditor({
      activeQuestionId: nextActiveQuestion.id,
      hasSubmittedPreview: false,
      previewChoiceId: null,
      questionDraft: toQuestionDraft(nextActiveQuestion),
      readinessAnnouncement: "Soal dihapus.",
    });
  }

  function requestQuestionRemoval(id: string) {
    if (builderState.questions.length <= 1) return;
    const question = builderState.questions.find((item) => item.id === id);
    const questionLabel = question?.prompt || "Soal tanpa pertanyaan";

    updateEditor({ confirmationRequest: {
      confirmLabel: "Hapus soal",
      description: `“${questionLabel}” akan dihapus dari Bank Soal dan tidak dapat dikembalikan.`,
      onConfirm: () => removeQuestion(id),
      title: "Hapus soal ini?",
    } });
  }

  function requestArchive() {
    updateEditor({ confirmationRequest: {
      confirmLabel: "Arsipkan",
      description: "Bank Soal ini akan dipindahkan ke arsip dan tidak dapat dipakai untuk authoring sampai dipulihkan.",
      onConfirm: () => updateLifecycle("archive"),
      title: "Arsipkan Bank Soal?",
    } });
  }

  function setServerReadiness(nextReadiness: QuestionBankReadiness | null) {
    updateEditor({ serverReadiness: nextReadiness });
  }

  const { saveDraft, updateLifecycle } = useQuestionBankPersistence({
    bankIdRef,
    builderState,
    mode,
    onBankNoLongerEditable: (id) => updateEditor({ pendingRouteReplacement: `/mentor/quiz/question-bank/${id}` }),
    revisionRef,
    setServerReadiness,
    setLocalBuilderState,
    updateEditor,
  });

  return <QuestionBankBuilderScreen
    actions={{
      addChoice,
      addQuestion,
      closeConfirmation,
      confirmPendingAction,
      focusFirstIssue,
      onChangeTab: (value) => {
        if (value === "questions" || value === "details") updateEditor({ activeTab: value });
      },
      onChoiceChange: (value) => updateEditor({ hasSubmittedPreview: false, previewChoiceId: value }),
      onCloseMedia: () => updateEditor({ mediaPickerTarget: null }),
      onEditorTabChange: (value) => updateEditor({ questionEditorTab: value }),
      onOpenMedia: (target) => updateEditor({ mediaPickerTarget: target }),
      onOpenQuestion: selectQuestion,
      onRemoveChoice: removeChoice,
      onRemoveChoiceMedia: removeChoiceMedia,
      onRemoveQuestion: requestQuestionRemoval,
      onSelectMedia: selectMediaAsset,
      onSubmitPreview: () => updateEditor({ hasSubmittedPreview: true }),
      onUpdateDraft: updateQuestionDraft,
      requestArchive,
      saveDraft,
      updateLifecycle,
      updateMetadata,
      updateOrganization,
    }}
    bankId={bankId ?? initialBank?.id}
    builderState={builderState}
    categories={initialCategories}
    mode={mode}
    session={session}
    state={{ activeQuestionId, activeTab, confirmationRequest, hasSubmittedPreview, hasUnsavedChanges, isMetadataLocked, isQuestionContentLocked, isSaving, isDraftLifecycle, lifecycleError, lifecycleStatus, mediaPickerTarget, pendingRouteReplacement, previewChoiceId, questionDraft, questionEditorTab, questionRowRefs, readiness, readinessAnnouncement, selectedMediaAssetId }}
    workspaceRef={workspaceRef}
  />;
}

export { KaptenQuestionBankBuilderPageModule };
