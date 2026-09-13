import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  ContentStatus,
  Prisma,
  QuestionType,
  QuestionRevisionProvenance,
  QuestionRevisionStatus,
  ReusableQuestionPackageMode,
  TryoutDeliverySessionStatus,
} from "@/generated/prisma/client";
import {
  buildAssessmentReleasePayload as buildCanonicalAssessmentReleasePayload,
  canonicalAssessmentReleaseJson,
  digestAssessmentReleasePayload,
} from "@/lib/tryout/assessment-release-canonical.mjs";
import {
  ASSEMBLY_RESOLVER_VERSION,
  AssemblyResolutionError,
  resolveBlueprintCandidates,
  resolvePoolCandidates,
} from "@/lib/tryout/assembly-validation";
import {
  TRYOUT_CBT_SCORING_VERSION,
  TRYOUT_SCORE_AGGREGATION_VERSION,
} from "@/lib/tryout/scoring";
import { canonicalizeCbtScoringConfig } from "@/lib/tryout/cbt-scoring-policy";
import { validateAnswerKey, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";

const ASSESSMENT_RELEASE_SCHEMA_VERSION = "assessment-release-v1";
const LOGICAL_ASSESSMENT_REVISION_VERSION = 1;
const releaseTryoutInclude = {
  assessmentReleases: {
    orderBy: { releaseNumber: "desc" as const },
    take: 1,
  },
  sections: {
    include: {
      packageVersion: {
        include: {
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
          package: { select: { code: true, id: true, mode: true, status: true, title: true } },
          rule: true,
          sourceBank: { select: { id: true, name: true, purpose: true, status: true } },
          subtest: { select: { code: true, id: true, isActive: true, name: true } },
        },
      },
      subtest: { select: { code: true, name: true } },
      items: {
        include: { options: { orderBy: { sortOrder: "asc" as const } } },
        orderBy: { sortOrder: "asc" as const },
      },
    },
    orderBy: { sequenceNo: "asc" as const },
  },
} satisfies Prisma.TryoutPackageInclude;

type ReleaseTryoutRecord = Prisma.TryoutPackageGetPayload<{
  include: typeof releaseTryoutInclude;
}>;

type AssessmentReleaseAssemblyMetadata = {
  availability: Prisma.InputJsonValue;
  candidateCount: number;
  mode: "blueprint" | "random_pool";
  packageId: string;
  packageVersionId: string;
  publicationIntentKey?: string;
  quotas?: Prisma.InputJsonValue;
  requestedCount: number;
  resolvedRevisionDigests: string[];
  resolvedSourceIds: string[];
  resolverVersion: string;
  scopeSummary?: Prisma.InputJsonValue;
  seed?: string;
};

type AssessmentReleaseResolutionBlocker = {
  code: string;
  details: Record<string, unknown>;
  message: string;
};

class AssessmentReleaseResolutionError extends Error {
  readonly blockers: AssessmentReleaseResolutionBlocker[];
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    blockers: AssessmentReleaseResolutionBlocker[] = [],
  ) {
    super(message);
    this.name = "AssessmentReleaseResolutionError";
    this.blockers = blockers;
    this.code = code;
    this.details = details;
  }
}

const releaseSourceInclude = {
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
  subtest: { select: { code: true, id: true, isActive: true, name: true } },
} satisfies Prisma.QuestionInclude;

type ReleaseSourceRecord = Prisma.QuestionGetPayload<{ include: typeof releaseSourceInclude }>;

type ReleaseSnapshot = {
  difficulty: ReleaseTryoutRecord["sections"][number]["items"][number]["difficulty"];
  explanation: string | null;
  explanationAssetId: string | null;
  questionType: QuestionAnswerMode;
  options: Array<{
    assetId: string | null;
    choiceKey: string;
    content: string;
    isCorrect: boolean;
    sortOrder: number;
    sourceQuestionOptionId: string | null;
    sourceQuestionRevisionOptionId: string | null;
  }>;
  pointValue: number;
  prompt: string;
  promptAssetId: string | null;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
  sourceRevisionProvenance: QuestionRevisionProvenance;
  subtestId: string;
};

type AssemblySectionResolution = {
  metadata: AssessmentReleaseAssemblyMetadata;
  sectionId: string;
  snapshots: ReleaseSnapshot[];
};

type CreateAssessmentReleaseOptions = {
  publicationIntentKey?: string;
};

type AssessmentReleaseRecord = {
  contentDigest: string;
  id: string;
  payload: Prisma.JsonValue;
  publishedAt: Date;
  releaseNumber: number;
};

type AssessmentReleaseMetadata = {
  digest: string;
  id: string;
  number: number;
  payload: Prisma.JsonValue;
  publishedAt: string;
};

type ParticipantAssessmentReleaseMetadata = Omit<
  AssessmentReleaseMetadata,
  "payload"
> & {
  payloadMetadata: Prisma.JsonValue;
};

type AssessmentReleaseSectionLabel = {
  sequenceNo?: number;
  subtestCode?: string | null;
  subtestId?: string;
  subtestName?: string | null;
  title?: string | null;
};

function findAssessmentReleaseSectionForRun(
  payload: Prisma.JsonValue | null | undefined,
  run: { contentSnapshot: Prisma.JsonValue; sequenceNo: number },
) {
  const value = payload as { sections?: Array<AssessmentReleaseSectionLabel> } | null | undefined;
  const snapshot = run.contentSnapshot as { sequenceNo?: number; subtestId?: string };
  if (!Array.isArray(value?.sections)
    || snapshot.sequenceNo !== run.sequenceNo
    || typeof snapshot.subtestId !== "string") return null;
  return value.sections.find((section) =>
    section.sequenceNo === run.sequenceNo && section.subtestId === snapshot.subtestId,
  ) ?? null;
}

function toAssessmentReleaseMetadata(
  release: AssessmentReleaseRecord,
): AssessmentReleaseMetadata {
  return {
    digest: release.contentDigest,
    id: release.id,
    number: release.releaseNumber,
    payload: release.payload,
    publishedAt: release.publishedAt.toISOString(),
  };
}

function toParticipantAssessmentReleaseMetadata(
  release: AssessmentReleaseRecord,
): ParticipantAssessmentReleaseMetadata {
  const payload = release.payload as {
    assessmentRevision?: Prisma.JsonValue;
    schemaVersion?: Prisma.JsonValue;
    scoring?: Prisma.JsonValue;
    sections?: Array<{
      assembly?: { mode?: Prisma.JsonValue };
      durationSeconds?: Prisma.JsonValue;
      items?: unknown[];
      randomization?: Prisma.JsonValue;
      scoring?: { testType?: Prisma.JsonValue };
      sequenceNo?: Prisma.JsonValue;
      title?: Prisma.JsonValue;
    }>;
  };
  return {
    digest: release.contentDigest,
    id: release.id,
    number: release.releaseNumber,
    payloadMetadata: {
      assessmentRevision: payload.assessmentRevision ?? null,
      schemaVersion: payload.schemaVersion ?? null,
      scoring: payload.scoring ?? null,
      sections: (payload.sections ?? []).map((section) => ({
        assembly: section.assembly ? { mode: section.assembly.mode ?? null } : null,
        durationSeconds: section.durationSeconds ?? null,
        itemCount: section.items?.length ?? 0,
        randomization: section.randomization ?? null,
        scoring: section.scoring ?? null,
        sequenceNo: section.sequenceNo ?? null,
        testType: section.scoring?.testType ?? null,
        title: section.title ?? null,
      })),
    },
    publishedAt: release.publishedAt.toISOString(),
  };
}

function buildAssessmentReleasePayload(
  tryout: ReleaseTryoutRecord,
  assemblyBySection = new Map<string, AssessmentReleaseAssemblyMetadata>(),
) {
  return buildCanonicalAssessmentReleasePayload({
    aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION,
    cbtVersion: TRYOUT_CBT_SCORING_VERSION,
    logicalRevisionVersion: LOGICAL_ASSESSMENT_REVISION_VERSION,
    schemaVersion: ASSESSMENT_RELEASE_SCHEMA_VERSION,
    sections: tryout.sections.map((section) => ({
      durationSeconds: section.durationSeconds,
      id: section.id,
      instructions: section.instructions,
      items: section.items.map((item) => ({
        difficulty: item.difficulty,
        explanation: item.explanation,
        explanationAssetId: item.explanationAssetId,
        id: item.id,
        options: item.options,
        packageCode: item.packageCode,
        points: item.points.toString(),
        prompt: item.prompt,
        promptAssetId: item.promptAssetId,
        questionType: item.questionType,
        sortOrder: item.sortOrder,
        sourceContentDigest: item.sourceContentDigest,
        sourceQuestionId: item.sourceQuestionId,
        sourceQuestionRevisionId: item.sourceQuestionRevisionId,
        sourceRevisionProvenance: item.sourceRevisionProvenance,
        subtestId: item.subtestId,
      })),
      assembly: assemblyBySection.get(section.id),
      packageVersionId: section.packageVersionId,
      scoringConfig: section.scoringConfig,
      sequenceNo: section.sequenceNo,
      shuffleItems: section.shuffleItems,
      subtestCode: section.subtest.code,
      subtestName: section.subtest.name,
      subtestId: section.subtestId,
      testType: section.testType,
      title: section.title,
    })),
    tryoutId: tryout.id,
    tryoutRevision: tryout.revision,
  }) as Prisma.InputJsonObject;
}

function resolutionBlocker(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): AssessmentReleaseResolutionBlocker {
  return { code, details, message };
}

function resolutionError(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  blockers: AssessmentReleaseResolutionBlocker[] = [],
): never {
  throw new AssessmentReleaseResolutionError(code, message, details, blockers);
}

function readyAsset(asset: { state: string } | null | undefined, assetId: string | null | undefined) {
  return !assetId || asset?.state === "ready";
}

function sourceReadinessIssues(
  source: ReleaseSourceRecord | undefined,
  expectedSubtestId: string,
  bankIds: readonly string[],
  identity?: {
    sourceContentDigest: string;
    sourceQuestionId: string;
    sourceQuestionRevisionId: string;
    sourceRevisionProvenance?: QuestionRevisionProvenance | null;
  },
  allowMultipleChoice = true,
) {
  if (!source) {
    return [resolutionBlocker("stale_candidate", "Soal kandidat tidak lagi ditemukan.", {
      sourceQuestionId: identity?.sourceQuestionId,
    })];
  }

  const blockers: AssessmentReleaseResolutionBlocker[] = [];
  const bank = source.questionBank;
  const revision = source.currentRevision;
  if (!bank || !bankIds.includes(bank.id)) {
    blockers.push(resolutionBlocker("scope", "Soal kandidat berada di luar cakupan Bank assembly.", {
      bankId: bank?.id,
      sourceQuestionId: source.id,
    }));
  }
  if (bank?.status === ContentStatus.archived) {
    blockers.push(resolutionBlocker("archived_bank", "Bank Soal kandidat sudah diarsipkan.", { bankId: bank.id }));
  } else if (bank?.status !== ContentStatus.published) {
    blockers.push(resolutionBlocker("bank_inactive", "Bank Soal kandidat belum berstatus Ready.", {
      bankId: bank?.id,
      status: bank?.status,
    }));
  }
  if (bank?.purpose !== "tryout") {
    blockers.push(resolutionBlocker("scope", "Tryout hanya dapat dirilis dari Bank Soal tujuan Tryout.", {
      bankId: bank?.id,
      purpose: bank?.purpose,
      expectedPurpose: "tryout",
    }));
  }
  if (source.status === ContentStatus.archived) {
    blockers.push(resolutionBlocker("stale_candidate", "Soal kandidat sudah diarsipkan.", { sourceQuestionId: source.id }));
  } else if (source.status !== ContentStatus.published) {
    blockers.push(resolutionBlocker("stale_candidate", "Soal kandidat belum berstatus Ready.", {
      sourceQuestionId: source.id,
      status: source.status,
    }));
  }
  if (!source.subtestId || source.subtestId !== expectedSubtestId || !source.subtest?.isActive) {
    blockers.push(resolutionBlocker("wrong_subtest", "Subtest soal kandidat tidak cocok atau sedang tidak aktif.", {
      sourceQuestionId: source.id,
      sourceSubtestId: source.subtestId,
      subtestId: expectedSubtestId,
    }));
  }
  if (!revision || revision.status !== QuestionRevisionStatus.ready) {
    blockers.push(resolutionBlocker("stale_candidate", "Revisi soal kandidat tidak lagi Ready.", {
      sourceQuestionId: source.id,
      sourceQuestionRevisionId: identity?.sourceQuestionRevisionId,
    }));
    return blockers;
  }
  if (identity && (
    revision.id !== identity.sourceQuestionRevisionId
    || revision.contentDigest !== identity.sourceContentDigest
    || revision.provenance !== identity.sourceRevisionProvenance
  )) {
    blockers.push(resolutionBlocker("stale_candidate", "Revisi atau digest soal kandidat sudah berubah.", {
      currentDigest: revision.contentDigest,
      currentRevisionId: revision.id,
      sourceQuestionId: source.id,
      suppliedDigest: identity.sourceContentDigest,
      suppliedRevisionId: identity.sourceQuestionRevisionId,
    }));
  }
  if (revision.provenance === QuestionRevisionProvenance.legacy_unknown) {
    blockers.push(resolutionBlocker("stale_candidate", "Provenance revisi soal kandidat tidak dapat dibuktikan.", {
      sourceQuestionId: source.id,
      sourceQuestionRevisionId: revision.id,
    }));
  }
  if (revision.difficulty !== "easy" && revision.difficulty !== "medium" && revision.difficulty !== "hard") {
    blockers.push(resolutionBlocker("mode_incompatible", "Soal kandidat memiliki tingkat kesulitan yang belum didukung.", {
      difficulty: revision.difficulty,
      sourceQuestionId: source.id,
    }));
  }
  if (!revision.stem.trim()) {
    blockers.push(resolutionBlocker("options", "Stem soal kandidat kosong.", { sourceQuestionId: source.id }));
  }
  const answerMode: QuestionAnswerMode | null = revision.questionType === QuestionType.multiple_choice
    ? "multiple_choice"
    : revision.questionType === QuestionType.single_choice
      ? "single_choice"
      : null;
  const answerKey = answerMode
    ? validateAnswerKey(answerMode, revision.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })))
    : null;
  if (
    revision.options.length < 2
    || revision.options.length > 5
    || !answerMode
    || !answerKey?.ok
    || revision.options.some((option) => !option.content.trim())
  ) {
    blockers.push(resolutionBlocker("options", "Soal kandidat harus memiliki 2–5 opsi berisi dengan kunci jawaban yang valid.", {
      optionCount: revision.options.length,
      sourceQuestionId: source.id,
    }));
  }
  if (!revision.explanation?.trim() && !revision.explanationAssetId) {
    blockers.push(resolutionBlocker("missing_explanation", "Soal kandidat belum memiliki penjelasan teks atau media.", {
      sourceQuestionId: source.id,
    }));
  }
  const mediaReady = readyAsset(revision.promptAsset, revision.promptAssetId)
    && readyAsset(revision.explanationAsset, revision.explanationAssetId)
    && revision.options.every((option) => readyAsset(option.asset, option.assetId));
  if (!mediaReady) {
    blockers.push(resolutionBlocker("media_not_ready", "Media prompt, penjelasan, atau opsi kandidat belum Ready.", {
      sourceQuestionId: source.id,
    }));
  }
  return blockers;
}

function sourceMatchesBlueprintScope(
  source: ReleaseSourceRecord,
  version: ReleaseAssemblyVersionRecord,
) {
  const bank = source.questionBank;
  if (!bank || !version.bankScopes.some((scope) => scope.questionBankId === bank.id)) return false;
  if (version.folderScopes.length && (!bank.folderId || !version.folderScopes.some((scope) => scope.folderId === bank.folderId))) {
    return false;
  }
  if (version.categoryScopes.length && !bank.categories.some((category) =>
    version.categoryScopes.some((scope) => scope.categoryId === category.categoryId),
  )) return false;
  return true;
}

function snapshotFromRevision(
  source: ReleaseSourceRecord,
): ReleaseSnapshot {
  const revision = source.currentRevision;
  if (!revision || !source.subtestId) {
    throw new Error("Cannot snapshot a source without a current revision and Subtest.");
  }
  return {
    difficulty: revision.difficulty,
    explanation: revision.explanation,
    explanationAssetId: revision.explanationAssetId,
    questionType: revision.questionType === QuestionType.multiple_choice ? "multiple_choice" : "single_choice",
    options: revision.options.map((option, index) => ({
      assetId: option.assetId,
      choiceKey: option.label || String.fromCharCode(65 + index),
      content: option.content,
      isCorrect: option.isCorrect,
      sortOrder: index,
      sourceQuestionOptionId: null,
      sourceQuestionRevisionOptionId: option.id,
    })),
    pointValue: 1,
    prompt: revision.stem,
    promptAssetId: revision.promptAssetId,
    sourceContentDigest: revision.contentDigest,
    sourceQuestionId: source.id,
    sourceQuestionRevisionId: revision.id,
    sourceRevisionProvenance: revision.provenance,
    subtestId: source.subtestId,
  };
}

function snapshotFromVersionItem(
  item: ReleaseAssemblyVersionRecord["items"][number],
): ReleaseSnapshot {
  if (!item.sourceQuestionRevisionId || !item.sourceContentDigest || !item.sourceRevisionProvenance) {
    throw new Error("Cannot snapshot a Pool candidate without source revision provenance.");
  }
  return {
    difficulty: item.difficulty,
    explanation: item.explanation,
    explanationAssetId: item.explanationAssetId,
    questionType: item.sourceQuestionRevision?.questionType === QuestionType.multiple_choice ? "multiple_choice" : "single_choice",
    options: item.options.map((option) => ({
      assetId: option.assetId,
      choiceKey: option.choiceKey,
      content: option.content,
      isCorrect: option.isCorrect,
      sortOrder: option.sortOrder,
      sourceQuestionOptionId: option.sourceQuestionOptionId,
      sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
    })),
    pointValue: Number(item.pointValue),
    prompt: item.prompt,
    promptAssetId: item.promptAssetId,
    sourceContentDigest: item.sourceContentDigest,
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId,
    sourceRevisionProvenance: item.sourceRevisionProvenance,
    subtestId: item.subtestId,
  };
}

type ReleaseAssemblyVersionRecord = Prisma.ReusableQuestionPackageVersionGetPayload<{
  include: {
    bankScopes: typeof releaseTryoutInclude.sections.include.packageVersion.include.bankScopes;
    categoryScopes: typeof releaseTryoutInclude.sections.include.packageVersion.include.categoryScopes;
    folderScopes: typeof releaseTryoutInclude.sections.include.packageVersion.include.folderScopes;
    items: typeof releaseTryoutInclude.sections.include.packageVersion.include.items;
    package: typeof releaseTryoutInclude.sections.include.packageVersion.include.package;
    rule: true;
    sourceBank: typeof releaseTryoutInclude.sections.include.packageVersion.include.sourceBank;
    subtest: typeof releaseTryoutInclude.sections.include.packageVersion.include.subtest;
  };
}>;

async function lockReadyAssemblyVersions(tx: Prisma.TransactionClient, versionIds: readonly string[]) {
  const ids = [...new Set(versionIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw`
    SELECT id
      FROM reusable_question_package_versions
     WHERE id IN (${Prisma.join(ids)})
     ORDER BY id
     FOR UPDATE
  `;
}

async function queryBlueprintSourceIds(
  tx: Prisma.TransactionClient,
  version: ReleaseAssemblyVersionRecord,
) {
  if (!version.subtestId || !version.bankScopes.length) return [] as string[];
  const sources = await tx.question.findMany({
    where: {
      currentRevision: { status: QuestionRevisionStatus.ready },
      questionBank: {
        is: {
          ...(version.categoryScopes.length ? { categories: { some: { categoryId: { in: version.categoryScopes.map((scope) => scope.categoryId) } } } } : {}),
          ...(version.folderScopes.length ? { folderId: { in: version.folderScopes.map((scope) => scope.folderId) } } : {}),
          purpose: "tryout",
          status: ContentStatus.published,
        },
      },
      questionBankId: { in: version.bankScopes.map((scope) => scope.questionBankId) },
      status: ContentStatus.published,
      subtestId: version.subtestId,
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return sources.map((source) => source.id);
}

async function lockAndReadReleaseSources(
  tx: Prisma.TransactionClient,
  sourceQuestionIds: readonly string[],
) {
  const ids = [...new Set(sourceQuestionIds)].sort();
  if (!ids.length) return [] as ReleaseSourceRecord[];
  await tx.$queryRaw`
    SELECT q.id
      FROM questions q
      JOIN question_banks b ON b.id = q.question_bank_id
      JOIN question_revisions r ON r.id = q.current_revision_id
     WHERE q.id IN (${Prisma.join(ids)})
     ORDER BY q.id
     FOR SHARE OF q, b, r
  `;
  // The source lock above protects the Question, Bank, and current revision.
  // Lock the referenced Subtests next so an active/inactive transition cannot
  // race the release readiness check.
  await tx.$queryRaw`
    SELECT s.id
      FROM subtests s
      JOIN questions q ON q.subtest_id = s.id
     WHERE q.id IN (${Prisma.join(ids)})
     ORDER BY s.id
     FOR SHARE OF s
  `;
  return tx.question.findMany({ where: { id: { in: ids } }, include: releaseSourceInclude });
}

function releaseSeed(tryoutId: string, publicationIntentKey?: string) {
  if (!publicationIntentKey) return randomBytes(16).toString("hex");
  return createHash("sha256")
    .update(`assessment-release-publication-intent-v1:${tryoutId}:${publicationIntentKey}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

function normalizePublicationIntentKey(publicationIntentKey?: string) {
  if (publicationIntentKey === undefined) return undefined;
  const value = publicationIntentKey.trim();
  if (!value || value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new AssessmentReleaseResolutionError("idempotency", "Kunci idempotensi publikasi tidak valid.", { publicationIntentKey });
  }
  return value;
}

function latestReleaseMatchesIntent(
  tryout: ReleaseTryoutRecord,
  publicationIntentKey?: string,
) {
  const latest = tryout.assessmentReleases[0];
  if (!latest) return false;
  const payload = latest.payload as {
    sections?: Array<{ assembly?: { mode?: unknown; publicationIntentKey?: unknown } }>;
    tryout?: { revision?: unknown };
  };
  if (payload.tryout?.revision !== tryout.revision) return false;
  const randomSections = payload.sections?.filter((section) =>
    section.assembly?.mode === ReusableQuestionPackageMode.random_pool
    || section.assembly?.mode === ReusableQuestionPackageMode.blueprint

  ) ?? [];
  if (!randomSections.length) return true;
  // Delivery/open/retake callers predate publication intents and pass no key.
  // They are read paths: on the same Tryout revision they must reuse the
  // immutable pinned release, even if the author used an explicit key when
  // publishing it. A deliberate new intent either increments the Tryout
  // revision through saveTryout or supplies a new key to this boundary.
  if (publicationIntentKey === undefined) return true;
  return randomSections.every((section) => section.assembly?.publicationIntentKey === publicationIntentKey);
}

async function resolveAndMaterializeAssemblies(
  tx: Prisma.TransactionClient,
  tryout: ReleaseTryoutRecord,
  publicationIntentKey?: string,
) {
  const assemblySections = tryout.sections.filter((section) =>
    section.packageVersion?.mode === ReusableQuestionPackageMode.random_pool
    || section.packageVersion?.mode === ReusableQuestionPackageMode.blueprint

  );
  if (!assemblySections.length) {
    return {
      assemblyBySection: new Map<string, AssessmentReleaseAssemblyMetadata>(),
      tryout,
    };
  }

  const versionIds = assemblySections
    .map((section) => section.packageVersionId)
    .filter((id): id is string => Boolean(id));
  // The aggregate lock is held by the caller.  Ready revisions are locked as
  // one sorted set before any source row is inspected, preserving the
  // aggregate -> assembly revision -> deterministic source lock order.
  await lockReadyAssemblyVersions(tx, versionIds);
  const versions = await tx.reusableQuestionPackageVersion.findMany({
    where: { id: { in: [...new Set(versionIds)] } },
    include: {
      bankScopes: {
        include: { questionBank: { select: { id: true, name: true, purpose: true, status: true } } },
        orderBy: { questionBankId: "asc" },
      },
      categoryScopes: {
        include: { category: { select: { id: true, name: true } } },
        orderBy: { categoryId: "asc" },
      },
      folderScopes: {
        include: { folder: { select: { id: true, name: true, purpose: true } } },
        orderBy: { folderId: "asc" },
      },
      items: {
        include: {
          explanationAsset: true,
          options: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
          promptAsset: true,
          sourceQuestionRevision: { select: { questionType: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
      package: { select: { code: true, id: true, mode: true, status: true, title: true } },
      rule: true,
      sourceBank: { select: { id: true, name: true, purpose: true, status: true } },
      subtest: { select: { code: true, id: true, isActive: true, name: true } },
    },
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));
  if (versions.length !== new Set(versionIds).size) {
    resolutionError("stale_candidate", "Versi Ready assembly tidak lagi ditemukan.", {
      requestedVersionIds: [...new Set(versionIds)].sort(),
      foundVersionIds: versions.map((version) => version.id).sort(),
    });
  }
  const wrongPurposeBanks: Array<{ bankId: string; purpose: string; versionId: string }> = [];
  const wrongPurposeSourceBanks: Array<{ bankId: string; purpose: string; versionId: string }> = [];
  const wrongPurposeFolders: Array<{ folderId: string; purpose: string; versionId: string }> = [];
  for (const version of versions) {
    for (const scope of version.bankScopes) {
      if (scope.questionBank.purpose !== "tryout") {
        wrongPurposeBanks.push({ bankId: scope.questionBankId, purpose: scope.questionBank.purpose, versionId: version.id });
      }
    }
    if (version.sourceBank.purpose !== "tryout") {
      wrongPurposeSourceBanks.push({ bankId: version.sourceBank.id, purpose: version.sourceBank.purpose, versionId: version.id });
    }
    for (const scope of version.folderScopes) {
      if (scope.folder.purpose !== "tryout") {
        wrongPurposeFolders.push({ folderId: scope.folderId, purpose: scope.folder.purpose, versionId: version.id });
      }
    }
  }
  wrongPurposeBanks.push(...wrongPurposeSourceBanks);
  if (wrongPurposeBanks.length || wrongPurposeFolders.length) {
    resolutionError("scope", "Tryout hanya dapat mematerialisasi assembly dari Bank Soal tujuan Tryout.", {
      expectedPurpose: "tryout",
      wrongPurposeBanks,
      wrongPurposeFolders,
    });
  }

  const blueprintSourceIdsByVersion = new Map<string, string[]>();
  const sourceIds: string[] = [];
  for (const section of assemblySections) {
    const version = section.packageVersionId ? versionById.get(section.packageVersionId) : undefined;
    if (!version) resolutionError("stale_candidate", "Versi Ready assembly tidak lagi tersedia untuk Section.", { sectionId: section.id });
    if (version.status !== ContentStatus.published
      || version.package.status === ContentStatus.archived
      || version.package.mode !== version.mode
      || version.mode !== section.packageVersion?.mode
      || version.subtestId !== section.subtestId
      || !version.subtest?.isActive
      || section.testType !== "cbt") {
      resolutionError("mode_incompatible", "Versi Ready assembly tidak kompatibel dengan tipe Test ini.", {
        mode: version.mode,
        packageStatus: version.package.status,
        sectionId: section.id,
        sectionSubtestId: section.subtestId,
        sectionTestType: section.testType,
        versionSubtestId: version.subtestId,
      });
    }
    const requestedCount = version.rule?.requestedCount ?? 0;
    if (!version.rule || requestedCount < 1) {
      resolutionError("quota", "Assembly tidak memiliki jumlah soal rilis yang valid.", { sectionId: section.id, versionId: version.id });
    }
    if (version.mode === ReusableQuestionPackageMode.random_pool) {
      sourceIds.push(...version.items.map((item) => item.sourceQuestionId));
    } else {
      if (version.items.length) {
        resolutionError("mode_incompatible", "Blueprint Ready tidak boleh membawa snapshot kandidat fisik.", {
          itemCount: version.items.length,
          versionId: version.id,
        });
      }
    }
  }

  const blueprintVersions = versions.filter((v) => v.mode === ReusableQuestionPackageMode.blueprint);
  const blueprintResults = await Promise.all(
    blueprintVersions.map(async (version) => {
      const ids = await queryBlueprintSourceIds(tx, version);
      return { id: version.id, ids };
    }),
  );
  for (const { id, ids } of blueprintResults) {
    blueprintSourceIdsByVersion.set(id, ids);
    sourceIds.push(...ids);
  }

  // Every source row is locked once, in UUID order, after all Ready revisions
  // have been locked. Missing explicit Pool IDs remain visible to the stale
  // candidate report because they are compared against this reread map.
  const sources = await lockAndReadReleaseSources(tx, sourceIds);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const seed = releaseSeed(tryout.id, publicationIntentKey);
  const resolutions: AssemblySectionResolution[] = [];

  for (const section of assemblySections) {
    const version = versionById.get(section.packageVersionId!);
    if (!version) resolutionError("stale_candidate", "Versi Ready assembly tidak tersedia setelah penguncian.", { sectionId: section.id });
    const rule = version.rule!;
    const bankIds = version.bankScopes.map((scope) => scope.questionBankId).sort();
    if (version.mode === ReusableQuestionPackageMode.random_pool) {
      const blockers: AssessmentReleaseResolutionBlocker[] = [];
      const validItems: typeof version.items = [];
      const invalidSourceIds: string[] = [];
      for (const item of version.items) {
        const itemBlockers = sourceReadinessIssues(sourceById.get(item.sourceQuestionId), version.subtestId!, bankIds, {
          sourceContentDigest: item.sourceContentDigest ?? "",
          sourceQuestionId: item.sourceQuestionId,
          sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? "",
          sourceRevisionProvenance: item.sourceRevisionProvenance,
        }, true);
        if (itemBlockers.length) {
          invalidSourceIds.push(item.sourceQuestionId);
          blockers.push(...itemBlockers.map((blocker) => ({
            ...blocker,
            details: { ...blocker.details, sourceQuestionId: item.sourceQuestionId },
          })));
        } else {
          validItems.push(item);
        }
      }
      const availableByDifficulty = { easy: 0, hard: 0, medium: 0 };
      for (const item of validItems) {
        if (item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard") {
          availableByDifficulty[item.difficulty] += 1;
        }
      }
      if (validItems.length < rule.requestedCount) {
        blockers.push(resolutionBlocker("shortage", "Kandidat Pool yang tetap Ready tidak mencukupi jumlah undian.", {
          availableCount: validItems.length,
          requestedCount: rule.requestedCount,
        }));
      }
      if (blockers.length) {
        resolutionError(blockers[0].code, "Publish diblokir karena kandidat Pool tidak lagi siap.", {
          availableByDifficulty,
          candidateCount: version.items.length,
          invalidSourceIds: [...new Set(invalidSourceIds)].sort(),
          requestedCount: rule.requestedCount,
        }, blockers);
      }
      let selected: typeof validItems;
      try {
        selected = resolvePoolCandidates(validItems.map((item) => ({
          difficulty: item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard" ? item.difficulty : undefined,
          sortOrder: item.sortOrder,
          sourceContentDigest: item.sourceContentDigest!,
          sourceQuestionId: item.sourceQuestionId,
          sourceQuestionRevisionId: item.sourceQuestionRevisionId!,
        })), rule.requestedCount, seed).map((candidate) => validItems.find((item) => item.sourceQuestionId === candidate.sourceQuestionId)!);
      } catch (error) {
        if (error instanceof AssemblyResolutionError) {
          resolutionError(error.code, error.message, error.details);
        }
        throw error;
      }
      const snapshots = selected.map(snapshotFromVersionItem);
      const metadata: AssessmentReleaseAssemblyMetadata = {
        availability: {
          availableByDifficulty,
          candidateCount: version.items.length,
          eligibleCandidateCount: validItems.length,
          invalidSourceIds: [...new Set(invalidSourceIds)].sort(),
        },
        candidateCount: version.items.length,
        mode: "random_pool",
        packageId: version.packageId,
        packageVersionId: version.id,
        ...(publicationIntentKey ? { publicationIntentKey } : {}),
        requestedCount: rule.requestedCount,
        resolvedRevisionDigests: snapshots.map((snapshot) => snapshot.sourceContentDigest),
        resolvedSourceIds: snapshots.map((snapshot) => snapshot.sourceQuestionId),
        resolverVersion: ASSEMBLY_RESOLVER_VERSION,
        seed,
      };
      resolutions.push({ metadata, sectionId: section.id, snapshots });
      continue;
    }

    const scopedSourceIds = blueprintSourceIdsByVersion.get(version.id) ?? [];
    const scopedSources = scopedSourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source && sourceMatchesBlueprintScope(source, version) ? [source] : [];
    });
    const invalidSourceIds: string[] = [];
    const invalidBlockers: AssessmentReleaseResolutionBlocker[] = [];
    const validSources: ReleaseSourceRecord[] = [];
    for (const source of scopedSources) {
      const blockers = sourceReadinessIssues(source, version.subtestId!, bankIds, undefined, true);
      if (blockers.length) {
        invalidSourceIds.push(source.id);
        invalidBlockers.push(...blockers.map((blocker) => ({
          ...blocker,
          details: { ...blocker.details, sourceQuestionId: source.id },
        })));
      } else {
        validSources.push(source);
      }
    }
    const availableByDifficulty = { easy: 0, hard: 0, medium: 0 };
    for (const source of validSources) {
      const difficulty = source.currentRevision?.difficulty;
      if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") availableByDifficulty[difficulty] += 1;
    }
    const quotas = {
      easyCount: rule.easyCount,
      hardCount: rule.hardCount,
      mediumCount: rule.mediumCount,
      requestedCount: rule.requestedCount,
    };
    let selectedSources: ReleaseSourceRecord[];
    try {
      const validSourceById = new Map(validSources.map((source) => [source.id, source]));
      selectedSources = resolveBlueprintCandidates(validSources.map((source) => ({
        difficulty: source.currentRevision?.difficulty === "easy" || source.currentRevision?.difficulty === "medium" || source.currentRevision?.difficulty === "hard"
          ? source.currentRevision.difficulty
          : undefined,
        sourceContentDigest: source.currentRevision?.contentDigest ?? "",
        sourceQuestionId: source.id,
        sourceQuestionRevisionId: source.currentRevision?.id ?? "",
      })), quotas, seed).map((candidate) => validSourceById.get(candidate.sourceQuestionId)!);
    } catch (error) {
      if (error instanceof AssemblyResolutionError) {
        resolutionError(error.code, error.message, {
          availableByDifficulty,
          candidateCount: scopedSources.length,
          invalidSourceIds: [...new Set(invalidSourceIds)].sort(),
          requestedByDifficulty: {
            easy: quotas.easyCount,
            hard: quotas.hardCount,
            medium: quotas.mediumCount,
          },
          scopeSourceIds: scopedSourceIds,
        }, invalidBlockers);
      }
      throw error;
    }
    const snapshots = selectedSources.map(snapshotFromRevision);
    const scopeSummary = {
      availableByDifficulty,
      bankIds,
      candidateCount: scopedSources.length,
      categoryIds: version.categoryScopes.map((scope) => scope.categoryId).sort(),
      eligibleCount: validSources.length,
      folderIds: version.folderScopes.map((scope) => scope.folderId).sort(),
      invalidSourceIds: [...new Set(invalidSourceIds)].sort(),
      subtestId: version.subtestId,
    };
    const metadata: AssessmentReleaseAssemblyMetadata = {
      availability: {
        ...scopeSummary,
        requestedByDifficulty: {
          easy: quotas.easyCount,
          hard: quotas.hardCount,
          medium: quotas.mediumCount,
        },
      },
      candidateCount: scopedSources.length,
      mode: "blueprint",
      packageId: version.packageId,
      packageVersionId: version.id,
      ...(publicationIntentKey ? { publicationIntentKey } : {}),
      quotas,
      requestedCount: rule.requestedCount,
      resolvedRevisionDigests: snapshots.map((snapshot) => snapshot.sourceContentDigest),
      resolvedSourceIds: snapshots.map((snapshot) => snapshot.sourceQuestionId),
      resolverVersion: ASSEMBLY_RESOLVER_VERSION,
      scopeSummary,
      seed,
    };
    resolutions.push({ metadata, sectionId: section.id, snapshots });
  }

  const resolutionBySectionId = new Map(resolutions.map((candidate) => [candidate.sectionId, candidate]));
  const sourceOwners = new Map<string, string>();
  for (const section of tryout.sections) {
    const resolution = resolutionBySectionId.get(section.id);
    const sourceIdsForSection = resolution
      ? resolution.snapshots.map((snapshot) => snapshot.sourceQuestionId)
      : section.items.map((item) => item.sourceQuestionId).filter((id): id is string => Boolean(id));
    for (const sourceQuestionId of sourceIdsForSection) {
      const previousSectionId = sourceOwners.get(sourceQuestionId);
      if (previousSectionId) {
        resolutionError("duplicate_source", "Satu soal sumber tidak boleh muncul dua kali dalam satu Tryout release.", {
          previousSectionId,
          sourceQuestionId,
          sectionId: section.id,
        });
      }
      sourceOwners.set(sourceQuestionId, section.id);
    }
  }

  const tryoutSectionById = new Map(tryout.sections.map((section) => [section.id, section]));
  for (const resolution of resolutions) {
    await tx.tryoutItem.deleteMany({ where: { tryoutSectionId: resolution.sectionId } });
    await tx.tryoutSection.update({ where: { id: resolution.sectionId }, data: { questionCount: resolution.snapshots.length } });
    const version = versionById.get(tryoutSectionById.get(resolution.sectionId)?.packageVersionId ?? "");
    if (!version) resolutionError("stale_candidate", "Versi Ready assembly tidak tersedia saat membuat bridge fisik.", { sectionId: resolution.sectionId });
    await Promise.all(resolution.snapshots.map(async (snapshot, index) => {
      const item = await tx.tryoutItem.create({
        data: {
          difficulty: snapshot.difficulty,
          explanation: snapshot.explanation,
          explanationAssetId: snapshot.explanationAssetId,
          questionType: snapshot.questionType,
          packageCode: version.package.code,
          packageVersionId: version.id,
          points: snapshot.pointValue,
          prompt: snapshot.prompt,
          promptAssetId: snapshot.promptAssetId,
          sortOrder: index + 1,
          sourceContentDigest: snapshot.sourceContentDigest,
          sourceQuestionId: snapshot.sourceQuestionId,
          sourceQuestionRevisionId: snapshot.sourceQuestionRevisionId,
          sourceRevisionProvenance: snapshot.sourceRevisionProvenance,
          subtestId: snapshot.subtestId,
          tryoutId: tryout.id,
          tryoutSectionId: resolution.sectionId,
        },
      });
      await tx.tryoutItemOption.createMany({
        data: snapshot.options.map((option) => ({
          assetId: option.assetId,
          choiceKey: option.choiceKey,
          content: option.content,
          isCorrect: option.isCorrect,
          sortOrder: option.sortOrder,
          sourceQuestionOptionId: option.sourceQuestionOptionId,
          sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
          tryoutItemId: item.id,
        })),
      });
    }));
  }

  const reread = await tx.tryoutPackage.findUnique({ where: { id: tryout.id }, include: releaseTryoutInclude });
  if (!reread) resolutionError("stale_candidate", "Tryout tidak dapat dibaca setelah materialisasi release.", { tryoutId: tryout.id });
  return {
    assemblyBySection: new Map(resolutions.map((resolution) => [resolution.sectionId, resolution.metadata])),
    tryout: reread,
  };
}

/**
 * One release-eligibility gate is shared by ordinary session open, retakes,
 * and admin preview restarts.  It deliberately checks mutable source
 * readiness only while creating/pinning a new release; attempt start later
 * consumes the release-owned CBT snapshot and does not re-query live rows.
 */
async function assertTryoutReleaseEligibility(
  tx: Prisma.TransactionClient,
  tryoutId: string,
) {
  const tryout = await tx.tryoutPackage.findUnique({
    where: { id: tryoutId },
    include: {
      assessmentReleases: {
        orderBy: { releaseNumber: "desc" },
        select: { payload: true },
        take: 1,
      },
      sections: {
        include: {
          items: {
            select: {
              packageVersionId: true,
              questionType: true,
              sourceContentDigest: true,
              sourceQuestionId: true,
              sourceQuestionRevisionId: true,
              sourceRevisionProvenance: true,
              subtestId: true,
            },
          },
          packageVersion: {
            select: {
              bankScopes: {
                select: {
                  questionBank: { select: { id: true, purpose: true } },
                  questionBankId: true,
                },
              },
              mode: true,
              subtestId: true,
              items: {
                select: {
                  packageVersionId: true,
                  sourceContentDigest: true,
                  sourceQuestionId: true,
                  sourceQuestionRevisionId: true,
                  sourceRevisionProvenance: true,
                  subtestId: true,
                },
              },
              sourceBank: { select: { id: true, purpose: true } },
              status: true,
            },
          },
        },
        orderBy: { sequenceNo: "asc" },
      },
    },
  });
  if (!tryout || tryout.status !== ContentStatus.published) {
    throw new Error("Tryout belum siap dibuka: tujuh Test harus diterbitkan dan memiliki Paket Soal siap atau pilihan soal langsung yang valid.");
  }
  for (const section of tryout.sections) {
    try {
      canonicalizeCbtScoringConfig(section.scoringConfig);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Metode penilaian CBT tidak valid.");
    }
  }
  const scopedBanks = tryout.sections.flatMap((section) => section.packageVersion?.bankScopes ?? []);
  const selectedQuestionIdSet = new Set<string>();
  for (const section of tryout.sections) {
    for (const item of section.items) {
      if (item.sourceQuestionId) selectedQuestionIdSet.add(item.sourceQuestionId);
    }
    for (const item of section.packageVersion?.items ?? []) {
      if (item.sourceQuestionId) selectedQuestionIdSet.add(item.sourceQuestionId);
    }
  }
  const selectedQuestionIds = [...selectedQuestionIdSet];
  const selectedSources = selectedQuestionIds.length
    ? await tx.question.findMany({
      where: { id: { in: selectedQuestionIds } },
      select: { id: true, questionBank: { select: { id: true, purpose: true } } },
    })
    : [];
  const wrongPurposeSources: Array<{ bankId: string | null; purpose: string | null; sourceQuestionId?: string }> = [];
  for (const scope of scopedBanks) {
    if (scope.questionBank.purpose !== "tryout") {
      wrongPurposeSources.push({ bankId: scope.questionBankId, purpose: scope.questionBank.purpose });
    }
  }
  for (const section of tryout.sections) {
    const sourceBank = section.packageVersion?.sourceBank;
    if (sourceBank && sourceBank.purpose !== "tryout") {
      wrongPurposeSources.push({ bankId: sourceBank.id, purpose: sourceBank.purpose });
    }
  }
  for (const source of selectedSources) {
    if (source.questionBank?.purpose !== "tryout") {
      wrongPurposeSources.push({ bankId: source.questionBank?.id ?? null, purpose: source.questionBank?.purpose ?? null, sourceQuestionId: source.id });
    }
  }
  if (wrongPurposeSources.length) {
    throw new Error("Tryout hanya dapat memakai soal dari Bank Soal tujuan Tryout.");
  }
  const latestArchivedReleasePayload = tryout.assessmentReleases[0]?.payload as {
    tryout?: { revision?: unknown };
  } | undefined;
  const hasArchivedPackageBinding = tryout.sections.some((section) => Boolean(section.packageVersionId) || section.items.some((item) => Boolean(item.packageVersionId)));
  if (hasArchivedPackageBinding) {
    if (latestArchivedReleasePayload?.tryout?.revision === tryout.revision) return tryout;
    throw new Error("Tryout berbasis Paket Soal sudah diarsipkan dan tidak dapat membuka rilis baru.");
  }
  if (tryout.sections.length !== 7 || tryout.sections.some((section) => {
    if (section.packageVersionId) {
      const seededAssembly = section.packageVersion?.mode === ReusableQuestionPackageMode.random_pool
        || section.packageVersion?.mode === ReusableQuestionPackageMode.blueprint;
      const modeMatchesTestType = section.testType === "cbt";
      return section.packageVersion?.status !== ContentStatus.published
        || section.packageVersion.subtestId !== section.subtestId
        || (section.packageVersion.mode !== ReusableQuestionPackageMode.blueprint && !section.packageVersion.items.length)
        || (section.packageVersion.mode === ReusableQuestionPackageMode.blueprint && !section.items.length)
        || !modeMatchesTestType
        || (seededAssembly && (section.items.length === 0 || section.items.some((item) =>
          item.packageVersionId !== section.packageVersionId
          || item.subtestId !== section.subtestId
          || !item.sourceQuestionId
          || !item.sourceQuestionRevisionId
          || !item.sourceContentDigest
          || item.sourceRevisionProvenance === null
          || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown,
        )));
    }
    return section.items.length === 0 || section.items.some((item) =>
      item.packageVersionId !== null
      || item.subtestId !== section.subtestId
      || !item.sourceQuestionId
      || !item.sourceQuestionRevisionId
      || !item.sourceContentDigest
      || item.sourceRevisionProvenance === null
      || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown,
    );
  })) {
    throw new Error("Tryout belum siap dibuka: tujuh Test harus diterbitkan dan memiliki Paket Soal siap atau pilihan soal langsung yang valid.");
  }
  return tryout;
}

async function createOrReuseAssessmentRelease(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  actorId: string,
  publishedAt = new Date(),
  options: CreateAssessmentReleaseOptions = {},
) {
  // Publishing, opening, and retake creation all share this aggregate lock.
  // Callers may already hold it; PostgreSQL row locks are re-entrant inside
  // the same transaction, so keeping the guard here prevents a future caller
  // from racing release-number allocation accidentally.
  await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${tryoutId}::uuid FOR UPDATE`;
  const tryout = await tx.tryoutPackage.findUnique({
    where: { id: tryoutId },
    include: releaseTryoutInclude,
  });
  if (!tryout || tryout.status !== "published") {
    throw new Error("Tryout harus diterbitkan sebelum AssessmentRelease dibuat.");
  }
  const publicationIntentKey = normalizePublicationIntentKey(options.publicationIntentKey);
  const hasArchivedPackageBinding = tryout.sections.some((section) => Boolean(section.packageVersionId) || section.items.some((item) => Boolean(item.packageVersionId)));
  if (hasArchivedPackageBinding) {
    if (latestReleaseMatchesIntent(tryout, publicationIntentKey)) {
      const latest = tryout.assessmentReleases[0];
      if (latest) return latest;
    }
    throw new Error("Tryout berbasis Paket Soal sudah diarsipkan dan tidak dapat membuat rilis baru.");
  }
  const hasSeededAssembly = tryout.sections.some((section) =>
    section.packageVersion?.mode === ReusableQuestionPackageMode.random_pool
    || section.packageVersion?.mode === ReusableQuestionPackageMode.blueprint

  );
  if (hasSeededAssembly && latestReleaseMatchesIntent(tryout, publicationIntentKey)) {
    const latest = tryout.assessmentReleases[0];
    if (latest) return latest;
  }
  if (hasSeededAssembly) {
    const participantAccessibleRelease = await tx.tryoutDeliverySession.findFirst({
      where: {
        assessmentReleaseId: { not: null },
        status: TryoutDeliverySessionStatus.active,
        tryoutId,
      },
      select: { id: true },
    });
    if (participantAccessibleRelease) {
      throw new Error("Tryout memiliki sesi aktif yang telah mengikat AssessmentRelease. Tutup atau arsipkan sesi sebelum membuat ulang assembly.");
    }
  }

  const resolved = await resolveAndMaterializeAssemblies(tx, tryout, publicationIntentKey);
  const resolvedTryout = resolved.tryout;
  if (
    resolvedTryout.sections.length !== 7 ||
    resolvedTryout.sections.some((section) => {
      const mode = section.packageVersion?.mode;
      return section.items.length === 0
        && mode !== ReusableQuestionPackageMode.random_pool
        && mode !== ReusableQuestionPackageMode.blueprint;
    })
  ) {
    throw new Error("AssessmentRelease memerlukan tepat tujuh Test dengan item yang siap.");
  }
  for (const section of resolvedTryout.sections) {
    try {
      canonicalizeCbtScoringConfig(section.scoringConfig, section.items.map((item) => item.sourceQuestionId ?? item.id));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Metode penilaian CBT belum siap untuk dirilis.");
    }
  }

  const payload = buildAssessmentReleasePayload(resolvedTryout, resolved.assemblyBySection);
  // Compute the canonical bytes here as an explicit invariant. The digest
  // helper calls the same canonicalizer, while this value is useful in tests
  // and makes the runtime/seed contract visible at the call site.
  void canonicalAssessmentReleaseJson(payload);
  const contentDigest = digestAssessmentReleasePayload(payload);
  const existing = await tx.assessmentRelease.findUnique({
    where: {
      tryoutId_contentDigest: { contentDigest, tryoutId },
    },
  });
  if (existing) return existing;

  const latest = await tx.assessmentRelease.aggregate({
    _max: { releaseNumber: true },
    where: { tryoutId },
  });
  const releaseAssemblies = [...resolved.assemblyBySection.values()];
  // The Ticket 2 migration keeps nullable release columns as a compatibility
  // projection for a single assembly.  A Tryout may carry multiple random
  // sections; their complete per-section metadata remains in payload while
  // the projection is populated only when it is unambiguous.
  const assembly = releaseAssemblies.length === 1 ? releaseAssemblies[0] : null;
  return tx.assessmentRelease.create({
    data: {
      ...(assembly ? {
        assemblyCandidateCount: assembly.candidateCount,
        assemblyMode: assembly.mode as ReusableQuestionPackageMode,
        assemblyPackageId: assembly.packageId,
        assemblyPackageVersionId: assembly.packageVersionId,
        assemblyQuotas: assembly.quotas,
        assemblyRequestedCount: assembly.requestedCount,
        assemblyResolvedRevisionDigests: assembly.resolvedRevisionDigests,
        assemblyResolvedSourceIds: assembly.resolvedSourceIds,
        assemblyScopeSummary: assembly.scopeSummary ?? assembly.availability,
        assemblySeed: assembly.seed,
        resolverVersion: assembly.resolverVersion,
      } : {}),
      contentDigest,
      createdByUserId: actorId,
      payload,
      publishedAt,
      releaseNumber: (latest._max.releaseNumber ?? 0) + 1,
      tryoutId,
    },
  });
}

function releaseMetadataFields(
  release: Pick<AssessmentReleaseRecord, "contentDigest" | "id" | "releaseNumber">,
) {
  return {
    assessmentReleaseDigest: release.contentDigest,
    assessmentReleaseId: release.id,
    assessmentReleaseNumber: release.releaseNumber,
  };
}

function assertMatchingAssessmentRelease(
  expected: {
    assessmentReleaseDigest: string | null;
    assessmentReleaseId: string | null;
    assessmentReleaseNumber: number | null;
  },
  actual: {
    assessmentReleaseDigest: string | null;
    assessmentReleaseId: string | null;
    assessmentReleaseNumber: number | null;
  },
  message = "Identitas AssessmentRelease tidak cocok dengan sesi participant.",
) {
  if (
    !expected.assessmentReleaseId ||
    !expected.assessmentReleaseDigest ||
    expected.assessmentReleaseNumber === null ||
    expected.assessmentReleaseId !== actual.assessmentReleaseId ||
    expected.assessmentReleaseDigest !== actual.assessmentReleaseDigest ||
    expected.assessmentReleaseNumber !== actual.assessmentReleaseNumber
  ) {
    throw new Error(message);
  }
}

export {
  ASSESSMENT_RELEASE_SCHEMA_VERSION,
  AssessmentReleaseResolutionError,
  assertMatchingAssessmentRelease,
  buildAssessmentReleasePayload,
  createOrReuseAssessmentRelease,
  assertTryoutReleaseEligibility,
  findAssessmentReleaseSectionForRun,
  releaseMetadataFields,
  toParticipantAssessmentReleaseMetadata,
  toAssessmentReleaseMetadata,
};
export type {
  AssessmentReleaseAssemblyMetadata,
  AssessmentReleaseMetadata,
  AssessmentReleaseSectionLabel,
  AssessmentReleaseResolutionBlocker,
  CreateAssessmentReleaseOptions,
  ParticipantAssessmentReleaseMetadata,
  ReleaseTryoutRecord,
};
