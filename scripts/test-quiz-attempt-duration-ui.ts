import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { QuizAutoSubmittedNotice } from "@/modules/quiz/QuizAutoSubmittedNotice";
import {
  QuizAttemptTimer,
  remainingAfterClockSync,
  startQuizAttemptCountdown,
  startQuizAttemptTimer,
} from "@/modules/quiz/QuizAttemptTimer";
import { QuizTimingNote } from "@/modules/quiz/QuizTimingNote";
import { formatQuizRemainingTime } from "@/modules/quiz/time-format";

assert.equal(formatQuizRemainingTime(65), "01:05");
assert.equal(formatQuizRemainingTime(3600), "1:00:00");
assert.equal(formatQuizRemainingTime(-1), "00:00");

const countdown = renderToStaticMarkup(
  createElement(QuizAttemptTimer, {
    deadlineAt: "2026-10-10T10:00:00.000Z",
    fallbackTime: "Tanpa batas waktu",
    initialRemainingSeconds: 65,
    onAutoSubmitted: () => undefined,
    onExpired: () => undefined,
    onTimeLockChange: () => undefined,
    serverNowAt: "2026-10-10T09:58:55.000Z",
    syncAttempt: async () => ({
      isSubmitted: false,
      remainingMilliseconds: 65_000,
      serverProcessingMilliseconds: 200,
    }),
  }),
);
assert.match(countdown, /aria-label="Waktu tersisa 01:05"/);
assert.match(countdown, />01:05<\/span>/);

const untimed = renderToStaticMarkup(
  createElement(QuizAttemptTimer, {
    deadlineAt: null,
    fallbackTime: "Tanpa batas waktu",
    initialRemainingSeconds: null,
    onAutoSubmitted: () => undefined,
    onExpired: () => undefined,
    onTimeLockChange: () => undefined,
    serverNowAt: null,
    syncAttempt: async () => null,
  }),
);
assert.match(untimed, /Tanpa batas waktu/);

const unknownHistoricalTiming = renderToStaticMarkup(
  createElement(QuizAttemptTimer, {
    deadlineAt: null,
    fallbackTime: "—",
    initialRemainingSeconds: null,
    onAutoSubmitted: () => undefined,
    onExpired: () => undefined,
    onTimeLockChange: () => undefined,
    serverNowAt: null,
    syncAttempt: async () => null,
  }),
);
assert.match(unknownHistoricalTiming, />—<\/span>/);
const unknownTimingNote = renderToStaticMarkup(
  createElement(QuizTimingNote, { status: "unknown" }),
);
assert.match(unknownTimingNote, /Batas waktu untuk pengerjaan ini tidak tercatat/);

const autoSubmitted = renderToStaticMarkup(
  createElement(QuizAutoSubmittedNotice),
);
assert.match(autoSubmitted, /role="status"/);
assert.match(autoSubmitted, /Jawaban yang tersimpan dikumpulkan otomatis/);

let monotonicNow = 500;
const fakeCallbacks: { interval: () => void } = { interval: () => undefined };
let deadlineRequests = 0;
let clearedInterval = false;
const ticks: number[] = [];
const cleanup = startQuizAttemptCountdown({
  initialRemainingMilliseconds: 55_000,
  onDeadline: () => { deadlineRequests += 1; },
  onTick: (seconds) => ticks.push(seconds),
  runtime: {
    clearInterval: () => { clearedInterval = true; },
    monotonicNow: () => monotonicNow,
    setInterval: (callback) => { fakeCallbacks.interval = callback; return 1; },
  },
});

fakeCallbacks.interval();
assert.equal(ticks[0], 55);
monotonicNow += 1_000;
fakeCallbacks.interval();
assert.equal(ticks.at(-1), 54, "the countdown follows the monotonic clock");
cleanup();
assert.equal(clearedInterval, true);
assert.equal(remainingAfterClockSync(1_000, 1_200, 200), 500);
assert.equal(remainingAfterClockSync(2_000, 2_000, 1_000), 1_500);
assert.equal(remainingAfterClockSync(2_000, 500, 900), 2_000);

let immediateDeadlineRequests = 0;
const immediateTicks: number[] = [];
let immediateDeadlineCallback: () => void = () => {};
startQuizAttemptCountdown({
  initialRemainingMilliseconds: 0,
  onDeadline: () => { immediateDeadlineRequests += 1; },
  onTick: (seconds) => immediateTicks.push(seconds),
  runtime: {
    clearInterval: () => undefined,
    monotonicNow: () => 0,
    setInterval: (callback) => { immediateDeadlineCallback = callback; return 2; },
  },
});
immediateDeadlineCallback();
assert.equal(immediateTicks[0], 0);
assert.equal(immediateDeadlineRequests, 1, "hydration after the deadline requests reconciliation immediately");

async function verifyTimerLifecycle() {
  let monotonicNow = 1_000;
  let nextIntervalId = 0;
  let visibilityCallback = () => {};
  let removedVisibilityListener = false;
  const intervals = new Map<number, () => void>();
  const ticks: number[] = [];
  const locks: boolean[] = [];
  let expirySignals = 0;
  let submittedRedirects = 0;
  let syncCalls = 0;
  const stop = startQuizAttemptTimer({
    initialRemainingSeconds: 5,
    onAutoSubmitted: () => { submittedRedirects += 1; },
    onExpired: () => { expirySignals += 1; },
    onTimeLockChange: (locked) => locks.push(locked),
    onTick: (seconds) => ticks.push(seconds),
    runtime: {
      clearInterval: (id) => { intervals.delete(id); },
      isVisible: () => true,
      monotonicNow: () => monotonicNow,
      setInterval: (callback) => {
        const id = ++nextIntervalId;
        intervals.set(id, callback);
        return id;
      },
      subscribeVisibility: (callback) => {
        visibilityCallback = callback;
        return () => { removedVisibilityListener = true; };
      },
    },
    syncAttempt: async () => {
      syncCalls += 1;
      if (syncCalls === 1) {
        monotonicNow += 1_000;
        return {
          isSubmitted: false,
          remainingMilliseconds: 5_000,
          serverProcessingMilliseconds: 500,
        };
      }
      if (syncCalls === 2) {
        monotonicNow += 100;
        return {
          isSubmitted: false,
          remainingMilliseconds: 500,
          serverProcessingMilliseconds: 0,
        };
      }
      return {
        isSubmitted: true,
        remainingMilliseconds: 0,
        serverProcessingMilliseconds: 0,
      };
    },
  });

  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  await settle();
  assert.equal(ticks.at(-1), 5, "the server sample is corrected by estimated one-way transit");
  assert.equal(locks.at(-1), false);

  visibilityCallback();
  await settle();
  assert.equal(ticks.at(-1), 1, "foreground return refreshes the server clock");
  monotonicNow += 450;
  [...intervals.values()][0]?.();
  await settle();
  assert.equal(ticks.at(-1), 0);
  assert.equal(expirySignals, 1, "zero locks editing while the server reconciles");
  assert.equal(submittedRedirects, 1, "server-confirmed expiry redirects to the result");
  assert.equal(locks.at(-1), true);
  stop();
  assert.equal(intervals.size, 0, "cleanup clears the countdown interval");
  assert.equal(removedVisibilityListener, true, "cleanup removes the visibility listener");
}

void verifyTimerLifecycle()
  .then(() => console.log("Quiz attempt-duration rendered and timer-lifecycle contracts passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
