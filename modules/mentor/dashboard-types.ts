type DashboardResourceKind = "materi" | "quiz" | "tryout";
type DashboardResourceStatus = "draft" | "scheduled" | "published" | "archived";
type DashboardResourceSource = "persisted" | "tutor_scoped_local_draft";

/**
 * The smallest resource contract that the authenticated Dashboard renders.
 * `href` is always rebuilt from `kind` and `id`; it is never accepted from a
 * browser draft or another client-controlled payload.
 */
type DashboardResource = {
  closesAt?: string;
  description: string;
  href: string;
  id: string;
  kind: DashboardResourceKind;
  opensAt?: string;
  primaryMetric: string;
  progress: number;
  resourceType: DashboardResourceKind;
  scheduledAt: string | null;
  scheduledFor?: string;
  source: DashboardResourceSource;
  status: DashboardResourceStatus;
  subjectCode?: string;
  subjectName?: string;
  title: string;
  updatedAt: string;
};

type DashboardProjection = {
  recentKuis: DashboardResource[];
  recentMateri: DashboardResource[];
  scheduledKuis: DashboardResource[];
  scheduledTryout: DashboardResource[];
};

type DashboardQuizDraftLike = {
  quiz: {
    description: string;
    id: string;
    primaryMetric: string;
    progress: number;
    resourceType: "quiz";
    title: string;
  };
  savedAt: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isSafeResourceId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value === value.trim()
    && !value.includes("/")
    && !value.includes("\\")
    && value !== "."
    && value !== "..";
}

/** Build a route only after the resource kind and identifier have passed validation. */
function canonicalDashboardHref(
  kind: DashboardResourceKind,
  id: unknown,
): string | null {
  if (!isSafeResourceId(id)) return null;
  if ((kind === "quiz" || kind === "tryout") && !isUuidLike(id)) return null;

  const prefix = kind === "materi"
    ? "/mentor/materi"
    : kind === "quiz"
      ? "/mentor/quiz"
      : "/mentor/tryout";
  return `${prefix}/${encodeURIComponent(id)}`;
}

function createEmptyDashboardProjection(): DashboardProjection {
  return {
    recentKuis: [],
    recentMateri: [],
    scheduledKuis: [],
    scheduledTryout: [],
  };
}

function isDashboardQuizDraftLike(value: unknown): value is DashboardQuizDraftLike {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DashboardQuizDraftLike>;
  const quiz = candidate.quiz;
  if (typeof quiz !== "object" || quiz === null) return false;

  return isUuidLike(quiz.id)
    && quiz.resourceType === "quiz"
    && typeof quiz.title === "string"
    && typeof quiz.description === "string"
    && typeof quiz.primaryMetric === "string"
    && typeof quiz.progress === "number"
    && Number.isFinite(quiz.progress)
    && quiz.progress >= 0
    && quiz.progress <= 100
    && typeof candidate.savedAt === "number"
    && Number.isFinite(candidate.savedAt);
}

function overlayDashboardQuizDrafts(
  projection: DashboardProjection,
  drafts: readonly DashboardQuizDraftLike[],
): DashboardProjection {
  // The server projection is the ownership/existence proof. A local row that
  // is not already present in this tutor's persisted Kuis set is stale,
  // deleted, foreign, or otherwise unsupported and is omitted.
  const persistedQuizIds = new Set(
    [...projection.recentKuis, ...projection.scheduledKuis]
      .filter((resource) => resource.kind === "quiz")
      .map((resource) => resource.id),
  );
  const latestById = new Map<string, DashboardQuizDraftLike>();

  for (const draft of drafts) {
    if (!isDashboardQuizDraftLike(draft) || !persistedQuizIds.has(draft.quiz.id)) continue;
    const current = latestById.get(draft.quiz.id);
    if (!current || draft.savedAt > current.savedAt) latestById.set(draft.quiz.id, draft);
  }

  const overlay = (resource: DashboardResource): DashboardResource => {
    const draft = resource.kind === "quiz" ? latestById.get(resource.id) : undefined;
    if (!draft) return resource;

    const href = canonicalDashboardHref("quiz", resource.id);
    if (!href) return resource;

    return {
      ...resource,
      description: draft.quiz.description,
      href,
      primaryMetric: draft.quiz.primaryMetric,
      progress: draft.quiz.progress,
      source: "tutor_scoped_local_draft",
      // Keep the persisted title as the display authority. The browser draft
      // only contributes editing metadata after the server row has proven
      // ownership and existence.
      title: resource.title,
      updatedAt: new Date(draft.savedAt).toISOString(),
    };
  };

  return {
    recentKuis: projection.recentKuis.map(overlay),
    recentMateri: projection.recentMateri,
    scheduledKuis: projection.scheduledKuis.map(overlay),
    scheduledTryout: projection.scheduledTryout,
  };
}

export {
  canonicalDashboardHref,
  createEmptyDashboardProjection,
  isDashboardQuizDraftLike,
  isUuidLike,
  overlayDashboardQuizDrafts,
};
export type {
  DashboardProjection,
  DashboardQuizDraftLike,
  DashboardResource,
  DashboardResourceKind,
  DashboardResourceSource,
  DashboardResourceStatus,
};
