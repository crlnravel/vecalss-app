import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [detailRoute, editorRoute, createRoute, resultsRoute, detail, editor, builder, actions, repository, results, submission, quizCatalogue] = await Promise.all([
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
  readFile(`${root}/modules/mentor/KaptenQuizCataloguePageModules.tsx`, "utf8"),
]);

const noBankOrAssemblyClientDependency = /listQuestionBank|listReadyAssembly|question-bank|QuestionBank|attachStandaloneQuizAssembly|detachStandaloneQuizAssembly|assemblyVersionId|sourceBankId/u;
for (const [label, source] of [["detail route", detailRoute], ["editor route", editorRoute], ["create route", createRoute], ["detail module", detail], ["editor module", editor], ["builder compatibility module", builder], ["quiz actions", actions]] as const) {
  assert.doesNotMatch(source, noBankOrAssemblyClientDependency, `${label} must not browse or attach Bank Soal/Ready sources`);
}

assert.match(detailRoute, /searchParams: Promise/u, "detail route must accept a deep-linked tab");
assert.match(detail, /const subjectHref = subject \? `\/mentor\/quiz\/subject\/\$\{subject\.slug\}` : "\/mentor\/quiz";/u, "detail back navigation must derive the subject route");
assert.match(detail, /render=\{<Link href=\{subjectHref\} \/>\}/u, "detail back navigation must target the subject route");
assert.match(detail, /breadcrumbLabel="Detail Kuis"/u, "detail breadcrumb must use the detail label");
assert.match(detail, /breadcrumbParent=\{subject \? \{ href: subjectHref, label: subject\.code \} : undefined\}/u, "detail breadcrumb must include the subject parent");
assert.match(detail, /value="preview"/u, "detail must expose Preview Soal");
assert.match(detail, /value="preview">Soal<\/FullWidthLineTabsTrigger>/u, "detail must label the question tab Soal");
assert.match(detail, /value="hasil"/u, "detail must expose Hasil");
assert.match(detail, /value="hasil">Hasil<\/FullWidthLineTabsTrigger>/u, "Hasil tab must remain text-only");
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
assert.match(editor, /function hasQuizDraftContent\(/u, "quiz exit guarding must recognize an empty create scaffold");
assert.match(editor, /useState\(mode === "create" && hasQuizDraftContent\(initialForm\)\)/u, "empty create quizzes must not start with an unsaved-change guard");
assert.match(editor, /setHasUnsavedChanges\(mode === "create" \? hasQuizDraftContent\(nextForm\) : true\)/u, "create-mode exit guarding must clear when its fields are emptied");
assert.match(editor, /isSaving \? "Membuat…" : "Buat"/u, "create quiz action must use creation copy");
assert.match(editor, /aria-label="Buat"[\s\S]*?variant="brand"/u, "create quiz action must use the primary button variant");
assert.match(editor, /<ChevronLeft \/>\{mode === "create" \? null : "Kembali ke Detail"\}/u, "create quiz back action must be icon-only");
assert.match(editor, /data-quiz-editor-shell="full-page"/u, "quiz editing must use a full-page shell");
assert.match(editor, /min-h-14 shrink-0 flex-wrap items-center/u, "full-page editor must expose the Bank Soal-style top header");
assert.doesNotMatch(editor, /const metadata =|>\{metadata\}/u, "full-page editor must not render the removed quiz metadata card");
assert.match(editor, /Tampilan penulis · belum dikirim/u, "editor preview must be a neutral author preview");
assert.match(editor, /Perubahan Kuis tersimpan/u, "editor must provide save feedback");
assert.match(createRoute, /mode="create"/u, "create flow must use the standalone editor");
assert.match(resultsRoute, /redirect\(`\/mentor\/quiz\/\$\{quizId\}\?tab=hasil`/u, "legacy results route must redirect to Hasil");
assert.match(results, /function KaptenQuizResultsContent/u, "results must have embeddable content");
assert.doesNotMatch(results, /Bagian hasil Kuis|Peserta|Statistik|StatisticsPanel|Distribusi nilai|Peta skor|recharts/u, "Hasil must remain one results view without participant/statistics tabs or aggregate statistics");
assert.doesNotMatch(results, /Lihat pengiriman jawaban dan buka detail submisi tanpa meninggalkan detail Kuis/u, "Hasil must not include the removed helper copy");
assert.match(results, /aria-label="Filter hasil"/u, "one results view must retain lightweight attempt filters");
assert.match(detail, /KaptenQuizResultsContent/u, "detail must embed results without a nested shell");
assert.match(detail, /QuizQuestionCard/u, "question list must render authored question cards");
assert.match(detail, /questions\.map\(\(question, index\)/u, "question list must preserve authored question order");
assert.match(detail, /Pembahasan/u, "question cards must render authored explanations");
assert.doesNotMatch(detail, /Daftar Soal|Buka Editor Soal/u, "Kuis preview must not show a separate Bank Soal list header");
assert.doesNotMatch(detail, /Metadata ini hanya berlaku untuk Kuis mandiri ini|Perubahan akan divalidasi lagi oleh server saat disimpan/u, "settings must not include implementation helper copy");
assert.match(detail, /Susunan soal di percobaan ulang/u, "retry behavior must use clearer language");
assert.match(detail, /Pertahankan soal dan urutan/u, "retry choices must explain the stable form");
assert.match(detail, /Acak soal setiap percobaan/u, "retry choices must explain randomization");
assert.match(detail, /className="w-full"[^>]*disabled=\{disabled \|\| isSaving/u, "settings save action must span the page width at the bottom");
assert.match(detail, /Perubahan Kuis tersimpan/u, "settings save must provide a success action toast");
assert.match(detail, /showToast\(result\.message, \{ variant: "error" \}\)/u, "save failures must provide an error action toast");
assert.match(detail, /data-quiz-settings-metadata="bank-style"/u, "Kuis metadata settings must use the Bank Soal editing treatment");
assert.doesNotMatch(detail, />Informasi Kuis<\/h2>/u, "Kuis settings must not render a duplicate Informasi Kuis form heading");
assert.match(detail, /aria-label="Ubah judul Kuis"/u, "Kuis title metadata must use an inline edit affordance");
assert.match(detail, /aria-label="Ubah deskripsi Kuis"/u, "Kuis description metadata must use an inline edit affordance");
assert.match(detail, /aria-label="Ubah subjek Kuis"/u, "Kuis subject metadata must use an inline edit affordance");
assert.match(detail, /Belum ada deskripsi untuk Kuis ini\. Klik ikon pensil untuk menambahkan\./u, "Kuis metadata must show the editable empty-description copy");
assert.match(detail, /<MentorBadge size="md" tone="category">/u, "Kuis metadata must show the larger subject chip");
assert.doesNotMatch(detail, /<Eye|value="preview"><ListChecks|value="hasil"><ListChecks/u, "Soal and Hasil tabs must not show their former icons");
assert.doesNotMatch(detail, /Arsipkan|updateStandaloneQuizLifecycleAction/u, "Kuis detail must not expose archive lifecycle controls");
assert.match(quizCatalogue, /function QuizRow/u, "subject catalogue must retain its quiz row component");
assert.match(quizCatalogue, /grid min-w-0 gap-4 p-5/u, "quiz rows must use Tryout-style card sizing");
assert.match(quizCatalogue, /<span className="mt-0\.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">/u, "quiz rows must use the Tryout-style icon treatment");
assert.match(quizCatalogue, /<ListChecks aria-hidden="true" className="size-5" \/>/u, "quiz rows must show the quiz icon");
assert.match(quizCatalogue, /<h2 className="truncate text-base font-semibold text-secondary-900">/u, "quiz row titles must use Tryout-style sizing");
assert.match(quizCatalogue, /<div className="mt-1 flex flex-wrap items-center gap-2">/u, "quiz row badges must sit beneath the title");
assert.match(quizCatalogue, /<ReferenceStatusBadge appearance="mentor" size="sm" status=\{quiz\.status\} \/>/u, "quiz row badges must use Tryout-style sizing");
assert.match(quizCatalogue, /aria-label=\{`Buka \$\{quiz\.title\}`\}/u, "quiz rows must provide a direct open action");
assert.match(quizCatalogue, /<ChevronRight aria-hidden/u, "quiz rows must use the Tryout-style trailing chevron");
assert.doesNotMatch(quizCatalogue, /<Archive|>Arsipkan<|>Pulihkan</u, "subject catalogue must not expose archive lifecycle actions");
assert.doesNotMatch(quizCatalogue, /Lihat hasil siswa|aria-label="Edit quiz"|Aksi untuk \$\{quiz\.title\}|<Ellipsis/u, "quiz rows must not expose row-level action controls");
assert.doesNotMatch(quizCatalogue, /<span>\{quiz\.primaryMetric\}<\/span>|quizDateFormatter/u, "quiz rows must not repeat metadata below the title");
assert.match(submission, /\?tab=hasil/u, "submission back navigation must preserve Hasil context");

assert.match(repository, /const quizContentInclude = \{/u, "mentor detail reads must have a Kuis-owned content include");
assert.match(repository, /include: quizContentInclude/u, "mentor detail reads must avoid source/assembly relation fetches");
assert.match(repository, /assemblyPackageVersionId: null/u, "standalone save must clear legacy assembly linkage");
assert.match(repository, /assemblyMode: null/u, "standalone save must clear legacy assembly mode");
assert.match(repository, /sourceBankId: null/u, "standalone save must clear legacy Bank linkage");
assert.match(repository, /sourceQuestionId: null/u, "standalone save must materialize local question snapshots");
assert.match(repository, /sourceQuestionRevisionId: null/u, "standalone save must clear source revision linkage");

console.log("Kuis UI-first standalone workspace contract passed.");
