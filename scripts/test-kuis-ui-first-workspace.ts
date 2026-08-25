import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [detailRoute, editorRoute, createRoute, resultsRoute, detail, editor, builder, actions, repository, results, submission] = await Promise.all([
  readFile(`${root}/app/mentor/quiz/[quizId]/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/quiz/[quizId]/editor/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/quiz/create/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/quiz/[quizId]/results/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizDetailPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizEditorPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/quiz-actions.ts`, "utf8"),
  readFile(`${root}/lib/quiz/repository.ts`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizResultsPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizSubmissionPageModule.tsx`, "utf8"),
]);

const noBankOrAssemblyClientDependency = /listQuestionBank|listReadyAssembly|question-bank|QuestionBank|attachStandaloneQuizAssembly|detachStandaloneQuizAssembly|assemblyVersionId|sourceBankId/u;
for (const [label, source] of [["detail route", detailRoute], ["editor route", editorRoute], ["create route", createRoute], ["detail module", detail], ["editor module", editor], ["builder compatibility module", builder], ["quiz actions", actions]] as const) {
  assert.doesNotMatch(source, noBankOrAssemblyClientDependency, `${label} must not browse or attach Bank Soal/Ready sources`);
}

assert.match(detailRoute, /searchParams: Promise/u, "detail route must accept a deep-linked tab");
assert.match(detail, /value="preview"/u, "detail must expose Preview Soal");
assert.match(detail, /value="hasil"/u, "detail must expose Hasil");
assert.match(detail, /value="pengaturan"/u, "detail must expose Pengaturan");
assert.match(detail, /router\.push\(`\/mentor\/quiz\/\$\{quiz\.id\}\?tab=\$\{next\}`/u, "detail tab selection must preserve URL history");
assert.match(detail, /Edit soal/u, "detail must expose the dedicated editor action");
assert.match(editorRoute, /KaptenQuizEditorPageModule/u, "editor route must render the dedicated editor");
assert.match(editor, /Daftar soal/u, "editor must expose a question inventory");
assert.match(editor, /Tambah soal/u, "editor must add local questions");
assert.match(editor, /Pindah soal/u, "editor must reorder questions");
assert.match(editor, /Hapus soal/u, "editor must delete questions");
assert.match(editor, /Edit soal/u, "editor must expose an edit mode");
assert.match(editor, /Preview/u, "editor must expose a preview mode");
assert.match(editor, /MediaPickerDialog/u, "editor must support media attachments");
assert.match(editor, /shouldGuardNavigation=\{hasUnsavedChanges\}/u, "editor must guard unsaved navigation");
assert.match(editor, /Perubahan Kuis tersimpan/u, "editor must provide save feedback");
assert.match(createRoute, /mode="create"/u, "create flow must use the standalone editor");
assert.match(resultsRoute, /redirect\(`\/mentor\/quiz\/\$\{quizId\}\?tab=hasil`/u, "legacy results route must redirect to Hasil");
assert.match(results, /function KaptenQuizResultsContent/u, "results must have embeddable content");
assert.match(detail, /KaptenQuizResultsContent/u, "detail must embed results without a nested shell");
assert.match(submission, /\?tab=hasil/u, "submission back navigation must preserve Hasil context");

assert.match(repository, /const quizContentInclude = \{/u, "mentor detail reads must have a Kuis-owned content include");
assert.match(repository, /include: quizContentInclude/u, "mentor detail reads must avoid source/assembly relation fetches");
assert.match(repository, /assemblyPackageVersionId: null/u, "standalone save must clear legacy assembly linkage");
assert.match(repository, /assemblyMode: null/u, "standalone save must clear legacy assembly mode");
assert.match(repository, /sourceBankId: null/u, "standalone save must clear legacy Bank linkage");
assert.match(repository, /sourceQuestionId: null/u, "standalone save must materialize local question snapshots");
assert.match(repository, /sourceQuestionRevisionId: null/u, "standalone save must clear source revision linkage");

console.log("Kuis UI-first standalone workspace contract passed.");
