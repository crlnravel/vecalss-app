"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Plus,
  Search,
  Trash2,
} from "@/lib/icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { imageMediaMimeTypes } from "@/lib/media/domain";
import type { MediaAssetDto } from "@/lib/media/types";
import { buildQuestionBankHref } from "@/lib/navigation/canonical-context";
import {
  MediaAssetPreview,
  MediaPickerDialog,
} from "@/modules/media/media-library";
import { PaginationControls } from "@/modules/mentor/components/kapten-ui";
import {
  QUESTION_BANK_PICKER_DIALOG_CLASS_NAME,
  QUESTION_BANK_PICKER_FOOTER_CLASS_NAME,
  QuestionBankPickerRow,
} from "@/modules/mentor/components/question-bank-picker-layout";
import {
  EditorMobileInventory,
  EditorQuestionInventory,
  QuestionEditorWorkspace,
} from "@/modules/mentor/components/question-editor-workspace";
import { QuestionContentEditor } from "@/modules/mentor/components/question-content-editor";
import {
  setQuestionMediaAsset,
  type QuestionMediaTarget,
} from "@/modules/mentor/components/question-content-editor-helpers";
import { asContentEditorQuestion, toTryoutQuestionChange } from "@/modules/mentor/components/tryout-question-content-adapter";

export const TRYOUT_SOURCE_QUESTION_PAGE_SIZE = 10;

export type TryoutQuestionDifficulty =
  | "easy"
  | "medium"
  | "hard"
  | "adaptive";
export type TryoutQuestionType = "single_choice" | "multiple_choice";

export type TryoutQuestionSnapshotOptionDraft = {
  assetId: string | null;
  choiceKey: string;
  content: string;
  isCorrect: boolean;
  snapshotOptionId: string;
  sortOrder: number;
};

export type TryoutQuestionSnapshotDraft = {
  difficulty: TryoutQuestionDifficulty;
  explanation: string | null;
  explanationAssetId: string | null;
  options: TryoutQuestionSnapshotOptionDraft[];
  prompt: string;
  promptAssetId: string | null;
  questionType: TryoutQuestionType;
  snapshotId: string;
  sortOrder?: number;
};

export type TryoutLegacyQuestionDraft = {
  bankId?: string;
  bankTitle?: string;
  difficulty?: TryoutQuestionDifficulty;
  explanation?: string | null;
  explanationAssetId?: string | null;
  hasExplanation?: boolean;
  hasReadyMedia?: boolean;
  options?: Array<{
    assetId?: string | null;
    choiceKey?: string;
    content?: string;
    isCorrect?: boolean;
    snapshotOptionId?: string;
    sortOrder?: number;
    sourceQuestionOptionId?: string;
    sourceQuestionRevisionOptionId?: string;
  }>;
  prompt?: string;
  promptAssetId?: string | null;
  questionType?: TryoutQuestionType;
  sourceContentDigest?: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId?: string;
  sourceRevisionProvenance?: string;
};

export type TryoutDirectQuestionDraft =
  | TryoutQuestionSnapshotDraft
  | TryoutLegacyQuestionDraft;

export type TryoutSourceBank = {
  categories?: Array<{ id: string; name: string }>;
  description: string;
  folderPath?: Array<{ id: string | null; name: string }>;
  id: string;
  questionCount: number;
  subjectCoverage?: string[];
  title: string;
};

export type TryoutSourceQuestion = {
  bankId: string;
  choices: Array<{ id: string; mediaAssetId?: string; text: string }>;
  correctChoiceIds?: string[];
  difficulty: TryoutQuestionDifficulty;
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionContentDigest?: string;
  questionRevisionId?: string;
  questionType?: TryoutQuestionType;
  subjectCode: string;
};

export type TryoutExpectedSourceRevision = {
  contentDigest: string;
  questionId: string;
  revisionId: string;
};

export type TryoutQuestionImportRequest =
  | { allInBank: true; bankId: string }
  | {
      allInBank?: false;
      bankId: string;
      expectedSourceRevisions: TryoutExpectedSourceRevision[];
      questionIds: string[];
    };

export type TryoutQuestionImportOutcome =
  | {
      importedCount: number;
      ok: true;
      snapshots: TryoutQuestionSnapshotDraft[];
    }
  | { message: string; ok: false };

export type TryoutQuestionChange = Partial<
  Omit<TryoutQuestionSnapshotDraft, "options" | "snapshotId">
> & { options?: TryoutQuestionSnapshotOptionDraft[] };

type TryoutSectionQuestionManagerProps = {
  activeBrowseBank?: TryoutSourceBank;
  activeSourceQuestions: TryoutSourceQuestion[];
  browseBankId: string | null;
  draftLocked: boolean;
  guardExternalNavigation: (
    href: string,
    event: { preventDefault: () => void },
  ) => void;
  onBankPageNext: () => void;
  onBankSearchChange: (search: string) => void;
  onImport: (
    request: TryoutQuestionImportRequest,
  ) => Promise<TryoutQuestionImportOutcome>;
  onMoveQuestion: (snapshotId: string, direction: "up" | "down") => void;
  onQuestionPageChange: (page: number) => void;
  onQuestionSearchChange: (search: string) => void;
  onRemoveQuestion: (snapshotId: string) => void;
  onSelectBank: (bankId: string) => void;
  onUpdateQuestion: (snapshotId: string, change: TryoutQuestionChange) => void;
  packageVersionId?: string | null;
  questions: TryoutDirectQuestionDraft[];
  presentation?: "embedded" | "workspace";
  readOnly: boolean;
  saving: boolean;
  sectionSubject: string;
  sourceBankLoading: boolean;
  sourceBankSearch: string;
  sourceBankTotal: number;
  sourceBanks: TryoutSourceBank[];
  sourceQuestionLoading: boolean;
  sourceQuestionPage: number;
  sourceQuestionSearch: string;
  sourceQuestionTotal: number;
};

function isSnapshotQuestion(
  question: TryoutDirectQuestionDraft,
): question is TryoutQuestionSnapshotDraft {
  return "snapshotId" in question;
}

function difficultyLabel(difficulty: TryoutQuestionDifficulty) {
  return difficulty === "easy"
    ? "Mudah"
    : difficulty === "hard"
      ? "Sulit"
      : difficulty === "adaptive"
        ? "Adaptif"
        : "Sedang";
}

function SourceBankList({
  activeSectionSubtest,
  browseBankId,
  disabled,
  guardExternalNavigation,
  onSelectBank,
  sourceBanks,
}: {
  activeSectionSubtest: string;
  browseBankId: string | null;
  disabled: boolean;
  guardExternalNavigation: TryoutSectionQuestionManagerProps["guardExternalNavigation"];
  onSelectBank: (bankId: string) => void;
  sourceBanks: TryoutSourceBank[];
}) {
  if (!sourceBanks.length) {
    const href = buildQuestionBankHref({ purpose: "tryout" });
    return (
      <div className="grid gap-3 px-3 py-5">
        <p className="text-sm leading-6 text-secondary-500">
          Belum ada Bank Soal dengan soal siap untuk {activeSectionSubtest}.
        </p>
        <Button
          className="w-fit"
          disabled={disabled}
          nativeButton={false}
          onClick={(event) => guardExternalNavigation(href, event)}
          render={<Link href={href} />}
          size="sm"
          variant="reference"
        >
          Buka Bank Soal
        </Button>
      </div>
    );
  }

  return sourceBanks.map((bank) => (
    <button
      aria-pressed={browseBankId === bank.id}
      className={`min-h-11 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-primary-200 ${browseBankId === bank.id ? "bg-primary-50 font-semibold text-primary-900" : "text-secondary-700 hover:bg-secondary-50"}`}
      disabled={disabled}
      key={bank.id}
      onClick={() => onSelectBank(bank.id)}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate">{bank.title}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">
          {bank.questionCount} soal
          {bank.folderPath?.length
            ? ` · ${bank.folderPath.map((item) => item.name).join(" / ")}`
            : ""}
        </span>
      </span>
    </button>
  ));
}

function TryoutQuestionMediaField({
  assetId,
  disabled,
  label,
  onChange,
}: {
  assetId: string | null;
  disabled: boolean;
  label: string;
  onChange: (assetId: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const fieldId = `tryout-media-${label.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <div className="grid min-w-0 gap-2">
      <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>{label}</p>
      {assetId ? (
        <div className="relative aspect-[16/9] max-w-sm overflow-hidden rounded-2xl border border-primary-100 bg-primary-50 [&_img]:object-contain">
          <MediaAssetPreview
            alt={label}
            assetId={assetId}
            className="absolute inset-0 min-h-0 w-full"
          />
        </div>
      ) : (
        <ReferenceSurface
          className="grid min-h-20 max-w-sm place-items-center px-3 py-4 text-sm text-secondary-500"
          variant="inset"
        >
          Belum ada gambar
        </ReferenceSurface>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          className={REFERENCE_CONTROL_CLASS_NAMES.file}
          disabled={disabled}
          id={fieldId}
          onClick={() => setPickerOpen(true)}
          size="sm"
          variant="reference"
        >
          <ImagePlus />
          {assetId ? "Ganti gambar" : "Pilih gambar"}
        </Button>
        {assetId ? (
          <Button
            disabled={disabled}
            onClick={() => onChange(null)}
            size="sm"
            variant="ghost"
          >
            <Trash2 />
            Hapus gambar
          </Button>
        ) : null}
      </div>
      <MediaPickerDialog
        allowedMimeTypes={imageMediaMimeTypes}
        onOpenChange={setPickerOpen}
        onSelect={(asset: MediaAssetDto) => onChange(asset.id)}
        open={pickerOpen && !disabled}
        selectedAssetId={assetId}
        title={`Pilih gambar ${label.toLowerCase()}`}
      />
    </div>
  );
}

function useTryoutQuestionSnapshotActions(
  question: TryoutQuestionSnapshotDraft,
  onUpdate: (change: TryoutQuestionChange) => void,
) {
  const correctOptionId =
    question.options.find((option) => option.isCorrect)?.snapshotOptionId ?? "";

  const updateChoice = (
    snapshotOptionId: string,
    change: Partial<TryoutQuestionSnapshotOptionDraft>,
  ) => {
    onUpdate({
      options: question.options.map((option) =>
        option.snapshotOptionId === snapshotOptionId
          ? { ...option, ...change }
          : option,
      ),
    });
  };

  const setCorrectChoice = (snapshotOptionId: string, isCorrect: boolean) => {
    if (question.questionType === "single_choice") {
      onUpdate({
        options: question.options.map((option) => ({
          ...option,
          isCorrect: option.snapshotOptionId === snapshotOptionId,
        })),
      });
      return;
    }

    if (
      !isCorrect &&
      question.options.filter((option) => option.isCorrect).length <= 1
    ) {
      return;
    }
    updateChoice(snapshotOptionId, { isCorrect });
  };

  const updateQuestionType = (value: string) => {
    if (value !== "single_choice" && value !== "multiple_choice") return;
    if (value === "single_choice") {
      const firstCorrect =
        question.options.find((option) => option.isCorrect)?.snapshotOptionId ??
        question.options[0]?.snapshotOptionId;
      onUpdate({
        options: question.options.map((option) => ({
          ...option,
          isCorrect: option.snapshotOptionId === firstCorrect,
        })),
        questionType: value,
      });
      return;
    }
    onUpdate({ questionType: value });
  };

  const moveChoice = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= question.options.length) return;
    const nextOptions = [...question.options];
    const [moved] = nextOptions.splice(index, 1);
    if (!moved) return;
    nextOptions.splice(nextIndex, 0, moved);
    onUpdate({
      options: nextOptions.map((option, sortOrder) => ({
        ...option,
        sortOrder,
      })),
    });
  };

  const addChoice = () => {
    if (question.options.length >= 5) return;
    const usedKeys = new Set(question.options.map((option) => option.choiceKey));
    const nextKey =
      Array.from({ length: 26 }, (_, choiceIndex) =>
        String.fromCharCode(65 + choiceIndex),
      ).find((key) => !usedKeys.has(key)) ?? `P${question.options.length + 1}`;
    onUpdate({
      options: [
        ...question.options,
        {
          assetId: null,
          choiceKey: nextKey,
          content: "",
          isCorrect: false,
          snapshotOptionId: globalThis.crypto.randomUUID(),
          sortOrder: question.options.length,
        },
      ],
    });
  };

  const removeChoice = (snapshotOptionId: string) => {
    if (question.options.length <= 2) return;
    const nextOptions = question.options.filter(
      (option) => option.snapshotOptionId !== snapshotOptionId,
    );
    const firstOptionId = nextOptions.some((option) => option.isCorrect)
      ? null
      : nextOptions[0]?.snapshotOptionId;
    onUpdate({
      options: nextOptions.map((option, sortOrder) => ({
        ...option,
        isCorrect:
          option.isCorrect || option.snapshotOptionId === firstOptionId,
        sortOrder,
      })),
    });
  };

  return {
    addChoice,
    correctOptionId,
    moveChoice,
    removeChoice,
    setCorrectChoice,
    updateChoice,
    updateQuestionType,
  };
}

type TryoutQuestionSnapshotActions = ReturnType<
  typeof useTryoutQuestionSnapshotActions
>;

function TryoutQuestionSnapshotHeader({
  disabled,
  index,
  onMove,
  onRemove,
  question,
  questionCount,
  showInventoryActions,
}: {
  disabled: boolean;
  index: number;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  question: TryoutQuestionSnapshotDraft;
  questionCount: number;
  showInventoryActions: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-secondary-500">
          Soal {index + 1} dari {questionCount}
        </p>
        <h3
          className="mt-1 text-lg font-semibold text-secondary-900"
          id={`tryout-snapshot-question-${question.snapshotId}`}
        >
          Edit soal
        </h3>
      </div>
      {showInventoryActions ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label={`Pindah soal ${index + 1} ke atas`}
            disabled={disabled || index === 0}
            onClick={() => onMove("up")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            aria-label={`Pindah soal ${index + 1} ke bawah`}
            disabled={disabled || index === questionCount - 1}
            onClick={() => onMove("down")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            aria-label={`Hapus soal ${index + 1} dari subtes`}
            disabled={disabled}
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TryoutQuestionPromptFields({
  disabled,
  onUpdate,
  question,
}: {
  disabled: boolean;
  onUpdate: (change: TryoutQuestionChange) => void;
  question: TryoutQuestionSnapshotDraft;
}) {
  return (
    <>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`tryout-prompt-${question.snapshotId}`}
        >
          Pertanyaan <span className="text-danger-500">*</span>
        </FieldLabel>
        <FieldTextarea
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-32 text-sm leading-6`}
          disabled={disabled}
          id={`tryout-prompt-${question.snapshotId}`}
          onChange={(event) => onUpdate({ prompt: event.target.value })}
          required
          value={question.prompt}
        />
      </Field>
      <TryoutQuestionMediaField
        assetId={question.promptAssetId}
        disabled={disabled}
        label="Gambar pertanyaan"
        onChange={(promptAssetId) => onUpdate({ promptAssetId })}
      />
    </>
  );
}

function isTryoutQuestionDifficulty(
  value: string,
): value is TryoutQuestionDifficulty {
  return (
    value === "easy" ||
    value === "medium" ||
    value === "hard" ||
    value === "adaptive"
  );
}

function TryoutQuestionMetadataFields({
  actions,
  disabled,
  onUpdate,
  question,
}: {
  actions: TryoutQuestionSnapshotActions;
  disabled: boolean;
  onUpdate: (change: TryoutQuestionChange) => void;
  question: TryoutQuestionSnapshotDraft;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field>
        <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
          Jenis soal
        </FieldLabel>
        <RadioGroup
          aria-label="Jenis soal"
          className="grid gap-2 sm:grid-cols-2"
          onValueChange={actions.updateQuestionType}
          value={question.questionType}
        >
          {[
            ["single_choice", "Pilihan ganda"],
            ["multiple_choice", "Pilihan ganda kompleks"],
          ].map(([value, label]) => (
            <label
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm text-secondary-800 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              htmlFor={`tryout-type-${question.snapshotId}-${value}`}
              key={value}
            >
              <RadioGroupItem
                disabled={disabled}
                id={`tryout-type-${question.snapshotId}-${value}`}
                value={value}
              />
              {label}
            </label>
          ))}
        </RadioGroup>
      </Field>
      <Field>
        <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
          Tingkat kesulitan
        </FieldLabel>
        <RadioGroup
          aria-label="Tingkat kesulitan"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          onValueChange={(value) => {
            if (isTryoutQuestionDifficulty(value)) {
              onUpdate({ difficulty: value });
            }
          }}
          value={question.difficulty}
        >
          {[
            ["easy", "Mudah"],
            ["medium", "Sedang"],
            ["hard", "Sulit"],
            ["adaptive", "Adaptif"],
          ].map(([value, label]) => (
            <label
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-primary-100 bg-white px-2 py-2 text-xs text-secondary-800 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 sm:px-3 sm:text-sm"
              htmlFor={`tryout-difficulty-${question.snapshotId}-${value}`}
              key={value}
            >
              <RadioGroupItem
                disabled={disabled}
                id={`tryout-difficulty-${question.snapshotId}-${value}`}
                value={value}
              />
              {label}
            </label>
          ))}
        </RadioGroup>
      </Field>
    </div>
  );
}

function TryoutQuestionChoiceEditor({
  actions,
  disabled,
  question,
}: {
  actions: TryoutQuestionSnapshotActions;
  disabled: boolean;
  question: TryoutQuestionSnapshotDraft;
}) {
  const singleChoice = question.questionType === "single_choice";
  return (
    <section
      aria-labelledby={`tryout-choices-${question.snapshotId}`}
      className="grid gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4
            className="text-sm font-semibold text-secondary-900"
            id={`tryout-choices-${question.snapshotId}`}
          >
            Pilihan jawaban
          </h4>
          <p className="mt-1 text-xs leading-5 text-secondary-500">
            {singleChoice
              ? "Pilih satu kunci jawaban."
              : "Pilih satu atau lebih kunci jawaban."}
          </p>
        </div>
        <Button
          disabled={disabled || question.options.length >= 5}
          onClick={actions.addChoice}
          size="sm"
          type="button"
          variant="reference"
        >
          Tambah pilihan
        </Button>
      </div>
      {question.options.length >= 5 ? (
        <p className="text-xs leading-5 text-secondary-500" role="status">
          Setiap soal dapat memiliki paling banyak 5 pilihan jawaban.
        </p>
      ) : null}
      {singleChoice ? (
        <RadioGroup
          aria-label="Kunci jawaban"
          className="grid gap-3"
          onValueChange={(value) => actions.setCorrectChoice(value, true)}
          value={actions.correctOptionId}
        >
          {question.options.map((option, choiceIndex) => (
            <TryoutQuestionOptionCard
              actions={actions}
              choiceIndex={choiceIndex}
              disabled={disabled}
              isSingleChoice
              key={option.snapshotOptionId}
              option={option}
              question={question}
            />
          ))}
        </RadioGroup>
      ) : (
        <div className="grid gap-3">
          {question.options.map((option, choiceIndex) => (
            <TryoutQuestionOptionCard
              actions={actions}
              choiceIndex={choiceIndex}
              disabled={disabled}
              isSingleChoice={false}
              key={option.snapshotOptionId}
              option={option}
              question={question}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TryoutQuestionOptionCard({
  actions,
  choiceIndex,
  disabled,
  isSingleChoice,
  option,
  question,
}: {
  actions: TryoutQuestionSnapshotActions;
  choiceIndex: number;
  disabled: boolean;
  isSingleChoice: boolean;
  option: TryoutQuestionSnapshotOptionDraft;
  question: TryoutQuestionSnapshotDraft;
}) {
  const correctCount = question.options.filter((candidate) => candidate.isCorrect).length;
  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-primary-100 bg-white p-3 sm:p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-sm font-semibold text-primary-800"
        >
          {option.choiceKey}
        </span>
        <Field className="min-w-0 flex-1">
          <FieldLabel
            className="sr-only"
            htmlFor={`tryout-choice-${option.snapshotOptionId}`}
          >
            Teks pilihan {option.choiceKey}
          </FieldLabel>
          <FieldTextarea
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-20 text-sm leading-6`}
            disabled={disabled}
            id={`tryout-choice-${option.snapshotOptionId}`}
            onChange={(event) =>
              actions.updateChoice(option.snapshotOptionId, {
                content: event.target.value,
              })
            }
            value={option.content}
          />
        </Field>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            aria-label={`Pindah pilihan ${option.choiceKey} ke atas`}
            disabled={disabled || choiceIndex === 0}
            onClick={() => actions.moveChoice(choiceIndex, "up")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            aria-label={`Pindah pilihan ${option.choiceKey} ke bawah`}
            disabled={disabled || choiceIndex === question.options.length - 1}
            onClick={() => actions.moveChoice(choiceIndex, "down")}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pl-11">
        <label
          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-secondary-700"
          htmlFor={`tryout-answer-${option.snapshotOptionId}`}
        >
          {isSingleChoice ? (
            <RadioGroupItem
              disabled={disabled}
              id={`tryout-answer-${option.snapshotOptionId}`}
              value={option.snapshotOptionId}
            />
          ) : (
            <Checkbox
              checked={option.isCorrect}
              disabled={disabled || (option.isCorrect && correctCount <= 1)}
              id={`tryout-answer-${option.snapshotOptionId}`}
              onCheckedChange={(checked) =>
                actions.setCorrectChoice(option.snapshotOptionId, checked === true)
              }
            />
          )}
          Kunci jawaban
        </label>
        <Button
          aria-label={`Hapus pilihan ${option.choiceKey}`}
          disabled={disabled || question.options.length <= 2}
          onClick={() => actions.removeChoice(option.snapshotOptionId)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2 />
          Hapus pilihan
        </Button>
      </div>
      <div className="pl-11">
        <TryoutQuestionMediaField
          assetId={option.assetId}
          disabled={disabled}
          label={`Gambar pilihan ${option.choiceKey}`}
          onChange={(assetId) => actions.updateChoice(option.snapshotOptionId, { assetId })}
        />
      </div>
    </div>
  );
}

function TryoutQuestionExplanationFields({
  disabled,
  onUpdate,
  question,
}: {
  disabled: boolean;
  onUpdate: (change: TryoutQuestionChange) => void;
  question: TryoutQuestionSnapshotDraft;
}) {
  return (
    <>
      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`tryout-explanation-${question.snapshotId}`}
        >
          Pembahasan
        </FieldLabel>
        <FieldTextarea
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-28 text-sm leading-6`}
          disabled={disabled}
          id={`tryout-explanation-${question.snapshotId}`}
          onChange={(event) => onUpdate({ explanation: event.target.value })}
          value={question.explanation ?? ""}
        />
      </Field>
      <TryoutQuestionMediaField
        assetId={question.explanationAssetId}
        disabled={disabled}
        label="Gambar pembahasan"
        onChange={(explanationAssetId) => onUpdate({ explanationAssetId })}
      />
    </>
  );
}

function TryoutQuestionSnapshotEditor({
  index,
  onMove,
  onRemove,
  onUpdate,
  question,
  questionCount,
  showInventoryActions = true,
  readOnly,
  saving,
}: {
  index: number;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onUpdate: (change: TryoutQuestionChange) => void;
  question: TryoutQuestionSnapshotDraft;
  questionCount: number;
  showInventoryActions?: boolean;
  readOnly: boolean;
  saving: boolean;
}) {
  const disabled = readOnly || saving;
  const {
    addChoice,
    correctOptionId,
    moveChoice,
    removeChoice,
    setCorrectChoice,
    updateChoice,
    updateQuestionType,
  } = useTryoutQuestionSnapshotActions(question, onUpdate);

  return (
    <ReferenceSurface
      as="section"
      aria-labelledby={`tryout-snapshot-question-${question.snapshotId}`}
      className="grid min-w-0 gap-5 p-4 sm:p-6"
    >
      <TryoutQuestionSnapshotHeader
        disabled={disabled}
        index={index}
        onMove={onMove}
        onRemove={onRemove}
        question={question}
        questionCount={questionCount}
        showInventoryActions={showInventoryActions}
      />

      <TryoutQuestionPromptFields
        disabled={disabled}
        onUpdate={onUpdate}
        question={question}
      />

      <TryoutQuestionMetadataFields
        actions={{
          addChoice,
          correctOptionId,
          moveChoice,
          removeChoice,
          setCorrectChoice,
          updateChoice,
          updateQuestionType,
        }}
        disabled={disabled}
        onUpdate={onUpdate}
        question={question}
      />

      <TryoutQuestionChoiceEditor
        actions={{
          addChoice,
          correctOptionId,
          moveChoice,
          removeChoice,
          setCorrectChoice,
          updateChoice,
          updateQuestionType,
        }}
        disabled={disabled}
        question={question}
      />

      <TryoutQuestionExplanationFields
        disabled={disabled}
        onUpdate={onUpdate}
        question={question}
      />
    </ReferenceSurface>
  );
}

function TryoutQuestionContentEditor({
  onUpdate,
  question,
  readOnly,
  saving,
}: {
  onUpdate: (change: TryoutQuestionChange) => void;
  question: TryoutQuestionSnapshotDraft;
  readOnly: boolean;
  saving: boolean;
}) {
  const [mediaTarget, setMediaTarget] = useState<QuestionMediaTarget | null>(null);
  const editorQuestion = asContentEditorQuestion(question);
  const disabled = readOnly || saving;
  const selectedAssetId = mediaTarget?.field === "prompt"
    ? question.promptAssetId
    : mediaTarget?.field === "explanation"
      ? question.explanationAssetId
      : mediaTarget?.field === "choice"
        ? question.options.find(
            (option) => option.snapshotOptionId === mediaTarget.choiceId,
          )?.assetId
        : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-tryout-question-content-editor={disabled ? "disabled" : "enabled"}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-secondary-900">Edit soal</h2>
      </div>
      <QuestionContentEditor
        disabled={disabled}
        idPrefix="tryout"
        onOpenMedia={setMediaTarget}
        question={editorQuestion}
        updateQuestion={(_questionId, update) => {
          onUpdate(toTryoutQuestionChange(update(editorQuestion)));
        }}
      />
      <MediaPickerDialog
        allowedMimeTypes={imageMediaMimeTypes}
        onOpenChange={(open) => {
          if (!open) setMediaTarget(null);
        }}
        onSelect={(asset: MediaAssetDto) => {
          if (!mediaTarget) return;
          onUpdate(toTryoutQuestionChange(
            setQuestionMediaAsset(editorQuestion, mediaTarget, asset.id),
          ));
        }}
        open={Boolean(mediaTarget) && !disabled}
        selectedAssetId={selectedAssetId ?? undefined}
        title={mediaTarget?.label ?? "Pilih gambar"}
      />
    </div>
  );
}

function useTryoutQuestionImportSelection({
  browseBankId,
  disabled,
  onImport,
  onOpenChange,
}: {
  browseBankId: string | null;
  disabled: boolean;
  onImport: TryoutSectionQuestionManagerProps["onImport"];
  onOpenChange: (open: boolean) => void;
}) {
  const [importing, setImporting] = useState(false);
  const [allInBank, setAllInBank] = useState(false);
  const [selectedRevisions, setSelectedRevisions] = useState(
    new Map<string, TryoutExpectedSourceRevision>(),
  );
  const [importError, setImportError] = useState<string | null>(null);
  const selectionCount = selectedRevisions.size;
  const canImport = Boolean(
    browseBankId &&
      (allInBank || selectionCount > 0) &&
      !importing &&
      !disabled,
  );

  const toggleQuestion = (question: TryoutSourceQuestion) => {
    setImportError(null);
    const revisionId = question.questionRevisionId;
    const contentDigest = question.questionContentDigest;
    if (!selectedRevisions.has(question.id) && (!revisionId || !contentDigest)) {
      setImportError(
        "Soal ini belum siap dipilih. Muat ulang daftar, lalu coba lagi.",
      );
      return;
    }
    setSelectedRevisions((current) => {
      const next = new Map(current);
      if (next.has(question.id)) {
        next.delete(question.id);
        return next;
      }
      if (!revisionId || !contentDigest) return next;
      next.set(question.id, {
        contentDigest,
        questionId: question.id,
        revisionId,
      });
      return next;
    });
  };

  const runImport = async () => {
    if (!browseBankId || !canImport) return;
    setImporting(true);
    setImportError(null);
    try {
      const request: TryoutQuestionImportRequest = allInBank
        ? { allInBank: true, bankId: browseBankId }
        : {
            bankId: browseBankId,
            expectedSourceRevisions: Array.from(selectedRevisions.values()),
            questionIds: Array.from(selectedRevisions.keys()),
          };
      const outcome = await onImport(request);
      if (!outcome.ok) {
        setImportError(outcome.message);
        return;
      }
      if (!outcome.importedCount || !outcome.snapshots.length) {
        setImportError(
          "Tidak ada soal siap yang dapat ditambahkan dari Bank Soal ini. Pilih bank lain atau muat ulang daftar soal.",
        );
        return;
      }
      setSelectedRevisions(new Map());
      setAllInBank(false);
      onOpenChange(false);
    } catch {
      setImportError(
        "Soal belum berhasil ditambahkan dari Bank Soal. Muat ulang daftar lalu coba lagi.",
      );
    } finally {
      setImporting(false);
    }
  };

  const selectAllInBank = (checked: boolean) => {
    setSelectedRevisions(new Map());
    setAllInBank(checked);
    setImportError(null);
  };

  return {
    allInBank,
    canImport,
    importError,
    importing,
    runImport,
    selectAllInBank,
    selectedRevisions,
    selectionCount,
    setImportError,
    toggleQuestion,
  };
}

function TryoutQuestionImportBankSelector({
  activeBrowseBank,
  browseBankId,
  disabled,
  importing,
  onBankPageNext,
  onBankSearchChange,
  onClearError,
  onSelectBank,
  guardExternalNavigation,
  sectionSubject,
  sourceBankLoading,
  sourceBankSearch,
  sourceBankTotal,
  sourceBanks,
}: {
  activeBrowseBank?: TryoutSourceBank;
  browseBankId: string | null;
  disabled: boolean;
  importing: boolean;
  onBankPageNext: () => void;
  onBankSearchChange: (search: string) => void;
  onClearError: () => void;
  onSelectBank: (bankId: string) => void;
  guardExternalNavigation: TryoutSectionQuestionManagerProps["guardExternalNavigation"];
  sectionSubject: string;
  sourceBankLoading: boolean;
  sourceBankSearch: string;
  sourceBankTotal: number;
  sourceBanks: TryoutSourceBank[];
}) {
  return (
    <div className="grid shrink-0 gap-2">
      <p className="text-xs font-bold tracking-[0.12em] text-secondary-500 uppercase">
        Bank Soal Tryout
      </p>
      <Popover>
        <PopoverTrigger
          disabled={disabled || importing || sourceBankLoading}
          render={
            <Button
              className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full justify-between`}
              type="button"
              variant="reference"
            />
          }
        >
          <span className="min-w-0 truncate">
            {activeBrowseBank?.title ??
              (browseBankId ? "Memuat Bank Soal…" : "Pilih Bank Soal")}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(34rem,calc(100vw-2rem))] gap-3"
        >
          <FieldInput
            aria-label="Cari Bank Soal Tryout"
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11`}
            disabled={disabled || importing}
            onChange={(event) => onBankSearchChange(event.target.value)}
            placeholder="Cari judul, folder, atau materi…"
            value={sourceBankSearch}
          />
          {sourceBankLoading ? (
            <p className="px-2 text-xs text-secondary-500">
              Memuat Bank Soal…
            </p>
          ) : null}
          <div
            aria-label="Bank Soal Tryout"
            className="grid max-h-64 gap-1 overflow-y-auto"
            role="group"
          >
            <SourceBankList
              activeSectionSubtest={sectionSubject}
              browseBankId={browseBankId}
              disabled={importing || disabled}
              guardExternalNavigation={guardExternalNavigation}
              onSelectBank={(bankId) => {
                onClearError();
                onSelectBank(bankId);
              }}
              sourceBanks={sourceBanks}
            />
          </div>
          {sourceBankTotal > sourceBanks.length ? (
            <Button
              className="w-full"
              disabled={importing || disabled || sourceBankLoading}
              onClick={onBankPageNext}
              size="sm"
              type="button"
              variant="reference"
            >
              {sourceBankLoading ? "Memuat…" : "Muat Bank Soal lain"}
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TryoutQuestionImportFilters({
  allInBank,
  browseBankId,
  disabled,
  importing,
  onQuestionSearchChange,
  onSelectAll,
  sectionSubject,
  selectionCount,
  sourceQuestionSearch,
  sourceQuestionTotal,
}: {
  allInBank: boolean;
  browseBankId: string | null;
  disabled: boolean;
  importing: boolean;
  onQuestionSearchChange: (search: string) => void;
  onSelectAll: (checked: boolean) => void;
  sectionSubject: string;
  selectionCount: number;
  sourceQuestionSearch: string;
  sourceQuestionTotal: number;
}) {
  return (
    <div className="grid shrink-0 gap-3">
      <div className="relative min-w-[min(100%,20rem)]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
        <FieldInput
          aria-label="Cari soal di bank ini"
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 pl-9`}
          disabled={importing || disabled || !browseBankId}
          onChange={(event) => onQuestionSearchChange(event.target.value)}
          placeholder={
            browseBankId
              ? `Cari soal ${sectionSubject}…`
              : "Pilih Bank Soal terlebih dahulu"
          }
          value={sourceQuestionSearch}
        />
      </div>
      {browseBankId && sourceQuestionTotal > 0 ? (
        <label
          className={`flex min-h-11 w-fit max-w-full items-center gap-3 text-sm text-secondary-900 ${importing || disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
          htmlFor={`tryout-all-in-bank-${sectionSubject}`}
        >
          <Checkbox
            checked={allInBank}
            disabled={importing || disabled}
            id={`tryout-all-in-bank-${sectionSubject}`}
            indeterminate={!allInBank && selectionCount > 0}
            onCheckedChange={(checked) => onSelectAll(checked === true)}
          />
          <span>Pilih semua</span>
        </label>
      ) : null}
    </div>
  );
}

function TryoutQuestionImportResults({
  activeSourceQuestions,
  allInBank,
  browseBankId,
  disabled,
  importError,
  importing,
  onPageChange,
  sourceQuestionLoading,
  sourceQuestionPage,
  sourceQuestionPageCount,
  sourceQuestionTotal,
  toggleQuestion,
  selectedRevisions,
}: {
  activeSourceQuestions: TryoutSourceQuestion[];
  allInBank: boolean;
  browseBankId: string | null;
  disabled: boolean;
  importError: string | null;
  importing: boolean;
  onPageChange: (page: number) => void;
  sourceQuestionLoading: boolean;
  sourceQuestionPage: number;
  sourceQuestionPageCount: number;
  sourceQuestionTotal: number;
  toggleQuestion: (question: TryoutSourceQuestion) => void;
  selectedRevisions: Map<string, TryoutExpectedSourceRevision>;
}) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="grid gap-3">
        {sourceQuestionLoading ? (
          <p aria-live="polite" className="text-xs text-secondary-500">
            Memuat soal siap…
          </p>
        ) : null}
        {importError ? (
          <div
            className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
            role="alert"
          >
            {importError}
          </div>
        ) : null}
        {!sourceQuestionLoading && !activeSourceQuestions.length ? (
          <ReferenceSurface className="px-4 py-10 text-center" variant="inset">
            <p className="text-sm font-semibold text-secondary-900">
              {browseBankId
                ? "Tidak ada soal siap yang cocok"
                : "Pilih Bank Soal untuk mulai memilih"}
            </p>
            <p className="mt-1 text-sm leading-6 text-secondary-500">
              Periksa pencarian atau pilih Bank Soal lain yang sesuai.
            </p>
          </ReferenceSurface>
        ) : null}
        {activeSourceQuestions.length ? (
          <div className="grid gap-2">
            {activeSourceQuestions.map((question) => {
              const selected = allInBank || selectedRevisions.has(question.id);
              const rowDisabled =
                importing ||
                disabled ||
                allInBank ||
                sourceQuestionLoading ||
                ((!question.questionRevisionId ||
                  !question.questionContentDigest) &&
                  !selected);
              return (
                <QuestionBankPickerRow
                  allInBank={allInBank}
                  checkboxId={`tryout-source-question-${question.id}`}
                  difficulty={difficultyLabel(question.difficulty)}
                  disabled={rowDisabled}
                  key={question.id}
                  onToggle={() => toggleQuestion(question)}
                  prompt={question.prompt}
                  selected={selected}
                  subjectCode={question.subjectCode}
                />
              );
            })}
          </div>
        ) : null}
        {browseBankId && sourceQuestionTotal > 0 ? (
          <PaginationControls
            onPageChange={onPageChange}
            page={sourceQuestionPage}
            pageCount={sourceQuestionPageCount}
          />
        ) : null}
      </div>
    </div>
  );
}

function TryoutQuestionImportFooter({
  allInBank,
  canImport,
  importing,
  onImport,
  selectedCount,
}: {
  allInBank: boolean;
  canImport: boolean;
  importing: boolean;
  onImport: () => void;
  selectedCount: number;
}) {
  return (
    <DialogFooter className={QUESTION_BANK_PICKER_FOOTER_CLASS_NAME}>
      <span aria-live="polite" className="text-sm font-semibold text-secondary-700">
        {allInBank ? "Semua soal siap dipilih" : `${selectedCount} soal dipilih`}
      </span>
      <Button
        aria-busy={importing}
        disabled={!canImport}
        onClick={onImport}
        type="button"
        variant="brand"
      >
        {importing ? "Menambahkan…" : "Tambahkan"}
      </Button>
    </DialogFooter>
  );
}

function TryoutQuestionImportDialog({
  activeBrowseBank,
  activeSourceQuestions,
  browseBankId,
  disabled,
  guardExternalNavigation,
  hideTrigger = false,
  onOpenChange,
  open,
  onBankPageNext,
  onBankSearchChange,
  onImport,
  onQuestionPageChange,
  onQuestionSearchChange,
  onSelectBank,
  sectionSubject,
  sourceBankLoading,
  sourceBankSearch,
  sourceBankTotal,
  sourceBanks,
  sourceQuestionLoading,
  sourceQuestionPage,
  sourceQuestionSearch,
  sourceQuestionTotal,
}: Pick<
  TryoutSectionQuestionManagerProps,
  | "activeBrowseBank"
  | "activeSourceQuestions"
  | "browseBankId"
  | "guardExternalNavigation"
  | "onBankPageNext"
  | "onBankSearchChange"
  | "onImport"
  | "onQuestionPageChange"
  | "onQuestionSearchChange"
  | "onSelectBank"
  | "sectionSubject"
  | "sourceBankLoading"
  | "sourceBankSearch"
  | "sourceBankTotal"
  | "sourceBanks"
  | "sourceQuestionLoading"
  | "sourceQuestionPage"
  | "sourceQuestionSearch"
  | "sourceQuestionTotal"
> & {
  disabled: boolean;
  hideTrigger?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const {
    allInBank,
    canImport,
    importError,
    importing,
    runImport,
    selectAllInBank,
    selectedRevisions,
    selectionCount,
    setImportError,
    toggleQuestion,
  } = useTryoutQuestionImportSelection({
    browseBankId,
    disabled,
    onImport,
    onOpenChange,
  });
  const sourceQuestionPageCount = Math.max(
    1,
    Math.ceil(sourceQuestionTotal / TRYOUT_SOURCE_QUESTION_PAGE_SIZE),
  );

  return (
    <>
      {!hideTrigger ? (
        <Button
          disabled={importing || disabled}
          onClick={() => {
            setImportError(null);
            onOpenChange(true);
          }}
          type="button"
          variant="brand"
        >
          <Search aria-hidden="true" />
          Tambah dari Bank Soal
        </Button>
      ) : null}
      <Dialog
        onOpenChange={(nextOpen) => {
          if (importing) return;
          onOpenChange(nextOpen);
          if (nextOpen) setImportError(null);
        }}
        open={open}
      >
        <DialogContent
          className={QUESTION_BANK_PICKER_DIALOG_CLASS_NAME}
          pending={importing}
        >
          <DialogHeader>
            <DialogTitle>Tambah soal dari Bank Soal</DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            <TryoutQuestionImportBankSelector
              activeBrowseBank={activeBrowseBank}
              browseBankId={browseBankId}
              disabled={disabled}
              guardExternalNavigation={guardExternalNavigation}
              importing={importing}
              onBankPageNext={onBankPageNext}
              onBankSearchChange={onBankSearchChange}
              onClearError={() => setImportError(null)}
              onSelectBank={onSelectBank}
              sectionSubject={sectionSubject}
              sourceBankLoading={sourceBankLoading}
              sourceBankSearch={sourceBankSearch}
              sourceBankTotal={sourceBankTotal}
              sourceBanks={sourceBanks}
            />
            <TryoutQuestionImportFilters
              allInBank={allInBank}
              browseBankId={browseBankId}
              disabled={disabled}
              importing={importing}
              onQuestionSearchChange={onQuestionSearchChange}
              onSelectAll={selectAllInBank}
              sectionSubject={sectionSubject}
              selectionCount={selectionCount}
              sourceQuestionSearch={sourceQuestionSearch}
              sourceQuestionTotal={sourceQuestionTotal}
            />
            <TryoutQuestionImportResults
              activeSourceQuestions={activeSourceQuestions}
              allInBank={allInBank}
              browseBankId={browseBankId}
              disabled={disabled}
              importError={importError}
              importing={importing}
              onPageChange={onQuestionPageChange}
              selectedRevisions={selectedRevisions}
              sourceQuestionLoading={sourceQuestionLoading}
              sourceQuestionPage={sourceQuestionPage}
              sourceQuestionPageCount={sourceQuestionPageCount}
              sourceQuestionTotal={sourceQuestionTotal}
              toggleQuestion={toggleQuestion}
            />
          </div>
          <TryoutQuestionImportFooter
            allInBank={allInBank}
            canImport={canImport && Boolean(activeBrowseBank)}
            importing={importing}
            onImport={() => void runImport()}
            selectedCount={selectionCount}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function isEditableSnapshot(
  question: TryoutDirectQuestionDraft,
): question is TryoutQuestionSnapshotDraft {
  return (
    isSnapshotQuestion(question) &&
    question.options.every((option) => Boolean(option.snapshotOptionId))
  );
}

type TryoutQuestionManagerViewProps = Pick<
  TryoutSectionQuestionManagerProps,
  "onMoveQuestion" | "onUpdateQuestion" | "saving" | "sectionSubject"
> & {
  activeQuestion: TryoutQuestionSnapshotDraft | undefined;
  activeQuestionIndex: number;
  currentSnapshotId: string;
  directEditingAvailable: boolean;
  editable: boolean;
  importDialog: ReactNode;
  legacyQuestions: TryoutLegacyQuestionDraft[];
  onOpenImport: () => void;
  onRemoveSnapshot: (snapshotId: string) => void;
  onSelectSnapshot: (snapshotId: string) => void;
  questions: TryoutDirectQuestionDraft[];
  snapshotQuestions: TryoutQuestionSnapshotDraft[];
};

export function TryoutSectionQuestionManager({
  activeBrowseBank,
  activeSourceQuestions,
  browseBankId,
  draftLocked,
  guardExternalNavigation,
  onBankPageNext,
  onBankSearchChange,
  onImport,
  onMoveQuestion,
  onQuestionPageChange,
  onQuestionSearchChange,
  onRemoveQuestion,
  onSelectBank,
  onUpdateQuestion,
  packageVersionId,
  presentation = "embedded",
  questions,
  readOnly,
  saving,
  sectionSubject,
  sourceBankLoading,
  sourceBankSearch,
  sourceBankTotal,
  sourceBanks,
  sourceQuestionLoading,
  sourceQuestionPage,
  sourceQuestionSearch,
  sourceQuestionTotal,
}: TryoutSectionQuestionManagerProps) {
  const snapshotQuestions = useMemo(
    () => questions.filter(isEditableSnapshot),
    [questions],
  );
  const legacyQuestions = useMemo(
    () => questions.filter(
      (question): question is TryoutLegacyQuestionDraft => !isSnapshotQuestion(question),
    ),
    [questions],
  );
  const [activeSnapshotId, setActiveSnapshotId] = useState(
    snapshotQuestions[0]?.snapshotId ?? "",
  );
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const directEditingAvailable =
    !readOnly && !draftLocked && !packageVersionId;
  const editable = directEditingAvailable && !saving;

  const currentSnapshotId = snapshotQuestions.some(
    (question) => question.snapshotId === activeSnapshotId,
  ) ? activeSnapshotId : (snapshotQuestions[0]?.snapshotId ?? "");
  const activeQuestionIndex = snapshotQuestions.findIndex(
    (question) => question.snapshotId === currentSnapshotId,
  );
  const activeQuestion = snapshotQuestions[activeQuestionIndex];

  const removeSnapshot = (snapshotId: string) => {
    const index = snapshotQuestions.findIndex(
      (question) => question.snapshotId === snapshotId,
    );
    const nextQuestion = snapshotQuestions[index + 1] ?? snapshotQuestions[index - 1];
    onRemoveQuestion(snapshotId);
    setActiveSnapshotId(nextQuestion?.snapshotId ?? "");
  };

  const importSelectedQuestions = async (
    request: TryoutQuestionImportRequest,
  ) => {
    const outcome = await onImport(request);
    if (outcome.ok) {
      setActiveSnapshotId(outcome.snapshots[0]?.snapshotId ?? "");
    }
    return outcome;
  };

  const importDialog = directEditingAvailable ? (
    <TryoutQuestionImportDialog
      activeBrowseBank={activeBrowseBank}
      activeSourceQuestions={activeSourceQuestions}
      browseBankId={browseBankId}
      key={browseBankId ?? "no-bank"}
      disabled={saving}
      guardExternalNavigation={guardExternalNavigation}
      hideTrigger={presentation === "workspace"}
      onBankPageNext={onBankPageNext}
      onBankSearchChange={onBankSearchChange}
      onImport={importSelectedQuestions}
      onOpenChange={setImportDialogOpen}
      onQuestionPageChange={onQuestionPageChange}
      onQuestionSearchChange={onQuestionSearchChange}
      onSelectBank={onSelectBank}
      open={importDialogOpen}
      sectionSubject={sectionSubject}
      sourceBankLoading={sourceBankLoading}
      sourceBankSearch={sourceBankSearch}
      sourceBankTotal={sourceBankTotal}
      sourceBanks={sourceBanks}
      sourceQuestionLoading={sourceQuestionLoading}
      sourceQuestionPage={sourceQuestionPage}
      sourceQuestionSearch={sourceQuestionSearch}
      sourceQuestionTotal={sourceQuestionTotal}
    />
  ) : null;
  const viewProps = {
    activeQuestion,
    activeQuestionIndex,
    currentSnapshotId,
    directEditingAvailable,
    editable,
    importDialog,
    legacyQuestions,
    onMoveQuestion,
    onOpenImport: () => setImportDialogOpen(true),
    onRemoveSnapshot: removeSnapshot,
    onSelectSnapshot: setActiveSnapshotId,
    onUpdateQuestion,
    questions,
    saving,
    sectionSubject,
    snapshotQuestions,
  };

  return presentation === "workspace" ? (
    <TryoutQuestionWorkspaceView {...viewProps} />
  ) : (
    <TryoutQuestionPanelView {...viewProps} />
  );
}

function TryoutQuestionWorkspaceView({
  activeQuestion,
  currentSnapshotId,
  directEditingAvailable,
  editable,
  importDialog,
  legacyQuestions,
  onMoveQuestion,
  onOpenImport,
  onRemoveSnapshot,
  onSelectSnapshot,
  onUpdateQuestion,
  questions,
  saving,
  sectionSubject,
  snapshotQuestions,
}: TryoutQuestionManagerViewProps) {
  const inventoryProps = {
    activeQuestionId: currentSnapshotId,
    addDisabled: saving,
    addVisible: directEditingAvailable,
    countLabel: `${questions.length} soal di subtes ${sectionSubject}`,
    disabled: !editable,
    emptyLabel: "Belum ada soal di subtes ini.",
    idPrefix: "tryout",
    onAdd: onOpenImport,
    onDelete: onRemoveSnapshot,
    onMove: onMoveQuestion,
    onSelect: onSelectSnapshot,
    questions: snapshotQuestions.map((question) => ({
      id: question.snapshotId,
      prompt: question.prompt,
    })),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-tryout-question-workspace="true">
      <QuestionEditorWorkspace
        inventory={<EditorQuestionInventory {...inventoryProps} />}
        mainId="tryout-question-editor-main"
        mobileInventory={<EditorMobileInventory {...inventoryProps} />}
      >
        {legacyQuestions.length > 0 ? (
          <TryoutLegacyQuestionNotice
            description="Soal ini tetap tercantum dan hanya dapat dilihat. Soal baru dari Bank Soal dapat disunting langsung di Tryout."
            questions={legacyQuestions}
          />
        ) : null}
        {activeQuestion ? (
          <TryoutQuestionContentEditor
            key={activeQuestion.snapshotId}
            onUpdate={(change) => onUpdateQuestion(activeQuestion.snapshotId, change)}
            question={activeQuestion}
            readOnly={!editable}
            saving={saving}
          />
        ) : snapshotQuestions.length > 0 || legacyQuestions.length === 0 ? (
          <TryoutQuestionWorkspaceEmptyState
            canAdd={directEditingAvailable}
            hasSnapshots={snapshotQuestions.length > 0}
            onAdd={onOpenImport}
            noQuestions={questions.length === 0}
          />
        ) : null}
      </QuestionEditorWorkspace>
      {importDialog}
    </div>
  );
}

function TryoutQuestionWorkspaceEmptyState({
  canAdd,
  hasSnapshots,
  noQuestions,
  onAdd,
}: {
  canAdd: boolean;
  hasSnapshots: boolean;
  noQuestions: boolean;
  onAdd: () => void;
}) {
  return (
    <ReferenceSurface
      className="grid min-h-72 place-items-center p-8 text-center"
      data-tryout-question-empty={noQuestions ? "true" : undefined}
      variant="inset"
    >
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold text-secondary-900">
          {hasSnapshots ? "Pilih soal untuk ditinjau" : "Belum ada soal di subtes ini"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-secondary-500">
          {hasSnapshots
            ? "Pilih salinan soal dari daftar inventori untuk mengedit isinya."
            : "Tambahkan soal dari Bank Soal untuk mulai menyusun subtes ini."}
        </p>
        {!hasSnapshots && canAdd ? (
          <Button className="mt-5" onClick={onAdd} size="sm" type="button" variant="brand">
            <Plus aria-hidden="true" />Tambah dari Bank Soal
          </Button>
        ) : null}
      </div>
    </ReferenceSurface>
  );
}

function TryoutLegacyQuestionNotice({
  description,
  questions,
}: {
  description: string;
  questions: TryoutLegacyQuestionDraft[];
}) {
  return (
    <ReferenceSurface
      className="grid gap-2 p-4 text-sm leading-6 text-secondary-700"
      role="status"
      variant="inset"
    >
      <p className="font-semibold text-secondary-900">Soal tersimpan sebelumnya</p>
      <p>{description}</p>
      <ul className="m-0 grid list-disc gap-1 pl-5">
        {questions.map((question) => (
          <li className="break-words" key={question.sourceQuestionId}>
            {question.prompt || "Soal tanpa pertanyaan"}
          </li>
        ))}
      </ul>
    </ReferenceSurface>
  );
}

function TryoutQuestionPanelView({
  activeQuestion,
  activeQuestionIndex,
  currentSnapshotId,
  editable,
  importDialog,
  legacyQuestions,
  onMoveQuestion,
  onRemoveSnapshot,
  onSelectSnapshot,
  onUpdateQuestion,
  saving,
  sectionSubject,
  snapshotQuestions,
}: TryoutQuestionManagerViewProps) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-secondary-900">
            Soal di subtes {sectionSubject}
          </h3>
          <p className="mt-1 text-sm leading-6 text-secondary-500">
            {snapshotQuestions.length} salinan soal
          </p>
        </div>
        {importDialog}
      </div>

      {legacyQuestions.length ? (
        <TryoutLegacyQuestionNotice
          description="Soal ini tetap tercantum dan hanya dapat dilihat. Soal baru yang ditambahkan dari Bank Soal dapat disunting langsung di Tryout."
          questions={legacyQuestions}
        />
      ) : null}

      {activeQuestion ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.5fr)]">
          <ReferenceSurface
            as="aside"
            aria-label={`Daftar salinan soal ${sectionSubject}`}
            className="grid min-w-0 content-start gap-2 p-3"
            variant="inset"
          >
            <h4 className="px-2 py-1 text-xs font-semibold text-secondary-600">
              Pilih soal untuk diedit
            </h4>
            <ol className="m-0 grid min-w-0 list-none gap-1 p-0">
              {snapshotQuestions.map((question, index) => (
                <li className="min-w-0" key={question.snapshotId}>
                  <Button
                    aria-current={question.snapshotId === currentSnapshotId ? "true" : undefined}
                    className="h-auto min-h-12 w-full min-w-0 justify-start rounded-xl px-3 py-2 text-left"
                    onClick={() => onSelectSnapshot(question.snapshotId)}
                    type="button"
                    variant={question.snapshotId === currentSnapshotId ? "contextSelected" : "ghost"}
                  >
                    <span className="mr-2 grid size-7 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {question.prompt || "Soal tanpa pertanyaan"}
                    </span>
                  </Button>
                </li>
              ))}
            </ol>
          </ReferenceSurface>
          <TryoutQuestionSnapshotEditor
            index={activeQuestionIndex}
            onMove={(direction) => onMoveQuestion(activeQuestion.snapshotId, direction)}
            onRemove={() => onRemoveSnapshot(activeQuestion.snapshotId)}
            onUpdate={(change) => onUpdateQuestion(activeQuestion.snapshotId, change)}
            question={activeQuestion}
            questionCount={snapshotQuestions.length}
            readOnly={!editable}
            saving={saving}
          />
        </div>
      ) : legacyQuestions.length === 0 ? (
        <ReferenceSurface
          className="px-4 py-10 text-center text-sm leading-6 text-secondary-500"
          variant="inset"
        >
          {editable
            ? "Belum ada soal di subtes ini. Tambahkan soal dari Bank Soal untuk mulai mengeditnya."
            : "Belum ada soal yang tersimpan untuk subtes ini."}
        </ReferenceSurface>
      ) : null}
    </div>
  );
}
