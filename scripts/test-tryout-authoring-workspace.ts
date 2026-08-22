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
assert.match(workspace, /const save = async \(status: "draft" \| "published" = "draft"\)/u, "ordinary save must default to draft");
assert.match(workspace, /void save\("draft"\)/u, "ordinary save controls must explicitly persist a draft");
assert.doesNotMatch(workspace, /void save\(\)/u, "ordinary save paths must never inherit draft.status");
assert.match(workspace, /void save\("published"\)/u, "publish must remain a separate explicit action");
assert.match(workspace, /keepMounted/u, "Schedule and access state must remain mounted across workspace tabs");
assert.match(workspace, /contentReady/u, "review must include package content readiness");
assert.match(workspace, /catReady/u, "review must include CAT readiness");
assert.match(workspace, /duplicateSourceCount/u, "review must include duplicate source detection");
assert.doesNotMatch(workspace, /role="listitem"/u, "section selector buttons must retain native button semantics");
assert.match(workspace, /Geser untuk area lain/u, "mobile tab rail must expose its horizontal-scroll cue");
assert.match(route, /contentElement="div"/u, "Tryout workspace route should keep one main landmark in the shell");
assert.match(workspace, /AssessmentReleaseNotice/u, "workspace must expose the durable release state");
assert.match(workspace, /Pratinjau peserta/u, "workspace must offer a read-only participant preview");
assert.match(workspace, /Simpan draft/u, "workspace must expose draft persistence");
assert.doesNotMatch(workspace, /\/mentor\/packages(?:\/|\b)/u, "workspace must not route mentors through package/version authoring");
assert.match(workspace, /Buka Bank Soal/u, "missing sources should point back to Bank Soal, not package authoring");
assert.match(workspace, /normalizeWorkspace/u, "legacy workspace query values must be normalized in one boundary");
assert.match(route, /initialWorkspace = query\.workspace \?\? "basics"/u, "route must preserve new workspace query values on reload");

console.log("Tryout authoring workspace contract passed.");
