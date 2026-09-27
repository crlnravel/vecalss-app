"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  Search,
  Trash2,
} from "@/lib/icons";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { MentorBadge } from "@/components/ui/mentor-badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

function questionTypeLabel(questionType?: TryoutQuestionType) {
  return questionType === "multiple_choice"
    ? "Pilihan ganda kompleks"
    : "Pilihan ganda";
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
    <Button
      aria-selected={browseBankId === bank.id}
      className="h-auto justify-start rounded-xl px-3 py-2.5 text-left"
      disabled={disabled}
      key={bank.id}
      onClick={() => onSelectBank(bank.id)}
      role="option"
      variant={browseBankId === bank.id ? "contextSelected" : "ghost"}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{bank.title}</span>
        <span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">
          {bank.questionCount} soal
          {bank.folderPath?.length
            ? ` · ${bank.folderPath.map((item) => item.name).join(" / ")}`
            : ""}
        </span>
      </span>
      {browseBankId === bank.id ? (
        <Check aria-hidden="true" className="ml-auto size-4 shrink-0 text-primary-700" />
      ) : null}
    </Button>
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

function TryoutQuestionSnapshotEditor({
  index,
  onMove,
  onRemove,
  onUpdate,
  question,
  questionCount,
  readOnly,
  saving,
}: {
  index: number;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onUpdate: (change: TryoutQuestionChange) => void;
  question: TryoutQuestionSnapshotDraft;
  questionCount: number;
  readOnly: boolean;
  saving: boolean;
}) {
  const disabled = readOnly || saving;
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

  return (
    <ReferenceSurface
      as="section"
      aria-labelledby={`tryout-snapshot-question-${question.snapshotId}`}
      className="grid min-w-0 gap-5 p-4 sm:p-6"
    >
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
      </div>

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

      <div className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
            Jenis soal
          </FieldLabel>
          <RadioGroup
            aria-label="Jenis soal"
            className="grid gap-2 sm:grid-cols-2"
            onValueChange={updateQuestionType}
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
              if (
                value === "easy" ||
                value === "medium" ||
                value === "hard" ||
                value === "adaptive"
              ) {
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

      <section aria-labelledby={`tryout-choices-${question.snapshotId}`} className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4
              className="text-sm font-semibold text-secondary-900"
              id={`tryout-choices-${question.snapshotId}`}
            >
              Pilihan jawaban
            </h4>
            <p className="mt-1 text-xs leading-5 text-secondary-500">
              {question.questionType === "single_choice"
                ? "Pilih satu kunci jawaban."
                : "Pilih satu atau lebih kunci jawaban."}
            </p>
          </div>
          <Button
            disabled={disabled || question.options.length >= 5}
            onClick={addChoice}
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

        {question.questionType === "single_choice" ? (
          <RadioGroup
            aria-label="Kunci jawaban"
            className="grid gap-3"
            onValueChange={(value) => setCorrectChoice(value, true)}
            value={correctOptionId}
          >
            {question.options.map((option, choiceIndex) => (
              <div
                className="grid min-w-0 gap-3 rounded-2xl border border-primary-100 bg-white p-3 sm:p-4"
                key={option.snapshotOptionId}
              >
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
                        updateChoice(option.snapshotOptionId, {
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
                      onClick={() => moveChoice(choiceIndex, "up")}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`Pindah pilihan ${option.choiceKey} ke bawah`}
                      disabled={disabled || choiceIndex === question.options.length - 1}
                      onClick={() => moveChoice(choiceIndex, "down")}
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
                    <RadioGroupItem
                      disabled={disabled}
                      id={`tryout-answer-${option.snapshotOptionId}`}
                      value={option.snapshotOptionId}
                    />
                    Kunci jawaban
                  </label>
                  <Button
                    aria-label={`Hapus pilihan ${option.choiceKey}`}
                    disabled={disabled || question.options.length <= 2}
                    onClick={() => removeChoice(option.snapshotOptionId)}
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
                    onChange={(assetId) =>
                      updateChoice(option.snapshotOptionId, { assetId })
                    }
                  />
                </div>
              </div>
            ))}
          </RadioGroup>
        ) : (
          <div className="grid gap-3">
            {question.options.map((option, choiceIndex) => (
              <div
                className="grid min-w-0 gap-3 rounded-2xl border border-primary-100 bg-white p-3 sm:p-4"
                key={option.snapshotOptionId}
              >
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
                        updateChoice(option.snapshotOptionId, {
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
                      onClick={() => moveChoice(choiceIndex, "up")}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`Pindah pilihan ${option.choiceKey} ke bawah`}
                      disabled={disabled || choiceIndex === question.options.length - 1}
                      onClick={() => moveChoice(choiceIndex, "down")}
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
                    <Checkbox
                      checked={option.isCorrect}
                      disabled={
                        disabled ||
                        (option.isCorrect &&
                          question.options.filter((candidate) => candidate.isCorrect)
                            .length <= 1)
                      }
                      id={`tryout-answer-${option.snapshotOptionId}`}
                      onCheckedChange={(checked) =>
                        setCorrectChoice(option.snapshotOptionId, checked === true)
                      }
                    />
                    Kunci jawaban
                  </label>
                  <Button
                    aria-label={`Hapus pilihan ${option.choiceKey}`}
                    disabled={disabled || question.options.length <= 2}
                    onClick={() => removeChoice(option.snapshotOptionId)}
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
                    onChange={(assetId) =>
                      updateChoice(option.snapshotOptionId, { assetId })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
    </ReferenceSurface>
  );
}

function TryoutQuestionImportDialog({
  activeBrowseBank,
  activeSourceQuestions,
  browseBankId,
  disabled,
  guardExternalNavigation,
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
> & { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [allInBank, setAllInBank] = useState(false);
  const [selectedRevisions, setSelectedRevisions] = useState(
    new Map<string, TryoutExpectedSourceRevision>(),
  );
  const [importError, setImportError] = useState<string | null>(null);
  const previousBankId = useRef(browseBankId);
  const sourceQuestionPageCount = Math.max(
    1,
    Math.ceil(sourceQuestionTotal / TRYOUT_SOURCE_QUESTION_PAGE_SIZE),
  );

  useEffect(() => {
    if (previousBankId.current === browseBankId) return;
    previousBankId.current = browseBankId;
    setSelectedRevisions(new Map());
    setAllInBank(false);
    setImportError(null);
  }, [browseBankId]);

  const selectionCount = selectedRevisions.size;
  const canImport = Boolean(
    browseBankId && (allInBank || selectionCount > 0) && !importing && !disabled,
  );

  const toggleQuestion = (question: TryoutSourceQuestion) => {
    setImportError(null);
    if (
      !selectedRevisions.has(question.id) &&
      (!question.questionRevisionId || !question.questionContentDigest)
    ) {
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
      next.set(question.id, {
        contentDigest: question.questionContentDigest!,
        questionId: question.id,
        revisionId: question.questionRevisionId!,
      });
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedRevisions(new Map());
    setImportError(null);
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
      setOpen(false);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Soal belum dapat ditambahkan. Coba lagi.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Button
        disabled={importing || disabled}
        onClick={() => {
          setImportError(null);
          setOpen(true);
        }}
        type="button"
        variant="brand"
      >
        <Search aria-hidden="true" />
        Tambah dari Bank Soal
      </Button>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (importing) return;
          setOpen(nextOpen);
          if (nextOpen) setImportError(null);
        }}
        open={open}
      >
        <DialogContent
          className="gap-4 sm:max-w-5xl"
          pending={importing}
          variant="default"
        >
          <DialogHeader>
            <DialogTitle>Tambah soal dari Bank Soal</DialogTitle>
            <DialogDescription>
              Pilih Bank Soal untuk subtes {sectionSubject}. Soal yang ditambahkan
              menjadi salinan terpisah dan tidak mengubah bank asal.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.5fr)]">
            <ReferenceSurface
              aria-label="Pilih Bank Soal"
              className="grid min-w-0 content-start gap-3 p-3"
              variant="inset"
            >
              <Field>
                <FieldLabel
                  className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                  htmlFor={`tryout-bank-search-${sectionSubject}`}
                >
                  Cari Bank Soal
                </FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                  <FieldInput
                    className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 rounded-xl py-2 pl-9 pr-3 text-sm`}
                    disabled={importing || disabled}
                    id={`tryout-bank-search-${sectionSubject}`}
                    onChange={(event) => onBankSearchChange(event.target.value)}
                    placeholder="Cari nama bank atau folder…"
                    value={sourceBankSearch}
                  />
                </div>
              </Field>
              {sourceBankLoading ? (
                <p className="px-2 text-xs text-secondary-500">
                  Memuat Bank Soal…
                </p>
              ) : null}
              <div
                aria-label="Bank Soal yang sesuai"
                className="grid max-h-64 gap-1 overflow-y-auto md:max-h-[28rem]"
                role="listbox"
              >
                <SourceBankList
                  activeSectionSubtest={sectionSubject}
                  browseBankId={browseBankId}
                  disabled={importing || disabled}
                  guardExternalNavigation={guardExternalNavigation}
                  onSelectBank={(bankId) => {
                    setImportError(null);
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
            </ReferenceSurface>

            <ReferenceSurface
              aria-label="Pilih soal"
              className="grid min-w-0 content-start gap-3 p-3 sm:p-4"
              variant="inset"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-secondary-900">
                    {activeBrowseBank?.title ?? "Pilih bank terlebih dahulu"}
                  </h3>
                  <p aria-live="polite" className="mt-1 text-xs text-secondary-500">
                    {allInBank
                      ? "Semua soal siap di bank ini akan ditambahkan."
                      : `${selectionCount} soal dipilih`}
                  </p>
                </div>
                {selectionCount > 0 ? (
                  <Button
                    disabled={importing}
                    onClick={clearSelection}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Kosongkan pilihan
                  </Button>
                ) : null}
              </div>

              <Field>
                <FieldLabel
                  className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                  htmlFor={`tryout-question-search-${sectionSubject}`}
                >
                  Cari soal
                </FieldLabel>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
                  <FieldInput
                    className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 rounded-xl py-2 pl-9 pr-3 text-sm`}
                    disabled={importing || disabled || !browseBankId}
                    id={`tryout-question-search-${sectionSubject}`}
                    onChange={(event) => onQuestionSearchChange(event.target.value)}
                    placeholder={activeBrowseBank ? "Cari isi pertanyaan…" : "Pilih Bank Soal terlebih dahulu"}
                    value={sourceQuestionSearch}
                  />
                </div>
              </Field>

              <label
                className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-primary-100 bg-white px-3 py-3 text-sm text-secondary-800 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                htmlFor={`tryout-all-in-bank-${sectionSubject}`}
              >
                <Checkbox
                  checked={allInBank}
                  disabled={importing || disabled || !browseBankId}
                  id={`tryout-all-in-bank-${sectionSubject}`}
                  onCheckedChange={(checked) => {
                    setAllInBank(checked === true);
                    setImportError(null);
                  }}
                />
                <span>
                  <span className="block font-semibold">
                    Tambahkan semua soal siap di bank ini
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-secondary-500">
                    Pilihan ini mengikuti seluruh bank, tidak dibatasi pencarian
                    atau halaman yang sedang dibuka.
                  </span>
                </span>
              </label>

              {sourceQuestionLoading ? (
                <p className="text-xs text-secondary-500">Memuat soal…</p>
              ) : null}
              {activeSourceQuestions.length ? (
                <div className="grid max-h-72 gap-2 overflow-y-auto md:max-h-[22rem]">
                  {activeSourceQuestions.map((question) => {
                    const selected = selectedRevisions.has(question.id);
                    const checkboxId = `tryout-source-question-${question.id}`;
                    return (
                      <label
                        className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${selected ? "border-primary-300 bg-white" : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/60"} has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60`}
                        htmlFor={checkboxId}
                        key={question.id}
                      >
                        <Checkbox
                          checked={selected}
                          disabled={
                            importing ||
                            disabled ||
                            sourceQuestionLoading ||
                            ((!question.questionRevisionId ||
                              !question.questionContentDigest) &&
                              !selected)
                          }
                          id={checkboxId}
                          onCheckedChange={() => toggleQuestion(question)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap gap-2">
                            <MentorBadge size="compact" tone="neutral">
                              {difficultyLabel(question.difficulty)}
                            </MentorBadge>
                            <MentorBadge
                              size="compact"
                              tone={
                                question.questionType === "multiple_choice"
                                  ? "attention"
                                  : "neutral"
                              }
                            >
                              {questionTypeLabel(question.questionType)}
                            </MentorBadge>
                          </span>
                          <span
                            className="mt-2 block line-clamp-3 break-words text-sm leading-6 text-secondary-900"
                            title={question.prompt}
                          >
                            {question.prompt}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <ReferenceSurface
                  className="px-4 py-8 text-center text-sm leading-6 text-secondary-500"
                  variant="inset"
                >
                  {browseBankId
                    ? "Tidak ada soal siap yang cocok dengan pencarian ini."
                    : "Pilih Bank Soal untuk melihat soalnya."}
                </ReferenceSurface>
              )}

              {browseBankId && sourceQuestionTotal > 0 ? (
                <div className="flex justify-center pt-1 sm:justify-end">
                  <PaginationControls
                    onPageChange={onQuestionPageChange}
                    page={sourceQuestionPage}
                    pageCount={sourceQuestionPageCount}
                  />
                </div>
              ) : null}
            </ReferenceSurface>
          </div>

          {importError ? (
            <p
              className="flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-500"
              role="alert"
            >
              {importError}
            </p>
          ) : null}

          <DialogFooter className="sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-secondary-500">
              {allInBank
                ? "Semua soal siap di bank ini akan diperiksa saat ditambahkan."
                : "Pilihan tetap tersimpan saat Anda mencari atau membuka halaman lain."}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                disabled={importing || disabled}
                onClick={() => setOpen(false)}
                type="button"
                variant="reference"
              >
                Batal
              </Button>
              <Button
                aria-busy={importing}
                disabled={!canImport || !activeBrowseBank}
                onClick={() => void runImport()}
                type="button"
                variant="brand"
              >
                {importing ? "Menambahkan…" : "Tambahkan soal"}
              </Button>
            </div>
          </DialogFooter>
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
    () => questions.filter((question) => !isSnapshotQuestion(question)),
    [questions],
  );
  const [activeSnapshotId, setActiveSnapshotId] = useState(
    snapshotQuestions[0]?.snapshotId ?? "",
  );
  const directEditingAvailable =
    !readOnly && !draftLocked && !packageVersionId;
  const editable = directEditingAvailable && !saving;

  useEffect(() => {
    if (snapshotQuestions.some((question) => question.snapshotId === activeSnapshotId))
      return;
    setActiveSnapshotId(snapshotQuestions[0]?.snapshotId ?? "");
  }, [activeSnapshotId, snapshotQuestions]);

  const activeQuestionIndex = snapshotQuestions.findIndex(
    (question) => question.snapshotId === activeSnapshotId,
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
        {directEditingAvailable ? (
          <TryoutQuestionImportDialog
            activeBrowseBank={activeBrowseBank}
            activeSourceQuestions={activeSourceQuestions}
            browseBankId={browseBankId}
            disabled={saving}
            guardExternalNavigation={guardExternalNavigation}
            onBankPageNext={onBankPageNext}
            onBankSearchChange={onBankSearchChange}
            onImport={importSelectedQuestions}
            onQuestionPageChange={onQuestionPageChange}
            onQuestionSearchChange={onQuestionSearchChange}
            onSelectBank={onSelectBank}
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
        ) : null}
      </div>

      {legacyQuestions.length ? (
        <ReferenceSurface
          className="grid gap-2 p-4 text-sm leading-6 text-secondary-700"
          role="status"
          variant="inset"
        >
          <p className="font-semibold text-secondary-900">
            Soal tersimpan sebelumnya
          </p>
          <p>
            Soal ini tetap tercantum dan hanya dapat dilihat. Soal baru yang
            ditambahkan dari Bank Soal dapat disunting langsung di Tryout.
          </p>
          <ul className="m-0 grid list-disc gap-1 pl-5">
            {legacyQuestions.map((question, index) => (
              <li
                className="break-words"
                key={question.sourceQuestionId || `legacy-question-${index}`}
              >
                {question.prompt || "Soal tanpa pertanyaan"}
              </li>
            ))}
          </ul>
        </ReferenceSurface>
      ) : null}

      {activeQuestion ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.5fr)]">
          <ReferenceSurface
            as="nav"
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
                    aria-current={
                      question.snapshotId === activeSnapshotId ? "true" : undefined
                    }
                    className="h-auto min-h-12 w-full min-w-0 justify-start rounded-xl px-3 py-2 text-left"
                    onClick={() => setActiveSnapshotId(question.snapshotId)}
                    type="button"
                    variant={
                      question.snapshotId === activeSnapshotId
                        ? "contextSelected"
                        : "ghost"
                    }
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
            onMove={(direction) =>
              onMoveQuestion(activeQuestion.snapshotId, direction)
            }
            onRemove={() => removeSnapshot(activeQuestion.snapshotId)}
            onUpdate={(change) =>
              onUpdateQuestion(activeQuestion.snapshotId, change)
            }
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
