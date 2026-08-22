import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AssemblyValidationError,
  assemblyCompatibleWithTestType,
  assertAssemblyAttachmentCompatibility,
} from "../lib/tryout/assembly-validation";

const [repository, actions, builder, createPage, editPage, tryoutRepository] = await Promise.all([
  readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/assembly-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/create/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/repository.ts", import.meta.url), "utf8"),
]);

for (const mode of ["fixed_set", "random_pool", "blueprint", "cat_pool"] as const) {
  assert.doesNotThrow(() => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1"],
    mode,
    subtestCode: "PU",
    target: "tryout",
    targetTestType: mode === "cat_pool" ? "cat" : "cbt",
    targetSubtestCode: "PU",
  }));
}

assert.throws(
  () => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1"],
    mode: "random_pool",
    subtestCode: "PU",
    target: "tryout",
    targetTestType: "cbt",
    targetSubtestCode: "PPU",
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "wrong_subtest",
);

assert.equal(assemblyCompatibleWithTestType("cat_pool", "cat"), true);
assert.equal(assemblyCompatibleWithTestType("cat_pool", "cbt"), false);
assert.equal(assemblyCompatibleWithTestType("fixed_set", "cbt"), true);
assert.equal(assemblyCompatibleWithTestType("fixed_set", "cat"), false);
assert.throws(
  () => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1"],
    mode: "cat_pool",
    subtestCode: "PU",
    target: "tryout",
    targetTestType: "cbt",
    targetSubtestCode: "PU",
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "invalid_mode",
);

assert.match(repository, /async function listReadyAssemblyRevisions/u);
assert.match(repository, /async function getReadyAssemblyAttachment/u);
assert.match(repository, /assertAssemblyAttachmentCompatibility/u);
assert.match(repository, /targetTestType/u);
assert.match(repository, /source.status !== ContentStatus\.published/u);
assert.match(repository, /Number\.isFinite\(calibration\.difficulty\)/u);
assert.match(repository, /discrimination <= 0/u);
assert.match(repository, /versionItemContentIssues/u);
assert.match(repository, /snapshotItems: version\.items/u);
assert.match(repository, /usesImmutableSnapshot/u);
assert.match(repository, /status: ContentStatus\.published/u);
assert.match(repository, /package: \{ status: \{ not: ContentStatus\.archived \} \}/u);
assert.match(repository, /collectReadiness\(tx, definitionInputForVersion\(version\),/u);
assert.match(repository, /where: \{ id: input\.versionId, packageId, status: ContentStatus\.published \}/u);
assert.match(repository, /readOnly: true/u);

const previewBody = repository.slice(repository.indexOf("async function previewAssembly"), repository.indexOf("export {"));
assert.doesNotMatch(previewBody, /\.create\(|\.createMany\(|\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(/u, "assembly preview must remain read-only");

assert.match(actions, /async function attachReadyAssemblyAction/u);
assert.match(actions, /getReadyAssemblyAttachment\(input\.versionId, input\.target, input\.targetSubtestCode, input\.targetTestType\)/u);
assert.match(actions, /input\.targetTestType !== "cbt"/u);
assert.match(actions, /input\.target !== "tryout"/u);
assert.match(actions, /async function detachReadyAssemblyAction/u);
assert.match(actions, /requireTryoutCapability\(session, "tryout\.delivery\.configure"\)/u);

assert.match(builder, /function ReadyAssemblyPicker/u);
assert.match(builder, /attachReadyAssemblyAction\(\{ target: "tryout"/u);
assert.match(builder, /targetTestType: activeSection\.testType/u);
assert.match(builder, /detachReadyAssemblyAction\(\{ target: "tryout" \}/u);
assert.match(builder, /readiness\.blockers/u);
assert.match(builder, /label: "Assembly siap dirilis"/u);
assert.match(builder, /packageVersionId: result\.result\.id/u);
assert.match(builder, /directQuestions: \[\]/u);
assert.match(builder, /previewAssemblyAction\(\{ versionId: assembly\.id \}\)/u);
assert.match(builder, /invalidAssemblyTypeSections/u);
const readyPickerBody = builder.slice(builder.indexOf("function ReadyAssemblyPicker"), builder.indexOf("function MockFlowNotice"));
assert.doesNotMatch(readyPickerBody, /role="listbox"/u);
assert.doesNotMatch(readyPickerBody, /role="option"/u);
assert.match(readyPickerBody, /<ul/u);
assert.match(readyPickerBody, /<li/u);

assert.match(createPage, /listReadyAssemblyRevisions/u);
assert.match(createPage, /readyAssemblies=\{readyAssemblies\}/u);
assert.match(editPage, /listReadyAssemblyRevisions/u);
assert.match(editPage, /readyAssemblies=\{readyAssemblies\}/u);

assert.match(tryoutRepository, /sectionInput\.packageVersionId && \(!version \|\| version\.status !== ContentStatus\.published/u);
assert.match(tryoutRepository, /version\.package\.subtest\.code !== sectionInput\.subtest/u);
assert.match(tryoutRepository, /if \(version && directSelections\.length\)/u);
assert.match(tryoutRepository, /Number\.isFinite\(Number\(calibration\.difficulty\)\)/u);
assert.match(tryoutRepository, /Number\(calibration\.discrimination\) <= 0/u);

const release = await readFile(new URL("../lib/tryout/assessment-release.ts", import.meta.url), "utf8");
assert.match(release, /version\.package\.status === ContentStatus\.archived/u);
assert.doesNotMatch(release, /version\.package\.status !== ContentStatus\.published/u);

console.log("Tryout assembly attachment contract passed.");
