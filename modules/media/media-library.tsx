"use client";

import {
  ChevronRight,
  FileImage,
  FileText,
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
} from "@/lib/icons";
import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  Fragment,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
  type ReactNode,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  allMediaMimeTypes,
  formatMediaBytes,
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

type MediaMutation = "create-folder" | "rename" | "move" | "trash";

const jakartaMonthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

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

const readImageDimensions = (file: File): Promise<{ height: number | null; width: number | null }> => new Promise<{ height: number | null; width: number | null }>((resolve) => {
  const image = new Image();
  const emptyDimensions = { height: null, width: null };
  const finish = () => resolve({ height: image.naturalHeight || null, width: image.naturalWidth || null });

  image.onerror = () => resolve(emptyDimensions);
  image.onload = finish;

  const reader = new FileReader();
  reader.onerror = () => resolve(emptyDimensions);
  reader.onload = () => {
    if (typeof reader.result === "string") image.src = reader.result;
    else resolve(emptyDimensions);
  };
  reader.readAsDataURL(file);
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

const getItemDate = (value: string) => {
  const jakartaDate = new Date(new Date(value).getTime() + (7 * 60 * 60 * 1000));
  const day = jakartaDate.getUTCDate();
  const month = jakartaMonthLabels[jakartaDate.getUTCMonth()];
  const year = jakartaDate.getUTCFullYear();
  return `${day} ${month} ${year}`;
};

type MediaLibraryScreenActions = {
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

function MediaLibraryScreen({
  acceptedMimeTypes,
  actions,
  className,
  error,
  editingItem,
  editingName,
  fileInputRef,
  folderDialogOpen,
  mediaLabel,
  moveRequest,
  moveTargetId,
  mutationPending,
  newFolderName,
  notice,
  previewAsset,
  query,
  searchInput,
  selectedAssetId,
  snapshot,
  trashRequest,
  uploadStatus,
  viewMode,
  viewState,
}: {
  acceptedMimeTypes: readonly SupportedMediaMimeType[];
  actions: MediaLibraryScreenActions;
  className?: string;
  error: string | null;
  editingItem: EditableItem | null;
  editingName: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderDialogOpen: boolean;
  mediaLabel: string;
  moveRequest: MoveRequest | null;
  moveTargetId: string;
  mutationPending: MediaMutation | null;
  newFolderName: string;
  notice: string | null;
  previewAsset: MediaAssetDto | null;
  query: string;
  searchInput: string;
  selectedAssetId?: string | null;
  snapshot: MediaLibrarySnapshot | null;
  trashRequest: TrashRequest | null;
  uploadStatus: UploadStatus | null;
  viewMode: "grid" | "list";
  viewState: { isDragging: boolean; isDrive: boolean; isLoading: boolean; isPicker: boolean };
}) {
  const { isDragging, isDrive, isLoading, isPicker } = viewState;
  const isMutationPending = (mutation: MediaMutation) => mutationPending === mutation;
  const renderItemMenu = (item: { id: string; kind: "asset" | "folder"; name: string; parentId: string | null }) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${item.name}`} size="icon-sm" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup><DropdownMenuItem onClick={() => actions.openRename(item)}><Pencil />Ganti nama</DropdownMenuItem><DropdownMenuItem onClick={() => actions.openMove(item)}><FolderInput />Pindahkan</DropdownMenuItem><DropdownMenuItem onClick={() => actions.setTrashRequest(item)} variant="destructive"><Trash2 />Masukkan Sampah</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent>
    </DropdownMenu>
  );
  const moveTargetOptions = snapshot?.moveTargets.reduce<ReactNode[]>((options, target) => {
    if (target.id !== moveRequest?.id) options.push(<option key={target.id} value={target.id}>{target.name}</option>);
    return options;
  }, []) ?? [];
  return (
    <section className={cn("flex min-w-0 flex-col gap-5", isDrive && "min-h-0 flex-1", className)}>
      <div className={cn("flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between", isDrive && "flex-row items-center p-0")}>
        <div className={cn("flex flex-wrap items-center gap-2", isDrive && "order-2 shrink-0")}>
          {!isPicker ? <Button aria-label="Buat folder baru" onClick={() => actions.setFolderDialogOpen(true)} size={isDrive ? "icon" : "default"} variant="brandOutline"><FolderPlus />{!isDrive ? "Folder baru" : null}</Button> : null}
          <Button aria-label={uploadStatus ? `Mengupload ${mediaLabel}` : `Upload ${mediaLabel}`} disabled={!snapshot?.isStorageConfigured || Boolean(uploadStatus)} onClick={() => fileInputRef.current?.click()} size={isDrive ? "icon" : "default"} variant="brand">{uploadStatus ? <LoaderCircle className="animate-spin" /> : <Upload />}{!isDrive ? (uploadStatus ? "Mengupload" : `Upload ${mediaLabel}`) : null}</Button>
          <input accept={acceptedMimeTypes.join(",")} aria-label={`Pilih ${mediaLabel} untuk diunggah`} className="sr-only" multiple onChange={(event) => void actions.handleFiles(Array.from(event.target.files ?? []))} ref={fileInputRef} type="file" />
        </div>
        <label className={cn("relative block w-full xl:max-w-md", isDrive && "order-1 min-w-0 flex-1 xl:w-auto xl:max-w-none")}><span className="sr-only">Cari {mediaLabel}</span><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-500" /><Input className={cn("h-11 border-primary-100 bg-white pl-11", isDrive && "rounded-full bg-primary-50/55 shadow-none")} onChange={(event) => actions.setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); actions.setQuery(searchInput.trim()); } }} placeholder={`Cari nama ${mediaLabel}...`} value={searchInput} /></label>
      </div>
      {!snapshot?.isStorageConfigured && !isLoading ? <div className="rounded-3xl border border-primary-100 bg-primary-50/70 px-5 py-4 text-sm leading-6 text-secondary-700" role="status">R2 belum dikonfigurasi. Tambahkan kredensial server untuk mengaktifkan upload dan preview media.</div> : null}
      {notice ? <p className="text-sm font-medium text-primary-800" role="status">{notice}</p> : null}
      {error ? <div className="flex flex-col gap-3 rounded-3xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><Button onClick={actions.refreshLibrary} size="sm" variant="ghost"><RefreshCw data-icon="inline-start" />Coba lagi</Button></div> : null}
      <div className={cn("relative min-h-[28rem] overflow-hidden rounded-[2rem] border border-primary-100 bg-white transition-[border-color,background-color] duration-150", isDrive && "flex min-h-0 flex-1 flex-col rounded-[1.5rem] bg-white/95 shadow-sm", isDragging && "border-primary-500 bg-primary-50/70")} onDragEnter={(event) => { event.preventDefault(); actions.setIsDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) actions.setIsDragging(false); }} onDragOver={(event) => event.preventDefault()} onDrop={actions.handleDrop}>
        {isDragging ? <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-[1.5rem] border-2 border-dashed border-primary-500 bg-primary-50/90 text-center"><div className="flex flex-col items-center gap-2 text-primary-900"><Upload className="size-8" /><p className="font-semibold">Lepaskan {mediaLabel} untuk upload</p><p className="text-sm text-secondary-600">{acceptedMimeTypes.join(", ")} · maksimal 15 MB</p></div></div> : null}
        <div className={cn("flex flex-col gap-4 border-b border-primary-100 px-5 py-4 md:px-6", isDrive && "gap-3 px-5 py-3 md:px-6 md:py-4")}>
          {isDrive ? <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex min-w-0 flex-col justify-center gap-1.5"><h1 className="text-xl leading-tight font-semibold tracking-[-0.02em] text-secondary-900 md:text-2xl">Media</h1></div><div aria-label="Tampilan media" className="flex items-center rounded-full border border-primary-100 bg-primary-50/60 p-0.5" role="group"><Button aria-label="Tampilan daftar" aria-pressed={viewMode === "list"} className="rounded-full" onClick={() => actions.setViewMode("list")} size="icon-sm" variant={viewMode === "list" ? "brand" : "ghost"}><List /></Button><Button aria-label="Tampilan grid" aria-pressed={viewMode === "grid"} className="rounded-full" onClick={() => actions.setViewMode("grid")} size="icon-sm" variant={viewMode === "grid" ? "brand" : "ghost"}><LayoutGrid /></Button></div></div> : null}
          <div className={cn("flex flex-wrap items-center justify-between gap-3", isDrive && snapshot?.breadcrumbs.length === 1 && "hidden")}><Breadcrumb><BreadcrumbList>{snapshot?.breadcrumbs.map((breadcrumb, index) => <Fragment key={breadcrumb.id ?? "root"}>{index > 0 ? <BreadcrumbSeparator /> : null}<BreadcrumbItem>{index === (snapshot?.breadcrumbs.length ?? 0) - 1 ? <BreadcrumbPage>{breadcrumb.name}</BreadcrumbPage> : <button className="min-h-11 rounded-xl px-2 text-sm font-medium text-secondary-600 transition-colors hover:bg-primary-50 hover:text-primary-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20" onClick={() => actions.setFolderId(breadcrumb.id)} type="button">{breadcrumb.name}</button>}</BreadcrumbItem></Fragment>)}</BreadcrumbList></Breadcrumb></div>
        </div>
        {uploadStatus ? <div className="border-b border-primary-100 bg-primary-50/60 px-5 py-4 md:px-6" role="status"><div className="flex items-center justify-between gap-4 text-sm"><span className="truncate font-medium text-secondary-900">{uploadStatus.current}/{uploadStatus.total} · {uploadStatus.fileName}</span><span className="text-primary-800">{uploadStatus.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-100"><div className="h-full rounded-full bg-primary-700 transition-[width] duration-150" style={{ width: `${uploadStatus.progress}%` }} /></div></div> : null}
        <div className={cn("min-h-0", isDrive && "flex-1 overflow-y-auto")}>
          {isLoading ? <div className={cn("flex flex-col gap-3 p-5 md:p-6", isDrive && viewMode === "grid" && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6")}>{Array.from({ length: 5 }, (_, index) => <Skeleton className={cn("h-16 w-full rounded-2xl", isDrive && viewMode === "grid" && "h-56")} key={index} />)}</div> : snapshot && (snapshot.folders.length > 0 || snapshot.assets.length > 0) ? <div className={cn("flex flex-col", isDrive && "gap-7 p-5 md:p-7")}>
            {snapshot.folders.length > 0 ? <div className={cn("flex flex-col", isDrive && "gap-3")}><div className={cn("px-5 pt-5 pb-2 text-xs font-semibold tracking-[0.1em] text-secondary-500 uppercase md:px-6", isDrive && "px-0 pt-0 pb-0 md:px-0")}>Folder</div><div className={cn(isDrive && "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6")}>{snapshot.folders.map((folderItem) => <div className={cn("grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-primary-100 px-4 transition-colors hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.4fr)_0.7fr_44px] md:px-6", isDrive && "min-h-16 rounded-2xl border border-primary-100 bg-primary-50/40 px-3 hover:border-primary-200 hover:bg-primary-50 md:grid-cols-[minmax(0,1fr)_auto] md:px-3")} key={folderItem.id}><button className="flex min-h-16 min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20" onClick={() => actions.setFolderId(folderItem.id)} type="button"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800"><Folder className="size-5" /></span><span className="min-w-0"><span className="block truncate font-semibold text-secondary-900">{folderItem.name}</span>{isDrive ? <span className="mt-0.5 block text-xs text-secondary-500">{getItemDate(folderItem.updatedAt)}</span> : null}</span></button><span className={cn("hidden text-sm text-secondary-500 md:block", isDrive && "md:hidden")}>Diperbarui {getItemDate(folderItem.updatedAt)}</span>{isPicker ? <ChevronRight className="size-4 text-secondary-400" /> : renderItemMenu({ id: folderItem.id, kind: "folder", name: folderItem.name, parentId: folderItem.parentId })}</div>)}</div></div> : null}
            {snapshot.folders.length > 0 && snapshot.assets.length > 0 && !isDrive ? <Separator /> : null}
            {snapshot.assets.length > 0 ? <div className={cn("flex flex-col", isDrive && "gap-3")}>{!(isDrive && viewMode === "grid") ? <div className={cn("hidden grid-cols-[minmax(0,1.4fr)_0.55fr_0.65fr_0.7fr_44px] gap-3 px-6 py-3 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase md:grid", isDrive && viewMode === "list" && "px-4")}><span>Nama</span><span>Ukuran</span><span>Dimensi</span><span>Diperbarui</span><span /></div> : null}<div className={cn(isDrive && viewMode === "grid" && "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6")}>{snapshot.assets.map((asset) => <div className={cn("grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-primary-100 px-4 transition-colors hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.4fr)_0.55fr_0.65fr_0.7fr_44px] md:px-6", isDrive && viewMode === "list" && "min-h-16 rounded-2xl border border-primary-100 px-3 hover:border-primary-200 md:px-4", isDrive && viewMode === "grid" && "group relative block overflow-hidden rounded-2xl border border-primary-100 bg-primary-50/35 p-1.5 hover:border-primary-200 hover:bg-primary-50/70", selectedAssetId === asset.id && "bg-primary-50")} key={asset.id}><button className={cn("flex min-h-[4.5rem] min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20", isDrive && viewMode === "list" && "min-h-16", isDrive && viewMode === "grid" && "flex w-full flex-col items-stretch gap-0 rounded-xl")} onClick={() => void actions.handlePreview(asset)} type="button"><span className={cn("relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-50 text-primary-800", isDrive && viewMode === "list" && "size-10", isDrive && viewMode === "grid" && "aspect-[5/3] size-auto w-full rounded-xl bg-white")}>{isPdfMimeType(asset.mimeType) ? <FileText className="size-7 text-primary-800" /> : asset.thumbnailUrl ?? asset.previewUrl ? <NextImage alt="" className={cn("size-full object-cover", isDrive && viewMode === "grid" && "object-contain p-2")} fill loading="lazy" sizes={isDrive && viewMode === "grid" ? "(min-width: 1536px) 16vw, (min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" : "3rem"} src={asset.thumbnailUrl ?? asset.previewUrl ?? ""} unoptimized /> : <FileImage className="size-5" />}</span><span className={cn("min-w-0", isDrive && viewMode === "grid" && "w-full px-2 pt-3 pb-1")}><span className="block truncate font-semibold text-secondary-900">{asset.name}</span><span className={cn("mt-1 block text-xs text-secondary-500 md:hidden", isDrive && viewMode === "grid" && "md:block")}>{formatMediaBytes(asset.sizeBytes)} · {getItemDate(asset.updatedAt)}</span></span></button><span className={cn("hidden text-sm text-secondary-500 md:block", isDrive && viewMode === "grid" && "md:hidden")}>{formatMediaBytes(asset.sizeBytes)}</span><span className={cn("hidden text-sm text-secondary-500 md:block", isDrive && viewMode === "grid" && "md:hidden")}>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</span><div className={cn("hidden items-center gap-2 text-sm text-secondary-500 md:flex", isDrive && viewMode === "grid" && "md:hidden")}><span>{getItemDate(asset.updatedAt)}</span>{isPicker ? <Button onClick={() => actions.onSelect?.(asset)} size="sm" variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}>{selectedAssetId === asset.id ? "Dipilih" : "Pilih"}<ChevronRight data-icon="inline-end" /></Button> : null}</div>{isPicker ? <Button aria-label={`Pilih ${asset.name}`} className="md:hidden" onClick={() => actions.onSelect?.(asset)} size="icon-sm" variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}><ChevronRight /></Button> : <div className={cn(isDrive && viewMode === "grid" && "absolute top-3 right-3 rounded-full bg-white/95 shadow-sm")}>{renderItemMenu({ id: asset.id, kind: "asset", name: asset.name, parentId: asset.parentId })}</div>}</div>)}</div></div> : null}
          </div> : <Empty className="min-h-[22rem] border-0"><EmptyHeader><EmptyMedia variant="icon">{query ? <Search /> : <FileImage />}</EmptyMedia><EmptyTitle>{query ? `${mediaLabel[0].toUpperCase()}${mediaLabel.slice(1)} tidak ditemukan` : "Folder ini masih kosong"}</EmptyTitle><EmptyDescription>{query ? "Coba nama file lain atau hapus pencarian." : `Upload ${mediaLabel} atau buat folder untuk mulai menyusun library.`}</EmptyDescription></EmptyHeader>{!query ? <EmptyContent><Button disabled={!snapshot?.isStorageConfigured} onClick={() => fileInputRef.current?.click()} variant="brand"><Upload data-icon="inline-start" />Upload {mediaLabel}</Button></EmptyContent> : null}</Empty>}
        </div>
      </div>
      <Dialog onOpenChange={(open) => { if (open || !mutationPending) actions.setFolderDialogOpen(open); }} open={folderDialogOpen}><DialogContent pending={isMutationPending("create-folder")} showCloseButton={!isMutationPending("create-folder")} variant="default"><DialogHeader><DialogTitle>Folder baru</DialogTitle><DialogDescription>Buat folder di lokasi yang sedang dibuka.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="new-media-folder">Nama folder</FieldLabel><FieldInput autoFocus disabled={isMutationPending("create-folder")} id="new-media-folder" onChange={(event) => actions.setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void actions.handleCreateFolder(); }} value={newFolderName} /></Field><DialogFooter><Button disabled={isMutationPending("create-folder")} onClick={() => actions.setFolderDialogOpen(false)} variant="brandOutline">Batal</Button><Button disabled={!newFolderName.trim() || isMutationPending("create-folder")} onClick={() => void actions.handleCreateFolder()} variant="brand">{isMutationPending("create-folder") ? "Menyimpan…" : "Buat folder"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog onOpenChange={(open) => { if (open || !mutationPending) { if (!open) actions.setEditingItem(null); } }} open={Boolean(editingItem)}><DialogContent pending={isMutationPending("rename")} showCloseButton={!isMutationPending("rename")} variant="default"><DialogHeader><DialogTitle>Ganti nama</DialogTitle><DialogDescription>Nama baru tidak mengubah lokasi file di R2.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="rename-media-item">Nama</FieldLabel><FieldInput autoFocus disabled={isMutationPending("rename")} id="rename-media-item" onChange={(event) => actions.setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void actions.handleRename(); }} value={editingName} /></Field><DialogFooter><Button disabled={isMutationPending("rename")} onClick={() => actions.setEditingItem(null)} variant="brandOutline">Batal</Button><Button disabled={!editingName.trim() || isMutationPending("rename")} onClick={() => void actions.handleRename()} variant="brand">{isMutationPending("rename") ? "Menyimpan…" : "Simpan"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog onOpenChange={(open) => { if (open || !mutationPending) { if (!open) actions.setMoveRequest(null); } }} open={Boolean(moveRequest)}><DialogContent pending={isMutationPending("move")} showCloseButton={!isMutationPending("move")} variant="default"><DialogHeader><DialogTitle>Pindahkan item</DialogTitle><DialogDescription>Pilih folder tujuan untuk “{moveRequest?.name}”.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="move-media-item">Folder tujuan</FieldLabel><select aria-label="Folder tujuan" className={fieldControlClassName} disabled={isMutationPending("move")} id="move-media-item" onChange={(event) => actions.setMoveTargetId(event.target.value)} value={moveTargetId}><option value="">Root library</option>{moveTargetOptions}</select></Field><DialogFooter><Button disabled={isMutationPending("move")} onClick={() => actions.setMoveRequest(null)} variant="brandOutline">Batal</Button><Button disabled={isMutationPending("move")} onClick={() => void actions.handleMove()} variant="brand">{isMutationPending("move") ? "Memindahkan…" : "Pindahkan"}</Button></DialogFooter></DialogContent></Dialog>
      <AlertDialog onOpenChange={(open) => { if ((open || !mutationPending) && !open) actions.setTrashRequest(null); }} open={Boolean(trashRequest)}><AlertDialogContent pending={isMutationPending("trash")} size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Masukkan ke Sampah?</AlertDialogTitle><AlertDialogDescription>“{trashRequest?.name}” tidak akan muncul di library atau picker baru. Referensi Bank Soal yang sudah ada tetap dapat membacanya.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isMutationPending("trash")}>Batal</AlertDialogCancel><AlertDialogAction disabled={isMutationPending("trash")} onClick={() => void actions.handleTrash()} variant="destructive">{isMutationPending("trash") ? "Memproses…" : "Masukkan Sampah"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog onOpenChange={(open) => { if (!open) actions.setPreviewAsset(null); }} open={Boolean(previewAsset)}><DialogContent className="sm:max-w-4xl" variant="info"><DialogHeader><DialogTitle>{previewAsset?.name}</DialogTitle><DialogDescription>{previewAsset ? `${formatMediaBytes(previewAsset.sizeBytes)} · ${previewAsset.mimeType} · diupload oleh ${previewAsset.uploadedBy}` : "Preview media"}</DialogDescription></DialogHeader><div className="flex min-h-64 items-center justify-center overflow-hidden rounded-3xl bg-primary-50/70">{previewAsset?.previewUrl && isPdfMimeType(previewAsset.mimeType) ? <div className="flex w-full flex-col gap-4 p-4"><iframe className="h-[60vh] min-h-96 w-full rounded-2xl border border-primary-100 bg-white" sandbox="" src={previewAsset.previewUrl} title={`Preview ${previewAsset.name}`} /><div className="flex flex-wrap items-center justify-center gap-2"><Button nativeButton={false} render={<a href={previewAsset.previewUrl} rel="noreferrer" target="_blank" />} size="default" variant="brandOutline"><FileText className="size-4" />Buka PDF</Button><Button nativeButton={false} render={<a download={previewAsset.name} href={previewAsset.previewUrl} />} size="default" variant="brand">Download PDF</Button></div></div> : previewAsset?.previewUrl ? <div className="relative min-h-64 w-full"><NextImage alt={previewAsset.name} className="object-contain" fill sizes="(min-width: 1024px) 60vw, 90vw" src={previewAsset.previewUrl} unoptimized /></div> : <div className="flex flex-col items-center gap-2 text-secondary-500"><ImageOff className="size-8" /><span>Preview belum tersedia</span></div>}</div>{isPicker && previewAsset ? <DialogFooter><Button onClick={() => actions.onSelect?.(previewAsset)} variant="brand">Pilih {isPdfMimeType(previewAsset.mimeType) ? "PDF" : "gambar"}</Button></DialogFooter> : null}</DialogContent></Dialog>
    </section>
  );
}

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
    refreshLibrary(files.length === 1 ? `${mediaLabel[0].toUpperCase()}${mediaLabel.slice(1)} berhasil diupload.` : `${files.length} ${mediaLabel} berhasil diupload.`);
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
  appearance?: "default" | "drive";
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
  const isDrive = appearance === "drive" && !isPicker;
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
    viewState={{ isDragging, isDrive, isLoading, isPicker }}
  />;
}

function MediaPickerDialog({
  allowedMimeTypes,
  onOpenChange,
  onSelect,
  open,
  selectedAssetId,
  title,
}: {
  allowedMimeTypes?: readonly SupportedMediaMimeType[];
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
  const isPdfPicker = allowedMimeTypes?.length === 1 && isPdfMimeType(allowedMimeTypes[0]);
  const pickerTitle = title ?? (isPdfPicker ? "Pilih PDF" : "Pilih gambar");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl" variant="info">
        <DialogHeader><DialogTitle>{pickerTitle}</DialogTitle><DialogDescription>Pilih dari library Kapten atau upload {isPdfPicker ? "PDF baru" : "gambar baru"}.</DialogDescription></DialogHeader>
        <MediaLibrary allowedMimeTypes={allowedMimeTypes} onSelect={handleSelect} scope="kapten" selectedAssetId={selectedAssetId} variant="picker" />
      </DialogContent>
    </Dialog>
  );
}

function MediaAssetPreview({
  assetId,
  alt,
  className,
  showDownloadControls = false,
  scope = "kapten",
}: {
  alt: string;
  assetId: string;
  className?: string;
  showDownloadControls?: boolean;
  scope?: MediaScope;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/media/${scope}/assets/${assetId}/preview`, { cache: "no-store", signal: controller.signal })
      .then((response) => readJson<{ mimeType?: string; previewUrl: string }>(response))
      .then((payload) => {
        setMimeType(payload.mimeType ?? null);
        setPreviewUrl(payload.previewUrl);
      })
      .catch((previewError) => {
        if (!(previewError instanceof DOMException && previewError.name === "AbortError")) setHasError(true);
      });
    return () => controller.abort();
  }, [assetId, scope]);

  if (hasError) {
    return <div className={cn("flex min-h-24 items-center justify-center rounded-2xl bg-primary-50 text-sm text-secondary-500", className)}><ImageOff className="mr-2 size-4" />Media tidak tersedia</div>;
  }
  if (!previewUrl) return <Skeleton className={cn("min-h-24 w-full rounded-2xl", className)} />;

  if (isPdfMimeType(mimeType)) {
    return <div className={cn("flex min-h-24 flex-wrap items-center justify-center gap-2 rounded-2xl bg-primary-50 px-4", className)}>
      <Button
        nativeButton={false}
        render={<a href={previewUrl} rel="noreferrer" target="_blank" />}
        size="default"
        variant="brandOutline"
      >
        <FileText className="size-5" />
        Buka PDF
      </Button>
      {showDownloadControls ? <Button
        nativeButton={false}
        render={<a download href={previewUrl} />}
        size="default"
        variant="brand"
      >
        Download PDF
      </Button> : null}
    </div>;
  }

  return <div className={cn("relative min-h-24 w-full", className)}><NextImage alt={alt} className="object-contain" fill sizes="(min-width: 768px) 36rem, 100vw" src={previewUrl} unoptimized /></div>;
}

export { MediaAssetPreview, MediaLibrary, MediaPickerDialog };
