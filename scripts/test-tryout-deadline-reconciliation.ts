import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { act, createElement, StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ts from "typescript";
import { createSingleFlightRead } from "../lib/tryout/single-flight-read";
import { useParticipantDeadlineReconciliation, type DeadlineState } from "../modules/tryout/use-participant-deadline-reconciliation";
import { withReactDomTest } from "./react-dom-test-host";

class Clock {
  time = 1000;
  nextId = 0;
  timers = new Map<number, { at: number; callback: () => void; interval?: number }>();
  setTimeout = (callback: () => void, delay = 0) => {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimeout = (id: number) => { this.timers.delete(id); };
  setInterval = (callback: () => void, interval: number) => {
    const id = this.setTimeout(callback, interval);
    this.timers.get(id)!.interval = interval;
    return id;
  };
  async advance(ms: number) {
    const end = this.time + ms;
    let callbacks = 0;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert(++callbacks < 1000, "No immediate request/timer loop");
      this.time = next[1].at;
      this.timers.delete(next[0]);
      if (next[1].interval) this.timers.set(next[0], { ...next[1], at: this.time + next[1].interval });
      await act(async () => { next[1].callback(); });
    }
    this.time = end;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const pending: DeadlineState = { status: "in_progress", availableUntil: new Date(1000), activeRun: null };
const expired: DeadlineState = { ...pending, status: "expired" };

async function scenario(name: string, test: (clock: Clock, root: { textContent: string }, render: (node: ReturnType<typeof createElement> | null) => Promise<void>) => Promise<void>) {
  await withReactDomTest(async (root, render) => {
    const clock = new Clock();
    Object.assign(window, {
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      setInterval: clock.setInterval, clearInterval: clock.clearTimeout,
      addEventListener: () => {}, removeEventListener: () => {},
      localStorage: { getItem: () => null, setItem: () => {} },
    });
    const performanceNow = Object.getOwnPropertyDescriptor(performance, "now");
    const wallNow = Date.now;
    const timeout = globalThis.setTimeout;
    const clearTimeout = globalThis.clearTimeout;
    Object.defineProperty(performance, "now", { configurable: true, value: () => clock.time });
    Date.now = () => clock.time - 600_000;
    globalThis.setTimeout = clock.setTimeout as unknown as typeof setTimeout;
    globalThis.clearTimeout = clock.clearTimeout as unknown as typeof globalThis.clearTimeout;
    try { await test(clock, root, render); await render(null); }
    finally {
      if (performanceNow) Object.defineProperty(performance, "now", performanceNow);
      else Reflect.deleteProperty(performance, "now");
      Date.now = wallNow;
      globalThis.setTimeout = timeout;
      globalThis.clearTimeout = clearTimeout;
    }
  });
  console.log(`PASS ${name}`);
}

await scenario("early-active read autonomously reaches authoritative expiry", async (clock, root, render) => {
  const times: number[] = [];
  function Harness() {
    const [state, setState] = useState(pending);
    useParticipantDeadlineReconciliation({ attemptId: "original", state, now: clock.time, busy: false,
      refresh: async () => {
        times.push(clock.time);
        const next = times.length === 1 ? pending : expired;
        setState({ ...next });
        return next;
      }, onExhausted: () => assert.fail("Successful expiry must not show a failure notice"),
    });
    return createElement("p", null, state.status);
  }
  await render(createElement(Harness));
  await clock.advance(20_000);
  assert.equal(root.textContent, "expired");
  assert.deepEqual(times, [1000, 1500]);
});

await scenario("backoff, transient rejection/refusal, bounds and clock recross", async (clock, root, render) => {
  const times: number[] = [];
  let notices = 0;
  let changeNow!: (value: number) => void;
  function Harness() {
    const [now, setNow] = useState(1000);
    changeNow = setNow;
    useParticipantDeadlineReconciliation({ attemptId: "original", state: pending, now, busy: false,
      refresh: async () => { times.push(clock.time); if (times.length % 2) throw new Error("network"); return null; },
      onExhausted: () => { notices++; },
    });
    return createElement("p", null, "active");
  }
  await render(createElement(Harness));
  await clock.advance(0);
  await act(async () => { changeNow(611); });
  await clock.advance(15_500);
  await act(async () => { changeNow(1000); });
  await clock.advance(60_000);
  assert.deepEqual(times, [1000, 1500, 2500, 4500, 8500, 16500]);
  assert.equal(notices, 1);
  assert.equal(root.textContent, "active", "Clock hint never locally expires authoritative state");
});

await scenario("busy does not spend or strand budget; StrictMode keeps first schedule", async (clock, _root, render) => {
  let busy = true;
  let reads = 0;
  function Harness() {
    useParticipantDeadlineReconciliation({ attemptId: "original", state: pending, now: clock.time, busy,
      refresh: async () => { reads++; return expired; }, onExhausted: () => assert.fail(),
    });
    return createElement("p");
  }
  const view = () => createElement(StrictMode, null, createElement(Harness));
  await render(view());
  await clock.advance(50_000);
  assert.equal(reads, 0);
  busy = false;
  await render(view());
  await clock.advance(0);
  assert.equal(reads, 1);
  await render(null);
  assert.equal(clock.timers.size, 0);
});

await scenario("replacement deadlines and session precedence do not overlap reads", async (clock, _root, render) => {
  let state: DeadlineState = { status: "in_progress", availableUntil: new Date(10_000), activeRun: { id: "run1", serverDeadlineAt: new Date(1000) } };
  const first = deferred<DeadlineState | null>();
  let reads = 0;
  function Harness() {
    useParticipantDeadlineReconciliation({ attemptId: "original", state, now: clock.time, busy: false,
      refresh: async () => { reads++; return reads === 1 ? first.promise : expired; }, onExhausted: () => assert.fail(),
    });
    return createElement("p");
  }
  await render(createElement(Harness));
  await clock.advance(0);
  state = { ...state, activeRun: { id: "run2", serverDeadlineAt: new Date(3000) } };
  await render(createElement(Harness));
  await clock.advance(10_000);
  await render(createElement(Harness));
  assert.equal(reads, 1, "New target cannot overlap old transport");
  await act(async () => { first.resolve(pending); });
  await clock.advance(0);
  assert.equal(reads, 2, "Overall session cutoff supersedes a stale run read");
  await clock.advance(60_000);
  assert.equal(reads, 2);
});

await scenario("run-only expiry leaves later sections before overall cutoff", async (clock, _root, render) => {
  let reads = 0;
  function Harness() {
    const [state, setState] = useState<DeadlineState>({ ...pending, availableUntil: new Date(10_000), activeRun: { id: "run", serverDeadlineAt: new Date(1000) } });
    useParticipantDeadlineReconciliation({ attemptId: "original", state, now: clock.time, busy: false,
      refresh: async () => { reads++; const next = { ...state, activeRun: null }; setState(next); return next; },
      onExhausted: () => assert.fail(),
    });
    return createElement("p");
  }
  await render(createElement(Harness));
  await clock.advance(5000);
  assert.equal(reads, 1);
});

// Compile the actual controller body, replacing only its imported external
// boundaries. This executes the component's real hook wiring without importing
// server-only action infrastructure or creating a browser/server dependency.
const moduleSource = readFileSync(new URL("../modules/tryout/ParticipantAttemptModule.tsx", import.meta.url), "utf8");
const body = moduleSource.slice(moduleSource.indexOf("function useParticipantAttemptController("), moduleSource.indexOf("\nfunction ParticipantAttemptModule("));
assert(body.includes("useParticipantDeadlineReconciliation({"));
const controllerJs = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
type Controller = { state: (DeadlineState & { attemptId: string }) | null; busy: boolean; refresh: (background?: boolean) => Promise<DeadlineState | null> };
function compileController(read: (id: string) => Promise<unknown>, notices: Array<{ message: string; action?: { onClick: () => void } }>, navigation: string[] = []) {
  return new Function("useCallback", "useEffect", "useMemo", "useRef", "useState", "useRouter", "usePageStatusToast", "tryoutAttemptStateAction", "estimateServerClockOffset", "createSingleFlightRead", "useParticipantDeadlineReconciliation", "unstable_rethrow", "showToast",
    `${controllerJs}; return useParticipantAttemptController;`)(
    useCallback, useEffect, useMemo, useRef, useState, () => ({ push: (href: string) => navigation.push(href), replace: (href: string) => navigation.push(href) }), () => {}, read,
    (sample: { serverSentAt: number; clientReceivedAt: number }) => sample.serverSentAt - sample.clientReceivedAt,
    createSingleFlightRead, useParticipantDeadlineReconciliation, () => {},
    (message: string, options: { action?: { onClick: () => void } }) => { notices.push({ message, action: options.action }); },
  ) as (props: { attemptId: string }) => Controller;
}
function response(state: DeadlineState, serverTime: number, attemptId = "original") {
  return { ok: true, result: { ...state, attemptId, serverNow: new Date(serverTime).toISOString(), runs: [] }, clockSample: { serverSentAt: serverTime, serverReceivedAt: serverTime } };
}

await scenario("actual controller: calibration recross, silent failures, finite reads and manual recovery", async (clock, root, render) => {
  let reads = 0;
  let recover = false;
  const notices: Array<{ message: string; action?: { onClick: () => void } }> = [];
  const useController = compileController(async () => {
    reads++;
    if (reads === 1) return response(pending, clock.time);
    if (recover) return response(expired, clock.time);
    if (reads === 2) return response(pending, clock.time - 389);
    if (reads % 2) throw new Error("network");
    return { ok: false, message: "transient refusal" };
  }, notices);
  let controller!: Controller;
  function Harness() {
    controller = useController({ attemptId: "original" });
    return createElement("p", null, controller.state?.status);
  }
  await render(createElement(StrictMode, null, createElement(Harness)));
  await clock.advance(60_000);
  assert.equal(reads, 7, "Initial load plus six bounded automatic reads");
  assert.equal(notices.length, 1, "Background failures produce only one exhaustion notice");
  assert.equal(root.textContent, "in_progress");
  recover = true;
  await act(async () => { notices[0].action!.onClick(); });
  assert.equal(root.textContent, "expired");
  assert.equal(reads, 8);
  await clock.advance(60_000);
  assert.equal(reads, 8);
});

await scenario("actual controller: concurrent manual reads coalesce and unmounted responses are ignored", async (clock, _root, render) => {
  const read = deferred<unknown>();
  const notices: Array<{ message: string }> = [];
  let reads = 0;
  const useController = compileController(async () => { reads++; return read.promise; }, notices);
  let controller!: Controller;
  function Harness() { controller = useController({ attemptId: "original" }); return createElement("p", null, controller.state?.attemptId); }
  await render(createElement(Harness));
  await clock.advance(0);
  const oldRefresh = controller.refresh;
  let first!: Promise<DeadlineState | null>;
  let second!: Promise<DeadlineState | null>;
  await act(async () => { first = controller.refresh(); second = controller.refresh(); });
  assert.equal(first, second);
  assert.equal(reads, 1);
  await render(null);
  await act(async () => { read.resolve(response(expired, clock.time)); await first; });
  assert.equal(await oldRefresh(), null);
  assert.equal(notices.length, 0);
  assert.equal(clock.timers.size, 0);
});

// Keep the replacement mounted: unmounting here would hide an attempt-generation
// regression. Exercise both success orders and the obsolete request's error path.
for (const order of ["A before B", "B before A", "A failure after B"] as const) {
  await scenario(`actual controller: mounted replacement ignores obsolete response (${order})`, async (clock, root, render) => {
    const oldRead = deferred<unknown>();
    const replacementRead = deferred<unknown>();
    const notices: Array<{ message: string }> = [];
    const navigation: string[] = [];
    const reads: string[] = [];
    const useController = compileController(async (attemptId) => {
      reads.push(attemptId);
      return attemptId === "A" ? oldRead.promise : replacementRead.promise;
    }, notices, navigation);
    let controller!: Controller;
    let attemptId = "A";
    function Harness() {
      controller = useController({ attemptId });
      return createElement("p", null, controller.state?.attemptId ?? "loading");
    }
    await render(createElement(Harness));
    await clock.advance(0);
    assert.equal(controller.busy, true);
    attemptId = "B";
    await render(createElement(Harness));
    await clock.advance(0);
    assert.deepEqual(reads, ["A", "B"]);
    assert.equal(controller.busy, true);
    const settleOld = async () => {
      await act(async () => {
        if (order === "A failure after B") oldRead.reject(new Error("obsolete A network failure"));
        else oldRead.resolve(response(expired, clock.time, "A"));
      });
    };
    const settleReplacement = async () => {
      await act(async () => {
        replacementRead.resolve(response({ ...pending, availableUntil: new Date(100_000) }, clock.time, "B"));
      });
    };
    if (order === "A before B") {
      await settleOld();
      assert.equal(controller.state, null, "Obsolete A cannot populate the mounted B page");
      assert.equal(root.textContent, "loading");
      assert.equal(controller.busy, true, "Obsolete A cannot clear B's pending-read indicator");
      assert.equal(notices.length, 0);
      assert.deepEqual(navigation, []);
      await settleReplacement();
    } else {
      await settleReplacement();
      assert.equal(controller.state?.attemptId, "B");
      assert.equal(controller.busy, false);
      await settleOld();
    }
    assert.equal(root.textContent, "B", "Late A cannot replace B while B remains mounted");
    assert.equal(controller.state?.attemptId, "B");
    assert.equal(controller.state?.status, "in_progress");
    assert.equal(controller.busy, false);
    assert.equal(notices.length, 0, "Obsolete reads cannot show a recovery toast on B");
    assert.deepEqual(navigation, [], "Obsolete reads cannot navigate the mounted B page");
    await clock.advance(0);
    assert.deepEqual(reads, ["A", "B"]);
  });
}

await scenario("actual controller: hung read releases busy after 10s while retaining one transport fence", async (clock, _root, render) => {
  const hung = deferred<unknown>();
  let reads = 0;
  const notices: Array<{ message: string }> = [];
  const useController = compileController(async () => { reads++; return hung.promise; }, notices);
  let controller!: Controller;
  function Harness() { controller = useController({ attemptId: "original" }); return createElement("p"); }
  await render(createElement(Harness));
  await clock.advance(0);
  assert.equal(controller.busy, true);
  await clock.advance(10_000);
  assert.equal(controller.busy, false);
  await act(async () => { await controller.refresh(); });
  assert.equal(reads, 1, "Manual recovery cannot queue another hung transport");
  await act(async () => { hung.resolve(response(expired, clock.time)); });
  assert.equal(controller.state, null, "Late response after timeout is not applied");
  await act(async () => { await controller.refresh(); });
  assert.equal(reads, 2, "Recovery becomes available once original transport settles");
});

console.log("F-13 deadline reconciliation regression suite passed");
