import assert from "node:assert/strict";

import {
  canonicalizeOptionIdSet,
  compareSelectedOptionSets,
  decodeLegacyAnswerSelection,
  evaluateExactAnswer,
  validateAnswerKey,
  validateSelectedOptionIds,
} from "../lib/question-bank/answer-contract";

const options = [
  { id: "option-a", isCorrect: false },
  { id: "option-b", isCorrect: true },
  { id: "option-c", isCorrect: true },
];

assert.deepEqual(canonicalizeOptionIdSet(["option-c", "option-a", "option-b"]), ["option-a", "option-b", "option-c"]);
assert.deepEqual(options.map((option) => option.id), ["option-a", "option-b", "option-c"], "canonicalization must not reorder display options");

assert.equal(validateAnswerKey("single_choice", options).ok, false);
assert.equal(validateAnswerKey("single_choice", options.slice(0, 2)).ok, true);
assert.equal(validateAnswerKey("multiple_choice", options).ok, true);
assert.equal(validateAnswerKey("multiple_choice", options.map((option) => ({ ...option, isCorrect: false }))).ok, false);
assert.equal(validateAnswerKey("single_choice", [{ id: "", isCorrect: true }, { id: "option-b", isCorrect: false }]).ok, false);
assert.equal(validateAnswerKey("single_choice", [{ id: "option-a", isCorrect: true }, { id: "option-a", isCorrect: false }]).ok, false);

assert.equal(validateSelectedOptionIds("single_choice", [], options.map((option) => option.id)).ok, true);
assert.equal(validateSelectedOptionIds("single_choice", ["option-b"], options.map((option) => option.id)).ok, true);
assert.equal(validateSelectedOptionIds("single_choice", ["option-a", "option-b"], options.map((option) => option.id)).ok, false);
assert.equal(validateSelectedOptionIds("multiple_choice", ["option-b", "option-b"], options.map((option) => option.id)).ok, false);
assert.equal(validateSelectedOptionIds("multiple_choice", ["option-x"], options.map((option) => option.id)).ok, false);

assert.equal(compareSelectedOptionSets(["option-c", "option-b"], ["option-b", "option-c"]).equal, true);
assert.equal(compareSelectedOptionSets(["option-b"], ["option-b", "option-c"]).equal, false);
assert.equal(compareSelectedOptionSets(["option-b", "option-b"], ["option-b"]).ok, false);

const exact = (selectedOptionIds: readonly string[]) => evaluateExactAnswer({
  availableOptionIds: options.map((option) => option.id),
  correctOptionIds: ["option-b", "option-c"],
  mode: "multiple_choice",
  selectedOptionIds,
});
assert.equal(exact(["option-c", "option-b"]).status, "correct");
assert.equal(exact(["option-b"]).status, "incorrect", "subset must not receive partial credit");
assert.equal(exact(["option-a", "option-b", "option-c"]).status, "incorrect", "superset must not receive credit");
assert.equal(exact([]).status, "unanswered");
assert.equal(exact(["option-x"]).status, "invalid");
assert.equal(evaluateExactAnswer({ availableOptionIds: ["option-a", "option-b"], correctOptionIds: ["option-x"], mode: "single_choice", selectedOptionIds: ["option-a"] }).status, "invalid");

const legacy = decodeLegacyAnswerSelection({ selectedOptionId: "option-b" });
assert.deepEqual(legacy, { errors: [], ok: true, selectedOptionIds: ["option-b"], source: "legacy_singular" });
assert.deepEqual(decodeLegacyAnswerSelection({ selectedOptionIds: ["option-b", "option-c"] }).selectedOptionIds, ["option-b", "option-c"]);
assert.equal(decodeLegacyAnswerSelection({ selectedOptionId: "option-b", selectedOptionIds: ["option-c"] }).ok, false);
assert.equal(decodeLegacyAnswerSelection({ selectedOptionId: "option-b", selectedOptionIds: ["option-b"] }).ok, true);
assert.deepEqual(decodeLegacyAnswerSelection({ selectedOptionId: null, selectedOptionIds: [] }).selectedOptionIds, []);
assert.equal(decodeLegacyAnswerSelection({ selectedOptionIds: ["option-b", "option-b"] }).ok, false);

console.log("Assessment answer contract passed.");
