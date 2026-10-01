import assert from "node:assert/strict";

import { applyTeachingSubjectDefault } from "@/modules/mentor/teaching-subject-default";
import { parseQuizDashboardQuery, queryQuizDashboard, quizDashboardHref, quizDashboardReturnHref, type QuizDashboardRow } from "@/modules/mentor/quiz-dashboard-contract";

const rows: QuizDashboardRow[] = ["PU", "PK"].map((subjectCode) => ({
  id: subjectCode, title: subjectCode, editingTitle: subjectCode,
  creator: { name: "Kapten", avatarSrc: null, subject: null },
  subjectCode, subjectName: subjectCode, questionCount: 1, completedAttempts: 0,
  averageScore: null, publication: "published", isHidden: false,
  hasUnpublishedChanges: false, updatedAt: "2026-10-01T00:00:00.000Z",
}));
const preferred = parseQuizDashboardQuery(applyTeachingSubjectDefault({ q: "" }, "PU"));
assert.deepEqual(queryQuizDashboard(rows, preferred).rows.map((row) => row.id), ["PU"]);
assert.equal(quizDashboardHref(preferred), "/mentor/quiz?subject=PU");
assert.equal(parseQuizDashboardQuery(applyTeachingSubjectDefault({}, null)).subject, "");
assert.equal(parseQuizDashboardQuery(applyTeachingSubjectDefault({ subject: "PK" }, "PU")).subject, "PK");

for (const subject of ["all", "", "INVALID", ["PU", "PK"]]) {
  assert.deepEqual(applyTeachingSubjectDefault({ subject }, "PU"), { subject });
}
const all = parseQuizDashboardQuery(applyTeachingSubjectDefault({ subject: "all", page: "2", sort: "title" }, "PU"));
assert.deepEqual(queryQuizDashboard(rows, all).rows.map((row) => row.id), ["PU", "PK"]);
assert.ok(quizDashboardHref(all).includes("subject=all"));
assert.ok(quizDashboardReturnHref(quizDashboardHref(all)).includes("subject=all"));
console.log("PASS: teaching subject default, explicit overrides, all subjects, and return links");
