"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import { showToast } from "@/components/ui/toast";
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
import {
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

function useMediaLibraryUploads({
  acceptedMimeTypeSet,
  fileInputRef,
  folderId,
  mediaLabel,
  refreshLibrary,
  scope,
  setError,
  setIsDragging,
  setNotice,
}: {
  acceptedMimeTypeSet: ReadonlySet<SupportedMediaMimeType>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderId: string | null;
  mediaLabel: string;
  refreshLibrary: (message?: string) => void;
  scope: MediaScope;
  setError: (value: string | null) => void;
  setIsDragging: (dragging: boolean) => void;
  setNotice: (value: string | null) => void;
}) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setNotice(null);

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
        setError(uploadError instanceof Error ? uploadError.message : `Upload ${mediaLabel} gagal.`);
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
        ? `${mediaLabel[0].toUpperCase()}${mediaLabel.slice(1)} berhasil diupload.`
        : `${files.length} ${mediaLabel} berhasil diupload.`,
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
  const [snapshot, setSnapshot] = useState<MediaLibrarySnapshot | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loadingRequestId, setLoadingRequestId] = useState<number | null>(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const latestLoadRequestId = useRef(0);
  const isLoading = loadingRequestId !== null;
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
  const acceptedMimeTypeSet = new Set(acceptedMimeTypes);
  const mimeTypesQuery = allowedMimeTypes ?? (isPicker || scope === "admin" ? imageMediaMimeTypes : null);
  const shouldFilterMimeTypes = mimeTypesQuery !== null;
  const mimeTypesQueryString = mimeTypesQuery?.join(",") ?? "";
  const mediaLabel = acceptedMimeTypes.length === 1 && isPdfMimeType(acceptedMimeTypes[0])
    ? "PDF"
    : acceptedMimeTypes.length > 0 && acceptedMimeTypes.every((mimeType) => isImageMimeType(mimeType))
      ? "gambar"
      : "media";

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
      setError(loadError instanceof Error ? loadError.message : "Library media belum dapat dibuka.");
    } finally {
      // A stale request must not turn off a newer request's spinner.
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

  const refreshLibrary = (message?: string) => {
    if (message) setNotice(message);
    setRefreshVersion((value) => value + 1);
  };

  const { handleDrop, handleFiles, uploadStatus } = useMediaLibraryUploads({
    acceptedMimeTypeSet,
    fileInputRef,
    folderId,
    mediaLabel,
    refreshLibrary,
    scope,
    setError,
    setIsDragging,
    setNotice,
  });

  const runMutation = async (mutation: MediaMutation, body: Record<string, unknown>, successMessage: string) => {
    if (mutationPending) return false;
    setMutationPending(mutation);
    setError(null);
    try {
      await postMediaAction(scope, body);
      refreshLibrary(successMessage);
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
      setError(mutationError instanceof Error ? mutationError.message : "Folder belum dapat dibuat.");
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
      setError(mutationError instanceof Error ? mutationError.message : "Nama belum dapat diperbarui.");
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
      setError(mutationError instanceof Error ? mutationError.message : "Item belum dapat dipindahkan.");
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
      setError(mutationError instanceof Error ? mutationError.message : "Item belum dapat dimasukkan ke Sampah.");
    }
  };

  const handlePreview = async (asset: MediaAssetDto) => {
    setPreviewAsset({ ...asset, previewUrl: null });
    try {
      const response = await fetch(`/api/media/${scope}/assets/${asset.id}/preview`, { cache: "no-store" });
      const payload = await readJson<{ previewUrl: string }>(response);
      setPreviewAsset((current) => current?.id === asset.id ? { ...asset, previewUrl: payload.previewUrl } : current);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Preview gambar belum tersedia.");
    }
  };

  const openRename = (item: EditableItem) => {
    setEditingItem(item);
    setEditingName(item.name);
  };

  const openMove = (item: MoveRequest) => {
    setMoveRequest(item);
    setMoveTargetId(item.parentId ?? "");
  };

  return <MediaLibraryScreen
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
    newFolderName={newFolderName}
    notice={notice}
    previewAsset={previewAsset}
    query={query}
    searchInput={searchInput}
    selectedAssetId={selectedAssetId}
    snapshot={snapshot}
    trashRequest={trashRequest}
    uploadStatus={uploadStatus}
    viewMode={viewMode}
    viewState={{ isDragging, isDrive, isLoading, isMinimalGallery, isPicker, isReference }}
  />;
}

export { MediaAssetPreview, MediaLibrary, MediaPickerDialog };
