import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act, createElement, useMemo, useState, type ReactElement } from "react";
import ts from "typescript";
import { buildMentorTryoutAttemptBackHref, buildMentorTryoutAttemptHref, buildMentorTryoutHref, buildMentorTryoutOperationsHref, parseMentorTryoutAttemptContext, parseMentorTryoutContext } from "../lib/navigation/canonical-context";
import { withReactDomTest } from "./react-dom-test-host";

const queryFor = (href: string) => new URL(href, "http://localhost").searchParams;
for (const resultStatus of ["all", "submitted", "in_progress"] as const) {
  const href = buildMentorTryoutAttemptHref("tryout", "attempt", { workspace: "participants", parent: "parent", participant: "admission", session: "session", resultQ: "Arya & Dimas", resultStatus, returnTo: "/mentor/tryout?folder=parent" });
  const parsed = parseMentorTryoutAttemptContext(queryFor(href)); assert.deepEqual(parsed.issues, []);
  const back = buildMentorTryoutAttemptBackHref("tryout", parsed);
  const results = parseMentorTryoutContext(queryFor(back)); assert.deepEqual(results.issues, []); assert.equal(results.workspace, "participants"); assert.equal(results.delivery, null);
  assert.equal(results.resultQ, "Arya & Dimas"); assert.equal(results.resultStatus, resultStatus); assert.equal(results.parent, "parent"); assert.equal(results.session, "session"); assert.equal(results.returnTo, "/mentor/tryout?folder=parent");
  assert.equal(results.status, undefined, "Hasil status must not become admission status");
}
for (const delivery of ["sessions", "participants", "policy"] as const) {
  const context = { workspace: "operations" as const, delivery, session: "session", parent: "parent", q: "Dimas", status: "active", access: "active", page: 2 };
  const parsed = parseMentorTryoutAttemptContext(queryFor(buildMentorTryoutAttemptHref("tryout", "attempt", context)));
  assert.deepEqual(parsed.issues, []); const back = buildMentorTryoutAttemptBackHref("tryout", parsed);
  assert.equal(back, buildMentorTryoutOperationsHref("tryout", context));
}
assert(parseMentorTryoutContext({ status: "submitted" }).issues.some((issue) => issue.field === "status"));
assert(parseMentorTryoutContext({ resultStatus: "active" }).issues.some((issue) => issue.field === "resultStatus"));
assert(parseMentorTryoutContext({ resultStatus: ["submitted", "in_progress"] }).issues.some((issue) => issue.field === "resultStatus"));
assert(parseMentorTryoutContext({ resultQ: ["one", "two"] }).issues.some((issue) => issue.field === "resultQ"));
assert(parseMentorTryoutContext({ resultQ: "a".repeat(161) }).issues.some((issue) => issue.field === "resultQ"));
assert.equal(parseMentorTryoutContext({ workspace: "participants", delivery: "participants" }).workspace, "operations", "TA01 legacy registration semantics remain intact");

// Execute the actual Hasil component's hook/handler/column bodies. Only router,
// location and UI rendering boundaries are replaced, matching the F13 host pattern.
const source = readFileSync(process.env.SR02_HASIL_MODULE_SOURCE ?? new URL("../modules/mentor/KaptenTryoutParticipantsPageModule.tsx", import.meta.url), "utf8");
const body = source.slice(source.indexOf("function KaptenTryoutParticipantsPageModule("), source.indexOf("\nexport { KaptenTryoutParticipantsPageModule"));
const javascript = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
type Attempt = { id: string; admissionId: string; sessionId: string; student: string; status: string; attemptState: string; serverStartedAt: null };
type Table = { rows: Attempt[]; columns: Array<{ cell: (attempt: Attempt) => ReactElement<{ href: string }> }>; onRowClick: (attempt: Attempt) => void; search: { value: string; onValueChange: (value: string) => void }; filterPanel: ReactElement<{ filter: string; onChange: (value: string) => void }> };
let table!: Table;
let currentQuery = new URLSearchParams("workspace=participants&parent=parent&resultQ=Arya&resultStatus=submitted");
const pushes: string[] = [];
const Hasil = new Function("React", "useMemo", "useState", "useRouter", "useSearchParams", "parseMentorTryoutContext", "buildMentorTryoutAttemptHref", "buildMentorTryoutHref", "buildMentorTryoutOperationsHref", "ReferenceSurface", "Link", "DataTable", "TryoutResultFilterPanel", "isInProgress", "dateTime", "resultFilterLabels", `${javascript}; return KaptenTryoutParticipantsPageModule;`)(
  React, useMemo, useState, () => ({ push: (href: string) => pushes.push(href) }), () => currentQuery,
  parseMentorTryoutContext, buildMentorTryoutAttemptHref, buildMentorTryoutHref, buildMentorTryoutOperationsHref,
  ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  ({ children, href }: { children: React.ReactNode; href: string }) => createElement("a", { href }, children),
  (props: Table) => { table = props; return createElement("p", null, `Rows:${props.rows.length}`); },
  () => createElement("p"), (attempt: Attempt) => attempt.status === "in_progress" || attempt.attemptState === "in_progress",
  new Intl.DateTimeFormat("id-ID"), { all: "Semua", submitted: "Terkirim", in_progress: "Berjalan" },
) as (props: { initial: unknown; parentId?: string }) => ReactElement;
const attempts: Attempt[] = [{ id: "expired", admissionId: "admission", sessionId: "session", student: "Arya", status: "expired", attemptState: "expired", serverStartedAt: null }, { id: "active", admissionId: "other-admission", sessionId: "session", student: "Dimas", status: "in_progress", attemptState: "in_progress", serverStartedAt: null }];
await withReactDomTest(async (_root, render) => {
  const history = { replaceState: (_state: unknown, _unused: string, href: string) => { currentQuery = queryFor(href); } };
  Object.assign(window, { history });
  const initial = { id: "tryout", attempts, results: [] };
  await render(createElement(Hasil, { initial, parentId: "parent" }));
  assert.equal(table.search.value, "Arya"); assert.equal(table.filterPanel.props.filter, "submitted"); assert.deepEqual(table.rows.map((row) => row.id), ["expired"]);
  const link = table.columns[0].cell(attempts[0]);
  await act(async () => { table.onRowClick(attempts[0]); }); assert.equal(pushes.at(-1), link.props.href, "row and real participant link share the same Hasil context");
  let parsed = parseMentorTryoutAttemptContext(queryFor(link.props.href)); assert.equal(parsed.workspace, "participants"); assert.equal(parsed.resultQ, "Arya"); assert.equal(parsed.resultStatus, "submitted"); assert.deepEqual(parsed.issues, []);
  currentQuery = queryFor(buildMentorTryoutAttemptBackHref("tryout", parsed));
  await render(null); await render(createElement(Hasil, { initial }));
  assert.equal(table.search.value, "Arya"); assert.equal(table.filterPanel.props.filter, "submitted");
  await act(async () => { table.search.onValueChange("Dimas"); });
  await act(async () => { table.filterPanel.props.onChange("in_progress"); });
  assert.equal(currentQuery.get("workspace"), "participants"); assert.equal(currentQuery.get("resultStatus"), "in_progress"); assert.equal(currentQuery.get("resultQ"), "Dimas"); assert.equal(currentQuery.get("status"), null);
  assert.deepEqual(table.rows.map((row) => row.id), ["active"]);
  parsed = parseMentorTryoutAttemptContext(queryFor(table.columns[0].cell(attempts[1]).props.href));
  assert.equal(parsed.resultStatus, "in_progress"); assert.equal(parsed.resultQ, "Dimas"); assert.equal(parsed.parent, "parent");
  await render(null); await render(createElement(Hasil, { initial }));
  assert.equal(table.search.value, "Dimas"); assert.equal(table.filterPanel.props.filter, "in_progress");
});
const route = readFileSync(new URL("../app/mentor/tryout/[tryoutId]/operations/attempts/[attemptId]/page.tsx", import.meta.url), "utf8");
assert.match(route, /buildMentorTryoutAttemptBackHref\(tryoutId, \{ \.\.\.parsedQuery, session: delivery.id \}\)/);
const parentRoute = readFileSync(new URL("../app/mentor/tryout/[tryoutId]/page.tsx", import.meta.url), "utf8");
assert.match(parentRoute, /resultQ: parsedQuery.resultQ/); assert.match(parentRoute, /resultStatus: parsedQuery.resultStatus/);
console.log("PASS actual mounted Hasil link/row→attempt→canonical back/reload retains search/filter/parent; Operations and admission semantics preserved; invalid result context refused");
