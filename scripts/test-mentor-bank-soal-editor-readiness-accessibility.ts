import assert from "node:assert/strict";
import fs from "node:fs";

import { getQuestionReadinessFromDraft } from "../lib/question-bank/readiness";

const builder = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankBuilderPageModule.tsx",
  "utf8",
);
const detail = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankDetailPageModule.tsx",
  "utf8",
);
const page = fs.readFileSync(
  "app/mentor/quiz/question-bank/[bankId]/page.tsx",
  "utf8",
);
const readiness = fs.readFileSync("lib/question-bank/readiness.ts", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};
const lifecycleSource = builder.match(/async function updateLifecycle\([\s\S]*?\n  \}\n\n  return \{ saveDraft, updateLifecycle \};/u)?.[0] ?? "";

assert.match(builder, /getQuestionBankReadinessFromDrafts\(builderState\.questions\)/u);
assert.match(builder, /mergeQuestionBankReadiness\(/u);
assert.match(builder, /pruneServerReadinessForDraftChange\(/u);
assert.match(builder, /state\.readiness\.incompleteCount/u);
assert.doesNotMatch(builder, /Kesiapan terbit:/u);
assert.match(builder, /AlertTriangle/u);
assert.match(builder, /showToast\(/u);
assert.doesNotMatch(builder, /Semua soal siap diterbitkan|Siap dipakai|Tersimpan/u);
assert.doesNotMatch(detail, /Status Kesiapan|Kesiapan terbit:/u);
assert.doesNotMatch(detail, /Edit Soal|Pindahkan folder/u);
assert.match(detail, /AlertTriangle/u);
assert.match(detail, /Perlu diperbaiki/u);
assert.match(detail, /showToast\(/u);
assert.doesNotMatch(detail, /Soal Siap|Semua soal siap dipublikasikan|Siap dipakai|Belum lengkap/u);

assert.match(builder, /Lihat masalah/u);
assert.doesNotMatch(builder, /Masalah berikutnya|Bank diterbitkan/u);
assert.match(builder, /pendingIssueFocusRef/u);
assert.match(builder, /focusIssueTarget\(/u);
assert.match(builder, /data-question-anchor/u);
assert.match(builder, /scrollIntoView/u);
assert.match(builder, /target\.focus\(\{ preventScroll: true \}\)/u);
assert.match(builder, /activeTab: "questions"/u);
assert.doesNotMatch(builder, /InventoryFilter|inventoryFilter|Filter inventori soal|soal ditampilkan/u);
assert.match(builder, /role="status"/u);
assert.match(builder, /aria-live="polite"/u);

assert.match(builder, /serverReadiness: QuestionBankReadiness \| null/u);
assert.match(builder, /initialReadiness\?: QuestionBankReadiness \| null/u);
assert.match(builder, /serverReadiness: mode === "edit" \? initialReadiness : null/u);
assert.match(builder, /if \(result\.readiness\) setServerReadiness\(result\.readiness\)/u);
assert.match(builder, /setServerReadiness\(result\.result\.readiness\)/u);
assert.match(lifecycleSource, /if \(operation === "publish"\) setServerReadiness\(null\)/u);
assert.equal((lifecycleSource.match(/setServerReadiness\(null\)/gu) ?? []).length, 1, "archive/unpublish/restore must preserve server readiness");
assert.match(builder, /questionIssues = state\.readiness\.issues\.filter/u);
assert.match(builder, /aria-invalid=\{hasPromptIssue\}/u);
assert.match(builder, /aria-invalid=\{hasChoiceTextIssue\}/u);
assert.match(builder, /aria-invalid=\{hasSubtestIssue\}/u);
assert.match(builder, /aria-invalid=\{hasChoiceCountIssue\}/u);
assert.match(builder, /aria-invalid=\{hasCorrectChoiceIssue\}/u);
assert.match(builder, /aria-invalid=\{hasPromptMediaIssue\}/u);
assert.match(builder, /<input[^>]*className="[^"]*focus-visible:ring-3 focus-visible:ring-primary-200[^"]*"[^>]*data-question-anchor="choice"/u);
assert.match(builder, /onBankNoLongerEditable/u);
assert.match(builder, /pendingRouteReplacement: `\/mentor\/quiz\/question-bank\/\$\{id\}`/u);
assert.match(builder, /question-choice-count-error/u);
assert.match(builder, /question-correct-choice-error/u);
assert.match(builder, /question-prompt-media-error/u);
assert.match(builder, /issue\.mediaTarget/u);
assert.match(builder, /mediaTarget \?\?/u);
assert.match(page, /initialReadiness=\{initial\.readiness\}/u);
assert.match(readiness, /export type QuestionReadinessMediaTarget = "prompt" \| "explanation"/u);
assert.match(readiness, /mediaTarget\?: QuestionReadinessMediaTarget/u);
assert.equal(
  packageJson.scripts?.["test:mentor-bank-soal-editor-readiness-accessibility"],
  "tsx scripts/test-mentor-bank-soal-editor-readiness-accessibility.ts",
  "ticket-6 contract must be runnable through package.json",
);

assert.match(builder, /Simpan dulu untuk menerbitkan/u);
assert.match(builder, /state\.readiness\.incompleteCount > 0/u);
assert.match(builder, /<DropdownMenuItem[^>]*variant="destructive"[^>]*>[\s\S]*Arsipkan/u);
assert.match(builder, /updateLifecycle\("archive"\)/u);
assert.match(builder, /aria-label=\{`Soal \$\{questionNumber\}/u);
assert.match(builder, /aria-current=\{isActive \? "true" : undefined\}/u);

const mediaIssues = getQuestionReadinessFromDraft({
  choices: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctChoiceId: "a",
  explanationMediaAssetState: "pending",
  id: "question-media-targets",
  prompt: "Pertanyaan",
  promptMediaAssetState: "failed",
  subjectCode: "PU",
}).filter((issue) => issue.code === "asset_not_ready");
assert.deepEqual(
  mediaIssues.map(({ choiceId, mediaTarget }) => ({ choiceId, mediaTarget })),
  [
    { choiceId: undefined, mediaTarget: "prompt" },
    { choiceId: undefined, mediaTarget: "explanation" },
  ],
  "question-level media failures need distinct stable targets",
);
assert.notEqual(
  mediaIssues.map((issue) => [issue.questionId, issue.code, issue.field, issue.choiceId ?? "", issue.mediaTarget ?? ""].join(":"))[0],
  mediaIssues.map((issue) => [issue.questionId, issue.code, issue.field, issue.choiceId ?? "", issue.mediaTarget ?? ""].join(":"))[1],
  "prompt and explanation media failures must not share an issue identity",
);

console.log("Mentor Bank Soal readiness/accessibility contracts passed.");
