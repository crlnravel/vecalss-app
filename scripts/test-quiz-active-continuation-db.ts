import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { manageMentorDashboardQuiz } from "@/lib/quiz/mentor-dashboard-repository";
import {
  getAvailableStandaloneQuiz, getStandaloneQuizResult, saveStandaloneQuizAnswer,
  startStandaloneQuiz, submitStandaloneQuiz, updateStandaloneQuizLifecycle,
} from "@/lib/quiz/repository";
import { acquireEditLease, releaseEditLease } from "@/lib/resource-edit-lock/service";
import { getQuizSubjectByCode } from "@/modules/quiz/data";
import { getAvailableQuizAttempt, getAvailableQuizPreview } from "@/modules/quiz/server-data";

const OriginalDate = Date;
const base = Math.floor(OriginalDate.now() / 1000) * 1000;
let clock = base;
const date = (offset: number) => new OriginalDate(base + offset);
const FixedDate = class extends OriginalDate {
  constructor(...args: never[]) { super(args.length ? args[0] : clock); }
  static now() { return clock; }
};

async function bounded<T>(work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Continuation race exceeded 10 seconds")), 10_000);
    })]);
  } finally { clearTimeout(timer); }
}

async function run() {
  const target = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Use a local disposable fixture database");
  const tutor = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" } });
  const other = await prisma.user.findUniqueOrThrow({ where: { email: "dimas@vecalss.local" } });
  const subtest = await prisma.subtest.findFirstOrThrow({ where: { code: "PU" } });
  const subjectSlug = getQuizSubjectByCode(subtest.code)!.slug;
  const priorCutover = process.env.KUIS_VERSIONING_CUTOVER;
  globalThis.Date = FixedDate as unknown as DateConstructor;

  async function fixture(cutover = "enabled", reviewTiming: "after_close" | "never" = "after_close") {
    process.env.KUIS_VERSIONING_CUTOVER = cutover;
    clock = base;
    const quiz = await prisma.standaloneQuiz.create({ data: {
      slug: `active-continuation-${randomUUID()}`, title: "Continuation fixture",
      subtestId: subtest.id, createdByUserId: tutor.id, closesAt: date(60_000),
      attemptsAllowed: 2, retryDelaySeconds: 3600, reviewTiming,
    } });
    const version = cutover === "enabled" ? await prisma.standaloneQuizVersion.create({ data: {
      quizId: quiz.id, title: quiz.title, state: "active", versionNo: 1,
      attemptsAllowed: 2, retryDelaySeconds: 3600, reviewTiming, durationSeconds: 900,
    } }) : null;
    const item = await prisma.standaloneQuizItem.create({ data: {
      quizId: quiz.id, quizVersionId: version?.id, subtestId: subtest.id, sortOrder: 1,
      prompt: "Pertanyaan awal", explanation: "Pembahasan awal", questionType: "single_choice",
      options: { create: [
        { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
        { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
      ] },
    }, include: { options: { orderBy: { sortOrder: "asc" } } } });
    const requestId = randomUUID();
    const started = await startStandaloneQuiz(subtest.code, quiz.slug, student.id, date(0), requestId);
    assert.ok(started);
    const id = started.attempt.id;
    const correct = item.options[0].id;
    const wrong = item.options[1].id;
    const stored = () => prisma.standaloneQuizAttempt.findUniqueOrThrow({ where: { id }, include: { answers: true } });
    const start = (owner = student.id, key = randomUUID()) => startStandaloneQuiz(subtest.code, quiz.slug, owner, undefined, key);
    const load = (key?: string, owner = student.id) => getAvailableQuizAttempt(subjectSlug, quiz.slug, owner, key);
    const answer = (selection: string[]) => saveStandaloneQuizAnswer(id, item.id, selection, student.id);
    const result = () => getStandaloneQuizResult(id, student.id, subtest.code, quiz.slug);
    await answer([correct]);
    const before = await stored();
    // Historical cap/retry constraints cannot invalidate already-active work.
    const previous = await prisma.standaloneQuizAttempt.create({ data: {
      participationId: started.attempt.participationId, attemptNo: 3, status: "submitted",
      submittedAt: date(0), policySnapshot: started.attempt.policySnapshot!,
      formSnapshot: started.attempt.formSnapshot!, formItemOrder: started.attempt.formItemOrder!,
    } });
    await prisma.standaloneQuizAttempt.create({ data: {
      participationId: started.attempt.participationId, attemptNo: 4, status: "submitted",
      submittedAt: date(0), policySnapshot: started.attempt.policySnapshot!,
      formSnapshot: started.attempt.formSnapshot!, formItemOrder: started.attempt.formItemOrder!,
    } });
    const draft = version ? await prisma.standaloneQuizVersion.create({ data: {
      quizId: quiz.id, title: "Pending changed assessment", state: "draft", baseVersionId: version.id,
      attemptsAllowed: 5, reviewTiming: "immediate", draftRevision: 1,
    } }) : null;
    if (draft) await prisma.standaloneQuizItem.create({ data: {
      quizId: quiz.id, quizVersionId: draft.id, subtestId: subtest.id, sortOrder: 1,
      prompt: "Pertanyaan draft berbeda", questionType: "single_choice", options: { create: [
        { choiceKey: "A", content: "Baru benar", isCorrect: true, sortOrder: 0 },
        { choiceKey: "B", content: "Baru salah", isCorrect: false, sortOrder: 1 },
      ] },
    } });
    async function archiveDetail() {
      const token = randomBytes(32).toString("base64url");
      const lease = await acquireEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutor.id, newToken: token });
      assert.equal(lease.state, "owned");
      try {
        return await updateStandaloneQuizLifecycle(quiz.id, tutor.id, { generation: lease.generation!, token });
      } finally {
        await releaseEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutor.id, generation: lease.generation!, token });
      }
    }
    async function assertContinuation() {
      const freshKey = randomUUID();
      const resumed = await start(student.id, freshKey);
      assert.equal(resumed?.state, "resumed");
      assert.equal(resumed?.attempt.id, id);
      assert.equal(resumed?.attempt.attemptNo, 1);
      for (const field of ["formSnapshot", "formItemOrder", "policySnapshot", "answers"] as const) assert.deepEqual(resumed?.attempt[field], before[field]);
      assert.equal(resumed?.attempt.createdAt.toISOString(), before.createdAt.toISOString());
      assert.equal((await start(student.id, requestId))?.state, "replayed");
      assert.equal((await start(student.id, freshKey))?.attempt.id, id);
      assert.equal(await prisma.standaloneQuizStartCommand.count({ where: { attemptId: id } }), 2, "Distinct accepted request keys share one attempt");
      const recovered = await load();
      assert.equal(recovered?.attemptId, id, "No-ID route recovers owned active work before preview filtering");
      assert.equal((await load(id))?.attemptId, id);
      assert.deepEqual(recovered?.attempt.questions[0].selectedOptionKeys, [correct]);
      assert.equal(recovered?.attempt.isSubmitted, false);
      assert.equal("correct" in recovered!.attempt.questions[0].options[0], false, "Continuation never leaks answer keys");
      for (const invalid of ["", "malformed", randomUUID()]) assert.equal(await load(invalid), null, "Explicit invalid IDs fail closed");
      assert.equal(await load(id, other.id), null);
      assert.equal(await load(undefined, other.id), null);
      await assert.rejects(saveStandaloneQuizAnswer(id, item.id, [], other.id));
      await assert.rejects(submitStandaloneQuiz(id, other.id));
      assert.equal(await result(), null, "Active work cannot disclose results");
      const oldResult = await getStandaloneQuizResult(previous.id, student.id, subtest.code, quiz.slug);
      assert.equal(oldResult?.canRestart, true, "Results afford continuation despite cap/close/archive");
      assert.equal(oldResult?.resumeAttemptId, id);
      if (draft) assert.equal((await prisma.standaloneQuizVersion.findUniqueOrThrow({ where: { id: draft.id } })).state, "draft", "Resume never activates a pending assessment");
      assert.equal(await prisma.standaloneQuizAttempt.count({ where: { participation: { quizId: quiz.id } } }), 3);
      await answer([wrong]);
      assert.deepEqual((await load())?.attempt.questions[0].selectedOptionKeys, [wrong]);
      await answer([]);
      assert.equal((await stored()).answers.length, 0);
      await answer([correct]);
      assert.equal((await submitStandaloneQuiz(id, student.id)).state, "submitted");
      assert.equal((await stored()).status, "submitted");
      assert.deepEqual((await stored()).formSnapshot, before.formSnapshot);
      const disclosed = await result();
      assert.equal(disclosed?.attemptScore, reviewTiming === "never" || clock < base + 60_000 ? null : 100);
      assert.equal(disclosed?.canRestart, false, "Terminal retry cannot bypass unavailable/exhausted admission");
      assert.equal((await load(id))?.attempt.isSubmitted, true);
      assert.equal(await load(), null, "No-ID recovery never reopens terminal work");
      await assert.rejects(answer([wrong]), /sudah dikirim/);
      assert.equal((await start(student.id, freshKey))?.attempt.status, "submitted", "Resume replay re-reads terminal state");
      assert.equal((await start(student.id, requestId))?.attempt.id, id);
    }
    async function cleanup() {
      await prisma.editLease.deleteMany({ where: { resourceType: "quiz", resourceId: quiz.id } });
      await prisma.standaloneQuizStartCommand.deleteMany({ where: { quizId: quiz.id } });
      await prisma.standaloneQuizParticipation.deleteMany({ where: { quizId: quiz.id } });
      await prisma.standaloneQuizItem.deleteMany({ where: { quizId: quiz.id } });
      await prisma.standaloneQuizVersion.updateMany({ where: { quizId: quiz.id }, data: { baseVersionId: null } });
      await prisma.standaloneQuizVersion.deleteMany({ where: { quizId: quiz.id } });
      await prisma.standaloneQuiz.delete({ where: { id: quiz.id } });
    }
    return { quiz, id, item, correct, wrong, before, stored, start, load, answer, result, archiveDetail, assertContinuation, cleanup, requestId };
  }

  try {
    for (const cutover of ["enabled", "disabled"]) {
      for (const boundary of [59_999, 60_000, 60_001]) {
        const f = await fixture(cutover);
        try {
          clock = base + boundary;
          await f.assertContinuation();
          if (boundary >= 60_000) {
            assert.equal(await getAvailableStandaloneQuiz(subtest.code, f.quiz.slug), null);
            assert.equal(await getAvailableQuizPreview(subjectSlug, f.quiz.slug, other.id), null);
            await assert.rejects(f.start(other.id), /ditutup/);
          }
          if (boundary >= 60_000) await assert.rejects(f.start(), /ditutup/);
          // At -1 ms, a genuinely new Start may activate the valid newer draft.
          console.log(`${cutover}: close ${boundary - 60_000} ms passed`);
        } finally { await f.cleanup(); }
      }
      for (const path of ["detail", "dashboard", "hidden", "opening"] as const) {
        const f = await fixture(cutover);
        try {
          if (path === "detail") await f.archiveDetail();
          if (path === "dashboard") await manageMentorDashboardQuiz(tutor.id, f.quiz.id, "archive");
          if (path === "hidden") await manageMentorDashboardQuiz(tutor.id, f.quiz.id, "hide");
          if (path === "opening") await prisma.standaloneQuiz.update({ where: { id: f.quiz.id }, data: { opensAt: date(30_000) } });
          assert.deepEqual(await f.stored(), f.before, `${path} preserves active state and answers`);
          assert.equal(await getAvailableQuizPreview(subjectSlug, f.quiz.slug, other.id), null);
          await assert.rejects(f.start(other.id));
          await f.assertContinuation();
          await assert.rejects(f.start());
          console.log(`${cutover}: ${path} passed`);
        } finally { await f.cleanup(); }
      }
    }
    const hiddenResult = await fixture("enabled", "never");
    try {
      clock = base + 60_000;
      await hiddenResult.archiveDetail();
      await hiddenResult.assertContinuation();
      assert.equal((await hiddenResult.result())?.reviewAvailable, false);
    } finally { await hiddenResult.cleanup(); }

    const newer = await fixture();
    try {
      await prisma.standaloneQuizVersion.updateMany({ where: { quizId: newer.quiz.id, state: "active" }, data: { state: "superseded" } });
      await prisma.standaloneQuizVersion.updateMany({ where: { quizId: newer.quiz.id, state: "draft" }, data: { state: "active", versionNo: 2, draftRevision: null } });
      const resumed = await newer.start();
      assert.equal(resumed?.attempt.id, newer.id);
      assert.equal(resumed?.quiz.items[0].prompt, "Pertanyaan awal", "A newer active release cannot replace the pinned form");
      assert.deepEqual(resumed?.attempt.formSnapshot, newer.before.formSnapshot);
      assert.equal((await newer.load())?.attempt.questions[0].prompt, "Pertanyaan awal");
    } finally { await newer.cleanup(); }

    const racingStarts = await fixture();
    try {
      clock = base + 60_000;
      const keyA = randomUUID();
      const keyB = randomUUID();
      const starts = await bounded(Promise.all([
        racingStarts.start(student.id, keyA), racingStarts.start(student.id, keyB), racingStarts.start(student.id, keyA),
      ]));
      assert.ok(starts.every(start => start?.attempt.id === racingStarts.id));
      assert.equal(await prisma.standaloneQuizStartCommand.count({ where: { attemptId: racingStarts.id } }), 3);
      assert.equal(await prisma.standaloneQuizAttempt.count({ where: { participation: { quizId: racingStarts.quiz.id } } }), 3);
      await submitStandaloneQuiz(racingStarts.id, student.id);
      assert.equal((await racingStarts.start(student.id, keyA))?.attempt.status, "submitted");
      assert.equal((await racingStarts.start(student.id, keyB))?.attempt.status, "submitted");
    } finally { await racingStarts.cleanup(); }

    const admission = await fixture();
    try {
      await prisma.standaloneQuizItem.deleteMany({ where: { quizId: admission.quiz.id, quizVersion: { state: "draft" } } });
      await prisma.standaloneQuizVersion.deleteMany({ where: { quizId: admission.quiz.id, state: "draft" } });
      await submitStandaloneQuiz(admission.id, student.id);
      await assert.rejects(admission.start(), /Batas percobaan/);
      await prisma.standaloneQuizAttempt.deleteMany({ where: { participation: { quizId: admission.quiz.id }, attemptNo: { gt: 1 } } });
      await assert.rejects(admission.start(), /Percobaan berikutnya/);
      clock = base + 3_600_000;
      await prisma.standaloneQuiz.update({ where: { id: admission.quiz.id }, data: { closesAt: date(7_200_000) } });
      const next = await admission.start();
      assert.equal(next?.state, "started");
      assert.equal(next?.attempt.attemptNo, 2);
      assert.notEqual(next?.attempt.id, admission.id);
    } finally { await admission.cleanup(); }

    for (const path of ["detail", "dashboard"] as const) {
      const submittingArchive = await fixture();
      try {
        clock = base + 60_000;
        await bounded(Promise.all([
          path === "detail" ? submittingArchive.archiveDetail() : manageMentorDashboardQuiz(tutor.id, submittingArchive.quiz.id, "archive"),
          submitStandaloneQuiz(submittingArchive.id, student.id),
        ]));
        assert.equal((await submittingArchive.stored()).status, "submitted");
        assert.equal((await submittingArchive.result())?.attemptScore, 100);
        assert.equal((await prisma.standaloneQuiz.findUniqueOrThrow({ where: { id: submittingArchive.quiz.id } })).status, "archived");
      } finally { await submittingArchive.cleanup(); }
      const f = await fixture();
      try {
        clock = base + 60_000;
        const archive = () => path === "detail" ? f.archiveDetail() : manageMentorDashboardQuiz(tutor.id, f.quiz.id, "archive");
        await bounded(Promise.all([archive(), f.answer([f.wrong])]));
        assert.deepEqual((await f.load())?.attempt.questions[0].selectedOptionKeys, [f.wrong], "Archive never loses a successful save");
        await assert.rejects(f.start(other.id));
        const resumeKey = randomUUID();
        const outcomes = await bounded(Promise.allSettled([f.start(student.id, resumeKey), f.answer([f.correct]), submitStandaloneQuiz(f.id, student.id)]));
        assert.equal(outcomes[2].status, "fulfilled");
        const row = await f.stored();
        assert.equal(row.status, "submitted");
        assert.equal(row.answers[0].selectedOptionId, outcomes[1].status === "fulfilled" ? f.correct : f.wrong);
        if (outcomes[1].status === "rejected") assert.match(String(outcomes[1].reason), /sudah dikirim/);
        if (outcomes[0].status === "rejected") assert.match(String(outcomes[0].reason), /ditutup/);
        if (outcomes[0].status === "fulfilled") {
          assert.equal(outcomes[0].value?.attempt.id, f.id);
          assert.equal((await f.start(student.id, resumeKey))?.attempt.status, "submitted");
        }
        assert.equal(await prisma.standaloneQuizAttempt.count({ where: { participation: { quizId: f.quiz.id } } }), 3);
        assert.deepEqual(row.formSnapshot, f.before.formSnapshot);
        console.log(`${path}: archive/save and resume/save/submit races passed`);
      } finally { await f.cleanup(); }
    }

    const ordered = await fixture();
    let unlock!: () => void;
    let ready!: (pid: number) => void;
    const barrier = new Promise<void>(resolve => { unlock = resolve; });
    const locked = new Promise<number>(resolve => { ready = resolve; });
    const holder = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${ordered.quiz.id}::uuid FOR UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      ready(row.pid);
      await barrier;
    }, { timeout: 10_000 });
    const pid = await locked;
    const submitting = submitStandaloneQuiz(ordered.id, student.id);
    let replaying: ReturnType<typeof ordered.start> | undefined;
    async function waitForBlocked(minimum: number) {
      for (let tries = 0; tries < 100; tries++) {
        const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
          WITH RECURSIVE blocked(pid) AS (
            SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))
            UNION SELECT activity.pid FROM pg_stat_activity activity JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
          ) SELECT count(DISTINCT pid)::int AS count FROM blocked`;
        if (row.count >= minimum) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error("Expected runtime callers did not reach the aggregate barrier");
    }
    try {
      await waitForBlocked(1);
      replaying = ordered.start(student.id, ordered.requestId);
      await waitForBlocked(2);
      unlock();
      const [, replay] = await bounded(Promise.all([submitting, replaying, holder]));
      assert.equal(replay?.attempt.status, "submitted", "Replay queued behind submit cannot present editable work");
    } finally {
      unlock();
      await Promise.allSettled([holder, submitting, replaying]);
      await ordered.cleanup();
    }
    // Supplemental route wiring assertion after real loader ownership tests.
    const route = readFileSync(new URL("../app/quiz/[slug]/[quizSlug]/page.tsx", import.meta.url), "utf8");
    assert.match(route, /if \(searchParams\.attemptId !== undefined\) notFound\(\)/);
    console.log("Quiz active continuation DB contracts passed: boundaries, archives, route recovery, pins, ownership, admission, disclosure, replay and races.");
  } finally {
    globalThis.Date = OriginalDate;
    if (priorCutover === undefined) delete process.env.KUIS_VERSIONING_CUTOVER;
    else process.env.KUIS_VERSIONING_CUTOVER = priorCutover;
  }
}

run().finally(() => prisma.$disconnect());
