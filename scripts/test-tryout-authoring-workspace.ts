import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [workspace, route, createRoute, shell, sidebar, repository, useRoute, useModule, actions] = await Promise.all([
  readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/create/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/components/mentor-workspace-shell.tsx`, "utf8"),
  readFile(`${root}/components/ui/sidebar.tsx`, "utf8"),
  readFile(`${root}/lib/tryout/repository.ts`, "utf8"),
  readFile(`${root}/app/mentor/packages/[packageId]/use/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenPackageUsePageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/tryout-actions.ts`, "utf8"),
]);

for (const label of [
  "Soal",
  "Review & Publish",
  "Delivery",
  "Operations",
  "Results",
  "Overview",
  "Configure Sections",
  "Sections",
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
assert.match(workspace, /function lifecyclePhasesForMode\(mode: WorkflowMode\)/u, "the lifecycle roadmap must be scoped to the current mode");
assert.match(workspace, /lifecyclePhases\.map\(\(phase\)/u, "the roadmap must render only mode-relevant phases");
assert.match(workspace, /type WorkspacePhase = "overview"[\s\S]*"build"/u, "draft navigation must model Overview separately from Soal");
assert.match(workspace, /label: "Overview",\s*value: "overview"[\s\S]*label: "Soal",\s*value: "build"/u, "Overview must appear before Soal in the lifecycle roadmap");
assert.match(workspace, /items: \[\{ label: "Configure Sections", value: "sections" \}\]/u, "Soal must contain Configure Sections as its only subarea");
assert.match(workspace, /items: \[\{ label: "Review & Publish", value: "review" \}\]/u, "Review & Publish must be a single summary workspace without inner tabs");
assert.doesNotMatch(workspace, /Readiness server|Content readiness|Delivery readiness|Published versions|contentReviewChecks|deliveryReviewChecks|readyToPublish|TabsContent className="mt-0" value="publish"/u, "Review & Publish must not expose readiness or version sub-tabs");
assert.match(workspace, /<dt className="text-sm font-semibold text-secondary-600">Judul[\s\S]*draft\.title[\s\S]*<dt className="text-sm font-semibold text-secondary-600">Deskripsi[\s\S]*draft\.description/u, "Review & Publish must show the Tryout title and description in one column");
assert.match(workspace, /draft\.sections\.map[\s\S]*durationMinutes/u, "Review & Publish must summarize every Section duration");
assert.doesNotMatch(workspace, /Ringkasan Tryout|Tinjau ringkasan Tryout/u, "Review & Publish must stay flat and concise");
assert.match(workspace, /setPublishOpen\(true\)[\s\S]*Terbitkan/u, "Review & Publish must expose one primary publish action");
assert.match(workspace, /Setelah tryout di-publish dan terdapat siswa mengerjakan/u, "publish confirmation must use plain-language locking guidance");
assert.match(workspace, /AlertDialogContent className="!max-w-xl rounded-5xl gap-5"[\s\S]*AlertDialogFooter className="!justify-stretch grid w-full gap-2"/u, "unsaved-change confirmation must keep its actions inside a responsive modal layout");
assert.doesNotMatch(workspace, /items: \[[\s\S]*?Questions[\s\S]*?Rules/u, "Questions and Rules must not remain peer-level navigation items");
assert.match(workspace, /const deliveryAreas/u, "Delivery must expose Policy, Sessions, and Participants");
assert.match(workspace, /SectionRail/u, "Section setup must remain visible as a persistent rail");
assert.match(workspace, /sectionReadiness/u, "Section rail must expose per-section readiness");
assert.match(workspace, /aria-label="Kembali ke semua Tryout"[\s\S]*size="icon"[\s\S]*<ChevronLeft/u, "Tryout workspace back navigation must be an icon-only chevron control");
assert.doesNotMatch(workspace, /TRYOUT WORKSPACE|Mode authoring|Mode operasional|Semua Tryout/u, "workspace header copy and mode label must stay out of the builder surface");
assert.doesNotMatch(workspace, /function phaseDescription|Perubahan belum disimpan\. Simpan sebelum berpindah langkah/u, "phase intro copy and inline dirty status must stay out of the builder chrome");
assert.doesNotMatch(workspace, /border-b border-primary-100 pb-4/u, "back navigation must not render a divider below the control");
assert.doesNotMatch(workspace, /<footer className="[^"]*border-t border-primary-100/u, "draft actions must not render a divider above the next action");
assert.match(workspace, /id="tryout-basic-info-title">Informasi dasar/u, "Soal must label the basic information block");
assert.match(workspace, /Informasi dasar[\s\S]*duration-[\s\S]*instruction-/u, "Soal must stack duration and instructions in the basic information block");
assert.doesNotMatch(workspace, /Tujuh Section wajib|Pilih subject untuk mengatur durasi, instruksi, dan soal yang akan digunakan/u, "Soal must remove the redundant section overview header");
assert.doesNotMatch(workspace, /Question source[\s\S]*Pilih Bank Soal, lalu centang soal yang ingin dimasukkan/u, "question-source lead-in must not repeat the Bank Soal instruction");
assert.doesNotMatch(workspace, /previewOpen|setPreviewOpen|Preview alur peserta/u, "Configure Sections must keep the footer focused on the primary next action");
assert.match(workspace, /Pilih bank soal/u, "Soal must expose one direct question-source path");
assert.doesNotMatch(workspace, /Pilih langsung|Soal terpilih|Pilih satu Bank Soal, lalu checklist soal yang ingin ditambahkan/u, "question-source setup should stay focused on the bank and checklist");
assert.doesNotMatch(workspace, /Pilih satu Section\. Durasi, sumber, dan aturan mengikuti pilihan yang sama\./u, "Section rail should not repeat configuration guidance");
assert.match(workspace, /bg-voyage-warm-sun/u, "incomplete Sections should use the warm yellow status dot");
assert.match(workspace, /RequiredMark/u, "mandatory Tryout fields should expose required markers");
assert.match(workspace, /<Checkbox/u, "direct question selection must use a checklist");
assert.doesNotMatch(workspace, /Behavior &amp; rules|Pool Soal|Blueprint|CAT Pool|Set Ready/u, "Soal must not expose CAT or alternative source modes");
assert.match(workspace, /normalizeWorkspace/u, "legacy workspace query values must be normalized in one boundary");
assert.match(workspace, /deliveryAreaFor/u, "legacy Delivery query values must land in a stable subarea");
assert.match(workspace, /value === "operations"\) return "sessions"/u, "legacy operations query must land on Sessions");

assert.match(workspace, /saveTryoutAction/u, "draft and publish must use the canonical Tryout save action");
assert.match(workspace, /const save = async \(status: "draft" \| "published" = "draft", redirectWorkspace: Workspace[\s\S]*\): Promise<boolean>/u, "ordinary save must default to draft and report server success");
assert.match(workspace, /void save\("draft"\)/u, "ordinary save controls must explicitly persist a draft");
assert.doesNotMatch(workspace, /void save\(\)/u, "ordinary save paths must never inherit draft.status");
assert.match(workspace, /void save\("published"\)/u, "publish must remain a separate explicit action");
assert.match(workspace, /Selanjutnya/u, "draft steps must expose a single next action");
assert.doesNotMatch(workspace, /Simpan &amp; lanjut ke Configure Sections/u, "the draft next action must use the shorter label");
assert.doesNotMatch(workspace, /<ArrowRight\b/u, "the draft next action must not show a right-arrow icon");
assert.match(workspace, /items\.length > 1/u, "single-item phases must not render an inner tab strip");
assert.doesNotMatch(workspace, /keepMounted/u, "draft Delivery content must not remain mounted outside the published lifecycle mode");
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
assert.doesNotMatch(workspace, /AssessmentReleaseNotice/u, "draft Review & Publish must not expose release-readiness cards");
assert.match(workspace, /Simpan perubahan/u, "workspace must expose draft persistence");
assert.match(workspace, /dirtyNavigationOpen/u, "dirty navigation must require an explicit Save, Discard, or Stay decision");
assert.match(workspace, /updateTryoutMetadataAction/u, "published details must use a metadata-only server action");
assert.match(workspace, /Buat draf perubahan/u, "published structural changes must use an explicit change draft");
assert.match(repository, /current\.status === ContentStatus\.published[\s\S]*Buat draf perubahan/u, "server save must reject structural edits to published Tryouts");
assert.match(repository, /updateTryoutMetadata/u, "server metadata editing must remain a separate allowlisted path");
assert.doesNotMatch(workspace, /\/mentor\/packages(?:\/|\b)/u, "workspace must not route mentors through package authoring");
assert.match(workspace, /Buka Bank Soal/u, "missing sources should point back to Bank Soal, not package authoring");
assert.match(route, /packageId\?: string; packageVersionId\?: string;[\s\S]*subtest\?: string/u, "Tryout edit route must accept package handoff query state");
assert.match(createRoute, /packageId\?: string; packageVersionId\?: string; subtest\?: string/u, "Tryout create route must accept package handoff query state");
assert.match(route, /resolveReusableQuestionPackageHandoff\([\s\S]*tryoutId/u, "existing Tryout handoff must be resolved against the owner-scoped target");
assert.match(createRoute, /resolveReusableQuestionPackageHandoff\(/u, "new Tryout handoff must be resolved server-side");
assert.match(workspace, /initialPackageHandoff/u, "builder must accept typed package handoff state");
assert.match(workspace, /packageVersionId: handoff\.packageVersionId/u, "handoff must seed a package version in local form state");
assert.match(workspace, /catItemCount/u, "handoff must carry CAT count when the Ready mode requires it");
assert.match(repository, /async function getReusableQuestionPackageUseContext\(/u, "handoff context must have an owner-scoped repository read");
assert.match(repository, /createdByUserId: actorId/u, "handoff package and Tryout reads must be owner scoped");
assert.match(repository, /status: ContentStatus\.draft/u, "handoff targets must be draft Tryouts only");
assert.match(repository, /attempts: \{ none: \{\} \}/u, "participant-attempt Tryouts must be excluded from handoff targets");
assert.match(repository, /assessmentReleaseId: \{ not: null \}/u, "participant-accessible release-bound Tryouts must be excluded");
assert.match(repository, /disabledReason/u, "conflicting package sources must expose a clear disabled reason");
assert.match(repository, /rule: \{ select: \{ requestedCount: true \} \}/u, "CAT handoff context must read the immutable Ready delivery rule");
assert.match(repository, /catItemCount: latestVersion\.mode === ReusableQuestionPackageMode\.cat_pool \? latestVersion\.rule\?\.requestedCount/u, "CAT handoff must seed the Ready rule requested count");
assert.doesNotMatch(repository, /catItemCount: latestVersion\.mode === ReusableQuestionPackageMode\.cat_pool \? latestVersion\.items\.length/u, "CAT handoff must not use the candidate pool size as delivered count");
assert.match(repository, /resolveReusableQuestionPackageHandoff\(/u, "Tryout routes must use a server-side handoff validator");
assert.match(useRoute, /getReusableQuestionPackageUseContext\(/u, "use route must read its context through the repository boundary");
assert.match(useModule, /Tryout yang sudah ada/u, "chooser must expose the existing Tryout choice");
assert.match(useModule, /Tryout baru/u, "chooser must expose the new Tryout choice");
assert.match(useModule, /context\.targets\.length/u, "chooser must render every target when all drafts are unavailable");
assert.doesNotMatch(useModule, /eligibleTargets/u, "chooser visibility must not hide disabled targets when no eligible target exists");
assert.doesNotMatch(useModule, /saveTryoutAction|saveTryout\(/u, "chooser navigation must not persist a Tryout");
assert.match(actions, /revalidatePath\(`\/mentor\/tryout\/\$\{result\.id\}`\)/u, "save must revalidate the selected Tryout route");

console.log("Tryout authoring workspace contract passed.");
