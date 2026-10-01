import assert from "node:assert/strict";

import { createPageStatusToastController } from "@/components/ui/page-status-toast-controller";

type Sink = Parameters<typeof createPageStatusToastController>[0];
type DisplayOptions = Parameters<Sink["show"]>[2];
type ToastId = Parameters<Sink["dismiss"]>[0];

const visible = new Map<ToastId, { message: string; options: DisplayOptions }>();
const events: { kind: "show" | "dismiss"; id: ToastId }[] = [];
const sink: Sink = {
  show(id, message, options) {
    visible.set(id, { message, options });
    events.push({ kind: "show", id });
  },
  dismiss(id) {
    visible.delete(id);
    events.push({ kind: "dismiss", id });
  },
};

const settings = createPageStatusToastController(sink, "settings");
const dirty = {
  active: true,
  message: "Ada perubahan yang belum disimpan.",
  variant: "warning" as const,
};

settings.update({ ...dirty, active: false });
assert.equal(events.length, 0, "Clean pages must stay quiet");
settings.update(dirty);
assert.equal(visible.size, 1);
assert.equal(visible.get(settings.id)?.options.duration, Infinity);
assert.equal(visible.get(settings.id)?.options.dismissible, false);
assert.equal(visible.get(settings.id)?.options.closeButton, false);

for (let edit = 0; edit < 20; edit += 1) settings.update({ ...dirty });
assert.equal(events.length, 1, "Typing must not stack or repeatedly announce the same notice");

settings.update({ ...dirty, message: "Menyimpan perubahan…", variant: "info" });
assert.equal(visible.size, 1, "Saving must update the existing owner notice");
assert.equal(visible.get(settings.id)?.message, "Menyimpan perubahan…");
settings.update(dirty);
assert.equal(visible.size, 1, "Failed saving must retain the unsaved notice");
assert.equal(visible.get(settings.id)?.message, dirty.message);

const lock = createPageStatusToastController(sink, "resource-lock");
lock.update({ active: true, message: "Sedang diedit oleh Kapten lain", variant: "warning" });
assert.equal(visible.size, 2, "Independent owners must coexist");
settings.update({ ...dirty, active: false });
assert.equal(visible.has(settings.id), false, "Save, cancel or reversion must clear the owner");
assert.equal(visible.has(lock.id), true, "Resolving one owner must not dismiss another notice");

const called: string[] = [];
settings.update({
  ...dirty,
  action: { label: "Simpan", onClick: () => called.push("old-save") },
  cancel: { label: "Batal", onClick: () => called.push("old-cancel") },
});
const presentedActions = visible.get(settings.id)!.options;
const beforeHandlerUpdate = events.length;
settings.update({
  ...dirty,
  action: { label: "Simpan", onClick: () => called.push("current-save") },
  cancel: { label: "Batal", onClick: () => called.push("current-cancel") },
});
assert.equal(events.length, beforeHandlerUpdate, "Fresh callbacks must not reannounce unchanged content");
presentedActions.action?.onClick();
presentedActions.cancel?.onClick();
assert.deepEqual(called, ["current-save", "current-cancel"], "Visible actions must invoke current handlers");
assert.equal(visible.has(settings.id), true, "An action must not dismiss an unresolved state notice");

settings.update({ ...dirty, description: "Subjek masih belum disimpan." });
assert.equal(visible.get(settings.id)?.options.description, "Subjek masih belum disimpan.");
assert.equal(visible.get(settings.id)?.options.action, undefined, "Pending or unavailable actions must disappear");
settings.update({ ...dirty, message: "" });
assert.equal(visible.has(settings.id), false, "Empty messages must not create invisible persistent notices");
presentedActions.action?.onClick();
assert.deepEqual(called, ["current-save", "current-cancel"], "Resolved notices must not call stale actions during exit animation");

settings.update(dirty);
settings.dispose();
assert.equal(visible.has(settings.id), false, "Unmount/navigation must clean up the owner's notice");
assert.equal(visible.has(lock.id), true);
const afterDispose = events.length;
settings.dispose();
assert.equal(events.length, afterDispose, "Cleanup must be idempotent");
settings.update(dirty);
assert.equal(events.length, afterDispose, "A disposed owner must not resurrect an orphan notice");

// React Strict Mode runs effect cleanup before replaying the owner setup.
const replay = createPageStatusToastController(sink, "settings");
replay.update(dirty);
assert.equal(visible.has(replay.id), true, "Effect replay must restore the notice with the same owner identity");
assert.equal(replay.id, settings.id);
replay.resolve();
lock.dispose();
assert.equal(visible.size, 0, "All resolved/unmounted owners must leave no stale notice");

console.log("PASS page status lifecycle: deduplication, saving/failure, owner isolation, fresh actions and cleanup/replay");
