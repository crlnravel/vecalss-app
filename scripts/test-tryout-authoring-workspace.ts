import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [workspace, route, createRoute, shell, sidebar, repository, deliveryRepository, useRoute, actions, policy, sessions, sessionCreate, sessionRoute, catalogue, attemptRepository, sessionDetail] = await Promise.all([
  readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/create/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/components/mentor-workspace-shell.tsx`, "utf8"),
  readFile(`${root}/components/ui/sidebar.tsx`, "utf8"),
  readFile(`${root}/lib/tryout/repository.ts`, "utf8"),
  readFile(`${root}/lib/tryout/delivery-repository.ts`, "utf8"),
  readFile(`${root}/app/mentor/packages/[packageId]/use/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/tryout-actions.ts`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutPolicyPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutSessionsPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutSessionCreatePageModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/operations/sessions/new/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutCataloguePageModule.tsx`, "utf8"),
  readFile(`${root}/lib/tryout/attempt-repository.ts`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutSessionDetailPageModule.tsx`, "utf8"),
]);

for (const label of [
  "Soal",
  "Review & Publish",
  "Delivery",
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
assert.match(workspace, /const publishedWorkspacePhases[\s\S]*label: "Overview",\s*value: "overview"[\s\S]*label: "Delivery"/u, "published navigation must expose Overview before Delivery");
assert.match(workspace, /label: "Live",\s*value: "live"[\s\S]*label: "Attempts",\s*value: "attempts"/u, "Live and Attempts must be root published phases");
assert.doesNotMatch(workspace, /label: "Operations",\s*value: "operations"/u, "Operations must not remain a published tab");
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
assert.match(workspace, /<aside aria-label="Area Delivery"[\s\S]*role="tablist"/u, "Delivery areas must use a persistent sidebar rail");
assert.doesNotMatch(workspace, /id="delivery-area-title">Delivery/u, "Delivery rail should not show a redundant heading");
assert.doesNotMatch(workspace, /Siapa yang boleh masuk dan kapan hasil dibuka\.|Jendela waktu dan rilis konten peserta\.|Admission, undangan, dan penugasan peserta\./u, "Delivery rail items must not repeat descriptions");
assert.doesNotMatch(workspace, /Tryout sudah terbit\. Area authoring disembunyikan/u, "published workspaces must not show the authoring redirect notice");
assert.match(workspace, /id="schedule-policy-title">Aturan akses/u, "Policy should use the Indonesian access-rules heading");
assert.doesNotMatch(workspace, /Atur cara peserta masuk dan kebijakan paket hasil sebelum membuat sesi\./u, "Policy should not repeat the area description");
assert.match(workspace, /KaptenTryoutPolicyPageModule embedded initial=\{operationsInitial\} onNext=\{\(\) => changeDeliveryArea\("sessions"\)\}/u, "Policy next action should advance to Sessions");
assert.doesNotMatch(workspace, /Tentukan jendela waktu dan versi terbit yang dipakai peserta\./u, "Sessions should not repeat the lifecycle description");
assert.match(workspace, /SectionRail/u, "Section setup must remain visible as a persistent rail");
assert.match(workspace, /sectionReadiness/u, "Section rail must expose per-section readiness");
assert.match(workspace, /aria-label="Kembali ke semua Tryout"[\s\S]*size="icon"[\s\S]*<ChevronLeft/u, "Tryout workspace back navigation must be an icon-only chevron control");
assert.doesNotMatch(workspace, /TRYOUT WORKSPACE|Mode authoring|Mode operasional|Semua Tryout/u, "workspace header copy and mode label must stay out of the builder surface");
assert.doesNotMatch(workspace, /function phaseDescription|Perubahan belum disimpan\. Simpan sebelum berpindah langkah/u, "phase intro copy and inline dirty status must stay out of the builder chrome");
assert.doesNotMatch(workspace, /border-b border-primary-100 pb-4/u, "back navigation must not render a divider below the control");
assert.doesNotMatch(workspace, /<footer className="[^"]*border-t border-primary-100/u, "draft actions must not render a divider above the next action");
assert.match(workspace, /id="tryout-basic-info-title">Informasi dasar/u, "Soal must label the basic information block");
assert.match(workspace, /<TabsContent className="mt-0 w-full" value="basics">/u, "Overview identity content must use the full available width");
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
assert.match(workspace, /Duplikat draf baru/u, "published structural changes must use an explicit change draft");
assert.match(workspace, /const allowed: Workspace\[\] = \["basics", "schedule"\]/u, "published workspaces must allow Overview alongside Delivery");
assert.match(workspace, /mode === "published" \? \([\s\S]*variant="brandOutline"[\s\S]*Duplikat draf baru/u, "published duplicate action must move to the top as an outline control");
assert.match(workspace, /updateTryoutMetadataAction\(\{ (?:bannerMediaId: draft\.bannerMediaId \?\? null, )?description: draft\.description, id, title: draft\.title \}\)/u, "published Overview must save the inline title and description");
assert.match(workspace, /disabled=\{mode === "draft" && draft\.locked\}/u, "published Overview metadata must remain editable when structure is locked");
assert.match(workspace, /mode === "published"[\s\S]*Simpan perubahan/u, "published Overview must expose a metadata save action");
assert.match(workspace, /unpublishTryoutAction/u, "published Tryout detail must expose the unpublish action");
assert.match(workspace, /Jadikan draf/u, "published Tryout detail must label the unpublish action plainly");
assert.match(workspace, /hasActiveAttempt/u, "unpublish affordance must reflect active student work in the mentor view");
assert.doesNotMatch(workspace, /Versi terbit tidak dapat diubah strukturnya|Tindakan versi terbit|metadataOpen|metadataDraft|Edit details Tryout|Simpan detail/u, "published pages must remove the structural-lock widget and metadata modal");
assert.match(repository, /current\.status === ContentStatus\.published[\s\S]*Buat draf perubahan/u, "server save must reject structural edits to published Tryouts");
assert.match(repository, /updateTryoutMetadata/u, "server metadata editing must remain a separate allowlisted path");
assert.match(repository, /async function unpublishTryout/u, "Tryout unpublish must be implemented at the repository boundary");
assert.match(repository, /action: "tryout\.unpublished"/u, "Tryout unpublish must leave an audit trail");
assert.match(repository, /AssessmentAttemptState\.in_progress/u, "Tryout unpublish must guard canonical active attempts");
assert.match(repository, /TryoutAttemptTestRunStatus\.active/u, "Tryout unpublish must guard an active Test run even if attempt metadata is inconsistent");
assert.match(actions, /unpublishTryoutAction/u, "Tryout unpublish must be exposed through the mentor server action boundary");
assert.match(attemptRepository, /status !== ContentStatus\.published[\s\S]*memulai attempt baru/u, "unpublished Tryouts must reject new participant attempts");
assert.match(catalogue, /aria-label="Tryout terkunci"[\s\S]*<Lock aria-hidden/u, "Tryout catalogue locks must remain accessible while rendering icon-only");
assert.doesNotMatch(catalogue, />Terkunci</u, "Tryout catalogue must remove the visible Terkunci label");
assert.doesNotMatch(workspace, /\/mentor\/packages(?:\/|\b)/u, "workspace must not route mentors through package authoring");
assert.match(workspace, /Buka Bank Soal/u, "missing sources should point back to Bank Soal, not package authoring");
assert.doesNotMatch(route, /packageId|packageVersionId|resolveReusableQuestionPackageHandoff/u, "Tryout edit must not accept Paket Soal handoffs");
assert.doesNotMatch(createRoute, /packageId|packageVersionId|resolveReusableQuestionPackageHandoff|listReadyPackageVersions/u, "Tryout create must not accept or load Paket Soal handoffs");
assert.doesNotMatch(workspace, /initialPackageHandoff|seedPackageHandoff|packageVersionId/u, "Tryout authoring state must remain direct-only");
assert.match(repository, /Paket Soal sudah diarsipkan/u, "the save boundary must reject forged legacy package bindings");
assert.match(useRoute, /redirect\(.+packageId.+\)/u, "legacy package handoff URLs must return to the package overview");
assert.doesNotMatch(useRoute, /getReusableQuestionPackageUseContext|KaptenPackageUsePageModule|Gunakan di Tryout/u, "package routes must not expose a Tryout chooser");
assert.match(actions, /Paket Soal sedang diarsipkan/u, "legacy package actions must fail closed");
assert.match(actions, /revalidatePath\(`\/mentor\/tryout\/\$\{result\.id\}`\)/u, "save must revalidate the selected Tryout route");
assert.match(policy, /label="Akses peserta"/u, "Policy must use the simpler participant-access label");
assert.match(policy, /label="Jadwal rilis hasil"/u, "Policy must use the simpler result-release label");
assert.doesNotMatch(policy, /description: "Semua peserta bisa mengikuti"/u, "open access must not carry redundant helper copy");
assert.doesNotMatch(policy, /Akses dan hasil/u, "Policy must not repeat the removed card title");
assert.match(policy, /busy \? "Menyimpan…" : "Selanjutnya"/u, "Policy must use the plain next action");
assert.match(policy, /onNext\?: \(\) => void/u, "Policy should accept a next-step callback");
assert.match(policy, /setNotice\(null\);[\s\S]*onNext\?\.\(\)/u, "Policy success should advance without a success notice");
assert.doesNotMatch(policy, /Kebijakan Tryout berhasil disimpan\./u, "Policy should not show a success status widget");
assert.doesNotMatch(policy, /CardFooter|border-t border-primary-100/u, "Policy next action should sit directly on the page background");
assert.doesNotMatch(policy, /Simpan kebijakan|<Save\b|@\/lib\/icons/u, "Policy next action must not include the save label or icon");
assert.doesNotMatch(policy, /Alasan audit|policy-audit-reason/u, "Policy must not expose an audit-reason field");
assert.doesNotMatch(sessionCreate, /Alasan perubahan|session-audit-reason/u, "Session creation must not expose an audit-reason field");
assert.doesNotMatch(sessions, /Jadwal dan status pelaksanaan Tryout\./u, "Sessions should not show the redundant schedule description");
assert.match(sessions, /const hasActiveSession = initial\.sessions\.some\(\(session\) => session\.status === "active"\)/u, "Sessions should derive the active-session warning from current sessions");
assert.match(sessions, /!hasActiveSession/u, "Sessions should only show the warning when no session is active");
assert.match(sessions, /text-danger-600/u, "The missing-active-session warning should use the danger color");
assert.doesNotMatch(sessions, /Konten terkunci pada rilis/u, "Sessions should not expose release-lock copy");
assert.doesNotMatch(sessionCreate, /label="Peringkat"|label="Rilis hasil"|Waktu rilis hasil|rankingRule:\s*"national"|resultReleasePolicy:\s*"scheduled"|scheduledReleaseAt/u, "Session creation should archive ranking and per-session result release controls");
assert.match(sessionCreate, /rankingRule: "none", resultReleasePolicy: "inherit"/u, "Session creation should follow the no-ranking/default-release policy");
assert.match(sessionCreate, /status: "active"/u, "New sessions should default to active");
assert.match(sessionCreate, /label="Aktif saat dibuat"/u, "Mentors should be able to change the new-session status");
assert.match(sessionCreate, /router\.push\(`\/mentor\/tryout\/\$\{initial\.id\}\?workspace=schedule&delivery=sessions`\)/u, "Session creation should return to the Tryout editor");
assert.match(sessionCreate, /busy \? "Membuat…" : "Buat sesi"/u, "Session creation should use the plain create action");
assert.doesNotMatch(sessionCreate, /<Save\b|Simpan sesi|CardFooter|border-t border-primary-100/u, "Session creation should render a divider-free text-only primary action");
assert.match(deliveryRepository, /async function updateTryoutDeliverySessionSchedule\(/u, "Session schedule editing should have a repository boundary");
assert.match(actions, /updateTryoutDeliverySessionScheduleAction/u, "Session schedule editing should use a mentor server action");
assert.match(sessionDetail, /type="datetime-local"/u, "Session detail should expose editable session times");
assert.match(sessionDetail, /Jadwal sesi berhasil diperbarui/u, "Session schedule edits should provide confirmation");
assert.match(shell, /breadcrumbParent\?: \{ href: string; label: string \}/u, "Workspace shell should support a nested breadcrumb");
assert.match(sessionRoute, /breadcrumbLabel="Buat Sesi"[\s\S]*breadcrumbParent=\{\{ href: `\/mentor\/tryout\/\$\{tryoutId\}`, label: "Edit Tryout" \}\}/u, "Session creation should show Tryout > Edit Tryout > Buat Sesi");

console.log("Tryout authoring workspace contract passed.");
