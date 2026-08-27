import {
  canonicalDashboardHref,
  compareDashboardResourcesBySchedule,
  compareDashboardResourcesByUpdatedAt,
  createEmptyDashboardProjection,
  getDashboardTimestampMillis,
  normalizeDashboardTimestamp,
} from "@/modules/mentor/dashboard-types";
import type {
  DashboardProjection,
  DashboardResource,
  DashboardResourceStatus,
} from "@/modules/mentor/dashboard-types";

type DashboardProjectionStatus = DashboardResourceStatus;

type DashboardMateriSource = {
  description: string;
  id: string;
  primaryMetric: string;
  progress: number;
  status: DashboardProjectionStatus;
  subjectCode: string;
  subjectName: string;
  title: string;
  updatedAtEpoch: number;
};

type DashboardQuizSource = {
  closesAt: string | null;
  description: string | null;
  id: string;
  ownerId: string;
  opensAt: string | null;
  questionCount: number;
  status: DashboardProjectionStatus;
  subjectCode: string;
  subjectName: string;
  title: string;
  updatedAt: string;
};

type DashboardTryoutSessionSource = {
  availableFrom: string;
  availableUntil: string;
  id: string;
  status: "active" | "archived" | "closed" | "draft";
};

type DashboardTryoutSource = {
  deliverySessions: DashboardTryoutSessionSource[];
  description: string | null;
  id: string;
  ownerId: string;
  status: DashboardProjectionStatus;
  title: string;
  updatedAt: string;
};

type DashboardProjectionInput = {
  materi: readonly DashboardMateriSource[];
  quizzes: readonly DashboardQuizSource[];
  tryouts: readonly DashboardTryoutSource[];
  tutorId: string;
  now: Date;
};

function statusToDashboard(value: DashboardProjectionStatus): DashboardResourceStatus {
  return value;
}

function toDashboardMateriResource(resource: DashboardMateriSource): DashboardResource | null {
  const href = canonicalDashboardHref("materi", resource.id);
  const updatedAt = normalizeDashboardTimestamp(resource.updatedAtEpoch);
  if (!href || !updatedAt) return null;

  return {
    description: resource.description,
    href,
    id: resource.id,
    kind: "materi",
    primaryMetric: resource.primaryMetric,
    progress: resource.progress,
    resourceType: "materi",
    scheduledAt: null,
    source: "persisted",
    status: statusToDashboard(resource.status),
    subjectCode: resource.subjectCode,
    subjectName: resource.subjectName,
    title: resource.title,
    updatedAt,
  };
}

function toDashboardQuizResource(
  record: DashboardQuizSource,
  now: Date,
): DashboardResource | null {
  const href = canonicalDashboardHref("quiz", record.id);
  const updatedAt = normalizeDashboardTimestamp(record.updatedAt);
  if (!href || !updatedAt) return null;

  const nowMillis = getDashboardTimestampMillis(now);
  const opensAtMillis = getDashboardTimestampMillis(record.opensAt);
  const closesAtMillis = getDashboardTimestampMillis(record.closesAt);
  const opensAt = opensAtMillis !== null && nowMillis !== null && opensAtMillis > nowMillis
    ? normalizeDashboardTimestamp(opensAtMillis)
    : null;
  const closesAt = closesAtMillis !== null && nowMillis !== null && closesAtMillis > nowMillis
    ? normalizeDashboardTimestamp(closesAtMillis)
    : null;
  const status = opensAt && record.status !== "archived" ? "scheduled" : statusToDashboard(record.status);
  const questionCount = Number.isFinite(record.questionCount) ? record.questionCount : 0;

  return {
    closesAt: closesAt ?? undefined,
    description: record.description ?? "",
    href,
    id: record.id,
    kind: "quiz",
    opensAt: opensAt ?? undefined,
    primaryMetric: `${questionCount} soal`,
    progress: questionCount > 0 ? 100 : 0,
    resourceType: "quiz",
    scheduledAt: opensAt,
    scheduledFor: opensAt ? `Buka ${opensAt}` : undefined,
    source: "persisted",
    status,
    subjectCode: record.subjectCode,
    subjectName: record.subjectName,
    title: record.title,
    updatedAt,
  };
}

function toDashboardTryoutResource(
  record: DashboardTryoutSource,
  session: DashboardTryoutSessionSource,
): DashboardResource | null {
  const href = canonicalDashboardHref("tryout", record.id);
  const updatedAt = normalizeDashboardTimestamp(record.updatedAt);
  const scheduledAt = normalizeDashboardTimestamp(session.availableFrom);
  const closesAt = normalizeDashboardTimestamp(session.availableUntil);
  if (!href || !updatedAt || !scheduledAt || !closesAt) return null;

  return {
    closesAt,
    description: record.description ?? "",
    href,
    id: record.id,
    kind: "tryout",
    primaryMetric: "Tryout",
    progress: record.status === "published" ? 100 : 0,
    resourceType: "tryout",
    scheduledAt,
    scheduledFor: `Mulai ${scheduledAt}`,
    source: "persisted",
    status: "scheduled",
    title: record.title,
    updatedAt,
  };
}

function isFutureActiveSession(session: DashboardTryoutSessionSource, now: Date) {
  const nowMillis = getDashboardTimestampMillis(now);
  const availableFrom = getDashboardTimestampMillis(session.availableFrom);
  const availableUntil = getDashboardTimestampMillis(session.availableUntil);

  return session.status === "active"
    && nowMillis !== null
    && availableFrom !== null
    && availableUntil !== null
    && availableFrom > nowMillis
    && availableUntil > nowMillis;
}

/**
 * Project normalized source rows into the four Dashboard groups. The owner
 * and release checks are repeated here as a defense-in-depth boundary for
 * callers that already queried an owner-scoped repository.
 */
function projectMentorDashboardProjection({ materi, now, quizzes, tryouts, tutorId }: DashboardProjectionInput): DashboardProjection {
  const recentMateri = materi
    .map(toDashboardMateriResource)
    .filter((resource): resource is DashboardResource => Boolean(resource))
    .sort(compareDashboardResourcesByUpdatedAt);
  const ownedQuizzes = quizzes.filter((record) => record.ownerId === tutorId);
  const recentKuis = ownedQuizzes
    .map((record) => toDashboardQuizResource(record, now))
    .filter((resource): resource is DashboardResource => Boolean(resource))
    .sort(compareDashboardResourcesByUpdatedAt);
  const scheduledKuis = recentKuis
    .filter((resource) => resource.scheduledAt !== null && resource.status !== "archived")
    .sort(compareDashboardResourcesBySchedule);
  const scheduledTryout = tryouts
    .filter((record) => record.ownerId === tutorId && record.status === "published")
    .flatMap((record) => {
      const session = record.deliverySessions
        .filter((candidate) => isFutureActiveSession(candidate, now))
        .sort((left, right) => {
          const leftAvailableFrom = getDashboardTimestampMillis(left.availableFrom);
          const rightAvailableFrom = getDashboardTimestampMillis(right.availableFrom);
          if (leftAvailableFrom === null) return rightAvailableFrom === null ? left.id.localeCompare(right.id) : 1;
          if (rightAvailableFrom === null) return -1;
          if (leftAvailableFrom !== rightAvailableFrom) return leftAvailableFrom < rightAvailableFrom ? -1 : 1;
          return left.id.localeCompare(right.id);
        })[0];
      const resource = session ? toDashboardTryoutResource(record, session) : null;
      return resource ? [resource] : [];
    })
    .sort(compareDashboardResourcesBySchedule);

  return {
    ...createEmptyDashboardProjection(),
    recentKuis,
    recentMateri,
    scheduledKuis,
    scheduledTryout,
  };
}

export { projectMentorDashboardProjection };
export type {
  DashboardMateriSource,
  DashboardProjectionInput,
  DashboardQuizSource,
  DashboardTryoutSessionSource,
  DashboardTryoutSource,
};
