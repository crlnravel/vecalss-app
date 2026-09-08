import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { collectBannerAssetIds, parseBannerDesign } from "@/lib/admin/banner-maker";
import { prisma } from "@/lib/prisma";

import {
  BANNER_LEGACY_CONFIG_KEY,
  BANNER_V2_CONFIG_KEYS,
  getBannerDestinationByConfigKey,
} from "./destinations";
import {
  collectBannerEnvelopeAssetIds,
  parseBannerDesignEnvelope,
} from "./envelope";

const BANNER_MEDIA_MUTATION_LOCK_KEY = "vecalss:banner-media:mutation:v1" as const;

type BannerSafetyTransaction = Prisma.TransactionClient;

type BannerMediaMutationTestHook = () => void | Promise<void>;

let bannerMediaMutationTestHook: BannerMediaMutationTestHook | null = null;

class BannerReferenceSafetyUnknownError extends Error {
  readonly status = 409;

  constructor(configKey: string, source: "published" | "draft") {
    super(`Referensi media banner ${configKey} (${source}) tidak dapat diverifikasi. Perbaiki konfigurasi banner sebelum menghapus media.`);
    this.name = "BannerReferenceSafetyUnknownError";
  }
}

class BannerReferenceInUseError extends Error {
  readonly status = 409;

  constructor() {
    super("Gambar masih digunakan oleh banner. Lepaskan gambar dari semua draf atau publikasi banner sebelum menghapusnya.");
    this.name = "BannerReferenceInUseError";
  }
}

async function acquireBannerMediaMutationLock(tx: BannerSafetyTransaction) {
  // The hash is deliberately fixed: every banner writer and every Admin media
  // availability/topology writer must serialize on this one transaction lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${BANNER_MEDIA_MUTATION_LOCK_KEY}, 0))`;
  await bannerMediaMutationTestHook?.();
}

/**
 * Test-only barrier seam. Production callers never install a hook, so the
 * lock behavior remains unchanged while isolated race tests can pause after
 * the real transaction lock is held.
 */
async function withBannerMediaMutationTestHook<T>(
  hook: BannerMediaMutationTestHook,
  callback: () => Promise<T>,
) {
  const previousHook = bannerMediaMutationTestHook;
  bannerMediaMutationTestHook = hook;
  try {
    return await callback();
  } finally {
    bannerMediaMutationTestHook = previousHook;
  }
}

async function withBannerMediaMutationLock<T>(callback: (tx: BannerSafetyTransaction) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await acquireBannerMediaMutationLock(tx);
    return callback(tx);
  });
}

type BannerReferenceScan = {
  assetIds: string[];
  configKeys: string[];
};

function addAssetIds(target: Set<string>, assetIds: readonly string[]) {
  for (const assetId of assetIds) target.add(assetId);
}

function parseReferenceDesign(
  value: Prisma.JsonValue,
  configKey: string,
  source: "published" | "draft",
) {
  try {
    return parseBannerDesign(value);
  } catch {
    throw new BannerReferenceSafetyUnknownError(configKey, source);
  }
}

function parseReferenceEnvelope(
  value: Prisma.JsonValue,
  configKey: string,
  source: "published" | "draft",
  allowNullDesign: boolean,
) {
  try {
    return parseBannerDesignEnvelope(value, { allowNullDesign });
  } catch {
    throw new BannerReferenceSafetyUnknownError(configKey, source);
  }
}

async function scanBannerAssetReferences(tx: BannerSafetyTransaction): Promise<BannerReferenceScan> {
  const configKeys = [BANNER_LEGACY_CONFIG_KEY, ...BANNER_V2_CONFIG_KEYS];
  const configs = await tx.systemConfig.findMany({
    select: {
      configKey: true,
      configValue: true,
      draftValue: true,
    },
    where: { configKey: { in: configKeys } },
  });
  const assetIds = new Set<string>();

  for (const config of configs) {
    const destination = getBannerDestinationByConfigKey(config.configKey);
    if (config.configKey === BANNER_LEGACY_CONFIG_KEY) {
      addAssetIds(assetIds, collectBannerAssetIds(parseReferenceDesign(config.configValue, config.configKey, "published")));
      if (config.draftValue !== null) {
        addAssetIds(assetIds, collectBannerAssetIds(parseReferenceDesign(config.draftValue, config.configKey, "draft")));
      }
      continue;
    }

    if (!destination) continue;
    addAssetIds(
      assetIds,
      collectBannerEnvelopeAssetIds(parseReferenceEnvelope(config.configValue, config.configKey, "published", true)),
    );
    if (config.draftValue !== null) {
      addAssetIds(
        assetIds,
        collectBannerEnvelopeAssetIds(parseReferenceEnvelope(config.draftValue, config.configKey, "draft", false)),
      );
    }
  }

  return { assetIds: [...assetIds].sort(), configKeys: configs.map(({ configKey }) => configKey).sort() };
}

async function assertBannerAssetsMayBeTrashed(
  tx: BannerSafetyTransaction,
  affectedAssetIds: readonly string[],
) {
  const references = await scanBannerAssetReferences(tx);
  const affected = new Set(affectedAssetIds);
  if (references.assetIds.some((assetId) => affected.has(assetId))) {
    throw new BannerReferenceInUseError();
  }
}

export {
  BANNER_MEDIA_MUTATION_LOCK_KEY,
  BannerReferenceInUseError,
  BannerReferenceSafetyUnknownError,
  acquireBannerMediaMutationLock,
  assertBannerAssetsMayBeTrashed,
  scanBannerAssetReferences,
  withBannerMediaMutationTestHook,
  withBannerMediaMutationLock,
};
export type { BannerMediaMutationTestHook, BannerReferenceScan, BannerSafetyTransaction };
