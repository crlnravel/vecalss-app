import assert from "node:assert/strict";
import { buildMentorTryoutHref, PARTICIPANT_STATUS_FILTERS, parseMentorTryoutContext } from "../lib/navigation/canonical-context";
import { mentorParticipantIdentity } from "../lib/tryout/mentor-participant-identity";
import { queryTryoutParticipants } from "../lib/tryout/participant-list";
import { PARTICIPANT_STATUSES, participantStatus, participantStatusLabels, participantStatusTones } from "../lib/tryout/participant-status";
import type { TryoutOperationsView } from "../lib/tryout/operations-view";
import { withTryoutRequestDeadline } from "../modules/mentor/tryout-request-recovery";
import { isTryoutAdmissionSessionAvailable } from "../lib/tryout/registration-availability";

const list = parseMentorTryoutContext(new URLSearchParams("workspace=operations&delivery=participants&q=Nabila&status=pending&page=2"));
assert.deepEqual(list.issues, [], "registration management belongs to Operasional");
assert.equal(list.workspace, "operations");
assert.equal(list.delivery, "participants");
assert.equal(buildMentorTryoutHref("owned-tryout", list), "/mentor/tryout/owned-tryout?workspace=operations&delivery=participants&q=Nabila&status=pending&page=2");
assert.equal(parseMentorTryoutContext({ workspace: "participants" }).workspace, "participants", "historical Hasil bookmarks keep their meaning");
assert.ok(parseMentorTryoutContext({ workspace: "operations", delivery: "participants", status: "unknown" }).issues.length);

// One Status replaces the separate registration, access and attempt filters.
assert.deepEqual(PARTICIPANT_STATUS_FILTERS, ["all", ...PARTICIPANT_STATUSES], "the dependency-free URL list mirrors the status source");
for (const status of ["all", ...PARTICIPANT_STATUSES]) {
  assert.deepEqual(parseMentorTryoutContext({ workspace: "operations", delivery: "participants", status }).issues, [], `${status} is a valid participant status`);
}
for (const retired of ["active", "submitted", "missing"]) {
  assert.ok(parseMentorTryoutContext({ workspace: "operations", delivery: "participants", status: retired }).issues.some((issue) => issue.field === "status"), `${retired} is no longer a participant status`);
}
const retiredAccess = parseMentorTryoutContext(new URLSearchParams("workspace=operations&delivery=participants&access=revoked"));
assert.equal("access" in retiredAccess, false, "the separate access filter is gone from the context");
assert.equal(buildMentorTryoutHref("owned-tryout", retiredAccess).includes("access"), false, "old access links are rewritten without it");
assert.deepEqual(
  [...PARTICIPANT_STATUSES].sort(),
  Object.keys(participantStatusLabels).sort(),
  "every participant status has a label",
);
assert.deepEqual(Object.keys(participantStatusTones).sort(), [...PARTICIPANT_STATUSES].sort(), "every participant status has a tone");

// The first matching stage wins: registration, then attempt, then session access.
const person = (overrides: { admission?: string; attempt?: string | null; assignment?: string | null; scoring?: string }) => ({
  admission: { status: overrides.admission ?? "active" },
  attempt: overrides.attempt ? { attemptState: overrides.attempt, scoringState: overrides.scoring ?? "pending" } : null,
  session: overrides.assignment ? { id: "main", assignmentStatus: overrides.assignment } : null,
}) as unknown as Parameters<typeof participantStatus>[0];
const statusOf = (overrides: Parameters<typeof person>[0]) => participantStatus(person(overrides));
assert.equal(statusOf({ admission: "pending" }), "pending");
assert.equal(statusOf({ admission: "rejected" }), "rejected");
assert.equal(statusOf({ admission: "revoked", attempt: "in_progress", assignment: "active" }), "revoked", "a revoked registration outranks any attempt");
assert.equal(statusOf({ admission: "pending", assignment: "active" }), "pending", "waiting for approval outranks access");
assert.equal(statusOf({}), "no_access", "approved without a session assignment");
assert.equal(statusOf({ assignment: "revoked" }), "revoked", "approved with removed access and no attempt");
assert.equal(statusOf({ assignment: "active" }), "not_started");
assert.equal(statusOf({ assignment: "active", attempt: "in_progress" }), "in_progress");
assert.equal(statusOf({ assignment: "active", attempt: "submitted" }), "finished");
assert.equal(statusOf({ assignment: "active", attempt: "auto_submitted" }), "finished");
assert.equal(statusOf({ assignment: "active", attempt: "submitted", scoring: "scored" }), "scored", "Dinilai is a submitted attempt that has been scored");
assert.equal(statusOf({ assignment: "active", attempt: "auto_submitted", scoring: "scored" }), "scored");
assert.equal(statusOf({ assignment: "active", attempt: "submitted", scoring: "review_required" }), "finished", "scoring that is not finished stays Selesai");
assert.equal(statusOf({ assignment: "active", attempt: "in_progress", scoring: "scored" }), "in_progress", "scoring never overrides an attempt that is still running");
assert.equal(statusOf({ assignment: "active", attempt: "expired" }), "expired");
assert.equal(statusOf({ assignment: "active", attempt: "abandoned" }), "abandoned");
assert.equal(statusOf({ assignment: "active", attempt: "void" }), "void");
assert.equal(statusOf({ attempt: "submitted", scoring: "scored" }), "scored", "an existing attempt keeps its result even if the main session has no assignment");
assert.equal(parseMentorTryoutContext({ workspace: "participants", delivery: "participants" }).workspace, "operations");
assert.equal(mentorParticipantIdentity({ fullName: "  Nabila  ", email: "nabila@vecalss.local" }).displayName, "Nabila");
assert.equal(mentorParticipantIdentity({ fullName: "", email: "second@vecalss.local" }).displayName, "second@vecalss.local");
const rows = Array.from({ length: 23 }, (_, index) => ({
  admission: { status: index === 0 ? "pending" : "active" },
  admissionId: `registration-${index}`,
  participant: { ...mentorParticipantIdentity({ fullName: "Nabila", email: `student${index}@vecalss.local` }) },
  session: index === 22 ? { id: "main", assignmentStatus: "revoked" } : null,
})) as unknown as TryoutOperationsView["participants"];
const view = { participants: rows } as Pick<TryoutOperationsView, "participants">;
assert.equal(queryTryoutParticipants(view, {}).pendingCount, 1);
assert.equal(queryTryoutParticipants(view, {}).status, "pending", "pending registrations open first by default");
assert.equal(queryTryoutParticipants(view, { q: "student1@" }).status, "all", "a search drops the implicit pending default");
assert.equal(queryTryoutParticipants(view, { status: "revoked" }).rows[0].admissionId, "registration-22", "an explicit status bypasses the implicit pending default");
assert.equal(queryTryoutParticipants(view, { status: "revoked" }).total, 1);
assert.equal(queryTryoutParticipants(view, { status: "no_access" }).total, 21, "approved students without a session assignment");
assert.equal(queryTryoutParticipants(view, { q: "student22@vecalss.local" }).rows[0].admissionId, "registration-22", "search includes the complete list, including same-name students beyond page one");
assert.equal(queryTryoutParticipants(view, { status: "all", page: 2 }).rows.length, 10);
assert.equal(queryTryoutParticipants(view, { status: "all", page: 3 }).rows.length, 3);
assert.equal(queryTryoutParticipants(view, { status: "all", q: "missing" }).total, 0);
assert.equal(await withTryoutRequestDeadline(Promise.resolve("saved"), 5), "saved");
await assert.rejects(withTryoutRequestDeadline(new Promise(() => {}), 5), /outcome unavailable/);
const cutoff = new Date("2026-10-11T08:00:00.000Z");
const eligible = { id: "session", assessmentReleaseId: "release", availableUntil: cutoff, status: "active" };
assert.equal(isTryoutAdmissionSessionAvailable(eligible, new Date(cutoff.getTime() - 1)), true);
assert.equal(isTryoutAdmissionSessionAvailable(eligible, cutoff), false);
assert.equal(isTryoutAdmissionSessionAvailable(eligible, new Date(cutoff.getTime() + 1)), false);
console.log("TA-01 participant navigation checks passed.");
