import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createElement, act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  BANNER_MAX_TEXT_LENGTH,
  createDefaultBannerDesign,
  type BannerBootstrap,
  type BannerDesign,
  type BannerMakerDestinationFormState,
  type BannerMakerDestinationSnapshot,
} from "../lib/admin/banner-maker";
import {
  actionResultIsAuthoritative,
  canPublishBannerMakerDestination,
  canSaveBannerMakerDestination,
  createBannerMakerDestinationFormData,
  createStarterDesignIfValid,
  getBootstrapDesign,
  handleBannerMakerDestinationSubmit,
  isBannerActionResultForMount,
  validateBannerStarterText,
} from "../lib/admin/banner-maker-editor-workflow";
import {
  buildBannerMakerDestinationRoute,
  parseBannerDestinationQuery,
} from "../lib/banner/destinations";
import { BannerDestinationQueryError } from "../modules/admin/BannerDestinationQueryError";
import { BannerCanvas } from "../modules/admin/components/banner-maker-canvas";
import { useDestinationEditorController } from "../modules/admin/components/banner-maker-destination-controller";
import { findElements, withReactDomTest } from "./react-dom-test-host";

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
const destinationControllerSource = await readFile(resolve(root, "modules/admin/components/banner-maker-destination-controller.tsx"), "utf8");
const pageSource = await readFile(resolve(root, "app/admin/student-banners/page.tsx"), "utf8");
const rendererEditorSource = await readFile(resolve(root, "modules/admin/components/banner-maker-editor.tsx"), "utf8");
const rendererCanvasSource = await readFile(resolve(root, "modules/admin/components/banner-maker-canvas.tsx"), "utf8");
assert.match(destinationControllerSource, /useActionState\(/u);
assert.match(destinationControllerSource, /submittedEditRevisionRef/u);
assert.match(destinationControllerSource, /pendingSwitchRef/u);
assert.match(destinationControllerSource, /pickerGenerationRef/u);
assert.match(destinationControllerSource, /pendingSubmissionRef/u);
assert.match(destinationEditorSource, /key=\{`\$\{destination\}:\$\{controller\.pickerGeneration\}`\}/u);
assert.match(destinationEditorSource, /onSubmit=\{handleSubmit\}/u);
assert.match(destinationControllerSource, /setHasSavedDraft\(nextState\.published !== true\)/u);
assert.match(destinationEditorSource, /Simpan dan beralih/u);
assert.match(destinationEditorSource, /Buang dan beralih/u);
assert.match(destinationEditorSource, /Terbitkan banner \{getBannerDestinationLabel\(destination\)\}/u);
assert.match(destinationEditorSource, /name="source"/u);
assert.match(destinationEditorSource, /name="design"/u);
assert.doesNotMatch(destinationControllerSource, /student-account-menu|media-library|banner-maker-editor["']/u);
assert.match(pageSource, /isBannerV2EditorEnabled\(\)/u);
assert.match(pageSource, /mode="safe-fallback"/u);
assert.match(pageSource, /parseBannerDestinationQuery/u);
assert.match(pageSource, /BannerDestinationQueryError/u);
assert.match(rendererEditorSource, /from "\.\/banner-maker-canvas"/u);
assert.match(rendererCanvasSource, /calculateBannerGeometry/u);
assert.match(rendererCanvasSource, /getBannerTextPaint/u);
assert.match(rendererCanvasSource, /getBannerImagePaint\("background"\)/u);
assert.match(rendererCanvasSource, /getBannerImagePaint\("layer"\)/u);
assert.doesNotMatch(rendererCanvasSource, /student-account-menu|media-library/u);

const destinationSnapshot = (): BannerMakerDestinationSnapshot => ({
  assetUrls: {},
  bootstrap: { design, kind: "valid-design", requiresSave: false, source: null },
  configId: "banner-config",
  currentRevision: "22222222-2222-4222-8222-222222222222",
  design,
  destination: "beranda",
  draft: design,
  draftRevision: "22222222-2222-4222-8222-222222222222",
  hasPublishedDesign: true,
  hasSavedDraft: true,
  hasUnpublishedChanges: false,
  publicationState: "published",
  published: design,
  publishedAt: "2026-09-09T00:00:00.000Z",
});

type Controller = ReturnType<typeof useDestinationEditorController>;

function successfulActionState(formData: FormData, published: boolean, revisionNumber: number): BannerMakerDestinationFormState {
  return {
    currentRevision: `revision-${revisionNumber}`,
    destination: formData.get("destination") as "beranda",
    design: JSON.parse(String(formData.get("design"))) as BannerDesign,
    hasUnpublishedChanges: !published,
    message: published ? "Banner diterbitkan." : "Draf tersimpan.",
    published,
    requestId: String(formData.get("requestId")),
    status: "success",
  };
}

const controllerRouter = (routes: string[]): AppRouterInstance => ({
  back: () => undefined,
  forward: () => undefined,
  prefetch: async () => undefined,
  push: () => undefined,
  refresh: () => undefined,
  replace: (href) => routes.push(href),
});

await withReactDomTest(async (_root, render) => {
  const routes: string[] = [];
  const actionCalls: FormData[] = [];
  const requestId = mount.requestId;
  let revisionNumber = 0;
  let actionMode: "error" | "success" | "wait" = "success";
  let resolveWaitingAction: ((state: BannerMakerDestinationFormState) => void) | undefined;

  const action = async (
    _previousState: BannerMakerDestinationFormState,
    formData: FormData,
  ): Promise<BannerMakerDestinationFormState> => {
    actionCalls.push(formData);
    if (actionMode === "wait") {
      return new Promise((resolve) => {
        resolveWaitingAction = resolve;
      });
    }
    if (actionMode === "error") {
      return {
        destination: "beranda",
        message: "Konflik draf.",
        requestId,
        status: "error",
      };
    }
    revisionNumber += 1;
    return successfulActionState(formData, formData.get("intent") === "publish", revisionNumber);
  };

  let latest: Controller = null as unknown as Controller;
  function ControllerProbe() {
    latest = useDestinationEditorController({ action, requestId, snapshot: destinationSnapshot() });
    return createElement("output", { "data-testid": "controller-probe" });
  }

  await render(createElement(
    AppRouterContext.Provider,
    { value: controllerRouter(routes) },
    createElement(ControllerProbe),
  ));
  assert.ok(latest);

  const firstEdit = { ...design, name: "Perubahan implisit" };
  await act(async () => {
    latest?.actions.changeDesign(firstEdit);
  });
  assert.equal(latest?.isDirty, true, "mounted controller exposes local edits");

  let prevented = false;
  const implicitSubmit = handleBannerMakerDestinationSubmit({
    canSave: latest?.canSave ?? false,
    event: { preventDefault: () => { prevented = true; } },
    isDirty: latest?.isDirty ?? false,
    isPending: latest?.isPending ?? false,
    prepareSubmit: latest?.prepareSubmit ?? (() => false),
  });
  assert.equal(implicitSubmit, true, "native Enter follows the valid submit path");
  assert.equal(prevented, false, "valid native Enter is not cancelled");
  await act(async () => {
    latest?.formAction(createBannerMakerDestinationFormData({
      design: firstEdit,
      destination: "beranda",
      intent: "save-draft",
      requestId,
      revision: latest?.revision ?? null,
      source: latest?.source ?? null,
    }));
  });
  assert.equal(actionCalls.at(-1)?.get("intent"), "save-draft");
  assert.equal(latest?.isDirty, false, "implicit Enter establishes the authoritative saved baseline");
  assert.equal(latest?.revision, "revision-1");
  assert.equal(latest?.formState.status, "success");

  actionMode = "wait";
  await act(async () => {
    latest?.actions.changeDesign({ ...firstEdit, name: "Simpan pertama" });
  });
  act(() => {
    latest?.submitSave();
    latest?.submitSave();
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(actionCalls.length, 2, "rapid duplicate save dispatches only one request");
  assert.equal(latest?.isPending, true);

  await act(async () => {
    latest?.actions.changeDesign({ ...firstEdit, name: "Edit setelah simpan dimulai" });
  });
  const waitingState = successfulActionState(actionCalls[1] as FormData, false, 2);
  resolveWaitingAction?.(waitingState);
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(latest?.design?.name, "Edit setelah simpan dimulai", "a later local edit is retained after save resolves");
  assert.equal(latest?.isDirty, true);
  assert.match(latest?.formState.message ?? "", /setelah mulai menyimpan/u);

  actionMode = "success";
  await act(async () => {
    latest?.submitSave();
  });
  assert.equal(latest?.isDirty, false);
  await act(async () => {
    latest?.submitPublish();
  });
  assert.equal(latest?.hasSavedDraft, false, "publish clears the authoritative saved-draft flag");
  assert.equal(latest?.canPublish, false, "a second publish is disabled after publish success");
  const callsAfterPublish = actionCalls.length;
  latest?.submitPublish();
  assert.equal(actionCalls.length, callsAfterPublish, "disabled publish does not dispatch again");

  actionMode = "error";
  await act(async () => {
    latest?.actions.changeDesign({ ...firstEdit, name: "Perubahan konflik" });
  });
  await act(async () => {
    latest?.submitSave();
  });
  assert.equal(latest?.formState.status, "error", "mounted action errors are rendered in controller state");
  assert.equal(latest?.design?.name, "Perubahan konflik", "failed save keeps local artwork");
  assert.equal(latest?.isDirty, true);
});

await withReactDomTest(async (_root, render) => {
  const routes: string[] = [];
  const requestId = "33333333-3333-4333-8333-333333333333";
  const actionCalls: FormData[] = [];
  let actionMode: "success" | "wait" = "success";
  let resolveWaitingAction: ((state: BannerMakerDestinationFormState) => void) | undefined;
  const action = async (
    _previousState: BannerMakerDestinationFormState,
    formData: FormData,
  ): Promise<BannerMakerDestinationFormState> => {
    actionCalls.push(formData);
    if (actionMode === "wait") {
      return new Promise((resolve) => {
        resolveWaitingAction = resolve;
      });
    }
    return successfulActionState(formData, false, actionCalls.length + 10);
  };
  let latest: Controller = null as unknown as Controller;
  function ControllerProbe() {
    latest = useDestinationEditorController({ action, requestId, snapshot: destinationSnapshot() });
    return createElement("output");
  }

  await render(createElement(
    AppRouterContext.Provider,
    { value: controllerRouter(routes) },
    createElement(ControllerProbe),
  ));
  await act(async () => {
    latest?.actions.changeDesign({ ...design, name: "Simpan sebelum beralih" });
  });
  await act(async () => {
    latest?.navigateToDestination("materi");
  });
  assert.equal(latest?.pendingSwitch, "materi");
  await act(async () => {
    latest?.confirmSaveSwitch();
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(routes.at(-1), buildBannerMakerDestinationRoute("materi"), "authoritative save-and-switch navigates after save");
  assert.equal(latest?.isDirty, false);

  actionMode = "wait";
  await act(async () => {
    latest?.actions.changeDesign({ ...design, name: "Simpan lalu edit lagi" });
  });
  await act(async () => {
    latest?.navigateToDestination("kuis");
  });
  await act(async () => {
    latest?.confirmSaveSwitch();
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(actionCalls.length, 2);
  await act(async () => {
    latest?.actions.changeDesign({ ...design, name: "Edit setelah beralih dimulai" });
  });
  resolveWaitingAction?.(successfulActionState(actionCalls[1] as FormData, false, 12));
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(routes.at(-1), buildBannerMakerDestinationRoute("materi"), "save-and-switch does not navigate after a later local edit");
  assert.equal(latest?.design?.name, "Edit setelah beralih dimulai");
  assert.equal(latest?.isDirty, true);
});

await withReactDomTest(async (_root, render) => {
  const routes: string[] = [];
  const requestId = "66666666-6666-4666-8666-666666666666";
  const action = async (
    _previousState: BannerMakerDestinationFormState,
    _formData: FormData,
  ): Promise<BannerMakerDestinationFormState> => ({
    destination: "beranda",
    message: "Publikasi gagal karena konflik.",
    requestId,
    status: "error",
  });
  let latest: Controller = null as unknown as Controller;
  function ControllerProbe() {
    latest = useDestinationEditorController({ action, requestId, snapshot: destinationSnapshot() });
    return createElement("output");
  }

  await render(createElement(
    AppRouterContext.Provider,
    { value: controllerRouter(routes) },
    createElement(ControllerProbe),
  ));
  await act(async () => {
    latest?.submitPublish();
  });
  assert.equal(latest?.formState.status, "error", "publish failure remains visible in mounted controller state");
  assert.equal(latest?.hasSavedDraft, true, "publish failure retains the saved-draft authority");
  assert.equal(routes.length, 0);
});

await withReactDomTest(async (_root, render) => {
  const routes: string[] = [];
  const requestId = "44444444-4444-4444-8444-444444444444";
  const action = async (
    _previousState: BannerMakerDestinationFormState,
    formData: FormData,
  ): Promise<BannerMakerDestinationFormState> => successfulActionState(formData, false, 3);
  let latest: Controller = null as unknown as Controller;
  function ControllerProbe() {
    latest = useDestinationEditorController({ action, requestId, snapshot: destinationSnapshot() });
    return createElement("output");
  }

  await render(createElement(
    AppRouterContext.Provider,
    { value: controllerRouter(routes) },
    createElement(ControllerProbe),
  ));
  assert.ok(latest);

  await act(async () => {
    latest?.actions.openImagePicker();
  });
  const pickerGenerationBeforeSwitch = latest?.pickerGeneration ?? -1;
  assert.equal(latest?.pickerMode, "image");
  const designBeforeStaleSelection = latest?.design;
  await act(async () => {
    latest?.navigateToDestination("materi");
  });
  assert.equal(latest?.pickerMode, null, "switch intent closes an open picker immediately");
  assert.ok((latest?.pickerGeneration ?? -1) > pickerGenerationBeforeSwitch);
  await act(async () => {
    latest?.handleAssetSelected({ id: "stale-asset" } as never, pickerGenerationBeforeSwitch);
  });
  assert.deepEqual(latest?.design, designBeforeStaleSelection, "late picker selection from the old generation is ignored");
  assert.deepEqual(routes, [buildBannerMakerDestinationRoute("materi")]);

  await act(async () => {
    latest?.actions.changeDesign({ ...design, name: "Perubahan untuk batal" });
    latest?.actions.openBackgroundPicker();
  });
  const pickerGenerationBeforeCancel = latest?.pickerGeneration ?? -1;
  await act(async () => {
    latest?.navigateToDestination("kuis");
  });
  assert.equal(latest?.pendingSwitch, "kuis");
  assert.equal(latest?.pickerMode, null);
  await act(async () => {
    latest?.setPendingSwitch(null);
  });
  assert.equal(latest?.pendingSwitch, null, "cancelling a switch keeps the edited destination mounted");
  assert.ok((latest?.pickerGeneration ?? -1) > pickerGenerationBeforeCancel);
  assert.equal(routes.at(-1), buildBannerMakerDestinationRoute("materi"));

  await act(async () => {
    latest?.actions.openImagePicker();
  });
  await act(async () => {
    latest?.navigateToDestination("tryout");
  });
  assert.equal(latest?.pickerMode, null);
  await act(async () => {
    latest?.confirmDiscardSwitch();
  });
  assert.equal(routes.at(-1), buildBannerMakerDestinationRoute("tryout"));
});

await withReactDomTest(async (_root, render) => {
  const routes: string[] = [];
  const requestId = "55555555-5555-4555-8555-555555555555";
  let resolveWaitingAction: ((state: BannerMakerDestinationFormState) => void) | undefined;
  const action = async (
    _previousState: BannerMakerDestinationFormState,
    _formData: FormData,
  ): Promise<BannerMakerDestinationFormState> => new Promise((resolve) => {
    resolveWaitingAction = resolve;
  });
  let latest: Controller = null as unknown as Controller;
  function ControllerProbe() {
    latest = useDestinationEditorController({ action, requestId, snapshot: destinationSnapshot() });
    return createElement("output");
  }

  await render(createElement(
    AppRouterContext.Provider,
    { value: controllerRouter(routes) },
    createElement(ControllerProbe),
  ));
  await act(async () => {
    latest?.actions.changeDesign({ ...design, name: "Unmount sebelum respons" });
  });
  await act(async () => {
    latest?.actions.openImagePicker();
  });
  const pickerGenerationBeforeUnmount = latest?.pickerGeneration ?? -1;
  act(() => {
    latest?.submitSave();
    latest?.submitSave();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await render(createElement("output"));
  await act(async () => {
    latest?.handleAssetSelected({ id: "unmounted-asset" } as never, pickerGenerationBeforeUnmount);
  });
  resolveWaitingAction?.({
    destination: "beranda",
    design: { ...design, name: "Respons usang" },
    message: "Draf tersimpan.",
    requestId,
    status: "success",
  });
  await act(async () => {
    await Promise.resolve();
  });
  assert.deepEqual(routes, [], "an unmounted response cannot navigate history");
});

await withReactDomTest(async (root, render) => {
  const imageDesign: BannerDesign = {
    ...design,
    background: { assetId: "missing-background", type: "image" },
  };
  await render(createElement(BannerCanvas, {
    assetUrls: {},
    design: imageDesign,
    onChange: () => undefined,
    onDeleteLayer: () => undefined,
    onMoveLayer: () => undefined,
    onMoveToBack: () => undefined,
    onMoveToFront: () => undefined,
    onSelect: () => undefined,
    selectedLayerId: null,
    showGuides: false,
  }));
  assert.equal(findElements(root, "img").length, 0, "missing background never renders an empty image source");
  assert.ok(
    findElements(root, "div").some((element) => element.style.backgroundImage === "linear-gradient(120deg, #014C38, #176B4D)"),
    "missing background preserves the green editor fallback",
  );
});

const unknownDestinationMarkup = renderToStaticMarkup(createElement(BannerDestinationQueryError));
assert.match(unknownDestinationMarkup, /Tujuan banner tidak dikenali/u);
assert.match(unknownDestinationMarkup, /Kembali ke Banner maker/u);
assert.doesNotMatch(unknownDestinationMarkup, /Snapshot admin belum tersedia/u);

console.log("banner editor workflow contract checks passed");
