import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AssemblyValidationError,
  seededShuffle,
  validateAssemblyDefinitionShape,
} from "../lib/tryout/assembly-validation";

const repository = await readFile(new URL("../lib/tryout/assembly-repository.ts", import.meta.url), "utf8");
const actions = await readFile(new URL("../modules/mentor/assembly-actions.ts", import.meta.url), "utf8");

const base = {
  mode: "random_pool" as const,
  scope: { bankIds: ["bank-1"] },
  subtestId: "subtest-1",
  title: "Pool verbal",
};

assert.deepEqual(
  validateAssemblyDefinitionShape({
    ...base,
    candidates: [],
    rule: { easyCount: 0, hardCount: 0, mediumCount: 0, requestedCount: 3 },
  }).rule,
  { easyCount: 0, hardCount: 0, mediumCount: 0, requestedCount: 3 },
);

assert.throws(
  () => validateAssemblyDefinitionShape({
    ...base,
    candidates: [{ sourceContentDigest: "digest", sourceQuestionId: "q-1", sourceQuestionRevisionId: "r-1" }],
    rule: { easyCount: 1, hardCount: 0, mediumCount: 0, requestedCount: 3 },
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "quota",
);

assert.throws(
  () => validateAssemblyDefinitionShape({
    ...base,
    candidates: [
      { sourceContentDigest: "digest", sourceQuestionId: "q-1", sourceQuestionRevisionId: "r-1" },
      { sourceContentDigest: "digest-2", sourceQuestionId: "q-1", sourceQuestionRevisionId: "r-2" },
    ],
    rule: { easyCount: 0, hardCount: 0, mediumCount: 0, requestedCount: 1 },
  }),
  (error: unknown) => error instanceof AssemblyValidationError && error.code === "duplicate_candidate",
);

const firstOrder = seededShuffle(["a", "b", "c", "d"], "preview-seed");
assert.deepEqual(firstOrder, seededShuffle(["a", "b", "c", "d"], "preview-seed"), "preview seed should be replayable");
assert.notDeepEqual(firstOrder, seededShuffle(["a", "b", "c", "d"], "another-seed"), "different preview seeds should not share one order");

assert.match(repository, /import "server-only"/u);
assert.match(repository, /SELECT id FROM reusable_question_packages WHERE id = \$\{packageId\}::uuid FOR UPDATE/u);
assert.match(repository, /ORDER BY q\.id[\s\S]*FOR SHARE OF q, b, r/u);
assert.match(repository, /sourceQuestionRevisionId !== revision\.id \|\| identity\.sourceContentDigest !== revision\.contentDigest/u);
assert.match(repository, /QuestionRevisionProvenance\.legacy_unknown/u);
assert.match(repository, /modelVersion: CANONICAL_2PL_MODEL_VERSION/u);
assert.match(repository, /status: ContentStatus\.published/u);
assert.match(repository, /async function listReadyAssemblyRevisions/u);
assert.match(repository, /async function saveAssemblyDraft/u);
assert.match(repository, /async function readyAssemblyDraft/u);
assert.match(repository, /async function validateAssemblyDraft/u);
assert.match(repository, /async function previewAssembly/u);
assert.match(repository, /readOnly: true/u);
assert.match(repository, /randomBytes\(16\)\.toString\("hex"\)/u);

const previewBody = repository.slice(repository.indexOf("async function previewAssembly"), repository.indexOf("export {"));
assert.doesNotMatch(previewBody, /\.create\(|\.createMany\(|\.update\(|\.updateMany\(|\.delete\(|\.deleteMany\(/u, "preview must not write durable rows");

assert.match(actions, /requireTryoutCapability\(session, "tryout\.delivery\.configure"\)/u);
assert.match(actions, /getReadyAssemblyRevisionAction/u);
assert.match(actions, /saveAssemblyDraftAction/u);
assert.match(actions, /readyAssemblyDraftAction/u);
assert.match(actions, /session\.user\.roles\.includes\(RoleName\.admin\)/u);

console.log("Random assembly repository contract passed.");
