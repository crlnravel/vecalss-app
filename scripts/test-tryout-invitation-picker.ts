import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [picker, operations, actions, page, ui, packageJson] = await Promise.all([
  readFile(new URL("../lib/tryout/invitation-picker.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/operations-view.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutParticipantsPageModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/mentor/KaptenTryoutInvitationPicker.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const ownerCheck = picker.indexOf("async function assertOwnedTryout");
const studentRead = picker.indexOf("await prisma.user.findMany");
assert.ok(ownerCheck >= 0, "the selector must have an explicit owner check");
assert.ok(studentRead > ownerCheck, "the student read must follow the owner check");
assert.match(picker, /createdByUserId: actorId/u);
assert.match(picker, /status: UserStatus\.active/u);
assert.match(picker, /softDeletedAt: null/u);
assert.match(picker, /previewPurpose: null/u);
assert.match(picker, /role: RoleName\.student/u);
assert.match(picker, /revokedAt: null/u);
assert.match(picker, /studentProfile:\s*\{\s*is:/u);
assert.match(picker, /displayName:\s*\{ contains: normalizedQuery, mode: "insensitive" \}/u);
assert.match(picker, /displayName: displayName \|\| "Siswa tanpa nama"/u);
assert.doesNotMatch(picker, /\bemail\b/u, "selector rows must not expose email");
assert.doesNotMatch(picker, /\bfullName\b/u, "selector rows must not expose raw account metadata");

assert.match(actions, /searchTryoutInvitationStudentsAction/u);
assert.match(actions, /searchTryoutInvitationStudents\(tryoutId, session\.user\.id, query\)/u);
assert.match(actions, /refreshTryoutParticipantsAction/u);
assert.match(actions, /getOwnedTryoutParticipantsView\(tryoutId, session\.user\.id\)/u);
assert.match(actions, /inviteTryoutParticipant\(tryoutId, studentId, session\.user\.id, reason, session\.user\.roles\.includes\(RoleName\.admin\), selectedSessionId\)/u);
assert.match(actions, /revalidatePath\(`\/mentor\/tryout\/\$\{tryoutId\}`\)/u);

const narrowRefresh = operations.indexOf("async function getOwnedTryoutParticipantsView");
assert.ok(narrowRefresh >= 0, "the refresh boundary must exist");
const narrowRefreshSource = operations.slice(narrowRefresh, operations.indexOf("export {", narrowRefresh));
assert.match(narrowRefreshSource, /const workspaceView = toTryoutWorkspaceView\(view\)/u, "refresh must apply the workspace sanitizer");
assert.match(narrowRefreshSource, /participants: workspaceView\.participants/u);
assert.match(narrowRefreshSource, /sessions: workspaceView\.sessions/u);
assert.doesNotMatch(narrowRefreshSource, /participants: view\.participants/u, "refresh must not return raw participants");
assert.doesNotMatch(narrowRefreshSource, /sessions: view\.sessions/u, "refresh must not return raw session attempts");
assert.doesNotMatch(narrowRefreshSource, /results:|attempts:/u, "refresh DTO must stay focused");

assert.match(page, /KaptenTryoutInvitationPicker/u);
assert.match(page, /initial\.admissionMode === "open"/u, "open admission should bypass invitation entry");
assert.match(page, /Semua peserta dapat bergabung/u, "open admission should explain that every participant can join");
assert.match(page, /setParticipants\(view\.participants\)/u);
assert.match(page, /setSessions\(view\.sessions\)/u);
assert.match(ui, /searchTryoutInvitationStudentsAction/u);
assert.match(ui, /refreshTryoutParticipantsAction/u);
assert.match(ui, /inviteTryoutParticipantAction/u);
assert.match(ui, /selectedSessionId/u);
assert.match(ui, /effectiveSelectedSessionId/u);
assert.match(ui, /Alasan audit/u);
assert.match(ui, /aria-autocomplete="list"/u);
assert.match(ui, /aria-expanded=\{students\.length > 0\}/u);
assert.match(ui, /role="combobox"/u);
assert.match(ui, /role="listbox"/u);
assert.match(ui, /role="option"/u);
assert.match(ui, /aria-activedescendant/u);
assert.match(ui, /min-h-11/u);
assert.match(ui, /aria-required="true"/u);
assert.match(ui, /required\s+value=\{reason\}/u);
assert.match(ui, /searchRequestRef\.current \+= 1;\s*setStudents\(\[\]\);\s*setActiveIndex\(-1\)/u, "submit must invalidate stale picker results");
assert.match(ui, /if \(busy\) return;/u, "busy picker must ignore late selection callbacks");
assert.match(ui, /Muat ulang halaman/u);
assert.doesNotMatch(ui, /\bemail\b/u, "picker UI must not render email");
assert.doesNotMatch(ui, /\bfullName\b/u, "picker UI must not render raw account metadata");

assert.match(packageJson, /"test:tryout-invitation-picker"/u);

console.log("Tryout invitation picker contracts passed.");
