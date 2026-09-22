export const VERA_AUTOMATIC_CONTEXT_STATES = [
  "off",
  "internal",
  "cohort",
  "on",
] as const;

export type VeraContextMode = "legacy" | "automatic";
export type VeraAutomaticContextState =
  (typeof VERA_AUTOMATIC_CONTEXT_STATES)[number];
export type VeraAutomaticContextKind = "materi" | "kuis" | "tryout";

export type VeraAutomaticContextAuthority = {
  contextMode: VeraContextMode;
  automaticContext: {
    enabled: boolean;
    state: VeraAutomaticContextState;
    policyVersion: string | null;
  };
};

export type VeraRequestSourceSummary = {
  citationKey: string;
  kind: VeraAutomaticContextKind;
  title: string;
  releasedAt: string | null;
  limitations: string[];
};

export type VeraAutomaticContextEvidenceState =
  | "available"
  | "no_match"
  | "evidence_limited"
  | "unavailable"
  | "failed";

export type VeraAutomaticContextProgressPhase =
  | "selecting"
  | "retrieving"
  | "answering"
  | "complete"
  | "no_match"
  | "evidence_limited"
  | "unavailable";

export type VeraAutomaticContextProgress = {
  phase: VeraAutomaticContextProgressPhase;
  progress: number | null;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function automaticState(value: unknown): VeraAutomaticContextState {
  return typeof value === "string" &&
      (VERA_AUTOMATIC_CONTEXT_STATES as readonly string[]).includes(value)
    ? (value as VeraAutomaticContextState)
    : "off";
}

/**
 * Read the server-owned rollout decision once at the UI boundary. The UI
 * never derives cohort membership from a local flag, URL, or environment.
 * Missing or malformed authority deliberately falls back to the legacy path.
 */
export function readVeraContextAuthority(value: unknown): VeraAutomaticContextAuthority {
  const source = record(value);
  const automatic = record(source?.automaticContext);
  const contextMode = source?.contextMode === "automatic" ? "automatic" : "legacy";
  const stateIsValid =
    typeof automatic?.state === "string" &&
    (VERA_AUTOMATIC_CONTEXT_STATES as readonly string[]).includes(automatic.state);
  const enabled =
    contextMode === "automatic" &&
    automatic?.enabled === true &&
    stateIsValid &&
    automatic.state !== "off";

  return {
    contextMode: enabled ? "automatic" : "legacy",
    automaticContext: {
      enabled,
      state: automaticState(automatic?.state),
      policyVersion: stringValue(automatic?.policyVersion),
    },
  };
}

export function isVeraAutomaticContextEnabled(
  authority: VeraAutomaticContextAuthority,
): boolean {
  return authority.contextMode === "automatic" && authority.automaticContext.enabled;
}

function sourceKind(value: unknown): VeraAutomaticContextKind | null {
  if (value === "materi" || value === "kuis" || value === "tryout") {
    return value;
  }

  // Existing learner DTOs use the legacy sourceType vocabulary. Keep this
  // alias at the DTO boundary; the rendered summary never receives an ID.
  if (value === "material") return "materi";
  if (value === "practice" || value === "quiz") return "kuis";

  return null;
}

function sourceReleasedAt(source: UnknownRecord): string | null {
  const releaseMetadata = record(source.releaseMetadata);
  return (
    stringValue(releaseMetadata?.releasedAt) ??
    stringValue(source.releasedAt) ??
    stringValue(source.releaseAt)
  );
}

function sourceLimitations(source: UnknownRecord): string[] {
  return Array.isArray(source.limitations)
    ? source.limitations.filter(
        (value): value is string => typeof value === "string" && Boolean(value.trim()),
      )
    : [];
}

function normalizeRequestSource(value: unknown): VeraRequestSourceSummary | null {
  const source = record(value);
  if (!source) return null;

  const citationKey = stringValue(source.citationKey) ?? stringValue(source.key);
  const kind = sourceKind(source.kind ?? source.sourceType);
  const title =
    stringValue(source.title) ??
    stringValue(source.titleSnapshot) ??
    stringValue(source.citationLabel);

  // Internal source IDs are intentionally not accepted or copied into the
  // learner DTO. They are persistence authority, never display data.
  if (!citationKey || !kind || !title) return null;

  return {
    citationKey,
    kind,
    title,
    releasedAt: sourceReleasedAt(source),
    limitations: sourceLimitations(source),
  };
}

/**
 * Read committed evidence only. `sources` is supported as a migration read
 * alias; callers must never use this helper to construct a request payload.
 */
export function readVeraRequestSources(value: unknown): VeraRequestSourceSummary[] {
  const source = record(value);
  const candidates = Array.isArray(source?.requestSources)
    ? source.requestSources
    : Array.isArray(source?.sources)
      ? source.sources
      : [];

  return candidates
    .map(normalizeRequestSource)
    .filter((item): item is VeraRequestSourceSummary => item !== null);
}

export function readVeraRequestEvidenceState(
  value: unknown,
): VeraAutomaticContextEvidenceState | null {
  const source = record(value);
  const candidate = source?.contextState ?? source?.evidenceState ?? source?.sourceOutcome;

  if (
    candidate === "available" ||
    candidate === "no_match" ||
    candidate === "evidence_limited" ||
    candidate === "unavailable" ||
    candidate === "failed"
  ) {
    return candidate;
  }

  if (candidate === "limited" || candidate === "truncated") return "evidence_limited";
  if (candidate === "empty") return "no_match";
  return null;
}

function progressPhase(value: unknown): VeraAutomaticContextProgressPhase | null {
  if (
    value === "selecting" ||
    value === "context_selection" ||
    value === "selection" ||
    value === "selector"
  ) {
    return "selecting";
  }
  if (
    value === "retrieving" ||
    value === "context_retrieval" ||
    value === "registry" ||
    value === "retrieval"
  ) {
    return "retrieving";
  }
  if (
    value === "answering" ||
    value === "answer" ||
    value === "final" ||
    value === "final_answer"
  ) {
    return "answering";
  }
  if (value === "complete" || value === "completed" || value === "succeeded") {
    return "complete";
  }
  if (value === "no_match" || value === "empty") return "no_match";
  if (value === "evidence_limited" || value === "limited" || value === "truncated") {
    return "evidence_limited";
  }
  if (value === "unavailable" || value === "failed" || value === "error") {
    return "unavailable";
  }
  return null;
}

export function readVeraAutomaticContextProgress(
  value: unknown,
): VeraAutomaticContextProgress | null {
  const source = record(value);
  if (!source) return null;
  const phase = progressPhase(source.phase ?? source.stage ?? source.contextState ?? source.state);
  if (!phase) return null;

  const rawProgress = source.progress ?? source.percent ?? source.percentage;
  const progress =
    typeof rawProgress === "number" && Number.isFinite(rawProgress)
      ? Math.max(0, Math.min(100, Math.round(rawProgress)))
      : null;

  return { phase, progress };
}
