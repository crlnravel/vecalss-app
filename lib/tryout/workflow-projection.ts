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
  session?: string | null;
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
  requestedSessionId?: string | null;
  requestedStep?: string | null;
  sectionsReady?: boolean;
  sessions?: readonly TryoutWorkflowSession[];
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

type TryoutWorkflowSessionSelectionReason = "first_session" | "none" | "recommended" | "requested";

type TryoutWorkflowProjection = {
  allowedSteps: TryoutWorkflowStep[];
  blockers: Record<TryoutWorkflowBlockerKey, TryoutWorkflowIssue[]>;
  completedSteps: TryoutWorkflowStep[];
  currentStep: TryoutWorkflowStep;
  defaultStep: TryoutWorkflowStep;
  liveAvailable: boolean;
  liveEligibleSessionIds: string[];
  mode: TryoutWorkflowMode;
  normalizedQuery: {
    requestedSessionId: string | null;
    requestedStep: string | null;
    selectedSessionId: string | null;
    selectedSessionWasNormalized: boolean;
    stepWasNormalized: boolean;
  };
  operationsAvailable: boolean;
  recommendedNextAction: TryoutWorkflowRecommendedAction | null;
  resultEligibleSessionIds: string[];
  resultsAvailable: boolean;
  runtimeEligibleSessionIds: string[];
  selectedSessionId: string | null;
  selectedSessionRuntimeEligible: boolean;
};

type TryoutSessionSelection = {
  normalized: boolean;
  reason: TryoutWorkflowSessionSelectionReason;
  requestedSessionId: string | null;
  selectedSessionId: string | null;
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

function uniqueSessionIds(sessions: readonly TryoutWorkflowSession[]) {
  return [...new Set(sessions.map((session) => asTrimmedString(session.id)).filter((id): id is string => Boolean(id)))];
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
    message: "Area authoring hanya tersedia pada Draf perubahan baru.",
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

function requestedSessionFrom(input: TryoutWorkflowProjectionInput) {
  return input.requestedSessionId
    ?? input.query?.session
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

function hrefForStep(input: TryoutWorkflowProjectionInput, step: TryoutWorkflowStep, selectedSessionId: string | null) {
  const basePath = asTrimmedString(input.basePath)
    ?? (asTrimmedString(input.tryoutId) ? `/mentor/tryout/${asTrimmedString(input.tryoutId)}` : "");
  const query = new URLSearchParams({ workspace: step });
  if (selectedSessionId && (step === "operations" || step === "results")) query.set("session", selectedSessionId);
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
  selectedSessionId: string | null,
): TryoutWorkflowRecommendedAction | null {
  let step: TryoutWorkflowStep;
  let label: string;
  if (mode === "draft") {
    if (!readiness.overviewReady) {
      step = "overview";
      label = "Lengkapi Overview";
    } else if (!readiness.configureSectionsReady) {
      step = "configure_sections";
      label = "Konfigurasi Sections";
    } else if (!readiness.readinessPublishReady) {
      step = "readiness_publish";
      label = "Tinjau Readiness & Publish";
    } else {
      step = "readiness_publish";
      label = "Terbitkan Tryout";
    }
  } else if (!operationsAvailable) {
    step = "delivery";
    label = "Buka Delivery untuk membuat sesi";
  } else if (!resultsAvailable) {
    step = "operations";
    label = liveAvailable ? "Pantau Live" : "Periksa Operations";
  } else {
    step = "results";
    label = "Tinjau Results";
  }
  return { href: hrefForStep(input, step, selectedSessionId), label, step };
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
 * Resolves `?session=` without trusting client-side eligibility claims. The
 * caller supplies the authorized session list; an invalid/stale ID falls back
 * to the first preferred eligible session, then the first authorized session.
 */
function normalizeSelectedSessionId(
  requestedSessionId: string | null | undefined,
  sessions: readonly TryoutWorkflowSession[],
  preferredSessionIds: readonly string[] = [],
) {
  const ids = uniqueSessionIds(sessions);
  const requested = asTrimmedString(requestedSessionId);
  if (requested && ids.includes(requested)) return requested;
  const preferred = preferredSessionIds.find((id) => ids.includes(id));
  return preferred ?? ids[0] ?? null;
}

function normalizeTryoutSessionSelection(
  requestedSessionId: string | null | undefined,
  sessions: readonly TryoutWorkflowSession[],
  preferredSessionIds: readonly string[] = [],
): TryoutSessionSelection {
  const requested = asTrimmedString(requestedSessionId);
  const selectedSessionId = normalizeSelectedSessionId(requested, sessions, preferredSessionIds);
  return {
    normalized: requested !== selectedSessionId,
    reason: requested && requested === selectedSessionId
      ? "requested"
      : selectedSessionId && preferredSessionIds.includes(selectedSessionId)
        ? "recommended"
        : selectedSessionId
          ? "first_session"
          : "none",
    requestedSessionId: requested,
    selectedSessionId,
  };
}

/**
 * Produces the canonical, server-consumable Tryout workflow state.
 *
 * Draft navigation is a monotonic prefix of Overview → Configure Sections →
 * Readiness & Publish. Published navigation is a monotonic prefix of Delivery
 * → Operations → Results. Live is deliberately not a primary step: its gate
 * is the selected session's derived runtime eligibility.
 */
function projectTryoutWorkflow(input: TryoutWorkflowProjectionInput): TryoutWorkflowProjection {
  const mode = modeFrom(input);
  const sessions = input.sessions ?? [];
  const liveEligibleSessionIds = mode === "published" ? sessions
    .filter(sessionIsRuntimeEligible)
    .map((session) => asTrimmedString(session.id))
    .filter((id): id is string => Boolean(id)) : [];
  const resultEligibleSessionIds = mode === "published" ? sessions
    .filter(sessionHasResultActivity)
    .map((session) => asTrimmedString(session.id))
    .filter((id): id is string => Boolean(id)) : [];
  const operationsAvailable = mode === "published" && sessions.some(sessionHasOpened);
  const resultsAvailable = resultEligibleSessionIds.length > 0;
  const requestedSessionId = requestedSessionFrom(input);
  const sessionSelection = normalizeTryoutSessionSelection(requestedSessionId, sessions, resultEligibleSessionIds);
  const selectedSessionRuntimeEligible = sessionSelection.selectedSessionId !== null
    && liveEligibleSessionIds.includes(sessionSelection.selectedSessionId);
  const readiness = draftReadinessFrom(input);
  const blockers = blankBlockers();
  const providedBlockers = { ...input.draft?.blockers, ...input.blockers };

  addModeBlockers(blockers, mode);
  if (mode === "draft") {
    blockers.overview = readiness.overviewReady
      ? (providedBlockers.overview?.map((issue) => typeof issue === "string" ? { code: "workflow_blocked", message: issue } : { ...issue }) ?? [])
      : normalizeIssues(providedBlockers.overview, {
          code: "overview_incomplete",
          message: "Lengkapi judul dan identitas Tryout di Overview.",
          target: "overview",
        });
    blockers.configure_sections = readiness.configureSectionsReady
      ? (providedBlockers.configure_sections?.map((issue) => typeof issue === "string" ? { code: "workflow_blocked", message: issue } : { ...issue }) ?? [])
      : normalizeIssues(providedBlockers.configure_sections, {
          code: "configure_sections_incomplete",
          message: "Lengkapi sumber, durasi, dan aturan setiap Section.",
          target: "configure_sections",
        });
    blockers.readiness_publish = readiness.readinessPublishReady
      ? (providedBlockers.readiness_publish?.map((issue) => typeof issue === "string" ? { code: "workflow_blocked", message: issue } : { ...issue }) ?? [])
      : normalizeIssues(providedBlockers.readiness_publish, {
          code: "readiness_incomplete",
          message: "Periksa Readiness & Publish sebelum menerbitkan Tryout.",
          target: "readiness_publish",
        });
  } else {
    blockers.operations = operationsAvailable ? [] : normalizeIssues(providedBlockers.operations, {
      code: "operations_unavailable",
      message: "Buat atau buka sesi terlebih dahulu untuk membuka Operations.",
      target: "delivery",
    });
    blockers.live = selectedSessionRuntimeEligible ? [] : normalizeIssues(providedBlockers.live, {
      code: "live_unavailable",
      message: "Pilih sesi aktif yang sudah terikat AssessmentRelease untuk membuka Live.",
      target: "operations",
    });
    blockers.results = resultsAvailable ? [] : normalizeIssues(providedBlockers.results, {
      code: "results_unavailable",
      message: "Results terbuka setelah sesi ditutup atau ada aktivitas attempt terminal/scored.",
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
    selectedSessionRuntimeEligible,
    sessionSelection.selectedSessionId,
  );

  return {
    allowedSteps,
    blockers,
    completedSteps,
    currentStep,
    defaultStep,
    liveAvailable: selectedSessionRuntimeEligible,
    liveEligibleSessionIds,
    mode,
    normalizedQuery: {
      requestedSessionId: sessionSelection.requestedSessionId,
      requestedStep: requestedStepFrom(input),
      selectedSessionId: sessionSelection.selectedSessionId,
      selectedSessionWasNormalized: sessionSelection.normalized,
      stepWasNormalized,
    },
    operationsAvailable,
    recommendedNextAction,
    resultEligibleSessionIds,
    resultsAvailable,
    runtimeEligibleSessionIds: [...liveEligibleSessionIds],
    selectedSessionId: sessionSelection.selectedSessionId,
    selectedSessionRuntimeEligible,
  };
}

const deriveTryoutWorkflowProjection = projectTryoutWorkflow;
const getTryoutWorkflowProjection = projectTryoutWorkflow;

export {
  DRAFT_STEPS,
  PUBLISHED_STEPS,
  deriveTryoutWorkflowProjection,
  getTryoutWorkflowProjection,
  normalizeSelectedSessionId,
  normalizeTryoutSessionSelection,
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
  TryoutSessionSelection,
};
