import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateStudentBannerFields } from "@/lib/student/banner-validation";

const root = process.cwd();
const [repositorySource, actionSource, editorSource, syntaxFieldSource, routeSource, previewReadsSource, readerSource] = await Promise.all([
  readFile(resolve(root, "lib/student/banner-repository.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/student-banners-actions.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/components/student-banner-editor.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/components/syntax-highlighted-field.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/student-preview/[[...slug]]/page.tsx"), "utf8"),
  readFile(resolve(root, "lib/admin/student-preview-reads.ts"), "utf8"),
  readFile(resolve(root, "lib/student/banner-reader.ts"), "utf8"),
]);

const validFields = {
  "beranda.description": "Semangat mengejar {target} ya!",
  "beranda.title": "Halo, {firstName}.",
  "kuis.description": "Pilih latihan yang ingin kamu kerjakan.",
  "kuis.title": "Kuis",
  "materi.description": "Pilih materi yang ingin kamu pelajari.",
  "materi.title": "Materi",
  "tryout.description": "Ukur kesiapanmu lewat simulasi.",
  "tryout.title": "Tryout",
};

assert.deepEqual(validateStudentBannerFields(validFields), {});
assert.ok(
  validateStudentBannerFields({
    ...validFields,
    "materi.description": "Hai, {firstName}.",
  })["materi.description"],
  "non-Beranda template tokens must remain rejected",
);

assert.match(repositorySource, /async function getPublishedStudentBannerContents\b/u);
assert.match(repositorySource, /async function getAdminStudentPreviewBannerContents\b/u);
assert.match(repositorySource, /async function getAdminStudentPreviewBannerSnapshot\b/u);
assert.match(repositorySource, /unstable_noStore\(\)/u);
const publishedPreviewLoaderStart = repositorySource.indexOf(
  "async function getAdminStudentPreviewBannerContents",
);
const publishedPreviewLoaderEnd = repositorySource.indexOf(
  "async function getAdminStudentPreviewBannerSnapshot",
  publishedPreviewLoaderStart,
);
const publishedPreviewLoader = publishedPreviewLoaderStart >= 0 && publishedPreviewLoaderEnd > publishedPreviewLoaderStart
  ? repositorySource.slice(publishedPreviewLoaderStart, publishedPreviewLoaderEnd).replace(/\/\*[\s\S]*?\*\//gu, "")
  : "";
assert.ok(publishedPreviewLoader, "published preview loader must remain explicit");
assert.doesNotMatch(
  publishedPreviewLoader,
  /draftValue/u,
  "published preview rendering must not read draftValue",
);

assert.match(actionSource, /async function updateAdminStudentPreviewBannersAction\b/u);
assert.match(actionSource, /requireAdminStudentPreviewContext\(\)/u);
assert.match(actionSource, /assertLegacyBannerWritesRetired/u);
assert.doesNotMatch(actionSource, /saveStudentBannerDraft|publishStudentBannerContents|revalidatePath/u);

assert.match(editorSource, /<Input\b/u);
assert.doesNotMatch(editorSource, /SyntaxHighlightedInput/u);
assert.match(editorSource, /SyntaxHighlightedTextarea/u);
assert.match(editorSource, /setDismissedToastKey/u);
assert.match(syntaxFieldSource, /name=\{name\}/u);
assert.match(syntaxFieldSource, /type="hidden"/u);
assert.match(routeSource, /editBanners/u);
assert.match(routeSource, /buildBannerMakerDestinationRoute/u);
assert.doesNotMatch(routeSource, /StudentBannerEditor|updateAdminStudentPreviewBannersAction/u);
assert.match(previewReadsSource, /getAdminStudentPreviewBannerPresentation/u);
assert.match(previewReadsSource, /AdminStudentBannerRequest/u);
assert.match(readerSource, /mode: "draft"/u);
assert.match(readerSource, /draft-missing/u);
assert.match(previewReadsSource, /PreviewReadBoundary\.run/u);

console.log("admin student preview banner contract checks passed");
