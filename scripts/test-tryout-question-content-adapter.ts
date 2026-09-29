import assert from "node:assert/strict";

import {
  asContentEditorQuestion,
  toTryoutQuestionChange,
} from "@/modules/mentor/components/tryout-question-content-adapter";
import type { TryoutQuestionSnapshotDraft } from "@/modules/mentor/components/tryout-section-question-manager";

const snapshot: TryoutQuestionSnapshotDraft = {
  difficulty: "hard",
  explanation: "Pembahasan",
  explanationAssetId: "explanation-image",
  options: [
    {
      assetId: "first-image",
      choiceKey: "A",
      content: "Pilihan pertama",
      isCorrect: true,
      snapshotOptionId: "first",
      sortOrder: 0,
    },
    {
      assetId: null,
      choiceKey: "B",
      content: "Pilihan kedua",
      isCorrect: false,
      snapshotOptionId: "second",
      sortOrder: 1,
    },
  ],
  prompt: "Pertanyaan",
  promptAssetId: "prompt-image",
  questionType: "single_choice",
  snapshotId: "snapshot",
};

const editorQuestion = asContentEditorQuestion(snapshot);
assert.equal(editorQuestion.id, snapshot.snapshotId);
assert.equal(editorQuestion.promptMediaAssetId, snapshot.promptAssetId);
assert.equal(editorQuestion.explanationMediaAssetId, snapshot.explanationAssetId);
assert.equal(editorQuestion.choices[0]?.mediaAssetId, "first-image");
assert.deepEqual(editorQuestion.correctChoiceIds, ["first"]);

const edited = toTryoutQuestionChange({
  ...editorQuestion,
  choices: [
    { id: "second", text: "Diubah" },
    { id: "new-choice", text: "Baru", mediaAssetId: "new-image" },
  ],
  correctChoiceId: "new-choice",
  correctChoiceIds: ["new-choice"],
  explanation: "Penjelasan baru",
  prompt: "Pertanyaan baru",
  promptMediaAssetId: undefined,
  questionType: "multiple_choice",
});

assert.equal(edited.prompt, "Pertanyaan baru");
assert.equal(edited.promptAssetId, null);
assert.equal(edited.explanation, "Penjelasan baru");
assert.equal(edited.explanationAssetId, "explanation-image");
assert.equal(edited.questionType, "multiple_choice");
assert.deepEqual(edited.options, [
  {
    assetId: null,
    choiceKey: "A",
    content: "Diubah",
    isCorrect: false,
    snapshotOptionId: "second",
    sortOrder: 0,
  },
  {
    assetId: "new-image",
    choiceKey: "B",
    content: "Baru",
    isCorrect: true,
    snapshotOptionId: "new-choice",
    sortOrder: 1,
  },
]);

console.log("Tryout question content adapter passed.");
