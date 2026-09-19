import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const createRoute = read("app/mentor/quiz/question-bank/create/page.tsx");
const detailRoute = read("app/mentor/quiz/question-bank/[bankId]/page.tsx");
const editorRoute = read("app/mentor/quiz/question-bank/[bankId]/editor/page.tsx");
const metadataForm = builder.match(/function QuestionBankMetadataForm\([\s\S]*?\n\}\n\nfunction QuestionBankBuilderScreen/u)?.[0] ?? "";
const editorScreen = builder.match(/function QuestionBankBuilderScreen\([\s\S]*?\n\}\n\nfunction useQuestionBankNavigationGuards/u)?.[0] ?? "";
const inventory = builder.match(/function QuestionBankInventory\([\s\S]*?\n\}\n\nfunction QuestionBankMobileInventory/u)?.[0] ?? "";

assert.match(builder, /function QuestionBankEditorHeader\(/u);
assert.match(builder, /function QuestionBankMetadataForm\(/u);
assert.match(builder, /function QuestionBankInventory\(/u);
assert.match(builder, /function QuestionMateriField\(/u);
assert.doesNotMatch(builder, /function QuestionBankCategoryPicker\(/u);
assert.match(builder, /function hasQuestionBankDraftContent\(/u);
assert.match(builder, /title: initialBank\?\.title \?\? ""/u);
assert.match(builder, /Buat bank soal/u);
assert.match(builder, /disabled=\{state\.isSaving \|\| state\.isMetadataLocked \|\| titleMissing\}/u);
assert.match(builder, /function QuestionBankHeaderActions[\s\S]*?if \(mode === "create"\) return null;/u);
assert.match(metadataForm, /className="grid w-full gap-5 p-5 md:p-7"/u);
assert.match(metadataForm, /<QuestionBankSaveAction[\s\S]*?className="w-full"[\s\S]*?size="default"/u);
const metadataCardEnd = metadataForm.indexOf("</ReferenceSurface>");
const createSaveAction = metadataForm.indexOf("<QuestionBankSaveAction");
assert.ok(
  metadataCardEnd >= 0 && createSaveAction > metadataCardEnd,
  "create save action should sit outside and below the metadata card",
);
assert.doesNotMatch(builder, /function QuestionBankTabs\(/u);
assert.doesNotMatch(builder, /function QuestionBankOrganizationPanel\(/u);
assert.doesNotMatch(builder, /activeTab/u);
assert.doesNotMatch(builder, /Organisasi \(opsional\)|collapsedByDefault=\{mode === "create"\}/u);
assert.doesNotMatch(builder, /Buat dan mulai menulis|Isi judul untuk membuat bank soal\./u);
assert.match(builder, /questions: initialQuestions/u);
assert.match(builder, /hasUnsavedChanges:\s*mode === "create" && hasQuestionBankDraftContent\(initialBuilderState\)/u);
assert.match(builder, /hasUnsavedChanges:\s*markChangedMode === "create"\s*\? hasQuestionBankDraftContent\(nextState\)\s*: true/u);
assert.match(builder, /Bank soal dapat disimpan tanpa soal/u);
assert.ok(metadataForm.indexOf('id="bank-title"') >= 0, "metadata form should retain the bank title field");
assert.ok(builder.indexOf('htmlFor="question-materi"') > builder.indexOf('htmlFor="question-subtest"'), "Materi control should follow the Subtest control");
assert.doesNotMatch(builder, /<FieldLabel htmlFor="bank-folder">Folder<\/FieldLabel>/u);
assert.doesNotMatch(builder, /moveQuestionBanksToFolderAction/u);
assert.doesNotMatch(builder, /Unfiled/u);
assert.doesNotMatch(detailRoute, /initialFolderTree|listQuestionBankFolderTree/u);
assert.doesNotMatch(editorRoute, /initialFolderTree|listQuestionBankFolderTree/u);
assert.match(builder, /<FieldLabel[\s\S]*?htmlFor="question-subtest"[\s\S]*?>\s*Subtest\s*<\/FieldLabel>/u);
assert.match(builder, /pendingRouteReplacement: `\/mentor\/quiz\/question-bank\/\$\{result\.result\.bank\.id\}\?purpose=\$\{result\.result\.bank\.purpose\}`/u);
assert.match(builder, /requestExit: \(route: string\) => void/u);
assert.match(builder, /onClick=\{\(\) => actions\.requestExit\(detailHref\)\}/u);
assert.match(builder, /title: "Keluar tanpa menyimpan\?"/u);
assert.match(builder, /description: "Perubahan Bank Soal yang belum disimpan akan hilang\."/u);
assert.doesNotMatch(editorScreen, /<Ellipsis|>Terbitkan</u);
assert.doesNotMatch(builder, /<div className="h-5 w-px bg-primary-100" \/>/u);
assert.match(inventory, /className="flex h-full min-h-0 min-w-0 flex-col/u);
assert.match(inventory, /className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"/u);
assert.match(createRoute, /mode="create"/u);
assert.match(detailRoute, /if \(!initial\) notFound\(\)/u);
assert.match(detailRoute, /KaptenQuestionBankDetailPageModule/u);
assert.match(editorRoute, /mode="edit"/u);

console.log("Mentor Bank Soal editor shell contracts passed.");
