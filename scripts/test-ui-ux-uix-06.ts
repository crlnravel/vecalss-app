import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatAiFeatureLabel } from "../modules/admin/ai/components/AiDisplayLabels";

// Source-only contract checks; this script is not browser or screenshot evidence.
const root = process.cwd();

const permittedSourcePaths = [
  "app/globals.css",
  "lib/icons.tsx",
  "modules/admin/AiPolicyPageModule.tsx",
  "modules/admin/EnrollmentPageModule.tsx",
  "modules/admin/ai/components/AiDisplayLabels.ts",
  "modules/admin/components/student-banner-editor.tsx",
  "modules/mentor/components/kapten-ui.tsx",
  "modules/quiz/QuizCataloguePageModule.tsx",
  "modules/quiz/QuizOngoingPageModule.tsx",
  "modules/quiz/QuizResultPageModule.tsx",
  "modules/quiz/QuizStartPageModule.tsx",
  "modules/quiz/QuizSubjectDetailPageModule.tsx",
  "modules/student/components/onboarding-form.tsx",
  "modules/tryout/ParticipantAttemptModule.tsx",
  "modules/tryout/ParticipantResultModule.tsx",
  "modules/tryout/ParticipantTryoutDetailModule.tsx",
  "modules/tryout/ParticipantTryoutEnrollmentPanel.tsx",
  "modules/tryout/ParticipantTryoutWorkspace.tsx",
  "modules/tryout/ParticipantWaitingRoomModule.tsx",
  "modules/vera-ai/VeraAiPageModule.tsx",
] as const;

const sources = Object.fromEntries(
  await Promise.all(
    permittedSourcePaths.map(async (relativePath) => [
      relativePath,
      await readFile(resolve(root, relativePath), "utf8"),
    ]),
  ),
) as Record<(typeof permittedSourcePaths)[number], string>;

let checks = 0;

function check(condition: unknown, message: string) {
  checks += 1;
  assert.ok(condition, `FAIL ui-ux-uix-06: ${message}`);
}

function sourceContent(sourceOrPath: string) {
  return Object.prototype.hasOwnProperty.call(sources, sourceOrPath)
    ? sources[sourceOrPath as keyof typeof sources]
    : sourceOrPath;
}

function includes(sourceOrPath: string, fragment: string, message: string) {
  check(sourceContent(sourceOrPath).includes(fragment), message);
}

function excludes(sourceOrPath: string, fragment: string, message: string) {
  check(!sourceContent(sourceOrPath).includes(fragment), message);
}

const labels = sources["modules/admin/ai/components/AiDisplayLabels.ts"];
includes(labels, "formatAiCapabilityLabel", "Admin capability labels use a shared formatter.");
includes(labels, "Pengelolaan kebijakan AI", "Admin policy capability copy is humanized.");
includes(labels, "formatAiPolicyState", "Admin policy lifecycle states use a shared formatter.");
includes(labels, "Menunggu persetujuan", "Pending approval has Indonesian copy.");
includes(labels, "formatAiPolicyAction", "Admin policy audit actions use a shared formatter.");
includes(labels, "formatAiProviderGateState", "Provider gate labels use a shared formatter.");
includes(labels, "Gerbang penyedia: dibatasi", "Blocked provider gate copy remains truthful.");
includes(labels, "formatAiPreviewState", "Preview states use a shared formatter.");
includes(labels, "formatAiImpactState", "Impact states use a shared formatter.");

const policy = sources["modules/admin/AiPolicyPageModule.tsx"];
includes(policy, "formatAiCapabilityLabel", "Policy page maps internal capabilities before rendering.");
includes(policy, "formatAiPolicyState(draft.state)", "Policy draft state is localized at the render boundary.");
includes(policy, "formatAiPolicyAction(item.lastAction)", "Policy audit actions are localized at the render boundary.");
includes(policy, "Kebijakan kendali Vera AI", "Policy page has a concise Indonesian title.");
includes(policy, "Simpan bagian kebijakan", "Policy controls have Indonesian save copy.");
includes(policy, "Riwayat versi", "Policy history has Indonesian heading copy.");
includes(policy, "Status pratinjau", "Policy preview status has Indonesian copy.");
excludes(policy, "Provider gate: open_blocked", "Raw provider gate enum is not rendered.");
excludes(policy, "providerGateState=open_blocked", "Raw provider gate metadata is not rendered.");
excludes(policy, "Version history", "English policy history copy is not rendered.");
excludes(policy, "Buat complete draft", "Mixed-language draft action is not rendered.");
excludes(policy, "active, scheduled, dan audit history", "Raw lifecycle terminology is not rendered in the access summary.");

const banner = sources["modules/admin/components/student-banner-editor.tsx"];
includes(banner, "Banner utama siswa.", "Banner definitions use Indonesian descriptions.");
includes(banner, "Tutup pratinjau", "Banner preview close copy is localized.");
includes(banner, "Simpan draf", "Banner draft action is localized.");
includes(banner, "Terbitkan", "Banner publish action is localized.");
includes(banner, "Draf banner siswa yang sudah disimpan", "Banner publish copy preserves the saved-draft boundary.");
excludes(banner, "Student page banners", "English banner heading copy is not rendered.");
excludes(banner, "Save draft", "English banner save copy is not rendered.");
excludes(banner, "Working...", "ASCII loading ellipsis is not rendered in the banner editor.");
check(!/\p{Extended_Pictographic}/u.test(banner), "Banner editor copy does not use emoji.");

includes(sources["modules/admin/EnrollmentPageModule.tsx"], "serah-terima pendaftaran", "Enrollment description uses Indonesian terminology.");
includes(sources["modules/admin/EnrollmentPageModule.tsx"], "dari {pageCount}", "Enrollment pagination uses Indonesian from/of copy.");
const enrollment = sources["modules/admin/EnrollmentPageModule.tsx"];
includes(enrollment, 'label={error === "invalid-directory-query" ? "Perlu perhatian" : undefined}', "Invalid directory errors use a localized FormNotice label.");
excludes(enrollment, '<FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice>', "Enrollment errors do not rely on the English FormNotice default label.");

includes(sources["modules/quiz/QuizCataloguePageModule.tsx"], "Cari subjek kuis atau topik latihan…", "Quiz catalogue search copy uses a typographic ellipsis.");
includes(sources["modules/quiz/QuizSubjectDetailPageModule.tsx"], "Paket latihan siap pakai untuk latihan", "Quiz detail uses the settled latihan vocabulary.");
includes(sources["modules/quiz/QuizStartPageModule.tsx"], "Mulai kuis", "Quiz start action uses the settled Kuis vocabulary.");
includes(sources["modules/quiz/QuizResultPageModule.tsx"], "Kuis belum dikirim", "Quiz result empty state uses the settled Kuis vocabulary.");
includes(sources["modules/quiz/QuizOngoingPageModule.tsx"], "Jawaban yang sudah tersimpan tetap aman", "Quiz exit copy reflects resumable saved answers.");
includes(sources["modules/quiz/QuizOngoingPageModule.tsx"], "Selesaikan kuis ini?", "Quiz submit confirmation uses Indonesian vocabulary.");
excludes(sources["modules/quiz/QuizOngoingPageModule.tsx"], "Sayang banget", "Quiz exit copy does not use emoji or guilt language.");
excludes(sources["modules/quiz/QuizResultPageModule.tsx"], "Kembali ke quiz", "Quiz result copy does not use the English product term.");

const vera = sources["modules/vera-ai/VeraAiPageModule.tsx"];
excludes(vera, "Status sumber data Vera", "Vera does not render the source-data status banner.");
excludes(vera, "konteks dan hasil mengikuti status server", "Vera does not render the source-data freshness disclaimer.");
includes(vera, "formatVeraState(message.contentState)", "Vera message content states are humanized.");
includes(vera, "formatVeraState(message.requestState)", "Vera request states are humanized.");
includes(vera, "formatVeraArtifactType(summary.artifactType)", "Vera artifact types are humanized.");
for (const [token, label] of [
  ["visible", "Terlihat"],
  ["backend_visible", "Terlihat dari server"],
  ["fallback", "Respons cadangan"],
  ["legacy_plaintext", "Teks lama tanpa enkripsi"],
  ["retired", "Dipensiunkan"],
] as const) {
  includes(vera, `${token}: "${label}"`, `Vera state ${token} has truthful Indonesian copy.`);
}
includes(vera, "formatVeraRequestErrorCode(message.requestErrorCode)", "Vera request error codes use a friendly formatter.");
includes(vera, "Terjadi kendala saat memproses permintaan.", "Unknown Vera request errors use a localized safe fallback.");
excludes(vera, "Keterangan: ${message.requestErrorCode}", "Raw Vera request error codes are not rendered.");
includes(vera, "Cari judul, tipe, atau topik konteks…", "Vera context search uses a typographic ellipsis.");
excludes(vera, "Tanyakan konsep, soal, atau langkah belajarmu...", "Vera composer does not use an ASCII ellipsis.");
excludes(vera, "Quiz PK Modul 02", "Vera seed copy uses Kuis vocabulary.");

includes(policy, "aria-label={`${formatAiFeatureLabel(mode)} — batas input`}", "Admin quota input names use localized mode labels.");
includes(policy, "aria-label={`${formatAiFeatureLabel(mode)} — batas output`}", "Admin quota output names use localized mode labels.");
includes(policy, "aria-label={`${formatAiFeatureLabel(mode)} — batas reservasi`}", "Admin quota reservation names use localized mode labels.");
excludes(policy, "aria-label={`${mode} batas input`}", "Admin quota input names do not expose raw mode keys.");
excludes(policy, "aria-label={`${mode} batas output`}", "Admin quota output names do not expose raw mode keys.");
excludes(policy, "aria-label={`${mode} batas reservasi`}", "Admin quota reservation names do not expose raw mode keys.");
const unknownVeraMode = "vera.experimental_mode";
const humanizedUnknownVeraMode = formatAiFeatureLabel(unknownVeraMode);
check(humanizedUnknownVeraMode === "Experimental mode", "Unknown Vera modes use the humanized formatter fallback.");
check(humanizedUnknownVeraMode !== unknownVeraMode, "Unknown Vera modes do not expose the raw token.");

const icons = sources["lib/icons.tsx"];
for (const exportName of ["ClockCountdown", "Compass", "HourglassMedium", "MapPin", "Printer", "TrendUp", "WifiHigh"]) {
  includes(icons, `export const ${exportName}`, `Icon facade exports ${exportName}.`);
}

const iconConsumerPaths = [
  "modules/student/components/onboarding-form.tsx",
  "modules/tryout/ParticipantAttemptModule.tsx",
  "modules/tryout/ParticipantResultModule.tsx",
  "modules/tryout/ParticipantTryoutDetailModule.tsx",
  "modules/tryout/ParticipantTryoutEnrollmentPanel.tsx",
  "modules/tryout/ParticipantTryoutWorkspace.tsx",
  "modules/tryout/ParticipantWaitingRoomModule.tsx",
] as const;
for (const path of iconConsumerPaths) {
  includes(path, "@/lib/icons", `${path} imports icons through the shared facade.`);
  excludes(path, "@phosphor-icons/react", `${path} does not import Phosphor directly.`);
}
for (const oldIcon of ["WarningCircle", "ArrowsOut", "CalendarBlank", "SpinnerGap", "UserCircle", "CaretDown", "MagnifyingGlass", "ArrowCounterClockwise", "ArrowsClockwise"]) {
  check(!iconConsumerPaths.some((path) => sources[path].includes(oldIcon)), `Icon consumers do not use the legacy ${oldIcon} symbol.`);
}

const styles = sources["app/globals.css"];
includes(styles, "font-kerning: normal", "Global typography enables normal kerning.");
includes(styles, "font-variant-numeric: proportional-nums lining-nums", "Global typography uses lining numeric figures.");
includes(styles, "@media (prefers-reduced-motion: reduce)", "Existing reduced-motion policy remains present.");
includes(styles, "scroll-behavior: auto !important", "Existing reduced-motion scroll behavior remains intact.");

console.log(`UIX-06 contract checks passed (${checks} checks).`);
