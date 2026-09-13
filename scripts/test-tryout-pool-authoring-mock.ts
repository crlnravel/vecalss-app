import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workspace = await readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8");
const liveWorkspace = workspace.slice(workspace.indexOf("function KaptenTryoutBuilderPageModule"));

assert.match(workspace, /Pilih langsung/u, "workspace should expose the direct source path");
assert.match(workspace, /<Checkbox/u, "direct source selection should use a checklist");
assert.match(workspace, /toggleDirectQuestion/u, "checking a question should update the active Section");
for (const label of ["Pool Soal", "Blueprint", "Pasang sumber", "Sample sumber", "Lihat sample sumber &amp; kesiapan"]) {
  assert.doesNotMatch(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `workspace should not expose ${label}`);
}

assert.doesNotMatch(workspace, /type SelectionMode|function ReadyAssemblyPicker|attachReadyAssemblyAction|detachReadyAssemblyAction|previewAssemblyAction|<Switch|DropdownMenuRadioGroup/u, "the simplified UI must not expose assembly or CAT controls");
assert.doesNotMatch(workspace, /label: "Assembly siap dirilis"|readiness\.blockers/u, "Review should not expose assembly-specific readiness");
assert.match(workspace, /shuffleItems: true/u, "the simplified flow should randomize selected questions");
assert.doesNotMatch(liveWorkspace, /Mock flow lokal · belum tersimpan/u, "the live chooser must not advertise a local mock flow");
assert.doesNotMatch(liveWorkspace, /const hasLocalMockAssembly = draft\.sections\.some/u, "mock-only local state must not gate Tryout persistence");
assert.match(workspace, /saveTryoutAction/u, "the real Tryout save action remains the persistence boundary");

console.log("Tryout simplified authoring contract passed.");
