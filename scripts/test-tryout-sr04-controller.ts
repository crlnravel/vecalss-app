import assert from "node:assert/strict";
import { createTryoutPublicationRecovery, type TryoutPublicationReply } from "../lib/tryout/result-publication-recovery";
import type { TryoutSessionReadiness } from "../lib/tryout/result-readiness";

const scope = { tryoutId: "33333333-3333-4333-8333-333333333333", sessionId: "22222222-2222-4222-8222-222222222222" };
const receipt = { ...scope, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", releasedAt: "2026-10-18T00:00:00.000Z", actorId: "owner", actorName: "Kapten", reason: "Semua hasil sudah diperiksa.", participantCount: 2 };
const snapshot: TryoutSessionReadiness = { scope, sessionName: "Sesi utama", availableUntil: receipt.releasedAt, serverNow: receipt.releasedAt, effectivePolicy: "manual", inherited: true, ready: true, counts: { attempts: 2, candidates: 2, ready: 2, blocked: 0, excluded: 0, void: 0, abandoned: 0, noAttempt: 0 }, blockers: [], publication: { ...receipt, receipt }, policy: { baseline: { auditCount: 0, policy: "manual" }, value: "manual", editable: false, reason: "Terkunci", receipt: null, sessions: [] } };
const tick = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { resolve, promise }; }
function clock() { const timers = new Set<() => void>(); return { schedule: (callback: () => void, ms: number) => { assert.equal(ms, 15000); timers.add(callback); return () => { timers.delete(callback); }; }, expire: () => [...timers].forEach((callback) => callback()) }; }

// The public recovery controller must resolve a held action through a separate read.
const timer = clock(); const held = deferred<TryoutPublicationReply>(); let writes = 0; let reads = 0;
const controller = createTryoutPublicationRecovery({ schedule: timer.schedule, write: () => { writes++; return held.promise; }, read: async (requested) => { reads++; assert.deepEqual(requested, scope); return { ok: true, snapshot }; } });
controller.activate();
const pending = controller.submit({ ...scope, reason: receipt.reason });
await tick(); await controller.submit({ ...scope, reason: "Double click" }); assert.equal(writes, 1);
timer.expire(); await pending; assert.equal(controller.getSnapshot().phase, "unknown");
await controller.inspect(); assert.equal(reads, 1); assert.equal(controller.getSnapshot().phase, "saved"); assert.deepEqual(controller.getSnapshot().receipt, receipt); assert.equal(controller.getSnapshot().writePending, false);
held.resolve({ ok: false, confirmedRefusal: true, message: "Obsolete refusal" }); await tick(); assert.equal(controller.getSnapshot().phase, "saved");
controller.dispose();
console.log("PASS held publication action, bounded wait, one dispatch, independent receipt inspection and obsolete refusal fence");

{
  const timer = clock(); const late = deferred<TryoutPublicationReply>();
  const inspected = { ...snapshot, publication: null }; let readFails = false; let writes = 0;
  const c = createTryoutPublicationRecovery({ schedule: timer.schedule, write: () => { writes++; return writes === 1 ? late.promise : Promise.resolve({ ok: true, receipt }); }, read: async () => readFails ? { ok: false } : { ok: true, snapshot: inspected } }); c.activate();
  const first = c.submit({ ...scope, reason: receipt.reason }); await tick(); timer.expire(); await first;
  await c.inspect(); assert.equal(c.getSnapshot().phase, "unknown"); assert.equal(c.getSnapshot().writePending, true);
  await c.replay(); assert.equal(writes, 1, "An unresolved transport cannot be replayed");
  readFails = true; await c.inspect(); assert.equal(c.getSnapshot().phase, "unknown");
  late.resolve({ ok: false, confirmedRefusal: true, message: "Sesi belum selesai." }); await tick(); assert.equal(c.getSnapshot().phase, "refused"); assert.equal(c.getSnapshot().intent, null);
  await c.submit({ ...scope, reason: "Alasan yang diperbaiki." }); assert.equal(c.getSnapshot().phase, "saved"); assert.equal(writes, 2); c.dispose();
}
{
  const timer = clock(); let writes = 0; let reads = 0;
  const c = createTryoutPublicationRecovery({ schedule: timer.schedule, write: async () => { writes++; if (writes === 1) throw new Error("Lost response"); return { ok: true, receipt }; }, read: async () => { reads++; return { ok: true, snapshot: { ...snapshot, publication: null } }; } }); c.activate();
  await c.submit({ ...scope, reason: receipt.reason }); assert.equal(c.getSnapshot().phase, "unknown"); await c.replay(); assert.equal(writes, 1);
  await c.inspect(); assert.equal(c.getSnapshot().phase, "retry"); await c.replay(); assert.equal(writes, 2); assert.equal(reads, 2); assert.equal(c.getSnapshot().phase, "saved"); c.dispose();
}
{
  const timer = clock(); const heldRead = deferred<{ ok: true; snapshot: TryoutSessionReadiness }>();
  const c = createTryoutPublicationRecovery({ schedule: timer.schedule, write: async () => { throw new Error("Offline"); }, read: () => heldRead.promise }); c.activate();
  await c.submit({ ...scope, reason: receipt.reason }); const inspection = c.inspect(); await tick(); timer.expire(); await inspection; assert.equal(c.getSnapshot().phase, "unknown");
  c.dispose(); heldRead.resolve({ ok: true, snapshot }); await tick(); assert.equal(c.getSnapshot().phase, "unknown");
}
{
  const c = createTryoutPublicationRecovery({ write: async () => ({ ok: true, receipt: { ...receipt, sessionId: "foreign" } }), read: async () => ({ ok: true, snapshot: { ...snapshot, scope: { ...scope, tryoutId: "foreign" } } }) }); c.activate();
  await c.submit({ ...scope, reason: receipt.reason }); assert.equal(c.getSnapshot().phase, "unknown"); await c.inspect(); assert.equal(c.getSnapshot().phase, "unknown"); c.dispose();
}
console.log("PASS delayed refusal correction, no unresolved replay, explicit same-intent replay, independent read timeout/failure and cross-scope/unmount fences");
