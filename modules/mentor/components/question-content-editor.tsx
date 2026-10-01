"use client";

import { ImagePlus, Plus, Trash2, X } from "@/lib/icons";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { ReferenceSelect } from "@/components/dashboard/reference-dashboard-controls";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  correctChoiceIdsFor,
  questionTypeFor,
  setQuestionMediaAsset,
  withCorrectChoiceIds,
  type EditorQuestion,
  type QuestionMediaTarget,
} from "@/modules/mentor/components/question-content-editor-helpers";
import { MediaAssetPreview } from "@/modules/media/media-library";

type QuestionDifficulty = NonNullable<EditorQuestion["difficulty"]>;

function QuestionMediaActions({
  assetId,
  compact = false,
  disabled,
  label,
  onOpen,
  onRemove,
}: {
  assetId?: string;
  compact?: boolean;
  disabled: boolean;
  label: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const addLabel = `${assetId ? "Ganti" : "Tambah"} ${label.toLowerCase()}`;
  const removeLabel = `Lepas ${label.toLowerCase()}`;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        aria-label={addLabel}
        disabled={disabled}
        onClick={onOpen}
        size={compact ? "icon-sm" : "sm"}
        title={compact ? addLabel : undefined}
        type="button"
        variant="outline"
      >
        <ImagePlus aria-hidden="true" />
        {compact ? (
          <span className="sr-only">{addLabel}</span>
        ) : assetId ? (
          "Ganti gambar"
        ) : (
          "Tambah gambar"
        )}
      </Button>
      {assetId ? (
        <Button
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
          size={compact ? "icon-sm" : "sm"}
          title={compact ? removeLabel : undefined}
          type="button"
          variant="outline"
        >
          <X aria-hidden="true" />
          {compact ? <span className="sr-only">{removeLabel}</span> : "Lepas"}
        </Button>
      ) : null}
    </div>
  );
}

export function QuestionContentEditor({
  disabled,
  idPrefix = "quiz",
  onOpenMedia,
  question,
  updateQuestion,
}: {
  disabled: boolean;
  idPrefix?: "quiz" | "tryout";
  onOpenMedia: (target: QuestionMediaTarget) => void;
  question: EditorQuestion;
  updateQuestion: (
    questionId: string,
    update: (current: EditorQuestion) => EditorQuestion,
  ) => void;
}) {
  const questionType = questionTypeFor(question);
  const correctChoiceIds = correctChoiceIdsFor(question);
  const correctChoiceIdSet = new Set(correctChoiceIds);
  const promptMediaTarget: QuestionMediaTarget = {
    field: "prompt",
    label: "Gambar pertanyaan",
    questionId: question.id,
  };
  const explanationMediaTarget: QuestionMediaTarget = {
    field: "explanation",
    label: "Gambar penjelasan",
    questionId: question.id,
  };

  return (
    <ReferenceSurface as="section" className="grid min-w-0 gap-6 p-5 md:p-6">
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor={`${idPrefix}-question-${question.id}-prompt`}
            required
          >
            Pertanyaan
          </FieldLabel>
          <QuestionMediaActions
            assetId={question.promptMediaAssetId}
            disabled={disabled}
            label="Gambar pertanyaan"
            onOpen={() => onOpenMedia(promptMediaTarget)}
            onRemove={() =>
              updateQuestion(question.id, (current) =>
                setQuestionMediaAsset(current, promptMediaTarget, undefined),
              )
            }
          />
        </div>
        <FieldTextarea
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[160px] resize-y`}
          disabled={disabled}
          id={`${idPrefix}-question-${question.id}-prompt`}
          onChange={(event) =>
            updateQuestion(question.id, (current) => ({
              ...current,
              prompt: event.target.value,
            }))
          }
          required
          value={question.prompt}
        />
        {question.promptMediaAssetId ? (
          <MediaAssetPreview
            alt="Gambar pertanyaan"
            assetId={question.promptMediaAssetId}
            className="max-h-48 bg-white"
          />
        ) : null}
      </Field>

      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`${idPrefix}-question-${question.id}-type`}
          required
        >
          Jenis soal
        </FieldLabel>
        <ReferenceSelect
          disabled={disabled}
          id={`${idPrefix}-question-${question.id}-type`}
          onValueChange={(value) => {
            const nextType =
              value === "multiple_choice" ? "multiple_choice" : "single_choice";
            updateQuestion(question.id, (current) => {
              const selectedIds = correctChoiceIdsFor(current);
              return withCorrectChoiceIds(
                {
                  ...current,
                  questionType: nextType,
                },
                nextType === "single_choice"
                  ? selectedIds.slice(0, 1)
                  : selectedIds,
              );
            });
          }}
          options={[
            { label: "Pilihan ganda", value: "single_choice" },
            { label: "Pilihan ganda kompleks", value: "multiple_choice" },
          ]}
          required
          value={questionType}
        />
      </Field>

      <QuestionChoicesEditor correctChoiceIdSet={correctChoiceIdSet} disabled={disabled} idPrefix={idPrefix} onOpenMedia={onOpenMedia} question={question} updateQuestion={updateQuestion} />
      <div className="flex justify-end">
        <Button
          disabled={disabled || question.choices.length >= 5}
          onClick={() => {
            const choiceId = crypto.randomUUID();
            updateQuestion(question.id, (current) => ({
              ...current,
              choices: [...current.choices, { id: choiceId, text: "" }],
            }));
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" />
          Tambah opsi
        </Button>
      </div>

      <Field>
        <FieldLabel
          className={REFERENCE_FIELD_LABEL_CLASS_NAME}
          htmlFor={`${idPrefix}-question-${question.id}-difficulty`}
          required
        >
          Tingkat kesulitan
        </FieldLabel>
        <ReferenceSelect
          disabled={disabled}
          id={`${idPrefix}-question-${question.id}-difficulty`}
          onValueChange={(value) => {
            const difficulty: QuestionDifficulty =
              value === "easy" || value === "hard" || value === "adaptive"
                ? value
                : "medium";
            updateQuestion(question.id, (current) => ({
              ...current,
              difficulty,
            }));
          }}
          options={[
            { label: "Mudah", value: "easy" },
            { label: "Sedang", value: "medium" },
            { label: "Sulit", value: "hard" },
            { label: "Adaptif", value: "adaptive" },
          ]}
          required
          value={question.difficulty}
        />
      </Field>

      <div className="grid min-w-0 gap-4 border-t border-primary-100 pt-5">
        <Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor={`${idPrefix}-question-${question.id}-explanation`}
            >
              Penjelasan
            </FieldLabel>
            <QuestionMediaActions
              assetId={question.explanationMediaAssetId}
              disabled={disabled}
              label="Gambar penjelasan"
              onOpen={() => onOpenMedia(explanationMediaTarget)}
              onRemove={() =>
                updateQuestion(question.id, (current) =>
                  setQuestionMediaAsset(
                    current,
                    explanationMediaTarget,
                    undefined,
                  ),
                )
              }
            />
          </div>
          <FieldTextarea
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[120px] resize-y`}
            disabled={disabled}
            id={`${idPrefix}-question-${question.id}-explanation`}
            onChange={(event) =>
              updateQuestion(question.id, (current) => ({
                ...current,
                explanation: event.target.value,
              }))
            }
            value={question.explanation}
          />
          {question.explanationMediaAssetId ? (
            <MediaAssetPreview
              alt="Gambar penjelasan"
              assetId={question.explanationMediaAssetId}
              className="max-h-48 bg-white"
            />
          ) : null}
        </Field>
      </div>
    </ReferenceSurface>
  );
}

function QuestionChoicesEditor({ correctChoiceIdSet, disabled, idPrefix, onOpenMedia, question, updateQuestion }: {
  correctChoiceIdSet: Set<string>;
  disabled: boolean;
  idPrefix: "quiz" | "tryout";
  onOpenMedia: (target: QuestionMediaTarget) => void;
  question: EditorQuestion;
  updateQuestion: (questionId: string, update: (current: EditorQuestion) => EditorQuestion) => void;
}) {
  const questionType = questionTypeFor(question);
  return (
    <fieldset aria-required="true" className="grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-2" disabled={disabled}>
      <legend className={cn(REFERENCE_FIELD_LABEL_CLASS_NAME, "col-span-full")}>
        Pilihan jawaban <span aria-hidden="true" className="text-student-status-danger-fg">*</span>
      </legend>
      {question.choices.map((choice, index) => <QuestionChoiceRow correctChoiceIdSet={correctChoiceIdSet} disabled={disabled} idPrefix={idPrefix} key={choice.id} onOpenMedia={onOpenMedia} optionLabel={String.fromCharCode(65 + index)} question={question} questionType={questionType} updateQuestion={updateQuestion} choice={choice} />)}
    </fieldset>
  );
}

function QuestionChoiceRow({ choice, correctChoiceIdSet, disabled, idPrefix, onOpenMedia, optionLabel, question, questionType, updateQuestion }: {
  choice: EditorQuestion["choices"][number];
  correctChoiceIdSet: Set<string>;
  disabled: boolean;
  idPrefix: "quiz" | "tryout";
  onOpenMedia: (target: QuestionMediaTarget) => void;
  optionLabel: string;
  question: EditorQuestion;
  questionType: ReturnType<typeof questionTypeFor>;
  updateQuestion: (questionId: string, update: (current: EditorQuestion) => EditorQuestion) => void;
}) {
  const mediaTarget: QuestionMediaTarget = { choiceId: choice.id, field: "choice", label: `Gambar opsi ${optionLabel}`, questionId: question.id };
  const answerInputId = `${idPrefix}-question-${question.id}-answer-${choice.id}`;
  const textInputId = `${idPrefix}-question-${question.id}-choice-${choice.id}`;
  const isCorrect = correctChoiceIdSet.has(choice.id);
  return (
    <div className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "min-w-0 flex-col items-stretch gap-3 has-[:checked]:border-primary-500/65 has-[:checked]:bg-primary-50", disabled && "cursor-not-allowed opacity-55")}>
      <div className="flex min-w-0 items-center gap-3">
        <input
          aria-label={`Opsi ${optionLabel} adalah jawaban benar`}
          checked={isCorrect}
          className="size-4 shrink-0 accent-primary-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200"
          id={answerInputId}
          name={`${idPrefix}-question-${question.id}-answer`}
          onChange={(event) => updateQuestion(question.id, (current) => {
            const selectedIds = correctChoiceIdsFor(current);
            const nextIds = questionTypeFor(current) === "single_choice"
              ? [choice.id]
              : event.target.checked ? [...selectedIds, choice.id] : selectedIds.filter((id) => id !== choice.id);
            return withCorrectChoiceIds(current, nextIds);
          })}
          type={questionType === "multiple_choice" ? "checkbox" : "radio"}
          value={choice.id}
        />
        <span className="text-sm font-semibold text-primary-800">{optionLabel}</span>
        <input
          aria-label={`Opsi ${optionLabel}`}
          className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-w-0 flex-1")}
          disabled={disabled}
          id={textInputId}
          onChange={(event) => updateQuestion(question.id, (current) => ({
            ...current,
            choices: current.choices.map((currentChoice) => currentChoice.id === choice.id ? { ...currentChoice, text: event.target.value } : currentChoice),
          }))}
          placeholder={`Opsi ${optionLabel}`}
          required
          value={choice.text}
        />
        <QuestionMediaActions assetId={choice.mediaAssetId} compact disabled={disabled} label={`Gambar opsi ${optionLabel}`} onOpen={() => onOpenMedia(mediaTarget)} onRemove={() => updateQuestion(question.id, (current) => setQuestionMediaAsset(current, mediaTarget, undefined))} />
        <Button
          aria-label={`Hapus opsi ${optionLabel}`}
          disabled={disabled || question.choices.length <= 2}
          onClick={() => updateQuestion(question.id, (current) => {
            const choices = current.choices.filter((currentChoice) => currentChoice.id !== choice.id);
            return withCorrectChoiceIds({ ...current, choices }, correctChoiceIdsFor(current).filter((id) => id !== choice.id));
          })}
          size="icon-sm"
          title={`Hapus opsi ${optionLabel}`}
          type="button"
          variant="outline"
        ><Trash2 aria-hidden="true" /></Button>
      </div>
      {choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${optionLabel}`} assetId={choice.mediaAssetId} className="max-h-36 bg-white" /> : null}
    </div>
  );
}
