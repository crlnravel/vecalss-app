"use client";

import { useId, useRef, useState } from "react";

import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showToast } from "@/components/ui/toast";
import {
  isImageMimeType,
  validateMediaUpload,
} from "@/lib/media/domain";
import type { MediaUploadTicket } from "@/lib/media/types";
import {
  postMediaAction,
  putFile,
  readImageDimensions,
} from "@/modules/media/helpers";

function TryoutBannerUploadDialog({
  onOpenChange,
  onSelect,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onSelect: (assetId: string) => void;
  open: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadInFlightRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState("Menyiapkan unggahan");
  const [uploadMeta, setUploadMeta] = useState("File sedang disiapkan");

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && uploadInFlightRef.current) return;
    onOpenChange(nextOpen);
  }

  async function uploadBanner(nextFile: File) {
    if (uploadInFlightRef.current) return;

    if (!isImageMimeType(nextFile.type)) {
      showToast("Pilih gambar berformat JPG, PNG, WebP, atau GIF.", {
        variant: "error",
      });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const validation = validateMediaUpload({
      fileName: nextFile.name,
      mimeType: nextFile.type,
      sizeBytes: nextFile.size,
    });
    if (!validation.isValid) {
      showToast(validation.error, { variant: "error" });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    uploadInFlightRef.current = true;
    setFile(nextFile);
    setUploading(true);
    setProgress(null);
    setUploadLabel("Menyiapkan unggahan");
    setUploadMeta("File sedang disiapkan");

    try {
      const ticket = await postMediaAction<MediaUploadTicket>("kapten", {
        action: "request-upload",
        fileName: nextFile.name,
        folderId: null,
        mimeType: nextFile.type,
        sizeBytes: nextFile.size,
      });
      const dimensions = await readImageDimensions(nextFile);
      setProgress(0);
      setUploadLabel("Mengunggah banner");
      setUploadMeta("Mengunggah gambar");
      await putFile(nextFile, ticket.uploadUrl, setProgress);
      await postMediaAction("kapten", {
        action: "finalize-upload",
        assetId: ticket.assetId,
        height: dimensions.height,
        width: dimensions.width,
      });

      uploadInFlightRef.current = false;
      setFile(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      onSelect(ticket.assetId);
      showToast("Banner Tryout berhasil diunggah.", { variant: "success" });
      onOpenChange(false);
    } catch {
      setFile(null);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      showToast(
        "Banner belum dapat diunggah. Periksa format dan ukuran file, lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="w-[calc(100vw-2rem)] gap-7 p-6 sm:max-w-4xl sm:gap-8 sm:p-9"
        pending={uploading}
      >
        <DialogHeader className="pr-10">
          <DialogTitle>Unggah banner Tryout</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <label
            className={REFERENCE_FIELD_LABEL_CLASS_NAME}
            htmlFor={inputId}
          >
            File banner
          </label>
          <FileUploadSlot
            accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            dropZoneClassName="min-h-72 sm:min-h-[21rem]"
            file={file}
            id={inputId}
            inputRef={inputRef}
            maxSizeLabel="JPG, PNG, WebP, atau GIF · maks. 15 MB"
            onChange={(nextFile) => {
              if (!nextFile) {
                setFile(null);
                return;
              }
              void uploadBanner(nextFile);
            }}
            progress={progress}
            uploadLabel={uploadLabel}
            uploadMeta={uploadMeta}
            uploading={uploading}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { TryoutBannerUploadDialog };
