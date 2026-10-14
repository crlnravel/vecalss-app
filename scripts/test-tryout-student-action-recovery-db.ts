import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { prisma } from "../lib/prisma";
import { registerForTryout, TryoutDeliveryValidationError } from "../lib/tryout/delivery-repository";
import { startTryoutAttempt, TryoutAttemptValidationError } from "../lib/tryout/attempt-repository";
import { acquireTryoutIdentityMutex } from "../lib/tryout/locks";
import { participantActionRecoveryState } from "../lib/tryout/participant-recovery-repository";
import { createParticipantActionRecovery, type ParticipantActionIntent, type ParticipantActionWriteReply } from "../lib/tryout/participant-action-recovery";
import { createF12Fixture } from "./tryout-f12-fixture";
import { requireTa02LocalDatabase } from "./tryout-ta02-fixture";

const NativeDate = Date;
function at(instant: number) {
  globalThis.Date = class extends NativeDate {
    constructor(value?: string | number | Date) { super(value === undefined ? instant : value instanceof NativeDate ? value.getTime() : value); }
    static now() { return instant; }
  } as DateConstructor;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
const evidence: unknown[] = [];
let fixtureNumber = 0;
const base = NativeDate.now() + (200 + randomInt(100)) * 86_400_000;
async function fixture(mode: "open" | "approval_required" | "invitation_only" = "open") {
  globalThis.Date = NativeDate;
  return createF12Fixture(mode, "kevin@vecalss.local", new NativeDate(base + fixtureNumber++ * 2 * 86_400_000));
}
async function holdIdentity(tryoutId: string) {
  const ready = deferred<void>();
  const release = deferred<void>();
  const task = prisma.$transaction(async (tx) => {
    assert(await acquireTryoutIdentityMutex(tx, { kind: "tryout", id: tryoutId }));
    ready.resolve();
    await release.promise;
  }, { timeout: 20_000 });
  await ready.promise;
  return { release: () => release.resolve(), task };
}

try {
  requireTa02LocalDatabase();
  const student = await prisma.user.findUniqueOrThrow({ where: { email: "kevin@vecalss.local" }, select: { id: true, studentProfile: { select: { targetMajorId: true, targetUniversityId: true } } } });
  const targetMajor = await prisma.major.findFirstOrThrow({ where: { isActive: true }, select: { id: true, universityId: true } });
  const target = { majorId: targetMajor.id, universityId: targetMajor.universityId };
  try {
    for (const kind of ["register", "start"] as const) {
      const f = await fixture();
      assert.equal(await prisma.tryoutAttempt.count({ where: { studentId: f.studentId, status: "in_progress", deliverySession: { availableFrom: { lt: f.session.availableUntil }, availableUntil: { gt: f.session.availableFrom } } } }), 0, "isolated test window has no peer attempt");
      at(f.session.availableFrom.getTime() + 1_000);
      if (kind === "start") await registerForTryout(f.tryoutId, f.studentId, target, f.sessionId);
      const auditBefore = await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: f.tryoutId } });
      const intent: ParticipantActionIntent = kind === "register" ? { kind, tryoutId: f.tryoutId, sessionId: f.sessionId, target } : { kind, tryoutId: f.tryoutId, sessionId: f.sessionId };
      const gate = await holdIdentity(f.tryoutId);
      const firstDispatched = deferred<void>();
      const replayDispatched = deferred<void>();
      const results: Array<Promise<ParticipantActionWriteReply>> = [];
      let dispatches = 0;
      const command = async (): Promise<ParticipantActionWriteReply> => {
        if (kind === "register") {
          const result = await registerForTryout(f.tryoutId, f.studentId, target, f.sessionId);
          assert(result.deliverySessionId);
          return { ok: true, destination: { kind: "waiting", sessionId: result.deliverySessionId } };
        }
        const result = await startTryoutAttempt(f.sessionId, f.studentId);
        return { ok: true, destination: { kind: "attempt", attemptId: result.attemptId, sessionId: f.sessionId, result: false } };
      };
      const controller = createParticipantActionRecovery({
        write: async () => {
          const originalServerWork = command();
          results.push(originalServerWork);
          if (++dispatches === 1) { firstDispatched.resolve(); throw new Error("client transport rejected; public server command remains alive behind mutex"); }
          replayDispatched.resolve();
          return originalServerWork;
        },
        read: async (request) => ({ ok: true, snapshot: await participantActionRecoveryState(request, f.studentId) }),
      });
      try {
        await controller.submit(intent);
        await firstDispatched.promise;
        const absent = await controller.inspect();
        assert(absent?.canRetry);
        assert.equal(absent.destination, null, "original server work has not committed at the recovery read");
        assert.equal(controller.getSnapshot().phase, "retry");
        const retry = controller.retry();
        await replayDispatched.promise;
        gate.release();
        await gate.task;
        const [original, replay] = await Promise.all(results);
        assert.deepEqual(original, replay, "actual concurrent public commands converge on the same receipt");
        assert.deepEqual(await retry, replay.ok ? replay.destination : null);
        const snapshot = await participantActionRecoveryState(intent, f.studentId);
        assert.equal(await prisma.tryoutAdmission.count({ where: { tryoutId: f.tryoutId, studentId: f.studentId } }), 1);
        assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { deliverySessionId: f.sessionId, admission: { studentId: f.studentId } } }), 1);
        assert.equal(await prisma.tryoutAttempt.count({ where: { deliverySessionId: f.sessionId, studentId: f.studentId } }), kind === "start" ? 1 : 0);
        assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { tryoutId: f.tryoutId } }), auditBefore, "replay adds no session audit");
        assert(snapshot.assignment && snapshot.admission);
        assert.equal(snapshot.assignment.sessionId, f.sessionId);
        if (kind === "start") {
          assert(snapshot.attempt);
          assert.equal(snapshot.attempt.serverDeadlineAt, f.session.availableUntil.toISOString());
          assert.equal(snapshot.attempt.assessmentReleaseId, f.session.assessmentReleaseId);
          const originalReceipt = { ...snapshot.attempt };
          // A second public retry returns the same allocation and immutable pins/deadline.
          await command();
          assert.deepEqual((await participantActionRecoveryState(intent, f.studentId)).attempt, originalReceipt);
          await prisma.tryoutAttempt.update({ where: { id: snapshot.attempt.id }, data: { status: "submitted", submittedAt: new NativeDate() } });
          const terminal = await participantActionRecoveryState(intent, f.studentId);
          assert.equal(terminal.destination?.kind, "attempt");
          assert(terminal.destination?.kind === "attempt" && terminal.destination.result, "terminal Continue goes to the original result route without releasing scores");
          assert.equal(terminal.attempt?.serverDeadlineAt, originalReceipt.serverDeadlineAt);
        }
        // A read under another student never reveals this student's receipt.
        const other = await prisma.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" }, select: { id: true } });
        const foreign = await participantActionRecoveryState(intent, other.id);
        assert.equal(foreign.admission, null); assert.equal(foreign.assignment, null); assert.equal(foreign.attempt, null);
        evidence.push({ scenario: `${kind}: rejected client -> absent read -> original server commit concurrent with manual replay`, tryoutId: f.tryoutId, sessionId: f.sessionId, studentId: f.studentId, dispatches, auditBefore, snapshot });
      } finally { gate.release(); await gate.task; controller.dispose(); }
    }

    const approval = await fixture("approval_required");
    const pending = await registerForTryout(approval.tryoutId, approval.studentId, target, approval.sessionId);
    assert.equal(pending.state, "pending_approval");
    const pendingState = await participantActionRecoveryState({ kind: "register", tryoutId: approval.tryoutId, sessionId: approval.sessionId }, approval.studentId);
    assert.deepEqual(pendingState.destination, { kind: "detail" });
    assert.equal(pendingState.assignment, null);
    evidence.push({ scenario: "pending approval Continue is detail, without assignment", pendingState });

    for (const offset of [-1, 0, 1]) {
      const f = await fixture();
      at(f.session.availableFrom.getTime());
      await registerForTryout(f.tryoutId, f.studentId, target, f.sessionId);
      const startIntent: ParticipantActionIntent = { kind: "start", tryoutId: f.tryoutId, sessionId: f.sessionId };
      at(f.session.availableFrom.getTime() - 1);
      assert.equal((await participantActionRecoveryState(startIntent, f.studentId)).canRetry, false, "future start remains blocked");
      await assert.rejects(startTryoutAttempt(f.sessionId, f.studentId), TryoutAttemptValidationError);
      at(f.session.availableUntil.getTime() + offset);
      const snapshot = await participantActionRecoveryState(startIntent, f.studentId);
      assert.equal(snapshot.canRetry, offset < 0, "authoritative cutoff is exclusive at equality");
      if (offset < 0) {
        const started = await startTryoutAttempt(f.sessionId, f.studentId);
        at(f.session.availableUntil.getTime());
        const committed = await participantActionRecoveryState(startIntent, f.studentId);
        assert.equal(committed.canRetry, false);
        assert(committed.destination?.kind === "attempt" && committed.destination.attemptId === started.attemptId, "cutoff permits only the original owned attempt receipt");
        await prisma.tryoutAttempt.update({ where: { id: started.attemptId }, data: { status: "submitted", submittedAt: new NativeDate() } });
      } else {
        await assert.rejects(startTryoutAttempt(f.sessionId, f.studentId), TryoutAttemptValidationError);
        const other = await prisma.user.findUniqueOrThrow({ where: { email: "arya@vecalss.local" }, select: { id: true } });
        await assert.rejects(registerForTryout(f.tryoutId, other.id, target, f.sessionId), TryoutDeliveryValidationError);
        assert.equal(await prisma.tryoutAttempt.count({ where: { deliverySessionId: f.sessionId } }), 0);
      }
      evidence.push({ scenario: "public command and recovery cutoff", offset, tryoutId: f.tryoutId, snapshot });
    }
  } finally {
    globalThis.Date = NativeDate;
    if (student.studentProfile) await prisma.studentProfile.update({ where: { userId: student.id }, data: student.studentProfile });
  }

  // These acceptance fixtures remain future-only and contain no admissions/attempts.
  const fixtures = [];
  for (const mode of ["open", "approval_required", "invitation_only"] as const) fixtures.push(await createF12Fixture(mode));
  await mkdir(new URL("../.scratch/tryout-f12/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.scratch/tryout-f12/fixtures.json", import.meta.url), JSON.stringify(fixtures, null, 2));
  await writeFile(new URL("../.scratch/tryout-f12/db-evidence.json", import.meta.url), JSON.stringify(evidence, null, 2));
  console.log("F-12 public DB overlap, same-intent replay, ownership, immutable pins/deadline, pending and exact cutoff passed; future acceptance manifest prepared.");
} finally { globalThis.Date = NativeDate; await prisma.$disconnect(); }
