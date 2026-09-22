import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const detail = read("modules/mentor/KaptenQuestionBankDetailPageModule.tsx");
const csv = read("modules/mentor/components/question-bank-csv-flow.tsx");
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
assert.match(lock, /data-authoring-lock-state=\{state\}/u);
assert.match(lock, /data-read-only=\{readOnly \? "true" : "false"\}/u);
assert.doesNotMatch(lock, /showScenarioPicker/u);
assert.doesNotMatch(lock, /data-authoring-lock-scenario-picker/u);
assert.match(lock, /Draf yang belum disimpan tidak dihapus/u);
assert.match(lock, /Coba ambil izin edit lagi/u);
assert.match(lock, /aria-describedby="resource-authoring-lock-description"/u);
assert.match(lock, /sm:flex-row/u);

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
assert.match(csv, /function QuestionBankCsvCreateInput/u);
assert.match(csv, /data-question-bank-csv-create="true"/u);
assert.match(csv, /Gunakan CSV untuk draf/u);
assert.match(csv, /function QuestionBankCsvImportControl/u);
assert.match(csv, /aria-label="Impor CSV ke Bank Soal"/u);
assert.match(csv, /TooltipContent>Impor soal dari CSV<\/TooltipContent>/u);
assert.match(csv, /function QuestionBankCsvImportDialog/u);
assert.match(csv, /value="append"/u);
assert.match(csv, /value="overwrite"/u);
assert.match(csv, /data-csv-import-apply="true"/u);
assert.match(csv, /Tambahkan<\/span>/u);
assert.match(csv, /Timpa semua/u);
assert.match(csv, /Terapkan tambahan/u);
assert.match(csv, /Terapkan timpa/u);
assert.match(csv, /function QuestionBankCsvExportAction/u);
assert.match(csv, /Ekspor CSV/u);
assert.match(csv, /sm:grid-cols-2/u);
assert.match(csv, /onApplied/u);

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
  /<QuestionBankEditorButton bank=\{bank\} bankId=\{bankId\} \/>[\s\S]*?<QuestionBankCsvImportControl/u,
  "the icon-only CSV import control stays beside Buka Editor",
);
assert.match(archiveSection, /<QuestionBankCsvExportAction[\s\S]*?<QuestionBankLifecycleActions/u);
assert.match(detail, /ResourceEditLockProvider/u);
assert.match(detail, /getQuestionBankForEditAction/u);
assert.match(detail, /onImport=\{async \(\) =>/u);
assert.match(detail, /onImport=\{async \(\) =>[\s\S]*router\.refresh\(\)/u);
assert.match(detail, /QuestionBankCsvImportControl[\s\S]*expectedRevision=\{bank\.revision \?\? 1\}/u);

assert.match(builder, /QuestionBankCsvCreateInput/u);
assert.match(builder, /onApply=\{actions\.replaceCsvDraft\}/u);
assert.match(builder, /replaceCsvDraft: \(summary: QuestionBankCsvDraftSummary\)/u);
assert.match(builder, /ResourceEditLockProvider/u);
assert.match(builder, /resourceLock\.proof/u);
assert.match(builder, /state\.lockState/u);
assert.doesNotMatch(builder, /onLockStateChange|\[Mock CSV\]/u);

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
