import assert from "node:assert/strict";

import {
  aggregateTryoutScores,
  normalizeCatAbility,
  normalizeCbtScore,
  normalizeRunScore,
  TRYOUT_SCORE_AGGREGATION_VERSION,
} from "../lib/tryout/scoring";

assert.equal(TRYOUT_SCORE_AGGREGATION_VERSION, "normalized-test-mean-v1");

assert.equal(normalizeCbtScore(0, 3), 0);
assert.equal(normalizeCbtScore(1.5, 3), 50);
assert.equal(normalizeCbtScore(3, 3), 100);
assert.equal(normalizeCbtScore(4, 3), 100);
assert.equal(normalizeCbtScore(-1, 3), 0);

assert.equal(normalizeCatAbility(0), 50);
assert.ok(normalizeCatAbility(-2) < 50);
assert.ok(normalizeCatAbility(2) > 50);
assert.equal(normalizeCatAbility(-1000), 0);
assert.equal(normalizeCatAbility(1000), 100);

assert.equal(normalizeRunScore({ score: 2, maxScore: 4 }, "cbt"), 50);
assert.equal(normalizeRunScore({ ability: 0 }, "cat"), 50);
assert.equal(normalizeRunScore({ score: 2 }, "cat", { currentAbility: 0.72 }), 67.26);
assert.equal(normalizeRunScore({ normalizedScore: 72.345 }, "cat"), 72.35);
assert.equal(normalizeRunScore({ score: 0.5 }, "cat"), normalizeCatAbility(0.5));
assert.equal(normalizeRunScore({ score: 2 }, "cbt"), null);
assert.equal(normalizeRunScore({ score: 2, maxScore: 0 }, "cbt"), null);

assert.equal(aggregateTryoutScores([0, 25, 50, 75, 100, 50, 50]), 50);
assert.equal(aggregateTryoutScores([33.33, 33.33, 33.33, 33.33, 33.33, 33.33, 33.33]), 33.33);
assert.throws(() => aggregateTryoutScores([50]), /exactly 7/);

console.log("Tryout scoring contract passed.");
