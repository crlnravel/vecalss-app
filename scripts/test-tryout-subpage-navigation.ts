import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { buildMentorTryoutAttemptHref, parseMentorTryoutAttemptContext, parseMentorTryoutContext } from "../lib/navigation/canonical-context";
import { selectTryoutHistorySession } from "../lib/tryout/main-session";

const sessions = [
  { id: "empty-main", name: "Sesi utama" },
  { id: "historical", name: "Sesi lama" },
];
assert.equal(selectTryoutHistorySession(sessions, [{ sessionId: "historical" }])?.id, "historical", "Archived history starts on its actual historical records");
assert.equal(selectTryoutHistorySession(sessions, [])?.id, "empty-main", "An empty history keeps the normal main-session fallback");
assert.equal(selectTryoutHistorySession([], []), null);

const catalogue = "/mentor/tryout?q=Simulasi&status=published&page=2";
const query = new URLSearchParams({ workspace: "operations", parent: "parent", returnTo: catalogue, q: "Nabila", status: "pending", access: "all", page: "2" });
const source = readFileSync(new URL("../modules/mentor/KaptenTryoutSessionDetailPageModule.tsx", import.meta.url), "utf8");
const body = source.slice(source.indexOf("function SessionAttemptsTable("), source.indexOf("function SessionOpenDialog("));
const javascript = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
const Container = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
const Link = ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children);
const Button = ({ render, children }: { render: React.ReactElement; children?: ReactNode }) => React.cloneElement(render, {}, children);
const Table = new Function("React", "useSearchParams", "parseMentorTryoutContext", "buildMentorTryoutAttemptHref", "ReferenceSurface", "Table", "TableHeader", "TableRow", "TableHead", "TableBody", "TableCell", "Button", "Link", "attemptStateLabels", `${javascript}; return SessionAttemptsTable;`)(
  React, () => query, parseMentorTryoutContext, buildMentorTryoutAttemptHref,
  Container, Container, Container, Container, Container, Container, Container, Button, Link, { in_progress: "Berlangsung" },
);
const html = renderToStaticMarkup(createElement(Table, {
  tryoutId: "exam",
  delivery: { id: "historical", name: "Sesi lama", attempts: [{ id: "attempt", student: "Alya", runs: [], score: null, attemptState: "in_progress" }] },
}));
const href = html.match(/href="([^"]+)"/u)?.[1].replaceAll("&amp;", "&");
assert(href, "The actual rendered session table exposes a real attempt link");
const parsed = parseMentorTryoutAttemptContext(new URL(href, "http://local").searchParams);
assert.deepEqual(parsed.issues, []);
assert.equal(parsed.session, "historical");
assert.equal(parsed.workspace, "operations");
assert.equal(parsed.delivery, "sessions");
assert.equal(parsed.parent, "parent");
assert.equal(parsed.returnTo, catalogue);
assert.equal(parsed.q, "Nabila");
assert.equal(parsed.status, "pending");
assert.equal(parsed.page, 2);
console.log("PASS archived-history populated-session default and actual rendered session→attempt context");
