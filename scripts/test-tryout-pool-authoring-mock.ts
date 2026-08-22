import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const workspace = await readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8");

for (const label of ["Pool acak", "Blueprint", "CAT Pool", "Mock flow lokal · belum tersimpan", "Lihat sample", "Uji kandidat stale"]) {
  assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `workspace should expose ${label}`);
}

assert.match(workspace, /type SelectionMode = "direct" \| "set" \| "pool" \| "blueprint" \| "cat_pool"/u, "mock modes should be local selection modes");
assert.match(workspace, /const hasLocalMockAssembly = draft\.sections\.some/u, "mock modes should be tracked separately from persisted source data");
assert.match(workspace, /if \(hasLocalMockAssembly\) \{/u, "saving a mock mode must stop before the server action");
assert.match(workspace, /activeSelectionMode !== "direct"/u, "Pool mock mode must not start direct-source reads");
assert.match(workspace, /previewState: selectedStale\.length \? "stale" : selectedCandidates\.length < draft\.drawCount \? "shortage" : "sample"/u, "Pool preview must expose stale and shortage states");
assert.match(workspace, /canonical 2PL/u, "CAT mock must surface calibration readiness");
assert.match(workspace, /Kuis/u, "CAT mock must state the Tryout-only boundary");
assert.doesNotMatch(workspace, /saveTryoutAction\([^)]*pool/u, "Pool mock must not add a persistence action");

console.log("Tryout Pool authoring mock contract passed.");
