"use client";

import {
  ChevronRight,
  FileImage,
  Folder,
  FolderInput,
  FolderPlus,
  ImageOff,
  LayoutGrid,
  LoaderCircle,
  List,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  Fragment,
  useRef,
  useState,
  type DragEvent,
} from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldInput, FieldLabel, fieldControlClassName } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatMediaBytes,
  validateMediaUpload,
  type MediaScope,
} from "@/lib/media/domain";
import type {
  MediaAssetDto,
  MediaLibrarySnapshot,
  MediaUploadTicket,
} from "@/lib/media/types";
import { cn } from "@/lib/utils";

type EditableItem = {
  id: string;
  kind: "asset" | "folder";
  name: string;
};

type MoveRequest = {
  id: string;
  kind: "asset" | "folder";
  name: string;
  parentId: string | null;
};

type TrashRequest = {
  id: string;
  kind: "asset" | "folder";
  name: string;
};

type UploadStatus = {
  current: number;
  fileName: string;
  progress: number;
  total: number;
};

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const readJson = async <T,>(response: Response): Promise<T> => {
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = typeof payload === "object"
      && payload !== null
      && "error" in payload
      && typeof payload.error === "string"
      ? payload.error
      : "Media belum dapat diproses. Coba lagi.";
    throw new Error(message);
  }

  return payload as T;
};

const postMediaAction = async <T,>(scope: MediaScope, body: Record<string, unknown>) => {
  const response = await fetch(`/api/media/${scope}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  return readJson<T>(response);
};

const readImageDimensions = (file: File) => new Promise<{ height: number | null; width: number | null }>((resolve) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    resolve({ height: image.naturalHeight || null, width: image.naturalWidth || null });
    URL.revokeObjectURL(objectUrl);
  };
  image.onerror = () => {
    resolve({ height: null, width: null });
    URL.revokeObjectURL(objectUrl);
  };
  image.src = objectUrl;
});

const putFile = (
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void,
) => new Promise<void>((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("PUT", uploadUrl);
  request.setRequestHeader("Content-Type", file.type);
  request.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
  });
  request.addEventListener("load", () => {
    if (request.status >= 200 && request.status < 300) resolve();
    else reject(new Error("Upload ke penyimpanan gagal. Coba lagi."));
  });
  request.addEventListener("error", () => reject(new Error("Koneksi upload terputus. Coba lagi.")));
  request.send(file);
});

const getItemDate = (value: string) => dateFormatter.format(new Date(value));

function MediaLibrary({
  appearance = "default",
  className,
  onSelect,
  scope,
  selectedAssetId,
  variant = "manage",
}: {
  appearance?: "default" | "drive";
  className?: string;
  onSelect?: (asset: MediaAssetDto) => void;
  scope: MediaScope;
  selectedAssetId?: string | null;
  variant?: "manage" | "picker";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<MediaLibrarySnapshot | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingItem, setEditingItem] = useState<EditableItem | null>(null);
  const [editingName, setEditingName] = useState("");
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>("");
  const [trashRequest, setTrashRequest] = useState<TrashRequest | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAssetDto | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const isPicker = variant === "picker";
  const isDrive = appearance === "drive" && !isPicker;

  const loadLibrary = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    const search = new URLSearchParams();
    if (folderId) search.set("folderId", folderId);
    if (query.trim()) search.set("query", query.trim());

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
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [folderId, query, scope]);

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

  const runMutation = async (body: Record<string, unknown>, successMessage: string) => {
    setError(null);
    await postMediaAction(scope, body);
    refreshLibrary(successMessage);
  };

  const handleCreateFolder = async () => {
    try {
      await runMutation({ action: "create-folder", name: newFolderName, parentId: folderId }, "Folder baru dibuat.");
      setFolderDialogOpen(false);
      setNewFolderName("");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Folder belum dapat dibuat.");
    }
  };

  const handleRename = async () => {
    if (!editingItem) return;
    try {
      await runMutation(
        {
          action: editingItem.kind === "asset" ? "rename-asset" : "rename-folder",
          [`${editingItem.kind}Id`]: editingItem.id,
          name: editingName,
        },
        "Nama diperbarui.",
      );
      setEditingItem(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Nama belum dapat diperbarui.");
    }
  };

  const handleMove = async () => {
    if (!moveRequest) return;
    try {
      await runMutation(
        {
          action: moveRequest.kind === "asset" ? "move-asset" : "move-folder",
          [`${moveRequest.kind}Id`]: moveRequest.id,
          [moveRequest.kind === "asset" ? "folderId" : "parentId"]: moveTargetId || null,
        },
        "Item dipindahkan.",
      );
      setMoveRequest(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Item belum dapat dipindahkan.");
    }
  };

  const handleTrash = async () => {
    if (!trashRequest) return;
    try {
      await runMutation(
        {
          action: trashRequest.kind === "asset" ? "trash-asset" : "trash-folder",
          [`${trashRequest.kind}Id`]: trashRequest.id,
        },
        "Item dipindahkan ke Trash.",
      );
      setTrashRequest(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Item belum dapat dipindahkan ke Trash.");
    }
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setNotice(null);

    for (const [index, file] of files.entries()) {
      const validation = validateMediaUpload({ fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      if (!validation.isValid) {
        setError(`${file.name}: ${validation.error}`);
        setUploadStatus(null);
        return;
      }

      setUploadStatus({ current: index + 1, fileName: file.name, progress: 0, total: files.length });
      try {
        const [ticket, dimensions] = await Promise.all([
          postMediaAction<MediaUploadTicket>(scope, {
            action: "request-upload",
            fileName: file.name,
            folderId,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
          readImageDimensions(file),
        ]);
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
        setError(uploadError instanceof Error ? uploadError.message : "Upload gambar gagal.");
        setUploadStatus(null);
        return;
      }
    }

    setUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    refreshLibrary(files.length === 1 ? "Gambar berhasil diupload." : `${files.length} gambar berhasil diupload.`);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  const openRename = (item: EditableItem) => {
    setEditingItem(item);
    setEditingName(item.name);
  };

  const openMove = (item: MoveRequest) => {
    setMoveRequest(item);
    setMoveTargetId(item.parentId ?? "");
  };

  const renderItemMenu = (item: { id: string; kind: "asset" | "folder"; name: string; parentId: string | null }) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${item.name}`} size="icon-sm" variant="ghost" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => openRename(item)}>
            <Pencil />
            Ganti nama
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openMove(item)}>
            <FolderInput />
            Pindahkan
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTrashRequest(item)} variant="destructive">
            <Trash2 />
            Pindahkan ke Trash
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section className={cn("flex min-w-0 flex-col gap-5", className)}>
      <div className={cn("flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between", isDrive && "rounded-[1.75rem] border border-primary-100 bg-white p-3 shadow-sm md:p-4")}>
        <div className="flex flex-wrap items-center gap-2">
          {!isPicker ? (
            <Button onClick={() => setFolderDialogOpen(true)} variant="brandOutline">
              <FolderPlus data-icon="inline-start" />
              Folder baru
            </Button>
          ) : null}
          <Button disabled={!snapshot?.isStorageConfigured || Boolean(uploadStatus)} onClick={() => fileInputRef.current?.click()} variant="brand">
            {uploadStatus ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            {uploadStatus ? "Mengupload" : "Upload gambar"}
          </Button>
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            multiple
            onChange={(event) => void handleFiles(Array.from(event.target.files ?? []))}
            ref={fileInputRef}
            type="file"
          />
        </div>

        <label className={cn("relative block w-full xl:max-w-md", isDrive && "xl:order-first xl:max-w-2xl xl:flex-1")}>
          <span className="sr-only">Cari gambar</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-500" />
          <Input
            className={cn("h-11 border-primary-100 bg-white pl-11", isDrive && "rounded-full bg-primary-50/55 shadow-none")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama gambar..."
            value={query}
          />
        </label>
      </div>

      {!snapshot?.isStorageConfigured && !isLoading ? (
        <div className="rounded-3xl border border-primary-100 bg-primary-50/70 px-5 py-4 text-sm leading-6 text-secondary-700" role="status">
          R2 belum dikonfigurasi. Tambahkan kredensial server untuk mengaktifkan upload dan preview gambar.
        </div>
      ) : null}
      {notice ? <p className="text-sm font-medium text-primary-800" role="status">{notice}</p> : null}
      {error ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          <Button onClick={() => refreshLibrary()} size="sm" variant="ghost">
            <RefreshCw data-icon="inline-start" />
            Coba lagi
          </Button>
        </div>
      ) : null}

      <div
        className={cn(
          "relative min-h-[28rem] overflow-hidden rounded-[2rem] border border-primary-100 bg-white transition-[border-color,background-color] duration-150",
          isDrive && "min-h-[42rem] rounded-[1.75rem] bg-white/95 shadow-sm",
          isDragging && "border-primary-500 bg-primary-50/70",
        )}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        {isDragging ? (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-[1.5rem] border-2 border-dashed border-primary-500 bg-primary-50/90 text-center">
            <div className="flex flex-col items-center gap-2 text-primary-900">
              <Upload className="size-8" />
              <p className="font-semibold">Lepaskan gambar untuk upload</p>
              <p className="text-sm text-secondary-600">JPG, PNG, WebP, atau GIF · maksimal 15 MB</p>
            </div>
          </div>
        ) : null}

        <div className={cn("flex flex-col gap-4 border-b border-primary-100 px-5 py-4 md:px-6", isDrive && "gap-5 px-5 py-5 md:px-7 md:py-6")}>
          {isDrive ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-xs font-semibold tracking-[0.12em] text-primary-700 uppercase">Library Kapten</p>
                <h1 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-secondary-900 md:text-3xl">Media</h1>
                <p className="text-sm text-secondary-500">Kelola gambar bersama untuk Bank Soal Kapten.</p>
              </div>
              <div aria-label="Tampilan media" className="flex items-center rounded-full border border-primary-100 bg-primary-50/60 p-1" role="group">
                <Button aria-label="Tampilan daftar" aria-pressed={viewMode === "list"} className="rounded-full" onClick={() => setViewMode("list")} size="icon-sm" variant={viewMode === "list" ? "brand" : "ghost"}><List /></Button>
                <Button aria-label="Tampilan grid" aria-pressed={viewMode === "grid"} className="rounded-full" onClick={() => setViewMode("grid")} size="icon-sm" variant={viewMode === "grid" ? "brand" : "ghost"}><LayoutGrid /></Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Breadcrumb>
              <BreadcrumbList>
                {snapshot?.breadcrumbs.map((breadcrumb, index) => (
                  <Fragment key={breadcrumb.id ?? "root"}>
                    {index > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem>
                      {index === (snapshot?.breadcrumbs.length ?? 0) - 1 ? (
                        <BreadcrumbPage>{breadcrumb.name}</BreadcrumbPage>
                      ) : (
                        <button
                          className="min-h-11 rounded-xl px-2 text-sm font-medium text-secondary-600 transition-colors hover:bg-primary-50 hover:text-primary-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20"
                          onClick={() => setFolderId(breadcrumb.id)}
                          type="button"
                        >
                          {breadcrumb.name}
                        </button>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            <span className="text-xs font-medium text-secondary-500">{snapshot ? `${snapshot.folders.length} folder · ${snapshot.assets.length} gambar` : "Memuat library"}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-secondary-500">
            <span>{query ? `Hasil untuk “${query}”` : "Seret gambar ke area ini untuk upload cepat"}</span>
            {isDrive ? <span>JPG, PNG, WebP, atau GIF · maks. 15 MB</span> : null}
          </div>
        </div>

        {uploadStatus ? (
          <div className="border-b border-primary-100 bg-primary-50/60 px-5 py-4 md:px-6" role="status">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate font-medium text-secondary-900">
                {uploadStatus.current}/{uploadStatus.total} · {uploadStatus.fileName}
              </span>
              <span className="text-primary-800">{uploadStatus.progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-100">
              <div className="h-full rounded-full bg-primary-700 transition-[width] duration-150" style={{ width: `${uploadStatus.progress}%` }} />
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className={cn("flex flex-col gap-3 p-5 md:p-6", isDrive && viewMode === "grid" && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4")}>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton className={cn("h-16 w-full rounded-2xl", isDrive && viewMode === "grid" && "h-56")} key={index} />
            ))}
          </div>
        ) : snapshot && (snapshot.folders.length > 0 || snapshot.assets.length > 0) ? (
          <div className={cn("flex flex-col", isDrive && "gap-7 p-5 md:p-7")}>
            {snapshot.folders.length > 0 ? (
              <div className={cn("flex flex-col", isDrive && "gap-3")}>
                <div className={cn("px-5 pt-5 pb-2 text-xs font-semibold tracking-[0.1em] text-secondary-500 uppercase md:px-6", isDrive && "px-0 pt-0 pb-0 md:px-0")}>Folder</div>
                <div className={cn(isDrive && "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}>
                {snapshot.folders.map((folderItem) => (
                  <div className={cn("grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-primary-100 px-4 transition-colors hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.4fr)_0.7fr_44px] md:px-6", isDrive && "min-h-[4.5rem] rounded-2xl border border-primary-100 bg-primary-50/40 px-3 hover:border-primary-200 hover:bg-primary-50 md:grid-cols-[minmax(0,1fr)_auto] md:px-3")} key={folderItem.id}>
                    <button className="flex min-h-16 min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20" onClick={() => setFolderId(folderItem.id)} type="button">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800"><Folder className="size-5" /></span>
                      <span className="min-w-0"><span className="block truncate font-semibold text-secondary-900">{folderItem.name}</span>{isDrive ? <span className="mt-0.5 block text-xs text-secondary-500">{getItemDate(folderItem.updatedAt)}</span> : null}</span>
                    </button>
                    <span className={cn("hidden text-sm text-secondary-500 md:block", isDrive && "md:hidden")}>Diperbarui {getItemDate(folderItem.updatedAt)}</span>
                    {isPicker ? <ChevronRight className="size-4 text-secondary-400" /> : renderItemMenu({ id: folderItem.id, kind: "folder", name: folderItem.name, parentId: folderItem.parentId })}
                  </div>
                ))}
                </div>
              </div>
            ) : null}

            {snapshot.folders.length > 0 && snapshot.assets.length > 0 && !isDrive ? <Separator /> : null}

            {snapshot.assets.length > 0 ? (
              <div className={cn("flex flex-col", isDrive && "gap-3")}>
                <div className={cn("hidden grid-cols-[minmax(0,1.4fr)_0.55fr_0.65fr_0.7fr_44px] gap-3 px-6 py-3 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase md:grid", isDrive && viewMode === "grid" && "flex px-0 py-0", isDrive && viewMode === "list" && "px-4")}>{isDrive && viewMode === "grid" ? "Gambar" : (
                  <>
                  <span>Nama</span><span>Ukuran</span><span>Dimensi</span><span>Diperbarui</span><span />
                  </>
                )}</div>
                <div className={cn(isDrive && viewMode === "grid" && "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4")}>
                {snapshot.assets.map((asset) => (
                  <div className={cn("grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-primary-100 px-4 transition-colors hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.4fr)_0.55fr_0.65fr_0.7fr_44px] md:px-6", isDrive && viewMode === "list" && "rounded-2xl border border-primary-100 px-3 hover:border-primary-200 md:px-4", isDrive && viewMode === "grid" && "group relative block overflow-hidden rounded-2xl border border-primary-100 bg-primary-50/35 p-2 hover:border-primary-200 hover:bg-primary-50/70", selectedAssetId === asset.id && "bg-primary-50")} key={asset.id}>
                    <button className={cn("flex min-h-[4.5rem] min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20", isDrive && viewMode === "grid" && "flex w-full flex-col items-stretch gap-0 rounded-xl")} onClick={() => setPreviewAsset(asset)} type="button">
                      <span className={cn("flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-50 text-primary-800", isDrive && viewMode === "grid" && "aspect-[4/3] size-auto w-full rounded-xl bg-white")}>
                        {asset.previewUrl ? (
                          // Signed R2 URLs are intentionally dynamic and cannot be declared in next/image remotePatterns.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="" className={cn("size-full object-cover", isDrive && viewMode === "grid" && "object-contain p-2")} loading="lazy" src={asset.previewUrl} />
                        ) : <FileImage className="size-5" />}
                      </span>
                      <span className={cn("min-w-0", isDrive && viewMode === "grid" && "w-full px-2 pt-3 pb-1")}><span className="block truncate font-semibold text-secondary-900">{asset.name}</span><span className={cn("mt-1 block text-xs text-secondary-500 md:hidden", isDrive && viewMode === "grid" && "md:block")}>{formatMediaBytes(asset.sizeBytes)} · {getItemDate(asset.updatedAt)}</span></span>
                    </button>
                    <span className={cn("hidden text-sm text-secondary-500 md:block", isDrive && viewMode === "grid" && "md:hidden")}>{formatMediaBytes(asset.sizeBytes)}</span>
                    <span className={cn("hidden text-sm text-secondary-500 md:block", isDrive && viewMode === "grid" && "md:hidden")}>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</span>
                    <div className={cn("hidden items-center gap-2 text-sm text-secondary-500 md:flex", isDrive && viewMode === "grid" && "md:hidden")}>
                      <span>{getItemDate(asset.updatedAt)}</span>
                      {isPicker ? <Button onClick={() => onSelect?.(asset)} size="sm" variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}>{selectedAssetId === asset.id ? "Dipilih" : "Pilih"}<ChevronRight data-icon="inline-end" /></Button> : null}
                    </div>
                    {isPicker ? (
                      <Button aria-label={`Pilih ${asset.name}`} className="md:hidden" onClick={() => onSelect?.(asset)} size="icon-sm" variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}><ChevronRight /></Button>
                    ) : <div className={cn(isDrive && viewMode === "grid" && "absolute top-3 right-3 rounded-full bg-white/95 shadow-sm")}>{renderItemMenu({ id: asset.id, kind: "asset", name: asset.name, parentId: asset.parentId })}</div>}
                  </div>
                ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty className="min-h-[22rem] border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">{query ? <Search /> : <ImageOff />}</EmptyMedia>
              <EmptyTitle>{query ? "Gambar tidak ditemukan" : "Folder ini masih kosong"}</EmptyTitle>
              <EmptyDescription>{query ? "Coba nama file lain atau hapus pencarian." : "Upload gambar atau buat folder untuk mulai menyusun library."}</EmptyDescription>
            </EmptyHeader>
            {!query ? <EmptyContent><Button disabled={!snapshot?.isStorageConfigured} onClick={() => fileInputRef.current?.click()} variant="brand"><Upload data-icon="inline-start" />Upload gambar</Button></EmptyContent> : null}
          </Empty>
        )}
      </div>

      <Dialog onOpenChange={setFolderDialogOpen} open={folderDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Folder baru</DialogTitle><DialogDescription>Buat folder di lokasi yang sedang dibuka.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="new-media-folder">Nama folder</FieldLabel><FieldInput autoFocus id="new-media-folder" onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleCreateFolder(); }} value={newFolderName} /></Field>
          <DialogFooter><Button onClick={() => setFolderDialogOpen(false)} variant="brandOutline">Batal</Button><Button disabled={!newFolderName.trim()} onClick={() => void handleCreateFolder()} variant="brand">Buat folder</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) setEditingItem(null); }} open={Boolean(editingItem)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ganti nama</DialogTitle><DialogDescription>Nama baru tidak mengubah lokasi file di R2.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="rename-media-item">Nama</FieldLabel><FieldInput autoFocus id="rename-media-item" onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleRename(); }} value={editingName} /></Field>
          <DialogFooter><Button onClick={() => setEditingItem(null)} variant="brandOutline">Batal</Button><Button disabled={!editingName.trim()} onClick={() => void handleRename()} variant="brand">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) setMoveRequest(null); }} open={Boolean(moveRequest)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pindahkan item</DialogTitle><DialogDescription>Pilih folder tujuan untuk “{moveRequest?.name}”.</DialogDescription></DialogHeader>
          <Field><FieldLabel htmlFor="move-media-item">Folder tujuan</FieldLabel><select className={fieldControlClassName} id="move-media-item" onChange={(event) => setMoveTargetId(event.target.value)} value={moveTargetId}><option value="">Root library</option>{snapshot?.moveTargets.filter((target) => target.id !== moveRequest?.id).map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>
          <DialogFooter><Button onClick={() => setMoveRequest(null)} variant="brandOutline">Batal</Button><Button onClick={() => void handleMove()} variant="brand">Pindahkan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) setTrashRequest(null); }} open={Boolean(trashRequest)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pindahkan ke Trash?</DialogTitle><DialogDescription>“{trashRequest?.name}” tidak akan muncul di library atau picker baru. Referensi Bank Soal yang sudah ada tetap dapat membacanya.</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setTrashRequest(null)} variant="brandOutline">Batal</Button><Button onClick={() => void handleTrash()} variant="destructive"><Trash2 data-icon="inline-start" />Pindahkan ke Trash</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => { if (!open) setPreviewAsset(null); }} open={Boolean(previewAsset)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>{previewAsset?.name}</DialogTitle><DialogDescription>{previewAsset ? `${formatMediaBytes(previewAsset.sizeBytes)} · ${previewAsset.mimeType} · diupload oleh ${previewAsset.uploadedBy}` : "Preview gambar"}</DialogDescription></DialogHeader>
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-3xl bg-primary-50/70">
            {previewAsset?.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={previewAsset.name} className="max-h-[60vh] max-w-full object-contain" src={previewAsset.previewUrl} />
            ) : <div className="flex flex-col items-center gap-2 text-secondary-500"><ImageOff className="size-8" /><span>Preview belum tersedia</span></div>}
          </div>
          {isPicker && previewAsset ? <DialogFooter><Button onClick={() => onSelect?.(previewAsset)} variant="brand">Pilih gambar</Button></DialogFooter> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function MediaPickerDialog({
  onOpenChange,
  onSelect,
  open,
  selectedAssetId,
  title = "Pilih gambar",
}: {
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: MediaAssetDto) => void;
  open: boolean;
  selectedAssetId?: string | null;
  title?: string;
}) {
  const handleSelect = (asset: MediaAssetDto) => {
    onSelect(asset);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Pilih dari library Kapten atau upload gambar baru.</DialogDescription></DialogHeader>
        <MediaLibrary onSelect={handleSelect} scope="kapten" selectedAssetId={selectedAssetId} variant="picker" />
      </DialogContent>
    </Dialog>
  );
}

function MediaAssetPreview({
  assetId,
  alt,
  className,
  scope = "kapten",
}: {
  alt: string;
  assetId: string;
  className?: string;
  scope?: MediaScope;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/media/${scope}/assets/${assetId}/preview`, { cache: "no-store", signal: controller.signal })
      .then((response) => readJson<{ previewUrl: string }>(response))
      .then((payload) => setPreviewUrl(payload.previewUrl))
      .catch((previewError) => {
        if (!(previewError instanceof DOMException && previewError.name === "AbortError")) setHasError(true);
      });
    return () => controller.abort();
  }, [assetId, scope]);

  if (hasError) {
    return <div className={cn("flex min-h-24 items-center justify-center rounded-2xl bg-primary-50 text-sm text-secondary-500", className)}><ImageOff className="mr-2 size-4" />Gambar tidak tersedia</div>;
  }
  if (!previewUrl) return <Skeleton className={cn("min-h-24 w-full rounded-2xl", className)} />;

  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} className={cn("max-h-72 w-full rounded-2xl object-contain", className)} src={previewUrl} />;
}

export { MediaAssetPreview, MediaLibrary, MediaPickerDialog };
