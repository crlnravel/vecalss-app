import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const detail = await readFile(
  `${root}/modules/mentor/KaptenQuizDetailPageModule.tsx`,
  "utf8",
);

assert.match(
  detail,
  /ResourceEditLockProvider[\s\S]*useResourceEditLock/u,
  "Kuis detail must use the shared resource edit-lock boundary",
);
assert.match(
  detail,
  /const resourceLock = useResourceEditLock\(\);/u,
  "Kuis detail saves must read the current edit-lock proof",
);

const saveSettingsStart = detail.indexOf("async function saveSettings(");
const saveSettingsEnd = detail.indexOf("\n  const subject =", saveSettingsStart);
assert.ok(saveSettingsStart >= 0, "Kuis detail must keep its settings save boundary");
assert.ok(saveSettingsEnd > saveSettingsStart, "Kuis detail save boundary must remain readable");
const saveSettings = detail.slice(saveSettingsStart, saveSettingsEnd);
assert.match(
  saveSettings,
  /if \(\s*!resourceLock\.canEdit\s*\|\|\s*isSaving/u,
  "Kuis detail must not submit while its edit lease is unavailable",
);
assert.match(
  saveSettings,
  /editLease:\s*resourceLock\.proof\s*\?\?\s*undefined/u,
  "Kuis detail save must forward the lease proof to the server action",
);

const exportedModuleStart = detail.indexOf("function KaptenQuizDetailPageModule(");
const exportedModuleEnd = detail.indexOf("\nexport {", exportedModuleStart);
assert.ok(exportedModuleStart >= 0, "Kuis detail module must remain exported");
assert.ok(exportedModuleEnd > exportedModuleStart, "Kuis detail module wrapper must remain readable");
const exportedModule = detail.slice(exportedModuleStart, exportedModuleEnd);
assert.match(
  exportedModule,
  /<ResourceEditLockProvider[\s\S]*resourceId=\{props\.initialQuiz\.id\}[\s\S]*resourceType="quiz"/u,
  "Kuis detail must claim the quiz lease for the quiz being edited",
);

console.log("Kuis detail edit-lease contract passed.");
