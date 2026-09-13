import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../prisma/migrations/20260822130000_add_random_assembly_schema/migration.sql", import.meta.url), "utf8");

assert.match(schema, /enum ReusableQuestionPackageMode \{[\s\S]*fixed_set[\s\S]*random_pool[\s\S]*blueprint/u);
assert.doesNotMatch(schema, /cat_pool|assemblyCatCalibration/u, "CAT package mode and release metadata must be absent from the Prisma schema");
assert.match(schema, /enum ReusableQuestionPackageVersionProvenance \{/u);
assert.match(schema, /mode\s+ReusableQuestionPackageMode @default\(fixed_set\)/u);
assert.match(schema, /@@index\(\[mode, status\]\)/u);
assert.match(schema, /model ReusableQuestionPackageVersionBankScope \{/u);
assert.match(schema, /model ReusableQuestionPackageVersionFolderScope \{/u);
assert.match(schema, /model ReusableQuestionPackageVersionCategoryScope \{/u);
assert.match(schema, /model ReusableQuestionPackageVersionRule \{/u);
assert.match(schema, /definitionDigest String\?\s+@map\("definition_digest"\)/u);
assert.match(schema, /assemblyResolvedSourceIds Json\?/u);
assert.match(schema, /assemblyResolvedRevisionDigests Json\?/u);

assert.match(migration, /CREATE TYPE "reusable_question_package_mode" AS ENUM/u);
assert.match(migration, /ADD COLUMN "mode" "reusable_question_package_mode" NOT NULL DEFAULT 'fixed_set'/u);
assert.match(migration, /UPDATE "reusable_question_package_versions"/u);
assert.match(migration, /"provenance" = CASE[\s\S]*legacy_unknown[\s\S]*legacy_provable/u);
assert.match(migration, /INSERT INTO "reusable_question_package_version_bank_scopes"/u);
assert.match(migration, /reusable_qpv_rule_quota_sum_check/u);
assert.match(migration, /reusable_qpv_definition_version_guard/u);
assert.match(migration, /reusable_question_package_version_bank_scopes_ready_immutable/u);
assert.match(migration, /assessment_prepare_reusable_package_version_ready/u);
assert.match(migration, /assessment_compute_reusable_package_version_definition_digest/u);
assert.match(migration, /fixed reusable package versions cannot carry folder, category, or rule definitions/u);
assert.match(migration, /old_version_id IS NOT NULL/u);
const legacyVersionTriggerDrop = migration.indexOf(
  'DROP TRIGGER IF EXISTS reusable_question_package_versions_ready_immutable',
);
const versionMetadataBackfill = migration.indexOf('UPDATE "reusable_question_package_versions"');
const replacementVersionTrigger = migration.indexOf(
  'CREATE TRIGGER reusable_question_package_versions_ready_immutable',
);
assert.ok(
  legacyVersionTriggerDrop >= 0
    && versionMetadataBackfill > legacyVersionTriggerDrop
    && replacementVersionTrigger > versionMetadataBackfill,
  "The Ready-version trigger must be replaced around the one-time metadata backfill.",
);
assert.match(migration, /assessment_releases_assembly_package_version_fkey/u);
assert.match(migration, /assessment_releases_validate_assembly_identity/u);
assert.match(migration, /assembly release must reference a Ready package version/u);
assert.match(migration, /Pool releases require complete seeded resolution metadata/u);
assert.match(migration, /Blueprint releases require complete seeded resolution metadata/u);
assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/u);

console.log("Random assembly schema contract passed.");
