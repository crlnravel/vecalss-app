import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankBuilderPageModule.tsx",
  "utf8",
);
const editRoute = fs.readFileSync(
  "app/mentor/quiz/question-bank/[bankId]/editor/page.tsx",
  "utf8",
);
const fileImportControl = fs.readFileSync(
  "modules/mentor/components/question-bank-create-file-import.tsx",
  "utf8",
);
const createWorkspace =
  builder.match(
    /function QuestionBankCreateWorkspace\([\s\S]*?\n\}\n\nfunction QuestionBankEditWorkspace/u,
  )?.[0] ?? "";

const workspace =
  builder.match(
    /function QuestionBankQuestionContent\([\s\S]*?\n\}\n\nfunction QuestionBankCreateWorkspace/u,
  )?.[0] ?? "";
const editorForm =
  builder.match(
    /function QuestionPromptField\([\s\S]*?\n\}\s*function QuestionBankPreview/u,
  )?.[0] ?? "";
const preview =
  builder.match(
    /function QuestionBankPreview\([\s\S]*?\n\}\s*function QuestionBankInventory/u,
  )?.[0] ?? "";
const openQuestionBlock =
  builder.match(
    /const openQuestion = useCallback\([\s\S]*?hasSubmittedPreview: false,[\s\S]*?previewChoiceId: null,[\s\S]*?\n  \);/u,
  )?.[0] ?? "";

assert.match(workspace, /<Switch/u);
assert.match(workspace, /Preview/u);
assert.match(workspace, /checked=\{state\.questionEditorTab === "preview"\}/u);
assert.match(
  workspace,
  /onCheckedChange=\{\(checked\) =>\s*actions\.onEditorTabChange\(checked \? "preview" : "edit"\)\s*\}/u,
);
assert.doesNotMatch(workspace, /<Tabs|TabsTrigger|TabsContent/u);
assert.match(workspace, /state\.questionEditorTab === "preview"/u);
assert.match(workspace, /<QuestionBankEditorForm/u);
assert.match(workspace, /<QuestionBankPreview/u);
assert.match(workspace, /!builderState\.questions\.length/u);
assert.match(workspace, /Tambah soal pertama/u);
assert.match(builder, /Bank soal(?: tetap)? dapat disimpan tanpa soal/u);

assert.match(openQuestionBlock, /hasSubmittedPreview: false/u);
assert.match(openQuestionBlock, /previewChoiceId: null/u);
assert.doesNotMatch(openQuestionBlock, /questionEditorTab\s*:/u);
assert.match(
  builder,
  /onChoiceChange: \(value\) => \{[\s\S]*?hasSubmittedPreview: false,[\s\S]*?previewChoiceId: nextIds\[0\]/u,
);
assert.match(
  builder,
  /onSubmitPreview: \(\) => updateEditor\(\{ hasSubmittedPreview: true \}\)/u,
);
assert.match(preview, /<RadioGroup\s+key=\{questionDraft\.id\}/u);
assert.doesNotMatch(
  builder.match(/saveQuestionBankAction\(\{[\s\S]*?\}\)/u)?.[0] ?? "",
  /previewChoiceId|hasSubmittedPreview/u,
);

type PreviewState = {
  activeQuestionId: string;
  hasSubmittedPreview: boolean;
  previewChoiceId: string | null;
  questionEditorTab: "edit" | "preview";
};

function selectQuestion(state: PreviewState, questionId: string): PreviewState {
  return {
    ...state,
    activeQuestionId: questionId,
    hasSubmittedPreview: false,
    previewChoiceId: null,
  };
}

const previewAfterAnsweringQuestionOne: PreviewState = {
  activeQuestionId: "question-1",
  hasSubmittedPreview: true,
  previewChoiceId: "b",
  questionEditorTab: "preview",
};
const previewAfterSelectingQuestionTwo = selectQuestion(
  previewAfterAnsweringQuestionOne,
  "question-2",
);
assert.deepEqual(
  {
    activeQuestionId: previewAfterSelectingQuestionTwo.activeQuestionId,
    hasSubmittedPreview: previewAfterSelectingQuestionTwo.hasSubmittedPreview,
    previewChoiceId: previewAfterSelectingQuestionTwo.previewChoiceId,
  },
  {
    activeQuestionId: "question-2",
    hasSubmittedPreview: false,
    previewChoiceId: null,
  },
  "switching questions clears answer/feedback state",
);
assert.equal(
  previewAfterSelectingQuestionTwo.questionEditorTab,
  "preview",
  "switching questions keeps Preview active",
);

for (const label of [
  "Pertanyaan",
  "Subtest",
  "Tingkat kesulitan",
  "Penjelasan",
]) {
  assert.match(
    editorForm,
    new RegExp(label, "u"),
    `${label} remains in the editor form`,
  );
}
assert.match(editorForm, /choices\.length <= 2/u);
assert.match(editorForm, /choices\.length >= 5/u);
assert.match(editorForm, /data-question-field="prompt"/u);
assert.match(editorForm, /data-question-field="choice"/u);
assert.match(editorForm, /data-question-field="correctChoice"/u);
assert.match(editorForm, /data-question-field="media"/u);
assert.match(editorForm, /data-question-field="subtest"/u);
assert.match(editorForm, /id="question-prompt"/u);
assert.match(editorForm, /id=\{inputId\}/u);
assert.match(editorForm, /id=\{"bank-correct-choice-" \+ choice\.id\}/u);
assert.match(editorForm, /id="question-media-prompt"/u);
assert.match(editorForm, /id=\{"question-media-choice-" \+ choice\.id\}/u);
assert.match(editorForm, /id="question-media-explanation"/u);
assert.match(editorForm, /id="question-subtest"/u);
assert.match(editorForm, /field=\{"choice-" \+ choice\.id\}/u);
assert.match(editorForm, /onRemoveChoiceMedia\(choice\.id\)/u);

assert.match(
  builder,
  /const isMetadataLocked =\s*editorState\.lifecycleStatus === "archived"/u,
);
assert.match(
  builder,
  /const isQuestionContentLocked = editorState\.lifecycleStatus === "archived"/u,
);
assert.match(builder, /state\.isMetadataLocked/u);
assert.doesNotMatch(
  builder,
  /Bank diterbitkan|Bank diarsipkan|Bank terjadwal|Bank Soal Terjadwal belum didukung untuk perubahan di editor ini/u,
  "non-editable banks do not render a locked-editor banner",
);
assert.doesNotMatch(builder, /Masalah berikutnya|soal ditampilkan/u);
assert.match(
  createWorkspace,
  /const isChoosingSheets = sheetPickerOpen && Boolean\(actions\.xlsxDraftInfo\)/u,
);
assert.equal(
  createWorkspace.match(/<QuestionBankCreateFileImportControl\b/gu)?.length,
  1,
  "sheet selection should keep one file control mounted",
);
assert.match(createWorkspace, /hidden=\{isChoosingSheets\}/u);
assert.match(fileImportControl, /hidden\?: boolean/u);
assert.match(
  fileImportControl,
  /<section[\s\S]*?hidden=\{hidden\}/u,
);
assert.match(fileImportControl, /className=\{hidden \? "hidden" : "grid gap-3"\}/u);
assert.match(
  builder,
  /const visibleQuestions = normalizedQuery\s*\?\s*builderState\.questions\.filter/u,
  "the inventory applies its search query before listing questions",
);
assert.match(builder, /aria-label="Cari soal di inventori"/u);
assert.match(builder, /className="flex flex-col gap-1\.5"/u);
assert.match(editRoute, /initial\.bank\.status === "archived"/u);
assert.match(
  builder,
  /disabled=\{isQuestionContentLocked\}[\s\S]*?id="question-prompt"/u,
);
assert.match(
  builder,
  /disabled=\{state\.isMetadataLocked\}[^>]*id="bank-title"/u,
);

console.log("Mentor Bank Soal question workspace contracts passed.");
