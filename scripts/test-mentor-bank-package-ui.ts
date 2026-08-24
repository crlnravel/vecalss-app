import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const bankCatalogue = read("modules/mentor/KaptenQuestionBankCataloguePageModules.tsx");
const bankCatalogueLoading = read("app/mentor/quiz/question-bank/loading.tsx");
const dataTable = read("components/ui/data-table.tsx");
const packageBuilder = read("modules/mentor/KaptenPackageBuilderPageModule.tsx");
const packageVersionDetail = read("modules/mentor/KaptenPackageVersionDetailModule.tsx");

assert.match(bankCatalogue, /\{row\.bank\.questionCount\} soal/u, "Bank rows should show the question count as their primary metadata");
assert.doesNotMatch(bankCatalogue, /\{bank\.questionCount\} soal · \{bank\.progress\}% siap(?: · \{bank\.difficultyMix\})?/u, "Bank rows should not append readiness metadata to the visible question count");

assert.doesNotMatch(bankCatalogue, /function FolderTree|<FolderTree|organizationOpen|Tampilkan lokasi|Sembunyikan lokasi|question-bank-organization-panel/u, "Bank Soal folder navigation should live in the main catalogue, not a collapsible sidebar");
assert.match(bankCatalogue, /Kelola kategori bersama/u, "Category management should remain reachable from the main catalogue toolbar");
assert.match(bankCatalogue, /Buat folder/u, "Folder creation should remain reachable from the main catalogue");
assert.match(bankCatalogue, /aria-label=\{`Kelola folder \$\{row\.folder\.name\}`\}/u, "Folder rows should keep folder management actions accessible");
assert.match(bankCatalogue, /name: "Bank soal"/u, "Root copy should use the Bank Soal product label");
assert.doesNotMatch(bankCatalogue, /Koleksi utama/u, "Root copy should not use the superseded collection label");
assert.match(bankCatalogue, /contentElement="div"/u, "Bank Soal should rely on the shell's single page landmark");
assert.doesNotMatch(bankCatalogue, /<main className="min-w-0 space-y-4">/u, "Bank Soal should not nest a second main landmark");
assert.match(bankCatalogue, /MentorCatalogueTable/u, "Bank Soal should use the reusable table wrapper");
assert.match(bankCatalogue, /caption="Daftar folder dan bank soal"/u, "Bank Soal should expose one integrated table caption");
assert.match(bankCatalogue, /isLoading=\{isCataloguePending\}/u, "Bank Soal should mark the table busy during catalogue fetches");
assert.match(bankCatalogue, /loadingLabel="Memuat bank soal…"/u, "Bank Soal loading state should use product language");
assert.match(dataTable, /<TableRow className="hover:bg-transparent">/u, "Empty tables should not tint their row on hover");
assert.match(bankCatalogue, /max-w-\[calc\(100vw-2rem\)\] whitespace-normal flex flex-col items-center[\s\S]*text-center/u, "Bank Soal empty state should center its indicator and copy");
assert.match(dataTable, /isLoading\?: boolean/u, "DataTable should accept an external loading state");
assert.match(dataTable, /isLoading \? \(/u, "DataTable should render loading content before its empty state");
assert.match(bankCatalogueLoading, /LoaderCircle[\s\S]*Memuat bank soal…/u, "Bank Soal route loading should show a spinner while the initial fetch is pending");
assert.match(bankCatalogueLoading, /role="status"/u, "Bank Soal loading should be announced to assistive technology");
assert.doesNotMatch(bankCatalogue, /headingIcon=\{<LibraryBig/u, "Bank Soal breadcrumb should not render a leading book tile");
assert.match(bankCatalogue, /folderBreadcrumb/u, "Bank Soal should expose the active folder breadcrumb");
assert.match(bankCatalogue, /label: "Kategori"/u, "Bank Soal should label bank coverage as categories");
assert.match(bankCatalogue, /row\.kind === "folder" \? <span className="text-sm text-secondary-400">—<\/span>/u, "Folder rows should show a dash for categories");
assert.doesNotMatch(bankCatalogue, /label: "Isi"|label: "Lokasi"|id: "location"/u, "Bank Soal should keep location details in the breadcrumb instead of table columns");
assert.doesNotMatch(bankCatalogue, /id: "folder", label: "Folder"/u, "The active folder should be represented by the breadcrumb, not an active filter chip");
assert.match(bankCatalogue, /import \{[\s\S]*Tag[\s\S]*\} from "@\/lib\/icons"/u, "Bank Soal should use the tag icon for category actions");
assert.match(bankCatalogue, /aria-label="Kelola kategori bersama"[\s\S]*size="icon-sm"[\s\S]*title="Kelola kategori bersama"/u, "Category toolbar action should be icon-only with an accessible label");
assert.match(bankCatalogue, /aria-label="Buat bank soal baru"[\s\S]*size="icon-sm"[\s\S]*title="Buat bank soal baru"/u, "Bank creation toolbar action should be icon-only with an accessible label");
assert.match(bankCatalogue, /aria-label=\{folderCreateLabel\}[\s\S]*size="icon-sm"[\s\S]*title=\{folderCreateLabel\}/u, "Folder creation toolbar action should be icon-only with an accessible label");
assert.match(bankCatalogue, /variant="brand"><Plus \/>Buat bank soal<\/Button>/u, "Empty Bank Soal state should make bank creation the primary action");
assert.match(bankCatalogue, /variant="brandOutline"><FolderPlus \/>\{folderCreateLabel\}<\/Button>/u, "Empty Bank Soal state should offer folder creation as the secondary action");
assert.doesNotMatch(bankCatalogue, /open=\{Boolean\(categoryDialog\)\}/u, "Category create and rename should not open a nested dialog");
assert.match(bankCatalogue, /categoryEditor\?\.kind === "create"[\s\S]*FieldInput[\s\S]*placeholder="Nama kategori"/u, "Creating a category should use an inline editable field");
assert.match(bankCatalogue, /categoryEditor\?\.kind === "rename" && categoryEditor\.categoryId === category\.id[\s\S]*FieldInput/u, "Renaming a category should use an inline editable field");
assert.match(bankCatalogue, /max-w-\[calc\(100vw-2rem\)\] whitespace-normal/u, "Empty Bank Soal copy should wrap within the viewport on narrow screens");
assert.match(bankCatalogue, /headerClassName: "min-w-\[14rem\]"/u, "Bank name column should keep a compact minimum width");
assert.match(bankCatalogue, /headerClassName: "min-w-\[12rem\]"/u, "Bank category column should keep a compact minimum width");
assert.match(bankCatalogue, /headerClassName: "min-w-\[7rem\]"/u, "Bank status column should keep a compact minimum width");
assert.match(bankCatalogue, /headerClassName: "min-w-\[5rem\] text-right"/u, "Bank actions column should keep a compact minimum width");
assert.match(bankCatalogue, /tableClassName="min-w-\[760px\]"/u, "Bank Soal should avoid an unnecessarily wide desktop table floor");
assert.match(bankCatalogue, /title=\{row\.bank\.title\}[\s\S]*truncate/u, "Bank names should truncate while preserving the full title");
assert.match(bankCatalogue, /overflow-hidden" title=\{\[\.\.\.row\.bank\.subjectCoverage/u, "Bank categories should truncate within their compact column");
assert.match(bankCatalogue, /max-h-14 min-w-0 max-w-full flex-wrap/u, "Bank categories should wrap within a two-row table cell");
assert.doesNotMatch(bankCatalogue, /<DropdownMenuItem onClick=\{\(\) => openFolderCreate\(row\.folder\.id\)\}>[\s\S]*Buat subfolder/u, "Folder row actions should not offer subfolder creation");
assert.doesNotMatch(bankCatalogue, /<DropdownMenuItem onClick=\{\(\) => openFolderManage\(row\.folder, "move"\)\}>/u, "Folder row actions should not offer folder moving");
assert.doesNotMatch(bankCatalogue, /setBankMoveId\(row\.bank\.id\)[\s\S]*Pindahkan bank/u, "Bank row actions should not offer bank moving");
assert.doesNotMatch(bankCatalogue, /viewMode|setViewMode|Tampilan grid|Tampilan daftar/u, "Bank Soal should not expose grid/list presentation toggles");
assert.match(bankCatalogue, /const catalogueRows: QuestionBankCatalogueRow\[\]/u, "Bank Soal should integrate folders and banks into one table data set");
assert.match(bankCatalogue, /kind: "folder"/u, "The integrated Bank Soal table should include folder rows");
assert.match(bankCatalogue, /kind: "bank"/u, "The integrated Bank Soal table should include bank rows");
assert.doesNotMatch(bankCatalogue, /Satu ruang bersama untuk menyimpan, mengelompokkan, dan menerbitkan bank soal yang dapat dipakai ulang\./u, "Bank Soal should not repeat the removed page introduction");
assert.doesNotMatch(bankCatalogue, /Folder di koleksi utama|Subfolder di lokasi ini|Bank yang belum ditempatkan tampil di sini; buka folder untuk melihat bank yang sudah diatur\.|Bank soal di lokasi ini|Buka bank untuk melanjutkan penyuntingan atau atur ulang lokasinya/u, "Bank Soal should not render the superseded folder and bank section copy");
assert.match(bankCatalogue, /Belum ditempatkan/u, "Unfiled should use a user-facing Indonesian label");
assert.match(bankCatalogue, /type BankSortMode = "updated" \| "name" \| "questions"/u);
assert.match(bankCatalogue, /initialSort = "updated"/u, "Bank Soal should hydrate sort from the URL");
assert.match(bankCatalogue, /search=\{\{ action: "\/mentor\/quiz\/question-bank"/u, "Bank Soal should use the table search control");
assert.match(bankCatalogue, /aria-label=\{`Aksi untuk \$\{row\.bank\.title\}`\}/u, "Bank rows should expose one ellipsis action menu");
assert.doesNotMatch(bankCatalogue, /aria-label=\{`(?:Edit|Pindahkan|Kelola kategori) \$\{row\.bank\.title\}`\}/u, "Bank rows should not expose separate action buttons");
assert.match(bankCatalogue, /navigateCatalogue\(\{ sort: value as BankSortMode, page: 1 \}\)/u, "sort changes should persist in the URL");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /folderId: search\.trim\(\) \? undefined : folderId/u, "Committed search should span folders while preserving the folder when cleared");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /const folderId = requestedFolder === undefined \? null/u, "The root catalogue should list only unfiled banks");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /initialSelectedFolder=\{requestedFolder === undefined \? "root" : folderId\}/u, "The UI should hydrate the root folder state separately from an explicit unfiled filter");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /sort: requestedSort/u, "question bank sorting should be server-side");
assert.match(read("lib/question-bank/repository.ts"), /questions: \{ _count: "desc"/u, "question-count sorting should be collection-wide");

assert.match(packageBuilder, /<h1[^>]*>\{saved \? `Edit pertanyaan & poin · \$\{draft\.title\}` : "Buat Paket Soal"\}/u, "Paket Soal builder needs a page-level heading");
assert.match(packageBuilder, /<p[^>]*>Source<\/p>/u, "The package editor should begin with a Source section");
assert.match(packageBuilder, /<p[^>]*>Questions<\/p>/u, "The package editor should expose a Questions section");
assert.match(packageBuilder, /Review &amp; ready/u, "The package editor should expose a Review & ready section");
assert.match(packageBuilder, /completionIntent, description: draft\.description/u, "Package saves should use the shared completion-intent command");
assert.match(packageBuilder, /expectedRevision: draft\.revision/u, "Package saves should send the current optimistic revision");
assert.match(packageBuilder, /released=1/u, "Ready completion should land on the package overview released state");
assert.match(packageBuilder, /saved=draft/u, "Draft completion should land on the package overview saved state");
assert.match(packageBuilder, /Siapkan untuk Tryout/u, "First release should use task-oriented copy");
assert.match(packageBuilder, /Terapkan perubahan/u, "Existing Ready packages should use update copy");
assert.match(packageBuilder, /Tryout yang sudah ada tetap menggunakan versi aktif sampai perubahan diterapkan/u, "Released package edits should explain active-version safety");
assert.match(packageBuilder, /\{draft\.items\.length\} soal yang sudah dipilih akan dihapus karena Subtest berubah/u, "Subtest changes should confirm the exact selected-question count");
assert.match(packageBuilder, /\{draft\.items\.length\} soal yang sudah dipilih akan dihapus\. Bank/u, "Bank changes should confirm the exact selected-question count");
assert.match(packageBuilder, /code === "package_conflict"/u, "Package conflicts should preserve local edits and expose a conflict state");
assert.match(packageBuilder, /Muat ulang data terbaru/u, "Package conflicts should expose an explicit reload path");
assert.doesNotMatch(packageBuilder, /readyReusableQuestionPackageVersionAction/u, "The editor should use one save command for Draft and Ready");
assert.match(packageBuilder, /useMemo\(\(\) => sourceEntries\.reduce/u, "source picker options should be derived from current inputs");
assert.match(packageBuilder, /\[bankCategoryFilter, bankSearch, changeBank, draft\.sourceBankId, sourceEntries\]\);/u, "source picker search must react to query/filter changes");
assert.match(packageBuilder, /id="package-source-bank-picker"/u, "Bank picker must be labelled by its field label");
assert.match(packageBuilder, /role="group"/u, "Picker popovers should not claim listbox semantics for mixed controls");
assert.doesNotMatch(packageBuilder, /aria-haspopup="listbox"/u, "Picker popovers contain inputs and filters, not only listbox options");
assert.match(packageBuilder, /nativeButton=\{false\} render=\{<Link href=\{saved \?/u, "Package builder back affordance should render as a link");
assert.match(packageBuilder, /Perubahan belum disimpan\. Tinggalkan halaman ini\?/u, "Paket Soal edits should warn before route changes");
assert.match(packageBuilder, /beforeunload/u, "Paket Soal edits should guard full-page unloads");

assert.match(packageVersionDetail, /TabsContent className="m-0" value="questions"/u);
assert.match(packageVersionDetail, /TabsContent className="m-0" value="tests"/u);
assert.match(packageVersionDetail, /Soal <span[^>]*>\{detail\.items\.length\}/u);
assert.match(packageVersionDetail, /Test Tryout <span[^>]*>\{detail\.tests\.length\}/u);

for (const route of [
  "app/mentor/packages/page.tsx",
  "app/mentor/packages/create/page.tsx",
  "app/mentor/packages/[packageId]/page.tsx",
  "app/mentor/packages/[packageId]/edit/page.tsx",
  "app/mentor/packages/[packageId]/versions/new/page.tsx",
  "app/mentor/packages/[packageId]/versions/[versionNo]/page.tsx",
]) {
  assert.match(read(route), /contentElement="div"/u, `${route} should use one shell-owned page landmark`);
  assert.match(read(route), /showSearch=\{false\}/u, `${route} should avoid a duplicate inert shell search`);
}
const packageVersionEditorRoute = read("app/mentor/packages/[packageId]/versions/new/page.tsx");
assert.match(packageVersionEditorRoute, /Edit pertanyaan & poin Paket Soal Kapten/u, "The question editor route should not be framed as a version-first destination");
assert.match(packageVersionEditorRoute, /breadcrumbLabel="Edit pertanyaan & poin"/u, "The question editor breadcrumb should describe the continuous workspace");

assert.match(read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx"), /lifecycleStatus === "archived" \? <Button/u, "Archived banks need an explicit restore action");
assert.match(read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx"), /updateLifecycle\(operation: "archive" \| "publish" \| "unpublish" \| "restore"\)/u);
assert.match(read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx"), /disabled=\{isQuestionContentLocked\} id="question-prompt"/u, "Archived question fields should be visibly disabled");
assert.match(read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx"), /id=\{`bank-correct-choice-\$\{choice\.id\}`\}/u, "Correct-answer radios need stable ids for their letter labels");
const packageCatalogue = read("modules/mentor/KaptenPackageCataloguePageModule.tsx");
assert.match(packageCatalogue, /MentorCatalogueTable/u, "Paket Soal should use the reusable table wrapper");
assert.match(packageCatalogue, /caption="Daftar Paket Soal"/u, "Paket Soal should expose a table caption");
assert.match(packageCatalogue, /headingIcon=\{<PackageCheck/u, "Paket Soal should lead the table with a recognizable icon");
assert.match(packageCatalogue, /aria-label="Breadcrumb"/u, "Paket Soal should expose a breadcrumb");
assert.doesNotMatch(packageCatalogue, /className="grid gap-3"|sm:grid-cols/u, "Paket Soal rows should not use a card grid");
assert.match(packageCatalogue, /nativeButton=\{false\} render=\{<Link href="\/mentor\/packages\/create" \/>\}/u);

console.log("Mentor Bank Soal and Paket Soal UI contracts passed.");
