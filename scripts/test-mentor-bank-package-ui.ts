import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

const bankCatalogue = read("modules/mentor/KaptenQuestionBankCataloguePageModules.tsx");
const packageBuilder = read("modules/mentor/KaptenPackageBuilderPageModule.tsx");
const packageVersionDetail = read("modules/mentor/KaptenPackageVersionDetailModule.tsx");

assert.match(bankCatalogue, /organizationOpen/u, "Bank Soal should expose a collapsible organization panel");
assert.match(bankCatalogue, /aria-controls="question-bank-organization-panel"/u);
assert.match(bankCatalogue, /aria-expanded=\{organizationOpen\}/u);
assert.match(bankCatalogue, /question-bank-organization-panel/u);
assert.match(bankCatalogue, /contentElement="div"/u, "Bank Soal should rely on the shell's single page landmark");
assert.doesNotMatch(bankCatalogue, /<main className="min-w-0 space-y-4">/u, "Bank Soal should not nest a second main landmark");
assert.match(bankCatalogue, /type BankViewMode = "grid" \| "list"/u, "Bank Soal should offer media-library grid/list views");
assert.match(bankCatalogue, /const \[viewMode, setViewMode\]/u);
assert.match(bankCatalogue, /aria-pressed=\{viewMode === "grid"\}/u);
assert.match(bankCatalogue, /aria-pressed=\{viewMode === "list"\}/u);
assert.match(bankCatalogue, /Folder di lokasi ini/u, "Folder navigation should be visible as media-library cards");
assert.match(bankCatalogue, /Belum ditempatkan/u, "Unfiled should use a user-facing Indonesian label");
assert.match(bankCatalogue, /type BankSortMode = "updated" \| "name" \| "questions"/u);
assert.match(read("app/mentor/quiz/question-bank/page.tsx"), /folderId: search\.trim\(\) \? undefined : folderId/u, "Committed search should span folders while preserving the folder when cleared");

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
assert.match(read("modules/mentor/KaptenPackageCataloguePageModule.tsx"), /nativeButton=\{false\} render=\{<Link href="\/mentor\/packages\/create" \/>\}/u);

console.log("Mentor Bank Soal and Paket Soal UI contracts passed.");
