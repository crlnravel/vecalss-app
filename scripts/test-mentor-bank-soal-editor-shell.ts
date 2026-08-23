import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const createRoute = read("app/mentor/quiz/question-bank/create/page.tsx");
const editRoute = read("app/mentor/quiz/question-bank/[bankId]/page.tsx");

assert.match(builder, /function QuestionBankEditorHeader\(/u);
assert.match(builder, /function QuestionBankTabs\(/u);
assert.match(builder, /function QuestionBankInventory\(/u);
assert.match(builder, /function QuestionBankQuestionWorkspace\(/u);
assert.match(builder, /function QuestionBankOrganizationPanel\(/u);
assert.match(builder, /activeTab: mode === "create" \? "details" : "questions"/u);
assert.match(builder, /title: initialBank\?\.title \?\? ""/u);
assert.match(builder, /Buat dan mulai menulis/u);
assert.match(builder, /disabled=\{state\.isSaving \|\| state\.isMetadataLocked \|\| titleMissing\}/u);
assert.match(builder, /Organisasi \(opsional\)/u);
assert.match(builder, /collapsedByDefault=\{mode === "create"\}/u);
assert.match(builder, />Bank soal<\/DropdownMenuRadioItem>/u);
assert.doesNotMatch(builder, /Unfiled/u);
assert.match(builder, />Subtest<\/FieldLabel>/u);
assert.match(builder, /pendingRouteReplacement: `\/mentor\/quiz\/question-bank\/\$\{result\.result\.bank\.id\}`/u);
assert.match(createRoute, /mode="create"/u);
assert.match(editRoute, /if \(!initial\) notFound\(\)/u);
assert.match(editRoute, /mode="edit"/u);

console.log("Mentor Bank Soal editor shell contracts passed.");
