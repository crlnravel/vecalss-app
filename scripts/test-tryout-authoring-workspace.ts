import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [workspace, route] = await Promise.all([
  readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/page.tsx`, "utf8"),
]);

for (const label of [
  "Basics",
  "Sections",
  "Questions",
  "Rules",
  "Schedule & akses",
  "Results",
  "Review",
  "Publish",
]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(workspace, new RegExp(escapedLabel, "u"), `workspace should expose ${label}`);
}

assert.match(workspace, /saveTryoutAction/u, "draft and publish must use the canonical Tryout save action");
assert.match(workspace, /void save\("published"\)/u, "publish must remain a separate explicit action");
assert.match(workspace, /AssessmentReleaseNotice/u, "workspace must expose the durable release state");
assert.match(workspace, /Pratinjau peserta/u, "workspace must offer a read-only participant preview");
assert.match(workspace, /Simpan draft/u, "workspace must expose draft persistence");
assert.doesNotMatch(workspace, /\/mentor\/packages(?:\/|\b)/u, "workspace must not route mentors through package/version authoring");
assert.match(workspace, /Buka Bank Soal/u, "missing sources should point back to Bank Soal, not package authoring");
assert.match(workspace, /normalizeWorkspace/u, "legacy workspace query values must be normalized in one boundary");
assert.match(route, /initialWorkspace = query\.workspace \?\? "basics"/u, "route must preserve new workspace query values on reload");

console.log("Tryout authoring workspace contract passed.");
