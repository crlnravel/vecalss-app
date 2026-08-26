type AssemblyMode = "fixed_set" | "random_pool" | "blueprint" | "cat_pool";

type AssemblyAttachmentTarget = "kuis" | "tryout";

type AssemblyAttachmentTestType = "cbt" | "cat";

const ASSEMBLY_RESOLVER_VERSION = "seeded-fisher-yates-v1";

type AssemblyDifficulty = "easy" | "medium" | "hard";

type SeededAssemblyCandidate = {
  difficulty?: AssemblyDifficulty;
  sortOrder?: number;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
};

type AssemblyResolutionErrorCode = "duplicate_source" | "quota" | "shortage";

class AssemblyResolutionError extends Error {
  readonly code: AssemblyResolutionErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: AssemblyResolutionErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AssemblyResolutionError";
    this.code = code;
    this.details = details;
  }
}

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

type AssemblyAttachmentCompatibilityInput = {
  bankIds: readonly string[];
  mode: AssemblyMode;
  subtestCode: string;
  target: AssemblyAttachmentTarget;
  targetTestType: AssemblyAttachmentTestType;
  targetSubtestCode: string;
};

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
  const normalized = (values ?? []).flatMap((value) => {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  });
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

function assemblyCompatibleWithTestType(mode: AssemblyMode, targetTestType: AssemblyAttachmentTestType) {
  return mode === "cat_pool" ? targetTestType === "cat" : targetTestType === "cbt";
}

function assertAssemblyAttachmentCompatibility(input: AssemblyAttachmentCompatibilityInput) {
  if (input.target === "kuis" && input.mode === "cat_pool") {
    throw new AssemblyValidationError("invalid_mode", "CAT Pool tidak didukung oleh Kuis.", {
      mode: input.mode,
      target: input.target,
      targetTestType: input.targetTestType,
    });
  }
  if (input.target === "kuis" && input.bankIds.length !== 1) {
    throw new AssemblyValidationError("scope", "Kuis hanya dapat memakai assembly dari satu Bank Soal.", {
      bankIds: input.bankIds,
      target: input.target,
    });
  }
  if (input.subtestCode !== input.targetSubtestCode) {
    throw new AssemblyValidationError("wrong_subtest", "Assembly tidak cocok dengan Subtest yang sedang dipilih.", {
      assemblySubtest: input.subtestCode,
      targetSubtest: input.targetSubtestCode,
      target: input.target,
    });
  }
  if (!assemblyCompatibleWithTestType(input.mode, input.targetTestType)) {
    throw new AssemblyValidationError(
      "invalid_mode",
      input.mode === "cat_pool"
        ? "CAT Pool hanya dapat dipasang pada Section bertipe CAT."
        : "Assembly non-CAT hanya dapat dipasang pada Section bertipe CBT.",
      {
        mode: input.mode,
        target: input.target,
        targetTestType: input.targetTestType,
      },
    );
  }
}

function seededFisherYates<T>(values: readonly T[], seed: string) {
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

function seededShuffle<T>(values: readonly T[], seed: string) {
  return seededFisherYates(values, seed);
}

function stableResolutionOrder<T extends SeededAssemblyCandidate>(values: readonly T[]) {
  return [...values].sort((left, right) => {
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left.sourceQuestionId !== right.sourceQuestionId) {
      return left.sourceQuestionId < right.sourceQuestionId ? -1 : 1;
    }
    return left.sourceQuestionRevisionId < right.sourceQuestionRevisionId ? -1 : left.sourceQuestionRevisionId === right.sourceQuestionRevisionId ? 0 : 1;
  });
}

function assertUniqueResolutionSources<T extends SeededAssemblyCandidate>(values: readonly T[]) {
  const duplicateIds: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.sourceQuestionId)) duplicateIds.push(value.sourceQuestionId);
    seen.add(value.sourceQuestionId);
  }
  if (duplicateIds.length) {
    throw new AssemblyResolutionError("duplicate_source", "Form hasil assembly memiliki soal sumber yang duplikat.", {
      sourceQuestionIds: [...new Set(duplicateIds)].sort(),
    });
  }
}

function resolvePoolCandidates<T extends SeededAssemblyCandidate>(
  candidates: readonly T[],
  requestedCount: number,
  seed: string,
) {
  if (!Number.isSafeInteger(requestedCount) || requestedCount < 1) {
    throw new AssemblyResolutionError("quota", "Jumlah undian Pool harus berupa bilangan bulat positif.", { requestedCount });
  }
  const ordered = stableResolutionOrder(candidates);
  assertUniqueResolutionSources(ordered);
  if (ordered.length < requestedCount) {
    throw new AssemblyResolutionError("shortage", "Kandidat Pool tidak mencukupi jumlah soal yang diminta.", {
      availableCount: ordered.length,
      requestedCount,
    });
  }
  return seededFisherYates(ordered, seed).slice(0, requestedCount);
}

function resolveBlueprintCandidates<T extends SeededAssemblyCandidate>(
  candidates: readonly T[],
  quotas: { easyCount: number; hardCount: number; mediumCount: number; requestedCount: number },
  seed: string,
) {
  const quotaTotal = quotas.easyCount + quotas.mediumCount + quotas.hardCount;
  if (!Number.isSafeInteger(quotas.requestedCount) || quotas.requestedCount < 1 || quotaTotal !== quotas.requestedCount) {
    throw new AssemblyResolutionError("quota", "Kuota Blueprint harus positif dan jumlahnya harus sama dengan total soal.", {
      quotaTotal,
      requestedCount: quotas.requestedCount,
    });
  }
  if ([quotas.easyCount, quotas.mediumCount, quotas.hardCount].some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new AssemblyResolutionError("quota", "Kuota Blueprint harus berupa bilangan bulat nol atau positif.", { quotas });
  }

  const ordered = stableResolutionOrder(candidates);
  assertUniqueResolutionSources(ordered);
  const buckets = {
    easy: ordered.filter((candidate) => candidate.difficulty === "easy"),
    medium: ordered.filter((candidate) => candidate.difficulty === "medium"),
    hard: ordered.filter((candidate) => candidate.difficulty === "hard"),
  } satisfies Record<AssemblyDifficulty, T[]>;
  const requestedByDifficulty = {
    easy: quotas.easyCount,
    medium: quotas.mediumCount,
    hard: quotas.hardCount,
  } satisfies Record<AssemblyDifficulty, number>;
  const availableByDifficulty = {
    easy: buckets.easy.length,
    medium: buckets.medium.length,
    hard: buckets.hard.length,
  } satisfies Record<AssemblyDifficulty, number>;
  const shortages = (Object.keys(requestedByDifficulty) as AssemblyDifficulty[]).filter((difficulty) =>
    availableByDifficulty[difficulty] < requestedByDifficulty[difficulty],
  );
  if (shortages.length) {
    throw new AssemblyResolutionError("shortage", "Cakupan Blueprint tidak memiliki cukup soal pada satu atau beberapa tingkat kesulitan.", {
      availableByDifficulty,
      requestedByDifficulty,
      shortages,
    });
  }

  return (['easy', 'medium', 'hard'] as const).flatMap((difficulty) =>
    seededFisherYates(buckets[difficulty], `${seed}:${difficulty}`).slice(0, requestedByDifficulty[difficulty]),
  );
}

export {
  ASSEMBLY_RESOLVER_VERSION,
  AssemblyResolutionError,
  AssemblyValidationError,
  assemblyCompatibleWithTestType,
  assertAssemblyAttachmentCompatibility,
  resolveBlueprintCandidates,
  resolvePoolCandidates,
  seededFisherYates,
  seededShuffle,
  validateAssemblyDefinitionShape,
};
export type {
  AssemblyCandidateInput,
  AssemblyAttachmentCompatibilityInput,
  AssemblyAttachmentTestType,
  AssemblyAttachmentTarget,
  AssemblyDifficulty,
  AssemblyDefinitionInput,
  AssemblyErrorCode,
  AssemblyErrorDetails,
  AssemblyMode,
  AssemblyRuleInput,
  AssemblyScopeInput,
  NormalizedAssemblyDefinition,
  SeededAssemblyCandidate,
};
