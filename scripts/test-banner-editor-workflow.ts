import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BANNER_MAX_TEXT_LENGTH,
  createDefaultBannerDesign,
  type BannerBootstrap,
  type BannerMakerDestinationFormState,
} from "../lib/admin/banner-maker";
import {
  actionResultIsAuthoritative,
  canPublishBannerMakerDestination,
  canSaveBannerMakerDestination,
  createStarterDesignIfValid,
  getBootstrapDesign,
  isBannerActionResultForMount,
  validateBannerStarterText,
} from "../lib/admin/banner-maker-editor-workflow";
import {
  buildBannerMakerDestinationRoute,
  parseBannerDestinationQuery,
} from "../lib/banner/destinations";

const root = resolve(import.meta.dirname, "..");
const design = createDefaultBannerDesign();
const mount = {
  destination: "beranda" as const,
  requestId: "11111111-1111-4111-8111-111111111111",
};

// Canonical destination parsing is stable for omitted queries and rejects
// unknown or duplicate query values before a snapshot is read.
assert.equal(parseBannerDestinationQuery(undefined), "beranda");
assert.equal(parseBannerDestinationQuery("materi"), "materi");
assert.throws(() => parseBannerDestinationQuery("unknown"), /tujuan banner tidak dikenali/iu);
assert.throws(() => parseBannerDestinationQuery(["materi", "kuis"]), /tujuan banner tidak dikenali/iu);
assert.equal(buildBannerMakerDestinationRoute(), "/admin/student-banners?destination=beranda");
assert.equal(buildBannerMakerDestinationRoute("tryout"), "/admin/student-banners?destination=tryout");

// Over-limit recovery remains lossless until the editor operator corrects it.
const overLimitTitle = `Judul ${"x".repeat(BANNER_MAX_TEXT_LENGTH)}`;
const overLimitDescription = `Deskripsi ${"y".repeat(BANNER_MAX_TEXT_LENGTH)}`;
const invalidStarter = validateBannerStarterText(overLimitTitle, overLimitDescription);
assert.equal(invalidStarter.valid, false);
assert.equal(invalidStarter.issues.length, 2);
assert.equal(invalidStarter.issues[0]?.actualLength, overLimitTitle.length);
assert.equal(invalidStarter.issues[1]?.actualLength, overLimitDescription.length);
assert.equal(overLimitTitle.length, BANNER_MAX_TEXT_LENGTH + 6);
assert.equal(overLimitDescription.length, BANNER_MAX_TEXT_LENGTH + 10);
assert.equal(createStarterDesignIfValid({ destination: "beranda", title: overLimitTitle, description: overLimitDescription }), null);

const correctedTitle = "Judul yang sudah diperbaiki";
const correctedDescription = "Deskripsi yang sudah diperbaiki";
const validStarter = validateBannerStarterText(correctedTitle, correctedDescription);
assert.equal(validStarter.valid, true);
const correctedDesign = createStarterDesignIfValid({
  description: correctedDescription,
  destination: "beranda",
  title: correctedTitle,
});
assert.ok(correctedDesign);
assert.equal(correctedDesign.layers.find((layer) => layer.type === "text")?.text, correctedTitle);
assert.equal(correctedDesign.layers.filter((layer) => layer.type === "text")[1]?.text, correctedDescription);

const starterBootstrap: BannerBootstrap = {
  description: correctedDescription,
  destination: "beranda",
  issues: [],
  kind: "starter-needs-edit",
  source: { configKey: "student.banner-maker.v1", digest: "digest", kind: "legacy-text", rowId: "legacy-1", sourceColumn: "configValue" },
  title: correctedTitle,
};
assert.equal(getBootstrapDesign(starterBootstrap), null);
assert.deepEqual(getBootstrapDesign({
  design,
  kind: "valid-design",
  requiresSave: false,
  source: null,
}), design);

const successState: BannerMakerDestinationFormState = {
  currentRevision: "22222222-2222-4222-8222-222222222222",
  destination: "beranda",
  design,
  hasUnpublishedChanges: true,
  message: "Draf tersimpan.",
  requestId: mount.requestId,
  status: "success",
};
const errorState: BannerMakerDestinationFormState = {
  destination: mount.destination,
  message: "Gagal.",
  requestId: mount.requestId,
  status: "error",
};
assert.equal(isBannerActionResultForMount(successState, mount), true);
assert.equal(isBannerActionResultForMount({ ...successState, destination: "materi" }, mount), false);
assert.equal(isBannerActionResultForMount({ ...successState, requestId: "33333333-3333-4333-8333-333333333333" }, mount), false);
assert.equal(actionResultIsAuthoritative(successState, mount, 7, 7), true);
assert.equal(actionResultIsAuthoritative(successState, mount, 7, 8), false, "a subsequent local edit blocks save-and-switch");
assert.equal(actionResultIsAuthoritative(errorState, mount, 7, 7), false);

assert.equal(canSaveBannerMakerDestination({ design, isPending: false, starterInvalid: false }), true);
assert.equal(canSaveBannerMakerDestination({ design, isPending: true, starterInvalid: false }), false);
assert.equal(canSaveBannerMakerDestination({ design: null, isPending: false, starterInvalid: false }), false);
assert.equal(canSaveBannerMakerDestination({ design, isPending: false, starterInvalid: true }), false);
assert.equal(canPublishBannerMakerDestination({
  design,
  hasSavedDraft: true,
  isDirty: false,
  isPending: false,
  starterInvalid: false,
}), true);
for (const blocked of [
  { hasSavedDraft: false, isDirty: false, isPending: false, starterInvalid: false },
  { hasSavedDraft: true, isDirty: true, isPending: false, starterInvalid: false },
  { hasSavedDraft: true, isDirty: false, isPending: true, starterInvalid: false },
  { hasSavedDraft: true, isDirty: false, isPending: false, starterInvalid: true },
]) {
  assert.equal(canPublishBannerMakerDestination({ design, ...blocked }), false);
}

// The component is exercised through the same exported controller seams used by
// the UI. Keep these source contracts narrow so BP05 can activate the page later
// without making this staged work publicly reachable now.
const destinationEditorSource = await readFile(resolve(root, "modules/admin/components/banner-maker-destination-editor.tsx"), "utf8");
const pageSource = await readFile(resolve(root, "app/admin/student-banners/page.tsx"), "utf8");
const rendererEditorSource = await readFile(resolve(root, "modules/admin/components/banner-maker-editor.tsx"), "utf8");
assert.match(destinationEditorSource, /useActionState\(/u);
assert.match(destinationEditorSource, /submittedEditRevisionRef/u);
assert.match(destinationEditorSource, /pendingSwitchRef/u);
assert.match(destinationEditorSource, /pickerGenerationRef/u);
assert.match(destinationEditorSource, /key=\{`\$\{destination\}:\$\{controller\.pickerGeneration\}`\}/u);
assert.match(destinationEditorSource, /Simpan dan beralih/u);
assert.match(destinationEditorSource, /Buang dan beralih/u);
assert.match(destinationEditorSource, /Terbitkan banner \{getBannerDestinationLabel\(destination\)\}/u);
assert.match(destinationEditorSource, /name="source"/u);
assert.match(destinationEditorSource, /name="design"/u);
assert.match(pageSource, /BANNER_V2_EDITOR_PUBLICLY_ENABLED = false/u);
assert.match(pageSource, /parseBannerDestinationQuery/u);
assert.match(rendererEditorSource, /calculateBannerGeometry/u);
assert.match(rendererEditorSource, /getBannerTextPaint/u);
assert.match(rendererEditorSource, /getBannerImagePaint\("background"\)/u);
assert.match(rendererEditorSource, /getBannerImagePaint\("layer"\)/u);

console.log("banner editor workflow contract checks passed");
