import { validateAnswerKey, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import { canonicalAssessmentReleaseJson, digestAssessmentReleasePayload } from "@/lib/tryout/assessment-release-canonical.mjs";
import { canonicalizeCbtScoringConfig, scoreFixedOrderIrt } from "@/lib/tryout/cbt-scoring-policy";
import { materializeFrozenAnswers, TRYOUT_CBT_SCORING_VERSION, type FrozenScoreItem, type FrozenSelectedAnswer } from "@/lib/tryout/scoring";

export const EMPTY_EXPIRED_SCORING_VERSION = "cbt-empty-expired-zero-v1";
export const FROZEN_TRYOUT_SCORING_REVIEW_MESSAGE = "Hasil belum dapat dihitung. Data pengerjaan perlu diperiksa terlebih dahulu.";
type RecordValue = Record<string, unknown>;
type FrozenItem = FrozenScoreItem & { snapshotId?: string | null; sourceQuestionId?: string | null };
type PersistedSelection = { itemId: string; selectedOptionId: string | null; selectedOptionIds: unknown };

function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Frozen CBT content must be an object.");
  return value as RecordValue;
}

function same(left: unknown, right: unknown) {
  return canonicalAssessmentReleaseJson(left) === canonicalAssessmentReleaseJson(right);
}

/** Validate release-owned content before trusting an empty or answered run. */
export function assertFrozenRunRelease(
  run: { contentSnapshot: unknown; sequenceNo: number; tryoutSectionId: string; assessmentReleaseId: string | null; assessmentReleaseNumber: number | null; assessmentReleaseDigest: string | null },
  section: { id: string; sequenceNo: number; subtestId: string; tryoutId: string },
  release: { id: string; releaseNumber: number; contentDigest: string; payload: unknown },
) {
  if (run.assessmentReleaseId !== release.id || run.assessmentReleaseNumber !== release.releaseNumber || run.assessmentReleaseDigest !== release.contentDigest
    || digestAssessmentReleasePayload(release.payload) !== release.contentDigest) throw new Error("Frozen CBT release binding or digest is invalid.");
  const form = record(run.contentSnapshot);
  const payload = record(release.payload);
  if (record(payload.tryout).id !== section.tryoutId || run.tryoutSectionId !== section.id || run.sequenceNo !== section.sequenceNo
    || form.sectionId !== section.id || form.sequenceNo !== section.sequenceNo || form.subtestId !== section.subtestId
    || form.testType !== "cbt" || typeof form.title !== "string" || !Number.isFinite(form.durationSeconds)
    || Number(form.durationSeconds) < 0 || !Object.hasOwn(form, "scoringConfig") || !Array.isArray(form.items) || !form.items.length) throw new Error("Frozen CBT section identity or completeness is invalid.");
  const sections = payload.sections;
  if (!Array.isArray(sections) || sections.length !== 7) throw new Error("Frozen release requires seven sections.");
  const matches = sections.map(record).filter((candidate) => candidate.sequenceNo === run.sequenceNo && candidate.subtestId === section.subtestId);
  if (matches.length !== 1) throw new Error("Frozen CBT section is absent or ambiguous in its release.");
  const frozen = matches[0];
  const scoring = record(frozen.scoring);
  if (scoring.testType !== "cbt" || !same(form.scoringConfig, scoring.config) || form.durationSeconds !== frozen.durationSeconds || form.title !== frozen.title
    || !Array.isArray(frozen.items) || form.items.length !== frozen.items.length) throw new Error("Frozen CBT section differs from its release.");
  const releasedItems = new Map(frozen.items.map((item) => { const value = record(item); return [value.id, value]; }));
  const seen = new Set<unknown>();
  for (const value of form.items) {
    const item = record(value);
    const identity = item.releaseItemId ?? item.id;
    const source = releasedItems.get(identity);
    if (!source || seen.has(identity)) throw new Error("Frozen CBT item identity is invalid.");
    seen.add(identity);
    for (const key of ["prompt", "promptAssetId", "points", "questionType", "difficulty", "explanation", "explanationAssetId", "snapshotId", "sourceQuestionId", "sourceQuestionRevisionId", "sourceContentDigest", "sourceRevisionProvenance"]) {
      if (!same(item[key] ?? null, source[key] ?? null)) throw new Error(`Frozen CBT item ${key} differs from its release.`);
    }
    if (!Array.isArray(item.options) || !Array.isArray(source.options) || item.options.length !== source.options.length) throw new Error("Frozen CBT options are incomplete.");
    const releasedOptions = new Map(source.options.map((option) => { const value = record(option); return [value.id, value]; }));
    const seenOptions = new Set<unknown>();
    for (const value of item.options) {
      const option = record(value);
      const identity = option.releaseOptionId ?? option.id;
      const sourceOption = releasedOptions.get(identity);
      if (!sourceOption || seenOptions.has(identity)) throw new Error("Frozen CBT option identity is invalid.");
      seenOptions.add(identity);
      for (const key of ["choiceKey", "content", "assetId", "isCorrect", "snapshotOptionId", "sortOrder"]) {
        if (!same(option[key] ?? null, sourceOption[key] ?? null)) throw new Error(`Frozen CBT option ${key} differs from its release.`);
      }
    }
  }
}

/** Common calculation for active seals and opened/unopened expiry. No lifecycle writes. */
export function calculateFrozenTryoutRun(input: { contentSnapshot: unknown; answers: readonly PersistedSelection[]; expired: boolean }) {
  const form = record(input.contentSnapshot);
  if (!Array.isArray(form.items) || !form.items.length || !Object.hasOwn(form, "scoringConfig")) throw new Error("Frozen CBT items/scoring are incomplete.");
  const items = form.items.map((value) => {
    const item = record(value);
    if (typeof item.id !== "string" || !item.id || !Array.isArray(item.options)
      || (typeof item.points !== "string" && typeof item.points !== "number") || String(item.points).trim() === ""
      || !Number.isFinite(Number(item.points)) || Number(item.points) < 0) throw new Error("Frozen CBT item/points are invalid.");
    const options = item.options.map((value) => {
      const option = record(value);
      if (typeof option.id !== "string" || typeof option.isCorrect !== "boolean") throw new Error("Frozen CBT option is invalid.");
      return { id: option.id, isCorrect: option.isCorrect };
    });
    if (item.questionType !== undefined && item.questionType !== null && item.questionType !== "single_choice" && item.questionType !== "multiple_choice") throw new Error("Frozen CBT answer mode is invalid.");
    const mode: QuestionAnswerMode = item.questionType === "multiple_choice" || (item.questionType == null && options.filter((option) => option.isCorrect).length > 1) ? "multiple_choice" : "single_choice";
    if (!validateAnswerKey(mode, options).ok) throw new Error("Frozen CBT answer key is invalid.");
    return { ...item, id: item.id, options, points: Number(item.points), questionType: mode } as FrozenItem;
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("Frozen CBT items must be unique.");
  const answers: FrozenSelectedAnswer[] = input.answers.map((answer) => {
    const plural = answer.selectedOptionIds;
    if (plural != null && (!Array.isArray(plural) || plural.some((value) => typeof value !== "string"))) throw new Error("Persisted CBT selection shape is invalid.");
    return { itemId: answer.itemId, selectedOptionId: answer.selectedOptionId, selectedOptionIds: plural as string[] | null };
  });
  const scored = materializeFrozenAnswers(items, answers);
  if (scored.invalid || scored.normalizedScore === null) throw new Error("Persisted CBT selections or frozen points are invalid.");
  const itemIds = items.map((item) => item.snapshotId ?? item.sourceQuestionId);
  if (form.scoringConfig !== null) {
    const config = record(form.scoringConfig);
    for (const key of ["correctAnswerPoints", "correctPoints", "wrongAnswerPoints", "wrongPoints", "unansweredPoints", "unanswered"]) {
      if (Object.hasOwn(config, key) && (typeof config[key] !== "number" || !Number.isFinite(config[key]))) throw new Error("Frozen CBT scoring values are invalid.");
    }
  }
  const policy = canonicalizeCbtScoringConfig(form.scoringConfig);
  if (policy.method === "irt_2pl") {
    if (itemIds.some((id) => !id) || new Set(itemIds).size !== items.length) throw new Error("IRT requires a unique frozen identity for every item.");
    canonicalizeCbtScoringConfig(form.scoringConfig, itemIds as string[]);
  }
  const counters = { answeredCount: scored.answeredCount, correctCount: scored.correctCount, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount };
  const emptyExpired = input.expired && scored.answeredCount === 0;
  const responses = scored.materializedAnswers.filter((answer) => answer.isCorrect !== null).map((answer) => ({ itemId: itemIds[items.findIndex((item) => item.id === answer.itemId)]!, isCorrect: answer.isCorrect! }));
  // Raw zero is a storage sentinel for empty-expired IRT, never an ability estimate.
  const estimated = policy.method === "irt_2pl" && !emptyExpired ? scoreFixedOrderIrt({ itemParameters: policy.itemParameters, responses }) : null;
  const scoringVersion = emptyExpired ? EMPTY_EXPIRED_SCORING_VERSION : estimated?.scoringVersion ?? TRYOUT_CBT_SCORING_VERSION;
  const rawScore = emptyExpired ? 0 : estimated?.ability ?? scored.rawScore;
  const normalizedScore = emptyExpired ? 0 : estimated?.normalizedScore ?? scored.normalizedScore;
  const maxScore = policy.method === "irt_2pl" ? items.length : scored.maxScore;
  return {
    ...counters, rawScore, normalizedScore, maxScore, scoringVersion,
    answers: scored.materializedAnswers.map((answer) => ({ ...answer, pointsAwarded: policy.method === "irt_2pl" ? answer.isCorrect ? 1 : 0 : answer.pointsAwarded })),
    calculationInput: { answersAcknowledged: scored.answeredCount, scoringConfig: policy, totalItems: items.length, ...(policy.method === "irt_2pl" ? { itemParameters: policy.itemParameters, responses } : {}) },
    calculationResult: { ...counters, score: rawScore, normalizedScore, maxScore, ...(emptyExpired ? { rule: "empty_expired_zero", rawScoreConvention: "zero_without_ability_estimate" } : estimated ? { ability: estimated.ability } : {}) },
  };
}
