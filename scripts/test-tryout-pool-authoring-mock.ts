import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workspace = await readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8");
const liveWorkspace = workspace.slice(workspace.indexOf("function KaptenTryoutBuilderPageModule"));

for (const label of ["Pool Soal", "Blueprint", "CAT Pool", "Pasang sumber", "Sample sumber", "Lihat sample sumber &amp; kesiapan"]) {
  assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `workspace should expose ${label}`);
}

assert.match(workspace, /type SelectionMode = "direct" \| "set" \| "pool" \| "blueprint" \| "cat_pool"/u, "assembly modes should remain explicit selection modes");
assert.match(workspace, /function ReadyAssemblyPicker/u, "assembly modes should use the shared Ready picker");
assert.match(workspace, /attachReadyAssemblyAction\(\{ target: "tryout"/u, "attachment must use the Tryout server action");
assert.match(workspace, /detachReadyAssemblyAction\(\{ target: "tryout" \}/u, "detachment must use the Tryout server action");
assert.match(workspace, /previewAssemblyAction\(\{ versionId: assembly\.id \}\)/u, "preview must use the server-owned revision");
assert.match(workspace, /activeSelectionMode !== "direct"/u, "assembly mode must not start direct-source reads");
assert.match(workspace, /readiness\.blockers/u, "Review must surface current readiness blockers");
assert.match(workspace, /label: "Assembly siap dirilis"/u, "Review must include an assembly readiness gate");
assert.doesNotMatch(liveWorkspace, /Mock flow lokal · belum tersimpan/u, "the live chooser must not advertise a local mock flow");
assert.doesNotMatch(liveWorkspace, /const hasLocalMockAssembly = draft\.sections\.some/u, "mock-only local state must not gate Tryout persistence");
assert.match(workspace, /saveTryoutAction/u, "the real Tryout save action remains the persistence boundary");

console.log("Tryout Ready assembly authoring contract passed.");
