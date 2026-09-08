import "server-only";

import { unstable_noStore } from "next/cache";

import {
  MediaAssetState,
  MediaLibraryScope,
  Prisma,
} from "@/generated/prisma/client";
import { isImageMimeType } from "@/lib/media/domain";
import { prisma } from "@/lib/prisma";
import { acquireBannerMediaMutationLock } from "@/lib/banner/media-safety";

import {
  BANNER_MAKER_CONFIG_KEY,
  bannerDesignsEqual,
  collectBannerAssetIds,
  createDefaultBannerDesign,
  normalizeBannerDesign,
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerValidationError,
  type BannerAssetView,
  type BannerDesign,
  type BannerMakerSnapshot,
} from "./banner-maker";

type BannerMakerConfig = {
  configValue: Prisma.JsonValue;
  draftUpdatedAt: Date | null;
  draftValue: Prisma.JsonValue | null;
  id: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

function readExpectedVersion(expectedVersion: string | null) {
  if (!expectedVersion) return null;

  const expectedTime = new Date(expectedVersion);
  return Number.isNaN(expectedTime.getTime()) ? null : expectedTime;
}

function getDraftVersion(config: Pick<BannerMakerConfig, "draftUpdatedAt" | "updatedAt">) {
  return config.draftUpdatedAt ?? config.updatedAt;
}

function hasExpectedVersion({
  currentVersion,
  expectedVersion,
}: {
  currentVersion: Date;
  expectedVersion: string | null;
}) {
  const expectedTime = readExpectedVersion(expectedVersion);
  return Boolean(expectedVersion && expectedTime && currentVersion.getTime() === expectedTime.getTime());
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

async function readBannerMakerConfig() {
  return prisma.systemConfig.findUnique({
    select: {
      configValue: true,
      draftUpdatedAt: true,
      draftValue: true,
      id: true,
      publishedAt: true,
      updatedAt: true,
    },
    where: { configKey: BANNER_MAKER_CONFIG_KEY },
  });
}

async function readBannerAssetViews(assetIds: string[]) {
  if (assetIds.length === 0) return {};

  const assets = await prisma.asset.findMany({
    select: {
      height: true,
      id: true,
      mimeType: true,
      originalName: true,
      url: true,
      width: true,
    },
    where: {
      id: { in: assetIds },
      libraryScope: MediaLibraryScope.admin,
      state: MediaAssetState.ready,
      trashedAt: null,
    },
  });

  return assets.reduce<Record<string, BannerAssetView>>((views, asset) => {
    if (!isImageMimeType(asset.mimeType)) return views;

    views[asset.id] = {
      assetId: asset.id,
      height: asset.height,
      name: asset.originalName ?? "Gambar tanpa nama",
      url: asset.url || `/api/media/admin/assets/${asset.id}/thumbnail`,
      width: asset.width,
    };
    return views;
  }, {});
}

async function getBannerMakerSnapshot(): Promise<BannerMakerSnapshot> {
  unstable_noStore();

  const config = await readBannerMakerConfig();
  const published = normalizeBannerDesign(config?.configValue);
  const design = normalizeBannerDesign(config?.draftValue ?? config?.configValue);
  const assetIds = [...new Set([
    ...collectBannerAssetIds(design),
    ...collectBannerAssetIds(published),
  ])];
  const assetUrls = await readBannerAssetViews(assetIds);
  const version = config ? getDraftVersion(config).toISOString() : null;

  return {
    assetUrls,
    design,
    draftVersion: version,
    hasUnpublishedChanges: !bannerDesignsEqual(design, published),
    published,
    publishedAt: config?.publishedAt?.toISOString() ?? config?.updatedAt.toISOString() ?? null,
    version,
  };
}

async function assertBannerAssets(
  tx: Prisma.TransactionClient,
  design: BannerDesign,
) {
  const assetIds = collectBannerAssetIds(design);
  if (assetIds.length === 0) return;

  const assets = await tx.asset.findMany({
    select: { id: true, mimeType: true },
    where: {
      id: { in: assetIds },
      libraryScope: MediaLibraryScope.admin,
      state: MediaAssetState.ready,
      trashedAt: null,
    },
  });

  const validAssetIds = new Set(
    assets.reduce<string[]>((ids, asset) => {
      if (isImageMimeType(asset.mimeType)) ids.push(asset.id);
      return ids;
    }, []),
  );

  if (validAssetIds.size !== assetIds.length || assetIds.some((assetId) => !validAssetIds.has(assetId))) {
    throw new BannerMakerValidationError("Pilih gambar admin yang masih tersedia.");
  }
}

async function saveBannerMakerDraft({
  actorUserId,
  design,
  expectedVersion,
}: {
  actorUserId: string;
  design: BannerDesign;
  expectedVersion: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await acquireBannerMediaMutationLock(tx);

    const current = await tx.systemConfig.findUnique({
      select: {
        configValue: true,
        draftUpdatedAt: true,
        draftValue: true,
        id: true,
        publishedAt: true,
        updatedAt: true,
      },
      where: { configKey: BANNER_MAKER_CONFIG_KEY },
    });

    if (current) {
      if (!hasExpectedVersion({
        currentVersion: getDraftVersion(current),
        expectedVersion,
      })) {
        throw new BannerMakerConflictError();
      }
    } else if (expectedVersion) {
      throw new BannerMakerConflictError();
    }

    await assertBannerAssets(tx, design);

    const now = new Date();
    let config: BannerMakerConfig;

    if (current) {
      const updated = await tx.systemConfig.updateMany({
        data: {
          draftUpdatedAt: now,
          draftUpdatedByUserId: actorUserId,
          draftValue: design as unknown as Prisma.InputJsonValue,
        },
        where: {
          configKey: BANNER_MAKER_CONFIG_KEY,
          draftUpdatedAt: current.draftUpdatedAt,
          updatedAt: current.updatedAt,
        },
      });

      if (updated.count !== 1) throw new BannerMakerConflictError();

      config = await tx.systemConfig.findUniqueOrThrow({
        select: {
          configValue: true,
          draftUpdatedAt: true,
          draftValue: true,
          id: true,
          publishedAt: true,
          updatedAt: true,
        },
        where: { id: current.id },
      });
    } else {
      try {
        config = await tx.systemConfig.create({
          data: {
            configKey: BANNER_MAKER_CONFIG_KEY,
            configValue: createDefaultBannerDesign() as unknown as Prisma.InputJsonValue,
            draftUpdatedAt: now,
            draftUpdatedByUserId: actorUserId,
            draftValue: design as unknown as Prisma.InputJsonValue,
          },
          select: {
            configValue: true,
            draftUpdatedAt: true,
            draftValue: true,
            id: true,
            publishedAt: true,
            updatedAt: true,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new BannerMakerConflictError();
        throw error;
      }
    }

    await tx.auditLog.create({
      data: {
        action: "student_banner_maker_draft_saved",
        actorUserId,
        metadata: {
          configKey: BANNER_MAKER_CONFIG_KEY,
          layerCount: design.layers.length,
        },
        targetId: config.id,
        targetType: "system_config",
      },
    });

    const published = normalizeBannerDesign(config.configValue);
    const draft = normalizeBannerDesign(config.draftValue ?? config.configValue);

    return {
      design: draft,
      draftVersion: getDraftVersion(config).toISOString(),
      hasUnpublishedChanges: !bannerDesignsEqual(draft, published),
    };
  });
}

async function publishBannerMakerDesign({
  actorUserId,
  design,
  expectedVersion,
}: {
  actorUserId: string;
  design: BannerDesign;
  expectedVersion: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await acquireBannerMediaMutationLock(tx);

    const current = await tx.systemConfig.findUnique({
      select: {
        configValue: true,
        draftUpdatedAt: true,
        draftValue: true,
        id: true,
        updatedAt: true,
      },
      where: { configKey: BANNER_MAKER_CONFIG_KEY },
    });

    if (current) {
      if (!hasExpectedVersion({
        currentVersion: getDraftVersion(current),
        expectedVersion,
      })) {
        throw new BannerMakerConflictError();
      }
    } else if (expectedVersion) {
      throw new BannerMakerConflictError();
    }

    const draft = current
      ? normalizeBannerDesign(current.draftValue ?? current.configValue)
      : design;

    if (current && !bannerDesignsEqual(draft, design)) {
      throw new BannerMakerDraftMismatchError();
    }

    await assertBannerAssets(tx, draft);

    const now = new Date();
    let config: BannerMakerConfig;

    if (current) {
      const updated = await tx.systemConfig.updateMany({
        data: {
          configValue: draft as unknown as Prisma.InputJsonValue,
          draftUpdatedAt: null,
          draftUpdatedByUserId: null,
          draftValue: Prisma.DbNull,
          publishedAt: now,
          publishedByUserId: actorUserId,
          updatedAt: now,
          updatedByUserId: actorUserId,
        },
        where: {
          configKey: BANNER_MAKER_CONFIG_KEY,
          draftUpdatedAt: current.draftUpdatedAt,
          updatedAt: current.updatedAt,
        },
      });

      if (updated.count !== 1) throw new BannerMakerConflictError();

      config = await tx.systemConfig.findUniqueOrThrow({
        select: {
          configValue: true,
          draftUpdatedAt: true,
          draftValue: true,
          id: true,
          publishedAt: true,
          updatedAt: true,
        },
        where: { id: current.id },
      });
    } else {
      try {
        config = await tx.systemConfig.create({
          data: {
            configKey: BANNER_MAKER_CONFIG_KEY,
            configValue: design as unknown as Prisma.InputJsonValue,
            publishedAt: now,
            publishedByUserId: actorUserId,
            updatedAt: now,
            updatedByUserId: actorUserId,
          },
          select: {
            configValue: true,
            draftUpdatedAt: true,
            draftValue: true,
            id: true,
            publishedAt: true,
            updatedAt: true,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) throw new BannerMakerConflictError();
        throw error;
      }
    }

    await tx.auditLog.create({
      data: {
        action: "student_banner_maker_published",
        actorUserId,
        metadata: {
          configKey: BANNER_MAKER_CONFIG_KEY,
          layerCount: draft.layers.length,
        },
        targetId: config.id,
        targetType: "system_config",
      },
    });

    return {
      design: normalizeBannerDesign(config.configValue),
      hasUnpublishedChanges: false,
      updatedAt: config.updatedAt.toISOString(),
    };
  });
}

async function getPublishedBannerMakerDesign() {
  unstable_noStore();
  const config = await prisma.systemConfig.findUnique({
    select: { configValue: true },
    where: { configKey: BANNER_MAKER_CONFIG_KEY },
  });

  return normalizeBannerDesign(config?.configValue);
}

export {
  getBannerMakerSnapshot,
  getPublishedBannerMakerDesign,
  publishBannerMakerDesign,
  saveBannerMakerDraft,
};
