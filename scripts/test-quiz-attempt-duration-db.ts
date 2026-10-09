import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import {
  getStandaloneQuizAttempt,
  getStandaloneQuizResult,
  saveStandaloneQuizAnswer,
  startStandaloneQuiz,
  submitStandaloneQuiz,
} from "@/lib/quiz/repository";
import { getAvailableQuizAttempt } from "@/modules/quiz/server-data";

const OriginalDate = Date;
const base = Math.floor(OriginalDate.now() / 1000) * 1000;
let clock = base;
const date = (offset: number) => new OriginalDate(base + offset);
const ControlledDate = class extends OriginalDate {
  constructor(...args: never[]) {
    super(args.length ? args[0] : clock);
  }

  static now() {
    return clock;
  }
};

async function removeQuiz(quizId: string) {
  await prisma.standaloneQuizStartCommand.deleteMany({ where: { quizId } });
  await prisma.standaloneQuizParticipation.deleteMany({ where: { quizId } });
  await prisma.standaloneQuizItem.deleteMany({ where: { quizId } });
  await prisma.standaloneQuizVersion.updateMany({
    where: { quizId },
    data: { baseVersionId: null },
  });
  await prisma.standaloneQuizVersion.deleteMany({ where: { quizId } });
  await prisma.standaloneQuiz.delete({ where: { id: quizId } });
}

async function run() {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  assert.ok(
    ["localhost", "127.0.0.1"].includes(databaseUrl.hostname),
    "Use a local disposable fixture database",
  );

  const previousCutover = process.env.KUIS_VERSIONING_CUTOVER;
  const tutor = await prisma.user.findUniqueOrThrow({
    where: { email: "tutor@vecalss.local" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@vecalss.local" },
  });
  const subtest = await prisma.subtest.findFirstOrThrow({ where: { code: "PU" } });
  globalThis.Date = ControlledDate as unknown as DateConstructor;

  try {
    for (const cutover of ["enabled", "disabled"] as const) {
      process.env.KUIS_VERSIONING_CUTOVER = cutover;

      for (const boundary of [1_999, 2_000, 2_001]) {
        clock = base;
        const quiz = await prisma.standaloneQuiz.create({
          data: {
            slug: `attempt-duration-${cutover}-${randomUUID()}`,
            title: "Duration fixture",
            subtestId: subtest.id,
            createdByUserId: tutor.id,
            closesAt: date(120_000),
            durationSeconds: 2,
            attemptsAllowed: 1,
            reviewTiming: "after_close",
          },
        });

        try {
          const version =
            cutover === "enabled"
              ? await prisma.standaloneQuizVersion.create({
                  data: {
                    quizId: quiz.id,
                    title: quiz.title,
                    state: "active",
                    versionNo: 1,
                    attemptsAllowed: 1,
                    reviewTiming: "after_close",
                    durationSeconds: 2,
                  },
                })
              : null;
          const item = await prisma.standaloneQuizItem.create({
            data: {
              quizId: quiz.id,
              quizVersionId: version?.id,
              subtestId: subtest.id,
              sortOrder: 1,
              prompt: "Pilih jawaban yang tepat.",
              questionType: "single_choice",
              options: {
                create: [
                  { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
                  { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
                ],
              },
            },
            include: { options: { orderBy: { sortOrder: "asc" } } },
          });
          const startRequestId = randomUUID();
          const started = await startStandaloneQuiz(
            subtest.code,
            quiz.slug,
            student.id,
            date(0),
            startRequestId,
          );
          assert.ok(started, `${cutover}: attempt starts`);
          const attemptId = started.attempt.id;
          const correctOptionId = item.options[0]!.id;
          const wrongOptionId = item.options[1]!.id;
          assert.equal(started.attempt.startedAt?.getTime(), base);
          assert.equal(started.attempt.durationSecondsSnapshot, 2);
          assert.equal(started.attempt.deadlineAt?.getTime(), base + 2_000);
          await prisma.standaloneQuiz.update({
            where: { id: quiz.id },
            data: {
              closesAt: date(1_000),
              durationSeconds: 1,
              isHidden: true,
              status: "archived",
            },
          });
          const save = (optionId: string) =>
            saveStandaloneQuizAnswer(
              attemptId,
              item.id,
              [optionId],
              student.id,
            );

          await save(correctOptionId);
          if (boundary === 1_999) {
            clock = base + boundary;
            await save(wrongOptionId);
            const stillOpen = await prisma.standaloneQuizAttempt.findUniqueOrThrow({
              where: { id: attemptId },
              include: { answers: true },
            });
            assert.equal(stillOpen.status, "in_progress");
            assert.equal(stillOpen.answers[0]?.selectedOptionId, wrongOptionId);
            assert.equal(stillOpen.deadlineAt?.getTime(), base + 2_000);
            const loadedBeforeDeadline = await getAvailableQuizAttempt(
              "penalaran-umum",
              quiz.slug,
              student.id,
              attemptId,
            );
            assert.equal(loadedBeforeDeadline?.attempt.isSubmitted, false);
            assert.equal(loadedBeforeDeadline?.attempt.remainingSeconds, 1);
            clock = base + 2_000;
            const expiredOnLoad = await getStandaloneQuizAttempt(
              subtest.code,
              quiz.slug,
              student.id,
              attemptId,
            );
            assert.equal(expiredOnLoad?.attempt.status, "auto_submitted");
          } else {
            clock = base + boundary;
            if (boundary === 2_000) {
              const expiredOnDeadline = await save(wrongOptionId);
              assert.equal(expiredOnDeadline.state, "auto_submitted");
            } else {
              const resumeRequestId = randomUUID();
              const expiredOnResume = await startStandaloneQuiz(
                subtest.code,
                quiz.slug,
                student.id,
                undefined,
                resumeRequestId,
              );
              assert.equal(expiredOnResume?.state, "resumed");
              assert.equal(expiredOnResume?.attempt.status, "auto_submitted");
              const replay = await startStandaloneQuiz(
                subtest.code,
                quiz.slug,
                student.id,
                undefined,
                resumeRequestId,
              );
              assert.equal(replay?.state, "replayed");
              assert.equal(replay?.attempt.status, "auto_submitted");
            }
          }
          const expired = await prisma.standaloneQuizAttempt.findUniqueOrThrow({
            where: { id: attemptId },
            include: { answers: true },
          });
          assert.equal(
            expired.status,
            "auto_submitted",
            `${cutover}: deadline ${boundary - 2_000} ms auto-submits`,
          );
          assert.equal(expired.attemptState, "auto_submitted");
          assert.equal(
            expired.answers[0]?.selectedOptionId,
            boundary === 1_999 ? wrongOptionId : correctOptionId,
            "the at-deadline answer change cannot replace the last saved answer",
          );
          assert.equal(expired.scoringState, "scored");
          assert.equal(
            expired.score,
            boundary === 1_999 ? 0 : 100,
          );
          assert.equal(expired.releaseState, "released");
          assert.equal(expired.submittedAt?.getTime(), base + 2_000);
          const result = await getStandaloneQuizResult(
            attemptId,
            student.id,
            subtest.code,
            quiz.slug,
          );
          assert.equal(result?.autoSubmitted, true);

          console.log(`${cutover}: deadline ${boundary - 2_000} ms passed`);
        } finally {
          await removeQuiz(quiz.id);
        }
      }
    }

    process.env.KUIS_VERSIONING_CUTOVER = "enabled";
    clock = base;
    const republishedQuiz = await prisma.standaloneQuiz.create({
      data: {
        slug: `attempt-duration-republished-${randomUUID()}`,
        title: "Republished duration fixture",
        subtestId: subtest.id,
        createdByUserId: tutor.id,
        durationSeconds: 2,
        attemptsAllowed: 1,
        reviewTiming: "immediate",
      },
    });
    try {
      const firstVersion = await prisma.standaloneQuizVersion.create({
        data: {
          quizId: republishedQuiz.id,
          title: republishedQuiz.title,
          state: "active",
          versionNo: 1,
          attemptsAllowed: 1,
          reviewTiming: "immediate",
          durationSeconds: 2,
        },
      });
      const firstItem = await prisma.standaloneQuizItem.create({
        data: {
          quizId: republishedQuiz.id,
          quizVersionId: firstVersion.id,
          subtestId: subtest.id,
          sortOrder: 1,
          prompt: "Pilih jawaban versi pertama.",
          questionType: "single_choice",
          options: {
            create: [
              { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
              { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
            ],
          },
        },
      });
      const firstStart = await startStandaloneQuiz(
        subtest.code,
        republishedQuiz.slug,
        student.id,
        date(0),
        randomUUID(),
      );
      assert.ok(firstStart);
      assert.equal(firstStart.attempt.durationSecondsSnapshot, 2);
      clock = base + 500;
      const firstSubmit = await submitStandaloneQuiz(firstStart.attempt.id, student.id);
      assert.equal(firstSubmit.state, "submitted");

      await prisma.standaloneQuizVersion.update({
        where: { id: firstVersion.id },
        data: { state: "superseded" },
      });
      const secondVersion = await prisma.standaloneQuizVersion.create({
        data: {
          quizId: republishedQuiz.id,
          title: republishedQuiz.title,
          state: "active",
          versionNo: 2,
          attemptsAllowed: 1,
          reviewTiming: "immediate",
          durationSeconds: 10,
        },
      });
      await prisma.standaloneQuizItem.create({
        data: {
          quizId: republishedQuiz.id,
          quizVersionId: secondVersion.id,
          subtestId: subtest.id,
          sortOrder: 1,
          prompt: "Pilih jawaban versi kedua.",
          questionType: "single_choice",
          options: {
            create: [
              { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
              { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
            ],
          },
        },
      });
      clock = base + 1_000;
      const secondStart = await startStandaloneQuiz(
        subtest.code,
        republishedQuiz.slug,
        student.id,
        date(1_000),
        randomUUID(),
      );
      assert.ok(secondStart);
      assert.equal(secondStart.attempt.durationSecondsSnapshot, 10);
      assert.equal(secondStart.attempt.startedAt?.getTime(), base + 1_000);
      assert.equal(secondStart.attempt.deadlineAt?.getTime(), base + 11_000);
      const pinnedFirstAttempt = await prisma.standaloneQuizAttempt.findUniqueOrThrow({
        where: { id: firstStart.attempt.id },
      });
      assert.equal(pinnedFirstAttempt.durationSecondsSnapshot, 2);
      assert.equal(pinnedFirstAttempt.deadlineAt?.getTime(), base + 2_000);
      assert.equal(firstItem.quizVersionId, firstVersion.id);
    } finally {
      await removeQuiz(republishedQuiz.id);
    }

    process.env.KUIS_VERSIONING_CUTOVER = "disabled";
    clock = base;
    const malformedQuiz = await prisma.standaloneQuiz.create({
      data: {
        slug: `attempt-duration-malformed-${randomUUID()}`,
        title: "Malformed timing fixture",
        subtestId: subtest.id,
        createdByUserId: tutor.id,
        durationSeconds: 2,
        attemptsAllowed: 1,
      },
    });
    try {
      const item = await prisma.standaloneQuizItem.create({
        data: {
          quizId: malformedQuiz.id,
          subtestId: subtest.id,
          sortOrder: 1,
          prompt: "Pilih jawaban yang tepat.",
          questionType: "single_choice",
          options: {
            create: [
              { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
              { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
            ],
          },
        },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
      const started = await startStandaloneQuiz(
        subtest.code,
        malformedQuiz.slug,
        student.id,
        date(0),
        randomUUID(),
      );
      assert.ok(started);
      await prisma.standaloneQuizAttempt.update({
        where: { id: started.attempt.id },
        data: { formSnapshot: { malformed: true } },
      });
      clock = base + 2_000;
      const submit = await submitStandaloneQuiz(started.attempt.id, student.id);
      assert.equal(submit.state, "review_required");
      const quarantined = await prisma.standaloneQuizAttempt.findUniqueOrThrow({
        where: { id: started.attempt.id },
      });
      assert.equal(quarantined.status, "auto_submitted");
      assert.equal(quarantined.attemptState, "auto_submitted");
      assert.equal(quarantined.scoringState, "review_required");
      assert.equal(quarantined.releaseState, "hidden");
      assert.equal(quarantined.score, null);
      const result = await getStandaloneQuizResult(
        started.attempt.id,
        student.id,
        subtest.code,
        malformedQuiz.slug,
      );
      assert.equal(result?.autoSubmitted, true);
      assert.equal(result?.score, null);
      void item;
    } finally {
      await removeQuiz(malformedQuiz.id);
    }

    clock = base;
    const lockWaitQuiz = await prisma.standaloneQuiz.create({
      data: {
        slug: `attempt-duration-lock-${randomUUID()}`,
        title: "Deadline lock fixture",
        subtestId: subtest.id,
        createdByUserId: tutor.id,
        durationSeconds: 2,
        attemptsAllowed: 1,
      },
    });
    let unlockHolder: () => void = () => undefined;
    let holder: Promise<void> | null = null;
    let waitingRequests: Promise<unknown>[] = [];
    try {
      const item = await prisma.standaloneQuizItem.create({
        data: {
          quizId: lockWaitQuiz.id,
          subtestId: subtest.id,
          sortOrder: 1,
          prompt: "Pilih jawaban yang tepat.",
          questionType: "single_choice",
          options: {
            create: [
              { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
              { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
            ],
          },
        },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      });
      const started = await startStandaloneQuiz(
        subtest.code,
        lockWaitQuiz.slug,
        student.id,
        date(0),
        randomUUID(),
      );
      assert.ok(started);
      await saveStandaloneQuizAnswer(
        started.attempt.id,
        item.id,
        [item.options[0]!.id],
        student.id,
      );

      let unlock!: () => void;
      let holderReady!: (pid: number) => void;
      const releaseHolder = new Promise<void>((resolve) => { unlock = resolve; });
      unlockHolder = unlock;
      const holderStarted = new Promise<number>((resolve) => { holderReady = resolve; });
      holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${started.attempt.id}::uuid FOR UPDATE`;
        const [session] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        holderReady(session.pid);
        await releaseHolder;
      }, { timeout: 10_000 });
      const holderPid = await holderStarted;
      clock = base + 1_999;
      const waitingSave = saveStandaloneQuizAnswer(
        started.attempt.id,
        item.id,
        [item.options[1]!.id],
        student.id,
      );
      const waitingSubmit = submitStandaloneQuiz(started.attempt.id, student.id);
      const waitingRead = getStandaloneQuizAttempt(
        subtest.code,
        lockWaitQuiz.slug,
        student.id,
        started.attempt.id,
      );
      waitingRequests = [waitingSave, waitingSubmit, waitingRead];
      let blockedCount = 0;
      for (let tries = 0; tries < 100; tries++) {
        const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
          WITH RECURSIVE blocking_chain(waiter_pid, blocker_pid, path) AS (
            SELECT activity.pid,
                   blocker.pid,
                   ARRAY[activity.pid, blocker.pid]
            FROM pg_stat_activity activity
            CROSS JOIN LATERAL unnest(pg_blocking_pids(activity.pid)) AS blocker(pid)
            WHERE activity.datname = current_database()
              AND activity.wait_event_type = 'Lock'
              AND activity.pid <> ${holderPid}
            UNION ALL
            SELECT chain.waiter_pid,
                   blocker.pid,
                   chain.path || blocker.pid
            FROM blocking_chain chain
            CROSS JOIN LATERAL unnest(pg_blocking_pids(chain.blocker_pid)) AS blocker(pid)
            WHERE NOT blocker.pid = ANY(chain.path)
          )
          SELECT COUNT(DISTINCT waiter_pid)::bigint AS count
          FROM blocking_chain
          WHERE blocker_pid = ${holderPid}`;
        blockedCount = Number(row.count);
        if (blockedCount >= 3) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.ok(
        blockedCount >= 3,
        "answer, submit, and read requests wait behind the held attempt lock",
      );
      clock = base + 2_000;
      unlock();
      const [waitingResult, submitResult, readResult] = await Promise.all([
        waitingSave,
        waitingSubmit,
        waitingRead,
      ]);
      await holder;
      assert.equal(waitingResult.state, "auto_submitted");
      assert.ok(["auto_submitted", "already_submitted"].includes(submitResult.state));
      assert.equal(readResult?.attempt.status, "auto_submitted");
      const saved = await prisma.standaloneQuizAttempt.findUniqueOrThrow({
        where: { id: started.attempt.id },
        include: { answers: true },
      });
      assert.equal(saved.status, "auto_submitted");
      assert.equal(saved.answers[0]?.selectedOptionId, item.options[0]!.id);
      assert.equal(saved.submittedAt?.getTime(), base + 2_000);
    } finally {
      unlockHolder();
      if (holder) await holder.catch(() => undefined);
      await Promise.allSettled(waitingRequests);
      await removeQuiz(lockWaitQuiz.id);
    }

    for (const durationSeconds of [null, 2]) {
      clock = base;
      const quiz = await prisma.standaloneQuiz.create({
        data: {
          slug: `attempt-duration-legacy-${randomUUID()}`,
          title: "Legacy timing fixture",
          subtestId: subtest.id,
          createdByUserId: tutor.id,
          durationSeconds,
          attemptsAllowed: 1,
          reviewTiming: "immediate",
        },
      });
      try {
        const item = await prisma.standaloneQuizItem.create({
          data: {
            quizId: quiz.id,
            subtestId: subtest.id,
            sortOrder: 1,
            prompt: "Pilih jawaban yang tepat.",
            questionType: "single_choice",
            options: {
              create: [
                { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
                { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
              ],
            },
          },
          include: { options: { orderBy: { sortOrder: "asc" } } },
        });
        const started = await startStandaloneQuiz(
          subtest.code,
          quiz.slug,
          student.id,
          date(0),
          randomUUID(),
        );
        assert.ok(started);
        if (durationSeconds === null) {
          assert.equal(started.attempt.durationSecondsSnapshot, null);
          assert.equal(started.attempt.startedAt?.getTime(), base);
          assert.equal(started.attempt.deadlineAt, null);
          const page = await getAvailableQuizAttempt(
            "penalaran-umum",
            quiz.slug,
            student.id,
            started.attempt.id,
          );
          assert.equal(page?.attempt.remainingTime, "Tanpa batas waktu");
        } else {
          await prisma.standaloneQuizAttempt.update({
            where: { id: started.attempt.id },
            data: { startedAt: null, durationSecondsSnapshot: null, deadlineAt: null },
          });
          await prisma.standaloneQuiz.update({
            where: { id: quiz.id },
            data: { durationSeconds: 1 },
          });
          clock = base + 10_000;
          const page = await getAvailableQuizAttempt(
            "penalaran-umum",
            quiz.slug,
            student.id,
            started.attempt.id,
          );
          assert.equal(page?.attempt.remainingTime, "—");
          assert.equal(page?.attempt.timeLimitStatus, "unknown");
          const historical = await prisma.standaloneQuizAttempt.findUniqueOrThrow({
            where: { id: started.attempt.id },
          });
          assert.equal(historical.status, "in_progress", "legacy timing is never guessed from current settings");
        }
        void item;
      } finally {
        await removeQuiz(quiz.id);
      }
    }
    console.log(
      "Quiz attempt-duration DB contracts passed for versioned and disabled-cutover starts.",
    );
  } finally {
    globalThis.Date = OriginalDate;
    if (previousCutover === undefined) delete process.env.KUIS_VERSIONING_CUTOVER;
    else process.env.KUIS_VERSIONING_CUTOVER = previousCutover;
  }
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
