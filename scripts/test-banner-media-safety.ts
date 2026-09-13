import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createDefaultBannerDesign,
  collectBannerAssetIds,
} from "../lib/admin/banner-maker";
import {
  BANNER_DESTINATIONS,
  BANNER_LEGACY_CONFIG_KEY,
  BANNER_V2_CONFIG_KEYS,
  getBannerDestinationByConfigKey,
  parseBannerDestination,
} from "../lib/banner/destinations";
import {
  BANNER_STORAGE_VERSION,
  BannerEnvelopeParseError,
  collectBannerEnvelopeAssetIds,
  createBannerDesignEnvelope,
  parseBannerDesignEnvelope,
} from "../lib/banner/envelope";
import {
  assertBannerAssetsMayBeTrashed,
  BannerReferenceInUseError,
  BannerReferenceSafetyUnknownError,
  scanBannerAssetReferences,
  type BannerSafetyTransaction,
} from "../lib/banner/media-safety";

const repoRoot = process.cwd();
const readSource = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function sourceForFunction(source: string, name: string, siblingNames: readonly string[]) {
  const declarationCandidates = [`const ${name} =`, `async function ${name}(`];
  const start = declarationCandidates
    .map((declaration) => source.indexOf(declaration))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  assert.ok(start >= 0, `${name} must remain an explicit production mutator`);
  const end = Math.min(
    ...siblingNames
      .filter((sibling) => sibling !== name)
      .flatMap((sibling) => [`const ${sibling} =`, `async function ${sibling}(`])
      .map((declaration) => source.indexOf(declaration, start + 1))
      .filter((index) => index >= 0),
    source.length,
  );
  return source.slice(start, end);
}

function assertMutationLockBoundary(
  source: string,
  name: string,
  siblingNames: readonly string[],
  firstReadPattern: RegExp,
) {
  const functionSource = sourceForFunction(source, name, siblingNames);
  const lockIndex = functionSource.indexOf("acquireBannerMediaMutationLock");
  const firstRead = functionSource.search(firstReadPattern);
  assert.ok(lockIndex >= 0, `${name} must acquire the shared mutation lock`);
  assert.ok(firstRead >= 0, `${name} must retain its expected guarded read`);
  assert.ok(lockIndex < firstRead, `${name} must lock before its first guarded read`);
}

const run = async () => {
  assert.equal(BANNER_STORAGE_VERSION, 2);
  assert.deepEqual(
    BANNER_DESTINATIONS.map(({ key, route, configKey }) => ({ key, route, configKey })),
    [
      { configKey: "student.banner-maker.v2.beranda", key: "beranda", route: "/dashboard" },
      { configKey: "student.banner-maker.v2.materi", key: "materi", route: "/courses" },
      { configKey: "student.banner-maker.v2.kuis", key: "kuis", route: "/quiz" },
      { configKey: "student.banner-maker.v2.tryout", key: "tryout", route: "/tryout" },
    ],
  );
  assert.deepEqual(BANNER_V2_CONFIG_KEYS, BANNER_DESTINATIONS.map(({ configKey }) => configKey));
  assert.equal(BANNER_LEGACY_CONFIG_KEY, "student.banner-maker.v1");
  assert.equal(parseBannerDestination("beranda"), "beranda");
  assert.throws(() => parseBannerDestination("/dashboard"), /tujuan banner tidak dikenali/iu);
  assert.equal(getBannerDestinationByConfigKey("student.banner-maker.v2.kuis")?.route, "/quiz");

  const design = createDefaultBannerDesign();
  const assetId = "7ca953d0-0f55-43a4-a644-28bb3c6f741b";
  const imageDesign = {
    ...design,
    background: { assetId, type: "image" as const },
  };
  const revision = "1c2d3e4f-5061-4789-8abc-def012345678";
  const envelope = createBannerDesignEnvelope(imageDesign, { revision });
  assert.equal(envelope.storageVersion, 2);
  assert.equal(envelope.revision, revision);
  assert.equal(envelope.design?.version, 1, "design format version stays distinct from storage version");
  assert.deepEqual(parseBannerDesignEnvelope(envelope), envelope);
  assert.deepEqual(collectBannerEnvelopeAssetIds(envelope), [assetId]);
  assert.deepEqual(collectBannerAssetIds(imageDesign), [assetId]);

  const neverPublished = createBannerDesignEnvelope(null, { revision });
  assert.equal(parseBannerDesignEnvelope(neverPublished, { allowNullDesign: true }).design, null);
  assert.throws(
    () => parseBannerDesignEnvelope(neverPublished),
    (error: unknown) => error instanceof BannerEnvelopeParseError && /tidak boleh kosong/iu.test(error.message),
  );
  assert.throws(() => parseBannerDesignEnvelope({ ...envelope, storageVersion: 1 }), BannerEnvelopeParseError);
  assert.throws(() => parseBannerDesignEnvelope({ ...envelope, revision: "not-a-uuid" }), BannerEnvelopeParseError);
  assert.throws(() => parseBannerDesignEnvelope({ ...envelope, extra: true }), BannerEnvelopeParseError);
  assert.throws(() => parseBannerDesignEnvelope({ ...envelope, design: { version: 99 } }), BannerEnvelopeParseError);

  const fakeTransaction = {
    systemConfig: {
      findMany: async () => [
        {
          configKey: BANNER_LEGACY_CONFIG_KEY,
          configValue: imageDesign,
          draftValue: imageDesign,
        },
        ...BANNER_V2_CONFIG_KEYS.map((configKey, index) => ({
          configKey,
          configValue: createBannerDesignEnvelope(imageDesign, { revision }),
          draftValue: createBannerDesignEnvelope(imageDesign, { revision: `2c3d4e5f-6071-489a-8bcd-ef012345678${index}` }),
        })),
      ],
    },
  } as unknown as BannerSafetyTransaction;
  const references = await scanBannerAssetReferences(fakeTransaction);
  assert.deepEqual(references.assetIds, [assetId]);
  await assert.rejects(
    () => assertBannerAssetsMayBeTrashed(fakeTransaction, [assetId]),
    (error: unknown) => error instanceof BannerReferenceInUseError,
  );
  const malformedFixtures = [
    { configKey: BANNER_LEGACY_CONFIG_KEY, configValue: { invalid: true }, draftValue: null },
    { configKey: BANNER_LEGACY_CONFIG_KEY, configValue: createDefaultBannerDesign(), draftValue: { invalid: true } },
    ...BANNER_V2_CONFIG_KEYS.flatMap((configKey) => [
      { configKey, configValue: { ...envelope, storageVersion: 1 }, draftValue: null },
      { configKey, configValue: createBannerDesignEnvelope(null, { revision }), draftValue: { ...envelope, storageVersion: 1 } },
    ]),
  ];
  for (const fixture of malformedFixtures) {
    const malformedTransaction = {
      systemConfig: { findMany: async () => [fixture] },
    } as unknown as BannerSafetyTransaction;
    await assert.rejects(
      () => scanBannerAssetReferences(malformedTransaction),
      (error: unknown) => error instanceof BannerReferenceSafetyUnknownError,
    );
  }

  const mediaSource = readSource("lib/media/repository.ts");
  const bannerRepositorySource = readSource("lib/admin/banner-maker-repository.ts");
  const studentRepositorySource = readSource("lib/student/banner-repository.ts");
  const safetySource = readSource("lib/banner/media-safety.ts");
  assert.match(safetySource, /pg_advisory_xact_lock/u);
  assert.match(safetySource, /BANNER_V2_CONFIG_KEYS/u);
  assert.match(safetySource, /BANNER_LEGACY_CONFIG_KEY/u);
  const mediaMutators = [
    ["createMediaFolder", /readActiveFolderAncestry\(scope, safeParentId, tx\)/u],
    ["renameMediaFolder", /readActiveFolderAncestry\(scope, folderId, tx\)/u],
    ["moveMediaFolder", /assertFolderMove\(\{ db: tx/u],
    ["trashMediaFolder", /readActiveFolderAncestry\(scope, folderId, tx\)/u],
    ["renameMediaAsset", /assertAsset\(scope, assetId, \[MediaAssetState\.ready\], tx\)/u],
    ["moveMediaAsset", /assertAsset\(scope, assetId, \[MediaAssetState\.ready\], tx\)/u],
    ["trashMediaAsset", /assertAsset\(scope, assetId, \[MediaAssetState\.pending, MediaAssetState\.ready\], tx\)/u],
    ["requestMediaUpload", /readActiveFolderAncestry\(scope, safeFolderId, tx\)/u],
    ["finalizeMediaUpload", /tx\.asset\.findUnique/u],
  ] as const;
  const mediaMutatorNames = mediaMutators.map(([name]) => name);
  for (const [name, firstReadPattern] of mediaMutators) {
    assertMutationLockBoundary(mediaSource, name, mediaMutatorNames, firstReadPattern);
  }

  const bannerMutators = ["saveBannerMakerDestinationDraft", "publishBannerMakerDestinationDesign"] as const;
  for (const name of bannerMutators) {
    assertMutationLockBoundary(
      bannerRepositorySource,
      name,
      bannerMutators,
      /readDestinationConfig\(definition\.configKey, tx\)/u,
    );
  }
  for (const name of ["saveStudentBannerDraft", "publishStudentBannerContents"] as const) {
    const functionSource = sourceForFunction(studentRepositorySource, name, ["saveStudentBannerDraft", "publishStudentBannerContents"]);
    assert.match(functionSource, /assertLegacyBannerWritesRetired\(\)/u, `${name} must retain the retired-writer guard`);
  }
  assert.match(mediaSource, /state: \{ in: \[MediaAssetState\.pending, MediaAssetState\.ready\] \}/u);
  assert.match(mediaSource, /trashedAt: null/u);
  assert.match(mediaSource, /headMediaObject\(verifiedObjectKey\)/u);
  const finalizeSource = mediaSource.slice(
    mediaSource.indexOf("const finalizeMediaUpload"),
    mediaSource.indexOf("const getMediaAssetPreview"),
  );
  const headIndex = finalizeSource.indexOf("headMediaObject(verifiedObjectKey)");
  const firstTransactionIndex = finalizeSource.indexOf("prisma.$transaction");
  assert.ok(headIndex >= 0 && firstTransactionIndex > headIndex, "R2 HEAD happens before the finalize transaction");
  assert.doesNotMatch(finalizeSource.slice(firstTransactionIndex), /headMediaObject/u, "no storage I/O runs under the lock");

  console.log("banner media safety contracts passed");
};

await run();
