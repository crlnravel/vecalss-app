import "server-only";

import { ContentStatus, Prisma, QuestionRevisionProvenance, QuestionRevisionStatus, ReusableQuestionPackageMode, TryoutDeliverySessionStatus, TryoutTestType } from "@/generated/prisma/client";
import { createOrReuseAssessmentRelease } from "@/lib/tryout/assessment-release";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { distinctTryoutUsageCounts, summarizePackageLifecycle, type PackageLifecycleItem } from "@/lib/tryout/package-lifecycle";
import { prisma } from "@/lib/prisma";
import { packageReleaseTitle } from "@/lib/tryout/version-label";

const SUBJECTS = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
type SubjectCode = (typeof SUBJECTS)[number];
type PackageSaveIntent = "draft" | "ready";
type PackageItemInput = { pointValue: number; sourceQuestionId: string; sourceQuestionRevisionId?: string };
type PackageInput = { completionIntent?: PackageSaveIntent; description: string; expectedRevision?: number; id?: string; items: PackageItemInput[]; sourceBankId: string; subtest: SubjectCode; title: string };
type PackageMetadataInput = { description: string; id: string; title: string };
type TryoutMetadataInput = { description: string; id: string; title: string };
type DirectQuestionInput = { sourceContentDigest: string; sourceQuestionId: string; sourceQuestionRevisionId: string };
type TestInput = { catItemCount?: number; directQuestions?: DirectQuestionInput[]; durationMinutes: number; instructions: string; packageVersionId?: string; scoringConfig?: Record<string, unknown>; shuffleItems: boolean; subtest: SubjectCode; testType: "cbt" | "cat" };
type ReusableQuestionPackageHandoff = {
  catItemCount?: number;
  packageId: string;
  packageTitle: string;
  packageVersionId: string;
  packageVersionLabel: string;
  packageVersionMode: ReusableQuestionPackageMode;
  subtest: SubjectCode;
  testType: "cbt" | "cat";
};
type ReusableQuestionPackageUseTarget = {
  disabledReason?: string;
  eligible: boolean;
  id: string;
  section: {
    catItemCount?: number;
    id: string;
    packageVersionId?: string;
    testType: "cbt" | "cat";
  } | null;
  status: "draft";
  title: string;
};
type ReusableQuestionPackageUseContext = {
  package: {
    description: string;
    id: string;
    sourceBankName: string;
    subtest: SubjectCode;
    title: string;
  };
  targets: ReusableQuestionPackageUseTarget[];
  version: {
    catItemCount?: number;
    id: string;
    itemCount: number;
    label: string;
    mode: ReusableQuestionPackageMode;
    subtest: SubjectCode;
    testType: "cbt" | "cat";
    versionNo: number;
  };
};
type ReusableQuestionPackageHandoffResolution = {
  error: string | null;
  handoff: ReusableQuestionPackageHandoff | null;
};
type PackageVersionReadiness = {
  catReady: boolean;
  contentReady: boolean;
  hasExplanations: boolean;
  hasReadyMedia: boolean;
  itemCount: number;
  sourceQuestionIds: string[];
};
type SaveTryoutInput = { description: string; id?: string; publicationIntentKey?: string; sections: TestInput[]; status: "draft" | "published"; title: string };
class TryoutValidationError extends Error {}
type PackageConflictCode = "package_conflict";
class PackageConflictError extends TryoutValidationError {
  readonly code: PackageConflictCode = "package_conflict";
  readonly currentRevision: number;
  readonly expectedRevision: number;
  readonly packageId: string;

  constructor(packageId: string, expectedRevision: number, currentRevision: number) {
    super("Paket Soal telah berubah di tab atau sesi lain. Muat ulang data terbaru sebelum menyimpan lagi.");
    this.name = "PackageConflictError";
    this.currentRevision = currentRevision;
    this.expectedRevision = expectedRevision;
    this.packageId = packageId;
  }
}

const sourceInclude = {
  currentRevision: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true } },
  questionBank: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  explanationAsset: true,
  subtest: true,
} satisfies Prisma.QuestionInclude;
const versionInclude = { package: { include: { subtest: true } }, items: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true }, orderBy: { sortOrder: "asc" as const } } } satisfies Prisma.ReusableQuestionPackageVersionInclude;
const packageInclude = { sourceBank: true, subtest: true, items: { include: { sourceQuestion: { include: sourceInclude } }, orderBy: { sortOrder: "asc" as const } }, versions: { where: { status: ContentStatus.published }, orderBy: { versionNo: "desc" as const }, take: 1, include: { items: { select: { pointValue: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true }, orderBy: { sortOrder: "asc" as const } } } } } satisfies Prisma.ReusableQuestionPackageInclude;
const packageLifecycleInclude = { sourceBank: { select: { id: true, name: true } }, subtest: { select: { code: true, id: true, name: true } }, items: { select: { pointValue: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true }, orderBy: { sortOrder: "asc" as const } }, versions: { where: { status: ContentStatus.published }, orderBy: { versionNo: "desc" as const }, take: 1, include: { items: { select: { pointValue: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true }, orderBy: { sortOrder: "asc" as const } } } } } satisfies Prisma.ReusableQuestionPackageInclude;
const tryoutInclude = { assessmentReleases: { orderBy: { releaseNumber: "desc" as const }, take: 1 }, sections: { include: { items: { orderBy: { sortOrder: "asc" as const }, select: { explanation: true, explanationAsset: { select: { state: true } }, explanationAssetId: true, options: { select: { asset: { select: { state: true } } } }, packageVersionId: true, prompt: true, promptAsset: { select: { state: true } }, promptAssetId: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevision: { select: { calibrations: { where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION }, select: { contentDigest: true, difficulty: true, discrimination: true, questionId: true, sourceRevisionProvenance: true } }, id: true } }, sourceQuestionRevisionId: true, sourceQuestion: { select: { questionBank: { select: { id: true, name: true } } } } } }, packageVersion: { include: { package: { include: { subtest: true } } } }, subtest: true }, orderBy: { sequenceNo: "asc" as const } }, attempts: { select: { id: true }, take: 1 } } satisfies Prisma.TryoutPackageInclude;

function codeFromTitle(title: string, prefix: string) { return `${prefix}-${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "draft"}-${Date.now()}`.slice(0, 100); }
function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }
function packageVersionReadiness(version: Prisma.ReusableQuestionPackageVersionGetPayload<{ include: typeof versionInclude }>, calibrationByRevision = new Map<string, { contentDigest: string; difficulty: unknown; discrimination: unknown; questionId: string; sourceRevisionProvenance: string | null }>()) {
  const sourceQuestionIds = version.items.map((item) => item.sourceQuestionId);
  const hasUniqueSources = new Set(sourceQuestionIds).size === sourceQuestionIds.length;
  const hasExplanations = version.items.every((item) => Boolean(item.explanation?.trim() || item.explanationAssetId));
  const hasReadyMedia = version.items.every((item) => isReadyAsset(item.promptAsset) && isReadyAsset(item.explanationAsset) && item.options.every((option) => isReadyAsset(option.asset)));
  const contentReady = version.items.length > 0 && version.items.every((item) => {
    const options = item.options;
    return item.prompt.trim()
      && hasExplanations
      && options.length >= 2
      && options.length <= 5
      && options.filter((option) => option.isCorrect).length === 1
      && options.every((option) => option.content.trim())
      && hasReadyMedia;
  }) && hasUniqueSources;
  const catReady = contentReady && version.items.every((item) => {
    if (!item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown) return false;
    const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId);
    return Boolean(calibration
      && calibration.questionId === item.sourceQuestionId
      && calibration.contentDigest === item.sourceContentDigest
      && Number.isFinite(Number(calibration.difficulty))
      && Number.isFinite(Number(calibration.discrimination))
      && Number(calibration.discrimination) > 0
      && calibration.sourceRevisionProvenance !== QuestionRevisionProvenance.legacy_unknown);
  });
  return { catReady, contentReady, hasExplanations, hasReadyMedia, itemCount: version.items.length, sourceQuestionIds } satisfies PackageVersionReadiness;
}
type PackageVersionItemRecord = Prisma.ReusableQuestionPackageVersionGetPayload<{ include: typeof versionInclude }>["items"][number];
function toTryoutSnapshot(snapshot: PackageVersionItemRecord) {
  return {
    difficulty: snapshot.difficulty,
    explanation: snapshot.explanation,
    explanationAssetId: snapshot.explanationAssetId,
    options: snapshot.options.map((option) => ({ assetId: option.assetId, choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect, sortOrder: option.sortOrder, sourceQuestionOptionId: option.sourceQuestionOptionId, sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId })),
    pointValue: Number(snapshot.pointValue),
    prompt: snapshot.prompt,
    promptAssetId: snapshot.promptAssetId,
    sortOrder: snapshot.sortOrder,
    sourceContentDigest: snapshot.sourceContentDigest,
    sourceQuestionId: snapshot.sourceQuestionId,
    sourceQuestionRevisionId: snapshot.sourceQuestionRevisionId,
    sourceRevisionProvenance: snapshot.sourceRevisionProvenance,
    subtestId: snapshot.subtestId,
  };
}
function assertPackageInput(input: PackageInput) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Paket Soal wajib diisi.");
  if (!SUBJECTS.includes(input.subtest)) throw new TryoutValidationError("Subtest Paket Soal tidak valid.");
  if (!input.sourceBankId) throw new TryoutValidationError("Pilih satu Bank Soal sumber terlebih dahulu.");
  if (!input.items.length || new Set(input.items.map((item) => item.sourceQuestionId)).size !== input.items.length || input.items.some((item) => !Number.isFinite(item.pointValue) || item.pointValue <= 0)) throw new TryoutValidationError("Paket harus berisi soal unik dengan poin positif.");
  if (input.completionIntent !== undefined && input.completionIntent !== "draft" && input.completionIntent !== "ready") throw new TryoutValidationError("Intent penyelesaian Paket Soal tidak valid.");
  if (input.expectedRevision !== undefined && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)) throw new TryoutValidationError("Revisi Paket Soal tidak valid.");
}
function assertReadySources(sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[], subtest: SubjectCode, sourceBankId: string) {
  if (!sources.length || sources.some((source) => {
    const revision = source.currentRevision;
    const options = revision?.options ?? source.options;
    return source.questionBankId !== sourceBankId
      || source.questionBank?.status === ContentStatus.archived
      || source.status === ContentStatus.archived
      || revision?.status !== QuestionRevisionStatus.ready
      || source.subtest?.code !== subtest
      || source.questionBank === null
      || options.length < 2
      || options.length > 5
      || options.filter((option) => option.isCorrect).length !== 1
      || options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
      || !revision.stem.trim()
      || !isReadyAsset(revision.promptAsset)
      || !isReadyAsset(revision.explanationAsset);
  })) throw new TryoutValidationError("Paket hanya dapat memakai soal siap dari satu Bank yang aktif, dengan media siap dan Subtest yang sama.");
}
function assertReadyDirectSources(sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[], selections: DirectQuestionInput[], subtest: SubjectCode) {
  const selectionById = new Map(selections.map((selection) => [selection.sourceQuestionId, selection]));
  if (!sources.length || sources.some((source) => {
    const revision = source.currentRevision;
    const options = revision?.options ?? source.options;
    const selection = selectionById.get(source.id);
    return source.questionBank?.status === ContentStatus.archived
      || source.status === ContentStatus.archived
      || source.questionBank === null
      || source.subtest?.code !== subtest
      || revision?.status !== QuestionRevisionStatus.ready
      || !selection
      || !selection.sourceQuestionRevisionId
      || selection.sourceQuestionRevisionId !== revision.id
      || !selection.sourceContentDigest
      || selection.sourceContentDigest !== revision.contentDigest
      || options.length < 2
      || options.length > 5
      || options.filter((option) => option.isCorrect).length !== 1
      || options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
      || !revision.stem.trim()
      || !isReadyAsset(revision.promptAsset)
      || !isReadyAsset(revision.explanationAsset);
  })) throw new TryoutValidationError("Pilih soal langsung hanya dari revisi Ready yang masih aktif, kompatibel dengan Subtest, dan memiliki media siap.");
}
function assertReadyDirectContent(sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[], subtest: SubjectCode) {
  if (sources.some((source) => !source.currentRevision?.explanation?.trim() && !source.currentRevision?.explanationAssetId)) throw new TryoutValidationError(`Sumber langsung Test ${subtest} harus memiliki penjelasan teks atau media sebelum Tryout diterbitkan.`);
}
async function readAndValidatePackageSources(tx: Prisma.TransactionClient, sourceQuestionIds: string[], subtest: SubjectCode, sourceBankId: string) {
  // Lock both source questions and their Banks before rereading lifecycle/media state.
  // Bank writes use the same aggregate row, so selection cannot race an unpublish/archive.
  await tx.$queryRaw`SELECT q.id FROM questions q JOIN question_banks b ON b.id = q.question_bank_id WHERE q.id IN (${Prisma.join(sourceQuestionIds)}) ORDER BY q.id FOR SHARE OF q, b`;
  const sources = await tx.question.findMany({ where: { id: { in: sourceQuestionIds } }, include: sourceInclude });
  if (sources.length !== sourceQuestionIds.length) throw new TryoutValidationError("Sebagian sumber Paket tidak tersedia.");
  assertReadySources(sources, subtest, sourceBankId);
  return sources;
}

function assertPackageItemRevisions(items: readonly PackageItemInput[] | readonly { sourceQuestionId: string; sourceQuestionRevisionId: string | null }[], sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[], requirePinnedRevision = false) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  for (const item of items) {
    const source = sourceById.get(item.sourceQuestionId);
    if ("pointValue" in item) {
      if (requirePinnedRevision && !item.sourceQuestionRevisionId) throw new TryoutValidationError("Paket siap terbit harus menunjuk QuestionRevision aktif yang dipilih.");
      if (item.sourceQuestionRevisionId && item.sourceQuestionRevisionId !== source?.currentRevision?.id) throw new TryoutValidationError("Sumber Paket harus menunjuk QuestionRevision aktif yang sama.");
      continue;
    }
    if (!item.sourceQuestionRevisionId || item.sourceQuestionRevisionId !== source?.currentRevision?.id) {
      throw new TryoutValidationError("Paket memiliki sumber soal yang sudah berubah. Muat ulang Paket lalu simpan ulang sebelum menerbitkan versi.");
    }
  }
}

function packageItemRows(packageId: string, items: readonly PackageItemInput[], sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[]) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return items.map((item, index) => {
    const source = sourceById.get(item.sourceQuestionId);
    if (!source?.currentRevision) throw new TryoutValidationError("Sebagian sumber Paket tidak memiliki revisi aktif.");
    return {
      packageId,
      pointValue: item.pointValue,
      sourceContentDigest: source.currentRevision.contentDigest,
      sourceQuestionId: item.sourceQuestionId,
      sourceQuestionRevisionId: source.currentRevision.id,
      sourceRevisionProvenance: source.currentRevision.provenance,
      sortOrder: index + 1,
    };
  });
}
async function readAndValidateDirectSources(tx: Prisma.TransactionClient, selections: DirectQuestionInput[], subtest: SubjectCode) {
  const sourceQuestionIds = selections.map((selection) => selection.sourceQuestionId);
  if (!sourceQuestionIds.length) return [] as Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[];
  if (new Set(sourceQuestionIds).size !== sourceQuestionIds.length) throw new TryoutValidationError("Satu soal sumber hanya boleh dipilih sekali dalam satu Section.");
  await tx.$queryRaw`SELECT q.id FROM questions q JOIN question_banks b ON b.id = q.question_bank_id WHERE q.id IN (${Prisma.join(sourceQuestionIds)}) ORDER BY q.id FOR SHARE OF q, b`;
  const sources = await tx.question.findMany({ where: { id: { in: sourceQuestionIds } }, include: sourceInclude });
  if (sources.length !== sourceQuestionIds.length) throw new TryoutValidationError("Sebagian soal langsung tidak tersedia.");
  assertReadyDirectSources(sources, selections, subtest);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return sourceQuestionIds.map((sourceQuestionId) => sourceById.get(sourceQuestionId)!);
}
type PackageReadRecord = Prisma.ReusableQuestionPackageGetPayload<{ include: typeof packageInclude }>;
type PackageLifecycleReadRecord = {
  id: string;
  items: readonly PackageLifecycleItem[];
  sourceBank: { name: string };
  subtest: { code: string };
  versions: ReadonlyArray<{ id: string; items: readonly PackageLifecycleItem[]; versionNo: number }>;
};

function packageLifecycleItems(items: readonly PackageLifecycleItem[]) {
  return items.map((item) => ({
    pointValue: item.pointValue,
    sortOrder: item.sortOrder,
    sourceContentDigest: item.sourceContentDigest,
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId,
  }));
}

function packageLifecycleForRecord(record: PackageLifecycleReadRecord, usageCount = 0) {
  const latestPublishedVersion = record.versions[0];
  return summarizePackageLifecycle({
    draftItems: packageLifecycleItems(record.items),
    latestPublishedVersion: latestPublishedVersion
      ? {
          id: latestPublishedVersion.id,
          items: packageLifecycleItems(latestPublishedVersion.items),
          versionNo: latestPublishedVersion.versionNo,
        }
      : null,
    usageCount,
  });
}

function toPackageDto(record: PackageReadRecord, usageCount = 0) {
  const lifecycle = packageLifecycleForRecord(record, usageCount);
  return {
    activeItemCount: lifecycle.active?.itemCount ?? 0,
    activeTotalPoints: lifecycle.active?.totalPoints ?? 0,
    activeVersionId: lifecycle.active?.versionId,
    activeVersionNo: lifecycle.active?.versionNo,
    availability: lifecycle.availability,
    description: record.description ?? "",
    draftItemCount: lifecycle.draft.itemCount,
    draftTotalPoints: lifecycle.draft.totalPoints,
    hasDraftChanges: lifecycle.hasDraftChanges,
    id: record.id,
    items: record.items.map((item) => ({ pointValue: Number(item.pointValue), sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined })),
    latestReadyVersionId: lifecycle.active?.versionId,
    latestReadyVersionNo: lifecycle.active?.versionNo,
    lifecycle,
    revision: record.revision,
    sourceBankId: record.sourceBankId,
    sourceBankName: record.sourceBank.name,
    status: lifecycle.availability,
    subtest: record.subtest.code as SubjectCode,
    title: record.title,
    tryoutUsageCount: lifecycle.usageCount,
    updatedAt: record.updatedAt.getTime(),
    usageCount: lifecycle.usageCount,
  };
}
function toTryoutDto(record: Prisma.TryoutPackageGetPayload<{ include: typeof tryoutInclude }>) {
  const release = record.assessmentReleases[0] ?? null;
  return { assessmentRelease: release ? { digest: release.contentDigest, id: release.id, number: release.releaseNumber, payload: release.payload, publishedAt: release.publishedAt.toISOString() } : null, description: record.description ?? "", id: record.id, locked: record.attempts.length > 0, sections: record.sections.map((section) => ({ catItemCount: section.catItemCount ?? undefined, directQuestions: section.packageVersionId ? [] : section.items.filter((item) => !item.packageVersionId && item.sourceQuestionId).map((item) => ({ bankId: item.sourceQuestion?.questionBank?.id, bankTitle: item.sourceQuestion?.questionBank?.name, catReady: Boolean(item.sourceQuestionRevision?.calibrations.some((calibration) => calibration.questionId === item.sourceQuestionId && calibration.contentDigest === item.sourceContentDigest && Number.isFinite(Number(calibration.difficulty)) && Number.isFinite(Number(calibration.discrimination)) && Number(calibration.discrimination) > 0 && calibration.sourceRevisionProvenance !== QuestionRevisionProvenance.legacy_unknown)), hasExplanation: Boolean(item.explanation?.trim() || item.explanationAssetId), hasReadyMedia: [item.promptAsset, item.explanationAsset, ...item.options.map((option) => option.asset)].every((asset) => !asset || asset.state === "ready"), prompt: item.prompt, sourceContentDigest: item.sourceContentDigest ?? undefined, sourceQuestionId: item.sourceQuestionId!, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined })), durationMinutes: Math.round(section.durationSeconds / 60), id: section.id, instructions: section.instructions ?? "", packageVersionId: section.packageVersionId ?? undefined, packageVersionLabel: section.packageVersion ? packageReleaseTitle(section.packageVersion.package.title, section.packageVersion.versionNo) : undefined, packageVersionMode: section.packageVersion?.package.mode ?? undefined, scoringConfig: section.scoringConfig as Record<string, unknown> | undefined, shuffleItems: section.shuffleItems, subtest: section.subtest.code as SubjectCode, testType: section.testType === TryoutTestType.cat ? "cat" as const : "cbt" as const })), status: record.status === ContentStatus.published ? "published" as const : "draft" as const, title: record.title, updatedAt: record.updatedAt.getTime() };
}

async function readPackageUsageCounts(packageIds: readonly string[], client: typeof prisma | Prisma.TransactionClient = prisma) {
  if (!packageIds.length) return new Map<string, number>();
  const bindings = await client.tryoutSection.findMany({
    where: {
      packageVersion: {
        is: {
          packageId: { in: [...packageIds] },
          status: ContentStatus.published,
        },
      },
    },
    select: { packageVersion: { select: { packageId: true } }, tryoutId: true },
  });
  return distinctTryoutUsageCounts(bindings.flatMap((binding) => binding.packageVersion ? [{ packageId: binding.packageVersion.packageId, tryoutId: binding.tryoutId }] : []));
}

async function listReusableQuestionPackages(actorId: string, options: { page?: number; query?: string; status?: "draft" | "ready"; subtest?: string } = {}, client: typeof prisma | Prisma.TransactionClient = prisma) {
  const query = options.query?.trim() ?? "";
  const pageSize = 12;
  const where: Prisma.ReusableQuestionPackageWhereInput = {
    createdByUserId: actorId,
    ...(options.status === "ready" ? { versions: { some: { status: ContentStatus.published } } } : {}),
    ...(options.status === "draft" ? { versions: { none: { status: ContentStatus.published } } } : {}),
    ...(options.subtest ? { subtest: { code: options.subtest } } : {}),
    ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { description: { contains: query, mode: "insensitive" as const } }, { subtest: { code: { contains: query, mode: "insensitive" as const } } }] } : {}),
  };
  const totalItems = await client.reusableQuestionPackage.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), totalPages);
  const records = await client.reusableQuestionPackage.findMany({ where, include: packageInclude, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize });
  const usageCounts = await readPackageUsageCounts(records.map((record) => record.id), client);
  return { items: records.map((record) => toPackageDto(record, usageCounts.get(record.id) ?? 0)), page, pageSize, totalItems, totalPages };
}
async function getReusableQuestionPackageForEdit(id: string, actorId: string) {
  const record = await prisma.reusableQuestionPackage.findFirst({ where: { id, createdByUserId: actorId }, include: packageInclude });
  if (!record) return null;
  const usageCounts = await readPackageUsageCounts([record.id]);
  return toPackageDto(record, usageCounts.get(record.id) ?? 0);
}
async function getReusableQuestionPackageVersionHub(id: string, actorId: string, client: typeof prisma | Prisma.TransactionClient = prisma) {
  const record = await client.reusableQuestionPackage.findFirst({
    where: { id, createdByUserId: actorId },
    include: packageLifecycleInclude,
  });
  if (!record) return null;
  const [versions, usageCounts] = await Promise.all([
    client.reusableQuestionPackageVersion.findMany({
      where: { packageId: record.id, status: ContentStatus.published },
      orderBy: { versionNo: "desc" },
      select: { createdAt: true, readyAt: true, versionNo: true, _count: { select: { items: true, tryoutSections: true } } },
    }),
    readPackageUsageCounts([record.id], client),
  ]);
  const lifecycle = packageLifecycleForRecord(record, usageCounts.get(record.id) ?? 0);
  return {
    activeItemCount: lifecycle.active?.itemCount ?? 0,
    activeTotalPoints: lifecycle.active?.totalPoints ?? 0,
    activeVersionId: lifecycle.active?.versionId,
    activeVersionNo: lifecycle.active?.versionNo,
    availability: lifecycle.availability,
    description: record.description ?? "",
    draftItemCount: lifecycle.draft.itemCount,
    draftTotalPoints: lifecycle.draft.totalPoints,
    hasDraftChanges: lifecycle.hasDraftChanges,
    id: record.id,
    lifecycle,
    sourceBankName: record.sourceBank.name,
    subtest: record.subtest.code as SubjectCode,
    title: record.title,
    tryoutUsageCount: lifecycle.usageCount,
    usageCount: lifecycle.usageCount,
    versions: versions.map((version) => ({ createdAt: version.createdAt.getTime(), itemCount: version._count.items, readyAt: version.readyAt?.getTime(), testCount: version._count.tryoutSections, versionNo: version.versionNo })),
  };
}

function packageVersionTestType(mode: ReusableQuestionPackageMode): "cbt" | "cat" {
  return mode === ReusableQuestionPackageMode.cat_pool ? "cat" : "cbt";
}

function packageHandoffFromVersion(input: {
  catItemCount?: number;
  id: string;
  itemCount: number;
  mode: ReusableQuestionPackageMode;
  packageId: string;
  packageTitle: string;
  versionNo: number;
  subtest: SubjectCode;
}): ReusableQuestionPackageHandoff {
  const testType = packageVersionTestType(input.mode);
  return {
    ...(testType === "cat" && input.catItemCount !== undefined ? { catItemCount: input.catItemCount } : {}),
    packageId: input.packageId,
    packageTitle: input.packageTitle,
    packageVersionId: input.id,
    packageVersionLabel: packageReleaseTitle(input.packageTitle, input.versionNo),
    packageVersionMode: input.mode,
    subtest: input.subtest,
    testType,
  };
}

function handoffTargetForVersion(input: {
  directSourcePresent: boolean;
  id: string;
  packageVersionId: string | null;
  sectionId: string;
  testType: TryoutTestType;
  targetTitle: string;
  catItemCount: number | null;
}, version: ReusableQuestionPackageUseContext["version"]): ReusableQuestionPackageUseTarget {
  const testType = input.testType === TryoutTestType.cat ? "cat" : "cbt";
  const section = {
    ...(input.catItemCount === null ? {} : { catItemCount: input.catItemCount }),
    id: input.sectionId,
    ...(input.packageVersionId ? { packageVersionId: input.packageVersionId } : {}),
    testType,
  } satisfies NonNullable<ReusableQuestionPackageUseTarget["section"]>;
  const compatible = testType === version.testType;
  const sourceConflict = input.directSourcePresent || Boolean(input.packageVersionId && input.packageVersionId !== version.id);
  const disabledReason = input.directSourcePresent
    ? `Test ${version.subtest} sudah berisi soal langsung. Sumber yang sedang dipakai tidak akan diganti otomatis.`
    : input.packageVersionId && input.packageVersionId !== version.id
    ? `Test ${version.subtest} sudah memakai Paket Soal lain. Sumber yang sedang dipakai tidak akan diganti otomatis.`
    : !compatible
      ? version.testType === "cat"
        ? "Versi ini adalah CAT Pool dan hanya kompatibel dengan Test CAT."
        : "Versi ini kompatibel dengan Test CBT, bukan Test CAT."
      : undefined;
  return {
    ...(disabledReason ? { disabledReason } : {}),
    eligible: !sourceConflict && compatible,
    id: input.id,
    section,
    status: "draft",
    title: input.targetTitle,
  };
}

async function getReusableQuestionPackageUseContext(
  packageId: string,
  actorId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
): Promise<ReusableQuestionPackageUseContext | null> {
  const record = await client.reusableQuestionPackage.findFirst({
    where: {
      createdByUserId: actorId,
      id: packageId,
      status: { not: ContentStatus.archived },
      versions: { some: { status: ContentStatus.published } },
    },
    select: {
      description: true,
      id: true,
      sourceBank: { select: { name: true } },
      subtest: { select: { code: true, id: true } },
      title: true,
      versions: {
        where: { status: ContentStatus.published },
        orderBy: { versionNo: "desc" },
        take: 1,
        select: {
          id: true,
          items: { select: { id: true } },
          mode: true,
          rule: { select: { requestedCount: true } },
          versionNo: true,
        },
      },
    },
  });
  const latestVersion = record?.versions[0];
  if (!record || !latestVersion) return null;

  const subtest = record.subtest.code as SubjectCode;
  const version = {
    catItemCount: latestVersion.mode === ReusableQuestionPackageMode.cat_pool ? latestVersion.rule?.requestedCount : undefined,
    id: latestVersion.id,
    itemCount: latestVersion.items.length,
    label: packageReleaseTitle(record.title, latestVersion.versionNo),
    mode: latestVersion.mode,
    subtest,
    testType: packageVersionTestType(latestVersion.mode),
    versionNo: latestVersion.versionNo,
  } satisfies ReusableQuestionPackageUseContext["version"];
  const targets = await client.tryoutPackage.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      sections: {
        where: { subtestId: record.subtest.id },
        select: {
          catItemCount: true,
          id: true,
          items: { where: { packageVersionId: null, sourceQuestionId: { not: null } }, select: { id: true }, take: 1 },
          packageVersionId: true,
          testType: true,
        },
        take: 1,
      },
    },
    where: {
      attempts: { none: {} },
      createdByUserId: actorId,
      deliverySessions: { none: { assessmentReleaseId: { not: null }, status: TryoutDeliverySessionStatus.active } },
      status: ContentStatus.draft,
    },
  });

  return {
    package: {
      description: record.description ?? "",
      id: record.id,
      sourceBankName: record.sourceBank.name,
      subtest,
      title: record.title,
    },
    targets: targets.map((target) => {
      const section = target.sections[0];
      return section
        ? handoffTargetForVersion({
            catItemCount: section.catItemCount,
            directSourcePresent: section.items.length > 0,
            id: target.id,
            packageVersionId: section.packageVersionId,
            sectionId: section.id,
            targetTitle: target.title,
            testType: section.testType,
          }, version)
        : {
            eligible: true,
            id: target.id,
            section: null,
            status: "draft" as const,
            title: target.title,
          };
    }),
    version,
  };
}

async function resolveReusableQuestionPackageHandoff(input: {
  packageId?: string;
  packageVersionId?: string;
  subtest?: string;
  tryoutId?: string;
}, actorId: string): Promise<ReusableQuestionPackageHandoffResolution> {
  if (!input.packageId && !input.packageVersionId && !input.subtest) return { error: null, handoff: null };
  if (!input.packageId || !input.packageVersionId || !input.subtest) {
    return { error: "Handoff Paket Soal belum lengkap. Kembali ke halaman Paket Soal lalu pilih Gunakan di Tryout lagi.", handoff: null };
  }
  const context = await getReusableQuestionPackageUseContext(input.packageId, actorId);
  if (!context) return { error: "Paket Soal tidak memiliki versi Ready yang dapat digunakan atau Anda tidak memiliki akses ke paket ini.", handoff: null };
  if (context.version.id !== input.packageVersionId || context.package.subtest !== input.subtest) {
    return { error: "Versi Ready Paket Soal sudah berubah. Kembali ke halaman Paket Soal lalu pilih versi Ready terbaru.", handoff: null };
  }
  if (input.tryoutId) {
    const target = context.targets.find((candidate) => candidate.id === input.tryoutId);
    if (!target?.eligible) {
      return { error: target?.disabledReason ?? "Tryout tujuan tidak dapat menerima Paket Soal ini. Pilih Tryout draf lain atau buat Tryout baru.", handoff: null };
    }
  }
  return {
    error: null,
    handoff: packageHandoffFromVersion({
      id: context.version.id,
      itemCount: context.version.itemCount,
      mode: context.version.mode,
      catItemCount: context.version.catItemCount,
      packageId: context.package.id,
      packageTitle: context.package.title,
      subtest: context.package.subtest,
      versionNo: context.version.versionNo,
    }),
  };
}

async function getReusableQuestionPackageVersionDetail(packageId: string, versionNo: number, actorId: string) {
  const record = await prisma.reusableQuestionPackageVersion.findFirst({
    where: { packageId, versionNo, status: ContentStatus.published, package: { createdByUserId: actorId } },
    include: {
      package: { include: { subtest: true } }, sourceBank: true,
      items: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
      tryoutSections: { orderBy: [{ tryout: { title: "asc" } }, { sequenceNo: "asc" }], include: { tryout: { select: { id: true, status: true, title: true } } } },
    },
  });
  if (!record) return null;
  return {
    packageId: record.packageId, packageTitle: record.package.title, sourceBankName: record.sourceBank.name, subtest: record.package.subtest.code as SubjectCode, versionNo: record.versionNo,
    items: record.items.map((item) => ({ difficulty: item.difficulty, options: item.options.map((option) => ({ choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect })), pointValue: Number(item.pointValue), prompt: item.prompt, sortOrder: item.sortOrder })),
    tests: record.tryoutSections.map((section) => ({ id: section.id, sequenceNo: section.sequenceNo, subtest: section.subtestId, testType: section.testType === TryoutTestType.cat ? "CAT" : "CBT", title: section.title, tryoutId: section.tryout.id, tryoutStatus: section.tryout.status === ContentStatus.published ? "Terbit" : "Draf", tryoutTitle: section.tryout.title })),
  };
}
async function listReadyPackageVersions(_actorId: string) {
  void _actorId;
  const records = await prisma.reusableQuestionPackageVersion.findMany({
    // Ready revisions are shared Kapten assets.  Creator-only ownership is
    // enforced by the package mutation commands; binding a Ready revision to
    // another mentor's draft must not become an accidental ownership check.
    where: { status: ContentStatus.published, package: { status: { not: ContentStatus.archived } } },
    include: versionInclude,
    orderBy: { createdAt: "desc" },
  });
  const revisionIds = records.flatMap((record) => record.items.map((item) => item.sourceQuestionRevisionId).filter((id): id is string => Boolean(id)));
  const calibrations = revisionIds.length
    ? await prisma.twoPlQuestionCalibration.findMany({
        where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } },
        select: { contentDigest: true, difficulty: true, discrimination: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true },
      })
    : [];
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  return records.map((record) => ({
    ...packageVersionReadiness(record, calibrationByRevision),
    id: record.id,
    label: packageReleaseTitle(record.package.title, record.versionNo),
    subtest: record.package.subtest.code as SubjectCode,
  }));
}

type ReleasedPackageVersion = { id: string; versionNo: number };

type ReadyCommitOptions = { incrementRevision?: boolean };

async function commitPackageReadyVersion(tx: Prisma.TransactionClient, packageId: string, actorId: string, options: ReadyCommitOptions = {}): Promise<ReleasedPackageVersion> {
  // Every Ready write, including the compatibility command, starts by taking
  // the package aggregate lock.  This serializes ownership/revision checks,
  // source validation, immutable snapshot writes, and version allocation.
  await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${packageId}::uuid FOR UPDATE`;
  const pkg = await tx.reusableQuestionPackage.findFirst({ where: { id: packageId, createdByUserId: actorId }, include: { subtest: true, items: { orderBy: { sortOrder: "asc" } } } });
  if (!pkg) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
  const sourceBank = await tx.questionBank.findUnique({ where: { id: pkg.sourceBankId }, select: { id: true } });
  if (!sourceBank) throw new TryoutValidationError("Bank sumber Paket tidak ditemukan.");
  const sources = await readAndValidatePackageSources(tx, pkg.items.map((item) => item.sourceQuestionId), pkg.subtest.code as SubjectCode, pkg.sourceBankId);
  assertPackageItemRevisions(pkg.items, sources);

  const latestVersion = await tx.reusableQuestionPackageVersion.aggregate({ where: { packageId }, _max: { versionNo: true } });
  const version = await tx.reusableQuestionPackageVersion.create({
    data: {
      createdByUserId: actorId,
      mode: pkg.mode,
      packageId,
      sourceBankId: pkg.sourceBankId,
      subtestId: pkg.subtestId,
      versionNo: (latestVersion._max.versionNo ?? 0) + 1,
    },
  });

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  for (const membership of pkg.items) {
    const source = sourceById.get(membership.sourceQuestionId);
    const revision = source?.currentRevision;
    if (!source || !revision || !membership.sourceQuestionRevisionId || membership.sourceQuestionRevisionId !== revision.id) {
      throw new TryoutValidationError("Paket memiliki sumber soal yang sudah berubah. Muat ulang Paket lalu simpan ulang sebelum menerbitkan versi.");
    }
    const item = await tx.reusableQuestionPackageVersionItem.create({
      data: {
        difficulty: revision.difficulty,
        explanation: revision.explanation,
        explanationAssetId: revision.explanationAssetId,
        packageVersionId: version.id,
        pointValue: membership.pointValue,
        prompt: revision.stem,
        promptAssetId: revision.promptAssetId,
        sortOrder: membership.sortOrder,
        sourceContentDigest: revision.contentDigest,
        sourceQuestionId: source.id,
        sourceQuestionRevisionId: revision.id,
        sourceRevisionProvenance: revision.provenance,
        subtestId: source.subtestId!,
      },
    });
    await tx.reusableQuestionPackageVersionItemOption.createMany({ data: revision.options.map((option, index) => ({ assetId: option.assetId, choiceKey: String.fromCharCode(65 + index), content: option.content, isCorrect: option.isCorrect, packageVersionItemId: item.id, sortOrder: index, sourceQuestionOptionId: null, sourceQuestionRevisionOptionId: option.id })) });
  }

  // Publish only after every immutable child and option row exists.  Any
  // failure before or after this point aborts the surrounding transaction.
  await tx.reusableQuestionPackageVersion.update({ where: { id: version.id }, data: { readyAt: new Date(), status: ContentStatus.published } });
  await tx.reusableQuestionPackage.update({ where: { id: packageId }, data: { ...(options.incrementRevision === false ? {} : { revision: { increment: 1 } }), status: ContentStatus.published, updatedByUserId: actorId } });
  return { id: version.id, versionNo: version.versionNo };
}

type PackageDto = ReturnType<typeof toPackageDto>;
type SaveReusableQuestionPackageResult = PackageDto & { package: PackageDto; releasedVersion?: ReleasedPackageVersion };

function packageSaveResult(packageDto: PackageDto, releasedVersion?: ReleasedPackageVersion): SaveReusableQuestionPackageResult {
  return { ...packageDto, package: packageDto, ...(releasedVersion ? { releasedVersion } : {}) };
}

async function saveReusableQuestionPackage(input: PackageInput, actorId: string): Promise<SaveReusableQuestionPackageResult> {
  assertPackageInput(input);
  const completionIntent = input.completionIntent ?? "draft";
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    let current: { revision: number; sourceBankId: string; subtestId: string } | null = null;
    if (id) {
      // The lock must precede ownership, revision, source, item, and version
      // reads so two tabs cannot overwrite a newer working set or number.
      await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${id}::uuid FOR UPDATE`;
      current = await tx.reusableQuestionPackage.findFirst({ where: { id, createdByUserId: actorId }, select: { revision: true, sourceBankId: true, subtestId: true } });
      if (!current) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
      if (input.expectedRevision !== undefined && current.revision !== input.expectedRevision) throw new PackageConflictError(id, input.expectedRevision, current.revision);
    }

    const subtest = await tx.subtest.findUnique({ where: { code: input.subtest } });
    if (!subtest) throw new TryoutValidationError("Subtest Paket tidak ditemukan.");
    const sourceBank = await tx.questionBank.findUnique({ where: { id: input.sourceBankId }, select: { id: true } });
    if (!sourceBank) throw new TryoutValidationError("Bank sumber Paket tidak ditemukan.");
    if (current?.subtestId && current.subtestId !== subtest.id) throw new TryoutValidationError("Subtest Paket tidak dapat diubah setelah dibuat.");
    if (current?.sourceBankId && current.sourceBankId !== input.sourceBankId) throw new TryoutValidationError("Bank sumber Paket tidak dapat diubah.");

    const sources = await readAndValidatePackageSources(tx, input.items.map((item) => item.sourceQuestionId), input.subtest, input.sourceBankId);
    assertPackageItemRevisions(input.items, sources, completionIntent === "ready");
    if (!id) {
      const created = await tx.reusableQuestionPackage.create({ data: { code: codeFromTitle(input.title, "paket"), createdByUserId: actorId, description: input.description.trim() || null, sourceBankId: input.sourceBankId, subtestId: subtest.id, title: input.title.trim(), updatedByUserId: actorId } });
      id = created.id;
    } else {
      await tx.reusableQuestionPackage.update({ where: { id }, data: { description: input.description.trim() || null, ...(completionIntent === "draft" ? { revision: { increment: 1 } } : {}), title: input.title.trim(), updatedByUserId: actorId } });
      await tx.reusableQuestionPackageItem.deleteMany({ where: { packageId: id } });
    }
    await tx.reusableQuestionPackageItem.createMany({ data: packageItemRows(id, input.items, sources) });

    const releasedVersion = completionIntent === "ready"
      ? await commitPackageReadyVersion(tx, id, actorId, { incrementRevision: Boolean(current) })
      : undefined;
    const saved = await tx.reusableQuestionPackage.findUniqueOrThrow({ where: { id }, include: packageInclude });
    const usageCounts = await readPackageUsageCounts([id], tx);
    return packageSaveResult(toPackageDto(saved, usageCounts.get(id) ?? 0), releasedVersion);
  });
}

async function saveReusableQuestionPackageMetadata(input: PackageMetadataInput, actorId: string) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Paket Soal wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${input.id}::uuid FOR UPDATE`;
    const current = await tx.reusableQuestionPackage.findFirst({ where: { id: input.id, createdByUserId: actorId } });
    if (!current) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
    const saved = await tx.reusableQuestionPackage.update({ where: { id: input.id }, data: { description: input.description.trim() || null, revision: { increment: 1 }, title: input.title.trim(), updatedByUserId: actorId }, include: packageInclude });
    const usageCounts = await readPackageUsageCounts([input.id], tx);
    return toPackageDto(saved, usageCounts.get(input.id) ?? 0);
  });
}

async function updateTryoutMetadata(input: TryoutMetadataInput, actorId: string) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Tryout wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${input.id}::uuid FOR UPDATE`;
    const current = await tx.tryoutPackage.findFirst({
      where: { id: input.id, createdByUserId: actorId },
      include: tryoutInclude,
    });
    if (!current) throw new TryoutValidationError("Tryout tidak ditemukan.");
    return toTryoutDto(await tx.tryoutPackage.update({
      where: { id: input.id },
      data: {
        description: input.description.trim() || null,
        title: input.title.trim(),
      },
      include: tryoutInclude,
    }));
  });
}

async function readyReusableQuestionPackageVersion(packageId: string, actorId: string) {
  return prisma.$transaction((tx) => commitPackageReadyVersion(tx, packageId, actorId));
}

async function listTryouts(actorId: string) { return (await prisma.tryoutPackage.findMany({ where: { createdByUserId: actorId }, include: tryoutInclude, orderBy: { updatedAt: "desc" } })).map(toTryoutDto); }
async function getTryoutForEdit(id: string, actorId: string) { const record = await prisma.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: tryoutInclude }); return record ? toTryoutDto(record) : null; }
function validateTryoutInput(input: SaveTryoutInput) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Tryout wajib diisi.");
  if (input.sections.length !== 7 || new Set(input.sections.map((section) => section.subtest)).size !== 7 || input.sections.some((section) => !SUBJECTS.includes(section.subtest))) throw new TryoutValidationError("Tryout harus memiliki tepat tujuh Test subject.");
  if (input.sections.some((section) => !Number.isInteger(section.durationMinutes) || section.durationMinutes < 1 || (section.testType === "cat" && (!Number.isInteger(section.catItemCount) || section.catItemCount! < 1)))) throw new TryoutValidationError("Konfigurasi durasi atau jumlah soal CAT tidak valid.");
}
function assertReadyPackageVersion(version: Prisma.ReusableQuestionPackageVersionGetPayload<{ include: typeof versionInclude }>, subtest: SubjectCode, subtestId: string) {
  if (version.status !== ContentStatus.published || version.subtestId !== subtestId) throw new TryoutValidationError(`Paket siap untuk Test ${subtest} tidak valid atau tidak cocok.`);
  // Blueprint Ready revisions intentionally persist only their immutable scope
  // and exact difficulty rule.  AssessmentRelease resolves current Ready
  // sources and creates the physical TryoutItem bridge at publish time.
  if (version.mode === ReusableQuestionPackageMode.blueprint) return;
  const readiness = packageVersionReadiness(version);
  if (!readiness.contentReady) throw new TryoutValidationError(`Sumber Test ${subtest} belum memiliki soal, opsi, penjelasan, atau media siap yang lengkap.`);
  if (!readiness.sourceQuestionIds.length || new Set(readiness.sourceQuestionIds).size !== readiness.sourceQuestionIds.length) throw new TryoutValidationError(`Sumber Test ${subtest} memiliki soal duplikat.`);
}
async function assertCatPackageReadiness(tx: Prisma.TransactionClient, section: { catItemCount?: number; packageVersionId?: string; subtestId: string }) {
  if (!section.packageVersionId || !section.catItemCount) throw new TryoutValidationError("CAT memerlukan Paket Soal dan jumlah soal.");
  const version = await tx.reusableQuestionPackageVersion.findFirst({
    where: { id: section.packageVersionId, package: { status: { not: ContentStatus.archived } } },
    include: { items: { select: { sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true, sourceRevisionProvenance: true, subtestId: true } } },
  });
  if (!version || version.subtestId !== section.subtestId || version.items.length < section.catItemCount || version.items.some((item) => item.subtestId !== section.subtestId || !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown)) throw new TryoutValidationError("Pool CAT harus berasal dari versi Paket immutable yang kompatibel dan mencukupi jumlah soal CAT.");
  const revisionIds = version.items.map((item) => item.sourceQuestionRevisionId!);
  const [revisions, calibrations] = await Promise.all([
    tx.questionRevision.findMany({ where: { id: { in: revisionIds }, status: QuestionRevisionStatus.ready }, select: { contentDigest: true, id: true, questionId: true } }),
    tx.twoPlQuestionCalibration.findMany({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } }, select: { contentDigest: true, difficulty: true, discrimination: true, id: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true } }),
  ]);
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  if (revisions.length !== new Set(revisionIds).size || calibrations.length !== new Set(revisionIds).size || version.items.some((item) => {
    const revision = revisionById.get(item.sourceQuestionRevisionId!);
    const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId!);
    return !revision || !calibration
      || revision.questionId !== item.sourceQuestionId
      || revision.contentDigest !== item.sourceContentDigest
      || calibration.questionId !== item.sourceQuestionId
      || calibration.contentDigest !== item.sourceContentDigest
      || !Number.isFinite(Number(calibration.difficulty))
      || !Number.isFinite(Number(calibration.discrimination))
      || Number(calibration.discrimination) <= 0
      || calibration.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown;
  })) throw new TryoutValidationError("Setiap kandidat pool CAT harus memiliki kalibrasi 2PL kanonis yang disetujui untuk QuestionRevision dan digest yang tepat.");
}
async function assertCatDirectReadiness(tx: Prisma.TransactionClient, sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[], catItemCount?: number) {
  if (!catItemCount || sources.length < catItemCount) throw new TryoutValidationError("CAT memerlukan soal langsung yang cukup untuk pool dan jumlah soal.");
  const revisions = sources.map((source) => source.currentRevision).filter((revision): revision is NonNullable<typeof revision> => Boolean(revision));
  const revisionIds = revisions.map((revision) => revision.id);
  const calibrations = await tx.twoPlQuestionCalibration.findMany({
    where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } },
    select: { contentDigest: true, difficulty: true, discrimination: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true },
  });
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  if (revisions.length !== sources.length || sources.some((source) => {
    const revision = source.currentRevision;
    const calibration = revision ? calibrationByRevision.get(revision.id) : undefined;
    return !revision
      || !calibration
      || calibration.questionId !== source.id
      || calibration.contentDigest !== revision.contentDigest
      || !Number.isFinite(Number(calibration.difficulty))
      || !Number.isFinite(Number(calibration.discrimination))
      || Number(calibration.discrimination) <= 0
      || calibration.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown;
  })) throw new TryoutValidationError("Setiap soal langsung untuk CAT harus memiliki kalibrasi 2PL kanonis yang disetujui dan cocok dengan digest revisinya.");
}
async function saveTryout(input: SaveTryoutInput, actorId: string) {
  validateTryoutInput(input);
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    if (id) {
      await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: { attempts: { take: 1 } } });
      if (!current) throw new TryoutValidationError("Tryout tidak ditemukan.");
      if (current.status === ContentStatus.published) throw new TryoutValidationError("Tryout yang sudah terbit tidak dapat diubah strukturnya. Gunakan Buat draf perubahan.");
      if (current.attempts.length) throw new TryoutValidationError("Tryout yang sudah dimulai peserta tidak dapat diubah. Gunakan Buat draf perubahan.");
      // A release-bound active session is participant-accessible. Keep its
      // physical bridge stable for the pinned release; the author must close
      // or archive that session before replacing section/item rows.
      const participantAccessibleRelease = await tx.tryoutDeliverySession.findFirst({
        where: { assessmentReleaseId: { not: null }, status: TryoutDeliverySessionStatus.active, tryoutId: id },
        select: { id: true },
      });
      if (participantAccessibleRelease) throw new TryoutValidationError("Tryout memiliki sesi aktif yang telah mengikat AssessmentRelease. Tutup atau arsipkan sesi sebelum mengganti baris fisik.");
      await tx.tryoutItem.deleteMany({ where: { tryoutId: id } });
      await tx.tryoutSection.deleteMany({ where: { tryoutId: id } });
      await tx.tryoutPackage.update({ where: { id }, data: { description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, revision: { increment: 1 }, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } });
    } else {
      const created = await tx.tryoutPackage.create({ data: { code: codeFromTitle(input.title, "tryout"), createdByUserId: actorId, description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } }); id = created.id;
    }
    const versions = await tx.reusableQuestionPackageVersion.findMany({ where: { id: { in: input.sections.flatMap((section) => section.packageVersionId ? [section.packageVersionId] : []) }, package: { status: { not: ContentStatus.archived } } }, include: versionInclude });
    const versionById = new Map(versions.map((version) => [version.id, version]));
    const sectionBySubtest = new Map(input.sections.map((section) => [section.subtest, section]));
    const subtests = await tx.subtest.findMany({ where: { code: { in: [...SUBJECTS] } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    const sectionRecords = await Promise.all(SUBJECTS.map(async (subjectCode, index) => {
      const sectionInput = sectionBySubtest.get(subjectCode)!;
      const subtest = subtestByCode.get(sectionInput.subtest);
      if (!subtest) throw new TryoutValidationError(`Subtest ${sectionInput.subtest} tidak ditemukan.`);
      const version = sectionInput.packageVersionId ? versionById.get(sectionInput.packageVersionId) : undefined;
      const directSelections = sectionInput.directQuestions ?? [];
      if (version && directSelections.length) throw new TryoutValidationError(`Test ${sectionInput.subtest} tidak dapat memakai Set dan pilihan langsung sekaligus.`);
      if (sectionInput.packageVersionId && (!version || version.status !== ContentStatus.published || version.subtestId !== subtest.id)) throw new TryoutValidationError(`Paket siap untuk Test ${sectionInput.subtest} tidak valid atau tidak cocok.`);
      if (version && ((version.mode === ReusableQuestionPackageMode.cat_pool) !== (sectionInput.testType === "cat"))) throw new TryoutValidationError(`Mode ${version.mode} hanya dapat dipakai dengan tipe Test yang kompatibel.`);
      const directSources = directSelections.length ? await readAndValidateDirectSources(tx, directSelections, sectionInput.subtest) : [];
      if (input.status === "published" && !version && !directSources.length) throw new TryoutValidationError("Setiap Test harus memiliki Set siap atau minimal satu soal langsung sebelum Tryout diterbitkan.");
      if (input.status === "published" && directSources.length) assertReadyDirectContent(directSources, sectionInput.subtest);
      if (input.status === "published" && version) assertReadyPackageVersion(version, sectionInput.subtest, subtest.id);
      if (input.status === "published" && sectionInput.testType === "cat") {
        if (version) await assertCatPackageReadiness(tx, { catItemCount: sectionInput.catItemCount, packageVersionId: version.id, subtestId: subtest.id });
        else await assertCatDirectReadiness(tx, directSources, sectionInput.catItemCount);
      }
      const section = await tx.tryoutSection.create({ data: { catItemCount: sectionInput.testType === "cat" ? sectionInput.catItemCount : null, catModelVersion: sectionInput.testType === "cat" ? CANONICAL_2PL_MODEL_VERSION : null, durationSeconds: sectionInput.durationMinutes * 60, instructions: sectionInput.instructions.trim() || null, packageVersionId: version?.id, questionCount: version?.items.length ?? directSources.length, scoringConfig: sectionInput.scoringConfig ? sectionInput.scoringConfig as Prisma.InputJsonValue : Prisma.JsonNull, sequenceNo: index + 1, shuffleItems: sectionInput.shuffleItems, subtestId: subtest.id, testType: sectionInput.testType === "cat" ? TryoutTestType.cat : TryoutTestType.cbt, title: `${sectionInput.subtest} · ${subtest.name}`, tryoutId: id! } });
      return { directSources, section, version };
    }));
    const itemEntries: Array<{ section: (typeof sectionRecords)[number]["section"]; snapshot: ReturnType<typeof toTryoutSnapshot>; version: (typeof versions)[number] | null }> = [];
    for (const { directSources, section, version } of sectionRecords) {
      if (version) {
        for (const snapshot of version.items) itemEntries.push({ section, snapshot: toTryoutSnapshot(snapshot), version });
        continue;
      }
      directSources.forEach((source, index) => {
        const revision = source.currentRevision!;
        itemEntries.push({
          section,
          snapshot: {
            difficulty: revision.difficulty,
            explanation: revision.explanation,
            explanationAssetId: revision.explanationAssetId,
            options: revision.options.map((option, optionIndex) => ({ assetId: option.assetId, choiceKey: String.fromCharCode(65 + optionIndex), content: option.content, isCorrect: option.isCorrect, sortOrder: optionIndex, sourceQuestionOptionId: null, sourceQuestionRevisionOptionId: option.id })),
            pointValue: 1,
            prompt: revision.stem,
            promptAssetId: revision.promptAssetId,
            sortOrder: index + 1,
            sourceContentDigest: revision.contentDigest,
            sourceQuestionId: source.id,
            sourceQuestionRevisionId: revision.id,
            sourceRevisionProvenance: revision.provenance,
            subtestId: source.subtestId!,
          },
          version: null,
        });
      });
    }
    const sourceQuestionIds = itemEntries.map(({ snapshot }) => snapshot.sourceQuestionId);
    if (new Set(sourceQuestionIds).size !== sourceQuestionIds.length) throw new TryoutValidationError("Satu soal sumber hanya boleh digunakan sekali dalam seluruh Tryout.");
    await Promise.all(itemEntries.map(async ({ section, snapshot, version }) => {
      const item = await tx.tryoutItem.create({ data: { difficulty: snapshot.difficulty, explanation: snapshot.explanation, explanationAssetId: snapshot.explanationAssetId, packageCode: version?.package.code ?? "direct", packageVersionId: version?.id, points: snapshot.pointValue, prompt: snapshot.prompt, promptAssetId: snapshot.promptAssetId, sortOrder: snapshot.sortOrder, sourceContentDigest: snapshot.sourceContentDigest, sourceQuestionId: snapshot.sourceQuestionId, sourceQuestionRevisionId: snapshot.sourceQuestionRevisionId, sourceRevisionProvenance: snapshot.sourceRevisionProvenance, subtestId: snapshot.subtestId, tryoutId: id!, tryoutSectionId: section.id } });
      await tx.tryoutItemOption.createMany({ data: snapshot.options.map((option) => ({ assetId: option.assetId, choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect, sortOrder: option.sortOrder, sourceQuestionOptionId: option.sourceQuestionOptionId, sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId, tryoutItemId: item.id })) });
    }));
    if (input.status === "published") {
      await createOrReuseAssessmentRelease(tx, id!, actorId, undefined, { publicationIntentKey: input.publicationIntentKey });
    }
    return toTryoutDto(await tx.tryoutPackage.findUniqueOrThrow({ where: { id }, include: tryoutInclude }));
  });
}
async function duplicateTryout(id: string, actorId: string) { const current = await getTryoutForEdit(id, actorId); if (!current) throw new TryoutValidationError("Tryout tidak ditemukan."); return saveTryout({ description: current.description, sections: current.sections.map((section) => ({ catItemCount: section.catItemCount, directQuestions: section.directQuestions?.map((question) => ({ sourceContentDigest: question.sourceContentDigest ?? "", sourceQuestionId: question.sourceQuestionId, sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? "" })), durationMinutes: section.durationMinutes, instructions: section.instructions, packageVersionId: section.packageVersionId, scoringConfig: section.scoringConfig, shuffleItems: section.shuffleItems, subtest: section.subtest, testType: section.testType })), status: "draft", title: `${current.title} (Salinan)` }, actorId); }

export { duplicateTryout, getReusableQuestionPackageForEdit, getReusableQuestionPackageUseContext, getReusableQuestionPackageVersionDetail, getReusableQuestionPackageVersionHub, getTryoutForEdit, listReadyPackageVersions, listReusableQuestionPackages, listTryouts, readyReusableQuestionPackageVersion, resolveReusableQuestionPackageHandoff, saveReusableQuestionPackage, saveReusableQuestionPackageMetadata, saveTryout, PackageConflictError, TryoutValidationError, updateTryoutMetadata };
export type { DirectQuestionInput, PackageConflictCode, PackageDto, PackageInput, PackageItemInput, PackageMetadataInput, PackageSaveIntent, PackageVersionReadiness, ReusableQuestionPackageHandoff, ReusableQuestionPackageHandoffResolution, ReusableQuestionPackageUseContext, ReusableQuestionPackageUseTarget, ReleasedPackageVersion, SaveReusableQuestionPackageResult, SaveTryoutInput, TestInput, TryoutMetadataInput };
