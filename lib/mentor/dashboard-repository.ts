import "server-only";

import {
  ContentStatus,
  TryoutDeliverySessionStatus,
} from "@/generated/prisma/client";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { prisma } from "@/lib/prisma";
import { isUuidLike } from "@/modules/mentor/dashboard-types";
import {
  projectMentorDashboardProjection,
} from "@/modules/mentor/dashboard-projection";
import type {
  DashboardMateriSource,
  DashboardProjectionInput,
  DashboardQuizSource,
  DashboardTryoutSessionSource,
  DashboardTryoutSource,
} from "@/modules/mentor/dashboard-projection";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

type DashboardQuizRecord = Awaited<ReturnType<typeof readDashboardQuizzes>>[number];
type DashboardTryoutRecord = Awaited<ReturnType<typeof readDashboardTryouts>>[number];

function statusFor(value: ContentStatus) {
  if (value === ContentStatus.archived) return "archived" as const;
  if (value === ContentStatus.scheduled) return "scheduled" as const;
  if (value === ContentStatus.published) return "published" as const;
  return "draft" as const;
}

function sessionStatusFor(value: TryoutDeliverySessionStatus): DashboardTryoutSessionSource["status"] {
  if (value === TryoutDeliverySessionStatus.active) return "active";
  if (value === TryoutDeliverySessionStatus.closed) return "closed";
  if (value === TryoutDeliverySessionStatus.archived) return "archived";
  return "draft";
}

async function readDashboardQuizzes(tutorId: string) {
  return prisma.standaloneQuiz.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      _count: { select: { items: true } },
      closesAt: true,
      createdByUserId: true,
      description: true,
      id: true,
      opensAt: true,
      status: true,
      subtest: { select: { code: true, name: true } },
      title: true,
      updatedAt: true,
    },
    where: { createdByUserId: tutorId },
  });
}

async function readDashboardTryouts(tutorId: string, now: Date) {
  return prisma.tryoutPackage.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      createdByUserId: true,
      description: true,
      deliverySessions: {
        orderBy: [{ availableFrom: "asc" }, { id: "asc" }],
        select: {
          availableFrom: true,
          availableUntil: true,
          id: true,
          status: true,
        },
        where: {
          availableFrom: { gt: now },
          availableUntil: { gt: now },
          status: TryoutDeliverySessionStatus.active,
        },
      },
      id: true,
      status: true,
      title: true,
      updatedAt: true,
    },
    where: {
      createdByUserId: tutorId,
      deliverySessions: {
        some: {
          availableFrom: { gt: now },
          availableUntil: { gt: now },
          status: TryoutDeliverySessionStatus.active,
        },
      },
      status: ContentStatus.published,
    },
  });
}

function toMateriSource(
  resource: ReturnType<typeof toKaptenMateriCatalogueView>["lessons"][number],
): DashboardMateriSource {
  return {
    description: resource.description,
    id: resource.id,
    primaryMetric: resource.primaryMetric,
    progress: resource.progress,
    status: statusFor(resource.status as ContentStatus),
    subjectCode: resource.subjectCode,
    subjectName: resource.subjectName,
    title: resource.title,
    updatedAtEpoch: resource.updatedAtEpoch,
  };
}

function toQuizSource(record: DashboardQuizRecord): DashboardQuizSource {
  return {
    closesAt: record.closesAt?.toISOString() ?? null,
    description: record.description,
    id: record.id,
    ownerId: record.createdByUserId,
    opensAt: record.opensAt?.toISOString() ?? null,
    questionCount: record._count.items,
    status: statusFor(record.status),
    subjectCode: record.subtest.code,
    subjectName: record.subtest.name,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toTryoutSource(record: DashboardTryoutRecord): DashboardTryoutSource {
  return {
    deliverySessions: record.deliverySessions.map((session) => ({
      availableFrom: session.availableFrom.toISOString(),
      availableUntil: session.availableUntil.toISOString(),
      id: session.id,
      status: sessionStatusFor(session.status),
    })),
    description: record.description,
    id: record.id,
    ownerId: record.createdByUserId,
    status: statusFor(record.status),
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Load and serialize the authenticated Dashboard corpus. Materi is the
 * explicitly shared curriculum source; Kuis and Tryout are queried with the
 * tutor ownership predicate before any DTO reaches the client.
 */
async function getMentorDashboardProjection(
  tutorId: string,
  now = new Date(),
) {
  const materiResult = await Promise.allSettled([getMentorMateriCatalogue()]);
  const catalogue = materiResult[0]?.status === "fulfilled" ? materiResult[0].value : [];
  const view = toKaptenMateriCatalogueView(catalogue);

  const source: Omit<DashboardProjectionInput, "now" | "tutorId"> = {
    materi: view.lessons.map(toMateriSource),
    quizzes: [],
    tryouts: [],
  };

  // Never send an invalid tutor identifier to a UUID-bound Prisma predicate.
  // The authenticated session normally makes this branch unreachable, but it
  // keeps a failed session boundary from becoming an invalid-ID Dashboard
  // error while still returning shared Materi.
  if (!isUuidLike(tutorId)) {
    return projectMentorDashboardProjection({ ...source, now, tutorId });
  }

  const [quizResult, tryoutResult] = await Promise.allSettled([
    readDashboardQuizzes(tutorId),
    readDashboardTryouts(tutorId, now),
  ]);
  const quizzes = quizResult.status === "fulfilled" ? quizResult.value : [];
  const tryouts = tryoutResult.status === "fulfilled" ? tryoutResult.value : [];

  return projectMentorDashboardProjection({
    ...source,
    now,
    quizzes: quizzes.map(toQuizSource),
    tryouts: tryouts.map(toTryoutSource),
    tutorId,
  });
}

export { getMentorDashboardProjection };
