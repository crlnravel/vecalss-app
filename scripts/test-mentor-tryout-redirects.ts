import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as context from "../lib/navigation/canonical-context";
import * as continuity from "../lib/navigation/mentor-tryout-continuity";

const catalogue = "/mentor/tryout?q=UTBK&status=published&page=2";
const filters = {
  q: "Nabila & Alya", status: "pending", page: "2",
  parent: "parent", returnTo: catalogue,
  resultQ: "Alya", resultStatus: "submitted",
};
type Route = (props: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, string | string[]>> }) => Promise<unknown>;

/** Execute the real route boundary; replace only framework/auth/data adapters. */
function loadRoute(path: string): { route: Route; sessionChecks: () => number } {
  let checks = 0;
  const record = { id: "exam", title: "Simulasi", status: "published", sessions: [{ id: "session" }] };
  const mocks: Record<string, unknown> = {
    "next/navigation": { redirect: (href: string) => { throw { kind: "redirect", href }; }, notFound: () => { throw { kind: "not-found" }; } },
    "@/lib/auth/access": { requireTutorSession: async () => { checks++; return { user: { id: "tutor" } }; } },
    "@/lib/navigation/canonical-context": context,
    "@/lib/tryout/repository": { getTryoutForEdit: async () => record },
    "@/lib/tryout/operations-view": { getOwnedTryoutOperationsView: async () => record, toTryoutWorkspaceView: (value: unknown) => value },
    "react/jsx-runtime": { jsx: () => "context-error", jsxs: () => "context-error" },
  };
  // These imported renderers are never invoked on the redirect paths under test.
  const requireMock = (name: string) => {
    if (name in mocks) return mocks[name];
    if (name === "@/lib/navigation/mentor-tryout-continuity") return continuity;
    if (name.startsWith("@/modules/") || name === "@/lib/tryout/participant-list") return {};
    throw new Error(`Unexpected route dependency: ${name}`);
  };
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { default?: Route } = {};
  new Function("require", "exports", javascript)(requireMock, exports);
  assert(exports.default);
  return { route: exports.default, sessionChecks: () => checks };
}

async function redirectOf(path: string, query: Record<string, string | string[]>) {
  const { route, sessionChecks } = loadRoute(path);
  try {
    await route({ params: Promise.resolve({ tryoutId: "exam" }), searchParams: Promise.resolve(query) });
    assert.fail("Expected a canonical redirect");
  } catch (error) {
    assert.equal(sessionChecks(), 1, "Every redirect retains tutor authorization");
    return error as { kind: string; href: string };
  }
}

for (const [suffix, delivery] of [["operations", "participants"], ["operations/policy", "policy"], ["operations/sessions", "sessions"], ["operations/sessions/new", "sessions"], ["operations/sessions/[sessionId]", "sessions"], ["operations/participants", "participants"]]) {
  const path = `app/mentor/tryout/[tryoutId]/${suffix}/page.tsx`;
  const receipt = await redirectOf(path, { ...filters, ...(suffix === "operations" ? { delivery: "participants" } : {}) });
  assert.equal(receipt.kind, "redirect");
  const actual = new URL(receipt.href, "http://local").searchParams;
  for (const [key, value] of Object.entries(filters)) assert.equal(actual.get(key), value, `${suffix} must retain ${key}`);
  assert.equal(actual.get("workspace"), "operations");
  assert.equal(actual.get("delivery"), delivery);
}
const results = await redirectOf("app/mentor/tryout/[tryoutId]/page.tsx", { ...filters, workspace: "results" });
assert.equal(results.kind, "redirect");
const resultQuery = new URL(results.href, "http://local").searchParams;
assert.equal(resultQuery.get("workspace"), "participants");
for (const [key, value] of Object.entries(filters)) assert.equal(resultQuery.get(key), value, `results alias must retain ${key}`);

for (const workspace of ["schedule", "attempts", "live"]) {
  const receipt = await redirectOf("app/mentor/tryout/[tryoutId]/page.tsx", { ...filters, workspace });
  assert.equal(receipt.kind, "redirect");
  const actual = new URL(receipt.href, "http://local").searchParams;
  assert.equal(actual.get("workspace"), "operations");
  for (const [key, value] of Object.entries(filters)) assert.equal(actual.get(key), value, `${workspace} alias must retain ${key}`);
}

const invalidQueries: Array<Record<string, string | string[]>> = [{ workspace: ["operations", "settings"] }, { returnTo: "https://evil.test" }];
for (const suffix of ["operations", "operations/policy", "operations/sessions", "operations/sessions/new", "operations/sessions/[sessionId]", "operations/participants"]) {
  for (const invalid of invalidQueries) {
    assert.equal((await redirectOf(`app/mentor/tryout/[tryoutId]/${suffix}/page.tsx`, invalid)).kind, "not-found", "Invalid incoming context must not be silently erased");
  }
}
// A legacy ?session= value is accepted and dropped from the canonical target.
for (const suffix of ["operations", "operations/sessions", "operations/sessions/[sessionId]"]) {
  const receipt = await redirectOf(`app/mentor/tryout/[tryoutId]/${suffix}/page.tsx`, { session: "legacy-session" });
  assert.equal(receipt.kind, "redirect", `${suffix} must accept a legacy session value`);
  assert.equal(new URL(receipt.href, "http://local").searchParams.has("session"), false, `${suffix} must drop a legacy session value`);
}
console.log("PASS actual tutor redirect boundaries preserve catalogue, admission, result and session context; invalid context is refused");
