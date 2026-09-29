import {
  digestKuisAssessmentDefinition,
  type KuisAssessmentDefinition,
  type KuisAssessmentDefinitionInput,
} from "@/lib/quiz/versioning-digest";
import {
  isKuisVersionActive,
  isPublishedKuisVersion,
  isValidKuisVersionNumber,
  toKuisVersionLabel,
  type KuisVersionLabel,
  type KuisVersionProvenance,
  type KuisVersionSummary,
} from "@/lib/quiz/versioning-lifecycle";

type KuisOperationalStatus = "archived" | "published";
type KuisScheduleAvailability = "archived" | "available" | "closed" | "scheduled";

type KuisVersionProjectionRecord = KuisVersionSummary & KuisAssessmentDefinition & {
  baseVersionId?: string | null;
  draftRevision?: number | null;
};

type KuisStableProjection = {
  closesAt: string | null;
  id: string;
  opensAt: string | null;
  operationalRevision: number;
  slug: string;
  status: KuisOperationalStatus;
  subjectCode: string;
};

type KuisActiveVersionSummary = {
  definitionDigest: string | null;
  id: string;
  label: string;
  publishedAt: string | null;
  publishedByUserId: string | null;
  provenance: KuisVersionProvenance;
  questionCount: number;
  title: string;
  versionNo: number;
};

type KuisEditableProjection = KuisAssessmentDefinition & {
  draftRevision: number | null;
  source: "active" | "initial_draft" | "working_draft";
  versionId: string | null;
  versionNo: number | null;
};

type KuisDraftRevision = {
  baseVersionId: string | null;
  hasUnpublishedChanges: boolean;
  id: string;
  isInitial: boolean;
  label: "Ada perubahan belum diterbitkan" | null;
  revision: number;
};

type KuisEditorActionProjection = {
  archive: {
    enabled: boolean;
    label: "Arsipkan Kuis";
    visible: boolean;
  };
  discard: {
    enabled: boolean;
    label: "Buang perubahan";
    visible: boolean;
  };
  history: {
    label: "Riwayat versi";
    visible: boolean;
  };
};

type KuisEditorProjection = {
  actions: KuisEditorActionProjection;
  activeVersion: KuisActiveVersionSummary | null;
  draftRevision: KuisDraftRevision | null;
  editable: KuisEditableProjection | null;
  hasUnpublishedChanges: boolean;
  stable: KuisStableProjection;
  versionHistory: KuisVersionLabel[];
};

type KuisEditorProjectionInput = {
  activeVersion?: KuisVersionProjectionRecord | null;
  draft?: KuisVersionProjectionRecord | null;
  initialDraft?: KuisAssessmentDefinitionInput | null;
  quiz: KuisStableProjection;
  versions?: readonly KuisVersionProjectionRecord[];
};

type KuisCatalogueProjection = {
  activeVersionLabel: string | null;
  activeVersionNo: number | null;
  availability: KuisScheduleAvailability;
  description: string;
  editingTitle: string;
  hasUnpublishedChanges: boolean;
  id: string;
  learnerTitle: string;
  questionCount: number;
  archiveEligible: boolean;
  slug: string;
  subjectCode: string;
  title: string;
  versionLabel: string | null;
};

type KuisStudentParticipationProjection = {
  attemptsAllowed: number | null;
  attemptsUsed: number;
  completed: boolean;
  score: number | null;
  versionId: string;
};

type KuisStudentOpportunityState = "available" | "completed" | "unavailable" | "updated";

type KuisStudentOpportunityProjection = {
  activeVersion: KuisActiveVersionSummary | null;
  activeVersionLabel: string | null;
  canStart: boolean;
  hasPriorCompletion: boolean;
  history: KuisStudentParticipationProjection[];
  quizId: string;
  state: KuisStudentOpportunityState;
  unavailableReason: "archived" | "attempts_exhausted" | "closed" | "not_ready" | "scheduled" | null;
};

type KuisStudentOpportunityInput = {
  activeVersion?: KuisVersionProjectionRecord | null;
  now: string | Date;
  participations?: readonly KuisStudentParticipationProjection[];
  quiz: Pick<KuisStableProjection, "closesAt" | "id" | "opensAt" | "status">;
};

type KuisResultAttemptInput = {
  attemptNo: number;
  id: string;
  score: number | null;
  status: string;
  submittedAt: string | null;
  versionId: string;
  versionNo?: number | null;
  versionProvenance?: KuisVersionProvenance;
  versionPublishedAt?: string | null;
};

type KuisResultAttemptProjection = KuisResultAttemptInput & {
  versionLabel: KuisVersionLabel;
};

type KuisVersionStatistics = {
  averageScore: number | null;
  completedCount: number;
  highestScore: number | null;
  scoredCount: number;
};

type KuisResultVersionGroup = {
  attempts: KuisResultAttemptProjection[];
  statistics: KuisVersionStatistics;
  version: KuisVersionLabel;
};

type KuisResultsProjection = {
  groups: KuisResultVersionGroup[];
  quizId: string;
  selectedVersionId: string | null;
  statisticsScope: "per_version";
  versionFilter: string | null;
};

type KuisResultsProjectionInput = {
  attempts: readonly KuisResultAttemptInput[];
  quizId: string;
  selectedVersionId?: string | null;
  versions: readonly KuisVersionProjectionRecord[];
};

function asDate(value: string | Date, name: string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date.`);
  return date;
}

function isScheduleBeforeOpen(opensAt: string | null, now: Date) {
  return Boolean(opensAt && asDate(opensAt, "opensAt").getTime() > now.getTime());
}

function isScheduleClosed(closesAt: string | null, now: Date) {
  return Boolean(closesAt && asDate(closesAt, "closesAt").getTime() <= now.getTime());
}

function activeVersionSummary(version: KuisVersionProjectionRecord | null | undefined): KuisActiveVersionSummary | null {
  if (!version || !isKuisVersionActive(version) || !isValidKuisVersionNumber(version.versionNo)) return null;
  const label = toKuisVersionLabel(version);
  return {
    definitionDigest: version.definitionDigest,
    id: version.id,
    label: label.label,
    publishedAt: version.publishedAt,
    publishedByUserId: version.publishedByUserId,
    provenance: version.provenance,
    questionCount: version.questions.length,
    title: version.title,
    versionNo: version.versionNo,
  };
}

function definitionFromVersion(version: KuisVersionProjectionRecord): KuisAssessmentDefinition {
  return {
    assembly: version.assembly,
    attemptsAllowed: version.attemptsAllowed,
    correctAnswerVisibility: version.correctAnswerVisibility,
    description: version.description,
    durationSeconds: version.durationSeconds,
    formBehavior: version.formBehavior,
    questions: version.questions,
    retryDelaySeconds: version.retryDelaySeconds,
    reviewTiming: version.reviewTiming,
    scorePolicy: version.scorePolicy,
    sourceBankId: version.sourceBankId,
    title: version.title,
  };
}

function editableFromVersion(version: KuisVersionProjectionRecord, source: KuisEditableProjection["source"]): KuisEditableProjection {
  return {
    ...definitionFromVersion(version),
    draftRevision: version.draftRevision ?? null,
    source,
    versionId: version.id,
    versionNo: version.versionNo,
  };
}

function editableFromInitialDraft(definition: KuisAssessmentDefinitionInput): KuisEditableProjection {
  return {
    ...({
      assembly: {
        definitionDigest: definition.assembly?.definitionDigest ?? definition.assemblyDefinitionDigest ?? null,
        mode: definition.assembly?.mode ?? definition.assemblyMode ?? null,
        packageVersionId: definition.assembly?.packageVersionId ?? definition.assemblyPackageVersionId ?? null,
        seed: definition.assembly?.seed ?? definition.assemblySeed ?? null,
      },
      attemptsAllowed: definition.attemptsAllowed === undefined ? 1 : definition.attemptsAllowed,
      correctAnswerVisibility: definition.correctAnswerVisibility ?? "show",
      description: definition.description,
      durationSeconds: definition.durationSeconds ?? null,
      formBehavior: definition.formBehavior ?? "same",
      questions: definition.questions,
      retryDelaySeconds: definition.retryDelaySeconds ?? null,
      reviewTiming: definition.reviewTiming ?? "immediate",
      scorePolicy: definition.scorePolicy ?? "latest",
      sourceBankId: definition.sourceBankId ?? null,
      title: definition.title,
    } satisfies KuisAssessmentDefinition),
    draftRevision: 0,
    source: "initial_draft",
    versionId: null,
    versionNo: null,
  };
}

function versionDefinitionDigest(version: KuisVersionProjectionRecord) {
  return version.definitionDigest ?? digestKuisAssessmentDefinition(definitionFromVersion(version));
}

function hasDraftChanges(active: KuisVersionProjectionRecord | null, draft: KuisVersionProjectionRecord | null) {
  if (!draft || !active) return false;
  return versionDefinitionDigest(active) !== versionDefinitionDigest(draft);
}

function historyVersions(input: KuisEditorProjectionInput) {
  const versions = input.versions?.length
    ? input.versions
    : [input.activeVersion, input.draft].filter((version): version is KuisVersionProjectionRecord => Boolean(version));
  return versions
    .filter(isPublishedKuisVersion)
    .sort((left, right) => (right.versionNo ?? 0) - (left.versionNo ?? 0))
    .map(toKuisVersionLabel);
}

function projectKuisEditor(input: KuisEditorProjectionInput): KuisEditorProjection {
  const active = input.activeVersion && isKuisVersionActive(input.activeVersion) ? input.activeVersion : null;
  const draft = input.draft && input.draft.state === "draft" ? input.draft : null;
  const changed = hasDraftChanges(active, draft);
  const editable = draft
    ? editableFromVersion(draft, "working_draft")
    : active
      ? editableFromVersion(active, "active")
      : input.initialDraft
        ? editableFromInitialDraft(input.initialDraft)
        : null;
  const activeSummary = activeVersionSummary(active);
  const labels = historyVersions({ ...input, activeVersion: active, draft });
  const hasPublishedVersion = Boolean(activeSummary);
  return {
    actions: {
      archive: {
        enabled: input.quiz.status === "published",
        label: "Arsipkan Kuis",
        visible: input.quiz.status === "published",
      },
      discard: {
        enabled: changed,
        label: "Buang perubahan",
        visible: Boolean(draft && hasPublishedVersion && changed),
      },
      history: {
        label: "Riwayat versi",
        visible: labels.length > 0,
      },
    },
    activeVersion: activeSummary,
    draftRevision: draft
      ? {
          baseVersionId: draft.baseVersionId ?? active?.id ?? null,
          hasUnpublishedChanges: changed,
          id: draft.id,
          isInitial: !active,
          label: changed ? "Ada perubahan belum diterbitkan" : null,
          revision: draft.draftRevision ?? 0,
        }
      : null,
    editable,
    hasUnpublishedChanges: changed,
    stable: input.quiz,
    versionHistory: labels,
  };
}

function catalogueAvailability(input: KuisStableProjection, now: Date): KuisScheduleAvailability {
  if (input.status === "archived") return "archived";
  if (isScheduleBeforeOpen(input.opensAt, now)) return "scheduled";
  if (isScheduleClosed(input.closesAt, now)) return "closed";
  return "available";
}

function projectKuisCatalogueRow(input: KuisEditorProjectionInput & { now: string | Date }): KuisCatalogueProjection {
  const editor = projectKuisEditor(input);
  const now = asDate(input.now, "now");
  const editable = editor.editable;
  const active = editor.activeVersion;
  return {
    activeVersionLabel: active?.label ?? null,
    activeVersionNo: active?.versionNo ?? null,
    availability: catalogueAvailability(input.quiz, now),
    description: editable?.description ?? "",
    editingTitle: editable?.title ?? active?.title ?? "",
    hasUnpublishedChanges: editor.hasUnpublishedChanges,
    id: input.quiz.id,
    learnerTitle: active?.title ?? editable?.title ?? "",
    archiveEligible: editor.actions.archive.enabled,
    questionCount: editable?.questions.length ?? active?.questionCount ?? 0,
    slug: input.quiz.slug,
    subjectCode: input.quiz.subjectCode,
    title: editable?.title ?? active?.title ?? "",
    versionLabel: active?.label ?? null,
  };
}

function projectKuisStudentOpportunity(input: KuisStudentOpportunityInput): KuisStudentOpportunityProjection {
  const now = asDate(input.now, "now");
  const history = [...(input.participations ?? [])];
  const active = activeVersionSummary(input.activeVersion);
  const activeParticipation = active ? history.find((participation) => participation.versionId === active.id) : null;
  const hasPriorCompletion = Boolean(active && history.some((participation) => participation.versionId !== active.id && participation.completed));
  let state: KuisStudentOpportunityState = "unavailable";
  let unavailableReason: KuisStudentOpportunityProjection["unavailableReason"] = null;
  if (input.quiz.status === "archived") {
    unavailableReason = "archived";
  } else if (!active) {
    unavailableReason = "not_ready";
  } else if (isScheduleBeforeOpen(input.quiz.opensAt, now)) {
    unavailableReason = "scheduled";
  } else if (isScheduleClosed(input.quiz.closesAt, now)) {
    unavailableReason = "closed";
  } else if (activeParticipation?.completed) {
    state = "completed";
  } else if (activeParticipation?.attemptsAllowed !== null
    && activeParticipation
    && activeParticipation.attemptsUsed >= activeParticipation.attemptsAllowed) {
    unavailableReason = "attempts_exhausted";
  } else {
    state = hasPriorCompletion ? "updated" : "available";
  }
  return {
    activeVersion: active,
    activeVersionLabel: active?.label ?? null,
    canStart: state === "available" || state === "updated",
    hasPriorCompletion,
    history,
    quizId: input.quiz.id,
    state,
    unavailableReason,
  };
}

function versionLabelForAttempt(
  attempt: KuisResultAttemptInput,
  versionsById: Map<string, KuisVersionProjectionRecord>,
): KuisVersionLabel {
  const known = versionsById.get(attempt.versionId);
  if (known && isPublishedKuisVersion(known)) return toKuisVersionLabel(known);
  const versionNo = attempt.versionNo ?? null;
  return {
    isActive: false,
    isLegacyPublication: attempt.versionProvenance === "legacy_migration" || !known,
    label: isValidKuisVersionNumber(versionNo) ? `Versi ${versionNo}` : "Versi lama",
    publicationDate: attempt.versionPublishedAt ?? null,
    provenance: attempt.versionProvenance ?? "legacy_migration",
    state: "superseded",
    versionId: attempt.versionId,
    versionNo,
  };
}

function resultStatistics(attempts: readonly KuisResultAttemptProjection[]): KuisVersionStatistics {
  const scored = attempts.map((attempt) => attempt.score).filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return {
    averageScore: scored.length ? scored.reduce((sum, score) => sum + score, 0) / scored.length : null,
    completedCount: attempts.filter((attempt) => ["submitted", "auto_submitted", "scored"].includes(attempt.status)).length,
    highestScore: scored.length ? Math.max(...scored) : null,
    scoredCount: scored.length,
  };
}

function projectKuisResults(input: KuisResultsProjectionInput): KuisResultsProjection {
  const versionsById = new Map(input.versions.map((version) => [version.id, version]));
  const attempts = input.attempts.map((attempt) => ({
    ...attempt,
    versionLabel: versionLabelForAttempt(attempt, versionsById),
  }));
  const groupsByVersion = new Map<string, { attempts: KuisResultAttemptProjection[]; version: KuisVersionLabel }>();
  for (const version of input.versions) {
    if (!isPublishedKuisVersion(version)) continue;
    groupsByVersion.set(version.id, { attempts: [], version: toKuisVersionLabel(version) });
  }
  for (const attempt of attempts) {
    const group = groupsByVersion.get(attempt.versionId) ?? { attempts: [], version: attempt.versionLabel };
    group.attempts.push(attempt);
    groupsByVersion.set(attempt.versionId, group);
  }
  const groups = [...groupsByVersion.entries()]
    .map(([, group]) => ({
      attempts: group.attempts.sort((left, right) => left.attemptNo - right.attemptNo),
      statistics: resultStatistics(group.attempts),
      version: group.version,
    }))
    .sort((left, right) => (right.version.versionNo ?? 0) - (left.version.versionNo ?? 0));
  const selectedVersionId = input.selectedVersionId && groups.some((group) => group.version.versionId === input.selectedVersionId)
    ? input.selectedVersionId
    : groups.find((group) => group.version.isActive)?.version.versionId ?? groups[0]?.version.versionId ?? null;
  return {
    groups,
    quizId: input.quizId,
    selectedVersionId,
    statisticsScope: "per_version",
    versionFilter: input.selectedVersionId ?? null,
  };
}

export {
  activeVersionSummary,
  projectKuisCatalogueRow,
  projectKuisEditor,
  projectKuisResults,
  projectKuisStudentOpportunity,
};
export type {
  KuisActiveVersionSummary,
  KuisCatalogueProjection,
  KuisDraftRevision,
  KuisEditableProjection,
  KuisEditorActionProjection,
  KuisEditorProjection,
  KuisEditorProjectionInput,
  KuisOperationalStatus,
  KuisResultAttemptInput,
  KuisResultAttemptProjection,
  KuisResultVersionGroup,
  KuisResultsProjection,
  KuisResultsProjectionInput,
  KuisScheduleAvailability,
  KuisStableProjection,
  KuisStudentOpportunityInput,
  KuisStudentOpportunityProjection,
  KuisStudentOpportunityState,
  KuisStudentParticipationProjection,
  KuisVersionProjectionRecord,
  KuisVersionStatistics,
};
