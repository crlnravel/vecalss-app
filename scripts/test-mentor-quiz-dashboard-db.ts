import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getMentorQuizDashboardRows } from "@/lib/quiz/mentor-dashboard-repository";

const rollback = new Error("fixture rollback");
async function run() {
  const target = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "This fixture runs only on a local disposable database");
  try {
    await prisma.$transaction(async tx => {
      const tutor = await tx.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" } });
      const student = await tx.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" } });
      const subtest = await tx.subtest.findFirstOrThrow();
      const quiz = await tx.standaloneQuiz.create({ data: { slug: `dashboard-test-${randomUUID()}`, title: "Fixture dashboard", subtestId: subtest.id, createdByUserId: tutor.id, isHidden: true } });
      const active = await tx.standaloneQuizVersion.create({ data: { quizId: quiz.id, title: quiz.title, state: "active", versionNo: 1 } });
      await tx.standaloneQuizVersion.create({ data: { quizId: quiz.id, title: "Judul editorial", state: "draft", durationSeconds: 900 } });
      let versionNo = 2;
      for (const [policy, scores] of [["highest", [20, 80]], ["latest", [90, 10]], ["first", [30, 100]], ["average", [10, 11]], ["latest", [0]], ["latest", []]] as const) {
        const pinned = await tx.standaloneQuizVersion.create({ data: { quizId: quiz.id, title: quiz.title, state: "superseded", versionNo: versionNo++, scorePolicy: "highest" } });
        const participation = await tx.standaloneQuizParticipation.create({ data: { quizId: quiz.id, quizVersionId: pinned.id, studentId: student.id, policySnapshot: { scorePolicy: policy } } });
        for (const [index, score] of scores.entries()) await tx.standaloneQuizAttempt.create({ data: { participationId: participation.id, attemptNo: index + 1, score, status: "submitted", scoringState: "scored", policySnapshot: {}, formItemOrder: [] } });
        await tx.standaloneQuizAttempt.create({ data: { participationId: participation.id, attemptNo: 20, score: 100, status: "in_progress", scoringState: "scored", policySnapshot: {}, formItemOrder: [] } });
        await tx.standaloneQuizAttempt.create({ data: { participationId: participation.id, attemptNo: 21, score: 100, status: "submitted", scoringState: "review_required", policySnapshot: {}, formItemOrder: [] } });
      }
      const rows = await getMentorQuizDashboardRows(tutor.id, tx);
      const result = rows.find(row => row.id === quiz.id)!;
      assert.equal(result.publication, "published");
      assert.equal(result.isHidden, true);
      assert.equal(result.hasUnpublishedChanges, true);
      assert.equal(result.completedAttempts, 15, "Nine scored completions plus six waiting for review; running attempts excluded");
      assert.equal(result.averageScore, (80 + 10 + 30 + 11 + 0) / 5, "Frozen policy and equal participation weighting, excluding unfinished scoring");
      assert.equal((await getMentorQuizDashboardRows(student.id, tx)).some(row => row.id === quiz.id), false, "Ownership is enforced");
      await tx.standaloneQuizVersion.update({ where: { id: active.id }, data: { state: "superseded" } });
      assert.equal((await getMentorQuizDashboardRows(tutor.id, tx)).find(row => row.id === quiz.id)!.publication, "unpublished");
      await tx.standaloneQuiz.update({ where: { id: quiz.id }, data: { status: "archived" } });
      assert.equal((await getMentorQuizDashboardRows(tutor.id, tx)).find(row => row.id === quiz.id)!.publication, "archived");
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  console.log("Mentor quiz dashboard database contracts passed.");
}
run().finally(() => prisma.$disconnect());
