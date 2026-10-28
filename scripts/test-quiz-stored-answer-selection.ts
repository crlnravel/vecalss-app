import assert from "node:assert/strict";
import { storedAnswerSelectionIds } from "../lib/quiz/stored-answer-selection";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// Older rows: single option, empty list column. Must read as that option.
assert.deepEqual(storedAnswerSelectionIds({ selectedOptionId: A, selectedOptionIds: null }), [A]);

// Current rows: both columns filled and consistent.
assert.deepEqual(storedAnswerSelectionIds({ selectedOptionId: A, selectedOptionIds: [A] }), [A]);
assert.deepEqual(storedAnswerSelectionIds({ selectedOptionId: A, selectedOptionIds: [B] }), null, "conflicting columns stay invalid");

// Multiple-answer rows store the first option in the single column and every option in the list.
assert.deepEqual(storedAnswerSelectionIds({ selectedOptionId: A, selectedOptionIds: [A, B] }), null, "single column holds A only, so a two-item list conflicts");

// Empty and unanswered rows.
assert.deepEqual(storedAnswerSelectionIds({ selectedOptionId: null, selectedOptionIds: null }), []);
assert.deepEqual(storedAnswerSelectionIds({ selectedOptionId: null, selectedOptionIds: [] }), []);

// Malformed list stays invalid instead of silently falling back to the single option.
assert.equal(storedAnswerSelectionIds({ selectedOptionId: A, selectedOptionIds: { not: "a list" } }), null);
assert.equal(storedAnswerSelectionIds({ selectedOptionId: A, selectedOptionIds: [A, 7] }), null);

// A list with an empty single column is a conflict, as before.
assert.equal(storedAnswerSelectionIds({ selectedOptionId: null, selectedOptionIds: [A, B] }), null);

console.log("stored answer selection: ok");
