import assert from "node:assert/strict";

import {
  kuisReviewVisibility,
  publishedMateriWhere,
  releasedKuisAttemptWhere,
  releasedTryoutAttemptWhere,
} from "../lib/vera/sources/authorization";

const closesAt = "2026-11-02T09:00:00+07:00";
const beforeClose = new Date("2026-11-02T08:00:00+07:00");
const afterClose = new Date("2026-11-02T10:00:00+07:00");

const reviewCases: Array<{
  name: string;
  snapshot: unknown;
  quiz: Record<string, unknown>;
  now: Date;
  expected: { reviewAvailable: boolean; correctnessVisible: boolean };
}> = [
  {
    name: "immediate with show",
    snapshot: {},
    quiz: { reviewTiming: "immediate", correctAnswerVisibility: "show", closesAt },
    now: beforeClose,
    expected: { reviewAvailable: true, correctnessVisible: true },
  },
  {
    name: "immediate with hide",
    snapshot: {},
    quiz: { reviewTiming: "immediate", correctAnswerVisibility: "hide", closesAt },
    now: beforeClose,
    expected: { reviewAvailable: true, correctnessVisible: false },
  },
  {
    name: "after_close before the quiz closes",
    snapshot: {},
    quiz: { reviewTiming: "after_close", correctAnswerVisibility: "show", closesAt },
    now: beforeClose,
    expected: { reviewAvailable: false, correctnessVisible: false },
  },
  {
    name: "after_close after the quiz closes with show",
    snapshot: {},
    quiz: { reviewTiming: "after_close", correctAnswerVisibility: "show", closesAt },
    now: afterClose,
    expected: { reviewAvailable: true, correctnessVisible: true },
  },
  {
    name: "after_close after the quiz closes with hide",
    snapshot: {},
    quiz: { reviewTiming: "after_close", correctAnswerVisibility: "hide", closesAt },
    now: afterClose,
    expected: { reviewAvailable: true, correctnessVisible: false },
  },
  {
    name: "after_close without any close time",
    snapshot: {},
    quiz: { reviewTiming: "after_close", correctAnswerVisibility: "show" },
    now: afterClose,
    expected: { reviewAvailable: false, correctnessVisible: false },
  },
  {
    name: "never with show",
    snapshot: {},
    quiz: { reviewTiming: "never", correctAnswerVisibility: "show", closesAt },
    now: afterClose,
    expected: { reviewAvailable: false, correctnessVisible: false },
  },
  {
    name: "attempt snapshot overrides the live quiz timing",
    snapshot: { reviewTiming: "never" },
    quiz: { reviewTiming: "immediate", correctAnswerVisibility: "show" },
    now: afterClose,
    expected: { reviewAvailable: false, correctnessVisible: false },
  },
  {
    name: "attempt snapshot close time is used for after_close",
    snapshot: { reviewTiming: "after_close", correctAnswerVisibility: "show", closesAt: "2026-11-02T11:00:00+07:00" },
    quiz: { closesAt },
    now: afterClose,
    expected: { reviewAvailable: false, correctnessVisible: false },
  },
  {
    name: "missing settings stay private",
    snapshot: {},
    quiz: {},
    now: afterClose,
    expected: { reviewAvailable: false, correctnessVisible: false },
  },
];

for (const reviewCase of reviewCases) {
  assert.deepEqual(
    kuisReviewVisibility(reviewCase.snapshot, reviewCase.quiz, reviewCase.now),
    reviewCase.expected,
    reviewCase.name,
  );
}

const studentId = "00000000-0000-4000-8000-000000000001";

const materi = publishedMateriWhere(afterClose);
assert.equal(materi.status, "published");
assert.deepEqual(materi.publishedAt, { lte: afterClose });
assert.deepEqual(materi.assets, { some: { assetType: "attachment", mimeType: "application/pdf" } });

const kuis = releasedKuisAttemptWhere(studentId, afterClose);
assert.deepEqual(kuis.participation, { studentId, quiz: { status: "published" } });
assert.equal(kuis.status, "scored");
assert.equal(kuis.scoringState, "scored");
assert.equal(kuis.releaseState, "released");
assert.deepEqual(kuis.releaseAt, { lte: afterClose });

const tryout = releasedTryoutAttemptWhere(studentId, afterClose);
assert.equal(tryout.studentId, studentId);
assert.equal(tryout.scoringState, "scored");
assert.equal(tryout.releaseState, "released");
assert.deepEqual(tryout.assessmentReleaseDigest, { not: null });
assert.deepEqual(tryout.tryout, { status: "published", publishedAt: { lte: afterClose } });
assert.deepEqual(tryout.assessmentRelease, { is: { publishedAt: { lte: afterClose } } });
assert.deepEqual(tryout.deliverySession, {
  status: { in: ["active", "closed", "archived"] },
  releaseState: "released",
  assessmentReleaseId: { not: null },
  assignments: { some: { status: "active", admission: { status: "active", studentId } } },
});

console.log("Vera authorization checks passed.");
