import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Source/SSR contract checks only; this script is not live browser proof.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sourcePaths = {
  previewPage: "app/admin/student-preview/[[...slug]]/page.tsx",
  previewUnavailable: "modules/student/components/admin-student-preview-unavailable.tsx",
  previewShell: "modules/student/components/admin-student-preview-shell.tsx",
  previewSurfaces: "modules/student/components/admin-student-preview-surfaces.tsx",
  previewData: "lib/admin/student-preview.ts",
  bannerEditor: "modules/admin/components/student-banner-editor.tsx",
  bannerActions: "modules/admin/student-banners-actions.ts",
  mediaScreen: "modules/media/components/MediaLibraryScreen.tsx",
  mediaItems: "modules/media/components/MediaLibraryItemsView.tsx",
  mediaPicker: "modules/media/components/MediaPickerDialog.tsx",
  mediaRecovery: "modules/media/components/media-library-recovery-state.tsx",
} as const;

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(sourcePaths).map(async ([key, relativePath]) => [
      key,
      await readFile(resolve(root, relativePath), "utf8"),
    ]),
  ),
) as Record<keyof typeof sourcePaths, string>;

const checks: string[] = [];

function check(condition: unknown, message: string) {
  assert.ok(condition, message);
  checks.push(message);
}

function includes(source: string, fragment: string, message: string) {
  check(source.includes(fragment), message);
}

function matches(source: string, pattern: RegExp, message: string) {
  check(pattern.test(source), message);
}

includes(sources.previewPage, "AdminStudentPreviewUnavailable", "preview route uses the typed unavailable state");
includes(sources.previewPage, 'variant="context"', "preview route distinguishes unavailable context");
includes(sources.previewPage, 'variant="resource"', "preview route distinguishes missing resources");
includes(sources.previewPage, 'variant="unsupported"', "preview route distinguishes unsupported surfaces");
includes(sources.previewPage, "editBanners", "preview route keeps the banner editor entry point");
matches(sources.previewPage, /aria-current=\{label === surface\.activeLabel \? "page" : undefined\}/u, "preview navigation exposes its active page");

for (const variant of ["context", "resource", "unsupported"]) {
  includes(sources.previewUnavailable, `"${variant}"`, `unavailable state defines ${variant} copy`);
}
includes(sources.previewUnavailable, "TypedRouteState", "unavailable state preserves the typed route-state boundary");
includes(sources.previewUnavailable, "Kembali ke Admin", "context recovery returns safely to Admin");
includes(sources.previewUnavailable, "buildAdminStudentPreviewRoute", "resource recovery keeps a safe preview return route");

includes(sources.previewShell, "bannerEditMode", "preview shell knows when the banner editor is active");
includes(sources.previewShell, "Satu-satunya write scope", "preview shell states the sole write scope");
includes(sources.previewShell, "Restart Tryout adalah aksi operasional terpisah", "preview shell separately discloses Tryout restart");
matches(sources.previewShell, /aria-current=\{bannerEditMode \? "page" : undefined\}/u, "preview shell exposes the active banner editor page");
matches(sources.previewShell, /Kembali ke admin/u, "preview shell keeps the safe Admin return");
matches(sources.previewSurfaces, /aria-current=\{label === activeLabel \? "page" : undefined\}/u, "preview surface navigation exposes its active page");

includes(sources.previewData, "ADMIN_STUDENT_PREVIEW_FIXTURE_ID", "preview data pins the managed fixture identity");
includes(sources.previewData, "ADMIN_STUDENT_PREVIEW_PURPOSE", "preview data pins the managed fixture purpose");
for (const code of ["fixture_missing", "fixture_ambiguous", "fixture_invalid"]) {
  includes(sources.previewData, `"${code}"`, `preview data handles ${code}`);
}
matches(sources.previewData, /previewPurpose !== ADMIN_STUDENT_PREVIEW_PURPOSE/u, "preview data rejects a fixture with the wrong purpose");

includes(sources.bannerEditor, "pendingIntent", "banner editor tracks the pending write intent");
includes(sources.bannerEditor, "useFormStatus", "banner editor tracks pending state without weakening submit semantics");
includes(sources.bannerEditor, "isInputDirty", "banner editor tracks unsaved current input");
includes(sources.bannerEditor, "blocked={!canPublish}", "banner editor gates publish until a saved draft is current");
includes(sources.bannerEditor, "Save draft before Publish", "banner editor labels the blocked publish action truthfully");
includes(sources.bannerEditor, "save-draft", "banner editor distinguishes saving a draft");
includes(sources.bannerEditor, "publish", "banner editor distinguishes publishing");
includes(sources.bannerEditor, "requestSubmit", "banner confirmation replays the intended submit");
includes(sources.bannerEditor, "student-banner-confirmation", "banner editor exposes the confirmation dialog contract");
includes(sources.bannerEditor, "Preview tetap read-only", "banner editor discloses preview read-only boundaries");
includes(sources.bannerEditor, "satu-satunya write scope", "banner editor discloses its sole write scope");
includes(sources.bannerEditor, "Restart Tryout adalah aksi operasional assignment/session terpisah", "banner editor separately discloses Tryout restart");
includes(sources.bannerEditor, "Draf banner siswa yang sudah disimpan", "publish confirmation describes the saved-draft precondition");
matches(sources.bannerEditor, /state\.status === "success" && state\.message[\s\S]{0,500}aria-live="polite"[\s\S]{0,300}role="status"/u, "banner success uses a polite status region");
matches(sources.bannerEditor, /state\.status === "error" && state\.message[\s\S]{0,500}aria-live="assertive"[\s\S]{0,300}role="alert"/u, "banner errors use an assertive alert region");
includes(sources.bannerEditor, "hasInlineState", "banner toast emission is suppressed when inline feedback is present");
includes(sources.bannerActions, "Draft saved. Students still see the published copy.", "banner action reports draft-versus-published status");
includes(sources.bannerActions, "requireAdminStudentPreviewContext", "banner writes require the preview context");
includes(sources.bannerActions, "saveStudentBannerDraft", "banner action uses the draft repository operation");
includes(sources.bannerActions, "publishStudentBannerContents", "banner action uses the publish repository operation");
includes(sources.bannerActions, "revalidatePreviewBannerPaths", "banner action revalidates preview surfaces after writes");
includes(sources.bannerActions, "revalidatePublishedBannerPaths", "banner action revalidates published surfaces after publish");

for (const kind of ["empty", "error", "filtered", "storage"]) {
  includes(sources.mediaRecovery, `"${kind}"`, `media recovery defines the ${kind} state`);
}
for (const copy of ["Belum ada", "Coba lagi", "Hapus pencarian/filter", "Upload"]) {
  includes(sources.mediaRecovery, copy, `media recovery includes visible ${copy.toLowerCase()} recovery copy`);
}
includes(sources.mediaRecovery, "errorMessage", "media recovery preserves the underlying error reason");
includes(sources.mediaItems, "MediaLibraryRecoveryState", "media items render the shared recovery state");
includes(sources.mediaItems, "error: string | null", "media items receive the load error");
includes(sources.mediaItems, 'setAssetFilter("all")', "filtered-empty recovery clears the asset filter");
includes(sources.mediaItems, "setAssetPage(1)", "filtered-empty recovery resets the page");
includes(sources.mediaItems, "clearSelection()", "filtered-empty recovery clears visible selection");
matches(sources.mediaItems, /!snapshot\.isStorageConfigured/u, "media items distinguish unavailable storage");
matches(sources.mediaItems, /assetFilter !== "all"/u, "media items distinguish filtered-empty results");
includes(sources.mediaScreen, "clearSelection={clearSelection}", "media screen wires selection reset into recovery");
includes(sources.mediaScreen, "setAssetFilter={setAssetFilter}", "media screen wires filter reset into recovery");
includes(sources.mediaScreen, "error={error}", "media screen passes load errors to the item state");
includes(sources.mediaScreen, "Data terakhir tetap ditampilkan", "minimal gallery distinguishes stale content from load error");
matches(sources.mediaScreen, /error && snapshot[\s\S]{0,700}Coba lagi/u, "minimal gallery exposes a retry for stale-snapshot errors");
matches(sources.mediaScreen, /R2 belum dikonfigurasi/u, "media screen keeps storage availability visible");
includes(sources.mediaRecovery, "untuk mulai menyusun library", "configured empty state copy does not claim storage is unavailable");
includes(sources.mediaRecovery, "setelah penyimpanan tersedia", "unconfigured empty state retains its storage recovery copy");
includes(sources.mediaPicker, "alasan dan langkah pemulihan", "media picker explains recovery for empty or unavailable storage");

for (const source of [sources.previewUnavailable, sources.mediaRecovery]) {
  check(!/\b(?:window|document|navigator)\b/u.test(source), "new unavailable/recovery surfaces remain SSR-safe");
}

console.log(`UIX-05 contract checks passed (${checks.length} checks).`);
