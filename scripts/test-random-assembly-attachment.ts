import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AssemblyValidationError,
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
    targetSubtestCode: "PU",
  }));
}

assert.throws(
  () => assertAssemblyAttachmentCompatibility({
    bankIds: ["bank-1"],
    mode: "random_pool",
    subtestCode: "PU",
    target: "tryout",
    targetSubtestCode: "PPU",
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "wrong_subtest",
);

assert.match(repository, /async function listReadyAssemblyRevisions/u);
assert.match(repository, /async function getReadyAssemblyAttachment/u);
assert.match(repository, /assertAssemblyAttachmentCompatibility/u);
assert.match(repository, /status: ContentStatus\.published/u);
assert.match(repository, /package: \{ status: \{ not: ContentStatus\.archived \} \}/u);
assert.match(repository, /collectReadiness\(tx, definitionInputForVersion\(version\)\)/u);
assert.match(repository, /where: \{ id: input\.versionId, packageId, status: ContentStatus\.published \}/u);
assert.match(repository, /readOnly: true/u);

const previewBody = repository.slice(repository.indexOf("async function previewAssembly"), repository.indexOf("export {"));
assert.doesNotMatch(previewBody, /\.create\(|\.createMany\(|\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(/u, "assembly preview must remain read-only");

assert.match(actions, /async function attachReadyAssemblyAction/u);
assert.match(actions, /getReadyAssemblyAttachment\(input\.versionId, input\.target, input\.targetSubtestCode\)/u);
assert.match(actions, /input\.target !== "tryout"/u);
assert.match(actions, /async function detachReadyAssemblyAction/u);
assert.match(actions, /requireTryoutCapability\(session, "tryout\.delivery\.configure"\)/u);

assert.match(builder, /function ReadyAssemblyPicker/u);
assert.match(builder, /attachReadyAssemblyAction\(\{ target: "tryout"/u);
assert.match(builder, /detachReadyAssemblyAction\(\{ target: "tryout" \}/u);
assert.match(builder, /readiness\.blockers/u);
assert.match(builder, /label: "Assembly siap dirilis"/u);
assert.match(builder, /packageVersionId: result\.result\.id/u);
assert.match(builder, /directQuestions: \[\]/u);
assert.match(builder, /previewAssemblyAction\(\{ versionId: assembly\.id \}\)/u);

assert.match(createPage, /listReadyAssemblyRevisions/u);
assert.match(createPage, /readyAssemblies=\{readyAssemblies\}/u);
assert.match(editPage, /listReadyAssemblyRevisions/u);
assert.match(editPage, /readyAssemblies=\{readyAssemblies\}/u);

assert.match(tryoutRepository, /sectionInput\.packageVersionId && \(!version \|\| version\.status !== ContentStatus\.published/u);
assert.match(tryoutRepository, /version\.package\.subtest\.code !== sectionInput\.subtest/u);
assert.match(tryoutRepository, /if \(version && directSelections\.length\)/u);

console.log("Tryout assembly attachment contract passed.");
