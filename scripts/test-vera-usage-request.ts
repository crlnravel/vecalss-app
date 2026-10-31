import assert from "node:assert/strict";
import { act, createElement, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useAiUsage } from "../modules/admin/ai/use-ai-usage";
import { buildVeraAiUsageDto } from "../lib/admin/ai/aggregators";
import { withReactDomTest } from "./react-dom-test-host";
import { AiControlPlaneNav } from "../modules/admin/ai/components/AiControlPlaneNav";

const originalFetch = globalThis.fetch;
const pending: { url: string; resolve: (r: Response) => void; reject: (error: Error) => void; signal: AbortSignal }[] = [];
const timers = new Map<number, () => void>();
let timerId = 0;
let current!: ReturnType<typeof useAiUsage>;
function Harness() {
  const state = useAiUsage();
  useLayoutEffect(() => { current = state; });
  return createElement("div", null, state.data ? `${state.data.metricSelected}:${state.data.range.from}` : "No report");
}
function reply(metric: "quota_units" | "tokens") {
  return Response.json(buildVeraAiUsageDto({ requests: [], admissions: [], now: new Date("2026-10-15T05:00:00Z") }, { metric }));
}
async function flushTimers() {
  await act(async () => {
    for (const [id, run] of timers) { timers.delete(id); run(); }
  });
}

try {
  // Deliberately ignore cancellation at the transport boundary: stale replies must still be fenced.
  globalThis.fetch = ((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    pending.push({ url, resolve, reject, signal: init.signal as AbortSignal });
  })) as typeof fetch;
  await withReactDomTest(async (root, render) => {
    Object.assign(window, {
      setTimeout: (run: () => void) => { const id = ++timerId; timers.set(id, run); return id; },
      clearTimeout: (id: number) => timers.delete(id),
    });
    await render(createElement(Harness));
    await flushTimers();
    assert.equal(pending.length, 1);
    await act(async () => { current.selectMetric("tokens"); });
    assert.equal(root.textContent, "No report", "selection must not relabel retained data");
    assert.equal(pending[0].signal.aborted, true);
    await flushTimers();
    assert.equal(pending.length, 2);
    await act(async () => { pending[1].resolve(reply("tokens")); });
    assert.ok(root.textContent.startsWith("tokens:"));
    await act(async () => { pending[0].resolve(reply("quota_units")); });
    assert.ok(root.textContent.startsWith("tokens:"), "older success must not overwrite the selected report");
    const confirmed = current.data;
    await act(async () => { current.selectPeriod("7days"); });
    assert.equal(current.data, confirmed, "period changes preserve the previous report with its original range");
    assert.ok(root.textContent.startsWith("tokens:"));
    await flushTimers();
    assert.equal(new URL(pending[2].url, "http://localhost").searchParams.get("timezone"), "Asia/Jakarta");
    await act(async () => { pending[2].reject(new Error("offline")); });
    assert.equal(current.data, confirmed, "a failed period update must retain the last confirmed report");
    assert.ok(current.error?.includes("belum berhasil dimuat"));
    assert.equal(current.isLoading, false);
    let refresh!: Promise<void>;
    await act(async () => { refresh = current.loadUsage(); });
    await act(async () => { pending[3].resolve(reply("tokens")); await refresh; });
    assert.equal(current.error, null);
    assert.ok(root.textContent.startsWith("tokens:"), "retry restores the selected metric");
    await act(async () => { current.selectMetric("quota_units"); });
    assert.equal(current.data?.metricSelected, "tokens", "a new selection never relabels the retained report");
    await flushTimers();
    await render(null);
    assert.equal(pending[4].signal.aborted, true, "unmount cancels pending work");
    await act(async () => { pending[4].resolve(reply("quota_units")); });
  });
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Vera usage mounted request-order, range recovery and unmount checks passed");

const nav = renderToStaticMarkup(createElement(AiControlPlaneNav, {activeTab:"reliability"}));
for (const path of ["/admin/ai", "/admin/ai/usage", "/admin/ai/providers", "/admin/ai/reliability", "/admin/ai/policies"]) {
  assert.ok(nav.includes(`href="${path}"`), `existing destination ${path} remains discoverable`);
}
assert.equal((nav.match(/aria-current="page"/g) ?? []).length, 1);
assert.match(nav, /aria-current="page"[^>]*href="\/admin\/ai\/reliability"/);
assert.ok(!nav.includes("hidden sm:inline"), "mobile link labels stay readable");
console.log("Vera existing-route navigation checks passed");
