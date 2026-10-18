import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act, createElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ts from "typescript";
import { createTryoutPolicyRecovery as productionPolicyRecovery, type TryoutPolicyIntent, type TryoutPolicyReply } from "../lib/tryout/result-policy-recovery";
import { readTryoutSessionReadiness, type TryoutSessionReadiness } from "../lib/tryout/result-readiness";
import { serveTryoutReadinessInspection as serveReadinessBoundary } from "../lib/tryout/result-readiness-http";
import { useTryoutPolicyRecovery } from "../modules/mentor/use-tryout-policy-recovery";
import { useTryoutUnsavedNavigation } from "../modules/mentor/use-tryout-unsaved-navigation";
import { navigateTryoutResultHref, TRYOUT_RESULT_NAVIGATION_EVENT } from "../modules/mentor/tryout-result-navigation";
import { buildMentorTryoutAttemptHref, buildMentorTryoutAttemptBackHref, parseMentorTryoutAttemptContext, parseMentorTryoutContext } from "../lib/navigation/canonical-context";
import { findElements, TestEvent, withReactDomTest } from "./react-dom-test-host";
import type { SessionContext } from "../lib/auth/types";

// Optional immutable source snapshot proves the receipt regression red through
// the same public controller contract; normal execution imports production.
const createTryoutPolicyRecovery: typeof productionPolicyRecovery = process.env.SR03_POLICY_CONTROLLER_SOURCE
  ? new Function("exports", `${ts.transpileModule(readFileSync(process.env.SR03_POLICY_CONTROLLER_SOURCE, "utf8").replace(/^import[^\n]*\n/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText}; return exports.createTryoutPolicyRecovery;`)({})
  : productionPolicyRecovery;
type ReadDependencies = Parameters<typeof serveReadinessBoundary>[1];
// Pure HTTP tests inject an authorization verdict, never another role mapping.
const serveTryoutReadinessInspection = (request: Request, dependencies: Omit<ReadDependencies, "authorize"> & Partial<Pick<ReadDependencies, "authorize">>) => serveReadinessBoundary(request, { authorize: () => ({ allowCrossOwner: false }), ...dependencies });

const scope = { sessionId: "22222222-2222-4222-8222-222222222222", tryoutId: "33333333-3333-4333-8333-333333333333" };
const baseline = { auditCount: 0, policy: "immediate" };
const receipt = { expectedBaseline: baseline, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", configuredAt: "2026-10-18T00:00:00Z", reason: "Tunggu Kapten.", policy: "manual" as const };
const ready: TryoutSessionReadiness = { scope, sessionName: "Sesi utama", availableUntil: "2040-01-01T00:00:00Z", serverNow: "2040-01-01T00:00:00Z", effectivePolicy: "immediate", inherited: true, ready: false, counts: { attempts: 0, candidates: 0, ready: 0, blocked: 0, excluded: 0, void: 0, abandoned: 0, noAttempt: 1 }, blockers: [], publication: null, policy: { baseline, value: "immediate", editable: true, reason: null, receipt: null, sessions: [{ id: scope.sessionId, name: "Sesi utama", inherited: true, effectivePolicy: "immediate" }] } };
const saved = { ...ready, effectivePolicy: "manual", policy: { ...ready.policy, value: "manual", receipt, intentReceipt: receipt } };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
function deadlines() { const timers = new Set<() => void>(); return { schedule: (callback: () => void, ms: number) => { assert.equal(ms, 15000); timers.add(callback); return () => { timers.delete(callback); }; }, expire: () => { [...timers].forEach((callback) => callback()); } }; }
const intent: TryoutPolicyIntent = { ...scope, requestId: receipt.id, expectedBaseline: baseline, policy: "manual", reason: receipt.reason };
const session: SessionContext = { sessionId: "authenticated", expiresAt: new Date(Date.now() + 100000), user: { id: "owner", email: "tutor@example.test", fullName: "Kapten", roles: ["tutor"], status: "active", mustChangePassword: false, onboardingStatus: "completed" } };
const receiptForIntent = (submitted: TryoutPolicyIntent) => ({ ...receipt, id: submitted.requestId, expectedBaseline: submitted.expectedBaseline, policy: submitted.policy, reason: submitted.reason.trim() });
const url = `http://localhost/api/mentor/tryout/result-readiness?${new URLSearchParams(scope)}`;
{
  let reads = 0;
  for (const [user, status] of [[null, 401], [{ ...session, expiresAt: new Date(0) }, 401], [{ ...session, user: { ...session.user, status: "locked" } }, 403], [{ ...session, user: { ...session.user, mustChangePassword: true } }, 403]] as Array<[SessionContext | null, number]>) {
    const response = await serveTryoutReadinessInspection(new Request(url), { getSession: async () => user, read: async () => { reads++; return saved; } }); assert.equal(response.status, status); assert.deepEqual(await response.json(), { ok: false }); assert.match(response.headers.get("cache-control")!, /private, no-store/);
  }
  for (const suffix of ["&reason=private", "&sessionId=duplicate", "&studentId=foreign", "&requestId=invalid", "&requestId=00000000-0000-0000-0000-000000000000", `&requestId=${receipt.id}&requestId=${receipt.id}`]) assert.equal((await serveTryoutReadinessInspection(new Request(url + suffix), { getSession: async () => session, read: async () => { reads++; return saved; } })).status, 400);
  assert.equal(reads, 0);
  const denied = await serveTryoutReadinessInspection(new Request(url), { getSession: async () => session, authorize: () => { throw new Error("Private central policy refusal"); }, read: async () => { reads++; return saved; } });
  assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { ok: false }); assert.equal(reads, 0);
  assert.equal((await serveTryoutReadinessInspection(new Request(url), { getSession: async () => session, read: async () => null })).status, 404);
  const failure = await serveTryoutReadinessInspection(new Request(url), { getSession: async () => session, read: async () => { throw new Error("Private diagnostic"); } }); assert.equal(failure.status, 503); assert.deepEqual(await failure.json(), { ok: false });
  const requested = await serveTryoutReadinessInspection(new Request(`${url}&requestId=${receipt.id.toUpperCase()}`), { getSession: async () => session, read: async (selected, actor, crossOwner, requestId) => { assert.deepEqual(selected, scope); assert.equal(actor, session.user.id); assert.equal(crossOwner, false); assert.equal(requestId, receipt.id); return saved; } }); assert.equal(requested.status, 200);
}
{
  const clock = deadlines(); const held = deferred<TryoutPolicyReply>(); let writes = 0;
  const otherReceipt = { ...receipt, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
  let snapshot: TryoutSessionReadiness = { ...saved, policy: { ...saved.policy, receipt: otherReceipt, intentReceipt: null } };
  const c = createTryoutPolicyRecovery({ schedule: clock.schedule, write: () => { writes++; return held.promise; }, read: async (request) => { assert.equal(request.requestId, intent.requestId); return { ok: true, snapshot }; } }); c.activate();
  const pending = c.submit(intent); await tick(); clock.expire(); await pending; await c.inspect();
  assert.equal(c.getSnapshot().phase, "unknown", "Another writer's identical policy/reason audit cannot confirm this delayed intent"); assert.equal(c.getSnapshot().writePending, true); await c.submit({ ...intent, requestId: otherReceipt.id }); assert.equal(writes, 1);
  snapshot = { ...saved, effectivePolicy: "automatic_at_end", policy: { ...saved.policy, value: "automatic_at_end", receipt: { ...otherReceipt, policy: "automatic_at_end", reason: "Perubahan terbaru." }, intentReceipt: receipt } };
  await c.inspect(); assert.equal(c.getSnapshot().phase, "saved"); assert.deepEqual(c.getSnapshot().receipt, receipt, "Requested historical receipt confirms own commit without claiming current policy is unchanged"); c.dispose();
}
{
  const clock = deadlines(); const held = deferred<TryoutPolicyReply>(); let writes = 0; let gets = 0; let snapshot = ready;
  const c = createTryoutPolicyRecovery({ schedule: clock.schedule, write: () => { writes++; return held.promise; }, read: (request) => readTryoutSessionReadiness(request, async (input, init) => {
    gets++; assert.equal(init?.method, "GET"); assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin"); assert.doesNotMatch(String(input), /reason|policy|baselineReceipt/);
    return serveTryoutReadinessInspection(new Request(`http://localhost${input}`, init), { getSession: async () => session, read: async () => snapshot });
  }) });
  c.activate(); const entered = { ...intent, expectedBaseline: { ...baseline } }; const pending = c.submit(entered); await c.submit({ ...intent, reason: "Duplicate" }); entered.reason = "Changed"; entered.expectedBaseline.auditCount = 99; await tick(); assert.equal(writes, 1); clock.expire(); await pending;
  assert.equal(c.getSnapshot().phase, "unknown"); assert.equal(c.getSnapshot().intent?.reason, receipt.reason); assert.deepEqual(c.getSnapshot().intent?.expectedBaseline, baseline);
  await c.inspect(); assert.equal(gets, 1); assert.equal(c.getSnapshot().phase, "unknown"); await c.replay(); assert.equal(writes, 1);
  snapshot = saved; await c.inspect(); assert.equal(c.getSnapshot().phase, "saved"); assert.equal(c.getSnapshot().writePending, false, "Authoritative matching receipt retires an unresolved transport");
  const confirmed = c.getSnapshot(); held.resolve({ ok: true, receipt }); await tick(); assert.equal(c.getSnapshot(), confirmed, "Retired transport cannot change the confirmed snapshot"); c.dispose();
}
for (const late of ["never", "success", "refusal"] as const) {
  const clock = deadlines(); const old = deferred<TryoutPolicyReply>(); const next = deferred<TryoutPolicyReply>(); let writes = 0;
  const c = createTryoutPolicyRecovery({ schedule: clock.schedule, write: () => ++writes === 1 ? old.promise : next.promise, read: async () => ({ ok: true, snapshot: saved }) }); c.activate();
  const first = c.submit(intent); await tick(); clock.expire(); await first; await c.inspect(); assert.equal(c.getSnapshot().phase, "saved"); assert.equal(c.getSnapshot().writePending, false);
  c.reset(); assert.equal(c.getSnapshot().phase, "idle");
  const nextReceipt = { ...receipt, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", policy: "automatic_at_end" as const, reason: "Tunggu akhir sesi." };
  const second = c.submit({ ...scope, requestId: nextReceipt.id, expectedBaseline: baseline, policy: nextReceipt.policy, reason: nextReceipt.reason }); await tick(); assert.equal(writes, 2); const writing = c.getSnapshot();
  if (late !== "never") old.resolve(late === "success" ? { ok: true, receipt } : { ok: false, confirmedRefusal: true, message: "Old refusal" });
  await tick(); assert.equal(c.getSnapshot(), writing, "Old success/refusal cannot overwrite or unlock a new transport"); assert.equal(c.getSnapshot().writePending, true);
  next.resolve({ ok: true, receipt: nextReceipt }); await second; assert.equal(c.getSnapshot().receipt?.id, nextReceipt.id); c.dispose();
}
{
  const clock = deadlines(); let writes = 0; const reasons: string[] = []; const requestIds: string[] = [];
  const c = createTryoutPolicyRecovery({ schedule: clock.schedule, write: async (submitted) => { reasons.push(submitted.reason); requestIds.push(submitted.requestId); if (++writes === 1) throw new Error("Lost transport"); return { ok: true, receipt }; }, read: async () => ({ ok: true, snapshot: ready }) }); c.activate();
  await c.submit(intent); assert.equal(c.getSnapshot().phase, "unknown"); await c.inspect(); assert.equal(c.getSnapshot().phase, "retry"); await c.replay(); assert.equal(c.getSnapshot().phase, "saved"); assert.deepEqual(reasons, [receipt.reason, receipt.reason]); assert.deepEqual(requestIds, [intent.requestId, intent.requestId]); assert.deepEqual(c.getSnapshot().intent?.expectedBaseline, baseline); c.dispose();
}
{
  const clock = deadlines(); const held = deferred<TryoutPolicyReply>(); const reading = deferred<{ ok: true; snapshot: TryoutSessionReadiness }>();
  const c = createTryoutPolicyRecovery({ schedule: clock.schedule, write: () => held.promise, read: () => reading.promise }); c.activate(); const pending = c.submit(intent); await tick(); clock.expire(); await pending;
  const read = c.inspect(); await tick(); held.resolve({ ok: false, confirmedRefusal: true, message: "Known refusal" }); await tick(); assert.equal(c.getSnapshot().phase, "refused"); assert.equal(c.getSnapshot().intent, null);
  reading.resolve({ ok: true, snapshot: ready }); await read; assert.equal(c.getSnapshot().phase, "refused"); c.dispose();
}
{
  const clock = deadlines(); const c = createTryoutPolicyRecovery({ schedule: clock.schedule, write: async () => { throw new Error("offline"); }, read: () => new Promise(() => {}) }); c.activate(); await c.submit(intent); const pending = c.inspect(); await tick(); clock.expire(); await pending; assert.equal(c.getSnapshot().phase, "unknown"); assert.equal(c.getSnapshot().intent?.reason, receipt.reason); c.dispose();
}
{
  let writes = 0;
  const c = createTryoutPolicyRecovery({ write: async () => { writes++; return { ok: false, confirmedRefusal: true, message: "Aturan berubah." }; }, read: async () => ({ ok: true, snapshot: ready }) });
  c.activate(); await c.submit(intent); assert.equal(c.getSnapshot().phase, "refused");
  await c.submit({ ...intent, requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }); assert.equal(writes, 1, "Known refusal requires authoritative refresh before accepting a new immutable intent");
  c.refreshed(); await c.submit({ ...intent, requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", expectedBaseline: { auditCount: 1, policy: "manual" } }); assert.equal(writes, 2); c.dispose();
}
{
  const c = createTryoutPolicyRecovery({ write: async () => ({ ok: true, receipt: { ...receipt, expectedBaseline: { auditCount: 1, policy: "manual" } } }), read: async () => ({ ok: true, snapshot: ready }) });
  c.activate(); await c.submit(intent); assert.equal(c.getSnapshot().phase, "unknown", "Same request UUID with mismatched baseline is not proof of this immutable payload"); c.dispose();
}
console.log("PASS SR03 controller/HTTP auth, full scope, no private fields, held/late/lost/refused writes, independent GET,15s bounds and same-intent replay");

// Actual mounted hook proves cleanup at commit time, including retained callbacks.
await withReactDomTest(async (root, render) => {
  type Flow = ReturnType<typeof useTryoutPolicyRecovery>;
  let flow!: Flow; const held = deferred<TryoutPolicyReply>(); const notices: string[] = []; let refreshes = 0; let writes = 0; let reads = 0;
  let hookIntent!: TryoutPolicyIntent;
  const write = (submitted: TryoutPolicyIntent) => { writes++; hookIntent = submitted; return held.promise; }; const read = async () => { reads++; return { ok: true as const, snapshot: { ...saved, policy: { ...saved.policy, intentReceipt: receiptForIntent(hookIntent) } } }; }; const refresh = async () => { refreshes++; throw new Error("persisted refresh failure"); }; const notify = (message: string) => { notices.push(message); };
  const timers = new Set<() => void>(); const nativeSet = globalThis.setTimeout; const nativeClear = globalThis.clearTimeout;
  globalThis.setTimeout = ((callback: () => void, ms: number) => { assert.equal(ms, 15000); timers.add(callback); return callback; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((callback: () => void) => { timers.delete(callback); }) as unknown as typeof clearTimeout;
  function Harness({ selected, onCommit }: { selected: typeof scope; onCommit?: () => void }) { flow = useTryoutPolicyRecovery({ scope: selected, write, read, refresh, notify }); useLayoutEffect(() => { onCommit?.(); }, [onCommit]); return createElement("p", null, `${flow.state.phase}:${flow.refreshFailed}`); }
  try {
    await render(createElement(Harness, { selected: scope })); const retainedSubmit = flow.submit; let pending!: Promise<boolean>;
    await act(async () => { pending = flow.submit(intent); await tick(); }); await act(async () => { void retainedSubmit(intent); }); assert.equal(writes, 1);
    await act(async () => { [...timers].forEach((callback) => callback()); await pending; }); assert.match(root.textContent, /unknown/);
    await act(async () => { await flow.inspect(); }); assert.equal(reads, 1); assert(flow.refreshFailed); assert.equal(refreshes, 1); assert(notices.some((notice) => notice.includes("tersimpan, tetapi")));
    const oldReload = flow.reload; const oldInspect = flow.inspect; const count = notices.length;
    await render(createElement(Harness, { selected: { ...scope, sessionId: "44444444-4444-4444-8444-444444444444" }, onCommit: () => { void oldReload(); void oldInspect(); void retainedSubmit(intent); held.resolve({ ok: true, receipt: receiptForIntent(hookIntent) }); } }));
    await act(tick); assert.equal(flow.state.phase, "idle"); assert.equal(writes, 1); assert.equal(refreshes, 1); assert.equal(notices.length, count);
    await render(null); await retainedSubmit(intent); assert.equal(writes, 1);
  } finally { globalThis.setTimeout = nativeSet; globalThis.clearTimeout = nativeClear; }
});
console.log("PASS actual mounted policy hook: unknown→independent persisted read→refresh failure, late/session replacement/unmount ignored");

// Execute the production form body, with only UI drawing and the action transport supplied at their public boundaries.
const source = readFileSync(new URL("../modules/mentor/components/tryout-result-policy-form.tsx", import.meta.url), "utf8");
const body = source.slice(source.indexOf("export function TryoutResultPolicyForm"));
const javascript = ts.transpileModule(body.replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
type Props = { children?: ReactNode; onClick?: () => void; onSubmit?: (event: { preventDefault: () => void }) => void; onChange?: (event: { target: { value: string } }) => void; value?: string; onValueChange?: (value: string) => void; disabled?: boolean; open?: boolean };
let optionProps!: Props; let inputProps!: Props; const buttons = new Map<string, Props>(); let dialogProps!: Props;
const simple = ({ children }: Props) => createElement("div", null, children);
let write: (submitted: TryoutPolicyIntent) => Promise<TryoutPolicyReply> = async (submitted) => ({ ok: true, receipt: receiptForIntent(submitted) });
const Form = new Function("React", "useEffect", "useRef", "useState", "useTryoutPolicyRecovery", "configureTryoutResultPolicyAction", "notify", "navigate", "useTryoutUnsavedNavigation", "usePageStatusToast", "TRYOUT_RESULT_NAVIGATION_EVENT", "REFERENCE_FIELD_LABEL_CLASS_NAME", "options", "resultPolicyLabels", "Button", "Field", "FieldError", "FieldInput", "FieldLabel", "OptionSet", "AlertDialog", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle", `${javascript};return TryoutResultPolicyForm;`)(
  React, useEffect, useRef, useState, useTryoutPolicyRecovery, (submitted: TryoutPolicyIntent) => write(submitted), () => {}, (href: string) => { navigations.push(href); }, useTryoutUnsavedNavigation, () => {}, TRYOUT_RESULT_NAVIGATION_EVENT, "label", [{ value: "manual", label: "Dirilis oleh Kapten" }], { manual: "Dirilis oleh Kapten" },
  (props: Props) => { buttons.set(String(props.children), props); return createElement("button", { disabled: props.disabled, onClick: props.onClick }, props.children); }, simple, simple,
  (props: Props) => { inputProps = props; return createElement("input", { value: props.value, readOnly: true }); }, simple,
  (props: Props) => { optionProps = props; return createElement("p", null, `Policy:${props.value}`); },
  (props: Props) => { dialogProps = props; return props.open ? createElement("div", null, props.children) : null; }, (props: Props) => { buttons.set("Lanjut mengedit", props); return createElement("button", { onClick: props.onClick }, props.children); }, simple, simple, simple, simple, simple,
) as (props: { initial: TryoutSessionReadiness; refresh: () => Promise<void> }) => React.ReactElement;
const navigations: string[] = [];
await withReactDomTest(async (root, render) => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test?workspace=participants" }, addEventListener: (name: string, callback: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); }, removeEventListener: (name: string, callback: (event: Event) => void) => listeners.get(name)?.delete(callback), dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((callback) => callback(event)); return !event.defaultPrevented; } });
  let writes = 0; const submitted: TryoutPolicyIntent[] = []; write = async (value) => { writes++; submitted.push(value); return { ok: false, confirmedRefusal: true, message: "First Start froze policy" }; };
  await render(createElement(Form, { initial: ready, refresh: async () => {} }));
  await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: receipt.reason } }); });
  assert.equal(listeners.get("beforeunload")?.size, 1);
  await act(async () => { navigateTryoutResultHref("/mentor/tryout/next", (href) => navigations.push(href)); }); assert.equal(navigations.length, 0); assert(dialogProps.open); assert.match(root.textContent, /Simpan perubahan aturan rilis/);
  // Escape/stay closes the actual dialog through its controlled callback without persistence.
  const close = dialogProps as Props & { onOpenChange: (open: boolean) => void }; await act(async () => close.onOpenChange(false)); assert.equal(writes, 0); assert.equal(inputProps.value, receipt.reason);
  const unload = new TestEvent("beforeunload"); listeners.get("beforeunload")?.forEach((callback) => callback(unload as unknown as Event)); assert(unload.defaultPrevented);
  const formElement = findElements(root, "form")[0]; assert(formElement);
  const props = Object.entries(formElement).find(([key]) => key.startsWith("__reactProps"))?.[1] as Props;
  await act(async () => { props.onSubmit!({ preventDefault() {} }); await tick(); }); assert.equal(writes, 1); assert.equal(submitted[0].policy, "manual"); assert.equal(inputProps.value, receipt.reason, "Known refusal retains input for correction");
  await act(async () => { buttons.get("Batalkan perubahan")!.onClick!(); }); assert.equal(optionProps.value, "immediate"); assert.equal(inputProps.value, ""); assert.equal(listeners.get("beforeunload")?.size, 0);
  await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: "Other" } }); navigateTryoutResultHref("/mentor/tryout/next", (href) => navigations.push(href)); });
  await act(async () => { buttons.get("Keluar tanpa menyimpan")!.onClick!(); }); assert.equal(navigations.at(-1), "/mentor/tryout/next"); assert.equal(writes, 1);
  await render(null);
});
await withReactDomTest(async (root, render) => {
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test" }, addEventListener: () => {}, removeEventListener: () => {} });
  const requests: TryoutPolicyIntent[] = []; let refreshes = 0;
  write = async (submitted) => { requests.push(submitted); return requests.length === 1 ? { ok: false, confirmedRefusal: true, message: "Aturan rilis telah berubah. Muat aturan terbaru sebelum menyimpan kembali." } : { ok: true, receipt: receiptForIntent(submitted) }; };
  function RefreshPolicy() { const [initial, setInitial] = useState(ready); return createElement(Form, { initial, refresh: async () => { refreshes++; setInitial({ ...ready, policy: { ...ready.policy, baseline: { auditCount: 1, policy: "manual" }, value: "manual" } }); } }); }
  await render(createElement(RefreshPolicy));
  await act(async () => { optionProps.onValueChange!("automatic_at_end"); inputProps.onChange!({ target: { value: "Pilihan tetap disimpan." } }); });
  const submit = () => { const element = findElements(root, "form")[0]; (Object.entries(element).find(([key]) => key.startsWith("__reactProps"))![1] as Props).onSubmit!({ preventDefault() {} }); };
  await act(async () => { submit(); await tick(); });
  assert.equal(requests.length, 1); assert.deepEqual(requests[0].expectedBaseline, baseline); assert.equal(inputProps.value, "Pilihan tetap disimpan."); assert.equal(optionProps.value, "automatic_at_end");
  await act(async () => { submit(); await tick(); }); assert.equal(requests.length, 1, "Known refusal requires authoritative refresh before another fresh intent");
  await act(async () => { buttons.get("Muat aturan terbaru")!.onClick!(); await tick(); }); assert.equal(refreshes, 1); assert.equal(inputProps.value, "Pilihan tetap disimpan.");
  await act(async () => { submit(); await tick(); }); assert.equal(requests.length, 2); assert.notEqual(requests[1].requestId, requests[0].requestId); assert.deepEqual(requests[1].expectedBaseline, { auditCount: 1, policy: "manual" }); assert.equal(requests[1].policy, "automatic_at_end");
  await render(null);
});
console.log("PASS actual mounted stale first execution: retained fields, refresh gate, refreshed baseline and fresh UUID");

const back = buildMentorTryoutAttemptBackHref(scope.tryoutId, parseMentorTryoutAttemptContext(new URL(buildMentorTryoutAttemptHref(scope.tryoutId, "attempt", { workspace: "participants", parent: "parent", session: scope.sessionId, resultQ: "Dimas", resultStatus: "submitted" }), "http://localhost").searchParams));
assert.equal(parseMentorTryoutContext(new URL(back, "http://localhost").searchParams).resultQ, "Dimas");
console.log("PASS actual mounted policy form selection/reason/known refusal/save/discard/stay/unload and guarded programmatic row navigation; contextual recovery links");

await withReactDomTest(async (root, render) => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test?workspace=participants" }, addEventListener: (name: string, callback: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); }, removeEventListener: (name: string, callback: (event: Event) => void) => listeners.get(name)?.delete(callback), dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((callback) => callback(event)); return !event.defaultPrevented; } });
  let writes = 0; let refreshes = 0; write = async (submitted) => { writes++; return { ok: true, receipt: receiptForIntent(submitted) }; };
  await render(createElement(Form, { initial: ready, refresh: async () => { refreshes++; throw new Error("Refresh unavailable after saved receipt"); } }));
  await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: receipt.reason } }); });
  await act(async () => { navigateTryoutResultHref("/mentor/tryout/after-save", (href) => navigations.push(href)); });
  await act(async () => { buttons.get("Simpan lalu lanjut")!.onClick!(); await tick(); });
  assert.equal(writes, 1); assert.equal(refreshes, 1); assert.equal(navigations.at(-1), "/mentor/tryout/after-save"); assert.match(root.textContent, /Aturan rilis sudah tersimpan/); assert.match(root.textContent, /Tunggu Kapten/);
  assert.equal(inputProps.disabled, true, "Committed save with failed refresh offers reload before a new edit");
});
console.log("PASS actual mounted save-and-continue carries committed receipt through refresh failure without labelling persistence failed");

for (const outcome of ["cancel", "replace", "replace-same-destination", "unmount", "continue"] as const) await withReactDomTest(async (root, render) => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test?workspace=participants" }, addEventListener: (name: string, callback: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); }, removeEventListener: (name: string, callback: (event: Event) => void) => listeners.get(name)?.delete(callback), dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((callback) => callback(event)); return !event.defaultPrevented; } });
  const held = deferred<TryoutPolicyReply>(); let writes = 0; const beforeNavigations = navigations.length;
  let navigationWrite!: TryoutPolicyIntent; write = (submitted) => { writes++; navigationWrite = submitted; return held.promise; };
  await render(createElement(Form, { initial: ready, refresh: async () => {} }));
  await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: receipt.reason } }); });
  const destination = "/mentor/tryout/deferred-destination";
  await act(async () => { navigateTryoutResultHref(destination, (href) => navigations.push(href)); });
  await act(async () => { buttons.get("Simpan lalu lanjut")!.onClick!(); await tick(); });
  assert.equal(writes, 1);
  if (outcome === "cancel" || outcome === "replace-same-destination") await act(async () => { (dialogProps as Props & { onOpenChange: (open: boolean) => void }).onOpenChange(false); });
  if (outcome === "replace" || outcome === "replace-same-destination") await act(async () => { navigateTryoutResultHref(outcome === "replace" ? "/mentor/tryout/replacement-destination" : destination, (href) => navigations.push(href)); });
  if (outcome === "unmount") await render(null);
  await act(async () => { held.resolve({ ok: true, receipt: receiptForIntent(navigationWrite) }); await tick(); });
  assert.equal(navigations.length - beforeNavigations, outcome === "continue" ? 1 : 0, `${outcome} invalidates the submitted navigation identity, without cancelling persistence`);
  if (outcome !== "unmount") assert.match(root.textContent, /Tunggu Kapten/, "Committed receipt remains visible after navigation intent changes");
  if (outcome === "replace" || outcome === "replace-same-destination") { assert(dialogProps.open); assert.match(root.textContent, /Aturan rilis sudah tersimpan/); }
});
console.log("PASS actual deferred form save-and-continue: cancel, replacement, identical destination re-request and unmount invalidate old navigation; unchanged approval navigates once with receipt retained");

for (const late of ["never", "success", "refusal"] as const) await withReactDomTest(async (root, render) => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test?workspace=participants" }, addEventListener: (name: string, callback: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); }, removeEventListener: (name: string, callback: (event: Event) => void) => listeners.get(name)?.delete(callback), dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((callback) => callback(event)); return !event.defaultPrevented; } });
  const old = deferred<TryoutPolicyReply>(); const next = deferred<TryoutPolicyReply>(); let writes = 0;
  const submitted: TryoutPolicyIntent[] = []; write = (value) => { submitted.push(value); return ++writes === 1 ? old.promise : next.promise; };
  const timers = new Set<() => void>(); const nativeSet = globalThis.setTimeout; const nativeClear = globalThis.clearTimeout; const nativeFetch = globalThis.fetch;
  globalThis.setTimeout = ((callback: () => void, ms: number) => { assert.equal(ms, 15000); timers.add(callback); return callback; }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((callback: () => void) => { timers.delete(callback); }) as unknown as typeof clearTimeout;
  globalThis.fetch = async (input, init) => { assert.equal(init?.method, "GET"); assert.equal(new URL(String(input), "http://localhost").searchParams.get("requestId"), submitted[0].requestId); return Response.json({ ok: true, snapshot: { ...saved, policy: { ...saved.policy, intentReceipt: receiptForIntent(submitted[0]) } } }); };
  const submitForm = () => {
    const element = findElements(root, "form")[0]; assert(element);
    const props = Object.entries(element).find(([key]) => key.startsWith("__reactProps"))?.[1] as Props;
    props.onSubmit!({ preventDefault() {} });
  };
  try {
    await render(createElement(Form, { initial: ready, refresh: async () => {} }));
    await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: receipt.reason } }); });
    await act(async () => { submitForm(); await tick(); }); assert.equal(writes, 1);
    await act(async () => { [...timers].forEach((callback) => callback()); await tick(); });
    await act(async () => { buttons.get("Periksa status penyimpanan")!.onClick!(); await tick(); });
    assert.match(root.textContent, /Tunggu Kapten/); assert.equal(inputProps.disabled, false, "Matching independent receipt enables editing while original write never settles");
    const nextReceipt = { ...receipt, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", policy: "automatic_at_end" as const, reason: "Tunggu akhir sesi." };
    await act(async () => { optionProps.onValueChange!(nextReceipt.policy); inputProps.onChange!({ target: { value: nextReceipt.reason } }); });
    await act(async () => { submitForm(); await tick(); }); assert.equal(writes, 2); assert.equal(submitted[1].reason, nextReceipt.reason); assert.notEqual(submitted[0].requestId, submitted[1].requestId);
    if (late !== "never") await act(async () => { old.resolve(late === "success" ? { ok: true, receipt: receiptForIntent(submitted[0]) } : { ok: false, confirmedRefusal: true, message: "Stale refusal" }); await tick(); });
    assert.equal(inputProps.disabled, true, "Old reply cannot unlock the next active write"); assert.equal(inputProps.value, nextReceipt.reason); assert.equal(writes, 2);
    await act(async () => { next.resolve({ ok: true, receipt: receiptForIntent(submitted[1]) }); await tick(); }); assert.match(root.textContent, /Tunggu akhir sesi/);
  } finally { globalThis.setTimeout = nativeSet; globalThis.clearTimeout = nativeClear; globalThis.fetch = nativeFetch; }
});
console.log("PASS actual mounted form: authoritative GET retires held-forever transport, next edit/save works, stale success/refusal cannot overwrite or unlock next write");

await withReactDomTest(async (root, render) => {
  const nativeFetch = globalThis.fetch; const requests: TryoutPolicyIntent[] = [];
  const listeners = new Map<string, Set<(event: Event) => void>>();
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test?workspace=participants" }, addEventListener: (name: string, callback: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); }, removeEventListener: (name: string, callback: (event: Event) => void) => listeners.get(name)?.delete(callback), dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((callback) => callback(event)); return !event.defaultPrevented; } });
  write = async (submitted) => { requests.push(submitted); if (requests.length === 1) throw new Error("Lost original response"); return { ok: true, receipt: receiptForIntent(submitted) }; };
  globalThis.fetch = async (input) => { assert.equal(new URL(String(input), "http://localhost").searchParams.get("requestId"), requests[0].requestId); return Response.json({ ok: true, snapshot: ready }); };
  const submit = () => { const element = findElements(root, "form")[0]; const props = Object.entries(element).find(([key]) => key.startsWith("__reactProps"))?.[1] as Props; props.onSubmit!({ preventDefault() {} }); };
  try {
    await render(createElement(Form, { initial: ready, refresh: async () => {} }));
    await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: receipt.reason } }); });
    await act(async () => { submit(); await tick(); });
    await act(async () => { buttons.get("Periksa status penyimpanan")!.onClick!(); await tick(); });
    await act(async () => { buttons.get("Kirim ulang perubahan yang sama")!.onClick!(); await tick(); });
    assert.equal(requests.length, 2); assert.equal(requests[0].requestId, requests[1].requestId); assert.deepEqual(requests[0].expectedBaseline, requests[1].expectedBaseline); assert.match(root.textContent, /Tunggu Kapten/);
    await act(async () => { optionProps.onValueChange!("automatic_at_end"); inputProps.onChange!({ target: { value: "Perubahan berikutnya." } }); });
    await act(async () => { submit(); await tick(); }); assert.equal(requests.length, 3); assert.notEqual(requests[2].requestId, requests[0].requestId);
  } finally { globalThis.fetch = nativeFetch; }
});
console.log("PASS actual mounted immutable request UUID across explicit replay; fresh next edit uses a different UUID");

await withReactDomTest(async (root, render) => {
  const nativeFetch = globalThis.fetch; const nativeSet = globalThis.setTimeout; const nativeClear = globalThis.clearTimeout;
  const timers = new Set<() => void>(); const held = deferred<TryoutPolicyReply>(); let submitted!: TryoutPolicyIntent; let ownCommitted = false;
  const listeners = new Map<string, Set<(event: Event) => void>>();
  Object.assign(window, { location: { href: "http://localhost/mentor/tryout/test?workspace=participants" }, addEventListener: (name: string, callback: (event: Event) => void) => { const set = listeners.get(name) ?? new Set(); set.add(callback); listeners.set(name, set); }, removeEventListener: (name: string, callback: (event: Event) => void) => listeners.get(name)?.delete(callback), dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((callback) => callback(event)); return !event.defaultPrevented; } });
  write = (value) => { submitted = value; return held.promise; };
  const currentB = (): TryoutSessionReadiness => ({ ...saved, effectivePolicy: "automatic_at_end", policy: { ...saved.policy, value: "automatic_at_end", receipt: { ...receipt, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", policy: "automatic_at_end", reason: "Perubahan dari halaman lain." }, intentReceipt: ownCommitted ? receiptForIntent(submitted) : null } });
  globalThis.fetch = async () => Response.json({ ok: true, snapshot: ownCommitted ? currentB() : { ...saved, policy: { ...saved.policy, receipt: { ...receipt, id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }, intentReceipt: null } } });
  globalThis.setTimeout = ((callback: () => void) => { timers.add(callback); return callback; }) as unknown as typeof setTimeout; globalThis.clearTimeout = ((callback: () => void) => { timers.delete(callback); }) as unknown as typeof clearTimeout;
  function LatestPolicy() { const [initial, setInitial] = useState(ready); return createElement(Form, { initial, refresh: async () => { setInitial(currentB()); } }); }
  try {
    await render(createElement(LatestPolicy));
    await act(async () => { optionProps.onValueChange!("manual"); inputProps.onChange!({ target: { value: receipt.reason } }); });
    const element = findElements(root, "form")[0]; const props = Object.entries(element).find(([key]) => key.startsWith("__reactProps"))?.[1] as Props;
    await act(async () => { props.onSubmit!({ preventDefault() {} }); await tick(); }); await act(async () => { [...timers].forEach((callback) => callback()); await tick(); });
    await act(async () => { buttons.get("Periksa status penyimpanan")!.onClick!(); await tick(); }); assert.equal(inputProps.disabled, true, "Identical other-writer receipt keeps the held write fenced");
    ownCommitted = true; await act(async () => { buttons.get("Periksa status penyimpanan")!.onClick!(); await tick(); });
    assert.equal(inputProps.disabled, false); assert.equal(optionProps.value, "automatic_at_end", "Confirmed historical own save refreshes current B instead of presenting old A as current"); assert.match(root.textContent, /Penyimpanan ini tercatat/); assert.match(root.textContent, /Aturan terbaru/);
    await act(async () => { held.resolve({ ok: false, confirmedRefusal: true, message: "Stale original response" }); await tick(); }); assert.equal(optionProps.value, "automatic_at_end"); assert.equal(inputProps.disabled, false);
  } finally { globalThis.fetch = nativeFetch; globalThis.setTimeout = nativeSet; globalThis.clearTimeout = nativeClear; }
});
console.log("PASS actual mounted two-writer recovery: identical B receipt never confirms A; requested historical A confirms while refreshed policy remains newer B");

// Mount the real summary loader/render path. It owns safe GET scope, all blockers and contextual links.
const summarySource = readFileSync(new URL("../modules/mentor/components/tryout-session-result-readiness.tsx", import.meta.url), "utf8");
const summaryBody = summarySource.slice(summarySource.indexOf("async function inspect(")).replace("export function", "function");
const summaryJs = ts.transpileModule(summaryBody, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
let reading: Promise<{ ok: true; snapshot: TryoutSessionReadiness }> = Promise.resolve({ ok: true, snapshot: ready }); const requestedScopes: typeof scope[] = [];
const Summary = new Function("React", "useEffect", "useLayoutEffect", "useRef", "useState", "readTryoutSessionReadiness", "ReferenceSurface", "Button", "Link", "buildMentorTryoutAttemptHref", "formatTryoutDateTime", "TryoutResultPolicyForm", "resultPolicyLabels", `${summaryJs};return TryoutSessionResultReadiness;`)(
  React, useEffect, useLayoutEffect, useRef, useState, (value: typeof scope) => { requestedScopes.push(value); return reading; }, simple, simple,
  ({ children, href }: Props & { href: string }) => createElement("a", { href }, children), buildMentorTryoutAttemptHref, (value: string) => value, () => null, { manual: "Dirilis oleh Kapten", immediate: "Setelah semua skor siap" },
) as (props: { scope: typeof scope; context: ReturnType<typeof parseMentorTryoutContext> }) => React.ReactElement;
await withReactDomTest(async (root, render) => {
  const blocked = { ...ready, counts: { ...ready.counts, attempts: 13, candidates: 10, ready: 8, blocked: 2, excluded: 3, void: 1, abandoned: 2, noAttempt: 4 }, blockers: [{ category: "scoring" as const, attemptId: "11111111-1111-4111-8111-111111111111", section: 7, message: "Skor perlu diperiksa." }, { category: "explanations" as const, attemptId: null, section: 6, message: "Pembahasan tersimpan belum lengkap." }] };
  reading = Promise.resolve({ ok: true, snapshot: blocked });
  const context = parseMentorTryoutContext({ workspace: "participants", resultQ: "Dimas", resultStatus: "submitted", parent: "parent", session: scope.sessionId });
  await render(createElement(Summary, { scope, context })); await act(tick);
  assert.match(root.textContent, /8 siap · 2 perlu diperiksa/); assert.match(root.textContent, /1 dibatalkan · 2 ditinggalkan · 4 belum mengerjakan/); assert.match(root.textContent, /Skor perlu diperiksa/); assert.match(root.textContent, /Pembahasan tersimpan belum lengkap/);
  assert.deepEqual(requestedScopes.at(-1), scope, "Search/filter never enter readiness GET");
  const link = findElements(root, "a")[0]; const parsed = parseMentorTryoutAttemptContext(new URL(link.getAttribute("href")!, "http://localhost").searchParams); assert.equal(parsed.resultQ, "Dimas"); assert.equal(parsed.session, scope.sessionId); assert.equal(parsed.parent, "parent"); assert.equal(parsed.workspace, "participants");
  const late = deferred<{ ok: true; snapshot: TryoutSessionReadiness }>(); reading = late.promise;
  await render(null); await render(createElement(Summary, { scope, context })); await render(null); late.resolve({ ok: true, snapshot: blocked }); await act(tick); assert.equal(root.textContent, "");
});
console.log("PASS actual mounted readiness independent full-session count/multiblocker render, GET scope, canonical recovery/back context and unmount read guard");
