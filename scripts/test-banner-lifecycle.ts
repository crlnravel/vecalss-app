import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerRecoveryUnavailableError,
  BannerMakerSourceConflictError,
  BannerMakerValidationError,
  createDefaultBannerDesign,
  type BannerMakerDestinationFormState,
  type BannerMakerDestinationMutationResult,
} from "../lib/admin/banner-maker";
import { handleBannerMakerDestinationAction } from "../lib/admin/banner-maker-action-handler";
import {
  BANNER_DESTINATIONS,
  BANNER_LEGACY_CONFIG_KEY,
  parseBannerDestination,
} from "../lib/banner/destinations";
import {
  BANNER_STORAGE_VERSION,
  createBannerDesignEnvelope,
  parseBannerDesignEnvelope,
} from "../lib/banner/envelope";

const root = resolve(import.meta.dirname, "..");

assert.equal(BANNER_LEGACY_CONFIG_KEY, "student.banner-maker.v1");
assert.deepEqual(
  BANNER_DESTINATIONS.map(({ key, route, configKey }) => ({ configKey, key, route })),
  [
    { configKey: "student.banner-maker.v2.beranda", key: "beranda", route: "/dashboard" },
    { configKey: "student.banner-maker.v2.materi", key: "materi", route: "/courses" },
    { configKey: "student.banner-maker.v2.kuis", key: "kuis", route: "/quiz" },
    { configKey: "student.banner-maker.v2.tryout", key: "tryout", route: "/tryout" },
  ],
);
assert.equal(parseBannerDestination("beranda"), "beranda");
assert.throws(() => parseBannerDestination("/dashboard"), /tujuan banner tidak dikenali/iu);

const envelope = createBannerDesignEnvelope(null);
assert.equal(envelope.storageVersion, BANNER_STORAGE_VERSION);
assert.equal(parseBannerDesignEnvelope(envelope, { allowNullDesign: true }).design, null);
assert.throws(() => parseBannerDesignEnvelope(envelope), /tidak boleh kosong/iu);
assert.throws(
  () => parseBannerDesignEnvelope({ ...envelope, revision: "00000000-0000-0000-0000-000000000000" }),
  /revisi desain banner harus berupa uuid/iu,
);

const repositorySource = await readFile(resolve(root, "lib/admin/banner-maker-repository.ts"), "utf8");
const actionSource = await readFile(resolve(root, "modules/admin/banner-maker-actions.ts"), "utf8");
const actionHandlerSource = await readFile(resolve(root, "lib/admin/banner-maker-action-handler.ts"), "utf8");
assert.match(actionSource, /isBannerV2EditorEnabled\(\)/u, "v2 mutations are controlled by the coordinated activation gate");
for (const functionName of [
  "getBannerMakerDestinationSnapshot",
  "saveBannerMakerDestinationDraft",
  "publishBannerMakerDestinationDesign",
  "getPublishedBannerMakerDestinationDesign",
]) {
  assert.match(repositorySource, new RegExp(`(?:async )?function ${functionName}\\b`, "u"));
}
assert.match(repositorySource, /acquireBannerMediaMutationLock\(tx\)/u);
assert.match(repositorySource, /student_banner_maker_v2_draft_saved/u);
assert.match(repositorySource, /student_banner_maker_v2_published/u);
assert.match(actionSource, /requireAdminSession\(\)/u);
assert.match(actionSource, /mutationsEnabled: isBannerV2EditorEnabled\(\)/u);
assert.match(actionSource, /handleBannerMakerDestinationAction/u);
assert.match(actionSource, /updateBannerMakerDestinationAction/u);
assert.match(actionHandlerSource, /dependencies\.requireAdminSession/u);
assert.match(actionHandlerSource, /dependencies\.mutationsEnabled/u);
assert.match(actionHandlerSource, /if \(!dependencies\.mutationsEnabled\)/u);

const ACTION_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const ACTION_ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const previousState: BannerMakerDestinationFormState = {
  destination: "beranda",
  requestId: "33333333-3333-4333-8333-333333333333",
  status: "idle",
};

function actionForm({
  destination = "materi",
  design = createDefaultBannerDesign(),
  intent = "save-draft",
  requestId = ACTION_REQUEST_ID,
  revision = "",
  source = "",
}: {
  destination?: string;
  design?: unknown;
  intent?: string;
  requestId?: string;
  revision?: string;
  source?: string;
} = {}) {
  const form = new FormData();
  form.set("destination", destination);
  form.set("design", JSON.stringify(design));
  form.set("intent", intent);
  form.set("requestId", requestId);
  form.set("revision", revision);
  form.set("source", source);
  return form;
}

function mutationResult(): BannerMakerDestinationMutationResult {
  return {
    configId: "44444444-4444-4444-8444-444444444444",
    currentRevision: "55555555-5555-4555-8555-555555555555",
    design: createDefaultBannerDesign(),
    destination: "materi",
    hasPublishedDesign: false,
    hasSavedDraft: true,
    hasUnpublishedChanges: true,
    publicationState: "never-published",
    publishedAt: null,
  };
}

function actionDependencies({
  mutationsEnabled = true,
  publish = async () => mutationResult(),
  requireAdminSession = async () => ({ user: { id: ACTION_ACTOR_ID } }),
  saveDraft = async () => mutationResult(),
}: {
  mutationsEnabled?: boolean;
  publish?: () => Promise<BannerMakerDestinationMutationResult>;
  requireAdminSession?: () => Promise<{ user: { id: string } }>;
  saveDraft?: () => Promise<BannerMakerDestinationMutationResult>;
} = {}) {
  return {
    mutationsEnabled,
    publish: async () => publish(),
    requireAdminSession,
    saveDraft: async () => saveDraft(),
  };
}

let saveCalls = 0;
const disabled = await handleBannerMakerDestinationAction(
  previousState,
  actionForm(),
  actionDependencies({
    mutationsEnabled: false,
    saveDraft: async () => {
      saveCalls += 1;
      return mutationResult();
    },
  }),
);
assert.equal(disabled.status, "error");
assert.match(disabled.message ?? "", /belum diaktifkan/iu);
assert.equal(disabled.destination, "materi");
assert.equal(disabled.requestId, ACTION_REQUEST_ID);
assert.equal(saveCalls, 0, "staged-disabled action must not call a repository");

for (const invalid of [
  { form: actionForm({ destination: "unknown" }), message: /tujuan banner tidak dikenali/iu },
  { form: actionForm({ requestId: "00000000-0000-0000-0000-000000000000" }), message: /identitas permintaan banner tidak valid/iu },
  { form: actionForm({ revision: "00000000-0000-0000-0000-000000000000" }), message: /revisi tujuan banner harus berupa uuid/iu },
  { form: actionForm({ source: "{broken" }), message: /sumber pemulihan banner tidak dapat dibaca/iu },
  { form: actionForm({ source: "[]" }), message: /sumber pemulihan banner tidak valid/iu },
  { form: actionForm({ source: "{}" }), message: /sumber pemulihan banner tidak valid/iu },
]) {
  const result = await handleBannerMakerDestinationAction(previousState, invalid.form, actionDependencies());
  assert.equal(result.status, "error");
  assert.match(result.message ?? "", invalid.message);
}

await assert.rejects(
  handleBannerMakerDestinationAction(
    previousState,
    actionForm(),
    actionDependencies({ requireAdminSession: async () => { throw new Error("unauthorized"); } }),
  ),
  /unauthorized/iu,
);

for (const error of [
  new BannerMakerConflictError(),
  new BannerMakerSourceConflictError(),
  new BannerMakerRecoveryUnavailableError(),
  new BannerMakerValidationError("invalid design"),
  new Error("internal secret"),
]) {
  const result = await handleBannerMakerDestinationAction(
    previousState,
    actionForm(),
    actionDependencies({ saveDraft: async () => { throw error; } }),
  );
  assert.equal(result.status, "error");
  assert.ok(result.destination === "materi" && result.requestId === ACTION_REQUEST_ID);
  if (error instanceof BannerMakerConflictError) {
    assert.match(result.message ?? "", /tab lain/iu);
  } else if (error instanceof Error && error.message === "internal secret") {
    assert.equal(result.message, "Banner tujuan belum tersimpan. Coba lagi.");
  } else {
    assert.equal(result.message, error.message);
  }
}

const mismatch = await handleBannerMakerDestinationAction(
  previousState,
  actionForm({ intent: "publish" }),
  actionDependencies({ publish: async () => { throw new BannerMakerDraftMismatchError(); } }),
);
assert.equal(mismatch.status, "error");
assert.match(mismatch.message ?? "", /simpan draf/iu);

const success = await handleBannerMakerDestinationAction(previousState, actionForm(), actionDependencies());
assert.equal(success.status, "success");
assert.equal(success.destination, "materi");
assert.equal(success.requestId, ACTION_REQUEST_ID);
assert.equal(success.currentRevision, mutationResult().currentRevision);
const publishSuccess = await handleBannerMakerDestinationAction(
  previousState,
  actionForm({ intent: "publish" }),
  actionDependencies({ publish: async () => ({ ...mutationResult(), hasPublishedDesign: true, hasSavedDraft: false, hasUnpublishedChanges: false, publicationState: "published" as const, publishedAt: "2026-09-08T12:00:00.000Z" }) }),
);
assert.equal(publishSuccess.status, "success");
assert.equal(publishSuccess.published, true);
assert.equal(publishSuccess.destination, "materi");

console.log("banner lifecycle contract checks passed");
