import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), "utf8");

const materi = read("lib/materi/repository.ts");
const quiz = read("lib/quiz/repository.ts");
const bank = read("lib/question-bank/repository.ts");
const organization = read("lib/question-bank/organization.ts");
const service = read("lib/resource-edit-lock/service.ts");
const authoringLease = read("lib/serialization/authoring-lease.ts");
const mediaValidator = read("lib/question-bank/media-validator.ts");
const registry = read("lib/serialization/writer-registry.ts");

function declarationIndex(source: string, name: string, fromIndex = 0) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b(?:async\\s+)?function\\s+${escapedName}\\s*\\(`, "gu");
  match.lastIndex = fromIndex;
  return match.exec(source)?.index ?? -1;
}

function functionSlice(source: string, name: string, nextName?: string) {
  const start = declarationIndex(source, name);
  assert.ok(start >= 0, `${name} must remain a named repository boundary`);
  const end = nextName ? declarationIndex(source, nextName, start + 1) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
}

function assertProofBeforeRowLock(source: string, name: string) {
  const slice = functionSlice(source, name);
  const proof = slice.indexOf("assertAuthoringEditLease");
  const rowLock = slice.indexOf("FOR UPDATE");
  assert.ok(proof >= 0, `${name} must assert editLease`);
  assert.ok(rowLock < 0 || proof < rowLock, `${name} must fence row locks with editLease`);
}

for (const name of [
  "saveStandaloneQuizVersioned",
  "saveStandaloneQuiz",
  "transitionStandaloneQuizSourceModeVersioned",
  "transitionStandaloneQuizSourceMode",
  "acceptStandaloneQuizQuestionUpdateVersioned",
  "acceptStandaloneQuizQuestionUpdate",
  "attachStandaloneQuizAssemblyVersioned",
  "attachStandaloneQuizAssembly",
  "detachStandaloneQuizAssemblyVersioned",
  "detachStandaloneQuizAssembly",
  "updateStandaloneQuizLifecycle",
]) {
  assertProofBeforeRowLock(quiz, name);
}
for (const name of [
  "saveQuestionBank",
  "updateQuestionBankLifecycle",
  "updateQuestionRevisionLifecycle",
  "deleteQuestionBank",
]) {
  assertProofBeforeRowLock(bank, name);
}

assert.match(materi, /assertAuthoringEditLease/u);
assert.match(materi, /withTransientAuthoringEditLeases/u);
assert.match(quiz, /withTransientAuthoringEditLeases/u);
assert.match(bank, /assertReadyKaptenImageAssets/u);
assert.match(organization, /withTransientAuthoringEditLeases/u);
assert.doesNotMatch(organization, /acquireEditKeys/u);
assert.doesNotMatch(organization, /resourceType:\s*["']question-bank["']/u);

const ordinaryBankSave = functionSlice(bank, "saveQuestionBank", "updateQuestionBankLifecycle");
assert.ok(
  ordinaryBankSave.indexOf("assertReadyKaptenImageAssets") < ordinaryBankSave.indexOf("questionBank.create"),
  "ordinary Bank save must validate all media before its first write",
);
assert.match(mediaValidator, /asset\.findMany/u);
assert.match(mediaValidator, /MediaLibraryScope\.kapten/u);
assert.match(mediaValidator, /MediaAssetState\.ready/u);
assert.match(mediaValidator, /trashedAt === null/u);
assert.match(mediaValidator, /isImageMimeType/u);

assert.match(service, /sort\(\(left, right\) => left\.resourceKey\.localeCompare\(right\.resourceKey\)\)/u);
assert.match(service, /A callback error\s+\*\s+is intentionally allowed to abort/u);
assert.match(authoringLease, /type AuthoringEditLease = Pick<EditLeaseProof, "generation" \| "token">/u);

assert.doesNotMatch(quiz, /syncStandaloneQuizBankRevisions/u);
const sourceUpdateDetector = functionSlice(quiz, "getQuizQuestionsWithSourceUpdates", "readReadyQuizBankSources");
assert.doesNotMatch(sourceUpdateDetector, /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u);
const bankSave = functionSlice(bank, "saveQuestionBank", "updateQuestionBankLifecycle");
assert.doesNotMatch(
  bankSave,
  /tx\.standaloneQuiz(?:Item|Version)?\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/u,
);
assert.doesNotMatch(registry, /syncStandaloneQuizBankRevisions/u);
for (const writer of [
  "saveQuestionBank",
  "updateQuestionBankLifecycle",
  "deleteQuestionBank",
  "updateQuestionRevisionLifecycle",
  "saveStandaloneQuiz",
  "transitionStandaloneQuizSourceMode",
  "acceptStandaloneQuizQuestionUpdate",
  "updateStandaloneQuizLifecycle",
]) {
  assert.match(registry, new RegExp(`name: "${writer}"`));
}

console.log("RLCSV-04 authoring lock family contracts passed.");
