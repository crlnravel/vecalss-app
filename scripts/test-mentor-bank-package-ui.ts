import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const bankCatalogue = read("modules/mentor/KaptenQuestionBankCataloguePageModules.tsx");
const packageBuilder = read("modules/mentor/KaptenPackageBuilderPageModule.tsx");
const packageVersionDetail = read("modules/mentor/KaptenPackageVersionDetailModule.tsx");

assert.match(bankCatalogue, /\{row\.bank\.questionCount\} soal/u, "Bank rows should show the question count as their primary metadata");
assert.doesNotMatch(bankCatalogue, /\{bank\.questionCount\} soal · \{bank\.progress\}% siap(?: · \{bank\.difficultyMix\})?/u, "Bank rows should not append readiness metadata to the visible question count");

assert.doesNotMatch(bankCatalogue, /function FolderTree|<FolderTree|organizationOpen|Tampilkan lokasi|Sembunyikan lokasi|question-bank-organization-panel/u, "Bank Soal folder navigation should live in the main catalogue, not a collapsible sidebar");
assert.match(bankCatalogue, /Kelola kategori bersama/u, "Category management should remain reachable from the main catalogue toolbar");
assert.match(bankCatalogue, /Buat folder/u, "Folder creation should remain reachable from the main catalogue");
assert.match(bankCatalogue, /aria-label=\{`Kelola folder \$\{row\.folder\.name\}`\}/u, "Folder rows should keep folder management actions accessible");
assert.match(bankCatalogue, /Koleksi utama/u, "Root copy should describe the direct unfiled collection honestly");
assert.match(bankCatalogue, /contentElement="div"/u, "Bank Soal should rely on the shell's single page landmark");
assert.doesNotMatch(bankCatalogue, /<main className="min-w-0 space-y-4">/u, "Bank Soal should not nest a second main landmark");
assert.match(bankCatalogue, /MentorCatalogueTable/u, "Bank Soal should use the reusable table wrapper");
assert.match(bankCatalogue, /caption="Daftar folder dan bank soal"/u, "Bank Soal should expose one integrated table caption");
assert.match(bankCatalogue, /headingIcon=\{<LibraryBig/u, "Bank Soal should lead the table with a recognizable icon");
assert.match(bankCatalogue, /folderBreadcrumb/u, "Bank Soal should expose the active folder breadcrumb");
assert.match(bankCatalogue, /label: "Kategori"/u, "Bank Soal should label bank coverage as categories");
assert.match(bankCatalogue, /row\.kind === "folder" \? <span className="text-sm text-secondary-400">—<\/span>/u, "Folder rows should show a dash for categories");
assert.doesNotMatch(bankCatalogue, /label: "Isi"|label: "Lokasi"|id: "location"/u, "Bank Soal should keep location details in the breadcrumb instead of table columns");
assert.doesNotMatch(bankCatalogue, /id: "folder", label: "Folder"/u, "The active folder should be represented by the breadcrumb, not an active filter chip");
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
assert.match(bankCatalogue, /aria-label=\{`Pindahkan \$\{row\.bank\.title\}`\}/u, "move actions should name their bank");
assert.match(bankCatalogue, /aria-label=\{`Kelola kategori \$\{row\.bank\.title\}`\}/u, "category actions should name their bank");
assert.match(bankCatalogue, /navigateCatalogue\(\{ sort: value as BankSortMode, page: 1 \}\)/u, "sort changes should persist in the URL");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /folderId: search\.trim\(\) \? undefined : folderId/u, "Committed search should span folders while preserving the folder when cleared");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /const folderId = requestedFolder === undefined \? null/u, "The root catalogue should list only unfiled banks");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /initialSelectedFolder=\{requestedFolder === undefined \? "root" : folderId\}/u, "The UI should hydrate the root folder state separately from an explicit unfiled filter");
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /sort: requestedSort/u, "question bank sorting should be server-side");
assert.match(read("lib/question-bank/repository.ts"), /questions: \{ _count: "desc"/u, "question-count sorting should be collection-wide");

assert.match(packageBuilder, /<h1[^>]*>\{saved \? `Edit \$\{draft\.title\}` : "Buat Paket Soal"\}/u, "Paket Soal builder needs a page-level heading");
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

assert.match(read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx"), /lifecycleStatus === "archived" \? <Button/u, "Archived banks need an explicit restore action");
assert.match(read("modules/mentor/KaptenQuestionBankBuilderPageModule.tsx"), /updateLifecycle\(operation: "publish" \| "unpublish" \| "restore"\)/u);
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
