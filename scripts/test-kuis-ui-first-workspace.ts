import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [detailRoute, editorRoute, createRoute, resultsRoute, detail, editor, picker, builder, repository, results, submission, quizCatalogue] = await Promise.all([
  readFile(`${root}/app/mentor/quiz/[quizId]/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/quiz/[quizId]/editor/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/quiz/create/page.tsx`, "utf8"),
  readFile(`${root}/app/mentor/quiz/[quizId]/results/page.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizDetailPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizEditorPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/components/question-bank-picker.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizBuilderPageModule.tsx`, "utf8"),
  readFile(`${root}/lib/quiz/repository.ts`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizResultsPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizSubmissionPageModule.tsx`, "utf8"),
  readFile(`${root}/modules/mentor/KaptenQuizCataloguePageModules.tsx`, "utf8"),
]);
const actions = await readFile(`${root}/modules/mentor/quiz-actions.ts`, "utf8");

// Guard client-visible Kuis surfaces. Legacy source identifiers may remain in
// server-owned persistence compatibility, and future import actions stay
// server-only until an explicitly approved UI flow exists.
const noBankOrAssemblyClientDependency = /listQuestionBank|listReadyAssembly|question-bank|QuestionBank|attachStandaloneQuizAssembly|detachStandaloneQuizAssembly|assemblyVersionId/u;
for (const [label, source] of [["detail route", detailRoute], ["editor route", editorRoute], ["create route", createRoute], ["detail module", detail], ["builder compatibility module", builder]] as const) {
  assert.doesNotMatch(source, noBankOrAssemblyClientDependency, `${label} must not browse or attach Bank Soal/Ready sources`);
}

assert.match(detailRoute, /searchParams: Promise/u, "detail route must accept a deep-linked tab");
assert.match(detail, /const subjectHref = subject\s*\?\s*`\/mentor\/quiz\/subject\/\$\{subject\.slug\}`\s*:\s*"\/mentor\/quiz";/u, "detail back navigation must derive the subject route");
assert.match(detail, /render=\{<Link href=\{subjectHref\} \/>\}/u, "detail back navigation must target the subject route");
assert.match(detail, /breadcrumbLabel="Detail Kuis"/u, "detail breadcrumb must use the detail label");
assert.match(detail, /breadcrumbParent=\{\s*subject\s*\?\s*\{\s*href:\s*subjectHref,\s*label:\s*subject\.code\s*\}\s*:\s*undefined\s*\}/u, "detail breadcrumb must include the subject parent");
assert.match(detail, /value="preview"/u, "detail must expose Preview Soal");
assert.match(detail, /value="preview"[\s\S]*?>\s*Soal\s*<\/FullWidthLineTabsTrigger>/u, "detail must label the question tab Soal");
assert.match(detail, /value="hasil"/u, "detail must expose Hasil");
assert.match(detail, /value="hasil"[\s\S]*?>\s*Hasil\s*<\/FullWidthLineTabsTrigger>/u, "Hasil tab must remain text-only");
assert.match(detail, /value="pengaturan"/u, "detail must expose Pengaturan");
assert.match(detail, /router\.push\(`\/mentor\/quiz\/\$\{quiz\.id\}\?tab=\$\{next\}`/u, "detail tab selection must preserve URL history");
assert.match(detail, /Edit soal/u, "detail must expose the dedicated editor action");
assert.match(editorRoute, /KaptenQuizEditorPageModule/u, "editor route must render the dedicated editor");
assert.match(editor, /Daftar soal/u, "editor must expose a question inventory");
assert.match(editor, /QuestionBankPickerDialog/u, "editor must expose reusable Bank Soal selection");
assert.match(editor, /Tambah soal dari Bank Soal/u, "editor must expose the Bank Soal primary add action");
assert.match(editor, /Bank Soal:/u, "editor must label its source Bank Soal beneath the add action");
assert.match(editor, /sourceBankTitle=\{state\.savedQuiz\?\.sourceBank\}/u, "editor must show the selected source Bank Soal title");
assert.match(editor, /question-bank\/\$\{state\.savedQuiz\.sourceBankId\}\?purpose=quiz/u, "editor Bank Soal link must target the selected source");
assert.doesNotMatch(editor, /Konten dikelola di Bank Soal/u, "the removed Bank Soal snapshot banner must not render in the Kuis editor");
assert.match(editor, /data-quiz-question-content-editor="disabled"/u, "bank-sourced question content must be read-only in the Kuis editor");
assert.match(editor, /data-quiz-question-empty/u, "editor must expose an empty state when no questions are selected");
assert.match(editor, /Belum ada soal di Kuis ini/u, "empty editor state must explain that no questions are selected");
assert.match(editor, /Tambah soal dari Bank Soal/u, "empty editor state must offer the Bank Soal picker");
assert.doesNotMatch(editor, /data-source-update-review|Tinjau perubahan|Terima ke draf|Perlu ditinjau/u, "published Bank Soal revisions must not render a manual review card");
assert.match(editor, /autoAppliedUpdateKeysRef/u, "published Bank Soal revisions must be applied automatically");
assert.match(editor, /Pindah soal/u, "editor must reorder questions");
assert.match(editor, /Hapus soal/u, "editor must delete questions");
assert.doesNotMatch(editor, /function QuestionForm|Edit soal|quiz-preview-toggle|MediaPickerDialog|Tampilan penulis/u, "Kuis must not expose a local question editor or preview toggle");
assert.match(editor, /shouldGuardNavigation=\{state\.hasUnsavedChanges\}/u, "editor must guard unsaved navigation");
assert.match(editor, /function hasQuizDraftContent\(/u, "quiz exit guarding must recognize an empty create scaffold");
assert.match(editor, /useState\(\s*mode === "create" && hasQuizDraftContent\(initialForm\)\s*,?\s*\)/u, "empty create quizzes must not start with an unsaved-change guard");
assert.match(editor, /setHasUnsavedChanges\(\s*mode === "create" \? hasQuizDraftContent\(nextForm\) : true\s*,?\s*\)/u, "create-mode exit guarding must clear when its fields are emptied");
assert.match(editor, /isSaving \? "Membuat…" : "Buat"/u, "create quiz action must use creation copy");
assert.match(editor, /aria-label="Buat"[\s\S]*?variant="brand"/u, "create quiz action must use the primary button variant");
assert.match(editor, /<ChevronLeft\s*\/>\s*Kembali ke daftar/u, "create quiz back action must return to the Kuis catalogue");
assert.match(editor, /data-quiz-editor-shell="full-page"/u, "quiz editing must use a full-page shell");
assert.match(editor, /min-h-14 shrink-0 flex-wrap items-center/u, "full-page editor must expose the Bank Soal-style top header");
assert.doesNotMatch(editor, /const metadata =|>\{metadata\}/u, "full-page editor must not render the removed quiz metadata card");
assert.match(editor, /function QuizMobileInventory\(/u, "quiz editor must use the Bank Soal-style mobile inventory");
assert.match(editor, /id="quiz-inventory-title"[\s\S]*?>\s*Inventori soal/u, "quiz inventory must use the Bank Soal inventory heading");
assert.match(editor, /QuestionPreview/u, "quiz editor must show a read-only question preview");
assert.doesNotMatch(editor, /<div className="h-5 w-px bg-primary-100" \/>/u, "quiz header must not render a divider beside the title");
assert.match(editor, /aria-label="Simpan"[\s\S]*?variant="brand"/u, "quiz save must remain a primary action");
assert.match(editor, /Preview Soal/u, "editor must label the read-only question preview");
assert.match(editor, /Perubahan Kuis tersimpan/u, "editor must provide save feedback");
assert.match(picker, /selectedQuestions/u, "Bank Soal picker must retain pending selection across server pages");
assert.match(picker, /selectedOnly/u, "Bank Soal picker must expose selected-only review");
assert.doesNotMatch(picker, /QuestionPreview|Pratinjau soal|Lihat pratinjau|onPreview/u, "Tambah bank soal modal must not render soal preview UI");
assert.match(picker, /expectedSources/u, "Bank Soal picker must submit revision expectations");
assert.match(picker, /Tambah(?:kan)? \$\{selectedCount\} soal/u, "Bank Soal picker must show a persistent selected count action");
assert.doesNotMatch(picker, /lockedBankId/u, "Bank Soal picker must allow changing the source bank");
assert.match(picker, /pendingBankId/u, "changing the source bank must wait for confirmation");
assert.match(picker, /Ganti Bank Soal\?/u, "source-bank confirmation must identify the change");
assert.match(picker, /Semua soal yang saat ini dipilih di Kuis akan dibatalkan/u, "source-bank confirmation must warn that current selections will be unselected");
assert.match(picker, /effectiveExistingQuestionIds/u, "source-bank changes must exclude the previous selections from the next import");
assert.doesNotMatch(picker, /Sudah ditambahkan/u, "question picker must not render the removed added-status badge");
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
assert.match(detail, /<h2 className="text-xl font-bold tracking-tight text-secondary-900 sm:text-2xl">\s*Daftar Soal\s*<\/h2>/u, "Kuis preview must show the question-list heading");
assert.match(detail, /<MentorBadge className="font-bold" size="xs" tone="category">[\s\S]*?\{questions\.length\} Soal/u, "Kuis preview must show the live question count");
assert.match(detail, /data-quiz-preview-header="true"[\s\S]*?Daftar Soal[\s\S]*?Edit soal/u, "Kuis preview must align the question heading with its edit action");
assert.doesNotMatch(detail, /Metadata ini hanya berlaku untuk Kuis mandiri ini|Perubahan akan divalidasi lagi oleh server saat disimpan/u, "settings must not include implementation helper copy");
assert.doesNotMatch(detail, /Susunan soal di percobaan ulang|Ulas pembahasan|Jawaban benar/u, "removed Kuis settings sections must not render");
assert.doesNotMatch(detail, /Jeda percobaan ulang|quiz-settings-retry/u, "retry delay must not be exposed in Kuis settings");
assert.doesNotMatch(detail, /data-quiz-settings-card="question-order"|data-quiz-settings-card="review"|data-quiz-settings-card="answer-visibility"|data-quiz-settings-card="review-options"|data-quiz-settings-section=/u, "removed Kuis settings sections must not leave settings cards or dividers behind");
assert.doesNotMatch(detail, /border-t border-primary-100\/70/u, "removed Kuis settings sections must not leave thin dividers behind");
assert.match(detail, /data-quiz-settings-card="lifecycle"[\s\S]*Arsipkan Kuis/u, "archive lifecycle action must have its own settings card");
assert.doesNotMatch(detail, /Terbitkan|Jadikan draf/u, "Kuis must not expose publish or draft lifecycle actions");
assert.match(detail, /Pengaturan Kuis[\s\S]*?id="quiz-settings-duration"[\s\S]*?data-quiz-settings-save="primary"[\s\S]*?Simpan/u, "settings save action must sit inside the settings card below the duration field");
assert.match(detail, /Perubahan Kuis tersimpan/u, "settings save must provide a success action toast");
assert.match(detail, /showToast\(result\.message, \{ variant: "error" \}\)/u, "save failures must provide an error action toast");
assert.match(actions, /getMentorStandaloneQuiz/u, "quiz saves must reload canonical persisted questions");
assert.match(actions, /questions:\s*refreshed\.questions/u, "quiz saves must return canonical persisted questions");
assert.match(detail, /data-quiz-settings-metadata="bank-style"/u, "Kuis metadata settings must use the Bank Soal editing treatment");
assert.match(detail, /id="quiz-settings-duration"/u, "Kuis settings must expose a duration field");
assert.match(detail, /durationSeconds:/u, "Kuis settings must persist duration in seconds");
assert.match(detail, />\s*Menit\s*<\/span>/u, "Kuis duration must show its minute unit inside the input");
assert.doesNotMatch(detail, /Dalam menit\. Kosongkan jika tanpa batas waktu\./u, "Kuis duration must not render the redundant helper copy");
assert.doesNotMatch(detail, /Penilaian akhir/u, "Kuis settings must keep the default score policy without exposing a dropdown");
assert.doesNotMatch(detail, />Informasi Kuis<\/h2>/u, "Kuis settings must not render a duplicate Informasi Kuis form heading");
assert.match(detail, /aria-label="Ubah judul Kuis"/u, "Kuis title metadata must use an inline edit affordance");
assert.match(detail, /aria-label="Ubah deskripsi Kuis"/u, "Kuis description metadata must use an inline edit affordance");
assert.match(detail, /aria-label="Ubah subjek Kuis"/u, "Kuis subject metadata must use an inline edit affordance");
assert.match(detail, /Belum ada deskripsi untuk Kuis ini\. Klik ikon pensil untuk\s+menambahkan\./u, "Kuis metadata must show the editable empty-description copy");
assert.match(detail, /<MentorBadge size="xs" tone="category">[\s\S]*?\{subject\s*\?\s*`\$\{subject\.code\} · \$\{subject\.name\}`\s*:\s*value\}[\s\S]*?<\/MentorBadge>/u, "Kuis metadata must use the Bank Soal subject chip sizing");
assert.doesNotMatch(detail, /<Eye|value="preview"><ListChecks|value="hasil"><ListChecks/u, "Soal and Hasil tabs must not show their former icons");
assert.match(detail, /Arsipkan Kuis[\s\S]*updateStandaloneQuizLifecycleAction/u, "Kuis detail must expose its archive lifecycle action");
assert.match(quizCatalogue, /function QuizRow/u, "subject catalogue must retain its quiz row component");
assert.match(quizCatalogue, /grid min-w-0 gap-4 p-5/u, "quiz rows must use Tryout-style card sizing");
assert.match(quizCatalogue, /<span className="mt-0\.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">/u, "quiz rows must use the Tryout-style icon treatment");
assert.match(quizCatalogue, /<ListChecks aria-hidden="true" className="size-5" \/>/u, "quiz rows must show the quiz icon");
assert.match(quizCatalogue, /<h2 className="truncate text-base font-semibold text-secondary-900">/u, "quiz row titles must use Tryout-style sizing");
assert.match(quizCatalogue, /<div className="mt-1 flex flex-wrap items-center gap-2">/u, "quiz row badges must sit beneath the title");
assert.match(quizCatalogue, /<ReferenceStatusBadge[\s\S]*?appearance="mentor"[\s\S]*?size="sm"[\s\S]*?status=\{quiz\.status\}[\s\S]*?\/>/u, "quiz row badges must use Tryout-style sizing");
assert.match(quizCatalogue, /aria-label=\{`Buka \$\{quiz\.title\}`\}/u, "quiz rows must provide a direct open action");
assert.match(quizCatalogue, /<ChevronRight\s+aria-hidden/u, "quiz rows must use the Tryout-style trailing chevron");
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
