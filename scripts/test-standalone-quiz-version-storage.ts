import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, migration, itemScopingMigration, scheduleMigration, answerContract] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260910100000_add_standalone_quiz_version_storage/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260910160000_scope_standalone_quiz_items_to_versions/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260911100000_add_standalone_quiz_version_schedule/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/answer-contract.ts", import.meta.url), "utf8"),
]);

const versionModel = schema.match(/model StandaloneQuizVersion \{[\s\S]*?^\}/mu)?.[0] ?? "";
const itemModel = schema.match(/model StandaloneQuizItem \{[\s\S]*?^\}/mu)?.[0] ?? "";
const answerModel = schema.match(/model StandaloneQuizAnswer \{[\s\S]*?^\}/mu)?.[0] ?? "";
const commandModel = schema.match(/model StandaloneQuizStartCommand \{[\s\S]*?^\}/mu)?.[0] ?? "";

assert.match(schema, /enum StandaloneQuizVersionState \{[\s\S]*?draft[\s\S]*?active[\s\S]*?superseded/u);
assert.match(schema, /enum StandaloneQuizAnswerFormat \{[\s\S]*?legacy_scalar[\s\S]*?single_option[\s\S]*?multiple_options/u);
assert.match(versionModel, /quizId\s+String/u);
assert.match(versionModel, /baseVersionId\s+String\?/u);
assert.match(versionModel, /definitionDigest\s+String\?/u);
assert.match(versionModel, /publishedAt\s+DateTime\?/u);
assert.match(versionModel, /opensAt\s+DateTime\?/u);
assert.match(versionModel, /closesAt\s+DateTime\?/u);
assert.match(versionModel, /provenance\s+StandaloneQuizVersionProvenance/u);
assert.match(versionModel, /@@unique\(\[quizId, versionNo\]\)/u);
assert.match(itemModel, /quizVersionId\s+String\?/u);
assert.match(itemModel, /questionType\s+QuestionType/u);
assert.match(answerModel, /selectedOptionId\s+String\s+@map\("selected_option_id"\)/u);
assert.match(answerModel, /selectedOptionIds\s+Json\?/u);
assert.match(answerModel, /answerFormat\s+StandaloneQuizAnswerFormat/u);
assert.match(commandModel, /@@unique\(\[quizId, studentId, requestId\]\)/u);

assert.match(migration, /CREATE TYPE "standalone_quiz_version_state"/u);
assert.match(migration, /CREATE TYPE "standalone_quiz_version_provenance"/u);
assert.match(migration, /CREATE TYPE "standalone_quiz_answer_format"/u);
assert.match(migration, /ADD COLUMN "quiz_version_id" UUID/u);
assert.match(migration, /ADD COLUMN "selected_option_ids" JSONB/u);
assert.match(migration, /CREATE TABLE "standalone_quiz_versions"/u);
assert.match(migration, /CREATE TABLE "standalone_quiz_start_commands"/u);
assert.match(migration, /INSERT INTO "standalone_quiz_versions"/u);
assert.match(migration, /UPDATE "standalone_quiz_items" item/u);
assert.match(migration, /UPDATE "standalone_quiz_participations" participation/u);
assert.match(migration, /jsonb_build_array\("selected_option_id"\)/u);
assert.match(migration, /ON CONFLICT \("quiz_id", "student_id", "request_id"\) DO NOTHING/u);
assert.match(migration, /one_active_per_quiz/u);
assert.match(schema, /@@index\(\[quizId, sortOrder\]\)/u);
assert.match(itemScopingMigration, /DROP INDEX IF EXISTS "standalone_quiz_items_quiz_id_sort_order_key"/u);
assert.match(itemScopingMigration, /standalone_quiz_items_quiz_id_sort_order_legacy_key/u);
assert.match(itemScopingMigration, /WHERE "quiz_version_id" IS NULL/u);
assert.match(itemScopingMigration, /standalone_quiz_items_quiz_version_id_sort_order_key/u);
assert.match(itemScopingMigration, /WHERE "quiz_version_id" IS NOT NULL/u);
assert.match(scheduleMigration, /ADD COLUMN "opens_at" TIMESTAMPTZ/u);
assert.match(scheduleMigration, /ADD COLUMN "closes_at" TIMESTAMPTZ/u);
assert.match(scheduleMigration, /UPDATE "standalone_quiz_versions" version/u);

const versionTable = migration.indexOf('CREATE TABLE "standalone_quiz_versions"');
const versionBackfill = migration.indexOf('INSERT INTO "standalone_quiz_versions"');
const itemBackfill = migration.indexOf('UPDATE "standalone_quiz_items" item');
const commandTable = migration.indexOf('CREATE TABLE "standalone_quiz_start_commands"');
const commandBackfill = migration.indexOf('INSERT INTO "standalone_quiz_start_commands"');
assert.ok(versionTable >= 0 && versionBackfill > versionTable, "versions must exist before their legacy backfill");
assert.ok(itemBackfill > versionBackfill, "item links must be backfilled after versions");
assert.ok(commandBackfill > commandTable, "start commands must exist before their legacy backfill");

assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/iu);
assert.doesNotMatch(itemScopingMigration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/iu);
assert.doesNotMatch(scheduleMigration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/iu);
assert.match(answerContract, /compareSelectedOptionSets/u);
assert.match(answerContract, /decodeLegacyAnswerSelection/u);

console.log("Standalone quiz version storage compatibility contract passed.");
