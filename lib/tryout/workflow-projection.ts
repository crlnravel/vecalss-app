/**
 * Pure lifecycle projection for the mentor Tryout workspace.
 *
 * This module deliberately consumes only lifecycle facts and identifiers. It
 * never reads or returns AssessmentRelease/Bank Soal payloads, so callers can
 * safely compose it with the server-owned DTO without crossing the immutable
 * snapshot boundary.
 */

const DRAFT_STEPS = ["overview", "configure_sections", "readiness_publish"] as const;
const PUBLISHED_STEPS = ["delivery", "operations", "results"] as const;

const TERMINAL_ATTEMPT_STATES = new Set([
  "auto_submitted",
  "completed",
  "complete",
  "expired",
  "scored",
  "submitted",
  "terminal",
]);

type TryoutWorkflowMode = "draft" | "published";
type TryoutWorkflowDraftStep = (typeof DRAFT_STEPS)[number];
type TryoutWorkflowPublishedStep = (typeof PUBLISHED_STEPS)[number];
type TryoutWorkflowStep = TryoutWorkflowDraftStep | TryoutWorkflowPublishedStep;
type TryoutWorkflowBlockerKey = TryoutWorkflowStep | "live";
type TryoutWorkflowIssueInput = string | TryoutWorkflowIssue;
type TryoutWorkflowSessionStatus = string | null | undefined;

type TryoutWorkflowIssue = {
  code: string;
  message: string;
  target?: TryoutWorkflowBlockerKey;
};

type TryoutWorkflowAttempt = {
  attemptState?: string | null;
  isTerminal?: boolean | null;
  normalizedScore?: string | number | null;
  releaseState?: string | null;
  score?: string | number | null;
  scoringState?: string | null;
  status?: string | null;
  terminal?: boolean | null;
};

type TryoutWorkflowSession = {
  assessmentRelease?: { id?: string | null } | null;
  assessmentReleaseId?: string | null;
  assessmentReleaseBound?: boolean | null;
  attemptCount?: number | null;
  attempts?: readonly TryoutWorkflowAttempt[] | null;
  closed?: boolean | null;
  closedAt?: string | null;
  hasAttempts?: boolean | null;
  hasTerminalActivity?: boolean | null;
  id: string;
  opened?: boolean | null;
  openedAt?: string | null;
  releaseId?: string | null;
  releaseBound?: boolean | null;
  releasedAt?: string | null;
  status?: TryoutWorkflowSessionStatus;
};

type TryoutWorkflowDraftReadiness = {
  blockers?: Partial<Record<TryoutWorkflowBlockerKey, readonly TryoutWorkflowIssueInput[]>>;
  configureSectionsReady?: boolean;
  overviewReady?: boolean;
  readinessPublishReady?: boolean;
  readinessReady?: boolean;
  sectionsReady?: boolean;
};

type TryoutWorkflowQuery = {
  workspace?: string | null;
};

type TryoutWorkflowProjectionInput = {
  basePath?: string | null;
  blockers?: Partial<Record<TryoutWorkflowBlockerKey, readonly TryoutWorkflowIssueInput[]>>;
  draft?: TryoutWorkflowDraftReadiness;
  mode?: TryoutWorkflowMode;
  query?: TryoutWorkflowQuery;
  readinessPublishReady?: boolean;
  readinessReady?: boolean;
  requestedStep?: string | null;
  sectionsReady?: boolean;
  session?: TryoutWorkflowSession | null;
  status?: string | null;
  title?: string | null;
  tryoutId?: string | null;
  workspace?: string | null;
};

type TryoutWorkflowRecommendedAction = {
  href: string;
  label: string;
  step: TryoutWorkflowStep;
};

type TryoutWorkflowProjection = {
  allowedSteps: TryoutWorkflowStep[];
  blockers: Record<TryoutWorkflowBlockerKey, TryoutWorkflowIssue[]>;
  completedSteps: TryoutWorkflowStep[];
  currentStep: TryoutWorkflowStep;
  defaultStep: TryoutWorkflowStep;
  liveAvailable: boolean;
  mode: TryoutWorkflowMode;
  normalizedQuery: {
    requestedStep: string | null;
    stepWasNormalized: boolean;
  };
  operationsAvailable: boolean;
  recommendedNextAction: TryoutWorkflowRecommendedAction | null;
  resultsAvailable: boolean;
};

const allBlockerKeys: TryoutWorkflowBlockerKey[] = [
  ...DRAFT_STEPS,
  ...PUBLISHED_STEPS,
  "live",
];

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedStatus(value: TryoutWorkflowSessionStatus) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function assessmentReleaseId(session: TryoutWorkflowSession) {
  return asTrimmedString(session.assessmentReleaseId)
    ?? asTrimmedString(session.releaseId)
    ?? asTrimmedString(session.assessmentRelease?.id);
}

function sessionAttempts(session: TryoutWorkflowSession) {
  return Array.isArray(session.attempts) ? session.attempts : [];
}

function isTerminalAttempt(attempt: TryoutWorkflowAttempt) {
  if (attempt.terminal === true || attempt.isTerminal === true) return true;
  const states = [attempt.attemptState, attempt.status]
    .filter((state): state is string => typeof state === "string")
    .map((state) => state.trim().toLowerCase());
  return states.some((state) => TERMINAL_ATTEMPT_STATES.has(state))
    || attempt.scoringState?.trim().toLowerCase() === "scored"
    || attempt.releaseState?.trim().toLowerCase() === "released"
    || attempt.score !== null && attempt.score !== undefined
    || attempt.normalizedScore !== null && attempt.normalizedScore !== undefined;
}

function sessionHasOpened(session: TryoutWorkflowSession) {
  const status = normalizedStatus(session.status);
  return session.opened === true
    || session.closed === true
    || session.openedAt !== null && session.openedAt !== undefined
    || session.closedAt !== null && session.closedAt !== undefined
    || session.releaseBound === true
    || session.assessmentReleaseBound === true
    || Boolean(assessmentReleaseId(session))
    || sessionAttempts(session).length > 0
    || session.hasAttempts === true
    || Number(session.attemptCount) > 0
    || Boolean(session.releasedAt)
    || ["active", "archived", "closed", "open", "opened", "released"].includes(status);
}

function sessionHasResultActivity(session: TryoutWorkflowSession) {
  return session.closed === true
    || session.closedAt !== null && session.closedAt !== undefined
    || session.hasTerminalActivity === true
    || normalizedStatus(session.status) === "closed"
    || sessionAttempts(session).some(isTerminalAttempt);
}

function sessionIsRuntimeEligible(session: TryoutWorkflowSession) {
  return normalizedStatus(session.status) === "active" && Boolean(assessmentReleaseId(session));
}

function normalizeIssues(
  issues: readonly TryoutWorkflowIssueInput[] | undefined,
  fallback: TryoutWorkflowIssue,
) {
  if (!issues?.length) return [fallback];
  return issues.map((issue) => typeof issue === "string"
    ? { code: "workflow_blocked", message: issue }
    : { ...issue });
}

function blankBlockers() {
  return Object.fromEntries(allBlockerKeys.map((key) => [key, [] as TryoutWorkflowIssue[]])) as Record<TryoutWorkflowBlockerKey, TryoutWorkflowIssue[]>;
}

function addModeBlockers(
  blockers: Record<TryoutWorkflowBlockerKey, TryoutWorkflowIssue[]>,
  mode: TryoutWorkflowMode,
) {
  const issue = {
    code: "published_immutable",
    message: "Area penyusunan hanya tersedia pada draf perubahan baru.",
    target: "delivery" as const,
  };
  if (mode === "published") {
    blockers.overview = [{ ...issue, target: "overview" }];
    blockers.configure_sections = [{ ...issue, target: "configure_sections" }];
    blockers.readiness_publish = [{ ...issue, target: "readiness_publish" }];
  } else {
    const issueForPublishedArea = {
      code: "not_published",
      message: "Terbitkan Tryout terlebih dahulu untuk membuka area ini.",
    };
    blockers.delivery = [{ ...issueForPublishedArea, target: "delivery" }];
    blockers.operations = [{ ...issueForPublishedArea, target: "delivery" }];
    blockers.live = [{ ...issueForPublishedArea, target: "delivery" }];
    blockers.results = [{ ...issueForPublishedArea, target: "delivery" }];
  }
}

function requestedStepFrom(input: TryoutWorkflowProjectionInput) {
  return input.requestedStep
    ?? input.workspace
    ?? input.query?.workspace
    ?? null;
}

function modeFrom(input: TryoutWorkflowProjectionInput): TryoutWorkflowMode {
  if (input.mode) return input.mode;
  return input.status?.trim().toLowerCase() === "published" ? "published" : "draft";
}

function draftReadinessFrom(input: TryoutWorkflowProjectionInput) {
  const draft = input.draft ?? {};
  return {
    configureSectionsReady: draft.configureSectionsReady
      ?? draft.sectionsReady
      ?? input.sectionsReady
      ?? false,
    overviewReady: draft.overviewReady ?? Boolean(input.title?.trim()),
    readinessPublishReady: draft.readinessPublishReady
      ?? draft.readinessReady
      ?? input.readinessPublishReady
      ?? input.readinessReady
      ?? false,
  };
}

function hrefForStep(input: TryoutWorkflowProjectionInput, step: TryoutWorkflowStep) {
  const basePath = asTrimmedString(input.basePath)
    ?? (asTrimmedString(input.tryoutId) ? `/mentor/tryout/${asTrimmedString(input.tryoutId)}` : "");
  const query = new URLSearchParams({ workspace: step });
  const queryString = query.toString();
  if (!basePath) return `?${queryString}`;
  return `${basePath}${basePath.includes("?") ? "&" : "?"}${queryString}`;
}

function recommendedAction(
  input: TryoutWorkflowProjectionInput,
  mode: TryoutWorkflowMode,
  readiness: ReturnType<typeof draftReadinessFrom>,
  operationsAvailable: boolean,
  resultsAvailable: boolean,
  liveAvailable: boolean,
): TryoutWorkflowRecommendedAction | null {
  let step: TryoutWorkflowStep;
  let label: string;
  if (mode === "draft") {
    if (!readiness.overviewReady) {
      step = "overview";
      label = "Lengkapi ringkasan";
    } else if (!readiness.configureSectionsReady) {
      step = "configure_sections";
      label = "Atur bagian Tryout";
    } else if (!readiness.readinessPublishReady) {
      step = "readiness_publish";
      label = "Periksa kesiapan Tryout";
    } else {
      step = "readiness_publish";
      label = "Terbitkan Tryout";
    }
  } else if (!operationsAvailable) {
    step = "delivery";
    label = "Buka pengaturan sesi";
  } else if (!resultsAvailable) {
    step = "operations";
    label = liveAvailable ? "Pantau sesi" : "Periksa pengelolaan sesi";
  } else {
    step = "results";
    label = "Tinjau hasil";
  }
  return { href: hrefForStep(input, step), label, step };
}

/**
 * Normalizes the phase/query vocabulary into the canonical lifecycle steps.
 * Legacy areas intentionally collapse into their phase so an old bookmark
 * cannot expose a hidden or out-of-order screen.
 */
function normalizeTryoutWorkflowStep(value: unknown): TryoutWorkflowStep | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/gu, "_");
  if (["overview", "basics"].includes(normalized)) return "overview";
  if (["build", "authoring", "configure", "configure_sections", "sections", "questions", "rules"].includes(normalized)) return "configure_sections";
  if (["readiness", "readiness_publish", "review", "review_publish", "publish"].includes(normalized)) return "readiness_publish";
  if (["delivery", "policy", "schedule", "sessions", "participants"].includes(normalized)) return "delivery";
  if (["operations", "live", "attempts"].includes(normalized)) return "operations";
  if (["results", "release"].includes(normalized)) return "results";
  return null;
}

/**
 * Produces the canonical, server-consumable Tryout workflow state.
 *
 * Draft navigation is a monotonic prefix of Overview → Configure Sections →
 * Readiness & Publish. Published navigation is a monotonic prefix of Delivery
 * → Operations → Results. Live is deliberately not a primary step: its gate
 * is the session's derived runtime eligibility.
 */
function projectTryoutWorkflow(input: TryoutWorkflowProjectionInput): TryoutWorkflowProjection {
  const mode = modeFrom(input);
  const session = input.session ?? null;
  const liveAvailable = mode === "published" && session !== null && sessionIsRuntimeEligible(session);
  const resultsAvailable = mode === "published" && session !== null && sessionHasResultActivity(session);
  const operationsAvailable = mode === "published" && session !== null && sessionHasOpened(session);
  const readiness = draftReadinessFrom(input);
  const blockers = blankBlockers();
  const providedBlockers = { ...input.draft?.blockers, ...input.blockers };

  addModeBlockers(blockers, mode);
  if (mode === "draft") {
    blockers.overview = readiness.overviewReady
      ? (providedBlockers.overview?.map((issue) => typeof issue === "string" ? { code: "workflow_blocked", message: issue } : { ...issue }) ?? [])
      : normalizeIssues(providedBlockers.overview, {
          code: "overview_incomplete",
          message: "Lengkapi judul dan identitas Tryout di bagian ringkasan.",
          target: "overview",
        });
    blockers.configure_sections = readiness.configureSectionsReady
      ? (providedBlockers.configure_sections?.map((issue) => typeof issue === "string" ? { code: "workflow_blocked", message: issue } : { ...issue }) ?? [])
      : normalizeIssues(providedBlockers.configure_sections, {
          code: "configure_sections_incomplete",
          message: "Lengkapi sumber soal, durasi, dan aturan setiap bagian Tryout.",
          target: "configure_sections",
        });
    blockers.readiness_publish = readiness.readinessPublishReady
      ? (providedBlockers.readiness_publish?.map((issue) => typeof issue === "string" ? { code: "workflow_blocked", message: issue } : { ...issue }) ?? [])
      : normalizeIssues(providedBlockers.readiness_publish, {
          code: "readiness_incomplete",
          message: "Periksa kesiapan Tryout sebelum menerbitkannya.",
          target: "readiness_publish",
        });
  } else {
    blockers.operations = operationsAvailable ? [] : normalizeIssues(providedBlockers.operations, {
      code: "operations_unavailable",
      message: "Buka sesi terlebih dahulu untuk mengelola Tryout.",
      target: "delivery",
    });
    blockers.live = liveAvailable ? [] : normalizeIssues(providedBlockers.live, {
      code: "live_unavailable",
      message: "Sesi harus aktif dan sudah siap untuk mulai memantau.",
      target: "operations",
    });
    blockers.results = resultsAvailable ? [] : normalizeIssues(providedBlockers.results, {
      code: "results_unavailable",
      message: "Hasil tersedia setelah sesi ditutup atau pengerjaan peserta berakhir.",
      target: operationsAvailable ? "operations" : "delivery",
    });
  }

  const allowedSteps: TryoutWorkflowStep[] = mode === "draft"
    ? readiness.overviewReady
      ? readiness.configureSectionsReady
        ? [...DRAFT_STEPS]
        : DRAFT_STEPS.slice(0, 2)
      : DRAFT_STEPS.slice(0, 1)
    : [
        "delivery",
        ...(operationsAvailable ? ["operations" as const] : []),
        ...(resultsAvailable ? ["results" as const] : []),
      ];
  const completedSteps: TryoutWorkflowStep[] = mode === "draft"
    ? [
        ...(readiness.overviewReady ? ["overview" as const] : []),
        ...(readiness.overviewReady && readiness.configureSectionsReady ? ["configure_sections" as const] : []),
        ...(readiness.overviewReady && readiness.configureSectionsReady && readiness.readinessPublishReady ? ["readiness_publish" as const] : []),
      ]
    : [
        "delivery",
        ...(operationsAvailable ? ["operations" as const] : []),
        ...(resultsAvailable ? ["results" as const] : []),
      ];
  const defaultStep: TryoutWorkflowStep = mode === "draft"
    ? !readiness.overviewReady
      ? "overview"
      : !readiness.configureSectionsReady
        ? "configure_sections"
        : "readiness_publish"
    : !operationsAvailable
      ? "delivery"
      : !resultsAvailable
        ? "operations"
        : "results";
  const requestedStep = normalizeTryoutWorkflowStep(requestedStepFrom(input));
  const currentStep = requestedStep && allowedSteps.includes(requestedStep)
    ? requestedStep
    : defaultStep;
  const stepWasNormalized = requestedStep !== currentStep;
  const recommendedNextAction = recommendedAction(
    input,
    mode,
    readiness,
    operationsAvailable,
    resultsAvailable,
    liveAvailable,
  );

  return {
    allowedSteps,
    blockers,
    completedSteps,
    currentStep,
    defaultStep,
    liveAvailable,
    mode,
    normalizedQuery: {
      requestedStep: requestedStepFrom(input),
      stepWasNormalized,
    },
    operationsAvailable,
    recommendedNextAction,
    resultsAvailable,
  };
}

const deriveTryoutWorkflowProjection = projectTryoutWorkflow;
const getTryoutWorkflowProjection = projectTryoutWorkflow;

export {
  DRAFT_STEPS,
  PUBLISHED_STEPS,
  deriveTryoutWorkflowProjection,
  getTryoutWorkflowProjection,
  normalizeTryoutWorkflowStep,
  projectTryoutWorkflow,
};

export type {
  TryoutWorkflowAttempt,
  TryoutWorkflowBlockerKey,
  TryoutWorkflowDraftReadiness,
  TryoutWorkflowIssue,
  TryoutWorkflowIssueInput,
  TryoutWorkflowMode,
  TryoutWorkflowProjection,
  TryoutWorkflowProjectionInput,
  TryoutWorkflowRecommendedAction,
  TryoutWorkflowSession,
  TryoutWorkflowSessionStatus,
  TryoutWorkflowStep,
  TryoutWorkflowDraftStep,
  TryoutWorkflowPublishedStep,
  TryoutWorkflowQuery,
};
