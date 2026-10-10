import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { QuizResult } from "@/modules/quiz/QuizResultView";

await import("./next-render-interop.mjs");
const { QuizResultView } = await import("@/modules/quiz/QuizResultView");
const { AssessmentResultWorkspace } = await import("@/modules/assessment/AssessmentWorkspace");

const pending: QuizResult = {
  aggregateScore: null,
  attemptScore: null,
  autoSubmitted: false,
  answeredCount: 1,
  canRestart: true,
  correctCount: null,
  correctnessAvailable: false,
  isSubmitted: true,
  released: false,
  releaseAt: "2026-10-10T10:00:00.000Z",
  releaseState: "scheduled",
  scoringState: "scored",
  policy: {
    attemptsAllowed: null, correctAnswerVisibility: "show", formBehavior: "same",
    retryDelaySeconds: null, reviewTiming: "after_close", scorePolicy: "latest",
  },
  questions: [{
    explanation: null, id: "q1", prompt: "Pertanyaan",
    options: [{ correct: false, id: "a", key: "A", text: "Pilihan" }],
    selectedOptionId: "a",
  }],
  reviewAvailable: false,
  score: null,
  title: "Hasil kuis",
  totalQuestions: 2,
};

function renderResult(result: QuizResult) {
  return renderToStaticMarkup(createElement(QuizResultView, {
    result, subjectSlug: "pu", currentQuestion: 1,
    isRestarting: false, restartMessage: null,
    onRestart: () => undefined, onSelectQuestion: () => undefined,
  }));
}

const markup = renderResult(pending);
assert.match(markup, /aria-label="Nilai pengerjaan ini: Belum dibuka"/,
  "a scheduled first result must announce pending disclosure, not zero");
assert.doesNotMatch(markup, /aria-label="0 (?:Skor Akhir|Nilai pengerjaan ini)"/);
assert.match(markup, /aria-label="Benar: Belum dibuka"/);

const released = {
  ...pending, released: true, releaseState: "released" as const,
  releaseAt: null, reviewAvailable: true,
  correctnessAvailable: true,
  questions: [{ ...pending.questions[0], explanation: "KRF04_PROTECTED_EXPLANATION", options: [{ ...pending.questions[0].options[0], correct: true }] }],
  policy: { ...pending.policy, reviewTiming: "immediate" as const },
};
const fixtures: Record<string, QuizResult> = process.env.KRF04_RESULT_FIXTURES
  ? JSON.parse(await readFile(process.env.KRF04_RESULT_FIXTURES, "utf8"))
  : {
    pending,
    never: { ...pending, releaseState: "hidden", releaseAt: null, policy: { ...pending.policy, reviewTiming: "never" } },
    review: { ...pending, releaseState: "hidden", scoringState: "review_required" },
    unscored: { ...pending, releaseState: "hidden", scoringState: "pending" },
    recalculating: { ...pending, releaseState: "hidden", scoringState: "recalculating" },
    zero: { ...released, attemptScore: 0, aggregateScore: 0, score: 0, correctCount: 0, questions: [{ ...released.questions[0], options: [{ ...released.questions[0].options[0], correct: false }] }] },
    positive: { ...released, attemptScore: 50, aggregateScore: 50, score: 50, correctCount: 1 },
    hiddenKeys: { ...released, attemptScore: 50, aggregateScore: 50, score: 50, correctCount: 1, correctnessAvailable: false, questions: [{ ...pending.questions[0], explanation: "KRF04_PROTECTED_EXPLANATION" }], policy: { ...released.policy, correctAnswerVisibility: "hide" } },
    historical: { ...pending, aggregateScore: 73, score: 73, resumeAttemptId: "owned-active" },
    historicalHidden: { ...pending, releaseState: "hidden", releaseAt: null, policy: { ...pending.policy, reviewTiming: "never" }, aggregateScore: 73, score: 73 },
  };

const unavailableLabels = {
  pending: "Belum dibuka", never: "Tidak ditampilkan", review: "Perlu ditinjau",
  unscored: "Belum dinilai", recalculating: "Sedang dihitung", historical: "Belum dibuka", historicalHidden: "Tidak ditampilkan",
};
const rendered: Record<string, string> = {};
for (const [name, label] of Object.entries(unavailableLabels)) {
  const resultMarkup = renderResult(fixtures[name]);
  rendered[name] = resultMarkup;
  assert.ok(resultMarkup.includes(`aria-label="Nilai pengerjaan ini: ${label}"`), name);
  assert.ok(resultMarkup.includes(`>${label}</p>`), `${name} has a visible availability state`);
  assert.ok(resultMarkup.includes(`aria-label="Benar: ${label}"`), name);
  assert.doesNotMatch(resultMarkup, /aria-label="0 (?:Skor Akhir|Nilai pengerjaan ini)"/);
  assert.doesNotMatch(resultMarkup, /aria-label="Benar: 0"/);
  assert.doesNotMatch(resultMarkup, /conic-gradient/);
  assert.doesNotMatch(resultMarkup, /KRF04_PROTECTED_EXPLANATION|aria-label="Soal \d+, (?:benar|salah)"/);
  assert.match(resultMarkup, /aria-label="Dijawab: 1 dari 2"/);
  assert.match(resultMarkup, /Jawaban tersimpan/);
}
for (const [name, value, correct] of [["zero", 0, 0], ["positive", 50, 1]] as const) {
  const resultMarkup = renderResult(fixtures[name]);
  rendered[name] = resultMarkup;
  assert.ok(resultMarkup.includes(`aria-label="${value} Nilai pengerjaan ini"`), name);
  assert.ok(resultMarkup.includes(`>${value}</p>`), `${name} preserves the actual numeric score`);
  assert.ok(resultMarkup.includes(`aria-label="Benar: ${correct}"`), name);
  assert.match(resultMarkup, /aria-label="Dijawab: 1 dari 2"/);
  assert.doesNotMatch(resultMarkup, /Nilai gabungan yang sudah dibuka/,
    "a released current score is not repeated as historical aggregate information");
}
assert.match(rendered.positive, /aria-label="Soal 1, benar"/);
assert.match(rendered.zero, /aria-label="Soal 1, salah"/);
assert.match(rendered.positive, /KRF04_PROTECTED_EXPLANATION/);
assert.match(rendered.historical, /aria-label="Nilai gabungan yang sudah dibuka: 73"/);
assert.match(rendered.historical, /Nilai terbaru dari pengerjaan yang nilainya sudah dibuka/);
assert.match(rendered.historical, /Nilai ini bukan nilai khusus pengerjaan ini/);
assert.match(rendered.historical, /aria-label="Lanjutkan kuis"/);
assert.doesNotMatch(rendered.historical, /aria-label="73 Nilai pengerjaan ini"|>96<|Benar: 2/);
assert.match(rendered.historicalHidden, /aria-label="Nilai gabungan yang sudah dibuka: 73"/);
assert.doesNotMatch(rendered.historicalHidden, /aria-label="73 Nilai pengerjaan ini"|>96<|Benar: 2/);
assert.doesNotMatch(rendered.pending, /Nilai gabungan yang sudah dibuka/);

const hiddenKeys = renderResult(fixtures.hiddenKeys);
assert.match(hiddenKeys, /aria-label="50 Nilai pengerjaan ini"/);
assert.match(hiddenKeys, /aria-label="Benar: 1"/);
assert.match(hiddenKeys, /KRF04_PROTECTED_EXPLANATION/);
assert.match(hiddenKeys, /Tidak ditampilkan/);
assert.match(hiddenKeys, /Jawaban tersimpan/);
assert.doesNotMatch(hiddenKeys, /aria-label="Soal \d+, (?:benar|salah)"/);

// Existing Tryout/shared callers still pass plain numbers, with unchanged
// rounding, clamping, default label, and percentage ring behavior.
for (const [score, expected] of [[0, 0], [62.6, 63], [-5, 0], [120, 100]]) {
  const numericProps = { score, title: "Tryout", children: "Hasil Tryout" };
  const numeric = renderToStaticMarkup(createElement(AssessmentResultWorkspace, numericProps));
  assert.ok(numeric.includes(`aria-label="${expected} Skor Akhir"`));
  assert.match(numeric, /conic-gradient/);
}
const rounded = renderResult({ ...released, attemptScore: 62.6, correctCount: 1 });
assert.match(rounded, /aria-label="63 Nilai pengerjaan ini"/);
const noNumericData = renderResult({ ...released, attemptScore: null, correctCount: null });
assert.match(noNumericData, /aria-label="Nilai pengerjaan ini: Belum tersedia"/);
assert.doesNotMatch(noNumericData, /aria-label="0 Nilai pengerjaan ini"/);

if (process.env.KRF04_RENDER_EVIDENCE) {
  await writeFile(process.env.KRF04_RENDER_EVIDENCE, JSON.stringify(rendered));
}
console.log("Quiz result presentation contracts passed.");
