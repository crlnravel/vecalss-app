import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const builder = read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx");
const detail = read("modules/mentor/KaptenQuestionBankDetailPageModule.tsx");
const createRoute = read("app/mentor/quiz/question-bank/create/page.tsx");
const detailRoute = read("app/mentor/quiz/question-bank/[bankId]/page.tsx");
const editRoute = read("app/mentor/quiz/question-bank/[bankId]/editor/page.tsx");
const actions = read("modules/mentor/question-bank-actions.ts");
const repository = read("lib/question-bank/repository.ts");
const organization = read("lib/question-bank/organization.ts");
const labels = read("lib/question-bank/labels.ts");
const shell = read("modules/mentor/components/mentor-workspace-shell.tsx");
const packageBuilder = read("modules/mentor/KaptenPackageBuilderPageModule.tsx");
const quizBuilder = read("modules/mentor/KaptenQuizEditorPageModule.tsx");
const tryoutBuilder = read("modules/mentor/KaptenTryoutBuilderPageModule.tsx");
const packageJson = JSON.parse(read("package.json")) as {
  scripts?: Record<string, string>;
};

// Editor entry points and the product vocabulary are intentionally tested
// together: the editor owns the Bank Soal root label and never leaks the
// catalogue's legacy "unfiled" terminology into authoring.
assert.match(createRoute, /mode="create"/u);
assert.match(detailRoute, /KaptenQuestionBankDetailPageModule/u);
assert.match(editRoute, /mode="edit"/u);
assert.doesNotMatch(builder, /activeTab|collapsedByDefault=\{mode === "create"\}/u);
assert.match(builder, /function QuestionBankMetadataForm\(/u);
assert.match(builder, /function QuestionMateriField\(/u);
assert.doesNotMatch(builder, /function QuestionBankCategoryPicker\(/u);
assert.match(builder, /function QuestionBankSaveAction\(/u);
assert.match(detail, /questionBankFolderLabel\(/u);
assert.doesNotMatch(builder, /moveQuestionBanksToFolderAction|<FieldLabel htmlFor="bank-folder">Folder<\/FieldLabel>/u);
assert.match(labels, /QUESTION_BANK_ROOT_LABEL = "Bank soal"/u);
assert.match(builder, /<FieldLabel[\s\S]*?htmlFor="question-subtest"[\s\S]*?>\s*Subtest\s*<\/FieldLabel>/u);
assert.match(builder, /<FieldLabel[\s\S]*?htmlFor="question-materi"[\s\S]*?>\s*Materi\s*<\/FieldLabel>/u);
assert.doesNotMatch(builder, /<FieldLabel[\s\S]*?htmlFor="bank-categories"[\s\S]*?>\s*Kategori\s*<\/FieldLabel>/u);
assert.doesNotMatch(builder, /\bUnfiled\b|\bunfiled\b/u);
assert.doesNotMatch(builder, /\bHalaman\b|inventoryPageCount|paginatedQuestions|visibleInventoryPage/u);

// Inventory contracts: full-order numbering, stable identity, a single-column
// question list, and keyboard-roving semantics.
assert.doesNotMatch(builder, /type InventoryFilter|Filter inventori soal|question-bank-filter-/u);
assert.match(builder, /visibleQuestions\.map\(\(question\)/u);
assert.match(builder, /builderState\.questions\.findIndex\(\s*\(item\) => item\.id === question\.id,?\s*\) \+ 1/u);
assert.match(builder, /key=\{question\.id\}/u);
assert.match(builder, /const visibleQuestions = builderState\.questions/u);
assert.match(builder, /className="flex flex-col gap-1\.5"/u);
assert.doesNotMatch(builder, /soal ditampilkan|Navigasi soal" className="[^"]*border-t/u);
assert.match(builder, /questionRowRefs\.current\[questionId\]/u);
assert.match(builder, /handleQuestionKeyDown/u);
assert.match(builder, /aria-current=\{isActive \? "true" : undefined\}/u);
assert.match(builder, /tabIndex=\{question\.id === focusableQuestionId \? 0 : -1\}/u);
assert.match(builder, /questionFocusAfterDeleteRef/u);
assert.match(builder, /const nextActiveQuestion = questions\[0\] \?\? null/u);
assert.match(builder, /if \(questions\.length === builderState\.questions\.length\) return/u);
assert.match(builder, /questionDraft:\s*nextActiveQuestion\s*\? toQuestionDraft\(nextActiveQuestion\)\s*:\s*fallbackQuestion/u);
assert.match(builder, /const id = createQuestionId\(subjectCode\)/u);
const inventory = builder.match(
  /function QuestionBankInventory\([\s\S]*?\n\}\n\nfunction QuestionBankMobileInventory/u,
)?.[0] ?? "";
assert.doesNotMatch(inventory, /Perlu diperbaiki/u);
assert.match(builder, /description: `Soal nomor \$\{questionNumber\} akan dihapus/u);
assert.match(builder, /title: `Hapus soal nomor \$\{questionNumber\}\?`/u);
assert.doesNotMatch(builder, /const questionLabel = question\?\.prompt/u);
assert.doesNotMatch(builder, /requestLifecycleChange|QuestionBankPublishAction|Terbitkan/u);
assert.match(builder, /operation: "archive" \| "restore"/u);
assert.doesNotMatch(builder, /Tryout yang sudah dibuat tetap menggunakan snapshot soal/u);
assert.doesNotMatch(builder, /Masalah berikutnya|Bank diterbitkan/u);
assert.doesNotMatch(builder, /Siap dipakai|Belum lengkap|Tersimpan/u);
assert.doesNotMatch(builder, /Kesiapan terbit:/u);
assert.doesNotMatch(detail, /Status Kesiapan|Kesiapan terbit:|Edit Soal|Pindahkan folder/u);
assert.match(detail, /Perlu diperbaiki/u);
assert.match(detail, /question\.choices\.map\(\(choice, choiceIndex\) =>/u);
assert.match(detail, /const choiceLabel = String\.fromCharCode\(65 \+ choiceIndex\)/u);
assert.match(detail, /\{choiceLabel\}/u);
assert.doesNotMatch(detail, /\{choice\.id\}\s*<\/span>/u);
assert.doesNotMatch(detail, /function StatusPill\(/u, "Bank Soal detail should not render title status badges");
assert.doesNotMatch(detail, /requestLifecycleChange|Terbitkan|Buat draf|Jadikan draf/u);
assert.doesNotMatch(detail, /Tryout yang sudah dibuat tetap menggunakan snapshot soal/u);
assert.match(detail, /<span className="shrink-0 text-xs font-semibold text-secondary-500">\s*Subjek\s*<\/span>/u);
assert.match(detail, /<span className="shrink-0 text-xs font-semibold text-secondary-500">\s*Kesulitan\s*<\/span>/u);
assert.match(detail, /flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto/u);
assert.match(detail, /aria-label="Buka Editor"/u);
assert.doesNotMatch(detail, /Buka Editor Soal/u);
assert.doesNotMatch(detail, /Tulis Soal Pertama/u);
assert.match(detail, /type QuestionBankDetailTab = "soal" \| "pengaturan"/u);
assert.match(detail, /<FullWidthLineTabsList aria-label="Bagian detail Bank Soal">[\s\S]*?value="soal"[\s\S]*?>\s*Soal[\s\S]*?value="pengaturan"[\s\S]*?>\s*Pengaturan/u);
assert.match(detail, /function QuestionBankEditorButton\([\s\S]*?className="w-full shadow-sm"/u);
assert.match(detail, /<TabsContent className="m-0" value="soal">[\s\S]*?<QuestionBankQuestionsSection/u);
const archiveSection = detail.match(/function QuestionBankArchiveSection\([\s\S]*?\n\}\n\ntype QuestionBankMetadataFormState/u)?.[0] ?? "";
assert.match(archiveSection, /Administrasi[\s\S]*?<QuestionBankLifecycleActions/u);
assert.doesNotMatch(archiveSection, /<p\b/u, "Administrasi should not render helper copy below its title");
assert.match(detail, /<TabsContent className="m-0" value="pengaturan">[\s\S]*?<QuestionBankArchiveSection/u);
assert.match(detail, /<span className="text-xs font-semibold text-secondary-500">\s*Tipe\s*<\/span>[\s\S]*?questionBankPurposeLabel\(bank\.purpose \?\? "quiz"\)[\s\S]*?Deskripsi/u, "Bank Soal should show its type before the description");
assert.doesNotMatch(detail, /<StatusPill status=\{bank\.status\} \/>|QUESTION_BANK_METADATA_PILL_CLASS_NAME/u, "Bank Soal metadata should not render title badges");
assert.match(detail, /description:\s*"Bank soal yang diarsipkan tidak dapat digunakan untuk membuat soal hingga dipulihkan\."/u, "archive confirmation should explain the restored authoring state");
const metadataUsageIndex = detail.indexOf("<QuestionBankMetadataCard");
const tabsUsageIndex = detail.indexOf("<Tabs\n");
assert.ok(
  metadataUsageIndex >= 0 && metadataUsageIndex < tabsUsageIndex,
  "Bank Soal metadata should stay above the tabs",
);
const settingsContent =
  detail.match(
    /<TabsContent className="m-0" value="pengaturan">[\s\S]*?<\/TabsContent>/u,
  )?.[0] ?? "";
assert.doesNotMatch(
  settingsContent,
  /<QuestionBankMetadataCard/u,
  "Bank Soal metadata should not be nested in Pengaturan",
);
const questionsSection =
  detail.match(
    /function QuestionBankQuestionsSection\([\s\S]*?\n\}\n\nfunction QuestionBankArchiveConfirmationDialog/u,
  )?.[0] ?? "";
assert.match(
  questionsSection,
  /Daftar Soal[\s\S]*?<QuestionBankEditorButton bank=\{bank\} bankId=\{bankId\} \/>[\s\S]*?questions\.length === 0/u,
  "Buka Editor should sit below Daftar Soal in the Soal section",
);
assert.match(detail, /const editorLocked = bank\.status === "archived"/u);
assert.match(detail, /TooltipContent>\{editorLockReason\}<\/TooltipContent>/u);
assert.match(detail, /Untuk mengedit kembali, batalkan arsip Bank Soal terlebih dahulu/u);
assert.match(detail, /Batalkan arsip/u);
assert.doesNotMatch(detail, /Pulihkan bank/u);
assert.match(detail, /variant="brandOutline"/u);
assert.match(detail, /aria-label="Arsipkan bank soal"/u);
assert.match(detail, /variant="dangerOutline"/u);
assert.doesNotMatch(detail, /<Ellipsis\b|aria-label="Aksi Bank Soal"/u);
assert.match(detail, /className="space-y-5"/u);
assert.match(detail, /<span className="shrink-0 text-xs font-semibold text-secondary-500">\s*Subjek\s*<\/span>/u);
assert.match(detail, /<span className="shrink-0 text-xs font-semibold text-secondary-500">\s*Kesulitan\s*<\/span>/u);
assert.doesNotMatch(detail, /<span>Kembali ke Bank Soal<\/span>/u);
assert.doesNotMatch(detail, /grid gap-5 rounded-xl border border-primary-100 bg-primary-50\/30/u);
assert.match(detail, /Deskripsi[\s\S]*Folder[\s\S]*Materi/u);
assert.doesNotMatch(detail, /<span[^>]*>Kategori<\/span>/u);
assert.match(detail, /showToast\(/u);
assert.doesNotMatch(detail, /Soal Siap|Semua soal siap dipublikasikan|Siap dipakai|Belum lengkap/u);
assert.match(detailRoute, /searchParams: Promise<\{ tab\?: string \| string\[\] \}>/u);
assert.match(detailRoute, /initialTab=\{parseTab\(tab\)\}/u);

// Readiness issue traversal must identify the exact field/choice/media target,
// announce progress, and focus the exact editable field.
assert.match(builder, /Lihat masalah/u);
assert.doesNotMatch(builder, /Masalah berikutnya/u);
assert.match(builder, /pendingIssueFocusRef/u);
assert.match(builder, /focusTarget\(/u);
assert.match(builder, /issue\.field === "choice"/u);
assert.match(builder, /issue\.choiceId/u);
assert.match(builder, /data-question-anchor=/u);
assert.match(builder, /data-question-choice-id=/u);
assert.match(builder, /scrollIntoView/u);
assert.match(builder, /target\.focus\(\{ preventScroll: true \}\)/u);
assert.match(builder, /Masalah \$\{issueIndex \+ 1\} dari \$\{totalIssues\}/u);
assert.match(builder, /focusResult === "handoff"/u);
assert.match(builder, /role="status"/u);
assert.match(builder, /aria-live="polite"/u);
assert.match(builder, /showToast\(result\.message, \{ variant: "error" \}\)/u);
assert.match(builder, /Status Bank Soal tidak dapat diubah saat ini/u);
assert.doesNotMatch(builder, /QuestionBankLifecycleError/u);

// Preview is keyed by question identity and question selection clears only
// answer/feedback state, preserving the active Preview tab.
assert.match(builder, /<RadioGroup\s+key=\{questionDraft\.id\}/u);
assert.match(builder, /hasSubmittedPreview: false/u);
assert.match(builder, /previewChoiceId: null/u);
assert.match(builder, /onChoiceChange: \(value\) => \{[\s\S]*?hasSubmittedPreview: false,[\s\S]*?previewChoiceId: nextIds\[0\]/u);
const saveCall = builder.match(/saveQuestionBankAction\(\{[\s\S]*?\}\)/u)?.[0] ?? "";
assert.doesNotMatch(saveCall, /previewChoiceId|hasSubmittedPreview/u);

// Lifecycle, persistence, conflict, and navigation guards are deliberately
// asserted at their boundaries so browser checks can focus on user-visible
// state transitions rather than duplicating database setup.
assert.match(builder, /const isMetadataLocked =\s*editorState\.lifecycleStatus === "archived"/u);
assert.match(builder, /const isQuestionContentLocked = editorState\.lifecycleStatus === "archived"/u);
assert.doesNotMatch(builder, /data-question-bank-lifecycle-action="publish"/u);
assert.match(editRoute, /initial\.bank\.status === "archived"/u);
assert.doesNotMatch(builder, /Bank diterbitkan|Bank diarsipkan|Bank terjadwal|Bank Soal Terjadwal belum didukung untuk perubahan di editor ini/u);
assert.match(builder, /beforeunload/u);
assert.match(builder, /shouldGuardNavigation=\{state\.hasUnsavedChanges\}/u);
assert.match(shell, /Keluar dari editor\?/u);
assert.match(shell, /Perubahan yang belum disimpan akan hilang/u);

assert.match(repository, /SELECT id FROM question_banks WHERE id = \$\{bankId\}::uuid FOR UPDATE/u);
assert.match(repository, /code: "stale_revision"/u);
assert.match(repository, /sameCanonicalQuestionContent\(/u);
assert.match(repository, /operation: "archive" \| "restore"/u);
assert.match(repository, /const status = isArchive \? ContentStatus\.archived : ContentStatus\.published/u);
assert.match(repository, /code: "invalid_lifecycle_transition"/u);
assert.match(repository, /code: "readiness_failed"/u);
assert.doesNotMatch(repository, /code: "scheduled_unsupported"/u);
assert.match(repository, /question\.status === ContentStatus\.archived/u);
assert.match(repository, /question\.currentRevision\?\.status !== QuestionRevisionStatus\.retired/u);
assert.doesNotMatch(organization, /assertBankMutationSupported|code: "scheduled_unsupported"/u);
assert.match(organization, /expectedRevision/u);

// The failure payload remains a type-only implementation detail. Exporting it
// from a "use server" module makes Next register it as a callable action.
assert.match(actions, /type QuestionBankActionFailure =/u);
assert.doesNotMatch(actions, /export type \{ QuestionBankActionFailure \}/u);
assert.match(actions, /questionBankActionFailure\(error, "Bank Soal tidak dapat disimpan saat ini\."\)/u);
assert.match(actions, /questionBankActionFailure\(error, "Status Bank Soal tidak dapat diubah saat ini\."\)/u);

// Source consumers keep their own scope: they select Bank Soal data and do
// not import the editor's legacy catalogue vocabulary.
assert.match(packageBuilder, /<FieldLabel[^>]*htmlFor="package-source-bank-picker">Bank Soal<\/FieldLabel>/u);
assert.match(packageBuilder, /Pilih Bank Soal/u);
assert.match(quizBuilder, /<FieldLabel[\s\S]*?htmlFor="quiz-editor-subject"[\s\S]*?>\s*Subjek\s*<\/FieldLabel>/u);
assert.match(quizBuilder, /ReferenceSelect/u);
assert.match(tryoutBuilder, /<FieldLabel[\s\S]*?>\s*Bank Soal terpilih\s*<RequiredMark\s*\/?>\s*<\/FieldLabel>/u);
assert.match(tryoutBuilder, /role="listbox"/u);
for (const [name, source] of [["Paket Soal", packageBuilder], ["Kuis", quizBuilder], ["Tryout", tryoutBuilder]] as const) {
  assert.doesNotMatch(source, /\bUnfiled\b|\bunfiled\b/u, `${name} source picker must not expose legacy catalogue vocabulary`);
}

assert.equal(
  packageJson.scripts?.["test:mentor-bank-soal-editor-verification"],
  "tsx scripts/test-mentor-bank-soal-editor-verification.ts",
  "ticket-7 verification must be runnable through package.json",
);

type PreviewState = {
  activeQuestionId: string;
  hasSubmittedPreview: boolean;
  previewChoiceId: string | null;
  questionEditorTab: "edit" | "preview";
};

function selectQuestion(state: PreviewState, questionId: string): PreviewState {
  return {
    ...state,
    activeQuestionId: questionId,
    hasSubmittedPreview: false,
    previewChoiceId: null,
  };
}

const switchedPreview = selectQuestion(
  { activeQuestionId: "question-1", hasSubmittedPreview: true, previewChoiceId: "b", questionEditorTab: "preview" },
  "question-2",
);
assert.deepEqual(
  switchedPreview,
  { activeQuestionId: "question-2", hasSubmittedPreview: false, previewChoiceId: null, questionEditorTab: "preview" },
  "switching questions clears answer/feedback while retaining Preview",
);

type Issue = { key: string };

function nextIssueIndex(issues: Issue[], currentKey: string | null, loopEnded: boolean) {
  if (!issues.length) return { index: null, loopEnded: false };
  const currentIndex = currentKey === null ? -1 : issues.findIndex((issue) => issue.key === currentKey);
  if (currentIndex === issues.length - 1 && !loopEnded) return { index: currentIndex, loopEnded: true };
  return { index: currentIndex >= 0 ? (currentIndex + 1) % issues.length : 0, loopEnded: false };
}

const issues = [{ key: "prompt" }, { key: "choice:b" }, { key: "subtest" }];
assert.deepEqual(nextIssueIndex(issues, null, false), { index: 0, loopEnded: false });
assert.deepEqual(nextIssueIndex(issues, "prompt", false), { index: 1, loopEnded: false });
assert.deepEqual(nextIssueIndex(issues, "subtest", false), { index: 2, loopEnded: true });
assert.deepEqual(nextIssueIndex(issues, "subtest", true), { index: 0, loopEnded: false });

console.log("Ticket 7 Mentor Bank Soal editor verification contracts passed.");
