import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [answerContract, readiness, repository, builder, storage, migration] = await Promise.all([
  readFile(new URL("../lib/question-bank/answer-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/readiness.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/question-bank/repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenQuestionBankBuilderPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/question-bank-draft-storage.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/migrations/20260910120000_enable_multiple_choice_question_banks/migration.sql", import.meta.url), "utf8"),
]);

assert.match(answerContract, /type QuestionAnswerMode = "single_choice" \| "multiple_choice"/u);
assert.match(answerContract, /function evaluateExactAnswer/u);
assert.match(readiness, /questionType\?: string/u);
assert.match(readiness, /questionType === "multiple_choice"/u);
assert.match(repository, /correctChoiceIds\?: string\[\]/u);
assert.match(repository, /validateAnswerKey\(questionType/u);
assert.match(repository, /questionType: input\.questionType/u);
assert.match(repository, /correctChoiceIds,/u);
assert.match(builder, /QuestionAnswerModeField/u);
assert.match(builder, /type=\{multipleAnswer \? "checkbox" : "radio"\}/u);
assert.match(builder, /Pilih minimal satu jawaban benar/u);
assert.match(storage, /correctChoiceIds/u);
assert.match(migration, /DROP CONSTRAINT IF EXISTS "questions_bank_single_choice_check"/u);
assert.match(migration, /questions_bank_choice_type_check/u);
assert.match(migration, /answer_mode = 'multiple_choice'/u);
assert.match(migration, /correct_count < 1/u);

console.log("Question-bank multiple-answer authoring contracts passed.");
