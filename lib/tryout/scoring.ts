/**
 * Internal Tryout score normalization.
 *
 * These transforms put unlike Test inputs on the same bounded 0–100 index
 * before the seven Test runs are averaged. They are deliberately not an
 * attempt to reproduce an official SNBT score, percentile, or equivalence.
 */

export const TRYOUT_SCORE_AGGREGATION_VERSION = "normalized-test-mean-v1";
export const TRYOUT_TEST_COUNT = 7;
export const TRYOUT_SCORE_MIN = 0;
export const TRYOUT_SCORE_MAX = 100;

type ScoreRecord = Record<string, unknown>;

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

export { aggregateTryoutScores, normalizeCatAbility, normalizeCbtScore, normalizeRunScore };
