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
assert.match(workspace, /FullWidthLineTabsList/u, "workspace tabs must use the shared full-width line list");
assert.match(workspace, /FullWidthLineTabsTrigger/u, "workspace tabs must use the shared full-width line triggers");
assert.match(workspace, /overflow-x-auto/u, "workspace tabs must remain navigable on narrow screens");
assert.match(workspace, /min-w-\[68rem\] xl:min-w-0/u, "workspace tabs must preserve readable labels in the narrow-screen rail");
assert.doesNotMatch(workspace, /data-active:bg-white/u, "workspace tabs must not use the compact pill active treatment");
assert.doesNotMatch(workspace, /flex h-auto w-full max-w-full flex-wrap items-stretch justify-start gap-1 rounded-2xl bg-primary-50 p-1/u, "workspace tabs must not use the compact wrapped treatment");
assert.doesNotMatch(workspace, /tabRailRef/u, "workspace tabs must not depend on a horizontal scroll rail");
for (const redundantNavigationLabel of [
  "Lanjut ke Sections",
  "Sebelumnya",
  "Atur Questions",
  "Kembali ke Sections",
  "Atur Rules",
  "Atur Schedule & akses",
  "Lanjut ke Publish",
]) {
  assert.doesNotMatch(workspace, new RegExp(redundantNavigationLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"), `${redundantNavigationLabel} must not be rendered as in-panel navigation`);
}
assert.match(workspace, /htmlFor="section-subject"/u, "Sections must label the subject/section dropdown");
assert.match(workspace, /id="section-subject"/u, "Sections must expose a stable subject/section dropdown id");
assert.match(workspace, /className="w-full justify-between bg-white" disabled=\{draft\.locked\} id="section-subject"/u, "Subject/section dropdown must span the Sections card");
assert.match(workspace, /Urutan Section Tryout/u, "Sections must keep the seven-section order in the selector");
assert.match(workspace, /Urutan peserta: PU → PPU → PBM → PK → LBI → LBE → PM/u, "Sections must state the participant order");
assert.match(workspace, /activeSectionSourceSummary/u, "Sections must expose the selected section source summary");
assert.match(workspace, /md:grid-cols-\[minmax\(12rem,16rem\)_minmax\(0,1fr\)\]/u, "Section fields must reflow responsively inside one card");
assert.doesNotMatch(workspace, /lg:grid-cols-\[minmax\(15rem,18rem\)_minmax\(0,1fr\)\]/u, "Sections must not render the old list/detail split");
assert.doesNotMatch(workspace, /aria-label="Daftar Section Tryout"/u, "Sections must not render the old seven-item rail");
assert.match(workspace, /htmlFor="question-subject"/u, "Questions must label the subject dropdown");
assert.match(workspace, /id="question-subject"/u, "Questions must expose a full-width subject dropdown");
assert.match(workspace, /className="w-full justify-between bg-white" disabled=\{draft\.locked\} id="question-subject"/u, "Subject dropdown must span the source form");
assert.match(workspace, /htmlFor="question-selection-mode"/u, "Questions must label the selection-mode dropdown");
assert.match(workspace, /id="question-selection-mode"/u, "Questions must expose a full-width selection-mode dropdown");
assert.match(workspace, /className="w-full justify-between bg-white" disabled=\{draft\.locked\} id="question-selection-mode"/u, "Selection-mode dropdown must span the source form");
assert.ok(workspace.indexOf('id="question-subject"') < workspace.indexOf('id="question-selection-mode"'), "Subject dropdown must precede selection mode");
assert.match(workspace, /selectionModeOptions\.map/u, "Questions must keep all supported source modes in the dropdown");
assert.match(workspace, /selectionModeDescription\(activeSelectionMode\)/u, "Questions must keep helper text next to the selected mode");
assert.doesNotMatch(workspace, /Cara memilih soal/u, "Questions must not repeat the source-choice heading");
assert.doesNotMatch(workspace, /aria-label="Mode sumber soal"/u, "Questions must not render the old source-card radio rail");
assert.doesNotMatch(workspace, /sm:grid-cols-2 lg:grid-cols-5/u, "Questions must not render a horizontal source-card rail");
assert.doesNotMatch(workspace, /<FieldLabel>Urutan<\/FieldLabel>/u, "section editor must not expose a redundant order field");
assert.match(route, /contentElement="div"/u, "Edit Tryout route should keep the shell landmark as the only main");
assert.match(createRoute, /contentElement="div"/u, "Create Tryout route should keep the shell landmark as the only main");
assert.match(shell, /<SidebarInset\b/u, "workspace shell must render the page landmark container");
assert.match(sidebar, /function SidebarInset[\s\S]*?<main\b/u, "sidebar inset must own the page main landmark");
assert.match(workspace, /AssessmentReleaseNotice/u, "workspace must expose the durable release state");
assert.doesNotMatch(workspace, /Rilis pertama dibuat saat Tryout diterbitkan dan tervalidasi server\. Sesi peserta akan memakai rilis yang sama\./u, "workspace must not repeat the top-level release notice copy");
assert.match(workspace, /Pratinjau peserta/u, "workspace must offer a read-only participant preview");
assert.match(workspace, /Simpan draft/u, "workspace must expose draft persistence");
assert.doesNotMatch(workspace, /\/mentor\/packages(?:\/|\b)/u, "workspace must not route mentors through package/version authoring");
assert.match(workspace, /Buka Bank Soal/u, "missing sources should point back to Bank Soal, not package authoring");
assert.match(workspace, /normalizeWorkspace/u, "legacy workspace query values must be normalized in one boundary");
assert.match(route, /initialWorkspace = query\.workspace \?\? "basics"/u, "route must preserve new workspace query values on reload");

console.log("Tryout authoring workspace contract passed.");
