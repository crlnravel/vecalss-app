import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createParticipantActionRecovery, PARTICIPANT_ACTION_DEADLINE_MS, type ParticipantActionIntent, type ParticipantActionWriteReply, type ParticipantRecoverySnapshot } from "../lib/tryout/participant-action-recovery";
import { createParticipantRecoveryTransport, readParticipantRecovery } from "../lib/tryout/participant-recovery-transport";
import { serveParticipantRecoveryRequest } from "../lib/tryout/participant-recovery-http";
import type { SessionContext } from "../lib/auth/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function deadline() {
  const timers = new Set<() => void>();
  return { schedule: (callback: () => void, ms: number) => { assert.equal(ms, 15_000); timers.add(callback); return () => { timers.delete(callback); }; }, expire: () => { [...timers].forEach((callback) => callback()); } };
}
const absent: ParticipantRecoverySnapshot = { admission: null, assignment: null, attempt: null, canRetry: true, destination: null, message: "Belum tercatat saat diperiksa." };
const registered: ParticipantRecoverySnapshot = { ...absent, canRetry: false, admission: { id: "admission", status: "pending" }, destination: { kind: "detail" }, message: "Menunggu persetujuan." };
const started: ParticipantRecoverySnapshot = { ...registered, attempt: { id: "original", status: "in_progress", serverDeadlineAt: "2027-06-01T10:00:00.000Z", assessmentReleaseId: "release", assessmentReleaseNumber: 2, assessmentReleaseDigest: "digest" }, destination: { kind: "attempt", attemptId: "original", sessionId: "session", result: false } };
const registerIntent: ParticipantActionIntent = { kind: "register", tryoutId: "tryout", sessionId: "session", target: { universityId: "university", majorId: "major" } };
const startIntent: ParticipantActionIntent = { kind: "start", tryoutId: "tryout", sessionId: "session" };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const httpSession: SessionContext = { sessionId: "authenticated-session", expiresAt: new Date(Date.now() + 86_400_000), user: { id: "authenticated-student", email: "student@example.test", fullName: "Student", roles: ["student"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
const httpIntent: ParticipantActionIntent = { kind: "register", tryoutId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", target: { majorId: "retained-major", universityId: "retained-university" } };

for (const kind of ["register", "start"] as const) {
  const intent: ParticipantActionIntent = kind === "register" ? httpIntent : { kind, tryoutId: httpIntent.tryoutId, sessionId: httpIntent.sessionId! };
  const timer = deadline();
  const heldAction = deferred<never>();
  let writeHits = 0;
  let getHits = 0;
  let snapshot = absent;
  const fetcher = async (url: string, init: RequestInit) => {
    getHits++;
    assert.equal(init.method, "GET"); assert.equal(init.credentials, "same-origin"); assert.equal(init.cache, "no-store");
    assert.doesNotMatch(url, /major|university|studentId|target/, "the read request contains only pointer scope, never target or principal data");
    return serveParticipantRecoveryRequest(new Request(`https://vecalss.test${url}`, init), { getSession: async () => httpSession, read: async (_scope, studentId) => { assert.equal(studentId, httpSession.user.id); return snapshot; } });
  };
  const controller = createParticipantActionRecovery({ schedule: timer.schedule, ...createParticipantRecoveryTransport({ register: () => { writeHits++; return heldAction.promise; }, start: () => { writeHits++; return heldAction.promise; }, inspect: (request) => readParticipantRecovery(request, fetcher) }) });
  const pending = controller.submit(intent);
  await tick(); timer.expire(); await pending;
  await controller.inspect();
  assert.equal(getHits, 1, "ordinary recovery GET runs while the original Server Action remains unresolved");
  assert.equal(controller.getSnapshot().writePending, true);
  assert.equal(controller.getSnapshot().phase, "unknown", "an independent absent read still retains the unresolved write fence");
  assert.equal(await controller.retry(), null);
  snapshot = kind === "register" ? registered : started;
  await controller.inspect();
  assert.deepEqual(await controller.continue(), snapshot.destination, "independent GET can recover committed work with its mutation response still held");
  assert.equal(writeHits, 1);
  controller.dispose();
}

{
  let reads = 0;
  const query = `kind=register&tryoutId=${httpIntent.tryoutId}&sessionId=${httpIntent.sessionId}`;
  const request = (suffix = query, method = "GET") => new Request(`https://vecalss.test/api/tryout/recovery?${suffix}`, { method });
  const read = async () => { reads++; return absent; };
  for (const [session, expected] of [
    [null, 401],
    [{ ...httpSession, expiresAt: new Date(0) }, 401],
    [{ ...httpSession, user: { ...httpSession.user, roles: ["tutor"] } }, 403],
    [{ ...httpSession, user: { ...httpSession.user, mustChangePassword: true } }, 403],
    [{ ...httpSession, user: { ...httpSession.user, onboardingStatus: null } }, 403],
    [{ ...httpSession, user: { ...httpSession.user, onboardingStatus: "not_started" } }, 403],
    [{ ...httpSession, user: { ...httpSession.user, status: "locked" } }, 403],
  ] as Array<[SessionContext | null, number]>) {
    const response = await serveParticipantRecoveryRequest(request(), { getSession: async () => session, read });
    assert.equal(response.status, expected);
    assert.deepEqual(await response.json(), { ok: false });
    assert.match(response.headers.get("cache-control")!, /private, no-store/);
  }
  assert.equal(reads, 0, "public read authorization negatives never query participant receipts");
  for (const invalid of ["kind=wrong", "kind=start&tryoutId=invalid", `kind=start&tryoutId=${httpIntent.tryoutId}`, `${query}&sessionId=${httpIntent.sessionId}`, `${query}&studentId=someone-else`, `${query}&tryoutId=${httpIntent.tryoutId}`]) {
    const response = await serveParticipantRecoveryRequest(request(invalid), { getSession: async () => httpSession, read });
    assert.equal(response.status, 400, "malformed, duplicated or injected principal scope is rejected");
  }
  assert.equal((await serveParticipantRecoveryRequest(request(query, "POST"), { getSession: async () => httpSession, read })).status, 405);
  assert.equal(reads, 0);
  const owned = await serveParticipantRecoveryRequest(request(), { getSession: async () => httpSession, read: async (scope, studentId) => {
    assert.equal(studentId, httpSession.user.id);
    assert.deepEqual(scope, { kind: "register", tryoutId: httpIntent.tryoutId, sessionId: httpIntent.sessionId });
    return started;
  } });
  assert.equal(owned.status, 200); assert.equal(owned.headers.get("vary"), "Cookie");
  assert.deepEqual(await owned.json(), { ok: true, snapshot: started });
  const failed = await serveParticipantRecoveryRequest(request(), { getSession: async () => httpSession, read: async () => { throw new Error("DB unavailable"); } });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { ok: false }, "read failures expose no internal error or receipt");
  assert.deepEqual(await readParticipantRecovery(httpIntent, async () => new Response(null, { status: 401 })), { ok: false });
}

for (const intent of [registerIntent, startIntent]) {
  const timer = deadline();
  const original = deferred<ParticipantActionWriteReply>();
  let writes = 0;
  let reads = 0;
  let snapshot = absent;
  const recovery = createParticipantActionRecovery({ schedule: timer.schedule, write: async () => { writes++; return original.promise; }, read: async () => { reads++; return { ok: true, snapshot }; } });
  const pending = recovery.submit(intent);
  assert.equal(recovery.getSnapshot().phase, "writing");
  assert.equal(await recovery.submit(intent), null, "synchronous repeated activation is fenced");
  await tick();
  timer.expire();
  assert.equal(await pending, null);
  assert.equal(recovery.getSnapshot().phase, "unknown", "unresolved POST releases busy at the documented bound");
  assert.equal(PARTICIPANT_ACTION_DEADLINE_MS, 15_000);
  assert.equal(reads, 0, "no automatic inspection or replay");
  await recovery.inspect();
  assert.equal(recovery.getSnapshot().phase, "unknown", "absence is not rollback proof for an unresolved write");
  assert.equal(await recovery.retry(), null);
  assert.equal(writes, 1);
  original.resolve({ ok: true, destination: intent.kind === "register" ? { kind: "waiting", sessionId: "session" } : { kind: "attempt", attemptId: "original", sessionId: "session", result: false } });
  await tick();
  assert.equal(recovery.getSnapshot().phase, "unknown", "a late committed reply never navigates or resolves current intent");
  snapshot = intent.kind === "register" ? registered : started;
  await recovery.inspect();
  assert.equal(recovery.getSnapshot().phase, "recovered");
  assert.deepEqual(await recovery.continue(), snapshot.destination);
  assert.equal(writes, 1, "Continue reads the owned receipt without another write");
}

{
  const timer = deadline();
  let snapshot = absent;
  let writes = 0;
  const retained: ParticipantActionIntent[] = [];
  const recovery = createParticipantActionRecovery({ schedule: timer.schedule, write: async (intent) => { retained.push(intent); writes++; throw new Error("transport rejected while server may still run"); }, read: async () => ({ ok: true, snapshot }) });
  const submitted = { ...registerIntent, target: { universityId: "university", majorId: "major" } } as Extract<ParticipantActionIntent, { kind: "register" }>;
  await recovery.submit(submitted);
  submitted.target.majorId = "newer-choice";
  assert.equal(recovery.getSnapshot().phase, "unknown");
  assert.equal(await recovery.submit(submitted), null, "uncertainty forbids newer target writes");
  assert.equal(await recovery.retry(), null, "transport rejection alone never permits replay");
  await recovery.inspect();
  assert.equal(recovery.getSnapshot().phase, "retry");
  // The late original server write commits between the first read and replay.
  snapshot = registered;
  assert.equal(await recovery.retry(), null, "manual replay rechecks the server first");
  assert.equal(writes, 1);
  assert.equal(recovery.getSnapshot().phase, "recovered");
  assert.deepEqual(retained[0], registerIntent, "the submitted target is retained by value");
}

{
  let writes = 0;
  let reads = 0;
  const recovery = createParticipantActionRecovery({ write: async () => { writes++; return { ok: false, confirmedRefusal: false, message: "Unknown" }; }, read: async () => { reads++; return { ok: true, snapshot: absent }; } });
  await recovery.submit(registerIntent);
  await recovery.inspect();
  await recovery.retry();
  assert.equal(writes, 2, "one explicit same-intent retry after fresh inspection");
  assert.equal(reads, 2);
  assert.equal(recovery.getSnapshot().phase, "unknown");
}

{
  const timer = deadline();
  const slowRead = deferred<{ ok: true; snapshot: ParticipantRecoverySnapshot }>();
  let failRead = true;
  const recovery = createParticipantActionRecovery({ schedule: timer.schedule, write: async () => { throw new Error("offline"); }, read: async () => { if (failRead) throw new Error("read failed"); return slowRead.promise; } });
  await recovery.submit(startIntent);
  await recovery.inspect();
  assert.equal(recovery.getSnapshot().phase, "unknown");
  assert.equal(await recovery.retry(), null, "a failed read never enables a write");
  failRead = false;
  const inspecting = recovery.inspect();
  await tick(); timer.expire();
  assert.equal(await inspecting, null);
  assert.equal(recovery.getSnapshot().phase, "unknown", "inspection busy is bounded too");
  slowRead.resolve({ ok: true, snapshot: started });
  await tick();
  assert.equal(recovery.getSnapshot().phase, "unknown", "late read cannot change the current recovery screen");
}

{
  let reads = 0;
  let writes = 0;
  const recovery = createParticipantActionRecovery({ write: async () => { writes++; throw new Error("lost transport"); }, read: async () => ({ ok: true, snapshot: ++reads === 1 ? absent : { ...absent, canRetry: false, message: "Sesi sudah berakhir." } }) });
  await recovery.submit(startIntent);
  await recovery.inspect();
  assert.equal(recovery.getSnapshot().phase, "retry");
  await recovery.retry();
  assert.equal(writes, 1, "cutoff during uncertainty cannot resurrect Start eligibility");
  assert.equal(recovery.getSnapshot().phase, "blocked");
  assert.equal(reads, 2, "retry checks current authoritative eligibility rather than resetting the local clock");
}

{
  let refuse = true;
  const recovery = createParticipantActionRecovery({ write: async () => refuse ? { ok: false, confirmedRefusal: true, message: "Pendaftaran ditutup." } : { ok: true, destination: { kind: "detail" } }, read: async () => ({ ok: false }) });
  await recovery.submit(registerIntent);
  assert.equal(recovery.getSnapshot().phase, "refused");
  assert.equal(recovery.getSnapshot().intent, null, "only a confirmed transaction refusal releases the target");
  refuse = false;
  assert.deepEqual(await recovery.submit(registerIntent), { kind: "detail" });
}

for (const intent of [registerIntent, startIntent]) {
  const timer = deadline();
  const original = deferred<ParticipantActionWriteReply>();
  const newerWrite = deferred<ParticipantActionWriteReply>();
  const oldInspection = deferred<{ ok: true; snapshot: ParticipantRecoverySnapshot }>();
  let writes = 0;
  const recovery = createParticipantActionRecovery({ schedule: timer.schedule, write: () => ++writes === 1 ? original.promise : newerWrite.promise, read: () => oldInspection.promise });
  const first = recovery.submit(intent);
  await tick(); timer.expire(); await first;
  assert.equal(recovery.getSnapshot().intent?.kind, intent.kind);
  const inspection = recovery.inspect();
  await tick();
  original.resolve({ ok: false, confirmedRefusal: true, message: "Pilihan belum tersedia. Perbaiki pilihanmu." });
  await tick();
  assert.equal(recovery.getSnapshot().phase, "refused", "a matching late definitive refusal ends recovery");
  assert.equal(recovery.getSnapshot().intent, null, "late refusal releases both components' correction lock");
  assert.equal(await inspection, null, "the refusal invalidates any older in-flight inspection");
  const corrected: ParticipantActionIntent = intent.kind === "register" ? { ...intent, target: { ...intent.target, majorId: "corrected-major" } } : { ...intent, sessionId: "corrected-session" };
  const replacement = recovery.submit(corrected);
  oldInspection.resolve({ ok: true, snapshot: started });
  await tick();
  assert.deepEqual(recovery.getSnapshot().intent, corrected, "a stale inspection cannot overwrite a replacement intent");
  assert.equal(recovery.getSnapshot().phase, "writing");
  timer.expire(); await replacement;
  newerWrite.resolve({ ok: false, confirmedRefusal: false, message: "Transport lost" });
  await tick();
  assert.equal(recovery.getSnapshot().phase, "unknown", "late unknown rejection retains the new intent's safety fence");
  assert.deepEqual(recovery.getSnapshot().intent, corrected);
}

{
  const timer = deadline();
  const original = deferred<ParticipantActionWriteReply>();
  const recovery = createParticipantActionRecovery({ schedule: timer.schedule, write: () => original.promise, read: async () => ({ ok: false }) });
  let notifications = 0;
  recovery.subscribe(() => { notifications++; });
  const pending = recovery.submit(registerIntent);
  await tick(); timer.expire(); await pending;
  const beforeUnmount = recovery.getSnapshot();
  const beforeNotifications = notifications;
  recovery.dispose();
  original.resolve({ ok: false, confirmedRefusal: true, message: "Old refusal" });
  await tick();
  assert.equal(recovery.getSnapshot(), beforeUnmount, "a canceled/unmounted generation ignores a late known refusal");
  assert.equal(notifications, beforeNotifications);
}

{
  const original = deferred<ParticipantActionWriteReply>();
  const recovery = createParticipantActionRecovery({ write: () => original.promise, read: async () => ({ ok: false }) });
  const pending = recovery.submit(startIntent);
  recovery.dispose();
  original.resolve({ ok: true, destination: { kind: "attempt", attemptId: "old", sessionId: "session", result: false } });
  assert.equal(await pending, null, "unmounted components cannot navigate on late success");
}

{
  const terminal = { ...started, attempt: { ...started.attempt!, status: "submitted" }, destination: { kind: "attempt" as const, attemptId: "original", sessionId: "session", result: true } };
  let writes = 0;
  const recovery = createParticipantActionRecovery({ write: async () => { writes++; throw new Error("reply lost after commit"); }, read: async () => ({ ok: true, snapshot: terminal }) });
  await recovery.submit(startIntent);
  await recovery.inspect();
  assert.deepEqual(await recovery.continue(), terminal.destination, "terminal found attempt Continue uses the original result route");
  assert.equal(recovery.getSnapshot().snapshot?.attempt?.serverDeadlineAt, "2027-06-01T10:00:00.000Z");
  assert.equal(writes, 1);
}

// Execute the actual component handlers with the real transport/controller.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const [file, name, intent] of [["ParticipantTryoutEnrollmentPanel.tsx", "handleRegister", registerIntent], ["ParticipantWaitingRoomModule.tsx", "handleStart", startIntent]] as const) {
  const source = await readFile(new URL("../modules/tryout/" + file, import.meta.url), "utf8");
  const body = source.split(`const ${name} = async () => {`)[1].split("\n  };")[0];
  const timer = deadline();
  const held = deferred<{ ok: true; result: { state: string; status: string; deliverySessionId: string; attemptId: string } }>();
  const dispatched: unknown[] = [];
  const navigations: unknown[] = [];
  let independentReads = 0;
  const controller = createParticipantActionRecovery({ schedule: timer.schedule, ...createParticipantRecoveryTransport({ register: async (...args) => { dispatched.push(args); return held.promise; }, start: async (...args) => { dispatched.push(args); return held.promise; }, inspect: (request) => readParticipantRecovery(request, async () => { independentReads++; return Response.json({ ok: true, snapshot: absent }); }) }) });
  const context = { controller, university: { id: "university" }, major: { id: "major" }, tryoutId: "tryout", sessionId: "session", tryout: { id: "tryout" }, assignment: { id: "session" }, canStart: true, setMessage() {}, window: { location: { assign: (href: string) => navigations.push(href) } }, participantRecoveryHref: () => "confirmed-destination", returnToHref: "/tryout" };
  const handler = new AsyncFunction(...Object.keys(context), body);
  const first = handler(...Object.values(context));
  const repeated = handler(...Object.values(context));
  await tick(); timer.expire(); await first; await repeated;
  assert.equal(dispatched.length, 1, `${name} actually uses the controller's dispatch fence`);
  assert.equal(navigations.length, 0);
  await controller.inspect();
  assert.equal(independentReads, 1, `${name}'s actual controller independently inspects during the held Server Action`);
  assert.equal(controller.getSnapshot().writePending, true);
  held.resolve({ ok: true, result: { attemptId: "original", deliverySessionId: "session", state: "assigned", status: "active" } });
  await tick();
  assert.equal(navigations.length, 0, `${name} ignores delayed success navigation`);
  assert.deepEqual(controller.getSnapshot().intent, intent);
  if (name === "handleStart") {
    const blocked = { ...context, canStart: false };
    await handler(...Object.values(blocked));
    assert.equal(dispatched.length, 1, "future/cutoff/uncalibrated component eligibility forbids Start dispatch");
  }
  assert.match(source, /ParticipantActionRecoveryControls/, "both components expose explicit recovery");

  // The same actual handlers also consume delayed known refusals through the controller.
  const lateRefusal = deferred<{ ok: false; confirmedRefusal: boolean; message: string }>();
  const refusalController = createParticipantActionRecovery({ schedule: timer.schedule, ...createParticipantRecoveryTransport({ register: () => lateRefusal.promise, start: () => lateRefusal.promise, inspect: async () => ({ ok: false }) }) });
  const refusalContext = { ...context, controller: refusalController };
  const refusing = handler(...Object.values(refusalContext));
  await tick(); timer.expire(); await refusing;
  assert.equal(refusalController.getSnapshot().phase, "unknown");
  lateRefusal.resolve({ ok: false, confirmedRefusal: true, message: "Sesi tidak tersedia." });
  await tick();
  assert.equal(refusalController.getSnapshot().intent, null, `${name} releases its correction lock on a matching delayed known refusal`);
  assert.equal(navigations.length, 0);
}

const pendingTransport = createParticipantRecoveryTransport({ register: async () => ({ ok: true, result: { state: "pending_approval", status: "pending", deliverySessionId: null } }), start: async () => ({ ok: false, confirmedRefusal: true, message: "Closed" }), inspect: async () => ({ ok: false }) });
assert.deepEqual(await pendingTransport.write(registerIntent), { ok: true, destination: { kind: "detail" } }, "pending approval never navigates to an ungranted waiting room");
const [hookSource, routeSource] = await Promise.all([
  readFile(new URL("../modules/tryout/ParticipantStudentActionRecovery.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/tryout/recovery/route.ts", import.meta.url), "utf8"),
]);
assert.match(hookSource, /inspect: readParticipantRecovery/, "mounted components use the ordinary GET adapter");
assert.doesNotMatch(hookSource, /inspectParticipantTryoutAction/);
assert.match(routeSource, /serveParticipantRecoveryRequest\(request, \{ getSession: getReadOnlySessionContext, read: participantActionRecoveryState \}\)/, "the actual GET wires mutation-free authentication and the owned repository to the tested public boundary");
console.log("F-12 public controller, actual component handlers and transport recovery passed.");
