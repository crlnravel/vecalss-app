-- Final destructive assessment cutover. This migration is intentionally direct.
-- Populated environments must first pass Ticket 1's allowlisted reset and
-- fence installation; clean resets bootstrap the same fence below.
--
-- The reset guard normally installs this fence before a production cutover. A
-- clean `prisma migrate reset`, however, starts with no data and no prior
-- maintenance transaction, so bootstrap the same fence here when it is absent.
-- The postcondition checks below still fail closed for any non-empty or
-- unexpected assessment data, and the fence is dropped only after those checks
-- pass.
CREATE OR REPLACE FUNCTION assessment_prototype_reset_block_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assessment prototype reset fence blocks % on %', TG_OP, TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION assessment_prototype_reset_block_tryout_reference() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_tryout_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'assessment prototype reset fence blocks Tryout performance references' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target_schema text := current_schema();
  assessment_table text;
  trigger_name text;
BEGIN
  FOREACH assessment_table IN ARRAY ARRAY['offline_answer_buffers','question_banks','question_options','questions','standalone_quiz_attempts','standalone_quiz_items','standalone_quizzes','tryout_answers','tryout_items','tryout_packages','tryout_score_breakdowns','tryout_sections','tryout_sessions'] LOOP
    trigger_name := 'assessment_prototype_reset_fence_' || assessment_table;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal
        AND n.nspname = target_schema
        AND c.relname = assessment_table
        AND t.tgname = trigger_name
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.%I()',
        trigger_name,
        target_schema,
        assessment_table,
        target_schema,
        'assessment_prototype_reset_block_write'
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = target_schema
      AND c.relname = 'student_subtest_performance'
      AND t.tgname = 'assessment_prototype_reset_fence_tryout_reference'
  ) THEN
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF last_tryout_session_id ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.%I()',
      'assessment_prototype_reset_fence_tryout_reference',
      target_schema,
      'student_subtest_performance',
      target_schema,
      'assessment_prototype_reset_block_tryout_reference'
    );
  END IF;
END $$;

DO $$
DECLARE
  target_schema text := current_schema();
  assessment_table text;
  has_rows boolean;
  required_tables text[] := ARRAY['standalone_quizzes','standalone_quiz_items','standalone_quiz_attempts','question_banks','questions','question_options','tryout_packages','tryout_sections','tryout_items','tryout_sessions','tryout_answers','offline_answer_buffers','tryout_score_breakdowns'];
  fenced_tables text[] := ARRAY['offline_answer_buffers','question_banks','question_options','questions','standalone_quiz_attempts','standalone_quiz_items','standalone_quizzes','tryout_answers','tryout_items','tryout_packages','tryout_score_breakdowns','tryout_sections','tryout_sessions'];
BEGIN
  FOREACH assessment_table IN ARRAY required_tables LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', assessment_table) INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'final assessment schema requires reset-empty %, found rows', assessment_table USING ERRCODE = '55000';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM student_subtest_performance WHERE last_tryout_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'final assessment schema requires no student tryout references' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = target_schema AND p.proname = 'assessment_prototype_reset_block_write'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = target_schema AND p.proname = 'assessment_prototype_reset_block_tryout_reference'
  ) THEN
    RAISE EXCEPTION 'Ticket 1 assessment reset fence functions are absent' USING ERRCODE = '55000';
  END IF;
  FOREACH assessment_table IN ARRAY fenced_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE NOT t.tgisinternal AND n.nspname = target_schema AND pn.nspname = target_schema AND c.relname = assessment_table
        AND t.tgname = 'assessment_prototype_reset_fence_' || assessment_table
        AND p.proname = 'assessment_prototype_reset_block_write'
    ) THEN RAISE EXCEPTION 'Ticket 1 assessment reset fence is absent or malformed for %', assessment_table USING ERRCODE = '55000'; END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname = target_schema AND pn.nspname = target_schema AND c.relname = 'student_subtest_performance'
      AND t.tgname='assessment_prototype_reset_fence_tryout_reference'
      AND p.proname='assessment_prototype_reset_block_tryout_reference'
  ) THEN RAISE EXCEPTION 'Ticket 1 performance fence is absent or malformed' USING ERRCODE = '55000'; END IF;
END $$;

-- The fence was proven above; remove it only within this migration transaction.
DO $$
DECLARE
  target_schema text := current_schema();
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['offline_answer_buffers','question_banks','question_options','questions','standalone_quiz_attempts','standalone_quiz_items','standalone_quizzes','tryout_answers','tryout_items','tryout_packages','tryout_score_breakdowns','tryout_sections','tryout_sessions'] LOOP
    EXECUTE format('DROP TRIGGER %I ON %I.%I', 'assessment_prototype_reset_fence_' || t, target_schema, t);
  END LOOP;
  EXECUTE format('DROP TRIGGER %I ON %I.%I', 'assessment_prototype_reset_fence_tryout_reference', target_schema, 'student_subtest_performance');
  EXECUTE format('DROP FUNCTION %I.%I()', target_schema, 'assessment_prototype_reset_block_write');
  EXECUTE format('DROP FUNCTION %I.%I()', target_schema, 'assessment_prototype_reset_block_tryout_reference');
END $$;

ALTER TABLE question_banks DROP COLUMN subtest_id, DROP COLUMN topic_id,
  ADD COLUMN code varchar(100) NOT NULL, ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE question_banks ALTER COLUMN created_by_user_id SET NOT NULL, ALTER COLUMN updated_by_user_id SET NOT NULL;
CREATE UNIQUE INDEX question_banks_code_key ON question_banks(code);

CREATE TABLE tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(40) NOT NULL UNIQUE, slug varchar(60) NOT NULL UNIQUE, label varchar(120) NOT NULL);
CREATE TABLE question_bank_tags (question_bank_id uuid NOT NULL, tag_id uuid NOT NULL, PRIMARY KEY(question_bank_id, tag_id), FOREIGN KEY(question_bank_id) REFERENCES question_banks(id) ON DELETE RESTRICT, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE RESTRICT);
CREATE INDEX question_bank_tags_tag_id_question_bank_id_idx ON question_bank_tags(tag_id, question_bank_id);

ALTER TABLE questions ADD COLUMN code varchar(120) NOT NULL, ADD COLUMN subtest_id uuid,
  ADD COLUMN prompt_asset_id uuid, ADD COLUMN explanation_asset_id uuid, ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE questions ALTER COLUMN created_by_user_id SET NOT NULL, ALTER COLUMN updated_by_user_id SET NOT NULL;
ALTER TABLE questions ALTER COLUMN topic_id DROP NOT NULL;
ALTER TABLE questions ADD CONSTRAINT questions_code_key UNIQUE(code), ADD CONSTRAINT questions_subtest_id_fkey FOREIGN KEY(subtest_id) REFERENCES subtests(id) ON DELETE RESTRICT,
  ADD CONSTRAINT questions_prompt_asset_id_fkey FOREIGN KEY(prompt_asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT questions_explanation_asset_id_fkey FOREIGN KEY(explanation_asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT questions_bank_or_topic_check CHECK (question_bank_id IS NOT NULL OR topic_id IS NOT NULL),
  ADD CONSTRAINT questions_bank_requires_subtest_check CHECK (question_bank_id IS NULL OR subtest_id IS NOT NULL),
  ADD CONSTRAINT questions_bank_single_choice_check CHECK (question_bank_id IS NULL OR question_type = 'single_choice');
CREATE INDEX questions_subtest_id_idx ON questions(subtest_id);
ALTER TABLE question_options ADD COLUMN asset_id uuid, ADD CONSTRAINT question_options_asset_id_fkey FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE RESTRICT, ADD CONSTRAINT question_options_question_id_sort_order_key UNIQUE(question_id, sort_order);

ALTER TABLE standalone_quizzes DROP COLUMN subject_code,
  ADD COLUMN subtest_id uuid NOT NULL, ADD COLUMN source_bank_id uuid, ADD COLUMN revision integer NOT NULL DEFAULT 1, ADD COLUMN idempotency_key varchar(120);
ALTER TABLE standalone_quizzes ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE standalone_quizzes ADD CONSTRAINT standalone_quizzes_subtest_id_fkey FOREIGN KEY(subtest_id) REFERENCES subtests(id) ON DELETE RESTRICT,
  ADD CONSTRAINT standalone_quizzes_source_bank_id_fkey FOREIGN KEY(source_bank_id) REFERENCES question_banks(id) ON DELETE RESTRICT,
  ADD CONSTRAINT standalone_quizzes_idempotency_key_key UNIQUE(idempotency_key);
DROP INDEX IF EXISTS standalone_quizzes_subject_code_status_idx;
CREATE INDEX standalone_quizzes_subtest_id_status_idx ON standalone_quizzes(subtest_id, status);
ALTER TABLE standalone_quiz_items DROP COLUMN choices, DROP COLUMN correct_key, DROP COLUMN origin, DROP COLUMN source_id,
  ADD COLUMN difficulty difficulty_level NOT NULL DEFAULT 'medium', ADD COLUMN subtest_id uuid NOT NULL, ADD COLUMN source_question_id uuid,
  ADD COLUMN prompt_asset_id uuid, ADD COLUMN explanation_asset_id uuid, ADD COLUMN idempotency_key varchar(120);
ALTER TABLE standalone_quiz_items ADD CONSTRAINT standalone_quiz_items_subtest_id_fkey FOREIGN KEY(subtest_id) REFERENCES subtests(id) ON DELETE RESTRICT,
  ADD CONSTRAINT standalone_quiz_items_source_question_id_fkey FOREIGN KEY(source_question_id) REFERENCES questions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT standalone_quiz_items_prompt_asset_id_fkey FOREIGN KEY(prompt_asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT standalone_quiz_items_explanation_asset_id_fkey FOREIGN KEY(explanation_asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT standalone_quiz_items_quiz_id_idempotency_key_key UNIQUE(quiz_id,idempotency_key);
CREATE TABLE standalone_quiz_item_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quiz_item_id uuid NOT NULL REFERENCES standalone_quiz_items(id) ON DELETE CASCADE, choice_key varchar(64) NOT NULL, content text NOT NULL, is_correct boolean NOT NULL DEFAULT false, sort_order integer NOT NULL, source_question_option_id uuid REFERENCES question_options(id) ON DELETE RESTRICT, asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT, UNIQUE(quiz_item_id,choice_key), UNIQUE(quiz_item_id,sort_order));

ALTER TABLE tryout_items DROP CONSTRAINT tryout_items_question_id_fkey, DROP COLUMN question_id,
  ADD COLUMN tryout_id uuid NOT NULL, ADD COLUMN source_question_id uuid, ADD COLUMN prompt text NOT NULL, ADD COLUMN explanation text,
  ADD COLUMN difficulty difficulty_level NOT NULL DEFAULT 'medium', ADD COLUMN subtest_id uuid NOT NULL, ADD COLUMN package_code varchar(80) NOT NULL,
  ADD COLUMN prompt_asset_id uuid, ADD COLUMN explanation_asset_id uuid, ADD COLUMN idempotency_key varchar(120);
ALTER TABLE tryout_sections ADD CONSTRAINT tryout_sections_tryout_id_subtest_id_key UNIQUE(tryout_id,subtest_id);
ALTER TABLE tryout_items ADD CONSTRAINT tryout_items_tryout_id_fkey FOREIGN KEY(tryout_id) REFERENCES tryout_packages(id),
  ADD CONSTRAINT tryout_items_source_question_id_fkey FOREIGN KEY(source_question_id) REFERENCES questions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tryout_items_subtest_id_fkey FOREIGN KEY(subtest_id) REFERENCES subtests(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tryout_items_prompt_asset_id_fkey FOREIGN KEY(prompt_asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tryout_items_explanation_asset_id_fkey FOREIGN KEY(explanation_asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tryout_items_tryout_id_source_question_id_key UNIQUE(tryout_id,source_question_id),
  ADD CONSTRAINT tryout_items_tryout_id_idempotency_key_key UNIQUE(tryout_id,idempotency_key), ADD CONSTRAINT tryout_items_id_tryout_id_key UNIQUE(id,tryout_id);
CREATE TABLE tryout_item_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tryout_item_id uuid NOT NULL REFERENCES tryout_items(id) ON DELETE CASCADE, choice_key varchar(64) NOT NULL, content text NOT NULL, is_correct boolean NOT NULL DEFAULT false, sort_order integer NOT NULL, source_question_option_id uuid REFERENCES question_options(id) ON DELETE RESTRICT, asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT, UNIQUE(tryout_item_id,choice_key), UNIQUE(tryout_item_id,sort_order), UNIQUE(id,tryout_item_id));
ALTER TABLE tryout_packages ADD COLUMN revision integer NOT NULL DEFAULT 1, ADD COLUMN idempotency_key varchar(120) UNIQUE;
ALTER TABLE tryout_packages ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE tryout_sessions DROP COLUMN offline_buffer_cleared_at, ADD CONSTRAINT tryout_sessions_tryout_id_student_id_key UNIQUE(tryout_id,student_id), ADD CONSTRAINT tryout_sessions_id_tryout_id_key UNIQUE(id,tryout_id);
ALTER TABLE tryout_answers DROP CONSTRAINT tryout_answers_question_id_fkey, DROP CONSTRAINT tryout_answers_selected_option_id_fkey, DROP COLUMN question_id, DROP COLUMN source,
  ADD COLUMN tryout_id uuid NOT NULL, ADD COLUMN tryout_item_id uuid NOT NULL;
ALTER TABLE tryout_answers ADD CONSTRAINT tryout_answers_session_package_fkey FOREIGN KEY(session_id,tryout_id) REFERENCES tryout_sessions(id,tryout_id),
  ADD CONSTRAINT tryout_answers_item_package_fkey FOREIGN KEY(tryout_item_id,tryout_id) REFERENCES tryout_items(id,tryout_id),
  ADD CONSTRAINT tryout_answers_option_item_fkey FOREIGN KEY(selected_option_id,tryout_item_id) REFERENCES tryout_item_options(id,tryout_item_id),
  ADD CONSTRAINT tryout_answers_session_id_tryout_item_id_key UNIQUE(session_id,tryout_item_id);
DROP TABLE offline_answer_buffers;

CREATE OR REPLACE FUNCTION assessment_reject_question_bank_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QuestionBank physical delete is forbidden' USING ERRCODE = '55000'; END $$;
CREATE TRIGGER question_banks_reject_delete BEFORE DELETE ON question_banks FOR EACH ROW EXECUTE FUNCTION assessment_reject_question_bank_delete();
CREATE OR REPLACE FUNCTION assessment_enforce_option_shape() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE q uuid := COALESCE(NEW.question_id,OLD.question_id); n integer; c integer; BEGIN SELECT count(*), count(*) FILTER (WHERE is_correct) INTO n,c FROM question_options WHERE question_id=q; IF n > 0 AND (n < 2 OR n > 5 OR c <> 1) THEN RAISE EXCEPTION 'Question options require 2-5 choices and exactly one correct choice' USING ERRCODE='23514'; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER question_options_shape AFTER INSERT OR UPDATE OR DELETE ON question_options DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assessment_enforce_option_shape();
