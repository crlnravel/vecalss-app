import assert from "node:assert/strict";
import { formatBlockerSections, groupReadinessBlockers } from "../lib/tryout/readiness-blocker-groups";
import type { TryoutReadinessBlocker } from "../lib/tryout/result-readiness";

const scoring = (attemptId: string, section: number): TryoutReadinessBlocker => ({ attemptId, category: "scoring", message: "Skor belum siap.", section });

assert.equal(formatBlockerSections([1, 2, 3, 5]), "Tes 1–3, 5");
assert.equal(formatBlockerSections([4]), "Tes 4");
assert.equal(formatBlockerSections([2, 1]), "Tes 1, 2");
assert.equal(formatBlockerSections([]), "");

const merged = groupReadinessBlockers([1, 2, 3, 4, 5, 6, 7].map((section) => scoring("a1", section)));
assert.equal(merged.length, 1);
assert.deepEqual(merged[0].lines, [{ message: "Skor belum siap.", sections: [1, 2, 3, 4, 5, 6, 7] }]);

const unfinished = groupReadinessBlockers([
  { attemptId: "a2", category: "unfinished", message: "Pengerjaan belum selesai.", section: null },
  { attemptId: "a2", category: "scoring", message: "Skor perlu dihitung atau diperiksa.", section: null },
  scoring("a2", 1),
]);
assert.deepEqual(unfinished[0].lines, [{ message: "Pengerjaan belum selesai.", sections: [] }]);

const mixed = groupReadinessBlockers([
  { attemptId: null, category: "session", message: "Aturan belum lengkap.", section: null },
  scoring("a3", 2),
  scoring("a4", 2),
]);
assert.deepEqual(mixed.map((group) => group.attemptId), [null, "a3", "a4"]);

console.log("readiness blocker groups: ok");
