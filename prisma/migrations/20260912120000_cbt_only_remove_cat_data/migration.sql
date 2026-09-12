-- CBT-only cutover, phase 1 (destructive data cleanup; intentionally not applied).
--
-- This migration removes CAT Tryout aggregates and CAT-only package data in a
-- single transaction. It is deliberately fail-closed when a package version
-- is shared with a Kuis or a non-CAT Tryout. The nullable CAT columns/enums
-- remain as a compatibility projection for the staged application rollout;
-- dropping those schema objects belongs in a later migration after all
-- legacy readers have been removed and a fresh Prisma client is generated.
--
-- Apply only to an explicitly snapshotted target after the application has
-- been deployed with CBT-only writes. Never run this against a live target
-- without a recoverable snapshot and an owner for rollback.

BEGIN;

DO $$
DECLARE
  acknowledgement text := current_setting('cbt.cutover_ack', true);
  snapshot_id text := current_setting('cbt.cutover_snapshot_id', true);
  target_database text := current_setting('cbt.cutover_database', true);
BEGIN
  -- Prisma deploy does not know whether an operator has a recoverable
  -- snapshot. Require explicit session settings so an accidental deploy
  -- cannot start this deletion.
  IF acknowledgement IS DISTINCT FROM 'REMOVE_CAT'
     OR snapshot_id IS NULL OR length(trim(snapshot_id)) = 0
     OR target_database IS NULL OR target_database <> current_database() THEN
    RAISE EXCEPTION 'CBT cutover requires cbt.cutover_ack=REMOVE_CAT, cbt.cutover_snapshot_id, and cbt.cutover_database=current_database()';
  END IF;
END $$;

CREATE TEMP TABLE _cbt_cat_tryouts ON COMMIT DROP AS
SELECT DISTINCT section.tryout_id
  FROM tryout_sections AS section
 WHERE section.test_type::text = 'cat';

CREATE INDEX _cbt_cat_tryouts_id_idx ON _cbt_cat_tryouts (tryout_id);

CREATE TEMP TABLE _cbt_cat_sessions ON COMMIT DROP AS
SELECT session.id
  FROM tryout_delivery_sessions AS session
  JOIN _cbt_cat_tryouts AS cat ON cat.tryout_id = session.tryout_id;

CREATE TEMP TABLE _cbt_cat_admissions ON COMMIT DROP AS
SELECT admission.id
  FROM tryout_admissions AS admission
  JOIN _cbt_cat_tryouts AS cat ON cat.tryout_id = admission.tryout_id;

CREATE TEMP TABLE _cbt_cat_assignments ON COMMIT DROP AS
SELECT assignment.id
  FROM tryout_delivery_assignments AS assignment
 WHERE assignment.admission_id IN (SELECT id FROM _cbt_cat_admissions)
    OR assignment.delivery_session_id IN (SELECT id FROM _cbt_cat_sessions);

CREATE TEMP TABLE _cbt_cat_attempts ON COMMIT DROP AS
SELECT attempt.id
  FROM tryout_attempts AS attempt
 WHERE attempt.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts)
    OR attempt.delivery_session_id IN (SELECT id FROM _cbt_cat_sessions)
    OR attempt.admission_id IN (SELECT id FROM _cbt_cat_admissions);

CREATE TEMP TABLE _cbt_cat_runs ON COMMIT DROP AS
SELECT run.id
  FROM tryout_attempt_test_runs AS run
 WHERE run.attempt_id IN (SELECT id FROM _cbt_cat_attempts);

CREATE TEMP TABLE _cbt_cat_items ON COMMIT DROP AS
SELECT item.id, item.tryout_id
  FROM tryout_items AS item
 WHERE item.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts);

CREATE TEMP TABLE _cbt_cat_releases ON COMMIT DROP AS
SELECT release.id
  FROM assessment_releases AS release
 WHERE release.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts);

CREATE TEMP TABLE _cbt_cat_package_versions ON COMMIT DROP AS
SELECT DISTINCT package_version_id AS id
  FROM tryout_sections
 WHERE tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts)
   AND package_version_id IS NOT NULL
UNION
SELECT DISTINCT package_version_id AS id
  FROM tryout_items
 WHERE tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts)
   AND package_version_id IS NOT NULL;

CREATE TEMP TABLE _cbt_cat_packages ON COMMIT DROP AS
SELECT package.id
  FROM reusable_question_packages AS package
 WHERE package.mode::text = 'cat_pool'
UNION
SELECT DISTINCT version.package_id AS id
  FROM reusable_question_package_versions AS version
  JOIN _cbt_cat_package_versions AS cat ON cat.id = version.id;

-- A CAT pool can be orphaned from Tryout sections after a failed authoring
-- attempt. Inventory every version below a CAT pool as well, so no CAT-only
-- snapshot survives merely because it was never published into a section.
CREATE UNIQUE INDEX _cbt_cat_package_versions_id_idx ON _cbt_cat_package_versions (id);
INSERT INTO _cbt_cat_package_versions (id)
SELECT version.id
  FROM reusable_question_package_versions AS version
 WHERE version.package_id IN (SELECT id FROM _cbt_cat_packages)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  -- A physical package version cannot be removed if another Tryout or Kuis
  -- still points at it. Abort before any DELETE rather than guessing whether
  -- that reference is CAT-specific.
  IF EXISTS (
    SELECT 1
      FROM reusable_question_package_versions AS version
      JOIN _cbt_cat_package_versions AS cat ON cat.id = version.id
     WHERE EXISTS (
             SELECT 1 FROM tryout_sections AS section
              WHERE section.package_version_id = version.id
                AND section.tryout_id NOT IN (SELECT tryout_id FROM _cbt_cat_tryouts)
           )
        OR EXISTS (
             SELECT 1 FROM tryout_items AS item
              WHERE item.package_version_id = version.id
                AND item.tryout_id NOT IN (SELECT tryout_id FROM _cbt_cat_tryouts)
           )
        OR EXISTS (
             SELECT 1 FROM standalone_quizzes AS quiz
              WHERE quiz.assembly_package_version_id = version.id
           )
        OR EXISTS (
        SELECT 1 FROM standalone_quiz_versions AS quiz_version
              WHERE quiz_version.assembly_package_version_id = version.id
           )
        OR EXISTS (
             SELECT 1 FROM assessment_releases AS release
              WHERE release.assembly_package_version_id = version.id
                AND release.id NOT IN (SELECT id FROM _cbt_cat_releases)
           )
  ) THEN
    RAISE EXCEPTION 'CBT cutover refused: a CAT package version is shared with a non-CAT assessment';
  END IF;

  -- A package-level assembly reference is also a hard stop. The CAT rows can
  -- be retried after an operator explicitly detaches or migrates that owner.
  IF EXISTS (
    SELECT 1
      FROM assessment_releases AS release
      JOIN _cbt_cat_packages AS cat ON cat.id = release.assembly_package_id
     WHERE release.id NOT IN (SELECT id FROM _cbt_cat_releases)
  ) THEN
    RAISE EXCEPTION 'CBT cutover refused: a CAT package is referenced outside the CAT Tryout set';
  END IF;
END $$;

-- Published package versions and AssessmentReleases are normally immutable.
-- This acknowledged destructive cutover is the one exception: remove only
-- the triggers while the transaction is open, then restore them before the
-- commit. A failure rolls the trigger changes back with the transaction.
DROP TRIGGER IF EXISTS assessment_releases_append_only ON assessment_releases;
DROP TRIGGER IF EXISTS reusable_question_package_versions_ready_immutable
  ON reusable_question_package_versions;
DROP TRIGGER IF EXISTS reusable_question_package_version_items_ready_immutable
  ON reusable_question_package_version_items;
DROP TRIGGER IF EXISTS reusable_question_package_version_item_options_ready_immutable
  ON reusable_question_package_version_item_options;
DROP TRIGGER IF EXISTS reusable_question_package_version_bank_scopes_ready_immutable
  ON reusable_question_package_version_bank_scopes;
DROP TRIGGER IF EXISTS reusable_question_package_version_folder_scopes_ready_immutable
  ON reusable_question_package_version_folder_scopes;
DROP TRIGGER IF EXISTS reusable_question_package_version_category_scopes_ready_immutable
  ON reusable_question_package_version_category_scopes;
DROP TRIGGER IF EXISTS reusable_question_package_version_rules_ready_immutable
  ON reusable_question_package_version_rules;

-- Preview restart rows hold Restrict references to CAT delivery rows.
DELETE FROM admin_preview_tryout_restarts AS restart
 WHERE restart.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts)
    OR restart.source_delivery_session_id IN (SELECT id FROM _cbt_cat_sessions)
    OR restart.delivery_session_id IN (SELECT id FROM _cbt_cat_sessions)
    OR restart.assignment_id IN (SELECT id FROM _cbt_cat_assignments);

-- Answers must go before item options, items, runs, and attempts.
DELETE FROM tryout_answers AS answer
 WHERE answer.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts)
    OR answer.attempt_id IN (SELECT id FROM _cbt_cat_attempts)
    OR answer.attempt_test_run_id IN (SELECT id FROM _cbt_cat_runs);

DELETE FROM tryout_integrity_events AS event
 WHERE event.run_id IN (SELECT id FROM _cbt_cat_runs);

DELETE FROM tryout_cat_resolution_audits AS audit
 WHERE audit.run_id IN (SELECT id FROM _cbt_cat_runs);

DELETE FROM tryout_score_breakdowns AS breakdown
 WHERE breakdown.attempt_id IN (SELECT id FROM _cbt_cat_attempts);

-- The aggregate row is shared by all assessment types. Clear only the
-- last-session pointer so a student's CBT history is not deleted accidentally.
UPDATE student_subtest_performance AS performance
   SET last_tryout_session_id = NULL
 WHERE performance.last_tryout_session_id IN (SELECT id FROM _cbt_cat_attempts);

DELETE FROM tryout_attempt_test_runs AS run
 WHERE run.id IN (SELECT id FROM _cbt_cat_runs);

DELETE FROM tryout_attempts AS attempt
 WHERE attempt.id IN (SELECT id FROM _cbt_cat_attempts);

DELETE FROM tryout_delivery_audits AS audit
 WHERE audit.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts)
    OR audit.delivery_session_id IN (SELECT id FROM _cbt_cat_sessions)
    OR audit.admission_id IN (SELECT id FROM _cbt_cat_admissions);

DELETE FROM tryout_delivery_assignments AS assignment
 WHERE assignment.id IN (SELECT id FROM _cbt_cat_assignments);

DELETE FROM tryout_admissions AS admission
 WHERE admission.id IN (SELECT id FROM _cbt_cat_admissions);

DELETE FROM tryout_delivery_sessions AS session
 WHERE session.id IN (SELECT id FROM _cbt_cat_sessions);

DELETE FROM assessment_releases AS release
 WHERE release.id IN (SELECT id FROM _cbt_cat_releases);

DELETE FROM tryout_items AS item
 WHERE item.id IN (SELECT id FROM _cbt_cat_items);

DELETE FROM tryout_sections AS section
 WHERE section.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts);

DELETE FROM tryout_delivery_audits AS audit
 WHERE audit.tryout_id IN (SELECT tryout_id FROM _cbt_cat_tryouts);

DELETE FROM tryout_packages AS pkg
 WHERE pkg.id IN (SELECT tryout_id FROM _cbt_cat_tryouts);

-- Package-version children use ON DELETE CASCADE from the version row. The
-- package itself is deleted only when it is CAT-only and no Restrict owner is
-- left after the earlier fail-closed checks.
DELETE FROM reusable_question_package_versions AS version
 WHERE version.id IN (SELECT id FROM _cbt_cat_package_versions);

DELETE FROM reusable_question_packages AS pkg
 WHERE pkg.id IN (SELECT id FROM _cbt_cat_packages)
   AND pkg.mode::text = 'cat_pool'
   AND NOT EXISTS (
         SELECT 1 FROM reusable_question_package_versions AS version
          WHERE version.package_id = pkg.id
       );

CREATE TRIGGER assessment_releases_append_only
BEFORE UPDATE OR DELETE ON assessment_releases
FOR EACH ROW
EXECUTE FUNCTION protect_assessment_release_append_only();

CREATE TRIGGER reusable_question_package_versions_ready_immutable
  BEFORE UPDATE OR DELETE ON reusable_question_package_versions
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
CREATE TRIGGER reusable_question_package_version_items_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_items
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
CREATE TRIGGER reusable_question_package_version_item_options_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_item_options
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
CREATE TRIGGER reusable_question_package_version_bank_scopes_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_bank_scopes
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
CREATE TRIGGER reusable_question_package_version_folder_scopes_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_folder_scopes
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
CREATE TRIGGER reusable_question_package_version_category_scopes_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_category_scopes
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
CREATE TRIGGER reusable_question_package_version_rules_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_rules
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tryout_sections WHERE test_type::text = 'cat') THEN
    RAISE EXCEPTION 'CBT cutover refused: CAT Tryout sections remain';
  END IF;
  IF EXISTS (SELECT 1 FROM reusable_question_packages WHERE mode::text = 'cat_pool') THEN
    RAISE EXCEPTION 'CBT cutover refused: CAT package pools remain';
  END IF;
END $$;

COMMIT;
