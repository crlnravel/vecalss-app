import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../prisma/migrations/20260822100000_normalize_assessment_scoring_release/migration.sql", import.meta.url), "utf8");
const quizRepository = await readFile(new URL("../lib/quiz/repository.ts", import.meta.url), "utf8");
const scoring = await readFile(new URL("../lib/tryout/scoring.ts", import.meta.url), "utf8");
const attemptRepository = await readFile(new URL("../lib/tryout/attempt-repository.ts", import.meta.url), "utf8");
const resultRepository = await readFile(new URL("../lib/tryout/result-repository.ts", import.meta.url), "utf8");

for (const state of ["AssessmentAttemptState", "AssessmentScoringState", "AssessmentResultReleaseState", "AssessmentScoringProvenance"]) {
  assert.match(schema, new RegExp(`enum ${state}`));
}
for (const field of ["attemptState", "scoringState", "releaseState", "scoringVersion", "scoringProvenance"]) {
  assert.match(schema, new RegExp(field));
}
assert.match(schema, /model ModuleQuiz/);
assert.match(migration, /CREATE TYPE assessment_scoring_state/);
assert.match(migration, /legacy_provable/);
assert.match(migration, /review_required/);
assert.match(migration, /immutable form snapshot/i);
assert.match(migration, /exactly seven provable scored runs/i);

assert.match(quizRepository, /parseAttemptFormSnapshot\(attempt\.formSnapshot\)/);
assert.match(quizRepository, /materialized answers are absent|isCorrect/);
assert.match(quizRepository, /KUIS_SCORING_VERSION/);
assert.match(quizRepository, /scoringState: AssessmentScoringState\.scored/);
assert.match(quizRepository, /releaseState: AssessmentResultReleaseState/);
assert.match(quizRepository, /aggregateStandaloneQuizScore\(releasedAttempts/);
assert.match(quizRepository, /synchronizeStandaloneQuizReleaseState/);
assert.match(quizRepository, /where: \{ id: attemptId, participation: \{ studentId \} \}/);
assert.match(quizRepository, /attempt\.score !== null/);
assert.match(scoring, /materializeFrozenAnswers/);
assert.match(attemptRepository, /materializeFrozenAnswers\(items/);
assert.match(attemptRepository, /TRYOUT_CBT_SCORING_VERSION/);
assert.match(attemptRepository, /TRYOUT_CAT_SCORING_VERSION/);
assert.match(attemptRepository, /scoringState: AssessmentScoringState\.scored/);
assert.match(resultRepository, /upsertTryoutBreakdown/);
assert.match(resultRepository, /findFirst\(\{ where: \{ attemptId, subtestId: run\.section\.subtestId, topicId: null \}/);
assert.match(resultRepository, /exactly seven|length !== 7/);
assert.match(resultRepository, /synchronizeAttemptReleaseState/);
assert.match(resultRepository, /synchronizeAttemptReleaseState\(attemptId, studentId/);
assert.match(resultRepository, /attempt\.studentId !== studentId/);
assert.match(resultRepository, /releaseState: AssessmentResultReleaseState\.released/);
assert.match(resultRepository, /tryoutAttempt\.updateMany/);
assert.match(migration, /attempt\.scoring_state = 'scored'::assessment_scoring_state/);
assert.match(migration, /score = COALESCE\(attempt\.score, ROUND\(matching\.normalized_score, 2\)\)/);
assert.match(migration, /jsonb_typeof\(option_row->'isCorrect'\)/);
assert.match(migration, /ELSE '\[\]'::jsonb/);
assert.match(migration, /COUNT\(DISTINCT run\.tryout_section_id\) = 7/);
assert.match(migration, /COUNT\(DISTINCT section\.subtest_id\) = 7/);
assert.match(migration, /jsonb_array_elements_text\(/);
assert.match(migration, /INSERT INTO tryout_score_breakdowns/);
assert.match(migration, /ranking_rule::text <> 'none'/);
assert.match(attemptRepository, /Perhitungan otomatis setelah tujuh Test tersegel/);
assert.match(attemptRepository, /expireForSessionCap[\s\S]*markAttemptSubmittedIfComplete\(tx, attemptId, now, true\)/);
assert.match(resultRepository, /hasCanonicalSevenRunSet/);
assert.match(resultRepository, /createdByUserId !== actorId/);
assert.match(resultRepository, /items\.length === selectedItemIds\.size/);
assert.match(resultRepository, /attempt\.scoreBreakdowns\.length === 7/);

console.log("AS-03 scoring and release invariants passed.");
