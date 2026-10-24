import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma";
import { createTa01Fixture } from "./tryout-ta01-fixture";
import { assignTryoutDeliverySession, decideTryoutAdmission, revokeTryoutDeliveryAssignment } from "../lib/tryout/delivery-repository";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "../lib/tryout/operations-view";
import { participantTryoutDetail } from "../lib/tryout/participant-repository";
import { startTryoutAttempt } from "../lib/tryout/attempt-repository";
import { queryTryoutParticipants } from "../lib/tryout/participant-list";

try {
  const fixture = await createTa01Fixture();
  const [approve, reject, revokedAccess] = fixture.admissions;
  const view = await getOwnedTryoutOperationsView(fixture.tryoutId, fixture.ownerId);
  assert(view);
  assert.equal(view.participants.length, 5);
  assert.equal(view.attempts.length, 0);
  assert.equal(queryTryoutParticipants(view, {}).pendingCount, 2);
  assert.equal(queryTryoutParticipants(view, { access: "revoked" }).rows[0].admissionId, revokedAccess.id);
  assert.equal(await getOwnedTryoutOperationsView(fixture.tryoutId, approve.studentId), null);
  const otherTutor = await prisma.user.findFirst({ where: { id: { not: fixture.ownerId }, roleAssignments: { some: { role: "tutor", revokedAt: null } } } });
  assert(otherTutor, "seeded second Kapten is required");
  assert.equal(await getOwnedTryoutOperationsView(fixture.tryoutId, otherTutor.id), null);
  await assert.rejects(decideTryoutAdmission(approve.id, "approve", otherTutor.id, "wrong owner", false, fixture.sessionId));
  await assert.rejects(decideTryoutAdmission(approve.id, "approve", fixture.ownerId, " ", false, fixture.sessionId));
  const originalSession = await prisma.tryoutDeliverySession.findUniqueOrThrow({ where: { id: fixture.sessionId } });
  for (const status of ["draft", "closed", "archived"] as const) {
    await prisma.tryoutDeliverySession.update({ where: { id: fixture.sessionId }, data: { status } });
    await assert.rejects(decideTryoutAdmission(approve.id, "approve", fixture.ownerId, "ineligible session", false, fixture.sessionId));
  }
  // A bound release is immutable. Use a separate legacy/unprepared session instead
  // of rebinding the prepared fixture session just to exercise its refusal.
  const unpreparedSession = await prisma.tryoutDeliverySession.create({ data: {
    tryoutId: fixture.tryoutId,
    name: "Unprepared eligibility fixture",
    status: "active",
    availableFrom: originalSession.availableFrom,
    availableUntil: originalSession.availableUntil,
    createdByUserId: fixture.ownerId,
    updatedByUserId: fixture.ownerId,
  } });
  await assert.rejects(decideTryoutAdmission(approve.id, "approve", fixture.ownerId, "unprepared session", false, unpreparedSession.id));
  const expiredUntil = new Date(Date.now() - 1_000);
  await prisma.tryoutDeliverySession.update({ where: { id: fixture.sessionId }, data: { status: "active", availableFrom: new Date(expiredUntil.getTime() - 60_000), availableUntil: expiredUntil } });
  try {
    await assert.rejects(decideTryoutAdmission(approve.id, "approve", fixture.ownerId, "expired session", false, fixture.sessionId));
  } finally {
    await prisma.tryoutDeliverySession.update({ where: { id: fixture.sessionId }, data: { availableFrom: originalSession.availableFrom, availableUntil: originalSession.availableUntil } });
  }
  assert.equal(await prisma.tryoutAdmission.findUniqueOrThrow({ where: { id: approve.id } }).then((admission) => admission.status), "pending");
  assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { admissionId: approve.id } }), 0);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { admissionId: approve.id } }), 0);
  const duplicate = await Promise.all([decideTryoutAdmission(approve.id, "approve", fixture.ownerId, "first decision", false, fixture.sessionId), decideTryoutAdmission(approve.id, "approve", fixture.ownerId, "retry decision", false, fixture.sessionId)]);
  assert(duplicate.every((result) => result.status === "active"));
  assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { admissionId: approve.id } }), 1);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { admissionId: approve.id, action: "admission.approved" } }), 1);
  await assert.rejects(decideTryoutAdmission(approve.id, "reject", fixture.ownerId, "opposing decision"));
  await decideTryoutAdmission(reject.id, "reject", fixture.ownerId, "reject decision");
  await decideTryoutAdmission(reject.id, "reject", fixture.ownerId, "retry rejection");
  assert.equal(await prisma.tryoutDeliveryAssignment.count({ where: { admissionId: reject.id } }), 0);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { admissionId: reject.id, action: "admission.rejected" } }), 1);
  await assert.rejects(decideTryoutAdmission(reject.id, "approve", fixture.ownerId, "opposing decision", false, fixture.sessionId));
  const raceTarget = fixture.admissions[3];
  await prisma.tryoutAdmission.update({ where: { id: raceTarget.id }, data: { status: "pending" } });
  const opposingRace = await Promise.allSettled([decideTryoutAdmission(raceTarget.id, "approve", fixture.ownerId, "opposing approve", false, fixture.sessionId), decideTryoutAdmission(raceTarget.id, "reject", fixture.ownerId, "opposing reject")]);
  assert.equal(opposingRace.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await prisma.tryoutDeliveryAudit.count({ where: { admissionId: raceTarget.id, action: { in: ["admission.approved", "admission.rejected"] } } }), 1);
  const studentView = await participantTryoutDetail(fixture.tryoutId, approve.studentId);
  assert(studentView);
  assert.equal(studentView.admissionStatus, "active");
  await assert.rejects(startTryoutAttempt(fixture.sessionId, approve.studentId), /belum|jadwal|dibuka/i);
  await assert.rejects(assignTryoutDeliverySession({ admissionId: revokedAccess.id, deliverySessionId: fixture.sessionId }, fixture.ownerId, "implicit restore"), /Konfirmasikan/);
  const restored = await assignTryoutDeliverySession({ admissionId: revokedAccess.id, deliverySessionId: fixture.sessionId, restoreRevoked: true }, fixture.ownerId, "explicit restore");
  await revokeTryoutDeliveryAssignment(restored.id, fixture.ownerId, "revoke again");
  const activeAssignment = await prisma.tryoutDeliveryAssignment.findFirstOrThrow({ where: { admissionId: approve.id } });
  await prisma.tryoutPackage.update({ where: { id: fixture.tryoutId }, data: { status: "archived" } });
  await assert.rejects(decideTryoutAdmission(reject.id, "reject", fixture.ownerId, "stale decision"), /diarsipkan/);
  await assert.rejects(assignTryoutDeliverySession({ admissionId: revokedAccess.id, deliverySessionId: fixture.sessionId, restoreRevoked: true }, fixture.ownerId, "stale restore"), /diarsipkan/);
  await assert.rejects(revokeTryoutDeliveryAssignment(activeAssignment.id, fixture.ownerId, "stale revoke"), /diarsipkan/);
  const history = await getOwnedTryoutOperationsView(fixture.tryoutId, fixture.ownerId);
  assert(history && history.status === "archived");
  assert.equal(toTryoutWorkspaceView(history).participants.length, 5);
  const pendingFixture = await createTa01Fixture();
  const otherSession = pendingFixture.sessionId;
  await assert.rejects(decideTryoutAdmission(pendingFixture.admissions[0].id, "approve", fixture.ownerId, "wrong session", false, fixture.sessionId));
  await prisma.tryoutDeliverySession.update({ where: { id: otherSession }, data: { isDefaultOpenRegistration: false } });
  await assert.rejects(decideTryoutAdmission(pendingFixture.admissions[0].id, "approve", fixture.ownerId, "no default session"));
  await prisma.tryoutDeliverySession.update({ where: { id: otherSession }, data: { isDefaultOpenRegistration: true } });
  for (const admission of fixture.admissions) admission.status = (await prisma.tryoutAdmission.findUniqueOrThrow({ where: { id: admission.id } })).status;
  await writeFile(new URL("../.scratch/tryout-ta01/fixtures.json", import.meta.url), JSON.stringify({ archived: fixture, pending: pendingFixture }, null, 2));
  console.log("TA-01 DB checks passed: owner scoping, complete zero-attempt list, approval/rejection idempotency, future Start refusal, explicit assignment restoration, archive fences. Reusable pending/archive fixtures: .scratch/tryout-ta01/fixtures.json");
} finally { await prisma.$disconnect(); }
