import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import {
  getMentorStandaloneQuiz,
  getStandaloneQuizResult,
  saveStandaloneQuiz,
  saveStandaloneQuizAnswer,
  submitStandaloneQuiz,
  updateStandaloneQuizLifecycle,
  type SaveStandaloneQuizInput,
} from "@/lib/quiz/repository";
import { acquireEditLease, releaseEditLease } from "@/lib/resource-edit-lock/service";

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
      timer = setTimeout(() => reject(new Error("Quiz release race exceeded 10 seconds")), 10_000);
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
  const priorCutover = process.env.KUIS_VERSIONING_CUTOVER;
  process.env.KUIS_VERSIONING_CUTOVER = "enabled";
  globalThis.Date = FixedDate as unknown as DateConstructor;
  const quiz = await prisma.standaloneQuiz.create({ data: {
    slug: `pending-release-${randomUUID()}`, title: "Release fixture", subtestId: subtest.id,
    createdByUserId: tutor.id, status: "published", reviewTiming: "after_close", closesAt: date(60_000),
  } });
  const token = randomBytes(32).toString("base64url");
  let generation: number | undefined;
  try {
    async function pinned(versionNo: number, reviewTiming: "after_close" | "immediate" | "never", active = false) {
      const version = await prisma.standaloneQuizVersion.create({ data: {
        quizId: quiz.id, title: quiz.title, state: active ? "active" : "superseded", versionNo,
        reviewTiming, closesAt: date(60_000), durationSeconds: 900,
      } });
      const item = await prisma.standaloneQuizItem.create({ data: {
        quizId: quiz.id, quizVersionId: version.id, subtestId: subtest.id, sortOrder: 1,
        prompt: `Pertanyaan ${versionNo}`, explanation: "Pembahasan", questionType: "single_choice",
        options: { create: [
          { choiceKey: "A", content: "Benar", isCorrect: true, sortOrder: 0 },
          { choiceKey: "B", content: "Salah", isCorrect: false, sortOrder: 1 },
        ] },
      }, include: { options: true } });
      const policy = { attemptsAllowed: null, correctAnswerVisibility: "show", formBehavior: "same", retryDelaySeconds: null, reviewTiming, scorePolicy: "latest" };
      const participation = await prisma.standaloneQuizParticipation.create({ data: {
        quizId: quiz.id, quizVersionId: version.id, studentId: student.id, policySnapshot: policy,
      } });
      const formSnapshot = { version: 1, items: [{
        id: item.id, prompt: item.prompt, explanation: item.explanation,
        promptAssetId: null, explanationAssetId: null, sortOrder: 1, questionType: "single_choice",
        options: item.options.map(option => ({ id: option.id, choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect, sortOrder: option.sortOrder, assetId: null })),
      }] };
      return { version, item, policy, participation, formSnapshot };
    }
    const older = await pinned(1, "after_close");
    const current = await pinned(2, "after_close", true);
    const immediate = await pinned(3, "immediate");
    const never = await pinned(4, "never");
    async function attemptFor(pin = older, participationId = pin.participation.id) {
      const attemptNo = 1 + await prisma.standaloneQuizAttempt.count({ where: { participationId } });
      return prisma.standaloneQuizAttempt.create({ data: {
        participationId, attemptNo, policySnapshot: pin.policy, formSnapshot: pin.formSnapshot, formItemOrder: [pin.item.id],
      } });
    }
    async function submitCorrect(pin = older) {
      const attempt = await attemptFor(pin);
      await saveStandaloneQuizAnswer(attempt.id, pin.item.id, [pin.item.options.find(option => option.isCorrect)!.id], student.id);
      await submitStandaloneQuiz(attempt.id, student.id);
      return attempt;
    }
    const stored = (id: string) => prisma.standaloneQuizAttempt.findUniqueOrThrow({ where: { id } });
    const result = (id: string, offset: number, owner = student.id) => getStandaloneQuizResult(id, owner, subtest.code, quiz.slug, date(offset));
    const lease = await acquireEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutor.id, newToken: token });
    assert.equal(lease.state, "owned");
    generation = lease.generation!;
    async function inputFor(offset: number | null, reviewTiming: SaveStandaloneQuizInput["reviewTiming"] = "after_close") {
      const loaded = await getMentorStandaloneQuiz(quiz.id, tutor.id);
      assert.ok(loaded);
      return {
        id: quiz.id, title: quiz.title, description: "", subjectCode: subtest.code,
        opensAt: "", closesAt: offset === null ? "" : date(offset).toISOString(), reviewTiming,
        questions: loaded.questions, editLease: { generation: generation!, token },
        expectedDraftRevision: loaded.quiz.draftRevision,
      } satisfies SaveStandaloneQuizInput;
    }
    const save = async (offset: number | null, policy: SaveStandaloneQuizInput["reviewTiming"] = "after_close") => saveStandaloneQuiz(await inputFor(offset, policy), tutor.id);

    const pendingOld = await submitCorrect(older);
    const pendingCurrent = await submitCorrect(current);
    const activeParticipation = await prisma.standaloneQuizParticipation.create({ data: {
      quizId: quiz.id, quizVersionId: older.version.id, studentId: other.id, policySnapshot: older.policy,
    } });
    const active = await attemptFor(older, activeParticipation.id);
    const activeBefore = await stored(active.id);
    await save(90_000);
    for (const id of [pendingOld.id, pendingCurrent.id]) {
      assert.equal((await stored(id)).releaseAt?.toISOString(), date(90_000).toISOString(), "Every pinned pending release follows the stable close");
      assert.equal((await result(id, 60_000))?.attemptScore, null, "The old close cannot disclose the score");
      assert.equal((await result(id, 89_999))?.reviewAvailable, false);
    }
    assert.deepEqual(await stored(active.id), activeBefore, "Moving close preserves another learner's active form, policy, start time and state");
    assert.equal((await result(pendingOld.id, 90_000))?.attemptScore, 100, "Exact equality releases the old version");
    assert.equal((await result(pendingCurrent.id, 90_000))?.attemptScore, 100, "Exact equality releases the current version");
    const releasedBefore = await stored(pendingOld.id);
    await save(100_000);
    await save(100_000);
    assert.deepEqual(await stored(pendingOld.id), releasedBefore, "Repeated extensions leave released rows unchanged");
    assert.equal((await result(pendingOld.id, 0))?.reviewAvailable, true, "Released review remains available after extension");
    const shorten = await submitCorrect();
    await save(30_000);
    assert.equal((await stored(shorten.id)).releaseAt?.toISOString(), date(30_000).toISOString());
    assert.equal((await result(shorten.id, 29_999))?.released, false);
    assert.equal((await result(shorten.id, 30_000))?.released, true);
    const due = await submitCorrect();
    await save(0);
    assert.equal((await stored(due.id)).releaseState, "released", "Saving a due close releases valid pending scores atomically");
    assert.equal((await result(due.id, 0))?.reviewAvailable, true);
    await save(90_000);

    const instant = await submitCorrect(immediate);
    const hidden = await submitCorrect(never);
    const malformed = await submitCorrect();
    await prisma.standaloneQuizAttempt.update({ where: { id: malformed.id }, data: { score: null } });
    const reviewRequired = await attemptFor();
    await prisma.standaloneQuizAttempt.update({ where: { id: reviewRequired.id }, data: { formSnapshot: { version: 1, items: [{}] } } });
    assert.equal((await submitStandaloneQuiz(reviewRequired.id, student.id)).state, "review_required");
    const hiddenAfterClose = await submitCorrect();
    await prisma.standaloneQuizAttempt.update({ where: { id: hiddenAfterClose.id }, data: { releaseState: "hidden" } });
    // Corrupt legacy scheduled policies must not gain a release via synchronization.
    await prisma.standaloneQuizAttempt.updateMany({ where: { id: { in: [instant.id, hidden.id] } }, data: { releaseState: "scheduled", releaseAt: date(60_000) } });
    const excludedIds = [instant.id, hidden.id, malformed.id, reviewRequired.id, hiddenAfterClose.id];
    const excludedBefore = await Promise.all(excludedIds.map(stored));
    await save(0);
    for (const id of excludedIds) assert.equal((await result(id, 90_000))?.released, false);
    assert.deepEqual(await Promise.all(excludedIds.map(stored)), excludedBefore, "Policy and scoring exclusions remain untouched");
    assert.equal((await result(due.id, 0, other.id)), null, "Another learner cannot read or synchronize this result");
    await assert.rejects(submitStandaloneQuiz(active.id, student.id), "Another learner cannot submit active work");
    await assert.rejects(saveStandaloneQuizAnswer(active.id, older.item.id, [], student.id), "Another learner cannot write active work");
    await assert.rejects(saveStandaloneQuiz({ ...await inputFor(90_000), editLease: undefined }, tutor.id), "Authoring still requires its lease");
    await assert.rejects(saveStandaloneQuiz(await inputFor(90_000), student.id), "Authoring still checks ownership");

    // Separate active-only and pending-only close removal, even after editing
    // the draft to immediate. Ineligible scoring rows still await review.
    await prisma.standaloneQuizAttempt.updateMany({ where: { id: { in: [malformed.id, reviewRequired.id, hiddenAfterClose.id] } }, data: { policySnapshot: never.policy } });
    await save(90_000, "immediate");
    const scheduleBefore = await prisma.standaloneQuiz.findUniqueOrThrow({ where: { id: quiz.id } });
    const pendingBefore = await prisma.standaloneQuizAttempt.findMany({ where: { participation: { quizId: quiz.id } }, orderBy: { id: "asc" } });
    await assert.rejects(save(null, "immediate"), /Waktu tutup masih diperlukan/, "Older active policy prevents undefined release timing");
    assert.deepEqual(await prisma.standaloneQuiz.findUniqueOrThrow({ where: { id: quiz.id } }), scheduleBefore);
    assert.deepEqual(await prisma.standaloneQuizAttempt.findMany({ where: { participation: { quizId: quiz.id } }, orderBy: { id: "asc" } }), pendingBefore);
    await saveStandaloneQuizAnswer(active.id, older.item.id, [older.item.options[0].id], other.id);
    await submitStandaloneQuiz(active.id, other.id);
    await assert.rejects(save(null, "never"), /Waktu tutup masih diperlukan/, "An older pending result alone prevents close removal");
    await save(0, "immediate");
    assert.equal((await stored(active.id)).releaseState, "released");
    const immediateActive = await attemptFor(immediate);
    await save(null, "immediate");
    assert.equal((await stored(immediateActive.id)).status, "in_progress", "Immediate work does not require a close");
    await submitStandaloneQuiz(immediateActive.id, student.id);
    await save(90_000);

    // Hold the aggregate in PostgreSQL, then observe both real callers waiting
    // before releasing it. FIFO acquisition forces a save-before-read order.
    clock = base;
    await save(30_000);
    const orderedPending = await submitCorrect();
    const orderedInput = await inputFor(90_000);
    let unlock!: () => void;
    let locked!: (pid: number) => void;
    const barrier = new Promise<void>(resolve => { unlock = resolve; });
    const ready = new Promise<number>(resolve => { locked = resolve; });
    const holder = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quiz.id}::uuid FOR UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      locked(row.pid);
      await barrier;
    }, { timeout: 10_000 });
    const holderPid = await ready;
    async function waitForBlockedQuizCaller(minimum: number) {
      for (let tries = 0; tries < 100; tries++) {
        const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
          WITH RECURSIVE blocked(pid) AS (
            SELECT pid FROM pg_stat_activity WHERE ${holderPid} = ANY(pg_blocking_pids(pid))
            UNION
            SELECT activity.pid FROM pg_stat_activity activity
              JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
          )
          SELECT count(DISTINCT activity.pid)::int AS count FROM pg_stat_activity activity
            JOIN blocked ON blocked.pid = activity.pid
          WHERE activity.wait_event_type = 'Lock'
            AND activity.query LIKE '%FROM standalone_quizzes%FOR %'`;
        if (row.count >= minimum) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error("Expected quiz caller did not reach the database lock barrier");
    }
    clock = base + 30_000;
    const orderedSave = saveStandaloneQuiz(orderedInput, tutor.id);
    let orderedRead: ReturnType<typeof result> | undefined;
    try {
      await waitForBlockedQuizCaller(1);
      orderedRead = result(orderedPending.id, 30_000);
      await waitForBlockedQuizCaller(2);
      unlock();
      const [, readAfterSave] = await bounded(Promise.all([orderedSave, orderedRead, holder]));
      assert.equal(readAfterSave?.attemptScore, null, "A read queued behind extension cannot disclose against the stale due close");
      assert.equal((await stored(orderedPending.id)).releaseAt?.toISOString(), date(90_000).toISOString());
    } finally {
      unlock();
      await Promise.allSettled([holder, orderedSave, orderedRead]);
    }

    // Race both directions repeatedly. A result may legally release before an
    // extension; every result that remains pending must use the final close.
    for (let index = 0; index < 4; index++) {
      clock = base;
      await save(30_000);
      const racePending = await submitCorrect();
      const raceActive = await attemptFor(current);
      const input = await inputFor(90_000);
      clock = base + 30_000;
      const edit = () => saveStandaloneQuiz(input, tutor.id);
      const read = () => result(racePending.id, 30_000);
      const submit = () => submitStandaloneQuiz(raceActive.id, student.id);
      await bounded<unknown>(index % 2 ? Promise.all([read(), submit(), edit()]) : Promise.all([edit(), submit(), read()]));
      const finalQuiz = await prisma.standaloneQuiz.findUniqueOrThrow({ where: { id: quiz.id } });
      assert.equal(finalQuiz.closesAt?.toISOString(), date(90_000).toISOString());
      for (const id of [racePending.id, raceActive.id]) {
        const row = await stored(id);
        assert.equal(row.scoringState, "scored");
        assert.ok(["scheduled", "released"].includes(row.releaseState));
        if (row.releaseState === "scheduled") assert.equal(row.releaseAt?.toISOString(), date(90_000).toISOString(), "Raced pending state agrees with final committed close");
      }
      console.log(`Race ${index + 1}: read=${(await stored(racePending.id)).releaseState}, submit=${(await stored(raceActive.id)).releaseState}`);
    }
    clock = base;
    await save(0);
    // One learner waiting on its own attempt must not block another learner's
    // autosave. The runtime quiz SHARE locks remain mutually compatible.
    const parallelA = await attemptFor();
    const parallelB = await attemptFor(older, activeParticipation.id);
    let releaseAttempt!: () => void;
    let attemptLocked!: (pid: number) => void;
    const attemptBarrier = new Promise<void>(resolve => { releaseAttempt = resolve; });
    const attemptReady = new Promise<number>(resolve => { attemptLocked = resolve; });
    const attemptHolder = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${parallelA.id}::uuid FOR UPDATE`;
      const [row] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      attemptLocked(row.pid);
      await attemptBarrier;
    }, { timeout: 10_000 });
    const attemptHolderPid = await attemptReady;
    const waitingAnswer = saveStandaloneQuizAnswer(parallelA.id, older.item.id, [older.item.options[0].id], student.id);
    try {
      let observed = false;
      for (let tries = 0; tries < 100; tries++) {
        const [row] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${attemptHolderPid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        if (row.blocked) { observed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(observed, "First learner reached its attempt lock");
      await bounded(saveStandaloneQuizAnswer(parallelB.id, older.item.id, [older.item.options[0].id], other.id));
      releaseAttempt();
      await bounded(Promise.all([waitingAnswer, attemptHolder]));
    } finally {
      releaseAttempt();
      await Promise.allSettled([waitingAnswer, attemptHolder]);
    }
    await submitStandaloneQuiz(parallelA.id, student.id);
    await submitStandaloneQuiz(parallelB.id, other.id);
    const afterClose = await attemptFor();
    const frozenBefore = await stored(afterClose.id);
    await save(-1_000);
    assert.deepEqual(await stored(afterClose.id), frozenBefore, "Shortening a past close does not expire active work");
    await updateStandaloneQuizLifecycle(quiz.id, tutor.id, { generation, token });
    await saveStandaloneQuizAnswer(afterClose.id, older.item.id, [older.item.options[0].id], student.id);
    await saveStandaloneQuizAnswer(afterClose.id, older.item.id, [], student.id);
    await saveStandaloneQuizAnswer(afterClose.id, older.item.id, [older.item.options[0].id], student.id);
    assert.equal((await submitStandaloneQuiz(afterClose.id, student.id)).releaseState, "released", "Submission after close/archive releases by the current close without a tutor lease");
    assert.equal((await result(afterClose.id, 0))?.attemptScore, 100);
    await prisma.standaloneQuiz.update({ where: { id: quiz.id }, data: { status: "published" } });
    process.env.KUIS_VERSIONING_CUTOVER = "disabled";
    await assert.rejects(save(90_000), /sudah dimulai siswa/, "Disabled cutover retains its participation editing restriction");
    console.log("Quiz pending release DB contracts passed: pinned versions, boundaries, exclusions, atomic guards, active preservation, ownership and races.");
  } finally {
    if (generation !== undefined) await releaseEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutor.id, generation, token });
    await prisma.editLease.deleteMany({ where: { resourceType: "quiz", resourceId: quiz.id } });
    await prisma.standaloneQuizStartCommand.deleteMany({ where: { quizId: quiz.id } });
    await prisma.standaloneQuizParticipation.deleteMany({ where: { quizId: quiz.id } });
    await prisma.standaloneQuizItem.deleteMany({ where: { quizId: quiz.id } });
    await prisma.standaloneQuizVersion.updateMany({ where: { quizId: quiz.id }, data: { baseVersionId: null } });
    await prisma.standaloneQuizVersion.deleteMany({ where: { quizId: quiz.id } });
    await prisma.standaloneQuiz.delete({ where: { id: quiz.id } });
    globalThis.Date = OriginalDate;
    if (priorCutover === undefined) delete process.env.KUIS_VERSIONING_CUTOVER;
    else process.env.KUIS_VERSIONING_CUTOVER = priorCutover;
  }
}

run().finally(() => prisma.$disconnect());
