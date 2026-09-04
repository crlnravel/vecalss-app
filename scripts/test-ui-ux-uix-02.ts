import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
let checks = 0;

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function includes(source: string, expected: string, message: string) {
  assert.ok(source.includes(expected), message);
  checks += 1;
}

function excludes(source: string, unexpected: string, message: string) {
  assert.ok(!source.includes(unexpected), message);
  checks += 1;
}

const materiBuilder = read("modules/mentor/KaptenMateriBuilderPageModule.tsx");
includes(materiBuilder, "Belum ada PDF dipilih", "Materi must disclose when no PDF is selected.");
includes(materiBuilder, "Pilih PDF dari pustaka media untuk melanjutkan.", "Materi must explain how to resolve a missing PDF.");
includes(materiBuilder, 'aria-describedby={errors.documentAssetId || errors.documentMimeType ? "materi-document-error"', "PDF picker must link its validation message.");
includes(materiBuilder, "aria-invalid={Boolean(errors.documentAssetId || errors.documentMimeType)}", "PDF picker must expose invalid state.");
excludes(materiBuilder, '|| "test.pdf"', "Materi must not present a fake PDF filename.");

const pdfPreview = read("modules/courses/StudentPdfPreview.tsx");
const pdfDocument = read("modules/courses/StudentPdfDocument.tsx");
includes(pdfPreview, "const completionReady = documentActionsReady && renderedKey === requestKey;", "Completion must wait for a rendered document.");
includes(pdfPreview, "{completionReady ? completionAction : null}", "Completion action must be hidden until the PDF is ready.");
includes(pdfPreview, "onReady={() => setRenderedKey(requestKey)}", "Preview must report successful PDF rendering.");
includes(pdfPreview, "onError={() => setRenderedKey(null)}", "Preview must clear completion readiness on render failure.");
includes(pdfDocument, "const PAGE_BATCH_SIZE = 3;", "PDF pages must render in bounded batches.");
includes(pdfDocument, "Tampilkan halaman berikutnya", "PDF preview must provide progressive page loading.");

const quizOngoing = read("modules/quiz/QuizOngoingPageModule.tsx");
const quizResult = read("modules/quiz/QuizResultPageModule.tsx");
const quizActions = read("modules/quiz/actions.ts");
includes(quizOngoing, 'label="Tandai untuk ditinjau"', "Ongoing quiz must use the truthful review label.");
includes(quizResult, 'label="Tandai untuk ditinjau"', "Quiz result must use the truthful review label.");
includes(quizOngoing, "tidak dikirim ke staf", "Ongoing quiz must disclose the local-only review marker.");
includes(quizResult, "terhapus saat halaman ditutup atau dimuat ulang", "Quiz result must disclose local retention.");
excludes(quizActions, "reportQuestion", "No server report contract may be implied when none exists.");
excludes(quizActions, "laporkan", "No server report action may be implied when none exists.");
console.log("Learner report contract: no server-visible action found; local-only review marker is disclosed.");

const dashboard = read("modules/dashboard/DashboardPageModule.tsx");
includes(dashboard, "Data dashboard belum tersedia", "Dashboard must disclose unavailable live data.");
includes(dashboard, 'aria-disabled="true"', "Unavailable missions must not present interactive completion controls.");
includes(dashboard, "Belum tersedia", "Unavailable analytics must have an explicit empty state.");
excludes(dashboard, 'xp="1.840"', "Dashboard must not display hardcoded XP.");
excludes(dashboard, '0/3', "Dashboard must not display a fake mission completion count.");
excludes(dashboard, "HeroXpPill", "Dashboard must not render the removed fake XP component.");

const freshness = read("modules/admin/ai/components/AiFreshnessBanner.tsx");
const refreshBar = read("modules/admin/ai/components/AiRefreshBar.tsx");
includes(freshness, "formatAsOf", "AI freshness must render source timestamps.");
includes(freshness, "freshness.analytics", "AI freshness must disclose analytics freshness.");
includes(freshness, "Snapshot belum tersedia", "AI freshness must distinguish missing policy snapshots.");
excludes(freshness, 'VERA-POLICY-027', "AI freshness must not invent a policy version.");
excludes(freshness, "27 Aug 2026, 14:20 WIB", "AI freshness must not invent an activation time.");
includes(refreshBar, "Belum diperbarui", "Refresh state must not claim a timestamp before the first refresh.");
excludes(refreshBar, "Baru saja", "Refresh state must not claim an unsupported relative time.");

const reliability = read("modules/admin/ai/AiReliabilityPageModule.tsx");
includes(reliability, "p95TimeToFirstTokenMs", "Reliability TTFT copy must derive from the live metric.");
includes(reliability, "TTFT P95 belum tersedia", "Reliability TTFT copy must have an unavailable state.");

for (const path of [
  "modules/admin/ai/AiProvidersPageModule.tsx",
  "modules/admin/ai/AiReliabilityPageModule.tsx",
  "modules/admin/ai/AiUsagePageModule.tsx",
]) {
  const source = read(path);
  includes(source, "Coba lagi", `${path} must provide a retry action.`);
  includes(source, "Belum ada data", `${path} must provide an explicit empty state.`);
  includes(source, "Memuat", `${path} must provide an explicit loading state.`);
}

const policy = read("modules/admin/AiPolicyPageModule.tsx");
includes(policy, "policy-action-confirmation", "Policy actions must expose a confirmation surface.");
includes(policy, "requestConfirmation", "Policy actions must require an explicit confirmation request.");
includes(policy, "future-only", "Policy confirmation must state future-only impact.");
includes(policy, "audit", "Policy confirmation must state audit context.");
includes(policy, 'method,', "Policy commands must expose an explicit HTTP method contract.");
includes(policy, 'expectedRevision: draft.revision', "Policy commands must send the persisted revision.");
includes(policy, 'validationDigest: draft.validationDigest', "Policy approval/preview commands must send the validation digest.");
includes(policy, 'drafts/${draft.id}/activate', "Policy activation must target the draft-specific server route.");
const copyValue = read("modules/admin/components/copy-value-button.tsx");
includes(copyValue, "isMaskedValue", "Masked admin values must be detected before copy.");
includes(copyValue, "disabled={masked}", "Masked admin values must disable copy.");
includes(copyValue, "Nilai tersamarkan tidak dapat disalin", "Masked copy must provide a truthful outcome.");

const settingsPage = read("app/mentor/settings/page.tsx");
const settingsModule = read("modules/mentor/KaptenContentPageModules.tsx");
const settingsActions = read("modules/mentor/settings-actions.ts");
includes(settingsPage, "initialSettings={settings}", "Settings page must pass server-read settings to the form.");
includes(settingsModule, "Nama profil", "Settings must expose the supported profile name field.");
includes(settingsModule, "Email tutor", "Settings must expose the supported tutor email field.");
includes(settingsModule, "Subjek utama", "Settings must expose the supported subject field.");
includes(settingsModule, "Bahasa konten", "Settings must expose the supported content language field.");
includes(settingsModule, "User ID hanya untuk referensi", "User ID must be read-only and clearly labelled.");
includes(settingsModule, "Perubahan belum disimpan.", "Settings must disclose dirty state.");
includes(settingsModule, "Simpan pengaturan", "Settings must expose a save action.");
includes(settingsModule, "Batal", "Settings must expose a cancel action.");
includes(settingsModule, "saveKaptenSettingsAction", "Settings must persist through a server action.");
excludes(settingsModule, "ProfilePhotoEditor", "Settings must keep the supported setting set exact.");
includes(settingsActions, "prisma.$transaction", "Settings writes must be atomic.");
includes(settingsActions, 'revalidatePath("/mentor/settings")', "Settings writes must revalidate the server page.");
for (const field of ["profileName", "email", "subjectCode", "contentLanguage"]) {
  includes(settingsActions, field, `Settings action must support ${field}.`);
}
includes(settingsActions, "requireTutorSession", "Settings reads and writes must derive identity from the authenticated tutor session.");

const studentDetail = read("modules/admin/StudentDetailPageModule.tsx");
includes(studentDetail, "targetExamIsInactive", "Student detail must detect persisted inactive targets.");
includes(studentDetail, "sudah tidak aktif", "Student detail must label inactive targets explicitly.");
includes(studentDetail, "blockedField", "Student detail must guard unchanged inactive targets on submit.");
includes(studentDetail, "Password tersamarkan, tidak dapat disalin", "Masked password copy must announce its unavailable outcome.");

const kuisDetail = read("modules/mentor/KaptenQuizDetailPageModule.tsx");
excludes(kuisDetail, "Assembly Kuis", "Standalone Kuis detail must not expose assembly source UI.");
excludes(kuisDetail, "Bank Soal Kuis", "Standalone Kuis detail must not expose Bank Soal source UI.");
excludes(kuisDetail, "Kelola sumber", "Standalone Kuis detail must not expose source-management navigation.");

const vera = read("modules/vera-ai/VeraAiPageModule.tsx");
includes(vera, 'dataState === "live"', "Vera actions and workspace must require live server data.");
includes(vera, "sources_unavailable", "Vera must identify unavailable source data.");
includes(vera, "Sumber data: {state}", "Vera must disclose the loaded data provenance state.");
includes(vera, "Data penggunaan belum tersedia dari server.", "Vera usage must disclose unavailable server data.");
excludes(vera, "DAILY_TOKEN_USAGE", "Vera must not fabricate a fallback quota usage value.");
excludes(vera, "DAILY_TOKEN_LIMIT", "Vera must not fabricate a fallback quota limit value.");

const tryoutPolicy = read("modules/mentor/KaptenTryoutPolicyPageModule.tsx");
const tryoutActions = read("modules/mentor/tryout-actions.ts");
includes(tryoutPolicy, "initial.admissionMode", "Tryout edit mode must initialize from persisted admission mode.");
excludes(tryoutPolicy, 'useState<Mode>("open")', "Tryout edit mode must not reset admission to open.");
includes(tryoutPolicy, "tryout-admission-confirmation", "Admission changes must require confirmation.");
includes(tryoutPolicy, "Pengaturan akses peserta Tryout", "Admission confirmation must name its audit context.");
includes(tryoutPolicy, "Perlu persetujuan", "Restricted admission mode must be selectable when deliberate.");
includes(tryoutActions, "revalidatePath(`/mentor/tryout/${tryoutId}/operations/policy`)", "Tryout policy changes must refresh the persisted policy view.");

console.log(`PASS ui-ux-uix-02: ${checks} checks`);
