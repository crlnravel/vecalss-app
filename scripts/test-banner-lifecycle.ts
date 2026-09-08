import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

const repositorySource = await readFile(resolve(root, "lib/admin/banner-maker-repository.ts"), "utf8");
const actionSource = await readFile(resolve(root, "modules/admin/banner-maker-actions.ts"), "utf8");
assert.match(actionSource, /const BANNER_V2_MUTATIONS_ENABLED = false/u, "v2 mutations remain staged-disabled until BP-05");
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
assert.match(actionSource, /parseBannerDestination/u);
assert.match(actionSource, /if \(!BANNER_V2_MUTATIONS_ENABLED\)/u);
assert.match(actionSource, /updateBannerMakerDestinationAction/u);

console.log("banner lifecycle contract checks passed");
