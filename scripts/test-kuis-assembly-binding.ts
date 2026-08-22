import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AssemblyValidationError,
  assertAssemblyAttachmentCompatibility,
} from "../lib/tryout/assembly-validation";

const [schema, migration, repository, assemblyRepository, actions, builder, editPage, createPage] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260823100000_add_standalone_quiz_assembly_binding/migration.sql", import.meta.url), "utf8"),
  readFile(new URL("../lib/quiz/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/quiz-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuizBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/[quizId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/quiz/create/page.tsx", import.meta.url), "utf8"),
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

assert.match(repository, /resolveReadyAssemblyForKuis/u);
assert.match(repository, /expectedDefinitionDigest/u);
assert.match(repository, /current\?\.assemblyPackageVersionId/u);
assert.match(repository, /sourceRevisionProvenance !== expected.sourceRevisionProvenance/u);
assert.match(assemblyRepository, /recomputedDefinitionDigest/u);
assert.match(assemblyRepository, /version\.package\.mode !== version\.mode/u);
assert.match(repository, /Soal langsung dan assembly tidak dapat dipakai bersamaan/u);
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
assert.match(editPage, /readyAssemblies=\{readyAssemblies\}/u);
assert.match(createPage, /readyAssemblies=\{readyAssemblies\}/u);

console.log("Kuis assembly binding contract passed.");
