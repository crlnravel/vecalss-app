import "server-only";

import sharp from "sharp";

import {
  MediaAssetState,
  MediaLibraryScope,
  RoleName,
  type Prisma,
} from "@/generated/prisma/client";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import {
  acquireBannerMediaMutationLock,
  assertBannerAssetsMayBeTrashed,
  BannerReferenceInUseError,
  BannerReferenceSafetyUnknownError,
} from "@/lib/banner/media-safety";
import { prisma } from "@/lib/prisma";
import { findQuestionBankImageReferences } from "@/lib/question-bank/media-validator";
import { setTransactionLockTimeout } from "@/lib/serialization/locks";
import {
  assertAuthoringEditLease,
  type AuthoringEditLease,
} from "@/lib/serialization/authoring-lease";
import { EditLeaseServiceError } from "@/lib/resource-edit-lock/service";

import {
  buildMediaObjectKey,
  imageMediaMimeTypes,
  isImageMimeType,
  isPdfMimeType,
  isSupportedMediaMimeType,
  normalizeMediaFileName,
  validateMediaUpload,
  type MediaScope,
} from "./domain";
import {
  R2ConfigurationError,
  createMediaPreviewUrl,
  createMediaUploadUrl,
  headMediaObject,
  isR2Configured,
  readMediaObject,
} from "./r2";
import type {
  MediaAssetDto,
  MediaBreadcrumbDto,
  MediaFolderDto,
  MediaLibrarySnapshot,
  MediaUploadTicket,
} from "./types";

class MediaServiceError extends Error {
  status: number;
  readonly code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "MediaServiceError";
    this.status = status;
    this.code = code;
  }
}

function rethrowBannerSafetyError(error: unknown): void {
  if (error instanceof BannerReferenceInUseError || error instanceof BannerReferenceSafetyUnknownError) {
    throw new MediaServiceError(error.message, error.status);
  }
}

async function assertKaptenBankImagesMayBeTrashed(
  tx: Prisma.TransactionClient,
  assetIds: readonly string[],
  target: "asset" | "folder",
) {
  const referencedAssetIds = await findQuestionBankImageReferences(tx, assetIds);
  if (!referencedAssetIds.length) return;
  const message = target === "asset"
    ? "Gambar ini masih dipakai oleh soal di Bank Soal, jadi tidak bisa dihapus."
    : "Folder ini masih berisi gambar yang dipakai oleh soal di Bank Soal, jadi tidak bisa dihapus.";
  throw new MediaServiceError(message, 409, "in_use");
}

async function assertQuizImagesMayBeTrashed(
  tx: Prisma.TransactionClient,
  assetIds: readonly string[],
  target: "asset" | "folder",
) {
  const uniqueIds = [...new Set(assetIds)];
  if (!uniqueIds.length) return;

  // Legacy items and every versioned Kuis draft/active snapshot share this
  // table. Their option media lives on the related option rows.
  const referencedItem = await tx.standaloneQuizItem.findFirst({
    where: {
      OR: [
        { promptAssetId: { in: uniqueIds } },
        { explanationAssetId: { in: uniqueIds } },
        { options: { some: { assetId: { in: uniqueIds } } } },
      ],
    },
    select: { id: true },
  });
  if (!referencedItem) return;

  const message = target === "asset"
    ? "Gambar ini masih dipakai oleh soal di Kuis, jadi tidak bisa dipindahkan ke sampah."
    : "Folder ini berisi gambar yang masih dipakai oleh Kuis, jadi tidak bisa dipindahkan ke sampah.";
  throw new MediaServiceError(message, 409, "in_use");
}

async function assertTryoutImagesMayBeTrashed(
  tx: Prisma.TransactionClient,
  assetIds: readonly string[],
  target: "asset" | "folder",
) {
  const uniqueIds = [...new Set(assetIds)];
  if (!uniqueIds.length) return;

  const referencedItem = await tx.tryoutItem.findFirst({
    where: {
      OR: [
        { promptAssetId: { in: uniqueIds } },
        { explanationAssetId: { in: uniqueIds } },
        { options: { some: { assetId: { in: uniqueIds } } } },
      ],
    },
    select: { id: true },
  });
  if (!referencedItem) return;

  const message = target === "asset"
    ? "Gambar ini masih dipakai oleh soal di Tryout, jadi tidak bisa dipindahkan ke sampah."
    : "Folder ini berisi gambar yang masih dipakai Tryout, jadi tidak bisa dipindahkan ke sampah.";
  throw new MediaServiceError(message, 409, "in_use");
}

const scopeToDatabase = (scope: MediaScope) =>
  scope === "kapten" ? MediaLibraryScope.kapten : MediaLibraryScope.admin;

const requireMediaSession = async (scope: MediaScope) => {
  const session = await getSessionContext();

  if (!session) {
    throw new MediaServiceError("Sesi Anda sudah berakhir. Silakan masuk kembali.", 401);
  }

  const requiredRole = scope === "kapten" ? RoleName.tutor : RoleName.admin;

  if (!hasRole(session, requiredRole)) {
    throw new MediaServiceError("Kamu tidak memiliki akses ke pustaka media ini.", 403);
  }

  return session;
};

const normalizeNullableId = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new MediaServiceError("Folder tujuan tidak valid.");
  }
  return value;
};

const validateFolderName = (value: unknown) => {
  if (typeof value !== "string") {
    throw new MediaServiceError("Nama folder tidak valid.");
  }

  const name = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!name) throw new MediaServiceError("Nama folder tidak boleh kosong.");
  if (name.length > 160) throw new MediaServiceError("Nama folder terlalu panjang.");
  return name;
};

type MediaDatabaseClient = Pick<Prisma.TransactionClient, "asset" | "mediaFolder">;

type MediaLeaseRow = {
  expiresAt: Date;
  releasedAt: Date | null;
  resourceId: string;
  resourceType: string;
};

type MediaMutationLease = {
  actorUserId?: string;
  editLease?: AuthoringEditLease;
};

async function assertKaptenMediaLease(
  tx: Prisma.TransactionClient,
  scope: MediaScope,
  resourceType: "media_asset" | "media_folder",
  resourceId: string,
  lease: MediaMutationLease,
) {
  if (scope !== "kapten") return;
  await assertAuthoringEditLease(
    tx,
    { resourceId, resourceType },
    lease.actorUserId ?? "",
    lease.editLease,
  );
}

async function lockMediaFolderRows(
  tx: Prisma.TransactionClient,
  scope: MediaScope,
  folderIds: readonly string[],
) {
  const ids = [...new Set(folderIds)].sort();
  if (!ids.length) return;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM media_folders
    WHERE id = ANY(${ids}::uuid[])
      AND library_scope = ${scopeToDatabase(scope)}
      AND trashed_at IS NULL
    ORDER BY id
    FOR UPDATE
  `;
  if (rows.length !== ids.length) {
    throw new MediaServiceError("Struktur folder berubah saat diproses. Coba lagi.", 409);
  }
}

async function lockMediaAssetRows(
  tx: Prisma.TransactionClient,
  scope: MediaScope,
  folderIds: readonly string[],
  assetId?: string,
) {
  if (assetId) {
    await tx.$queryRaw`
      SELECT id
      FROM assets
      WHERE id = ${assetId}::uuid
        AND library_scope = ${scopeToDatabase(scope)}
      FOR UPDATE
    `;
    return;
  }
  const ids = [...new Set(folderIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw`
    SELECT id
    FROM assets
    WHERE folder_id = ANY(${ids}::uuid[])
      AND library_scope = ${scopeToDatabase(scope)}
    ORDER BY id
    FOR UPDATE
  `;
}

async function lockMediaLeaseRows(
  tx: Prisma.TransactionClient,
  folderIds: readonly string[],
  assetIds: readonly string[],
) {
  const folders = [...new Set(folderIds)].sort();
  const assets = [...new Set(assetIds)].sort();
  if (!folders.length && !assets.length) return [] as MediaLeaseRow[];
  return tx.$queryRaw<MediaLeaseRow[]>`
    SELECT
      expires_at AS "expiresAt",
      released_at AS "releasedAt",
      resource_id AS "resourceId",
      resource_type::text AS "resourceType"
    FROM edit_leases
    WHERE (
      resource_type = 'media_folder'::edit_lease_resource_type
      AND resource_id = ANY(${folders}::text[])
    ) OR (
      resource_type = 'media_asset'::edit_lease_resource_type
      AND resource_id = ANY(${assets}::text[])
    )
    ORDER BY resource_type::text, resource_id
    FOR UPDATE
  `;
}

async function databaseMediaNow(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ serverNow: Date }>>`
    SELECT clock_timestamp() AS "serverNow"
  `;
  return rows[0]?.serverNow ?? new Date();
}

async function assertNoActiveDescendantMediaLeases(
  tx: Prisma.TransactionClient,
  rootFolderId: string,
  leaseRows: readonly MediaLeaseRow[],
) {
  const now = await databaseMediaNow(tx);
  const blocked = leaseRows.some((lease) =>
    lease.releasedAt === null
    && lease.expiresAt.getTime() > now.getTime()
    && !(lease.resourceType === "media_folder" && lease.resourceId === rootFolderId));
  if (blocked) {
    throw new EditLeaseServiceError(
      "resource_locked",
      409,
      "Folder memiliki media turunan yang sedang diedit. Coba lagi setelah perubahan selesai.",
    );
  }
}

async function prepareMediaFolderMutation(
  tx: Prisma.TransactionClient,
  scope: MediaScope,
  rootFolderId: string,
  lease: MediaMutationLease,
  additionalFolderIds: readonly string[] = [],
) {
  await assertKaptenMediaLease(tx, scope, "media_folder", rootFolderId, lease);
  const ancestry = await readActiveFolderAncestry(scope, rootFolderId, tx);
  const subtreeIds = await getFolderSubtreeIds(scope, rootFolderId, tx);
  const destinationIds = [...new Set(additionalFolderIds)].filter((id) => !subtreeIds.includes(id));
  await lockMediaFolderRows(tx, scope, [...subtreeIds, ...destinationIds]);

  const rereadSubtreeIds = await getFolderSubtreeIds(scope, rootFolderId, tx);
  if (rereadSubtreeIds.length !== subtreeIds.length || rereadSubtreeIds.some((id) => !subtreeIds.includes(id))) {
    throw new MediaServiceError("Struktur folder berubah saat diproses. Coba lagi.", 409);
  }

  const affectedAssets = await tx.asset.findMany({
    select: { id: true },
    where: { folderId: { in: subtreeIds }, libraryScope: scopeToDatabase(scope) },
    orderBy: { id: "asc" },
  });
  const leaseRows = await lockMediaLeaseRows(tx, subtreeIds, affectedAssets.map(({ id }) => id));
  await assertNoActiveDescendantMediaLeases(tx, rootFolderId, leaseRows);
  return { ancestry, affectedAssets, subtreeIds };
}

const assertFolder = async (
  scope: MediaScope,
  folderId: string | null,
  db: MediaDatabaseClient = prisma,
) => {
  if (!folderId) return null;

  const folder = await db.mediaFolder.findFirst({
    where: {
      id: folderId,
      libraryScope: scopeToDatabase(scope),
      trashedAt: null,
    },
  });

  if (!folder) {
    throw new MediaServiceError("Folder tidak ditemukan.", 404);
  }

  return folder;
};

const readActiveFolderAncestry = async (
  scope: MediaScope,
  folderId: string | null,
  db: MediaDatabaseClient,
) => {
  const ids: string[] = [];
  const seen = new Set<string>();
  let currentId = folderId;

  while (currentId) {
    if (seen.has(currentId) || seen.size >= 50) {
      throw new MediaServiceError("Struktur folder tidak valid.", 409);
    }
    seen.add(currentId);

    const folder = await db.mediaFolder.findFirst({
      select: { id: true, parentId: true, trashedAt: true },
      where: { id: currentId, libraryScope: scopeToDatabase(scope) },
    });
    if (!folder || folder.trashedAt !== null) {
      throw new MediaServiceError("Folder tidak ditemukan atau sudah dihapus.", 409);
    }

    ids.push(folder.id);
    currentId = folder.parentId;
  }

  return ids;
};

const getFolderBreadcrumbs = async (
  scope: MediaScope,
  folderId: string | null,
): Promise<MediaBreadcrumbDto[]> => {
  const breadcrumbs: MediaBreadcrumbDto[] = [
    { id: null, name: scope === "kapten" ? "Media Kapten" : "Media Admin" },
  ];
  let currentId = folderId;
  const seen = new Set<string>();

  while (currentId) {
    if (seen.has(currentId) || seen.size > 50) {
      throw new MediaServiceError("Struktur folder tidak valid.", 409);
    }
    seen.add(currentId);

    const folder = await prisma.mediaFolder.findFirst({
      select: { id: true, name: true, parentId: true },
      where: {
        id: currentId,
        libraryScope: scopeToDatabase(scope),
        trashedAt: null,
      },
    });

    if (!folder) throw new MediaServiceError("Folder tidak ditemukan.", 404);
    breadcrumbs.splice(1, 0, { id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }

  return breadcrumbs;
};

const toFolderDto = (folder: {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: Date;
}): MediaFolderDto => ({
  id: folder.id,
  name: folder.name,
  parentId: folder.parentId,
  updatedAt: folder.updatedAt.toISOString(),
});

const toAssetDto = async (asset: {
  createdAt: Date;
  folderId: string | null;
  height: number | null;
  id: string;
  mimeType: string;
  objectKey: string | null;
  originalName: string | null;
  sizeBytes: number;
  state: MediaAssetState;
  updatedAt: Date;
  uploadedBy: { fullName: string } | null;
  url: string | null;
  width: number | null;
}, scope: MediaScope): Promise<MediaAssetDto> => {
  let previewUrl = asset.url;
  let thumbnailUrl = isImageMimeType(asset.mimeType) ? asset.url : null;

  if (asset.objectKey && isR2Configured()) {
    previewUrl = null;
    thumbnailUrl = isImageMimeType(asset.mimeType)
      ? `/api/media/${scope}/assets/${asset.id}/thumbnail`
      : null;
  }

  return {
    createdAt: asset.createdAt.toISOString(),
    height: asset.height,
    id: asset.id,
    mimeType: asset.mimeType,
    name: asset.originalName || (isPdfMimeType(asset.mimeType) ? "Dokumen PDF tanpa nama" : "Gambar tanpa nama"),
    parentId: asset.folderId,
    previewUrl,
    thumbnailUrl,
    sizeBytes: asset.sizeBytes,
    state: asset.state,
    updatedAt: asset.updatedAt.toISOString(),
    uploadedBy: asset.uploadedBy?.fullName ?? "Pengguna Vecalss",
    width: asset.width,
  };
};

const listMediaLibrary = async ({
  folderId,
  mimeTypes,
  query,
  scope,
}: {
  folderId: string | null;
  mimeTypes?: readonly string[];
  query: string;
  scope: MediaScope;
}): Promise<MediaLibrarySnapshot> => {
  await assertFolder(scope, folderId);
  const databaseScope = scopeToDatabase(scope);
  const normalizedQuery = query.trim();
  const isSearching = normalizedQuery.length > 0;
  const scopedMimeTypes = scope === "admin"
    ? mimeTypes?.filter((mimeType) => isImageMimeType(mimeType))
      ?? imageMediaMimeTypes
    : mimeTypes;
  const assetWhere: Prisma.AssetWhereInput = {
    libraryScope: databaseScope,
    state: MediaAssetState.ready,
    ...(scopedMimeTypes ? { mimeType: { in: [...scopedMimeTypes] } } : {}),
    ...(isSearching
      ? { originalName: { contains: normalizedQuery, mode: "insensitive" } }
      : { folderId }),
  };

  const [folders, moveTargets, assets, breadcrumbs] = await Promise.all([
    isSearching
      ? Promise.resolve([])
      : prisma.mediaFolder.findMany({
        orderBy: [{ name: "asc" }],
        where: { libraryScope: databaseScope, parentId: folderId, trashedAt: null },
      }),
    prisma.mediaFolder.findMany({
      orderBy: [{ name: "asc" }],
      where: { libraryScope: databaseScope, trashedAt: null },
    }),
    prisma.asset.findMany({
      include: { uploadedBy: { select: { fullName: true } } },
      orderBy: [{ updatedAt: "desc" }, { originalName: "asc" }],
      take: 200,
      where: assetWhere,
    }),
    getFolderBreadcrumbs(scope, folderId),
  ]);

  return {
    assets: await Promise.all(assets.map((asset) => toAssetDto(asset, scope))),
    breadcrumbs,
    currentFolderId: folderId,
    folders: folders.map(toFolderDto),
    isStorageConfigured: isR2Configured(),
    moveTargets: moveTargets.map(toFolderDto),
    scope,
  };
};

const createMediaFolder = async ({
  createdByUserId,
  name,
  parentId,
  scope,
}: {
  createdByUserId: string;
  name: unknown;
  parentId: unknown;
  scope: MediaScope;
}) => {
  const safeName = validateFolderName(name);
  const safeParentId = normalizeNullableId(parentId);

  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await readActiveFolderAncestry(scope, safeParentId, tx);

    const duplicate = await tx.mediaFolder.findFirst({
      select: { id: true },
      where: {
        libraryScope: scopeToDatabase(scope),
        name: { equals: safeName, mode: "insensitive" },
        parentId: safeParentId,
        trashedAt: null,
      },
    });

    if (duplicate) {
      throw new MediaServiceError("Nama folder sudah digunakan di lokasi ini.", 409);
    }

    const folder = await tx.mediaFolder.create({
      data: {
        createdByUserId,
        libraryScope: scopeToDatabase(scope),
        name: safeName,
        parentId: safeParentId,
      },
    });

    return toFolderDto(folder);
  });
};

const assertFolderMove = async ({
  db,
  folderId,
  parentId,
  scope,
}: {
  db: MediaDatabaseClient;
  folderId: string;
  parentId: string | null;
  scope: MediaScope;
}) => {
  await readActiveFolderAncestry(scope, folderId, db);
  const destinationAncestry = await readActiveFolderAncestry(scope, parentId, db);
  if (folderId === parentId) {
    throw new MediaServiceError("Folder tidak dapat dipindahkan ke dalam dirinya sendiri.");
  }

  if (destinationAncestry.includes(folderId)) {
    throw new MediaServiceError("Folder tidak dapat dipindahkan ke turunannya.");
  }
};

const renameMediaFolder = async ({
  actorUserId,
  editLease,
  folderId,
  name,
  scope,
}: {
  actorUserId?: string;
  editLease?: AuthoringEditLease;
  folderId: string;
  name: unknown;
  scope: MediaScope;
}) => {
  const safeName = validateFolderName(name);

  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await readActiveFolderAncestry(scope, folderId, tx);
    await prepareMediaFolderMutation(tx, scope, folderId, { actorUserId, editLease });
    const folder = await tx.mediaFolder.findUnique({
      select: { parentId: true },
      where: { id: folderId },
    });
    if (!folder) throw new MediaServiceError("Folder tidak ditemukan.", 404);

    const duplicate = await tx.mediaFolder.findFirst({
      select: { id: true },
      where: {
        id: { not: folderId },
        libraryScope: scopeToDatabase(scope),
        name: { equals: safeName, mode: "insensitive" },
        parentId: folder.parentId,
        trashedAt: null,
      },
    });
    if (duplicate) throw new MediaServiceError("Nama folder sudah digunakan di lokasi ini.", 409);

    return toFolderDto(await tx.mediaFolder.update({
      data: { name: safeName },
      where: { id: folderId },
    }));
  });
};

const moveMediaFolder = async ({
  actorUserId,
  editLease,
  folderId,
  parentId,
  scope,
}: {
  actorUserId?: string;
  editLease?: AuthoringEditLease;
  folderId: string;
  parentId: unknown;
  scope: MediaScope;
}) => {
  const safeParentId = normalizeNullableId(parentId);
  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await assertFolderMove({ db: tx, folderId, parentId: safeParentId, scope });
    const destinationAncestry = await readActiveFolderAncestry(scope, safeParentId, tx);
    await prepareMediaFolderMutation(tx, scope, folderId, { actorUserId, editLease }, destinationAncestry);
    await assertFolderMove({ db: tx, folderId, parentId: safeParentId, scope });
    return toFolderDto(await tx.mediaFolder.update({
      data: { parentId: safeParentId },
      where: { id: folderId },
    }));
  });
};

const getFolderSubtreeIds = async (scope: MediaScope, rootId: string, db: MediaDatabaseClient) => {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await db.mediaFolder.findMany({
      select: { id: true },
      where: {
        libraryScope: scopeToDatabase(scope),
        parentId: { in: frontier },
        trashedAt: null,
      },
      orderBy: { id: "asc" },
    });
    frontier = children.reduce<string[]>((nextFrontier, folder) => {
      if (!ids.includes(folder.id)) nextFrontier.push(folder.id);
      return nextFrontier;
    }, []);
    ids.push(...frontier);
    if (ids.length > 10_000) throw new MediaServiceError("Folder terlalu besar untuk diproses.", 409);
  }

  return ids;
};

/**
 * Completes the system-managed rename of a draft Bank folder. The exact
 * expected name check happens under the normal Media mutation lock so a
 * Kapten rename that wins the race is preserved. Active Media edit leases
 * defer the rename; a later Bank save can retry it.
 */
const renameQuestionBankMediaFolderIfUnchanged = async ({
  candidateNames,
  bankCode,
  bankId,
  bankName,
  expectedName,
  folderId,
}: {
  candidateNames: readonly string[];
  bankCode: string;
  bankId: string;
  bankName: string;
  expectedName: string;
  folderId: string;
}) => {
  const safeExpectedName = validateFolderName(expectedName);
  const safeCandidates = [...new Set(candidateNames.map(validateFolderName))];

  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${bankId}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({
      select: { code: true, mediaFolderId: true, name: true },
      where: { id: bankId },
    });
    if (
      !bank
      || bank.mediaFolderId !== folderId
      || bank.name !== bankName
      || bank.code !== bankCode
    ) {
      return { renamed: false };
    }

    const current = await tx.mediaFolder.findFirst({
      where: {
        id: folderId,
        libraryScope: MediaLibraryScope.kapten,
        trashedAt: null,
      },
    });
    if (!current || current.name !== safeExpectedName) return { renamed: false };

    const subtreeIds = await getFolderSubtreeIds("kapten", folderId, tx);
    await lockMediaFolderRows(tx, "kapten", subtreeIds);
    const rereadSubtreeIds = await getFolderSubtreeIds("kapten", folderId, tx);
    if (
      rereadSubtreeIds.length !== subtreeIds.length
      || rereadSubtreeIds.some((id) => !subtreeIds.includes(id))
    ) {
      return { renamed: false };
    }

    const affectedAssets = await tx.asset.findMany({
      select: { id: true },
      where: {
        folderId: { in: subtreeIds },
        libraryScope: MediaLibraryScope.kapten,
      },
      orderBy: { id: "asc" },
    });
    const leaseRows = await lockMediaLeaseRows(
      tx,
      subtreeIds,
      affectedAssets.map(({ id }) => id),
    );
    const now = await databaseMediaNow(tx);
    if (leaseRows.some((lease) =>
      lease.releasedAt === null && lease.expiresAt.getTime() > now.getTime()
    )) {
      return { renamed: false };
    }

    const lockedCurrent = await tx.mediaFolder.findFirst({
      where: {
        id: folderId,
        libraryScope: MediaLibraryScope.kapten,
        trashedAt: null,
      },
    });
    if (!lockedCurrent || lockedCurrent.name !== safeExpectedName) return { renamed: false };

    for (const candidate of safeCandidates) {
      const duplicate = await tx.mediaFolder.findFirst({
        select: { id: true },
        where: {
          id: { not: folderId },
          libraryScope: MediaLibraryScope.kapten,
          name: { equals: candidate, mode: "insensitive" },
          parentId: lockedCurrent.parentId,
          trashedAt: null,
        },
      });
      if (duplicate) continue;

      await tx.mediaFolder.update({
        data: { name: candidate },
        where: { id: folderId },
      });
      return { renamed: true };
    }

    return { renamed: false };
  });
};

const trashMediaFolder = async (
  scope: MediaScope,
  folderId: string,
  actorUserId?: string,
  editLease?: AuthoringEditLease,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      await setTransactionLockTimeout(tx);
      await acquireBannerMediaMutationLock(tx);
      await readActiveFolderAncestry(scope, folderId, tx);
      const { affectedAssets, subtreeIds: ids } = await prepareMediaFolderMutation(tx, scope, folderId, { actorUserId, editLease });
      await lockMediaAssetRows(tx, scope, ids);
      if (scope === "admin") {
        await assertBannerAssetsMayBeTrashed(tx, affectedAssets.map(({ id }) => id));
      } else {
        await assertKaptenBankImagesMayBeTrashed(
          tx,
          affectedAssets.map(({ id }) => id),
          "folder",
        );
      }
      await assertQuizImagesMayBeTrashed(
        tx,
        affectedAssets.map(({ id }) => id),
        "folder",
      );
      await assertTryoutImagesMayBeTrashed(
        tx,
        affectedAssets.map(({ id }) => id),
        "folder",
      );

      const trashedAt = new Date();
      await tx.asset.updateMany({
        data: { state: MediaAssetState.trashed, trashedAt },
        where: {
          folderId: { in: ids },
          libraryScope: scopeToDatabase(scope),
          state: { in: [MediaAssetState.pending, MediaAssetState.ready] },
          trashedAt: null,
        },
      });
      const updatedFolders = await tx.mediaFolder.updateMany({
        data: { trashedAt },
        where: { id: { in: ids }, libraryScope: scopeToDatabase(scope), trashedAt: null },
      });
      if (updatedFolders.count !== ids.length) {
        throw new MediaServiceError("Struktur folder berubah saat diproses. Coba lagi.", 409);
      }
    });
  } catch (error) {
    rethrowBannerSafetyError(error);
    throw error;
  }
};

const assertAsset = async (
  scope: MediaScope,
  assetId: string,
  states: MediaAssetState[] = [MediaAssetState.ready],
  db: MediaDatabaseClient = prisma,
) => {
  const asset = await db.asset.findFirst({
    where: {
      id: assetId,
      libraryScope: scopeToDatabase(scope),
      state: { in: states },
    },
  });
  if (!asset) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
  return asset;
};

const renameMediaAsset = async ({
  actorUserId,
  editLease,
  assetId,
  name,
  scope,
}: {
  actorUserId?: string;
  editLease?: AuthoringEditLease;
  assetId: string;
  name: unknown;
  scope: MediaScope;
}) => {
  if (typeof name !== "string" || !name.trim()) {
    throw new MediaServiceError("Nama gambar tidak boleh kosong.");
  }
  const safeName = normalizeMediaFileName(name);

  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await assertKaptenMediaLease(tx, scope, "media_asset", assetId, { actorUserId, editLease });
    const asset = await assertAsset(scope, assetId, [MediaAssetState.ready], tx);
    if (asset.trashedAt) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
    const folderAncestry = await readActiveFolderAncestry(scope, asset.folderId, tx);
    await lockMediaFolderRows(tx, scope, folderAncestry);
    await lockMediaAssetRows(tx, scope, [], assetId);
    const current = await assertAsset(scope, assetId, [MediaAssetState.ready], tx);
    if (current.trashedAt) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
    const updated = await tx.asset.updateMany({
      data: { originalName: safeName },
      where: {
        id: assetId,
        libraryScope: scopeToDatabase(scope),
        state: MediaAssetState.ready,
        trashedAt: null,
      },
    });
    if (updated.count !== 1) throw new MediaServiceError("Gambar berubah saat diproses. Coba lagi.", 409);
  });
};

const moveMediaAsset = async ({
  actorUserId,
  editLease,
  assetId,
  folderId,
  scope,
}: {
  actorUserId?: string;
  editLease?: AuthoringEditLease;
  assetId: string;
  folderId: unknown;
  scope: MediaScope;
}) => {
  const safeFolderId = normalizeNullableId(folderId);

  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await assertKaptenMediaLease(tx, scope, "media_asset", assetId, { actorUserId, editLease });
    const asset = await assertAsset(scope, assetId, [MediaAssetState.ready], tx);
    if (asset.trashedAt) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
    const sourceAncestry = await readActiveFolderAncestry(scope, asset.folderId, tx);
    const destinationAncestry = await readActiveFolderAncestry(scope, safeFolderId, tx);
    await lockMediaFolderRows(tx, scope, [...sourceAncestry, ...destinationAncestry]);
    await lockMediaAssetRows(tx, scope, [], assetId);
    const current = await assertAsset(scope, assetId, [MediaAssetState.ready], tx);
    if (current.trashedAt) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
    const updated = await tx.asset.updateMany({
      data: { folderId: safeFolderId },
      where: {
        id: assetId,
        libraryScope: scopeToDatabase(scope),
        state: MediaAssetState.ready,
        trashedAt: null,
      },
    });
    if (updated.count !== 1) throw new MediaServiceError("Gambar berubah saat diproses. Coba lagi.", 409);
  });
};

const trashMediaAsset = async (
  scope: MediaScope,
  assetId: string,
  actorUserId?: string,
  editLease?: AuthoringEditLease,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      await setTransactionLockTimeout(tx);
      await acquireBannerMediaMutationLock(tx);
      await assertKaptenMediaLease(tx, scope, "media_asset", assetId, { actorUserId, editLease });
      const asset = await assertAsset(scope, assetId, [MediaAssetState.pending, MediaAssetState.ready], tx);
      if (asset.trashedAt) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
      const folderAncestry = await readActiveFolderAncestry(scope, asset.folderId, tx);
      await lockMediaFolderRows(tx, scope, folderAncestry);
      await lockMediaAssetRows(tx, scope, [], assetId);
      const current = await assertAsset(scope, assetId, [MediaAssetState.pending, MediaAssetState.ready], tx);
      if (current.trashedAt) throw new MediaServiceError("Gambar tidak ditemukan.", 404);
      if (scope === "admin") {
        await assertBannerAssetsMayBeTrashed(tx, [current.id]);
      } else {
        await assertKaptenBankImagesMayBeTrashed(tx, [current.id], "asset");
      }
      await assertQuizImagesMayBeTrashed(tx, [current.id], "asset");
      await assertTryoutImagesMayBeTrashed(tx, [current.id], "asset");
      const updated = await tx.asset.updateMany({
        data: { state: MediaAssetState.trashed, trashedAt: new Date() },
        where: {
          id: current.id,
          libraryScope: scopeToDatabase(scope),
          state: { in: [MediaAssetState.pending, MediaAssetState.ready] },
          trashedAt: null,
        },
      });
      if (updated.count !== 1) throw new MediaServiceError("Gambar berubah saat diproses. Coba lagi.", 409);
    });
  } catch (error) {
    rethrowBannerSafetyError(error);
    throw error;
  }
};

const requestMediaUpload = async ({
  fileName,
  folderId,
  mimeType,
  scope,
  sizeBytes,
  uploadedByUserId,
}: {
  fileName: unknown;
  folderId: unknown;
  mimeType: unknown;
  scope: MediaScope;
  sizeBytes: unknown;
  uploadedByUserId: string;
}): Promise<MediaUploadTicket> => {
  if (typeof fileName !== "string" || typeof mimeType !== "string" || typeof sizeBytes !== "number") {
    throw new MediaServiceError("Data unggahan tidak valid.");
  }
  const validation = validateMediaUpload({ fileName, mimeType, sizeBytes });
  if (!validation.isValid) throw new MediaServiceError(validation.error);
  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (!isSupportedMediaMimeType(normalizedMimeType)) throw new MediaServiceError("Format media tidak didukung.");
  if (scope === "admin" && isPdfMimeType(normalizedMimeType)) {
    throw new MediaServiceError("Dokumen PDF hanya dapat diunggah ke Media Kapten.", 403);
  }

  const safeFolderId = normalizeNullableId(folderId);
  const assetId = crypto.randomUUID();
  const objectKey = buildMediaObjectKey(scope, assetId, normalizedMimeType);

  let signedUpload: Awaited<ReturnType<typeof createMediaUploadUrl>>;
  try {
    signedUpload = await createMediaUploadUrl(objectKey, normalizedMimeType);
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      throw new MediaServiceError("Penyimpanan media belum siap. Coba lagi nanti atau hubungi admin.", 503);
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    await readActiveFolderAncestry(scope, safeFolderId, tx);
    await tx.asset.create({
      data: {
        folderId: safeFolderId,
        id: assetId,
        libraryScope: scopeToDatabase(scope),
        mimeType: normalizedMimeType,
        objectKey,
        originalName: normalizeMediaFileName(fileName),
        sizeBytes,
        state: MediaAssetState.pending,
        uploadedByUserId,
      },
    });
  });

  return { assetId, ...signedUpload };
};

const finalizeMediaUpload = async ({
  assetId,
  height,
  scope,
  width,
}: {
  assetId: string;
  height: unknown;
  scope: MediaScope;
  width: unknown;
}) => {
  const { asset, folderAncestry } = await prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    const asset = await tx.asset.findFirst({
      where: {
        id: assetId,
        libraryScope: scopeToDatabase(scope),
        state: { in: [MediaAssetState.pending, MediaAssetState.ready] },
      },
    });
    if (!asset) throw new MediaServiceError("Unggahan ini sudah tidak bisa diubah. Coba unggah file lagi.", 409);
    if (!asset.objectKey) throw new MediaServiceError("Lokasi gambar tidak tersedia.", 409);
    const folderAncestry = await readActiveFolderAncestry(scope, asset.folderId, tx);
    return { asset, folderAncestry };
  });
  const verifiedObjectKey = asset.objectKey!;
  const verifiedMimeType = asset.mimeType;
  const verifiedSizeBytes = asset.sizeBytes;
  const isPdf = isPdfMimeType(verifiedMimeType);
  const safeWidth = !isPdf && typeof width === "number" && Number.isInteger(width) && width > 0 && width <= 50_000 ? width : null;
  const safeHeight = !isPdf && typeof height === "number" && Number.isInteger(height) && height > 0 && height <= 50_000 ? height : null;

  let head: Awaited<ReturnType<typeof headMediaObject>>;
  try {
    // R2 HEAD intentionally happens before the database transaction. No
    // storage/network operation may run while the shared mutation lock is held.
    head = await headMediaObject(verifiedObjectKey);
  } catch (error) {
    if (error instanceof R2ConfigurationError) throw new MediaServiceError("Penyimpanan media belum siap. Coba lagi nanti atau hubungi admin.", 503);
    throw new MediaServiceError("Unggahan belum berhasil diverifikasi. Periksa koneksi lalu coba lagi.", 502);
  }

  const verifiedChecksum = head.ETag?.replaceAll('"', "") ?? null;
  const metadataMatches = head.ContentLength === verifiedSizeBytes && head.ContentType === verifiedMimeType;
  if (!metadataMatches) {
    await prisma.$transaction(async (tx) => {
      await setTransactionLockTimeout(tx);
      await acquireBannerMediaMutationLock(tx);
      const ancestryStillMatches = await readActiveFolderAncestry(scope, asset.folderId, tx)
        .then((currentAncestry) => JSON.stringify(currentAncestry) === JSON.stringify(folderAncestry))
        .catch(() => false);
      if (!ancestryStillMatches) return;

      await tx.asset.updateMany({
        data: { state: MediaAssetState.failed },
        where: {
          folderId: asset.folderId,
          id: asset.id,
          libraryScope: scopeToDatabase(scope),
          mimeType: verifiedMimeType,
          objectKey: verifiedObjectKey,
          sizeBytes: verifiedSizeBytes,
          state: MediaAssetState.pending,
          trashedAt: null,
        },
      });
    });
    throw new MediaServiceError("File yang diterima tidak sesuai dengan permintaan unggah.", 409);
  }

  await prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await acquireBannerMediaMutationLock(tx);
    const current = await tx.asset.findUnique({ where: { id: asset.id } });
    if (!current || current.libraryScope !== scopeToDatabase(scope)) {
      throw new MediaServiceError("Unggahan berubah saat diproses. Coba lagi.", 409);
    }

    const currentAncestry = await readActiveFolderAncestry(scope, current.folderId, tx).catch(() => null);
    const sameAncestry = currentAncestry !== null
      && JSON.stringify(currentAncestry) === JSON.stringify(folderAncestry);
    const sameVerifiedObject = current.objectKey === verifiedObjectKey
      && current.mimeType === verifiedMimeType
      && current.sizeBytes === verifiedSizeBytes
      && current.folderId === asset.folderId
      && sameAncestry
      && (current.checksum === null || current.checksum === verifiedChecksum);

    if (
      current.state === MediaAssetState.ready
      && current.trashedAt === null
      && sameVerifiedObject
    ) {
      return;
    }

    if (
      current.state !== MediaAssetState.pending
      || current.trashedAt !== null
      || current.objectKey !== verifiedObjectKey
      || current.mimeType !== verifiedMimeType
      || current.sizeBytes !== verifiedSizeBytes
      || current.folderId !== asset.folderId
      || !sameAncestry
    ) {
      throw new MediaServiceError("Unggahan berubah saat diproses. Coba lagi.", 409);
    }

    const updated = await tx.asset.updateMany({
      data: {
        checksum: verifiedChecksum,
        height: safeHeight,
        state: MediaAssetState.ready,
        width: safeWidth,
      },
      where: {
        folderId: asset.folderId,
        id: asset.id,
        libraryScope: scopeToDatabase(scope),
        mimeType: verifiedMimeType,
        objectKey: verifiedObjectKey,
        sizeBytes: verifiedSizeBytes,
        state: MediaAssetState.pending,
        trashedAt: null,
      },
    });
    if (updated.count !== 1) throw new MediaServiceError("Unggahan berubah saat diproses. Coba lagi.", 409);
  });
};

const getMediaAssetPreview = async (scope: MediaScope, assetId: string) => {
  const asset = await assertAsset(scope, assetId, [MediaAssetState.ready, MediaAssetState.trashed]);
  if (asset.url) return { mimeType: asset.mimeType, originalName: asset.originalName, previewUrl: asset.url };
  if (!asset.objectKey) {
    throw new MediaServiceError(
      isPdfMimeType(asset.mimeType) ? "Lokasi dokumen PDF tidak tersedia." : "Lokasi gambar tidak tersedia.",
      404,
    );
  }

  try {
    return { mimeType: asset.mimeType, originalName: asset.originalName, previewUrl: await createMediaPreviewUrl(asset.objectKey) };
  } catch (error) {
    if (error instanceof R2ConfigurationError) throw new MediaServiceError("Penyimpanan media belum siap. Coba lagi nanti atau hubungi admin.", 503);
    throw error;
  }
};

const getMediaAssetThumbnail = async (scope: MediaScope, assetId: string) => {
  const asset = await assertAsset(scope, assetId, [MediaAssetState.ready, MediaAssetState.trashed]);
  if (!isImageMimeType(asset.mimeType)) {
    throw new MediaServiceError("Pratinjau hanya tersedia untuk gambar.", 415);
  }
  if (asset.url) return { body: null, contentType: asset.mimeType, fallbackUrl: asset.url };
  if (!asset.objectKey) throw new MediaServiceError("Lokasi gambar tidak tersedia.", 404);

  try {
    const source = await readMediaObject(asset.objectKey);
    const body = await sharp(source)
      .resize({ fit: "inside", height: 360, withoutEnlargement: true, width: 480 })
      .webp({ effort: 3, quality: 72 })
      .toBuffer();
    return { body, contentType: "image/webp", fallbackUrl: null };
  } catch (error) {
    if (error instanceof R2ConfigurationError) throw new MediaServiceError("Penyimpanan media belum siap. Coba lagi nanti atau hubungi admin.", 503);
    throw error;
  }
};

export {
  MediaServiceError,
  createMediaFolder,
  finalizeMediaUpload,
  getMediaAssetPreview,
  getMediaAssetThumbnail,
  listMediaLibrary,
  moveMediaAsset,
  moveMediaFolder,
  renameMediaAsset,
  renameMediaFolder,
  renameQuestionBankMediaFolderIfUnchanged,
  requestMediaUpload,
  requireMediaSession,
  trashMediaAsset,
  trashMediaFolder,
};
