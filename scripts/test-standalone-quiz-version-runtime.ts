import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  KUIS_VERSIONING_CUTOVER_ENV,
  draftRevisionMatches,
  isStandaloneQuizVersioningCutoverEnabled,
  nextStandaloneQuizVersionNo,
  versionedDefinitionDigest,
} from "../lib/quiz/versioning-runtime";

const question = {
  choices: [
    { id: "A", text: "Pilihan A" },
    { id: "B", text: "Pilihan B" },
    { id: "C", text: "Pilihan C" },
  ],
  correctChoiceId: "A",
  correctChoiceIds: ["A", "C"],
  explanation: "Penjelasan.",
  id: "question-1",
  origin: "bank" as const,
  prompt: "Pilih semua jawaban yang tepat.",
  questionType: "multiple_choice" as const,
  sourceContentDigest: "question-v2",
  sourceQuestionId: "source-question-1",
  sourceQuestionRevisionId: "source-revision-2",
  sourceRevisionProvenance: "authored" as const,
};

const definition = {
  attemptsAllowed: null,
  correctAnswerVisibility: "show" as const,
  description: "Draft Kuis.",
  formBehavior: "same" as const,
  questions: [question],
  retryDelaySeconds: 0,
  reviewTiming: "immediate" as const,
  scorePolicy: "latest" as const,
  sourceBankId: "bank-1",
  title: "Kuis versi",
};

assert.equal(
  isStandaloneQuizVersioningCutoverEnabled({ [KUIS_VERSIONING_CUTOVER_ENV]: "enabled" }),
  true,
);
assert.equal(
  isStandaloneQuizVersioningCutoverEnabled({ [KUIS_VERSIONING_CUTOVER_ENV]: "disabled" }),
  false,
);
assert.equal(
  isStandaloneQuizVersioningCutoverEnabled({}),
  false,
  "the cutover must fail closed until migration and runtime verification are approved",
);
assert.equal(nextStandaloneQuizVersionNo([null, undefined, 1, 4, 2]), 5);
assert.equal(draftRevisionMatches(undefined, 3), true);
assert.equal(draftRevisionMatches(3, 3), true);
assert.equal(draftRevisionMatches(2, 3), false);
assert.notEqual(
  versionedDefinitionDigest(definition),
  versionedDefinitionDigest({ ...definition, questions: [{ ...question, correctChoiceIds: ["A"] }] }),
  "version digests must include the full multiple-answer key",
);

const projectRoot = resolve(import.meta.dirname, "..");
const repository = readFileSync(resolve(projectRoot, "lib/quiz/repository.ts"), "utf8");
assert.match(repository, /isStandaloneQuizVersioningCutoverEnabled\(\)/u);
assert.match(repository, /standaloneQuizVersion\.create/u);
assert.match(repository, /publishRequestId/u);
assert.match(repository, /FOR UPDATE/u);
assert.match(repository, /draftRevisionMatches/u);
assert.match(repository, /StandaloneQuizVersionState\.active/u);
assert.match(repository, /StandaloneQuizVersionState\.superseded/u);
assert.match(repository, /quizVersionId/u);
assert.match(repository, /transitionStandaloneQuizSourceModeVersioned/u);
assert.match(repository, /bulkUpdateStandaloneQuizLifecycleVersioned/u);
assert.match(repository, /resolveStandaloneQuizForAttempt/u);
assert.match(repository, /ensureStandaloneQuizDraft/u);

const actions = readFileSync(resolve(projectRoot, "modules/mentor/quiz-actions.ts"), "utf8");
assert.match(actions, /saveStandaloneQuizAction/u);

console.log("Standalone quiz version runtime contract passed.");
