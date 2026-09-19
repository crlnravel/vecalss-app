import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  ContentStatus,
  DifficultyLevel,
  Prisma,
  QuestionType,
  QuestionRevisionProvenance,
  QuestionRevisionStatus,
  ReusableQuestionPackageMode,
  ReusableQuestionPackageVersionProvenance,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  AssemblyValidationError,
  AssemblyResolutionError,
  assertAssemblyAttachmentCompatibility,
  resolveBlueprintCandidates,
  resolvePoolCandidates,
  seededShuffle,
  validateAssemblyDefinitionShape,
} from "./assembly-validation";
import { validateAnswerKey, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import type {
  AssemblyAttachmentTarget,
  AssemblyAttachmentTestType,
  AssemblyDefinitionInput,
  AssemblyErrorCode,
  AssemblyErrorDetails,
  AssemblyMode,
  NormalizedAssemblyDefinition,
} from "./assembly-validation";

type AssemblyActorOptions = {
  isAdmin?: boolean;
};

type AssemblyCandidateSource = {
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
};

type AssemblyReadinessIssue = {
  code: AssemblyErrorCode;
  details: AssemblyErrorDetails;
  message: string;
};

type AssemblyReadiness = {
  availableByDifficulty: Record<"easy" | "medium" | "hard", number>;
  blockers: AssemblyReadinessIssue[];
  candidateCount: number;
  eligibleCount: number;
  mode: AssemblyMode;
  ready: boolean;
  requestedCount: number | null;
};

type SaveAssemblyDraftInput = AssemblyDefinitionInput;

type PreviewAssemblyInput = {
  packageId?: string;
  versionId?: string;
};

type AssemblyPreview = {
  mode: AssemblyMode;
  packageId: string;
  previewSeed: string;
  readiness: AssemblyReadiness;
  readOnly: true;
  sample: Array<{
    difficulty: string;
    prompt: string;
    sourceContentDigest: string;
    sourceQuestionId: string;
    sourceQuestionRevisionId: string;
  }>;
  versionId: string;
  versionNo: number;
};

type AssemblyAttachmentSummary = {
  bankIds: string[];
  bankNames: string[];
  bankPurposes: AssemblyBankPurpose[];
  categoryIds: string[];
  categoryNames: string[];
  definitionDigest: string | null;
  folderIds: string[];
  folderNames: string[];
  id: string;
  itemCount: number;
  mode: AssemblyMode;
  packageId: string;
  packageTitle: string;
  readyAt: string | null;
  readiness: AssemblyReadiness;
  rule: {
    easyCount: number;
    hardCount: number;
    mediumCount: number;
    requestedCount: number;
  } | null;
  status: string;
  subtest: string;
  versionNo: number;
};

const sourceInclude = {
  currentRevision: {
    include: {
      explanationAsset: true,
      options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
      promptAsset: true,
    },
  },
  questionBank: {
    select: {
      categories: { select: { categoryId: true } },
      folderId: true,
      id: true,
      name: true,
      purpose: true,
      status: true,
    },
  },
  subtest: { select: { code: true, id: true, isActive: true } },
} satisfies Prisma.QuestionInclude;

const versionInclude = {
  bankScopes: {
    include: { questionBank: { select: { id: true, name: true, purpose: true, status: true } } },
    orderBy: { questionBankId: "asc" as const },
  },
  categoryScopes: {
    include: { category: { select: { id: true, name: true } } },
    orderBy: { categoryId: "asc" as const },
  },
  folderScopes: {
    include: { folder: { select: { id: true, name: true, purpose: true } } },
    orderBy: { folderId: "asc" as const },
  },
  items: {
    include: {
      explanationAsset: true,
      options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
      promptAsset: true,
      sourceQuestionRevision: { select: { questionType: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
  package: { select: { createdByUserId: true, description: true, id: true, mode: true, sourceBankId: true, subtestId: true, title: true } },
  rule: true,
  sourceBank: { select: { id: true, name: true, purpose: true, status: true } },
  subtest: { select: { code: true, id: true, isActive: true, name: true } },
} satisfies Prisma.ReusableQuestionPackageVersionInclude;

type SourceRecord = Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>;
type VersionRecord = Prisma.ReusableQuestionPackageVersionGetPayload<{ include: typeof versionInclude }>;
type VersionItemRecord = VersionRecord["items"][number];
type KuisAssemblyItem = {
  difficulty: DifficultyLevel;
  explanation: string | null;
  explanationAssetId: string | null;
  options: Array<{
    assetId: string | null;
    choiceKey: string;
    content: string;
    isCorrect: boolean;
    sortOrder: number;
    sourceQuestionRevisionOptionId: string | null;
  }>;
  questionType: QuestionAnswerMode;
  prompt: string;
  promptAssetId: string | null;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
  sourceRevisionProvenance: QuestionRevisionProvenance;
  subtestId: string;
};

type KuisAssemblyMaterialization = {
  assemblyDefinitionDigest: string;
  assemblyMode: AssemblyMode;
  assemblyPackageId: string;
  assemblyPackageVersionId: string;
  assemblySeed: string | null;
  items: KuisAssemblyItem[];
  sourceBankId: string;
  subtestId: string;
};

type KuisAssemblyResolutionOptions = {
  expectedDefinitionDigest?: string | null;
  expectedMode?: AssemblyMode | null;
  seed?: string | null;
};

function issue(code: AssemblyErrorCode, message: string, details: AssemblyErrorDetails = {}): AssemblyReadinessIssue {
  return { code, details, message };
}

function throwIssue(candidate: AssemblyReadinessIssue): never {
  throw new AssemblyValidationError(candidate.code, candidate.message, candidate.details);
}

function isReadyAsset(asset: { state: string } | null | undefined) {
  return !asset || asset.state === "ready";
}

function answerModeForQuestionType(value: QuestionType | string | null | undefined): QuestionAnswerMode | null {
  if (value === QuestionType.multiple_choice || value === "multiple_choice") return "multiple_choice";
  if (value === QuestionType.single_choice || value === "single_choice" || value === null || value === undefined) return "single_choice";
  return null;
}

function codeFromTitle(title: string) {
  const slug = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "draft";
  return `assembly-${slug}-${randomUUID()}`.slice(0, 100);
}

function assemblyDefinitionDigest(definition: NormalizedAssemblyDefinition) {
  return createHash("sha256")
    .update(JSON.stringify({
      candidates: definition.candidates.map((candidate) => ({
        pointValue: candidate.pointValue,
        sourceContentDigest: candidate.sourceContentDigest,
        sourceQuestionId: candidate.sourceQuestionId,
        sourceQuestionRevisionId: candidate.sourceQuestionRevisionId,
      })),
      mode: definition.mode,
      rule: definition.rule,
      scope: definition.scope,
      subtestId: definition.subtestId,
    }))
    .digest("hex");
}

function toDefinitionInput(
  packageRecord: { description: string | null; id: string; mode: ReusableQuestionPackageMode; subtestId: string; title: string },
  version: Pick<VersionRecord, "bankScopes" | "categoryScopes" | "folderScopes" | "items" | "mode" | "rule" | "subtestId">,
  candidates: AssemblyCandidateSource[],
): AssemblyDefinitionInput {
  return {
    candidates,
    description: packageRecord.description ?? undefined,
    id: packageRecord.id,
    mode: version.mode as AssemblyMode,
    rule: version.rule
      ? {
        easyCount: version.rule.easyCount,
        hardCount: version.rule.hardCount,
        mediumCount: version.rule.mediumCount,
        requestedCount: version.rule.requestedCount,
      }
      : null,
    scope: {
      bankIds: version.bankScopes.map((scope) => scope.questionBankId),
      categoryIds: version.categoryScopes.map((scope) => scope.categoryId),
      folderIds: version.folderScopes.map((scope) => scope.folderId),
    },
    subtestId: version.subtestId ?? "",
    title: packageRecord.title,
  };
}

function candidateFromPackageItem(item: {
  pointValue: Prisma.Decimal;
  sourceContentDigest: string | null;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string | null;
}) {
  return {
    pointValue: Number(item.pointValue),
    sourceContentDigest: item.sourceContentDigest ?? "",
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? "",
  };
}

function candidateFromVersionItem(item: {
  pointValue: Prisma.Decimal;
  sourceContentDigest: string | null;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string | null;
}) {
  return {
    pointValue: Number(item.pointValue),
    sourceContentDigest: item.sourceContentDigest ?? "",
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? "",
  };
}

function sourceContentIssues(
  source: SourceRecord | undefined,
  subtestId: string,
  bankIds: readonly string[],
  identity?: AssemblyCandidateSource,
): AssemblyReadinessIssue[] {
  if (!source) {
    return [issue("stale_candidate", "Kandidat tidak lagi ditemukan di Bank Soal.", { sourceQuestionId: identity?.sourceQuestionId })];
  }

  const blockers: AssemblyReadinessIssue[] = [];
  const bank = source.questionBank;
  const revision = source.currentRevision;

  if (!bank || !bankIds.includes(bank.id)) {
    blockers.push(issue("scope", "Kandidat berada di luar cakupan Bank Soal assembly.", {
      bankId: bank?.id,
      sourceQuestionId: source.id,
    }));
  }
  if (bank?.status === ContentStatus.archived) {
    blockers.push(issue("archived_bank", "Bank Soal kandidat sudah diarsipkan.", { bankId: bank.id }));
  }
  if (source.status === ContentStatus.archived) {
    blockers.push(issue("stale_candidate", "Soal kandidat sudah diarsipkan.", { sourceQuestionId: source.id }));
  } else if (source.status !== ContentStatus.published) {
    blockers.push(issue("stale_candidate", "Soal kandidat belum berstatus Ready.", { sourceQuestionId: source.id, status: source.status }));
  }
  if (!source.subtestId || source.subtestId !== subtestId) {
    blockers.push(issue("wrong_subtest", "Subtest soal kandidat tidak cocok dengan assembly.", {
      sourceQuestionId: source.id,
      sourceSubtestId: source.subtestId,
      subtestId,
    }));
  }
  if (!revision || revision.status !== QuestionRevisionStatus.ready) {
    blockers.push(issue("stale_candidate", "Kandidat tidak lagi menunjuk revisi Question yang Ready.", {
      sourceQuestionId: source.id,
      sourceQuestionRevisionId: identity?.sourceQuestionRevisionId,
    }));
    return blockers;
  }
  if (identity && (identity.sourceQuestionRevisionId !== revision.id || identity.sourceContentDigest !== revision.contentDigest)) {
    blockers.push(issue("stale_candidate", "Revisi atau digest kandidat sudah berubah. Muat ulang pilihan sumber sebelum menyimpan.", {
      currentDigest: revision.contentDigest,
      currentRevisionId: revision.id,
      sourceQuestionId: source.id,
      suppliedDigest: identity.sourceContentDigest,
      suppliedRevisionId: identity.sourceQuestionRevisionId,
    }));
  }
  if (!revision.stem.trim()) {
    blockers.push(issue("options", "Stem soal kandidat kosong.", { sourceQuestionId: source.id }));
  }
  const answerMode = answerModeForQuestionType(revision.questionType);
  const answerKey = answerMode
    ? validateAnswerKey(answerMode, revision.options.map((option) => ({ id: option.label, isCorrect: option.isCorrect })))
    : null;
  if (revision.options.length < 2 || revision.options.length > 5 || !answerMode || !answerKey?.ok || revision.options.some((option) => !option.content.trim())) {
    blockers.push(issue("options", "Kandidat harus memiliki 2–5 opsi berisi dengan kunci jawaban yang valid.", {
      optionCount: revision.options.length,
      sourceQuestionId: source.id,
    }));
  }
  if (!revision.explanation?.trim() && !revision.explanationAssetId) {
    blockers.push(issue("missing_explanation", "Kandidat belum memiliki penjelasan teks atau media.", { sourceQuestionId: source.id }));
  }
  const mediaReady = isReadyAsset(revision.promptAsset)
    && isReadyAsset(revision.explanationAsset)
    && revision.options.every((option) => isReadyAsset(option.asset));
  if (!mediaReady) {
    blockers.push(issue("media_not_ready", "Media prompt, penjelasan, atau opsi kandidat belum Ready.", { sourceQuestionId: source.id }));
  }
  return blockers;
}

function versionItemContentIssues(item: VersionItemRecord, subtestId: string): AssemblyReadinessIssue[] {
  const blockers: AssemblyReadinessIssue[] = [];
  if (!item.sourceQuestionId.trim() || !item.sourceQuestionRevisionId?.trim() || !item.sourceContentDigest?.trim()) {
    blockers.push(issue("stale_candidate", "Snapshot soal tidak memiliki identitas Question, revisi Ready, dan digest yang lengkap.", {
      sourceQuestionId: item.sourceQuestionId,
      sourceQuestionRevisionId: item.sourceQuestionRevisionId,
    }));
  }
  if (item.subtestId !== subtestId) {
    blockers.push(issue("wrong_subtest", "Snapshot soal tidak cocok dengan Subtest assembly.", {
      itemSubtestId: item.subtestId,
      subtestId,
      sourceQuestionId: item.sourceQuestionId,
    }));
  }
  if (!item.prompt.trim()) {
    blockers.push(issue("options", "Snapshot stem soal kosong.", { sourceQuestionId: item.sourceQuestionId }));
  }
  const answerMode = answerModeForQuestionType(item.sourceQuestionRevision?.questionType)
    ?? (item.options.filter((option) => option.isCorrect).length > 1 ? "multiple_choice" : "single_choice");
  const answerKey = validateAnswerKey(answerMode, item.options.map((option) => ({ id: option.choiceKey, isCorrect: option.isCorrect })));
  if (item.options.length < 2
    || item.options.length > 5
    || !answerKey.ok
    || item.options.some((option) => !option.content.trim())) {
    blockers.push(issue("options", "Snapshot harus memiliki 2–5 opsi berisi dengan kunci jawaban yang valid.", {
      optionCount: item.options.length,
      sourceQuestionId: item.sourceQuestionId,
    }));
  }
  if (!item.explanation?.trim() && !item.explanationAssetId) {
    blockers.push(issue("missing_explanation", "Snapshot belum memiliki penjelasan teks atau media.", { sourceQuestionId: item.sourceQuestionId }));
  }
  const mediaReady = isReadyAsset(item.promptAsset)
    && isReadyAsset(item.explanationAsset)
    && item.options.every((option) => isReadyAsset(option.asset));
  if (!mediaReady) {
    blockers.push(issue("media_not_ready", "Media snapshot prompt, penjelasan, atau opsi belum Ready.", { sourceQuestionId: item.sourceQuestionId }));
  }
  return blockers;
}

function snapshotSample(item: VersionItemRecord) {
  return {
    difficulty: item.difficulty,
    prompt: item.prompt,
    sourceContentDigest: item.sourceContentDigest ?? "",
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? "",
  };
}

function candidateIssues(
  sources: SourceRecord[],
  candidates: AssemblyCandidateSource[],
  definition: NormalizedAssemblyDefinition,
) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const blockers: AssemblyReadinessIssue[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.sourceQuestionId)) {
      blockers.push(issue("duplicate_candidate", "Satu soal sumber hanya boleh dipilih sekali dalam assembly.", { sourceQuestionId: candidate.sourceQuestionId }));
      continue;
    }
    seen.add(candidate.sourceQuestionId);
    blockers.push(...sourceContentIssues(sourceById.get(candidate.sourceQuestionId), definition.subtestId, definition.scope.bankIds, candidate));
  }
  return blockers;
}

type AssemblyBankPurpose = "quiz" | "tryout";

function expectedPurposeForTarget(target: AssemblyAttachmentTarget): AssemblyBankPurpose {
  if (target === "kuis") return "quiz";
  if (target === "tryout") return "tryout";
  throw new AssemblyValidationError("scope", "Target attachment assembly tidak valid.", { target });
}

async function readScopeState(
  tx: Prisma.TransactionClient,
  definition: NormalizedAssemblyDefinition,
  expectedPurpose: AssemblyBankPurpose = "tryout",
) {
  const [subtest, banks, folders, categoryAssignments] = await Promise.all([
    tx.subtest.findUnique({ where: { id: definition.subtestId }, select: { code: true, id: true, isActive: true, name: true } }),
    tx.questionBank.findMany({ where: { id: { in: definition.scope.bankIds } }, select: { folderId: true, id: true, name: true, purpose: true, status: true } }),
    definition.scope.folderIds.length
      ? tx.questionBankFolder.findMany({ where: { id: { in: definition.scope.folderIds } }, select: { id: true, name: true, purpose: true } })
      : Promise.resolve([]),
    definition.scope.categoryIds.length
      ? tx.questionBankCategoryAssignment.findMany({
        where: { categoryId: { in: definition.scope.categoryIds }, questionBankId: { in: definition.scope.bankIds } },
        select: { categoryId: true, questionBankId: true },
      })
      : Promise.resolve([]),
  ]);
  const blockers: AssemblyReadinessIssue[] = [];
  if (!subtest) {
    blockers.push(issue("wrong_subtest", "Subtest assembly tidak ditemukan.", { subtestId: definition.subtestId }));
  } else if (!subtest.isActive) {
    blockers.push(issue("wrong_subtest", "Subtest assembly sedang tidak aktif.", { subtestId: definition.subtestId }));
  }
  const bankById = new Map(banks.map((bank) => [bank.id, bank]));
  for (const bankId of definition.scope.bankIds) {
    const bank = bankById.get(bankId);
    if (!bank) {
      blockers.push(issue("scope", "Bank Soal cakupan tidak ditemukan.", { bankId }));
    } else if (bank.status === ContentStatus.archived) {
      blockers.push(issue("archived_bank", "Bank Soal cakupan sudah diarsipkan.", { bankId }));
    }
    if (bank && bank.purpose !== expectedPurpose) {
      blockers.push(issue("scope", `Assembly hanya dapat memakai Bank Soal tujuan ${expectedPurpose === "quiz" ? "Kuis" : "Tryout"}.`, {
        bankId,
        expectedPurpose,
        purpose: bank.purpose,
      }));
    }
  }
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folderId of definition.scope.folderIds) {
    const folder = folderById.get(folderId);
    if (!folder) {
      blockers.push(issue("scope", "Folder cakupan tidak ditemukan.", { folderId }));
    } else if (folder.purpose !== expectedPurpose) {
      blockers.push(issue("scope", `Assembly hanya dapat memakai folder Bank Soal tujuan ${expectedPurpose === "quiz" ? "Kuis" : "Tryout"}.`, {
        expectedPurpose,
        folderId,
        purpose: folder.purpose,
      }));
    }
  }
  const categoryIds = new Set(categoryAssignments.map((assignment) => assignment.categoryId));
  for (const categoryId of definition.scope.categoryIds) {
    if (!categoryIds.has(categoryId)) blockers.push(issue("scope", "Kategori cakupan tidak terpasang pada Bank Soal yang dipilih.", { categoryId }));
  }
  return { blockers, banks, folders, subtest };
}

async function lockAndReadSources(tx: Prisma.TransactionClient, sourceQuestionIds: readonly string[]) {
  const ids = [...new Set(sourceQuestionIds)].sort();
  if (!ids.length) return [] as SourceRecord[];
  await tx.$queryRaw`
    SELECT q.id
    FROM questions q
    JOIN question_banks b ON b.id = q.question_bank_id
    JOIN question_revisions r ON r.id = q.current_revision_id
    WHERE q.id IN (${Prisma.join(ids)})
    ORDER BY q.id
    FOR SHARE OF q, b, r
  `;
  return tx.question.findMany({ where: { id: { in: ids } }, include: sourceInclude });
}

async function readSources(tx: Prisma.TransactionClient, sourceQuestionIds: readonly string[]) {
  const ids = [...new Set(sourceQuestionIds)].sort();
  if (!ids.length) return [] as SourceRecord[];
  return tx.question.findMany({ where: { id: { in: ids } }, include: sourceInclude });
}

async function assertScope(tx: Prisma.TransactionClient, definition: NormalizedAssemblyDefinition, expectedPurpose: AssemblyBankPurpose = "tryout") {
  const state = await readScopeState(tx, definition, expectedPurpose);
  if (state.blockers.length) throwIssue(state.blockers[0]);
  return state;
}

async function assertCandidates(
  tx: Prisma.TransactionClient,
  definition: NormalizedAssemblyDefinition,
  candidates: AssemblyCandidateSource[],
  lockSources: boolean,
) {
  if (!candidates.length) {
    throw new AssemblyValidationError("shortage", "Assembly belum memiliki kandidat yang dapat dipakai.", {
      availableCount: 0,
      requestedCount: definition.rule?.requestedCount ?? null,
    });
  }
  const sources = lockSources
    ? await lockAndReadSources(tx, candidates.map((candidate) => candidate.sourceQuestionId))
    : await readSources(tx, candidates.map((candidate) => candidate.sourceQuestionId));
  const blockers = candidateIssues(sources, candidates, definition);
  if (sources.length !== candidates.length) {
    blockers.unshift(issue("stale_candidate", "Sebagian kandidat tidak lagi ditemukan.", {
      foundCount: sources.length,
      requestedCandidateCount: candidates.length,
    }));
  }
  if (blockers.length) throwIssue(blockers[0]);
  const requestedCount = definition.rule?.requestedCount ?? candidates.length;
  if (candidates.length < requestedCount) {
    throw new AssemblyValidationError("shortage", "Jumlah kandidat belum mencukupi jumlah soal yang diminta.", {
      availableCount: candidates.length,
      requestedCount,
    });
  }
  return { sources };
}

function packageSelect() {
  return {
    createdByUserId: true,
    description: true,
    id: true,
    mode: true,
    revision: true,
    sourceBankId: true,
    status: true,
    subtestId: true,
    title: true,
    items: {
      orderBy: { sortOrder: "asc" as const },
      select: {
        pointValue: true,
        sourceContentDigest: true,
        sourceQuestionId: true,
        sourceQuestionRevisionId: true,
        sourceRevisionProvenance: true,
        sortOrder: true,
      },
    },
  } satisfies Prisma.ReusableQuestionPackageSelect;
}

async function readDraftVersion(tx: Prisma.TransactionClient, packageId: string) {
  return tx.reusableQuestionPackageVersion.findFirst({
    where: { packageId, status: ContentStatus.draft },
    include: versionInclude,
    orderBy: { versionNo: "desc" },
  });
}

async function assertEditablePackage(tx: Prisma.TransactionClient, packageId: string, actorId: string, isAdmin: boolean) {
  await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${packageId}::uuid FOR UPDATE`;
  const packageRecord = await tx.reusableQuestionPackage.findUnique({ where: { id: packageId }, select: packageSelect() });
  if (!packageRecord) throw new AssemblyValidationError("not_found", "Assembly tidak ditemukan.", { packageId });
  if (packageRecord.createdByUserId !== actorId && !isAdmin) {
    throw new AssemblyValidationError("unauthorized", "Hanya pembuat atau admin yang dapat mengubah assembly ini.", { packageId });
  }
  if (packageRecord.status === ContentStatus.archived) {
    throw new AssemblyValidationError("locked", "Assembly yang diarsipkan tidak dapat diubah.", { packageId });
  }
  return packageRecord;
}

async function nextVersionNo(tx: Prisma.TransactionClient, packageId: string) {
  const latest = await tx.reusableQuestionPackageVersion.findFirst({
    where: { packageId },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });
  return (latest?.versionNo ?? 0) + 1;
}

function toAssemblyVersionDto(version: VersionRecord) {
  return {
    bankIds: version.bankScopes.map((scope) => scope.questionBankId),
    bankScopes: version.bankScopes.map((scope) => ({ id: scope.questionBank.id, name: scope.questionBank.name, purpose: scope.questionBank.purpose })),
    bankPurposes: version.bankScopes.map((scope) => scope.questionBank.purpose as AssemblyBankPurpose),
    candidates: version.items.map((item) => ({
      difficulty: item.difficulty,
      prompt: item.prompt,
      sourceContentDigest: item.sourceContentDigest,
      sourceQuestionId: item.sourceQuestionId,
      sourceQuestionRevisionId: item.sourceQuestionRevisionId,
    })),
    categoryIds: version.categoryScopes.map((scope) => scope.categoryId),
    categoryScopes: version.categoryScopes.map((scope) => ({ id: scope.category.id, name: scope.category.name })),
    definitionDigest: version.definitionDigest,
    folderIds: version.folderScopes.map((scope) => scope.folderId),
    folderScopes: version.folderScopes.map((scope) => ({ id: scope.folder.id, name: scope.folder.name, purpose: scope.folder.purpose })),
    id: version.id,
    itemCount: version.items.length,
    mode: version.mode as AssemblyMode,
    packageId: version.package.id,
    packageTitle: version.package.title,
    readyAt: version.readyAt?.toISOString() ?? null,
    rule: version.rule
      ? {
        easyCount: version.rule.easyCount,
        hardCount: version.rule.hardCount,
        mediumCount: version.rule.mediumCount,
        requestedCount: version.rule.requestedCount,
      }
      : null,
    sourceBank: version.sourceBank,
    status: version.status,
    subtest: version.subtest,
    versionNo: version.versionNo,
  };
}

function toAttachmentSummary(version: VersionRecord, readiness: AssemblyReadiness): AssemblyAttachmentSummary {
  const dto = toAssemblyVersionDto(version);
  return {
    bankIds: dto.bankIds,
    bankNames: dto.bankScopes.map((scope) => scope.name),
    bankPurposes: dto.bankPurposes,
    categoryIds: dto.categoryIds,
    categoryNames: dto.categoryScopes.map((scope) => scope.name),
    definitionDigest: dto.definitionDigest,
    folderIds: dto.folderIds,
    folderNames: dto.folderScopes.map((scope) => scope.name),
    id: dto.id,
    itemCount: dto.itemCount,
    mode: dto.mode,
    packageId: dto.packageId,
    packageTitle: dto.packageTitle,
    readyAt: dto.readyAt,
    readiness,
    rule: dto.rule,
    status: dto.status,
    subtest: dto.subtest?.code ?? "",
    versionNo: dto.versionNo,
  };
}

function assemblyVersionMatchesPurpose(
  version: Pick<VersionRecord, "bankScopes" | "folderScopes" | "sourceBank">,
  expectedPurpose: AssemblyBankPurpose,
) {
  return version.sourceBank.purpose === expectedPurpose
    && version.bankScopes.length > 0
    && version.bankScopes.every((scope) => scope.questionBank.purpose === expectedPurpose)
    && version.folderScopes.every((scope) => scope.folder.purpose === expectedPurpose);
}

async function readVersionForResponse(tx: Prisma.TransactionClient, versionId: string) {
  return tx.reusableQuestionPackageVersion.findUnique({ where: { id: versionId }, include: versionInclude });
}

async function saveAssemblyDraft(input: SaveAssemblyDraftInput, actorId: string, options: AssemblyActorOptions = {}) {
  const definition = validateAssemblyDefinitionShape(input);
  const isAdmin = options.isAdmin === true;
  return prisma.$transaction(async (tx) => {
    let packageRecord;
    if (input.id) {
      packageRecord = await assertEditablePackage(tx, input.id, actorId, isAdmin);
      const hasReadyRevision = await tx.reusableQuestionPackageVersion.findFirst({ where: { packageId: input.id, status: ContentStatus.published }, select: { id: true } });
      if (hasReadyRevision && packageRecord.mode !== definition.mode) {
        throw new AssemblyValidationError("invalid_mode", "Mode assembly tidak dapat diubah setelah memiliki versi Ready.", {
          currentMode: packageRecord.mode,
          requestedMode: definition.mode,
        });
      }
    }

    const scopeState = await assertScope(tx, definition);
    if (definition.candidates.length) {
      await assertCandidates(tx, definition, definition.candidates, true);
    }

    if (!packageRecord) {
      packageRecord = await tx.reusableQuestionPackage.create({
        data: {
          code: codeFromTitle(definition.title),
          createdByUserId: actorId,
          description: definition.description,
          mode: definition.mode as ReusableQuestionPackageMode,
          sourceBankId: definition.scope.bankIds[0],
          subtestId: definition.subtestId,
          title: definition.title,
          updatedByUserId: actorId,
        },
        select: packageSelect(),
      });
    } else {
      packageRecord = await tx.reusableQuestionPackage.update({
        where: { id: packageRecord.id },
        data: {
          description: definition.description,
          mode: definition.mode as ReusableQuestionPackageMode,
          revision: { increment: 1 },
          sourceBankId: definition.scope.bankIds[0],
          subtestId: definition.subtestId,
          title: definition.title,
          updatedByUserId: actorId,
          status: ContentStatus.draft,
        },
        select: packageSelect(),
      });
    }

    await tx.reusableQuestionPackageItem.deleteMany({ where: { packageId: packageRecord.id } });
    if (definition.candidates.length) {
      const sources = await readSources(tx, definition.candidates.map((candidate) => candidate.sourceQuestionId));
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      await tx.reusableQuestionPackageItem.createMany({
        data: definition.candidates.map((candidate, index) => {
          const source = sourceById.get(candidate.sourceQuestionId)!;
          const revision = source.currentRevision!;
          return {
            packageId: packageRecord.id,
            pointValue: candidate.pointValue,
            sortOrder: index + 1,
            sourceContentDigest: revision.contentDigest,
            sourceQuestionId: source.id,
            sourceQuestionRevisionId: revision.id,
            sourceRevisionProvenance: revision.provenance,
          };
        }),
      });
    }

    let draft = await readDraftVersion(tx, packageRecord.id);
    if (!draft) {
      draft = await tx.reusableQuestionPackageVersion.create({
        data: {
          createdByUserId: actorId,
          mode: definition.mode as ReusableQuestionPackageMode,
          packageId: packageRecord.id,
          sourceBankId: definition.scope.bankIds[0],
          subtestId: definition.subtestId,
          versionNo: await nextVersionNo(tx, packageRecord.id),
        },
        include: versionInclude,
      });
    } else {
      await tx.reusableQuestionPackageVersion.update({
        where: { id: draft.id },
        data: {
          definitionDigest: null,
          mode: definition.mode as ReusableQuestionPackageMode,
          sourceBankId: definition.scope.bankIds[0],
          subtestId: definition.subtestId,
        },
      });
    }

    await tx.reusableQuestionPackageVersionBankScope.deleteMany({ where: { packageVersionId: draft.id } });
    await tx.reusableQuestionPackageVersionFolderScope.deleteMany({ where: { packageVersionId: draft.id } });
    await tx.reusableQuestionPackageVersionCategoryScope.deleteMany({ where: { packageVersionId: draft.id } });
    await tx.reusableQuestionPackageVersionRule.deleteMany({ where: { packageVersionId: draft.id } });
    await tx.reusableQuestionPackageVersionItem.deleteMany({ where: { packageVersionId: draft.id } });
    await tx.reusableQuestionPackageVersionBankScope.createMany({ data: scopeState.banks.map((bank) => ({ packageVersionId: draft.id, questionBankId: bank.id })) });
    if (definition.scope.folderIds.length) {
      await tx.reusableQuestionPackageVersionFolderScope.createMany({ data: definition.scope.folderIds.map((folderId) => ({ folderId, packageVersionId: draft.id })) });
    }
    if (definition.scope.categoryIds.length) {
      await tx.reusableQuestionPackageVersionCategoryScope.createMany({ data: definition.scope.categoryIds.map((categoryId) => ({ categoryId, packageVersionId: draft.id })) });
    }
    if (definition.rule) {
      await tx.reusableQuestionPackageVersionRule.create({ data: { ...definition.rule, packageVersionId: draft.id } });
    }

    const response = await readVersionForResponse(tx, draft.id);
    if (!response) throw new AssemblyValidationError("not_found", "Draft assembly tidak dapat dibaca setelah disimpan.", { packageId: packageRecord.id });
    return { packageId: packageRecord.id, revision: packageRecord.revision, version: toAssemblyVersionDto(response) };
  });
}

async function readyAssemblyDraft(packageId: string, actorId: string, options: AssemblyActorOptions = {}) {
  return prisma.$transaction(async (tx) => {
    const packageRecord = await assertEditablePackage(tx, packageId, actorId, options.isAdmin === true);
    const draft = await readDraftVersion(tx, packageId);
    if (!draft) throw new AssemblyValidationError("not_found", "Assembly belum memiliki draft versi yang dapat di-Ready.", { packageId });
    if (draft.mode !== packageRecord.mode) {
      throw new AssemblyValidationError("invalid_mode", "Mode draft tidak cocok dengan mode package.", {
        packageMode: packageRecord.mode,
        versionMode: draft.mode,
      });
    }
    const definition = validateAssemblyDefinitionShape(toDefinitionInput(packageRecord, draft, packageRecord.items.map(candidateFromPackageItem)));
    if (definition.mode === "blueprint" && packageRecord.items.length) {
      throw new AssemblyValidationError("scope", "Blueprint tidak boleh menyimpan kandidat fisik.", { packageId });
    }
    await assertScope(tx, definition);
    const candidates = definition.candidates;
    const candidateState = definition.mode === "blueprint"
      ? { sources: [] as SourceRecord[] }
      : await assertCandidates(tx, definition, candidates, true);

    const sourceById = new Map(candidateState.sources.map((source) => [source.id, source]));
    await tx.reusableQuestionPackageVersionItem.deleteMany({ where: { packageVersionId: draft.id } });
    for (const candidate of candidates) {
      const source = sourceById.get(candidate.sourceQuestionId);
      const revision = source?.currentRevision;
      if (!source || !revision) throw new AssemblyValidationError("stale_candidate", "Kandidat berubah saat versi assembly disiapkan.", { sourceQuestionId: candidate.sourceQuestionId });
    }
    await Promise.all(
      candidates.map(async (candidate, index) => {
        const source = sourceById.get(candidate.sourceQuestionId)!;
        const revision = source.currentRevision!;
        const item = await tx.reusableQuestionPackageVersionItem.create({
          data: {
            difficulty: revision.difficulty,
            explanation: revision.explanation,
            explanationAssetId: revision.explanationAssetId,
            packageVersionId: draft.id,
            pointValue: candidate.pointValue,
            prompt: revision.stem,
            promptAssetId: revision.promptAssetId,
            sortOrder: index + 1,
            sourceContentDigest: revision.contentDigest,
            sourceQuestionId: source.id,
            sourceQuestionRevisionId: revision.id,
            sourceRevisionProvenance: revision.provenance,
            subtestId: definition.subtestId,
          },
        });
        await tx.reusableQuestionPackageVersionItemOption.createMany({
          data: revision.options.map((option, optIndex) => ({
            assetId: option.assetId,
            choiceKey: option.label || String.fromCharCode(65 + optIndex),
            content: option.content,
            isCorrect: option.isCorrect,
            packageVersionItemId: item.id,
            sortOrder: optIndex,
            sourceQuestionRevisionOptionId: option.id,
          })),
        });
      }),
    );

    await tx.reusableQuestionPackageVersion.update({
      where: { id: draft.id },
      data: {
        definitionDigest: assemblyDefinitionDigest(definition),
        provenance: ReusableQuestionPackageVersionProvenance.authored,
        readyAt: new Date(),
        status: ContentStatus.published,
      },
    });
    await tx.reusableQuestionPackage.update({ where: { id: packageId }, data: { revision: { increment: 1 }, status: ContentStatus.published, updatedByUserId: actorId } });
    const response = await readVersionForResponse(tx, draft.id);
    if (!response) throw new AssemblyValidationError("not_found", "Versi Ready tidak dapat dibaca setelah disimpan.", { packageId });
    return toAssemblyVersionDto(response);
  });
}

function definitionInputForVersion(version: VersionRecord): AssemblyDefinitionInput {
  return toDefinitionInput(
    version.package,
    version,
    version.items.map(candidateFromVersionItem),
  );
}

async function readyVersionForAttachment(
  tx: Prisma.TransactionClient,
  versionId: string,
  target: AssemblyAttachmentTarget,
  targetSubtestCode: string,
  targetTestType: AssemblyAttachmentTestType,
) {
  expectedPurposeForTarget(target);
  const version = await tx.reusableQuestionPackageVersion.findFirst({
    where: { id: versionId, package: { status: { not: ContentStatus.archived } }, status: ContentStatus.published },
    include: versionInclude,
  });
  if (!version) throw new AssemblyValidationError("not_found", "Assembly Ready tidak ditemukan atau sudah tidak tersedia.", { versionId });
  const expectedPurpose = expectedPurposeForTarget(target);
  if (!assemblyVersionMatchesPurpose(version, expectedPurpose)) {
    throw new AssemblyValidationError("scope", `Assembly ${target === "kuis" ? "Kuis" : "Tryout"} hanya dapat memakai Bank Soal tujuan ${expectedPurpose === "quiz" ? "Kuis" : "Tryout"}.`, {
      expectedPurpose,
      sourceBankPurpose: version.sourceBank.purpose,
      versionId,
    });
  }
  assertAssemblyAttachmentCompatibility({
    bankIds: version.bankScopes.map((scope) => scope.questionBankId),
    bankPurposes: version.bankScopes.map((scope) => scope.questionBank.purpose),
    mode: version.mode as AssemblyMode,
    subtestCode: version.subtest?.code ?? "",
    target,
    targetTestType,
    targetSubtestCode,
  });
  return version;
}

async function listReadyAssemblyRevisions(target: AssemblyAttachmentTarget = "tryout"): Promise<AssemblyAttachmentSummary[]> {
  const expectedPurpose = expectedPurposeForTarget(target);
  return prisma.$transaction(async (tx) => {
    const versions = await tx.reusableQuestionPackageVersion.findMany({
      where: { package: { status: { not: ContentStatus.archived } }, status: ContentStatus.published },
      include: versionInclude,
      orderBy: [{ package: { title: "asc" } }, { versionNo: "desc" }],
    });
    const matchingVersions = versions.filter((version) => assemblyVersionMatchesPurpose(version, expectedPurpose));
    const summaries = await Promise.all(
      matchingVersions.map(async (version) => {
        const report = await collectReadiness(tx, definitionInputForVersion(version), {
          expectedDefinitionDigest: version.definitionDigest,
          expectedPackageMode: version.package.mode as AssemblyMode,
          expectedSourceBankId: version.sourceBankId,
          expectedSubtestId: version.subtestId,
          expectedPurpose,
          snapshotItems: version.mode === ReusableQuestionPackageMode.fixed_set ? version.items : undefined,
        });
        return { summary: toAttachmentSummary(version, report.readiness), version };
      }),
    );
    return summaries.map(({ summary }) => summary);
  });
}

async function getReadyAssemblyRevision(versionId: string, target: AssemblyAttachmentTarget = "tryout"): Promise<AssemblyAttachmentSummary | null> {
  const expectedPurpose = expectedPurposeForTarget(target);
  return prisma.$transaction(async (tx) => {
    const version = await tx.reusableQuestionPackageVersion.findFirst({
      where: { id: versionId, package: { status: { not: ContentStatus.archived } }, status: ContentStatus.published },
      include: versionInclude,
    });
    if (!version) return null;
    if (!assemblyVersionMatchesPurpose(version, expectedPurpose)) return null;
    const report = await collectReadiness(tx, definitionInputForVersion(version), {
      expectedDefinitionDigest: version.definitionDigest,
      expectedPackageMode: version.package.mode as AssemblyMode,
      expectedSourceBankId: version.sourceBankId,
      expectedSubtestId: version.subtestId,
      expectedPurpose,
      snapshotItems: version.mode === ReusableQuestionPackageMode.fixed_set ? version.items : undefined,
    });
    return toAttachmentSummary(version, report.readiness);
  });
}

async function getReadyAssemblyAttachment(
  versionId: string,
  target: AssemblyAttachmentTarget,
  targetSubtestCode: string,
  targetTestType: AssemblyAttachmentTestType,
) {
  return prisma.$transaction(async (tx) => {
    const version = await readyVersionForAttachment(tx, versionId, target, targetSubtestCode, targetTestType);
    const report = await collectReadiness(tx, definitionInputForVersion(version), {
      expectedDefinitionDigest: version.definitionDigest,
      expectedPackageMode: version.package.mode as AssemblyMode,
      expectedSourceBankId: version.sourceBankId,
      expectedSubtestId: version.subtestId,
      expectedPurpose: expectedPurposeForTarget(target),
      snapshotItems: version.mode === ReusableQuestionPackageMode.fixed_set ? version.items : undefined,
    });
    if (!report.readiness.ready) throwIssue(report.readiness.blockers[0] ?? issue("stale_candidate", "Assembly Ready tidak dapat dipakai untuk attachment."));
    return toAttachmentSummary(version, report.readiness);
  });
}

async function getAssemblyDraftForEdit(packageId: string, actorId: string, options: AssemblyActorOptions = {}) {
  return prisma.$transaction(async (tx) => {
    const packageRecord = await assertEditablePackage(tx, packageId, actorId, options.isAdmin === true);
    const draft = await readDraftVersion(tx, packageId);
    if (!draft) return null;
    return {
      package: {
        description: packageRecord.description,
        id: packageRecord.id,
        mode: packageRecord.mode as AssemblyMode,
        revision: packageRecord.revision,
        title: packageRecord.title,
      },
      version: toAssemblyVersionDto(draft),
    };
  });
}

async function queryBlueprintSources(tx: Prisma.TransactionClient, definition: NormalizedAssemblyDefinition, expectedPurpose: AssemblyBankPurpose = "tryout") {
  return tx.question.findMany({
    where: {
      currentRevision: { status: QuestionRevisionStatus.ready },
      questionBank: {
        is: {
          ...(definition.scope.categoryIds.length ? { categories: { some: { categoryId: { in: definition.scope.categoryIds } } } } : {}),
          ...(definition.scope.folderIds.length ? { folderId: { in: definition.scope.folderIds } } : {}),
          purpose: expectedPurpose,
          status: { not: ContentStatus.archived },
        },
      },
      questionBankId: { in: definition.scope.bankIds },
      status: ContentStatus.published,
      subtestId: definition.subtestId,
    },
    include: sourceInclude,
    orderBy: { id: "asc" },
  });
}

type ReadinessOptions = {
  expectedDefinitionDigest?: string | null;
  expectedPackageMode?: AssemblyMode | null;
  expectedSourceBankId?: string | null;
  expectedSubtestId?: string | null;
  expectedPurpose?: AssemblyBankPurpose;
  snapshotItems?: readonly VersionItemRecord[];
};

async function collectReadiness(
  tx: Prisma.TransactionClient,
  definitionInput: AssemblyDefinitionInput,
  options: ReadinessOptions = {},
): Promise<{ readiness: AssemblyReadiness; sources: SourceRecord[] }> {
  let definition: NormalizedAssemblyDefinition;
  try {
    definition = validateAssemblyDefinitionShape(definitionInput);
  } catch (error) {
    if (!(error instanceof AssemblyValidationError)) throw error;
    return {
      readiness: {
        availableByDifficulty: { easy: 0, hard: 0, medium: 0 },
        blockers: [{ code: error.code, details: error.details, message: error.message }],
        candidateCount: 0,
        eligibleCount: 0,
        mode: definitionInput.mode,
        ready: false,
        requestedCount: definitionInput.rule?.requestedCount ?? null,
      },
      sources: [],
    };
  }

  const expectedPurpose = options.expectedPurpose ?? "tryout";
  const scopeState = await readScopeState(tx, definition, expectedPurpose);
  const blockers = [...scopeState.blockers];

  if (options.expectedPackageMode !== undefined && options.expectedPackageMode !== definition.mode) {
    blockers.push(issue("invalid_mode", "Mode assembly tidak cocok dengan package.", {
      packageMode: options.expectedPackageMode,
      versionMode: definition.mode,
    }));
  }
  if (options.expectedSubtestId !== undefined) {
    if (!options.expectedSubtestId) {
      blockers.push(issue("wrong_subtest", "Versi Ready assembly tidak memiliki Subtest."));
    } else if (options.expectedSubtestId !== definition.subtestId) {
      blockers.push(issue("wrong_subtest", "Subtest assembly tidak cocok dengan versi Ready.", {
        versionSubtestId: options.expectedSubtestId,
        definitionSubtestId: definition.subtestId,
      }));
    }
  }
  if (options.expectedSourceBankId !== undefined
    && (!options.expectedSourceBankId || !definition.scope.bankIds.includes(options.expectedSourceBankId))) {
    blockers.push(issue("scope", "Bank sumber assembly tidak cocok dengan cakupan Bank Soal.", {
      scopeBankIds: definition.scope.bankIds,
      versionSourceBankId: options.expectedSourceBankId,
    }));
  }

  if (options.expectedDefinitionDigest !== undefined) {
    if (!options.expectedDefinitionDigest) {
      blockers.push(issue("stale_candidate", "Assembly Ready tidak memiliki definition digest yang dapat diverifikasi."));
    } else {
      const recomputedDefinitionDigest = assemblyDefinitionDigest(definition);
      if (recomputedDefinitionDigest !== options.expectedDefinitionDigest) {
        blockers.push(issue("stale_candidate", "Definition assembly tidak lagi cocok dengan versi Ready.", {
          recomputedDefinitionDigest,
          versionDefinitionDigest: options.expectedDefinitionDigest,
        }));
      }
    }
  }

  if (definition.mode === "fixed_set" && options.snapshotItems) {
    const snapshotItems = [...options.snapshotItems];
    if (!snapshotItems.length) {
      blockers.push(issue("shortage", "Set tetap belum memiliki snapshot soal yang dapat dipakai.", {
        availableCount: 0,
        requestedCount: definition.candidates.length,
      }));
    }
    const snapshotBlockers = snapshotItems.flatMap((item) => versionItemContentIssues(item, definition.subtestId));
    blockers.push(...snapshotBlockers);
    const eligibleItems = snapshotItems.filter((item) => versionItemContentIssues(item, definition.subtestId).length === 0);
    const availableByDifficulty = { easy: 0, hard: 0, medium: 0 };
    for (const item of eligibleItems) {
      const difficulty = item.difficulty;
      if (difficulty === DifficultyLevel.easy || difficulty === DifficultyLevel.medium || difficulty === DifficultyLevel.hard) {
        availableByDifficulty[difficulty] += 1;
      }
    }
    return {
      readiness: {
        availableByDifficulty,
        blockers,
        candidateCount: snapshotItems.length,
        eligibleCount: eligibleItems.length,
        mode: definition.mode,
        ready: blockers.length === 0,
        requestedCount: null,
      },
      sources: [],
    };
  }

  let sources: SourceRecord[] = [];
  let eligibleSources: SourceRecord[] = [];
  if (definition.mode === "blueprint") {
    const scopeSources = await queryBlueprintSources(tx, definition, expectedPurpose);
    for (const source of scopeSources) blockers.push(...sourceContentIssues(source, definition.subtestId, definition.scope.bankIds));
    eligibleSources = scopeSources.filter((source) => sourceContentIssues(source, definition.subtestId, definition.scope.bankIds).length === 0);
  } else {
    const candidates = definition.candidates;
    if (!candidates.length) blockers.push(issue("shortage", "Assembly belum memiliki kandidat yang dapat dipakai.", {
      availableCount: 0,
      requestedCount: definition.rule?.requestedCount ?? null,
    }));
    sources = await readSources(tx, candidates.map((candidate) => candidate.sourceQuestionId));
    blockers.push(...candidateIssues(sources, candidates, definition));
    const requestedCount = definition.rule?.requestedCount ?? 0;
    if (candidates.length < requestedCount) blockers.push(issue("shortage", "Jumlah kandidat lebih sedikit dari jumlah soal yang diminta.", { availableCount: candidates.length, requestedCount }));
    eligibleSources = sources.filter((source) => sourceContentIssues(source, definition.subtestId, definition.scope.bankIds, candidates.find((candidate) => candidate.sourceQuestionId === source.id)).length === 0);
  }

  const availableByDifficulty = { easy: 0, hard: 0, medium: 0 };
  for (const source of eligibleSources) {
    const difficulty = source.currentRevision?.difficulty;
    if (difficulty === DifficultyLevel.easy || difficulty === DifficultyLevel.medium || difficulty === DifficultyLevel.hard) availableByDifficulty[difficulty] += 1;
  }
  const requestedCount = definition.rule?.requestedCount ?? null;
  if (definition.mode === "blueprint" && definition.rule) {
    const quotaByDifficulty = { easy: definition.rule.easyCount, hard: definition.rule.hardCount, medium: definition.rule.mediumCount };
    for (const difficulty of ["easy", "medium", "hard"] as const) {
      if (availableByDifficulty[difficulty] < quotaByDifficulty[difficulty]) blockers.push(issue("shortage", `Cakupan Blueprint belum memiliki cukup soal ${difficulty}.`, {
        availableCount: availableByDifficulty[difficulty],
        difficulty,
        requestedCount: quotaByDifficulty[difficulty],
      }));
    }
  }
  return {
    readiness: {
      availableByDifficulty,
      blockers,
      candidateCount: definition.mode === "blueprint" ? 0 : definition.candidates.length,
      eligibleCount: eligibleSources.length,
      mode: definition.mode,
      ready: blockers.length === 0,
      requestedCount,
    },
    sources: eligibleSources,
  };
}

function kuisItemFromVersionItem(item: VersionItemRecord): KuisAssemblyItem {
  const questionType = answerModeForQuestionType(item.sourceQuestionRevision?.questionType)
    ?? (item.options.filter((option) => option.isCorrect).length > 1 ? "multiple_choice" : "single_choice");
  return {
    difficulty: item.difficulty,
    explanation: item.explanation,
    explanationAssetId: item.explanationAssetId,
    options: item.options.map((option) => ({
      assetId: option.assetId,
      choiceKey: option.choiceKey,
      content: option.content,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
      sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
    })),
    questionType,
    prompt: item.prompt,
    promptAssetId: item.promptAssetId,
    sourceContentDigest: item.sourceContentDigest ?? "",
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? "",
    sourceRevisionProvenance: item.sourceRevisionProvenance ?? QuestionRevisionProvenance.legacy_unknown,
    subtestId: item.subtestId,
  };
}

function kuisItemFromSource(source: SourceRecord, subtestId: string): KuisAssemblyItem {
  const revision = source.currentRevision;
  if (!revision) {
    throw new AssemblyValidationError("stale_candidate", "Kandidat Kuis tidak lagi menunjuk revisi Ready.", { sourceQuestionId: source.id });
  }
  return {
    difficulty: revision.difficulty,
    explanation: revision.explanation ?? source.explanation ?? null,
    explanationAssetId: revision.explanationAssetId ?? source.explanationAssetId ?? null,
    options: revision.options.map((option, index) => ({
      assetId: option.assetId,
      choiceKey: option.label || String.fromCharCode(65 + index),
      content: option.content,
      isCorrect: option.isCorrect,
      sortOrder: index,
      sourceQuestionRevisionOptionId: option.id,
    })),
    questionType: answerModeForQuestionType(revision.questionType) ?? "single_choice",
    prompt: revision.stem,
    promptAssetId: revision.promptAssetId ?? source.promptAssetId ?? null,
    sourceContentDigest: revision.contentDigest,
    sourceQuestionId: source.id,
    sourceQuestionRevisionId: revision.id,
    sourceRevisionProvenance: revision.provenance,
    subtestId,
  };
}

/**
 * Resolve a Ready assembly into the existing StandaloneQuiz item shape while
 * retaining the package/version identity in the caller's transaction.  Kuis
 * intentionally supports only one published Bank and CBT assembly modes.
 */
async function resolveReadyAssemblyForKuis(
  tx: Prisma.TransactionClient,
  versionId: string,
  targetSubtestId: string,
  options: KuisAssemblyResolutionOptions = {},
): Promise<KuisAssemblyMaterialization> {
  await tx.$queryRaw`
    SELECT version.id
    FROM reusable_question_package_versions version
    JOIN reusable_question_packages package ON package.id = version.package_id
    WHERE version.id = ${versionId}::uuid
    FOR SHARE OF version, package
  `;
  const version = await tx.reusableQuestionPackageVersion.findFirst({
    where: {
      id: versionId,
      package: { status: { not: ContentStatus.archived } },
      status: ContentStatus.published,
    },
    include: versionInclude,
  });
  if (!version) {
    throw new AssemblyValidationError("not_found", "Assembly Ready tidak ditemukan atau sudah tidak tersedia.", { versionId });
  }
  if (!version.definitionDigest) {
    throw new AssemblyValidationError("stale_candidate", "Assembly Ready tidak memiliki definition digest yang dapat diverifikasi.", { versionId });
  }
  if (version.package.mode !== version.mode) {
    throw new AssemblyValidationError("invalid_mode", "Mode assembly tidak cocok dengan package.", {
      packageMode: version.package.mode,
      versionMode: version.mode,
      versionId,
    });
  }
  if (!version.subtestId) {
    throw new AssemblyValidationError("wrong_subtest", "Versi Ready assembly tidak memiliki Subtest.", {
      versionSubtestId: version.subtestId,
      versionId,
    });
  }
  if (options.expectedDefinitionDigest && options.expectedDefinitionDigest !== version.definitionDigest) {
    throw new AssemblyValidationError("stale_candidate", "Definition assembly berubah. Muat ulang Kuis sebelum menyimpan.", {
      currentDefinitionDigest: version.definitionDigest,
      expectedDefinitionDigest: options.expectedDefinitionDigest,
      versionId,
    });
  }
  if (options.expectedMode && options.expectedMode !== version.mode) {
    throw new AssemblyValidationError("invalid_mode", "Mode assembly berubah. Muat ulang Kuis sebelum menyimpan.", {
      currentMode: version.mode,
      expectedMode: options.expectedMode,
      versionId,
    });
  }

  const definition = validateAssemblyDefinitionShape(definitionInputForVersion(version));
  const recomputedDefinitionDigest = assemblyDefinitionDigest(definition);
  if (recomputedDefinitionDigest !== version.definitionDigest) {
    throw new AssemblyValidationError("stale_candidate", "Definition assembly tidak lagi cocok dengan versi Ready.", {
      recomputedDefinitionDigest,
      versionDefinitionDigest: version.definitionDigest,
      versionId,
    });
  }
  const scopeState = await assertScope(tx, definition, "quiz");
  assertAssemblyAttachmentCompatibility({
    bankIds: definition.scope.bankIds,
    bankPurposes: scopeState.banks.map((bank) => bank.purpose),
    mode: definition.mode,
    subtestCode: version.subtest?.code ?? "",
    target: "kuis",
    targetTestType: "cbt",
    targetSubtestCode: version.subtest?.code ?? "",
  });
  if (version.subtestId !== targetSubtestId || !version.subtest?.isActive) {
    throw new AssemblyValidationError("wrong_subtest", "Assembly Ready tidak cocok dengan Subtest Kuis yang aktif.", {
      assemblySubtestId: version.subtestId,
      targetSubtestId,
      versionId,
    });
  }
  if (scopeState.banks.length !== 1) {
    throw new AssemblyValidationError("scope", "Kuis hanya dapat memakai assembly dari satu Bank Soal.", {
      bankIds: definition.scope.bankIds,
      versionId,
    });
  }

  const sourceBankId = scopeState.banks[0]?.id;
  if (!sourceBankId) {
    throw new AssemblyValidationError("scope", "Assembly Ready tidak memiliki Bank Soal aktif.", { versionId });
  }
  if (version.sourceBankId !== sourceBankId) {
    throw new AssemblyValidationError("scope", "Bank sumber assembly tidak cocok dengan cakupan Bank Soal.", {
      scopeBankId: sourceBankId,
      versionSourceBankId: version.sourceBankId,
      versionId,
    });
  }
  const assemblySeed = definition.mode === "fixed_set"
    ? null
    : options.seed?.trim() || randomBytes(16).toString("hex");
  let items: KuisAssemblyItem[];

  if (definition.mode === "fixed_set" || definition.mode === "random_pool") {
    const snapshotBlockers = version.items.flatMap((item) => versionItemContentIssues(item, targetSubtestId));
    if (definition.mode === "fixed_set") {
      if (!version.items.length) {
        throw new AssemblyValidationError("shortage", "Set tetap belum memiliki snapshot soal yang dapat dipakai.", {
          versionId,
        });
      }
      if (snapshotBlockers.length) throwIssue(snapshotBlockers[0]);
      items = version.items.map(kuisItemFromVersionItem);
    } else {
      const candidates = version.items.map(candidateFromVersionItem);
      await assertCandidates(tx, definition, candidates, true);
      if (snapshotBlockers.length) throwIssue(snapshotBlockers[0]);
      let selected;
      try {
        selected = resolvePoolCandidates(version.items.map((item) => ({
          difficulty: item.difficulty === DifficultyLevel.easy || item.difficulty === DifficultyLevel.medium || item.difficulty === DifficultyLevel.hard
            ? item.difficulty
            : undefined,
          sortOrder: item.sortOrder,
          sourceContentDigest: item.sourceContentDigest ?? "",
          sourceQuestionId: item.sourceQuestionId,
          sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? "",
        })), definition.rule!.requestedCount, assemblySeed!).map((candidate) => version.items.find((item) => item.sourceQuestionId === candidate.sourceQuestionId)!);
      } catch (error) {
        if (error instanceof AssemblyResolutionError) throw new AssemblyValidationError(error.code === "shortage" ? "shortage" : "scope", error.message, error.details);
        throw error;
      }
      items = selected.map(kuisItemFromVersionItem);
    }
  } else {
    if (version.items.length) {
      throw new AssemblyValidationError("scope", "Blueprint Ready tidak boleh membawa snapshot kandidat fisik.", { itemCount: version.items.length, versionId });
    }
    const report = await collectReadiness(tx, definitionInputForVersion(version), { expectedPurpose: "quiz" });
    if (report.readiness.blockers.length) throwIssue(report.readiness.blockers[0]);
    let selectedSources;
    try {
      selectedSources = resolveBlueprintCandidates(report.sources.map((source) => ({
        difficulty: source.currentRevision?.difficulty === DifficultyLevel.easy || source.currentRevision?.difficulty === DifficultyLevel.medium || source.currentRevision?.difficulty === DifficultyLevel.hard
          ? source.currentRevision.difficulty
          : undefined,
        sourceContentDigest: source.currentRevision?.contentDigest ?? "",
        sourceQuestionId: source.id,
        sourceQuestionRevisionId: source.currentRevision?.id ?? "",
      })), definition.rule!, assemblySeed!).map((candidate) => report.sources.find((source) => source.id === candidate.sourceQuestionId)!);
    } catch (error) {
      if (error instanceof AssemblyResolutionError) throw new AssemblyValidationError(error.code === "shortage" ? "shortage" : "scope", error.message, error.details);
      throw error;
    }
    items = selectedSources.map((source) => kuisItemFromSource(source, targetSubtestId));
  }

  return {
    assemblyDefinitionDigest: version.definitionDigest ?? "",
    assemblyMode: definition.mode,
    assemblyPackageId: version.packageId,
    assemblyPackageVersionId: version.id,
    assemblySeed,
    items,
    sourceBankId,
    subtestId: targetSubtestId,
  };
}

async function validateAssemblyDraft(packageId: string, actorId: string, options: AssemblyActorOptions = {}) {
  return prisma.$transaction(async (tx) => {
    const packageRecord = await assertEditablePackage(tx, packageId, actorId, options.isAdmin === true);
    const draft = await readDraftVersion(tx, packageId);
    if (!draft) throw new AssemblyValidationError("not_found", "Assembly belum memiliki draft versi.", { packageId });
    const report = await collectReadiness(tx, toDefinitionInput(packageRecord, draft, packageRecord.items.map(candidateFromPackageItem)));
    return { packageId, versionId: draft.id, versionNo: draft.versionNo, ...report.readiness };
  });
}

async function previewAssembly(input: PreviewAssemblyInput, actorId: string, options: AssemblyActorOptions = {}): Promise<AssemblyPreview> {
  return prisma.$transaction(async (tx) => {
    const packageId = input.packageId ?? (input.versionId
      ? (await tx.reusableQuestionPackageVersion.findUnique({ where: { id: input.versionId }, select: { packageId: true } }))?.packageId
      : undefined);
    if (!packageId) throw new AssemblyValidationError("not_found", "Assembly tidak ditemukan.", { packageId, versionId: input.versionId });
    const packageRecord = await tx.reusableQuestionPackage.findUnique({ where: { id: packageId }, select: packageSelect() });
    if (!packageRecord) throw new AssemblyValidationError("not_found", "Assembly tidak ditemukan.", { packageId, versionId: input.versionId });
    if (packageRecord.status === ContentStatus.archived) throw new AssemblyValidationError("locked", "Assembly yang diarsipkan tidak dapat dipreview.", { packageId });
    const canSeeDraft = packageRecord.createdByUserId === actorId || options.isAdmin === true;
    const draft = input.versionId
      ? null
      : canSeeDraft ? await readDraftVersion(tx, packageId) : null;
    const version = input.versionId
      ? await tx.reusableQuestionPackageVersion.findFirst({
        where: { id: input.versionId, packageId, status: ContentStatus.published },
        include: versionInclude,
      })
      : draft ?? await tx.reusableQuestionPackageVersion.findFirst({
        where: { packageId, status: ContentStatus.published },
        include: versionInclude,
        orderBy: { versionNo: "desc" },
      });
    if (!version) throw new AssemblyValidationError("not_found", "Assembly belum memiliki versi yang dapat dipreview.", { packageId, versionId: input.versionId });
    if (version.mode !== packageRecord.mode) {
      throw new AssemblyValidationError("invalid_mode", "Mode versi assembly tidak cocok dengan package.", {
        packageMode: packageRecord.mode,
        versionMode: version.mode,
      });
    }
    const candidates = draft
      ? packageRecord.items.map(candidateFromPackageItem)
      : version.items.map(candidateFromVersionItem);
    const definitionInput = toDefinitionInput(packageRecord, version, candidates);
    const usesImmutableSnapshot = Boolean(input.versionId) && version.mode === ReusableQuestionPackageMode.fixed_set;
    const report = await collectReadiness(tx, definitionInput, usesImmutableSnapshot ? { snapshotItems: version.items } : undefined);
    const previewSeed = randomBytes(16).toString("hex");
    const normalized = (() => {
      try { return validateAssemblyDefinitionShape(definitionInput); } catch { return null; }
    })();
    const sample = normalized
      ? usesImmutableSnapshot
        ? seededShuffle(version.items, previewSeed)
          .slice(0, version.items.length)
          .map(snapshotSample)
        : normalized.mode === "blueprint"
        ? seededShuffle(report.sources, previewSeed).slice(0, normalized.rule?.requestedCount ?? 0).map((source) => ({
          difficulty: source.currentRevision?.difficulty ?? DifficultyLevel.medium,
          prompt: source.currentRevision?.stem ?? source.stem,
          sourceContentDigest: source.currentRevision?.contentDigest ?? "",
          sourceQuestionId: source.id,
          sourceQuestionRevisionId: source.currentRevision?.id ?? "",
        }))
        : seededShuffle(report.sources, previewSeed).slice(0, normalized.rule?.requestedCount ?? report.sources.length).map((source) => ({
          difficulty: source.currentRevision?.difficulty ?? DifficultyLevel.medium,
          prompt: source.currentRevision?.stem ?? source.stem,
          sourceContentDigest: source.currentRevision?.contentDigest ?? "",
          sourceQuestionId: source.id,
          sourceQuestionRevisionId: source.currentRevision?.id ?? "",
        }))
      : [];
    return {
      mode: version.mode as AssemblyMode,
      packageId,
      previewSeed,
      readiness: report.readiness,
      readOnly: true,
      sample,
      versionId: version.id,
      versionNo: version.versionNo,
    };
  });
}

export {
  getAssemblyDraftForEdit,
  getReadyAssemblyAttachment,
  getReadyAssemblyRevision,
  listReadyAssemblyRevisions,
  previewAssembly,
  readyAssemblyDraft,
  resolveReadyAssemblyForKuis,
  saveAssemblyDraft,
  validateAssemblyDraft,
};
export type {
  AssemblyActorOptions,
  AssemblyAttachmentSummary,
  AssemblyPreview,
  AssemblyReadiness,
  AssemblyReadinessIssue,
  KuisAssemblyItem,
  KuisAssemblyMaterialization,
  KuisAssemblyResolutionOptions,
  PreviewAssemblyInput,
  SaveAssemblyDraftInput,
};
