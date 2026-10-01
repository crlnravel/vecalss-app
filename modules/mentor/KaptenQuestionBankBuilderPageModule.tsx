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
  LibraryBig,
  LoaderCircle,
  Plus,
  Save,
  Search,
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
  ReferenceEmptyState,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { showToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import type { SessionContext } from "@/lib/auth/types";
import type { QuestionBankCsvDraftQuestion } from "@/lib/question-bank/csv";
import { questionBankNavigationLabel } from "@/lib/question-bank/purpose";
import { questionBankMateriOptions } from "@/lib/question-bank/materi";
import { compareSelectedOptionSets } from "@/lib/question-bank/answer-contract";
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
import { QuestionMobileInventoryOption } from "@/modules/mentor/components/question-mobile-inventory-option";
import {
  type QuestionBankCsvDraftSummary,
} from "@/modules/mentor/components/question-bank-csv-flow";
import {
  QuestionBankCreateFileImportControl,
  type QuestionBankCreateFileImportState,
} from "@/modules/mentor/components/question-bank-create-file-import";
import {
  type QuestionBankXlsxDraftApplied,
} from "@/modules/mentor/components/question-bank-xlsx-flow";
import {
  ResourceAuthoringLockBanner,
  type AuthoringLockState,
} from "@/modules/mentor/components/resource-authoring-lock-banner";
import {
  ResourceEditLockProvider,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";
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

type QuestionRowRefs = {
  current: Record<string, HTMLLIElement | null>;
};

type ConfirmationRequest = {
  actionVariant?: "default" | "destructive";
  confirmLabel: string;
  description: string;
  dialogVariant?: "default" | "info" | "warning" | "danger" | "success";
  onConfirm: () => void;
  title: string;
};

type MediaPickerTarget =
  | { kind: "choice"; choiceId: string; label: string }
  | { kind: "explanation"; label: string }
  | { kind: "prompt"; label: string };

type QuestionBankEditorState = {
  activeQuestionId: string | null;
  confirmationRequest: ConfirmationRequest | null;
  questionDraft: BankQuestion;
  hasUnsavedChanges: boolean;
  pendingRouteReplacement: string | null;
  readinessAnnouncement: string;
  serverReadiness: QuestionBankReadiness | null;
  mediaPickerTarget: MediaPickerTarget | null;
  lifecycleError: string | null;
  saveError: string | null;
  lifecycleStatus: KaptenQuestionBank["status"];
  isSaving: boolean;
  questionEditorTab: string;
  previewChoiceId: string | null;
  previewChoiceIds: string[];
  hasSubmittedPreview: boolean;
};

type LocalQuestionBankState = {
  categoryIds: string[];
  description: string;
  folderId: string | null;
  purpose: "quiz" | "tryout";
  questions: BankQuestion[];
  subjectCode: string;
  title: string;
};

function questionBankSaveSnapshotKey(state: LocalQuestionBankState) {
  return JSON.stringify(state);
}

function hasQuestionBankDraftContent(
  state: Pick<
    LocalQuestionBankState,
    "categoryIds" | "description" | "questions" | "title"
  >,
) {
  return Boolean(
    state.title.trim() ||
    state.description.trim() ||
    state.categoryIds.length ||
    state.questions.length,
  );
}

type QuestionBankCategoryPatch = {
  categoryIds?: string[];
};

type QuestionBankEditorAction = {
  type: "patch";
  patch: Partial<QuestionBankEditorState>;
};

function questionBankEditorReducer(
  state: QuestionBankEditorState,
  action: QuestionBankEditorAction,
): QuestionBankEditorState {
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
          variant="outline"
        >
          <ImagePlus data-icon="inline-start" />
          Ganti
        </Button>
        <Button
          disabled={disabled}
          onClick={onRemove}
          size="sm"
          type="button"
          variant="outline"
        >
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
  correctChoiceIds: ["a"],
  difficulty: "medium",
  explanation: "",
  id: "",
  materi: "",
  prompt: "",
  questionType: "single_choice",
  subjectCode,
  tags: [],
});

function questionTypeFor(question: Pick<BankQuestion, "questionType">) {
  return question.questionType ?? "single_choice";
}

function correctChoiceIdsFor(
  question: Pick<BankQuestion, "correctChoiceId" | "correctChoiceIds">,
) {
  const ids =
    question.correctChoiceIds ??
    (question.correctChoiceId ? [question.correctChoiceId] : []);
  return [...new Set(ids)];
}

function withCorrectChoiceIds(
  question: BankQuestion,
  correctChoiceIds: readonly string[],
): BankQuestion {
  const ids = [...new Set(correctChoiceIds)];
  return {
    ...question,
    correctChoiceId: ids[0] ?? "",
    correctChoiceIds: ids,
  };
}

function createQuestionId(subjectCode: string) {
  // Temporary question ids are persisted by the bank repository until the
  // first save, which recognizes the subject-question-<digits> shape.
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0")}`;
  return `${subjectCode.toLowerCase()}-question-${suffix}`;
}

function toBuilderQuestions(
  importedQuestions: QuestionBankCsvDraftQuestion[],
  bankId: string,
): BankQuestion[] {
  return importedQuestions.map((importedQuestion) => {
    const id = createQuestionId(importedQuestion.subjectCode);
    const choices = importedQuestion.choices.map((choice, index) => ({
      ...(choice.mediaAssetId ? { mediaAssetId: choice.mediaAssetId } : {}),
      id: String.fromCharCode(97 + index),
      text: choice.text,
    }));
    const choiceIds = new Map(importedQuestion.choices.map((choice, index) => [
      choice.id,
      String.fromCharCode(97 + index),
    ]));
    const correctChoiceIds = importedQuestion.correctChoiceIds
      .map((choiceId) => choiceIds.get(choiceId))
      .filter((choiceId): choiceId is string => Boolean(choiceId));

    return {
      ...emptyQuestion(bankId, importedQuestion.subjectCode),
      choices,
      correctChoiceId: correctChoiceIds[0] ?? choices[0]?.id ?? "a",
      correctChoiceIds: correctChoiceIds.length ? correctChoiceIds : [choices[0]?.id ?? "a"],
      difficulty: importedQuestion.difficulty,
      explanation: importedQuestion.explanation,
      ...(importedQuestion.explanationMediaAssetId ? { explanationMediaAssetId: importedQuestion.explanationMediaAssetId } : {}),
      id,
      ...(importedQuestion.materi ? { materi: importedQuestion.materi } : {}),
      prompt: importedQuestion.prompt,
      ...(importedQuestion.promptMediaAssetId ? { promptMediaAssetId: importedQuestion.promptMediaAssetId } : {}),
      questionType: importedQuestion.questionType,
      subjectCode: importedQuestion.subjectCode,
    } satisfies BankQuestion;
  });
}

function isReady(question: BankQuestion) {
  return getQuestionReadinessFromDraft(question).length === 0;
}

function readinessIssueKey(issue: QuestionReadinessIssue) {
  return [
    issue.questionId,
    issue.code,
    issue.field,
    issue.choiceId ?? "",
    issue.mediaTarget ?? "",
  ].join(":");
}

function readinessFieldLabel(issue: QuestionReadinessIssue) {
  if (issue.field === "prompt") return "pertanyaan";
  if (issue.field === "choice")
    return issue.choiceId ? "teks opsi" : "jumlah opsi";
  if (issue.field === "correctChoice") return "jawaban benar";
  if (issue.field === "media") {
    if (issue.choiceId) return "media opsi";
    if (issue.mediaTarget === "explanation") return "media penjelasan";
    if (issue.mediaTarget === "prompt") return "media pertanyaan";
    return "media soal";
  }
  return "Subtes";
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
  const incompleteQuestionIds = new Set(
    issues.map((issue) => issue.questionId),
  );
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
  const previousById = new Map(
    previousQuestions.map((question) => [question.id, question]),
  );
  const nextById = new Map(
    nextQuestions.map((question) => [question.id, question]),
  );
  const issues = readiness.issues.filter((issue) => {
    const previous = previousById.get(issue.questionId);
    const next = nextById.get(issue.questionId);
    if (!next) return false;
    if (!previous) return true;
    if (issue.field === "prompt") return previous.prompt === next.prompt;
    if (issue.field === "subtest")
      return previous.subjectCode === next.subjectCode;
    if (issue.field === "correctChoice") {
      return (
        questionTypeFor(previous) === questionTypeFor(next) &&
        JSON.stringify(correctChoiceIdsFor(previous)) ===
          JSON.stringify(correctChoiceIdsFor(next))
      );
    }
    if (issue.field === "choice") {
      if (previous.choices.length !== next.choices.length) return false;
      if (!issue.choiceId) return true;
      return (
        previous.choices.find((choice) => choice.id === issue.choiceId)
          ?.text ===
        next.choices.find((choice) => choice.id === issue.choiceId)?.text
      );
    }
    if (issue.choiceId) {
      return (
        previous.choices.find((choice) => choice.id === issue.choiceId)
          ?.mediaAssetId ===
        next.choices.find((choice) => choice.id === issue.choiceId)
          ?.mediaAssetId
      );
    }
    if (issue.mediaTarget === "prompt")
      return previous.promptMediaAssetId === next.promptMediaAssetId;
    if (issue.mediaTarget === "explanation")
      return previous.explanationMediaAssetId === next.explanationMediaAssetId;
    return (
      previous.promptMediaAssetId === next.promptMediaAssetId &&
      previous.explanationMediaAssetId === next.explanationMediaAssetId
    );
  });
  if (!issues.length) return null;
  const incompleteQuestionIds = new Set(
    issues.map((issue) => issue.questionId),
  );
  return {
    ...readiness,
    incompleteCount: incompleteQuestionIds.size,
    issues,
    readyCount: readiness.totalCount - incompleteQuestionIds.size,
  };
}

function toQuestionDraft(question: BankQuestion): BankQuestion {
  const questionType = questionTypeFor(question);
  const correctChoiceIds = correctChoiceIdsFor(question);
  return {
    ...question,
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceId: correctChoiceIds[0] ?? question.correctChoiceId,
    correctChoiceIds,
    questionType,
    tags: [],
  };
}

function describedBy(...ids: Array<string | undefined>) {
  const presentIds = ids.filter((id): id is string => Boolean(id));
  return presentIds.length ? presentIds.join(" ") : undefined;
}

function getQuestionBankEditorIssueState(
  readinessIssues: QuestionReadinessIssue[],
) {
  const hasIssue = (
    field: QuestionReadinessIssue["field"],
    choiceId?: string,
    mediaTarget?: QuestionReadinessMediaTarget,
  ) =>
    readinessIssues.some(
      (issue) =>
        issue.field === field &&
        issue.choiceId === choiceId &&
        (field !== "media" ||
          issue.mediaTarget === mediaTarget ||
          (mediaTarget !== "prompt" &&
            mediaTarget !== "explanation" &&
            issue.mediaTarget === undefined)),
    );
  const hasMediaIssue = (
    choiceId?: string,
    mediaTarget?: QuestionReadinessMediaTarget,
  ) => hasIssue("media", choiceId, mediaTarget);
  return {
    hasChoiceCountIssue: hasIssue("choice"),
    hasCorrectChoiceIssue: hasIssue("correctChoice"),
    hasExplanationMediaIssue: hasMediaIssue(undefined, "explanation"),
    hasPromptIssue: hasIssue("prompt"),
    hasPromptMediaIssue: hasMediaIssue(undefined, "prompt"),
    hasSubtestIssue: hasIssue("subtest"),
    hasIssue,
    hasMediaIssue,
    readinessHint: readinessIssues.length
      ? "Perbaiki " + readinessIssues.map(readinessFieldLabel).join(", ") + "."
      : undefined,
  };
}

function QuestionPromptField({
  activeQuestionId,
  isQuestionContentLocked,
  issueState,
  onOpenMedia,
  onUpdate,
  questionDraft,
}: {
  activeQuestionId: string | null;
  isQuestionContentLocked: boolean;
  issueState: ReturnType<typeof getQuestionBankEditorIssueState>;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const { hasPromptIssue, hasPromptMediaIssue, readinessHint } = issueState;
  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="question-prompt"
          required
        >
          Pertanyaan
        </FieldLabel>
        <Button
          aria-describedby={describedBy(
            readinessHint ? "question-readiness-hint" : undefined,
            hasPromptMediaIssue ? "question-prompt-media-error" : undefined,
          )}
          aria-invalid={hasPromptMediaIssue}
          data-question-anchor="media"
          data-question-field="media"
          data-question-field-key="prompt"
          disabled={!activeQuestionId || isQuestionContentLocked}
          id="question-media-prompt"
          onClick={() =>
            onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <ImagePlus data-icon="inline-start" />
          {questionDraft.promptMediaAssetId ? "Ganti gambar" : "Tambah gambar"}
        </Button>
      </div>
      <FieldTextarea
        aria-describedby={describedBy(
          readinessHint ? "question-readiness-hint" : undefined,
          hasPromptIssue ? "question-prompt-error" : undefined,
        )}
        aria-invalid={hasPromptIssue}
        className={REFERENCE_CONTROL_CLASS_NAMES.input}
        data-question-anchor="prompt"
        data-question-field="prompt"
        disabled={isQuestionContentLocked}
        id="question-prompt"
        onChange={(event) =>
          onUpdate({ ...questionDraft, prompt: event.target.value })
        }
        value={questionDraft.prompt}
      />
      {hasPromptIssue ? (
        <p
          className="text-sm font-medium text-student-status-danger-fg"
          id="question-prompt-error"
        >
          Isi pertanyaan sebelum menyimpan.
        </p>
      ) : null}
      {questionDraft.promptMediaAssetId ? (
        <QuestionMediaAttachment
          assetId={questionDraft.promptMediaAssetId}
          disabled={isQuestionContentLocked}
          field="prompt"
          label="Gambar pertanyaan"
          onRemove={() =>
            onUpdate({ ...questionDraft, promptMediaAssetId: undefined })
          }
          onReplace={() =>
            onOpenMedia({ kind: "prompt", label: "Gambar pertanyaan" })
          }
        />
      ) : null}
      {hasPromptMediaIssue ? (
        <p
          className="text-sm font-medium text-student-status-danger-fg"
          id="question-prompt-media-error"
        >
          Gambar pertanyaan belum siap. Pilih gambar lain atau hapus
          lampirannya.
        </p>
      ) : null}
    </Field>
  );
}

function QuestionAnswerModeField({
  isQuestionContentLocked,
  onUpdate,
  questionDraft,
}: {
  isQuestionContentLocked: boolean;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const questionType = questionTypeFor(questionDraft);
  const modeLabel =
    questionType === "multiple_choice"
      ? "Pilihan Ganda Kompleks"
      : "Pilihan Ganda";
  return (
    <Field>
      <FieldLabel
        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
        htmlFor="question-answer-mode"
        required
      >
        Tipe soal
      </FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isQuestionContentLocked}
          render={
            <Button
              aria-describedby="question-answer-mode-hint"
              className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "w-full")}
              data-question-anchor="correctChoice"
              data-question-field="correctChoice"
              id="question-answer-mode"
              type="button"
              variant="outline"
            />
          }
        >
          <span>{modeLabel}</span>
          <ChevronDown className="text-secondary-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--anchor-width)">
          <DropdownMenuLabel>Pilih mode jawaban</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                const nextType = value as "single_choice" | "multiple_choice";
                const ids = correctChoiceIdsFor(questionDraft);
                onUpdate(
                  withCorrectChoiceIds(
                    { ...questionDraft, questionType: nextType },
                    nextType === "multiple_choice" ? ids : ids.slice(0, 1),
                  ),
                );
              }}
              value={questionType}
            >
              <DropdownMenuRadioItem
                className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                value="single_choice"
              >
                Pilihan Ganda
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                value="multiple_choice"
              >
                Pilihan Ganda Kompleks
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p
        className="text-xs leading-5 text-secondary-500"
        id="question-answer-mode-hint"
      >
        {questionType === "multiple_choice"
          ? "Pilih semua opsi yang benar."
          : "Pilih satu opsi yang benar."}
      </p>
    </Field>
  );
}

function QuestionChoiceControls({
  activeQuestionId,
  choice,
  choiceLabel,
  issueState,
  isQuestionContentLocked,
  onOpenMedia,
  onRemoveChoice,
  onUpdate,
  questionDraft,
  readinessHint,
}: {
  activeQuestionId: string | null;
  choice: BankQuestion["choices"][number];
  choiceLabel: string;
  issueState: {
    hasChoiceCountIssue: boolean;
    hasChoiceMediaIssue: boolean;
    hasChoiceTextIssue: boolean;
    hasCorrectChoiceIssue: boolean;
  };
  isQuestionContentLocked: boolean;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoice: (choiceId: string) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
  readinessHint: string | undefined;
}) {
  const {
    hasChoiceCountIssue,
    hasChoiceMediaIssue,
    hasChoiceTextIssue,
    hasCorrectChoiceIssue,
  } = issueState;
  const inputId = "bank-choice-" + choice.id;
  const choiceLabelText = "Gambar opsi " + choiceLabel;
  const multipleAnswer = questionTypeFor(questionDraft) === "multiple_choice";
  const selectedCorrectChoiceIds = correctChoiceIdsFor(questionDraft);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <input
        aria-describedby={describedBy(
          readinessHint ? "question-readiness-hint" : undefined,
          hasCorrectChoiceIssue ? "question-correct-choice-error" : undefined,
        )}
        aria-label={
          (multipleAnswer ? "Tandai benar opsi " : "Jawaban benar opsi ") +
          (Number(choiceLabel.charCodeAt(0)) - 64)
        }
        checked={selectedCorrectChoiceIds.includes(choice.id)}
        className="size-4 accent-primary-700"
        data-question-anchor="correctChoice"
        data-question-choice-id={choice.id}
        data-question-field="correctChoice"
        disabled={isQuestionContentLocked}
        id={"bank-correct-choice-" + choice.id}
        name={multipleAnswer ? undefined : "bank-correct-choice"}
        onChange={() => {
          const nextIds = multipleAnswer
            ? selectedCorrectChoiceIds.includes(choice.id)
              ? selectedCorrectChoiceIds.filter((id) => id !== choice.id)
              : [...selectedCorrectChoiceIds, choice.id]
            : [choice.id];
          onUpdate(withCorrectChoiceIds(questionDraft, nextIds));
        }}
        type={multipleAnswer ? "checkbox" : "radio"}
      />
      <label
        className="text-sm font-semibold text-primary-800"
        htmlFor={"bank-correct-choice-" + choice.id}
      >
        {choiceLabel}
      </label>
      <input
        aria-describedby={describedBy(
          readinessHint ? "question-readiness-hint" : undefined,
          hasChoiceCountIssue ? "question-choice-count-error" : undefined,
          hasChoiceTextIssue
            ? "question-choice-" + choice.id + "-error"
            : undefined,
        )}
        aria-invalid={hasChoiceTextIssue}
        aria-label={"Opsi " + (Number(choiceLabel.charCodeAt(0)) - 64)}
        className={cn(
          REFERENCE_CONTROL_CLASS_NAMES.input,
          "min-w-0 flex-1 bg-transparent py-2",
        )}
        data-question-anchor="choice"
        data-question-choice-id={choice.id}
        data-question-field="choice"
        disabled={isQuestionContentLocked}
        id={inputId}
        onChange={(event) =>
          onUpdate({
            ...questionDraft,
            choices: questionDraft.choices.map((item) =>
              item.id === choice.id
                ? { ...item, text: event.target.value }
                : item,
            ),
          })
        }
        placeholder={"Opsi " + choiceLabel}
        value={choice.text}
      />
      <Button
        aria-describedby={describedBy(
          readinessHint ? "question-readiness-hint" : undefined,
          hasChoiceMediaIssue
            ? "question-choice-" + choice.id + "-media-error"
            : undefined,
        )}
        aria-invalid={hasChoiceMediaIssue}
        aria-label={
          (choice.mediaAssetId ? "Ganti" : "Tambah") +
          " gambar opsi " +
          choiceLabel
        }
        data-question-anchor="media"
        data-question-choice-id={choice.id}
        data-question-field="media"
        data-question-field-key={"choice:" + choice.id}
        disabled={!activeQuestionId || isQuestionContentLocked}
        id={"question-media-choice-" + choice.id}
        onClick={() =>
          onOpenMedia({
            choiceId: choice.id,
            kind: "choice",
            label: choiceLabelText,
          })
        }
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <ImagePlus />
      </Button>
      <Button
        aria-label={"Hapus opsi " + choiceLabel}
        disabled={questionDraft.choices.length <= 2 || isQuestionContentLocked}
        onClick={() => onRemoveChoice(choice.id)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function QuestionChoiceFeedback({
  choice,
  choiceLabel,
  hasChoiceMediaIssue,
  hasChoiceTextIssue,
  isQuestionContentLocked,
  onOpenMedia,
  onRemoveChoiceMedia,
}: {
  choice: BankQuestion["choices"][number];
  choiceLabel: string;
  hasChoiceMediaIssue: boolean;
  hasChoiceTextIssue: boolean;
  isQuestionContentLocked: boolean;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
}) {
  const choiceLabelText = "Gambar opsi " + choiceLabel;
  return (
    <>
      {hasChoiceTextIssue ? (
        <p
          className="text-sm font-medium text-student-status-danger-fg"
          id={"question-choice-" + choice.id + "-error"}
        >
          Isi teks opsi ini.
        </p>
      ) : null}
      {hasChoiceMediaIssue ? (
        <p
          className="text-sm font-medium text-student-status-danger-fg"
          id={"question-choice-" + choice.id + "-media-error"}
        >
          Gambar opsi belum siap. Pilih gambar lain atau hapus lampirannya.
        </p>
      ) : null}
      {choice.mediaAssetId ? (
        <QuestionMediaAttachment
          assetId={choice.mediaAssetId}
          disabled={isQuestionContentLocked}
          field={"choice-" + choice.id}
          label={choiceLabelText}
          onRemove={() => onRemoveChoiceMedia(choice.id)}
          onReplace={() =>
            onOpenMedia({
              choiceId: choice.id,
              kind: "choice",
              label: choiceLabelText,
            })
          }
        />
      ) : null}
    </>
  );
}

function QuestionChoiceRow({
  activeQuestionId,
  choice,
  hasChoiceCountIssue,
  hasCorrectChoiceIssue,
  hasIssue,
  hasMediaIssue,
  index,
  isQuestionContentLocked,
  onOpenMedia,
  onRemoveChoice,
  onRemoveChoiceMedia,
  onUpdate,
  questionDraft,
  readinessHint,
}: {
  activeQuestionId: string | null;
  choice: BankQuestion["choices"][number];
  hasChoiceCountIssue: boolean;
  hasCorrectChoiceIssue: boolean;
  hasIssue: (
    field: QuestionReadinessIssue["field"],
    choiceId?: string,
    mediaTarget?: QuestionReadinessMediaTarget,
  ) => boolean;
  hasMediaIssue: (
    choiceId?: string,
    mediaTarget?: QuestionReadinessMediaTarget,
  ) => boolean;
  index: number;
  isQuestionContentLocked: boolean;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
  readinessHint: string | undefined;
}) {
  const choiceLabel = String.fromCharCode(65 + index);
  const hasChoiceTextIssue = hasIssue("choice", choice.id);
  const hasChoiceMediaIssue = hasMediaIssue(choice.id);
  return (
    <div
      className={cn(
        REFERENCE_CONTROL_CLASS_NAMES.choice,
        "min-w-0 flex-col items-stretch gap-3 has-[:checked]:border-primary-500/65 has-[:checked]:bg-primary-50",
        (hasChoiceTextIssue || hasChoiceMediaIssue) &&
          "border-student-status-danger-border bg-student-status-danger-bg/40",
      )}
    >
      <QuestionChoiceControls
        activeQuestionId={activeQuestionId}
        choice={choice}
        choiceLabel={choiceLabel}
        issueState={{
          hasChoiceCountIssue,
          hasChoiceMediaIssue,
          hasChoiceTextIssue,
          hasCorrectChoiceIssue,
        }}
        isQuestionContentLocked={isQuestionContentLocked}
        onOpenMedia={onOpenMedia}
        onRemoveChoice={onRemoveChoice}
        onUpdate={onUpdate}
        questionDraft={questionDraft}
        readinessHint={readinessHint}
      />
      <QuestionChoiceFeedback
        choice={choice}
        choiceLabel={choiceLabel}
        hasChoiceMediaIssue={hasChoiceMediaIssue}
        hasChoiceTextIssue={hasChoiceTextIssue}
        isQuestionContentLocked={isQuestionContentLocked}
        onOpenMedia={onOpenMedia}
        onRemoveChoiceMedia={onRemoveChoiceMedia}
      />
    </div>
  );
}

function QuestionChoicesField({
  activeQuestionId,
  isQuestionContentLocked,
  issueState,
  onAddChoice,
  onOpenMedia,
  onRemoveChoice,
  onRemoveChoiceMedia,
  onUpdate,
  questionDraft,
}: {
  activeQuestionId: string | null;
  isQuestionContentLocked: boolean;
  issueState: ReturnType<typeof getQuestionBankEditorIssueState>;
  onAddChoice: () => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onRemoveChoice: (choiceId: string) => void;
  onRemoveChoiceMedia: (choiceId: string) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const {
    hasChoiceCountIssue,
    hasCorrectChoiceIssue,
    hasIssue,
    hasMediaIssue,
    readinessHint,
  } = issueState;
  return (
    <>
      <fieldset
        aria-describedby={describedBy(
          readinessHint ? "question-readiness-hint" : undefined,
          hasChoiceCountIssue ? "question-choice-count-error" : undefined,
        )}
        aria-invalid={hasChoiceCountIssue}
        className="grid gap-3 border-0 p-0 sm:grid-cols-2"
      >
        <legend className={cn(REFERENCE_FIELD_LABEL_CLASS_NAME, "col-span-full")} id="question-choices-label">
          Pilihan jawaban
          <span aria-hidden="true" className="ml-1 text-destructive">*</span>
          <span className="sr-only"> (wajib)</span>
        </legend>
        <fieldset
          aria-describedby={describedBy(
            readinessHint ? "question-readiness-hint" : undefined,
            hasCorrectChoiceIssue ? "question-correct-choice-error" : undefined,
          )}
          aria-invalid={hasCorrectChoiceIssue}
          className="contents"
        >
          <legend className="sr-only">Tentukan jawaban benar</legend>
          {questionDraft.choices.map((choice, index) => (
            <QuestionChoiceRow
              activeQuestionId={activeQuestionId}
              choice={choice}
              hasChoiceCountIssue={hasChoiceCountIssue}
              hasCorrectChoiceIssue={hasCorrectChoiceIssue}
              hasIssue={hasIssue}
              hasMediaIssue={hasMediaIssue}
              index={index}
              isQuestionContentLocked={isQuestionContentLocked}
              onOpenMedia={onOpenMedia}
              onRemoveChoice={onRemoveChoice}
              onRemoveChoiceMedia={onRemoveChoiceMedia}
              onUpdate={onUpdate}
              questionDraft={questionDraft}
              readinessHint={readinessHint}
              key={choice.id}
            />
          ))}
        </fieldset>
      </fieldset>
      {hasChoiceCountIssue ? (
        <p
          className="-mt-1 text-sm font-medium text-student-status-danger-fg"
          id="question-choice-count-error"
        >
          Jumlah opsi harus antara 2 dan 5.
        </p>
      ) : null}
      {hasCorrectChoiceIssue ? (
        <p
          className="-mt-1 text-sm font-medium text-student-status-danger-fg"
          id="question-correct-choice-error"
        >
          {questionTypeFor(questionDraft) === "multiple_choice"
            ? "Pilih minimal satu jawaban benar."
            : "Pilih tepat satu jawaban benar."}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          disabled={
            questionDraft.choices.length >= 5 || isQuestionContentLocked
          }
          onClick={onAddChoice}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus />
          Tambah opsi
        </Button>
      </div>
    </>
  );
}

function QuestionSubtestField({
  isQuestionContentLocked,
  issueState,
  onUpdate,
  questionDraft,
}: {
  isQuestionContentLocked: boolean;
  issueState: ReturnType<typeof getQuestionBankEditorIssueState>;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const { hasSubtestIssue, readinessHint } = issueState;
  const selectedSubject = kaptenSubjects.find(
    (subject) => subject.code === questionDraft.subjectCode,
  );
  return (
    <Field>
      <FieldLabel
        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
        htmlFor="question-subtest"
        required
      >
        Subtes
      </FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isQuestionContentLocked}
          render={
            <Button
              aria-describedby={describedBy(
                hasSubtestIssue ? "question-subtest-error" : undefined,
                readinessHint ? "question-readiness-hint" : undefined,
              )}
              aria-invalid={hasSubtestIssue}
              className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "w-full")}
              data-question-anchor="subtest"
              data-question-field="subtest"
              id="question-subtest"
              type="button"
              variant="outline"
            />
          }
        >
          <span className="truncate">
            {selectedSubject?.name
              ? questionDraft.subjectCode + " - " + selectedSubject.name
              : "Pilih subtes"}
          </span>
          <ChevronDown className="size-4 text-secondary-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--anchor-width)">
          <DropdownMenuLabel>Pilih subtes</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                const currentMateri = questionDraft.materi ?? "";
                const nextMateri = questionBankMateriOptions(value).includes(
                  currentMateri,
                )
                  ? currentMateri
                  : "";
                onUpdate({
                  ...questionDraft,
                  materi: nextMateri,
                  subjectCode: value,
                });
              }}
              value={questionDraft.subjectCode}
            >
              {kaptenSubjects.map((subject) => (
                <DropdownMenuRadioItem
                  className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                  key={subject.code}
                  value={subject.code}
                >
                  {subject.code} - {subject.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {hasSubtestIssue ? (
        <p
          className="text-sm font-medium text-student-status-danger-fg"
          id="question-subtest-error"
        >
          Pilih subtes sebelum menyimpan.
        </p>
      ) : null}
    </Field>
  );
}

function QuestionMateriField({
  isQuestionContentLocked,
  onUpdate,
  questionDraft,
}: {
  isQuestionContentLocked: boolean;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const options = questionBankMateriOptions(questionDraft.subjectCode);
  const selectedMateri = questionDraft.materi ?? "";
  const hasOptions = options.length > 0;
  return (
    <Field>
      <FieldLabel
        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
        htmlFor="question-materi"
      >
        Materi
      </FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isQuestionContentLocked || !hasOptions}
          render={
            <Button
              className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "w-full")}
              data-question-anchor="materi"
              data-question-field="materi"
              id="question-materi"
              type="button"
              variant="outline"
            />
          }
        >
          <span className="truncate">
            {selectedMateri ||
              (hasOptions ? "Pilih Materi" : "Pilih subtes terlebih dahulu")}
          </span>
          <ChevronDown className="size-4 text-secondary-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--anchor-width)">
          <DropdownMenuLabel>
            {hasOptions ? "Pilih Materi" : "Pilih subtes terlebih dahulu"}
          </DropdownMenuLabel>
          {hasOptions ? (
            <DropdownMenuGroup>
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  onUpdate({ ...questionDraft, materi: value })
                }
                value={selectedMateri}
              >
                {options.map((option) => (
                  <DropdownMenuRadioItem
                    className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                    key={option}
                    value={option}
                  >
                    {option}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

function QuestionDifficultyField({
  isQuestionContentLocked,
  onUpdate,
  questionDraft,
}: {
  isQuestionContentLocked: boolean;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const difficultyLabel =
    questionDraft.difficulty === "easy"
      ? "Mudah"
      : questionDraft.difficulty === "hard"
        ? "Sulit"
        : "Sedang";
  return (
    <Field>
      <FieldLabel
        className={REFERENCE_FIELD_LABEL_CLASS_NAME}
        htmlFor="question-difficulty"
        required
      >
        Tingkat kesulitan
      </FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={isQuestionContentLocked}
          render={
            <Button
              className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "w-full")}
              id="question-difficulty"
              type="button"
              variant="outline"
            />
          }
        >
          <span>{difficultyLabel}</span>
          <ChevronDown className="text-secondary-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--anchor-width)">
          <DropdownMenuLabel>Pilih tingkat kesulitan</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              onValueChange={(value) =>
                onUpdate({
                  ...questionDraft,
                  difficulty: value as BankQuestion["difficulty"],
                })
              }
              value={questionDraft.difficulty}
            >
              <DropdownMenuRadioItem
                className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                value="easy"
              >
                Mudah
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                value="medium"
              >
                Sedang
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                className="data-checked:bg-primary-50 focus:bg-primary-50 focus:text-primary-900"
                value="hard"
              >
                Sulit
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

function QuestionExplanationField({
  activeQuestionId,
  isQuestionContentLocked,
  issueState,
  onOpenMedia,
  onUpdate,
  questionDraft,
}: {
  activeQuestionId: string | null;
  isQuestionContentLocked: boolean;
  issueState: ReturnType<typeof getQuestionBankEditorIssueState>;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onUpdate: (question: BankQuestion) => void;
  questionDraft: BankQuestion;
}) {
  const { hasExplanationMediaIssue, readinessHint } = issueState;
  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="question-explanation"
        >
          Penjelasan
        </FieldLabel>
        <Button
          aria-describedby={describedBy(
            readinessHint ? "question-readiness-hint" : undefined,
            hasExplanationMediaIssue
              ? "question-explanation-media-error"
              : undefined,
          )}
          aria-invalid={hasExplanationMediaIssue}
          data-question-anchor="media"
          data-question-field="media"
          data-question-field-key="explanation"
          disabled={!activeQuestionId || isQuestionContentLocked}
          id="question-media-explanation"
          onClick={() =>
            onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <ImagePlus data-icon="inline-start" />
          {questionDraft.explanationMediaAssetId
            ? "Ganti gambar"
            : "Tambah gambar"}
        </Button>
      </div>
      <FieldTextarea
        className={REFERENCE_CONTROL_CLASS_NAMES.input}
        disabled={isQuestionContentLocked}
        id="question-explanation"
        onChange={(event) =>
          onUpdate({ ...questionDraft, explanation: event.target.value })
        }
        value={questionDraft.explanation}
      />
      {questionDraft.explanationMediaAssetId ? (
        <QuestionMediaAttachment
          assetId={questionDraft.explanationMediaAssetId}
          disabled={isQuestionContentLocked}
          field="explanation"
          label="Gambar penjelasan"
          onRemove={() =>
            onUpdate({ ...questionDraft, explanationMediaAssetId: undefined })
          }
          onReplace={() =>
            onOpenMedia({ kind: "explanation", label: "Gambar penjelasan" })
          }
        />
      ) : null}
      {hasExplanationMediaIssue ? (
        <p
          className="text-sm font-medium text-student-status-danger-fg"
          id="question-explanation-media-error"
          role="alert"
        >
          Gambar penjelasan belum siap. Pilih gambar lain atau hapus
          lampirannya.
        </p>
      ) : null}
    </Field>
  );
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
  const issueState = getQuestionBankEditorIssueState(readinessIssues);
  return (
    <ReferenceSurface as="div" className="grid min-w-0 gap-6 p-5 md:p-6">
      <QuestionPromptField
        activeQuestionId={activeQuestionId}
        isQuestionContentLocked={isQuestionContentLocked}
        issueState={issueState}
        onOpenMedia={onOpenMedia}
        onUpdate={onUpdate}
        questionDraft={questionDraft}
      />
      <QuestionAnswerModeField
        isQuestionContentLocked={isQuestionContentLocked}
        onUpdate={onUpdate}
        questionDraft={questionDraft}
      />
      <QuestionChoicesField
        activeQuestionId={activeQuestionId}
        isQuestionContentLocked={isQuestionContentLocked}
        issueState={issueState}
        onAddChoice={onAddChoice}
        onOpenMedia={onOpenMedia}
        onRemoveChoice={onRemoveChoice}
        onRemoveChoiceMedia={onRemoveChoiceMedia}
        onUpdate={onUpdate}
        questionDraft={questionDraft}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-5">
          <QuestionSubtestField
            isQuestionContentLocked={isQuestionContentLocked}
            issueState={issueState}
            onUpdate={onUpdate}
            questionDraft={questionDraft}
          />
          <QuestionMateriField
            isQuestionContentLocked={isQuestionContentLocked}
            onUpdate={onUpdate}
            questionDraft={questionDraft}
          />
        </div>
        <QuestionDifficultyField
          isQuestionContentLocked={isQuestionContentLocked}
          onUpdate={onUpdate}
          questionDraft={questionDraft}
        />
      </div>
      <QuestionExplanationField
        activeQuestionId={activeQuestionId}
        isQuestionContentLocked={isQuestionContentLocked}
        issueState={issueState}
        onOpenMedia={onOpenMedia}
        onUpdate={onUpdate}
        questionDraft={questionDraft}
      />
      {issueState.readinessHint ? (
        <p className="sr-only" id="question-readiness-hint">
          {issueState.readinessHint}
        </p>
      ) : null}
    </ReferenceSurface>
  );
}
function QuestionBankPreview({
  hasSubmittedPreview,
  onChoiceChange,
  onSubmit,
  previewChoiceId,
  previewChoiceIds,
  questionDraft,
}: {
  hasSubmittedPreview: boolean;
  onChoiceChange: (choiceId: string) => void;
  onSubmit: () => void;
  previewChoiceId: string | null;
  previewChoiceIds: string[];
  questionDraft: BankQuestion;
}) {
  const multipleAnswer = questionTypeFor(questionDraft) === "multiple_choice";
  const correctChoiceIds = correctChoiceIdsFor(questionDraft);
  const previewChoiceIdSet = new Set(previewChoiceIds);
  const answerComparison = compareSelectedOptionSets(
    previewChoiceIds,
    correctChoiceIds,
  );
  const isCorrect = answerComparison.ok && answerComparison.equal;
  return (
    <ReferenceSurface as="section" className="min-w-0 p-5 md:p-6">
      {questionDraft.promptMediaAssetId ? (
        <MediaAssetPreview
          alt="Gambar pertanyaan"
          assetId={questionDraft.promptMediaAssetId}
          className="mb-5"
        />
      ) : null}
      <p className="text-xl leading-8 font-normal text-secondary-900">
        {questionDraft.prompt || "Pertanyaan akan tampil di sini."}
      </p>
      {multipleAnswer ? (
        <div className="mt-6 grid gap-3">
          {questionDraft.choices.map((choice, index) => {
            const choiceLabel = String.fromCharCode(65 + index);
            const choiceId = `preview-choice-${questionDraft.id}-${choice.id}`;
            return (
              <label
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.choice,
                  "cursor-pointer text-sm text-secondary-700 transition-colors",
                )}
                htmlFor={choiceId}
                key={choice.id}
              >
                <input
                  aria-label={`Pilih opsi ${choiceLabel}`}
                  checked={previewChoiceIdSet.has(choice.id)}
                  className="size-4 accent-primary-700"
                  id={choiceId}
                  onChange={() => onChoiceChange(choice.id)}
                  type="checkbox"
                />
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                  {choiceLabel}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-3">
                  <span>{choice.text || `Opsi ${choiceLabel}`}</span>
                  {choice.mediaAssetId ? (
                    <MediaAssetPreview
                      alt={`Gambar opsi ${choiceLabel}`}
                      className="max-h-44"
                      assetId={choice.mediaAssetId}
                    />
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <RadioGroup
          key={questionDraft.id}
          className="mt-6"
          onValueChange={onChoiceChange}
          value={previewChoiceId ?? undefined}
        >
          {questionDraft.choices.map((choice, index) => {
            const choiceLabel = String.fromCharCode(65 + index);
            const choiceId = `preview-choice-${questionDraft.id}-${choice.id}`;
            return (
              <label
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.choice,
                  "cursor-pointer text-sm text-secondary-700 transition-colors",
                )}
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
                      className="max-h-44"
                      assetId={choice.mediaAssetId}
                    />
                  ) : null}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-primary-100 pt-5">
        <Button
          disabled={!previewChoiceIds.length}
          onClick={onSubmit}
          type="button"
          variant="default"
        >
          Kirim jawaban
        </Button>
        {hasSubmittedPreview ? (
          <p
            aria-live="polite"
            className={cn(
              "rounded-2xl px-3 py-2 text-sm font-medium",
              isCorrect
                ? "bg-primary-50 text-primary-800"
                : "bg-red-50 text-red-800",
            )}
          >
            {isCorrect ? "Jawaban benar." : "Belum tepat. Coba lagi."}
          </p>
        ) : null}
      </div>
    </ReferenceSurface>
  );
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
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleQuestions = normalizedQuery
    ? builderState.questions.filter((question) => [
      question.prompt,
      question.subjectCode,
      question.materi,
      question.topic,
      question.explanation,
      ...question.choices.map((choice) => choice.text),
      ...question.tags,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
    : builderState.questions;
  const isQuestionReady = (questionId: string) =>
    !readiness.issues.some((issue) => issue.questionId === questionId);
  const focusableQuestionId =
    visibleQuestions.find((question) => question.id === activeQuestionId)?.id ??
    visibleQuestions[0]?.id ??
    null;

  function focusQuestion(questionId: string) {
    onOpenQuestion(questionId);
    window.requestAnimationFrame(() => {
      questionRowRefs.current[questionId]
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
    });
  }

  function handleQuestionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    questionId: string,
  ) {
    if (
      ![
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "End",
        "Home",
      ].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    const currentIndex = visibleQuestions.findIndex(
      (question) => question.id === questionId,
    );
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
      className="flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-primary-100 bg-white p-3 md:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold text-secondary-900"
            id="question-bank-inventory-title"
          >
            {normalizedQuery
              ? `Inventori soal (${visibleQuestions.length} dari ${builderState.questions.length})`
              : `Inventori soal (${builderState.questions.length})`}
          </h2>
        </div>
        <Button
          aria-label="Tambah soal"
          disabled={isDisabled}
          onClick={onAddQuestion}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Plus />
        </Button>
      </div>
      <label className="relative mt-3 block">
        <span className="sr-only">Cari soal</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-500"
        />
        <input
          aria-label="Cari soal di inventori"
          className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "h-10 pl-9")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari soal…"
          type="search"
          value={query}
        />
      </label>
      <nav
        aria-label="Navigasi soal"
        className="mt-3 flex min-h-0 flex-1 flex-col"
      >
        <div
          className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
          id="question-bank-inventory-list"
        >
          <ul aria-label="Daftar soal" className="flex flex-col gap-1.5">
            {visibleQuestions.length > 0 ? (
              visibleQuestions.map((question) => {
                const questionNumber =
                  builderState.questions.findIndex(
                    (item) => item.id === question.id,
                  ) + 1;
                const ready = isQuestionReady(question.id) && isReady(question);
                const isActive = activeQuestionId === question.id;
                const issueCount = readiness.issues.filter(
                  (issue) => issue.questionId === question.id,
                ).length;
                const hasIssues = !ready;
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
                      onKeyDown={(event) =>
                        handleQuestionKeyDown(event, question.id)
                      }
                      tabIndex={question.id === focusableQuestionId ? 0 : -1}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal leading-4 text-secondary-900">
                        <span className="min-w-0 flex-1 truncate">
                          {questionNumber}.{" "}
                          {question.prompt || "Soal tanpa pertanyaan"}
                        </span>
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge size="xs" tone="category">
                          {question.subjectCode}
                        </Badge>
                        {hasIssues ? (
                          <Badge
                            aria-label={`Soal ${questionNumber} memiliki ${issueCount} masalah`}
                            className="size-7 justify-center !px-0 !py-0"
                            role="img"
                            size="xs"
                            title={`Soal ${questionNumber} memiliki ${issueCount} masalah`}
                            tone="attention"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                          </Badge>
                        ) : null}
                      </span>
                    </button>
                    <Button
                      aria-label={`Hapus soal ${questionNumber}`}
                      disabled={isDisabled}
                      onClick={() => onRemoveQuestion(question.id)}
                      onKeyDown={(event) =>
                        handleQuestionKeyDown(event, question.id)
                      }
                      size="icon-sm"
                      tabIndex={isActive ? 0 : -1}
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                );
              })
            ) : (
              <li className="px-2 py-4 text-sm leading-6 text-secondary-500">
                {normalizedQuery
                  ? "Tidak ada soal yang cocok dengan pencarian."
                  : "Belum ada soal."}
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
  const activeQuestion =
    builderState.questions[activeIndex] ?? builderState.questions[0];

  return (
    <div className="border-b border-primary-100 bg-voyage-canvas px-3 py-3 shadow-xs md:hidden">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Pilih soal yang sedang diedit"
            render={
              <Button
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.select,
                  "min-w-0 flex-1",
                )}
                disabled={builderState.questions.length === 0}
                type="button"
                variant="outline"
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
        <Button
          aria-label="Tambah soal"
          disabled={isDisabled}
          onClick={onAddQuestion}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <Plus />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-secondary-500">
        <span>{builderState.questions.length} soal di bank</span>
      </div>
    </div>
  );
}

type QuestionBankBuilderFormState = {
  categoryIds: string[];
  description: string;
  folderId: string | null;
  purpose: "quiz" | "tryout";
  questions: BankQuestion[];
  subjectCode: string;
  title: string;
};
type QuestionBankBuilderViewState = {
  activeQuestionId: string | null;
  confirmationRequest: ConfirmationRequest | null;
  hasSubmittedPreview: boolean;
  hasUnsavedChanges: boolean;
  isMetadataLocked: boolean;
  isQuestionContentLocked: boolean;
  isSaving: boolean;
  lifecycleStatus: KaptenQuestionBank["status"];
  lifecycleError: string | null;
  saveError: string | null;
  lockState: AuthoringLockState;
  mediaFolderReservationId?: string;
  mediaPickerTarget: MediaPickerTarget | null;
  pendingRouteReplacement: string | null;
  previewChoiceId: string | null;
  previewChoiceIds: string[];
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
  csvDraftInfo: {
    fileName: string;
    rowCount: number;
  } | null;
  xlsxDraftInfo: QuestionBankXlsxDraftApplied | null;
  createXlsxBanks: (
    sheets: QuestionBankXlsxDraftApplied["sheets"],
    onSheetCreated: (sheetKey: string) => void,
  ) => Promise<boolean>;
  removeCsvDraft: () => void;
  removeXlsxDraft: () => void;
  replaceCsvDraft: (summary: QuestionBankCsvDraftSummary) => void;
  replaceXlsxDraft: (draft: QuestionBankXlsxDraftApplied) => void;
  retryLock: () => void;
  requestExit: (route: string) => void;
  requestArchive: () => void;
  saveDraft: () => void;
  updateMetadata: (field: "title" | "description", value: string) => void;
  updateCategories: (patch: QuestionBankCategoryPatch) => void;
  updateLifecycle: (
    operation: "archive" | "restore",
  ) => void;
};

function QuestionBankEditorTitle({
  builderState,
  mode,
  onFocusIssue,
  state,
}: {
  builderState: QuestionBankBuilderFormState;
  mode: "create" | "edit";
  onFocusIssue: () => void;
  state: QuestionBankBuilderViewState;
}) {
  const title =
    mode === "create"
      ? `Buat Bank Soal ${builderState.purpose === "quiz" ? "Kuis" : "Tryout"} Baru`
      : builderState.title;
  const navigationLabel = questionBankNavigationLabel(builderState.purpose);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <Button
          className="mt-0.5 shrink-0"
          nativeButton={false}
          render={
            <Link
              href={`/mentor/quiz/question-bank?purpose=${builderState.purpose}`}
            />
          }
          aria-label={`Kembali ke ${navigationLabel}`}
          size="icon-sm"
          title={`Kembali ke ${navigationLabel}`}
          variant="outline"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
            {title}
          </h1>
          {state.readiness.incompleteCount > 0 ? (
            <Button
              aria-label={`Lihat ${state.readiness.incompleteCount} masalah kesiapan`}
              className="mt-2 w-fit justify-start px-0 text-sm font-semibold text-amber-900 underline-offset-4 hover:underline"
              onClick={onFocusIssue}
              type="button"
              variant="outline"
            >
              <AlertTriangle data-icon="inline-start" />
              Lihat masalah{" "}
              <span className="font-normal">
                ({state.readiness.incompleteCount})
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QuestionBankSaveAction({
  actions,
  builderState,
  className,
  onCreateRequest,
  disabledOverride = false,
  mode,
  state,
  size = "sm",
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  className?: string;
  disabledOverride?: boolean;
  mode: "create" | "edit";
  onCreateRequest?: () => void;
  state: QuestionBankBuilderViewState;
  size?: "default" | "sm";
}) {
  const saveLabel = mode === "create" ? "Buat" : "Simpan perubahan";
  const titleMissing = mode === "create" && !builderState.title.trim();
  return (
    <Button
      aria-label={saveLabel}
      className={className}
      disabled={state.isSaving || state.isMetadataLocked || titleMissing || disabledOverride}
      onClick={mode === "create" && onCreateRequest ? onCreateRequest : actions.saveDraft}
      size={size}
      title={mode === "create" ? undefined : saveLabel}
      type="button"
      variant={state.hasUnsavedChanges ? "default" : "outline"}
    >
      <Save />
      {mode === "create" ? saveLabel : "Simpan"}
    </Button>
  );
}

function QuestionBankLifecycleMenu({
  actions,
  mode,
  state,
}: {
  actions: QuestionBankBuilderActions;
  mode: "create" | "edit";
  state: QuestionBankBuilderViewState;
}) {
  if (mode !== "edit" || state.isMetadataLocked) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Aksi destruktif Bank Soal"
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={state.isSaving || state.hasUnsavedChanges}
            onClick={actions.requestArchive}
            variant="destructive"
          >
            <Archive />
            Arsipkan
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuestionBankHeaderActions({
  actions,
  mode,
  state,
}: {
  actions: QuestionBankBuilderActions;
  mode: "create" | "edit";
  state: QuestionBankBuilderViewState;
}) {
  if (mode === "create") return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuestionBankAutoSaveStatus actions={actions} state={state} />
      <QuestionBankLifecycleMenu actions={actions} mode={mode} state={state} />
    </div>
  );
}

function QuestionBankAutoSaveStatus({
  actions,
  state,
}: {
  actions: QuestionBankBuilderActions;
  state: QuestionBankBuilderViewState;
}) {
  const isBlocked = state.hasUnsavedChanges && state.readiness.incompleteCount > 0;
  const hasDisconnectedLock =
    state.hasUnsavedChanges && state.lockState !== "owned";
  if (!hasDisconnectedLock && !state.saveError) return null;

  const statusMessage = hasDisconnectedLock
    ? "Akses edit terputus. Perubahan belum tersimpan."
    : state.saveError ?? "Bank Soal belum dapat disimpan. Coba lagi.";
  const hasError = Boolean(state.saveError) || hasDisconnectedLock;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p
        aria-live="polite"
        className={cn(
          "text-sm",
          hasError ? "text-student-status-danger-fg" : "text-secondary-600",
        )}
        role="status"
      >
        {statusMessage}
      </p>
      {state.saveError && !isBlocked && state.lockState === "owned" ? (
        <Button
          disabled={state.isSaving || state.isMetadataLocked}
          onClick={() => void actions.saveDraft()}
          size="sm"
          type="button"
          variant="outline"
        >
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

function QuestionBankEditorHeader({
  actions,
  builderState,
  mode,
  state,
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  mode: "create" | "edit";
  state: QuestionBankBuilderViewState;
}) {
  return (
    <section className="flex flex-wrap items-start justify-between gap-4">
      <QuestionBankEditorTitle
        builderState={builderState}
        mode={mode}
        onFocusIssue={actions.focusFirstIssue}
        state={state}
      />
      <QuestionBankHeaderActions
        actions={actions}
        mode={mode}
        state={state}
      />
    </section>
  );
}
function QuestionBankMetadataForm({
  actions,
  builderState,
  fileImportBlocked = false,
  onCreateRequest,
  presentation,
  showSaveAction = true,
  state,
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  fileImportBlocked?: boolean;
  onCreateRequest?: () => void;
  presentation: "page" | "modal";
  showSaveAction?: boolean;
  state: QuestionBankBuilderViewState;
}) {
  const fields = (
    <>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="bank-title"
          required
        >
          Judul bank
        </FieldLabel>
        <FieldInput
          aria-required="true"
          className={REFERENCE_CONTROL_CLASS_NAMES.input}
          disabled={state.isMetadataLocked}
          id="bank-title"
          onChange={(event) => actions.updateMetadata("title", event.target.value)}
          required
          value={builderState.title}
        />
      </Field>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor="bank-description"
        >
          Deskripsi
        </FieldLabel>
        <FieldTextarea
          className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-h-[100px]")}
          disabled={state.isMetadataLocked}
          id="bank-description"
          onChange={(event) => actions.updateMetadata("description", event.target.value)}
          value={builderState.description}
        />
      </Field>
    </>
  );

  return (
    <div className="space-y-4">
      {presentation === "modal" ? (
        <div className="grid w-full gap-5">{fields}</div>
      ) : (
        <ReferenceSurface as="section" className="grid w-full gap-5 p-5 md:p-7">
          {fields}
        </ReferenceSurface>
      )}
      {showSaveAction ? (
        <QuestionBankSaveAction
          actions={actions}
          builderState={builderState}
          disabledOverride={fileImportBlocked}
          className="w-full"
          mode="create"
          onCreateRequest={onCreateRequest}
          size="default"
          state={state}
        />
      ) : null}
    </div>
  );
}

type QuestionBankBuilderScreenProps = {
  actions: QuestionBankBuilderActions;
  bankId?: string;
  builderState: QuestionBankBuilderFormState;
  mode: "create" | "edit";
  presentation: "page" | "modal";
  session: SessionContext;
  state: QuestionBankBuilderViewState;
  workspaceRef: { current: HTMLDivElement | null };
};

function QuestionBankBuilderDialogs({
  actions,
  confirmation,
  mediaPickerTarget,
  selectedMediaAssetId,
}: {
  actions: QuestionBankBuilderActions;
  confirmation: ConfirmationRequest | null;
  mediaPickerTarget: MediaPickerTarget | null;
  selectedMediaAssetId: string | undefined;
}) {
  const dialogVariant = confirmation?.dialogVariant ?? "danger";
  const actionVariant = confirmation?.actionVariant ?? "destructive";
  return (
    <>
      <MediaPickerDialog
        onOpenChange={(open) => {
          if (!open) actions.onCloseMedia();
        }}
        onSelect={actions.onSelectMedia}
        open={Boolean(mediaPickerTarget)}
        selectedAssetId={selectedMediaAssetId}
        title={mediaPickerTarget?.label ?? "Pilih gambar"}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) actions.closeConfirmation();
        }}
        open={Boolean(confirmation)}
      >
        <AlertDialogContent size="sm" variant={dialogVariant}>
          <AlertDialogHeader>
            <AlertDialogMedia variant={dialogVariant}>
              <CircleHelp />
            </AlertDialogMedia>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={actions.closeConfirmation}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={actions.confirmPendingAction}
              variant={actionVariant}
            >
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function QuestionBankEditWorkspaceHeader({
  actions,
  builderState,
  detailHref,
  state,
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  detailHref: string;
  state: QuestionBankBuilderViewState;
}) {
  return (
    <header className="z-10 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary-100 bg-voyage-canvas/95 px-3 py-2 shadow-[0_10px_24px_-24px_color-mix(in_oklab,var(--voyage-forest)_42%,transparent)] backdrop-blur-xl md:h-14 md:flex-nowrap md:px-6 md:py-0">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <Button
          aria-label="Kembali ke detail bank soal"
          onClick={() => actions.requestExit(detailHref)}
          size="icon-sm"
          title="Kembali ke detail bank soal"
          variant="outline"
        >
          <ChevronLeft />
        </Button>
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="max-w-[150px] truncate text-base font-bold text-secondary-900 sm:max-w-xs md:max-w-md">
            {builderState.title || "Bank Soal"}
          </h1>
          {state.isSaving ? (
            <Button
              aria-busy="true"
              aria-label="Menyimpan perubahan"
              className="shrink-0"
              disabled
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            </Button>
          ) : null}
        </div>
        {state.readiness.incompleteCount > 0 ? (
          <Button
            aria-label={
              "Lihat " + state.readiness.incompleteCount + " masalah kesiapan"
            }
            className="hidden h-7 px-2 text-xs font-semibold text-amber-900 underline-offset-4 hover:underline lg:flex"
            onClick={actions.focusFirstIssue}
            type="button"
            variant="outline"
          >
            <AlertTriangle data-icon="inline-start" />
            Lihat masalah{" "}
            <span className="font-normal">
              ({state.readiness.incompleteCount})
            </span>
          </Button>
        ) : null}
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
        <QuestionBankAutoSaveStatus actions={actions} state={state} />
      </div>
    </header>
  );
}

function QuestionBankQuestionContent({
  actions,
  builderState,
  isQuestionContentLocked,
  questionIssues,
  state,
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  isQuestionContentLocked: boolean;
  questionIssues: QuestionReadinessIssue[];
  state: QuestionBankBuilderViewState;
}) {
  if (!builderState.questions.length) {
    return (
      <ReferenceSurface className="min-h-72" variant="inset">
        <ReferenceEmptyState
          action={
            <Button
              disabled={isQuestionContentLocked}
              onClick={actions.addQuestion}
              size="sm"
              type="button"
              variant="default"
            >
              <Plus />
              Tambah soal pertama
            </Button>
          }
          description="Ayo tulis soal pertama!"
          icon={LibraryBig}
          title="Belum ada soal"
        />
      </ReferenceSurface>
    );
  }

  return (
    <>
      {questionIssues.length ? (
        <p
          aria-live="polite"
          className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
          role="status"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>Soal ini memiliki {questionIssues.length} masalah.</span>
        </p>
      ) : null}
      {state.questionEditorTab === "preview" ? (
        <QuestionBankPreview
          hasSubmittedPreview={state.hasSubmittedPreview}
          onChoiceChange={actions.onChoiceChange}
          onSubmit={actions.onSubmitPreview}
          previewChoiceId={state.previewChoiceId}
          previewChoiceIds={state.previewChoiceIds}
          questionDraft={state.questionDraft}
        />
      ) : (
        <QuestionBankEditorForm
          activeQuestionId={state.activeQuestionId}
          isQuestionContentLocked={isQuestionContentLocked}
          onAddChoice={actions.addChoice}
          onOpenMedia={actions.onOpenMedia}
          onRemoveChoice={actions.onRemoveChoice}
          onRemoveChoiceMedia={actions.onRemoveChoiceMedia}
          onUpdate={actions.onUpdateDraft}
          questionDraft={state.questionDraft}
          readinessIssues={questionIssues}
        />
      )}
    </>
  );
}

function QuestionBankEditQuestionWorkspace({
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
    <main
      className="flex-1 overflow-y-auto bg-voyage-canvas p-4 sm:p-6 md:p-8"
      data-question-workspace="current"
      id="question-bank-question-workspace"
      ref={workspaceRef}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
          <h2
            className="text-xl font-bold text-secondary-900"
            id="question-bank-question-workspace-title"
          >
            Edit soal
          </h2>
          <label
            className="ml-auto inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-secondary-700"
            htmlFor="question-bank-preview-toggle"
          >
            Preview
            <Switch
              checked={state.questionEditorTab === "preview"}
              id="question-bank-preview-toggle"
              onCheckedChange={(checked) =>
                actions.onEditorTabChange(checked ? "preview" : "edit")
              }
            />
          </label>
        </div>
        <QuestionBankQuestionContent
          actions={actions}
          builderState={builderState}
          isQuestionContentLocked={state.isQuestionContentLocked}
          questionIssues={questionIssues}
          state={state}
        />
      </div>
    </main>
  );
}

function QuestionBankCreateSheetSelection({
  allSheetsSelected,
  builderState,
  completedSheetKeySet,
  draft,
  isSaving,
  onClose,
  onCreate,
  onSelectAll,
  onToggleSheet,
  pendingSheetKeys,
  selectedPendingCount,
  selectedSheetCount,
  selectedSheetKeySet,
  someSheetsSelected,
}: {
  allSheetsSelected: boolean;
  builderState: QuestionBankBuilderFormState;
  completedSheetKeySet: Set<string>;
  draft: QuestionBankXlsxDraftApplied;
  isSaving: boolean;
  onClose: () => void;
  onCreate: () => void;
  onSelectAll: (checked: boolean, pendingKeys: string[]) => void;
  onToggleSheet: (sheetKey: string, checked: boolean) => void;
  pendingSheetKeys: string[];
  selectedPendingCount: number;
  selectedSheetCount: number;
  selectedSheetKeySet: Set<string>;
  someSheetsSelected: boolean;
}) {
  return (
    <section className="grid gap-4" data-question-bank-xlsx-sheet-selection="true">
      <div className="flex items-center justify-between gap-3">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-secondary-800">
          <input
            aria-label="Pilih semua"
            checked={allSheetsSelected}
            className="size-3.5 shrink-0 accent-primary-700"
            disabled={isSaving || pendingSheetKeys.length === 0}
            onChange={(event) => onSelectAll(event.target.checked, pendingSheetKeys)}
            ref={(element) => {
              if (element) element.indeterminate = someSheetsSelected;
            }}
            type="checkbox"
          />
          Pilih semua
        </label>
        <span className="text-sm text-secondary-600">
          {selectedSheetCount} dari {draft.sheets.length} dipilih
        </span>
      </div>
      <ul className="max-h-[min(42vh,360px)] divide-y divide-primary-100 overflow-y-auto">
        {draft.sheets.map((sheet) => {
          const completed = completedSheetKeySet.has(sheet.key);
          const selected = selectedSheetKeySet.has(sheet.key);
          const generatedTitle = [builderState.title.trim(), sheet.title]
            .filter(Boolean)
            .join(" - ");
          return (
            <li className="flex min-w-0 items-start gap-3 py-3" key={sheet.key}>
              <input
                aria-label={`Buat Bank Soal ${generatedTitle}`}
                checked={completed || selected}
                className="mt-1 size-4 shrink-0 accent-primary-700"
                disabled={isSaving || completed}
                onChange={(event) => onToggleSheet(sheet.key, event.target.checked)}
                type="checkbox"
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium text-secondary-900">
                  {generatedTitle}
                </span>
                <span className="mt-1 block text-xs text-secondary-600">
                  {sheet.questions.length.toLocaleString("id-ID")} soal
                </span>
              </span>
              {completed ? (
                <Badge size="xs" tone="success">Sudah dibuat</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex w-full gap-2">
        <Button
          className="min-w-0 flex-1"
          disabled={isSaving}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          Kembali
        </Button>
        <Button
          className="min-w-0 flex-1"
          disabled={isSaving || selectedPendingCount === 0}
          onClick={onCreate}
          type="button"
          variant="default"
        >
          {isSaving ? "Membuat…" : "Buat"}
        </Button>
      </div>
    </section>
  );
}

function handleQuestionBankCreateRequest({
  hasXlsxDraft,
  onOpenSheetPicker,
  onSaveDraft,
}: {
  hasXlsxDraft: boolean;
  onOpenSheetPicker: () => void;
  onSaveDraft: () => void;
}) {
  if (hasXlsxDraft) onOpenSheetPicker();
  else onSaveDraft();
}

async function createSelectedQuestionBankSheets({
  completedSheetKeySet,
  createXlsxBanks,
  draft,
  isSaving,
  onSheetCreated,
  selectedSheetKeySet,
}: {
  completedSheetKeySet: Set<string>;
  createXlsxBanks: QuestionBankBuilderActions["createXlsxBanks"];
  draft: QuestionBankXlsxDraftApplied | null;
  isSaving: boolean;
  onSheetCreated: (sheetKey: string) => void;
  selectedSheetKeySet: Set<string>;
}) {
  if (!draft || isSaving) return false;
  const sheets = draft.sheets.filter(
    (sheet) => selectedSheetKeySet.has(sheet.key) && !completedSheetKeySet.has(sheet.key),
  );
  if (!sheets.length) {
    showToast("Pilih setidaknya satu judul lembar yang belum dibuat.", { variant: "error" });
    return false;
  }
  return createXlsxBanks(sheets, onSheetCreated);
}

function updateQuestionBankSheetSelection(
  current: string[],
  sheetKey: string,
  selected: boolean,
) {
  const next = new Set(current);
  if (selected) next.add(sheetKey);
  else next.delete(sheetKey);
  return [...next];
}

function addCompletedQuestionBankSheet(current: string[], sheetKey: string) {
  const next = new Set(current);
  next.add(sheetKey);
  return [...next];
}

type QuestionBankCreateWorkspaceContentProps = {
  actions: QuestionBankBuilderActions;
  allSheetsSelected: boolean;
  builderState: QuestionBankBuilderFormState;
  completedSheetKeySet: Set<string>;
  fileImportState: QuestionBankCreateFileImportState;
  isChoosingSheets: boolean;
  onCloseSheetPicker: () => void;
  onCreateRequest: () => void;
  onCreateSelectedSheets: () => void;
  onFileImportStateChange: (state: QuestionBankCreateFileImportState) => void;
  onSelectAllSheets: (checked: boolean, pendingKeys: string[]) => void;
  onToggleSheet: (sheetKey: string, checked: boolean) => void;
  onXlsxDraftApplied: (draft: QuestionBankXlsxDraftApplied) => void;
  pendingSheetKeys: string[];
  presentation: "page" | "modal";
  selectedPendingCount: number;
  selectedSheetCount: number;
  selectedSheetKeySet: Set<string>;
  someSheetsSelected: boolean;
  state: QuestionBankBuilderViewState;
};

function QuestionBankCreateWorkspaceContent({
  actions,
  allSheetsSelected,
  builderState,
  completedSheetKeySet,
  fileImportState,
  isChoosingSheets,
  onCloseSheetPicker,
  onCreateRequest,
  onCreateSelectedSheets,
  onFileImportStateChange,
  onSelectAllSheets,
  onToggleSheet,
  onXlsxDraftApplied,
  pendingSheetKeys,
  presentation,
  selectedPendingCount,
  selectedSheetCount,
  selectedSheetKeySet,
  someSheetsSelected,
  state,
}: QuestionBankCreateWorkspaceContentProps) {
  const draft = actions.xlsxDraftInfo;

  return (
    <>
      {presentation === "modal" ? (
        <DialogHeader className="pr-8">
          <DialogTitle>
            {isChoosingSheets
              ? "Pilih sheets"
              : `Buat Bank Soal ${builderState.purpose === "quiz" ? "Kuis" : "Tryout"}`}
          </DialogTitle>
        </DialogHeader>
      ) : (
        <QuestionBankEditorHeader
          actions={actions}
          builderState={builderState}
          mode="create"
          state={state}
        />
      )}
      <p aria-live="polite" className="sr-only" role="status">
        {state.readinessAnnouncement}
      </p>
      {isChoosingSheets && draft ? (
        <QuestionBankCreateSheetSelection
          allSheetsSelected={allSheetsSelected}
          builderState={builderState}
          completedSheetKeySet={completedSheetKeySet}
          draft={draft}
          isSaving={state.isSaving}
          onClose={onCloseSheetPicker}
          onCreate={onCreateSelectedSheets}
          onSelectAll={onSelectAllSheets}
          onToggleSheet={onToggleSheet}
          pendingSheetKeys={pendingSheetKeys}
          selectedPendingCount={selectedPendingCount}
          selectedSheetCount={selectedSheetCount}
          selectedSheetKeySet={selectedSheetKeySet}
          someSheetsSelected={someSheetsSelected}
        />
      ) : (
        <QuestionBankMetadataForm
          actions={actions}
          builderState={builderState}
          fileImportBlocked={fileImportState === "processing" || fileImportState === "invalid"}
          presentation={presentation}
          onCreateRequest={onCreateRequest}
          showSaveAction={false}
          state={state}
        />
      )}
      <QuestionBankCreateFileImportControl
        disabled={state.isQuestionContentLocked}
        hidden={isChoosingSheets}
        onCsvDraftApplied={actions.replaceCsvDraft}
        onRemoveCsvDraft={actions.removeCsvDraft}
        onRemoveXlsxDraft={actions.removeXlsxDraft}
        onStateChange={onFileImportStateChange}
        onXlsxDraftApplied={onXlsxDraftApplied}
      />
      {!isChoosingSheets ? (
        <QuestionBankSaveAction
          actions={actions}
          builderState={builderState}
          disabledOverride={fileImportState === "processing" || fileImportState === "invalid"}
          className="w-full"
          mode="create"
          onCreateRequest={onCreateRequest}
          size="default"
          state={state}
        />
      ) : null}
      <QuestionBankBuilderDialogs
        actions={actions}
        confirmation={state.confirmationRequest}
        mediaPickerTarget={state.mediaPickerTarget}
        selectedMediaAssetId={state.selectedMediaAssetId}
      />
    </>
  );
}

function QuestionBankCreateWorkspace({
  actions,
  builderState,
  presentation,
  session,
  state,
}: {
  actions: QuestionBankBuilderActions;
  builderState: QuestionBankBuilderFormState;
  presentation: "page" | "modal";
  session: SessionContext;
  state: QuestionBankBuilderViewState;
}) {
  const navigationLabel = questionBankNavigationLabel(builderState.purpose);
  const [fileImportState, setFileImportState] = useState<QuestionBankCreateFileImportState>("idle");
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const [selectedSheetKeys, setSelectedSheetKeys] = useState<string[]>([]);
  const selectedSheetKeySet = new Set(selectedSheetKeys);
  const [completedSheetKeys, setCompletedSheetKeys] = useState<string[]>([]);
  const completedSheetKeySet = new Set(completedSheetKeys);
  const isChoosingSheets = sheetPickerOpen && Boolean(actions.xlsxDraftInfo);
  const sheets = actions.xlsxDraftInfo?.sheets ?? [];
  const pendingSheetKeys = sheets
    .filter((sheet) => !completedSheetKeySet.has(sheet.key))
    .map((sheet) => sheet.key);
  const selectedPendingCount = pendingSheetKeys.filter((key) =>
    selectedSheetKeySet.has(key),
  ).length;
  const selectedSheetCount = sheets.length - pendingSheetKeys.length + selectedPendingCount;
  const allSheetsSelected = sheets.length > 0 && selectedSheetCount === sheets.length;
  const someSheetsSelected = selectedSheetCount > 0 && !allSheetsSelected;

  function requestCreate() {
    handleQuestionBankCreateRequest({
      hasXlsxDraft: Boolean(actions.xlsxDraftInfo),
      onOpenSheetPicker: () => setSheetPickerOpen(true),
      onSaveDraft: actions.saveDraft,
    });
  }

  function handleSelectAllSheets(checked: boolean, pendingKeys: string[]) {
    setSelectedSheetKeys(checked ? pendingKeys : []);
  }

  function handleToggleSheet(sheetKey: string, checked: boolean) {
    setSelectedSheetKeys((current) =>
      updateQuestionBankSheetSelection(current, sheetKey, checked),
    );
  }

  function handleXlsxDraftApplied(draft: QuestionBankXlsxDraftApplied) {
    setSelectedSheetKeys(draft.sheets.map((sheet) => sheet.key));
    setCompletedSheetKeys([]);
    actions.replaceXlsxDraft(draft);
  }

  async function createSelectedSheets() {
    const saved = await createSelectedQuestionBankSheets({
      completedSheetKeySet,
      createXlsxBanks: actions.createXlsxBanks,
      draft: actions.xlsxDraftInfo,
      isSaving: state.isSaving,
      onSheetCreated: (sheetKey) => {
        setCompletedSheetKeys((current) =>
          addCompletedQuestionBankSheet(current, sheetKey),
        );
      },
      selectedSheetKeySet,
    });
    if (saved) setSheetPickerOpen(false);
  }

  const createContent = (
    <QuestionBankCreateWorkspaceContent
      actions={actions}
      allSheetsSelected={allSheetsSelected}
      builderState={builderState}
      completedSheetKeySet={completedSheetKeySet}
      fileImportState={fileImportState}
      isChoosingSheets={isChoosingSheets}
      onCloseSheetPicker={() => setSheetPickerOpen(false)}
      onCreateRequest={requestCreate}
      onCreateSelectedSheets={() => void createSelectedSheets()}
      onFileImportStateChange={setFileImportState}
      onSelectAllSheets={handleSelectAllSheets}
      onToggleSheet={handleToggleSheet}
      onXlsxDraftApplied={handleXlsxDraftApplied}
      pendingSheetKeys={pendingSheetKeys}
      presentation={presentation}
      selectedPendingCount={selectedPendingCount}
      selectedSheetCount={selectedSheetCount}
      selectedSheetKeySet={selectedSheetKeySet}
      someSheetsSelected={someSheetsSelected}
      state={state}
    />
  );

  if (presentation === "modal") {
    return <div className="grid gap-5">{createContent}</div>;
  }

  return (
    <MentorWorkspaceShell
      activeLabel={navigationLabel}
      breadcrumbLabel={`Bank Baru`}
      contentElement="div"
      mainClassName="max-w-[1500px] gap-7"
      onNavigateAway={() => !state.hasUnsavedChanges}
      searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
      session={session}
      showSearch={false}
      shouldGuardNavigation={state.hasUnsavedChanges}
      sidebarAppearance="reference"
    >
      {createContent}
    </MentorWorkspaceShell>
  );
}

function QuestionBankEditWorkspace({
  actions,
  bankId,
  builderState,
  state,
  workspaceRef,
}: {
  actions: QuestionBankBuilderActions;
  bankId?: string;
  builderState: QuestionBankBuilderFormState;
  state: QuestionBankBuilderViewState;
  workspaceRef: { current: HTMLDivElement | null };
}) {
  const targetBankId = bankId ?? builderState.title;
  const detailHref =
    "/mentor/quiz/question-bank/" +
    targetBankId +
    "?purpose=" +
    builderState.purpose;
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-voyage-canvas">
      <QuestionBankEditWorkspaceHeader
        actions={actions}
        builderState={builderState}
        detailHref={detailHref}
        state={state}
      />
      <ResourceAuthoringLockBanner
        className="mx-auto max-w-5xl"
        hasLocalChanges={state.hasUnsavedChanges}
        onRetry={actions.retryLock}
        resourceLabel="Bank Soal"
        state={state.lockState}
      />
      <p aria-live="polite" className="sr-only" role="status">
        {state.readinessAnnouncement}
      </p>
      <QuestionBankMobileInventory
        activeQuestionId={state.activeQuestionId}
        builderState={builderState}
        isDisabled={state.isQuestionContentLocked}
        onAddQuestion={actions.addQuestion}
        onOpenQuestion={actions.onOpenQuestion}
        readiness={state.readiness}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden w-72 shrink-0 overflow-hidden border-r border-primary-100 bg-white md:flex md:flex-col lg:w-80 [&_aside]:rounded-none [&_aside]:border-0 [&_aside]:shadow-none">
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
        <QuestionBankEditQuestionWorkspace
          actions={actions}
          builderState={builderState}
          state={state}
          workspaceRef={workspaceRef}
        />
      </div>
      <QuestionBankBuilderDialogs
        actions={actions}
        confirmation={state.confirmationRequest}
        mediaPickerTarget={state.mediaPickerTarget}
        selectedMediaAssetId={state.selectedMediaAssetId}
      />
    </div>
  );
}

function QuestionBankBuilderScreen({
  actions,
  bankId,
  builderState,
  mode,
  presentation,
  session,
  state,
  workspaceRef,
}: QuestionBankBuilderScreenProps) {
  if (mode === "create") {
    return (
      <QuestionBankCreateWorkspace
        actions={actions}
        builderState={builderState}
        presentation={presentation}
        session={session}
        state={state}
      />
    );
  }
  return (
    <QuestionBankEditWorkspace
      actions={actions}
      bankId={bankId}
      builderState={builderState}
      state={state}
      workspaceRef={workspaceRef}
    />
  );
}
function useQuestionBankNavigationGuards({
  hasUnsavedChanges,
  pendingRouteReplacement,
  router,
}: {
  hasUnsavedChanges: boolean;
  pendingRouteReplacement: string | null;
  router: ReturnType<typeof useRouter>;
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
}

function useQuestionBankPersistence({
  bankIdRef,
  builderState,
  editLease,
  hasUnsavedChanges,
  isMetadataLocked,
  isSaving,
  mediaFolderReservationId,
  mode,
  onBankNoLongerEditable,
  readiness,
  revisionRef,
  setMediaFolderReservationId,
  setServerReadiness,
  setLocalBuilderState,
  updateEditor,
}: {
  bankIdRef: { current: string | undefined };
  builderState: LocalQuestionBankState;
  editLease?: import("@/lib/serialization/authoring-lease").AuthoringEditLease;
  hasUnsavedChanges: boolean;
  isMetadataLocked: boolean;
  isSaving: boolean;
  mediaFolderReservationId?: string;
  mode: "create" | "edit";
  onBankNoLongerEditable: (bankId: string) => void;
  readiness: QuestionBankReadiness;
  revisionRef: { current: number | undefined };
  setMediaFolderReservationId: (reservationId: string | undefined) => void;
  setServerReadiness: (readiness: QuestionBankReadiness | null) => void;
  setLocalBuilderState: (state: LocalQuestionBankState) => void;
  updateEditor: (patch: Partial<QuestionBankEditorState>) => void;
}) {
  const lastSuccessfulSnapshotRef = useRef<string | null>(
    mode === "edit" ? questionBankSaveSnapshotKey(builderState) : null,
  );
  const lastAttemptedSnapshotRef = useRef<string | null>(null);

  const saveDraft = useCallback(async () => {
    if (isSaving || (mode === "edit" && isMetadataLocked)) return;
    if (readiness.incompleteCount > 0) {
      const message = `Lengkapi ${readiness.incompleteCount} soal yang belum lengkap sebelum menyimpan Bank Soal.`;
      updateEditor({ saveError: message });
      showToast(message, { variant: "error" });
      return;
    }

    updateEditor({ isSaving: true, lifecycleError: null, saveError: null });
    try {
      const result = await saveQuestionBankAction({
        description: builderState.description,
        editLease,
        folderId: mode === "create" ? builderState.folderId : undefined,
        id: bankIdRef.current,
        mediaFolderReservationId: mode === "create" ? mediaFolderReservationId : undefined,
        purpose: builderState.purpose,
        questions: builderState.questions,
        revision: revisionRef.current,
        title: builderState.title,
      });
      if (!result.ok) {
        if (result.readiness) setServerReadiness(result.readiness);
        updateEditor({ saveError: result.message });
        if (mode === "create") showToast(result.message, { variant: "error" });
        return;
      }
      revisionRef.current = result.result.bank.revision;
      bankIdRef.current = result.result.bank.id;
      const savedBank = result.result.bank;
      const desiredCategoryIds = [...builderState.categoryIds];
      const contentState = {
        categoryIds: desiredCategoryIds,
        description: savedBank.description,
        folderId: savedBank.folderId ?? null,
        purpose: savedBank.purpose,
        questions: result.result.questions,
        subjectCode: builderState.subjectCode,
        title: savedBank.title,
      };
      const organizationVersion = {
        expectedRevision: savedBank.revision,
        expectedUpdatedAt: savedBank.updatedAt,
      };

      if (!sameStringSet(savedBank.categoryIds, desiredCategoryIds)) {
        const categoryResult = await setQuestionBankCategoriesAction(
          savedBank.id,
          desiredCategoryIds,
          organizationVersion,
        );
        if (!categoryResult.ok) {
          setLocalBuilderState(contentState);
          updateEditor({ hasUnsavedChanges: true, saveError: categoryResult.message });
          if (mode === "create") showToast(categoryResult.message, { variant: "error" });
          return;
        }
        revisionRef.current = categoryResult.result.revision;
      }

      setLocalBuilderState(contentState);
      setServerReadiness(result.result.readiness);
      lastSuccessfulSnapshotRef.current = questionBankSaveSnapshotKey(contentState);
      if (mode === "create" && mediaFolderReservationId) {
        setMediaFolderReservationId(undefined);
      }
      updateEditor({
        hasUnsavedChanges: false,
        lifecycleStatus: result.result.bank.status,
        saveError: null,
      });
      if (mode === "create") showToast("Bank Soal dibuat.", { variant: "success" });
      if (mode === "create")
        updateEditor({
          pendingRouteReplacement: `/mentor/quiz/question-bank/${result.result.bank.id}?purpose=${result.result.bank.purpose}`,
        });
    } catch {
      const message = "Bank Soal belum dapat disimpan. Coba lagi.";
      updateEditor({ saveError: message });
      if (mode === "create") showToast(message, { variant: "error" });
    } finally {
      updateEditor({ isSaving: false });
    }
  }, [
    bankIdRef,
    builderState,
    editLease,
    isMetadataLocked,
    isSaving,
    mediaFolderReservationId,
    mode,
    readiness.incompleteCount,
    revisionRef,
    setLocalBuilderState,
    setMediaFolderReservationId,
    setServerReadiness,
    updateEditor,
  ]);

  useEffect(() => {
    if (
      mode !== "edit" ||
      !hasUnsavedChanges ||
      isSaving ||
      isMetadataLocked ||
      readiness.incompleteCount > 0
    ) {
      return;
    }

    const snapshotKey = questionBankSaveSnapshotKey(builderState);
    if (snapshotKey === lastSuccessfulSnapshotRef.current) {
      updateEditor({ hasUnsavedChanges: false, saveError: null });
      return;
    }
    if (snapshotKey === lastAttemptedSnapshotRef.current) return;

    const timeoutId = window.setTimeout(() => {
      lastAttemptedSnapshotRef.current = snapshotKey;
      void saveDraft();
    }, 750);
    return () => window.clearTimeout(timeoutId);
  }, [
    builderState,
    hasUnsavedChanges,
    isMetadataLocked,
    isSaving,
    mode,
    readiness.incompleteCount,
    saveDraft,
    updateEditor,
  ]);

  async function saveXlsxBanks(
    sheets: QuestionBankXlsxDraftApplied["sheets"],
    onSheetCreated: (sheetKey: string) => void,
  ) {
    if (mode !== "create" || sheets.length === 0) return false;
    updateEditor({ isSaving: true, lifecycleError: null });
    let createdCount = 0;
    let categoryFailureCount = 0;

    try {
      for (const sheet of sheets) {
        const result = await saveQuestionBankAction({
          description: builderState.description,
          folderId: builderState.folderId,
          purpose: builderState.purpose,
          questions: toBuilderQuestions(sheet.questions, "question-bank-draft"),
          title: `${builderState.title.trim()} - ${sheet.title}`,
        });
        if (!result.ok) {
          showToast(result.message, { variant: "error" });
          return false;
        }

        createdCount += 1;
        onSheetCreated(sheet.key);

        if (builderState.categoryIds.length > 0) {
          try {
            const categoryResult = await setQuestionBankCategoriesAction(
              result.result.bank.id,
              builderState.categoryIds,
              {
                expectedRevision: result.result.bank.revision,
                expectedUpdatedAt: result.result.bank.updatedAt,
              },
            );
            if (!categoryResult.ok) categoryFailureCount += 1;
          } catch {
            categoryFailureCount += 1;
          }
        }
      }

      const searchHref = `/mentor/quiz/question-bank?purpose=${builderState.purpose}&folder=root&page=1&q=${encodeURIComponent(builderState.title.trim())}&sort=updated`;
      updateEditor({
        hasUnsavedChanges: false,
        pendingRouteReplacement: searchHref,
      });
      showToast(
        categoryFailureCount > 0
          ? `${createdCount} Bank Soal dibuat. Kategori belum tersimpan pada ${categoryFailureCount} Bank.`
          : `${createdCount} Bank Soal berhasil dibuat.`,
        { variant: categoryFailureCount > 0 ? "error" : "success" },
      );
      return true;
    } catch {
      showToast("Penyimpanan berhenti. Bank yang sudah dibuat tetap tersimpan; coba lagi untuk melanjutkan.", { variant: "error" });
      return false;
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  async function updateLifecycle(
    operation: "archive" | "restore",
  ) {
    const id = bankIdRef.current;
    if (!id) return;
    updateEditor({ isSaving: true, lifecycleError: null });
    try {
      const result = await updateQuestionBankLifecycleAction(id, operation, {
        editLease,
        expectedRevision: revisionRef.current ?? 1,
      });
      if (!result.ok) {
        if (result.readiness) setServerReadiness(result.readiness);
        showToast(result.message, { variant: "error" });
        return;
      }
      revisionRef.current = result.result.revision;
      updateEditor({
        hasUnsavedChanges: false,
        lifecycleError: null,
        lifecycleStatus: result.result.status,
      });
      const lifecycleMessage = operation === "archive"
        ? "Bank Soal diarsipkan."
        : "Bank Soal dipulihkan.";
      showToast(lifecycleMessage, { variant: "success" });
      if (operation === "archive") {
        onBankNoLongerEditable(result.result.id);
      }
    } catch (lifecycleError) {
      showToast(
        lifecycleError instanceof Error
          ? lifecycleError.message
          : "Status Bank Soal tidak dapat diubah saat ini.",
        { variant: "error" },
      );
    } finally {
      updateEditor({ isSaving: false });
    }
  }

  return { saveDraft, saveXlsxBanks, updateLifecycle };
}

function getQuestionNumber(
  questions: readonly BankQuestion[],
  questionId: string,
) {
  const index = questions.findIndex((question) => question.id === questionId);
  return index < 0 ? 0 : index + 1;
}

function useQuestionBankDraftActions({
  activeQuestion,
  activeQuestionId,
  bankId,
  builderState,
  fallbackQuestion,
  initialBank,
  isMetadataLocked,
  isQuestionContentLocked,
  markChangedMode,
  mediaPickerTarget,
  questionDraft,
  questionFocusAfterDeleteRef,
  readiness,
  serverReadiness,
  setMediaFolderReservationId,
  setLocalBuilderState,
  updateEditor,
}: {
  activeQuestion: BankQuestion | null;
  activeQuestionId: string | null;
  bankId?: string;
  builderState: LocalQuestionBankState;
  fallbackQuestion: BankQuestion;
  initialBank: KaptenQuestionBank | null;
  isMetadataLocked: boolean;
  isQuestionContentLocked: boolean;
  markChangedMode: "create" | "edit";
  mediaPickerTarget: MediaPickerTarget | null;
  questionDraft: BankQuestion;
  questionFocusAfterDeleteRef: { current: string | null };
  readiness: QuestionBankReadiness;
  serverReadiness: QuestionBankReadiness | null;
  setMediaFolderReservationId: (reservationId: string | undefined) => void;
  setLocalBuilderState: (state: LocalQuestionBankState) => void;
  updateEditor: (patch: Partial<QuestionBankEditorState>) => void;
}) {
  const markChanged = useCallback(
    (nextState: LocalQuestionBankState) => {
      setLocalBuilderState(nextState);
      updateEditor({
        hasUnsavedChanges:
          markChangedMode === "create"
            ? hasQuestionBankDraftContent(nextState)
            : true,
        saveError: null,
        serverReadiness: pruneServerReadinessForDraftChange(
          serverReadiness,
          builderState.questions,
          nextState.questions,
        ),
      });
    },
    [
      builderState.questions,
      markChangedMode,
      serverReadiness,
      setLocalBuilderState,
      updateEditor,
    ],
  );
  const fileDerivedQuestionIdsRef = useRef<Set<string>>(new Set());
  const [csvDraftInfo, setCsvDraftInfo] = useState<{
    fileName: string;
    rowCount: number;
  } | null>(null);
  const [xlsxDraftInfo, setXlsxDraftInfo] = useState<Pick<
    QuestionBankXlsxDraftApplied,
    "fileName" | "previewId" | "rowCount" | "sheets"
  > | null>(null);

  const updateMetadata = useCallback(
    (field: "title" | "description", value: string) => {
      if (isMetadataLocked) return;
      markChanged({ ...builderState, [field]: value });
    },
    [builderState, isMetadataLocked, markChanged],
  );

  const updateCategories = useCallback(
    (patch: QuestionBankCategoryPatch) => {
      if (isMetadataLocked) return;
      markChanged({
        ...builderState,
        ...(patch.categoryIds
          ? { categoryIds: [...new Set(patch.categoryIds)] }
          : {}),
      });
    },
    [builderState, isMetadataLocked, markChanged],
  );

  const openQuestion = useCallback(
    (questionId: string) => {
      const question = builderState.questions.find(
        (item) => item.id === questionId,
      );
      if (!question) return;
      const issueCount = readiness.issues.filter(
        (issue) => issue.questionId === question.id,
      ).length;
      updateEditor({
        activeQuestionId: question.id,
        hasSubmittedPreview: false,
        previewChoiceId: null,
        previewChoiceIds: [],
        questionDraft: toQuestionDraft(question),
        readinessAnnouncement: issueCount
          ? `Soal ${getQuestionNumber(builderState.questions, question.id)} dipilih. Ada ${issueCount} masalah yang perlu diperbaiki.`
          : "",
      });
    },
    [builderState.questions, readiness.issues, updateEditor],
  );

  const updateQuestionDraft = useCallback(
    (nextQuestion: BankQuestion) => {
      if (isQuestionContentLocked) return;
      updateEditor({ questionDraft: nextQuestion });
      if (!activeQuestionId) return;
      markChanged({
        ...builderState,
        questions: builderState.questions.map((question) =>
          question.id === activeQuestionId ? nextQuestion : question,
        ),
      });
    },
    [
      activeQuestionId,
      builderState,
      isQuestionContentLocked,
      markChanged,
      updateEditor,
    ],
  );

  const selectMediaAsset = useCallback(
    (asset: MediaAssetDto) => {
      if (!mediaPickerTarget || !activeQuestionId) return;
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
    },
    [activeQuestionId, mediaPickerTarget, questionDraft, updateQuestionDraft],
  );

  const removeChoiceMedia = useCallback(
    (choiceId: string) => {
      if (!activeQuestionId) return;
      const question = builderState.questions.find(
        (item) => item.id === activeQuestionId,
      );
      if (!question) return;
      updateQuestionDraft({
        ...question,
        choices: question.choices.map((choice) =>
          choice.id === choiceId
            ? { ...choice, mediaAssetId: undefined }
            : choice,
        ),
      });
    },
    [activeQuestionId, builderState.questions, updateQuestionDraft],
  );

  const addChoice = useCallback(() => {
    if (isQuestionContentLocked || builderState.questions.length === 0) return;
    const question = builderState.questions.find(
      (item) => item.id === activeQuestionId,
    );
    if (!question || question.choices.length >= 5) return;
    const id = String.fromCharCode(97 + question.choices.length);
    updateQuestionDraft({
      ...question,
      choices: [...question.choices, { id, text: "" }],
    });
  }, [
    activeQuestionId,
    builderState.questions,
    isQuestionContentLocked,
    updateQuestionDraft,
  ]);

  const removeChoice = useCallback(
    (choiceId: string) => {
      if (isQuestionContentLocked) return;
      const question = builderState.questions.find(
        (item) => item.id === activeQuestionId,
      );
      if (!question || question.choices.length <= 2) return;
      const choices = question.choices.filter(
        (choice) => choice.id !== choiceId,
      );
      const correctChoiceIds = correctChoiceIdsFor(question).filter(
        (id) => id !== choiceId,
      );
      const nextCorrectChoiceIds = correctChoiceIds.length
        ? correctChoiceIds
        : [choices[0]?.id ?? "a"];
      updateQuestionDraft(
        withCorrectChoiceIds({ ...question, choices }, nextCorrectChoiceIds),
      );
    },
    [
      activeQuestionId,
      builderState.questions,
      isQuestionContentLocked,
      updateQuestionDraft,
    ],
  );

  const addQuestion = useCallback(() => {
    if (isQuestionContentLocked) return;
    const subjectCode =
      activeQuestion?.subjectCode ??
      builderState.questions.at(-1)?.subjectCode ??
      "PU";
    const id = createQuestionId(subjectCode);
    const nextQuestion = {
      ...emptyQuestion(bankId ?? initialBank?.id ?? id, subjectCode),
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
      previewChoiceIds: [],
      questionDraft: nextQuestion,
      readinessAnnouncement:
        "Soal baru ditambahkan. Isi pertanyaan, opsi, jawaban benar, dan subtes sebelum menyimpan.",
    });
  }, [
    activeQuestion?.subjectCode,
    bankId,
    builderState,
    initialBank?.id,
    isQuestionContentLocked,
    markChanged,
    updateEditor,
  ]);

  const replaceCsvDraft = useCallback(
    (summary: QuestionBankCsvDraftSummary) => {
      if (isQuestionContentLocked || summary.questions.length < 1) return;
      const draftQuestions = toBuilderQuestions(
        summary.questions,
        bankId ?? initialBank?.id ?? "question-bank-draft",
      );
      const importedQuestionIds = new Set(draftQuestions.map((question) => question.id));
      const retainedQuestions = builderState.questions.filter(
        (question) => !fileDerivedQuestionIdsRef.current.has(question.id),
      );
      fileDerivedQuestionIdsRef.current = importedQuestionIds;
      setCsvDraftInfo({ fileName: summary.fileName, rowCount: summary.rowCount });
      setXlsxDraftInfo(null);
      setMediaFolderReservationId(undefined);
      const nextState = {
        ...builderState,
        questions: [...retainedQuestions, ...draftQuestions],
      };
      markChanged(nextState);
      updateEditor({
        activeQuestionId: draftQuestions[0]?.id ?? retainedQuestions[0]?.id ?? null,
        hasSubmittedPreview: false,
        previewChoiceId: null,
        previewChoiceIds: [],
        questionDraft: draftQuestions[0]
          ? toQuestionDraft(draftQuestions[0])
          : retainedQuestions[0]
            ? toQuestionDraft(retainedQuestions[0])
            : fallbackQuestion,
        readinessAnnouncement: `${summary.rowCount} soal dari ${summary.fileName} siap disimpan bersama Bank Soal.`,
      });
    },
    [
      bankId,
      builderState,
      fallbackQuestion,
      initialBank?.id,
      isQuestionContentLocked,
      markChanged,
      setMediaFolderReservationId,
      updateEditor,
      fileDerivedQuestionIdsRef,
    ],
  );

  const replaceXlsxDraft = useCallback(
    (draft: QuestionBankXlsxDraftApplied) => {
      if (isQuestionContentLocked || draft.sheets.length < 1) return;
      const retainedQuestions = builderState.questions.filter(
        (question) => !fileDerivedQuestionIdsRef.current.has(question.id),
      );
      fileDerivedQuestionIdsRef.current = new Set();
      setCsvDraftInfo(null);
      setXlsxDraftInfo(draft);
      setMediaFolderReservationId(undefined);
      if (retainedQuestions.length !== builderState.questions.length) {
        markChanged({ ...builderState, questions: retainedQuestions });
      }
      updateEditor({
        hasUnsavedChanges: true,
        readinessAnnouncement: `${draft.rowCount} soal dari ${draft.sheets.length} lembar siap dipilih untuk dibuat menjadi Bank Soal.`,
      });
    },
    [
      builderState,
      isQuestionContentLocked,
      markChanged,
      setMediaFolderReservationId,
      updateEditor,
    ],
  );

  const removeCsvDraft = useCallback(() => {
    if (isQuestionContentLocked) return;
    const questions = builderState.questions.filter(
      (question) => !fileDerivedQuestionIdsRef.current.has(question.id),
    );
    fileDerivedQuestionIdsRef.current = new Set();
    setCsvDraftInfo(null);
    if (questions.length === builderState.questions.length) {
      updateEditor({ hasUnsavedChanges: hasQuestionBankDraftContent(builderState) });
      return;
    }
    const nextActiveQuestion = questions[0] ?? null;
    markChanged({ ...builderState, questions });
    updateEditor({
      activeQuestionId: nextActiveQuestion?.id ?? null,
      hasSubmittedPreview: false,
      previewChoiceId: null,
      previewChoiceIds: [],
      questionDraft: nextActiveQuestion ? toQuestionDraft(nextActiveQuestion) : fallbackQuestion,
      readinessAnnouncement: "Soal dari file dihapus dari Bank Soal baru.",
    });
  }, [
    builderState,
    fallbackQuestion,
    isQuestionContentLocked,
    markChanged,
    updateEditor,
  ]);

  const removeXlsxDraft = useCallback(() => {
    if (isQuestionContentLocked) return;
    setXlsxDraftInfo(null);
    setMediaFolderReservationId(undefined);
    updateEditor({ hasUnsavedChanges: hasQuestionBankDraftContent(builderState) });
  }, [builderState, isQuestionContentLocked, setMediaFolderReservationId, updateEditor]);

  const removeQuestion = useCallback(
    (id: string) => {
      if (isQuestionContentLocked) return;
      const questions = builderState.questions.filter(
        (question) => question.id !== id,
      );
      if (questions.length === builderState.questions.length) return;
      const nextActiveQuestion = questions[0] ?? null;
      questionFocusAfterDeleteRef.current = nextActiveQuestion?.id ?? null;
      markChanged({ ...builderState, questions });
      updateEditor({
        activeQuestionId: nextActiveQuestion?.id ?? null,
        hasSubmittedPreview: false,
        previewChoiceId: null,
        previewChoiceIds: [],
        questionDraft: nextActiveQuestion
          ? toQuestionDraft(nextActiveQuestion)
          : fallbackQuestion,
        readinessAnnouncement: nextActiveQuestion
          ? "Soal dihapus."
          : "Soal terakhir dihapus. Bank soal tetap dapat disimpan tanpa soal.",
      });
    },
    [
      builderState,
      fallbackQuestion,
      isQuestionContentLocked,
      markChanged,
      questionFocusAfterDeleteRef,
      updateEditor,
    ],
  );

  return {
    addChoice,
    addQuestion,
    markChanged,
    openQuestion,
    csvDraftInfo,
    xlsxDraftInfo,
    removeChoice,
    removeChoiceMedia,
    removeCsvDraft,
    removeXlsxDraft,
    removeQuestion,
    replaceCsvDraft,
    replaceXlsxDraft,
    selectMediaAsset,
    updateCategories,
    updateMetadata,
    updateQuestionDraft,
  };
}

function useQuestionBankIssueNavigation({
  activeQuestion,
  activeQuestionId,
  builderState,
  lifecycleStatus,
  pendingIssueFocusRef,
  previousActiveQuestionIdRef,
  questionFocusAfterDeleteRef,
  questionRowRefs,
  readiness,
  updateEditor,
  workspaceRef,
}: {
  activeQuestion: BankQuestion | null;
  activeQuestionId: string | null;
  builderState: LocalQuestionBankState;
  lifecycleStatus: KaptenQuestionBank["status"];
  pendingIssueFocusRef: { current: QuestionReadinessIssue | null };
  previousActiveQuestionIdRef: { current: string | null };
  questionFocusAfterDeleteRef: { current: string | null };
  questionRowRefs: QuestionRowRefs;
  readiness: QuestionBankReadiness;
  updateEditor: (patch: Partial<QuestionBankEditorState>) => void;
  workspaceRef: { current: HTMLDivElement | null };
}) {
  const focusTarget = useCallback(
    (issue: QuestionReadinessIssue, question: BankQuestion) => {
      const workspace = workspaceRef.current;
      const anchors = workspace
        ? Array.from(
            workspace.querySelectorAll<HTMLElement>("[data-question-anchor]"),
          )
        : [];
      let target: HTMLElement | undefined;
      if (issue.field === "prompt") {
        target = anchors.find(
          (element) => element.dataset.questionAnchor === "prompt",
        );
      } else if (issue.field === "choice") {
        target = anchors.find(
          (element) =>
            element.dataset.questionAnchor === "choice" &&
            (!issue.choiceId ||
              element.dataset.questionChoiceId === issue.choiceId),
        );
      } else if (issue.field === "correctChoice") {
        target = anchors.find(
          (element) => element.dataset.questionAnchor === "correctChoice",
        );
      } else if (issue.field === "subtest") {
        target = anchors.find(
          (element) => element.dataset.questionAnchor === "subtest",
        );
      } else {
        const mediaIssues = readiness.issues.filter(
          (item) =>
            item.questionId === issue.questionId &&
            item.field === "media" &&
            !item.choiceId,
        );
        const mediaIssueIndex = mediaIssues.findIndex(
          (item) => readinessIssueKey(item) === readinessIssueKey(issue),
        );
        const mediaKey =
          issue.mediaTarget ??
          (!question.promptMediaAssetId && question.explanationMediaAssetId
            ? "explanation"
            : mediaIssueIndex > 0
              ? "explanation"
              : "prompt");
        target = anchors.find(
          (element) =>
            element.dataset.questionAnchor === "media" &&
            element.dataset.questionFieldKey === mediaKey &&
            (!issue.choiceId ||
              element.dataset.questionChoiceId === issue.choiceId),
        );
        target ??= anchors.find(
          (element) =>
            element.dataset.questionAnchor === "media" &&
            (!issue.choiceId ||
              element.dataset.questionChoiceId === issue.choiceId),
        );
      }
      if (!target || target.hasAttribute("disabled")) {
        const lifecycleAction = lifecycleStatus === "archived" ? "restore" : null;
        const lifecycleTarget = lifecycleAction
          ? document.querySelector<HTMLButtonElement>(
              `[data-question-bank-lifecycle-action="${lifecycleAction}"]`,
            )
          : null;
        if (!lifecycleTarget || lifecycleTarget.disabled) return false;
        lifecycleTarget.focus({ preventScroll: true });
        return "handoff" as const;
      }
      target.focus({ preventScroll: true });
      return "exact" as const;
    },
    [lifecycleStatus, readiness.issues, workspaceRef],
  );

  const announceIssue = useCallback(
    (
      issue: QuestionReadinessIssue,
      issueIndex: number,
      totalIssues: number,
    ) => {
      updateEditor({
        readinessAnnouncement: `Masalah ${issueIndex + 1} dari ${totalIssues}: Soal ${getQuestionNumber(builderState.questions, issue.questionId)}, ${readinessFieldLabel(issue)}.`,
      });
    },
    [builderState.questions, updateEditor],
  );

  const openQuestion = useCallback(
    (questionId: string) => {
      const question = builderState.questions.find(
        (item) => item.id === questionId,
      );
      if (!question) return;
      updateEditor({
        activeQuestionId: question.id,
        hasSubmittedPreview: false,
        previewChoiceId: null,
        previewChoiceIds: [],
        questionDraft: toQuestionDraft(question),
        readinessAnnouncement: "",
      });
    },
    [builderState.questions, updateEditor],
  );

  const focusIssueAt = useCallback(
    (index: number) => {
      const issue = readiness.issues[index];
      if (!issue) return;
      pendingIssueFocusRef.current = issue;
      openQuestion(issue.questionId);
      announceIssue(issue, index, readiness.issues.length);
    },
    [announceIssue, openQuestion, pendingIssueFocusRef, readiness.issues],
  );

  const focusFirstIssue = useCallback(() => {
    if (!readiness.issues.length) {
      updateEditor({
        readinessAnnouncement: "Tidak ada masalah yang perlu diperbaiki.",
      });
      return;
    }
    focusIssueAt(0);
  }, [focusIssueAt, readiness.issues.length, updateEditor]);

  useEffect(() => {
    const activeQuestionChanged =
      previousActiveQuestionIdRef.current !== activeQuestionId;
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
        if (questionFocusAfterDeleteRef.current === questionFocusAfterDelete)
          questionFocusAfterDeleteRef.current = null;
      });
    } else if (questionFocusAfterDelete) {
      questionFocusAfterDeleteRef.current = null;
    }
    if (
      activeQuestionChanged &&
      typeof window !== "undefined" &&
      window.innerWidth < 1280
    ) {
      const prefersReducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      workspaceRef.current?.scrollIntoView?.({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [
    activeQuestionId,
    builderState.questions.length,
    previousActiveQuestionIdRef,
    questionFocusAfterDeleteRef,
    questionRowRefs,
    workspaceRef,
  ]);

  useEffect(() => {
    const pendingIssue = pendingIssueFocusRef.current;
    if (
      !pendingIssue ||
      pendingIssue.questionId !== activeQuestionId ||
      !activeQuestion
    )
      return;
    const frame = window.requestAnimationFrame(() => {
      questionRowRefs.current[pendingIssue.questionId]?.scrollIntoView?.({
        block: "nearest",
      });
      workspaceRef.current?.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      window.requestAnimationFrame(() => {
        if (pendingIssueFocusRef.current !== pendingIssue) return;
        const focusResult = focusTarget(pendingIssue, activeQuestion);
        if (focusResult === "handoff") {
          const lifecycleAction = "Pulihkan bank";
          updateEditor({
            readinessAnnouncement: `Soal ${getQuestionNumber(builderState.questions, pendingIssue.questionId)} memiliki masalah ${readinessFieldLabel(pendingIssue)} yang terkunci. Pilih ${lifecycleAction} untuk membuka perbaikan.`,
          });
        } else if (!focusResult) {
          updateEditor({
            readinessAnnouncement: `Masalah ${readinessFieldLabel(pendingIssue)} pada Soal ${getQuestionNumber(builderState.questions, pendingIssue.questionId)} belum dapat difokuskan.`,
          });
        }
        pendingIssueFocusRef.current = null;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeQuestion,
    activeQuestionId,
    builderState.questions,
    focusTarget,
    lifecycleStatus,
    pendingIssueFocusRef,
    questionRowRefs,
    readiness.issues,
    updateEditor,
    workspaceRef,
  ]);

  return { focusFirstIssue };
}

function useQuestionBankLifecycleActions({
  builderState,
  confirmationRequest,
  hasUnsavedChanges,
  removeQuestion,
  router,
  updateEditor,
  updateLifecycle,
}: {
  builderState: LocalQuestionBankState;
  confirmationRequest: ConfirmationRequest | null;
  hasUnsavedChanges: boolean;
  removeQuestion: (id: string) => void;
  router: ReturnType<typeof useRouter>;
  updateEditor: (patch: Partial<QuestionBankEditorState>) => void;
  updateLifecycle: (operation: "archive" | "restore") => void;
}) {
  const closeConfirmation = useCallback(
    () => updateEditor({ confirmationRequest: null }),
    [updateEditor],
  );
  const requestExit = useCallback(
    (route: string) => {
      if (!hasUnsavedChanges) {
        router.push(route);
        return;
      }
      updateEditor({
        confirmationRequest: {
          confirmLabel: "Keluar tanpa menyimpan",
          description: "Perubahan Bank Soal yang belum disimpan akan hilang.",
          onConfirm: () => router.push(route),
          title: "Keluar tanpa menyimpan?",
        },
      });
    },
    [hasUnsavedChanges, router, updateEditor],
  );
  const confirmPendingAction = useCallback(() => {
    const pendingRequest = confirmationRequest;
    closeConfirmation();
    pendingRequest?.onConfirm();
  }, [closeConfirmation, confirmationRequest]);
  const requestQuestionRemoval = useCallback(
    (id: string) => {
      const questionNumber =
        builderState.questions.findIndex((item) => item.id === id) + 1;
      if (questionNumber < 1) return;
      updateEditor({
        confirmationRequest: {
          confirmLabel: "Hapus soal",
          description: `Soal nomor ${questionNumber} akan dihapus dari Bank Soal dan tidak dapat dikembalikan.`,
          onConfirm: () => removeQuestion(id),
          title: `Hapus soal nomor ${questionNumber}?`,
        },
      });
    },
    [builderState.questions, removeQuestion, updateEditor],
  );
  const requestArchive = useCallback(
    () =>
      updateEditor({
        confirmationRequest: {
          confirmLabel: "Arsipkan",
          description:
            "Bank Soal ini akan dipindahkan ke arsip dan tidak dapat dipakai untuk authoring sampai dipulihkan.",
          onConfirm: () => updateLifecycle("archive"),
          title: "Arsipkan Bank Soal?",
        },
      }),
    [updateEditor, updateLifecycle],
  );
  return {
    closeConfirmation,
    confirmPendingAction,
    requestArchive,
    requestExit,
    requestQuestionRemoval,
  };
}

function getSelectedQuestionMediaAssetId(
  target: MediaPickerTarget | null,
  questionDraft: BankQuestion,
) {
  if (target?.kind === "prompt") return questionDraft.promptMediaAssetId;
  if (target?.kind === "explanation")
    return questionDraft.explanationMediaAssetId;
  if (target?.kind === "choice")
    return questionDraft.choices.find((choice) => choice.id === target.choiceId)
      ?.mediaAssetId;
  return undefined;
}

function getQuestionBankBuilderInitialData({
  bankId,
  initialActiveQuestionId,
  initialBank,
  initialFolderId,
  initialQuestions,
  initialReadiness,
  mode,
  purpose,
}: {
  bankId?: string;
  initialActiveQuestionId?: string;
  initialBank: KaptenQuestionBank | null;
  initialFolderId?: string | null;
  initialQuestions: BankQuestion[];
  initialReadiness: QuestionBankReadiness | null;
  mode: "create" | "edit";
  purpose: "quiz" | "tryout";
}) {
  const initialBuilderState: LocalQuestionBankState = {
    categoryIds: initialBank?.categoryIds ?? [],
    description: initialBank?.description ?? "",
    folderId: initialBank?.folderId ?? initialFolderId ?? null,
    purpose: initialBank?.purpose ?? purpose,
    questions: initialQuestions,
    subjectCode: initialBank?.subjectCode ?? "PU",
    title: initialBank?.title ?? "",
  };
  const initialQuestion =
    (initialActiveQuestionId
      ? initialBuilderState.questions.find(
          (question) => question.id === initialActiveQuestionId,
        )
      : null) ??
    initialBuilderState.questions[0] ??
    null;
  const fallbackQuestionDraft = emptyQuestion(
    bankId ?? initialBank?.id ?? "question-bank-draft",
    initialBank?.subjectCode ?? "PU",
  );
  const initialEditorState: QuestionBankEditorState = {
    activeQuestionId: initialQuestion?.id ?? null,
    confirmationRequest: null,
    hasSubmittedPreview: false,
    hasUnsavedChanges:
      mode === "create" && hasQuestionBankDraftContent(initialBuilderState),
    isSaving: false,
    lifecycleError: null,
    lifecycleStatus: initialBank?.status ?? "draft",
    mediaPickerTarget: null,
    pendingRouteReplacement: null,
    previewChoiceId: null,
    previewChoiceIds: [],
    questionDraft: initialQuestion
      ? toQuestionDraft(initialQuestion)
      : fallbackQuestionDraft,
    questionEditorTab: "edit",
    readinessAnnouncement: "",
    saveError: null,
    serverReadiness: mode === "edit" ? initialReadiness : null,
  };
  return { fallbackQuestionDraft, initialBuilderState, initialEditorState };
}

function getQuestionBankBuilderDerivedState({
  builderState,
  editorState,
  lockState,
}: {
  builderState: LocalQuestionBankState;
  editorState: QuestionBankEditorState;
  lockState: AuthoringLockState;
}) {
  const activeQuestion = editorState.activeQuestionId
    ? (builderState.questions.find(
        (question) => question.id === editorState.activeQuestionId,
      ) ?? null)
    : null;
  const isMetadataLocked =
    editorState.isSaving ||
    editorState.lifecycleStatus === "archived" ||
    lockState !== "owned";
  const isQuestionContentLocked =
    editorState.isSaving ||
    editorState.lifecycleStatus === "archived" ||
    lockState !== "owned";
  const localReadiness = getQuestionBankReadinessFromDrafts(
    builderState.questions,
  );
  const readiness = mergeQuestionBankReadiness(
    builderState.questions,
    localReadiness,
    editorState.serverReadiness,
  );
  const selectedMediaAssetId = getSelectedQuestionMediaAssetId(
    editorState.mediaPickerTarget,
    editorState.questionDraft,
  );
  return {
    activeQuestion,
    isMetadataLocked,
    isQuestionContentLocked,
    readiness,
    selectedMediaAssetId,
  };
}

function createQuestionBankBuilderActions({
  draftActions,
  focusFirstIssue,
  lifecycleActions,
  onChoiceChange,
  onCloseMedia,
  onEditorTabChange,
  onOpenMedia,
  onSubmitPreview,
  persistence,
  retryLock,
}: {
  draftActions: ReturnType<typeof useQuestionBankDraftActions>;
  focusFirstIssue: () => void;
  lifecycleActions: ReturnType<typeof useQuestionBankLifecycleActions>;
  onChoiceChange: (value: string) => void;
  onCloseMedia: () => void;
  onEditorTabChange: (value: string) => void;
  onOpenMedia: (target: MediaPickerTarget) => void;
  onSubmitPreview: () => void;
  persistence: ReturnType<typeof useQuestionBankPersistence>;
  retryLock: () => void;
}): QuestionBankBuilderActions {
  return {
    ...draftActions,
    closeConfirmation: lifecycleActions.closeConfirmation,
    confirmPendingAction: lifecycleActions.confirmPendingAction,
    focusFirstIssue,
    onChoiceChange,
    onCloseMedia,
    onEditorTabChange,
    onOpenMedia,
    onOpenQuestion: draftActions.openQuestion,
    onRemoveChoice: draftActions.removeChoice,
    onRemoveChoiceMedia: draftActions.removeChoiceMedia,
    onRemoveQuestion: lifecycleActions.requestQuestionRemoval,
    onSelectMedia: draftActions.selectMediaAsset,
    onSubmitPreview,
    onUpdateDraft: draftActions.updateQuestionDraft,
    removeCsvDraft: draftActions.removeCsvDraft,
    requestArchive: lifecycleActions.requestArchive,
    requestExit: lifecycleActions.requestExit,
    retryLock,
    saveDraft: persistence.saveDraft,
    updateCategories: draftActions.updateCategories,
    updateLifecycle: persistence.updateLifecycle,
    createXlsxBanks: persistence.saveXlsxBanks,
    updateMetadata: draftActions.updateMetadata,
  };
}

function useQuestionBankBuilderState({
  bankId,
  initialActiveQuestionId,
  initialBank = null,
  initialFolderId = null,
  initialQuestions = [],
  initialReadiness = null,
  mode,
  purpose = "quiz",
}: {
  bankId?: string;
  initialActiveQuestionId?: string;
  initialBank?: KaptenQuestionBank | null;
  initialFolderId?: string | null;
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  mode: "create" | "edit";
  purpose?: "quiz" | "tryout";
}) {
  const router = useRouter();
  const { fallbackQuestionDraft, initialBuilderState, initialEditorState } =
    getQuestionBankBuilderInitialData({
      bankId,
      initialActiveQuestionId,
      initialBank,
      initialFolderId,
      initialQuestions,
      initialReadiness,
      mode,
      purpose,
    });
  const [localBuilderState, setLocalBuilderState] = useState(
    () => initialBuilderState,
  );
  const [editorState, dispatch] = useReducer(
    questionBankEditorReducer,
    initialEditorState,
  );
  const [mediaFolderReservationId, setMediaFolderReservationId] = useState<string | undefined>();
  const resourceLock = useResourceEditLock();
  const lockState: AuthoringLockState = mode === "create" ? "owned" : resourceLock.state;
  const updateEditor = useCallback(
    (patch: Partial<QuestionBankEditorState>) =>
      dispatch({ patch, type: "patch" }),
    [],
  );
  const setServerReadiness = useCallback(
    (nextReadiness: QuestionBankReadiness | null) =>
      updateEditor({ serverReadiness: nextReadiness }),
    [updateEditor],
  );
  const revisionRef = useRef(initialBank?.revision);
  const bankIdRef = useRef(initialBank?.id ?? bankId);
  const questionRowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const previousActiveQuestionIdRef = useRef<string | null>(
    editorState.activeQuestionId,
  );
  const questionFocusAfterDeleteRef = useRef<string | null>(null);
  const pendingIssueFocusRef = useRef<QuestionReadinessIssue | null>(null);
  const builderState = localBuilderState;
  const {
    activeQuestion,
    isMetadataLocked,
    isQuestionContentLocked,
    readiness,
    selectedMediaAssetId,
  } = getQuestionBankBuilderDerivedState({
    builderState,
    editorState,
    lockState,
  });
  const draftActions = useQuestionBankDraftActions({
    activeQuestion,
    activeQuestionId: editorState.activeQuestionId,
    bankId,
    builderState,
    fallbackQuestion: fallbackQuestionDraft,
    initialBank,
    isMetadataLocked,
    isQuestionContentLocked,
    markChangedMode: mode,
    mediaPickerTarget: editorState.mediaPickerTarget,
    questionDraft: editorState.questionDraft,
    questionFocusAfterDeleteRef,
    readiness,
    serverReadiness: editorState.serverReadiness,
    setMediaFolderReservationId,
    setLocalBuilderState,
    updateEditor,
  });
  const issueNavigation = useQuestionBankIssueNavigation({
    activeQuestion,
    activeQuestionId: editorState.activeQuestionId,
    builderState,
    lifecycleStatus: editorState.lifecycleStatus,
    pendingIssueFocusRef,
    previousActiveQuestionIdRef,
    questionFocusAfterDeleteRef,
    questionRowRefs,
    readiness,
    updateEditor,
    workspaceRef,
  });
  useQuestionBankNavigationGuards({
    hasUnsavedChanges: editorState.hasUnsavedChanges,
    pendingRouteReplacement: editorState.pendingRouteReplacement,
    router,
  });
  const persistence = useQuestionBankPersistence({
    bankIdRef,
    builderState,
    editLease: mode === "edit" ? resourceLock.proof ?? undefined : undefined,
    hasUnsavedChanges: editorState.hasUnsavedChanges,
    isMetadataLocked,
    isSaving: editorState.isSaving,
    mediaFolderReservationId,
    mode,
    onBankNoLongerEditable: (id) =>
      updateEditor({
        pendingRouteReplacement: `/mentor/quiz/question-bank/${id}?purpose=${builderState.purpose}`,
      }),
    readiness,
    revisionRef,
    setMediaFolderReservationId,
    setServerReadiness,
    setLocalBuilderState,
    updateEditor,
  });
  const lifecycleActions = useQuestionBankLifecycleActions({
    builderState,
    confirmationRequest: editorState.confirmationRequest,
    hasUnsavedChanges: editorState.hasUnsavedChanges,
    removeQuestion: draftActions.removeQuestion,
    router,
    updateEditor,
    updateLifecycle: persistence.updateLifecycle,
  });
  const actions = createQuestionBankBuilderActions({
    draftActions,
    focusFirstIssue: issueNavigation.focusFirstIssue,
    lifecycleActions,
    onChoiceChange: (value) => {
      const nextIds =
        questionTypeFor(editorState.questionDraft) === "multiple_choice"
          ? editorState.previewChoiceIds.includes(value)
            ? editorState.previewChoiceIds.filter((id) => id !== value)
            : [...editorState.previewChoiceIds, value]
          : [value];
      updateEditor({
        hasSubmittedPreview: false,
        previewChoiceId: nextIds[0] ?? null,
        previewChoiceIds: nextIds,
      });
    },
    onCloseMedia: () => updateEditor({ mediaPickerTarget: null }),
    onEditorTabChange: (value) =>
      updateEditor({ questionEditorTab: value as "edit" | "preview" }),
    onOpenMedia: (target) => updateEditor({ mediaPickerTarget: target }),
    onSubmitPreview: () => updateEditor({ hasSubmittedPreview: true }),
    persistence,
    retryLock: resourceLock.retry,
  });
  return {
    actions,
    bankIdValue: bankId ?? initialBank?.id,
    builderState,
    editorState,
    mediaFolderReservationId,
    isMetadataLocked,
    isQuestionContentLocked,
    lockState,
    questionRowRefs,
    readiness,
    selectedMediaAssetId,
    workspaceRef,
  };
}

function QuestionBankBuilderContent({
  bankId,
  initialActiveQuestionId,
  initialBank = null,
  initialFolderId = null,
  initialQuestions = [],
  initialReadiness = null,
  mode,
  onOpenChange,
  open = true,
  presentation = "page",
  purpose = "quiz",
  session,
}: {
  bankId?: string;
  initialActiveQuestionId?: string;
  initialBank?: KaptenQuestionBank | null;
  initialFolderId?: string | null;
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  mode: "create" | "edit";
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  presentation?: "page" | "modal";
  purpose?: "quiz" | "tryout";
  session: SessionContext;
}) {
  const {
    actions,
    bankIdValue,
    builderState,
    editorState,
    mediaFolderReservationId,
    isMetadataLocked,
    isQuestionContentLocked,
    lockState,
    questionRowRefs,
    readiness,
    selectedMediaAssetId,
    workspaceRef,
  } = useQuestionBankBuilderState({
    bankId,
    initialActiveQuestionId,
    initialBank,
    initialFolderId,
    initialQuestions,
    initialReadiness,
    mode,
    purpose,
  });

  const viewState: QuestionBankBuilderViewState = {
    activeQuestionId: editorState.activeQuestionId,
    confirmationRequest: editorState.confirmationRequest,
    hasSubmittedPreview: editorState.hasSubmittedPreview,
    hasUnsavedChanges: editorState.hasUnsavedChanges,
    isMetadataLocked,
    isQuestionContentLocked,
    lockState,
    isSaving: editorState.isSaving,
    lifecycleError: editorState.lifecycleError,
    saveError: editorState.saveError,
    lifecycleStatus: editorState.lifecycleStatus,
    mediaFolderReservationId,
    mediaPickerTarget: editorState.mediaPickerTarget,
    pendingRouteReplacement: editorState.pendingRouteReplacement,
    previewChoiceId: editorState.previewChoiceId,
    previewChoiceIds: editorState.previewChoiceIds,
    questionDraft: editorState.questionDraft,
    questionEditorTab: editorState.questionEditorTab,
    questionRowRefs,
    readiness,
    readinessAnnouncement: editorState.readinessAnnouncement,
    selectedMediaAssetId,
  };
  const screen = (
    <QuestionBankBuilderScreen
      actions={actions}
      bankId={bankIdValue}
      builderState={builderState}
      mode={mode}
      presentation={presentation}
      session={session}
      state={viewState}
      workspaceRef={workspaceRef}
    />
  );

  if (mode !== "create" || presentation !== "modal") return screen;

  function requestClose() {
    onOpenChange?.(false);
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange?.(true);
        else requestClose();
      }}
      open={open}
    >
      <DialogContent
        className="max-h-[min(86vh,760px)] w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-2xl sm:p-8"
        data-question-bank-create-modal="true"
      >
        {screen}
      </DialogContent>
    </Dialog>
  );
}

function KaptenQuestionBankBuilderPageModule({
  bankId,
  initialActiveQuestionId,
  initialBank = null,
  initialFolderId = null,
  initialQuestions = [],
  initialReadiness = null,
  mode,
  onOpenChange,
  open,
  presentation = "page",
  purpose = "quiz",
  session,
}: {
  bankId?: string;
  initialActiveQuestionId?: string;
  initialBank?: KaptenQuestionBank | null;
  initialFolderId?: string | null;
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  mode: "create" | "edit";
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  presentation?: "page" | "modal";
  purpose?: "quiz" | "tryout";
  session: SessionContext;
}) {
  return (
    <ResourceEditLockProvider
      enabled={mode === "edit" && Boolean(bankId)}
      resourceId={bankId ?? "00000000-0000-4000-8000-000000000000"}
      resourceType="question_bank"
    >
      <QuestionBankBuilderContent
        bankId={bankId}
        initialActiveQuestionId={initialActiveQuestionId}
        initialBank={initialBank}
        initialFolderId={initialFolderId}
        initialQuestions={initialQuestions}
        initialReadiness={initialReadiness}
        mode={mode}
        onOpenChange={onOpenChange}
        open={open}
        presentation={presentation}
        purpose={purpose}
        session={session}
      />
    </ResourceEditLockProvider>
  );
}

export { KaptenQuestionBankBuilderPageModule };
