import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schema, migration, folderMigration, repository, organization, assemblyValidation, assemblyRepository, release, seed] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260902090000_add_question_bank_purpose/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260912170000_scope_question_bank_folders_by_purpose/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/organization.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assembly-validation.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/seed-assessment.mjs", import.meta.url), "utf8"),
]);

const purposeEnum = schema.match(/enum QuestionBankPurpose \{[\s\S]*?^\}/mu)?.[0] ?? "";
const questionBankModel = schema.match(/model QuestionBank \{[\s\S]*?^\}/mu)?.[0] ?? "";
const folderModel = schema.match(/model QuestionBankFolder \{[\s\S]*?^\}/mu)?.[0] ?? "";
assert.match(purposeEnum, /quiz/u);
assert.match(purposeEnum, /tryout/u);
assert.match(purposeEnum, /@@map\("question_bank_purpose"\)/u);
assert.match(questionBankModel, /purpose\s+QuestionBankPurpose/u);
assert.match(questionBankModel, /fields:\s*\[folderId, purpose\], references:\s*\[id, purpose\]/u);
assert.match(questionBankModel, /@@index\(\[purpose, status\]\)/u);
assert.match(folderModel, /purpose\s+QuestionBankPurpose/u);
assert.match(folderModel, /fields:\s*\[parentId, purpose\], references:\s*\[id, purpose\]/u);
assert.match(folderModel, /@@unique\(\[id, purpose\]/u);

assert.match(migration, /^BEGIN;\s*$/mu);
assert.match(migration, /LOCK TABLE question_banks IN ACCESS EXCLUSIVE MODE/u);
assert.match(migration, /CREATE TYPE question_bank_purpose AS ENUM \('quiz', 'tryout'\)/u);
assert.match(migration, /ADD COLUMN purpose question_bank_purpose NOT NULL/u);
assert.match(migration, /CREATE INDEX question_banks_purpose_status_idx/u);
assert.match(migration, /BEFORE UPDATE OF purpose ON question_banks/u);
assert.match(migration, /question bank purpose is immutable/u);
assert.match(migration, /COMMIT;\s*$/mu);
assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/iu);
const precondition = migration.indexOf("SELECT COUNT(*) INTO existing_bank_count");
const firstDdl = migration.indexOf("CREATE TYPE question_bank_purpose");
assert.ok(precondition >= 0 && firstDdl > precondition, "non-empty precondition must run before purpose DDL");
assert.ok(migration.indexOf("RAISE EXCEPTION", precondition) < firstDdl, "non-empty migration must fail before creating the enum");

assert.match(folderMigration, /^BEGIN;\s*$/mu);
assert.match(folderMigration, /LOCK TABLE "question_bank_folders" IN ACCESS EXCLUSIVE MODE/u);
assert.match(folderMigration, /ADD COLUMN "purpose"/u);
assert.match(folderMigration, /CREATE TEMP TABLE "_question_bank_folder_purpose_map"/u);
assert.match(folderMigration, /'tryout'::"question_bank_purpose"/u);
assert.match(folderMigration, /UPDATE "question_banks"/u);
assert.match(folderMigration, /reusable_question_package_version_folder_scopes/u);
assert.match(folderMigration, /CREATE UNIQUE INDEX "question_bank_folders_purpose_root_name_ci_key"/u);
assert.match(folderMigration, /question_bank_folders_parent_id_purpose_fkey/u);
assert.match(folderMigration, /question_banks_folder_id_purpose_fkey/u);
assert.match(folderMigration, /question_bank_folder_purpose_immutable/u);
assert.match(folderMigration, /COMMIT;\s*$/mu);
assert.doesNotMatch(folderMigration, /DROP TABLE|TRUNCATE/iu);

assert.match(repository, /purpose: QuestionBankPurpose/u);
assert.match(repository, /current\.purpose !== input\.purpose/u);
assert.match(repository, /function buildSourceBankWhereSql/u);
assert.match(repository, /b\.status <> \$\{ContentStatus\.archived\}/u);
assert.match(repository, /bank\.status === ContentStatus\.archived/u);
assert.match(organization, /groupBy\(\{[\s\S]*?where: \{ purpose: normalizedPurpose \}/u);
assert.match(organization, /questionBank: \{ purpose: normalizedPurpose \}/u);
assert.match(organization, /questionBankPurposeLabel\(normalizedPurpose\)/u);
assert.match(organization, /purpose: normalizedPurpose/u);

assert.match(assemblyValidation, /bankPurposes: readonly \("quiz" \| "tryout"\)\[\]/u);
assert.match(assemblyValidation, /expectedPurpose = input\.target === "kuis" \? "quiz" : "tryout"/u);
assert.match(assemblyRepository, /expectedPurposeForTarget\(target\)/u);
assert.match(assemblyRepository, /assertScope\(tx, definition, "quiz"\)/u);
assert.match(assemblyRepository, /assemblyVersionMatchesPurpose/u);
assert.match(assemblyRepository, /version\.sourceBank\.purpose === expectedPurpose/u);
assert.match(assemblyRepository, /folder\.purpose !== expectedPurpose/u);
assert.match(release, /bank\?\.purpose !== "tryout"/u);
assert.match(release, /purpose: "tryout"/u);
assert.match(release, /version\.sourceBank\.purpose !== "tryout"/u);
assert.match(release, /wrongPurposeFolders/u);

assert.match(seed, /code: "seed:assessment:quiz-bank:v1"/u);
assert.match(seed, /purpose: "quiz"/u);
assert.match(seed, /code: "seed:assessment:tryout-bank:v1"/u);
assert.match(seed, /purpose: "tryout"/u);
assert.doesNotMatch(seed, /upsertCalibrations\(client, tutorId, tryoutQuestions\)/u);
assert.match(seed, /The canonical demonstration is CBT-only/u);
assert.match(seed, /JSON\.stringify\(\{ correctAnswerPoints: 1, method: "fixed_points", unansweredPoints: 0, wrongAnswerPoints: 0 \}\)/u);
assert.doesNotMatch(seed, /const isCat = \["PU", "PK", "PM"\]\.includes\(subject\.code\)/u);

console.log("Question-bank purpose schema and boundary contracts passed.");
