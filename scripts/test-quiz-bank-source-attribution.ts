import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getQuizQuestionBankContext } from "../modules/mentor/components/quiz-question-bank-context";

const bankId = "bbab1e65-6970-4064-9cc4-7fdacbba4837";
const bankSource = { sourceMode: "bank" as const, sourceBankId: bankId, sourceBank: "Bank Soal Kuis UTBK" };
assert.deepEqual(getQuizQuestionBankContext(bankSource), {
  showAddFromBank: true,
  sourceBankHref: `/mentor/quiz/question-bank/${bankId}?purpose=quiz`,
  sourceBankTitle: "Bank Soal Kuis UTBK",
}, "ordinary bank-linked quizzes expose their bank title and purpose-specific destination");
assert.equal(getQuizQuestionBankContext({ ...bankSource, sourceBankId: undefined }).sourceBankHref, undefined);
assert.equal(getQuizQuestionBankContext({ ...bankSource, sourceMode: "local" }).sourceBankHref, undefined);
assert.equal(getQuizQuestionBankContext(null).sourceBankHref, undefined);

const assembly = {
  bankId, bankName: "Bank Rakitan", categoryIds: [], categoryNames: [], definitionDigest: "digest",
  folderIds: [], folderNames: [], mode: "fixed_set" as const, packageId: "package", packageTitle: "Rakitan",
  readyAt: null, rule: null, subtestCode: "PU", versionId: "version", versionNo: 1,
};
assert.deepEqual(getQuizQuestionBankContext({ ...bankSource, assembly, sourceMode: "assembly" }), {
  showAddFromBank: false,
  sourceBankHref: `/mentor/quiz/question-bank/${bankId}?purpose=quiz`,
  sourceBankTitle: "Bank Rakitan",
});
assert.equal(getQuizQuestionBankContext({ ...bankSource, assembly: { ...assembly, bankId: "another-bank" }, sourceMode: "assembly" }).sourceBankTitle, undefined,
  "assembly titles cannot be attributed to a different bank");

const [editor, inventory, repository] = await Promise.all([
  readFile(new URL("../modules/mentor/KaptenQuizEditorPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/components/quiz-question-inventory.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/quiz/repository.ts", import.meta.url), "utf8"),
]);
assert.match(editor, /getQuizQuestionBankContext\(state\.savedQuiz\)/u);
assert.match(editor, /sourceBankHref,\s*sourceBankTitle,/u);
assert.match(editor, /inventory=\{<QuizQuestionInventory \{\.\.\.inventoryProps\}/u);
assert.match(editor, /mobileInventory=\{<QuizMobileInventory \{\.\.\.inventoryProps\}/u);
assert.match(inventory, /Bank Soal: <Link href=\{sourceBankHref\} title=\{sourceBankTitle\}>\{sourceBankTitle/u);
assert.match(repository, /const quizContentInclude = \{[\s\S]*?sourceBank: \{ select: \{ name: true \} \}/u,
  "the canonical editor read returns the bank name rather than a generic fallback");
console.log("Quiz bank source attribution regression passed.");
