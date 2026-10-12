import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { invitationIntent, invitationSearchReducer, initialInvitationSearch } from "../lib/tryout/invitation-state";
import type { InvitationPickerStudent } from "../lib/tryout/invitation-picker";
import { performTryoutAccess } from "../modules/mentor/tryout-access-request";

const first: InvitationPickerStudent = { id: "first", displayName: "Nabila", email: "first@vecalss.local", admission: null };
const second = { ...first, id: "second", email: "second@vecalss.local" };
let state = invitationSearchReducer(initialInvitationSearch, { type: "query", query: "Nabila", generation: 1 });
state = invitationSearchReducer(state, { type: "result", generation: 1, students: [first, second] });
state = invitationSearchReducer(state, { type: "choose", id: second.id, generation: 2 });
assert.equal(state.selected?.email, "second@vecalss.local", "same-name choice retains exact distinguishing email");
assert.equal(invitationSearchReducer(state, { type: "result", generation: 1, students: [first] }), state, "late search cannot replace a chosen identity");
state = invitationSearchReducer(state, { type: "query", query: "first", generation: 3 });
assert.equal(state.selected, null, "editing the query immediately clears consequential selection");
assert.equal(state.students.length, 0, "old options disappear before the debounce");
assert.equal(invitationSearchReducer(state, { type: "result", generation: 1, students: [second] }), state);
assert.equal(invitationIntent(first, "main"), "invite");
const registered = (status: "pending" | "active" | "rejected" | "revoked", assignmentStatus?: "active" | "revoked"): InvitationPickerStudent => ({ ...first, admission: { id: "registration", status, assignment: assignmentStatus ? { id: "assignment", deliverySessionId: "main", status: assignmentStatus } : null } });
assert.equal(invitationIntent(registered("pending"), "main"), "review");
assert.equal(invitationIntent(registered("active", "active"), "main"), "active");
assert.equal(invitationIntent(registered("active", "revoked"), "main"), "restore");
assert.equal(invitationIntent(registered("active"), "main"), "invite", "active registration without assignment still requires grant");
assert.equal(invitationIntent(registered("rejected"), "main"), "restore");
assert.equal(invitationIntent(registered("revoked"), "main"), "restore");
const saved = { ok: true as const, result: { assignmentId: "stable" } };
for (const refresh of [async () => ({ ok: false as const, message: "read failed" }), async () => { throw new Error("read transport failed"); }, () => new Promise<never>(() => {})]) {
  const outcome = await performTryoutAccess(async () => saved, refresh, 5);
  assert.equal(outcome.state, "saved", "failed/thrown/hung read never changes successful grant into refusal");
  if (outcome.state === "saved") { assert.equal(outcome.receipt.assignmentId, "stable"); assert.equal(outcome.view, null); }
}
let reads = 0;
assert.equal((await performTryoutAccess(async () => ({ ok: false, message: "reason required" }), async () => { reads += 1; return saved; })).state, "refused");
assert.equal(reads, 0);
assert.equal((await performTryoutAccess(async () => { throw new Error("response lost after commit"); }, async () => saved)).state, "unknown");
assert.equal((await performTryoutAccess(() => new Promise<never>(() => {}), async () => saved, 5)).state, "unknown", "bounded busy preserves unknown write outcome");
const [ui, list, actions, operations] = await Promise.all([
  readFile(new URL("../modules/mentor/KaptenTryoutInvitationPicker.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutRegistrationListPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/operations-view.ts", import.meta.url), "utf8"),
]);
assert(list.includes("<KaptenTryoutInvitationPicker"), "normal participant navigation mounts the picker");
assert(ui.includes("performTryoutAccess(") && ui.includes("invitationSearchReducer"), "tested behavior is used by the real picker");
assert(ui.includes('role="combobox"') && ui.includes('role="listbox"') && ui.includes('role="option"'));
assert(ui.includes("student.email") && ui.includes("search.selected?.email"), "approved identity is visible in search and confirmation");
assert(actions.includes("A cache/read failure cannot turn a committed invitation into refusal"));
const narrow = operations.slice(operations.indexOf("async function getOwnedTryoutParticipantsView"));
assert(narrow.includes("toTryoutWorkspaceView(view)") && narrow.includes("participants: workspaceView.participants"), "invitation refresh uses the sanitized projection");
console.log("TA-03 picker behavior passed: same-name selection, immediate query invalidation, stale responses, explicit access intent, bounded command/read recovery and real caller/privacy wiring.");
