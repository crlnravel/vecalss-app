"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type Dispatch,
  type RefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import {
  allMediaMimeTypes,
  imageMediaMimeTypes,
  isImageMimeType,
  isPdfMimeType,
  validateMediaUpload,
  type MediaScope,
  type SupportedMediaMimeType,
} from "@/lib/media/domain";
import type {
  MediaAssetDto,
  MediaLibrarySnapshot,
  MediaUploadTicket,
} from "@/lib/media/types";
import { MediaAssetPreview } from "./components/MediaAssetPreview";
import { MediaLibraryScreen } from "./components/MediaLibraryScreen";
import { MediaPickerDialog } from "./components/MediaPickerDialog";
import { ResourceAuthoringLockBanner } from "@/modules/mentor/components/resource-authoring-lock-banner";
import {
  getMediaErrorMessage,
  postMediaAction,
  putFile,
  readImageDimensions,
  readJson,
} from "./helpers";
import type {
  EditableItem,
  MediaMutation,
  MoveRequest,
  TrashRequest,
  UploadStatus,
} from "./types";
import type { EditLeaseProof } from "@/lib/resource-edit-lock/types";
import {
  ResourceEditLockProvider,
  type ResourceEditLockContextValue,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";

function useMediaLibraryUploads({
  acceptedMimeTypeSet,
  fileInputRef,
  folderId,
  mediaLabel,
  refreshLibrary,
  scope,
  setError,
  setIsDragging,
}: {
  acceptedMimeTypeSet: ReadonlySet<SupportedMediaMimeType>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderId: string | null;
  mediaLabel: string;
  refreshLibrary: () => void;
  scope: MediaScope;
  setError: (value: string | null) => void;
  setIsDragging: (dragging: boolean) => void;
}) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  usePageStatusToast({
    active: uploadStatus !== null,
    message: "Mengunggah media…",
    variant: "info",
  });

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);

    const uploadNext = async (index: number): Promise<boolean> => {
      const file = files[index];
      if (!file) return true;
      const validation = validateMediaUpload({ fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      if (!validation.isValid) {
        setError(`${file.name}: ${validation.error}`);
        setUploadStatus(null);
        return false;
      }
      if (!acceptedMimeTypeSet.has(file.type as SupportedMediaMimeType)) {
        setError(`${file.name}: Pilih ${mediaLabel} yang sesuai dengan picker ini.`);
        setUploadStatus(null);
        return false;
      }

      setUploadStatus({ current: index + 1, fileName: file.name, progress: 0, total: files.length });
      try {
        const ticket = await postMediaAction<MediaUploadTicket>(scope, {
          action: "request-upload",
          fileName: file.name,
          folderId,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        const dimensions = isImageMimeType(file.type)
          ? await readImageDimensions(file)
          : { height: null, width: null };
        await putFile(file, ticket.uploadUrl, (progress) => {
          setUploadStatus({ current: index + 1, fileName: file.name, progress, total: files.length });
        });
        await postMediaAction(scope, {
          action: "finalize-upload",
          assetId: ticket.assetId,
          height: dimensions.height,
          width: dimensions.width,
        });
      } catch (uploadError) {
        showToast(
          getMediaErrorMessage(
            uploadError,
            `${mediaLabel[0]?.toUpperCase() ?? "M"}${mediaLabel.slice(1)} belum berhasil diunggah. Periksa koneksi lalu coba lagi.`,
          ),
          {
            action: { label: "Coba lagi", onClick: () => void handleFiles(files.slice(index)) },
            variant: "error",
          },
        );
        setUploadStatus(null);
        return false;
      }
      return uploadNext(index + 1);
    };

    if (!(await uploadNext(0))) return;

    setUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast(
      files.length === 1
        ? `${mediaLabel[0].toUpperCase()}${mediaLabel.slice(1)} berhasil diunggah.`
        : `${files.length} ${mediaLabel} berhasil diunggah.`,
      { variant: "success" },
    );
    refreshLibrary();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  return { handleDrop, handleFiles, uploadStatus };
}

function createMediaLibraryMutationHandlers({
  editingItem,
  editingName,
  editLease,
  folderId,
  moveRequest,
  moveTargetId,
  mutationPending,
  newFolderName,
  refreshLibrary,
  scope,
  setEditingItem,
  setFolderDialogOpen,
  setMoveRequest,
  setMutationPending,
  setPreviewAsset,
  setNewFolderName,
  setTrashRequest,
  trashRequest,
}: {
  editingItem: EditableItem | null;
  editingName: string;
  editLease: EditLeaseProof | null;
  folderId: string | null;
  moveRequest: MoveRequest | null;
  moveTargetId: string;
  mutationPending: MediaMutation | null;
  newFolderName: string;
  refreshLibrary: () => void;
  scope: MediaScope;
  setEditingItem: (value: EditableItem | null) => void;
  setFolderDialogOpen: (value: boolean) => void;
  setMoveRequest: (value: MoveRequest | null) => void;
  setMutationPending: (value: MediaMutation | null) => void;
  setNewFolderName: (value: string) => void;
  setPreviewAsset: Dispatch<SetStateAction<MediaAssetDto | null>>;
  setTrashRequest: (value: TrashRequest | null) => void;
  trashRequest: TrashRequest | null;
}) {
  const runMutation = async (mutation: MediaMutation, body: Record<string, unknown>, successMessage: string) => {
    if (mutationPending) return false;
    setMutationPending(mutation);
    try {
      await postMediaAction(scope, { ...body, ...(editLease ? { editLease } : {}) });
      showToast(successMessage, { variant: "success" });
      refreshLibrary();
      return true;
    } finally {
      setMutationPending(null);
    }
  };

  const handleCreateFolder = async () => {
    try {
      if (await runMutation("create-folder", { action: "create-folder", name: newFolderName, parentId: folderId }, "Folder baru dibuat.")) {
        setFolderDialogOpen(false);
        setNewFolderName("");
      }
    } catch (mutationError) {
      showToast(getMediaErrorMessage(mutationError, "Folder belum berhasil dibuat. Periksa koneksi lalu coba lagi."), {
        action: { label: "Coba lagi", onClick: () => void handleCreateFolder() },
        variant: "error",
      });
    }
  };

  const handleRename = async () => {
    if (!editingItem) return;
    try {
      if (await runMutation(
        "rename",
        {
          action: editingItem.kind === "asset" ? "rename-asset" : "rename-folder",
          [`${editingItem.kind}Id`]: editingItem.id,
          name: editingName,
        },
        "Nama diperbarui.",
      )) setEditingItem(null);
    } catch (mutationError) {
      showToast(getMediaErrorMessage(mutationError, "Nama belum berhasil diperbarui. Periksa koneksi lalu coba lagi."), {
        action: { label: "Coba lagi", onClick: () => void handleRename() },
        variant: "error",
      });
    }
  };

  const handleMove = async () => {
    if (!moveRequest) return;
    try {
      if (await runMutation(
        "move",
        {
          action: moveRequest.kind === "asset" ? "move-asset" : "move-folder",
          [`${moveRequest.kind}Id`]: moveRequest.id,
          [moveRequest.kind === "asset" ? "folderId" : "parentId"]: moveTargetId || null,
        },
        "Item dipindahkan.",
      )) setMoveRequest(null);
    } catch (mutationError) {
      showToast(getMediaErrorMessage(mutationError, "Item belum berhasil dipindahkan. Periksa koneksi lalu coba lagi."), {
        action: { label: "Coba lagi", onClick: () => void handleMove() },
        variant: "error",
      });
    }
  };

  const handleTrash = async () => {
    if (!trashRequest) return;
    try {
      if (await runMutation(
        "trash",
        {
          action: trashRequest.kind === "asset" ? "trash-asset" : "trash-folder",
          [`${trashRequest.kind}Id`]: trashRequest.id,
        },
        "Item dimasukkan ke Sampah.",
      )) setTrashRequest(null);
    } catch (mutationError) {
      showToast(getMediaErrorMessage(mutationError, "Item belum berhasil dimasukkan ke Sampah. Periksa koneksi lalu coba lagi."), {
        action: { label: "Coba lagi", onClick: () => void handleTrash() },
        variant: "error",
      });
    }
  };

  const handlePreview = async (asset: MediaAssetDto) => {
    setPreviewAsset({ ...asset, previewUrl: null });
    try {
      const response = await fetch(`/api/media/${scope}/assets/${asset.id}/preview`, { cache: "no-store" });
      const payload = await readJson<{ previewUrl: string }>(response);
      setPreviewAsset((current) => current?.id === asset.id ? { ...asset, previewUrl: payload.previewUrl } : current);
    } catch (previewError) {
      showToast(getMediaErrorMessage(previewError, "Pratinjau media belum berhasil dibuka. Periksa koneksi lalu coba lagi."), {
        action: { label: "Coba lagi", onClick: () => void handlePreview(asset) },
        variant: "error",
      });
    }
  };

  return { handleCreateFolder, handleMove, handlePreview, handleRename, handleTrash };
}

function getMediaLibraryConfig({
  allowedMimeTypes,
  appearance,
  scope,
  variant,
}: {
  allowedMimeTypes?: readonly SupportedMediaMimeType[];
  appearance: "banner" | "default" | "drive" | "reference";
  scope: MediaScope;
  variant: "manage" | "picker";
}) {
  const isPicker = variant === "picker";
  const isReference = appearance === "reference" && scope === "kapten" && !isPicker;
  const isMinimalGallery = appearance === "banner";
  const isDrive = appearance === "banner" || appearance === "drive" || (isReference && !isPicker);
  const defaultMimeTypes = scope === "admin"
    ? imageMediaMimeTypes
    : isPicker
      ? imageMediaMimeTypes
      : allMediaMimeTypes;
  const acceptedMimeTypes = allowedMimeTypes ?? defaultMimeTypes;
  const mimeTypesQuery = allowedMimeTypes ?? (isPicker || scope === "admin" ? imageMediaMimeTypes : null);

  return {
    acceptedMimeTypeSet: new Set(acceptedMimeTypes),
    acceptedMimeTypes,
    isDrive,
    isMinimalGallery,
    isPicker,
    isReference,
    mediaLabel: acceptedMimeTypes.length === 1 && isPdfMimeType(acceptedMimeTypes[0])
      ? "PDF"
      : acceptedMimeTypes.length > 0 && acceptedMimeTypes.every((mimeType) => isImageMimeType(mimeType))
        ? "gambar"
        : "media",
    mimeTypesQueryString: mimeTypesQuery?.join(",") ?? "",
    shouldFilterMimeTypes: mimeTypesQuery !== null,
  };
}

function useMediaLibraryData({
  folderId,
  mimeTypesQueryString,
  query,
  scope,
  shouldFilterMimeTypes,
}: {
  folderId: string | null;
  mimeTypesQueryString: string;
  query: string;
  scope: MediaScope;
  shouldFilterMimeTypes: boolean;
}) {
  const [snapshot, setSnapshot] = useState<MediaLibrarySnapshot | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loadingRequestId, setLoadingRequestId] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const latestLoadRequestId = useRef(0);

  const loadLibrary = useCallback(async (signal?: AbortSignal) => {
    const requestId = latestLoadRequestId.current + 1;
    latestLoadRequestId.current = requestId;
    setLoadingRequestId(requestId);
    setError(null);
    const search = new URLSearchParams();
    if (folderId) search.set("folderId", folderId);
    if (query.trim()) search.set("query", query.trim());
    if (shouldFilterMimeTypes) search.set("mimeTypes", mimeTypesQueryString);

    try {
      const response = await fetch(`/api/media/${scope}?${search.toString()}`, {
        cache: "no-store",
        signal,
      });
      setSnapshot(await readJson<MediaLibrarySnapshot>(response));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(getMediaErrorMessage(loadError, "Daftar media belum berhasil dimuat. Periksa koneksi lalu coba lagi."));
    } finally {
      setLoadingRequestId((current) => current === requestId ? null : current);
    }
  }, [folderId, mimeTypesQueryString, query, scope, shouldFilterMimeTypes]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadLibrary(controller.signal), query ? 250 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [loadLibrary, query, refreshVersion]);

  const refreshLibrary = useCallback(() => {
    setRefreshVersion((value) => value + 1);
  }, []);

  return { error, refreshLibrary, setError, snapshot, isLoading: loadingRequestId !== null };
}

function MediaLibraryLeaseSurface({
  children,
}: {
  children: (lock: ResourceEditLockContextValue) => ReactNode;
}) {
  const lock = useResourceEditLock();
  return children(lock);
}

function MediaLibrary({
  appearance = "default",
  allowedMimeTypes,
  className,
  onSelect,
  scope,
  selectedAssetId,
  variant = "manage",
}: {
  appearance?: "banner" | "default" | "drive" | "reference";
  allowedMimeTypes?: readonly SupportedMediaMimeType[];
  className?: string;
  onSelect?: (asset: MediaAssetDto) => void;
  scope: MediaScope;
  selectedAssetId?: string | null;
  variant?: "manage" | "picker";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingItem, setEditingItem] = useState<EditableItem | null>(null);
  const [editingName, setEditingName] = useState("");
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [trashRequest, setTrashRequest] = useState<TrashRequest | null>(null);
  const [mutationPending, setMutationPending] = useState<MediaMutation | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAssetDto | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const {
    acceptedMimeTypeSet,
    acceptedMimeTypes,
    isDrive,
    isMinimalGallery,
    isPicker,
    isReference,
    mediaLabel,
    mimeTypesQueryString,
    shouldFilterMimeTypes,
  } = getMediaLibraryConfig({ allowedMimeTypes, appearance, scope, variant });
  const { error, isLoading, refreshLibrary, setError, snapshot } = useMediaLibraryData({
    folderId,
    mimeTypesQueryString,
    query,
    scope,
    shouldFilterMimeTypes,
  });

  const { handleDrop, handleFiles, uploadStatus } = useMediaLibraryUploads({
    acceptedMimeTypeSet,
    fileInputRef,
    folderId,
    mediaLabel,
    refreshLibrary,
    scope,
    setError,
    setIsDragging,
  });

  const openRename = (item: EditableItem) => {
    setEditingItem(item);
    setEditingName(item.name);
  };

  const openMove = (item: MoveRequest) => {
    setMoveRequest(item);
    setMoveTargetId(item.parentId ?? "");
  };

  const activeLeaseTarget = editingItem ?? moveRequest ?? trashRequest;
  const leaseEnabled = scope === "kapten" && variant === "manage" && Boolean(activeLeaseTarget);
  const leaseResourceType = activeLeaseTarget?.kind === "asset" ? "media_asset" : "media_folder";
  const leaseResourceId = activeLeaseTarget?.id ?? "00000000-0000-4000-8000-000000000000";

  return (
    <ResourceEditLockProvider
      enabled={leaseEnabled}
      resourceId={leaseResourceId}
      resourceType={leaseResourceType}
    >
      <MediaLibraryLeaseSurface>
        {(resourceLock) => {
          const {
            handleCreateFolder,
            handleMove,
            handlePreview,
            handleRename,
            handleTrash,
          } = createMediaLibraryMutationHandlers({
            editingItem,
            editingName,
            editLease: resourceLock.proof,
            folderId,
            moveRequest,
            moveTargetId,
            mutationPending,
            newFolderName,
            refreshLibrary,
            scope,
            setEditingItem,
            setFolderDialogOpen,
            setMoveRequest,
            setMutationPending,
            setNewFolderName,
            setPreviewAsset,
            setTrashRequest,
            trashRequest,
          });

          return (
            <>
              {leaseEnabled ? (
                <ResourceAuthoringLockBanner
                  onRetry={resourceLock.retry}
                  resourceLabel="Media"
                  state={resourceLock.state}
                />
              ) : null}
              <MediaLibraryScreen
                acceptedMimeTypes={acceptedMimeTypes}
                actions={{
                  handleCreateFolder,
                  handleDrop,
                  handleFiles,
                  handleMove,
                  handlePreview,
                  handleRename,
                  handleTrash,
                  onSelect,
                  openMove,
                  openRename,
                  refreshLibrary: () => refreshLibrary(),
                  setEditingItem,
                  setEditingName,
                  setFolderDialogOpen,
                  setFolderId,
                  setIsDragging,
                  setMoveRequest,
                  setMoveTargetId,
                  setNewFolderName,
                  setPreviewAsset,
                  setQuery,
                  setSearchInput,
                  setTrashRequest,
                  setViewMode,
                }}
                className={className}
                editingItem={editingItem}
                editingName={editingName}
                error={error}
                fileInputRef={fileInputRef}
                folderDialogOpen={folderDialogOpen}
                mediaLabel={mediaLabel}
                moveRequest={moveRequest}
                moveTargetId={moveTargetId}
                mutationPending={mutationPending}
                mutationsDisabled={leaseEnabled && !resourceLock.canEdit}
                newFolderName={newFolderName}
                previewAsset={previewAsset}
                query={query}
                searchInput={searchInput}
                selectedAssetId={selectedAssetId}
                snapshot={snapshot}
                trashRequest={trashRequest}
                uploadStatus={uploadStatus}
                viewMode={viewMode}
                viewState={{ isDragging, isDrive, isLoading, isMinimalGallery, isPicker, isReference }}
              />
            </>
          );
        }}
      </MediaLibraryLeaseSurface>
    </ResourceEditLockProvider>
  );
}

export { MediaAssetPreview, MediaLibrary, MediaPickerDialog };
