import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankBuilderPageModule.tsx",
  "utf8",
);

assert.doesNotMatch(builder, /INVENTORY_QUESTIONS_PER_PAGE/u);
assert.doesNotMatch(builder, /inventoryPageCount|paginatedQuestions|visibleInventoryPage|onNextPage|onPreviousPage/u);
assert.match(builder, /getQuestionReadinessFromDraft/u);
assert.match(builder, /aria-current=\{isActive \? "true" : undefined\}/u);
assert.doesNotMatch(builder, /Semua soal|Filter inventori soal|question-bank-filter-/u);
assert.doesNotMatch(builder, /soal ditampilkan/u);
assert.doesNotMatch(builder, /Masalah berikutnya/u);
assert.doesNotMatch(builder, /Bank diterbitkan/u);
assert.doesNotMatch(builder, /Navigasi soal" className="[^"]*border-t/u);
assert.match(builder, /const visibleQuestions = builderState\.questions/u);
assert.match(builder, /className="flex flex-col gap-1\.5"/u);
assert.match(builder, /builderState\.questions\.findIndex\(\(item\) => item\.id === question\.id\) \+ 1/u);
assert.match(builder, /question\.id === activeQuestionId/u);
assert.match(builder, /key=\{question\.id\}/u);
assert.match(builder, /onOpenQuestion\(question\.id\)/u);
assert.match(builder, /questionRowRefs\.current\[questionId\]/u);
assert.match(builder, /scrollIntoView/u);
assert.match(builder, /flex h-full min-h-0 min-w-0 flex-col/u);
assert.match(builder, /tabIndex=\{isActive \? 0 : -1\}/u);
assert.match(builder, /questionFocusAfterDeleteRef/u);
assert.match(builder, /const nextActiveQuestion = questions\[0\] \?\? null/u);
assert.match(builder, /if \(questions\.length === builderState\.questions\.length\) return/u);
assert.match(builder, /Bank soal tetap dapat disimpan tanpa soal/u);
assert.match(builder, /const id = createQuestionId\(subjectCode\)/u);
assert.match(builder, /subject-question-<digits>/u);
assert.match(builder, /Math\.floor\(Math\.random\(\) \* 1_000_000\)/u);

const openQuestionBlock = builder.match(/function openQuestion\(questionId: string\) \{[\s\S]*?\n  \}/u)?.[0] ?? "";
assert.doesNotMatch(openQuestionBlock, /questionEditorTab: "edit"/u);

console.log("Mentor Bank Soal continuous navigator contracts passed.");
