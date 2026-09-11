import assert from "node:assert/strict";
import fs from "node:fs";

const repository = fs.readFileSync("lib/quiz/repository.ts", "utf8");
const actions = fs.readFileSync("modules/mentor/quiz-actions.ts", "utf8");
const editor = fs.readFileSync("modules/mentor/KaptenQuizEditorPageModule.tsx", "utf8");
const types = fs.readFileSync("modules/mentor/quiz-builder-types.ts", "utf8");

assert.match(types, /export type QuizQuestionSourceUpdate/);
assert.match(types, /sourceUpdate\?: QuizQuestionSourceUpdate/);
assert.match(repository, /async function getQuizQuestionsWithSourceUpdates/);
assert.match(repository, /getQuizQuestionsWithSourceUpdates\(record\.items, record\.subtest\.code\)/);
assert.match(repository, /revision\.status !== QuestionRevisionStatus\.ready/);
assert.match(repository, /revision\.id === item\.sourceQuestionRevisionId/);
assert.match(repository, /async function acceptStandaloneQuizQuestionUpdate/);
assert.match(repository, /expectedCurrentContentDigest/);
assert.match(repository, /targetRevisionId/);
assert.match(repository, /record\.status !== ContentStatus\.draft/);
assert.match(repository, /record\.participations\.length/);
assert.match(repository, /Revisi Bank Soal berubah\. Muat ulang lalu tinjau kembali\./);
assert.match(repository, /await tx\.standaloneQuizItemOption\.deleteMany/);
assert.match(repository, /sourceQuestionRevisionOptionId: option\.sourceQuestionRevisionOptionId/);
assert.match(actions, /async function acceptStandaloneQuizQuestionUpdateAction/);
assert.match(actions, /acceptStandaloneQuizQuestionUpdate\(input, session\.user\.id\)/);
assert.match(editor, /data-source-update-review="available"/);
assert.match(editor, /Tinjau perubahan/);
assert.match(editor, /Terima ke draf/);
assert.match(editor, /Saat ini di Kuis/);
assert.match(editor, /Revisi \$\{update\.revisionNo\} di Bank Soal/);
assert.match(editor, /acceptStandaloneQuizQuestionUpdateAction/);
assert.match(editor, /candidate\.sourceQuestionId === question\.sourceQuestionId/);
assert.match(editor, /setActiveQuestionId\(\(current\) => current === question\.id/);

console.log("Quiz question update review contract passed.");
