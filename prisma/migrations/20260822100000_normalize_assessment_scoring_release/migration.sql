-- AS-03: keep attempt, scoring, and result-release state independent while
-- retaining the legacy status columns and immutable runtime snapshots.
--
-- Existing terminal rows are conservative: only rows whose frozen snapshot
-- and stored result can be reconciled are marked legacy_provable/scored.
-- Everything else remains readable as historical data but is explicitly
-- review_required; no score or correctness is invented by this migration.

CREATE TYPE assessment_attempt_state AS ENUM (
  'in_progress',
  'submitted',
  'auto_submitted',
  'expired',
  'abandoned',
  'void'
);

CREATE TYPE assessment_scoring_state AS ENUM (
  'pending',
  'scored',
  'review_required',
  'recalculating'
);

CREATE TYPE assessment_result_release_state AS ENUM (
  'hidden',
  'scheduled',
  'released'
);

CREATE TYPE assessment_scoring_provenance AS ENUM (
  'runtime',
  'legacy_provable',
  'legacy_unknown'
);

ALTER TABLE standalone_quiz_attempts
  ADD COLUMN attempt_state assessment_attempt_state NOT NULL DEFAULT 'in_progress',
  ADD COLUMN scoring_state assessment_scoring_state NOT NULL DEFAULT 'pending',
  ADD COLUMN release_state assessment_result_release_state NOT NULL DEFAULT 'hidden',
  ADD COLUMN wrong_count integer,
  ADD COLUMN unanswered_count integer,
  ADD COLUMN max_points numeric(8,2),
  ADD COLUMN earned_points numeric(8,2),
  ADD COLUMN scoring_version varchar(120),
  ADD COLUMN scoring_provenance assessment_scoring_provenance NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN scoring_review_reason text,
  ADD COLUMN release_at timestamptz;

ALTER TABLE standalone_quiz_answers
  ADD COLUMN is_correct boolean,
  ADD COLUMN points_awarded numeric(8,2),
  ADD COLUMN scoring_version varchar(120);

ALTER TABLE tryout_delivery_sessions
  ADD COLUMN release_state assessment_result_release_state NOT NULL DEFAULT 'hidden',
  ADD COLUMN release_reason text;

ALTER TABLE tryout_attempts
  ADD COLUMN attempt_state assessment_attempt_state NOT NULL DEFAULT 'in_progress',
  ADD COLUMN scoring_state assessment_scoring_state NOT NULL DEFAULT 'pending',
  ADD COLUMN release_state assessment_result_release_state NOT NULL DEFAULT 'hidden',
  ADD COLUMN correct_count integer,
  ADD COLUMN wrong_count integer,
  ADD COLUMN unanswered_count integer,
  ADD COLUMN raw_score numeric(10,4),
  ADD COLUMN scaled_score numeric(7,2),
  ADD COLUMN normalized_score numeric(7,2),
  ADD COLUMN scoring_version varchar(120),
  ADD COLUMN scoring_provenance assessment_scoring_provenance NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN scoring_review_reason text,
  ADD COLUMN release_at timestamptz;

ALTER TABLE tryout_attempt_test_runs
  ADD COLUMN scoring_state assessment_scoring_state NOT NULL DEFAULT 'pending',
  ADD COLUMN scoring_version varchar(120),
  ADD COLUMN scoring_provenance assessment_scoring_provenance NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN scoring_review_reason text,
  ADD COLUMN correct_count integer,
  ADD COLUMN wrong_count integer,
  ADD COLUMN unanswered_count integer,
  ADD COLUMN raw_score numeric(10,4),
  ADD COLUMN max_score numeric(10,4),
  ADD COLUMN scaled_score numeric(7,2),
  ADD COLUMN normalized_score numeric(7,2);

ALTER TABLE tryout_answers
  ADD COLUMN scoring_version varchar(120);

ALTER TABLE tryout_score_breakdowns
  ADD COLUMN normalized_score numeric(7,2),
  ADD COLUMN scoring_version varchar(120),
  ADD COLUMN scoring_provenance assessment_scoring_provenance NOT NULL DEFAULT 'legacy_unknown';

-- Keep new rows on the runtime provenance while historical rows retain their
-- conservative legacy default after the explicit backfill below.
ALTER TABLE standalone_quiz_attempts ALTER COLUMN scoring_provenance SET DEFAULT 'runtime';
ALTER TABLE tryout_attempts ALTER COLUMN scoring_provenance SET DEFAULT 'runtime';
ALTER TABLE tryout_attempt_test_runs ALTER COLUMN scoring_provenance SET DEFAULT 'runtime';
ALTER TABLE tryout_score_breakdowns ALTER COLUMN scoring_provenance SET DEFAULT 'runtime';

-- Preserve the old status for compatibility but expose a canonical attempt
-- state for the two supported runtime families.
UPDATE standalone_quiz_attempts
SET attempt_state = CASE status::text
  WHEN 'auto_submitted' THEN 'auto_submitted'::assessment_attempt_state
  WHEN 'expired' THEN 'expired'::assessment_attempt_state
  WHEN 'abandoned' THEN 'abandoned'::assessment_attempt_state
  WHEN 'in_progress' THEN 'in_progress'::assessment_attempt_state
  ELSE 'submitted'::assessment_attempt_state
END;

UPDATE tryout_attempts
SET attempt_state = CASE status::text
  WHEN 'auto_submitted' THEN 'auto_submitted'::assessment_attempt_state
  WHEN 'expired' THEN 'expired'::assessment_attempt_state
  WHEN 'abandoned' THEN 'abandoned'::assessment_attempt_state
  WHEN 'in_progress' THEN 'in_progress'::assessment_attempt_state
  ELSE 'submitted'::assessment_attempt_state
END;

-- Materialize Kuis answer correctness only when the answer ID is present in
-- the immutable form snapshot. A malformed or drifted row is intentionally
-- left null and will keep its attempt in review_required.
UPDATE standalone_quiz_answers answer
SET
  is_correct = proof.is_correct,
  points_awarded = CASE WHEN proof.is_correct THEN 1 ELSE 0 END,
  scoring_version = 'kuis-frozen-form-v1'
FROM (
  SELECT
    answer_row.id,
    (option_row->>'isCorrect')::boolean AS is_correct
  FROM standalone_quiz_answers answer_row
  JOIN standalone_quiz_attempts attempt_row ON attempt_row.id = answer_row.attempt_id
  CROSS JOIN LATERAL jsonb_array_elements(attempt_row.form_snapshot->'items') item_row
  CROSS JOIN LATERAL jsonb_array_elements(item_row->'options') option_row
  WHERE jsonb_typeof(attempt_row.form_snapshot) = 'object'
    AND jsonb_typeof(attempt_row.form_snapshot->'items') = 'array'
    AND item_row->>'id' = answer_row.quiz_item_id::text
    AND option_row->>'id' = answer_row.selected_option_id::text
) proof
WHERE answer.id = proof.id;

WITH kuis_proof AS (
  SELECT
    attempt.id,
    jsonb_array_length(attempt.form_snapshot->'items') AS total_count,
    COUNT(answer.id)::integer AS answered_count,
    COUNT(answer.id) FILTER (WHERE answer.is_correct IS NOT NULL)::integer AS materialized_count,
    COALESCE(SUM((answer.is_correct)::integer), 0)::integer AS correct_count
  FROM standalone_quiz_attempts attempt
  LEFT JOIN standalone_quiz_answers answer ON answer.attempt_id = attempt.id
  WHERE attempt.status::text IN ('submitted', 'auto_submitted', 'expired', 'scored')
    AND jsonb_typeof(attempt.form_snapshot) = 'object'
    AND jsonb_typeof(attempt.form_snapshot->'items') = 'array'
    AND jsonb_array_length(attempt.form_snapshot->'items') > 0
    AND attempt.correct_count IS NOT NULL
    AND attempt.score IS NOT NULL
  GROUP BY attempt.id, attempt.form_snapshot
), kuis_valid AS (
  SELECT proof.*
  FROM kuis_proof proof
  JOIN standalone_quiz_attempts attempt ON attempt.id = proof.id
  WHERE proof.answered_count = proof.materialized_count
    AND proof.correct_count = attempt.correct_count
    AND attempt.correct_count BETWEEN 0 AND proof.total_count
    AND attempt.score = ROUND((proof.correct_count::numeric / proof.total_count::numeric) * 100)
)
UPDATE standalone_quiz_attempts attempt
SET
  scoring_state = 'scored'::assessment_scoring_state,
  scoring_provenance = 'legacy_provable'::assessment_scoring_provenance,
  scoring_version = 'kuis-frozen-form-v1',
  scoring_review_reason = NULL,
  wrong_count = valid.total_count - valid.correct_count - (valid.total_count - valid.answered_count),
  unanswered_count = valid.total_count - valid.answered_count,
  max_points = valid.total_count,
  earned_points = valid.correct_count
FROM kuis_valid valid
WHERE attempt.id = valid.id;

UPDATE standalone_quiz_attempts attempt
SET
  scoring_state = 'review_required'::assessment_scoring_state,
  scoring_provenance = 'legacy_unknown'::assessment_scoring_provenance,
  scoring_review_reason = 'Legacy terminal attempt lacks a provable immutable form/result reconciliation.'
WHERE attempt.status::text IN ('submitted', 'auto_submitted', 'expired', 'scored')
  AND attempt.scoring_state <> 'scored'::assessment_scoring_state;

-- Kuis release state follows the frozen policy, but an unproven score never
-- becomes visible merely because its old status was terminal.
UPDATE standalone_quiz_attempts attempt
SET
  release_state = CASE
    WHEN attempt.scoring_state <> 'scored'::assessment_scoring_state THEN 'hidden'::assessment_result_release_state
    WHEN quiz.review_timing::text = 'never' THEN 'hidden'::assessment_result_release_state
    WHEN quiz.review_timing::text = 'after_close'
      AND (quiz.closes_at IS NULL OR attempt.submitted_at IS NULL OR quiz.closes_at > attempt.submitted_at)
      THEN 'scheduled'::assessment_result_release_state
    ELSE 'released'::assessment_result_release_state
  END,
  release_at = CASE
    WHEN attempt.scoring_state = 'scored'::assessment_scoring_state
      AND quiz.review_timing::text = 'after_close'
      AND quiz.closes_at IS NOT NULL
      AND (attempt.submitted_at IS NULL OR quiz.closes_at > attempt.submitted_at)
      THEN quiz.closes_at
    ELSE NULL
  END
FROM standalone_quiz_participations participation
JOIN standalone_quizzes quiz ON quiz.id = participation.quiz_id
WHERE attempt.participation_id = participation.id;

-- Run answers can be reconciled against their immutable run snapshot without
-- consulting mutable TryoutItem/Option rows.
UPDATE tryout_answers answer
SET
  is_correct = proof.is_correct,
  points_awarded = CASE WHEN proof.is_correct THEN proof.points ELSE 0 END,
  scoring_version = 'tryout-frozen-run-v1'
FROM (
  SELECT
    answer_row.id,
    (option_row->>'isCorrect')::boolean AS is_correct,
    (item_row->>'points')::numeric AS points
  FROM tryout_answers answer_row
  JOIN tryout_attempt_test_runs run_row ON run_row.id = answer_row.attempt_test_run_id
  CROSS JOIN LATERAL jsonb_array_elements(run_row.content_snapshot->'items') item_row
  CROSS JOIN LATERAL jsonb_array_elements(item_row->'options') option_row
  WHERE jsonb_typeof(run_row.content_snapshot) = 'object'
    AND jsonb_typeof(run_row.content_snapshot->'items') = 'array'
    AND item_row->>'id' = answer_row.tryout_item_id::text
    AND option_row->>'id' = answer_row.selected_option_id::text
) proof
WHERE answer.id = proof.id;

-- Typed run fields are copied from the immutable calculation result. The
-- calculation JSON remains intact for replay and audit.
UPDATE tryout_attempt_test_runs run_row
SET
  correct_count = NULLIF(run_row.calculation_result->>'correctCount', '')::integer,
  wrong_count = NULLIF(run_row.calculation_result->>'wrongCount', '')::integer,
  unanswered_count = NULLIF(run_row.calculation_result->>'unansweredCount', '')::integer,
  raw_score = COALESCE(NULLIF(run_row.calculation_result->>'score', '')::numeric, NULLIF(run_row.calculation_result->>'ability', '')::numeric),
  max_score = NULLIF(run_row.calculation_result->>'maxScore', '')::numeric,
  scaled_score = NULLIF(run_row.calculation_result->>'normalizedScore', '')::numeric,
  normalized_score = NULLIF(run_row.calculation_result->>'normalizedScore', '')::numeric,
  scoring_version = COALESCE(run_row.calculation_version, 'legacy-calculation-json'),
  scoring_state = 'scored'::assessment_scoring_state,
  scoring_provenance = 'legacy_provable'::assessment_scoring_provenance,
  scoring_review_reason = NULL
WHERE run_row.status::text IN ('sealed', 'expired')
  AND run_row.calculation_releaseable
  AND run_row.cat_state::text <> 'voided'
  AND jsonb_typeof(run_row.calculation_result) = 'object'
  AND NULLIF(run_row.calculation_result->>'normalizedScore', '') IS NOT NULL;

UPDATE tryout_attempt_test_runs run_row
SET
  scoring_state = 'review_required'::assessment_scoring_state,
  scoring_provenance = 'legacy_unknown'::assessment_scoring_provenance,
  scoring_review_reason = 'Legacy terminal run lacks a complete immutable calculation result.'
WHERE run_row.status::text IN ('sealed', 'expired')
  AND run_row.scoring_state <> 'scored'::assessment_scoring_state;

-- Attempts become scored only from exactly seven valid materialized runs.
WITH valid_runs AS (
  SELECT
    attempt.id,
    COUNT(run.id)::integer AS run_count,
    COALESCE(SUM(run.correct_count), 0)::integer AS correct_count,
    COALESCE(SUM(run.wrong_count), 0)::integer AS wrong_count,
    COALESCE(SUM(run.unanswered_count), 0)::integer AS unanswered_count,
    AVG(run.normalized_score)::numeric(7,2) AS normalized_score,
    AVG(run.raw_score)::numeric(10,4) AS raw_score
  FROM tryout_attempts attempt
  JOIN tryout_attempt_test_runs run ON run.attempt_id = attempt.id
  WHERE attempt.status::text IN ('submitted', 'auto_submitted', 'expired', 'scored')
  GROUP BY attempt.id
  HAVING COUNT(run.id) = 7
     AND BOOL_AND(run.scoring_state = 'scored'::assessment_scoring_state)
     AND BOOL_AND(run.calculation_releaseable)
     AND BOOL_AND(run.cat_state::text <> 'voided')
     AND BOOL_AND(run.normalized_score IS NOT NULL)
), matching_attempts AS (
  SELECT valid.*
  FROM valid_runs valid
  JOIN tryout_attempts attempt ON attempt.id = valid.id
  WHERE attempt.score IS NULL OR ROUND(attempt.score, 2) = ROUND(valid.normalized_score, 2)
)
UPDATE tryout_attempts attempt
SET
  scoring_state = 'scored'::assessment_scoring_state,
  scoring_provenance = 'legacy_provable'::assessment_scoring_provenance,
  scoring_version = 'normalized-test-mean-v1',
  scoring_review_reason = NULL,
  correct_count = matching.correct_count,
  wrong_count = matching.wrong_count,
  unanswered_count = matching.unanswered_count,
  raw_score = matching.raw_score,
  normalized_score = COALESCE(attempt.score, ROUND(matching.normalized_score, 2)),
  scaled_score = COALESCE(attempt.score, ROUND(matching.normalized_score, 2))
FROM matching_attempts matching
WHERE attempt.id = matching.id;

UPDATE tryout_attempts attempt
SET
  scoring_state = 'review_required'::assessment_scoring_state,
  scoring_provenance = 'legacy_unknown'::assessment_scoring_provenance,
  scoring_review_reason = 'Legacy terminal attempt does not have exactly seven provable scored runs.'
WHERE attempt.status::text IN ('submitted', 'auto_submitted', 'expired', 'scored')
  AND attempt.scoring_state <> 'scored'::assessment_scoring_state;

-- Existing manual releases remain released. Other policies stay hidden or
-- scheduled until the new idempotent release command evaluates readiness.
UPDATE tryout_delivery_sessions
SET release_state = CASE
  WHEN released_at IS NOT NULL THEN 'released'::assessment_result_release_state
  WHEN result_release_policy::text = 'scheduled' THEN 'scheduled'::assessment_result_release_state
  ELSE 'hidden'::assessment_result_release_state
END;

UPDATE tryout_attempts attempt
SET release_state = CASE
  WHEN session.release_state = 'released'::assessment_result_release_state THEN 'released'::assessment_result_release_state
  WHEN session.release_state = 'scheduled'::assessment_result_release_state THEN 'scheduled'::assessment_result_release_state
  ELSE 'hidden'::assessment_result_release_state
END,
release_at = CASE
  WHEN session.release_state = 'released'::assessment_result_release_state THEN session.released_at
  WHEN session.release_state = 'scheduled'::assessment_result_release_state THEN session.scheduled_release_at
  ELSE NULL
END
FROM tryout_delivery_sessions session
WHERE attempt.delivery_session_id = session.id;

CREATE INDEX standalone_quiz_attempts_scoring_state_idx
  ON standalone_quiz_attempts (scoring_state, release_state);
CREATE INDEX tryout_attempts_scoring_state_idx
  ON tryout_attempts (scoring_state, release_state);
CREATE INDEX tryout_attempt_test_runs_scoring_state_idx
  ON tryout_attempt_test_runs (scoring_state);
