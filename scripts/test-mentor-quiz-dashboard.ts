import assert from "node:assert/strict";
import { parseQuizDashboardQuery, queryQuizDashboard, quizDashboardHref, quizDashboardReturnHref, type QuizDashboardRow } from "@/modules/mentor/quiz-dashboard-contract";

const row = (id: string, patch: Partial<QuizDashboardRow> = {}): QuizDashboardRow => ({
  id, title: `Kuis ${id}`, editingTitle: `Kuis ${id}`, subjectCode: "PU", subjectName: "Penalaran Umum",
  questionCount: 3, completedAttempts: 0, averageScore: null, publication: "published",
  isHidden: false, hasUnpublishedChanges: false, updatedAt: "2026-09-30T08:00:00.000Z", ...patch,
});
const rows = [row("a", { isHidden: true, hasUnpublishedChanges: true, averageScore: 0 }), row("b", { subjectCode: "PK", subjectName: "Pengetahuan Kuantitatif", editingTitle: "Persamaan baru", hasUnpublishedChanges: true }), row("c", { publication: "archived" }), row("d", { publication: "unpublished" })];
const query = parseQuizDashboardQuery({ subject: "PU", status: "published", hidden: "1", changed: "1", pageSize: "6" });
assert.deepEqual(queryQuizDashboard(rows, query).rows.map(item => item.id), ["a"], "A hidden published quiz with edits remains findable under all three filters");
assert.equal(queryQuizDashboard(rows, query).rows[0].averageScore, 0, "An actual zero score remains zero");
assert.equal(queryQuizDashboard(rows, parseQuizDashboardQuery({ q: "persamaan" })).rows[0].id, "b", "Search finds an unpublished editing title");
assert.equal(queryQuizDashboard(rows, parseQuizDashboardQuery({ q: "kuantitatif" })).rows[0].id, "b", "Search finds full subtest names");
assert.equal(queryQuizDashboard(rows, parseQuizDashboardQuery({ status: "unpublished" })).total, 1);
assert.equal(queryQuizDashboard(rows, parseQuizDashboardQuery({ page: "9999" })).query.page, 1, "Out-of-range pages clamp to the available page");
assert.equal(queryQuizDashboard(rows, parseQuizDashboardQuery({ q: "no match" })).total, 0);
assert.deepEqual(parseQuizDashboardQuery({ page: "NaN", pageSize: "99999", sort: "__proto__", direction: "wrong", q: ["a", "b"] }), { q: "", subject: "", status: "", hidden: false, changed: false, sort: "updatedAt", direction: "desc", page: 1, pageSize: 6 });
const many = Array.from({ length: 15 }, (_, index) => row(String(index), { questionCount: index }));
assert.deepEqual(queryQuizDashboard(many, parseQuizDashboardQuery({ sort: "questionCount", direction: "desc", page: "2", pageSize: "6" })).rows.map(item => item.questionCount), [8, 7, 6, 5, 4, 3], "Sort applies to the entire dataset before pagination");
const href = quizDashboardHref(query);
assert.equal(quizDashboardReturnHref(href), href);
assert.equal(quizDashboardReturnHref("https://example.com/mentor/quiz"), "/mentor/quiz");
assert.equal(quizDashboardReturnHref("//example.com"), "/mentor/quiz");
assert.equal(quizDashboardReturnHref("/mentor/quiz/create"), "/mentor/quiz");
console.log("Mentor quiz dashboard query contract passed.");
