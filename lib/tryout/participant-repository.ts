import "server-only";

import {
  ContentStatus,
  Prisma,
  TryoutAssignmentStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type ParticipantTryoutSection = {
  difficulty: "easy" | "medium" | "hard" | "adaptive";
  durationSeconds: number;
  questionCount: number;
  sequenceNo: number;
  subtestCode: string;
  subtestName: string;
  testType: "cbt" | "cat";
  title: string;
};

type ParticipantTryoutAssignment = {
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
  status: string;
};

type ParticipantTryoutSession = Omit<
  ParticipantTryoutAssignment,
  "attempt"
>;

type ParticipantTryout = {
  admissionMode: "open" | "approval_required" | "invitation_only";
  admissionStatus: "active" | "pending" | "rejected" | "revoked" | null;
  assessmentType: "tryout" | "diagnostic";
  assignments: ParticipantTryoutAssignment[];
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
  deliverySessions: {
    orderBy: { availableFrom: "asc" as const },
    select: {
      availableFrom: true,
      availableUntil: true,
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

function serializeTryout(
  tryout: ParticipantTryoutRecord,
  studentId: string,
): ParticipantTryout {
  const admission = tryout.admissions[0];
  const now = new Date();
  return {
    admissionMode: tryout.admissionMode,
    admissionStatus: admission?.status ?? null,
    assessmentType: tryout.assessmentType,
    assignments: (admission?.assignments ?? []).map((assignment) => {
      const deliverySession = assignment.deliverySession;
      const attempt = deliverySession.attempts.find((candidate) => candidate.studentId === studentId) ?? null;
      return {
        attempt: attempt ? { id: attempt.id, status: attempt.status } : null,
        availableFrom: deliverySession.availableFrom,
        availableUntil: deliverySession.availableUntil,
        fullscreenPrompt: deliverySession.fullscreenPrompt,
        id: deliverySession.id,
        isDefaultOpenRegistration: deliverySession.isDefaultOpenRegistration,
        isAvailableNow:
          deliverySession.availableFrom <= now &&
          deliverySession.availableUntil > now,
        isExpired: deliverySession.availableUntil <= now,
        name: deliverySession.name,
        rankingRule: deliverySession.rankingRule,
        resultReleasePolicy: deliverySession.resultReleasePolicy,
        status: deliverySession.status,
      };
    }),
    description: tryout.description,
    examEvent: tryout.examEvent,
    id: tryout.id,
    organizer: tryout.createdBy.fullName,
    participantCount: tryout._count.admissions,
    publishedAt: tryout.publishedAt,
    sections: tryout.sections.map((section) => ({
      difficulty: sectionDifficulty(section.items),
      durationSeconds: section.durationSeconds,
      questionCount: section.questionCount,
      sequenceNo: section.sequenceNo,
      subtestCode: section.subtest.code,
      subtestName: section.subtest.name,
      testType: section.testType,
      title: section.title,
    })),
    sessions: tryout.deliverySessions.map((deliverySession) => ({
      availableFrom: deliverySession.availableFrom,
      availableUntil: deliverySession.availableUntil,
      fullscreenPrompt: deliverySession.fullscreenPrompt,
      id: deliverySession.id,
      isDefaultOpenRegistration: deliverySession.isDefaultOpenRegistration,
      isAvailableNow:
        deliverySession.availableFrom <= now &&
        deliverySession.availableUntil > now,
      isExpired: deliverySession.availableUntil <= now,
      name: deliverySession.name,
      rankingRule: deliverySession.rankingRule,
      resultReleasePolicy: deliverySession.resultReleasePolicy,
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
  return tryouts.map((tryout) => serializeTryout(tryout, studentId));
}

async function participantTryoutDetail(tryoutId: string, studentId: string) {
  const [tryout] = await queryParticipantTryouts(studentId, tryoutId);
  return tryout ? serializeTryout(tryout, studentId) : null;
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
