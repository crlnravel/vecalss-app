/**
 * Internal Tryout score normalization.
 *
 * These transforms put unlike Test inputs on the same bounded 0–100 index
 * before the seven Test runs are averaged. They are deliberately not an
 * attempt to reproduce an official SNBT score, percentile, or equivalence.
 */

export const TRYOUT_SCORE_AGGREGATION_VERSION = "normalized-test-mean-v1";
export const TRYOUT_CBT_SCORING_VERSION = "cbt-frozen-item-points-v1";
export const TRYOUT_CAT_SCORING_VERSION = "2pl-map-v1";
export const TRYOUT_TEST_COUNT = 7;
export const TRYOUT_SCORE_MIN = 0;
export const TRYOUT_SCORE_MAX = 100;

type ScoreRecord = Record<string, unknown>;

type FrozenScoreItem = {
  id: string;
  options: Array<{ id: string; isCorrect: boolean }>;
  points: string | number;
};

type FrozenSelectedAnswer = {
  itemId: string;
  selectedOptionId: string | null;
};

type MaterializedFrozenAnswer = {
  itemId: string;
  isCorrect: boolean;
  pointsAwarded: number;
};

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ScoreRecord : null;
}

function clampScore(value: number) {
  return Math.min(TRYOUT_SCORE_MAX, Math.max(TRYOUT_SCORE_MIN, value));
}

function roundScore(value: number) {
  return Math.round((clampScore(value) + Number.EPSILON) * 100) / 100;
}

/** Normalize earned CBT points against the available positive point total. */
function normalizeCbtScore(score: number, maxScore: number) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    throw new Error("CBT score requires a finite score and a positive maximum score.");
  }
  return roundScore((score / maxScore) * TRYOUT_SCORE_MAX);
}

/**
 * Map a 2PL ability estimate (theta) to a bounded internal index.
 *
 * The logistic curve is centered at theta=0 (50), remains monotonic, and is
 * intentionally described as an internal index rather than an SNBT scale.
 */
function normalizeCatAbility(ability: number) {
  if (!Number.isFinite(ability)) throw new Error("CAT ability requires a finite estimate.");
  const probability = ability >= 0
    ? 1 / (1 + Math.exp(-ability))
    : Math.exp(ability) / (1 + Math.exp(ability));
  return roundScore(probability * TRYOUT_SCORE_MAX);
}

/**
 * Read a sealed run's normalized score, with a safe fallback for runs sealed
 * before normalized-test-mean-v1 started recording normalizedScore.
 */
function normalizeRunScore(result: unknown, testType: string, catSnapshot?: unknown) {
  const value = asRecord(result);
  if (!value) return null;
  const stored = asFiniteNumber(value.normalizedScore);
  if (stored !== null) return roundScore(stored);

  if (testType === "cat") {
    const snapshot = asRecord(catSnapshot);
    const ability = asFiniteNumber(value.ability)
      ?? asFiniteNumber(value.currentAbility)
      ?? asFiniteNumber(snapshot?.currentAbility)
      ?? asFiniteNumber(value.score);
    return ability === null ? null : normalizeCatAbility(ability);
  }

  const score = asFiniteNumber(value.score);
  const maxScore = asFiniteNumber(value.maxScore);
  return score === null || maxScore === null || maxScore <= 0 ? null : normalizeCbtScore(score, maxScore);
}

function aggregateTryoutScores(scores: readonly number[]) {
  if (scores.length !== TRYOUT_TEST_COUNT) {
    throw new Error(`Tryout score aggregation requires exactly ${TRYOUT_TEST_COUNT} Test scores.`);
  }
  if (scores.some((score) => !Number.isFinite(score))) {
    throw new Error("Tryout score aggregation requires finite Test scores.");
  }
  return roundScore(scores.reduce((total, score) => total + clampScore(score), 0) / TRYOUT_TEST_COUNT);
}

/**
 * Score answer rows exclusively against a frozen run snapshot. This helper is
 * deliberately pure: callers must provide the snapshot items and selected
 * answer IDs, so mutable authoring rows can never change a sealed result.
 */
function materializeFrozenAnswers(
  items: readonly FrozenScoreItem[],
  answers: readonly FrozenSelectedAnswer[],
  selectedItemIds: readonly string[] | null = null,
) {
  const selected = selectedItemIds ? new Set(selectedItemIds) : null;
  const deliveredItems = items.filter((item) => !selected || selected.has(item.id));
  const itemById = new Map(deliveredItems.map((item) => [item.id, item]));
  const answerByItem = new Map<string, FrozenSelectedAnswer>();
  let invalid = false;
  for (const answer of answers) {
    if (answerByItem.has(answer.itemId) || !itemById.has(answer.itemId)) invalid = true;
    answerByItem.set(answer.itemId, answer);
  }

  const materializedAnswers: MaterializedFrozenAnswer[] = [];
  let correctCount = 0;
  let answeredCount = 0;
  let rawScore = 0;
  const maxScore = deliveredItems.reduce((total, item) => total + Number(item.points), 0);
  for (const item of deliveredItems) {
    const answer = answerByItem.get(item.id);
    if (!answer) continue;
    answeredCount += 1;
    const option = answer.selectedOptionId
      ? item.options.find((candidate) => candidate.id === answer.selectedOptionId)
      : null;
    if (answer.selectedOptionId && !option) invalid = true;
    const isCorrect = option?.isCorrect === true;
    const pointsAwarded = isCorrect ? Number(item.points) : 0;
    if (isCorrect) correctCount += 1;
    rawScore += pointsAwarded;
    materializedAnswers.push({ itemId: item.id, isCorrect, pointsAwarded });
  }
  const unansweredCount = Math.max(0, deliveredItems.length - answeredCount);
  const wrongCount = Math.max(0, answeredCount - correctCount);
  return {
    answeredCount,
    correctCount,
    invalid,
    materializedAnswers,
    maxScore,
    normalizedScore: maxScore > 0 ? normalizeCbtScore(rawScore, maxScore) : null,
    rawScore,
    unansweredCount,
    wrongCount,
  };
}

export { aggregateTryoutScores, materializeFrozenAnswers, normalizeCatAbility, normalizeCbtScore, normalizeRunScore };
export type { FrozenScoreItem, FrozenSelectedAnswer, MaterializedFrozenAnswer };
