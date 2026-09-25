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

class ManagedImageAssetConflictError extends Error {
  constructor(readonly assetIds: readonly string[]) {
    super("Gambar atau folder Media berubah saat disimpan. Muat ulang lalu coba lagi.");
    this.name = "ManagedImageAssetConflictError";
  }
}

type BankImageLockInput = {
  assetIds: readonly (string | null | undefined)[];
  destinationFolderId?: string | null;
  attemptOwnedPendingAssetIds?: readonly string[];
};

type KaptenMediaFolderRow = {
  id: string;
  parentId: string | null;
  trashedAt: Date | null;
};

type FolderAncestryFailure = () => Error;

async function readKaptenFolderAncestries(
  tx: Prisma.TransactionClient,
  folderIds: readonly string[],
  failure: FolderAncestryFailure,
) {
  const rowsById = new Map<string, KaptenMediaFolderRow>();
  let frontier = [...new Set(folderIds)].sort();

  for (let depth = 0; frontier.length; depth += 1) {
    if (depth >= 50) throw failure();
    const rows = await tx.mediaFolder.findMany({
      select: { id: true, parentId: true, trashedAt: true },
      where: {
        id: { in: frontier },
        libraryScope: MediaLibraryScope.kapten,
      },
    });
    if (rows.length !== frontier.length || rows.some((row) => row.trashedAt !== null)) {
      throw failure();
    }
    for (const row of rows) rowsById.set(row.id, row);
    frontier = [...new Set(
      rows.flatMap((row) => row.parentId && !rowsById.has(row.parentId) ? [row.parentId] : []),
    )].sort();
  }

  const ancestryByFolderId = new Map<string, string[]>();
  for (const folderId of [...new Set(folderIds)]) {
    const ancestry: string[] = [];
    const seen = new Set<string>();
    let currentId: string | null = folderId;
    while (currentId) {
      if (seen.has(currentId) || ancestry.length >= 50) throw failure();
      seen.add(currentId);
      const row = rowsById.get(currentId);
      if (!row || row.trashedAt !== null) throw failure();
      ancestry.push(row.id);
      currentId = row.parentId;
    }
    ancestryByFolderId.set(folderId, ancestry);
  }
  return ancestryByFolderId;
}

async function lockKaptenMediaFolders(
  tx: Prisma.TransactionClient,
  folderIds: readonly string[],
  assetIds: readonly string[],
) {
  const ids = [...new Set(folderIds)].sort();
  if (!ids.length) return;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM media_folders
    WHERE id = ANY(${ids}::uuid[])
      AND library_scope = ${MediaLibraryScope.kapten}
      AND trashed_at IS NULL
    ORDER BY id
    FOR UPDATE
  `;
  if (rows.length !== ids.length) throw new ManagedImageAssetConflictError(assetIds);
}

async function lockKaptenAssets(
  tx: Prisma.TransactionClient,
  assetIds: readonly string[],
) {
  if (!assetIds.length) return;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM assets
    WHERE id = ANY(${assetIds}::uuid[])
    ORDER BY id
    FOR UPDATE
  `;
  if (rows.length !== assetIds.length) throw new ManagedImageAssetConflictError(assetIds);
}

/**
 * Lock every active Kapten folder in the current ancestry of these question
 * images, then lock their Asset rows. Re-read both chains and Asset readiness
 * while the locks are held so Media trash and moves serialize with Bank writes.
 * Only explicitly attempt-owned pending Assets can be promoted.
 */
async function lockAndValidateKaptenBankImages(
  tx: Prisma.TransactionClient,
  input: BankImageLockInput,
) {
  const assetIds = [...new Set(input.assetIds.filter((id): id is string => Boolean(id)))].sort();
  const pendingAssetIds = [...new Set(input.attemptOwnedPendingAssetIds ?? [])].sort();
  const pendingIdsAreValid = pendingAssetIds.every(
    (id) => UUID_PATTERN.test(id) && assetIds.includes(id),
  );
  if (
    assetIds.some((id) => !UUID_PATTERN.test(id))
    || !pendingIdsAreValid
    || (input.destinationFolderId !== undefined
      && input.destinationFolderId !== null
      && !UUID_PATTERN.test(input.destinationFolderId))
    || (pendingAssetIds.length > 0 && !input.destinationFolderId)
  ) {
    throw new ManagedImageAssetValidationError(assetIds);
  }

  const destinationFolderId = input.destinationFolderId ?? null;
  if (!assetIds.length && !destinationFolderId) return;

  const discoveredAssets = await tx.asset.findMany({
    orderBy: { id: "asc" },
    select: { folderId: true, id: true, libraryScope: true },
    where: { id: { in: assetIds } },
  });
  if (
    discoveredAssets.length !== assetIds.length
    || discoveredAssets.some((asset) => asset.libraryScope !== MediaLibraryScope.kapten)
  ) {
    throw new ManagedImageAssetValidationError(assetIds);
  }

  const discoveredFolderByAssetId = new Map(
    discoveredAssets.map((asset) => [asset.id, asset.folderId]),
  );
  const folderLeaves = [
    ...discoveredAssets.flatMap((asset) => asset.folderId ? [asset.folderId] : []),
    ...(destinationFolderId ? [destinationFolderId] : []),
  ];
  const discoveredAncestries = await readKaptenFolderAncestries(
    tx,
    folderLeaves,
    () => new ManagedImageAssetValidationError(assetIds),
  );
  const folderIdsToLock = [...new Set([...discoveredAncestries.values()].flat())].sort();

  await lockKaptenMediaFolders(tx, folderIdsToLock, assetIds);
  await lockKaptenAssets(tx, assetIds);

  const currentAssets = await tx.asset.findMany({
    orderBy: { id: "asc" },
    select: {
      folderId: true,
      id: true,
      libraryScope: true,
      mimeType: true,
      state: true,
      trashedAt: true,
    },
    where: { id: { in: assetIds } },
  });
  if (currentAssets.length !== assetIds.length) {
    throw new ManagedImageAssetConflictError(assetIds);
  }
  if (currentAssets.some((asset) => discoveredFolderByAssetId.get(asset.id) !== asset.folderId)) {
    throw new ManagedImageAssetConflictError(assetIds);
  }

  const currentFolderLeaves = [
    ...currentAssets.flatMap((asset) => asset.folderId ? [asset.folderId] : []),
    ...(destinationFolderId ? [destinationFolderId] : []),
  ];
  const currentAncestries = await readKaptenFolderAncestries(
    tx,
    currentFolderLeaves,
    () => new ManagedImageAssetConflictError(assetIds),
  );
  for (const [folderId, ancestry] of discoveredAncestries) {
    const currentAncestry = currentAncestries.get(folderId);
    if (!currentAncestry || ancestry.length !== currentAncestry.length
      || ancestry.some((id, index) => id !== currentAncestry[index])) {
      throw new ManagedImageAssetConflictError(assetIds);
    }
  }

  const pendingIds = new Set(pendingAssetIds);
  const valid = currentAssets.every((asset) =>
    asset.libraryScope === MediaLibraryScope.kapten
    && isImageMimeType(asset.mimeType)
    && asset.trashedAt === null
    && (pendingIds.has(asset.id)
      ? asset.state === MediaAssetState.pending && asset.folderId === destinationFolderId
      : asset.state === MediaAssetState.ready),
  );
  if (!valid) throw new ManagedImageAssetValidationError(assetIds);

  if (pendingAssetIds.length) {
    const promoted = await tx.asset.updateMany({
      data: { state: MediaAssetState.ready },
      where: {
        folderId: destinationFolderId,
        id: { in: pendingAssetIds },
        libraryScope: MediaLibraryScope.kapten,
        state: MediaAssetState.pending,
        trashedAt: null,
      },
    });
    if (promoted.count !== pendingAssetIds.length) {
      throw new ManagedImageAssetConflictError(pendingAssetIds);
    }
  }
}

/** Find every persisted legacy, current, or historical Bank question image reference. */
async function findQuestionBankImageReferences(
  tx: Prisma.TransactionClient,
  assetIds: readonly string[],
) {
  const ids = [...new Set(assetIds)].sort();
  if (!ids.length) return [];
  const rows = await tx.$queryRaw<Array<{ assetId: string }>>`
    SELECT DISTINCT bank_image_refs.asset_id AS "assetId"
    FROM (
      SELECT q.prompt_asset_id AS asset_id
      FROM questions q
      WHERE q.question_bank_id IS NOT NULL
      UNION ALL
      SELECT q.explanation_asset_id AS asset_id
      FROM questions q
      WHERE q.question_bank_id IS NOT NULL
      UNION ALL
      SELECT qo.asset_id
      FROM question_options qo
      JOIN questions q ON q.id = qo.question_id
      WHERE q.question_bank_id IS NOT NULL
      UNION ALL
      SELECT qr.prompt_asset_id AS asset_id
      FROM question_revisions qr
      JOIN questions q ON q.id = qr.question_id
      WHERE q.question_bank_id IS NOT NULL
      UNION ALL
      SELECT qr.explanation_asset_id AS asset_id
      FROM question_revisions qr
      JOIN questions q ON q.id = qr.question_id
      WHERE q.question_bank_id IS NOT NULL
      UNION ALL
      SELECT qro.asset_id
      FROM question_revision_options qro
      JOIN question_revisions qr ON qr.id = qro.question_revision_id
      JOIN questions q ON q.id = qr.question_id
      WHERE q.question_bank_id IS NOT NULL
    ) AS bank_image_refs
    WHERE bank_image_refs.asset_id = ANY(${ids}::uuid[])
    ORDER BY bank_image_refs.asset_id
  `;
  return rows.map((row) => row.assetId);
}

export {
  findQuestionBankImageReferences,
  lockAndValidateKaptenBankImages,
  ManagedImageAssetConflictError,
  ManagedImageAssetValidationError,
};
