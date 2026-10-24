import assert from "node:assert/strict";
import { calculateFrozenTryoutRun, EMPTY_EXPIRED_SCORING_VERSION } from "../lib/tryout/frozen-run-scoring";
import { scoreFixedOrderIrt } from "../lib/tryout/cbt-scoring-policy";
import { aggregateTryoutScores } from "../lib/tryout/scoring";

const items = [7, 3].map((points, index) => ({ id: `i${index}`, snapshotId: `s${index}`, points: String(points), questionType: "single_choice", options: [{ id: `correct${index}`, isCorrect: true }, { id: `wrong${index}`, isCorrect: false }] }));
const fixed = { items, scoringConfig: { method: "fixed_points", correctAnswerPoints: 1, wrongAnswerPoints: 0, unansweredPoints: 0 } };
const irt = { ...fixed, scoringConfig: { method: "irt_2pl", itemParameters: items.map((item) => ({ itemId: item.snapshotId, a: 1, b: 0 })) } };
const selection = (itemId = "i0", selectedOptionIds: unknown = ["correct0"], selectedOptionId: string | null = null) => ({ itemId, selectedOptionIds, selectedOptionId });
for (const contentSnapshot of [fixed, irt]) {
  for (const answers of [[], [selection("i0", [])], [selection("i0", null)]]) {
    const result = calculateFrozenTryoutRun({ contentSnapshot, answers, expired: true });
    assert.equal(result.normalizedScore, 0);
    assert.equal(result.rawScore, 0);
    assert.equal(result.scoringVersion, EMPTY_EXPIRED_SCORING_VERSION);
    assert.equal(result.correctCount, 0);
    assert.equal(result.wrongCount, 0);
    assert.equal(result.unansweredCount, 2);
    assert("rule" in result.calculationResult);
    assert.equal(result.calculationResult.rule, "empty_expired_zero");
    assert(!("ability" in result.calculationResult));
  }
  for (const answers of [[selection("foreign", [])], [selection("i0", [null])], [selection("i0", "garbage")], [selection("i0", ["unknown"])], [selection("i0", ["correct0", "correct0"])], [selection("i0", ["correct0", "wrong0"])], [selection("i0", ["wrong0"], "correct0")], [selection(), selection()]]) {
    assert.throws(() => calculateFrozenTryoutRun({ contentSnapshot, answers, expired: true }));
  }
}
const seventy = calculateFrozenTryoutRun({ contentSnapshot: fixed, answers: [selection()], expired: false });
assert.equal(seventy.normalizedScore, 70);
assert.equal(seventy.rawScore, 7);
assert.equal(aggregateTryoutScores([seventy.normalizedScore, 0, 0, 0, 0, 0, 0]), 10);
const partial = calculateFrozenTryoutRun({ contentSnapshot: irt, answers: [selection()], expired: true });
const established = scoreFixedOrderIrt({ itemParameters: irt.scoringConfig.itemParameters, responses: [{ itemId: "s0", isCorrect: true }] });
assert.equal(partial.normalizedScore, established.normalizedScore);
assert.equal(partial.rawScore, established.ability);
assert("ability" in partial.calculationResult);
assert.equal(partial.calculationResult.ability, established.ability);
assert.equal(partial.unansweredCount, 1);
for (const contentSnapshot of [
  { ...fixed, items: [] }, { ...fixed, items: [...items, items[0]] },
  { ...fixed, items: [{ ...items[0], points: "NaN" }] },
  { ...fixed, items: [{ ...items[0], options: [{ id: "a", isCorrect: false }] }] },
  { ...fixed, scoringConfig: { method: "unsupported" } },
  { ...irt, scoringConfig: { method: "irt_2pl", itemParameters: [] } },
  { ...irt, scoringConfig: { method: "irt_2pl", itemParameters: [{ itemId: "s0", a: 0, b: 0 }, { itemId: "s1", a: 1, b: 0 }] } },
]) assert.throws(() => calculateFrozenTryoutRun({ contentSnapshot, answers: [], expired: true }));
console.log("PASS frozen run scoring: empty/blank vs invalid, fixed70, all7 mean10, partialIRT unchanged, invalid content/calibration refused");
