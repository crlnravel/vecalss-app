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
assert.match(repository, /getQuestionBankReadinessFromRevisions\(activeQuestions\.map/u);
assert.match(repository, /code: "readiness_failed"/u);
assert.match(repository, /readiness,/u);
assert.match(repository, /const allowedOperations: Record<ContentStatus, readonly string\[\]>/u);
assert.match(repository, /\[ContentStatus\.draft\]: \["publish", "archive"\]/u);
assert.match(repository, /\[ContentStatus\.published\]: \["unpublish", "archive"\]/u);
assert.match(repository, /\[ContentStatus\.archived\]: \["restore"\]/u);
assert.match(repository, /code: "invalid_lifecycle_transition"/u);
assert.match(repository, /code: "scheduled_unsupported"/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.match(repository, /if \(sameCanonicalQuestionContent\(canonicalQuestionFromRecord\(current\), incomingCanonical\)\) \{/u);
assert.match(repository, /const requiresNewRevision = currentRevision\.status === QuestionRevisionStatus\.ready/u);

assert.match(organization, /function assertBankMutationSupported\(status: ContentStatus\)/u);
assert.match(organization, /code: "scheduled_unsupported"/u);
assert.match(organization, /assertBankMutationSupported\(bank\.status\)/u);

assert.match(actions, /type QuestionBankActionFailure =/u);
assert.match(actions, /attemptedInput\?: unknown/u);
assert.match(actions, /readiness\?: QuestionBankReadiness/u);
assert.match(actions, /questionBankActionFailure\(error, "Bank Soal tidak dapat disimpan saat ini\."\)/u);
assert.match(actions, /questionBankActionFailure\(error, "Status Bank Soal tidak dapat diubah saat ini\."\)/u);

console.log("Question-bank persistence and lifecycle contracts passed.");
