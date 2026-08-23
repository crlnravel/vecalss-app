import assert from "node:assert/strict";
import fs from "node:fs";

import { getQuestionReadinessFromDraft } from "../lib/question-bank/readiness";

const builder = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankBuilderPageModule.tsx",
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
assert.match(builder, /readyCount\}\/\{state\.readiness\.totalCount\}/u);
assert.match(builder, /state\.readiness\.incompleteCount/u);
assert.match(builder, /Semua soal siap diterbitkan/u);

assert.match(builder, /Lihat masalah/u);
assert.match(builder, /Masalah berikutnya/u);
assert.match(builder, /pendingIssueFocusRef/u);
assert.match(builder, /focusIssueTarget\(/u);
assert.match(builder, /data-question-anchor/u);
assert.match(builder, /scrollIntoView/u);
assert.match(builder, /target\.focus\(\{ preventScroll: true \}\)/u);
assert.match(builder, /activeTab: "questions"/u);
assert.match(builder, /inventoryFilter: "incomplete"/u);
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
assert.match(builder, /aria-invalid=\{hasIssue\("prompt"\)\}/u);
assert.match(builder, /aria-invalid=\{hasIssue\("choice", choice\.id\)\}/u);
assert.match(builder, /aria-invalid=\{hasIssue\("subtest"\)\}/u);
assert.match(builder, /aria-invalid=\{hasChoiceCountIssue\}/u);
assert.match(builder, /aria-invalid=\{hasCorrectChoiceIssue\}/u);
assert.match(builder, /aria-invalid=\{hasPromptMediaIssue\}/u);
assert.match(builder, /<input[^>]*className="[^"]*focus-visible:ring-3 focus-visible:ring-primary-200[^"]*"[^>]*data-question-anchor="choice"/u);
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

type Issue = { key: string };

function nextIndex(
  issues: Issue[],
  focusedKey: string | null,
  cursorIndex: number | null,
  cursorWasLast: boolean,
  loopEnded: boolean,
) {
  if (!issues.length) return { index: null, loopEnded: false };
  const currentIndex = focusedKey === null
    ? -1
    : issues.findIndex((issue) => issue.key === focusedKey);
  if (currentIndex === issues.length - 1 && !loopEnded) {
    return { index: currentIndex, loopEnded: true };
  }
  return {
    index: currentIndex >= 0
      ? (currentIndex + 1) % issues.length
      : cursorWasLast
        ? 0
        : Math.min(cursorIndex ?? 0, issues.length - 1),
    loopEnded: false,
  };
}

const originalIssues = [{ key: "prompt" }, { key: "choice:b" }, { key: "subtest" }];
assert.deepEqual(nextIndex(originalIssues, null, null, false, false), { index: 0, loopEnded: false });
assert.deepEqual(nextIndex(originalIssues, "prompt", 0, false, false), { index: 1, loopEnded: false });
assert.deepEqual(nextIndex(originalIssues, "subtest", 2, true, false), { index: 2, loopEnded: true });
assert.deepEqual(nextIndex(originalIssues, "subtest", 2, true, true), { index: 0, loopEnded: false });
assert.deepEqual(
  nextIndex(originalIssues.filter((issue) => issue.key !== "prompt"), "prompt", 0, false, false),
  { index: 0, loopEnded: false },
  "fixed issues leave the next stable issue at the same cursor position",
);
assert.deepEqual(
  nextIndex(originalIssues.filter((issue) => issue.key !== "subtest"), "subtest", 2, true, false),
  { index: 0, loopEnded: false },
  "fixing the last issue wraps to the first remaining issue",
);

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
