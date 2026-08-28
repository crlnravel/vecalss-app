import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [repository, organization, actions] = await Promise.all([
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/organization.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/question-bank-actions.ts", import.meta.url), "utf8"),
]);

assert.match(repository, /SELECT id FROM question_banks WHERE id = \$\{bankId\}::uuid FOR UPDATE/u);
assert.match(repository, /assertPublishedQuestionContentUnchanged\(input, existing, subtestByCode\)/u);
assert.match(repository, /questionRevisionContentDigest/u);
assert.match(repository, /published_content_locked/u);
assert.match(repository, /attemptedInput: input/u);
assert.match(repository, /sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)/u);
assert.match(repository, /function isTemporaryQuestionId\(id: string \| undefined\)/u);
assert.match(repository, /const isTemporary = isTemporaryQuestionId\(question\.id\)/u);
assert.match(repository, /!isTemporary && !current/u);
assert.match(repository, /const subjectCodes = \[\.\.\.new Set\(input\.questions\.map\(\(question\) => question\.subjectCode\)\)\]/u);
assert.match(repository, /if \(subjectCodes\.some\(\(subject\) => !SUBJECT_CODES\.includes/u);
assert.doesNotMatch(repository, /if \(!subjectCodes\.length \|\| subjectCodes\.some/u, "empty Bank Soal drafts should pass persistence validation");
assert.match(repository, /getQuestionBankReadinessFromRevisions\(activeQuestions\.map/u);
assert.match(repository, /getQuestionReadinessFromRevision\(/u);
assert.match(repository, /bank\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /question\.status !== ContentStatus\.archived/u);
assert.match(repository, /if \(!revision\.question\.questionBank\) \{[\s\S]*isValidRevision\(revision\)/u);
assert.match(repository, /if \(issues\.length\) \{[\s\S]*readiness:/u);
assert.match(repository, /code: "readiness_failed"/u);
assert.match(repository, /readiness,/u);
assert.match(repository, /const allowedOperations: Record<ContentStatus, readonly string\[\]>/u);
assert.match(repository, /\[ContentStatus\.draft\]: \["publish", "archive"\]/u);
assert.match(repository, /\[ContentStatus\.published\]: \["unpublish", "archive"\]/u);
assert.match(repository, /\[ContentStatus\.archived\]: \["restore"\]/u);
assert.match(repository, /code: "invalid_lifecycle_transition"/u);
assert.match(repository, /code: "scheduled_unsupported"/u);
assert.match(repository, /SELECT qb\.id[\s\S]*FOR UPDATE OF qb/u);
assert.match(repository, /question\.questionBank\?\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /if \(sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)\) \{/u);
assert.match(repository, /const requiresNewRevision = currentRevision\.status === QuestionRevisionStatus\.ready/u);

assert.match(organization, /function assertBankMutationSupported\(status: ContentStatus\)/u);
assert.match(organization, /code: "scheduled_unsupported"/u);
assert.match(organization, /assertBankMutationSupported\(bank\.status\)/u);
assert.match(organization, /scheduledBankCount = await tx\.questionBank\.count/u);
assert.match(organization, /operation: "remove_folder"/u);

assert.match(actions, /type QuestionBankActionFailure =/u);
assert.doesNotMatch(actions, /export type \{ QuestionBankActionFailure \}/u, "Next Server Actions must not expose the failure type as a runtime action");
assert.match(actions, /attemptedInput\?: unknown/u);
assert.match(actions, /readiness\?: QuestionBankReadiness/u);
assert.match(actions, /questionBankActionFailure\(error, "Bank Soal tidak dapat disimpan saat ini\."\)/u);
assert.match(actions, /questionBankActionFailure\(error, "Status Bank Soal tidak dapat diubah saat ini\."\)/u);

console.log("Question-bank persistence and lifecycle contracts passed.");
