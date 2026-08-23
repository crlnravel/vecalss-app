import assert from "node:assert/strict";

import {
  getQuestionBankReadinessFromDrafts,
  getQuestionReadinessFromDraft,
  getQuestionReadinessFromRevision,
  type QuestionBankReadiness,
  type QuestionReadinessIssue,
} from "../lib/question-bank/readiness";
import type { QuestionBankEditDto } from "../lib/question-bank/repository";
import { questionBankFolderLabel } from "../lib/question-bank/labels";

const readyDraft = {
  choices: [
    { id: "a", text: "Pilihan A" },
    { id: "b", text: "Pilihan B" },
  ],
  correctChoiceId: "a",
  id: "question-ready",
  prompt: "Pertanyaan siap",
  subjectCode: "PU",
};

const incompleteDraft = {
  choices: [
    { id: "a", mediaAssetState: undefined, text: "" },
    { id: "b", mediaAssetState: "pending", text: "" },
  ],
  correctChoiceId: "missing",
  id: "question-incomplete",
  prompt: " ",
  promptMediaAssetState: "pending",
  subjectCode: "",
};

const expectedIncompleteIssues: QuestionReadinessIssue[] = [
  {
    code: "missing_prompt",
    field: "prompt",
    focusTarget: "prompt",
    questionId: "question-incomplete",
  },
  {
    choiceId: "a",
    code: "missing_choice_text",
    field: "choice",
    focusTarget: "choice",
    questionId: "question-incomplete",
  },
  {
    choiceId: "b",
    code: "missing_choice_text",
    field: "choice",
    focusTarget: "choice",
    questionId: "question-incomplete",
  },
  {
    code: "invalid_correct_choice",
    field: "correctChoice",
    focusTarget: "correctChoice",
    questionId: "question-incomplete",
  },
  {
    code: "asset_not_ready",
    field: "media",
    focusTarget: "media",
    mediaTarget: "prompt",
    questionId: "question-incomplete",
  },
  {
    choiceId: "b",
    code: "asset_not_ready",
    field: "media",
    focusTarget: "media",
    questionId: "question-incomplete",
  },
  {
    code: "missing_subtest",
    field: "subtest",
    focusTarget: "subtest",
    questionId: "question-incomplete",
  },
];

assert.deepEqual(getQuestionReadinessFromDraft(incompleteDraft), expectedIncompleteIssues);

assert.deepEqual(
  getQuestionReadinessFromRevision({
    questionId: "question-incomplete",
    revision: {
      explanation: null,
      explanationAsset: undefined,
      options: [
        { asset: undefined, content: "", id: "a", isCorrect: false },
        { asset: { state: "pending" }, content: "", id: "b", isCorrect: false },
      ],
      promptAsset: { state: "pending" },
      stem: " ",
    },
    subtestCode: "",
  }),
  expectedIncompleteIssues,
  "revision-shaped input must use the same issue codes, targets, and order as the editor draft",
);

assert.deepEqual(
  getQuestionReadinessFromDraft({
    ...readyDraft,
    choices: [{ id: "a", text: "Pilihan A" }],
  }),
  [
    {
      code: "invalid_choice_count",
      field: "choice",
      focusTarget: "choice",
      questionId: "question-ready",
    },
  ],
  "choice cardinality is a question-level choice target",
);

assert.deepEqual(
  getQuestionReadinessFromRevision({
    questionId: "question-multiple-correct",
    revision: {
      options: [
        { content: "Pilihan A", id: "a", isCorrect: true },
        { content: "Pilihan B", id: "b", isCorrect: true },
      ],
      stem: "Pertanyaan dengan dua jawaban benar",
    },
    subtestCode: "PU",
  }).map(({ code, field, focusTarget, questionId }) => ({ code, field, focusTarget, questionId })),
  [
    {
      code: "invalid_correct_choice",
      field: "correctChoice",
      focusTarget: "correctChoice",
      questionId: "question-multiple-correct",
    },
  ],
  "persisted revisions with more than one correct option must fail the same correctness rule",
);

const bankReadiness = getQuestionBankReadinessFromDrafts([readyDraft, incompleteDraft]);
assert.deepEqual(bankReadiness, {
  incompleteCount: 1,
  issues: expectedIncompleteIssues,
  readyCount: 1,
  totalCount: 2,
} satisfies QuestionBankReadiness);

const detailedDtoReadiness: QuestionBankEditDto["readiness"] = bankReadiness;
assert.equal(detailedDtoReadiness.totalCount, 2);

assert.equal(questionBankFolderLabel(null), "Bank soal");
assert.equal(questionBankFolderLabel(null, "Unfiled"), "Bank soal");
assert.equal(questionBankFolderLabel("folder-1", "  Latihan  "), "Latihan");

console.log("Question-bank readiness and root-label contracts passed.");
