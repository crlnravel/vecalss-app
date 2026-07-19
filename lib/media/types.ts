import type { MediaScope } from "./domain";

type MediaFolderDto = {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: string;
};

type MediaAssetDto = {
  createdAt: string;
  height: number | null;
  id: string;
  mimeType: string;
  name: string;
  parentId: string | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  sizeBytes: number;
  state: "failed" | "pending" | "ready" | "trashed";
  updatedAt: string;
  uploadedBy: string;
  width: number | null;
};

type MediaBreadcrumbDto = {
  id: string | null;
  name: string;
};

type MediaLibrarySnapshot = {
  assets: MediaAssetDto[];
  breadcrumbs: MediaBreadcrumbDto[];
  currentFolderId: string | null;
  folders: MediaFolderDto[];
  isStorageConfigured: boolean;
  moveTargets: MediaFolderDto[];
  scope: MediaScope;
};

type MediaUploadTicket = {
  assetId: string;
  expiresInSeconds: number;
  uploadUrl: string;
};

export type {
  MediaAssetDto,
  MediaBreadcrumbDto,
  MediaFolderDto,
  MediaLibrarySnapshot,
  MediaUploadTicket,
};
