import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), "utf8");

const materi = read("lib/materi/repository.ts");
const quiz = read("lib/quiz/repository.ts");
const quizDashboard = read("lib/quiz/mentor-dashboard-repository.ts");
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
  if (!nextName) return source.slice(start);
  const end = declarationIndex(source, nextName, start + 1);
  assert.ok(end > start, `${nextName} must remain after ${name}`);
  return source.slice(start, end);
}

function assertProofBeforeRowLock(source: string, name: string, nextName?: string) {
  const slice = functionSlice(source, name, nextName);
  const proof = slice.indexOf("assertAuthoringEditLease");
  const rowLocks = [
    slice.indexOf("FOR UPDATE"),
    slice.indexOf("lockStandaloneQuizAggregate("),
  ].filter((index) => index >= 0);
  const rowLock = rowLocks.length ? Math.min(...rowLocks) : -1;
  assert.ok(proof >= 0, `${name} must assert editLease`);
  assert.ok(rowLock < 0 || proof < rowLock, `${name} must fence row locks with editLease`);
}

for (const [name, nextName] of [
  ["saveStandaloneQuizVersioned", "saveStandaloneQuiz"],
  ["saveStandaloneQuiz", "transitionStandaloneQuizSourceModeVersioned"],
  ["transitionStandaloneQuizSourceModeVersioned", "transitionStandaloneQuizSourceMode"],
  ["transitionStandaloneQuizSourceMode", "importStandaloneQuizBankQuestions"],
  ["acceptStandaloneQuizQuestionUpdateVersioned", "acceptStandaloneQuizQuestionUpdate"],
  ["acceptStandaloneQuizQuestionUpdate", "getMentorStandaloneQuiz"],
  ["attachStandaloneQuizAssemblyVersioned", "attachStandaloneQuizAssembly"],
  ["attachStandaloneQuizAssembly", "detachStandaloneQuizAssemblyVersioned"],
  ["detachStandaloneQuizAssemblyVersioned", "detachStandaloneQuizAssembly"],
  ["detachStandaloneQuizAssembly", "getMentorStandaloneQuizzes"],
  ["updateStandaloneQuizLifecycle", "setStandaloneQuizHidden"],
  ["setStandaloneQuizHidden", "studentAvailabilityWhere"],
]) {
  assertProofBeforeRowLock(quiz, name, nextName);
}
for (const [name, nextName] of [
  ["saveQuestionBank", "updateQuestionBankLifecycle"],
  ["updateQuestionRevisionLifecycle", "deleteQuestionBank"],
]) {
  assertProofBeforeRowLock(bank, name, nextName);
}
assertProofBeforeRowLock(bank, "deleteQuestionBank");

const bankLifecycle = functionSlice(
  bank,
  "updateQuestionBankLifecycle",
  "updateQuestionRevisionLifecycle",
);
if (bankLifecycle.includes("withTransientAuthoringEditLeases")) {
  assert.match(
    bankLifecycle,
    /const applyLifecycle = async \(\) => \{[\s\S]*?FOR UPDATE[\s\S]*?\};[\s\S]*?if \(options\.editLease\) \{[\s\S]*?await assertAuthoringEditLease\([\s\S]*?\);[\s\S]*?return applyLifecycle\(\);[\s\S]*?return withTransientAuthoringEditLeases\([\s\S]*?actorId,[\s\S]*?applyLifecycle,/u,
    "bank lifecycle must fence its row-lock callback with either the supplied proof or a transient lease",
  );
} else {
  assertProofBeforeRowLock(
    bank,
    "updateQuestionBankLifecycle",
    "updateQuestionRevisionLifecycle",
  );
}

const quizDashboardLifecycle = functionSlice(
  quizDashboard,
  "manageMentorDashboardQuiz",
);
assert.match(
  quizDashboardLifecycle,
  /withTransientAuthoringEditLeases\([\s\S]*?\[\{ resourceId: quizId, resourceType: "quiz" \}\],[\s\S]*?tutorId,[\s\S]*?FOR UPDATE/u,
  "dashboard quiz mutations must acquire a transient lease before locking the quiz row",
);

assert.match(materi, /assertAuthoringEditLease/u);
assert.match(materi, /withTransientAuthoringEditLeases/u);
assert.match(organization, /withTransientAuthoringEditLeases/u);
assert.doesNotMatch(organization, /acquireEditKeys/u);
assert.doesNotMatch(organization, /resourceType:\s*["']question-bank["']/u);

const ordinaryBankSave = functionSlice(bank, "saveQuestionBank", "updateQuestionBankLifecycle");
const bankImageValidator = functionSlice(
  mediaValidator,
  "lockAndValidateKaptenBankImages",
  "findQuestionBankImageReferences",
);
const bankImageValidationCall = ordinaryBankSave.indexOf("lockAndValidateKaptenBankImages(");
const firstQuestionWrite = ordinaryBankSave.indexOf("tx.question.create(");
assert.ok(
  bankImageValidationCall >= 0 && firstQuestionWrite > bankImageValidationCall,
  "ordinary Bank save must validate all media before writing questions",
);
assert.match(bankImageValidator, /tx\.asset\.findMany/u);
assert.match(bankImageValidator, /MediaLibraryScope\.kapten/u);
assert.match(bankImageValidator, /MediaAssetState\.ready/u);
assert.match(bankImageValidator, /trashedAt === null/u);
assert.match(bankImageValidator, /isImageMimeType/u);

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
