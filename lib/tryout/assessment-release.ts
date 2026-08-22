import "server-only";

import { ContentStatus, Prisma, QuestionRevisionProvenance, QuestionRevisionStatus } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import {
  buildAssessmentReleasePayload as buildCanonicalAssessmentReleasePayload,
  canonicalAssessmentReleaseJson,
  digestAssessmentReleasePayload,
} from "@/lib/tryout/assessment-release-canonical.mjs";
import {
  TRYOUT_CAT_SCORING_VERSION,
  TRYOUT_CBT_SCORING_VERSION,
  TRYOUT_SCORE_AGGREGATION_VERSION,
} from "@/lib/tryout/scoring";

const ASSESSMENT_RELEASE_SCHEMA_VERSION = "assessment-release-v1";
const LOGICAL_ASSESSMENT_REVISION_VERSION = 1;

type CatCalibrationSnapshot = {
  calibrationDigest: string;
  calibrationId: string;
  difficulty: number;
  discrimination: number;
  sourceRevisionProvenance: string;
};

const releaseTryoutInclude = {
  sections: {
    include: {
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

function buildAssessmentReleasePayload(tryout: ReleaseTryoutRecord) {
  return buildCanonicalAssessmentReleasePayload({
    aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION,
    catVersion: TRYOUT_CAT_SCORING_VERSION,
    cbtVersion: TRYOUT_CBT_SCORING_VERSION,
    logicalRevisionVersion: LOGICAL_ASSESSMENT_REVISION_VERSION,
    schemaVersion: ASSESSMENT_RELEASE_SCHEMA_VERSION,
    sections: tryout.sections.map((section) => ({
      catItemCount: section.catItemCount,
      catModelVersion: section.catModelVersion,
      durationSeconds: section.durationSeconds,
      id: section.id,
      instructions: section.instructions,
      items: section.items.map((item) => ({
        ...(item as typeof item & { catCalibration?: CatCalibrationSnapshot }).catCalibration
          ? { catCalibration: (item as typeof item & { catCalibration?: CatCalibrationSnapshot }).catCalibration }
          : {},
        difficulty: item.difficulty,
        explanation: item.explanation,
        explanationAssetId: item.explanationAssetId,
        id: item.id,
        options: item.options,
        packageCode: item.packageCode,
        points: item.points.toString(),
        prompt: item.prompt,
        promptAssetId: item.promptAssetId,
        sortOrder: item.sortOrder,
        sourceContentDigest: item.sourceContentDigest,
        sourceQuestionId: item.sourceQuestionId,
        sourceQuestionRevisionId: item.sourceQuestionRevisionId,
        sourceRevisionProvenance: item.sourceRevisionProvenance,
        subtestId: item.subtestId,
      })),
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

async function attachCatCalibrationSnapshots(
  tx: Prisma.TransactionClient,
  tryout: ReleaseTryoutRecord,
) {
  const catItems = tryout.sections
    .filter((section) => section.testType === "cat")
    .flatMap((section) => section.items);
  if (catItems.some((item) => !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown)) {
    throw new Error("AssessmentRelease CAT memerlukan provenance QuestionRevision dan digest sumber yang lengkap.");
  }
  const revisionIds = [...new Set(
    catItems.map((item) => item.sourceQuestionRevisionId).filter((id): id is string => Boolean(id)),
  )];
  if (!revisionIds.length) return tryout;
  const calibrations = await tx.twoPlQuestionCalibration.findMany({
    where: {
      approvalState: "approved",
      modelVersion: CANONICAL_2PL_MODEL_VERSION,
      questionRevisionId: { in: revisionIds },
    },
    select: {
      contentDigest: true,
      difficulty: true,
      discrimination: true,
      id: true,
      questionId: true,
      questionRevisionId: true,
      sourceRevisionProvenance: true,
    },
  });
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  return {
    ...tryout,
    sections: tryout.sections.map((section) => {
      if (section.testType !== "cat") return section;
      return {
        ...section,
        items: section.items.map((item) => {
          const calibration = item.sourceQuestionRevisionId
            ? calibrationByRevision.get(item.sourceQuestionRevisionId)
            : undefined;
          const discrimination = calibration ? Number(calibration.discrimination) : Number.NaN;
          const difficulty = calibration ? Number(calibration.difficulty) : Number.NaN;
          if (!calibration
            || calibration.questionId !== item.sourceQuestionId
            || calibration.contentDigest !== item.sourceContentDigest
            || calibration.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown
            || !Number.isFinite(discrimination)
            || discrimination <= 0
            || !Number.isFinite(difficulty)) {
            throw new Error("AssessmentRelease CAT memerlukan kalibrasi 2PL kanonis yang disetujui dan cocok dengan digest sumber.");
          }
          return {
            ...item,
            catCalibration: {
              calibrationDigest: calibration.contentDigest,
              calibrationId: calibration.id,
              difficulty,
              discrimination,
              sourceRevisionProvenance: calibration.sourceRevisionProvenance,
            } satisfies CatCalibrationSnapshot,
          };
        }),
      };
    }),
  } as ReleaseTryoutRecord;
}

/**
 * One release-eligibility gate is shared by ordinary session open, retakes,
 * and admin preview restarts.  It deliberately checks mutable source
 * readiness only while creating/pinning a new release; attempt start later
 * consumes the release-owned CAT parameters and does not re-query live rows.
 */
async function assertTryoutReleaseEligibility(
  tx: Prisma.TransactionClient,
  tryoutId: string,
) {
  const tryout = await tx.tryoutPackage.findUnique({
    where: { id: tryoutId },
    include: {
      sections: {
        include: {
          packageVersion: {
            select: {
              items: {
                select: {
                  sourceContentDigest: true,
                  sourceQuestionId: true,
                  sourceQuestionRevisionId: true,
                  sourceRevisionProvenance: true,
                  subtestId: true,
                },
              },
              status: true,
            },
          },
        },
        orderBy: { sequenceNo: "asc" },
      },
    },
  });
  if (!tryout || tryout.status !== ContentStatus.published || tryout.sections.length !== 7 || tryout.sections.some((section) => section.packageVersion?.status !== ContentStatus.published || !section.packageVersion.items.length)) {
    throw new Error("Tryout belum siap dibuka: tujuh Test harus diterbitkan dan memiliki Paket Soal siap.");
  }
  const catItems = tryout.sections
    .filter((section) => section.testType === "cat")
    .flatMap((section) => {
      const items = section.packageVersion?.items ?? [];
      if (!section.catItemCount || section.catModelVersion !== CANONICAL_2PL_MODEL_VERSION || items.length < section.catItemCount || items.some((item) => item.subtestId !== section.subtestId || !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown)) {
        throw new Error("Pool CAT immutable harus memakai profil 2PL kanonis dan mencukupi jumlah soal.");
      }
      return items;
    });
  const revisionIds = [...new Set(catItems.map((item) => item.sourceQuestionRevisionId).filter((id): id is string => Boolean(id)))];
  if (!revisionIds.length) return tryout;
  const [revisions, calibrations] = await Promise.all([
    tx.questionRevision.findMany({ where: { id: { in: revisionIds }, status: QuestionRevisionStatus.ready }, select: { contentDigest: true, id: true, questionId: true } }),
    tx.twoPlQuestionCalibration.findMany({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } }, select: { contentDigest: true, difficulty: true, discrimination: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true } }),
  ]);
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  if (revisions.length !== revisionIds.length || calibrations.length !== revisionIds.length || catItems.some((item) => {
    const revision = revisionById.get(item.sourceQuestionRevisionId!);
    const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId!);
    return !revision || !calibration
      || revision.questionId !== item.sourceQuestionId
      || revision.contentDigest !== item.sourceContentDigest
      || calibration.questionId !== item.sourceQuestionId
      || calibration.contentDigest !== item.sourceContentDigest
      || calibration.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown
      || !Number.isFinite(Number(calibration.difficulty))
      || !Number.isFinite(Number(calibration.discrimination))
      || Number(calibration.discrimination) <= 0;
  })) {
    throw new Error("Setiap kandidat pool CAT harus memiliki kalibrasi 2PL kanonis yang disetujui untuk QuestionRevision dan digest yang tepat.");
  }
  return tryout;
}

async function createOrReuseAssessmentRelease(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  actorId: string,
  publishedAt = new Date(),
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
  if (
    tryout.sections.length !== 7 ||
    tryout.sections.some((section) => section.items.length === 0)
  ) {
    throw new Error("AssessmentRelease memerlukan tepat tujuh Test dengan item yang siap.");
  }

  const releaseTryout = await attachCatCalibrationSnapshots(tx, tryout);
  const payload = buildAssessmentReleasePayload(releaseTryout);
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
  return tx.assessmentRelease.create({
    data: {
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
  AssessmentReleaseMetadata,
  AssessmentReleaseSectionLabel,
  ParticipantAssessmentReleaseMetadata,
  ReleaseTryoutRecord,
};
