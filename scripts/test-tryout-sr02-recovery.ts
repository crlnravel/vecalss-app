import assert from "node:assert/strict";
import { act, createElement, useLayoutEffect } from "react";
import { createTryoutCalculationRecovery, readTryoutCalculation, type TryoutCalculationIntent, type TryoutCalculationReply, type TryoutResultRecoverySnapshot, type TryoutResultRecoveryScope } from "../lib/tryout/result-recovery";
import { serveTryoutCalculationInspection } from "../lib/tryout/result-recovery-http";
import { useTryoutCalculationRecovery } from "../modules/mentor/use-tryout-calculation-recovery";
import { withReactDomTest } from "./react-dom-test-host";
import type { SessionContext } from "../lib/auth/types";

const scope: TryoutResultRecoveryScope = { attemptId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", tryoutId: "33333333-3333-4333-8333-333333333333" };
const receipt = { id: "receipt", calculatedAt: "2026-10-17T10:00:00Z", reason: "Retained reason" };
const ready: TryoutResultRecoverySnapshot = { scope, state: "ready", message: "Ready", receipt: null, finalScore: null, sections: [] };
const saved: TryoutResultRecoverySnapshot = { ...ready, state: "calculated", receipt, finalScore: 10 };
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function deadlines() {
  const timers = new Set<() => void>();
  return { schedule: (callback: () => void, ms: number) => { assert.equal(ms, 15000); timers.add(callback); return () => { timers.delete(callback); }; }, expire: () => { [...timers].forEach((callback) => callback()); } };
}
const session: SessionContext = { sessionId: "authenticated", expiresAt: new Date(Date.now() + 100000), user: { id: "owner", email: "tutor@example.test", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
const url = `http://localhost/api/mentor/tryout/result-recovery?${new URLSearchParams(scope)}`;
{
  let reads = 0;
  for (const [user, status] of [[null, 401], [{ ...session, expiresAt: new Date(0) }, 401], [{ ...session, user: { ...session.user, roles: ["student"] } }, 403], [{ ...session, user: { ...session.user, status: "locked" } }, 403], [{ ...session, user: { ...session.user, mustChangePassword: true } }, 403]] as Array<[SessionContext | null, number]>) {
    const response = await serveTryoutCalculationInspection(new Request(url), { getSession: async () => user, read: async () => { reads++; return saved; } });
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { ok: false }); assert.match(response.headers.get("cache-control")!, /private, no-store/);
  }
  for (const suffix of ["&studentId=foreign", "&sessionId=duplicate", "&reason=secret"]) assert.equal((await serveTryoutCalculationInspection(new Request(url + suffix), { getSession: async () => session, read: async () => { reads++; return saved; } })).status, 400);
  assert.equal(reads, 0);
  const foreign = await serveTryoutCalculationInspection(new Request(url), { getSession: async () => session, read: async (request, owner, crossOwner) => { assert.deepEqual(request, scope); assert.equal(owner, "owner"); assert.equal(crossOwner, false); return null; } });
  assert.equal(foreign.status, 404); assert.deepEqual(await foreign.json(), { ok: false });
  assert.equal((await serveTryoutCalculationInspection(new Request(url, { method: "POST" }), { getSession: async () => session, read: async () => saved })).status, 405);
  const failure = await serveTryoutCalculationInspection(new Request(url), { getSession: async () => session, read: async () => { throw new Error("Private data"); } });
  assert.equal(failure.status, 503); assert.deepEqual(await failure.json(), { ok: false });
}
{
  const clock = deadlines(); const held = deferred<TryoutCalculationReply>(); let writes = 0; let gets = 0; let snapshot = ready;
  const c = createTryoutCalculationRecovery({ schedule: clock.schedule, write: () => { writes++; return held.promise; }, read: (request) => readTryoutCalculation(request, async (input, init) => {
    gets++; assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
    assert.doesNotMatch(String(input), /reason|studentId/);
    return serveTryoutCalculationInspection(new Request(`http://localhost${input}`, init), { getSession: async () => session, read: async () => snapshot });
  }) });
  c.activate(); const entered = { ...scope, reason: "Retained reason" }; const write = c.submit(entered); await c.submit({ ...entered, reason: "Duplicate" }); entered.reason = "New input";
  await tick(); assert.equal(writes, 1); clock.expire(); await write;
  assert.equal(c.getSnapshot().phase, "unknown"); assert.equal(c.getSnapshot().intent?.reason, "Retained reason");
  await c.inspect(); assert.equal(gets, 1); assert.equal(c.getSnapshot().phase, "unknown"); assert(c.getSnapshot().writePending); await c.replay(); assert.equal(writes, 1);
  snapshot = saved; await c.inspect(); assert.equal(c.getSnapshot().phase, "saved"); assert.deepEqual(c.getSnapshot().receipt, receipt); assert.equal(writes, 1);
  c.dispose(); held.resolve({ ok: true, receipt }); await tick();
}
{
  const clock = deadlines(); const held = deferred<TryoutCalculationReply>(); const read = deferred<{ ok: true; snapshot: TryoutResultRecoverySnapshot }>();
  const c = createTryoutCalculationRecovery({ schedule: clock.schedule, write: () => held.promise, read: () => read.promise }); c.activate();
  const writing = c.submit({ ...scope, reason: "Correctable" }); await tick(); clock.expire(); await writing;
  const inspection = c.inspect(); await tick(); held.resolve({ ok: false, confirmedRefusal: true, message: "Known refusal" }); await tick();
  assert.equal(c.getSnapshot().phase, "refused"); assert.equal(c.getSnapshot().intent, null);
  read.resolve({ ok: true, snapshot: ready }); await inspection; assert.equal(c.getSnapshot().phase, "refused"); c.dispose();
}
{
  const clock = deadlines(); let writes = 0; const intents: string[] = [];
  const c = createTryoutCalculationRecovery({ schedule: clock.schedule, write: async (intent) => { writes++; intents.push(intent.reason); if (writes === 1) throw new Error("Lost after commit"); return { ok: true, receipt }; }, read: async () => ({ ok: true, snapshot: ready }) }); c.activate();
  await c.submit({ ...scope, reason: "Original retained input" }); assert.equal(c.getSnapshot().phase, "unknown");
  await c.submit({ ...scope, reason: "Must not replace" }); assert.equal(writes, 1);
  await c.inspect(); assert.equal(c.getSnapshot().phase, "retry"); await c.replay(); assert.equal(writes, 2); assert.deepEqual(intents, ["Original retained input", "Original retained input"]); c.dispose();
}
{
  const clock = deadlines(); const c = createTryoutCalculationRecovery({ schedule: clock.schedule, write: async () => { throw new Error("offline"); }, read: () => new Promise(() => {}) }); c.activate();
  await c.submit({ ...scope, reason: "Keep reason" }); const pending = c.inspect(); await tick(); clock.expire(); await pending;
  assert.equal(c.getSnapshot().phase, "unknown"); assert.equal(c.getSnapshot().intent?.reason, "Keep reason"); c.dispose();
}
console.log("PASS SR02 controller/HTTP: auth/scope/no disclosure, synchronous fence, 15s write/read bounds, independently dispatched GET, held/late/lost outcomes, known correction and same-intent manual replay");

type Flow = ReturnType<typeof useTryoutCalculationRecovery>;
await withReactDomTest(async (root, render) => {
  const timers = new Map<number, () => void>(); let timerId = 0;
  const nativeSet = globalThis.setTimeout; const nativeClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback: () => void, ms: number) => { assert.equal(ms, 15000); const id = ++timerId; timers.set(id, callback); return id; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as unknown as typeof clearTimeout;
  let flow!: Flow; const held = deferred<TryoutCalculationReply>(); const notices: string[] = []; let refreshes = 0; let writes = 0; let readHits = 0; let snapshot = ready;
  const submitted: TryoutCalculationIntent[] = [];
  const write = (intent: TryoutCalculationIntent) => { writes++; submitted.push(intent); return held.promise; };
  const read = async () => { readHits++; return { ok: true as const, snapshot }; };
  const refresh = () => { refreshes++; throw new Error("Refresh failed after persistence"); };
  const notify = (message: string) => { notices.push(message); };
  function Harness({ selected, onCommit }: { selected: TryoutResultRecoveryScope; onCommit?: () => void }) {
    flow = useTryoutCalculationRecovery({ scope: selected, write, read, refresh, notify });
    useLayoutEffect(() => { onCommit?.(); }, [onCommit]);
    return createElement("p", null, `${selected.attemptId}:${flow.state.phase}:${flow.refreshFailed}`);
  }
  try {
    await render(createElement(Harness, { selected: scope }));
    const retainedSubmit = flow.submit; let pending!: Promise<void>;
    await act(async () => { pending = flow.submit("Mounted retained reason"); await tick(); });
    await act(async () => { void retainedSubmit("Duplicate"); }); assert.equal(writes, 1);
    await act(async () => { [...timers.values()].forEach((callback) => callback()); await pending; });
    assert.match(root.textContent, /unknown/); assert.equal(flow.state.intent?.reason, "Mounted retained reason");
    await act(async () => { await flow.inspect(); }); assert.equal(readHits, 1); assert.equal(flow.state.phase, "unknown"); assert.equal(writes, 1);
    snapshot = saved;
    await act(async () => { await flow.inspect(); }); assert.equal(flow.state.phase, "saved"); assert(flow.refreshFailed); assert.equal(refreshes, 1); assert(notices.some((notice) => notice.includes("Skor sudah tersimpan, tetapi")));
    const oldInspect = flow.inspect; const oldReload = flow.reload;
    const replacement = { attemptId: "44444444-4444-4444-8444-444444444444", sessionId: "55555555-5555-4555-8555-555555555555", tryoutId: "66666666-6666-4666-8666-666666666666" };
    await render(createElement(Harness, { selected: replacement, onCommit: () => { void oldInspect(); void oldReload(); void retainedSubmit("Old callback"); held.resolve({ ok: true, receipt }); } }));
    await act(tick); assert.equal(flow.state.phase, "idle"); assert.equal(flow.refreshFailed, false); assert.equal(writes, 1); assert.equal(refreshes, 1); assert.equal(readHits, 2);
    await act(async () => { await flow.submit("Replacement scope reason"); });
    assert.equal(writes, 2); assert.deepEqual(submitted[1], { ...replacement, reason: "Replacement scope reason" }, "Memoized replacement controller owns and submits its committed scope IDs");
    assert.deepEqual(submitted[0], { ...scope, reason: "Mounted retained reason" }, "Replacement never mutates the original retained scope");
    const oldNewSubmit = flow.submit; const countNotices = notices.length;
    await render(null); await act(async () => { await oldNewSubmit("Unmounted callback"); });
    assert.equal(writes, 2); assert.equal(notices.length, countNotices);
  } finally { globalThis.setTimeout = nativeSet; globalThis.clearTimeout = nativeClear; }
});
console.log("PASS actual mounted SR02 hook: held write, independent read, persisted/refresh failure, commit-time replacement, retained callbacks and unmount guards");
