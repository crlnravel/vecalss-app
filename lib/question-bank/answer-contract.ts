/**
 * Pure answer-key and answer-selection rules shared by authoring and runtime
 * code. The helpers intentionally keep option display order outside the
 * contract: only the selected/correct ID sets are canonicalized for equality.
 */

type QuestionAnswerMode = "single_choice" | "multiple_choice";

type AnswerOption = {
  id: string;
  isCorrect: boolean;
};

type AnswerContractErrorCode =
  | "duplicate_option_id"
  | "empty_option_id"
  | "empty_selection_id"
  | "foreign_correct_option_id"
  | "foreign_selection_id"
  | "invalid_answer_mode"
  | "invalid_selection_shape"
  | "multiple_correct_options_for_single_answer"
  | "no_correct_option"
  | "single_answer_has_multiple_selections";

type AnswerContractError = {
  code: AnswerContractErrorCode;
  message: string;
  optionId?: string;
};

type AnswerKeyValidation =
  | { errors: []; ok: true; correctOptionIds: string[] }
  | { errors: [AnswerContractError, ...AnswerContractError[]]; ok: false; correctOptionIds: [] };

type AnswerSelectionValidation =
  | { errors: []; ok: true; selectedOptionIds: string[] }
  | { errors: [AnswerContractError, ...AnswerContractError[]]; ok: false; selectedOptionIds: [] };

type AnswerSetComparison =
  | { equal: boolean; errors: []; ok: true }
  | { equal: false; errors: [AnswerContractError, ...AnswerContractError[]]; ok: false };

type ExactAnswerEvaluation =
  | { errors: []; selectedOptionIds: []; status: "unanswered" }
  | { errors: []; selectedOptionIds: string[]; status: "correct" | "incorrect" }
  | { errors: [AnswerContractError, ...AnswerContractError[]]; selectedOptionIds: []; status: "invalid" };

type LegacyAnswerSelection = {
  selectedOptionId?: string | null;
  selectedOptionIds?: readonly string[] | null;
};

type LegacyAnswerDecode =
  | { errors: []; ok: true; selectedOptionIds: string[]; source: "legacy_singular" | "plural" | "both_consistent" }
  | { errors: [AnswerContractError, ...AnswerContractError[]]; ok: false; selectedOptionIds: []; source: "invalid" };

function error(code: AnswerContractErrorCode, message: string, optionId?: string): AnswerContractError {
  return optionId === undefined ? { code, message } : { code, message, optionId };
}

function isAnswerMode(value: unknown): value is QuestionAnswerMode {
  return value === "single_choice" || value === "multiple_choice";
}

function validateOptionIds(options: readonly AnswerOption[]): AnswerContractError[] {
  const errors: AnswerContractError[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    if (!option.id.trim()) {
      errors.push(error("empty_option_id", "Setiap opsi jawaban harus memiliki ID."));
      continue;
    }
    if (seen.has(option.id)) errors.push(error("duplicate_option_id", "ID opsi jawaban tidak boleh duplikat.", option.id));
    seen.add(option.id);
  }
  return errors;
}

function validateAnswerKey(mode: QuestionAnswerMode, options: readonly AnswerOption[]): AnswerKeyValidation {
  if (!isAnswerMode(mode)) {
    return {
      errors: [error("invalid_answer_mode", "Mode jawaban tidak valid.")],
      ok: false,
      correctOptionIds: [],
    };
  }

  const errors = validateOptionIds(options);
  const correctOptionIds = options.filter((option) => option.isCorrect).map((option) => option.id);
  if (!correctOptionIds.length) errors.push(error("no_correct_option", "Tandai minimal satu jawaban benar."));
  if (mode === "single_choice" && correctOptionIds.length > 1) {
    errors.push(error("multiple_correct_options_for_single_answer", "Mode satu jawaban hanya boleh memiliki satu jawaban benar."));
  }
  if (errors.length) {
    return { errors: errors as [AnswerContractError, ...AnswerContractError[]], ok: false, correctOptionIds: [] };
  }
  return { errors: [], ok: true, correctOptionIds };
}

function validateSelectedOptionIds(
  mode: QuestionAnswerMode,
  selectedOptionIds: readonly string[],
  availableOptionIds: readonly string[],
): AnswerSelectionValidation {
  if (!isAnswerMode(mode) || !Array.isArray(selectedOptionIds)) {
    return {
      errors: [error("invalid_selection_shape", "Pilihan jawaban tidak valid.")],
      ok: false,
      selectedOptionIds: [],
    };
  }

  const errors: AnswerContractError[] = [];
  const available = new Set(availableOptionIds);
  const seen = new Set<string>();
  for (const optionId of selectedOptionIds) {
    if (typeof optionId !== "string" || !optionId.trim()) {
      errors.push(error("empty_selection_id", "ID pilihan jawaban tidak boleh kosong."));
      continue;
    }
    if (seen.has(optionId)) errors.push(error("duplicate_option_id", "Pilihan jawaban tidak boleh duplikat.", optionId));
    if (!available.has(optionId)) errors.push(error("foreign_selection_id", "Pilihan jawaban tidak tersedia untuk soal ini.", optionId));
    seen.add(optionId);
  }
  if (mode === "single_choice" && selectedOptionIds.length > 1) {
    errors.push(error("single_answer_has_multiple_selections", "Mode satu jawaban hanya boleh memilih satu opsi."));
  }
  if (errors.length) {
    return { errors: errors as [AnswerContractError, ...AnswerContractError[]], ok: false, selectedOptionIds: [] };
  }
  return { errors: [], ok: true, selectedOptionIds: [...selectedOptionIds] };
}

/**
 * Sorts IDs for set comparison without changing the caller's option or
 * selection array. Callers should validate first when malformed input matters.
 */
function canonicalizeOptionIdSet(optionIds: readonly string[]): string[] {
  return [...optionIds].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function compareSelectedOptionSets(left: readonly string[], right: readonly string[]): AnswerSetComparison {
  const validate = (ids: readonly string[]) => {
    const errors: AnswerContractError[] = [];
    const seen = new Set<string>();
    for (const optionId of ids) {
      if (typeof optionId !== "string" || !optionId.trim()) errors.push(error("empty_selection_id", "ID pilihan jawaban tidak boleh kosong."));
      else if (seen.has(optionId)) errors.push(error("duplicate_option_id", "Pilihan jawaban tidak boleh duplikat.", optionId));
      seen.add(optionId);
    }
    return errors;
  };
  const errors = [...validate(left), ...validate(right)];
  if (errors.length) return { equal: false, errors: errors as [AnswerContractError, ...AnswerContractError[]], ok: false };
  const leftCanonical = canonicalizeOptionIdSet(left);
  const rightCanonical = canonicalizeOptionIdSet(right);
  return {
    equal: leftCanonical.length === rightCanonical.length && leftCanonical.every((optionId, index) => optionId === rightCanonical[index]),
    errors: [],
    ok: true,
  };
}

function evaluateExactAnswer(input: {
  availableOptionIds: readonly string[];
  correctOptionIds: readonly string[];
  mode: QuestionAnswerMode;
  selectedOptionIds: readonly string[];
}): ExactAnswerEvaluation {
  const availableOptions = new Set(input.availableOptionIds);
  const correctOptions = new Set(input.correctOptionIds);
  const availableIdErrors = validateOptionIds(input.availableOptionIds.map((id) => ({ id, isCorrect: false })));
  const foreignCorrectIds = input.correctOptionIds.filter((id) => !availableOptions.has(id));
  const inputErrors = [
    ...availableIdErrors,
    ...foreignCorrectIds.map((id) => error("foreign_correct_option_id", "Kunci jawaban berisi opsi yang tidak tersedia.", id)),
  ];
  const key = validateAnswerKey(
    input.mode,
    input.availableOptionIds.map((id) => ({ id, isCorrect: correctOptions.has(id) })),
  );
  const selection = validateSelectedOptionIds(input.mode, input.selectedOptionIds, [...availableOptions]);
  const errors = [...inputErrors, ...(key.ok ? [] : key.errors), ...(selection.ok ? [] : selection.errors)];
  if (errors.length) return { errors: errors as [AnswerContractError, ...AnswerContractError[]], selectedOptionIds: [], status: "invalid" };
  if (!selection.selectedOptionIds.length) return { errors: [], selectedOptionIds: [], status: "unanswered" };
  const comparison = compareSelectedOptionSets(selection.selectedOptionIds, key.correctOptionIds);
  if (!comparison.ok) return { errors: comparison.errors, selectedOptionIds: [], status: "invalid" };
  return { errors: [], selectedOptionIds: selection.selectedOptionIds, status: comparison.equal ? "correct" : "incorrect" };
}

function decodeLegacyAnswerSelection(input: LegacyAnswerSelection): LegacyAnswerDecode {
  const hasSingular = Object.prototype.hasOwnProperty.call(input, "selectedOptionId");
  const hasPlural = Object.prototype.hasOwnProperty.call(input, "selectedOptionIds");
  const singular = input.selectedOptionId;
  const plural = input.selectedOptionIds;

  if (hasPlural && plural !== null && !Array.isArray(plural)) {
    return { errors: [error("invalid_selection_shape", "Daftar pilihan jawaban tidak valid.")], ok: false, selectedOptionIds: [], source: "invalid" };
  }
  const pluralIds = plural === null || plural === undefined ? [] : [...plural];
  const singularIds = singular === null || singular === undefined ? [] : [singular];
  const pluralValidation = compareSelectedOptionSets(pluralIds, pluralIds);
  const singularValidation = compareSelectedOptionSets(singularIds, singularIds);
  if (!pluralValidation.ok) return { errors: pluralValidation.errors, ok: false, selectedOptionIds: [], source: "invalid" };
  if (!singularValidation.ok) return { errors: singularValidation.errors, ok: false, selectedOptionIds: [], source: "invalid" };
  if (hasSingular && hasPlural) {
    const comparison = compareSelectedOptionSets(singularIds, pluralIds);
    if (!comparison.ok || !comparison.equal) {
      return { errors: [error("invalid_selection_shape", "Pilihan jawaban tunggal dan daftar pilihan saling bertentangan.")], ok: false, selectedOptionIds: [], source: "invalid" };
    }
    return { errors: [], ok: true, selectedOptionIds: pluralIds, source: "both_consistent" };
  }
  if (hasPlural) return { errors: [], ok: true, selectedOptionIds: pluralIds, source: "plural" };
  if (hasSingular) return { errors: [], ok: true, selectedOptionIds: singularIds, source: "legacy_singular" };
  return { errors: [], ok: true, selectedOptionIds: [], source: "plural" };
}

export {
  canonicalizeOptionIdSet,
  compareSelectedOptionSets,
  decodeLegacyAnswerSelection,
  evaluateExactAnswer,
  isAnswerMode,
  validateAnswerKey,
  validateSelectedOptionIds,
};
export type {
  AnswerContractError,
  AnswerContractErrorCode,
  AnswerKeyValidation,
  AnswerOption,
  AnswerSelectionValidation,
  AnswerSetComparison,
  ExactAnswerEvaluation,
  LegacyAnswerDecode,
  LegacyAnswerSelection,
  QuestionAnswerMode,
};
