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
  points_awarded = CASE
    WHEN proof.is_correct IS TRUE THEN 1
    WHEN proof.is_correct IS FALSE THEN 0
    ELSE NULL
  END,
  scoring_version = CASE WHEN proof.is_correct IS NULL THEN NULL ELSE 'kuis-frozen-form-v1' END
FROM (
  SELECT
    answer_row.id,
    CASE
      WHEN jsonb_typeof(option_row->'isCorrect') = 'boolean'
        THEN (option_row->>'isCorrect')::boolean
      ELSE NULL
    END AS is_correct
  FROM standalone_quiz_answers answer_row
  JOIN standalone_quiz_attempts attempt_row ON attempt_row.id = answer_row.attempt_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(attempt_row.form_snapshot->'items') = 'array' THEN attempt_row.form_snapshot->'items'
      ELSE '[]'::jsonb
    END
  ) item_row
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(item_row->'options') = 'array' THEN item_row->'options'
      ELSE '[]'::jsonb
    END
  ) option_row
  WHERE jsonb_typeof(attempt_row.form_snapshot) = 'object'
    AND jsonb_typeof(attempt_row.form_snapshot->'items') = 'array'
    AND item_row->>'id' = answer_row.quiz_item_id::text
    AND option_row->>'id' = answer_row.selected_option_id::text
) proof
WHERE answer.id = proof.id;

WITH kuis_proof AS (
  SELECT
    attempt.id,
    CASE
      WHEN jsonb_typeof(attempt.form_snapshot->'items') = 'array'
        THEN jsonb_array_length(attempt.form_snapshot->'items')
      ELSE 0
    END AS total_count,
    COUNT(answer.id)::integer AS answered_count,
    COUNT(answer.id) FILTER (WHERE answer.is_correct IS NOT NULL)::integer AS materialized_count,
    COALESCE(SUM(CASE WHEN answer.is_correct THEN 1 ELSE 0 END), 0)::integer AS correct_count
  FROM standalone_quiz_attempts attempt
  LEFT JOIN standalone_quiz_answers answer ON answer.attempt_id = attempt.id
  WHERE attempt.status::text IN ('submitted', 'auto_submitted', 'expired', 'scored')
    AND jsonb_typeof(attempt.form_snapshot) = 'object'
    AND jsonb_typeof(attempt.form_snapshot->'items') = 'array'
    AND CASE
      WHEN jsonb_typeof(attempt.form_snapshot->'items') = 'array'
        THEN jsonb_array_length(attempt.form_snapshot->'items') > 0
      ELSE FALSE
    END
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
      AND quiz.closes_at IS NOT NULL
      AND (attempt.submitted_at IS NULL OR quiz.closes_at > attempt.submitted_at)
      THEN 'scheduled'::assessment_result_release_state
    WHEN quiz.review_timing::text = 'after_close' AND quiz.closes_at IS NULL
      THEN 'hidden'::assessment_result_release_state
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
  points_awarded = CASE
    WHEN proof.is_correct IS TRUE THEN proof.points
    WHEN proof.is_correct IS FALSE THEN 0
    ELSE NULL
  END,
  scoring_version = CASE WHEN proof.is_correct IS NULL OR proof.points IS NULL THEN NULL ELSE 'tryout-frozen-run-v1' END
FROM (
  SELECT
    answer_row.id,
    CASE
      WHEN jsonb_typeof(option_row->'isCorrect') = 'boolean'
        THEN (option_row->>'isCorrect')::boolean
      ELSE NULL
    END AS is_correct,
    CASE
      WHEN (item_row->>'points') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN CASE
          WHEN (item_row->>'points')::numeric BETWEEN -9999.99 AND 9999.99
            THEN (item_row->>'points')::numeric
          ELSE NULL
        END
      ELSE NULL
    END AS points
  FROM tryout_answers answer_row
  JOIN tryout_attempt_test_runs run_row ON run_row.id = answer_row.attempt_test_run_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(run_row.content_snapshot->'items') = 'array' THEN run_row.content_snapshot->'items'
      ELSE '[]'::jsonb
    END
  ) item_row
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(item_row->'options') = 'array' THEN item_row->'options'
      ELSE '[]'::jsonb
    END
  ) option_row
  WHERE jsonb_typeof(run_row.content_snapshot) = 'object'
    AND jsonb_typeof(run_row.content_snapshot->'items') = 'array'
    AND item_row->>'id' = answer_row.tryout_item_id::text
    AND option_row->>'id' = answer_row.selected_option_id::text
) proof
WHERE answer.id = proof.id;

WITH run_counts AS (
  SELECT
    run_row.id,
    COUNT(answer_row.id) FILTER (WHERE answer_row.selected_option_id IS NOT NULL)::integer AS answered_count,
    COUNT(answer_row.id) FILTER (WHERE answer_row.is_correct IS TRUE)::integer AS correct_count,
    CASE
      WHEN jsonb_typeof(run_row.cat_snapshot->'selectedItemIds') = 'array'
        THEN jsonb_array_length(run_row.cat_snapshot->'selectedItemIds')
      ELSE CASE
        WHEN jsonb_typeof(run_row.content_snapshot->'items') = 'array'
          THEN jsonb_array_length(run_row.content_snapshot->'items')
        ELSE 0
      END
    END AS delivered_count
  FROM tryout_attempt_test_runs run_row
  LEFT JOIN tryout_answers answer_row ON answer_row.attempt_test_run_id = run_row.id
  WHERE jsonb_typeof(run_row.content_snapshot) = 'object'
    AND jsonb_typeof(run_row.content_snapshot->'items') = 'array'
  GROUP BY run_row.id, run_row.cat_snapshot, run_row.content_snapshot
)
UPDATE tryout_attempt_test_runs run_row
SET
  correct_count = counts.correct_count,
  wrong_count = counts.answered_count - counts.correct_count,
  unanswered_count = counts.delivered_count - counts.answered_count
FROM run_counts counts
WHERE run_row.id = counts.id;

-- Typed run fields are copied from the immutable calculation result. The
-- calculation JSON remains intact for replay and audit.
UPDATE tryout_attempt_test_runs run_row
SET
  raw_score = CASE
    WHEN jsonb_typeof(run_row.calculation_result->'score') = 'number'
      THEN CASE
        WHEN (run_row.calculation_result->>'score')::numeric BETWEEN -999999.9999 AND 999999.9999
          THEN (run_row.calculation_result->>'score')::numeric
        ELSE run_row.raw_score
      END
    WHEN jsonb_typeof(run_row.calculation_result->'ability') = 'number'
      THEN CASE
        WHEN (run_row.calculation_result->>'ability')::numeric BETWEEN -999999.9999 AND 999999.9999
          THEN (run_row.calculation_result->>'ability')::numeric
        ELSE run_row.raw_score
      END
    ELSE run_row.raw_score
  END,
  max_score = CASE
    WHEN jsonb_typeof(run_row.calculation_result->'maxScore') = 'number'
      THEN CASE
        WHEN (run_row.calculation_result->>'maxScore')::numeric BETWEEN -999999.9999 AND 999999.9999
          THEN (run_row.calculation_result->>'maxScore')::numeric
        ELSE run_row.max_score
      END
    ELSE run_row.max_score
  END,
  scaled_score = CASE
    WHEN jsonb_typeof(run_row.calculation_result->'normalizedScore') = 'number'
      THEN CASE
        WHEN (run_row.calculation_result->>'normalizedScore')::numeric BETWEEN 0 AND 100
          THEN (run_row.calculation_result->>'normalizedScore')::numeric
        ELSE run_row.scaled_score
      END
    ELSE run_row.scaled_score
  END,
  normalized_score = CASE
    WHEN jsonb_typeof(run_row.calculation_result->'normalizedScore') = 'number'
      THEN CASE
        WHEN (run_row.calculation_result->>'normalizedScore')::numeric BETWEEN 0 AND 100
          THEN (run_row.calculation_result->>'normalizedScore')::numeric
        ELSE run_row.normalized_score
      END
    ELSE run_row.normalized_score
  END,
  scoring_version = COALESCE(run_row.calculation_version, 'legacy-calculation-json'),
  scoring_state = 'scored'::assessment_scoring_state,
  scoring_provenance = 'legacy_provable'::assessment_scoring_provenance,
  scoring_review_reason = NULL
WHERE run_row.status::text IN ('sealed', 'expired')
  AND run_row.calculation_releaseable
  AND run_row.cat_state::text <> 'voided'
  AND run_row.calculation_version IN ('cbt-frozen-item-points-v1', '2pl-map-v1')
  AND jsonb_typeof(run_row.calculation_result) = 'object'
  AND jsonb_typeof(run_row.calculation_result->'normalizedScore') = 'number'
  AND (run_row.calculation_result->>'normalizedScore')::numeric BETWEEN 0 AND 100
  AND (
    run_row.cat_snapshot IS NOT NULL
    OR run_row.raw_score = (
      SELECT COALESCE(SUM(answer_row.points_awarded), 0)::numeric
      FROM tryout_answers answer_row
      WHERE answer_row.attempt_test_run_id = run_row.id
    )
  )
  AND (
    run_row.cat_snapshot IS NULL
    OR (
      jsonb_typeof(run_row.cat_snapshot->'currentAbility') = 'number'
      AND run_row.raw_score = (run_row.cat_snapshot->>'currentAbility')::numeric
    )
  )
  AND (
    run_row.cat_snapshot IS NOT NULL
    OR (
      run_row.max_score IS NOT NULL
      AND run_row.max_score > 0
      AND run_row.normalized_score = ROUND(LEAST(100, GREATEST(0, (run_row.raw_score / run_row.max_score) * 100)), 2)
    )
  )
  AND run_row.max_score = (
    SELECT COALESCE(SUM(
      CASE
        WHEN (item_row->>'points') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN CASE
            WHEN (item_row->>'points')::numeric BETWEEN -9999.99 AND 9999.99
              THEN (item_row->>'points')::numeric
            ELSE 0
          END
        ELSE 0
      END
    ), 0)::numeric
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(run_row.content_snapshot->'items') = 'array' THEN run_row.content_snapshot->'items'
        ELSE '[]'::jsonb
      END
    ) item_row
    WHERE run_row.cat_snapshot IS NULL
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(run_row.cat_snapshot->'selectedItemIds') = 'array' THEN run_row.cat_snapshot->'selectedItemIds'
            ELSE '[]'::jsonb
          END
        ) selected_item
        WHERE selected_item = item_row->>'id'
      )
  )
  AND (
    run_row.cat_snapshot IS NULL
    OR (
      jsonb_typeof(run_row.cat_snapshot->'currentAbility') = 'number'
      AND run_row.normalized_score = ROUND(LEAST(100, GREATEST(0, (1 / (1 + EXP(-((run_row.cat_snapshot->>'currentAbility')::numeric)))) * 100)), 2)
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM tryout_answers answer_row
    WHERE answer_row.attempt_test_run_id = run_row.id
      AND answer_row.selected_option_id IS NOT NULL
      AND answer_row.is_correct IS NULL
  );

UPDATE tryout_attempt_test_runs run_row
SET
  scoring_state = 'review_required'::assessment_scoring_state,
  scoring_provenance = 'legacy_unknown'::assessment_scoring_provenance,
  scoring_review_reason = 'Legacy terminal run lacks a complete immutable calculation result.'
WHERE run_row.status::text IN ('sealed', 'expired')
  AND run_row.scoring_state <> 'scored'::assessment_scoring_state;

-- Attempts become scored only from exactly seven valid materialized runs.
WITH canonical_sections AS (
  SELECT tp.id AS tryout_id, COUNT(section.id)::integer AS section_count
  FROM tryout_packages tp
  LEFT JOIN tryout_sections section ON section.tryout_id = tp.id
  GROUP BY tp.id
), valid_runs AS (
  SELECT
    attempt.id,
    COUNT(run.id)::integer AS run_count,
    COALESCE(SUM(run.correct_count), 0)::integer AS correct_count,
    COALESCE(SUM(run.wrong_count), 0)::integer AS wrong_count,
    COALESCE(SUM(run.unanswered_count), 0)::integer AS unanswered_count,
    AVG(run.normalized_score)::numeric(7,2) AS normalized_score,
    SUM(run.raw_score)::numeric(10,4) AS raw_score
  FROM tryout_attempts attempt
  JOIN canonical_sections expected ON expected.tryout_id = attempt.tryout_id AND expected.section_count = 7
  JOIN tryout_attempt_test_runs run ON run.attempt_id = attempt.id
  JOIN tryout_sections section
    ON section.id = run.tryout_section_id
   AND section.tryout_id = attempt.tryout_id
   AND section.sequence_no = run.sequence_no
  WHERE attempt.status::text IN ('submitted', 'auto_submitted', 'expired', 'scored')
    AND attempt.attempt_state::text NOT IN ('in_progress', 'abandoned', 'void')
    AND jsonb_typeof(run.content_snapshot) = 'object'
    AND jsonb_typeof(run.content_snapshot->'items') = 'array'
    AND (
      run.cat_snapshot IS NULL
      OR jsonb_typeof(run.cat_snapshot->'selectedItemIds') = 'array'
    )
    AND (
      run.cat_snapshot IS NULL
      OR (
        CASE
          WHEN jsonb_typeof(run.cat_snapshot->'selectedItemIds') = 'array'
            THEN jsonb_array_length(run.cat_snapshot->'selectedItemIds') > 0
          ELSE FALSE
        END
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(run.cat_snapshot->'selectedItemIds') = 'array' THEN run.cat_snapshot->'selectedItemIds'
              ELSE '[]'::jsonb
            END
          ) selected_item
          WHERE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(run.content_snapshot->'items') = 'array' THEN run.content_snapshot->'items'
                ELSE '[]'::jsonb
              END
            ) item_row
            WHERE item_row->>'id' = selected_item
          )
        )
      )
    )
    AND (
      run.cat_snapshot IS NULL
      OR CASE
        WHEN jsonb_typeof(run.cat_snapshot->'selectedItemIds') = 'array'
          THEN jsonb_array_length(run.cat_snapshot->'selectedItemIds') = (
            SELECT COUNT(DISTINCT selected_item)::integer
            FROM jsonb_array_elements_text(run.cat_snapshot->'selectedItemIds') selected_item
          )
        ELSE FALSE
      END
    )
    AND NOT EXISTS (
      SELECT 1
      FROM tryout_answers answer_row
      WHERE answer_row.attempt_test_run_id = run.id
        AND (
          (
            run.cat_snapshot IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(run.cat_snapshot->'selectedItemIds') selected_item
              WHERE selected_item = answer_row.tryout_item_id::text
            )
          )
          OR NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(run.content_snapshot->'items') = 'array' THEN run.content_snapshot->'items'
                ELSE '[]'::jsonb
              END
            ) item_row
            WHERE item_row->>'id' = answer_row.tryout_item_id::text
          )
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(run.content_snapshot->'items') = 'array' THEN run.content_snapshot->'items'
          ELSE '[]'::jsonb
        END
      ) item_row
      WHERE (
        run.cat_snapshot IS NULL
        OR jsonb_typeof(run.cat_snapshot->'selectedItemIds') <> 'array'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(run.cat_snapshot->'selectedItemIds') = 'array' THEN run.cat_snapshot->'selectedItemIds'
              ELSE '[]'::jsonb
            END
          ) selected_item
          WHERE selected_item = item_row->>'id'
        )
      )
      AND NULLIF(btrim(item_row->>'explanation'), '') IS NULL
      AND NULLIF(btrim(item_row->>'explanationAssetId'), '') IS NULL
    )
  GROUP BY attempt.id
  HAVING COUNT(run.id) = 7
     AND COUNT(DISTINCT run.tryout_section_id) = 7
     AND COUNT(DISTINCT run.sequence_no) = 7
     AND COUNT(DISTINCT section.id) = 7
     AND COUNT(DISTINCT section.subtest_id) = 7
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
  scaled_score = COALESCE(attempt.score, ROUND(matching.normalized_score, 2)),
  score = COALESCE(attempt.score, ROUND(matching.normalized_score, 2))
FROM matching_attempts matching
WHERE attempt.id = matching.id;

-- Materialize one typed breakdown per canonical Test before any historical
-- release is preserved. Existing legacy rows are updated from the canonical
-- run first; the insert below only fills a missing row. This makes the
-- reporting contract independent of the legacy calculation JSON and keeps the
-- operation idempotent even though topic_id is nullable in the legacy key.
WITH canonical_breakdowns AS (
  SELECT
    run.attempt_id,
    section.subtest_id,
    COALESCE(run.correct_count, 0) AS correct_count,
    COALESCE(run.wrong_count, 0) AS wrong_count,
    COALESCE(run.unanswered_count, 0) AS unanswered_count,
    run.raw_score,
    run.scaled_score,
    run.normalized_score,
    COALESCE(run.scoring_version, 'normalized-test-mean-v1') AS scoring_version
  FROM tryout_attempt_test_runs run
  JOIN tryout_attempts attempt ON attempt.id = run.attempt_id
  JOIN tryout_sections section
    ON section.id = run.tryout_section_id
   AND section.tryout_id = attempt.tryout_id
   AND section.sequence_no = run.sequence_no
  WHERE attempt.scoring_state = 'scored'::assessment_scoring_state
    AND attempt.scoring_provenance = 'legacy_provable'::assessment_scoring_provenance
    AND run.scoring_state = 'scored'::assessment_scoring_state
    AND run.normalized_score IS NOT NULL
)
UPDATE tryout_score_breakdowns existing
SET
  correct_count = canonical.correct_count,
  wrong_count = canonical.wrong_count,
  unanswered_count = canonical.unanswered_count,
  raw_score = canonical.raw_score,
  scaled_score = canonical.scaled_score,
  normalized_score = canonical.normalized_score,
  scoring_version = canonical.scoring_version,
  scoring_provenance = 'legacy_provable'::assessment_scoring_provenance
FROM canonical_breakdowns canonical
WHERE existing.attempt_id = canonical.attempt_id
  AND existing.subtest_id = canonical.subtest_id
  AND existing.topic_id IS NULL;

WITH canonical_breakdowns AS (
  SELECT
    run.attempt_id,
    section.subtest_id,
    COALESCE(run.correct_count, 0) AS correct_count,
    COALESCE(run.wrong_count, 0) AS wrong_count,
    COALESCE(run.unanswered_count, 0) AS unanswered_count,
    run.raw_score,
    run.scaled_score,
    run.normalized_score,
    COALESCE(run.scoring_version, 'normalized-test-mean-v1') AS scoring_version
  FROM tryout_attempt_test_runs run
  JOIN tryout_attempts attempt ON attempt.id = run.attempt_id
  JOIN tryout_sections section
    ON section.id = run.tryout_section_id
   AND section.tryout_id = attempt.tryout_id
   AND section.sequence_no = run.sequence_no
  WHERE attempt.scoring_state = 'scored'::assessment_scoring_state
    AND attempt.scoring_provenance = 'legacy_provable'::assessment_scoring_provenance
    AND run.scoring_state = 'scored'::assessment_scoring_state
    AND run.normalized_score IS NOT NULL
)
INSERT INTO tryout_score_breakdowns (
  attempt_id,
  subtest_id,
  topic_id,
  correct_count,
  wrong_count,
  unanswered_count,
  raw_score,
  scaled_score,
  normalized_score,
  scoring_version,
  scoring_provenance
)
SELECT
  canonical.attempt_id,
  canonical.subtest_id,
  NULL,
  canonical.correct_count,
  canonical.wrong_count,
  canonical.unanswered_count,
  canonical.raw_score,
  canonical.scaled_score,
  canonical.normalized_score,
  canonical.scoring_version,
  'legacy_provable'::assessment_scoring_provenance
FROM canonical_breakdowns canonical
WHERE NOT EXISTS (
    SELECT 1
    FROM tryout_score_breakdowns existing
    WHERE existing.attempt_id = canonical.attempt_id
      AND existing.subtest_id = canonical.subtest_id
      AND existing.topic_id IS NULL
  );

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
  WHEN released_at IS NOT NULL AND ranking_rule::text <> 'none' THEN 'released'::assessment_result_release_state
  WHEN result_release_policy::text = 'scheduled'
    AND scheduled_release_at IS NOT NULL
    AND ranking_rule::text <> 'none'
    THEN 'scheduled'::assessment_result_release_state
  ELSE 'hidden'::assessment_result_release_state
END;

WITH breakdown_status AS (
  SELECT
    attempt_row.id AS attempt_id,
    COUNT(breakdown.id) = 7
      AND COUNT(DISTINCT breakdown.subtest_id) = 7
      AND COUNT(breakdown.id) FILTER (WHERE breakdown.subtest_id IN (
        SELECT section.subtest_id
        FROM tryout_sections section
        WHERE section.tryout_id = attempt_row.tryout_id
      )) = 7
      AND COALESCE(BOOL_AND(
        breakdown.normalized_score IS NOT NULL
        AND breakdown.raw_score IS NOT NULL
        AND breakdown.scaled_score IS NOT NULL
        AND breakdown.scoring_version IS NOT NULL
        AND breakdown.scoring_provenance <> 'legacy_unknown'::assessment_scoring_provenance
      ), FALSE) AS is_ready
  FROM tryout_attempts attempt_row
  LEFT JOIN tryout_score_breakdowns breakdown
    ON breakdown.attempt_id = attempt_row.id
   AND breakdown.topic_id IS NULL
  GROUP BY attempt_row.id, attempt_row.tryout_id
)
UPDATE tryout_attempts attempt
SET release_state = CASE
  WHEN session.release_state = 'released'::assessment_result_release_state
    AND attempt.scoring_state = 'scored'::assessment_scoring_state
    AND attempt.score IS NOT NULL
    AND session.ranking_rule::text <> 'none'
    AND breakdown.is_ready
    THEN 'released'::assessment_result_release_state
  WHEN session.release_state = 'scheduled'::assessment_result_release_state
    AND attempt.scoring_state = 'scored'::assessment_scoring_state
    AND attempt.score IS NOT NULL
    AND session.ranking_rule::text <> 'none'
    AND breakdown.is_ready
    THEN 'scheduled'::assessment_result_release_state
  ELSE 'hidden'::assessment_result_release_state
END,
release_at = CASE
  WHEN session.release_state = 'released'::assessment_result_release_state
    AND attempt.scoring_state = 'scored'::assessment_scoring_state
    AND attempt.score IS NOT NULL
    AND session.ranking_rule::text <> 'none'
    AND breakdown.is_ready
    THEN session.released_at
  WHEN session.release_state = 'scheduled'::assessment_result_release_state
    AND attempt.scoring_state = 'scored'::assessment_scoring_state
    AND attempt.score IS NOT NULL
    AND session.ranking_rule::text <> 'none'
    AND breakdown.is_ready
    THEN session.scheduled_release_at
  ELSE NULL
END
FROM tryout_delivery_sessions session,
  breakdown_status breakdown
WHERE attempt.delivery_session_id = session.id
  AND breakdown.attempt_id = attempt.id;

CREATE INDEX standalone_quiz_attempts_scoring_state_idx
  ON standalone_quiz_attempts (scoring_state, release_state);
CREATE INDEX tryout_attempts_scoring_state_idx
  ON tryout_attempts (scoring_state, release_state);
CREATE INDEX tryout_attempt_test_runs_scoring_state_idx
  ON tryout_attempt_test_runs (scoring_state);
