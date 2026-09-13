import "server-only";

import {
  ContentStatus,
  StandaloneQuizVersionState,
  TryoutDeliverySessionStatus,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { prisma } from "@/lib/prisma";
import {
  isUuidLike,
  normalizeDashboardTimestamp,
} from "@/modules/mentor/dashboard-types";
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

type DashboardQuizRecord = {
  _count: { items: number };
  closesAt: Date | null;
  createdByUserId: string;
  description: string | null;
  id: string;
  opensAt: Date | null;
  status: ContentStatus;
  subtest: { code: string; name: string };
  title: string;
  updatedAt: Date;
  versions?: Array<{
    _count: { items: number };
    state: StandaloneQuizVersionState;
  }>;
};

type DashboardTryoutRecord = {
  createdByUserId: string;
  description: string | null;
  deliverySessions: Array<{
    availableFrom: Date;
    availableUntil: Date;
    id: string;
    status: TryoutDeliverySessionStatus;
  }>;
  id: string;
  status: ContentStatus;
  title: string;
  updatedAt: Date;
};

type DashboardPrismaDelegate<Row, Query> = {
  findMany: (args: Query) => Promise<readonly Row[]>;
};

/**
 * The dashboard adapter only needs these two read delegates. Keeping this
 * seam narrower than PrismaClient lets runtime tests exercise the production
 * query builder without requiring a database connection.
 */
type DashboardPrismaClient = {
  standaloneQuiz: DashboardPrismaDelegate<DashboardQuizRecord, Prisma.StandaloneQuizFindManyArgs>;
  tryoutPackage: DashboardPrismaDelegate<DashboardTryoutRecord, Prisma.TryoutPackageFindManyArgs>;
};

const dashboardQuizSelect = {
  _count: { select: { items: { where: { quizVersionId: null } } } },
  closesAt: true,
  createdByUserId: true,
  description: true,
  id: true,
  opensAt: true,
  status: true,
  subtest: { select: { code: true, name: true } },
  title: true,
  updatedAt: true,
  versions: {
    select: {
      _count: { select: { items: true } },
      state: true,
    },
    where: { state: { in: [StandaloneQuizVersionState.active, StandaloneQuizVersionState.draft] } },
  },
} satisfies Prisma.StandaloneQuizSelect;

function dashboardTryoutSessionWhere(now: Date) {
  return {
    availableFrom: { gt: now },
    availableUntil: { gt: now },
    status: TryoutDeliverySessionStatus.active,
  } satisfies Prisma.TryoutDeliverySessionWhereInput;
}

function dashboardTryoutSelect(now: Date) {
  return {
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
      where: dashboardTryoutSessionWhere(now),
    },
    id: true,
    status: true,
    title: true,
    updatedAt: true,
  } satisfies Prisma.TryoutPackageSelect;
}

type DashboardQuizRepositoryQuery = {
  ownerId: string;
};

type DashboardTryoutRepositoryQuery = {
  now: Date;
  ownerId: string;
  packageStatus: "published";
  sessionStatus: "active";
};

type MentorDashboardRepository = {
  readMateri: () => Promise<readonly DashboardMateriSource[]>;
  readQuizzes: (query: DashboardQuizRepositoryQuery) => Promise<readonly DashboardQuizSource[]>;
  readTryouts: (query: DashboardTryoutRepositoryQuery) => Promise<readonly DashboardTryoutSource[]>;
};

const productionDashboardPrisma: DashboardPrismaClient = {
  standaloneQuiz: {
    findMany: (args) => prisma.standaloneQuiz.findMany(args) as unknown as Promise<readonly DashboardQuizRecord[]>,
  },
  tryoutPackage: {
    findMany: (args) => prisma.tryoutPackage.findMany(args) as unknown as Promise<readonly DashboardTryoutRecord[]>,
  },
};

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

async function readDashboardQuizzes(
  tutorId: string,
  client: DashboardPrismaClient = productionDashboardPrisma,
) {
  return client.standaloneQuiz.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: dashboardQuizSelect,
    where: { createdByUserId: tutorId },
  } satisfies Prisma.StandaloneQuizFindManyArgs);
}

async function readDashboardTryouts(
  tutorId: string,
  now: Date,
  client: DashboardPrismaClient = productionDashboardPrisma,
) {
  const sessionWhere = dashboardTryoutSessionWhere(now);

  return client.tryoutPackage.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: dashboardTryoutSelect(now),
    where: {
      createdByUserId: tutorId,
      deliverySessions: {
        some: sessionWhere,
      },
      status: ContentStatus.published,
    },
  } satisfies Prisma.TryoutPackageFindManyArgs);
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

function toQuizSource(record: DashboardQuizRecord): DashboardQuizSource | null {
  const updatedAt = normalizeDashboardTimestamp(record.updatedAt);
  if (!updatedAt) return null;
  const activeVersion = record.versions?.find((version) => version.state === StandaloneQuizVersionState.active);
  const draftVersion = record.versions?.find((version) => version.state === StandaloneQuizVersionState.draft);
  const questionCount = activeVersion?._count.items ?? draftVersion?._count.items ?? record._count.items;

  return {
    closesAt: normalizeDashboardTimestamp(record.closesAt),
    description: record.description,
    id: record.id,
    ownerId: record.createdByUserId,
    opensAt: normalizeDashboardTimestamp(record.opensAt),
    questionCount,
    status: statusFor(record.status),
    subjectCode: record.subtest.code,
    subjectName: record.subtest.name,
    title: record.title,
    updatedAt,
  };
}

function toTryoutSource(record: DashboardTryoutRecord): DashboardTryoutSource | null {
  const updatedAt = normalizeDashboardTimestamp(record.updatedAt);
  if (!updatedAt) return null;

  return {
    deliverySessions: record.deliverySessions.flatMap((session) => {
      const availableFrom = normalizeDashboardTimestamp(session.availableFrom);
      const availableUntil = normalizeDashboardTimestamp(session.availableUntil);
      return availableFrom && availableUntil
        ? [{
          availableFrom,
          availableUntil,
          id: session.id,
          status: sessionStatusFor(session.status),
        }]
        : [];
    }),
    description: record.description,
    id: record.id,
    ownerId: record.createdByUserId,
    status: statusFor(record.status),
    title: record.title,
    updatedAt,
  };
}

async function readDashboardMateri(): Promise<readonly DashboardMateriSource[]> {
  const catalogue = await getMentorMateriCatalogue();
  const view = toKaptenMateriCatalogueView(catalogue);
  return view.lessons.map(toMateriSource);
}

type MentorDashboardRepositoryDependencies = {
  prismaClient?: DashboardPrismaClient;
  readMateri?: () => Promise<readonly DashboardMateriSource[]>;
};

function createMentorDashboardRepository({
  prismaClient = productionDashboardPrisma,
  readMateri = readDashboardMateri,
}: MentorDashboardRepositoryDependencies = {}): MentorDashboardRepository {
  return {
    readMateri,
    readQuizzes: async ({ ownerId }) => {
      const records = await readDashboardQuizzes(ownerId, prismaClient);
      return records
        .map(toQuizSource)
        .filter((record): record is DashboardQuizSource => Boolean(record));
    },
    readTryouts: async ({ now, ownerId }) => {
      const records = await readDashboardTryouts(ownerId, now, prismaClient);
      return records
        .map(toTryoutSource)
        .filter((record): record is DashboardTryoutSource => Boolean(record));
    },
  };
}

const productionMentorDashboardRepository = createMentorDashboardRepository();

/**
 * Load and serialize the authenticated Dashboard corpus. Materi is the
 * explicitly shared curriculum source; Kuis and Tryout are queried with the
 * tutor ownership predicate before any DTO reaches the client.
 */
async function getMentorDashboardProjection(
  tutorId: string,
  now = new Date(),
  repository: MentorDashboardRepository = productionMentorDashboardRepository,
) {
  const materiResult = await Promise.allSettled([repository.readMateri()]);

  const source: Omit<DashboardProjectionInput, "now" | "tutorId"> = {
    materi: materiResult[0]?.status === "fulfilled" ? materiResult[0].value : [],
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
    repository.readQuizzes({ ownerId: tutorId }),
    repository.readTryouts({
      now,
      ownerId: tutorId,
      packageStatus: "published",
      sessionStatus: "active",
    }),
  ]);
  const quizzes = quizResult.status === "fulfilled" ? quizResult.value : [];
  const tryouts = tryoutResult.status === "fulfilled" ? tryoutResult.value : [];

  return projectMentorDashboardProjection({
    ...source,
    now,
    quizzes,
    tryouts,
    tutorId,
  });
}

export { getMentorDashboardProjection };
export type {
  DashboardPrismaClient,
  DashboardQuizRepositoryQuery,
  DashboardTryoutRepositoryQuery,
  DashboardQuizRecord,
  DashboardTryoutRecord,
  MentorDashboardRepositoryDependencies,
  MentorDashboardRepository,
};
export { createMentorDashboardRepository };
