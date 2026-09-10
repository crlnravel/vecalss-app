import assert from "node:assert/strict";

import {
  aggregateTryoutScores,
  materializeFrozenAnswers,
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

const frozenItems = [
  { id: "item-1", options: [{ id: "option-a", isCorrect: true }, { id: "option-b", isCorrect: false }], points: "2" },
  { id: "item-2", options: [{ id: "option-c", isCorrect: false }, { id: "option-d", isCorrect: true }], points: "1" },
];
const frozenScore = materializeFrozenAnswers(frozenItems, [
  { itemId: "item-1", selectedOptionId: "option-a" },
  { itemId: "item-2", selectedOptionId: "option-c" },
]);
assert.equal(frozenScore.invalid, false);
assert.equal(frozenScore.correctCount, 1);
assert.equal(frozenScore.wrongCount, 1);
assert.equal(frozenScore.unansweredCount, 0);
assert.equal(frozenScore.rawScore, 2);
assert.equal(frozenScore.normalizedScore, 66.67);
assert.deepEqual(frozenScore.materializedAnswers, [
  { itemId: "item-1", isCorrect: true, pointsAwarded: 2 },
  { itemId: "item-2", isCorrect: false, pointsAwarded: 0 },
]);

const catSubset = materializeFrozenAnswers(frozenItems, [{ itemId: "item-1", selectedOptionId: "option-b" }], ["item-1"]);
assert.equal(catSubset.invalid, false);
assert.equal(catSubset.unansweredCount, 0);
assert.equal(catSubset.normalizedScore, 0);
assert.equal(materializeFrozenAnswers(frozenItems, [{ itemId: "item-3", selectedOptionId: "option-a" }]).invalid, true);

const multipleItems = [{
  id: "item-multiple",
  options: [
    { id: "option-a", isCorrect: true },
    { id: "option-b", isCorrect: false },
    { id: "option-c", isCorrect: true },
  ],
  points: "3",
  questionType: "multiple_choice" as const,
}];
const exactSetScore = materializeFrozenAnswers(multipleItems, [{
  itemId: "item-multiple",
  selectedOptionIds: ["option-c", "option-a"],
}]);
assert.equal(exactSetScore.invalid, false);
assert.equal(exactSetScore.correctCount, 1);
assert.equal(exactSetScore.rawScore, 3);
assert.equal(materializeFrozenAnswers(multipleItems, [{ itemId: "item-multiple", selectedOptionIds: ["option-a"] }]).correctCount, 0, "a subset of the answer key is incorrect");
assert.equal(materializeFrozenAnswers(multipleItems, [{ itemId: "item-multiple", selectedOptionIds: ["option-a", "option-b", "option-c"] }]).correctCount, 0, "a superset of the answer key is incorrect");
assert.equal(materializeFrozenAnswers(multipleItems, [{ itemId: "item-multiple", selectedOptionIds: ["option-a", "option-a"] }]).invalid, true, "duplicate selections require review");
assert.equal(materializeFrozenAnswers(multipleItems, [{ itemId: "item-multiple", selectedOptionIds: ["option-a"], selectedOptionId: "option-c" }]).invalid, true, "conflicting scalar and plural answers require review");

console.log("Tryout scoring contract passed.");
