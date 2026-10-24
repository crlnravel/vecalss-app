import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { continueAfterTryoutSave, createTryoutSaveRequest, finishTryoutSave } from "../modules/mentor/tryout-save-request";
import { TryoutRequestDeadlineError, withTryoutRequestDeadline } from "../modules/mentor/tryout-request-recovery";
import { tryoutNavigationNeedsGuard } from "../modules/mentor/tryout-unsaved-navigation";

const gate = createTryoutSaveRequest<{ mode: string }, { id: string; mode: string }>();
let resolve!: (receipt: { id: string; mode: string }) => void;
let dispatches = 0;
const entered = { mode: "invitation_only" };
const original = gate.getOrStart(entered, () => {
  dispatches += 1;
  return new Promise((settle) => { resolve = settle; });
});
await assert.rejects(withTryoutRequestDeadline(original.response, 1), TryoutRequestDeadlineError);
const retried = gate.getOrStart({ mode: "open" }, () => {
  dispatches += 1;
  return Promise.resolve({ id: "duplicate", mode: "open" });
});
assert.equal(retried, original, "unknown response retry reuses original request");
assert.equal(retried.input, entered, "recovery cannot mark newly entered values saved with an older response");
assert.equal(dispatches, 1, "deadline does not cause duplicate create dispatch");
resolve({ id: "persisted-once", mode: "invitation_only" });
assert.deepEqual(await withTryoutRequestDeadline(retried.response), { id: "persisted-once", mode: "invitation_only" });
assert.equal(gate.getOrStart(entered, () => { throw new Error("duplicate after success"); }), original, "create receipt remains recoverable after late persistence");
gate.clear(original);
const refused = gate.getOrStart({ mode: "approval_required" }, () => Promise.resolve({ id: "refused", mode: "approval_required" }));
assert.notEqual(refused, original, "confirmed refusal/existing draft completion can release the gate");
// The server may commit while the response transport rejects. A rejected
// promise can never be inspected again, but must never release create identity.
const interrupted = createTryoutSaveRequest<{ mode: string }, { id: string }>();
let rejectResponse!: (error: Error) => void;
let committed = false;
let interruptedDispatches = 0;
const lost = interrupted.getOrStart(entered, () => {
  interruptedDispatches += 1;
  return new Promise((_, reject) => { rejectResponse = reject; });
});
const lostOutcome = assert.rejects(withTryoutRequestDeadline(lost.response), /connection lost/);
committed = true;
rejectResponse(new Error("connection lost after commit"));
await lostOutcome;
const blockedRetry = interrupted.getOrStart({ mode: "open" }, () => { interruptedDispatches += 1; return Promise.resolve({ id: "duplicate" }); });
assert.equal(blockedRetry, lost);
await assert.rejects(blockedRetry.response, /connection lost/);
assert(committed);
assert.equal(interruptedDispatches, 1, "transport rejection after commit blocks retry and autosave duplicate dispatch");

for (const isCreate of [false, true]) {
  const snapshotA = { mode: "approval_required" };
  const snapshotB = { mode: "invitation_only" };
  const flowGate = createTryoutSaveRequest<typeof snapshotA, { id: string }>();
  let lateReceipt!: (receipt: { id: string }) => void;
  const pendingA = flowGate.getOrStart(snapshotA, () => new Promise((resolve) => { lateReceipt = resolve; }));
  await assert.rejects(withTryoutRequestDeadline(pendingA.response, 1), TryoutRequestDeadlineError);
  const latest = snapshotB;
  let dirty = true;
  let identity: string | null = null;
  let departures = 0;
  const saveAndContinue = continueAfterTryoutSave(async () => {
    const recovered = flowGate.getOrStart(latest, () => { throw new Error("must recover A first"); });
    const receipt = await withTryoutRequestDeadline(recovered.response);
    if (!isCreate) flowGate.clear(recovered);
    return finishTryoutSave({ savedSnapshot: recovered.input, latestSnapshot: latest, receipt,
      onReceipt: (saved) => { identity = saved.id; },
      onLatestSaved: () => { dirty = false; },
      onCreateNavigate: isCreate ? () => { departures += 1; } : undefined,
    });
  }, () => { departures += 1; });
  lateReceipt({ id: isCreate ? "recovered-created-id" : "existing-id" });
  assert.equal(await saveAndContinue, false, "save-and-continue only accepts latest snapshot persistence");
  assert.equal(departures, 0, "neither create auto-navigation nor save-and-continue can discard B");
  assert.equal(latest, snapshotB);
  assert(dirty, "newer inputs remain dirty");
  assert.equal(identity, isCreate ? "recovered-created-id" : "existing-id", "receipt identity remains available while staying");
  if (!isCreate) {
    const next = flowGate.getOrStart(latest, async () => ({ id: "existing-id" }));
    assert.equal(next.input, snapshotB, "next existing-draft save persists newer inputs");
    assert(finishTryoutSave({ savedSnapshot: next.input, latestSnapshot: latest, receipt: await next.response, onReceipt: () => undefined, onLatestSaved: () => { dirty = false; } }));
    assert(!dirty);
  }
}
const builder = await readFile(new URL("../modules/mentor/KaptenTryoutBuilderPageModule.tsx", import.meta.url), "utf8");
assert(builder.includes("const latestSaved = finishTryoutSave({"));
assert(builder.includes('continueAfterTryoutSave(() => save("draft"),'));
assert(!builder.includes("saveError instanceof TryoutRequestDeadlineError)) saveRequestRef.current.clear"), "builder catch must retain unknown transport request");
assert(builder.includes('"outcomeUnknown" in result && result.outcomeUnknown'), "unknown server failures also retain identity rather than acting as definitive refusal");
const actions = await readFile(new URL("../modules/mentor/tryout-actions.ts", import.meta.url), "utf8");
assert(actions.includes("outcomeUnknown: true as const"));
assert(actions.includes("Cache invalidation failure cannot turn committed persistence into refusal"));
const navigation = { button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, dirty: true, currentHref: "http://localhost:5023/mentor/tryout/owned?workspace=operations&delivery=policy", destinationHref: "" };
for (const destinationHref of ["?workspace=operations&delivery=sessions", "?workspace=operations&delivery=participants", "?workspace=participants", "?workspace=sections", "/mentor/tryout"]) assert(tryoutNavigationNeedsGuard({ ...navigation, destinationHref }), "operation/primary/parent links protect unsaved mode and reason");
assert(!tryoutNavigationNeedsGuard({ ...navigation, destinationHref: navigation.currentHref }));
assert(!tryoutNavigationNeedsGuard({ ...navigation, destinationHref: "/mentor/tryout", dirty: false }));
assert(!tryoutNavigationNeedsGuard({ ...navigation, destinationHref: "/mentor/tryout", metaKey: true }));
assert(!tryoutNavigationNeedsGuard({ ...navigation, destinationHref: "/mentor/tryout", opensElsewhere: true }));
assert(tryoutNavigationNeedsGuard({ ...navigation, destinationHref: "?workspace=participants" }), "failed save leaves the dirty navigation protection active");
console.log("TA-02 recovery/navigation passed: bounded wait, late receipt, rejected response after commit without duplicate dispatch, create/existing A→B save-and-continue stays dirty with identity, latest existing save, builder caller wiring, operation/primary link guard and clean/new-tab exceptions.");
