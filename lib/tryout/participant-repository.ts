import "server-only";

import {
  ContentStatus,
  MediaAssetState,
  Prisma,
  TryoutAssignmentStatus,
} from "@/generated/prisma/client";
import { isImageMimeType } from "@/lib/media/domain";
import { createMediaPreviewUrl, R2ConfigurationError } from "@/lib/media/r2";
import { toParticipantAssessmentReleaseMetadata, type ParticipantAssessmentReleaseMetadata } from "@/lib/tryout/assessment-release";
import { prisma } from "@/lib/prisma";

type ParticipantTryoutSection = {
  difficulty: "easy" | "medium" | "hard" | "adaptive";
  durationSeconds: number;
  questionCount: number;
  sequenceNo: number;
  subtestCode: string;
  subtestName: string;
  testType: "cbt";
  title: string;
};

type ParticipantTryoutAssignment = {
  assessmentRelease: ParticipantAssessmentReleaseMetadata | null;
  attempt: { id: string; status: string } | null;
  availableFrom: Date;
  availableUntil: Date;
  fullscreenPrompt: boolean;
  id: string;
  isDefaultOpenRegistration: boolean;
  isAvailableNow: boolean;
  isExpired: boolean;
  name: string;
  rankingRule: string;
  resultReleasePolicy: string;
  sections: ParticipantTryoutSection[];
  status: string;
};

type ParticipantTryoutSession = Omit<
  ParticipantTryoutAssignment,
  "attempt"
>;

type ParticipantTryout = {
  assessmentRelease: ParticipantAssessmentReleaseMetadata | null;
  admissionMode: "open" | "approval_required" | "invitation_only";
  admissionStatus: "active" | "pending" | "rejected" | "revoked" | null;
  assessmentType: "tryout" | "diagnostic";
  assignments: ParticipantTryoutAssignment[];
  bannerUrl: string | null;
  description: string | null;
  examEvent: { id: string; name: string } | null;
  id: string;
  organizer: string;
  participantCount: number;
  publishedAt: Date | null;
  sections: ParticipantTryoutSection[];
  sessions: ParticipantTryoutSession[];
  title: string;
};

type ParticipantTargetProfile = {
  examEvent: { id: string; name: string } | null;
  major: { id: string; name: string } | null;
  university: { id: string; name: string; shortName: string | null } | null;
};

const tryoutInclude = {
  _count: { select: { admissions: true } },
  admissions: {
    include: {
      assignments: {
        include: {
          deliverySession: {
            include: {
              assessmentRelease: { select: { contentDigest: true, id: true, payload: true, publishedAt: true, releaseNumber: true } },
              attempts: {
                select: { id: true, status: true, studentId: true },
              },
            },
          },
        },
        orderBy: { assignedAt: "desc" as const },
        where: { status: TryoutAssignmentStatus.active },
      },
    },
  },
  createdBy: { select: { fullName: true } },
  bannerMedia: { select: { mimeType: true, objectKey: true, state: true, url: true } },
  assessmentReleases: { orderBy: { releaseNumber: "desc" as const }, take: 1 },
  deliverySessions: {
    orderBy: { availableFrom: "asc" as const },
    select: {
      availableFrom: true,
      availableUntil: true,
      assessmentRelease: { select: { contentDigest: true, id: true, payload: true, publishedAt: true, releaseNumber: true } },
      fullscreenPrompt: true,
      id: true,
      isDefaultOpenRegistration: true,
      name: true,
      rankingRule: true,
      resultReleasePolicy: true,
      status: true,
    },
    where: { status: { in: ["active", "closed"] as const } },
  },
  examEvent: { select: { id: true, name: true } },
  sections: {
    include: {
      items: { select: { difficulty: true } },
      subtest: { select: { code: true, name: true } },
    },
    orderBy: { sequenceNo: "asc" as const },
  },
} satisfies Prisma.TryoutPackageInclude;

type ParticipantTryoutRecord = Prisma.TryoutPackageGetPayload<{
  include: typeof tryoutInclude;
}>;

function sectionDifficulty(items: Array<{ difficulty: string }>) {
  if (!items.length) return "medium" as const;
  const counts = items.reduce((result, item) => {
    result[item.difficulty] = (result[item.difficulty] ?? 0) + 1;
    return result;
  }, {} as Record<string, number>);
  return (Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "medium") as ParticipantTryoutSection["difficulty"];
}

function releaseSections(
  release: NonNullable<ParticipantTryoutRecord["deliverySessions"][number]["assessmentRelease"]>,
): ParticipantTryoutSection[] {
  const payload = release.payload as {
    sections?: Array<{
      durationSeconds?: number;
      items?: Array<{ difficulty?: string }>;
      scoring?: { testType?: string };
      sequenceNo?: number;
      subtestCode?: string | null;
      subtestName?: string | null;
      subtestId?: string;
      title?: string;
    }>;
  };
  return (payload.sections ?? []).map((section) => {
    const items = section.items ?? [];
    return {
      difficulty: sectionDifficulty(items.map((item) => ({ difficulty: item.difficulty ?? "medium" }))),
      durationSeconds: section.durationSeconds ?? 0,
      questionCount: items.length,
      sequenceNo: section.sequenceNo ?? 0,
      subtestCode: section.subtestCode ?? section.subtestId ?? "",
      subtestName: section.subtestName ?? section.subtestId ?? "",
      testType: "cbt",
      title: section.title ?? "",
    };
  });
}

async function resolveTryoutBannerUrl(
  asset: { mimeType: string; objectKey: string | null; state: MediaAssetState; url: string | null } | null,
) {
  if (
    !asset
    || (asset.state !== MediaAssetState.ready && asset.state !== MediaAssetState.trashed)
    || !isImageMimeType(asset.mimeType)
  ) {
    return null;
  }
  if (asset.url) return asset.url;
  if (!asset.objectKey) return null;
  try {
    return await createMediaPreviewUrl(asset.objectKey);
  } catch (bannerError) {
    if (bannerError instanceof R2ConfigurationError) return null;
    throw bannerError;
  }
}

function serializeTryout(
  tryout: ParticipantTryoutRecord,
  studentId: string,
  bannerUrl: string | null,
): ParticipantTryout {
  const admission = tryout.admissions[0];
  const now = new Date();
  const latestRelease = tryout.assessmentReleases[0] ?? null;
  const assignedSession = admission?.assignments[0]?.deliverySession ?? null;
  const pinnedAssignmentRelease = assignedSession?.assessmentRelease ?? null;
  const summaryRelease = pinnedAssignmentRelease ?? (assignedSession ? null : latestRelease);
  const summarySections = summaryRelease
    ? releaseSections(summaryRelease)
    : assignedSession
      ? []
      : tryout.sections.map((section) => ({
        difficulty: sectionDifficulty(section.items),
        durationSeconds: section.durationSeconds,
        questionCount: section.questionCount,
        sequenceNo: section.sequenceNo,
        subtestCode: section.subtest.code,
        subtestName: section.subtest.name,
        testType: section.testType,
        title: section.title,
      }));
  return {
    assessmentRelease: summaryRelease
      ? toParticipantAssessmentReleaseMetadata(summaryRelease)
      : null,
    admissionMode: tryout.admissionMode,
    admissionStatus: admission?.status ?? null,
    assessmentType: tryout.assessmentType,
    assignments: (admission?.assignments ?? []).map((assignment) => {
      const deliverySession = assignment.deliverySession;
      const attempt = deliverySession.attempts.find((candidate) => candidate.studentId === studentId) ?? null;
      return {
        assessmentRelease: deliverySession.assessmentRelease
          ? toParticipantAssessmentReleaseMetadata(deliverySession.assessmentRelease)
          : null,
        attempt: attempt ? { id: attempt.id, status: attempt.status } : null,
        availableFrom: deliverySession.availableFrom,
        availableUntil: deliverySession.availableUntil,
        fullscreenPrompt: deliverySession.fullscreenPrompt,
        id: deliverySession.id,
        isDefaultOpenRegistration: deliverySession.isDefaultOpenRegistration,
        isAvailableNow:
          Boolean(deliverySession.assessmentRelease) &&
          deliverySession.availableFrom <= now &&
          deliverySession.availableUntil > now,
        isExpired: deliverySession.availableUntil <= now,
        name: deliverySession.name,
        rankingRule: deliverySession.rankingRule,
        resultReleasePolicy: deliverySession.resultReleasePolicy,
        sections: deliverySession.assessmentRelease
          ? releaseSections(deliverySession.assessmentRelease)
          : [],
        status: deliverySession.status,
      };
    }),
    bannerUrl,
    description: tryout.description,
    examEvent: tryout.examEvent,
    id: tryout.id,
    organizer: tryout.createdBy.fullName,
    participantCount: tryout._count.admissions,
    publishedAt: tryout.publishedAt,
    sections: summarySections,
    sessions: tryout.deliverySessions.map((deliverySession) => ({
      assessmentRelease: deliverySession.assessmentRelease
        ? toParticipantAssessmentReleaseMetadata(deliverySession.assessmentRelease)
        : null,
      availableFrom: deliverySession.availableFrom,
      availableUntil: deliverySession.availableUntil,
      fullscreenPrompt: deliverySession.fullscreenPrompt,
      id: deliverySession.id,
      isDefaultOpenRegistration: deliverySession.isDefaultOpenRegistration,
      isAvailableNow:
        Boolean(deliverySession.assessmentRelease) &&
        deliverySession.availableFrom <= now &&
        deliverySession.availableUntil > now,
      isExpired: deliverySession.availableUntil <= now,
      name: deliverySession.name,
      rankingRule: deliverySession.rankingRule,
      resultReleasePolicy: deliverySession.resultReleasePolicy,
      sections: deliverySession.assessmentRelease
        ? releaseSections(deliverySession.assessmentRelease)
        : [],
      status: deliverySession.status,
    })),
    title: tryout.title,
  };
}

async function queryParticipantTryouts(studentId: string, tryoutId?: string) {
  return prisma.tryoutPackage.findMany({
    include: {
      ...tryoutInclude,
      admissions: {
        ...tryoutInclude.admissions,
        where: { studentId },
      },
    },
    orderBy: { updatedAt: "desc" },
    where: {
      ...(tryoutId ? { id: tryoutId } : {}),
      OR: [
        { admissions: { some: { studentId } } },
        { status: ContentStatus.published },
      ],
    },
  });
}

async function participantTryoutCatalogue(studentId: string): Promise<ParticipantTryout[]> {
  const tryouts = await queryParticipantTryouts(studentId);
  const bannerUrls = await Promise.all(tryouts.map((tryout) => resolveTryoutBannerUrl(tryout.bannerMedia)));
  return tryouts.map((tryout, index) => serializeTryout(tryout, studentId, bannerUrls[index] ?? null));
}

async function participantTryoutDetail(tryoutId: string, studentId: string) {
  const [tryout] = await queryParticipantTryouts(studentId, tryoutId);
  if (!tryout) return null;
  return serializeTryout(tryout, studentId, await resolveTryoutBannerUrl(tryout.bannerMedia));
}

async function participantTargetProfile(studentId: string): Promise<ParticipantTargetProfile> {
  const profile = await prisma.studentProfile.findUnique({
    include: {
      targetExamEvent: { select: { id: true, name: true } },
      targetMajor: { select: { id: true, name: true } },
      targetUniversity: { select: { id: true, name: true, shortName: true } },
    },
    where: { userId: studentId },
  });
  return {
    examEvent: profile?.targetExamEvent ?? null,
    major: profile?.targetMajor ?? null,
    university: profile?.targetUniversity ?? null,
  };
}

export {
  participantTargetProfile,
  participantTryoutCatalogue,
  participantTryoutDetail,
};
export type {
  ParticipantTargetProfile,
  ParticipantTryout,
  ParticipantTryoutAssignment,
  ParticipantTryoutSection,
  ParticipantTryoutSession,
};
