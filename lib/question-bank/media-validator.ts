import "server-only";

import {
  MediaAssetState,
  MediaLibraryScope,
  Prisma,
} from "@/generated/prisma/client";
import { isImageMimeType } from "@/lib/media/domain";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ManagedImageAssetValidationError extends Error {
  constructor(readonly assetIds: readonly string[]) {
    super("Semua media soal harus berupa gambar Kapten yang siap digunakan.");
    this.name = "ManagedImageAssetValidationError";
  }
}

/**
 * Validate all question media in one transaction-scoped query before a Bank
 * mutation writes anything. The question-bank authoring contract accepts only
 * ready, untrashed Kapten image assets; the database remains authoritative for
 * scope, lifecycle, and MIME type.
 */
async function assertReadyKaptenImageAssets(
  tx: Prisma.TransactionClient,
  assetIds: readonly (string | null | undefined)[],
) {
  const uniqueIds = [...new Set(assetIds.filter((id): id is string => Boolean(id)))];
  if (!uniqueIds.length) return [];
  if (uniqueIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new ManagedImageAssetValidationError(uniqueIds);
  }

  const assets = await tx.asset.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      libraryScope: true,
      mimeType: true,
      state: true,
      trashedAt: true,
    },
  });
  const valid = assets.length === uniqueIds.length && assets.every(
    (asset) =>
      asset.libraryScope === MediaLibraryScope.kapten &&
      asset.state === MediaAssetState.ready &&
      asset.trashedAt === null &&
      isImageMimeType(asset.mimeType),
  );
  if (!valid) throw new ManagedImageAssetValidationError(uniqueIds);
  return assets;
}

export { assertReadyKaptenImageAssets, ManagedImageAssetValidationError };
