import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  canTransitionKuisVersion,
  digestKuisAssessmentDefinition,
  isKuisVersionActive,
  isKuisVersionDraft,
  isKuisVersionSuperseded,
  normalizeKuisAssessmentDefinition,
  projectKuisCatalogueRow,
  projectKuisEditor,
  projectKuisResults,
  projectKuisStudentOpportunity,
  rescheduleKuisAfterCloseResults,
  toKuisVersionLabel,
  transitionKuisAfterCloseResult,
  transitionKuisVersion,
  type KuisAssessmentDefinitionInput,
  type KuisVersionProjectionRecord,
} from "../lib/quiz/versioning";

const question = {
  choices: [
    { id: "choice-a", mediaAssetId: null, text: "Pilihan A" },
    { id: "choice-b", mediaAssetId: "asset-choice-b", text: "Pilihan B" },
  ],
  correctChoiceId: "choice-b",
  explanation: "Karena B.",
  explanationMediaAssetId: "asset-explanation",
  id: "question-1",
  origin: "bank" as const,
  prompt: "Pilih jawaban yang tepat.",
  promptMediaAssetId: "asset-prompt",
  sourceContentDigest: "question-content-v1",
  sourceQuestionId: "source-question-1",
  sourceQuestionRevisionId: "source-revision-1",
  sourceRevisionProvenance: "authored" as const,
};
const secondQuestion = {
  ...question,
  id: "question-2",
  prompt: "Pilih jawaban kedua yang tepat.",
  sourceContentDigest: "question-content-v2",
  sourceQuestionId: "source-question-2",
  sourceQuestionRevisionId: "source-revision-2",
};

const definition: KuisAssessmentDefinitionInput = {
  assemblyDefinitionDigest: "assembly-digest-v1",
  assemblyMode: "fixed_set",
  assemblyPackageVersionId: "package-version-1",
  assemblySeed: "seed-1",
  attemptsAllowed: 2,
  closesAt: "2026-10-01T00:00:00.000Z",
  correctAnswerVisibility: "show",
  description: "Latihan singkat.",
  formBehavior: "same",
  opensAt: "2026-09-01T00:00:00.000Z",
  questions: [question, secondQuestion],
  retryDelaySeconds: 60,
  reviewTiming: "after_close",
  scorePolicy: "highest",
  sourceBankId: "bank-1",
  status: "published",
  title: "Kuis Dasar",
  visibility: "visible",
};
const normalizedDefinition = normalizeKuisAssessmentDefinition(definition);

const reorderedDefinition: KuisAssessmentDefinitionInput = {
  title: definition.title,
  visibility: "hidden",
  sourceBankId: definition.sourceBankId,
  scorePolicy: definition.scorePolicy,
  questions: definition.questions,
  status: "draft",
  opensAt: "2027-01-01T00:00:00.000Z",
  reviewTiming: definition.reviewTiming,
  description: definition.description,
  formBehavior: definition.formBehavior,
  retryDelaySeconds: definition.retryDelaySeconds,
  attemptsAllowed: definition.attemptsAllowed,
  assemblySeed: definition.assemblySeed,
  assemblyMode: definition.assemblyMode,
  assemblyPackageVersionId: definition.assemblyPackageVersionId,
  assemblyDefinitionDigest: definition.assemblyDefinitionDigest,
  closesAt: "2027-02-01T00:00:00.000Z",
  correctAnswerVisibility: definition.correctAnswerVisibility,
};

assert.equal(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition(reorderedDefinition),
  "definition digest must ignore object insertion order and schedule/visibility",
);
assert.notEqual(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({ ...definition, title: "Kuis Berubah" }),
  "title is a versioned field",
);
assert.notEqual(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({ ...definition, questions: [{ ...question, promptMediaAssetId: "asset-prompt-2" }] }),
  "prompt media identity is versioned",
);
assert.notEqual(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({ ...definition, questions: [{ ...question, sourceContentDigest: "question-content-v2" }] }),
  "source revision digest is versioned",
);
assert.notEqual(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({ ...definition, questions: [{ ...question, choices: [...question.choices].reverse() }] }),
  "choice order is versioned",
);
assert.notEqual(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({ ...definition, questions: [...definition.questions].reverse() }),
  "question order is versioned",
);
assert.notEqual(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({ ...definition, assemblySeed: "seed-2" }),
  "assembly identity is versioned",
);
assert.equal(
  digestKuisAssessmentDefinition(definition),
  digestKuisAssessmentDefinition({
    ...definition,
    questions: definition.questions.map((candidate, questionIndex) => ({
      ...candidate,
      id: `cloned-question-${questionIndex}`,
      choices: candidate.choices.map((choice, choiceIndex) => ({
        ...choice,
        id: `cloned-choice-${questionIndex}-${choiceIndex}`,
      })),
      correctChoiceId: `cloned-choice-${questionIndex}-1`,
    })),
  }),
  "generated item and choice IDs are not semantic version identity",
);

assert.equal(isKuisVersionDraft({ state: "draft" }), true);
assert.equal(isKuisVersionActive({ state: "active" }), true);
assert.equal(isKuisVersionSuperseded({ state: "superseded" }), true);
assert.equal(canTransitionKuisVersion("draft", "active"), true);
assert.equal(canTransitionKuisVersion("active", "superseded"), true);
assert.equal(canTransitionKuisVersion("superseded", "active"), false);
assert.equal(transitionKuisVersion("draft", "active"), "active");
assert.throws(() => transitionKuisVersion("draft", "superseded"), /Invalid Kuis version transition/u);

function version(
  id: string,
  state: KuisVersionProjectionRecord["state"],
  versionNo: number | null,
  overrides: Partial<KuisVersionProjectionRecord> = {},
): KuisVersionProjectionRecord {
  return {
    ...normalizedDefinition,
    assembly: {
      definitionDigest: definition.assemblyDefinitionDigest ?? null,
      mode: definition.assemblyMode ?? null,
      packageVersionId: definition.assemblyPackageVersionId ?? null,
      seed: definition.assemblySeed ?? null,
    },
    definitionDigest: digestKuisAssessmentDefinition(definition),
    draftRevision: state === "draft" ? 3 : null,
    id,
    publishedAt: state === "draft" ? null : "2026-08-25T10:00:00.000Z",
    publishedByUserId: state === "draft" ? null : "tutor-1",
    provenance: "runtime",
    questions: [question],
    state,
    versionNo,
    ...overrides,
  };
}

const quiz = {
  closesAt: "2026-12-31T00:00:00.000Z",
  id: "quiz-1",
  opensAt: "2026-08-01T00:00:00.000Z",
  operationalRevision: 4,
  slug: "kuis-dasar",
  status: "published" as const,
  subjectCode: "PU",
};
const active = version("version-2", "active", 2);
const superseded = version("version-1", "superseded", 1, {
  publishedAt: null,
  provenance: "legacy_migration",
});
const draft = version("draft-2", "draft", null, {
  baseVersionId: active.id,
  definitionDigest: digestKuisAssessmentDefinition({ ...definition, title: "Kuis Dasar revisi" }),
  title: "Kuis Dasar revisi",
});

const activeOnly = projectKuisEditor({ quiz, activeVersion: active, versions: [superseded, active] });
assert.equal(activeOnly.activeVersion?.label, "Versi 2 aktif");
assert.equal(activeOnly.hasUnpublishedChanges, false);
assert.equal(activeOnly.actions.publish.visible, false);
assert.equal(activeOnly.actions.history.visible, true);
assert.equal(activeOnly.versionHistory[1]?.publicationDate, null, "legacy history must not invent a date");

const withDraft = projectKuisEditor({ draft, quiz, activeVersion: active, versions: [superseded, active] });
assert.equal(withDraft.hasUnpublishedChanges, true);
assert.equal(withDraft.draftRevision?.label, "Ada perubahan belum diterbitkan");
assert.equal(withDraft.actions.publish.label, "Terbitkan perubahan");
assert.equal(withDraft.actions.publish.enabled, true);
assert.equal(withDraft.actions.discard.visible, true);
assert.equal(withDraft.editable?.source, "working_draft");
assert.equal(withDraft.editable?.title, "Kuis Dasar revisi");
assert.equal(withDraft.activeVersion?.title, "Kuis Dasar");

const initial = projectKuisEditor({
  draft: version("draft-1", "draft", null),
  quiz: { ...quiz, status: "draft" },
});
assert.equal(initial.activeVersion, null);
assert.equal(initial.actions.publish.label, "Terbitkan Kuis");
assert.equal(initial.actions.publish.enabled, true);
assert.equal(initial.draftRevision?.isInitial, true);
assert.equal(initial.hasUnpublishedChanges, false);

const hidden = projectKuisEditor({ quiz: { ...quiz, status: "hidden" }, activeVersion: active });
assert.equal(hidden.activeVersion?.label, "Versi 2 aktif", "hidden operational state keeps the active version summary");
assert.equal(hidden.stable.status, "hidden");

const catalogue = projectKuisCatalogueRow({
  draft,
  now: "2026-09-10T00:00:00.000Z",
  quiz,
  activeVersion: active,
});
assert.equal(catalogue.title, "Kuis Dasar revisi");
assert.equal(catalogue.learnerTitle, "Kuis Dasar");
assert.equal(catalogue.activeVersionLabel, "Versi 2 aktif");
assert.equal(catalogue.availability, "available");
assert.equal(catalogue.publishEligible, true);

const opportunity = projectKuisStudentOpportunity({
  activeVersion: active,
  now: "2026-09-10T00:00:00.000Z",
  participations: [{ attemptsAllowed: 1, attemptsUsed: 1, completed: true, score: 80, versionId: superseded.id }],
  quiz,
});
assert.equal(opportunity.state, "updated", "historical completion plus an incomplete active version is an updated opportunity");
assert.equal(opportunity.canStart, true);
assert.equal(opportunity.hasPriorCompletion, true);

const completedOpportunity = projectKuisStudentOpportunity({
  activeVersion: active,
  now: "2026-09-10T00:00:00.000Z",
  participations: [{ attemptsAllowed: 1, attemptsUsed: 1, completed: true, score: 92, versionId: active.id }],
  quiz,
});
assert.equal(completedOpportunity.state, "completed");
assert.equal(completedOpportunity.canStart, false);

const results = projectKuisResults({
  attempts: [
    { attemptNo: 1, id: "attempt-v1", score: 70, status: "scored", submittedAt: "2026-08-20T10:00:00.000Z", versionId: superseded.id },
    { attemptNo: 1, id: "attempt-v2", score: 90, status: "scored", submittedAt: "2026-08-25T11:00:00.000Z", versionId: active.id },
  ],
  quizId: quiz.id,
  versions: [superseded, active],
});
assert.equal(results.statisticsScope, "per_version");
assert.equal(results.groups.length, 2);
assert.deepEqual(results.groups.map((group) => group.version.versionNo), [2, 1]);
assert.equal(results.groups[0]?.statistics.averageScore, 90);
assert.equal(results.groups[1]?.statistics.averageScore, 70);
assert.equal("averageScore" in results, false, "results must not expose a cross-version average");

const scheduled = {
  id: "attempt-1",
  releaseAt: "2026-09-10T00:00:00.000Z",
  releaseState: "scheduled" as const,
  releasedAt: null,
  reviewTiming: "after_close" as const,
  scoringState: "scored" as const,
};
const rescheduled = transitionKuisAfterCloseResult(scheduled, "2026-09-20T00:00:00.000Z", "2026-09-10T12:00:00.000Z");
assert.equal(rescheduled.kind, "rescheduled");
assert.equal(rescheduled.after.releaseAt, "2026-09-20T00:00:00.000Z");
const released = transitionKuisAfterCloseResult(scheduled, "2026-09-09T00:00:00.000Z", "2026-09-10T12:00:00.000Z");
assert.equal(released.kind, "released");
assert.equal(released.after.releaseState, "released");
assert.equal(transitionKuisAfterCloseResult({ ...scheduled, releaseState: "released" }, "2026-09-20T00:00:00.000Z", "2026-09-10T12:00:00.000Z").changed, false);
assert.equal(transitionKuisAfterCloseResult({ ...scheduled, reviewTiming: "immediate" }, "2026-09-20T00:00:00.000Z", "2026-09-10T12:00:00.000Z").changed, false);
assert.equal(rescheduleKuisAfterCloseResults([scheduled], "2026-09-09T00:00:00.000Z", "2026-09-10T12:00:00.000Z").results[0]?.releaseState, "released");

const projectRoot = resolve(import.meta.dirname, "..");
for (const sourcePath of [
  "lib/quiz/versioning.ts",
  "lib/quiz/versioning-digest.ts",
  "lib/quiz/versioning-lifecycle.ts",
  "lib/quiz/versioning-projections.ts",
  "lib/quiz/versioning-schedule.ts",
]) {
  const source = readFileSync(resolve(projectRoot, sourcePath), "utf8");
  assert.doesNotMatch(source, /\bprisma\b|migration\.sql|prisma\//iu, `${sourcePath} must remain pure and persistence-free`);
}

assert.equal(toKuisVersionLabel(superseded).publicationDate, null);
console.log("Kuis versioning pure and structural contracts passed.");
