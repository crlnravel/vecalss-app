import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { searchTryoutInvitationStudents } from "../lib/tryout/invitation-picker";
import { assignTryoutDeliverySession, decideTryoutAdmission, inviteTryoutParticipant, registerForTryout, revokeTryoutDeliveryAssignment } from "../lib/tryout/delivery-repository";
import { archiveTryout, setTryoutHidden, unpublishTryout } from "../lib/tryout/repository";
import { getOwnedTryoutOperationsView, getOwnedTryoutParticipantsView } from "../lib/tryout/operations-view";
import { participantTryoutCatalogue, participantTryoutDetail } from "../lib/tryout/participant-repository";
import { startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { mentorParticipantIdentity } from "../lib/tryout/mentor-participant-identity";
import { createTa03Fixture } from "./tryout-ta03-fixture";
import { withTa02Lease } from "./tryout-ta02-fixture";

type Fixture = Awaited<ReturnType<typeof createTa03Fixture>>;
const ledger: Record<string, unknown> = {};
async function remember(name: string, fixture: Fixture) {
  const parent = await prisma.tryoutPackage.findUniqueOrThrow({ where: { id: fixture.tryoutId }, select: { status: true, admissionMode: true, isHidden: true } });
  const session = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: fixture.sessionId }, select: { status: true, availableFrom: true, availableUntil: true, assessmentReleaseId: true } });
  const admissions = await prisma.tryoutAdmission.findMany({ where: { tryoutId: fixture.tryoutId }, select: { id: true, studentId: true, status: true, assignments: { select: { id: true, status: true, deliverySessionId: true } } } });
  ledger[name] = { ...fixture, ...parent, session, admissions };
  await writeFile(new URL("../.scratch/tryout-ta03/final-fixtures.json", import.meta.url), JSON.stringify(ledger, null, 2));
}
async function counts(tryoutId: string) {
  const audits = await prisma.tryoutDeliveryAudit.findMany({ where: { tryoutId, action: { in: ["admission.invited", "admission.access_restored", "delivery_session.assigned"] } }, select: { id: true } });
  return {
    grants: audits.length,
    notifications: await prisma.notification.count({ where: { sourceEntityType: "tryout_invitation", sourceEntityId: { in: audits.map((item) => item.id) } } }),
    admissions: await prisma.tryoutAdmission.count({ where: { tryoutId } }),
    assignments: await prisma.tryoutDeliveryAssignment.count({ where: { admission: { tryoutId } } }),
  };
}
async function atServerTime<T>(instant: Date, run: () => Promise<T>) {
  const NativeDate = globalThis.Date;
  // Controlled Date seam in this isolated sequential test process, never app/browser clocks.
  globalThis.Date = class extends NativeDate {
    constructor(value?: string | number | Date) { super(value === undefined ? instant.getTime() : value instanceof NativeDate ? value.getTime() : value); }
    static now() { return instant.getTime(); }
  } as DateConstructor;
  try { return await run(); } finally { globalThis.Date = NativeDate; }
}

try {
  const fixture = await createTa03Fixture();
  await writeFile(new URL("../.scratch/tryout-ta03/fixtures.json", import.meta.url), JSON.stringify(fixture, null, 2));
  const student = fixture.students.find((item) => item.id === fixture.studentId)!;
  const matches = await searchTryoutInvitationStudents(fixture.tryoutId, fixture.ownerId, fixture.studentEmail);
  const selected = matches.find((item) => item.id === student.id);
  assert(selected, "an unregistered student is discoverable by account email");
  assert.deepEqual({ displayName: selected.displayName, email: (selected as unknown as { email: string }).email }, mentorParticipantIdentity(student), "picker uses the same approved account identity as participant list/detail");
  assert.equal(selected.admission, null, "new students are discoverable without a registration");
  const grant = (studentId: string, intent: "invite" | "restore" = "invite") => inviteTryoutParticipant(fixture.tryoutId, studentId, fixture.ownerId, "TA-03 explicit access", false, fixture.sessionId, intent);
  const otherTutor = await prisma.user.findFirstOrThrow({ where: { id: { not: fixture.ownerId }, roleAssignments: { some: { role: "tutor", revokedAt: null } } }, select: { id: true } });
  await assert.rejects(searchTryoutInvitationStudents(fixture.tryoutId, otherTutor.id, "student"));
  await assert.rejects(searchTryoutInvitationStudents(fixture.tryoutId, fixture.studentId, "student"));
  await assert.rejects(inviteTryoutParticipant(fixture.tryoutId, fixture.studentId, otherTutor.id, "wrong owner", false, fixture.sessionId));
  await assert.rejects(inviteTryoutParticipant(fixture.tryoutId, fixture.studentId, fixture.ownerId, " ", false, fixture.sessionId));
  await assert.rejects(registerForTryout(fixture.tryoutId, fixture.studentId), /undangan/);
  await assert.rejects(startTryoutAttempt(fixture.sessionId, fixture.studentId));
  const duplicates = await Promise.all([grant(fixture.studentId), grant(fixture.studentId)]);
  assert.equal(duplicates.filter((item) => item.changed).length, 1);
  const invited = duplicates[0];
  assert.deepEqual(await counts(fixture.tryoutId), { grants: 1, notifications: 1, admissions: 1, assignments: 1 });
  const projected = await getOwnedTryoutParticipantsView(fixture.tryoutId, fixture.ownerId);
  assert.deepEqual(projected?.participants[0].participant.email, fixture.studentEmail);
  assert(projected?.sessions.every((session) => session.attempts.length === 0), "picker refresh never includes raw session attempts");
  const studentView = await participantTryoutDetail(fixture.tryoutId, fixture.studentId);
  assert.equal(studentView?.admissionStatus, "active");
  assert.equal(studentView?.assignments[0].id, fixture.sessionId);
  await assert.rejects(startTryoutAttempt(fixture.sessionId, fixture.studentId), /belum|jadwal|dibuka/i);
  await revokeTryoutDeliveryAssignment(invited.assignmentId, fixture.ownerId, "TA-03 revoke before attempt");
  const repeated = await registerForTryout(fixture.tryoutId, fixture.studentId);
  assert.equal(repeated.admissionId, invited.id);
  assert.equal((await prisma.tryoutDeliveryAssignment.findUniqueOrThrow({ where: { id: invited.assignmentId } })).status, "revoked", "self-registration never implicitly restores access");
  const revokedSearch = await searchTryoutInvitationStudents(fixture.tryoutId, fixture.ownerId, fixture.studentEmail);
  assert.equal(revokedSearch[0].admission?.assignment?.status, "revoked", "active registration retains revoked main assignment in picker DTO");
  await assert.rejects(grant(fixture.studentId), /Konfirmasikan/);
  const restoration = await Promise.all([grant(fixture.studentId, "restore"), grant(fixture.studentId, "restore")]);
  assert.equal(restoration.filter((item) => item.changed).length, 1);
  assert(restoration.every((item) => item.id === invited.id && item.assignmentId === invited.assignmentId));
  assert.deepEqual(await counts(fixture.tryoutId), { grants: 2, notifications: 2, admissions: 1, assignments: 1 });
  const audit = await prisma.tryoutDeliveryAudit.findFirstOrThrow({ where: { admissionId: invited.id, action: "admission.access_restored" } });
  assert.equal((audit.before as { assignmentStatus: string }).assignmentStatus, "revoked");
  const others = fixture.students.filter((item) => item.id !== fixture.studentId);
  for (const [index, status] of (["pending", "rejected", "revoked", "active"] as const).entries()) {
    const target = others[index];
    const admission = await prisma.tryoutAdmission.create({ data: { studentId: target.id, tryoutId: fixture.tryoutId, status } });
    if (status === "pending") {
      await assert.rejects(grant(target.id), /Setujui atau Tolak/);
      await assert.rejects(grant(target.id, "restore"), /Setujui atau Tolak/);
      await decideTryoutAdmission(admission.id, "reject", fixture.ownerId, "TA-03 pending rejection");
      await assert.rejects(decideTryoutAdmission(admission.id, "approve", fixture.ownerId, "opposing decision", false, fixture.sessionId));
    }
    if (status !== "active") await assert.rejects(grant(target.id), /Konfirmasikan/);
    const result = await grant(target.id, status === "active" ? "invite" : "restore");
    assert.equal(result.id, admission.id, "historical registration identity is preserved");
  }
  assert.deepEqual(await counts(fixture.tryoutId), { grants: 6, notifications: 6, admissions: 5, assignments: 5 });
  await remember("invitations", fixture);

  const blocked = await createTa03Fixture();
  for (const status of ["draft", "closed", "archived"] as const) {
    await prisma.tryoutDeliverySession.update({ where: { id: blocked.sessionId }, data: { status } });
    await assert.rejects(inviteTryoutParticipant(blocked.tryoutId, blocked.studentId, blocked.ownerId, "invalid session", false, blocked.sessionId));
    const blockedView = await getOwnedTryoutParticipantsView(blocked.tryoutId, blocked.ownerId);
    const blockedSession = blockedView?.sessions.find((item) => item.id === blocked.sessionId);
    assert.equal(blockedSession?.grantEligible, false);
    assert.equal(blockedSession?.grantBlockedReason, status === "draft" ? "inactive_session" : status === "closed" ? "closed_session" : "archived_session");
  }
  await prisma.tryoutDeliverySession.update({ where: { id: blocked.sessionId }, data: { status: "active", isDefaultOpenRegistration: false } });
  await assert.rejects(inviteTryoutParticipant(blocked.tryoutId, blocked.studentId, blocked.ownerId, "no default"));
  const unbound = await prisma.tryoutDeliverySession.create({ data: { tryoutId: blocked.tryoutId, name: "TA-03 unprepared", status: "active", availableFrom: new Date(Date.now() + 60_000), availableUntil: new Date(Date.now() + 86_400_000), createdByUserId: blocked.ownerId, updatedByUserId: blocked.ownerId } });
  await assert.rejects(inviteTryoutParticipant(blocked.tryoutId, blocked.studentId, blocked.ownerId, "no content", false, unbound.id));
  const unboundView = await getOwnedTryoutParticipantsView(blocked.tryoutId, blocked.ownerId);
  assert.equal(unboundView?.sessions.find((item) => item.id === unbound.id)?.grantBlockedReason, "missing_content");
  await assert.rejects(inviteTryoutParticipant(blocked.tryoutId, blocked.studentId, blocked.ownerId, "wrong target", false, fixture.sessionId));
  assert.deepEqual(await counts(blocked.tryoutId), { grants: 0, notifications: 0, admissions: 0, assignments: 0 });
  await remember("blockedSessions", blocked);

  const boundary = await createTa03Fixture();
  const cutoff = (await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: boundary.sessionId } })).availableUntil;
  await atServerTime(new Date(cutoff.getTime() - 1), () => inviteTryoutParticipant(boundary.tryoutId, boundary.students[0].id, boundary.ownerId, "before end", false, boundary.sessionId));
  await atServerTime(cutoff, () => assert.rejects(inviteTryoutParticipant(boundary.tryoutId, boundary.students[1].id, boundary.ownerId, "equal end", false, boundary.sessionId), /berakhir/));
  await atServerTime(cutoff, async () => {
    const expiredView = await getOwnedTryoutParticipantsView(boundary.tryoutId, boundary.ownerId);
    const expiredSession = expiredView?.sessions.find((item) => item.id === boundary.sessionId);
    assert.equal(expiredSession?.grantEligible, false);
    assert.equal(expiredSession?.grantBlockedReason, "ended_session");
  });
  await atServerTime(new Date(cutoff.getTime() + 1), () => assert.rejects(inviteTryoutParticipant(boundary.tryoutId, boundary.students[2].id, boundary.ownerId, "after end", false, boundary.sessionId), /berakhir/));
  assert.deepEqual(await counts(boundary.tryoutId), { grants: 1, notifications: 1, admissions: 1, assignments: 1 });
  await remember("serverBoundary", boundary);

  const hidden = await createTa03Fixture();
  const hiddenStudent = await prisma.user.findFirstOrThrow({
    where: { id: { in: hidden.students.map((item) => item.id) }, tryoutAttempts: { none: { status: "in_progress" } } },
    select: { id: true },
    orderBy: { email: "asc" },
  });
  const hiddenOther = hidden.students.find((item) => item.id !== hiddenStudent.id)!;
  // Exercise the supported held-lease lifecycle seam. The existing transient
  // path reacquires a lower-order lock; report it separately without changing it.
  await withTa02Lease(hidden.tryoutId, hidden.ownerId, (lease) => setTryoutHidden(hidden.tryoutId, true, hidden.ownerId, lease));
  await assert.rejects(registerForTryout(hidden.tryoutId, hiddenStudent.id));
  assert.equal(await participantTryoutDetail(hidden.tryoutId, hiddenStudent.id), null, "hidden uninvited detail stays private");
  assert(!(await participantTryoutCatalogue(hiddenStudent.id)).some((item) => item.id === hidden.tryoutId));
  const hiddenGrant = await inviteTryoutParticipant(hidden.tryoutId, hiddenStudent.id, hidden.ownerId, "deliberate hidden invitation", false, hidden.sessionId);
  const hiddenDetail = await participantTryoutDetail(hidden.tryoutId, hiddenStudent.id);
  assert.equal(hiddenDetail?.admissionStatus, "active");
  assert.equal(hiddenDetail?.assignments[0].id, hidden.sessionId, "invited student discovers the intended hidden schedule");
  assert.equal(hiddenDetail?.assignments[0].isAvailableNow, false, "future hidden invitation still waits for opening");
  assert((await participantTryoutCatalogue(hiddenStudent.id)).some((item) => item.id === hidden.tryoutId));
  await assert.rejects(startTryoutAttempt(hidden.sessionId, hiddenStudent.id), /belum|jadwal|dibuka/i);
  await assert.rejects(registerForTryout(hidden.tryoutId, hiddenOther.id));
  assert.equal(await participantTryoutDetail(hidden.tryoutId, hiddenOther.id), null);
  assert(!(await participantTryoutCatalogue(hiddenOther.id)).some((item) => item.id === hidden.tryoutId));
  for (const status of ["pending", "rejected", "revoked", "active"] as const) {
    const target = hidden.students.filter((item) => item.id !== hiddenStudent.id)[["pending", "rejected", "revoked", "active"].indexOf(status)];
    const admission = await prisma.tryoutAdmission.create({ data: { tryoutId: hidden.tryoutId, studentId: target.id, status } });
    assert.equal(await participantTryoutDetail(hidden.tryoutId, target.id), null, `${status} registration without usable access cannot discover a hidden Tryout`);
    assert(!(await participantTryoutCatalogue(target.id)).some((item) => item.id === hidden.tryoutId));
    if (status === "active") {
      await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: hidden.sessionId, assignedByUserId: hidden.ownerId, status: "revoked", revokedAt: new Date(), revokeReason: "TA-03 hidden access refusal" } });
      assert.equal(await participantTryoutDetail(hidden.tryoutId, target.id), null, "revoked hidden assignment stays private");
      assert(!(await participantTryoutCatalogue(target.id)).some((item) => item.id === hidden.tryoutId));
    }
  }
  const hiddenSession = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: hidden.sessionId }, include: { assessmentRelease: true } });
  await atServerTime(hiddenSession.availableFrom, async () => {
    await assert.rejects(startTryoutAttempt(hidden.sessionId, hiddenOther.id));
    assert.equal((await participantTryoutDetail(hidden.tryoutId, hiddenStudent.id))?.assignments[0].isAvailableNow, true);
    const started = await startTryoutAttempt(hidden.sessionId, hiddenStudent.id);
    assert.equal(started.state, "started");
    const attempt = await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
    assert.equal(attempt.admissionId, hiddenGrant.id);
    assert.equal(attempt.studentId, hiddenStudent.id);
    assert.equal(attempt.assessmentReleaseId, hiddenSession.assessmentRelease!.id);
    assert.equal(attempt.assessmentReleaseNumber, hiddenSession.assessmentRelease!.releaseNumber);
    assert.equal(attempt.assessmentReleaseDigest, hiddenSession.assessmentRelease!.contentDigest);
    const replay = await startTryoutAttempt(hidden.sessionId, hiddenStudent.id);
    assert.equal(replay.state, "existing");
    assert.equal(replay.attemptId, started.attemptId, "hidden Start replay preserves the original attempt");
    assert.deepEqual(await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: started.attemptId } }), attempt);
  });
  ledger.hiddenInvitedStudentId = hiddenStudent.id;
  await remember("hidden", hidden);

  const archived = await createTa03Fixture();
  const race = await withTa02Lease(archived.tryoutId, archived.ownerId, (lease) => Promise.allSettled([archiveTryout(archived.tryoutId, archived.ownerId, lease), inviteTryoutParticipant(archived.tryoutId, archived.studentId, archived.ownerId, "archive race", false, archived.sessionId)]));
  assert.equal(race[0].status, "fulfilled");
  const archivedCounts = await counts(archived.tryoutId);
  assert.equal(archivedCounts.grants, race[1].status === "fulfilled" ? 1 : 0);
  assert.equal(archivedCounts.notifications, archivedCounts.grants);
  await assert.rejects(inviteTryoutParticipant(archived.tryoutId, archived.studentId, archived.ownerId, "stale archive", false, archived.sessionId), /diarsipkan/);
  assert.deepEqual(await counts(archived.tryoutId), archivedCounts);
  await remember("archiveRace", archived);

  const closing = await createTa03Fixture();
  const closeRace = await withTa02Lease(closing.tryoutId, closing.ownerId, (lease) => Promise.allSettled([unpublishTryout(closing.tryoutId, closing.ownerId, lease), inviteTryoutParticipant(closing.tryoutId, closing.studentId, closing.ownerId, "close race", false, closing.sessionId)]));
  assert.equal(closeRace[0].status, "fulfilled");
  const closeCounts = await counts(closing.tryoutId);
  assert.equal(closeCounts.grants, closeRace[1].status === "fulfilled" ? 1 : 0);
  assert.equal(closeCounts.notifications, closeCounts.grants);
  await assert.rejects(inviteTryoutParticipant(closing.tryoutId, closing.studentId, closing.ownerId, "stale close", false, closing.sessionId));
  await remember("closeRace", closing);

  const attempted = await createTa03Fixture();
  const startedGrant = await inviteTryoutParticipant(attempted.tryoutId, attempted.studentId, attempted.ownerId, "attempt history", false, attempted.sessionId);
  const release = await prisma.assessmentRelease.findFirstOrThrow({ where: { deliverySessions: { some: { id: attempted.sessionId } } } });
  const immutable = await prisma.tryoutAttempt.create({ data: { assessmentReleaseId: release.id, assessmentReleaseNumber: release.releaseNumber, assessmentReleaseDigest: release.contentDigest, tryoutId: attempted.tryoutId, deliverySessionId: attempted.sessionId, admissionId: startedGrant.id, studentId: attempted.studentId, serverStartedAt: new Date(Date.now() + 3 * 86_400_000), serverDeadlineAt: new Date(Date.now() + 4 * 86_400_000), contentSnapshot: { fixture: "immutable" }, releasePolicySnapshot: {} } });
  await assert.rejects(revokeTryoutDeliveryAssignment(startedGrant.assignmentId, attempted.ownerId, "attempt revocation"), /pengerjaan/);
  assert.deepEqual(await prisma.tryoutAttempt.findUniqueOrThrow({ where: { id: immutable.id } }), immutable);
  const attemptedRefresh = await getOwnedTryoutParticipantsView(attempted.tryoutId, attempted.ownerId);
  assert(!JSON.stringify(attemptedRefresh).includes("immutable"), "immutable attempt snapshot never leaks into picker refresh");
  await remember("attemptHistory", attempted);

  const candidates = await createTa03Fixture();
  const candidateStudents = [candidates.students.find((item) => item.id === candidates.studentId)!, ...candidates.students.filter((item) => item.id !== candidates.studentId)].slice(0, 5);
  for (const [index, target] of candidateStudents.entries()) {
    const status = (["pending", "rejected", "revoked", "active", "active"] as const)[index];
    const admission = await prisma.tryoutAdmission.create({ data: { studentId: target.id, tryoutId: candidates.tryoutId, status } });
    if (index === 3) await prisma.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, deliverySessionId: candidates.sessionId, assignedByUserId: candidates.ownerId, status: "revoked", revokedAt: new Date(), revokeReason: "TA-03 browser restoration fixture" } });
  }
  await remember("restorationCandidates", candidates);

  const excluded = await prisma.user.findMany({ select: { id: true, email: true }, where: { OR: [{ status: { not: "active" } }, { softDeletedAt: { not: null } }, { previewPurpose: { not: null } }] }, take: 20 });
  await assert.rejects(grant(fixture.ownerId), /masih aktif/, "stale non-student identity cannot bypass eligibility");
  for (const account of excluded) {
    assert(!(await searchTryoutInvitationStudents(fixture.tryoutId, fixture.ownerId, account.email)).some((item) => item.id === account.id));
    await assert.rejects(grant(account.id), /masih aktif/);
  }
  ledger.excludedAccountCases = excluded.length;
  ledger.sameNameSeededPair = fixture.students.some((left, index) => fixture.students.slice(index + 1).some((right) => left.fullName?.trim() === right.fullName?.trim()));
  const missing = await prisma.tryoutAdmission.create({ data: { studentId: others[5].id, tryoutId: fixture.tryoutId, status: "active" } });
  const assigned = await assignTryoutDeliverySession({ admissionId: missing.id, deliverySessionId: fixture.sessionId }, fixture.ownerId, "direct explicit grant");
  await revokeTryoutDeliveryAssignment(assigned.id, fixture.ownerId, "direct revoke");
  await assert.rejects(assignTryoutDeliverySession({ admissionId: missing.id, deliverySessionId: fixture.sessionId }, fixture.ownerId, "implicit restoration"));
  await assignTryoutDeliverySession({ admissionId: missing.id, deliverySessionId: fixture.sessionId, restoreRevoked: true }, fixture.ownerId, "direct restore");
  await assignTryoutDeliverySession({ admissionId: missing.id, deliverySessionId: fixture.sessionId, restoreRevoked: true }, fixture.ownerId, "direct retry");
  assert.deepEqual(await counts(fixture.tryoutId), { grants: 8, notifications: 8, admissions: 6, assignments: 6 });
  await remember("invitations", fixture);
  assert(await getOwnedTryoutOperationsView(archived.tryoutId, archived.ownerId), "archived history remains readable");
  console.log(`TA-03 DB behavior passed: search identity/owner guards, invitation-only, exact duplicate counts, grant/revoke/restore history, pending/rejected/revoked/missing access, session/content/target refusal, exact server end boundaries, hidden/archive/close races, immutable attempt refusal, ${excluded.length} existing excluded account checks and direct assignment notification parity.`);
} finally { await prisma.$disconnect(); }
