import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const detail = read("modules/mentor/KaptenQuestionBankDetailPageModule.tsx");
const csv = read("modules/mentor/components/question-bank-csv-flow.tsx");
const createImport = read("modules/mentor/components/question-bank-create-file-import.tsx");
const importControl = read("modules/mentor/components/question-bank-import-control.tsx");
const uploadSlot = read("components/ui/file-upload-slot.tsx");
const templateDownload = read("components/ui/csv-template-download.tsx");
const templateRoute = read("app/api/mentor/question-banks/csv/template/route.ts");
const adminImports = read("modules/admin/imports/ImportsIntakeModule.tsx");
const catalogue = read("modules/mentor/KaptenQuestionBankCataloguePageModules.tsx");
const lock = read(
  "modules/mentor/components/resource-authoring-lock-banner.tsx",
);
const familySources = {
  materi: read("modules/mentor/KaptenMateriBuilderPageModule.tsx"),
  quiz: read("modules/mentor/KaptenQuizEditorPageModule.tsx"),
  package: read("modules/mentor/KaptenPackageBuilderPageModule.tsx"),
  packageMetadata: read("modules/mentor/KaptenPackageMetadataEditorModule.tsx"),
  tryout: read("modules/mentor/KaptenTryoutBuilderPageModule.tsx"),
  media: read("modules/media/media-library.tsx"),
};
const packageJson = JSON.parse(read("package.json")) as {
  scripts?: Record<string, string>;
};

for (const state of ["acquiring", "owned", "locked", "uncertain", "lost"]) {
  assert.match(lock, new RegExp(`"${state}"`, "u"));
}
assert.match(lock, /usePageStatusToast/u, "lock status must use the shared persistent Sonner lifecycle");
assert.doesNotMatch(lock, /<section\b/u, "lock status must not render a competing page banner");
assert.doesNotMatch(lock, /showScenarioPicker/u);
assert.doesNotMatch(lock, /data-authoring-lock-scenario-picker/u);
assert.match(lock, /state === "owned" \|\| state === "acquiring" \|\| state === "uncertain"/u);
assert.doesNotMatch(lock, /fixed inset-x-0 top-3/u, "root Sonner owns floating status positioning");
assert.match(lock, /Coba lagi/u);

assert.match(csv, /type CsvPreviewStatus = "idle" \| "loading" \| "valid" \| "invalid" \| "empty"/u);
assert.doesNotMatch(csv, /getMockCsvPreview|Mock ekspor CSV diminta|\[Mock CSV\]/u);
assert.match(csv, /fetch\("\/api\/mentor\/question-banks\/csv\/preview"/u);
assert.match(csv, /\/api\/mentor\/question-banks\/\$\{encodeURIComponent\(bankId\)\}\/csv\/import/u);
assert.match(csv, /\/api\/mentor\/question-banks\/\$\{encodeURIComponent\(bankId\)\}\/csv/u);
assert.match(csv, /AbortController/u);
assert.match(csv, /x-edit-lease-token/u);
assert.match(csv, /x-edit-lease-generation/u);
assert.match(csv, /x-question-bank-revision/u);
assert.match(csv, /URL\.createObjectURL/u);
assert.match(csv, /status: "loading"/u);
assert.match(csv, /data-csv-preview-status=\{preview\.status\}/u);
assert.match(csv, /FileUploadSlot/u);
assert.match(csv, /CsvTemplateDownload/u);
assert.match(csv, /\/api\/mentor\/question-banks\/csv\/template/u);
assert.doesNotMatch(csv, /Unduh header Bank Soal v1 sebelum mengisi pertanyaan/u);
assert.doesNotMatch(csv, /UTF-8, maksimal 2 MiB dan 500 baris data/u);
assert.match(createImport, /function QuestionBankCreateFileImportControl/u);
assert.match(createImport, /FileUploadSlot/u);
assert.match(createImport, /useQuestionBankCsvPreview/u);
assert.match(createImport, /QuestionBankXlsxDraftPreviewPanel/u);
assert.match(createImport, /csvPreview.status !== "valid"/u);
assert.match(createImport, /toQuestionBankCsvDraftPayload/u);
assert.match(createImport, /onCsvDraftApplied\(\{/u, "validated CSV rows are passed to the controlled draft");
assert.match(createImport, /onXlsxDraftApplied\(draft\)/u);
assert.doesNotMatch(createImport, /saveQuestionBank|createQuestionBank|\/csv\/import/u, "preview selection must not persist a Bank Soal");
assert.match(importControl, /function QuestionBankImportControl/u);
assert.match(importControl, /aria-label="Impor Soal"/u);
assert.match(importControl, /TooltipContent>Impor Soal<\/TooltipContent>/u);
assert.match(importControl, /disabled=\{disabled \|\| !editLease\}/u);
assert.match(importControl, /QuestionBankCsvImportDialog/u);
assert.match(importControl, /QuestionBankXlsxImportContent/u);
assert.match(csv, /function QuestionBankCsvImportDialog/u);
assert.match(csv, /value="append"/u);
assert.match(csv, /value="overwrite"/u);
assert.match(csv, /data-csv-import-apply="true"/u);
assert.match(csv, /Tambahkan\s*<\/span>/u);
assert.match(csv, /Timpa semua/u);
assert.match(csv, /Terapkan tambahan/u);
assert.match(csv, /Terapkan timpa/u);
assert.match(csv, /function QuestionBankCsvExportAction/u);
assert.doesNotMatch(csv, /Ekspor CSV/u);
assert.match(csv, /Unduh soal/u);
assert.match(csv, /sm:grid-cols-2/u);
assert.match(csv, /onApplied/u);
assert.match(uploadSlot, /data-file-upload-slot="true"/u);
assert.match(uploadSlot, /Drop|Letakkan file/u);
assert.match(uploadSlot, /role="progressbar"/u);
assert.match(uploadSlot, /uploading\?: boolean/u);
assert.match(uploadSlot, /pointer-events-none/u);
assert.match(uploadSlot, /File sedang diproses/u);
assert.doesNotMatch(uploadSlot, /Upload sedang diproses/u);
assert.doesNotMatch(uploadSlot, /fileTypeLabel|ChevronDown/u);
assert.match(templateDownload, /data-csv-template-download="true"/u);
assert.match(templateDownload, /download=\{fileName\}/u);
assert.match(templateRoute, /QUESTION_BANK_CSV_HEADER/u);
assert.match(templateRoute, /readTutorCsvSession/u);
assert.match(adminImports, /FileUploadSlot/u);

const questionsSection =
  detail.match(
    /function QuestionBankQuestionsSection\([\s\S]*?\n\}\n\nfunction QuestionBankArchiveConfirmationDialog/u,
  )?.[0] ?? "";
const archiveSection =
  detail.match(
    /function QuestionBankArchiveSection\([\s\S]*?\n\}\n\ntype QuestionBankMetadataFormState/u,
  )?.[0] ?? "";
assert.match(
  questionsSection,
  /<QuestionBankEditorButton bank=\{bank\} bankId=\{bankId\} \/>[\s\S]*?<QuestionBankImportControl/u,
  "the file import control stays beside Buka Editor",
);
assert.match(archiveSection, /<QuestionBankCsvExportAction[\s\S]*?<QuestionBankLifecycleActions/u);
assert.match(detail, /ResourceEditLockProvider/u);
assert.match(detail, /getQuestionBankForEditAction/u);
assert.match(detail, /onImport=\{async \(\) =>/u);
assert.match(detail, /onImport=\{async \(\) =>[\s\S]*router\.refresh\(\)/u);
assert.match(detail, /expectedRevision=\{bank\.revision \?\? 1\}/u);
assert.match(questionsSection, /expectedRevision=\{expectedRevision\}/u);

assert.match(builder, /QuestionBankCreateFileImportControl/u);
assert.match(builder, /onCsvDraftApplied=\{actions\.replaceCsvDraft\}/u);
assert.match(builder, /csvDraftInfo/u);
assert.match(builder, /replaceCsvDraft: \(summary: QuestionBankCsvDraftSummary\)/u);
assert.match(builder, /questions: \[\.\.\.retainedQuestions, \.\.\.draftQuestions\]/u, "replacing file-derived rows preserves manually authored rows");
assert.match(builder, /ResourceEditLockProvider/u);
assert.match(builder, /resourceLock\.proof/u);
assert.match(builder, /state\.lockState/u);
assert.doesNotMatch(builder, /onLockStateChange|\[Mock CSV\]/u);
assert.match(catalogue, /createDialogOpen \? \([\s\S]*<KaptenQuestionBankBuilderPageModule/u);
assert.match(catalogue, /setCreateDialogOpen\(true\)/u);
assert.match(catalogue, /mode="create"/u);
assert.match(catalogue, /presentation="modal"/u);

for (const [family, source] of Object.entries(familySources)) {
  assert.match(source, /ResourceEditLockProvider/u, `${family} must mount the shared lock provider`);
  assert.match(source, /useResourceEditLock/u, `${family} must consume the shared lock state`);
  assert.match(source, /editLease/u, `${family} mutations must carry strict lease proof`);
  assert.match(source, /ResourceAuthoringLockBanner/u, `${family} must expose the shared lock banner`);
}
assert.match(familySources.media, /media_asset/u);
assert.match(familySources.media, /media_folder/u);
assert.match(familySources.media, /mutationsDisabled/u);
assert.match(familySources.media, /postMediaAction\(scope, \{ \.\.\.body, \.\.\.\(editLease/u);

assert.equal(
  packageJson.scripts?.["test:mentor-bank-soal-lock-csv-ui"],
  "tsx scripts/test-mentor-bank-soal-lock-csv-ui.ts",
);

console.log("Mentor Bank Soal resource-lock and CSV UI contracts passed.");
