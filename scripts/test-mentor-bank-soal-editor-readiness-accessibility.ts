import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync(
  "modules/mentor/KaptenQuestionBankBuilderPageModule.tsx",
  "utf8",
);

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
assert.match(builder, /if \(result\.readiness\) setServerReadiness\(result\.readiness\)/u);
assert.match(builder, /setServerReadiness\(result\.result\.readiness\)/u);
assert.match(builder, /questionIssues = state\.readiness\.issues\.filter/u);
assert.match(builder, /aria-invalid=\{hasIssue\("prompt"\)\}/u);
assert.match(builder, /aria-invalid=\{hasIssue\("choice", choice\.id\)\}/u);
assert.match(builder, /aria-invalid=\{hasIssue\("subtest"\)\}/u);

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

console.log("Mentor Bank Soal readiness/accessibility contracts passed.");
