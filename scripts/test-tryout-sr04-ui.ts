import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act, createElement, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ts from "typescript";
import { useTryoutPublicationRecovery } from "../modules/mentor/use-tryout-publication-recovery";
import type { TryoutPublicationIntent, TryoutPublicationReply } from "../lib/tryout/result-publication-recovery";
import type { TryoutSessionReadiness } from "../lib/tryout/result-readiness";
import { findElements, withReactDomTest } from "./react-dom-test-host";

const scope = { tryoutId: "33333333-3333-4333-8333-333333333333", sessionId: "22222222-2222-4222-8222-222222222222" };
const receipt = { ...scope, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actorId: "owner", actorName: "Kapten Rani", participantCount: 2, releasedAt: "2026-10-18T00:00:00.000Z", reason: "Semua hasil diperiksa." };
const initial: TryoutSessionReadiness = { scope, sessionName: "Sesi utama yang panjang", availableUntil: receipt.releasedAt, serverNow: receipt.releasedAt, effectivePolicy: "manual", inherited: true, ready: true, counts: { attempts: 2, candidates: 2, ready: 2, blocked: 0, excluded: 0, void: 0, abandoned: 0, noAttempt: 0 }, blockers: [], publication: null, policy: { baseline: { auditCount: 0, policy: "manual" }, value: "manual", editable: false, reason: "Terkunci", receipt: null, sessions: [] } };
const tick = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { resolve, promise }; }

await withReactDomTest(async (_root, render) => {
  const held = deferred<TryoutPublicationReply>(); const timers = new Set<() => void>();
  const nativeSet = globalThis.setTimeout; const nativeClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback: () => void) => { timers.add(callback); return callback; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((callback: () => void) => { timers.delete(callback); }) as unknown as typeof clearTimeout;
  let flow!: ReturnType<typeof useTryoutPublicationRecovery>; let writes = 0; let reads = 0; const notices: string[] = [];
  const write = () => { writes++; return held.promise; };
  const read = async () => { reads++; return { ok: true as const, snapshot: { ...initial, publication: { ...receipt, receipt } } }; };
  const refresh = async () => { throw new Error("Offline refresh after commit"); };
  const notify = (message: string) => { notices.push(message); };
  function Harness({ sessionId = scope.sessionId }: { sessionId?: string }) { flow = useTryoutPublicationRecovery({ scope: { ...scope, sessionId }, write, read, refresh, notify }); return null; }
  try {
    await render(createElement(Harness));
    const retainedSubmit = flow.submit;
    let pending!: Promise<boolean>;
    await act(async () => { pending = flow.submit(receipt.reason); await tick(); }); assert.equal(writes, 1);
    await act(async () => { [...timers].forEach((timer) => timer()); await pending; });
    await act(async () => { await flow.inspect(); }); assert.equal(reads, 1); assert.equal(flow.state.phase, "saved"); assert.equal(flow.refreshFailed, true); assert(notices.some((message) => /dirilis.*tampilan|tampilan.*dirilis/i.test(message)));
    await render(createElement(Harness, { sessionId: "44444444-4444-4444-8444-444444444444" }));
    const count = notices.length; held.resolve({ ok: false, confirmedRefusal: true, message: "Old refusal" }); await act(tick); assert.equal(flow.state.phase, "idle"); assert.equal(notices.length, count);
    await act(async () => { await retainedSubmit("Obsolete callback"); }); assert.equal(writes, 1);
    await render(null); await retainedSubmit("Unmounted"); assert.equal(writes, 1);
  } finally { globalThis.setTimeout = nativeSet; globalThis.clearTimeout = nativeClear; }
});
console.log("PASS mounted publication hook: independent held-write inspection, committed refresh failure and replacement/unmount fences");

// Mount the production control; only UI drawing and action transport are supplied at boundaries.
const source = readFileSync(process.env.SR04_PUBLICATION_CONTROL_SOURCE ?? "modules/mentor/components/tryout-result-publication.tsx", "utf8");
const body = source.slice(source.indexOf("export function TryoutResultPublication")).replace("export function", "function");
const javascript = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
type Props = { children?: ReactNode; disabled?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void; onSubmit?: (event: { preventDefault: () => void }) => void; value?: string; error?: string; render?: React.ReactElement };
const simple = ({ children }: Props) => createElement("div", null, children);
let dialog!: Props; let input!: Props; const buttons = new Map<string, Props>(); let writes = 0;
let action: (intent: TryoutPublicationIntent) => Promise<TryoutPublicationReply> = async () => { writes++; return { ok: false, confirmedRefusal: true, message: "Sesi belum berakhir." }; };
const Control = new Function("React", "useLayoutEffect", "useRef", "useState", "useTryoutPublicationRecovery", "publishTryoutSessionResultsAction", "notify", "formatTryoutDateTime", "REFERENCE_FIELD_LABEL_CLASS_NAME", "Button", "Field", "FieldError", "FieldInput", "FieldLabel", "AlertDialog", "AlertDialogTrigger", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle", `${javascript}; return TryoutResultPublication;`)(
  React, useLayoutEffect, useRef, useState, useTryoutPublicationRecovery, (intent: TryoutPublicationIntent) => action(intent), () => {}, (value: string) => value, "label",
  (props: Props) => { buttons.set(String(props.children), props); return createElement("button", { disabled: props.disabled, onClick: props.onClick }, props.children); }, simple,
  (props: Props) => createElement("span", null, props.error), (props: Props) => { input = props; return createElement("input", { value: props.value, readOnly: true }); }, simple,
  (props: Props) => { dialog = props; return createElement("div", null, props.children); }, (props: Props) => props.render ? React.cloneElement(props.render, {}, props.children) : simple(props), (props: Props) => { buttons.set("Batalkan", props); return createElement("button", { onClick: props.onClick }, props.children); },
  (props: Props) => dialog.open ? simple(props) : null, simple, simple, simple, simple,
) as (props: { initial: TryoutSessionReadiness; tryoutTitle: string; refresh: () => Promise<void>; available?: boolean }) => React.ReactElement;
await withReactDomTest(async (root, render) => {
  const props = { initial, tryoutTitle: "Tryout dengan nama panjang", refresh: async () => {}, available: true };
  await render(createElement(Control, props));
  await act(async () => { dialog.onOpenChange!(true); });
  assert.match(root.textContent, /Tryout dengan nama panjang/); assert.match(root.textContent, /Sesi utama yang panjang/); assert.match(root.textContent, /2 peserta/); assert.match(root.textContent, /skor.*jawaban.*pembahasan.*peringkat.*laporan/i);
  const form = () => Object.entries(findElements(root, "form")[0]).find(([key]) => key.startsWith("__reactProps"))![1] as Props;
  await act(async () => { form().onSubmit!({ preventDefault() {} }); }); assert.equal(writes, 0); assert.match(root.textContent, /Isi alasan/);
  await act(async () => { input.onChange!({ target: { value: receipt.reason } }); dialog.onOpenChange!(false); }); assert.equal(writes, 0);
  const staleClose = dialog.onOpenChange;
  await act(async () => { dialog.onOpenChange!(true); }); assert.equal(input.value, receipt.reason);
  await act(async () => { staleClose!(false); }); assert.equal(dialog.open, true, "Obsolete dialog callback cannot close its replacement");
  await act(async () => { form().onSubmit!({ preventDefault() {} }); await tick(); }); assert.equal(writes, 1); assert.equal(input.value, receipt.reason); assert.equal(input.disabled, false);
  const staleForm = form(); await act(async () => { dialog.onOpenChange!(false); }); await act(async () => { staleForm.onSubmit!({ preventDefault() {} }); }); assert.equal(writes, 1, "Retained dialog submit cannot dispatch after closing");
  await render(null); await render(createElement(Control, { ...props, initial: { ...initial, ready: false } })); assert.equal(buttons.get("Rilis hasil sesi")?.disabled, true);
  action = async () => ({ ok: true, receipt });
});
console.log("PASS mounted publication control: named whole-bundle confirmation, required reason, cancel, refusal retains input and stale dialog callback");

await withReactDomTest(async (root, render) => {
  const held = deferred<TryoutPublicationReply>(); const timers = new Set<() => void>();
  const nativeSet = globalThis.setTimeout; const nativeClear = globalThis.clearTimeout; const nativeFetch = globalThis.fetch;
  globalThis.setTimeout = ((callback: () => void) => { timers.add(callback); return callback; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((callback: () => void) => { timers.delete(callback); }) as unknown as typeof clearTimeout;
  let setFreshness!: (fresh: boolean) => void; let reloads = 0; let inspections = 0; let submissions = 0;
  action = () => { submissions++; return held.promise; };
  globalThis.fetch = async () => { inspections++; return Response.json({ ok: true, snapshot: { ...initial, publication: { ...receipt, receipt } } }); };
  function ReadinessParent() {
    const [fresh, setFresh] = useState(true); setFreshness = setFresh;
    return createElement(Control, { initial, tryoutTitle: "Tryout dengan kesiapan gagal dimuat", available: fresh, refresh: async () => { reloads++; setFresh(false); throw new Error("Readiness unavailable after commit"); } });
  }
  try {
    await render(createElement(ReadinessParent));
    await act(async () => { dialog.onOpenChange!(true); });
    await act(async () => { input.onChange!({ target: { value: receipt.reason } }); });
    const form = Object.entries(findElements(root, "form")[0]).find(([key]) => key.startsWith("__reactProps"))![1] as Props;
    await act(async () => { form.onSubmit!({ preventDefault() {} }); await tick(); }); assert.equal(submissions, 1);
    await act(async () => { setFreshness(false); });
    assert.match(root.textContent, /Alasan rilis/, "Retained publication intent stays rendered when parent readiness becomes unavailable");
    assert.equal(input.value, receipt.reason); assert.equal(input.disabled, true);
    await act(async () => { [...timers].forEach((timer) => timer()); await tick(); });
    assert.match(root.textContent, /Periksa status rilis/, "Unknown outcome remains independently inspectable without readiness");
    await act(async () => { buttons.get("Periksa status rilis")!.onClick!(); await tick(); });
    assert.equal(inspections, 1); assert.equal(reloads, 1);
    assert.match(root.textContent, /Catatan rilis/); assert.match(root.textContent, /Kapten Rani/); assert.match(root.textContent, /Semua hasil diperiksa/); assert.match(root.textContent, /Muat ulang tampilan/);
    await act(async () => { buttons.get("Muat ulang tampilan")!.onClick!(); await tick(); }); assert.equal(reloads, 2, "Reload stays reachable after persisted publication and failed readiness refresh");
    held.resolve({ ok: false, confirmedRefusal: true, message: "Obsolete original refusal" }); await act(tick); assert.match(root.textContent, /Catatan rilis/); assert.equal(submissions, 1);
    await act(async () => { dialog.onOpenChange!(false); }); assert.match(root.textContent, /Catatan rilis/); assert.match(root.textContent, /Muat ulang tampilan/);
  } finally { globalThis.setTimeout = nativeSet; globalThis.clearTimeout = nativeClear; globalThis.fetch = nativeFetch; }
});
console.log("PASS mounted parent readiness failure: retained intent/reason, independent inspection, committed receipt and explicit reload remain visible");

await withReactDomTest(async (root, render) => {
  let submissions = 0;
  action = async () => { submissions++; return { ok: false, confirmedRefusal: true, message: "Refused for fixture" }; };
  const props = { initial, tryoutTitle: "Tryout menunggu kesiapan", refresh: async () => {}, available: true };
  const form = () => Object.entries(findElements(root, "form")[0]).find(([key]) => key.startsWith("__reactProps"))![1] as Props;
  await render(createElement(Control, props)); await act(async () => { dialog.onOpenChange!(true); });
  await act(async () => { input.onChange!({ target: { value: receipt.reason } }); });
  const staleSubmit = form().onSubmit!;
  await render(createElement(Control, { ...props, available: false }));
  assert.equal(buttons.get("Rilis hasil sesi")!.disabled, true); assert.equal(buttons.get("Rilis seluruh hasil")!.disabled, true);
  await act(async () => { staleSubmit({ preventDefault() {} }); form().onSubmit!({ preventDefault() {} }); await tick(); }); assert.equal(submissions, 0, "Neither retained nor current handlers dispatch fresh publication without readiness");
  await render(createElement(Control, props));
  await act(async () => { form().onSubmit!({ preventDefault() {} }); await tick(); }); assert.equal(submissions, 1, "A new publication dispatch becomes available only after readiness succeeds");
});
console.log("PASS unavailable readiness disables fresh publication and fences retained submit callbacks until refreshed");
