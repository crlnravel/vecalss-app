import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankBuilderPageModule.tsx",
  "utf8",
);

assert.doesNotMatch(builder, /INVENTORY_QUESTIONS_PER_PAGE/u);
assert.doesNotMatch(builder, /inventoryPageCount|paginatedQuestions|visibleInventoryPage|onNextPage|onPreviousPage/u);
assert.match(builder, /type InventoryFilter = "all" \| "incomplete"/u);
assert.match(builder, /getQuestionReadinessFromDraft/u);
assert.match(builder, /"Semua soal"/u);
assert.match(builder, /"Perlu diperbaiki"/u);
assert.match(builder, /role="tablist"/u);
assert.match(builder, /role="tab"/u);
assert.match(builder, /aria-current=\{isActive \? "true" : undefined\}/u);
assert.match(builder, /builderState\.questions\.findIndex\(\(item\) => item\.id === question\.id\) \+ 1/u);
assert.match(builder, /question\.id === activeQuestionId/u);
assert.match(builder, /key=\{question\.id\}/u);
assert.match(builder, /onOpenQuestion\(question\.id\)/u);
assert.match(builder, /questionRowRefs\.current\[questionId\]/u);
assert.match(builder, /scrollIntoView/u);
assert.match(builder, /xl:sticky/u);
assert.match(builder, /role="tabpanel"/u);
assert.match(builder, /tabIndex=\{isActive \? 0 : -1\}/u);
assert.match(builder, /questionFocusAfterDeleteRef/u);
assert.match(builder, /const nextActiveQuestion = questions\[0\]!/u);
assert.match(builder, /disabled=\{isDisabled \|\| builderState\.questions\.length <= 1\}/u);
assert.match(builder, /Soal terakhir tidak dapat dihapus/u);
assert.match(builder, /const id = createQuestionId\(subjectCode\)/u);
assert.match(builder, /subject-question-<digits>/u);
assert.match(builder, /Math\.floor\(Math\.random\(\) \* 1_000_000\)/u);

const openQuestionBlock = builder.match(/function openQuestion\(questionId: string\) \{[\s\S]*?\n  \}/u)?.[0] ?? "";
assert.doesNotMatch(openQuestionBlock, /questionEditorTab: "edit"/u);

console.log("Mentor Bank Soal continuous navigator contracts passed.");
