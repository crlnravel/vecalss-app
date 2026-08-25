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

const workspace = builder.match(
  /function QuestionBankQuestionWorkspace\([\s\S]*?\n\}\n\nfunction QuestionBankTabs/u,
)?.[0] ?? "";
const editorForm = builder.match(
  /function QuestionBankEditorForm\([\s\S]*?\n\}\n\nfunction QuestionBankPreview/u,
)?.[0] ?? "";
const preview = builder.match(
  /function QuestionBankPreview\([\s\S]*?\n\}\n\nfunction QuestionBankInventory/u,
)?.[0] ?? "";
const openQuestionBlock = builder.match(
  /function openQuestion\(questionId: string\) \{[\s\S]*?\n  \}/u,
)?.[0] ?? "";

assert.match(workspace, /value=\{state\.questionEditorTab\}/u);
assert.match(workspace, /onValueChange=\{actions\.onEditorTabChange\}/u);
assert.match(workspace, /value="edit"/u);
assert.match(workspace, /value="preview"/u);
assert.match(workspace, /<QuestionBankEditorForm/u);
assert.match(workspace, /<QuestionBankPreview/u);

assert.match(openQuestionBlock, /hasSubmittedPreview: false/u);
assert.match(openQuestionBlock, /previewChoiceId: null/u);
assert.doesNotMatch(openQuestionBlock, /questionEditorTab\s*:/u);
assert.match(builder, /onChoiceChange: \(value\) => updateEditor\(\{ hasSubmittedPreview: false, previewChoiceId: value \}\)/u);
assert.match(builder, /onSubmitPreview: \(\) => updateEditor\(\{ hasSubmittedPreview: true \}\)/u);
assert.match(preview, /<RadioGroup key=\{questionDraft\.id\}/u);
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

function selectQuestion(
  state: PreviewState,
  questionId: string,
): PreviewState {
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

for (const label of ["Pertanyaan", "Subtest", "Tingkat kesulitan", "Penjelasan"]) {
  assert.match(editorForm, new RegExp(label, "u"), `${label} remains in the editor form`);
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
assert.match(editorForm, /id=\{`bank-correct-choice-\$\{choice\.id\}`\}/u);
assert.match(editorForm, /id="question-media-prompt"/u);
assert.match(editorForm, /id=\{`question-media-choice-\$\{choice\.id\}`\}/u);
assert.match(editorForm, /id="question-media-explanation"/u);
assert.match(editorForm, /id="question-subtest"/u);
assert.match(editorForm, /field=\{`choice-\$\{choice\.id\}`\}/u);
assert.match(editorForm, /onRemoveChoiceMedia\(choice\.id\)/u);

assert.match(builder, /const isMetadataLocked = lifecycleStatus === "archived" \|\| lifecycleStatus === "scheduled"/u);
assert.match(builder, /const isQuestionContentLocked = lifecycleStatus !== "draft"/u);
assert.match(builder, /state\.isMetadataLocked/u);
assert.doesNotMatch(
  builder,
  /Bank diterbitkan|Bank diarsipkan|Bank terjadwal|Bank Soal Terjadwal belum didukung untuk perubahan di editor ini/u,
  "non-editable banks do not render a locked-editor banner",
);
assert.doesNotMatch(builder, /Masalah berikutnya|soal ditampilkan/u);
assert.match(builder, /const visibleQuestions = builderState\.questions/u);
assert.match(builder, /className="flex flex-col gap-1\.5"/u);
assert.match(editRoute, /initial\.bank\.status !== "draft"/u);
assert.match(builder, /disabled=\{isQuestionContentLocked\}[\s\S]*?id="question-prompt"/u);
assert.match(builder, /disabled=\{state\.isMetadataLocked\} id="bank-title"/u);

console.log("Mentor Bank Soal question workspace contracts passed.");
