import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const createRoute = read("app/mentor/quiz/question-bank/create/page.tsx");
const detailRoute = read("app/mentor/quiz/question-bank/[bankId]/page.tsx");
const editorRoute = read("app/mentor/quiz/question-bank/[bankId]/editor/page.tsx");
const metadataForm = builder.match(/function QuestionBankMetadataForm\([\s\S]*?\n\}\n\nfunction QuestionBankBuilderScreen/u)?.[0] ?? "";

assert.match(builder, /function QuestionBankEditorHeader\(/u);
assert.match(builder, /function QuestionBankMetadataForm\(/u);
assert.match(builder, /function QuestionBankInventory\(/u);
assert.match(builder, /function QuestionBankCategoryPicker\(/u);
assert.match(builder, /function hasQuestionBankDraftContent\(/u);
assert.match(builder, /title: initialBank\?\.title \?\? ""/u);
assert.match(builder, /Buat bank soal/u);
assert.match(builder, /disabled=\{state\.isSaving \|\| state\.isMetadataLocked \|\| titleMissing\}/u);
assert.doesNotMatch(builder, /function QuestionBankTabs\(/u);
assert.doesNotMatch(builder, /function QuestionBankOrganizationPanel\(/u);
assert.doesNotMatch(builder, /activeTab/u);
assert.doesNotMatch(builder, /Organisasi \(opsional\)|collapsedByDefault=\{mode === "create"\}/u);
assert.doesNotMatch(builder, /Buat dan mulai menulis|Isi judul untuk membuat bank soal\./u);
assert.match(builder, /questions: initialQuestions/u);
assert.match(builder, /hasUnsavedChanges: mode === "create" && hasQuestionBankDraftContent\(initialBuilderState\)/u);
assert.match(builder, /hasUnsavedChanges: mode === "create" \? hasQuestionBankDraftContent\(nextState\) : true/u);
assert.match(builder, /Bank soal dapat disimpan tanpa soal/u);
assert.ok(metadataForm.indexOf('id="bank-title"') < metadataForm.indexOf("<QuestionBankCategoryPicker"), "category control should follow the title field");
assert.doesNotMatch(builder, /<FieldLabel htmlFor="bank-folder">Folder<\/FieldLabel>/u);
assert.doesNotMatch(builder, /moveQuestionBanksToFolderAction/u);
assert.doesNotMatch(builder, /Unfiled/u);
assert.doesNotMatch(detailRoute, /initialFolderTree|listQuestionBankFolderTree/u);
assert.doesNotMatch(editorRoute, /initialFolderTree|listQuestionBankFolderTree/u);
assert.match(builder, />Subtest<\/FieldLabel>/u);
assert.match(builder, /pendingRouteReplacement: `\/mentor\/quiz\/question-bank\/\$\{result\.result\.bank\.id\}`/u);
assert.match(createRoute, /mode="create"/u);
assert.match(detailRoute, /if \(!initial\) notFound\(\)/u);
assert.match(detailRoute, /KaptenQuestionBankDetailPageModule/u);
assert.match(editorRoute, /mode="edit"/u);

console.log("Mentor Bank Soal editor shell contracts passed.");
