import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  acquireEditLease,
  releaseEditLease,
} from "@/lib/resource-edit-lock/service";
import {
  getMentorQuizDashboardRows,
  manageMentorDashboardQuiz,
} from "@/lib/quiz/mentor-dashboard-repository";

const rollback = new Error("fixture rollback");
async function run() {
  const target = new URL(process.env.DATABASE_URL!);
  assert.ok(
    ["localhost", "127.0.0.1"].includes(target.hostname),
    "This fixture runs only on a local disposable database",
  );
  try {
    await prisma.$transaction(
      async (tx) => {
        const tutor = await tx.user.findUniqueOrThrow({
          where: { email: "tutor@vecalss.local" },
        });
        const student = await tx.user.findUniqueOrThrow({
          where: { email: "student@vecalss.local" },
        });
        const subtest = await tx.subtest.findFirstOrThrow();
        const quiz = await tx.standaloneQuiz.create({
          data: {
            slug: `dashboard-test-${randomUUID()}`,
            title: "Fixture dashboard",
            subtestId: subtest.id,
            createdByUserId: tutor.id,
            isHidden: true,
          },
        });
        const active = await tx.standaloneQuizVersion.create({
          data: {
            quizId: quiz.id,
            title: quiz.title,
            state: "active",
            versionNo: 1,
          },
        });
        await tx.standaloneQuizVersion.create({
          data: {
            quizId: quiz.id,
            title: "Judul editorial",
            state: "draft",
            durationSeconds: 900,
          },
        });
        let versionNo = 2;
        for (const [policy, scores] of [
          ["highest", [20, 80]],
          ["latest", [90, 10]],
          ["first", [30, 100]],
          ["average", [10, 11]],
          ["latest", [0]],
          ["latest", []],
        ] as const) {
          const pinned = await tx.standaloneQuizVersion.create({
            data: {
              quizId: quiz.id,
              title: quiz.title,
              state: "superseded",
              versionNo: versionNo++,
              scorePolicy: "highest",
            },
          });
          const participation = await tx.standaloneQuizParticipation.create({
            data: {
              quizId: quiz.id,
              quizVersionId: pinned.id,
              studentId: student.id,
              policySnapshot: { scorePolicy: policy },
            },
          });
          for (const [index, score] of scores.entries())
            await tx.standaloneQuizAttempt.create({
              data: {
                participationId: participation.id,
                attemptNo: index + 1,
                score,
                status: "submitted",
                scoringState: "scored",
                policySnapshot: {},
                formItemOrder: [],
              },
            });
          await tx.standaloneQuizAttempt.create({
            data: {
              participationId: participation.id,
              attemptNo: 20,
              score: 100,
              status: "in_progress",
              scoringState: "scored",
              policySnapshot: {},
              formItemOrder: [],
            },
          });
          await tx.standaloneQuizAttempt.create({
            data: {
              participationId: participation.id,
              attemptNo: 21,
              score: 100,
              status: "submitted",
              scoringState: "review_required",
              policySnapshot: {},
              formItemOrder: [],
            },
          });
        }
        const rows = await getMentorQuizDashboardRows(tutor.id, tx);
        const result = rows.find((row) => row.id === quiz.id)!;
        assert.equal(result.publication, "published");
        assert.equal(result.isHidden, true);
        assert.equal(result.hasUnpublishedChanges, true);
        assert.equal(
          result.completedAttempts,
          15,
          "Nine scored completions plus six waiting for review; running attempts excluded",
        );
        assert.equal(
          result.averageScore,
          (80 + 10 + 30 + 11 + 0) / 5,
          "Frozen policy and equal participation weighting, excluding unfinished scoring",
        );
        assert.equal(
          (await getMentorQuizDashboardRows(student.id, tx)).some(
            (row) => row.id === quiz.id,
          ),
          false,
          "Ownership is enforced",
        );
        await tx.standaloneQuizVersion.update({
          where: { id: active.id },
          data: { state: "superseded" },
        });
        assert.equal(
          (await getMentorQuizDashboardRows(tutor.id, tx)).find(
            (row) => row.id === quiz.id,
          )!.publication,
          "unpublished",
        );
        await tx.standaloneQuiz.update({
          where: { id: quiz.id },
          data: { status: "archived" },
        });
        assert.equal(
          (await getMentorQuizDashboardRows(tutor.id, tx)).find(
            (row) => row.id === quiz.id,
          )!.publication,
          "archived",
        );
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  const tutor = await prisma.user.findUniqueOrThrow({
    where: { email: "tutor@vecalss.local" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@vecalss.local" },
  });
  const subtest = await prisma.subtest.findFirstOrThrow();
  const managed = await prisma.standaloneQuiz.create({
    data: {
      slug: `dashboard-actions-${randomUUID()}`,
      title: "Fixture lifecycle",
      subtestId: subtest.id,
      createdByUserId: tutor.id,
    },
  });
  const read = async () =>
    (await getMentorQuizDashboardRows(tutor.id)).find(
      (row) => row.id === managed.id,
    )!;
  try {
    await assert.rejects(
      manageMentorDashboardQuiz(student.id, managed.id, "hide"),
      "Other users cannot manage the quiz",
    );
    assert.equal((await read()).isHidden, false);
    await manageMentorDashboardQuiz(tutor.id, managed.id, "hide");
    assert.equal((await read()).isHidden, true);
    const token = randomBytes(32).toString("base64url");
    const lease = await acquireEditLease({
      resourceType: "quiz",
      resourceId: managed.id,
      holderUserId: tutor.id,
      newToken: token,
    });
    assert.equal(lease.state, "owned");
    try {
      await assert.rejects(
        manageMentorDashboardQuiz(tutor.id, managed.id, "show"),
        "An open editor fences dashboard writes, even for its holder",
      );
      assert.equal((await read()).isHidden, true);
    } finally {
      await releaseEditLease({
        resourceType: "quiz",
        resourceId: managed.id,
        holderUserId: tutor.id,
        generation: lease.generation!,
        token,
      });
    }
    await manageMentorDashboardQuiz(tutor.id, managed.id, "show");
    assert.equal((await read()).isHidden, false);
    await manageMentorDashboardQuiz(tutor.id, managed.id, "archive");
    assert.equal((await read()).publication, "archived");
    await assert.rejects(
      manageMentorDashboardQuiz(tutor.id, managed.id, "show"),
      "Archived quizzes remain read-only",
    );
  } finally {
    await prisma.editLease.deleteMany({
      where: { resourceType: "quiz", resourceId: managed.id },
    });
    await prisma.standaloneQuiz.delete({ where: { id: managed.id } });
  }
  console.log("Mentor quiz dashboard database contracts passed.");
}
run().finally(() => prisma.$disconnect());
