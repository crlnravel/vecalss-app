"use client";

import {
  Fragment,
  useState,
  type RefObject,
} from "react";
import NextImage from "next/image";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronRight,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  ListChecks,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "@/lib/icons";
import {
  formatMediaBytes,
  isImageMimeType,
  isPdfMimeType,
  type SupportedMediaMimeType,
} from "@/lib/media/domain";
import type {
  MediaAssetDto,
  MediaLibrarySnapshot,
} from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  compareFolders,
  driveAssetGridStyle,
  driveFolderGridStyle,
  getItemDate,
  itemContextMenuPopupClassName,
} from "../helpers";
import type {
  EditableItem,
  MediaAssetFilter,
  MediaLibraryScreenActions,
  MediaMutation,
  MediaSortMode,
  MoveRequest,
  TrashRequest,
  UploadStatus,
} from "../types";
import { MediaLibraryItemsView } from "./MediaLibraryItemsView";
import { MediaLibraryModals } from "./MediaLibraryModals";

function useMediaLibraryScreenState({
  actions,
  isMinimalGallery,
  isPicker,
  isReference,
  moveRequest,
  selectedAssetId,
  snapshot,
}: {
  actions: MediaLibraryScreenActions;
  isMinimalGallery: boolean;
  isPicker: boolean;
  isReference: boolean;
  moveRequest: MoveRequest | null;
  selectedAssetId?: string | null;
  snapshot: MediaLibrarySnapshot | null;
}) {
  const [sortMode, setSortMode] = useState<MediaSortMode>("updated");
  const [assetFilter, setAssetFilter] = useState<MediaAssetFilter>("all");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [assetPage, setAssetPage] = useState(1);

  const toggleSelectedItem = (id: string) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const beginSelection = (id: string) => {
    setSelectionMode(true);
    toggleSelectedItem(id);
  };
  const renderItemMenuItems = (item: { id: string; kind: "asset" | "folder"; name: string; parentId: string | null }) => (
    <DropdownMenuGroup>
      {isReference ? <DropdownMenuItem onClick={() => beginSelection(item.id)}><ListChecks />Pilih</DropdownMenuItem> : null}
      <DropdownMenuItem onClick={() => actions.openRename(item)}><Pencil />Ganti nama</DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.openMove(item)}><FolderInput />Pindahkan</DropdownMenuItem>
      <DropdownMenuItem onClick={() => actions.setTrashRequest(item)} variant="destructive"><Trash2 />Masukkan Sampah</DropdownMenuItem>
    </DropdownMenuGroup>
  );
  const renderItemMenu = (item: { id: string; kind: "asset" | "folder"; name: string; parentId: string | null }) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${item.name}`} className="size-8" size="icon-sm" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">{renderItemMenuItems(item)}</DropdownMenuContent>
    </DropdownMenu>
  );
  const renderItemContextMenu = (item: { id: string; kind: "asset" | "folder"; name: string; parentId: string | null }) => (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="isolate z-50 outline-none">
        <ContextMenuPrimitive.Popup className={itemContextMenuPopupClassName}>{renderItemMenuItems(item)}</ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );

  const compareAssets = (left: MediaAssetDto, right: MediaAssetDto) => {
    if (sortMode === "name") return left.name.localeCompare(right.name, "id");
    if (sortMode === "size") return right.sizeBytes - left.sizeBytes;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  };
  const visibleFolders = [...(snapshot?.folders ?? [])].sort(compareFolders);
  const allVisibleAssets = [...(snapshot?.assets ?? [])]
    .filter((asset) => assetFilter === "all" || (assetFilter === "pdf" ? isPdfMimeType(asset.mimeType) : isImageMimeType(asset.mimeType)))
    .sort(compareAssets);
  const assetPageSize = 10;
  const assetPageCount = Math.max(1, Math.ceil(allVisibleAssets.length / assetPageSize));
  const activeAssetPage = Math.min(assetPage, assetPageCount);
  const visibleAssets = isMinimalGallery
    ? allVisibleAssets
    : allVisibleAssets.slice((activeAssetPage - 1) * assetPageSize, activeAssetPage * assetPageSize);
  const visibleItemIds = [...visibleFolders.map((folderItem) => folderItem.id), ...visibleAssets.map((asset) => asset.id)];
  const selectedVisibleItemCount = visibleItemIds.filter((id) => selectedItemIds.has(id)).length;
  const allVisibleItemsSelected = visibleItemIds.length > 0 && visibleItemIds.every((id) => selectedItemIds.has(id));
  const toggleAllVisibleItems = () => {
    setSelectedItemIds((current) => {
      if (allVisibleItemsSelected) {
        const visibleSet = new Set(visibleItemIds);
        return new Set([...current].filter((id) => !visibleSet.has(id)));
      }
      return new Set([...current, ...visibleItemIds]);
    });
  };
  const navigateToFolder = (id: string | null) => {
    setAssetPage(1);
    actions.setFolderId(id);
  };
  const renderDriveFolder = (folderItem: MediaLibrarySnapshot["folders"][number]) => {
    const item = { id: folderItem.id, kind: "folder" as const, name: folderItem.name, parentId: folderItem.parentId };

    return (
      <ContextMenuPrimitive.Root key={folderItem.id}>
        <ContextMenuPrimitive.Trigger
          className={cn(
            isReference
              ? "group relative flex min-h-16 items-center gap-3 rounded-3xl border border-primary-100 bg-white px-3.5 py-2.5 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)]"
              : "group relative flex min-h-16 items-center gap-3 rounded-lg border border-primary-100 bg-white px-3.5 py-2.5 shadow-[0_8px_20px_-22px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:border-primary-200 hover:bg-primary-50/35 hover:shadow-[0_14px_26px_-22px_color-mix(in_oklab,var(--voyage-forest)_70%,transparent)]",
            selectedItemIds.has(folderItem.id) && "border-primary-300 bg-primary-50/60",
          )}
        >
          {!isReference || selectionMode ? (
            <Checkbox
              aria-label={`Pilih folder ${folderItem.name}`}
              checked={selectedItemIds.has(folderItem.id)}
              className="size-5 rounded-md border-primary-200 bg-white"
              onCheckedChange={() => toggleSelectedItem(folderItem.id)}
            />
          ) : null}
          <button
            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20"
            onClick={() => navigateToFolder(folderItem.id)}
            type="button"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-800">
              <Folder className="size-5" weight="fill" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-secondary-900">{folderItem.name}</span>
              <span className="mt-0.5 block truncate text-xs text-secondary-500">Updated {getItemDate(folderItem.updatedAt)}</span>
            </span>
          </button>
          <div className="shrink-0 opacity-60 transition-opacity group-hover:opacity-100">{renderItemMenu(item)}</div>
        </ContextMenuPrimitive.Trigger>
        {renderItemContextMenu(item)}
      </ContextMenuPrimitive.Root>
    );
  };

  const renderDriveAsset = (asset: MediaAssetDto) => {
    const assetUrl = asset.thumbnailUrl ?? asset.previewUrl;
    const item = { id: asset.id, kind: "asset" as const, name: asset.name, parentId: asset.parentId };

    if (isMinimalGallery) {
      return (
        <button
          aria-label={`Pilih ${asset.name}`}
          aria-pressed={selectedAssetId === asset.id}
          className={cn(
            "group relative aspect-[1.35] overflow-hidden rounded-xl border bg-primary-50/70 transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary-300 hover:shadow-[0_14px_28px_-22px_color-mix(in_oklab,var(--voyage-forest)_80%,transparent)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/25",
            selectedAssetId === asset.id ? "border-primary-700 ring-2 ring-primary-700/20" : "border-primary-100",
          )}
          key={asset.id}
          onClick={() => actions.onSelect?.(asset)}
          type="button"
        >
          {assetUrl ? (
            <NextImage alt="" className="size-full object-cover" fill loading="lazy" sizes="(min-width: 1280px) 18rem, (min-width: 768px) 14rem, 50vw" src={assetUrl} unoptimized />
          ) : (
            <FileImage aria-hidden="true" className="absolute inset-0 m-auto size-7 text-primary-700" />
          )}
        </button>
      );
    }

    return (
      <ContextMenuPrimitive.Root key={asset.id}>
        <ContextMenuPrimitive.Trigger
          className={cn(
            isReference
              ? "group relative overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] transition-[border-color,box-shadow,transform] hover:z-10 hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_24px_52px_-30px_color-mix(in_oklab,var(--voyage-forest)_55%,transparent)]"
              : "group relative overflow-hidden rounded-lg border border-primary-100 bg-white shadow-[0_12px_26px_-24px_color-mix(in_oklab,var(--voyage-forest)_70%,transparent)] transition-[border-color,box-shadow,transform] hover:z-10 hover:scale-[1.015] hover:border-primary-200 hover:shadow-[0_18px_30px_-22px_color-mix(in_oklab,var(--voyage-forest)_75%,transparent)]",
            selectedItemIds.has(asset.id) && "border-primary-300 shadow-[0_18px_34px_-22px_color-mix(in_oklab,var(--voyage-forest)_80%,transparent)]",
          )}
        >
          <div className="relative aspect-[1.84] overflow-hidden bg-primary-50/75">
            <button
            aria-label={`Preview ${asset.name}`}
            className="absolute inset-0 flex items-center justify-center overflow-hidden focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/30"
            onClick={() => void actions.handlePreview(asset)}
            type="button"
            >
              {isPdfMimeType(asset.mimeType) ? <FileText className="size-10 text-primary-700" /> : assetUrl ? <NextImage alt="" className="size-full object-cover" fill loading="lazy" sizes="(min-width: 1536px) 16vw, (min-width: 1280px) 20vw, (min-width: 768px) 33vw, 100vw" src={assetUrl} unoptimized /> : <FileImage className="size-7 text-primary-700" />}
            </button>
            {isPicker ? (
              <Button
                aria-label={`Pilih ${asset.name}`}
                className="absolute right-2 bottom-2 z-10 bg-white/95 shadow-sm hover:bg-white"
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onSelect?.(asset);
                }}
                size="sm"
                variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}
              >
                {selectedAssetId === asset.id ? "Dipilih" : "Pilih"}
              </Button>
            ) : null}
            {!isReference || selectionMode ? (
            <Checkbox
              aria-label={`Pilih ${asset.name}`}
              checked={selectedItemIds.has(asset.id)}
              className="absolute top-2.5 left-2.5 z-10 size-5 rounded-md border-white/80 bg-white/90 shadow-sm"
              onCheckedChange={() => toggleSelectedItem(asset.id)}
            />
          ) : null}
          <div className="absolute top-2 right-2 z-10 rounded-full bg-white/90 opacity-60 shadow-sm transition-opacity group-hover:opacity-100">{renderItemMenu(item)}</div>
        </div>
        <div className="min-w-0 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-secondary-900" title={asset.name}>{asset.name}</p>
            <p className="mt-0.5 truncate text-xs text-secondary-500">{formatMediaBytes(asset.sizeBytes)}</p>
          </div>
        </div>
        </ContextMenuPrimitive.Trigger>
        {renderItemContextMenu(item)}
      </ContextMenuPrimitive.Root>
    );
  };

  const moveTargetOptions = snapshot?.moveTargets.reduce<Array<{ label: string; value: string }>>((options, target) => {
    if (target.id !== moveRequest?.id) options.push({ label: target.name, value: target.id });
    return options;
  }, []) ?? [];

  return {
    activeAssetPage,
    allVisibleAssets,
    allVisibleItemsSelected,
    assetFilter,
    assetPageCount,
    moveTargetOptions,
    navigateToFolder,
    renderDriveAsset,
    renderDriveFolder,
    renderItemMenu,
    selectedItemIds,
    selectedVisibleItemCount,
    selectionMode,
    setAssetFilter,
    setAssetPage,
    setSelectedItemIds,
    setSelectionMode,
    setSortMode,
    sortMode,
    toggleAllVisibleItems,
    visibleAssets,
    visibleFolders,
  };
}

export function MediaLibraryScreen({
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
  viewState: { isDragging: boolean; isDrive: boolean; isLoading: boolean; isMinimalGallery: boolean; isPicker: boolean; isReference: boolean };
}) {
  const { isDragging, isDrive, isLoading, isMinimalGallery, isPicker, isReference } = viewState;
  const referenceBreadcrumbs = snapshot?.breadcrumbs.length
    ? snapshot.breadcrumbs
    : [{ id: null, name: "Media Kapten" }];
  const isMutationPending = (mutation: MediaMutation) => mutationPending === mutation;
  const {
    activeAssetPage,
    allVisibleAssets,
    allVisibleItemsSelected,
    assetFilter,
    assetPageCount,
    moveTargetOptions,
    navigateToFolder,
    renderDriveAsset,
    renderDriveFolder,
    renderItemMenu,
    selectedVisibleItemCount,
    selectionMode,
    setAssetFilter,
    setAssetPage,
    setSelectedItemIds,
    setSelectionMode,
    setSortMode,
    sortMode,
    toggleAllVisibleItems,
    visibleAssets,
    visibleFolders,
  } = useMediaLibraryScreenState({
    actions,
    isMinimalGallery,
    isPicker,
    isReference,
    moveRequest,
    selectedAssetId,
    snapshot,
  });

  const referenceFilterOptions: Array<{ label: string; value: MediaAssetFilter }> = [
    { label: "Semua", value: "all" },
    { label: "Gambar", value: "images" },
    ...(acceptedMimeTypes.some((mimeType) => isPdfMimeType(mimeType)) ? [{ label: "PDF", value: "pdf" as const }] : []),
  ];
  const referenceToolbar = (
    <div className="space-y-5">
      <CompactFilterTabs
        aria-label="Filter media"
        items={referenceFilterOptions}
        onValueChange={(value) => {
          setAssetFilter(value);
          setAssetPage(1);
          setSelectedItemIds(new Set());
        }}
        value={assetFilter}
      />
      <label className="relative block w-full max-w-2xl">
        <span className="sr-only">Cari {mediaLabel}</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700" />
        <Input
          className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12 rounded-2xl py-2 pl-11 shadow-sm`}
          onChange={(event) => actions.setSearchInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setAssetPage(1);
              actions.setQuery(searchInput.trim());
            }
          }}
          placeholder={`Cari nama ${mediaLabel}...`}
          type="search"
          value={searchInput}
        />
      </label>
      {selectionMode ? (
        <ReferenceSurface as="div" className="flex flex-wrap items-center gap-3 p-3" variant="inset">
          <Checkbox aria-label="Pilih semua item yang terlihat" checked={allVisibleItemsSelected} className="size-5 rounded-md border-primary-200" onCheckedChange={toggleAllVisibleItems} />
          <span className="text-sm font-semibold text-secondary-900">{selectedVisibleItemCount ? `${selectedVisibleItemCount} dipilih` : "Pilih media"}</span>
          <Button
            aria-label="Selesai memilih media"
            className="ml-auto"
            onClick={() => {
              setSelectionMode(false);
              setSelectedItemIds(new Set());
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        </ReferenceSurface>
      ) : null}
    </div>
  );

  const submitSearch = () => {
    setAssetPage(1);
    actions.setQuery(searchInput.trim());
  };

  if (isMinimalGallery) {
    return (
      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-3", className)}>
        <div className="flex shrink-0 items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Cari media</span>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-500" />
            <Input
              aria-label="Cari media"
              className="h-10 border-primary-100 bg-primary-50/45 pl-10 shadow-none"
              onChange={(event) => actions.setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Cari media"
              type="search"
              value={searchInput}
            />
          </label>
          <Button aria-label="Cari media" className="shrink-0" onClick={submitSearch} size="icon-sm" type="button" variant="ghost">
            <Search />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button aria-label="Tambah media" className="shrink-0" disabled={Boolean(uploadStatus)} size="icon-sm" type="button" variant="brandOutline" />}>
              {uploadStatus ? <LoaderCircle className="animate-spin" /> : <Plus />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={!snapshot?.isStorageConfigured} onClick={() => fileInputRef.current?.click()}>
                <Upload />File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.setFolderDialogOpen(true)}>
                <FolderPlus />Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <input
          accept={acceptedMimeTypes.join(",")}
          aria-label="Pilih gambar untuk diunggah"
          className="sr-only"
          multiple
          onChange={(event) => void actions.handleFiles(Array.from(event.target.files ?? []))}
          ref={fileInputRef}
          type="file"
        />
        {uploadStatus ? (
          <div className="sr-only" role="status">
            Mengupload {uploadStatus.fileName}, {uploadStatus.progress}%.
          </div>
        ) : null}
        {!snapshot?.isStorageConfigured && !isLoading ? (
          <span className="sr-only" role="status">Penyimpanan media belum dikonfigurasi.</span>
        ) : null}
        {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
        <div
          className={cn("relative min-h-0 flex-1 overflow-y-auto", isDragging && "rounded-xl bg-primary-50/60 ring-2 ring-primary-500/35")}
          onDragEnter={(event) => {
            event.preventDefault();
            actions.setIsDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) actions.setIsDragging(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={actions.handleDrop}
        >
          {isDragging ? (
            <div className="pointer-events-none absolute inset-2 z-10 rounded-xl border-2 border-dashed border-primary-500 bg-primary-50/90">
              <span className="sr-only">Lepaskan gambar untuk mengupload.</span>
            </div>
          ) : null}
          <MediaLibraryItemsView
            actions={actions}
            activeAssetPage={activeAssetPage}
            allVisibleAssets={allVisibleAssets}
            assetFilter={assetFilter}
            assetPageCount={assetPageCount}
            driveAssetGridStyle={driveAssetGridStyle}
            driveFolderGridStyle={driveFolderGridStyle}
            fileInputRef={fileInputRef}
            flags={{ isDrive, isLoading, isMinimalGallery, isPicker, isReference }}
            itemRenderers={{ driveAsset: renderDriveAsset, driveFolder: renderDriveFolder, itemMenu: renderItemMenu }}
            mediaLabel={mediaLabel}
            query={query}
            selectedAssetId={selectedAssetId}
            setAssetPage={setAssetPage}
            snapshot={snapshot}
            viewMode="grid"
            visibleAssets={visibleAssets}
            visibleFolders={visibleFolders}
          />
        </div>
        <MediaLibraryModals
          actions={actions}
          editingItem={editingItem}
          editingName={editingName}
          folderDialogOpen={folderDialogOpen}
          isMutationPending={isMutationPending}
          isPicker={isPicker}
          moveRequest={moveRequest}
          moveTargetId={moveTargetId}
          moveTargetOptions={moveTargetOptions}
          mutationPending={mutationPending}
          newFolderName={newFolderName}
          previewAsset={previewAsset}
          trashRequest={trashRequest}
        />
      </section>
    );
  }

  return (
    <section className={cn("flex min-w-0 flex-col gap-5", isDrive && !isReference && "min-h-0 flex-1", className)}>
      {!isDrive ? <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {!isPicker ? <Button aria-label="Buat folder baru" onClick={() => actions.setFolderDialogOpen(true)} variant="brandOutline"><FolderPlus />Folder baru</Button> : null}
          <Button aria-label={uploadStatus ? `Mengupload ${mediaLabel}` : `Upload ${mediaLabel}`} className={isPicker ? REFERENCE_CONTROL_CLASS_NAMES.file : undefined} disabled={!snapshot?.isStorageConfigured || Boolean(uploadStatus)} onClick={() => fileInputRef.current?.click()} variant={isPicker ? "reference" : "brand"}>{uploadStatus ? <LoaderCircle className="animate-spin" /> : <Upload />}{uploadStatus ? "Mengupload" : `Upload ${mediaLabel}`}</Button>
          <input accept={acceptedMimeTypes.join(",")} aria-label={`Pilih ${mediaLabel} untuk diunggah`} className="sr-only" multiple onChange={(event) => void actions.handleFiles(Array.from(event.target.files ?? []))} ref={fileInputRef} type="file" />
        </div>
        <label className="relative block w-full xl:max-w-md"><span className="sr-only">Cari {mediaLabel}</span><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-500" /><Input className={isPicker ? `${REFERENCE_CONTROL_CLASS_NAMES.input} pl-11` : "h-11 border-primary-100 bg-white pl-11"} onChange={(event) => actions.setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setAssetPage(1); actions.setQuery(searchInput.trim()); } }} placeholder={`Cari nama ${mediaLabel}...`} value={searchInput} /></label>
      </div> : null}
      {!snapshot?.isStorageConfigured && !isLoading ? <div className="rounded-3xl border border-primary-100 bg-primary-50/70 px-5 py-4 text-sm leading-6 text-secondary-700" role="status">R2 belum dikonfigurasi. Tambahkan kredensial server untuk mengaktifkan upload dan preview media.</div> : null}
      {notice ? <p className="text-sm font-medium text-primary-800" role="status">{notice}</p> : null}
      {error ? <div className="flex flex-col gap-3 rounded-3xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between" role="alert"><span>{error}</span><Button onClick={actions.refreshLibrary} size="sm" variant="ghost"><RefreshCw data-icon="inline-start" />Coba lagi</Button></div> : null}
      {isReference ? <>
        <ReferencePageHeader
          actions={<><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label="Buat folder baru" onClick={() => actions.setFolderDialogOpen(true)} size="icon" variant="reference" />}><FolderPlus /></TooltipTrigger><TooltipContent>Buat folder baru</TooltipContent></Tooltip></TooltipProvider><Button aria-label={uploadStatus ? `Mengupload ${mediaLabel}` : `Upload ${mediaLabel}`} disabled={!snapshot?.isStorageConfigured || Boolean(uploadStatus)} onClick={() => fileInputRef.current?.click()} size="sm" variant="brand">{uploadStatus ? <LoaderCircle className="animate-spin" /> : <Upload />}{uploadStatus ? "Mengupload" : `Upload ${mediaLabel}`}</Button></>}
          description="Kelola aset untuk materi, kuis, dan tryout dalam satu library."
          title="Media"
        />
        <input accept={acceptedMimeTypes.join(",")} aria-label={`Pilih ${mediaLabel} untuk diunggah`} className="sr-only" multiple onChange={(event) => void actions.handleFiles(Array.from(event.target.files ?? []))} ref={fileInputRef} type="file" />
      </> : null}
      <div className={cn("relative min-h-[28rem] overflow-hidden transition-[border-color,background-color] duration-150", !isDrive && "rounded-[2rem] border border-primary-100 bg-white", isDrive && !isReference && "flex min-h-0 flex-1 flex-col", isReference && REFERENCE_SURFACE_CLASS_NAMES.raised, isDragging && "border-2 border-primary-500 bg-primary-50/70")} onDragEnter={(event) => { event.preventDefault(); actions.setIsDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) actions.setIsDragging(false); }} onDragOver={(event) => event.preventDefault()} onDrop={actions.handleDrop}>
        {isDragging ? <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-[1.5rem] border-2 border-dashed border-primary-500 bg-primary-50/90 text-center"><div className="flex flex-col items-center gap-2 text-primary-900"><Upload className="size-8" /><p className="font-semibold">Lepaskan {mediaLabel} untuk upload</p><p className="text-sm text-secondary-600">{acceptedMimeTypes.join(", ")} · maksimal 15 MB</p></div></div> : null}
        <div className={cn("flex flex-col", !isDrive && "gap-4 px-5 py-4 md:px-6", isDrive && !isReference && "gap-4 px-5 py-7 md:px-8 md:py-8", isReference && "gap-6 px-5 pt-0 md:px-8 md:pt-0", !isDrive && "border-b border-primary-100")}>
          {isDrive ? <>
            {isReference ? <div className="-mx-5 flex flex-wrap items-center gap-3 border-b border-primary-100 px-5 py-1 md:-mx-8 md:px-8"><nav aria-label="Breadcrumb folder" className="flex min-w-0 items-center gap-1 overflow-x-auto font-heading text-sm text-secondary-500">{referenceBreadcrumbs.map((breadcrumb, index) => <span className="flex shrink-0 items-center gap-1" key={`${breadcrumb.id ?? "root"}-${breadcrumb.name}`}>{index === referenceBreadcrumbs.length - 1 ? <span aria-current="page" className="min-h-11 rounded-lg px-1.5 py-1 font-semibold text-secondary-900">{breadcrumb.name}</span> : <button className="min-h-11 rounded-lg px-1.5 py-1 hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-200" onClick={() => navigateToFolder(breadcrumb.id)} type="button">{breadcrumb.name}</button>}{index < referenceBreadcrumbs.length - 1 ? <ChevronRight aria-hidden="true" className="size-3.5 text-secondary-300" /> : null}</span>)}</nav></div> : <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl leading-tight font-semibold tracking-[-0.035em] text-secondary-900 md:text-3xl">Media Library</h1>
              </div>
              <TooltipProvider>
                <div className="flex self-end items-center gap-2 xl:self-auto">
                  <Tooltip>
                    <TooltipTrigger render={<Button aria-label="Buat folder baru" onClick={() => actions.setFolderDialogOpen(true)} size="icon" variant="brandOutline" />}><FolderPlus /></TooltipTrigger>
                    <TooltipContent>Buat folder baru</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<Button aria-label={uploadStatus ? `Mengupload ${mediaLabel}` : "Tambah asset baru"} disabled={!snapshot?.isStorageConfigured || Boolean(uploadStatus)} onClick={() => fileInputRef.current?.click()} size="icon" variant="brand" />}>{uploadStatus ? <LoaderCircle className="animate-spin" /> : <Plus />}</TooltipTrigger>
                    <TooltipContent>{uploadStatus ? `Mengupload ${mediaLabel}…` : "Tambah asset baru"}</TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
                <input accept={acceptedMimeTypes.join(",")} aria-label={`Pilih ${mediaLabel} untuk diunggah`} className="sr-only" multiple onChange={(event) => void actions.handleFiles(Array.from(event.target.files ?? []))} ref={fileInputRef} type="file" />
            </div>}
            {isReference ? referenceToolbar : <div className="flex flex-wrap items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary-100 bg-white">
                <Checkbox aria-label="Pilih semua item yang terlihat" checked={allVisibleItemsSelected} className="size-5 rounded-md border-primary-200" onCheckedChange={toggleAllVisibleItems} />
              </div>
              <label className="relative block min-w-0 flex-1 basis-[12rem]">
                <span className="sr-only">Search {mediaLabel}</span>
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-500" />
                <Input className="h-10 border-primary-100 bg-primary-50/45 pl-10 shadow-none" onChange={(event) => actions.setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setAssetPage(1); actions.setQuery(searchInput.trim()); } }} placeholder={`Search ${mediaLabel}...`} value={searchInput} />
              </label>
              <TooltipProvider>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger render={<DropdownMenuTrigger render={<Button aria-label="Urutkan media" size="icon" variant="brandOutline" />} />}><ListFilter /></TooltipTrigger>
                    <TooltipContent>Urutkan media</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuRadioGroup onValueChange={(value) => { setSortMode(value as MediaSortMode); setAssetPage(1); }} value={sortMode}>
                      <DropdownMenuRadioItem closeOnClick value="updated">Latest</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem closeOnClick value="name">Name A–Z</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem closeOnClick value="size">Largest size</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger render={<DropdownMenuTrigger render={<Button aria-label="Filter media" size="icon" variant="brandOutline" />} />}><SlidersHorizontal /></TooltipTrigger>
                    <TooltipContent>Filter media</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuRadioGroup onValueChange={(value) => { setAssetFilter(value as MediaAssetFilter); setAssetPage(1); }} value={assetFilter}>
                      <DropdownMenuRadioItem closeOnClick value="all">All media</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem closeOnClick value="images">Images</DropdownMenuRadioItem>
                      {acceptedMimeTypes.some((mimeType) => isPdfMimeType(mimeType)) ? <DropdownMenuRadioItem closeOnClick value="pdf">PDF</DropdownMenuRadioItem> : null}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipProvider>
              {selectedVisibleItemCount > 0 ? <span className="shrink-0 text-sm font-medium text-primary-800">{selectedVisibleItemCount} dipilih</span> : null}
            </div>}
          </> : null}
          {!isReference ? <div className={cn("flex flex-wrap items-center justify-between gap-3", isDrive && snapshot?.breadcrumbs.length === 1 && "hidden")}><Breadcrumb><BreadcrumbList>{snapshot?.breadcrumbs.map((breadcrumb, index) => <Fragment key={breadcrumb.id ?? "root"}>{index > 0 ? <BreadcrumbSeparator /> : null}<BreadcrumbItem>{index === (snapshot?.breadcrumbs.length ?? 0) - 1 ? <BreadcrumbPage>{breadcrumb.name}</BreadcrumbPage> : <button className="min-h-11 rounded-xl px-2 text-sm font-medium text-secondary-600 transition-colors hover:bg-primary-50 hover:text-primary-900 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20" onClick={() => navigateToFolder(breadcrumb.id)} type="button">{breadcrumb.name}</button>}</BreadcrumbItem></Fragment>)}</BreadcrumbList></Breadcrumb></div> : null}
        </div>
        {uploadStatus ? <div className="bg-primary-50/60 px-5 py-4 md:px-6" role="status"><div className="flex items-center justify-between gap-4 text-sm"><span className="truncate font-medium text-secondary-900">{uploadStatus.current}/{uploadStatus.total} · {uploadStatus.fileName}</span><span className="text-primary-800">{uploadStatus.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-100"><div className="h-full rounded-full bg-primary-700 transition-[width] duration-150" style={{ width: `${uploadStatus.progress}%` }} /></div></div> : null}
        <MediaLibraryItemsView
          actions={actions}
          activeAssetPage={activeAssetPage}
          allVisibleAssets={allVisibleAssets}
          assetFilter={assetFilter}
          assetPageCount={assetPageCount}
          driveAssetGridStyle={driveAssetGridStyle}
          driveFolderGridStyle={driveFolderGridStyle}
          fileInputRef={fileInputRef}
          flags={{
            isDrive,
            isLoading,
            isMinimalGallery,
            isPicker,
            isReference,
          }}
          itemRenderers={{
            driveAsset: renderDriveAsset,
            driveFolder: renderDriveFolder,
            itemMenu: renderItemMenu,
          }}
          mediaLabel={mediaLabel}
          query={query}
          selectedAssetId={selectedAssetId}
          setAssetPage={setAssetPage}
          snapshot={snapshot}
          viewMode={viewMode}
          visibleAssets={visibleAssets}
          visibleFolders={visibleFolders}
        />
      </div>
      <MediaLibraryModals
        actions={actions}
        editingItem={editingItem}
        editingName={editingName}
        folderDialogOpen={folderDialogOpen}
        isMutationPending={isMutationPending}
        isPicker={isPicker}
        moveRequest={moveRequest}
        moveTargetId={moveTargetId}
        moveTargetOptions={moveTargetOptions}
        mutationPending={mutationPending}
        newFolderName={newFolderName}
        previewAsset={previewAsset}
        trashRequest={trashRequest}
      />
    </section>
  );
}
