import "server-only";

import sharp from "sharp";

import {
  MediaAssetState,
  MediaLibraryScope,
  RoleName,
  type Prisma,
} from "@/generated/prisma/client";
import { getSessionContext, hasRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import {
  buildMediaObjectKey,
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

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MediaServiceError";
    this.status = status;
  }
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
    throw new MediaServiceError("Anda tidak memiliki akses ke library media ini.", 403);
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

const assertFolder = async (
  scope: MediaScope,
  folderId: string | null,
) => {
  if (!folderId) return null;

  const folder = await prisma.mediaFolder.findFirst({
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
  let thumbnailUrl = asset.url;

  if (asset.objectKey && isR2Configured()) {
    previewUrl = null;
    thumbnailUrl = `/api/media/${scope}/assets/${asset.id}/thumbnail`;
  }

  return {
    createdAt: asset.createdAt.toISOString(),
    height: asset.height,
    id: asset.id,
    mimeType: asset.mimeType,
    name: asset.originalName || "Gambar tanpa nama",
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
  query,
  scope,
}: {
  folderId: string | null;
  query: string;
  scope: MediaScope;
}): Promise<MediaLibrarySnapshot> => {
  await assertFolder(scope, folderId);
  const databaseScope = scopeToDatabase(scope);
  const normalizedQuery = query.trim();
  const isSearching = normalizedQuery.length > 0;
  const assetWhere: Prisma.AssetWhereInput = {
    libraryScope: databaseScope,
    state: MediaAssetState.ready,
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
  await assertFolder(scope, safeParentId);

  const duplicate = await prisma.mediaFolder.findFirst({
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

  const folder = await prisma.mediaFolder.create({
    data: {
      createdByUserId,
      libraryScope: scopeToDatabase(scope),
      name: safeName,
      parentId: safeParentId,
    },
  });

  return toFolderDto(folder);
};

const assertFolderMove = async ({
  folderId,
  parentId,
  scope,
}: {
  folderId: string;
  parentId: string | null;
  scope: MediaScope;
}) => {
  await assertFolder(scope, folderId);
  await assertFolder(scope, parentId);
  if (folderId === parentId) {
    throw new MediaServiceError("Folder tidak dapat dipindahkan ke dalam dirinya sendiri.");
  }

  let currentId = parentId;
  const seen = new Set<string>();
  while (currentId) {
    if (currentId === folderId) {
      throw new MediaServiceError("Folder tidak dapat dipindahkan ke turunannya.");
    }
    if (seen.has(currentId) || seen.size > 50) {
      throw new MediaServiceError("Struktur folder tidak valid.", 409);
    }
    seen.add(currentId);
    const folder = await prisma.mediaFolder.findUnique({
      select: { parentId: true },
      where: { id: currentId },
    });
    currentId = folder?.parentId ?? null;
  }
};

const renameMediaFolder = async ({
  folderId,
  name,
  scope,
}: {
  folderId: string;
  name: unknown;
  scope: MediaScope;
}) => {
  const folder = await assertFolder(scope, folderId);
  const safeName = validateFolderName(name);
  const duplicate = await prisma.mediaFolder.findFirst({
    select: { id: true },
    where: {
      id: { not: folderId },
      libraryScope: scopeToDatabase(scope),
      name: { equals: safeName, mode: "insensitive" },
      parentId: folder?.parentId ?? null,
      trashedAt: null,
    },
  });
  if (duplicate) throw new MediaServiceError("Nama folder sudah digunakan di lokasi ini.", 409);

  return toFolderDto(await prisma.mediaFolder.update({
    data: { name: safeName },
    where: { id: folderId },
  }));
};

const moveMediaFolder = async ({
  folderId,
  parentId,
  scope,
}: {
  folderId: string;
  parentId: unknown;
  scope: MediaScope;
}) => {
  const safeParentId = normalizeNullableId(parentId);
  await assertFolderMove({ folderId, parentId: safeParentId, scope });
  return toFolderDto(await prisma.mediaFolder.update({
    data: { parentId: safeParentId },
    where: { id: folderId },
  }));
};

const getFolderSubtreeIds = async (scope: MediaScope, rootId: string) => {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await prisma.mediaFolder.findMany({
      select: { id: true },
      where: {
        libraryScope: scopeToDatabase(scope),
        parentId: { in: frontier },
        trashedAt: null,
      },
    });
    frontier = children.map((folder) => folder.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
    if (ids.length > 10_000) throw new MediaServiceError("Folder terlalu besar untuk diproses.", 409);
  }

  return ids;
};

const trashMediaFolder = async (scope: MediaScope, folderId: string) => {
  await assertFolder(scope, folderId);
  const ids = await getFolderSubtreeIds(scope, folderId);
  const trashedAt = new Date();

  await prisma.$transaction([
    prisma.asset.updateMany({
      data: { state: MediaAssetState.trashed, trashedAt },
      where: {
        folderId: { in: ids },
        libraryScope: scopeToDatabase(scope),
        state: MediaAssetState.ready,
      },
    }),
    prisma.mediaFolder.updateMany({
      data: { trashedAt },
      where: { id: { in: ids }, libraryScope: scopeToDatabase(scope) },
    }),
  ]);
};

const assertAsset = async (
  scope: MediaScope,
  assetId: string,
  states: MediaAssetState[] = [MediaAssetState.ready],
) => {
  const asset = await prisma.asset.findFirst({
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
  assetId,
  name,
  scope,
}: {
  assetId: string;
  name: unknown;
  scope: MediaScope;
}) => {
  await assertAsset(scope, assetId);
  if (typeof name !== "string" || !name.trim()) {
    throw new MediaServiceError("Nama gambar tidak boleh kosong.");
  }
  const safeName = normalizeMediaFileName(name);
  await prisma.asset.update({ data: { originalName: safeName }, where: { id: assetId } });
};

const moveMediaAsset = async ({
  assetId,
  folderId,
  scope,
}: {
  assetId: string;
  folderId: unknown;
  scope: MediaScope;
}) => {
  await assertAsset(scope, assetId);
  const safeFolderId = normalizeNullableId(folderId);
  await assertFolder(scope, safeFolderId);
  await prisma.asset.update({ data: { folderId: safeFolderId }, where: { id: assetId } });
};

const trashMediaAsset = async (scope: MediaScope, assetId: string) => {
  await assertAsset(scope, assetId);
  await prisma.asset.update({
    data: { state: MediaAssetState.trashed, trashedAt: new Date() },
    where: { id: assetId },
  });
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
    throw new MediaServiceError("Data upload tidak valid.");
  }
  const validation = validateMediaUpload({ fileName, mimeType, sizeBytes });
  if (!validation.isValid) throw new MediaServiceError(validation.error);
  if (!isSupportedMediaMimeType(mimeType)) throw new MediaServiceError("Format gambar tidak didukung.");

  const safeFolderId = normalizeNullableId(folderId);
  await assertFolder(scope, safeFolderId);
  const assetId = crypto.randomUUID();
  const objectKey = buildMediaObjectKey(scope, assetId, mimeType);

  let signedUpload: Awaited<ReturnType<typeof createMediaUploadUrl>>;
  try {
    signedUpload = await createMediaUploadUrl(objectKey, mimeType);
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      throw new MediaServiceError(error.message, 503);
    }
    throw error;
  }

  await prisma.asset.create({
    data: {
      folderId: safeFolderId,
      id: assetId,
      libraryScope: scopeToDatabase(scope),
      mimeType,
      objectKey,
      originalName: normalizeMediaFileName(fileName),
      sizeBytes,
      state: MediaAssetState.pending,
      uploadedByUserId,
    },
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
  const asset = await assertAsset(scope, assetId, [MediaAssetState.pending]);
  if (!asset.objectKey) throw new MediaServiceError("Object key gambar tidak tersedia.", 409);

  try {
    const head = await headMediaObject(asset.objectKey);
    if (head.ContentLength !== asset.sizeBytes || head.ContentType !== asset.mimeType) {
      await prisma.asset.update({ data: { state: MediaAssetState.failed }, where: { id: asset.id } });
      throw new MediaServiceError("File yang diterima tidak sesuai dengan permintaan upload.", 409);
    }

    const safeWidth = typeof width === "number" && Number.isInteger(width) && width > 0 && width <= 50_000 ? width : null;
    const safeHeight = typeof height === "number" && Number.isInteger(height) && height > 0 && height <= 50_000 ? height : null;
    await prisma.asset.update({
      data: {
        checksum: head.ETag?.replaceAll('"', "") ?? null,
        height: safeHeight,
        state: MediaAssetState.ready,
        width: safeWidth,
      },
      where: { id: asset.id },
    });
  } catch (error) {
    if (error instanceof MediaServiceError) throw error;
    if (error instanceof R2ConfigurationError) throw new MediaServiceError(error.message, 503);
    throw new MediaServiceError("Upload belum dapat diverifikasi. Coba lagi.", 502);
  }
};

const getMediaAssetPreview = async (scope: MediaScope, assetId: string) => {
  const asset = await assertAsset(scope, assetId, [MediaAssetState.ready, MediaAssetState.trashed]);
  if (asset.url) return { previewUrl: asset.url };
  if (!asset.objectKey) throw new MediaServiceError("Lokasi gambar tidak tersedia.", 404);

  try {
    return { previewUrl: await createMediaPreviewUrl(asset.objectKey) };
  } catch (error) {
    if (error instanceof R2ConfigurationError) throw new MediaServiceError(error.message, 503);
    throw error;
  }
};

const getMediaAssetThumbnail = async (scope: MediaScope, assetId: string) => {
  const asset = await assertAsset(scope, assetId, [MediaAssetState.ready, MediaAssetState.trashed]);
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
    if (error instanceof R2ConfigurationError) throw new MediaServiceError(error.message, 503);
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
  requestMediaUpload,
  requireMediaSession,
  trashMediaAsset,
  trashMediaFolder,
};
