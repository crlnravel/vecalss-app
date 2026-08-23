import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [workspace, route, createRoute, shell, sidebar] = await Promise.all([
  readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/create/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/components/mentor-workspace-shell.tsx`, "utf8"),
  readFile(`${root}/components/ui/sidebar.tsx`, "utf8"),
]);

for (const label of [
  "Build",
  "Review & Publish",
  "Delivery",
  "Operations",
  "Results",
  "Overview",
  "Configure Sections",
  "Readiness",
  "Published versions",
  "Policy",
  "Sessions",
  "Participants",
  "Live",
  "Attempts",
  "Results & release",
]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(workspace, new RegExp(escapedLabel, "u"), `workspace should expose ${label}`);
}

assert.match(workspace, /const draftWorkspacePhases/u, "draft navigation must be grouped into lifecycle phases");
assert.match(workspace, /const publishedWorkspacePhases/u, "published navigation must be grouped into lifecycle phases");
assert.match(workspace, /const lifecyclePhaseOrder/u, "the lifecycle roadmap must preserve orientation while future phases are locked");
assert.doesNotMatch(workspace, /items: \[[\s\S]*?Questions[\s\S]*?Rules/u, "Questions and Rules must not remain peer-level navigation items");
assert.match(workspace, /const deliveryAreas/u, "Delivery must expose Policy, Sessions, and Participants");
assert.match(workspace, /SectionRail/u, "Section setup must remain visible as a persistent rail");
assert.match(workspace, /sectionReadiness/u, "Section rail must expose per-section readiness");
assert.match(workspace, /contentReviewChecks/u, "Review must separate content readiness");
assert.match(workspace, /deliveryReviewChecks/u, "Review must separate delivery readiness");
assert.match(workspace, /Preview alur peserta/u, "Build must offer a participant-flow preview");
assert.match(workspace, /Sample sumber/u, "source preview must be named explicitly");
assert.match(workspace, /Lihat sample sumber &amp; kesiapan/u, "source preview copy must distinguish readiness from participant preview");
assert.match(workspace, /normalizeWorkspace/u, "legacy workspace query values must be normalized in one boundary");
assert.match(workspace, /deliveryAreaFor/u, "legacy Delivery query values must land in a stable subarea");
assert.match(workspace, /value === "operations"\) return "sessions"/u, "legacy operations query must land on Sessions");

assert.match(workspace, /saveTryoutAction/u, "draft and publish must use the canonical Tryout save action");
assert.match(workspace, /const save = async \(status: "draft" \| "published" = "draft"\): Promise<boolean>/u, "ordinary save must default to draft and report server success");
assert.match(workspace, /void save\("draft"\)/u, "ordinary save controls must explicitly persist a draft");
assert.doesNotMatch(workspace, /void save\(\)/u, "ordinary save paths must never inherit draft.status");
assert.match(workspace, /void save\("published"\)/u, "publish must remain a separate explicit action");
assert.match(workspace, /keepMounted/u, "Delivery state must remain mounted across workspace tabs");
assert.match(workspace, /duplicateSourceCount/u, "Review must include duplicate source detection");
assert.match(workspace, /FullWidthLineTabsList/u, "workspace tabs must use the shared full-width line list");
assert.match(workspace, /FullWidthLineTabsTrigger/u, "workspace tabs must use the shared full-width line triggers");
assert.match(workspace, /overflow-x-auto/u, "workspace tabs must remain navigable on narrow screens");
assert.doesNotMatch(workspace, /data-active:bg-white/u, "workspace tabs must not use the compact pill active treatment");
assert.doesNotMatch(workspace, /flex h-auto w-full max-w-full flex-wrap items-stretch justify-start gap-1 rounded-2xl bg-primary-50 p-1/u, "workspace tabs must not use the compact wrapped treatment");
assert.doesNotMatch(workspace, /<FieldLabel>Urutan<\/FieldLabel>/u, "section editor must not expose a redundant order field");
assert.match(route, /contentElement="div"/u, "Edit Tryout route should keep the shell landmark as the only main");
assert.match(createRoute, /contentElement="div"/u, "Create Tryout route should keep the shell landmark as the only main");
assert.match(shell, /<SidebarInset\b/u, "workspace shell must render the page landmark container");
assert.match(sidebar, /function SidebarInset[\s\S]*?<main\b/u, "sidebar inset must own the page main landmark");
assert.match(workspace, /AssessmentReleaseNotice/u, "workspace must expose the durable release state");
assert.match(workspace, /Simpan perubahan/u, "workspace must expose draft persistence");
assert.match(workspace, /dirtyNavigationOpen/u, "dirty navigation must require an explicit Save, Discard, or Stay decision");
assert.match(workspace, /updateTryoutMetadataAction/u, "published details must use a metadata-only server action");
assert.match(workspace, /Buat draf perubahan/u, "published structural changes must use an explicit change draft");
assert.doesNotMatch(workspace, /\/mentor\/packages(?:\/|\b)/u, "workspace must not route mentors through package authoring");
assert.match(workspace, /Buka Bank Soal/u, "missing sources should point back to Bank Soal, not package authoring");
assert.match(route, /initialWorkspace = query\.workspace \?\? "basics"/u, "route must preserve new workspace query values on reload");

console.log("Tryout authoring workspace contract passed.");
