import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, migration] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260912180000_retire_cat_compatibility_schema/migration.sql", import.meta.url), "utf8"),
]);

assert.match(migration, /^(?:--[^\n]*\n|\s)*BEGIN;\s/u, "schema retirement must be transactional");
assert.match(migration, /COMMIT;\s*$/u, "schema retirement must commit only after all guards pass");
assert.match(migration, /cbt\.schema_retirement_ack/u, "schema retirement requires an explicit acknowledgement");
assert.match(migration, /RETIRE_CAT_SCHEMA/u, "schema retirement acknowledgement must be specific");
assert.match(migration, /cbt\.schema_retirement_snapshot_id/u, "schema retirement requires a recoverable snapshot marker");
assert.match(migration, /cbt\.schema_retirement_database/u, "schema retirement must bind to the current database");

for (const expression of [
  /test_type::text = 'cat'/u,
  /cat_item_count IS NOT NULL OR cat_model_version IS NOT NULL/u,
  /cat_state::text <> 'not_applicable'/u,
  /cat_snapshot IS NOT NULL/u,
  /cat_failure_reason IS NOT NULL/u,
  /assembly_cat_calibration IS NOT NULL/u,
  /mode::text = 'cat_pool'/u,
  /FROM two_pl_question_calibrations/u,
  /FROM tryout_cat_resolution_audits/u,
]) {
  assert.match(migration, expression, `retirement guard is missing ${expression}`);
}

for (const expression of [
  /DROP COLUMN assembly_cat_calibration/u,
  /DROP COLUMN cat_failure_reason/u,
  /DROP COLUMN cat_snapshot/u,
  /DROP COLUMN cat_state/u,
  /DROP COLUMN cat_item_count/u,
  /DROP COLUMN cat_model_version/u,
  /DROP TABLE tryout_cat_resolution_audits/u,
  /DROP TABLE two_pl_question_calibrations/u,
  /DROP TYPE tryout_cat_run_state/u,
  /CREATE TYPE reusable_question_package_mode_new AS ENUM \('fixed_set', 'random_pool', 'blueprint'\)/u,
  /CREATE TYPE tryout_test_type_new AS ENUM \('cbt'\)/u,
  /DROP TYPE reusable_question_package_mode_old/u,
  /DROP TYPE tryout_test_type_old/u,
]) {
  assert.match(migration, expression, `schema retirement is missing ${expression}`);
}

assert.doesNotMatch(migration, /DROP DATABASE|TRUNCATE|CASCADE\s*;/iu, "schema retirement must not widen its scope to a database reset");
const targetedDeletes = migration.match(/DELETE\s+FROM\s+(?:two_pl_question_calibrations|tryout_cat_resolution_audits)\b/giu) ?? [];
assert.equal(targetedDeletes.length, 2, "schema retirement must delete only the two retired CAT compatibility tables");
assert.doesNotMatch(
  migration.replace(/DELETE\s+FROM\s+(?:two_pl_question_calibrations|tryout_cat_resolution_audits)\b/giu, ""),
  /DELETE\s+FROM/iu,
  "schema retirement must not delete data outside the two retired CAT compatibility tables",
);

const validatorBody = migration.slice(
  migration.indexOf("CREATE OR REPLACE FUNCTION assessment_prepare_reusable_package_version_ready"),
  migration.indexOf("ALTER TABLE assessment_releases\n  ADD CONSTRAINT"),
);
assert.doesNotMatch(validatorBody, /cat_pool|assembly_cat_calibration|CAT Pool|CAT calibration/iu, "recreated validators must be CBT-only");
assert.match(validatorBody, /CREATE OR REPLACE FUNCTION assessment_validate_release_assembly_identity/u);
assert.match(validatorBody, /CREATE OR REPLACE FUNCTION standalone_quiz_validate_assembly_binding/u);
assert.match(validatorBody, /CREATE OR REPLACE FUNCTION assessment_validate_reusable_package_version_definition/u);
assert.match(validatorBody, /CREATE OR REPLACE FUNCTION assessment_prepare_reusable_package_version_ready/u);
assert.match(validatorBody, /CREATE TRIGGER assessment_releases_validate_assembly_identity/u);
assert.match(validatorBody, /CREATE TRIGGER standalone_quizzes_validate_assembly_binding/u);
assert.match(validatorBody, /CREATE CONSTRAINT TRIGGER reusable_qpv_definition_version_guard/u);
assert.match(migration, /assessment_releases_assembly_json_shape_check/u);

assert.doesNotMatch(schema, /cat_pool|TryoutCatRunState|TwoPlQuestionCalibration|TryoutCatResolutionAudit|cat_item_count|cat_model_version|cat_state|cat_snapshot|cat_failure_reason|assembly_cat_calibration/u, "Prisma schema must not retain CAT compatibility objects");

console.log("CBT-only schema retirement contract passed.");
