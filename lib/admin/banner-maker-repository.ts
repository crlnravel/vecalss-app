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
  createTextBannerStarterDesign,
  normalizeBannerDesign,
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerRecoveryUnavailableError,
  BannerMakerSourceConflictError,
  BannerMakerValidationError,
  parseBannerDesign,
  type BannerBootstrap,
  type BannerAssetView,
  type BannerDesign,
  type BannerMakerDestinationMutationResult,
  type BannerMakerDestinationSnapshot,
  type BannerRecoveryOption,
  type BannerMakerSnapshot,
  type BannerSourceDescriptor,
  type BannerStarterIssue,
} from "./banner-maker";

import {
  BANNER_LEGACY_CONFIG_KEY,
  getBannerDestination,
  parseBannerDestination,
  type BannerDestination,
} from "@/lib/banner/destinations";
import {
  createBannerDesignEnvelope,
  isUuid,
  parseBannerDesignEnvelope,
  type BannerDesignEnvelope,
} from "@/lib/banner/envelope";
import {
  bannerSourceDescriptorsEqual,
  createBannerSourceDescriptor,
  type BannerSourceRow,
} from "@/lib/banner/source";
import { STUDENT_BANNER_DEFAULTS } from "@/lib/student/banner-content";

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

const LEGACY_TEXT_CONFIG_KEY = "student.banners" as const;
const BANNER_SOURCE_DESCRIPTOR_COLUMNS = new Set(["configValue", "draftValue"]);

type DestinationConfig = BannerSourceRow;

type ParsedDestinationConfig = {
  configEnvelope: BannerDesignEnvelope;
  draftEnvelope: BannerDesignEnvelope | null;
  error: string | null;
  publishedError: string | null;
};

function readUuid(value: string | null, field: string) {
  if (value === null) return null;
  if (!isUuid(value)) {
    throw new BannerMakerValidationError(`${field} harus berupa UUID.`);
  }
  return value;
}

function readDestinationConfigRevision(config: DestinationConfig) {
  const parsed = parseDestinationConfig(config);
  if (parsed.error) throw new BannerMakerRecoveryUnavailableError(parsed.error);
  return parsed.draftEnvelope?.revision ?? parsed.configEnvelope.revision;
}

function parseDestinationConfig(config: DestinationConfig): ParsedDestinationConfig {
  let configEnvelope: BannerDesignEnvelope;
  try {
    configEnvelope = parseBannerDesignEnvelope(config.configValue, { allowNullDesign: true });
  } catch {
    return {
      configEnvelope: createBannerDesignEnvelope(null),
      draftEnvelope: null,
      error: "Konfigurasi publik v2 banner tidak valid dan membutuhkan pemulihan.",
      publishedError: "Konfigurasi publik v2 banner tidak valid dan membutuhkan pemulihan.",
    };
  }

  let draftEnvelope: BannerDesignEnvelope | null = null;
  let error: string | null = null;
  if (config.draftValue !== null) {
    try {
      draftEnvelope = parseBannerDesignEnvelope(config.draftValue);
    } catch {
      error = "Draf v2 banner tidak valid dan membutuhkan pemulihan.";
    }

    if (draftEnvelope && !config.draftUpdatedAt) {
      error = "Metadata waktu draf v2 banner tidak valid dan membutuhkan pemulihan.";
    }
  } else if (config.draftUpdatedAt) {
    error = "Metadata draf v2 banner tidak lengkap dan membutuhkan pemulihan.";
  }

  let publishedError: string | null = null;
  if (config.publishedAt === null && configEnvelope.design !== null) {
    error ??= "Desain v2 banner memiliki penanda terbit yang hilang.";
    publishedError = "Desain v2 banner memiliki penanda terbit yang hilang.";
  }

  if (config.publishedAt !== null && configEnvelope.design === null) {
    error ??= "Penanda terbit v2 banner tidak memiliki desain publik.";
    publishedError = "Penanda terbit v2 banner tidak memiliki desain publik.";
  }

  return { configEnvelope, draftEnvelope, error, publishedError };
}

async function readDestinationConfig(configKey: string, tx?: Prisma.TransactionClient): Promise<DestinationConfig | null> {
  const client = tx ?? prisma;
  return client.systemConfig.findUnique({
    select: {
      configKey: true,
      configValue: true,
      draftUpdatedAt: true,
      draftUpdatedByUserId: true,
      draftValue: true,
      id: true,
      publishedAt: true,
      publishedByUserId: true,
      updatedAt: true,
      updatedByUserId: true,
    },
    where: { configKey },
  });
}

async function readLegacySource(configKey: string, tx?: Prisma.TransactionClient): Promise<DestinationConfig | null> {
  const client = tx ?? prisma;
  return client.systemConfig.findUnique({
    select: {
      configKey: true,
      configValue: true,
      draftUpdatedAt: true,
      draftUpdatedByUserId: true,
      draftValue: true,
      id: true,
      publishedAt: true,
      publishedByUserId: true,
      updatedAt: true,
      updatedByUserId: true,
    },
    where: { configKey },
  });
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLegacyText(value: Prisma.JsonValue | null, destination: BannerDestination) {
  const stored = isRecordValue(value) ? value : {};
  const banner = isRecordValue(stored[destination]) ? stored[destination] : {};
  const defaults = STUDENT_BANNER_DEFAULTS[destination];

  return {
    description: typeof banner.description === "string" && banner.description.trim().length > 0
      ? banner.description
      : defaults.description,
    title: typeof banner.title === "string" && banner.title.trim().length > 0
      ? banner.title
      : defaults.title,
  };
}

function legacyTextSourceDescriptor(row: DestinationConfig | null): BannerSourceDescriptor {
  return createBannerSourceDescriptor(row, "legacy-text", "configValue");
}

function legacyArtworkSourceDescriptor(
  row: DestinationConfig,
  sourceColumn: "configValue" | "draftValue",
) {
  return createBannerSourceDescriptor(row, "legacy-artwork", sourceColumn);
}

function textStarterIssues(title: string, description: string): BannerStarterIssue[] {
  const issues: BannerStarterIssue[] = [];
  for (const [field, value] of [["title", title], ["description", description]] as const) {
    if (value.length <= 180) continue;
    issues.push({
      actualLength: value.length,
      code: "too-long",
      field,
      limit: 180,
      message: `${field === "title" ? "Judul" : "Deskripsi"} melebihi batas 180 karakter; edit sebelum menyimpan.`,
    });
  }
  return issues;
}

function createLegacyTextBootstrap(
  destination: BannerDestination,
  sourceRow: DestinationConfig | null,
): BannerBootstrap {
  const source = legacyTextSourceDescriptor(sourceRow);
  const { description, title } = readLegacyText(sourceRow?.configValue ?? null, destination);
  const issues = textStarterIssues(title, description);
  if (issues.length > 0) {
    return {
      description,
      destination,
      issues,
      kind: "starter-needs-edit",
      source,
      title,
    };
  }

  return {
    design: createTextBannerStarterDesign({ description, destination, title }),
    kind: "valid-design",
    requiresSave: true,
    source,
  };
}

function createLegacyTextRecoveryOption(bootstrap: BannerBootstrap): BannerRecoveryOption | null {
  if (bootstrap.kind === "unavailable-recovery" || !bootstrap.source) return null;
  return {
    bootstrap,
    kind: "legacy-text",
    source: bootstrap.source,
  };
}

function createUnavailableBootstrap(
  destination: BannerDestination,
  diagnostic: string,
  source: BannerSourceDescriptor | null,
  recoveryOptions: BannerRecoveryOption[],
): BannerBootstrap {
  return {
    diagnostic,
    destination,
    kind: "unavailable-recovery",
    recoveryOptions,
    source,
  };
}

function readLegacyArtworkCandidate(
  destination: BannerDestination,
  row: DestinationConfig | null,
) {
  if (destination !== "beranda" || !row || row.publishedAt === null) return null;
  try {
    return {
      design: parseBannerDesign(row.configValue),
      source: legacyArtworkSourceDescriptor(row, "configValue"),
    };
  } catch {
    return null;
  }
}

async function getBannerMakerDestinationSnapshot(
  destinationValue: BannerDestination,
): Promise<BannerMakerDestinationSnapshot> {
  unstable_noStore();
  const destination = parseBannerDestination(destinationValue);
  const definition = getBannerDestination(destination);
  if (!definition) throw new BannerMakerValidationError("Tujuan banner tidak dikenali.");

  const [config, legacyArtwork, legacyText] = await Promise.all([
    readDestinationConfig(definition.configKey),
    destination === "beranda" ? readLegacySource(BANNER_LEGACY_CONFIG_KEY) : Promise.resolve(null),
    readLegacySource(LEGACY_TEXT_CONFIG_KEY),
  ]);

  let bootstrap: BannerBootstrap;
  let configEnvelope: BannerDesignEnvelope | null = null;
  let draftEnvelope: BannerDesignEnvelope | null = null;
  let diagnostic: string | undefined;
  let publicationState: "invalid" | "never-published" | "published" = "never-published";

  if (config) {
    const parsed = parseDestinationConfig(config);
    configEnvelope = parsed.configEnvelope;
    draftEnvelope = parsed.draftEnvelope;
    if (parsed.error) {
      diagnostic = parsed.error;
      const legacyTextBootstrap = createLegacyTextBootstrap(destination, legacyText);
      const textOption = createLegacyTextRecoveryOption(legacyTextBootstrap);
      bootstrap = createUnavailableBootstrap(
        destination,
        parsed.error,
        null,
        textOption ? [textOption] : [],
      );
      publicationState = "invalid";
    } else {
      publicationState = config.publishedAt !== null ? "published" : "never-published";
      const selectedDesign = draftEnvelope?.design ?? parsed.configEnvelope.design;
      if (selectedDesign) {
        bootstrap = {
          design: selectedDesign,
          kind: "valid-design",
          requiresSave: false,
          source: null,
        };
      } else {
        bootstrap = createLegacyTextBootstrap(destination, legacyText);
      }
    }
  } else {
    const draftValue = legacyArtwork?.draftValue;
    const textBootstrap = createLegacyTextBootstrap(destination, legacyText);
    const textOption = createLegacyTextRecoveryOption(textBootstrap);

    if (draftValue !== null && legacyArtwork) {
      try {
        const design = parseBannerDesign(draftValue);
        bootstrap = {
          design,
          kind: "valid-design",
          requiresSave: true,
          source: legacyArtworkSourceDescriptor(legacyArtwork, "draftValue"),
        };
      } catch {
        const published = readLegacyArtworkCandidate(destination, legacyArtwork);
        bootstrap = createUnavailableBootstrap(
          destination,
          "Draf artwork Beranda lama tidak valid. Pilih artwork terbit lama yang valid atau starter teks sebelum menyimpan.",
          legacyArtworkSourceDescriptor(legacyArtwork, "draftValue"),
          [
            ...(published ? [{ design: published.design, kind: "legacy-published" as const, source: published.source }] : []),
            ...(textOption ? [textOption] : []),
          ],
        );
      }
    } else {
      const published = readLegacyArtworkCandidate(destination, legacyArtwork);
      if (published) {
        bootstrap = {
          design: published.design,
          kind: "valid-design",
          requiresSave: true,
          source: published.source,
        };
      } else if (legacyArtwork?.publishedAt !== null && legacyArtwork) {
        bootstrap = createUnavailableBootstrap(
          destination,
          "Artwork Beranda lama yang terbit tidak valid. Pilih starter teks sebelum menyimpan.",
          legacyArtworkSourceDescriptor(legacyArtwork, "configValue"),
          textOption ? [textOption] : [],
        );
      } else {
        bootstrap = textBootstrap;
      }
    }
  }

  const published = !diagnostic && configEnvelope?.design && config?.publishedAt !== null ? configEnvelope.design : null;
  const draft = !diagnostic ? draftEnvelope?.design ?? null : null;
  const hasPublishedDesign = Boolean(published);
  const hasSavedDraft = !diagnostic && Boolean(draftEnvelope);
  const hasUnpublishedChanges = publicationState === "never-published"
    ? hasSavedDraft
    : publicationState === "published" && Boolean(draft && published && !bannerDesignsEqual(draft, published));
  const effectiveDesign = bootstrap.kind === "valid-design" ? bootstrap.design : null;
  const assetIds = [...new Set([
    ...(published ? collectBannerAssetIds(published) : []),
    ...(draft ? collectBannerAssetIds(draft) : []),
    ...(effectiveDesign ? collectBannerAssetIds(effectiveDesign) : []),
  ])];

  return {
    assetUrls: await readBannerAssetViews(assetIds),
    bootstrap,
    configId: config?.id ?? null,
    currentRevision: diagnostic ? null : draftEnvelope?.revision ?? configEnvelope?.revision ?? null,
    design: effectiveDesign,
    destination,
    draft,
    draftRevision: draftEnvelope?.revision ?? null,
    hasPublishedDesign,
    hasSavedDraft,
    hasUnpublishedChanges,
    publicationState,
    published,
    publishedAt: config?.publishedAt?.toISOString() ?? null,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function assertSourceDescriptor(value: BannerSourceDescriptor | null | undefined) {
  if (!value || typeof value !== "object") {
    throw new BannerMakerValidationError("Sumber pemulihan banner tidak tersedia.");
  }
  if (!BANNER_SOURCE_DESCRIPTOR_COLUMNS.has(value.sourceColumn)) {
    throw new BannerMakerValidationError("Kolom sumber pemulihan banner tidak didukung.");
  }
  if (value.kind !== "legacy-artwork" && value.kind !== "legacy-text") {
    throw new BannerMakerValidationError("Jenis sumber pemulihan banner tidak didukung.");
  }
  if (!/^([0-9a-f]{64})$/iu.test(value.digest)) {
    throw new BannerMakerValidationError("Digest sumber pemulihan banner tidak valid.");
  }
  if (value.rowId !== null && !isUuid(value.rowId)) {
    throw new BannerMakerValidationError("Identitas sumber pemulihan banner tidak valid.");
  }
  return value;
}

async function assertLegacySourceUnchanged(
  tx: Prisma.TransactionClient,
  destination: BannerDestination,
  source: BannerSourceDescriptor,
) {
  const descriptor = assertSourceDescriptor(source);
  if (descriptor.kind === "legacy-artwork") {
    if (destination !== "beranda" || descriptor.configKey !== BANNER_LEGACY_CONFIG_KEY) {
      throw new BannerMakerValidationError("Artwork lama hanya dapat dipulihkan untuk Beranda.");
    }
    if (descriptor.sourceColumn !== "configValue" && descriptor.sourceColumn !== "draftValue") {
      throw new BannerMakerValidationError("Kolom artwork lama tidak didukung.");
    }
  } else if (descriptor.configKey !== LEGACY_TEXT_CONFIG_KEY || descriptor.sourceColumn !== "configValue") {
    throw new BannerMakerValidationError("Sumber teks lama tidak didukung.");
  }

  const current = await readLegacySource(descriptor.configKey, tx);
  if (!bannerSourceDescriptorsEqual(current, descriptor)) throw new BannerMakerSourceConflictError();

  if (descriptor.kind === "legacy-artwork") {
    if (!current || (descriptor.sourceColumn === "draftValue" && current.draftValue === null)) {
      throw new BannerMakerRecoveryUnavailableError("Artwork lama yang dipilih sudah tidak tersedia.");
    }
    try {
      parseBannerDesign(current[descriptor.sourceColumn]);
    } catch {
      throw new BannerMakerRecoveryUnavailableError("Artwork lama yang dipilih tidak valid.");
    }
    if (descriptor.sourceColumn === "configValue" && current.publishedAt === null) {
      throw new BannerMakerRecoveryUnavailableError("Artwork lama belum memiliki penanda terbit yang sah.");
    }
  }
}

function parseSubmittedDestinationDesign(design: BannerDesign) {
  try {
    return parseBannerDesign(design);
  } catch (error) {
    if (error instanceof BannerMakerValidationError) throw error;
    throw new BannerMakerValidationError("Desain tujuan banner tidak valid.");
  }
}

function destinationMutationResult({
  config,
  configEnvelope,
  design,
  destination,
  draftEnvelope,
  publishedAt,
}: {
  config: DestinationConfig;
  configEnvelope: BannerDesignEnvelope;
  design: BannerDesign;
  destination: BannerDestination;
  draftEnvelope: BannerDesignEnvelope | null;
  publishedAt: Date | null;
}): BannerMakerDestinationMutationResult {
  const published = publishedAt !== null && configEnvelope.design ? configEnvelope.design : null;
  const hasSavedDraft = Boolean(draftEnvelope?.design);
  return {
    configId: config.id,
    currentRevision: draftEnvelope?.revision ?? configEnvelope.revision,
    design,
    destination,
    hasPublishedDesign: Boolean(published),
    hasSavedDraft,
    hasUnpublishedChanges: publishedAt === null
      ? hasSavedDraft
      : Boolean(draftEnvelope?.design && published && !bannerDesignsEqual(draftEnvelope.design, published)),
    publicationState: publishedAt === null ? "never-published" : "published",
    publishedAt: publishedAt?.toISOString() ?? null,
  };
}

async function saveBannerMakerDestinationDraft({
  actorUserId,
  design,
  destination: destinationValue,
  expectedRevision,
  source,
}: {
  actorUserId: string;
  design: BannerDesign;
  destination: BannerDestination;
  expectedRevision: string | null;
  source?: BannerSourceDescriptor | null;
}) {
  const destination = parseBannerDestination(destinationValue);
  const submittedDesign = parseSubmittedDestinationDesign(design);
  const revision = readUuid(expectedRevision, "Revisi tujuan banner");
  return prisma.$transaction(async (tx) => {
    await acquireBannerMediaMutationLock(tx);

    const definition = getBannerDestination(destination);
    if (!definition) throw new BannerMakerValidationError("Tujuan banner tidak dikenali.");
    const current = await readDestinationConfig(definition.configKey, tx);
    let parsedCurrent: ParsedDestinationConfig | null = null;
    let recoveryConfigEnvelope: BannerDesignEnvelope | null = null;
    let isRecoverySave = false;
    if (current) {
      parsedCurrent = parseDestinationConfig(current);
      if (parsedCurrent.error) {
        if (!source || revision !== null) throw new BannerMakerRecoveryUnavailableError(parsedCurrent.error);
        await assertLegacySourceUnchanged(tx, destination, source);
        isRecoverySave = true;
        recoveryConfigEnvelope = parsedCurrent.publishedError === null
          ? parsedCurrent.configEnvelope
          : createBannerDesignEnvelope(null);
      } else {
        if (readDestinationConfigRevision(current) !== revision) throw new BannerMakerConflictError();

        const isFirstV2Save = parsedCurrent.configEnvelope.design === null
          && parsedCurrent.draftEnvelope === null
          && current.publishedAt === null;
        if (isFirstV2Save) {
          if (!source) throw new BannerMakerValidationError("Pilih sumber starter banner sebelum menyimpan.");
          await assertLegacySourceUnchanged(tx, destination, source);
        }
      }
    } else if (revision !== null) {
      throw new BannerMakerConflictError();
    } else {
      if (!source) throw new BannerMakerValidationError("Pilih sumber starter banner sebelum menyimpan.");
      await assertLegacySourceUnchanged(tx, destination, source);
    }

    await assertBannerAssets(tx, submittedDesign);
    const now = new Date();
    const configEnvelope = recoveryConfigEnvelope ?? parsedCurrent?.configEnvelope ?? createBannerDesignEnvelope(null);
    const draftEnvelope = createBannerDesignEnvelope(submittedDesign);
    let config: DestinationConfig;

    try {
      if (current) {
        config = await tx.systemConfig.update({
          data: {
            ...(isRecoverySave
              ? {
                  configValue: configEnvelope as unknown as Prisma.InputJsonValue,
                  publishedAt: parsedCurrent?.publishedError === null && current.publishedAt !== null
                    ? current.publishedAt
                    : null,
                  publishedByUserId: parsedCurrent?.publishedError === null && current.publishedAt !== null
                    ? current.publishedByUserId
                    : null,
                }
              : {}),
            draftUpdatedAt: now,
            draftUpdatedByUserId: actorUserId,
            draftValue: draftEnvelope as unknown as Prisma.InputJsonValue,
            updatedAt: now,
            updatedByUserId: actorUserId,
          },
          select: {
            configKey: true,
            configValue: true,
            draftUpdatedAt: true,
            draftUpdatedByUserId: true,
            draftValue: true,
            id: true,
            publishedAt: true,
            publishedByUserId: true,
            updatedAt: true,
            updatedByUserId: true,
          },
          where: { id: current.id },
        });
      } else {
        config = await tx.systemConfig.create({
          data: {
            configKey: definition.configKey,
            configValue: configEnvelope as unknown as Prisma.InputJsonValue,
            draftUpdatedAt: now,
            draftUpdatedByUserId: actorUserId,
            draftValue: draftEnvelope as unknown as Prisma.InputJsonValue,
            updatedAt: now,
            updatedByUserId: actorUserId,
          },
          select: {
            configKey: true,
            configValue: true,
            draftUpdatedAt: true,
            draftUpdatedByUserId: true,
            draftValue: true,
            id: true,
            publishedAt: true,
            publishedByUserId: true,
            updatedAt: true,
            updatedByUserId: true,
          },
        });
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new BannerMakerConflictError();
      throw error;
    }

    await tx.auditLog.create({
      data: {
        action: "student_banner_maker_v2_draft_saved",
        actorUserId,
        metadata: {
          action: isRecoverySave ? "recover-draft" : "save-draft",
          destination,
          newRevision: draftEnvelope.revision,
          oldRevision: revision,
          sourceColumn: source?.sourceColumn ?? null,
        },
        targetId: config.id,
        targetType: "system_config",
      },
    });

    return destinationMutationResult({
      config,
      configEnvelope,
      design: submittedDesign,
      destination,
      draftEnvelope,
      publishedAt: config.publishedAt,
    });
  });
}

async function publishBannerMakerDestinationDesign({
  actorUserId,
  design,
  destination: destinationValue,
  expectedRevision,
}: {
  actorUserId: string;
  design: BannerDesign;
  destination: BannerDestination;
  expectedRevision: string | null;
}) {
  const destination = parseBannerDestination(destinationValue);
  const submittedDesign = parseSubmittedDestinationDesign(design);
  const revision = readUuid(expectedRevision, "Revisi tujuan banner");
  return prisma.$transaction(async (tx) => {
    await acquireBannerMediaMutationLock(tx);
    const definition = getBannerDestination(destination);
    if (!definition) throw new BannerMakerValidationError("Tujuan banner tidak dikenali.");
    const current = await readDestinationConfig(definition.configKey, tx);
    if (!current) throw new BannerMakerValidationError("Simpan draf tujuan banner sebelum menerbitkan.");

    const parsed = parseDestinationConfig(current);
    if (parsed.error) throw new BannerMakerRecoveryUnavailableError(parsed.error);
    if (readDestinationConfigRevision(current) !== revision) throw new BannerMakerConflictError();
    if (!parsed.draftEnvelope?.design || !current.draftUpdatedAt) {
      throw new BannerMakerValidationError("Simpan draf tujuan banner sebelum menerbitkan.");
    }
    if (!bannerDesignsEqual(parsed.draftEnvelope.design, submittedDesign)) {
      throw new BannerMakerDraftMismatchError();
    }

    await assertBannerAssets(tx, parsed.draftEnvelope.design);
    const now = new Date();
    const publishedEnvelope = createBannerDesignEnvelope(parsed.draftEnvelope.design);
    const config = await tx.systemConfig.update({
      data: {
        configValue: publishedEnvelope as unknown as Prisma.InputJsonValue,
        draftUpdatedAt: null,
        draftUpdatedByUserId: null,
        draftValue: Prisma.DbNull,
        publishedAt: now,
        publishedByUserId: actorUserId,
        updatedAt: now,
        updatedByUserId: actorUserId,
      },
      select: {
        configKey: true,
        configValue: true,
        draftUpdatedAt: true,
        draftUpdatedByUserId: true,
        draftValue: true,
        id: true,
        publishedAt: true,
        publishedByUserId: true,
        updatedAt: true,
        updatedByUserId: true,
      },
      where: { id: current.id },
    });

    await tx.auditLog.create({
      data: {
        action: "student_banner_maker_v2_published",
        actorUserId,
        metadata: {
          action: "publish",
          destination,
          newRevision: publishedEnvelope.revision,
          oldRevision: revision,
        },
        targetId: config.id,
        targetType: "system_config",
      },
    });

    return destinationMutationResult({
      config,
      configEnvelope: publishedEnvelope,
      design: parsed.draftEnvelope.design,
      destination,
      draftEnvelope: null,
      publishedAt: config.publishedAt,
    });
  });
}

async function getPublishedBannerMakerDestinationDesign(destinationValue: BannerDestination) {
  unstable_noStore();
  const destination = parseBannerDestination(destinationValue);
  const definition = getBannerDestination(destination);
  if (!definition) throw new BannerMakerValidationError("Tujuan banner tidak dikenali.");
  const config = await readDestinationConfig(definition.configKey);
  if (!config) {
    return { destination, diagnostic: null, design: null, revision: null };
  }

  try {
    const parsed = parseDestinationConfig(config);
    if (parsed.publishedError || config.publishedAt === null || parsed.configEnvelope.design === null) {
      return {
        destination,
        diagnostic: parsed.publishedError ?? "Banner belum memiliki publikasi yang sah.",
        design: null,
        revision: null,
      };
    }
    return {
      destination,
      diagnostic: null,
      design: parsed.configEnvelope.design,
      revision: parsed.configEnvelope.revision,
    };
  } catch {
    return {
      destination,
      diagnostic: "Konfigurasi publik v2 banner tidak valid dan memakai fallback lama.",
      design: null,
      revision: null,
    };
  }
}

export {
  getBannerMakerDestinationSnapshot,
  getBannerMakerSnapshot,
  getPublishedBannerMakerDestinationDesign,
  getPublishedBannerMakerDesign,
  publishBannerMakerDestinationDesign,
  publishBannerMakerDesign,
  saveBannerMakerDestinationDraft,
  saveBannerMakerDraft,
};
