type AssemblyMode = "fixed_set" | "random_pool" | "blueprint" | "cat_pool";

type AssemblyCandidateInput = {
  pointValue?: number;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
};

type AssemblyScopeInput = {
  bankIds: string[];
  categoryIds?: string[];
  folderIds?: string[];
};

type AssemblyRuleInput = {
  easyCount: number;
  hardCount: number;
  mediumCount: number;
  requestedCount: number;
};

type AssemblyDefinitionInput = {
  candidates?: AssemblyCandidateInput[];
  description?: string;
  id?: string;
  mode: AssemblyMode;
  rule?: AssemblyRuleInput | null;
  scope: AssemblyScopeInput;
  subtestId: string;
  title: string;
};

type NormalizedAssemblyDefinition = {
  candidates: Array<Required<AssemblyCandidateInput>>;
  description: string | null;
  id?: string;
  mode: AssemblyMode;
  rule: AssemblyRuleInput | null;
  scope: Required<AssemblyScopeInput>;
  subtestId: string;
  title: string;
};

type AssemblyErrorCode =
  | "archived_bank"
  | "bank_inactive"
  | "calibration"
  | "duplicate_candidate"
  | "invalid_mode"
  | "locked"
  | "media_not_ready"
  | "missing_explanation"
  | "not_found"
  | "options"
  | "quota"
  | "scope"
  | "shortage"
  | "stale_candidate"
  | "unauthorized"
  | "wrong_subtest";

type AssemblyErrorDetails = Record<string, unknown>;

class AssemblyValidationError extends Error {
  readonly code: AssemblyErrorCode;
  readonly details: AssemblyErrorDetails;

  constructor(code: AssemblyErrorCode, message: string, details: AssemblyErrorDetails = {}) {
    super(message);
    this.name = "AssemblyValidationError";
    this.code = code;
    this.details = details;
  }
}

const ASSEMBLY_MODES: readonly AssemblyMode[] = ["fixed_set", "random_pool", "blueprint", "cat_pool"];

function uniqueIds(values: readonly string[] | undefined, label: string) {
  const normalized = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (new Set(normalized).size !== normalized.length) {
    throw new AssemblyValidationError("scope", `${label} tidak boleh berulang.`, { label });
  }
  return normalized;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function normalizeRule(mode: AssemblyMode, rule: AssemblyRuleInput | null | undefined) {
  if (mode === "fixed_set") {
    if (rule) {
      throw new AssemblyValidationError("quota", "Set tetap tidak menggunakan aturan kuota.", { mode });
    }
    return null;
  }

  if (!rule) {
    throw new AssemblyValidationError("quota", "Assembly ini memerlukan jumlah soal dan kuota yang eksplisit.", { mode });
  }

  if (!positiveInteger(rule.requestedCount)
    || !nonNegativeInteger(rule.easyCount)
    || !nonNegativeInteger(rule.mediumCount)
    || !nonNegativeInteger(rule.hardCount)) {
    throw new AssemblyValidationError("quota", "Jumlah soal dan kuota harus berupa bilangan bulat yang valid.", { mode, rule });
  }

  const normalized = {
    easyCount: rule.easyCount,
    hardCount: rule.hardCount,
    mediumCount: rule.mediumCount,
    requestedCount: rule.requestedCount,
  } satisfies AssemblyRuleInput;
  const quotaTotal = normalized.easyCount + normalized.mediumCount + normalized.hardCount;

  if (mode === "blueprint" && quotaTotal !== normalized.requestedCount) {
    throw new AssemblyValidationError("quota", "Jumlah kuota Blueprint harus sama dengan jumlah soal.", {
      quotaTotal,
      requestedCount: normalized.requestedCount,
    });
  }

  if (mode !== "blueprint" && quotaTotal !== 0) {
    throw new AssemblyValidationError("quota", "Pool dan CAT Pool tidak menggunakan kuota tingkat kesulitan.", {
      mode,
      quotaTotal,
    });
  }

  return normalized;
}

function validateAssemblyDefinitionShape(input: AssemblyDefinitionInput): NormalizedAssemblyDefinition {
  if (!input || typeof input !== "object") {
    throw new AssemblyValidationError("scope", "Definisi assembly tidak valid.");
  }

  const mode = input.mode;
  if (!ASSEMBLY_MODES.includes(mode)) {
    throw new AssemblyValidationError("invalid_mode", "Mode assembly tidak dikenali.", { mode });
  }

  const title = input.title.trim();
  if (!title) {
    throw new AssemblyValidationError("scope", "Nama assembly wajib diisi.", { field: "title" });
  }
  if (!input.subtestId.trim()) {
    throw new AssemblyValidationError("wrong_subtest", "Subtest assembly wajib dipilih.", { field: "subtestId" });
  }

  const scope = {
    bankIds: uniqueIds(input.scope?.bankIds, "Bank Soal"),
    categoryIds: uniqueIds(input.scope?.categoryIds, "Kategori"),
    folderIds: uniqueIds(input.scope?.folderIds, "Folder"),
  } satisfies Required<AssemblyScopeInput>;
  if (!scope.bankIds.length) {
    throw new AssemblyValidationError("scope", "Pilih setidaknya satu Bank Soal sebagai cakupan assembly.", { field: "bankIds" });
  }
  if (mode === "fixed_set" && scope.bankIds.length !== 1) {
    throw new AssemblyValidationError("scope", "Set tetap hanya dapat memakai satu Bank Soal.", { bankIds: scope.bankIds });
  }
  if (mode === "fixed_set" && (scope.folderIds.length || scope.categoryIds.length)) {
    throw new AssemblyValidationError("scope", "Set tetap tidak menggunakan filter Folder atau Kategori.", { mode });
  }

  const candidates = (input.candidates ?? []).map((candidate) => ({
    pointValue: candidate.pointValue === undefined ? 1 : candidate.pointValue,
    sourceContentDigest: candidate.sourceContentDigest.trim(),
    sourceQuestionId: candidate.sourceQuestionId.trim(),
    sourceQuestionRevisionId: candidate.sourceQuestionRevisionId.trim(),
  }));
  const seenCandidates = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.sourceQuestionId || !candidate.sourceQuestionRevisionId || !candidate.sourceContentDigest) {
      throw new AssemblyValidationError("stale_candidate", "Setiap kandidat harus membawa identitas Question, revisi Ready, dan digest.", { candidate });
    }
    if (seenCandidates.has(candidate.sourceQuestionId)) {
      throw new AssemblyValidationError("duplicate_candidate", "Satu soal sumber hanya boleh dipilih sekali dalam assembly.", {
        sourceQuestionId: candidate.sourceQuestionId,
      });
    }
    seenCandidates.add(candidate.sourceQuestionId);
    if (typeof candidate.pointValue !== "number" || !Number.isFinite(candidate.pointValue) || candidate.pointValue <= 0) {
      throw new AssemblyValidationError("scope", "Poin kandidat harus lebih besar dari nol.", { candidate });
    }
  }

  if (mode === "blueprint" && candidates.length) {
    throw new AssemblyValidationError("scope", "Blueprint mendefinisikan cakupan dan kuota, bukan daftar kandidat fisik.", { candidateCount: candidates.length });
  }

  return {
    candidates,
    description: input.description?.trim() || null,
    ...(input.id ? { id: input.id } : {}),
    mode,
    rule: normalizeRule(mode, input.rule),
    scope,
    subtestId: input.subtestId.trim(),
    title,
  };
}

function seededShuffle<T>(values: readonly T[], seed: string) {
  const result = [...values];
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619) >>> 0;
  }
  if (!state) state = 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export { AssemblyValidationError, seededShuffle, validateAssemblyDefinitionShape };
export type {
  AssemblyCandidateInput,
  AssemblyDefinitionInput,
  AssemblyErrorCode,
  AssemblyErrorDetails,
  AssemblyMode,
  AssemblyRuleInput,
  AssemblyScopeInput,
  NormalizedAssemblyDefinition,
};
