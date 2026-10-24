import assert from "node:assert/strict";
import { buildMentorTryoutHref, parseMentorTryoutContext } from "../lib/navigation/canonical-context";
import { mentorParticipantIdentity } from "../lib/tryout/mentor-participant-identity";
import { queryTryoutParticipants } from "../lib/tryout/participant-list";
import type { TryoutOperationsView } from "../lib/tryout/operations-view";
import { withTryoutRequestDeadline } from "../modules/mentor/tryout-request-recovery";
import { isTryoutAdmissionSessionAvailable } from "../lib/tryout/registration-availability";

const list = parseMentorTryoutContext(new URLSearchParams("workspace=operations&delivery=participants&q=Nabila&status=pending&access=revoked&page=2"));
assert.deepEqual(list.issues, [], "registration management belongs to Operasional");
assert.equal(list.workspace, "operations");
assert.equal(list.delivery, "participants");
assert.equal(buildMentorTryoutHref("owned-tryout", list), "/mentor/tryout/owned-tryout?workspace=operations&delivery=participants&q=Nabila&status=pending&access=revoked&page=2");
assert.equal(parseMentorTryoutContext({ workspace: "participants" }).workspace, "participants", "historical Hasil bookmarks keep their meaning");
assert.ok(parseMentorTryoutContext({ workspace: "operations", delivery: "participants", access: "unknown" }).issues.length);
assert.equal(parseMentorTryoutContext({ workspace: "participants", delivery: "participants" }).workspace, "operations");
assert.equal(mentorParticipantIdentity({ fullName: "  Nabila  ", email: "nabila@vecalss.local" }).displayName, "Nabila");
assert.equal(mentorParticipantIdentity({ fullName: "", email: "second@vecalss.local" }).displayName, "second@vecalss.local");
const rows = Array.from({ length: 23 }, (_, index) => ({
  admission: { status: index === 0 ? "pending" : "active" },
  admissionId: `registration-${index}`,
  participant: { ...mentorParticipantIdentity({ fullName: "Nabila", email: `student${index}@vecalss.local` }) },
  sessions: index === 22 ? [{ id: "main", assignmentStatus: "revoked" }] : [],
})) as TryoutOperationsView["participants"];
const view = { participants: rows, sessions: [{ id: "main", isDefaultOpenRegistration: true }] } as Pick<TryoutOperationsView, "participants" | "sessions">;
assert.equal(queryTryoutParticipants(view, {}).pendingCount, 1);
assert.equal(queryTryoutParticipants(view, { access: "revoked" }).rows[0].admissionId, "registration-22", "access filter bypasses only the implicit pending default");
assert.equal(queryTryoutParticipants(view, { q: "student22@vecalss.local" }).rows[0].admissionId, "registration-22", "search includes the complete list, including same-name students beyond page one");
assert.equal(queryTryoutParticipants(view, { status: "all", page: 2 }).rows.length, 10);
assert.equal(queryTryoutParticipants(view, { status: "all", page: 3 }).rows.length, 3);
assert.equal(queryTryoutParticipants(view, { status: "all", q: "missing" }).total, 0);
assert.equal(await withTryoutRequestDeadline(Promise.resolve("saved"), 5), "saved");
await assert.rejects(withTryoutRequestDeadline(new Promise(() => {}), 5), /outcome unavailable/);
const cutoff = new Date("2026-10-11T08:00:00.000Z");
const eligible = { id: "session", assessmentReleaseId: "release", isDefaultOpenRegistration: true, availableUntil: cutoff, status: "active" };
assert.equal(isTryoutAdmissionSessionAvailable(eligible, new Date(cutoff.getTime() - 1)), true);
assert.equal(isTryoutAdmissionSessionAvailable(eligible, cutoff), false);
assert.equal(isTryoutAdmissionSessionAvailable(eligible, new Date(cutoff.getTime() + 1)), false);
console.log("TA-01 participant navigation checks passed.");
