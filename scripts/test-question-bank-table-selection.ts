import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("bank-table.tsx", fs.readFileSync("modules/mentor/components/question-bank-assessment-table.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "applyBulkLifecycle") callback = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback);
const banks = [
  { id: "a", title: "Bank A", revision: 3, status: "published" },
  { id: "b", title: "Bank B", revision: 7, status: "published" },
  { id: "c", title: "Bank C", revision: 2, status: "published" },
];
let entries = banks.map((bank) => ({ bank }));
let selection = { "bank-a": true, "bank-b": true, "bank-c": true };
let failures: string[] = [];
let refreshes = 0;
let applying = false;
const calls: Array<{ id: string; operation: string; revision: number }> = [];
const context = vm.createContext({
  selectedBanks: banks,
  busy: false,
  mutationInFlight: { current: false },
  state: {
    setIsApplying: (value: boolean) => { applying = value; },
    setEntries: (update: (current: typeof entries) => typeof entries) => { entries = update(entries); },
    setPendingConfirmation: () => {},
    refreshFromServer: () => { refreshes++; },
  },
  setSelection: (update: (current: typeof selection) => typeof selection) => { selection = update(selection); },
  setFeedback: (value: string[]) => { failures = value; },
  showToast: () => {},
  updateQuestionBankLifecycleAction: async (id: string, operation: string, options: { expectedRevision: number }) => {
    calls.push({ id, operation, revision: options.expectedRevision });
    await Promise.resolve();
    if (id === "b") return { ok: false, message: "Bank berubah. Muat ulang." };
    if (id === "c") throw new Error("network unavailable");
    return { ok: true, result: { revision: 4, status: "archived" } };
  },
});
vm.runInContext(ts.transpileModule(callback.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
await Promise.all([
  vm.runInContext('applyBulkLifecycle("archive")', context),
  vm.runInContext('applyBulkLifecycle("archive")', context),
]);
assert.deepEqual(calls, [
  { id: "a", operation: "archive", revision: 3 },
  { id: "b", operation: "archive", revision: 7 },
  { id: "c", operation: "archive", revision: 2 },
], "double confirmation cannot repeat mutations and every bank carries its revision");
assert.equal(entries[0].bank.status, "archived");
assert.equal(entries[0].bank.revision, 4);
assert.equal(entries[1].bank.status, "published", "failed banks retain authoritative state");
assert.deepEqual(JSON.parse(JSON.stringify(selection)), { "bank-b": true, "bank-c": true }, "only successful banks leave the selection");
assert.equal(failures.length, 2, "both optimistic conflict and thrown request remain visible");
assert.ok(failures[0].includes("Bank B"));
assert.ok(failures[1].includes("Bank C"));
assert.equal(refreshes, 1);
assert.equal(applying, false, "pending state clears after partial failure");
console.log("Bank table bulk actions preserve revision checks, partial failure and duplicate-submit protection.");
