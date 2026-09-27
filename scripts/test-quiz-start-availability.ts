import assert from "node:assert/strict";

import {
  canStartQuiz,
  resolveQuizStartAvailability,
} from "@/modules/quiz/start-availability";

const now = new Date("2026-09-27T05:00:00.000Z");

const firstAttempt = resolveQuizStartAvailability({
  activeAttemptId: null,
  attemptsAllowed: 1,
  now,
  retryAvailableAt: null,
  terminalAttemptCount: 0,
});
assert.deepEqual(firstAttempt, { kind: "available" });
assert.equal(canStartQuiz(firstAttempt), true);

const resumedAttempt = resolveQuizStartAvailability({
  activeAttemptId: "active-attempt",
  attemptsAllowed: 1,
  now,
  retryAvailableAt: null,
  terminalAttemptCount: 1,
});
assert.deepEqual(resumedAttempt, {
  attemptId: "active-attempt",
  kind: "resume",
});
assert.equal(canStartQuiz(resumedAttempt), true);

const exhausted = resolveQuizStartAvailability({
  activeAttemptId: null,
  attemptsAllowed: 1,
  now,
  retryAvailableAt: null,
  terminalAttemptCount: 1,
});
assert.deepEqual(exhausted, { kind: "exhausted" });
assert.equal(canStartQuiz(exhausted), false);

const retryWait = resolveQuizStartAvailability({
  activeAttemptId: null,
  attemptsAllowed: 2,
  now,
  retryAvailableAt: new Date("2026-09-27T05:01:00.000Z"),
  terminalAttemptCount: 1,
});
assert.deepEqual(retryWait, {
  kind: "retry-wait",
  retryAvailableAt: "2026-09-27T05:01:00.000Z",
});
assert.equal(canStartQuiz(retryWait), false);

const retryReady = resolveQuizStartAvailability({
  activeAttemptId: null,
  attemptsAllowed: 2,
  now,
  retryAvailableAt: new Date("2026-09-27T04:59:00.000Z"),
  terminalAttemptCount: 1,
});
assert.deepEqual(retryReady, { kind: "available" });
assert.equal(canStartQuiz(retryReady), true);

const unlimited = resolveQuizStartAvailability({
  activeAttemptId: null,
  attemptsAllowed: null,
  now,
  retryAvailableAt: null,
  terminalAttemptCount: 5,
});
assert.deepEqual(unlimited, { kind: "available" });

console.log("Quiz start availability contracts passed.");
