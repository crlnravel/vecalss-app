import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AssemblyValidationError,
  assertAssemblyAttachmentCompatibility,
} from "../lib/tryout/assembly-validation";

const [schema, migration, identityMigration, repository, assemblyRepository, actions, builder, editPage, createPage, seedAssessment] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260823100000_add_standalone_quiz_assembly_binding/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260823110000_pin_kuis_assembly_version_identity/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/quiz/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/quiz-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuizBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/[quizId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../prisma/seed-assessment.mjs", import.meta.url), "utf8"),
]);

for (const mode of ["fixed_set", "random_pool", "blueprint"] as const) {
  assert.doesNotThrow(() => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1"],
    mode,
    subtestCode: "PU",
    target: "kuis",
    targetTestType: "cbt",
    targetSubtestCode: "PU",
  }));
}

assert.throws(
  () => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1"],
    mode: "cat_pool",
    subtestCode: "PU",
    target: "kuis",
    targetTestType: "cbt",
    targetSubtestCode: "PU",
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "invalid_mode",
);
assert.throws(
  () => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1", "bank-2"],
    mode: "blueprint",
    subtestCode: "PU",
    target: "kuis",
    targetTestType: "cbt",
    targetSubtestCode: "PU",
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "scope",
);

assert.match(schema, /assemblyMode\s+ReusableQuestionPackageMode\?/u);
assert.match(schema, /assemblyPackageVersionId\s+String\?/u);
assert.match(schema, /assemblyDefinitionDigest\s+String\?/u);
assert.match(schema, /assemblySeed\s+String\?/u);
assert.match(schema, /StandaloneQuizAssemblyVersion/u);

assert.match(migration, /standalone_quizzes_validate_assembly_binding/u);
assert.match(migration, /CAT Pool is not supported by standalone Kuis/u);
assert.match(migration, /scope_count <> 1/u);
assert.match(migration, /version_status <> 'published'/u);
assert.match(migration, /assembly_definition_digest/u);
assert.match(migration, /version_source_bank_id IS DISTINCT FROM scope_bank_id/u);
assert.match(migration, /package_subtest_id IS DISTINCT FROM version_subtest_id/u);
assert.match(identityMigration, /CREATE OR REPLACE FUNCTION standalone_quiz_validate_assembly_binding/u);
assert.doesNotMatch(identityMigration, /package_subtest_id IS DISTINCT FROM version_subtest_id/u);
assert.doesNotMatch(identityMigration, /package_source_bank_id IS DISTINCT FROM scope_bank_id/u);
assert.match(identityMigration, /version_source_bank_id IS DISTINCT FROM scope_bank_id/u);

assert.match(repository, /resolveReadyAssemblyForKuis/u);
assert.match(repository, /expectedDefinitionDigest/u);
assert.match(repository, /current\?\.assemblyPackageVersionId/u);
assert.match(repository, /sourceRevisionProvenance !== expected.sourceRevisionProvenance/u);
assert.match(assemblyRepository, /recomputedDefinitionDigest/u);
assert.match(assemblyRepository, /version\.package\.mode !== version\.mode/u);
assert.match(repository, /Soal langsung dan assembly tidak dapat dipakai bersamaan/u);
assert.doesNotMatch(repository, /if \(input\.status === "published" && input\.assemblyVersionId !== undefined\) validateForPublication\(input/u);
assert.match(repository, /materializedAssembly\?: boolean/u);
assert.match(repository, /!options\.materializedAssembly/u);
assert.match(repository, /materializedAssembly: Boolean\(assembly\)/u);
assert.match(repository, /materializedAssembly: Boolean\(record\.assemblyPackageVersionId\)/u);
assert.match(assemblyRepository, /if \(definition\.mode === "fixed_set"\)[\s\S]*?version\.items\.map\(kuisItemFromVersionItem\)/u);
assert.doesNotMatch(assemblyRepository, /if \(definition\.mode === "fixed_set" \|\| definition\.mode === "random_pool"\) \{\s*const candidates = version\.items\.map\(candidateFromVersionItem\);\s*await assertCandidates/u);
assert.match(repository, /revalidateStoredBankItems/u);
assert.match(repository, /attachStandaloneQuizAssembly/u);
assert.match(repository, /detachStandaloneQuizAssembly/u);
assert.match(repository, /assemblyVersionId: record.assemblyPackageVersionId \?\? undefined/u);

assert.match(actions, /listReadyKuisAssembliesAction/u);
assert.match(actions, /attachStandaloneQuizAssemblyAction/u);
assert.match(actions, /detachStandaloneQuizAssemblyAction/u);
assert.match(builder, /assemblyVersionId/u);
assert.match(builder, /kuis-assembly-source/u);
assert.match(builder, /actions\.selectAssembly/u);
assert.match(builder, /actions\.detachAssembly/u);
assert.match(builder, /detachStandaloneQuizAssemblyAction/u);
assert.match(builder, /onPersistAssemblyDetach/u);
assert.match(builder, /setSavedQuiz\(result\.quiz\)/u);
assert.match(builder, /preserveDirtyState/u);
assert.match(builder, /markChanged: persisted !== "clean"/u);
assert.match(builder, /contentElement="div"/u);
assert.match(builder, /assembly\.readiness\.ready/u);
assert.match(editPage, /readyAssemblies=\{readyAssemblies\}/u);
assert.match(createPage, /readyAssemblies=\{readyAssemblies\}/u);
assert.match(assemblyRepository, /expectedDefinitionDigest: version\.definitionDigest/u);
assert.match(assemblyRepository, /Definition assembly tidak lagi cocok dengan versi Ready/u);
assert.match(assemblyRepository, /if \(!report\.readiness\.ready\) throwIssue/u);
assert.match(assemblyRepository, /versionItemContentIssues/u);
assert.doesNotMatch(assemblyRepository, /version\.package\.subtestId !== version\.subtestId/u);
assert.doesNotMatch(assemblyRepository, /version\.package\.sourceBankId !== sourceBankId/u);
assert.match(assemblyRepository, /version\.sourceBankId !== sourceBankId/u);
assert.match(assemblyRepository, /version\.package\.mode !== version\.mode/u);
assert.match(seedAssessment, /package_id, source_bank_id, subtest_id, version_no, mode, status/u);
assert.match(seedAssessment, /reusable_question_package_version_bank_scopes/u);
assert.match(seedAssessment, /assemblyDefinitionDigest/u);
assert.match(seedAssessment, /definition_digest = \$2/u);

console.log("Kuis assembly binding contract passed.");
