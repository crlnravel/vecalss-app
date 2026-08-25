const KUIS_VERSION_STATES = ["draft", "active", "superseded"] as const;
const KUIS_VERSION_PROVENANCES = ["runtime", "legacy_migration"] as const;

type KuisVersionState = (typeof KUIS_VERSION_STATES)[number];
type KuisVersionProvenance = (typeof KUIS_VERSION_PROVENANCES)[number];

type KuisVersionLifecycleLike = {
  state: KuisVersionState;
};

type KuisVersionSummary = {
  definitionDigest: string | null;
  id: string;
  publishedAt: string | null;
  publishedByUserId: string | null;
  provenance: KuisVersionProvenance;
  state: KuisVersionState;
  versionNo: number | null;
};

type KuisVersionLabel = {
  isActive: boolean;
  isLegacyPublication: boolean;
  label: string;
  publicationDate: string | null;
  provenance: KuisVersionProvenance;
  state: KuisVersionState;
  versionNo: number | null;
  versionId: string;
};

function isKuisVersionState(value: unknown): value is KuisVersionState {
  return typeof value === "string" && KUIS_VERSION_STATES.includes(value as KuisVersionState);
}

function versionStateOf(value: unknown) {
  return value && typeof value === "object" && "state" in value
    ? (value as { state?: unknown }).state
    : undefined;
}

function isKuisVersionDraft(value: unknown): value is KuisVersionLifecycleLike & { state: "draft" } {
  return versionStateOf(value) === "draft";
}

function isKuisVersionActive(value: unknown): value is KuisVersionLifecycleLike & { state: "active" } {
  return versionStateOf(value) === "active";
}

function isKuisVersionSuperseded(value: unknown): value is KuisVersionLifecycleLike & { state: "superseded" } {
  return versionStateOf(value) === "superseded";
}

function isPublishedKuisVersion(value: unknown): value is KuisVersionLifecycleLike & { state: "active" | "superseded" } {
  return isKuisVersionActive(value) || isKuisVersionSuperseded(value);
}

function isValidKuisVersionNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function canTransitionKuisVersion(from: KuisVersionState, to: KuisVersionState) {
  return from === "draft" && to === "active"
    || from === "active" && to === "superseded";
}

function transitionKuisVersion(from: KuisVersionState, to: KuisVersionState) {
  if (!canTransitionKuisVersion(from, to)) {
    throw new Error(`Invalid Kuis version transition: ${from} -> ${to}.`);
  }
  return to;
}

function kuisVersionLabel(versionNo: number | null, state: KuisVersionState) {
  if (!isValidKuisVersionNumber(versionNo)) return state === "draft" ? "Draf baru" : "Versi lama";
  return `Versi ${versionNo}${state === "active" ? " aktif" : ""}`;
}

function toKuisVersionLabel(version: KuisVersionSummary): KuisVersionLabel {
  return {
    isActive: version.state === "active",
    isLegacyPublication: version.provenance === "legacy_migration",
    label: kuisVersionLabel(version.versionNo, version.state),
    publicationDate: version.publishedAt,
    provenance: version.provenance,
    state: version.state,
    versionId: version.id,
    versionNo: version.versionNo,
  };
}

export {
  KUIS_VERSION_PROVENANCES,
  KUIS_VERSION_STATES,
  canTransitionKuisVersion,
  isKuisVersionActive,
  isKuisVersionDraft,
  isKuisVersionState,
  isKuisVersionSuperseded,
  isPublishedKuisVersion,
  isValidKuisVersionNumber,
  kuisVersionLabel,
  toKuisVersionLabel,
  transitionKuisVersion,
};
export type { KuisVersionLabel, KuisVersionLifecycleLike, KuisVersionProvenance, KuisVersionState, KuisVersionSummary };
