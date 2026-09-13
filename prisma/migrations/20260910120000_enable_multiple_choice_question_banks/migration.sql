-- Ticket 05: allow reusable Bank Soal questions to declare either one
-- correct answer or several correct answers. Existing published revisions and
-- legacy scalar projections remain valid; the authoring layer still carries
-- the scalar field for old readers.

ALTER TABLE "questions"
  DROP CONSTRAINT IF EXISTS "questions_bank_single_choice_check",
  ADD CONSTRAINT "questions_bank_choice_type_check"
    CHECK (question_bank_id IS NULL OR question_type IN ('single_choice', 'multiple_choice'));

-- The legacy QuestionOption projection is still written for compatibility.
-- Keep its old exact-one rule for standalone/free-text rows, while applying the
-- bank question's answer mode to reusable rows.
CREATE OR REPLACE FUNCTION "assessment_enforce_option_shape"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  q UUID := COALESCE(NEW.question_id, OLD.question_id);
  bank_id UUID;
  answer_mode question_type;
  option_count INTEGER;
  correct_count INTEGER;
BEGIN
  SELECT question_bank_id, question_type
    INTO bank_id, answer_mode
    FROM questions
   WHERE id = q;

  SELECT count(*), count(*) FILTER (WHERE is_correct)
    INTO option_count, correct_count
    FROM question_options
   WHERE question_id = q;

  IF option_count > 0 AND (
    option_count < 2
    OR option_count > 5
    OR (bank_id IS NOT NULL AND answer_mode = 'single_choice' AND correct_count <> 1)
    OR (bank_id IS NOT NULL AND answer_mode = 'multiple_choice' AND correct_count < 1)
    OR (bank_id IS NOT NULL AND answer_mode NOT IN ('single_choice', 'multiple_choice'))
    OR (bank_id IS NULL AND correct_count <> 1)
  ) THEN
    RAISE EXCEPTION 'Question options require 2-5 choices and a valid answer key for the question type' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

-- QuestionRevision readiness runs after the option rows are present. The
-- existing digest and immutable-history checks remain unchanged; only the
-- answer-count predicate is widened for Bank Soal multiple-choice revisions.
CREATE OR REPLACE FUNCTION "assessment_reject_question_revision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  option_count INTEGER;
  correct_count INTEGER;
  options_ready BOOLEAN;
  expected_digest VARCHAR(128);
  question_bank_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'QuestionRevision rows are append-only' USING ERRCODE = '55000';
  END IF;

  IF TG_OP <> 'INSERT' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.revision_no IS DISTINCT FROM OLD.revision_no
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'QuestionRevision identity and author are immutable' USING ERRCODE = '55000';
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.status IN ('ready', 'retired') THEN
    IF NEW.stem IS DISTINCT FROM OLD.stem
      OR NEW.question_type IS DISTINCT FROM OLD.question_type
      OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
      OR NEW.explanation IS DISTINCT FROM OLD.explanation
      OR NEW.prompt_asset_id IS DISTINCT FROM OLD.prompt_asset_id
      OR NEW.explanation_asset_id IS DISTINCT FROM OLD.explanation_asset_id
      OR NEW.content_digest IS DISTINCT FROM OLD.content_digest
      OR NEW.provenance IS DISTINCT FROM OLD.provenance
      OR (OLD.status = 'retired' AND NEW.status IS DISTINCT FROM OLD.status)
      OR (OLD.status = 'ready' AND NEW.status NOT IN ('ready', 'retired'))
    THEN
      RAISE EXCEPTION 'Ready or retired QuestionRevision content is immutable' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF NEW.status = 'ready' THEN
    SELECT question_bank_id INTO question_bank_id FROM questions WHERE id = NEW.question_id;
    SELECT encode(
      digest(
        concat(
          encode(convert_to('question-revision-digest-v1', 'UTF8'), 'hex'), ':',
          encode(convert_to(NEW.difficulty::text, 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(NEW.explanation, ''), 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(NEW.explanation_asset_id::text, ''), 'UTF8'), 'hex'), ':',
          COALESCE((
            SELECT string_agg(
              concat(
                encode(convert_to(COALESCE(revision_option.asset_id::text, ''), 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.content, 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.is_correct::text, 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.label, 'UTF8'), 'hex'), ':',
                encode(convert_to(revision_option.sort_order::text, 'UTF8'), 'hex')
              ), ':' ORDER BY revision_option.sort_order, revision_option.label
            )
            FROM question_revision_options revision_option
            WHERE revision_option.question_revision_id = NEW.id
          ), ''), ':',
          encode(convert_to(NEW.stem, 'UTF8'), 'hex'), ':',
          encode(convert_to(COALESCE(NEW.prompt_asset_id::text, ''), 'UTF8'), 'hex'), ':',
          encode(convert_to(NEW.question_type::text, 'UTF8'), 'hex')
        ),
        'sha256'
      ),
      'hex'
    ) INTO expected_digest;
    IF NEW.content_digest IS DISTINCT FROM expected_digest THEN
      RAISE EXCEPTION 'QuestionRevision content digest does not match its content' USING ERRCODE = '23514';
    END IF;
    SELECT COUNT(*)::int,
           COUNT(*) FILTER (WHERE is_correct)::int,
           COALESCE(BOOL_AND(BTRIM(content) <> '' AND (asset_id IS NULL OR EXISTS (
             SELECT 1 FROM assets
             WHERE assets.id = question_revision_options.asset_id
               AND assets.state = 'ready'
           ))), TRUE)
      INTO option_count, correct_count, options_ready
      FROM question_revision_options
     WHERE question_revision_id = NEW.id;
    IF BTRIM(NEW.stem) = ''
      OR option_count < 2
      OR option_count > 5
      OR (
        CASE
          WHEN question_bank_id IS NOT NULL AND NEW.question_type = 'multiple_choice' THEN correct_count < 1
          ELSE correct_count <> 1
        END
      )
      OR NOT options_ready
      OR (NEW.prompt_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assets WHERE assets.id = NEW.prompt_asset_id AND assets.state = 'ready'))
      OR (NEW.explanation_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM assets WHERE assets.id = NEW.explanation_asset_id AND assets.state = 'ready'))
    THEN
      RAISE EXCEPTION 'QuestionRevision does not satisfy Ready content requirements' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
