import type { DragEvent, ReactNode } from "react";
import type { MediaAssetDto, MediaLibrarySnapshot } from "@/lib/media/types";

export type EditableItem = {
  id: string;
  kind: "asset" | "folder";
  name: string;
};

export type MoveRequest = {
  id: string;
  kind: "asset" | "folder";
  name: string;
  parentId: string | null;
};

export type TrashRequest = {
  id: string;
  kind: "asset" | "folder";
  name: string;
};

export type UploadStatus = {
  current: number;
  fileName: string;
  progress: number;
  total: number;
};

export type MediaMutation = "create-folder" | "rename" | "move" | "trash";
export type MediaSortMode = "updated" | "name" | "size";
export type MediaAssetFilter = "all" | "images" | "pdf";

export type MediaLibraryScreenActions = {
  handleCreateFolder: () => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleFiles: (files: File[]) => void;
  handleMove: () => void;
  handlePreview: (asset: MediaAssetDto) => void;
  handleRename: () => void;
  handleTrash: () => void;
  onSelect?: (asset: MediaAssetDto) => void;
  openMove: (item: MoveRequest) => void;
  openRename: (item: EditableItem) => void;
  refreshLibrary: () => void;
  setEditingItem: (item: EditableItem | null) => void;
  setEditingName: (value: string) => void;
  setFolderDialogOpen: (open: boolean) => void;
  setFolderId: (id: string | null) => void;
  setIsDragging: (dragging: boolean) => void;
  setMoveRequest: (request: MoveRequest | null) => void;
  setMoveTargetId: (id: string) => void;
  setNewFolderName: (value: string) => void;
  setPreviewAsset: (asset: MediaAssetDto | null) => void;
  setQuery: (value: string) => void;
  setSearchInput: (value: string) => void;
  setTrashRequest: (request: TrashRequest | null) => void;
  setViewMode: (mode: "grid" | "list") => void;
};

export type MediaLibraryItemViewFlags = {
  isDrive: boolean;
  isMinimalGallery: boolean;
  isLoading: boolean;
  isPicker: boolean;
  isReference: boolean;
};

export type MediaLibraryItemRenderers = {
  driveAsset: (asset: MediaAssetDto) => ReactNode;
  driveFolder: (folder: MediaLibrarySnapshot["folders"][number]) => ReactNode;
  itemMenu: (item: { id: string; kind: "asset" | "folder"; name: string; parentId: string | null }) => ReactNode;
};
