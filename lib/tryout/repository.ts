import "server-only";

import { AssessmentAttemptState, AttemptStatus, ContentStatus, MediaAssetState, MediaLibraryScope, Prisma, QuestionType, QuestionRevisionStatus, TryoutAdmissionMode, TryoutAttemptTestRunStatus, TryoutDeliverySessionStatus, TryoutResultReleasePolicy, TryoutTestType } from "@/generated/prisma/client";
import { createOrReuseAssessmentRelease } from "@/lib/tryout/assessment-release";
import { distinctTryoutUsageCounts, summarizePackageLifecycle, type PackageLifecycleItem } from "@/lib/tryout/package-lifecycle";
import { isImageMimeType } from "@/lib/media/domain";
import { prisma } from "@/lib/prisma";
import { packageReleaseTitle } from "@/lib/tryout/version-label";
import { canonicalizeCbtScoringConfig } from "@/lib/tryout/cbt-scoring-policy";
import { validateAnswerKey, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import { parseTryoutDateTime } from "@/lib/tryout/time";
import {
  MAIN_TRYOUT_SESSION_NAME,
  defaultMainSessionWindow,
} from "@/lib/tryout/main-session";

const SUBJECTS = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
type SubjectCode = (typeof SUBJECTS)[number];
type PackageSaveIntent = "draft" | "ready";
type PackageItemInput = { pointValue: number; sourceQuestionId: string; sourceQuestionRevisionId?: string };
type PackageInput = { completionIntent?: PackageSaveIntent; description: string; expectedRevision?: number; id?: string; items: PackageItemInput[]; sourceBankId: string; subtest: SubjectCode; title: string };
type PackageMetadataInput = { description: string; id: string; title: string };
type TryoutMetadataInput = { bannerMediaId?: string | null; description: string; id: string; title: string };
type DirectQuestionInput = { sourceContentDigest: string; sourceQuestionId: string; sourceQuestionRevisionId: string };
type TestInput = { directQuestions?: DirectQuestionInput[]; durationMinutes: number; instructions: string; scoringConfig?: Record<string, unknown>; shuffleItems: boolean; subtest: SubjectCode; testType: "cbt" };
type PackageVersionReadiness = {
  contentReady: boolean;
  hasExplanations: boolean;
  hasReadyMedia: boolean;
  itemCount: number;
  sourceQuestionIds: string[];
};
type SaveTryoutInput = { admissionMode?: "open" | "approval_required" | "invitation_only"; availableFrom?: Date | string; availableUntil?: Date | string; bannerMediaId?: string | null; defaultResultReleasePolicy?: "immediate" | "manual" | "automatic_at_end"; description: string; id?: string; publicationIntentKey?: string; sections: TestInput[]; status: "draft" | "published"; title: string };
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

function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function ensureMainTryoutDeliverySession(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    assessmentReleaseId: string | null;
    schedule: { availableFrom: Date; availableUntil: Date } | null;
    tryoutId: string;
    activate: boolean;
  },
) {
  const existing = await tx.tryoutDeliverySession.findFirst({
    where: { name: MAIN_TRYOUT_SESSION_NAME, tryoutId: input.tryoutId },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const now = new Date();
    const schedule = input.schedule ?? (input.activate && existing.availableUntil <= now ? defaultMainSessionWindow(now) : null);
    if (!input.activate && !schedule) return existing;
    if (!input.activate && schedule) {
      const updated = await tx.tryoutDeliverySession.update({
        where: { id: existing.id },
        data: {
          availableFrom: schedule.availableFrom,
          availableUntil: schedule.availableUntil,
          updatedByUserId: input.actorId,
        },
      });
      await tx.tryoutDeliveryAudit.create({
        data: {
          action: "delivery_session.main_schedule_updated",
          actorUserId: input.actorId,
          after: json({
            availableFrom: updated.availableFrom.toISOString(),
            availableUntil: updated.availableUntil.toISOString(),
          }),
          before: json({
            availableFrom: existing.availableFrom.toISOString(),
            availableUntil: existing.availableUntil.toISOString(),
          }),
          deliverySessionId: updated.id,
          reason: "Jadwal buka dan tutup sesi utama disimpan bersama Tryout.",
          tryoutId: input.tryoutId,
        },
      });
      return updated;
    }
    if (!input.assessmentReleaseId) {
      throw new TryoutValidationError("Tryout belum memiliki AssessmentRelease untuk membuka sesi utama.");
    }

    const window = schedule ?? { availableFrom: existing.availableFrom, availableUntil: existing.availableUntil };

    await tx.tryoutDeliverySession.updateMany({
      where: {
        id: { not: existing.id },
        isDefaultOpenRegistration: true,
        tryoutId: input.tryoutId,
      },
      data: { isDefaultOpenRegistration: false, updatedByUserId: input.actorId },
    });
    const opened = await tx.tryoutDeliverySession.update({
      where: { id: existing.id },
      data: {
        assessmentReleaseId: input.assessmentReleaseId,
        availableFrom: window.availableFrom,
        availableUntil: window.availableUntil,
        isDefaultOpenRegistration: true,
        status: TryoutDeliverySessionStatus.active,
        updatedByUserId: input.actorId,
      },
    });
    await tx.tryoutDeliveryAudit.create({
      data: {
        action: "delivery_session.main_auto_opened",
        actorUserId: input.actorId,
        after: json({
          assessmentReleaseId: opened.assessmentReleaseId,
          availableFrom: opened.availableFrom.toISOString(),
          availableUntil: opened.availableUntil.toISOString(),
          isDefaultOpenRegistration: opened.isDefaultOpenRegistration,
          status: opened.status,
        }),
        before: json({
          availableFrom: existing.availableFrom.toISOString(),
          availableUntil: existing.availableUntil.toISOString(),
          isDefaultOpenRegistration: existing.isDefaultOpenRegistration,
          status: existing.status,
        }),
        deliverySessionId: opened.id,
        reason: "Sesi utama dibuat aktif otomatis saat Tryout diterbitkan.",
        tryoutId: input.tryoutId,
      },
    });
    return opened;
  }

  const window = input.schedule ?? defaultMainSessionWindow();
  if (input.activate) {
    await tx.tryoutDeliverySession.updateMany({
      where: {
        isDefaultOpenRegistration: true,
        tryoutId: input.tryoutId,
      },
      data: { isDefaultOpenRegistration: false, updatedByUserId: input.actorId },
    });
  }
  const created = await tx.tryoutDeliverySession.create({
    data: {
      assessmentReleaseId: input.activate ? input.assessmentReleaseId : null,
      availableFrom: window.availableFrom,
      availableUntil: window.availableUntil,
      createdByUserId: input.actorId,
      fullscreenPrompt: false,
      isDefaultOpenRegistration: input.activate,
      name: MAIN_TRYOUT_SESSION_NAME,
      rankingRule: "none",
      resultReleasePolicy: "inherit",
      scheduledReleaseAt: null,
      status: input.activate ? TryoutDeliverySessionStatus.active : TryoutDeliverySessionStatus.draft,
      tryoutId: input.tryoutId,
      updatedByUserId: input.actorId,
    },
  });
  await tx.tryoutDeliveryAudit.create({
    data: {
      action: "delivery_session.main_auto_created",
      actorUserId: input.actorId,
      after: json({
        availableFrom: created.availableFrom.toISOString(),
        availableUntil: created.availableUntil.toISOString(),
        isDefaultOpenRegistration: created.isDefaultOpenRegistration,
        name: created.name,
        status: created.status,
      }),
      deliverySessionId: created.id,
      reason: input.activate
        ? "Sesi utama dibuat dan dibuka otomatis saat Tryout diterbitkan."
        : "Sesi utama dibuat otomatis saat Tryout disimpan.",
      tryoutId: input.tryoutId,
    },
  });
  return created;
}

async function resolveBannerMediaId(tx: Prisma.TransactionClient, bannerMediaId: string | null | undefined) {
  if (!bannerMediaId) return null;
  const asset = await tx.asset.findUnique({ where: { id: bannerMediaId }, select: { libraryScope: true, mimeType: true, state: true } });
  if (!asset || asset.libraryScope !== MediaLibraryScope.kapten || asset.state !== MediaAssetState.ready || !isImageMimeType(asset.mimeType)) {
    throw new TryoutValidationError("Banner Tryout harus berupa gambar Ready dari library media Kapten.");
  }
  return bannerMediaId;
}

const sourceInclude = {
  currentRevision: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true } },
  questionBank: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  explanationAsset: true,
  subtest: true,
} satisfies Prisma.QuestionInclude;
const versionInclude = { package: { include: { subtest: true } }, items: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true, sourceQuestionRevision: { select: { questionType: true } } }, orderBy: { sortOrder: "asc" as const } } } satisfies Prisma.ReusableQuestionPackageVersionInclude;
const packageInclude = { sourceBank: true, subtest: true, items: { include: { sourceQuestion: { include: sourceInclude } }, orderBy: { sortOrder: "asc" as const } }, versions: { where: { status: ContentStatus.published }, orderBy: { versionNo: "desc" as const }, take: 1, include: { items: { select: { pointValue: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true }, orderBy: { sortOrder: "asc" as const } } } } } satisfies Prisma.ReusableQuestionPackageInclude;
const packageLifecycleInclude = { sourceBank: { select: { id: true, name: true } }, subtest: { select: { code: true, id: true, name: true } }, items: { select: { pointValue: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true }, orderBy: { sortOrder: "asc" as const } }, versions: { where: { status: ContentStatus.published }, orderBy: { versionNo: "desc" as const }, take: 1, include: { items: { select: { pointValue: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true }, orderBy: { sortOrder: "asc" as const } } } } } satisfies Prisma.ReusableQuestionPackageInclude;
const tryoutInclude = { assessmentReleases: { orderBy: { releaseNumber: "desc" as const }, take: 1 }, sections: { include: { items: { orderBy: { sortOrder: "asc" as const }, select: { explanation: true, explanationAsset: { select: { state: true } }, explanationAssetId: true, options: { select: { asset: { select: { state: true } } } }, packageVersionId: true, prompt: true, promptAsset: { select: { state: true } }, promptAssetId: true, questionType: true, sortOrder: true, sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevision: { select: { id: true } }, sourceQuestionRevisionId: true, sourceQuestion: { select: { questionBank: { select: { id: true, name: true, purpose: true } } } } } }, subtest: true }, orderBy: { sequenceNo: "asc" as const } }, attempts: { select: { id: true }, take: 1 } } satisfies Prisma.TryoutPackageInclude;
type TryoutReadRecord = Prisma.TryoutPackageGetPayload<{ include: typeof tryoutInclude }>;
type TryoutPackageBindingRecord = { sections: Array<{ items: Array<{ packageVersionId: string | null }>; packageVersionId: string | null }> };

function codeFromTitle(title: string, prefix: string) { return `${prefix}-${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "draft"}-${Date.now()}`.slice(0, 100); }
function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }
function answerModeForQuestionType(value: QuestionType | string | null | undefined): QuestionAnswerMode | null {
  if (value === QuestionType.multiple_choice || value === "multiple_choice") return "multiple_choice";
  if (value === QuestionType.single_choice || value === "single_choice" || value === null || value === undefined) return "single_choice";
  return null;
}
function packageVersionReadiness(version: Prisma.ReusableQuestionPackageVersionGetPayload<{ include: typeof versionInclude }>) {
  const sourceQuestionIds = version.items.map((item) => item.sourceQuestionId);
  const hasUniqueSources = new Set(sourceQuestionIds).size === sourceQuestionIds.length;
  const hasExplanations = version.items.every((item) => Boolean(item.explanation?.trim() || item.explanationAssetId));
  const hasReadyMedia = version.items.every((item) => isReadyAsset(item.promptAsset) && isReadyAsset(item.explanationAsset) && item.options.every((option) => isReadyAsset(option.asset)));
  const contentReady = version.items.length > 0 && version.items.every((item) => {
    const options = item.options;
    const answerMode = answerModeForQuestionType(item.sourceQuestionRevision?.questionType);
    const answerKey = answerMode ? validateAnswerKey(answerMode, options.map((option) => ({ id: option.sourceQuestionRevisionOptionId ?? option.id, isCorrect: option.isCorrect }))) : null;
    return item.prompt.trim()
      && hasExplanations
      && options.length >= 2
      && options.length <= 5
      && Boolean(answerKey?.ok)
      && options.every((option) => option.content.trim())
      && hasReadyMedia;
  }) && hasUniqueSources;
  return { contentReady, hasExplanations, hasReadyMedia, itemCount: version.items.length, sourceQuestionIds } satisfies PackageVersionReadiness;
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
      || source.questionBank?.purpose !== "tryout"
      || source.status === ContentStatus.archived
      || revision?.status !== QuestionRevisionStatus.ready
      || source.subtest?.code !== subtest
      || source.questionBank === null
      || options.length < 2
      || options.length > 5
      || !answerModeForQuestionType(revision?.questionType)
      || !validateAnswerKey(answerModeForQuestionType(revision?.questionType) ?? "single_choice", options.map((option) => ({ id: option.id, isCorrect: option.isCorrect }))).ok
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
      || source.questionBank?.purpose !== "tryout"
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
      || !answerModeForQuestionType(revision?.questionType)
      || !validateAnswerKey(answerModeForQuestionType(revision?.questionType) ?? "single_choice", options.map((option) => ({ id: option.id, isCorrect: option.isCorrect }))).ok
      || options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
      || !revision.stem.trim()
      || !isReadyAsset(revision.promptAsset)
      || !isReadyAsset(revision.explanationAsset);
  })) throw new TryoutValidationError("Pilih soal langsung hanya dari revisi Ready yang masih aktif, kompatibel dengan Subtest, dan memiliki media siap.");
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
function hasArchivedPackageBinding(record: TryoutPackageBindingRecord) {
  return record.sections.some((section) => Boolean(section.packageVersionId) || section.items.some((item) => Boolean(item.packageVersionId)));
}
function toTryoutDto(record: TryoutReadRecord) {
  const release = record.assessmentReleases[0] ?? null;
  return {
    admissionMode: record.admissionMode,
    assessmentRelease: release ? { digest: release.contentDigest, id: release.id, number: release.releaseNumber, payload: release.payload, publishedAt: release.publishedAt.toISOString() } : null,
    bannerMediaId: record.bannerMediaId,
    defaultReleasePolicy: record.defaultResultReleasePolicy,
    description: record.description ?? "",
    id: record.id,
    locked: record.attempts.length > 0,
    sections: record.sections.map((section) => ({
      directQuestions: section.packageVersionId ? [] : section.items.flatMap((item) => {
        if (item.packageVersionId || !item.sourceQuestionId) return [];
        return [{
          bankId: item.sourceQuestion?.questionBank?.id,
          bankTitle: item.sourceQuestion?.questionBank?.name,
          hasExplanation: Boolean(item.explanation?.trim() || item.explanationAssetId),
          hasReadyMedia: [item.promptAsset, item.explanationAsset, ...item.options.map((option) => option.asset)].every((asset) => !asset || asset.state === "ready"),
          prompt: item.prompt,
          questionType: answerModeForQuestionType(item.questionType) ?? "single_choice",
          sourceContentDigest: item.sourceContentDigest ?? undefined,
          sourceQuestionId: item.sourceQuestionId,
          sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined,
        }];
      }),
      durationMinutes: Math.round(section.durationSeconds / 60),
      id: section.id,
      instructions: section.instructions ?? "",
      scoringConfig: section.scoringConfig as Record<string, unknown> | undefined,
      shuffleItems: section.shuffleItems,
      subtest: section.subtest.code as SubjectCode,
      testType: "cbt" as const,
    })),
    status: record.status === ContentStatus.published ? "published" as const : "draft" as const,
    title: record.title,
    updatedAt: record.updatedAt.getTime(),
  };
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
      select: { createdAt: true, readyAt: true, versionNo: true, _count: { select: { items: true } } },
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
    versions: versions.map((version) => ({ createdAt: version.createdAt.getTime(), itemCount: version._count.items, readyAt: version.readyAt?.getTime(), versionNo: version.versionNo })),
  };
}

async function getReusableQuestionPackageVersionDetail(packageId: string, versionNo: number, actorId: string) {
  const record = await prisma.reusableQuestionPackageVersion.findFirst({
    where: { packageId, versionNo, status: ContentStatus.published, package: { createdByUserId: actorId } },
    include: {
      package: { include: { subtest: true } }, sourceBank: true,
      items: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!record) return null;
  return {
    packageId: record.packageId, packageTitle: record.package.title, sourceBankName: record.sourceBank.name, subtest: record.package.subtest.code as SubjectCode, versionNo: record.versionNo,
    items: record.items.map((item) => ({ difficulty: item.difficulty, options: item.options.map((option) => ({ choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect })), pointValue: Number(item.pointValue), prompt: item.prompt, sortOrder: item.sortOrder })),
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
  return records.map((record) => ({
    ...packageVersionReadiness(record),
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
  const sourceBank = await tx.questionBank.findUnique({ where: { id: pkg.sourceBankId }, select: { id: true, purpose: true } });
  if (!sourceBank || sourceBank.purpose !== "tryout") throw new TryoutValidationError("Paket hanya dapat memakai Bank Soal tujuan Tryout.");
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
  }
  await Promise.all(
    pkg.items.map(async (membership) => {
      const source = sourceById.get(membership.sourceQuestionId)!;
      const revision = source.currentRevision!;
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
          subtestId: pkg.subtestId,
        },
      });
      await tx.reusableQuestionPackageVersionItemOption.createMany({
        data: revision.options.map((option, index) => ({
          assetId: option.assetId,
          choiceKey: option.label || String.fromCharCode(65 + index),
          content: option.content,
          isCorrect: option.isCorrect,
          packageVersionItemId: item.id,
          sortOrder: option.sortOrder,
          sourceQuestionOptionId: option.id,
        })),
      });
    }),
  );

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
    const sourceBank = await tx.questionBank.findUnique({ where: { id: input.sourceBankId }, select: { id: true, purpose: true } });
    if (!sourceBank || sourceBank.purpose !== "tryout") throw new TryoutValidationError("Paket hanya dapat memakai Bank Soal tujuan Tryout.");
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
    const [saved, usageCounts] = await Promise.all([
      tx.reusableQuestionPackage.findUniqueOrThrow({ where: { id }, include: packageInclude }),
      readPackageUsageCounts([id], tx),
    ]);
    return packageSaveResult(toPackageDto(saved, usageCounts.get(id) ?? 0), releasedVersion);
  });
}

async function saveReusableQuestionPackageMetadata(input: PackageMetadataInput, actorId: string) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Paket Soal wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${input.id}::uuid FOR UPDATE`;
    const current = await tx.reusableQuestionPackage.findFirst({ where: { id: input.id, createdByUserId: actorId } });
    if (!current) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
    const [saved, usageCounts] = await Promise.all([
      tx.reusableQuestionPackage.update({ where: { id: input.id }, data: { description: input.description.trim() || null, revision: { increment: 1 }, title: input.title.trim(), updatedByUserId: actorId }, include: packageInclude }),
      readPackageUsageCounts([input.id], tx),
    ]);
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
    if (hasArchivedPackageBinding(current)) throw new TryoutValidationError("Tryout berbasis Paket Soal sudah diarsipkan dan tidak dapat diubah.");
    const bannerMediaId = await resolveBannerMediaId(tx, input.bannerMediaId);
    return toTryoutDto(await tx.tryoutPackage.update({
      where: { id: input.id },
      data: {
        bannerMediaId,
        description: input.description.trim() || null,
        title: input.title.trim(),
      },
      include: tryoutInclude,
    }));
  });
}

async function unpublishTryout(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${id}::uuid FOR UPDATE`;
    const current = await tx.tryoutPackage.findFirst({
      select: { id: true, publishedAt: true, status: true },
      where: { createdByUserId: actorId, id },
    });
    if (!current) throw new TryoutValidationError("Tryout tidak ditemukan.");
    if (current.status !== ContentStatus.published) throw new TryoutValidationError("Tryout ini sudah tidak berstatus diterbitkan.");

    const activeAttempt = await tx.tryoutAttempt.findFirst({
      select: { id: true },
      where: {
        OR: [
          { attemptState: AssessmentAttemptState.in_progress },
          { status: AttemptStatus.in_progress },
          { runs: { some: { status: TryoutAttemptTestRunStatus.active } } },
        ],
        tryoutId: id,
      },
    });
    if (activeAttempt) throw new TryoutValidationError("Tryout masih sedang dikerjakan peserta. Tunggu sampai semua attempt selesai sebelum menjadikannya draf.");

    const updated = await tx.tryoutPackage.update({
      data: { publishedAt: null, status: ContentStatus.draft },
      include: tryoutInclude,
      where: { id },
    });
    const mainSession = await tx.tryoutDeliverySession.findFirst({
      where: { name: MAIN_TRYOUT_SESSION_NAME, tryoutId: id },
      select: {
        availableFrom: true,
        availableUntil: true,
        id: true,
        isDefaultOpenRegistration: true,
        status: true,
      },
    });
    if (mainSession && mainSession.status !== TryoutDeliverySessionStatus.archived) {
      const closedSession = await tx.tryoutDeliverySession.update({
        where: { id: mainSession.id },
        data: {
          isDefaultOpenRegistration: false,
          status: TryoutDeliverySessionStatus.closed,
          updatedByUserId: actorId,
        },
      });
      await tx.tryoutDeliveryAudit.create({
        data: {
          action: "delivery_session.main_auto_closed",
          actorUserId: actorId,
          after: json({
            isDefaultOpenRegistration: closedSession.isDefaultOpenRegistration,
            status: closedSession.status,
          }),
          before: json({
            availableFrom: mainSession.availableFrom.toISOString(),
            availableUntil: mainSession.availableUntil.toISOString(),
            isDefaultOpenRegistration: mainSession.isDefaultOpenRegistration,
            status: mainSession.status,
          }),
          deliverySessionId: closedSession.id,
          reason: "Sesi utama ditutup otomatis saat Tryout dikembalikan ke draf.",
          tryoutId: id,
        },
      });
    }
    await tx.tryoutDeliveryAudit.create({
      data: {
        action: "tryout.unpublished",
        actorUserId: actorId,
        after: json({ publishedAt: null, status: updated.status }),
        before: json({ publishedAt: current.publishedAt?.toISOString() ?? null, status: current.status }),
        reason: "Tryout dikembalikan ke draf oleh Kapten.",
        tryoutId: id,
      },
    });
    return toTryoutDto(updated);
  });
}

async function readyReusableQuestionPackageVersion(packageId: string, actorId: string) {
  return prisma.$transaction((tx) => commitPackageReadyVersion(tx, packageId, actorId));
}

async function listTryouts(actorId: string) {
  const records = await prisma.tryoutPackage.findMany({ where: { createdByUserId: actorId }, include: tryoutInclude, orderBy: { updatedAt: "desc" } });
  return records.flatMap((record) => hasArchivedPackageBinding(record) ? [] : [toTryoutDto(record)]);
}
async function getTryoutForEdit(id: string, actorId: string) {
  const record = await prisma.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: tryoutInclude });
  return record && !hasArchivedPackageBinding(record) ? toTryoutDto(record) : null;
}
function validateTryoutInput(input: SaveTryoutInput) {
  for (const section of input.sections) {
    const legacySection = section as unknown as Record<string, unknown>;
    if (legacySection.packageVersionId) throw new TryoutValidationError("Paket Soal sudah diarsipkan. Pilih soal langsung dari Bank Soal.");
    if (section.testType !== "cbt") throw new TryoutValidationError("Tryout hanya mendukung Test CBT.");
    try {
      canonicalizeCbtScoringConfig(section.scoringConfig);
    } catch (error) {
      throw new TryoutValidationError(error instanceof Error ? error.message : "Metode penilaian CBT tidak valid.");
    }
  }
  if (!input.title.trim()) throw new TryoutValidationError("Judul Tryout wajib diisi.");
  if (input.admissionMode !== undefined && !["open", "approval_required", "invitation_only"].includes(input.admissionMode)) throw new TryoutValidationError("Kebijakan akses Tryout tidak valid.");
  if (input.defaultResultReleasePolicy !== undefined && !["immediate", "manual", "automatic_at_end"].includes(input.defaultResultReleasePolicy)) throw new TryoutValidationError("Kebijakan rilis hasil Tryout tidak valid.");
  if (input.sections.length !== 7 || new Set(input.sections.map((section) => section.subtest)).size !== 7 || input.sections.some((section) => !SUBJECTS.includes(section.subtest))) throw new TryoutValidationError("Tryout harus memiliki tepat tujuh Test subject.");
  if (input.sections.some((section) => !Number.isInteger(section.durationMinutes) || section.durationMinutes < 1)) throw new TryoutValidationError("Konfigurasi durasi Test tidak valid.");
}

function parseTryoutSchedule(input: SaveTryoutInput) {
  if (input.availableFrom === undefined && input.availableUntil === undefined) return null;
  if (input.availableFrom === undefined || input.availableUntil === undefined) {
    throw new TryoutValidationError("Waktu buka dan tutup Tryout harus diisi bersama.");
  }
  const availableFrom = parseTryoutDateTime(input.availableFrom);
  const availableUntil = parseTryoutDateTime(input.availableUntil);
  if (Number.isNaN(availableFrom.getTime()) || Number.isNaN(availableUntil.getTime())) {
    throw new TryoutValidationError("Waktu buka dan tutup Tryout tidak valid.");
  }
  if (availableUntil <= availableFrom) {
    throw new TryoutValidationError("Waktu tutup Tryout harus setelah waktu buka.");
  }
  return { availableFrom, availableUntil };
}

async function resolveCbtScoringConfig(
  tx: Prisma.TransactionClient,
  value: unknown,
  sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[],
  requireReleaseParameters: boolean,
) {
  const policy = canonicalizeCbtScoringConfig(value, sources.map((source) => source.id));
  if (policy.method !== "irt_2pl") return policy;
  if (requireReleaseParameters && policy.itemParameters.length !== sources.length) throw new TryoutValidationError("IRT memerlukan parameter a/b untuk seluruh soal sebelum Tryout diterbitkan.");
  return policy;
}
async function saveTryout(input: SaveTryoutInput, actorId: string) {
  validateTryoutInput(input);
  const schedule = parseTryoutSchedule(input);
  return prisma.$transaction(async (tx) => {
    const bannerMediaId = await resolveBannerMediaId(tx, input.bannerMediaId);
    let id = input.id;
    if (id) {
      await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: { attempts: { take: 1 }, sections: { select: { items: { select: { packageVersionId: true } }, packageVersionId: true } } } });
      if (!current) throw new TryoutValidationError("Tryout tidak ditemukan.");
      if (hasArchivedPackageBinding(current)) throw new TryoutValidationError("Tryout berbasis Paket Soal sudah diarsipkan dan tidak dapat diubah. Buat Tryout baru dari soal langsung di Bank Soal.");
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
      await tx.tryoutPackage.update({ where: { id }, data: { admissionMode: input.admissionMode as TryoutAdmissionMode | undefined, bannerMediaId, defaultResultReleasePolicy: input.defaultResultReleasePolicy as TryoutResultReleasePolicy | undefined, description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, revision: { increment: 1 }, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } });
    } else {
      const created = await tx.tryoutPackage.create({ data: { admissionMode: (input.admissionMode ?? "open") as TryoutAdmissionMode, bannerMediaId, code: codeFromTitle(input.title, "tryout"), createdByUserId: actorId, defaultResultReleasePolicy: (input.defaultResultReleasePolicy ?? "automatic_at_end") as TryoutResultReleasePolicy, description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } }); id = created.id;
    }
    const sectionBySubtest = new Map(input.sections.map((section) => [section.subtest, section]));
    const subtests = await tx.subtest.findMany({ where: { code: { in: [...SUBJECTS] } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    const sectionRecords = await Promise.all(SUBJECTS.map(async (subjectCode, index) => {
      const sectionInput = sectionBySubtest.get(subjectCode)!;
      const subtest = subtestByCode.get(sectionInput.subtest);
      if (!subtest) throw new TryoutValidationError(`Subtest ${sectionInput.subtest} tidak ditemukan.`);
      const directSelections = sectionInput.directQuestions ?? [];
      const directSources = directSelections.length ? await readAndValidateDirectSources(tx, directSelections, sectionInput.subtest) : [];
      if (input.status === "published" && !directSources.length) throw new TryoutValidationError("Setiap Test harus memiliki minimal satu soal langsung sebelum Tryout diterbitkan.");
      const scoringConfig = await resolveCbtScoringConfig(tx, sectionInput.scoringConfig, directSources, input.status === "published");
      const section = await tx.tryoutSection.create({ data: { durationSeconds: sectionInput.durationMinutes * 60, instructions: sectionInput.instructions.trim() || null, packageVersionId: null, questionCount: directSources.length, scoringConfig: json(scoringConfig), sequenceNo: index + 1, shuffleItems: sectionInput.shuffleItems, subtestId: subtest.id, testType: TryoutTestType.cbt, title: `${sectionInput.subtest} · ${subtest.name}`, tryoutId: id! } });
      return { directSources, section };
    }));
    const itemEntries = sectionRecords.flatMap(({ directSources, section }) => directSources.map((source, index) => {
      const revision = source.currentRevision!;
      return {
        section,
        snapshot: {
          difficulty: revision.difficulty,
          explanation: revision.explanation,
          explanationAssetId: revision.explanationAssetId,
          questionType: answerModeForQuestionType(revision.questionType) ?? "single_choice",
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
      };
    }));
    const sourceQuestionIds = itemEntries.map(({ snapshot }) => snapshot.sourceQuestionId);
    if (new Set(sourceQuestionIds).size !== sourceQuestionIds.length) throw new TryoutValidationError("Satu soal sumber hanya boleh digunakan sekali dalam seluruh Tryout.");
    await Promise.all(itemEntries.map(async ({ section, snapshot }) => {
      const item = await tx.tryoutItem.create({ data: { difficulty: snapshot.difficulty, explanation: snapshot.explanation, explanationAssetId: snapshot.explanationAssetId, packageCode: "direct", packageVersionId: null, points: snapshot.pointValue, prompt: snapshot.prompt, promptAssetId: snapshot.promptAssetId, questionType: snapshot.questionType, sortOrder: snapshot.sortOrder, sourceContentDigest: snapshot.sourceContentDigest, sourceQuestionId: snapshot.sourceQuestionId, sourceQuestionRevisionId: snapshot.sourceQuestionRevisionId, sourceRevisionProvenance: snapshot.sourceRevisionProvenance, subtestId: snapshot.subtestId, tryoutId: id!, tryoutSectionId: section.id } });
      await tx.tryoutItemOption.createMany({ data: snapshot.options.map((option) => ({ assetId: option.assetId, choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect, sortOrder: option.sortOrder, sourceQuestionOptionId: option.sourceQuestionOptionId, sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId, tryoutItemId: item.id })) });
    }));
    const assessmentRelease = input.status === "published"
      ? await createOrReuseAssessmentRelease(tx, id!, actorId, undefined, { publicationIntentKey: input.publicationIntentKey })
      : null;
    await ensureMainTryoutDeliverySession(tx, {
      activate: input.status === "published",
      actorId,
      assessmentReleaseId: assessmentRelease?.id ?? null,
      schedule,
      tryoutId: id!,
    });
    return toTryoutDto(await tx.tryoutPackage.findUniqueOrThrow({ where: { id }, include: tryoutInclude }));
  });
}
async function duplicateTryout(id: string, actorId: string) { const current = await getTryoutForEdit(id, actorId); if (!current) throw new TryoutValidationError("Tryout tidak ditemukan."); return saveTryout({ bannerMediaId: current.bannerMediaId, description: current.description, sections: current.sections.map((section) => ({ directQuestions: section.directQuestions?.map((question) => ({ sourceContentDigest: question.sourceContentDigest ?? "", sourceQuestionId: question.sourceQuestionId, sourceQuestionRevisionId: question.sourceQuestionRevisionId ?? "" })), durationMinutes: section.durationMinutes, instructions: section.instructions, scoringConfig: section.scoringConfig, shuffleItems: section.shuffleItems, subtest: section.subtest, testType: "cbt" })), status: "draft", title: `${current.title} (Salinan)` }, actorId); }

export { duplicateTryout, getReusableQuestionPackageForEdit, getReusableQuestionPackageVersionDetail, getReusableQuestionPackageVersionHub, getTryoutForEdit, listReadyPackageVersions, listReusableQuestionPackages, listTryouts, readyReusableQuestionPackageVersion, saveReusableQuestionPackage, saveReusableQuestionPackageMetadata, saveTryout, PackageConflictError, TryoutValidationError, unpublishTryout, updateTryoutMetadata };
export type { DirectQuestionInput, PackageConflictCode, PackageDto, PackageInput, PackageItemInput, PackageMetadataInput, PackageSaveIntent, PackageVersionReadiness, ReleasedPackageVersion, SaveReusableQuestionPackageResult, SaveTryoutInput, TestInput, TryoutMetadataInput };
