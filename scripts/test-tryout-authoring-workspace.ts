import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [workspace, route, createRoute, childRoute, shell, sidebar, repository, deliveryRepository, useRoute, actions, policy, sessions, sessionCreate, sessionRoute, catalogue, attemptRepository, sessionDetail, workspaceHeader, workspaceFrame, operations, operationsModule, participantsRoute, policyRoute] = await Promise.all([
  readFile(`${root}/modules/mentor/KaptenTryoutBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/create/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/soal/[subtest]/page.tsx`, "utf8"),
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
  readFile(`${root}/modules/mentor/KaptenTryoutWorkspaceHeader.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutWorkspaceFrame.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/operations/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenTryoutOperationsModule.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/operations/participants/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/tryout/[tryoutId]/operations/policy/page.tsx`, "utf8"),
]);

for (const label of ["Informasi Tryout", "Subtest Tryout", "Pilih bank soal", "Informasi dasar", "Daftar soal", "Terbitkan"]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(workspace, new RegExp(escapedLabel, "u"), `workspace should expose ${label}`);
}

assert.match(workspace, /function TryoutSubtestIndex[\s\S]*draft\.sections\.map/u, "the parent page must list every subtest");
const subtestIndex = workspace.slice(workspace.indexOf("function TryoutSubtestIndex"), workspace.indexOf("function TryoutLifecycleModals"));
assert.match(subtestIndex, /<span className="text-base font-semibold text-secondary-900">\s*\{section\.subtest\}\s*<\/span>/u, "subtest entries should show only their acronym");
assert.doesNotMatch(subtestIndex, /subjectName\(section\.subtest\)|MentorBadge|durationMinutes|scoringLabelForSection|statusLabel|questionCount/u, "subtest entries should not show secondary metadata");
assert.match(subtestIndex, /<ChevronRight/u, "subtest entries should expose a forward affordance");
assert.match(workspace, /function tryoutSubtestEditorHref[\s\S]*\/soal\//u, "subtest rows must point to a nested editor route");
assert.match(workspace, /initialSubtest\?: SubjectCode/u, "the builder must accept a selected subtest from the child route");
assert.match(workspace, /if \(!initialSubtest \|\| mode === "published" \|\| draft\.locked\) return/u, "the child editor must load editable sources only for a selected unlocked draft subtest");
assert.match(workspace, /readOnly=\{mode === "published" \|\| draft\.locked\}/u, "published and locked Tryouts must keep subtest details read-only");
assert.doesNotMatch(workspace, /TryoutPhaseNavigation|TryoutWorkspaceTabs|SectionRail|TryoutDeliveryTab|TryoutReviewTab/u, "the Tryout builder must not render lifecycle tabs");
assert.match(workspaceHeader, /label: "Informasi"[\s\S]*label: "Subtest"/u, "the Tryout workspace must expose information and subtests as top-level tabs");
assert.match(workspaceHeader, /label: "Operasional"[\s\S]*label: "Peserta"[\s\S]*label: "Pengaturan"/u, "the Tryout workspace must keep operations, participants, and settings in the same tab bar");
assert.match(workspaceHeader, /onTabChange\?: \(tab: TryoutWorkspaceTab\)/u, "the Tryout workspace must support same-route tab changes");
assert.doesNotMatch(workspaceHeader, /label: "Overview"|value: "overview"/u, "the Tryout workspace must not expose an Overview tab");
assert.doesNotMatch(workspace, /aria-label="Bagian detail Tryout"|defaultValue="identity"/u, "the content workspace must not nest identity and subtests under a second tab bar");
assert.match(workspace, /<Tabs[\s\S]*Informasi dasar[\s\S]*Pilih bank soal[\s\S]*<TabsContent className="m-0" value="info"[\s\S]*<TabsContent className="m-0" value="bank"/u, "the subtest editor must separate basic information and question-bank selection into tabs");
assert.match(workspace, /function TryoutSavedQuestionList[\s\S]*<ol\s+aria-label=\{`Daftar soal subtest/u, "read-only subtest details must render a single numbered question list");
assert.match(workspace, /readOnly\s*\?\s*\(\s*<TryoutSavedQuestionList/u, "read-only subtest details must avoid nested question cards");
assert.match(workspace, /setTimeout\(\(\) => autosaveRequestRef\.current\(\), 5000\)/u, "the subtest editor must debounce draft saves for five seconds");
assert.match(workspace, /addEventListener\("pagehide"/u, "the subtest editor must flush draft changes when the page is hidden");
assert.match(workspace, /addEventListener\("visibilitychange"/u, "the subtest editor must flush draft changes when visibility changes");
assert.doesNotMatch(workspace, /TryoutPageActions/u, "draft actions should live in the persistent Tryout header");
assert.match(workspace, /TryoutBuilderHeaderActions[\s\S]*aria-label="Terbitkan Tryout"[\s\S]*onPublishClick/u, "draft Tryouts must expose a publish action in the header");
assert.match(workspace, /disabled=\{saving \|\| !configureReady\}/u, "publishing must remain disabled until every subtest is ready");
assert.match(workspace, /Setelah tryout di-publish dan terdapat siswa mengerjakan/u, "publish confirmation must use plain-language locking guidance");
assert.match(workspace, /AlertDialogContent\s+className="!max-w-xl rounded-5xl gap-5"[\s\S]*AlertDialogFooter\s+className="!justify-stretch grid w-full gap-2"/u, "unsaved-change confirmation must keep its actions inside a responsive modal layout");
assert.match(workspace, /sectionReadiness/u, "Section rail must expose per-section readiness");
assert.match(workspace, /Kembali ke semua Tryout/u, "the parent page must link back to all Tryout");
assert.match(workspace, /Kembali ke daftar subtest/u, "the child page must link back to the subtest index");
assert.doesNotMatch(workspace, /TRYOUT WORKSPACE|Mode authoring|Mode operasional|Semua Tryout/u, "workspace header copy and mode label must stay out of the builder surface");
assert.doesNotMatch(workspace, /border-b border-primary-100 pb-4/u, "back navigation must not render a divider below the control");
assert.doesNotMatch(workspace, /<footer className="[^"]*border-t border-primary-100/u, "draft actions must not render a divider above the next action");
assert.match(workspace, /id="tryout-basic-info-title"\s*>\s*Informasi dasar/u, "Soal must label the basic information block");
assert.match(workspace, /Informasi dasar[\s\S]*duration-[\s\S]*instruction-/u, "Soal must stack duration and instructions in the basic information block");
assert.match(workspace, /RequiredMark/u, "mandatory Tryout fields should expose required markers");
assert.match(workspace, /<Checkbox/u, "direct question selection must use a checklist");
assert.match(route, /contentElement="div"/u, "Edit Tryout route should keep the shell landmark as the only main");
assert.match(createRoute, /contentElement="div"/u, "Create Tryout route should keep the shell landmark as the only main");
assert.match(childRoute, /params: Promise<\{ subtest: string; tryoutId: string \}>/u, "the nested route must be parameterized by subtest");
assert.match(childRoute, /parseTryoutSubtest/u, "the nested route must reject unknown subtests");
assert.match(childRoute, /searchParams: Promise<Record<string, NavigationQueryValue>>/u, "the nested route must preserve navigation context");
assert.match(childRoute, /parseMentorTryoutContext\(query\)/u, "the nested route must validate duplicate-parent context");
assert.match(childRoute, /breadcrumbParent=\{\{ href: parentHref, label: parentLabel \}\}/u, "the child route must show the Tryout parent breadcrumb");
assert.match(childRoute, /breadcrumbLabel=\{`Subtes \$\{subtestCode\}`\}/u, "the child route must label the selected subtest in the breadcrumb");
assert.match(childRoute, /initialSubtest=\{subtestCode\}/u, "the child route must pass the selected subtest into the builder");
assert.match(childRoute, /initialParent=\{parentContext\}/u, "the child route must carry duplicate-parent context into the builder");

assert.match(workspace, /saveTryoutAction/u, "draft and publish must use the canonical Tryout save action");
assert.match(workspace, /const save\s*=\s*useCallback\(\s*async\s*\(\s*status:\s*"draft"\s*\|\s*"published"\s*=\s*"draft",[\s\S]*\)\s*:\s*Promise<boolean>/u, "ordinary save must default to draft and report server success");
assert.match(workspace, /void save\("draft"\)/u, "ordinary save controls must explicitly persist a draft");
assert.doesNotMatch(workspace, /void save\(\)/u, "ordinary save paths must never inherit draft.status");
assert.match(workspace, /void save\("published"\)/u, "publish must remain a separate explicit action");
assert.match(shell, /<SidebarInset\b/u, "workspace shell must render the page landmark container");
assert.match(sidebar, /function SidebarInset[\s\S]*?<main\b/u, "sidebar inset must own the page main landmark");
assert.doesNotMatch(workspace, /AssessmentReleaseNotice/u, "draft Review & Publish must not expose release-readiness cards");
assert.match(workspace, /Simpan perubahan/u, "workspace must expose draft persistence");
assert.match(workspace, /dirtyNavigationOpen/u, "dirty navigation must require an explicit Save, Discard, or Stay decision");
assert.match(workspace, /updateTryoutMetadataAction/u, "published details must use a metadata-only server action");
assert.match(workspace, /KaptenTryoutSettingsPageModule/u, "lifecycle actions must live in the settings tab");
assert.match(workspace, /onDuplicate=\{\(\) => dispatch\(\{ open: true, type: "setDuplicateOpen" \}\)\}/u, "published structural changes must use an explicit change draft");
assert.match(workspaceHeader, /label: "Pengaturan"/u, "settings must be a top-level Tryout tab");
assert.doesNotMatch(workspaceHeader, /Ellipsis|Tindakan Tryout/u, "the title must not render a lifecycle kebab menu");
assert.doesNotMatch(route, /KaptenTryoutOverviewPageModule|activeTab="overview"/u, "the default Tryout route must open the information workspace");
assert.match(route, /initialWorkspaceForContext\(parsedQuery\)/u, "the default Tryout route must select the canonical workspace");
assert.match(workspace, /TryoutWorkspaceHeader[\s\S]*activeTab=\{isSubtestEditor \? "subtests" : activeWorkspace\}/u, "content editing must select the matching top-level identity or subtest tab");
assert.match(workspace, /TryoutWorkspaceHeader[\s\S]*showTabs=\{!isSubtestEditor\}/u, "separate subtest details must hide the parent workspace tabs");
assert.match(workspace, /TryoutWorkspaceHeader[\s\S]*title=\{isSubtestEditor \? `Subtes \$\{initialSubtest\}` : draft\.title\}/u, "separate subtest details must use the subtest title");
assert.match(workspaceFrame, /TryoutWorkspaceHeader/u, "workspace sections must share the persistent Tryout header");
assert.match(route, /breadcrumbLabel="Detail"/u, "Tryout details must retain the Tryout > Detail breadcrumb");
assert.doesNotMatch(workspaceHeader, /Tryout <span|formatWorkspaceDate|availableFrom.*availableUntil/u, "the workspace header must not repeat a title breadcrumb or schedule below the title");
assert.doesNotMatch(operationsModule, /AssessmentReleaseNotice|title="Kebijakan"|WorkspaceCard/u, "Operasional must stay focused on schedule and access");
assert.doesNotMatch(operationsModule, /StatusBadge status=\{mainSession\.status\}/u, "Jadwal & akses must not show a redundant active badge");
assert.doesNotMatch(operationsModule, /sesi aktif|peserta menunggu|Atur waktu buka dan tutup akses peserta|attempt tercatat/u, "Operasional must omit redundant session and access helper copy");
assert.match(workspace, /updateTryoutMetadataAction[\s\S]*draftToSave\.description[\s\S]*draftToSave\.title/u, "published Overview must save the inline title and description");
assert.match(workspace, /(?:disabled=\{mode === "draft" && draft\.locked\}|const identityDisabled = saving \|\| \(mode === "draft" && draft\.locked\);[\s\S]*disabled=\{identityDisabled\})/u, "published Overview metadata must remain editable when structure is locked");
const identityPanel = workspace.slice(workspace.indexOf("function TryoutIdentityPanel"), workspace.indexOf("type TryoutSubtestEditorProps"));
assert.match(identityPanel, /mode === "published"[\s\S]*className="w-full"[\s\S]*variant="brand"[\s\S]*metadataSaving \? "Menyimpan…" : "Simpan"/u, "published Overview must expose a full-width primary metadata save action");
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
assert.match(catalogue, /<Link[\s\S]*aria-label=\{`Buka \$\{item\.title\}`\}[\s\S]*href=\{`\/mentor\/tryout\/\$\{item\.id\}`\}/u, "Tryout catalogue cards must have one whole-card destination");
assert.doesNotMatch(catalogue, /Buka operasional|\/operations`\}/u, "Tryout catalogue cards must not contain a competing operational destination");
assert.match(workspace, /KaptenTryoutOperationsModule embedded/u, "Operasional must render inside the shared workspace");
assert.match(workspace, /aria-labelledby="tryout-operations-title"[\s\S]*id="tryout-operations-title"[\s\S]*Operasional/u, "Operasional must have a title inside the shared workspace card");
assert.match(sessionDetail, /Waktu akses peserta/u, "Operasional must focus on schedule and access inside the workspace");
assert.doesNotMatch(operationsModule, /Peserta.*WorkspaceCard|WorkspaceCard[\s\S]*Peserta/u, "Peserta must be a separate workspace destination");
assert.match(participantsRoute, /workspace: "participants"/u, "the retired Peserta route must return to the consolidated workspace");
assert.doesNotMatch(participantsRoute, /operations\.status !== "published"/u, "Peserta must remain reachable for draft Tryouts");
assert.match(workspace, /KaptenTryoutParticipantsPageModule[\s\S]*initial=\{operationsInitial\}/u, "Peserta must render the Tryout result view");
assert.match(policyRoute, /workspace: "operations"/u, "the retired policy route must return to Operasional");
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
assert.doesNotMatch(policy, /Alasan audit|policy-audit-reason/u, "Policy must not expose an audit-reason field");
assert.doesNotMatch(sessionCreate, /Alasan perubahan|session-audit-reason/u, "Session creation must not expose an audit-reason field");
assert.doesNotMatch(sessions, /Jadwal dan status pelaksanaan Tryout\./u, "Sessions should not show the redundant schedule description");
assert.match(sessions, /const hasActiveSession = mainSession\?\.status === "active"/u, "Sessions should derive the active-session warning from the canonical main session");
assert.match(sessions, /!hasActiveSession/u, "Sessions should only show the warning when no session is active");
assert.match(sessions, /text-danger-600/u, "The missing-active-session warning should use the danger color");
assert.doesNotMatch(sessions, /Konten terkunci pada rilis/u, "Sessions should not expose release-lock copy");
assert.doesNotMatch(sessionCreate, /label="Peringkat"|label="Rilis hasil"|Waktu rilis hasil|rankingRule:\s*"national"|resultReleasePolicy:\s*"scheduled"|scheduledReleaseAt/u, "Session creation should archive ranking and per-session result release controls");
assert.match(sessionCreate, /rankingRule: "none", resultReleasePolicy: "inherit"/u, "Session creation should follow the no-ranking/default-release policy");
assert.match(sessionCreate, /status: "active"/u, "New sessions should default to active");
assert.match(sessionCreate, /label="Aktif saat dibuat"/u, "Mentors should be able to change the new-session status");
assert.match(sessionCreate, /router\.push\(`\/mentor\/tryout\/\$\{initial\.id\}\?workspace=operations&delivery=sessions`\)/u, "Session creation should return to the Tryout editor");
assert.match(sessionCreate, /busy \? "Membuat…" : "Buat sesi"/u, "Session creation should use the plain create action");
assert.doesNotMatch(sessionCreate, /<Save\b|Simpan sesi|CardFooter|border-t border-primary-100/u, "Session creation should render a divider-free text-only primary action");
assert.match(deliveryRepository, /async function updateTryoutDeliverySessionSchedule\(/u, "Session schedule editing should have a repository boundary");
assert.match(actions, /updateTryoutDeliverySessionScheduleAction/u, "Session schedule editing should use a mentor server action");
assert.match(sessionDetail, /type="datetime-local"/u, "Session detail should expose editable session times");
assert.match(sessionDetail, /Jadwal sesi berhasil diperbarui/u, "Session schedule edits should provide confirmation");
assert.doesNotMatch(sessionDetail, /Jadwal rilis hasil|Setelah sesi/u, "Session schedule details must omit result-release policy copy");
assert.match(shell, /breadcrumbParent\?: \{ href: string; label: string \}/u, "Workspace shell should support a nested breadcrumb");
assert.match(sessionRoute, /workspace: "operations"/u, "The retired new-session route should return to the consolidated operations page");

console.log("Tryout authoring workspace contract passed.");
