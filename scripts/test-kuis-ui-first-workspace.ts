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
  readFile(`${root}/modules/mentor/KaptenQuizDashboardPageModule.tsx`, "utf8"),
]);
assert.match(detail, /breadcrumbParent=\{\{ href: returnHref, label: "Daftar kuis" \}\}/u, "detail returns to the filtered dashboard");
assert.match(detail, /returnTo: returnHref/u, "tab navigation preserves dashboard context");
assert.match(quizCatalogue, /useReactTable/u, "the quiz dashboard uses the headless grid");
const inventory = await readFile(`${root}/modules/mentor/components/quiz-question-inventory.tsx`, "utf8");
const actions = await readFile(`${root}/modules/mentor/quiz-actions.ts`, "utf8");

// Guard client-visible Kuis surfaces. Legacy source identifiers may remain in
// server-owned persistence compatibility, and future import actions stay
// server-only until an explicitly approved UI flow exists.
const noBankOrAssemblyClientDependency = /listQuestionBank|listReadyAssembly|question-bank|QuestionBank|attachStandaloneQuizAssembly|detachStandaloneQuizAssembly|assemblyVersionId/u;
for (const [label, source] of [["detail route", detailRoute], ["editor route", editorRoute], ["create route", createRoute], ["detail module", detail], ["builder compatibility module", builder]] as const) {
  assert.doesNotMatch(source, noBankOrAssemblyClientDependency, `${label} must not browse or attach Bank Soal/Ready sources`);
}

assert.match(detailRoute, /searchParams: Promise/u, "detail route must accept a deep-linked tab");
assert.match(detail, /breadcrumbLabel="Detail Kuis"/u, "detail breadcrumb must use the detail label");
assert.match(detail, /value="preview"/u, "detail must expose Preview Soal");
assert.match(detail, /value="preview"[\s\S]*?>\s*Soal\s*<\/FullWidthTabsTrigger>/u, "detail must label the question tab Soal");
assert.match(detail, /value="hasil"/u, "detail must expose Hasil");
assert.match(detail, /value="hasil"[\s\S]*?>\s*Hasil\s*<\/FullWidthTabsTrigger>/u, "Hasil tab must remain text-only");
assert.match(detail, /value="pengaturan"/u, "detail must expose Pengaturan");
assert.match(detail, /Edit soal/u, "detail must expose the dedicated editor action");
assert.match(editorRoute, /KaptenQuizEditorPageModule/u, "editor route must render the dedicated editor");
assert.match(inventory, /Daftar soal/u, "editor must expose a question inventory");
assert.match(editor, /QuestionBankPickerDialog/u, "editor must expose reusable Bank Soal selection");
assert.match(editor, /Tambah soal dari Bank Soal/u, "editor must expose the Bank Soal primary add action");
assert.match(inventory, /Bank Soal:/u, "inventory must label its source Bank Soal beneath the add action");
assert.match(inventory, /<Link href=\{sourceBankHref\} title=\{sourceBankTitle\}>\{sourceBankTitle/u, "inventory must link the selected Bank Soal title");
assert.match(editor, /getQuizQuestionBankContext\(state\.savedQuiz\)/u, "editor must supply canonical source-bank context to its inventory");
assert.doesNotMatch(editor, /Konten dikelola di Bank Soal/u, "the removed Bank Soal snapshot banner must not render in the Kuis editor");
assert.match(editor, /data-quiz-question-content-editor="disabled"/u, "bank-sourced question content must be read-only in the Kuis editor");
assert.match(editor, /data-quiz-question-empty/u, "editor must expose an empty state when no questions are selected");
assert.match(editor, /Belum ada soal di Kuis ini/u, "empty editor state must explain that no questions are selected");
assert.match(editor, /Tambah soal dari Bank Soal/u, "empty editor state must offer the Bank Soal picker");
assert.doesNotMatch(editor, /data-source-update-review|Tinjau perubahan|Terima ke draf|Perlu ditinjau/u, "published Bank Soal revisions must not render a manual review card");
assert.match(editor, /autoAppliedUpdateKeysRef/u, "published Bank Soal revisions must be applied automatically");
assert.match(editor, /reorderQuestion/u, "editor must reorder questions");
assert.match(inventory, /aria-label=\{`Pindah soal \$\{index \+ 1\}`\}/u, "inventory must name its accessible reorder handle");
assert.match(editor, /Hapus soal/u, "editor must delete questions");
assert.doesNotMatch(editor, /function QuestionForm|Edit soal|quiz-preview-toggle|MediaPickerDialog|Tampilan penulis/u, "Kuis must not expose a local question editor or preview toggle");
assert.match(editor, /shouldGuardNavigation=\{state\.hasUnsavedChanges\}/u, "editor must guard unsaved navigation");
assert.match(editor, /function hasQuizDraftContent\(/u, "quiz exit guarding must recognize an empty create scaffold");
assert.match(editor, /useState\(\s*mode === "create" && hasQuizDraftContent\(initialForm, pristineSubjectCode\)\s*,?\s*\)/u, "empty create quizzes must not start with an unsaved-change guard");
assert.match(editor, /setHasUnsavedChanges\(\s*mode === "create"\s*\? hasQuizDraftContent\(nextForm, pristineSubjectCode\)\s*: true\s*,?\s*\)/u, "create-mode exit guarding must clear when its fields are emptied");
assert.match(editor, /isSaving \? "Membuat…" : "Buat"/u, "create quiz action must use creation copy");
assert.match(editor, /aria-label="Buat"[\s\S]*?variant="default"/u, "create quiz action must use the primary button variant");
assert.match(editor, /<ChevronLeft\s*\/>\s*Kembali ke daftar/u, "create quiz back action must return to the Kuis catalogue");
assert.match(editor, /data-quiz-editor-shell="full-page"/u, "quiz editing must use a full-page shell");
assert.match(editor, /data-quiz-editor-header="true"/u, "full-page editor must expose the Bank Soal-style top header");
assert.doesNotMatch(editor, /const metadata =|>\{metadata\}/u, "full-page editor must not render the removed quiz metadata card");
assert.match(inventory, /function QuizMobileInventory\(/u, "quiz editor must use the Bank Soal-style mobile inventory");
assert.match(inventory, /id=\{`\$\{idPrefix\}-inventory-title`\}>Inventori soal/u, "quiz inventory must use a unique Bank Soal inventory heading");
assert.match(editor, /QuestionPreview/u, "quiz editor must show a read-only question preview");
assert.doesNotMatch(editor, /<div className="h-5 w-px bg-primary-100" \/>/u, "quiz header must not render a divider beside the title");
assert.match(editor, /aria-label="Simpan"[\s\S]*?variant="default"/u, "quiz save must remain a primary action");
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
assert.match(resultsRoute, /redirect\(`\/mentor\/quiz\/\$\{quizId\}\?tab=hasil/u, "legacy results route must redirect to Hasil");
assert.match(results, /function KaptenQuizResultsContent/u, "results must have embeddable content");
assert.doesNotMatch(results, /Bagian hasil Kuis|Peserta|Statistik|StatisticsPanel|Distribusi nilai|Peta skor|recharts/u, "Hasil must remain one results view without participant/statistics tabs or aggregate statistics");
assert.doesNotMatch(results, /Lihat pengiriman jawaban dan buka detail submisi tanpa meninggalkan detail Kuis/u, "Hasil must not include the removed helper copy");
assert.match(results, /aria-label="Filter hasil"/u, "one results view must retain lightweight attempt filters");
assert.match(detail, /KaptenQuizResultsContent/u, "detail must embed results without a nested shell");
assert.match(detail, /QuizQuestionCard/u, "question list must render authored question cards");
assert.match(detail, /questions\.map\(\(question, index\)/u, "question list must preserve authored question order");
assert.match(detail, /Pembahasan/u, "question cards must render authored explanations");
assert.match(detail, /<h2 className="text-xl font-bold tracking-tight text-secondary-900 sm:text-2xl">\s*Daftar Soal\s*<\/h2>/u, "Kuis preview must show the question-list heading");
assert.match(detail, /<Badge className="font-bold" size="(?:xs|sm)" tone="category">[\s\S]*?\{questions\.length\} Soal/u, "Kuis preview must show the live question count");
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
assert.match(detail, /<strong className="text-sm font-bold text-voyage-ink">[\s\S]*?\{subject\s*\?[\s\S]*?:\s*value\}[\s\S]*?<\/strong>/u, "Kuis metadata must show its subject as bold text");
assert.doesNotMatch(detail, /<Eye|value="preview"><ListChecks|value="hasil"><ListChecks/u, "Soal and Hasil tabs must not show their former icons");
assert.match(detail, /Arsipkan Kuis[\s\S]*updateStandaloneQuizLifecycleAction/u, "Kuis detail must expose its archive lifecycle action");
assert.match(submission, /\?tab=hasil/u, "submission back navigation must preserve Hasil context");

assert.match(repository, /const quizContentInclude = \{/u, "mentor detail reads must have a Kuis-owned content include");
assert.match(repository, /include: quizContentInclude/u, "mentor reads must use Kuis snapshots and lightweight source attribution");
assert.doesNotMatch(repository.match(/const quizContentInclude = \{[\s\S]*?satisfies Prisma\.StandaloneQuizInclude/u)?.[0] ?? "", /assemblyPackageVersion:/u, "canonical content reads must not hydrate legacy assembly content");
assert.match(repository, /assemblyPackageVersionId: null/u, "standalone save must clear legacy assembly linkage");
assert.match(repository, /assemblyMode: null/u, "standalone save must clear legacy assembly mode");
assert.match(repository, /sourceBankId: null/u, "standalone save must clear legacy Bank linkage");
assert.match(repository, /sourceQuestionId: null/u, "standalone save must materialize local question snapshots");
assert.match(repository, /sourceQuestionRevisionId: null/u, "standalone save must clear source revision linkage");

console.log("Kuis UI-first standalone workspace contract passed.");
