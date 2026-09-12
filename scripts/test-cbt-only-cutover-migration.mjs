import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationPath = resolve("prisma/migrations/20260912120000_cbt_only_remove_cat_data/migration.sql");
const sql = await readFile(migrationPath, "utf8");

assert.match(sql, /^(?:--[^\n]*\n|\s)*BEGIN;\s/u, "the CAT cleanup must be transactional");
assert.match(sql, /COMMIT;\s*$/u, "the CAT cleanup must commit only after all guards pass");
assert.match(sql, /CREATE TEMP TABLE _cbt_cat_tryouts/u, "the migration must inventory CAT Tryout roots");
assert.match(sql, /cbt\.cutover_ack/u, "the migration must require an explicit deletion acknowledgement");
assert.match(sql, /cbt\.cutover_snapshot_id/u, "the migration must require a recoverable snapshot marker");
assert.match(sql, /cbt\.cutover_database/u, "the migration must bind the deletion to the named database");
assert.match(sql, /CREATE TEMP TABLE _cbt_cat_attempts/u, "the migration must inventory CAT attempts");
assert.match(sql, /CREATE TEMP TABLE _cbt_cat_package_versions/u, "the migration must inventory package-version roots");
assert.match(sql, /package.mode::text = 'cat_pool'/u, "the migration must inventory orphaned CAT pools");
assert.match(sql, /INSERT INTO _cbt_cat_package_versions[\s\S]*?ON CONFLICT DO NOTHING/u, "the migration must inventory every version under a CAT pool");
assert.match(sql, /CAT package version is shared with a non-CAT assessment/u, "shared package references must fail closed");
assert.match(sql, /CAT package is referenced outside the CAT Tryout set/u, "shared package references must fail closed");
assert.match(sql, /CAT Tryout sections remain/u, "the post-delete CAT section assertion is required");
assert.match(sql, /CAT package pools remain/u, "the post-delete CAT package assertion is required");
assert.match(sql, /DROP TRIGGER IF EXISTS assessment_releases_append_only[\s\S]*?CREATE TRIGGER assessment_releases_append_only/u, "the destructive release deletion must restore the append-only trigger before commit");
assert.match(sql, /DROP TRIGGER IF EXISTS reusable_question_package_versions_ready_immutable[\s\S]*?CREATE TRIGGER reusable_question_package_versions_ready_immutable/u, "the destructive package-version deletion must restore its immutability trigger before commit");
assert.doesNotMatch(sql, /DROP DATABASE|TRUNCATE|CASCADE\s*;/iu, "the migration must not widen deletion beyond named rows");
assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|ALTER TYPE/iu, "schema-object removal is a separately reviewed follow-up after legacy readers are gone");

console.log("CBT-only cutover migration contract passed.");
