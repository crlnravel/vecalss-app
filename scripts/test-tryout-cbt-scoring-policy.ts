import assert from "node:assert/strict";

import {
  canonicalizeCbtScoringConfig,
  CBT_FIXED_POINTS_METHOD,
  CBT_IRT_2PL_METHOD,
  CBT_IRT_ESTIMATOR_VERSION,
  CBT_IRT_MODEL_VERSION,
  CBT_IRT_NORMALIZATION_VERSION,
  normalizeIrtAbility,
  scoreFixedOrderIrt,
} from "../lib/tryout/cbt-scoring-policy";

assert.deepEqual(canonicalizeCbtScoringConfig(null), {
  correctAnswerPoints: 1,
  method: CBT_FIXED_POINTS_METHOD,
  unansweredPoints: 0,
  wrongAnswerPoints: 0,
});
assert.deepEqual(canonicalizeCbtScoringConfig({ method: "sum_item_points", wrongAnswerPoints: -0.25 }), {
  correctAnswerPoints: 1,
  method: CBT_FIXED_POINTS_METHOD,
  unansweredPoints: 0,
  wrongAnswerPoints: -0.25,
});
assert.deepEqual(canonicalizeCbtScoringConfig({ method: CBT_IRT_2PL_METHOD }), {
  estimatorVersion: CBT_IRT_ESTIMATOR_VERSION,
  itemParameters: [],
  method: CBT_IRT_2PL_METHOD,
  modelVersion: CBT_IRT_MODEL_VERSION,
  normalizationVersion: CBT_IRT_NORMALIZATION_VERSION,
});

const parameters = [
  { a: 1.1, b: -0.4, itemId: "item-1" },
  { a: 1.3, b: 0.1, itemId: "item-2" },
  { a: 0.9, b: 0.8, itemId: "item-3" },
];
const releaseConfig = canonicalizeCbtScoringConfig({ method: CBT_IRT_2PL_METHOD, items: parameters }, ["item-1", "item-2", "item-3"]);
assert.equal(releaseConfig.method, CBT_IRT_2PL_METHOD);
assert.throws(() => canonicalizeCbtScoringConfig({ method: CBT_IRT_2PL_METHOD, items: parameters }, ["item-1", "item-2"]), /tepat seluruh soal/);
assert.throws(() => canonicalizeCbtScoringConfig({ method: "cat" }), /tidak didukung/);
assert.throws(() => canonicalizeCbtScoringConfig({ method: CBT_IRT_2PL_METHOD, items: [{ a: 0, b: 0, itemId: "item-1" }] }), /diskriminasi/);

const allCorrect = scoreFixedOrderIrt({ itemParameters: parameters, responses: parameters.map(({ itemId }) => ({ isCorrect: true, itemId })) });
const allWrong = scoreFixedOrderIrt({ itemParameters: parameters, responses: parameters.map(({ itemId }) => ({ isCorrect: false, itemId })) });
assert.ok(allCorrect.ability > 0);
assert.ok(allCorrect.normalizedScore > 50);
assert.ok(allWrong.ability < 0);
assert.ok(allWrong.normalizedScore < 50);
assert.deepEqual(
  scoreFixedOrderIrt({ itemParameters: parameters, responses: [{ itemId: "item-2", isCorrect: true }, { itemId: "item-1", isCorrect: false }] }),
  scoreFixedOrderIrt({ itemParameters: parameters, responses: [{ itemId: "item-2", isCorrect: true }, { itemId: "item-1", isCorrect: false }] }),
);
assert.equal(normalizeIrtAbility(0), 50);
assert.equal(normalizeIrtAbility(-1000), 0);
assert.equal(normalizeIrtAbility(1000), 100);

console.log("CBT scoring policy contract passed.");
