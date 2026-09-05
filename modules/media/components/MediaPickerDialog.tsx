"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isPdfMimeType, type SupportedMediaMimeType } from "@/lib/media/domain";
import type { MediaAssetDto } from "@/lib/media/types";
import { MediaLibrary } from "../media-library";

export function MediaPickerDialog({
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
        <DialogHeader><DialogTitle>{pickerTitle}</DialogTitle><DialogDescription>Pilih dari library Kapten atau upload {isPdfPicker ? "PDF baru" : "gambar baru"}. Jika library kosong atau storage belum tersedia, alasan dan langkah pemulihan akan ditampilkan.</DialogDescription></DialogHeader>
        <MediaLibrary allowedMimeTypes={allowedMimeTypes} onSelect={handleSelect} scope="kapten" selectedAssetId={selectedAssetId} variant="picker" />
      </DialogContent>
    </Dialog>
  );
}
