import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  toParticipantView,
  type ParticipantViewAdmissionInput,
} from "@/lib/tryout/participant-view";

const [delivery, operations, actions, participants, detail, notificationService, notificationDetail] = await Promise.all([
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/operations-view.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutParticipantsPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutParticipantDetailPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/notifications/service.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/student/NotificationDetailModal.tsx", import.meta.url), "utf8"),
]);

const fixture: ParticipantViewAdmissionInput = {
  assignments: [
    {
      assignedAt: new Date("2026-08-22T08:00:00.000Z"),
      deliverySession: {
        availableFrom: new Date("2026-08-22T08:00:00.000Z"),
        availableUntil: new Date("2026-08-22T10:00:00.000Z"),
        id: "session-1",
        name: "Sesi Pagi",
        status: "active",
      },
      id: "assignment-1",
      status: "active",
      attempt: {
        attemptState: "submitted",
        id: "attempt-1",
        normalizedScore: 87.5,
        rawScore: 35,
        releaseAt: null,
        releaseState: "hidden",
        scaledScore: 87.5,
        score: 87.5,
        scoringState: "scored",
        scoringVersion: "assessment-v1",
        status: "submitted",
      },
    },
  ],
  decidedAt: new Date("2026-08-22T07:45:00.000Z"),
  id: "admission-1",
  requestedAt: new Date("2026-08-22T07:30:00.000Z"),
  status: "active",
  student: { email: "secret.student@example.com", fullName: null, id: "student-1" },
  tryoutId: "tryout-1",
};

const view = toParticipantView(fixture, new Date("2026-08-22T09:00:00.000Z"));
assert.deepEqual(Object.keys(view).sort(), [
  "admission",
  "admissionId",
  "attempt",
  "id",
  "participant",
  "score",
  "session",
  "tryoutId",
]);
assert.equal(view.participant.id, "student-1");
assert.equal(view.participant.displayName, "s••••@example.com");
assert.doesNotMatch(view.participant.displayName, /secret\.student/);
assert.equal(view.session?.state, "completed");
assert.equal(view.attempt?.attemptState, "submitted");
assert.equal(view.score.score, "87.5");
assert.equal(view.score.scoringState, "scored");
assert.equal(view.score.releaseState, "hidden");

const segment = (startMarker: string, endMarker: string) => {
  const start = delivery.indexOf(startMarker);
  const end = delivery.indexOf(endMarker, start);
  assert.ok(start >= 0, `${startMarker} must exist`);
  assert.ok(end > start, `${endMarker} must follow ${startMarker}`);
  return delivery.slice(start, end);
};

const assertOrder = (source: string, ...tokens: string[]) => {
  let previous = -1;
  for (const token of tokens) {
    const next = source.indexOf(token);
    assert.ok(next > previous, `lock/order token ${token} is out of order`);
    previous = next;
  }
};

const registration = segment("async function registerForTryout(", "async function decideTryoutAdmission(");
const approval = segment("async function decideTryoutAdmission(", "async function inviteTryoutParticipant(");
const invitation = segment("async function inviteTryoutParticipant(", "async function revokeTryoutDeliveryAssignment(");
const revoke = segment("async function revokeTryoutDeliveryAssignment(", "async function getOwnedTryoutDeliverySessionIdsWithAttempts(");

// Every admission-side transaction takes the participant identity scope first
// (student row, then the Tryout aggregate) before touching sessions,
// admissions or assignments.
for (const source of [registration, approval, invitation, revoke]) {
  assert.match(source, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(source, /await lockTryoutParticipantIdentityScope\(tx,/);
}
for (const source of [registration, approval, invitation]) {
  assert.match(source, /await tx\.tryoutAdmission\.findUnique/);
}

// Helper bodies: student lock must precede the Tryout aggregate lock, and
// participant assignment locks run sessions -> admissions -> assignments.
const identityScopeHelper = segment("async function lockTryoutParticipantIdentityScope(", "async function lockOverlappingDeliverySessions(");
const participantAssignmentsHelper = segment("async function lockParticipantAssignments(", "async function ensureActiveAssignment(");
assertOrder(identityScopeHelper, "acquireTryoutIdentityMutex(", "lockTryoutStudents(", "lockTryout(", "assertTryoutIdentityStable(");
assertOrder(participantAssignmentsHelper, "lockTryoutSessions(", "lockTryoutAdmissions(", "lockTryoutAssignments(");

// Transaction-level order: identity scope first, then session scope, admissions,
// assignments (replay branch) or the participant-assignment helper (new branch).
assertOrder(registration, "lockTryoutParticipantIdentityScope(", "lockParticipantAssignments(", "lockSessionScope(");
assertOrder(approval, "lockTryoutParticipantIdentityScope(", "lockSessionScope(", "lockTryoutAdmissions(", "lockTryoutAssignments(", "lockParticipantAssignments(");
assertOrder(invitation, "lockTryoutParticipantIdentityScope(", "lockSessionScope(", "lockTryoutAdmissions(", "lockTryoutAssignments(", "lockParticipantAssignments(");
assertOrder(revoke, "lockTryoutParticipantIdentityScope(", "lockOverlappingDeliverySessions(", "lockTryoutAdmissions(", "lockTryoutAssignments(");

// Replay short-circuits must return before the participant-assignment lock set
// is acquired, so a replayed approve/invite does not re-lock the wider scope.
assert.ok(approval.indexOf("if (replayedAssignment) return admission;") > 0, "approval replay short-circuit must exist");
assert.ok(approval.indexOf("if (replayedAssignment) return admission;") < approval.indexOf("lockParticipantAssignments("), "approval replay must short-circuit before participant assignment locks");
assert.ok(invitation.indexOf("if (replayedAssignment) return") > 0, "invitation replay short-circuit must exist");
assert.ok(invitation.indexOf("if (replayedAssignment) return") < invitation.indexOf("lockParticipantAssignments("), "invitation replay must short-circuit before participant assignment locks");
assert.ok(invitation.indexOf("await assertAdmissionMutationAllowed(") < invitation.indexOf("await assertInvitationStudent("), "invitation authorization must precede participant reads");
assert.match(invitation, /createTryoutInvitationNotification/u);
assert.ok(invitation.indexOf("const invitationAudit = await audit(tx, { action: needsRestore") < invitation.indexOf("createTryoutInvitationNotification"), "invitation notification must follow the admission audit");
assert.match(invitation, /const invitationAudit = await audit\(tx, \{ action: needsRestore \? "admission\.access_restored" : "admission\.invited"/u, "invitation notification must use the lifecycle audit event");
assert.match(invitation, /sourceEntityId: invitationAudit\.id/u, "invitation notification dedupe must use a lifecycle-specific key");
assert.match(invitation, /existingAssignment\?\.status !== TryoutAssignmentStatus\.active/u, "replayed active invitations must not notify again");
assert.match(invitation, /ensureActiveAssignment\(tx, restored\.id, lockedSelected\.id, actorId\)/u, "reinviting a revoked assignment must preserve the existing assignment lifecycle");
assert.match(delivery, /status === TryoutDeliverySessionStatus\.closed/);
assert.match(delivery, /status === TryoutDeliverySessionStatus\.archived/);
assert.match(delivery, /!session\.assessmentReleaseId/);
assert.match(delivery, /ensureActiveAssignment/);
assert.match(delivery, /existing\.status === TryoutAssignmentStatus\.active\) return existing/);
assert.match(revoke, /tryoutAttempt\.findUnique/);
assert.match(revoke, /riwayat peserta tetap dipertahankan/);
assert.match(revoke, /assignment\.status === TryoutAssignmentStatus\.revoked\) return assignment/);

assert.match(delivery, /async function getTryoutDeliveryOperations\(tryoutId: string, actorId: string\)/);
const operationsRead = segment("async function getTryoutDeliveryOperations(", "export {");
assert.match(operationsRead, /if \(!\(await isActiveTryoutManager\(tx, actorId\)\)\) return null;/);
assert.ok(operationsRead.indexOf("isActiveTryoutManager(tx, actorId)") < operationsRead.indexOf("student: { select: { email"), "manager gate must precede PII-bearing graph load");
assert.match(operations, /participants: toParticipantViews\(participantInputs\)/);
// Kapten operations views are owner-scoped management projections: they may show a participant's real
// email (it is how same-named students are told apart), but only through mentorParticipantIdentity.
// Student-facing and attempt-level projections keep the masked identity.
assert.match(operations, /mentorParticipantIdentity\(participantInputs\[index\]\.student\)/);
assert.match(operations, /student: safeParticipantIdentity\(attempt\.student\)\.displayName/);
assert.doesNotMatch(operations, /email: (?!admission\.student\.email)[^,\n]*student\.email/u);
assert.doesNotMatch(actions, /selectedSessionId/);
assert.match(participants, /initial\.results/u);
assert.match(participants, /initial\.attempts/u);
assert.match(participants, /DataTableFilterMenu/u);
assert.match(participants, /scoreVisible/u);
assert.match(participants, /buildMentorTryoutAttemptHref/u);
assert.match(detail, /Akses sesi/);
assert.match(detail, /Akses yang sudah memiliki pengerjaan tidak dapat dicabut/);
assert.match(detail, /Riwayat pendaftaran tetap tersimpan/);
assert.match(notificationService, /async function createTryoutInvitationNotification/u);
assert.match(notificationService, /eventType: NotificationEventType\.custom/u);
assert.match(notificationService, /sourceEntityType: TRYOUT_INVITATION_SOURCE_ENTITY_TYPE/u);
assert.match(notificationService, /const TRYOUT_INVITATION_SOURCE_ENTITY_TYPE = "tryout_invitation"/u);
assert.match(notificationService, /deepLink: `\/tryout\/\$\{tryoutId\}\/waiting`/u);
assert.match(notificationService, /title: "Undangan Tryout"/u);
assert.match(notificationService, /Aksesmu ke Tryout sudah aktif/u);
assert.match(notificationService, /notificationDelivery\.create/u);
assert.ok(notificationService.indexOf("if (existing) return existing") < notificationService.indexOf("notificationDelivery.create"), "invitation notification creation must be idempotent");
assert.match(notificationDetail, /Buka ruang tunggu/u);
assert.match(notificationDetail, /isTryoutWaitingRoomLink/u);
assert.match(notificationDetail, /\^\\\/tryout\\\/\[\^\/\]\+\\\/waiting\$/u);

console.log("Assessment ParticipantView and access-transition contracts passed.");
