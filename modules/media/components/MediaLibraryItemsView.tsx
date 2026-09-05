"use client";

import type { CSSProperties, Dispatch, RefObject, SetStateAction } from "react";
import NextImage from "next/image";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  Folder,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMediaBytes, isPdfMimeType } from "@/lib/media/domain";
import type { MediaAssetDto, MediaLibrarySnapshot } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { getItemDate } from "../helpers";
import { MediaLibraryRecoveryState } from "./media-library-recovery-state";
import type {
  MediaAssetFilter,
  MediaLibraryItemRenderers,
  MediaLibraryItemViewFlags,
  MediaLibraryScreenActions,
} from "../types";

export function MediaLibraryItemsView({
  actions,
  activeAssetPage,
  allVisibleAssets,
  assetFilter,
  assetPageCount,
  clearSelection,
  driveAssetGridStyle,
  driveFolderGridStyle,
  error,
  fileInputRef,
  flags,
  itemRenderers,
  mediaLabel,
  query,
  selectedAssetId,
  setAssetFilter,
  setAssetPage,
  snapshot,
  viewMode,
  visibleAssets,
  visibleFolders,
}: {
  actions: MediaLibraryScreenActions;
  activeAssetPage: number;
  allVisibleAssets: MediaAssetDto[];
  assetFilter: MediaAssetFilter;
  assetPageCount: number;
  clearSelection: () => void;
  driveAssetGridStyle?: CSSProperties;
  driveFolderGridStyle?: CSSProperties;
  error: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  flags: MediaLibraryItemViewFlags;
  itemRenderers: MediaLibraryItemRenderers;
  mediaLabel: string;
  query: string;
  selectedAssetId?: string | null;
  setAssetFilter: Dispatch<SetStateAction<MediaAssetFilter>>;
  setAssetPage: Dispatch<SetStateAction<number>>;
  snapshot: MediaLibrarySnapshot | null;
  viewMode: "grid" | "list";
  visibleAssets: MediaAssetDto[];
  visibleFolders: MediaLibrarySnapshot["folders"];
}) {
  const { isDrive, isLoading, isMinimalGallery, isPicker, isReference } = flags;
  const { driveAsset: renderDriveAsset, driveFolder: renderDriveFolder, itemMenu: renderItemMenu } = itemRenderers;

  const clearFilters = () => {
    actions.setSearchInput("");
    actions.setQuery("");
    setAssetFilter("all");
    setAssetPage(1);
    clearSelection();
  };
  const recoveryKind = error && !snapshot
    ? "error"
    : snapshot && !snapshot.isStorageConfigured
    ? "storage"
    : query || assetFilter !== "all"
      ? "filtered"
      : "empty";
  const recoveryState = (
    <MediaLibraryRecoveryState
      className={isReference ? "mx-5 md:mx-8" : undefined}
      errorMessage={error}
      isPicker={isPicker}
      kind={recoveryKind}
      mediaLabel={mediaLabel}
      onClear={clearFilters}
      onRetry={actions.refreshLibrary}
      onUpload={snapshot?.isStorageConfigured ? () => fileInputRef.current?.click() : undefined}
    />
  );

  if (isLoading) {
    return (
      <div className={cn("flex flex-col gap-3 p-5 md:p-6", isDrive && viewMode === "grid" && "grid", isMinimalGallery && "grid grid-cols-2 p-0")} style={isDrive && viewMode === "grid" && !isMinimalGallery ? driveAssetGridStyle : undefined}>
        {Array.from({ length: 6 }, (_, index) => <Skeleton className={cn("h-16 w-full rounded-2xl", isDrive && viewMode === "grid" && "h-44")} key={index} />)}
      </div>
    );
  }

  if (error && !snapshot) {
    return recoveryState;
  }

  if (isMinimalGallery) {
    return snapshot && visibleAssets.length > 0 ? (
      <div className="grid grid-cols-2 gap-3">
        {visibleAssets.map(renderDriveAsset)}
      </div>
    ) : (
      recoveryState
    );
  }

  if (snapshot && (visibleFolders.length > 0 || visibleAssets.length > 0)) {
    return (
      <div className={cn("flex flex-col", isDrive && "gap-8 p-5 md:p-8")}>
        {visibleFolders.length > 0 ? (
          <section className={cn("flex flex-col", isDrive ? "gap-3" : "gap-0")}>
            <div className={cn("text-sm font-semibold text-secondary-900", isDrive ? "px-0 pt-0 pb-1" : "px-5 pt-5 pb-2 md:px-6")}>{isDrive ? (isReference ? "Folder" : "Folders") : "Folder"}</div>
            <div className={cn(isDrive ? "grid gap-3" : "")} style={isDrive ? driveFolderGridStyle : undefined}>
              {visibleFolders.map((folderItem) => isDrive ? renderDriveFolder(folderItem) : (
                <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-primary-100 px-4 transition-colors hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.4fr)_0.7fr_44px] md:px-6" key={folderItem.id}>
                  <button className="flex min-h-16 min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20" onClick={() => actions.setFolderId(folderItem.id)} type="button">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800"><Folder className="size-5" /></span>
                    <span className="min-w-0"><span className="block truncate font-semibold text-secondary-900">{folderItem.name}</span></span>
                  </button>
                  <span className="hidden text-sm text-secondary-500 md:block">Diperbarui {getItemDate(folderItem.updatedAt)}</span>
                  {isPicker ? <ChevronRight className="size-4 text-secondary-400" /> : renderItemMenu({ id: folderItem.id, kind: "folder", name: folderItem.name, parentId: folderItem.parentId })}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {visibleFolders.length > 0 && visibleAssets.length > 0 && !isDrive ? <Separator /> : null}
        {visibleAssets.length > 0 ? (
          <section className={cn("flex flex-col", isDrive ? "gap-3" : "gap-0")}>
            {isDrive ? (
              <div className="flex items-center justify-between gap-3 pt-1">
                <h2 className="text-sm font-semibold text-secondary-900">{isReference ? `Aset (${allVisibleAssets.length})` : "All assets"}</h2>
                {!isReference ? <span className="text-xs text-secondary-500">{allVisibleAssets.length}</span> : null}
              </div>
            ) : null}
            {!(isDrive && viewMode === "grid") ? (
              <div className={cn("hidden grid-cols-[minmax(0,1.4fr)_0.55fr_0.65fr_0.7fr_44px] gap-3 px-6 py-3 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase md:grid", isDrive && viewMode === "list" && "px-4")}>
                <span>Nama</span><span>Ukuran</span><span>Dimensi</span><span>Diperbarui</span><span />
              </div>
            ) : null}
            {isDrive && viewMode === "grid" ? (
              <div className="grid gap-3" style={driveAssetGridStyle}>{visibleAssets.map(renderDriveAsset)}</div>
            ) : (
              <div>
                {visibleAssets.map((asset) => (
                  <div className={cn("grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 transition-colors hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.4fr)_0.55fr_0.65fr_0.7fr_44px] md:px-6", !isDrive && "border-t border-primary-100", isDrive && viewMode === "list" && "min-h-16 rounded-2xl border border-primary-100 px-3 hover:border-primary-200 md:px-4", selectedAssetId === asset.id && "bg-primary-50")} key={asset.id}>
                    <button className={cn("flex min-h-[4.5rem] min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/20", isDrive && viewMode === "list" && "min-h-16")} onClick={() => void actions.handlePreview(asset)} type="button">
                      <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary-50 text-primary-800">
                        {isPdfMimeType(asset.mimeType) ? <FileText className="size-7" /> : asset.thumbnailUrl ?? asset.previewUrl ? <NextImage alt="" className="size-full object-cover" fill loading="lazy" sizes="3rem" src={asset.thumbnailUrl ?? asset.previewUrl ?? ""} unoptimized /> : <FileImage className="size-5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-secondary-900">{asset.name}</span>
                        <span className="mt-1 block text-xs text-secondary-500 md:hidden">{formatMediaBytes(asset.sizeBytes)} · {getItemDate(asset.updatedAt)}</span>
                      </span>
                    </button>
                    <span className="hidden text-sm text-secondary-500 md:block">{formatMediaBytes(asset.sizeBytes)}</span>
                    <span className="hidden text-sm text-secondary-500 md:block">{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</span>
                    <div className="hidden items-center gap-2 text-sm text-secondary-500 md:flex">
                      <span>{getItemDate(asset.updatedAt)}</span>
                      {isPicker ? <Button onClick={() => actions.onSelect?.(asset)} size="sm" variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}>{selectedAssetId === asset.id ? "Dipilih" : "Pilih"}<ChevronRight data-icon="inline-end" /></Button> : null}
                    </div>
                    {isPicker ? (
                      <Button aria-label={`Pilih ${asset.name}`} className="md:hidden" onClick={() => actions.onSelect?.(asset)} size="icon-sm" variant={selectedAssetId === asset.id ? "brand" : "brandOutline"}><ChevronRight /></Button>
                    ) : (
                      <div>{renderItemMenu({ id: asset.id, kind: "asset", name: asset.name, parentId: asset.parentId })}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isDrive ? (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 text-xs text-secondary-500">
                <div className="flex items-center gap-2">
                  <Button aria-label={isReference ? "Jumlah entri per halaman" : "Entries per page"} className="h-8 gap-1.5 rounded-md px-2.5" size="sm" variant={isReference ? "reference" : "brandOutline"}>10<ChevronDown className="size-3.5" /></Button>
                  <span>{isReference ? "Entri per halaman" : "Entries per page"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button aria-label={isReference ? "Halaman sebelumnya" : "Previous page"} disabled={activeAssetPage <= 1} onClick={() => setAssetPage((page: number) => Math.max(1, page - 1))} size="icon-sm" variant="ghost"><ChevronLeft /></Button>
                  <Button aria-current="page" className="size-8 rounded-md" size="icon-sm" variant={isReference ? "reference" : "brandOutline"}>{activeAssetPage}</Button>
                  <Button aria-label={isReference ? "Halaman berikutnya" : "Next page"} disabled={activeAssetPage >= assetPageCount} onClick={() => setAssetPage((page: number) => Math.min(assetPageCount, page + 1))} size="icon-sm" variant="ghost"><ChevronRight /></Button>
                </div>
              </div>
            ) : null}
          </section>
        ) : recoveryState}
      </div>
    );
  }

  return recoveryState;
}
