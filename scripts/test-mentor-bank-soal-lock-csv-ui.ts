import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const detail = read("modules/mentor/KaptenQuestionBankDetailPageModule.tsx");
const csv = read("modules/mentor/components/question-bank-csv-flow.tsx");
const lock = read(
  "modules/mentor/components/resource-authoring-lock-banner.tsx",
);
const packageJson = JSON.parse(read("package.json")) as {
  scripts?: Record<string, string>;
};

for (const state of ["acquiring", "owned", "locked", "uncertain", "lost"]) {
  assert.match(lock, new RegExp(`"${state}"`, "u"));
}
assert.match(lock, /data-authoring-lock-state=\{state\}/u);
assert.match(lock, /data-read-only=\{readOnly \? "true" : "false"\}/u);
assert.match(lock, /showScenarioPicker/u);
assert.match(lock, /data-authoring-lock-scenario-picker/u);
assert.match(lock, /Draf yang belum disimpan tidak dihapus/u);
assert.match(lock, /Coba ambil izin edit lagi/u);
assert.match(lock, /aria-describedby="resource-authoring-lock-description"/u);
assert.match(lock, /sm:flex-row/u);

assert.match(csv, /type CsvPreviewStatus = "idle" \| "loading" \| "valid" \| "invalid" \| "empty"/u);
assert.match(csv, /function getMockCsvPreview/u);
assert.match(csv, /normalizedName\.includes\("empty"\)/u);
assert.match(csv, /normalizedName\.includes\("invalid"\)/u);
assert.match(csv, /normalizedName\.includes\("large"\)/u);
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
assert.match(csv, /Terapkan tambahan/u);
assert.match(csv, /Terapkan timpa/u);
assert.match(csv, /function QuestionBankCsvExportAction/u);
assert.match(csv, /Ekspor CSV/u);
assert.match(csv, /Mock ekspor CSV diminta/u);
assert.match(csv, /sm:grid-cols-2/u);
assert.doesNotMatch(csv, /fetch\(|\/api\/|prisma|repository/u);

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
assert.match(detail, /ResourceAuthoringLockBanner[\s\S]*showScenarioPicker/u);
assert.match(detail, /onImport=\{\(summary\) =>/u);
assert.match(detail, /mode === "append"/u);

assert.match(builder, /QuestionBankCsvCreateInput/u);
assert.match(builder, /onApply=\{actions\.replaceCsvDraft\}/u);
assert.match(builder, /replaceCsvDraft: \(summary: QuestionBankCsvDraftSummary\)/u);
assert.match(builder, /onLockStateChange: setLockState/u);
assert.match(builder, /isMetadataLocked =\s*editorState\.lifecycleStatus === "archived" \|\| lockState/u);
assert.match(builder, /isQuestionContentLocked =\s*editorState\.lifecycleStatus === "archived" \|\| lockState/u);
assert.match(builder, /state\.lockState/u);
assert.match(builder, /\[Mock CSV\]/u);

assert.equal(
  packageJson.scripts?.["test:mentor-bank-soal-lock-csv-ui"],
  "tsx scripts/test-mentor-bank-soal-lock-csv-ui.ts",
);

console.log("Mentor Bank Soal resource-lock and CSV UI contracts passed.");
