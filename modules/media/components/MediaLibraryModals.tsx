"use client";

import NextImage from "next/image";
import { FileText, ImageOff, Trash2 } from "@/lib/icons";
import {
  ReferenceSelect,
  type ReferenceSelectOption,
} from "@/components/dashboard/reference-dashboard-controls";
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
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { formatMediaBytes, isPdfMimeType } from "@/lib/media/domain";
import type { MediaAssetDto } from "@/lib/media/types";
import type {
  EditableItem,
  MediaLibraryScreenActions,
  MediaMutation,
  MoveRequest,
  TrashRequest,
} from "../types";

type MediaLibraryModalsProps = {
  actions: MediaLibraryScreenActions;
  editingItem: EditableItem | null;
  editingName: string;
  folderDialogOpen: boolean;
  isMutationPending: (mutation: MediaMutation) => boolean;
  isPicker: boolean;
  moveRequest: MoveRequest | null;
  moveTargetId: string;
  moveTargetOptions: readonly ReferenceSelectOption[];
  mutationsDisabled?: boolean;
  mutationPending: MediaMutation | null;
  newFolderName: string;
  previewAsset: MediaAssetDto | null;
  trashRequest: TrashRequest | null;
};

export function MediaLibraryModals(props: MediaLibraryModalsProps) {
  return (
    <>
      <CreateFolderDialog {...props} />
      <RenameMediaDialog {...props} />
      <MoveMediaDialog {...props} />
      <TrashMediaDialog {...props} />
      <MediaPreviewDialog {...props} />
    </>
  );
}

function CreateFolderDialog({ actions, folderDialogOpen, isMutationPending, mutationPending, newFolderName }: MediaLibraryModalsProps) {
  return (
    <Dialog onOpenChange={(open) => { if (open || !mutationPending) actions.setFolderDialogOpen(open); }} open={folderDialogOpen}>
        <DialogContent pending={isMutationPending("create-folder")} showCloseButton={!isMutationPending("create-folder")} variant="default">
          <DialogHeader><DialogTitle>Folder baru</DialogTitle></DialogHeader>
          <Field>
            <FieldLabel htmlFor="new-media-folder">Nama folder</FieldLabel>
            <FieldInput autoFocus disabled={isMutationPending("create-folder")} id="new-media-folder" onChange={(event) => actions.setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void actions.handleCreateFolder(); }} value={newFolderName} />
          </Field>
          <DialogFooter>
            <Button disabled={isMutationPending("create-folder")} onClick={() => actions.setFolderDialogOpen(false)} variant="outline">Batal</Button>
            <Button disabled={!newFolderName.trim() || isMutationPending("create-folder")} onClick={() => void actions.handleCreateFolder()} variant="default">{isMutationPending("create-folder") ? "Menyimpan…" : "Buat folder"}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

function RenameMediaDialog({ actions, editingItem, editingName, isMutationPending, mutationPending, mutationsDisabled }: MediaLibraryModalsProps) {
  return (
    <Dialog onOpenChange={(open) => { if (open || !mutationPending) { if (!open) actions.setEditingItem(null); } }} open={Boolean(editingItem)}>
        <DialogContent pending={isMutationPending("rename")} showCloseButton={!isMutationPending("rename")} variant="default">
          <DialogHeader><DialogTitle>Ganti nama</DialogTitle><DialogDescription>Nama baru tidak mengubah lokasi penyimpanan file.</DialogDescription></DialogHeader>
          <Field>
            <FieldLabel htmlFor="rename-media-item">Nama</FieldLabel>
            <FieldInput autoFocus disabled={mutationsDisabled || isMutationPending("rename")} id="rename-media-item" onChange={(event) => actions.setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void actions.handleRename(); }} value={editingName} />
          </Field>
          <DialogFooter>
            <Button disabled={isMutationPending("rename")} onClick={() => actions.setEditingItem(null)} variant="outline">Batal</Button>
            <Button disabled={mutationsDisabled || !editingName.trim() || isMutationPending("rename")} onClick={() => void actions.handleRename()} variant="default">{isMutationPending("rename") ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

function MoveMediaDialog({ actions, isMutationPending, moveRequest, moveTargetId, moveTargetOptions, mutationPending, mutationsDisabled }: MediaLibraryModalsProps) {
  return (
    <Dialog onOpenChange={(open) => { if (open || !mutationPending) { if (!open) actions.setMoveRequest(null); } }} open={Boolean(moveRequest)}>
        <DialogContent pending={isMutationPending("move")} showCloseButton={!isMutationPending("move")} variant="default">
          <DialogHeader><DialogTitle>Pindahkan item</DialogTitle><DialogDescription>Pilih folder tujuan untuk “{moveRequest?.name}”.</DialogDescription></DialogHeader>
          <Field>
            <FieldLabel htmlFor="move-media-item">Folder tujuan</FieldLabel>
            <ReferenceSelect
              aria-label="Folder tujuan"
              disabled={mutationsDisabled || isMutationPending("move")}
              id="move-media-item"
              onValueChange={actions.setMoveTargetId}
              options={[
                { label: "Folder utama", value: "" },
                ...moveTargetOptions,
              ]}
              placeholder="Folder utama"
              value={moveTargetId}
            />
          </Field>
          <DialogFooter>
            <Button disabled={isMutationPending("move")} onClick={() => actions.setMoveRequest(null)} variant="outline">Batal</Button>
            <Button disabled={mutationsDisabled || isMutationPending("move")} onClick={() => void actions.handleMove()} variant="default">{isMutationPending("move") ? "Memindahkan…" : "Pindahkan"}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}

function TrashMediaDialog({ actions, isMutationPending, mutationPending, mutationsDisabled, trashRequest }: MediaLibraryModalsProps) {
  return (
    <AlertDialog onOpenChange={(open) => { if ((open || !mutationPending) && !open) actions.setTrashRequest(null); }} open={Boolean(trashRequest)}>
        <AlertDialogContent pending={isMutationPending("trash")} size="sm" variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Masukkan ke Sampah?</AlertDialogTitle>
          <AlertDialogDescription>“{trashRequest?.name}” tidak akan muncul di pustaka media atau pilihan baru. Bank Soal yang sudah menggunakannya tetap dapat mengakses media tersebut.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutationPending("trash")}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={mutationsDisabled || isMutationPending("trash")} onClick={() => void actions.handleTrash()} variant="destructive">{isMutationPending("trash") ? "Memproses…" : "Masukkan Sampah"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
  );
}

function MediaPreviewDialog({ actions, isPicker, previewAsset }: Pick<MediaLibraryModalsProps, "actions" | "isPicker" | "previewAsset">) {
  return (
    <Dialog onOpenChange={(open) => { if (!open) actions.setPreviewAsset(null); }} open={Boolean(previewAsset)}>
        <DialogContent className="sm:max-w-4xl" variant="info">
          <DialogHeader>
            <DialogTitle>{previewAsset?.name}</DialogTitle>
            <DialogDescription>{previewAsset ? `${formatMediaBytes(previewAsset.sizeBytes)} · ${previewAsset.mimeType} · diunggah oleh ${previewAsset.uploadedBy}` : "Pratinjau media"}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-3xl bg-primary-50/70">
            {previewAsset?.previewUrl && isPdfMimeType(previewAsset.mimeType) ? (
              <div className="flex w-full flex-col gap-4 p-4">
                <iframe className="h-[60vh] min-h-96 w-full rounded-2xl border border-primary-100 bg-white" sandbox="" src={previewAsset.previewUrl} title={`Pratinjau ${previewAsset.name}`} />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button nativeButton={false} render={<a aria-label="Buka PDF" href={previewAsset.previewUrl} rel="noreferrer" target="_blank" />} size="default" variant="outline"><FileText className="size-4" />Buka PDF</Button>
                  <Button nativeButton={false} render={<a aria-label="Unduh PDF" download={previewAsset.name} href={previewAsset.previewUrl} />} size="default" variant="default">Unduh PDF</Button>
                </div>
              </div>
            ) : previewAsset?.previewUrl ? (
              <div className="relative min-h-64 w-full">
                <NextImage alt={previewAsset.name} className="object-contain" fill sizes="(min-width: 1024px) 60vw, 90vw" src={previewAsset.previewUrl} unoptimized />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-secondary-500"><ImageOff className="size-8" /><span>Pratinjau belum tersedia</span></div>
            )}
          </div>
          {isPicker && previewAsset ? (
            <DialogFooter>
              <Button onClick={() => actions.onSelect?.(previewAsset)} variant="default">Pilih {isPdfMimeType(previewAsset.mimeType) ? "PDF" : "gambar"}</Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
    </Dialog>
  );
}
